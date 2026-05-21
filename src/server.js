import { createApp } from './app.js';
import { readRuntimeConfig } from './config.js';
import { ConfigFileService } from './lib/config-file-service.js';
import { SystemdService } from './lib/systemd-service.js';

if (!process.env.PANEL_PASSWORD) {
  console.error('PANEL_PASSWORD is not set. Refusing to start without authentication.');
  process.exit(1);
}

const runtime = readRuntimeConfig();
const app = createApp({
  configFiles: new ConfigFileService(runtime),
  systemd: new SystemdService({ unit: runtime.systemdUnit }),
  auth: { username: runtime.username, password: runtime.password },
});

app.listen(runtime.port, runtime.host, () => {
  console.log(`PZ config panel listening on http://${runtime.host}:${runtime.port}`);
});
