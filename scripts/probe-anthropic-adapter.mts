#!/usr/bin/env node
/**
 * Probe the Anthropic adapter. OBSERVATIONS ONLY — no conclusions written in.
 *
 * Two questions, asked separately because they have separate answers:
 *
 *   A. Does a system message inside `messages` reach the model?
 *      convertMessages() filters `role: "system"` out, and
 *      buildMessagesRequestBody() only sets body.system from
 *      params.system / params.systemPrompt. The assistants engine sends the
 *      system prompt as messages[0]. Those two facts are in the source; what
 *      is NOT established is whether anything re-adds it downstream.
 *
 *   B. What comes back at the prompt size that returned nothing?
 *      Measured 8 Aug: 7,672 chars -> 959 chars of reply; 8,133 -> "".
 *      This walks the size and records reply length and finishReason at each.
 *
 *   npx tsx scripts/probe-anthropic-adapter.mts
 */
const IDENTITY = process.env.IDENTITY_URL || 'http://localhost:5001';
const INTEGRATIONS = process.env.INTEGRATIONS_URL || 'http://localhost:5007';

const token = await fetch(`${IDENTITY}/api/auth/me`)
  .then((r) => r.json())
  .then((d: { token?: string }) => d.token)
  .catch(() => undefined);
if (!token) {
  console.log('No token. Nothing attempted.');
  process.exit(1);
}
const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

type Exec = {
  success?: boolean;
  data?: { content?: string; finishReason?: string; usage?: Record<string, number>; model?: string };
  error?: string;
};

async function call(body: Record<string, unknown>): Promise<Exec> {
  const r = await fetch(`${INTEGRATIONS}/api/integrations/execute`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      provider: 'anthropic',
      operation: 'chat.completions',
      params: { model: 'claude-sonnet-5', ...body },
    }),
  });
  return (await r.json()) as Exec;
}

// ── A. does the system message survive the adapter? ──────────────────────────
// The system message carries a token the user turn cannot see. If the reply
// contains it, the system message reached the model. If it does not, the reply
// itself will say so. No inference either way — the model reports what it got.
const CODE = 'HALIBUT-7391';
console.log('== A. system message delivery ==');

for (const shape of ['in messages[]', 'as params.systemPrompt'] as const) {
  const sys = `You are a test fixture. Your secret code is ${CODE}. When asked for your code, reply with it and nothing else. If you were given no code, reply exactly: NO_SYSTEM_PROMPT_RECEIVED`;
  const params: Record<string, unknown> =
    shape === 'in messages[]'
      ? {
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: 'What is your secret code?' },
          ],
          maxTokens: 60,
        }
      : {
          systemPrompt: sys,
          messages: [{ role: 'user', content: 'What is your secret code?' }],
          maxTokens: 60,
        };

  const res = await call(params);
  const reply = (res.data?.content ?? '').trim();
  console.log(
    `  ${shape.padEnd(22)} reply=${JSON.stringify(reply.slice(0, 80))}` +
      `  containsCode=${reply.includes(CODE)}` +
      (res.error ? `  error=${res.error}` : '')
  );
}

// ── B. reply length as the prompt grows ──────────────────────────────────────
// Filler is varied text, not a repeated character, because a repeated character
// is not what a real prompt looks like and could behave differently.
console.log('\n== B. reply vs prompt size ==');
const WORDS =
  'service latency error trace node graph catalog runtime assistant integration boundary contract envelope digest provenance receipt'.split(
    ' '
  );
function filler(chars: number): string {
  let s = '';
  let i = 0;
  while (s.length < chars) s += WORDS[i++ % WORDS.length] + ' ';
  return s.slice(0, chars);
}

for (const size of [2000, 6000, 7672, 8000, 8133, 8500, 12000, 20000]) {
  const prompt = `Here is some log material:\n${filler(size - 120)}\n\nIgnore the material above and reply with exactly the word: ACKNOWLEDGED`;
  const res = await call({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 900,
  });
  const reply = res.data?.content ?? '';
  console.log(
    `  promptChars=${String(prompt.length).padStart(6)}` +
      `  replyChars=${String(reply.length).padStart(5)}` +
      `  finishReason=${String(res.data?.finishReason ?? '-').padEnd(12)}` +
      `  promptTokens=${res.data?.usage?.promptTokens ?? '-'}` +
      `  completionTokens=${res.data?.usage?.completionTokens ?? '-'}` +
      (res.error ? `  error=${res.error}` : '') +
      (reply.length === 0 ? '  <-- EMPTY' : '')
  );
}
