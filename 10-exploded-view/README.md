# 10-exploded-view — "Inside a robot vacuum" (15 s, style `exploded-view`)

- `renders/10-exploded-view.mp4`: the verified render (1920×1080, 30 fps, CRF 22, SFX).
- `renders/checks/t*.png`: the stills used for the visual check, seeked in both orders with matching md5 hashes.
- `scene.config.js` holds the data: beats, the 11 parts (rest pose, explode offset/dir, seat, legend number), the pose keys
  (edge-on → upright hero → tipped diagonal stack → hero), camera keys, focus beats, callouts, and the score. The explode
  schedule comes from the style's THREE-free `explode.js`, so every whoosh/clack in SCORE is derived from the same plan.
- `scene.js` builds the robot from the style's part factories and does the per-frame work: pose slerp, `assembly.update(t)`,
  spins, focus, then camera → `assembly.sync(camera)` (silhouettes, axis lines, floor blobs) → overlay.
- `scene.spec.json` is the renderer-agnostic export. `_atlas/` is a generated kit copy; don't edit it.

Rebuild: `node "$SK/scripts/build.mjs" . --checks 1.2,2.4,3.6,6.4,8.9,11.5,13.1,14.8`
(SK = `Skills/3d-style-atlas`). Style docs: `Skills/3d-style-atlas/styles/exploded-view/STYLE.md`.
