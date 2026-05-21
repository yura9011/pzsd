import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const serverEntry = fileURLToPath(new URL('../src/server.js', import.meta.url));

test('server refuses startup without PANEL_PASSWORD', async () => {
  const env = { ...process.env };
  delete env.PANEL_PASSWORD;

  const result = await runNode([serverEntry], env);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /PANEL_PASSWORD is not set/);
});

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stderr }));
  });
}
