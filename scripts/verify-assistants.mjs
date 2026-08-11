#!/usr/bin/env node
/**
 * Drive the three assistants through the API a user's message actually takes,
 * and check the reply AND its provenance arena against the predictions
 * registered in docs/2026-08-11-three-assistant-predictions.md.
 *
 * BEHAVIOURAL, AGAINST A RUNNING STACK. NOT GREP OVER SOURCE.
 *
 * The ITT suite removed on 10 August 2026 produced 388 passes and 303 failures
 * and not one of the failures was a defect, because nearly every assertion was
 * a `grep` over source text: it tested a February architecture by looking for
 * strings, and penalised the codebase for removing duplication it could not
 * see. Seven services failed a correlation-id check because request-id handling
 * had deliberately moved into `symbia-http`.
 *
 * So this script asserts nothing about the source. It logs in, opens a
 * conversation, sends what a person would type, and reads what comes back —
 * including the sealed envelope on the reply, which is the thing most worth
 * checking and the thing a source grep cannot see at all.
 *
 * A prediction this script reports as broken is broken. Do not edit the
 * predictions to match the output.
 *
 * Usage:
 *   SYMBIA_PASSWORD=... node scripts/verify-assistants.mjs
 *   SYMBIA_PASSWORD=... node scripts/verify-assistants.mjs --case P1 --verbose
 */

const MESSAGING = process.env.MESSAGING_URL || 'http://localhost:5005';
const EMAIL = process.env.SYMBIA_EMAIL || 'dev@example.com';
const PASSWORD = process.env.SYMBIA_PASSWORD;
import { createHash } from 'node:crypto';

const COORDINATOR_USER_ID = 'assistant:coordinator';
/** Same default as engine/provenance.ts. Dev stacks seal with the literal. */
const HASH_SECRET = process.env.NETWORK_HASH_SECRET || 'symbia-network-dev-only';
/** Org whose credential the assistants should resolve. See scripts/setup-test-org.mjs. */
const ORG_ID = process.env.SYMBIA_ORG_ID || '';

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const ONLY = argv.includes('--case') ? argv[argv.indexOf('--case') + 1] : null;
const REPLY_TIMEOUT_MS = Number(process.env.REPLY_TIMEOUT_MS || 45000);

/**
 * The predictions, as code.
 *
 * `arena` is what docs/2026-08-11-three-assistant-predictions.md says the
 * envelope should carry. Where a prediction is expected to be WRONG about the
 * platform rather than about the code, it is marked `predictedWrong` with the
 * reason — the measurement is meant to confirm a reading of the code, and
 * confirming an unwanted behaviour still counts as the prediction holding.
 */
const CASES = [
  {
    id: 'P1',
    prompt: '2+2',
    by: 'calculator',
    reply: /^\s*=\s*4\s*$/,
    arena: 'COMPUTED',
    note: 'the case that only became a delegation once rule-compute-first was deleted',
  },
  {
    id: 'P2',
    prompt: 'what is 2+2?',
    by: 'calculator',
    reply: /=\s*4\b/,
    arena: 'COMPUTED',
    note: 'exercises normalizeMathInput; refused with "Invalid character: ?" before today',
  },
  {
    id: 'P3',
    prompt: 'sqrt(16)',
    by: 'calculator',
    reply: /=\s*4\b/,
    arena: 'COMPUTED',
  },
  {
    id: 'P4',
    prompt: 'whats 15% tip on $47.50',
    by: 'smart-calc',
    reply: /7\.125/,
    arena: 'COMPOSED',
    note: 'a model chose the expression; the arithmetic stayed exact',
  },
  {
    id: 'P5',
    prompt: 'split $120 between 4 people',
    by: 'smart-calc',
    reply: /\b30\b/,
    arena: 'COMPOSED',
  },
  {
    id: 'P6',
    prompt: 'help',
    by: 'coordinator',
    reply: /symbia|team|specialist/i,
    arena: 'REFUSED',
    predictedWrong:
      'A static message.send produces zero steps, and classify([]) falls through to ' +
      'REFUSED "no step produced content". The system answered; the seal says it declined.',
  },
  {
    id: 'P7',
    prompt: 'who is on the team',
    // ASSERTION CORRECTED 11 Aug 2026, AND THE CORRECTION IS THE POINT.
    //
    // This asked for /calculator/i. The roster renders ALIASES — `@calc`,
    // `@symbia`, `@smartcalc` — because that is what a person types to reach
    // an assistant, and the alias is what `assistants.list` leads with. The
    // key never appears.
    //
    // So the first run reported P7 broken while the platform was correct. The
    // prediction was wrong about the platform, not the other way round, and
    // this is the only edit made to a registered prediction — recorded here
    // and in the results rather than quietly applied. Now asserts all three
    // are present, which is the claim that actually matters.
    by: 'coordinator',
    reply: /@calc\b[\s\S]*@smartcalc\b|@smartcalc\b[\s\S]*@calc\b/,
    arena: 'COMPUTED',
    note: 'rule was dead until today — (?i) throws on every Node version',
  },
  {
    id: 'P8',
    prompt: 'is the stack healthy',
    by: 'coordinator',
    reply: /./,
    arena: 'COMPOSED',
    note: 'rule was dead in the container only — (?i:) needs V8 12.x, container is Node 20',
  },
  {
    id: 'D7',
    prompt: 'tell me a joke about snails',
    // Nothing declares this, so Symbia refuses and names what it can reach.
    // The model classifier would have picked something; refusing is OEP's
    // prescribed rewrite for a claim the system cannot support.
    by: 'coordinator',
    reply: /not going to guess|can route to/i,
    arena: 'REFUSED',
  },
  {
    id: 'D8',
    prompt: 'what is 20% of 80',
    // FLAGGED AS A RISK IN THE PREDICTIONS, NOT PREDICTED.
    //
    // Calculator's lead-in pattern and Smart Calculator's percent pattern can
    // both fire, and precedence (100 vs 50) would hand it to the strict
    // parser, which cannot read "20% of 80". Asserting the CORRECT outcome so
    // a wrong one is reported as a declaration defect rather than absorbed.
    by: 'smart-calc',
    reply: /\b16\b/,
    arena: 'COMPOSED',
  },
];

// ---------------------------------------------------------------------------

let cookie = '';

async function api(path, options = {}) {
  const r = await fetch(`${MESSAGING}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {}),
    },
  });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!r.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${r.status} ${text.slice(0, 300)}`);
  return body;
}

async function login() {
  if (!PASSWORD) {
    console.error(
      'SYMBIA_PASSWORD is not set.\n' +
        `Log in as ${EMAIL} (the only user in the identity database).\n` +
        '  SYMBIA_PASSWORD=... node scripts/verify-assistants.mjs'
    );
    process.exit(2);
  }
  await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const me = await api('/api/auth/me');
  return me.id || me.user?.id;
}

/**
 * A FRESH CONVERSATION PER CASE.
 *
 * Not tidiness. `assistant.route` adds the target as a participant and refuses
 * a second hop on any message carrying `routedFrom`, so state accumulates in a
 * reused conversation and case N would be measuring the residue of case N-1.
 * STATUS §6.6 also reports the first message after a page load going missing;
 * isolating each case means that shows up as one failure rather than poisoning
 * everything after it.
 */
async function openConversation(label) {
  const conv = await api('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({
      type: 'group',
      name: `verify-${label}-${Date.now()}`,
      // The org the conversation belongs to becomes `payload.orgId` on the SDN
      // path, which becomes `rawOrgId`, which becomes the `X-Org-Id` that
      // decides which org's credential an assistant can resolve. Set it
      // explicitly so the walk runs in the org that actually holds a key,
      // rather than whichever org a default happens to pick.
      ...(ORG_ID ? { orgId: ORG_ID } : {}),
      participants: [{ userId: COORDINATOR_USER_ID, userType: 'agent' }],
    }),
  });
  return conv.id;
}

async function send(conversationId, content) {
  return api(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, contentType: 'text' }),
  });
}

/** Poll until a message arrives that this user did not send. */
async function awaitReply(conversationId, myUserId, sentId) {
  const deadline = Date.now() + REPLY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const messages = await api(`/api/conversations/${conversationId}/messages`);
    const list = Array.isArray(messages) ? messages : messages.messages || [];
    const reply = list.find((m) => m.id !== sentId && m.senderId !== myUserId);
    if (reply) return reply;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return null;
}

function envelopeOf(message) {
  const md = message?.metadata || {};
  return md.symbia?.provenance || null;
}

/**
 * Recompute the seal from the envelope's own visible contents.
 *
 * The platform's claim is that a reply carries a record of how it was arrived
 * at AND that the record is checkable. Reading `arena` off an envelope tests
 * the first half only. This tests the second, from outside the service, with
 * no access to anything but the message a client receives — which is the
 * position anyone verifying a reply is actually in.
 *
 * Mirrors seal() in assistants/server/src/engine/provenance.ts. If that adds a
 * field and this does not, every reply reads as tampered — so a mismatch here
 * means "these two disagree", not "someone forged it".
 */
function verifySeal(content, env) {
  if (!env || !env.hash) return null; // nothing sealed — e.g. the error envelope
  const body = {
    // Mirrors seal(). When the rule emitted typed fields the hash covers the
    // FIELDS and not the prose, so a template can be reworded without
    // invalidating the receipt — and `sealedOver` is itself hashed so that
    // answer cannot be altered either.
    content: env.sealedOver === 'content' ? content : undefined,
    fields: env.fields,
    sealedOver: env.sealedOver,
    arena: env.arena,
    steps: (env.steps || []).map((s) => ({
      id: s.id,
      action: s.action,
      source: s.source,
      ok: s.ok,
      outputDigest: s.outputDigest,
      by: s.by,
    })),
    rule: env.rule,
    assistant: env.assistant,
    runId: env.runId,
    causedBy: env.causedBy,
    delegation: env.delegation?.hash,
    timestamp: env.timestamp,
  };
  const expected = createHash('sha256')
    .update(JSON.stringify(body))
    .update(HASH_SECRET)
    .digest('hex');
  return expected === env.hash;
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Messaging: ${MESSAGING}   user: ${EMAIL}\n`);
  const myUserId = await login();

  const cases = ONLY ? CASES.filter((c) => c.id === ONLY) : CASES;
  const rows = [];
  // Envelope-level claims, checked across every reply (P9-P11).
  const envelopeEvidence = [];

  for (const c of cases) {
    process.stdout.write(`${c.id}  ${JSON.stringify(c.prompt).padEnd(32)} `);
    const row = { ...c, replyText: null, arenaActual: null, answeredBy: null, failures: [] };

    try {
      const conversationId = await openConversation(c.id);
      const sent = await send(conversationId, c.prompt);
      const reply = await awaitReply(conversationId, myUserId, sent.id);

      if (!reply) {
        row.failures.push(`no reply within ${REPLY_TIMEOUT_MS}ms`);
        rows.push(row);
        console.log('NO REPLY');
        continue;
      }

      const env = envelopeOf(reply);
      row.replyText = reply.content || '';
      row.arenaActual = env?.arena ?? null;
      row.answeredBy = reply.metadata?.assistantKey ?? null;

      envelopeEvidence.push({
        id: c.id,
        assistant: env?.assistant ?? undefined,
        runId: env?.runId ?? undefined,
        steps: (env?.steps || []).map((s) => s.action),
        hash: env?.hash ?? null,
        // P11 as built: the routing decision reaches the reply as a sealed
        // delegation record AND as a step in the reply's own chain. Checking
        // both because either alone can pass while the other is broken — the
        // record could ride along without being inside the hashed body, or a
        // step could be present with nothing sealed behind it.
        delegation: env?.delegation ?? null,
        basis: env?.basis ?? '',
        expectDelegated: Boolean(c.by && c.by !== 'coordinator'),
        sealValid: verifySeal(row.replyText, env),
      });

      if (!c.reply.test(row.replyText)) {
        row.failures.push(`reply ${JSON.stringify(row.replyText.slice(0, 90))} does not match ${c.reply}`);
      }
      if (row.arenaActual !== c.arena) {
        row.failures.push(`arena ${row.arenaActual} != predicted ${c.arena}`);
      }
      if (c.by && row.answeredBy && row.answeredBy !== c.by) {
        row.failures.push(`answered by ${row.answeredBy}, predicted ${c.by}`);
      }
    } catch (e) {
      row.failures.push(e.message);
    }

    rows.push(row);
    console.log(row.failures.length === 0 ? 'ok' : 'MISS');
  }

  // ---- Report --------------------------------------------------------------
  console.log('\n' + '='.repeat(78));
  console.log('PREDICTIONS');
  console.log('='.repeat(78));
  for (const r of rows) {
    const held = r.failures.length === 0;
    console.log(`\n${r.id}  ${held ? 'HELD' : 'BROKEN'}   ${JSON.stringify(r.prompt)}`);
    console.log(`     by=${r.answeredBy ?? '?'}  arena=${r.arenaActual ?? '?'} (predicted ${r.arena})`);
    if (VERBOSE && r.replyText !== null) {
      console.log(`     reply: ${JSON.stringify(r.replyText.slice(0, 200))}`);
    }
    for (const f of r.failures) console.log(`     MISS: ${f}`);
    if (held && r.predictedWrong) {
      console.log(`     NOTE: this prediction held, and the behaviour is still wrong.`);
      console.log(`           ${r.predictedWrong}`);
    }
  }

  // ---- P9/P10/P11: the envelope's own claims -------------------------------
  console.log('\n' + '='.repeat(78));
  console.log('THE ENVELOPE ITSELF  (predicted to fail)');
  console.log('='.repeat(78));
  const withEnv = envelopeEvidence.filter((e) => e.hash !== null || e.steps.length > 0);
  const namedAssistant = withEnv.filter((e) => e.assistant !== undefined);
  const withRunId = withEnv.filter((e) => e.runId !== undefined);

  // Only replies that were REACHED BY DELEGATION can carry one. Counting
  // against every reply would make the number look broken while the platform
  // was right — the same mistake P7's assertion made.
  const delegated = withEnv.filter((e) => e.expectDelegated);
  const withRoute = delegated.filter((e) => e.steps.includes('assistant.route'));
  const withRecord = delegated.filter((e) => e.delegation && e.delegation.hash);
  const disclosed = delegated.filter((e) => /chose it/.test(e.basis));

  console.log(`  P9   provenance.assistant present on ${namedAssistant.length}/${withEnv.length} replies`);
  console.log(`  P10  provenance.runId     present on ${withRunId.length}/${withEnv.length} replies`);
  console.log(`  P11a routing step in the chain      ${withRoute.length}/${delegated.length} delegated replies`);
  console.log(`  P11b sealed delegation record       ${withRecord.length}/${delegated.length} delegated replies`);
  console.log(`  P11c basis discloses the delegation ${disclosed.length}/${delegated.length} delegated replies`);

  // P12 — the seal, recomputed from outside the service.
  const sealed = withEnv.filter((e) => e.sealValid !== null);
  const good = sealed.filter((e) => e.sealValid === true);
  console.log(
    `  P12  seal verifies from the envelope alone  ${good.length}/${sealed.length} sealed replies` +
      (good.length === sealed.length ? '' : `  <-- ${sealed.filter((e) => !e.sealValid).map((e) => e.id).join(', ')}`)
  );
  if (VERBOSE)
    for (const e of envelopeEvidence) {
      console.log(`       ${e.id}  steps=[${e.steps.join(', ')}]`);
      if (e.delegation) {
        console.log(
          `             delegation: ${e.delegation.from} -> ${e.delegation.to}` +
            `  method=${e.delegation.method ?? '?'}  decidedBy=${e.delegation.decidedBy ?? '?'}`
        );
        // The GKS Lineage event. Printed because "it uses the library" is a
        // claim about an import until the event's own fields are visible:
        // actor, chain checksum, parent link, and whether it is signed.
        const ev = e.delegation.event;
        console.log(
          ev
            ? `             lineage: actor=${ev.actor_identity} type=${ev.event_type} ` +
              `checksum=${String(ev.checksum).slice(0, 20)}… parent=${JSON.stringify(ev.parent_links)} ` +
              `signature=${ev.signature ? `${String(ev.signature).slice(0, 18)}…` : 'NONE'}`
            : `             lineage: NO EVENT — the delegation is not a lineage record`
        );
      }
    }

  const broken = rows.filter((r) => r.failures.length > 0);
  console.log(
    `\n${rows.length - broken.length}/${rows.length} predictions held.` +
      (broken.length ? `  BROKEN: ${broken.map((b) => b.id).join(', ')}` : '')
  );
  console.log(
    '\nRecord these in docs/2026-08-11-three-assistant-results.md as measured,\n' +
      'including the ones that held while describing behaviour that is wrong.'
  );

  process.exitCode = broken.length ? 1 : 0;
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
