# 13-wireframe-hologram

"How a neural network reads a digit" (15 s) in the `wireframe-hologram` style (`Skills/3d-style-atlas/styles/wireframe-hologram/`).

- `scene.config.js`: beats, network layout (`NET`, `LAYERS`), the seeded graph and forward-pass plan (`GRAPH`, `PLAN` from the
  style's pure `holo.js`), choreography (`SHOW`), captions, camera keys, and a SCORE derived from all of them.
- `scene.js`: builds the props and drives every frame from `t`.
- `renders/13-wireframe-hologram.mp4`: final render (CRF 24, 9.6 MB). `renders/checks/t*.png`: verified stills (determinism OK).

Rebuild: `node Skills/3d-style-atlas/scripts/build.mjs <this dir> --crf 24 --checks 0.9,2.6,4.05,5.6,7.7,8.3,10.9,12.55,14.2`
