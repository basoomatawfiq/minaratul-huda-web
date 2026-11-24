import { useRef, useState } from 'react';
import { FileAudio, FileText, ImageIcon, Trash2, Upload, XCircle } from 'lucide-react';
import {
  formatBytes,
  uploadFileWithProgress,
  type UploadedFileResult,
  type UploadTask,
} from '../../lib/api';

interface MediaUploadFieldProps {
  label: string;
  bucket: 'audio' | 'documents' | 'covers' | 'qa';
  accept: string;
  hint: string;
  currentUrl: string | null;
  currentSizeBytes?: number;
  currentFormat?: string;
  onUploaded: (result: UploadedFileResult, detectedDurationSeconds?: number) => void;
  onRemoved: () => void;
}

export function MediaUploadField({
  label,
  bucket,
  accept,
  hint,
  currentUrl,
  currentSizeBytes,
  currentFormat,
  onUploaded,
  onRemoved,
}: MediaUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const taskRef = useRef<UploadTask | null>(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadedBytes, setLoadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const detectAudioDuration = (file: File): Promise<number | undefined> => {
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg|aac)$/i.test(file.name)) {
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      const audio = document.createElement('audio');
      const objectUrl = URL.createObjectURL(file);
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const dur = Number.isFinite(audio.duration) ? Math.round(audio.duration) : undefined;
        URL.revokeObjectURL(objectUrl);
        resolve(dur);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(undefined);
      };
      audio.src = objectUrl;
    });
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    setProgress(0);
    setLoadedBytes(0);
    setTotalBytes(file.size);
    setFileName(file.name);

    const detectedDurationPromise = detectAudioDuration(file);

    const task = uploadFileWithProgress({
      file,
      bucket,
      onProgress: (pct, loaded, total) => {
        setProgress(pct);
        setLoadedBytes(loaded);
        setTotalBytes(total);
      },
    });
    taskRef.current = task;

    try {
      const [result, detectedDuration] = await Promise.all([task.promise, detectedDurationPromise]);
      onUploaded(result, detectedDuration);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      taskRef.current = null;
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleCancel = () => {
    if (taskRef.current) {
      taskRef.current.abort();
    }
  };

  const isCover = bucket === 'covers';
  const isAudio =
    bucket === 'audio' || (currentFormat && ['mp3', 'm4a', 'wav', 'ogg', 'aac'].includes(currentFormat.toLowerCase()));

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</span>
          <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0])}
        />

        {!uploading && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Upload className="h-3.5 w-3.5" />
            {currentUrl ? 'Replace File' : 'Select File'}
          </button>
        )}
      </div>

      {uploading && (
        <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#11191E]">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-medium text-slate-700 dark:text-slate-200">{fileName}</span>
            <span className="shrink-0 font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {progress}% · {formatBytes(loadedBytes)} / {formatBytes(totalBytes)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full bg-[#0F4C3A] transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel Upload
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
      )}

      {!uploading && currentUrl && (
        <div className="mt-3 flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#11191E]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {isCover ? (
                <img
                  src={currentUrl}
                  alt="Cover preview"
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-700"
                />
              ) : isAudio ? (
                <FileAudio className="h-5 w-5 shrink-0 text-[#0F4C3A] dark:text-emerald-400" />
              ) : (
                <FileText className="h-5 w-5 shrink-0 text-[#0F4C3A] dark:text-emerald-400" />
              )}
              <div className="min-w-0">
                <p className="truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                  {currentUrl.split('/').pop()}
                </p>
                <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {currentFormat ? currentFormat.toUpperCase() : 'FILE'}
                  {currentSizeBytes ? ` · ${formatBytes(currentSizeBytes)}` : ''}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onRemoved}
              className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              aria-label={`Remove ${label}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>

          {isAudio && (
            <audio controls preload="none" src={currentUrl} className="mt-1 h-8 w-full" />
          )}

          {!isAudio && !isCover && (
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[#0F4C3A] underline-offset-2 hover:underline dark:text-emerald-400"
            >
              <ImageIcon className="hidden" />
              Open uploaded document
            </a>
          )}
        </div>
      )}
    </div>
  );
}
