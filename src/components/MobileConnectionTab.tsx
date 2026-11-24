import { useEffect, useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Copy, Globe, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ConnectionInfo, UserProfile } from '../types';

interface MobileConnectionTabProps {
  currentUser: UserProfile;
}

const API_ENDPOINTS_REFERENCE = [
  ['GET', '/api/content', 'Public catalog feed with pagination, category, series, media & sort'],
  ['GET', '/api/content/:id', 'Single published content item detail'],
  ['POST', '/api/content/:id/track', 'Track play or download counts ({ action: "play" | "download" })'],
  ['GET', '/api/search', 'Full-text search grouped by categorySlug'],
  ['GET', '/api/categories', 'Active categories taxonomy (6 core + custom)'],
  ['GET', '/api/series', 'Published lecture series list'],
  ['GET', '/api/notifications', 'Broadcasted mobile notifications feed'],
  ['GET', '/api/media/:bucket/:filename', 'HTTP Range (206 Partial Content) audio/document/cover stream'],
  ['POST', '/api/auth/register & /login', 'Mobile user registration, login & bearer token issuance'],
  ['POST', '/api/qa/submit & GET /api/user/qa', 'Submit questions and inspect user answers'],
  ['GET/POST/DELETE', '/api/user/favorites', 'User bookmarks synchronized across devices'],
  ['GET/POST', '/api/user/history', 'Listening & reading progress sync'],
];

export function MobileConnectionTab({ currentUser }: MobileConnectionTabProps) {
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [newOrigin, setNewOrigin] = useState('');
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canEditCors = currentUser.role === 'administrator' || currentUser.role === 'super_admin';

  const loadInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ConnectionInfo>('/api/admin/connection');
      setInfo(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connection settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInfo();
  }, []);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setError('Clipboard access was blocked by the browser. Please copy the URL manually.');
    }
  };

  const updateCustomOrigins = async (nextList: string[]) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ customOrigins: string[]; activeOrigins: string[] }>(
        '/api/admin/connection',
        {
          method: 'PATCH',
          body: JSON.stringify({ customOrigins: nextList }),
        }
      );
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              customOrigins: res.customOrigins,
              activeOrigins: res.activeOrigins,
            }
          : prev
      );
      setNotice('CORS allowlist updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update CORS origins');
    } finally {
      setSaving(false);
    }
  };

  const handleAddOrigin = async (e: FormEvent) => {
    e.preventDefault();
    if (!info || !newOrigin.trim()) return;
    await updateCustomOrigins([...info.customOrigins, newOrigin.trim()]);
    setNewOrigin('');
  };

  const handleRemoveOrigin = async (originToRemove: string) => {
    if (!info) return;
    await updateCustomOrigins(info.customOrigins.filter((o) => o !== originToRemove));
  };

  if (loading && !info) {
    return (
      <div className="space-y-4">
        <div className="h-36 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#11191E]" />
        <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#11191E]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {notice}
          </span>
          <button type="button" onClick={() => setNotice(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {info && (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#11191E]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Active Public API Base URL
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Paste this URL into the standalone Minaratul Huda Mobile App Settings or set it as{' '}
                  <code className="font-mono text-slate-700 dark:text-slate-300">VITE_API_BASE_URL</code>.
                </p>
              </div>
              <Globe className="h-5 w-5 shrink-0 text-[#0F4C3A] dark:text-emerald-400" />
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                {info.apiBaseUrl}
              </div>
              <button
                type="button"
                onClick={() => copyText('apiUrl', info.apiBaseUrl)}
                className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#0F4C3A] px-4 py-2.5 text-xs font-medium text-white hover:bg-[#0B3A2C]"
              >
                {copiedKey === 'apiUrl' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedKey === 'apiUrl' ? 'Copied URL' : 'Copy API URL'}
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50/70 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-900/50">
              <code className="overflow-x-auto font-mono text-xs text-slate-700 dark:text-slate-300">
                VITE_API_BASE_URL=&quot;{info.apiBaseUrl}&quot;
              </code>
              <button
                type="button"
                onClick={() => copyText('envLine', `VITE_API_BASE_URL="${info.apiBaseUrl}"`)}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#0F4C3A] hover:underline dark:text-emerald-400"
              >
                {copiedKey === 'envLine' ? 'Copied' : 'Copy Env'}
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#11191E]">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              CORS Allowlist (Mobile App Origins)
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Strict explicit origin matching with <code className="font-mono">Vary: Origin</code> and preflight verification (wildcard <code className="font-mono">*</code> disabled).
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Built-in & Environment Origins
                </p>
                <div className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {Array.from(new Set([...info.defaultOrigins, ...info.envOrigins])).map((origin) => (
                    <div
                      key={origin}
                      className="flex items-center justify-between px-3.5 py-2 font-mono text-xs text-slate-700 dark:text-slate-300"
                    >
                      <span className="truncate">{origin}</span>
                      <span className="ml-3 shrink-0 font-sans text-slate-400">System Allowlisted</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Custom Mobile App Origins
                </p>
                {info.customOrigins.length === 0 ? (
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    No additional custom origins saved yet.
                  </p>
                ) : (
                  <div className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {info.customOrigins.map((origin) => (
                      <div
                        key={origin}
                        className="flex items-center justify-between px-3.5 py-2 font-mono text-xs text-slate-800 dark:text-slate-200"
                      >
                        <span className="truncate">{origin}</span>
                        {canEditCors && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleRemoveOrigin(origin)}
                            className="ml-3 inline-flex shrink-0 items-center gap-1 font-sans text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {canEditCors && (
                  <form onSubmit={handleAddOrigin} className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="url"
                      required
                      value={newOrigin}
                      onChange={(e) => setNewOrigin(e.target.value)}
                      placeholder="https://your-mobile-app-domain.run.app"
                      className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-[#0F4C3A] px-4 py-2 text-xs font-medium text-white hover:bg-[#0B3A2C] disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Origin
                    </button>
                  </form>
                )}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#11191E]">
            <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Mobile App REST & Media Endpoints
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-6 py-2.5 font-medium">Method</th>
                    <th className="px-4 py-2.5 font-medium">Endpoint</th>
                    <th className="px-6 py-2.5 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {API_ENDPOINTS_REFERENCE.map(([method, path, desc]) => (
                    <tr key={path}>
                      <td className="whitespace-nowrap px-6 py-2.5 font-mono font-semibold text-[#0F4C3A] dark:text-emerald-400">
                        {method}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-slate-800 dark:text-slate-200">
                        {path}
                      </td>
                      <td className="px-6 py-2.5 text-slate-600 dark:text-slate-400">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
