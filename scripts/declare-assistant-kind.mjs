#!/usr/bin/env node
/**
 * Declare each assistant's kind, through the catalog API.
 *
 * Ruling 12 Aug 2026: "Deterministic assistants default to inherit or refuse.
 * Probabilistic assistants default to try again."
 *
 * That branch needs something to branch on, and nothing declared it. `kind` was
 * only ever IMPLIED, by tags — `calculator` carries `deterministic`,
 * `smart-calc` carries `hybrid`. Deriving behaviour from those would let a tag,
 * which is a search aid anyone can edit, silently decide whether the platform
 * spends tokens retrying. Tags stay descriptive. This is a declaration.
 *
 * WRITTEN THROUGH THE CATALOG API, not by editing assistants-bootstrap.json,
 * which has never reached this database (STATUS §6.1).
 *
 * Usage:
 *   node scripts/declare-assistant-kind.mjs --dry-run
 *   node scripts/declare-assistant-kind.mjs
 */

const CATALOG = process.env.CATALOG_URL || 'http://localhost:5003';
const DRY = process.argv.includes('--dry-run');

const headers = {
  'content-type': 'application/json',
  'x-service-auth': process.env.CATALOG_INTERNAL_SERVICE_TOKEN || 'internal',
};

/**
 * From docs/2026-08-12-assistant-normalization-spec.md §3.
 *
 * Calculator is the interesting one. It is `deterministic`, so a failure stops
 * it rather than being retried — and that is the point of the ruling. A
 * deterministic assistant that retries is not deterministic: the same input
 * would produce a different number of attempts, and "= 4" arrived at on the
 * third try is not the same claim as "= 4" on the first. Arithmetic that failed
 * once will fail again; retrying it only spends time pretending otherwise.
 */
const KINDS = {
  'assistants/calculator': { kind: 'deterministic' },
  'assistants/smart-calc': { kind: 'probabilistic', retries: { max: 3 } },
  'assistants/coordinator': { kind: 'probabilistic', retries: { max: 3 } },
};

async function getJSON(url) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  console.log(`Catalog: ${CATALOG}${DRY ? '  (dry run)' : ''}\n`);

  const all = await getJSON(`${CATALOG}/api/resources?type=assistant`);
  const assistants = (Array.isArray(all) ? all : all.resources || []).filter(
    (a) => a.status === 'published'
  );

  const undeclared = assistants.filter((a) => !KINDS[a.key]);
  if (undeclared.length) {
    console.log(
      `  NOTE: ${undeclared.map((a) => a.key).join(', ')} published and not in this script — ` +
        `they will default to deterministic (refuse, never retry).\n`
    );
  }

  for (const a of assistants) {
    const want = KINDS[a.key];
    if (!want) continue;

    const full = await getJSON(`${CATALOG}/api/resources/${a.id}`);
    const metadata = structuredClone(full.metadata || {});
    metadata.config = { ...(metadata.config || {}), ...want };

    if (DRY) {
      console.log(`  [dry-run] ${a.key.padEnd(26)} config=${JSON.stringify(metadata.config)}`);
      continue;
    }

    const r = await fetch(`${CATALOG}/api/resources/${a.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ metadata }),
    });
    if (!r.ok) throw new Error(`PATCH ${a.id} -> ${r.status} ${await r.text()}`);
    console.log(`  ${a.key.padEnd(26)} config=${JSON.stringify(metadata.config)}`);
  }

  if (DRY) {
    console.log('\nDry run complete. Nothing was written.');
    return;
  }

  // Verify from the catalog, not from what we just sent.
  console.log('\nVerifying against the catalog:');
  let ok = true;
  for (const [key, want] of Object.entries(KINDS)) {
    const found = assistants.find((a) => a.key === key);
    if (!found) {
      console.log(`  ${key.padEnd(26)} NOT PUBLISHED`);
      ok = false;
      continue;
    }
    const full = await getJSON(`${CATALOG}/api/resources/${found.id}`);
    const got = full.metadata?.config;
    const match = got?.kind === want.kind;
    console.log(`  ${key.padEnd(26)} kind=${got?.kind ?? 'MISSING'} ${match ? '' : '<-- MISMATCH'}`);
    if (!match) ok = false;
  }

  console.log(
    `\n${ok ? 'OK' : 'MISMATCH'}. The assistants service caches rulesets at boot — ` +
      `restart it by port and grep a marker before concluding anything about behaviour.`
  );
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
