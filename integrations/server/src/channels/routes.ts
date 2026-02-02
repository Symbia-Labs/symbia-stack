/**
 * Channel Routes
 *
 * REST API endpoints for managing channel connections and handling webhooks.
 * Integrates with the SDN for event emission and the Identity service for credentials.
 */

import type { Express, Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { emitEvent } from "@symbia/relay";
import {
  channelConnections,
  channelTypeSchema,
  type ChannelType,
  type ChannelConnectionStatus,
  type ChannelInboundMessage,
  type ChannelStatusEvent,
} from "@shared/schema.js";
import { db } from "../db.js";
import { getCredential, introspectToken } from "../credential-client.js";
import {
  channelProviders,
  initializeChannelProviders,
  type ChannelConnectionContext,
} from "./providers/index.js";
import { handleInboundMessage } from "./bridge.js";

/**
 * Extract auth token from request
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  const cookies = req.headers.cookie;
  if (cookies) {
    const tokenMatch = cookies.match(/token=([^;]+)/);
    if (tokenMatch) {
      return tokenMatch[1];
    }
  }

  return null;
}

/**
 * Helper to safely extract route params (Express 5.x returns string | string[])
 */
function getParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] : (value ?? '');
}

/**
 * Auth middleware for channel routes
 */
async function authMiddleware(
  req: Request,
  res: Response,
  next: () => void
): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const introspection = await introspectToken(token);

  if (!introspection?.active) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Determine orgId
  const headerOrgId = req.headers["x-org-id"] as string | undefined;
  let orgId: string | undefined = headerOrgId;

  if (!orgId) {
    if (introspection.type === "agent") {
      orgId = introspection.orgId;
    } else if (introspection.organizations && introspection.organizations.length > 0) {
      orgId = introspection.organizations[0].id;
    }
  }

  if (!orgId) {
    const env = process.env.NODE_ENV || "development";
    if (env === "production") {
      res.status(400).json({ error: "Organization context required" });
      return;
    }
    orgId = "dev-default-org";
  }

  (req as any).user = {
    id: introspection.sub,
    type: introspection.type,
    orgId,
  };
  (req as any).token = token;

  next();
}

/**
 * Update connection status in database and emit SDN event
 */
async function updateConnectionStatus(
  connectionId: string,
  newStatus: ChannelConnectionStatus,
  updates: Partial<{
    channelAccountId: string;
    channelAccountName: string;
    sessionData: Record<string, unknown>;
    qrCode: string;
    qrExpiresAt: Date;
    webhookUrl: string;
    webhookSecret: string;
    webhookVerified: boolean;
    lastPingAt: Date;
    lastMessageAt: Date;
    lastError: string;
    errorCount: number;
    consecutiveErrors: number;
    connectedAt: Date;
    disconnectedAt: Date;
    metadata: Record<string, unknown>;
  }> = {}
): Promise<void> {
  // Get current connection for status comparison
  const [current] = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, connectionId))
    .limit(1);

  if (!current) {
    console.error(`[channels] Connection not found: ${connectionId}`);
    return;
  }

  const previousStatus = current.status as ChannelConnectionStatus;

  // Update database
  await db
    .update(channelConnections)
    .set({
      status: newStatus,
      updatedAt: new Date(),
      ...updates,
    })
    .where(eq(channelConnections.id, connectionId));

  // Emit status change event if status changed
  if (previousStatus !== newStatus) {
    const statusEvent: ChannelStatusEvent = {
      connectionId,
      channelType: current.channelType as ChannelType,
      previousStatus,
      newStatus,
      timestamp: new Date().toISOString(),
    };

    await emitEvent("channel.status.changed", statusEvent, `run_${randomUUID().slice(0, 8)}`);
    console.log(`[channels] Status changed: ${connectionId} ${previousStatus} -> ${newStatus}`);
  }
}

/**
 * Create channel routes
 */
export function createChannelRoutes(): Router {
  const router = createRouter();

  // Initialize providers
  initializeChannelProviders();

  // ==========================================================================
  // Channel Info Endpoints
  // ==========================================================================

  /**
   * GET /channels
   * List available channel types and their capabilities
   */
  router.get("/", async (_req: Request, res: Response) => {
    const providers = channelProviders.getAll();

    res.json({
      channels: providers.map((p) => ({
        type: p.type,
        name: p.name,
        connectionMode: p.connectionMode,
        capabilities: p.capabilities,
        formatting: p.formatting,
      })),
    });
  });

  /**
   * GET /channels/:channelType
   * Get details for a specific channel type
   */
  router.get("/:channelType", async (req: Request, res: Response) => {
    const channelType = getParam(req.params, 'channelType');

    const parseResult = channelTypeSchema.safeParse(channelType);
    if (!parseResult.success) {
      res.status(400).json({ error: `Invalid channel type: ${channelType}` });
      return;
    }

    const provider = channelProviders.get(parseResult.data);
    if (!provider) {
      res.status(404).json({ error: `Channel provider not available: ${channelType}` });
      return;
    }

    res.json({
      type: provider.type,
      name: provider.name,
      connectionMode: provider.connectionMode,
      capabilities: provider.capabilities,
      formatting: provider.formatting,
      defaultConfig: provider.getDefaultConfig(),
    });
  });

  // ==========================================================================
  // Connection Management Endpoints
  // ==========================================================================

  /**
   * GET /channels/:channelType/connections
   * List connections for the authenticated user/org
   */
  router.get("/:channelType/connections", authMiddleware, async (req: Request, res: Response) => {
    const channelType = getParam(req.params, 'channelType');
    const user = (req as any).user;

    const parseResult = channelTypeSchema.safeParse(channelType);
    if (!parseResult.success) {
      res.status(400).json({ error: `Invalid channel type: ${channelType}` });
      return;
    }

    try {
      const connections = await db
        .select({
          id: channelConnections.id,
          channelType: channelConnections.channelType,
          channelAccountId: channelConnections.channelAccountId,
          channelAccountName: channelConnections.channelAccountName,
          status: channelConnections.status,
          lastMessageAt: channelConnections.lastMessageAt,
          messagesReceived: channelConnections.messagesReceived,
          messagesSent: channelConnections.messagesSent,
          createdAt: channelConnections.createdAt,
          connectedAt: channelConnections.connectedAt,
        })
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.channelType, parseResult.data),
            eq(channelConnections.orgId, user.orgId)
          )
        );

      res.json({ connections });
    } catch (error) {
      console.error("[channels] Error listing connections:", error);
      res.status(500).json({ error: "Failed to list connections" });
    }
  });

  /**
   * POST /channels/:channelType/connect
   * Initiate a new channel connection
   */
  router.post("/:channelType/connect", authMiddleware, async (req: Request, res: Response) => {
    const channelType = getParam(req.params, 'channelType');
    const user = (req as any).user;
    const token = (req as any).token;
    const config = req.body.config || {};

    const parseResult = channelTypeSchema.safeParse(channelType);
    if (!parseResult.success) {
      res.status(400).json({ error: `Invalid channel type: ${channelType}` });
      return;
    }

    const provider = channelProviders.get(parseResult.data);
    if (!provider) {
      res.status(404).json({ error: `Channel provider not available: ${channelType}` });
      return;
    }

    try {
      // Get credential from Identity service
      const credential = await getCredential(user.id, user.orgId, channelType, token);
      if (!credential?.apiKey) {
        res.status(400).json({
          error: `No ${channelType} credentials configured. Add your credentials in Settings.`,
        });
        return;
      }

      // Create connection record
      const connectionId = randomUUID();
      const integrationId = `channel-${channelType}-${user.orgId}`;

      await db.insert(channelConnections).values({
        id: connectionId,
        integrationId,
        userId: user.id,
        orgId: user.orgId,
        channelType: parseResult.data,
        credentialId: credential.credentialId,
        status: "pending",
      });

      // Initialize connection with provider
      const ctx: ChannelConnectionContext = {
        connectionId,
        userId: user.id,
        orgId: user.orgId,
        credentialId: credential.credentialId,
        authToken: token,
      };

      const result = await provider.initConnection(ctx, credential.apiKey, config);

      if (result.success) {
        await updateConnectionStatus(connectionId, result.status, {
          channelAccountId: result.metadata?.botId?.toString() ||
            result.metadata?.accountId?.toString(),
          channelAccountName: result.metadata?.botUsername?.toString() ||
            result.metadata?.accountName?.toString(),
          webhookUrl: result.webhookUrl,
          webhookSecret: result.webhookSecret,
          webhookVerified: !!result.webhookUrl,
          qrCode: result.qrCode,
          qrExpiresAt: result.qrExpiresAt,
          connectedAt: result.status === "connected" ? new Date() : undefined,
          sessionData: {
            botToken: credential.apiKey, // Store for later use
            ...result.metadata,
          },
          metadata: result.metadata,
        });

        res.json({
          success: true,
          connectionId,
          status: result.status,
          qrCode: result.qrCode,
          qrExpiresAt: result.qrExpiresAt?.toISOString(),
          authUrl: result.authUrl,
          webhookUrl: result.webhookUrl,
          channelAccountId: result.metadata?.botId || result.metadata?.accountId,
          channelAccountName: result.metadata?.botUsername || result.metadata?.accountName,
        });
      } else {
        // Update status to error
        await updateConnectionStatus(connectionId, "error", {
          lastError: result.error,
          errorCount: 1,
          consecutiveErrors: 1,
        });

        res.status(400).json({
          success: false,
          connectionId,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("[channels] Connection error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Connection failed",
      });
    }
  });

  /**
   * GET /channels/:channelType/connections/:connectionId/status
   * Get connection status
   */
  router.get(
    "/:channelType/connections/:connectionId/status",
    authMiddleware,
    async (req: Request, res: Response) => {
      const channelType = getParam(req.params, 'channelType');
    const connectionId = getParam(req.params, 'connectionId');
      const user = (req as any).user;

      try {
        const [connection] = await db
          .select()
          .from(channelConnections)
          .where(
            and(
              eq(channelConnections.id, connectionId),
              eq(channelConnections.orgId, user.orgId)
            )
          )
          .limit(1);

        if (!connection) {
          res.status(404).json({ error: "Connection not found" });
          return;
        }

        const provider = channelProviders.get(connection.channelType as ChannelType);
        if (!provider) {
          res.status(500).json({ error: "Channel provider not available" });
          return;
        }

        // Get live status from provider
        const ctx: ChannelConnectionContext = {
          connectionId,
          userId: user.id,
          orgId: user.orgId,
        };

        const status = await provider.getStatus(
          ctx,
          connection.sessionData as Record<string, unknown>
        );

        // Update database with latest status
        await updateConnectionStatus(connectionId, status.status, {
          lastPingAt: status.lastPingAt,
          lastError: status.error,
          metadata: status.metadata,
        });

        res.json({
          connectionId,
          channelType: connection.channelType,
          status: status.status,
          channelAccountId: status.channelAccountId || connection.channelAccountId,
          channelAccountName: status.channelAccountName || connection.channelAccountName,
          lastPingAt: status.lastPingAt?.toISOString(),
          lastMessageAt: connection.lastMessageAt?.toISOString(),
          messagesReceived: connection.messagesReceived,
          messagesSent: connection.messagesSent,
          error: status.error,
        });
      } catch (error) {
        console.error("[channels] Status check error:", error);
        res.status(500).json({ error: "Failed to check status" });
      }
    }
  );

  /**
   * POST /channels/:channelType/connections/:connectionId/disconnect
   * Disconnect a channel
   */
  router.post(
    "/:channelType/connections/:connectionId/disconnect",
    authMiddleware,
    async (req: Request, res: Response) => {
      const channelType = getParam(req.params, 'channelType');
    const connectionId = getParam(req.params, 'connectionId');
      const user = (req as any).user;

      try {
        const [connection] = await db
          .select()
          .from(channelConnections)
          .where(
            and(
              eq(channelConnections.id, connectionId),
              eq(channelConnections.orgId, user.orgId)
            )
          )
          .limit(1);

        if (!connection) {
          res.status(404).json({ error: "Connection not found" });
          return;
        }

        const provider = channelProviders.get(connection.channelType as ChannelType);
        if (!provider) {
          res.status(500).json({ error: "Channel provider not available" });
          return;
        }

        const ctx: ChannelConnectionContext = {
          connectionId,
          userId: user.id,
          orgId: user.orgId,
        };

        const result = await provider.disconnect(
          ctx,
          connection.sessionData as Record<string, unknown>
        );

        await updateConnectionStatus(connectionId, "disconnected", {
          disconnectedAt: new Date(),
        });

        res.json({
          success: result.success,
          connectionId,
          status: "disconnected",
          error: result.error,
        });
      } catch (error) {
        console.error("[channels] Disconnect error:", error);
        res.status(500).json({ error: "Failed to disconnect" });
      }
    }
  );

  /**
   * DELETE /channels/:channelType/connections/:connectionId
   * Delete a connection record
   */
  router.delete(
    "/:channelType/connections/:connectionId",
    authMiddleware,
    async (req: Request, res: Response) => {
      const connectionId = getParam(req.params, 'connectionId');
      const user = (req as any).user;

      try {
        // First disconnect if connected
        const [connection] = await db
          .select()
          .from(channelConnections)
          .where(
            and(
              eq(channelConnections.id, connectionId),
              eq(channelConnections.orgId, user.orgId)
            )
          )
          .limit(1);

        if (!connection) {
          res.status(404).json({ error: "Connection not found" });
          return;
        }

        if (connection.status === "connected") {
          const provider = channelProviders.get(connection.channelType as ChannelType);
          if (provider) {
            await provider.disconnect(
              { connectionId, userId: user.id, orgId: user.orgId },
              connection.sessionData as Record<string, unknown>
            );
          }
        }

        // Delete the record
        await db
          .delete(channelConnections)
          .where(eq(channelConnections.id, connectionId));

        res.json({ success: true, connectionId });
      } catch (error) {
        console.error("[channels] Delete error:", error);
        res.status(500).json({ error: "Failed to delete connection" });
      }
    }
  );

  // ==========================================================================
  // Webhook Endpoints (No Auth - Verified by Provider)
  // ==========================================================================

  /**
   * POST /channels/:channelType/webhook/:connectionId
   * Receive webhook callbacks from external platforms
   */
  router.post("/:channelType/webhook/:connectionId", async (req: Request, res: Response) => {
    const channelType = getParam(req.params, 'channelType');
    const connectionId = getParam(req.params, 'connectionId');
    const startTime = Date.now();

    const parseResult = channelTypeSchema.safeParse(channelType);
    if (!parseResult.success) {
      res.status(400).json({ error: `Invalid channel type: ${channelType}` });
      return;
    }

    const provider = channelProviders.get(parseResult.data);
    if (!provider) {
      res.status(404).json({ error: `Channel provider not available: ${channelType}` });
      return;
    }

    try {
      // Get connection
      const [connection] = await db
        .select()
        .from(channelConnections)
        .where(eq(channelConnections.id, connectionId))
        .limit(1);

      if (!connection) {
        res.status(404).json({ error: "Connection not found" });
        return;
      }

      // Verify webhook
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") {
          headers[key.toLowerCase()] = value;
        }
      }

      const verification = provider.verifyWebhook(
        headers,
        req.body,
        connection.webhookSecret || undefined
      );

      if (!verification.valid) {
        console.warn(`[channels] Webhook verification failed for ${connectionId}: ${verification.error}`);
        res.status(403).json({ error: verification.error || "Webhook verification failed" });
        return;
      }

      // If platform requires challenge response
      if (verification.challenge) {
        res.send(verification.challenge);
        return;
      }

      // Parse the webhook payload
      const parsed = provider.parseWebhook(headers, req.body);

      if (parsed.type === "message" && parsed.message) {
        // Fill in connection ID
        parsed.message.connectionId = connectionId;

        // Update message count
        await db
          .update(channelConnections)
          .set({
            messagesReceived: (connection.messagesReceived || 0) + 1,
            lastMessageAt: new Date(),
            updatedAt: new Date(),
            consecutiveErrors: 0, // Reset on successful message
          })
          .where(eq(channelConnections.id, connectionId));

        // Handle inbound message directly (same service, no need for SDN)
        const runId = `run_msg_${randomUUID().slice(0, 8)}`;

        console.log(
          `[channels] Inbound message from ${channelType}/${connectionId}: ${parsed.message.text?.slice(0, 50)}...`
        );

        // Route message to conversation via bridge
        handleInboundMessage(parsed.message, runId).catch((error) => {
          console.error(`[channels] Error handling inbound message:`, error);
        });
      } else if (parsed.type === "status" && parsed.statusUpdate) {
        // Handle status update
        if (parsed.statusUpdate.newStatus) {
          await updateConnectionStatus(connectionId, parsed.statusUpdate.newStatus, {});
        }
      }

      // Emit raw webhook event for observability
      await emitEvent(
        "channel.webhook.received",
        {
          channelType: parseResult.data,
          connectionId,
          webhookPath: req.path,
          method: req.method,
          headers,
          body: req.body,
          timestamp: new Date().toISOString(),
        },
        `run_wh_${randomUUID().slice(0, 8)}`
      );

      res.json({ ok: true });
    } catch (error) {
      console.error("[channels] Webhook processing error:", error);

      // Update error count - fetch current values first
      const [currentConn] = await db
        .select({
          errorCount: channelConnections.errorCount,
          consecutiveErrors: channelConnections.consecutiveErrors,
        })
        .from(channelConnections)
        .where(eq(channelConnections.id, connectionId))
        .limit(1);

      await db
        .update(channelConnections)
        .set({
          errorCount: (currentConn?.errorCount || 0) + 1,
          consecutiveErrors: (currentConn?.consecutiveErrors || 0) + 1,
          lastError: error instanceof Error ? error.message : "Unknown error",
          lastErrorAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(channelConnections.id, connectionId));

      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  /**
   * GET /channels/:channelType/webhook/:connectionId
   * Handle webhook verification (some platforms use GET)
   */
  router.get("/:channelType/webhook/:connectionId", async (req: Request, res: Response) => {
    const channelType = getParam(req.params, 'channelType');
    const connectionId = getParam(req.params, 'connectionId');

    const parseResult = channelTypeSchema.safeParse(channelType);
    if (!parseResult.success) {
      res.status(400).json({ error: `Invalid channel type: ${channelType}` });
      return;
    }

    const provider = channelProviders.get(parseResult.data);
    if (!provider) {
      res.status(404).json({ error: `Channel provider not available: ${channelType}` });
      return;
    }

    // Get connection for webhook secret
    const [connection] = await db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, connectionId))
      .limit(1);

    if (!connection) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }

    // Verify and respond to challenge
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers[key.toLowerCase()] = value;
      }
    }

    const verification = provider.verifyWebhook(
      headers,
      req.query,
      connection.webhookSecret || undefined
    );

    if (verification.challenge) {
      res.send(verification.challenge);
      return;
    }

    res.json({ ok: true, connectionId });
  });

  // ==========================================================================
  // Send Message Endpoint
  // ==========================================================================

  /**
   * POST /channels/:channelType/connections/:connectionId/send
   * Send a message through a channel (for testing/direct send)
   */
  router.post(
    "/:channelType/connections/:connectionId/send",
    authMiddleware,
    async (req: Request, res: Response) => {
      const channelType = getParam(req.params, 'channelType');
    const connectionId = getParam(req.params, 'connectionId');
      const user = (req as any).user;
      const token = (req as any).token;
      const { chatId, text, replyToMessageId, formatting } = req.body;

      if (!chatId || !text) {
        res.status(400).json({ error: "chatId and text are required" });
        return;
      }

      try {
        const [connection] = await db
          .select()
          .from(channelConnections)
          .where(
            and(
              eq(channelConnections.id, connectionId),
              eq(channelConnections.orgId, user.orgId)
            )
          )
          .limit(1);

        if (!connection) {
          res.status(404).json({ error: "Connection not found" });
          return;
        }

        if (connection.status !== "connected") {
          res.status(400).json({ error: `Connection is not active (status: ${connection.status})` });
          return;
        }

        const provider = channelProviders.get(connection.channelType as ChannelType);
        if (!provider) {
          res.status(500).json({ error: "Channel provider not available" });
          return;
        }

        // Get credential
        const credential = await getCredential(
          user.id,
          user.orgId,
          connection.channelType,
          token
        );

        if (!credential?.apiKey) {
          res.status(400).json({ error: "No credentials available" });
          return;
        }

        const ctx: ChannelConnectionContext = {
          connectionId,
          userId: user.id,
          orgId: user.orgId,
        };

        const result = await provider.sendMessage(
          ctx,
          {
            channelType: connection.channelType as ChannelType,
            connectionId,
            chatId,
            contentType: "text",
            text,
            replyToMessageId,
            formatting,
          },
          credential.apiKey,
          connection.sessionData as Record<string, unknown>
        );

        if (result.success) {
          // Update message count
          await db
            .update(channelConnections)
            .set({
              messagesSent: (connection.messagesSent || 0) + 1,
              updatedAt: new Date(),
            })
            .where(eq(channelConnections.id, connectionId));

          res.json({
            success: true,
            messageId: result.messageId,
            timestamp: result.timestamp?.toISOString(),
          });
        } else {
          res.status(400).json({
            success: false,
            error: result.error,
          });
        }
      } catch (error) {
        console.error("[channels] Send error:", error);
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  );

  return router;
}

/**
 * Register channel routes with the Express app
 */
export function registerChannelRoutes(app: Express): void {
  const router = createChannelRoutes();
  app.use("/api/integrations/channels", router);
  console.log("[channels] Channel routes registered at /api/integrations/channels");
}
