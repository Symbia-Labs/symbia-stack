/**
 * Internal Services Loader
 *
 * Loads and registers internal Symbia services as MCP-accessible integrations.
 * These services (identity, catalog, logging, assistants, etc.) have OpenAPI specs
 * and can be invoked through the MCP server just like external integrations.
 *
 * Key differences from external integrations:
 * - Fetches OpenAPI specs via HTTP from each service's /docs/openapi.json endpoint
 * - Forwards user's JWT token instead of fetching external API credentials
 * - Resolves service URLs via @symbia/sys
 */

import { ServiceId, resolveServiceUrl } from "@symbia/sys";
import type { Integration } from "@shared/schema.js";
import { integrationRegistry } from "./spec-parser/integration-registry.js";
import { parseOpenAPISpec } from "./spec-parser/openapi-parser.js";

/**
 * Internal service definitions
 *
 * Each service has:
 * - serviceId: Used to resolve the runtime URL
 * - specEndpoint: HTTP endpoint to fetch OpenAPI spec (relative to service URL)
 * - name/description: Display info for MCP clients
 * - prefix: Optional prefix for operation IDs to avoid collisions
 */
interface InternalServiceConfig {
  serviceId: ServiceId;
  specEndpoint: string;
  name: string;
  description: string;
  prefix?: string;
  /** Operations to exclude (by operationId pattern) */
  excludePatterns?: RegExp[];
  /** Only include operations matching these patterns */
  includePatterns?: RegExp[];
  /** Tags to add to all operations */
  additionalTags?: string[];
}

const INTERNAL_SERVICES: InternalServiceConfig[] = [
  {
    serviceId: ServiceId.IDENTITY,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Identity",
    description: "Authentication, users, organizations, and entitlements management",
    prefix: "identity",
    additionalTags: ["internal", "symbia"],
    // Exclude sensitive auth operations from MCP
    excludePatterns: [/password/i, /reset/i, /forgot/i],
  },
  {
    serviceId: ServiceId.CATALOG,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Catalog",
    description: "Resource registry, namespaces, and metadata management",
    prefix: "catalog",
    additionalTags: ["internal", "symbia"],
  },
  {
    serviceId: ServiceId.LOGGING,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Logging",
    description: "Structured logging, audit trails, and log queries",
    prefix: "logging",
    additionalTags: ["internal", "symbia"],
  },
  {
    serviceId: ServiceId.ASSISTANTS,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Assistants",
    description: "AI assistant configuration, personas, and conversation management",
    prefix: "assistants",
    additionalTags: ["internal", "symbia"],
  },
  {
    serviceId: ServiceId.MESSAGING,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Messaging",
    description: "Message channels, threads, and real-time communication",
    prefix: "messaging",
    additionalTags: ["internal", "symbia"],
  },
  {
    serviceId: ServiceId.RUNTIME,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Runtime",
    description: "Component execution, workflows, and runtime management",
    prefix: "runtime",
    additionalTags: ["internal", "symbia"],
  },
  {
    serviceId: ServiceId.NETWORK,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Network",
    description: "Network topology, connections, and service mesh",
    prefix: "network",
    additionalTags: ["internal", "symbia"],
  },
];

/**
 * Load and register all internal services as integrations
 */
export async function loadInternalServices(): Promise<{
  loaded: string[];
  failed: Array<{ service: string; error: string }>;
}> {
  const loaded: string[] = [];
  const failed: Array<{ service: string; error: string }> = [];

  console.log(`[internal-services] Loading internal Symbia services via HTTP`);

  // Load services in parallel for speed
  const results = await Promise.allSettled(
    INTERNAL_SERVICES.map((config) => loadInternalService(config))
  );

  for (let i = 0; i < INTERNAL_SERVICES.length; i++) {
    const config = INTERNAL_SERVICES[i];
    const result = results[i];

    if (result.status === "fulfilled") {
      if (result.value.success) {
        loaded.push(config.prefix || config.serviceId);
        console.log(`[internal-services] ✓ Loaded ${config.name} with ${result.value.operationCount} operations`);
      } else {
        failed.push({ service: config.serviceId, error: result.value.error || "Unknown error" });
        console.warn(`[internal-services] ✗ Failed to load ${config.name}: ${result.value.error}`);
      }
    } else {
      const message = result.reason instanceof Error ? result.reason.message : "Unknown error";
      failed.push({ service: config.serviceId, error: message });
      console.warn(`[internal-services] ✗ Failed to load ${config.name}: ${message}`);
    }
  }

  console.log(`[internal-services] Loaded ${loaded.length}/${INTERNAL_SERVICES.length} internal services`);

  return { loaded, failed };
}

/**
 * Load a single internal service by fetching its OpenAPI spec via HTTP
 */
async function loadInternalService(
  config: InternalServiceConfig
): Promise<{ success: boolean; operationCount?: number; error?: string }> {
  // Get the runtime server URL for this service
  const serverUrl = resolveServiceUrl(config.serviceId);
  const specUrl = `${serverUrl}${config.specEndpoint}`;

  // Fetch the OpenAPI spec via HTTP
  let spec: any;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(specUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch spec: ${response.status} ${response.statusText}`,
      };
    }

    spec = await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        error: `Timeout fetching spec from ${specUrl}`,
      };
    }
    return {
      success: false,
      error: `Could not fetch spec from ${specUrl}: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }

  // Parse the OpenAPI spec
  let parseResult;
  try {
    console.log(`[internal-services] Parsing spec for ${config.name}, paths count: ${Object.keys(spec.paths || {}).length}`);
    parseResult = parseOpenAPISpec(spec, serverUrl);
    console.log(`[internal-services] Parse complete for ${config.name}, operations: ${parseResult.operations?.length || 0}`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.stack || error.message : String(error);
    console.log(`[internal-services] PARSE ERROR for ${config.name}: ${errMsg}`);
    return {
      success: false,
      error: errMsg,
    };
  }
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error,
    };
  }

  // Filter and transform operations
  let operations = parseResult.operations;

  // Apply exclude patterns
  if (config.excludePatterns?.length) {
    operations = operations.filter((op) => {
      const id = op.operationId || op.id;
      return !config.excludePatterns!.some((pattern) => pattern.test(id));
    });
  }

  // Apply include patterns
  if (config.includePatterns?.length) {
    operations = operations.filter((op) => {
      const id = op.operationId || op.id;
      return config.includePatterns!.some((pattern) => pattern.test(id));
    });
  }

  // Add prefix to operation IDs and add tags
  if (config.prefix || config.additionalTags?.length) {
    operations = operations.map((op) => {
      const existingTags = Array.isArray(op.tags) ? op.tags : [];
      const newTags = Array.isArray(config.additionalTags) ? config.additionalTags : [];
      return {
        ...op,
        id: config.prefix ? `${config.prefix}.${op.id}` : op.id,
        tags: [...existingTags, ...newTags],
      };
    });
  }

  // Build the integration object
  // Use "builtin" type since we've already parsed the operations
  const integration: Integration = {
    id: `internal-${config.serviceId}`,
    key: config.prefix || config.serviceId,
    name: config.name,
    description: config.description,
    type: "builtin",
    openapi: {
      serverUrl: parseResult.serverUrl,
    },
    auth: {
      type: "bearer",
    },
    operations,
    namespace: parseResult.namespace,
    status: "active",
    version: 1,
    metadata: {
      isInternal: true,
      serviceId: config.serviceId,
      specUrl,
    },
  };

  // Register with the integration registry
  console.log(`[internal-services] Registering ${config.name} with ${operations.length} operations`);
  let regResult;
  try {
    regResult = await integrationRegistry.register(integration);
  } catch (error) {
    const errMsg = error instanceof Error ? error.stack || error.message : String(error);
    console.log(`[internal-services] REGISTER ERROR for ${config.name}: ${errMsg}`);
    return {
      success: false,
      error: errMsg,
    };
  }
  console.log(`[internal-services] Registration complete for ${config.name}: success=${regResult.success}`);

  return {
    success: regResult.success,
    operationCount: regResult.operationCount,
    error: regResult.error,
  };
}

/**
 * Get a list of loaded internal services
 */
export function getInternalServiceKeys(): string[] {
  return INTERNAL_SERVICES.map((s) => s.prefix || s.serviceId);
}

/**
 * Check if an integration key is an internal service
 */
export function isInternalService(integrationKey: string): boolean {
  return INTERNAL_SERVICES.some(
    (s) => (s.prefix || s.serviceId) === integrationKey
  );
}
