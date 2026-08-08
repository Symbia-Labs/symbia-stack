#!/usr/bin/env node
/**
 * Ground the coordinator.
 *
 * The coordinator is the assistant people actually talk to — anything typed
 * without an @mention lands on it — and it was the least grounded thing on the
 * stack. Its catch-all, `coord-orchestrate`, is one llm.invoke over the user's
 * words with a prompt listing a team of tutorial assistants. It fetches
 * nothing.
 *
 * Measured 8 Aug 2026: an operator on the Platform Overview panel, with the
 * spyglass parked on the SERVICES card, asked "I thought this should show 11/11
 * by now?" and was told "I don't actually have access to your screen,
 * dashboard, or any live system data in this conversation." Every one of those
 * things was available. The panel context was in the message metadata, the
 * service health was three HTTP calls away, and the assistant said it had none
 * of it.
 *
 * This edits TWO rules and leaves the rest alone:
 *
 *   coord-orchestrate  now fetches health, stats and topology first, and
 *                      answers from that plus the operator's panel context.
 *   coord-team         had two patterns starting with `(?i)`, which V8 rejects
 *                      as an invalid group. Both have been dead since they were
 *                      written — the rule can only ever have fired on the one
 *                      pattern that compiles.
 *
 * Everything else — compute-first, help, platform-status — is untouched.
 *
 *   npx tsx scripts/ground-coordinator.mts [--dry]
 */
const CATALOG = process.env.CATALOG_URL || 'http://localhost:5003';
const IDENTITY = process.env.IDENTITY_URL || 'http://localhost:5001';
const DRY = process.argv.includes('--dry');

const token = await fetch(`${IDENTITY}/api/auth/me`)
  .then((r) => r.json())
  .then((d: { token?: string }) => d.token)
  .catch(() => undefined);
if (!token) {
  console.log('No token. Nothing attempted.');
  process.exit(1);
}
const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

const listed = await fetch(`${CATALOG}/api/resources?type=assistant&limit=200`, { headers: auth }).then((r) =>
  r.json()
);
const arr = Array.isArray(listed) ? listed : (listed.resources ?? []);
const coordinator = arr.find((r: { key?: string }) => r.key === 'assistants/coordinator');
if (!coordinator) {
  console.log('Coordinator not found in catalog. Nothing changed.');
  process.exit(1);
}

const rules = coordinator.metadata.ruleSet.rules as Array<Record<string, unknown>>;

const SYSTEM = `You are Symbia, the coordinator, answering about THIS running installation.

Symbia is a platform for provable provenance: every answer shows where it came from — computed with a receipt, retrieved verbatim from a source, composed over cited material, or honestly refused.

RULES YOU MUST FOLLOW:
1. The LIVE DATA below was fetched from this stack seconds ago. Use it.
2. You are also told which panel the operator is looking at, and shown any screen region they captured. Treat "this", "here" and "that number" as referring to it.
3. NEVER say you have no access to the screen, the dashboard, or live data. You are given all three below. If a specific value is genuinely absent from the data, name the value and the service that would hold it.
4. Cite the service each fact came from, e.g. "(network)".
5. If the operator's expectation disagrees with the data, say what the data says and what would explain the difference. Do not simply agree.
6. Be brief and concrete. Numbers over adjectives.

Specialists you can direct them to: @security (credentials, providers, contracts), @obs (live traffic, errors, latency), @code (catalog resources, runtime components), @ui (registered apps, connected clients), @docs (service OpenAPI).`;

const calls = [
  { id: 'co-health', service: 'network', path: '/sdn/topology', resultKey: 'topology' },
  { id: 'co-catalog', service: 'catalog', path: '/stats', resultKey: 'catalogStats' },
  { id: 'co-runtime', service: 'runtime', path: '/stats', resultKey: 'runtimeStats' },
  { id: 'co-integrations', service: 'integrations', path: '/integrations/status', resultKey: 'providers' },
];

const orchestrate = rules.find((r) => r.id === 'coord-orchestrate');
if (!orchestrate) {
  console.log('coord-orchestrate not found. Nothing changed.');
  process.exit(1);
}

orchestrate.actions = [
  ...calls.map((c) => ({
    id: c.id,
    type: 'service.call',
    params: { service: c.service, method: 'GET', path: c.path, resultKey: c.resultKey },
  })),
  {
    id: 'step-respond',
    type: 'llm.invoke',
    params: {
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      maxTokens: 900,
      resultKey: 'answer',
      systemPrompt: SYSTEM,
      userPrompt:
        'LIVE DATA (fetched from this stack just now):\n' +
        calls.map((c) => `${c.service} ${c.path}: {{${c.resultKey}}}`).join('\n') +
        '\n\nUSER ASKED: {{message.content}}',
    },
  },
  { id: 'step-send', type: 'message.send', params: { content: '{{steps.step-respond.response}}' } },
];
orchestrate.description = 'Answer from live platform data and the operator’s context';

// The two dead patterns. `(?i)` is an invalid group in V8 and the evaluator
// already compiles with the `i` flag, so these have never matched anything.
const team = rules.find((r) => r.id === 'coord-team') as
  | { conditions?: { conditions?: Array<{ value?: string }> } }
  | undefined;
let fixedPatterns = 0;
for (const c of team?.conditions?.conditions ?? []) {
  if (typeof c.value === 'string' && c.value.startsWith('(?i)')) {
    c.value = c.value.slice(4);
    fixedPatterns++;
  }
}

if (DRY) {
  console.log(`would patch coord-orchestrate (${calls.length} fetches) and ${fixedPatterns} dead (?i) patterns`);
  process.exit(0);
}

const res = await fetch(`${CATALOG}/api/resources/${coordinator.id}`, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({ metadata: coordinator.metadata }),
});
console.log(
  `coordinator PATCH ${res.status} ${res.ok ? 'ok' : (await res.text()).slice(0, 160)} — ` +
    `${calls.length} fetches added, ${fixedPatterns} dead patterns fixed`
);
