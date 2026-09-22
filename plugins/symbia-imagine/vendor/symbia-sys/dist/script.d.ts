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
/**
 * Known namespaces in Symbia Script
 */
export declare const SymbiaNamespace: {
    readonly CONTEXT: "context";
    readonly MESSAGE: "message";
    readonly USER: "user";
    readonly ORG: "org";
    readonly SERVICE: "service";
    readonly INTEGRATION: "integration";
    readonly VAR: "var";
    readonly ENV: "env";
    readonly COMPONENT: "component";
    readonly CATALOG: "catalog";
    readonly ENTITY: "entity";
    readonly MENTION: "mention";
    /**
     * Assistants, addressable by alias or key.
     *
     * `@assistant.calc.routing.handles` reads what Calculator DECLARES it does.
     * The point is that a rule can reference another assistant's declaration
     * instead of holding a copy of it — this codebase has killed the same
     * roster-copy defect five times (a literal array in `assistants.list`, the
     * coordinator's help text, an orchestrate prompt, two alias tables), and
     * every fix was discipline. This one is grammar, which does not lapse.
     *
     * Added 11 Aug 2026. The prompt was a challenge worth recording: if 99% of
     * authoring happens through typeahead, does the namespace matter? It matters
     * *because* of typeahead — `getRefSuggestions()` can only offer what is a
     * namespace, so without this, autocomplete cannot offer assistants at all.
     */
    readonly ASSISTANT: "assistant";
};
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
    orgId?: string;
    conversationId?: string;
    message?: {
        id?: string;
        content?: string;
        role?: string;
        metadata?: Record<string, unknown>;
    };
    user?: {
        id?: string;
        email?: string;
        displayName?: string;
        metadata?: Record<string, unknown>;
    };
    org?: {
        id?: string;
        name?: string;
        metadata?: Record<string, unknown>;
    };
    vars?: Record<string, unknown>;
    context?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    token?: string;
    catalog?: {
        resources?: Record<string, unknown>[];
    };
    /**
     * The assistant registry, injected the same way `catalog` is.
     *
     * `symbia-sys` must not know how to fetch this — it is a grammar, not a
     * client. The assistants service injects what it has already loaded.
     */
    assistants?: Array<{
        key?: string;
        alias?: string;
        name?: string;
        description?: string;
        routing?: Record<string, unknown>;
        [k: string]: unknown;
    }>;
    /**
     * Prior action results, keyed by step id, so templates can reference
     * `{{steps.<step-id>.result}}`. Injected by the assistants engine from its
     * execution context (see assistants engine/template.ts).
     */
    steps?: Record<string, unknown>;
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
/**
 * Parse a Symbia reference string
 *
 * @param ref - Reference string (e.g., "@user.displayName" or "@service.logging./logs")
 * @returns Parsed reference structure
 */
export declare function parseRef(ref: string): SymbiaRef;
/**
 * Check if a string contains Symbia references
 */
export declare function containsRefs(str: string): boolean;
/**
 * Extract all references from a string (both bare and interpolated)
 */
export declare function extractRefs(str: string): SymbiaRef[];
/**
 * Get a nested value from an object using dot notation and bracket accessors
 */
export declare function getNestedValue(obj: unknown, path: string | string[]): unknown;
/**
 * Resolve a reference against a context (sync only - no service calls)
 *
 * @param ref - Parsed reference or reference string
 * @param ctx - Resolution context
 * @returns Resolved value
 */
export declare function resolveRef(ref: SymbiaRef | string, ctx: ResolutionContext): ResolvedValue;
export declare function interpolate(template: string, ctx: ResolutionContext): string;
/**
 * Recursively interpolate all string values in an object
 */
export declare function interpolateObject<T extends Record<string, unknown>>(obj: T, ctx: ResolutionContext): T;
/**
 * Get metadata for all available namespaces
 */
export declare function getNamespaces(): NamespaceInfo[];
/**
 * Get autocomplete suggestions for a partial reference
 */
export declare function getRefSuggestions(partial: string, ctx?: ResolutionContext): Array<{
    value: string;
    description: string;
}>;
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
export declare function validateRef(ref: string): RefValidation;
/**
 * Validate all references in a template string
 */
export declare function validateTemplate(template: string): {
    valid: boolean;
    refs: RefValidation[];
    errors: string[];
};
//# sourceMappingURL=script.d.ts.map