# Handoff

## Current State

V1 is a private Express + vanilla JS config panel for one vanilla Project Zomboid B42 server profile.

Verified VPS baseline on May 21, 2026:

- Game service: `project-zomboid.service`
- Game command: `/home/steam/pz_server/start-server.sh -servername servertest`
- Game config files: `/home/steam/Zomboid/Server/servertest.ini` and `/home/steam/Zomboid/Server/servertest_SandboxVars.lua`
- Panel deploy path: `/opt/pz-config-panel`
- Panel service: `pz-config-panel.service`
- Panel env file: `/etc/pz-config-panel.env`
- Panel bind target: `127.0.0.1:3210`

## V1 Guarantees

- Read and edit existing INI and Sandbox keys through the GUI.
- Keep unknown keys visible and preserve untouched file structure.
- Mask password-like settings on read.
- Keep `Mods` and `WorkshopItems` read-only.
- Require diff review before save.
- Create and restore per-file config backups with last-20 retention.
- Reject stale browser revisions and unsafe config values.
- Report `Online` when the configured systemd unit is `active / running`.
- Restart only the configured game service through the narrow sudoers path.

## Known Boundaries

- The panel is private-by-network-path only. It has no V1 auth layer and must stay on localhost or another private path.
- The panel reads and writes disk config. It does not yet prove the running game has loaded a saved Sandbox value.
- B42 config behavior should be checked against local references under `repos/` first. Ask for user-provided B42 docs when the source references do not settle game runtime behavior.
- The current `sudo -n systemctl restart project-zomboid.service` path requires the panel unit to omit `NoNewPrivileges=true`.

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
- `repos/Zomboid_Server_Manager_Docker-main/Zomboid_Server_Manager_Docker-main/app/resources/js/lib/config-metadata.ts`

## Next Focus

Decide the next slice before implementing:

1. Runtime verification for saved Sandbox settings, likely by evaluating the local `PanelBridge` runtime sandbox introspection approach.
2. The previously planned mod-management milestone for `Mods` and `WorkshopItems`.
