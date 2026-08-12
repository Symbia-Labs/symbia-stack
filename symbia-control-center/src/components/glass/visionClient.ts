/**
 * Asking the platform to look at a frame.
 *
 * The spyglass used to POST pixels straight at the models service, which is the
 * one local path and refuses because no vision GGUF exists. Brian: connect it
 * to the HuggingFace integration "like in other areas". Other areas mean the
 * door assistants use — `POST /api/integrations/execute` — where the credential
 * is resolved from identity, the circuit breaker sits in front, and the call is
 * logged as usage. Reaching HuggingFace from the browser instead would produce
 * a working demo and destroy the point: a capability that entered without a
 * recorded gate.
 *
 * NO PROVIDER IS NAMED IN THIS FILE. The model is chosen by asking the
 * integrations service which registered providers offer a model declaring the
 * `vision` capability, and taking the first. Hardcoding "huggingface" here
 * would be the fourth place a provider name has been baked into this codebase,
 * and the previous three all had to be found and removed.
 *
 * WHAT THIS RETURNS is an arena, in the platform's own vocabulary. COMPOSED
 * when a model actually looked at the frame; REFUSED when it did not, with the
 * reason as the service gave it. There is no third outcome where something
 * plausible is returned on the basis of nothing.
 */
import { useAuthStore } from '@/stores/authStore';
import { useOrgStore } from '@/stores/orgStore';
import { fetchCapabilities, visionOptions } from './capabilities';
import { currentSelection } from './visionConfig';

const INTEGRATIONS = '/svc/integrations/api/integrations';

export interface VisionOutcome {
  arena: 'COMPOSED' | 'REFUSED';
  /** Present on COMPOSED. The model's own words. */
  description?: string;
  /** Present on REFUSED. The service's own words, never a paraphrase. */
  reason?: string;
  provider?: string;
  model?: string;
  /** Which door the answer came through, so the receipt can say. */
  path: 'integrations' | 'models' | 'none';
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  // The integrations gateway is org-scoped: without X-Org-Id it refuses with
  // "Organization context required" and the spyglass reads that as REFUSED
  // (observed 9 Aug). Every other client already sends it; this one didn't.
  const orgId = useOrgStore.getState().currentOrgId;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(orgId ? { 'X-Org-Id': orgId } : {}),
  };
}

/**
 * Find a provider/model pair that can actually do vision.
 *
 * An explicit choice from the Integrations panel wins. Otherwise: the first
 * provider reporting `available` — meaning a credential resolved — that offers
 * a model declaring `vision`.
 *
 * AVAILABILITY, NOT REGISTRATION. The first version of this walked
 * `/status`, which reports every provider with a registered config as
 * `configured`. Measured on the running stack, that picks **openai**: first in
 * the list, ten models declaring vision, and no credential. The whole feature
 * would have failed with an error naming a provider nobody had chosen and
 * nobody had configured. `/capabilities` is the only endpoint that knows.
 *
 * What this still does NOT establish: that the model is actually served by the
 * provider. That only becomes knowable by making the call, and it surfaces as
 * a REFUSED carrying the upstream's own message rather than being guessed at.
 */
async function findVisionModel(): Promise<{ provider: string; model: string } | null> {
  const chosen = currentSelection();
  if (chosen) return chosen;

  const providers = await fetchCapabilities();
  for (const p of visionOptions(providers)) {
    if (!p.available) continue;
    const model = p.models[0];
    if (model?.id) return { provider: p.provider, model: model.id };
  }
  return null;
}

/**
 * Send a frame through the integrations gateway.
 *
 * `image.description` rather than `chat.completions` on purpose: the operation
 * exists so the provider can reject a request that carries no image, instead of
 * returning a confident description of a picture it never received.
 */
export async function describeFrame(
  imageBase64: string,
  prompt = 'Describe what is in this image in one or two sentences. If it is a user interface, say what application or screen it appears to be.'
): Promise<VisionOutcome> {
  let target: { provider: string; model: string } | null = null;
  try {
    target = await findVisionModel();
  } catch (e) {
    return {
      arena: 'REFUSED',
      reason: `Could not ask the integrations service for a vision model: ${
        e instanceof Error ? e.message : String(e)
      }`,
      path: 'none',
    };
  }

  if (!target) {
    return {
      arena: 'REFUSED',
      reason:
        'No provider with a working credential offers a vision model. ' +
        'Configure one on the Integrations panel.',
      path: 'none',
    };
  }

  try {
    const res = await fetch(`${INTEGRATIONS}/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        provider: target.provider,
        operation: 'image.description',
        params: {
          model: target.model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: { url: `data:image/png;base64,${imageBase64}` },
                },
              ],
            },
          ],
          maxTokens: 200,
        },
      }),
    });

    const body = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      // The gateway's own error, verbatim. Its shape is measured:
      // { error, category, retryable, provider, operation, requestId }.
      const reason =
        typeof body.error === 'string' ? body.error : `Gateway returned ${res.status}.`;
      return {
        arena: 'REFUSED',
        reason,
        provider: target.provider,
        model: target.model,
        path: 'integrations',
      };
    }

    // MEASURED, not assumed. A successful /execute returns
    //   { success: true, data: { provider, model, content, usage, ... },
    //     requestId, durationMs }
    // This code originally read `body.result ?? body` and looked for
    // `.content`, which finds nothing in that envelope — every successful
    // vision call would have come back as "response containing no text", a
    // refusal caused entirely by the client misreading a correct answer.
    // Probing the endpoint once was what caught it. `result` is kept as a
    // fallback rather than removed, because it was never verified absent.
    const inner = (body.data ?? body.result ?? body) as Record<string, unknown>;
    const content = typeof inner.content === 'string' ? inner.content.trim() : '';

    if (!content) {
      return {
        arena: 'REFUSED',
        reason: 'The provider returned a response containing no text.',
        provider: target.provider,
        model: typeof inner.model === 'string' ? inner.model : target.model,
        path: 'integrations',
      };
    }

    return {
      arena: 'COMPOSED',
      description: content,
      provider: typeof inner.provider === 'string' ? inner.provider : target.provider,
      model: typeof inner.model === 'string' ? inner.model : target.model,
      path: 'integrations',
    };
  } catch (e) {
    return {
      arena: 'REFUSED',
      reason: e instanceof Error ? e.message : String(e),
      provider: target.provider,
      model: target.model,
      path: 'integrations',
    };
  }
}
