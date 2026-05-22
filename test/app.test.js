import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { ConfigApplyService } from '../src/lib/config-apply-service.js';
import { ConfigFileService } from '../src/lib/config-file-service.js';
import { LiveRconService } from '../src/lib/live-rcon-service.js';

const TEST_AUTH = { username: 'panel-test', password: 'panel-password' };

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
    auth: TEST_AUTH,
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
  const unauthorized = await fetch(`${api}/api/config/ini`);
  assert.equal(unauthorized.status, 401);
  const token = await login(api);

  const loaded = await fetch(`${api}/api/config/ini`, {
    headers: authHeaders(token),
  }).then((response) => response.json());
  assert.equal(loaded.settings.RCONPassword, null);

  const invalidSave = await fetch(`${api}/api/config/ini`, {
    method: 'PATCH',
    headers: authHeaders(token, true),
    body: JSON.stringify({ revision: loaded.revision, changes: { NewKey: 'nope' } }),
  });
  assert.equal(invalidSave.status, 400);

  const controlCharacterSave = await fetch(`${api}/api/config/ini`, {
    method: 'PATCH',
    headers: authHeaders(token, true),
    body: JSON.stringify({ revision: loaded.revision, changes: { UnknownTuning: 'bad\tvalue' } }),
  });
  assert.equal(controlCharacterSave.status, 400);

  const oversizedSave = await fetch(`${api}/api/config/sandbox`, {
    method: 'PATCH',
    headers: authHeaders(token, true),
    body: JSON.stringify({ revision: loaded.revision, changes: { StarterKit: 'x'.repeat(513) } }),
  });
  assert.equal(oversizedSave.status, 400);

  const validSave = await fetch(`${api}/api/config/ini`, {
    method: 'PATCH',
    headers: authHeaders(token, true),
    body: JSON.stringify({ revision: loaded.revision, changes: { MaxPlayers: '24' } }),
  }).then((response) => response.json());
  assert.equal(validSave.settings.MaxPlayers, '24');
  assert.deepEqual(validSave.changedKeys, ['MaxPlayers']);

  const loadedMods = await fetch(`${api}/api/mods`, {
    headers: authHeaders(token),
  }).then((response) => response.json());
  assert.deepEqual(loadedMods.workshopItems, ['12345', '98765']);

  const savedMods = await fetch(`${api}/api/mods`, {
    method: 'PATCH',
    headers: authHeaders(token, true),
    body: JSON.stringify({
      revision: loadedMods.revision,
      workshopItems: ['98765', '12345'],
      mods: ['MapMod', 'CoreMod', 'PackAddon'],
    }),
  }).then((response) => response.json());
  assert.deepEqual(savedMods.changedKeys, ['WorkshopItems', 'Mods']);
  assert.equal(savedMods.restartRequired, true);

  const status = await fetch(`${api}/api/server/status`, {
    headers: authHeaders(token),
  }).then((response) => response.json());
  assert.equal(status.online, true);
  assert.equal(status.activeState, 'active');

  const restart = await fetch(`${api}/api/server/restart`, {
    method: 'POST',
    headers: authHeaders(token),
  }).then((response) => response.json());
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
    auth: TEST_AUTH,
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
  const token = await login(api);

  const loaded = await fetch(`${api}/api/config/spawn`, {
    headers: authHeaders(token),
  }).then((response) => response.json());
  assert.equal(loaded.regions.length, 4);
  assert.equal(loaded.regions[0].name, 'Muldraugh, KY');
  assert.equal(loaded.revision, null);

  const saved = await fetch(`${api}/api/config/spawn`, {
    method: 'PATCH',
    headers: authHeaders(token, true),
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

  const reloaded = await fetch(`${api}/api/config/spawn`, {
    headers: authHeaders(token),
  }).then((response) => response.json());
  assert.equal(reloaded.regions.length, 1);
  assert.equal(reloaded.regions[0].name, 'Rosewood, KY');
  assert.equal(reloaded.regions[0].enabled, true);
  assert.equal(typeof reloaded.revision, 'string');
});

test('auth sessions expire by TTL and logout invalidates tokens', async (t) => {
  const previousTtl = process.env.SESSION_TTL_HOURS;
  t.after(() => restoreEnv('SESSION_TTL_HOURS', previousTtl));

  process.env.SESSION_TTL_HOURS = '0';
  const expiringApi = await listen(t, createAuthOnlyApp());
  const expiringToken = await login(expiringApi);
  await new Promise((resolve) => setTimeout(resolve, 5));

  const expired = await fetch(`${expiringApi}/api/auth/check`, {
    headers: authHeaders(expiringToken),
  });
  assert.equal(expired.status, 401);

  process.env.SESSION_TTL_HOURS = '8';
  const logoutApi = await listen(t, createAuthOnlyApp());
  const logoutToken = await login(logoutApi);
  const logout = await fetch(`${logoutApi}/api/auth/logout`, {
    method: 'POST',
    headers: authHeaders(logoutToken),
  });
  assert.equal(logout.status, 200);

  const loggedOut = await fetch(`${logoutApi}/api/auth/check`, {
    headers: authHeaders(logoutToken),
  });
  assert.equal(loggedOut.status, 401);
});

test('live API reports RCON state, players, commands, save, and broadcast', async (t) => {
  const commands = [];
  const app = createApp({
    auth: TEST_AUTH,
    configFiles: {},
    systemd: {},
    live: new LiveRconService({
      rcon: {
        isConfigured() {
          return true;
        },
        async status() {},
        async execute(command) {
          commands.push(command);
          return command === 'players'
            ? 'Players connected (2):\n-Alex\n-Sam\n'
            : `ran ${command}`;
        },
      },
      clock: () => new Date('2026-05-21T19:30:00.000Z'),
    }),
  });
  const api = await listen(t, app);

  const unauthorized = await fetch(`${api}/api/live/rcon/status`);
  assert.equal(unauthorized.status, 401);

  const token = await login(api);
  const status = await fetch(`${api}/api/live/rcon/status`, {
    headers: authHeaders(token),
  }).then((response) => response.json());
  assert.equal(status.ready, true);

  const players = await fetch(`${api}/api/live/players`, {
    headers: authHeaders(token),
  }).then((response) => response.json());
  assert.deepEqual(players.players, ['Alex', 'Sam']);
  assert.equal(players.count, 2);

  const invalidCommand = await fetch(`${api}/api/live/commands`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ command: 'save\nquit' }),
  });
  assert.equal(invalidCommand.status, 400);

  const command = await fetch(`${api}/api/live/commands`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ command: 'help' }),
  }).then((response) => response.json());
  assert.equal(command.response, 'ran help');

  const save = await fetch(`${api}/api/live/save`, {
    method: 'POST',
    headers: authHeaders(token),
  }).then((response) => response.json());
  assert.equal(save.command, 'save');

  const broadcast = await fetch(`${api}/api/live/broadcast`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ message: 'Be ready "now"' }),
  }).then((response) => response.json());
  assert.equal(broadcast.message, 'Be ready "now"');
  assert.deepEqual(commands, [
    'players',
    'help',
    'save',
    'servermsg "Be ready \\"now\\""',
  ]);
});

test('apply status API is authenticated and applies current INI revisions', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-panel-apply-api-'));
  const configDir = path.join(root, 'Server');
  const backupDir = path.join(root, 'backups');
  await fs.mkdir(configDir, { recursive: true });
  await fs.copyFile(new URL('./fixtures/server.ini', import.meta.url), path.join(configDir, 'servertest.ini'));
  await fs.copyFile(new URL('./fixtures/sandbox.lua', import.meta.url), path.join(configDir, 'servertest_SandboxVars.lua'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const configFiles = new ConfigFileService({ configDir, backupDir, serverName: 'servertest' });
  const systemd = {
    async status() {
      return {
        unit: 'project-zomboid.service',
        available: true,
        online: true,
        activeSince: '2026-05-21T20:30:00.000Z',
      };
    },
  };
  const live = {
    async status() {
      return { ready: true };
    },
    async execute(command) {
      return {
        command,
        response: command === 'showoptions' ? '* Public=true\n* MaxPlayers=16\n' : 'Options reloaded',
        executedAt: '2026-05-21T20:05:00.000Z',
      };
    },
  };
  const app = createApp({
    auth: TEST_AUTH,
    configFiles,
    systemd,
    live,
    configApply: new ConfigApplyService({ configFiles, systemd, live }),
  });
  const api = await listen(t, app);

  assert.equal((await fetch(`${api}/api/config/apply-status?surface=ini`)).status, 401);
  const token = await login(api);
  const invalidSurface = await fetch(`${api}/api/config/apply-status?surface=world`, {
    headers: authHeaders(token),
  });
  assert.equal(invalidSurface.status, 400);

  const loaded = await fetch(`${api}/api/config/ini`, {
    headers: authHeaders(token),
  }).then((response) => response.json());
  const applied = await fetch(`${api}/api/config/ini/apply`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ revision: loaded.revision }),
  }).then((response) => response.json());
  assert.equal(applied.applied, true);
  assert.equal(applied.status.state, 'runtime_matches_disk');
});

async function listen(t, app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function login(api) {
  const response = await fetch(`${api}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_AUTH),
  });
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

function authHeaders(token, json = false) {
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

function createAuthOnlyApp() {
  return createApp({
    auth: TEST_AUTH,
    configFiles: {},
    systemd: {},
  });
}

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
