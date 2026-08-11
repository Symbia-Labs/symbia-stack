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
  /** Who answered. */
  assistant?: string;
  /** Message id of the reply, so a resolution can name its source. */
  messageId?: string;
  at: string;
}

const memory = new Map<string, RememberedTurn>();

/**
 * Record a turn, but only when there is something worth referring back to.
 *
 * A refusal must NOT overwrite the last real answer. Otherwise:
 *
 *     2+2            -> 4
 *     tell me a joke -> refused
 *     multiply that by 10
 *
 * would find a refusal as the referent and fail, when a person plainly means
 * 4. Refusals are turns; they are not results.
 */
export function remember(conversationId: string, turn: Omit<RememberedTurn, 'at'>): void {
  if (!conversationId) return;
  if (turn.result === undefined || turn.result === null || turn.result === '') return;
  memory.set(conversationId, { ...turn, at: new Date().toISOString() });
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
}

/**
 * Substitute back-references with the last result.
 *
 * Returns the message untouched when there is nothing to substitute or nothing
 * to substitute with. **It never guesses.** A follow-up with no prior result
 * comes back unresolved and is refused downstream, which is correct: the
 * platform genuinely does not know what "that" means on the first turn.
 */
export function resolveReferences(conversationId: string, text: string): Resolution {
  const raw = String(text ?? '');
  const previous = recall(conversationId);

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
