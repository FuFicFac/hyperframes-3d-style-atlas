# Hanging Mobile (`hanging-mobile`)

A kinetic hanging mobile in a bright, skylit white gallery. Thin black wire arms end in small loops. Fine dark threads hang from
them, and on the threads hang flat painted sheet-metal plates (disc, leaf, crescent, triangle, kidney, custom outlines) in bold red,
yellow, blue, black and white. Everything turns slowly in still air. A high front-left key light throws crisp, soft shadows of every
wire, thread and plate down and to the right onto the white wall, and those shadows are part of the picture.
Small engraved aluminium tags hang under the plates. A museum wall-label card (on the overlay) carries the words.

**Signature mechanic: the balance is computed for real.** The mobile is a tree of arms. Each plate's weight is its area (shoelace
over its outline) × sheet density × scale². Each arm's pivot is *solved*: p* = Σwx / Σw, with the wire's own mass included. The pivot
loop sits `h` above the wire (a stirrup), so an unbalanced arm comes to rest at tan θ* = gain·(p − p*)/h. Hanging a plate, removing one
or changing a weight changes θ* for that arm **and for every arm above it**. Each arm swings to its new rest angle as a closed-form
damped step (superposed over every change instant, never simulated). A *re-balance* slides the pivot loop along the wire to the new
centre, so the arm swings back to level, deepest arm first. Each arm also turns slowly about its own thread, the plates turn too,
and the threads lean a little behind fast swings.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/36-hanging-mobile/` ("Add one thing and everything shifts", five beats).

**How it differs from its neighbours:** paper-pop-up is printed card hinging up from a book. Here nothing folds: rigid plates hang
and swing in air, and the motion comes from torque. spotlight-stage is a dark theatre with painted flats. This is a bright white
room where the shadows on the wall do half the drawing. low-poly is a faceted terrain world. marble-run is also physics-flavoured,
but it is a precomputed rolling schedule. Here the physics is a statics solve plus linear damped swings.

**Good for:** trade-offs and balance, priorities and weighting, portfolios and allocation (as shapes, not numbers),
"add one thing and everything shifts", hierarchies and org structures (the tree *is* the hierarchy), calm openers and section breaks,
art or design topics.
**Avoid for:** exact quantities and charts (the tilt is a picture of imbalance, not a gauge), long text, step-by-step processes,
fast or energetic pacing (it is calm by nature), dark or night moods.

## Planner (`balance.js`, THREE-free, `style.motion`; scene.config.js imports it for SCORE and camera targets)
- `shapeOutline(shape)` / `shapeInfo(shape, { density, inset })`: the outline, area, centroid, and the outline turned so the centroid
  hangs plumb under the hang hole, as a real plate does. The tag hole is on the plumb line at the plate's bottom edge.
- `planMobile(rootArm, events, knobs)` → `plan` (or `mobilePlan(STYLE_SPEC, rootArm, events, extra)` to merge the spec's `balance` knobs).
  - Arm `{ id, len, h?, pivot?: "solve"|0..1, yaw?: { base, rate, swing, period, phase }, period?, zeta?, loads: [Load] }`
  - Load `{ id?, at: 0..1 along the wire, drop: thread m, shape | arm }`
  - Shape `{ id, kind: disc|leaf|petal|crescent|triangle|kidney|custom, color: red|yellow|blue|black|white, tag?, inlay?: { r, color },
    yaw?, scale?, rot?, hole?, gauge?, ...dims }`. Dims: disc `r`; leaf `len, w, belly, bend`; crescent `r, cut, shift`; triangle
    `w, h, skew, round`; kidney `r, dent`; custom `pts`.
  - Events: `hang { arm, load, dur }` (spools out, and the weight lands at the end), `remove { shape|arm, dur }`,
    `weight { shape, scale, dur, ease }`, `rebalance { arm, dur, ease }`. Each of hang, remove and weight also accepts
    `rebalance: true | { delay, dur, stagger }`, which adds rebalances for that arm and its ancestors, deepest first.
  - Samplers: `armAt(id, t)` → `{ p, pStar, target, tilt, dtilt, yaw, weight }`, `loadAt`, `shapeAt`, `pose(t)` (world points with the
    root pivot at the origin, mirroring style.js's hierarchy), `bounds(t0, t1, dt)` (framing), `weightOf`, `balancePoint`.
  - `plan.events` (after `finalize(duration)`, or `knobs.duration`): `spool`, `hook`, `lift`, `grow`, `slide`, `swing` (each swing
    extreme above `swingSound.min`), `settle`.
- `mobileVoices(spec.sound)` + `mobileBed(duration, spec.sound)` → SCORE via `kit/schedule.scoreFromEvents`.

## Props (`style.props`, seeded and synchronous)
| factory | what it makes |
|---|---|
| `mobile(plan, { tags })` | the whole mobile, origin = root pivot loop. `userData.update(t)` sets every pivot slide, tilt, yaw, thread length, lean, plate scale and visibility. `userData.world(id, local)` → world point (matrices refreshed first). `userData.arms / shapes / loads` |
| `hook()` | ceiling rose + open steel hook (the top thread hangs from y = 0) |
| `thread({ length, r })` | thread hanging down from its origin, `userData.setLength(L)` |
| `arm({ len, h, loads })` | static wire arm: bowed wire, curled end loops, clip loops at `loads`, stirrup and pivot loop. Returns `{ group, yaw, tilt, bar }` |
| `plate(shape, { color })` | sheet-metal plate in the hang frame (hole at the origin): painted faces, raw edge, wire ring through the hole, optional `inlay` disc |
| `tag(text)` | engraved aluminium tag on a short thread, readable from both sides |
| `wireLoop(r, tube)` | small wire ring |
| `gallery({ wallZ, ceilingY, ... })` | white plaster wall, polished concrete floor, dark shadow-gap reveal, ceiling with an emissive skylight panel |
| `wallLabel(stage, beats, look)` | **the label system**: a museum wall-label card on the overlay (white card, coloured square, one line), one beat at a time, the last one held to the end. `userData.update(t)` |

Factories for OBJECTS: `gallery`, `hook`. Helpers: `setShadowQuality(q)`, `paint(colorName)`, `shapeInfo`, `shapeOutline`.

## Recipe
```js
const plan = planMobile(MOBILE, EVENTS, { ...STYLE_SPEC.balance, density: STYLE_SPEC.sheet.density, duration: DURATION }); // scene.config.js
const mobile = style.props.mobile(plan); mobile.position.set(...ROOT); scene.add(mobile);
const label = style.props.wallLabel(stage, BEATS);           // BEATS carry `label`
renderAt(t) { mobile.userData.update(t); label.userData.update(t); rig.update(t); stage.render(t); }
SCORE = [...mobileBed(DURATION, S.sound), ...scoreFromEvents(plan.events, mobileVoices(S.sound))];
```
Centre the mobile with `plan.bounds(0, 0)` (at rest) and frame vertically with `plan.bounds(0, DURATION)` (the swept extent, which
includes tilts). Aim the camera at `plan.pose(t).arms[id].pivot` when an arm is the subject.

## Default sound palette
Bed: a slow `pad` (G, open add9 voicings, brightness 950 Hz, gain 0.95), which gives a ≈ −20 dB mean. Hang: a soft `whoosh` while the
thread spools out, then a high `click` (wire hook) and a two-note `chime` tink when it lands. Weight change: a `whir` gliding up by the
scale factor, then a low `thud`. Re-balance: a high `paper` scrape as the loop slides. Swing extremes: very quiet high `tick`s, scaled
by amplitude. Settled: a three-note `chime`.

## Tuning knobs
- `spec.balance`: `gain` (0.28; 1 = plain physics), `h` (stirrup height, so stiffness), `period` (2.0 s for a 1.5 m arm, scaled by √len),
  `zeta` (0.2), `lag` (thread lean), `maxTilt` (soft tanh limit), `steps` (stairs per ramp), and `hang/weight/rebalance` durations.
- `spec.shadows.quality`: `draft` | `good` | `best` (map size, PCF softness, frustum). This is the wall-shadow quality knob
  (`opts.shadowQuality` or `style.setShadowQuality`).
- Look: key light `position` (moves the shadows on the wall), `gallery.wallZ` (bigger = shadows further offset and larger),
  `world.exposure`, `wire.r`, `thread.r` (keep ≥ ~2 px at the shot distance), `sheet.thickness`, `colors`, `palette`, `label.*`.

## Known limitations
- **White plates nearly vanish against the white wall** (same paint, same light). Give a white plate an `inlay` (the demo's "NEW"
  disc has a black centre) or hang it where its own shadow sits behind it.
- Tilt is the plain stirrup statics scaled by `gain`. Swings are linear damped steps per arm. Arms do not feel each other's motion:
  a parent's swing does not excite its children beyond the small thread `lag` lean. Nothing collides, so plates on neighbouring
  arms can pass through each other if the yaws bring them together. Check the stills.
- Plates turn about their threads (yaw swing). When a plate passes edge-on it reads as a line for a moment, and tags turn with it.
  Anything that must be read goes on the wall label.
- Thread and wire shadows are thin and soften with the PCF kernel: at `draft` they break up. The swept extent of a big swing can push
  the top arm out of a close shot: frame the peak swing, not the rest pose (`plan.bounds` over the window).
- A newly hung plate appears at the loop and grows in as its thread spools out (there is no hand). Read it as "hung", not "dropped".
- The tags are drawn on a 2D canvas with the system Helvetica Neue, which is pixel-identical on this Mac only.
