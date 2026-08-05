/**
 * Assistants Service Client
 *
 * Provides full CRUD operations for prompt graphs, actors, and run management.
 */
import { useAuthStore } from '@/stores/authStore';
import { useOrgStore } from '@/stores/orgStore';
import { getServiceUrl } from '@/config/services';

// =============================================================================
// Types
// =============================================================================

export interface Graph {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  graphJson: Record<string, unknown>;
  triggerConditions?: Record<string, unknown>;
  logLevel?: string;
  publishedVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Actor {
  id: string;
  orgId: string;
  principalId: string;
  name: string;
  defaultGraphId?: string;
  capabilities: string[];
  webhooks?: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RunStatus = 'running' | 'paused' | 'waiting' | 'completed' | 'failed' | 'cancelled';

export interface Run {
  id: string;
  orgId: string;
  graphId: string;
  conversationId?: string;
  status: RunStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface RunLog {
  id: string;
  runId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  nodeId?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface CreateGraphParams {
  name: string;
  description?: string;
  graphJson: Record<string, unknown>;
  triggerConditions?: Record<string, unknown>;
  logLevel?: string;
}

export interface UpdateGraphParams {
  name?: string;
  description?: string;
  graphJson?: Record<string, unknown>;
  triggerConditions?: Record<string, unknown>;
  logLevel?: string;
}

export interface CreateActorParams {
  principalId: string;
  name: string;
  defaultGraphId?: string;
  capabilities?: string[];
  webhooks?: Record<string, unknown>;
}

export interface UpdateActorParams {
  name?: string;
  defaultGraphId?: string;
  capabilities?: string[];
  webhooks?: Record<string, unknown>;
  isActive?: boolean;
}

// =============================================================================
// Client
// =============================================================================

class AssistantsClient {
  private getHeaders(): Record<string, string> {
    const token = useAuthStore.getState().token;
    const orgId = useOrgStore.getState().currentOrgId;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (orgId) {
      headers['X-Org-Id'] = orgId;
    }

    return headers;
  }

  private getOrgId(): string {
    const orgId = useOrgStore.getState().currentOrgId;
    if (!orgId) {
      throw new Error('Organization ID is required');
    }
    return orgId;
  }

  private getBaseUrl(): string {
    // In development, use Vite proxy to avoid CORS issues
    // Proxy rewrites /api/assistants/* to http://localhost:5004/api/*
    if (import.meta.env.DEV) {
      return '/api/assistants';
    }
    return `${getServiceUrl('assistants')}/api`;
  }

  // ===========================================================================
  // Graphs
  // ===========================================================================

  async listGraphs(): Promise<Graph[]> {
    const orgId = this.getOrgId();
    const response = await fetch(`${this.getBaseUrl()}/graphs?orgId=${orgId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to list graphs' }));
      throw new Error(error.message || error.error);
    }

    const data = await response.json();
    return data.graphs || data || [];
  }

  async getGraph(id: string): Promise<Graph> {
    const orgId = this.getOrgId();
    const response = await fetch(`${this.getBaseUrl()}/graphs/${id}?orgId=${orgId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get graph' }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  async createGraph(params: CreateGraphParams): Promise<Graph> {
    const orgId = this.getOrgId();
    const response = await fetch(`${this.getBaseUrl()}/graphs`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ ...params, orgId }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to create graph' }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  async updateGraph(id: string, params: UpdateGraphParams): Promise<Graph> {
    const orgId = this.getOrgId();
    const response = await fetch(`${this.getBaseUrl()}/graphs/${id}?orgId=${orgId}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to update graph' }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  async deleteGraph(id: string): Promise<void> {
    const orgId = this.getOrgId();
    const response = await fetch(`${this.getBaseUrl()}/graphs/${id}?orgId=${orgId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to delete graph' }));
      throw new Error(error.message || error.error);
    }
  }

  async publishGraph(id: string): Promise<Graph> {
    const orgId = this.getOrgId();
    const response = await fetch(`${this.getBaseUrl()}/graphs/${id}/publish?orgId=${orgId}`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to publish graph' }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  // ===========================================================================
  // Actors
  // ===========================================================================

  async listActors(): Promise<Actor[]> {
    const orgId = this.getOrgId();
    const response = await fetch(`${this.getBaseUrl()}/actors?orgId=${orgId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to list actors' }));
      throw new Error(error.message || error.error);
    }

    const data = await response.json();
    return data.actors || data || [];
  }

  async getActor(id: string): Promise<Actor> {
    const orgId = this.getOrgId();
    const response = await fetch(`${this.getBaseUrl()}/actors/${id}?orgId=${orgId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get actor' }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  async createActor(params: CreateActorParams): Promise<Actor> {
    const orgId = this.getOrgId();
    const response = await fetch(`${this.getBaseUrl()}/actors`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ ...params, orgId }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to create actor' }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  async updateActor(id: string, params: UpdateActorParams): Promise<Actor> {
    const orgId = this.getOrgId();
    const response = await fetch(`${this.getBaseUrl()}/actors/${id}?orgId=${orgId}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to update actor' }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  async deleteActor(id: string): Promise<void> {
    const orgId = this.getOrgId();
    const response = await fetch(`${this.getBaseUrl()}/actors/${id}?orgId=${orgId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to delete actor' }));
      throw new Error(error.message || error.error);
    }
  }

  // ===========================================================================
  // Runs
  // ===========================================================================

  async listRuns(options?: {
    graphId?: string;
    conversationId?: string;
    status?: RunStatus;
  }): Promise<Run[]> {
    const orgId = this.getOrgId();
    const params = new URLSearchParams({ orgId });

    if (options?.graphId) params.set('graphId', options.graphId);
    if (options?.conversationId) params.set('conversationId', options.conversationId);
    if (options?.status) params.set('status', options.status);

    const response = await fetch(`${this.getBaseUrl()}/runs?${params}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to list runs' }));
      throw new Error(error.message || error.error);
    }

    const data = await response.json();
    return data.runs || data || [];
  }

  async getRun(id: string): Promise<Run> {
    const orgId = this.getOrgId();
    const response = await fetch(`${this.getBaseUrl()}/runs/${id}?orgId=${orgId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get run' }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  async getRunLogs(id: string, level?: string): Promise<RunLog[]> {
    const orgId = this.getOrgId();
    const params = new URLSearchParams({ orgId });
    if (level) params.set('level', level);

    const response = await fetch(`${this.getBaseUrl()}/runs/${id}/logs?${params}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get run logs' }));
      throw new Error(error.message || error.error);
    }

    const data = await response.json();
    return data.logs || data || [];
  }

  async getGraphRuns(graphId: string): Promise<Run[]> {
    const orgId = this.getOrgId();
    const response = await fetch(`${this.getBaseUrl()}/graphs/${graphId}/runs?orgId=${orgId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get graph runs' }));
      throw new Error(error.message || error.error);
    }

    const data = await response.json();
    return data.runs || data || [];
  }

  // ===========================================================================
  // Assistants (with aliases for @mentions)
  // ===========================================================================

  /**
   * List all loaded assistants with their @mention aliases
   */
  async listAssistants(): Promise<Array<{
    key: string;
    name: string;
    alias?: string;
    principalId: string;
    description: string;
    status: string;
    tags: string[];
    capabilities: string[];
    hasHandler: boolean;
    hasRules: boolean;
    rulesCount: number;
  }>> {
    const response = await fetch(`${this.getBaseUrl()}/assistants`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to list assistants' }));
      throw new Error(error.message || error.error);
    }

    const data = await response.json();
    return data.assistants || [];
  }

  /**
   * Get mentionable assistants for @mention autocomplete
   */
  async getMentionable(): Promise<Array<{
    alias: string;
    name: string;
    principalId: string;
    key: string;
  }>> {
    const response = await fetch(`${this.getBaseUrl()}/assistants/mentionable`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get mentionable assistants' }));
      throw new Error(error.message || error.error);
    }

    const data = await response.json();
    return data.mentionable || [];
  }

  // ===========================================================================
  // Service Status
  // ===========================================================================

  async getStatus(): Promise<{ status: string; database?: string }> {
    const response = await fetch(`${this.getBaseUrl()}/status`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get service status');
    }

    return response.json();
  }
}

export const assistantsClient = new AssistantsClient();
