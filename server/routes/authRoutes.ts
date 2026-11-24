import crypto from 'node:crypto';
import { Router } from 'express';
import {
  hashPassword,
  requireAuth,
  signAuthToken,
  verifyPassword,
  verifyTimingSafeSecret,
  type AuthenticatedRequest,
} from '../auth.ts';
import { db, mapUserRow, writeAuditLog } from '../db.ts';
import type { UserProfile } from '../../src/types.ts';

const router = Router();

function getBootstrapStatus() {
  const row = db
    .prepare(`SELECT COUNT(*) AS cnt FROM users WHERE role IN ('super_admin', 'administrator')`)
    .get() as { cnt: number };
  const passcode = (process.env.BOOTSTRAP_ADMIN_PASSCODE || '').trim();
  return {
    hasAdmin: row.cnt > 0,
    requiresPasscode: passcode.length > 0,
  };
}

router.get('/bootstrap-status', (_req, res) => {
  res.json(getBootstrapStatus());
});

router.post('/bootstrap-admin', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const passcode = String(req.body?.passcode || '');

  if (!name || name.length < 2) {
    res.status(400).json({ error: 'Full name is required (at least 2 characters)' });
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Valid email address is required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const expectedPasscode = (process.env.BOOTSTRAP_ADMIN_PASSCODE || '').trim();
  if (expectedPasscode.length > 0) {
    if (!passcode || !verifyTimingSafeSecret(passcode, expectedPasscode)) {
      res.status(403).json({ error: 'Invalid bootstrap administrator passcode' });
      return;
    }
  }

  const tx = db.transaction((): UserProfile | 'ALREADY_EXISTS' | 'EMAIL_TAKEN' => {
    const adminCheck = db
      .prepare(`SELECT COUNT(*) AS cnt FROM users WHERE role IN ('super_admin', 'administrator')`)
      .get() as { cnt: number };
    if (adminCheck.cnt > 0) {
      return 'ALREADY_EXISTS';
    }

    const emailCheck = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (emailCheck) {
      return 'EMAIL_TAKEN';
    }

    const id = `usr_${crypto.randomBytes(8).toString('hex')}`;
    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, password_salt, role, preferred_language, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'super_admin', 'en', ?, ?)
    `).run(id, name, email, hash, salt, now, now);

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown>;
    return mapUserRow(row);
  });

  const result = tx();
  if (result === 'ALREADY_EXISTS') {
    res.status(409).json({ error: 'An administrator account has already been claimed' });
    return;
  }
  if (result === 'EMAIL_TAKEN') {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }

  const token = signAuthToken(result);
  writeAuditLog({
    actor: result,
    action: 'BOOTSTRAP_SUPER_ADMIN',
    entityType: 'user',
    entityId: result.id,
    details: `Initial Super Admin claimed by ${result.email}`,
  });

  res.status(201).json({ token, user: result });
});

router.post('/register', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const preferredLanguage = String(req.body?.preferredLanguage || 'en').trim() || 'en';

  if (!name || name.length < 2) {
    res.status(400).json({ error: 'Name is required (at least 2 characters)' });
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Valid email address is required' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }

  const id = `usr_${crypto.randomBytes(8).toString('hex')}`;
  const { hash, salt } = hashPassword(password);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, password_salt, role, preferred_language, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'registered_user', ?, ?, ?)
  `).run(id, name, email, hash, salt, preferredLanguage, now, now);

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown>;
  const user = mapUserRow(row);
  const token = signAuthToken(user);

  res.status(201).json({ token, user });
});

router.post('/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as Record<string, unknown> | undefined;
  if (!row || !verifyPassword(password, String(row.password_hash), String(row.password_salt))) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const user = mapUserRow(row);
  const token = signAuthToken(user);
  res.json({ token, user });
});

router.post('/reset-password', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Valid email address is required' });
    return;
  }

  // Only allow direct password update when currentPassword is verified.
  if (currentPassword && newPassword) {
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as Record<string, unknown> | undefined;
    if (!row || !verifyPassword(currentPassword, String(row.password_hash), String(row.password_salt))) {
      res.status(401).json({ error: 'Current password verification failed' });
      return;
    }
    const { hash, salt } = hashPassword(newPassword);
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?').run(
      hash,
      salt,
      now,
      String(row.id)
    );
    res.json({ message: 'Password updated successfully.' });
    return;
  }

  res.json({
    message:
      'If an account matches this email address, password recovery instructions have been logged. Please contact an administrator for manual credential reset.',
  });
});

router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

router.patch('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : user.name;
  const preferredLanguage =
    req.body?.preferredLanguage !== undefined
      ? String(req.body.preferredLanguage).trim()
      : user.preferredLanguage;
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!name || name.length < 2) {
    res.status(400).json({ error: 'Name must be at least 2 characters' });
    return;
  }

  const now = new Date().toISOString();

  if (newPassword) {
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as Record<string, unknown>;
    if (!currentPassword || !verifyPassword(currentPassword, String(row.password_hash), String(row.password_salt))) {
      res.status(401).json({ error: 'Current password is required to change your password' });
      return;
    }
    const { hash, salt } = hashPassword(newPassword);
    db.prepare(
      'UPDATE users SET name = ?, preferred_language = ?, password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?'
    ).run(name, preferredLanguage || 'en', hash, salt, now, user.id);
  } else {
    db.prepare('UPDATE users SET name = ?, preferred_language = ?, updated_at = ? WHERE id = ?').run(
      name,
      preferredLanguage || 'en',
      now,
      user.id
    );
  }

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as Record<string, unknown>;
  res.json({ user: mapUserRow(updated) });
});

router.delete('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  if (user.role === 'super_admin') {
    const countRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'super_admin'`)
      .get() as { cnt: number };
    if (countRow.cnt <= 1) {
      res.status(409).json({ error: 'Cannot delete the sole remaining Super Admin account' });
      return;
    }
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.json({ message: 'Account permanently deleted' });
});

export default router;
