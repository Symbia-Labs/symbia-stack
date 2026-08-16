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
  const q = f.q?.toLowerCase();
  return all
    .filter((o) => (f.service ? o.service === f.service : true))
    .filter((o) => (f.method ? o.method === f.method.toUpperCase() : true))
    .filter((o) => (f.includeWrites === false ? !o.writes : true))
    .filter((o) =>
      q
        ? [o.path, o.operationId, o.summary, o.description]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(q))
        : true
    )
    .slice(0, f.limit ?? 100);
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
