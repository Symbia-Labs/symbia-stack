import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import type { Session, SessionData } from "express-session";
import { createTelemetryClient } from "@symbia/logging-client";
import { setupDocRoutes } from "./doc-routes";
import { logAssistant } from "./log-assistant";
import { logBroadcaster, type LogBroadcastEntry } from "./log-broadcaster.js";
import { resolveServiceUrl, ServiceId } from "@symbia/sys";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    username?: string;
    identityToken?: string;
    identityUser?: any;
  }
}

/**
 * Identity service login response
 */
interface IdentityLoginResponse {
  token?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  id?: string;
  email?: string;
  name?: string;
  error?: string;
  message?: string;
}

/**
 * Helper to parse JSON response with proper typing
 */
async function parseJsonResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

import {
  insertMetricSchema,
  insertDataSourceSchema,
  insertIntegrationSchema,
  metricsQuerySchema,
  ingestBatchSchema,
  insertLogStreamSchema,
  logsQuerySchema,
  logsIngestSchema,
  tracesQuerySchema,
  tracesIngestSchema,
  insertObjectStreamSchema,
  objectsQuerySchema,
  objectsIngestSchema,
} from "@shared/schema";
import { z } from "zod";
import { requireAuthContext, generateApiKey, introspectToken } from "./auth";

// Auth mode for dev bypass
const AUTH_MODE = (process.env.LOGGING_AUTH_MODE ||
  (process.env.NODE_ENV === "production" ? "required" : "optional")) as
  | "required"
  | "optional"
  | "off";

function applyScopedDefaults<T extends Record<string, any>>(payload: T, context: ReturnType<typeof requireAuthContext>) {
  const orgId = context.isSuperAdmin && payload.orgId ? payload.orgId : context.orgId;
  const serviceId = context.isSuperAdmin && payload.serviceId ? payload.serviceId : context.serviceId;
  const env = context.isSuperAdmin && payload.env ? payload.env : context.env;

  return {
    ...payload,
    orgId,
    serviceId,
    env,
    dataClass: context.dataClass,
    policyRef: context.policyRef,
    createdBy: context.actorId,
    actorId: context.actorId,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ============================================================================
  // Auth
  // ============================================================================

  const telemetry = createTelemetryClient({
    serviceId: process.env.TELEMETRY_SERVICE_ID || "symbia-logging-service",
  });

  const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  });

  const identityBase = resolveServiceUrl(ServiceId.IDENTITY);

  function getBearerToken(req: Request): string | null {
    const authHeader = req.headers.authorization || "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      return authHeader.slice("bearer ".length).trim();
    }
    return null;
  }

  async function resolveAuthMe(req: Request) {
    const token = getBearerToken(req) || req.session?.identityToken || null;
    if (token) {
      const introspection = await introspectToken(token);
      if (introspection) {
        const organizations = introspection.organizations || [];
        return {
          user: {
            id: introspection.id || req.session?.userId || "unknown",
            email: introspection.email || req.session?.username || "",
            name: introspection.name || req.session?.identityUser?.name || "",
            isSuperAdmin: introspection.isSuperAdmin || false,
            entitlements: introspection.entitlements || [],
            roles: introspection.roles || [],
            organizations,
          },
          organizations,
        };
      }
    }

    if (req.session?.identityUser) {
      const user = req.session.identityUser;
      return {
        user,
        organizations: user.organizations || [],
      };
    }

    if (req.authContext?.authType === "apiKey") {
      return {
        user: {
          id: req.authContext.actorId,
          email: "api-key@system",
          name: "API Key",
          isSuperAdmin: false,
          entitlements: req.authContext.entitlements || [],
          roles: req.authContext.roles || [],
          organizations: [],
        },
        organizations: [],
      };
    }

    return null;
  }

  // Service discovery endpoint (standardized across all services)
  app.get("/api/bootstrap/service", (_req, res) => {
    res.json({
      service: "logging",
      version: "1.0.0",
      description: "Comprehensive observability platform for logs, metrics, traces, and objects",
      docsUrls: {
        openapi: "/docs/openapi.json",
        llms: "/docs/llms.txt",
        llmsFull: "/docs/llms-full.txt",
      },
      endpoints: {
        auth: "/api/auth",
        logs: "/api/logs",
        metrics: "/api/metrics",
        traces: "/api/traces",
        objects: "/api/objects",
        dataSources: "/api/data-sources",
        integrations: "/api/integrations",
        assistant: "/api/assistant",
        apiKeys: "/api/auth/keys",
      },
      authentication: [
        "Bearer token (JWT)",
        "API key (X-API-Key header)",
        "Session cookie",
      ],
      requiredHeaders: [
        "X-Org-Id",
        "X-Service-Id",
        "X-Env",
        "X-Data-Class",
        "X-Policy-Ref",
      ],
    });
  });

  app.get("/api/auth/config", (_req, res) => {
    res.json({
      identityServiceUrl: identityBase,
      loginUrl: `${identityBase}/login`,
      logoutUrl: `${identityBase}/api/auth/logout`,
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    const auth = await resolveAuthMe(req);
    if (!auth) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    res.json(auth);
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const body = loginSchema.parse(req.body);
      
      // All authentication goes through Symbia Identity Service
      try {
        const identityResponse = await fetch(`${identityBase}/api/auth/login`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ email: body.username, password: body.password }),
        });

        const data = await parseJsonResponse<IdentityLoginResponse>(identityResponse);

        if (identityResponse.ok) {
          const setCookie = identityResponse.headers.get("set-cookie");
          
          // Extract the token from the cookie if present
          let token = data.token;
          if (!token && setCookie) {
            const tokenMatch = setCookie.match(/token=([^;]+)/);
            if (tokenMatch) token = tokenMatch[1];
          }

          // Regenerate session to prevent fixation
          await new Promise<void>((resolve, reject) => {
            req.session.regenerate((err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Store user info and token in session
          req.session.userId = data.user?.id || data.id;
          req.session.username = data.user?.email || data.email || body.username;
          req.session.identityToken = token;
          req.session.identityUser = data.user || data;

          // Explicitly save session before responding
          await new Promise<void>((resolve, reject) => {
            req.session.save((err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Log successful authentication
          telemetry.event("auth.login.success", `User ${body.username} logged in`, {
            userId: data.user?.id || data.id,
            email: body.username,
          });

          return res.json({
            success: true,
            user: {
              id: data.user?.id || data.id,
              username: data.user?.email || data.email || body.username,
              name: data.user?.name || data.name,
              role: "admin",
            },
          });
        } else {
          // Log failed authentication
          telemetry.event("auth.login.failed", `Login failed for ${body.username}`, {
            email: body.username,
            status: identityResponse.status,
          }, "warn");

          // Return identity service error
          return res.status(identityResponse.status).json({ 
            error: data.error || data.message || "Invalid credentials" 
          });
        }
      } catch (identityError) {
        console.log("Identity service unavailable:", identityError);
        telemetry.event("auth.login.error", "Identity service unavailable", {}, "error");
        return res.status(503).json({ error: "Identity service unavailable. Please try again later." });
      }
    } catch (error) {
      res.status(400).json({ error: "Invalid request" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const userId = req.session?.userId;
    const username = req.session?.username;
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      // Log successful logout
      telemetry.event("auth.logout", `User ${username || 'unknown'} logged out`, {
        userId: userId || "unknown",
      });
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  app.get("/api/auth/session", (req, res) => {
    if (req.session?.userId) {
      const identityUser = req.session.identityUser;
      res.json({
        authenticated: true,
        user: {
          id: req.session.userId,
          username: req.session.username,
          name: identityUser?.name,
          role: "admin",
        },
      });
    } else if (AUTH_MODE === "optional" || AUTH_MODE === "off") {
      // Allow anonymous access in dev mode
      res.json({
        authenticated: true,
        user: {
          id: "anonymous",
          username: "anonymous",
          name: "Anonymous User",
          role: "admin",
        },
      });
    } else {
      res.json({ authenticated: false });
    }
  });

  // API Key management routes
  const createApiKeySchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    orgId: z.string().optional(),
    serviceId: z.string().optional(),
    env: z.string().optional(),
    scopes: z.array(z.string()).optional(),
    expiresAt: z.string().datetime().optional(),
  });

  app.get("/api/auth/keys", async (req, res) => {
    try {
      requireAuthContext(req);
      const keys = await storage.getApiKeys();
      res.json(
        keys.map((k) => ({
          id: k.id,
          name: k.name,
          description: k.description,
          prefix: k.keyPrefix,
          orgId: k.orgId,
          serviceId: k.serviceId,
          env: k.env,
          scopes: k.scopes,
          lastUsedAt: k.lastUsedAt,
          expiresAt: k.expiresAt,
          createdAt: k.createdAt,
          revoked: !!k.revokedAt,
        }))
      );
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Failed to list API keys" });
    }
  });

  app.post("/api/auth/keys", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const body = createApiKeySchema.parse(req.body);
      const { key, prefix, hash } = generateApiKey();

      const apiKey = await storage.createApiKey({
        name: body.name,
        description: body.description,
        keyPrefix: prefix,
        keyHash: hash,
        orgId: body.orgId || context.orgId,
        serviceId: body.serviceId || context.serviceId,
        env: body.env || context.env,
        scopes: body.scopes || ["ingest"],
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        createdBy: context.actorId,
      });

      res.json({
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.keyPrefix,
        key,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      });
    } catch (error: any) {
      res.status(error.status || 400).json({ error: error.message || "Failed to create API key" });
    }
  });

  app.delete("/api/auth/keys/:id", async (req, res) => {
    try {
      requireAuthContext(req);
      const id = req.params.id;
      await storage.revokeApiKey(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Failed to revoke API key" });
    }
  });

  // ============================================================================
  // Stats
  // ============================================================================

  app.get("/api/stats", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const stats = await storage.getStats(context);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/stats/ingest-rate", async (req, res) => {
    try {
      const now = new Date();
      const data = [];
      for (let i = 23; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60 * 60 * 1000);
        data.push({
          time: time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          value: Math.floor(100 + Math.random() * 400),
        });
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ingest rate" });
    }
  });

  app.get("/api/stats/query-latency", async (req, res) => {
    try {
      const now = new Date();
      const data = [];
      for (let i = 23; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60 * 60 * 1000);
        data.push({
          time: time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          value: Math.floor(5 + Math.random() * 25),
        });
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch query latency" });
    }
  });

  // ============================================================================
  // Logs
  // ============================================================================

  app.get("/api/logs/streams", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const streams = await storage.getLogStreams(context);
      res.json(streams);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch log streams" });
    }
  });

  app.get("/api/logs/streams/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const stream = await storage.getLogStream(context, req.params.id);
      if (!stream) {
        return res.status(404).json({ error: "Log stream not found" });
      }
      res.json(stream);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch log stream" });
    }
  });

  app.post("/api/logs/streams", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertLogStreamSchema.parse(payload);
      const stream = await storage.createLogStream(context, parsed);
      res.status(201).json(stream);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create log stream" });
    }
  });

  app.patch("/api/logs/streams/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertLogStreamSchema.partial().parse(payload);
      const stream = await storage.updateLogStream(context, req.params.id, parsed);
      if (!stream) {
        return res.status(404).json({ error: "Log stream not found" });
      }
      res.json(stream);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update log stream" });
    }
  });

  app.delete("/api/logs/streams/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const deleted = await storage.deleteLogStream(context, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Log stream not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete log stream" });
    }
  });

  app.post("/api/logs/query", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const query = logsQuerySchema.parse(req.body);
      const data = await storage.queryLogEntries(context, query);
      res.json({ data, rowCount: data.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to query logs" });
    }
  });

  app.post("/api/logs/ingest", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const batch = logsIngestSchema.parse(req.body);
      const stream = await storage.getLogStream(context, batch.streamId);
      if (!stream) {
        return res.status(404).json({ error: "Log stream not found" });
      }
      const count = await storage.insertLogEntriesBatch(context, batch.streamId, batch.entries);

      // Broadcast new logs to SSE clients (event-driven, no polling)
      if (count > 0) {
        const broadcastEntries: LogBroadcastEntry[] = batch.entries.map((e, i) => ({
          id: `${batch.streamId}-${Date.now()}-${i}`, // Temporary ID for broadcast
          streamId: batch.streamId,
          orgId: context.orgId,
          serviceId: context.serviceId,
          env: context.env,
          timestamp: e.timestamp,
          level: e.level as 'debug' | 'info' | 'warn' | 'error',
          message: e.message,
          source: stream.name,
          metadata: e.metadata,
        }));
        logBroadcaster.broadcast(broadcastEntries);
      }

      res.json({ success: true, count });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to ingest logs" });
    }
  });

  // SSE endpoint for real-time log streaming (event-driven, no polling)
  app.get("/api/logs/stream", async (req, res) => {
    try {
      const context = requireAuthContext(req);

      // Parse query parameters
      const streamIds = req.query.streamIds
        ? (req.query.streamIds as string).split(',')
        : undefined;
      const level = req.query.level as 'debug' | 'info' | 'warn' | 'error' | undefined;

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.flushHeaders();

      // Register this client with the broadcaster (event-driven, no polling)
      const clientId = logBroadcaster.registerClient(res, context.orgId, {
        streamIds,
        level,
      });

      // Send initial connection event with client count for monitoring
      res.write(`event: connected\ndata: ${JSON.stringify({
        message: 'Connected to log stream',
        clientId,
        activeClients: logBroadcaster.getClientCount(),
      })}\n\n`);

      // Clean up on client disconnect
      req.on('close', () => {
        logBroadcaster.unregisterClient(clientId);
      });

    } catch (error: any) {
      // If headers haven't been sent yet, we can still send an error response
      if (!res.headersSent) {
        res.status(error.status || 500).json({ error: error.message || 'Failed to start log stream' });
      }
    }
  });

  // ============================================================================
  // Metrics
  // ============================================================================

  app.get("/api/metrics", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const metrics = await storage.getMetrics(context);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  app.get("/api/metrics/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const metric = await storage.getMetric(context, req.params.id);
      if (!metric) {
        return res.status(404).json({ error: "Metric not found" });
      }
      res.json(metric);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch metric" });
    }
  });

  app.post("/api/metrics", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertMetricSchema.parse(payload);
      const metric = await storage.createMetric(context, parsed);
      res.status(201).json(metric);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create metric" });
    }
  });

  app.patch("/api/metrics/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertMetricSchema.partial().parse(payload);
      const metric = await storage.updateMetric(context, req.params.id, parsed);
      if (!metric) {
        return res.status(404).json({ error: "Metric not found" });
      }
      res.json(metric);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update metric" });
    }
  });

  app.delete("/api/metrics/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const deleted = await storage.deleteMetric(context, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Metric not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete metric" });
    }
  });

  app.post("/api/metrics/query", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const config = metricsQuerySchema.parse(req.body);
      const data = await storage.queryDataPoints(context, config);
      res.json({ data, rowCount: data.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to execute query" });
    }
  });

  app.post("/api/metrics/ingest", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const batch = ingestBatchSchema.parse(req.body);
      const metric = await storage.getMetric(context, batch.metricId);
      if (!metric) {
        return res.status(404).json({ error: "Metric not found" });
      }
      const count = await storage.insertDataPointsBatch(context, batch.metricId, batch.dataPoints);
      res.json({ success: true, count });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to ingest data" });
    }
  });

  // Legacy endpoints for backward compatibility
  app.post("/api/query", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const config = metricsQuerySchema.parse(req.body);
      const data = await storage.queryDataPoints(context, config);
      res.json({ data, rowCount: data.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to execute query" });
    }
  });

  app.post("/api/ingest", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const batch = ingestBatchSchema.parse(req.body);
      const metric = await storage.getMetric(context, batch.metricId);
      if (!metric) {
        return res.status(404).json({ error: "Metric not found" });
      }
      const count = await storage.insertDataPointsBatch(context, batch.metricId, batch.dataPoints);
      res.json({ success: true, count });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to ingest data" });
    }
  });

  // ============================================================================
  // Traces
  // ============================================================================

  app.get("/api/traces", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const traces = await storage.getTraces(context);
      res.json(traces);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch traces" });
    }
  });

  app.get("/api/traces/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const trace = await storage.getTrace(context, req.params.id);
      if (!trace) {
        return res.status(404).json({ error: "Trace not found" });
      }
      res.json(trace);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trace" });
    }
  });

  app.get("/api/traces/:traceId/spans", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const spans = await storage.getSpansByTraceId(context, req.params.traceId);
      res.json(spans);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch spans" });
    }
  });

  app.post("/api/traces/query", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const query = tracesQuerySchema.parse(req.body);
      const data = await storage.getTraces(context, query);
      res.json({ data, rowCount: data.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to query traces" });
    }
  });

  app.post("/api/traces/ingest", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const batch = tracesIngestSchema.parse(req.body);
      const count = await storage.insertSpansBatch(context, batch.spans as any);
      res.json({ success: true, count });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to ingest traces" });
    }
  });

  // ============================================================================
  // Objects
  // ============================================================================

  app.get("/api/objects/streams", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const streams = await storage.getObjectStreams(context);
      res.json(streams);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch object streams" });
    }
  });

  app.get("/api/objects/streams/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const stream = await storage.getObjectStream(context, req.params.id);
      if (!stream) {
        return res.status(404).json({ error: "Object stream not found" });
      }
      res.json(stream);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch object stream" });
    }
  });

  app.post("/api/objects/streams", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertObjectStreamSchema.parse(payload);
      const stream = await storage.createObjectStream(context, parsed);
      res.status(201).json(stream);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create object stream" });
    }
  });

  app.patch("/api/objects/streams/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertObjectStreamSchema.partial().parse(payload);
      const stream = await storage.updateObjectStream(context, req.params.id, parsed);
      if (!stream) {
        return res.status(404).json({ error: "Object stream not found" });
      }
      res.json(stream);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update object stream" });
    }
  });

  app.delete("/api/objects/streams/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const deleted = await storage.deleteObjectStream(context, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Object stream not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete object stream" });
    }
  });

  app.post("/api/objects/query", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const query = objectsQuerySchema.parse(req.body);
      const data = await storage.queryObjectEntries(context, query);
      res.json({ data, rowCount: data.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to query objects" });
    }
  });

  app.post("/api/objects/ingest", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const entry = objectsIngestSchema.parse(req.body);
      const stream = await storage.getObjectStream(context, entry.streamId);
      if (!stream) {
        return res.status(404).json({ error: "Object stream not found" });
      }
      const result = await storage.insertObjectEntry(context, {
        streamId: entry.streamId,
        timestamp: new Date(),
        filename: entry.filename,
        contentType: entry.contentType,
        size: entry.size,
        checksum: entry.checksum,
        storageUrl: entry.storageUrl,
        metadata: entry.metadata,
      });
      res.json({ success: true, entry: result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to ingest object" });
    }
  });

  // ============================================================================
  // Data Sources
  // ============================================================================

  app.get("/api/data-sources", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const sources = await storage.getDataSources(context);
      res.json(sources);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch data sources" });
    }
  });

  app.get("/api/data-sources/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const source = await storage.getDataSource(context, req.params.id);
      if (!source) {
        return res.status(404).json({ error: "Data source not found" });
      }
      res.json(source);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch data source" });
    }
  });

  app.post("/api/data-sources", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertDataSourceSchema.parse(payload);
      const source = await storage.createDataSource(context, parsed);
      res.status(201).json(source);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create data source" });
    }
  });

  app.patch("/api/data-sources/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertDataSourceSchema.partial().parse(payload);
      const source = await storage.updateDataSource(context, req.params.id, parsed);
      if (!source) {
        return res.status(404).json({ error: "Data source not found" });
      }
      res.json(source);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update data source" });
    }
  });

  app.delete("/api/data-sources/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const deleted = await storage.deleteDataSource(context, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Data source not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete data source" });
    }
  });

  app.post("/api/data-sources/:id/sync", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const source = await storage.getDataSource(context, req.params.id);
      if (!source) {
        return res.status(404).json({ error: "Data source not found" });
      }
      const updated = await storage.updateDataSource(context, req.params.id, {
        status: "active",
      });
      res.json({ success: true, source: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync data source" });
    }
  });

  // ============================================================================
  // Integrations
  // ============================================================================

  app.get("/api/integrations", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const integrations = await storage.getIntegrations(context);
      res.json(integrations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch integrations" });
    }
  });

  app.get("/api/integrations/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const integration = await storage.getIntegration(context, req.params.id);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      res.json(integration);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch integration" });
    }
  });

  app.post("/api/integrations", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertIntegrationSchema.parse(payload);
      const integration = await storage.createIntegration(context, parsed);
      res.status(201).json(integration);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create integration" });
    }
  });

  app.patch("/api/integrations/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertIntegrationSchema.partial().parse(payload);
      const integration = await storage.updateIntegration(context, req.params.id, parsed);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      res.json(integration);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update integration" });
    }
  });

  app.delete("/api/integrations/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const deleted = await storage.deleteIntegration(context, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Integration not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete integration" });
    }
  });

  app.post("/api/integrations/:id/test", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const integration = await storage.getIntegration(context, req.params.id);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      let success = false;
      let message = "";

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(integration.endpoint, {
          method: "GET",
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok || response.status === 401 || response.status === 403) {
          success = true;
          message = `Endpoint reachable (HTTP ${response.status})`;
        } else {
          message = `Endpoint returned HTTP ${response.status}`;
        }
      } catch (fetchError: any) {
        if (fetchError.name === "AbortError") {
          message = "Connection timed out";
        } else {
          message = `Connection failed: ${fetchError.message}`;
        }
      }

      await storage.updateIntegration(context, req.params.id, {
        status: success ? "connected" : "error",
      });

      const updated = await storage.getIntegration(context, req.params.id);
      if (updated) {
        (updated as any).lastCheckedAt = new Date();
      }

      res.json({ success, message, integration: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to test integration" });
    }
  });

  // ============================================================================
  // Log Assistant
  // ============================================================================

  app.get("/api/assistant/config", async (req, res) => {
    try {
      const configured = await logAssistant.isConfigured();
      res.json({
        configured,
        capabilities: ["summarize", "analyze", "group", "investigate"],
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get assistant config" });
    }
  });

  app.post("/api/assistant/summarize", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      // Get auth token for Integrations service
      const authToken = getBearerToken(req) || req.session?.identityToken || undefined;

      const {
        logIds,
        startTime,
        endTime,
        streamIds,
        level,
        search,
        limit = 200,
      } = req.body;

      // Query logs with the same constraints as the explorer
      let entries;
      if (logIds && Array.isArray(logIds) && logIds.length > 0) {
        // Legacy: fetch by specific IDs (less efficient)
        const allLogs = await storage.queryLogEntries(context, { limit: 1000 });
        entries = allLogs.filter((log) => logIds.includes(log.id));
      } else {
        // Preferred: use query constraints from explorer
        entries = await storage.queryLogEntries(context, {
          startTime,
          endTime,
          streamIds,
          level: level !== "all" ? level : undefined,
          search,
          limit: Math.min(limit, 500), // Cap at 500 for performance
        });
      }

      const summary = await logAssistant.summarizeLogs(entries, authToken);
      res.json(summary);
    } catch (error) {
      console.error("Assistant summarize error:", error);
      res.status(500).json({ error: "Failed to summarize logs" });
    }
  });

  app.post("/api/assistant/analyze", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      // Get auth token for Integrations service
      const authToken = getBearerToken(req) || req.session?.identityToken || undefined;

      const {
        logIds,
        startTime,
        endTime,
        streamIds,
        search,
        limit = 200,
      } = req.body;

      let entries;
      if (logIds && Array.isArray(logIds) && logIds.length > 0) {
        // Legacy: fetch by specific IDs
        const allLogs = await storage.queryLogEntries(context, { limit: 1000 });
        entries = allLogs.filter((log) => logIds.includes(log.id));
      } else {
        // Query errors with constraints from explorer
        entries = await storage.queryLogEntries(context, {
          startTime,
          endTime,
          streamIds,
          level: "error", // Always filter to errors for analysis
          search,
          limit: Math.min(limit, 300),
        });
      }

      const analysis = await logAssistant.analyzeErrors(entries, authToken);
      res.json(analysis);
    } catch (error) {
      console.error("Assistant analyze error:", error);
      res.status(500).json({ error: "Failed to analyze logs" });
    }
  });

  app.post("/api/assistant/group", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const { logIds, startTime, endTime, limit = 500 } = req.body;

      let entries;
      if (logIds && Array.isArray(logIds) && logIds.length > 0) {
        const allLogs = await storage.queryLogEntries(context, { limit: 1000 });
        entries = allLogs.filter((log) => logIds.includes(log.id));
      } else {
        entries = await storage.queryLogEntries(context, {
          startTime,
          endTime,
          limit,
        });
      }

      const groups = await logAssistant.groupRelatedLogs(entries);
      res.json({ groups });
    } catch (error) {
      console.error("Assistant group error:", error);
      res.status(500).json({ error: "Failed to group logs" });
    }
  });

  app.post("/api/assistant/investigate", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      // Get auth token for Integrations service
      const authToken = getBearerToken(req) || req.session?.identityToken || undefined;

      const {
        insight,
        startTime,
        endTime,
        streamIds,
        level,
        search,
        limit = 200,
      } = req.body;

      if (!insight || !insight.text) {
        return res.status(400).json({ error: "Insight is required" });
      }

      // Fetch logs with current query constraints
      const entries = await storage.queryLogEntries(context, {
        startTime,
        endTime,
        streamIds,
        level: level !== "all" ? level : undefined,
        search,
        limit: Math.min(limit, 300),
      });

      // Also fetch a broader set for finding related logs
      const allEntries = await storage.queryLogEntries(context, {
        startTime,
        endTime,
        limit: 500,
      });

      const result = await logAssistant.investigate(insight, entries, allEntries, authToken);
      res.json(result);
    } catch (error) {
      console.error("Assistant investigate error:", error);
      res.status(500).json({ error: "Failed to investigate insight" });
    }
  });

  // ============================================================================
  // Documentation Routes
  // ============================================================================

  setupDocRoutes(app);

  return httpServer;
}
