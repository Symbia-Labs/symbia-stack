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
export function classify(steps: ProvenanceStep[], contentFromModel: boolean): {
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

/** Seal an envelope over the reply content and the recorded steps. */
export function seal(input: {
  content: string;
  steps: ProvenanceStep[];
  contentFromModel: boolean;
  rule?: string;
  assistant?: string;
  runId?: string;
  causedBy?: string;
}): ProvenanceEnvelope {
  const { arena, basis } = classify(input.steps, input.contentFromModel);
  const timestamp = new Date().toISOString();

  const body = {
    content: input.content,
    arena,
    steps: input.steps.map((s) => ({
      id: s.id,
      action: s.action,
      source: s.source,
      ok: s.ok,
      outputDigest: s.outputDigest,
    })),
    rule: input.rule,
    assistant: input.assistant,
    runId: input.runId,
    causedBy: input.causedBy,
    timestamp,
  };

  const hash = createHash('sha256')
    .update(JSON.stringify(body))
    .update(HASH_SECRET)
    .digest('hex');

  return {
    arena,
    basis,
    steps: input.steps,
    rule: input.rule,
    assistant: input.assistant,
    runId: input.runId,
    causedBy: input.causedBy,
    timestamp,
    hash,
  };
}

/** Recompute and compare. Used by anything that receives a sealed reply. */
export function verify(
  content: string,
  envelope: ProvenanceEnvelope
): boolean {
  const body = {
    content,
    arena: envelope.arena,
    steps: envelope.steps.map((s) => ({
      id: s.id,
      action: s.action,
      source: s.source,
      ok: s.ok,
      outputDigest: s.outputDigest,
    })),
    rule: envelope.rule,
    assistant: envelope.assistant,
    runId: envelope.runId,
    causedBy: envelope.causedBy,
    timestamp: envelope.timestamp,
  };

  const expected = createHash('sha256')
    .update(JSON.stringify(body))
    .update(HASH_SECRET)
    .digest('hex');

  return expected === envelope.hash;
}
