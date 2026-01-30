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

interface CacheEntry {
  data: NamespaceData;
  expiresAt: number;
}

export class NamespaceClient {
  private cache = new Map<string, CacheEntry>();
  private options: Required<NamespaceClientOptions>;

  constructor(options: NamespaceClientOptions) {
    this.options = {
      services: options.services,
      cacheTTL: options.cacheTTL ?? 5 * 60 * 1000, // 5 minutes default
      debug: options.debug ?? false,
    };
  }

  /**
   * Fetch namespace data from a service
   */
  async fetch(namespace: string): Promise<NamespaceData | null> {
    // Check cache first
    const cached = this.cache.get(namespace);
    if (cached && Date.now() < cached.expiresAt) {
      if (this.options.debug) {
        console.log(`[NamespaceClient] Cache hit for ${namespace}`);
      }
      return cached.data;
    }

    // Determine service URL
    const serviceUrl = this.options.services[namespace as keyof typeof this.options.services];
    if (!serviceUrl) {
      if (this.options.debug) {
        console.warn(`[NamespaceClient] No service URL configured for ${namespace}`);
      }
      return null;
    }

    try {
      const url = `${serviceUrl}/symbia-namespace`;
      if (this.options.debug) {
        console.log(`[NamespaceClient] Fetching ${url}`);
      }

      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[NamespaceClient] Failed to fetch ${namespace}: ${response.status}`);
        return null;
      }

      const data = await response.json() as NamespaceData;

      // Cache the result
      this.cache.set(namespace, {
        data,
        expiresAt: Date.now() + this.options.cacheTTL,
      });

      if (this.options.debug) {
        console.log(`[NamespaceClient] Cached ${namespace} (${data.resources?.length || 0} resources)`);
      }

      return data;
    } catch (error) {
      console.error(`[NamespaceClient] Error fetching ${namespace}:`, error);
      return null;
    }
  }

  /**
   * Preload all configured namespaces
   */
  async preloadAll(): Promise<void> {
    const namespaces = Object.keys(this.options.services);
    if (this.options.debug) {
      console.log(`[NamespaceClient] Preloading ${namespaces.length} namespaces`);
    }
    await Promise.all(namespaces.map(ns => this.fetch(ns)));
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
    if (this.options.debug) {
      console.log(`[NamespaceClient] Cache cleared`);
    }
  }

  /**
   * Get all cached namespace names
   */
  getCachedNamespaces(): string[] {
    return Array.from(this.cache.keys());
  }
}

/**
 * Create a singleton namespace client for the current environment
 */
export function createNamespaceClient(): NamespaceClient {
  const services: NamespaceClientOptions['services'] = {};

  // Auto-detect service URLs from environment
  if (process.env.CATALOG_BASE_URL) {
    services.catalog = process.env.CATALOG_BASE_URL;
  }
  if (process.env.MESSAGING_BASE_URL) {
    services.messaging = process.env.MESSAGING_BASE_URL;
  }
  if (process.env.IDENTITY_BASE_URL) {
    services.identity = process.env.IDENTITY_BASE_URL;
  }
  if (process.env.LOGGING_BASE_URL) {
    services.logging = process.env.LOGGING_BASE_URL;
  }
  if (process.env.ASSISTANTS_BASE_URL) {
    services.assistants = process.env.ASSISTANTS_BASE_URL;
  }

  // Fallback to localhost defaults
  if (Object.keys(services).length === 0) {
    services.catalog = 'http://localhost:4001';
    services.messaging = 'http://localhost:3001';
    services.identity = 'http://localhost:3002';
    services.logging = 'http://localhost:3004';
    services.assistants = 'http://localhost:3005';
  }

  return new NamespaceClient({
    services,
    debug: process.env.DEBUG_NAMESPACE === 'true',
  });
}
