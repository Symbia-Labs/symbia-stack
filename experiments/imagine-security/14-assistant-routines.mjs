/**
 * R1-R5. Can an assistant routine replace N serial tool calls?
 *
 * Predictions: `contexts/map-assistant-routines`.
 *
 * The coordinator's `rule-platform-status` routine is
 *   recall @catalog./stats -> recall @runtime./stats -> recall @network./sdn/topology
 *   -> think -> say
 * which is precisely the four-round-trip pattern an agent runs by hand.
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

const call = async (path, opts = {}) => {
  const r = await fetch(`${BASE}${path}`, { headers: H, ...opts });
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; }
};

// Which org is the principal scoped to?
const me = await call("/svc/identity/api/auth/me");
const orgId = me.body?.user?.organizations?.[0]?.id
  ?? me.body?.organizations?.[0]?.id
  ?? (await call("/svc/identity/api/organizations")).body?.[0]?.id;
console.log(`org: ${orgId}\n`);

// --- R1: register an actor principal for each assistant --------------------
const roster = (await call("/svc/assistants/api/assistants")).body?.assistants ?? [];
console.log(`roster: ${roster.map((a) => a.key).join(", ")}\n`);

const created = [];
for (const a of roster) {
  const r = await call("/svc/assistants/api/actors", {
    method: "POST",
    body: JSON.stringify({
      orgId,
      principalId: a.principalId,
      name: a.name,
      capabilities: a.capabilities ?? [],
    }),
  });
  created.push({ key: a.key, principalId: a.principalId, status: r.status,
                 detail: typeof r.body === "object" ? JSON.stringify(r.body).slice(0, 90) : String(r.body).slice(0, 90) });
}
for (const c of created) console.log(`  ${c.status}  ${c.principalId}  ${c.status >= 400 ? c.detail : ""}`);

// --- deliver a message that should trigger rule-platform-status ------------
const envelope = {
  id: crypto.randomUUID(),
  conversationId: crypto.randomUUID(),
  orgId,
  from: { principalId: "claude", principalType: "user" },
  to: { principalId: "assistant:coordinator", principalType: "assistant" },
  content: "what is the platform status?",
  contentType: "text/plain",
};

const t0 = Date.now();
const sent = await call("/svc/assistants/api/webhook/message", {
  method: "POST", body: JSON.stringify(envelope),
});
const routineMs = Date.now() - t0;

console.log(`\nwebhook: ${sent.status} in ${routineMs}ms`);
console.log(JSON.stringify(sent.body, null, 2).slice(0, 900));

rec("R1", sent.status !== 404,
  `after registering principals the webhook returned ${sent.status} (was 404)`);

const asText = JSON.stringify(sent.body);
rec("R2", /catalog|runtime|stats|resources/i.test(asText),
  `recall evidence in the response: ${/catalog|runtime|stats/i.test(asText) ? "present" : "absent"}`);

// --- what four hand-run calls cost, for comparison -------------------------
const t1 = Date.now();
await call("/svc/catalog/api/stats");
await call("/svc/runtime/api/stats");
await call("/svc/assistants/api/stats");
await call("/svc/models/api/stats");
const handMs = Date.now() - t1;
console.log(`\nfour stats calls by hand: ${handMs}ms of host time, 4 round trips`);
console.log(`one routine delivery    : ${routineMs}ms of host time, 1 round trip`);
