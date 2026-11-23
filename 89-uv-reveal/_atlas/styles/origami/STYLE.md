# Origami (`origami`)

Japanese paper folding on a calm light-oak writing desk in soft window light from the front-left. Every object is
one square sheet of two-sided paper (a colour or white front, a white or faintly warmer back) folded **on screen**
into crisp faceted models. Each facet is a thin slab with kozo fibre strands (colour + bump), a seeded sheen gradient
and a light core edge. Stacked layers sit one paper pitch apart and every crease gets a rounded bend strip. Creases
read by SHADING: each fold presses a soft groove into the sheet (a bump that the key light rakes), with only a faint
darkening, no drawn outline. Standing models get a soft contact shadow on the desk. A dashed crease guide (valley =
dashes, mountain = dash-dot) draws on before each fold. Labels are ink-printed washi strips with a vermilion seal on
the overlay. Demo: `Builder/HyperFrames/3d-style-atlas-pilot/14-origami/` (a sheet folds into a standing swan, a
second into a heart that then stands up on its point).

**Good for:** "same thing, new shape" stories (fine-tuning, refactoring, transformation), step-by-step processes,
calm education and brand explainers, before/after.
**Avoid for:** dense data or many objects (one or two models per shot), curved or organic shapes, fast cuts, and
models that need squash, sink or reverse folds (not rigid, so the engine can't do them).

## Fold engine (`folds.js`, pure and Node-safe; also `style.motion` / `style.plan`)
- `buildFolds(def, { thickness, pitch, seed, imperfect }) → plan`: splits facets through the layers (or only the
  layers that pass a `filter`), rotates each step by its final angle, and stores every axis in a stationary anchor
  facet's frame so later creases ride on earlier folds. It also auto-lifts layers: a flat fold lands one pitch
  above the stack it covers, and an open fold pivots on the moving stack's outer surface.
- Step kinds: geometric `{ axis:[A,B], side:P, toward:N, angle, filter?, crease?, exact? }`, flat
  `{ line:[[x,z],[x,z]], side:[x,z], kind:"valley"|"mountain", angle }`, and turn `{ all:true, axis|axisFrom, axisMid?, angle (signed), hop? }`.
- `pose(plan, theta[], hop[])`, `stripPoints(...)`, `foldTimeline(plan, cues) → { at(t), events, cueOf }`.
  Cues `{ at, dur, ease?, keys:[{at,dur,to}], flap:{from,period,amp} }`. `sequence(ids, {...})` builds cues one after another.
  `checkLayers(plan, theta)` checks the gaps between parallel overlapping layers.
- SCORE: `scoreFromEvents(timeline.events, voices)`. The event kinds are `fold`, `crease`, `turn` and `refold`.
- **Model library** (`MODELS` / `model(name, opts)`): `sheet`, `card` (fold in half, any angle), `blintz`, `fortune`
  (blintz, turn over, blintz), `accordion` (fan of alternating pleats), `dart` (turn over, crease, corners and edges to
  centre, fold in half, stand on the keel, wings; `tune:true` adds winglets), `glider` (delta "bird" from a diamond; flap it with a `flap` cue),
  **`swan`** (kite, turn over, narrow kite, fold in half, neck up, head, tail up, stand on the belly: 10 steps; opts
  `neckAt, neckLean, headLen, headDrop, tail, tailAt`; beak toward model -z, so yaw it ±90° to show its side), **`heart`**
  (top corner to centre, bottom to the top edge, sides up, turn over, blunt tops and side points, turn back: 9 steps,
  all flat; top toward model -z; start the sheet colour-down, i.e. `front` = white, `back` = the heart colour).
  The swan's neck/head/tail are flat folds through the whole stack: the same silhouette as the inside-reverse folds a
  folder would use, but rigid. Verified with `checkLayers` (min gap 3.3 mm swan, 4.5 mm heart, at pitch 4.2 mm).

## Props (`style.props`)
| factory | what it makes |
|---|---|
| `foldModel({ model, modelOpts, def?, front, back, pattern?, wipeAxis?, seed, cues?, guides=true })` | the folding model: a group in the model frame. `userData.update(t)`, `setPose(state)`, `setWipe(u)` (pattern wipes across the sheet), `setCues`, `plan` |
| `sheet({ size, front, back, pattern })` | a plain flat sheet |
| `sheetStack({ count, size, presets, seed })` | loose chiyogami sheets, seeded skew. `userData.sheets` (top last, each has `userData.home`) |
| `table({ size })` / `desk(...)` | calm light-oak veneer desk at y = 0: fine irregular straight grain, no plank seams, low contrast, roughness map (`spec.textures.desk`) |
| `contact(model, { opacity, pad, reach, stand, nearShare })` | soft contact shadow fitted (in the model's yaw frame) under the paper that touches the desk; add to the scene and call `userData.update()` after posing/moving the model each frame. Only on while the model STANDS (tall, few corners on the desk); flat sheets get contact from the shadow map |
| `windowShade()` | invisible shoji lattice that casts window-bar shadows (`spec.window.enabled`, off by default) |
| `tag(text, { kicker, seal })` | overlay washi strip. Origin at the left edge. `userData.setReveal(u)` unrolls it. Pin height = unit × `userData.units` |
`helpers`: `paperSet` (two-sided patched materials), `chiyogamiCanvas({ pattern: seigaiha|shippo|kanoko|asanoha })`, `patternTexture`, `creaseTexture`.
Palette names usable as `front`/`back`: `kami` (blue), `washi` (white), `kinari` (warmer unbleached white: a white sheet's
second side), `vermilion`, `gold`, `cream`, `indigo`, `sakura`, `matcha`, or any hex.

## Sound palette
One `paper` (`fold:true`, dur ≈ fold dur, so the thump lands on the landing) plus a dry `click` for every fold step.
A crease step gets `paper` plus `rustle`. A turn gets `rustle` plus a low `whoosh`. Slides get a soft `whoosh` (dir in)
plus `rustle`. The bed is two quiet open-fifth `pad`s (`brightness` 1500 / 2600 **Hz**), which lands the mix at about −24 dB.

## Tuning knobs
`paper.thickness/pitch` (layer air gap), `paper.imperfect` (spring-back of flat folds and spread of open folds, in degrees),
`paper.sheen`, `paper.fibre` (strands, length, darkShare, cloud, grain), `paper.bump.strength`,
`paper.crease.{groove,depth}` (the shaded groove: width in m, bump depth) and `{width,dark}` (faint pressed line),
`paper.bendSegments`, `chiyogami.*.tiles` (pattern scale), `guide.*`, `tuning.{foldDur,pairLag,wipeSoft,stackPitch}`,
`textures.desk`, `contact`, `window`, key-light position and `shadow.softness`, `world.exposure`.

## Known limitations
- Only rigid folds. Squash, petal, sink and true reverse folds are out of reach, so there is no crane, boat (the
  hat-to-boat step is a squash) or box. Reverse-fold silhouettes can be faked honestly with a flat fold of the whole
  stack (the swan's neck/head/tail), but the layers then sit outside instead of tucked inside. A fold is valid only if
  it would be valid on real paper: the author picks filters so that connected layers move together.
- Standing models (swan, dart) are two-layer silhouettes: they read side-on; keep the camera within ~40° of their side.
- `axisFrom` rides on the anchor facet of the named step. If a LATER step moves that facet (the swan's neck moves the
  "half" anchor), the turn axis is wrong; give an explicit `axis` instead.
- The fibre and crease grooves are fine detail: at CRF 22 the encoder flattens most of the fibre; the demo renders at CRF 19.
- Step axes are written in the current folded frame (model coordinates). Authoring a new model means working out
  where the layers sit, so check it with `checkLayers` and a contact sheet.
- Bend strips follow their stationary partner. If a later step moves only one side of an earlier crease, the strip
  separates from that side.
- A turn-over of a big sheet hops high (half the sheet width) and fills the frame for about 0.3 s.
- The contact shadow is a soft rounded rectangle fitted to a bbox, not the true footprint (fine for a belly line or a
  point; it would over-darken an L-shaped footprint, which is why it switches off for lying-flat paper).
- Flat folds with spring-back raise later layers by a few millimetres. That reads as paper, but stacks grow about 30 % thicker than ideal.
- The label font is Hiragino Mincho (macOS system font), so other machines fall back to Georgia.
