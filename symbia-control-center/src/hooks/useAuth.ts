import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useMessagingStore } from '@/stores/messagingStore';
import { usePlatformStore } from '@/stores/platformStore';
import { identityClient } from '@/services/identityClient';
import { disconnectSocket } from '@/services/messagingBridge';
import { telemetry } from '@/services/loggingClient';
import { DEBUG } from '@/config/debug';

export function useAuth() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    user,
    token,
    organizations,
    isAuthenticated,
    isLoading,
    setAuth,
    clearAuth,
    setLoading,
  } = useAuthStore();
  const { addEvent } = usePlatformStore();

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = useAuthStore.getState().token;

      // If we have a stored token, validate it
      if (storedToken) {
        try {
          const data = await identityClient.getMe(storedToken);
          if (data.type === 'user' && data.user) {
            setAuth(
              {
                id: data.user.id,
                email: data.user.email,
                name: data.user.name,
                isSuperAdmin: data.user.isSuperAdmin,
              },
              storedToken,
              data.user.organizations || data.organizations || []
            );
            return;
          }
        } catch {
          // Token invalid, continue to dev auto-login or clear
        }
      }

      // Dev mode: auto-login with dev credentials
      if (DEBUG) {
        try {
          console.log('[Auth] Dev mode: attempting auto-login...');
          const { user: userData, token: authToken } = await identityClient.login(
            'dev@example.com',
            'password123'
          );
          setAuth(
            {
              id: userData.id,
              email: userData.email,
              name: userData.name,
              isSuperAdmin: userData.isSuperAdmin,
            },
            authToken,
            userData.organizations || []
          );
          console.log('[Auth] Dev mode: auto-login successful');
          return;
        } catch (err) {
          console.log('[Auth] Dev mode: auto-login failed (identity service may not be ready)', err);
        }
      }

      clearAuth();
    };

    initAuth();
  }, [setAuth, clearAuth, setLoading]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const { user: userData, token: authToken } = await identityClient.login(
          email,
          password
        );
        setAuth(
          {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            isSuperAdmin: userData.isSuperAdmin,
          },
          authToken,
          userData.organizations || []
        );
        telemetry.event('auth.login', `User ${userData.email} logged in`, { userId: userData.id });
        addEvent({
          type: 'auth.login',
          source: 'identity',
          message: `${userData.name || userData.email} logged in`,
          data: { userId: userData.id },
        });
        navigate('/dashboard');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Login failed';
        setError(message);
        telemetry.error(`Login failed: ${message}`, { email });
        throw err;
      }
    },
    [setAuth, navigate]
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      setError(null);
      try {
        const { user: userData, token: authToken } = await identityClient.register(
          email,
          password,
          name
        );
        setAuth(
          {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            isSuperAdmin: userData.isSuperAdmin,
          },
          authToken,
          userData.organizations || []
        );
        telemetry.event('auth.register', `User ${userData.email} registered`, { userId: userData.id });
        navigate('/dashboard');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Registration failed';
        setError(message);
        telemetry.error(`Registration failed: ${message}`, { email });
        throw err;
      }
    },
    [setAuth, navigate]
  );

  const logout = useCallback(async () => {
    const currentUser = useAuthStore.getState().user;
    try {
      await identityClient.logout();
    } catch {
      // Ignore logout errors
    } finally {
      telemetry.event('auth.logout', `User ${currentUser?.email || 'unknown'} logged out`);
      addEvent({
        type: 'auth.logout',
        source: 'identity',
        message: `${currentUser?.name || currentUser?.email || 'User'} logged out`,
      });
      disconnectSocket();
      useMessagingStore.getState().reset();
      clearAuth();
      navigate('/login');
    }
  }, [clearAuth, navigate]);

  return {
    user,
    token,
    organizations,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
  };
}
