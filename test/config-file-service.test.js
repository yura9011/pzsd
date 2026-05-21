import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConfigFileService } from '../src/lib/config-file-service.js';

test('config service masks secrets, saves existing values, and creates restoreable backups', async (t) => {
  const env = await createTempConfig(t);
  const service = new ConfigFileService(env);

  const loaded = await service.read('ini');
  assert.equal(loaded.settings.Password, null);
  assert.equal(loaded.metadata.Password.hasValue, true);

  const saved = await service.save('ini', {
    revision: loaded.revision,
    changes: { MaxPlayers: '32', UnknownTuning: 'value:changed' },
  });
  assert.equal(saved.restartRequired, true);
  assert.deepEqual(saved.changedKeys, ['MaxPlayers', 'UnknownTuning']);

  const diskAfterSave = await fs.readFile(path.join(env.configDir, 'servertest.ini'), 'utf8');
  assert.match(diskAfterSave, /MaxPlayers=32/);
  assert.match(diskAfterSave, /UnknownTuning=value:changed/);
  assert.match(diskAfterSave, /Password=join-secret/);

  const backups = await service.listBackups('ini');
  assert.equal(backups.length, 1);

  const restored = await service.restore(backups[0].id);
  assert.equal(restored.restartRequired, true);
  const diskAfterRestore = await fs.readFile(path.join(env.configDir, 'servertest.ini'), 'utf8');
  assert.match(diskAfterRestore, /MaxPlayers=16/);
});

test('config service refuses new keys, read-only mods, newline injection, and stale revisions', async (t) => {
  const env = await createTempConfig(t);
  const service = new ConfigFileService(env);
  const loaded = await service.read('ini');

  await assert.rejects(
    service.save('ini', { revision: loaded.revision, changes: { NewKey: 'new' } }),
    (error) => error.status === 400 && /does not exist/.test(error.message),
  );

  await assert.rejects(
    service.save('ini', { revision: loaded.revision, changes: { Mods: 'replacement' } }),
    (error) => error.status === 400 && /read-only/.test(error.message),
  );

  await assert.rejects(
    service.save('ini', { revision: loaded.revision, changes: { MaxPlayers: '32\nRCONPassword=hacked' } }),
    (error) => error.status === 400 && /invalid config characters/.test(error.message),
  );

  await fs.appendFile(path.join(env.configDir, 'servertest.ini'), '\nConcurrentEdit=true\n');
  await assert.rejects(
    service.save('ini', { revision: loaded.revision, changes: { MaxPlayers: '24' } }),
    (error) => error.status === 409,
  );
});

test('config service keeps the newest 20 backups per file and rejects corrupt sandbox backups', async (t) => {
  const env = await createTempConfig(t);
  const service = new ConfigFileService(env);

  for (let index = 0; index < 21; index += 1) {
    const loaded = await service.read('ini');
    await service.save('ini', {
      revision: loaded.revision,
      changes: { MaxPlayers: String(20 + index) },
    });
  }

  assert.equal((await service.listBackups('ini')).length, 20);

  await fs.mkdir(env.backupDir, { recursive: true });
  const corruptId = 'sandbox--corrupt.bak';
  await fs.writeFile(path.join(env.backupDir, corruptId), 'not a sandbox file');
  await assert.rejects(
    service.restore(corruptId),
    (error) => error.status === 400 && /Sandbox backup/.test(error.message),
  );
});

test('config service updates nested sandbox entries without writing new paths', async (t) => {
  const env = await createTempConfig(t);
  const service = new ConfigFileService(env);
  const loaded = await service.read('sandbox');

  const saved = await service.save('sandbox', {
    revision: loaded.revision,
    changes: {
      'ZombieLore.Speed': '3',
      StarterKit: true,
    },
  });

  assert.equal(saved.restartRequired, true);
  const content = await fs.readFile(path.join(env.configDir, 'servertest_SandboxVars.lua'), 'utf8');
  assert.match(content, /Speed = 3,/);
  assert.match(content, /StarterKit = true,/);

  await assert.rejects(
    service.save('sandbox', {
      revision: saved.revision,
      changes: { 'Unknown.Section': 'value' },
    }),
    (error) => error.status === 400 && /does not exist/.test(error.message),
  );
});

async function createTempConfig(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-panel-'));
  const configDir = path.join(root, 'Server');
  const backupDir = path.join(root, 'backups');
  await fs.mkdir(configDir, { recursive: true });
  await fs.copyFile(new URL('./fixtures/server.ini', import.meta.url), path.join(configDir, 'servertest.ini'));
  await fs.copyFile(new URL('./fixtures/sandbox.lua', import.meta.url), path.join(configDir, 'servertest_SandboxVars.lua'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { configDir, backupDir, serverName: 'servertest' };
}
