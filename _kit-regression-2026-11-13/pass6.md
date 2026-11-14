# Kit pass 6 regression — 2026-11-13 (batch-5 promotions, styles 25–36)

## What changed (all additive; defaults unchanged)

1. `kit/selfcheck.js` + `check-frames --deep`: HDR NaN/Inf scan now reads EVERY pixel at full resolution (was 1/8 size, 48×48 samples), reports the pixel box, first pixel and the mesh a ray hits there; new `blackBlocks` final-frame warning; `readCanvas`. Planted 2-px `pow(-1,.5)`: new scan finds it (2 NaN, box + mesh named), old scan reported 0. Clockwork in-page check: 1.2 s for 6 times.
2. `textures.uploadTexture(stage, ...tex)` (needsUpdate + renderer.initTexture); `overlay.screenCanvas(..., { upload: true })` uploads at build and on each redraw. Determinism trap added to style-authoring §5.
3. `time.js`: `lerp`, `invLerp`/`remap`, `beat` (and so `envelope`) fall back to a limit/step only when the old formula is NaN (smoothstep already did). `scripts/test-kit.mjs` checks all infinite cases + 20 000 finite cases bit-identical.
4. `plaqueCanvas({ glintScale })` opt-in (glint = glintScale × cap); default 6 mm unchanged (marble-run, zen-sand untouched).
5. `paperTexture({ variant: "even" })` opt-in isotropic variant; default unchanged.
6. New `kit/framing.js` (THREE-free): `sampleCameraKeys` (bit-identical to createCameraRig.sample: 3 key sets × 3001 times incl. arc, roll, viewHeight, drift + orbit), `projectPoint` (vs THREE Vector3.project ≤ 1.1e-15), `cameraBasis`, `boxCorners`, `screenExtent`, `framingReport` (fails + per-region spans).
7. `pathmath.js`: `octilinearCorners`, `chamferCorners`, `arcTable`, `octilinearRoute` (round/chamfer/none bends, O(log n) at(s), project, stationS).
8. `kit/heightfield.js` (heightField, descentPath) and `valueNoise2`/`fbm2` moved to `noise.js`; terrain.js/textures.js re-export them (old imports work).
9. `new-scene.mjs`: SCORE types validated against VOICES with fallbacks; pad bed gets root/brightness. Reported bug did not reproduce on the 37 current specs (all scaffold + render-sfx clean, old and new); neutral/clockwork/weather-map scaffolds pass build --skip-render (lint 0/0, check ok). paintPixels-returns-a-canvas documented.
10. Docs: kit-api §2.24 + inline updates; style-authoring lessons (focus dimming, subject size/labels/final wide, tangents, hf-transaction folders) and §5 trap; SKILL.md (36 styles, batch-5 picks, Limits).

## Evidence

- `pass6-raw/inpage-hashes-*.txt`: canvas hash at every probe time, old kit (2 runs) vs new kit. 36/37 projects bit-identical at every time. 29-newspaper-press changes hash between two runs of the OLD kit too.
- `pass6-raw/<project>.log`: full `check-frames --deep` output with the new kit (stills in each project's renders/checks/).
- `pass6-raw/29-newspaper-press.*`: extra runs, old kit ×4 and new kit ×3, plus `old-vs-new-snapshots.txt` (3 snapshots each, pairwise).

## Per-project result (new kit, `check-frames --times <RUN.txt times> --deep`)

| project | determinism | mp4-vs-code | worst PSNR dB | deep | NaN/Inf | in-page hash = old kit |
|---|---|---|---|---|---|---|
| 00-smoke | OK | OK | 39.0 | OK | 0/0 | 7/7 |
| 01-low-poly | OK | OK | 36.4 | OK | 0/0 | 8/8 |
| 02-paper-pop-up | OK | OK | 34.9 | OK | 0/0 | 17/17 |
| 03-neon-sign | OK | OK | 34.8 | OK | 0/0 | 8/8 |
| 04-soft-clay | OK | OK | 37.4 | OK | 0/0 | 9/9 |
| 05-tiny-diorama | OK | OK | 37.7 | OK | 0/0 | 8/8 |
| 06-blueprint-build | OK | OK | 36.1 | OK | 0/0 | 10/10 |
| 07-split-flap-board | OK | OK | 37.6 | OK | 0/0 | 8/8 |
| 08-voxel | OK | OK | 31.1 | OK | 0/0 | 8/8 |
| 09-spotlight-stage | OK | OK | 35.6 | OK | 0/0 | 11/11 |
| 10-exploded-view | OK | OK | 38.2 | OK | 0/0 | 8/8 |
| 11-marble-run | OK | OK | 35.8 | OK | 0/0 | 11/11 |
| 12-studio-product | OK | OK | 34.8 | OK | 0/0 | 8/8 |
| 13-wireframe-hologram | OK | OK | 32.5 | OK | 0/0 | 12/12 |
| 14-origami | OK | OK | 40.3 | OK | 0/0 | 8/8 |
| 15-felt-stitch | OK | OK | 34.5 | OK | 0/0 | 8/8 |
| 16-toy-brick | OK | OK | 39.2 | OK | 0/0 | 8/8 |
| 17-crt-retro | OK | OK | 36.9 | OK | 0/0 | 10/10 |
| 18-floating-screens | OK | OK | 38.0 | OK | 0/0 | 13/13 |
| 19-embossed-letterpress | OK | OK | 39.0 | OK | 0/0 | 10/10 |
| 20-isometric-pastel | OK | OK | 37.9 | OK | 0/0 | 13/13 |
| 21-chalkboard | OK | OK | 37.8 | OK | 0/0 | 16/16 |
| 22-glass-light | OK | OK | 40.1 | OK | 0/0 | 8/8 |
| 23-liquid-chrome | OK | OK | 32.5 | OK | 0/0 | 10/10 |
| 24-wam-house | OK | OK | 36.6 | OK | 0/0 | 13/13 |
| 25-stained-glass | OK | OK | 36.1 | OK | 0/0 | 6/6 |
| 26-subway-map | OK | OK | 39.4 | OK | 0/0 | 7/7 |
| 27-circuit-board | OK | OK | 39.6 | OK | 0/0 | 5/5 |
| 28-cardboard-stop-motion | OK | OK | 38.3 | OK | 0/0 | 6/6 |
| 29-newspaper-press | FAIL in 2 of 3 runs (±2 levels, ≤20 px, pre-existing — see note) | OK | 35.8 | OK | 0/0 | 3/8 (old kit itself 4/8 run-to-run) |
| 30-film-projector | OK | OK | 40.1 | OK | 0/0 | 8/8 |
| 31-weather-map | OK | OK | 34.7 | OK | 0/0 | 5/5 |
| 32-terrarium | OK | OK | 38.1 | OK | 0/0 | 6/6 |
| 33-card-table | OK | OK | 39.3 | OK | 0/0 | 5/5 |
| 34-clockwork | OK | OK | 39.2 | OK | 0/0 | 6/6 |
| 35-zen-sand | OK | OK | 36.5 | OK | 0/0 | 6/6 |
| 36-hanging-mobile | OK | OK | 41.1 | OK | 0/0 | 5/5 |

## Notes

- **No NaN/Inf** in any of the 37 demos at any probe time with the full-resolution scan; no black-block warnings.
- **29-newspaper-press** (pre-existing, not caused by the kit): pixels in the masthead/headline band (x 547–1401, y 106–179) vary by ±1 level on 9–20 px between separate page loads. Old kit ×4 runs: always within the ±1 tolerance. New kit ×3: 2 runs showed max 2 levels on 18–20 px at t=5.6/6.9 (determinism FAIL), the 3rd passed. Pairwise snapshots old-vs-new differ no more than old-vs-old (max 1 except pairs involving one +1/−1 outlier run, `new3`). In-page (one page load) it is stable: deep self-check OK every run. Likely the texture-upload trap (a canvas drawn once and uploaded lazily); style not edited, per instructions. The latest `renders/checks/` run (run3) is a pass.
- 03-neon-sign: bit-identical this pass (its usual ±1 GPU noise did not appear).
- No MP4 re-rendered. `build-index`: 37 entries (36 styles + neutral reference); `build-gallery`: 36 styles, 0 without MP4.
