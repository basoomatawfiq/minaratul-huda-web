import { useEffect, useState } from 'react';
import { CheckCircle2, MessageSquare, Send, Trash2 } from 'lucide-react';
import { apiFetch, formatDateTime, type UploadedFileResult } from '../lib/api';
import type { AudioAttachment, DocumentAttachment, QASubmission, QAStatus } from '../types';
import { ConfirmModal } from './ui/ConfirmModal';
import { MediaUploadField } from './ui/MediaUploadField';

interface QaModerationTabProps {
  defaultSpeakerName: string;
  onChanged: () => void;
}

export function QaModerationTab({ defaultSpeakerName, onChanged }: QaModerationTabProps) {
  const [items, setItems] = useState<QASubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'ALL' | QAStatus>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [topic, setTopic] = useState('');
  const [speaker, setSpeaker] = useState(defaultSpeakerName);
  const [answerText, setAnswerText] = useState('');
  const [answerTextAr, setAnswerTextAr] = useState('');
  const [answerTextLg, setAnswerTextLg] = useState('');
  const [answerAudio, setAnswerAudio] = useState<AudioAttachment | null>(null);
  const [answerDocument, setAnswerDocument] = useState<DocumentAttachment | null>(null);
  const [langTab, setLangTab] = useState<'en' | 'ar' | 'lg'>('en');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<QASubmission | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadQa = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: QASubmission[] }>(`/api/admin/qa?status=${filterStatus}`);
      setItems(res.items);
      if (res.items.length > 0 && !res.items.some((q) => q.id === selectedId)) {
        selectEntry(res.items[0]);
      } else if (res.items.length === 0) {
        setSelectedId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Q&A queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  const selectEntry = (qa: QASubmission) => {
    setSelectedId(qa.id);
    setTopic(qa.topic || '');
    setSpeaker(defaultSpeakerName);
    setAnswerText(qa.answerText || '');
    setAnswerTextAr(qa.answerTextAr || '');
    setAnswerTextLg(qa.answerTextLg || '');
    setAnswerAudio(qa.answerAudio);
    setAnswerDocument(qa.answerDocument);
    setError(null);
  };

  const selectedQa = items.find((q) => q.id === selectedId) || null;

  const handleModerate = async (action: 'save' | 'publish' | 'reject') => {
    if (!selectedQa) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ item: QASubmission }>(`/api/admin/qa/${selectedQa.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action,
          topic,
          speaker,
          answerText,
          answerTextAr,
          answerTextLg,
          answerAudio,
          answerDocument,
        }),
      });
      setNotice(
        action === 'publish'
          ? 'Answer saved and published to the Q&A mobile catalog.'
          : action === 'reject'
            ? 'Submission marked as rejected.'
            : 'Draft answer saved.'
      );
      await loadQa();
      selectEntry(res.item);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Moderation update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/qa/${deleteTarget.id}`, { method: 'DELETE' });
      setNotice('Q&A submission permanently deleted.');
      setDeleteTarget(null);
      await loadQa();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete Q&A entry');
    } finally {
      setDeleting(false);
    }
  };

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

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1.5 dark:border-slate-800 dark:bg-[#11191E] sm:w-fit">
        {(['ALL', 'PENDING', 'ANSWERED', 'PUBLISHED', 'REJECTED'] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilterStatus(status)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filterStatus === status
                ? 'bg-[#0F4C3A] text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-72 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#11191E]" />
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-[#11191E]">
          <MessageSquare className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
            No Q&A submissions in this queue
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
            Questions submitted by authenticated users through the Mobile App (`POST /api/qa/submit`) will appear here for scholarly review and publication.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#11191E] lg:col-span-5">
            {items.map((qa) => (
              <button
                key={qa.id}
                type="button"
                onClick={() => selectEntry(qa)}
                className={`block w-full px-4 py-3.5 text-left transition-colors ${
                  selectedQa?.id === qa.id
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-600 dark:text-slate-400">
                    {qa.topic || 'General Question'}
                  </span>
                  <span
                    className={`font-semibold ${
                      qa.status === 'PUBLISHED'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : qa.status === 'PENDING'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {qa.status}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                  {qa.questionText}
                </p>
                <p className="mt-1.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {qa.userName || qa.userEmail} · {formatDateTime(qa.createdAt)}
                </p>
              </button>
            ))}
          </div>

          {selectedQa && (
            <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#11191E] lg:col-span-7">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Submitted by {selectedQa.userName} ({selectedQa.userEmail}) ·{' '}
                    {formatDateTime(selectedQa.createdAt)}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-900 dark:text-slate-100">
                    {selectedQa.questionText}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(selectedQa)}
                  className="inline-flex shrink-0 items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Topic
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., Prayer, Zakah, Family"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Answering Scholar / Moderator
                  </label>
                  <input
                    type="text"
                    value={speaker}
                    onChange={(e) => setSpeaker(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Written Answer
                  </label>
                  <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-900">
                    {(
                      [
                        { id: 'en', label: 'English' },
                        { id: 'ar', label: 'Arabic' },
                        { id: 'lg', label: 'Luganda' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setLangTab(t.id)}
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          langTab === t.id
                            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {langTab === 'en' && (
                  <textarea
                    rows={5}
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Write the scholarly answer in English…"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                )}
                {langTab === 'ar' && (
                  <textarea
                    rows={5}
                    dir="rtl"
                    value={answerTextAr}
                    onChange={(e) => setAnswerTextAr(e.target.value)}
                    placeholder="اكتب الجواب بالعربية…"
                    className="font-arabic w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                )}
                {langTab === 'lg' && (
                  <textarea
                    rows={5}
                    value={answerTextLg}
                    onChange={(e) => setAnswerTextLg(e.target.value)}
                    placeholder="Wandiika okuddamu mu Luganda…"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                )}
              </div>

              <MediaUploadField
                label="Answer Audio Recording (optional)"
                bucket="qa"
                accept=".mp3,.m4a,.wav,.ogg,.aac,audio/*"
                hint="Attach a spoken scholarly answer"
                currentUrl={answerAudio?.url || null}
                currentSizeBytes={answerAudio?.sizeBytes}
                currentFormat={answerAudio?.format}
                onUploaded={(res: UploadedFileResult, dur) =>
                  setAnswerAudio({
                    url: res.url,
                    path: res.path,
                    sizeBytes: res.sizeBytes,
                    durationSeconds: dur || 0,
                    format: res.format,
                  })
                }
                onRemoved={() => setAnswerAudio(null)}
              />

              <MediaUploadField
                label="Answer PDF / Document (optional)"
                bucket="qa"
                accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                hint="Attach a written fatwa or study sheet"
                currentUrl={answerDocument?.url || null}
                currentSizeBytes={answerDocument?.sizeBytes}
                currentFormat={answerDocument?.format}
                onUploaded={(res: UploadedFileResult) =>
                  setAnswerDocument({
                    url: res.url,
                    path: res.path,
                    sizeBytes: res.sizeBytes,
                    format: res.format,
                    documentType: res.format || 'pdf',
                  })
                }
                onRemoved={() => setAnswerDocument(null)}
              />

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleModerate('reject')}
                  className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Mark Rejected
                </button>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleModerate('save')}
                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Save Answer Only
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleModerate('publish')}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#0F4C3A] px-4 py-2 text-xs font-medium text-white hover:bg-[#0B3A2C] disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {saving ? 'Publishing…' : 'Save & Publish to Q&A Catalog'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Q&A Submission"
        description="Permanently remove this Q&A submission and any unreferenced answer audio or PDF attachments?"
        confirmLabel="Delete Permanently"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
