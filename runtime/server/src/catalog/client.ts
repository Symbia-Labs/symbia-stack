/**
 * Minimal catalog client for the runtime.
 *
 * The runtime holds no reference to the catalog today — that missing edge is
 * what forced graphs to exist only once something POSTed them, and is the root
 * of defects D1–D4 (see docs/API-MEASUREMENTS.md). This is that edge.
 *
 * Deliberately a thin fetch wrapper rather than @symbia/catalog-client: the
 * runtime needs four calls, and adding a workspace dependency to get them
 * would couple the executor's build to the client's. Service-to-service auth
 * rides the same gated X-Service-Auth header the catalog enforces against
 * CATALOG_INTERNAL_SERVICE_TOKEN — the runtime authenticates as a principal,
 * not as a trusted network position.
 */
import { resolveServiceUrl, ServiceId } from '@symbia/sys';

export interface CatalogResource {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  type: string;
  status: string;
  orgId?: string | null;
  tags?: string[] | null;
  accessPolicy?: { visibility?: string; actions?: Record<string, unknown> } | null;
  metadata?: Record<string, unknown> | null;
  updatedAt?: string;
  createdAt?: string;
}

export interface CatalogClientOptions {
  endpoint?: string;
  serviceToken?: string;
  timeoutMs?: number;
}

export class CatalogUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'CatalogUnavailableError';
  }
}

export class RuntimeCatalogClient {
  private readonly endpoint: string;
  private readonly serviceToken: string;
  private readonly timeoutMs: number;

  constructor(opts: CatalogClientOptions = {}) {
    this.endpoint = (
      opts.endpoint ??
      process.env.CATALOG_ENDPOINT ??
      resolveServiceUrl(ServiceId.CATALOG)
    ).replace(/\/$/, '');
    // Falls back to the literal 'internal' only for local dev, mirroring the
    // catalog's own gate. In any deployment that sets the secret, this must be
    // the real credential or every write is refused with 403.
    this.serviceToken = opts.serviceToken ?? process.env.CATALOG_INTERNAL_SERVICE_TOKEN ?? 'internal';
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.CATALOG_TIMEOUT_MS ?? 10000);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.endpoint}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Auth': this.serviceToken,
          ...(init.headers ?? {}),
        },
      });
      const text = await res.text();
      const body = text ? JSON.parse(text) : undefined;
      if (!res.ok) {
        const err = new Error(
          `Catalog ${init.method ?? 'GET'} ${path} -> ${res.status}: ${
            (body as { error?: string })?.error ?? text
          }`
        );
        (err as Error & { status?: number }).status = res.status;
        throw err;
      }
      return body as T;
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || 'code' in error)) {
        throw new CatalogUnavailableError(
          `Catalog unreachable at ${this.endpoint} (${error.message})`,
          error
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * List resources of a type, paginating until exhausted.
   *
   * GET /api/resources returns a BARE ARRAY. The MCP wrapper over the same
   * endpoint returns {resources, total, has_more}, and assuming that envelope
   * here cost a full debug cycle: the parser silently produced [], the sync
   * concluded nothing was registered, and every create came back
   * "already exists". Both shapes are accepted so neither surface can break
   * this again, and pagination stops on a short page rather than trusting a
   * has_more flag the REST endpoint never sends.
   */
  async listResources(params: {
    type?: string;
    status?: string;
    limit?: number;
  } = {}): Promise<CatalogResource[]> {
    const pageSize = params.limit ?? 100;
    const out: CatalogResource[] = [];
    let offset = 0;
    for (;;) {
      const qs = new URLSearchParams();
      if (params.type) qs.set('type', params.type);
      if (params.status) qs.set('status', params.status);
      qs.set('limit', String(pageSize));
      qs.set('offset', String(offset));
      const page = await this.request<
        CatalogResource[] | { resources?: CatalogResource[]; has_more?: boolean }
      >(`/api/resources?${qs.toString()}`);

      const items = Array.isArray(page) ? page : page?.resources ?? [];
      out.push(...items);

      const more = Array.isArray(page) ? items.length === pageSize : Boolean(page?.has_more);
      if (!more || items.length === 0) break;
      offset += items.length;
    }
    return out;
  }

  async createResource(resource: {
    key: string;
    name: string;
    description?: string;
    type: string;
    status?: string;
    tags?: string[];
    accessPolicy?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<CatalogResource> {
    return this.request<CatalogResource>('/api/resources', {
      method: 'POST',
      body: JSON.stringify(resource),
    });
  }

  async updateResource(
    id: string,
    patch: Record<string, unknown>
  ): Promise<CatalogResource> {
    return this.request<CatalogResource>(`/api/resources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  async health(): Promise<boolean> {
    try {
      await this.request('/health');
      return true;
    } catch {
      return false;
    }
  }
}
