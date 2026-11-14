# 05-tiny-diorama — "Where does your prompt go?" (15 s, style `tiny-diorama`)

- `renders/05-tiny-diorama.mp4`: the verified render (1920×1080, 30 fps, CRF 22, SFX).
- `renders/checks/t*.png`: the stills used for the visual check. Each was seeked in both orders, and the md5 hashes match.
- `scene.config.js` holds all data: beats, layout, camera keys, pins, captions and score. `scene.js` holds the per-frame motion.
- `scene.spec.json` is the renderer-agnostic export. `_atlas/` is a generated kit copy; don't edit it.

Rebuild: `node "$SK/scripts/build.mjs" . --checks 0.75,2.9,4.3,5.9,6.95,9.3,11.9,14.6`
(SK = `Skills/3d-style-atlas`). Style docs: `Skills/3d-style-atlas/styles/tiny-diorama/STYLE.md`.
