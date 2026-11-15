# Cardboard Stop-Motion (`cardboard-stop-motion`)

A hand-built set made of corrugated cardboard on a wooden workbench under a warm clamp lamp. The faces are brown kraft, or white-top
board for signs, with fibre mottling and faint flute show-through. Every cut edge shows the corrugation: two liners, a wavy medium and
dark cavities. Outlines are slightly wonky, as if cut by hand with a knife. Details and lettering are drawn in marker (stroke-font
letters, hatched colour fills, wobbly outlines, all multiplied into the board). Joints are brass split pins, and masking tape holds
things down. **Signature mechanic:** the whole picture is evaluated at *pose time* `tq = floor(t·10)/10`, which gives 10 poses/s,
each held for exactly 3 frames (**on threes**). That covers object motion, the camera, the lamp flicker and the grain. Each pose
adds a seeded hash(pose index) jitter in position and rotation, and the lamp level wobbles a few percent per pose. Puppets move only
by rotating parts about split pins. Pieces slide in whole steps, stand up on tabs, tip back flat, and get swapped for a different
cut-out (replacement animation). Lettering writes itself on stroke by stroke.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/28-cardboard-stop-motion/` ("How to plant a seed", five steps).

**How it differs from its neighbours:** soft-clay also poses on twos, but its camera glides smoothly and its forms squash and
morph. Here everything steps, including the camera, and changes come from rotating, sliding and swapping rigid pieces.
paper-pop-up and origami are thin printed paper that hinges or folds. felt-stitch is fuzzy fabric with sewn thread.

**Good for:** stories, how-to steps, playful explanations, kids/education, "made by hand" brand stories, anything that should feel
homemade and cheap-on-purpose.
**Avoid for:** precise data or charts, sleek or premium tech, serious or sombre topics, long text (more than about 3 words per card),
fast smooth motion (by design nothing is smooth).

## Planner (`poses.js`, THREE-free, `style.plan`; scene.config.js imports it for SCORE)
`poseIndex(t)`, `poseTime(t)`, `poseCeil(t)`, `posed(t) → { i, tq }`, `poseTimes(t0, t1)` (pose-change instants, used for taps) ·
`jitter(i, seed, k)`, `camJitter(i)`, `flicker(i)`, `jitterK(tq, windows)` (full jitter while moving, `restJitter` otherwise) ·
`prog`, `move`, `keyed(tq, [[t, value, ease]...])`, `standUp` (with a one-pose overshoot), `tipBack`, `walk` (legs alternate every
pose) · `swapIndex(tq, start, n, hold)` / `swapTimes` (replacement animation) · `strokeCount`, `writePlan(text, start)`, `inked(tq, plan)`,
`writeSounds(plan)` (one marker squeak per pose that adds ink).

## Props (`style.props`, seeded and synchronous; cut-outs face +Z)
| factory | what it makes |
|---|---|
| `cutout(outline, { thickness, seed, wonk, face:"kraft"\|"whiteTop", draw(h), holes })` | corrugated sheet cut from any 2D outline: hand-cut wobble, fluted cut edge, kraft back. `draw(h)` = marker on the face |
| `doodle({ w, h, draw, face })` | rectangular drawn card (bottom-centre) |
| `box({ w, h, d, draw:{front, side}, tapeTop })` | closed corrugated box: 4 walls + 2 top flaps, a taped seam, fluted edges at every corner |
| `sign({ w, h, tab, face, draw })` | card on a tab (hide the tab in a box/slot). `setStand(u)` 0 = flat backwards, 1 = up. `write(text, strokes, { cx, cy, cap })` writes marker lettering (redraws only when the stroke count changes) |
| `splitPin({ r })` | brass dome head |
| `jointArm({ lengths, widths, draw })` | chain of strips on split pins; `userData.joints[]`, `userData.tip` |
| `puppet({ seed })` | 2.3 m jointed gardener (hat, overalls); `userData.joints` {neck, shoulderL/R, elbowL/R, hipL/R}, `setPose({...})`, `handR/handL` attach points |
| `wheel({ r, teeth, depth, color, draw })` | toothed cardboard gear or wheel (`teeth: 0` = round) on a centre pin; `setAngle(a)` |
| `arrow({ len, w, head, color })` | cardboard arrow cut-out pointing +X |
| `tape({ l, w, seed })` | masking-tape strip with torn zigzag ends |
| `tapeRoll()` · `markerPen({ color })` · `stick({ len })` | bench dressing: tape roll, felt-tip marker, wooden skewer (for sun-on-a-stick rigs) |
| `swapper(pieces)` | replacement holder; `show(i)` (−1 = none) |
| `bench()` · `backdrop({ w, h, draw })` · `lamp()` · `label(text)` | workbench top, taped kraft backdrop, clamp lamp (bulb follows the flicker), quick white-top label |

Marker helper `h` (inside `draw`, face metres, y up): `line(pts, color, w, { closed, frac })`, `dot`, `hatch(poly, color, { gap, angle, wash })`,
`text(str, cx, cy, cap, { progress })` (kit stroke font), `arrow(pts)`. Outline helpers: `style.shapes.{roundRectPts, circlePts, ellipsePts, gearPts, wonky}`,
`style.helpers.strokeOutline` (cut a stem or handle around a polyline).

## Recipe (per frame)
```js
const { i, tq } = style.plan.posed(t);
style.stepLights(i, level);                 // lamp flicker per pose (level: e.g. brighten when the sun comes up)
// ...set every piece from tq (positions SET, never +=), then style.jiggle(obj, i, seed, plan.jitterK(tq, windows))
style.stepCamera(rig, tq, i);               // stepped camera + per-pose jitter
stage.render(tq);                           // grain also holds per pose
```
Sound: taps = `plan.poseTimes(...)` over every moving window (union, one `tick` per pose), squeaks = `plan.writeSounds(plan)` (`penScratch`),
pops = `plan.swapTimes(...)`. Always `jiggle` after setting the base pose, since jiggle adds to it.

## Default sound palette
Cardboard tap = quiet low-pitched `tick` on every pose change of anything moving (the animator's hand). Flap (stand up, swap a strip)
= `thud` (pitch 1.7) plus low `paper`. Marker = short high `penScratch` per pose of ink. Dirt = dense low `rustle` plus `thud`. Drops =
`bubble`. Replacement stages = rising `pop`s. Reveal = `chime` plus `sparkle`, cheer = `blip` arpeggio. Bed = warm `pad` (A, add9,
brightness 820 Hz, gain ≈ .85 for a ≈ −21 dB mean) plus a faint `hum` from the practical lamp.

## Tuning knobs (`spec.pose`, `spec.board`, `spec.marker`, `spec.lettering`, `spec.tuning`)
`pose.fps` (10 = threes; 15 = twos; 30 = off), `pose.jitter.pos/rot`, `pose.restJitter`, `pose.camJitter`, `pose.flicker` ·
`board.thickness` (0.07: about 12× real so the flutes read), `flutePitch`, `wonk.amp/freq/kink`, `showThrough`, `pxPerMetre` ·
`marker.width/bleed/wobble/hatch` · `lettering.cap/strokeDur` · `tuning.standDur/tipDur/swapHold/walkSwing`. Look: lamp light
`intensity` and colour, `world.exposure`, `post.vignette`.

## Known limitations
- The fluted edge only reads where an edge faces the camera at ≥ ~15°: box corners and tops, sign sides, the soil-strip top. Straight-on
  cut-outs show almost none. Keep the camera a little high and off-axis (the demo uses about 7° yaw and 7° pitch). Edge UVs use three's
  side-wall mapping (u = x or y in metres), so the wave restarts with a small jump where an outline turns past 45°.
- Marker colours are multiplied into kraft, so blues and greens go dark and muddy (realistic, but use the bright palette values). Text
  is legible only on white-top board.
- The whole image is warm and brown by design. With neutral tone mapping and a saturated warm lamp it drifts orange; keep the lamp
  colour pale.
- Lettering is the kit stroke font: uppercase only, monoline. The badge digit is drawn statically with the card.
- Watering-can drops and the seed are world objects placed by closed form (drops from `worldPoint(spoutTip)`). They don't collide
  with anything, so keep them in front of or behind the strip deliberately.
- The puppet's right arm is driven by a 2-link IK in the demo scene. That IK lives in the scene, not the style (a promotion candidate).
- Per-piece printed canvases: about 40 canvases of up to 2048 px are built at load (~1 s). Signs redraw only when their ink count changes.
