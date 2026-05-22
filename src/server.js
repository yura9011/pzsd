import { createApp } from './app.js';
import { readRuntimeConfig } from './config.js';
import { ConfigApplyService } from './lib/config-apply-service.js';
import { ConfigFileService } from './lib/config-file-service.js';
import { LiveRconService } from './lib/live-rcon-service.js';
import { SourceRconClient } from './lib/source-rcon-client.js';
import { SystemdService } from './lib/systemd-service.js';
import { WorkshopModInstallService } from './lib/workshop-mod-install-service.js';

if (!process.env.PANEL_PASSWORD) {
  console.error('PANEL_PASSWORD is not set. Refusing to start without authentication.');
  process.exit(1);
}

const runtime = readRuntimeConfig();
const configFiles = new ConfigFileService(runtime);
const systemd = new SystemdService({ unit: runtime.systemdUnit });
const live = new LiveRconService({ rcon: new SourceRconClient(runtime.rcon) });
const modInstaller = new WorkshopModInstallService({
  configFiles,
  systemd,
  serverDir: runtime.serverDir,
  steamcmdPath: runtime.steamcmdPath,
});
const app = createApp({
  configFiles,
  systemd,
  live,
  modInstaller,
  configApply: new ConfigApplyService({ configFiles, systemd, live }),
  auth: { username: runtime.username, password: runtime.password },
});

app.listen(runtime.port, runtime.host, () => {
  console.log(`PZ config panel listening on http://${runtime.host}:${runtime.port}`);
});
