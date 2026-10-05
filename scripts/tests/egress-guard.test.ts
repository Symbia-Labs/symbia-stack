/**
 * R3 egress guard — measurement against the predictions registered in
 * docs/2026-08-13-egress-predictions.md (MAP). Run: npm run test:security:egress.
 * No network needed for the BLOCK cases and public-IP ALLOW cases; P3/P17/P19
 * touch DNS and are noted where environment-dependent.
 */

import { assertEgressAllowed, isBlockedIp } from "../../symbia-egress/dist/index.js";

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

async function expectBlocked(id: string, url: string, env?: Record<string, string>) {
  const saved = applyEnv(env);
  try {
    await assertEgressAllowed(url);
    check(`${id} ${url} BLOCKED`, false, "was allowed");
  } catch {
    check(`${id} ${url} BLOCKED`, true);
  } finally {
    restoreEnv(saved);
  }
}

async function expectAllowed(id: string, url: string, env?: Record<string, string>) {
  const saved = applyEnv(env);
  try {
    await assertEgressAllowed(url);
    check(`${id} ${url} ALLOWED`, true);
  } catch (e) {
    check(`${id} ${url} ALLOWED`, false, (e as Error).message);
  } finally {
    restoreEnv(saved);
  }
}

function applyEnv(env?: Record<string, string>): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  if (env) for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = v; }
  return saved;
}
function restoreEnv(saved: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
}

async function main() {
  // Pure classifier sanity (no DNS)
  check("isBlockedIp 127.0.0.1", isBlockedIp("127.0.0.1"));
  check("isBlockedIp 8.8.8.8 allowed", !isBlockedIp("8.8.8.8"));

  await expectBlocked("P1", "http://169.254.169.254/latest/meta-data/");
  await expectBlocked("P2", "http://127.0.0.1:5001/");
  await expectBlocked("P3", "http://localhost/"); // DNS → loopback
  await expectBlocked("P4", "http://10.0.0.5/");
  await expectBlocked("P5", "http://192.168.1.10/");
  await expectBlocked("P6", "http://172.16.5.5/");
  await expectBlocked("P7", "http://[::1]/");
  await expectBlocked("P8", "http://[fd00::1]/");
  await expectBlocked("P9", "http://[fe80::1]/");
  await expectBlocked("P10", "file:///etc/passwd");
  await expectBlocked("P11", "ftp://example.com/");
  await expectAllowed("P12", "http://8.8.8.8/");
  await expectAllowed("P13", "https://1.1.1.1/");
  await expectBlocked("P14", "http://2130706433/"); // decimal 127.0.0.1
  await expectBlocked("P15", "http://0.0.0.0/");
  await expectBlocked("P16", "http://[::ffff:127.0.0.1]/");
  await expectBlocked("P17", "http://nx.invalid/"); // unresolvable → fail-closed
  await expectBlocked("P18", "http://8.8.8.8/", { EGRESS_ALLOWLIST: "example.com" });
  // P19 (allowlisted public host allowed) resolves example.com — env-dependent.
  await expectAllowed("P19", "https://8.8.8.8/", { EGRESS_ALLOWLIST: "8.8.8.8" });

  console.log(`\nEGRESS-GUARD: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("EGRESS-GUARD crashed:", e);
  process.exit(1);
});
