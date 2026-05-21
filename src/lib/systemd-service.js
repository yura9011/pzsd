import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { HttpError } from './http-error.js';

const execFile = promisify(execFileCallback);

export class SystemdService {
  constructor({ unit, run = execFile }) {
    this.unit = unit;
    this.run = run;
  }

  async status() {
    try {
      const result = await this.run('systemctl', [
        'show',
        this.unit,
        '--property=ActiveState',
        '--property=SubState',
        '--property=UnitFileState',
        '--property=Description',
        '--no-pager',
      ]);

      const properties = parseSystemctlProperties(result.stdout);
      return {
        unit: this.unit,
        available: true,
        online: isUnitOnline(properties.ActiveState, properties.SubState),
        activeState: properties.ActiveState || 'unknown',
        subState: properties.SubState || 'unknown',
        unitFileState: properties.UnitFileState || 'unknown',
        description: properties.Description || this.unit,
      };
    } catch (error) {
      return {
        unit: this.unit,
        available: false,
        online: false,
        activeState: 'unknown',
        subState: 'unknown',
        unitFileState: 'unknown',
        error: commandErrorMessage(error, 'systemctl status check failed'),
      };
    }
  }

  async restart() {
    try {
      await this.run('sudo', ['-n', 'systemctl', 'restart', this.unit]);
    } catch (error) {
      throw new HttpError(502, commandErrorMessage(error, 'systemd restart failed'));
    }

    return this.status();
  }
}

export function parseSystemctlProperties(stdout) {
  return Object.fromEntries(String(stdout)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('=');
      return separator === -1
        ? [line, '']
        : [line.slice(0, separator), line.slice(separator + 1)];
    }));
}

export function isUnitOnline(activeState, subState) {
  return activeState === 'active' && subState === 'running';
}

function commandErrorMessage(error, fallback) {
  const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
  const message = stderr || error?.message || fallback;
  return message.split(/\r?\n/)[0].slice(0, 300);
}
