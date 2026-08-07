/**
 * What the integrations service says it can actually do, right now, for this
 * user.
 *
 * `GET /api/integrations/capabilities` is the credential-aware endpoint, and it
 * is the only one that is. Measured 7 Aug 2026 on the running stack:
 *
 *   openai        status: unavailable   10 models declaring vision
 *   anthropic     status: available      7 models declaring vision
 *   huggingface   status: unavailable    3 models declaring vision
 *   symbia-labs   status: unavailable    0
 *
 * That table is the whole reason this module exists. `/api/integrations/status`
 * reports all four as `configured` because a config object is registered for
 * each; only `available` here means a credential resolved. Choosing a provider
 * from the wrong endpoint picks openai — first in the list, ten vision models,
 * no key — and fails with an error about the wrong provider entirely.
 */
import { useAuthStore } from '@/stores/authStore';

const INTEGRATIONS = '/svc/integrations/api/integrations';

export interface CapabilityModel {
  id: string;
  name?: string;
  capabilities?: string[];
}

export interface CapabilityProvider {
  provider: string;
  name?: string;
  /** 'available' means a credential resolved. Anything else means it did not. */
  status?: string;
  models?: CapabilityModel[];
}

export async function fetchCapabilities(): Promise<CapabilityProvider[]> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${INTEGRATIONS}/capabilities`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`capabilities returned ${res.status}`);
  const body = (await res.json()) as { providers?: CapabilityProvider[] };
  return body.providers ?? [];
}

/** Models declaring the vision capability, per provider, availability included. */
export function visionOptions(providers: CapabilityProvider[]): {
  provider: string;
  available: boolean;
  models: CapabilityModel[];
}[] {
  return providers.map((p) => ({
    provider: p.provider,
    available: p.status === 'available',
    models: (p.models ?? []).filter((m) => (m.capabilities ?? []).includes('vision')),
  }));
}
