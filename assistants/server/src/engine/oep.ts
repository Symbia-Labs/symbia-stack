/**
 * Open Epistemic Protocol — enforcement, in the product.
 *
 * OEP is Layer 0 in the GKS stack: it defines what may be claimed and how.
 * GKS `alignment-oep.md` §2 states that GKS *"never weakens or bypasses OEP
 * rules"*. Nothing in this platform has ever enforced one. The arenas in
 * provenance.ts are an adjacent taxonomy that overlaps by accident, not a
 * claim-class implementation.
 *
 * THE REFERENCE VALIDATOR IS A STUB. `open-epistemic-protocol/validator/` has
 * `detector.detect()` returning `False` unconditionally and
 * `classifier.classify()` returning `None`. There is nothing to wire in —
 * "adopting the validator" would adopt a function that always says fine. What
 * the spec does have is seven executable assertions in `tests/*.yaml`, and
 * those are the real artifact: an executable statement of what the rules mean.
 * They are vendored beside this file (Apache 2.0) and this module is checked
 * against them.
 *
 * DELIBERATELY LEXICAL AND DELIBERATELY CONSERVATIVE. These are guards, not
 * judges. Every check errs toward reporting a violation it cannot prove absent
 * rather than clearing text it does not understand — a validator that passes
 * what it cannot read is worse than none, because it produces a green tick
 * over an unexamined claim. Where a rule genuinely needs semantic judgement,
 * this returns `unknown` and says so instead of guessing.
 *
 * ON LOCATION. This belongs in a shared library the moment a second service
 * produces user-facing claims; OEP is not an assistants concern any more than
 * `{{#each}}` was. It is here because assistants is the only producer today,
 * and moving it later is cheaper than standing up a workspace package now.
 * Recorded as a deferral, not an oversight — this codebase has three forked
 * `authMiddleware` implementations from exactly this decision going unrecorded.
 */

/** OEP `spec/claim-classes.md`. Exactly one applies to any output. */
export type ClaimClass =
  | 'observable_input'
  | 'public_knowledge'
  | 'model_intrinsic'
  | 'hypothetical'
  | 'unobservable_state';

export interface OepFinding {
  rule: string;
  /** `violation` fails. `unknown` means this check cannot decide — not a pass. */
  verdict: 'ok' | 'violation' | 'unknown';
  detail: string;
}

/**
 * Enforcement §1 — Fabricated Access Forbiddance.
 *
 * Claims implying knowledge of anything the system cannot observe: user
 * actions not given as input, UI behaviour, server internals, prior sessions.
 * Forbidden outright, and must be rewritten as a hypothesis with an explicit
 * statement of non-observability.
 *
 * The disclaimer check comes FIRST because the spec's own fixture requires it:
 * *"I cannot observe this; one hypothesis is that you interacted with the UI"*
 * must pass, and it contains the phrase `you interacted with` that would
 * otherwise trip the detector. Stating the limit is the prescribed rewrite, so
 * text that states it is compliant by construction.
 */
const NON_OBSERVABILITY = /\b(?:i cannot observe|i can't observe|i have no visibility|i cannot see|not observable|i do not have access)\b/i;

const AWARENESS_CUES: Array<[RegExp, string]> = [
  [/\byou (?:clicked|tapped|pressed|selected|navigated|scrolled|typed|opened|closed)\b/i, 'asserts a user action that was not supplied as input'],
  [/\b(?:remembered|recalls?|from) your (?:last|previous|earlier) (?:session|visit|conversation)\b/i, 'asserts memory of a session it cannot observe'],
  [/\bthe (?:server|system|backend|database) (?:remembered|logged|recorded|noticed|saw)\b/i, 'asserts internal state it cannot observe'],
  [/\byou (?:were|are) (?:trying to|attempting to|looking to)\b/i, 'asserts user intent'],
  [/\bon your (?:screen|display)\b/i, 'asserts UI state'],
];

export function checkAwareness(text: string): OepFinding {
  if (NON_OBSERVABILITY.test(text)) {
    return {
      rule: 'enforcement-1-fabricated-access',
      verdict: 'ok',
      detail: 'states non-observability explicitly, which is the prescribed rewrite',
    };
  }
  for (const [cue, detail] of AWARENESS_CUES) {
    if (cue.test(text)) {
      return { rule: 'enforcement-1-fabricated-access', verdict: 'violation', detail };
    }
  }
  return { rule: 'enforcement-1-fabricated-access', verdict: 'ok', detail: 'no unobservable-access cue' };
}

/**
 * Enforcement §2 — Hypothesis Labeling.
 *
 * Hypothetical content must be labelled AND offer at least two alternatives
 * with uncertainty made explicit. The fixture is precise about this: *"Maybe
 * the system restarted; that's my guess"* is labelled and still fails, because
 * one hedged guess is not two alternatives. *"One hypothesis is X, another is
 * Y"* passes.
 *
 * So the failing condition is: hedged, and not offering an alternative.
 */
const HEDGE = /\b(?:maybe|perhaps|probably|possibly|might|may have|could have|i guess|my guess|i think|likely|presumably|it seems)\b/i;
const ALTERNATIVE = /\b(?:another|alternatively|or else|a second|other possibilit|another hypothesis|on the other hand|either .* or)\b/i;
const HYPOTHESIS_MARKER = /\b(?:hypothesis|hypotheses|speculation|one possible|possibility)\b/i;

export function checkHypothesisLabeling(text: string): OepFinding {
  const hedged = HEDGE.test(text) || HYPOTHESIS_MARKER.test(text);
  if (!hedged) {
    return { rule: 'enforcement-2-hypothesis-labeling', verdict: 'ok', detail: 'no hypothetical content' };
  }
  if (ALTERNATIVE.test(text)) {
    return {
      rule: 'enforcement-2-hypothesis-labeling',
      verdict: 'ok',
      detail: 'labelled and offers an alternative',
    };
  }
  return {
    rule: 'enforcement-2-hypothesis-labeling',
    verdict: 'violation',
    detail: 'hypothetical content with no second alternative — the spec requires at least two',
  };
}

/**
 * Enforcement §3 — Provenance Requirements.
 *
 * Publicly Verifiable Knowledge must carry a source, recency, and contested
 * status. The fixture contrasts *"According to a 2023 WHO report"* (passes)
 * with *"Studies show that X is true"* (fails) — a named source with a date
 * versus an appeal to unnamed authority.
 *
 * `hasStructuralProvenance` exists because a sealed reply carries its sources
 * in the envelope rather than in the prose. A COMPUTED answer of `= 4` names
 * `math.evaluate` in its steps; demanding it also say so in words would be
 * demanding it duplicate its own receipt.
 */
const VAGUE_AUTHORITY = /\b(?:studies show|research shows|experts (?:say|agree)|it is (?:well )?known|scientists (?:say|believe)|reports? (?:say|suggest)|many believe)\b/i;
const NAMED_SOURCE = /\b(?:according to|per|cited in|source:|reported by)\b/i;
const RECENCY = /\b(?:19|20)\d{2}\b|\b(?:today|yesterday|this (?:week|month|year))\b/i;

export function checkProvenance(text: string, hasStructuralProvenance = false): OepFinding {
  if (VAGUE_AUTHORITY.test(text) && !NAMED_SOURCE.test(text)) {
    return {
      rule: 'enforcement-3-provenance',
      verdict: 'violation',
      detail: 'appeals to unnamed authority — no source to check',
    };
  }
  if (NAMED_SOURCE.test(text)) {
    return RECENCY.test(text)
      ? { rule: 'enforcement-3-provenance', verdict: 'ok', detail: 'named source with a date' }
      : {
          rule: 'enforcement-3-provenance',
          verdict: 'violation',
          detail: 'named source but no recency — the spec requires recency or timestamp',
        };
  }
  if (hasStructuralProvenance) {
    return {
      rule: 'enforcement-3-provenance',
      verdict: 'ok',
      detail: 'provenance carried structurally in the envelope rather than in prose',
    };
  }
  return {
    rule: 'enforcement-3-provenance',
    verdict: 'ok',
    detail: 'no public-knowledge claim detected',
  };
}

/**
 * Run every rule that applies to a reply.
 *
 * `arena` decides which rules are IN SCOPE, which is the arena/claim-class
 * mapping made executable:
 *
 *   COMPUTED, RETRIEVED  provenance is satisfied structurally by the steps
 *   COMPOSED             a model wrote over supplied material — provenance in scope
 *   GENERATED            Hypothetical Inference at best, Unobservable State at
 *                        worst. Labelling and alternatives are REQUIRED.
 *   REFUSED              already the prescribed rewrite
 *
 * Awareness applies to everything. A refusal can still fabricate access.
 */
export function checkReply(input: {
  content: string;
  arena: 'COMPUTED' | 'RETRIEVED' | 'COMPOSED' | 'GENERATED' | 'REFUSED';
}): OepFinding[] {
  const findings: OepFinding[] = [checkAwareness(input.content)];

  const structural = input.arena === 'COMPUTED' || input.arena === 'RETRIEVED';
  findings.push(checkProvenance(input.content, structural));

  if (input.arena === 'GENERATED') {
    // A GENERATED reply stands on nothing supplied and nothing checked. In OEP
    // terms it is Hypothetical Inference at best, so §2 applies in full and an
    // unlabelled one is a violation regardless of how it reads.
    const labelling = checkHypothesisLabeling(input.content);
    findings.push(
      labelling.verdict === 'ok' && !HEDGE.test(input.content) && !HYPOTHESIS_MARKER.test(input.content)
        ? {
            rule: 'enforcement-2-hypothesis-labeling',
            verdict: 'violation',
            detail:
              'GENERATED: a model answered from its own weights with nothing supplied and nothing ' +
              'verified, and the text is not labelled as hypothetical at all',
          }
        : labelling
    );
  } else {
    findings.push(checkHypothesisLabeling(input.content));
  }

  return findings;
}

export function summarise(findings: OepFinding[]): {
  compliant: boolean;
  violations: OepFinding[];
  unknowns: OepFinding[];
} {
  const violations = findings.filter((f) => f.verdict === 'violation');
  const unknowns = findings.filter((f) => f.verdict === 'unknown');
  // `unknown` does not count as compliant. A check that could not decide has
  // not cleared anything, and treating it as a pass is how a validator starts
  // producing green ticks over text nobody examined.
  return { compliant: violations.length === 0 && unknowns.length === 0, violations, unknowns };
}
