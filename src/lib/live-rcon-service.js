import { HttpError } from './http-error.js';

const COMMAND_LIMIT = 1000;
const MESSAGE_LIMIT = 512;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export class LiveRconService {
  constructor({ rcon, clock = () => new Date() }) {
    this.rcon = rcon;
    this.clock = clock;
  }

  async status() {
    const checkedAt = this.clock().toISOString();
    if (!this.rcon.isConfigured()) {
      return unavailableStatus(checkedAt, 'RCON password is not configured.');
    }

    try {
      await this.rcon.status();
      return {
        available: true,
        ready: true,
        checkedAt,
      };
    } catch {
      return unavailableStatus(checkedAt, 'RCON is unavailable.');
    }
  }

  async players() {
    const result = await this.execute('players');
    const players = parseRconPlayersResponse(result.response);
    if (players === null) {
      throw new HttpError(502, 'RCON returned an unrecognized players response.');
    }

    return {
      players,
      count: players.length,
      source: 'rcon',
      fetchedAt: result.executedAt,
    };
  }

  async command(rawCommand) {
    return this.execute(normalizeLiveCommand(rawCommand));
  }

  async save() {
    return this.execute('save');
  }

  async broadcast(rawMessage) {
    const message = normalizeBroadcastMessage(rawMessage);
    const result = await this.execute(`servermsg "${escapeQuotedRconValue(message)}"`);
    return {
      ...result,
      message,
    };
  }

  async execute(command) {
    try {
      return {
        command,
        response: await this.rcon.execute(command),
        executedAt: this.clock().toISOString(),
      };
    } catch {
      throw new HttpError(502, 'RCON command failed.');
    }
  }
}

export function parseRconPlayersResponse(response) {
  if (!String(response).includes('Players connected')) {
    return null;
  }

  return String(response)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-') && line.length > 1)
    .map((line) => line.replace(/^-+\s*/, ''))
    .filter(Boolean);
}

export function normalizeLiveCommand(rawCommand) {
  return normalizeRuntimeText(rawCommand, 'command', COMMAND_LIMIT);
}

export function normalizeBroadcastMessage(rawMessage) {
  return normalizeRuntimeText(rawMessage, 'message', MESSAGE_LIMIT);
}

function normalizeRuntimeText(value, label, maxLength) {
  if (typeof value !== 'string') {
    throw new HttpError(400, `Live ${label} must be a string.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new HttpError(400, `Live ${label} cannot be empty.`);
  }

  if (normalized.length > maxLength) {
    throw new HttpError(400, `Live ${label} is too long.`);
  }

  if (CONTROL_CHARACTER_PATTERN.test(normalized)) {
    throw new HttpError(400, `Live ${label} contains unsafe control characters.`);
  }

  return normalized;
}

function unavailableStatus(checkedAt, error) {
  return {
    available: false,
    ready: false,
    checkedAt,
    error,
  };
}

function escapeQuotedRconValue(value) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"');
}
