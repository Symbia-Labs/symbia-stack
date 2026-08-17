/**
 * What does the connector cost in context, and where (if anywhere) does it
 * save any?
 *
 * Three things are measurable without guessing at a tokenizer: the bytes of
 * the tool list a client must hold for the whole session, the bytes of the
 * whole operation surface if each operation were its own tool, and the bytes
 * of one description fetched on demand.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const child = spawn("/opt/homebrew/bin/node", [join(here, "..", "standalone", "sidecar.mjs")], {
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

let nextId = 400;
const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");
const wait = async (id, ms = 40000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (seen.has(id)) return seen.get(id); await new Promise(r => setTimeout(r, 120)); }
  return null;
};
async function rpc(method, params) {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method, params });
  return await wait(id);
}
const tool = async (name, args = {}) => {
  const r = await rpc("tools/call", { name, arguments: args });
  return r?.result?.content?.[0]?.text ?? "";
};

// ~4 chars per token is the usual rough conversion; reported as an estimate,
// not a count, because the client's tokenizer is not this process's business.
const tok = (n) => Math.round(n / 4);

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "cost", version: "1" } } });
await wait(1);
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
await new Promise(r => setTimeout(r, 15000));

const list = await rpc("tools/list", {});
const tools = list?.result?.tools ?? [];
const listBytes = JSON.stringify(tools).length;
console.log(`TOOL LIST      ${tools.length} tools, ${listBytes} bytes (~${tok(listBytes)} tokens) — paid once per session`);

// The whole operation surface, as it would be if each operation were a tool.
let ops = 0, opBytes = 0;
const services = ["catalog", "identity", "integrations", "models", "logging", "directory", "network", "messaging", "runtime", "assistants"];
for (const s of services) {
  const text = await tool("symbia_list_operations", { service: s });
  try {
    const d = JSON.parse(text);
    const arr = d.result?.operations ?? d.operations ?? [];
    ops += arr.length; opBytes += JSON.stringify(arr).length;
  } catch {}
}
console.log(`OPERATIONS     ${ops} operations across ${services.length} services, ${opBytes} bytes (~${tok(opBytes)} tokens) if all were resident`);

const one = await tool("symbia_describe_operation", { service: "catalog", operationId: "post_resources" });
console.log(`ONE DESCRIBE   ${one.length} bytes (~${tok(one.length)} tokens) — paid only when needed`);

const listing = await tool("symbia_call", { service: "catalog", method: "GET", path: "/api/resources" });
console.log(`ONE RESULT     ${listing.length} bytes (~${tok(listing.length)} tokens) for a full catalog listing`);

console.log(`\nRESIDENT COST  dispatcher ${tok(listBytes)} vs 1:1 ${tok(opBytes)} tokens — ratio ${(opBytes / listBytes).toFixed(1)}x`);
child.kill();
process.exit(0);
