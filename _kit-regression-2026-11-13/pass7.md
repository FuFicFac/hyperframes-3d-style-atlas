# Kit pass 7 regression — 2026-11-13 (final pass, 50 styles)

## What changed (additive; defaults unchanged except where stated)

1. **Canvas determinism** — new `kit/canvas.js` (`CANVAS_DEFAULTS`, `canvas2d`, `newCanvas`). Kit canvases now create their 2D
   context with `{ willReadFrequently: true }` (CPU raster): `makeCanvas` (all textures.js painters incl. plaqueCanvas,
   digitDrumTexture, paintPixels), `createTextLabel`, relief masks, fontoutline trace canvas. Per-call opt-out `{ willReadFrequently: false }`.
   **`screenCanvas` is opt-in** (default = old GPU canvas): with it on by default, 40-bead-abacus failed its deep self-check (below).
2. **DoF scale** — cause: BokehPass focus started at a fixed 5 m and blur = aperture × (focus − depth) in metres; a ~1 m set whose
   style never calls `setFocus` (mixing-console) sits 3.9 m in front of the focal plane, so every pixel clamps at `maxblur`.
   Aperture 0 does NOT blur (measured equal to no DoF). Fix: until `setFocus` is called the focus follows the rig target
   (`camera.userData.rigTarget`, written by `rig.update`); new `focus` (number | "target") and `relativeAperture` options.
   1 m test scene (`pass7-raw/dof-1m-test/`): old kit, no setFocus → near/focus/far card sharpness 4.13/4.06/4.04 (uniform blur,
   no DoF = 15.6/19.9/21.1); new kit → 15.06/19.93/12.56 (focus card sharp, far card soft).
3. **check-frames** — RUN.txt written once at exit (also on crash) via temp + rename; locked/undeletable files warn, never crash;
   stale `*conflicted copy*` and temp files in renders/checks are removed each run; determinism + deep verdicts recorded in RUN.txt.
   Tested on a scratch project with RUN.txt made a directory (unwritable) + a planted conflicted copy: run exits 0 with two WARNINGs.
4. **framing.js** — `framingReport` `window` (asymmetric NDC) and `keepOut` rectangles (+ `reason`/`over` on fails), `pxRect`,
   `subjectPoints`, generic `fitShot(subject, { azimuth, elevation, fov, window, fill, align, ortho })`. test-kit: through the real
   rig + THREE projection, 4 perspective subjects (incl. 1 m and 80 m scale) fill within 0.002 of target, bearing within 1e-4 rad,
   ortho y = ±0.900; equal to bead-abacus' local fitShot within 1 mm.
5. **sound.js** — `pluck` (Karplus-Strong, fractional delay, exact pitch) and `marimba` (partials 1:4:10). Existing voices
   bit-identical: sha256 of a fixed 12 s score over all 26 old voices/aliases = `f19013f5b74bda9bfcf0dc4814f370540bc91017b2ea58f08141bbe345c5be16`
   with the pass-6 kit and the pass-7 kit (now a test-kit check). Nothing was listened to.
6. Docs: kit-api §2.25 + inline (§1, §2.6, §2.7, §2.11, §2.13, §2.21, §2.23); style-authoring §5 traps (willReadFrequently,
   derivatives/texelFetch in per-face branches, instancing chunks in custom ShaderMaterial, assigned-not-accumulated jitter) and
   lessons (scene scale + DoF, file-size levers). SKILL.md: 50 styles, grouped pick-the-style table, Known weaker demos, Limits (pass 7).
7. test-kit.mjs: 93 checks, all pass.

## Method

- `before`: frozen copy of the pass-6 kit (scratch, outside Dropbox), `check-frames <proj> --times <RUN.txt times> --deep` on all 51,
  sequential with 10 s gaps (`pass7-raw/run-all.sh`). Logs: `pass7-raw/before/`. Times: `pass7-raw/times.txt`.
- `after`: first new-kit run (screenCanvas CPU by default): 50/51 pass, bead-abacus deep FAIL. Logs `pass7-raw/after/`, table `after-vs-before.md`.
- `final`: the shipped kit (screenCanvas opt-in): logs `pass7-raw/final/`, table below (`final-vs-before.md`).
- DoF isolation: pass-6 kit + only the new studio.js/camera.js, in-page hashes on copies of the 7 DoF projects: all identical to
  baseline (`pass7-raw/dof-only-inpage.txt`: studio-product 8/8, toy-brick 8/8, floating-screens 13/13, glass-light 8/8,
  circuit-board 5/5, clockwork 6/6, mixing-console 6/6).

## Per-project result (final kit)

| project | determinism | mp4-vs-code | worst PSNR dB before → after | deep | NaN+Inf | in-page hash = old kit | snapshot md5 = old kit |
|---|---|---|---|---|---|---|---|
| 00-smoke | OK | OK | 39.0 → 39.0 | OK | 0 | 5/7 | 5/7 |
| 01-low-poly | OK | OK | 36.4 → 36.4 | OK | 0 | 2/8 | 2/8 |
| 02-paper-pop-up | OK | OK | 34.9 → 34.9 | OK | 0 | 0/17 | 0/17 |
| 03-neon-sign | OK | OK | 34.8 → 34.9 | OK | 0 | 0/8 | 0/8 |
| 04-soft-clay | OK | OK | 37.4 → 37.4 | OK | 0 | 9/9 | 9/9 |
| 05-tiny-diorama | OK | OK | 37.7 → 37.7 | OK | 0 | 0/8 | 0/8 |
| 06-blueprint-build | OK | OK | 36.1 → 36.0 | OK | 0 | 0/10 | 0/10 |
| 07-split-flap-board | OK | OK | 37.6 → 37.4 | OK | 0 | 0/8 | 0/8 |
| 08-voxel | OK | OK | 31.1 → 31.1 | OK | 0 | 8/8 | 8/8 |
| 09-spotlight-stage | OK | OK | 35.6 → 35.6 | OK | 0 | 1/11 | 1/11 |
| 10-exploded-view | OK | OK | 38.2 → 38.1 | OK | 0 | 0/8 | 0/8 |
| 11-marble-run | OK | OK | 35.8 → 33.2 | OK | 0 | 0/11 | 0/11 |
| 12-studio-product | OK | OK | 34.8 → 34.8 | OK | 0 | 0/8 | 0/8 |
| 13-wireframe-hologram | OK | OK | 32.5 → 32.5 | OK | 0 | 0/12 | 0/12 |
| 14-origami | OK | OK | 40.3 → 40.3 | OK | 0 | 0/8 | 0/8 |
| 15-felt-stitch | OK | OK | 34.5 → 34.5 | OK | 0 | 0/8 | 0/8 |
| 16-toy-brick | OK | OK | 39.2 → 39.2 | OK | 0 | 0/8 | 0/8 |
| 17-crt-retro | OK | OK | 36.9 → 36.9 | OK | 0 | 0/10 | 0/10 |
| 18-floating-screens | OK | OK | 38.0 → 38.0 | OK | 0 | 0/13 | 0/13 |
| 19-embossed-letterpress | OK | OK | 39.0 → 37.6 | OK | 0 | 0/10 | 0/10 |
| 20-isometric-pastel | OK | OK | 37.9 → 37.9 | OK | 0 | 0/13 | 0/13 |
| 21-chalkboard | OK | OK | 37.8 → 37.7 | OK | 0 | 0/16 | 0/16 |
| 22-glass-light | OK | OK | 40.1 → 40.1 | OK | 0 | 0/8 | 0/8 |
| 23-liquid-chrome | OK | OK | 32.5 → 32.5 | OK | 0 | 10/10 | 10/10 |
| 24-wam-house | OK | OK | 36.6 → 34.2 | OK | 0 | 0/13 | 0/13 |
| 25-stained-glass | OK | OK | 36.1 → 36.1 | OK | 0 | 6/6 | 6/6 |
| 26-subway-map | OK | OK | 39.4 → 39.4 | OK | 0 | 0/7 | 0/7 |
| 27-circuit-board | OK | OK | 39.6 → 39.6 | OK | 0 | 0/5 | 0/5 |
| 28-cardboard-stop-motion | OK | OK | 38.3 → 38.3 | OK | 0 | 0/6 | 0/6 |
| 29-newspaper-press | OK | OK | 37.3 → 37.3 | OK | 0 | 6/6 | 6/6 |
| 30-film-projector | OK | OK | 40.1 → 40.1 | OK | 0 | 8/8 | 8/8 |
| 31-weather-map | OK | OK | 34.7 → 34.7 | OK | 0 | 0/5 | 0/5 |
| 32-terrarium | OK | OK | 38.1 → 38.0 | OK | 0 | 0/6 | 0/6 |
| 33-card-table | OK | OK | 39.3 → 39.1 | OK | 0 | 0/5 | 0/5 |
| 34-clockwork | OK | OK | 39.2 → 39.2 | OK | 0 | 0/6 | 0/6 |
| 35-zen-sand | OK | OK | 36.5 → 36.5 | OK | 0 | 6/6 | 6/6 |
| 36-hanging-mobile | OK | OK | 41.1 → 41.1 | OK | 0 | 0/5 | 0/5 |
| 37-domino-run | OK | OK | 34.9 → 34.9 | OK | 0 | 7/9 | 7/9 |
| 38-evidence-board | OK | OK | 37.6 → 37.6 | OK | 0 | 0/7 | 0/7 |
| 39-shadow-puppets | OK | OK | 38.8 → 38.8 | OK | 0 | 6/6 | 6/6 |
| 40-bead-abacus | OK | OK | 37.2 → 37.2 | OK | 0 | 0/6 | 0/6 |
| 41-sticky-notes | OK | OK | 38.2 → 38.2 | OK | 0 | 0/8 | 0/8 |
| 42-inflatable | OK | OK | 37.5 → 31.2 | OK | 0 | 0/6 | 0/6 |
| 43-pinball-table | OK | OK | 34.3 → 34.3 | OK | 0 | 0/6 | 0/6 |
| 44-star-chart | OK | OK | 34.9 → 34.9 | OK | 0 | 5/5 | 5/5 |
| 45-lab-glassware | OK | OK | 37.8 → 37.8 | OK | 0 | 0/6 | 0/6 |
| 46-mixing-console | OK | OK | 35.0 → 34.9 | OK | 0 | 0/6 | 0/6 |
| 47-conveyor-factory | OK | OK | 35.7 → 35.7 | OK | 0 | 0/5 | 0/5 |
| 48-city-lights | OK | OK | 30.4 → 30.4 | OK | 0 | 6/6 | 6/6 |
| 49-ink-wash | OK | OK | 41.4 → 41.4 | OK | 0 | 6/6 | 6/6 |
| 50-pin-art | OK | OK | 27.7 → 27.7 | OK | 0 | 0/7 | 0/7 |

**51/51 pass** determinism (all exact, no ±1 tolerance used), deep self-check with the full-resolution NaN/Inf scan (0 everywhere),
and MP4-vs-code (threshold 26 dB).

## Hashes

- Unchanged at every probe time (11): 04-soft-clay, 08-voxel, 23-liquid-chrome, 25-stained-glass, 29-newspaper-press, 30-film-projector,
  35-zen-sand, 39-shadow-puppets, 44-star-chart, 48-city-lights, 49-ink-wash.
- Changed (40, all others): kit canvases (text labels, textures, plaques, glyph traces) now rasterise on the CPU. No MP4 was re-rendered,
  so these MP4s now differ slightly from what the code draws; every one still passes MP4-vs-code.
- PSNR before → after: worst overall 27.7 dB (50-pin-art, unchanged, pre-existing). Largest drops: 42-inflatable 37.5 → 31.2
  (fontoutline balloon lettering traced from a CPU raster), 11-marble-run 35.8 → 33.2, 24-wam-house 36.6 → 34.2, 19-embossed-letterpress
  39.0 → 37.6. All others within ±0.2 dB.
- 29-newspaper-press: identical hashes in before / after / final (three separate page loads). Pass 6 saw it flip between loads.

## bead-abacus (why screenCanvas is opt-in)

With screenCanvas on the CPU path by default: t=7.9 differed when revisited in shuffled order — ONE pixel (1032, 513), ±1 level, on
the style's own nameplate face (a canvas the style creates with a plain GPU getContext). Pass-6 kit: stable in 5 selfChecks and 3×40
shuffled renders. Scratch-only diagnosis: nameplate canvas forced to willReadFrequently → stable; kit with only screenCanvas reverted →
stable; makeCanvas or text reverted → still flaky. So the style's GPU canvas is the latent weakness and the kit change exposed it. Per
the brief the helper was made opt-in rather than forced; the style was not edited. Final kit: 3×40 shuffled renders stable
(`pass7-raw/40-bead-abacus.final-kit-stress.txt`) and the final deep self-check OK. Suggest the bead-abacus owner creates the
nameplate canvas with `newCanvas`/`willReadFrequently` and opts its captions into `screenCanvas({ willReadFrequently: true })`.

## Deleted (`pass7-raw/deleted-conflicted-copies.txt`)

- 41-sticky-notes/renders/checks/RUN (Ekello Harrid's conflicted copy 2026-11-13).txt — removed by the new check-frames itself.
- 27-circuit-board/_atlas/kit/{overlay,studio} (Ekello Harrid's conflicted copy 2026-11-13).js — generated _atlas junk (Dropbox raced a sync).
- 0 conflicted copies left in the pilot folder.

## Index / gallery

build-index: 51 entries (50 styles + neutral). build-gallery: 50 styles, 0 without MP4; gallery.html has 50 videos; contact sheet 50 tiles (6 × 9 grid).
