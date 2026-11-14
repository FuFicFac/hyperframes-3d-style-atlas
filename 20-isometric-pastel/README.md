# 20-isometric-pastel — "The AI stack" (15 s, style `isometric-pastel`)

- `renders/20-isometric-pastel.mp4`: the verified render (1920×1080, 30 fps, CRF 22, SFX).
- `renders/checks/t*.png`: the stills used for the visual check, seeked in both orders with matching md5 hashes.
- `scene.config.js` holds the data: beats, the four floors (colour, floor-to-floor height, post clearance, entry), every prop
  position + reveal time, the cable paths, camera keys (`iso.isoKey`: locked true-iso camera, pan + ortho zoom only), overlay
  copy/timing and the score. The stack schedule is the style's THREE-free `iso.stackPlan`, so every whoosh/clack/pulse blip
  in SCORE comes from the same plan as the picture.
- `scene.js` builds the floors from the style props, wires flat long shadows (`castShadows`: deck props → their slab,
  slabs → ground) and does the per-frame work: stack → reveals → loops → pulse → camera → `updateShadows()` → overlay.
- `scene.spec.json` is the renderer-agnostic export. `_atlas/` is a generated kit copy; don't edit it.

Rebuild: `node "$SK/scripts/build.mjs" . --checks 0.4,2.4,3.45,5.2,8.2,10.6,12.4,13.75,14.8`
(SK = `Skills/3d-style-atlas`). Style docs: `Skills/3d-style-atlas/styles/isometric-pastel/STYLE.md`.
