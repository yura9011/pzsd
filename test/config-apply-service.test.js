import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  compareIniRuntime,
  ConfigApplyService,
  parseShowOptionsResponse,
} from '../src/lib/config-apply-service.js';
import { ConfigFileService } from '../src/lib/config-file-service.js';

test('apply status infers restart loading for disk-backed surfaces', async (t) => {
  const { configFiles, configDir } = await createConfigFiles(t);
  await fs.utimes(
    path.join(configDir, 'servertest_SandboxVars.lua'),
    new Date('2026-05-21T20:00:00.000Z'),
    new Date('2026-05-21T20:00:00.000Z'),
  );
  let activeSince = '2026-05-21T19:30:00.000Z';
  const service = new ConfigApplyService({
    configFiles,
    systemd: statusSystemd(() => activeSince),
    live: unavailableLive(),
  });

  const sandbox = await service.status('sandbox');
  assert.equal(sandbox.state, 'restart_required');
  assert.equal(sandbox.canApplyLive, false);

  activeSince = '2026-05-21T20:30:00.000Z';
  const loaded = await service.status('sandbox');
  assert.equal(loaded.state, 'loaded_after_restart');

  activeSince = null;
  const unknown = await service.status('sandbox');
  assert.equal(unknown.state, 'runtime_unknown');

  const mods = await service.status('mods');
  assert.equal(mods.surface, 'mods');
  assert.equal(mods.revision, (await configFiles.read('ini')).revision);

  const spawn = await service.status('spawn');
  assert.equal(spawn.revision, null);
  assert.equal(spawn.state, 'runtime_unknown');
});

test('INI apply status avoids RCON work until live apply is requested', async (t) => {
  const { configFiles } = await createConfigFiles(t);
  const service = new ConfigApplyService({
    configFiles,
    systemd: statusSystemd(() => '2026-05-21T20:30:00.000Z'),
    live: {
      async status() {
        throw new Error('status should not run during status reads');
      },
      async execute() {
        throw new Error('showoptions should not run during status reads');
      },
    },
  });

  const status = await service.status('ini');
  assert.equal(status.canApplyLive, true);
  assert.equal(status.comparison, undefined);
});

test('INI runtime comparison parses showoptions and skips sensitive mismatches', async (t) => {
  const { configFiles } = await createConfigFiles(t);
  const snapshot = await configFiles.readApplySnapshot('ini');
  assert.deepEqual(parseShowOptionsResponse('Options:\n* Public=true\n * MaxPlayers = 16\nnoise'), {
    Public: 'true',
    MaxPlayers: '16',
  });

  const comparison = compareIniRuntime(snapshot, [
    '* Public=true',
    '* MaxPlayers=24',
    '* RCONPassword=runtime-secret',
    '* Mods=RuntimeMod',
    '* WorkshopItems=99999',
  ].join('\n'));
  assert.equal(comparison.comparableCount, 2);
  assert.deepEqual(comparison.mismatchedKeys, ['MaxPlayers']);
  assert.equal(comparison.matches, false);
});

test('INI apply reloads options, verifies runtime, and rejects stale revisions', async (t) => {
  const { configFiles } = await createConfigFiles(t);
  const commands = [];
  const service = new ConfigApplyService({
    configFiles,
    systemd: statusSystemd(() => '2026-05-21T20:30:00.000Z'),
    live: {
      async status() {
        return { ready: true };
      },
      async execute(command) {
        commands.push(command);
        return {
          command,
          response: command === 'showoptions'
            ? '* Public=true\n* MaxPlayers=16\n* Password=runtime-secret\n'
            : 'Options reloaded',
          executedAt: '2026-05-21T20:05:00.000Z',
        };
      },
    },
  });
  const snapshot = await configFiles.readApplySnapshot('ini');

  const applied = await service.applyIni({ revision: snapshot.revision });
  assert.equal(applied.applied, true);
  assert.equal(applied.command, 'reloadoptions');
  assert.equal(applied.status.state, 'runtime_matches_disk');
  assert.deepEqual(commands, ['reloadoptions', 'showoptions']);

  await assert.rejects(
    service.applyIni({ revision: 'stale' }),
    (error) => error.status === 409,
  );
});

test('INI apply leaves RCON failures API-safe', async (t) => {
  const { configFiles } = await createConfigFiles(t);
  const service = new ConfigApplyService({
    configFiles,
    systemd: statusSystemd(() => '2026-05-21T20:30:00.000Z'),
    live: unavailableLive(),
  });
  const snapshot = await configFiles.readApplySnapshot('ini');

  await assert.rejects(
    service.applyIni({ revision: snapshot.revision }),
    (error) => error.status === 502 && error.message === 'RCON password is not configured.',
  );
});

test('INI apply rejects reloadoptions responses that do not confirm a reload', async (t) => {
  const { configFiles } = await createConfigFiles(t);
  const service = new ConfigApplyService({
    configFiles,
    systemd: statusSystemd(() => '2026-05-21T20:30:00.000Z'),
    live: {
      async status() {
        return { ready: true };
      },
      async execute(command) {
        return {
          command,
          response: 'Unknown command',
          executedAt: '2026-05-21T20:05:00.000Z',
        };
      },
    },
  });
  const snapshot = await configFiles.readApplySnapshot('ini');

  await assert.rejects(
    service.applyIni({ revision: snapshot.revision }),
    (error) => error.status === 502 && error.message === 'RCON returned an unrecognized reloadoptions response.',
  );
});

async function createConfigFiles(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-panel-apply-'));
  const configDir = path.join(root, 'Server');
  const backupDir = path.join(root, 'backups');
  await fs.mkdir(configDir, { recursive: true });
  await fs.copyFile(new URL('./fixtures/server.ini', import.meta.url), path.join(configDir, 'servertest.ini'));
  await fs.copyFile(new URL('./fixtures/sandbox.lua', import.meta.url), path.join(configDir, 'servertest_SandboxVars.lua'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return {
    configDir,
    configFiles: new ConfigFileService({ configDir, backupDir, serverName: 'servertest' }),
  };
}

function statusSystemd(activeSince) {
  return {
    async status() {
      return {
        available: true,
        online: true,
        activeSince: activeSince(),
      };
    },
  };
}

function unavailableLive() {
  return {
    async status() {
      return {
        ready: false,
        error: 'RCON password is not configured.',
      };
    },
  };
}
