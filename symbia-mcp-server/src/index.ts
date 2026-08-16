#!/usr/bin/env node
/**
 * symbia-mcp-server — MCP access to the locally running Symbia stack.
 *
 * Read-only tools over the services registered in @symbia/sys, on localhost.
 * The service list is NOT restated here — it is read from the registry, so a
 * service cannot be swept by this tool without being registered, and cannot
 * linger here after being removed.
 *
 * Authenticates against the Identity service with SYMBIA_EMAIL /
 * SYMBIA_PASSWORD (SYMBIA_PASSWORD is required).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ServicePorts, RunningServices, type ServiceId } from "@symbia/sys";
import {
  operationsFor, filterOperations, fillPath, type OperationInfo,
} from "./dispatcher.js";

// Auth, token-first (14 Aug 2026). SYMBIA_TOKEN is a pre-issued bearer — an
// Identity API key or a session token — and is the preferred path: no password
// in the MCP config, matching the wallet model and the .mcp.json integrations
// entry. SYMBIA_EMAIL/SYMBIA_PASSWORD is the legacy login flow, kept as a
// local-dev fallback only.
// SYMBIA_SESSION_TOKEN is the best path: a long-lived session token (minted via
// POST /api/auth/session) that this server resolves to a fresh short-lived JWT —
// revocable server-side, refreshable, no password. SYMBIA_TOKEN is a direct
// pre-issued bearer (API key). SYMBIA_PASSWORD is the legacy login fallback.
const SESSION_TOKEN = process.env.SYMBIA_SESSION_TOKEN;
const TOKEN = process.env.SYMBIA_TOKEN;
const EMAIL = process.env.SYMBIA_EMAIL ?? "gap-probe@symbia.test";
const PASSWORD = process.env.SYMBIA_PASSWORD;
if (!SESSION_TOKEN && !TOKEN && !PASSWORD) {
  console.error(
    "No credentials configured. Set one of (preferred first):\n" +
      "  SYMBIA_SESSION_TOKEN — a session token (POST /api/auth/session), revocable, no password\n" +
      "  SYMBIA_TOKEN         — a pre-issued bearer / API key\n" +
      "  SYMBIA_PASSWORD      — legacy email/password login (local dev)",
  );
  process.exit(1);
}
const HOST = process.env.SYMBIA_HOST ?? "localhost";
const CHARACTER_LIMIT = 25000;

// Derived from @symbia/sys. This was a hand-maintained map keyed by service
// name with its own copy of every port, in a tool whose entire job is to
// report the truth about a running stack — so a port change made it confidently
// wrong rather than obviously broken. `network: 5054` outlived the move to
// 5009 in exactly that way.
//
// RunningServices excludes `server`, which is registered but never listens.
const PORTS: Record<ServiceId, number> = Object.fromEntries(
  RunningServices.map((id) => [id, ServicePorts[id]])
) as Record<ServiceId, number>;
type ServiceName = ServiceId;

/**
 * Where a service answers.
 *
 * Two arrangements, one rule — ADDRESS BY ID, NEVER BY PORT (CLAUDE.md).
 * This file kept a port map and so could only ever talk to a stack where
 * every service owns a port. `SYMBIA_BASE_URL` switches it to the
 * one-origin form the console has always used, `<base>/svc/<id>`, which
 * is what the headless imagine sidecar serves: every service in one
 * process behind one origin.
 *
 *   SYMBIA_BASE_URL=http://localhost:7100  ->  http://localhost:7100/svc/catalog/api/…
 *   unset                                  ->  http://localhost:5003/api/…
 */
const BASE_URL = process.env.SYMBIA_BASE_URL?.replace(/\/$/, "");

function serviceBase(service: ServiceName): string {
  return BASE_URL ? `${BASE_URL}/svc/${service}` : `http://${HOST}:${PORTS[service]}`;
}

let token: string | null = TOKEN ?? null;

/**
 * The imagine host's session token, if we were attached to one.
 *
 * Two different questions are being answered by two different credentials here,
 * and collapsing them would be a mistake. `Authorization` says which principal
 * is acting, and the services check it. `x-imagine-token` says this process was
 * started by the user who owns the host, and the host's own gate checks that
 * before any service sees the request.
 *
 * A local stack reachable on loopback needs the second one: without it, any
 * process on the machine can ask the runtime what graphs are loaded. With it,
 * the answer requires having been able to read a 0600 file in that user's home
 * directory.
 *
 * Absent when talking to a deployed stack, where the network boundary is doing
 * this job — so it is added when present and never required.
 */
const HOST_TOKEN = process.env.SYMBIA_HOST_TOKEN;
const hostHeader = (): Record<string, string> =>
  HOST_TOKEN ? { "x-imagine-token": HOST_TOKEN } : {};

async function login(): Promise<string> {
  // Preferred: resolve a session token to a fresh JWT. Refreshable (this runs
  // again on 401) and revocable server-side.
  if (SESSION_TOKEN) {
    const r = await fetch(`${serviceBase("identity" as ServiceName)}/api/auth/session/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hostHeader() },
      body: JSON.stringify({ token: SESSION_TOKEN }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      throw new Error(
        `Session resolve failed (${r.status}). The SYMBIA_SESSION_TOKEN is invalid, expired, or revoked — mint a fresh one via POST /api/auth/session.`,
      );
    }
    const j = (await r.json()) as { token?: string };
    if (!j.token) throw new Error("Session resolve returned no token");
    token = j.token;
    return token;
  }
  // A pre-issued direct bearer cannot be refreshed here; a 401 means it is
  // invalid or expired. Surface that instead of looping on a login we cannot do.
  if (TOKEN) {
    throw new Error(
      "SYMBIA_TOKEN was rejected (401). Issue a fresh token (Identity API key or " +
        "session); this server does not fall back to password login when a token is set.",
    );
  }
  const r = await fetch(`${serviceBase("identity" as ServiceName)}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...hostHeader() },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    throw new Error(
      `Identity login failed (${r.status}). Check SYMBIA_EMAIL / SYMBIA_PASSWORD and that the stack is running (docker-compose up).`
    );
  }
  const j = (await r.json()) as { token?: string };
  if (!j.token) throw new Error("Identity login returned no token");
  token = j.token;
  return token;
}

interface ApiOptions {
  /** Widened for the dispatcher: any method the REST API declares. */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  skipAuth?: boolean;
}

async function api<T>(service: ServiceName, path: string, opts: ApiOptions = {}): Promise<T> {
  if (!token && !opts.skipAuth) await login();
  const doFetch = async (): Promise<Response> =>
    fetch(`${serviceBase(service)}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...hostHeader(),
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token && !opts.skipAuth ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  let r: Response;
  try {
    r = await doFetch();
  } catch (err) {
    // A TIMEOUT IS NOT A FAILURE, AND SAYING SO MATTERS.
    //
    // Measured 16 Aug: POST /api/models/pull "failed" with
    // "The operation was aborted due to timeout" after 15s. It had not
    // failed. It was downloading 668 MB, finished a minute later, wrote a
    // signed lineage event, and the model ran. An agent reading that error
    // would report the pull broken and be wrong — the worst kind of
    // confident negative, because the wrong conclusion is also actionable.
    if (err instanceof Error && (err.name === "TimeoutError" || /aborted due to timeout/i.test(err.message))) {
      throw new Error(
        `${service} ${path} did not respond within 15s. THIS IS NOT A FAILURE — the request was sent ` +
        `and the operation may still be running; long operations (model pulls, large downloads) routinely ` +
        `outlast this client timeout. Check the resulting state before concluding anything: for models, ` +
        `GET /api/models and GET /api/stats. Do not retry blindly, which would start the work twice.`
      );
    }
    // "fetch failed" alone is a confident negative: it reads as "the
    // service is broken" when it usually means "nothing answered at the
    // address I tried". Say which address, and what the transport said.
    const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
    throw new Error(
      `Could not reach ${service} at ${serviceBase(service)}${path} — ` +
        `${cause?.code ?? ""}${cause?.code ? ": " : ""}${cause?.message ?? (err instanceof Error ? err.message : String(err))}. ` +
        `This is a connectivity failure, not a service error: ` +
        `${BASE_URL ? `SYMBIA_BASE_URL=${BASE_URL}` : `port mode, host=${HOST}`}.`
    );
  }
  if (r.status === 401 && !opts.skipAuth) {
    await login();
    r = await doFetch();
  }
  const text = await r.text();
  if (!r.ok) {
    // AN ERROR IS THE MOST USEFUL THING A SERVICE EVER SENDS AN AGENT.
    //
    // This truncated at 300 characters, which was fine when errors were
    // "not found" and actively harmful once they started teaching. Measured
    // 16 Aug: the catalog's graph gate returns three problems, each with the
    // component manifest's own description of what it accepts — and the
    // agent saw one problem, half a hint, and no note.
    //
    // `respond()` learned this for SUCCESS payloads this morning and shrinks
    // them structurally. The failure path kept the naive slice, and failures
    // are where an agent has the least other information to work from.
    const ERROR_BUDGET = Number(process.env.SYMBIA_ERROR_BUDGET ?? 4000);
    const body =
      text.length <= ERROR_BUDGET
        ? text
        : `${text.slice(0, ERROR_BUDGET)}\n…[error truncated at ${ERROR_BUDGET} of ${text.length} characters]`;
    throw new Error(`${service} ${path} responded ${r.status}: ${body}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/**
 * Serialize a tool result, staying PARSEABLE when it is too big.
 *
 * This used to cut the JSON string at a character count and append a
 * prose note, producing output no client could parse — measured 16 Aug
 * (security MAP, S18): a probe could not evaluate a catalog listing
 * because the answer was large, which is exactly when the answer matters.
 * Truncate the DATA and say so inside the JSON instead.
 */
function respond(data: unknown): ToolResult {
  let text = JSON.stringify(data, null, 2);
  if (text.length <= CHARACTER_LIMIT) return { content: [{ type: "text", text }] };

  // Arrays are the usual cause: drop items until it fits, and record how
  // many were dropped so the caller can narrow deliberately.
  const shrink = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const keep = Math.max(1, Math.floor(value.length / 4));
      return { _truncated: { of: value.length, shown: keep, note: "narrow with filters or limit/offset" }, items: value.slice(0, keep) };
    }
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = Array.isArray(v) ? shrink(v) : v;
      return out;
    }
    return value;
  };

  let shrunk = shrink(data);
  text = JSON.stringify(shrunk, null, 2);
  if (text.length > CHARACTER_LIMIT) {
    // Still too large: return a valid JSON envelope rather than a broken one.
    text = JSON.stringify({
      _truncated: { note: "result exceeded the character limit even after shrinking; narrow the query" },
      preview: String(JSON.stringify(data)).slice(0, 2000),
    }, null, 2);
  }
  return { content: [{ type: "text", text }] };
}

function fail(error: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
    isError: true,
  };
}

const server = new McpServer({ name: "symbia-mcp-server", version: "1.0.0" });

const RO = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

server.registerTool(
  "symbia_stack_health",
  {
    title: "Symbia Stack Health",
    description:
      // Derived, not restated: a hardcoded "all nine" here outlived the tenth
      // service (directory, 5010) — the count read as a claim about the
      // platform while being a claim about nine services.
      `Check health and self-reported version of all ${RunningServices.length} registered Symbia services (${RunningServices.join(", ")}). Returns per-service status, port, latency in ms, and OpenAPI title/version. Use this first to confirm the stack is up.`,
    inputSchema: z.object({}).strict(),
    annotations: RO,
  },
  async (): Promise<ToolResult> => {
    const entries = await Promise.all(
      (Object.keys(PORTS) as ServiceName[]).map(async (name) => {
        const t0 = Date.now();
        try {
          await api<unknown>(name, "/health", { skipAuth: true });
          let title: string | undefined;
          let version: string | undefined;
          try {
            const spec = await api<{ info?: { title?: string; version?: string } }>(
              name, "/docs/openapi.json", { skipAuth: true });
            title = spec.info?.title;
            version = spec.info?.version;
          } catch { /* spec optional */ }
          return { service: name, endpoint: serviceBase(name), status: "healthy", latencyMs: Date.now() - t0, title, version };
        } catch (e) {
          return { service: name, endpoint: serviceBase(name), status: "unreachable", latencyMs: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 120) : String(e) };
        }
      })
    );
    return respond({ services: entries, healthy: entries.filter((e) => e.status === "healthy").length, total: entries.length });
  }
);

const ListResourcesInput = z.object({
  type: z.string().optional().describe("Filter by resource type, e.g. 'integration', 'assistant', 'graph'"),
  tag: z.string().optional().describe("Filter by tag, e.g. 'ai', 'bootstrap'"),
  query: z.string().optional().describe("Case-insensitive substring match on key, name, description"),
  limit: z.number().int().min(1).max(100).default(20).describe("Max results (default 20)"),
  offset: z.number().int().min(0).default(0).describe("Results to skip"),
}).strict();

server.registerTool(
  "symbia_list_resources",
  {
    title: "List Catalog Resources",
    description:
      "List resources in the Symbia Catalog (the platform's registry of integrations, assistants, graphs, contexts, models). Supports filtering by type, tag, and free-text query, with limit/offset pagination. Returns id, key, name, type, status, and tags per resource.",
    inputSchema: ListResourcesInput,
    annotations: RO,
  },
  async (params: z.infer<typeof ListResourcesInput>): Promise<ToolResult> => {
    try {
      const all = await api<Array<Record<string, unknown>>>("catalog", "/api/resources");
      const q = params.query?.toLowerCase();
      const filtered = all.filter((r) =>
        (!params.type || r.type === params.type) &&
        (!params.tag || (Array.isArray(r.tags) && (r.tags as string[]).includes(params.tag))) &&
        (!q || ["key", "name", "description"].some((f) => String(r[f] ?? "").toLowerCase().includes(q)))
      );
      const page = filtered.slice(params.offset, params.offset + params.limit)
        .map((r) => ({ id: r.id, key: r.key, name: r.name, type: r.type, status: r.status, tags: r.tags }));
      return respond({ total: filtered.length, count: page.length, offset: params.offset, resources: page, has_more: filtered.length > params.offset + page.length });
    } catch (e) { return fail(e); }
  }
);

const GetResourceInput = z.object({
  id: z.string().min(1).describe("Resource id or key from symbia_list_resources"),
}).strict();

server.registerTool(
  "symbia_get_resource",
  {
    title: "Get Catalog Resource",
    description:
      "Fetch one Catalog resource by id, returning its full definition including content and metadata. Use symbia_list_resources first to find ids.",
    inputSchema: GetResourceInput,
    annotations: RO,
  },
  async (params: z.infer<typeof GetResourceInput>): Promise<ToolResult> => {
    try {
      return respond(await api("catalog", `/api/resources/${encodeURIComponent(params.id)}`));
    } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "symbia_list_assistants",
  {
    title: "List Assistants",
    description:
      "List all assistants registered in the Assistants service, with key, name, alias, description, status, and tags. These are the platform's AI assistant definitions (e.g. calculator, coordinator, gmail).",
    inputSchema: z.object({}).strict(),
    annotations: RO,
  },
  async (): Promise<ToolResult> => {
    try { return respond(await api("assistants", "/api/assistants")); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "symbia_list_log_streams",
  {
    title: "List Log Streams",
    description:
      "List all log streams in the Logging service (per-service telemetry streams with id, orgId, serviceId, name, level, retention). Stream ids from here feed symbia_query_logs.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
  },
  async (): Promise<ToolResult> => {
    try { return respond(await api("logging", "/api/logs/streams")); }
    catch (e) { return fail(e); }
  }
);

const QueryLogsInput = z.object({
  streamIds: z.array(z.string()).optional().describe("Stream ids from symbia_list_log_streams; omit for all"),
  level: z.string().optional().describe("Minimum level, e.g. 'info', 'warn', 'error'"),
  search: z.string().optional().describe("Free-text search within log entries"),
  startTime: z.string().optional().describe("ISO 8601 lower bound, e.g. '2026-08-05T00:00:00Z'"),
  endTime: z.string().optional().describe("ISO 8601 upper bound"),
  limit: z.number().int().min(1).max(200).default(50).describe("Max entries (default 50)"),
  offset: z.number().int().min(0).default(0),
}).strict();

server.registerTool(
  "symbia_query_logs",
  {
    title: "Query Logs",
    description:
      "Query log entries from the Logging service with optional stream, level, time-range, and free-text filters. Returns matching entries newest-first. Example: level='error', search='conversation' to find recent conversation errors.",
    inputSchema: QueryLogsInput,
    annotations: RO,
  },
  async (params: z.infer<typeof QueryLogsInput>): Promise<ToolResult> => {
    try { return respond(await api("logging", "/api/logs/query", { method: "POST", body: params })); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "symbia_list_components",
  {
    title: "List Runtime Components",
    description:
      "List the graph-execution components registered in the Runtime service (id, name, description, input/output ports, apocryphal flag). These are the building blocks available when authoring Symbia Script graphs.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
  },
  async (): Promise<ToolResult> => {
    try { return respond(await api("runtime", "/api/components", { skipAuth: true })); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "symbia_list_models",
  {
    title: "List Models (unified registry)",
    description:
      "The Models service's unified registry: local AND remote models in one list. Each entry carries symbia.{source, provider, brokered, availability + its reason, idSource, verified}; local entries also carry the weights digest (sha256 — the model's content address) and, when a catalog card disagrees with the file, a digestMismatch disclosure. Availability is measured, never inferred: 'unknown' is a real answer for remote models on an unauthenticated listing. The service speaks the OpenAI-compatible protocol on /v1; weights are acquired via POST /api/models/pull (egress and credentials handled by integrations; every pull is sealed as a signed artifact.registered event).",
    inputSchema: z.object({}).strict(),
    annotations: RO,
  },
  async (): Promise<ToolResult> => {
    try { return respond(await api("models", "/api/models")); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "symbia_integration_status",
  {
    title: "Integration Status",
    description:
      "Get the Integrations service status: overall health, configured LLM providers (openai, anthropic, huggingface, symbia-labs) with configured flags, and the registered integration operations.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
  },
  async (): Promise<ToolResult> => {
    try {
      const [status, registry] = await Promise.all([
        api("integrations", "/api/integrations/status"),
        api("integrations", "/api/integrations/registry").catch(() => null),
      ]);
      return respond({ status, registry });
    } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "symbia_list_organizations",
  {
    title: "List Organizations",
    description:
      "List organizations visible to the authenticated user in the Identity service, with id, name, slug, plan, member count, and the user's role in each.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
  },
  async (): Promise<ToolResult> => {
    try { return respond(await api("identity", "/api/orgs")); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "symbia_list_network_nodes",
  {
    title: "List Network Nodes",
    description:
      "List nodes registered in the Network service mesh (id, name, type, capabilities, endpoint, status). Shows which services and bridges are participating in event routing.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
  },
  async (): Promise<ToolResult> => {
    try { return respond(await api("network", "/api/registry/nodes")); }
    catch (e) { return fail(e); }
  }
);

// ---------------------------------------------------------------------------
// The dispatcher — 1:1 with the REST API in three tools. See dispatcher.ts
// for why three and not 377.
// ---------------------------------------------------------------------------

const SYMBIA_MODE = process.env.SYMBIA_MODE ?? "unknown";

/** Every dispatcher response says which mode it touched. */
function withMode(data: Record<string, unknown>): ToolResult {
  return respond({ mode: SYMBIA_MODE, ...data });
}

async function allOperations(): Promise<{ ops: OperationInfo[]; unavailable: Array<{ service: string; error: string }> }> {
  const ops: OperationInfo[] = [];
  const unavailable: Array<{ service: string; error: string }> = [];
  await Promise.all(
    (RunningServices as ServiceName[]).map(async (svc) => {
      // THE SPEC FETCH NEEDS THE HOST TOKEN TOO.
      //
      // This was a bare fetch because a spec is public in every deployment
      // this server was written against. Against a gated imagine host it 401s,
      // and the consequence was not a 401 anywhere a caller could see it: the
      // dispatcher found no operations, so `symbia_call` answered "No such
      // operation" for every path on every service. The message described a
      // dispatcher state and named nothing that could lead back to the gate.
      //
      // Measured directly after the gate shipped: twelve services, twelve
      // 401s, zero operations, and an error about the wrong subject.
      const entry = await operationsFor(svc, serviceBase(svc), (url) =>
        fetch(url, { headers: hostHeader(), signal: AbortSignal.timeout(8000) }).then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.json();
        })
      );
      // "No spec" is not "no operations" — say which service could not be asked.
      if (entry.error) unavailable.push({ service: svc, error: entry.error });
      ops.push(...entry.ops);
    })
  );
  return { ops, unavailable };
}

server.registerTool(
  "symbia_list_operations",
  {
    title: "List Symbia API Operations",
    description:
      "Discover what this Symbia stack can do. Returns operations read from each service's own OpenAPI spec — id, method, path, summary, and whether it writes. Filter by service, method, or free text. Reads only by default; pass includeWrites to see mutating operations. This is the index for symbia_call: find the operationId here, get its schema with symbia_describe_operation, then execute it. New endpoints appear as soon as a service serves them; the tool list never changes.",
    inputSchema: z
      .object({
        service: z.string().optional().describe(`One of: ${RunningServices.join(", ")}`),
        method: z.string().optional().describe("GET, POST, PATCH, PUT, DELETE"),
        q: z.string().optional().describe("Substring over path, operationId, summary, description"),
        includeWrites: z.boolean().optional().describe("Include mutating operations (default true)"),
        limit: z.number().optional(),
      })
      .strict(),
    annotations: RO,
  },
  async (args): Promise<ToolResult> => {
    try {
      const { ops, unavailable } = await allOperations();
      const matched = filterOperations(ops, args as never);
      return withMode({
        total: ops.length,
        matched: matched.length,
        unavailable,
        operations: matched.map((o) => ({
          service: o.service,
          operationId: o.operationId,
          method: o.method,
          path: o.path,
          writes: o.writes,
          destructive: o.destructive || undefined,
          summary: o.summary,
        })),
      });
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "symbia_describe_operation",
  {
    title: "Describe a Symbia API Operation",
    description:
      "Full parameter and request-body schema for one operation, so a call can be constructed without guessing. Identify it by operationId, or by service + method + path.",
    inputSchema: z
      .object({
        operationId: z.string().optional(),
        service: z.string().optional(),
        method: z.string().optional(),
        path: z.string().optional(),
      })
      .strict(),
    annotations: RO,
  },
  async (args): Promise<ToolResult> => {
    try {
      const { ops } = await allOperations();
      const op = ops.find((o) =>
        args.operationId
          ? o.operationId === args.operationId
          : o.service === args.service &&
            o.method === (args.method ?? "").toUpperCase() &&
            o.path === args.path
      );
      if (!op) {
        return fail(
          `No such operation. Use symbia_list_operations to find one${args.operationId ? ` (searched for operationId '${args.operationId}')` : ""}.`
        );
      }
      return withMode({ operation: op });
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "symbia_call",
  {
    title: "Call a Symbia API Operation",
    description:
      "Execute any operation on this Symbia stack, with the caller's credentials. Path parameters are taken from params; leftover params become the query string. Writes are permitted; DELETE requires confirmDestructive because an agent should never delete by accident. The response carries the operating mode — a write in imagine mode is a sketch, not a record.",
    inputSchema: z
      .object({
        operationId: z.string().optional().describe("From symbia_list_operations"),
        service: z.string().optional(),
        method: z.string().optional(),
        path: z.string().optional().describe("Used with service+method when no operationId"),
        params: z.record(z.unknown()).optional().describe("Path params first, then query"),
        body: z.unknown().optional(),
        confirmDestructive: z.boolean().optional().describe("Required for DELETE"),
      })
      .strict(),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (args): Promise<ToolResult> => {
    try {
      const { ops, unavailable } = await allOperations();
      const op = ops.find((o) =>
        args.operationId
          ? o.operationId === args.operationId
          : o.service === args.service &&
            o.method === (args.method ?? "").toUpperCase() &&
            o.path === args.path
      );
      if (!op) {
        // DISTINGUISH "THIS OPERATION DOES NOT EXIST" FROM "I COULD NOT ASK".
        //
        // Those are different states and this returned the same sentence for
        // both. When the imagine gate shipped, every spec fetch 401'd, the
        // operation table was empty, and every call reported a missing
        // operation — an answer about the dispatcher, describing nothing a
        // reader could act on. An empty table is not evidence of absence.
        const refused = unavailable.filter((u) => /^40[13]$/.test(u.error));
        if (ops.length === 0 && refused.length > 0) {
          return fail(
            `Cannot answer whether that operation exists: ${refused.length} of ` +
              `${unavailable.length + 0} services refused their specification with ` +
              `${refused[0].error}. This host authorises by session token — the client is ` +
              `attached but not authorised, which usually means it read the address file ` +
              `before the host last restarted and minted a new token. Restart the client. ` +
              `Services refusing: ${refused.map((r) => r.service).join(", ")}.`
          );
        }
        if (ops.length === 0 && unavailable.length > 0) {
          return fail(
            `Cannot answer whether that operation exists: no service returned a ` +
              `specification. ${unavailable.map((u) => `${u.service} (${u.error})`).join(", ")}.`
          );
        }
        return fail(
          `No such operation among the ${ops.length} available. Use symbia_list_operations first.` +
            (unavailable.length > 0
              ? ` Note ${unavailable.length} service(s) could not be asked: ${unavailable
                  .map((u) => `${u.service} (${u.error})`)
                  .join(", ")}.`
              : "")
        );
      }
      if (op.destructive && !args.confirmDestructive) {
        return fail(
          `${op.operationId} is a DELETE. Re-issue with confirmDestructive: true if that is intended.`
        );
      }

      const { path, missing, query } = fillPath(op.path, args.params as Record<string, unknown>);
      if (missing.length) {
        return fail(`Missing path parameter(s): ${missing.join(", ")}. See symbia_describe_operation.`);
      }
      const qs = new URLSearchParams(
        Object.entries(query).map(([k, v]) => [k, String(v)] as [string, string])
      ).toString();

      // A client may hand us a body as an object OR as a JSON string —
      // the schema types it as free-form, and MCP clients differ. Sending
      // a string through JSON.stringify double-encodes it, and the service
      // rejects `"{\"key\":..."` with a parse error that names neither
      // cause (measured 16 Aug: every write through this tool failed).
      // A SIZE GUARD AT THE TOOL BOUNDARY, NOT IN EXPRESS.
      //
      // Measured twice (16 Aug): an 11 MB body killed the whole sidecar,
      // and adding an express limit did not save it — the payload never
      // reaches HTTP. It arrives over stdio, is stringified, buffered and
      // stored, and the process dies of heap exhaustion, which is not a
      // catchable exception. The only place that can refuse it is here,
      // before the bytes are handled at all.
      const MAX_BODY = Number(process.env.SYMBIA_MAX_BODY_BYTES ?? 1_000_000);
      const rawSize = args.body === undefined ? 0
        : typeof args.body === "string" ? args.body.length
        : JSON.stringify(args.body).length;
      if (rawSize > MAX_BODY) {
        return fail(
          `Body is ${rawSize} bytes; the limit is ${MAX_BODY}. Refused here rather than sent: ` +
          `a payload this size has killed this process before, taking every mounted service with it. ` +
          `Split the write, or raise SYMBIA_MAX_BODY_BYTES deliberately.`
        );
      }

      let body = args.body;
      if (typeof body === "string") {
        const trimmed = body.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try { body = JSON.parse(trimmed); } catch { /* send as-is */ }
        }
      }
      const result = await api<unknown>(op.service as ServiceName, `${path}${qs ? `?${qs}` : ""}`, {
        method: op.method as never,
        body,
      });
      return withMode({
        called: { service: op.service, operationId: op.operationId, method: op.method, path },
        wrote: op.writes,
        result,
      });
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "symbia_selftest",
  {
    title: "Symbia Connector Self-Test",
    description:
      "Diagnose the connector itself: which base URL it addresses, whether a loopback request from THIS process succeeds, and what the transport says when it does not. Use when other tools report connectivity failures — it distinguishes 'the stack is down' from 'this process cannot open a socket'.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
  },
  async (): Promise<ToolResult> => {
    const base = BASE_URL ?? `http://${HOST}:${PORTS.identity}`;
    const probe: Record<string, unknown> = {
      mode: SYMBIA_MODE,
      addressing: BASE_URL ? `one-origin: ${BASE_URL}/svc/<id>` : `port map on ${HOST}`,
      node: process.version,
      pid: process.pid,
    };
    try {
      const r = await fetch(`${base}/`, { signal: AbortSignal.timeout(5000) });
      probe.loopback = { ok: true, status: r.status, url: `${base}/` };
    } catch (err) {
      const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
      probe.loopback = {
        ok: false,
        url: `${base}/`,
        code: cause?.code ?? null,
        detail: cause?.message ?? (err instanceof Error ? err.message : String(err)),
        meaning:
          "This process could not open a socket to its own services. The stack may be fine; the connector's environment is not.",
      };
    }
    return respond(probe);
  }
);

async function main(): Promise<void> {
  // THE TRANSPORT BUFFER MUST SIT ABOVE THE TOOL-BOUNDARY GUARD.
  //
  // Measured 16 Aug. The SDK's ReadBuffer defaults to 10 MB, and on
  // overflow `_ondata` catches the throw and calls `close()`, which
  // removes the stdin listener. An 11 MB tool call therefore produced the
  // worst available outcome: the process stayed alive and answered
  // nothing further, forever — no crash to restart from, no error to the
  // client, no entry anywhere. Every later call in that session timed out.
  //
  // Raising this does not make big payloads welcome. It makes the refusal
  // land at SYMBIA_MAX_BODY_BYTES (1 MB, checked in symbia_call), which
  // returns a message naming the size and the limit. The buffer is set
  // well clear of that so the guard, not the transport, is what answers.
server.tool(
  "symbia_diagnose",
  "Ask why a request failed. Pairs recent non-2xx responses with the log lines the service emitted while they were in flight. Use when an endpoint returns a generic error — services catch their own faults and answer with the operation name, not the cause, so the detail exists only in the process log. The pairing is a time window and says so.",
  { limit: z.number().optional() },
  async (args: { limit?: number }): Promise<ToolResult> => {
    // A HOST MUST BE ABLE TO ASK WHY, NOT ONLY WHAT.
    //
    // D3 (16 Aug) needed a shell: three logging endpoints answered "Failed
    // to query logs" while the real cause — no tables in pg-mem — reached
    // only stderr. Nothing in the API surfaced it, so diagnosis left the
    // platform. This is the endpoint that makes it unnecessary.
    const base = BASE_URL ?? `http://${HOST}:${PORTS.identity}`;
    try {
      const r = await fetch(`${base}/session/diagnostics?limit=${args.limit ?? 10}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) {
        return fail(
          `Diagnostics returned ${r.status} from ${base}/session/diagnostics. ` +
          `This endpoint belongs to the imagine host, not to a mounted service — ` +
          `a deployed stack does not serve it.`
        );
      }
      return respond(await r.json());
    } catch (err) {
      const cause = (err as { cause?: { code?: string } })?.cause;
      return fail(
        `Could not reach ${base}/session/diagnostics${cause?.code ? ` (${cause.code})` : ""}. ` +
        `Available in imagine mode only.`
      );
    }
  }
);

  const transport = new StdioServerTransport(process.stdin, process.stdout, {
    maxBufferSize: Number(process.env.SYMBIA_MAX_STDIO_BYTES ?? 64 * 1024 * 1024),
  });
  // An overflow past even that still kills the session silently. Say so on
  // stderr, which is the only channel left once stdin is detached.
  transport.onerror = (err: Error) => {
    process.stderr.write(`[symbia-mcp] transport error (session may be dead): ${err.message}\n`);
  };
  await server.connect(transport);
  console.error(`symbia-mcp-server running (stack host: ${HOST}, user: ${EMAIL})`);
}

main().catch((error) => {
  console.error("symbia-mcp-server fatal:", error);
  process.exit(1);
});
