#!/usr/bin/env node
/**
 * Replace the coordinator's `coord-orchestrate` rule with one that delegates.
 *
 * WRITTEN THROUGH THE CATALOG API, NOT INTO THE DATABASE.
 *
 * Capability enters only through a gated, ledgered catalog write. Editing a
 * bootstrap JSON file would not have reached the running system at all --
 * measured 10 Aug 2026, the live ast-coordinator resource predates the fix
 * commit that edited that file by four hours, because bootstrap is a
 * first-run-only path whose single INSERT has been failing on every boot since.
 *
 * The rule this replaces was `llm.invoke -> message.send` over a prompt listing
 * the team, which produced prose ABOUT delegating and forwarded nothing.
 *
 * Usage: node scripts/write-coordinator-orchestrate.mjs [--dry-run]
 */

const CATALOG = process.env.CATALOG_URL || 'http://localhost:5003';
const RESOURCE = 'ast-coordinator';
const DRY = process.argv.includes('--dry-run');

/**
 * The roster is fetched from the registry at rule-authoring time and embedded
 * in the classifier prompt. That is a snapshot, and it is the fourth place a
 * team roster could live -- so it is built from `catalog` at RUN time instead,
 * via the same tool.invoke the `coord-team` rule already uses. The classifier
 * sees whoever is actually registered.
 */
const orchestrate = {
  id: 'coord-orchestrate',
  name: 'Delegate to a specialist',
  description:
    'Classify the request against the live roster, hand it to one specialist, and stay silent. Answers directly only when no specialist fits.',
  enabled: true,
  trigger: 'message.received',
  priority: 100,
  conditions: {
    logic: 'and',
    conditions: [{ field: 'message.content', value: true, operator: 'exists' }],
  },
  actions: [
    {
      id: 'step-roster',
      type: 'tool.invoke',
      params: {
        // No `input`. tool.invoke runs `input` through interpolate(), which
        // calls .replace() on it, so an object throws `t.replace is not a
        // function` and that string is what the person in the chat window
        // reads. assistants.list takes no input. The existing `coord-team`
        // rule passes an object here and is broken today for this reason.
        tool: 'assistants.list',
        resultKey: 'roster',
      },
    },
    {
      id: 'step-classify',
      type: 'llm.invoke',
      params: {
        resultKey: 'routeTarget',
        // ONE BARE WORD, NOT JSON.
        //
        // The first version asked for {"assistant": "...", "reason": "..."} at
        // maxTokens 120 and the reply was cut off mid-reason, so JSON.parse
        // failed, llm.invoke stored the fragment as a STRING, and
        // `context.routeTarget.assistant` was undefined. A structured output
        // that can be truncated into invalid syntax is a structured output
        // that will be. A single token cannot be half-parsed.
        maxTokens: 16,
        systemPrompt: [
          'You are the router inside Symbia\'s coordinator. You do not answer the',
          'user. You decide who should.',
          '',
          'The specialists currently registered on this platform:',
          '{{roster}}',
          '',
          'Reply with EXACTLY ONE WORD and nothing else: the `key` of the one',
          'specialist whose stated description covers this request, or the word',
          'none.',
          '',
          'Say none for greetings, chit-chat, and questions about Symbia itself.',
          'Never say coordinator — that is you, and routing to yourself is a loop.',
          'No punctuation, no explanation, no quotes. One word.',
        ].join('\n'),
        userPrompt: '{{message.content}}',
      },
    },
    {
      id: 'step-decide',
      type: 'condition',
      params: {
        // `neq`, not `notEquals`. The evaluator's switch returns false for any
        // operator it does not recognise, with no log line -- so a wrong
        // operator name here would have routed nothing, answered everything
        // directly, and looked like a working rule.
        //
        // `exists` first, so a classification that did not parse falls to the
        // else branch and gets answered rather than routed to `undefined`.
        if: {
          logic: 'and',
          conditions: [
            { field: 'context.routeTarget', operator: 'exists', value: true },
            { field: 'context.routeTarget', operator: 'neq', value: 'none' },
            // The model was told one word. If it writes a sentence anyway,
            // that is not a routing decision and must not be treated as one --
            // it would be handed to assistant.route as a target and refused
            // there, turning a chatty classifier into a refusal the person
            // reads. Bounded length keeps that in the else branch, where the
            // coordinator simply answers.
            { field: 'context.routeTarget', operator: 'matches', value: '^[a-z][a-z0-9-]{1,30}$' },
          ],
        },
        then: [
          {
            id: 'step-route',
            type: 'assistant.route',
            params: {
              fromContext: true,
              contextKey: 'routeTarget',
              reason: 'classified by the coordinator',
            },
          },
        ],
        else: [
          {
            id: 'step-answer',
            type: 'llm.invoke',
            params: {
              maxTokens: 500,
              systemPrompt: [
                'You are Symbia, the coordinator of a team of specialists on a',
                'platform for provable provenance.',
                '',
                'No specialist fit this request, so you are answering it yourself.',
                'Be brief and concrete. Do not claim to have consulted anyone. Do not',
                'describe how you would delegate -- if delegation were right, this',
                'message would have gone to a specialist instead of to you.',
                '',
                'If you do not know something about the running platform, say so',
                'rather than guessing. An honest refusal is a supported outcome here.',
              ].join('\n'),
              userPrompt: '{{message.content}}',
            },
          },
          {
            id: 'step-say',
            type: 'message.send',
            params: { template: '{{steps.step-answer.response}}' },
          },
        ],
      },
    },
  ],
};

async function main() {
  const get = await fetch(`${CATALOG}/api/resources/${RESOURCE}`);
  if (!get.ok) throw new Error(`GET ${RESOURCE} -> ${get.status}`);
  const resource = await get.json();

  const rules = resource?.metadata?.ruleSet?.rules;
  if (!Array.isArray(rules)) throw new Error('No metadata.ruleSet.rules on the resource');

  const idx = rules.findIndex((r) => r.id === 'coord-orchestrate');
  if (idx < 0) throw new Error('coord-orchestrate not found; refusing to guess where it goes');

  console.log(`Before: ${rules.length} rules`);
  console.log(
    `  coord-orchestrate actions: ${(rules[idx].actions || []).map((a) => a.type).join(' > ')}`
  );

  const next = rules.slice();
  next[idx] = orchestrate;

  console.log(`After:`);
  console.log(`  coord-orchestrate actions: ${orchestrate.actions.map((a) => a.type).join(' > ')}`);

  if (DRY) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  const body = {
    metadata: {
      ...resource.metadata,
      ruleSet: { ...resource.metadata.ruleSet, rules: next },
    },
  };

  const put = await fetch(`${CATALOG}/api/resources/${RESOURCE}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await put.text();
  if (!put.ok) throw new Error(`PATCH ${RESOURCE} -> ${put.status}: ${text.slice(0, 400)}`);

  // Read back. A write that reports success and did not persist is the exact
  // defect this platform exists to prevent, and asserting it worked from the
  // response code alone would be doing that.
  const verify = await fetch(`${CATALOG}/api/resources/${RESOURCE}`);
  const after = await verify.json();
  const stored = after?.metadata?.ruleSet?.rules?.find((r) => r.id === 'coord-orchestrate');
  const storedActions = (stored?.actions || []).map((a) => a.type).join(' > ');

  console.log(`\nRead back from the catalog: ${storedActions}`);
  console.log(`updatedAt: ${after.updatedAt}`);
  console.log(
    storedActions === orchestrate.actions.map((a) => a.type).join(' > ')
      ? 'PERSISTED'
      : 'MISMATCH -- the write did not take'
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
