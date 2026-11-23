# Mosaic (`mosaic`)

**Look.** A Byzantine / Roman tesserae panel being made on an oak workbench: an 8 x 4.5 m bed of wet grey lime plaster
(16:9, so the finished panel fills the frame) in a dark wooden tray, a faint red-ochre underdrawing (sinopia) brushed onto
it, and ~3,500 hand-cut chips pressed in one after another: matte stone (outlines, belly, border), glossy smalti glass
(fish, fins, sea) and gold-leaf glass for the ground. Every chip is a slightly irregular extruded quad with a small bevel,
yawed along its row and set at a small random tilt (gold ~7 deg, stone ~2 deg). Neutral tone mapping keeps the palette as
designed; a warm high key gives short tile shadows; a travelling low point light makes the gold glint tile by tile. At
the end the plaster between the tiles darkens to grout in a left-to-right wipe. A dark caption chip with a gold rule
and a 3 x 3 tile icon sits top centre on the overlay (exact colours, Georgia serif).

**Signature mechanic.** Opus vermiculatum, planned in `tessera.js` (THREE-free):
- the picture is a priority list of regions (`inside(x, y)` in panel metres); the panel is rasterised once (cell = pitch / 8);
- one exact Euclidean distance transform (Felzenszwalb) from every label boundary gives d = distance to the nearest outline;
- rows are the iso-contours of d inside each region at (j + 0.5) x pitch (marching squares, chained into loops, oriented CCW),
  each resampled at ~pitch: one tile per sample, long axis along the tangent. Row 0 hugs the outline, row 1 hugs row 0...
  so the andamento follows the contour; the gold ground gets halo rows around the figure that meet rows following the border;
- tiles closer than 0.72 pitch to an earlier row's tile are dropped (medial cusps); holes get a smaller filler tile;
- an optional `outline` per region recolours row 0 dark (and moves it to the outline phase) only where `test(ctx)` says so
  (the demo: only where the fish meets the ground or the sea, via `ctx.near(ids, radius)`);
- set times per phase: `rows` = row j starts later than row j-1, each loop laid progressively from the point nearest the
  phase `anchor`; `radial` = time grows with distance from given regions (the gold ground ripples outward from the fish);
- tile i at t: hidden, then a 0.24 s drop (11 cm, a little spin and extra tilt) and a 6 mm press, then its precomputed REST
  matrix forever — once set it never moves (that is what keeps the MP4 small);
- SCORE from the same tile list: one `click` per 1/24 s bin of landings, gain ~ sqrt(count), pitch by the stone/glass/gold
  share, so the click density follows the laying; one `penScratch` per long sinopia line in its reveal window; six `chime`
  sparkles across the light sweep; a `rustle` for the grout wipe.

## Good for / avoid for
- Good for: "built piece by piece", craft and patience, history / antiquity / Byzantium / Rome, "many small parts make one
  picture", data -> image metaphors done by hand, emblem or logo reveals, slow satisfying build openers, a glinting gold finale.
- Avoid for: anything that must change after it is built (tiles never move once set), photographic or detailed subjects
  (a ~75 x 42 tile picture: bold flat shapes only), text in the picture, fast cuts, dark moods.

## Planner (`tessera.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `planMosaic(picture, { pitch, gap, seed, phases, setDur, sinopia, sweep, grout, binHz, tiltGold, tiltStone, minGap, fill })` | the plan: every tile's position, yaw, size, tilt, kind, colour, set time. ~0.5 s to build. |
| `phases: { name: { t0, t1, mode: "rows", rowDur, anchor, spread } \| { t0, t1, mode: "radial", from: [ids], gamma, along, spread } }` | timing per phase (a region's `phase`, its `outline.phase` for row 0). |
| `plan.stateAt(i, t)` | -1 hidden, 0..1 dropping/pressing, 1 set. |
| `plan.countSet(t)`, `plan.sinopiaReveal(t)`, `plan.sweepAt(t)` (`{ x, level, u }`), `plan.groutAt(t)` | for the picture. |
| `plan.events()`, `mosaicVoices(spec.sound)` | set / sketch / glint / grout events -> SCORE via kit `scoreFromEvents`. |
| `plan.stats`, `plan.sinopia`, `plan.loops` | counts by kind, underdrawing polylines (with reveal order), row loops. |
| `fishAndWaves({ width, height, pitch, border, palette, fish })` | the demo picture (fish, two wave bands, gold ground, red / dentil / ochre border); `fishBox`, `wave1`, `wave2`. |
| `edt`, `contours`, `inCircle`, `inPoly` | the building blocks for your own pictures. |

Writing a picture: list regions highest priority first (border, eye, small details, body parts, fins, sea, then a
catch-all ground); give each `kind` ("stone" / "glass" / "gold") and `color(ctx)` (ctx: x, y, row, k index along the row,
n, d, r seeded, filler, near). Colour by `row % 2` / `row % 3` for banding that follows the contour; by `k % 2` for a dentil.
Regions narrower than ~1 pitch give a single row (gill, eye ring); thinner than ~0.5 pitch disappear.

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `mosaicPanel(plan, { sweep: { height, z } })` | everything: bench, tray, bed, tiles, sweep light; `update(t)`. |
| `tiles(plan)` | Group of 9 InstancedMeshes (3 kinds x 3 cut variants); `userData.update(t)`. |
| `bed(plan)` | plaster plane; shader draws the sinopia on (baked mask R = ink, G = order) and the grout wipe; `userData.update(reveal, grout)`. |
| `sweepLight({ height, z })` | point light; `userData.update(plan.sweepAt(t))`. |
| `tray()`, `bench()`, `chipGeometry(seed)`, `sinopiaCanvas(plan)` | set pieces / parts. |
| `caption()` | overlay chip, `userData.show(text, alpha)`. |

## Sound palette
`click` per landing bin (stone low ~0.75, gold high ~1.5, glass slightly brighter); `penScratch` for the sinopia; `chime`
(sparkle) as the light sweeps the gold; `rustle` for grouting; a low warm `pad` bed (110 Hz, 650 Hz cutoff) and one
`whoosh` per camera move in the demo. All times from the plan / BEATS.

## Knobs (spec.js)
- `panel`: size, border rows, tray frame. `tile`: pitch (tile size), gap (grout share), thickness, protrude, bevel, cut
  jitter, tilt for gold / stone, variants. `set`: drop height, press depth, spin, duration.
- `tesserae`: every colour list. Materials `stone`, `glass`, `gold` (metalness 0.85 + a little warm emission so gold stays
  gold when it is not catching the light), `plaster`.
- `sweep`: colour, intensity, decay (height / z are best computed from the camera: see the demo's `SWEEP`). `grout.soft`.
- `sound`: click gain curve and pitches, sketch, glint, grout, bed.

## Known limits (seen while building the demo)
- The glint needs geometry: a point light only glints where it sits near the mirror ray of the camera. The demo computes the
  light's height from the rake camera so the specular band crosses the gold; from the near-top-down wide shot the same light
  shows almost nothing. Move the light (or add a second one) per shot.
- Contour rows have cusps on the medial axis and small leftover holes; fillers plug most, a few grout gaps stay (real
  mosaics fill those with cut pieces; here they read as slightly loose setting).
- Thin internal boundaries (stripe / back / belly) each get their own rows, so internal shapes read as parallel bands
  rather than one outlined shape; colour row 0 deliberately if that matters.
- At ~20 px per tile in the wide shot the picture is a ~75 x 42 tile image: bold, flat subjects only.
- The plan builds on the CPU at load (~0.5 s, 3.5k tiles); far more tiles would also cost size — keep 2.5k–4k.
- The caption chip sits over the top border in the wide shot.
- Audio levels were measured, not listened to.
