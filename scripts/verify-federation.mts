#!/usr/bin/env node
/**
 * Measure federation predictions F1–F3 against a running stack.
 * Predictions registered first: docs/2026-08-12-federation-predictions.md.
 *
 * F1  bridge registers via POST /api/registry/bridges, zero network change
 * F2  mirrored peer node registers with a prefixed id, no schema change
 * F3  GET /api/offer states installation id + key + accepted classes
 *
 * F4/F5 need two stacks joined by a live edge and are deferred, on record.
 *
 * Usage:
 *   SYMBIA_PASSWORD=... npx tsx scripts/verify-federation.mts
 *
 * The registered bridge and mirrored node are left in place on purpose —
 * they are the visible evidence in the console, and the registry is
 * in-memory, so a restart clears them.
 */

const IDENTITY = process.env.IDENTITY_URL || 'http://localhost:5001';
const NETWORK = process.env.NETWORK_URL || 'http://localhost:5009';
const DIRECTORY = process.env.DIRECTORY_URL || 'http://localhost:5010';
const EMAIL = process.env.SYMBIA_EMAIL || 'dev@example.com';
const PASSWORD = process.env.SYMBIA_PASSWORD;

const PEER_PREFIX = process.env.FED_PEER_PREFIX || 'peerEc2';

type Check = { id: string; held: boolean; observed: string };
const results: Check[] = [];

function record(id: string, held: boolean, observed: string) {
  results.push({ id, held, observed });
  console.log(`${id}  ${held ? 'HELD  ' : 'BROKEN'}  ${observed}`);
}

async function json(url: string, options: RequestInit = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await r.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: r.status, ok: r.ok, body };
}

async function main() {
  if (!PASSWORD) {
    console.error('SYMBIA_PASSWORD is not set. F1/F2 need an authenticated write.');
    process.exit(2);
  }

  // --- F3: the offer ---------------------------------------------------------
  const offer = await json(`${DIRECTORY}/api/offer`);
  if (!offer.ok) {
    record('F3', false, `GET /api/offer -> ${offer.status} (request failure, not an empty offer)`);
  } else {
    const o = offer.body;
    const complete =
      typeof o.installation === 'string' &&
      o.installation.length > 0 &&
      typeof o.fingerprint === 'string' &&
      typeof o.publicKeyPem === 'string' &&
      o.publicKeyPem.includes('BEGIN PUBLIC KEY') &&
      Array.isArray(o.accepts) &&
      o.accepts.length > 0;
    record(
      'F3',
      complete,
      complete
        ? `installation=${o.installation} accepts=[${o.accepts.join(', ')}]`
        : `offer incomplete: ${JSON.stringify(o).slice(0, 200)}`
    );
  }

  // --- Login (bearer for the registry writes) --------------------------------
  const login = await json(`${IDENTITY}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!login.ok || !login.body?.token) {
    console.error(`Login failed: ${login.status} ${JSON.stringify(login.body).slice(0, 200)}`);
    process.exit(2);
  }
  const auth = { Authorization: `Bearer ${login.body.token}` };

  // --- F1: bridge registration ------------------------------------------------
  const bridgeReq = {
    name: 'federation-bridge-spike',
    type: 'custom',
    endpoint: 'pending://ssm-tunnel',
    eventTypes: ['network.topology'],
    config: { role: 'symbia-federation-data-plane', design: 'docs/2026-08-09-network-bridge-bbmd.md' },
  };
  const reg = await json(`${NETWORK}/api/registry/bridges`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(bridgeReq),
  });
  if (reg.status !== 201) {
    record('F1', false, `POST /registry/bridges -> ${reg.status} ${JSON.stringify(reg.body).slice(0, 160)}`);
  } else {
    const list = await json(`${NETWORK}/api/registry/bridges`, { headers: auth });
    const found = (list.body?.bridges || []).some((b: any) => b.id === reg.body.id);
    record(
      'F1',
      found,
      found
        ? `bridge ${reg.body.id} registered and listed, network service unchanged`
        : `201 on create but bridge ${reg.body.id} missing from GET /bridges`
    );
  }

  // --- F2: mirrored peer-node proxy --------------------------------------------
  const nodeId = `${PEER_PREFIX}:directory`;
  const nodeReq = {
    id: nodeId,
    name: `${nodeId} (mirrored federation proxy)`,
    type: 'service',
    capabilities: ['federation-proxy'],
    endpoint: 'pending://via-bridge',
    metadata: { mirroredFrom: PEER_PREFIX, proxy: true },
  };
  const nreg = await json(`${NETWORK}/api/registry/nodes`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(nodeReq),
  });
  if (nreg.status !== 201) {
    record('F2', false, `POST /registry/nodes -> ${nreg.status} ${JSON.stringify(nreg.body).slice(0, 160)}`);
  } else {
    const list = await json(`${NETWORK}/api/registry/nodes`, { headers: auth });
    const found = (list.body?.nodes || []).some((n: any) => n.id === nodeId);
    record(
      'F2',
      found,
      found ? `node ${nodeId} accepted with prefixed id, no schema change` : `201 on create but ${nodeId} not listed`
    );
  }

  // --- Summary -----------------------------------------------------------------
  const broken = results.filter((r) => !r.held);
  console.log(`\n${results.length - broken.length}/${results.length} predictions held.`);
  if (broken.length) {
    console.log(`BROKEN: ${broken.map((b) => b.id).join(', ')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Harness failure (a request failed, not a measured miss):', e.message);
  process.exit(2);
});
