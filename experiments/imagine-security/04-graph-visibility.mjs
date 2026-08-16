/**
 * The runtime reconciles `type=graph, status=published` and finds nothing,
 * while the catalog reports 52 accessible resources. Either the write is
 * being rejected, or it lands somewhere the runtime's identity cannot see.
 * This asks both questions in one session.
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

let nextId = 300;
const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");
const wait = async (id, ms = 40000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (seen.has(id)) return seen.get(id); await new Promise(r => setTimeout(r, 120)); }
  return null;
};
async function call(args) {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "symbia_call", arguments: args } });
  const r = await wait(id);
  const text = r?.result?.content?.[0]?.text ?? "no response";
  let data = null; try { data = JSON.parse(text); } catch {}
  return { text, data };
}

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "vis", version: "1" } } });
await wait(1);
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
await new Promise(r => setTimeout(r, 15000));

const created = await call({ service: "catalog", method: "POST", path: "/api/resources", body: {
  key: "graphs/vis-probe", name: "vis probe", type: "graph", status: "published",
  metadata: {
    definition: {
      symbia: "graph/1.0", name: "vis-probe", version: "0.1.0",
      nodes: [
        { id: "entry", component: "symbia.io.passthrough" },
        { id: "log", component: "symbia.sink.log", config: { level: "info", message: "vis-probe:" } },
      ],
      edges: [{ id: "e1", source: { node: "entry", port: "out" }, target: { node: "log", port: "in" } }],
      metadata: { role: "probe", ingress: { node: "entry", port: "in" } },
    },
  },
} });
console.log("1. WRITE     :", created.text.slice(0, 260));

const asClient = await call({ service: "catalog", method: "GET", path: "/api/resources", params: { type: "graph" } });
const rows = asClient.data?.result ?? [];
console.log("2. CLIENT SEES:", Array.isArray(rows) ? `${rows.length} graph(s): ${rows.map(r => `${r.key}[status=${r.status},org=${r.orgId}]`).join(", ")}` : asClient.text.slice(0, 200));

await new Promise(r => setTimeout(r, 9000));
const rt = await call({ service: "runtime", method: "GET", path: "/api/graphs" });
console.log("3. RUNTIME   :", rt.text.slice(0, 300));

const marks = err.split("\n").filter(l => /After type filter|Total accessible|CatalogSync/.test(l)).slice(-8);
console.log("4. SERVER LOG:\n   " + marks.join("\n   "));

child.kill();
process.exit(0);
