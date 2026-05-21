import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import {
  LiveRconService,
  normalizeBroadcastMessage,
  normalizeLiveCommand,
  parseRconPlayersResponse,
} from '../src/lib/live-rcon-service.js';
import { SourceRconClient } from '../src/lib/source-rcon-client.js';

test('Source RCON client authenticates and executes commands', async (t) => {
  const server = await listenRcon(t, {
    responses: {
      players: 'Players connected (2):\n-Alex\n-Sam\n',
    },
  });
  const client = new SourceRconClient({
    host: '127.0.0.1',
    port: server.port,
    password: 'rcon-secret',
    timeoutMs: 500,
  });

  assert.equal(await client.execute('players'), 'Players connected (2):\n-Alex\n-Sam\n');
});

test('Source RCON client rejects auth failure, timeouts, and invalid packets', async (t) => {
  const authFailure = await listenRcon(t, { password: 'other-secret' });
  await assert.rejects(
    new SourceRconClient({
      host: '127.0.0.1',
      port: authFailure.port,
      password: 'rcon-secret',
      timeoutMs: 500,
    }).execute('players'),
    (error) => error.code === 'RCON_AUTH_FAILED',
  );

  const timeout = await listenRcon(t, { ignoreAuth: true });
  await assert.rejects(
    new SourceRconClient({
      host: '127.0.0.1',
      port: timeout.port,
      password: 'rcon-secret',
      timeoutMs: 50,
    }).execute('players'),
    (error) => error.code === 'RCON_TIMEOUT',
  );

  const invalid = await listenRcon(t, { invalidCommandPacket: true });
  await assert.rejects(
    new SourceRconClient({
      host: '127.0.0.1',
      port: invalid.port,
      password: 'rcon-secret',
      timeoutMs: 500,
    }).execute('players'),
    (error) => error.code === 'RCON_INVALID_PACKET',
  );
});

test('Live RCON helpers parse players and reject unsafe runtime text', () => {
  assert.deepEqual(parseRconPlayersResponse('Players connected (0):\n'), []);
  assert.deepEqual(parseRconPlayersResponse('Players connected (1):\n-Solo\n'), ['Solo']);
  assert.deepEqual(parseRconPlayersResponse('Players connected (2):\n - Alex\n-Sam\n'), ['Alex', 'Sam']);
  assert.equal(parseRconPlayersResponse('plain help output'), null);

  assert.equal(normalizeLiveCommand('  players  '), 'players');
  assert.equal(normalizeBroadcastMessage('  hello  '), 'hello');
  assert.throws(() => normalizeLiveCommand(''), (error) => error.status === 400);
  assert.throws(() => normalizeLiveCommand('a'.repeat(1001)), (error) => error.status === 400);
  assert.throws(() => normalizeBroadcastMessage('bad\0message'), (error) => error.status === 400);
});

test('Live RCON service reports missing config and API-safe command failure', async () => {
  const unavailable = new LiveRconService({
    rcon: {
      isConfigured() {
        return false;
      },
    },
    clock: () => new Date('2026-05-21T19:30:00.000Z'),
  });
  assert.deepEqual(await unavailable.status(), {
    available: false,
    ready: false,
    checkedAt: '2026-05-21T19:30:00.000Z',
    error: 'RCON password is not configured.',
  });

  const failing = new LiveRconService({
    rcon: {
      async execute() {
        throw new Error('password should not leak here');
      },
    },
  });
  await assert.rejects(
    failing.save(),
    (error) => error.status === 502 && error.message === 'RCON command failed.',
  );
});

async function listenRcon(t, options = {}) {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', createPacketHandler(socket, options));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    for (const socket of sockets) {
      socket.destroy();
    }
    return new Promise((resolve) => server.close(resolve));
  });

  return { port: server.address().port };
}

function createPacketHandler(socket, options) {
  let buffer = Buffer.alloc(0);

  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const size = buffer.readInt32LE(0);
      if (buffer.length < size + 4) {
        return;
      }

      const packet = buffer.subarray(4, size + 4);
      buffer = buffer.subarray(size + 4);
      const request = {
        id: packet.readInt32LE(0),
        type: packet.readInt32LE(4),
        body: packet.subarray(8, -2).toString('utf8'),
      };
      respondToPacket(socket, request, options);
    }
  };
}

function respondToPacket(socket, request, options) {
  if (request.type === 3) {
    if (options.ignoreAuth) {
      return;
    }

    if (request.body !== (options.password || 'rcon-secret')) {
      socket.write(encodePacket(-1, 2, ''));
      return;
    }

    socket.write(Buffer.concat([
      encodePacket(request.id, 0, ''),
      encodePacket(request.id, 2, ''),
    ]));
    return;
  }

  if (options.invalidCommandPacket) {
    const invalidSize = Buffer.alloc(4);
    invalidSize.writeInt32LE(5000, 0);
    socket.write(invalidSize);
    return;
  }

  socket.write(encodePacket(request.id, 0, options.responses?.[request.body] || `ran ${request.body}`));
}

function encodePacket(id, type, body) {
  const bodyBuffer = Buffer.from(body, 'utf8');
  const packet = Buffer.alloc(14 + bodyBuffer.length);
  packet.writeInt32LE(10 + bodyBuffer.length, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  bodyBuffer.copy(packet, 12);
  return packet;
}
