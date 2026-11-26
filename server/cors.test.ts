import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import express from 'express';
import { createServer, type Server } from 'node:http';

let server: Server;
let baseUrl: string;
let testDirectory: string;
let originalDirectory: string;
let closeDatabase: (() => void) | undefined;

before(async () => {
  originalDirectory = process.cwd();
  testDirectory = mkdtempSync(path.join(tmpdir(), 'minaratul-cors-test-'));
  process.chdir(testDirectory);

  const { db, initDatabase } = await import('./db.ts');
  initDatabase();
  closeDatabase = () => db.close();

  const { corsMiddleware } = await import('./cors.ts');
  const app = express();
  app.use(corsMiddleware);
  app.get('/api/test', (_req, res) => res.sendStatus(204));

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  closeDatabase?.();
  process.chdir(originalDirectory);
  rmSync(testDirectory, { recursive: true, force: true });
});

test('allows the Capacitor Android WebView origin', async () => {
  const response = await fetch(`${baseUrl}/api/test`, {
    headers: {
      Host: 'api.example.test',
      Origin: 'https://localhost',
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://localhost');
});

test('rejects origins outside the explicit allowlist', async () => {
  const response = await fetch(`${baseUrl}/api/test`, {
    headers: {
      Host: 'api.example.test',
      Origin: 'https://unlisted.example',
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Origin not allowed by CORS policy' });
});
