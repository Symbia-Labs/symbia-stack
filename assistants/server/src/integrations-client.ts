/**
 * Integrations Service Client
 *
 * Client for calling the Integrations service to execute LLM operations.
 * This replaces direct calls to OpenAI and other providers.
 */

import { resolveServiceUrl, ServiceId } from "@symbia/sys";

const INTEGRATIONS_SERVICE_URL = resolveServiceUrl(ServiceId.INTEGRATIONS);
const MODELS_SERVICE_URL = resolveServiceUrl(ServiceId.MODELS);

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

/**
 * Run a completion through the MODELS SERVICE — stage 3 of the broker.
 *
 * Same call, one hop earlier. Instead of assistants posting straight to
 * integrations, it asks the models service, which knows things this service
 * cannot:
 *
 *   WHETHER A PARAMETER IS EVEN LEGAL FOR THE MODEL BEING CALLED.
 *
 * Measured 12 Aug 2026: sending `temperature: 0.7` — a January value — to
 * claude-sonnet-5 fails outright ("`temperature` is deprecated for this
 * model") and broke four predictions. The assistant cannot know that, and
 * nothing here is positioned to: the model is chosen at call time by whichever
 * credential exists. The registry knows, so the rule lives with the registry.
 *
 * WHAT THIS DELIBERATELY DOES NOT MOVE. Provider selection stays here, still
 * answered by `resolveUsableProvider` asking integrations which credential
 * exists. Moving execution and resolution in one change would make a broken
 * seal indistinguishable from a broken merge — the same reason the config work
 * on 12 Aug was split. Resolution is a later stage.
 *
 * Credentials are untouched by both services: the caller's token is forwarded
 * to models, which forwards it to integrations, which holds the key.
 */
async function invokeViaModels(
  token: string,
  options: InvokeLLMOptions
): Promise<LLMResponse> {
  const { provider = 'openai', model = 'gpt-4o-mini', messages, temperature, maxTokens, orgId } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (orgId) headers['X-Org-Id'] = orgId;

  const response = await fetch(`${MODELS_SERVICE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      // The registry publishes remote models as `provider/model`, and the chat
      // router splits on exactly that.
      model: `${provider}/${model}`,
      messages,
      // Absent means absent, still. The broker will strip what the model
      // rejects; it should not have to strip what nobody asked for.
      ...(temperature !== undefined ? { temperature } : {}),
      ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    const msg = body.error?.message || response.statusText;
    if (response.status === 401) throw new TokenAuthError(msg);
    throw new Error(`Models service error: ${msg}`);
  }

  const result = (await response.json()) as {
    model: string;
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    symbia?: { droppedParams?: Array<{ param: string; reason: string }> };
  };

  const dropped = result.symbia?.droppedParams ?? [];
  if (dropped.length) {
    // Surfaced rather than swallowed. A caller that asked for temperature 0 and
    // silently got the provider default could never find out.
    console.log(
      `[llm.invoke] models dropped ${dropped.map((d) => d.param).join(', ')} for ${result.model}: ` +
        dropped.map((d) => d.reason).join('; ')
    );
  }

  return {
    content: result.choices?.[0]?.message?.content ?? '',
    model: result.model,
    usage: {
      promptTokens: result.usage?.prompt_tokens ?? 0,
      completionTokens: result.usage?.completion_tokens ?? 0,
      totalTokens: result.usage?.total_tokens ?? 0,
    },
    finishReason: result.choices?.[0]?.finish_reason ?? 'stop',
  };
}

export async function invokeLLM(
  token: string,
  options: InvokeLLMOptions
): Promise<LLMResponse> {
  // BROKERED BY DEFAULT, WITH A WAY BACK.
  //
  // Stage 3 routes completions through the models service. `LLM_VIA_MODELS=0`
  // restores the direct integrations call — kept because this is a boundary
  // change to a path that works, and a switch that can be flipped without a
  // rebuild is worth more than confidence.
  if (process.env.LLM_VIA_MODELS !== '0') {
    return invokeViaModels(token, options);
  }
  return invokeViaIntegrations(token, options);
}

async function invokeViaIntegrations(
  token: string,
  options: InvokeLLMOptions
): Promise<LLMResponse> {
  const {
    provider = "openai",
    model = "gpt-4o-mini",
    messages,
    temperature,
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
          // Only sent when a caller actually chose one.
          //
          // This defaulted to 0.7 and was injected into every request. Newer
          // Anthropic models REJECT it: "`temperature` is deprecated for this
          // model" -- measured 7 Aug 2026, after the model name itself was
          // fixed. A default nobody asked for turned into a hard failure at
          // the provider, and the third distinct symptom of the same habit
          // today: openai as a provider default, a stale model list, and this.
          //
          // Absent means absent. Let the provider apply its own default.
          ...(temperature !== undefined ? { temperature } : {}),
          maxTokens,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
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
    const data = await response.json() as { providers?: Array<{ name: string; supportedOperations: string[] }> };
    return data.providers || [];
  } catch {
    return [];
  }
}

/** A provider that actually has a usable credential, and a model to use with it. */
export interface UsableProvider {
  provider: string;
  model: string;
}

/**
 * Default model per provider, used only when nothing more specific is configured.
 * Kept beside the resolver so the two cannot disagree.
 */
const DEFAULT_MODEL: Record<string, string> = {
  openai: 'gpt-4o-mini',
  // Verified against the live /v1/models list on 7 Aug 2026. The two values
  // this replaced -- claude-sonnet-4-20250514 (from the provider adapter) and
  // claude-3-5-sonnet-20241022 (from the catalog resource) -- were BOTH
  // rejected by the API as nonexistent. Static model lists go stale silently
  // and present as "your key does not work"; asking the provider is the only
  // thing that does not rot. This map is a fallback, not a source of truth.
  anthropic: 'claude-sonnet-5',
  huggingface: 'meta-llama/Llama-3.2-3B-Instruct',
  'symbia-labs': 'llama-3-2-1b-instruct-q4-k-m',
};

/**
 * Ask which provider can actually be used, instead of assuming one.
 *
 * This replaces a hardcoded `'openai'` default that appeared in three separate
 * places in this service. The effect of that default, measured 7 Aug 2026:
 * an operator added an Anthropic key, the Coordinator was configured for
 * anthropic in the catalog, and every chat message still resolved to openai,
 * looked up a key that did not exist, and failed. The console showed a typing
 * indicator and then nothing. Adding the correct key changed nothing visible,
 * because the wrong provider was being asked for.
 *
 * A default that is silently wrong is worse than no default. This one asks the
 * Integrations service which providers report a credential and takes the first,
 * so the stack works with whichever key is present — including the local
 * keyless model — and says so plainly when none is.
 *
 * `status: 'available'` here means Integrations resolved a credential (or the
 * provider is local and needs none). It is not a claim that the provider will
 * answer correctly.
 */
export async function resolveUsableProvider(
  token: string,
  orgId?: string
): Promise<UsableProvider | null> {
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (orgId) headers['X-Org-Id'] = orgId;

    const response = await fetch(
      `${INTEGRATIONS_SERVICE_URL}/api/integrations/capabilities`,
      { headers }
    );

    // "I COULD NOT ASK" IS NOT "THE ANSWER IS NONE".
    //
    // This returned null on any non-2xx, and the caller renders null as "No
    // LLM provider has a usable credential. Add an API key in Settings." So a
    // 400 from our own malformed request — no org context — reached the person
    // in the chat window as a statement about THEIR configuration, and sent
    // them to Settings to add a key that was already there.
    //
    // Measured 11 Aug 2026: an agent token with no X-Org-Id gets 400 from
    // integrations, and the operator is told they have no API key.
    //
    // Throwing separates the two. A failed request is an error with a status
    // on it; `null` now means only what it says — the service answered, and
    // no provider reported a credential.
    if (!response.ok) {
      throw new Error(
        `Could not ask Integrations which providers are usable: ` +
          `${response.status} ${response.statusText}. This is a request failure, ` +
          `not a statement about configured credentials.`
      );
    }

    const data = (await response.json()) as {
      providers?: Array<{ provider: string; status?: string; defaultModel?: string }>;
    };

    const usable = (data.providers ?? []).find((p) => p.status === 'available');
    if (!usable) return null;

    // DEFAULT_MODEL first, provider config second.
    //
    // Measured 7 Aug: taking the provider's advertised defaultModel gave
    // anthropic `claude-sonnet-4-20250514`, which the Anthropic API rejects —
    // "Anthropic API error: model: claude-sonnet-4-20250514". The advertised
    // list in integrations/server/src/providers/anthropic.ts is static config
    // and is not checked against what a given key can actually call.
    //
    // So the local map wins, and the advertised value is the fallback rather
    // than the source. This does not make the map correct forever; it makes
    // the failure recoverable, and the error above is now surfaced verbatim in
    // the chat window rather than swallowed.
    return {
      provider: usable.provider,
      model: DEFAULT_MODEL[usable.provider] || usable.defaultModel || 'gpt-4o-mini',
    };
  } catch (error) {
    // The throw above is deliberate and must not be swallowed here — this
    // `catch` existed to turn a guess into a null, and it would quietly undo
    // the distinction it was just given.
    //
    // Anything else (the service unreachable, a malformed body) is also a
    // failure to ASK, not an answer of "none". Both propagate, so the chat
    // window says what actually went wrong instead of blaming the operator's
    // Settings page.
    throw error instanceof Error
      ? error
      : new Error(`Could not reach Integrations to resolve a provider: ${String(error)}`);
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
      const error = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
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
      const error = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
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
