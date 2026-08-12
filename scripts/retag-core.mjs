#!/usr/bin/env node
/**
 * `curriculum` -> `core` across the assistant roster, keeping the level tier.
 *
 * WRITTEN THROUGH THE CATALOG API. Editing `catalog/data/assistants-bootstrap.json`
 * does not reach a running system — every live resource still carries the
 * timestamp of the one bootstrap INSERT and every edit committed since is
 * invisible to the database. See STATUS §6.1.
 *
 * WHY. Brian, 12 Aug: "curriculum is remnant from trainer exercise. Maybe Core
 * is a better word." The word was doing real damage: tagged `curriculum`, the
 * roster reads as a teaching artifact whose value is pedagogical, and every
 * question about it ("should there be more?", "do the drafts matter?") gets
 * answered against the wrong purpose. These are the core assistants of the
 * platform.
 *
 * THE LEVELS STAY. `level-1`..`level-5` encoded a real distinction that the
 * trainer framing did not:
 *
 *   1-2  deterministic          Echo, Calculator, Converter
 *   3-4  hybrid                 Data Explainer, Code Runner, Smart Calc, Intent Router
 *   5    multi-agent            Coordinator, Analyst, Builder
 *
 * That ladder is why the reduction to three was survivable: we kept one
 * exemplar from levels 2, 4 and 5, so the spine stayed legible. Dropping the
 * numbers would have thrown that away along with the trainer vocabulary.
 *
 * LOSSLESS BY CONSTRUCTION. Everything except the six renamed keys is compared
 * before and after and any other difference fails the run. Prediction P7 in
 * docs/2026-08-12-assistant-normalization-spec.md is "complete AND lossless",
 * and a rename script that quietly drops a ruleset would satisfy the first half.
 *
 * Usage:
 *   node scripts/retag-core.mjs --dry-run
 *   node scripts/retag-core.mjs
 */

const CATALOG = process.env.CATALOG_URL || 'http://localhost:5003';
const DRY = process.argv.includes('--dry-run');

const headers = {
  'content-type': 'application/json',
  // catalog/server/src/auth.ts:68 — the internal-service gate.
  'x-service-auth': process.env.CATALOG_INTERNAL_SERVICE_TOKEN || 'internal',
};

/**
 * THE TAG IS `tutorial`, NOT `curriculum`.
 *
 * This script was first written to rename a `curriculum` tag, because that is
 * the word the metadata keys use and I assumed the tag matched. The dry run
 * reported ten metadata renames and zero tag renames, which is how the
 * assumption surfaced before anything was written. Measured: `tutorial` is on
 * 10/10 assistants; `curriculum` is on none.
 *
 * Both are the same trainer-exercise remnant wearing two different words, which
 * is its own small argument for the rename.
 */
const TAG_FROM = 'tutorial';
const TAG_TO = 'core';

/** metadata key renames. Value is carried across untouched. */
const KEY_RENAMES = {
  curriculumLevel: 'coreLevel',
  curriculumTitle: 'coreTitle',
  curriculumDescription: 'coreDescription',
};

async function getJSON(url) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function patch(id, body, label) {
  if (DRY) {
    console.log(`  [dry-run] PATCH ${id}  ${label}`);
    return;
  }
  const r = await fetch(`${CATALOG}/api/resources/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${id} -> ${r.status} ${await r.text()}`);
  console.log(`  PATCH ${id}  ${label}`);
}

/**
 * Everything that must survive the rename, as a comparable string.
 *
 * Deliberately includes the ruleSet. The most plausible way this script does
 * damage is by PATCHing a metadata object assembled from a partial read, so the
 * check has to cover the biggest thing in it.
 */
function invariant(resource) {
  const m = { ...(resource.metadata || {}) };
  for (const k of Object.keys(KEY_RENAMES)) delete m[k];
  for (const k of Object.values(KEY_RENAMES)) delete m[k];
  return JSON.stringify({
    key: resource.key,
    name: resource.name,
    description: resource.description,
    type: resource.type,
    status: resource.status,
    accessPolicy: resource.accessPolicy,
    // tags minus the one word we are changing, order-insensitive
    tags: [...(resource.tags || [])].filter((t) => t !== TAG_FROM && t !== TAG_TO).sort(),
    metadata: m,
  });
}

async function main() {
  console.log(`Catalog: ${CATALOG}${DRY ? '  (dry run)' : ''}\n`);

  const all = await getJSON(`${CATALOG}/api/resources?type=assistant`);
  const assistants = Array.isArray(all) ? all : all.resources || [];
  console.log(`${assistants.length} assistant(s) found\n`);

  const before = new Map();
  let changed = 0;

  for (const a of assistants) {
    const full = await getJSON(`${CATALOG}/api/resources/${a.id}`);
    before.set(a.id, invariant(full));

    const tags = [...(full.tags || [])];
    const metadata = structuredClone(full.metadata || {});

    const hadOldTag = tags.includes(TAG_FROM);
    const renamed = [];

    // tags: tutorial -> core, in place, no duplicate if core already present
    let nextTags = tags.map((t) => (t === TAG_FROM ? TAG_TO : t));
    nextTags = nextTags.filter((t, i) => nextTags.indexOf(t) === i);

    for (const [from, to] of Object.entries(KEY_RENAMES)) {
      if (Object.prototype.hasOwnProperty.call(metadata, from)) {
        metadata[to] = metadata[from];
        delete metadata[from];
        renamed.push(`${from}->${to}`);
      }
    }

    if (!hadOldTag && renamed.length === 0) {
      console.log(`  ${a.key.padEnd(30)} nothing to change`);
      continue;
    }

    changed++;
    await patch(
      a.id,
      { tags: nextTags, metadata },
      `${hadOldTag ? `${TAG_FROM}->${TAG_TO}` : ''}${hadOldTag && renamed.length ? ', ' : ''}${renamed.join(', ')}`
    );
  }

  if (DRY) {
    console.log(`\nDry run complete. ${changed} resource(s) would change. Nothing was written.`);
    return;
  }

  // ---- Verify from the catalog, not from what we just sent ---------------
  console.log('\nVerifying against the catalog:');
  const after = await getJSON(`${CATALOG}/api/resources?type=assistant`);
  const list = Array.isArray(after) ? after : after.resources || [];

  let stillOldTag = 0;
  let haveCore = 0;
  let keptLevel = 0;
  let lost = [];

  for (const a of list.sort((x, y) => x.key.localeCompare(y.key))) {
    const full = await getJSON(`${CATALOG}/api/resources/${a.id}`);
    const tags = full.tags || [];
    if (tags.includes(TAG_FROM)) stillOldTag++;
    if (tags.includes(TAG_TO)) haveCore++;
    if (tags.some((t) => /^level-[1-5]$/.test(t))) keptLevel++;

    if (before.get(a.id) !== invariant(full)) lost.push(a.key);

    const level = tags.find((t) => /^level-[1-5]$/.test(t)) || '—';
    console.log(
      `  ${a.key.padEnd(30)} ${(tags.includes(TAG_TO) ? TAG_TO : '????').padEnd(6)} ${level.padEnd(8)} coreLevel=${
        full.metadata?.coreLevel ?? '—'
      }`
    );
  }

  const ok = stillOldTag === 0 && haveCore === list.length && keptLevel === list.length && lost.length === 0;

  console.log(
    `\n${ok ? 'OK' : 'MISMATCH'}: ${stillOldTag} still tagged ${TAG_FROM} (want 0), ` +
      `${haveCore}/${list.length} tagged ${TAG_TO}, ${keptLevel}/${list.length} kept level-N`
  );
  if (lost.length) {
    console.log(`\nLOSSY — these changed in a field this script does not own:\n  ${lost.join('\n  ')}`);
  }

  console.log(
    '\nThe assistants service caches the roster at boot. Restart it, by port,\n' +
      'and grep a marker in the running bundle before concluding anything.'
  );

  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
