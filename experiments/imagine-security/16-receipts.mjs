/**
 * E1-E5. Does a port's declared lane reach any code, and what does a receipt cost?
 *
 * Predictions registered BEFORE any of this ran:
 * `contexts/map-receipts-at-emit`, resource 9710b268-a2f8-45c3-8533-b41554da156b.
 *
 * E1 the manifest's per-port lane declaration now changes an observed lane
 * E2 more than half the registered components declare a lane   [expected wrong]
 * E3 nothing currently emits evidence a receipt check would accept
 * E4 the downgrade rule changes at least one existing component's reported lane
 * E5 RFC 8785 canonicalisation + sha256 costs under 1ms per node
 *
 * The controls matter more than the verdicts. A probe that reports HELD while
 * refusing everything it measured is the failure mode from 16 Aug (tamper.mjs
 * printed "I3 HELD" for a control it never ran), so every claim below is read
 * off a value the graph actually produced.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const addr = JSON.parse(readFileSync(new URL("../standalone/.session/host.json", import.meta.url), "utf8"));
const BASE = addr.base;
const token = await fetch(`${BASE}/svc/identity/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "dev@example.com", password: "password123" }),
}).then((r) => r.json()).then((j) => j.token);
const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
const rec = (id, ok, note) => console.log(`${id} ${ok ? "HELD  " : "BROKEN"} ${note}`);

const call = async (path, opts = {}) => {
  const r = await fetch(`${BASE}${path}`, { headers: H, ...opts });
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; }
};

// ── E2: what does the published contract actually declare? ─────────────────
const comps = (await call("/svc/runtime/api/components")).body;
const list = Array.isArray(comps) ? comps : (comps?.components ?? comps?.data ?? []);
const withLane = list.filter((c) => c.lanes && Object.keys(c.lanes).length > 0);
rec("E2", withLane.length > list.length / 2,
  `${withLane.length} of ${list.length} components declare a lane on at least one port`);

// What the CATALOG copy says — the public contract, not the in-process registry.
// Filtered listing returns a bare array; unfiltered returns {result}. Read both
// rather than assume, because an empty array and a wrong parse look identical.
const listed = (await call("/svc/catalog/api/resources?type=component&limit=100")).body;
const compRes = Array.isArray(listed) ? listed : (listed?.result ?? []);
const ports = compRes.flatMap((r) => (r.metadata?.manifest?.outputs ?? []));
const withReceipt = ports.filter((p) => p.receipt);
console.log(`     catalog: ${compRes.length} manifests, ${ports.length} output ports, ${withReceipt.length} declaring a receipt`);
console.log(`     contract version: ${compRes[0]?.metadata?.manifest?.version ?? "(none)"}`);

// ── author one graph exercising three cases ───────────────────────────────
// s_ok    arithmetic, succeeds  -> declared canonical, ships a recipe
// s_bad   arithmetic, refuses   -> declared apocryphal on the error port
// s_tick  timer, injected       -> declared CANONICAL and ships nothing
const stamp = Date.now();
const key = `graphs/receipts-${stamp}`;
const name = key.split("/")[1];
const nodes = [
  { id: "entry", component: "symbia.io.passthrough" },
  { id: "s_ok", component: "symbia.compute.arithmetic", config: { expression: "{a} * {b}" } },
  { id: "s_bad", component: "symbia.compute.arithmetic", config: { expression: "{a} / {absent}" } },
  { id: "s_tick", component: "symbia.source.timer", config: { intervalMs: 100000 } },
];
const edges = ["s_ok", "s_bad", "s_tick"].map((t, i) => ({
  id: `e${i}`, source: { node: "entry", port: "out" }, target: { node: t, port: "in" },
}));

const authored = await call("/svc/catalog/api/resources", {
  method: "POST",
  body: JSON.stringify({
    key, name: "receipt probe", type: "graph", status: "published",
    metadata: {
      role: "pipeline", ingress: { node: "entry", port: "in" },
      definition: {
        symbia: "graph/1.0", name, version: "0.1.0", nodes, edges,
        metadata: { role: "pipeline", ingress: { node: "entry", port: "in" } },
      },
    },
  }),
});

// A refused write and a slow reconcile both end with loadedGraphs=0. Say which.
console.log(`\nauthoring: ${authored.status} ${authored.status >= 400 ? JSON.stringify(authored.body).slice(0, 240) : ""}`);
if (authored.status >= 400) {
  console.log("CANNOT MEASURE: the graph was never written, so nothing below ran.");
  process.exit(1);
}

// Reconcile is 3s in imagine; wait for the graph to actually be loaded rather
// than sleeping a guessed interval and inferring from silence.
let loaded = false;
for (let i = 0; i < 20 && !loaded; i += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  const graphs = (await call("/svc/runtime/api/graphs")).body;
  const all = Array.isArray(graphs) ? graphs : (graphs?.graphs ?? []);
  loaded = all.some((g) => (g.definition?.name ?? g.name) === name);
}
if (!loaded) {
  console.log("\nCANNOT MEASURE: the graph never hydrated. Nothing below would mean anything.");
  process.exit(1);
}

const run = await call(`/svc/runtime/api/ingress/${name}`, {
  method: "POST", body: JSON.stringify({ a: 12, b: 4 }),
});
const outputs = run.body?.outputs ?? {};
const trace = run.body?.trace ?? [];

console.log(`\nexecution ${run.body?.executionId ?? "(none)"}  hops ${run.body?.hops}\n`);
for (const [port, v] of Object.entries(outputs)) {
  console.log(`  ${port.padEnd(14)} lane=${String(v.lane).padEnd(10)} receipt=${v.receipt?.kind ?? "-"}`);
  if (v.laneReason) console.log(`  ${"".padEnd(14)} why: ${v.laneReason}`);
}

const ok = outputs["s_ok:out"];
const bad = outputs["s_bad:error"];
const tick = outputs["s_tick:out"];

// ── E3: is there evidence, and does it check out? ─────────────────────────
const recipe = ok?.receipt;
const redone = recipe?.recipe
  ? Function(`"use strict";return (${recipe.recipe.operation.replace(/\{(\w+)\}/g, (_m, k) => String(Number(recipe.recipe.inputs[k])))})`)()
  : undefined;
rec("E3", !!recipe && redone === ok?.value?.result,
  recipe
    ? `a recipe receipt is present and recomputes to ${redone} against the emitted ${ok?.value?.result}`
    : "no receipt was emitted — E3 predicted this before the change and it is now false, which is the point");

// ── E1: does a declared lane reach code that did not restate it? ──────────
rec("E1", bad?.lane === "apocryphal",
  `arithmetic's refusal came back ${bad?.lane}; its handler also states this, so this is consistent with E1 but does not DISCRIMINATE — see the timer below`);

// ── E4: the discriminating case ───────────────────────────────────────────
// symbia.source.timer declares out:canonical and its handler passes input straight
// through. Nothing in its code mentions a lane. If the declaration is
// decoration, this is canonical. If it is enforced, it is apocryphal and says
// why. No other measurement here separates those two worlds.
rec("E4", tick?.lane === "apocryphal" && !!tick?.laneReason,
  tick
    ? `timer.out = ${tick.lane}${tick.laneReason ? ` — "${tick.laneReason}"` : " with NO reason given"}`
    : "timer emitted nothing — E4 CANNOT BE MEASURED");

// ── E5: what does evidence cost? ──────────────────────────────────────────
// RFC 8785: sorted keys, no insignificant whitespace. Same shape @symbia/lineage
// canonicalises with before signing.
const canon = (v) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  return `{${Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, x]) => `${JSON.stringify(k)}:${canon(x)}`).join(",")}}`;
};
const sample = ok?.value ?? { result: 48, method: "arithmetic", expression: "12*4", exact: true };
const N = 20000;
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i += 1) createHash("sha256").update(canon(sample)).digest("hex");
const perOp = Number(process.hrtime.bigint() - t0) / 1e6 / N;
rec("E5", perOp < 1,
  `${perOp.toFixed(4)}ms per value, ${N} iterations — against a 4ms five-node graph, ${(perOp * 5).toFixed(3)}ms added for five nodes`);

console.log(`\ntrace (${trace.length} entries):`);
for (const t of trace) {
  console.log(`  ${String(t.node).padEnd(8)} ${String(t.port).padEnd(6)} ${String(t.lane).padEnd(10)} receipt=${t.receipt ?? "-"}`);
}
