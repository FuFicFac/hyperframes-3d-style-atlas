# Felt & Stitch (`felt-stitch`)

A handmade felt story board. Thick wool-felt cut-outs (matte, fibre-mottled, velvet sheen, a fuzzy halo at every
silhouette, rounded hand-cut edges) layered and appliquéd onto a teal felt backdrop with a plum border and a scalloped
ground strip, held down by **real raised embroidery stitches** (running, blanket, cross, satin, backstitch lettering)
in contrasting floss with dark puckers where the thread enters the felt. Stuffed puffy characters with blanket-stitched
seams, bead eyes, buttons, sequins, pom-poms, ric-rac. Objects move on twos; pieces flop down and peel up like fabric,
and things are *sewn on* stitch by stitch by a travelling needle. Demo: `Builder/HyperFrames/3d-style-atlas-pilot/15-felt-stitch/`.

**Good for:** friendly process/team explainers, step-by-step flows ("A hands off to B"), kids/education, cosy brand stories, labels of ≤ ~24 caps.
**Avoid for:** precise data/charts, technical or photoreal subjects, dark/serious moods, long or lowercase text, big camera moves (see limits).

## Files
`spec.js` (all numbers) · `style.js` (Three code) · `stitches.js` (**pure**, no THREE: stitch planners + fabric motion; `style.plan` =
`style.motion`; `scene.config.js` imports it so SFX ticks come from the same stitch plans).

## Props (`style.props`; XY plane facing +Z, back face on z = 0 unless noted, all seeded)
| factory | what it makes |
|---|---|
| `piece(shape\|pts, { color, thickness, seed, pinked, jitter, holes, fuzz })` | cut felt piece; `userData.top/outline/zAt` |
| `stuffed(shape\|pts, { color, puff, profile, seam:"blanket"\|"running", seamColor })` | puffed stuffed form (star-shaped outline); `userData.zAt(x,y)` |
| `stitchMesh(segs, { radius, color\|colors, zAt, z, arch, sink })` | raised thread from any plan; `setProgress(p)`, `headAt(p)`, `anchorAt(p)` |
| `embroidery(text, { cap, color, zAt })` · `feltLetters(text, { cap, color, colors })` | backstitch lettering · felt strip letters (stroke font) |
| `patch({ text, cap, w, h, color, thread, border, shape:"round"\|"banner"\|"rect", pinked })` | felt label/banner; `sew(pBorder, pText)` |
| `card({ w, h, color, text \| lines, pinked })` · `report({ w, h, title, accent })` · `rosette()` | task card · finished document · prize ribbon |
| `board({ w, h, frame, ground })` · `hoop({ r })` | backdrop with border + ground strip · felt in a wooden embroidery hoop |
| `character({ color, w, h, emblem, seamColor, cheeks })` · `emblem(kind)` | stuffed toy (pivot bottom centre) · clipboard/magnifier/pencil/tick/badge/star/heart |
| `button({ r, holes, thread })` · `bead()` · `sequin()` · `pomPom()` · `ricRac()` · `spark()` · `feltTick()` | details |
| `needle({ thread, length })` | `update({ tip, anchor, dip, visible })`, `dipAt(f)`; parent it to the stitch group it sews |
| `stitchedPath(pts, { color, z })` | dashed running-stitch route; `userData.path` for `plan.travel` |
| `hinged(content, { at:"top"\|"bottom"\|"left"\|"right", h, w })` | flop/peel pivot; `setAngle(a)` (a < 0 lifts toward camera) |

Also `style.felt(name)`, `style.addFuzz(mesh, colour)`, `style.outlineOf(shape)`, `factories.board/hoop`.

## Planner + motion (`style.plan`, pure)
Stitch plans: `runningStitch`, `backstitch`, `blanketStitch`, `crossStitch`, `satinFill`, `embroideredText`, `strokeOutline`, `keyed`, `smoothPath`.
Timing: `sewProgress(t, start, dur)`, `sewTimes(n, start, dur)`, `sewDur(n)`. Fabric motion: `onTwos`, `flop(t, start)`, `peel(t, start)`,
`hop(t, start)` → `{ y, scale }`, `wobble(t, a, b)`, `travel(t, start, dur, path)`, `sparks(t, start, o)`.

## Recipe
`tq = plan.onTwos(t)` for ALL object motion; hinge pieces with `hinged` and drive `flop`/`peel`; sew with `stitch.setProgress(sewProgress(tq,…))`
and drive a `needle` from `headAt/anchorAt`; unpick (progress 1 → 0) to tidy routes. Keep the camera **locked off** (see limits).

## Sound palette (kit voices)
Fabric **pat** = thud (pitch 1.5, 0.22 s) + dense low paper. **Thread pull** = short whoosh (pitch 2.6, q 3.2). One `tick` per stitch (thin to
≤ 11/s). Gentle low `pop`s for splits/sparks, `bubble` boing before a hop. Bed: warm `pad` (G, brightness 780 Hz, gain .22) + a `chime` music-box
arpeggio every 0.48 s (gain .065). `chime` + `sparkle` on a finished tick/banner. Demo mean −24.4 dB, peak −3.4 dBFS.

## Tuning knobs
`felt.fibre` (freq/stretch/bump/sharp), `felt.mottle`, `felt.fuzz` (shells, offset, density, face, rimPower), `felt.bevel`, `cutJitter`,
`stuffedPuff`; `thread.radius/arch/sink/twist/stripe/pucker/depthLift` and per-stitch lengths; `text.threadRatio/letterSpacing`;
`tuning.flop/hop/wobble/fps`. Look: key `shadow.softness`, `world.exposure`.

## Known limitations
- **Bitrate:** the fibre field covers the frame. A slowly swaying camera + grain gave 33 MB at CRF 22; locked-off camera, no grain: 8.6 MB.
  If you must move the camera, use `--crf 26` and check a crop.
- Fuzz shells are transparent: floss gets a depth-only lift (`thread.depthLift`) so shells never haze over it — a piece laid < 4 cm above a
  stitch would not hide it (keep layers ≥ 1 felt thickness apart).
- Stitches follow a `zAt(x, y)` height, not the true mesh: on a strongly domed stuffed body keep stitches away from the steep rim.
- `stuffed()` needs a star-shaped outline (rings scale toward the centroid). `feltLetters` overlap strokes per glyph (fuzz doubles at joins).
- Flops are rigid hinge rotations with a soft spring; felt does not bend. Mid-peel the reverse side shows squashed text for ~0.3 s.
- Felt surface/fuzz are `onBeforeCompile` patches: they will not survive GLTF/Blender export (rebuild as a noise bump + sheen + fuzz node).
- Lettering is the kit stroke font: uppercase, monoline; letters need cap ≥ 0.27 m at 13.5 m to read.
