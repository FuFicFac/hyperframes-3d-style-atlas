# Installing the 3d-style-atlas skill (status as of 2026-11-15)

ej wants this skill installed for every agent. This file is the durable copy of the two handoff notes dropped in `Inbox/` on 2026-11-15.

## How to install

- **With D Second Brain access:** link (preferred) or copy this folder into your platform's skill-loading path under the name `3d-style-atlas`, e.g. `ln -s "<D Second Brain>/Skills/3d-style-atlas" ~/.codex/skills/3d-style-atlas`.
- **Without it:** clone `https://github.com/FuFicFac/hyperframes-3d-style-atlas` and use its `skill/` folder (a snapshot of this folder from 2026-11-15, commit `88692fe`). Pass `--pilot <clone folder>` to `build-index.mjs` / `build-gallery.mjs`.
- Do not fork it. This folder is the working copy; re-copy from here after changes.
- Rendering needs Node and `npx hyperframes` (headless Chrome). On the M1: Node v22, HyperFrames 0.9.52.

## Where it is installed

| Machine | Path | Status |
|---|---|---|
| M1 MacBook Pro | `~/.claude/skills/3d-style-atlas` (symlink) | Confirmed: shows in Claude Code's skill list |
| M1 MacBook Pro | `~/.codex/skills/3d-style-atlas` (symlink) | Link created, not confirmed inside Codex |
| M1 MacBook Pro | `~/.agents/skills/3d-style-atlas` (symlink) | Link created, not confirmed in use |
| M1 MacBook Pro | `~/.hermes/skills/creative/3d-style-atlas` (symlink) | Link created, not confirmed inside Hermes |
| Mac mini | Codex, OpenClaw agents, Hank, Holly | Not installed |

## Related

- Demos, gallery, combined videos and the local GitHub checkout: `/Volumes/Panther/3D Style Atlas/` on the external Panther drive (70 styles). Moved there on 2026-11-15 from `Builder/HyperFrames/3d-style-atlas-pilot/`; that Dropbox folder no longer exists, so older docs naming it mean the Panther folder.
- GitHub release with the combined videos: `atlas-v2`.
- The public gallery website still shows the first 50 styles and has not been republished.
