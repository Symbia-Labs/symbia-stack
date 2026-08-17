/**
 * Exit measurement for the diagnostics gap. Predictions registered through
 * the sidecar first: `contexts/map-diagnostics-gap`, resource
 * b1b6db37-cf72-4e40-af4c-5a28a046d054.
 *
 * G1 a request-window pairing surfaces the cause of a generic error
 * G2 concurrency makes the pairing ambiguous, and it says so
 * G3 the underlying cause is captured verbatim
 * G4 the shell detour is unnecessary for this shape of defect
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

let nextId = 1000;
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
const rec = (id, ok, note) => console.log(`${id} ${ok ? "HELD  " : "BROKEN"} ${note}`);

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "diag", version: "1" } } });
await wait(1);
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
await new Promise((r) => setTimeout(r, 18000));

// Provoke a failure whose response body says nothing useful.
await tool("symbia_call", { service: "logging", method: "POST", path: "/api/logs/ingest", body: { entries: [{ level: "info", message: "no streamId" }] } });
// And one that is a genuine server-side fault, not a validation refusal.
await tool("symbia_call", { service: "catalog", method: "GET", path: "/api/resources/{id}", params: { id: "not-a-uuid" } });
await new Promise((r) => setTimeout(r, 1500));

const d = await tool("symbia_diagnose", { limit: 10 });
const failures = d.data?.failures ?? [];
rec("G1", failures.length > 0 && failures.some((f) => (f.lines ?? []).length > 0),
  `${failures.length} failure(s) recorded, ${failures.filter((f) => (f.lines ?? []).length).length} with log lines attached`);

rec("G2", Array.isArray(d.data?.caveats) && d.data.caveats.length >= 2 && /approximate/.test(d.data?.correlation ?? ""),
  `correlation declared "${d.data?.correlation}" with ${d.data?.caveats?.length ?? 0} caveat(s)`);

const withLines = failures.find((f) => (f.lines ?? []).length > 0);
rec("G3", !!withLines,
  withLines
    ? `${withLines.method} ${withLines.path} ${withLines.status} -> ${(withLines.lines[0] ?? "").slice(0, 90)}`
    : "no failure carried any lines");

rec("G4", !d.isError && failures.length > 0,
  `symbia_diagnose answered from the tool surface — no shell required`);

console.log(`\nring: ${d.data?.ringHeld} of ${d.data?.ringMax} lines held`);
for (const f of failures.slice(0, 3)) {
  console.log(`\n${f.method} ${f.path} -> ${f.status}`);
  for (const l of (f.lines ?? []).slice(0, 4)) console.log(`   ${l.slice(0, 110)}`);
}
child.kill();
process.exit(0);
