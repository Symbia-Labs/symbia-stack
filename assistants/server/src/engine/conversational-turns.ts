/**
 * The turns a conversation contains that are not requests for work.
 *
 * Four conversations measured 11 Aug 2026 refused 14 of 20 turns. `hey`,
 * `nice`, `thanks`, `what can you do?` — all declined, the last one while
 * `help` sat two rules away with the answer.
 *
 * THIS IS A MISSING CATEGORY, NOT A MISSING PATTERN. Adding `hello` to a regex
 * fixes `hello` and leaves `hi`, `morning`, `yo` and `hey there` broken behind
 * it, which is the maintenance cost lean-deterministic warns about spent on the
 * least valuable possible thing. A conversation contains at least five kinds of
 * turn and only one of them was represented anywhere.
 *
 * Deterministic, and no model. These are the cheapest utterances in the
 * language to recognise and the most expensive to get wrong — a system that
 * needs a GPU to answer "thanks" has misallocated something.
 *
 * VARIATION IS PART OF CORRECTNESS HERE. The out-of-scope conversation received
 * the same refusal, word for word including the roster, four times. A person
 * who has read it once learns nothing from the second, and repeating it reads
 * as a machine that is not listening. So each kind carries several phrasings
 * and escalates: the second decline is shorter than the first, and the third
 * stops repeating the menu.
 */

export type TurnKind =
  | 'greeting'
  | 'closing'
  | 'acknowledgement'
  | 'capability'
  | 'correction'
  | 'work';

export interface TurnClassification {
  kind: TurnKind;
  /** The matched phrase, for the receipt. Empty for `work`. */
  matched: string;
}

const PATTERNS: Array<[TurnKind, RegExp]> = [
  // A correction is checked FIRST. "actually make it 20%" contains no
  // greeting and no thanks, but it does contain arithmetic, so anything that
  // looked for work first would route it and answer the wrong question — which
  // is exactly what happened to "add 15% tip first" on 11 Aug.
  ['correction', /^\s*(?:no,?\s|actually\b|wait\b|sorry,?\s|i meant\b|make (?:it|that)\b|change (?:it|that)\b|scratch that\b|instead\b)/i],
  ['correction', /\b(?:first|before that|not that)\s*$/i],

  ['greeting', /^\s*(?:hey|hi|hello|yo|hiya|howdy|morning|good morning|good afternoon|good evening|hey there|hi there|greetings)\b[\s!.,?]*$/i],
  ['greeting', /^\s*(?:hey|hi|hello)\b.{0,20}\b(?:how are you|whats up|what's up|hows it going)\b/i],

  ['closing', /^\s*(?:bye|goodbye|see ya|see you|later|good ?night|that'?s all|that will be all|we'?re done|im done|i'?m done)\b[\s!.,?]*$/i],

  ['acknowledgement', /^\s*(?:thanks|thank you|ta|cheers|nice|great|perfect|lovely|cool|ok|okay|got it|understood|makes sense|brilliant|excellent|awesome|sweet|👍)\b[\s!.,?]*$/i],

  ['capability', /\b(?:what can you do|what do you do|what are you (?:for|able to do)|how can you help|what can i ask|what are your (?:capabilities|skills)|who are you|what are you)\b/i],
];

export function classifyTurn(text: string): TurnClassification {
  const t = String(text ?? '');
  for (const [kind, re] of PATTERNS) {
    const m = t.match(re);
    if (m) return { kind, matched: m[0].trim() };
  }
  return { kind: 'work', matched: '' };
}

/**
 * Replies, several per kind, chosen by a counter rather than at random.
 *
 * Deterministic on purpose: the same conversation replays identically, which
 * keeps these turns inside the canonical lane and keeps the walk reproducible.
 * Randomness here would buy a little more variety and cost the property the
 * rest of the platform is built on.
 */
const REPLIES: Record<Exclude<TurnKind, 'work' | 'correction'>, string[]> = {
  greeting: [
    "Hello. I'm Symbia — I coordinate a small team and hand your question to whoever fits. What do you need?",
    'Hi. Ask me something and I\'ll route it to the right specialist. Say `help` if you want the roster.',
    'Hey. What are we working on?',
  ],
  closing: [
    'Any time.',
    'Cheers — I\'ll be here.',
    'Good luck with it.',
  ],
  acknowledgement: [
    'Glad it helped.',
    'Any time.',
    'No problem.',
  ],
  capability: [
    // Answered rather than deflected. `help` renders the live roster and this
    // must not become a fifth copy of it, so it says what it IS and points at
    // the rule that reads the registry.
    'I coordinate a team of specialists and hand each question to whichever one declares it. ' +
      'Every answer comes back with a receipt saying how it was arrived at — computed, composed, retrieved, or refused — ' +
      'and you can ask me `how do you know that?` about any of them. Say `help` for the current roster.',
  ],
};

/**
 * The reply for a conversational turn, escalating with repetition.
 *
 * `seen` is how many times this kind has already occurred in the conversation,
 * so the second greeting is not the first greeting.
 */
export function replyFor(kind: TurnKind, seen: number): string | undefined {
  if (kind === 'work' || kind === 'correction') return undefined;
  const options = REPLIES[kind];
  return options[Math.min(seen, options.length - 1)];
}

/**
 * Declines, escalating. Repeating the roster is the thing to stop doing.
 *
 * Measured: four identical refusals in one conversation, menu included. The
 * first decline should be helpful, the second brief, and the third should stop
 * pretending the list is new information.
 */
/**
 * Marks a deliberate decline so it is never dressed as a malfunction.
 *
 * `isDeclination()` used to match the refusal's WORDING, which worked exactly
 * until the wording started varying — the first escalated decline came back as
 * "⚠️ I ran into a problem", because "Still outside what my team covers" was
 * not in the list. Coupling a structural fact to a phrase breaks the moment the
 * phrase does its job.
 *
 * The prefix is stripped before display, so it is a signal between layers and
 * never reaches a person.
 */
export const DECLINED = 'DECLINED::';

export function declineFor(seen: number, roster: string): string {
  if (seen === 0) {
    return (
      `${DECLINED}That is not something any of my specialists declares, so I am not going to guess at it.\n\n` +
      `I can route to:\n${roster}`
    );
  }
  if (seen === 1) return `${DECLINED}Still outside what my team covers, I am afraid.`;
  return `${DECLINED}Also no — arithmetic is genuinely all I have people for.`;
}
