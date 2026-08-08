#!/usr/bin/env node
/**
 * Five assistants scoped to THIS Symbia install.
 *
 * Every one of them answers only from data fetched out of the running stack a
 * moment earlier. None of them has general knowledge to fall back on, and each
 * system prompt says so explicitly: if the fetched data does not contain the
 * answer, say what is missing. An assistant that fills a gap from memory is the
 * exact failure this platform exists to prevent, and five confident-sounding
 * specialists with no reach would be a worse outcome than none.
 *
 * WHY EVERY RULE FETCHES FIRST. The existing bootstrap assistants — gmail,
 * gdrive, gcal, gsheets, gdocs — are a single llm.invoke over the user's words
 * with a prompt that says "describe what you WOULD do". They have no service
 * calls at all. That is a demo of an interface, not an assistant, and it is why
 * these are built the other way round: recall, then reason over what came back.
 *
 * PROVIDER. Every existing assistant declares provider openai / gpt-4o and this
 * stack has no openai credential — measured 7 Aug 2026, identity holds exactly
 * one, for anthropic. The coordinator additionally names
 * claude-3-5-sonnet-20241022, which the API rejects. These use
 * claude-sonnet-5, measured working through /api/integrations/execute.
 *
 *   npx tsx scripts/seed-stack-assistants.mts [--dry]
 */
const CATALOG = process.env.CATALOG_URL || 'http://localhost:5003';
const IDENTITY = process.env.IDENTITY_URL || 'http://localhost:5001';
const DRY = process.argv.includes('--dry');

const token = await fetch(`${IDENTITY}/api/auth/me`)
  .then((r) => r.json())
  .then((d: { token?: string }) => d.token)
  .catch(() => undefined);

if (!token) {
  console.log('No token from identity. Nothing attempted.');
  process.exit(1);
}

const SIBLINGS =
  '@security (credentials, providers, contracts), @obs (live traffic, errors, latency), @code (catalog resources, runtime components), @ui (registered apps, connected clients), @docs (service OpenAPI)';

const LLM = { provider: 'anthropic', model: 'claude-sonnet-5', maxTokens: 900, temperature: 0.3 };

/** The instruction every one of these shares. */
function grounding(role: string, sources: string): string {
  return `You are Symbia's ${role} assistant, answering about THIS running installation only.

Symbia is a platform for provable provenance: every answer shows where it came from — computed with a receipt, retrieved verbatim from a source, composed over cited material, or honestly refused.

RULES YOU MUST FOLLOW:
1. Answer ONLY from the LIVE DATA below. It was fetched from this stack moments ago.
2. If the data does not contain the answer, say exactly what is missing and which service would have it. Do NOT fill the gap from memory or from general knowledge about similar systems — an invented answer is the failure this platform exists to prevent.
3. Cite the service each fact came from, e.g. "(network)".
4. Never describe what you WOULD do if you had access. Either you have the data below or you say you do not.
5. Be brief and concrete. Numbers over adjectives.

Your sources: ${sources}`;
}

interface Call {
  id: string;
  service: string;
  path: string;
  resultKey: string;
  method?: string;
  body?: unknown;
  /** "" reaches the service root. Docs live there, not under /api. */
  basePath?: string;
}

/**
 * NO `(?i)` IN ANY PATTERN.
 *
 * The condition evaluator already compiles with the `i` flag
 * (condition-evaluator.ts:86), so `(?i)` is redundant — and V8 rejects it as an
 * invalid group, which makes the rule silently unmatchable. This codebase had
 * already recorded that defect in the coordinator's Team Roster rule on 7 Aug,
 * and I wrote it into all five of these anyway. Measured: every one fell
 * through to its refusal rule while the log said
 * "INVALID REGEX in condition — this rule can never match".
 */
function groundedRule(opts: {
  id: string;
  name: string;
  description: string;
  match: string;
  priority: number;
  calls: Call[];
  role: string;
  sources: string;
}) {
  const dataBlock = opts.calls.map((c) => `${c.service} ${c.path}: {{${c.resultKey}}}`).join('\n');
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    enabled: true,
    trigger: 'message.received',
    priority: opts.priority,
    conditions: {
      logic: 'or',
      conditions: [{ field: 'message.content', value: opts.match, operator: 'matches' }],
    },
    actions: [
      ...opts.calls.map((c) => ({
        id: c.id,
        type: 'service.call',
        params: {
          service: c.service,
          method: c.method ?? 'GET',
          path: c.path,
          ...(c.basePath !== undefined ? { basePath: c.basePath } : {}),
          ...(c.body ? { body: c.body } : {}),
          resultKey: c.resultKey,
        },
      })),
      {
        id: 'step-answer',
        type: 'llm.invoke',
        params: {
          provider: LLM.provider,
          model: LLM.model,
          maxTokens: LLM.maxTokens,
          resultKey: 'answer',
          systemPrompt: grounding(opts.role, opts.sources),
          userPrompt: `LIVE DATA (fetched from this stack just now):\n${dataBlock}\n\nUSER ASKED: {{message.content}}`,
        },
      },
      { id: 'step-send', type: 'message.send', params: { content: '{{steps.step-answer.response}}' } },
    ],
  };
}

function helpRule(id: string, body: string) {
  return {
    id: `${id}-help`,
    name: 'Help Command',
    description: 'What this assistant can answer',
    enabled: true,
    trigger: 'message.received',
    priority: 300,
    conditions: {
      logic: 'or',
      conditions: [
        { field: 'message.content', value: '^/help$', operator: 'matches' },
        { field: 'message.content', value: '^help$', operator: 'matches' },
      ],
    },
    actions: [{ type: 'message.send', params: { content: body } }],
  };
}

/**
 * The catch-all, which FETCHES rather than refuses on a regex miss.
 *
 * The first version was a static message: "that question did not match
 * anything I fetch". Measured 8 Aug 2026 — an operator standing on the
 * Platform Overview panel asked "@docs what does this dashboard show?" and got
 * that refusal, while the assistant was holding `symbiaContext` saying exactly
 * which panel they were on and had four live sources it never called.
 *
 * That is a refusal about a REGEX, dressed as a refusal about knowledge. The
 * two are not the same and only one of them is honest. A rule that did not
 * match is a fact about the rule; the operator should be told what the
 * assistant actually has, not that their phrasing failed.
 *
 * So the fallback now does the same fetch the matched rules do, gets the
 * operator's panel context appended automatically by attachments.ts, and is
 * instructed to answer if it can and to name what is missing if it cannot —
 * including which assistant WOULD have it. The refusal stays available; it just
 * has to be earned by the data rather than by a pattern.
 */
function contextualFallbackRule(opts: {
  id: string;
  role: string;
  sources: string;
  calls: Call[];
  siblings: string;
}) {
  const dataBlock = opts.calls.map((c) => `${c.service} ${c.path}: {{${c.resultKey}}}`).join('\n');
  return {
    id: `${opts.id}-fallback`,
    name: 'Answer from context',
    description: 'Fetch, then answer or say precisely what is missing',
    enabled: true,
    trigger: 'message.received',
    priority: 10,
    conditions: {
      logic: 'and',
      conditions: [{ field: 'message.content', value: true, operator: 'exists' }],
    },
    actions: [
      ...opts.calls.map((c) => ({
        id: `fb-${c.id}`,
        type: 'service.call',
        params: {
          service: c.service,
          method: c.method ?? 'GET',
          path: c.path,
          ...(c.basePath !== undefined ? { basePath: c.basePath } : {}),
          resultKey: c.resultKey,
        },
      })),
      {
        id: 'step-answer',
        type: 'llm.invoke',
        params: {
          provider: LLM.provider,
          model: LLM.model,
          maxTokens: LLM.maxTokens,
          resultKey: 'answer',
          systemPrompt: `${grounding(opts.role, opts.sources)}

THIS IS THE FALLBACK PATH. The operator's question did not match one of my
specific rules, so decide for yourself whether the LIVE DATA below answers it.

- If it does, answer, and cite the service.
- If it does not, say so in ONE short paragraph that states: which panel the
  operator is on (it is given to you below if known), which sources I consulted
  by name, and what specifically is not in them.
- Then, if another assistant would plainly have it, name them: ${opts.siblings}
- Never say only "that did not match" — a rule that did not fire is a fact
  about my configuration, not about what is knowable, and telling the operator
  their phrasing was wrong when the data was simply elsewhere is the least
  useful thing I could do.`,
          userPrompt: `LIVE DATA (fetched from this stack just now):\n${dataBlock}\n\nUSER ASKED: {{message.content}}`,
        },
      },
      { id: 'step-send', type: 'message.send', params: { content: '{{steps.step-answer.response}}' } },
    ],
  };
}

const assistants = [
  {
    key: 'security',
    name: 'Cybersecurity',
    alias: 'security',
    description:
      'Reports the security posture of THIS Symbia install from live data: stored credentials, provider exposure, mesh contracts and policies. Refuses to speculate.',
    capabilities: ['messaging', 'llm.chat', 'security.audit'],
    role: 'cybersecurity',
    sources: 'identity (credentials, orgs), integrations (providers), network (contracts, policies)',
    help: `**Cybersecurity** — scoped to this install\n\nI answer from live data only:\n- "what credentials are stored?" — identity\n- "which providers are configured?" — integrations\n- "what contracts exist on the mesh?" — network\n- "is anything unauthenticated?"\n\nI will not guess. If the data does not say, I say what is missing.`,
    rules: [
      {
        id: 'sec-posture',
        name: 'Security Posture',
        description: 'Credentials, providers and mesh contracts',
        match: 'credential|secret|api key|auth|token|permission|posture|exposed|security|who can|access',
        priority: 200,
        calls: [
          { id: 'c1', service: 'identity', path: '/credentials', resultKey: 'credentials' },
          // /orgs, not /users — identity has no /api/users route. Measured:
          // 404 "Cannot GET /api/users". Endpoints get probed before they get
          // written into a rule now.
          { id: 'c2', service: 'identity', path: '/orgs', resultKey: 'orgs' },
          { id: 'c3', service: 'integrations', path: '/integrations/status', resultKey: 'providers' },
          { id: 'c4', service: 'network', path: '/sdn/topology', resultKey: 'topology' },
        ],
      },
    ],
    examples: '- "what credentials are stored?"\n- "which providers have keys?"\n- "what contracts exist?"',
  },
  {
    key: 'observability',
    name: 'Observability',
    alias: 'obs',
    description:
      'Answers what the stack is doing right now from mesh events, traces and logs: volumes, error rates, latency, which services are silent.',
    capabilities: ['messaging', 'llm.chat', 'observability.query'],
    role: 'observability',
    sources: 'network (topology, events with obs.http traffic and traces), catalog and runtime (/stats)',
    help: `**Observability** — scoped to this install\n\nI answer from live mesh data:\n- "what is happening right now?"\n- "which services are erroring?"\n- "what is slow?" — p95 from obs.http\n- "who is calling whom?" — observed caller edges\n- "which services are silent?"\n\nEdges come from x-symbia-caller on obs.http events. A call with no caller came from a browser or from outside a request.`,
    rules: [
      {
        id: 'obs-now',
        name: 'What is happening',
        description: 'Live traffic, errors, latency and callers',
        match:
          'happening|traffic|error|slow|latency|p95|throughput|busy|quiet|silent|calling|who calls|events|observab|health',
        priority: 200,
        calls: [
          { id: 'c1', service: 'network', path: '/events?limit=300', resultKey: 'events' },
          { id: 'c2', service: 'network', path: '/sdn/topology', resultKey: 'topology' },
          { id: 'c3', service: 'catalog', path: '/stats', resultKey: 'catalogStats' },
          { id: 'c4', service: 'runtime', path: '/stats', resultKey: 'runtimeStats' },
        ],
      },
    ],
    examples: '- "what is happening right now?"\n- "which services are erroring?"\n- "who is calling identity?"',
  },
  {
    key: 'codebase',
    name: 'Code Base',
    alias: 'code',
    description:
      'Answers about what is registered in THIS install: catalog resources, runtime components and graphs, assistants. The platform registry, not the source tree.',
    capabilities: ['messaging', 'llm.chat', 'catalog.query'],
    role: 'code base',
    sources: 'catalog (resources, types, /stats), runtime (components, graphs, /stats)',
    help: `**Code Base** — scoped to this install\n\nI answer from the platform registry:\n- "what components are registered?" — runtime\n- "what resources are in the catalog?"\n- "what graphs exist?"\n- "what assistants are published?"\n\nI describe what this install HAS, not what Symbia could have. I do not read the git repository — nothing exposes it to me.`,
    rules: [
      {
        id: 'code-registry',
        name: 'Registry Contents',
        description: 'Catalog resources and runtime components',
        match:
          'component|catalog|resource|graph|registr|what.*built|what exists|assistant|type|version|published',
        priority: 200,
        calls: [
          { id: 'c1', service: 'catalog', path: '/stats', resultKey: 'catalogStats' },
          { id: 'c2', service: 'catalog', path: '/resources?limit=200', resultKey: 'resources' },
          { id: 'c3', service: 'runtime', path: '/components', resultKey: 'components' },
          { id: 'c4', service: 'runtime', path: '/stats', resultKey: 'runtimeStats' },
        ],
      },
    ],
    examples: '- "what components are registered?"\n- "how many resources in the catalog?"\n- "what graphs exist?"',
  },
  {
    key: 'interfaces',
    name: 'User Interfaces',
    alias: 'ui',
    description:
      'Answers about the surfaces this install exposes: the control center panels, which services are proxied, and what the console can reach.',
    capabilities: ['messaging', 'llm.chat', 'ui.query'],
    role: 'user interface',
    sources: 'catalog (app resources), network (registered client nodes), integrations (status)',
    help: `**User Interfaces** — scoped to this install\n\nI answer about the surfaces this stack exposes:\n- "what panels does the control center have?"\n- "what clients are connected?" — network client nodes\n- "what apps are registered?" — catalog\n\nI know what is REGISTERED. I cannot see the rendered page — nothing sends me the DOM, and scraping it would produce answers with no provenance.`,
    rules: [
      {
        id: 'ui-surfaces',
        name: 'Registered Surfaces',
        description: 'Apps, clients and console reach',
        match: '\\bui\\b|interface|panel|screen|page|console|client|app\\b|frontend|control center|dashboard',
        priority: 200,
        calls: [
          { id: 'c1', service: 'catalog', path: '/resources?type=app&limit=50', resultKey: 'apps' },
          { id: 'c2', service: 'network', path: '/sdn/topology', resultKey: 'topology' },
          { id: 'c3', service: 'integrations', path: '/integrations/status', resultKey: 'providers' },
        ],
      },
    ],
    examples: '- "what apps are registered?"\n- "what clients are connected?"',
  },
  {
    key: 'docs',
    name: 'Docs',
    alias: 'docs',
    description:
      'Answers from the API documentation THIS install serves: every service publishes its own OpenAPI and llms.txt, and those are the source.',
    capabilities: ['messaging', 'llm.chat', 'docs.query'],
    role: 'documentation',
    sources: 'each service /openapi.json and /llms.txt, served by the running services themselves',
    help: `**Docs** — scoped to this install\n\nI answer from what the running services publish about themselves:\n- "what endpoints does catalog have?"\n- "how do I call integrations?"\n- "what does the network API do?"\n\nThe source is each service's own OpenAPI, fetched live — so the answer matches the version actually running, not a document that drifted from it.`,
    rules: [
      {
        id: 'docs-api',
        name: 'API Documentation',
        description: 'Endpoints from the live OpenAPI documents',
        match: 'endpoint|api|how do i call|openapi|route|docs|documentation|parameter|payload|schema',
        priority: 200,
        calls: [
          // basePath '' — these live at the service ROOT, not under /api.
          { id: 'c1', service: 'catalog', path: '/docs/openapi.json', basePath: '', resultKey: 'catalogApi' },
          { id: 'c2', service: 'integrations', path: '/docs/openapi.json', basePath: '', resultKey: 'integrationsApi' },
          { id: 'c3', service: 'network', path: '/docs/openapi.json', basePath: '', resultKey: 'networkApi' },
        ],
      },
    ],
    examples: '- "what endpoints does catalog have?"\n- "how do I call integrations execute?"',
  },
];

// One listing, matched by key. See the upsert comment below.
const existingByKey = new Map<string, string>();
{
  const listed = await fetch(`${CATALOG}/api/resources?type=assistant&limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => r.json())
    .catch(() => []);
  const arr = Array.isArray(listed) ? listed : (listed.resources ?? []);
  for (const r of arr) if (r?.key && r?.id) existingByKey.set(r.key, r.id);
}

for (const a of assistants) {
  const rules = [
    helpRule(a.key, a.help),
    ...a.rules.map((r) =>
      groundedRule({ ...r, role: a.role, sources: a.sources })
    ),
    contextualFallbackRule({
      id: a.key,
      role: a.role,
      sources: a.sources,
      calls: a.rules[0].calls,
      siblings: SIBLINGS,
    }),
  ];

  const resource = {
    id: `ast-${a.key}`,
    key: `assistants/${a.key}`,
    name: a.name,
    description: a.description,
    type: 'assistant',
    status: 'published',
    tags: ['assistant', 'symbia-stack', 'scoped', a.key],
    accessPolicy: {
      actions: { read: { anyOf: ['public'] }, write: { anyOf: ['role:admin'] } },
      visibility: 'public',
    },
    metadata: {
      alias: a.alias,
      ruleSet: {
        id: `ruleset-${a.key}`,
        name: `${a.name} Rules`,
        description: a.description,
        version: 1,
        isActive: true,
        rules,
      },
      llmConfig: LLM,
      assistantConfig: {
        principalId: `assistant:${a.key}`,
        principalType: 'assistant',
        capabilities: a.capabilities,
      },
      scopedTo: 'this-install',
    },
  };

  if (DRY) {
    console.log(`${a.key}: ${rules.length} rules, ${JSON.stringify(resource).length} bytes`);
    continue;
  }

  // Upsert, by KEY not by id.
  //
  // The catalog assigns its own UUID and ignores the `id` in the body, so
  // GET /api/resources/ast-observability is a 404 even when the resource
  // exists — which made the first attempt POST again and collide on the unique
  // key. `?key=` is not a filter either: it returns all 79 resources. So the
  // list is fetched once and matched here.
  const id = existingByKey.get(resource.key);
  const res = await fetch(
    id ? `${CATALOG}/api/resources/${id}` : `${CATALOG}/api/resources`,
    {
      // PATCH, not PUT — catalog registers PATCH /api/resources/:id
      // (routes.ts:500) and no PUT route exists at all.
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(resource),
    }
  );
  const body = await res.text();
  console.log(
    `${a.key.padEnd(14)} ${id ? 'PATCH' : 'POST'} ${res.status} ${res.ok ? 'ok' : body.slice(0, 160)}`
  );
}
