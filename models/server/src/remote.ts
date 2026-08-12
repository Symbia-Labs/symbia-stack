/**
 * Remote execution, delegated to integrations.
 *
 * STAGE 1 OF THE BROKER. This service can now execute a remote chat completion
 * — it does not hold a credential to do it. Integrations stays the vault;
 * models decides WHAT to call and WITH WHAT, and hands the call over.
 *
 * Ruling 12 Aug 2026, on where model configuration belongs: "the models service
 * should be handling all exchanges with local and remote models — these
 * configurations belong in config or runtime as they will change frequently."
 * Delegation, not absorption, was the explicit choice.
 *
 * Nothing calls this yet. Stage 3 switches `llm.invoke` over, gated on the
 * assistants walk staying at 11/11.
 */

import { config } from "./config.js";
import type { AuthContext } from "./registry.js";

export interface RemoteChatRequest {
  provider: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface RemoteChatResult {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens?: number };
  finishReason?: string;
  /** Parameters the broker refused to send, and why. */
  droppedParams: Array<{ param: string; reason: string }>;
}

/**
 * Parameters a model will not accept.
 *
 * THIS TABLE IS THE WHOLE REASON THE BROKER EXISTS.
 *
 * On 12 Aug the assistants service was made to send each assistant's declared
 * generation parameters. Four predictions broke immediately:
 *
 *   Anthropic API error: `temperature` is deprecated for this model.
 *
 * `temperature: 0.7` is a January value. claude-sonnet-5 rejects the parameter
 * outright. **Whether a parameter is even legal depends on the model**, an
 * assistant cannot know that, and nothing in the assistants service is
 * positioned to — the model is chosen at call time by whichever credential
 * exists. Only something holding the registry can know it.
 *
 * AND THE LESSON WAS ALREADY IN THE CODEBASE. `integrations-client.ts` carries
 * a comment dated 7 Aug 2026 recording this exact failure and the fix: only
 * send temperature when a caller chose one, "absent means absent". Five days
 * later I reintroduced a default from configuration and reproduced it. A rule
 * living in a comment beside one call site protects that call site and nothing
 * else. Here it is data, in the service that knows which model is being called.
 *
 * Matching is by prefix because providers version model ids by suffix
 * (`claude-sonnet-5`, `claude-opus-5`, `claude-haiku-4-5-20251001`) and the
 * constraint tracks the family, not the build.
 */
const UNSUPPORTED_PARAMS: Array<{
  modelPrefix: string;
  param: keyof RemoteChatRequest;
  reason: string;
}> = [
  {
    modelPrefix: "claude-sonnet-5",
    param: "temperature",
    reason: "Anthropic rejects `temperature` for this model (measured 12 Aug 2026)",
  },
  {
    modelPrefix: "claude-opus-5",
    param: "temperature",
    reason: "same family as claude-sonnet-5; not separately measured",
  },
];

/**
 * Strip what this model will not accept, and say what was stripped.
 *
 * Dropping silently would trade a provider error for a quiet behaviour change —
 * a caller asking for temperature 0 and getting the provider default with no
 * indication is worse than a clear failure, because it cannot be noticed.
 * Every drop is returned and belongs in the receipt.
 */
export function applyParameterRules(req: RemoteChatRequest): {
  request: RemoteChatRequest;
  dropped: Array<{ param: string; reason: string }>;
} {
  const request = { ...req };
  const dropped: Array<{ param: string; reason: string }> = [];

  for (const rule of UNSUPPORTED_PARAMS) {
    if (!req.model.startsWith(rule.modelPrefix)) continue;
    if (request[rule.param] === undefined) continue;
    delete request[rule.param];
    dropped.push({ param: String(rule.param), reason: rule.reason });
  }

  return { request, dropped };
}

/**
 * Execute a remote chat completion through integrations.
 *
 * The caller's token is FORWARDED. This service never reads, stores or logs a
 * credential — integrations resolves it, exactly as it does for the assistants
 * service today.
 */
export async function executeRemoteChat(
  req: RemoteChatRequest,
  auth: AuthContext
): Promise<RemoteChatResult> {
  const { request, dropped } = applyParameterRules(req);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth.token}`,
  };
  if (auth.orgId) headers["X-Org-Id"] = auth.orgId;

  const response = await fetch(`${config.integrationsServiceUrl}/api/integrations/execute`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider: request.provider,
      operation: "chat.completions",
      params: {
        model: request.model,
        messages: request.messages,
        // Absent means absent. Let the provider apply its own default rather
        // than inventing one — the habit that produced three separate failures
        // on 12 Aug: openai as a provider default, a stale model id, and a
        // temperature nobody asked for.
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { maxTokens: request.maxTokens } : {}),
      },
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(
      `integrations ${response.status}: ${(body as { error?: string }).error ?? response.statusText}`
    );
  }

  const result = (await response.json()) as {
    success: boolean;
    data?: {
      provider: string;
      model: string;
      content: string;
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
      finishReason?: string;
    };
    error?: string;
  };

  if (!result.success || !result.data) {
    throw new Error(result.error || "remote chat completion failed");
  }

  return {
    content: result.data.content,
    // WHAT ANSWERED, NOT WHAT WAS ASKED FOR. The provider reports the model it
    // actually used; a receipt naming the requested one would be describing an
    // intention rather than an event.
    model: result.data.model,
    usage: result.data.usage,
    finishReason: result.data.finishReason,
    droppedParams: dropped,
  };
}
