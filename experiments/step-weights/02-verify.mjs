/**
 * Verify a step-weights run from the records alone: signatures via the
 * sidecar public key, chain recomputation, and — the point — that every
 * model-consulting step names a digest the LIVE registry still vouches for.
 */
import fs from "node:fs";
import path from "node:path";
import { createPublicKey } from "node:crypto";
import { fileURLToPath } from "node:url";
import { GENESIS, advance, verifyEvent, eventDigest } from "@symbia/lineage";

const here = path.dirname(fileURLToPath(import.meta.url));
const MODELS_URL = process.env.MODELS_URL || "http://localhost:5098";

const pub = createPublicKey(fs.readFileSync(path.join(here, "chain", "spike-identity.pub.pem")));
const events = fs.readFileSync(path.join(here, "chain", "run-events.jsonl"), "utf8")
  .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  cond ? pass++ : fail++;
};

for (const ev of events) {
  ok(`signature ${ev.payload.stepId}`, verifyEvent(ev, pub));
}

let chain = GENESIS, chainOk = true;
for (const ev of events) {
  chain = advance(chain, eventDigest(ev));
  if (ev.checksum !== `sha256:${chain}`) chainOk = false;
}
ok("chain recomputes end to end", chainOk);

// Parent-linking: each step points at the previous one.
ok("steps are causally linked", events.every((ev, i) =>
  i === 0 ? ev.parent_links[0] === null : ev.parent_links[0] === events[i - 1].event_id));

// Digests in receipts still vouched for by the live registry.
const registry = (await (await fetch(`${MODELS_URL}/api/models`)).json()).data;
const byId = new Map(registry.map((m) => [m.id, m.symbia.digest]));
for (const ev of events) {
  const p = ev.payload;
  for (const [label, rm] of [["resolved", p.resolvedModel], ["escalated", p.escalation?.resolvedModel]]) {
    if (!rm) continue;
    ok(`${p.stepId}: ${label} digest matches live registry (${rm.id})`, byId.get(rm.id) === rm.digest);
  }
}

// A computed step must name NO model — absence is the claim.
const computed = events.filter((e) => e.payload.mode === "computed");
ok("computed steps name no weights", computed.every((e) => e.payload.resolvedModel === null));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
