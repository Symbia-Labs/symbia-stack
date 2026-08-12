#!/usr/bin/env npx tsx
/**
 * Whole conversations, judged on CADENCE rather than correctness.
 *
 * Everything measured so far asks "was the answer right and is it attributable".
 * Both are now largely yes, and the thing is still unpleasant to talk to,
 * because a conversation is not a list of questions. `verify-assistants` cannot
 * see this: it opens a fresh conversation per case, so it never observes an
 * opening, a rhythm, or a repetition.
 *
 * Prior art, and this borrows its shape: `~/vscode/symbia-chat-lab/converse100.py`
 * composes opener -> aside -> calculation -> "how did you know?" -> orphan
 * follow-up -> domain question -> trap -> repeat, and flags CREDIT (the model
 * claiming work the router did) and CONTRADICTION. Those are correctness flags
 * with a conversational shape. What follows adds the cadence measures that
 * neither harness has.
 *
 * THE THESIS BEING TESTED: superhuman AND human. Superhuman is precision,
 * receipts, instant arithmetic, never bluffing. Human is acknowledging what was
 * just said, not repeating yourself word for word, offering a way forward
 * instead of a menu, and not treating "hey" as a malformed request.
 *
 * Nothing here asserts what good looks like beyond that. It reports numbers a
 * person can disagree with.
 */

const MESSAGING = process.env.MESSAGING_URL || 'http://localhost:5005';
const EMAIL = process.env.SYMBIA_EMAIL || 'dev@example.com';
const PASSWORD = process.env.SYMBIA_PASSWORD;
const ORG_ID = process.env.SYMBIA_ORG_ID || '';
const COORDINATOR = 'assistant:coordinator';
const TIMEOUT = Number(process.env.REPLY_TIMEOUT_MS || 60000);

/**
 * Four conversations with a shape, not four lists.
 *
 * Each opens the way a person opens one, wanders, comes back, and asks the
 * platform about itself. `expect` is a note for the reader, not an assertion —
 * this probe measures rhythm and reports it; it does not pass or fail.
 */
const CONVERSATIONS: Array<{ name: string; note: string; turns: string[] }> = [
  {
    name: 'first-contact',
    note: 'Somebody who has never used it. The opening is the whole test.',
    turns: [
      'hey',
      'what can you do?',
      'ok, 2+2',
      'how did you know that?',
      'nice',
    ],
  },
  {
    name: 'working-through-a-problem',
    note: 'A real task with follow-ups whose operands live in earlier turns.',
    turns: [
      'we need to split a 47.50 dinner bill between 3 of us',
      'add 15% tip first',
      'so what does each person owe',
      'double that',
      'thanks',
    ],
  },
  {
    name: 'sceptic',
    note: 'Someone testing whether the receipts mean anything.',
    turns: [
      '2+2',
      'are you sure?',
      'did you use a calculator or just know it',
      'can I verify that',
      'what if I do not trust you',
    ],
  },
  {
    name: 'out-of-scope',
    note: 'Repeated declining. Does it decline the same way four times?',
    turns: [
      'tell me a joke',
      'ok what about a poem',
      'can you summarise an article for me',
      'fine, whats 12*12',
      'and tell me a joke now',
    ],
  },
];

let cookie = '';
async function api(path: string, options: RequestInit = {}): Promise<any> {
  const r = await fetch(`${MESSAGING}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {}),
    },
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

interface Turn {
  prompt: string;
  replies: Array<{ by: string; arena: string; text: string }>;
}

async function runConversation(
  conv: (typeof CONVERSATIONS)[number],
  meId: string
): Promise<Turn[]> {
  const c = await api('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({
      type: 'group',
      name: `cadence-${conv.name}-${Date.now()}`,
      ...(ORG_ID ? { orgId: ORG_ID } : {}),
      participants: [{ userId: COORDINATOR, userType: 'agent' }],
    }),
  });

  const seen = new Set<string>();
  const turns: Turn[] = [];

  for (const prompt of conv.turns) {
    const sent = await api(`/api/conversations/${c.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: prompt, contentType: 'text' }),
    });
    seen.add(sent.id);

    const deadline = Date.now() + TIMEOUT;
    let found = false;
    while (Date.now() < deadline && !found) {
      const all = (await api(`/api/conversations/${c.id}/messages`)) as any[];
      found = all.some((m) => !seen.has(m.id) && (m.sender_id ?? m.senderId) !== meId);
      if (!found) await new Promise((r) => setTimeout(r, 1000));
    }
    // Settle, so a second assistant answering the same turn is counted.
    await new Promise((r) => setTimeout(r, 2000));

    const all = (await api(`/api/conversations/${c.id}/messages`)) as any[];
    const replies = all
      .filter((m) => !seen.has(m.id) && (m.sender_id ?? m.senderId) !== meId)
      .map((m) => ({
        by: m.metadata?.assistantKey ?? '?',
        arena: m.metadata?.symbia?.provenance?.arena ?? 'NONE',
        text: String(m.content ?? ''),
      }));
    for (const m of all) seen.add(m.id);
    turns.push({ prompt, replies });
  }
  return turns;
}

/** Does the reply do anything other than deliver a value or decline? */
const ASKS_BACK = /\?\s*$/m;
const ACKNOWLEDGES = /^(?:sure|ok|okay|got it|right|yes|no problem|happy to|of course)\b/i;

function report(name: string, note: string, turns: Turn[]) {
  console.log(`\n${'='.repeat(72)}\n${name} — ${note}\n${'='.repeat(72)}`);

  const texts: string[] = [];
  let refused = 0;
  let silent = 0;
  let multi = 0;

  for (const t of turns) {
    console.log(`\n  you: ${t.prompt}`);
    if (t.replies.length === 0) {
      silent++;
      console.log('  ›   (no reply)');
    }
    if (t.replies.length > 1) multi++;
    for (const r of t.replies) {
      texts.push(r.text);
      if (r.arena === 'REFUSED') refused++;
      const first = r.text.split('\n')[0].slice(0, 96);
      console.log(`  ›   [${r.by}/${r.arena}] ${first}${r.text.length > 96 ? '…' : ''}`);
    }
  }

  // Verbatim repetition — the most legible robotic tell there is.
  const counts = new Map<string, number>();
  for (const t of texts) counts.set(t, (counts.get(t) ?? 0) + 1);
  const repeats = [...counts.values()].filter((n) => n > 1);
  const repeatedTurns = repeats.reduce((a, b) => a + b, 0) - repeats.length;

  const lengths = texts.map((t) => t.length);
  const mean = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
  const spread = Math.round(Math.sqrt(
    lengths.reduce((a, l) => a + (l - mean) ** 2, 0) / (lengths.length || 1)
  ));

  console.log(`\n  ── cadence`);
  console.log(`     turns                     ${turns.length}`);
  console.log(`     refused                   ${refused}/${texts.length}`);
  console.log(`     silent turns              ${silent}`);
  console.log(`     turns with >1 answer      ${multi}`);
  console.log(`     verbatim repeats          ${repeatedTurns}`);
  console.log(`     ever asks a question back ${texts.some((t) => ASKS_BACK.test(t)) ? 'yes' : 'NO'}`);
  console.log(`     ever acknowledges first   ${texts.some((t) => ACKNOWLEDGES.test(t)) ? 'yes' : 'NO'}`);
  console.log(`     reply length mean/spread  ${Math.round(mean)} / ${spread}`);

  return { refused, total: texts.length, silent, multi, repeatedTurns };
}

async function main() {
  if (!PASSWORD) {
    console.error('SYMBIA_PASSWORD is not set.');
    process.exit(2);
  }
  await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const me = await api('/api/auth/me');
  const meId = me.user?.id ?? me.id;

  const totals = { refused: 0, total: 0, silent: 0, multi: 0, repeatedTurns: 0 };
  for (const conv of CONVERSATIONS) {
    const turns = await runConversation(conv, meId);
    const r = report(conv.name, conv.note, turns);
    totals.refused += r.refused;
    totals.total += r.total;
    totals.silent += r.silent;
    totals.multi += r.multi;
    totals.repeatedTurns += r.repeatedTurns;
  }

  console.log(`\n${'='.repeat(72)}\nACROSS ALL CONVERSATIONS\n${'='.repeat(72)}`);
  console.log(`  refused              ${totals.refused}/${totals.total}`);
  console.log(`  silent turns         ${totals.silent}`);
  console.log(`  turns with >1 answer ${totals.multi}`);
  console.log(`  verbatim repeats     ${totals.repeatedTurns}`);
  console.log(
    `\nThese are not pass/fail. A high refusal count with correct receipts is a\n` +
      `system that is right and unpleasant, which is the failure mode this probe\n` +
      `exists to make visible.`
  );
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
