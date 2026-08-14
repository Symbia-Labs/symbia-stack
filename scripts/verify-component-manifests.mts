#!/usr/bin/env node
/**
 * The component gate, run as a reader: verify every published component
 * manifest from the catalog copy alone.
 *
 * BEHAVIOURAL, AGAINST A RUNNING STACK. NOT GREP OVER SOURCE.
 *
 * This is the §4 component gate of docs/proposals/signed-composition.md in
 * embryo — applied after the fact by a verifier rather than at write time by
 * the catalog. Moving these checks into the catalog's write path so they
 * REJECT instead of report is the follow-up this script exists to motivate;
 * until then it is the standing evidence, re-runnable like
 * verify-assistants.mts.
 *
 * Checks, per resource of type `component`:
 *   G1 key ⇄ id      resource.key === 'components/' + manifest.key
 *   G2 lanes          every output port declares a lane from the four values
 *   G3 signed         a manifestSignature block is present
 *   G4 verifies       ed25519 over the RFC 8785 canonical manifest checks out
 *                     against the public key travelling WITH the signature —
 *                     nothing but the catalog response is consulted
 *
 * Reported, not gated (a key proves a holder, not a role):
 *   R1 signer         signer id / role_claimed / fingerprint
 *
 * Usage: npx tsx scripts/verify-component-manifests.mts
 *        CATALOG_URL=http://localhost:5003 to point elsewhere.
 */
import { verifyDocument, identityFromPublicPem } from '@symbia/crypto';

const CATALOG = process.env.CATALOG_URL || 'http://localhost:5003';

interface ManifestPort {
  name: string;
  lane?: string;
  laneNote?: string;
}
interface Manifest {
  key: string;
  version: string;
  implementation: string;
  inputs: ManifestPort[];
  outputs: ManifestPort[];
  config?: Record<string, unknown>;
  capability?: string;
  description?: string;
}
interface SignatureBlock {
  signature: string;
  signer?: {
    id?: string;
    role_claimed?: string;
    fingerprint?: string;
    publicKeyPem?: string;
  };
}
interface Resource {
  id: string;
  key: string;
  type: string;
  status: string;
  metadata?: { manifest?: Manifest; manifestSignature?: SignatureBlock } & Record<string, unknown>;
}

const LANES = new Set(['inherit', 'canonical', 'apocryphal', 'conditional']);

async function listComponents(): Promise<Resource[]> {
  const res = await fetch(`${CATALOG}/api/resources?type=component&limit=200`);
  if (!res.ok) throw new Error(`GET /api/resources?type=component -> ${res.status}`);
  const body = await res.json();
  // The list endpoint has returned both a bare array and {resources: [...]}
  // in this codebase's lifetime; accept either rather than assume.
  const items: Resource[] = Array.isArray(body) ? body : body.resources ?? body.data ?? [];
  if (!Array.isArray(items)) throw new Error('Unrecognised list response shape');
  return items.filter((r) => r.type === 'component');
}

interface Row {
  key: string;
  g1: boolean;
  g2: boolean;
  g3: boolean;
  g4: boolean;
  signer: string;
  detail: string[];
}

function check(r: Resource): Row {
  const detail: string[] = [];
  const m = r.metadata?.manifest;
  if (!m) {
    return {
      key: r.key,
      g1: false,
      g2: false,
      g3: false,
      g4: false,
      signer: '—',
      detail: ['no metadata.manifest at all'],
    };
  }

  const g1 = r.key === `components/${m.key}`;
  if (!g1) detail.push(`key mismatch: resource '${r.key}' vs manifest '${m.key}'`);

  const badPorts = (m.outputs ?? []).filter((p) => !p.lane || !LANES.has(p.lane));
  const g2 = (m.outputs ?? []).length > 0 && badPorts.length === 0;
  if (!g2)
    detail.push(
      badPorts.length
        ? `outputs without a valid lane: ${badPorts.map((p) => p.name).join(', ')}`
        : 'no output ports declared'
    );

  const block = r.metadata?.manifestSignature;
  const g3 = Boolean(block?.signature && block.signer?.publicKeyPem);
  if (!g3) detail.push('no manifestSignature block');

  let g4 = false;
  if (g3 && block) {
    try {
      const pub = identityFromPublicPem(block.signer!.publicKeyPem!);
      g4 = verifyDocument({ ...m, signature: block.signature }, pub.publicKey);
      if (!g4) detail.push('signature present but DOES NOT VERIFY over the stored manifest');
    } catch (e) {
      detail.push(`signature verification threw: ${(e as Error).message}`);
    }
  }

  const signer = block?.signer
    ? `${block.signer.role_claimed ?? '?'} ${block.signer.fingerprint?.slice(0, 12) ?? ''}`
    : '—';

  return { key: r.key, g1, g2, g3, g4, signer, detail };
}

const mark = (b: boolean) => (b ? 'ok' : 'FAIL');

async function main() {
  const resources = await listComponents();
  console.log(`${resources.length} component resources in the catalog at ${CATALOG}\n`);
  console.log(
    'G1 key⇄id  G2 lanes  G3 signed  G4 verifies  — verified from the catalog response alone\n'
  );

  const rows = resources.map(check);
  let failures = 0;
  for (const row of rows) {
    const ok = row.g1 && row.g2 && row.g3 && row.g4;
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${row.key.padEnd(36)} G1:${mark(row.g1)} G2:${mark(row.g2)} G3:${mark(
        row.g3
      )} G4:${mark(row.g4)}  signer: ${row.signer}`
    );
    for (const d of row.detail) console.log(`        ${d}`);
  }

  const versions = new Set(
    resources.map((r) => r.metadata?.manifest?.version).filter(Boolean)
  );
  console.log(`\nmanifest versions present: ${[...versions].join(', ') || 'none'}`);
  console.log(
    failures === 0
      ? `\nAll ${rows.length} manifests pass the component gate.`
      : `\n${failures} of ${rows.length} manifests FAIL the component gate.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  // An unreachable catalog is an observation about the stack, not about the
  // manifests. Say which failure this is.
  console.error(`Could not complete verification: ${e.message}`);
  process.exit(2);
});
