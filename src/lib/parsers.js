import { createHash } from 'node:crypto';
import { HttpError } from './http-error.js';

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function revisionForContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function parseIniContent(content) {
  const { lines } = splitContent(content);
  const settings = {};
  const entries = {};

  lines.forEach((line, lineIndex) => {
    const parsed = parseIniLine(line);
    if (!parsed) {
      return;
    }

    settings[parsed.key] = parsed.value;
    entries[parsed.key] = { ...parsed, lineIndex };
  });

  return { settings, entries };
}

export function applyIniChanges(content, changes, parsed = parseIniContent(content)) {
  const { lines, newline } = splitContent(content);

  for (const [key, value] of Object.entries(changes)) {
    const entry = parsed.entries[key];
    if (!entry) {
      throw new HttpError(400, `INI key does not exist: ${key}`);
    }

    const line = lines[entry.lineIndex];
    lines[entry.lineIndex] = `${line.slice(0, entry.valueStart)}${value}`;
  }

  return lines.join(newline);
}

export function parseSandboxContent(content) {
  const { lines } = splitContent(content);
  const stack = [];
  const settings = {};
  const entries = {};

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) {
      return;
    }

    const tableStart = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{\s*(?:--.*)?$/);
    if (tableStart) {
      if (!(tableStart[1] === 'SandboxVars' && stack.length === 0)) {
        stack.push(tableStart[1]);
      }
      return;
    }

    if (/^\s*}\s*,?\s*(?:--.*)?$/.test(line)) {
      if (stack.length > 0) {
        stack.pop();
      }
      return;
    }

    const assignment = parseLuaAssignment(line);
    if (!assignment || assignment.rawValue.startsWith('{')) {
      return;
    }

    const keyPath = [...stack, assignment.key].join('.');
    const value = parseLuaValue(assignment.rawValue);
    settings[keyPath] = value;
    entries[keyPath] = {
      ...assignment,
      value,
      keyPath,
      lineIndex,
    };
  });

  return { settings, entries };
}

export function applySandboxChanges(content, changes, parsed = parseSandboxContent(content)) {
  const { lines, newline } = splitContent(content);

  for (const [keyPath, value] of Object.entries(changes)) {
    const entry = parsed.entries[keyPath];
    if (!entry) {
      throw new HttpError(400, `Sandbox key does not exist: ${keyPath}`);
    }

    const line = lines[entry.lineIndex];
    const replacement = formatLuaValue(value, entry);
    lines[entry.lineIndex] = `${line.slice(0, entry.valueStart)}${replacement}${line.slice(entry.valueEnd)}`;
  }

  return lines.join(newline);
}

export function normalizeSandboxChange(value, entry) {
  if (!entry) {
    throw new HttpError(400, 'Sandbox change has no source entry.');
  }

  if (typeof entry.value === 'boolean') {
    if (value === true || value === false) {
      return value;
    }

    if (value === 'true' || value === 'false') {
      return value === 'true';
    }

    throw new HttpError(400, `${entry.keyPath} must be a boolean.`);
  }

  if (typeof entry.value === 'number') {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      throw new HttpError(400, `${entry.keyPath} must be a finite number.`);
    }

    return numeric;
  }

  return normalizeConfigString(value, entry.keyPath);
}

export function normalizeIniChange(value, key) {
  if (value === true || value === false) {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new HttpError(400, `${key} must be a finite number.`);
    }
    return String(value);
  }

  return normalizeConfigString(value, key);
}

export function validateChangeKey(key) {
  if (
    typeof key !== 'string'
    || key === '__proto__'
    || key === 'prototype'
    || key === 'constructor'
    || key.length > 160
  ) {
    throw new HttpError(400, 'Config change contains an invalid key.');
  }
}

export function isLuaIdentifier(value) {
  return IDENTIFIER_PATTERN.test(value);
}

function parseIniLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
    return null;
  }

  const equalsIndex = line.indexOf('=');
  if (equalsIndex <= 0) {
    return null;
  }

  const key = line.slice(0, equalsIndex).trim();
  if (!key) {
    return null;
  }

  const valueStart = equalsIndex + 1;
  return {
    key,
    value: line.slice(valueStart),
    valueStart,
  };
}

function parseLuaAssignment(line) {
  const prefix = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)/);
  if (!prefix) {
    return null;
  }

  const valueStart = skipSpaces(line, prefix[0].length);
  const commentStart = findLuaCommentStart(line, valueStart);
  let valueEnd = trimRightIndex(line, commentStart === -1 ? line.length : commentStart);

  if (line[valueEnd - 1] === ',') {
    valueEnd = trimRightIndex(line, valueEnd - 1);
  }

  if (valueEnd <= valueStart) {
    return null;
  }

  return {
    key: prefix[1],
    rawValue: line.slice(valueStart, valueEnd),
    valueStart,
    valueEnd,
  };
}

function parseLuaValue(rawValue) {
  const value = rawValue.trim();
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }

  if (
    value.length >= 2
    && ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'"))
  ) {
    return unescapeLuaString(value.slice(1, -1));
  }

  return value;
}

function formatLuaValue(value, entry) {
  if (typeof entry.value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof entry.value === 'number') {
    if (Number.isInteger(value) && entry.rawValue.includes('.')) {
      return value.toFixed(1);
    }

    return String(value);
  }

  return `"${escapeLuaString(value)}"`;
}

function normalizeConfigString(value, key) {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${key} must be a string.`);
  }

  if (value.length > 8192 || /[\0\r\n]/.test(value)) {
    throw new HttpError(400, `${key} contains invalid config characters.`);
  }

  return value;
}

function findLuaCommentStart(line, startIndex) {
  let quote = null;
  let escaped = false;

  for (let index = startIndex; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === '-' && line[index + 1] === '-') {
      return index;
    }
  }

  return -1;
}

function escapeLuaString(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\t', '\\t');
}

function unescapeLuaString(value) {
  return value
    .replaceAll('\\t', '\t')
    .replaceAll('\\"', '"')
    .replaceAll("\\'", "'")
    .replaceAll('\\\\', '\\');
}

function skipSpaces(line, index) {
  let cursor = index;
  while (cursor < line.length && /\s/.test(line[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function trimRightIndex(line, index) {
  let cursor = index;
  while (cursor > 0 && /\s/.test(line[cursor - 1])) {
    cursor -= 1;
  }
  return cursor;
}

export function parseSpawnRegionsContent(content) {
  const regions = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) {
      continue;
    }

    const nameMatch = trimmed.match(/name\s*=\s*"([^"]+)"/);
    const fileMatch = trimmed.match(/(?:server)?file\s*=\s*"([^"]+)"/);
    if (nameMatch && fileMatch) {
      regions.push({
        name: nameMatch[1],
        file: fileMatch[1],
        isServerFile: trimmed.includes('serverfile'),
        enabled: true,
      });
    }
  }
  return regions;
}

export function generateSpawnRegionsContent(regions, newline = '\n') {
  const enabled = regions.filter((r) => r.enabled);
  const lines = ['function SpawnRegions()', '\treturn {'];
  for (const r of enabled) {
    const key = r.isServerFile ? 'serverfile' : 'file';
    lines.push(`\t\t{ name = "${escapeLuaString(r.name)}", ${key} = "${escapeLuaString(r.file)}" },`);
  }
  lines.push('\t}');
  lines.push('end');
  return lines.join(newline);
}

function splitContent(content) {
  return {
    lines: content.split(/\r?\n/),
    newline: content.includes('\r\n') ? '\r\n' : '\n',
  };
}
