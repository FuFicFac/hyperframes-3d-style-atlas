# 06-blueprint-build — "Anatomy of an AI agent" (style `blueprint-build`)

15 s, 1920x1080, 30 fps. Output: `renders/06-blueprint-build.mp4`; stills used for review in `renders/checks/`.

- `scene.config.js` — all data: beats, assembly geometry (`PART`), camera poses + zoom keys (`VIEW`), the plot
  schedule (`PLOT`, one `[start,end]` per drawable), sheet layout in px (`SHEET`), dimensions, and the SFX score
  (derived from `PLOT`). Retime a beat there and pen sounds follow.
- `scene.js` — builds props from the style and drives progress from `PLOT`. Pure function of t.
- `_atlas/` — generated copy of the kit; never edit. Edit `Skills/3d-style-atlas/styles/blueprint-build/` and rebuild.

Rebuild: `node "$SK/scripts/build.mjs" . --checks 0.6,2.0,3.2,5.9,7.2,8.2,9.4,11.2,12.3,14.8`
(SK = `Skills/3d-style-atlas`). Fast loop: add `--skip-render`, then `scripts/check-frames.mjs . --times ...`.
