import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { metadataForSettings } from '../metadata.js';
import { HttpError } from './http-error.js';
import {
  applyIniChanges,
  applySandboxChanges,
  normalizeIniChange,
  normalizeSandboxChange,
  parseIniContent,
  parseSandboxContent,
  revisionForContent,
  validateChangeKey,
} from './parsers.js';

const BACKUP_LIMIT = 20;
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

      changes[key] = kind === 'ini'
        ? normalizeIniChange(value, key)
        : normalizeSandboxChange(value, entry);
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
