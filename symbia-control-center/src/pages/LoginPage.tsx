import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { LoginForm } from '@/components/auth/LoginForm';

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-scc-surface flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-scc-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-scc-surface flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-scc-primary text-glow mb-2">
            SYMBIA
          </h1>
          <p className="text-slate-400 text-sm">
            Symbia Control Center
          </p>
        </div>

        {/* Login Card */}
        <div className="scc-card p-6">
          <h2 className="text-xl font-semibold text-slate-100 mb-6">
            Sign In
          </h2>
          <LoginForm />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-8">
          Symbia Platform v1.0
        </p>
      </div>
    </div>
  );
}
