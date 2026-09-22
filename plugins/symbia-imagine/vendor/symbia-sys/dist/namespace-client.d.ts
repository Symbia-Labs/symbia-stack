/**
 * Symbia Namespace Client
 *
 * Fetches and caches namespace data from services.
 * Design mode: Local cache (sync)
 * Operate mode: Async fetch / WebSocket subscriptions
 */
export interface NamespaceData {
    namespace: string;
    version: string;
    description?: string;
    properties?: Record<string, {
        type: string;
        description?: string;
    }>;
    resources?: any[];
}
export interface NamespaceClientOptions {
    /** Service base URLs */
    services: {
        catalog?: string;
        messaging?: string;
        identity?: string;
        logging?: string;
        assistants?: string;
    };
    /** Cache TTL in milliseconds */
    cacheTTL?: number;
    /** Enable debug logging */
    debug?: boolean;
}
export declare class NamespaceClient {
    private cache;
    private options;
    constructor(options: NamespaceClientOptions);
    /**
     * Fetch namespace data from a service
     */
    fetch(namespace: string): Promise<NamespaceData | null>;
    /**
     * Preload all configured namespaces
     */
    preloadAll(): Promise<void>;
    /**
     * Clear all cached data
     */
    clearCache(): void;
    /**
     * Get all cached namespace names
     */
    getCachedNamespaces(): string[];
}
/**
 * Create a singleton namespace client for the current environment
 */
export declare function createNamespaceClient(): NamespaceClient;
//# sourceMappingURL=namespace-client.d.ts.map