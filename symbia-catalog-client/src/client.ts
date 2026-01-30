/**
 * @symbia/catalog-client - REST API Client
 *
 * Client for interacting with the Symbia Catalog Service REST API.
 * Used by services to fetch resources, graphs, contexts, integrations, and assistants.
 */

import type {
  CatalogClientConfig,
  RequestOptions,
  Resource,
  ResourceVersion,
  Artifact,
  Signature,
  Certification,
  CreateResourceParams,
  UpdateResourceParams,
  ListResourcesParams,
  SearchParams,
  BulkOperationParams,
  BootstrapSummary,
  CatalogStats,
  GraphResource,
  AssistantResource,
  ContextResource,
} from './types.js';

const DEFAULT_ENDPOINT = 'http://localhost:5003';
const DEFAULT_TIMEOUT = 30000;

export class CatalogClient {
  private endpoint: string;
  private token?: string;
  private apiKey?: string;
  private orgId?: string;
  private serviceId?: string;
  private env?: string;
  private timeout: number;
  private onError?: (error: Error) => void;

  constructor(config: CatalogClientConfig = {}) {
    const env = typeof process !== 'undefined' ? process.env : {};
    this.endpoint = (config.endpoint || env?.CATALOG_ENDPOINT || DEFAULT_ENDPOINT).replace(/\/$/, '');
    this.token = config.token || env?.CATALOG_SERVICE_TOKEN;
    this.apiKey = config.apiKey || env?.CATALOG_API_KEY;
    this.orgId = config.orgId || env?.CATALOG_ORG_ID;
    this.serviceId = config.serviceId || env?.SERVICE_ID;
    this.env = config.env || env?.NODE_ENV;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.onError = config.onError;
  }

  /**
   * Set authentication token
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Set API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Set default organization ID
   */
  setOrgId(orgId: string): void {
    this.orgId = orgId;
  }

  private getHeaders(options?: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const orgId = options?.orgId || this.orgId;
    if (orgId) {
      headers['X-Org-Id'] = orgId;
    }

    const serviceId = options?.serviceId || this.serviceId;
    if (serviceId) {
      headers['X-Service-Id'] = serviceId;
    }

    const env = options?.env || this.env;
    if (env) {
      headers['X-Env'] = env;
    }

    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${this.endpoint}${path}`;
    const headers = this.getHeaders(options);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: options?.signal || controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage: string;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorText;
        } catch {
          errorMessage = errorText;
        }
        const error = new Error(`Catalog API error: ${response.status} - ${errorMessage}`);
        this.onError?.(error);
        throw error;
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          const timeoutError = new Error(`Catalog API timeout after ${this.timeout}ms`);
          this.onError?.(timeoutError);
          throw timeoutError;
        }
        this.onError?.(error);
      }
      throw error;
    }
  }

  // ============================================
  // Bootstrap / Public Endpoints
  // ============================================

  /**
   * Get public bootstrap resources (no auth required)
   */
  async getBootstrap(options?: RequestOptions): Promise<Resource[]> {
    return this.request<Resource[]>('GET', '/api/bootstrap', undefined, options);
  }

  /**
   * Get bootstrap summary with categorization (no auth required)
   */
  async getBootstrapSummary(options?: RequestOptions): Promise<BootstrapSummary> {
    return this.request<BootstrapSummary>('GET', '/api/bootstrap/summary', undefined, options);
  }

  /**
   * Health check
   */
  async health(): Promise<{ status: string; timestamp: string }> {
    return this.request<{ status: string; timestamp: string }>('GET', '/health');
  }

  /**
   * Get service stats
   */
  async getStats(options?: RequestOptions): Promise<CatalogStats> {
    return this.request<CatalogStats>('GET', '/api/stats', undefined, options);
  }

  // ============================================
  // Generic Resource Operations
  // ============================================

  /**
   * List resources with optional filters
   */
  async listResources(params?: ListResourcesParams, options?: RequestOptions): Promise<Resource[]> {
    const searchParams = new URLSearchParams();

    if (params?.type) searchParams.set('type', params.type);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.orgId) searchParams.set('orgId', params.orgId);
    if (params?.isBootstrap !== undefined) searchParams.set('isBootstrap', String(params.isBootstrap));
    if (params?.tags?.length) searchParams.set('tags', params.tags.join(','));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request<Resource[]>('GET', `/api/resources${query}`, undefined, options);
  }

  /**
   * Get a single resource by ID
   */
  async getResource(id: string, options?: RequestOptions): Promise<Resource | null> {
    try {
      return await this.request<Resource>('GET', `/api/resources/${id}`, undefined, options);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get a resource by key
   */
  async getResourceByKey(key: string, options?: RequestOptions): Promise<Resource | null> {
    const resources = await this.listResources({ limit: 1 }, options);
    // The API filters by key via query params, but we'll search in results
    // since the endpoint doesn't expose key filtering directly
    const found = resources.find(r => r.key === key);
    return found || null;
  }

  /**
   * Create a new resource
   */
  async createResource(params: CreateResourceParams, options?: RequestOptions): Promise<Resource> {
    return this.request<Resource>('POST', '/api/resources', params, options);
  }

  /**
   * Update a resource
   */
  async updateResource(id: string, params: UpdateResourceParams, options?: RequestOptions): Promise<Resource> {
    return this.request<Resource>('PATCH', `/api/resources/${id}`, params, options);
  }

  /**
   * Delete a resource
   */
  async deleteResource(id: string, options?: RequestOptions): Promise<void> {
    await this.request<void>('DELETE', `/api/resources/${id}`, undefined, options);
  }

  /**
   * Publish a resource
   */
  async publishResource(id: string, changelog?: string, options?: RequestOptions): Promise<Resource> {
    return this.request<Resource>('POST', `/api/resources/${id}/publish`, { changelog }, options);
  }

  /**
   * Bulk operations on resources
   */
  async bulkOperation(params: BulkOperationParams, options?: RequestOptions): Promise<{ success: number; failed: number }> {
    return this.request<{ success: number; failed: number }>('POST', '/api/resources/bulk', params, options);
  }

  // ============================================
  // Resource Versions
  // ============================================

  /**
   * Get version history for a resource
   */
  async getVersions(resourceId: string, options?: RequestOptions): Promise<ResourceVersion[]> {
    return this.request<ResourceVersion[]>('GET', `/api/resources/${resourceId}/versions`, undefined, options);
  }

  // ============================================
  // Artifacts
  // ============================================

  /**
   * Get artifacts for a resource
   */
  async getArtifacts(resourceId: string, options?: RequestOptions): Promise<Artifact[]> {
    return this.request<Artifact[]>('GET', `/api/resources/${resourceId}/artifacts`, undefined, options);
  }

  /**
   * Download an artifact (returns URL or blob depending on implementation)
   */
  async downloadArtifact(artifactId: string, options?: RequestOptions): Promise<Blob> {
    const url = `${this.endpoint}/api/artifacts/${artifactId}/download`;
    const headers = this.getHeaders(options);
    delete headers['Content-Type']; // Let browser set for blob

    const response = await fetch(url, { headers, signal: options?.signal });
    if (!response.ok) {
      throw new Error(`Failed to download artifact: ${response.status}`);
    }
    return response.blob();
  }

  // ============================================
  // Signatures & Certifications
  // ============================================

  /**
   * Get signatures for a resource
   */
  async getSignatures(resourceId: string, options?: RequestOptions): Promise<Signature[]> {
    return this.request<Signature[]>('GET', `/api/resources/${resourceId}/signatures`, undefined, options);
  }

  /**
   * Get certifications for a resource
   */
  async getCertifications(resourceId: string, options?: RequestOptions): Promise<Certification[]> {
    return this.request<Certification[]>('GET', `/api/resources/${resourceId}/certifications`, undefined, options);
  }

  // ============================================
  // Search
  // ============================================

  /**
   * Search resources by keyword
   */
  async search(params: SearchParams, options?: RequestOptions): Promise<Resource[]> {
    return this.request<Resource[]>('POST', '/api/search', params, options);
  }

  /**
   * Natural language search
   */
  async nlSearch(params: SearchParams, options?: RequestOptions): Promise<Resource[]> {
    return this.request<Resource[]>('POST', '/api/nl/search', params, options);
  }

  // ============================================
  // Type-Specific: Graphs
  // ============================================

  /**
   * List all graphs
   */
  async listGraphs(params?: Omit<ListResourcesParams, 'type'>, options?: RequestOptions): Promise<GraphResource[]> {
    return this.listResources({ ...params, type: 'graph' }, options) as Promise<GraphResource[]>;
  }

  /**
   * Get a graph by ID
   */
  async getGraph(id: string, options?: RequestOptions): Promise<GraphResource | null> {
    try {
      const resource = await this.request<Resource>('GET', `/api/graphs/${id}`, undefined, options);
      return resource as GraphResource;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a graph
   */
  async createGraph(params: Omit<CreateResourceParams, 'type'>, options?: RequestOptions): Promise<GraphResource> {
    return this.request<GraphResource>('POST', '/api/graphs', { ...params, type: 'graph' }, options);
  }

  /**
   * Update a graph
   */
  async updateGraph(id: string, params: UpdateResourceParams, options?: RequestOptions): Promise<GraphResource> {
    return this.request<GraphResource>('PATCH', `/api/graphs/${id}`, params, options);
  }

  /**
   * Delete a graph
   */
  async deleteGraph(id: string, options?: RequestOptions): Promise<void> {
    await this.request<void>('DELETE', `/api/graphs/${id}`, undefined, options);
  }

  // ============================================
  // Type-Specific: Contexts
  // ============================================

  /**
   * List all contexts
   */
  async listContexts(params?: Omit<ListResourcesParams, 'type'>, options?: RequestOptions): Promise<ContextResource[]> {
    return this.listResources({ ...params, type: 'context' }, options) as Promise<ContextResource[]>;
  }

  /**
   * Get a context by ID
   */
  async getContext(id: string, options?: RequestOptions): Promise<ContextResource | null> {
    try {
      const resource = await this.request<Resource>('GET', `/api/contexts/${id}`, undefined, options);
      return resource as ContextResource;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a context
   */
  async createContext(params: Omit<CreateResourceParams, 'type'>, options?: RequestOptions): Promise<ContextResource> {
    return this.request<ContextResource>('POST', '/api/contexts', { ...params, type: 'context' }, options);
  }

  /**
   * Update a context
   */
  async updateContext(id: string, params: UpdateResourceParams, options?: RequestOptions): Promise<ContextResource> {
    return this.request<ContextResource>('PATCH', `/api/contexts/${id}`, params, options);
  }

  /**
   * Delete a context
   */
  async deleteContext(id: string, options?: RequestOptions): Promise<void> {
    await this.request<void>('DELETE', `/api/contexts/${id}`, undefined, options);
  }

  // ============================================
  // Type-Specific: Assistants
  // ============================================

  /**
   * List all assistants
   */
  async listAssistants(params?: Omit<ListResourcesParams, 'type'>, options?: RequestOptions): Promise<AssistantResource[]> {
    return this.listResources({ ...params, type: 'assistant' }, options) as Promise<AssistantResource[]>;
  }

  /**
   * Get an assistant by ID
   */
  async getAssistant(id: string, options?: RequestOptions): Promise<AssistantResource | null> {
    try {
      return await this.request<AssistantResource>('GET', `/api/resources/${id}`, undefined, options);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get published assistants (commonly used for assistant loader)
   */
  async getPublishedAssistants(options?: RequestOptions): Promise<AssistantResource[]> {
    return this.listResources({ type: 'assistant', status: 'published' }, options) as Promise<AssistantResource[]>;
  }

  /**
   * Create an assistant
   */
  async createAssistant(params: Omit<CreateResourceParams, 'type'>, options?: RequestOptions): Promise<AssistantResource> {
    return this.request<AssistantResource>('POST', '/api/resources', { ...params, type: 'assistant' }, options);
  }

  /**
   * Update an assistant
   */
  async updateAssistant(id: string, params: UpdateResourceParams, options?: RequestOptions): Promise<AssistantResource> {
    return this.request<AssistantResource>('PATCH', `/api/resources/${id}`, params, options);
  }
}

/**
 * Create a catalog client instance
 */
export function createCatalogClient(config?: CatalogClientConfig): CatalogClient {
  return new CatalogClient(config);
}
