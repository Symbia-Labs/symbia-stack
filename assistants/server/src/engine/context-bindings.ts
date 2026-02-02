/**
 * Context Bindings Resolver
 *
 * Resolves context bindings defined in assistant metadata to populate
 * the execution context with dynamic data before rule execution.
 *
 * Context bindings allow assistants to have pre-configured data sources
 * that are automatically refreshed and injected into the execution context.
 *
 * Supported binding types:
 * - logs: Recent log entries (filtered by source, level, time range)
 * - events: Recent system events from SDN
 * - catalog: Resources from catalog service
 * - metrics: Usage/performance metrics
 * - custom: User-defined context sources
 */

import { resolveServiceUrl, ServiceId } from "@symbia/sys";

const LOGGING_SERVICE_URL = resolveServiceUrl(ServiceId.LOGGING);
const CATALOG_SERVICE_URL = resolveServiceUrl(ServiceId.CATALOG);
const NETWORK_SERVICE_URL = resolveServiceUrl(ServiceId.NETWORK);

/**
 * Helper to parse JSON response with proper typing
 */
async function parseJsonResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

interface LogsApiResponse {
  logs?: unknown[];
  entries?: unknown[];
}

interface EventsApiResponse {
  events?: unknown[];
}

interface CatalogApiResponse {
  resources?: unknown[];
}

// =============================================================================
// Types
// =============================================================================

export interface ContextBinding {
  /** Key to store the resolved data under in context */
  contextKey: string;
  /** Friendly alias for referencing in prompts (e.g., @recentLogs) */
  alias: string;
  /** When to refresh the binding */
  refresh: 'on_start' | 'on_turn' | 'never' | string; // string for millisecond intervals
  /** Binding type determines how data is fetched */
  type?: 'logs' | 'events' | 'catalog' | 'metrics' | 'custom';
  /** Type-specific configuration */
  config?: ContextBindingConfig;
}

export interface ContextBindingConfig {
  // For logs binding
  logs?: {
    source?: string[];      // Filter by source service
    level?: string[];       // Filter by log level
    timeRange?: string;     // e.g., '1h', '24h', '7d'
    limit?: number;         // Max entries to fetch
    search?: string;        // Search query
  };
  // For events binding
  events?: {
    types?: string[];       // Event types to include
    sources?: string[];     // Source services
    timeRange?: string;
    limit?: number;
  };
  // For catalog binding
  catalog?: {
    type?: string;          // Resource type filter
    prefix?: string;        // Key prefix filter
    limit?: number;
  };
  // For metrics binding
  metrics?: {
    metric?: string;        // Metric name
    timeRange?: string;
    aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count';
  };
  // For custom binding
  custom?: {
    endpoint?: string;      // Custom endpoint to call
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
  };
}

export interface ResolvedBinding {
  contextKey: string;
  alias: string;
  data: unknown;
  resolvedAt: string;
  error?: string;
}

// =============================================================================
// Time Parsing
// =============================================================================

function parseTimeRange(range: string): number {
  const match = range.match(/^(\d+)([smhdw])$/);
  if (!match) return 3600000; // Default 1 hour

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'w': return value * 7 * 24 * 60 * 60 * 1000;
    default: return 3600000;
  }
}

// =============================================================================
// Binding Resolvers
// =============================================================================

async function resolveLogsBinding(
  binding: ContextBinding,
  token: string
): Promise<unknown> {
  const config = binding.config?.logs || {};
  const timeRangeMs = parseTimeRange(config.timeRange || '1h');
  const since = new Date(Date.now() - timeRangeMs).toISOString();

  const params = new URLSearchParams();
  params.set('since', since);
  if (config.limit) params.set('limit', String(config.limit));
  if (config.source?.length) params.set('source', config.source.join(','));
  if (config.level?.length) params.set('level', config.level.join(','));
  if (config.search) params.set('search', config.search);

  try {
    const response = await fetch(
      `${LOGGING_SERVICE_URL}/api/logs?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      throw new Error(`Logs API returned ${response.status}`);
    }

    const data = await parseJsonResponse<LogsApiResponse>(response);
    return data.logs || data.entries || [];
  } catch (error) {
    console.warn(`[ContextBindings] Failed to resolve logs binding:`, error);
    return [];
  }
}

async function resolveEventsBinding(
  binding: ContextBinding,
  token: string
): Promise<unknown> {
  const config = binding.config?.events || {};
  const limit = config.limit || 50;

  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (config.types?.length) params.set('types', config.types.join(','));
  if (config.sources?.length) params.set('sources', config.sources.join(','));

  try {
    const response = await fetch(
      `${NETWORK_SERVICE_URL}/api/events/recent?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      throw new Error(`Events API returned ${response.status}`);
    }

    const data = await parseJsonResponse<EventsApiResponse>(response);
    return data.events || [];
  } catch (error) {
    console.warn(`[ContextBindings] Failed to resolve events binding:`, error);
    return [];
  }
}

async function resolveCatalogBinding(
  binding: ContextBinding,
  token: string
): Promise<unknown> {
  const config = binding.config?.catalog || {};
  const params = new URLSearchParams();

  if (config.type) params.set('type', config.type);
  if (config.prefix) params.set('prefix', config.prefix);
  if (config.limit) params.set('limit', String(config.limit));

  try {
    const response = await fetch(
      `${CATALOG_SERVICE_URL}/api/resources?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      throw new Error(`Catalog API returned ${response.status}`);
    }

    const data = await parseJsonResponse<CatalogApiResponse>(response);
    return data.resources || [];
  } catch (error) {
    console.warn(`[ContextBindings] Failed to resolve catalog binding:`, error);
    return [];
  }
}

async function resolveCustomBinding(
  binding: ContextBinding,
  token: string
): Promise<unknown> {
  const config = binding.config?.custom;
  if (!config?.endpoint) {
    return null;
  }

  try {
    const response = await fetch(config.endpoint, {
      method: config.method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: config.method === 'POST' ? JSON.stringify(config.body) : undefined,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Custom endpoint returned ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.warn(`[ContextBindings] Failed to resolve custom binding:`, error);
    return null;
  }
}

// =============================================================================
// Main Resolver
// =============================================================================

/**
 * Resolve a single context binding
 */
export async function resolveBinding(
  binding: ContextBinding,
  token: string
): Promise<ResolvedBinding> {
  const startTime = Date.now();

  try {
    let data: unknown;

    // Determine binding type from contextKey or explicit type
    const type = binding.type || inferBindingType(binding.contextKey);

    switch (type) {
      case 'logs':
        data = await resolveLogsBinding(binding, token);
        break;
      case 'events':
        data = await resolveEventsBinding(binding, token);
        break;
      case 'catalog':
        data = await resolveCatalogBinding(binding, token);
        break;
      case 'custom':
        data = await resolveCustomBinding(binding, token);
        break;
      default:
        data = null;
    }

    console.log(
      `[ContextBindings] Resolved ${binding.contextKey} (${type}) in ${Date.now() - startTime}ms`
    );

    return {
      contextKey: binding.contextKey,
      alias: binding.alias,
      data,
      resolvedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ContextBindings] Failed to resolve ${binding.contextKey}:`, error);

    return {
      contextKey: binding.contextKey,
      alias: binding.alias,
      data: null,
      resolvedAt: new Date().toISOString(),
      error: message,
    };
  }
}

/**
 * Resolve all context bindings for an assistant
 */
export async function resolveBindings(
  bindings: ContextBinding[],
  token: string,
  refreshMode: 'on_start' | 'on_turn' = 'on_start'
): Promise<Record<string, unknown>> {
  if (!bindings || bindings.length === 0) {
    return {};
  }

  // Filter bindings that should be refreshed based on mode
  const toResolve = bindings.filter((b) => {
    if (b.refresh === 'never') return false;
    if (b.refresh === refreshMode) return true;
    // For interval-based refresh, we'd need to track last refresh time
    // For now, always refresh if not 'never'
    return true;
  });

  if (toResolve.length === 0) {
    return {};
  }

  console.log(
    `[ContextBindings] Resolving ${toResolve.length} bindings (mode: ${refreshMode})`
  );

  // Resolve all bindings in parallel
  const results = await Promise.all(
    toResolve.map((binding) => resolveBinding(binding, token))
  );

  // Build context object
  const context: Record<string, unknown> = {};
  for (const result of results) {
    if (result.data !== null) {
      context[result.contextKey] = result.data;
      // Also set by alias for template access
      if (result.alias) {
        context[result.alias] = result.data;
      }
    }
  }

  return context;
}

/**
 * Infer binding type from context key
 */
function inferBindingType(contextKey: string): ContextBinding['type'] {
  const key = contextKey.toLowerCase();
  if (key.includes('log')) return 'logs';
  if (key.includes('event')) return 'events';
  if (key.includes('catalog') || key.includes('resource')) return 'catalog';
  if (key.includes('metric')) return 'metrics';
  return 'custom';
}

/**
 * Format bound context for inclusion in prompts
 * Creates a summary suitable for LLM consumption
 */
export function formatBoundContext(
  resolvedBindings: Record<string, unknown>,
  maxTokens: number = 2000
): string {
  if (Object.keys(resolvedBindings).length === 0) {
    return '';
  }

  const sections: string[] = [];

  for (const [key, data] of Object.entries(resolvedBindings)) {
    if (!data || (Array.isArray(data) && data.length === 0)) {
      continue;
    }

    let section = `## ${key}\n`;

    if (Array.isArray(data)) {
      // Summarize array data
      const items = data.slice(0, 10); // Limit to 10 items
      section += items.map((item, i) => {
        if (typeof item === 'object') {
          // Format log/event entries
          const obj = item as Record<string, unknown>;
          if (obj.message) {
            return `- ${obj.timestamp || ''} [${obj.level || 'info'}] ${obj.message}`;
          }
          if (obj.type) {
            return `- ${obj.timestamp || ''} ${obj.type}: ${JSON.stringify(obj.data || {}).slice(0, 100)}`;
          }
          return `- ${JSON.stringify(item).slice(0, 100)}`;
        }
        return `- ${item}`;
      }).join('\n');

      if (data.length > 10) {
        section += `\n... and ${data.length - 10} more items`;
      }
    } else if (typeof data === 'object') {
      section += JSON.stringify(data, null, 2).slice(0, 500);
    } else {
      section += String(data);
    }

    sections.push(section);
  }

  const result = sections.join('\n\n');

  // Simple token estimation and truncation
  const estimatedTokens = result.length / 4;
  if (estimatedTokens > maxTokens) {
    return result.slice(0, maxTokens * 4) + '\n\n... (truncated)';
  }

  return result;
}
