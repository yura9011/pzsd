import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  applyIniChanges,
  applySandboxChanges,
  generateSpawnRegionsContent,
  normalizeSandboxChange,
  parseIniContent,
  parseSandboxContent,
  parseSpawnRegionsContent,
} from '../src/lib/parsers.js';

const iniFixture = new URL('./fixtures/server.ini', import.meta.url);
const sandboxFixture = new URL('./fixtures/sandbox.lua', import.meta.url);

test('INI parser preserves unknown settings and applies only existing keys', async () => {
  const content = await readFile(iniFixture, 'utf8');
  const parsed = parseIniContent(content);

  assert.equal(parsed.settings.UnknownTuning, 'value:kept');
  assert.equal(parsed.settings.RCONPassword, 'rcon-secret');

  const next = applyIniChanges(content, { MaxPlayers: '24' }, parsed);
  assert.match(next, /MaxPlayers=24/);
  assert.match(next, /UnknownTuning=value:kept/);
  assert.match(next, /# B42-style dedicated server fixture/);
});

test('Sandbox parser reads B42 nested tables and preserves unrelated Lua lines', async () => {
  const content = await readFile(sandboxFixture, 'utf8');
  const parsed = parseSandboxContent(content);

  assert.equal(parsed.settings['ZombieLore.Speed'], 2);
  assert.equal(parsed.settings['MultiplierConfig.Global'], 1);
  assert.equal(parsed.settings['Basement.SpawnFrequency'], 3);
  assert.equal(parsed.settings.CustomString, 'keep, text');

  const next = applySandboxChanges(content, {
    'ZombieLore.Speed': normalizeSandboxChange('3', parsed.entries['ZombieLore.Speed']),
    XpMultiplier: normalizeSandboxChange('2', parsed.entries.XpMultiplier),
  }, parsed);

  assert.match(next, /Speed = 3,/);
  assert.match(next, /XpMultiplier = 2.0,/);
  assert.match(next, /CustomString = "keep, text",/);
  assert.match(next, /PopulationPeakDay = 28,/);
});

test('Sandbox change normalization rejects type changes for numeric values', async () => {
  const content = await readFile(sandboxFixture, 'utf8');
  const parsed = parseSandboxContent(content);

  assert.throws(
    () => normalizeSandboxChange('3" .. os.execute("id") .. "', parsed.entries['ZombieLore.Speed']),
    /must be a finite number/,
  );
});

test('Spawn regions parser extracts regions with file and serverfile entries', () => {
  const content = `function SpawnRegions()
    return {
        { name = "Muldraugh, KY", file = "media/maps/Muldraugh, KY/spawnpoints.lua" },
        { name = "West Point, KY", file = "media/maps/West Point, KY/spawnpoints.lua" },
        { name = "Base Custom", serverfile = "servertest_spawnpoints.lua" },
    }
end`;
  const regions = parseSpawnRegionsContent(content);

  assert.equal(regions.length, 3);
  assert.equal(regions[0].name, 'Muldraugh, KY');
  assert.equal(regions[0].file, 'media/maps/Muldraugh, KY/spawnpoints.lua');
  assert.equal(regions[0].isServerFile, false);
  assert.equal(regions[1].name, 'West Point, KY');
  assert.equal(regions[2].name, 'Base Custom');
  assert.equal(regions[2].isServerFile, true);
  assert.equal(regions[2].file, 'servertest_spawnpoints.lua');
});

test('Spawn regions parser handles comments and empty lines', () => {
  const content = `function SpawnRegions()
    return {
        -- This is a comment
        { name = "Rosewood, KY", file = "media/maps/Rosewood, KY/spawnpoints.lua" },
    }
end`;
  const regions = parseSpawnRegionsContent(content);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].name, 'Rosewood, KY');
});

test('Spawn regions generator writes only enabled regions', () => {
  const regions = [
    { name: 'Muldraugh, KY', file: 'media/maps/Muldraugh, KY/spawnpoints.lua', isServerFile: false, enabled: true },
    { name: 'Rosewood, KY', file: 'media/maps/Rosewood, KY/spawnpoints.lua', isServerFile: false, enabled: false },
    { name: 'Base Custom', file: 'servertest_spawnpoints.lua', isServerFile: true, enabled: true },
  ];

  const content = generateSpawnRegionsContent(regions);

  assert.match(content, /Muldraugh, KY/);
  assert.match(content, /Base Custom/);
  assert.match(content, /serverfile/);
  assert.doesNotMatch(content, /Rosewood, KY/);
  assert.match(content, /function SpawnRegions\(\)/);
  assert.match(content, /end$/m);
});

test('Spawn regions generator produces valid Lua structure', () => {
  const regions = [
    { name: 'Test, Region', file: 'media/maps/Test/spawnpoints.lua', isServerFile: false, enabled: true },
  ];

  const content = generateSpawnRegionsContent(regions, '\n');
  const expected = 'function SpawnRegions()\n\treturn {\n\t\t{ name = "Test, Region", file = "media/maps/Test/spawnpoints.lua" },\n\t}\nend';
  assert.equal(content, expected);
});
