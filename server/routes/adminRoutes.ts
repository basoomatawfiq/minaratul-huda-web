import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import {
  ADMIN_STUDIO_ROLES,
  CONTENT_EDITOR_ROLES,
  FULL_ADMIN_ROLES,
  QA_MODERATOR_ROLES,
  requireRoles,
  type AuthenticatedRequest,
} from '../auth.ts';
import {
  DEFAULT_MOBILE_ORIGINS,
  getAllowedOriginsSet,
  getCustomDbOrigins,
  getEnvOrigins,
  normalizeOrigin,
  saveCustomDbOrigins,
} from '../cors.ts';
import {
  CONTENT_BASE_SELECT,
  CORE_CATEGORY_IDS,
  db,
  mapAuditLogRow,
  mapCategoryRow,
  mapContentRow,
  mapNotificationRow,
  mapQaRow,
  mapSeriesRow,
  mapUserRow,
  writeAuditLog,
} from '../db.ts';
import {
  deleteMediaFileIfUnreferenced,
  getStorageUsage,
  isValidBucket,
  uploadMiddleware,
} from '../storage.ts';
import type { ContentStatus, UserRole } from '../../src/types.ts';

const router = Router();

const VALID_STATUSES = new Set<ContentStatus>([
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'UNPUBLISHED',
  'ARCHIVED',
]);

const VALID_ROLES = new Set<UserRole>([
  'registered_user',
  'qa_moderator',
  'content_editor',
  'administrator',
  'super_admin',
]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

router.get('/overview', requireRoles(ADMIN_STUDIO_ROLES), (_req, res) => {
  const contentStats = db
    .prepare(`
      SELECT
        COUNT(*) AS total_content,
        SUM(CASE WHEN status = 'PUBLISHED' THEN 1 ELSE 0 END) AS published_content,
        SUM(CASE WHEN status != 'PUBLISHED' THEN 1 ELSE 0 END) AS draft_content,
        COALESCE(SUM(play_count), 0) AS total_plays,
        COALESCE(SUM(download_count), 0) AS total_downloads
      FROM content_items
    `)
    .get() as Record<string, number>;

  const qaStats = db
    .prepare(`
      SELECT
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_qa,
        SUM(CASE WHEN status IN ('ANSWERED', 'PUBLISHED') THEN 1 ELSE 0 END) AS answered_qa
      FROM qa_submissions
    `)
    .get() as Record<string, number>;

  const userCount = (db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number }).cnt;
  const seriesCount = (db.prepare('SELECT COUNT(*) AS cnt FROM series').get() as { cnt: number }).cnt;
  const catCount = (db.prepare('SELECT COUNT(*) AS cnt FROM categories').get() as { cnt: number }).cnt;
  const storage = getStorageUsage();

  const auditRows = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 30')
    .all() as Record<string, unknown>[];

  res.json({
    stats: {
      totalContent: Number(contentStats.total_content || 0),
      publishedContent: Number(contentStats.published_content || 0),
      draftContent: Number(contentStats.draft_content || 0),
      totalPlays: Number(contentStats.total_plays || 0),
      totalDownloads: Number(contentStats.total_downloads || 0),
      pendingQa: Number(qaStats.pending_qa || 0),
      answeredQa: Number(qaStats.answered_qa || 0),
      totalUsers: userCount,
      totalSeries: seriesCount,
      totalCategories: catCount,
      storageUsedBytes: storage.totalBytes,
      storageByBucket: storage.byBucket,
    },
    auditLogs: auditRows.map(mapAuditLogRow),
  });
});

router.post(
  '/upload',
  requireRoles([...new Set([...CONTENT_EDITOR_ROLES, ...QA_MODERATOR_ROLES])]),
  uploadMiddleware.single('file'),
  (req: AuthenticatedRequest, res) => {
    const bucket = String(req.query.bucket || req.body?.bucket || '').trim().toLowerCase();
    if (!isValidBucket(bucket)) {
      res.status(400).json({ error: 'Invalid media bucket' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const ext = path.extname(req.file.filename).replace('.', '').toLowerCase();
    const url = `/api/media/${bucket}/${req.file.filename}`;
    const relPath = `${bucket}/${req.file.filename}`;

    writeAuditLog({
      actor: req.user,
      action: 'UPLOAD_MEDIA',
      entityType: 'media',
      entityId: relPath,
      details: `Uploaded ${req.file.originalname} (${req.file.size} bytes) to ${bucket}`,
    });

    res.status(201).json({
      url,
      path: relPath,
      sizeBytes: req.file.size,
      format: ext,
      originalName: req.file.originalname,
    });
  }
);

router.delete(
  '/upload',
  requireRoles([...new Set([...CONTENT_EDITOR_ROLES, ...QA_MODERATOR_ROLES])]),
  (req, res) => {
    const url = String(req.body?.url || req.query.url || '').trim();
    if (!url) {
      res.status(400).json({ error: 'Media URL is required' });
      return;
    }
    const deleted = deleteMediaFileIfUnreferenced(url);
    res.json({ deleted });
  }
);

router.get('/content', requireRoles(CONTENT_EDITOR_ROLES), (req, res) => {
  const status = String(req.query.status || '').trim().toUpperCase();
  const category = String(req.query.category || '').trim();
  const q = String(req.query.q || '').trim();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status && status !== 'ALL') {
    conditions.push('c.status = ?');
    params.push(status);
  }
  if (category && category !== 'ALL') {
    conditions.push('(cat.slug = ? OR c.category_id = ?)');
    params.push(category, category);
  }
  if (q) {
    const like = `%${q}%`;
    conditions.push('(c.title LIKE ? OR c.title_ar LIKE ? OR c.title_lg LIKE ? OR c.speaker LIKE ? OR c.tags_json LIKE ?)');
    params.push(like, like, like, like, like);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`${CONTENT_BASE_SELECT} ${whereClause} ORDER BY c.updated_at DESC, c.created_at DESC`)
    .all(...params) as Record<string, unknown>[];

  res.json({ items: rows.map(mapContentRow) });
});

router.post('/content', requireRoles(CONTENT_EDITOR_ROLES), (req: AuthenticatedRequest, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  if (!title) {
    res.status(400).json({ error: 'Content title is required' });
    return;
  }

  const requestedStatus = String(body.status || 'PUBLISHED').trim().toUpperCase() as ContentStatus;
  const status: ContentStatus = VALID_STATUSES.has(requestedStatus) ? requestedStatus : 'PUBLISHED';

  const id = `cnt_${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();
  const publishedAt = status === 'PUBLISHED' ? now : null;
  const publishedBy = status === 'PUBLISHED' ? req.user!.id : null;

  const tags = Array.isArray(body.tags)
    ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
    : typeof body.tags === 'string'
      ? body.tags
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean)
      : [];

  const audio = body.audio && typeof body.audio === 'object' && body.audio.url ? body.audio : null;
  const doc = body.document && typeof body.document === 'object' && body.document.url ? body.document : null;
  const transcript = body.transcript && typeof body.transcript === 'object' ? body.transcript : {};

  const categoryId = body.categoryId ? String(body.categoryId).trim() : null;
  const seriesId = body.seriesId ? String(body.seriesId).trim() : null;
  const episodeNumber =
    body.episodeNumber !== undefined && body.episodeNumber !== null && body.episodeNumber !== ''
      ? parseInt(String(body.episodeNumber), 10) || null
      : null;

  db.prepare(`
    INSERT INTO content_items (
      id, title, title_ar, title_lg,
      description, description_ar, description_lg,
      content_type, category_id, subcategory, series_id, episode_number,
      speaker, date, location, cover_image,
      audio_url, audio_path, audio_size_bytes, audio_duration_seconds, audio_format,
      document_url, document_path, document_size_bytes, document_format, document_type,
      transcript_en, transcript_ar, transcript_lg, transcript_language,
      quran_references, tags_json, language, status, featured,
      created_by, updated_by, published_by, created_at, updated_at, published_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `).run(
    id,
    title,
    String(body.titleAr || '').trim(),
    String(body.titleLg || '').trim(),
    String(body.description || '').trim(),
    String(body.descriptionAr || '').trim(),
    String(body.descriptionLg || '').trim(),
    String(body.contentType || 'lecture').trim() || 'lecture',
    categoryId || null,
    String(body.subcategory || '').trim(),
    seriesId || null,
    episodeNumber,
    String(body.speaker || '').trim(),
    String(body.date || '').trim(),
    String(body.location || '').trim(),
    body.coverImage ? String(body.coverImage).trim() : null,
    audio ? String(audio.url) : null,
    audio ? String(audio.path || '') : null,
    audio ? Number(audio.sizeBytes || 0) : null,
    audio ? Number(audio.durationSeconds || 0) : null,
    audio ? String(audio.format || '') : null,
    doc ? String(doc.url) : null,
    doc ? String(doc.path || '') : null,
    doc ? Number(doc.sizeBytes || 0) : null,
    doc ? String(doc.format || '') : null,
    doc ? String(doc.documentType || doc.format || 'pdf') : null,
    String(transcript.en || body.transcriptEn || '').trim(),
    String(transcript.ar || body.transcriptAr || '').trim(),
    String(transcript.lg || body.transcriptLg || '').trim(),
    String(transcript.language || body.language || 'en').trim() || 'en',
    String(body.quranReferences || '').trim(),
    JSON.stringify(tags),
    String(body.language || 'en').trim() || 'en',
    status,
    body.featured ? 1 : 0,
    req.user!.id,
    req.user!.id,
    publishedBy,
    now,
    now,
    publishedAt
  );

  const row = db.prepare(`${CONTENT_BASE_SELECT} WHERE c.id = ?`).get(id) as Record<string, unknown>;
  const item = mapContentRow(row);

  writeAuditLog({
    actor: req.user,
    action: 'CREATE_CONTENT',
    entityType: 'content',
    entityId: item.id,
    details: `Created "${item.title}" [${item.status}]`,
  });

  res.status(201).json({ item });
});

router.patch('/content/:id', requireRoles(CONTENT_EDITOR_ROLES), (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id || '').trim();
  const existingRow = db.prepare('SELECT * FROM content_items WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existingRow) {
    res.status(404).json({ error: 'Content item not found' });
    return;
  }

  const body = req.body || {};
  const title = body.title !== undefined ? String(body.title).trim() : String(existingRow.title);
  if (!title) {
    res.status(400).json({ error: 'Content title cannot be empty' });
    return;
  }

  const nextStatusRaw =
    body.status !== undefined ? String(body.status).trim().toUpperCase() : String(existingRow.status);
  const status: ContentStatus = VALID_STATUSES.has(nextStatusRaw as ContentStatus)
    ? (nextStatusRaw as ContentStatus)
    : (String(existingRow.status) as ContentStatus);

  const now = new Date().toISOString();
  const publishedAt =
    status === 'PUBLISHED'
      ? existingRow.published_at
        ? String(existingRow.published_at)
        : now
      : existingRow.published_at
        ? String(existingRow.published_at)
        : null;
  const publishedBy =
    status === 'PUBLISHED'
      ? existingRow.published_by
        ? String(existingRow.published_by)
        : req.user!.id
      : existingRow.published_by
        ? String(existingRow.published_by)
        : null;

  const tags =
    body.tags !== undefined
      ? Array.isArray(body.tags)
        ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
        : typeof body.tags === 'string'
          ? body.tags
              .split(',')
              .map((t: string) => t.trim())
              .filter(Boolean)
          : []
      : JSON.parse(String(existingRow.tags_json || '[]'));

  const oldAudioUrl = existingRow.audio_url ? String(existingRow.audio_url) : null;
  const oldDocUrl = existingRow.document_url ? String(existingRow.document_url) : null;
  const oldCoverUrl = existingRow.cover_image ? String(existingRow.cover_image) : null;

  const nextAudio =
    body.audio !== undefined
      ? body.audio && body.audio.url
        ? body.audio
        : null
      : oldAudioUrl
        ? {
            url: oldAudioUrl,
            path: existingRow.audio_path,
            sizeBytes: existingRow.audio_size_bytes,
            durationSeconds: existingRow.audio_duration_seconds,
            format: existingRow.audio_format,
          }
        : null;

  const nextDoc =
    body.document !== undefined
      ? body.document && body.document.url
        ? body.document
        : null
      : oldDocUrl
        ? {
            url: oldDocUrl,
            path: existingRow.document_path,
            sizeBytes: existingRow.document_size_bytes,
            format: existingRow.document_format,
            documentType: existingRow.document_type,
          }
        : null;

  const nextCover =
    body.coverImage !== undefined ? (body.coverImage ? String(body.coverImage).trim() : null) : oldCoverUrl;

  const transcript = body.transcript && typeof body.transcript === 'object' ? body.transcript : null;
  const transcriptEn =
    transcript?.en !== undefined
      ? String(transcript.en).trim()
      : body.transcriptEn !== undefined
        ? String(body.transcriptEn).trim()
        : String(existingRow.transcript_en || '');
  const transcriptAr =
    transcript?.ar !== undefined
      ? String(transcript.ar).trim()
      : body.transcriptAr !== undefined
        ? String(body.transcriptAr).trim()
        : String(existingRow.transcript_ar || '');
  const transcriptLg =
    transcript?.lg !== undefined
      ? String(transcript.lg).trim()
      : body.transcriptLg !== undefined
        ? String(body.transcriptLg).trim()
        : String(existingRow.transcript_lg || '');
  const transcriptLang =
    transcript?.language !== undefined
      ? String(transcript.language).trim()
      : String(existingRow.transcript_language || 'en');

  const episodeNumber =
    body.episodeNumber !== undefined
      ? body.episodeNumber !== null && body.episodeNumber !== ''
        ? parseInt(String(body.episodeNumber), 10) || null
        : null
      : existingRow.episode_number !== null && existingRow.episode_number !== undefined
        ? Number(existingRow.episode_number)
        : null;

  db.prepare(`
    UPDATE content_items SET
      title = ?, title_ar = ?, title_lg = ?,
      description = ?, description_ar = ?, description_lg = ?,
      content_type = ?, category_id = ?, subcategory = ?, series_id = ?, episode_number = ?,
      speaker = ?, date = ?, location = ?, cover_image = ?,
      audio_url = ?, audio_path = ?, audio_size_bytes = ?, audio_duration_seconds = ?, audio_format = ?,
      document_url = ?, document_path = ?, document_size_bytes = ?, document_format = ?, document_type = ?,
      transcript_en = ?, transcript_ar = ?, transcript_lg = ?, transcript_language = ?,
      quran_references = ?, tags_json = ?, language = ?, status = ?, featured = ?,
      updated_by = ?, published_by = ?, updated_at = ?, published_at = ?
    WHERE id = ?
  `).run(
    title,
    body.titleAr !== undefined ? String(body.titleAr).trim() : String(existingRow.title_ar || ''),
    body.titleLg !== undefined ? String(body.titleLg).trim() : String(existingRow.title_lg || ''),
    body.description !== undefined ? String(body.description).trim() : String(existingRow.description || ''),
    body.descriptionAr !== undefined
      ? String(body.descriptionAr).trim()
      : String(existingRow.description_ar || ''),
    body.descriptionLg !== undefined
      ? String(body.descriptionLg).trim()
      : String(existingRow.description_lg || ''),
    body.contentType !== undefined ? String(body.contentType).trim() : String(existingRow.content_type || 'lecture'),
    body.categoryId !== undefined ? (body.categoryId ? String(body.categoryId).trim() : null) : existingRow.category_id,
    body.subcategory !== undefined ? String(body.subcategory).trim() : String(existingRow.subcategory || ''),
    body.seriesId !== undefined ? (body.seriesId ? String(body.seriesId).trim() : null) : existingRow.series_id,
    episodeNumber,
    body.speaker !== undefined ? String(body.speaker).trim() : String(existingRow.speaker || ''),
    body.date !== undefined ? String(body.date).trim() : String(existingRow.date || ''),
    body.location !== undefined ? String(body.location).trim() : String(existingRow.location || ''),
    nextCover,
    nextAudio ? String(nextAudio.url) : null,
    nextAudio ? String(nextAudio.path || '') : null,
    nextAudio ? Number(nextAudio.sizeBytes || 0) : null,
    nextAudio ? Number(nextAudio.durationSeconds || 0) : null,
    nextAudio ? String(nextAudio.format || '') : null,
    nextDoc ? String(nextDoc.url) : null,
    nextDoc ? String(nextDoc.path || '') : null,
    nextDoc ? Number(nextDoc.sizeBytes || 0) : null,
    nextDoc ? String(nextDoc.format || '') : null,
    nextDoc ? String(nextDoc.documentType || nextDoc.format || 'pdf') : null,
    transcriptEn,
    transcriptAr,
    transcriptLg,
    transcriptLang,
    body.quranReferences !== undefined
      ? String(body.quranReferences).trim()
      : String(existingRow.quran_references || ''),
    JSON.stringify(tags),
    body.language !== undefined ? String(body.language).trim() : String(existingRow.language || 'en'),
    status,
    body.featured !== undefined ? (body.featured ? 1 : 0) : Number(existingRow.featured || 0),
    req.user!.id,
    publishedBy,
    now,
    publishedAt,
    id
  );

  // Clean up replaced media files if no longer referenced anywhere
  if (oldAudioUrl && oldAudioUrl !== (nextAudio?.url || null)) {
    deleteMediaFileIfUnreferenced(oldAudioUrl);
  }
  if (oldDocUrl && oldDocUrl !== (nextDoc?.url || null)) {
    deleteMediaFileIfUnreferenced(oldDocUrl);
  }
  if (oldCoverUrl && oldCoverUrl !== nextCover) {
    deleteMediaFileIfUnreferenced(oldCoverUrl);
  }

  const updatedRow = db.prepare(`${CONTENT_BASE_SELECT} WHERE c.id = ?`).get(id) as Record<string, unknown>;
  const item = mapContentRow(updatedRow);

  writeAuditLog({
    actor: req.user,
    action: 'UPDATE_CONTENT',
    entityType: 'content',
    entityId: item.id,
    details: `Updated "${item.title}" [${item.status}]`,
  });

  res.json({ item });
});

router.delete('/content/:id', requireRoles(CONTENT_EDITOR_ROLES), (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id || '').trim();
  const row = db.prepare('SELECT * FROM content_items WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Content item not found' });
    return;
  }

  const audioUrl = row.audio_url ? String(row.audio_url) : null;
  const docUrl = row.document_url ? String(row.document_url) : null;
  const coverUrl = row.cover_image ? String(row.cover_image) : null;
  const title = String(row.title);

  db.prepare('DELETE FROM content_items WHERE id = ?').run(id);

  deleteMediaFileIfUnreferenced(audioUrl);
  deleteMediaFileIfUnreferenced(docUrl);
  deleteMediaFileIfUnreferenced(coverUrl);

  writeAuditLog({
    actor: req.user,
    action: 'DELETE_CONTENT',
    entityType: 'content',
    entityId: id,
    details: `Permanently deleted "${title}" and unreferenced media files`,
  });

  res.json({ ok: true });
});

router.get('/qa', requireRoles(QA_MODERATOR_ROLES), (req, res) => {
  const status = String(req.query.status || '').trim().toUpperCase();
  let rows: Record<string, unknown>[];
  if (status && status !== 'ALL') {
    rows = db
      .prepare('SELECT * FROM qa_submissions WHERE status = ? ORDER BY created_at DESC')
      .all(status) as Record<string, unknown>[];
  } else {
    rows = db.prepare('SELECT * FROM qa_submissions ORDER BY created_at DESC').all() as Record<string, unknown>[];
  }
  res.json({ items: rows.map(mapQaRow) });
});

router.patch('/qa/:id', requireRoles(QA_MODERATOR_ROLES), (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id || '').trim();
  const existing = db.prepare('SELECT * FROM qa_submissions WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Q&A submission not found' });
    return;
  }

  const body = req.body || {};
  const action = String(body.action || 'save').trim().toLowerCase(); // 'save' | 'publish' | 'reject'
  const answerText =
    body.answerText !== undefined ? String(body.answerText).trim() : String(existing.answer_text || '');
  const answerTextAr =
    body.answerTextAr !== undefined ? String(body.answerTextAr).trim() : String(existing.answer_text_ar || '');
  const answerTextLg =
    body.answerTextLg !== undefined ? String(body.answerTextLg).trim() : String(existing.answer_text_lg || '');
  const topic = body.topic !== undefined ? String(body.topic).trim() : String(existing.topic || '');
  const speaker = String(body.speaker || req.user!.name).trim();

  const oldAudioUrl = existing.answer_audio_url ? String(existing.answer_audio_url) : null;
  const oldDocUrl = existing.answer_document_url ? String(existing.answer_document_url) : null;

  const nextAudio =
    body.answerAudio !== undefined
      ? body.answerAudio && body.answerAudio.url
        ? body.answerAudio
        : null
      : oldAudioUrl
        ? {
            url: oldAudioUrl,
            path: existing.answer_audio_path,
            sizeBytes: existing.answer_audio_size_bytes,
            format: existing.answer_audio_format,
          }
        : null;

  const nextDoc =
    body.answerDocument !== undefined
      ? body.answerDocument && body.answerDocument.url
        ? body.answerDocument
        : null
      : oldDocUrl
        ? {
            url: oldDocUrl,
            path: existing.answer_document_path,
            sizeBytes: existing.answer_document_size_bytes,
            format: existing.answer_document_format,
          }
        : null;

  const now = new Date().toISOString();
  let nextStatus = String(existing.status);
  let publishedContentId = existing.published_content_id ? String(existing.published_content_id) : null;

  if (action === 'reject') {
    nextStatus = 'REJECTED';
  } else if (action === 'publish') {
    if (!answerText && !answerTextAr && !answerTextLg && !nextAudio && !nextDoc) {
      res.status(400).json({ error: 'Provide an answer text, audio, or document before publishing' });
      return;
    }
    nextStatus = 'PUBLISHED';

    const qaCat = db.prepare(`SELECT id FROM categories WHERE id = 'cat_qa' OR slug = 'qa' LIMIT 1`).get() as
      | { id: string }
      | undefined;
    const qaCategoryId = qaCat?.id || null;
    const questionText = String(existing.question_text);
    const contentTitle = topic ? `${topic}: ${questionText.slice(0, 72)}` : questionText.slice(0, 90);
    const fullTranscriptEn = answerText ? `Question:\n${questionText}\n\nAnswer:\n${answerText}` : '';
    const fullTranscriptAr = answerTextAr ? `السؤال:\n${questionText}\n\nالجواب:\n${answerTextAr}` : '';
    const fullTranscriptLg = answerTextLg ? `Ekibuuzo:\n${questionText}\n\nOkuddamu:\n${answerTextLg}` : '';

    if (publishedContentId) {
      db.prepare(`
        UPDATE content_items SET
          title = ?, description = ?, category_id = ?, speaker = ?,
          audio_url = ?, audio_path = ?, audio_size_bytes = ?, audio_format = ?,
          document_url = ?, document_path = ?, document_size_bytes = ?, document_format = ?, document_type = ?,
          transcript_en = ?, transcript_ar = ?, transcript_lg = ?,
          status = 'PUBLISHED', updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(
        contentTitle,
        questionText,
        qaCategoryId,
        speaker,
        nextAudio ? String(nextAudio.url) : null,
        nextAudio ? String(nextAudio.path || '') : null,
        nextAudio ? Number(nextAudio.sizeBytes || 0) : null,
        nextAudio ? String(nextAudio.format || '') : null,
        nextDoc ? String(nextDoc.url) : null,
        nextDoc ? String(nextDoc.path || '') : null,
        nextDoc ? Number(nextDoc.sizeBytes || 0) : null,
        nextDoc ? String(nextDoc.format || '') : null,
        nextDoc ? String(nextDoc.format || 'pdf') : null,
        fullTranscriptEn,
        fullTranscriptAr,
        fullTranscriptLg,
        req.user!.id,
        now,
        publishedContentId
      );
    } else {
      publishedContentId = `cnt_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`
        INSERT INTO content_items (
          id, title, description, content_type, category_id, subcategory, speaker, date,
          audio_url, audio_path, audio_size_bytes, audio_format,
          document_url, document_path, document_size_bytes, document_format, document_type,
          transcript_en, transcript_ar, transcript_lg, transcript_language,
          tags_json, language, status, featured,
          created_by, updated_by, published_by, created_at, updated_at, published_at
        ) VALUES (
          ?, ?, ?, 'qa', ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, 'en',
          ?, 'en', 'PUBLISHED', 0,
          ?, ?, ?, ?, ?, ?
        )
      `).run(
        publishedContentId,
        contentTitle,
        questionText,
        qaCategoryId,
        topic,
        speaker,
        now.slice(0, 10),
        nextAudio ? String(nextAudio.url) : null,
        nextAudio ? String(nextAudio.path || '') : null,
        nextAudio ? Number(nextAudio.sizeBytes || 0) : null,
        nextAudio ? String(nextAudio.format || '') : null,
        nextDoc ? String(nextDoc.url) : null,
        nextDoc ? String(nextDoc.path || '') : null,
        nextDoc ? Number(nextDoc.sizeBytes || 0) : null,
        nextDoc ? String(nextDoc.format || '') : null,
        nextDoc ? String(nextDoc.format || 'pdf') : null,
        fullTranscriptEn,
        fullTranscriptAr,
        fullTranscriptLg,
        JSON.stringify(topic ? ['Q&A', topic] : ['Q&A']),
        req.user!.id,
        req.user!.id,
        req.user!.id,
        now,
        now,
        now
      );
    }
  } else if (answerText || answerTextAr || answerTextLg || nextAudio || nextDoc) {
    nextStatus = nextStatus === 'PUBLISHED' ? 'PUBLISHED' : 'ANSWERED';
  }

  db.prepare(`
    UPDATE qa_submissions SET
      topic = ?, status = ?,
      answer_text = ?, answer_text_ar = ?, answer_text_lg = ?,
      answer_audio_url = ?, answer_audio_path = ?, answer_audio_size_bytes = ?, answer_audio_format = ?,
      answer_document_url = ?, answer_document_path = ?, answer_document_size_bytes = ?, answer_document_format = ?,
      published_content_id = ?, answered_by = ?, updated_at = ?, answered_at = ?
    WHERE id = ?
  `).run(
    topic,
    nextStatus,
    answerText,
    answerTextAr,
    answerTextLg,
    nextAudio ? String(nextAudio.url) : null,
    nextAudio ? String(nextAudio.path || '') : null,
    nextAudio ? Number(nextAudio.sizeBytes || 0) : null,
    nextAudio ? String(nextAudio.format || '') : null,
    nextDoc ? String(nextDoc.url) : null,
    nextDoc ? String(nextDoc.path || '') : null,
    nextDoc ? Number(nextDoc.sizeBytes || 0) : null,
    nextDoc ? String(nextDoc.format || '') : null,
    publishedContentId,
    req.user!.id,
    now,
    nextStatus === 'ANSWERED' || nextStatus === 'PUBLISHED' ? now : existing.answered_at,
    id
  );

  if (oldAudioUrl && oldAudioUrl !== (nextAudio?.url || null)) {
    deleteMediaFileIfUnreferenced(oldAudioUrl);
  }
  if (oldDocUrl && oldDocUrl !== (nextDoc?.url || null)) {
    deleteMediaFileIfUnreferenced(oldDocUrl);
  }

  const updated = db.prepare('SELECT * FROM qa_submissions WHERE id = ?').get(id) as Record<string, unknown>;
  writeAuditLog({
    actor: req.user,
    action: `QA_${action.toUpperCase()}`,
    entityType: 'qa',
    entityId: id,
    details: `Q&A ${id} status -> ${nextStatus}`,
  });

  res.json({ item: mapQaRow(updated) });
});

router.delete('/qa/:id', requireRoles(QA_MODERATOR_ROLES), (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id || '').trim();
  const row = db.prepare('SELECT * FROM qa_submissions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Q&A submission not found' });
    return;
  }

  const audioUrl = row.answer_audio_url ? String(row.answer_audio_url) : null;
  const docUrl = row.answer_document_url ? String(row.answer_document_url) : null;

  db.prepare('DELETE FROM qa_submissions WHERE id = ?').run(id);

  deleteMediaFileIfUnreferenced(audioUrl);
  deleteMediaFileIfUnreferenced(docUrl);

  writeAuditLog({
    actor: req.user,
    action: 'DELETE_QA',
    entityType: 'qa',
    entityId: id,
    details: `Deleted Q&A entry ${id}`,
  });

  res.json({ ok: true });
});

router.post('/categories', requireRoles(CONTENT_EDITOR_ROLES), (req: AuthenticatedRequest, res) => {
  const nameEn = String(req.body?.nameEn || '').trim();
  const nameAr = String(req.body?.nameAr || '').trim();
  const nameLg = String(req.body?.nameLg || '').trim();
  const description = String(req.body?.description || '').trim();
  const rawSlug = String(req.body?.slug || nameEn).trim();
  const slug = slugify(rawSlug);

  if (!nameEn || !slug) {
    res.status(400).json({ error: 'English name and valid slug are required' });
    return;
  }

  const existing = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
  if (existing) {
    res.status(409).json({ error: `A category with slug "${slug}" already exists` });
    return;
  }

  const maxSortRow = db.prepare('SELECT COALESCE(MAX(sort_order), 6) AS max_sort FROM categories').get() as {
    max_sort: number;
  };
  const id = `cat_${slug}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO categories (id, slug, name_en, name_ar, name_lg, description, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, slug, nameEn, nameAr, nameLg, description, Number(maxSortRow.max_sort) + 1, now);

  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Record<string, unknown>;
  writeAuditLog({
    actor: req.user,
    action: 'CREATE_CATEGORY',
    entityType: 'category',
    entityId: id,
    details: `Created custom category "${nameEn}" (${slug})`,
  });

  res.status(201).json({ category: mapCategoryRow(row) });
});

router.delete('/categories/:id', requireRoles(CONTENT_EDITOR_ROLES), (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id || '').trim();
  if (CORE_CATEGORY_IDS.has(id)) {
    res.status(400).json({ error: 'Core structural taxonomy categories cannot be deleted' });
    return;
  }

  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  writeAuditLog({
    actor: req.user,
    action: 'DELETE_CATEGORY',
    entityType: 'category',
    entityId: id,
    details: `Deleted custom category "${String(row.name_en)}"`,
  });

  res.json({ ok: true });
});

router.post('/series', requireRoles(CONTENT_EDITOR_ROLES), (req: AuthenticatedRequest, res) => {
  const title = String(req.body?.title || '').trim();
  if (!title) {
    res.status(400).json({ error: 'Series title is required' });
    return;
  }

  const id = `ser_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO series (id, title, title_ar, title_lg, description, speaker, category_id, cover_image, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    String(req.body?.titleAr || '').trim(),
    String(req.body?.titleLg || '').trim(),
    String(req.body?.description || '').trim(),
    String(req.body?.speaker || '').trim(),
    req.body?.categoryId ? String(req.body.categoryId).trim() : null,
    req.body?.coverImage ? String(req.body.coverImage).trim() : null,
    now,
    now
  );

  const row = db
    .prepare(`
      SELECT s.*, cat.slug AS category_slug, cat.name_en AS category_name, 0 AS episode_count
      FROM series s LEFT JOIN categories cat ON cat.id = s.category_id
      WHERE s.id = ?
    `)
    .get(id) as Record<string, unknown>;

  writeAuditLog({
    actor: req.user,
    action: 'CREATE_SERIES',
    entityType: 'series',
    entityId: id,
    details: `Created series "${title}"`,
  });

  res.status(201).json({ series: mapSeriesRow(row) });
});

router.patch('/series/:id', requireRoles(CONTENT_EDITOR_ROLES), (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id || '').trim();
  const existing = db.prepare('SELECT * FROM series WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Series not found' });
    return;
  }

  const title = req.body?.title !== undefined ? String(req.body.title).trim() : String(existing.title);
  if (!title) {
    res.status(400).json({ error: 'Series title cannot be empty' });
    return;
  }

  const oldCover = existing.cover_image ? String(existing.cover_image) : null;
  const nextCover =
    req.body?.coverImage !== undefined
      ? req.body.coverImage
        ? String(req.body.coverImage).trim()
        : null
      : oldCover;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE series SET
      title = ?, title_ar = ?, title_lg = ?, description = ?, speaker = ?,
      category_id = ?, cover_image = ?, updated_at = ?
    WHERE id = ?
  `).run(
    title,
    req.body?.titleAr !== undefined ? String(req.body.titleAr).trim() : String(existing.title_ar || ''),
    req.body?.titleLg !== undefined ? String(req.body.titleLg).trim() : String(existing.title_lg || ''),
    req.body?.description !== undefined ? String(req.body.description).trim() : String(existing.description || ''),
    req.body?.speaker !== undefined ? String(req.body.speaker).trim() : String(existing.speaker || ''),
    req.body?.categoryId !== undefined
      ? req.body.categoryId
        ? String(req.body.categoryId).trim()
        : null
      : existing.category_id,
    nextCover,
    now,
    id
  );

  if (oldCover && oldCover !== nextCover) {
    deleteMediaFileIfUnreferenced(oldCover);
  }

  const row = db
    .prepare(`
      SELECT s.*, cat.slug AS category_slug, cat.name_en AS category_name,
        (SELECT COUNT(*) FROM content_items c WHERE c.series_id = s.id AND c.status = 'PUBLISHED') AS episode_count
      FROM series s LEFT JOIN categories cat ON cat.id = s.category_id
      WHERE s.id = ?
    `)
    .get(id) as Record<string, unknown>;

  res.json({ series: mapSeriesRow(row) });
});

router.delete('/series/:id', requireRoles(CONTENT_EDITOR_ROLES), (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id || '').trim();
  const row = db.prepare('SELECT * FROM series WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Series not found' });
    return;
  }

  const cover = row.cover_image ? String(row.cover_image) : null;
  db.prepare('DELETE FROM series WHERE id = ?').run(id);
  deleteMediaFileIfUnreferenced(cover);

  writeAuditLog({
    actor: req.user,
    action: 'DELETE_SERIES',
    entityType: 'series',
    entityId: id,
    details: `Deleted series "${String(row.title)}"`,
  });

  res.json({ ok: true });
});

router.post('/notifications', requireRoles(CONTENT_EDITOR_ROLES), (req: AuthenticatedRequest, res) => {
  const title = String(req.body?.title || '').trim();
  const message = String(req.body?.message || '').trim();
  if (!title || !message) {
    res.status(400).json({ error: 'Notification title and message are required' });
    return;
  }

  const id = `ntf_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();
  const contentId = req.body?.contentId ? String(req.body.contentId).trim() : null;

  db.prepare(`
    INSERT INTO notifications (id, title, title_ar, title_lg, message, message_ar, message_lg, type, content_id, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    String(req.body?.titleAr || '').trim(),
    String(req.body?.titleLg || '').trim(),
    message,
    String(req.body?.messageAr || '').trim(),
    String(req.body?.messageLg || '').trim(),
    String(req.body?.type || 'announcement').trim() || 'announcement',
    contentId || null,
    req.user!.id,
    now
  );

  const row = db
    .prepare(`
      SELECT n.*, c.title AS content_title
      FROM notifications n LEFT JOIN content_items c ON c.id = n.content_id
      WHERE n.id = ?
    `)
    .get(id) as Record<string, unknown>;

  writeAuditLog({
    actor: req.user,
    action: 'BROADCAST_NOTIFICATION',
    entityType: 'notification',
    entityId: id,
    details: `Broadcasted notification "${title}"`,
  });

  res.status(201).json({ notification: mapNotificationRow(row) });
});

router.delete('/notifications/:id', requireRoles(CONTENT_EDITOR_ROLES), (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id || '').trim();
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
  writeAuditLog({
    actor: req.user,
    action: 'DELETE_NOTIFICATION',
    entityType: 'notification',
    entityId: id,
    details: `Deleted notification "${String(row.title)}"`,
  });

  res.json({ ok: true });
});

router.get('/users', requireRoles(FULL_ADMIN_ROLES), (_req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as Record<string, unknown>[];
  res.json({ users: rows.map(mapUserRow) });
});

router.patch('/users/:id/role', requireRoles(['super_admin']), (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id || '').trim();
  const nextRole = String(req.body?.role || '').trim() as UserRole;

  if (!VALID_ROLES.has(nextRole)) {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (String(target.role) === 'super_admin' && nextRole !== 'super_admin') {
    const countRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'super_admin'`)
      .get() as { cnt: number };
    if (countRow.cnt <= 1) {
      res.status(409).json({ error: 'Cannot demote the sole remaining Super Admin' });
      return;
    }
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(nextRole, now, id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown>;

  writeAuditLog({
    actor: req.user,
    action: 'UPDATE_USER_ROLE',
    entityType: 'user',
    entityId: id,
    details: `Changed ${String(target.email)} role from ${String(target.role)} to ${nextRole}`,
  });

  res.json({ user: mapUserRow(updated) });
});

router.delete('/users/:id', requireRoles(['super_admin']), (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id || '').trim();
  if (id === req.user!.id) {
    res.status(400).json({ error: 'Use account settings if you intend to delete your own account' });
    return;
  }

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (String(target.role) === 'super_admin') {
    const countRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'super_admin'`)
      .get() as { cnt: number };
    if (countRow.cnt <= 1) {
      res.status(409).json({ error: 'Cannot delete the sole remaining Super Admin' });
      return;
    }
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  writeAuditLog({
    actor: req.user,
    action: 'DELETE_USER',
    entityType: 'user',
    entityId: id,
    details: `Removed user ${String(target.email)} (${String(target.role)})`,
  });

  res.json({ ok: true });
});

router.get('/connection', requireRoles(ADMIN_STUDIO_ROLES), (req, res) => {
  const envAppUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const derivedUrl = host ? `${proto}://${host}` : 'http://localhost:3000';
  const apiBaseUrl = envAppUrl && !envAppUrl.includes('MY_APP_URL') ? envAppUrl : derivedUrl;

  res.json({
    apiBaseUrl,
    defaultOrigins: DEFAULT_MOBILE_ORIGINS,
    envOrigins: getEnvOrigins(),
    customOrigins: getCustomDbOrigins(),
    activeOrigins: Array.from(getAllowedOriginsSet()),
  });
});

router.patch('/connection', requireRoles(FULL_ADMIN_ROLES), (req: AuthenticatedRequest, res) => {
  const rawList = Array.isArray(req.body?.customOrigins) ? req.body.customOrigins : null;
  if (!rawList) {
    res.status(400).json({ error: 'customOrigins array is required' });
    return;
  }

  const invalid: string[] = [];
  const valid: string[] = [];
  for (const raw of rawList) {
    const s = String(raw).trim();
    if (!s) continue;
    const normalized = normalizeOrigin(s);
    if (!normalized) {
      invalid.push(s);
    } else {
      valid.push(normalized);
    }
  }

  if (invalid.length > 0) {
    res.status(400).json({ error: `Invalid origin URL(s): ${invalid.join(', ')}` });
    return;
  }

  const saved = saveCustomDbOrigins(valid);
  writeAuditLog({
    actor: req.user,
    action: 'UPDATE_CORS_ORIGINS',
    entityType: 'settings',
    entityId: 'cors_allowed_origins',
    details: `Updated custom mobile CORS origins (${saved.length} configured)`,
  });

  res.json({
    customOrigins: saved,
    activeOrigins: Array.from(getAllowedOriginsSet()),
  });
});

export default router;
