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
import { createHash } from 'node:crypto';

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
  /** The coordinator's steps, in order, up to and including the route. */
  steps: ProvenanceStep[];
  /** Message that triggered the delegation. */
  causedBy?: string;
  timestamp: string;
  /** Same construction as a reply envelope. */
  hash: string;
}

export interface ProvenanceEnvelope {
  arena: Arena;
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

// network/server/src/services/policy.ts refuses to start in production without
// this, and seals with the identical construction. This file had no such guard,
// so an unset variable meant production replies were sealed with a literal
// published in this repository — a seal anyone reading the source could forge.
// Same secret, same construction, so the same guard.
if (!process.env.NETWORK_HASH_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error(
    'NETWORK_HASH_SECRET is required in production — refusing to seal provenance ' +
    'envelopes with the development literal'
  );
}
const HASH_SECRET =
  process.env.NETWORK_HASH_SECRET || 'symbia-network-dev-only';

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
  delegation?: DelegationRecord
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
      `${delegation.decidedBy ? ` via ${delegation.decidedBy}` : ''}` +
      `; that choice is recorded in this envelope's delegation and is NOT reproducible.`
    : '';
  const withNote = (r: { arena: Arena; basis: string }) => ({
    arena: r.arena,
    basis: r.basis + note,
  });
  return withNote(classifyContent(steps, contentFromModel));
}

function classifyContent(steps: ProvenanceStep[], contentFromModel: boolean): {
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

  const deterministic = ok.filter((s) => s.action === 'tool.invoke');
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

  return { arena: 'REFUSED', basis: 'no step produced content' };
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
  steps: ProvenanceStep[];
  causedBy?: string;
}): DelegationRecord {
  const timestamp = new Date().toISOString();
  const body = {
    from: input.from,
    to: input.to,
    reason: input.reason,
    decidedBy: input.decidedBy,
    steps: input.steps.map((s) => ({
      id: s.id,
      action: s.action,
      source: s.source,
      ok: s.ok,
      outputDigest: s.outputDigest,
    })),
    causedBy: input.causedBy,
    timestamp,
  };
  const hash = createHash('sha256')
    .update(JSON.stringify(body))
    .update(HASH_SECRET)
    .digest('hex');
  return { ...body, steps: input.steps, timestamp, hash };
}

/** Seal an envelope over the reply content and the recorded steps. */
export function seal(input: {
  content: string;
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

  const { arena, basis } = classify(steps, input.contentFromModel, input.delegation);
  const timestamp = new Date().toISOString();

  const body = {
    content: input.content,
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

  const hash = createHash('sha256')
    .update(JSON.stringify(body))
    .update(HASH_SECRET)
    .digest('hex');

  return {
    arena,
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
  envelope: ProvenanceEnvelope
): boolean {
  // MUST MIRROR seal() FIELD FOR FIELD, INCLUDING ORDER.
  //
  // JSON.stringify is key-order dependent, so a field added to seal() and not
  // added here does not produce a "field missing" error — it produces a hash
  // mismatch, which is indistinguishable from a forgery. Two fields were added
  // for delegation (`by` on each step, `delegation`), and omitting them here
  // would have made every delegated reply look tampered with.
  const body = {
    content,
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

  const expected = createHash('sha256')
    .update(JSON.stringify(body))
    .update(HASH_SECRET)
    .digest('hex');

  return expected === envelope.hash;
}

/**
 * Verify a delegation on its own.
 *
 * The point of sealing the decision separately: a delegation can be checked
 * without the reply, and a reply's own seal commits to the delegation's hash,
 * so neither can be swapped for another. Either half stands alone; together
 * they bind.
 */
export function verifyDelegation(record: DelegationRecord): boolean {
  const body = {
    from: record.from,
    to: record.to,
    reason: record.reason,
    decidedBy: record.decidedBy,
    steps: record.steps.map((s) => ({
      id: s.id,
      action: s.action,
      source: s.source,
      ok: s.ok,
      outputDigest: s.outputDigest,
    })),
    causedBy: record.causedBy,
    timestamp: record.timestamp,
  };
  const expected = createHash('sha256')
    .update(JSON.stringify(body))
    .update(HASH_SECRET)
    .digest('hex');
  return expected === record.hash;
}
