import { z } from "zod";
import { pgTable, varchar, text, integer, boolean, timestamp, json, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// =============================================================================
// Provider Types
// =============================================================================

export const providerSchema = z.enum([
  "openai",
  "anthropic",
  "huggingface",
  "symbia-labs",
]);
export type Provider = z.infer<typeof providerSchema>;

export const operationSchema = z.enum([
  "chat.completions",
  "responses",       // OpenAI Responses API (stateful)
  "messages",        // Anthropic native
  "text.generation",
  "embeddings",
]);
export type Operation = z.infer<typeof operationSchema>;

// =============================================================================
// Normalized LLM Response Schema
// =============================================================================

export const finishReasonSchema = z.enum([
  "stop",
  "length",
  "content_filter",
  "tool_calls",
  "error",
  "incomplete",     // OpenAI Responses API (request cut short)
]);
export type FinishReason = z.infer<typeof finishReasonSchema>;

export const usageSchema = z.object({
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
});
export type Usage = z.infer<typeof usageSchema>;

export const toolCallSchema = z.object({
  id: z.string(),
  type: z.string(),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});
export type ToolCall = z.infer<typeof toolCallSchema>;

export const normalizedLLMResponseSchema = z.object({
  provider: z.string(),
  model: z.string(),
  content: z.string(),
  usage: usageSchema,
  finishReason: finishReasonSchema,
  toolCalls: z.array(toolCallSchema).optional(),
  metadata: z.record(z.unknown()),
});
export type NormalizedLLMResponse = z.infer<typeof normalizedLLMResponseSchema>;

export const normalizedEmbeddingResponseSchema = z.object({
  provider: z.string(),
  model: z.string(),
  embeddings: z.array(z.array(z.number())),
  usage: z.object({
    promptTokens: z.number().int().min(0),
    totalTokens: z.number().int().min(0),
  }),
  metadata: z.record(z.unknown()),
});
export type NormalizedEmbeddingResponse = z.infer<typeof normalizedEmbeddingResponseSchema>;

// =============================================================================
// Execute Request/Response Schemas
// =============================================================================

/**
 * Allowed parameters for execute requests.
 *
 * Explicitly whitelisted — no .passthrough(). Since integrations is the sole
 * bridge to external APIs in most Symbia networks, we must not blindly forward
 * arbitrary keys to upstream providers.
 */
export const executeParamsSchema = z.object({
  model: z.string(),

  // Input
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.union([z.string(), z.array(z.unknown())]),
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
    tool_calls: z.array(z.unknown()).optional(),
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
  parallelToolCalls: z.boolean().optional(),
}).strict();

export const executeRequestSchema = z.object({
  provider: providerSchema,
  operation: operationSchema,
  params: executeParamsSchema,
  credentialId: z.string().optional(),
});
export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

export const executeResponseSchema = z.object({
  success: z.boolean(),
  data: z.union([normalizedLLMResponseSchema, normalizedEmbeddingResponseSchema]).optional(),
  error: z.string().optional(),
  requestId: z.string(),
  durationMs: z.number(),
});
export type ExecuteResponse = z.infer<typeof executeResponseSchema>;

// =============================================================================
// Provider Configuration (from Catalog)
// =============================================================================

export const providerConfigSchema = z.object({
  provider: z.string(),
  baseUrl: z.string().url(),
  authType: z.enum(["bearer", "header", "query"]),
  endpoints: z.record(z.string()),
  rateLimits: z.object({
    requestsPerMinute: z.number().int().positive(),
    tokensPerMinute: z.number().int().positive(),
  }).optional(),
  defaultModel: z.string(),
  supportedOperations: z.array(z.string()),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

/**
 * Model capability enum
 */
export const modelCapabilitySchema = z.enum([
  "chat",
  "completion",
  "embedding",
  "vision",
  "function_calling",
  "reasoning",
]);
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;

/**
 * Model configuration - detailed info about an AI model
 */
export const modelConfigSchema = z.object({
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
  supportedOperations: z.array(z.string()).optional(),
});
export type ModelConfig = z.infer<typeof modelConfigSchema>;

// =============================================================================
// Database Tables
// =============================================================================

export const executionLogs = pgTable("integration_execution_logs", {
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
  metadata: json("metadata").$type<Record<string, unknown>>().default({}),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_execution_logs_user_id").on(table.userId),
  orgIdx: index("idx_execution_logs_org_id").on(table.orgId),
  providerIdx: index("idx_execution_logs_provider").on(table.provider),
  createdIdx: index("idx_execution_logs_created").on(table.createdAt),
}));

export type ExecutionLog = typeof executionLogs.$inferSelect;
export type InsertExecutionLog = typeof executionLogs.$inferInsert;

// =============================================================================
// Credential Response (from Identity - metadata only, no secrets)
// =============================================================================

export const credentialMetadataSchema = z.object({
  id: z.string(),
  provider: z.string(),
  name: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
export type CredentialMetadata = z.infer<typeof credentialMetadataSchema>;

// =============================================================================
// OpenAPI/MCP Integration Schema
// =============================================================================

/**
 * Authentication configuration for integrations
 */
export const integrationAuthSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bearer"),
    credentialKey: z.string(), // Reference to stored credential
  }),
  z.object({
    type: z.literal("apiKey"),
    header: z.string().default("X-API-Key"),
    credentialKey: z.string(),
  }),
  z.object({
    type: z.literal("basic"),
    credentialKey: z.string(), // Stored as base64(username:password)
  }),
  z.object({
    type: z.literal("oauth2"),
    tokenUrl: z.string().url(),
    scopes: z.array(z.string()).optional(),
    credentialKey: z.string(), // client_id:client_secret
  }),
  z.object({
    type: z.literal("none"),
  }),
]);
export type IntegrationAuth = z.infer<typeof integrationAuthSchema>;

/**
 * Parameter location in OpenAPI
 */
export const parameterLocationSchema = z.enum(["path", "query", "header", "cookie", "body"]);
export type ParameterLocation = z.infer<typeof parameterLocationSchema>;

/**
 * Operation parameter schema
 */
export const operationParameterSchema = z.object({
  name: z.string(),
  location: parameterLocationSchema,
  required: z.boolean().default(false),
  description: z.string().optional(),
  schema: z.record(z.unknown()).optional(), // JSON Schema
  example: z.unknown().optional(),
});
export type OperationParameter = z.infer<typeof operationParameterSchema>;

/**
 * Discovered operation from OpenAPI/MCP spec
 */
export const integrationOperationSchema = z.object({
  // Identity
  id: z.string(),                          // e.g., "chat.completions.create"
  operationId: z.string().optional(),      // Original OpenAPI operationId

  // HTTP details (for OpenAPI)
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).optional(),
  path: z.string().optional(),             // e.g., "/v1/chat/completions"

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
    schema: z.record(z.unknown()).optional(), // JSON Schema
  }).optional(),

  // Response
  responseSchema: z.record(z.unknown()).optional(),

  // MCP-specific
  mcpTool: z.object({
    name: z.string(),
    inputSchema: z.record(z.unknown()),
  }).optional(),
});
export type IntegrationOperation = z.infer<typeof integrationOperationSchema>;

/**
 * OpenAPI spec configuration
 */
export const openAPIConfigSchema = z.object({
  specUrl: z.string().url().optional(),    // URL to fetch spec from
  spec: z.record(z.unknown()).optional(),  // Or inline spec object
  version: z.string().optional(),          // Spec version detected
  serverUrl: z.string().url().optional(),  // Override base URL
});
export type OpenAPIConfig = z.infer<typeof openAPIConfigSchema>;

/**
 * MCP server configuration
 */
export const mcpConfigSchema = z.object({
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
    prompts: z.boolean().optional(),
  }).optional(),
});
export type MCPConfig = z.infer<typeof mcpConfigSchema>;

/**
 * Rate limiting configuration
 */
export const rateLimitConfigSchema = z.object({
  requestsPerMinute: z.number().int().positive().optional(),
  requestsPerSecond: z.number().int().positive().optional(),
  tokensPerMinute: z.number().int().positive().optional(),
  concurrentRequests: z.number().int().positive().optional(),
});
export type RateLimitConfig = z.infer<typeof rateLimitConfigSchema>;

/**
 * Integration resource - the main integration definition
 */
export const integrationSchema = z.object({
  // Identity (from CatalogResource)
  id: z.string(),
  key: z.string(),                         // e.g., "openai", "stripe", "my-mcp-server"
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
    backoffMs: z.number().int().positive().default(1000),
    backoffMultiplier: z.number().positive().default(2),
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
  metadata: z.record(z.unknown()).optional(),
});
export type Integration = z.infer<typeof integrationSchema>;

/**
 * Integration invoke request - execute any operation
 */
export const integrationInvokeRequestSchema = z.object({
  // Target operation (dot-notation path)
  operation: z.string(),                   // e.g., "integrations.openai.chat.completions.create"

  // Request parameters
  params: z.record(z.unknown()).optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string()).optional(),

  // Options
  timeout: z.number().int().positive().optional(),
  retries: z.number().int().min(0).optional(),
});
export type IntegrationInvokeRequest = z.infer<typeof integrationInvokeRequestSchema>;

/**
 * Integration invoke response
 */
export const integrationInvokeResponseSchema = z.object({
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
  headers: z.record(z.string()).optional(),
});
export type IntegrationInvokeResponse = z.infer<typeof integrationInvokeResponseSchema>;

// =============================================================================
// Database Tables for Integrations
// =============================================================================

export const integrations = pgTable("integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 255 }).notNull().unique(),
  orgId: varchar("org_id").notNull(),

  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).notNull(), // 'openapi' | 'mcp' | 'builtin' | 'custom'

  // Configuration (stored as JSON)
  config: json("config").$type<{
    openapi?: OpenAPIConfig;
    mcp?: MCPConfig;
    auth?: IntegrationAuth;
    rateLimit?: RateLimitConfig;
    retry?: { maxRetries: number; backoffMs: number; backoffMultiplier: number };
  }>().default({}),

  // Discovered operations (cached after spec parse)
  operations: json("operations").$type<IntegrationOperation[]>().default([]),
  namespace: json("namespace").$type<Record<string, unknown>>().default({}),

  // Status
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  syncError: text("sync_error"),

  // Metadata
  version: integer("version").default(1).notNull(),
  tags: json("tags").$type<string[]>().default([]),
  metadata: json("metadata").$type<Record<string, unknown>>().default({}),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  keyIdx: index("idx_integrations_key").on(table.key),
  orgIdx: index("idx_integrations_org_id").on(table.orgId),
  typeIdx: index("idx_integrations_type").on(table.type),
  statusIdx: index("idx_integrations_status").on(table.status),
}));

export type IntegrationRecord = typeof integrations.$inferSelect;
export type InsertIntegration = typeof integrations.$inferInsert;

// =============================================================================
// Proxy Usage Tracking
// =============================================================================

/**
 * Tracks usage when org-wide (proxy) credentials are used.
 * Enables org admins to see per-user usage and costs.
 */
export const proxyUsage = pgTable("proxy_usage", {
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
  metadata: json("metadata").$type<Record<string, unknown>>().default({}),

  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_proxy_usage_user_id").on(table.userId),
  orgIdx: index("idx_proxy_usage_org_id").on(table.orgId),
  integrationIdx: index("idx_proxy_usage_integration").on(table.integrationKey),
  timestampIdx: index("idx_proxy_usage_timestamp").on(table.timestamp),
  orgTimestampIdx: index("idx_proxy_usage_org_timestamp").on(table.orgId, table.timestamp),
  credentialIdx: index("idx_proxy_usage_credential").on(table.credentialId),
}));

export type ProxyUsageRecord = typeof proxyUsage.$inferSelect;
export type InsertProxyUsage = typeof proxyUsage.$inferInsert;

/**
 * Aggregated usage summary (materialized or computed)
 */
export const proxyUsageSummarySchema = z.object({
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
  avgDurationMs: z.number(),
});
export type ProxyUsageSummary = z.infer<typeof proxyUsageSummarySchema>;

// =============================================================================
// Provider Capabilities (SOR for UI)
// =============================================================================

/**
 * Comprehensive provider capability information
 * This is the authoritative source for what a provider can do
 */
export const providerCapabilitySchema = z.object({
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
    credentialSource: z.enum(['personal', 'org-wide', 'none']),
    isEnabled: z.boolean(),
    lastUsedAt: z.string().datetime().nullable().optional(),
  }),

  // Rate limits (if configured)
  rateLimits: z.object({
    requestsPerMinute: z.number().int().optional(),
    tokensPerMinute: z.number().int().optional(),
  }).optional(),

  // Status
  status: z.enum(['available', 'unavailable', 'degraded', 'disabled']).default('available'),
  statusMessage: z.string().optional(),
});
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;

/**
 * Response from /api/integrations/capabilities endpoint
 */
export const capabilitiesResponseSchema = z.object({
  // All providers with their capabilities
  providers: z.array(providerCapabilitySchema),

  // Quick lookup maps
  byProvider: z.record(providerCapabilitySchema),

  // Models grouped by purpose (for UI dropdowns)
  modelsByPurpose: z.object({
    chat: z.array(z.object({
      provider: z.string(),
      model: modelConfigSchema,
    })),
    embedding: z.array(z.object({
      provider: z.string(),
      model: modelConfigSchema,
    })),
    vision: z.array(z.object({
      provider: z.string(),
      model: modelConfigSchema,
    })),
    reasoning: z.array(z.object({
      provider: z.string(),
      model: modelConfigSchema,
    })),
  }),

  // User's default provider preferences (if configured)
  defaults: z.object({
    chatProvider: z.string().optional(),
    chatModel: z.string().optional(),
    embeddingProvider: z.string().optional(),
    embeddingModel: z.string().optional(),
  }).optional(),

  // Timestamp for cache invalidation
  fetchedAt: z.string().datetime(),
});
export type CapabilitiesResponse = z.infer<typeof capabilitiesResponseSchema>;

// =============================================================================
// Channel Types (Messaging Platform Integrations)
// =============================================================================

/**
 * Supported channel types for external messaging platforms
 */
export const channelTypeSchema = z.enum([
  "telegram",
]);
export type ChannelType = z.infer<typeof channelTypeSchema>;

/**
 * Connection mode determines how a channel connects to the external platform
 */
export const channelConnectionModeSchema = z.enum([
  "webhook",   // Platform sends events to our webhook URL
]);
export type ChannelConnectionMode = z.infer<typeof channelConnectionModeSchema>;

/**
 * Connection status for channel connections
 */
export const channelConnectionStatusSchema = z.enum([
  "pending",       // Connection initiated but not yet established
  "connecting",    // Connection in progress (e.g., waiting for QR scan)
  "connected",     // Connection active and working
  "disconnected",  // Connection terminated (graceful or timeout)
  "error",         // Connection failed with error
]);
export type ChannelConnectionStatus = z.infer<typeof channelConnectionStatusSchema>;

/**
 * Channel capabilities - what features the channel supports
 */
export const channelCapabilitiesSchema = z.object({
  directMessages: z.boolean().default(true),
  groupChats: z.boolean().default(false),
  threads: z.boolean().default(false),
  reactions: z.boolean().default(false),
  fileAttachments: z.boolean().default(false),
  voiceMessages: z.boolean().default(false),
  edits: z.boolean().default(false),
  deletions: z.boolean().default(false),
  typing: z.boolean().default(false),
  readReceipts: z.boolean().default(false),
});
export type ChannelCapabilities = z.infer<typeof channelCapabilitiesSchema>;

/**
 * Channel formatting constraints
 */
export const channelFormattingSchema = z.object({
  maxLength: z.number().int().positive().optional(),
  supportsMarkdown: z.boolean().default(false),
  supportsHtml: z.boolean().default(false),
  supportsMentions: z.boolean().default(false),
  supportsEmoji: z.boolean().default(true),
});
export type ChannelFormatting = z.infer<typeof channelFormattingSchema>;

/**
 * Channel configuration
 */
export const channelConfigSchema = z.object({
  channelType: channelTypeSchema.optional(),
  connectionMode: channelConnectionModeSchema.optional(),
  capabilities: channelCapabilitiesSchema.optional(),
  formatting: channelFormattingSchema.optional(),
  webhookBaseUrl: z.string().url().optional(),
  webhookSecret: z.string().optional(),
  dropPendingUpdates: z.boolean().optional(),
  allowedUpdateTypes: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ChannelConfig = z.infer<typeof channelConfigSchema>;

/**
 * Attachment in channel messages
 */
export const channelAttachmentSchema = z.object({
  type: z.string(), // "image", "audio", "video", "file", "location"
  url: z.string().url().optional(),
  mimeType: z.string().optional(),
  filename: z.string().optional(),
  size: z.number().int().optional(),
  data: z.string().optional(), // base64 for inline data
});
export type ChannelAttachment = z.infer<typeof channelAttachmentSchema>;

/**
 * Sender info in channel messages
 */
export const channelSenderSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  username: z.string().optional(),
  isBot: z.boolean().optional(),
});
export type ChannelSender = z.infer<typeof channelSenderSchema>;

/**
 * Chat info in channel messages
 */
export const channelChatSchema = z.object({
  id: z.string(),
  type: z.enum(["private", "group", "channel", "thread"]),
  name: z.string().optional(),
});
export type ChannelChat = z.infer<typeof channelChatSchema>;

/**
 * Inbound message from external platform
 */
export const channelInboundMessageSchema = z.object({
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
  raw: z.record(z.unknown()).optional(),
});
export type ChannelInboundMessage = z.infer<typeof channelInboundMessageSchema>;

/**
 * Message formatting options
 */
export const channelMessageFormattingSchema = z.object({
  parseMode: z.enum(["plain", "markdown", "html"]).optional(),
  disablePreview: z.boolean().optional(),
  silent: z.boolean().optional(),
});
export type ChannelMessageFormatting = z.infer<typeof channelMessageFormattingSchema>;

/**
 * Outbound message to external platform
 */
export const channelOutboundMessageSchema = z.object({
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
  requestId: z.string().optional(),
});
export type ChannelOutboundMessage = z.infer<typeof channelOutboundMessageSchema>;

/**
 * Channel status change event
 */
export const channelStatusEventSchema = z.object({
  connectionId: z.string(),
  channelType: channelTypeSchema,
  previousStatus: channelConnectionStatusSchema,
  newStatus: channelConnectionStatusSchema,
  reason: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type ChannelStatusEvent = z.infer<typeof channelStatusEventSchema>;

// =============================================================================
// Channel Database Tables
// =============================================================================

/**
 * Channel connections table - tracks connections to external messaging platforms
 */
export const channelConnections = pgTable("channel_connections", {
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
  sessionData: json("session_data").$type<Record<string, unknown>>().default({}),

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
  disconnectedAt: timestamp("disconnected_at"),
}, (table) => ({
  userIdx: index("idx_channel_connections_user_id").on(table.userId),
  orgIdx: index("idx_channel_connections_org_id").on(table.orgId),
  typeIdx: index("idx_channel_connections_channel_type").on(table.channelType),
  statusIdx: index("idx_channel_connections_status").on(table.status),
}));

export type ChannelConnection = typeof channelConnections.$inferSelect;
export type InsertChannelConnection = typeof channelConnections.$inferInsert;

// =============================================================================
// OAuth Provider Integration
// =============================================================================

/**
 * OAuth provider configuration schema
 * Defines how to connect to an external OAuth provider
 */
export const oauthProviderConfigSchema = z.object({
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
  tokenExpiresIn: z.number().int().positive().optional(), // Default expiry if not in response
});
export type OAuthProviderConfig = z.infer<typeof oauthProviderConfigSchema>;

/**
 * OAuth token response from provider
 */
export const oauthTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresIn: z.number().int().positive().optional(),
  tokenType: z.string().default("Bearer"),
  scope: z.string().optional(),
});
export type OAuthTokenResponse = z.infer<typeof oauthTokenResponseSchema>;

/**
 * OAuth user info from provider
 */
export const oauthUserInfoSchema = z.object({
  id: z.string(),
  email: z.string().email().optional(),
  name: z.string().optional(),
  username: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});
export type OAuthUserInfo = z.infer<typeof oauthUserInfoSchema>;

/**
 * OAuth authorize request
 */
export const oauthAuthorizeRequestSchema = z.object({
  provider: z.string().min(1),
  redirectUri: z.string().url().optional(), // Where to redirect after OAuth completes
  scopes: z.array(z.string()).optional(), // Override default scopes
  state: z.string().optional(), // Client-provided state for additional context
});
export type OAuthAuthorizeRequest = z.infer<typeof oauthAuthorizeRequestSchema>;

/**
 * OAuth authorize response
 */
export const oauthAuthorizeResponseSchema = z.object({
  authorizationUrl: z.string().url(),
  state: z.string(),
  provider: z.string(),
});
export type OAuthAuthorizeResponse = z.infer<typeof oauthAuthorizeResponseSchema>;

/**
 * OAuth connection (user's connected OAuth account)
 */
export const oauthConnectionSchema = z.object({
  id: z.string(),
  provider: z.string(),
  displayName: z.string(),
  connectedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  scopes: z.array(z.string()),
  status: z.enum(["active", "expired", "revoked"]),
  oauthUserId: z.string().optional(),
  oauthUserEmail: z.string().email().optional(),
  oauthUserName: z.string().optional(),
});
export type OAuthConnection = z.infer<typeof oauthConnectionSchema>;

// =============================================================================
// OAuth Database Tables
// =============================================================================

/**
 * OAuth provider configurations table
 * Stores provider client credentials and settings
 */
export const oauthProviderConfigs = pgTable("oauth_provider_configs", {
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
  defaultScopes: json("default_scopes").$type<string[]>().default([]),
  scopeDelimiter: varchar("scope_delimiter", { length: 10 }).default(" "),
  responseType: varchar("response_type", { length: 50 }).default("code"),
  grantType: varchar("grant_type", { length: 50 }).default("authorization_code"),
  pkceRequired: boolean("pkce_required").default(false),
  supportsRefresh: boolean("supports_refresh").default(true),

  // Status
  isEnabled: boolean("is_enabled").default(true).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  providerIdx: index("idx_oauth_provider_configs_provider").on(table.provider),
  enabledIdx: index("idx_oauth_provider_configs_enabled").on(table.isEnabled),
}));

export type OAuthProviderConfigRecord = typeof oauthProviderConfigs.$inferSelect;
export type InsertOAuthProviderConfig = typeof oauthProviderConfigs.$inferInsert;

/**
 * OAuth states table
 * Temporary storage for CSRF state tokens during OAuth flow
 */
export const oauthStates = pgTable("oauth_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  state: varchar("state", { length: 255 }).notNull().unique(),

  // Who initiated the flow
  userId: varchar("user_id").notNull(),
  orgId: varchar("org_id"),

  // OAuth flow details
  provider: varchar("provider", { length: 100 }).notNull(),
  redirectUri: text("redirect_uri").notNull(),
  scopes: json("scopes").$type<string[]>().default([]),

  // PKCE support
  pkceVerifier: text("pkce_verifier"),
  pkceChallenge: text("pkce_challenge"),

  // Client state (passed through from authorize request)
  clientState: text("client_state"),

  // Expiration (short-lived - 10 minutes)
  expiresAt: timestamp("expires_at").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  stateIdx: index("idx_oauth_states_state").on(table.state),
  expiresIdx: index("idx_oauth_states_expires").on(table.expiresAt),
  userIdx: index("idx_oauth_states_user").on(table.userId),
}));

export type OAuthState = typeof oauthStates.$inferSelect;
export type InsertOAuthState = typeof oauthStates.$inferInsert;

/**
 * OAuth connections table
 * Tracks user's connected OAuth accounts
 */
export const oauthConnections = pgTable("oauth_connections", {
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
  credentialId: varchar("credential_id"), // Reference to userCredentials in Identity

  // Scopes granted
  scopes: json("scopes").$type<string[]>().default([]),

  // Status
  status: varchar("status", { length: 50 }).default("active").notNull(), // active, expired, revoked
  expiresAt: timestamp("expires_at"),

  // Timestamps
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_oauth_connections_user").on(table.userId),
  orgIdx: index("idx_oauth_connections_org").on(table.orgId),
  providerIdx: index("idx_oauth_connections_provider").on(table.provider),
  userProviderIdx: index("idx_oauth_connections_user_provider").on(table.userId, table.provider),
  statusIdx: index("idx_oauth_connections_status").on(table.status),
}));

export type OAuthConnectionRecord = typeof oauthConnections.$inferSelect;
export type InsertOAuthConnection = typeof oauthConnections.$inferInsert;
