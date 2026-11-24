import crypto from 'node:crypto';
import { Router } from 'express';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  CONTENT_BASE_SELECT,
  db,
  mapCategoryRow,
  mapContentRow,
  mapNotificationRow,
  mapQaRow,
  mapSeriesRow,
} from '../db.ts';
import type { ContentItem } from '../../src/types.ts';

const router = Router();

function buildSortClause(sortParam: string): string {
  switch (sortParam) {
    case 'popular':
      return 'ORDER BY (c.play_count + c.download_count) DESC, COALESCE(c.published_at, c.created_at) DESC';
    case 'episode':
      return 'ORDER BY COALESCE(c.episode_number, 999999) ASC, c.created_at ASC';
    case 'newest':
    default:
      return 'ORDER BY COALESCE(c.published_at, c.created_at) DESC, c.created_at DESC';
  }
}

router.get('/content', (req, res) => {
  const featured = String(req.query.featured || '').toLowerCase() === 'true';
  const category = String(req.query.category || '').trim();
  const seriesId = String(req.query.seriesId || '').trim();
  const media = String(req.query.media || '').trim().toLowerCase();
  const sort = String(req.query.sort || 'newest').trim().toLowerCase();

  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = [`c.status = 'PUBLISHED'`];
  const params: unknown[] = [];

  if (featured) {
    conditions.push('c.featured = 1');
  }
  if (category) {
    conditions.push('(cat.slug = ? OR c.category_id = ?)');
    params.push(category, category);
  }
  if (seriesId) {
    conditions.push('c.series_id = ?');
    params.push(seriesId);
  }
  if (media === 'audio') {
    conditions.push(`c.audio_url IS NOT NULL AND c.audio_url != ''`);
  } else if (media === 'document') {
    conditions.push(`c.document_url IS NOT NULL AND c.document_url != ''`);
  } else if (media === 'transcript') {
    conditions.push(`(c.transcript_en != '' OR c.transcript_ar != '' OR c.transcript_lg != '')`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const countSql = `
    SELECT COUNT(*) AS cnt
    FROM content_items c
    LEFT JOIN categories cat ON cat.id = c.category_id
    ${whereClause}
  `;
  const totalRow = db.prepare(countSql).get(...params) as { cnt: number };
  const total = totalRow.cnt;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const orderClause = buildSortClause(sort);
  const itemsSql = `
    ${CONTENT_BASE_SELECT}
    ${whereClause}
    ${orderClause}
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(itemsSql).all(...params, limit, offset) as Record<string, unknown>[];

  res.json({
    items: rows.map(mapContentRow),
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  });
});

router.get('/content/:id', optionalAuth, (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id || '').trim();
  const row = db.prepare(`${CONTENT_BASE_SELECT} WHERE c.id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Content item not found' });
    return;
  }

  const item = mapContentRow(row);
  const isStaff =
    req.user && ['content_editor', 'qa_moderator', 'administrator', 'super_admin'].includes(req.user.role);
  if (item.status !== 'PUBLISHED' && !isStaff) {
    res.status(404).json({ error: 'Content item not found' });
    return;
  }

  res.json({ item });
});

router.post('/content/:id/track', (req, res) => {
  const id = String(req.params.id || '').trim();
  const action = String(req.body?.action || '').trim().toLowerCase();

  if (action !== 'play' && action !== 'download') {
    res.status(400).json({ error: 'Invalid tracking action. Expected play or download' });
    return;
  }

  const existing = db.prepare(`SELECT id FROM content_items WHERE id = ? AND status = 'PUBLISHED'`).get(id);
  if (!existing) {
    res.status(404).json({ error: 'Published content item not found' });
    return;
  }

  if (action === 'play') {
    db.prepare('UPDATE content_items SET play_count = play_count + 1 WHERE id = ?').run(id);
  } else {
    db.prepare('UPDATE content_items SET download_count = download_count + 1 WHERE id = ?').run(id);
  }

  const updated = db.prepare(`${CONTENT_BASE_SELECT} WHERE c.id = ?`).get(id) as Record<string, unknown>;
  const item = mapContentRow(updated);
  res.json({
    ok: true,
    playCount: item.playCount,
    downloadCount: item.downloadCount,
    item,
  });
});

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  const media = String(req.query.media || '').trim().toLowerCase();
  const sort = String(req.query.sort || 'newest').trim().toLowerCase();
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '40'), 10) || 40));

  const conditions: string[] = [`c.status = 'PUBLISHED'`];
  const params: unknown[] = [];

  if (q) {
    const like = `%${q}%`;
    conditions.push(`(
      c.title LIKE ? OR c.title_ar LIKE ? OR c.title_lg LIKE ?
      OR c.description LIKE ? OR c.description_ar LIKE ? OR c.description_lg LIKE ?
      OR c.speaker LIKE ? OR c.quran_references LIKE ? OR c.tags_json LIKE ?
      OR c.transcript_en LIKE ? OR c.transcript_ar LIKE ? OR c.transcript_lg LIKE ?
      OR COALESCE(s.title, '') LIKE ?
    )`);
    for (let i = 0; i < 13; i += 1) {
      params.push(like);
    }
  }

  if (media === 'audio') {
    conditions.push(`c.audio_url IS NOT NULL AND c.audio_url != ''`);
  } else if (media === 'document') {
    conditions.push(`c.document_url IS NOT NULL AND c.document_url != ''`);
  } else if (media === 'transcript') {
    conditions.push(`(c.transcript_en != '' OR c.transcript_ar != '' OR c.transcript_lg != '')`);
  }

  const sql = `
    ${CONTENT_BASE_SELECT}
    WHERE ${conditions.join(' AND ')}
    ${buildSortClause(sort)}
    LIMIT ?
  `;
  const rows = db.prepare(sql).all(...params, limit) as Record<string, unknown>[];
  const items = rows.map(mapContentRow);

  const grouped: Record<string, ContentItem[]> = {};
  for (const item of items) {
    const key = item.categorySlug || 'uncategorized';
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(item);
  }

  res.json({
    total: items.length,
    grouped,
  });
});

router.get('/categories', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT cat.*, COUNT(c.id) AS item_count
      FROM categories cat
      LEFT JOIN content_items c ON c.category_id = cat.id AND c.status = 'PUBLISHED'
      GROUP BY cat.id
      ORDER BY cat.sort_order ASC, cat.name_en ASC
    `)
    .all() as Record<string, unknown>[];
  res.json({ categories: rows.map(mapCategoryRow) });
});

router.get('/series', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT
        s.*,
        cat.slug AS category_slug,
        cat.name_en AS category_name,
        COUNT(c.id) AS episode_count
      FROM series s
      LEFT JOIN categories cat ON cat.id = s.category_id
      LEFT JOIN content_items c ON c.series_id = s.id AND c.status = 'PUBLISHED'
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `)
    .all() as Record<string, unknown>[];
  res.json({ series: rows.map(mapSeriesRow) });
});

router.get('/notifications', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT n.*, c.title AS content_title
      FROM notifications n
      LEFT JOIN content_items c ON c.id = n.content_id
      ORDER BY n.created_at DESC
      LIMIT 100
    `)
    .all() as Record<string, unknown>[];
  res.json({ notifications: rows.map(mapNotificationRow) });
});

router.post('/qa/submit', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const topic = String(req.body?.topic || '').trim();
  const questionText = String(req.body?.questionText || '').trim();

  if (!questionText || questionText.length < 5) {
    res.status(400).json({ error: 'Question text is required (at least 5 characters)' });
    return;
  }

  const id = `qa_${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO qa_submissions (id, user_id, user_name, user_email, topic, question_text, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
  `).run(id, user.id, user.name, user.email, topic, questionText, now, now);

  const row = db.prepare('SELECT * FROM qa_submissions WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json({ item: mapQaRow(row) });
});

router.get('/user/qa', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM qa_submissions WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user!.id) as Record<string, unknown>[];
  res.json({ items: rows.map(mapQaRow) });
});

router.get('/user/favorites', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(`
      ${CONTENT_BASE_SELECT}
      INNER JOIN user_favorites f ON f.content_id = c.id
      WHERE f.user_id = ? AND c.status = 'PUBLISHED'
      ORDER BY f.created_at DESC
    `)
    .all(req.user!.id) as Record<string, unknown>[];
  res.json({ items: rows.map(mapContentRow) });
});

router.post('/user/favorites/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const contentId = String(req.params.id || '').trim();
  const exists = db.prepare(`SELECT id FROM content_items WHERE id = ? AND status = 'PUBLISHED'`).get(contentId);
  if (!exists) {
    res.status(404).json({ error: 'Published content item not found' });
    return;
  }
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO user_favorites (user_id, content_id, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, content_id) DO NOTHING
  `).run(req.user!.id, contentId, now);
  res.json({ ok: true });
});

router.delete('/user/favorites/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const contentId = String(req.params.id || '').trim();
  db.prepare('DELETE FROM user_favorites WHERE user_id = ? AND content_id = ?').run(req.user!.id, contentId);
  res.json({ ok: true });
});

router.get('/user/history', requireAuth, (req: AuthenticatedRequest, res) => {
  const listeningRows = db
    .prepare(`
      ${CONTENT_BASE_SELECT}
      INNER JOIN listening_history lh ON lh.content_id = c.id
      WHERE lh.user_id = ? AND c.status = 'PUBLISHED'
      ORDER BY lh.updated_at DESC
      LIMIT 100
    `)
    .all(req.user!.id) as Record<string, unknown>[];

  const listeningMetaRows = db
    .prepare('SELECT content_id, position_seconds, duration_seconds, completed, updated_at FROM listening_history WHERE user_id = ?')
    .all(req.user!.id) as Array<{
    content_id: string;
    position_seconds: number;
    duration_seconds: number;
    completed: number;
    updated_at: string;
  }>;
  const listeningMeta = new Map(listeningMetaRows.map((m) => [m.content_id, m]));

  const listening = listeningRows.map((row) => {
    const item = mapContentRow(row);
    const meta = listeningMeta.get(item.id);
    return {
      ...item,
      positionSeconds: meta?.position_seconds ?? 0,
      durationSeconds: meta?.duration_seconds ?? 0,
      completed: Boolean(meta?.completed),
      lastAccessedAt: meta?.updated_at ?? item.updatedAt,
    };
  });

  const readingRows = db
    .prepare(`
      ${CONTENT_BASE_SELECT}
      INNER JOIN reading_history rh ON rh.content_id = c.id
      WHERE rh.user_id = ? AND c.status = 'PUBLISHED'
      ORDER BY rh.updated_at DESC
      LIMIT 100
    `)
    .all(req.user!.id) as Record<string, unknown>[];

  const readingMetaRows = db
    .prepare('SELECT content_id, scroll_percent, updated_at FROM reading_history WHERE user_id = ?')
    .all(req.user!.id) as Array<{
    content_id: string;
    scroll_percent: number;
    updated_at: string;
  }>;
  const readingMeta = new Map(readingMetaRows.map((m) => [m.content_id, m]));

  const reading = readingRows.map((row) => {
    const item = mapContentRow(row);
    const meta = readingMeta.get(item.id);
    return {
      ...item,
      scrollPercent: meta?.scroll_percent ?? 0,
      lastAccessedAt: meta?.updated_at ?? item.updatedAt,
    };
  });

  res.json({ listening, reading });
});

router.post('/user/history/listening', requireAuth, (req: AuthenticatedRequest, res) => {
  const contentId = String(req.body?.contentId || '').trim();
  const positionSeconds = Math.max(0, Math.floor(Number(req.body?.positionSeconds || 0)));
  const durationSeconds = Math.max(0, Math.floor(Number(req.body?.durationSeconds || 0)));
  const completed = req.body?.completed ? 1 : 0;

  if (!contentId) {
    res.status(400).json({ error: 'contentId is required' });
    return;
  }
  const exists = db.prepare('SELECT id FROM content_items WHERE id = ?').get(contentId);
  if (!exists) {
    res.status(404).json({ error: 'Content item not found' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO listening_history (user_id, content_id, position_seconds, duration_seconds, completed, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, content_id) DO UPDATE SET
      position_seconds = excluded.position_seconds,
      duration_seconds = excluded.duration_seconds,
      completed = excluded.completed,
      updated_at = excluded.updated_at
  `).run(req.user!.id, contentId, positionSeconds, durationSeconds, completed, now);

  res.json({ ok: true });
});

router.post('/user/history/reading', requireAuth, (req: AuthenticatedRequest, res) => {
  const contentId = String(req.body?.contentId || '').trim();
  const scrollPercent = Math.min(100, Math.max(0, Number(req.body?.scrollPercent || 0)));

  if (!contentId) {
    res.status(400).json({ error: 'contentId is required' });
    return;
  }
  const exists = db.prepare('SELECT id FROM content_items WHERE id = ?').get(contentId);
  if (!exists) {
    res.status(404).json({ error: 'Content item not found' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO reading_history (user_id, content_id, scroll_percent, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, content_id) DO UPDATE SET
      scroll_percent = excluded.scroll_percent,
      updated_at = excluded.updated_at
  `).run(req.user!.id, contentId, scrollPercent, now);

  res.json({ ok: true });
});

export default router;
