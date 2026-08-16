/**
 * If concurrency is unavailable, is DELEGATION worth anything?
 *
 * Measured in 12-parallelism.mjs: the client serializes my tool calls, the
 * host does not overlap store writes (pg-mem is synchronous), and CPU work
 * serializes outright. So there is no parallelism to be had.
 *
 * The remaining lever is round trips. A graph does N steps for one call.
 * This measures whether that is worth anything, and separates the two costs
 * an agent actually pays: HOST time, and the far larger TURN time of N
 * round trips through the client.
 *
 * B1 the graph's host time is comparable to doing the steps directly
 * B2 the saving is in round trips, not in host time
 * B3 authoring the graph costs more than one use of it saves
 */
import { readFileSync } from "node:fs";

const addr = JSON.parse(readFileSync(new URL("../standalone/.session/host.json", import.meta.url), "utf8"));
const BASE = addr.base;
const token = await fetch(`${BASE}/svc/identity/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "dev@example.com", password: "password123" }),
}).then((r) => r.json()).then((j) => j.token);
const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
const rec = (id, ok, note) => console.log(`${id} ${ok ? "HELD  " : "BROKEN"} ${note}`);

// Five arithmetic steps, done as five separate calls through the API.
const STEPS = [
  { expression: "{a} * {b}" },
  { expression: "{a} + {b}" },
  { expression: "({a} - {b}) / {b}" },
  { expression: "{a} * {a}" },
  { expression: "({a} + {b}) * 2" },
];

// A five-node graph doing the same work in one delivery.
const nodes = [{ id: "entry", component: "symbia.io.passthrough" }];
const edges = [];
STEPS.forEach((s, i) => {
  nodes.push({ id: `s${i}`, component: "symbia.compute.arithmetic", config: s });
  edges.push({ id: `e${i}`, source: { node: "entry", port: "out" }, target: { node: `s${i}`, port: "in" } });
});

const key = `graphs/batch-${Date.now()}`;
const name = key.split("/")[1];

const t0 = Date.now();
const created = await fetch(`${BASE}/svc/catalog/api/resources`, {
  method: "POST", headers: H,
  body: JSON.stringify({
    key, name: "batch probe", type: "graph", status: "published",
    metadata: {
      role: "pipeline", ingress: { node: "entry", port: "in" },
      definition: {
        symbia: "graph/1.0", name, version: "0.1.0", nodes, edges,
        metadata: { role: "pipeline", ingress: { node: "entry", port: "in" } },
      },
    },
  }),
});
const authorMs = Date.now() - t0;
console.log(`authoring the 5-node graph: ${authorMs}ms  (status ${created.status})`);

// Wait for the reconcile pass to pick it up.
await new Promise((r) => setTimeout(r, 8000));

// --- five separate deliveries ----------------------------------------------
// Each arithmetic step, delivered on its own, is one graph execution.
const single = `graphs/one-${Date.now()}`;
const singleName = single.split("/")[1];
await fetch(`${BASE}/svc/catalog/api/resources`, {
  method: "POST", headers: H,
  body: JSON.stringify({
    key: single, name: "one step", type: "graph", status: "published",
    metadata: {
      role: "pipeline", ingress: { node: "entry", port: "in" },
      definition: {
        symbia: "graph/1.0", name: singleName, version: "0.1.0",
        nodes: [
          { id: "entry", component: "symbia.io.passthrough" },
          { id: "s", component: "symbia.compute.arithmetic", config: { expression: "{a} * {b}" } },
        ],
        edges: [{ id: "e", source: { node: "entry", port: "out" }, target: { node: "s", port: "in" } }],
        metadata: { role: "pipeline", ingress: { node: "entry", port: "in" } },
      },
    },
  }),
});
await new Promise((r) => setTimeout(r, 8000));

const deliver = (graph) =>
  fetch(`${BASE}/svc/runtime/api/ingress/${graph}`, {
    method: "POST", headers: H, body: JSON.stringify({ a: 12, b: 4 }),
  }).then((r) => r.json());

let t = Date.now();
for (let i = 0; i < 5; i += 1) await deliver(singleName);
const fiveCallsMs = Date.now() - t;

t = Date.now();
const batched = await deliver(name);
const oneCallMs = Date.now() - t;

const outputs = Object.keys(batched.outputs ?? {}).length;
console.log(`\nfive separate deliveries : ${fiveCallsMs}ms`);
console.log(`one delivery, five steps : ${oneCallMs}ms  (${outputs} outputs, hops ${batched.hops})`);

rec("B1", oneCallMs < fiveCallsMs,
  `host time: ${fiveCallsMs}ms for five calls vs ${oneCallMs}ms for one (${(fiveCallsMs / oneCallMs).toFixed(1)}x)`);

// The real cost an agent pays is a round trip through the client, not host
// time. Measured today: a symbia_call round trip is on the order of seconds
// of wall time, against host times of tens of milliseconds.
const ROUND_TRIP_S = 5;
console.log(`\nround trips: 5 calls = 5 turns, 1 call = 1 turn`);
console.log(`at ~${ROUND_TRIP_S}s per turn that is ${5 * ROUND_TRIP_S}s vs ${ROUND_TRIP_S}s of agent wall time,`);
console.log(`while the host difference is ${fiveCallsMs - oneCallMs}ms.`);
rec("B2", (5 - 1) * ROUND_TRIP_S * 1000 > (fiveCallsMs - oneCallMs) * 10,
  `the saving is round trips, not host time — ${(5 - 1) * ROUND_TRIP_S}s of turns against ${fiveCallsMs - oneCallMs}ms of host`);

rec("B3", authorMs > oneCallMs,
  `authoring cost ${authorMs}ms against ${oneCallMs}ms per use — worth it from use ${Math.ceil(authorMs / Math.max(oneCallMs, 1))} onward, in host terms`);

console.log(`\noutputs from the batched run:`);
for (const [port, v] of Object.entries(batched.outputs ?? {})) {
  console.log(`  ${port}  ${JSON.stringify(v.value?.result ?? v.value)}  lane=${v.lane}`);
}
