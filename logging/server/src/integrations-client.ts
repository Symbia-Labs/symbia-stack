/**
 * Integrations Service Client (Server-Side)
 *
 * Client for calling the Symbia Integrations service from within
 * the Logging service. Used by the Log Assistant for LLM operations.
 */
import { resolveServiceUrl, ServiceId } from "@symbia/sys";

const INTEGRATIONS_SERVICE_URL = resolveServiceUrl(ServiceId.INTEGRATIONS);

/**
 * Helper to parse JSON response with proper typing
 */
async function parseJsonResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

// =============================================================================
// Types
// =============================================================================

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ExecuteParams {
  model?: string;
  messages?: ChatMessage[];
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
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
  finishReason: "stop" | "length" | "content_filter" | "error";
  metadata: Record<string, unknown>;
}

export interface ExecuteResponse {
  success: boolean;
  data?: NormalizedLLMResponse;
  error?: string;
  message?: string;
  requestId: string;
  durationMs: number;
}

interface IntegrationsStatusResponse {
  providers?: Array<{ name: string; configured: boolean }>;
}

// =============================================================================
// Client
// =============================================================================

/**
 * Execute a chat completion through the Integrations service
 *
 * @param authToken - User's auth token (JWT or session token)
 * @param provider - LLM provider (e.g., "openai", "anthropic")
 * @param messages - Chat messages
 * @param options - Optional parameters
 * @returns Normalized LLM response
 */
export async function executeChat(
  authToken: string,
  provider: string,
  messages: ChatMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    orgId?: string;
  }
): Promise<ExecuteResponse> {
  const url = `${INTEGRATIONS_SERVICE_URL}/api/integrations/execute`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
    "X-Service-Id": "logging",
  };

  if (options?.orgId) {
    headers["X-Org-Id"] = options.orgId;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider,
        operation: "chat.completions",
        params: {
          messages,
          model: options?.model,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
        },
      }),
    });

    const result = await parseJsonResponse<ExecuteResponse>(response);

    if (!response.ok && !result.requestId) {
      return {
        success: false,
        error: result.error || result.message || `HTTP ${response.status}`,
        requestId: result.requestId || "unknown",
        durationMs: 0,
      };
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to reach Integrations service: ${errorMessage}`,
      requestId: "network_error",
      durationMs: 0,
    };
  }
}

/**
 * Check if Integrations service is available and has configured providers
 */
export async function getIntegrationsStatus(): Promise<{
  available: boolean;
  providers: Array<{ name: string; configured: boolean }>;
}> {
  try {
    const response = await fetch(`${INTEGRATIONS_SERVICE_URL}/api/integrations/status`, {
      method: "GET",
      headers: {
        "X-Service-Id": "logging",
      },
    });

    if (!response.ok) {
      return { available: false, providers: [] };
    }

    const data = await parseJsonResponse<IntegrationsStatusResponse>(response);
    return {
      available: true,
      providers: data.providers || [],
    };
  } catch {
    return { available: false, providers: [] };
  }
}
