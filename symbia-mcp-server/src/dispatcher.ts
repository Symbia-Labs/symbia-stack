/**
 * The dispatcher: 1:1 capability with the REST API, in three tools.
 *
 * Ruling 15 Aug 2026 (Brian): the MCP surface should have the same
 * capability as the REST API. Measured that day, the running stack exposes
 * **377 operations** across nine services (identity 93, logging 58,
 * integrations 47, catalog 40, assistants 40, network 37, messaging 28,
 * runtime 22, models 12). Registering one tool each would put every
 * description in every conversation's context, and — worse — would make
 * new platform capability invisible until the client reconnects, because
 * Claude Code does not refresh on `notifications/tools/list_changed` and
 * the desktop app caches `tools/list` indefinitely.
 *
 * So: three static tools that never change, over a list of operations read
 * from each service's own `/docs/openapi.json`. New endpoints appear in
 * `symbia_list_operations` results the moment a service serves them; the
 * tool list stays fixed. Capability hot-reload without protocol hot-reload.
 *
 * WHAT THE SPEC DOES NOT SAY, THIS CANNOT DO. An operation missing from a
 * service's OpenAPI is invisible here — which makes spec completeness and
 * agent capability the same measurement, and turns a documentation gap
 * into a countable capability gap. `directory` serves no spec at all
 * (measured 15 Aug); it is therefore absent, and says so.
 */
import type { ServiceId } from "@symbia/sys";

export interface OperationInfo {
  service: string;
  operationId: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  /** True for anything that is not GET/HEAD. */
  writes: boolean;
  /** DELETE, specifically — the one an agent should never reach for casually. */
  destructive: boolean;
  parameters?: unknown;
  requestBody?: unknown;
}

interface SpecCacheEntry {
  at: number;
  ops: OperationInfo[];
  error?: string;
}

const SPEC_TTL_MS = 60_000;
const cache = new Map<string, SpecCacheEntry>();

/** Operations a service declares, from its own spec. Cached briefly. */
export async function operationsFor(
  service: string,
  base: string,
  fetchJson: (url: string) => Promise<unknown>
): Promise<SpecCacheEntry> {
  const hit = cache.get(service);
  if (hit && Date.now() - hit.at < SPEC_TTL_MS) return hit;

  let entry: SpecCacheEntry;
  try {
    const spec = (await fetchJson(`${base}/docs/openapi.json`)) as {
      paths?: Record<string, Record<string, any>>;
      servers?: Array<{ url?: string }>;
    };
    const ops: OperationInfo[] = [];
    // A spec's server url may be a PATH PREFIX ("/api") or a whole ORIGIN
    // ("http://localhost:5007/api"). Only the path part is ours to keep:
    // the origin is wherever that service happened to be when the spec was
    // written, and prepending it to our own base produced
    // "/svc/integrationshttp://localhost:5007/..." — every integrations
    // operation unreachable (measured 16 Aug through the connector).
    const rawServer = (spec.servers?.[0]?.url ?? "").replace(/\/$/, "");
    const basePath = /^https?:\/\//i.test(rawServer)
      ? new URL(rawServer).pathname.replace(/\/$/, "")
      : rawServer;
    for (const [path, methods] of Object.entries(spec.paths ?? {})) {
      for (const [method, op] of Object.entries(methods)) {
        if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
        const m = method.toUpperCase();
        ops.push({
          service,
          operationId: op.operationId ?? `${method}${path.replace(/[^a-zA-Z0-9]+/g, "_")}`,
          method: m,
          // The spec's server prefix is part of the address; a path alone
          // is not callable, and guessing the prefix is how a dispatcher
          // silently 404s.
          path: basePath + path,
          summary: op.summary,
          description: op.description,
          writes: m !== "GET" && m !== "HEAD",
          destructive: m === "DELETE",
          parameters: op.parameters,
          requestBody: op.requestBody,
        });
      }
    }
    entry = { at: Date.now(), ops };
  } catch (err) {
    // A spec that could not be read is NOT an empty service. Recorded as
    // an error so the listing can say which services it failed to ask.
    entry = { at: Date.now(), ops: [], error: err instanceof Error ? err.message : String(err) };
  }
  cache.set(service, entry);
  return entry;
}

export interface ListFilter {
  service?: string;
  method?: string;
  /** Substring match over path, operationId, summary and description. */
  q?: string;
  /** Default false: reads only, unless writes are asked for. */
  includeWrites?: boolean;
  limit?: number;
}

export function filterOperations(all: OperationInfo[], f: ListFilter): OperationInfo[] {
  const q = f.q?.toLowerCase().trim();
  const scored = all
    .filter((o) => (f.service ? o.service === f.service : true))
    .filter((o) => (f.method ? o.method === f.method.toUpperCase() : true))
    .filter((o) => (f.includeWrites === false ? !o.writes : true))
    .slice(0, undefined);

  // ADDING A WORD MUST NOT NARROW TO NOTHING.
  //
  // This matched the whole query as one substring, so `q="message invoke
  // chat"` was looked for verbatim and found nowhere — while
  // post_webhook_message, summarised "Handle incoming message", sat in the
  // unfiltered list. Measured 16 Aug: an agent searching with synonyms got
  // zero results and nearly concluded the capability did not exist.
  //
  // A caller adding terms is describing the thing more fully, not
  // constraining it further. Score by how many terms hit and return
  // anything that matches at least one, best first.
  if (!q) return scored.slice(0, f.limit ?? 100);

  // Short words match everything. Measured: "send a message to an
  // assistant" returned every operation in the set, because "a" and "to"
  // are substrings of almost any path. Ranking still put the right one
  // first, but a list that includes everything has told the caller nothing.
  // Terms under three characters are dropped from matching; if that leaves
  // nothing, fall back to the whole query so a deliberate search for "id"
  // is not silently ignored.
  const words = q.split(/\s+/).filter(Boolean);
  const meaningful = words.filter((t) => t.length >= 3);
  const terms = meaningful.length ? meaningful : words;
  const hits = scored
    .map((o) => {
      const hay = [o.path, o.operationId, o.summary, o.description]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase());
      const matched = terms.filter((t) => hay.some((h) => h.includes(t)));
      return { o, score: matched.length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return hits.slice(0, f.limit ?? 100).map((x) => x.o);
}

/** Substitute `{id}`-style path params, and report any left unfilled. */
export function fillPath(
  path: string,
  params: Record<string, unknown> | undefined
): { path: string; missing: string[]; query: Record<string, unknown> } {
  const used = new Set<string>();
  const filled = path.replace(/\{([^}]+)\}/g, (_m, name: string) => {
    const v = params?.[name];
    if (v === undefined || v === null) return `{${name}}`;
    used.add(name);
    return encodeURIComponent(String(v));
  });
  const missing = [...filled.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  const query: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params ?? {})) if (!used.has(k)) query[k] = v;
  return { path: filled, missing, query };
}
