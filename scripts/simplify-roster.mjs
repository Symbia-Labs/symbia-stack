#!/usr/bin/env node
/**
 * Reduce the assistant roster to three, through the catalog API.
 *
 * WRITTEN THROUGH THE CATALOG API, NOT INTO THE DATABASE, and not by editing
 * `catalog/data/assistants-bootstrap.json`. Editing that file does not reach a
 * running system: the live resources all carry `2026-08-09T19:59:12.274Z`,
 * the timestamp of the one bootstrap INSERT, and every edit committed since
 * then is invisible to the database. Measured again 11 Aug 2026 by reading the
 * live catalog. See STATUS §6.1.
 *
 * WHY THREE. Ten assistants made the platform hard to hold in the head and
 * hard to test, and the ten did not divide cleanly. Three do:
 *
 *   Symbia       delegates, computes nothing itself
 *   Calculator   tool.invoke only            -> arena COMPUTED, no model
 *   Smart Calc   llm.invoke -> tool.invoke   -> arena COMPOSED, model chose
 *                                               the expression, arithmetic
 *                                               stayed exact
 *
 * That is the arena taxonomy in provenance.ts with exactly one variable
 * changed between the two specialists, which makes a wrong classification
 * visible instead of arguable.
 *
 * Usage:
 *   node scripts/simplify-roster.mjs --dry-run
 *   node scripts/simplify-roster.mjs
 */

const CATALOG = process.env.CATALOG_URL || 'http://localhost:5003';
const DRY = process.argv.includes('--dry-run');

/** The three that stay published. Everything else of type `assistant` is unpublished. */
const KEEP = new Set(['assistants/coordinator', 'assistants/calculator', 'assistants/smart-calc']);

const COORDINATOR = 'ast-coordinator';

/**
 * Unpublished, not deleted.
 *
 * `converter`, `code-runner` and `builder` are working rulesets that took real
 * work and demonstrate paths the three cannot. Deleting them would put them in
 * git history, which is a place nobody looks. `draft` keeps the resource, the
 * ruleset and the access policy intact and takes it out of the roster.
 *
 * This only means anything because assistant-loader now passes
 * `?status=published`. Until 11 Aug it did not, so `status` was decoration —
 * an unpublished assistant still loaded, still routed, and still appeared in
 * `assistants.list`. Setting this field before that fix would have changed
 * nothing observable, which is the worst kind of control: one an operator
 * believes they have used.
 */
const UNPUBLISHED_STATUS = 'draft';

/**
 * Remove inline regex modifiers, which are redundant here and fatal in the
 * container.
 *
 * condition-evaluator.ts compiles every `matches` pattern as
 * `new RegExp(value, 'i')` — case-insensitivity is ALREADY ON. So `(?i)` and
 * `(?i:...)` in a rule buy nothing, and cost the whole rule:
 *
 *   `(?i)who.*team`        throws on every Node. Dead everywhere.
 *   `.*(?i:health|...).*`  modifier groups landed in V8 12.x. Host Node
 *                          25.2.1 compiles it; the assistants container runs
 *                          Node 20.20.2 and throws. Measured 11 Aug 2026 by
 *                          running the pattern inside the container, because
 *                          running it on the host reports it healthy — the
 *                          instrument would have shared the bug's blind spot.
 *
 * STATUS §6.4 names one rule and gives the cause as "JavaScript does not
 * support" these. Both are off: it is two rules, and one of them is a runtime
 * version, which hides "upgrade the container's Node" as a candidate fix.
 */
function stripInlineFlags(pattern) {
  if (typeof pattern !== 'string') return pattern;
  return pattern
    .replace(/\(\?[a-zA-Z]+:/g, '(') // (?i:foo) -> (foo)
    .replace(/\(\?[a-zA-Z]+\)/g, ''); // (?i)foo  -> foo
}

/** Walk a condition tree and repair every pattern in it. Reports what changed. */
function repairConditions(node, changed, path = '') {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node.conditions)) {
    node.conditions.forEach((c, i) => repairConditions(c, changed, `${path}[${i}]`));
    return node;
  }
  if ((node.operator === 'matches' || node.operator === 'not_matches') && typeof node.value === 'string') {
    const repaired = stripInlineFlags(node.value);
    if (repaired !== node.value) {
      changed.push({ from: node.value, to: repaired });
      node.value = repaired;
    }
  }
  return node;
}

const headers = {
  'Content-Type': 'application/json',
  // catalog/server/src/auth.ts:68 — the internal-service gate. When
  // CATALOG_INTERNAL_SERVICE_TOKEN is set the header must equal that secret;
  // otherwise the literal 'internal' is accepted for local development.
  'x-service-auth': process.env.CATALOG_INTERNAL_SERVICE_TOKEN || 'internal',
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

async function main() {
  console.log(`Catalog: ${CATALOG}${DRY ? '  (DRY RUN — nothing will be written)' : ''}\n`);

  const all = await getJSON(`${CATALOG}/api/resources?type=assistant`);
  const assistants = Array.isArray(all) ? all : all.resources || [];
  console.log(`Found ${assistants.length} assistant resources.\n`);

  // ---- 1. Unpublish everything outside the three -------------------------
  console.log('Unpublishing:');
  const toUnpublish = assistants.filter((a) => !KEEP.has(a.key) && a.status !== UNPUBLISHED_STATUS);
  if (toUnpublish.length === 0) console.log('  (nothing to do)');
  for (const a of toUnpublish) {
    await patch(a.id, { status: UNPUBLISHED_STATUS }, `${a.key}  published -> ${UNPUBLISHED_STATUS}`);
  }

  // ---- 2. The coordinator becomes Symbia, and stops computing ------------
  console.log('\nCoordinator:');
  const coord = await getJSON(`${CATALOG}/api/resources/${COORDINATOR}`);
  const metadata = structuredClone(coord.metadata || {});
  const ruleSet = metadata.ruleSet;
  if (!ruleSet || !Array.isArray(ruleSet.rules)) {
    throw new Error(`${COORDINATOR} has no metadata.ruleSet.rules — refusing to guess`);
  }

  const before = ruleSet.rules.map((r) => r.id);

  /**
   * `rule-compute-first` (priority 220) ran math.evaluate on the raw message
   * and answered directly, ABOVE coord-orchestrate (100). So `2+2` was
   * answered by the coordinator and never reached Calculator — the simplest
   * test case was the one that did not exercise delegation. `sqrt(16)` failed
   * its regex and WAS delegated, so the same question took two different paths
   * depending on syntax.
   *
   * With three assistants the rule is also a coordinator competing with one of
   * its own two specialists. It goes.
   */
  ruleSet.rules = ruleSet.rules.filter((r) => r.id !== 'rule-compute-first');
  const removed = before.filter((id) => !ruleSet.rules.some((r) => r.id === id));

  const regexChanges = [];
  for (const rule of ruleSet.rules) repairConditions(rule.conditions, regexChanges, rule.id);

  /**
   * The help text was the last hardcoded roster.
   *
   * `coord-help` was static prose listing ten assistants by name — `@echo`,
   * `@convert`, `@run` — seven of which are now unpublished and none of which
   * it would ever notice changing. That is the fifth copy of a roster this
   * codebase has had to kill: `assistants.list` returned a literal array, the
   * orchestrate prompt embedded a snapshot, and two alias tables named
   * assistants that did not exist.
   *
   * It now reads the registry through the same `assistants.list` the roster
   * rule uses, and renders it with `{{#each}}` — which had to be implemented
   * in @symbia/sys first, because the team rule was already written against a
   * block helper the template language did not have.
   */
  const help = ruleSet.rules.find((r) => r.id === 'coord-help');
  let helpRewritten = false;
  if (help) {
    help.actions = [
      {
        id: 'step-roster',
        type: 'tool.invoke',
        params: { tool: 'assistants.list', resultKey: 'roster' },
      },
      {
        type: 'message.send',
        params: {
          template:
            '**Symbia**\n\n' +
            'I coordinate a team. Ask me anything and I hand it to whichever ' +
            'specialist fits; they answer you directly and I stay out of it.\n\n' +
            '**The team, live from the registry:**\n\n' +
            '{{#each steps.step-roster.result}}- **@{{alias}}** — {{description}}\n{{/each}}\n' +
            'Every reply carries a provenance envelope saying how it was ' +
            'arrived at: `COMPUTED` when a deterministic tool produced it and ' +
            'no model touched it, `COMPOSED` when a model wrote over material ' +
            'it was given.',
        },
      },
    ];
    helpRewritten = true;
  }

  console.log(`  rules ${before.length} -> ${ruleSet.rules.length}${removed.length ? `  (removed ${removed.join(', ')})` : ''}`);
  for (const c of regexChanges) console.log(`  regex  ${JSON.stringify(c.from)}\n      -> ${JSON.stringify(c.to)}`);
  if (regexChanges.length === 0) console.log('  regex  (no inline modifiers found)');

  // The alias was already `symbia`; only the display name lagged. The catalog
  // key and resource id stay `coordinator`/`ast-coordinator` — the self-loop
  // guard in assistant-route and this script both address it by id, and
  // renaming a key to match a label is churn with a failure mode.
  await patch(
    COORDINATOR,
    { name: 'Symbia', metadata },
    `name -> Symbia, ${removed.length} rule(s) removed, ${regexChanges.length} regex(es) repaired` +
      (helpRewritten ? ', help reads the registry' : '')
  );

  // ---- 3. Verify from the catalog, not from what we just sent ------------
  if (DRY) {
    console.log('\nDry run complete. Nothing was written.');
    return;
  }

  console.log('\nVerifying against the catalog:');
  const after = await getJSON(`${CATALOG}/api/resources?type=assistant`);
  const list = Array.isArray(after) ? after : after.resources || [];
  const published = list.filter((a) => a.status === 'published');
  for (const a of list.sort((x, y) => x.key.localeCompare(y.key))) {
    const mark = a.status === 'published' ? '*' : ' ';
    console.log(`  ${mark} ${a.key.padEnd(30)} ${a.status.padEnd(10)} ${a.name}`);
  }

  const ok =
    published.length === 3 && published.every((a) => KEEP.has(a.key));
  const coordAfter = await getJSON(`${CATALOG}/api/resources/${COORDINATOR}`);
  const stillComputes = (coordAfter.metadata?.ruleSet?.rules || []).some((r) => r.id === 'rule-compute-first');

  console.log(
    `\n${ok && !stillComputes ? 'OK' : 'MISMATCH'}: ${published.length} published (want 3), ` +
      `coordinator name="${coordAfter.name}", rule-compute-first ${stillComputes ? 'STILL PRESENT' : 'gone'}`
  );

  console.log(
    '\nThe assistants service caches the roster at boot. Restart it, by port,\n' +
      'and confirm the running bundle is the code you just built before\n' +
      'concluding anything about behaviour.'
  );

  if (!ok || stillComputes) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
