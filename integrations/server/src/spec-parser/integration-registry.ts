/**
 * Integration Registry
 *
 * Manages discovered integrations and provides operation lookup
 * via the namespace tree (e.g., integrations.openai.chat.completions.create).
 *
 * For LLM providers, operations are auto-discovered from the provider adapters
 * rather than being hardcoded. This ensures the registry stays in sync with
 * actual provider capabilities.
 */

import type {
  Integration,
  IntegrationOperation,
  IntegrationInvokeRequest,
  IntegrationInvokeResponse,
} from "@shared/schema.js";
import { fetchAndParseOpenAPI } from "./openapi-parser.js";
import { discoverMCPServer } from "./mcp-connector.js";
import { getProvider, getRegisteredProviders, type ProviderAdapter } from "../providers/base.js";

interface RegisteredIntegration {
  integration: Integration;
  operations: Map<string, IntegrationOperation>;
  namespace: Record<string, unknown>;
}

/**
 * Global integration registry
 */
class IntegrationRegistry {
  private integrations = new Map<string, RegisteredIntegration>();

  /**
   * Register an integration and discover its operations
   */
  async register(integration: Integration): Promise<{
    success: boolean;
    operationCount: number;
    error?: string;
  }> {
    try {
      let operations: IntegrationOperation[] = [];
      let namespace: Record<string, unknown> = {};

      // Discover operations based on type
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
        // Builtin integrations have operations pre-defined
        operations = integration.operations || [];
        namespace = integration.namespace || {};
      }

      // Build operation map for quick lookup
      const operationMap = new Map<string, IntegrationOperation>();
      for (const op of operations) {
        operationMap.set(op.id, op);
      }

      // Store the registered integration
      this.integrations.set(integration.key, {
        integration: {
          ...integration,
          operations,
          namespace,
          status: "active",
          lastSyncedAt: new Date().toISOString(),
        },
        operations: operationMap,
        namespace,
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
  unregister(key: string): boolean {
    return this.integrations.delete(key);
  }

  /**
   * Get a registered integration
   */
  get(key: string): Integration | undefined {
    return this.integrations.get(key)?.integration;
  }

  /**
   * Get all registered integrations
   */
  getAll(): Integration[] {
    return Array.from(this.integrations.values()).map(r => r.integration);
  }

  /**
   * Lookup an operation by namespace path
   * e.g., "integrations.openai.chat.completions.create"
   */
  lookupOperation(path: string): {
    integration: Integration;
    operation: IntegrationOperation;
  } | undefined {
    // Parse the path
    const parts = path.split(".");

    // Remove "integrations" prefix if present
    if (parts[0] === "integrations") {
      parts.shift();
    }

    if (parts.length < 2) {
      return undefined;
    }

    // First part is the integration key
    const integrationKey = parts.shift()!;
    const registered = this.integrations.get(integrationKey);
    if (!registered) {
      return undefined;
    }

    // Remaining parts form the operation path
    const operationPath = parts.join(".");

    // Look up in operation map
    const operation = registered.operations.get(operationPath);
    if (operation) {
      return { integration: registered.integration, operation };
    }

    // Try namespace tree lookup
    let current: unknown = registered.namespace;
    for (const part of parts) {
      if (current && typeof current === "object") {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    // Check if we found an operation reference
    if (current && typeof current === "object" && "_operation" in current) {
      const opId = (current as { _operation: string })._operation;
      const op = registered.operations.get(opId);
      if (op) {
        return { integration: registered.integration, operation: op };
      }
    }

    return undefined;
  }

  /**
   * Get the namespace tree for an integration
   */
  getNamespace(integrationKey: string): Record<string, unknown> | undefined {
    return this.integrations.get(integrationKey)?.namespace;
  }

  /**
   * Get the full namespace tree for all integrations
   */
  getFullNamespace(): Record<string, unknown> {
    const tree: Record<string, unknown> = {};

    for (const [key, registered] of this.integrations) {
      tree[key] = registered.namespace;
    }

    return { integrations: tree };
  }

  /**
   * List all operations for an integration
   */
  listOperations(integrationKey: string): IntegrationOperation[] {
    const registered = this.integrations.get(integrationKey);
    return registered ? Array.from(registered.operations.values()) : [];
  }

  /**
   * Search operations across all integrations
   */
  searchOperations(query: string): Array<{
    integrationKey: string;
    operation: IntegrationOperation;
  }> {
    const results: Array<{
      integrationKey: string;
      operation: IntegrationOperation;
    }> = [];

    const lowerQuery = query.toLowerCase();

    for (const [key, registered] of this.integrations) {
      for (const operation of registered.operations.values()) {
        const matches =
          operation.id.toLowerCase().includes(lowerQuery) ||
          operation.summary?.toLowerCase().includes(lowerQuery) ||
          operation.description?.toLowerCase().includes(lowerQuery) ||
          operation.tags?.some(t => t.toLowerCase().includes(lowerQuery));

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
  getOperationsByTag(tag: string): Array<{
    integrationKey: string;
    operation: IntegrationOperation;
  }> {
    const results: Array<{
      integrationKey: string;
      operation: IntegrationOperation;
    }> = [];

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
  async refresh(integrationKey: string): Promise<{
    success: boolean;
    operationCount: number;
    error?: string;
  }> {
    const registered = this.integrations.get(integrationKey);
    if (!registered) {
      return { success: false, operationCount: 0, error: "Integration not found" };
    }

    return this.register(registered.integration);
  }
}

// Singleton instance
export const integrationRegistry = new IntegrationRegistry();

/**
 * Operation metadata for known provider operations
 * This provides human-readable descriptions and parameter info
 * for operations discovered from provider adapters
 */
const OPERATION_METADATA: Record<string, Record<string, Partial<IntegrationOperation>>> = {
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
        { name: "tools", location: "body", required: false, description: "List of tools the model can call" },
      ],
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
        { name: "reasoning", location: "body", required: false, description: "Reasoning configuration for o-series models" },
      ],
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
        { name: "dimensions", location: "body", required: false, description: "Output dimensions (for ada-002+)" },
      ],
    },
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
        { name: "system", location: "body", required: false, description: "System prompt" },
      ],
    },
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
        { name: "contents", location: "body", required: true, description: "Content parts to process" },
      ],
    },
    "embeddings": {
      method: "POST",
      path: "/v1beta/models/{model}:embedContent",
      summary: "Embed content",
      description: "Generate embeddings for content",
      tags: ["embedding"],
      parameters: [
        { name: "model", location: "path", required: true, description: "Model ID" },
        { name: "content", location: "body", required: true, description: "Content to embed" },
      ],
    },
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
        { name: "messages", location: "body", required: true, description: "Array of messages" },
      ],
    },
    "embeddings": {
      method: "POST",
      path: "/embeddings",
      summary: "Create embeddings",
      description: "Generate embeddings via HuggingFace Inference API",
      tags: ["embedding"],
    },
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
        { name: "messages", location: "body", required: true, description: "Array of messages" },
      ],
    },
    "embeddings": {
      method: "POST",
      path: "/v1/embeddings",
      summary: "Create embeddings",
      description: "Generate embeddings with Mistral embed models",
      tags: ["embedding"],
    },
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
        { name: "chat_history", location: "body", required: false, description: "Previous messages" },
      ],
    },
    "embeddings": {
      method: "POST",
      path: "/v1/embed",
      summary: "Create embeddings",
      description: "Generate embeddings with Cohere embed models",
      tags: ["embedding"],
    },
  },
};

/**
 * Provider display metadata and OpenAPI spec URLs
 * When specUrl is provided, operations are auto-discovered from the actual spec
 */
const PROVIDER_METADATA: Record<string, {
  name: string;
  description: string;
  specUrl?: string;
  serverUrl?: string;
}> = {
  openai: {
    name: "OpenAI",
    description: "GPT-4o, o1, o3 reasoning models, DALL-E, Whisper, and more",
    // Live spec from Stainless platform (auto-updated)
    specUrl: "https://app.stainless.com/api/spec/documented/openai/openapi.documented.yml",
    serverUrl: "https://api.openai.com",
  },
  anthropic: {
    name: "Anthropic",
    description: "Claude 3.5 Sonnet, Opus, and Haiku",
    // Anthropic doesn't publish a public OpenAPI spec
  },
  google: {
    name: "Google AI",
    description: "Gemini 2.0 Flash and Pro models",
    // Google AI spec would need to be fetched differently
  },
  huggingface: {
    name: "Hugging Face",
    description: "Open source models via Inference API",
    // Hub API OpenAPI spec (models, datasets, spaces, inference)
    specUrl: "https://huggingface.co/.well-known/openapi.json",
    serverUrl: "https://huggingface.co",
  },
  mistral: {
    name: "Mistral AI",
    description: "Mistral Large, Medium, and Codestral",
    // Mistral spec has YAML parsing issues, fallback to adapter
  },
  cohere: {
    name: "Cohere",
    description: "Command R+ and embedding models",
    // Cohere spec URL no longer valid, fallback to adapter
  },
};

/**
 * Build operations from a provider adapter's supportedOperations
 */
function buildOperationsFromAdapter(providerName: string, adapter: ProviderAdapter): IntegrationOperation[] {
  const operations: IntegrationOperation[] = [];
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
      parameters: opMeta.parameters,
    });
  }

  // Always add a models.list operation
  operations.push({
    id: "models.list",
    operationId: "models.list",
    method: "GET",
    path: "/v1/models",
    summary: "List available models",
    description: `List models available from ${providerName}`,
    tags: ["models"],
  });

  return operations;
}

/**
 * Build namespace tree from operations
 */
function buildNamespaceFromOperations(operations: IntegrationOperation[]): Record<string, unknown> {
  const namespace: Record<string, unknown> = {};

  for (const op of operations) {
    const parts = op.id.split(".");
    let current = namespace;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = { _operation: op.id };
  }

  return namespace;
}

/**
 * Initialize builtin integrations
 *
 * For providers with OpenAPI specs, operations are auto-discovered from the actual spec.
 * For providers without specs, falls back to adapter's supportedOperations.
 */
export async function initializeBuiltinIntegrations(): Promise<void> {
  const registeredProviders = getRegisteredProviders();

  console.log(`[registry] Initializing builtin integrations from ${registeredProviders.length} providers`);

  for (const providerName of registeredProviders) {
    const adapter = getProvider(providerName);
    if (!adapter) continue;

    const providerMeta = PROVIDER_METADATA[providerName] || {
      name: providerName.charAt(0).toUpperCase() + providerName.slice(1),
      description: `${providerName} API`,
    };

    // If provider has an OpenAPI spec URL, fetch and parse it
    if (providerMeta.specUrl) {
      console.log(`[registry] Fetching OpenAPI spec for ${providerName} from ${providerMeta.specUrl}`);

      try {
        const result = await fetchAndParseOpenAPI({
          specUrl: providerMeta.specUrl,
          serverUrl: providerMeta.serverUrl,
        });

        if (result.success && result.operations.length > 0) {
          const integration: Integration = {
            id: `builtin-${providerName}`,
            key: providerName,
            name: providerMeta.name,
            description: providerMeta.description,
            type: "builtin",
            operations: result.operations,
            namespace: result.namespace,
            openapi: {
              specUrl: providerMeta.specUrl,
              serverUrl: providerMeta.serverUrl,
            },
            status: "active",
            version: 1,
          };

          const regResult = await integrationRegistry.register(integration);
          if (regResult.success) {
            console.log(`[registry] Registered ${providerName} with ${regResult.operationCount} operations from OpenAPI spec`);
          } else {
            console.error(`[registry] Failed to register ${providerName}:`, regResult.error);
          }
          continue;
        } else {
          console.warn(`[registry] Failed to parse OpenAPI spec for ${providerName}: ${result.error}, falling back to adapter`);
        }
      } catch (error) {
        console.warn(`[registry] Error fetching spec for ${providerName}:`, error, ", falling back to adapter");
      }
    }

    // Fallback: Build operations from adapter's supportedOperations
    const operations = buildOperationsFromAdapter(providerName, adapter);
    const namespace = buildNamespaceFromOperations(operations);

    const integration: Integration = {
      id: `builtin-${providerName}`,
      key: providerName,
      name: providerMeta.name,
      description: providerMeta.description,
      type: "builtin",
      operations,
      namespace,
      status: "active",
      version: 1,
    };

    const regResult = await integrationRegistry.register(integration);
    if (regResult.success) {
      console.log(`[registry] Registered ${providerName} with ${regResult.operationCount} operations from adapter: ${adapter.supportedOperations.join(", ")}`);
    } else {
      console.error(`[registry] Failed to register ${providerName}:`, regResult.error);
    }
  }
}
