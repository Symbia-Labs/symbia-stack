import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function RegisterForm() {
  const { register, error } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setValidationError(null);

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      await register(email, password, name);
    } catch {
      // Error is handled in useAuth
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = validationError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="name" className="scc-label">
          Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="scc-input"
          placeholder="Your name"
          required
          autoComplete="name"
          autoFocus
        />
      </div>

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
          placeholder="At least 8 characters"
          required
          autoComplete="new-password"
          minLength={8}
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="scc-label">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="scc-input"
          placeholder="Confirm your password"
          required
          autoComplete="new-password"
        />
      </div>

      {displayError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
          {displayError}
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
            Creating account...
          </>
        ) : (
          'Create Account'
        )}
      </button>

      <p className="text-center text-sm text-slate-400">
        Already have an account?{' '}
        <Link to="/login" className="scc-link">
          Sign in
        </Link>
      </p>
    </form>
  );
}
