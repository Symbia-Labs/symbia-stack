/**
 * D3 exit measurement. Predictions were registered THROUGH THE SIDECAR
 * before any diagnosis ran — `contexts/map-d3-logging-500s`, resource
 * 8feae3b6-5ee1-43e1-8220-02fda7506c5d, in that session's chain.
 *
 * L1 the 500 is a store/schema problem in the sidecar, not service code
 * L2 the write path works even though reads 500          [expected wrong]
 * L3 one cause for every failing endpoint
 * L4 the boot log names the real cause
 * L5 a graph execution's log entry carries its executionId
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const child = spawn("/opt/homebrew/bin/node", [join(here, "..", "standalone", "sidecar.mjs")], {
  stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "" },
});
let buf = "", err = "";
const seen = new Map();
child.stdout.on("data", (c) => {
  buf += c.toString(); let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!l) continue;
    try { const m = JSON.parse(l); if (m.id !== undefined) seen.set(m.id, m); } catch {}
  }
});
child.stderr.on("data", (c) => { err += c.toString(); });

let nextId = 900;
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
  const text = r?.result?.content?.[0]?.text ?? "";
  let data = null; try { data = JSON.parse(text); } catch {}
  return { isError: !!r?.result?.isError, text, data };
}
const call = (a) => tool("symbia_call", a);
const rec = (id, ok, note) => console.log(`${id} ${ok ? "HELD  " : "BROKEN"} ${note}`);

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "d3", version: "1" } } });
await wait(1);
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
await new Promise((r) => setTimeout(r, 18000));

const streams = await call({ service: "logging", method: "GET", path: "/api/logs/streams" });
const query = await call({ service: "logging", method: "POST", path: "/api/logs/query", body: { limit: 5 } });
const ingest = await call({ service: "logging", method: "POST", path: "/api/logs/ingest", body: {
  entries: [{ level: "info", message: "D3 exit probe", service: "probe", timestamp: new Date().toISOString() }],
} });

rec("L1", !streams.isError && !query.isError,
  `after schema bootstrap: streams ${streams.isError ? "500" : "ok"}, query ${query.isError ? "500" : "ok"} — the service code was never at fault`);
rec("L2", false, `ingest 500'd BEFORE the fix too, so reads and writes failed together — the split I predicted did not exist`);
rec("L3", !streams.isError && !query.isError && !ingest.isError,
  `all three endpoints ${[streams, query, ingest].every((r) => !r.isError) ? "answer" : "do not answer"} after one fix — one cause`);
rec("L4", false, `the boot log was clean; the store started fine and failed only at query time`);

// L5 — a graph execution's log entry, read back through the service
await call({ service: "catalog", method: "POST", path: "/api/resources", body: {
  key: "graphs/d3-exec", name: "D3 exec", type: "graph", status: "published",
  metadata: {
    role: "pipeline", ingress: { node: "entry", port: "in" },
    definition: {
      symbia: "graph/1.0", name: "d3-exec", version: "0.1.0",
      nodes: [
        { id: "entry", component: "symbia.io.passthrough" },
        { id: "log", component: "symbia.sink.log", config: { level: "info", message: "d3-exec:" } },
      ],
      edges: [{ id: "e1", source: { node: "entry", port: "out" }, target: { node: "log", port: "in" } }],
      metadata: { role: "pipeline", ingress: { node: "entry", port: "in" } },
    },
  },
} });
await new Promise((r) => setTimeout(r, 8000));
const exec = await call({ service: "runtime", method: "POST", path: "/api/ingress/{graphName}",
  params: { graphName: "d3-exec" }, body: { probe: "d3" } });
const execId = exec.data?.result?.executionId;
await new Promise((r) => setTimeout(r, 4000));

const back = await call({ service: "logging", method: "POST", path: "/api/logs/query", body: { limit: 50 } });
const hay = JSON.stringify(back.data ?? back.text);
rec("L5", !!execId && hay.includes(execId),
  execId
    ? `executionId ${execId} ${hay.includes(execId) ? "found in the log service" : "NOT found — the sink's own record still cannot be read back"}`
    : "no executionId returned");

console.log(`\nquery returned: ${back.text.slice(0, 200).replace(/\s+/g, " ")}`);
child.kill();
process.exit(0);
