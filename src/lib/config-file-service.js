import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { metadataForSettings } from '../metadata.js';
import { HttpError } from './http-error.js';
import {
  applyIniChanges,
  applySandboxChanges,
  generateSpawnRegionsContent,
  normalizeIniChange,
  normalizeSandboxChange,
  parseIniContent,
  parseSandboxContent,
  parseSpawnRegionsContent,
  revisionForContent,
  validateChangeKey,
} from './parsers.js';

const BACKUP_LIMIT = 20;
const DEFAULT_SPAWN_REGIONS = [
  { name: 'Muldraugh, KY', file: 'media/maps/Muldraugh, KY/spawnpoints.lua', isServerFile: false, enabled: true },
  { name: 'West Point, KY', file: 'media/maps/West Point, KY/spawnpoints.lua', isServerFile: false, enabled: true },
  { name: 'Riverside, KY', file: 'media/maps/Riverside, KY/spawnpoints.lua', isServerFile: false, enabled: true },
  { name: 'Rosewood, KY', file: 'media/maps/Rosewood, KY/spawnpoints.lua', isServerFile: false, enabled: true },
];
const FILE_SPECS = {
  ini: {
    label: 'server.ini',
    parse: parseIniContent,
    apply: applyIniChanges,
  },
  sandbox: {
    label: 'SandboxVars.lua',
    parse: parseSandboxContent,
    apply: applySandboxChanges,
  },
};

export class ConfigFileService {
  constructor({ configDir, serverName, backupDir, clock = () => new Date() }) {
    this.configDir = configDir;
    this.serverName = serverName;
    this.backupDir = backupDir;
    this.clock = clock;
  }

  async read(kind) {
    const { content, filePath, spec } = await this.readContent(kind);
    const parsed = spec.parse(content);
    const metadata = metadataForSettings(kind, parsed.settings);

    return {
      file: kind,
      filename: path.basename(filePath),
      settings: maskSensitiveValues(parsed.settings, metadata),
      metadata: markSensitiveValueState(parsed.settings, metadata),
      revision: revisionForContent(content),
      restartRequired: false,
    };
  }

  async readApplySnapshot(surface) {
    if (surface === 'spawn') {
      return this.readSpawnApplySnapshot();
    }

    const kind = surface === 'mods' ? 'ini' : surface;
    const { content, filePath, spec } = await this.readContent(kind);
    const stat = await this.statApplyFile(filePath);
    const parsed = spec.parse(content);
    const snapshot = {
      surface,
      file: kind,
      filename: path.basename(filePath),
      revision: revisionForContent(content),
      diskChangedAt: stat.mtime.toISOString(),
    };

    if (kind === 'ini') {
      snapshot.settings = parsed.settings;
      snapshot.metadata = metadataForSettings(kind, parsed.settings);
    }

    return snapshot;
  }

  async save(kind, payload) {
    assertPayload(payload);
    const { content, spec } = await this.readContent(kind);
    const currentRevision = revisionForContent(content);
    if (payload.revision !== currentRevision) {
      throw new HttpError(409, 'The config file changed after it was loaded. Reload before saving.');
    }

    const parsed = spec.parse(content);
    const metadata = metadataForSettings(kind, parsed.settings);
    const changes = this.normalizeChanges(kind, payload.changes, parsed, metadata);
    const changedKeys = Object.keys(changes);
    if (changedKeys.length === 0) {
      return {
        ...(await this.read(kind)),
        changedKeys,
      };
    }

    await this.createBackup(kind, content);
    const nextContent = spec.apply(content, changes, parsed);
    await atomicWrite(this.filePath(kind), nextContent);

    return {
      ...(await this.read(kind)),
      changedKeys,
      restartRequired: true,
    };
  }

  async readMods() {
    const { content, filePath, spec } = await this.readContent('ini');
    const parsed = spec.parse(content);
    assertModEntries(parsed);

    return {
      file: 'ini',
      filename: path.basename(filePath),
      revision: revisionForContent(content),
      workshopItems: parseModSetting(parsed.settings.WorkshopItems),
      mods: parseModSetting(parsed.settings.Mods),
      restartRequired: false,
    };
  }

  async saveMods(payload) {
    assertModsPayload(payload);
    const { content, spec } = await this.readContent('ini');
    const currentRevision = revisionForContent(content);
    if (payload.revision !== currentRevision) {
      throw new HttpError(409, 'The config file changed after it was loaded. Reload before saving.');
    }

    const parsed = spec.parse(content);
    assertModEntries(parsed);

    const nextWorkshopItems = normalizeModList(payload.workshopItems, 'WorkshopItems');
    const nextMods = normalizeModList(payload.mods, 'Mods');
    const currentWorkshopItems = parseModSetting(parsed.settings.WorkshopItems);
    const currentMods = parseModSetting(parsed.settings.Mods);
    const changes = {};

    if (!sameList(nextWorkshopItems, currentWorkshopItems)) {
      changes.WorkshopItems = normalizeIniChange(nextWorkshopItems.join(';'), 'WorkshopItems');
    }

    if (!sameList(nextMods, currentMods)) {
      changes.Mods = normalizeIniChange(nextMods.join(';'), 'Mods');
    }

    const changedKeys = Object.keys(changes);
    if (changedKeys.length === 0) {
      return {
        ...(await this.readMods()),
        changedKeys,
      };
    }

    await this.createBackup('ini', content);
    const nextContent = spec.apply(content, changes, parsed);
    await atomicWrite(this.filePath('ini'), nextContent);

    return {
      ...(await this.readMods()),
      changedKeys,
      restartRequired: true,
    };
  }

  async listBackups(kind) {
    this.spec(kind);

    let names;
    try {
      names = await fs.readdir(this.backupDir);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw new HttpError(500, 'Failed to read the config backup directory.');
    }

    const backups = await Promise.all(names
      .filter((name) => isBackupForKind(name, kind))
      .map(async (id) => {
        const filePath = path.join(this.backupDir, id);
        const stat = await fs.stat(filePath);
        return {
          id,
          file: kind,
          createdAt: stat.mtime.toISOString(),
          size: stat.size,
        };
      }));

    return backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async restore(backupId) {
    const kind = kindFromBackupId(backupId);
    const { content: currentContent } = await this.readContent(kind);
    const backupPath = path.join(this.backupDir, backupId);

    let backupContent;
    try {
      backupContent = await fs.readFile(backupPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new HttpError(404, 'Config backup not found.');
      }
      throw new HttpError(500, 'Failed to read the config backup.');
    }

    this.assertBackupContent(kind, backupContent);
    await this.createBackup(kind, currentContent);
    await atomicWrite(this.filePath(kind), backupContent);

    return {
      ...(await this.read(kind)),
      restoredBackupId: backupId,
      restartRequired: true,
    };
  }

  filePath(kind) {
    this.spec(kind);
    if (kind === 'ini') {
      return path.join(this.configDir, `${this.serverName}.ini`);
    }

    return path.join(this.configDir, `${this.serverName}_SandboxVars.lua`);
  }

  spawnRegionsFilePath() {
    return path.join(this.configDir, `${this.serverName}_spawnregions.lua`);
  }

  async readSpawn() {
    const filePath = this.spawnRegionsFilePath();
    let content;
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new HttpError(500, 'Failed to read spawn regions file.');
      }
      return {
        regions: DEFAULT_SPAWN_REGIONS,
        revision: null,
        filename: `${this.serverName}_spawnregions.lua`,
      };
    }

    const regions = parseSpawnRegionsContent(content);
    return {
      regions: regions.length > 0 ? regions : DEFAULT_SPAWN_REGIONS.map((r) => ({ ...r, enabled: false })),
      revision: revisionForContent(content),
      filename: path.basename(filePath),
    };
  }

  async readSpawnApplySnapshot() {
    const filePath = this.spawnRegionsFilePath();
    try {
      const [content, stat] = await Promise.all([
        fs.readFile(filePath, 'utf8'),
        this.statApplyFile(filePath),
      ]);

      return {
        surface: 'spawn',
        file: 'spawn',
        filename: path.basename(filePath),
        revision: revisionForContent(content),
        diskChangedAt: stat.mtime.toISOString(),
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          surface: 'spawn',
          file: 'spawn',
          filename: path.basename(filePath),
          revision: null,
          diskChangedAt: null,
        };
      }

      throw new HttpError(500, 'Failed to read spawn regions file status.');
    }
  }

  async saveSpawn(payload) {
    if (!isPlainRecord(payload) || !Array.isArray(payload.regions)) {
      throw new HttpError(400, 'Spawn save payload must include a regions array.');
    }

    const filePath = this.spawnRegionsFilePath();
    let currentContent;
    try {
      currentContent = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new HttpError(500, 'Failed to read spawn regions file.');
      }
      currentContent = null;
    }

    if (currentContent !== null && payload.revision !== revisionForContent(currentContent)) {
      throw new HttpError(409, 'The spawn regions file changed after it was loaded. Reload before saving.');
    }

    const enabled = payload.regions.filter((r) => r.enabled);
    if (enabled.length === 0) {
      throw new HttpError(400, 'At least one spawn region must be enabled.');
    }

    for (const r of enabled) {
      if (typeof r.name !== 'string' || typeof r.file !== 'string') {
        throw new HttpError(400, 'Each region must have a name and file path.');
      }
    }

    if (currentContent !== null) {
      await fs.mkdir(this.backupDir, { recursive: true });
      const timestamp = this.clock().toISOString().replaceAll(':', '-').replaceAll('.', '-');
      const revision = revisionForContent(currentContent).slice(0, 12);
      const nonce = randomBytes(3).toString('hex');
      const backupId = `spawnregions--${timestamp}--${revision}--${nonce}.bak`;
      await fs.writeFile(path.join(this.backupDir, backupId), currentContent, { flag: 'wx' });
    }

    await fs.mkdir(this.backupDir, { recursive: true });
    const nextContent = generateSpawnRegionsContent(payload.regions);
    await atomicWrite(filePath, nextContent);

    return {
      regions: payload.regions,
      revision: revisionForContent(nextContent),
      filename: path.basename(filePath),
      changedKeys: ['spawnregions'],
      restartRequired: true,
    };
  }

  normalizeChanges(kind, rawChanges, parsed, metadata) {
    if (!isPlainRecord(rawChanges)) {
      throw new HttpError(400, 'changes must be an object keyed by existing settings.');
    }

    const changes = {};
    for (const [key, value] of Object.entries(rawChanges)) {
      validateChangeKey(key);
      const entry = parsed.entries[key];
      if (!entry) {
        throw new HttpError(400, `Setting does not exist in ${kind}: ${key}`);
      }

      if (metadata[key]?.readOnly) {
        throw new HttpError(400, `${key} is read-only in this panel version.`);
      }

      const normalized = kind === 'ini'
        ? normalizeIniChange(value, key)
        : normalizeSandboxChange(value, entry);
      validateKnownChangeValue(key, value, metadata[key]);
      changes[key] = normalized;
    }

    return changes;
  }

  async createBackup(kind, content) {
    this.spec(kind);
    await fs.mkdir(this.backupDir, { recursive: true });

    const timestamp = this.clock().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const revision = revisionForContent(content).slice(0, 12);
    const nonce = randomBytes(3).toString('hex');
    const id = `${kind}--${timestamp}--${revision}--${nonce}.bak`;
    await fs.writeFile(path.join(this.backupDir, id), content, { flag: 'wx' });
    await this.enforceRetention(kind);
    return id;
  }

  async enforceRetention(kind) {
    const backups = await this.listBackups(kind);
    await Promise.all(backups.slice(BACKUP_LIMIT).map((backup) => fs.unlink(path.join(this.backupDir, backup.id))));
  }

  assertBackupContent(kind, content) {
    if (!content || content.includes('\0')) {
      throw new HttpError(400, 'Config backup is empty or invalid.');
    }

    if (kind === 'sandbox' && !content.includes('SandboxVars')) {
      throw new HttpError(400, 'Sandbox backup does not contain a SandboxVars table.');
    }

    const parsed = this.spec(kind).parse(content);
    if (Object.keys(parsed.settings).length === 0) {
      throw new HttpError(400, 'Config backup does not contain editable settings.');
    }
  }

  async readContent(kind) {
    const spec = this.spec(kind);
    const filePath = this.filePath(kind);
    try {
      return {
        spec,
        filePath,
        content: await fs.readFile(filePath, 'utf8'),
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new HttpError(404, `${path.basename(filePath)} was not found. Start the B42 server once and check PZ_CONFIG_DIR.`);
      }
      throw new HttpError(500, `Failed to read ${spec.label}.`);
    }
  }

  async statApplyFile(filePath) {
    try {
      return await fs.stat(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw error;
      }
      throw new HttpError(500, `Failed to inspect ${path.basename(filePath)}.`);
    }
  }

  spec(kind) {
    const spec = FILE_SPECS[kind];
    if (!spec) {
      throw new HttpError(400, 'Config file must be ini or sandbox.');
    }
    return spec;
  }
}

function assertPayload(payload) {
  if (!isPlainRecord(payload) || typeof payload.revision !== 'string') {
    throw new HttpError(400, 'Save payload must include revision and changes.');
  }
}

function assertModsPayload(payload) {
  if (
    !isPlainRecord(payload)
    || typeof payload.revision !== 'string'
    || !Array.isArray(payload.workshopItems)
    || !Array.isArray(payload.mods)
  ) {
    throw new HttpError(400, 'Mods save payload must include revision, workshopItems, and mods lists.');
  }
}

function assertModEntries(parsed) {
  if (!parsed.entries.WorkshopItems || !parsed.entries.Mods) {
    throw new HttpError(400, 'server.ini must already contain WorkshopItems and Mods for the mods editor.');
  }
}

function parseModSetting(value) {
  if (typeof value !== 'string' || value === '') {
    return [];
  }

  return value
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeModList(rawItems, key) {
  const items = [];
  const seen = new Set();

  for (const rawItem of rawItems) {
    if (typeof rawItem !== 'string') {
      throw new HttpError(400, `${key} items must be strings.`);
    }

    const item = rawItem.trim();
    if (!item) {
      throw new HttpError(400, `${key} items cannot be empty.`);
    }

    if (/[\0\r\n;]/.test(item)) {
      throw new HttpError(400, `${key} items contain invalid config characters.`);
    }

    if (key === 'WorkshopItems' && !/^\d+$/.test(item)) {
      throw new HttpError(400, 'WorkshopItems must contain numeric Steam Workshop IDs.');
    }

    if (seen.has(item)) {
      throw new HttpError(400, `${key} contains duplicate items.`);
    }

    seen.add(item);
    items.push(item);
  }

  return items;
}

function sameList(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function validateKnownChangeValue(key, value, metadata) {
  if (!metadata?.known) {
    return;
  }

  if (metadata.type === 'boolean' && !isBooleanChange(value)) {
    throw new HttpError(400, `${key} must be a boolean.`);
  }

  if (metadata.type === 'number' && !isFiniteNumericChange(value)) {
    throw new HttpError(400, `${key} must be a finite number.`);
  }

  if (metadata.type === 'enum' && !metadata.options?.some((option) => option.value === String(value))) {
    throw new HttpError(400, `${key} must be one of the supported values.`);
  }
}

function isBooleanChange(value) {
  return value === true || value === false || value === 'true' || value === 'false';
}

function isFiniteNumericChange(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}

function maskSensitiveValues(settings, metadata) {
  return Object.fromEntries(Object.entries(settings).map(([key, value]) => [
    key,
    metadata[key]?.sensitive ? null : value,
  ]));
}

function markSensitiveValueState(settings, metadata) {
  return Object.fromEntries(Object.entries(metadata).map(([key, meta]) => [
    key,
    meta.sensitive ? { ...meta, hasValue: settings[key] !== '' } : meta,
  ]));
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.prototype.toString.call(value) === '[object Object]';
}

function kindFromBackupId(backupId) {
  if (typeof backupId !== 'string' || path.basename(backupId) !== backupId || !/^[A-Za-z0-9_.-]+$/.test(backupId)) {
    throw new HttpError(400, 'Invalid config backup id.');
  }

  if (isBackupForKind(backupId, 'ini')) {
    return 'ini';
  }

  if (isBackupForKind(backupId, 'sandbox')) {
    return 'sandbox';
  }

  throw new HttpError(400, 'Config backup id does not match a supported file.');
}

function isBackupForKind(backupId, kind) {
  return backupId.startsWith(`${kind}--`) && backupId.endsWith('.bak');
}

async function atomicWrite(filePath, content) {
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp-${randomBytes(4).toString('hex')}`,
  );

  try {
    await fs.writeFile(tempPath, content, { mode: 0o664, flag: 'wx' });
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw new HttpError(500, `Failed to replace ${path.basename(filePath)} safely.`);
  }
}
