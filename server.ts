import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { corsMiddleware } from './server/cors.ts';
import { initDatabase } from './server/db.ts';
import adminRoutes from './server/routes/adminRoutes.ts';
import authRoutes from './server/routes/authRoutes.ts';
import publicRoutes from './server/routes/publicRoutes.ts';
import { streamMediaHandler } from './server/storage.ts';

const PORT = 3000;

async function startServer() {
  initDatabase();

  const app = express();
  app.set('trust proxy', 1);

  // Explicit allowlisted CORS middleware (never wildcard '*')
  app.use(corsMiddleware);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health probe
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'minaratul-huda-studio' });
  });

  // Media streaming with HTTP Range (206 Partial Content) support
  app.get('/api/media/:bucket/:filename', streamMediaHandler);

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', publicRoutes);

  // API 404 fallback (keep JSON clean for mobile & admin API calls)
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Error handler for Multer & unexpected JSON/server errors
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: `Upload error: ${err.message}` });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProduction && fs.existsSync(path.resolve(process.cwd(), 'vite.config.ts'))) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Minaratul Huda Admin & Content Studio listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
