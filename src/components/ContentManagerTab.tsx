import { useEffect, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Edit3,
  FileAudio,
  FileText,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch, formatDateTime, formatDuration, type UploadedFileResult } from '../lib/api';
import type {
  AudioAttachment,
  CategoryItem,
  ContentItem,
  ContentStatus,
  DocumentAttachment,
  SeriesItem,
} from '../types';
import { ConfirmModal } from './ui/ConfirmModal';
import { MediaUploadField } from './ui/MediaUploadField';

interface ContentManagerTabProps {
  categories: CategoryItem[];
  series: SeriesItem[];
  openCreateSignal: number;
  onChanged: () => void;
}

const STATUS_OPTIONS: ContentStatus[] = [
  'PUBLISHED',
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'UNPUBLISHED',
  'ARCHIVED',
];

const CONTENT_TYPES = [
  { value: 'lecture', label: 'Lecture / Lesson' },
  { value: 'tafseer', label: 'Tafseer Quran' },
  { value: 'hadith', label: 'Hadith' },
  { value: 'speech', label: 'Speech / Khutbah' },
  { value: 'qa', label: 'Q&A' },
  { value: 'document', label: 'Document / Book' },
];

interface ContentFormState {
  title: string;
  titleAr: string;
  titleLg: string;
  description: string;
  descriptionAr: string;
  descriptionLg: string;
  transcriptEn: string;
  transcriptAr: string;
  transcriptLg: string;
  contentType: string;
  categoryId: string;
  subcategory: string;
  seriesId: string;
  episodeNumber: string;
  speaker: string;
  date: string;
  location: string;
  quranReferences: string;
  tags: string;
  language: string;
  status: ContentStatus;
  featured: boolean;
  coverImage: string | null;
  audio: AudioAttachment | null;
  document: DocumentAttachment | null;
}

function emptyForm(defaultCategoryId: string): ContentFormState {
  return {
    title: '',
    titleAr: '',
    titleLg: '',
    description: '',
    descriptionAr: '',
    descriptionLg: '',
    transcriptEn: '',
    transcriptAr: '',
    transcriptLg: '',
    contentType: 'lecture',
    categoryId: defaultCategoryId,
    subcategory: '',
    seriesId: '',
    episodeNumber: '',
    speaker: '',
    date: new Date().toISOString().slice(0, 10),
    location: '',
    quranReferences: '',
    tags: '',
    language: 'en',
    status: 'PUBLISHED',
    featured: false,
    coverImage: null,
    audio: null,
    document: null,
  };
}

function formFromItem(item: ContentItem): ContentFormState {
  return {
    title: item.title,
    titleAr: item.titleAr || '',
    titleLg: item.titleLg || '',
    description: item.description || '',
    descriptionAr: item.descriptionAr || '',
    descriptionLg: item.descriptionLg || '',
    transcriptEn: item.transcript?.en || '',
    transcriptAr: item.transcript?.ar || '',
    transcriptLg: item.transcript?.lg || '',
    contentType: item.contentType || 'lecture',
    categoryId: item.categoryId || '',
    subcategory: item.subcategory || '',
    seriesId: item.seriesId || '',
    episodeNumber: item.episodeNumber !== null ? String(item.episodeNumber) : '',
    speaker: item.speaker || '',
    date: item.date || '',
    location: item.location || '',
    quranReferences: item.quranReferences || '',
    tags: item.tags.join(', '),
    language: item.language || 'en',
    status: item.status,
    featured: item.featured,
    coverImage: item.coverImage || null,
    audio: item.audio,
    document: item.document,
  };
}

export function ContentManagerTab({
  categories,
  series,
  openCreateSignal,
  onChanged,
}: ContentManagerTabProps) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [langTab, setLangTab] = useState<'en' | 'ar' | 'lg'>('en');
  const [form, setForm] = useState<ContentFormState>(() => emptyForm(categories[0]?.id || ''));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingTempUploads, setPendingTempUploads] = useState<string[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'ALL') params.set('status', filterStatus);
      if (filterCategory !== 'ALL') params.set('category', filterCategory);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const res = await apiFetch<{ items: ContentItem[] }>(`/api/admin/content?${params.toString()}`);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCategory, filterStatus]);

  useEffect(() => {
    if (openCreateSignal > 0) {
      openCreateModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCreateSignal]);

  const openCreateModal = () => {
    setEditingItem(null);
    setForm(emptyForm(categories[0]?.id || ''));
    setLangTab('en');
    setFormError(null);
    setPendingTempUploads([]);
    setEditorOpen(true);
  };

  const openEditModal = (item: ContentItem) => {
    setEditingItem(item);
    setForm(formFromItem(item));
    setLangTab('en');
    setFormError(null);
    setPendingTempUploads([]);
    setEditorOpen(true);
  };

  const closeEditorModal = async () => {
    // Delete any files uploaded during this unsaved session
    for (const url of pendingTempUploads) {
      try {
        await apiFetch(`/api/admin/upload?url=${encodeURIComponent(url)}`, { method: 'DELETE' });
      } catch {
        // ignore cleanup errors
      }
    }
    setPendingTempUploads([]);
    setEditorOpen(false);
    setEditingItem(null);
  };

  const handleSaveContent = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setFormError('English / Primary title is required.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        title: form.title.trim(),
        titleAr: form.titleAr.trim(),
        titleLg: form.titleLg.trim(),
        description: form.description.trim(),
        descriptionAr: form.descriptionAr.trim(),
        descriptionLg: form.descriptionLg.trim(),
        contentType: form.contentType,
        categoryId: form.categoryId || null,
        subcategory: form.subcategory.trim(),
        seriesId: form.seriesId || null,
        episodeNumber: form.episodeNumber ? parseInt(form.episodeNumber, 10) : null,
        speaker: form.speaker.trim(),
        date: form.date.trim(),
        location: form.location.trim(),
        coverImage: form.coverImage,
        audio: form.audio,
        document: form.document,
        transcript: {
          en: form.transcriptEn.trim(),
          ar: form.transcriptAr.trim(),
          lg: form.transcriptLg.trim(),
          language: form.language || 'en',
        },
        quranReferences: form.quranReferences.trim(),
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        language: form.language || 'en',
        status: form.status,
        featured: form.featured,
      };

      if (editingItem) {
        await apiFetch<{ item: ContentItem }>(`/api/admin/content/${editingItem.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setNotice(`Updated "${payload.title}".`);
      } else {
        await apiFetch<{ item: ContentItem }>('/api/admin/content', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice(`Created "${payload.title}" (${payload.status}).`);
      }

      setPendingTempUploads([]);
      setEditorOpen(false);
      setEditingItem(null);
      await loadContent();
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save content item');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (item: ContentItem) => {
    const nextStatus: ContentStatus = item.status === 'PUBLISHED' ? 'UNPUBLISHED' : 'PUBLISHED';
    try {
      await apiFetch(`/api/admin/content/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setNotice(`"${item.title}" is now ${nextStatus}.`);
      await loadContent();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update publish status');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/content/${deleteTarget.id}`, { method: 'DELETE' });
      setNotice(`Permanently deleted "${deleteTarget.title}" and cleaned up orphaned media files.`);
      setDeleteTarget(null);
      await loadContent();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete content item');
    } finally {
      setDeleting(false);
    }
  };

  const statusTone = (status: ContentStatus): string => {
    switch (status) {
      case 'PUBLISHED':
        return 'text-emerald-700 dark:text-emerald-400';
      case 'APPROVED':
      case 'IN_REVIEW':
        return 'text-amber-700 dark:text-amber-400';
      case 'ARCHIVED':
      case 'UNPUBLISHED':
        return 'text-slate-500 dark:text-slate-400';
      default:
        return 'text-slate-600 dark:text-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {notice && (
        <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {notice}
          </span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#11191E] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadContent();
            }}
            className="relative flex-1"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, speaker, or tags…"
              className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </form>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="ALL">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.nameEn}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="ALL">All Statuses</option>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#0F4C3A] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0B3A2C]"
        >
          <Plus className="h-4 w-4" />
          Upload Content
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#11191E]">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              No content items created yet
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
              The mobile app catalog stays empty until an administrator uploads a lecture, tafseer, document, or speech here.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#0F4C3A] px-4 py-2 text-sm font-medium text-white hover:bg-[#0B3A2C]"
            >
              <Plus className="h-4 w-4" />
              Create First Content Item
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-3">Title & Metadata</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Media</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Plays / Downloads</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {item.coverImage ? (
                          <img
                            src={item.coverImage}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="h-9 w-9 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-700"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                            {item.title.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                              {item.title}
                            </span>
                            {item.featured && (
                              <Star className="h-3.5 w-3.5 shrink-0 fill-amber-500 text-amber-500" />
                            )}
                          </div>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {[
                              item.speaker || 'Unspecified speaker',
                              item.seriesTitle ? `${item.seriesTitle}${item.episodeNumber ? ` #${item.episodeNumber}` : ''}` : null,
                              item.date || formatDateTime(item.createdAt),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                      {item.categoryName || 'Uncategorized'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-2.5 tabular-nums">
                        {item.audio && (
                          <span className="inline-flex items-center gap-1" title="Audio attached">
                            <FileAudio className="h-3.5 w-3.5 text-[#0F4C3A] dark:text-emerald-400" />
                            {item.audio.durationSeconds ? formatDuration(item.audio.durationSeconds) : item.audio.format.toUpperCase()}
                          </span>
                        )}
                        {item.document && (
                          <span className="inline-flex items-center gap-1" title="Document attached">
                            <FileText className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                            {item.document.format.toUpperCase()}
                          </span>
                        )}
                        {!item.audio && !item.document && item.transcript && <span>Transcript</span>}
                        {!item.audio && !item.document && !item.transcript && <span>Text only</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleTogglePublish(item)}
                        className={`text-xs font-semibold underline-offset-2 hover:underline ${statusTone(item.status)}`}
                        title="Click to toggle Published / Unpublished"
                      >
                        {item.status}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {item.playCount} / {item.downloadCount}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editorOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-[#11191E]">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {editingItem ? 'Edit Content Item' : 'Upload & Publish Content'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Attach audio, documents, covers, and multilingual metadata for the Mobile App
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditorModal}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveContent} className="flex-1 overflow-y-auto p-6">
              {formError && (
                <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Multilingual Titles, Descriptions & Transcripts
                    </span>
                    <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-900">
                      {(
                        [
                          { id: 'en', label: 'English' },
                          { id: 'ar', label: 'Arabic (RTL)' },
                          { id: 'lg', label: 'Luganda' },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setLangTab(t.id)}
                          className={`whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                            langTab === t.id
                              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {langTab === 'en' && (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                          Title (English) *
                        </label>
                        <input
                          type="text"
                          required
                          value={form.title}
                          onChange={(e) => setForm({ ...form, title: e.target.value })}
                          placeholder="e.g., Tafseer Surah Al-Kahf — Lesson 01"
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                          Description (English)
                        </label>
                        <textarea
                          rows={3}
                          value={form.description}
                          onChange={(e) => setForm({ ...form, description: e.target.value })}
                          placeholder="Brief summary shown in the mobile app…"
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                          Full Transcript (English)
                        </label>
                        <textarea
                          rows={4}
                          value={form.transcriptEn}
                          onChange={(e) => setForm({ ...form, transcriptEn: e.target.value })}
                          placeholder="Optional written transcript or study notes…"
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  )}

                  {langTab === 'ar' && (
                    <div className="space-y-3" dir="rtl">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                          العنوان (بالعربية)
                        </label>
                        <input
                          type="text"
                          value={form.titleAr}
                          onChange={(e) => setForm({ ...form, titleAr: e.target.value })}
                          placeholder="تفسير سورة الكهف — الدرس الأول"
                          className="font-arabic w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                          الوصف (بالعربية)
                        </label>
                        <textarea
                          rows={3}
                          value={form.descriptionAr}
                          onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })}
                          className="font-arabic w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                          النص الكامل / التفريغ (بالعربية)
                        </label>
                        <textarea
                          rows={4}
                          value={form.transcriptAr}
                          onChange={(e) => setForm({ ...form, transcriptAr: e.target.value })}
                          className="font-arabic w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  )}

                  {langTab === 'lg' && (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                          Title (Luganda)
                        </label>
                        <input
                          type="text"
                          value={form.titleLg}
                          onChange={(e) => setForm({ ...form, titleLg: e.target.value })}
                          placeholder="Tafseer ya Suura Al-Kahf..."
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                          Description (Luganda)
                        </label>
                        <textarea
                          rows={3}
                          value={form.descriptionLg}
                          onChange={(e) => setForm({ ...form, descriptionLg: e.target.value })}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                          Transcript (Luganda)
                        </label>
                        <textarea
                          rows={4}
                          value={form.transcriptLg}
                          onChange={(e) => setForm({ ...form, transcriptLg: e.target.value })}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Category
                    </label>
                    <select
                      value={form.categoryId}
                      onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.nameEn}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Content Type
                    </label>
                    <select
                      value={form.contentType}
                      onChange={(e) => setForm({ ...form, contentType: e.target.value })}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {CONTENT_TYPES.map((ct) => (
                        <option key={ct.value} value={ct.value}>
                          {ct.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Publish Status
                    </label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as ContentStatus })}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Series (optional)
                    </label>
                    <select
                      value={form.seriesId}
                      onChange={(e) => setForm({ ...form, seriesId: e.target.value })}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Standalone item</option>
                      {series.map((ser) => (
                        <option key={ser.id} value={ser.id}>
                          {ser.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Episode Number
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.episodeNumber}
                      onChange={(e) => setForm({ ...form, episodeNumber: e.target.value })}
                      placeholder="1"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Speaker / Author
                    </label>
                    <input
                      type="text"
                      value={form.speaker}
                      onChange={(e) => setForm({ ...form, speaker: e.target.value })}
                      placeholder="Sheikh / Lecturer name"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Date
                    </label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Location
                    </label>
                    <input
                      type="text"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      placeholder="Masjid / City"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Primary Language
                    </label>
                    <select
                      value={form.language}
                      onChange={(e) => setForm({ ...form, language: e.target.value })}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="en">English</option>
                      <option value="ar">Arabic</option>
                      <option value="lg">Luganda</option>
                      <option value="mixed">Multilingual</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Subcategory
                    </label>
                    <input
                      type="text"
                      value={form.subcategory}
                      onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                      placeholder="e.g., Aqeedah, Fiqh, Seerah"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Quran References
                    </label>
                    <input
                      type="text"
                      value={form.quranReferences}
                      onChange={(e) => setForm({ ...form, quranReferences: e.target.value })}
                      placeholder="e.g., Surah 18:1-26"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Tags (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={form.tags}
                      onChange={(e) => setForm({ ...form, tags: e.target.value })}
                      placeholder="ramadan, tafseer, patience"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-[#0F4C3A] focus:ring-[#0F4C3A]"
                  />
                  <span>Feature this item on the Mobile App home showcase</span>
                </label>

                <div className="space-y-4">
                  <MediaUploadField
                    label="Audio Recording"
                    bucket="audio"
                    accept=".mp3,.m4a,.wav,.ogg,.aac,audio/*"
                    hint="Supports .mp3, .m4a, .wav, .ogg, .aac (HTTP Range streaming enabled)"
                    currentUrl={form.audio?.url || null}
                    currentSizeBytes={form.audio?.sizeBytes}
                    currentFormat={form.audio?.format}
                    onUploaded={(res: UploadedFileResult, detectedDuration) => {
                      setPendingTempUploads((prev) => [...prev, res.url]);
                      setForm((prev) => ({
                        ...prev,
                        audio: {
                          url: res.url,
                          path: res.path,
                          sizeBytes: res.sizeBytes,
                          durationSeconds: detectedDuration || prev.audio?.durationSeconds || 0,
                          format: res.format,
                        },
                      }));
                    }}
                    onRemoved={() => setForm((prev) => ({ ...prev, audio: null }))}
                  />

                  {form.audio && (
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Audio Duration (seconds)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={form.audio.durationSeconds}
                        onChange={(e) =>
                          setForm((prev) =>
                            prev.audio
                              ? {
                                  ...prev,
                                  audio: {
                                    ...prev.audio,
                                    durationSeconds: Math.max(0, parseInt(e.target.value, 10) || 0),
                                  },
                                }
                              : prev
                          )
                        }
                        className="w-32 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs tabular-nums text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                  )}

                  <MediaUploadField
                    label="Document / Study PDF"
                    bucket="documents"
                    accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                    hint="Supports .pdf, .txt, .md"
                    currentUrl={form.document?.url || null}
                    currentSizeBytes={form.document?.sizeBytes}
                    currentFormat={form.document?.format}
                    onUploaded={(res: UploadedFileResult) => {
                      setPendingTempUploads((prev) => [...prev, res.url]);
                      setForm((prev) => ({
                        ...prev,
                        document: {
                          url: res.url,
                          path: res.path,
                          sizeBytes: res.sizeBytes,
                          format: res.format,
                          documentType: res.format || 'pdf',
                        },
                      }));
                    }}
                    onRemoved={() => setForm((prev) => ({ ...prev, document: null }))}
                  />

                  <MediaUploadField
                    label="Cover Image"
                    bucket="covers"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    hint="Supports .jpg, .png, .webp"
                    currentUrl={form.coverImage}
                    onUploaded={(res: UploadedFileResult) => {
                      setPendingTempUploads((prev) => [...prev, res.url]);
                      setForm((prev) => ({ ...prev, coverImage: res.url }));
                    }}
                    onRemoved={() => setForm((prev) => ({ ...prev, coverImage: null }))}
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeEditorModal}
                  disabled={saving}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-[#0F4C3A] px-5 py-2 text-sm font-medium text-white hover:bg-[#0B3A2C] disabled:opacity-50"
                >
                  {saving ? 'Saving…' : editingItem ? 'Save Changes' : 'Create Content Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Content Item Permanently"
        description={
          deleteTarget
            ? `Permanently delete "${deleteTarget.title}" from the database and remove any unreferenced audio, document, and cover files from disk storage? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete Permanently"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
