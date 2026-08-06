/**
 * Catalog Resource Types
 *
 * Type definitions for all catalog resources used in the Catalog Editor.
 */

// Resource types supported by the catalog.
//
// This list is the third copy of the same registry — catalog/shared/schema.ts
// is the authority, @symbia/catalog-client keeps another, and this is a third.
// All three had drifted apart: catalog gained `component` (Phase 0, 5 Aug) and
// `app` (6 Aug) that neither copy learned about, while this copy's consumers
// switch on an `executor` type the catalog has never defined. Logged as D11.
// Kept in sync by hand for now; the fix is for consumers to take the type from
// the client library and the client library to track the catalog.
export type ResourceType =
  | 'graph'
  | 'context'
  | 'assistant'
  | 'integration'
  | 'component'
  | 'app';

export type ResourceStatus = 'draft' | 'published' | 'deprecated';

// Base interface for all catalog resources
export interface CatalogResource {
  id: string;
  key: string;
  name: string;
  description?: string;
  type: ResourceType;
  status: ResourceStatus;
  orgId: string;
  tags: string[];
  accessPolicy?: AccessPolicy;
  metadata: Record<string, unknown>;
  currentVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccessPolicy {
  visibility: 'public' | 'private';
  allowedRoles?: string[];
  auditRead?: boolean;
  auditWrite?: boolean;
}

// Context-specific resource
export interface ContextResource extends CatalogResource {
  type: 'context';
  metadata: {
    schema?: JsonSchema;
    defaults?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

// JSON Schema definition for context schema builder
export interface JsonSchema {
  type: 'object';
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: (string | number | boolean)[];
  default?: unknown;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
}

// Graph-specific resource
export interface GraphResource extends CatalogResource {
  type: 'graph';
  metadata: Record<string, unknown>;
}

// Assistant-specific resource
export interface AssistantResource extends CatalogResource {
  type: 'assistant';
  metadata: {
    alias?: string;
    principalId?: string;
    defaultGraphId?: string;
    capabilities?: string[];
    webhooks?: {
      message?: string;
      control?: string;
    };
    assistantConfig?: {
      provider?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      ruleSetId?: string;
    };
    contextBindings?: ContextBinding[];
    [key: string]: unknown;
  };
}

export interface ContextBinding {
  id: string;
  contextId: string;
  contextKey: string;
  localAlias: string;
  refreshOn: 'demand' | 'interval' | 'conversation_start';
  refreshInterval?: number;
  isActive: boolean;
  syncedAt?: string;
}

// Integration-specific resource
export interface IntegrationResource extends CatalogResource {
  type: 'integration';
  metadata: {
    serviceType?: 'rest' | 'graphql' | 'grpc' | 'websocket';
    baseUrl?: string;
    authType?: 'none' | 'bearer' | 'api_key' | 'oauth' | 'basic';
    headers?: Record<string, string>;
    rateLimit?: {
      requests: number;
      windowMs: number;
    };
    retryConfig?: {
      maxRetries: number;
      backoffMs: number;
    };
    [key: string]: unknown;
  };
}

// Type guard helpers
export function isContextResource(resource: CatalogResource): resource is ContextResource {
  return resource.type === 'context';
}

export function isGraphResource(resource: CatalogResource): resource is GraphResource {
  return resource.type === 'graph';
}

export function isAssistantResource(resource: CatalogResource): resource is AssistantResource {
  return resource.type === 'assistant';
}

export function isIntegrationResource(resource: CatalogResource): resource is IntegrationResource {
  return resource.type === 'integration';
}

// Resource type metadata for UI
export const RESOURCE_TYPE_META: Record<ResourceType, {
  label: string;
  icon: string;
  color: string;
  description: string;
}> = {
  graph: {
    label: 'Graph',
    icon: '📊',
    color: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    description: 'DAG workflows for AI prompts, automation, and pipelines',
  },
  context: {
    label: 'Context',
    icon: '📦',
    color: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
    description: 'Shared state definitions with access policies',
  },
  assistant: {
    label: 'Assistant',
    icon: '🤖',
    color: 'text-scc-secondary border-scc-secondary/30 bg-scc-secondary/10',
    description: 'AI assistant definitions with graph bindings',
  },
  integration: {
    label: 'Integration',
    icon: '🔌',
    color: 'text-scc-primary border-scc-primary/30 bg-scc-primary/10',
    description: 'External service configurations',
  },
};

export const STATUS_META: Record<ResourceStatus, {
  label: string;
  color: string;
}> = {
  draft: {
    label: 'Draft',
    color: 'text-slate-400 bg-slate-400/10',
  },
  published: {
    label: 'Published',
    color: 'text-emerald-400 bg-emerald-400/10',
  },
  deprecated: {
    label: 'Deprecated',
    color: 'text-red-400 bg-red-400/10',
  },
};

// API request/response types
export interface CreateResourceParams {
  key: string;
  name: string;
  type: ResourceType;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  accessPolicy?: AccessPolicy;
}

export interface UpdateResourceParams {
  name?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  accessPolicy?: AccessPolicy;
}

export interface ResourceVersion {
  version: number;
  publishedAt: string;
  publishedBy: string;
  changes?: string;
}
