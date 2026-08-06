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
import { listComponents } from '../executor/components.js';
import type { CatalogResource, RuntimeCatalogClient } from './client.js';

/** Catalog key namespace for runtime component manifests. */
export const COMPONENT_KEY_PREFIX = 'components/';

/**
 * Version stamped on every manifest this runtime publishes. Bumping it causes
 * the reconcile pass to update existing manifests rather than leave them stale
 * — the catalog should never describe ports the bundle no longer has.
 */
export const COMPONENT_CONTRACT_VERSION =
  process.env.RUNTIME_COMPONENT_CONTRACT_VERSION ?? '1.2.0';

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

export interface ComponentManifest {
  key: string;
  version: string;
  implementation: 'builtin' | 'expression' | 'wasm' | 'integration' | 'remote-service';
  inputs: { name: string }[];
  outputs: { name: string }[];
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
    outputs: c.outputs.map((name) => ({ name })),
    capability: COMPONENT_CAPABILITY,
    description: c.description,
  }));
}

function manifestOf(resource: CatalogResource): ComponentManifest | undefined {
  const meta = resource.metadata as Record<string, unknown> | null | undefined;
  const m = meta?.manifest as ComponentManifest | undefined;
  return m && typeof m.key === 'string' ? m : undefined;
}

function portsEqual(a: { name: string }[], b: { name: string }[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p.name === b[i]?.name);
}

function manifestChanged(existing: ComponentManifest, next: ComponentManifest): boolean {
  return (
    existing.version !== next.version ||
    existing.implementation !== next.implementation ||
    existing.capability !== next.capability ||
    existing.description !== next.description ||
    !portsEqual(existing.inputs ?? [], next.inputs) ||
    !portsEqual(existing.outputs ?? [], next.outputs)
  );
}

export interface ManifestSyncResult {
  registered: string[];
  updated: string[];
  unchanged: string[];
  failed: { key: string; error: string }[];
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
  const result: ManifestSyncResult = { registered: [], updated: [], unchanged: [], failed: [] };

  const existing = await catalog.listResources({ type: 'component' });
  const byKey = new Map<string, CatalogResource>();
  for (const r of existing) byKey.set(r.key, r);

  for (const manifest of buildManifests()) {
    const catalogKey = `${COMPONENT_KEY_PREFIX}${manifest.key}`;
    const found = byKey.get(catalogKey);
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
          metadata: { manifest },
        });
        result.registered.push(manifest.key);
        continue;
      }
      const current = manifestOf(found);
      // A manifest registered under the catalog's default private policy is
      // unreadable to graph authors and tooling, so treat that as drift too —
      // otherwise a manifest registered before this fix stays invisible.
      const policyDrifted = found.accessPolicy?.visibility !== 'public';
      if (current && !manifestChanged(current, manifest) && !policyDrifted) {
        result.unchanged.push(manifest.key);
        continue;
      }
      await catalog.updateResource(found.id, {
        name: manifest.key,
        description: manifest.description,
        accessPolicy: PUBLIC_READ_GATED_WRITE,
        metadata: { ...(found.metadata ?? {}), manifest },
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
