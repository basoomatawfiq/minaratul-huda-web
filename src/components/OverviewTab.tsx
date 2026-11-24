import { ArrowRight, HardDrive, MessageSquare, UploadCloud } from 'lucide-react';
import { formatBytes, formatDateTime } from '../lib/api';
import type { AuditLogEntry, OverviewStats } from '../types';

export type AdminTabKey =
  | 'overview'
  | 'content'
  | 'qa'
  | 'taxonomy'
  | 'notifications'
  | 'users'
  | 'connection';

interface OverviewTabProps {
  stats: OverviewStats | null;
  auditLogs: AuditLogEntry[];
  loading: boolean;
  error: string | null;
  onNavigateTab: (tab: AdminTabKey) => void;
  onOpenNewContent: () => void;
}

export function OverviewTab({
  stats,
  auditLogs,
  loading,
  error,
  onNavigateTab,
  onOpenNewContent,
}: OverviewTabProps) {
  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#11191E]"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#11191E]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
        {error}
      </div>
    );
  }

  const metrics = [
    {
      label: 'Total Content Items',
      value: stats ? String(stats.totalContent) : '0',
      sub: stats ? `${stats.draftContent} unpublished or draft` : 'No items yet',
    },
    {
      label: 'Published to Mobile App',
      value: stats ? String(stats.publishedContent) : '0',
      sub: stats ? `${stats.totalSeries} series · ${stats.totalCategories} categories` : '—',
    },
    {
      label: 'Audio Plays',
      value: stats ? stats.totalPlays.toLocaleString() : '0',
      sub: 'Tracked via mobile playback API',
    },
    {
      label: 'Document & Audio Downloads',
      value: stats ? stats.totalDownloads.toLocaleString() : '0',
      sub: 'Tracked via mobile download API',
    },
    {
      label: 'Pending Q&A Submissions',
      value: stats ? String(stats.pendingQa) : '0',
      sub: stats ? `${stats.answeredQa} answered or published` : '—',
    },
    {
      label: 'Local Media Storage Used',
      value: stats ? formatBytes(stats.storageUsedBytes) : '0 B',
      sub: stats
        ? `Audio ${formatBytes(stats.storageByBucket.audio || 0)} · Docs ${formatBytes(stats.storageByBucket.documents || 0)}`
        : '—',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#11191E]"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{metric.label}</p>
            <p className="mt-2 font-display text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
              {metric.value}
            </p>
            <p className="mt-1 text-xs tabular-nums text-slate-500 dark:text-slate-400">{metric.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <button
          type="button"
          onClick={onOpenNewContent}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#0F4C3A] dark:border-slate-800 dark:bg-[#11191E] dark:hover:border-emerald-500"
        >
          <div className="flex items-center gap-3">
            <UploadCloud className="h-5 w-5 text-[#0F4C3A] dark:text-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Upload Teaching</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Add audio, PDF, or transcript</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400" />
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('qa')}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#0F4C3A] dark:border-slate-800 dark:bg-[#11191E] dark:hover:border-emerald-500"
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-[#0F4C3A] dark:text-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Review Q&A Queue</p>
              <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {stats?.pendingQa ?? 0} awaiting moderation
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400" />
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('connection')}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#0F4C3A] dark:border-slate-800 dark:bg-[#11191E] dark:hover:border-emerald-500"
        >
          <div className="flex items-center gap-3">
            <HardDrive className="h-5 w-5 text-[#0F4C3A] dark:text-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Mobile App Connection</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Copy API URL & CORS settings</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400" />
        </button>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#11191E]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Recent Audit Activity</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Server-verified record of administrative actions and content changes
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {auditLogs.length} entries
          </span>
        </div>

        {auditLogs.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No administrative actions recorded yet. Start by uploading content or configuring categories.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-5 py-2.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-medium">{log.actorName || 'System'}</span>
                      {log.actorRole && (
                        <span className="text-slate-400 dark:text-slate-500"> · {log.actorRole}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-medium text-slate-800 dark:text-slate-200">
                      {log.action}
                    </td>
                    <td className="max-w-md truncate px-5 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                      {log.details || `${log.entityType} ${log.entityId || ''}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
