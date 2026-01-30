/**
 * Provider Executor
 *
 * Bridges the existing ProviderAdapter interface to the generalized executor model.
 * Handles LLM and embedding operations via provider adapters (OpenAI, Anthropic, etc.).
 */

import { getProvider } from "../providers/index.js";
import { getCredential } from "../credential-client.js";
import { IntegrationError, classifyProviderError } from "../errors.js";
import type {
  IntegrationExecutor,
  ExecuteOperationRequest,
  ExecuteOperationResponse,
  OperationType,
} from "./types.js";

export class ProviderExecutor implements IntegrationExecutor {
  readonly supportedTypes: OperationType[] = ["llm", "embedding"];

  canHandle(operationType: OperationType): boolean {
    return this.supportedTypes.includes(operationType);
  }

  async execute(request: ExecuteOperationRequest): Promise<ExecuteOperationResponse> {
    const { operation, integrationKey, params, context } = request;

    // Get provider adapter
    const adapter = getProvider(integrationKey);
    if (!adapter) {
      throw new IntegrationError({
        message: `Unknown provider: ${integrationKey}`,
        category: "not_found",
        provider: integrationKey,
      });
    }

    // Get credentials
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
        retryable: false,
      });
    }

    // Determine operation type from operation ID
    const operationId = operation.operationId || operation.id.split(".")[0];
    const isEmbedding = operationId === "embeddings" || operation.tags?.includes("embedding");

    // Validate params
    const validation = adapter.validateParams(operationId, params);
    if (!validation.valid) {
      throw new IntegrationError({
        message: `Invalid params: ${validation.errors?.join(", ")}`,
        category: "validation",
        provider: integrationKey,
        operation: operationId,
      });
    }

    try {
      if (isEmbedding) {
        if (!adapter.embed) {
          throw new IntegrationError({
            message: `${integrationKey} does not support embeddings`,
            category: "not_found",
            provider: integrationKey,
          });
        }

        const result = await adapter.embed({
          operation: operationId,
          model: params.model as string,
          params,
          apiKey: credential.apiKey,
          timeout: context.timeout,
        });

        return {
          type: "embedding",
          data: result,
        };
      } else {
        const result = await adapter.execute({
          operation: operationId,
          model: params.model as string,
          params,
          apiKey: credential.apiKey,
          timeout: context.timeout,
        });

        return {
          type: "llm",
          data: result,
        };
      }
    } catch (error) {
      throw classifyProviderError(error, integrationKey, operationId);
    }
  }
}

// Singleton instance
export const providerExecutor = new ProviderExecutor();
