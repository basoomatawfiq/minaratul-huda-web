import { useEffect, useState, type FormEvent } from 'react';
import { Bell, CheckCircle2, Send, Trash2 } from 'lucide-react';
import { apiFetch, formatDateTime } from '../lib/api';
import type { ContentItem, NotificationItem } from '../types';
import { ConfirmModal } from './ui/ConfirmModal';

interface NotificationsTabProps {
  onChanged: () => void;
}

export function NotificationsTab({ onChanged }: NotificationsTabProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [publishedContent, setPublishedContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [titleLg, setTitleLg] = useState('');
  const [message, setMessage] = useState('');
  const [messageAr, setMessageAr] = useState('');
  const [messageLg, setMessageLg] = useState('');
  const [type, setType] = useState('announcement');
  const [contentId, setContentId] = useState('');
  const [sending, setSending] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotificationItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [notifRes, contentRes] = await Promise.all([
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
        apiFetch<{ items: ContentItem[] }>('/api/admin/content?status=PUBLISHED'),
      ]);
      setNotifications(notifRes.notifications);
      setPublishedContent(contentRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleBroadcast = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSending(true);
    try {
      await apiFetch('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({
          title,
          titleAr,
          titleLg,
          message,
          messageAr,
          messageLg,
          type,
          contentId: contentId || null,
        }),
      });
      setTitle('');
      setTitleAr('');
      setTitleLg('');
      setMessage('');
      setMessageAr('');
      setMessageLg('');
      setContentId('');
      setNotice('Announcement notification broadcasted to Mobile App feed.');
      await loadData();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/notifications/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setNotice('Notification deleted.');
      await loadData();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete notification');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#11191E] lg:col-span-5">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
          <Bell className="h-4 w-4 text-[#0F4C3A] dark:text-emerald-400" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Broadcast Notification
          </h2>
        </div>

        {notice && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {notice}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleBroadcast} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Title (English) *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New Ramadan Tafseer Episode Available"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Message (English) *
            </label>
            <textarea
              rows={3}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Listen to the latest lesson in the app…"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="announcement">Announcement</option>
                <option value="new_content">New Content</option>
                <option value="qa_answer">Q&A Update</option>
                <option value="event">Community Event</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Link to Content (optional)
              </label>
              <select
                value={contentId}
                onChange={(e) => setContentId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">None</option>
                {publishedContent.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Optional Arabic & Luganda Translations
            </p>
            <input
              type="text"
              dir="rtl"
              value={titleAr}
              onChange={(e) => setTitleAr(e.target.value)}
              placeholder="العنوان بالعربية"
              className="font-arabic w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              dir="rtl"
              value={messageAr}
              onChange={(e) => setMessageAr(e.target.value)}
              placeholder="الرسالة بالعربية"
              className="font-arabic w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              value={titleLg}
              onChange={(e) => setTitleLg(e.target.value)}
              placeholder="Omutwe (Luganda)"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              value={messageLg}
              onChange={(e) => setMessageLg(e.target.value)}
              placeholder="Obubaka (Luganda)"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <button
            type="submit"
            disabled={sending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0F4C3A] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0B3A2C] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Sending…' : 'Broadcast Notification'}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#11191E] lg:col-span-7">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Published Announcements
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Live feed served at GET /api/notifications
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {notifications.length} total
          </span>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-slate-500 dark:text-slate-400">
            No announcements broadcasted yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {notifications.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-4 px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono uppercase">{n.type}</span>
                    <span>·</span>
                    <span className="tabular-nums">{formatDateTime(n.createdAt)}</span>
                  </div>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {n.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {n.message}
                  </p>
                  {n.contentTitle && (
                    <p className="mt-1.5 text-xs font-medium text-[#0F4C3A] dark:text-emerald-400">
                      Linked content: {n.contentTitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(n)}
                  className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Notification"
        description={
          deleteTarget
            ? `Permanently delete notification "${deleteTarget.title}" from the Mobile App feed?`
            : ''
        }
        confirmLabel="Delete Notification"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
