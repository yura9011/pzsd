import { createApp } from './app.js';
import { readRuntimeConfig } from './config.js';
import { ConfigFileService } from './lib/config-file-service.js';
import { SystemdService } from './lib/systemd-service.js';

const runtime = readRuntimeConfig();
const app = createApp({
  configFiles: new ConfigFileService(runtime),
  systemd: new SystemdService({ unit: runtime.systemdUnit }),
});

app.listen(runtime.port, runtime.host, () => {
  console.log(`PZ config panel listening on http://${runtime.host}:${runtime.port}`);
});
