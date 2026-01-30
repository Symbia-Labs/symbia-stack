import { getServiceEndpoint, getCurrentContext, type ServiceKey } from './config.js';
import { getAuthHeaders, refreshTokenIfNeeded } from './auth.js';

export type { ServiceKey };

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  service: ServiceKey;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Make an authenticated request to a Symbia service
 */
export async function request<T = unknown>(
  serviceOrOptions: ServiceKey | RequestOptions,
  pathArg?: string,
  optionsArg: Omit<RequestOptions, 'service' | 'path'> = {}
): Promise<ApiResponse<T>> {
  // Support both calling conventions:
  // request({ service, path, method }) - object style
  // request('SERVICE', '/path', { method }) - positional style
  let service: ServiceKey;
  let path: string;
  let options: Omit<RequestOptions, 'service' | 'path'>;

  if (typeof serviceOrOptions === 'object') {
    service = serviceOrOptions.service;
    path = serviceOrOptions.path;
    options = serviceOrOptions;
  } else {
    service = serviceOrOptions;
    path = pathArg!;
    options = optionsArg;
  }
  // Refresh token if needed
  const tokenValid = await refreshTokenIfNeeded();
  if (!tokenValid) {
    return {
      ok: false,
      status: 401,
      error: 'Authentication required. Run: symbia auth login',
    };
  }

  const endpoint = getServiceEndpoint(service);
  const context = getCurrentContext();

  // Build URL with query params
  let url = `${endpoint}${path}`;
  if (options.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...options.headers,
  };

  // Add org header if set in context
  if (context.org) {
    headers['X-Org-Id'] = context.org;
  }

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return {
        ok: false,
        status: res.status,
        error: errorData.message || errorData.error || `Request failed with status ${res.status}`,
      };
    }

    // Handle empty responses
    const text = await res.text();
    if (!text) {
      return { ok: true, status: res.status };
    }

    try {
      const data = JSON.parse(text) as T;
      return { ok: true, status: res.status, data };
    } catch {
      return { ok: true, status: res.status };
    }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

/**
 * Service-specific request helpers
 */
export const identity = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>('IDENTITY', path, { params }),
  post: <T>(path: string, body?: unknown) =>
    request<T>('IDENTITY', path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) =>
    request<T>('IDENTITY', path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>('IDENTITY', path, { method: 'PATCH', body }),
  delete: <T>(path: string) =>
    request<T>('IDENTITY', path, { method: 'DELETE' }),
};

export const catalog = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>('CATALOG', path, { params }),
  post: <T>(path: string, body?: unknown) =>
    request<T>('CATALOG', path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) =>
    request<T>('CATALOG', path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>('CATALOG', path, { method: 'PATCH', body }),
  delete: <T>(path: string) =>
    request<T>('CATALOG', path, { method: 'DELETE' }),
};

export const logging = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>('LOGGING', path, { params }),
  post: <T>(path: string, body?: unknown) =>
    request<T>('LOGGING', path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) =>
    request<T>('LOGGING', path, { method: 'PUT', body }),
  delete: <T>(path: string) =>
    request<T>('LOGGING', path, { method: 'DELETE' }),
};

export const messaging = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>('MESSAGING', path, { params }),
  post: <T>(path: string, body?: unknown) =>
    request<T>('MESSAGING', path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>('MESSAGING', path, { method: 'PATCH', body }),
  delete: <T>(path: string) =>
    request<T>('MESSAGING', path, { method: 'DELETE' }),
};

export const assistants = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>('ASSISTANTS', path, { params }),
  post: <T>(path: string, body?: unknown) =>
    request<T>('ASSISTANTS', path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) =>
    request<T>('ASSISTANTS', path, { method: 'PUT', body }),
  delete: <T>(path: string) =>
    request<T>('ASSISTANTS', path, { method: 'DELETE' }),
};

export const network = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>('NETWORK', path, { params }),
  post: <T>(path: string, body?: unknown) =>
    request<T>('NETWORK', path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) =>
    request<T>('NETWORK', path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>('NETWORK', path, { method: 'PATCH', body }),
  delete: <T>(path: string) =>
    request<T>('NETWORK', path, { method: 'DELETE' }),
};

export const server = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>('SERVER', path, { params }),
  post: <T>(path: string, body?: unknown) =>
    request<T>('SERVER', path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) =>
    request<T>('SERVER', path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>('SERVER', path, { method: 'PATCH', body }),
  delete: <T>(path: string) =>
    request<T>('SERVER', path, { method: 'DELETE' }),
};
