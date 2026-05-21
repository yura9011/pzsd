import path from 'node:path';

const PROFILE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const SYSTEMD_UNIT_PATTERN = /^[A-Za-z0-9_.@:-]+\.service$/;

export function readRuntimeConfig(env = process.env) {
  const configDir = path.resolve(env.PZ_CONFIG_DIR || '/home/steam/Zomboid/Server');
  const serverName = env.PZ_SERVER_NAME || 'servertest';
  const systemdUnit = env.PZ_SYSTEMD_UNIT || 'project-zomboid.service';

  if (!PROFILE_NAME_PATTERN.test(serverName)) {
    throw new Error('PZ_SERVER_NAME must contain only letters, digits, underscores, or dashes.');
  }

  if (!SYSTEMD_UNIT_PATTERN.test(systemdUnit)) {
    throw new Error('PZ_SYSTEMD_UNIT must be a valid .service unit name.');
  }

  const username = readPanelUsername(env);
  const password = env.PANEL_PASSWORD;

  return {
    host: env.PANEL_HOST || '0.0.0.0',
    port: parsePort(env.PANEL_PORT || '3210'),
    configDir,
    serverName,
    backupDir: path.resolve(
      env.PZ_PANEL_BACKUP_DIR || path.join(configDir, '.pz-config-panel-backups'),
    ),
    systemdUnit,
    username,
    password,
    rcon: {
      host: env.PZ_RCON_HOST || '127.0.0.1',
      port: parsePort(env.PZ_RCON_PORT || '27015', 'PZ_RCON_PORT'),
      password: env.PZ_RCON_PASSWORD || '',
      timeoutMs: parseTimeout(env.PZ_RCON_TIMEOUT_MS || '5000'),
    },
  };
}

function parsePort(value, name = 'PANEL_PORT') {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }

  return port;
}

function parseTimeout(value) {
  const timeoutMs = Number(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new Error('PZ_RCON_TIMEOUT_MS must be an integer between 100 and 30000.');
  }

  return timeoutMs;
}

function readPanelUsername(env) {
  if (env.PANEL_USERNAME) {
    return env.PANEL_USERNAME;
  }

  console.warn('PANEL_USERNAME is not set. Falling back to admin for V1.');
  return 'admin';
}
