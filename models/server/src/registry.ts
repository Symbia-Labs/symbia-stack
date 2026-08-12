/**
 * The unified model registry — local and remote in one list.
 *
 * STAGE 0 OF MAKING THIS SERVICE A BROKER. Read-only. Nothing calls it yet and
 * it changes no behaviour: `/v1/models` returned `{"data": []}` before this and
 * now returns what the platform can actually see.
 *
 * WHY THIS SERVICE. Ruling 12 Aug 2026: the models service should handle all
 * exchanges with local and remote models, because model identity and
 * generation parameters change frequently and do not belong in a catalog
 * resource. CLAUDE.md had already ruled the same thing from the other side —
 * the catalog holds reusable items, never real-time point instances.
 *
 * That ruling was earned. On 12 Aug the assistants service was made to honour
 * the model configuration written on each assistant resource, and four
 * predictions broke: `temperature: 0.7`, a January value, is rejected outright
 * by claude-sonnet-5. **Whether a generation parameter is even legal depends on
 * the model**, an assistant cannot know that, and nothing in the assistants
 * service is positioned to — the model is chosen at call time by whichever
 * credential happens to exist. Only something holding the registry can know it.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not execute remote calls. Listing
 * a remote model here does NOT mean `/v1/chat/completions` can serve it —
 * that is stage 1. Every remote entry therefore carries `brokered: false`, so
 * the registry cannot be mistaken for a capability it does not have.
 * Registered is not running, and this codebase has been bitten by that twice
 * already (`server` on 5000, and this service reporting healthy with zero
 * models loaded).
 */

import { config } from "./config.js";
import { getEngine } from "./llama/engine.js";

/** Where a model runs. */
export type ModelSource = "local" | "remote";

/**
 * Whether this model can be used right now.
 *
 * `unknown` is a real answer and not a failure. Remote availability depends on
 * whether the CALLER'S ORG holds a credential, and `/v1/models` carries no org
 * context. Reporting `available` without checking would be the same class of
 * lie as telling an operator to add an API key they already had.
 */
export type Availability = "available" | "unavailable" | "unknown";

export interface RegistryEntry {
  id: string;
  source: ModelSource;
  provider: string;
  /** Can this service actually execute a call to it today? */
  brokered: boolean;
  availability: Availability;
  /** Why availability is what it is, in terms a person can act on. */
  availabilityReason: string;
  contextLength?: number;
  capabilities?: string[];
  operations?: string[];
  status?: string;
  createdAt?: string;
}

/**
 * Remote providers, from the integrations service.
 *
 * Uses `/api/integrations/providers`, which is unauthenticated and returns the
 * provider catalogue rather than per-org credential state. The endpoints that
 * know whether a credential exists — `/capabilities` and `/models` — require
 * auth, so per-org availability is only answerable when a caller presents a
 * token. See `remoteAvailability` below.
 */
async function remoteProviders(): Promise<RegistryEntry[]> {
  const url = `${config.integrationsServiceUrl}/api/integrations/providers`;
  let body: {
    providers?: Array<{
      name: string;
      defaultModel?: string;
      supportedOperations?: string[];
    }>;
  };

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) {
      // "I COULD NOT ASK" IS NOT "THERE ARE NONE".
      //
      // The same distinction resolveUsableProvider had to learn on 11 Aug: it
      // returned null on any non-2xx, and the caller rendered null as "you have
      // no API key" — a statement about the operator's configuration produced
      // by our own malformed request. An empty remote list here would say the
      // platform can reach no remote models, which is a different claim from
      // not having been able to ask.
      throw new Error(`${r.status} ${r.statusText}`);
    }
    body = await r.json();
  } catch (err) {
    console.warn(
      `[registry] could not reach integrations at ${url}: ${
        err instanceof Error ? err.message : String(err)
      } — remote models are UNLISTED, which is not the same as absent`
    );
    return [];
  }

  return (body.providers ?? []).map((p) => ({
    id: p.defaultModel ? `${p.name}/${p.defaultModel}` : p.name,
    source: "remote" as const,
    provider: p.name,
    // Stage 1 flips this. Until then, listing is not offering.
    brokered: false,
    availability: "unknown" as const,
    availabilityReason:
      "remote credentials are per-organisation; this listing carries no org context",
    operations: p.supportedOperations,
  }));
}

/** Local models, from the llama engine. */
async function localModels(): Promise<RegistryEntry[]> {
  try {
    const models = await getEngine().listModels();
    return models.map((m) => ({
      id: m.id,
      source: "local" as const,
      provider: config.providerName,
      brokered: true,
      // A local model is available when it is LOADED. The service reporting
      // healthy with zero models loaded is exactly why this distinction is
      // recorded rather than assumed.
      availability: m.status === "loaded" ? ("available" as const) : ("unavailable" as const),
      availabilityReason:
        m.status === "loaded" ? "loaded and serving" : `present but ${m.status ?? "not loaded"}`,
      contextLength: m.contextLength,
      capabilities: m.capabilities,
      status: m.status,
      createdAt: m.createdAt,
    }));
  } catch (err) {
    console.warn(
      `[registry] local engine unavailable: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }
}

/**
 * Everything the platform can see, local first.
 *
 * Local first because a local model that is loaded is the only entry in this
 * list that is both brokered and known-available — it is the honest default,
 * and it is the one the lean-deterministic argument depends on being reachable.
 */
export async function unifiedRegistry(): Promise<RegistryEntry[]> {
  const [local, remote] = await Promise.all([localModels(), remoteProviders()]);
  return [...local, ...remote];
}

/** Counts for `/api/stats` and for anyone asking what this service can see. */
export async function registrySummary() {
  const entries = await unifiedRegistry();
  return {
    total: entries.length,
    local: entries.filter((e) => e.source === "local").length,
    remote: entries.filter((e) => e.source === "remote").length,
    brokered: entries.filter((e) => e.brokered).length,
    available: entries.filter((e) => e.availability === "available").length,
  };
}
