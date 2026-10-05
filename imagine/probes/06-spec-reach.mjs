/**
 * Track 2. Which services can be asked what they do, inside imagine?
 *
 * The dispatcher resolves every call against a service's OpenAPI document.
 * A service whose document is unreachable has no operations, so nothing it
 * exposes can be called at all — the tools report "no such operation",
 * which reads as absence rather than as an unreachable spec.
 *
 * Prediction, registered before the run:
 *   R1  every one of the ten mounted services returns > 0 operations
 *   R2  models returns > 0 (it 404'd on 15 Aug: doc routes come from
 *       createSymbiaServer, which no host but index.ts runs)
 *   R3  integrations exposes POST /api/integrations/download
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

let nextId = 500;
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
  return r?.result?.content?.[0]?.text ?? "no response";
}

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "reach", version: "1" } } });
await wait(1);
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
await new Promise(r => setTimeout(r, 15000));

const services = ["catalog", "identity", "integrations", "models", "logging", "directory", "network", "messaging", "runtime", "assistants"];
const counts = {};
let downloadOp = null;
for (const s of services) {
  const text = await tool("symbia_list_operations", { service: s });
  let arr = [];
  try {
    const d = JSON.parse(text);
    arr = d.result?.operations ?? d.operations ?? [];
  } catch { arr = []; }
  counts[s] = arr.length;
  if (s === "integrations") {
    downloadOp = arr.find((o) => /download/i.test(o.path ?? o.operationId ?? "")) ?? null;
  }
  console.log(`${s.padEnd(14)} ${String(arr.length).padStart(3)} operations${arr.length ? "" : `  <-- ${text.slice(0, 140).replace(/\s+/g, " ")}`}`);
}

console.log("");
const zero = services.filter((s) => counts[s] === 0);
console.log(`R1 ${zero.length === 0 ? "HELD" : "BROKEN"}  ${zero.length ? `unreachable: ${zero.join(", ")}` : "all ten services answer"}`);
console.log(`R2 ${counts.models > 0 ? "HELD" : "BROKEN"}  models: ${counts.models} operations`);
console.log(`R3 ${downloadOp ? "HELD" : "BROKEN"}  ${downloadOp ? `${downloadOp.method} ${downloadOp.path}` : "no download operation in integrations"}`);

// Listed is not callable. Ask each newly-reachable service one real
// question and read the answer.
const modelsCall = await tool("symbia_call", { service: "models", method: "GET", path: "/api/models" });
const dirCall = await tool("symbia_call", { service: "directory", method: "GET", path: "/api/stats" });
const okM = /"wrote"/.test(modelsCall) && !/No such operation/.test(modelsCall);
const okD = /"wrote"/.test(dirCall) && !/No such operation/.test(dirCall);
console.log(`R4 ${okM ? "HELD" : "BROKEN"}  models GET /api/models -> ${modelsCall.slice(0, 110).replace(/\s+/g, " ")}`);
console.log(`R5 ${okD ? "HELD" : "BROKEN"}  directory GET /api/stats -> ${dirCall.slice(0, 110).replace(/\s+/g, " ")}`);

const spec404 = err.split("\n").filter((l) => /openapi|spec|404/i.test(l)).slice(-6);
if (spec404.length) console.log("\nserver log:\n  " + spec404.join("\n  "));

child.kill();
process.exit(0);
