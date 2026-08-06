import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function LoginForm() {
  const { login, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch {
      // Error is handled in useAuth
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="email" className="scc-label">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="scc-input"
          placeholder="you@example.com"
          required
          autoComplete="email"
          autoFocus
        />
      </div>

      <div>
        <label htmlFor="password" className="scc-label">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="scc-input"
          placeholder="Enter your password"
          required
          autoComplete="current-password"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="scc-button w-full flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <div className="w-4 h-4 border-2 border-scc-primary border-t-transparent rounded-full animate-spin" />
            Signing in...
          </>
        ) : (
          'Sign In'
        )}
      </button>

      <p className="text-center text-sm text-slate-400">
        Don't have an account?{' '}
        <Link to="/register" className="scc-link">
          Create one
        </Link>
      </p>
    </form>
  );
}
