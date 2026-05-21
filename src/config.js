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

  const username = env.PANEL_USERNAME || 'admin';
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
  };
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PANEL_PORT must be an integer between 1 and 65535.');
  }

  return port;
}
