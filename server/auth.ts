import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, mapUserRow } from './db.ts';
import type { UserProfile, UserRole } from '../src/types.ts';

const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash: derived, salt: actualSalt };
}

export function verifyPassword(password: string, expectedHash: string, salt: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expectedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

export function verifyTimingSafeSecret(input: string, expected: string): boolean {
  const inputHash = crypto.createHash('sha256').update(input).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(inputHash, expectedHash);
}

interface TokenPayload {
  sub: string;
  role: UserRole;
  iat: number;
  exp: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function signAuthToken(user: UserProfile): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: user.id,
    role: user.role,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const headerPart = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'MH1' }));
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const data = `${headerPart}.${payloadPart}`;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest();
  return `${data}.${base64UrlEncode(sig)}`;
}

export function verifyAuthToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, sigPart] = parts;
    const data = `${headerPart}.${payloadPart}`;
    const expectedSig = base64UrlEncode(crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest());

    const sigBuf = Buffer.from(sigPart);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(payloadPart)) as TokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.sub || !payload.exp || payload.exp < now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function extractUserFromHeader(req: Request): UserProfile | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const payload = verifyAuthToken(token);
  if (!payload) return null;

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapUserRow(row);
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const user = extractUserFromHeader(req);
  if (user) {
    req.user = user;
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const user = extractUserFromHeader(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.user = user;
  next();
}

export function requireRoles(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = extractUserFromHeader(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this action' });
      return;
    }
    req.user = user;
    next();
  };
}

export const ADMIN_STUDIO_ROLES: UserRole[] = [
  'qa_moderator',
  'content_editor',
  'administrator',
  'super_admin',
];

export const CONTENT_EDITOR_ROLES: UserRole[] = [
  'content_editor',
  'administrator',
  'super_admin',
];

export const QA_MODERATOR_ROLES: UserRole[] = [
  'qa_moderator',
  'administrator',
  'super_admin',
];

export const FULL_ADMIN_ROLES: UserRole[] = ['administrator', 'super_admin'];
