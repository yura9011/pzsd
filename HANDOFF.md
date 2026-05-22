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
- Install a Workshop mod from URL/ID by downloading it through SteamCMD, inspecting local `mod.info` dependencies and map folders, saving reviewed INI additions, and restarting after required dependencies are resolved.
- Edit existing `Mods` and `WorkshopItems` INI lists through the advanced manual mods surface.
- Manage spawn regions through a dedicated Spawn tab — reads `<server>_spawnregions.lua`, shows all regions with checkboxes, rewrites the file with only enabled regions.
- Operate the running server through a local RCON Live tab for online players, manual commands, world save, and broadcasts.
- Show disk-vs-runtime application status by surface. `server.ini` can run RCON `reloadoptions` and compare comparable `showoptions` output; Sandbox, Mods, and Spawn are tracked by disk revision versus service restart time.
- Require diff review before save.
- Create and restore per-file config backups with last-20 retention.
- Reject stale browser revisions and unsafe config values.
- Require login through a Bearer token session and refuse startup without `PANEL_PASSWORD`.
- Report `Online` when the configured systemd unit is `active / running`.
- Restart only the configured game service through the narrow sudoers path.

## Known Boundaries

- Auth uses in-memory sessions. Panel restart loses all active sessions, requiring re-login. Sessions expire after `SESSION_TTL_HOURS` hours, defaulting to 8.
- The panel has no HTTPS. Use a reverse proxy (nginx, Cloudflare Tunnel) for encrypted transport in production.
- The panel reads and writes disk config. It does not yet prove the running game has loaded a saved Sandbox value.
- The INI Apply live path proves only comparable non-sensitive options surfaced by RCON `showoptions`; it is not a generic runtime verification path for Mods, Spawn, or SandboxVars.
- Live RCON operations need `PZ_RCON_PASSWORD` in the panel env plus matching RCON values in `servertest.ini`; they are unavailable until the game RCON listener is ready.
- The manual mods surface writes only `Mods` and `WorkshopItems`; the guided Workshop installer can add locally detected map folders to an existing `Map` line during its reviewed apply.
- Workshop dependency resolution is local-first. The installer follows `require=` from downloaded `mod.info`; if it cannot map a required Mod ID to downloaded Workshop content it blocks apply and asks for the dependency Workshop URL or ID.
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

## Config Application Status

- `GET /api/config/apply-status?surface=ini|sandbox|mods|spawn` combines the current disk revision and file mtime with `systemd` active-since time.
- Disk changes newer than the active game service remain saved-only or restart-required depending on whether that surface has an apply-live path.
- `POST /api/config/ini/apply` requires the current INI revision, runs RCON `reloadoptions`, and compares non-sensitive comparable INI keys from RCON `showoptions`.
- Runtime Sandbox verification still needs a separate bridge or an equivalent B42 introspection surface before the panel can claim exact Sandbox values are active.

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

## May 22 Recovery Note

The first VPS Workshop smoke installed Workshop item `3669550831` with Mod ID
`ProximityInventory`. The reviewed INI apply wrote:

```ini
WorkshopItems=3669550831
Mods=ProximityInventory
Map=Muldraugh, KY
```

The panel stayed up after that apply, but the game service did not survive the
restart. The game start log failed with `Failed to find class:
zombie/network/GameServer`; `/home/steam/pz_server/java/projectzomboid.jar` was
an empty 22-byte ZIP with an earlier May 21 timestamp, and the already-running
Java process had logged missing-class failures before the Workshop restart.

Recovery revalidated Steam app `380870` in the current `unstable` branch with
SteamCMD, restored `projectzomboid.jar` to about 61 MB, and started
`project-zomboid.service` again. The repaired start reached `*** SERVER STARTED
****`, loaded Workshop item `3669550831` as `Ready`, exposed UDP `16261` and
`16262`, and listened for RCON on `27015`. See
`deploy/PZ_SERVER_RECOVERY.md` for the repeatable checks and recovery commands.
Treat public server monitors as delayed evidence after a restart; verify the VPS
service, game log, and listening ports first.

## Source References Used

- `repos/pzserver-gui-master/pzserver-gui-master/app/services/file_manager.py`
- `repos/zomboid-control-panel-main/zomboid-control-panel-main/server/routes/serverFiles.js`
- `repos/zomboid-control-panel-main/zomboid-control-panel-main/client/src/lib/serverConfigSchema.ts`
- `repos/zomboid-control-panel-main/zomboid-control-panel-main/pz-mod/PanelBridge/media/lua/server/PanelBridge.lua`
- `repos/Zomboid_Server_Manager_Docker-main/Zomboid_Server_Manager_Docker-main/app/app/Services/ServerIniParser.php`
- `repos/Zomboid_Server_Manager_Docker-main/Zomboid_Server_Manager_Docker-main/app/app/Services/SandboxLuaParser.php`
- `repos/Zomboid_Server_Manager_Docker-main/Zomboid_Server_Manager_Docker-main/app/app/Services/ModManager.php`
- `repos/Zomboid_Server_Manager_Docker-main/Zomboid_Server_Manager_Docker-main/app/app/Services/SteamWorkshopClient.php`
- `repos/Zomboid_Server_Manager_Docker-main/Zomboid_Server_Manager_Docker-main/app/resources/js/lib/config-metadata.ts`
- `repos/zomboid-control-panel-main/zomboid-control-panel-main/server/routes/mods.js`
- `repos/pz-admin-main/pz-admin-main/rcon.go`
- `repos/Zomboid_Server_Manager_Docker-main/Zomboid_Server_Manager_Docker-main/app/app/Services/RconClient.php`
- `repos/Zomboid_Server_Manager_Docker-main/Zomboid_Server_Manager_Docker-main/app/app/Services/OnlinePlayersReader.php`

## Next Focus

Decide the next slice before implementing:

1. Player administration on top of the Live RCON foundation: guided kick/ban/whitelist/access actions with explicit guardrails.
2. Runtime verification for saved Sandbox settings beyond restart evidence, likely by evaluating the local `PanelBridge` runtime sandbox introspection approach.
3. The next mods slice: guided remove/delete/reorder, update status, and optional Steam API dependency metadata beyond local `mod.info`.
