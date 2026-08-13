/**
 * R5 seed guard — measurement against docs/2026-08-13-seed-guard-predictions.md.
 * Run: npm run test:security:seed-guard. Pure functions, no database.
 */

import { seedForced, seedDecision } from "../../catalog/server/src/seed-guard.js";

let pass = 0,
  fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}

// seedForced
check("F1 --force ⇒ forced", seedForced(["node", "seed", "--force"], {}));
check("F2 SEED_FORCE=true ⇒ forced", seedForced(["node", "seed"], { SEED_FORCE: "true" } as NodeJS.ProcessEnv));
check("F3 neither ⇒ not forced", !seedForced(["node", "seed"], {}));
check("F4 SEED_FORCE=1 ⇒ not forced", !seedForced(["node", "seed"], { SEED_FORCE: "1" } as NodeJS.ProcessEnv));

// seedDecision
check("D1 empty, unforced ⇒ proceed", seedDecision(0, false).proceed === true);
check("D2 empty, forced ⇒ proceed", seedDecision(0, true).proceed === true);
check("D3 42 existing, unforced ⇒ REFUSE", seedDecision(42, false).proceed === false);
check("D4 42 existing, forced ⇒ proceed", seedDecision(42, true).proceed === true);
check("D5 refusal names count + override", (() => {
  const r = seedDecision(42, false).reason;
  return r.includes("42") && r.toLowerCase().includes("--force");
})());

console.log(`\nSEED-GUARD: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
