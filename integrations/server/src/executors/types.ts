/**
 * Integration Executor Types
 *
 * Defines the generalized execution model for all integration types.
 * The integrations service is the sole bridge to the external world,
 * so this layer must handle LLM providers, MCP servers, OpenAPI endpoints,
 * and any future integration types through a unified interface.
 */

import type {
  IntegrationOperation,
  NormalizedLLMResponse,
  NormalizedEmbeddingResponse,
} from "@shared/schema.js";

// =============================================================================
// Operation Types
// =============================================================================

/**
 * Classification of operation types for routing to appropriate executors
 */
export type OperationType =
  | "llm"           // LLM chat/completion (provider adapters)
  | "embedding"     // Embedding generation (provider adapters)
  | "mcp-tool"      // MCP server tool invocation
  | "mcp-resource"  // MCP server resource read
  | "mcp-prompt"    // MCP server prompt retrieval
  | "api-call";     // Generic REST API call (OpenAPI)

/**
 * Determine the operation type from an IntegrationOperation
 */
export function classifyOperation(op: IntegrationOperation): OperationType {
  // MCP operations are marked explicitly
  if (op.mcpTool) {
    return "mcp-tool";
  }
  if (op.id.startsWith("resource.")) {
    return "mcp-resource";
  }
  if (op.id.startsWith("prompt.")) {
    return "mcp-prompt";
  }

  // LLM operations by tag
  if (op.tags?.includes("llm") || op.tags?.includes("chat")) {
    return "llm";
  }
  if (op.tags?.includes("embedding")) {
    return "embedding";
  }

  // LLM operations by ID pattern
  if (
    op.id.includes("chat.completions") ||
    op.id.includes("messages") ||
    op.id.includes("responses")
  ) {
    return "llm";
  }
  if (op.id.includes("embedding")) {
    return "embedding";
  }

  // Default to generic API call
  return "api-call";
}

// =============================================================================
// Execution Context
// =============================================================================

export interface ExecutionContext {
  /** Unique request ID for tracing */
  requestId: string;
  /** Authenticated user ID */
  userId: string;
  /** Organization ID */
  orgId: string;
  /** Auth token for downstream service calls */
  authToken: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Credential ID if using a specific credential */
  credentialId?: string;
}

// =============================================================================
// Execution Request/Response
// =============================================================================

export interface ExecuteOperationRequest {
  /** The operation to execute */
  operation: IntegrationOperation;
  /** Integration key (e.g., "openai", "mcp-filesystem") */
  integrationKey: string;
  /** Operation parameters */
  params: Record<string, unknown>;
  /** Execution context */
  context: ExecutionContext;
}

/**
 * Response types vary by operation type.
 * MCP tools return structured content, LLMs return normalized responses.
 */
export type ExecuteOperationResponse =
  | LLMExecutionResult
  | EmbeddingExecutionResult
  | MCPToolResult
  | MCPResourceResult
  | MCPPromptResult
  | APICallResult;

export interface LLMExecutionResult {
  type: "llm";
  data: NormalizedLLMResponse;
}

export interface EmbeddingExecutionResult {
  type: "embedding";
  data: NormalizedEmbeddingResponse;
}

export interface MCPToolResult {
  type: "mcp-tool";
  data: {
    content: MCPContent[];
    isError?: boolean;
  };
}

export interface MCPResourceResult {
  type: "mcp-resource";
  data: {
    contents: Array<{
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string; // base64
    }>;
  };
}

export interface MCPPromptResult {
  type: "mcp-prompt";
  data: {
    description?: string;
    messages: Array<{
      role: "user" | "assistant";
      content: MCPContent;
    }>;
  };
}

export interface APICallResult {
  type: "api-call";
  data: {
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
  };
}

/**
 * MCP content types (text, image, embedded resource)
 */
export type MCPContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string } };

// =============================================================================
// Executor Interface
// =============================================================================

/**
 * IntegrationExecutor handles execution for a specific operation type.
 * Each executor manages its own connection pooling, error handling, and response normalization.
 */
export interface IntegrationExecutor {
  /** Operation types this executor handles */
  readonly supportedTypes: OperationType[];

  /**
   * Execute an operation
   * @throws IntegrationError on failure
   */
  execute(request: ExecuteOperationRequest): Promise<ExecuteOperationResponse>;

  /**
   * Check if this executor can handle an operation
   */
  canHandle(operationType: OperationType): boolean;
}
