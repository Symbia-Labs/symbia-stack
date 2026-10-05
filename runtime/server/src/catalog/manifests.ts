/**
 * Component manifest registration.
 *
 * Phase 1's premise: the contract moves into the catalog even while the code
 * stays in the bundle. Every component compiled into this runtime publishes a
 * manifest — key, version, implementation kind, typed ports, required
 * capability — as a gated, ledgered catalog resource. A graph node can then be
 * validated against a registered contract at load time rather than discovering
 * at runtime that it referenced something that does not exist.
 *
 * This is what defuses D1 without shipping a plugin loader: registration is
 * real and enforced, and the implementation kind is honestly declared as
 * `builtin` rather than pretending the code arrived through the registry.
 */
import {
  loadServiceIdentity,
  signDocument,
  verifyDocument,
  identityFromPublicPem,
  type ServiceIdentity,
} from '@symbia/crypto';
import { listComponents } from '../executor/components.js';
import type { CatalogResource, RuntimeCatalogClient } from './client.js';

/** Catalog key namespace for runtime component manifests. */
export const COMPONENT_KEY_PREFIX = 'components/';

/**
 * Version stamped on every manifest this runtime publishes. Bumping it causes
 * the reconcile pass to update existing manifests rather than leave them stale
 * — the catalog should never describe ports the bundle no longer has.
 *
 * 1.4.0: manifests are signed (docs/proposals/signed-composition.md §4). The
 * bump forces the reconcile pass to re-write every 1.3.0 entry, which is how
 * the existing unsigned manifests acquire signatures without a special case.
 *
 * 1.5.0: ports declare a `receipt` — the evidence the runtime requires before
 * the port may carry its declared lane. Same reasoning as 1.4.0's bump: an
 * existing 1.4.0 manifest would otherwise keep describing ports whose lane the
 * runtime now enforces differently.
 */
export const COMPONENT_CONTRACT_VERSION =
  process.env.RUNTIME_COMPONENT_CONTRACT_VERSION ?? '1.5.0';

/** Capability a caller must hold to execute a runtime component. */
export const COMPONENT_CAPABILITY =
  process.env.RUNTIME_COMPONENT_CAPABILITY ?? 'cap:runtime.execute';

/**
 * A component manifest is a published contract: anyone may read what ports a
 * component exposes, only a registry writer may change it. The catalog's
 * default policy is private-read, which would make the manifests unreadable to
 * exactly the callers that need them (graph authors, the control center, MCP)
 * while changing nothing about who can write.
 */
const PUBLIC_READ_GATED_WRITE = {
  visibility: 'public' as const,
  actions: {
    read: { anyOf: ['public'] },
    write: { anyOf: ['cap:registry.write', 'role:admin'] },
    publish: { anyOf: ['cap:registry.publish', 'role:publisher', 'role:admin'] },
    delete: { anyOf: ['role:admin'] },
  },
};

export interface ManifestPort {
  name: string;
  /**
   * Provenance lane this port emits on. Absent means `inherit`.
   *
   * The runtime has always known this — `emitsApocryphal` is read by
   * `normaliseEmission` — but the published contract carried it only inside
   * the description string. Something reading the catalog to decide whether a
   * value can be trusted had to parse English to find out, on a platform whose
   * whole claim is that provenance is checkable.
   */
  lane?: 'inherit' | 'canonical' | 'apocryphal' | 'conditional';
  /** What decides the lane. Present when lane is 'conditional'. */
  laneNote?: string;
  /**
   * Evidence the runtime requires before this port may carry its declared lane.
   *
   *   recipe   the operation and its resolved inputs, so the value can be
   *            computed again by something that never saw this process
   *   witness  a digest of the bytes as received, and where from
   *   none     an explicit opt-out; `laneNote` says why
   *
   * A port declared `canonical` requires a recipe unless it says `none` here.
   * The declaration was previously read by nobody: `normaliseEmission` took a
   * boolean and the per-port block reached no code path (D20).
   */
  receipt?: 'recipe' | 'witness' | 'none';
}

export interface ManifestConfigField {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  default?: unknown;
  enum?: string[];
  description: string;
}

export interface ComponentManifest {
  key: string;
  version: string;
  implementation: 'builtin' | 'expression' | 'wasm' | 'integration' | 'remote-service';
  inputs: ManifestPort[];
  outputs: ManifestPort[];
  /**
   * Typed configuration contract. Absent means the component declares none —
   * which is distinct from declaring an empty one, and the distinction is
   * deliberate: `{}` asserts "this component takes no config", `undefined`
   * admits "nobody has said". Blank beats green.
   */
  config?: Record<string, ManifestConfigField>;
  capability?: string;
  description?: string;
}

/** Derive the manifest for every component compiled into this runtime. */
export function buildManifests(): ComponentManifest[] {
  return listComponents().map((c) => ({
    key: c.id,
    version: COMPONENT_CONTRACT_VERSION,
    implementation: 'builtin' as const,
    inputs: c.inputs.map((name) => ({ name })),
    outputs: c.outputs.map((name) => {
      const declared = c.lanes?.[name];
      // A component marked emitsApocryphal taints every output it has. Deriving
      // that here rather than asking each registration to repeat it keeps the
      // published contract consistent with what normaliseEmission actually does.
      const lane = declared?.lane ?? (c.emitsApocryphal ? 'apocryphal' : 'inherit');
      // Publish the requirement the runtime will actually apply, including the
      // one it derives: a canonical port that named no receipt still needs a
      // recipe, and a reader of the contract should see that without knowing
      // the defaulting rule.
      const receipt = declared?.receipt ?? (lane === 'canonical' ? 'recipe' : undefined);
      return {
        name,
        lane,
        ...(declared?.note ? { laneNote: declared.note } : {}),
        ...(receipt ? { receipt } : {}),
      };
    }),
    config: c.config,
    capability: COMPONENT_CAPABILITY,
    description: c.description,
  }));
}

/**
 * Detached signature over the canonical manifest, stored beside it.
 *
 * The public key travels with the signature so the manifest verifies from the
 * catalog copy alone — the same self-contained construction the reply
 * envelopes use (STATUS §5b). `signer.role_claimed` is what the process said
 * it was; the key proves a holder, not a role, and a verifier that needs the
 * role established must check the fingerprint against the identity it trusts.
 */
export interface ManifestSignatureBlock {
  /** `ed25519:` over the RFC 8785 canonical manifest. */
  signature: string;
  signer: {
    id: string;
    role_claimed: string;
    fingerprint: string;
    publicKeyPem: string;
  };
}

/**
 * The signing identity for this service. Same construction as the assistants'
 * `sealDelegation`: `loadServiceIdentity` re-reads the key the service booted
 * with, so this is the identity `symbia-http` already logged at startup. If it
 * is unavailable the manifest is still published — unsigned, and *reported* as
 * unsigned, never silently pretending otherwise.
 */
let cachedIdentity: ServiceIdentity | null | undefined;
function signingIdentity(): ServiceIdentity | null {
  if (cachedIdentity !== undefined) return cachedIdentity;
  try {
    cachedIdentity = loadServiceIdentity({ role: 'runtime' });
  } catch {
    cachedIdentity = null;
  }
  return cachedIdentity;
}

function signManifest(manifest: ComponentManifest): ManifestSignatureBlock | undefined {
  const sid = signingIdentity();
  if (!sid) return undefined;
  return {
    signature: signDocument(manifest as unknown as Record<string, unknown>, sid.identity),
    signer: {
      id: sid.id,
      role_claimed: sid.role_claimed,
      fingerprint: sid.fingerprint,
      publicKeyPem: sid.publicKeyPem,
    },
  };
}

/**
 * Does the stored signature verify over the manifest this bundle would
 * publish? Checked as part of drift detection so a manifest whose signature
 * is missing, forged, or signed by a rotated key gets re-written — the same
 * reasoning as `portsEqual` comparing lanes: a publisher that cannot see its
 * own new field is a silent no-op.
 */
function signatureCurrent(resource: CatalogResource, manifest: ComponentManifest): boolean {
  const meta = resource.metadata as Record<string, unknown> | null | undefined;
  const block = meta?.manifestSignature as ManifestSignatureBlock | undefined;
  if (!block?.signature || !block.signer?.publicKeyPem) return false;
  const sid = signingIdentity();
  if (sid && block.signer.fingerprint !== sid.fingerprint) return false;
  try {
    const pub = identityFromPublicPem(block.signer.publicKeyPem);
    return verifyDocument({ ...manifest, signature: block.signature }, pub.publicKey);
  } catch {
    return false;
  }
}

function manifestOf(resource: CatalogResource): ComponentManifest | undefined {
  const meta = resource.metadata as Record<string, unknown> | null | undefined;
  const m = meta?.manifest as ComponentManifest | undefined;
  return m && typeof m.key === 'string' ? m : undefined;
}

function portsEqual(a: ManifestPort[], b: ManifestPort[]): boolean {
  if (a.length !== b.length) return false;
  // Compare the lane, not only the name.
  //
  // This compared names alone. Had the lane been added to the manifest without
  // this line, every existing manifest would have reported "unchanged" and kept
  // its old shape forever — a publisher that cannot see its own new field is a
  // silent no-op, and the version bump would have masked it for exactly one
  // release. Same reasoning for config below.
  return a.every(
    (p, i) =>
      p.name === b[i]?.name &&
      (p.lane ?? 'inherit') === (b[i]?.lane ?? 'inherit') &&
      (p.laneNote ?? '') === (b[i]?.laneNote ?? '') &&
      (p.receipt ?? 'none') === (b[i]?.receipt ?? 'none')
  );
}

/**
 * Structural comparison for the config contract.
 *
 * Key order is not significant, so compare canonicalised JSON rather than
 * object identity — otherwise a reordered declaration would PATCH on every
 * reconcile pass and the ledger would fill with writes that changed nothing.
 */
function canonical(value: unknown): string {
  if (value === undefined) return ' undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

function configEqual(
  a: Record<string, ManifestConfigField> | undefined,
  b: Record<string, ManifestConfigField> | undefined
): boolean {
  // undefined ("nobody has said") and {} ("takes no config") are different
  // claims and must not compare equal.
  if (a === undefined || b === undefined) return a === b;
  return canonical(a) === canonical(b);
}

function manifestChanged(existing: ComponentManifest, next: ComponentManifest): boolean {
  return (
    existing.version !== next.version ||
    existing.implementation !== next.implementation ||
    existing.capability !== next.capability ||
    existing.description !== next.description ||
    !portsEqual(existing.inputs ?? [], next.inputs) ||
    !portsEqual(existing.outputs ?? [], next.outputs) ||
    !configEqual(existing.config, next.config)
  );
}

export interface ManifestSyncResult {
  registered: string[];
  updated: string[];
  unchanged: string[];
  failed: { key: string; error: string }[];
  /**
   * Keys written without a signature because no identity was available.
   * Reported, never inferred away: an unsigned manifest in a registry that
   * claims signatures is exactly the kind of gap P12 taught us to count in
   * the denominator (STATUS §6.1a).
   */
  unsigned: string[];
}

/**
 * Publish this runtime's component manifests to the catalog.
 *
 * Idempotent: existing manifests are compared field-by-field and PATCHed only
 * when the bundle actually diverges from what the registry claims. Failures
 * are collected rather than thrown, so one rejected manifest does not prevent
 * the rest from registering — but they are returned, not swallowed, and the
 * caller decides whether an incomplete registry is fatal.
 */
export async function syncComponentManifests(
  catalog: RuntimeCatalogClient
): Promise<ManifestSyncResult> {
  const result: ManifestSyncResult = {
    registered: [],
    updated: [],
    unchanged: [],
    failed: [],
    unsigned: [],
  };

  const existing = await catalog.listResources({ type: 'component' });
  const byKey = new Map<string, CatalogResource>();
  for (const r of existing) byKey.set(r.key, r);

  for (const manifest of buildManifests()) {
    const catalogKey = `${COMPONENT_KEY_PREFIX}${manifest.key}`;
    const found = byKey.get(catalogKey);
    const manifestSignature = signManifest(manifest);
    if (!manifestSignature) result.unsigned.push(manifest.key);
    try {
      if (!found) {
        await catalog.createResource({
          key: catalogKey,
          name: manifest.key,
          description: manifest.description,
          type: 'component',
          status: 'published',
          tags: ['runtime', 'component', 'builtin', manifest.key.split('.')[1] ?? 'core'],
          // Public read, gated write. The gate belongs on registration, not on
          // discovery: a contract nobody can read is not a contract, and the
          // catalog's default private policy made the manifests invisible to
          // every reader that had not already authenticated as a writer.
          accessPolicy: PUBLIC_READ_GATED_WRITE,
          metadata: { manifest, ...(manifestSignature ? { manifestSignature } : {}) },
        });
        result.registered.push(manifest.key);
        continue;
      }
      const current = manifestOf(found);
      // A manifest registered under the catalog's default private policy is
      // unreadable to graph authors and tooling, so treat that as drift too —
      // otherwise a manifest registered before this fix stays invisible.
      const policyDrifted = found.accessPolicy?.visibility !== 'public';
      // A stale, absent, or non-verifying signature is drift for the same
      // reason a policy regression is: the catalog copy no longer says what
      // this bundle would publish.
      const signatureDrifted = manifestSignature !== undefined && !signatureCurrent(found, manifest);
      if (current && !manifestChanged(current, manifest) && !policyDrifted && !signatureDrifted) {
        result.unchanged.push(manifest.key);
        continue;
      }
      await catalog.updateResource(found.id, {
        name: manifest.key,
        description: manifest.description,
        accessPolicy: PUBLIC_READ_GATED_WRITE,
        metadata: {
          ...(found.metadata ?? {}),
          manifest,
          ...(manifestSignature ? { manifestSignature } : {}),
        },
      });
      result.updated.push(manifest.key);
    } catch (error) {
      result.failed.push({ key: manifest.key, error: (error as Error).message });
    }
  }

  return result;
}

/**
 * The set of component keys the catalog currently manifests. This is the
 * authority a graph node is resolved against at load time — not the in-process
 * registry, which is exactly the thing Phase 1 stops trusting on its own.
 */
export async function fetchManifestedComponentKeys(
  catalog: RuntimeCatalogClient
): Promise<Set<string>> {
  const resources = await catalog.listResources({ type: 'component' });
  const keys = new Set<string>();
  for (const r of resources) {
    const manifest = manifestOf(r);
    if (manifest) keys.add(manifest.key);
    else if (r.key.startsWith(COMPONENT_KEY_PREFIX)) {
      keys.add(r.key.slice(COMPONENT_KEY_PREFIX.length));
    }
  }
  return keys;
}
