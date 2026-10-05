/**
 * Q1-Q4. Can an agent parallelize work through imagine?
 *
 * Predictions: `contexts/map-parallelism`.
 *
 * Q1 is already answered and BROKEN: this client issues symbia_call
 * invocations strictly one at a time. Client-side parallelism is not
 * available to an agent here, which means the only way to overlap work is
 * to push it INTO the host in a single call.
 *
 * So this measures the host's side directly: does it overlap I/O, does it
 * overlap CPU, and does a long CPU-bound call block everything else.
 */
import { readFileSync } from "node:fs";

const addr = JSON.parse(readFileSync(new URL("../.session/host.json", import.meta.url), "utf8"));
const BASE = addr.base;

const token = await fetch(`${BASE}/svc/identity/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "dev@example.com", password: "password123" }),
}).then((r) => r.json()).then((j) => j.token);

const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
const ms = (t0) => `${(Date.now() - t0).toString().padStart(5)}ms`;
const rec = (id, ok, note) => console.log(`${id} ${ok ? "HELD  " : "BROKEN"} ${note}`);

// --- baseline: one catalog write, serially ---------------------------------
async function write(n) {
  return fetch(`${BASE}/svc/catalog/api/resources`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      key: `contexts/par-${n}-${Date.now()}`, name: `par ${n}`,
      type: "context", status: "draft", metadata: { n },
    }),
  }).then((r) => r.status);
}

console.log("=== I/O-bound: 8 catalog writes\n");
let t0 = Date.now();
for (let i = 0; i < 8; i += 1) await write(`serial${i}`);
const serialMs = Date.now() - t0;
console.log(`  serial   ${serialMs}ms`);

t0 = Date.now();
await Promise.all(Array.from({ length: 8 }, (_, i) => write(`par${i}`)));
const parallelMs = Date.now() - t0;
console.log(`  parallel ${parallelMs}ms`);
rec("Q1'", parallelMs < serialMs * 0.8,
  `the HOST overlaps I/O: ${serialMs}ms serial vs ${parallelMs}ms concurrent (${(serialMs / parallelMs).toFixed(1)}x)`);

// --- CPU-bound: two inferences ---------------------------------------------
const infer = (prompt) =>
  fetch(`${BASE}/svc/models/v1/chat/completions`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      model: "tinyllama-1-1b-chat-v1-0-q4-k-m",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 32, temperature: 0,
    }),
  }).then((r) => r.json());

console.log("\n=== CPU-bound: inference\n");
t0 = Date.now();
await infer("Count to five.");
const oneInferMs = Date.now() - t0;
console.log(`  one inference        ${oneInferMs}ms`);

t0 = Date.now();
await Promise.all([infer("Name three fruits."), infer("Name three cities.")]);
const twoInferMs = Date.now() - t0;
console.log(`  two, concurrently    ${twoInferMs}ms`);
rec("Q3", twoInferMs > oneInferMs * 1.6,
  `CPU work serializes: 1x=${oneInferMs}ms, 2x=${twoInferMs}ms (${(twoInferMs / oneInferMs).toFixed(1)}x — a true overlap would be ~1.0x)`);

// --- Q4: does inference starve an unrelated read? --------------------------
console.log("\n=== does a running inference block an unrelated read?\n");
const readTimes = [];
const inferPromise = infer("Write two sentences about rain.");
const poller = (async () => {
  for (let i = 0; i < 6; i += 1) {
    const s = Date.now();
    await fetch(`${BASE}/svc/catalog/api/resources?limit=1`, { headers: H }).then((r) => r.text());
    readTimes.push(Date.now() - s);
    await new Promise((r) => setTimeout(r, 120));
  }
})();
await Promise.all([inferPromise, poller]);

const worst = Math.max(...readTimes);
const s2 = Date.now();
await fetch(`${BASE}/svc/catalog/api/resources?limit=1`, { headers: H }).then((r) => r.text());
const idle = Date.now() - s2;
console.log(`  reads during inference: ${readTimes.map((t) => `${t}ms`).join(", ")}`);
console.log(`  the same read when idle: ${idle}ms`);
rec("Q4", worst > idle * 3,
  `worst read during inference ${worst}ms vs ${idle}ms idle — the event loop ${worst > idle * 3 ? "IS" : "is NOT"} blocked`);
