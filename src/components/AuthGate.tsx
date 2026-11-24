import { useState, type FormEvent } from 'react';
import { Lock, Moon, ShieldCheck, Sun } from 'lucide-react';
import { apiFetch, setAuthToken } from '../lib/api';
import type { UserProfile } from '../types';

interface AuthGateProps {
  hasAdmin: boolean;
  requiresPasscode: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onAuthenticated: (user: UserProfile) => void;
  onAdminClaimed: () => void;
}

export function AuthGate({
  hasAdmin,
  requiresPasscode,
  darkMode,
  onToggleDarkMode,
  onAuthenticated,
  onAdminClaimed,
}: AuthGateProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBootstrapSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/bootstrap-admin', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, passcode }),
      });
      setAuthToken(res.token);
      onAdminClaimed();
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to claim Super Admin account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (!['qa_moderator', 'content_editor', 'administrator', 'super_admin'].includes(res.user.role)) {
        setError('This account is a mobile user account and does not have Admin Studio permissions.');
        setSubmitting(false);
        return;
      }
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-50 px-4 py-8 dark:bg-[#0B1115]">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <div className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Minaratul Huda
        </div>
        <button
          type="button"
          onClick={onToggleDarkMode}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-[#11191E] dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          {darkMode ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>

      <div className="mx-auto my-12 w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-[#11191E]">
        <div className="mb-6">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-[#0F4C3A]/10 text-[#0F4C3A] dark:bg-emerald-950/60 dark:text-emerald-400">
            {hasAdmin ? <Lock className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {hasAdmin ? 'Admin & Content Studio' : 'Claim Super Admin Access'}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {hasAdmin
              ? 'Sign in with your administrator, editor, or moderator credentials to manage Minaratul Huda content and mobile APIs.'
              : 'Initialize the Minaratul Huda Content Studio by creating the first Super Admin account. No default accounts or sample content are pre-seeded.'}
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={hasAdmin ? handleLoginSubmit : handleBootstrapSubmit} className="space-y-4">
          {!hasAdmin && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sheikh / Administrator Name"
                className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] focus:ring-2 focus:ring-[#0F4C3A]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Email Address
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@minaratulhuda.org"
              className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] focus:ring-2 focus:ring-[#0F4C3A]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Password
            </label>
            <input
              type="password"
              required
              minLength={hasAdmin ? 1 : 8}
              autoComplete={hasAdmin ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={hasAdmin ? 'Enter your password' : 'Minimum 8 characters'}
              className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] focus:ring-2 focus:ring-[#0F4C3A]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {!hasAdmin && requiresPasscode && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Bootstrap Administrator Passcode
              </label>
              <input
                type="password"
                required
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter BOOTSTRAP_ADMIN_PASSCODE"
                className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] focus:ring-2 focus:ring-[#0F4C3A]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-md bg-[#0F4C3A] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0B3A2C] disabled:opacity-50"
          >
            {submitting
              ? hasAdmin
                ? 'Signing in…'
                : 'Creating Super Admin…'
              : hasAdmin
                ? 'Sign In to Studio'
                : 'Claim Super Admin Account'}
          </button>
        </form>
      </div>

      <footer className="mx-auto w-full max-w-5xl text-center text-xs text-slate-500 dark:text-slate-500">
        Minaratul Huda · Dedicated Content API, Media Storage & Administration Portal
      </footer>
    </div>
  );
}
