# Project Zomboid Server Recovery

Use this when the panel is reachable but `project-zomboid.service` does not
survive a restart, especially after a config or Workshop apply.

## Separate The Surfaces

The panel and the game server are separate services. Check both before changing
config:

```bash
ssh root@<vps-host> 'systemctl show pz-config-panel.service --property=ActiveState --property=SubState --property=MainPID --property=ExecMainStatus --property=Result --no-pager'
ssh root@<vps-host> 'curl -I -sS --max-time 10 http://127.0.0.1:3210/'
ssh root@<vps-host> 'systemctl show project-zomboid.service --property=ActiveState --property=SubState --property=MainPID --property=ExecMainStatus --property=Result --property=ActiveEnterTimestamp --no-pager'
```

Do not assume a public server monitor is current immediately after a restart.
Use the VPS service state, game logs, and listening ports first.

## Diagnose A Failed Game Restart

Read the game log around the failed start and inspect the config lists the panel
may have written:

```bash
ssh root@<vps-host> 'journalctl -u project-zomboid.service -n 260 --no-pager'
ssh root@<vps-host> "grep -E '^(WorkshopItems|Mods|Map)=' /home/steam/Zomboid/Server/servertest.ini"
ssh root@<vps-host> 'ls -lh /home/steam/pz_server/java/projectzomboid.jar /home/steam/pz_server/start-server.sh /home/steam/pz_server/ProjectZomboid64.json'
ssh root@<vps-host> 'cat /home/steam/pz_server/steamapps/appmanifest_380870.acf'
```

`Failed to find class: zombie/network/GameServer` at start, or repeated
`NoClassDefFoundError` lines from a previously running server, can indicate that
the dedicated-server files on disk are damaged. In the May 22, 2026 incident,
`/home/steam/pz_server/java/projectzomboid.jar` was an empty 22-byte ZIP before
the recovery restart. The old Java process had already logged missing-class
errors before the Workshop apply restarted it, so the observed disk damage
predated that restart.

## Revalidate The Dedicated Server

Project Zomboid Dedicated Server is Steam app `380870`. Keep the current branch
when repairing it. The May 22, 2026 VPS manifest showed `BetaKey=unstable`, so
that recovery used:

```bash
ssh root@<vps-host> 'sudo -u steam /usr/games/steamcmd +force_install_dir /home/steam/pz_server +login anonymous +app_update 380870 -beta unstable validate +quit'
```

For a public-branch install, omit `-beta unstable` instead of changing branches
as part of recovery. Wait for SteamCMD to report that app `380870` is fully
installed, then start the game service:

```bash
ssh root@<vps-host> 'systemctl start project-zomboid.service'
```

## Verify Recovery

Confirm the jar is restored, the process stays up, the game reaches its ready
log marker, and the relevant ports exist:

```bash
ssh root@<vps-host> 'ls -lh /home/steam/pz_server/java/projectzomboid.jar'
ssh root@<vps-host> 'systemctl show project-zomboid.service --property=ActiveState --property=SubState --property=MainPID --property=ExecMainStatus --property=Result --no-pager'
ssh root@<vps-host> 'journalctl -u project-zomboid.service -n 220 --no-pager'
ssh root@<vps-host> 'ss -lunp'
ssh root@<vps-host> 'ss -ltnp'
```

Useful success evidence in the game log:

- `*** SERVER STARTED ****`
- `Workshop: item state CheckItemState -> Ready ID=<workshop-id>` for enabled
  Workshop content
- `RCON: listening on port 27015` when RCON is configured

For this VPS, the game listens on UDP `16261` and `16262`; `ufw` should allow
those ports when the server must be reachable publicly:

```bash
ssh root@<vps-host> 'ufw status verbose'
```

## Roll Back A Mod Config Apply

The panel writes an INI backup before its reviewed Workshop apply. List backups
before deciding to edit `servertest.ini` manually:

```bash
ssh root@<vps-host> "find /home/steam/Zomboid/Server/.pz-config-panel-backups -maxdepth 1 -type f -printf '%TY-%Tm-%Td %TH:%TM %f\n'"
```

Prefer the panel restore path when it is healthy. If a direct file restore is
needed, inspect the selected backup and make the restore decision explicitly;
do not delete downloaded Workshop content as part of the first recovery pass.
