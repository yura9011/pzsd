import crypto from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './lib/http-error.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultPublicDir = path.resolve(currentDir, '../public');

export function createApp({ configFiles, systemd, auth, publicDir = defaultPublicDir }) {
  if (!auth || typeof auth.password !== 'string' || auth.password === '') {
    throw new Error('Panel auth configuration must include a password.');
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb' }));

  const sessions = new Map();
  const sessionTtlMs = readSessionTtlMs(process.env);

  function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return next(new HttpError(401, 'Authentication required.'));
    }

    const token = header.slice(7);
    const session = sessions.get(token);
    if (!session) {
      return next(new HttpError(401, 'Invalid or expired token.'));
    }

    if (Date.now() - session.createdAt > sessionTtlMs) {
      sessions.delete(token);
      return next(new HttpError(401, 'Invalid or expired token.'));
    }

    next();
  }

  app.post('/api/auth/login', route(async (req, res) => {
    const { username, password } = req.body || {};
    if (username !== auth.username || password !== auth.password) {
      throw new HttpError(401, 'Invalid username or password.');
    }

    const token = crypto.randomUUID();
    sessions.set(token, { username, createdAt: Date.now() });
    res.json({ token });
  }));

  app.post('/api/auth/logout', route(async (req, res) => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      sessions.delete(header.slice(7));
    }
    res.json({ ok: true });
  }));

  app.get('/api/auth/check', requireAuth, route(async (_req, res) => {
    res.json({ ok: true });
  }));

  app.get('/api/config/ini', requireAuth, route(async (_req, res) => {
    res.json(await configFiles.read('ini'));
  }));

  app.patch('/api/config/ini', requireAuth, route(async (req, res) => {
    validateConfigPatchChanges(req.body);
    res.json(await configFiles.save('ini', req.body));
  }));

  app.get('/api/config/sandbox', requireAuth, route(async (_req, res) => {
    res.json(await configFiles.read('sandbox'));
  }));

  app.patch('/api/config/sandbox', requireAuth, route(async (req, res) => {
    validateConfigPatchChanges(req.body);
    res.json(await configFiles.save('sandbox', req.body));
  }));

  app.get('/api/mods', requireAuth, route(async (_req, res) => {
    res.json(await configFiles.readMods());
  }));

  app.patch('/api/mods', requireAuth, route(async (req, res) => {
    res.json(await configFiles.saveMods(req.body));
  }));

  app.get('/api/config/spawn', requireAuth, route(async (_req, res) => {
    res.json(await configFiles.readSpawn());
  }));

  app.patch('/api/config/spawn', requireAuth, route(async (req, res) => {
    res.json(await configFiles.saveSpawn(req.body));
  }));

  app.get('/api/config/backups', requireAuth, route(async (req, res) => {
    res.json({ backups: await configFiles.listBackups(req.query.file) });
  }));

  app.post('/api/config/backups/:backupId/restore', requireAuth, route(async (req, res) => {
    res.json(await configFiles.restore(req.params.backupId));
  }));

  app.get('/api/server/status', requireAuth, route(async (_req, res) => {
    res.json(await systemd.status());
  }));

  app.post('/api/server/restart', requireAuth, route(async (_req, res) => {
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

function readSessionTtlMs(env) {
  const ttlHours = Number(env.SESSION_TTL_HOURS ?? 8);
  if (!Number.isFinite(ttlHours) || ttlHours < 0) {
    return 8 * 60 * 60 * 1000;
  }

  return ttlHours * 60 * 60 * 1000;
}

function validateConfigPatchChanges(payload) {
  if (!isPlainRecord(payload?.changes)) {
    throw new HttpError(400, 'changes must be an object keyed by existing settings.');
  }

  for (const [key, value] of Object.entries(payload.changes)) {
    const stringValue = String(value);
    if (stringValue.length > 512) {
      throw new HttpError(400, `${key} exceeds the maximum config value length.`);
    }

    if (/[\u0000-\u001f\u007f]/.test(stringValue)) {
      throw new HttpError(400, `${key} contains unsafe control characters.`);
    }
  }
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.prototype.toString.call(value) === '[object Object]';
}
