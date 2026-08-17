/**
 * The synchronous path: POST /api/rules/execute.
 *
 * It awaits processEvent and returns the result, which is what an agent
 * needs — one call, one answer. It resolves the rule set by orgId, and the
 * assistant loader registers rule sets by ASSISTANT KEY into that same map
 * (`registerRuleSet(assistantKey, ruleSet)` against a parameter named
 * `orgId`). So the executor looks up an org and finds nothing.
 *
 * This measures: the failure as it stands, then the same call once the rule
 * set is registered under the org through the public API.
 */
import { readFileSync } from "node:fs";

const addr = JSON.parse(readFileSync(new URL("../.session/host.json", import.meta.url), "utf8"));
const BASE = addr.base;
const token = await fetch(`${BASE}/svc/identity/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "dev@example.com", password: "password123" }),
}).then((r) => r.json()).then((j) => j.token);
const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
const ORG = "550e8400-e29b-41d4-a716-446655440000";

const call = async (path, opts = {}) => {
  const r = await fetch(`${BASE}${path}`, { headers: H, ...opts });
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; }
};

const event = (content) => ({
  method: "POST",
  body: JSON.stringify({
    orgId: ORG,
    conversationId: crypto.randomUUID(),
    trigger: "message.received",
    message: { content, role: "user" },
    user: { id: "claude", name: "Claude" },
    data: { content },
  }),
});

console.log("=== 1. execute as it stands\n");
let t0 = Date.now();
const before = await call("/svc/assistants/api/rules/execute", event("what is the platform status?"));
console.log(`  ${before.status} in ${Date.now() - t0}ms`);
console.log(`  ${JSON.stringify(before.body).slice(0, 260)}\n`);

// --- register the coordinator's rules under the ORG, through the API -------
console.log("=== 2. register the coordinator's rule set under the org\n");
const sets = (await call("/svc/assistants/api/rules")).body?.data ?? [];
const coord = sets.find((s) => /coordinator/i.test(s.id) || /coordinator/i.test(s.name));
console.log(`  found ${sets.length} rule set(s); using ${coord?.id} with ${coord?.rules?.length} rule(s)`);

const reg = await call("/svc/assistants/api/rules", {
  method: "POST",
  body: JSON.stringify({ orgId: ORG, name: coord.name, description: coord.description, rules: coord.rules }),
});
console.log(`  register: ${reg.status}\n`);

console.log("=== 3. execute again\n");
t0 = Date.now();
const after = await call("/svc/assistants/api/rules/execute", event("what is the platform status?"));
const ms = Date.now() - t0;
console.log(`  ${after.status} in ${ms}ms`);
console.log(JSON.stringify(after.body, null, 2).slice(0, 1400));

// --- what the same information costs by hand ------------------------------
console.log("\n=== 4. the same gather, by hand\n");
t0 = Date.now();
const stats = {};
for (const s of ["catalog", "runtime", "assistants"]) {
  stats[s] = (await call(`/svc/${s}/api/stats`)).body;
}
console.log(`  three stats calls: ${Date.now() - t0}ms of host time, 3 round trips`);
console.log(`  one routine call : ${ms}ms of host time, 1 round trip`);
