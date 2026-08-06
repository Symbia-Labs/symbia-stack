/**
 * Ingress as a declared, gated capability (roadmap Phase 2, defect D4).
 *
 * D4, measured 5 Aug: `POST /api/integrations` had no route, so an external
 * ingress could not be declared through the API — and what cannot be declared
 * cannot be gated. The energy MQTT ingress therefore lived as constants in a
 * Python file, outside anything that could authorise it.
 *
 * Phase 1 gave graphs a real delivery boundary (`POST /api/ingress/:graphName`)
 * but that route was merely authenticated: any logged-in principal could
 * deliver into any running graph. Authentication is not authorisation, and an
 * ingress nobody declared is a surface nobody governs.
 *
 * Now: a graph's `metadata.ingress` is registered as a catalog resource when
 * the graph hydrates, and delivery is checked against the owning org and any
 * declared capability. The endpoint becomes an addressable, discoverable,
 * gated capability like any other.
 */
import type { GraphDefinition } from '../types/graph.js';
import type { CatalogResource, RuntimeCatalogClient } from './client.js';

export const INGRESS_KEY_PREFIX = 'ingress/';

export interface IngressDeclaration {
  /** Entry node for delivery. */
  node: string;
  /** Entry port on that node. */
  port: string;
  /**
   * Capability a caller must hold to deliver. Optional: when absent, org
   * membership governs. When present, it is required in addition.
   */
  capability?: string;
  /** Human description of what may be delivered here. */
  description?: string;
}

/** Read a graph's ingress declaration, applying the documented defaults. */
export function readIngress(definition: GraphDefinition): IngressDeclaration | undefined {
  const meta = (definition.metadata ?? {}) as Record<string, unknown>;
  const raw = meta.ingress as Record<string, unknown> | undefined;
  if (!raw) return undefined;
  return {
    node: String(raw.node ?? 'entry'),
    port: String(raw.port ?? 'in'),
    capability: raw.capability ? String(raw.capability) : undefined,
    description: raw.description ? String(raw.description) : undefined,
  };
}

const PUBLIC_READ_GATED_WRITE = {
  visibility: 'public' as const,
  actions: {
    read: { anyOf: ['public'] },
    write: { anyOf: ['cap:registry.write', 'role:admin'] },
    publish: { anyOf: ['cap:registry.publish', 'role:publisher', 'role:admin'] },
    delete: { anyOf: ['role:admin'] },
  },
};

/**
 * Register (or update) the catalog record for a graph's ingress.
 *
 * Registered as an `integration` because that is what an ingress is from the
 * platform's side: a declared connection point with an owner, an address and
 * an authorisation rule. Registering it is what makes D4's "cannot be
 * declared, therefore cannot be gated" false.
 */
export async function registerIngress(
  catalog: RuntimeCatalogClient,
  params: {
    graphName: string;
    graphKey: string;
    orgId?: string;
    ingress: IngressDeclaration;
    existing?: CatalogResource;
  }
): Promise<void> {
  const key = `${INGRESS_KEY_PREFIX}${params.graphName}`;
  const metadata = {
    kind: 'runtime.ingress',
    graph: params.graphName,
    graphKey: params.graphKey,
    endpoint: `/api/ingress/${params.graphName}`,
    method: 'POST',
    node: params.ingress.node,
    port: params.ingress.port,
    capability: params.ingress.capability ?? null,
    // Recorded explicitly so the gate is legible from the registry alone,
    // rather than only from the code that enforces it.
    authorization: params.ingress.capability
      ? `member of org ${params.orgId ?? '(none)'} AND holds ${params.ingress.capability}`
      : `member of org ${params.orgId ?? '(none)'}`,
  };

  const body = {
    key,
    name: `${params.graphName} ingress`,
    description:
      params.ingress.description ??
      `Delivery surface for graph "${params.graphName}" (${params.ingress.node}/${params.ingress.port})`,
    type: 'integration',
    status: 'published',
    tags: ['runtime', 'ingress', params.graphName],
    accessPolicy: PUBLIC_READ_GATED_WRITE,
    metadata,
  };

  if (params.existing) {
    await catalog.updateResource(params.existing.id, {
      name: body.name,
      description: body.description,
      status: body.status,
      tags: body.tags,
      accessPolicy: PUBLIC_READ_GATED_WRITE,
      metadata,
    });
    return;
  }
  await catalog.createResource(body);
}

export interface IngressGateInput {
  /** Graph's owning org, from its catalog resource. */
  graphOrgId?: string;
  ingress: IngressDeclaration;
  caller: {
    isSuperAdmin?: boolean;
    entitlements?: string[];
    organizations?: { id: string }[];
  };
  enforcement: 'strict' | 'warn' | 'off';
}

export interface IngressGateResult {
  allowed: boolean;
  /** Populated when refused, or when warn mode allowed something strict would refuse. */
  reason?: string;
}

/**
 * Decide whether a caller may deliver to a graph's ingress.
 *
 * The rule, in order:
 *  - super admins pass;
 *  - a declared capability, if any, must be held;
 *  - the caller must belong to the org that owns the graph;
 *  - a graph with neither an owning org nor a declared capability is an
 *    UNDECLARED surface and is refused under strict enforcement. Allowing it
 *    would mean any authenticated principal could deliver into any pipeline,
 *    which is the Phase 1 behaviour this phase exists to end.
 */
export function checkIngressAccess(input: IngressGateInput): IngressGateResult {
  const { caller, ingress, graphOrgId, enforcement } = input;

  if (enforcement === 'off') return { allowed: true };
  if (caller.isSuperAdmin) return { allowed: true };

  const entitlements = caller.entitlements ?? [];
  const orgs = (caller.organizations ?? []).map((o) => o.id);

  if (ingress.capability && !entitlements.includes(ingress.capability)) {
    return refuse(
      `caller does not hold the capability declared by this ingress (${ingress.capability})`,
      enforcement
    );
  }

  if (graphOrgId) {
    if (!orgs.includes(graphOrgId)) {
      return refuse(`caller is not a member of the org that owns this graph`, enforcement);
    }
    return { allowed: true };
  }

  // No owning org. A declared capability that the caller holds is still a
  // real, checked authorisation, so that passes.
  if (ingress.capability) return { allowed: true };

  return refuse(
    'this graph declares no owning org and no ingress capability, so delivery cannot be authorised',
    enforcement
  );
}

function refuse(reason: string, enforcement: 'strict' | 'warn' | 'off'): IngressGateResult {
  if (enforcement === 'warn') {
    console.warn(`[Ingress] would refuse (enforcement=warn): ${reason}`);
    return { allowed: true, reason };
  }
  return { allowed: false, reason };
}
