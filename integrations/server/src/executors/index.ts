/**
 * Integration Executors
 *
 * Provides a unified execution layer for all integration types:
 * - LLM providers (OpenAI, Anthropic, Google, etc.)
 * - MCP servers (tools, resources, prompts)
 * - OpenAPI endpoints (external and internal Symbia services)
 */

export {
  type OperationType,
  type ExecutionContext,
  type ExecuteOperationRequest,
  type ExecuteOperationResponse,
  type IntegrationExecutor,
  type LLMExecutionResult,
  type EmbeddingExecutionResult,
  type MCPToolResult,
  type MCPResourceResult,
  type MCPPromptResult,
  type APICallResult,
  type MCPContent,
  classifyOperation,
} from "./types.js";

export { providerExecutor, ProviderExecutor } from "./provider-executor.js";
export { mcpExecutor, MCPExecutor } from "./mcp-executor.js";
export { internalExecutor, InternalExecutor } from "./internal-executor.js";
export { openapiExecutor, OpenAPIExecutor } from "./openapi-executor.js";

import { providerExecutor } from "./provider-executor.js";
import { mcpExecutor } from "./mcp-executor.js";
import { internalExecutor } from "./internal-executor.js";
import { openapiExecutor } from "./openapi-executor.js";
import type { IntegrationExecutor, OperationType, ExecuteOperationRequest, ExecuteOperationResponse } from "./types.js";
import { classifyOperation } from "./types.js";
import { IntegrationError } from "../errors.js";
import type { IntegrationOperation } from "@shared/schema.js";
import { isInternalService } from "../internal-services.js";

/**
 * Unified API Call Executor
 *
 * Routes API calls to either the internal executor (for Symbia services)
 * or the OpenAPI executor (for external services) based on the integration.
 */
class APICallExecutor implements IntegrationExecutor {
  readonly supportedTypes: OperationType[] = ["api-call"];

  canHandle(operationType: OperationType): boolean {
    return this.supportedTypes.includes(operationType);
  }

  async execute(request: ExecuteOperationRequest): Promise<ExecuteOperationResponse> {
    // Route to appropriate executor based on integration type
    if (isInternalService(request.integrationKey)) {
      return internalExecutor.execute(request);
    } else {
      return openapiExecutor.execute(request);
    }
  }
}

const apiCallExecutor = new APICallExecutor();

// Registry of executors by operation type
const executorRegistry = new Map<OperationType, IntegrationExecutor>([
  ["llm", providerExecutor],
  ["embedding", providerExecutor],
  ["mcp-tool", mcpExecutor],
  ["mcp-resource", mcpExecutor],
  ["mcp-prompt", mcpExecutor],
  ["api-call", apiCallExecutor],
]);

/**
 * Execute an integration operation through the appropriate executor
 */
export async function executeOperation(
  request: ExecuteOperationRequest
): Promise<ExecuteOperationResponse> {
  const opType = classifyOperation(request.operation);
  const executor = executorRegistry.get(opType);

  if (!executor) {
    throw new IntegrationError({
      message: `No executor registered for operation type: ${opType}`,
      category: "not_found",
    });
  }

  return executor.execute(request);
}

/**
 * Get the executor for a specific operation type
 */
export function getExecutor(opType: OperationType): IntegrationExecutor | undefined {
  return executorRegistry.get(opType);
}

/**
 * Register a custom executor for an operation type
 */
export function registerExecutor(opType: OperationType, executor: IntegrationExecutor): void {
  executorRegistry.set(opType, executor);
}
