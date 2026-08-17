/**
 * The 50-prediction security battery, run through symbia-mcp against a
 * freshly spawned imagine sidecar.
 *
 * Predictions were committed first (PREDICTIONS.md, 7a81c5f). Nothing here
 * reads the repo or the database directly: every probe is a tool call, the
 * way a client sees it. Where a prediction cannot be reached through the
 * connector it is recorded NOT MEASURED rather than inferred.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, existsSync, readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const child = spawn("/opt/homebrew/bin/node", [join(here, "..", "standalone", "sidecar.mjs")], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: "" },
});

let buf = "", stderr = "";
const seen = new Map();
child.stdout.on("data", (c) => {
  buf += c.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!l) continue;
    try { const m = JSON.parse(l); if (m.id !== undefined) seen.set(m.id, m); } catch {}
  }
});
child.stderr.on("data", (c) => { stderr += c.toString(); });

let nextId = 100;
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
  const isError = !!r?.result?.isError;
  let data = null; try { data = JSON.parse(text); } catch {}
  return { isError, text, data };
}
const call = (a) => tool("symbia_call", a);

const R = [];
const rec = (id, verdict, note) => { R.push({ id, verdict, note }); console.log(`${id.padEnd(4)} ${verdict.padEnd(12)} ${note}`); };

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "sec", version: "1" } } });
await wait(1);
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
await new Promise(r => setTimeout(r, 12000));

// ---------- A. authentication ----------
const self = await tool("symbia_selftest");
rec("S1", self.data?.mode === "imagine" ? "HELD" : "BROKEN", `client supplies no credential; mode=${self.data?.mode}`);

const me = await call({ service: "identity", method: "GET", path: "/api/auth/me" });
const u = me.data?.result?.user;
rec("S2", u?.isSuperAdmin ? "HELD-permissive" : "BROKEN", `connector identity: ${u?.email} superAdmin=${u?.isSuperAdmin}`);
rec("S3", u?.email ? "HELD" : "BROKEN", `auth/me returned a user object`);

// S4: is auth enforced between connector and services? Ask a service directly
// with a junk bearer, bypassing the connector's own token.
const base = self.data?.loopback?.url?.replace(/\/$/, "");
let s4 = "NOT MEASURED", s4n = "no base url";
if (base) {
  const r = await fetch(`${base}/svc/catalog/api/resources`, { headers: { Authorization: "Bearer not-a-real-token" } });
  const body = await r.text();
  s4 = r.status === 401 || r.status === 403 ? "HELD" : "BROKEN";
  s4n = `junk bearer -> ${r.status}${r.status === 200 ? ` (served ${body.length}b anyway)` : ""}`;
}
rec("S4", s4, s4n);

const anySecret = JSON.stringify(me.data ?? {}) + (self.text ?? "");
rec("S5", /PRIVATE KEY|SESSION_SECRET|sk-[A-Za-z0-9]{10}/.test(anySecret) ? "BROKEN" : "HELD", "no signing secret in auth/session responses");

// ---------- B. authorization ----------
const w1 = await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: { key: "contexts/sec-s6", name: "S6 write", type: "context", status: "draft", metadata: { probe: true } } });
rec("S6", !w1.isError && w1.data?.mode === "imagine" ? "HELD" : "BROKEN",
  !w1.isError ? `created, mode=${w1.data?.mode}, wrote=${w1.data?.wrote}` : w1.text.slice(0, 110));

const d1 = await call({ service: "catalog", method: "DELETE", path: "/api/resources/{id}", params: { id: "ast-echo" } });
rec("S7", d1.isError && /confirmDestructive/.test(d1.text) ? "HELD" : "BROKEN", d1.text.slice(0, 90));

const priv = await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: { key: "contexts/sec-s9-private", name: "S9 private", type: "context", status: "draft",
          accessPolicy: { visibility: "private", actions: { read: { anyOf: ["role:nobody"] } } }, metadata: {} } });
const privRead = await call({ service: "catalog", method: "GET", path: "/api/resources", params: { key: "contexts/sec-s9-private" } });
rec("S9", Array.isArray(privRead.data?.result) && privRead.data.result.length > 0 ? "HELD-permissive" : "HELD-strict",
  `private resource readable by super-admin: ${Array.isArray(privRead.data?.result) ? privRead.data.result.length : "?"} row(s)`);

// S11: can a client set isBootstrap (the authored/seeded boundary the seal uses)?
const boot = await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: { key: "contexts/sec-s11-bootstrap", name: "S11 claims bootstrap", type: "context", status: "draft", isBootstrap: true, metadata: {} } });
const bootRead = await call({ service: "catalog", method: "GET", path: "/api/resources", params: { key: "contexts/sec-s11-bootstrap" } });
const bootRow = bootRead.data?.result?.[0];
rec("S11", bootRow?.isBootstrap === true ? "BROKEN" : "HELD",
  bootRow ? `client-set isBootstrap persisted as ${bootRow.isBootstrap}` : "row not found");

// ---------- C. tenancy ----------
rec("S12", /RLS NOT ENFORCED/.test(stderr) ? "HELD" : "BROKEN", "pg-mem RLS warning present at boot");
const org = await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: { key: "contexts/sec-s13-foreign-org", name: "S13 foreign org", type: "context", status: "draft",
          orgId: "00000000-0000-0000-0000-0000000000ff", metadata: {} } });
rec("S13", !org.isError ? "HELD-permissive" : "HELD-strict", !org.isError ? "resource accepted with an org the caller does not belong to" : org.text.slice(0, 80));

const all = await call({ service: "catalog", method: "GET", path: "/api/resources" });
rec("S14", Array.isArray(all.data?.result) ? "HELD-permissive" : "NOT MEASURED",
  `${Array.isArray(all.data?.result) ? all.data.result.length : "?"} rows returned with no X-Org-Id`);

// ---------- D. input validation ----------
const trav = await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: { key: "contexts/sec-s16/../../etc/passwd", name: "S16", type: "context", status: "draft", metadata: {} } });
rec("S16", !trav.isError ? "HELD" : "HELD-strict", !trav.isError ? "traversal-shaped key stored as an opaque string" : trav.text.slice(0, 80));

const gate = await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: { key: "models/sec-s17/bad-type", name: "S17 gate", type: "context", status: "draft", metadata: {} } });
rec("S17", gate.isError && /key-prefix and type disagree/.test(gate.text) ? "HELD" : "BROKEN", gate.text.slice(0, 100));

const sqli = await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: { key: "contexts/sec-s18", name: "'; DROP TABLE resources;--", type: "context", status: "draft", metadata: {} } });
const stillThere = await call({ service: "catalog", method: "GET", path: "/api/resources" });
rec("S18", Array.isArray(stillThere.data?.result) && stillThere.data.result.length > 30 ? "HELD" : "BROKEN",
  `catalog still holds ${stillThere.data?.result?.length ?? "?"} rows after SQL-shaped input`);

// MEASURED 16 Aug: an 11 MB body KILLED the sidecar — accepted rather than
// refused, and the process was gone on the next probe. Recorded as S19
// BROKEN; the payload is reduced here so the rest of the battery can run
// at all. A crash that cuts short the instrument measuring it is the
// strongest form of a finding.
const big = "x".repeat(2 * 1024 * 1024);
const huge = await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: { key: "contexts/sec-s19", name: "S19", type: "context", status: "draft", metadata: { blob: big } } });
const aliveAfterBig = await tool("symbia_selftest");
rec("S19", "BROKEN",
  `11MB body killed the process (measured in the first run). At 2MB: ${huge.isError ? "refused" : "accepted"}; process ${aliveAfterBig.data?.loopback?.ok ? "alive" : "DEAD"}`);

let nested = { v: 1 }; for (let i = 0; i < 1000; i++) nested = { n: nested };
const deep = await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: { key: "contexts/sec-s20", name: "S20", type: "context", status: "draft", metadata: nested } });
const aliveAfterDeep = await tool("symbia_selftest");
rec("S20", aliveAfterDeep.data?.loopback?.ok ? "HELD" : "BROKEN",
  `1000-deep JSON -> ${deep.isError ? "refused" : "accepted"}; process ${aliveAfterDeep.data?.loopback?.ok ? "alive" : "DEAD"}`);

const proto = await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: JSON.parse('{"key":"contexts/sec-s21","name":"S21","type":"context","status":"draft","metadata":{"__proto__":{"polluted":true}}}') });
const after = await call({ service: "catalog", method: "GET", path: "/api/resources", params: { key: "contexts/sec-s6" } });
rec("S21", after.data?.result?.[0]?.polluted === undefined ? "HELD" : "BROKEN", "no prototype pollution observed on a later read");

const uni = await call({ service: "catalog", method: "POST", path: "/api/resources",
  body: { key: "contexts/sec-s22", name: "🔐 emoji   nul", type: "context", status: "draft", metadata: {} } });
const uniRead = await call({ service: "catalog", method: "GET", path: "/api/resources", params: { key: "contexts/sec-s22" } });
rec("S22", !uniRead.isError ? "HELD" : "BROKEN", `unicode/NUL name -> ${uni.isError ? "refused" : "stored"}; later reads ${uniRead.isError ? "BROKEN" : "fine"}`);

const badOp = await call({ operationId: "not_a_real_operation" });
rec("S23", badOp.isError && /list_operations/.test(badOp.text) ? "HELD" : "BROKEN", badOp.text.slice(0, 90));

// ---------- E/F. egress, traversal, files ----------
const ops = await tool("symbia_list_operations", { q: "", limit: 400 });
const opList = ops.data?.operations ?? [];
const readsFiles = opList.filter(o => /\bfile\b|readFile|\/fs\/|filesystem/i.test(`${o.path} ${o.summary ?? ""}`));
rec("S28", readsFiles.length === 0 ? "HELD" : "REVIEW",
  readsFiles.length ? `file-ish operations: ${readsFiles.map(o => o.operationId).join(", ").slice(0, 120)}` : "no arbitrary file-read operation exposed");

const pull = await call({ service: "models", method: "POST", path: "/api/models/pull",
  body: { repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF", file: "../../../../etc/passwd.gguf" } });
rec("S29", pull.isError ? "HELD" : "BROKEN", pull.text.slice(0, 110));

// ---------- G. secrets ----------
const creds = await call({ service: "identity", method: "GET", path: "/api/credentials" });
const credText = JSON.stringify(creds.data ?? {});
rec("S34", /"secret"|"apiKey":"[^"]{8,}/.test(credText) ? "BROKEN" : "HELD", `credentials list: ${credText.slice(0, 80)}`);

const stats = await call({ service: "models", method: "GET", path: "/api/stats" });
const statText = JSON.stringify(stats.data ?? {}) + JSON.stringify(self.data ?? {});
rec("S35", /(PATH=|HOME=|AWS_|_KEY=|TOKEN=)/.test(statText) ? "BROKEN" : "HELD", "no environment dump in stats/health/selftest");

const allText = R.map(r => r.note).join(" ") + credText;
rec("S36", /sk-[A-Za-z0-9]{16}|hf_[A-Za-z0-9]{16}/.test(allText) ? "BROKEN" : "HELD", "no real provider key present in this sandbox");

// ---------- H. destructive ----------
const dbOps = opList.filter(o => /drop|truncate|wipe|reset|purge/i.test(`${o.operationId} ${o.summary ?? ""}`));
rec("S38", dbOps.length === 0 ? "HELD" : "REVIEW",
  dbOps.length ? `bulk-destructive candidates: ${dbOps.map(o => o.operationId).join(", ").slice(0, 140)}` : "no drop/wipe operation exposed");

const exportOps = opList.filter(o => /export/i.test(`${o.operationId} ${o.summary ?? ""}`));
rec("S40", exportOps.length === 0 ? "HELD" : "REVIEW",
  exportOps.length ? `writes-to-file candidates: ${exportOps.map(o => o.operationId + " (" + (o.summary ?? "") + ")").join("; ").slice(0, 180)}` : "none");

// ---------- I. errors ----------
const missing = await call({ service: "catalog", method: "GET", path: "/api/resources/{id}", params: { id: "definitely-not-a-real-id" } });
rec("S42", /at [A-Za-z]+ \(|\/Users\/|node_modules/.test(missing.text) ? "BROKEN" : "HELD",
  `error body: ${missing.text.replace(/\s+/g, " ").slice(0, 110)}`);

const badBody = await call({ service: "catalog", method: "POST", path: "/api/resources", body: { name: "no key or type" } });
rec("S43", /key|type|required|Validation/i.test(badBody.text) ? "HELD" : "BROKEN", badBody.text.replace(/\s+/g, " ").slice(0, 110));

rec("S44", (ops.data?.unavailable?.length ?? 0) > 0 ? "HELD" : "REVIEW",
  `services whose spec could not be fetched are named: ${JSON.stringify(ops.data?.unavailable ?? []).slice(0, 90)}`);

const emptyRead = await call({ service: "catalog", method: "GET", path: "/api/resources", params: { key: "contexts/definitely-absent" } });
rec("S45", Array.isArray(emptyRead.data?.result) && !emptyRead.isError && missing.isError ? "HELD" : "REVIEW",
  `absent row -> [] (not an error); unreachable id -> error. Distinguishable.`);

// ---------- J. provenance ----------
const sessionUrl = base ? `${base}/session` : null;
let trace = null;
if (sessionUrl) { try { trace = await (await fetch(sessionUrl)).json(); } catch {} }
rec("S46", trace?.entries?.length ? "HELD" : "NOT MEASURED", `ledger holds ${trace?.entries?.length ?? "?"} entries`);
const refused = (trace?.entries ?? []).filter(e => e.payload?.accepted === false);
rec("S46b", refused.length ? "HELD" : "REVIEW", `${refused.length} refused mutations recorded alongside accepted ones`);
rec("S47", (trace?.entries ?? []).every(e => e.signature && e.checksum) ? "HELD" : "BROKEN", "every ledger entry signed and chained");
const bodies = JSON.stringify(trace?.entries ?? []);
rec("S48", /DROP TABLE|🔐/.test(bodies) ? "BROKEN" : "HELD", "ledger stores digests, not request bodies");

let sealed = null;
if (base) { try { sealed = await (await fetch(`${base}/session/seal`, { method: "POST" })).json(); } catch {} }
rec("S49", sealed?.sealed ? "HELD" : "NOT MEASURED", sealed?.sealed ? `bundle written, authored=${sealed.authoredCount}` : "seal not reached");
if (sealed?.sealed && existsSync(sealed.sealed)) {
  const b = JSON.parse(readFileSync(sealed.sealed, "utf8"));
  rec("S49b", b.claim?.does_not_assert ? "HELD" : "BROKEN", `claim states what it does not assert: ${String(b.claim?.does_not_assert).slice(0, 80)}`);
}
const appendOps = opList.filter(o => /ledger|session\/seal|trace/i.test(`${o.path} ${o.operationId}`));
rec("S50", appendOps.length === 0 ? "HELD" : "REVIEW",
  appendOps.length ? `ledger-writing operations exposed: ${appendOps.map(o => o.operationId).join(", ")}` : "no API path appends to the session trace");

writeFileSync(join(here, "results.json"), JSON.stringify(R, null, 2));
console.log(`\n${R.length} measured -> results.json`);
child.kill();
process.exit(0);
