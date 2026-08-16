var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../integrations/shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  capabilitiesResponseSchema: () => capabilitiesResponseSchema,
  channelAttachmentSchema: () => channelAttachmentSchema,
  channelCapabilitiesSchema: () => channelCapabilitiesSchema,
  channelChatSchema: () => channelChatSchema,
  channelConfigSchema: () => channelConfigSchema,
  channelConnectionModeSchema: () => channelConnectionModeSchema,
  channelConnectionStatusSchema: () => channelConnectionStatusSchema,
  channelConnections: () => channelConnections,
  channelFormattingSchema: () => channelFormattingSchema,
  channelInboundMessageSchema: () => channelInboundMessageSchema,
  channelMessageFormattingSchema: () => channelMessageFormattingSchema,
  channelOutboundMessageSchema: () => channelOutboundMessageSchema,
  channelSenderSchema: () => channelSenderSchema,
  channelStatusEventSchema: () => channelStatusEventSchema,
  channelTypeSchema: () => channelTypeSchema,
  credentialMetadataSchema: () => credentialMetadataSchema,
  executeParamsSchema: () => executeParamsSchema,
  executeRequestSchema: () => executeRequestSchema,
  executeResponseSchema: () => executeResponseSchema,
  executionLogs: () => executionLogs,
  finishReasonSchema: () => finishReasonSchema,
  integrationAuthSchema: () => integrationAuthSchema,
  integrationInvokeRequestSchema: () => integrationInvokeRequestSchema,
  integrationInvokeResponseSchema: () => integrationInvokeResponseSchema,
  integrationOperationSchema: () => integrationOperationSchema,
  integrationSchema: () => integrationSchema,
  integrations: () => integrations,
  mcpConfigSchema: () => mcpConfigSchema,
  modelCapabilitySchema: () => modelCapabilitySchema,
  modelConfigSchema: () => modelConfigSchema,
  normalizedEmbeddingResponseSchema: () => normalizedEmbeddingResponseSchema,
  normalizedLLMResponseSchema: () => normalizedLLMResponseSchema,
  oauthAuthorizeRequestSchema: () => oauthAuthorizeRequestSchema,
  oauthAuthorizeResponseSchema: () => oauthAuthorizeResponseSchema,
  oauthConnectionSchema: () => oauthConnectionSchema,
  oauthConnections: () => oauthConnections,
  oauthProviderConfigSchema: () => oauthProviderConfigSchema,
  oauthProviderConfigs: () => oauthProviderConfigs,
  oauthStates: () => oauthStates,
  oauthTokenResponseSchema: () => oauthTokenResponseSchema,
  oauthUserInfoSchema: () => oauthUserInfoSchema,
  openAPIConfigSchema: () => openAPIConfigSchema,
  operationParameterSchema: () => operationParameterSchema,
  operationSchema: () => operationSchema,
  parameterLocationSchema: () => parameterLocationSchema,
  providerCapabilitySchema: () => providerCapabilitySchema,
  providerConfigSchema: () => providerConfigSchema,
  providerSchema: () => providerSchema,
  proxyUsage: () => proxyUsage,
  proxyUsageSummarySchema: () => proxyUsageSummarySchema,
  rateLimitConfigSchema: () => rateLimitConfigSchema,
  toolCallSchema: () => toolCallSchema,
  usageSchema: () => usageSchema
});
import { z } from "zod";
import { pgTable, varchar, text, integer, boolean, timestamp, json, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
var providerSchema, operationSchema, finishReasonSchema, usageSchema, toolCallSchema, normalizedLLMResponseSchema, normalizedEmbeddingResponseSchema, executeParamsSchema, executeRequestSchema, executeResponseSchema, providerConfigSchema, modelCapabilitySchema, modelConfigSchema, executionLogs, credentialMetadataSchema, integrationAuthSchema, parameterLocationSchema, operationParameterSchema, integrationOperationSchema, openAPIConfigSchema, mcpConfigSchema, rateLimitConfigSchema, integrationSchema, integrationInvokeRequestSchema, integrationInvokeResponseSchema, integrations, proxyUsage, proxyUsageSummarySchema, providerCapabilitySchema, capabilitiesResponseSchema, channelTypeSchema, channelConnectionModeSchema, channelConnectionStatusSchema, channelCapabilitiesSchema, channelFormattingSchema, channelConfigSchema, channelAttachmentSchema, channelSenderSchema, channelChatSchema, channelInboundMessageSchema, channelMessageFormattingSchema, channelOutboundMessageSchema, channelStatusEventSchema, channelConnections, oauthProviderConfigSchema, oauthTokenResponseSchema, oauthUserInfoSchema, oauthAuthorizeRequestSchema, oauthAuthorizeResponseSchema, oauthConnectionSchema, oauthProviderConfigs, oauthStates, oauthConnections;
var init_schema = __esm({
  "../../integrations/shared/schema.ts"() {
    "use strict";
    providerSchema = z.enum([
      "openai",
      "anthropic",
      "huggingface",
      "symbia-labs"
    ]);
    operationSchema = z.enum([
      "chat.completions",
      "responses",
      // OpenAI Responses API (stateful)
      "messages",
      // Anthropic native
      "text.generation",
      // Vision. A distinct operation so a provider can reject a request that
      // carries no image, rather than returning a confident description of a
      // picture it never received — chat.completions cannot detect that, because
      // a text-only message is perfectly legal there.
      //
      // NOTE: this enum and each adapter's `supportedOperations` are two
      // independent lists of the same thing, and this one wins — it rejects the
      // request before any adapter is consulted. Measured 7 Aug 2026: adding
      // image.description to HuggingFaceProvider.supportedOperations had no
      // effect at all until it was added here as well. Anything added to one must
      // be added to the other.
      "image.description",
      "embeddings"
    ]);
    finishReasonSchema = z.enum([
      "stop",
      "length",
      "content_filter",
      "tool_calls",
      "error",
      "incomplete"
      // OpenAI Responses API (request cut short)
    ]);
    usageSchema = z.object({
      promptTokens: z.number().int().min(0),
      completionTokens: z.number().int().min(0),
      totalTokens: z.number().int().min(0)
    });
    toolCallSchema = z.object({
      id: z.string(),
      type: z.string(),
      function: z.object({
        name: z.string(),
        arguments: z.string()
      })
    });
    normalizedLLMResponseSchema = z.object({
      provider: z.string(),
      model: z.string(),
      content: z.string(),
      usage: usageSchema,
      finishReason: finishReasonSchema,
      toolCalls: z.array(toolCallSchema).optional(),
      metadata: z.record(z.unknown())
    });
    normalizedEmbeddingResponseSchema = z.object({
      provider: z.string(),
      model: z.string(),
      embeddings: z.array(z.array(z.number())),
      usage: z.object({
        promptTokens: z.number().int().min(0),
        totalTokens: z.number().int().min(0)
      }),
      metadata: z.record(z.unknown())
    });
    executeParamsSchema = z.object({
      model: z.string(),
      // Input
      messages: z.array(z.object({
        role: z.enum(["system", "user", "assistant", "tool"]),
        content: z.union([z.string(), z.array(z.unknown())]),
        name: z.string().optional(),
        tool_call_id: z.string().optional(),
        tool_calls: z.array(z.unknown()).optional()
      })).optional(),
      prompt: z.string().optional(),
      input: z.union([z.string(), z.array(z.string()), z.array(z.number())]).optional(),
      text: z.string().optional(),
      // Generation config
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().positive().optional(),
      topP: z.number().min(0).max(1).optional(),
      topK: z.number().int().positive().optional(),
      stopSequences: z.array(z.string()).optional(),
      stop: z.union([z.string(), z.array(z.string())]).optional(),
      seed: z.number().int().optional(),
      frequencyPenalty: z.number().optional(),
      presencePenalty: z.number().optional(),
      // System prompt (multiple aliases for cross-provider compat)
      system: z.string().optional(),
      systemPrompt: z.string().optional(),
      instructions: z.string().optional(),
      // Tool use
      tools: z.array(z.unknown()).optional(),
      toolChoice: z.unknown().optional(),
      // Response format
      responseFormat: z.string().optional(),
      jsonSchema: z.unknown().optional(),
      // OpenAI Responses API specific
      previousResponseId: z.string().optional(),
      reasoningEffort: z.enum(["none", "low", "medium", "high", "xhigh"]).optional(),
      showReasoning: z.boolean().optional(),
      enablePreambles: z.boolean().optional(),
      compactMode: z.boolean().optional(),
      parallelToolCalls: z.boolean().optional()
    }).strict();
    executeRequestSchema = z.object({
      provider: providerSchema,
      operation: operationSchema,
      params: executeParamsSchema,
      credentialId: z.string().optional()
    });
    executeResponseSchema = z.object({
      success: z.boolean(),
      data: z.union([normalizedLLMResponseSchema, normalizedEmbeddingResponseSchema]).optional(),
      error: z.string().optional(),
      requestId: z.string(),
      durationMs: z.number()
    });
    providerConfigSchema = z.object({
      provider: z.string(),
      baseUrl: z.string().url(),
      authType: z.enum(["bearer", "header", "query"]),
      endpoints: z.record(z.string()),
      rateLimits: z.object({
        requestsPerMinute: z.number().int().positive(),
        tokensPerMinute: z.number().int().positive()
      }).optional(),
      defaultModel: z.string(),
      supportedOperations: z.array(z.string())
    });
    modelCapabilitySchema = z.enum([
      "chat",
      "completion",
      "embedding",
      "vision",
      "function_calling",
      "reasoning"
    ]);
    modelConfigSchema = z.object({
      // Core fields
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      // Context limits
      contextWindow: z.number().int().positive().optional(),
      maxOutputTokens: z.number().int().positive().optional(),
      // Capabilities
      capabilities: z.array(modelCapabilitySchema).default(["chat"]),
      // Pricing (per 1M tokens)
      inputPricing: z.number().optional(),
      outputPricing: z.number().optional(),
      // Status
      deprecated: z.boolean().optional(),
      // Legacy field aliases for backwards compatibility
      provider: z.string().optional(),
      modelId: z.string().optional(),
      displayName: z.string().optional(),
      inputPricePerMillion: z.number().optional(),
      outputPricePerMillion: z.number().optional(),
      supportedOperations: z.array(z.string()).optional()
    });
    executionLogs = pgTable("integration_execution_logs", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull(),
      orgId: varchar("org_id"),
      provider: text("provider").notNull(),
      operation: text("operation").notNull(),
      model: text("model"),
      requestId: varchar("request_id").notNull(),
      // Timing
      startedAt: timestamp("started_at").notNull(),
      completedAt: timestamp("completed_at"),
      durationMs: integer("duration_ms"),
      // Result
      success: boolean("success").notNull(),
      errorMessage: text("error_message"),
      // Usage
      promptTokens: integer("prompt_tokens"),
      completionTokens: integer("completion_tokens"),
      totalTokens: integer("total_tokens"),
      estimatedCostCents: integer("estimated_cost_cents"),
      // Metadata
      metadata: json("metadata").$type().default({}),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      userIdx: index("idx_execution_logs_user_id").on(table.userId),
      orgIdx: index("idx_execution_logs_org_id").on(table.orgId),
      providerIdx: index("idx_execution_logs_provider").on(table.provider),
      createdIdx: index("idx_execution_logs_created").on(table.createdAt)
    }));
    credentialMetadataSchema = z.object({
      id: z.string(),
      provider: z.string(),
      name: z.string(),
      createdAt: z.string(),
      lastUsedAt: z.string().nullable()
    });
    integrationAuthSchema = z.discriminatedUnion("type", [
      z.object({
        type: z.literal("bearer"),
        credentialKey: z.string()
        // Reference to stored credential
      }),
      z.object({
        type: z.literal("apiKey"),
        header: z.string().default("X-API-Key"),
        credentialKey: z.string()
      }),
      z.object({
        type: z.literal("basic"),
        credentialKey: z.string()
        // Stored as base64(username:password)
      }),
      z.object({
        type: z.literal("oauth2"),
        tokenUrl: z.string().url(),
        scopes: z.array(z.string()).optional(),
        credentialKey: z.string()
        // client_id:client_secret
      }),
      z.object({
        type: z.literal("none")
      })
    ]);
    parameterLocationSchema = z.enum(["path", "query", "header", "cookie", "body"]);
    operationParameterSchema = z.object({
      name: z.string(),
      location: parameterLocationSchema,
      required: z.boolean().default(false),
      description: z.string().optional(),
      schema: z.record(z.unknown()).optional(),
      // JSON Schema
      example: z.unknown().optional()
    });
    integrationOperationSchema = z.object({
      // Identity
      id: z.string(),
      // e.g., "chat.completions.create"
      operationId: z.string().optional(),
      // Original OpenAPI operationId
      // HTTP details (for OpenAPI)
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).optional(),
      path: z.string().optional(),
      // e.g., "/v1/chat/completions"
      // Metadata
      summary: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      deprecated: z.boolean().optional(),
      // Parameters
      parameters: z.array(operationParameterSchema).optional(),
      requestBody: z.object({
        required: z.boolean().optional(),
        contentType: z.string().default("application/json"),
        schema: z.record(z.unknown()).optional()
        // JSON Schema
      }).optional(),
      // Response
      responseSchema: z.record(z.unknown()).optional(),
      // MCP-specific
      mcpTool: z.object({
        name: z.string(),
        inputSchema: z.record(z.unknown())
      }).optional()
    });
    openAPIConfigSchema = z.object({
      specUrl: z.string().url().optional(),
      // URL to fetch spec from
      spec: z.record(z.unknown()).optional(),
      // Or inline spec object
      version: z.string().optional(),
      // Spec version detected
      serverUrl: z.string().url().optional()
      // Override base URL
    });
    mcpConfigSchema = z.object({
      transport: z.enum(["stdio", "http", "websocket"]),
      // For stdio transport
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
      env: z.record(z.string()).optional(),
      // For http/websocket transport
      serverUrl: z.string().url().optional(),
      // Discovered capabilities
      capabilities: z.object({
        tools: z.boolean().optional(),
        resources: z.boolean().optional(),
        prompts: z.boolean().optional()
      }).optional()
    });
    rateLimitConfigSchema = z.object({
      requestsPerMinute: z.number().int().positive().optional(),
      requestsPerSecond: z.number().int().positive().optional(),
      tokensPerMinute: z.number().int().positive().optional(),
      concurrentRequests: z.number().int().positive().optional()
    });
    integrationSchema = z.object({
      // Identity (from CatalogResource)
      id: z.string(),
      key: z.string(),
      // e.g., "openai", "stripe", "my-mcp-server"
      name: z.string(),
      description: z.string().optional(),
      // Type determines how operations are discovered
      type: z.enum(["openapi", "mcp", "builtin", "custom"]),
      // Configuration based on type
      openapi: openAPIConfigSchema.optional(),
      mcp: mcpConfigSchema.optional(),
      // Authentication
      auth: integrationAuthSchema.optional(),
      // Rate limiting
      rateLimit: rateLimitConfigSchema.optional(),
      // Retry configuration
      retry: z.object({
        maxRetries: z.number().int().min(0).max(10).default(3),
        backoffMs: z.number().int().positive().default(1e3),
        backoffMultiplier: z.number().positive().default(2)
      }).optional(),
      // Discovered operations (populated after spec is parsed)
      operations: z.array(integrationOperationSchema).optional(),
      // Operation namespace tree (for quick lookup)
      // e.g., { "chat": { "completions": { "create": operationRef } } }
      namespace: z.record(z.unknown()).optional(),
      // Status
      status: z.enum(["pending", "active", "error", "disabled"]).default("pending"),
      lastSyncedAt: z.string().datetime().optional(),
      syncError: z.string().optional(),
      // Metadata
      version: z.number().int().positive().default(1),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.unknown()).optional()
    });
    integrationInvokeRequestSchema = z.object({
      // Target operation (dot-notation path)
      operation: z.string(),
      // e.g., "integrations.openai.chat.completions.create"
      // Request parameters
      params: z.record(z.unknown()).optional(),
      body: z.unknown().optional(),
      headers: z.record(z.string()).optional(),
      // Options
      timeout: z.number().int().positive().optional(),
      retries: z.number().int().min(0).optional()
    });
    integrationInvokeResponseSchema = z.object({
      success: z.boolean(),
      data: z.unknown().optional(),
      error: z.string().optional(),
      // Execution metadata
      requestId: z.string(),
      durationMs: z.number(),
      operation: z.string(),
      integration: z.string(),
      // HTTP details (for OpenAPI)
      statusCode: z.number().int().optional(),
      headers: z.record(z.string()).optional()
    });
    integrations = pgTable("integrations", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      key: varchar("key", { length: 255 }).notNull().unique(),
      orgId: varchar("org_id").notNull(),
      name: varchar("name", { length: 255 }).notNull(),
      description: text("description"),
      type: varchar("type", { length: 50 }).notNull(),
      // 'openapi' | 'mcp' | 'builtin' | 'custom'
      // Configuration (stored as JSON)
      config: json("config").$type().default({}),
      // Discovered operations (cached after spec parse)
      operations: json("operations").$type().default([]),
      namespace: json("namespace").$type().default({}),
      // Status
      status: varchar("status", { length: 50 }).default("pending").notNull(),
      lastSyncedAt: timestamp("last_synced_at"),
      syncError: text("sync_error"),
      // Metadata
      version: integer("version").default(1).notNull(),
      tags: json("tags").$type().default([]),
      metadata: json("metadata").$type().default({}),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      keyIdx: index("idx_integrations_key").on(table.key),
      orgIdx: index("idx_integrations_org_id").on(table.orgId),
      typeIdx: index("idx_integrations_type").on(table.type),
      statusIdx: index("idx_integrations_status").on(table.status)
    }));
    proxyUsage = pgTable("proxy_usage", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      // Who used it
      userId: varchar("user_id").notNull(),
      orgId: varchar("org_id").notNull(),
      // What was used
      integrationKey: varchar("integration_key", { length: 255 }).notNull(),
      operation: varchar("operation", { length: 500 }).notNull(),
      // Credential that was used (reference to userCredentials.id)
      credentialId: varchar("credential_id").notNull(),
      // Request details
      requestId: varchar("request_id", { length: 100 }),
      success: boolean("success").notNull().default(true),
      statusCode: integer("status_code"),
      errorMessage: text("error_message"),
      durationMs: integer("duration_ms"),
      // Token usage (for LLM operations)
      inputTokens: integer("input_tokens"),
      outputTokens: integer("output_tokens"),
      totalTokens: integer("total_tokens"),
      // Cost tracking (in microdollars for precision)
      estimatedCostMicros: integer("estimated_cost_micros"),
      // Metadata
      metadata: json("metadata").$type().default({}),
      timestamp: timestamp("timestamp").defaultNow().notNull()
    }, (table) => ({
      userIdx: index("idx_proxy_usage_user_id").on(table.userId),
      orgIdx: index("idx_proxy_usage_org_id").on(table.orgId),
      integrationIdx: index("idx_proxy_usage_integration").on(table.integrationKey),
      timestampIdx: index("idx_proxy_usage_timestamp").on(table.timestamp),
      orgTimestampIdx: index("idx_proxy_usage_org_timestamp").on(table.orgId, table.timestamp),
      credentialIdx: index("idx_proxy_usage_credential").on(table.credentialId)
    }));
    proxyUsageSummarySchema = z.object({
      userId: z.string(),
      orgId: z.string(),
      integrationKey: z.string(),
      // Time period
      periodStart: z.string().datetime(),
      periodEnd: z.string().datetime(),
      // Aggregated stats
      requestCount: z.number().int(),
      successCount: z.number().int(),
      errorCount: z.number().int(),
      totalTokens: z.number().int(),
      totalCostMicros: z.number().int(),
      avgDurationMs: z.number()
    });
    providerCapabilitySchema = z.object({
      // Provider identity
      provider: z.string(),
      name: z.string(),
      description: z.string().optional(),
      // API configuration
      baseUrl: z.string().url(),
      defaultModel: z.string(),
      // Supported operations
      supportedOperations: z.array(z.string()),
      // Models available for this provider
      models: z.array(modelConfigSchema),
      // User's access status for this provider
      access: z.object({
        hasCredential: z.boolean(),
        credentialSource: z.enum(["personal", "org-wide", "none"]),
        isEnabled: z.boolean(),
        lastUsedAt: z.string().datetime().nullable().optional()
      }),
      // Rate limits (if configured)
      rateLimits: z.object({
        requestsPerMinute: z.number().int().optional(),
        tokensPerMinute: z.number().int().optional()
      }).optional(),
      // Status
      status: z.enum(["available", "unavailable", "degraded", "disabled"]).default("available"),
      statusMessage: z.string().optional()
    });
    capabilitiesResponseSchema = z.object({
      // All providers with their capabilities
      providers: z.array(providerCapabilitySchema),
      // Quick lookup maps
      byProvider: z.record(providerCapabilitySchema),
      // Models grouped by purpose (for UI dropdowns)
      modelsByPurpose: z.object({
        chat: z.array(z.object({
          provider: z.string(),
          model: modelConfigSchema
        })),
        embedding: z.array(z.object({
          provider: z.string(),
          model: modelConfigSchema
        })),
        vision: z.array(z.object({
          provider: z.string(),
          model: modelConfigSchema
        })),
        reasoning: z.array(z.object({
          provider: z.string(),
          model: modelConfigSchema
        }))
      }),
      // User's default provider preferences (if configured)
      defaults: z.object({
        chatProvider: z.string().optional(),
        chatModel: z.string().optional(),
        embeddingProvider: z.string().optional(),
        embeddingModel: z.string().optional()
      }).optional(),
      // Timestamp for cache invalidation
      fetchedAt: z.string().datetime()
    });
    channelTypeSchema = z.enum([
      "telegram"
    ]);
    channelConnectionModeSchema = z.enum([
      "webhook"
      // Platform sends events to our webhook URL
    ]);
    channelConnectionStatusSchema = z.enum([
      "pending",
      // Connection initiated but not yet established
      "connecting",
      // Connection in progress (e.g., waiting for QR scan)
      "connected",
      // Connection active and working
      "disconnected",
      // Connection terminated (graceful or timeout)
      "error"
      // Connection failed with error
    ]);
    channelCapabilitiesSchema = z.object({
      directMessages: z.boolean().default(true),
      groupChats: z.boolean().default(false),
      threads: z.boolean().default(false),
      reactions: z.boolean().default(false),
      fileAttachments: z.boolean().default(false),
      voiceMessages: z.boolean().default(false),
      edits: z.boolean().default(false),
      deletions: z.boolean().default(false),
      typing: z.boolean().default(false),
      readReceipts: z.boolean().default(false)
    });
    channelFormattingSchema = z.object({
      maxLength: z.number().int().positive().optional(),
      supportsMarkdown: z.boolean().default(false),
      supportsHtml: z.boolean().default(false),
      supportsMentions: z.boolean().default(false),
      supportsEmoji: z.boolean().default(true)
    });
    channelConfigSchema = z.object({
      channelType: channelTypeSchema.optional(),
      connectionMode: channelConnectionModeSchema.optional(),
      capabilities: channelCapabilitiesSchema.optional(),
      formatting: channelFormattingSchema.optional(),
      webhookBaseUrl: z.string().url().optional(),
      webhookSecret: z.string().optional(),
      dropPendingUpdates: z.boolean().optional(),
      allowedUpdateTypes: z.array(z.string()).optional(),
      metadata: z.record(z.unknown()).optional()
    });
    channelAttachmentSchema = z.object({
      type: z.string(),
      // "image", "audio", "video", "file", "location"
      url: z.string().url().optional(),
      mimeType: z.string().optional(),
      filename: z.string().optional(),
      size: z.number().int().optional(),
      data: z.string().optional()
      // base64 for inline data
    });
    channelSenderSchema = z.object({
      id: z.string(),
      name: z.string().optional(),
      username: z.string().optional(),
      isBot: z.boolean().optional()
    });
    channelChatSchema = z.object({
      id: z.string(),
      type: z.enum(["private", "group", "channel", "thread"]),
      name: z.string().optional()
    });
    channelInboundMessageSchema = z.object({
      id: z.string(),
      channelType: channelTypeSchema,
      connectionId: z.string(),
      contentType: z.string().default("text"),
      text: z.string().optional(),
      attachments: z.array(channelAttachmentSchema).optional(),
      sender: channelSenderSchema,
      chat: channelChatSchema,
      replyToMessageId: z.string().optional(),
      timestamp: z.string().datetime(),
      editedAt: z.string().datetime().optional(),
      raw: z.record(z.unknown()).optional()
    });
    channelMessageFormattingSchema = z.object({
      parseMode: z.enum(["plain", "markdown", "html"]).optional(),
      disablePreview: z.boolean().optional(),
      silent: z.boolean().optional()
    });
    channelOutboundMessageSchema = z.object({
      channelType: channelTypeSchema,
      connectionId: z.string(),
      chatId: z.string(),
      contentType: z.string().default("text"),
      text: z.string().optional(),
      attachments: z.array(channelAttachmentSchema).optional(),
      replyToMessageId: z.string().optional(),
      formatting: channelMessageFormattingSchema.optional(),
      conversationId: z.string().optional(),
      assistantId: z.string().optional(),
      requestId: z.string().optional()
    });
    channelStatusEventSchema = z.object({
      connectionId: z.string(),
      channelType: channelTypeSchema,
      previousStatus: channelConnectionStatusSchema,
      newStatus: channelConnectionStatusSchema,
      reason: z.string().optional(),
      error: z.string().optional(),
      timestamp: z.string().datetime()
    });
    channelConnections = pgTable("channel_connections", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      integrationId: varchar("integration_id"),
      userId: varchar("user_id").notNull(),
      orgId: varchar("org_id"),
      // Channel info
      channelType: varchar("channel_type", { length: 50 }).notNull(),
      channelAccountId: varchar("channel_account_id"),
      channelAccountName: varchar("channel_account_name"),
      // Auth
      credentialId: varchar("credential_id"),
      // Status
      status: varchar("status", { length: 50 }).default("pending").notNull(),
      // Session data (for reconnection)
      sessionData: json("session_data").$type().default({}),
      // QR-link mode
      qrCode: text("qr_code"),
      qrExpiresAt: timestamp("qr_expires_at"),
      // Webhook mode
      webhookUrl: text("webhook_url"),
      webhookSecret: text("webhook_secret"),
      webhookVerified: boolean("webhook_verified").default(false),
      // Health tracking
      lastPingAt: timestamp("last_ping_at"),
      lastMessageAt: timestamp("last_message_at"),
      lastError: text("last_error"),
      errorCount: integer("error_count").default(0),
      consecutiveErrors: integer("consecutive_errors").default(0),
      // Stats
      messagesReceived: integer("messages_received").default(0),
      messagesSent: integer("messages_sent").default(0),
      // Timestamps
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull(),
      connectedAt: timestamp("connected_at"),
      disconnectedAt: timestamp("disconnected_at")
    }, (table) => ({
      userIdx: index("idx_channel_connections_user_id").on(table.userId),
      orgIdx: index("idx_channel_connections_org_id").on(table.orgId),
      typeIdx: index("idx_channel_connections_channel_type").on(table.channelType),
      statusIdx: index("idx_channel_connections_status").on(table.status)
    }));
    oauthProviderConfigSchema = z.object({
      provider: z.string().min(1),
      displayName: z.string().min(1),
      description: z.string().optional(),
      iconUrl: z.string().url().optional(),
      // OAuth endpoints
      authorizationUrl: z.string().url(),
      tokenUrl: z.string().url(),
      userinfoUrl: z.string().url().optional(),
      revokeUrl: z.string().url().optional(),
      // OAuth settings
      defaultScopes: z.array(z.string()).default([]),
      scopeDelimiter: z.string().default(" "),
      responseType: z.enum(["code", "token"]).default("code"),
      grantType: z.enum(["authorization_code", "client_credentials"]).default("authorization_code"),
      pkceRequired: z.boolean().default(false),
      // Token handling
      supportsRefresh: z.boolean().default(true),
      tokenExpiresIn: z.number().int().positive().optional()
      // Default expiry if not in response
    });
    oauthTokenResponseSchema = z.object({
      accessToken: z.string(),
      refreshToken: z.string().optional(),
      expiresIn: z.number().int().positive().optional(),
      tokenType: z.string().default("Bearer"),
      scope: z.string().optional()
    });
    oauthUserInfoSchema = z.object({
      id: z.string(),
      email: z.string().email().optional(),
      name: z.string().optional(),
      username: z.string().optional(),
      avatarUrl: z.string().url().optional()
    });
    oauthAuthorizeRequestSchema = z.object({
      provider: z.string().min(1),
      redirectUri: z.string().url().optional(),
      // Where to redirect after OAuth completes
      scopes: z.array(z.string()).optional(),
      // Override default scopes
      state: z.string().optional()
      // Client-provided state for additional context
    });
    oauthAuthorizeResponseSchema = z.object({
      authorizationUrl: z.string().url(),
      state: z.string(),
      provider: z.string()
    });
    oauthConnectionSchema = z.object({
      id: z.string(),
      provider: z.string(),
      displayName: z.string(),
      connectedAt: z.string().datetime(),
      expiresAt: z.string().datetime().optional(),
      scopes: z.array(z.string()),
      status: z.enum(["active", "expired", "revoked"]),
      oauthUserId: z.string().optional(),
      oauthUserEmail: z.string().email().optional(),
      oauthUserName: z.string().optional()
    });
    oauthProviderConfigs = pgTable("oauth_provider_configs", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      provider: varchar("provider", { length: 100 }).notNull().unique(),
      // OAuth endpoints
      authorizationUrl: text("authorization_url").notNull(),
      tokenUrl: text("token_url").notNull(),
      userinfoUrl: text("userinfo_url"),
      revokeUrl: text("revoke_url"),
      // Client credentials (encrypted)
      clientId: text("client_id").notNull(),
      clientSecretEncrypted: text("client_secret_encrypted").notNull(),
      // Display
      displayName: varchar("display_name", { length: 255 }).notNull(),
      description: text("description"),
      iconUrl: text("icon_url"),
      // Settings
      defaultScopes: json("default_scopes").$type().default([]),
      scopeDelimiter: varchar("scope_delimiter", { length: 10 }).default(" "),
      responseType: varchar("response_type", { length: 50 }).default("code"),
      grantType: varchar("grant_type", { length: 50 }).default("authorization_code"),
      pkceRequired: boolean("pkce_required").default(false),
      supportsRefresh: boolean("supports_refresh").default(true),
      // Status
      isEnabled: boolean("is_enabled").default(true).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      providerIdx: index("idx_oauth_provider_configs_provider").on(table.provider),
      enabledIdx: index("idx_oauth_provider_configs_enabled").on(table.isEnabled)
    }));
    oauthStates = pgTable("oauth_states", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      state: varchar("state", { length: 255 }).notNull().unique(),
      // Who initiated the flow
      userId: varchar("user_id").notNull(),
      orgId: varchar("org_id"),
      // OAuth flow details
      provider: varchar("provider", { length: 100 }).notNull(),
      redirectUri: text("redirect_uri").notNull(),
      scopes: json("scopes").$type().default([]),
      // PKCE support
      pkceVerifier: text("pkce_verifier"),
      pkceChallenge: text("pkce_challenge"),
      // Client state (passed through from authorize request)
      clientState: text("client_state"),
      // Expiration (short-lived - 10 minutes)
      expiresAt: timestamp("expires_at").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      stateIdx: index("idx_oauth_states_state").on(table.state),
      expiresIdx: index("idx_oauth_states_expires").on(table.expiresAt),
      userIdx: index("idx_oauth_states_user").on(table.userId)
    }));
    oauthConnections = pgTable("oauth_connections", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      // Who owns this connection
      userId: varchar("user_id").notNull(),
      orgId: varchar("org_id"),
      // Provider info
      provider: varchar("provider", { length: 100 }).notNull(),
      // OAuth user info from provider
      oauthUserId: varchar("oauth_user_id", { length: 255 }),
      oauthUserEmail: text("oauth_user_email"),
      oauthUserName: text("oauth_user_name"),
      oauthAvatarUrl: text("oauth_avatar_url"),
      // Token info (reference to Identity credential)
      credentialId: varchar("credential_id"),
      // Reference to userCredentials in Identity
      // Scopes granted
      scopes: json("scopes").$type().default([]),
      // Status
      status: varchar("status", { length: 50 }).default("active").notNull(),
      // active, expired, revoked
      expiresAt: timestamp("expires_at"),
      // Timestamps
      connectedAt: timestamp("connected_at").defaultNow().notNull(),
      lastUsedAt: timestamp("last_used_at"),
      revokedAt: timestamp("revoked_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      userIdx: index("idx_oauth_connections_user").on(table.userId),
      orgIdx: index("idx_oauth_connections_org").on(table.orgId),
      providerIdx: index("idx_oauth_connections_provider").on(table.provider),
      userProviderIdx: index("idx_oauth_connections_user_provider").on(table.userId, table.provider),
      statusIdx: index("idx_oauth_connections_status").on(table.status)
    }));
  }
});

// ../../integrations/server/src/model-eval/benchmarks/suites/routing-benchmarks.ts
var intentClassificationCases, hybridRoutingCases, routingBenchmarks;
var init_routing_benchmarks = __esm({
  "../../integrations/server/src/model-eval/benchmarks/suites/routing-benchmarks.ts"() {
    "use strict";
    intentClassificationCases = [
      // Coding intents
      {
        id: "routing.intent.code-review",
        name: "Code review request",
        input: {
          messages: [
            { role: "user", content: "Can you review this Python function for bugs?" }
          ]
        },
        expected: {
          contains: ["code"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["code", "high-frequency"]
      },
      {
        id: "routing.intent.code-generation",
        name: "Code generation request",
        input: {
          messages: [
            { role: "user", content: "Write a function that calculates fibonacci numbers" }
          ]
        },
        expected: {
          contains: ["code"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["code", "high-frequency"]
      },
      {
        id: "routing.intent.debug",
        name: "Debug request",
        input: {
          messages: [
            { role: "user", content: "I'm getting a NullPointerException in my Java app" }
          ]
        },
        expected: {
          contains: ["code", "debug"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["code", "debugging"]
      },
      // Research intents
      {
        id: "routing.intent.web-search",
        name: "Web search request",
        input: {
          messages: [
            { role: "user", content: "What are the latest developments in quantum computing?" }
          ]
        },
        expected: {
          contains: ["research", "search"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["research", "high-frequency"]
      },
      {
        id: "routing.intent.fact-check",
        name: "Fact checking request",
        input: {
          messages: [
            { role: "user", content: "Is it true that the Great Wall of China is visible from space?" }
          ]
        },
        expected: {
          contains: ["research", "fact"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["research", "reasoning"]
      },
      // Conversational intents
      {
        id: "routing.intent.greeting",
        name: "Simple greeting",
        input: {
          messages: [
            { role: "user", content: "Hello, how are you doing today?" }
          ]
        },
        expected: {
          contains: ["conversational", "general"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["conversational", "high-frequency"]
      },
      {
        id: "routing.intent.clarification",
        name: "Clarification question",
        input: {
          messages: [
            { role: "user", content: "Can you explain what you meant by that?" }
          ]
        },
        expected: {
          contains: ["conversational", "clarify"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["conversational"]
      },
      // Task intents
      {
        id: "routing.intent.summarize",
        name: "Summarization request",
        input: {
          messages: [
            { role: "user", content: "Summarize this article about climate change for me" }
          ]
        },
        expected: {
          contains: ["task", "summarize"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["task", "high-frequency"]
      },
      {
        id: "routing.intent.translate",
        name: "Translation request",
        input: {
          messages: [
            { role: "user", content: "Translate this text to Spanish" }
          ]
        },
        expected: {
          contains: ["task", "translate"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["task"]
      },
      // Ambiguous intents (harder cases)
      {
        id: "routing.intent.ambiguous-code-question",
        name: "Ambiguous code vs. research",
        description: "Could be asking about code or for research about Python",
        input: {
          messages: [
            { role: "user", content: "Tell me about Python" }
          ]
        },
        expected: {
          contains: ["clarify"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["ambiguous", "edge-case"]
      },
      {
        id: "routing.intent.multi-intent",
        name: "Multiple intents in one request",
        input: {
          messages: [
            { role: "user", content: "Search for React best practices and then write me a component" }
          ]
        },
        expected: {
          contains: ["research", "code"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["multi-intent", "edge-case"]
      }
    ];
    hybridRoutingCases = [
      {
        id: "routing.hybrid.embedding-vs-llm",
        name: "Embedding fallback decision",
        description: "Test when to use embeddings vs. LLM for routing",
        input: {
          messages: [
            {
              role: "system",
              content: `You are a routing classifier. Given the user query, decide the routing method.
Output JSON: { "method": "embedding" | "llm", "confidence": 0-1, "reason": string }

Rules:
- Use "embedding" for clear, simple intents that match known patterns
- Use "llm" for ambiguous, complex, or multi-part requests`
            },
            { role: "user", content: "Write a Python function to sort a list" }
          ]
        },
        expected: {
          schema: {
            type: "object",
            properties: {
              method: { type: "string", enum: ["embedding", "llm"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              reason: { type: "string" }
            },
            required: ["method", "confidence"]
          }
        },
        evaluator: "json_schema",
        weight: 1,
        tags: ["hybrid", "routing-decision"]
      },
      {
        id: "routing.hybrid.complex-query",
        name: "Complex query requires LLM routing",
        input: {
          messages: [
            {
              role: "system",
              content: `You are a routing classifier. Given the user query, decide the routing method.
Output JSON: { "method": "embedding" | "llm", "confidence": 0-1, "reason": string }`
            },
            {
              role: "user",
              content: "I need help with my React app - it crashes when I search for users, but I also want to understand if this is a common problem with async state updates"
            }
          ]
        },
        expected: {
          contains: ["llm"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["hybrid", "complex"]
      }
    ];
    routingBenchmarks = [
      {
        id: "routing.intent-classification",
        name: "Intent Classification",
        description: "Tests the model's ability to classify user intents for routing to appropriate handlers",
        version: "1.0.0",
        taskType: "routing",
        category: "intent-classification",
        testCases: intentClassificationCases,
        config: {
          maxTokens: 100,
          temperature: 0,
          timeout: 1e4
        }
      },
      {
        id: "routing.hybrid-decision",
        name: "Hybrid Routing Decisions",
        description: "Tests decisions between embedding-based and LLM-based routing",
        version: "1.0.0",
        taskType: "routing",
        category: "hybrid-routing",
        testCases: hybridRoutingCases,
        config: {
          maxTokens: 200,
          temperature: 0,
          timeout: 15e3
        }
      }
    ];
  }
});

// ../../integrations/server/src/model-eval/benchmarks/suites/code-review-benchmarks.ts
var securityDetectionCases, performanceSuggestionCases, codeReviewBenchmarks;
var init_code_review_benchmarks = __esm({
  "../../integrations/server/src/model-eval/benchmarks/suites/code-review-benchmarks.ts"() {
    "use strict";
    securityDetectionCases = [
      // SQL Injection
      {
        id: "code.security.sql-injection-basic",
        name: "Basic SQL injection detection",
        input: {
          messages: [
            {
              role: "system",
              content: 'You are a code security reviewer. Analyze the code for security vulnerabilities. Output JSON: { "vulnerabilities": [{ "type": string, "severity": "low"|"medium"|"high"|"critical", "line": number, "description": string }] }'
            },
            {
              role: "user",
              content: `Review this code:
\`\`\`python
def get_user(username):
    query = f"SELECT * FROM users WHERE username = '{username}'"
    return db.execute(query)
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["sql", "injection"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["security", "sql-injection", "high-priority"]
      },
      {
        id: "code.security.sql-injection-subtle",
        name: "Subtle SQL injection via concatenation",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code security reviewer. Analyze the code for security vulnerabilities."
            },
            {
              role: "user",
              content: `Review this code:
\`\`\`javascript
const searchProducts = (category, minPrice) => {
  let query = "SELECT * FROM products WHERE 1=1";
  if (category) query += " AND category = '" + category + "'";
  if (minPrice) query += " AND price >= " + minPrice;
  return db.query(query);
};
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["sql", "injection"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["security", "sql-injection", "subtle"]
      },
      // XSS
      {
        id: "code.security.xss-basic",
        name: "Basic XSS detection",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code security reviewer. Analyze the code for security vulnerabilities."
            },
            {
              role: "user",
              content: `Review this code:
\`\`\`javascript
function renderComment(comment) {
  document.getElementById('comments').innerHTML += '<div>' + comment.text + '</div>';
}
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["xss", "cross-site"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["security", "xss", "high-priority"]
      },
      {
        id: "code.security.xss-react",
        name: "XSS via dangerouslySetInnerHTML",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code security reviewer. Identify security issues."
            },
            {
              role: "user",
              content: `Review this React component:
\`\`\`jsx
function UserBio({ bio }) {
  return (
    <div
      className="bio"
      dangerouslySetInnerHTML={{ __html: bio }}
    />
  );
}
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["xss", "dangerous"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["security", "xss", "react"]
      },
      // Auth bypass
      {
        id: "code.security.auth-bypass",
        name: "Authentication bypass detection",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code security reviewer. Analyze the code for security vulnerabilities."
            },
            {
              role: "user",
              content: `Review this code:
\`\`\`javascript
app.get('/admin/users', (req, res) => {
  // Check if user is admin
  if (req.query.isAdmin === 'true') {
    return res.json(getAllUsers());
  }
  return res.status(403).json({ error: 'Forbidden' });
});
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["auth", "bypass"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["security", "authentication", "critical"]
      },
      // Path traversal
      {
        id: "code.security.path-traversal",
        name: "Path traversal detection",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code security reviewer. Analyze the code for security vulnerabilities."
            },
            {
              role: "user",
              content: `Review this code:
\`\`\`python
@app.route('/files/<filename>')
def serve_file(filename):
    return send_from_directory('/uploads', filename)
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["path", "traversal"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["security", "path-traversal"]
      },
      // Secure code (should not flag)
      {
        id: "code.security.secure-query",
        name: "Correctly identify secure parameterized query",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code security reviewer. Analyze the code for security vulnerabilities. If the code is secure, say so."
            },
            {
              role: "user",
              content: `Review this code:
\`\`\`python
def get_user(username):
    query = "SELECT * FROM users WHERE username = %s"
    return db.execute(query, (username,))
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["secure", "parameterized"],
          notContains: ["vulnerability", "injection"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["security", "false-positive-check"]
      }
    ];
    performanceSuggestionCases = [
      // N+1 query
      {
        id: "code.performance.n-plus-one",
        name: "N+1 query detection",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code performance reviewer. Identify performance issues and suggest improvements."
            },
            {
              role: "user",
              content: `Review this code for performance:
\`\`\`python
def get_orders_with_items():
    orders = Order.objects.all()
    result = []
    for order in orders:
        items = OrderItem.objects.filter(order_id=order.id)
        result.append({'order': order, 'items': list(items)})
    return result
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["n+1", "query"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["performance", "database", "n-plus-one"]
      },
      // Memory leak
      {
        id: "code.performance.memory-leak-listener",
        name: "Event listener memory leak",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code performance reviewer. Identify performance and memory issues."
            },
            {
              role: "user",
              content: `Review this React component:
\`\`\`jsx
function DataFetcher({ url }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const handler = () => fetch(url).then(r => r.json()).then(setData);
    window.addEventListener('focus', handler);
    // Missing cleanup!
  }, [url]);

  return <div>{JSON.stringify(data)}</div>;
}
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["memory", "leak", "cleanup"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["performance", "memory", "react"]
      },
      // Inefficient loop
      {
        id: "code.performance.inefficient-loop",
        name: "Inefficient array operation in loop",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code performance reviewer. Identify inefficiencies."
            },
            {
              role: "user",
              content: `Review this code:
\`\`\`javascript
function findDuplicates(arr) {
  const duplicates = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j] && !duplicates.includes(arr[i])) {
        duplicates.push(arr[i]);
      }
    }
  }
  return duplicates;
}
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["O(n", "set", "complexity"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["performance", "algorithm", "complexity"]
      },
      // Unoptimized re-render
      {
        id: "code.performance.unnecessary-rerender",
        name: "Unnecessary React re-renders",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a React performance expert. Identify render inefficiencies."
            },
            {
              role: "user",
              content: `Review this component:
\`\`\`jsx
function UserList({ users }) {
  return (
    <ul>
      {users.map(user => (
        <UserCard
          key={user.id}
          user={user}
          onClick={() => console.log(user.id)}
          style={{ margin: 10 }}
        />
      ))}
    </ul>
  );
}
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["re-render", "inline", "useCallback", "useMemo"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["performance", "react", "rendering"]
      }
    ];
    codeReviewBenchmarks = [
      {
        id: "code.security-detection",
        name: "Security Vulnerability Detection",
        description: "Tests the model's ability to detect common security vulnerabilities in code",
        version: "1.0.0",
        taskType: "code",
        category: "security",
        testCases: securityDetectionCases,
        config: {
          maxTokens: 500,
          temperature: 0,
          timeout: 2e4
        }
      },
      {
        id: "code.performance-suggestions",
        name: "Performance Issue Detection",
        description: "Tests the model's ability to identify performance problems and suggest improvements",
        version: "1.0.0",
        taskType: "code",
        category: "performance",
        testCases: performanceSuggestionCases,
        config: {
          maxTokens: 500,
          temperature: 0,
          timeout: 2e4
        }
      }
    ];
  }
});

// ../../integrations/server/src/model-eval/benchmarks/suites/reasoning-benchmarks.ts
var factCheckingCases, logicalReasoningCases, multiStepReasoningCases, reasoningBenchmarks;
var init_reasoning_benchmarks = __esm({
  "../../integrations/server/src/model-eval/benchmarks/suites/reasoning-benchmarks.ts"() {
    "use strict";
    factCheckingCases = [
      // Clear true claims
      {
        id: "reasoning.fact.earth-sun",
        name: "Basic astronomical fact",
        input: {
          messages: [
            {
              role: "system",
              content: 'You are a fact-checker. Analyze the claim and respond with JSON: { "verdict": "true" | "false" | "partially_true" | "unverifiable", "confidence": 0-1, "explanation": string }'
            },
            {
              role: "user",
              content: "Claim: The Earth orbits the Sun."
            }
          ]
        },
        expected: {
          contains: ["true"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["fact-check", "easy"]
      },
      // Clear false claims
      {
        id: "reasoning.fact.great-wall-space",
        name: "Common misconception",
        input: {
          messages: [
            {
              role: "system",
              content: 'You are a fact-checker. Analyze the claim and respond with JSON: { "verdict": "true" | "false" | "partially_true" | "unverifiable", "confidence": 0-1, "explanation": string }'
            },
            {
              role: "user",
              content: "Claim: The Great Wall of China is visible from space with the naked eye."
            }
          ]
        },
        expected: {
          contains: ["false"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["fact-check", "misconception"]
      },
      // Nuanced claims
      {
        id: "reasoning.fact.goldfish-memory",
        name: "Partially true claim",
        input: {
          messages: [
            {
              role: "system",
              content: 'You are a fact-checker. Analyze the claim carefully. Respond with JSON: { "verdict": "true" | "false" | "partially_true" | "unverifiable", "confidence": 0-1, "explanation": string }'
            },
            {
              role: "user",
              content: "Claim: Goldfish have a 3-second memory."
            }
          ]
        },
        expected: {
          contains: ["false"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["fact-check", "nuanced"]
      },
      // Technical claims
      {
        id: "reasoning.fact.http-secure",
        name: "Technical security claim",
        input: {
          messages: [
            {
              role: "system",
              content: 'You are a technical fact-checker. Analyze the claim. Respond with JSON: { "verdict": "true" | "false" | "partially_true" | "unverifiable", "confidence": 0-1, "explanation": string }'
            },
            {
              role: "user",
              content: "Claim: HTTPS guarantees that a website is trustworthy and safe to use."
            }
          ]
        },
        expected: {
          contains: ["false", "partially"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["fact-check", "technical", "security"]
      }
    ];
    logicalReasoningCases = [
      // Syllogism
      {
        id: "reasoning.logic.syllogism",
        name: "Basic syllogism",
        input: {
          messages: [
            {
              role: "system",
              content: 'You are a logic expert. Analyze the argument and determine if the conclusion follows. Respond with JSON: { "valid": boolean, "explanation": string }'
            },
            {
              role: "user",
              content: "Premises: All dogs are mammals. All mammals are animals. Conclusion: All dogs are animals."
            }
          ]
        },
        expected: {
          contains: ["valid", "true"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["logic", "syllogism"]
      },
      // Invalid syllogism
      {
        id: "reasoning.logic.invalid-syllogism",
        name: "Invalid syllogism detection",
        input: {
          messages: [
            {
              role: "system",
              content: 'You are a logic expert. Analyze the argument and determine if the conclusion follows. Respond with JSON: { "valid": boolean, "explanation": string }'
            },
            {
              role: "user",
              content: "Premises: All cats are animals. Some animals are dogs. Conclusion: Some cats are dogs."
            }
          ]
        },
        expected: {
          contains: ["false", "invalid"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["logic", "syllogism", "fallacy"]
      },
      // Conditional reasoning
      {
        id: "reasoning.logic.modus-ponens",
        name: "Modus ponens",
        input: {
          messages: [
            {
              role: "system",
              content: 'Analyze this logical argument. Is the conclusion valid? Respond with JSON: { "valid": boolean, "rule": string, "explanation": string }'
            },
            {
              role: "user",
              content: "If it rains, the ground gets wet. It is raining. Therefore, the ground is wet."
            }
          ]
        },
        expected: {
          contains: ["valid", "true", "modus ponens"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["logic", "conditional"]
      },
      // Affirming the consequent (fallacy)
      {
        id: "reasoning.logic.affirming-consequent",
        name: "Affirming the consequent fallacy",
        input: {
          messages: [
            {
              role: "system",
              content: 'Analyze this logical argument. Is the conclusion valid? Identify any fallacies. Respond with JSON: { "valid": boolean, "fallacy": string | null, "explanation": string }'
            },
            {
              role: "user",
              content: "If it rains, the ground gets wet. The ground is wet. Therefore, it rained."
            }
          ]
        },
        expected: {
          contains: ["false", "invalid", "fallacy", "affirming"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["logic", "fallacy", "conditional"]
      }
    ];
    multiStepReasoningCases = [
      // Math word problem
      {
        id: "reasoning.multi.age-problem",
        name: "Age-based word problem",
        input: {
          messages: [
            {
              role: "system",
              content: "Solve this problem step by step and provide the final answer."
            },
            {
              role: "user",
              content: "Alice is twice as old as Bob. In 10 years, Alice will be 1.5 times as old as Bob. How old is Alice now?"
            }
          ]
        },
        expected: {
          contains: ["20"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["reasoning", "math", "multi-step"]
      },
      // Sequential dependencies
      {
        id: "reasoning.multi.meeting-schedule",
        name: "Meeting scheduling logic",
        input: {
          messages: [
            {
              role: "system",
              content: "Analyze the scheduling constraints and determine if the meeting can happen. Explain your reasoning step by step."
            },
            {
              role: "user",
              content: "Alice is free 9-11am and 2-4pm. Bob is free 10am-1pm. Charlie is free 11am-3pm. Can they all meet for 1 hour? If so, when?"
            }
          ]
        },
        expected: {
          contains: ["11", "12", "yes"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["reasoning", "scheduling", "constraints"]
      },
      // Causal chain
      {
        id: "reasoning.multi.causal-chain",
        name: "Causal chain analysis",
        input: {
          messages: [
            {
              role: "system",
              content: "Analyze the causal chain and identify the root cause."
            },
            {
              role: "user",
              content: "The website went down. Investigation revealed: The server ran out of memory. The memory was consumed by the database. The database had a runaway query. The query was triggered by a bug in the user search feature. The bug was introduced in last week's deployment. What is the root cause?"
            }
          ]
        },
        expected: {
          contains: ["bug", "deployment", "search"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["reasoning", "causal", "debugging"]
      }
    ];
    reasoningBenchmarks = [
      {
        id: "reasoning.fact-checking",
        name: "Fact Checking",
        description: "Tests the model's ability to verify factual claims",
        version: "1.0.0",
        taskType: "reasoning",
        category: "fact-checking",
        testCases: factCheckingCases,
        config: {
          maxTokens: 300,
          temperature: 0,
          timeout: 15e3
        }
      },
      {
        id: "reasoning.logical-analysis",
        name: "Logical Analysis",
        description: "Tests formal logic and fallacy detection",
        version: "1.0.0",
        taskType: "reasoning",
        category: "logic",
        testCases: logicalReasoningCases,
        config: {
          maxTokens: 400,
          temperature: 0,
          timeout: 15e3
        }
      },
      {
        id: "reasoning.multi-step",
        name: "Multi-Step Reasoning",
        description: "Tests complex reasoning requiring multiple steps",
        version: "1.0.0",
        taskType: "reasoning",
        category: "multi-step",
        testCases: multiStepReasoningCases,
        config: {
          maxTokens: 500,
          temperature: 0,
          timeout: 2e4
        }
      }
    ];
  }
});

// ../../integrations/server/src/model-eval/benchmarks/suites/function-calling-benchmarks.ts
var toolSelectionCases, parameterExtractionCases, multiToolCases, functionCallingBenchmarks;
var init_function_calling_benchmarks = __esm({
  "../../integrations/server/src/model-eval/benchmarks/suites/function-calling-benchmarks.ts"() {
    "use strict";
    toolSelectionCases = [
      // Clear tool match
      {
        id: "function.selection.weather",
        name: "Weather tool selection",
        input: {
          messages: [
            {
              role: "system",
              content: "You have access to tools. Select the appropriate tool for the user's request."
            },
            { role: "user", content: "What's the weather like in San Francisco?" }
          ],
          tools: [
            {
              name: "get_weather",
              description: "Get current weather for a location",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string", description: "City name" },
                  units: { type: "string", enum: ["celsius", "fahrenheit"] }
                },
                required: ["location"]
              }
            },
            {
              name: "search_web",
              description: "Search the web for information",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string" }
                },
                required: ["query"]
              }
            },
            {
              name: "send_email",
              description: "Send an email",
              parameters: {
                type: "object",
                properties: {
                  to: { type: "string" },
                  subject: { type: "string" },
                  body: { type: "string" }
                },
                required: ["to", "subject", "body"]
              }
            }
          ]
        },
        expected: {
          functionCall: {
            name: "get_weather",
            arguments: { location: "San Francisco" }
          }
        },
        evaluator: "function_call",
        weight: 1,
        tags: ["tool-selection", "basic"]
      },
      // Multiple viable tools
      {
        id: "function.selection.search-vs-web",
        name: "Database vs web search selection",
        input: {
          messages: [
            {
              role: "system",
              content: "You have access to tools. Select the most appropriate tool."
            },
            { role: "user", content: "Find all users named John in our system" }
          ],
          tools: [
            {
              name: "search_users",
              description: "Search for users in the internal database",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  email: { type: "string" }
                }
              }
            },
            {
              name: "search_web",
              description: "Search the public web",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string" }
                }
              }
            }
          ]
        },
        expected: {
          functionCall: {
            name: "search_users"
          }
        },
        evaluator: "function_call",
        weight: 1,
        tags: ["tool-selection", "disambiguation"]
      },
      // Multi-tool scenario
      {
        id: "function.selection.calculator",
        name: "Calculator tool selection",
        input: {
          messages: [
            {
              role: "system",
              content: "You have access to tools. Use them when appropriate."
            },
            { role: "user", content: "What is 15% of 847?" }
          ],
          tools: [
            {
              name: "calculator",
              description: "Perform mathematical calculations",
              parameters: {
                type: "object",
                properties: {
                  expression: { type: "string", description: "Math expression to evaluate" }
                },
                required: ["expression"]
              }
            },
            {
              name: "search_web",
              description: "Search the web",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string" }
                }
              }
            }
          ]
        },
        expected: {
          functionCall: {
            name: "calculator"
          }
        },
        evaluator: "function_call",
        weight: 1,
        tags: ["tool-selection", "math"]
      },
      // No tool needed
      {
        id: "function.selection.no-tool",
        name: "Recognize when no tool is needed",
        input: {
          messages: [
            {
              role: "system",
              content: "You have access to tools. Only use them when necessary. For general knowledge questions, respond directly."
            },
            { role: "user", content: "What is the capital of France?" }
          ],
          tools: [
            {
              name: "get_weather",
              description: "Get current weather",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string" }
                }
              }
            },
            {
              name: "search_web",
              description: "Search the web for current information",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string" }
                }
              }
            }
          ]
        },
        expected: {
          contains: ["Paris"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["tool-selection", "no-tool"]
      }
    ];
    parameterExtractionCases = [
      // Complex parameter extraction
      {
        id: "function.params.multi-param",
        name: "Multiple parameter extraction",
        input: {
          messages: [
            {
              role: "system",
              content: "Extract the required parameters from the user request and call the appropriate function."
            },
            {
              role: "user",
              content: "Book a flight from New York to London on March 15th for 2 adults"
            }
          ],
          tools: [
            {
              name: "book_flight",
              description: "Book a flight",
              parameters: {
                type: "object",
                properties: {
                  origin: { type: "string", description: "Departure city" },
                  destination: { type: "string", description: "Arrival city" },
                  date: { type: "string", description: "Travel date (YYYY-MM-DD)" },
                  passengers: { type: "integer", description: "Number of passengers" }
                },
                required: ["origin", "destination", "date", "passengers"]
              }
            }
          ]
        },
        expected: {
          functionCall: {
            name: "book_flight",
            arguments: {
              origin: "New York",
              destination: "London",
              passengers: 2
            }
          }
        },
        evaluator: "function_call",
        weight: 2,
        tags: ["parameters", "extraction"]
      },
      // Implicit parameter inference
      {
        id: "function.params.implicit",
        name: "Implicit parameter inference",
        input: {
          messages: [
            {
              role: "system",
              content: "Extract parameters, inferring reasonable defaults when not explicitly stated."
            },
            { role: "user", content: "Set a reminder to call mom tomorrow" }
          ],
          tools: [
            {
              name: "create_reminder",
              description: "Create a reminder",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  datetime: { type: "string", description: "ISO datetime" },
                  priority: { type: "string", enum: ["low", "medium", "high"] }
                },
                required: ["title", "datetime"]
              }
            }
          ]
        },
        expected: {
          functionCall: {
            name: "create_reminder",
            arguments: {
              title: "call mom"
            }
          }
        },
        evaluator: "function_call",
        weight: 1,
        tags: ["parameters", "inference"]
      },
      // Nested/complex parameters
      {
        id: "function.params.nested",
        name: "Nested parameter structure",
        input: {
          messages: [
            {
              role: "system",
              content: "Parse the request into the correct parameter structure."
            },
            {
              role: "user",
              content: "Create a new user with name John Doe, email john@example.com, and admin role"
            }
          ],
          tools: [
            {
              name: "create_user",
              description: "Create a new user",
              parameters: {
                type: "object",
                properties: {
                  user: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      email: { type: "string" },
                      role: { type: "string", enum: ["user", "admin", "moderator"] }
                    },
                    required: ["name", "email"]
                  }
                },
                required: ["user"]
              }
            }
          ]
        },
        expected: {
          functionCall: {
            name: "create_user",
            arguments: {
              user: {
                name: "John Doe",
                email: "john@example.com",
                role: "admin"
              }
            }
          }
        },
        evaluator: "function_call",
        weight: 2,
        tags: ["parameters", "nested"]
      }
    ];
    multiToolCases = [
      // Sequential tool use
      {
        id: "function.multi.sequential",
        name: "Sequential tool orchestration",
        input: {
          messages: [
            {
              role: "system",
              content: "You can use multiple tools. Plan and execute the steps needed."
            },
            {
              role: "user",
              content: "Find the weather in Tokyo and convert the temperature to Fahrenheit"
            }
          ],
          tools: [
            {
              name: "get_weather",
              description: "Get weather (returns Celsius)",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string" }
                }
              }
            },
            {
              name: "convert_temperature",
              description: "Convert temperature between units",
              parameters: {
                type: "object",
                properties: {
                  value: { type: "number" },
                  from: { type: "string", enum: ["celsius", "fahrenheit"] },
                  to: { type: "string", enum: ["celsius", "fahrenheit"] }
                }
              }
            }
          ]
        },
        expected: {
          functionCall: {
            name: "get_weather",
            arguments: { location: "Tokyo" }
          }
        },
        evaluator: "function_call",
        weight: 2,
        tags: ["multi-tool", "sequential"]
      },
      // Parallel tool use
      {
        id: "function.multi.parallel",
        name: "Parallel tool invocation",
        input: {
          messages: [
            {
              role: "system",
              content: "You can call multiple tools in parallel when they don't depend on each other."
            },
            {
              role: "user",
              content: "What's the weather in both New York and Los Angeles?"
            }
          ],
          tools: [
            {
              name: "get_weather",
              description: "Get weather for a location",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string" }
                }
              }
            }
          ]
        },
        expected: {
          contains: ["New York", "Los Angeles"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["multi-tool", "parallel"]
      }
    ];
    functionCallingBenchmarks = [
      {
        id: "function_calling.tool-selection",
        name: "Tool Selection",
        description: "Tests the model's ability to select the correct tool for a task",
        version: "1.0.0",
        taskType: "function_calling",
        category: "tool-selection",
        testCases: toolSelectionCases,
        config: {
          maxTokens: 300,
          temperature: 0,
          timeout: 15e3
        }
      },
      {
        id: "function_calling.parameter-extraction",
        name: "Parameter Extraction",
        description: "Tests accurate extraction of function parameters from natural language",
        version: "1.0.0",
        taskType: "function_calling",
        category: "parameter-extraction",
        testCases: parameterExtractionCases,
        config: {
          maxTokens: 400,
          temperature: 0,
          timeout: 15e3
        }
      },
      {
        id: "function_calling.multi-tool",
        name: "Multi-Tool Orchestration",
        description: "Tests ability to orchestrate multiple tools",
        version: "1.0.0",
        taskType: "function_calling",
        category: "multi-tool",
        testCases: multiToolCases,
        config: {
          maxTokens: 500,
          temperature: 0,
          timeout: 2e4
        }
      }
    ];
  }
});

// ../../integrations/server/src/model-eval/benchmarks/benchmark-registry.ts
var benchmark_registry_exports = {};
__export(benchmark_registry_exports, {
  clearBenchmarkRegistry: () => clearBenchmarkRegistry,
  getAllBenchmarks: () => getAllBenchmarks,
  getBenchmark: () => getBenchmark,
  getBenchmarkIds: () => getBenchmarkIds,
  getBenchmarkSummary: () => getBenchmarkSummary,
  getBenchmarksByCategory: () => getBenchmarksByCategory,
  getBenchmarksByTaskType: () => getBenchmarksByTaskType,
  hasBenchmark: () => hasBenchmark,
  initializeBuiltinBenchmarks: () => initializeBuiltinBenchmarks,
  registerBenchmark: () => registerBenchmark,
  registerBenchmarks: () => registerBenchmarks
});
function registerBenchmark(benchmark) {
  if (benchmarkRegistry.has(benchmark.id)) {
    console.warn(`[benchmark-registry] Overwriting existing benchmark: ${benchmark.id}`);
  }
  benchmarkRegistry.set(benchmark.id, benchmark);
}
function registerBenchmarks(benchmarks) {
  for (const benchmark of benchmarks) {
    registerBenchmark(benchmark);
  }
}
function getBenchmark(id) {
  return benchmarkRegistry.get(id);
}
function getAllBenchmarks() {
  return Array.from(benchmarkRegistry.values());
}
function getBenchmarksByTaskType(taskType) {
  return Array.from(benchmarkRegistry.values()).filter(
    (b) => b.taskType === taskType
  );
}
function getBenchmarksByCategory(category) {
  return Array.from(benchmarkRegistry.values()).filter(
    (b) => b.category === category
  );
}
function getBenchmarkIds() {
  return Array.from(benchmarkRegistry.keys());
}
function hasBenchmark(id) {
  return benchmarkRegistry.has(id);
}
function getBenchmarkSummary() {
  const benchmarks = getAllBenchmarks();
  const byTaskType = {};
  const byCategory = {};
  for (const benchmark of benchmarks) {
    byTaskType[benchmark.taskType] = (byTaskType[benchmark.taskType] || 0) + 1;
    byCategory[benchmark.category] = (byCategory[benchmark.category] || 0) + 1;
  }
  return {
    total: benchmarks.length,
    byTaskType,
    byCategory
  };
}
function clearBenchmarkRegistry() {
  benchmarkRegistry.clear();
}
function initializeBuiltinBenchmarks() {
  registerBenchmarks(routingBenchmarks);
  registerBenchmarks(codeReviewBenchmarks);
  registerBenchmarks(reasoningBenchmarks);
  registerBenchmarks(functionCallingBenchmarks);
  const summary = getBenchmarkSummary();
  console.log(
    `[benchmark-registry] Initialized ${summary.total} built-in benchmarks:`,
    summary.byTaskType
  );
}
var benchmarkRegistry;
var init_benchmark_registry = __esm({
  "../../integrations/server/src/model-eval/benchmarks/benchmark-registry.ts"() {
    "use strict";
    init_routing_benchmarks();
    init_code_review_benchmarks();
    init_reasoning_benchmarks();
    init_function_calling_benchmarks();
    benchmarkRegistry = /* @__PURE__ */ new Map();
  }
});

// ../../integrations/server/src/memory-schema.ts
var MEMORY_SCHEMA_SQL;
var init_memory_schema = __esm({
  "../../integrations/server/src/memory-schema.ts"() {
    "use strict";
    MEMORY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS integration_execution_logs (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(255) NOT NULL,
    org_id VARCHAR(255),
    provider TEXT NOT NULL,
    operation TEXT NOT NULL,
    model TEXT,
    request_id VARCHAR(255) NOT NULL,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    estimated_cost_cents INTEGER,
    metadata JSON DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_execution_logs_user_id ON integration_execution_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_execution_logs_org_id ON integration_execution_logs(org_id);
  CREATE INDEX IF NOT EXISTS idx_execution_logs_provider ON integration_execution_logs(provider);
  CREATE INDEX IF NOT EXISTS idx_execution_logs_created ON integration_execution_logs(created_at);

  -- Model Evaluations table
  CREATE TABLE IF NOT EXISTS model_evaluations (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    provider VARCHAR(100) NOT NULL,
    model_id VARCHAR(255) NOT NULL,
    benchmark_id VARCHAR(255) NOT NULL,
    benchmark_version VARCHAR(50) NOT NULL,
    overall_score REAL NOT NULL,
    accuracy REAL NOT NULL,
    latency_p50_ms INTEGER NOT NULL,
    latency_p95_ms INTEGER NOT NULL,
    latency_p99_ms INTEGER,
    total_input_tokens INTEGER NOT NULL,
    total_output_tokens INTEGER NOT NULL,
    estimated_cost_cents REAL NOT NULL,
    test_case_results JSON NOT NULL,
    run_config JSON NOT NULL,
    org_id VARCHAR(100),
    scope VARCHAR(20) NOT NULL DEFAULT 'global',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_model_evaluations_provider ON model_evaluations(provider);
  CREATE INDEX IF NOT EXISTS idx_model_evaluations_model ON model_evaluations(model_id);
  CREATE INDEX IF NOT EXISTS idx_model_evaluations_benchmark ON model_evaluations(benchmark_id);
  CREATE INDEX IF NOT EXISTS idx_model_evaluations_status ON model_evaluations(status);

  -- Model Scores table (aggregated)
  CREATE TABLE IF NOT EXISTS model_scores (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    provider VARCHAR(100) NOT NULL,
    model_id VARCHAR(255) NOT NULL,
    task_type VARCHAR(50) NOT NULL,
    quality_score REAL NOT NULL,
    speed_score REAL NOT NULL,
    cost_score REAL NOT NULL,
    reliability_score REAL NOT NULL,
    composite_score REAL NOT NULL,
    evaluation_ids JSON NOT NULL DEFAULT '[]',
    org_id VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(provider, model_id, task_type)
  );

  CREATE INDEX IF NOT EXISTS idx_model_scores_provider ON model_scores(provider);
  CREATE INDEX IF NOT EXISTS idx_model_scores_task_type ON model_scores(task_type);
  CREATE INDEX IF NOT EXISTS idx_model_scores_composite ON model_scores(composite_score);

  -- Model Recommendations cache
  CREATE TABLE IF NOT EXISTS model_recommendations (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    task_type VARCHAR(50) NOT NULL,
    constraints JSON,
    recommendations JSON NOT NULL,
    cache_key VARCHAR(255) NOT NULL UNIQUE,
    org_id VARCHAR(100),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_model_recommendations_task_type ON model_recommendations(task_type);
  CREATE INDEX IF NOT EXISTS idx_model_recommendations_cache_key ON model_recommendations(cache_key);
  CREATE INDEX IF NOT EXISTS idx_model_recommendations_expires ON model_recommendations(expires_at);

  -- Benchmark Definitions table
  CREATE TABLE IF NOT EXISTS benchmark_definitions (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    task_type VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    test_cases JSON NOT NULL,
    config JSON,
    author VARCHAR(255),
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_benchmark_definitions_task_type ON benchmark_definitions(task_type);
  CREATE INDEX IF NOT EXISTS idx_benchmark_definitions_category ON benchmark_definitions(category);

  -- Evaluation Schedules table
  CREATE TABLE IF NOT EXISTS evaluation_schedules (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    provider VARCHAR(100),
    model_id VARCHAR(255),
    benchmark_id VARCHAR(255),
    task_type VARCHAR(50),
    cron_expression VARCHAR(100) NOT NULL,
    interval_hours INTEGER,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    last_error TEXT,
    org_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_evaluation_schedules_enabled ON evaluation_schedules(enabled);
  CREATE INDEX IF NOT EXISTS idx_evaluation_schedules_next_run ON evaluation_schedules(next_run_at);

  -- Channel Connections table (for multi-channel messaging)
  CREATE TABLE IF NOT EXISTS channel_connections (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    integration_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    org_id VARCHAR(255),
    channel_type VARCHAR(50) NOT NULL,
    channel_account_id VARCHAR(255),
    channel_account_name VARCHAR(255),
    credential_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    session_data JSON DEFAULT '{}',
    qr_code TEXT,
    qr_expires_at TIMESTAMP,
    qr_attempts INTEGER DEFAULT 0,
    webhook_url TEXT,
    webhook_secret TEXT,
    webhook_verified BOOLEAN DEFAULT false,
    last_ping_at TIMESTAMP,
    last_message_at TIMESTAMP,
    last_error_at TIMESTAMP,
    last_error TEXT,
    error_count INTEGER DEFAULT 0,
    consecutive_errors INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    metadata JSON DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    connected_at TIMESTAMP,
    disconnected_at TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_channel_connections_user_id ON channel_connections(user_id);
  CREATE INDEX IF NOT EXISTS idx_channel_connections_org_id ON channel_connections(org_id);
  CREATE INDEX IF NOT EXISTS idx_channel_connections_channel_type ON channel_connections(channel_type);
  CREATE INDEX IF NOT EXISTS idx_channel_connections_status ON channel_connections(status);

  -- Proxy Usage table (tracks usage when org-wide credentials are used)
  CREATE TABLE IF NOT EXISTS proxy_usage (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(255) NOT NULL,
    org_id VARCHAR(255) NOT NULL,
    integration_key VARCHAR(255) NOT NULL,
    operation VARCHAR(500) NOT NULL,
    credential_id VARCHAR(255) NOT NULL,
    request_id VARCHAR(100),
    success BOOLEAN NOT NULL DEFAULT true,
    status_code INTEGER,
    error_message TEXT,
    duration_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    estimated_cost_micros INTEGER,
    metadata JSON DEFAULT '{}',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_proxy_usage_user_id ON proxy_usage(user_id);
  CREATE INDEX IF NOT EXISTS idx_proxy_usage_org_id ON proxy_usage(org_id);
  CREATE INDEX IF NOT EXISTS idx_proxy_usage_integration ON proxy_usage(integration_key);
  CREATE INDEX IF NOT EXISTS idx_proxy_usage_timestamp ON proxy_usage(timestamp);
  CREATE INDEX IF NOT EXISTS idx_proxy_usage_org_timestamp ON proxy_usage(org_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_proxy_usage_credential ON proxy_usage(credential_id);
`;
  }
});

// ../../integrations/server/src/db.ts
var db_exports = {};
__export(db_exports, {
  clearSessionContext: () => clearSessionContext,
  close: () => close,
  database: () => database,
  db: () => db,
  exportToFile: () => exportToFile,
  isMemory: () => isMemory,
  pool: () => pool,
  setRLSContext: () => setRLSContext,
  setSessionContext: () => setSessionContext
});
import { initializeDatabase, setSessionContext, clearSessionContext } from "@symbia/db";
async function setRLSContext(context) {
  await setSessionContext(pool, {
    orgId: context.orgId || "",
    userId: context.userId || "anonymous",
    isSuperAdmin: context.isSuperAdmin,
    capabilities: context.capabilities,
    serviceId: "integrations"
  });
}
var database, db, pool, isMemory, exportToFile, close;
var init_db = __esm({
  "../../integrations/server/src/db.ts"() {
    "use strict";
    init_schema();
    init_memory_schema();
    database = initializeDatabase({
      serviceId: "integrations-service",
      memorySchema: MEMORY_SCHEMA_SQL,
      memoryDbEnvVar: "INTEGRATIONS_USE_MEMORY_DB"
    }, schema_exports);
    ({ db, pool, isMemory, exportToFile, close } = database);
  }
});

// ../../integrations/server/src/routes.ts
import { randomUUID } from "crypto";
import { z as z3 } from "zod";
import { safeFetch, EgressError } from "@symbia/egress";

// ../../integrations/server/src/config.ts
import dotenv from "dotenv";
import { resolveServicePort, resolveServiceUrl, ServiceId, ServicePorts } from "@symbia/sys";
dotenv.config();
var config = {
  port: resolveServicePort(ServiceId.INTEGRATIONS),
  databaseUrl: process.env.DATABASE_URL || "",
  identityServiceUrl: resolveServiceUrl(ServiceId.IDENTITY),
  serviceId: process.env.SERVICE_ID || ServiceId.INTEGRATIONS,
  serviceName: process.env.SERVICE_NAME || "Symbia Integrations",
  // Rate limiting (disabled by default)
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === "true",
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  rateLimitUserLimit: parseInt(process.env.RATE_LIMIT_USER || "100", 10),
  rateLimitOrgLimit: parseInt(process.env.RATE_LIMIT_ORG || "500", 10),
  rateLimitProviderLimit: parseInt(process.env.RATE_LIMIT_PROVIDER || "1000", 10),
  /**
   * Where a browser is sent when an OAuth callback fails.
   *
   * This is a redirect for the *user's* browser, so it must be an externally
   * reachable URL. The service cannot derive one — it knows the port it was
   * registered on, not the address a browser outside the network reaches it
   * at — so a real deployment has to say. `oauthRedirectConfigured` records
   * whether anyone did.
   *
   * The previous fallback was a literal `http://localhost:3000`, a port retired
   * when service-admin moved to 9000, pointing at a marketing site that is no
   * longer in this repo. Neither OAUTH_ERROR_REDIRECT_URL nor WEBSITE_URL is
   * set in .env.example or compose, so that dead address was not an edge case:
   * it was the only path this code ever took.
   */
  oauthErrorRedirectUrl: process.env.OAUTH_ERROR_REDIRECT_URL || process.env.WEBSITE_URL || `http://localhost:${ServicePorts[ServiceId.CONTROL_CENTER]}`,
  oauthRedirectConfigured: Boolean(
    process.env.OAUTH_ERROR_REDIRECT_URL || process.env.WEBSITE_URL
  )
};

// ../../integrations/server/src/routes.ts
init_schema();
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ../../integrations/server/src/providers/base.ts
var providerRegistry = /* @__PURE__ */ new Map();
function registerProvider(adapter) {
  providerRegistry.set(adapter.name, adapter);
}
function getProvider(name) {
  return providerRegistry.get(name);
}
function getRegisteredProviders() {
  return Array.from(providerRegistry.keys());
}
function normalizeFinishReason(raw) {
  if (!raw) return "stop";
  const normalized = raw.toLowerCase();
  if (normalized === "stop" || normalized === "end_turn") return "stop";
  if (normalized === "length" || normalized === "max_tokens") return "length";
  if (normalized === "content_filter" || normalized === "safety") return "content_filter";
  if (normalized === "tool_calls" || normalized === "function_call") return "tool_calls";
  if (normalized === "incomplete") return "incomplete";
  return "stop";
}

// ../../integrations/server/src/providers/openai.ts
var OPENAI_BASE_URL = "https://api.openai.com/v1";
var OpenAIProvider = class {
  name = "openai";
  supportedOperations = ["chat.completions", "responses", "embeddings"];
  async execute(options) {
    const { operation, model, params, apiKey, timeout } = options;
    if (operation === "responses") {
      return this.executeResponses(options);
    }
    if (operation !== "chat.completions") {
      throw new Error(`OpenAI provider does not support operation: ${operation}`);
    }
    const url = `${OPENAI_BASE_URL}/chat/completions`;
    const body = this.buildChatRequestBody(model, params);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }
    const raw = await response.json();
    return this.normalizeChatResponse(raw);
  }
  /**
   * Execute using the Responses API (stateful conversations)
   * Supports both standard and compact modes
   */
  async executeResponses(options) {
    const { model, params, apiKey, timeout } = options;
    const useCompact = params.compactMode === true;
    const url = useCompact ? `${OPENAI_BASE_URL}/responses/compact` : `${OPENAI_BASE_URL}/responses`;
    const body = this.buildResponsesRequestBody(model, params);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI Responses API error: ${error.error?.message || response.statusText}`);
    }
    const raw = await response.json();
    return this.normalizeResponsesResponse(raw);
  }
  async embed(options) {
    const { model, params, apiKey, timeout } = options;
    const url = `${OPENAI_BASE_URL}/embeddings`;
    const body = {
      model,
      input: params.input || params.text
    };
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }
    const raw = await response.json();
    return this.normalizeEmbeddingResponse(raw);
  }
  validateParams(operation, params) {
    const errors = [];
    if (operation === "chat.completions") {
      if (!params.messages && !params.prompt) {
        errors.push("Either messages or prompt is required");
      }
    } else if (operation === "embeddings") {
      if (!params.input && !params.text) {
        errors.push("Either input or text is required for embeddings");
      }
    }
    return { valid: errors.length === 0, errors };
  }
  estimateTokens(text3) {
    return Math.ceil(text3.length / 4);
  }
  /**
   * List available models from OpenAI
   * When API key is provided, fetches dynamically from OpenAI API
   */
  async listModels(apiKey) {
    const modelMetadata = {
      // ==========================================================================
      // GPT-5.2 Series (Released Jan 2026) - Latest flagship models
      // ==========================================================================
      "gpt-5.2": {
        name: "GPT-5.2",
        description: "Latest flagship model with breakthrough capabilities, 90% cached discount",
        contextWindow: 1e6,
        // 1M context
        maxOutputTokens: 1e5,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 1.75,
        // $1.75/1M input (90% discount with caching)
        outputPricing: 14
        // $14/1M output
      },
      "gpt-5.2-thinking": {
        name: "GPT-5.2 Thinking",
        description: "Extended reasoning with visible chain-of-thought, ideal for complex problems",
        contextWindow: 1e6,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "vision", "function_calling", "reasoning"],
        inputPricing: 3.5,
        outputPricing: 28
      },
      "gpt-5.2-pro": {
        name: "GPT-5.2 Pro",
        description: "Maximum compute version for hardest problems",
        contextWindow: 1e6,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "vision", "function_calling", "reasoning"],
        inputPricing: 15,
        outputPricing: 60
      },
      "gpt-5.2-codex": {
        name: "GPT-5.2 Codex",
        description: "Specialized for code generation, editing, and analysis",
        contextWindow: 1e6,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "vision", "function_calling", "completion"],
        inputPricing: 2,
        outputPricing: 16
      },
      // ==========================================================================
      // o-Series Reasoning Models (o3/o4 - Jan 2026)
      // Reasoning effort: none, low, medium, high, xhigh
      // ==========================================================================
      "o3": {
        name: "o3",
        description: "Advanced reasoning model with adaptive compute (successor to o1)",
        contextWindow: 2e5,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "reasoning", "vision", "function_calling"],
        inputPricing: 10,
        outputPricing: 40
      },
      "o4-mini": {
        name: "o4 Mini",
        description: "Fast, efficient reasoning for everyday tasks",
        contextWindow: 2e5,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "reasoning", "function_calling"],
        inputPricing: 1.1,
        outputPricing: 4.4
      },
      "o3-pro": {
        name: "o3 Pro",
        description: "Extended compute reasoning for hardest problems, supports xhigh effort",
        contextWindow: 2e5,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "reasoning", "vision", "function_calling"],
        inputPricing: 150,
        outputPricing: 600
      },
      "o3-deep-research": {
        name: "o3 Deep Research",
        description: "Autonomous multi-step research with web access and extended reasoning",
        contextWindow: 2e5,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "reasoning", "vision", "function_calling"],
        inputPricing: 50,
        outputPricing: 200
      },
      "o4-mini-deep-research": {
        name: "o4 Mini Deep Research",
        description: "Cost-effective autonomous research with o4-mini backbone",
        contextWindow: 2e5,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "reasoning", "function_calling"],
        inputPricing: 5,
        outputPricing: 20
      },
      // ==========================================================================
      // Legacy o-Series (o1) - Still available
      // ==========================================================================
      "o1": {
        name: "o1",
        description: "Original reasoning model (consider o3 or o4-mini instead)",
        contextWindow: 2e5,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "reasoning", "vision", "function_calling"],
        inputPricing: 15,
        outputPricing: 60
      },
      "o1-mini": {
        name: "o1 Mini",
        description: "Original fast reasoning model (consider o4-mini instead)",
        contextWindow: 128e3,
        maxOutputTokens: 65536,
        capabilities: ["chat", "reasoning"],
        inputPricing: 3,
        outputPricing: 12
      },
      // ==========================================================================
      // GPT-4o Series - Previous generation flagship
      // ==========================================================================
      "gpt-4o": {
        name: "GPT-4o",
        description: "Multimodal model, great for complex tasks (previous generation)",
        contextWindow: 128e3,
        maxOutputTokens: 16384,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 2.5,
        outputPricing: 10
      },
      "gpt-4o-mini": {
        name: "GPT-4o Mini",
        description: "Fast and affordable for simpler tasks",
        contextWindow: 128e3,
        maxOutputTokens: 16384,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 0.15,
        outputPricing: 0.6
      },
      // ==========================================================================
      // Legacy GPT-4 Models
      // ==========================================================================
      "gpt-4-turbo": {
        name: "GPT-4 Turbo",
        description: "GPT-4 Turbo with vision capabilities",
        contextWindow: 128e3,
        maxOutputTokens: 4096,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 10,
        outputPricing: 30
      },
      "gpt-4": {
        name: "GPT-4",
        description: "Original GPT-4 model (legacy)",
        contextWindow: 8192,
        maxOutputTokens: 4096,
        capabilities: ["chat", "function_calling"],
        inputPricing: 30,
        outputPricing: 60,
        deprecated: true
      },
      "gpt-3.5-turbo": {
        name: "GPT-3.5 Turbo",
        description: "Fast and economical for simple tasks (legacy)",
        contextWindow: 16385,
        maxOutputTokens: 4096,
        capabilities: ["chat", "function_calling"],
        inputPricing: 0.5,
        outputPricing: 1.5,
        deprecated: true
      },
      // ==========================================================================
      // Embedding Models
      // ==========================================================================
      "text-embedding-3-large": {
        name: "Text Embedding 3 Large",
        description: "Most capable embedding model, 3072 dimensions",
        contextWindow: 8191,
        capabilities: ["embedding"],
        inputPricing: 0.13
      },
      "text-embedding-3-small": {
        name: "Text Embedding 3 Small",
        description: "Efficient embedding model, 1536 dimensions",
        contextWindow: 8191,
        capabilities: ["embedding"],
        inputPricing: 0.02
      },
      "text-embedding-ada-002": {
        name: "Text Embedding Ada 002",
        description: "Legacy embedding model",
        contextWindow: 8191,
        capabilities: ["embedding"],
        inputPricing: 0.1,
        deprecated: true
      }
    };
    if (apiKey) {
      try {
        const response = await fetch(`${OPENAI_BASE_URL}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        if (response.ok) {
          const data = await response.json();
          const relevantModels = data.data.filter(
            (m) => m.id.startsWith("gpt-") || // gpt-4o, gpt-4, gpt-3.5, gpt-5.2
            m.id.startsWith("o1") || // o1, o1-mini, o1-pro
            m.id.startsWith("o3") || // o3, o3-pro, o3-deep-research
            m.id.startsWith("o4") || // o4-mini, o4-mini-deep-research
            m.id.includes("embedding")
          ).filter(
            (m) => (
              // Exclude internal/fine-tuned models
              !m.id.includes("ft:") && !m.id.includes(":ft-") && !m.id.includes("-instruct") && m.owned_by !== "user"
            )
          ).sort((a, b) => b.created - a.created);
          return relevantModels.map((m) => {
            const metadata = modelMetadata[m.id] || this.inferModelMetadata(m.id);
            return {
              id: m.id,
              name: metadata.name || this.formatModelName(m.id),
              description: metadata.description,
              contextWindow: metadata.contextWindow,
              maxOutputTokens: metadata.maxOutputTokens,
              capabilities: metadata.capabilities || ["chat"],
              inputPricing: metadata.inputPricing,
              outputPricing: metadata.outputPricing,
              deprecated: metadata.deprecated
            };
          });
        }
      } catch (error) {
        console.warn("[openai] Failed to fetch models from API:", error);
      }
    }
    return [
      // GPT-5.2 series (newest - Jan 2026)
      { id: "gpt-5.2", ...modelMetadata["gpt-5.2"] },
      { id: "gpt-5.2-thinking", ...modelMetadata["gpt-5.2-thinking"] },
      { id: "gpt-5.2-pro", ...modelMetadata["gpt-5.2-pro"] },
      { id: "gpt-5.2-codex", ...modelMetadata["gpt-5.2-codex"] },
      // o-series reasoning (o3/o4 - Jan 2026)
      { id: "o4-mini", ...modelMetadata["o4-mini"] },
      { id: "o3", ...modelMetadata["o3"] },
      { id: "o3-pro", ...modelMetadata["o3-pro"] },
      { id: "o3-deep-research", ...modelMetadata["o3-deep-research"] },
      { id: "o4-mini-deep-research", ...modelMetadata["o4-mini-deep-research"] },
      // GPT-4o series (previous generation)
      { id: "gpt-4o", ...modelMetadata["gpt-4o"] },
      { id: "gpt-4o-mini", ...modelMetadata["gpt-4o-mini"] },
      // Legacy o1 series
      { id: "o1", ...modelMetadata["o1"] },
      { id: "o1-mini", ...modelMetadata["o1-mini"] },
      // Embeddings
      { id: "text-embedding-3-large", ...modelMetadata["text-embedding-3-large"] },
      { id: "text-embedding-3-small", ...modelMetadata["text-embedding-3-small"] }
    ];
  }
  /**
   * Format model ID into display name
   */
  formatModelName(id) {
    return id.replace("gpt-5.2", "GPT-5.2").replace("gpt-", "GPT-").replace("-turbo", " Turbo").replace("-mini", " Mini").replace("-thinking", " Thinking").replace("-codex", " Codex").replace("-pro", " Pro").replace("-deep-research", " Deep Research").replace("-preview", " Preview").replace(/-(\d{4}-\d{2}-\d{2})/, " ($1)");
  }
  /**
   * Infer metadata for unknown models based on ID patterns
   */
  inferModelMetadata(id) {
    if (id.includes("embedding")) {
      return {
        capabilities: ["embedding"],
        contextWindow: 8191
      };
    }
    if (id.startsWith("gpt-5.2")) {
      const isReasoning = id.includes("thinking") || id.includes("pro");
      return {
        capabilities: isReasoning ? ["chat", "vision", "function_calling", "reasoning"] : ["chat", "vision", "function_calling"],
        contextWindow: 1e6,
        maxOutputTokens: 1e5
      };
    }
    if (id.startsWith("o1") || id.startsWith("o3") || id.startsWith("o4")) {
      const isDeepResearch = id.includes("deep-research");
      return {
        capabilities: ["chat", "reasoning", "function_calling"],
        contextWindow: 2e5,
        maxOutputTokens: 1e5,
        // Deep research models have web access
        ...isDeepResearch && { description: "Autonomous research with web access" }
      };
    }
    if (id.startsWith("gpt-4o")) {
      return {
        capabilities: ["chat", "vision", "function_calling"],
        contextWindow: 128e3,
        maxOutputTokens: 16384
      };
    }
    if (id.startsWith("gpt-4")) {
      return {
        capabilities: ["chat", "function_calling"],
        contextWindow: 128e3,
        maxOutputTokens: 4096
      };
    }
    if (id.startsWith("gpt-3.5")) {
      return {
        capabilities: ["chat", "function_calling"],
        contextWindow: 16385,
        maxOutputTokens: 4096
      };
    }
    return {
      capabilities: ["chat"]
    };
  }
  /**
   * Check if a model is an o-series reasoning model
   */
  isReasoningModel(model) {
    return model.startsWith("o1") || model.startsWith("o3") || model.startsWith("o4") || model.includes("-thinking");
  }
  buildChatRequestBody(model, params) {
    const messages = params.messages || [{ role: "user", content: params.prompt }];
    return {
      model,
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 1024,
      ...this.filterParams(params)
    };
  }
  filterParams(params) {
    const { messages, prompt, temperature, maxTokens, ...rest } = params;
    return rest;
  }
  /**
   * Build request body for Responses API
   * Supports GPT-5.2 and o-series models with full reasoning and preamble support
   */
  buildResponsesRequestBody(model, params) {
    const body = {
      model
    };
    if (params.messages) {
      body.input = params.messages;
    } else if (params.prompt) {
      body.input = params.prompt;
    }
    if (params.previousResponseId) {
      body.previous_response_id = params.previousResponseId;
    }
    if (params.instructions || params.systemPrompt || params.system) {
      body.instructions = params.instructions || params.systemPrompt || params.system;
    }
    if (params.temperature !== void 0) {
      body.temperature = this.isReasoningModel(model) ? 1 : params.temperature;
    }
    if (params.maxTokens !== void 0) {
      body.max_output_tokens = params.maxTokens;
    }
    if (params.tools) {
      body.tools = params.tools;
    }
    if (params.toolChoice) {
      body.tool_choice = params.toolChoice;
    }
    if (params.enablePreambles !== void 0) {
      body.enable_preambles = params.enablePreambles;
    }
    if (params.reasoningEffort || this.isReasoningModel(model)) {
      const reasoning = {};
      if (params.reasoningEffort) {
        reasoning.effort = params.reasoningEffort;
      }
      if (params.showReasoning !== void 0) {
        reasoning.show_reasoning = params.showReasoning;
      }
      if (Object.keys(reasoning).length > 0) {
        body.reasoning = reasoning;
      }
    }
    if (params.compactMode) {
      body.compact = true;
    }
    if (params.responseFormat === "json" || params.responseFormat === "json_schema") {
      body.text = {
        format: params.responseFormat === "json_schema" ? { type: "json_schema", json_schema: params.jsonSchema } : { type: "json_object" }
      };
    }
    if (params.parallelToolCalls !== void 0) {
      body.parallel_tool_calls = params.parallelToolCalls;
    }
    return body;
  }
  /**
   * Normalize Responses API response
   * Handles message, reasoning, preamble, and tool call outputs
   */
  normalizeResponsesResponse(raw) {
    const textContent = raw.output?.filter((o) => o.type === "message").flatMap((o) => o.content || []).filter((c) => c.type === "output_text").map((c) => c.text).join("\n") || "";
    const reasoningContent = raw.output?.filter((o) => o.type === "reasoning").flatMap((o) => o.content || []).filter((c) => c.type === "reasoning_text").map((c) => c.text).join("\n") || void 0;
    const preambles = raw.output?.filter((o) => o.type === "preamble").map((o) => o.preamble_text).filter(Boolean);
    const toolCalls = raw.output?.filter((o) => o.type === "tool_call").map((tc) => ({
      id: tc.id,
      type: "function",
      function: {
        name: tc.name || "",
        arguments: tc.arguments || "{}"
      }
    }));
    return {
      provider: "openai",
      model: raw.model,
      content: textContent,
      usage: {
        promptTokens: raw.usage?.input_tokens || 0,
        completionTokens: raw.usage?.output_tokens || 0,
        totalTokens: raw.usage?.total_tokens || 0
      },
      finishReason: raw.status === "completed" ? toolCalls && toolCalls.length > 0 ? "tool_calls" : "stop" : raw.status === "incomplete" ? "length" : "error",
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : void 0,
      metadata: {
        id: raw.id,
        createdAt: raw.created_at,
        status: raw.status,
        // Include response ID for conversation continuity
        responseId: raw.id,
        // Include reasoning output if present (o-series models)
        reasoning: reasoningContent,
        // Include preambles if present (GPT-5.2+)
        preambles: preambles && preambles.length > 0 ? preambles : void 0,
        // Include token breakdown
        reasoningTokens: raw.usage?.reasoning_tokens,
        cachedTokens: raw.usage?.cached_tokens
      }
    };
  }
  normalizeChatResponse(raw) {
    const choice = raw.choices?.[0];
    return {
      provider: "openai",
      model: raw.model,
      content: choice?.message?.content || "",
      usage: {
        promptTokens: raw.usage?.prompt_tokens || 0,
        completionTokens: raw.usage?.completion_tokens || 0,
        totalTokens: raw.usage?.total_tokens || 0
      },
      finishReason: normalizeFinishReason(choice?.finish_reason),
      toolCalls: choice?.message?.tool_calls?.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments
        }
      })),
      metadata: {
        id: raw.id,
        created: raw.created,
        systemFingerprint: raw.system_fingerprint
      }
    };
  }
  normalizeEmbeddingResponse(raw) {
    return {
      provider: "openai",
      model: raw.model,
      embeddings: raw.data.map((d) => d.embedding),
      usage: {
        promptTokens: raw.usage.prompt_tokens,
        totalTokens: raw.usage.total_tokens
      },
      metadata: {}
    };
  }
};
var openaiProvider = new OpenAIProvider();

// ../../integrations/server/src/providers/huggingface.ts
var HUGGINGFACE_ROUTER_URL = "https://router.huggingface.co";
function hasImagePart(messages) {
  return Boolean(
    messages?.some(
      (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url")
    )
  );
}
var HuggingFaceProvider = class {
  name = "huggingface";
  supportedOperations = [
    "text.generation",
    "chat.completions",
    "image.description",
    "embeddings"
  ];
  async execute(options) {
    const { model, params, apiKey, timeout } = options;
    const url = `${HUGGINGFACE_ROUTER_URL}/v1/chat/completions`;
    const body = this.buildChatBody(model, params);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const errorMsg = typeof error.error === "object" ? error.error?.message : error.error;
      throw new Error(`HuggingFace API error: ${errorMsg || response.statusText}`);
    }
    const raw = await response.json();
    return this.normalizeChatResponse(raw);
  }
  async embed(options) {
    const { model, params, apiKey, timeout } = options;
    const url = `${HUGGINGFACE_ROUTER_URL}/v1/embeddings`;
    const body = {
      model,
      input: params.input || params.text
    };
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const errorMsg = typeof error.error === "object" ? error.error?.message : error.error;
      throw new Error(`HuggingFace API error: ${errorMsg || response.statusText}`);
    }
    const raw = await response.json();
    return this.normalizeEmbeddingResponse(raw, model);
  }
  validateParams(operation, params) {
    const errors = [];
    if (operation === "text.generation" || operation === "chat.completions") {
      if (!params.messages && !params.prompt) {
        errors.push("Either messages or prompt is required");
      }
    } else if (operation === "image.description") {
      const messages = params.messages;
      if (!messages) {
        errors.push("messages is required for image.description");
      } else if (!hasImagePart(messages)) {
        errors.push(
          "image.description requires a message containing an image_url part; none was present"
        );
      }
    } else if (operation === "embeddings") {
      if (!params.input && !params.text) {
        errors.push("Either input or text is required for embeddings");
      }
    }
    return { valid: errors.length === 0, errors };
  }
  estimateTokens(text3) {
    return Math.ceil(text3.length / 4);
  }
  /**
   * List popular models available via HuggingFace Inference API
   * This is a curated list of well-supported models
   */
  async listModels(_apiKey) {
    return [
      // Vision-language models.
      //
      // NOT VERIFIED AGAINST THE ROUTER. This is a curated list, and curation
      // is a claim about the world that nobody here has checked — no request
      // has been made with these ids because no HuggingFace credential is
      // stored for any user on this stack (measured 7 Aug 2026: the status
      // endpoint says configured, /execute returns 401). They are listed so
      // that capability selection has candidates and so the first real failure
      // is a specific "model not served" from the router rather than an empty
      // list that reads as "vision is impossible".
      {
        id: "Qwen/Qwen2.5-VL-7B-Instruct",
        name: "Qwen 2.5 VL 7B Instruct",
        description: "Vision-language model: describes and reasons over images",
        contextWindow: 32768,
        maxOutputTokens: 4096,
        capabilities: ["chat", "vision"]
      },
      {
        id: "meta-llama/Llama-3.2-11B-Vision-Instruct",
        name: "Llama 3.2 11B Vision Instruct",
        description: "Meta vision-language model",
        contextWindow: 128e3,
        maxOutputTokens: 4096,
        capabilities: ["chat", "vision"]
      },
      {
        id: "HuggingFaceM4/idefics2-8b",
        name: "IDEFICS2 8B",
        description: "Open multimodal model for image understanding",
        contextWindow: 32768,
        maxOutputTokens: 2048,
        capabilities: ["chat", "vision"]
      },
      // Meta Llama 3.x series
      {
        id: "meta-llama/Llama-3.3-70B-Instruct",
        name: "Llama 3.3 70B Instruct",
        description: "Latest Llama with improved reasoning and multilingual",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      {
        id: "meta-llama/Llama-3.2-3B-Instruct",
        name: "Llama 3.2 3B Instruct",
        description: "Efficient small Llama for edge deployment",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat"]
      },
      {
        id: "meta-llama/Llama-3.2-1B-Instruct",
        name: "Llama 3.2 1B Instruct",
        description: "Smallest Llama for low-resource environments",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat"]
      },
      {
        id: "meta-llama/Llama-3.1-8B-Instruct",
        name: "Llama 3.1 8B Instruct",
        description: "Versatile medium-size Llama model",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      {
        id: "meta-llama/Llama-3.1-70B-Instruct",
        name: "Llama 3.1 70B Instruct",
        description: "Powerful large Llama model",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      // Mistral models on HuggingFace
      {
        id: "mistralai/Mistral-7B-Instruct-v0.3",
        name: "Mistral 7B Instruct v0.3",
        description: "Efficient open-weight Mistral model",
        contextWindow: 32768,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      {
        id: "mistralai/Mixtral-8x7B-Instruct-v0.1",
        name: "Mixtral 8x7B Instruct",
        description: "Mixture of experts model",
        contextWindow: 32768,
        maxOutputTokens: 8192,
        capabilities: ["chat"]
      },
      {
        id: "mistralai/Mistral-Nemo-Instruct-2407",
        name: "Mistral Nemo 12B",
        description: "Compact yet capable Mistral model",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      // Microsoft Phi series
      {
        id: "microsoft/Phi-3.5-mini-instruct",
        name: "Phi 3.5 Mini",
        description: "Small but powerful reasoning model",
        contextWindow: 128e3,
        maxOutputTokens: 4096,
        capabilities: ["chat"]
      },
      {
        id: "microsoft/Phi-3-mini-4k-instruct",
        name: "Phi 3 Mini 4K",
        description: "Efficient Microsoft model",
        contextWindow: 4096,
        maxOutputTokens: 4096,
        capabilities: ["chat"]
      },
      {
        id: "microsoft/Phi-3-medium-128k-instruct",
        name: "Phi 3 Medium 128K",
        description: "Medium-size with long context",
        contextWindow: 128e3,
        maxOutputTokens: 4096,
        capabilities: ["chat"]
      },
      // Qwen models
      {
        id: "Qwen/Qwen2.5-72B-Instruct",
        name: "Qwen 2.5 72B Instruct",
        description: "Powerful multilingual model from Alibaba",
        contextWindow: 131072,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      {
        id: "Qwen/Qwen2.5-7B-Instruct",
        name: "Qwen 2.5 7B Instruct",
        description: "Efficient Qwen model",
        contextWindow: 131072,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      {
        id: "Qwen/Qwen2.5-Coder-32B-Instruct",
        name: "Qwen 2.5 Coder 32B",
        description: "Specialized for code generation",
        contextWindow: 131072,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      // DeepSeek
      {
        id: "deepseek-ai/DeepSeek-V3",
        name: "DeepSeek V3",
        description: "State-of-the-art open model from DeepSeek",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling", "reasoning"]
      },
      {
        id: "deepseek-ai/DeepSeek-Coder-V2-Instruct",
        name: "DeepSeek Coder V2",
        description: "Advanced code generation model",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat"]
      },
      // Embedding models
      {
        id: "sentence-transformers/all-MiniLM-L6-v2",
        name: "MiniLM L6 v2",
        description: "Fast lightweight embeddings, 384 dimensions",
        contextWindow: 512,
        capabilities: ["embedding"]
      },
      {
        id: "BAAI/bge-large-en-v1.5",
        name: "BGE Large English v1.5",
        description: "High-quality English embeddings, 1024 dimensions",
        contextWindow: 512,
        capabilities: ["embedding"]
      },
      {
        id: "BAAI/bge-m3",
        name: "BGE M3",
        description: "Multilingual, multi-granularity embeddings",
        contextWindow: 8192,
        capabilities: ["embedding"]
      },
      {
        id: "intfloat/multilingual-e5-large-instruct",
        name: "E5 Large Multilingual",
        description: "Instruction-tuned multilingual embeddings",
        contextWindow: 512,
        capabilities: ["embedding"]
      }
    ];
  }
  buildChatBody(model, params) {
    const messages = params.messages;
    const finalMessages = messages || [
      { role: "user", content: params.prompt }
    ];
    const body = {
      model,
      messages: finalMessages,
      max_tokens: params.maxTokens ?? 256
    };
    if (params.temperature !== void 0) body.temperature = params.temperature;
    return body;
  }
  normalizeChatResponse(raw) {
    const choice = raw.choices?.[0];
    return {
      provider: "huggingface",
      model: raw.model,
      content: choice?.message?.content || "",
      usage: {
        promptTokens: raw.usage?.prompt_tokens || 0,
        completionTokens: raw.usage?.completion_tokens || 0,
        totalTokens: raw.usage?.total_tokens || 0
      },
      finishReason: normalizeFinishReason(choice?.finish_reason),
      metadata: {
        id: raw.id,
        created: raw.created
      }
    };
  }
  normalizeEmbeddingResponse(raw, model) {
    let embeddings;
    if (raw.data && Array.isArray(raw.data)) {
      embeddings = raw.data.map((d) => d.embedding);
    } else if (raw.embeddings) {
      embeddings = raw.embeddings;
    } else {
      embeddings = [];
    }
    return {
      provider: "huggingface",
      model,
      embeddings,
      usage: {
        promptTokens: 0,
        totalTokens: 0
      },
      metadata: {}
    };
  }
};
var huggingfaceProvider = new HuggingFaceProvider();

// ../../integrations/server/src/providers/anthropic.ts
var ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
var ANTHROPIC_VERSION = "2023-06-01";
var AnthropicProvider = class {
  name = "anthropic";
  // image.description was already possible here and nobody could ask for it.
  // Every Claude model below declares `vision`, and convertMessages has
  // translated OpenAI-style image_url parts — including base64 data URIs —
  // into Anthropic image blocks the whole time. The capability existed; the
  // operation name to reach it did not.
  supportedOperations = ["chat.completions", "messages", "image.description"];
  async execute(options) {
    const { operation, model, params, apiKey, timeout } = options;
    if (operation !== "chat.completions" && operation !== "messages" && operation !== "image.description") {
      throw new Error(`Anthropic provider does not support operation: ${operation}`);
    }
    const url = `${ANTHROPIC_BASE_URL}/messages`;
    const body = this.buildMessagesRequestBody(model, params);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
    }
    const raw = await response.json();
    return this.normalizeMessagesResponse(raw);
  }
  async embed(_options) {
    throw new Error("Anthropic does not provide native embeddings. Consider using Voyage AI.");
  }
  validateParams(operation, params) {
    const errors = [];
    if (operation === "chat.completions" || operation === "messages") {
      if (!params.messages && !params.prompt) {
        errors.push("Either messages or prompt is required");
      }
    } else if (operation === "image.description") {
      const messages = params.messages;
      const hasImage = messages?.some(
        (m) => Array.isArray(m.content) && m.content.some(
          (p) => p?.type === "image_url" || p?.type === "image"
        )
      );
      if (!messages) errors.push("messages is required for image.description");
      else if (!hasImage) {
        errors.push(
          "image.description requires a message containing an image part; none was present"
        );
      }
    }
    return { valid: errors.length === 0, errors };
  }
  estimateTokens(text3) {
    return Math.ceil(text3.length / 4);
  }
  /**
   * List available Claude models
   * Anthropic doesn't have a models list API, so this returns a curated list
   */
  async listModels(_apiKey) {
    return [
      {
        id: "claude-sonnet-5",
        name: "Claude Sonnet 5",
        description: "Balanced performance with strong vision. Measured working 7 Aug 2026.",
        contextWindow: 2e5,
        maxOutputTokens: 64e3,
        capabilities: ["chat", "vision", "function_calling", "reasoning"],
        inputPricing: 3,
        outputPricing: 15
      },
      {
        id: "claude-opus-5",
        name: "Claude Opus 5",
        description: "Most capable Claude model. Measured reachable 7 Aug 2026.",
        contextWindow: 2e5,
        maxOutputTokens: 64e3,
        capabilities: ["chat", "vision", "function_calling", "reasoning"],
        inputPricing: 15,
        outputPricing: 75
      },
      {
        id: "claude-haiku-4-5-20251001",
        name: "Claude Haiku 4.5",
        description: "Fast and inexpensive. Measured working 7 Aug 2026.",
        contextWindow: 2e5,
        maxOutputTokens: 32e3,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 1,
        outputPricing: 5
      },
      {
        id: "claude-opus-4-20250514",
        name: "Claude Opus 4",
        description: 'Rejected by the API on 7 Aug 2026 with "model: claude-opus-4-20250514".',
        contextWindow: 2e5,
        maxOutputTokens: 32e3,
        capabilities: ["chat", "vision", "function_calling", "reasoning"],
        inputPricing: 15,
        outputPricing: 75,
        deprecated: true
      },
      // Claude 3.5 series
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        description: "Excellent for complex tasks and coding",
        contextWindow: 2e5,
        maxOutputTokens: 8192,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 3,
        outputPricing: 15
      },
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        description: "Fast and efficient for everyday tasks",
        contextWindow: 2e5,
        maxOutputTokens: 8192,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 0.8,
        outputPricing: 4
      },
      // Claude 3 series
      {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        description: "Previous generation flagship model",
        contextWindow: 2e5,
        maxOutputTokens: 4096,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 15,
        outputPricing: 75
      },
      {
        id: "claude-3-sonnet-20240229",
        name: "Claude 3 Sonnet",
        description: "Previous generation balanced model",
        contextWindow: 2e5,
        maxOutputTokens: 4096,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 3,
        outputPricing: 15,
        deprecated: true
      },
      {
        id: "claude-3-haiku-20240307",
        name: "Claude 3 Haiku",
        description: "Previous generation fast model",
        contextWindow: 2e5,
        maxOutputTokens: 4096,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 0.25,
        outputPricing: 1.25,
        deprecated: true
      }
    ];
  }
  buildMessagesRequestBody(model, params) {
    const messages = this.convertMessages(
      params.messages || []
    );
    if (!messages.length && params.prompt) {
      messages.push({ role: "user", content: params.prompt });
    }
    const body = {
      model,
      messages,
      max_tokens: params.maxTokens ?? params.max_tokens ?? 1024
    };
    const systemFromMessages = (params.messages || []).filter((m) => m?.role === "system").map((m) => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).filter((s) => s && s.trim() !== "").join("\n\n");
    const system = params.system || params.systemPrompt || (systemFromMessages || void 0);
    if (system) {
      body.system = system;
    }
    if (params.temperature !== void 0) {
      body.temperature = params.temperature;
    }
    if (params.tools) {
      body.tools = this.convertTools(params.tools);
    }
    if (params.stopSequences || params.stop) {
      body.stop_sequences = params.stopSequences || params.stop;
    }
    if (params.topP !== void 0 || params.top_p !== void 0) {
      body.top_p = params.topP ?? params.top_p;
    }
    if (params.topK !== void 0 || params.top_k !== void 0) {
      body.top_k = params.topK ?? params.top_k;
    }
    return body;
  }
  convertMessages(messages) {
    const filtered = messages.filter((m) => m.role !== "system");
    return filtered.map((msg) => {
      if (Array.isArray(msg.content)) {
        return {
          role: msg.role,
          content: msg.content.map((item) => {
            if (typeof item === "string") {
              return { type: "text", text: item };
            }
            if (typeof item === "object" && item !== null) {
              const obj = item;
              if (obj.type === "image_url") {
                const url = obj.image_url?.url;
                if (url?.startsWith("data:")) {
                  const [header, data] = url.split(",");
                  const mediaType = header.match(/data:([^;]+)/)?.[1] || "image/jpeg";
                  return {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: mediaType,
                      data
                    }
                  };
                }
                return {
                  type: "image",
                  source: {
                    type: "url",
                    url
                  }
                };
              }
              if (obj.type === "text") {
                return { type: "text", text: obj.text };
              }
            }
            return { type: "text", text: String(item) };
          })
        };
      }
      return {
        role: msg.role,
        content: msg.content
      };
    });
  }
  convertTools(tools) {
    return tools.map((tool) => {
      if (tool.type === "function" && tool.function) {
        const fn = tool.function;
        return {
          name: fn.name,
          description: fn.description || "",
          input_schema: fn.parameters || { type: "object", properties: {} }
        };
      }
      return {
        name: tool.name,
        description: tool.description || "",
        input_schema: tool.input_schema || { type: "object", properties: {} }
      };
    });
  }
  normalizeMessagesResponse(raw) {
    const textContent = raw.content.filter((block) => block.type === "text").map((block) => block.text || "").join("\n");
    const toolCalls = raw.content.filter((block) => block.type === "tool_use").map((block) => ({
      id: block.id || "",
      type: "function",
      function: {
        name: block.name || "",
        arguments: JSON.stringify(block.input || {})
      }
    }));
    return {
      provider: "anthropic",
      model: raw.model,
      content: textContent,
      usage: {
        promptTokens: raw.usage.input_tokens,
        completionTokens: raw.usage.output_tokens,
        totalTokens: raw.usage.input_tokens + raw.usage.output_tokens
      },
      finishReason: this.normalizeStopReason(raw.stop_reason),
      toolCalls: toolCalls.length > 0 ? toolCalls : void 0,
      metadata: {
        id: raw.id,
        stopSequence: raw.stop_sequence
      }
    };
  }
  normalizeStopReason(stopReason) {
    if (!stopReason) return "stop";
    switch (stopReason) {
      case "end_turn":
      case "stop_sequence":
        return "stop";
      case "max_tokens":
        return "length";
      case "tool_use":
        return "tool_calls";
      default:
        return normalizeFinishReason(stopReason);
    }
  }
};
var anthropicProvider = new AnthropicProvider();

// ../../integrations/server/src/providers/symbia-labs.ts
var MODELS_SERVICE_URL = process.env.MODELS_SERVICE_URL || "http://localhost:5008";
var SymbiaLabsProvider = class {
  name = "symbia-labs";
  supportedOperations = ["chat.completions", "completions"];
  async execute(options) {
    const { operation, model, params, timeout } = options;
    if (operation !== "chat.completions" && operation !== "completions") {
      throw new Error(`symbia-labs provider does not support operation: ${operation}`);
    }
    const url = `${MODELS_SERVICE_URL}/v1/chat/completions`;
    const body = this.buildRequestBody(model, params);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Internal service-to-service auth
        "X-Service-Auth": "internal"
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`symbia-labs API error: ${error.error || response.statusText}`);
    }
    const raw = await response.json();
    return this.normalizeResponse(raw);
  }
  async embed(options) {
    const { model, params, timeout } = options;
    const url = `${MODELS_SERVICE_URL}/v1/embeddings`;
    const body = {
      model,
      input: params.input || params.text
    };
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Auth": "internal"
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`symbia-labs embed error: ${error.error || response.statusText}`);
    }
    const raw = await response.json();
    return {
      provider: "symbia-labs",
      model: raw.model,
      embeddings: raw.data.map((d) => d.embedding),
      usage: {
        promptTokens: raw.usage.prompt_tokens,
        totalTokens: raw.usage.total_tokens
      },
      metadata: {}
    };
  }
  validateParams(operation, params) {
    const errors = [];
    if (operation === "chat.completions" || operation === "completions") {
      if (!params.messages && !params.prompt) {
        errors.push("Either messages or prompt is required");
      }
    } else if (operation === "embeddings") {
      if (!params.input && !params.text) {
        errors.push("Either input or text is required for embeddings");
      }
    }
    return { valid: errors.length === 0, errors };
  }
  estimateTokens(text3) {
    return Math.ceil(text3.length / 4);
  }
  /**
   * List available models from the models service
   */
  async listModels() {
    try {
      const response = await fetch(`${MODELS_SERVICE_URL}/v1/models`, {
        headers: {
          "X-Service-Auth": "internal"
        }
      });
      if (!response.ok) {
        console.warn("[symbia-labs] Failed to fetch models from service");
        return [];
      }
      const data = await response.json();
      return data.data.map((m) => ({
        id: m.id,
        name: m.name,
        description: `Local GGUF model (${m.memoryUsageMB}MB)`,
        contextWindow: m.contextLength,
        capabilities: m.capabilities.map((c) => {
          if (c === "chat") return "chat";
          if (c === "completion") return "completion";
          if (c === "embedding") return "embedding";
          return "chat";
        }),
        // Local models have no API pricing
        inputPricing: 0,
        outputPricing: 0
      }));
    } catch (error) {
      console.warn("[symbia-labs] Error fetching models:", error);
      return [];
    }
  }
  buildRequestBody(model, params) {
    const messages = params.messages || [{ role: "user", content: params.prompt }];
    return {
      model,
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 1024,
      stream: false
      // Non-streaming for now
    };
  }
  normalizeResponse(raw) {
    const choice = raw.choices?.[0];
    return {
      provider: "symbia-labs",
      model: raw.model,
      content: choice?.message?.content || "",
      usage: {
        promptTokens: raw.usage?.prompt_tokens || 0,
        completionTokens: raw.usage?.completion_tokens || 0,
        totalTokens: raw.usage?.total_tokens || 0
      },
      finishReason: normalizeFinishReason(choice?.finish_reason),
      metadata: {
        id: raw.id,
        created: raw.created,
        local: true
      }
    };
  }
};
var symbiaLabsProvider = new SymbiaLabsProvider();

// ../../integrations/server/src/providers/index.ts
function initializeProviders() {
  registerProvider(openaiProvider);
  registerProvider(anthropicProvider);
  registerProvider(huggingfaceProvider);
  registerProvider(symbiaLabsProvider);
  console.log(`[integrations] Registered providers: ${getRegisteredProviders().join(", ")}`);
}

// ../../integrations/server/src/credential-client.ts
import { resolveServiceUrl as resolveServiceUrl2, ServiceId as ServiceId2 } from "@symbia/sys";
var IDENTITY_SERVICE_URL = resolveServiceUrl2(ServiceId2.IDENTITY);
async function getCredential(userId, orgId, provider, authToken) {
  try {
    const url = `${IDENTITY_SERVICE_URL}/api/internal/credentials/${userId}/${provider}`;
    const headers = {
      "Authorization": `Bearer ${authToken}`,
      "X-Service-Id": "integrations"
    };
    if (orgId) {
      headers["X-Org-Id"] = orgId;
    }
    console.log(`[integrations] Credential lookup - userId: ${userId}, orgId: ${orgId}, provider: ${provider}`);
    console.log(`[integrations] Calling Identity: ${url}`);
    const response = await fetch(url, { headers });
    console.log(`[integrations] Identity response status: ${response.status}`);
    if (!response.ok) {
      if (response.status === 404) {
        const body = await response.text();
        console.log(`[integrations] Credential not found - response: ${body}`);
        return null;
      }
      console.error(`[integrations] Failed to fetch credential: ${response.statusText}`);
      return null;
    }
    const result = await response.json();
    console.log(`[integrations] Credential found - has apiKey: ${!!result.apiKey}, isProxy: ${result.isProxy}, credentialId: ${result.credentialId}`);
    return result;
  } catch (error) {
    console.error(`[integrations] Error fetching credential:`, error);
    return null;
  }
}

// ../../integrations/server/src/auth.ts
import { createAuthMiddleware } from "@symbia/auth";
import { runWithRLSContext } from "@symbia/db";
var auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ["integrations:admin", "cap:integrations.admin"],
  enableImpersonation: true,
  logger: (level, message) => console.log(`[Integrations Auth] ${message}`)
});
var {
  getCurrentUser,
  requireAuth,
  optionalAuth,
  requireAdmin,
  requireSuperAdmin,
  authClient
} = auth;
async function authMiddleware(req, res, next) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.user = user;
  const rawToken = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : void 0) ?? req.cookies?.token;
  req.token = rawToken;
  const headerOrgId = req.headers["x-org-id"];
  let orgId = headerOrgId || user.orgId || user.organizations[0]?.id;
  if (!orgId && process.env.NODE_ENV !== "production") {
    orgId = "dev-default-org";
  }
  if (!orgId) {
    res.status(400).json({ error: "Organization context required. Provide X-Org-Id header." });
    return;
  }
  req.user = { ...user, orgId };
  try {
    runWithRLSContext(
      {
        orgId: orgId ?? "",
        userId: user.id,
        isSuperAdmin: user.isSuperAdmin,
        capabilities: user.entitlements,
        serviceId: "integrations"
      },
      () => next()
    );
  } catch (error) {
    console.error("[Integrations Auth] Failed to establish RLS context:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to establish request security context" });
    }
  }
}

// ../../integrations/server/src/catalog-client.ts
import { resolveServiceUrl as resolveServiceUrl3, ServiceId as ServiceId3 } from "@symbia/sys";

// ../../integrations/server/src/spec-parser/openapi-parser.ts
import YAML from "yaml";
async function fetchAndParseOpenAPI(config2) {
  try {
    let spec;
    if (config2.spec) {
      spec = config2.spec;
    } else if (config2.specUrl) {
      const response = await fetch(config2.specUrl, {
        headers: { Accept: "application/json, application/yaml" },
        signal: AbortSignal.timeout(3e4)
      });
      if (!response.ok) {
        return {
          success: false,
          operations: [],
          namespace: {},
          error: `Failed to fetch spec: ${response.status} ${response.statusText}`
        };
      }
      const contentType = response.headers.get("content-type") || "";
      const text3 = await response.text();
      const isYaml = contentType.includes("yaml") || config2.specUrl.endsWith(".yaml") || config2.specUrl.endsWith(".yml");
      if (isYaml) {
        spec = YAML.parse(text3);
      } else {
        spec = JSON.parse(text3);
      }
    } else {
      return {
        success: false,
        operations: [],
        namespace: {},
        error: "No spec URL or inline spec provided"
      };
    }
    return parseOpenAPISpec(spec, config2.serverUrl);
  } catch (error) {
    return {
      success: false,
      operations: [],
      namespace: {},
      error: error instanceof Error ? error.message : "Failed to parse spec"
    };
  }
}
function parseOpenAPISpec(spec, serverUrlOverride) {
  const operations = [];
  const namespace = {};
  let serverUrl;
  const specServerUrl = spec.servers?.[0]?.url;
  if (serverUrlOverride && specServerUrl) {
    if (specServerUrl.startsWith("/")) {
      serverUrl = serverUrlOverride.replace(/\/$/, "") + specServerUrl;
    } else if (specServerUrl.startsWith("http")) {
      serverUrl = serverUrlOverride;
    } else {
      serverUrl = serverUrlOverride.replace(/\/$/, "") + "/" + specServerUrl;
    }
  } else {
    serverUrl = serverUrlOverride || specServerUrl;
  }
  let authType = "none";
  if (spec.components?.securitySchemes) {
    const schemes = Object.values(spec.components.securitySchemes);
    for (const scheme of schemes) {
      if (scheme.type === "http" && scheme.scheme === "bearer") {
        authType = "bearer";
        break;
      }
      if (scheme.type === "apiKey") {
        authType = "apiKey";
        break;
      }
      if (scheme.type === "http" && scheme.scheme === "basic") {
        authType = "basic";
        break;
      }
      if (scheme.type === "oauth2") {
        authType = "oauth2";
        break;
      }
    }
  }
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const methods = [];
    if (pathItem.get) methods.push({ method: "GET", operation: pathItem.get });
    if (pathItem.post) methods.push({ method: "POST", operation: pathItem.post });
    if (pathItem.put) methods.push({ method: "PUT", operation: pathItem.put });
    if (pathItem.patch) methods.push({ method: "PATCH", operation: pathItem.patch });
    if (pathItem.delete) methods.push({ method: "DELETE", operation: pathItem.delete });
    if (pathItem.head) methods.push({ method: "HEAD", operation: pathItem.head });
    if (pathItem.options) methods.push({ method: "OPTIONS", operation: pathItem.options });
    for (const { method, operation } of methods) {
      const operationId = operation.operationId || generateOperationId(path, method);
      const id = operationIdToNamespace(operationId);
      const parameters = [];
      for (const param of pathItem.parameters || []) {
        const converted = convertParameter(param);
        if (converted) {
          parameters.push(converted);
        }
      }
      for (const param of operation.parameters || []) {
        const converted = convertParameter(param);
        if (converted) {
          parameters.push(converted);
        }
      }
      let requestBody;
      if (operation.requestBody) {
        const content = operation.requestBody.content;
        const jsonContent = content["application/json"];
        requestBody = {
          required: operation.requestBody.required,
          contentType: "application/json",
          schema: jsonContent?.schema
        };
      }
      let responseSchema;
      const successResponse = operation.responses?.["200"] || operation.responses?.["201"];
      if (successResponse?.content?.["application/json"]?.schema) {
        responseSchema = successResponse.content["application/json"].schema;
      }
      const op = {
        id,
        operationId,
        method,
        path,
        summary: operation.summary,
        description: operation.description,
        tags: operation.tags,
        deprecated: operation.deprecated,
        parameters: parameters.length > 0 ? parameters : void 0,
        requestBody,
        responseSchema
      };
      operations.push(op);
      buildNamespaceTree(namespace, id, op);
    }
  }
  return {
    success: true,
    operations,
    namespace,
    serverUrl,
    info: {
      title: spec.info.title,
      version: spec.info.version,
      description: spec.info.description
    },
    authType
  };
}
function convertParameter(param) {
  if (!param.name || "$ref" in param) {
    return null;
  }
  return {
    name: param.name,
    location: param.in,
    required: param.required || false,
    description: param.description,
    schema: param.schema,
    example: param.example
  };
}
function generateOperationId(path, method) {
  const pathPart = path.replace(/^\/v\d+\//, "").replace(/\{[^}]+\}/g, "").replace(/\//g, "_").replace(/^_|_$/g, "").replace(/_+/g, "_");
  return `${pathPart}_${method.toLowerCase()}`;
}
function operationIdToNamespace(operationId) {
  if (operationId.includes("_")) {
    return operationId.replace(/_/g, ".");
  }
  const parts = operationId.replace(/([A-Z])/g, ".$1").toLowerCase().split(".").filter(Boolean);
  const verbs = ["create", "get", "list", "update", "delete", "patch", "post", "put"];
  if (parts.length > 1 && verbs.includes(parts[0])) {
    const verb = parts.shift();
    parts.push(verb);
  }
  return parts.join(".");
}
function buildNamespaceTree(tree, path, operation) {
  const parts = path.split(".");
  let current = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part];
  }
  const leaf = parts[parts.length - 1];
  current[leaf] = {
    _operation: operation.id,
    _method: operation.method,
    _path: operation.path
  };
}

// ../../integrations/server/src/spec-parser/mcp-connector.ts
import { spawn } from "child_process";
async function discoverMCPServer(config2) {
  if (config2.transport === "stdio") {
    return discoverStdioServer(config2);
  } else if (config2.transport === "http" || config2.transport === "websocket") {
    return discoverHttpServer(config2);
  }
  return {
    success: false,
    operations: [],
    namespace: {},
    capabilities: {},
    error: `Unsupported transport: ${config2.transport}`
  };
}
async function discoverStdioServer(config2) {
  if (!config2.command) {
    return {
      success: false,
      operations: [],
      namespace: {},
      capabilities: {},
      error: "No command specified for stdio transport"
    };
  }
  let process2 = null;
  let messageId = 0;
  const pendingRequests = /* @__PURE__ */ new Map();
  try {
    process2 = spawn(config2.command, config2.args || [], {
      env: { ...globalThis.process.env, ...config2.env },
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (!process2.stdin || !process2.stdout) {
      throw new Error("Failed to create process pipes");
    }
    let buffer = "";
    process2.stdout.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.id !== void 0 && pendingRequests.has(message.id)) {
            const pending = pendingRequests.get(message.id);
            pendingRequests.delete(message.id);
            if (message.error) {
              pending.reject(new Error(message.error.message));
            } else {
              pending.resolve(message.result);
            }
          }
        } catch {
        }
      }
    });
    const sendRequest = (method, params) => {
      return new Promise((resolve, reject) => {
        const id = ++messageId;
        const timeout = setTimeout(() => {
          pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }, 1e4);
        pendingRequests.set(id, {
          resolve: (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          }
        });
        const message = {
          jsonrpc: "2.0",
          id,
          method,
          params
        };
        process2.stdin.write(JSON.stringify(message) + "\n");
      });
    };
    const initResult = await sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "symbia-integrations", version: "1.0.0" }
    });
    const capabilities = initResult.capabilities;
    const operations = [];
    const namespace = {};
    if (capabilities.tools) {
      const toolsResult = await sendRequest("tools/list");
      for (const tool of toolsResult.tools || []) {
        const op = mcpToolToOperation(tool);
        operations.push(op);
        buildMCPNamespace(namespace, tool.name, op);
      }
    }
    if (capabilities.resources) {
      const resourcesResult = await sendRequest("resources/list");
      for (const resource of resourcesResult.resources || []) {
        const op = mcpResourceToOperation(resource);
        operations.push(op);
        buildMCPNamespace(namespace, `resource.${resource.name}`, op);
      }
    }
    if (capabilities.prompts) {
      const promptsResult = await sendRequest("prompts/list");
      for (const prompt of promptsResult.prompts || []) {
        const op = mcpPromptToOperation(prompt);
        operations.push(op);
        buildMCPNamespace(namespace, `prompt.${prompt.name}`, op);
      }
    }
    return {
      success: true,
      operations,
      namespace,
      capabilities
    };
  } catch (error) {
    return {
      success: false,
      operations: [],
      namespace: {},
      capabilities: {},
      error: error instanceof Error ? error.message : "Failed to connect to MCP server"
    };
  } finally {
    if (process2) {
      process2.kill();
    }
  }
}
async function discoverHttpServer(config2) {
  if (!config2.serverUrl) {
    return {
      success: false,
      operations: [],
      namespace: {},
      capabilities: {},
      error: "No server URL specified for HTTP transport"
    };
  }
  try {
    const sendRequest = async (method, params) => {
      const response = await fetch(config2.serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method,
          params
        }),
        signal: AbortSignal.timeout(1e4)
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.result;
    };
    const initResult = await sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "symbia-integrations", version: "1.0.0" }
    });
    const capabilities = initResult.capabilities;
    const operations = [];
    const namespace = {};
    if (capabilities.tools) {
      const toolsResult = await sendRequest("tools/list");
      for (const tool of toolsResult.tools || []) {
        const op = mcpToolToOperation(tool);
        operations.push(op);
        buildMCPNamespace(namespace, tool.name, op);
      }
    }
    return {
      success: true,
      operations,
      namespace,
      capabilities
    };
  } catch (error) {
    return {
      success: false,
      operations: [],
      namespace: {},
      capabilities: {},
      error: error instanceof Error ? error.message : "Failed to connect to MCP server"
    };
  }
}
function mcpToolToOperation(tool) {
  const parameters = [];
  if (tool.inputSchema.properties) {
    for (const [name, schema] of Object.entries(tool.inputSchema.properties)) {
      parameters.push({
        name,
        location: "body",
        required: tool.inputSchema.required?.includes(name) || false,
        description: schema.description,
        schema
      });
    }
  }
  return {
    id: `tool.${tool.name}`,
    summary: tool.description,
    description: tool.description,
    parameters: parameters.length > 0 ? parameters : void 0,
    mcpTool: {
      name: tool.name,
      inputSchema: tool.inputSchema
    }
  };
}
function mcpResourceToOperation(resource) {
  return {
    id: `resource.${resource.name}`,
    summary: resource.description || `Read ${resource.name}`,
    description: resource.description,
    parameters: [
      {
        name: "uri",
        location: "body",
        required: true,
        description: "Resource URI",
        schema: { type: "string", default: resource.uri }
      }
    ]
  };
}
function mcpPromptToOperation(prompt) {
  const parameters = (prompt.arguments || []).map((arg) => ({
    name: arg.name,
    location: "body",
    required: arg.required || false,
    description: arg.description,
    schema: { type: "string" }
  }));
  return {
    id: `prompt.${prompt.name}`,
    summary: prompt.description || `Get ${prompt.name} prompt`,
    description: prompt.description,
    parameters: parameters.length > 0 ? parameters : void 0
  };
}
function buildMCPNamespace(tree, path, operation) {
  const normalizedPath = path.replace(/_/g, ".");
  const parts = normalizedPath.split(".");
  let current = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part];
  }
  const leaf = parts[parts.length - 1];
  current[leaf] = {
    _operation: operation.id,
    _mcp: true
  };
}

// ../../integrations/server/src/spec-parser/integration-registry.ts
var IntegrationRegistry = class {
  integrations = /* @__PURE__ */ new Map();
  /**
   * Register an integration and discover its operations
   */
  async register(integration) {
    try {
      let operations = [];
      let namespace = {};
      if (integration.type === "openapi" && integration.openapi) {
        const result = await fetchAndParseOpenAPI(integration.openapi);
        if (!result.success) {
          return { success: false, operationCount: 0, error: result.error };
        }
        operations = result.operations;
        namespace = result.namespace;
      } else if (integration.type === "mcp" && integration.mcp) {
        const result = await discoverMCPServer(integration.mcp);
        if (!result.success) {
          return { success: false, operationCount: 0, error: result.error };
        }
        operations = result.operations;
        namespace = result.namespace;
      } else if (integration.type === "builtin") {
        operations = integration.operations || [];
        namespace = integration.namespace || {};
      }
      const operationMap = /* @__PURE__ */ new Map();
      for (const op of operations) {
        operationMap.set(op.id, op);
      }
      this.integrations.set(integration.key, {
        integration: {
          ...integration,
          operations,
          namespace,
          status: "active",
          lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        operations: operationMap,
        namespace
      });
      console.log(`[registry] Registered integration: ${integration.key} with ${operations.length} operations`);
      return { success: true, operationCount: operations.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, operationCount: 0, error: message };
    }
  }
  /**
   * Unregister an integration
   */
  unregister(key) {
    return this.integrations.delete(key);
  }
  /**
   * Get a registered integration
   */
  get(key) {
    return this.integrations.get(key)?.integration;
  }
  /**
   * Get all registered integrations
   */
  getAll() {
    return Array.from(this.integrations.values()).map((r) => r.integration);
  }
  /**
   * Lookup an operation by namespace path
   * e.g., "integrations.openai.chat.completions.create"
   */
  lookupOperation(path) {
    const parts = path.split(".");
    if (parts[0] === "integrations") {
      parts.shift();
    }
    if (parts.length < 2) {
      return void 0;
    }
    const integrationKey = parts.shift();
    const registered = this.integrations.get(integrationKey);
    if (!registered) {
      return void 0;
    }
    const operationPath = parts.join(".");
    const operation = registered.operations.get(operationPath);
    if (operation) {
      return { integration: registered.integration, operation };
    }
    let current = registered.namespace;
    for (const part of parts) {
      if (current && typeof current === "object") {
        current = current[part];
      } else {
        return void 0;
      }
    }
    if (current && typeof current === "object" && "_operation" in current) {
      const opId = current._operation;
      const op = registered.operations.get(opId);
      if (op) {
        return { integration: registered.integration, operation: op };
      }
    }
    return void 0;
  }
  /**
   * Get the namespace tree for an integration
   */
  getNamespace(integrationKey) {
    return this.integrations.get(integrationKey)?.namespace;
  }
  /**
   * Get the full namespace tree for all integrations
   */
  getFullNamespace() {
    const tree = {};
    for (const [key, registered] of this.integrations) {
      tree[key] = registered.namespace;
    }
    return { integrations: tree };
  }
  /**
   * List all operations for an integration
   */
  listOperations(integrationKey) {
    const registered = this.integrations.get(integrationKey);
    return registered ? Array.from(registered.operations.values()) : [];
  }
  /**
   * Search operations across all integrations
   */
  searchOperations(query) {
    const results = [];
    const lowerQuery = query.toLowerCase();
    for (const [key, registered] of this.integrations) {
      for (const operation of registered.operations.values()) {
        const matches = operation.id.toLowerCase().includes(lowerQuery) || operation.summary?.toLowerCase().includes(lowerQuery) || operation.description?.toLowerCase().includes(lowerQuery) || operation.tags?.some((t) => t.toLowerCase().includes(lowerQuery));
        if (matches) {
          results.push({ integrationKey: key, operation });
        }
      }
    }
    return results;
  }
  /**
   * Get operations by capability/tag
   */
  getOperationsByTag(tag) {
    const results = [];
    for (const [key, registered] of this.integrations) {
      for (const operation of registered.operations.values()) {
        if (operation.tags?.includes(tag)) {
          results.push({ integrationKey: key, operation });
        }
      }
    }
    return results;
  }
  /**
   * Refresh an integration by re-fetching its spec
   */
  async refresh(integrationKey) {
    const registered = this.integrations.get(integrationKey);
    if (!registered) {
      return { success: false, operationCount: 0, error: "Integration not found" };
    }
    return this.register(registered.integration);
  }
};
var integrationRegistry = new IntegrationRegistry();
var OPERATION_METADATA = {
  openai: {
    "chat.completions": {
      method: "POST",
      path: "/v1/chat/completions",
      summary: "Create a chat completion",
      description: "Creates a model response for the given chat conversation",
      tags: ["chat", "llm"],
      parameters: [
        { name: "model", location: "body", required: true, description: "Model ID (e.g., gpt-4o, gpt-4o-mini)" },
        { name: "messages", location: "body", required: true, description: "Array of chat messages" },
        { name: "temperature", location: "body", required: false, description: "Sampling temperature (0-2)" },
        { name: "max_tokens", location: "body", required: false, description: "Maximum tokens to generate" },
        { name: "tools", location: "body", required: false, description: "List of tools the model can call" }
      ]
    },
    "responses": {
      method: "POST",
      path: "/v1/responses",
      summary: "Create a response (Responses API)",
      description: "Create a stateful response with built-in tools and conversation management",
      tags: ["chat", "llm", "responses"],
      parameters: [
        { name: "model", location: "body", required: true, description: "Model ID (e.g., gpt-4o, o1, o3)" },
        { name: "input", location: "body", required: true, description: "Input messages or conversation" },
        { name: "instructions", location: "body", required: false, description: "System instructions" },
        { name: "tools", location: "body", required: false, description: "Built-in tools (web_search, code_interpreter, etc.)" },
        { name: "reasoning", location: "body", required: false, description: "Reasoning configuration for o-series models" }
      ]
    },
    "embeddings": {
      method: "POST",
      path: "/v1/embeddings",
      summary: "Create embeddings",
      description: "Creates embedding vectors for the input text",
      tags: ["embedding"],
      parameters: [
        { name: "model", location: "body", required: true, description: "Model ID (e.g., text-embedding-3-small)" },
        { name: "input", location: "body", required: true, description: "Text or array of text to embed" },
        { name: "dimensions", location: "body", required: false, description: "Output dimensions (for ada-002+)" }
      ]
    }
  },
  anthropic: {
    "chat.completions": {
      method: "POST",
      path: "/v1/messages",
      summary: "Create a message",
      description: "Send a message to Claude and receive a response",
      tags: ["chat", "llm"],
      parameters: [
        { name: "model", location: "body", required: true, description: "Model ID (e.g., claude-3-5-sonnet)" },
        { name: "messages", location: "body", required: true, description: "Array of messages" },
        { name: "max_tokens", location: "body", required: true, description: "Maximum tokens to generate" },
        { name: "system", location: "body", required: false, description: "System prompt" }
      ]
    }
  },
  google: {
    "chat.completions": {
      method: "POST",
      path: "/v1beta/models/{model}:generateContent",
      summary: "Generate content",
      description: "Generate content using a Gemini model",
      tags: ["chat", "llm"],
      parameters: [
        { name: "model", location: "path", required: true, description: "Model ID (e.g., gemini-2.0-flash)" },
        { name: "contents", location: "body", required: true, description: "Content parts to process" }
      ]
    },
    "embeddings": {
      method: "POST",
      path: "/v1beta/models/{model}:embedContent",
      summary: "Embed content",
      description: "Generate embeddings for content",
      tags: ["embedding"],
      parameters: [
        { name: "model", location: "path", required: true, description: "Model ID" },
        { name: "content", location: "body", required: true, description: "Content to embed" }
      ]
    }
  },
  huggingface: {
    "chat.completions": {
      method: "POST",
      path: "/chat/completions",
      summary: "Chat completion (OpenAI-compatible)",
      description: "Generate chat completions via HuggingFace Inference API",
      tags: ["chat", "llm"],
      parameters: [
        { name: "model", location: "body", required: true, description: "Model ID from HuggingFace" },
        { name: "messages", location: "body", required: true, description: "Array of messages" }
      ]
    },
    "embeddings": {
      method: "POST",
      path: "/embeddings",
      summary: "Create embeddings",
      description: "Generate embeddings via HuggingFace Inference API",
      tags: ["embedding"]
    }
  },
  mistral: {
    "chat.completions": {
      method: "POST",
      path: "/v1/chat/completions",
      summary: "Create a chat completion",
      description: "Generate chat completions with Mistral models",
      tags: ["chat", "llm"],
      parameters: [
        { name: "model", location: "body", required: true, description: "Model ID (e.g., mistral-large)" },
        { name: "messages", location: "body", required: true, description: "Array of messages" }
      ]
    },
    "embeddings": {
      method: "POST",
      path: "/v1/embeddings",
      summary: "Create embeddings",
      description: "Generate embeddings with Mistral embed models",
      tags: ["embedding"]
    }
  },
  cohere: {
    "chat.completions": {
      method: "POST",
      path: "/v1/chat",
      summary: "Create a chat completion",
      description: "Generate chat completions with Command R+ models",
      tags: ["chat", "llm"],
      parameters: [
        { name: "model", location: "body", required: true, description: "Model ID (e.g., command-r-plus)" },
        { name: "message", location: "body", required: true, description: "User message" },
        { name: "chat_history", location: "body", required: false, description: "Previous messages" }
      ]
    },
    "embeddings": {
      method: "POST",
      path: "/v1/embed",
      summary: "Create embeddings",
      description: "Generate embeddings with Cohere embed models",
      tags: ["embedding"]
    }
  }
};
var PROVIDER_METADATA = {
  openai: {
    name: "OpenAI",
    description: "GPT-4o, o1, o3 reasoning models, DALL-E, Whisper, and more",
    // Live spec from Stainless platform (auto-updated)
    specUrl: "https://app.stainless.com/api/spec/documented/openai/openapi.documented.yml",
    serverUrl: "https://api.openai.com"
  },
  anthropic: {
    name: "Anthropic",
    description: "Claude 3.5 Sonnet, Opus, and Haiku"
    // Anthropic doesn't publish a public OpenAPI spec
  },
  google: {
    name: "Google AI",
    description: "Gemini 2.0 Flash and Pro models"
    // Google AI spec would need to be fetched differently
  },
  huggingface: {
    name: "Hugging Face",
    description: "Open source models via Inference API",
    // Hub API OpenAPI spec (models, datasets, spaces, inference)
    specUrl: "https://huggingface.co/.well-known/openapi.json",
    serverUrl: "https://huggingface.co"
  },
  mistral: {
    name: "Mistral AI",
    description: "Mistral Large, Medium, and Codestral"
    // Mistral spec has YAML parsing issues, fallback to adapter
  },
  cohere: {
    name: "Cohere",
    description: "Command R+ and embedding models"
    // Cohere spec URL no longer valid, fallback to adapter
  }
};
function buildOperationsFromAdapter(providerName, adapter) {
  const operations = [];
  const metadata = OPERATION_METADATA[providerName] || {};
  for (const opName of adapter.supportedOperations) {
    const opMeta = metadata[opName] || {};
    const operationId = opName.replace(/\./g, ".") + ".create";
    operations.push({
      id: operationId,
      operationId: opName,
      method: opMeta.method || "POST",
      path: opMeta.path || `/${opName}`,
      summary: opMeta.summary || `Execute ${opName}`,
      description: opMeta.description || `Execute ${opName} operation on ${providerName}`,
      tags: opMeta.tags || [opName.split(".")[0]],
      parameters: opMeta.parameters
    });
  }
  operations.push({
    id: "models.list",
    operationId: "models.list",
    method: "GET",
    path: "/v1/models",
    summary: "List available models",
    description: `List models available from ${providerName}`,
    tags: ["models"]
  });
  return operations;
}
function buildNamespaceFromOperations(operations) {
  const namespace = {};
  for (const op of operations) {
    const parts = op.id.split(".");
    let current = namespace;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = { _operation: op.id };
  }
  return namespace;
}
async function initializeBuiltinIntegrations() {
  const registeredProviders = getRegisteredProviders();
  console.log(`[registry] Initializing builtin integrations from ${registeredProviders.length} providers`);
  for (const providerName of registeredProviders) {
    const adapter = getProvider(providerName);
    if (!adapter) continue;
    const providerMeta = PROVIDER_METADATA[providerName] || {
      name: providerName.charAt(0).toUpperCase() + providerName.slice(1),
      description: `${providerName} API`
    };
    if (providerMeta.specUrl) {
      console.log(`[registry] Fetching OpenAPI spec for ${providerName} from ${providerMeta.specUrl}`);
      try {
        const result = await fetchAndParseOpenAPI({
          specUrl: providerMeta.specUrl,
          serverUrl: providerMeta.serverUrl
        });
        if (result.success && result.operations.length > 0) {
          const integration2 = {
            id: `builtin-${providerName}`,
            key: providerName,
            name: providerMeta.name,
            description: providerMeta.description,
            type: "builtin",
            operations: result.operations,
            namespace: result.namespace,
            openapi: {
              specUrl: providerMeta.specUrl,
              serverUrl: providerMeta.serverUrl
            },
            status: "active",
            version: 1
          };
          const regResult2 = await integrationRegistry.register(integration2);
          if (regResult2.success) {
            console.log(`[registry] Registered ${providerName} with ${regResult2.operationCount} operations from OpenAPI spec`);
          } else {
            console.error(`[registry] Failed to register ${providerName}:`, regResult2.error);
          }
          continue;
        } else {
          console.warn(`[registry] Failed to parse OpenAPI spec for ${providerName}: ${result.error}, falling back to adapter`);
        }
      } catch (error) {
        console.warn(`[registry] Error fetching spec for ${providerName}:`, error, ", falling back to adapter");
      }
    }
    const operations = buildOperationsFromAdapter(providerName, adapter);
    const namespace = buildNamespaceFromOperations(operations);
    const integration = {
      id: `builtin-${providerName}`,
      key: providerName,
      name: providerMeta.name,
      description: providerMeta.description,
      type: "builtin",
      operations,
      namespace,
      status: "active",
      version: 1
    };
    const regResult = await integrationRegistry.register(integration);
    if (regResult.success) {
      console.log(`[registry] Registered ${providerName} with ${regResult.operationCount} operations from adapter: ${adapter.supportedOperations.join(", ")}`);
    } else {
      console.error(`[registry] Failed to register ${providerName}:`, regResult.error);
    }
  }
}

// ../../integrations/server/src/catalog-client.ts
var CATALOG_SERVICE_URL = resolveServiceUrl3(ServiceId3.CATALOG);
var providerConfigCache = /* @__PURE__ */ new Map();
var modelConfigCache = /* @__PURE__ */ new Map();
function getProviderConfig(provider) {
  return providerConfigCache.get(provider);
}
function getAllProviderConfigs() {
  return Array.from(providerConfigCache.values());
}
async function getModelsForProvider(provider, apiKey) {
  if (!apiKey) {
    const cached = modelConfigCache.get(provider);
    if (cached && cached.length > 0) {
      return cached;
    }
  }
  const adapter = getProvider(provider);
  if (adapter?.listModels) {
    try {
      const models = await adapter.listModels(apiKey);
      const modelConfigs = models.map(modelInfoToConfig);
      modelConfigCache.set(provider, modelConfigs);
      return modelConfigs;
    } catch (error) {
      console.warn(`[integrations] Failed to list models from ${provider} adapter:`, error);
    }
  }
  try {
    const response = await fetch(
      `${CATALOG_SERVICE_URL}/api/resources?type=integration&prefix=integrations/ai/${provider}/models/`
    );
    if (!response.ok) {
      return [];
    }
    const resources = await response.json();
    const models = resources.map((r) => r.metadata);
    modelConfigCache.set(provider, models);
    return models;
  } catch (error) {
    console.warn(`[integrations] Failed to fetch models for ${provider}:`, error);
    return [];
  }
}
function modelInfoToConfig(model) {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    capabilities: model.capabilities,
    inputPricing: model.inputPricing,
    outputPricing: model.outputPricing,
    deprecated: model.deprecated
  };
}

// ../../integrations/server/src/model-eval/types.ts
import { z as z2 } from "zod";
var taskTypeSchema = z2.enum([
  "routing",
  // Intent classification for coordinator routing
  "conversational",
  // General chat/assistant tasks
  "code",
  // Code review, generation, analysis
  "reasoning",
  // Complex reasoning, fact-checking
  "function_calling",
  // Tool selection and usage
  "embedding"
  // Semantic similarity, retrieval
]);
var evaluatorTypeSchema = z2.enum([
  "exact",
  // Exact string match
  "contains",
  // Output contains expected substring
  "semantic",
  // Semantic similarity using embeddings
  "json_schema",
  // Output matches JSON schema
  "function_call",
  // Correct function/tool selected
  "regex",
  // Regex pattern match
  "custom"
  // Custom evaluator function
]);
var testCaseSchema = z2.object({
  id: z2.string(),
  name: z2.string(),
  description: z2.string().optional(),
  // Input to the model
  input: z2.object({
    messages: z2.array(z2.object({
      role: z2.enum(["system", "user", "assistant"]),
      content: z2.string()
    })).optional(),
    prompt: z2.string().optional(),
    tools: z2.array(z2.object({
      name: z2.string(),
      description: z2.string(),
      parameters: z2.record(z2.unknown())
    })).optional()
  }),
  // Expected output
  expected: z2.object({
    content: z2.string().optional(),
    pattern: z2.string().optional(),
    // Regex pattern
    contains: z2.array(z2.string()).optional(),
    notContains: z2.array(z2.string()).optional(),
    functionCall: z2.object({
      name: z2.string(),
      arguments: z2.record(z2.unknown()).optional()
    }).optional(),
    schema: z2.record(z2.unknown()).optional()
    // JSON schema
  }),
  // How to evaluate
  evaluator: evaluatorTypeSchema,
  // Scoring weights
  weight: z2.number().default(1),
  // Tags for filtering
  tags: z2.array(z2.string()).optional()
});
var benchmarkDefinitionSchema = z2.object({
  id: z2.string(),
  // e.g., "routing.intent-classification"
  name: z2.string(),
  description: z2.string(),
  version: z2.string(),
  // Semantic version for tracking changes
  // Categorization
  taskType: taskTypeSchema,
  category: z2.string(),
  // Sub-category within task type
  // Test cases
  testCases: z2.array(testCaseSchema),
  // Configuration
  config: z2.object({
    maxTokens: z2.number().int().positive().optional(),
    temperature: z2.number().min(0).max(2).optional(),
    seed: z2.number().int().optional(),
    // For deterministic generation
    timeout: z2.number().int().positive().default(3e4)
  }).optional(),
  // Metadata
  author: z2.string().optional(),
  createdAt: z2.string().datetime().optional(),
  updatedAt: z2.string().datetime().optional()
});
var testCaseResultSchema = z2.object({
  testCaseId: z2.string(),
  // Model output
  output: z2.object({
    content: z2.string().optional(),
    functionCall: z2.object({
      name: z2.string(),
      arguments: z2.record(z2.unknown())
    }).optional(),
    rawResponse: z2.record(z2.unknown()).optional()
  }),
  // Scoring
  passed: z2.boolean(),
  score: z2.number().min(0).max(1),
  // Normalized 0-1 score
  reason: z2.string().optional(),
  // Explanation for score
  // Metrics
  latencyMs: z2.number().int(),
  inputTokens: z2.number().int(),
  outputTokens: z2.number().int(),
  // Error handling
  error: z2.string().optional()
});
var evalRunConfigSchema = z2.object({
  // Model to evaluate
  provider: z2.string(),
  modelId: z2.string(),
  // Benchmark to run
  benchmarkId: z2.string(),
  benchmarkVersion: z2.string().optional(),
  // Execution options
  parallelism: z2.number().int().positive().default(1),
  retries: z2.number().int().min(0).default(0),
  seed: z2.number().int().optional(),
  // Global seed for reproducibility
  // Filtering
  testCaseIds: z2.array(z2.string()).optional(),
  // Run specific test cases only
  tags: z2.array(z2.string()).optional(),
  // Run test cases with these tags
  // Scope
  orgId: z2.string().optional(),
  // null = global
  scope: z2.enum(["global", "org"]).default("global")
});
var evalStatusSchema = z2.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled"
]);
var evaluationResultSchema = z2.object({
  id: z2.string(),
  // Model info
  provider: z2.string(),
  modelId: z2.string(),
  // Benchmark info
  benchmarkId: z2.string(),
  benchmarkVersion: z2.string(),
  // Aggregate scores
  overallScore: z2.number().min(0).max(1),
  accuracy: z2.number().min(0).max(1),
  // % of test cases passed
  // Performance metrics
  latencyP50Ms: z2.number().int(),
  latencyP95Ms: z2.number().int(),
  latencyP99Ms: z2.number().int().optional(),
  // Token usage
  totalInputTokens: z2.number().int(),
  totalOutputTokens: z2.number().int(),
  estimatedCostCents: z2.number(),
  // Individual results
  testCaseResults: z2.array(testCaseResultSchema),
  // Run configuration
  runConfig: evalRunConfigSchema,
  // Scope
  orgId: z2.string().nullable(),
  scope: z2.enum(["global", "org"]),
  // Status
  status: evalStatusSchema,
  startedAt: z2.string().datetime(),
  completedAt: z2.string().datetime().optional(),
  errorMessage: z2.string().optional()
});
var modelScoresSchema = z2.object({
  id: z2.string(),
  // Model identity
  provider: z2.string(),
  modelId: z2.string(),
  // Task type this score is for
  taskType: taskTypeSchema,
  // Composite scores (0-100 scale)
  qualityScore: z2.number().min(0).max(100),
  speedScore: z2.number().min(0).max(100),
  costScore: z2.number().min(0).max(100),
  reliabilityScore: z2.number().min(0).max(100),
  // Weighted composite
  compositeScore: z2.number().min(0).max(100),
  // Source evaluations
  evaluationIds: z2.array(z2.string()),
  // Scope
  orgId: z2.string().nullable(),
  // Timestamps
  updatedAt: z2.string().datetime()
});
var recommendationConstraintsSchema = z2.object({
  maxLatencyMs: z2.number().int().positive().optional(),
  maxCostPerMTokens: z2.number().positive().optional(),
  minQualityScore: z2.number().min(0).max(100).optional(),
  requiredCapabilities: z2.array(z2.string()).optional(),
  excludeProviders: z2.array(z2.string()).optional(),
  excludeModels: z2.array(z2.string()).optional()
});
var recommendationWeightsSchema = z2.object({
  quality: z2.number().min(0).max(1).default(0.4),
  speed: z2.number().min(0).max(1).default(0.25),
  cost: z2.number().min(0).max(1).default(0.25),
  reliability: z2.number().min(0).max(1).default(0.1)
});
var recommendationRequestSchema = z2.object({
  taskType: taskTypeSchema,
  constraints: recommendationConstraintsSchema.optional(),
  weights: recommendationWeightsSchema.optional(),
  limit: z2.number().int().positive().default(5),
  orgId: z2.string().optional()
});
var recommendedModelSchema = z2.object({
  provider: z2.string(),
  modelId: z2.string(),
  // Scores
  compositeScore: z2.number(),
  qualityScore: z2.number(),
  speedScore: z2.number(),
  costScore: z2.number(),
  reliabilityScore: z2.number(),
  // Metadata
  modelName: z2.string().optional(),
  contextWindow: z2.number().int().optional(),
  inputPricePerMillion: z2.number().optional(),
  outputPricePerMillion: z2.number().optional(),
  // Match info
  matchReason: z2.string().optional(),
  constraintViolations: z2.array(z2.string()).optional()
});
var recommendationResponseSchema = z2.object({
  taskType: taskTypeSchema,
  recommendations: z2.array(recommendedModelSchema),
  // Cache info
  cacheKey: z2.string().optional(),
  cachedAt: z2.string().datetime().optional(),
  expiresAt: z2.string().datetime().optional()
});
var discoveredModelSchema = z2.object({
  provider: z2.string(),
  modelId: z2.string(),
  name: z2.string().optional(),
  description: z2.string().optional(),
  // Capabilities
  contextWindow: z2.number().int().optional(),
  maxOutputTokens: z2.number().int().optional(),
  capabilities: z2.array(z2.string()).optional(),
  // Pricing (per 1M tokens)
  inputPricePerMillion: z2.number().optional(),
  outputPricePerMillion: z2.number().optional(),
  // Status
  deprecated: z2.boolean().optional(),
  available: z2.boolean().default(true),
  // Last evaluation info
  lastEvaluatedAt: z2.string().datetime().optional(),
  hasScores: z2.boolean().default(false)
});
var runBenchmarkRequestSchema = z2.object({
  provider: z2.string(),
  modelId: z2.string(),
  benchmarkId: z2.string(),
  testCaseIds: z2.array(z2.string()).optional(),
  seed: z2.number().int().optional(),
  /** Run in mock mode - returns simulated results without calling the actual provider */
  mock: z2.boolean().optional().default(false)
});
var listEvaluationsRequestSchema = z2.object({
  provider: z2.string().optional(),
  modelId: z2.string().optional(),
  benchmarkId: z2.string().optional(),
  taskType: taskTypeSchema.optional(),
  status: evalStatusSchema.optional(),
  limit: z2.number().int().positive().default(50),
  offset: z2.number().int().min(0).default(0)
});
var getModelScoresRequestSchema = z2.object({
  provider: z2.string().optional(),
  modelId: z2.string().optional(),
  taskType: taskTypeSchema.optional()
});

// ../../integrations/server/src/model-eval/discovery/model-discovery.ts
var ModelDiscoveryService = class {
  cache = /* @__PURE__ */ new Map();
  cacheTTLMs = 5 * 60 * 1e3;
  // 5 minutes
  /**
   * Discover all available models across providers
   */
  async discoverModels(options = {}) {
    const {
      providers = getRegisteredProviders(),
      includeDeprecated = false,
      capabilities,
      apiKeys = {}
    } = options;
    const models = [];
    const errors = [];
    const discoveryPromises = providers.map(async (providerName) => {
      try {
        const providerModels = await this.discoverFromProvider(
          providerName,
          apiKeys[providerName]
        );
        return { provider: providerName, models: providerModels, error: null };
      } catch (error) {
        return {
          provider: providerName,
          models: [],
          error: error instanceof Error ? error.message : "Unknown error"
        };
      }
    });
    const results = await Promise.all(discoveryPromises);
    for (const result of results) {
      if (result.error) {
        errors.push({ provider: result.provider, error: result.error });
      } else {
        models.push(...result.models);
      }
    }
    let filteredModels = models;
    if (!includeDeprecated) {
      filteredModels = filteredModels.filter((m) => !m.deprecated);
    }
    if (capabilities && capabilities.length > 0) {
      filteredModels = filteredModels.filter(
        (m) => capabilities.some((cap) => m.capabilities?.includes(cap))
      );
    }
    return {
      models: filteredModels,
      errors,
      discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * Discover models from a specific provider
   */
  async discoverFromProvider(providerName, apiKey) {
    if (!apiKey) {
      const cached = this.cache.get(providerName);
      if (cached && Date.now() - cached.timestamp < this.cacheTTLMs) {
        return cached.models;
      }
    }
    const provider = getProvider(providerName);
    if (!provider) {
      throw new Error(`Provider "${providerName}" not registered`);
    }
    if (!provider.listModels) {
      return [];
    }
    const modelInfos = await provider.listModels(apiKey);
    const discoveredModels = modelInfos.map(
      (info) => this.convertToDiscoveredModel(providerName, info)
    );
    if (!apiKey) {
      this.cache.set(providerName, {
        models: discoveredModels,
        timestamp: Date.now()
      });
    }
    return discoveredModels;
  }
  /**
   * Get a specific model by provider and ID
   */
  async getModel(provider, modelId, apiKey) {
    const models = await this.discoverFromProvider(provider, apiKey);
    return models.find((m) => m.modelId === modelId) || null;
  }
  /**
   * Get models suitable for a specific task type
   */
  async getModelsForTask(taskType, options = {}) {
    const capabilityMap = {
      routing: ["chat", "function_calling"],
      conversational: ["chat"],
      code: ["chat", "function_calling"],
      reasoning: ["chat", "reasoning"],
      embedding: ["embedding"],
      function_calling: ["chat", "function_calling"]
    };
    const requiredCapabilities = capabilityMap[taskType] || ["chat"];
    const result = await this.discoverModels({
      ...options,
      capabilities: requiredCapabilities
    });
    return this.sortModelsForTask(result.models, taskType);
  }
  /**
   * Clear the discovery cache
   */
  clearCache(provider) {
    if (provider) {
      this.cache.delete(provider);
    } else {
      this.cache.clear();
    }
  }
  // =============================================================================
  // Private Methods
  // =============================================================================
  convertToDiscoveredModel(provider, info) {
    return {
      provider,
      modelId: info.id,
      name: info.name,
      description: info.description,
      contextWindow: info.contextWindow,
      maxOutputTokens: info.maxOutputTokens,
      capabilities: info.capabilities,
      inputPricePerMillion: info.inputPricing,
      outputPricePerMillion: info.outputPricing,
      deprecated: info.deprecated,
      available: true,
      hasScores: false
      // Will be updated when scores are loaded
    };
  }
  sortModelsForTask(models, taskType) {
    return models.sort((a, b) => {
      const capScore = (m) => {
        let score = 0;
        if (m.capabilities?.includes("chat")) score += 1;
        if (m.capabilities?.includes("function_calling")) score += 2;
        if (m.capabilities?.includes("reasoning") && taskType === "reasoning") score += 4;
        if (m.capabilities?.includes("embedding") && taskType === "embedding") score += 10;
        return score;
      };
      const aScore = capScore(a);
      const bScore = capScore(b);
      if (aScore !== bScore) {
        return bScore - aScore;
      }
      const aContext = a.contextWindow || 0;
      const bContext = b.contextWindow || 0;
      return bContext - aContext;
    });
  }
};
var discoveryInstance = null;
function getModelDiscoveryService() {
  if (!discoveryInstance) {
    discoveryInstance = new ModelDiscoveryService();
  }
  return discoveryInstance;
}
async function discoverAllModels(options) {
  return getModelDiscoveryService().discoverModels(options);
}
async function getModelsForTask(taskType, options) {
  return getModelDiscoveryService().getModelsForTask(taskType, options);
}

// ../../integrations/server/src/model-eval/index.ts
init_benchmark_registry();
init_routing_benchmarks();
init_code_review_benchmarks();
init_reasoning_benchmarks();
init_function_calling_benchmarks();

// ../../integrations/server/src/model-eval/benchmarks/evaluators.ts
var evaluatorRegistry = /* @__PURE__ */ new Map();
function registerEvaluator(name, evaluator) {
  evaluatorRegistry.set(name, evaluator);
}
function getEvaluator(name) {
  return evaluatorRegistry.get(name);
}
var exactEvaluator = (context) => {
  const expected = context.testCase.expected.content;
  if (!expected) {
    return { passed: false, score: 0, reason: "No expected content defined" };
  }
  const normalizedOutput = context.output.trim().toLowerCase();
  const normalizedExpected = expected.trim().toLowerCase();
  const passed = normalizedOutput === normalizedExpected;
  return {
    passed,
    score: passed ? 1 : 0,
    reason: passed ? "Exact match" : `Expected "${expected}", got "${context.output.slice(0, 100)}..."`
  };
};
var containsEvaluator = (context) => {
  const { contains, notContains } = context.testCase.expected;
  const outputLower = context.output.toLowerCase();
  let score = 1;
  const reasons = [];
  if (contains && contains.length > 0) {
    let foundCount = 0;
    for (const substring of contains) {
      if (outputLower.includes(substring.toLowerCase())) {
        foundCount++;
      } else {
        reasons.push(`Missing: "${substring}"`);
      }
    }
    score = foundCount / contains.length;
  }
  if (notContains && notContains.length > 0) {
    for (const substring of notContains) {
      if (outputLower.includes(substring.toLowerCase())) {
        score = Math.max(0, score - 0.25);
        reasons.push(`Should not contain: "${substring}"`);
      }
    }
  }
  const passed = score >= 0.5;
  return {
    passed,
    score,
    reason: reasons.length > 0 ? reasons.join("; ") : "All expected content found"
  };
};
var regexEvaluator = (context) => {
  const pattern = context.testCase.expected.pattern;
  if (!pattern) {
    return { passed: false, score: 0, reason: "No pattern defined" };
  }
  try {
    const regex = new RegExp(pattern, "i");
    const passed = regex.test(context.output);
    return {
      passed,
      score: passed ? 1 : 0,
      reason: passed ? "Pattern matched" : `Pattern "${pattern}" not found`
    };
  } catch (error) {
    return {
      passed: false,
      score: 0,
      reason: `Invalid regex pattern: ${error}`
    };
  }
};
var jsonSchemaEvaluator = (context) => {
  const schema = context.testCase.expected.schema;
  if (!schema) {
    return { passed: false, score: 0, reason: "No schema defined" };
  }
  let jsonContent;
  try {
    jsonContent = JSON.parse(context.output);
  } catch {
    const jsonMatch = context.output.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        jsonContent = JSON.parse(jsonMatch[1].trim());
      } catch {
        return { passed: false, score: 0, reason: "Could not parse JSON from output" };
      }
    } else {
      const objectMatch = context.output.match(/\{[\s\S]*\}/);
      const arrayMatch = context.output.match(/\[[\s\S]*\]/);
      const match = objectMatch || arrayMatch;
      if (match) {
        try {
          jsonContent = JSON.parse(match[0]);
        } catch {
          return { passed: false, score: 0, reason: "Could not parse JSON from output" };
        }
      } else {
        return { passed: false, score: 0, reason: "No JSON found in output" };
      }
    }
  }
  const validationResult = validateAgainstSchema(jsonContent, schema);
  return validationResult;
};
var functionCallEvaluator = (context) => {
  const expected = context.testCase.expected.functionCall;
  if (!expected) {
    return { passed: false, score: 0, reason: "No expected function call defined" };
  }
  if (!context.functionCall) {
    return { passed: false, score: 0, reason: "No function call in output" };
  }
  let score = 0;
  const reasons = [];
  if (context.functionCall.name === expected.name) {
    score += 0.5;
  } else {
    reasons.push(`Wrong function: expected "${expected.name}", got "${context.functionCall.name}"`);
  }
  if (expected.arguments) {
    const argScore = compareArguments(expected.arguments, context.functionCall.arguments);
    score += argScore * 0.5;
    if (argScore < 1) {
      reasons.push(`Argument mismatch (${Math.round(argScore * 100)}% match)`);
    }
  } else {
    score += 0.5;
  }
  const passed = score >= 0.75;
  return {
    passed,
    score,
    reason: reasons.length > 0 ? reasons.join("; ") : "Function call matches"
  };
};
var semanticEvaluator = (context) => {
  const containsResult = containsEvaluator(context);
  const lengthBonus = Math.min(0.1, context.output.length / 1e3 * 0.1);
  return {
    passed: containsResult.passed,
    score: Math.min(1, containsResult.score + lengthBonus),
    reason: `Semantic evaluation (using contains fallback): ${containsResult.reason}`
  };
};
function validateAgainstSchema(value, schema) {
  const type = schema.type;
  const reasons = [];
  let score = 1;
  if (type) {
    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (type === "integer" && typeof value === "number" && !Number.isInteger(value)) {
      score -= 0.25;
      reasons.push("Expected integer, got float");
    } else if (type !== actualType && !(type === "integer" && actualType === "number")) {
      score -= 0.5;
      reasons.push(`Expected type "${type}", got "${actualType}"`);
    }
  }
  if (type === "object" && typeof value === "object" && value !== null) {
    const obj = value;
    const properties = schema.properties;
    const required = schema.required;
    if (required) {
      for (const prop of required) {
        if (!(prop in obj)) {
          score -= 0.2;
          reasons.push(`Missing required property: "${prop}"`);
        }
      }
    }
    if (properties) {
      for (const [key, propSchema] of Object.entries(properties)) {
        if (key in obj) {
          const propResult = validateAgainstSchema(obj[key], propSchema);
          if (!propResult.passed) {
            score -= 0.1;
            reasons.push(`Property "${key}": ${propResult.reason}`);
          }
        }
      }
    }
  }
  if (schema.enum && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(value)) {
      score -= 0.3;
      reasons.push(`Value not in enum: expected one of ${JSON.stringify(schema.enum)}`);
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== void 0 && value < schema.minimum) {
      score -= 0.2;
      reasons.push(`Value ${value} below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== void 0 && value > schema.maximum) {
      score -= 0.2;
      reasons.push(`Value ${value} above maximum ${schema.maximum}`);
    }
  }
  score = Math.max(0, score);
  return {
    passed: score >= 0.5,
    score,
    reason: reasons.length > 0 ? reasons.join("; ") : "Schema validation passed"
  };
}
function compareArguments(expected, actual) {
  const expectedKeys = Object.keys(expected);
  if (expectedKeys.length === 0) return 1;
  let matchCount = 0;
  for (const key of expectedKeys) {
    if (key in actual) {
      const expectedVal = expected[key];
      const actualVal = actual[key];
      if (typeof expectedVal === "object" && typeof actualVal === "object") {
        if (JSON.stringify(expectedVal) === JSON.stringify(actualVal)) {
          matchCount++;
        } else {
          matchCount += 0.5;
        }
      } else if (expectedVal === actualVal) {
        matchCount++;
      } else if (typeof expectedVal === "string" && typeof actualVal === "string" && actualVal.toLowerCase().includes(expectedVal.toLowerCase())) {
        matchCount += 0.75;
      }
    }
  }
  return matchCount / expectedKeys.length;
}
registerEvaluator("exact", exactEvaluator);
registerEvaluator("contains", containsEvaluator);
registerEvaluator("regex", regexEvaluator);
registerEvaluator("json_schema", jsonSchemaEvaluator);
registerEvaluator("function_call", functionCallEvaluator);
registerEvaluator("semantic", semanticEvaluator);
registerEvaluator("custom", containsEvaluator);
function evaluate(context) {
  const evaluatorType = context.testCase.evaluator;
  const evaluator = getEvaluator(evaluatorType);
  if (!evaluator) {
    return {
      passed: false,
      score: 0,
      reason: `Unknown evaluator type: ${evaluatorType}`
    };
  }
  return evaluator(context);
}

// ../../integrations/server/src/model-eval/benchmarks/benchmark-runner.ts
init_benchmark_registry();

// ../../integrations/server/src/model-eval/storage/eval-repository.ts
import { eq, and, desc, gte, lte, isNull, or } from "drizzle-orm";

// ../../integrations/server/src/model-eval/storage/eval-schema.ts
import { pgTable as pgTable2, varchar as varchar2, text as text2, integer as integer2, timestamp as timestamp2, json as json2, index as index2, real, boolean as boolean2 } from "drizzle-orm/pg-core";
import { sql as sql2 } from "drizzle-orm";
var modelEvaluations = pgTable2("model_evaluations", {
  id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
  // Model identity
  provider: varchar2("provider", { length: 100 }).notNull(),
  modelId: varchar2("model_id", { length: 255 }).notNull(),
  // Benchmark identity
  benchmarkId: varchar2("benchmark_id", { length: 255 }).notNull(),
  benchmarkVersion: varchar2("benchmark_version", { length: 50 }).notNull(),
  // Aggregate scores (0-1 normalized)
  overallScore: real("overall_score").notNull(),
  accuracy: real("accuracy").notNull(),
  // Latency metrics (milliseconds)
  latencyP50Ms: integer2("latency_p50_ms").notNull(),
  latencyP95Ms: integer2("latency_p95_ms").notNull(),
  latencyP99Ms: integer2("latency_p99_ms"),
  // Token usage
  totalInputTokens: integer2("total_input_tokens").notNull(),
  totalOutputTokens: integer2("total_output_tokens").notNull(),
  estimatedCostCents: real("estimated_cost_cents").notNull(),
  // Individual test case results (stored as JSON)
  testCaseResults: json2("test_case_results").$type().notNull(),
  // Run configuration
  runConfig: json2("run_config").$type().notNull(),
  // Scope
  orgId: varchar2("org_id", { length: 100 }),
  scope: varchar2("scope", { length: 20 }).notNull().default("global"),
  // Status
  status: varchar2("status", { length: 20 }).notNull().default("pending"),
  errorMessage: text2("error_message"),
  // Timestamps
  startedAt: timestamp2("started_at").notNull(),
  completedAt: timestamp2("completed_at"),
  createdAt: timestamp2("created_at").defaultNow().notNull()
}, (table) => ({
  providerIdx: index2("idx_model_evaluations_provider").on(table.provider),
  modelIdx: index2("idx_model_evaluations_model").on(table.modelId),
  benchmarkIdx: index2("idx_model_evaluations_benchmark").on(table.benchmarkId),
  providerModelIdx: index2("idx_model_evaluations_provider_model").on(table.provider, table.modelId),
  statusIdx: index2("idx_model_evaluations_status").on(table.status),
  orgIdx: index2("idx_model_evaluations_org").on(table.orgId),
  completedIdx: index2("idx_model_evaluations_completed").on(table.completedAt)
}));
var modelScores = pgTable2("model_scores", {
  id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
  // Model identity
  provider: varchar2("provider", { length: 100 }).notNull(),
  modelId: varchar2("model_id", { length: 255 }).notNull(),
  // Task type this score applies to
  taskType: varchar2("task_type", { length: 50 }).notNull(),
  // Component scores (0-100 scale)
  qualityScore: real("quality_score").notNull(),
  speedScore: real("speed_score").notNull(),
  costScore: real("cost_score").notNull(),
  reliabilityScore: real("reliability_score").notNull(),
  // Weighted composite score
  compositeScore: real("composite_score").notNull(),
  // Source evaluations that contributed to this score
  evaluationIds: json2("evaluation_ids").$type().notNull().default([]),
  // Scope
  orgId: varchar2("org_id", { length: 100 }),
  // Timestamps
  updatedAt: timestamp2("updated_at").defaultNow().notNull(),
  createdAt: timestamp2("created_at").defaultNow().notNull()
}, (table) => ({
  providerIdx: index2("idx_model_scores_provider").on(table.provider),
  modelIdx: index2("idx_model_scores_model").on(table.modelId),
  taskTypeIdx: index2("idx_model_scores_task_type").on(table.taskType),
  providerModelTaskIdx: index2("idx_model_scores_provider_model_task").on(
    table.provider,
    table.modelId,
    table.taskType
  ),
  compositeIdx: index2("idx_model_scores_composite").on(table.compositeScore),
  orgIdx: index2("idx_model_scores_org").on(table.orgId)
}));
var modelRecommendations = pgTable2("model_recommendations", {
  id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
  // What task type this recommendation is for
  taskType: varchar2("task_type", { length: 50 }).notNull(),
  // Request constraints used to generate this recommendation
  constraints: json2("constraints").$type(),
  // The actual recommendations
  recommendations: json2("recommendations").$type().notNull(),
  // Cache key for quick lookup
  cacheKey: varchar2("cache_key", { length: 255 }).notNull().unique(),
  // Scope
  orgId: varchar2("org_id", { length: 100 }),
  // Cache expiry
  expiresAt: timestamp2("expires_at").notNull(),
  createdAt: timestamp2("created_at").defaultNow().notNull()
}, (table) => ({
  taskTypeIdx: index2("idx_model_recommendations_task_type").on(table.taskType),
  cacheKeyIdx: index2("idx_model_recommendations_cache_key").on(table.cacheKey),
  expiresIdx: index2("idx_model_recommendations_expires").on(table.expiresAt),
  orgIdx: index2("idx_model_recommendations_org").on(table.orgId)
}));
var benchmarkDefinitions = pgTable2("benchmark_definitions", {
  id: varchar2("id").primaryKey(),
  // e.g., "routing.intent-classification"
  // Metadata
  name: varchar2("name", { length: 255 }).notNull(),
  description: text2("description"),
  version: varchar2("version", { length: 50 }).notNull(),
  // Categorization
  taskType: varchar2("task_type", { length: 50 }).notNull(),
  category: varchar2("category", { length: 100 }).notNull(),
  // Test cases stored as JSON
  testCases: json2("test_cases").$type().notNull(),
  // Configuration
  config: json2("config").$type(),
  // Metadata
  author: varchar2("author", { length: 255 }),
  isBuiltin: boolean2("is_builtin").notNull().default(false),
  // Timestamps
  createdAt: timestamp2("created_at").defaultNow().notNull(),
  updatedAt: timestamp2("updated_at").defaultNow().notNull()
}, (table) => ({
  taskTypeIdx: index2("idx_benchmark_definitions_task_type").on(table.taskType),
  categoryIdx: index2("idx_benchmark_definitions_category").on(table.category),
  versionIdx: index2("idx_benchmark_definitions_version").on(table.version)
}));
var evaluationSchedules = pgTable2("evaluation_schedules", {
  id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
  // What to evaluate
  provider: varchar2("provider", { length: 100 }),
  // null = all providers
  modelId: varchar2("model_id", { length: 255 }),
  // null = all models
  benchmarkId: varchar2("benchmark_id", { length: 255 }),
  // null = all benchmarks
  taskType: varchar2("task_type", { length: 50 }),
  // null = all task types
  // Schedule configuration
  cronExpression: varchar2("cron_expression", { length: 100 }).notNull(),
  intervalHours: integer2("interval_hours"),
  // Alternative to cron
  // Status
  enabled: boolean2("enabled").notNull().default(true),
  lastRunAt: timestamp2("last_run_at"),
  nextRunAt: timestamp2("next_run_at"),
  lastError: text2("last_error"),
  // Scope
  orgId: varchar2("org_id", { length: 100 }),
  // Timestamps
  createdAt: timestamp2("created_at").defaultNow().notNull(),
  updatedAt: timestamp2("updated_at").defaultNow().notNull()
}, (table) => ({
  enabledIdx: index2("idx_evaluation_schedules_enabled").on(table.enabled),
  nextRunIdx: index2("idx_evaluation_schedules_next_run").on(table.nextRunAt),
  orgIdx: index2("idx_evaluation_schedules_org").on(table.orgId)
}));

// ../../integrations/server/src/model-eval/storage/eval-repository.ts
var EvalRepository = class {
  constructor(db2) {
    this.db = db2;
  }
  // ===========================================================================
  // Evaluations
  // ===========================================================================
  /**
   * Create a new evaluation record
   */
  async createEvaluation(data) {
    const [result] = await this.db.insert(modelEvaluations).values(data).returning();
    return result;
  }
  /**
   * Update an evaluation record
   */
  async updateEvaluation(id, data) {
    const [result] = await this.db.update(modelEvaluations).set(data).where(eq(modelEvaluations.id, id)).returning();
    return result || null;
  }
  /**
   * Get an evaluation by ID
   */
  async getEvaluation(id) {
    const [result] = await this.db.select().from(modelEvaluations).where(eq(modelEvaluations.id, id)).limit(1);
    return result || null;
  }
  /**
   * Query evaluations with filters
   */
  async queryEvaluations(query) {
    const conditions = [];
    if (query.provider) {
      conditions.push(eq(modelEvaluations.provider, query.provider));
    }
    if (query.modelId) {
      conditions.push(eq(modelEvaluations.modelId, query.modelId));
    }
    if (query.benchmarkId) {
      conditions.push(eq(modelEvaluations.benchmarkId, query.benchmarkId));
    }
    if (query.status) {
      conditions.push(eq(modelEvaluations.status, query.status));
    }
    if (query.orgId !== void 0) {
      if (query.orgId === null) {
        conditions.push(isNull(modelEvaluations.orgId));
      } else {
        conditions.push(eq(modelEvaluations.orgId, query.orgId));
      }
    }
    return this.db.select().from(modelEvaluations).where(conditions.length > 0 ? and(...conditions) : void 0).orderBy(desc(modelEvaluations.completedAt)).limit(query.limit || 50).offset(query.offset || 0);
  }
  /**
   * Get the latest evaluation for a model/benchmark combination
   */
  async getLatestEvaluation(provider, modelId, benchmarkId) {
    const [result] = await this.db.select().from(modelEvaluations).where(
      and(
        eq(modelEvaluations.provider, provider),
        eq(modelEvaluations.modelId, modelId),
        eq(modelEvaluations.benchmarkId, benchmarkId),
        eq(modelEvaluations.status, "completed")
      )
    ).orderBy(desc(modelEvaluations.completedAt)).limit(1);
    return result || null;
  }
  /**
   * Delete old evaluations (for cleanup)
   */
  async deleteOldEvaluations(olderThan) {
    const result = await this.db.delete(modelEvaluations).where(lte(modelEvaluations.createdAt, olderThan));
    return result.count || 0;
  }
  // ===========================================================================
  // Model Scores
  // ===========================================================================
  /**
   * Upsert a model score
   */
  async upsertScore(data) {
    const [result] = await this.db.insert(modelScores).values(data).onConflictDoUpdate({
      target: [modelScores.provider, modelScores.modelId, modelScores.taskType],
      set: {
        qualityScore: data.qualityScore,
        speedScore: data.speedScore,
        costScore: data.costScore,
        reliabilityScore: data.reliabilityScore,
        compositeScore: data.compositeScore,
        evaluationIds: data.evaluationIds,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return result;
  }
  /**
   * Get scores for a specific model and task type
   */
  async getScore(provider, modelId, taskType) {
    const [result] = await this.db.select().from(modelScores).where(
      and(
        eq(modelScores.provider, provider),
        eq(modelScores.modelId, modelId),
        eq(modelScores.taskType, taskType)
      )
    ).limit(1);
    return result || null;
  }
  /**
   * Query model scores
   */
  async queryScores(query) {
    const conditions = [];
    if (query.provider) {
      conditions.push(eq(modelScores.provider, query.provider));
    }
    if (query.modelId) {
      conditions.push(eq(modelScores.modelId, query.modelId));
    }
    if (query.taskType) {
      conditions.push(eq(modelScores.taskType, query.taskType));
    }
    if (query.minCompositeScore !== void 0) {
      conditions.push(gte(modelScores.compositeScore, query.minCompositeScore));
    }
    if (query.orgId !== void 0) {
      if (query.orgId === null) {
        conditions.push(isNull(modelScores.orgId));
      } else {
        conditions.push(
          or(isNull(modelScores.orgId), eq(modelScores.orgId, query.orgId))
        );
      }
    }
    return this.db.select().from(modelScores).where(conditions.length > 0 ? and(...conditions) : void 0).orderBy(desc(modelScores.compositeScore));
  }
  /**
   * Get top models for a task type
   */
  async getTopModels(taskType, limit = 10, constraints) {
    const conditions = [eq(modelScores.taskType, taskType)];
    if (constraints?.minQualityScore !== void 0) {
      conditions.push(gte(modelScores.qualityScore, constraints.minQualityScore));
    }
    return this.db.select().from(modelScores).where(and(...conditions)).orderBy(desc(modelScores.compositeScore)).limit(limit);
  }
  // ===========================================================================
  // Recommendations Cache
  // ===========================================================================
  /**
   * Get cached recommendation
   */
  async getCachedRecommendation(cacheKey) {
    const [result] = await this.db.select().from(modelRecommendations).where(
      and(
        eq(modelRecommendations.cacheKey, cacheKey),
        gte(modelRecommendations.expiresAt, /* @__PURE__ */ new Date())
      )
    ).limit(1);
    return result || null;
  }
  /**
   * Save recommendation to cache
   */
  async cacheRecommendation(data) {
    await this.db.delete(modelRecommendations).where(eq(modelRecommendations.cacheKey, data.cacheKey));
    const [result] = await this.db.insert(modelRecommendations).values(data).returning();
    return result;
  }
  /**
   * Clear expired recommendations
   */
  async clearExpiredRecommendations() {
    const result = await this.db.delete(modelRecommendations).where(lte(modelRecommendations.expiresAt, /* @__PURE__ */ new Date()));
    return result.count || 0;
  }
  // ===========================================================================
  // Benchmark Definitions (stored in DB for version tracking)
  // ===========================================================================
  /**
   * Upsert a benchmark definition
   */
  async upsertBenchmark(data) {
    const [result] = await this.db.insert(benchmarkDefinitions).values(data).onConflictDoUpdate({
      target: benchmarkDefinitions.id,
      set: {
        name: data.name,
        description: data.description,
        version: data.version,
        taskType: data.taskType,
        category: data.category,
        testCases: data.testCases,
        config: data.config,
        author: data.author,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return result;
  }
  /**
   * Get a benchmark definition by ID
   */
  async getBenchmark(id) {
    const [result] = await this.db.select().from(benchmarkDefinitions).where(eq(benchmarkDefinitions.id, id)).limit(1);
    return result || null;
  }
  /**
   * List all benchmark definitions
   */
  async listBenchmarks() {
    return this.db.select().from(benchmarkDefinitions).orderBy(benchmarkDefinitions.taskType, benchmarkDefinitions.category);
  }
  // ===========================================================================
  // Evaluation Schedules
  // ===========================================================================
  /**
   * Get due schedules
   */
  async getDueSchedules() {
    return this.db.select().from(evaluationSchedules).where(
      and(
        eq(evaluationSchedules.enabled, true),
        lte(evaluationSchedules.nextRunAt, /* @__PURE__ */ new Date())
      )
    );
  }
  /**
   * Update schedule after run
   */
  async updateScheduleRun(id, nextRunAt, error) {
    await this.db.update(evaluationSchedules).set({
      lastRunAt: /* @__PURE__ */ new Date(),
      nextRunAt,
      lastError: error || null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(evaluationSchedules.id, id));
  }
};
var repositoryInstance = null;
function getEvalRepository(db2) {
  if (!repositoryInstance) {
    repositoryInstance = new EvalRepository(db2);
  }
  return repositoryInstance;
}
function generateRecommendationCacheKey(taskType, constraints, orgId) {
  const parts = [
    taskType,
    orgId || "global",
    constraints ? JSON.stringify(constraints) : "no-constraints"
  ];
  return parts.join(":");
}

// ../../integrations/server/src/model-eval/benchmarks/benchmark-runner.ts
var BenchmarkRunner = class {
  repository;
  constructor(db2) {
    this.repository = getEvalRepository(db2);
  }
  /**
   * Run a benchmark against a model
   */
  async runBenchmark(config2, options = {}) {
    const {
      parallelism = 1,
      timeout = 3e4,
      retries = 0,
      seed,
      apiKey,
      onProgress,
      mockMode = false
    } = options;
    const benchmark = getBenchmark(config2.benchmarkId);
    if (!benchmark) {
      throw new Error(`Benchmark not found: ${config2.benchmarkId}`);
    }
    const provider = getProvider(config2.provider);
    if (!provider) {
      throw new Error(`Provider not found: ${config2.provider}`);
    }
    const startedAt = /* @__PURE__ */ new Date();
    const evaluationRecord = await this.repository.createEvaluation({
      provider: config2.provider,
      modelId: config2.modelId,
      benchmarkId: config2.benchmarkId,
      benchmarkVersion: config2.benchmarkVersion || benchmark.version,
      overallScore: 0,
      accuracy: 0,
      latencyP50Ms: 0,
      latencyP95Ms: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedCostCents: 0,
      testCaseResults: [],
      runConfig: config2,
      orgId: config2.orgId || null,
      scope: config2.scope,
      status: "running",
      startedAt
    });
    try {
      let testCases = benchmark.testCases;
      if (config2.testCaseIds && config2.testCaseIds.length > 0) {
        const idSet = new Set(config2.testCaseIds);
        testCases = testCases.filter((tc) => idSet.has(tc.id));
      }
      if (config2.tags && config2.tags.length > 0) {
        const tagSet = new Set(config2.tags);
        testCases = testCases.filter(
          (tc) => tc.tags?.some((t) => tagSet.has(t))
        );
      }
      const benchmarkConfig = {
        timeout: benchmark.config?.timeout ?? timeout,
        maxTokens: benchmark.config?.maxTokens,
        temperature: benchmark.config?.temperature,
        seed: benchmark.config?.seed
      };
      const results = await this.executeTestCases(
        testCases,
        provider,
        config2.modelId,
        benchmarkConfig,
        {
          parallelism,
          timeout: benchmarkConfig.timeout,
          retries,
          seed: seed ?? benchmarkConfig.seed,
          apiKey,
          onProgress,
          mockMode
        }
      );
      const completedAt = /* @__PURE__ */ new Date();
      const aggregates = this.calculateAggregates(results, benchmark);
      const updatedRecord = await this.repository.updateEvaluation(
        evaluationRecord.id,
        {
          status: "completed",
          completedAt,
          ...aggregates,
          testCaseResults: results
        }
      );
      return this.recordToResult(updatedRecord, config2);
    } catch (error) {
      await this.repository.updateEvaluation(evaluationRecord.id, {
        status: "failed",
        completedAt: /* @__PURE__ */ new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown error"
      });
      throw error;
    }
  }
  /**
   * Execute test cases with parallelism control
   */
  async executeTestCases(testCases, provider, modelId, benchmarkConfig, options) {
    const { parallelism = 1, timeout = 3e4, retries = 0, onProgress, apiKey, mockMode } = options;
    const results = [];
    const queue = [...testCases];
    let completed = 0;
    while (queue.length > 0) {
      const batch = queue.splice(0, parallelism);
      const batchPromises = batch.map(
        (testCase) => this.executeTestCase(testCase, provider, modelId, benchmarkConfig, {
          timeout,
          retries,
          apiKey,
          mockMode
        })
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      completed += batchResults.length;
      if (onProgress) {
        const lastResult = batchResults[batchResults.length - 1];
        onProgress(completed, testCases.length, lastResult);
      }
    }
    return results;
  }
  /**
   * Execute a single test case
   */
  async executeTestCase(testCase, provider, modelId, benchmarkConfig, options) {
    const { timeout, retries, apiKey, mockMode } = options;
    if (mockMode) {
      return this.executeMockTestCase(testCase);
    }
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const startTime = performance.now();
        const messages = testCase.input.messages || [];
        if (testCase.input.prompt) {
          messages.push({ role: "user", content: testCase.input.prompt });
        }
        let formattedTools;
        if (testCase.input.tools) {
          formattedTools = testCase.input.tools.map((tool) => {
            if (tool.type === "function") {
              return tool;
            }
            return {
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
              }
            };
          });
        }
        const executePromise = provider.execute({
          operation: "chat.completions",
          model: modelId,
          params: {
            messages,
            max_tokens: benchmarkConfig.maxTokens || 500,
            temperature: benchmarkConfig.temperature ?? 0,
            ...formattedTools && { tools: formattedTools }
          },
          apiKey: apiKey || "",
          timeout
        });
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout)
        );
        const response = await Promise.race([executePromise, timeoutPromise]);
        const endTime = performance.now();
        const latencyMs = Math.round(endTime - startTime);
        let functionCall;
        if (response.toolCalls && response.toolCalls.length > 0) {
          const firstCall = response.toolCalls[0];
          try {
            functionCall = {
              name: firstCall.function.name,
              arguments: JSON.parse(firstCall.function.arguments)
            };
          } catch {
            functionCall = {
              name: firstCall.function.name,
              arguments: {}
            };
          }
        }
        const evalContext = {
          testCase,
          output: response.content,
          functionCall
        };
        const evalResult = evaluate(evalContext);
        return {
          testCaseId: testCase.id,
          output: {
            content: response.content,
            functionCall,
            rawResponse: response.metadata
          },
          passed: evalResult.passed,
          score: evalResult.score,
          reason: evalResult.reason,
          latencyMs,
          inputTokens: response.usage.promptTokens,
          outputTokens: response.usage.completionTokens
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.message === "Timeout") {
          break;
        }
      }
    }
    return {
      testCaseId: testCase.id,
      output: {
        content: ""
      },
      passed: false,
      score: 0,
      reason: `Execution failed: ${lastError?.message || "Unknown error"}`,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      error: lastError?.message
    };
  }
  /**
   * Calculate aggregate metrics from test results
   */
  calculateAggregates(results, benchmark) {
    if (results.length === 0) {
      return {
        overallScore: 0,
        accuracy: 0,
        latencyP50Ms: 0,
        latencyP95Ms: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedCostCents: 0
      };
    }
    const weightMap = /* @__PURE__ */ new Map();
    for (const tc of benchmark.testCases) {
      weightMap.set(tc.id, tc.weight || 1);
    }
    let totalWeight = 0;
    let weightedScore = 0;
    let passedCount = 0;
    for (const result of results) {
      const weight = weightMap.get(result.testCaseId) || 1;
      totalWeight += weight;
      weightedScore += result.score * weight;
      if (result.passed) passedCount++;
    }
    const overallScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    const accuracy = results.length > 0 ? passedCount / results.length : 0;
    const latencies = results.filter((r) => r.latencyMs > 0).map((r) => r.latencyMs).sort((a, b) => a - b);
    const latencyP50Ms = this.percentile(latencies, 50);
    const latencyP95Ms = this.percentile(latencies, 95);
    const totalInputTokens = results.reduce((sum, r) => sum + r.inputTokens, 0);
    const totalOutputTokens = results.reduce((sum, r) => sum + r.outputTokens, 0);
    const estimatedCostCents = 0;
    return {
      overallScore,
      accuracy,
      latencyP50Ms,
      latencyP95Ms,
      totalInputTokens,
      totalOutputTokens,
      estimatedCostCents
    };
  }
  /**
   * Calculate percentile from sorted array
   */
  percentile(sortedValues, p) {
    if (sortedValues.length === 0) return 0;
    const index3 = Math.ceil(p / 100 * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index3, sortedValues.length - 1))];
  }
  /**
   * Execute a mock test case - returns simulated results for testing
   */
  executeMockTestCase(testCase) {
    const latencyMs = 50 + Math.floor(Math.random() * 450);
    let mockOutput = "";
    let passed = false;
    let score = 0;
    if (testCase.expected.content) {
      if (Math.random() < 0.8) {
        mockOutput = testCase.expected.content;
        passed = true;
        score = 1;
      } else {
        mockOutput = "Mock response that does not match expected";
        score = 0.3;
      }
    } else if (testCase.expected.contains && testCase.expected.contains.length > 0) {
      const includeCount = testCase.expected.contains.filter(() => Math.random() < 0.85).length;
      mockOutput = testCase.expected.contains.slice(0, includeCount).join(" and ");
      score = includeCount / testCase.expected.contains.length;
      passed = score >= 0.5;
    } else if (testCase.expected.functionCall) {
      mockOutput = `Calling ${testCase.expected.functionCall.name}`;
      passed = Math.random() < 0.75;
      score = passed ? 1 : 0.4;
    } else {
      mockOutput = "Mock response for testing purposes";
      passed = Math.random() < 0.7;
      score = passed ? 0.8 + Math.random() * 0.2 : 0.2 + Math.random() * 0.3;
    }
    const inputTokens = 50 + Math.floor(Math.random() * 200);
    const outputTokens = 20 + Math.floor(Math.random() * 100);
    return {
      testCaseId: testCase.id,
      output: {
        content: mockOutput,
        functionCall: testCase.expected.functionCall ? {
          name: testCase.expected.functionCall.name,
          arguments: testCase.expected.functionCall.arguments || {}
        } : void 0
      },
      passed,
      score,
      reason: passed ? "Mock test passed" : "Mock test did not fully match expected",
      latencyMs,
      inputTokens,
      outputTokens
    };
  }
  /**
   * Convert database record to EvaluationResult
   */
  recordToResult(record, config2) {
    return {
      id: record.id,
      provider: record.provider,
      modelId: record.modelId,
      benchmarkId: record.benchmarkId,
      benchmarkVersion: record.benchmarkVersion,
      overallScore: record.overallScore,
      accuracy: record.accuracy,
      latencyP50Ms: record.latencyP50Ms,
      latencyP95Ms: record.latencyP95Ms,
      totalInputTokens: record.totalInputTokens,
      totalOutputTokens: record.totalOutputTokens,
      estimatedCostCents: record.estimatedCostCents,
      testCaseResults: record.testCaseResults,
      runConfig: config2,
      orgId: record.orgId,
      scope: record.scope,
      status: record.status,
      startedAt: record.startedAt.toISOString(),
      completedAt: record.completedAt?.toISOString(),
      errorMessage: record.errorMessage || void 0
    };
  }
};
var runnerInstance = null;
function getBenchmarkRunner(db2) {
  if (!runnerInstance) {
    runnerInstance = new BenchmarkRunner(db2);
  }
  return runnerInstance;
}

// ../../integrations/server/src/model-eval/recommendation/recommendation-engine.ts
var DEFAULT_WEIGHTS = {
  quality: 0.4,
  speed: 0.25,
  cost: 0.25,
  reliability: 0.1
};
var RecommendationEngine = class {
  repository;
  inMemoryCache = /* @__PURE__ */ new Map();
  defaultCacheTTLMs = 5 * 60 * 1e3;
  // 5 minutes
  constructor(db2) {
    this.repository = getEvalRepository(db2);
  }
  /**
   * Get model recommendations for a task type
   */
  async getRecommendations(request, options = {}) {
    const {
      useCache = true,
      cacheTTLMs = this.defaultCacheTTLMs,
      includeUnscored = false
    } = options;
    const cacheKey = generateRecommendationCacheKey(
      request.taskType,
      request.constraints,
      request.orgId
    );
    if (useCache) {
      const cached = this.inMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
      const dbCached = await this.repository.getCachedRecommendation(cacheKey);
      if (dbCached) {
        const response2 = {
          taskType: request.taskType,
          recommendations: dbCached.recommendations,
          cacheKey,
          cachedAt: dbCached.createdAt.toISOString(),
          expiresAt: dbCached.expiresAt.toISOString()
        };
        this.inMemoryCache.set(cacheKey, {
          data: response2,
          expiresAt: dbCached.expiresAt.getTime()
        });
        return response2;
      }
    }
    const recommendations = await this.generateRecommendations(
      request,
      includeUnscored
    );
    const response = {
      taskType: request.taskType,
      recommendations
    };
    if (useCache && recommendations.length > 0) {
      const expiresAt = new Date(Date.now() + cacheTTLMs);
      await this.repository.cacheRecommendation({
        taskType: request.taskType,
        constraints: request.constraints,
        recommendations,
        cacheKey,
        orgId: request.orgId,
        expiresAt
      });
      this.inMemoryCache.set(cacheKey, {
        data: { ...response, cacheKey, cachedAt: (/* @__PURE__ */ new Date()).toISOString(), expiresAt: expiresAt.toISOString() },
        expiresAt: expiresAt.getTime()
      });
    }
    return response;
  }
  /**
   * Generate recommendations based on scores
   */
  async generateRecommendations(request, includeUnscored) {
    const weights = { ...DEFAULT_WEIGHTS, ...request.weights };
    const limit = request.limit || 5;
    const scores = await this.repository.queryScores({
      taskType: request.taskType,
      orgId: request.orgId
    });
    const recommendations = [];
    for (const score of scores) {
      const recommendation = this.scoreToRecommendation(score, weights);
      const violations = this.checkConstraints(recommendation, request.constraints);
      if (violations.length > 0) {
        recommendation.constraintViolations = violations;
        if (this.hasHardViolation(violations)) {
          continue;
        }
      }
      recommendations.push(recommendation);
    }
    if (includeUnscored) {
      const discovery = getModelDiscoveryService();
      const discovered = await discovery.getModelsForTask(request.taskType);
      const scoredModelIds = new Set(scores.map((s) => `${s.provider}:${s.modelId}`));
      for (const model of discovered) {
        const key = `${model.provider}:${model.modelId}`;
        if (!scoredModelIds.has(key)) {
          recommendations.push(this.discoveredToRecommendation(model, weights));
        }
      }
    }
    recommendations.sort((a, b) => b.compositeScore - a.compositeScore);
    const filtered = this.applyExclusions(recommendations, request.constraints);
    return filtered.slice(0, limit);
  }
  /**
   * Convert a score record to a recommendation
   */
  scoreToRecommendation(score, weights) {
    const compositeScore = score.qualityScore * weights.quality + score.speedScore * weights.speed + score.costScore * weights.cost + score.reliabilityScore * weights.reliability;
    return {
      provider: score.provider,
      modelId: score.modelId,
      compositeScore,
      qualityScore: score.qualityScore,
      speedScore: score.speedScore,
      costScore: score.costScore,
      reliabilityScore: score.reliabilityScore
    };
  }
  /**
   * Convert a discovered model to a recommendation (using estimated scores)
   */
  discoveredToRecommendation(model, weights) {
    const qualityScore = this.estimateQualityScore(model);
    const speedScore = this.estimateSpeedScore(model);
    const costScore = this.estimateCostScore(model);
    const reliabilityScore = 50;
    const compositeScore = qualityScore * weights.quality + speedScore * weights.speed + costScore * weights.cost + reliabilityScore * weights.reliability;
    return {
      provider: model.provider,
      modelId: model.modelId,
      compositeScore,
      qualityScore,
      speedScore,
      costScore,
      reliabilityScore,
      modelName: model.name,
      contextWindow: model.contextWindow,
      inputPricePerMillion: model.inputPricePerMillion,
      outputPricePerMillion: model.outputPricePerMillion,
      matchReason: "Estimated scores (not yet evaluated)"
    };
  }
  /**
   * Estimate quality score based on model properties
   */
  estimateQualityScore(model) {
    let score = 50;
    if (model.contextWindow) {
      if (model.contextWindow >= 128e3) score += 15;
      else if (model.contextWindow >= 32e3) score += 10;
      else if (model.contextWindow >= 8e3) score += 5;
    }
    if (model.capabilities) {
      score += model.capabilities.length * 3;
    }
    if (model.capabilities?.includes("reasoning")) {
      score += 10;
    }
    return Math.min(100, score);
  }
  /**
   * Estimate speed score based on model properties
   */
  estimateSpeedScore(model) {
    if (model.modelId.includes("mini")) return 85;
    if (model.modelId.includes("small")) return 80;
    if (model.modelId.includes("pro")) return 40;
    if (model.modelId.includes("large")) return 45;
    return 60;
  }
  /**
   * Estimate cost score based on pricing
   */
  estimateCostScore(model) {
    const inputPrice = model.inputPricePerMillion || 0;
    const outputPrice = model.outputPricePerMillion || 0;
    const avgPrice = (inputPrice + outputPrice) / 2;
    if (avgPrice === 0) return 50;
    if (avgPrice < 0.5) return 95;
    if (avgPrice < 2) return 80;
    if (avgPrice < 5) return 65;
    if (avgPrice < 15) return 50;
    if (avgPrice < 30) return 35;
    return 20;
  }
  /**
   * Check recommendation against constraints
   */
  checkConstraints(recommendation, constraints) {
    const violations = [];
    if (!constraints) return violations;
    if (constraints.minQualityScore !== void 0 && recommendation.qualityScore < constraints.minQualityScore) {
      violations.push(
        `Quality score ${recommendation.qualityScore.toFixed(1)} below minimum ${constraints.minQualityScore}`
      );
    }
    return violations;
  }
  /**
   * Check if any violations are hard (should exclude model)
   */
  hasHardViolation(violations) {
    return false;
  }
  /**
   * Apply exclusion filters from constraints
   */
  applyExclusions(recommendations, constraints) {
    if (!constraints) return recommendations;
    let filtered = recommendations;
    if (constraints.excludeProviders && constraints.excludeProviders.length > 0) {
      const excluded = new Set(constraints.excludeProviders);
      filtered = filtered.filter((r) => !excluded.has(r.provider));
    }
    if (constraints.excludeModels && constraints.excludeModels.length > 0) {
      const excluded = new Set(constraints.excludeModels);
      filtered = filtered.filter((r) => !excluded.has(r.modelId));
    }
    return filtered;
  }
  /**
   * Clear the in-memory cache
   */
  clearCache() {
    this.inMemoryCache.clear();
  }
  /**
   * Cleanup expired entries from cache
   */
  async cleanupExpired() {
    const now = Date.now();
    for (const [key, value] of this.inMemoryCache) {
      if (value.expiresAt < now) {
        this.inMemoryCache.delete(key);
      }
    }
    await this.repository.clearExpiredRecommendations();
  }
};
var engineInstance = null;
function getRecommendationEngine(db2) {
  if (!engineInstance) {
    engineInstance = new RecommendationEngine(db2);
  }
  return engineInstance;
}

// ../../integrations/server/src/model-eval/recommendation/score-aggregator.ts
var LATENCY_THRESHOLDS = {
  excellent: 500,
  // < 500ms = 100 score
  good: 1e3,
  // < 1000ms = 80 score
  acceptable: 2e3,
  // < 2000ms = 60 score
  slow: 5e3
  // < 5000ms = 40 score
  // > 5000ms = 20 score
};
var COST_THRESHOLDS = {
  // Cost per 1M tokens (input + output average)
  cheap: 0.5,
  // < $0.50 = 100 score
  affordable: 2,
  // < $2 = 80 score
  moderate: 5,
  // < $5 = 60 score
  expensive: 15
  // < $15 = 40 score
  // > $15 = 20 score
};
var ScoreAggregator = class {
  repository;
  constructor(db2) {
    this.repository = getEvalRepository(db2);
  }
  /**
   * Aggregate scores for a specific model and task type
   */
  async aggregateModelScores(provider, modelId, taskType, options = {}) {
    const { sinceDate, minEvaluations = 1, persist = true } = options;
    const evaluations = await this.repository.queryEvaluations({
      provider,
      modelId,
      status: "completed",
      limit: 100
    });
    let relevantEvals = evaluations.filter((e) => {
      const benchmarkTaskType = e.benchmarkId.split(".")[0];
      return benchmarkTaskType === taskType;
    });
    if (sinceDate) {
      relevantEvals = relevantEvals.filter(
        (e) => e.completedAt && e.completedAt >= sinceDate
      );
    }
    if (relevantEvals.length < minEvaluations) {
      return null;
    }
    const scores = this.calculateScoreComponents(relevantEvals, provider, modelId);
    const compositeScore = scores.quality * 0.4 + scores.speed * 0.25 + scores.cost * 0.25 + scores.reliability * 0.1;
    const evaluationIds = relevantEvals.map((e) => e.id);
    if (persist) {
      await this.repository.upsertScore({
        provider,
        modelId,
        taskType,
        qualityScore: scores.quality,
        speedScore: scores.speed,
        costScore: scores.cost,
        reliabilityScore: scores.reliability,
        compositeScore,
        evaluationIds
      });
    }
    return {
      id: `${provider}:${modelId}:${taskType}`,
      provider,
      modelId,
      taskType,
      qualityScore: scores.quality,
      speedScore: scores.speed,
      costScore: scores.cost,
      reliabilityScore: scores.reliability,
      compositeScore,
      evaluationIds,
      orgId: null,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * Aggregate scores for all models with recent evaluations
   */
  async aggregateAllScores(taskType, options = {}) {
    const evaluations = await this.repository.queryEvaluations({
      status: "completed",
      limit: 1e3
    });
    const byModel = /* @__PURE__ */ new Map();
    for (const eval_ of evaluations) {
      const key = `${eval_.provider}:${eval_.modelId}`;
      if (!byModel.has(key)) {
        byModel.set(key, []);
      }
      byModel.get(key).push(eval_);
    }
    const results = [];
    for (const [key, modelEvals] of byModel) {
      const [provider, modelId] = key.split(":");
      const score = await this.aggregateModelScores(
        provider,
        modelId,
        taskType,
        { ...options, persist: options.persist }
      );
      if (score) {
        results.push(score);
      }
    }
    results.sort((a, b) => b.compositeScore - a.compositeScore);
    return results;
  }
  /**
   * Calculate score components from evaluations
   */
  calculateScoreComponents(evaluations, provider, modelId) {
    if (evaluations.length === 0) {
      return { quality: 50, speed: 50, cost: 50, reliability: 50 };
    }
    const qualityScores = evaluations.map((e) => e.overallScore * 100);
    const qualityAvg = this.average(qualityScores);
    const latencies = evaluations.map((e) => e.latencyP50Ms);
    const avgLatency = this.average(latencies);
    const speedScore = this.latencyToScore(avgLatency);
    const costScore = this.calculateCostScore(evaluations, provider, modelId);
    const successRate = evaluations.filter((e) => e.status === "completed").length / evaluations.length;
    const scoreVariance = this.variance(qualityScores);
    const consistencyBonus = Math.max(0, 20 - scoreVariance);
    const reliabilityScore = successRate * 80 + consistencyBonus;
    return {
      quality: Math.round(qualityAvg),
      speed: Math.round(speedScore),
      cost: Math.round(costScore),
      reliability: Math.round(Math.min(100, reliabilityScore))
    };
  }
  /**
   * Convert latency to 0-100 score
   */
  latencyToScore(latencyMs) {
    if (latencyMs < LATENCY_THRESHOLDS.excellent) return 100;
    if (latencyMs < LATENCY_THRESHOLDS.good) return 80;
    if (latencyMs < LATENCY_THRESHOLDS.acceptable) return 60;
    if (latencyMs < LATENCY_THRESHOLDS.slow) return 40;
    return 20;
  }
  /**
   * Calculate cost score from evaluations or model metadata
   */
  calculateCostScore(evaluations, provider, modelId) {
    const costs = evaluations.filter((e) => e.estimatedCostCents > 0).map((e) => {
      const totalTokens = e.totalInputTokens + e.totalOutputTokens;
      if (totalTokens === 0) return 0;
      return e.estimatedCostCents / 100 / (totalTokens / 1e6);
    }).filter((c) => c > 0);
    if (costs.length > 0) {
      const avgCostPerMillion = this.average(costs);
      return this.costToScore(avgCostPerMillion);
    }
    const discovery = getModelDiscoveryService();
    return 50;
  }
  /**
   * Convert cost per million tokens to 0-100 score
   */
  costToScore(costPerMillion) {
    if (costPerMillion < COST_THRESHOLDS.cheap) return 100;
    if (costPerMillion < COST_THRESHOLDS.affordable) return 80;
    if (costPerMillion < COST_THRESHOLDS.moderate) return 60;
    if (costPerMillion < COST_THRESHOLDS.expensive) return 40;
    return 20;
  }
  /**
   * Calculate average of numbers
   */
  average(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
  /**
   * Calculate variance of numbers
   */
  variance(values) {
    if (values.length < 2) return 0;
    const avg = this.average(values);
    const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
    return this.average(squaredDiffs);
  }
};
var aggregatorInstance = null;
function getScoreAggregator(db2) {
  if (!aggregatorInstance) {
    aggregatorInstance = new ScoreAggregator(db2);
  }
  return aggregatorInstance;
}

// ../../integrations/server/src/model-eval/api/eval-routes.ts
import { Router } from "express";
import { fromError } from "zod-validation-error";
init_benchmark_registry();

// ../../integrations/server/src/model-eval/catalog/catalog-sync.ts
import { resolveServiceUrl as resolveServiceUrl4, ServiceId as ServiceId4 } from "@symbia/sys";
var CATALOG_SERVICE_URL2 = resolveServiceUrl4(ServiceId4.CATALOG);
var PROVIDER_CONFIGS = {
  openai: {
    name: "OpenAI Provider Configuration",
    description: "Configuration for OpenAI API integration",
    tags: ["ai", "llm", "openai", "integration"],
    metadata: {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      authType: "bearer",
      endpoints: {
        "chat.completions": "/chat/completions",
        "responses": "/responses",
        "embeddings": "/embeddings"
      },
      defaultModel: "gpt-4o-mini",
      supportedOperations: ["chat.completions", "responses", "embeddings"]
    }
  },
  anthropic: {
    name: "Anthropic Provider Configuration",
    description: "Configuration for Anthropic Claude API",
    tags: ["ai", "llm", "anthropic", "integration"],
    metadata: {
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      authType: "header",
      authHeader: "x-api-key",
      endpoints: {
        messages: "/messages"
      },
      defaultModel: "claude-sonnet-4-20250514",
      supportedOperations: ["messages"]
    }
  },
  huggingface: {
    name: "HuggingFace Provider Configuration",
    description: "Configuration for HuggingFace Inference API",
    tags: ["ai", "llm", "huggingface", "integration"],
    metadata: {
      provider: "huggingface",
      baseUrl: "https://router.huggingface.co",
      authType: "bearer",
      endpoints: {
        "chat.completions": "/v1/chat/completions",
        "text.generation": "/v1/chat/completions",
        embeddings: "/v1/embeddings"
      },
      defaultModel: "meta-llama/Llama-3.2-3B-Instruct",
      supportedOperations: ["text.generation", "chat.completions", "embeddings"],
      note: "Uses OpenAI-compatible API format"
    }
  }
};
var CatalogSyncService = class {
  discoveryService = getModelDiscoveryService();
  /**
   * Sync all discovered models to the catalog
   */
  async syncModels(options = {}) {
    const {
      providers = getRegisteredProviders(),
      apiKeys = {},
      dryRun = false,
      forceUpdate = false
    } = options;
    const result = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      resources: [],
      syncedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const supportedProviders = providers.filter(
      (p) => ["openai", "anthropic", "huggingface"].includes(p)
    );
    for (const provider of supportedProviders) {
      try {
        const configResource = this.createProviderConfigResource(provider);
        const syncResult = await this.syncResource(configResource, dryRun, forceUpdate);
        this.updateResultCounts(result, syncResult);
        result.resources.push(configResource);
      } catch (error) {
        result.errors.push({
          key: `integrations/ai/${provider}/config`,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
    const discoveryResult = await this.discoveryService.discoverModels({
      providers: supportedProviders,
      apiKeys,
      includeDeprecated: false
    });
    for (const err of discoveryResult.errors) {
      result.errors.push({
        key: `discovery/${err.provider}`,
        error: err.error
      });
    }
    for (const model of discoveryResult.models) {
      try {
        const modelResource = this.createModelResource(model);
        const syncResult = await this.syncResource(modelResource, dryRun, forceUpdate);
        this.updateResultCounts(result, syncResult);
        result.resources.push(modelResource);
      } catch (error) {
        result.errors.push({
          key: `integrations/ai/${model.provider}/models/${model.modelId}`,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
    return result;
  }
  /**
   * Generate catalog resources without syncing (for preview/export)
   */
  async generateResources(options = {}) {
    const {
      providers = getRegisteredProviders(),
      apiKeys = {}
    } = options;
    const resources = [];
    const supportedProviders = providers.filter(
      (p) => ["openai", "anthropic", "huggingface"].includes(p)
    );
    for (const provider of supportedProviders) {
      resources.push(this.createProviderConfigResource(provider));
    }
    const discoveryResult = await this.discoveryService.discoverModels({
      providers: supportedProviders,
      apiKeys,
      includeDeprecated: false
    });
    for (const model of discoveryResult.models) {
      resources.push(this.createModelResource(model));
    }
    return resources;
  }
  /**
   * Export resources to JSON format (for bootstrap file)
   */
  async exportToJson(options = {}) {
    const resources = await this.generateResources(options);
    return JSON.stringify(resources, null, 2);
  }
  // =============================================================================
  // Private Methods
  // =============================================================================
  createProviderConfigResource(provider) {
    const config2 = PROVIDER_CONFIGS[provider];
    if (!config2) {
      throw new Error(`No config template for provider: ${provider}`);
    }
    return {
      id: `int-${provider}-config`,
      key: `integrations/ai/${provider}/config`,
      name: config2.name || `${provider} Provider Configuration`,
      description: config2.description,
      type: "integration",
      status: "published",
      isBootstrap: true,
      tags: config2.tags || ["ai", "llm", provider, "integration"],
      accessPolicy: {
        visibility: "public",
        actions: {
          read: { anyOf: ["public"] },
          write: { anyOf: ["role:admin"] }
        }
      },
      metadata: config2.metadata || {}
    };
  }
  createModelResource(model) {
    const modelIdClean = model.modelId.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").toLowerCase();
    const id = `int-${model.provider}-${modelIdClean}`.slice(0, 64);
    const capabilityTags = model.capabilities || [];
    const isEmbedding = capabilityTags.includes("embedding");
    const isReasoning = capabilityTags.includes("reasoning");
    const tags = [
      "ai",
      isEmbedding ? "embedding" : "llm",
      model.provider,
      "model"
    ];
    if (isReasoning) tags.push("reasoning");
    if (capabilityTags.includes("vision")) tags.push("vision");
    if (capabilityTags.includes("function_calling")) tags.push("function_calling");
    if (capabilityTags.includes("open_source")) tags.push("open-source");
    return {
      id,
      key: `integrations/ai/${model.provider}/models/${model.modelId}`,
      name: model.name || model.modelId,
      description: model.description || `${model.provider} model: ${model.modelId}`,
      type: "integration",
      status: "published",
      isBootstrap: true,
      tags,
      metadata: {
        provider: model.provider,
        modelId: model.modelId,
        displayName: model.name || model.modelId,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        inputPricePerMillion: model.inputPricePerMillion,
        outputPricePerMillion: model.outputPricePerMillion,
        supportedOperations: isEmbedding ? ["embeddings"] : ["chat.completions"],
        capabilities: model.capabilities,
        deprecated: model.deprecated
      }
    };
  }
  async syncResource(resource, dryRun, forceUpdate) {
    if (dryRun) {
      return "skipped";
    }
    try {
      const existingResponse = await fetch(
        `${CATALOG_SERVICE_URL2}/api/resources?key=${encodeURIComponent(resource.key)}`
      );
      if (existingResponse.ok) {
        const existing = await existingResponse.json();
        if (existing.length > 0) {
          if (!forceUpdate) {
            return "skipped";
          }
          const updateResponse = await fetch(
            `${CATALOG_SERVICE_URL2}/api/resources/${existing[0].id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: resource.name,
                description: resource.description,
                tags: resource.tags,
                metadata: resource.metadata
              })
            }
          );
          if (!updateResponse.ok) {
            throw new Error(`Failed to update: ${updateResponse.statusText}`);
          }
          return "updated";
        }
      }
      const createResponse = await fetch(`${CATALOG_SERVICE_URL2}/api/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resource)
      });
      if (!createResponse.ok) {
        throw new Error(`Failed to create: ${createResponse.statusText}`);
      }
      return "created";
    } catch (error) {
      throw error;
    }
  }
  updateResultCounts(result, status) {
    switch (status) {
      case "created":
        result.created++;
        break;
      case "updated":
        result.updated++;
        break;
      case "skipped":
        result.skipped++;
        break;
    }
  }
};
var syncServiceInstance = null;
function getCatalogSyncService() {
  if (!syncServiceInstance) {
    syncServiceInstance = new CatalogSyncService();
  }
  return syncServiceInstance;
}

// ../../integrations/server/src/model-eval/api/eval-routes.ts
function getParam(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
function createEvalRoutes(db2) {
  const router = Router();
  const runner = getBenchmarkRunner(db2);
  const repository = getEvalRepository(db2);
  const recommendationEngine = getRecommendationEngine(db2);
  const scoreAggregator = getScoreAggregator(db2);
  router.get("/benchmarks", async (_req, res) => {
    try {
      const taskType = _req.query.taskType;
      let benchmarks;
      if (taskType) {
        const parsed = taskTypeSchema.safeParse(taskType);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid task type",
            details: fromError(parsed.error).message
          });
        }
        benchmarks = getBenchmarksByTaskType(parsed.data);
      } else {
        benchmarks = getAllBenchmarks();
      }
      const summaries = benchmarks.map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        version: b.version,
        taskType: b.taskType,
        category: b.category,
        testCaseCount: b.testCases.length
      }));
      res.json({
        benchmarks: summaries,
        summary: getBenchmarkSummary()
      });
    } catch (error) {
      console.error("[eval-routes] Error listing benchmarks:", error);
      res.status(500).json({ error: "Failed to list benchmarks" });
    }
  });
  router.get("/benchmarks/:id", async (req, res) => {
    try {
      const benchmark = getBenchmark(getParam(req.params, "id"));
      if (!benchmark) {
        return res.status(404).json({ error: "Benchmark not found" });
      }
      res.json(benchmark);
    } catch (error) {
      console.error("[eval-routes] Error getting benchmark:", error);
      res.status(500).json({ error: "Failed to get benchmark" });
    }
  });
  router.post("/benchmarks/run", async (req, res) => {
    try {
      const parsed = runBenchmarkRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: fromError(parsed.error).message
        });
      }
      const { provider, modelId, benchmarkId, testCaseIds, seed, mock } = parsed.data;
      let apiKey = "";
      if (!mock) {
        const headerKey = req.headers["x-api-key"];
        const envKeyMap = {
          openai: process.env.OPENAI_API_KEY,
          anthropic: process.env.ANTHROPIC_API_KEY,
          google: process.env.GOOGLE_API_KEY,
          mistral: process.env.MISTRAL_API_KEY,
          cohere: process.env.COHERE_API_KEY,
          huggingface: process.env.HUGGINGFACE_API_KEY
        };
        apiKey = headerKey || envKeyMap[provider] || "";
        if (!apiKey) {
          return res.status(401).json({
            error: "API key required",
            details: `Provide API key in X-API-Key header or set ${provider.toUpperCase()}_API_KEY environment variable, or use mock=true for testing`
          });
        }
      }
      const result = await runner.runBenchmark(
        {
          provider,
          modelId,
          benchmarkId,
          testCaseIds,
          seed,
          parallelism: 3,
          retries: 1,
          scope: "global"
        },
        {
          apiKey,
          parallelism: 3,
          timeout: 3e4,
          retries: 1,
          mockMode: mock
        }
      );
      res.json(result);
    } catch (error) {
      console.error("[eval-routes] Error running benchmark:", error);
      res.status(500).json({
        error: "Failed to run benchmark",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  router.get("/evaluations", async (req, res) => {
    try {
      const query = {
        provider: req.query.provider,
        modelId: req.query.modelId,
        benchmarkId: req.query.benchmarkId,
        status: req.query.status,
        limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset, 10) : 0
      };
      const evaluations = await repository.queryEvaluations(query);
      const summaries = evaluations.map((e) => ({
        id: e.id,
        provider: e.provider,
        modelId: e.modelId,
        benchmarkId: e.benchmarkId,
        benchmarkVersion: e.benchmarkVersion,
        overallScore: e.overallScore,
        accuracy: e.accuracy,
        latencyP50Ms: e.latencyP50Ms,
        latencyP95Ms: e.latencyP95Ms,
        status: e.status,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        testCaseCount: e.testCaseResults.length
      }));
      res.json({
        evaluations: summaries,
        count: summaries.length,
        limit: query.limit,
        offset: query.offset
      });
    } catch (error) {
      console.error("[eval-routes] Error querying evaluations:", error);
      res.status(500).json({ error: "Failed to query evaluations" });
    }
  });
  router.get("/evaluations/:id", async (req, res) => {
    try {
      const evaluation = await repository.getEvaluation(getParam(req.params, "id"));
      if (!evaluation) {
        return res.status(404).json({ error: "Evaluation not found" });
      }
      res.json(evaluation);
    } catch (error) {
      console.error("[eval-routes] Error getting evaluation:", error);
      res.status(500).json({ error: "Failed to get evaluation" });
    }
  });
  router.get("/scores", async (req, res) => {
    try {
      const query = {
        provider: req.query.provider,
        modelId: req.query.modelId,
        taskType: req.query.taskType
      };
      const scores = await repository.queryScores(query);
      res.json({
        scores,
        count: scores.length
      });
    } catch (error) {
      console.error("[eval-routes] Error querying scores:", error);
      res.status(500).json({ error: "Failed to query scores" });
    }
  });
  router.post("/scores/aggregate", async (req, res) => {
    try {
      const taskType = taskTypeSchema.safeParse(req.body.taskType);
      if (!taskType.success) {
        return res.status(400).json({
          error: "Invalid task type",
          details: fromError(taskType.error).message
        });
      }
      const scores = await scoreAggregator.aggregateAllScores(taskType.data, {
        persist: true
      });
      res.json({
        message: "Score aggregation complete",
        modelsProcessed: scores.length,
        scores
      });
    } catch (error) {
      console.error("[eval-routes] Error aggregating scores:", error);
      res.status(500).json({ error: "Failed to aggregate scores" });
    }
  });
  router.post("/recommendations", async (req, res) => {
    try {
      const parsed = recommendationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: fromError(parsed.error).message
        });
      }
      const recommendations = await recommendationEngine.getRecommendations(
        parsed.data,
        { useCache: true }
      );
      res.json(recommendations);
    } catch (error) {
      console.error("[eval-routes] Error getting recommendations:", error);
      res.status(500).json({ error: "Failed to get recommendations" });
    }
  });
  router.get("/models", async (req, res) => {
    try {
      const taskType = req.query.taskType;
      const providers = req.query.providers ? req.query.providers.split(",") : void 0;
      let models;
      if (taskType) {
        const parsed = taskTypeSchema.safeParse(taskType);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid task type",
            details: fromError(parsed.error).message
          });
        }
        models = await getModelsForTask(parsed.data, { providers });
      } else {
        const result = await discoverAllModels({ providers });
        models = result.models;
      }
      res.json({
        models,
        count: models.length
      });
    } catch (error) {
      console.error("[eval-routes] Error discovering models:", error);
      res.status(500).json({ error: "Failed to discover models" });
    }
  });
  router.post("/catalog/sync", async (req, res) => {
    try {
      const syncService = getCatalogSyncService();
      const providers = req.body.providers ? req.body.providers : void 0;
      const dryRun = req.body.dryRun === true;
      const forceUpdate = req.body.forceUpdate === true;
      const result = await syncService.syncModels({
        providers,
        dryRun,
        forceUpdate
      });
      res.json({
        message: dryRun ? "Dry run complete" : "Catalog sync complete",
        ...result
      });
    } catch (error) {
      console.error("[eval-routes] Error syncing to catalog:", error);
      res.status(500).json({
        error: "Failed to sync to catalog",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  router.get("/catalog/preview", async (req, res) => {
    try {
      const syncService = getCatalogSyncService();
      const providers = req.query.providers ? req.query.providers.split(",") : void 0;
      const resources = await syncService.generateResources({ providers });
      res.json({
        resources,
        count: resources.length,
        providers: [...new Set(resources.map((r) => r.metadata.provider).filter(Boolean))]
      });
    } catch (error) {
      console.error("[eval-routes] Error previewing catalog resources:", error);
      res.status(500).json({ error: "Failed to preview catalog resources" });
    }
  });
  router.get("/catalog/export", async (req, res) => {
    try {
      const syncService = getCatalogSyncService();
      const providers = req.query.providers ? req.query.providers.split(",") : void 0;
      const json3 = await syncService.exportToJson({ providers });
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="integrations-bootstrap-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.json"`
      );
      res.send(json3);
    } catch (error) {
      console.error("[eval-routes] Error exporting catalog resources:", error);
      res.status(500).json({ error: "Failed to export catalog resources" });
    }
  });
  return router;
}

// ../../integrations/server/src/model-eval/index.ts
async function initializeModelEvalSystem() {
  const { initializeBuiltinBenchmarks: initializeBuiltinBenchmarks2 } = await Promise.resolve().then(() => (init_benchmark_registry(), benchmark_registry_exports));
  initializeBuiltinBenchmarks2();
  console.log("[model-eval] System initialized");
}

// ../../integrations/server/src/routes.ts
init_db();
init_schema();
import { sql as sql4, and as and3 } from "drizzle-orm";

// ../../integrations/server/src/openapi.ts
var apiDocumentation = {
  openapi: "3.0.3",
  info: {
    title: "Symbia Integrations Service",
    description: "Centralized gateway for third-party API traffic. Sole bridge to the external world in most Symbia networks.",
    version: "2.0.0"
  },
  servers: [
    {
      url: "http://localhost:5007",
      description: "Local development"
    }
  ],
  tags: [
    { name: "Execute", description: "Execute operations via providers" },
    { name: "Providers", description: "Provider configuration and discovery" },
    { name: "Registry", description: "Integration registry management" },
    { name: "MCP", description: "MCP server and client endpoints" },
    { name: "Usage", description: "Usage analytics" },
    { name: "Health", description: "Service health and monitoring" },
    { name: "Database", description: "Database management (in-memory mode)" }
  ],
  paths: {
    "/api/integrations/execute": {
      post: {
        tags: ["Execute"],
        summary: "Execute an LLM operation",
        description: "Execute a chat completion or embedding operation through a configured provider",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ExecuteRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "Successful execution",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ExecuteResponse" }
              }
            }
          },
          "400": { description: "Invalid request or validation error" },
          "401": { description: "Authentication required" },
          "429": { description: "Rate limit exceeded" },
          "502": { description: "Provider error" },
          "503": { description: "Circuit breaker open or service unavailable" },
          "504": { description: "Request timed out" }
        }
      }
    },
    "/api/integrations/invoke": {
      post: {
        tags: ["Execute"],
        summary: "Invoke any registered integration operation",
        description: "Invoke operations from registered OpenAPI specs, MCP servers, or built-in providers",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/InvokeRequest" }
            }
          }
        },
        responses: {
          "200": { description: "Successful invocation" },
          "400": { description: "Invalid request" },
          "401": { description: "Authentication required" },
          "404": { description: "Operation not found" }
        }
      }
    },
    // Declared 16 Aug. The route has existed since the models rework, but
    // an undeclared route is an unreachable one for any caller that
    // resolves against this document — the MCP dispatcher reported models'
    // weight download as "no such operation" while the handler sat there
    // working. Spec completeness is a capability gap, measurably.
    "/api/integrations/download": {
      post: {
        tags: ["Execute"],
        summary: "Stream a file from a provider through this service",
        description: "Streams bytes from the provider to the caller. This service supplies the org's credential when it holds one, so gated repositories work and the key never leaves here. It makes no claim about what the bytes are \u2014 the caller hashes, ledgers and cards them.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["provider", "repo", "file"],
                properties: {
                  provider: { type: "string", enum: ["huggingface"] },
                  repo: { type: "string", example: "TheBloke/Llama-2-7B-GGUF" },
                  file: { type: "string", description: "A plain .gguf file name, no path", example: "llama-2-7b.Q4_K_M.gguf" },
                  revision: { type: "string", default: "main" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "The file, streamed", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } },
          "400": { description: "provider, repo and a plain .gguf file name required" },
          "401": { description: "Authentication required" },
          "500": { description: "The provider refused or the stream failed" }
        }
      }
    },
    "/api/integrations/providers": {
      get: {
        tags: ["Providers"],
        summary: "List available providers",
        responses: {
          "200": {
            description: "List of providers",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    providers: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ProviderInfo" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/integrations/providers/{provider}": {
      get: {
        tags: ["Providers"],
        summary: "Get provider configuration",
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Provider configuration" },
          "404": { description: "Provider not found" }
        }
      }
    },
    "/api/integrations/providers/{provider}/models": {
      get: {
        tags: ["Providers"],
        summary: "Get available models for a provider",
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string" } },
          { name: "capability", in: "query", schema: { type: "string" } }
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "List of models" }
        }
      }
    },
    "/api/integrations/capabilities": {
      get: {
        tags: ["Providers"],
        summary: "Get comprehensive provider capabilities",
        description: "System of Record for UI - includes access status, models by purpose, defaults",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Provider capabilities",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CapabilitiesResponse" }
              }
            }
          }
        }
      }
    },
    "/api/integrations/registry": {
      get: {
        tags: ["Registry"],
        summary: "List all registered integrations",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "List of integrations" }
        }
      }
    },
    "/api/integrations/register": {
      post: {
        tags: ["Registry"],
        summary: "Register a new integration",
        description: "Register an OpenAPI spec or MCP server as a callable integration",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" }
            }
          }
        },
        responses: {
          "200": { description: "Integration registered" },
          "400": { description: "Invalid request" }
        }
      }
    },
    "/api/integrations/registry/{key}/operations": {
      get: {
        tags: ["Registry"],
        summary: "Get operations for an integration",
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" } }
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "List of operations" },
          "404": { description: "Integration not found" }
        }
      }
    },
    "/api/integrations/mcp": {
      post: {
        tags: ["MCP"],
        summary: "MCP JSON-RPC endpoint",
        description: "HTTP transport for MCP protocol. Supports initialize, tools/list, tools/call",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MCPRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "MCP response",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MCPResponse" }
              }
            }
          }
        }
      }
    },
    "/api/integrations/mcp/info": {
      get: {
        tags: ["MCP"],
        summary: "Get MCP server info",
        responses: {
          "200": { description: "Server info" }
        }
      }
    },
    "/api/integrations/mcp/register": {
      post: {
        tags: ["MCP"],
        summary: "Register an external MCP server",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterMCPRequest" }
            }
          }
        },
        responses: {
          "200": { description: "MCP server registered" },
          "400": { description: "Failed to connect to MCP server" }
        }
      }
    },
    "/api/integrations/usage": {
      get: {
        tags: ["Usage"],
        summary: "Get usage summary for organization",
        parameters: [
          { name: "days", in: "query", schema: { type: "integer", default: 30 } },
          { name: "integration", in: "query", schema: { type: "string" } }
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Usage summary" }
        }
      }
    },
    "/api/integrations/status": {
      get: {
        tags: ["Health"],
        summary: "Get service status",
        description: "Returns provider status and circuit breaker state",
        responses: {
          "200": {
            description: "Service status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusResponse" }
              }
            }
          }
        }
      }
    },
    "/api/integrations/circuit-breaker": {
      get: {
        tags: ["Health"],
        summary: "Get circuit breaker status",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Circuit breaker status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CircuitBreakerStatus" }
              }
            }
          }
        }
      }
    },
    "/api/integrations/circuit-breaker/reset": {
      post: {
        tags: ["Health"],
        summary: "Reset all circuit breakers",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "All circuits reset" }
        }
      }
    },
    "/api/integrations/circuit-breaker/reset/{provider}": {
      post: {
        tags: ["Health"],
        summary: "Reset circuit breaker for a provider",
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string" } }
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Circuit reset" }
        }
      }
    },
    "/api/integrations/db/export": {
      post: {
        tags: ["Database"],
        summary: "Export in-memory database to file",
        description: "Exports the in-memory database to a backup file. Only applicable when using in-memory mode.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Export successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    path: { type: "string" },
                    message: { type: "string" }
                  }
                }
              }
            }
          },
          "401": { description: "Authentication required" },
          "500": { description: "Export failed" }
        }
      }
    },
    "/api/integrations/db/status": {
      get: {
        tags: ["Database"],
        summary: "Get database status",
        description: "Returns information about the database mode (in-memory vs PostgreSQL) and persistence status.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Database status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    isMemory: { type: "boolean" },
                    persistsOnRestart: { type: "boolean" },
                    recommendation: { type: "string" }
                  }
                }
              }
            }
          },
          "401": { description: "Authentication required" }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      ExecuteRequest: {
        type: "object",
        required: ["provider", "operation", "params"],
        properties: {
          provider: {
            type: "string",
            enum: ["openai", "anthropic", "google", "mistral", "cohere", "huggingface"]
          },
          operation: {
            type: "string",
            enum: ["chat.completions", "messages", "embeddings", "responses"]
          },
          params: {
            type: "object",
            required: ["model"],
            properties: {
              model: { type: "string" },
              messages: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    role: { type: "string", enum: ["system", "user", "assistant"] },
                    content: { type: "string" }
                  }
                }
              },
              temperature: { type: "number", minimum: 0, maximum: 2 },
              maxTokens: { type: "integer" },
              topP: { type: "number" },
              frequencyPenalty: { type: "number" },
              presencePenalty: { type: "number" },
              stop: { type: "array", items: { type: "string" } },
              seed: { type: "integer" },
              input: { type: "string", description: "For embedding operations" }
            }
          },
          credentialId: { type: "string" }
        }
      },
      ExecuteResponse: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          data: { $ref: "#/components/schemas/NormalizedLLMResponse" },
          error: { type: "string" },
          errorCategory: { $ref: "#/components/schemas/ErrorCategory" },
          retryable: { type: "boolean" },
          requestId: { type: "string" },
          durationMs: { type: "number" }
        }
      },
      NormalizedLLMResponse: {
        type: "object",
        properties: {
          provider: { type: "string" },
          model: { type: "string" },
          content: { type: "string" },
          usage: {
            type: "object",
            properties: {
              promptTokens: { type: "integer" },
              completionTokens: { type: "integer" },
              totalTokens: { type: "integer" }
            }
          },
          finishReason: {
            type: "string",
            enum: ["stop", "length", "content_filter", "tool_calls", "error", "incomplete"]
          },
          metadata: { type: "object" }
        }
      },
      ErrorCategory: {
        type: "string",
        enum: [
          "auth",
          "validation",
          "rate_limit",
          "timeout",
          "provider",
          "network",
          "not_found",
          "content_filter",
          "quota",
          "internal"
        ],
        description: "Error category for retry/fallback decisions"
      },
      InvokeRequest: {
        type: "object",
        required: ["operation"],
        properties: {
          operation: { type: "string", description: "Fully qualified operation ID" },
          body: { type: "object" },
          timeout: { type: "integer" }
        }
      },
      ProviderInfo: {
        type: "object",
        properties: {
          name: { type: "string" },
          baseUrl: { type: "string" },
          defaultModel: { type: "string" },
          supportedOperations: { type: "array", items: { type: "string" } }
        }
      },
      CapabilitiesResponse: {
        type: "object",
        properties: {
          providers: { type: "array", items: { type: "object" } },
          byProvider: { type: "object" },
          modelsByPurpose: {
            type: "object",
            properties: {
              chat: { type: "array", items: { type: "object" } },
              embedding: { type: "array", items: { type: "object" } },
              vision: { type: "array", items: { type: "object" } },
              reasoning: { type: "array", items: { type: "object" } }
            }
          },
          defaults: { type: "object" }
        }
      },
      RegisterRequest: {
        type: "object",
        required: ["key", "name", "type"],
        properties: {
          key: { type: "string" },
          name: { type: "string" },
          type: { type: "string", enum: ["openapi", "mcp", "builtin", "custom"] },
          openapi: {
            type: "object",
            properties: {
              specUrl: { type: "string" },
              serverUrl: { type: "string" }
            }
          },
          mcp: {
            type: "object",
            properties: {
              transport: { type: "string", enum: ["stdio", "http", "websocket"] },
              command: { type: "string" },
              args: { type: "array", items: { type: "string" } },
              serverUrl: { type: "string" }
            }
          },
          auth: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["none", "bearer", "apiKey"] }
            }
          }
        }
      },
      MCPRequest: {
        type: "object",
        required: ["jsonrpc", "method"],
        properties: {
          jsonrpc: { type: "string", enum: ["2.0"] },
          id: { oneOf: [{ type: "string" }, { type: "integer" }] },
          method: { type: "string" },
          params: { type: "object" }
        }
      },
      MCPResponse: {
        type: "object",
        properties: {
          jsonrpc: { type: "string" },
          id: { oneOf: [{ type: "string" }, { type: "integer" }] },
          result: { type: "object" },
          error: {
            type: "object",
            properties: {
              code: { type: "integer" },
              message: { type: "string" }
            }
          }
        }
      },
      RegisterMCPRequest: {
        type: "object",
        required: ["key", "name", "mcp"],
        properties: {
          key: { type: "string" },
          name: { type: "string" },
          mcp: {
            type: "object",
            properties: {
              transport: { type: "string", enum: ["stdio", "http", "websocket"] },
              command: { type: "string" },
              args: { type: "array", items: { type: "string" } },
              serverUrl: { type: "string" }
            }
          }
        }
      },
      StatusResponse: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["healthy", "degraded", "unhealthy"] },
          providers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                configured: { type: "boolean" }
              }
            }
          },
          circuitBreaker: { $ref: "#/components/schemas/CircuitBreakerStatus" }
        }
      },
      CircuitBreakerStatus: {
        type: "object",
        additionalProperties: {
          type: "object",
          properties: {
            state: { type: "string", enum: ["closed", "open", "half-open"] },
            failures: { type: "integer" },
            lastFailure: { type: "string" }
          }
        }
      }
    }
  }
};
{
  const __autoDocumentedPaths = {
    "/api/oauth/connections/{id}": {
      "delete": {
        "tags": [
          "Api"
        ],
        "summary": "Delete connections",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/admin/users": {
      "get": {
        "tags": [
          "Admin"
        ],
        "summary": "List users",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/channels/benchmarks": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List benchmarks",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/channels/benchmarks/{id}": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Get benchmarks",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/api/integrations/channels/catalog/export": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Export api integrations channels catalog export",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/channels/catalog/preview": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Preview api integrations channels catalog preview",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/channels/evaluations": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List evaluations",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/channels/evaluations/{id}": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Get evaluations",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/api/integrations/channels/models": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List models",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/channels/scores": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List scores",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/models": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List models",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/namespace": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Get namespace",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/operations/search": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Get search",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/registry/{key}": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Get registry",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "key",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/api/integrations/usage/by-user": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Get by user",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/usage/logs": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List logs",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/oauth/callback": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Callback api oauth callback",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/oauth/connections": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List connections",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/oauth/providers": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List providers",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/stats": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List stats",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/channels/benchmarks/run": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Run api integrations channels benchmarks run",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/channels/catalog/sync": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Sync api integrations channels catalog sync",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/channels/recommendations": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Recommendations api integrations channels recommendations",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/channels/scores/aggregate": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Aggregate api integrations channels scores aggregate",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/parse/mcp": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Create mcp",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/parse/openapi": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Create openapi",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/api/integrations/registry/{key}/refresh": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Refresh api integrations registry refresh",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "key",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/api/oauth/authorize": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Authorize api oauth authorize",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    }
  };
  const __paths = apiDocumentation.paths;
  for (const [key, ops] of Object.entries(__autoDocumentedPaths)) {
    __paths[key] = { ...__paths[key] || {}, ...ops };
  }
}

// ../../integrations/server/src/routes.ts
import { observabilityMiddleware } from "@symbia/relay";

// ../../integrations/server/src/errors.ts
var IntegrationError = class extends Error {
  category;
  statusCode;
  provider;
  operation;
  retryable;
  upstream;
  constructor(opts) {
    super(opts.message, { cause: opts.cause });
    this.name = "IntegrationError";
    this.category = opts.category;
    this.statusCode = opts.statusCode ?? categoryToStatus(opts.category);
    this.provider = opts.provider;
    this.operation = opts.operation;
    this.retryable = opts.retryable ?? categoryRetryable(opts.category);
    this.upstream = opts.upstream;
  }
  /**
   * Serialize for API response — safe to send to callers
   */
  toResponse() {
    return {
      error: this.message,
      category: this.category,
      retryable: this.retryable,
      provider: this.provider,
      operation: this.operation,
      upstream: this.upstream ? {
        statusCode: this.upstream.statusCode,
        code: this.upstream.code
      } : void 0
    };
  }
};
function classifyProviderError(err, provider, operation) {
  if (err instanceof IntegrationError) {
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? err : void 0;
  if (message.includes("The operation was aborted") || message.includes("aborted") || message.includes("timeout") || message.includes("Timeout") || err instanceof DOMException && err.name === "TimeoutError") {
    return new IntegrationError({
      message: `Request to ${provider} timed out`,
      category: "timeout",
      provider,
      operation,
      cause
    });
  }
  if (message.includes("fetch failed") || message.includes("ECONNREFUSED") || message.includes("ECONNRESET") || message.includes("ENOTFOUND") || message.includes("EAI_AGAIN") || message.includes("socket hang up") || message.includes("network")) {
    return new IntegrationError({
      message: `Network error connecting to ${provider}: ${message}`,
      category: "network",
      provider,
      operation,
      cause
    });
  }
  const upstreamStatus = extractUpstreamStatus(message);
  if (upstreamStatus) {
    if (upstreamStatus === 401 || upstreamStatus === 403) {
      return new IntegrationError({
        message: `${provider} rejected the API key. Check your credentials in Settings.`,
        category: "auth",
        provider,
        operation,
        retryable: false,
        upstream: { statusCode: upstreamStatus, message },
        cause
      });
    }
    if (upstreamStatus === 429) {
      return new IntegrationError({
        message: `${provider} rate limit exceeded. Try again shortly.`,
        category: "rate_limit",
        provider,
        operation,
        retryable: true,
        upstream: { statusCode: upstreamStatus, message },
        cause
      });
    }
    if (upstreamStatus === 402 || message.toLowerCase().includes("quota") || message.toLowerCase().includes("billing")) {
      return new IntegrationError({
        message: `${provider} quota or billing limit reached.`,
        category: "quota",
        provider,
        operation,
        retryable: false,
        upstream: { statusCode: upstreamStatus, message },
        cause
      });
    }
    if (message.toLowerCase().includes("content_filter") || message.toLowerCase().includes("safety") || message.toLowerCase().includes("harmful")) {
      return new IntegrationError({
        message: `${provider} blocked the request due to content policy.`,
        category: "content_filter",
        provider,
        operation,
        retryable: false,
        upstream: { statusCode: upstreamStatus, message },
        cause
      });
    }
  }
  if (message.toLowerCase().includes("rate limit") || message.toLowerCase().includes("rate_limit")) {
    return new IntegrationError({
      message: `${provider} rate limit exceeded. Try again shortly.`,
      category: "rate_limit",
      provider,
      operation,
      retryable: true,
      cause
    });
  }
  if (message.toLowerCase().includes("quota") || message.toLowerCase().includes("insufficient_quota") || message.toLowerCase().includes("billing")) {
    return new IntegrationError({
      message: `${provider} quota or billing limit reached.`,
      category: "quota",
      provider,
      operation,
      retryable: false,
      cause
    });
  }
  if (message.toLowerCase().includes("invalid api key") || message.toLowerCase().includes("unauthorized") || message.toLowerCase().includes("authentication")) {
    return new IntegrationError({
      message: `${provider} rejected the API key. Check your credentials in Settings.`,
      category: "auth",
      provider,
      operation,
      retryable: false,
      cause
    });
  }
  if (message.toLowerCase().includes("content_filter") || message.toLowerCase().includes("content policy") || message.toLowerCase().includes("safety")) {
    return new IntegrationError({
      message: `${provider} blocked the request due to content policy.`,
      category: "content_filter",
      provider,
      operation,
      retryable: false,
      cause
    });
  }
  return new IntegrationError({
    message: `${provider} error: ${message}`,
    category: "provider",
    provider,
    operation,
    upstream: upstreamStatus ? { statusCode: upstreamStatus, message } : void 0,
    cause
  });
}
function categoryToStatus(category) {
  switch (category) {
    case "auth":
      return 401;
    case "validation":
      return 400;
    case "rate_limit":
      return 429;
    case "timeout":
      return 504;
    case "provider":
      return 502;
    case "network":
      return 502;
    case "not_found":
      return 404;
    case "content_filter":
      return 422;
    case "quota":
      return 402;
    case "internal":
      return 500;
  }
}
function categoryRetryable(category) {
  switch (category) {
    case "timeout":
    case "network":
    case "rate_limit":
    case "provider":
      return true;
    case "auth":
    case "validation":
    case "not_found":
    case "content_filter":
    case "quota":
    case "internal":
      return false;
  }
}
function extractUpstreamStatus(message) {
  const statusMatch = message.match(/(?:status|HTTP|error)\s+(\d{3})/i);
  if (statusMatch) {
    return parseInt(statusMatch[1], 10);
  }
  const codeMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
  if (codeMatch) {
    return parseInt(codeMatch[1], 10);
  }
  return void 0;
}

// ../../integrations/server/src/telemetry.ts
import { createTelemetryClient } from "@symbia/logging-client";
import {
  emitEvent,
  emitHttpRequest,
  emitHttpResponse,
  startProcessMetricsInterval
} from "@symbia/relay";
import { ServiceId as ServiceId5 } from "@symbia/sys";
var telemetryClient = null;
function getTelemetry() {
  if (!telemetryClient) {
    telemetryClient = createTelemetryClient({
      serviceId: process.env.TELEMETRY_SERVICE_ID || ServiceId5.INTEGRATIONS
    });
  }
  return telemetryClient;
}
function recordProviderRequest(provider, operation, durationMs, success, usage) {
  const telemetry = getTelemetry();
  const tags = { provider, operation, success: String(success) };
  telemetry.metric("integrations.provider.request.count", 1, tags);
  telemetry.metric("integrations.provider.request.duration_ms", durationMs, tags);
  if (usage) {
    if (usage.promptTokens) {
      telemetry.metric("integrations.provider.tokens.prompt", usage.promptTokens, { provider });
    }
    if (usage.completionTokens) {
      telemetry.metric("integrations.provider.tokens.completion", usage.completionTokens, { provider });
    }
    if (usage.totalTokens) {
      telemetry.metric("integrations.provider.tokens.total", usage.totalTokens, { provider });
    }
  }
}
function recordCircuitBreakerChange(provider, state) {
  const telemetry = getTelemetry();
  telemetry.event("integrations.circuit_breaker.state_change", `Circuit breaker for ${provider} changed to ${state}`, {
    provider,
    state
  });
}
async function withProviderObservability(provider, operation, requestId, fn) {
  const startTime = Date.now();
  const traceId = requestId;
  const requestEvent = {
    method: "POST",
    path: `/${provider}/${operation}`,
    traceId
  };
  emitHttpRequest(requestEvent, traceId).catch(() => {
  });
  emitEvent("integrations.provider.request", {
    provider,
    operation,
    requestId
  }, requestId, {
    target: `provider:${provider}`,
    boundary: "extra"
  }).catch(() => {
  });
  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;
    const responseEvent = {
      method: "POST",
      path: `/${provider}/${operation}`,
      statusCode: 200,
      durationMs,
      traceId
    };
    emitHttpResponse(responseEvent, traceId).catch(() => {
    });
    emitEvent("integrations.provider.response", {
      provider,
      operation,
      requestId,
      durationMs,
      success: true
    }, requestId, {
      target: ServiceId5.INTEGRATIONS,
      boundary: "extra"
    }).catch(() => {
    });
    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const responseEvent = {
      method: "POST",
      path: `/${provider}/${operation}`,
      statusCode: 502,
      durationMs,
      traceId
    };
    emitHttpResponse(responseEvent, traceId).catch(() => {
    });
    emitEvent("integrations.provider.error", {
      provider,
      operation,
      requestId,
      durationMs,
      error: error instanceof Error ? error.message : "Unknown error"
    }, requestId, {
      target: ServiceId5.INTEGRATIONS,
      boundary: "extra"
    }).catch(() => {
    });
    throw error;
  }
}

// ../../integrations/server/src/rate-limiter.ts
var DEFAULT_CONFIG = {
  userLimit: 100,
  // 100 requests per user per minute
  orgLimit: 500,
  // 500 requests per org per minute
  providerLimit: 1e3,
  // 1000 requests per provider per minute
  windowMs: 6e4
  // 1 minute window
};
var PROVIDER_LIMITS = {
  openai: 3e3,
  anthropic: 1e3,
  google: 500,
  mistral: 500,
  cohere: 500,
  huggingface: 300
};
var SlidingWindowCounter = class {
  windows = /* @__PURE__ */ new Map();
  windowMs;
  constructor(windowMs) {
    this.windowMs = windowMs;
    setInterval(() => this.cleanup(), 5 * 6e4);
  }
  /**
   * Increment counter and check if over limit
   * Returns { allowed: boolean, current: number, limit: number, resetMs: number }
   */
  check(key, limit) {
    const now = Date.now();
    const entry = this.windows.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.windows.set(key, { count: 1, windowStart: now });
      return { allowed: true, current: 1, limit, resetMs: this.windowMs };
    }
    entry.count++;
    const resetMs = this.windowMs - (now - entry.windowStart);
    if (entry.count > limit) {
      return { allowed: false, current: entry.count, limit, resetMs };
    }
    return { allowed: true, current: entry.count, limit, resetMs };
  }
  /**
   * Get current count without incrementing
   */
  peek(key) {
    const now = Date.now();
    const entry = this.windows.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      return 0;
    }
    return entry.count;
  }
  /**
   * Remove stale entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.windows.entries()) {
      if (now - entry.windowStart >= this.windowMs * 2) {
        this.windows.delete(key);
      }
    }
  }
};
var RateLimiter = class {
  userCounter;
  orgCounter;
  providerCounter;
  config;
  constructor(config2 = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config2 };
    this.userCounter = new SlidingWindowCounter(this.config.windowMs);
    this.orgCounter = new SlidingWindowCounter(this.config.windowMs);
    this.providerCounter = new SlidingWindowCounter(this.config.windowMs);
  }
  /**
   * Check all rate limits for a request
   * Throws IntegrationError if any limit exceeded
   */
  checkLimits(opts) {
    const { userId, orgId, provider } = opts;
    const userKey = `user:${userId}`;
    const userResult = this.userCounter.check(userKey, this.config.userLimit);
    if (!userResult.allowed) {
      throw new IntegrationError({
        message: `Rate limit exceeded. You've made ${userResult.current} requests in the last minute (limit: ${userResult.limit}). Try again in ${Math.ceil(userResult.resetMs / 1e3)}s.`,
        category: "rate_limit",
        provider,
        retryable: true
      });
    }
    const orgKey = `org:${orgId}`;
    const orgResult = this.orgCounter.check(orgKey, this.config.orgLimit);
    if (!orgResult.allowed) {
      throw new IntegrationError({
        message: `Organization rate limit exceeded. Your organization has made ${orgResult.current} requests in the last minute (limit: ${orgResult.limit}). Try again in ${Math.ceil(orgResult.resetMs / 1e3)}s.`,
        category: "rate_limit",
        provider,
        retryable: true
      });
    }
    const providerLimit = PROVIDER_LIMITS[provider] || this.config.providerLimit;
    const providerKey = `provider:${provider}`;
    const providerResult = this.providerCounter.check(providerKey, providerLimit);
    if (!providerResult.allowed) {
      throw new IntegrationError({
        message: `${provider} rate limit exceeded. Platform has made ${providerResult.current} requests in the last minute (limit: ${providerResult.limit}). Try again in ${Math.ceil(providerResult.resetMs / 1e3)}s.`,
        category: "rate_limit",
        provider,
        retryable: true
      });
    }
  }
  /**
   * Get current usage stats (for debugging/monitoring)
   */
  getStats(opts) {
    const stats = {};
    if (opts.userId) {
      stats.userRequests = this.userCounter.peek(`user:${opts.userId}`);
    }
    if (opts.orgId) {
      stats.orgRequests = this.orgCounter.peek(`org:${opts.orgId}`);
    }
    if (opts.provider) {
      stats.providerRequests = this.providerCounter.peek(`provider:${opts.provider}`);
    }
    return stats;
  }
};
var rateLimiter = new RateLimiter();
function rateLimitMiddleware(req, res, next) {
  if (!config.rateLimitEnabled) {
    next();
    return;
  }
  const user = req.user;
  const provider = req.body?.provider;
  if (!user || !provider) {
    next();
    return;
  }
  try {
    rateLimiter.checkLimits({
      userId: user.id,
      orgId: user.orgId || user.organizations?.[0]?.id,
      provider
    });
    const stats = rateLimiter.getStats({ userId: user.id, orgId: user.orgId, provider });
    res.setHeader("X-RateLimit-User-Remaining", String(DEFAULT_CONFIG.userLimit - (stats.userRequests || 0)));
    res.setHeader("X-RateLimit-Org-Remaining", String(DEFAULT_CONFIG.orgLimit - (stats.orgRequests || 0)));
    next();
  } catch (error) {
    if (error instanceof IntegrationError) {
      res.status(error.statusCode).json(error.toResponse());
    } else {
      next(error);
    }
  }
}

// ../../integrations/server/src/security.ts
import { sanitizeForLogging, redact, redactObject } from "@symbia/redact";
import { sanitizeForLogging as sanitizeForLogging2 } from "@symbia/redact";
var MAX_BODY_SIZE = 10 * 1024 * 1024;
function bodySizeLimitMiddleware(req, res, next) {
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  if (contentLength > MAX_BODY_SIZE) {
    const error = new IntegrationError({
      message: `Request body too large. Maximum size is ${MAX_BODY_SIZE / 1024 / 1024}MB`,
      category: "validation",
      retryable: false
    });
    res.status(error.statusCode).json(error.toResponse());
    return;
  }
  next();
}
function securityHeadersMiddleware(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'"
  );
  next();
}
var DEFAULT_CIRCUIT_CONFIG = {
  failureThreshold: 5,
  resetTimeout: 3e4,
  // 30 seconds
  successThreshold: 2
};
var CircuitBreaker = class {
  circuits = /* @__PURE__ */ new Map();
  config;
  constructor(config2 = {}) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config2 };
  }
  /**
   * Get the current state for a provider
   */
  getState(provider) {
    if (!this.circuits.has(provider)) {
      this.circuits.set(provider, {
        failures: 0,
        lastFailure: 0,
        state: "closed",
        successesSinceHalfOpen: 0
      });
    }
    return this.circuits.get(provider);
  }
  /**
   * Check if requests should be allowed through
   */
  canRequest(provider) {
    const state = this.getState(provider);
    const now = Date.now();
    switch (state.state) {
      case "closed":
        return { allowed: true };
      case "open":
        if (now - state.lastFailure >= this.config.resetTimeout) {
          state.state = "half-open";
          state.successesSinceHalfOpen = 0;
          recordCircuitBreakerChange(provider, "half-open");
          return { allowed: true };
        }
        return {
          allowed: false,
          reason: `Circuit open for ${provider}. Too many recent failures. Retry after ${Math.ceil((this.config.resetTimeout - (now - state.lastFailure)) / 1e3)}s`
        };
      case "half-open":
        return { allowed: true };
    }
  }
  /**
   * Record a successful request
   */
  recordSuccess(provider) {
    const state = this.getState(provider);
    if (state.state === "half-open") {
      state.successesSinceHalfOpen++;
      if (state.successesSinceHalfOpen >= this.config.successThreshold) {
        state.state = "closed";
        state.failures = 0;
        state.successesSinceHalfOpen = 0;
        recordCircuitBreakerChange(provider, "closed");
      }
    } else if (state.state === "closed") {
      state.failures = 0;
    }
  }
  /**
   * Record a failed request
   */
  recordFailure(provider) {
    const state = this.getState(provider);
    const now = Date.now();
    const previousState = state.state;
    state.failures++;
    state.lastFailure = now;
    if (state.state === "half-open") {
      state.state = "open";
      recordCircuitBreakerChange(provider, "open");
    } else if (state.failures >= this.config.failureThreshold && previousState !== "open") {
      state.state = "open";
      recordCircuitBreakerChange(provider, "open");
    }
  }
  /**
   * Get status for monitoring
   */
  getStatus() {
    const status = {};
    for (const [provider, state] of this.circuits) {
      status[provider] = {
        state: state.state,
        failures: state.failures,
        lastFailure: state.lastFailure ? new Date(state.lastFailure).toISOString() : "never"
      };
    }
    return status;
  }
  /**
   * Reset a circuit (for manual intervention)
   */
  reset(provider) {
    this.circuits.delete(provider);
  }
  /**
   * Reset all circuits
   */
  resetAll() {
    this.circuits.clear();
  }
};
var circuitBreaker = new CircuitBreaker();

// ../../integrations/server/src/executors/types.ts
function classifyOperation(op) {
  if (op.mcpTool) {
    return "mcp-tool";
  }
  if (op.id.startsWith("resource.")) {
    return "mcp-resource";
  }
  if (op.id.startsWith("prompt.")) {
    return "mcp-prompt";
  }
  if (op.tags?.includes("llm") || op.tags?.includes("chat")) {
    return "llm";
  }
  if (op.tags?.includes("embedding")) {
    return "embedding";
  }
  if (op.id.includes("chat.completions") || op.id.includes("messages") || op.id.includes("responses")) {
    return "llm";
  }
  if (op.id.includes("embedding")) {
    return "embedding";
  }
  return "api-call";
}

// ../../integrations/server/src/executors/provider-executor.ts
var ProviderExecutor = class {
  supportedTypes = ["llm", "embedding"];
  canHandle(operationType) {
    return this.supportedTypes.includes(operationType);
  }
  async execute(request) {
    const { operation, integrationKey, params, context } = request;
    const adapter = getProvider(integrationKey);
    if (!adapter) {
      throw new IntegrationError({
        message: `Unknown provider: ${integrationKey}`,
        category: "not_found",
        provider: integrationKey
      });
    }
    const credential = await getCredential(
      context.userId,
      context.orgId,
      integrationKey,
      context.authToken
    );
    if (!credential) {
      throw new IntegrationError({
        message: `No ${integrationKey} API key configured. Add your API key in Settings.`,
        category: "auth",
        provider: integrationKey,
        retryable: false
      });
    }
    const operationId = operation.operationId || operation.id.split(".")[0];
    const isEmbedding = operationId === "embeddings" || operation.tags?.includes("embedding");
    const validation = adapter.validateParams(operationId, params);
    if (!validation.valid) {
      throw new IntegrationError({
        message: `Invalid params: ${validation.errors?.join(", ")}`,
        category: "validation",
        provider: integrationKey,
        operation: operationId
      });
    }
    try {
      if (isEmbedding) {
        if (!adapter.embed) {
          throw new IntegrationError({
            message: `${integrationKey} does not support embeddings`,
            category: "not_found",
            provider: integrationKey
          });
        }
        const result = await adapter.embed({
          operation: operationId,
          model: params.model,
          params,
          apiKey: credential.apiKey,
          timeout: context.timeout
        });
        return {
          type: "embedding",
          data: result
        };
      } else {
        const result = await adapter.execute({
          operation: operationId,
          model: params.model,
          params,
          apiKey: credential.apiKey,
          timeout: context.timeout
        });
        return {
          type: "llm",
          data: result
        };
      }
    } catch (error) {
      throw classifyProviderError(error, integrationKey, operationId);
    }
  }
};
var providerExecutor = new ProviderExecutor();

// ../../integrations/server/src/executors/mcp-executor.ts
import { spawn as spawn2 } from "child_process";
var MCPConnectionPool = class {
  connections = /* @__PURE__ */ new Map();
  maxIdleMs = 5 * 60 * 1e3;
  // 5 minutes
  cleanupInterval;
  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 6e4);
  }
  /**
   * Get or create a connection to an MCP server
   */
  async getConnection(serverKey, config2) {
    let conn = this.connections.get(serverKey);
    if (conn && conn.isConnected) {
      conn.lastUsed = Date.now();
      return conn;
    }
    conn = await this.createConnection(serverKey, config2);
    this.connections.set(serverKey, conn);
    return conn;
  }
  /**
   * Create a new MCP connection
   */
  async createConnection(serverKey, config2) {
    const conn = {
      config: config2,
      messageId: 0,
      pendingRequests: /* @__PURE__ */ new Map(),
      buffer: "",
      lastUsed: Date.now(),
      isConnected: false
    };
    if (config2.transport === "stdio") {
      await this.connectStdio(conn);
    } else if (config2.transport === "http" || config2.transport === "websocket") {
      conn.isConnected = true;
    }
    return conn;
  }
  /**
   * Connect to a stdio-based MCP server
   */
  async connectStdio(conn) {
    if (!conn.config.command) {
      throw new IntegrationError({
        message: "No command specified for stdio MCP server",
        category: "validation"
      });
    }
    return new Promise((resolve, reject) => {
      const proc = spawn2(conn.config.command, conn.config.args || [], {
        env: { ...process.env, ...conn.config.env },
        stdio: ["pipe", "pipe", "pipe"]
      });
      if (!proc.stdin || !proc.stdout) {
        reject(new IntegrationError({
          message: "Failed to create MCP process pipes",
          category: "internal"
        }));
        return;
      }
      conn.process = proc;
      proc.stdout.on("data", (data) => {
        conn.buffer += data.toString();
        this.processBuffer(conn);
      });
      proc.stderr?.on("data", (data) => {
        console.warn(`[mcp] stderr: ${data.toString()}`);
      });
      proc.on("exit", (code) => {
        console.log(`[mcp] Process exited with code ${code}`);
        conn.isConnected = false;
        for (const pending of conn.pendingRequests.values()) {
          clearTimeout(pending.timeout);
          pending.reject(new IntegrationError({
            message: "MCP server disconnected",
            category: "network"
          }));
        }
        conn.pendingRequests.clear();
      });
      proc.on("error", (err) => {
        console.error(`[mcp] Process error:`, err);
        conn.isConnected = false;
        reject(new IntegrationError({
          message: `Failed to start MCP server: ${err.message}`,
          category: "network",
          cause: err
        }));
      });
      this.sendRequest(conn, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "symbia-integrations", version: "1.0.0" }
      }).then(() => {
        conn.isConnected = true;
        resolve();
      }).catch(reject);
    });
  }
  /**
   * Process incoming data buffer for complete messages
   */
  processBuffer(conn) {
    const lines = conn.buffer.split("\n");
    conn.buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (message.id !== void 0 && conn.pendingRequests.has(message.id)) {
          const pending = conn.pendingRequests.get(message.id);
          conn.pendingRequests.delete(message.id);
          clearTimeout(pending.timeout);
          if (message.error) {
            pending.reject(new IntegrationError({
              message: message.error.message,
              category: "provider",
              upstream: { code: String(message.error.code), message: message.error.message }
            }));
          } else {
            pending.resolve(message.result);
          }
        }
      } catch {
      }
    }
  }
  /**
   * Send a request to the MCP server
   */
  async sendRequest(conn, method, params) {
    if (conn.config.transport === "http" || conn.config.transport === "websocket") {
      return this.sendHttpRequest(conn, method, params);
    }
    return this.sendStdioRequest(conn, method, params);
  }
  /**
   * Send request over stdio
   */
  sendStdioRequest(conn, method, params) {
    return new Promise((resolve, reject) => {
      if (!conn.process?.stdin) {
        reject(new IntegrationError({
          message: "MCP connection not established",
          category: "network"
        }));
        return;
      }
      const id = ++conn.messageId;
      const timeoutMs = 3e4;
      const timeout = setTimeout(() => {
        conn.pendingRequests.delete(id);
        reject(new IntegrationError({
          message: `MCP request timed out: ${method}`,
          category: "timeout"
        }));
      }, timeoutMs);
      conn.pendingRequests.set(id, {
        resolve: (result) => resolve(result),
        reject,
        timeout
      });
      const message = {
        jsonrpc: "2.0",
        id,
        method,
        params
      };
      conn.process.stdin.write(JSON.stringify(message) + "\n");
    });
  }
  /**
   * Send request over HTTP
   */
  async sendHttpRequest(conn, method, params) {
    if (!conn.config.serverUrl) {
      throw new IntegrationError({
        message: "No server URL for HTTP MCP server",
        category: "validation"
      });
    }
    const response = await fetch(conn.config.serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params
      }),
      signal: AbortSignal.timeout(3e4)
    });
    if (!response.ok) {
      throw new IntegrationError({
        message: `MCP HTTP error: ${response.status} ${response.statusText}`,
        category: "provider",
        upstream: { statusCode: response.status }
      });
    }
    const result = await response.json();
    if (result.error) {
      throw new IntegrationError({
        message: result.error.message,
        category: "provider",
        upstream: { code: String(result.error.code), message: result.error.message }
      });
    }
    return result.result;
  }
  /**
   * Close a connection
   */
  close(serverKey) {
    const conn = this.connections.get(serverKey);
    if (conn?.process) {
      conn.process.kill();
    }
    this.connections.delete(serverKey);
  }
  /**
   * Cleanup idle connections
   */
  cleanup() {
    const now = Date.now();
    for (const [key, conn] of this.connections) {
      if (now - conn.lastUsed > this.maxIdleMs) {
        console.log(`[mcp] Closing idle connection: ${key}`);
        this.close(key);
      }
    }
  }
  /**
   * Shutdown all connections
   */
  shutdown() {
    clearInterval(this.cleanupInterval);
    for (const key of this.connections.keys()) {
      this.close(key);
    }
  }
};
var MCPExecutor = class {
  supportedTypes = ["mcp-tool", "mcp-resource", "mcp-prompt"];
  pool = new MCPConnectionPool();
  serverConfigs = /* @__PURE__ */ new Map();
  /**
   * Register an MCP server configuration
   */
  registerServer(serverKey, config2) {
    this.serverConfigs.set(serverKey, config2);
  }
  /**
   * Check if this executor can handle an operation type
   */
  canHandle(operationType) {
    return this.supportedTypes.includes(operationType);
  }
  /**
   * Execute an MCP operation
   */
  async execute(request) {
    const { operation, integrationKey, params, context } = request;
    const config2 = this.serverConfigs.get(integrationKey);
    if (!config2) {
      throw new IntegrationError({
        message: `MCP server not registered: ${integrationKey}`,
        category: "not_found"
      });
    }
    const conn = await this.pool.getConnection(integrationKey, config2);
    if (operation.mcpTool) {
      return this.executeTool(conn, operation.mcpTool.name, params);
    }
    if (operation.id.startsWith("resource.")) {
      const uri = params.uri;
      return this.readResource(conn, uri);
    }
    if (operation.id.startsWith("prompt.")) {
      const promptName = operation.id.replace("prompt.", "");
      return this.getPrompt(conn, promptName, params);
    }
    throw new IntegrationError({
      message: `Unknown MCP operation type: ${operation.id}`,
      category: "validation"
    });
  }
  /**
   * Execute an MCP tool
   */
  async executeTool(conn, toolName, params) {
    const result = await this.pool.sendRequest(
      conn,
      "tools/call",
      { name: toolName, arguments: params }
    );
    return {
      type: "mcp-tool",
      data: {
        content: result.content,
        isError: result.isError
      }
    };
  }
  /**
   * Read an MCP resource
   */
  async readResource(conn, uri) {
    const result = await this.pool.sendRequest(
      conn,
      "resources/read",
      { uri }
    );
    return {
      type: "mcp-resource",
      data: {
        contents: result.contents
      }
    };
  }
  /**
   * Get an MCP prompt
   */
  async getPrompt(conn, promptName, params) {
    const result = await this.pool.sendRequest(
      conn,
      "prompts/get",
      { name: promptName, arguments: params }
    );
    return {
      type: "mcp-prompt",
      data: {
        description: result.description,
        messages: result.messages
      }
    };
  }
  /**
   * Shutdown the executor
   */
  shutdown() {
    this.pool.shutdown();
  }
};
var mcpExecutor = new MCPExecutor();

// ../../integrations/server/src/internal-services.ts
import { ServiceId as ServiceId6, resolveServiceUrl as resolveServiceUrl5 } from "@symbia/sys";
var INTERNAL_SERVICES = [
  {
    serviceId: ServiceId6.IDENTITY,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Identity",
    description: "Authentication, users, organizations, and entitlements management",
    prefix: "identity",
    additionalTags: ["internal", "symbia"],
    // Exclude sensitive auth operations from MCP
    excludePatterns: [/password/i, /reset/i, /forgot/i]
  },
  {
    serviceId: ServiceId6.CATALOG,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Catalog",
    description: "Resource registry, namespaces, and metadata management",
    prefix: "catalog",
    additionalTags: ["internal", "symbia"]
  },
  {
    serviceId: ServiceId6.LOGGING,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Logging",
    description: "Structured logging, audit trails, and log queries",
    prefix: "logging",
    additionalTags: ["internal", "symbia"]
  },
  {
    serviceId: ServiceId6.ASSISTANTS,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Assistants",
    description: "AI assistant configuration, personas, and conversation management",
    prefix: "assistants",
    additionalTags: ["internal", "symbia"]
  },
  {
    serviceId: ServiceId6.MESSAGING,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Messaging",
    description: "Message channels, threads, and real-time communication",
    prefix: "messaging",
    additionalTags: ["internal", "symbia"]
  },
  {
    serviceId: ServiceId6.RUNTIME,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Runtime",
    description: "Component execution, workflows, and runtime management",
    prefix: "runtime",
    additionalTags: ["internal", "symbia"]
  },
  {
    serviceId: ServiceId6.NETWORK,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Network",
    description: "Network topology, connections, and service mesh",
    prefix: "network",
    additionalTags: ["internal", "symbia"]
  }
];
function isInternalService(integrationKey) {
  return INTERNAL_SERVICES.some(
    (s) => (s.prefix || s.serviceId) === integrationKey
  );
}

// ../../integrations/server/src/executors/internal-executor.ts
var InternalExecutor = class {
  supportedTypes = ["api-call"];
  canHandle(operationType) {
    return this.supportedTypes.includes(operationType);
  }
  /**
   * Check if this executor should handle the request
   * (only for internal Symbia services)
   */
  shouldHandle(integrationKey) {
    return isInternalService(integrationKey);
  }
  async execute(request) {
    const { operation, integrationKey, params, context } = request;
    const integration = integrationRegistry.get(integrationKey);
    if (!integration) {
      throw new IntegrationError({
        message: `Integration not found: ${integrationKey}`,
        category: "not_found"
      });
    }
    if (!isInternalService(integrationKey)) {
      throw new IntegrationError({
        message: `Not an internal service: ${integrationKey}`,
        category: "validation"
      });
    }
    const baseUrl = integration.openapi?.serverUrl;
    if (!baseUrl) {
      throw new IntegrationError({
        message: `No server URL configured for ${integrationKey}`,
        category: "internal"
      });
    }
    const url = this.buildUrl(baseUrl, operation.path || "", params);
    const headers = this.buildHeaders(context, params);
    const method = operation.method || "GET";
    const body = this.buildBody(method, operation, params);
    console.log(`[internal-executor] ${method} ${url}`);
    const controller = new AbortController();
    const timeout = context.timeout || 3e4;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : void 0,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const contentType = response.headers.get("content-type") || "";
      let responseBody;
      if (contentType.includes("application/json")) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      const result = {
        type: "api-call",
        data: {
          statusCode: response.status,
          headers: responseHeaders,
          body: responseBody
        }
      };
      if (!response.ok) {
        console.error(`[internal-executor] Error ${response.status}:`, responseBody);
      }
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new IntegrationError({
          message: `Request timed out after ${timeout}ms`,
          category: "timeout"
        });
      }
      throw new IntegrationError({
        message: error instanceof Error ? error.message : "Request failed",
        category: "network",
        cause: error instanceof Error ? error : void 0
      });
    }
  }
  /**
   * Build the full URL with path parameters substituted
   */
  buildUrl(baseUrl, path, params) {
    const normalizedBase = baseUrl.replace(/\/$/, "");
    let url = `${normalizedBase}${path}`;
    const pathParamMatches = path.match(/\{(\w+)\}/g);
    if (pathParamMatches) {
      for (const match of pathParamMatches) {
        const paramName = match.slice(1, -1);
        if (params[paramName] !== void 0) {
          url = url.replace(match, encodeURIComponent(String(params[paramName])));
          delete params[paramName];
        }
      }
    }
    return url;
  }
  /**
   * Build request headers with authentication and org context
   */
  buildHeaders(context, params) {
    const headers = {
      "Content-Type": "application/json"
    };
    if (context.authToken) {
      headers["Authorization"] = `Bearer ${context.authToken}`;
    }
    if (context.orgId) {
      headers["X-Org-Id"] = context.orgId;
    }
    if (context.requestId) {
      headers["X-Request-Id"] = context.requestId;
    }
    return headers;
  }
  /**
   * Build request body from parameters
   */
  buildBody(method, operation, params) {
    if (method === "GET" || method === "HEAD") {
      return void 0;
    }
    if (method === "DELETE") {
      const body2 = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== void 0) {
          body2[key] = value;
        }
      }
      return Object.keys(body2).length > 0 ? body2 : void 0;
    }
    const body = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== void 0) {
        body[key] = value;
      }
    }
    return Object.keys(body).length > 0 ? body : void 0;
  }
};
var internalExecutor = new InternalExecutor();

// ../../integrations/server/src/executors/openapi-executor.ts
var OpenAPIExecutor = class {
  supportedTypes = ["api-call"];
  canHandle(operationType) {
    return this.supportedTypes.includes(operationType);
  }
  async execute(request) {
    const { operation, integrationKey, params, context } = request;
    const integration = integrationRegistry.get(integrationKey);
    if (!integration) {
      throw new IntegrationError({
        message: `Integration not found: ${integrationKey}`,
        category: "not_found"
      });
    }
    const credential = await getCredential(
      context.userId,
      context.orgId,
      integrationKey,
      context.authToken
    );
    if (!credential?.apiKey) {
      throw new IntegrationError({
        message: `No credentials configured for ${integrationKey}`,
        category: "auth"
      });
    }
    const baseUrl = this.getBaseUrl(integration, credential.apiKey);
    const url = this.buildUrl(baseUrl, operation.path || "", params);
    const headers = this.buildHeaders(integration, credential.apiKey, params);
    const method = operation.method || "GET";
    const body = this.buildBody(method, operation, params);
    console.log(`[openapi-executor] ${method} ${url}`);
    const controller = new AbortController();
    const timeout = context.timeout || 3e4;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : void 0,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const contentType = response.headers.get("content-type") || "";
      let responseBody;
      if (contentType.includes("application/json")) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      const result = {
        type: "api-call",
        data: {
          statusCode: response.status,
          headers: responseHeaders,
          body: responseBody
        }
      };
      if (!response.ok) {
        console.error(`[openapi-executor] Error ${response.status}:`, responseBody);
      }
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new IntegrationError({
          message: `Request timed out after ${timeout}ms`,
          category: "timeout"
        });
      }
      throw new IntegrationError({
        message: error instanceof Error ? error.message : "Request failed",
        category: "network",
        cause: error instanceof Error ? error : void 0
      });
    }
  }
  /**
   * Get base URL, substituting token if needed (e.g., Telegram uses bot{token})
   */
  getBaseUrl(integration, apiKey) {
    let baseUrl = integration.openapi?.serverUrl || "";
    if (baseUrl.includes("{token}")) {
      baseUrl = baseUrl.replace("{token}", apiKey);
    }
    if (!baseUrl && integration.metadata?.serverUrl) {
      baseUrl = integration.metadata.serverUrl.replace("{token}", apiKey);
    }
    return baseUrl.replace(/\/$/, "");
  }
  /**
   * Build the full URL with path parameters substituted
   */
  buildUrl(baseUrl, path, params) {
    let url = `${baseUrl}${path}`;
    const pathParamMatches = path.match(/\{(\w+)\}/g);
    if (pathParamMatches) {
      for (const match of pathParamMatches) {
        const paramName = match.slice(1, -1);
        if (params[paramName] !== void 0) {
          url = url.replace(match, String(params[paramName]));
        }
      }
    }
    const queryParams = new URLSearchParams();
    return url;
  }
  /**
   * Build request headers with authentication
   */
  buildHeaders(integration, apiKey, params) {
    const headers = {
      "Content-Type": "application/json"
    };
    const authType = integration.auth?.type || integration.metadata?.authType;
    switch (authType) {
      case "bearer":
        headers["Authorization"] = `Bearer ${apiKey}`;
        break;
      case "header":
      case "apiKey":
        const headerName = integration.auth?.header || integration.metadata?.authHeader || "X-API-Key";
        headers[headerName] = apiKey;
        break;
      case "path":
        break;
      case "none":
        break;
    }
    return headers;
  }
  /**
   * Build request body from parameters
   */
  buildBody(method, operation, params) {
    if (method === "GET" || method === "HEAD" || method === "DELETE") {
      return void 0;
    }
    const body = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== void 0) {
        body[key] = value;
      }
    }
    return Object.keys(body).length > 0 ? body : void 0;
  }
};
var openapiExecutor = new OpenAPIExecutor();

// ../../integrations/server/src/executors/index.ts
var APICallExecutor = class {
  supportedTypes = ["api-call"];
  canHandle(operationType) {
    return this.supportedTypes.includes(operationType);
  }
  async execute(request) {
    if (isInternalService(request.integrationKey)) {
      return internalExecutor.execute(request);
    } else {
      return openapiExecutor.execute(request);
    }
  }
};
var apiCallExecutor = new APICallExecutor();
var executorRegistry = /* @__PURE__ */ new Map([
  ["llm", providerExecutor],
  ["embedding", providerExecutor],
  ["mcp-tool", mcpExecutor],
  ["mcp-resource", mcpExecutor],
  ["mcp-prompt", mcpExecutor],
  ["api-call", apiCallExecutor]
]);
async function executeOperation(request) {
  const opType = classifyOperation(request.operation);
  const executor = executorRegistry.get(opType);
  if (!executor) {
    throw new IntegrationError({
      message: `No executor registered for operation type: ${opType}`,
      category: "not_found"
    });
  }
  return executor.execute(request);
}

// ../../integrations/server/src/mcp-server.ts
var MCP_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603
};
var DEFAULT_CONFIG2 = {
  name: "symbia-integrations",
  version: "1.0.0",
  capabilities: {
    tools: true,
    resources: false,
    prompts: false
  }
};
var MCPServer = class {
  config;
  initialized = false;
  constructor(config2 = {}) {
    this.config = { ...DEFAULT_CONFIG2, ...config2 };
  }
  /**
   * Handle an incoming MCP request
   */
  async handleRequest(request, context) {
    try {
      const result = await this.dispatch(request.method, request.params, context);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: this.formatError(error)
      };
    }
  }
  /**
   * Dispatch request to appropriate handler
   */
  async dispatch(method, params, context) {
    switch (method) {
      case "initialize":
        return this.handleInitialize(params);
      case "initialized":
        return null;
      case "tools/list":
        return this.handleToolsList();
      case "tools/call":
        return this.handleToolsCall(params, context);
      case "resources/list":
        return this.handleResourcesList();
      case "resources/read":
        return this.handleResourcesRead(params);
      case "prompts/list":
        return this.handlePromptsList();
      case "prompts/get":
        return this.handlePromptsGet(params);
      case "ping":
        return {};
      default:
        throw { code: MCP_ERROR.METHOD_NOT_FOUND, message: `Unknown method: ${method}` };
    }
  }
  /**
   * Handle initialize request
   */
  handleInitialize(params) {
    this.initialized = true;
    const capabilities = {};
    if (this.config.capabilities.tools) {
      capabilities.tools = {};
    }
    if (this.config.capabilities.resources) {
      capabilities.resources = {};
    }
    if (this.config.capabilities.prompts) {
      capabilities.prompts = {};
    }
    return {
      protocolVersion: "2024-11-05",
      capabilities,
      serverInfo: {
        name: this.config.name,
        version: this.config.version
      }
    };
  }
  /**
   * List available tools (integrations exposed as MCP tools)
   */
  handleToolsList() {
    const tools = [];
    const integrations2 = integrationRegistry.getAll();
    for (const integration of integrations2) {
      for (const op of integration.operations || []) {
        if (op.method === "GET" && !op.tags?.includes("llm")) {
          continue;
        }
        tools.push(this.operationToMCPTool(integration.key, op));
      }
    }
    return { tools };
  }
  /**
   * Convert an IntegrationOperation to an MCP tool definition
   */
  operationToMCPTool(integrationKey, op) {
    const toolName = `${integrationKey}.${op.id}`.replace(/\./g, "_");
    const properties = {};
    const required = [];
    for (const param of op.parameters || []) {
      if (!param.name) continue;
      properties[param.name] = {
        type: param.schema?.type || "string",
        description: param.description
      };
      if (param.required) {
        required.push(param.name);
      }
    }
    if (op.requestBody?.schema) {
      const bodySchema = op.requestBody.schema;
      const bodyProps = bodySchema.properties;
      if (bodyProps) {
        for (const [key, value] of Object.entries(bodyProps)) {
          if (!properties[key]) {
            properties[key] = {
              type: value.type || "string",
              description: value.description
            };
          }
        }
      }
      const bodyRequired = bodySchema.required;
      if (bodyRequired) {
        for (const field of bodyRequired) {
          if (!required.includes(field)) {
            required.push(field);
          }
        }
      }
    }
    if (op.tags?.includes("llm") || op.tags?.includes("chat")) {
      if (!properties.model) {
        properties.model = { type: "string", description: "Model ID to use" };
        required.push("model");
      }
    }
    return {
      name: toolName,
      description: op.description || op.summary || `Execute ${integrationKey} ${op.id}`,
      inputSchema: {
        type: "object",
        properties,
        required: required.length > 0 ? required : void 0
      }
    };
  }
  /**
   * Handle tool call
   */
  async handleToolsCall(params, context) {
    const { name, arguments: args } = params;
    const parts = name.split("_");
    const integrationKey = parts[0];
    const operationId = parts.slice(1).join(".");
    const lookup = integrationRegistry.lookupOperation(`${integrationKey}.${operationId}`);
    if (!lookup) {
      return {
        content: [{ type: "text", text: `Tool not found: ${name}` }],
        isError: true
      };
    }
    const execContext = {
      requestId: `mcp_${Date.now()}`,
      userId: context.userId || "mcp-client",
      orgId: context.orgId || "mcp-org",
      authToken: context.authToken || "",
      timeout: 6e4
    };
    try {
      const result = await executeOperation({
        operation: lookup.operation,
        integrationKey,
        params: args || {},
        context: execContext
      });
      return this.formatToolResult(result);
    } catch (error) {
      const message = error instanceof IntegrationError ? error.message : error instanceof Error ? error.message : "Tool execution failed";
      return {
        content: [{ type: "text", text: message }],
        isError: true
      };
    }
  }
  /**
   * Format execution result as MCP content
   */
  formatToolResult(result) {
    const typed = result;
    switch (typed.type) {
      case "llm": {
        const llm = typed.data;
        return {
          content: [
            { type: "text", text: llm.content }
          ]
        };
      }
      case "embedding": {
        const emb = typed.data;
        return {
          content: [
            { type: "text", text: JSON.stringify({ embeddings: emb.embeddings }) }
          ]
        };
      }
      case "mcp-tool": {
        const mcp = typed.data;
        return { content: mcp.content };
      }
      case "moltbot-skill": {
        const skill = typed.data;
        return {
          content: [
            { type: "text", text: JSON.stringify(skill.result) }
          ]
        };
      }
      default:
        return {
          content: [
            { type: "text", text: JSON.stringify(typed.data) }
          ]
        };
    }
  }
  /**
   * List resources (not currently exposed)
   */
  handleResourcesList() {
    return { resources: [] };
  }
  /**
   * Read a resource
   */
  handleResourcesRead(_params) {
    throw { code: MCP_ERROR.METHOD_NOT_FOUND, message: "Resources not supported" };
  }
  /**
   * List prompts (not currently exposed)
   */
  handlePromptsList() {
    return { prompts: [] };
  }
  /**
   * Get a prompt
   */
  handlePromptsGet(_params) {
    throw { code: MCP_ERROR.METHOD_NOT_FOUND, message: "Prompts not supported" };
  }
  /**
   * Format error for MCP response
   */
  formatError(error) {
    if (error && typeof error === "object" && "code" in error && "message" in error) {
      return error;
    }
    if (error instanceof IntegrationError) {
      return {
        code: MCP_ERROR.INTERNAL_ERROR,
        message: error.message,
        data: { category: error.category, retryable: error.retryable }
      };
    }
    return {
      code: MCP_ERROR.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : "Unknown error"
    };
  }
};
var mcpServer = new MCPServer();
function createMCPHttpHandler() {
  return async (req, res) => {
    try {
      const request = req.body;
      if (!request || !request.jsonrpc || !request.method) {
        res.status(400).json({
          jsonrpc: "2.0",
          id: null,
          error: { code: MCP_ERROR.INVALID_REQUEST, message: "Invalid request" }
        });
        return;
      }
      const user = req.user || {};
      const response = await mcpServer.handleRequest(request, {
        userId: user.id,
        orgId: user.orgId,
        authToken: req.token
      });
      res.json(response);
    } catch (error) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: MCP_ERROR.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Internal error"
        }
      });
    }
  };
}

// ../../integrations/server/src/oauth/oauth-service.ts
import crypto from "crypto";
import { resolveServiceUrl as resolveServiceUrl6, ServiceId as ServiceId7 } from "@symbia/sys";

// ../../integrations/server/src/oauth/providers/base.ts
var BaseOAuthProvider = class {
  /**
   * Build the authorization URL with standard OAuth 2.0 parameters
   */
  buildAuthorizationUrl(params) {
    const url = new URL(this.config.authorizationUrl);
    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("response_type", this.config.responseType);
    url.searchParams.set("state", params.state);
    url.searchParams.set("scope", params.scopes.join(this.config.scopeDelimiter));
    if (params.codeChallenge) {
      url.searchParams.set("code_challenge", params.codeChallenge);
      url.searchParams.set("code_challenge_method", params.codeChallengeMethod || "S256");
    }
    return url.toString();
  }
  /**
   * Exchange authorization code for tokens using standard OAuth 2.0 token endpoint
   */
  async exchangeCode(params) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri
    });
    if (params.codeVerifier) {
      body.set("code_verifier", params.codeVerifier);
    }
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: body.toString()
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new OAuthError(
        `Token exchange failed: ${response.status} ${response.statusText}`,
        "token_exchange_failed",
        errorText
      );
    }
    const data = await response.json();
    return this.normalizeTokenResponse(data);
  }
  /**
   * Refresh access token using standard OAuth 2.0 refresh flow
   */
  async refreshToken(params) {
    if (!this.config.supportsRefresh) {
      throw new OAuthError(
        "This provider does not support token refresh",
        "refresh_not_supported"
      );
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret
    });
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: body.toString()
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new OAuthError(
        `Token refresh failed: ${response.status} ${response.statusText}`,
        "token_refresh_failed",
        errorText
      );
    }
    const data = await response.json();
    return this.normalizeTokenResponse(data);
  }
  /**
   * Get user info - must be implemented by subclasses if userinfoUrl is set
   */
  async getUserInfo(accessToken) {
    if (!this.config.userinfoUrl) {
      throw new OAuthError(
        "This provider does not support user info endpoint",
        "userinfo_not_supported"
      );
    }
    const response = await fetch(this.config.userinfoUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json"
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new OAuthError(
        `User info request failed: ${response.status} ${response.statusText}`,
        "userinfo_failed",
        errorText
      );
    }
    const data = await response.json();
    return this.normalizeUserInfo(data);
  }
  /**
   * Revoke a token - default implementation using RFC 7009
   */
  async revokeToken(params) {
    if (!this.config.revokeUrl) {
      throw new OAuthError(
        "This provider does not support token revocation",
        "revoke_not_supported"
      );
    }
    const body = new URLSearchParams({
      token: params.token,
      client_id: params.clientId,
      client_secret: params.clientSecret
    });
    if (params.tokenTypeHint) {
      body.set("token_type_hint", params.tokenTypeHint);
    }
    const response = await fetch(this.config.revokeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
    if (!response.ok && response.status !== 200) {
      const errorText = await response.text();
      throw new OAuthError(
        `Token revocation failed: ${response.status} ${response.statusText}`,
        "revoke_failed",
        errorText
      );
    }
  }
  /**
   * Normalize token response from provider-specific format to standard format
   * Override in subclasses if provider uses non-standard response format
   */
  normalizeTokenResponse(data) {
    return {
      accessToken: String(data.access_token || data.accessToken || ""),
      refreshToken: data.refresh_token || data.refreshToken ? String(data.refresh_token || data.refreshToken) : void 0,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : typeof data.expiresIn === "number" ? data.expiresIn : this.config.tokenExpiresIn,
      tokenType: String(data.token_type || data.tokenType || "Bearer"),
      scope: data.scope ? String(data.scope) : void 0
    };
  }
  /**
   * Normalize user info response from provider-specific format
   * Override in subclasses for provider-specific user info formats
   */
  normalizeUserInfo(data) {
    return {
      id: String(data.id || data.sub || data.user_id || ""),
      email: data.email ? String(data.email) : void 0,
      name: data.name ? String(data.name) : void 0,
      username: data.username || data.login ? String(data.username || data.login) : void 0,
      avatarUrl: data.avatar_url || data.picture ? String(data.avatar_url || data.picture) : void 0
    };
  }
};
var OAuthError = class extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "OAuthError";
  }
};

// ../../integrations/server/src/oauth/providers/replit.ts
var replitConfig = {
  provider: "replit",
  displayName: "Replit",
  description: "Authenticate with your Replit account",
  // OAuth endpoints
  // Note: These are standard OAuth 2.0 endpoints. Replit may use different URLs.
  // Update these based on Replit's OAuth documentation.
  authorizationUrl: "https://replit.com/oauth2/authorize",
  tokenUrl: "https://replit.com/oauth2/token",
  userinfoUrl: "https://replit.com/api/v1/users/current",
  revokeUrl: "https://replit.com/oauth2/revoke",
  // OAuth settings
  defaultScopes: ["identity"],
  // Basic identity scope for authentication
  scopeDelimiter: " ",
  responseType: "code",
  grantType: "authorization_code",
  pkceRequired: false,
  // Token settings
  supportsRefresh: true,
  tokenExpiresIn: 3600
  // 1 hour default if not specified in response
};
var ReplitOAuthProvider = class extends BaseOAuthProvider {
  config = replitConfig;
  /**
   * Normalize Replit's user info response
   *
   * Replit's user object structure (may vary):
   * {
   *   id: number,
   *   username: string,
   *   email?: string,
   *   firstName?: string,
   *   lastName?: string,
   *   profileImage?: string,
   *   ...
   * }
   */
  normalizeUserInfo(data) {
    const id = data.id ? String(data.id) : "";
    const username = data.username ? String(data.username) : void 0;
    const email = data.email ? String(data.email) : void 0;
    let name;
    if (data.firstName || data.lastName) {
      const parts = [data.firstName, data.lastName].filter(Boolean);
      name = parts.join(" ");
    } else if (data.name) {
      name = String(data.name);
    } else if (username) {
      name = username;
    }
    let avatarUrl;
    if (data.profileImage) {
      avatarUrl = String(data.profileImage);
    } else if (data.avatar_url) {
      avatarUrl = String(data.avatar_url);
    } else if (data.image) {
      avatarUrl = String(data.image);
    }
    return {
      id,
      email,
      name,
      username,
      avatarUrl
    };
  }
  /**
   * Get Replit user info with custom handling
   */
  async getUserInfo(accessToken) {
    if (!this.config.userinfoUrl) {
      throw new OAuthError(
        "Replit user info URL not configured",
        "userinfo_not_configured"
      );
    }
    const response = await fetch(this.config.userinfoUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
        "User-Agent": "Symbia-Stack/1.0"
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new OAuthError(
        `Replit user info request failed: ${response.status} ${response.statusText}`,
        "userinfo_failed",
        errorText
      );
    }
    const data = await response.json();
    return this.normalizeUserInfo(data);
  }
};
var replitProvider = new ReplitOAuthProvider();

// ../../integrations/server/src/oauth/providers/index.ts
var providerRegistry2 = /* @__PURE__ */ new Map();
function registerOAuthProvider(provider) {
  const name = provider.config.provider.toLowerCase();
  if (providerRegistry2.has(name)) {
    console.warn(`[oauth] Provider "${name}" is being re-registered`);
  }
  providerRegistry2.set(name, provider);
}
function getOAuthProvider(name) {
  return providerRegistry2.get(name.toLowerCase());
}
function getOAuthProviderNames() {
  return Array.from(providerRegistry2.keys());
}
function initializeOAuthProviders() {
  registerOAuthProvider(replitProvider);
  console.log(`[oauth] Registered providers: ${getOAuthProviderNames().join(", ")}`);
}

// ../../integrations/server/src/oauth/oauth-service.ts
var IDENTITY_SERVICE_URL2 = resolveServiceUrl6(ServiceId7.IDENTITY);
var STATE_TTL_MS = 10 * 60 * 1e3;
var OAuthService = class {
  storage;
  constructor(storage) {
    this.storage = storage;
  }
  /**
   * Generate authorization URL for initiating OAuth flow
   */
  async authorize(request, userId, orgId) {
    const provider = getOAuthProvider(request.provider);
    if (!provider) {
      throw new OAuthError(
        `Unknown OAuth provider: ${request.provider}`,
        "unknown_provider"
      );
    }
    const providerConfig = await this.storage.getProviderConfig(request.provider);
    if (!providerConfig) {
      throw new OAuthError(
        `OAuth provider "${request.provider}" is not configured`,
        "provider_not_configured"
      );
    }
    if (!providerConfig.isEnabled) {
      throw new OAuthError(
        `OAuth provider "${request.provider}" is disabled`,
        "provider_disabled"
      );
    }
    const state = crypto.randomBytes(32).toString("hex");
    const callbackUrl = this.getCallbackUrl();
    const redirectUri = request.redirectUri || callbackUrl;
    const scopes = request.scopes?.length ? request.scopes : provider.config.defaultScopes;
    let pkceVerifier;
    let pkceChallenge;
    if (provider.config.pkceRequired) {
      pkceVerifier = crypto.randomBytes(32).toString("base64url");
      pkceChallenge = crypto.createHash("sha256").update(pkceVerifier).digest("base64url");
    }
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);
    await this.storage.createOAuthState({
      state,
      userId,
      orgId: orgId || void 0,
      provider: request.provider,
      redirectUri,
      scopes,
      pkceVerifier,
      pkceChallenge,
      clientState: request.state,
      expiresAt
    });
    const authorizationUrl = provider.buildAuthorizationUrl({
      clientId: providerConfig.clientId,
      redirectUri: callbackUrl,
      // Always use our callback URL
      state,
      scopes,
      codeChallenge: pkceChallenge,
      codeChallengeMethod: pkceChallenge ? "S256" : void 0
    });
    return {
      authorizationUrl,
      state,
      provider: request.provider
    };
  }
  /**
   * Handle OAuth callback - validate state, exchange code, store tokens
   */
  async handleCallback(code, state) {
    const oauthState = await this.storage.getOAuthState(state);
    if (!oauthState) {
      throw new OAuthError(
        "Invalid or expired OAuth state",
        "invalid_state"
      );
    }
    if (new Date(oauthState.expiresAt) < /* @__PURE__ */ new Date()) {
      await this.storage.deleteOAuthState(state);
      throw new OAuthError(
        "OAuth state has expired",
        "state_expired"
      );
    }
    const provider = getOAuthProvider(oauthState.provider);
    if (!provider) {
      throw new OAuthError(
        `Unknown OAuth provider: ${oauthState.provider}`,
        "unknown_provider"
      );
    }
    const providerConfig = await this.storage.getProviderConfig(oauthState.provider);
    if (!providerConfig) {
      throw new OAuthError(
        `OAuth provider not configured: ${oauthState.provider}`,
        "provider_not_configured"
      );
    }
    const callbackUrl = this.getCallbackUrl();
    const tokens = await provider.exchangeCode({
      code,
      clientId: providerConfig.clientId,
      clientSecret: providerConfig.clientSecret,
      redirectUri: callbackUrl,
      codeVerifier: oauthState.pkceVerifier || void 0
    });
    let userInfo = null;
    if (provider.getUserInfo) {
      try {
        userInfo = await provider.getUserInfo(tokens.accessToken);
      } catch (error) {
        console.warn(`[oauth] Failed to get user info from ${oauthState.provider}:`, error);
      }
    }
    const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1e3) : void 0;
    const credentialId = await this.storeTokenInIdentity(
      oauthState.userId,
      oauthState.orgId || null,
      oauthState.provider,
      tokens.accessToken,
      tokens.refreshToken,
      expiresAt,
      userInfo
    );
    const connection = await this.storage.createOAuthConnection({
      userId: oauthState.userId,
      orgId: oauthState.orgId,
      provider: oauthState.provider,
      oauthUserId: userInfo?.id,
      oauthUserEmail: userInfo?.email,
      oauthUserName: userInfo?.name || userInfo?.username,
      oauthAvatarUrl: userInfo?.avatarUrl,
      credentialId,
      scopes: oauthState.scopes || [],
      status: "active",
      expiresAt,
      connectedAt: /* @__PURE__ */ new Date()
    });
    await this.storage.deleteOAuthState(state);
    const connectionResponse = {
      id: connection.id,
      provider: connection.provider,
      displayName: providerConfig.displayName,
      connectedAt: connection.connectedAt.toISOString(),
      expiresAt: connection.expiresAt?.toISOString(),
      scopes: connection.scopes || [],
      status: connection.status,
      oauthUserId: connection.oauthUserId || void 0,
      oauthUserEmail: connection.oauthUserEmail || void 0,
      oauthUserName: connection.oauthUserName || void 0
    };
    return {
      connection: connectionResponse,
      redirectUri: oauthState.redirectUri,
      clientState: oauthState.clientState || void 0
    };
  }
  /**
   * Get list of OAuth connections for a user
   */
  async getConnections(userId, orgId) {
    const connections = await this.storage.getOAuthConnections(userId, orgId);
    return Promise.all(
      connections.map(async (conn) => {
        const providerConfig = await this.storage.getProviderConfig(conn.provider);
        return {
          id: conn.id,
          provider: conn.provider,
          displayName: providerConfig?.displayName || conn.provider,
          connectedAt: conn.connectedAt.toISOString(),
          expiresAt: conn.expiresAt?.toISOString(),
          scopes: conn.scopes || [],
          status: conn.status,
          oauthUserId: conn.oauthUserId || void 0,
          oauthUserEmail: conn.oauthUserEmail || void 0,
          oauthUserName: conn.oauthUserName || void 0
        };
      })
    );
  }
  /**
   * Revoke an OAuth connection
   */
  async revokeConnection(connectionId, userId) {
    const connection = await this.storage.getOAuthConnectionById(connectionId);
    if (!connection) {
      throw new OAuthError(
        "Connection not found",
        "connection_not_found"
      );
    }
    if (connection.userId !== userId) {
      throw new OAuthError(
        "Not authorized to revoke this connection",
        "not_authorized"
      );
    }
    const provider = getOAuthProvider(connection.provider);
    const providerConfig = await this.storage.getProviderConfig(connection.provider);
    if (provider?.revokeToken && providerConfig && connection.credentialId) {
      try {
        const credential = await this.getCredentialFromIdentity(connection.credentialId);
        if (credential?.apiKey) {
          await provider.revokeToken({
            token: credential.apiKey,
            clientId: providerConfig.clientId,
            clientSecret: providerConfig.clientSecret
          });
        }
      } catch (error) {
        console.warn(`[oauth] Failed to revoke token at provider:`, error);
      }
    }
    if (connection.credentialId) {
      await this.deleteCredentialFromIdentity(connection.credentialId, userId);
    }
    await this.storage.updateOAuthConnection(connectionId, {
      status: "revoked",
      revokedAt: /* @__PURE__ */ new Date()
    });
  }
  /**
   * Get available OAuth providers
   */
  async getAvailableProviders(userId) {
    const configs = await this.storage.getAllProviderConfigs();
    const connections = await this.storage.getOAuthConnections(userId, null);
    return configs.filter((config2) => config2.isEnabled).map((config2) => {
      const connection = connections.find(
        (c) => c.provider === config2.provider && c.status === "active"
      );
      return {
        provider: config2.provider,
        displayName: config2.displayName,
        description: config2.description || void 0,
        iconUrl: config2.iconUrl || void 0,
        connected: !!connection,
        connectionId: connection?.id
      };
    });
  }
  /**
   * Get callback URL for OAuth redirects
   */
  getCallbackUrl() {
    const baseUrl = process.env.OAUTH_CALLBACK_BASE_URL || process.env.INTEGRATIONS_SERVICE_URL || `http://localhost:${process.env.PORT || 5007}`;
    return `${baseUrl}/api/oauth/callback`;
  }
  /**
   * Store OAuth token in Identity service
   */
  async storeTokenInIdentity(userId, orgId, provider, accessToken, refreshToken, expiresAt, userInfo) {
    const url = `${IDENTITY_SERVICE_URL2}/api/internal/credentials/oauth`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Id": "integrations"
      },
      body: JSON.stringify({
        userId,
        orgId,
        provider,
        accessToken,
        refreshToken,
        expiresAt: expiresAt?.toISOString(),
        oauthUserId: userInfo?.id,
        oauthUserEmail: userInfo?.email,
        oauthUserName: userInfo?.name || userInfo?.username
      })
    });
    if (!response.ok) {
      const error = await response.text();
      throw new OAuthError(
        `Failed to store OAuth token: ${response.statusText}`,
        "token_storage_failed",
        error
      );
    }
    const result = await response.json();
    return result.credentialId;
  }
  /**
   * Get credential from Identity service by ID
   */
  async getCredentialFromIdentity(credentialId) {
    const url = `${IDENTITY_SERVICE_URL2}/api/internal/credentials/by-id/${credentialId}`;
    const response = await fetch(url, {
      headers: {
        "X-Service-Id": "integrations"
      }
    });
    if (!response.ok) {
      return null;
    }
    return response.json();
  }
  /**
   * Delete credential from Identity service
   */
  async deleteCredentialFromIdentity(credentialId, userId) {
    const url = `${IDENTITY_SERVICE_URL2}/api/internal/credentials/${credentialId}`;
    await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Service-Id": "integrations",
        "X-User-Id": userId
      }
    });
  }
};

// ../../integrations/server/src/oauth/storage.ts
init_schema();
import { eq as eq2, and as and2, desc as desc2 } from "drizzle-orm";
import crypto2 from "crypto";
var ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || process.env.SESSION_SECRET || "dev-encryption-key-change-in-production";
function decrypt(encryptedText) {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(":");
  const key = crypto2.createHash("sha256").update(ENCRYPTION_KEY).digest();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto2.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
function createOAuthStorage(db2) {
  return {
    // =======================================================================
    // Provider Configs
    // =======================================================================
    async getProviderConfig(provider) {
      const results = await db2.select().from(oauthProviderConfigs).where(eq2(oauthProviderConfigs.provider, provider)).limit(1);
      if (results.length === 0) {
        return getEnvProviderConfig(provider);
      }
      const config2 = results[0];
      return {
        provider: config2.provider,
        clientId: config2.clientId,
        clientSecret: decrypt(config2.clientSecretEncrypted),
        displayName: config2.displayName,
        description: config2.description || void 0,
        iconUrl: config2.iconUrl || void 0,
        isEnabled: config2.isEnabled
      };
    },
    async getAllProviderConfigs() {
      const results = await db2.select().from(oauthProviderConfigs).where(eq2(oauthProviderConfigs.isEnabled, true));
      const dbConfigs = results.map((config2) => ({
        provider: config2.provider,
        clientId: config2.clientId,
        clientSecret: decrypt(config2.clientSecretEncrypted),
        displayName: config2.displayName,
        description: config2.description || void 0,
        iconUrl: config2.iconUrl || void 0,
        isEnabled: config2.isEnabled
      }));
      const envConfigs = getEnvProviderConfigs();
      const configMap = /* @__PURE__ */ new Map();
      for (const config2 of envConfigs) {
        configMap.set(config2.provider, config2);
      }
      for (const config2 of dbConfigs) {
        configMap.set(config2.provider, config2);
      }
      return Array.from(configMap.values());
    },
    // =======================================================================
    // OAuth States
    // =======================================================================
    async createOAuthState(state) {
      const results = await db2.insert(oauthStates).values({
        ...state,
        scopes: state.scopes || []
      }).returning();
      return results[0];
    },
    async getOAuthState(state) {
      const results = await db2.select().from(oauthStates).where(eq2(oauthStates.state, state)).limit(1);
      return results.length > 0 ? results[0] : null;
    },
    async deleteOAuthState(state) {
      await db2.delete(oauthStates).where(eq2(oauthStates.state, state));
    },
    // =======================================================================
    // OAuth Connections
    // =======================================================================
    async createOAuthConnection(connection) {
      const results = await db2.insert(oauthConnections).values({
        ...connection,
        scopes: connection.scopes || []
      }).returning();
      return results[0];
    },
    async getOAuthConnectionById(id) {
      const results = await db2.select().from(oauthConnections).where(eq2(oauthConnections.id, id)).limit(1);
      return results.length > 0 ? results[0] : null;
    },
    async getOAuthConnections(userId, orgId) {
      const conditions = [eq2(oauthConnections.userId, userId)];
      if (orgId) {
        conditions.push(eq2(oauthConnections.orgId, orgId));
      }
      const results = await db2.select().from(oauthConnections).where(and2(...conditions)).orderBy(desc2(oauthConnections.connectedAt));
      return results;
    },
    async updateOAuthConnection(id, update) {
      await db2.update(oauthConnections).set({
        ...update,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq2(oauthConnections.id, id));
    }
  };
}
function getEnvProviderConfig(provider) {
  const upperProvider = provider.toUpperCase();
  const clientId = process.env[`OAUTH_${upperProvider}_CLIENT_ID`] || process.env[`${upperProvider}_CLIENT_ID`];
  const clientSecret = process.env[`OAUTH_${upperProvider}_CLIENT_SECRET`] || process.env[`${upperProvider}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) {
    return null;
  }
  const displayNames = {
    replit: "Replit",
    github: "GitHub",
    google: "Google",
    microsoft: "Microsoft"
  };
  return {
    provider,
    clientId,
    clientSecret,
    displayName: displayNames[provider.toLowerCase()] || provider,
    isEnabled: true
  };
}
function getEnvProviderConfigs() {
  const configs = [];
  const knownProviders = ["replit", "github", "google", "microsoft"];
  for (const provider of knownProviders) {
    const config2 = getEnvProviderConfig(provider);
    if (config2) {
      configs.push(config2);
    }
  }
  return configs.filter((c) => c !== null);
}

// ../../integrations/server/src/routes.ts
init_schema();
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var docsDir = process.env.NODE_ENV === "production" ? join(process.cwd(), "docs") : join(__dirname, "../..", "docs");
function getParam2(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
async function registerRoutes(httpServer, app) {
  initializeProviders();
  app.use(securityHeadersMiddleware);
  app.use(bodySizeLimitMiddleware);
  app.use(observabilityMiddleware({
    excludePaths: ["/health", "/health/live", "/health/ready", "/favicon.ico"],
    excludePatterns: [/^\/api\/integrations\/mcp/],
    // MCP has its own observability
    slowRequestThresholdMs: 5e3,
    traceIdHeader: "x-trace-id"
  }));
  app.post("/api/integrations/download", authMiddleware, rateLimitMiddleware, async (req, res) => {
    const user = req.user;
    const token = req.token;
    const downloadSchema = z3.object({
      provider: z3.literal("huggingface"),
      repo: z3.string().regex(/^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/),
      file: z3.string().regex(/^[A-Za-z0-9][\w.-]*\.gguf$/),
      revision: z3.string().regex(/^[\w.-]+$/).default("main")
    });
    const parsed = downloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: "provider (huggingface), repo, and a plain .gguf file name required" });
    }
    const { repo, file, revision } = parsed.data;
    const url = `https://huggingface.co/${repo}/resolve/${revision}/${file}`;
    try {
      let apiKey;
      try {
        const credential = await getCredential(user.id, user.orgId, "huggingface", token);
        apiKey = credential?.apiKey;
      } catch {
        apiKey = void 0;
      }
      const upstream = await safeFetch(url, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : void 0
      });
      if (!upstream.ok || !upstream.body) {
        return res.status(502).json({ success: false, error: `upstream returned ${upstream.status}` });
      }
      res.status(200);
      res.setHeader("Content-Type", "application/octet-stream");
      const len = upstream.headers.get("content-length");
      if (len) res.setHeader("Content-Length", len);
      res.setHeader("X-Source-Url", upstream.url || url);
      const { Readable } = await import("node:stream");
      const { pipeline } = await import("node:stream/promises");
      await pipeline(Readable.fromWeb(upstream.body), res);
      return;
    } catch (error) {
      if (error instanceof EgressError) {
        return res.status(403).json({ success: false, error: `egress refused: ${error.message}` });
      }
      if (!res.headersSent) {
        return res.status(500).json({ success: false, error: error instanceof Error ? error.message : "download failed" });
      }
      res.destroy(error instanceof Error ? error : new Error("download failed"));
      return;
    }
  });
  app.post("/api/integrations/execute", authMiddleware, rateLimitMiddleware, async (req, res) => {
    const startTime = Date.now();
    const requestId = `req_${randomUUID().slice(0, 12)}`;
    const user = req.user;
    const token = req.token;
    try {
      const parseResult = executeRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        const validationError = new IntegrationError({
          message: `Invalid request: ${parseResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
          category: "validation"
        });
        res.status(validationError.statusCode).json({
          ...validationError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      const request = parseResult.data;
      const { provider, operation, params } = request;
      const adapter = getProvider(provider);
      if (!adapter) {
        const notFoundError = new IntegrationError({
          message: `Unknown provider: ${provider}. Available: ${getRegisteredProviders().join(", ")}`,
          category: "not_found",
          provider,
          retryable: false
        });
        res.status(notFoundError.statusCode).json({
          ...notFoundError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      const validation = adapter.validateParams(operation, params);
      if (!validation.valid) {
        const validationError = new IntegrationError({
          message: `Invalid params: ${validation.errors?.join(", ")}`,
          category: "validation",
          provider,
          operation,
          retryable: false
        });
        res.status(validationError.statusCode).json({
          ...validationError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      const isLocalProvider = provider === "symbia-labs";
      const credential = isLocalProvider ? null : await getCredential(user.id, user.orgId, provider, token);
      if (!isLocalProvider && !credential) {
        const authError = new IntegrationError({
          message: `No ${provider} API key configured. Add your API key in Settings.`,
          category: "auth",
          provider,
          operation,
          retryable: false
        });
        res.status(authError.statusCode).json({
          ...authError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      const circuitCheck = circuitBreaker.canRequest(provider);
      if (!circuitCheck.allowed) {
        const circuitError = new IntegrationError({
          message: circuitCheck.reason || `Provider ${provider} is temporarily unavailable`,
          category: "provider",
          provider,
          operation,
          retryable: true
          // Will be retryable after circuit resets
        });
        res.status(503).json({
          ...circuitError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      let data;
      try {
        const executeOptions = {
          operation,
          model: params.model,
          params,
          apiKey: credential?.apiKey || "",
          timeout: 6e4
          // 60 second timeout
        };
        const executeWithObservability = async () => {
          if (operation === "embeddings" && adapter.embed) {
            return await adapter.embed(executeOptions);
          } else {
            return await adapter.execute(executeOptions);
          }
        };
        data = await withProviderObservability(
          provider,
          operation,
          requestId,
          executeWithObservability
        );
        const durationMs = Date.now() - startTime;
        recordProviderRequest(provider, operation, durationMs, true, data.usage);
        circuitBreaker.recordSuccess(provider);
      } catch (execError) {
        const durationMs = Date.now() - startTime;
        recordProviderRequest(provider, operation, durationMs, false);
        circuitBreaker.recordFailure(provider);
        const classified = classifyProviderError(execError, provider, operation);
        await logExecution({
          userId: user.id,
          orgId: user.orgId,
          provider,
          operation,
          model: params.model,
          requestId,
          startedAt: new Date(startTime),
          completedAt: /* @__PURE__ */ new Date(),
          durationMs: Date.now() - startTime,
          success: false,
          errorMessage: classified.message,
          metadata: {
            errorCategory: classified.category,
            retryable: classified.retryable,
            upstream: classified.upstream
          }
        });
        const response2 = {
          success: false,
          error: classified.message,
          requestId,
          durationMs: Date.now() - startTime,
          // Extended error info for callers (especially assistants graph engine)
          errorCategory: classified.category,
          retryable: classified.retryable
        };
        res.status(classified.statusCode).json(response2);
        return;
      }
      const isEmbeddingResponse = operation === "embeddings";
      await logExecution({
        userId: user.id,
        orgId: user.orgId,
        provider,
        operation,
        model: data.model,
        requestId,
        startedAt: new Date(startTime),
        completedAt: /* @__PURE__ */ new Date(),
        durationMs: Date.now() - startTime,
        success: true,
        promptTokens: data.usage.promptTokens,
        completionTokens: isEmbeddingResponse ? 0 : data.usage.completionTokens,
        totalTokens: data.usage.totalTokens
      });
      const response = {
        success: true,
        data,
        requestId,
        durationMs: Date.now() - startTime
      };
      res.json(response);
    } catch (error) {
      console.error("[integrations] Unexpected error:", error);
      const internalError = error instanceof IntegrationError ? error : new IntegrationError({
        message: "Internal server error",
        category: "internal",
        cause: error instanceof Error ? error : void 0
      });
      res.status(internalError.statusCode).json({
        ...internalError.toResponse(),
        requestId,
        durationMs: Date.now() - startTime
      });
    }
  });
  app.get("/api/integrations/providers", async (req, res) => {
    const configs = getAllProviderConfigs();
    res.json({
      providers: configs.map((c) => ({
        name: c.provider,
        baseUrl: c.baseUrl,
        defaultModel: c.defaultModel,
        supportedOperations: c.supportedOperations
      }))
    });
  });
  app.get("/api/integrations/providers/:provider", async (req, res) => {
    const provider = getParam2(req.params, "provider");
    const config2 = getProviderConfig(provider);
    if (!config2) {
      res.status(404).json({ error: `Provider not found: ${provider}` });
      return;
    }
    res.json(config2);
  });
  app.get("/api/integrations/providers/:provider/models", authMiddleware, async (req, res) => {
    const provider = getParam2(req.params, "provider");
    const { capability } = req.query;
    const user = req.user;
    const token = req.token;
    let apiKey;
    try {
      const credential = await getCredential(user.id, user.orgId, provider, token);
      apiKey = credential?.apiKey;
    } catch {
    }
    let models = await getModelsForProvider(provider, apiKey);
    if (capability && typeof capability === "string") {
      const capabilities = capability.split(",").map((c) => c.trim().toLowerCase());
      models = models.filter(
        (m) => m.capabilities?.some((c) => capabilities.includes(c.toLowerCase()))
      );
    }
    res.json({ models });
  });
  app.get("/api/integrations/models", authMiddleware, async (req, res) => {
    const { capability, purpose } = req.query;
    const user = req.user;
    const token = req.token;
    let filterCapabilities = [];
    if (capability && typeof capability === "string") {
      filterCapabilities = capability.split(",").map((c) => c.trim().toLowerCase());
    } else if (purpose && typeof purpose === "string") {
      switch (purpose.toLowerCase()) {
        case "chat":
        case "llm":
          filterCapabilities = ["chat", "reasoning"];
          break;
        case "embedding":
        case "embeddings":
          filterCapabilities = ["embedding"];
          break;
        case "vision":
          filterCapabilities = ["vision"];
          break;
      }
    }
    const providers = getRegisteredProviders();
    const result = {};
    for (const provider of providers) {
      let apiKey;
      try {
        const credential = await getCredential(user.id, user.orgId, provider, token);
        apiKey = credential?.apiKey;
      } catch {
      }
      let models = await getModelsForProvider(provider, apiKey);
      if (filterCapabilities.length > 0) {
        models = models.filter(
          (m) => m.capabilities?.some((c) => filterCapabilities.includes(c.toLowerCase()))
        );
      }
      if (models.length > 0) {
        result[provider] = models.map((m) => ({
          ...m,
          provider
          // Include provider for convenience
        }));
      }
    }
    res.json({
      models: result,
      // Flatten for convenience
      all: Object.entries(result).flatMap(
        ([provider, models]) => models.map((m) => ({ ...m, provider }))
      )
    });
  });
  initializeBuiltinIntegrations();
  app.post("/api/integrations/register", authMiddleware, async (req, res) => {
    const integration = req.body;
    if (!integration.key || !integration.type) {
      res.status(400).json({ error: "Integration key and type are required" });
      return;
    }
    const result = await integrationRegistry.register(integration);
    if (result.success) {
      res.json({
        success: true,
        integration: integrationRegistry.get(integration.key),
        operationCount: result.operationCount
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  });
  app.get("/api/integrations/registry", authMiddleware, async (_req, res) => {
    const integrations2 = integrationRegistry.getAll();
    res.json({ integrations: integrations2 });
  });
  app.get("/api/integrations/registry/:key", authMiddleware, async (req, res) => {
    const key = getParam2(req.params, "key");
    const integration = integrationRegistry.get(key);
    if (!integration) {
      res.status(404).json({ error: `Integration not found: ${key}` });
      return;
    }
    res.json({ integration });
  });
  app.get("/api/integrations/registry/:key/operations", authMiddleware, async (req, res) => {
    const key = getParam2(req.params, "key");
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
  app.get("/api/integrations/namespace", authMiddleware, async (_req, res) => {
    const namespace = integrationRegistry.getFullNamespace();
    res.json(namespace);
  });
  app.get("/api/integrations/operations/search", authMiddleware, async (req, res) => {
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
  app.post("/api/integrations/invoke", authMiddleware, rateLimitMiddleware, async (req, res) => {
    const startTime = Date.now();
    const requestId = `inv_${randomUUID().slice(0, 12)}`;
    const user = req.user;
    const token = req.token;
    try {
      const request = req.body;
      if (!request.operation) {
        res.status(400).json({
          success: false,
          error: "Operation path is required",
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      const lookup = integrationRegistry.lookupOperation(request.operation);
      if (!lookup) {
        res.status(404).json({
          success: false,
          error: `Operation not found: ${request.operation}`,
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      const { integration, operation } = lookup;
      if (integration.type === "builtin" && ["openai", "anthropic", "google", "mistral", "cohere", "huggingface"].includes(integration.key)) {
        const provider = getProvider(integration.key);
        if (!provider) {
          res.status(500).json({
            success: false,
            error: `Provider not found: ${integration.key}`,
            requestId,
            durationMs: Date.now() - startTime
          });
          return;
        }
        const credential = await getCredential(user.id, user.orgId, integration.key, token);
        if (!credential) {
          res.status(400).json({
            success: false,
            error: `No ${integration.key} API key configured`,
            requestId,
            durationMs: Date.now() - startTime
          });
          return;
        }
        let opType = "chat.completions";
        if (operation.id.includes("embed")) {
          opType = "embeddings";
        } else if (operation.id.includes("messages")) {
          opType = "messages";
        }
        const body = request.body || {};
        const executeOptions = {
          operation: opType,
          model: body.model || "",
          params: body,
          apiKey: credential.apiKey,
          timeout: request.timeout || 6e4
        };
        const data = opType === "embeddings" && provider.embed ? await provider.embed(executeOptions) : await provider.execute(executeOptions);
        const durationMs = Date.now() - startTime;
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
          outputTokens: "completionTokens" in data.usage ? data.usage.completionTokens : void 0,
          totalTokens: data.usage?.totalTokens
        });
        res.json({
          success: true,
          data,
          requestId,
          durationMs,
          operation: request.operation,
          integration: integration.key
        });
        return;
      }
      if (integration.type === "openapi" && operation.method && operation.path) {
        let serverUrl = integration.openapi?.serverUrl;
        if (!serverUrl && integration.openapi?.spec) {
          const spec = integration.openapi.spec;
          serverUrl = spec.servers?.[0]?.url;
        }
        if (!serverUrl) {
          res.status(500).json({
            success: false,
            error: "No server URL configured for integration",
            requestId,
            durationMs: Date.now() - startTime
          });
          return;
        }
        let url = `${serverUrl}${operation.path}`;
        const params = request.params || {};
        for (const [key, value] of Object.entries(params)) {
          url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
        }
        const queryParams = operation.parameters?.filter((p) => p.location === "query") || [];
        const queryString = queryParams.filter((p) => params[p.name] !== void 0).map((p) => `${p.name}=${encodeURIComponent(String(params[p.name]))}`).join("&");
        if (queryString) {
          url += `?${queryString}`;
        }
        let authHeaders = {};
        let credential = null;
        if (integration.auth && integration.auth.type !== "none") {
          credential = await getCredential(user.id, user.orgId, integration.key, token);
          if (credential?.apiKey) {
            if (integration.auth.type === "bearer") {
              authHeaders["Authorization"] = `Bearer ${credential.apiKey}`;
            } else if (integration.auth.type === "apiKey") {
              const header = integration.auth.header || "X-API-Key";
              authHeaders[header] = credential.apiKey;
            }
          }
        }
        const response = await fetch(url, {
          method: operation.method,
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
            ...request.headers
          },
          body: operation.method !== "GET" && operation.method !== "HEAD" ? JSON.stringify(request.body) : void 0,
          signal: request.timeout ? AbortSignal.timeout(request.timeout) : void 0
        });
        const responseData = await response.json().catch(() => null);
        const durationMs = Date.now() - startTime;
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
            durationMs
          });
        }
        res.json({
          success: response.ok,
          data: responseData,
          statusCode: response.status,
          requestId,
          durationMs,
          operation: request.operation,
          integration: integration.key
        });
        return;
      }
      if (integration.type === "mcp") {
        if (integration.mcp) {
          mcpExecutor.registerServer(integration.key, integration.mcp);
        }
        const context = {
          requestId,
          userId: user.id,
          orgId: user.orgId,
          authToken: token,
          timeout: request.timeout || 3e4
        };
        try {
          const result = await mcpExecutor.execute({
            operation,
            integrationKey: integration.key,
            params: request.body || {},
            context
          });
          const durationMs = Date.now() - startTime;
          res.json({
            success: true,
            data: result.data,
            type: result.type,
            requestId,
            durationMs,
            operation: request.operation,
            integration: integration.key
          });
          return;
        } catch (error) {
          const durationMs = Date.now() - startTime;
          const classified = error instanceof IntegrationError ? error : classifyProviderError(error, integration.key, operation.id);
          res.status(classified.statusCode).json({
            ...classified.toResponse(),
            requestId,
            durationMs,
            operation: request.operation,
            integration: integration.key
          });
          return;
        }
      }
      const notSupportedError = new IntegrationError({
        message: `Unsupported integration type: ${integration.type}`,
        category: "validation"
      });
      res.status(notSupportedError.statusCode).json({
        ...notSupportedError.toResponse(),
        requestId,
        durationMs: Date.now() - startTime
      });
    } catch (error) {
      console.error("[integrations] Invoke error:", error);
      const classified = error instanceof IntegrationError ? error : new IntegrationError({
        message: error instanceof Error ? error.message : "Internal error",
        category: "internal",
        cause: error instanceof Error ? error : void 0
      });
      res.status(classified.statusCode).json({
        ...classified.toResponse(),
        requestId,
        durationMs: Date.now() - startTime
      });
    }
  });
  app.post("/api/integrations/parse/openapi", authMiddleware, async (req, res) => {
    const { specUrl, spec, serverUrl } = req.body;
    const result = await fetchAndParseOpenAPI({ specUrl, spec, serverUrl });
    if (result.success) {
      res.json({
        success: true,
        operations: result.operations,
        namespace: result.namespace,
        info: result.info,
        authType: result.authType,
        serverUrl: result.serverUrl
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  });
  app.post("/api/integrations/parse/mcp", authMiddleware, async (req, res) => {
    const config2 = req.body;
    const result = await discoverMCPServer(config2);
    if (result.success) {
      res.json({
        success: true,
        operations: result.operations,
        namespace: result.namespace,
        capabilities: result.capabilities
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  });
  app.post("/api/integrations/registry/:key/refresh", authMiddleware, async (req, res) => {
    const key = getParam2(req.params, "key");
    const result = await integrationRegistry.refresh(key);
    if (result.success) {
      res.json({
        success: true,
        integration: integrationRegistry.get(key),
        operationCount: result.operationCount
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  });
  app.post("/api/integrations/mcp", authMiddleware, createMCPHttpHandler());
  app.get("/api/integrations/mcp/info", async (_req, res) => {
    const tools = integrationRegistry.getAll().flatMap(
      (i) => (i.operations || []).map((op) => ({
        integration: i.key,
        operation: op.id,
        description: op.summary || op.description,
        tags: op.tags
      }))
    );
    res.json({
      server: {
        name: "symbia-integrations",
        version: "1.0.0",
        protocol: "2024-11-05"
      },
      capabilities: {
        tools: true,
        resources: false,
        prompts: false
      },
      toolCount: tools.length,
      tools: tools.slice(0, 50)
      // First 50 for preview
    });
  });
  app.post("/api/integrations/mcp/register", authMiddleware, async (req, res) => {
    const {
      key,
      name,
      description,
      transport,
      command,
      args,
      serverUrl,
      env
    } = req.body;
    if (!key || !transport) {
      res.status(400).json({
        success: false,
        error: "key and transport are required"
      });
      return;
    }
    const mcpConfig = {
      transport,
      command,
      args,
      serverUrl,
      env
    };
    const discovery = await discoverMCPServer(mcpConfig);
    if (!discovery.success) {
      res.status(400).json({
        success: false,
        error: `Failed to connect to MCP server: ${discovery.error}`
      });
      return;
    }
    const integration = {
      id: `mcp-${key}`,
      key,
      name: name || key,
      description: description || `MCP server: ${key}`,
      type: "mcp",
      mcp: mcpConfig,
      operations: discovery.operations,
      namespace: discovery.namespace,
      status: "active",
      version: 1
    };
    const result = await integrationRegistry.register(integration);
    if (result.success) {
      res.json({
        success: true,
        integration: integrationRegistry.get(key),
        operationCount: result.operationCount,
        capabilities: discovery.capabilities
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  });
  initializeOAuthProviders();
  const oauthStorage = createOAuthStorage(db);
  const oauthService = new OAuthService(oauthStorage);
  app.get("/api/oauth/providers", authMiddleware, async (req, res) => {
    const user = req.user;
    try {
      const providers = await oauthService.getAvailableProviders(user.id);
      res.json({ providers });
    } catch (error) {
      console.error("[oauth] Error listing providers:", error);
      res.status(500).json({ error: "Failed to list OAuth providers" });
    }
  });
  app.post("/api/oauth/authorize", authMiddleware, async (req, res) => {
    const user = req.user;
    try {
      const parseResult = oauthAuthorizeRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors
        });
        return;
      }
      const request = parseResult.data;
      const result = await oauthService.authorize(request, user.id, user.orgId);
      res.json(result);
    } catch (error) {
      if (error instanceof OAuthError) {
        res.status(400).json({
          error: error.message,
          code: error.code,
          details: error.details
        });
        return;
      }
      console.error("[oauth] Authorization error:", error);
      res.status(500).json({ error: "Failed to initiate OAuth flow" });
    }
  });
  app.get("/api/oauth/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
      const redirectUrl = config.oauthErrorRedirectUrl;
      const errorParams = new URLSearchParams({
        error: String(error),
        error_description: String(error_description || "")
      });
      res.redirect(`${redirectUrl}/oauth/error?${errorParams}`);
      return;
    }
    if (!code || !state) {
      res.status(400).json({
        error: "Missing code or state parameter"
      });
      return;
    }
    try {
      const result = await oauthService.handleCallback(
        String(code),
        String(state)
      );
      const successParams = new URLSearchParams({
        success: "true",
        provider: result.connection.provider,
        connection_id: result.connection.id
      });
      if (result.clientState) {
        successParams.set("state", result.clientState);
      }
      res.redirect(`${result.redirectUri}?${successParams}`);
    } catch (error2) {
      console.error("[oauth] Callback error:", error2);
      const redirectUrl = config.oauthErrorRedirectUrl;
      const errorMessage = error2 instanceof OAuthError ? error2.message : "OAuth callback failed";
      const errorParams = new URLSearchParams({
        error: "callback_failed",
        error_description: errorMessage
      });
      res.redirect(`${redirectUrl}/oauth/error?${errorParams}`);
    }
  });
  app.get("/api/oauth/connections", authMiddleware, async (req, res) => {
    const user = req.user;
    try {
      const connections = await oauthService.getConnections(user.id, user.orgId);
      res.json({ connections });
    } catch (error) {
      console.error("[oauth] Error listing connections:", error);
      res.status(500).json({ error: "Failed to list OAuth connections" });
    }
  });
  app.delete("/api/oauth/connections/:id", authMiddleware, async (req, res) => {
    const user = req.user;
    const id = getParam2(req.params, "id");
    try {
      await oauthService.revokeConnection(id, user.id);
      res.json({ success: true, message: "Connection revoked" });
    } catch (error) {
      if (error instanceof OAuthError) {
        const statusCode = error.code === "connection_not_found" ? 404 : error.code === "not_authorized" ? 403 : 400;
        res.status(statusCode).json({
          error: error.message,
          code: error.code
        });
        return;
      }
      console.error("[oauth] Error revoking connection:", error);
      res.status(500).json({ error: "Failed to revoke connection" });
    }
  });
  app.get("/api/integrations/usage", authMiddleware, async (req, res) => {
    const user = req.user;
    const { days = "30", integration } = req.query;
    try {
      const daysNum = parseInt(days) || 30;
      const startDate = /* @__PURE__ */ new Date();
      startDate.setDate(startDate.getDate() - daysNum);
      const conditions = [
        sql4`${proxyUsage.orgId} = ${user.orgId}`,
        sql4`${proxyUsage.timestamp} >= ${startDate}`
      ];
      if (integration) {
        conditions.push(sql4`${proxyUsage.integrationKey} = ${integration}`);
      }
      const summary = await db.select({
        totalRequests: sql4`count(*)::int`,
        successCount: sql4`sum(case when ${proxyUsage.success} then 1 else 0 end)::int`,
        errorCount: sql4`sum(case when not ${proxyUsage.success} then 1 else 0 end)::int`,
        totalTokens: sql4`coalesce(sum(${proxyUsage.totalTokens}), 0)::int`,
        totalCostMicros: sql4`coalesce(sum(${proxyUsage.estimatedCostMicros}), 0)::int`,
        avgDurationMs: sql4`coalesce(avg(${proxyUsage.durationMs}), 0)::int`,
        uniqueUsers: sql4`count(distinct ${proxyUsage.userId})::int`
      }).from(proxyUsage).where(and3(...conditions));
      const byIntegration = await db.select({
        integrationKey: proxyUsage.integrationKey,
        requestCount: sql4`count(*)::int`,
        totalTokens: sql4`coalesce(sum(${proxyUsage.totalTokens}), 0)::int`
      }).from(proxyUsage).where(and3(...conditions)).groupBy(proxyUsage.integrationKey).orderBy(sql4`count(*) desc`);
      const byUser = await db.select({
        userId: proxyUsage.userId,
        requestCount: sql4`count(*)::int`,
        totalTokens: sql4`coalesce(sum(${proxyUsage.totalTokens}), 0)::int`
      }).from(proxyUsage).where(and3(...conditions)).groupBy(proxyUsage.userId).orderBy(sql4`count(*) desc`).limit(20);
      res.json({
        period: { days: daysNum, startDate: startDate.toISOString() },
        summary: summary[0] || {
          totalRequests: 0,
          successCount: 0,
          errorCount: 0,
          totalTokens: 0,
          totalCostMicros: 0,
          avgDurationMs: 0,
          uniqueUsers: 0
        },
        byIntegration,
        byUser
      });
    } catch (error) {
      console.error("[integrations] Usage query error:", error);
      res.status(500).json({ error: "Failed to fetch usage data" });
    }
  });
  app.get("/api/integrations/usage/logs", authMiddleware, async (req, res) => {
    const user = req.user;
    const { days = "7", integration, userId: filterUserId, limit: limitStr = "100", offset: offsetStr = "0" } = req.query;
    try {
      const daysNum = parseInt(days) || 7;
      const limitNum = Math.min(parseInt(limitStr) || 100, 500);
      const offsetNum = parseInt(offsetStr) || 0;
      const startDate = /* @__PURE__ */ new Date();
      startDate.setDate(startDate.getDate() - daysNum);
      const conditions = [
        sql4`${proxyUsage.orgId} = ${user.orgId}`,
        sql4`${proxyUsage.timestamp} >= ${startDate}`
      ];
      if (integration) {
        conditions.push(sql4`${proxyUsage.integrationKey} = ${integration}`);
      }
      if (filterUserId) {
        conditions.push(sql4`${proxyUsage.userId} = ${filterUserId}`);
      }
      const logs = await db.select().from(proxyUsage).where(and3(...conditions)).orderBy(sql4`${proxyUsage.timestamp} desc`).limit(limitNum).offset(offsetNum);
      res.json({ logs, limit: limitNum, offset: offsetNum });
    } catch (error) {
      console.error("[integrations] Usage logs query error:", error);
      res.status(500).json({ error: "Failed to fetch usage logs" });
    }
  });
  app.get("/api/integrations/usage/by-user", authMiddleware, async (req, res) => {
    const user = req.user;
    const { days = "30", integration } = req.query;
    try {
      const daysNum = parseInt(days) || 30;
      const startDate = /* @__PURE__ */ new Date();
      startDate.setDate(startDate.getDate() - daysNum);
      const conditions = [
        sql4`${proxyUsage.orgId} = ${user.orgId}`,
        sql4`${proxyUsage.timestamp} >= ${startDate}`
      ];
      if (integration) {
        conditions.push(sql4`${proxyUsage.integrationKey} = ${integration}`);
      }
      const byUser = await db.select({
        userId: proxyUsage.userId,
        requestCount: sql4`count(*)::int`,
        successCount: sql4`sum(case when ${proxyUsage.success} then 1 else 0 end)::int`,
        errorCount: sql4`sum(case when not ${proxyUsage.success} then 1 else 0 end)::int`,
        totalTokens: sql4`coalesce(sum(${proxyUsage.totalTokens}), 0)::int`,
        totalCostMicros: sql4`coalesce(sum(${proxyUsage.estimatedCostMicros}), 0)::int`,
        avgDurationMs: sql4`coalesce(avg(${proxyUsage.durationMs}), 0)::int`,
        lastUsedAt: sql4`max(${proxyUsage.timestamp})`
      }).from(proxyUsage).where(and3(...conditions)).groupBy(proxyUsage.userId).orderBy(sql4`count(*) desc`);
      res.json({ users: byUser });
    } catch (error) {
      console.error("[integrations] Usage by-user query error:", error);
      res.status(500).json({ error: "Failed to fetch usage data" });
    }
  });
  app.get("/api/integrations/capabilities", authMiddleware, async (req, res) => {
    const user = req.user;
    const token = req.token;
    try {
      const providers = getRegisteredProviders();
      const providerCapabilities = [];
      const byProvider = {};
      const modelsByPurpose = {
        chat: [],
        embedding: [],
        vision: [],
        reasoning: []
      };
      for (const providerName of providers) {
        const config2 = getProviderConfig(providerName);
        const adapter = getProvider(providerName);
        let hasCredential = false;
        let credentialSource = "none";
        let apiKey;
        try {
          const credential = await getCredential(user.id, user.orgId, providerName, token);
          if (credential?.apiKey) {
            hasCredential = true;
            apiKey = credential.apiKey;
            credentialSource = credential.isProxy ? "org-wide" : "personal";
          }
        } catch {
        }
        let models = await getModelsForProvider(providerName, apiKey);
        const capability = {
          provider: providerName,
          name: providerName.charAt(0).toUpperCase() + providerName.slice(1),
          description: getProviderDescription(providerName),
          baseUrl: config2?.baseUrl || "",
          defaultModel: config2?.defaultModel || "",
          supportedOperations: adapter?.supportedOperations || config2?.supportedOperations || [],
          models,
          access: {
            hasCredential,
            credentialSource,
            isEnabled: hasCredential,
            lastUsedAt: null
          },
          rateLimits: config2?.rateLimits,
          status: hasCredential ? "available" : "unavailable",
          statusMessage: hasCredential ? void 0 : "No API key configured"
        };
        providerCapabilities.push(capability);
        byProvider[providerName] = capability;
        for (const model of models) {
          const caps = model.capabilities || [];
          if (caps.includes("chat") || caps.includes("reasoning")) {
            modelsByPurpose.chat.push({ provider: providerName, model });
          }
          if (caps.includes("embedding")) {
            modelsByPurpose.embedding.push({ provider: providerName, model });
          }
          if (caps.includes("vision")) {
            modelsByPurpose.vision.push({ provider: providerName, model });
          }
          if (caps.includes("reasoning")) {
            modelsByPurpose.reasoning.push({ provider: providerName, model });
          }
        }
      }
      const providerPriority = ["openai", "anthropic", "google", "mistral", "cohere", "huggingface"];
      for (const purpose of Object.keys(modelsByPurpose)) {
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
          chatProvider: "openai",
          chatModel: "gpt-4o-mini",
          embeddingProvider: "openai",
          embeddingModel: "text-embedding-3-small"
        },
        fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (error) {
      console.error("[integrations] Capabilities error:", error);
      res.status(500).json({ error: "Failed to fetch capabilities" });
    }
  });
  app.get("/api/integrations/status", async (req, res) => {
    const providers = getRegisteredProviders();
    const configs = getAllProviderConfigs();
    res.json({
      status: "healthy",
      providers: providers.map((p) => ({
        name: p,
        registered: configs.some((c) => c.provider === p),
        credential: "not_checked",
        // Deprecated: same value as `registered`. Never meant a key exists.
        configured: configs.some((c) => c.provider === p)
      })),
      note: "registered = an adapter and config exist in this service. Credentials are per-user and live in identity; this route is unauthenticated and does not check them. Use GET /api/integrations/capabilities with a token for a credential-aware answer.",
      circuitBreaker: circuitBreaker.getStatus()
    });
  });
  app.get("/api/integrations/circuit-breaker", authMiddleware, async (_req, res) => {
    res.json({
      status: circuitBreaker.getStatus(),
      description: "Circuit breaker protects against cascading failures. Open circuits reject requests until recovery."
    });
  });
  app.post("/api/integrations/circuit-breaker/reset/:provider", authMiddleware, async (req, res) => {
    const provider = getParam2(req.params, "provider");
    circuitBreaker.reset(provider);
    res.json({
      success: true,
      message: `Circuit breaker reset for ${provider}`,
      status: circuitBreaker.getStatus()
    });
  });
  app.post("/api/integrations/circuit-breaker/reset", authMiddleware, async (_req, res) => {
    circuitBreaker.resetAll();
    res.json({
      success: true,
      message: "All circuit breakers reset",
      status: circuitBreaker.getStatus()
    });
  });
  app.get("/api/stats", async (_req, res) => {
    try {
      const providers = getRegisteredProviders();
      const configs = getAllProviderConfigs();
      const integrations2 = integrationRegistry.getAll();
      res.json({
        totalProviders: providers.length,
        configuredProviders: configs.length,
        totalIntegrations: integrations2.length
      });
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });
  app.get("/api/integrations/debug", authMiddleware, async (req, res) => {
    const user = req.user;
    const token = req.token;
    const credential = await getCredential(user.id, user.orgId, "openai", token);
    res.json({
      auth: {
        userId: user.id,
        userType: user.type,
        orgId: user.orgId,
        headerOrgId: req.headers["x-org-id"]
      },
      credentialLookup: {
        found: !!credential,
        hasApiKey: !!credential?.apiKey
      }
    });
  });
  await initializeModelEvalSystem();
  const evalRoutes = createEvalRoutes(db);
  app.use("/api/model-eval", evalRoutes);
  app.get("/", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/api/docs", (_req, res) => {
    res.redirect("/openapi.json");
  });
  app.get("/openapi.json", (_req, res) => {
    res.json(apiDocumentation);
  });
  app.get("/.well-known/openapi.json", (_req, res) => {
    res.json(apiDocumentation);
  });
  app.get("/llms.txt", (_req, res) => {
    try {
      const content = readFileSync(join(docsDir, "llms.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });
  app.get("/llm.txt", (_req, res) => {
    try {
      const content = readFileSync(join(docsDir, "llms.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });
  app.get("/llms-full.txt", (_req, res) => {
    try {
      const content = readFileSync(join(docsDir, "llms-full.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });
  app.get("/docs/openapi.json", (_req, res) => {
    res.json(apiDocumentation);
  });
  app.get("/docs/llms.txt", (_req, res) => {
    try {
      const content = readFileSync(join(docsDir, "llms.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });
  app.get("/docs/llms-full.txt", (_req, res) => {
    try {
      const content = readFileSync(join(docsDir, "llms-full.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });
  app.post("/api/integrations/db/export", authMiddleware, async (_req, res) => {
    const { exportToFile: exportToFile2, isMemory: isMemory2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    if (!isMemory2) {
      return res.json({
        success: false,
        message: "Database is using PostgreSQL - no export needed, data persists automatically"
      });
    }
    const timestamp3 = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const exportPath = join(process.cwd(), "data", `model-eval-backup-${timestamp3}.json`);
    const success = exportToFile2(exportPath);
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
  app.get("/api/integrations/db/status", authMiddleware, async (_req, res) => {
    const { isMemory: isMemory2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    res.json({
      isMemory: isMemory2,
      persistsOnRestart: !isMemory2,
      recommendation: isMemory2 ? "Set DATABASE_URL environment variable for persistent storage, or call POST /api/integrations/db/export before shutdown" : "Data persists automatically in PostgreSQL"
    });
  });
}
async function logExecution(data) {
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
      metadata: data.metadata
    });
  } catch (error) {
    console.error("[integrations] Failed to log execution:", error);
  }
}
function getProviderDescription(provider) {
  const descriptions = {
    openai: "OpenAI GPT models including GPT-4o, GPT-5.2, o3, and o4 series",
    anthropic: "Anthropic Claude models with advanced reasoning and long context",
    google: "Google Gemini models with multimodal capabilities",
    mistral: "Mistral AI models optimized for efficiency and multilingual support",
    cohere: "Cohere models specialized for enterprise search and RAG",
    huggingface: "Open-source models via Hugging Face Inference API"
  };
  return descriptions[provider] || `${provider} integration`;
}
async function logProxyUsage(data) {
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
      estimatedCostMicros: data.estimatedCostMicros
    });
    console.log(`[integrations] Logged proxy usage - user: ${data.userId}, org: ${data.orgId}, integration: ${data.integrationKey}`);
  } catch (error) {
    console.error("[integrations] Failed to log proxy usage:", error);
  }
}
export {
  registerRoutes
};
