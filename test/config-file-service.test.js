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

test('mods surface saves ordered WorkshopItems and Mods lists through server.ini backups', async (t) => {
  const env = await createTempConfig(t);
  const service = new ConfigFileService(env);

  const loaded = await service.readMods();
  assert.deepEqual(loaded.workshopItems, ['12345', '98765']);
  assert.deepEqual(loaded.mods, ['CoreMod', 'MapMod']);

  const unchanged = await service.saveMods({
    revision: loaded.revision,
    workshopItems: loaded.workshopItems,
    mods: loaded.mods,
  });
  assert.deepEqual(unchanged.changedKeys, []);
  assert.equal(unchanged.restartRequired, false);
  assert.equal((await service.listBackups('ini')).length, 0);

  const saved = await service.saveMods({
    revision: loaded.revision,
    workshopItems: ['98765', '12345', '11111'],
    mods: ['MapMod', 'PackCore', 'PackUI', 'CoreMod'],
  });

  assert.deepEqual(saved.changedKeys, ['WorkshopItems', 'Mods']);
  assert.equal(saved.restartRequired, true);
  assert.deepEqual(saved.workshopItems, ['98765', '12345', '11111']);
  assert.deepEqual(saved.mods, ['MapMod', 'PackCore', 'PackUI', 'CoreMod']);

  const content = await fs.readFile(path.join(env.configDir, 'servertest.ini'), 'utf8');
  assert.match(content, /WorkshopItems=98765;12345;11111/);
  assert.match(content, /Mods=MapMod;PackCore;PackUI;CoreMod/);
  assert.match(content, /# B42-style dedicated server fixture/);
  assert.equal((await service.listBackups('ini')).length, 1);
});

test('mods surface rejects invalid lists, stale revisions, and missing source keys', async (t) => {
  const env = await createTempConfig(t);
  const service = new ConfigFileService(env);
  const loaded = await service.readMods();

  await assert.rejects(
    service.saveMods({ revision: loaded.revision, workshopItems: ['abc'], mods: loaded.mods }),
    (error) => error.status === 400 && /numeric Steam Workshop IDs/.test(error.message),
  );

  await assert.rejects(
    service.saveMods({ revision: loaded.revision, workshopItems: loaded.workshopItems, mods: ['CoreMod', 'CoreMod'] }),
    (error) => error.status === 400 && /duplicate/.test(error.message),
  );

  await assert.rejects(
    service.saveMods({ revision: loaded.revision, workshopItems: loaded.workshopItems, mods: ['Pack;Variant'] }),
    (error) => error.status === 400 && /invalid config characters/.test(error.message),
  );

  await assert.rejects(
    service.saveMods({ revision: loaded.revision, workshopItems: loaded.workshopItems, mods: ['Pack\nVariant'] }),
    (error) => error.status === 400 && /invalid config characters/.test(error.message),
  );

  await assert.rejects(
    service.saveMods({ revision: loaded.revision, workshopItems: ['12345\0'], mods: loaded.mods }),
    (error) => error.status === 400 && /invalid config characters/.test(error.message),
  );

  await assert.rejects(
    service.saveMods({ revision: loaded.revision, workshopItems: ['', '12345'], mods: loaded.mods }),
    (error) => error.status === 400 && /cannot be empty/.test(error.message),
  );

  await fs.appendFile(path.join(env.configDir, 'servertest.ini'), '\nConcurrentModEdit=true\n');
  await assert.rejects(
    service.saveMods({ revision: loaded.revision, workshopItems: ['11111'], mods: ['FreshMod'] }),
    (error) => error.status === 409,
  );

  await fs.writeFile(path.join(env.configDir, 'servertest.ini'), 'WorkshopItems=12345\nMaxPlayers=16\n');
  await assert.rejects(
    service.readMods(),
    (error) => error.status === 400 && /WorkshopItems and Mods/.test(error.message),
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

test('readSpawn returns default regions when file does not exist', async (t) => {
  const env = await createTempConfig(t);
  const service = new ConfigFileService(env);

  const data = await service.readSpawn();
  assert.equal(data.regions.length, 4);
  assert.equal(data.regions[0].name, 'Muldraugh, KY');
  assert.equal(data.revision, null);
  assert.equal(data.filename, 'servertest_spawnregions.lua');
});

test('readSpawn returns parsed regions when file exists', async (t) => {
  const env = await createTempConfig(t);
  const service = new ConfigFileService(env);
  const content = `function SpawnRegions()
    return {
        { name = "Rosewood, KY", file = "media/maps/Rosewood, KY/spawnpoints.lua" },
        { name = "Base Custom", serverfile = "servertest_spawnpoints.lua" },
    }
end`;
  const filePath = path.join(env.configDir, 'servertest_spawnregions.lua');
  await fs.writeFile(filePath, content);

  const data = await service.readSpawn();
  assert.equal(data.regions.length, 2);
  assert.equal(data.regions[0].name, 'Rosewood, KY');
  assert.equal(data.regions[0].isServerFile, false);
  assert.equal(data.regions[1].name, 'Base Custom');
  assert.equal(data.regions[1].isServerFile, true);
  assert.equal(typeof data.revision, 'string');
  assert.equal(data.revision.length, 64);
});

test('saveSpawn writes only enabled regions and creates backup', async (t) => {
  const env = await createTempConfig(t);
  const service = new ConfigFileService(env);
  const filePath = path.join(env.configDir, 'servertest_spawnregions.lua');

  const original = `function SpawnRegions()
    return {
        { name = "Muldraugh, KY", file = "media/maps/Muldraugh, KY/spawnpoints.lua" },
        { name = "Riverside, KY", file = "media/maps/Riverside, KY/spawnpoints.lua" },
        { name = "Rosewood, KY", file = "media/maps/Rosewood, KY/spawnpoints.lua" },
    }
end`;
  await fs.writeFile(filePath, original);

  const before = await service.readSpawn();
  const saved = await service.saveSpawn({
    revision: before.revision,
    regions: [
      { name: 'Muldraugh, KY', file: 'media/maps/Muldraugh, KY/spawnpoints.lua', isServerFile: false, enabled: true },
      { name: 'Riverside, KY', file: 'media/maps/Riverside, KY/spawnpoints.lua', isServerFile: false, enabled: false },
      { name: 'Rosewood, KY', file: 'media/maps/Rosewood, KY/spawnpoints.lua', isServerFile: false, enabled: false },
    ],
  });

  assert.deepEqual(saved.changedKeys, ['spawnregions']);
  assert.equal(saved.restartRequired, true);
  assert.equal(saved.regions.length, 3);
  assert.equal(saved.regions[0].enabled, true);
  assert.equal(saved.regions[1].enabled, false);
  assert.equal(saved.regions[2].enabled, false);

  const diskContent = await fs.readFile(filePath, 'utf8');
  assert.match(diskContent, /Muldraugh, KY/);
  assert.doesNotMatch(diskContent, /Riverside, KY/);
  assert.doesNotMatch(diskContent, /Rosewood, KY/);

  const spawnBackups = (await fs.readdir(env.backupDir)).filter((name) => name.startsWith('spawnregions--'));
  assert.equal(spawnBackups.length, 1);
});

test('saveSpawn rejects stale revision', async (t) => {
  const env = await createTempConfig(t);
  const service = new ConfigFileService(env);
  const filePath = path.join(env.configDir, 'servertest_spawnregions.lua');
  await fs.writeFile(filePath, 'function SpawnRegions()\n\treturn {\n\t\t{ name = "Test", file = "test" },\n\t}\nend');

  await assert.rejects(
    service.saveSpawn({
      revision: 'stale-revision',
      regions: [{ name: 'Test', file: 'test', isServerFile: false, enabled: true }],
    }),
    (error) => error.status === 409 && /changed after/.test(error.message),
  );
});

test('saveSpawn rejects empty regions array', async (t) => {
  const env = await createTempConfig(t);
  const service = new ConfigFileService(env);

  await assert.rejects(
    service.saveSpawn({ revision: 'any', regions: [] }),
    (error) => error.status === 400 && /least one/.test(error.message),
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
