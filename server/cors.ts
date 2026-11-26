import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

export const DEFAULT_MOBILE_ORIGINS = [
  'https://ais-dev-zymz3oiw77fxtlicqfjix7-460913006770.europe-west2.run.app',
  'https://ais-pre-zymz3oiw77fxtlicqfjix7-460913006770.europe-west2.run.app',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'https://localhost',
];

export function normalizeOrigin(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function getEnvOrigins(): string[] {
  const raw = process.env.ALLOWED_MOBILE_ORIGINS || '';
  const origins = raw
    .split(',')
    .map((s) => normalizeOrigin(s))
    .filter((v): v is string => Boolean(v));

  if (process.env.APP_URL) {
    const appOrigin = normalizeOrigin(process.env.APP_URL);
    if (appOrigin && !origins.includes(appOrigin)) {
      origins.push(appOrigin);
    }
  }
  return origins;
}

export function getCustomDbOrigins(): string[] {
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get('cors_allowed_origins') as { value: string } | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeOrigin(String(item)))
      .filter((v): v is string => Boolean(v));
  } catch {
    return [];
  }
}

export function saveCustomDbOrigins(origins: string[]): string[] {
  const unique = Array.from(
    new Set(origins.map((o) => normalizeOrigin(o)).filter((v): v is string => Boolean(v)))
  );
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('cors_allowed_origins', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(JSON.stringify(unique), now);
  return unique;
}

export function getAllowedOriginsSet(): Set<string> {
  return new Set([
    ...DEFAULT_MOBILE_ORIGINS,
    ...getEnvOrigins(),
    ...getCustomDbOrigins(),
  ]);
}

function isOriginAllowed(origin: string, req: Request): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  const allowed = getAllowedOriginsSet();
  if (allowed.has(normalized)) return true;

  // Also allow exact same-host origin when served behind reverse proxy / Cloud Run
  const forwardedHost = req.get('x-forwarded-host') || req.get('host');
  if (forwardedHost) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const hostOrigin = normalizeOrigin(`${proto}://${forwardedHost}`);
    const httpsHostOrigin = normalizeOrigin(`https://${forwardedHost}`);
    const httpHostOrigin = normalizeOrigin(`http://${forwardedHost}`);
    if (normalized === hostOrigin || normalized === httpsHostOrigin || normalized === httpHostOrigin) {
      return true;
    }
  }

  return false;
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    if (!origin || isOriginAllowed(origin, req)) {
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
      res.status(204).end();
      return;
    }
    res.status(403).json({ error: 'Origin not allowed by CORS policy' });
    return;
  }

  if (origin) {
    if (isOriginAllowed(origin, req)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    } else if (req.path.startsWith('/api/')) {
      res.status(403).json({ error: 'Origin not allowed by CORS policy' });
      return;
    }
  }

  next();
}
