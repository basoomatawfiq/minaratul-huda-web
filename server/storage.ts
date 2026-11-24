import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import multer from 'multer';
import { db } from './db.ts';

export const STORAGE_ROOT = path.resolve(process.cwd(), 'storage');
export const ALLOWED_BUCKETS = ['audio', 'documents', 'covers', 'qa'] as const;
export type MediaBucket = (typeof ALLOWED_BUCKETS)[number];

for (const bucket of ALLOWED_BUCKETS) {
  fs.mkdirSync(path.join(STORAGE_ROOT, bucket), { recursive: true });
}

const EXTENSION_MIME_MAP: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const BUCKET_EXTENSIONS: Record<MediaBucket, Set<string>> = {
  audio: new Set(['.mp3', '.m4a', '.wav', '.ogg', '.aac']),
  documents: new Set(['.pdf', '.txt', '.md']),
  covers: new Set(['.jpg', '.jpeg', '.png', '.webp']),
  qa: new Set(['.mp3', '.m4a', '.wav', '.ogg', '.aac', '.pdf', '.txt', '.md']),
};

export function isValidBucket(bucket: string): bucket is MediaBucket {
  return (ALLOWED_BUCKETS as readonly string[]).includes(bucket);
}

export function resolveSafeStoragePath(bucket: string, filename: string): string | null {
  if (!isValidBucket(bucket)) {
    return null;
  }
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\') || filename.includes('\0')) {
    return null;
  }
  const bucketDir = path.resolve(STORAGE_ROOT, bucket);
  const resolved = path.resolve(bucketDir, filename);
  if (!resolved.startsWith(bucketDir + path.sep)) {
    return null;
  }
  if (!resolved.startsWith(STORAGE_ROOT + path.sep)) {
    return null;
  }
  return resolved;
}

export function parseMediaUrl(mediaUrlOrPath: string | null | undefined): { bucket: MediaBucket; filename: string } | null {
  if (!mediaUrlOrPath) return null;
  const normalized = mediaUrlOrPath.trim();
  const apiMatch = normalized.match(/^\/api\/media\/([a-z]+)\/([^/?#]+)$/);
  if (apiMatch) {
    const [, bucket, filename] = apiMatch;
    if (isValidBucket(bucket)) {
      return { bucket, filename: decodeURIComponent(filename) };
    }
  }
  const relMatch = normalized.match(/^([a-z]+)\/([^/?#]+)$/);
  if (relMatch) {
    const [, bucket, filename] = relMatch;
    if (isValidBucket(bucket)) {
      return { bucket, filename };
    }
  }
  return null;
}

export function isMediaUrlStillReferenced(mediaUrl: string): boolean {
  const rowContent = db
    .prepare(
      `SELECT 1 FROM content_items WHERE audio_url = ? OR document_url = ? OR cover_image = ? LIMIT 1`
    )
    .get(mediaUrl, mediaUrl, mediaUrl);
  if (rowContent) return true;

  const rowQa = db
    .prepare(
      `SELECT 1 FROM qa_submissions WHERE answer_audio_url = ? OR answer_document_url = ? LIMIT 1`
    )
    .get(mediaUrl, mediaUrl);
  if (rowQa) return true;

  const rowSeries = db
    .prepare(`SELECT 1 FROM series WHERE cover_image = ? LIMIT 1`)
    .get(mediaUrl);
  if (rowSeries) return true;

  return false;
}

export function deleteMediaFileIfUnreferenced(mediaUrlOrPath: string | null | undefined): boolean {
  const parsed = parseMediaUrl(mediaUrlOrPath);
  if (!parsed) return false;

  const canonicalUrl = `/api/media/${parsed.bucket}/${parsed.filename}`;
  if (isMediaUrlStillReferenced(canonicalUrl)) {
    return false;
  }

  const safePath = resolveSafeStoragePath(parsed.bucket, parsed.filename);
  if (!safePath) return false;

  try {
    if (fs.existsSync(safePath)) {
      fs.unlinkSync(safePath);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function getStorageUsage(): { totalBytes: number; byBucket: Record<string, number> } {
  const byBucket: Record<string, number> = {};
  let totalBytes = 0;

  for (const bucket of ALLOWED_BUCKETS) {
    const bucketDir = path.resolve(STORAGE_ROOT, bucket);
    let bucketBytes = 0;
    if (fs.existsSync(bucketDir)) {
      const entries = fs.readdirSync(bucketDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = resolveSafeStoragePath(bucket, entry.name);
          if (filePath) {
            try {
              const stat = fs.statSync(filePath);
              bucketBytes += stat.size;
            } catch {
              // ignore unreadable entries
            }
          }
        }
      }
    }
    byBucket[bucket] = bucketBytes;
    totalBytes += bucketBytes;
  }

  return { totalBytes, byBucket };
}

const storageEngine = multer.diskStorage({
  destination: (req, _file, cb) => {
    const requestedBucket = String((req.query.bucket || req.body?.bucket || '')).trim().toLowerCase();
    if (!isValidBucket(requestedBucket)) {
      cb(new Error('Invalid media bucket'), '');
      return;
    }
    const bucketDir = path.resolve(STORAGE_ROOT, requestedBucket);
    if (!bucketDir.startsWith(STORAGE_ROOT + path.sep)) {
      cb(new Error('Invalid storage directory'), '');
      return;
    }
    fs.mkdirSync(bucketDir, { recursive: true });
    cb(null, bucketDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = /^[a-z0-9.]+$/.test(ext) ? ext : '';
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`;
    cb(null, unique);
  },
});

export const uploadMiddleware = multer({
  storage: storageEngine,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB max for long Tafseer/lecture audio files
  },
  fileFilter: (req, file, cb) => {
    const requestedBucket = String((req.query.bucket || req.body?.bucket || '')).trim().toLowerCase();
    if (!isValidBucket(requestedBucket)) {
      cb(new Error('Invalid media bucket. Allowed: audio, documents, covers, qa'));
      return;
    }
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!BUCKET_EXTENSIONS[requestedBucket].has(ext)) {
      cb(new Error(`File extension ${ext || 'unknown'} is not permitted for ${requestedBucket}`));
      return;
    }
    cb(null, true);
  },
});

export function streamMediaHandler(req: Request, res: Response): void {
  const bucket = String(req.params.bucket || '').trim().toLowerCase();
  const rawFilename = String(req.params.filename || '').trim();

  const safePath = resolveSafeStoragePath(bucket, rawFilename);
  if (!safePath) {
    res.status(400).json({ error: 'Invalid media path' });
    return;
  }

  if (!fs.existsSync(safePath)) {
    res.status(404).json({ error: 'Media file not found' });
    return;
  }

  const stat = fs.statSync(safePath);
  if (!stat.isFile()) {
    res.status(404).json({ error: 'Media file not found' });
    return;
  }

  const ext = path.extname(safePath).toLowerCase();
  const contentType = EXTENSION_MIME_MAP[ext] || 'application/octet-stream';
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? Math.min(parseInt(match[2], 10), fileSize - 1) : fileSize - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', String(chunkSize));

    const stream = fs.createReadStream(safePath, { start, end });
    stream.pipe(res);
    return;
  }

  res.status(200);
  res.setHeader('Content-Length', String(fileSize));
  fs.createReadStream(safePath).pipe(res);
}
