# Clockwork (`clockwork`)

The inside of a fine mechanical movement, shot macro. Brushed brass wheels with true involute teeth and spoked hubs sit
on a dark anthracite plate with perlage. Gilt bridges carry Geneva stripes, polished bevels and engraved, ink-filled
lettering. Screws and the hairspring are heat-blued, and ruby jewels sit in polished gold chatons. There is a mainspring
barrel with its ratchet and click, a balance with timing screws and a breathing hairspring, an anchor escapement, and a
snail cam that drops a lever so a hammer strikes a bell. Light is a warm macro key plus a procedural studio for the
reflections, with shallow depth of field. **Signature mechanic: one oscillator paces everything.** The balance swings.
Each pass through centre is a beat: the anchor flips and the escape wheel steps half a tooth, with a small recoil. Every
other wheel's angle is the escape wheel's angle times its tooth ratio, so the whole train ticks together and neighbours
turn opposite ways. Captions sit on a small enamel plaque with a brass bezel; engraved bridge lettering names the parts.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/34-clockwork/`.

**Good for:** "how the parts drive each other", dependencies, cause-and-effect chains, timing and cadence (heartbeats,
clocks, schedulers, rate limits), ratios and gearing (leverage, scaling, "small input, big output" and the reverse),
systems where one small part paces the whole, "it all hinges on X".
**Avoid for:** flows of many discrete items (use marble-run), assembly/teardown (exploded-view), drawings (blueprint-build),
hero product shots (studio-product), long text, charts with many values, organic or emotional subjects.

## Planner — `train.js` (pure, Node-safe; `style.plan`, also imported by scene.config.js)
| function | what it gives |
|---|---|
| `gearOutline(teeth, module, { pressureDeg, addendum, dedendum, backlash })` | involute wheel/pinion outline (tooth 0 on +X) |
| `ratchetOutline(teeth, rTip, rRoot, { lean, tipW })` | escape-wheel teeth, locking face leading clockwise |
| `spokeHoles(rIn, rHub, n, width)` · `camOutline(cam)` · `camRadius(cam, u)` | spoke windows · snail cam (N lobes, slow rise, sharp drop) |
| `hairspringPoints(angle, { r0, r1, turns, studAngle })` | breathing Archimedean spiral |
| `escapement({ teeth, period, t0, amplitude, pinAngle, lift, drop, recoil, theta0 })` | `balance(t)`, `anchor(t)`, `wheel(t)`, `steps(t)`, `tickTimes(a, b)`, `timeInStep(f)` |
| `escapementLayout({ center, teeth, rTip, axisDeg, pivotDist, palletSpan = 2.5, lock = .13 })` | anchor pivot, pallet angles, and the wheel phase `theta0` that locks a tooth behind the "in" pallet |
| `planTrain({ module, driver, arbors:[{id,pos} \| {id, mesh:{with, theirs, mine, dirDeg}}] })` | positions at module·(z1+z2)/2, `angle(id, t) = c + k·driver(t)` with phases aligned, `ratio(a, b)` |
| `camFollower({ train, arbor, cam, contactDeg, phase, esc })` · `alignCamPhase({...target})` | follower `lift(t)` (ramp, fall, bounce), `drops`, `strikes`: a drop can only happen on an escapement step |
| `meshReport(train, a, b, outA, outB, times)` | counts outline vertices inside the other wheel; 0 = interlocks without overlap |

## Props (`style.props`; XY = plate plane, z = height above the plate)
| factory | what it makes |
|---|---|
| `gear({ teeth, module, spokes, thickness, material })` | brushed brass involute wheel, rim + spokes + hub |
| `pinion({ leaves, module, length })` | polished steel pinion |
| `wheelSet({ wheel:{teeth,z,spokes}, pinion:{leaves,z0,z1}, arbor:{z0,z1} })` | arbor + pinion + wheel + collet; `userData.setAngle(a)`, `userData.spin` |
| `escapeWheel({ teeth, rTip, rRoot })` | steel club-tooth escape wheel |
| `anchor({ layout, wheelCenter, rTip, forkTo })` | pallet fork with two ruby pallets and fork horns; origin = pivot; `setAngle(a)` |
| `balance({ r, z, rollerZ, pinR, pinDir, hairspring })` | gold balance, timing screws, roller + ruby impulse pin, blued hairspring; `update(angle)` |
| `pendulum({ length, bobR })` | rod + lens bob + suspension spring; `setAngle(a)` (not in the demo) |
| `barrel({ teeth, z, height, ratchetZ })` | toothed drum, windowed cover over the coiled mainspring, ratchet wheel + click; `setAngle`, `setRatchet` |
| `cam({ lobes, rMin, rMax, rise, dir })` | steel snail cam (same outline the planner uses) |
| `strikeLever({ pivot, nose, hammer, headR, headZ })` | blued lever + follower nose + polished hammer head; `setAngle(a)` |
| `bell({ r, h, z })` | polished brass bell lying in the plate plane (crown up), on a bracket post |
| `bridge({ path, width, z, jewels, screws, text, textAt, textAngle })` | gilt bar with Geneva stripes, anglage line, engraving, chatons, blued screws, feet |
| `plate({ w, h, jewels, engrave })` | anthracite main plate with perlage and an engraved gilt border |
| `jewel()` · `screw({ r })` · `arbor({ z0, z1 })` | ruby in a gold chaton · blued slotted screw · steel staff |
| `plaque(text)` | caption: enamel plaque on the overlay (exact colours); `userData.show(t, tIn, tOut)` |
Helpers: `style.helpers.studio` (kit studio env), `dof.setFocus(d)`, `extrude`, `shapeOf`, `circlePoly`.

## Recipe
1. In scene.config.js: `escapementLayout`, then `escapement`, then `planTrain` with the escape wheel as driver, then the
   cam via `alignCamPhase` + `camFollower`. Export them. SCORE = one tick per `esc.tickTimes`, plus the bell at
   `FOLLOW.strikes`.
2. Run `meshReport` on every pair in Node before rendering (the demo: 0 overlapping vertices over 121 times for all four).
3. scene.js: build `wheelSet`s at `TRAIN.arbors[id].pos`. Each frame call `setAngle(TRAIN.angle(id, t))`,
   `anchor.setAngle(esc.anchor(t))`, `balance.update(esc.balance(t))`, `cam.rotation.z = FOLLOW.camAngle(t)` and
   lever = angle of `FOLLOW.lift(t)`.
4. Layering: whatever must be seen meshing goes ABOVE what it meshes with. The demo moved the escape wheel and anchor
   below the fourth wheel so the 8-leaf pinion and 32-tooth wheel are visible from the front.

## Sound palette (kit voices, all from the planner)
tick per beat = `tick` (pitch 1.7 tick / 1.45 tock) + soft `clack` body · cam drop = `click` .75 · strike = `clack` 1.7 +
`chime` .9 (2.8 s) + `chime` .45 (body) · caption = `click` .8 · bed = `pad` A2 (0,7,12,16) `brightness: 650` **Hz**, gain .85.

## Tuning knobs (`spec`)
`finish.grain` (circular-grain roughness), `finish.anisotropy` (radial sunburst), `finish.side` (flank roughness/env:
tames tooth glints), `finish.perlage`, `finish.stripes`, `studio.panels` (what the metal reflects), `steelEnv`, `dof`,
`geometry.module / rimWidth / spokeWidth / hubRadius`, `plaque.heightFrac / x / y`, key light `shadow.softness`.

## Known limitations
- **Anisotropic brass is fragile.** It only works on `extrude()` geometry, which carries explicit +X tangents, and only on
  the caps; side walls get a plain material through `withSides`. On primitives (cylinders, boxes) or ±X side walls the
  tangent frame is degenerate, which gives NaN, and bloom then blacks out half the frame. This shipped three times
  during authoring, and the 1/8-res `--deep` NaN scan missed it once. Sweep the timeline for pure-black patches.
- The escapement is a stylised Swiss-lever/Graham hybrid. The pallets dip 4.4 cm into the tip circle and lock a tooth
  ~1.3 cm behind their face. There is no impulse-face geometry and no draw, and the wheel's drop is an eased step.
- The train is "ticked" end to end: the barrel and second wheel barely move in 15 s (0.6° and 3.3°). That is the
  real ratio, and it reads as "still". Show motion on the escape wheel, the 4:1 pair and the third wheel.
- The follower nose is placed on a rigid lever and approximates cam contact; the gap or overlap is a few mm.
- Bridges hide most pinion/wheel contacts in a frontal view; only meshes left outside bridges are visible.
- Steel pinions read dark bronze under the warm studio (they reflect it); `steelEnv` 1.6 helps but does not fix it.
- Text is OS-rasterised (Baskerville/Didot plaque, Copperplate engravings).
