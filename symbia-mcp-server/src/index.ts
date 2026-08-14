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

// Auth, token-first (14 Aug 2026). SYMBIA_TOKEN is a pre-issued bearer — an
// Identity API key or a session token — and is the preferred path: no password
// in the MCP config, matching the wallet model and the .mcp.json integrations
// entry. SYMBIA_EMAIL/SYMBIA_PASSWORD is the legacy login flow, kept as a
// local-dev fallback only.
const TOKEN = process.env.SYMBIA_TOKEN;
const EMAIL = process.env.SYMBIA_EMAIL ?? "gap-probe@symbia.test";
const PASSWORD = process.env.SYMBIA_PASSWORD;
if (!TOKEN && !PASSWORD) {
  console.error(
    "No credentials configured. Set SYMBIA_TOKEN (a pre-issued bearer — preferred,\n" +
      "no password in config) OR SYMBIA_PASSWORD (legacy email/password login) in\n" +
      "the MCP server's env.",
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

let token: string | null = TOKEN ?? null;

async function login(): Promise<string> {
  // A pre-issued token cannot be refreshed here; a 401 means it is invalid or
  // expired. Surface that instead of looping on a login we cannot perform.
  if (TOKEN) {
    throw new Error(
      "SYMBIA_TOKEN was rejected (401). Issue a fresh token (Identity API key or " +
        "session); this server does not fall back to password login when a token is set.",
    );
  }
  const r = await fetch(`http://${HOST}:${PORTS.identity}/api/auth/login`, {
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
  method?: "GET" | "POST";
  body?: unknown;
  skipAuth?: boolean;
}

async function api<T>(service: ServiceName, path: string, opts: ApiOptions = {}): Promise<T> {
  if (!token && !opts.skipAuth) await login();
  const doFetch = async (): Promise<Response> =>
    fetch(`http://${HOST}:${PORTS[service]}${path}`, {
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
          return { service: name, port: PORTS[name], status: "healthy", latencyMs: Date.now() - t0, title, version };
        } catch (e) {
          return { service: name, port: PORTS[name], status: "unreachable", latencyMs: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 120) : String(e) };
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
    title: "List Local Models",
    description:
      "List LLM models available in the Models service (local inference via node-llama-cpp), with id, owner, capabilities, context length, and load state. The Models service speaks the OpenAI-compatible protocol on /v1.",
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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`symbia-mcp-server running (stack host: ${HOST}, user: ${EMAIL})`);
}

main().catch((error) => {
  console.error("symbia-mcp-server fatal:", error);
  process.exit(1);
});
