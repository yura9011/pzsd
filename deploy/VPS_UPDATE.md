# VPS Panel Update

Use this for code updates to the running config panel after the change is reviewed
and pushed to GitHub.

1. Check the local diff before publishing. Commit only the deployable panel change;
   keep unrelated work and large reference docs out of the deploy commit.
2. Push the branch the VPS checkout is using. Do not assume it is `main`.
3. Inspect the VPS checkout before pulling:

```bash
ssh root@<vps-host> 'git -C /opt/pz-config-panel status --branch --short'
```

Do not use `git reset` or `git clean` on the VPS. Existing local or untracked files
must be inspected and kept unless they block the update and the user approves the
cleanup.

4. Fast-forward the panel checkout and restart only the panel service:

```bash
ssh root@<vps-host> 'git -C /opt/pz-config-panel pull --ff-only'
ssh root@<vps-host> 'systemctl restart pz-config-panel.service'
```

If runtime dependencies changed, run `npm install --omit=dev` in
`/opt/pz-config-panel` before restarting the panel.

5. Verify the deployed commit and panel health:

```bash
ssh root@<vps-host> 'git -C /opt/pz-config-panel rev-parse --short HEAD'
ssh root@<vps-host> 'systemctl show pz-config-panel.service --property=ActiveState --property=SubState --property=MainPID --property=ExecMainStatus --no-pager'
ssh root@<vps-host> 'curl -I -sS http://127.0.0.1:3210/'
```

Restart `project-zomboid.service` only when a game-server change requires it or
the user explicitly asks for it.
