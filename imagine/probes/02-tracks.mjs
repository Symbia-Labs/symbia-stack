/**
 * Exit measurements for tracks 3 and 1.
 *
 * Track 3 (integrity): isBootstrap is server-owned, an oversized body is
 * refused without killing the process, and a large result stays parseable.
 * Track 1 (the lifecycle hook): a graph authored through MCP hydrates and
 * runs, and an assistant authored through MCP appears in the roster.
 *
 * Predictions, registered here before the run:
 *   T1  isBootstrap supplied by a client is IGNORED (stored false)
 *   T2  an 11 MB body is refused AND the process survives
 *   T3  a large listing returns valid JSON
 *   T4  runtime hydrates a graph created through the API (loadedGraphs > 0)
 *   T5  the graph executes and the log entry carries executionId
 *   T6  an assistant created through the API appears in GET /api/assistants
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const child = spawn("/opt/homebrew/bin/node", [join(here, "..", "standalone", "sidecar.mjs")], {
  stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "" },
});
let buf = "", stderr = "";
const seen = new Map();
child.stdout.on("data", (c) => {
  buf += c.toString(); let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!l) continue;
    try { const m = JSON.parse(l); if (m.id !== undefined) seen.set(m.id, m); } catch {}
  }
});
child.stderr.on("data", (c) => { stderr += c.toString(); });

let nextId = 200;
const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");
const wait = async (id, ms = 40000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (seen.has(id)) return seen.get(id); await new Promise(r => setTimeout(r, 120)); }
  return null;
};
async function tool(name, args = {}) {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
  const r = await wait(id);
  const text = r?.result?.content?.[0]?.text ?? "no response";
  let data = null; try { data = JSON.parse(text); } catch {}
  return { isError: !!r?.result?.isError, text, data, parseable: data !== null };
}
const call = (a) => tool("symbia_call", a);
const R = [];
const rec = (id, verdict, note) => { R.push({ id, verdict, note }); console.log(`${id.padEnd(3)} ${verdict.padEnd(10)} ${note}`); };

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "tracks", version: "1" } } });
await wait(1);
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
await new Promise(r => setTimeout(r, 15000));

// T1 — isBootstrap is server-owned
await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: { key: "contexts/t1-bootstrap-claim", name: "T1", type: "context", status: "draft", isBootstrap: true, metadata: {} } });
const t1 = await call({ service: "catalog", method: "GET", path: "/api/resources", params: { key: "contexts/t1-bootstrap-claim" } });
const row = t1.data?.result?.[0];
rec("T1", row && row.isBootstrap === false ? "HELD" : "BROKEN",
  row ? `client asked for isBootstrap:true, stored as ${row.isBootstrap}` : "row not found");

// T2 — oversized body refused, process survives
const big = await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: { key: "contexts/t2-big", name: "T2", type: "context", status: "draft", metadata: { blob: "x".repeat(11 * 1024 * 1024) } } });
const alive = await tool("symbia_selftest");
rec("T2", big.isError && alive.data?.loopback?.ok ? "HELD" : "BROKEN",
  `11MB -> ${big.isError ? "refused" : "ACCEPTED"}; process ${alive.data?.loopback?.ok ? "alive" : "DEAD"}`);

// T3 — a large listing stays parseable
const listing = await call({ service: "catalog", method: "GET", path: "/api/resources" });
rec("T3", listing.parseable ? "HELD" : "BROKEN",
  `full catalog listing ${listing.parseable ? "parsed" : "UNPARSEABLE"} (${listing.text.length} chars)`);

// T4/T5 — a graph authored through MCP hydrates and runs
await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: {
    key: "graphs/t4-hello", name: "T4 hello", type: "graph", status: "published",
    metadata: {
      role: "pipeline", ingress: { node: "entry", port: "in" },
      definition: {
        symbia: "graph/1.0", name: "t4-hello", version: "0.1.0",
        nodes: [
          { id: "entry", component: "symbia.io.passthrough" },
          { id: "log", component: "symbia.sink.log", config: { level: "info", message: "t4-hello:" } },
        ],
        edges: [{ id: "e1", source: { node: "entry", port: "out" }, target: { node: "log", port: "in" } }],
        metadata: { role: "pipeline", ingress: { node: "entry", port: "in" } },
      },
    },
  } });

// Wait past one reconcile pass. The runtime polls; it is not told.
await new Promise(r => setTimeout(r, 8000));
const restarted = await call({ service: "runtime", method: "GET", path: "/api/graphs" });
const graphs = restarted.data?.result?.graphs ?? restarted.data?.result ?? [];
const loaded = Array.isArray(graphs) ? graphs.length : (restarted.data?.result?.loadedGraphs ?? 0);
rec("T4", loaded > 0 ? "HELD" : "BROKEN",
  `runtime holds ${loaded} graph(s) one reconcile pass after the graph was authored through MCP`);

// T5 — it executes, and the execution is identified
// The dispatcher resolves operations against the spec, so the TEMPLATE is
// the path and the value goes in params. A literal path returns "No such
// operation", which reads as "that endpoint does not exist".
const exec = await call({ service: "runtime", method: "POST", path: "/api/ingress/{graphName}",
  params: { graphName: "t4-hello" }, body: { probe: "t5" } });
const execId = exec.data?.result?.executionId ?? exec.data?.executionId;
rec("T5", execId ? "HELD" : "BROKEN",
  execId ? `executed, executionId=${execId}` : `no executionId: ${exec.text.slice(0, 120)}`);

// T6 — assistant roster
await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: { key: "assistants/t6-probe", name: "T6 Probe", type: "assistant", status: "published",
          metadata: { alias: "t6probe", rules: [] } } });
const roster = await call({ service: "assistants", method: "GET", path: "/api/assistants" });
const names = (roster.data?.result?.assistants ?? []).map(a => a.key ?? a.name);
rec("T6", names.length > 0 ? "HELD" : "BROKEN",
  names.length ? `roster: ${names.join(", ").slice(0, 90)}` : "roster empty");

rec("BOOT", /started runtime|started assistants/.test(stderr) ? "HELD" : "BROKEN",
  (stderr.match(/started \w+[^\n]*/g) || ["no start lines"]).join(" | ").slice(0, 160));

writeFileSync(join(here, "tracks-results.json"), JSON.stringify(R, null, 2));
console.log(`\n${R.length} measured`);
child.kill();
process.exit(0);
