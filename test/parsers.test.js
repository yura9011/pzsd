import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  applyIniChanges,
  applySandboxChanges,
  normalizeSandboxChange,
  parseIniContent,
  parseSandboxContent,
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
