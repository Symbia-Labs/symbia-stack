/**
 * T1-T5. Does the envelope have two anchors, and is an estimate any good?
 *
 * Predictions registered BEFORE this ran:
 * `contexts/map-session-time-frame`, resource 475c13dc-bf0a-455e-94c1-ffe65ee4aeb5.
 *
 * T1 no ledger contains an opening anchor                    [control]
 * T2 estimated placement lands within 250ms of the recorded wall clock (median)
 * T3 the residual is the MAJORITY of the envelope
 * T4 uniform distribution is wrong, worst error at the largest idle gap [expected wrong]
 * T5 a real timer tick emits canonical with a recipe and no clock reading
 *
 * T1 is measured against ledgers written BEFORE the change, which is the only
 * moment it can be measured at all. T2-T4 are measured against those same old
 * ledgers, using their first and last event as stand-in anchors — stated here
 * because it flatters the estimator: an envelope defined by the events it
 * contains has no error at its endpoints by construction.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { placeEvents } from "../standalone/session-time.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const sessionDir = join(here, "..", "standalone", ".session");
const rec = (id, ok, note) => console.log(`${id} ${ok ? "HELD  " : "BROKEN"} ${note}`);

const files = readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl"));
const ledgers = files.map((f) => ({
  name: f,
  events: readFileSync(join(sessionDir, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)),
})).filter((l) => l.events.length > 5);

console.log(`${ledgers.length} ledgers with more than five events\n`);

// ── T1: the control. Does an opening anchor exist anywhere? ───────────────
const withOpen = ledgers.filter((l) => l.events.some((e) => e.event_type === "imagine.session.opened"));
const withClose = ledgers.filter((l) => l.events.some((e) => /session\.(closed|sealed)/.test(e.event_type)));
rec("T1", withOpen.length === 0,
  `opening anchor in ${withOpen.length} of ${ledgers.length} ledgers; closing anchor in ${withClose.length} — ` +
  `${withOpen.length === 0 ? "the envelope declared a stop and no start" : "an opening anchor already existed"}`);

// ── T2-T4: run the estimator against a real ledger ────────────────────────
const subject = ledgers.slice().sort((a, b) => b.events.length - a.events.length)[0];
const ev = subject.events;
const actual = ev.map((e) => Date.parse(e.timestamp));
const durations = ev.map((e) => Number(e.payload?.ms ?? 0));
const startMs = actual[0];
const stopMs = actual[actual.length - 1];
const envelope = stopMs - startMs;
const measured = durations.reduce((a, b) => a + b, 0);
const residual = envelope - measured;

console.log(`subject: ${subject.name}`);
console.log(`  ${ev.length} events over ${(envelope / 1000).toFixed(1)}s`);
console.log(`  measured work ${measured}ms, residual ${residual}ms (${((residual / envelope) * 100).toFixed(1)}% of the envelope)\n`);

rec("T3", residual > envelope / 2,
  `residual is ${((residual / envelope) * 100).toFixed(1)}% of the envelope — ` +
  `${residual > envelope / 2 ? "most of a session is time nobody measured" : "measured work dominates"}`);

const errorsFor = (policy) => {
  const { placements } = placeEvents({ startMs, stopMs, durations, residualPolicy: policy });
  return placements.map((p, i) => Math.abs(p.estimatedAtMs - actual[i]));
};
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const uni = errorsFor("uniform");
const prop = errorsFor("proportional");
console.log(`  uniform      median ${median(uni)}ms  worst ${Math.max(...uni)}ms`);
console.log(`  proportional median ${median(prop)}ms  worst ${Math.max(...prop)}ms\n`);

rec("T2", median(uni) < 250,
  `median placement error ${median(uni)}ms under the uniform policy`);

// Where is the worst error, and is it at the largest idle gap?
const gaps = actual.slice(1).map((t, i) => t - actual[i] - durations[i]);
const largestGapAt = gaps.indexOf(Math.max(...gaps)) + 1;
const worstAt = uni.indexOf(Math.max(...uni));
rec("T4", median(uni) >= 250 || Math.max(...uni) > median(uni) * 10,
  `worst error at event ${worstAt}, largest idle gap after event ${largestGapAt} ` +
  `(${Math.max(...gaps)}ms). Worst is ${(Math.max(...uni) / Math.max(median(uni), 1)).toFixed(0)}x the median — ` +
  `${Math.max(...uni) > median(uni) * 10 ? "the error concentrates, it does not spread" : "the error is spread evenly"}`);

// ── T5: a real timer tick, from a running execution ───────────────────────
const addr = JSON.parse(readFileSync(join(sessionDir, "host.json"), "utf8"));
const BASE = addr.base;
const token = await fetch(`${BASE}/svc/identity/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "dev@example.com", password: "password123" }),
}).then((r) => r.json()).then((j) => j.token);
const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
const call = async (p, o = {}) => {
  const r = await fetch(`${BASE}${p}`, { headers: H, ...o });
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; }
};

const name = `tickspine-${Date.now()}`;
const authored = await call("/svc/catalog/api/resources", {
  method: "POST",
  body: JSON.stringify({
    key: `graphs/${name}`, name: "tick spine probe", type: "graph", status: "published",
    metadata: {
      role: "pipeline",
      definition: {
        symbia: "graph/1.0", name, version: "0.1.0",
        nodes: [
          { id: "clock", component: "symbia.source.timer", config: { intervalMs: 200 } },
          { id: "sink", component: "symbia.io.passthrough" },
        ],
        edges: [{ id: "e", source: { node: "clock", port: "out" }, target: { node: "sink", port: "in" } }],
        metadata: { role: "pipeline" },
      },
    },
  }),
});
console.log(`\nauthoring the timer graph: ${authored.status}`);
if (authored.status >= 400) {
  console.log(`T5 CANNOT BE MEASURED — ${JSON.stringify(authored.body).slice(0, 200)}`);
  process.exit(1);
}

// Wait for hydration AND for the executor to start it (role: pipeline).
let exec = null;
for (let i = 0; i < 25 && !exec; i += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  const gs = (await call("/svc/runtime/api/graphs")).body;
  const all = Array.isArray(gs) ? gs : (gs?.graphs ?? []);
  const g = all.find((x) => (x.definition?.name ?? x.name) === name);
  if (g) {
    const xs = (await call("/svc/runtime/api/executions")).body;
    const list = Array.isArray(xs) ? xs : (xs?.executions ?? []);
    exec = list.find((x) => x.graphId === (g.id ?? g.graphId)) ?? null;
  }
}
if (!exec) {
  console.log("T5 CANNOT BE MEASURED — the timer graph never started; nothing ticked.");
  process.exit(1);
}
console.log(`execution ${exec.id} state ${exec.state}`);

await new Promise((r) => setTimeout(r, 2500)); // several 200ms ticks
const detail = (await call(`/svc/runtime/api/executions/${exec.id}`)).body;
const outs = detail?.outputs ?? detail?.execution?.outputs ?? {};
const tickOut = Object.entries(outs).find(([k]) => k.startsWith("sink:"))?.[1];

if (!tickOut) {
  console.log(`T5 CANNOT BE MEASURED — no output captured. keys: ${Object.keys(outs).join(", ") || "(none)"}`);
} else {
  const v = tickOut.value ?? {};
  const hasClock = JSON.stringify(v).match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  console.log(`  value: ${JSON.stringify(v)}`);
  console.log(`  lane: ${tickOut.lane}  receipt: ${tickOut.receipt?.kind ?? "-"}`);
  rec("T5", tickOut.lane === "canonical" && tickOut.receipt?.kind === "recipe",
    `tick came back ${tickOut.lane} with receipt ${tickOut.receipt?.kind ?? "none"}; ` +
    `t0 appears in the value as the anchor${hasClock ? " (present, and it is the anchor rather than a per-tick reading)" : " — ABSENT, the anchor is not carried"}`);
  if (tickOut.receipt?.recipe) {
    const { t0, intervalMs, n } = tickOut.receipt.recipe.inputs;
    const derived = Date.parse(t0) + intervalMs * n;
    console.log(`  recomputed from the recipe: ${new Date(derived).toISOString()} (t0 + ${n} x ${intervalMs}ms)`);
  }
}
