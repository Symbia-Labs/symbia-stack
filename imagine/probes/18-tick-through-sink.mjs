/**
 * T5, taken the only way the platform allows: through a sink.
 *
 * 17-session-time.mjs could not measure T5. A driven timer tick is emitted by
 * `setInterval` -> `void this.runFlow(...)`, and the result is DISCARDED. The
 * execution detail route reports counts and nothing else: 112 invocations, no
 * values. So a standing pipeline's output is unobservable from the runtime —
 * logged as D25, and the reason this file exists.
 *
 * A sink is the designed answer. `symbia.sink.log` writes to the Logging
 * service, which is an independent observer of the same execution (the L5
 * precedent from D3: an executionId was found in the log after a graph ran).
 *
 * What this can and cannot establish, stated before the run:
 *   CAN  the tick VALUE carries {tick, offsetMs, t0} and no per-tick reading
 *   CAN  whether a receipt survives the sink boundary
 *   CANNOT  the lane the runtime assigned, unless the sink records it
 */
import { readFileSync } from "node:fs";

const B = JSON.parse(readFileSync(new URL("../.session/host.json", import.meta.url), "utf8")).base;
const token = await fetch(`${B}/svc/identity/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "dev@example.com", password: "password123" }),
}).then((r) => r.json()).then((j) => j.token);
const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
const call = async (p, o = {}) => {
  const r = await fetch(`${B}${p}`, { headers: H, ...o });
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; }
};
const rec = (id, ok, note) => console.log(`${id} ${ok ? "HELD  " : "BROKEN"} ${note}`);

const name = `tickspine-sink-${Date.now()}`;
const authored = await call("/svc/catalog/api/resources", {
  method: "POST",
  body: JSON.stringify({
    key: `graphs/${name}`, name: "tick spine, observed through a sink", type: "graph", status: "published",
    metadata: {
      role: "pipeline",
      definition: {
        symbia: "graph/1.0", name, version: "0.1.0",
        nodes: [
          { id: "clock", component: "symbia.source.timer", config: { intervalMs: 500 } },
          { id: "out", component: "symbia.sink.log", config: { level: "info", message: "TICKSPINE" } },
        ],
        edges: [{ id: "e", source: { node: "clock", port: "out" }, target: { node: "out", port: "in" } }],
        metadata: { role: "pipeline" },
      },
    },
  }),
});
console.log(`authoring: ${authored.status}`);
if (authored.status >= 400) { console.log(JSON.stringify(authored.body).slice(0, 300)); process.exit(1); }
const resourceId = authored.body?.id;

let exec = null;
for (let i = 0; i < 25 && !exec; i += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  const gs = (await call("/svc/runtime/api/graphs")).body;
  const all = Array.isArray(gs) ? gs : (gs?.graphs ?? []);
  const g = all.find((x) => (x.definition?.name ?? x.name) === name);
  if (!g) continue;
  const xs = (await call("/svc/runtime/api/executions")).body;
  const list = Array.isArray(xs) ? xs : (xs?.executions ?? []);
  exec = list.find((x) => x.graphId === (g.id ?? g.graphId) && x.state === "running") ?? null;
}
if (!exec) { console.log("CANNOT MEASURE: the pipeline never started."); process.exit(1); }
console.log(`execution ${exec.id} running\n`);

await new Promise((r) => setTimeout(r, 3000)); // ~6 ticks at 500ms

const logs = await call("/svc/logging/api/logs/query", {
  method: "POST",
  body: JSON.stringify({ search: "TICKSPINE", limit: 20 }),
});
const entries = logs.body?.logs ?? logs.body?.results ?? logs.body?.data ?? [];
console.log(`log query: ${logs.status}, ${entries.length} entries`);

// Stop before reporting, so a broken assertion below does not leave it running.
await call(`/svc/runtime/api/executions/${exec.id}/stop`, { method: "POST" });
if (resourceId) await call(`/svc/catalog/api/resources/${resourceId}`, { method: "PATCH", body: JSON.stringify({ status: "draft" }) });

if (entries.length === 0) {
  console.log(`T5 CANNOT BE MEASURED through the sink either. body: ${JSON.stringify(logs.body).slice(0, 300)}`);
  process.exit(1);
}

const sample = entries[0];
console.log(`\nsample entry: ${JSON.stringify(sample).slice(0, 500)}\n`);

// Read the message STRINGS, not the stringified array. The first version
// tested a regex against JSON.stringify(entries), where every quote inside the
// message is escaped — so `"ts":"2026-` never matched and the probe reported
// the per-tick clock "gone" while it sat in plain view two lines above.
const messages = entries.map((e) => String(e.message ?? ""));
const text = messages.join("\n");
const perTickClock = /\\?"ts\\?"\s*:\s*\\?"\d{4}-\d{2}-\d{2}T/.test(text);
const hasOffset = /offsetMs/.test(text);
const hasT0 = /\\?"t0\\?"/.test(text);
const lanes = [...new Set(entries.map((e) => e.metadata?.lane).filter(Boolean))];
const hasReceipt = entries.some((e) => e.metadata?.receipt || /recipe/.test(String(e.metadata?.receipt ?? "")));
console.log(`lanes recorded by the sink: ${lanes.join(", ") || "(none)"}`);

rec("T5a", hasOffset && hasT0 && !perTickClock,
  `tick value: offsetMs ${hasOffset ? "present" : "ABSENT"}, t0 anchor ${hasT0 ? "present" : "ABSENT"}, ` +
  `per-tick "ts" reading ${perTickClock ? "STILL PRESENT" : "gone"}`);
rec("T5b", hasReceipt,
  `the receipt ${hasReceipt ? "survives" : "does NOT survive"} the sink boundary — ` +
  `${hasReceipt ? "" : "the log records the value and drops the evidence for its lane"}`);
