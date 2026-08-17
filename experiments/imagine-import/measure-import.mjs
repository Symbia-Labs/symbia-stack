/**
 * I4-I7, measured against a SECOND sidecar acting as the target host.
 *
 * What this establishes: the importer speaks only the public catalog API,
 * records provenance in a ledger, threads a fresh chain, and behaves some
 * particular way on a repeat import.
 *
 * What it does NOT establish: behaviour against the deployed stack. The
 * target here has the same one-origin addressing and the same catalog
 * routes, but it is pg-mem with an ephemeral identity, not Postgres with a
 * real one. Auth and RLS are the parts most likely to differ, and they are
 * exactly the parts this cannot see. Recorded rather than glossed.
 */
import { spawn, execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const target = spawn("/opt/homebrew/bin/node", [join(here, "..", "standalone", "sidecar.mjs")], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: "", IMAGINE_SESSION_DIR: join(here, ".target-session") },
});
let buf = "";
const seen = new Map();
target.stdout.on("data", (c) => {
  buf += c.toString(); let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!l) continue;
    try { const m = JSON.parse(l); if (m.id !== undefined) seen.set(m.id, m); } catch {}
  }
});
target.stderr.on("data", () => {});

const send = (o) => target.stdin.write(JSON.stringify(o) + "\n");
const wait = async (id, ms = 40000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (seen.has(id)) return seen.get(id); await new Promise(r => setTimeout(r, 120)); }
  return null;
};
let nextId = 700;
async function tool(name, args = {}) {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
  const r = await wait(id);
  const t = r?.result?.content?.[0]?.text ?? "";
  try { return JSON.parse(t); } catch { return { raw: t }; }
}

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "target", version: "1" } } });
await wait(1);
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
await new Promise(r => setTimeout(r, 15000));

const self = await tool("symbia_selftest");
const base = (self?.loopback?.url ?? "").replace(/\/$/, "");
console.log(`target host  ${base}\n`);

const runImport = () => {
  try {
    return execFileSync("/opt/homebrew/bin/node",
      [join(here, "import-bundle.mjs"), join(here, "fixtures", "bundle.json"),
       "--target", base, "--email", "dev@example.com", "--password", "password123"],
      { encoding: "utf8" });
  } catch (e) { return (e.stdout ?? "") + (e.stderr ?? ""); }
};

const first = runImport();
console.log(first.split("\n").filter((l) => /^(registered|refused|ledger|import head|auth|importing)/.test(l)).join("\n"));

const regCount = Number(/^registered\s+(\d+)/m.exec(first)?.[1] ?? -1);
const refCount = Number(/^refused\s+(\d+)/m.exec(first)?.[1] ?? -1);
console.log(`\nI4 ${regCount > 0 ? "HELD" : "BROKEN"}  ${regCount} artifacts registered through the public API`);

const ledgerPath = /^ledger\s+(.+)$/m.exec(first)?.[1]?.trim();
let ok5 = false, ok6 = false;
if (ledgerPath) {
  const lines = readFileSync(ledgerPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  ok5 = lines.length > 0 && lines.every((e) => e.event_type === "artifact.registered" && e.payload?.extra?.bundleDigest);
  ok6 = lines[0]?.parent_links?.[0] === null;
  console.log(`I5 ${ok5 ? "HELD" : "BROKEN"}  ${lines.length} artifact.registered events, each naming the bundle digest`);
  console.log(`I6 ${ok6 ? "HELD" : "BROKEN"}  first event parents=${JSON.stringify(lines[0]?.parent_links)}, actor=${lines[0]?.actor_identity}`);
} else {
  console.log("I5 BROKEN  no ledger written");
  console.log("I6 BROKEN  no ledger written");
}

// I7 — the same bundle, twice
const second = runImport();
const reg2 = Number(/^registered\s+(\d+)/m.exec(second)?.[1] ?? -1);
const ref2 = Number(/^refused\s+(\d+)/m.exec(second)?.[1] ?? -1);
const refusalDetail = second.split("\n").filter((l) => /^\s{2}\S+\s+\d{3}\s/.test(l))[0] ?? "";
console.log(`\nI7 ${reg2 === 0 && ref2 > 0 ? "HELD" : "BROKEN"}  second import: ${reg2} registered, ${ref2} refused`);
if (refusalDetail) console.log(`   refusal says: ${refusalDetail.trim().slice(0, 150)}`);

target.kill();
process.exit(0);
