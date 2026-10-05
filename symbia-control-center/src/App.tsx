import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardPage, PANEL_IDS } from '@/pages/DashboardPage';
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
      //
      // This is the pattern the whole rebuild generalises: the page cannot
      // know what environment it is in, so it does not guess. It asks.
      try {
        const res = await fetch('/svc/identity/api/auth/me');
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
              // Use the token identity issued, if it issued one.
              //
              // This used to be hardcoded to ''. The console therefore knew who
              // it was and held nothing to prove it, so identity answered while
              // messaging, catalog and runtime all returned 401 — measured
              // 6 Aug 2026. A console that renders logged-in with empty panels
              // is the confident-zero failure exactly.
              data.token || '',
              data.user.organizations || data.organizations || []
            );
            console.warn(
              '[Auth] login disabled by the identity service — running as',
              data.user.email,
              data.token ? '(token issued by DEV_NO_AUTH)' : '(NO TOKEN — other services will reject)'
            );
            return;
          }
        }
      } catch (err) {
        console.log('[Auth] no-auth probe failed; falling through to login', err);
      }

      // REMOVED 6 Aug 2026: a dev-mode auto-login with hardcoded credentials
      // (dev@example.com / password123), gated on import.meta.env.DEV.
      //
      // It is deliberately not re-gated on ?debug. It was behaviour, not
      // logging, and it was the same mistake as everything else this rebuild
      // removes: the page guessing what environment it was in and then acting
      // on the guess. The untokened probe above already covers the legitimate
      // case — if login is disabled, identity says so and we believe it. If
      // identity requires a token, the login screen is the correct answer, in
      // development as much as anywhere else.
      //
      // Consequence to expect rather than discover: a developer who relied on
      // landing already logged in now sees the login form.
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
          {PANEL_IDS.map(
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
