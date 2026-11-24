import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AuditLogEntry,
  CategoryItem,
  ContentItem,
  ContentStatus,
  NotificationItem,
  QASubmission,
  QAStatus,
  SeriesItem,
  UserProfile,
  UserRole,
} from '../src/types.ts';

export const DATA_DIR = path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'minaratul_huda.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const CORE_CATEGORY_IDS = new Set([
  'cat_tafseer',
  'cat_hadith',
  'cat_speeches',
  'cat_qa',
  'cat_lectures',
  'cat_documents',
]);

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'registered_user',
      preferred_language TEXT NOT NULL DEFAULT 'en',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name_en TEXT NOT NULL,
      name_ar TEXT NOT NULL DEFAULT '',
      name_lg TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS series (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      title_ar TEXT NOT NULL DEFAULT '',
      title_lg TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      speaker TEXT NOT NULL DEFAULT '',
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      cover_image TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      title_ar TEXT NOT NULL DEFAULT '',
      title_lg TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      description_ar TEXT NOT NULL DEFAULT '',
      description_lg TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL DEFAULT 'lecture',
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      subcategory TEXT NOT NULL DEFAULT '',
      series_id TEXT REFERENCES series(id) ON DELETE SET NULL,
      episode_number INTEGER,
      speaker TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      cover_image TEXT,
      audio_url TEXT,
      audio_path TEXT,
      audio_size_bytes INTEGER,
      audio_duration_seconds INTEGER,
      audio_format TEXT,
      document_url TEXT,
      document_path TEXT,
      document_size_bytes INTEGER,
      document_format TEXT,
      document_type TEXT,
      transcript_en TEXT NOT NULL DEFAULT '',
      transcript_ar TEXT NOT NULL DEFAULT '',
      transcript_lg TEXT NOT NULL DEFAULT '',
      transcript_language TEXT NOT NULL DEFAULT 'en',
      quran_references TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      language TEXT NOT NULL DEFAULT 'en',
      status TEXT NOT NULL DEFAULT 'PUBLISHED',
      featured INTEGER NOT NULL DEFAULT 0,
      play_count INTEGER NOT NULL DEFAULT 0,
      download_count INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      updated_by TEXT,
      published_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT
    );

    CREATE TABLE IF NOT EXISTS qa_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL DEFAULT '',
      user_email TEXT NOT NULL DEFAULT '',
      topic TEXT NOT NULL DEFAULT '',
      question_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      answer_text TEXT NOT NULL DEFAULT '',
      answer_text_ar TEXT NOT NULL DEFAULT '',
      answer_text_lg TEXT NOT NULL DEFAULT '',
      answer_audio_url TEXT,
      answer_audio_path TEXT,
      answer_audio_size_bytes INTEGER,
      answer_audio_format TEXT,
      answer_document_url TEXT,
      answer_document_path TEXT,
      answer_document_size_bytes INTEGER,
      answer_document_format TEXT,
      published_content_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
      answered_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      answered_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      title_ar TEXT NOT NULL DEFAULT '',
      title_lg TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      message_ar TEXT NOT NULL DEFAULT '',
      message_lg TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'announcement',
      content_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, content_id)
    );

    CREATE TABLE IF NOT EXISTS listening_history (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
      position_seconds INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, content_id)
    );

    CREATE TABLE IF NOT EXISTS reading_history (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
      scroll_percent REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, content_id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      actor_name TEXT NOT NULL DEFAULT '',
      actor_email TEXT NOT NULL DEFAULT '',
      actor_role TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_content_status_cat ON content_items(status, category_id);
    CREATE INDEX IF NOT EXISTS idx_content_series ON content_items(series_id);
    CREATE INDEX IF NOT EXISTS idx_qa_status ON qa_submissions(status);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
  `);

  // Seed ONLY the 6 structural category taxonomy rows if empty.
  const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM categories').get() as { cnt: number };
  if (countRow.cnt === 0) {
    const now = new Date().toISOString();
    const insertCat = db.prepare(`
      INSERT INTO categories (id, slug, name_en, name_ar, name_lg, description, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const coreCategories = [
      ['cat_tafseer', 'tafseer', 'Tafseer Quran', 'تفسير القرآن', 'Tafseer ya Kuraani', 'Quranic exegesis and verse-by-verse commentary', 1],
      ['cat_hadith', 'hadith', 'Hadith', 'الحديث الشريف', 'Hadith', 'Prophetic traditions, narrations, and commentary', 2],
      ['cat_speeches', 'speeches', 'Speeches', 'الخطب والمواعظ', 'Okubuulira', 'Friday khutbahs, public addresses, and reminders', 3],
      ['cat_qa', 'qa', 'Q&A', 'الفتاوى والأسئلة', 'Ebibuuzo n’Okuddamu', 'Scholarly answers to community questions', 4],
      ['cat_lectures', 'lectures', 'Lectures & Lessons', 'الدروس والمحاضرات', 'Ebyokuyiga', 'Structured Islamic lessons and thematic lectures', 5],
      ['cat_documents', 'documents', 'Documents & Library', 'المكتبة والوثائق', 'Ebitabo n’Ebiwandiiko', 'PDFs, study guides, transcripts, and written works', 6],
    ] as const;

    const tx = db.transaction(() => {
      for (const [id, slug, nameEn, nameAr, nameLg, description, sortOrder] of coreCategories) {
        insertCat.run(id, slug, nameEn, nameAr, nameLg, description, sortOrder, now);
      }
    });
    tx();
  }
}

export function mapUserRow(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: String(row.role) as UserRole,
    preferredLanguage: String(row.preferred_language || 'en'),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapCategoryRow(row: Record<string, unknown>): CategoryItem {
  const id = String(row.id);
  return {
    id,
    slug: String(row.slug),
    nameEn: String(row.name_en),
    nameAr: String(row.name_ar || ''),
    nameLg: String(row.name_lg || ''),
    description: String(row.description || ''),
    sortOrder: Number(row.sort_order ?? 0),
    isCore: CORE_CATEGORY_IDS.has(id),
    itemCount: row.item_count !== undefined ? Number(row.item_count) : undefined,
    createdAt: String(row.created_at),
  };
}

export function mapSeriesRow(row: Record<string, unknown>): SeriesItem {
  return {
    id: String(row.id),
    title: String(row.title),
    titleAr: String(row.title_ar || ''),
    titleLg: String(row.title_lg || ''),
    description: String(row.description || ''),
    speaker: String(row.speaker || ''),
    categoryId: row.category_id ? String(row.category_id) : null,
    categorySlug: row.category_slug ? String(row.category_slug) : null,
    categoryName: row.category_name ? String(row.category_name) : null,
    coverImage: row.cover_image ? String(row.cover_image) : null,
    episodeCount: row.episode_count !== undefined ? Number(row.episode_count) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapContentRow(row: Record<string, unknown>): ContentItem {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(String(row.tags_json || '[]'));
    if (Array.isArray(parsed)) {
      tags = parsed.map((t) => String(t)).filter(Boolean);
    }
  } catch {
    tags = [];
  }

  const transcriptEn = String(row.transcript_en || '');
  const transcriptAr = String(row.transcript_ar || '');
  const transcriptLg = String(row.transcript_lg || '');
  const hasTranscript = Boolean(transcriptEn || transcriptAr || transcriptLg);

  return {
    id: String(row.id),
    title: String(row.title),
    titleAr: String(row.title_ar || ''),
    titleLg: String(row.title_lg || ''),
    description: String(row.description || ''),
    descriptionAr: String(row.description_ar || ''),
    descriptionLg: String(row.description_lg || ''),
    contentType: String(row.content_type || 'lecture'),
    categoryId: row.category_id ? String(row.category_id) : null,
    categorySlug: String(row.category_slug || ''),
    categoryName: String(row.category_name || ''),
    categoryNameAr: String(row.category_name_ar || ''),
    categoryNameLg: String(row.category_name_lg || ''),
    subcategory: String(row.subcategory || ''),
    seriesId: row.series_id ? String(row.series_id) : null,
    seriesTitle: row.series_title ? String(row.series_title) : null,
    episodeNumber: row.episode_number !== null && row.episode_number !== undefined ? Number(row.episode_number) : null,
    speaker: String(row.speaker || ''),
    date: String(row.date || ''),
    location: String(row.location || ''),
    coverImage: row.cover_image ? String(row.cover_image) : null,
    audio: row.audio_url
      ? {
          url: String(row.audio_url),
          path: String(row.audio_path || ''),
          sizeBytes: Number(row.audio_size_bytes || 0),
          durationSeconds: Number(row.audio_duration_seconds || 0),
          format: String(row.audio_format || ''),
        }
      : null,
    document: row.document_url
      ? {
          url: String(row.document_url),
          path: String(row.document_path || ''),
          sizeBytes: Number(row.document_size_bytes || 0),
          format: String(row.document_format || ''),
          documentType: String(row.document_type || 'pdf'),
        }
      : null,
    transcript: hasTranscript
      ? {
          en: transcriptEn,
          ar: transcriptAr,
          lg: transcriptLg,
          language: String(row.transcript_language || 'en'),
        }
      : null,
    quranReferences: String(row.quran_references || ''),
    tags,
    language: String(row.language || 'en'),
    status: String(row.status || 'PUBLISHED') as ContentStatus,
    featured: Number(row.featured || 0) === 1,
    playCount: Number(row.play_count || 0),
    downloadCount: Number(row.download_count || 0),
    createdBy: row.created_by ? String(row.created_by) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    publishedBy: row.published_by ? String(row.published_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    publishedAt: row.published_at ? String(row.published_at) : null,
  };
}

export function mapQaRow(row: Record<string, unknown>): QASubmission {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    userName: String(row.user_name || ''),
    userEmail: String(row.user_email || ''),
    topic: String(row.topic || ''),
    questionText: String(row.question_text),
    status: String(row.status || 'PENDING') as QAStatus,
    answerText: String(row.answer_text || ''),
    answerTextAr: String(row.answer_text_ar || ''),
    answerTextLg: String(row.answer_text_lg || ''),
    answerAudio: row.answer_audio_url
      ? {
          url: String(row.answer_audio_url),
          path: String(row.answer_audio_path || ''),
          sizeBytes: Number(row.answer_audio_size_bytes || 0),
          durationSeconds: 0,
          format: String(row.answer_audio_format || ''),
        }
      : null,
    answerDocument: row.answer_document_url
      ? {
          url: String(row.answer_document_url),
          path: String(row.answer_document_path || ''),
          sizeBytes: Number(row.answer_document_size_bytes || 0),
          format: String(row.answer_document_format || ''),
          documentType: String(row.answer_document_format || 'pdf'),
        }
      : null,
    publishedContentId: row.published_content_id ? String(row.published_content_id) : null,
    answeredBy: row.answered_by ? String(row.answered_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    answeredAt: row.answered_at ? String(row.answered_at) : null,
  };
}

export function mapNotificationRow(row: Record<string, unknown>): NotificationItem {
  return {
    id: String(row.id),
    title: String(row.title),
    titleAr: String(row.title_ar || ''),
    titleLg: String(row.title_lg || ''),
    message: String(row.message),
    messageAr: String(row.message_ar || ''),
    messageLg: String(row.message_lg || ''),
    type: String(row.type || 'announcement'),
    contentId: row.content_id ? String(row.content_id) : null,
    contentTitle: row.content_title ? String(row.content_title) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
  };
}

export function mapAuditLogRow(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: String(row.id),
    actorId: row.actor_id ? String(row.actor_id) : null,
    actorName: String(row.actor_name || ''),
    actorEmail: String(row.actor_email || ''),
    actorRole: String(row.actor_role || ''),
    action: String(row.action),
    entityType: String(row.entity_type),
    entityId: row.entity_id ? String(row.entity_id) : null,
    details: String(row.details || ''),
    createdAt: String(row.created_at),
  };
}

export function writeAuditLog(params: {
  actor?: UserProfile | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: string;
}): void {
  const id = `aud_${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_name, actor_email, actor_role, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.actor?.id ?? null,
    params.actor?.name ?? 'System',
    params.actor?.email ?? '',
    params.actor?.role ?? 'system',
    params.action,
    params.entityType,
    params.entityId ?? null,
    params.details ?? '',
    now
  );
}

export const CONTENT_BASE_SELECT = `
  SELECT
    c.*,
    cat.slug AS category_slug,
    cat.name_en AS category_name,
    cat.name_ar AS category_name_ar,
    cat.name_lg AS category_name_lg,
    s.title AS series_title
  FROM content_items c
  LEFT JOIN categories cat ON cat.id = c.category_id
  LEFT JOIN series s ON s.id = c.series_id
`;
