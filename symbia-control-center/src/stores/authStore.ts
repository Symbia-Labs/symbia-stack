import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  name: string;
  isSuperAdmin?: boolean;
  entitlements?: string[];
  roles?: string[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: 'admin' | 'member' | 'viewer';
}

/**
 * Network-specific permission constants
 * These match the entitlements defined in the Network Service
 */
export const NetworkPermissions = {
  TOPOLOGY_READ: 'cap:network.topology.read',
  EVENTS_READ: 'cap:network.events.read',
  TRACES_READ: 'cap:network.traces.read',
  POLICIES_READ: 'cap:network.policies.read',
  POLICIES_WRITE: 'cap:network.policies.write',
  CONTRACTS_WRITE: 'cap:network.contracts.write',
  NODES_ADMIN: 'cap:network.nodes.admin',
} as const;

export type NetworkPermission = (typeof NetworkPermissions)[keyof typeof NetworkPermissions];

/**
 * Check if a user has a specific network permission
 */
export function hasNetworkPermission(user: User | null, permission: NetworkPermission): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return user.entitlements?.includes(permission) ?? false;
}

/**
 * Get all network permissions for a user
 */
export function getUserNetworkPermissions(user: User | null): {
  canViewTopology: boolean;
  canViewEvents: boolean;
  canViewTraces: boolean;
  canViewPolicies: boolean;
  canWritePolicies: boolean;
  canWriteContracts: boolean;
  canAdminNodes: boolean;
} {
  return {
    canViewTopology: hasNetworkPermission(user, NetworkPermissions.TOPOLOGY_READ),
    canViewEvents: hasNetworkPermission(user, NetworkPermissions.EVENTS_READ),
    canViewTraces: hasNetworkPermission(user, NetworkPermissions.TRACES_READ),
    canViewPolicies: hasNetworkPermission(user, NetworkPermissions.POLICIES_READ),
    canWritePolicies: hasNetworkPermission(user, NetworkPermissions.POLICIES_WRITE),
    canWriteContracts: hasNetworkPermission(user, NetworkPermissions.CONTRACTS_WRITE),
    canAdminNodes: hasNetworkPermission(user, NetworkPermissions.NODES_ADMIN),
  };
}

interface AuthState {
  user: User | null;
  token: string | null;
  organizations: Organization[];
  isAuthenticated: boolean;
  isLoading: boolean;

  setAuth: (user: User, token: string, organizations: Organization[]) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  updateToken: (token: string) => void;
}

/**
 * VITE_DEV_NO_AUTH — pairs with identity's DEV_NO_AUTH.
 * When set, the login screen is skipped and requests go out without a token;
 * identity attaches them to the first existing user (loopback only).
 * Both halves must be enabled: the UI cannot bypass the service on its own.
 */
export const DEV_NO_AUTH = import.meta.env.VITE_DEV_NO_AUTH === 'true';

const devUser = {
  id: 'dev-no-auth',
  email: 'dev@localhost',
  name: 'Developer (login disabled)',
  isSuperAdmin: true,
} as never;

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      organizations: [],
      isAuthenticated: false,
      isLoading: true,

      setAuth: (user, token, organizations) =>
        set({
          user,
          token,
          organizations,
          isAuthenticated: true,
          isLoading: false,
        }),

      clearAuth: () =>
        set({
          user: null,
          token: null,
          organizations: [],
          isAuthenticated: false,
          isLoading: false,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      updateToken: (token) => set({ token }),
    }),
    {
      name: 'symbia-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
);
