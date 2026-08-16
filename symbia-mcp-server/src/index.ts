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

async function login(): Promise<string> {
  // Preferred: resolve a session token to a fresh JWT. Refreshable (this runs
  // again on 401) and revocable server-side.
  if (SESSION_TOKEN) {
    const r = await fetch(`${serviceBase("identity" as ServiceName)}/api/auth/session/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token && !opts.skipAuth ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  let r = await doFetch();
  if (r.status === 401 && !opts.skipAuth) {
    await login();
    r = await doFetch();
  }
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`${service} ${path} responded ${r.status}: ${text.slice(0, 300)}`);
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

function respond(data: unknown): ToolResult {
  let text = JSON.stringify(data, null, 2);
  if (text.length > CHARACTER_LIMIT) {
    text =
      text.slice(0, CHARACTER_LIMIT) +
      "\n… truncated — use limit/offset or filters to narrow the result.";
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
      const entry = await operationsFor(svc, serviceBase(svc), (url) =>
        fetch(url, { signal: AbortSignal.timeout(8000) }).then((r) => {
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
      const { ops } = await allOperations();
      const op = ops.find((o) =>
        args.operationId
          ? o.operationId === args.operationId
          : o.service === args.service &&
            o.method === (args.method ?? "").toUpperCase() &&
            o.path === args.path
      );
      if (!op) return fail("No such operation. Use symbia_list_operations first.");
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

      const result = await api<unknown>(op.service as ServiceName, `${path}${qs ? `?${qs}` : ""}`, {
        method: op.method as never,
        body: args.body,
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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`symbia-mcp-server running (stack host: ${HOST}, user: ${EMAIL})`);
}

main().catch((error) => {
  console.error("symbia-mcp-server fatal:", error);
  process.exit(1);
});
