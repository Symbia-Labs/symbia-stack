/**
 * Author a few artifacts through MCP, then seal the session.
 *
 * Produces the file Track 4 imports. Everything here goes through the same
 * tools a client has — no direct writes to the store.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyFileSync, mkdirSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const child = spawn("/opt/homebrew/bin/node", [join(here, "sidecar.mjs")], {
  stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "" },
});
let buf = "";
const seen = new Map();
child.stdout.on("data", (c) => {
  buf += c.toString(); let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!l) continue;
    try { const m = JSON.parse(l); if (m.id !== undefined) seen.set(m.id, m); } catch {}
  }
});
child.stderr.on("data", () => {});

let nextId = 600;
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
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
const call = (a) => tool("symbia_call", a);

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "seal", version: "1" } } });
await wait(1);
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
await new Promise(r => setTimeout(r, 15000));

const authored = [
  { key: "contexts/incident-window", name: "Incident window", type: "context", status: "published",
    metadata: { note: "The interval under review", start: "2026-08-16T00:00:00Z", end: "2026-08-16T06:00:00Z" } },
  { key: "graphs/incident-digest", name: "Incident digest", type: "graph", status: "published",
    metadata: {
      role: "pipeline", ingress: { node: "entry", port: "in" },
      definition: {
        symbia: "graph/1.0", name: "incident-digest", version: "0.1.0",
        nodes: [
          { id: "entry", component: "symbia.io.passthrough" },
          { id: "log", component: "symbia.sink.log", config: { level: "info", message: "incident-digest:" } },
        ],
        edges: [{ id: "e1", source: { node: "entry", port: "out" }, target: { node: "log", port: "in" } }],
        metadata: { role: "pipeline", ingress: { node: "entry", port: "in" } },
      },
    } },
  { key: "assistants/incident-reader", name: "Incident reader", type: "assistant", status: "published",
    metadata: { alias: "incident-reader", rules: [] } },
];

for (const body of authored) {
  const r = await call({ service: "catalog", method: "POST", path: "/api/resources", body });
  console.log(`authored ${body.key}: ${r.wrote ? "ok" : JSON.stringify(r).slice(0, 120)}`);
}

const sealed = await call({ service: "catalog", method: "GET", path: "/api/resources" });
const held = Array.isArray(sealed.result) ? sealed.result.length : JSON.stringify(sealed).slice(0, 200);
console.log(`catalog now holds ${held} resources`);

// The seal endpoint is on the sidecar host, not a mounted service, so it is
// reached over loopback rather than through the dispatcher.
const self = await tool("symbia_selftest");
// selftest reports the origin it addressed as loopback.url, with a trailing
// slash. That is the only place the sidecar's ephemeral port is stated.
const base = (self?.loopback?.url ?? "").replace(/\/$/, "");
console.log(`sealing via ${base}/session/seal`);
const res = await fetch(`${base}/session/seal`, { method: "POST" });
const out = await res.json();
console.log(JSON.stringify(out, null, 2).slice(0, 400));

if (out.sealed) {
  const dest = join(here, "..", "imagine-import", "fixtures");
  mkdirSync(dest, { recursive: true });
  copyFileSync(out.sealed, join(dest, "bundle.json"));
  console.log(`\ncopied to experiments/imagine-import/fixtures/bundle.json`);
}

child.kill();
process.exit(0);
