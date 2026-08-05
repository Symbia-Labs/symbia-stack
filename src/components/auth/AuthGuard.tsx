import { useAuthStore } from '@/stores/authStore';

/**
 * AuthGuard — LOGIN DISABLED BUILD.
 *
 * Brian asked for logins off. Three previous attempts kept the login screen
 * reachable because each one only removed a *reason* to redirect there while
 * leaving the redirect itself in place. This removes the redirect.
 *
 * The guard never blocks rendering. The identity probe in App.tsx still runs
 * and populates the real user and orgs, but the UI does not wait on it and
 * never bounces to /login. Restore by reverting this file.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuthStore();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-scc-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-scc-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 text-sm">Initializing...</span>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
