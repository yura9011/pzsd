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

  const loadedMods = await fetch(`${api}/api/mods`).then((response) => response.json());
  assert.deepEqual(loadedMods.workshopItems, ['12345', '98765']);

  const savedMods = await fetch(`${api}/api/mods`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision: loadedMods.revision,
      workshopItems: ['98765', '12345'],
      mods: ['MapMod', 'CoreMod', 'PackAddon'],
    }),
  }).then((response) => response.json());
  assert.deepEqual(savedMods.changedKeys, ['WorkshopItems', 'Mods']);
  assert.equal(savedMods.restartRequired, true);

  const status = await fetch(`${api}/api/server/status`).then((response) => response.json());
  assert.equal(status.online, true);
  assert.equal(status.activeState, 'active');

  const restart = await fetch(`${api}/api/server/restart`, { method: 'POST' }).then((response) => response.json());
  assert.equal(restart.restarted, true);
});

test('spawn API returns default regions without file and saves enabled-only regions', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-panel-spawn-'));
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

  const loaded = await fetch(`${api}/api/config/spawn`).then((response) => response.json());
  assert.equal(loaded.regions.length, 4);
  assert.equal(loaded.regions[0].name, 'Muldraugh, KY');
  assert.equal(loaded.revision, null);

  const saved = await fetch(`${api}/api/config/spawn`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision: null,
      regions: [
        { name: 'Rosewood, KY', file: 'media/maps/Rosewood, KY/spawnpoints.lua', isServerFile: false, enabled: true },
        { name: 'Riverside, KY', file: 'media/maps/Riverside, KY/spawnpoints.lua', isServerFile: false, enabled: false },
      ],
    }),
  }).then((response) => response.json());

  assert.deepEqual(saved.changedKeys, ['spawnregions']);
  assert.equal(saved.restartRequired, true);
  assert.equal(saved.regions.length, 2);
  assert.equal(saved.regions[0].enabled, true);
  assert.equal(saved.regions[1].enabled, false);

  const reloaded = await fetch(`${api}/api/config/spawn`).then((response) => response.json());
  assert.equal(reloaded.regions.length, 1);
  assert.equal(reloaded.regions[0].name, 'Rosewood, KY');
  assert.equal(reloaded.regions[0].enabled, true);
  assert.equal(typeof reloaded.revision, 'string');
});

async function listen(t, app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}
