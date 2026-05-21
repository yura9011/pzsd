import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './lib/http-error.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultPublicDir = path.resolve(currentDir, '../public');

export function createApp({ configFiles, systemd, publicDir = defaultPublicDir }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb' }));

  app.get('/api/config/ini', route(async (_req, res) => {
    res.json(await configFiles.read('ini'));
  }));

  app.patch('/api/config/ini', route(async (req, res) => {
    res.json(await configFiles.save('ini', req.body));
  }));

  app.get('/api/config/sandbox', route(async (_req, res) => {
    res.json(await configFiles.read('sandbox'));
  }));

  app.patch('/api/config/sandbox', route(async (req, res) => {
    res.json(await configFiles.save('sandbox', req.body));
  }));

  app.get('/api/config/backups', route(async (req, res) => {
    res.json({ backups: await configFiles.listBackups(req.query.file) });
  }));

  app.post('/api/config/backups/:backupId/restore', route(async (req, res) => {
    res.json(await configFiles.restore(req.params.backupId));
  }));

  app.get('/api/server/status', route(async (_req, res) => {
    res.json(await systemd.status());
  }));

  app.post('/api/server/restart', route(async (_req, res) => {
    res.json({
      restarted: true,
      status: await systemd.restart(),
    });
  }));

  app.use(express.static(publicDir, { extensions: ['html'] }));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use((req, _res, next) => {
    next(new HttpError(404, `Route not found: ${req.method} ${req.path}`));
  });

  app.use((error, _req, res, _next) => {
    const status = error.status || error.statusCode || 500;
    if (status >= 500) {
      console.error(error);
    }

    res.status(status).json({
      error: error.message || 'Unexpected server error.',
      details: error.details,
    });
  });

  return app;
}

function route(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
