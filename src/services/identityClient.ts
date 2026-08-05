import { endpoints } from '@/config/endpoints';
import { useAuthStore, type User, type Organization } from '@/stores/authStore';

export interface LoginResponse {
  user: User & { organizations?: Organization[] };
  token: string;
}

export interface RegisterResponse extends LoginResponse {}

export interface MeResponse {
  type: 'user' | 'agent';
  user?: User & { organizations?: Organization[] };
  agent?: { id: string; agentId: string; name: string };
  organizations?: Organization[];
}

// Credential types
export interface Credential {
  id: string;
  provider: string;
  name: string;
  isOrgWide: boolean;
  metadata?: {
    baseUrl?: string;
    [key: string]: unknown;
  };
  lastUsedAt?: string;
  createdAt: string;
}

export interface CreateCredentialRequest {
  provider: string;
  name: string;
  apiKey: string;
  isOrgWide?: boolean;
  metadata?: {
    baseUrl?: string;
    [key: string]: unknown;
  };
}

class IdentityClient {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await fetch(endpoints.identity.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Login failed' }));
      throw new Error(error.message || 'Login failed');
    }

    return response.json();
  }

  async register(
    email: string,
    password: string,
    name: string
  ): Promise<RegisterResponse> {
    const response = await fetch(endpoints.identity.register, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Registration failed' }));
      throw new Error(error.message || 'Registration failed');
    }

    return response.json();
  }

  async logout(): Promise<void> {
    await fetch(endpoints.identity.logout, {
      method: 'POST',
      credentials: 'include',
    });
  }

  async getMe(token: string): Promise<MeResponse> {
    const response = await fetch(endpoints.identity.me, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Not authenticated');
    }

    return response.json();
  }

  async refresh(token: string): Promise<{ token: string }> {
    const response = await fetch(endpoints.identity.refresh, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    return response.json();
  }

  // ===========================================================================
  // Credentials Management
  // ===========================================================================

  private getAuthHeaders(): Record<string, string> {
    const token = useAuthStore.getState().token;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * List all credentials for the current user (metadata only, no secrets)
   */
  async listCredentials(): Promise<Credential[]> {
    const response = await fetch(endpoints.identity.credentials, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to list credentials' }));
      throw new Error(error.message || 'Failed to list credentials');
    }

    return response.json();
  }

  /**
   * Create a new credential (store third-party API key)
   */
  async createCredential(data: CreateCredentialRequest): Promise<{ id: string; message: string }> {
    const response = await fetch(endpoints.identity.credentials, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to create credential' }));
      throw new Error(error.message || 'Failed to create credential');
    }

    return response.json();
  }

  /**
   * Delete a credential
   */
  async deleteCredential(id: string): Promise<void> {
    const response = await fetch(endpoints.identity.credential(id), {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to delete credential' }));
      throw new Error(error.message || 'Failed to delete credential');
    }
  }

  /**
   * Get credentials for a specific provider
   */
  async getCredentialForProvider(provider: string): Promise<Credential | null> {
    const credentials = await this.listCredentials();
    return credentials.find(c => c.provider === provider) || null;
  }
}

export const identityClient = new IdentityClient();
