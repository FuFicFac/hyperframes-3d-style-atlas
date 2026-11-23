# Tessellation Morph (`tessellation-morph`)

**Look.** A wall of interlocking cut-paper / painted tiles in two strongly contrasting colours (cream, raised 24 cm; navy,
13 cm), every tile the same creature. Each tile is a real 3D slab: an inset top face, a 4.5 cm chamfer, side walls down to
the wall, a faint even paper fibre multiplied over the vertex colour, and a raking warm key from the upper left so every
cream tile throws a short shadow onto its navy neighbours. Eyes, a gill or wing lines and a coral beak are painted on
(ink is the opposite colour of its tile) and only appear near a key shape. Behind the tiles is a coral backing that shows
only when a tile leaves the wall. Neutral tone mapping keeps the palette as designed; a light vignette, no bloom, no grain.
A navy caption plate (overlay, exact colours) carries the label and a morph slider whose three ticks are tiny silhouettes
of the key shapes (square, fish, bird) drawn from the real key outlines.

**Signature mechanic.** A lattice cell is a parallelogram; its four sides are two PAIRS, and each pair is ONE curve shared
by the two neighbouring tiles (edge a, and its copy shifted by b; edge b, and its copy shifted by a). Whatever a curve
pushes out of one side is cut from the opposite side, so the wall is gap-free and overlap-free for any (non-crossing)
curve. A key shape is just two curves (7 control points each, Catmull-Rom with optional sharp corners); a morph
interpolates them point by point. Because every edge is shared, each EDGE takes its own morph value from a field
m(x, y, t) at its midpoint — so a left-to-right gradient (square -> fish -> bird across one wall) is still gap-free.
Tiles can leave the wall: lift straight out, fold along the body chord (tail corner -> nose) so the two halves flap like
wings, then fly forward (closed-form pose), leaving a coral hole in exactly their shape.

## Good for / avoid for
- Good for: "smooth interpolation between ideas" (latent space, embeddings, morphing, style transfer, evolution, A -> B
  transitions), pattern/tiling explainers, symmetry and lattices, "one becomes many" / "one breaks free" title cards.
- Avoid for: anything needing many different shapes at once (every tile is the same creature), photographic looks,
  text-heavy content, organic shapes that cannot be drawn as two edge curves.

## Planner (`tiling.js`, Node-safe; `style.plan` / `style.motion`)
- `makeTiling({ a, b, keys, per })` -> `{ n, edge(kind, m, out, ...), outline(m), validate(step) }`. `validate` checks every
  sampled m gives a simple polygon of the cell's area AND that the body chord splits it into two simple halves (the fold).
- `makeField({ start, stages })` -> `m(x, y, t)`: stages blend toward a number or a gradient `{ stops, slide }`; `sweep`
  delays a stage along a direction so a change rolls across the wall.
- `planWall({ tiling, size, bounds, field, press, taps, heights, flight, binHz, duration })` -> `{ tiles, edges, frame(t)
  (edge points, per-tile m, per-tile dip/raise), ring(tile, pts, out), poseAt(tile, t), events(view), field, stats }`.
  `press` = ripples (negative depth = a raise wave); `tap: true` stages make each tile dip and click home.
- `detailWeight(k, m, { lo, hi })`, `tilingVoices(spec.sound)` (for `kit/schedule.scoreFromEvents`), `polygonCheck`, `sampleEdge`.

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `wall(plan)` | Group: one dynamic tile mesh (per tile 5 x 96 vertices: inset top split on the body chord and ear-clipped, chamfer, side wall; flown tiles folded + transformed), one ink mesh (eyes, strokes, beak scaled by `detailWeight`), coral backing. `userData.update(t)` rewrites every vertex from `plan.frame(t)` / `plan.poseAt`. |
| `caption()` | overlay plate, `userData.show(text, alpha, { m0, m1 }, textAlpha)`: knob when m0 = m1, gradient span otherwise. |
| `style.makeTiling()` | the spec's tiling (same as scene.config.js builds in Node). |

## Sound palette
One `click` per 1/16 s bin of tile dips (press wave, each tile clicking home at a key; gain ~ sqrt(count), pitch rises for
"home" clicks), a `whoosh` per morph stage (pitch rises with the target key) and for the slide, a `pop` + `paper` rustle
per bird lift-off, a soft `paper` flutter per wing down-stroke, one `chime` when the first bird leaves; warm `pad` bed
(D3, 850 Hz cutoff). All cue times come from `plan.events()`.

## Knobs (spec.js)
`palette` (cream / navy / coral), `tiling.keys` (edge control points + details per key), `tiling.size` (m per cell),
`tiling.detail` (when marks appear), `tile.heights`, `bevelW/bevelH`, `tint`, `chamferShade/sideShade`, `miterMax`,
`chordInset`, `tap`, `caption` (plate size, slider layout), `sound`.

## Known limits (seen while building the demo)
- The bird is chunky (dove-like) and the fish tail is spiky: two curves per key with 7 points is a tight budget. New key
  shapes must pass `tiling.validate()` (and look right); curves that cross their partner break the tiling.
- Only one lattice (diamond, a = [.5,-.5], b = [.5,.5]) was exercised; the code is general but the fold assumes the chord
  K -> K+a+b is the body line.
- A frontal camera hides the 3D: keep the camera 10–25 deg oblique, or the bevels and steps flatten out. The opening
  raise wave reads in motion but only faintly in a still.
- The top face is re-triangulated (earcut) every frame; ~410 tiles x 96 points is fine, thousands would not be.
- Detail marks only fit key shapes; between keys they shrink away (by design), so mid-morph tiles are blank.
- Not watched in motion at full speed by the author; audio measured, not listened to.
