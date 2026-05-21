import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { ConfigFileService } from '../src/lib/config-file-service.js';

test('config API reads masked settings, rejects added keys, and exposes restart status', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-panel-api-'));
  const configDir = path.join(root, 'Server');
  const backupDir = path.join(root, 'backups');
  await fs.mkdir(configDir, { recursive: true });
  await fs.copyFile(new URL('./fixtures/server.ini', import.meta.url), path.join(configDir, 'servertest.ini'));
  await fs.copyFile(new URL('./fixtures/sandbox.lua', import.meta.url), path.join(configDir, 'servertest_SandboxVars.lua'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const app = createApp({
    configFiles: new ConfigFileService({ configDir, backupDir, serverName: 'servertest' }),
    systemd: {
      async status() {
        return { unit: 'project-zomboid.service', available: true, online: true, activeState: 'active', subState: 'running' };
      },
      async restart() {
        return { unit: 'project-zomboid.service', available: true, online: true, activeState: 'active', subState: 'running' };
      },
    },
  });
  const api = await listen(t, app);

  const loaded = await fetch(`${api}/api/config/ini`).then((response) => response.json());
  assert.equal(loaded.settings.RCONPassword, null);

  const invalidSave = await fetch(`${api}/api/config/ini`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: loaded.revision, changes: { NewKey: 'nope' } }),
  });
  assert.equal(invalidSave.status, 400);

  const validSave = await fetch(`${api}/api/config/ini`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: loaded.revision, changes: { MaxPlayers: '24' } }),
  }).then((response) => response.json());
  assert.equal(validSave.settings.MaxPlayers, '24');
  assert.deepEqual(validSave.changedKeys, ['MaxPlayers']);

  const status = await fetch(`${api}/api/server/status`).then((response) => response.json());
  assert.equal(status.online, true);
  assert.equal(status.activeState, 'active');

  const restart = await fetch(`${api}/api/server/restart`, { method: 'POST' }).then((response) => response.json());
  assert.equal(restart.restarted, true);
});

async function listen(t, app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}
