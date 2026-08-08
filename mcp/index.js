#!/usr/bin/env node
/**
 * symbia-mcp-server — MCP access to the locally running Symbia stack.
 *
 * Read-only tools over the Symbia services on localhost (identity, logging,
 * catalog, assistants, messaging, runtime, integrations, network, models,
 * control-center, api).
 * Authenticates against the Identity service with SYMBIA_EMAIL /
 * SYMBIA_PASSWORD (defaults to the gap-probe test user).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const EMAIL = process.env.SYMBIA_EMAIL ?? "gap-probe@symbia.test";
const PASSWORD = process.env.SYMBIA_PASSWORD ?? "GapProbe!2026x";
const HOST = process.env.SYMBIA_HOST ?? "localhost";
const CHARACTER_LIMIT = 25000;
const PORTS = {
    identity: 5001,
    logging: 5002,
    catalog: 5003,
    assistants: 5004,
    messaging: 5005,
    runtime: 5006,
    integrations: 5007,
    models: 5008,
    network: 5009,
    // The console and the public API are services too. They were missing, so
    // symbia_stack_health reported 9/9 healthy on a stack running ten, and a
    // console that was down looked like a console nobody had asked about.
    "control-center": 8000,
    api: 9000,
};
let token = null;
async function login() {
    const r = await fetch(`http://${HOST}:${PORTS.identity}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
        signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
        throw new Error(`Identity login failed (${r.status}). Check SYMBIA_EMAIL / SYMBIA_PASSWORD and that the stack is running (docker-compose up).`);
    }
    const j = (await r.json());
    if (!j.token)
        throw new Error("Identity login returned no token");
    token = j.token;
    return token;
}
async function api(service, path, opts = {}) {
    if (!token && !opts.skipAuth)
        await login();
    const doFetch = async () => fetch(`http://${HOST}:${PORTS[service]}${path}`, {
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
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
function respond(data) {
    let text = JSON.stringify(data, null, 2);
    if (text.length > CHARACTER_LIMIT) {
        text =
            text.slice(0, CHARACTER_LIMIT) +
                "\n… truncated — use limit/offset or filters to narrow the result.";
    }
    return { content: [{ type: "text", text }] };
}
function fail(error) {
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
server.registerTool("symbia_stack_health", {
    title: "Symbia Stack Health",
    description: "Check health and self-reported version of every Symbia service (identity, logging, catalog, assistants, messaging, runtime, integrations, models, network, control-center, api). Returns per-service status, port, latency in ms, and OpenAPI title/version. Use this first to confirm the stack is up.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    const entries = await Promise.all(Object.keys(PORTS).map(async (name) => {
        const t0 = Date.now();
        try {
            await api(name, "/health", { skipAuth: true });
            let title;
            let version;
            try {
                const spec = await api(name, "/docs/openapi.json", { skipAuth: true });
                title = spec.info?.title;
                version = spec.info?.version;
            }
            catch { /* spec optional */ }
            return { service: name, port: PORTS[name], status: "healthy", latencyMs: Date.now() - t0, title, version };
        }
        catch (e) {
            return { service: name, port: PORTS[name], status: "unreachable", latencyMs: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 120) : String(e) };
        }
    }));
    return respond({ services: entries, healthy: entries.filter((e) => e.status === "healthy").length, total: entries.length });
});
const ListResourcesInput = z.object({
    type: z.string().optional().describe("Filter by resource type, e.g. 'integration', 'assistant', 'graph'"),
    tag: z.string().optional().describe("Filter by tag, e.g. 'ai', 'bootstrap'"),
    query: z.string().optional().describe("Case-insensitive substring match on key, name, description"),
    limit: z.number().int().min(1).max(100).default(20).describe("Max results (default 20)"),
    offset: z.number().int().min(0).default(0).describe("Results to skip"),
}).strict();
server.registerTool("symbia_list_resources", {
    title: "List Catalog Resources",
    description: "List resources in the Symbia Catalog (the platform's registry of integrations, assistants, graphs, contexts, models). Supports filtering by type, tag, and free-text query, with limit/offset pagination. Returns id, key, name, type, status, and tags per resource.",
    inputSchema: ListResourcesInput,
    annotations: RO,
}, async (params) => {
    try {
        const all = await api("catalog", "/api/resources");
        const q = params.query?.toLowerCase();
        const filtered = all.filter((r) => (!params.type || r.type === params.type) &&
            (!params.tag || (Array.isArray(r.tags) && r.tags.includes(params.tag))) &&
            (!q || ["key", "name", "description"].some((f) => String(r[f] ?? "").toLowerCase().includes(q))));
        const page = filtered.slice(params.offset, params.offset + params.limit)
            .map((r) => ({ id: r.id, key: r.key, name: r.name, type: r.type, status: r.status, tags: r.tags }));
        return respond({ total: filtered.length, count: page.length, offset: params.offset, resources: page, has_more: filtered.length > params.offset + page.length });
    }
    catch (e) {
        return fail(e);
    }
});
const GetResourceInput = z.object({
    id: z.string().min(1).describe("Resource id or key from symbia_list_resources"),
}).strict();
server.registerTool("symbia_get_resource", {
    title: "Get Catalog Resource",
    description: "Fetch one Catalog resource by id, returning its full definition including content and metadata. Use symbia_list_resources first to find ids.",
    inputSchema: GetResourceInput,
    annotations: RO,
}, async (params) => {
    try {
        return respond(await api("catalog", `/api/resources/${encodeURIComponent(params.id)}`));
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_list_assistants", {
    title: "List Assistants",
    description: "List all assistants registered in the Assistants service, with key, name, alias, description, status, and tags. These are the platform's AI assistant definitions (e.g. calculator, coordinator, gmail).",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    try {
        return respond(await api("assistants", "/api/assistants"));
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_list_log_streams", {
    title: "List Log Streams",
    description: "List all log streams in the Logging service (per-service telemetry streams with id, orgId, serviceId, name, level, retention). Stream ids from here feed symbia_query_logs.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    try {
        return respond(await api("logging", "/api/logs/streams"));
    }
    catch (e) {
        return fail(e);
    }
});
const QueryLogsInput = z.object({
    streamIds: z.array(z.string()).optional().describe("Stream ids from symbia_list_log_streams; omit for all"),
    level: z.string().optional().describe("Minimum level, e.g. 'info', 'warn', 'error'"),
    search: z.string().optional().describe("Free-text search within log entries"),
    startTime: z.string().optional().describe("ISO 8601 lower bound, e.g. '2026-08-05T00:00:00Z'"),
    endTime: z.string().optional().describe("ISO 8601 upper bound"),
    limit: z.number().int().min(1).max(200).default(50).describe("Max entries (default 50)"),
    offset: z.number().int().min(0).default(0),
}).strict();
server.registerTool("symbia_query_logs", {
    title: "Query Logs",
    description: "Query log entries from the Logging service with optional stream, level, time-range, and free-text filters. Returns matching entries newest-first. Example: level='error', search='conversation' to find recent conversation errors.",
    inputSchema: QueryLogsInput,
    annotations: RO,
}, async (params) => {
    try {
        return respond(await api("logging", "/api/logs/query", { method: "POST", body: params }));
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_list_components", {
    title: "List Runtime Components",
    description: "List the graph-execution components registered in the Runtime service (id, name, description, input/output ports, apocryphal flag). These are the building blocks available when authoring Symbia Script graphs.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    try {
        return respond(await api("runtime", "/api/components", { skipAuth: true }));
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_list_models", {
    title: "List Local Models",
    description: "List LLM models available in the Models service (local inference via node-llama-cpp), with id, owner, capabilities, context length, and load state. The Models service speaks the OpenAI-compatible protocol on /v1.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    try {
        return respond(await api("models", "/api/models"));
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_integration_status", {
    title: "Integration Status",
    description: "Get the Integrations service status: overall health, configured LLM providers (openai, anthropic, huggingface, symbia-labs) with configured flags, and the registered integration operations.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    try {
        const [status, registry] = await Promise.all([
            api("integrations", "/api/integrations/status"),
            api("integrations", "/api/integrations/registry").catch(() => null),
        ]);
        return respond({ status, registry });
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_list_organizations", {
    title: "List Organizations",
    description: "List organizations visible to the authenticated user in the Identity service, with id, name, slug, plan, member count, and the user's role in each.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    try {
        return respond(await api("identity", "/api/orgs"));
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_list_network_nodes", {
    title: "List Network Nodes",
    description: "List nodes registered in the Network service mesh (id, name, type, capabilities, endpoint, status). Shows which services and bridges are participating in event routing.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    try {
        return respond(await api("network", "/api/registry/nodes"));
    }
    catch (e) {
        return fail(e);
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`symbia-mcp-server running (stack host: ${HOST}, user: ${EMAIL})`);
}
main().catch((error) => {
    console.error("symbia-mcp-server fatal:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map