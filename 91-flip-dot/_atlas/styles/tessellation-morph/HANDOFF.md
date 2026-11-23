# HANDOFF — style 93 `tessellation-morph` (stopped early, nothing rendered)

## What exists
- `tiling.js` — DONE planner (Node-safe): `sampleEdge`, `makeTiling` (`edge`, `outline`, `validate`), `detailWeight`,
  `makeField` (stages, sweep delay, gradient `stops` + `slide`), `planWall` (tiles, shared edges, `frame(t)`, `ring`,
  `poseAt` flight, `events()`), `tilingVoices`. Only `makeTiling`/`validate` were run (ok, area 0.5); the rest is untested.
- `spec.js` — DONE, never imported: palette (cream/navy, coral backing), key shapes square/fish/bird, details, tile, caption, sound.
- `style.js` — STILL THE NEUTRAL COPY. Must be written. No STYLE.md. No project folder `93-tessellation-morph/`.

## Decisions
Diamond lattice a=[.5,-.5], b=[.5,.5], size 2 m; edge a (K→bottom) and edge b (K→top), each shared with its shifted copy;
per-edge morph value at edge midpoint (gradient stays gap-free). Parity 0 = cream (raised), rows alternate colour.
Shapes checked only as 2D SVG previews: fish and bird both read; bird is chunky (dove-like).

## Next steps
1. `style.js`: `wall(plan)` = one dynamic BufferGeometry (per tile: 96-point ring from `plan.ring`; top face = two
   earcuts split on chord K→N with inset verts, chamfer ring, side wall; `shadowSide = DoubleSide`), ink mesh (eye discs,
   strokes, coral beak scaled by `detailWeight`), coral backing plane, flight transform (fold ±flap about body axis at
   top surface, then yaw/pitch/roll + translate), overlay caption with morph slider.
2. `node "$SK/scripts/new-scene.mjs" "/Volumes/Panther/3D Style Atlas/93-tessellation-morph" --style tessellation-morph --duration 15`
3. scene.config: beats 0 / 2.2 / 5.2 / 8.4 / 11.6; stages to 1 (t0 2.2), to 2 (5.3), gradient stops
   [[-6.2,0],[-2.6,1],[-0.2,1],[3.4,2]] (8.4) with slide dx −3.5 at 11.5; flight rowY 0, x 0.5–9.5, t0 12.0, rtl.
   Labels: "Start with plain tiles", "Bend the edges: fish", "Slide further: birds", "Latent space, on one wall", "Then an idea takes off".
4. `build.mjs <proj> --skip-render`, `check-frames --times 1,4,8,12,14.5`, look, iterate; final `build.mjs --checks ...`, then `check-frames --deep`.

Scratch previews (disposable) are in the session scratchpad only.
