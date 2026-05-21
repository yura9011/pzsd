# AGENTS.md

> Operating rules for coding agents working on this repository.
> Read this before planning or editing.

## Project Context

Current baseline:

- A vanilla Project Zomboid B42 dedicated server runs on a Hostinger Ubuntu VPS as user `steam`.
- The game service is `project-zomboid.service`, starts `/home/steam/pz_server/start-server.sh -servername servertest`, and reads server profile files from `/home/steam/Zomboid/Server`.
- This repo owns a private Express + vanilla JS config panel for that one server profile.
- The panel deploys under `/opt/pz-config-panel`, runs as `pz-config-panel.service`, reads `/etc/pz-config-panel.env`, and binds `127.0.0.1:3210` by default.
- V1 edits existing `servertest.ini` and `servertest_SandboxVars.lua` values on disk, keeps per-file backups, reports the configured `systemd` state, and requests restart through a narrow sudoers rule.
- V1 does not prove which sandbox values are already loaded inside the running game process. Disk values, restart status, and runtime sandbox introspection are separate truth surfaces.

Reference research retained in `repos/`:

- `pzserver-gui` is a small Flask/Jinja/Tailwind panel focused on LinuxGSM-style Project Zomboid files and controls.
- `zomboid-control-panel` includes richer config schemas and a `PanelBridge` mod with runtime sandbox option introspection.
- `Zomboid_Server_Manager_Docker` includes parser, metadata, API, and test references for `server.ini` and `SandboxVars.lua`.
- `pz-admin` is a desktop/RCON reference.
- LinuxGSM and Pterodactyl remain research options, not the deployed baseline unless the user explicitly changes direction.

## Source Of Truth

Read `README.md`, `HANDOFF.md`, and this file before planning substantial work.

Search this repo first. For Project Zomboid behavior or reference architecture, search the fetched source under `repos/` before using external documentation:

- `repos/pzserver-gui-master`
- `repos/zomboid-control-panel-main`
- `repos/Zomboid_Server_Manager_Docker-main`
- `repos/pz-admin-main`

If a required source reference is missing, fetch only the needed repo or package into `repos/` or `opensrc/`, then report the exact files and functions consulted in the final handoff. Ask the user for B42 documentation when local source does not answer a game behavior question cleanly.

## Agentic Engineering Workflow

The user makes strategic decisions. Coding agents execute technical work from the source of truth.

For every implementation task:

- Keep the work small enough for a focused PR.
- Prefer one feature, one ownership boundary, or one behavior surface per PR.
- Build the minimum working change first.
- Run a separate cleanup pass only after behavior works.
- Move repeated mechanics into service-layer modules when duplication is proven.
- Keep domain policy in the caller; services handle reusable mechanics.

Do not mix unrelated cleanup, feature work, and deployment changes in one PR.

## Branch And PR Workflow

`staging` is the intended integration branch for feature work, but it only becomes mandatory after it has been explicitly created from the approved baseline.

After `staging` exists:

- Create feature branches from the latest `staging`.
- Prefer isolated worktrees under `.worktrees/<branch-name>`.
- Open small, focused PRs from feature branches into `staging`.
- Do not merge unrelated feature work into another feature branch unless the PR is intentionally stacked and the dependency is real.
- After a feature PR merges into `staging`, update active feature branches from `staging` before continuing.
- Promote `staging` to `main` only when the integrated set is ready for release.

## Rule 1 - Think Before Coding

State assumptions explicitly. Ask rather than guess.

Push back when a simpler approach exists. Stop when confused.

Before coding, define:

- What problem is being solved.
- What files are likely involved.
- What is explicitly out of scope.
- What would prove the change worked.

## Rule 2 - Simplicity First

Write the minimum code that solves the problem. Nothing speculative.

No abstractions for single-use code.

Prefer existing project patterns:

- Express + Socket.IO for dashboards.
- Vanilla JS/CSS for current frontends.
- JSON storage until SQLite migration is explicitly planned.
- Small modules over framework rewrites.

## Rule 3 - Surgical Changes

Touch only what you must. Do not improve adjacent code.

Match existing style. Do not refactor what is not broken.

Avoid broad cleanup inside feature work. If cleanup is useful, document it as a separate task.

## Rule 4 - Goal-Driven Execution

Define success criteria before editing. Loop until verified.

Strong success criteria should let an agent continue independently without inventing scope.

Every implementation task should include:

- Acceptance criteria.
- Verification command or manual check.
- Rollback or safety note when production/runtime data is involved.

## Rule 5 - Read Before You Write

Before adding code, read:

- Exports of the file being imported.
- Immediate callers of the function being changed.
- Shared utilities already available.
- Existing config shape and runtime data shape.

If unsure why existing code is structured a certain way, ask.

## Rule 6 - Source Lookup Before Coding

Do not hallucinate function names, package APIs, or runtime behavior.

Before coding against an external dependency or reference architecture:

- Search existing project code first.
- Search local source references under `repos/` next.
- Use `opensrc/` only when source has already been fetched there.
- If required source is missing, fetch only the needed package or repo with `npx opensrc <package-or-repo>`.
- Report the exact files and functions consulted in the final handoff.

## Package Security

Before adding a dependency, check whether existing dependencies or local code can solve the task.

Do not install a package published less than 14 days ago unless the user explicitly approves it.

Any new dependency proposal must include:

- package name
- purpose
- current version
- publish-age check
- why it is necessary

## Documentation Rules

- Archive obsolete planning docs instead of deleting them.
- Do not let root Markdown become the source of truth except `README.md`, `HANDOFF.md`, and `AGENTS.md`.



## Review Loop

After a service-layer PR is implemented and verified, run a Grep/Greptile-style review loop before asking for final human review:

- Read the diff first.
- Identify review risks and likely reviewer findings.
- Fix only real issues relevant to the PR.
- Add or update tests/checks when practical.
- Rerun relevant verification.
- Stop if a product or rollout decision is needed.

Final handoff for service-layer PRs must include a confidence score from 1 to 5 with concrete reasons. The score is a risk signal, not a substitute for human review.
