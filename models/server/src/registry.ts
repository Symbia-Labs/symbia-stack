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
 * LISTING IS NOT OFFERING, AND `brokered` IS THE FIELD THAT SAYS WHICH.
 * A model appearing here does not mean `/v1/chat/completions` can serve it.
 * Registered is not running, and this codebase has been bitten by that twice
 * already (`server` on 5000, and this service reporting healthy with zero
 * models loaded).
 *
 * `brokered` is answered by `canBroker()` in remote.ts — the SAME list the chat
 * router uses to decide what to route. It read a hardcoded `false` for two
 * hours after stage 1 shipped execution, so the registry advertised no
 * capability while the capability existed. One fact in two places, drifting,
 * which is the defect shape this project keeps finding in code written months
 * ago; that instance was mine and two hours old.
 */

import { config } from "./config.js";
import { getEngine } from "./llama/engine.js";
import { canBroker } from "./remote.js";

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

/** A caller's credentials, forwarded rather than held. */
export interface AuthContext {
  token: string;
  orgId?: string;
}

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
  /**
   * Where this id came from.
   *
   * `measured` — the provider adapter listed it.
   * `provider-config` — configuration advertises it and nothing checked.
   * `local` — a file on disk.
   *
   * Recorded because the two remote sources DISAGREE: config says
   * `claude-sonnet-4-20250514`, the adapter says `claude-sonnet-5`, and the
   * adapter is what runs. An id whose provenance is unrecorded is how the
   * stale one gets copied forward.
   */
  idSource?: "measured" | "provider-config" | "local";
  /** False when the id is advertised rather than confirmed. */
  verified?: boolean;
  /** The adapter lists working models first; this is its head. */
  isProviderDefault?: boolean;
  /**
   * `sha256:<hex>` of the weights file. Local models only — a remote id has
   * no bytes this service can hash, and pretending otherwise would be an
   * `idSource: provider-config` claim wearing a checksum.
   */
  digest?: string;
  /**
   * Present when the file's digest and the catalog card's digest disagree.
   * Disclosed, not refused (ruling 15 Aug 2026): the load succeeds and this
   * field says what was loaded anyway. Ratchets to refusal when the pull
   * path lands and every card carries a digest —
   * docs/proposals/models-defect-closure.md stage 2.
   */
  digestMismatch?: { card: string; file: string };
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
async function remoteProviders(auth?: AuthContext): Promise<RegistryEntry[]> {
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

  const providers = body.providers ?? [];

  // MEASURED IDS WHEN WE CAN GET THEM, ADVERTISED ONES CLEARLY LABELLED WHEN
  // WE CANNOT.
  //
  // These two disagree, and the difference is not cosmetic:
  //
  //   /api/integrations/providers   anthropic -> claude-sonnet-4-20250514
  //   the anthropic adapter          anthropic -> claude-sonnet-5
  //
  // The first is a provider CONFIG registered in the catalog. The second is
  // `listModels()` in providers/anthropic.ts, ordered by what was measured to
  // answer on 7 Aug 2026 — and it is the one that actually runs: the
  // assistants log reads `resolved to anthropic (claude-sonnet-5)`.
  //
  // My first version of this registry published the config value, so a service
  // built to end stale model identity shipped a stale model id on its first
  // day. The adapter list needs a user token (integrations has no
  // service-token path), so when there is no token the id is reported as
  // ADVERTISED and `verified: false` rather than presented as fact.
  const entries = await Promise.all(
    providers.map(async (p) => {
      const measured = auth ? await measuredModels(p.name, auth) : null;

      if (measured && measured.length) {
        return measured.map((m, i) => ({
          id: `${p.name}/${m.id}`,
          source: "remote" as const,
          provider: p.name,
          brokered: canBroker(p.name),
          availability: "unknown" as const,
          availabilityReason:
            "listed by the provider adapter; whether this org holds a credential is a separate question",
          capabilities: m.capabilities,
          contextLength: m.contextWindow,
          operations: p.supportedOperations,
          idSource: "measured" as const,
          verified: true,
          // The adapter orders by what answered. First is the working default.
          isProviderDefault: i === 0,
        }));
      }

      return [
        {
          id: p.defaultModel ? `${p.name}/${p.defaultModel}` : p.name,
          source: "remote" as const,
          provider: p.name,
          // Stage 1 flipped this. It is now answered by the same list the
          // chat router uses, so "advertised as brokered" and "actually
          // routable" cannot drift apart.
          brokered: canBroker(p.name),
          availability: "unknown" as const,
          availabilityReason:
            "remote credentials are per-organisation; this listing carries no org context",
          operations: p.supportedOperations,
          idSource: "provider-config" as const,
          // The id above is what configuration ADVERTISES. It has not been
          // checked against the provider, and for anthropic it is known to
          // disagree with what runs.
          verified: false,
          isProviderDefault: true,
        },
      ];
    })
  );

  return entries.flat();
}

/**
 * A provider's models as its adapter reports them — the measured list.
 *
 * Requires the caller's token: integrations has no service-to-service auth
 * path, and `authMiddleware` rejects anything without a real user. That is why
 * an unauthenticated `/v1/models` cannot verify a model id, and says so instead
 * of pretending.
 */
async function measuredModels(
  provider: string,
  auth: AuthContext
): Promise<Array<{ id: string; capabilities?: string[]; contextWindow?: number }> | null> {
  const url = `${config.integrationsServiceUrl}/api/integrations/providers/${encodeURIComponent(
    provider
  )}/models`;
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${auth.token}` };
    if (auth.orgId) headers["X-Org-Id"] = auth.orgId;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const body = (await r.json()) as {
      models?: Array<{ id: string; capabilities?: string[]; contextWindow?: number }>;
    };
    return body.models ?? null;
  } catch (err) {
    console.warn(
      `[registry] could not list ${provider} models: ${
        err instanceof Error ? err.message : String(err)
      } — falling back to the ADVERTISED default, marked unverified`
    );
    return null;
  }
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
        m.status === "loaded"
          ? "loaded and serving"
          : m.status === "available"
            ? "present on disk, not loaded"
            : `present but ${m.status ?? "not loaded"}`,
      contextLength: m.contextLength,
      capabilities: m.capabilities,
      status: m.status,
      createdAt: m.createdAt,
      idSource: "local" as const,
      verified: true,
      digest: m.digest ? `sha256:${m.digest}` : undefined,
      digestMismatch: m.cardDigestMismatch,
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
export async function unifiedRegistry(auth?: AuthContext): Promise<RegistryEntry[]> {
  const [local, remote] = await Promise.all([localModels(), remoteProviders(auth)]);
  return [...local, ...remote];
}

/** Counts for `/api/stats` and for anyone asking what this service can see. */
export async function registrySummary(auth?: AuthContext) {
  const entries = await unifiedRegistry(auth);
  return {
    total: entries.length,
    local: entries.filter((e) => e.source === "local").length,
    remote: entries.filter((e) => e.source === "remote").length,
    brokered: entries.filter((e) => e.brokered).length,
    available: entries.filter((e) => e.availability === "available").length,
  };
}
