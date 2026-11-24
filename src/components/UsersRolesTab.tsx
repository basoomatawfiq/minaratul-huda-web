import { useEffect, useState } from 'react';
import { CheckCircle2, Search, Shield, Trash2 } from 'lucide-react';
import { apiFetch, formatDateTime } from '../lib/api';
import type { UserProfile, UserRole } from '../types';
import { ConfirmModal } from './ui/ConfirmModal';

interface UsersRolesTabProps {
  currentUser: UserProfile;
  onChanged: () => void;
}

const ROLE_LABELS: { value: UserRole; label: string }[] = [
  { value: 'registered_user', label: 'Registered User (Mobile)' },
  { value: 'qa_moderator', label: 'Q&A Moderator' },
  { value: 'content_editor', label: 'Content Editor' },
  { value: 'administrator', label: 'Administrator' },
  { value: 'super_admin', label: 'Super Admin' },
];

export function UsersRolesTab({ currentUser, onChanged }: UsersRolesTabProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isSuperAdmin = currentUser.role === 'super_admin';

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ users: UserProfile[] }>('/api/admin/users');
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRoleChange = async (user: UserProfile, nextRole: UserRole) => {
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ user: UserProfile }>(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? res.user : u)));
      setNotice(`Updated ${user.email} role to ${nextRole}.`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' });
      setNotice(`Removed user ${deleteTarget.email}.`);
      setDeleteTarget(null);
      await loadUsers();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove user');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
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

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#11191E] sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or role…"
            className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Shield className="h-4 w-4 text-[#0F4C3A] dark:text-emerald-400" />
          {isSuperAdmin
            ? 'Super Admin privileges active: role updates and user removal enabled'
            : 'Read-only directory: only Super Admin can promote or remove users'}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#11191E]">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            No matching accounts found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-3">User</th>
                  <th className="px-4 py-3">Language</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Role</th>
                  {isSuperAdmin && <th className="px-5 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {user.name}
                        {user.id === currentUser.id && (
                          <span className="ml-1.5 text-xs font-normal text-slate-400">(You)</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs uppercase text-slate-600 dark:text-slate-400">
                      {user.preferredLanguage}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {formatDateTime(user.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {isSuperAdmin ? (
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          {ROLE_LABELS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                          {user.role}
                        </span>
                      )}
                    </td>
                    {isSuperAdmin && (
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        {user.id !== currentUser.id ? (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(user)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Remove User Account"
        description={
          deleteTarget
            ? `Permanently delete "${deleteTarget.name}" (${deleteTarget.email}) and their personal Q&A submissions, favorites, and history?`
            : ''
        }
        confirmLabel="Remove User"
        busy={deleting}
        onConfirm={handleDeleteUser}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
