import { useAuthStore } from '@/stores/authStore';
import { useAuth } from '@/hooks/useAuth';
import { OrgSwitcher } from '@/components/org/OrgSwitcher';

export function Header() {
  const { user } = useAuthStore();
  const { logout } = useAuth();

  return (
    <header className="h-header bg-surface-raised border-b border-border px-4 flex items-center justify-between">
      {/* Left: Title / Breadcrumb */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-primary-500">
          Command Center
        </h1>
      </div>

      {/* Right: Org Switcher + User Menu */}
      <div className="flex items-center gap-4">
        <OrgSwitcher />

        {/* User Menu */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium text-text-primary">
              {user?.name || 'User'}
            </div>
            <div className="text-xs text-text-muted">
              {user?.email}
            </div>
          </div>

          <button
            onClick={logout}
            className="btn-ghost text-sm px-3 py-1.5"
            title="Sign out"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
