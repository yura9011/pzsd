import net from 'node:net';

const SERVERDATA_RESPONSE_VALUE = 0;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_AUTH = 3;
const MAX_PACKET_SIZE = 4096;

export class RconClientError extends Error {
  constructor(message, code = 'RCON_ERROR') {
    super(message);
    this.name = 'RconClientError';
    this.code = code;
  }
}

export class SourceRconClient {
  constructor({ host, port, password, timeoutMs = 5000, openSocket = connectSocket }) {
    this.host = host;
    this.port = port;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.openSocket = openSocket;
  }

  isConfigured() {
    return typeof this.password === 'string' && this.password !== '';
  }

  async status() {
    await this.withConnection(async () => {});
  }

  async execute(command) {
    return this.withConnection(async (connection) => connection.execute(command));
  }

  async withConnection(handler) {
    if (!this.isConfigured()) {
      throw new RconClientError('RCON password is not configured.', 'RCON_NOT_CONFIGURED');
    }

    const socket = await this.openSocket({
      host: this.host,
      port: this.port,
      timeoutMs: this.timeoutMs,
    });
    const connection = new RconConnection(socket);

    try {
      await connection.authenticate(this.password);
      return await handler(connection);
    } finally {
      socket.destroy();
    }
  }
}

class RconConnection {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.pending = [];
    this.requestId = 0;
    this.failure = null;

    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flushPending();
    });
    socket.on('timeout', () => this.fail(new RconClientError('RCON request timed out.', 'RCON_TIMEOUT')));
    socket.on('error', (error) => this.fail(toClientError(error)));
    socket.on('close', () => this.fail(new RconClientError('RCON connection closed.', 'RCON_CLOSED')));
  }

  async authenticate(password) {
    const requestId = this.nextRequestId();
    await this.sendPacket(requestId, SERVERDATA_AUTH, password);
    const response = await this.readPacket();
    if (response.id === -1) {
      throw new RconClientError('RCON authentication failed.', 'RCON_AUTH_FAILED');
    }

    if (response.type === SERVERDATA_RESPONSE_VALUE) {
      const authResponse = await this.readPacket();
      if (authResponse.id === -1 || authResponse.type !== SERVERDATA_AUTH_RESPONSE) {
        throw new RconClientError('RCON authentication failed.', 'RCON_AUTH_FAILED');
      }
    }
  }

  async execute(command) {
    const requestId = this.nextRequestId();
    await this.sendPacket(requestId, SERVERDATA_EXECCOMMAND, command);
    const response = await this.readPacket();
    if (response.id === -1) {
      throw new RconClientError('RCON command was rejected.', 'RCON_COMMAND_REJECTED');
    }
    return response.body;
  }

  async sendPacket(requestId, type, body) {
    const packet = encodePacket(requestId, type, body);
    await new Promise((resolve, reject) => {
      this.socket.write(packet, (error) => {
        if (error) {
          reject(toClientError(error));
          return;
        }
        resolve();
      });
    });
  }

  async readPacket() {
    const sizeBuffer = await this.readBytes(4);
    const size = sizeBuffer.readInt32LE(0);
    if (size < 10 || size > MAX_PACKET_SIZE) {
      throw new RconClientError('RCON returned an invalid packet size.', 'RCON_INVALID_PACKET');
    }

    const packet = await this.readBytes(size);
    return {
      id: packet.readInt32LE(0),
      type: packet.readInt32LE(4),
      body: packet.subarray(8, -2).toString('utf8'),
    };
  }

  readBytes(length) {
    if (this.failure) {
      return Promise.reject(this.failure);
    }

    if (this.buffer.length >= length) {
      return Promise.resolve(this.takeBytes(length));
    }

    return new Promise((resolve, reject) => {
      this.pending.push({ length, resolve, reject });
    });
  }

  flushPending() {
    while (this.pending.length > 0 && this.buffer.length >= this.pending[0].length) {
      const pending = this.pending.shift();
      pending.resolve(this.takeBytes(pending.length));
    }
  }

  takeBytes(length) {
    const bytes = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return bytes;
  }

  fail(error) {
    if (this.failure) {
      return;
    }

    this.failure = error;
    while (this.pending.length > 0) {
      this.pending.shift().reject(error);
    }
  }

  nextRequestId() {
    this.requestId += 1;
    return this.requestId;
  }
}

function connectSocket({ host, port, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const failConnect = (error) => {
      socket.destroy();
      reject(toClientError(error));
    };

    socket.setTimeout(timeoutMs);
    socket.once('error', failConnect);
    socket.once('timeout', () => failConnect(new RconClientError('RCON connection timed out.', 'RCON_TIMEOUT')));
    socket.once('connect', () => {
      socket.off('error', failConnect);
      resolve(socket);
    });
  });
}

function encodePacket(requestId, type, body) {
  const encodedBody = Buffer.from(String(body), 'utf8');
  const packet = Buffer.alloc(4 + 4 + 4 + encodedBody.length + 2);
  packet.writeInt32LE(10 + encodedBody.length, 0);
  packet.writeInt32LE(requestId, 4);
  packet.writeInt32LE(type, 8);
  encodedBody.copy(packet, 12);
  return packet;
}

function toClientError(error) {
  if (error instanceof RconClientError) {
    return error;
  }

  return new RconClientError(error?.message || 'RCON request failed.', 'RCON_IO_ERROR');
}
