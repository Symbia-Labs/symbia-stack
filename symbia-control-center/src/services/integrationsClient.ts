/**
 * Integrations Service Client
 *
 * Client for the Symbia Integrations service - centralized gateway for third-party API traffic.
 * Supports LLM inference via OpenAI, HuggingFace, and other providers.
 */
import { useAuthStore } from '@/stores/authStore';
import { ORIGIN_HEADER, CLIENT_ORIGIN } from './origin';
import { useOrgStore } from '@/stores/orgStore';
import { getServiceUrl } from '@/config/services';

// =============================================================================
// Types
// =============================================================================

export type ProviderName = 'openai' | 'huggingface' | 'anthropic' | string;

export type OperationType = 'chat.completions' | 'text.generation' | 'embeddings' | string;

export interface Provider {
  name: string;
  baseUrl: string;
  defaultModel: string;
  supportedOperations: OperationType[];
}

export interface ProviderConfig {
  provider: string;
  baseUrl: string;
  defaultModel: string;
  supportedOperations: OperationType[];
  endpoints: Record<string, string>;
  headers?: Record<string, string>;
  models?: ModelInfo[];
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  provider?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  maxTokens?: number;  // Legacy alias
  capabilities?: string[];
  inputPricing?: number;
  outputPricing?: number;
  deprecated?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

export interface ExecuteParams {
  model?: string;
  messages?: ChatMessage[];
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  input?: string | string[];
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface NormalizedLLMResponse {
  provider: string;
  model: string;
  content: string;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
  metadata: Record<string, unknown>;
}

export interface NormalizedEmbeddingResponse {
  provider: string;
  model: string;
  embeddings: number[][];
  dimensions: number;
  usage: Omit<TokenUsage, 'completionTokens'> & { completionTokens?: number };
  metadata: Record<string, unknown>;
}

export interface ExecuteResponse {
  success: boolean;
  data?: NormalizedLLMResponse | NormalizedEmbeddingResponse;
  error?: string;
  requestId: string;
  durationMs: number;
}

export interface ProviderStatus {
  name: string;
  configured: boolean;
}

// =============================================================================
// Provider Capabilities Types (SOR)
// =============================================================================

export interface ProviderAccess {
  hasCredential: boolean;
  credentialSource: 'personal' | 'org-wide' | 'none';
  isEnabled: boolean;
  lastUsedAt: string | null;
}

export interface ProviderCapability {
  provider: string;
  name: string;
  description?: string;
  baseUrl: string;
  defaultModel: string;
  supportedOperations: string[];
  models: ModelInfo[];
  access: ProviderAccess;
  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
  };
  status: 'available' | 'unavailable' | 'degraded' | 'disabled';
  statusMessage?: string;
}

export interface ModelsByPurpose {
  chat: Array<{ provider: string; model: ModelInfo }>;
  embedding: Array<{ provider: string; model: ModelInfo }>;
  vision: Array<{ provider: string; model: ModelInfo }>;
  reasoning: Array<{ provider: string; model: ModelInfo }>;
}

export interface CapabilitiesResponse {
  providers: ProviderCapability[];
  byProvider: Record<string, ProviderCapability>;
  modelsByPurpose: ModelsByPurpose;
  defaults: {
    chatProvider?: string;
    chatModel?: string;
    embeddingProvider?: string;
    embeddingModel?: string;
  };
  fetchedAt: string;
}

// =============================================================================
// Integration Registry Types
// =============================================================================

export type IntegrationType = 'openapi' | 'mcp' | 'builtin' | 'custom';
export type IntegrationStatus = 'pending' | 'active' | 'error' | 'disabled';

export interface IntegrationAuth {
  type: 'bearer' | 'apiKey' | 'basic' | 'oauth2' | 'none';
  header?: string;
  credentialKey?: string;
  tokenUrl?: string;
  scopes?: string[];
}

export interface OperationParameter {
  name: string;
  location: 'path' | 'query' | 'header' | 'cookie' | 'body';
  required: boolean;
  description?: string;
  schema?: Record<string, unknown>;
  example?: unknown;
}

export interface IntegrationOperation {
  id: string;
  operationId?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  path?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: OperationParameter[];
  requestBody?: {
    required?: boolean;
    contentType: string;
    schema?: Record<string, unknown>;
  };
  responseSchema?: Record<string, unknown>;
  mcpTool?: {
    name: string;
    inputSchema: Record<string, unknown>;
  };
}

export interface OpenAPIConfig {
  specUrl?: string;
  spec?: Record<string, unknown>;
  version?: string;
  serverUrl?: string;
}

export interface MCPConfig {
  transport: 'stdio' | 'http' | 'websocket';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  serverUrl?: string;
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
}

export interface RateLimitConfig {
  requestsPerMinute?: number;
  requestsPerSecond?: number;
  tokensPerMinute?: number;
  concurrentRequests?: number;
}

export interface Integration {
  id: string;
  key: string;
  name: string;
  description?: string;
  type: IntegrationType;
  openapi?: OpenAPIConfig;
  mcp?: MCPConfig;
  auth?: IntegrationAuth;
  rateLimit?: RateLimitConfig;
  retry?: {
    maxRetries: number;
    backoffMs: number;
    backoffMultiplier: number;
  };
  operations?: IntegrationOperation[];
  namespace?: Record<string, unknown>;
  status: IntegrationStatus;
  lastSyncedAt?: string;
  syncError?: string;
  version: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface InvokeResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
  requestId: string;
  durationMs: number;
  operation: string;
  integration: string;
}

export interface ParseOpenAPIResult {
  success: boolean;
  operations?: IntegrationOperation[];
  namespace?: Record<string, unknown>;
  info?: { title: string; version: string; description?: string };
  authType?: string;
  serverUrl?: string;
  error?: string;
}

export interface ParseMCPResult {
  success: boolean;
  operations?: IntegrationOperation[];
  namespace?: Record<string, unknown>;
  capabilities?: MCPConfig['capabilities'];
  error?: string;
}

// =============================================================================
// Client
// =============================================================================

class IntegrationsClient {
  private getHeaders(): Record<string, string> {
    const token = useAuthStore.getState().token;
    const orgId = useOrgStore.getState().currentOrgId;

    const headers: Record<string, string> = {
      // Declared, not inferred. See services/origin.ts for why this
      // client's traffic carries the origin it does.
      [ORIGIN_HEADER]: CLIENT_ORIGIN.integrations,
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (orgId) {
      headers['X-Org-Id'] = orgId;
    }

    return headers;
  }

  private getBaseUrl(): string {
    return `${getServiceUrl('integrations')}/api/integrations`;
  }

  // ===========================================================================
  // Providers
  // ===========================================================================

  /**
   * List all available LLM providers
   */
  async listProviders(): Promise<Provider[]> {
    const response = await fetch(`${this.getBaseUrl()}/providers`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to list providers' }));
      throw new Error(error.message || error.error);
    }

    const data = await response.json();
    return data.providers || [];
  }

  /**
   * Get detailed configuration for a specific provider
   */
  async getProvider(provider: ProviderName): Promise<ProviderConfig> {
    const response = await fetch(`${this.getBaseUrl()}/providers/${provider}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: `Failed to get provider: ${provider}` }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  /**
   * Get available models for a provider
   * @param provider - The provider name
   * @param options - Optional filtering options
   * @param options.capability - Filter by capability ('chat', 'embedding', 'vision', etc.)
   * @param options.purpose - Filter by purpose ('llm' or 'embedding')
   */
  async getProviderModels(
    provider: ProviderName,
    options?: { capability?: string; purpose?: 'llm' | 'embedding' }
  ): Promise<ModelInfo[]> {
    const params = new URLSearchParams();
    if (options?.capability) {
      params.set('capability', options.capability);
    } else if (options?.purpose === 'llm') {
      params.set('capability', 'chat,reasoning');
    } else if (options?.purpose === 'embedding') {
      params.set('capability', 'embedding');
    }

    const queryString = params.toString();
    const url = `${this.getBaseUrl()}/providers/${provider}/models${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: `Failed to get models for: ${provider}` }));
      throw new Error(error.message || error.error);
    }

    const data = await response.json();
    return data.models || [];
  }

  /**
   * Get all models across all providers
   * @param options - Optional filtering options
   * @param options.capability - Filter by capability ('chat', 'embedding', 'vision', etc.)
   * @param options.purpose - Filter by purpose ('llm' or 'embedding')
   */
  async getAllModels(
    options?: { capability?: string; purpose?: 'llm' | 'embedding' }
  ): Promise<{ models: Record<string, ModelInfo[]>; all: ModelInfo[] }> {
    const params = new URLSearchParams();
    if (options?.capability) {
      params.set('capability', options.capability);
    } else if (options?.purpose) {
      params.set('purpose', options.purpose);
    }

    const queryString = params.toString();
    const url = `${this.getBaseUrl()}/models${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get models' }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  /**
   * Get LLM models (chat/reasoning capable) for a provider
   */
  async getLLMModels(provider: ProviderName): Promise<ModelInfo[]> {
    return this.getProviderModels(provider, { purpose: 'llm' });
  }

  /**
   * Get embedding models for a provider
   */
  async getEmbeddingModels(provider: ProviderName): Promise<ModelInfo[]> {
    return this.getProviderModels(provider, { purpose: 'embedding' });
  }

  // ===========================================================================
  // Execute
  // ===========================================================================

  /**
   * Execute an LLM request through the integrations gateway
   */
  async execute(
    provider: ProviderName,
    operation: OperationType,
    params: ExecuteParams
  ): Promise<ExecuteResponse> {
    const response = await fetch(`${this.getBaseUrl()}/execute`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        provider,
        operation,
        params,
      }),
    });

    const result = await response.json();

    if (!response.ok && !result.requestId) {
      throw new Error(result.error || result.message || 'Failed to execute request');
    }

    return result;
  }

  /**
   * Convenience method for chat completions
   */
  async chat(
    provider: ProviderName,
    messages: ChatMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<ExecuteResponse> {
    return this.execute(provider, 'chat.completions', {
      messages,
      model: options?.model,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
  }

  /**
   * Convenience method for text generation
   */
  async generate(
    provider: ProviderName,
    prompt: string,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<ExecuteResponse> {
    return this.execute(provider, 'text.generation', {
      prompt,
      model: options?.model,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
  }

  /**
   * Convenience method for embeddings
   */
  async embed(
    provider: ProviderName,
    input: string | string[],
    options?: {
      model?: string;
    }
  ): Promise<ExecuteResponse> {
    return this.execute(provider, 'embeddings', {
      input,
      model: options?.model,
    });
  }

  // ===========================================================================
  // Capabilities (SOR - Source of Record)
  // ===========================================================================

  /**
   * Get comprehensive provider capabilities (SOR endpoint)
   *
   * This is the authoritative source for:
   * - All available providers with their supported operations
   * - All models for each provider (with capabilities)
   * - User's access status for each provider
   * - Models grouped by purpose (chat, embedding, vision, reasoning)
   *
   * Use this instead of individual provider/model fetches for UI components.
   */
  async getCapabilities(): Promise<CapabilitiesResponse> {
    const response = await fetch(`${this.getBaseUrl()}/capabilities`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get capabilities' }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  /**
   * Get available providers for a specific purpose (convenience method)
   * Returns only providers that have credentials configured and models for that purpose
   */
  async getAvailableProvidersForPurpose(purpose: 'chat' | 'embedding' | 'vision' | 'reasoning'): Promise<ProviderCapability[]> {
    const capabilities = await this.getCapabilities();
    return capabilities.providers.filter(p =>
      p.access.hasCredential &&
      p.models.some(m => m.capabilities?.includes(purpose === 'chat' ? 'chat' : purpose))
    );
  }

  /**
   * Get models for a specific purpose across all available providers
   * Returns models sorted by provider preference
   */
  async getModelsForPurpose(purpose: 'chat' | 'embedding' | 'vision' | 'reasoning'): Promise<Array<{ provider: string; model: ModelInfo }>> {
    const capabilities = await this.getCapabilities();
    return capabilities.modelsByPurpose[purpose].filter(m => {
      const providerCap = capabilities.byProvider[m.provider];
      return providerCap?.access.hasCredential;
    });
  }

  // ===========================================================================
  // Status
  // ===========================================================================

  /**
   * Get integrations service status
   */
  async getStatus(): Promise<{ status: string; providers: ProviderStatus[] }> {
    const response = await fetch(`${this.getBaseUrl()}/status`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get integrations status');
    }

    return response.json();
  }

  // ===========================================================================
  // Integration Registry
  // ===========================================================================

  /**
   * List all registered integrations
   */
  async listIntegrations(): Promise<Integration[]> {
    const response = await fetch(`${this.getBaseUrl()}/registry`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to list integrations' }));
      throw new Error(error.message || error.error);
    }

    const data = await response.json();
    return data.integrations || [];
  }

  /**
   * Get a specific integration
   */
  async getIntegration(key: string): Promise<Integration> {
    const response = await fetch(`${this.getBaseUrl()}/registry/${key}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: `Failed to get integration: ${key}` }));
      throw new Error(error.message || error.error);
    }

    const data = await response.json();
    return data.integration;
  }

  /**
   * Get operations for an integration
   */
  async getIntegrationOperations(key: string): Promise<IntegrationOperation[]> {
    const response = await fetch(`${this.getBaseUrl()}/registry/${key}/operations`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: `Failed to get operations for: ${key}` }));
      throw new Error(error.message || error.error);
    }

    const data = await response.json();
    return data.operations || [];
  }

  /**
   * Register a new integration
   */
  async registerIntegration(integration: Partial<Integration>): Promise<{
    success: boolean;
    integration?: Integration;
    operationCount?: number;
    error?: string;
  }> {
    const response = await fetch(`${this.getBaseUrl()}/register`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(integration),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to register integration' };
    }

    return {
      success: true,
      integration: data.integration,
      operationCount: data.operationCount,
    };
  }

  /**
   * Refresh an integration (re-fetch spec and update operations)
   */
  async refreshIntegration(key: string): Promise<{
    success: boolean;
    integration?: Integration;
    operationCount?: number;
    error?: string;
  }> {
    const response = await fetch(`${this.getBaseUrl()}/registry/${key}/refresh`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to refresh integration' };
    }

    return {
      success: true,
      integration: data.integration,
      operationCount: data.operationCount,
    };
  }

  /**
   * Parse an OpenAPI spec (preview before registering)
   */
  async parseOpenAPISpec(config: OpenAPIConfig): Promise<ParseOpenAPIResult> {
    const response = await fetch(`${this.getBaseUrl()}/parse/openapi`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(config),
    });

    return response.json();
  }

  /**
   * Discover an MCP server (preview before registering)
   */
  async parseMCPServer(config: MCPConfig): Promise<ParseMCPResult> {
    const response = await fetch(`${this.getBaseUrl()}/parse/mcp`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(config),
    });

    return response.json();
  }

  /**
   * Get the full namespace tree
   */
  async getNamespace(): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.getBaseUrl()}/namespace`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get namespace' }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  /**
   * Search operations across all integrations
   */
  async searchOperations(query: string): Promise<{ results: Array<{ integration: string; operation: IntegrationOperation }> }> {
    const response = await fetch(`${this.getBaseUrl()}/operations/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Search failed' }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  /**
   * Get operations by tag
   */
  async getOperationsByTag(tag: string): Promise<{ results: Array<{ integration: string; operation: IntegrationOperation }> }> {
    const response = await fetch(`${this.getBaseUrl()}/operations/search?tag=${encodeURIComponent(tag)}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Search failed' }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  /**
   * Invoke any integration operation
   */
  async invoke(
    operation: string,
    options?: {
      params?: Record<string, unknown>;
      body?: unknown;
      headers?: Record<string, string>;
      timeout?: number;
    }
  ): Promise<InvokeResponse> {
    const response = await fetch(`${this.getBaseUrl()}/invoke`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        operation,
        params: options?.params,
        body: options?.body,
        headers: options?.headers,
        timeout: options?.timeout,
      }),
    });

    return response.json();
  }
}

export const integrationsClient = new IntegrationsClient();
