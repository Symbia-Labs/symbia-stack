import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  executeRequestSchema,
  type ExecuteRequest,
  type ExecuteResponse,
  type NormalizedLLMResponse,
  type NormalizedEmbeddingResponse,
} from "@shared/schema.js";
import { getProvider, getRegisteredProviders, initializeProviders } from "./providers/index.js";
import { getCredential } from "./credential-client.js";
import { authMiddleware, optionalAuth, type AuthUser } from "./auth.js";
import { getAllProviderConfigs, getProviderConfig, getModelsForProvider } from "./catalog-client.js";
import {
  integrationRegistry,
  initializeBuiltinIntegrations,
  fetchAndParseOpenAPI,
  discoverMCPServer,
} from "./spec-parser/index.js";
import { createEvalRoutes, initializeModelEvalSystem } from "./model-eval/index.js";
import type { Integration, IntegrationInvokeRequest } from "@shared/schema.js";
import { db, setRLSContext } from "./db.js";
import { sql, and } from "drizzle-orm";
import { executionLogs, proxyUsage } from "@shared/schema.js";
import type { CredentialLookup } from "./credential-client.js";
import { apiDocumentation } from "./openapi.js";
import { emitEvent, observabilityMiddleware } from "@symbia/relay";
import { IntegrationError, classifyProviderError } from "./errors.js";
import {
  recordProviderRequest,
  recordCircuitBreakerChange,
  recordRateLimitHit,
  withProviderObservability,
  log,
  logEvent,
  createSpan,
} from "./telemetry.js";
import { rateLimitMiddleware } from "./rate-limiter.js";
import {
  bodySizeLimitMiddleware,
  securityHeadersMiddleware,
  circuitBreaker,
  sanitizeForLogging,
  createSafeLogger,
} from "./security.js";
import {
  mcpExecutor,
  classifyOperation,
  type ExecutionContext,
} from "./executors/index.js";
import { mcpServer, createMCPHttpHandler } from "./mcp-server.js";
import { OAuthService } from "./oauth/oauth-service.js";
import { initializeOAuthProviders, getOAuthProvider, getRegisteredOAuthProviders, OAuthError } from "./oauth/providers/index.js";
import { createOAuthStorage } from "./oauth/storage.js";
import {
  oauthAuthorizeRequestSchema,
  type OAuthAuthorizeRequest,
} from "@shared/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Use cwd for production (Docker), fallback to relative for dev
const docsDir = process.env.NODE_ENV === "production"
  ? join(process.cwd(), "docs")
  : join(__dirname, "../..", "docs");

/**
 * Helper to safely extract route params (Express 5.x returns string | string[])
 */
function getParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] : (value ?? '');
}

/**
 * Extract auth token from request (for credential lookup)
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

export async function registerRoutes(httpServer: Server, app: Express): Promise<void> {
  // Initialize providers
  initializeProviders();

  // ==========================================================================
  // Security Middleware (applied to all routes)
  // ==========================================================================

  // Add security headers to all responses
  app.use(securityHeadersMiddleware);

  // Enforce request body size limits
  app.use(bodySizeLimitMiddleware);

  // ==========================================================================
  // Observability Middleware (HTTP request/response tracking via SDN)
  // ==========================================================================

  app.use(observabilityMiddleware({
    excludePaths: ['/health', '/health/live', '/health/ready', '/favicon.ico'],
    excludePatterns: [/^\/api\/integrations\/mcp/], // MCP has its own observability
    slowRequestThresholdMs: 5000,
    traceIdHeader: 'x-trace-id',
  }) as any);

  // ==========================================================================
  // Execute Endpoint
  // ==========================================================================

  app.post("/api/integrations/execute", authMiddleware, rateLimitMiddleware, async (req: Request, res: Response) => {
    const startTime = Date.now();
    const requestId = `req_${randomUUID().slice(0, 12)}`;
    const user = (req as any).user;
    const token = (req as any).token;

    try {
      // Validate request body
      const parseResult = executeRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        const validationError = new IntegrationError({
          message: `Invalid request: ${parseResult.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
          category: "validation",
        });
        res.status(validationError.statusCode).json({
          ...validationError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime,
        });
        return;
      }

      const request: ExecuteRequest = parseResult.data;
      const { provider, operation, params } = request;

      // Get provider adapter
      const adapter = getProvider(provider);
      if (!adapter) {
        const notFoundError = new IntegrationError({
          message: `Unknown provider: ${provider}. Available: ${getRegisteredProviders().join(", ")}`,
          category: "not_found",
          provider,
          retryable: false,
        });
        res.status(notFoundError.statusCode).json({
          ...notFoundError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime,
        });
        return;
      }

      // Validate params
      const validation = adapter.validateParams(operation, params);
      if (!validation.valid) {
        const validationError = new IntegrationError({
          message: `Invalid params: ${validation.errors?.join(", ")}`,
          category: "validation",
          provider,
          operation,
          retryable: false,
        });
        res.status(validationError.statusCode).json({
          ...validationError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime,
        });
        return;
      }

      // Get credential from Identity
      const credential = await getCredential(user.id, user.orgId, provider, token);
      if (!credential) {
        const authError = new IntegrationError({
          message: `No ${provider} API key configured. Add your API key in Settings.`,
          category: "auth",
          provider,
          operation,
          retryable: false,
        });
        res.status(authError.statusCode).json({
          ...authError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime,
        });
        return;
      }

      // Check circuit breaker before executing
      const circuitCheck = circuitBreaker.canRequest(provider);
      if (!circuitCheck.allowed) {
        const circuitError = new IntegrationError({
          message: circuitCheck.reason || `Provider ${provider} is temporarily unavailable`,
          category: "provider",
          provider,
          operation,
          retryable: true, // Will be retryable after circuit resets
        });
        res.status(503).json({
          ...circuitError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime,
        });
        return;
      }

      // Execute the request
      let data: NormalizedLLMResponse | NormalizedEmbeddingResponse;
      try {
        const executeOptions = {
          operation,
          model: params.model,
          params,
          apiKey: credential.apiKey,
          timeout: 60000, // 60 second timeout
        };

        // Use withProviderObservability to wrap the provider call with SDN events
        const executeWithObservability = async () => {
          // Route to embed method for embedding operations
          if (operation === "embeddings" && adapter.embed) {
            return await adapter.embed(executeOptions);
          } else {
            return await adapter.execute(executeOptions);
          }
        };

        // Execute with observability (emits SDN events automatically)
        data = await withProviderObservability(
          provider,
          operation,
          requestId,
          executeWithObservability
        );

        const durationMs = Date.now() - startTime;

        // Record telemetry metrics for the successful request
        recordProviderRequest(provider, operation, durationMs, true, data.usage);

        // Record successful execution for circuit breaker
        circuitBreaker.recordSuccess(provider);
      } catch (execError) {
        const durationMs = Date.now() - startTime;

        // Record telemetry metrics for the failed request
        recordProviderRequest(provider, operation, durationMs, false);

        // Record failure for circuit breaker
        circuitBreaker.recordFailure(provider);

        // Classify the error into a meaningful category for callers
        const classified = classifyProviderError(execError, provider, operation);

        // Log failed execution with category info
        await logExecution({
          userId: user.id,
          orgId: user.orgId,
          provider,
          operation,
          model: params.model,
          requestId,
          startedAt: new Date(startTime),
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          success: false,
          errorMessage: classified.message,
          metadata: {
            errorCategory: classified.category,
            retryable: classified.retryable,
            upstream: classified.upstream,
          },
        });

        // Return structured error response
        const response: ExecuteResponse & { errorCategory?: string; retryable?: boolean } = {
          success: false,
          error: classified.message,
          requestId,
          durationMs: Date.now() - startTime,
          // Extended error info for callers (especially assistants graph engine)
          errorCategory: classified.category,
          retryable: classified.retryable,
        };
        res.status(classified.statusCode).json(response);
        return;
      }

      // Log successful execution (handle both LLM and embedding responses)
      const isEmbeddingResponse = operation === "embeddings";
      await logExecution({
        userId: user.id,
        orgId: user.orgId,
        provider,
        operation,
        model: data.model,
        requestId,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        success: true,
        promptTokens: data.usage.promptTokens,
        completionTokens: isEmbeddingResponse ? 0 : (data as NormalizedLLMResponse).usage.completionTokens,
        totalTokens: data.usage.totalTokens,
      });

      const response: ExecuteResponse = {
        success: true,
        data,
        requestId,
        durationMs: Date.now() - startTime,
      };
      res.json(response);
    } catch (error) {
      console.error("[integrations] Unexpected error:", error);

      // If it's already an IntegrationError, use it; otherwise wrap as internal
      const internalError = error instanceof IntegrationError
        ? error
        : new IntegrationError({
            message: "Internal server error",
            category: "internal",
            cause: error instanceof Error ? error : undefined,
          });

      res.status(internalError.statusCode).json({
        ...internalError.toResponse(),
        requestId,
        durationMs: Date.now() - startTime,
      });
    }
  });

  // ==========================================================================
  // Provider Endpoints
  // ==========================================================================

  app.get("/api/integrations/providers", async (req: Request, res: Response) => {
    const configs = getAllProviderConfigs();
    res.json({
      providers: configs.map(c => ({
        name: c.provider,
        baseUrl: c.baseUrl,
        defaultModel: c.defaultModel,
        supportedOperations: c.supportedOperations,
      })),
    });
  });

  app.get("/api/integrations/providers/:provider", async (req: Request, res: Response) => {
    const provider = getParam(req.params, 'provider');
    const config = getProviderConfig(provider);

    if (!config) {
      res.status(404).json({ error: `Provider not found: ${provider}` });
      return;
    }

    res.json(config);
  });

  app.get("/api/integrations/providers/:provider/models", authMiddleware, async (req: Request, res: Response) => {
    const provider = getParam(req.params, 'provider');
    const { capability } = req.query; // Filter by capability: 'chat', 'embedding', 'vision', etc.
    const user = (req as any).user;
    const token = (req as any).token;

    // Try to get user's API key for dynamic model fetching
    let apiKey: string | undefined;
    try {
      const credential = await getCredential(user.id, user.orgId, provider, token);
      apiKey = credential?.apiKey;
    } catch {
      // If we can't get credentials, fall back to static list
    }

    let models = await getModelsForProvider(provider, apiKey);

    // Filter by capability if specified
    if (capability && typeof capability === 'string') {
      const capabilities = capability.split(',').map(c => c.trim().toLowerCase());
      models = models.filter(m =>
        m.capabilities?.some(c => capabilities.includes(c.toLowerCase()))
      );
    }

    res.json({ models });
  });

  // Get all models across providers, optionally filtered by capability
  app.get("/api/integrations/models", authMiddleware, async (req: Request, res: Response) => {
    const { capability, purpose } = req.query;
    const user = (req as any).user;
    const token = (req as any).token;

    // Determine capabilities to filter by
    let filterCapabilities: string[] = [];
    if (capability && typeof capability === 'string') {
      filterCapabilities = capability.split(',').map(c => c.trim().toLowerCase());
    } else if (purpose && typeof purpose === 'string') {
      // Map purpose to capabilities
      switch (purpose.toLowerCase()) {
        case 'chat':
        case 'llm':
          filterCapabilities = ['chat', 'reasoning'];
          break;
        case 'embedding':
        case 'embeddings':
          filterCapabilities = ['embedding'];
          break;
        case 'vision':
          filterCapabilities = ['vision'];
          break;
      }
    }

    const providers = getRegisteredProviders();
    const result: Record<string, any[]> = {};

    for (const provider of providers) {
      let apiKey: string | undefined;
      try {
        const credential = await getCredential(user.id, user.orgId, provider, token);
        apiKey = credential?.apiKey;
      } catch {
        // Continue without API key
      }

      let models = await getModelsForProvider(provider, apiKey);

      // Filter by capabilities if specified
      if (filterCapabilities.length > 0) {
        models = models.filter(m =>
          m.capabilities?.some(c => filterCapabilities.includes(c.toLowerCase()))
        );
      }

      if (models.length > 0) {
        result[provider] = models.map(m => ({
          ...m,
          provider, // Include provider for convenience
        }));
      }
    }

    res.json({
      models: result,
      // Flatten for convenience
      all: Object.entries(result).flatMap(([provider, models]) =>
        models.map(m => ({ ...m, provider }))
      ),
    });
  });

  // ==========================================================================
  // Integration Registry Endpoints
  // ==========================================================================

  // Initialize builtin integrations on startup
  initializeBuiltinIntegrations();

  // Register a new integration (from OpenAPI spec or MCP server)
  app.post("/api/integrations/register", authMiddleware, async (req: Request, res: Response) => {
    const integration = req.body as Integration;

    if (!integration.key || !integration.type) {
      res.status(400).json({ error: "Integration key and type are required" });
      return;
    }

    const result = await integrationRegistry.register(integration);

    if (result.success) {
      res.json({
        success: true,
        integration: integrationRegistry.get(integration.key),
        operationCount: result.operationCount,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  });

  // List all registered integrations
  app.get("/api/integrations/registry", authMiddleware, async (_req: Request, res: Response) => {
    const integrations = integrationRegistry.getAll();
    res.json({ integrations });
  });

  // Get a specific integration
  app.get("/api/integrations/registry/:key", authMiddleware, async (req: Request, res: Response) => {
    const key = getParam(req.params, 'key');
    const integration = integrationRegistry.get(key);

    if (!integration) {
      res.status(404).json({ error: `Integration not found: ${key}` });
      return;
    }

    res.json({ integration });
  });

  // Get operations for an integration
  app.get("/api/integrations/registry/:key/operations", authMiddleware, async (req: Request, res: Response) => {
    const key = getParam(req.params, 'key');
    const operations = integrationRegistry.listOperations(key);

    if (operations.length === 0) {
      const integration = integrationRegistry.get(key);
      if (!integration) {
        res.status(404).json({ error: `Integration not found: ${key}` });
        return;
      }
    }

    res.json({ operations });
  });

  // Get the full namespace tree
  app.get("/api/integrations/namespace", authMiddleware, async (_req: Request, res: Response) => {
    const namespace = integrationRegistry.getFullNamespace();
    res.json(namespace);
  });

  // Search operations across all integrations
  app.get("/api/integrations/operations/search", authMiddleware, async (req: Request, res: Response) => {
    const { q, tag } = req.query;

    let results;
    if (tag && typeof tag === "string") {
      results = integrationRegistry.getOperationsByTag(tag);
    } else if (q && typeof q === "string") {
      results = integrationRegistry.searchOperations(q);
    } else {
      res.status(400).json({ error: "Query parameter 'q' or 'tag' is required" });
      return;
    }

    res.json({ results });
  });

  // Invoke an integration operation
  app.post("/api/integrations/invoke", authMiddleware, rateLimitMiddleware, async (req: Request, res: Response) => {
    const startTime = Date.now();
    const requestId = `inv_${randomUUID().slice(0, 12)}`;
    const user = (req as any).user;
    const token = (req as any).token;

    try {
      const request = req.body as IntegrationInvokeRequest;

      if (!request.operation) {
        res.status(400).json({
          success: false,
          error: "Operation path is required",
          requestId,
          durationMs: Date.now() - startTime,
        });
        return;
      }

      // Lookup the operation
      const lookup = integrationRegistry.lookupOperation(request.operation);
      if (!lookup) {
        res.status(404).json({
          success: false,
          error: `Operation not found: ${request.operation}`,
          requestId,
          durationMs: Date.now() - startTime,
        });
        return;
      }

      const { integration, operation } = lookup;

      // For builtin LLM integrations, route to existing execute logic
      if (integration.type === "builtin" && ["openai", "anthropic", "google", "mistral", "cohere", "huggingface"].includes(integration.key)) {
        // Map to existing provider execution
        const provider = getProvider(integration.key);
        if (!provider) {
          res.status(500).json({
            success: false,
            error: `Provider not found: ${integration.key}`,
            requestId,
            durationMs: Date.now() - startTime,
          });
          return;
        }

        // Get credential
        const credential = await getCredential(user.id, user.orgId, integration.key, token);
        if (!credential) {
          res.status(400).json({
            success: false,
            error: `No ${integration.key} API key configured`,
            requestId,
            durationMs: Date.now() - startTime,
          });
          return;
        }

        // Determine operation type from operation ID
        let opType = "chat.completions";
        if (operation.id.includes("embed")) {
          opType = "embeddings";
        } else if (operation.id.includes("messages")) {
          opType = "messages";
        }

        // Execute via provider
        const body = request.body as Record<string, unknown> || {};
        const executeOptions = {
          operation: opType,
          model: body.model as string || "",
          params: body,
          apiKey: credential.apiKey,
          timeout: request.timeout || 60000,
        };

        const data = opType === "embeddings" && provider.embed
          ? await provider.embed(executeOptions)
          : await provider.execute(executeOptions);

        const durationMs = Date.now() - startTime;

        // Log proxy usage if using org-wide credential
        await logProxyUsage({
          userId: user.id,
          orgId: user.orgId,
          integrationKey: integration.key,
          operation: request.operation,
          credential,
          requestId,
          success: true,
          durationMs,
          inputTokens: data.usage?.promptTokens,
          outputTokens: 'completionTokens' in data.usage ? data.usage.completionTokens : undefined,
          totalTokens: data.usage?.totalTokens,
        });

        res.json({
          success: true,
          data,
          requestId,
          durationMs,
          operation: request.operation,
          integration: integration.key,
        });
        return;
      }

      // For OpenAPI integrations, make the HTTP call
      if (integration.type === "openapi" && operation.method && operation.path) {
        // Extract server URL from config or spec
        let serverUrl = integration.openapi?.serverUrl;
        if (!serverUrl && integration.openapi?.spec) {
          const spec = integration.openapi.spec as { servers?: Array<{ url: string }> };
          serverUrl = spec.servers?.[0]?.url;
        }
        if (!serverUrl) {
          res.status(500).json({
            success: false,
            error: "No server URL configured for integration",
            requestId,
            durationMs: Date.now() - startTime,
          });
          return;
        }

        // Build URL with path parameters
        let url = `${serverUrl}${operation.path}`;
        const params = request.params || {};
        for (const [key, value] of Object.entries(params)) {
          url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
        }

        // Add query parameters
        const queryParams = operation.parameters?.filter(p => p.location === "query") || [];
        const queryString = queryParams
          .filter(p => params[p.name] !== undefined)
          .map(p => `${p.name}=${encodeURIComponent(String(params[p.name]))}`)
          .join("&");
        if (queryString) {
          url += `?${queryString}`;
        }

        // Get credential if auth is configured
        let authHeaders: Record<string, string> = {};
        let credential: Awaited<ReturnType<typeof getCredential>> = null;
        if (integration.auth && integration.auth.type !== "none") {
          credential = await getCredential(user.id, user.orgId, integration.key, token);
          if (credential?.apiKey) {
            if (integration.auth.type === "bearer") {
              authHeaders["Authorization"] = `Bearer ${credential.apiKey}`;
            } else if (integration.auth.type === "apiKey") {
              const header = (integration.auth as any).header || "X-API-Key";
              authHeaders[header] = credential.apiKey;
            }
          }
        }

        // Make the request
        const response = await fetch(url, {
          method: operation.method,
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
            ...request.headers,
          },
          body: operation.method !== "GET" && operation.method !== "HEAD"
            ? JSON.stringify(request.body)
            : undefined,
          signal: request.timeout ? AbortSignal.timeout(request.timeout) : undefined,
        });

        const responseData = await response.json().catch(() => null);
        const durationMs = Date.now() - startTime;

        // Log proxy usage if using org-wide credential
        if (credential) {
          await logProxyUsage({
            userId: user.id,
            orgId: user.orgId,
            integrationKey: integration.key,
            operation: request.operation,
            credential,
            requestId,
            success: response.ok,
            statusCode: response.status,
            durationMs,
          });
        }

        res.json({
          success: response.ok,
          data: responseData,
          statusCode: response.status,
          requestId,
          durationMs,
          operation: request.operation,
          integration: integration.key,
        });
        return;
      }

      // For MCP integrations, use the MCP executor
      if (integration.type === "mcp") {
        // Ensure MCP server is registered
        if (integration.mcp) {
          mcpExecutor.registerServer(integration.key, integration.mcp);
        }

        const context: ExecutionContext = {
          requestId,
          userId: user.id,
          orgId: user.orgId,
          authToken: token,
          timeout: request.timeout || 30000,
        };

        try {
          const result = await mcpExecutor.execute({
            operation,
            integrationKey: integration.key,
            params: request.body as Record<string, unknown> || {},
            context,
          });

          const durationMs = Date.now() - startTime;

          res.json({
            success: true,
            data: result.data,
            type: result.type,
            requestId,
            durationMs,
            operation: request.operation,
            integration: integration.key,
          });
          return;
        } catch (error) {
          const durationMs = Date.now() - startTime;
          const classified = error instanceof IntegrationError
            ? error
            : classifyProviderError(error, integration.key, operation.id);

          res.status(classified.statusCode).json({
            ...classified.toResponse(),
            requestId,
            durationMs,
            operation: request.operation,
            integration: integration.key,
          });
          return;
        }
      }

      const notSupportedError = new IntegrationError({
        message: `Unsupported integration type: ${integration.type}`,
        category: "validation",
      });
      res.status(notSupportedError.statusCode).json({
        ...notSupportedError.toResponse(),
        requestId,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      console.error("[integrations] Invoke error:", error);

      const classified = error instanceof IntegrationError
        ? error
        : new IntegrationError({
            message: error instanceof Error ? error.message : "Internal error",
            category: "internal",
            cause: error instanceof Error ? error : undefined,
          });

      res.status(classified.statusCode).json({
        ...classified.toResponse(),
        requestId,
        durationMs: Date.now() - startTime,
      });
    }
  });

  // Parse an OpenAPI spec (for preview before registering)
  app.post("/api/integrations/parse/openapi", authMiddleware, async (req: Request, res: Response) => {
    const { specUrl, spec, serverUrl } = req.body;

    const result = await fetchAndParseOpenAPI({ specUrl, spec, serverUrl });

    if (result.success) {
      res.json({
        success: true,
        operations: result.operations,
        namespace: result.namespace,
        info: result.info,
        authType: result.authType,
        serverUrl: result.serverUrl,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  });

  // Discover an MCP server (for preview before registering)
  app.post("/api/integrations/parse/mcp", authMiddleware, async (req: Request, res: Response) => {
    const config = req.body;

    const result = await discoverMCPServer(config);

    if (result.success) {
      res.json({
        success: true,
        operations: result.operations,
        namespace: result.namespace,
        capabilities: result.capabilities,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  });

  // Refresh an integration (re-fetch spec and update operations)
  app.post("/api/integrations/registry/:key/refresh", authMiddleware, async (req: Request, res: Response) => {
    const key = getParam(req.params, 'key');

    const result = await integrationRegistry.refresh(key);

    if (result.success) {
      res.json({
        success: true,
        integration: integrationRegistry.get(key),
        operationCount: result.operationCount,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  });

  // ==========================================================================
  // MCP Server Endpoints (Expose integrations as MCP server)
  // ==========================================================================

  // MCP JSON-RPC endpoint (HTTP transport)
  // Clients can POST MCP requests here to discover and invoke tools
  app.post("/api/integrations/mcp", authMiddleware, createMCPHttpHandler());

  // MCP server info (non-standard helper endpoint)
  app.get("/api/integrations/mcp/info", async (_req: Request, res: Response) => {
    const tools = integrationRegistry.getAll().flatMap(i =>
      (i.operations || []).map(op => ({
        integration: i.key,
        operation: op.id,
        description: op.summary || op.description,
        tags: op.tags,
      }))
    );

    res.json({
      server: {
        name: "symbia-integrations",
        version: "1.0.0",
        protocol: "2024-11-05",
      },
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
      },
      toolCount: tools.length,
      tools: tools.slice(0, 50), // First 50 for preview
    });
  });

  // ==========================================================================
  // MCP Client Helpers (Connect to external MCP servers)
  // ==========================================================================

  // Register an MCP server as an integration (e.g., Moltbot)
  app.post("/api/integrations/mcp/register", authMiddleware, async (req: Request, res: Response) => {
    const {
      key,
      name,
      description,
      transport,
      command,
      args,
      serverUrl,
      env,
    } = req.body;

    if (!key || !transport) {
      res.status(400).json({
        success: false,
        error: "key and transport are required",
      });
      return;
    }

    // Build MCP config
    const mcpConfig = {
      transport: transport as "stdio" | "http" | "websocket",
      command,
      args,
      serverUrl,
      env,
    };

    // Discover the server's capabilities
    const discovery = await discoverMCPServer(mcpConfig);
    if (!discovery.success) {
      res.status(400).json({
        success: false,
        error: `Failed to connect to MCP server: ${discovery.error}`,
      });
      return;
    }

    // Register as integration
    const integration = {
      id: `mcp-${key}`,
      key,
      name: name || key,
      description: description || `MCP server: ${key}`,
      type: "mcp" as const,
      mcp: mcpConfig,
      operations: discovery.operations,
      namespace: discovery.namespace,
      status: "active" as const,
      version: 1,
    };

    const result = await integrationRegistry.register(integration);

    if (result.success) {
      res.json({
        success: true,
        integration: integrationRegistry.get(key),
        operationCount: result.operationCount,
        capabilities: discovery.capabilities,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  });

  // ==========================================================================
  // OAuth Integration Endpoints
  // ==========================================================================

  // Initialize OAuth providers and service
  initializeOAuthProviders();
  const oauthStorage = createOAuthStorage(db);
  const oauthService = new OAuthService(oauthStorage);

  /**
   * GET /api/oauth/providers
   * List available OAuth providers
   */
  app.get("/api/oauth/providers", authMiddleware, async (req: Request, res: Response) => {
    const user = (req as any).user;

    try {
      const providers = await oauthService.getAvailableProviders(user.id);
      res.json({ providers });
    } catch (error) {
      console.error("[oauth] Error listing providers:", error);
      res.status(500).json({ error: "Failed to list OAuth providers" });
    }
  });

  /**
   * POST /api/oauth/authorize
   * Initiate OAuth flow - returns authorization URL
   */
  app.post("/api/oauth/authorize", authMiddleware, async (req: Request, res: Response) => {
    const user = (req as any).user;

    try {
      const parseResult = oauthAuthorizeRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors,
        });
        return;
      }

      const request: OAuthAuthorizeRequest = parseResult.data;
      const result = await oauthService.authorize(request, user.id, user.orgId);

      res.json(result);
    } catch (error) {
      if (error instanceof OAuthError) {
        res.status(400).json({
          error: error.message,
          code: error.code,
          details: error.details,
        });
        return;
      }
      console.error("[oauth] Authorization error:", error);
      res.status(500).json({ error: "Failed to initiate OAuth flow" });
    }
  });

  /**
   * GET /api/oauth/callback
   * Handle OAuth callback from provider
   * This endpoint is called by the OAuth provider after user authorizes
   */
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const { code, state, error, error_description } = req.query;

    // Handle OAuth error from provider
    if (error) {
      const redirectUrl = process.env.OAUTH_ERROR_REDIRECT_URL ||
        process.env.WEBSITE_URL ||
        "http://localhost:3000";
      const errorParams = new URLSearchParams({
        error: String(error),
        error_description: String(error_description || ""),
      });
      res.redirect(`${redirectUrl}/oauth/error?${errorParams}`);
      return;
    }

    if (!code || !state) {
      res.status(400).json({
        error: "Missing code or state parameter",
      });
      return;
    }

    try {
      const result = await oauthService.handleCallback(
        String(code),
        String(state)
      );

      // Redirect to the original redirect URI with success
      const successParams = new URLSearchParams({
        success: "true",
        provider: result.connection.provider,
        connection_id: result.connection.id,
      });

      if (result.clientState) {
        successParams.set("state", result.clientState);
      }

      res.redirect(`${result.redirectUri}?${successParams}`);
    } catch (error) {
      console.error("[oauth] Callback error:", error);

      const redirectUrl = process.env.OAUTH_ERROR_REDIRECT_URL ||
        process.env.WEBSITE_URL ||
        "http://localhost:3000";

      const errorMessage = error instanceof OAuthError
        ? error.message
        : "OAuth callback failed";

      const errorParams = new URLSearchParams({
        error: "callback_failed",
        error_description: errorMessage,
      });

      res.redirect(`${redirectUrl}/oauth/error?${errorParams}`);
    }
  });

  /**
   * GET /api/oauth/connections
   * List user's OAuth connections
   */
  app.get("/api/oauth/connections", authMiddleware, async (req: Request, res: Response) => {
    const user = (req as any).user;

    try {
      const connections = await oauthService.getConnections(user.id, user.orgId);
      res.json({ connections });
    } catch (error) {
      console.error("[oauth] Error listing connections:", error);
      res.status(500).json({ error: "Failed to list OAuth connections" });
    }
  });

  /**
   * DELETE /api/oauth/connections/:id
   * Revoke an OAuth connection
   */
  app.delete("/api/oauth/connections/:id", authMiddleware, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const id = getParam(req.params, 'id');

    try {
      await oauthService.revokeConnection(id, user.id);
      res.json({ success: true, message: "Connection revoked" });
    } catch (error) {
      if (error instanceof OAuthError) {
        const statusCode = error.code === "connection_not_found" ? 404 :
                          error.code === "not_authorized" ? 403 : 400;
        res.status(statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }
      console.error("[oauth] Error revoking connection:", error);
      res.status(500).json({ error: "Failed to revoke connection" });
    }
  });

  // ==========================================================================
  // Proxy Usage Endpoints (Org Admin)
  // ==========================================================================

  // Get usage summary for the org
  app.get("/api/integrations/usage", authMiddleware, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { days = "30", integration } = req.query;

    try {
      const daysNum = parseInt(days as string) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysNum);

      // Build query conditions
      const conditions = [
        sql`${proxyUsage.orgId} = ${user.orgId}`,
        sql`${proxyUsage.timestamp} >= ${startDate}`,
      ];

      if (integration) {
        conditions.push(sql`${proxyUsage.integrationKey} = ${integration}`);
      }

      // Get summary stats
      const summary = await db
        .select({
          totalRequests: sql<number>`count(*)::int`,
          successCount: sql<number>`sum(case when ${proxyUsage.success} then 1 else 0 end)::int`,
          errorCount: sql<number>`sum(case when not ${proxyUsage.success} then 1 else 0 end)::int`,
          totalTokens: sql<number>`coalesce(sum(${proxyUsage.totalTokens}), 0)::int`,
          totalCostMicros: sql<number>`coalesce(sum(${proxyUsage.estimatedCostMicros}), 0)::int`,
          avgDurationMs: sql<number>`coalesce(avg(${proxyUsage.durationMs}), 0)::int`,
          uniqueUsers: sql<number>`count(distinct ${proxyUsage.userId})::int`,
        })
        .from(proxyUsage)
        .where(and(...conditions));

      // Get usage by integration
      const byIntegration = await db
        .select({
          integrationKey: proxyUsage.integrationKey,
          requestCount: sql<number>`count(*)::int`,
          totalTokens: sql<number>`coalesce(sum(${proxyUsage.totalTokens}), 0)::int`,
        })
        .from(proxyUsage)
        .where(and(...conditions))
        .groupBy(proxyUsage.integrationKey)
        .orderBy(sql`count(*) desc`);

      // Get usage by user
      const byUser = await db
        .select({
          userId: proxyUsage.userId,
          requestCount: sql<number>`count(*)::int`,
          totalTokens: sql<number>`coalesce(sum(${proxyUsage.totalTokens}), 0)::int`,
        })
        .from(proxyUsage)
        .where(and(...conditions))
        .groupBy(proxyUsage.userId)
        .orderBy(sql`count(*) desc`)
        .limit(20);

      res.json({
        period: { days: daysNum, startDate: startDate.toISOString() },
        summary: summary[0] || {
          totalRequests: 0,
          successCount: 0,
          errorCount: 0,
          totalTokens: 0,
          totalCostMicros: 0,
          avgDurationMs: 0,
          uniqueUsers: 0,
        },
        byIntegration,
        byUser,
      });
    } catch (error) {
      console.error("[integrations] Usage query error:", error);
      res.status(500).json({ error: "Failed to fetch usage data" });
    }
  });

  // Get detailed usage logs
  app.get("/api/integrations/usage/logs", authMiddleware, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { days = "7", integration, userId: filterUserId, limit: limitStr = "100", offset: offsetStr = "0" } = req.query;

    try {
      const daysNum = parseInt(days as string) || 7;
      const limitNum = Math.min(parseInt(limitStr as string) || 100, 500);
      const offsetNum = parseInt(offsetStr as string) || 0;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysNum);

      // Build query conditions
      const conditions = [
        sql`${proxyUsage.orgId} = ${user.orgId}`,
        sql`${proxyUsage.timestamp} >= ${startDate}`,
      ];

      if (integration) {
        conditions.push(sql`${proxyUsage.integrationKey} = ${integration}`);
      }

      if (filterUserId) {
        conditions.push(sql`${proxyUsage.userId} = ${filterUserId}`);
      }

      const logs = await db
        .select()
        .from(proxyUsage)
        .where(and(...conditions))
        .orderBy(sql`${proxyUsage.timestamp} desc`)
        .limit(limitNum)
        .offset(offsetNum);

      res.json({ logs, limit: limitNum, offset: offsetNum });
    } catch (error) {
      console.error("[integrations] Usage logs query error:", error);
      res.status(500).json({ error: "Failed to fetch usage logs" });
    }
  });

  // Get usage grouped by user (for admin dashboard)
  app.get("/api/integrations/usage/by-user", authMiddleware, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { days = "30", integration } = req.query;

    try {
      const daysNum = parseInt(days as string) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysNum);

      // Build query conditions
      const conditions = [
        sql`${proxyUsage.orgId} = ${user.orgId}`,
        sql`${proxyUsage.timestamp} >= ${startDate}`,
      ];

      if (integration) {
        conditions.push(sql`${proxyUsage.integrationKey} = ${integration}`);
      }

      const byUser = await db
        .select({
          userId: proxyUsage.userId,
          requestCount: sql<number>`count(*)::int`,
          successCount: sql<number>`sum(case when ${proxyUsage.success} then 1 else 0 end)::int`,
          errorCount: sql<number>`sum(case when not ${proxyUsage.success} then 1 else 0 end)::int`,
          totalTokens: sql<number>`coalesce(sum(${proxyUsage.totalTokens}), 0)::int`,
          totalCostMicros: sql<number>`coalesce(sum(${proxyUsage.estimatedCostMicros}), 0)::int`,
          avgDurationMs: sql<number>`coalesce(avg(${proxyUsage.durationMs}), 0)::int`,
          lastUsedAt: sql<string>`max(${proxyUsage.timestamp})`,
        })
        .from(proxyUsage)
        .where(and(...conditions))
        .groupBy(proxyUsage.userId)
        .orderBy(sql`count(*) desc`);

      res.json({ users: byUser });
    } catch (error) {
      console.error("[integrations] Usage by-user query error:", error);
      res.status(500).json({ error: "Failed to fetch usage data" });
    }
  });

  // ==========================================================================
  // Capabilities Endpoint (SOR for UI)
  // ==========================================================================

  /**
   * GET /api/integrations/capabilities
   *
   * Returns comprehensive provider capabilities including:
   * - All available providers with their supported operations
   * - All models for each provider (grouped by capability)
   * - User's access status for each provider
   * - Models grouped by purpose for easy UI consumption
   *
   * This is the authoritative source (SOR) for what the user can access.
   */
  app.get("/api/integrations/capabilities", authMiddleware, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const token = (req as any).token;

    try {
      const providers = getRegisteredProviders();
      const providerCapabilities: any[] = [];
      const byProvider: Record<string, any> = {};
      const modelsByPurpose = {
        chat: [] as { provider: string; model: any }[],
        embedding: [] as { provider: string; model: any }[],
        vision: [] as { provider: string; model: any }[],
        reasoning: [] as { provider: string; model: any }[],
      };

      for (const providerName of providers) {
        const config = getProviderConfig(providerName);
        const adapter = getProvider(providerName);

        // Check if user has credentials for this provider
        let hasCredential = false;
        let credentialSource: 'personal' | 'org-wide' | 'none' = 'none';
        let apiKey: string | undefined;

        try {
          const credential = await getCredential(user.id, user.orgId, providerName, token);
          if (credential?.apiKey) {
            hasCredential = true;
            apiKey = credential.apiKey;
            credentialSource = credential.isProxy ? 'org-wide' : 'personal';
          }
        } catch {
          // No credential available
        }

        // Get models for this provider
        let models = await getModelsForProvider(providerName, apiKey);

        // Build provider capability object
        const capability = {
          provider: providerName,
          name: providerName.charAt(0).toUpperCase() + providerName.slice(1),
          description: getProviderDescription(providerName),
          baseUrl: config?.baseUrl || '',
          defaultModel: config?.defaultModel || '',
          supportedOperations: adapter?.supportedOperations || config?.supportedOperations || [],
          models,
          access: {
            hasCredential,
            credentialSource,
            isEnabled: hasCredential,
            lastUsedAt: null,
          },
          rateLimits: config?.rateLimits,
          status: hasCredential ? 'available' : 'unavailable',
          statusMessage: hasCredential ? undefined : 'No API key configured',
        };

        providerCapabilities.push(capability);
        byProvider[providerName] = capability;

        // Group models by purpose
        for (const model of models) {
          const caps = model.capabilities || [];

          if (caps.includes('chat') || caps.includes('reasoning')) {
            modelsByPurpose.chat.push({ provider: providerName, model });
          }
          if (caps.includes('embedding')) {
            modelsByPurpose.embedding.push({ provider: providerName, model });
          }
          if (caps.includes('vision')) {
            modelsByPurpose.vision.push({ provider: providerName, model });
          }
          if (caps.includes('reasoning')) {
            modelsByPurpose.reasoning.push({ provider: providerName, model });
          }
        }
      }

      // Sort models by provider popularity/preference
      const providerPriority = ['openai', 'anthropic', 'google', 'mistral', 'cohere', 'huggingface'];
      for (const purpose of Object.keys(modelsByPurpose) as (keyof typeof modelsByPurpose)[]) {
        modelsByPurpose[purpose].sort((a, b) => {
          const aIdx = providerPriority.indexOf(a.provider);
          const bIdx = providerPriority.indexOf(b.provider);
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        });
      }

      res.json({
        providers: providerCapabilities,
        byProvider,
        modelsByPurpose,
        defaults: {
          chatProvider: 'openai',
          chatModel: 'gpt-4o-mini',
          embeddingProvider: 'openai',
          embeddingModel: 'text-embedding-3-small',
        },
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[integrations] Capabilities error:", error);
      res.status(500).json({ error: "Failed to fetch capabilities" });
    }
  });

  // ==========================================================================
  // Status Endpoint
  // ==========================================================================

  app.get("/api/integrations/status", async (req: Request, res: Response) => {
    const providers = getRegisteredProviders();
    const configs = getAllProviderConfigs();

    res.json({
      status: "healthy",
      providers: providers.map(p => ({
        name: p,
        configured: configs.some(c => c.provider === p),
      })),
      circuitBreaker: circuitBreaker.getStatus(),
    });
  });

  // Circuit breaker status and management
  app.get("/api/integrations/circuit-breaker", authMiddleware, async (_req: Request, res: Response) => {
    res.json({
      status: circuitBreaker.getStatus(),
      description: "Circuit breaker protects against cascading failures. Open circuits reject requests until recovery.",
    });
  });

  app.post("/api/integrations/circuit-breaker/reset/:provider", authMiddleware, async (req: Request, res: Response) => {
    const provider = getParam(req.params, 'provider');
    circuitBreaker.reset(provider);
    res.json({
      success: true,
      message: `Circuit breaker reset for ${provider}`,
      status: circuitBreaker.getStatus(),
    });
  });

  app.post("/api/integrations/circuit-breaker/reset", authMiddleware, async (_req: Request, res: Response) => {
    circuitBreaker.resetAll();
    res.json({
      success: true,
      message: "All circuit breakers reset",
      status: circuitBreaker.getStatus(),
    });
  });

  // Stats endpoint for platform health monitoring
  app.get("/api/stats", async (_req: Request, res: Response) => {
    try {
      const providers = getRegisteredProviders();
      const configs = getAllProviderConfigs();
      const integrations = integrationRegistry.getAll();

      res.json({
        totalProviders: providers.length,
        configuredProviders: configs.length,
        totalIntegrations: integrations.length,
      });
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  // Debug endpoint to help diagnose credential issues
  app.get("/api/integrations/debug", authMiddleware, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const token = (req as any).token;

    // Try to get credential for openai
    const credential = await getCredential(user.id, user.orgId, "openai", token);

    res.json({
      auth: {
        userId: user.id,
        userType: user.type,
        orgId: user.orgId,
        headerOrgId: req.headers['x-org-id'],
      },
      credentialLookup: {
        found: !!credential,
        hasApiKey: !!credential?.apiKey,
      },
    });
  });

  // ==========================================================================
  // Model Evaluation Endpoints
  // ==========================================================================

  // Initialize model-eval system (benchmarks, etc.)
  await initializeModelEvalSystem();

  // Mount model-eval routes
  const evalRoutes = createEvalRoutes(db);
  app.use("/api/model-eval", evalRoutes);

  // ==========================================================================
  // Documentation Endpoints
  // ==========================================================================

  app.get("/", (_req: Request, res: Response) => {
    res.redirect(302, "/docs/llms.txt");
  });

  app.get("/api/docs", (_req: Request, res: Response) => {
    res.redirect("/openapi.json");
  });

  app.get("/openapi.json", (_req: Request, res: Response) => {
    res.json(apiDocumentation);
  });

  app.get("/.well-known/openapi.json", (_req: Request, res: Response) => {
    res.json(apiDocumentation);
  });

  app.get("/llms.txt", (_req: Request, res: Response) => {
    try {
      const content = readFileSync(join(docsDir, "llms.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });

  app.get("/llm.txt", (_req: Request, res: Response) => {
    try {
      const content = readFileSync(join(docsDir, "llms.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });

  app.get("/llms-full.txt", (_req: Request, res: Response) => {
    try {
      const content = readFileSync(join(docsDir, "llms-full.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });

  app.get("/docs/openapi.json", (_req: Request, res: Response) => {
    res.json(apiDocumentation);
  });

  app.get("/docs/llms.txt", (_req: Request, res: Response) => {
    try {
      const content = readFileSync(join(docsDir, "llms.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });

  app.get("/docs/llms-full.txt", (_req: Request, res: Response) => {
    try {
      const content = readFileSync(join(docsDir, "llms-full.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });

  // ===========================================================================
  // Database Management Routes (for in-memory database)
  // ===========================================================================

  /**
   * POST /api/integrations/db/export
   * Export in-memory database to a file
   * Requires authentication - sensitive admin operation
   */
  app.post("/api/integrations/db/export", authMiddleware, async (_req: Request, res: Response) => {
    const { exportToFile, isMemory } = await import("./db.js");

    if (!isMemory) {
      return res.json({
        success: false,
        message: "Database is using PostgreSQL - no export needed, data persists automatically"
      });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const exportPath = join(process.cwd(), "data", `model-eval-backup-${timestamp}.json`);

    const success = exportToFile(exportPath);

    if (success) {
      res.json({
        success: true,
        path: exportPath,
        message: "Database exported successfully"
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to export database"
      });
    }
  });

  /**
   * GET /api/integrations/db/status
   * Get database status
   * Requires authentication - exposes database configuration
   */
  app.get("/api/integrations/db/status", authMiddleware, async (_req: Request, res: Response) => {
    const { isMemory } = await import("./db.js");
    res.json({
      isMemory,
      persistsOnRestart: !isMemory,
      recommendation: isMemory
        ? "Set DATABASE_URL environment variable for persistent storage, or call POST /api/integrations/db/export before shutdown"
        : "Data persists automatically in PostgreSQL"
    });
  });
}

/**
 * Log execution to database
 */
async function logExecution(data: {
  userId: string;
  orgId?: string;
  provider: string;
  operation: string;
  model: string;
  requestId: string;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(executionLogs).values({
      id: randomUUID(),
      userId: data.userId,
      orgId: data.orgId,
      provider: data.provider,
      operation: data.operation,
      model: data.model,
      requestId: data.requestId,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      durationMs: data.durationMs,
      success: data.success,
      errorMessage: data.errorMessage,
      promptTokens: data.promptTokens,
      completionTokens: data.completionTokens,
      totalTokens: data.totalTokens,
      metadata: data.metadata,
    });
  } catch (error) {
    console.error("[integrations] Failed to log execution:", error);
  }
}

/**
 * Log proxy usage when org-wide credentials are used.
 * This enables org admins to track per-user usage of shared credentials.
 */
/**
 * Get human-readable description for a provider
 */
function getProviderDescription(provider: string): string {
  const descriptions: Record<string, string> = {
    openai: 'OpenAI GPT models including GPT-4o, GPT-5.2, o3, and o4 series',
    anthropic: 'Anthropic Claude models with advanced reasoning and long context',
    google: 'Google Gemini models with multimodal capabilities',
    mistral: 'Mistral AI models optimized for efficiency and multilingual support',
    cohere: 'Cohere models specialized for enterprise search and RAG',
    huggingface: 'Open-source models via Hugging Face Inference API',
  };
  return descriptions[provider] || `${provider} integration`;
}

async function logProxyUsage(data: {
  userId: string;
  orgId: string;
  integrationKey: string;
  operation: string;
  credential: CredentialLookup;
  requestId: string;
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostMicros?: number;
}): Promise<void> {
  // Only log if using a proxy (org-wide) credential
  if (!data.credential.isProxy) {
    return;
  }

  try {
    await db.insert(proxyUsage).values({
      id: randomUUID(),
      userId: data.userId,
      orgId: data.orgId,
      integrationKey: data.integrationKey,
      operation: data.operation,
      credentialId: data.credential.credentialId,
      requestId: data.requestId,
      success: data.success,
      statusCode: data.statusCode,
      errorMessage: data.errorMessage,
      durationMs: data.durationMs,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.totalTokens,
      estimatedCostMicros: data.estimatedCostMicros,
    });
    console.log(`[integrations] Logged proxy usage - user: ${data.userId}, org: ${data.orgId}, integration: ${data.integrationKey}`);
  } catch (error) {
    console.error("[integrations] Failed to log proxy usage:", error);
  }
}
