/**
 * Redaction regression test — @symbia/redact.
 *
 * Run: npm run test:security:redaction (included in npm run test:security).
 * Pure functions, no database, no running stack.
 *
 * The defect this guards against is not "redaction is missing" — both old
 * implementations redacted something. It is that the WEAKER of two
 * implementations sat in the path all ten services share, so a credential one
 * level down from the root was logged verbatim platform-wide while the strong
 * redactor served one service. N1–N4 below are exactly the cases the old
 * `symbia-http` code passed through untouched.
 */

import { redact, redactObject, isSensitiveKey, REDACTED } from "@symbia/redact";

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

const s = (v: unknown) => JSON.stringify(v);

// --- N: nesting. The regressions the old four-key top-level redactor allowed.
check("N1 nested token redacted",
  s(redact({ auth: { token: "abc" } })) === s({ auth: { token: REDACTED } }),
  redact({ auth: { token: "abc" } }));

check("N2 token inside an array of objects redacted",
  s(redact({ items: [{ apiKey: "k1" }, { apiKey: "k2" }] })) ===
    s({ items: [{ apiKey: REDACTED }, { apiKey: REDACTED }] }));

check("N3 deeply nested password redacted",
  s(redact({ a: { b: { c: { password: "hunter2" } } } })) ===
    s({ a: { b: { c: { password: REDACTED } } } }));

check("N4 snake_case and kebab-case variants redacted",
  s(redact({ api_key: "x", "private-key": "y", client_secret: "z" })) ===
    s({ api_key: REDACTED, "private-key": REDACTED, client_secret: REDACTED }));

// --- T: top-level cases the old implementation did get right. No regression.
check("T1 password", (redactObject({ password: "p" }) as any).password === REDACTED);
check("T2 token", (redactObject({ token: "t" }) as any).token === REDACTED);
check("T3 apiKey", (redactObject({ apiKey: "a" }) as any).apiKey === REDACTED);
check("T4 secret", (redactObject({ secret: "s" }) as any).secret === REDACTED);

// --- S: string-level heuristics carried over from integrations.
check("S1 bearer token in a string value",
  redact({ h: "Bearer eyJhbGciOiJIUzI1NiJ9" }) &&
    (redact({ h: "Bearer eyJhbGciOiJIUzI1NiJ9" }) as any).h === "Bearer [REDACTED]",
  redact({ h: "Bearer eyJhbGciOiJIUzI1NiJ9" }));

check("S2 long opaque string collapsed to a length",
  /^\[REDACTED:\d+chars\]$/.test((redact({ v: "A".repeat(40) }) as any).v));

check("S3 short readable string untouched",
  (redact({ v: "hello world" }) as any).v === "hello world");

check("S4 opaque-string rule can be disabled by the caller",
  (redact({ v: "A".repeat(40) }, { redactLongOpaqueStrings: false }) as any).v ===
    "A".repeat(40));

// --- C: correctness properties the old implementation lacked.
const cyclic: Record<string, unknown> = { name: "root" };
cyclic.self = cyclic;
check("C1 cyclic object terminates and is marked",
  s(redact(cyclic)).includes("[CIRCULAR]"), redact(cyclic));

check("C2 input is not mutated",
  (() => {
    const input = { password: "p", nested: { token: "t" } };
    redact(input);
    return input.password === "p" && input.nested.token === "t";
  })());

check("C3 depth cap fires",
  (() => {
    let deep: Record<string, unknown> = { end: "value" };
    for (let i = 0; i < 15; i++) deep = { next: deep };
    return s(redact(deep)).includes("[MAX_DEPTH]");
  })());

check("C4 binary is never logged as bytes",
  (redact({ buf: new Uint8Array([1, 2, 3]) }) as any).buf === "[BINARY:3bytes]");

check("C5 Error keeps message, drops stack",
  (() => {
    const r = redact({ e: new Error("boom") }) as any;
    return r.e.message === "boom" && r.e.stack === undefined;
  })());

check("C6 null and undefined survive",
  (() => {
    const r = redact({ a: null, b: undefined }) as any;
    return r.a === null && r.b === undefined;
  })());

// --- K: key classifier.
check("K1 isSensitiveKey positive", ["password", "API_KEY", "Authorization", "refreshToken"]
  .every(isSensitiveKey));
check("K2 isSensitiveKey negative", ["name", "email", "path", "count", "keyboard"]
  .every((k) => !isSensitiveKey(k)));

console.log(`\nREDACTION: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
