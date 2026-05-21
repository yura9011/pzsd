# Handoff

## Current State

The panel is a private Express + vanilla JS config surface for one vanilla Project Zomboid B42 server profile.

Verified VPS baseline on May 21, 2026:

- Game service: `project-zomboid.service`
- Game command: `/home/steam/pz_server/start-server.sh -servername servertest`
- Game config files: `/home/steam/Zomboid/Server/servertest.ini` and `/home/steam/Zomboid/Server/servertest_SandboxVars.lua`
- Panel deploy path: `/opt/pz-config-panel`
- Panel service: `pz-config-panel.service`
- Panel env file: `/etc/pz-config-panel.env`
- Panel bind target: `0.0.0.0:3210`

## Metadata Coverage

The panel ships with a curated metadata catalog covering ~110 INI settings and ~210 SandboxVars settings. Every known key has a type, group label, and description from the PZ wiki. Unknown keys receive an auto-generated label from the camelCase key name.

## V1 Guarantees

- Read and edit existing INI and Sandbox keys through the GUI.
- Keep unknown keys visible and preserve untouched file structure.
- Mask password-like settings on read.
- Keep large config groups collapsible while search reopens matching settings.
- Edit existing `Mods` and `WorkshopItems` INI lists through a dedicated manual mods surface.
- Manage spawn regions through a dedicated Spawn tab — reads `<server>_spawnregions.lua`, shows all regions with checkboxes, rewrites the file with only enabled regions.
- Require diff review before save.
- Create and restore per-file config backups with last-20 retention.
- Reject stale browser revisions and unsafe config values.
- Require login through a Bearer token session when `PANEL_PASSWORD` is set.
- Report `Online` when the configured systemd unit is `active / running`.
- Restart only the configured game service through the narrow sudoers path.

## Known Boundaries

- Auth uses in-memory sessions. Panels restart loses all active sessions, requiring re-login. No session expiry beyond server restart.
- The panel has no HTTPS. Use a reverse proxy (nginx, Cloudflare Tunnel) for encrypted transport in production.
- The panel reads and writes disk config. It does not yet prove the running game has loaded a saved Sandbox value.
- The mods surface writes only `Mods` and `WorkshopItems`; map mods can still require a separate `Map` edit.
- The Spawn tab rewrites `<server>_spawnregions.lua` from scratch — regions disabled and saved are removed from the file entirely. To re-enable a removed region, the user must re-add it manually or restore a backup.
- The Spawn tab does not manage `<server>_spawnpoints.lua` or `SpawnPoint` in server.ini. It only toggles which spawn regions appear in the in-game spawn selector.
- When the `<server>_spawnregions.lua` file does not exist, the Spawn tab shows the 4 vanilla regions (Muldraugh, West Point, Riverside, Rosewood) as defaults and creates the file on first save.
- B42 config behavior should be checked against local references under `repos/` first. Ask for user-provided B42 docs when the source references do not settle game runtime behavior.
- The current `sudo -n systemctl restart project-zomboid.service` path requires the panel unit to omit `NoNewPrivileges=true`.

## Spawn Tab — Implementation Notes

The Spawn tab is a frontend-driven feature built on two new backend routes:

- `GET /api/config/spawn` — reads `<server>_spawnregions.lua` via `parseSpawnRegionsContent()`, returns regions array with `enabled: true` for all parsed entries. If the file is missing, returns 4 vanilla defaults.
- `PATCH /api/config/spawn` — accepts `{ revision, regions }`, validates at least one region is enabled, creates a backup of the old file, writes only `enabled: true` regions via `generateSpawnRegionsContent()`, returns the full regions array with updated revision.

Key files:
- `src/lib/parsers.js`: `parseSpawnRegionsContent()`, `generateSpawnRegionsContent()`
- `src/lib/config-file-service.js`: `readSpawn()`, `saveSpawn()`, `spawnRegionsFilePath()`
- `public/app.js`: `loadSpawn()`, `renderSpawn()`, `collectSpawnChanges()`, `reviewSpawnChanges()`, `saveReviewedSpawn()`

Reference for Lua parse/generate patterns: `repos/zomboid-control-panel-main/server/routes/serverFiles.js` lines 562–611.

## Verification

Local regression command:

```bash
npm test
```

VPS operational checks:

```bash
sudo systemctl status project-zomboid.service --no-pager
sudo systemctl status pz-config-panel.service --no-pager
curl http://127.0.0.1:3210/api/server/status
```

## Source References Used

- `repos/pzserver-gui-master/pzserver-gui-master/app/services/file_manager.py`
- `repos/zomboid-control-panel-main/zomboid-control-panel-main/server/routes/serverFiles.js`
- `repos/zomboid-control-panel-main/zomboid-control-panel-main/client/src/lib/serverConfigSchema.ts`
- `repos/zomboid-control-panel-main/zomboid-control-panel-main/pz-mod/PanelBridge/media/lua/server/PanelBridge.lua`
- `repos/Zomboid_Server_Manager_Docker-main/Zomboid_Server_Manager_Docker-main/app/app/Services/ServerIniParser.php`
- `repos/Zomboid_Server_Manager_Docker-main/Zomboid_Server_Manager_Docker-main/app/app/Services/SandboxLuaParser.php`
- `repos/Zomboid_Server_Manager_Docker-main/Zomboid_Server_Manager_Docker-main/app/app/Services/ModManager.php`
- `repos/Zomboid_Server_Manager_Docker-main/Zomboid_Server_Manager_Docker-main/app/resources/js/lib/config-metadata.ts`
- `repos/zomboid-control-panel-main/zomboid-control-panel-main/server/routes/mods.js`

## Next Focus

Decide the next slice before implementing:

1. Runtime verification for saved Sandbox settings, likely by evaluating the local `PanelBridge` runtime sandbox introspection approach.
2. A richer mods slice: Workshop lookup/import, disk detection of multiple Mod IDs, and map-folder handling.
