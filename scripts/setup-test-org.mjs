#!/usr/bin/env node
/**
 * Create a test org and give it an org-wide LLM credential, so assistants can
 * resolve a provider.
 *
 * WHY THIS EXISTS. An assistant is a separate principal. The Anthropic key on
 * this stack is PERSONAL — `org_id NULL, is_org_wide false`, owned by
 * dev@example.com — so `getCredentialForUserOrOrg` cannot reach it for
 * `assistant:coordinator`, and it should not: borrowing a human's personal
 * credential is not something the platform should quietly do.
 *
 * There is a supported path and nothing was using it. `identity` already
 * falls back to an org-wide credential when the per-principal lookup misses
 * (identity/server/src/storage.ts:774). It needs `org_id` set AND
 * `is_org_wide: true`. This script produces exactly that, through
 * `POST /api/credentials` with an `X-Org-Id` header — the platform's own
 * endpoint, audit-logged like any other credential write. No SQL writes.
 *
 * DEV ONLY. It reads the existing personal credential out of the identity
 * database to avoid asking anyone to paste a key, decrypts it in memory with
 * the same construction identity uses, and never prints it. Set
 * ANTHROPIC_API_KEY to skip that path entirely.
 *
 * Usage:
 *   node scripts/setup-test-org.mjs
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/setup-test-org.mjs
 */

import { execSync } from 'node:child_process';
import { decryptSecret } from '@symbia/crypto';

const IDENTITY = process.env.IDENTITY_URL || 'http://localhost:5001';
const EMAIL = process.env.SYMBIA_EMAIL || 'dev@example.com';
const PASSWORD = process.env.SYMBIA_PASSWORD || 'password123';
const PROVIDER = process.env.PROVIDER || 'anthropic';
const ORG_NAME = 'Symbia Test';
const ORG_SLUG = 'symbia-test';

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/**
 * Decrypt the stored personal credential.
 *
 * Same construction as identity/server/src/routes.ts:3298 — aes-256-gcm over
 * `iv:authTag:ciphertext`, key padded/truncated to 32 bytes. If that changes,
 * this breaks loudly rather than silently producing garbage, because GCM
 * authentication fails on a wrong key.
 */
function readExistingKey() {
  const pg = sh(`docker ps -qf name=postgres | head -1`);
  if (!pg) throw new Error('postgres container not found');

  const row = sh(
    `docker exec ${pg} psql -U symbia -d identity -tAc ` +
      `"select credential_encrypted from user_credentials where provider='${PROVIDER}' and is_org_wide=false limit 1"`
  );
  if (!row) throw new Error(`no personal ${PROVIDER} credential found to copy`);

  // A2: @symbia/crypto handles both the v2 (HKDF) and legacy formats and
  // owns the key-resolution rules (no inline fallback keys here).
  return decryptSecret(row);
}

async function main() {
  // ---- 1. Log in -----------------------------------------------------------
  const loginRes = await fetch(`${IDENTITY}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) throw new Error(`login -> ${loginRes.status} ${await loginRes.text()}`);
  const login = await loginRes.json();
  const token = login.token || login.accessToken;
  if (!token) throw new Error('login returned no token');
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log(`Logged in as ${EMAIL}`);

  // ---- 2. Test org, idempotently ------------------------------------------
  let org;
  const created = await fetch(`${IDENTITY}/api/orgs`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: ORG_NAME, slug: ORG_SLUG }),
  });

  if (created.ok) {
    org = await created.json();
    console.log(`Created org  ${org.name}  ${org.id}`);
  } else {
    // The slug is taken, which on a re-run means by us. Find it rather than
    // failing — this script has to be safe to run twice.
    const list = await fetch(`${IDENTITY}/api/orgs`, { headers: auth });
    const orgs = await list.json();
    org = (Array.isArray(orgs) ? orgs : orgs.organizations || []).find((o) => o.slug === ORG_SLUG);
    if (!org) throw new Error(`could not create or find org '${ORG_SLUG}': ${await created.text()}`);
    console.log(`Reusing org  ${org.name}  ${org.id}`);
  }

  // ---- 3. Org-wide credential ---------------------------------------------
  const apiKey = process.env.ANTHROPIC_API_KEY || readExistingKey();
  console.log(
    `Credential source: ${process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY' : 'copied from the existing personal credential'}` +
      `  (prefix ${apiKey.slice(0, 8)}…, ${apiKey.length} chars)`
  );

  const credRes = await fetch(`${IDENTITY}/api/credentials`, {
    method: 'POST',
    headers: { ...auth, 'X-Org-Id': org.id },
    body: JSON.stringify({
      provider: PROVIDER,
      name: `${ORG_NAME} ${PROVIDER} (org-wide)`,
      apiKey,
      isOrgWide: true,
      metadata: { createdBy: 'scripts/setup-test-org.mjs', purpose: 'assistants' },
    }),
  });
  if (!credRes.ok) throw new Error(`create credential -> ${credRes.status} ${await credRes.text()}`);
  const cred = await credRes.json();
  console.log(`Created credential  ${cred.id}  provider=${cred.provider}  isOrgWide=${cred.isOrgWide}`);

  // ---- 4. Verify the fallback actually reaches it --------------------------
  //
  // Not "we wrote it, therefore it works". Ask identity the same question the
  // assistant asks, as the assistant, and see whether the org-wide fallback
  // fires.
  const agentCred = process.env.AGENT_CREDENTIAL || 'symbia-agent-dev-secret-32chars-min!!';
  const agentRes = await fetch(`${IDENTITY}/api/auth/agent/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: 'assistant:coordinator', credential: agentCred }),
  });
  const agent = await agentRes.json().catch(() => ({}));
  const agentToken = agent.token || agent.accessToken;

  if (!agentToken) {
    console.log('\nCould not get an agent token to verify — check by hand.');
  } else {
    const look = await fetch(
      `${IDENTITY}/api/internal/credentials/assistant:coordinator/${PROVIDER}`,
      {
        headers: {
          Authorization: `Bearer ${agentToken}`,
          'X-Service-Id': 'integrations',
          'X-Org-Id': org.id,
        },
      }
    );
    const body = await look.json().catch(() => ({}));
    console.log(
      `\nAs assistant:coordinator, org=${org.id}:  ${look.status} ` +
        (look.ok
          ? `resolved (isProxy=${body.isProxy}, isOrgWide=${body.isOrgWide})`
          : `${body.message || 'not found'}`)
    );
    if (!look.ok) process.exitCode = 1;
  }

  console.log(`\nORG_ID=${org.id}`);
  console.log('Pass this to the walk:  SYMBIA_ORG_ID=<id> node scripts/verify-assistants.mjs');
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
