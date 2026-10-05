#!/usr/bin/env node
/**
 * Federation bridge — data-plane spike.
 * Design: docs/2026-08-09-network-bridge-bbmd.md §4.
 * Predictions: docs/2026-08-12-federation-predictions.md (F5).
 *
 * One Mac-side process holding BOTH edges, because only this host can reach
 * both networks (EC2 has no inbound route; the SSM tunnels are the single
 * authenticated edge). A production bridge is one per network; the spike is
 * honest about collapsing them.
 *
 * It consults each side's directory before every forward (control plane owns
 * policy; this process carries none), mirrors topology as prefixed proxies,
 * and forwards one declared event class.
 *
 * Loop control is the experiment:
 *   FED_LOOP_CHECK=off  — the naive forward. Registered to loop (F5).
 *   FED_LOOP_CHECK=on   — federation lineage rides in payload.data.__fedPath;
 *                         an event whose lineage already names this bridge is
 *                         never re-forwarded. Non-retroactive, append-only —
 *                         the same shape as every other lineage here.
 *
 * Usage: SYMBIA_PASSWORD=... FED_LOOP_CHECK=on npx tsx scripts/federation-bridge.mts
 */
import { RelayClient } from '@symbia/relay';

const A = {
  label: 'local',
  net: process.env.LOCAL_NET || 'http://127.0.0.1:5009',
  dir: process.env.LOCAL_DIR || 'http://127.0.0.1:5010',
  api: process.env.LOCAL_API || 'http://127.0.0.1:5001', // identity
  reg: process.env.LOCAL_REG || 'http://127.0.0.1:5009', // registry REST
  peerId: process.env.EC2_INSTALLATION || 'symbia:service:60a31d45cc569dbf',
  prefix: 'peerEc2',
};
const B = {
  label: 'ec2',
  net: process.env.PEER_NET || 'http://127.0.0.1:15009', // SSM tunnel -> 5009
  dir: process.env.PEER_DIR || 'http://127.0.0.1:18000/svc/directory', // via console proxy
  api: process.env.PEER_API || 'http://127.0.0.1:18000/svc/identity',
  reg: process.env.PEER_REG || 'http://127.0.0.1:18000/svc/network',
  peerId: process.env.LOCAL_INSTALLATION || 'symbia:service:95ee24b3b40b42f0',
  prefix: 'peerLocal',
};

const BRIDGE_ID = 'bridge:fed';
const EVENT_CLASS = process.env.FED_EVENT_CLASS || 'network.topology';
const LOOP_CHECK = (process.env.FED_LOOP_CHECK || 'on') !== 'off';
const RUN_SECONDS = parseInt(process.env.FED_RUN_SECONDS || '12', 10);
const EMAIL = process.env.SYMBIA_EMAIL || 'dev@example.com';
const PASSWORD = process.env.SYMBIA_PASSWORD;

const seen: Record<string, number> = { local: 0, ec2: 0 };
const forwarded: Record<string, number> = { 'local->ec2': 0, 'ec2->local': 0 };
const skipped: Record<string, number> = { lineage: 0, denied: 0, duplicate: 0 };

// sdn:watch was observed delivering the same wrapper.id twice (12 Aug 2026,
// guarded run: one probe seen 2x locally, so two copies crossed the seam).
// Forwarding must be idempotent per event id regardless of that defect.
const forwardedIds = new Set<string>();

async function login(apiBase: string): Promise<string> {
  const r = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${apiBase} -> ${r.status}`);
  return (await r.json()).token;
}

async function allow(dirBase: string, peerId: string, eventType: string): Promise<boolean> {
  try {
    const r = await fetch(
      `${dirBase}/api/peers/${encodeURIComponent(peerId)}/allow?eventType=${encodeURIComponent(eventType)}`
    );
    if (!r.ok) return false;
    return Boolean((await r.json()).allowed);
  } catch {
    return false; // an unreachable control plane means no forwarding, never "assume yes"
  }
}

async function mirrorTopology(fromClient: RelayClient, toReg: string, toToken: string, prefix: string) {
  const topo: any = await fromClient.getTopology();
  const nodes: any[] = topo?.nodes || [];
  let mirrored = 0;
  for (const n of nodes) {
    if (!n?.id || String(n.id).startsWith('peer') || String(n.id).startsWith('bridge')) continue;
    const r = await fetch(`${toReg}/api/registry/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${toToken}` },
      body: JSON.stringify({
        id: `${prefix}:${n.id}`,
        name: `${prefix}:${n.id} (mirrored federation proxy)`,
        type: 'service',
        capabilities: ['federation-proxy'],
        endpoint: 'pending://via-bridge',
        metadata: { mirroredFrom: prefix, proxy: true },
      }),
    });
    if (r.status === 201) mirrored++;
  }
  return { total: nodes.length, mirrored };
}

function fedPathOf(event: any): string[] {
  const p = event?.payload?.data?.__fedPath;
  return Array.isArray(p) ? p : [];
}

async function main() {
  if (!PASSWORD) {
    console.error('SYMBIA_PASSWORD is required (registry writes + logins).');
    process.exit(2);
  }
  console.log(`[bridge] loop check: ${LOOP_CHECK ? 'ON (lineage-guarded)' : 'OFF (naive — registered to loop)'}`);

  // Tokens first: sdn:watch and sdn:topology refuse anonymous sockets.
  const [tokA, tokB] = await Promise.all([login(A.api), login(B.api)]);

  const clientA = new RelayClient({
    networkUrl: A.net, nodeId: `${BRIDGE_ID}@${A.label}`, nodeName: 'Federation bridge (local edge)',
    nodeType: 'bridge', capabilities: ['federation'], endpoint: 'pending://bridge-outbound-only',
    authToken: tokA,
  });
  const clientB = new RelayClient({
    networkUrl: B.net, nodeId: `${BRIDGE_ID}@${B.label}`, nodeName: 'Federation bridge (ec2 edge)',
    nodeType: 'bridge', capabilities: ['federation'], endpoint: 'pending://bridge-outbound-only',
    authToken: tokB,
  });

  await clientA.connect();
  console.log('[bridge] connected + registered on local (5009)');
  await clientB.connect();
  console.log('[bridge] connected + registered on ec2 (tunnel 15009)');

  // --- Topology mirroring (the first thing across the seam) -----------------
  const mAB = await mirrorTopology(clientA, B.reg, tokB, B.prefix);
  const mBA = await mirrorTopology(clientB, A.reg, tokA, A.prefix);
  console.log(`[bridge] mirrored local->ec2: ${mAB.mirrored}/${mAB.total} nodes as ${B.prefix}:*`);
  console.log(`[bridge] mirrored ec2->local: ${mBA.mirrored}/${mBA.total} nodes as ${A.prefix}:*`);

  // --- Forwarding (one declared class, directory-gated) ---------------------
  const forward = async (
    from: { label: string; dir: string; peerId: string },
    toClient: RelayClient,
    key: string,
    event: any
  ) => {
    if (event?.payload?.type !== EVENT_CLASS) return;
    const lineage = fedPathOf(event);
    if (LOOP_CHECK && lineage.includes(BRIDGE_ID)) {
      skipped.lineage++;
      return;
    }
    if (LOOP_CHECK && event?.wrapper?.id) {
      if (forwardedIds.has(event.wrapper.id)) {
        skipped.duplicate++;
        return;
      }
      forwardedIds.add(event.wrapper.id);
    }
    if (!(await allow(from.dir, from.peerId, EVENT_CLASS))) {
      skipped.denied++;
      return;
    }
    const data = { ...(event.payload.data as object), __fedPath: [...lineage, BRIDGE_ID] };
    await toClient.send({ type: EVENT_CLASS, data }, event.wrapper.runId, { boundary: 'inter' });
    forwarded[key]++;
  };

  await clientA.watch({ eventType: EVENT_CLASS }, (event) => {
    seen.local++;
    void forward({ label: A.label, dir: A.dir, peerId: A.peerId }, clientB, 'local->ec2', event).catch(() => {});
  });
  await clientB.watch({ eventType: EVENT_CLASS }, (event) => {
    seen.ec2++;
    void forward({ label: B.label, dir: B.dir, peerId: B.peerId }, clientA, 'ec2->local', event).catch(() => {});
  });
  console.log(`[bridge] watching '${EVENT_CLASS}' on both networks`);

  // --- The probe -------------------------------------------------------------
  await clientA.send(
    { type: EVENT_CLASS, data: { probe: 'F5', emittedAt: new Date().toISOString() } },
    `fed-probe-${Date.now()}`
  );
  console.log(`[bridge] probe emitted into local; running ${RUN_SECONDS}s...`);

  await new Promise((r) => setTimeout(r, RUN_SECONDS * 1000));

  console.log('\n[bridge] ===== RESULT =====');
  console.log(`  observed  local=${seen.local}  ec2=${seen.ec2}`);
  console.log(`  forwarded local->ec2=${forwarded['local->ec2']}  ec2->local=${forwarded['ec2->local']}`);
  console.log(`  skipped   lineage=${skipped.lineage}  denied=${skipped.denied}  duplicate=${skipped.duplicate}`);
  // "Looped" means growth, not a fixed multiple: a loop compounds every
  // round-trip, so tens of observations from one probe already means the
  // guard is not holding. A first version of this line said `> 4` and
  // mislabelled a held guard as broken — the instrument shared the
  // assumptions of what it measured. Duplicates from sdn double-delivery
  // are bounded; loops are not.
  const looped = seen.local + seen.ec2 > 20;
  console.log(LOOP_CHECK
    ? (looped ? '  VERDICT: guarded run still multiplied events — guard NOT load-bearing?' : '  VERDICT: bounded observations, loop broken by lineage — guard held')
    : (looped ? '  VERDICT: naive forward loops, as registered (F5 held)' : '  VERDICT: naive forward did NOT loop — F5 broken, the loop story is wrong'));

  await clientA.disconnect();
  await clientB.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('[bridge] fatal:', e.message);
  process.exit(2);
});
