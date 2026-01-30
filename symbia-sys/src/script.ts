/**
 * Symbia Script - Unified Reference System
 *
 * Provides a consistent syntax for referencing data across the platform:
 *
 *   @namespace.path[.subpath]
 *
 * Namespaces:
 *   @context   - Execution context data
 *   @message   - Current message
 *   @user      - Current user
 *   @org       - Current organization
 *   @service   - Internal service calls (e.g., @service.logging./logs/query)
 *   @integration - External API calls (e.g., @integration.openai.chat.completions)
 *   @var       - Script variables
 *   @env       - Environment variables
 *   @entity    - Entity directory lookup (e.g., @entity.log-analyst → entity UUID)
 *   @mention   - @mention syntax (e.g., @log-analyst → resolves to entity)
 *
 * String interpolation uses {{...}}:
 *   "Hello {{@user.displayName}}"
 *
 * Entity/Mention Resolution:
 *   @entity.log-analyst           → Resolves slug to entity UUID
 *   @entity.ent_abc123            → Direct entity lookup by UUID
 *   @entity.log-analyst#instance2 → Specific instance
 *   @log-analyst                  → Shorthand for @entity.log-analyst
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Known namespaces in Symbia Script
 */
export const SymbiaNamespace = {
  CONTEXT: 'context',
  MESSAGE: 'message',
  USER: 'user',
  ORG: 'org',
  SERVICE: 'service',
  INTEGRATION: 'integration',
  VAR: 'var',
  ENV: 'env',
  COMPONENT: 'component',
  CATALOG: 'catalog',
  ENTITY: 'entity',     // Entity directory resolution (@entity.log-analyst → entityId)
  MENTION: 'mention',   // @mention syntax sugar for @entity (@log-analyst → entityId)
} as const;

export type SymbiaNamespace = (typeof SymbiaNamespace)[keyof typeof SymbiaNamespace];

/**
 * Parsed reference structure
 */
export interface SymbiaRef {
  /** Raw reference string (e.g., "@service.logging./logs/query") */
  raw: string;
  /** Whether this is a valid reference */
  valid: boolean;
  /** The namespace (e.g., "service") */
  namespace: SymbiaNamespace | string;
  /** The path after namespace (e.g., "logging./logs/query" or "displayName") */
  path: string;
  /** Path segments split by dots and brackets (e.g., ["component", "[http/Request]", "name"]) */
  segments: string[];
  /** Bracket accessors extracted (e.g., ["http/Request"]) */
  brackets?: string[];
  /** Query parameters if present */
  query?: Record<string, string>;
  /** Error message if invalid */
  error?: string;
}

/**
 * Namespace metadata for autocomplete
 */
export interface NamespaceInfo {
  name: SymbiaNamespace | string;
  description: string;
  examples: string[];
  /** Whether this namespace supports service calls (async resolution) */
  async: boolean;
  /** Child paths available (for autocomplete) */
  children?: NamespaceChildInfo[];
}

export interface NamespaceChildInfo {
  path: string;
  description: string;
  type: 'value' | 'object' | 'service' | 'operation';
}

/**
 * Resolution context passed to resolvers
 */
export interface ResolutionContext {
  // Core context
  orgId?: string;
  conversationId?: string;

  // Message context
  message?: {
    id?: string;
    content?: string;
    role?: string;
    metadata?: Record<string, unknown>;
  };

  // User context
  user?: {
    id?: string;
    email?: string;
    displayName?: string;
    metadata?: Record<string, unknown>;
  };

  // Organization context
  org?: {
    id?: string;
    name?: string;
    metadata?: Record<string, unknown>;
  };

  // Variables
  vars?: Record<string, unknown>;

  // Generic context store
  context?: Record<string, unknown>;

  // Metadata
  metadata?: Record<string, unknown>;

  // Auth token for service calls
  token?: string;

  // Catalog data (injected by higher-level services)
  catalog?: {
    resources?: Record<string, unknown>[];
  };
}

/**
 * Result of resolving a reference
 */
export interface ResolvedValue {
  success: boolean;
  value?: unknown;
  error?: string;
  /** Whether the resolution required async (service call) */
  async?: boolean;
}

// =============================================================================
// PARSING
// =============================================================================

/**
 * Pattern for matching Symbia references: @namespace.path
 */
const REF_PATTERN = /^@([a-zA-Z][a-zA-Z0-9_]*)\.(.+)$/;

/**
 * Pattern for matching interpolation: {{...}}
 */
const INTERPOLATION_PATTERN = /\{\{([^}]+)\}\}/g;

/**
 * Parse a Symbia reference string
 *
 * @param ref - Reference string (e.g., "@user.displayName" or "@service.logging./logs")
 * @returns Parsed reference structure
 */
export function parseRef(ref: string): SymbiaRef {
  const trimmed = ref.trim();

  // Must start with @
  if (!trimmed.startsWith('@')) {
    return {
      raw: ref,
      valid: false,
      namespace: '',
      path: '',
      segments: [],
      error: 'Reference must start with @',
    };
  }

  const match = trimmed.match(REF_PATTERN);
  if (!match) {
    // Could be just @namespace or @namespace. (for autocomplete)
    const nsOnly = trimmed.slice(1).replace(/\.$/, ''); // Remove trailing dot
    if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(nsOnly)) {
      return {
        raw: ref,
        valid: true,
        namespace: nsOnly,
        path: '',
        segments: [],
      };
    }
    return {
      raw: ref,
      valid: false,
      namespace: '',
      path: '',
      segments: [],
      error: 'Invalid reference format. Expected @namespace.path',
    };
  }

  const namespace = match[1];
  let path = match[2];
  let query: Record<string, string> | undefined;

  // Extract query parameters if present
  const queryIndex = path.indexOf('?');
  if (queryIndex !== -1) {
    const queryString = path.slice(queryIndex + 1);
    path = path.slice(0, queryIndex);
    query = {};
    for (const pair of queryString.split('&')) {
      const [key, value] = pair.split('=');
      if (key) {
        query[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
      }
    }
  }

  // Split path into segments, preserving URL-like paths and brackets
  // e.g., "logging./logs/query" -> ["logging", "/logs/query"]
  // e.g., "component[http/Request].name" -> ["component", "[http/Request]", "name"]
  const segments = splitPath(path);

  // Extract bracket accessors
  const brackets: string[] = [];
  for (const segment of segments) {
    if (segment.startsWith('[') && segment.endsWith(']')) {
      brackets.push(segment.slice(1, -1));
    }
  }

  return {
    raw: ref,
    valid: true,
    namespace,
    path,
    segments,
    brackets: brackets.length > 0 ? brackets : undefined,
    query,
  };
}

/**
 * Split a path into segments, handling URL-like paths and bracket accessors
 */
function splitPath(path: string): string[] {
  const segments: string[] = [];
  let current = '';
  let inUrlPath = false;
  let inBracket = false;

  for (let i = 0; i < path.length; i++) {
    const char = path[i];

    if (char === '[' && !inUrlPath && !inBracket) {
      // Start of bracket accessor
      if (current) {
        segments.push(current);
        current = '';
      }
      inBracket = true;
      current = '[';
    } else if (char === ']' && inBracket) {
      // End of bracket accessor
      current += ']';
      segments.push(current);
      current = '';
      inBracket = false;
    } else if (char === '/' && !inUrlPath && !inBracket) {
      // Start of URL-like path
      if (current) {
        segments.push(current);
        current = '';
      }
      inUrlPath = true;
      current = '/';
    } else if (char === '.' && !inUrlPath && !inBracket) {
      // Segment separator
      if (current) {
        segments.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    segments.push(current);
  }

  return segments;
}

/**
 * Check if a string contains Symbia references
 */
export function containsRefs(str: string): boolean {
  return str.includes('@') || INTERPOLATION_PATTERN.test(str);
}

/**
 * Extract all references from a string (both bare and interpolated)
 */
export function extractRefs(str: string): SymbiaRef[] {
  const refs: SymbiaRef[] = [];
  const seen = new Set<string>();

  // Find interpolated refs: {{@...}}
  const matches = str.matchAll(INTERPOLATION_PATTERN);
  for (const match of matches) {
    const content = match[1].trim();
    if (content.startsWith('@') && !seen.has(content)) {
      seen.add(content);
      refs.push(parseRef(content));
    }
  }

  // Find bare refs in the string (for URLs, paths, etc.)
  const barePattern = /@([a-zA-Z][a-zA-Z0-9_]*)\.([a-zA-Z0-9_./?&=%-]+)/g;
  const bareMatches = str.matchAll(barePattern);
  for (const match of bareMatches) {
    const ref = match[0];
    if (!seen.has(ref)) {
      seen.add(ref);
      refs.push(parseRef(ref));
    }
  }

  return refs;
}

// =============================================================================
// RESOLUTION
// =============================================================================

/**
 * Get a nested value from an object using dot notation and bracket accessors
 */
export function getNestedValue(obj: unknown, path: string | string[]): unknown {
  const segments = Array.isArray(path) ? path : path.split('.');
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }

    // Handle bracket accessor: [key]
    if (segment.startsWith('[') && segment.endsWith(']')) {
      const key = segment.slice(1, -1);
      current = (current as Record<string, unknown>)[key];
    } else {
      current = (current as Record<string, unknown>)[segment];
    }
  }

  return current;
}

/**
 * Resolve a catalog reference
 * Supports: @catalog.component[key], @catalog.graph[key].property, etc.
 */
function resolveCatalogRef(segments: string[], ctx: ResolutionContext): ResolvedValue {
  if (!ctx.catalog?.resources) {
    return { success: false, error: 'Catalog data not available in context' };
  }

  if (segments.length === 0) {
    // @catalog - return all resources
    return { success: true, value: ctx.catalog.resources };
  }

  const resourceType = segments[0]; // e.g., "component", "graph", "executor"

  if (segments.length === 1) {
    // @catalog.component - return all components
    const filtered = ctx.catalog.resources.filter(
      (r: any) => r.type === resourceType
    );
    return { success: true, value: filtered };
  }

  // Handle bracket accessor: @catalog.component[http/Request]
  if (segments[1].startsWith('[') && segments[1].endsWith(']')) {
    const key = segments[1].slice(1, -1);
    const resource = ctx.catalog.resources.find(
      (r: any) => r.type === resourceType && r.key === key
    );

    if (!resource) {
      return { success: false, error: `Resource not found: ${resourceType}[${key}]` };
    }

    // If there are more segments, navigate into the resource
    if (segments.length > 2) {
      const remainingPath = segments.slice(2);
      return { success: true, value: getNestedValue(resource, remainingPath) };
    }

    return { success: true, value: resource };
  }

  // Fallback: treat as property access
  return { success: true, value: getNestedValue(ctx.catalog, segments) };
}

/**
 * Resolve a reference against a context (sync only - no service calls)
 *
 * @param ref - Parsed reference or reference string
 * @param ctx - Resolution context
 * @returns Resolved value
 */
export function resolveRef(
  ref: SymbiaRef | string,
  ctx: ResolutionContext
): ResolvedValue {
  const parsed = typeof ref === 'string' ? parseRef(ref) : ref;

  if (!parsed.valid) {
    return { success: false, error: parsed.error };
  }

  const { namespace, segments } = parsed;

  switch (namespace) {
    case SymbiaNamespace.CONTEXT:
      return { success: true, value: getNestedValue(ctx.context, segments) };

    case SymbiaNamespace.MESSAGE:
      return { success: true, value: getNestedValue(ctx.message, segments) };

    case SymbiaNamespace.USER:
      return { success: true, value: getNestedValue(ctx.user, segments) };

    case SymbiaNamespace.ORG:
      if (segments.length === 0 || segments[0] === 'id') {
        return { success: true, value: ctx.orgId ?? ctx.org?.id };
      }
      return { success: true, value: getNestedValue(ctx.org, segments) };

    case SymbiaNamespace.VAR:
      return { success: true, value: getNestedValue(ctx.vars, segments) };

    case SymbiaNamespace.ENV:
      if (segments.length > 0 && typeof process !== 'undefined') {
        return { success: true, value: process.env[segments[0]] };
      }
      return { success: false, error: 'Environment variable name required' };

    case SymbiaNamespace.CATALOG:
      return resolveCatalogRef(segments, ctx);

    case SymbiaNamespace.SERVICE:
    case SymbiaNamespace.INTEGRATION:
    case SymbiaNamespace.ENTITY:
    case SymbiaNamespace.MENTION:
      // These require async resolution (API calls to Identity service for entity/mention)
      return {
        success: false,
        error: `${namespace} references require async resolution`,
        async: true,
      };

    default:
      // Try to resolve from generic context
      const contextValue = getNestedValue(ctx.context, [namespace, ...segments]);
      if (contextValue !== undefined) {
        return { success: true, value: contextValue };
      }
      return { success: false, error: `Unknown namespace: ${namespace}` };
  }
}

/**
 * Interpolate all references in a string
 *
 * @param template - String with {{@ref}} placeholders
 * @param ctx - Resolution context
 * @returns Interpolated string
 */
export function interpolate(template: string, ctx: ResolutionContext): string {
  return template.replace(INTERPOLATION_PATTERN, (_, content) => {
    const trimmed = content.trim();

    // Handle @ref syntax
    if (trimmed.startsWith('@')) {
      const result = resolveRef(trimmed, ctx);
      if (result.success) {
        return formatValue(result.value);
      }
      // Return empty string for unresolved refs
      return '';
    }

    // Legacy support: bare paths without @ (e.g., {{message.content}})
    const value = getNestedValue(ctx, trimmed.split('.'));
    return formatValue(value);
  });
}

/**
 * Format a value for string interpolation
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * Recursively interpolate all string values in an object
 */
export function interpolateObject<T extends Record<string, unknown>>(
  obj: T,
  ctx: ResolutionContext
): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = interpolate(value, ctx);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        typeof item === 'string'
          ? interpolate(item, ctx)
          : typeof item === 'object' && item !== null
            ? interpolateObject(item as Record<string, unknown>, ctx)
            : item
      );
    } else if (typeof value === 'object' && value !== null) {
      result[key] = interpolateObject(value as Record<string, unknown>, ctx);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

// =============================================================================
// NAMESPACE REGISTRY (for autocomplete)
// =============================================================================

/**
 * Get metadata for all available namespaces
 */
export function getNamespaces(): NamespaceInfo[] {
  return [
    {
      name: SymbiaNamespace.CONTEXT,
      description: 'Execution context data',
      examples: ['@context.conversationId', '@context.customData'],
      async: false,
    },
    {
      name: SymbiaNamespace.MESSAGE,
      description: 'Current message',
      examples: ['@message.content', '@message.id', '@message.role'],
      async: false,
      children: [
        { path: 'id', description: 'Message ID', type: 'value' },
        { path: 'content', description: 'Message text content', type: 'value' },
        { path: 'role', description: 'Sender role (user/assistant/system)', type: 'value' },
        { path: 'metadata', description: 'Message metadata', type: 'object' },
      ],
    },
    {
      name: SymbiaNamespace.USER,
      description: 'Current user',
      examples: ['@user.id', '@user.email', '@user.displayName'],
      async: false,
      children: [
        { path: 'id', description: 'User ID', type: 'value' },
        { path: 'email', description: 'User email', type: 'value' },
        { path: 'displayName', description: 'Display name', type: 'value' },
        { path: 'metadata', description: 'User metadata', type: 'object' },
      ],
    },
    {
      name: SymbiaNamespace.ORG,
      description: 'Current organization',
      examples: ['@org.id', '@org.name'],
      async: false,
      children: [
        { path: 'id', description: 'Organization ID', type: 'value' },
        { path: 'name', description: 'Organization name', type: 'value' },
        { path: 'metadata', description: 'Org metadata', type: 'object' },
      ],
    },
    {
      name: SymbiaNamespace.CATALOG,
      description: 'Catalog resources',
      examples: ['@catalog.component[http/Request]', '@catalog.graph[user-onboarding].nodes'],
      async: false,
      children: [
        { path: 'component', description: 'All components', type: 'object' },
        { path: 'graph', description: 'All graphs', type: 'object' },
        { path: 'executor', description: 'All executors', type: 'object' },
        { path: 'context', description: 'All contexts', type: 'object' },
      ],
    },
    {
      name: SymbiaNamespace.SERVICE,
      description: 'Internal service calls',
      examples: ['@service.logging./logs/query', '@service.catalog./resources'],
      async: true,
      children: [
        { path: 'logging', description: 'Logging service', type: 'service' },
        { path: 'catalog', description: 'Catalog service', type: 'service' },
        { path: 'identity', description: 'Identity service', type: 'service' },
        { path: 'messaging', description: 'Messaging service', type: 'service' },
        { path: 'runtime', description: 'Runtime service', type: 'service' },
        { path: 'network', description: 'Network service', type: 'service' },
      ],
    },
    {
      name: SymbiaNamespace.INTEGRATION,
      description: 'External API integrations',
      examples: ['@integration.openai.chat.completions', '@integration.slack.postMessage'],
      async: true,
    },
    {
      name: SymbiaNamespace.VAR,
      description: 'Script variables',
      examples: ['@var.myVariable', '@var.config.apiKey'],
      async: false,
    },
    {
      name: SymbiaNamespace.ENV,
      description: 'Environment variables',
      examples: ['@env.NODE_ENV', '@env.API_KEY'],
      async: false,
    },
  ];
}

/**
 * Get autocomplete suggestions for a partial reference
 */
export function getRefSuggestions(
  partial: string,
  ctx?: ResolutionContext
): Array<{ value: string; description: string }> {
  const suggestions: Array<{ value: string; description: string }> = [];

  // If empty or just @, suggest namespaces
  if (!partial || partial === '@') {
    for (const ns of getNamespaces()) {
      suggestions.push({
        value: `@${ns.name}.`,
        description: ns.description,
      });
    }
    return suggestions;
  }

  // Parse the partial reference
  const parsed = parseRef(partial);

  if (!parsed.valid && partial.startsWith('@')) {
    // Typing namespace, suggest matching namespaces
    const nsPartial = partial.slice(1).toLowerCase();
    for (const ns of getNamespaces()) {
      if (ns.name.toLowerCase().startsWith(nsPartial)) {
        suggestions.push({
          value: `@${ns.name}.`,
          description: ns.description,
        });
      }
    }
    return suggestions;
  }

  // Have a valid namespace, suggest children
  const nsInfo = getNamespaces().find(ns => ns.name === parsed.namespace);
  if (nsInfo?.children) {
    const pathPrefix = parsed.segments.join('.');
    for (const child of nsInfo.children) {
      if (!pathPrefix || child.path.startsWith(pathPrefix)) {
        suggestions.push({
          value: `@${parsed.namespace}.${child.path}`,
          description: child.description,
        });
      }
    }
  }

  // Catalog-specific: suggest actual resource keys from context
  if (parsed.namespace === SymbiaNamespace.CATALOG && ctx?.catalog?.resources) {
    const segments = parsed.segments;

    // If we have @catalog.component (or graph, executor, etc)
    if (segments.length === 1) {
      const resourceType = segments[0];
      const resources = ctx.catalog.resources.filter((r: any) => r.type === resourceType);

      // Suggest up to 20 resource keys
      for (const resource of resources.slice(0, 20)) {
        const key = String(resource.key || '');
        const desc = String(resource.name || resource.description || resource.key || '');
        suggestions.push({
          value: `@catalog.${resourceType}[${key}]`,
          description: desc,
        });
      }
    }
  }

  // Add examples if no specific children
  if (suggestions.length === 0 && nsInfo) {
    for (const example of nsInfo.examples) {
      suggestions.push({
        value: example,
        description: `Example: ${example}`,
      });
    }
  }

  return suggestions;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validation result for a reference
 */
export interface RefValidation {
  valid: boolean;
  ref: SymbiaRef;
  warnings: string[];
  errors: string[];
}

/**
 * Validate a reference
 */
export function validateRef(ref: string): RefValidation {
  const parsed = parseRef(ref);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!parsed.valid) {
    errors.push(parsed.error || 'Invalid reference');
    return { valid: false, ref: parsed, warnings, errors };
  }

  // Check if namespace is known
  const knownNamespaces = Object.values(SymbiaNamespace) as string[];
  if (!knownNamespaces.includes(parsed.namespace)) {
    warnings.push(`Unknown namespace: ${parsed.namespace}`);
  }

  // Check service/integration references have paths
  if (
    (parsed.namespace === SymbiaNamespace.SERVICE ||
     parsed.namespace === SymbiaNamespace.INTEGRATION) &&
    parsed.segments.length === 0
  ) {
    errors.push(`${parsed.namespace} references require a path`);
  }

  return {
    valid: errors.length === 0,
    ref: parsed,
    warnings,
    errors,
  };
}

/**
 * Validate all references in a template string
 */
export function validateTemplate(template: string): {
  valid: boolean;
  refs: RefValidation[];
  errors: string[];
} {
  const refs = extractRefs(template);
  const validations = refs.map(ref => validateRef(ref.raw));
  const errors = validations.flatMap(v => v.errors);

  return {
    valid: errors.length === 0,
    refs: validations,
    errors,
  };
}
