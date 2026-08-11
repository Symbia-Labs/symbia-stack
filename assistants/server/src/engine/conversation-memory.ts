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
