# Using Claude with the Symbia stack via MCP

Claude talks to a running Symbia stack through **MCP (Model Context Protocol)** servers. Instead of hand-writing `curl` calls, you ask in natural language and Claude calls typed, read-oriented tools that reach into the live services and return structured results. This doc covers what's exposed, how it's wired, and how to drive it.

## Two MCP surfaces

There are two distinct MCP surfaces in play — don't confuse them:

1. **The Symbia stack MCP** (`symbia_*` tools) — a curated, read-only window onto the platform: health, catalog resources, assistants, components, models, network nodes, orgs, and logs. This is what you use to *observe and inspect* the stack.
2. **The Integrations service MCP** (`http://localhost:5007/api/integrations/mcp`) — the platform's own MCP endpoint that exposes registered external integrations (e.g. Telegram) as callable tools. This is configured in `.mcp.json` and is how the stack re-exports third-party APIs.

### `.mcp.json`

```json
{
  "mcpServers": {
    "symbia-integrations": {
      "type": "http",
      "url": "http://localhost:5007/api/integrations/mcp",
      "headers": {
        "Authorization": "Bearer <REDACTED-JWT>",
        "X-Org-Id": "<your-org-id>"
      }
    }
  }
}
```

> Security: the committed `.mcp.json` contains a real bearer token and org id. Treat it as a secret — rotate it if it has been shared, and prefer injecting it from the environment rather than committing it. Never paste the token into docs, issues, or chat.

## The Symbia stack tools

All are read-oriented — they inspect the live stack; none mutate it. This is deliberate: observing a system should never risk changing it, so exploration is safe by construction (you can point Claude at the stack without worrying a question will alter state). It also keeps the platform's governance model intact — every state change is forced through the services' authenticated REST APIs, where it can be gated and recorded, rather than slipping in as a side effect of a query. Inspection and mutation are kept on separate, differently-permissioned paths on purpose.

| Tool | What it answers |
|---|---|
| `symbia_stack_health` | Are all nine services up? Per-service status, port, latency, and self-reported OpenAPI title/version. **Start here.** |
| `symbia_integration_status` | Integrations health, which LLM providers are configured (openai/anthropic/huggingface/symbia-labs), and the registered integrations. |
| `symbia_list_resources` | Catalog registry — filter by `type`, `tag`, free-text `query`, with `limit`/`offset`. Returns id, key, name, type, status, tags. |
| `symbia_get_resource` | Full definition of one catalog resource by id/key. |
| `symbia_list_assistants` | Registered assistants. |
| `symbia_list_components` | Runtime components available to graphs. |
| `symbia_list_models` | Models known to the Models service. |
| `symbia_list_network_nodes` | Nodes registered with the Network service. |
| `symbia_list_organizations` | Orgs. |
| `symbia_list_log_streams` | Available log streams. |
| `symbia_query_logs` | Query persisted logs. |

## How to drive it — just ask

You don't call tools by name; you describe intent and Claude picks the tool. Examples:

- *"Is the stack healthy?"* → `symbia_stack_health` → e.g. `"healthy": 9, "total": 9`, each service with port/latency/version.
- *"Which LLM providers are configured?"* → `symbia_integration_status` → openai ✓, anthropic ✓, huggingface ✓, symbia-labs ✗.
- *"List the tutorial assistants in the catalog."* → `symbia_list_resources` with `type: assistant` → Data Explainer, Code Runner, Smart Calculator, Intent Router, Coordinator, Analyst, Builder, …
- *"Show me the full definition of the `assistants/analyst` resource."* → `symbia_get_resource` with that id.
- *"Any errors in the logs from the runtime service in the last hour?"* → `symbia_query_logs`.

### Example: health at a glance

`symbia_stack_health` returns each service's status, e.g.:

```
identity      :5001  healthy  19ms  v1.0.0
logging       :5002  healthy  16ms  v2.0.0
catalog       :5003  healthy  23ms  v1.0.0
assistants    :5004  healthy  20ms  v1.0.0
messaging     :5005  healthy  15ms  v1.0.0
runtime       :5006  healthy  16ms  v1.0.0
integrations  :5007  healthy   8ms  v2.0.0
models        :5008  healthy  16ms  v1.0.0
network       :5054  healthy  19ms  v1.0.0
→ healthy: 9, total: 9
```

### Example: catalog resources

`symbia_list_resources` (limit 8) returns entries like:

```
integration  integrations/symbia-labs/models/llama-3-2-1b-instruct-q4-k-m   published
assistant    assistants/data-explainer     published   [tutorial, level-3, hybrid]
assistant    assistants/coordinator        published   [multi-agent, level-5, orchestration]
…  total: 49
```

## Good practices

- **Health first.** Run `symbia_stack_health` before anything else; most confusing tool errors are just a service that isn't up.
- **Narrow your reads.** `symbia_list_resources` and `symbia_query_logs` support `type`/`tag`/`query`/`limit`/`offset` — use them. Broad, unfiltered reads return large payloads (the Integrations MCP registry in particular is very large).
- **Read-only by design.** These tools observe; they don't create or change resources. To *build* on the platform you go through the service REST APIs (see each service's OpenAPI at `/<service>/docs/openapi.json`, or the collected specs in `docs/api/`). See also `energy/API-MEASUREMENTS.md` for where the write/registration APIs currently fall short.
- **Two different `localhost`s.** The MCP servers run against the stack on your machine. If you also use a sandboxed shell, note it's a separate host and can't reach these ports — the MCP tools are the bridge.

## Related

- `docs/QUICKSTART.md` — bring the stack up so these tools have something to talk to.
- `docs/api/` — collected OpenAPI specs for all nine services.
- `docs/api-validation-report.md` — spec-vs-implementation validation of those APIs.
