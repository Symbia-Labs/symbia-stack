/**
 * Integrations Service Client
 *
 * Client for calling the Integrations service to execute LLM operations.
 * This replaces direct calls to OpenAI and other providers.
 */

import { resolveServiceUrl, ServiceId } from "@symbia/sys";

const INTEGRATIONS_SERVICE_URL = resolveServiceUrl(ServiceId.INTEGRATIONS);

export interface LLMResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export interface InvokeLLMOptions {
  provider?: string;
  model?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  orgId?: string;
}

/**
 * Invoke an LLM via the Integrations service
 */
/**
 * Error thrown when authentication fails (token expired or invalid)
 */
export class TokenAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenAuthError';
  }
}

export async function invokeLLM(
  token: string,
  options: InvokeLLMOptions
): Promise<LLMResponse> {
  const {
    provider = "openai",
    model = "gpt-4o-mini",
    messages,
    temperature = 0.7,
    maxTokens = 1024,
    orgId,
  } = options;

  // LLM calls can take time - use a 45 second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    // Build headers with optional org context
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    };
    if (orgId) {
      headers["X-Org-Id"] = orgId;
    }

    const response = await fetch(`${INTEGRATIONS_SERVICE_URL}/api/integrations/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider,
        operation: "chat.completions",
        params: {
          model,
          messages,
          temperature,
          maxTokens,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      const errorMsg = error.error || response.statusText;

      // Detect auth errors and throw a specific error type
      if (response.status === 401 || errorMsg.includes('Invalid or expired token') || errorMsg.includes('Authentication required')) {
        throw new TokenAuthError(errorMsg);
      }

      throw new Error(`Integrations service error: ${errorMsg}`);
    }

    const result = await response.json() as {
      success: boolean;
      data?: {
        provider: string;
        model: string;
        content: string;
        usage: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        };
        finishReason: string;
      };
      error?: string;
    };

    if (!result.success || !result.data) {
      throw new Error(result.error || "LLM invocation failed");
    }

    return {
      content: result.data.content,
      model: result.data.model,
      usage: result.data.usage,
      finishReason: result.data.finishReason,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('LLM request timed out after 45 seconds');
    }
    throw error;
  }
}

/**
 * Check if Integrations service is available
 */
export async function isIntegrationsAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${INTEGRATIONS_SERVICE_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get available providers from Integrations service
 */
export async function getAvailableProviders(): Promise<Array<{ name: string; supportedOperations: string[] }>> {
  try {
    const response = await fetch(`${INTEGRATIONS_SERVICE_URL}/api/integrations/providers`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.providers || [];
  } catch {
    return [];
  }
}

// =============================================================================
// Embedding Operations
// =============================================================================

export interface InvokeEmbeddingOptions {
  provider?: string;
  model?: string;
  input: string | string[];
  dimensions?: number;
}

/**
 * Invoke embedding generation via the Integrations service
 * Returns a single embedding vector for the input text
 */
export async function invokeEmbedding(
  token: string,
  options: InvokeEmbeddingOptions
): Promise<number[]> {
  const {
    provider = "openai",
    model = "text-embedding-3-small",
    input,
    dimensions,
  } = options;

  // Embeddings are fast - 10 second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${INTEGRATIONS_SERVICE_URL}/api/integrations/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        provider,
        operation: "embeddings",
        params: {
          model,
          input: Array.isArray(input) ? input : [input],
          ...(dimensions && { dimensions }),
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      const errorMsg = error.error || response.statusText;

      if (response.status === 401 || errorMsg.includes('Invalid or expired token')) {
        throw new TokenAuthError(errorMsg);
      }

      throw new Error(`Embedding service error: ${errorMsg}`);
    }

    const result = await response.json() as {
      success: boolean;
      data?: {
        provider: string;
        model: string;
        embeddings: number[][];
        usage?: {
          promptTokens: number;
          totalTokens: number;
        };
      };
      error?: string;
    };

    if (!result.success || !result.data?.embeddings?.[0]) {
      throw new Error(result.error || "Embedding generation failed");
    }

    return result.data.embeddings[0];
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Embedding request timed out after 10 seconds');
    }
    throw error;
  }
}

/**
 * Invoke batch embedding generation
 * Returns multiple embedding vectors for array of inputs
 */
export async function invokeEmbeddingBatch(
  token: string,
  options: InvokeEmbeddingOptions
): Promise<number[][]> {
  const {
    provider = "openai",
    model = "text-embedding-3-small",
    input,
    dimensions,
  } = options;

  const inputs = Array.isArray(input) ? input : [input];

  // Batch embeddings - 30 second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${INTEGRATIONS_SERVICE_URL}/api/integrations/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        provider,
        operation: "embeddings",
        params: {
          model,
          input: inputs,
          ...(dimensions && { dimensions }),
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(`Embedding service error: ${error.error || response.statusText}`);
    }

    const result = await response.json() as {
      success: boolean;
      data?: {
        embeddings: number[][];
      };
      error?: string;
    };

    if (!result.success || !result.data?.embeddings) {
      throw new Error(result.error || "Batch embedding generation failed");
    }

    return result.data.embeddings;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Batch embedding request timed out after 30 seconds');
    }
    throw error;
  }
}
