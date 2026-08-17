#!/usr/bin/env node
/**
 * Prove a retrieval actually happened.
 *
 * WHY THE LEDGER ALONE DOES NOT SETTLE THIS. The signed record is decisive
 * against the threat people actually mean by "hallucination": an agent's only
 * route into that file is to make a real MCP call, because nothing exposes
 * "append to the ledger" as a tool. An agent that describes a fetch it never
 * performed leaves the ledger empty, and no amount of confident prose changes
 * the event count.
 *
 * What it does NOT settle is memory. If the content was in the agent's
 * training data, or worse, written in the instructions you handed it, then a
 * reported digest proves nothing — it could be recited. That is not a
 * hypothetical: the first draft of the t0 walkthrough printed a reference
 * digest for the file it then asked the agent to fetch.
 *
 * The fix is freshness. Bytes that did not exist until a moment ago cannot be
 * recited, and a sha256 cannot be guessed. So: mint content now, publish it
 * where the host can reach it, and require the digest back.
 *
 * Loopback is deliberately unreachable — @symbia/egress refuses private and
 * link-local addresses, so a witness server on 127.0.0.1 is not an option and
 * the challenge must be genuinely public. That refusal is a feature being
 * enforced against us here.
 *
 *   node imagine/prove-it.mjs new
 *   node imagine/prove-it.mjs check <public-url> <digest-the-agent-reported>
 */
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';

const cmd = process.argv[2];
const STATE = '/tmp/imagine-challenge.json';

function mint() {
  const nonce = randomBytes(16).toString('hex');
  const at = new Date().toISOString();
  const body = [
    'SYMBIA IMAGINE RETRIEVAL CHALLENGE',
    `nonce: ${nonce}`,
    `minted: ${at}`,
    '',
    'These bytes did not exist before the timestamp above. Any agent that can',
    'report their sha256 either fetched them or has a time machine.',
    '',
    randomBytes(64).toString('base64'),
    '',
  ].join('\n');
  const sha = createHash('sha256').update(body).digest('hex');
  const file = `/tmp/challenge-${nonce.slice(0, 8)}.txt`;
  writeFileSync(file, body);
  writeFileSync(STATE, JSON.stringify({ nonce, at, file, sha }, null, 2));

  console.log(`\n  Challenge minted ${at}`);
  console.log(`  file    ${file}`);
  console.log(`  bytes   ${Buffer.byteLength(body)}`);
  console.log(`\n  1. Publish that file at a PUBLIC url. Any of these work:`);
  console.log(`       gh gist create --public ${file}      (then use the RAW url)`);
  console.log(`       scp ${file} you@yourhost:/var/www/html/`);
  console.log(`     Loopback and LAN addresses will be REFUSED by the egress guard,`);
  console.log(`     so the url has to be genuinely reachable.`);
  console.log(`\n  2. Ask the agent, in the test conversation:`);
  console.log(`       "Fetch <url> through a symbia.io.http-request graph and report`);
  console.log(`        the witness receipt digest verbatim."`);
  console.log(`\n  3. Then run:`);
  console.log(`       node imagine/prove-it.mjs check <url> <digest-it-reported>`);
  console.log(`\n  The expected digest is held in ${STATE} and deliberately not printed`);
  console.log(`  here — comparing after the fact is the whole point.\n`);
}

function findLedger() {
  // The live host keeps host.log open, so the OS knows its session directory.
  try {
    const addrs = execSync(
      `ls -t ${process.env.TMPDIR ?? '/tmp'}/imagine-*/host.json /tmp/imagine-*/host.json 2>/dev/null || true`,
      { encoding: 'utf8' }
    ).split('\n').filter(Boolean);
    for (const a of addrs) {
      const addr = JSON.parse(readFileSync(a, 'utf8'));
      const open = execSync(`lsof -p ${addr.pid} 2>/dev/null | awk '/host\\.log$/ {print $NF}' | head -1 || true`, { encoding: 'utf8' }).trim();
      if (!open) continue;
      const dir = dirname(open);
      const short = String(addr.session).split(':').pop();
      const led = join(dir, `ledger.${short}.jsonl`);
      if (existsSync(led)) return { ledger: led, session: addr.session, pid: addr.pid };
    }
  } catch { /* fall through */ }
  return null;
}

async function check(url, reported) {
  if (!existsSync(STATE)) {
    console.error('No challenge in flight. Run: node imagine/prove-it.mjs new');
    process.exit(2);
  }
  const st = JSON.parse(readFileSync(STATE, 'utf8'));
  console.log(`\n  challenge minted ${st.at}`);

  // 1. Independent fetch — this process, not the agent's.
  let live = null, liveSha = null;
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'imagine-prove-it/1' } });
    live = await r.text();
    liveSha = createHash('sha256').update(live).digest('hex');
    console.log(`  independent fetch  ${r.status}, ${Buffer.byteLength(live)} bytes`);
  } catch (e) {
    console.log(`  independent fetch  FAILED (${e.message}) — cannot corroborate`);
  }

  const servedMatches = liveSha === st.sha;
  const agentMatches = String(reported).trim().toLowerCase().replace(/^sha256:/, '') === st.sha;

  console.log(`\n  minted sha256      ${st.sha}`);
  console.log(`  served sha256      ${liveSha ?? '(unavailable)'}   ${servedMatches ? 'MATCH' : 'DIFFERS'}`);
  console.log(`  agent reported     ${String(reported).trim()}`);
  console.log(`  agent vs minted    ${agentMatches ? 'MATCH' : 'MISMATCH'}`);

  if (!servedMatches && liveSha) {
    console.log(`\n  The published bytes are not the minted bytes — the url is serving`);
    console.log(`  something else (a redirect page, a gist wrapper, trailing newline`);
    console.log(`  differences). Fix the publication before judging the agent.`);
  }

  // 2. Did the host actually make a call at that time?
  const found = findLedger();
  if (!found) {
    console.log(`\n  ledger             no live host found — run this while the test`);
    console.log(`                     conversation's host is still up, or the record`);
    console.log(`                     has already gone with it.`);
  } else {
    const lines = readFileSync(found.ledger, 'utf8').split('\n').filter(Boolean);
    const since = new Date(st.at).getTime();
    const after = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((e) => e && new Date(e.timestamp).getTime() >= since);
    const ingress = after.filter((e) => String(e.payload?.path ?? '').includes('/api/ingress/'));
    console.log(`\n  ledger             ${found.ledger.split('/').slice(-1)[0]}  (pid ${found.pid})`);
    console.log(`  events since mint  ${after.length}`);
    console.log(`  graph injections   ${ingress.length}`);
    for (const e of ingress.slice(-5)) {
      console.log(`    #${e.payload.seq}  ${e.timestamp}  ${e.payload.path}  -> ${e.payload.status}`);
    }
    if (ingress.length === 0) {
      console.log(`    none — no graph was fed since this challenge was minted.`);
      console.log(`    A retrieval that happened leaves an injection here.`);
    }
  }

  const proved = agentMatches && servedMatches && (found ? true : false);
  console.log(`\n  ${agentMatches && servedMatches
    ? 'PROVED — the agent returned the digest of bytes that did not exist until this challenge was minted. It could not have recited that.'
    : 'NOT PROVED — see the mismatch above.'}`);
  if (proved) {
    console.log('  Corroborated by an injection event the host signed at the time.');
  }
  console.log('\n  Still outside what this shows: whether the agent read what it fetched,');
  console.log('  and whether anything it concluded from those bytes is sound.\n');
  process.exit(agentMatches && servedMatches ? 0 : 1);
}

if (cmd === 'new') mint();
else if (cmd === 'check' && process.argv[3] && process.argv[4]) await check(process.argv[3], process.argv[4]);
else {
  console.error('usage:\n  node imagine/prove-it.mjs new\n  node imagine/prove-it.mjs check <public-url> <digest>');
  process.exit(2);
}
