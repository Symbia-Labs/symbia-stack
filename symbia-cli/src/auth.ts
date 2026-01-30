import { getServiceEndpoint, loadCredentials, saveCredentials, clearCredentials, getToken, getApiKey } from './config.js';

export interface AuthState {
  authenticated: boolean;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  org?: string;
  expiresAt?: number;
}

/**
 * Check current authentication state
 */
export async function checkAuth(): Promise<AuthState> {
  const token = getToken();
  const apiKey = getApiKey();

  if (!token && !apiKey) {
    return { authenticated: false };
  }

  try {
    const endpoint = getServiceEndpoint('IDENTITY');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const res = await fetch(`${endpoint}/api/users/me`, { headers });

    if (!res.ok) {
      return { authenticated: false };
    }

    const user = await res.json();
    const creds = loadCredentials();

    return {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      expiresAt: creds.expiresAt,
    };
  } catch {
    return { authenticated: false };
  }
}

/**
 * Login with email and password
 */
export async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const endpoint = getServiceEndpoint('IDENTITY');
    const res = await fetch(`${endpoint}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Login failed' }));
      return { success: false, error: error.message || 'Login failed' };
    }

    const data = await res.json();

    // Save credentials
    saveCredentials({
      token: data.token,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days default
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Login failed' };
  }
}

/**
 * Login with API key
 */
export async function loginWithApiKey(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const endpoint = getServiceEndpoint('IDENTITY');
    const res = await fetch(`${endpoint}/api/auth/verify-api-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
    });

    if (!res.ok) {
      return { success: false, error: 'Invalid API key' };
    }

    saveCredentials({ apiKey });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'API key verification failed' };
  }
}

/**
 * Logout - clear credentials
 */
export function logout(): void {
  clearCredentials();
}

/**
 * Refresh token if needed
 */
export async function refreshTokenIfNeeded(): Promise<boolean> {
  const creds = loadCredentials();

  // If using API key, no refresh needed
  if (creds.apiKey) {
    return true;
  }

  // Check if token needs refresh (within 5 minutes of expiry)
  if (!creds.expiresAt || Date.now() < creds.expiresAt - 5 * 60 * 1000) {
    return true; // Token still valid
  }

  if (!creds.refreshToken) {
    return false; // Can't refresh
  }

  try {
    const endpoint = getServiceEndpoint('IDENTITY');
    const res = await fetch(`${endpoint}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: creds.refreshToken }),
    });

    if (!res.ok) {
      return false;
    }

    const data = await res.json();
    saveCredentials({
      ...creds,
      token: data.token,
      expiresAt: data.expiresAt,
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Get authorization headers for API requests
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  const apiKey = getApiKey();

  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }

  if (apiKey) {
    return { 'X-API-Key': apiKey };
  }

  return {};
}
