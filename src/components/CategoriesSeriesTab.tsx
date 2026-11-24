import { useState, type FormEvent } from 'react';
import { CheckCircle2, FolderTree, Layers, Plus, Trash2 } from 'lucide-react';
import { apiFetch, type UploadedFileResult } from '../lib/api';
import type { CategoryItem, SeriesItem } from '../types';
import { ConfirmModal } from './ui/ConfirmModal';
import { MediaUploadField } from './ui/MediaUploadField';

interface CategoriesSeriesTabProps {
  categories: CategoryItem[];
  series: SeriesItem[];
  onChanged: () => void;
}

export function CategoriesSeriesTab({ categories, series, onChanged }: CategoriesSeriesTabProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Category form
  const [catNameEn, setCatNameEn] = useState('');
  const [catNameAr, setCatNameAr] = useState('');
  const [catNameLg, setCatNameLg] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);

  // Series form
  const [serTitle, setSerTitle] = useState('');
  const [serTitleAr, setSerTitleAr] = useState('');
  const [serTitleLg, setSerTitleLg] = useState('');
  const [serSpeaker, setSerSpeaker] = useState('');
  const [serCategoryId, setSerCategoryId] = useState(categories[0]?.id || '');
  const [serDesc, setSerDesc] = useState('');
  const [serCover, setSerCover] = useState<string | null>(null);
  const [creatingSeries, setCreatingSeries] = useState(false);

  const [deleteCatTarget, setDeleteCatTarget] = useState<CategoryItem | null>(null);
  const [deleteSeriesTarget, setDeleteSeriesTarget] = useState<SeriesItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreateCategory = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setCreatingCat(true);
    try {
      await apiFetch('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({
          nameEn: catNameEn,
          nameAr: catNameAr,
          nameLg: catNameLg,
          slug: catSlug || catNameEn,
          description: catDesc,
        }),
      });
      setCatNameEn('');
      setCatNameAr('');
      setCatNameLg('');
      setCatSlug('');
      setCatDesc('');
      setNotice('Custom category created.');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setCreatingCat(false);
    }
  };

  const handleCreateSeries = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setCreatingSeries(true);
    try {
      await apiFetch('/api/admin/series', {
        method: 'POST',
        body: JSON.stringify({
          title: serTitle,
          titleAr: serTitleAr,
          titleLg: serTitleLg,
          speaker: serSpeaker,
          categoryId: serCategoryId || null,
          description: serDesc,
          coverImage: serCover,
        }),
      });
      setSerTitle('');
      setSerTitleAr('');
      setSerTitleLg('');
      setSerSpeaker('');
      setSerDesc('');
      setSerCover(null);
      setNotice('Lecture series created.');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create series');
    } finally {
      setCreatingSeries(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteCatTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/categories/${deleteCatTarget.id}`, { method: 'DELETE' });
      setDeleteCatTarget(null);
      setNotice('Custom category deleted.');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSeries = async () => {
    if (!deleteSeriesTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/series/${deleteSeriesTarget.id}`, { method: 'DELETE' });
      setDeleteSeriesTarget(null);
      setNotice('Lecture series deleted.');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete series');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Categories */}
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#11191E]">
          <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3 dark:border-slate-800">
            <FolderTree className="h-4 w-4 text-[#0F4C3A] dark:text-emerald-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Categories Taxonomy
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                6 core mobile app tabs plus optional custom categories
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {cat.nameEn}
                    </span>
                    {cat.nameAr && (
                      <span className="font-arabic text-xs text-slate-500 dark:text-slate-400" dir="rtl">
                        {cat.nameAr}
                      </span>
                    )}
                    {cat.nameLg && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">· {cat.nameLg}</span>
                    )}
                  </div>
                  <p className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    /{cat.slug} · {cat.itemCount ?? 0} published · {cat.isCore ? 'Core taxonomy' : 'Custom'}
                  </p>
                </div>

                {!cat.isCore && (
                  <button
                    type="button"
                    onClick={() => setDeleteCatTarget(cat)}
                    className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleCreateCategory} className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Add Custom Category</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                required
                value={catNameEn}
                onChange={(e) => setCatNameEn(e.target.value)}
                placeholder="English Name *"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                value={catSlug}
                onChange={(e) => setCatSlug(e.target.value)}
                placeholder="Slug (auto if blank)"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                dir="rtl"
                value={catNameAr}
                onChange={(e) => setCatNameAr(e.target.value)}
                placeholder="الاسم بالعربية"
                className="font-arabic rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                value={catNameLg}
                onChange={(e) => setCatNameLg(e.target.value)}
                placeholder="Luganda Name"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <input
              type="text"
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              placeholder="Short description (optional)"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={creatingCat}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#0F4C3A] px-4 py-2 text-xs font-medium text-white hover:bg-[#0B3A2C] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {creatingCat ? 'Creating…' : 'Create Category'}
            </button>
          </form>
        </section>

        {/* Lecture Series */}
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#11191E]">
          <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3 dark:border-slate-800">
            <Layers className="h-4 w-4 text-[#0F4C3A] dark:text-emerald-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Lecture Series
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Group multi-part Tafseer, Hadith, and lesson episodes
              </p>
            </div>
          </div>

          {series.length === 0 ? (
            <p className="py-4 text-xs text-slate-500 dark:text-slate-400">
              No lecture series created yet. Add one below to organize multi-episode teachings.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {series.map((ser) => (
                <div key={ser.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    {ser.coverImage ? (
                      <img
                        src={ser.coverImage}
                        alt={ser.title}
                        referrerPolicy="no-referrer"
                        className="h-9 w-9 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-700"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        {ser.title.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {ser.title}
                      </p>
                      <p className="truncate text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {[ser.speaker || 'Unspecified speaker', ser.categoryName, `${ser.episodeCount ?? 0} episodes`]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteSeriesTarget(ser)}
                    className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleCreateSeries} className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Create Lecture Series</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                required
                value={serTitle}
                onChange={(e) => setSerTitle(e.target.value)}
                placeholder="Series Title (English) *"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                value={serSpeaker}
                onChange={(e) => setSerSpeaker(e.target.value)}
                placeholder="Primary Speaker"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                dir="rtl"
                value={serTitleAr}
                onChange={(e) => setSerTitleAr(e.target.value)}
                placeholder="عنوان السلسلة بالعربية"
                className="font-arabic rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                value={serTitleLg}
                onChange={(e) => setSerTitleLg(e.target.value)}
                placeholder="Series Title (Luganda)"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <select
              value={serCategoryId}
              onChange={(e) => setSerCategoryId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Select Category (optional)</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nameEn}
                </option>
              ))}
            </select>

            <textarea
              rows={2}
              value={serDesc}
              onChange={(e) => setSerDesc(e.target.value)}
              placeholder="Series overview…"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0F4C3A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />

            <MediaUploadField
              label="Series Cover Art (optional)"
              bucket="covers"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              hint="JPG, PNG, or WebP"
              currentUrl={serCover}
              onUploaded={(res: UploadedFileResult) => setSerCover(res.url)}
              onRemoved={() => setSerCover(null)}
            />

            <button
              type="submit"
              disabled={creatingSeries}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#0F4C3A] px-4 py-2 text-xs font-medium text-white hover:bg-[#0B3A2C] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {creatingSeries ? 'Creating…' : 'Create Series'}
            </button>
          </form>
        </section>
      </div>

      <ConfirmModal
        open={Boolean(deleteCatTarget)}
        title="Delete Custom Category"
        description={
          deleteCatTarget
            ? `Permanently delete custom category "${deleteCatTarget.nameEn}"? Existing content items in this category will remain intact as uncategorized.`
            : ''
        }
        confirmLabel="Delete Category"
        busy={deleting}
        onConfirm={handleDeleteCategory}
        onCancel={() => setDeleteCatTarget(null)}
      />

      <ConfirmModal
        open={Boolean(deleteSeriesTarget)}
        title="Delete Lecture Series"
        description={
          deleteSeriesTarget
            ? `Permanently delete series "${deleteSeriesTarget.title}"? Episodes in this series will remain published as standalone items.`
            : ''
        }
        confirmLabel="Delete Series"
        busy={deleting}
        onConfirm={handleDeleteSeries}
        onCancel={() => setDeleteSeriesTarget(null)}
      />
    </div>
  );
}
