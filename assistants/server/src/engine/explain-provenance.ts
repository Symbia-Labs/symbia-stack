/**
 * Say the receipt out loud.
 *
 * This platform seals an envelope on every reply: the arena, the basis, each
 * step with the source it consulted, the delegation that chose the responder
 * and by what method, and whether the whole thing verifies. All of it exists.
 * **None of it could be asked about.**
 *
 * "How do you know that?" is the question a provenance platform should answer
 * better than anything else in the world, and until now the only way to get an
 * answer was to read JSON out of a message's metadata. A receipt that requires
 * a developer to interpret it is a receipt the person it is for cannot use.
 *
 * DETERMINISTIC. No model. This renders a structure that is already sealed —
 * so the explanation is recomputable from the envelope, and cannot drift from
 * the thing it describes. If prose were generated from the envelope by a
 * model, the account of how an answer was produced would itself be an
 * unverifiable claim, which is the snake eating its own tail.
 *
 * HONEST ABOUT ITS OWN WEAKNESSES. The reply envelope is still sealed with a
 * shared secret rather than a signature, so anyone able to check it is also
 * able to forge it. That is stated in the explanation rather than glossed,
 * because a receipt that oversells itself is worse than none.
 */

export interface ExplainableEnvelope {
  arena?: string;
  basis?: string;
  sealedOver?: 'fields' | 'content';
  fields?: Record<string, unknown>;
  assistant?: string;
  runId?: string;
  hash?: string | null;
  signature?: string | null;
  signedBy?: string;
  steps?: Array<{ id: string; action: string; source: string; ok: boolean; by?: string }>;
  delegation?: {
    from?: string;
    to?: string;
    method?: string;
    decidedBy?: string;
    hash?: string;
    event?: { checksum?: string; signature?: string | null; actor_identity?: string };
  };
}

/** Which facet of the receipt the question is asking about. */
export type ExplainAspect = 'full' | 'source' | 'model' | 'router' | 'verify' | 'reproducible';

/**
 * THE SINGLE SOURCE OF TRUTH for "is this a question about the last answer".
 *
 * These were duplicated: this list, and ten hand-written conditions on the
 * `coord-explain` rule. The two drifted immediately — `can I verify that`
 * reached the rule and `are you sure?` did not, though both are obviously the
 * same question. Two sources of truth for one fact is the defect this codebase
 * has now killed five times, and it reappeared inside the feature built to make
 * the platform honest about itself.
 *
 * `scripts/write-deterministic-routing.mts` imports this array and GENERATES
 * the rule's conditions from it, so broadening coverage happens here, once.
 *
 * Ordered: the most specific aspect wins, `full` last as the catch-all.
 */
export const ASPECT_PATTERNS: Array<[RegExp, ExplainAspect]> = [
  [/\b(?:who|what) (?:decided|chose|picked|routed|sent)\b|\bwhy (?:you|did you) answer\b|\bwhy did (?:calc|calculator|smart|symbia)\b/i, 'router'],
  // "did you use a calculator or just know it" — the phrasing that motivated
  // widening this. `calculator` and `work (it|that) out` were both missing.
  [/\b(?:model|ai|llm|guess(?:ed)?|made (?:it|that) up|hallucinat|calculator|work(?:ed)? (?:it|that) out|just know)\b/i, 'model'],
  // `sure`, `certain`, `right`, `correct` and `trust you` were all missing, so
  // "are you sure?" and "what if I do not trust you" fell through to the router
  // and were answered by a specialist that could make nothing of them.
  [/\b(?:verify|check|prove|proof|trust|tamper|signature|signed|seal|are you sure|you sure|certain|is that (?:right|correct)|double ?check)\b/i, 'verify'],
  [/\b(?:reproducib|deterministic|again|same answer|repeatable|every time)\b/i, 'reproducible'],
  [/\b(?:source|where.*(?:from|come)|what.*(?:used|consulted)|cite|citation)\b/i, 'source'],
  [/\bhow do you know|how did you (?:know|get|work)|show.*(?:receipt|provenance)|what arena|why did you (?:refuse|decline)|explain\b/i, 'full'],
];

/**
 * The rule conditions, derived. Consumed by the catalog write script so the
 * rule and the tool can never disagree about what counts as the question.
 */
export const PROVENANCE_QUESTION_PATTERNS: string[] = ASPECT_PATTERNS.map(
  ([re]) => re.source
);

export function aspectOf(question: string): ExplainAspect {
  for (const [re, aspect] of ASPECT_PATTERNS) if (re.test(question)) return aspect;
  return 'full';
}

/** Does this look like a question about the previous answer rather than a new request? */
export function isProvenanceQuestion(text: string): boolean {
  return ASPECT_PATTERNS.some(([re]) => re.test(String(text ?? '')));
}

function describeArena(env: ExplainableEnvelope): string {
  switch (env.arena) {
    case 'COMPUTED':
      return 'It was **computed**. A deterministic tool produced the value and no model touched it.';
    case 'RETRIEVED':
      return 'It was **retrieved** — returned as-is from a named source.';
    case 'COMPOSED':
      return 'It was **composed**. A model wrote over material it was given. The material is recorded; whether the model represented it faithfully is **not** checked.';
    case 'GENERATED':
      return 'It was **generated** — a model answered from its own weights, with nothing supplied and nothing verified. It stands on no source.';
    case 'REFUSED':
      return 'It was a **refusal**. Nothing was produced, and the reason is recorded.';
    default:
      return 'That reply carries no arena, which is itself a defect — every reply should say how it was arrived at.';
  }
}

function describeSteps(env: ExplainableEnvelope): string[] {
  const steps = env.steps ?? [];
  if (steps.length === 0) return ['No steps were recorded for it.'];
  return steps.map((s) => {
    const who = s.by ? ` *(${s.by})*` : '';
    return `- \`${s.action}\` via **${s.source}** — ${s.ok ? 'ok' : 'failed'}${who}`;
  });
}

function describeDelegation(env: ExplainableEnvelope): string[] {
  const d = env.delegation;
  if (!d) return ['Nothing routed it — that assistant was addressed directly.'];

  const reproducible =
    d.method === 'declaration'
      ? 'That choice is reproducible from your message and the registry.'
      : d.method === 'classifier'
        ? "That choice is reproducible from your message and the classifier's training digest."
        : 'That choice came from a generative model and is **not** reproducible.';

  const lines = [
    `**${d.from}** chose **${d.to}** (${d.method ?? 'method not recorded'}).`,
    d.decidedBy ? `Decided by: \`${d.decidedBy}\`` : '',
    reproducible,
  ].filter(Boolean);

  if (d.event?.checksum) {
    lines.push(
      `The decision is its own sealed record: \`${d.event.checksum.slice(0, 24)}…\`` +
        (d.event.signature
          ? `, signed by ${d.event.actor_identity ?? 'the service'} — checkable with a public key, not a shared secret.`
          : ', unsigned.')
    );
  }
  return lines;
}

function describeSeal(env: ExplainableEnvelope): string[] {
  if (!env.hash) {
    return [
      'That reply is **unsealed** — there is no hash on it. It happens on the failure path, where no `message.send` ran to seal anything.',
    ];
  }
  const over =
    env.sealedOver === 'fields'
      ? 'The seal covers the **typed fields**, not the wording — so rephrasing the sentence does not change the hash, and the value can be checked apart from the prose.'
      : 'The seal covers the **reply text**.';

  const lines = [`Sealed: \`${String(env.hash).slice(0, 24)}…\``, over];

  if (env.signature) {
    lines.push(
      `Signed by \`${env.signedBy ?? 'this service'}\` (ed25519 over RFC 8785 canonical JSON).`,
      'You can check it yourself: the digest needs **no secret at all**, and the signature needs only the public key from `GET /api/provenance/key` — which lets you verify and **not** forge.'
    );
  } else {
    // Still stated rather than glossed. An unsigned envelope is a weaker claim
    // and the person asking "can I verify this" is entitled to the limit.
    lines.push(
      'Honest limit: this envelope is **unsigned** — the service had no identity available when it was sealed. The digest still proves the contents have not changed, but nothing proves who produced them.'
    );
  }
  return lines;
}

/**
 * Render an explanation of a sealed reply.
 *
 * Returns `undefined` when there is nothing to explain, so the caller can say
 * so rather than inventing a plausible account of an answer that was never
 * given.
 */
export function explain(
  envelope: ExplainableEnvelope | undefined,
  content: string | undefined,
  question: string
): string | undefined {
  if (!envelope) return undefined;

  const aspect = aspectOf(question);
  const quoted = content ? `> ${String(content).split('\n')[0].slice(0, 80)}` : '';
  const head = quoted ? `About my last answer:\n${quoted}\n` : '';

  switch (aspect) {
    case 'model': {
      const modelSteps = (envelope.steps ?? []).filter((s) => s.action === 'llm.invoke');
      const body =
        envelope.arena === 'COMPUTED'
          ? 'No. No model was involved in producing that value — it came from a deterministic tool.'
          : modelSteps.length > 0
            ? `Yes, in part. A model ran: ${modelSteps.map((s) => `\`${s.source}\``).join(', ')}. ${describeArena(envelope)}`
            : describeArena(envelope);
      return `${head}\n${body}`;
    }

    case 'router':
      return `${head}\n${describeDelegation(envelope).join('\n')}`;

    case 'verify':
      return `${head}\n${describeSeal(envelope).join('\n')}`;

    case 'reproducible': {
      const d = envelope.delegation;
      const routing =
        !d || d.method === 'declaration' || d.method === 'classifier'
          ? 'the routing is reproducible'
          : '**the routing is not reproducible** — a generative model chose the responder';
      const answer =
        envelope.arena === 'COMPUTED'
          ? 'the answer is recomputable from the expression'
          : envelope.arena === 'COMPOSED'
            ? 'the answer involved a model, so it is not guaranteed to come out the same way twice'
            : 'there is no computed value to reproduce';
      return `${head}\nFor that reply, ${routing}, and ${answer}.`;
    }

    case 'source':
      return `${head}\n${describeArena(envelope)}\n\nWhat it consulted:\n${describeSteps(envelope).join('\n')}`;

    case 'full':
    default:
      return [
        head,
        describeArena(envelope),
        '',
        '**Steps**',
        ...describeSteps(envelope),
        '',
        '**How it reached me**',
        ...describeDelegation(envelope),
        '',
        '**Seal**',
        ...describeSeal(envelope),
        envelope.basis ? `\n*Basis recorded at the time:* ${envelope.basis}` : '',
      ]
        .filter((l) => l !== undefined)
        .join('\n');
  }
}
