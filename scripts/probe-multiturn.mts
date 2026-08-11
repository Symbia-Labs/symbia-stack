#!/usr/bin/env npx tsx
/**
 * S3 — multi-turn, in ONE conversation.
 *
 * NOTHING IN THIS PATH HAS EVER BEEN TESTED. Every measurement on this stack
 * so far has been a single message into a fresh conversation, which leaves
 * three things taken entirely on faith:
 *
 * 1. **The lineage chain has never advanced.** `sealDelegation` keeps a chain
 *    head per conversation and calls `advance()`, but at n=1 every delegation
 *    links to GENESIS and the ordering property — the entire reason Lineage is
 *    append-only — is unexercised. Turn 2 is the first real test of it.
 * 2. **Follow-up routing is undefined.** STATUS §6.5: assistant.route's join
 *    returns 401, so a specialist answers a conversation it is not a
 *    participant in, and "consequences for a follow-up message are not
 *    established."
 * 3. **The one-hop guard may fire wrongly.** A message carrying `routedFrom`
 *    is refused a second hop. That guard exists to stop two assistants
 *    ping-ponging; whether a user's own follow-up trips it is unknown.
 *
 * Neither specialist has any memory, so turn 2 may be nonsense even when the
 * routing is right. That is a finding, not a bug in this probe.
 *
 * Usage:
 *   SYMBIA_PASSWORD=... SYMBIA_ORG_ID=... npx tsx scripts/probe-multiturn.mts
 */

const MESSAGING = process.env.MESSAGING_URL || 'http://localhost:5005';
const EMAIL = process.env.SYMBIA_EMAIL || 'dev@example.com';
const PASSWORD = process.env.SYMBIA_PASSWORD;
const ORG_ID = process.env.SYMBIA_ORG_ID || '';
const COORDINATOR = 'assistant:coordinator';

const TURNS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PROMPTS = TURNS.length
  ? TURNS
  : ['2+2', 'now multiply that by 10', "and what's 15% of the result?"];

let cookie = '';

function reportReply(reply: any, checksums: string[]) {
  const env = reply.metadata?.symbia?.provenance;
  const d = env?.delegation;
  const ev = d?.event;

  console.log(`   ── by ${reply.metadata?.assistantKey ?? '?'}`);
  // No envelope at all is worse than a wrong arena: it is a reply this
  // platform cannot say anything about, which is the one thing it exists to
  // prevent. Called out rather than printed as a dash.
  console.log(`      arena:   ${env?.arena ?? 'NONE — this reply carries no receipt'}`);
  console.log(`      reply:   ${JSON.stringify(String(reply.content || '').slice(0, 110))}`);
  if (d) {
    console.log(`      route:   ${d.from} -> ${d.to}  method=${d.method ?? '?'}`);
    console.log(
      `      lineage: checksum=${String(ev?.checksum ?? '?').slice(0, 24)}… parent=${JSON.stringify(ev?.parent_links)}`
    );
    if (ev?.checksum) checksums.push(ev.checksum);
  } else {
    console.log('      route:   NO DELEGATION — answered without a routing decision');
  }
}

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
  const text = await r.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!r.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${r.status} ${text.slice(0, 200)}`);
  return body;
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
  // `/api/auth/me` returns { user, organizations } — NOT a bare user. And the
  // message field is `sender_id`, not `senderId`. The first version of this
  // probe compared `m.senderId !== me.id`, which is `undefined !== undefined`,
  // so it matched nothing and reported "NO REPLY" for a turn that had worked.
  // Sixth instrument failure in this session, and the same shape as the others:
  // it pointed at working code and said broken.
  const meRes = await api('/api/auth/me');
  const me = { id: meRes.user?.id ?? meRes.id };
  if (!me.id) throw new Error('could not determine the logged-in user id');

  // ONE conversation for every turn. That is the whole point.
  const conv = await api('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({
      type: 'group',
      name: `multiturn-${Date.now()}`,
      ...(ORG_ID ? { orgId: ORG_ID } : {}),
      participants: [{ userId: COORDINATOR, userType: 'agent' }],
    }),
  });

  console.log(`Conversation ${conv.id}\n`);

  const seen = new Set<string>();
  const checksums: string[] = [];

  for (const [i, prompt] of PROMPTS.entries()) {
    const sent = await api(`/api/conversations/${conv.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: prompt, contentType: 'text' }),
    });
    seen.add(sent.id);

    // Wait for a reply that is new to THIS turn — the conversation already
    // holds every earlier message, so "any message not from me" is not enough.
    let reply: any = null;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      const msgs = await api(`/api/conversations/${conv.id}/messages`);
      const list = Array.isArray(msgs) ? msgs : msgs.messages || [];
      reply = list.find((m: any) => !seen.has(m.id) && (m.sender_id ?? m.senderId) !== me.id);
      if (reply) break;
      await new Promise((r) => setTimeout(r, 1200));
    }

    console.log(`── turn ${i + 1}: ${JSON.stringify(prompt)}`);
    if (!reply) {
      console.log('   NO REPLY within 45s\n');
      continue;
    }

    // COUNT EVERY REPLY, not just the first.
    //
    // One message is supposed to produce one answer. Taking `find()` and
    // moving on would hide the defect this probe exists to catch — after a
    // delegation, several assistants answer the same message at once.
    await new Promise((r) => setTimeout(r, 2500));
    const after = (await api(`/api/conversations/${conv.id}/messages`)) as any[];
    const replies = after.filter((m: any) => !seen.has(m.id) && (m.sender_id ?? m.senderId) !== me.id);
    for (const m of after) seen.add(m.id);

    if (replies.length > 1) {
      console.log(`   ⚠️  ${replies.length} ASSISTANTS ANSWERED ONE MESSAGE`);
    }
    for (const r of replies) reportReply(r, checksums);
    console.log();
    continue;

  }

  // ---- The claim this probe exists to test -------------------------------
  console.log('='.repeat(70));
  console.log('CHAIN');
  console.log('='.repeat(70));
  if (checksums.length < 2) {
    console.log(
      `Only ${checksums.length} delegation(s) occurred, so the chain still has not advanced.\n` +
        'The ordering property remains UNTESTED — that is the result, not a pass.'
    );
  } else {
    const distinct = new Set(checksums).size === checksums.length;
    console.log(`${checksums.length} delegations, ${distinct ? 'all distinct' : 'DUPLICATE CHECKSUMS'}`);
    checksums.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    console.log(
      distinct
        ? '\nDistinct checksums mean advance() ran with a real previous head.\n' +
            'Ordering is now exercised rather than assumed.'
        : '\nIdentical checksums mean the head was NOT carried between turns —\n' +
            'each delegation started from GENESIS and the chain is decorative.'
    );
  }
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
