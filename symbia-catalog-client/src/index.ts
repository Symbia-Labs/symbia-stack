/**
 * @symbia/catalog-client
 *
 * Client library for interacting with the Symbia Catalog Service.
 * Provides type-safe access to resources, graphs, contexts, integrations,
 * and assistants.
 *
 * @example
 * ```typescript
 * import { createCatalogClient } from '@symbia/catalog-client';
 *
 * const catalog = createCatalogClient({
 *   endpoint: 'https://catalog.symbia-labs.com',
 *   token: 'your-jwt-token',
 * });
 *
 * // List published assistants
 * const assistants = await catalog.getPublishedAssistants();
 *
 * // Get a specific graph
 * const graph = await catalog.getGraph('graph-id');
 *
 * // Search for resources
 * const results = await catalog.search({ query: 'log analysis' });
 * ```
 */

// Re-export client
export { CatalogClient, createCatalogClient } from './client.js';

// Re-export all types
export type {
  // Core types
  ResourceType,
  ResourceStatus,
  VisibilityLevel,
  AccessPolicyAction,
  AccessPolicy,

  // Metadata types
  AssistantConfig,

  // Resource types
  BaseResource,
  Resource,
  GraphResource,
  AssistantResource,
  ContextResource,
  IntegrationResource,

  // Related entities
  ResourceVersion,
  Artifact,
  Signature,
  Certification,

  // Request/response types
  CreateResourceParams,
  UpdateResourceParams,
  ListResourcesParams,
  SearchParams,
  BulkOperationParams,
  BootstrapSummary,
  CatalogStats,

  // Configuration
  CatalogClientConfig,
  RequestOptions,
} from './types.js';

// Re-export constants
export { resourceTypes, resourceStatuses, visibilityLevels, accessPolicyActions } from './types.js';
