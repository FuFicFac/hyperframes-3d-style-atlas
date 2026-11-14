# Toy Brick (`toy-brick`)

A build made of **generic** interlocking plastic bricks (plain studs, no brand marks, our own peg-figure), shot like toy-photography
macro on a pale studio table. Bricks, plates, slopes, arches, 1×1 rounds, tiles and tinted transparent pieces sit on a strict stud
grid (pitch P = 0.1 m; brick 1.2 P, plate 0.4 P, stud Ø 0.6 P × 0.2 P) with rounded bevels and a hairline seam gap so every piece
reads. Glossy ABS: physical clearcoat, object-space roughness blotches + micro-scratches, warm sheen on light colours, crisp soft-box
reflections from a procedural studio (kit `studio.js`). Neutral tone mapping, BokehPass DoF + light tilt-shift aimed at the active
part. Labels are overlay "stickers" (white card + stud badge, heavy rounded caps). Demo: `Builder/HyperFrames/3d-style-atlas-pilot/16-toy-brick/`.

**Good for:** anything explained as *assembly* — stacks, layers, pipelines, architectures (LLMs, networks, software stacks),
"building blocks of X", modular systems, step-by-step builds and teardowns, playful kids/edtech explainers.
**Avoid for:** organic or soft subjects, precise charts, serious/sombre topics, long copy, photoreal products.
Not voxel: voxel = same-size matte cubes as pixel art; this = varied glossy moulded parts that snap together.

## Props (`style.props`; synchronous, seeded)
| factory | returns / hooks |
|---|---|
| `part({ type, size:[sx,sz], color, dir?, h?, trans?, glow?, arches? })` | Mesh, origin = footprint centre, base. types `brick plate tile slope round roundPlate arch trans`; slope `dir` = descends toward `+x -x +z -z`; geometry cached per shape |
| `baseplate({ w=24, d=16, thickness=.3, color, center })` | slab + **instanced** studs; `userData.grid = { toWorld(gx, plates, gz), top, studTop, P, PH }` |
| `build(layout, { grid, plan? , ...planBuild opts })` | Group; `userData.plan` (parts + events), `update(t)` (closed-form poses), `focus(t)` → world point of the active part |
| `pegFigure({ body, head, height=2.6 })` | turned body, round head, two dot eyes; plugs over a stud; `userData.look(yaw, pitch)` |
| `printedTile({ size, color, text, ink })` | tile with flat printed text on top (in-world) |
| `pile({ grid, center:[gx,gz], radius, parts, seed })` | loose pieces resting on stud tops, some tipped over, non-overlapping |
| `table({ width, depth, height, radius })` | pale satin sweep · `contactShadow(o)` kit blob |
| `sticker(text, { color, align })` | overlay sticker; `userData.set(age, hide)` slaps on/peels off; pin with `helpers.pin(obj, { x, y \| world, height })` |

`style.render(t, { focus })` sets DoF distance + tilt-shift band on `focus`, then renders. `helpers`: `color(c)` (cached ABS material),
`transMaterial(c, { glow })`, `pin`, `geometry(type, size, o)`. Factories: `baseplate`, `table`, `part`, `pegFigure`, `printedTile`.

## Build planner (`bricks.js` = `style.plan`; Node-safe, also imported by scene.config.js)
- Layout = objects or compact strings `"brick 2x4 red @3,4 ^0 [+x] [t=1.2] [trans]"` (x/z in studs, `^` level in plates).
- `planBuild(layout, { start, step, dur, order:"bottomUp"|"given", mode:"drop"|"fly", from, hover, press, stepped })` → `{ parts, events, end }`;
  events `snap` (the click), `lift` (fly start), `unsnap`. SCORE = `kit/schedule.scoreFromEvents(plan.events, voices)`.
- `brickPose(part, t)`: drop = fall (outCubic) → hover → press (inQuad) → land + 6 % squash wobble; fly = waits visible at its pile
  pose, arcs over, turns upright, presses; `out` = pop off the studs, rise, shrink. `stepped: 15` = brickfilm on twos.
- `unbuild(plan, { start, step })` (top-down), `studSteps(t, start, n)` whole-stud slides, `activePart(plan, t)`,
  `validateLayout(parts)` → `{ overlaps, floating }` (assert it — the demo is `{[],[]}`).

## Signature motion
Things are built bottom-up, back-to-front: each part drops in, slows like a hand, presses onto the studs with a squash and a click;
repeats accelerate. Tokens hop from a loose pile. Camera: low macro three-quarter, slow arc, rising with the build, pull-back reveal.

## Sound palette
snap = `click` (bright) + `clack` (body, pitch/gain by part area) + short `thud` for big parts, `chime` sparkle on trans;
lift = 3-tick rattle; stickers `pop`; counter `blip`; payoff `chime`; bed `pad` C add6 → F/C, brightness 1300/1700 **Hz**, gain .55 (mean −24 dB).

## Tuning knobs (`spec.js`)
`brick` (pitch, plate, studR/H, gap .014 P, topGap, bevel .06 P, arch pillar/rise, slopeLip) · `plastic` (roughVar, scratch*, bump*,
sheen + warmEmissive on light colours) · `trans` (transmission, attenuationDistance, glow) · `studio` panels (frontKey softbox carries
the face reflections) · `dof` (aperture .006, maxblur .011) · `post.tiltShift` · `ui` (sticker look).

## Known limitations
- Flat faces show soft-box reflections only near grazing; the gloss reads mostly on bevels, studs and rounds. Shadows are subtle
  (bright env irradiance); add `contactShadow` blobs under heavy footprints.
- Occupancy/validation uses bounding boxes (slope/arch voids count as filled). Bottoms are closed (no tubes) — don't show undersides.
- Trans pieces use the transmission pass (fine at demo scale; dozens get expensive). Strong attenuation turns orange tints brown.
- Kit `createTextLabel.setText` with a different-size string was seek-order dependent in check-frames (pixel diff confined to the
  label); use one sticker per value (demo counter) rather than `setText`. The kit's `fonts.ready` callback also redraws the ORIGINAL text.
- DoF is a post BokehPass: overlay stickers are unaffected, but very near foreground pieces smear rather than bokeh.
- File size: 15 s at CRF 22 = 5.4 MB; the dense stud field under a moving camera is the cost driver.
