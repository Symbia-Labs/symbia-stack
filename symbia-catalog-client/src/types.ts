/**
 * @symbia/catalog-client - Type definitions
 *
 * Shared types for the Symbia Catalog Service.
 * These mirror the catalog service schema with client-friendly interfaces.
 */

// Resource types and statuses
export const resourceTypes = ["context", "integration", "graph", "assistant"] as const;
export type ResourceType = (typeof resourceTypes)[number];

export const resourceStatuses = ["draft", "published", "deprecated"] as const;
export type ResourceStatus = (typeof resourceStatuses)[number];

export const visibilityLevels = ["public", "org", "private"] as const;
export type VisibilityLevel = (typeof visibilityLevels)[number];

export const accessPolicyActions = ["read", "write", "publish", "sign", "certify", "delete"] as const;
export type AccessPolicyAction = (typeof accessPolicyActions)[number];

// Access policy type
export interface AccessPolicy {
  visibility: VisibilityLevel;
  actions: {
    [K in AccessPolicyAction]?: {
      anyOf: string[];
    };
  };
}

// Assistant configuration
export interface AssistantConfig {
  principalId: string;
  principalType: "assistant";
  capabilities: string[];
  ruleSetId?: string;
  webhooks?: {
    message?: string;
    control?: string;
  };
  endpoints?: {
    [key: string]: string;
  };
  serviceConfig?: {
    loggingEndpoint?: string;
    identityEndpoint?: string;
    catalogEndpoint?: string;
    [key: string]: unknown;
  };
  modelConfig?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

// Base resource interface (without metadata for extension)
export interface BaseResource {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  type: ResourceType;
  status: ResourceStatus;
  isBootstrap: boolean;
  tags?: string[] | null;
  orgId?: string | null;
  accessPolicy?: AccessPolicy | null;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

// Generic resource with untyped metadata
export interface Resource extends BaseResource {
  metadata?: Record<string, unknown> | null;
}

// Resource with typed metadata - use intersection types for proper typing
export interface GraphResource extends BaseResource {
  type: "graph";
  metadata?: Record<string, unknown> | null;
}

export interface AssistantResource extends BaseResource {
  type: "assistant";
  metadata?: (AssistantConfig & Record<string, unknown>) | null;
}

export interface ContextResource extends BaseResource {
  type: "context";
  metadata?: {
    kind?: string;
    data?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
}

export interface IntegrationResource extends BaseResource {
  type: "integration";
  metadata?: {
    endpoints?: Record<string, unknown>;
    webhooks?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
}

// Resource version
export interface ResourceVersion {
  id: string;
  resourceId: string;
  version: number;
  content?: Record<string, unknown> | null;
  changelog?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  createdBy?: string | null;
}

// Artifact
export interface Artifact {
  id: string;
  resourceId: string;
  versionId?: string | null;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  checksum?: string | null;
  storageUrl?: string | null;
  createdAt: string;
}

// Signature
export interface Signature {
  id: string;
  resourceId: string;
  versionId?: string | null;
  signerId: string;
  signerName?: string | null;
  algorithm?: string | null;
  signature: string;
  signedAt: string;
}

// Certification
export interface Certification {
  id: string;
  resourceId: string;
  versionId?: string | null;
  certifierId: string;
  certifierName?: string | null;
  certificationType?: string | null;
  notes?: string | null;
  certifiedAt: string;
  expiresAt?: string | null;
}

// API request types
export interface CreateResourceParams {
  key: string;
  name: string;
  description?: string;
  type: ResourceType;
  status?: ResourceStatus;
  isBootstrap?: boolean;
  tags?: string[];
  orgId?: string;
  accessPolicy?: AccessPolicy;
  metadata?: Record<string, unknown>;
}

export interface UpdateResourceParams {
  key?: string;
  name?: string;
  description?: string;
  status?: ResourceStatus;
  isBootstrap?: boolean;
  tags?: string[];
  accessPolicy?: AccessPolicy;
  metadata?: Record<string, unknown>;
}

export interface ListResourcesParams {
  type?: ResourceType;
  status?: ResourceStatus;
  orgId?: string;
  isBootstrap?: boolean;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface SearchParams {
  query: string;
  type?: ResourceType;
  status?: ResourceStatus;
  orgId?: string;
  limit?: number;
}

export interface BulkOperationParams {
  action: "publish" | "delete" | "updateStatus" | "addTags" | "removeTags";
  ids: string[];
  payload?: {
    status?: ResourceStatus;
    tags?: string[];
  };
}

// Bootstrap summary response
export interface BootstrapSummary {
  components: {
    groups: Record<string, {
      label: string;
      categories: Record<string, {
        label: string;
        count: number;
      }>;
    }>;
  };
  contexts: {
    groups: Record<string, {
      label: string;
      count: number;
    }>;
  };
  graphs: {
    count: number;
  };
  executors: {
    count: number;
    byLanguage: Record<string, number>;
  };
  assistants: {
    count: number;
  };
  integrations: {
    count: number;
  };
  totals: {
    resources: number;
    published: number;
    bootstrap: number;
  };
}

// Service stats - simple flat structure matching server response
export interface CatalogStats {
  totalResources: number;
  publishedVersions: number;
  bootstrapEntries: number;
  totalAssistants: number;
  totalContexts: number;
  totalIntegrations: number;
  totalGraphs: number;
}

// Client configuration
export interface CatalogClientConfig {
  endpoint?: string;
  token?: string;
  apiKey?: string;
  orgId?: string;
  serviceId?: string;
  env?: string;
  timeout?: number;
  onError?: (error: Error) => void;
}

// Request options
export interface RequestOptions {
  orgId?: string;
  serviceId?: string;
  env?: string;
  signal?: AbortSignal;
}
