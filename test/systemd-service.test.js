import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SystemdService,
  parseSystemctlProperties,
  parseSystemdTimestamp,
} from '../src/lib/systemd-service.js';

test('systemd property parser reads show output', () => {
  assert.deepEqual(parseSystemctlProperties('ActiveState=active\nSubState=running\n'), {
    ActiveState: 'active',
    SubState: 'running',
  });
  assert.equal(parseSystemdTimestamp('n/a'), null);
  assert.equal(
    parseSystemdTimestamp('Thu 2026-05-21 16:10:09 UTC'),
    '2026-05-21T16:10:09.000Z',
  );
});

test('systemd service returns status and calls restricted restart command', async () => {
  const commands = [];
  const service = new SystemdService({
    unit: 'project-zomboid.service',
    async run(command, args) {
      commands.push([command, args]);
      if (command === 'systemctl') {
        return {
          stdout: 'ActiveState=active\nSubState=running\nUnitFileState=enabled\nDescription=PZ\nActiveEnterTimestamp=Thu 2026-05-21 16:10:09 UTC\n',
        };
      }
      return { stdout: '' };
    },
  });

  const status = await service.status();
  assert.equal(status.online, true);
  assert.equal(status.activeState, 'active');
  assert.equal(status.activeSince, '2026-05-21T16:10:09.000Z');
  await service.restart();
  assert.deepEqual(commands[1], ['sudo', ['-n', 'systemctl', 'restart', 'project-zomboid.service']]);
});

test('systemd service reports restart failures as API-safe errors', async () => {
  const service = new SystemdService({
    unit: 'project-zomboid.service',
    async run() {
      const error = new Error('permission denied');
      error.stderr = 'sudo: a password is required\nextra text';
      throw error;
    },
  });

  await assert.rejects(
    service.restart(),
    (error) => error.status === 502 && error.message === 'sudo: a password is required',
  );
});
