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
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

interface ProviderModel {
  id: string;
  name?: string;
  capabilities?: string[];
}

/**
 * Find a provider/model pair that claims to do vision.
 *
 * Two calls, both measured against the running service: `/status` lists
 * registered providers, `/providers/:p/models?capability=vision` filters by
 * declared capability and returns `{ models: [...] }`.
 *
 * NOTE what this does NOT establish: that the model is actually served, or
 * that a credential exists for it. Both only become knowable by making the
 * call, and both surface as a REFUSED with the upstream's own message rather
 * than being guessed at here.
 */
async function findVisionModel(): Promise<{ provider: string; model: string } | null> {
  const statusRes = await fetch(`${INTEGRATIONS}/status`, { headers: authHeaders() });
  if (!statusRes.ok) return null;
  const status = (await statusRes.json()) as {
    providers?: { name: string; registered?: boolean; configured?: boolean }[];
  };

  for (const p of status.providers ?? []) {
    // `registered` is the honest field; `configured` is its deprecated alias
    // and never meant a key exists. Neither tells us there is a credential —
    // that is why a failure here is reported, not prevented.
    if (!(p.registered ?? p.configured)) continue;
    try {
      const res = await fetch(
        `${INTEGRATIONS}/providers/${encodeURIComponent(p.name)}/models?capability=vision`,
        { headers: authHeaders() }
      );
      if (!res.ok) continue;
      const body = (await res.json()) as { models?: ProviderModel[] };
      const model = body.models?.[0];
      if (model?.id) return { provider: p.name, model: model.id };
    } catch {
      // A provider that cannot be asked is not a provider that said no. Move
      // on; the absence shows up as "no vision-capable model" below.
    }
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
      reason: 'No registered provider offers a model declaring the vision capability.',
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

    // The success envelope is normalised by the provider adapter to
    // { provider, model, content, usage, finishReason }. It may or may not be
    // nested under `result` depending on the route; both are read rather than
    // assumed, and an unreadable body is a REFUSED, not an empty description
    // presented as an answer.
    const inner = (body.result ?? body) as Record<string, unknown>;
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
