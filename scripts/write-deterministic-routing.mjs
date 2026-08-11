#!/usr/bin/env node
/**
 * Make routing deterministic, and make replies typed.
 *
 * Two changes, written through the catalog API:
 *
 * 1. Each specialist declares what it handles in `metadata.routing`. The
 *    coordinator stops holding a roster and stops asking a model.
 * 2. The coordinator's orchestrate rule becomes
 *    `tool.invoke assistants.route` -> `assistant.route`, with no llm.invoke
 *    anywhere in the routing path.
 * 3. Calculator and Smart Calculator emit typed `fields` alongside their
 *    template, so the receipt seals the value rather than the sentence.
 *
 * WHY DETERMINISTIC. GKS puts classification in the Interpreter role, which
 * must be non-generative, inference-free and reproducible
 * (genesis-key-spec/spec/pipeline/interpreter.md §2.1-2.3). The classifier
 * this replaces was an llm.invoke, violating all three by construction — and
 * measurably: four passes of the same eight prompts disagreed, and `2+2` came
 * back as an empty completion. A better prompt cannot fix a component in the
 * wrong slot.
 *
 * The decision is now a function of the message and the registry. No model, no
 * network, no hidden state — so a routed reply is recomputable, which is what
 * `canonical` means in this codebase.
 *
 * Usage: node scripts/write-deterministic-routing.mjs [--dry-run]
 */

const CATALOG = process.env.CATALOG_URL || 'http://localhost:5003';
const DRY = process.argv.includes('--dry-run');
const headers = {
  'Content-Type': 'application/json',
  'x-service-auth': process.env.CATALOG_INTERNAL_SERVICE_TOKEN || 'internal',
};

/**
 * Routing declarations.
 *
 * Ordered by precedence, and the ordering is the whole design. Calculator
 * claims things that are ALREADY arithmetic; Smart Calculator claims things
 * that are arithmetic in words. Bare `2+2` must not reach the model path, and
 * "15% tip on $47.50" must not reach the strict parser — which is exactly the
 * split that made these two assistants worth having.
 */
const DECLARATIONS = {
  'ast-calculator': {
    precedence: 100,
    handles: 'arithmetic written as an expression — `2+2`, `sqrt(16)`, `(10+5)*2`',
    // Tier 2 training. Deliberately narrow: Calculator's job is expressions
    // that are ALREADY arithmetic, so its examples must not teach the
    // classifier to claim prose. Anything wordy belongs to Smart Calculator,
    // which can actually parse it.
    examples: [
      '2+2',
      '7*8',
      '100/4',
      'sqrt(16)',
      '(10+5)*2',
      '2^10',
      '12 * 12',
      'what is 45/9',
      'calculate 99-33',
      'pi * 2',
      '3.14159 * 2',
      '17%5',
    ],
    patterns: [
      // A bare expression, optionally wrapped in a polite phrase that
      // normalizeMathInput will strip anyway. Anchored, so a sentence
      // containing a number does not qualify.
      String.raw`^\s*(?:please\s+)?(?:what(?:'s|s| is)|calculate|compute|evaluate|solve)?\s*[-+(]*\s*\d[\d\s.,()+\-*/^%x×÷]*\s*[)?!.]*\s*$`,
      // Named functions and constants, which are unambiguous even in prose.
      String.raw`^\s*(?:what(?:'s|s| is)\s+)?(?:sqrt|abs|sin|cos|tan|log|log2|log10|exp|floor|ceil|round)\s*\(`,
      String.raw`^\s*[-+(]*\s*(?:pi|e)\s*[-+*/^]`,
    ],
  },
  'ast-smart-calc': {
    precedence: 50,
    handles: 'arithmetic described in words — tips, splits, percentages, totals',
    // Tier 2 training. This is where paraphrase lives, so the examples are
    // conversational on purpose — including the phrasings that motivated the
    // tier at all ("work out the tip on this for me would you"), which no
    // pattern list would ever have enumerated.
    examples: [
      "what's 15% tip on $47.50",
      'split $120 between 4 people',
      'work out the tip on this for me would you',
      'can you figure out the tip',
      'how much is 3 dozen eggs',
      'what is 20% of 80',
      '20% off $80',
      'add 8.5% tax to $50',
      'if I drive 65mph for 2.5 hours how far',
      'now multiply that by 10',
      'divide it by 4',
      'half of 250',
      'a third of 99',
      'two plus two',
      'what do I owe if we split the bill four ways',
      'take 10 percent off two hundred',
    ],
    patterns: [
      String.raw`\b(?:tip|discount|tax|interest|markup)\b`,
      String.raw`\bsplit\b.*\b(?:between|among|across|by)\b`,
      String.raw`\d\s*%|\bpercent\b`,
      String.raw`[$£€]\s*\d`,
      String.raw`\b(?:how much|how many|how far|how long)\b`,
      String.raw`\bdozen\b|\beach\b.*\bcost\b`,
      String.raw`\b\d+\s*(?:mph|kph|km/h)\b`,
      // ARITHMETIC AS A VERB.
      //
      // Added 11 Aug once memory landed. "now multiply that by 10" resolved
      // correctly to "now multiply 4 by 10" and then matched nothing — the
      // referent was found and no specialist claimed the sentence. A
      // declaration gap, not a routing failure, and the honest fix is to
      // declare it rather than reach for a model to cover the hole. This is
      // the maintenance cost that docs/2026-08-11-lean-deterministic.md says
      // determinism moves rather than deletes, arriving on schedule.
      //
      // A digit is required in every one, so "multiply the vibes" still routes
      // nowhere.
      String.raw`\b(?:multiply|divide|subtract|add|times|plus|minus|halve|double|triple|square)\b[^.]*\d`,
      String.raw`\d[^.]*\b(?:times|plus|minus|divided by|multiplied by|over)\b`,
    ],
  },
};

/** Typed replies. The template renders these; the seal commits to them. */
const TYPED_REPLIES = {
  'ast-calculator': {
    ruleId: 'calc-evaluate',
    fields: {
      expression: '{{message.content}}',
      result: '{{steps.step-evaluate.result}}',
      computedBy: 'math.evaluate',
    },
    template: '= {{steps.step-evaluate.result}}',
  },
  'ast-smart-calc': {
    ruleId: 'smart-compute',
    fields: {
      request: '{{message.content}}',
      expression: '{{steps.step-parse.response}}',
      result: '{{steps.step-evaluate.result}}',
      expressionChosenBy: 'model',
      computedBy: 'math.evaluate',
    },
    template: '**Understood:** {{steps.step-parse.response}}\n**Answer:** {{steps.step-evaluate.result}}',
  },
};

async function getJSON(url) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r.json();
}

async function patch(id, body, label) {
  if (DRY) return console.log(`  [dry-run] ${id}  ${label}`);
  const r = await fetch(`${CATALOG}/api/resources/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${id} -> ${r.status} ${await r.text()}`);
  console.log(`  ${id}  ${label}`);
}

async function main() {
  console.log(`Catalog: ${CATALOG}${DRY ? '  (DRY RUN)' : ''}\n`);

  // ---- 1 & 3. Specialist declarations and typed replies -------------------
  console.log('Specialists:');
  for (const [id, decl] of Object.entries(DECLARATIONS)) {
    const res = await getJSON(`${CATALOG}/api/resources/${id}`);
    const metadata = structuredClone(res.metadata || {});
    metadata.routing = decl;

    const typed = TYPED_REPLIES[id];
    let typedNote = '';
    if (typed) {
      const rule = (metadata.ruleSet?.rules || []).find((r) => r.id === typed.ruleId);
      const send = rule?.actions?.find((a) => a.type === 'message.send');
      if (send) {
        send.params = { ...send.params, template: typed.template, fields: typed.fields };
        delete send.params.content; // template wins; a stale `content` would shadow it
        typedNote = `, ${Object.keys(typed.fields).length} typed fields`;
      } else {
        typedNote = `, WARNING: rule '${typed.ruleId}' has no message.send`;
      }
    }

    // Every pattern is compiled here, before it is written. An invalid regex
    // in a declaration makes an assistant permanently unreachable, and the
    // failure is silent at match time — this codebase has shipped that defect
    // twice already, in rule conditions.
    for (const p of decl.patterns) {
      try {
        new RegExp(p, 'i');
      } catch (e) {
        throw new Error(`${id}: routing pattern does not compile: ${p}\n  ${e.message}`);
      }
    }

    await patch(
      id,
      { metadata },
      `${decl.patterns.length} patterns, ${decl.examples?.length ?? 0} training examples, precedence ${decl.precedence}${typedNote}`
    );
  }

  // ---- 2. The coordinator stops asking a model ----------------------------
  console.log('\nCoordinator:');
  const coord = await getJSON(`${CATALOG}/api/resources/ast-coordinator`);
  const metadata = structuredClone(coord.metadata);
  const rules = metadata.ruleSet.rules;
  const orchestrate = rules.find((r) => r.id === 'coord-orchestrate');
  if (!orchestrate) throw new Error('coord-orchestrate not found');

  const before = orchestrate.actions.map((a) => a.type);

  orchestrate.description =
    'Match the request against what each specialist declares it handles, hand it over, and stay silent. ' +
    'Refuses rather than guessing when nothing matches.';
  orchestrate.actions = [
    {
      // Resolve back-references BEFORE routing.
      //
      // "now multiply that by 10" declares nothing and is refused. Once "that"
      // becomes the last sealed result it contains a number, matches a
      // declaration, and routes like any other turn. Deterministic — the
      // referent is a value this platform already holds, not something to be
      // inferred — and recorded as a step, so the receipt shows the question
      // that was actually answered.
      id: 'step-resolve',
      type: 'tool.invoke',
      params: {
        tool: 'context.resolve',
        input: '{{message.content}}',
        resultKey: 'resolved',
      },
    },
    {
      id: 'step-route',
      type: 'tool.invoke',
      params: {
        tool: 'assistants.route',
        input: '{{steps.step-resolve.result.text}}',
        resultKey: 'routeDecision',
      },
    },
    {
      id: 'step-handoff',
      type: 'assistant.route',
      params: {
        fromContext: true,
        contextKey: 'routeDecision',
        contentKey: 'resolved',
        reason: 'declared match',
      },
    },
  ];

  console.log(`  coord-orchestrate: [${before.join(', ')}] -> [${orchestrate.actions.map((a) => a.type).join(', ')}]`);
  const stillModel = orchestrate.actions.some((a) => a.type === 'llm.invoke');
  console.log(`  llm.invoke in the routing path: ${stillModel ? 'STILL PRESENT' : 'none'}`);

  await patch('ast-coordinator', { metadata }, 'orchestrate is deterministic');

  if (DRY) return console.log('\nDry run complete.');

  // ---- Verify from the catalog -------------------------------------------
  console.log('\nVerifying:');
  const after = await getJSON(`${CATALOG}/api/resources/ast-coordinator`);
  const actions = after.metadata.ruleSet.rules.find((r) => r.id === 'coord-orchestrate').actions;
  const ok = !actions.some((a) => a.type === 'llm.invoke');
  for (const id of Object.keys(DECLARATIONS)) {
    const r = await getJSON(`${CATALOG}/api/resources/${id}`);
    console.log(`  ${r.key.padEnd(28)} routing.patterns=${r.metadata.routing?.patterns?.length ?? 0}`);
  }
  console.log(`\n${ok ? 'OK' : 'MISMATCH'}: routing path has no model call`);
  console.log('\nRestart assistants — rulesets are cached at boot.');
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
