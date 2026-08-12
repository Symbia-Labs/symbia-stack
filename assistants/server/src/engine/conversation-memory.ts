/**
 * What a conversation remembers, and why it is not a model's job.
 *
 * "now multiply that by 10" was refused, honestly, because nothing declared it
 * and no specialist could see the turn before. The obvious fix is to hand the
 * transcript to a model and let it work out what "that" means. That is the
 * expensive answer to a question that is not hard.
 *
 * **The referent is a fact this platform already holds.** Replies carry typed
 * fields — `{ expression, result, computedBy }` — sealed separately from the
 * prose precisely so the value is usable apart from the sentence. So "that" is
 * a lookup, not an inference: deterministic, free, and reproducible.
 *
 * The split is the one in `docs/2026-08-11-lean-deterministic.md`. Resolving
 * WHICH value is a decision, and decisions use tools. Interpreting the
 * OPERATION — "multiply 4 by 10" into `4 * 10` — is capability, and that is
 * where a model earns its cost. Neither does the other's job.
 *
 * IN MEMORY, AND LOST ON RESTART. The same durability as the lineage chain
 * heads and the conversation state beside them, and stated for the same
 * reason: after a restart the next follow-up finds no referent and is refused
 * again. That is honest and it is not continuity. Persisting it is not built.
 */

export interface RememberedTurn {
  /** The value the last answer produced, when it produced one. */
  result?: number | string;
  /** The expression that produced it, for `again`. */
  expression?: string;
  /** Who produced the last result. */
  assistant?: string;
  /** Message id the result came from, so a resolution can name its source. */
  messageId?: string;
  /**
   * The last reply's sealed envelope, whatever it was.
   *
   * SEPARATE FROM `result` ON PURPOSE. "What was the last value" and "what was
   * the last answer" are different questions with different lifetimes: a
   * refusal has no value to refer back to but is absolutely something a person
   * may ask about. Collapsing them would mean either forgetting refusals — so
   * "why not?" cannot be answered — or letting a refusal overwrite the number
   * that "that" points at.
   */
  envelope?: unknown;
  /** The reply text the envelope belongs to. */
  content?: string;
  /** Who produced the last reply, result or not. */
  lastAssistant?: string;
  at: string;
}

const memory = new Map<string, RememberedTurn>();

/**
 * Record a turn, merging rather than replacing.
 *
 * The envelope and reply text are updated every turn; `result` is updated only
 * when the turn produced one. So:
 *
 *     2+2            -> 4          result = 4,  envelope = COMPUTED
 *     tell me a joke -> refused    result = 4,  envelope = REFUSED
 *     multiply that by 10          "that" is still 4
 *     why did you refuse?          explains the REFUSED envelope
 *
 * Both questions stay answerable, and neither clobbers the other.
 */
export function remember(conversationId: string, turn: Omit<RememberedTurn, 'at'>): void {
  if (!conversationId) return;
  const existing = memory.get(conversationId);

  const hasResult = turn.result !== undefined && turn.result !== null && turn.result !== '';

  memory.set(conversationId, {
    ...existing,
    // Only a turn that produced a value moves the referent.
    ...(hasResult
      ? {
          result: turn.result,
          expression: turn.expression,
          assistant: turn.assistant,
          messageId: turn.messageId,
        }
      : {}),
    // Every reply is the most recent reply, including a refusal.
    ...(turn.envelope !== undefined ? { envelope: turn.envelope } : {}),
    ...(turn.content !== undefined ? { content: turn.content } : {}),
    ...(turn.lastAssistant !== undefined ? { lastAssistant: turn.lastAssistant } : {}),
    at: new Date().toISOString(),
  });
}

export function recall(conversationId: string): RememberedTurn | undefined {
  return conversationId ? memory.get(conversationId) : undefined;
}

export function forget(conversationId: string): void {
  memory.delete(conversationId);
}

/**
 * Back-references, as a closed list.
 *
 * Deliberately small and deliberately not clever. Every entry is a word whose
 * ONLY plausible reading in a follow-up is "the thing you just told me". No
 * pronoun resolution, no coreference model, no scoring — if a phrase is not on
 * this list the message is left exactly as it arrived and the router refuses
 * as before, which is the honest outcome for something nobody has declared.
 *
 * Ordered longest-first so `the result` is consumed before `result`, and
 * word-bounded so `that` inside `that's` or a number is untouched.
 */
const BACK_REFERENCES = [
  /\bthe (?:result|answer|total)\b/gi,
  /\bthat number\b/gi,
  /\bprevious (?:result|answer)\b/gi,
  /\bthat\b/gi,
  /\bit\b/gi,
];

export interface Resolution {
  /** The message with references substituted. Unchanged when nothing matched. */
  text: string;
  resolved: boolean;
  /** What was replaced, and with what — so the receipt can show the substitution. */
  substitutions: Array<{ phrase: string; value: string }>;
  /** Message the value came from, so the step names a checkable source. */
  fromMessageId?: string;
  reason?: string;
  /**
   * What sort of follow-up this is.
   *
   * `continuation` operates on the last VALUE; `correction` revises the last
   * EXPRESSION. They are written with the same pronouns and mean opposite
   * things, which is how "actually make it 20%" produced 20% of the tip
   * instead of 20% of the bill.
   */
  kind?: 'continuation' | 'correction' | 'repeat';
  /** For a correction: the expression being revised, unsubstituted. */
  revises?: string;
}

/**
 * Substitute back-references with the last result.
 *
 * Returns the message untouched when there is nothing to substitute or nothing
 * to substitute with. **It never guesses.** A follow-up with no prior result
 * comes back unresolved and is refused downstream, which is correct: the
 * platform genuinely does not know what "that" means on the first turn.
 */
/**
 * "do that again" is a re-run, not a question about determinism.
 *
 * Read as a provenance question on the first browser test — `again` was in the
 * `reproducible` aspect pattern — and answered with a receipt. The user asked
 * for the work to be repeated and got an essay about whether it could be.
 *
 * Substituting the whole message with the previous EXPRESSION (not the result)
 * re-runs it: "do that again" becomes `10^7`, which routes and computes exactly
 * as it did the first time. Deterministic, and the receipt shows the same
 * expression, which is the honest thing for a repeat to look like.
 */
const REPEAT = /^\s*(?:(?:do|run|try|say|calculate|compute)\s+(?:that|it|this)\s+)?again\b[\s!.?]*$|^\s*(?:same again|one more time|repeat that|do it again)\b[\s!.?]*$/i;

/**
 * A CORRECTION IS NOT A CONTINUATION, AND THEY USE THE SAME PRONOUNS.
 *
 * This is the distinction the whole file was missing. Both of these contain a
 * back-reference and they mean opposite things:
 *
 *   "now multiply that by 10"   -> operate on the RESULT      (continuation)
 *   "actually make it 20%"      -> revise the EXPRESSION      (correction)
 *
 * Treating the second as the first is not a near miss. Measured 12 Aug 2026:
 *
 *   turn 1  "whats 15% tip on $47.50"  ->  47.50 * 0.15 = 7.125   correct
 *   turn 3  "actually make it 20%"     ->  7.125 * 0.20 = 1.425   WRONG
 *
 * The right answer is 9.50. `it` was bound to the tip instead of the bill, and
 * the reply carried arena COMPOSED — an honest receipt on a wrong answer, which
 * is the failure this platform exists to prevent. Nothing in the envelope was
 * false; the referent was.
 *
 * The ingredient was already here: `expression` is stored for `again`. A
 * correction revises that, rather than rebinding a pronoun to the last value.
 */
const CORRECTIONS = [
  /\bactually\b/i,
  /\binstead\b/i,
  /^\s*no[,\s]+(?:make|do|use|try)\b/i,
  /\b(?:make|change|set) (?:it|that|the \w+) (?:to|into)\b/i,
  /\bmake it\b/i,
  /\b(?:first|before that)\b[\s!.?]*$/i,
  /\bi meant\b/i,
  /\bshould (?:have )?be\b/i,
];

export function resolveReferences(conversationId: string, text: string): Resolution {
  const raw = String(text ?? '');
  const previous = recall(conversationId);

  if (REPEAT.test(raw)) {
    if (!previous?.expression) {
      return {
        text: raw,
        resolved: false,
        substitutions: [],
        reason: 'asked to repeat, but nothing in this conversation produced an expression to repeat',
      };
    }
    return {
      text: previous.expression,
      resolved: true,
      substitutions: [{ phrase: raw.trim(), value: previous.expression }],
      fromMessageId: previous.messageId,
    };
  }

  // CORRECTIONS ARE CHECKED BEFORE BACK-REFERENCES, because they contain them.
  //
  // "actually make it 20%" matches `\bit\b`. If back-reference substitution
  // runs first the pronoun is bound to the last VALUE and the correction is
  // silently applied to the wrong operand — see the note on CORRECTIONS.
  const isCorrection = CORRECTIONS.some((r) => r.test(raw));
  if (isCorrection) {
    if (!previous?.expression) {
      return {
        text: raw,
        resolved: false,
        kind: 'correction',
        substitutions: [],
        reason:
          'this revises a previous calculation, and nothing in this conversation produced one to revise',
      };
    }
    // The expression is handed back UNSUBSTITUTED, with the correction beside
    // it. Revising `47.50 * 0.15` given "make it 20%" is a rewrite, not an
    // arithmetic step, so it goes to whatever can rewrite — and the arithmetic
    // that follows stays exact, which is the whole shape of Smart Calculator.
    // THE EXPRESSION HAS TO TRAVEL WITH THE CORRECTION.
    //
    // Only `text` is forwarded to the specialist — the coordinator hands over
    // `resolved.text` and nothing else. Returning the raw correction alone
    // would leave Smart Calculator reading "actually make it 20%" with no idea
    // what to revise, which is a refusal at best and an invention at worst.
    //
    // Stated rather than substituted: the previous expression is quoted and
    // named as the thing being revised, so what the model receives says
    // plainly what it is being asked to do. The arithmetic afterwards is still
    // exact.
    const text = `Revise this calculation: \`${previous.expression}\` — ${raw.trim()}`;
    return {
      text,
      resolved: true,
      kind: 'correction',
      revises: previous.expression,
      substitutions: [{ phrase: raw.trim(), value: text }],
      fromMessageId: previous.messageId,
      reason: `revises the previous calculation \`${previous.expression}\` rather than operating on its result`,
    };
  }

  const mentionsReference = BACK_REFERENCES.some((r) => {
    r.lastIndex = 0;
    return r.test(raw);
  });
  if (!mentionsReference) {
    return { text: raw, resolved: false, substitutions: [], reason: 'no back-reference' };
  }
  if (!previous || previous.result === undefined) {
    return {
      text: raw,
      resolved: false,
      substitutions: [],
      reason: 'a back-reference was used and there is no prior result in this conversation',
    };
  }

  const value = String(previous.result);
  const substitutions: Array<{ phrase: string; value: string }> = [];
  let out = raw;

  for (const pattern of BACK_REFERENCES) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, (match) => {
      substitutions.push({ phrase: match, value });
      return value;
    });
  }

  return {
    text: out,
    resolved: substitutions.length > 0,
    substitutions,
    fromMessageId: previous.messageId,
  };
}

/** Testing and restart-behaviour probes. */
export function memorySize(): number {
  return memory.size;
}

/**
 * How many times a kind of turn has already happened here.
 *
 * Only so a reply can escalate — the second decline shorter than the first,
 * the third not repeating the roster. Counting is the cheapest possible way to
 * stop sounding like a machine that is not listening, and it needs no model.
 */
const turnCounts = new Map<string, Map<string, number>>();

export function countTurn(conversationId: string, kind: string): number {
  if (!conversationId) return 0;
  let counts = turnCounts.get(conversationId);
  if (!counts) {
    counts = new Map();
    turnCounts.set(conversationId, counts);
  }
  const seen = counts.get(kind) ?? 0;
  counts.set(kind, seen + 1);
  return seen;
}
