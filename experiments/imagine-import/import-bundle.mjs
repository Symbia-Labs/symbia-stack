/**
 * Import a sealed imagine bundle into design mode.
 *
 * Two halves, in this order and never the other:
 *
 *   1. VERIFY. Recompute the chain and check every signature against the
 *      public key the bundle carries. This proves continuity — that the
 *      bytes have not moved since sealing — and nothing else. The key is
 *      ephemeral and travels inside the bundle, so it cannot speak for
 *      whoever ran the session.
 *   2. REGISTER. Write each artifact into the target catalog through the
 *      public API, under the target's own identity, and record an
 *      `artifact.registered` event naming the bundle digest as the source.
 *
 * The identity change is the point of the whole exercise. Imagine produces
 * content nobody has vouched for. Import is a real identity saying "this is
 * mine now", which is a claim the session could not make on its own.
 *
 * Usage:
 *   node import-bundle.mjs <bundle.json> --target <baseUrl> [--dry-run]
 *                          [--email <e>] [--password <p>]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GENESIS, advance, eventDigest, verifyEvent, lineageLine,
  sealArtifactEvent, registeredPayload, artifactDigest,
} from "@symbia/lineage";
import { loadServiceIdentity, canonicalJson } from "@symbia/crypto";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const bundlePath = args[0];
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const dryRun = args.includes("--dry-run");
const target = flag("target", process.env.SYMBIA_BASE_URL);

if (!bundlePath) {
  console.error("usage: import-bundle.mjs <bundle.json> --target <baseUrl> [--dry-run]");
  process.exit(2);
}

const raw = readFileSync(bundlePath);
const bundleDigest = artifactDigest(raw);
const bundle = JSON.parse(raw.toString());

console.log(`bundle       ${bundlePath}`);
console.log(`digest       ${bundleDigest}`);
console.log(`sealed       ${bundle.sealedAt}`);
console.log(`artifacts    ${bundle.artifacts?.length ?? 0}`);
console.log(`trace        ${bundle.trace?.length ?? 0} events`);

// ---------------------------------------------------------------- verify

/**
 * Walk the chain from GENESIS. An event's checksum must be the advance of
 * the running head over that event's own digest, computed the same way the
 * signer computed it — which is why `eventDigest` normalizes first.
 */
function verifyChain(trace, publicKeyPem) {
  let head = GENESIS;
  const failures = [];
  for (const [i, ev] of trace.entries()) {
    const expected = advance(head, eventDigest(ev));
    if (ev.checksum !== `sha256:${expected}`) {
      failures.push({ index: i, event: ev.event_id, reason: "checksum does not follow from the previous head" });
      break; // one break invalidates everything after it; do not guess past it
    }
    if (!verifyEvent(ev, publicKeyPem)) {
      failures.push({ index: i, event: ev.event_id, reason: "signature does not verify against the bundle's public key" });
      break;
    }
    head = expected;
  }
  return { ok: failures.length === 0, head, failures, checked: trace.length };
}

const v = verifyChain(bundle.trace ?? [], bundle.publicKeyPem);
if (!v.ok) {
  console.error(`\nREFUSED after ${v.failures[0].index} of ${v.checked} events`);
  console.error(`  event  ${v.failures[0].event}`);
  console.error(`  reason ${v.failures[0].reason}`);
  console.error(
    "\nNothing was imported. A broken chain does not mean the later events are\n" +
    "bad, it means nothing after the break can be believed, which is the same\n" +
    "thing for import purposes."
  );
  process.exit(1);
}
console.log(`\nchain        VERIFIED — ${v.checked} events, head ${v.head.slice(0, 16)}…`);

// A VERIFIED CHAIN IS NOT A VERIFIED BUNDLE.
//
// The chain covers the trace. The artifacts are a separate array, and until
// 16 Aug nothing tied them to it — an artifact could be edited after
// sealing and the chain still verified (tamper.mjs, case B). The seal event
// now carries a digest over the artifacts, and because that event is inside
// the chain, recomputing the digest here is what closes the gap.
const sealEvent = [...(bundle.trace ?? [])].reverse()
  .find((e) => e.event_type === "imagine.session.sealed");
const sealedDigest = sealEvent?.payload?.artifactsDigest;
if (!sealedDigest) {
  console.error(
    `\nREFUSED — the trace carries no artifacts digest.\n` +
    `  The chain verifies, so the TRACE is intact, but nothing binds the\n` +
    `  ${bundle.artifacts?.length ?? 0} artifacts to it. This bundle was sealed by a\n` +
    `  version that could not make the claim it printed. Re-seal it.`
  );
  process.exit(1);
}
const actualDigest = `sha256:${createHash("sha256").update(canonicalJson(bundle.artifacts ?? [])).digest("hex")}`;
if (actualDigest !== sealedDigest) {
  console.error(
    `\nREFUSED — the artifacts do not match the digest inside the seal.\n` +
    `  sealed   ${sealedDigest}\n` +
    `  computed ${actualDigest}\n` +
    `  The trace is intact and the artifacts have been altered since sealing.`
  );
  process.exit(1);
}
console.log(`artifacts    VERIFIED — ${bundle.artifacts.length} match the digest sealed into the chain`);

// COMPLETENESS IS REPORTED, NOT ENFORCED.
//
// A verified chain says every event present follows the one before it. It
// cannot say whether more events followed the last one held. The bundle
// carries a count against the session's declared total, and this prints it
// the way symbia_call prints `_truncated` — hand over what is there and
// name what is not, rather than refusing a bundle that is merely partial.
const c = bundle.completeness;
if (c) {
  console.log(`trace        ${c.state.toUpperCase()} — ${c.note}`);
  if (c.gaps?.length) {
    for (const g of c.gaps) console.log(`             gap between seq ${g.after} and ${g.before}`);
  }
} else {
  console.log(
    `trace        UNCOUNTED — sealed before events carried positions. ` +
    `Nothing here can say whether the trace is whole.`
  );
}
console.log(`what that establishes: these bytes are unchanged since sealing.`);
console.log(`what it does not:      who authored them, or whether they are sound.`);

// -------------------------------------------------------------- register

if (dryRun) {
  console.log(`\n--dry-run: verified only, nothing written.`);
  process.exit(0);
}
if (!target) {
  console.error("\nno --target given; pass the design-mode base URL");
  process.exit(2);
}

// A real, disk-persisted identity — the whole difference from imagine.
const identity = loadServiceIdentity({ role: "import" });
console.log(`\nimporting under ${identity.publicKeyPem ? "a persisted identity" : "NO identity"}`);

let token = null;
const email = flag("email", process.env.SYMBIA_EMAIL);
const password = flag("password", process.env.SYMBIA_PASSWORD);
if (email && password) {
  const r = await fetch(`${target}/svc/identity/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).catch(() => null);
  if (r?.ok) {
    const body = await r.json();
    token = body.token ?? body.accessToken ?? body.data?.token ?? null;
  }
  console.log(`auth         ${token ? "token acquired" : "NO token — writes will be refused"}`);
}
const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

let chain = GENESIS;
const events = [];
const results = { registered: [], refused: [] };

for (const artifact of bundle.artifacts ?? []) {
  // The resource is rewritten, not replayed: ids and bootstrap flags belong
  // to the target store, and provenance is recorded rather than asserted in
  // the body.
  const body = {
    key: artifact.key,
    name: artifact.name,
    type: artifact.type,
    status: artifact.status ?? "draft",
    metadata: {
      ...(artifact.metadata ?? {}),
      importedFrom: { bundleDigest, sealedAt: bundle.sealedAt, sessionKey: bundle.publicKeyPem?.slice(27, 59) },
    },
  };

  const res = await fetch(`${target}/svc/catalog/api/resources`, {
    method: "POST", headers, body: JSON.stringify(body),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    results.refused.push({ key: artifact.key, status: res.status, detail: detail.slice(0, 160) });
    console.log(`  refused  ${artifact.key} (${res.status})`);
    continue;
  }

  const stored = await res.json();
  const sealed = sealArtifactEvent({
    eventType: "artifact.registered",
    payload: registeredPayload({
      digest: artifactDigest(JSON.stringify(body)),
      format: `catalog/${artifact.type}`,
      source: { type: "local", file: bundlePath },
      extra: {
        // Named here, not in the resource body, so a reader asks the ledger
        // rather than trusting the row.
        bundleDigest,
        catalogKey: artifact.key,
        catalogId: stored.id ?? stored.result?.id ?? null,
        sessionSeal: bundle.seal ?? null,
      },
    }),
    actor: "import",
    chain,
    parents: [null],
    identity,
  });
  chain = sealed.chain;
  events.push(sealed.event);
  results.registered.push(artifact.key);
  console.log(`  imported ${artifact.key}`);
}

const outDir = join(here, "out");
mkdirSync(outDir, { recursive: true });
const ledgerPath = join(outDir, `import-${Date.now()}.jsonl`);
writeFileSync(ledgerPath, events.map(lineageLine).join(""));

console.log(`\nregistered   ${results.registered.length}`);
console.log(`refused      ${results.refused.length}`);
console.log(`ledger       ${ledgerPath}`);
console.log(`import head  ${chain.slice(0, 16)}…  (a new chain from GENESIS — the session key does not speak here)`);
if (results.refused.length) {
  console.log("\nrefusals:");
  for (const r of results.refused) console.log(`  ${r.key}  ${r.status}  ${r.detail}`);
}
