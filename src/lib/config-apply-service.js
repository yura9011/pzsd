import { HttpError } from './http-error.js';

const SUPPORTED_SURFACES = new Set(['ini', 'sandbox', 'mods', 'spawn']);
const SHOW_OPTION_PATTERN = /^\s*\*\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/;

export class ConfigApplyService {
  constructor({ configFiles, systemd, live }) {
    this.configFiles = configFiles;
    this.systemd = systemd;
    this.live = live;
  }

  async status(surface) {
    assertSurface(surface);
    const snapshot = await this.configFiles.readApplySnapshot(surface);
    const service = await this.systemd.status();
    const runtime = surface === 'ini'
      ? await this.readIniRuntime(snapshot)
      : unavailableRuntime();

    return applicationStatus(snapshot, service, runtime);
  }

  async applyIni(payload) {
    if (!payload || typeof payload !== 'object' || typeof payload.revision !== 'string') {
      throw new HttpError(400, 'INI apply payload must include a revision.');
    }

    const snapshot = await this.configFiles.readApplySnapshot('ini');
    if (payload.revision !== snapshot.revision) {
      throw new HttpError(409, 'The config file changed after it was loaded. Reload before applying.');
    }

    const liveStatus = await this.live.status();
    if (!liveStatus.ready) {
      throw new HttpError(502, liveStatus.error || 'RCON is unavailable.');
    }

    const reload = await this.live.execute('reloadoptions');
    if (!isReloadOptionsResponse(reload.response)) {
      throw new HttpError(502, 'RCON returned an unrecognized reloadoptions response.');
    }

    const runtime = await this.readIniRuntime(snapshot, { ready: true });
    const service = await this.systemd.status();
    const status = applicationStatus(snapshot, service, runtime);

    return {
      applied: status.state === 'runtime_matches_disk',
      command: reload.command,
      response: reload.response,
      executedAt: reload.executedAt,
      status,
      comparison: runtime.comparison || null,
    };
  }

  async readIniRuntime(snapshot, knownStatus) {
    if (!this.live) {
      return unavailableRuntime();
    }

    const status = knownStatus || await this.live.status();
    if (!status.ready) {
      return unavailableRuntime();
    }

    try {
      const result = await this.live.execute('showoptions');
      return {
        ready: true,
        comparison: compareIniRuntime(snapshot, result.response),
      };
    } catch {
      return {
        ready: true,
        comparison: null,
      };
    }
  }
}

export function parseShowOptionsResponse(response) {
  const options = {};
  for (const line of String(response).split(/\r?\n/)) {
    const match = line.match(SHOW_OPTION_PATTERN);
    if (match) {
      options[match[1]] = match[2];
    }
  }
  return options;
}

export function compareIniRuntime(snapshot, response) {
  const runtimeOptions = parseShowOptionsResponse(response);
  const runtimeKeys = Object.keys(runtimeOptions);
  const settings = snapshot.settings || {};
  const metadata = snapshot.metadata || {};
  const mismatchedKeys = [];
  let comparableCount = 0;

  for (const key of runtimeKeys) {
    if (!(key in settings) || metadata[key]?.sensitive || metadata[key]?.readOnly) {
      continue;
    }

    comparableCount += 1;
    if (!sameIniValue(settings[key], runtimeOptions[key], metadata[key])) {
      mismatchedKeys.push(key);
    }
  }

  return {
    comparableCount,
    mismatchedKeys,
    unverifiedCount: Object.keys(settings).length - comparableCount,
    matches: comparableCount > 0 && mismatchedKeys.length === 0,
  };
}

function applicationStatus(snapshot, service, runtime) {
  const runtimeComparison = runtime.comparison;
  return {
    surface: snapshot.surface,
    revision: snapshot.revision,
    diskChangedAt: snapshot.diskChangedAt,
    state: inferState(snapshot, service, runtimeComparison),
    service: {
      online: Boolean(service.online),
      activeSince: service.activeSince || null,
    },
    canApplyLive: snapshot.surface === 'ini' && Boolean(runtime.ready),
    canRestart: Boolean(service.available),
    ...(runtimeComparison ? { comparison: publicComparison(runtimeComparison) } : {}),
  };
}

function inferState(snapshot, service, runtimeComparison) {
  if (runtimeComparison?.matches) {
    return 'runtime_matches_disk';
  }

  if (snapshot.surface === 'ini' && runtimeComparison?.mismatchedKeys.length > 0) {
    return 'saved_on_disk';
  }

  if (!snapshot.diskChangedAt) {
    return 'runtime_unknown';
  }

  if (!service.online) {
    return 'saved_on_disk';
  }

  const diskChangedAt = Date.parse(snapshot.diskChangedAt);
  const activeSince = Date.parse(service.activeSince || '');
  if (Number.isNaN(diskChangedAt) || Number.isNaN(activeSince)) {
    return 'runtime_unknown';
  }

  if (activeSince >= diskChangedAt) {
    return 'loaded_after_restart';
  }

  return snapshot.surface === 'ini' ? 'saved_on_disk' : 'restart_required';
}

function publicComparison(comparison) {
  return {
    comparableCount: comparison.comparableCount,
    mismatchedKeys: comparison.mismatchedKeys,
    unverifiedCount: comparison.unverifiedCount,
  };
}

function sameIniValue(diskValue, runtimeValue, metadata) {
  const disk = String(diskValue).trim();
  const runtime = String(runtimeValue).trim();
  if (metadata?.type === 'boolean') {
    return disk.toLowerCase() === runtime.toLowerCase();
  }

  if (metadata?.type === 'number' && disk !== '' && runtime !== '') {
    const diskNumber = Number(disk);
    const runtimeNumber = Number(runtime);
    if (Number.isFinite(diskNumber) && Number.isFinite(runtimeNumber)) {
      return diskNumber === runtimeNumber;
    }
  }

  return disk === runtime;
}

function assertSurface(surface) {
  if (!SUPPORTED_SURFACES.has(surface)) {
    throw new HttpError(400, 'Apply status surface must be ini, sandbox, mods, or spawn.');
  }
}

function unavailableRuntime() {
  return {
    ready: false,
    comparison: null,
  };
}

function isReloadOptionsResponse(response) {
  return String(response).trim() === 'Options reloaded';
}
