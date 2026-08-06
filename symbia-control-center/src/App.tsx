import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { CommandPalette } from '@/components/command/CommandPalette';
import { useAuthStore } from '@/stores/authStore';
import { identityClient } from '@/services/identityClient';

// Initialize auth state on app mount (before AuthGuard checks)
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { setAuth, clearAuth, setLoading } = useAuthStore();

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
                entitlements: data.user.entitlements || [],
                roles: data.user.roles || [],
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

      // No-auth environments: if the identity service will answer an
      // UNTOKENED request, then login is disabled and we simply adopt whoever
      // it says we are. Deliberately NOT gated on a client env var — the
      // previous version was, and debugging "did VITE_DEV_NO_AUTH reach the
      // bundle?" wasted the whole loop. Ask the service; believe the answer.
      try {
        const res = await fetch('/api/identity/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data?.user) {
            setAuth(
              {
                id: data.user.id,
                email: data.user.email,
                name: data.user.name,
                isSuperAdmin: data.user.isSuperAdmin,
                entitlements: data.user.entitlements || [],
                roles: data.user.roles || [],
              },
              '',
              data.user.organizations || data.organizations || []
            );
            console.warn('[Auth] login disabled by the identity service — running as', data.user.email);
            return;
          }
        }
      } catch (err) {
        console.log('[Auth] no-auth probe failed; falling through to login', err);
      }

      // Dev mode: auto-login with dev credentials
      if (import.meta.env.DEV) {
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
              entitlements: userData.entitlements || [],
              roles: userData.roles || [],
            },
            authToken,
            userData.organizations || []
          );
          console.log('[Auth] Dev mode: auto-login successful', {
            entitlements: userData.entitlements?.length || 0,
          });
          return;
        } catch (err) {
          console.log('[Auth] Dev mode: auto-login failed (identity service may not be ready)', err);
        }
      }

      // Login is disabled: never clear to a logged-out state, just stop loading.
      setLoading(false);
    };

    initAuth();
  }, [setAuth, clearAuth, setLoading]);

  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthInitializer>
        {/* Global Command Palette (Cmd+K) */}
        <CommandPalette />

        <Routes>
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          <Route path="/register" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard/*"
            element={
              <AuthGuard>
                <DashboardPage />
              </AuthGuard>
            }
          />
          {/*
            C5 (MVP gate) — SYMBIA_MARKER_C5_DEEPLINK_20260805.
            Each panel gets a real top-level route. Previously only
            /dashboard/* existed and the catch-all below swallowed
            /integrations, /chat, /assistants … into a redirect, so no view
            was linkable and the address bar never tracked navigation.
          */}
          {['overview', 'network', 'assistants', 'integrations', 'energy', 'logs', 'chat'].map(
            (panel) => (
              <Route
                key={panel}
                path={`/${panel}`}
                element={
                  <AuthGuard>
                    <DashboardPage />
                  </AuthGuard>
                }
              />
            )
          )}
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </AuthInitializer>
    </BrowserRouter>
  );
}
