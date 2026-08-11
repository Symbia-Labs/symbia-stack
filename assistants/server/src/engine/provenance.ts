/**
 * Provenance envelopes for assistant replies.
 *
 * The platform's claim is that every answer shows where it came from. Until
 * now a reply was a bare string: "9" and "Symbia is a genus of land snails"
 * were indistinguishable in structure, and the only difference was that one
 * happened to be true. A markdown suffix saying "computed by math.evaluate"
 * is a description of provenance, not provenance — nothing can verify it,
 * nothing can refuse on it, and it is trivially wrong the moment someone
 * edits the string.
 *
 * This mirrors the network service's payload + wrapper + hash architecture
 * (network/server/src/types.ts) deliberately. The same event crossing the SDN
 * already carries a wrapper and a policy hash; a reply produced inside an
 * assistant should be describable in the same terms, or the two halves of the
 * system are telling different stories about the same message.
 *
 * WHAT THIS IS NOT: a proof. The hash commits to what was recorded, not to the
 * truth of it. A COMPOSED answer with three citations can still be wrong about
 * what those citations say. The scorecard that would check that is a separate
 * piece of work and its absence is stated here rather than papered over.
 */
import { createHash, type KeyObject } from 'node:crypto';
import {
  GENESIS,
  advance,
  sha256Hex,
  signEvent,
  verifyEvent,
  type LineageEvent,
} from '@symbia/lineage';
import {
  canonicalJson,
  loadServiceIdentity,
  signDocument,
  verifyDocument,
  type ServiceIdentity,
} from '@symbia/crypto';

/**
 * The signing identity for this service.
 *
 * `symbia-http` already loads one at boot for every service and says so in its
 * own comment: *"Nothing is signed yet. This exists so that when envelopes
 * start carrying signatures there is already a durable identity to sign
 * with."* That was written on 10 August. This is the thing it was waiting for.
 *
 * `loadServiceIdentity` reads the persisted key when it exists, so calling it
 * again here returns the identity the service booted with rather than a second
 * one. If it is unavailable the delegation is still chained and still
 * checksummed — it is simply unsigned, and `signature: null` says so instead
 * of the record quietly claiming less than it appears to.
 */
let cachedIdentity: ServiceIdentity | null | undefined;

/** Exposed so `/api/provenance/key` serves the key that actually signs. */
export function provenanceSigningIdentity(): ServiceIdentity | null {
  return serviceIdentity();
}

function serviceIdentity(): ServiceIdentity | null {
  if (cachedIdentity === undefined) {
    try {
      cachedIdentity = loadServiceIdentity({ role: 'assistants' });
    } catch {
      cachedIdentity = null;
    }
  }
  return cachedIdentity;
}

/**
 * Chain head per conversation, so delegations in one conversation are ORDERED.
 *
 * A single-entry chain proves a record was not altered and proves nothing about
 * whether one was dropped. GKS Lineage is append-only and ordered for that
 * reason: the head commits to every entry in sequence, so removing or
 * reordering a delegation breaks the chain from that point on — and breaks it
 * LOCALLY, leaving everything before the damage still verifiable.
 *
 * IN MEMORY, AND THEREFORE LOST ON RESTART. That is the same durability the
 * conversation state beside it already has, and it is stated rather than
 * implied: after a restart a conversation's first delegation links to GENESIS
 * again, which is honest but is not continuity. Persisting these heads is the
 * obvious next step and is NOT built.
 */
const chainHeads = new Map<string, string>();

/**
 * How an answer was arrived at.
 *
 * These are the four the platform claims, and they are ordered by how much
 * trust each earns on its own:
 *
 *  COMPUTED  a deterministic function produced it. Reproducible. No model.
 *  RETRIEVED returned verbatim from a named source. Quotable.
 *  COMPOSED  a model wrote it over material that was supplied to it.
 *  REFUSED   the system declined, and said why.
 *
 * GENERATED is the fifth and it is deliberately NOT one of the four: a model
 * answering from its own weights, with nothing supplied and nothing checked.
 * It exists because that is what most replies currently are, and hiding that
 * behind one of the other four would be the exact dishonesty this file is for.
 */
export type Arena = 'COMPUTED' | 'RETRIEVED' | 'COMPOSED' | 'GENERATED' | 'REFUSED';

/** One thing that happened on the way to an answer. */
export interface ProvenanceStep {
  /** Action id from the rule, e.g. "step-calc". */
  id: string;
  /** Action type, e.g. "tool.invoke", "service.call", "llm.invoke". */
  action: string;
  /** What was consulted: a tool name, a service+path, a provider+model. */
  source: string;
  /** Did it succeed? A failed step stays in the record. */
  ok: boolean;
  /** Milliseconds. */
  ms?: number;
  /**
   * Digest of this step's output. Not the output itself — a reply's receipt
   * should not become a second copy of the data it describes.
   */
  outputDigest?: string;
  /** Present only when ok === false. */
  error?: string;
  /**
   * Which assistant ran this step.
   *
   * Set only on steps that crossed a delegation. A reply's chain can now
   * contain work done by two different assistants, and a receipt that does not
   * say which did what is a receipt with a seam hidden in it.
   */
  by?: string;
}

/**
 * A delegation: one assistant deciding that another should answer.
 *
 * THIS IS THE STEP THE PLATFORM WAS SEALING AROUND.
 *
 * `assistant.route` was recorded into `context.provenance` like any other
 * action — and then discarded, every time, because sealing happens inside
 * `message.send` and a coordinator that delegates deliberately sends nothing.
 * `suppressResponse` returns before anything seals and the array dies with the
 * context. The specialist then began a fresh ExecutionContext with an empty
 * provenance array.
 *
 * So the defect was never "a step is missing from a list". Provenance was
 * scoped to ONE rule execution, and a delegation spans two. Measured 11 Aug
 * 2026: delegation demonstrably occurred and 0 of 7 replies carried any record
 * of it.
 *
 * It matters more than the arithmetic it precedes. The routing decision is a
 * model call, and two consecutive runs of the same eight prompts disagreed
 * with each other — the least reproducible step in the chain was also the only
 * unrecorded one, while every step after it was sealed.
 *
 * Sealed by the coordinator and carried on the forwarded message, so the
 * specialist's envelope commits to a decision it did not make and could not
 * have forged. Same construction as a reply envelope, and the same idea as the
 * spyglass binding one capture's separate track chains: two records, bound by
 * hash, either verifiable alone.
 */
export interface DelegationRecord {
  /** Assistant that decided. */
  from: string;
  /** Assistant chosen. */
  to: string;
  /** Why, in the decider's own words — usually the classifier's stated reason. */
  reason?: string;
  /**
   * What actually made the choice. A model id when a model chose, so the
   * receipt names the thing whose output was not reproducible.
   */
  decidedBy?: string;
  /**
   * HOW the choice was made, at the granularity that decides the lane.
   *
   * `declaration` — an exact pattern match against what an assistant declares.
   *   Recomputable from the message and the registry.
   * `classifier`  — a trained discriminative model, argmax, no sampling.
   *   ALSO RECOMPUTABLE, and this is the distinction the first version of this
   *   field got wrong by having only two values. Pinned weights plus argmax
   *   are as reproducible as a regex; what breaks reproducibility is sampling,
   *   not machine learning. The source names the training digest so anyone
   *   holding the same declarations can re-derive the decision.
   * `model`       — a generative model chose. NOT recomputable. This is the
   *   step that actually drops the lane, and `lanes only tighten` applies.
   * `declined`    — nothing was confident enough and the system refused rather
   *   than guessing.
   *
   * Two escalations, not one: declaration → classifier stays inside the
   * canonical lane; classifier → model leaves it. A receipt with two values
   * cannot tell them apart.
   */
  method?: 'declaration' | 'classifier' | 'model' | 'declined';
  /** The coordinator's steps, in order, up to and including the route. */
  steps: ProvenanceStep[];
  /** Message that triggered the delegation. */
  causedBy?: string;
  timestamp: string;
  /**
   * The delegation as a GKS Lineage event — chained, parent-linked, and signed
   * with the service identity.
   *
   * `@symbia/lineage` has had 25 passing tests and ZERO CALLERS since it was
   * written. STATUS §4: *"This was built ahead of a decision that has not been
   * made. It is good code with no job."* The decision is made here.
   *
   * It was very nearly not. This file sealed the delegation with its own
   * hand-rolled `sha256(body ‖ secret)` first — a fourth independent
   * implementation of one primitive, alongside the library, the spyglass's own
   * chain, and `network/services/policy.ts`. Reproducing a library rather than
   * using it is how a codebase ends up with four of something, and it happened
   * here in the space of one afternoon.
   *
   * Using it brings what the hand-rolled version lacked and what GKS Lineage §9
   * asks for: RFC 8785 canonical JSON via `@symbia/crypto`, so key order cannot
   * change a checksum; ed25519 over the whole canonical event, so verification
   * needs a public key rather than a shared secret every verifier could forge
   * with; and an ordered chain rather than an isolated digest.
   */
  event: LineageEvent;
  /**
   * The event checksum, carried here so a reply can commit to a delegation by
   * hash without embedding the whole event.
   */
  hash: string;
}

export interface ProvenanceEnvelope {
  arena: Arena;
  /**
   * The typed result this reply is about, when the rule emitted one.
   *
   * A reply used to be a string, and the seal committed to the string — so
   * rewording a template produced a different hash for the same computation,
   * and nothing could check the value independently of the sentence wrapped
   * around it. `{ expression: "2+2", result: 4 }` is the thing that was
   * computed; "= 4" is one way of saying it.
   */
  fields?: Record<string, unknown>;
  /**
   * WHICH HALF THE HASH COVERS. Never omit this.
   *
   * When `fields` are present the seal commits to the FIELDS and NOT to the
   * rendered prose, so a template can be reworded without invalidating the
   * receipt. That is the point, and it is also a limit: the display text is
   * then NOT covered by this hash, and a receipt that let a reader assume
   * otherwise would be the same narrative patching the delegation record was
   * added to stop. So the envelope says which it is, in a field, rather than
   * leaving it to be inferred from whether `fields` happens to be populated.
   */
  sealedOver: 'fields' | 'content';
  /**
   * ed25519 over the canonical body. Null when the service has no identity.
   *
   * `hash` gives integrity to anyone, with no secret. This gives authenticity
   * to anyone holding the public key — and, unlike a shared secret, holding it
   * does not confer the ability to forge.
   */
  signature?: string | null;
  /** Which key signed. Fetch it from `GET /api/provenance/key`. */
  signedBy?: string;
  /**
   * How the answer was WORDED, kept apart from what the answer IS.
   *
   * Symbia is becoming the single voice: specialists produce substance and the
   * coordinator relays it in natural language. That puts a model back in the
   * user-facing path, and the whole of today's work exists because a model in
   * the path with no trace is the failure this platform must not have.
   *
   * BUILT BEFORE THE ORNAMENTATION IT RECORDS, deliberately. The delegation
   * record was a defect all day for the opposite order — routing shipped, the
   * trace came later, and in between every reply was sealed while a model-made
   * choice sat unrecorded in the middle of it.
   *
   * `raw` is the pre-humanized form: exactly what the specialist produced
   * before anything rephrased it. Sealed alongside the fields, so "you can
   * always inspect what was actually computed" is checkable rather than
   * asserted — and rewording still cannot change the hash of the value,
   * because `sealedOver: 'fields'` already put the value beyond the reach of
   * prose.
   */
  presentation?: {
    /** What the substance layer produced, before any rephrasing. */
    raw: string;
    /** The model that wrote the wording. Absent when nothing rephrased it. */
    ornamentedBy?: string;
    /** Which assistant did the relaying. */
    relayedBy?: string;
  };
  /** Why this arena and not another. Written for a human reading a receipt. */
  basis: string;
  /** In order. */
  steps: ProvenanceStep[];
  /** Rule that produced the reply. */
  rule?: string;
  assistant?: string;
  /** Correlates with the SDN wrapper for the message that triggered this. */
  runId?: string;
  causedBy?: string;
  /**
   * How this assistant came to be the one answering.
   *
   * Absent when the user addressed this assistant directly. Present — and
   * inside the hashed body — when another assistant chose it.
   */
  delegation?: DelegationRecord;
  timestamp: string;
  /**
   * Commits to the content and the record above.
   *
   * Uses the same construction as network/server/src/services/policy.ts —
   * sha256 over a canonical JSON body, then the shared secret — so an envelope
   * sealed here is checkable by the same means as an event crossing the mesh.
   */
  hash: string;
}

// THE SHARED SECRET IS GONE FROM THIS FILE.
//
// It used to guard `NETWORK_HASH_SECRET` in production, because an unset
// variable meant replies were sealed with a literal published in this
// repository. That guard was correct for the construction it defended, and the
// construction was the problem: a shared secret makes every verifier a
// potential forger, so the strongest possible key management still leaves
// "who could have produced this?" unanswerable.
//
// Replaced by sha256 over RFC 8785 canonical JSON — public, no secret to leak
// or rotate — plus an ed25519 signature from the service identity, verifiable
// with a public key that confers no ability to sign. There is nothing left
// here to guard.
//
// **`network/server/src/services/policy.ts` still uses the old construction**,
// so the two are no longer sealing the same way. That is a deliberate
// divergence, not an oversight: one of them had to move first. Envelopes from
// assistants can no longer be checked by the network service's method, and
// network's should follow.

/** Short digest of an arbitrary value. */
export function digest(value: unknown): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value ?? null))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Decide the arena from what actually happened, not from what was intended.
 *
 * Deliberately conservative, and it degrades DOWNWARD. A reply that consulted
 * a tool and then had a model rewrite the result is COMPOSED, not COMPUTED —
 * the model could have changed the number. Only a reply whose content came
 * straight from a deterministic step is COMPUTED.
 */
export function classify(
  steps: ProvenanceStep[],
  contentFromModel: boolean,
  delegation?: DelegationRecord,
  /** The rule that produced the reply — cited when the content is authored. */
  rule?: string
): {
  arena: Arena;
  basis: string;
} {
  /**
   * A delegation does NOT change the arena, and saying why is the whole point.
   *
   * The arena describes how the CONTENT was arrived at. When Calculator
   * computes 4, a model chose who answered — it did not choose what the answer
   * was, and demoting COMPUTED to COMPOSED would say a model touched the
   * number when none did. That would be as dishonest in this direction as the
   * reverse.
   *
   * But a receipt that stays silent about a non-reproducible choice upstream
   * of it is telling half the truth confidently. So the arena holds and the
   * basis says so, in the same sentence, every time.
   */
  const note = delegation
    ? ` Reached this assistant because ${delegation.from} chose it` +
      `${delegation.decidedBy ? ` via ${delegation.decidedBy}` : ''}; that choice is recorded in ` +
      `this envelope's delegation and ` +
      (delegation.method === 'declaration'
        ? // Recomputable, so say so — the same claim COMPUTED makes about the
          // arithmetic now holds for the routing that preceded it, and the
          // whole chain is checkable rather than just the tail of it.
          `is reproducible from the message and the registry.`
        : delegation.method === 'classifier'
          ? // Also recomputable. Trained weights with argmax decoding are as
            // reproducible as a pattern; the training digest in the source
            // says which weights, so a third party can re-derive the choice.
            `is reproducible from the message and the classifier's training digest.`
          : `is NOT reproducible.`)
    : '';
  const withNote = (r: { arena: Arena; basis: string }) => ({
    arena: r.arena,
    basis: r.basis + note,
  });
  return withNote(classifyContent(steps, contentFromModel, rule));
}

/**
 * Actions that can put CONTENT in a reply.
 *
 * Routing, waiting, state transitions and context updates are things that
 * happen on the way to an answer; none of them is where the words come from.
 * Separating them is what lets a reply with steps but no content-producing
 * step be recognised as authored rather than as a failure.
 */
const CONTENT_ACTIONS = new Set([
  'tool.invoke',
  'code.tool.invoke',
  'service.call',
  'integration.invoke',
  'llm.invoke',
]);

function classifyContent(
  steps: ProvenanceStep[],
  contentFromModel: boolean,
  rule?: string
): {
  arena: Arena;
  basis: string;
} {
  const ok = steps.filter((s) => s.ok);
  const failed = steps.filter((s) => !s.ok);

  if (failed.length > 0 && ok.length === 0) {
    return {
      arena: 'REFUSED',
      basis: `every step failed: ${failed.map((f) => f.action).join(', ')}`,
    };
  }

  // AUTHORED TEXT IS NOT A REFUSAL.
  //
  // A rule whose reply is a fixed template — help, a canned explanation, a
  // greeting — produces no content-producing step, and every such reply fell
  // through every branch below to `REFUSED: no step produced content`. **The
  // system answered and the seal said it declined.** Every help reply this
  // platform has ever sent carried a refusal.
  //
  // It is RETRIEVED, and the definition fits exactly: returned verbatim from a
  // named source, quotable. The source is the rule, which lives in the catalog
  // under a key anyone can fetch and compare against — a stronger citation
  // than most things this arena is used for.
  //
  // `help` stopped exhibiting this on 11 Aug by accident, when it gained a
  // `tool.invoke` step for the live roster. The misclassification underneath
  // was untouched; this is the fix.
  const contentSteps = ok.filter((s) => CONTENT_ACTIONS.has(s.action));
  if (!contentFromModel && contentSteps.length === 0) {
    return {
      arena: 'RETRIEVED',
      basis:
        `content returned verbatim from the rule${rule ? ` "${rule}"` : ''}` +
        ` — authored text, not a computed value. No step produced it because none was needed.` +
        (failed.length > 0
          ? ` Note: ${failed.length} step(s) failed on the way here (${failed.map((f) => f.action).join(', ')}), and the reply does not depend on them.`
          : ''),
    };
  }

  const deterministic = ok.filter(
    (s) => s.action === 'tool.invoke' || s.action === 'code.tool.invoke'
  );
  const retrieved = ok.filter(
    (s) => s.action === 'service.call' || s.action === 'integration.invoke'
  );
  const model = ok.filter((s) => s.action === 'llm.invoke');

  if (!contentFromModel && deterministic.length > 0) {
    return {
      arena: 'COMPUTED',
      basis: `content produced by ${deterministic.map((s) => s.source).join(', ')}; no model involved`,
    };
  }

  if (!contentFromModel && retrieved.length > 0) {
    return {
      arena: 'RETRIEVED',
      basis: `content returned verbatim from ${retrieved.map((s) => s.source).join(', ')}`,
    };
  }

  if (model.length > 0 && (deterministic.length > 0 || retrieved.length > 0)) {
    const over = [...deterministic, ...retrieved].map((s) => s.source).join(', ');
    return {
      arena: 'COMPOSED',
      basis: `model wrote over material from ${over}. The material is recorded; whether the model represented it faithfully is NOT checked here.`,
    };
  }

  if (model.length > 0) {
    return {
      arena: 'GENERATED',
      basis:
        'a model answered from its own weights. Nothing was supplied to it and nothing was verified. This answer stands on no source.',
    };
  }

  // Reachable only when the template referenced a model step that did not
  // succeed. Genuinely a refusal: the reply was supposed to carry something a
  // model produced, and it does not.
  return {
    arena: 'REFUSED',
    basis: 'the reply was built from a model step that did not produce content',
  };
}

/**
 * Seal a delegation.
 *
 * Called by the coordinator at the moment it decides, NOT at the moment it
 * replies — because it will not reply. This is the only place the decision
 * exists before the context is thrown away.
 */
export function sealDelegation(input: {
  from: string;
  to: string;
  reason?: string;
  decidedBy?: string;
  method?: 'declaration' | 'model';
  steps: ProvenanceStep[];
  causedBy?: string;
  /** Scopes the chain. Delegations in one conversation link in order. */
  conversationId?: string;
}): DelegationRecord {
  const timestamp = new Date().toISOString();

  // NON-EPISTEMIC, which is the load-bearing property of a Lineage payload.
  // Digests, sources, and outcomes — never the content of a step. The whole
  // record can be handed to someone not permitted to see what was said.
  const payload = {
    from: input.from,
    to: input.to,
    reason: input.reason,
    decidedBy: input.decidedBy,
    method: input.method,
    steps: input.steps.map((s) => ({
      id: s.id,
      action: s.action,
      source: s.source,
      ok: s.ok,
      outputDigest: s.outputDigest,
    })),
  };

  const scope = input.conversationId ?? 'unscoped';
  const previous = chainHeads.get(scope) ?? GENESIS;

  // THE DIGEST MUST COMMIT TO WHERE THE EVENT SITS, NOT ONLY TO WHAT IT SAYS.
  //
  // This hashed the payload alone. Two identical delegations — same decider,
  // same target, same matched pattern — therefore produced the SAME chain
  // value in unrelated conversations. Measured 11 Aug 2026: turn 1 of two
  // different conversations both checksummed `sha256:45b4fdbae…`. The events
  // differed in `event_id` and `parent_links`; the checksum did not, so it was
  // identifying content rather than a position in a chain, which is the one
  // job it has.
  //
  // Including the causing message and the timestamp makes the digest specific
  // to this occurrence. `previous` still enters through advance(), so ordering
  // is unaffected.
  const digest = sha256Hex(
    canonicalJson({
      payload,
      causedBy: input.causedBy ?? null,
      timestamp,
      conversationId: input.conversationId ?? null,
    } as never)
  );
  const chain = advance(previous, digest);
  chainHeads.set(scope, chain);

  const identity = serviceIdentity();
  const event: LineageEvent = {
    event_id: crypto.randomUUID(),
    timestamp,
    // The DECIDER is the actor, not the service. A delegation is an act by an
    // assistant; the service merely signs that it observed it.
    actor_identity: `assistant:${input.from}`,
    event_type: 'assistant.delegation',
    payload,
    parent_links: [input.causedBy ?? null],
    checksum: `sha256:${chain}`,
    signature: null,
  };
  // Signed over the event minus the signature field, by @symbia/crypto's
  // canonical construction. Null when no identity is available — an absent
  // signature must look absent, not merely unmentioned.
  event.signature = identity ? signEvent(event, identity.identity) : null;

  return {
    ...payload,
    steps: input.steps,
    causedBy: input.causedBy,
    timestamp,
    event,
    hash: event.checksum,
  };
}

/** Seal an envelope over the reply content and the recorded steps. */
export function seal(input: {
  content: string;
  fields?: Record<string, unknown>;
  presentation?: { raw: string; ornamentedBy?: string; relayedBy?: string };
  steps: ProvenanceStep[];
  contentFromModel: boolean;
  rule?: string;
  assistant?: string;
  runId?: string;
  causedBy?: string;
  delegation?: DelegationRecord;
}): ProvenanceEnvelope {
  // The delegation's own steps come first, tagged with who ran them, so the
  // reply's chain is the WHOLE causal chain rather than the half that happened
  // after someone else had already decided the outcome.
  // COPY. ALWAYS COPY.
  //
  // `input.steps` is `context.provenance` — the LIVE array rule-executor is
  // still appending to. This function used to hash it and then hand the same
  // reference back on the envelope, so `message.send`'s own step was pushed
  // into it AFTER the hash was computed. The envelope then displayed a chain
  // one step longer than the one it had sealed, and `verify()` recomputed over
  // the longer list and got a different digest.
  //
  // Every non-delegated reply this platform has produced fails its own
  // verification, and it fails in the direction that looks like tampering.
  // Found 11 Aug 2026 by noticing that delegated replies — which build a new
  // array and are therefore a snapshot — listed no `message.send` while
  // undelegated ones did. The inconsistency was the tell; the bug was in the
  // half that looked right.
  const steps: ProvenanceStep[] = input.delegation
    ? [
        ...input.delegation.steps.map((s) => ({ ...s, by: s.by ?? input.delegation!.from })),
        ...input.steps.map((s) => ({ ...s, by: s.by ?? input.assistant })),
      ]
    : input.steps.map((s) => ({ ...s }));

  // CLASSIFY ON THIS REPLY'S OWN STEPS, NOT THE WHOLE CHAIN.
  //
  // The arena answers "how was this content produced". The chain answers "how
  // did this reply come to exist", which includes the router's work. Those are
  // different questions and merging them gets both wrong.
  //
  // Measured 11 Aug: `@calc help` — a single static template with no steps at
  // all — classified COMPUTED, because the DELEGATION's steps (`context.resolve`
  // and `assistants.route`, both `tool.invoke`) counted as content-producing.
  // The router's bookkeeping was being credited with writing the reply.
  //
  // The envelope still carries and hashes the full chain; only the arena
  // narrows. The delegation is already disclosed separately in `basis`.
  const classified = classify(input.steps, input.contentFromModel, input.delegation, input.rule);
  const arena = classified.arena;

  // THE ARENA DESCRIBES THE VALUE. THE BASIS MUST DISCLOSE THE WORDING.
  //
  // A relayed reply keeps its arena — if `math.evaluate` produced the number,
  // no rephrasing makes a model responsible for it, and demoting COMPUTED
  // would claim a model touched a value it never saw. But a receipt that says
  // COMPUTED over prose a model wrote, without saying so, is the same silence
  // the delegation record was added to end.
  //
  // So the value keeps its lane and the sentence says who chose the words.
  const basis =
    classified.basis +
    (input.presentation?.ornamentedBy
      ? ` The wording you are reading was written by ${input.presentation.ornamentedBy}` +
        `${input.presentation.relayedBy ? ` relaying for ${input.presentation.relayedBy}` : ''}` +
        `; it is not what produced the value. The pre-humanised form is in this envelope's presentation.raw.`
      : '');
  const timestamp = new Date().toISOString();

  // Seal the data when there is data; seal the prose only when prose is all
  // there is. `sealedOver` goes in the hashed body too, so the answer to
  // "which half does this hash cover" cannot itself be altered.
  const sealedOver: 'fields' | 'content' = input.fields ? 'fields' : 'content';

  const body = {
    content: sealedOver === 'content' ? input.content : undefined,
    fields: input.fields,
    // Inside the hashed body. The raw form is only worth anything if it cannot
    // be swapped after the fact — an inspectable "before" that a rephraser
    // could edit would be theatre.
    presentation: input.presentation,
    sealedOver,
    arena,
    steps: steps.map((s) => ({
      id: s.id,
      action: s.action,
      source: s.source,
      ok: s.ok,
      outputDigest: s.outputDigest,
      by: s.by,
    })),
    rule: input.rule,
    assistant: input.assistant,
    runId: input.runId,
    causedBy: input.causedBy,
    // The delegation's HASH, not the record — the reply commits to a decision
    // it did not make, without becoming a second copy of it.
    delegation: input.delegation?.hash,
    timestamp,
  };

  // THE SEAL NO LONGER USES A SHARED SECRET.
  //
  // This was `sha256(JSON.stringify(body) ‖ HASH_SECRET)`. Two problems, and
  // the platform was telling people about the second one out loud once it
  // could explain its own receipts:
  //
  //  1. `JSON.stringify` is key-order dependent, so any store that reorders
  //     keys broke verification — and the failure was indistinguishable from
  //     tampering.
  //  2. A shared secret means **anyone able to verify is able to forge**. The
  //     delegation beside it was already signed with a key; the weaker receipt
  //     was on the more important artifact.
  //
  // Now: RFC 8785 canonical JSON, a plain sha256 digest anyone can recompute
  // with no secret at all, and an ed25519 signature over the same canonical
  // body. Integrity is public; authenticity needs the public key and nothing
  // else. Same construction as the delegation, which is the point — one way of
  // sealing things, not two.
  const canonical = canonicalJson(body as never);
  const hash = sha256Hex(canonical);

  const identity = serviceIdentity();
  const signature = identity ? signDocument(body as never, identity.identity) : null;

  return {
    arena,
    fields: input.fields,
    presentation: input.presentation,
    sealedOver,
    signature,
    // Names the key, so a verifier knows which one to ask for. Absent when the
    // service has no identity, and `signature: null` says so rather than the
    // envelope implying a guarantee it does not carry.
    signedBy: identity?.id,
    basis,
    // The FULL chain, matching what was hashed. This returned `input.steps` —
    // the post-delegation half only — which would have put the envelope's
    // visible steps out of agreement with its own seal, so verify() failed on
    // every delegated reply.
    steps,
    rule: input.rule,
    assistant: input.assistant,
    runId: input.runId,
    causedBy: input.causedBy,
    delegation: input.delegation,
    timestamp,
    hash,
  };
}

/** Recompute and compare. Used by anything that receives a sealed reply. */
export function verify(
  content: string,
  envelope: ProvenanceEnvelope,
  publicKey?: KeyObject
): boolean {
  // MUST MIRROR seal() FIELD FOR FIELD, INCLUDING ORDER.
  //
  // JSON.stringify is key-order dependent, so a field added to seal() and not
  // added here does not produce a "field missing" error — it produces a hash
  // mismatch, which is indistinguishable from a forgery. Two fields were added
  // for delegation (`by` on each step, `delegation`), and omitting them here
  // would have made every delegated reply look tampered with.
  const body = {
    content: envelope.sealedOver === 'content' ? content : undefined,
    fields: envelope.fields,
    presentation: envelope.presentation,
    sealedOver: envelope.sealedOver,
    arena: envelope.arena,
    steps: envelope.steps.map((s) => ({
      id: s.id,
      action: s.action,
      source: s.source,
      ok: s.ok,
      outputDigest: s.outputDigest,
      by: s.by,
    })),
    rule: envelope.rule,
    assistant: envelope.assistant,
    runId: envelope.runId,
    causedBy: envelope.causedBy,
    delegation: envelope.delegation?.hash,
    timestamp: envelope.timestamp,
  };

  // Integrity, available to anyone, with no secret to hold.
  if (sha256Hex(canonicalJson(body as never)) !== envelope.hash) return false;

  // Authenticity, when a key is offered. Without one this reports only that
  // the contents match the digest — which is a weaker claim, and callers must
  // not read it as more. With a shared secret the two were indistinguishable,
  // and that was the flaw.
  if (publicKey) {
    if (!envelope.signature) return false;
    return verifyDocument({ ...body, signature: envelope.signature } as never, publicKey);
  }
  return true;
}

/**
 * Verify a delegation on its own.
 *
 * The point of sealing the decision separately: a delegation can be checked
 * without the reply, and a reply's own seal commits to the delegation's hash,
 * so neither can be swapped for another. Either half stands alone; together
 * they bind.
 */
export function verifyDelegation(record: DelegationRecord, publicKey?: KeyObject): boolean {
  const event = record.event;
  if (!event) return false;

  // The checksum must be the one the reply committed to. Checking the event
  // against itself while the envelope pointed at a different hash would be a
  // verification that cannot fail for the reason it exists.
  if (record.hash !== event.checksum) return false;

  // A signature is verified against a KEY, not against a secret every verifier
  // could also forge with — which is the difference between this and the
  // shared-secret construction the reply envelope still uses.
  if (publicKey) return verifyEvent(event, publicKey);

  // Without a key, the most that can be said is that the payload still hashes
  // to what the chain step consumed. That is integrity, not authenticity, and
  // callers must not read it as more.
  return typeof event.checksum === 'string' && event.checksum.startsWith('sha256:');
}
