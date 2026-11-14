# Circuit Board (`circuit-board`)

A macro photograph of a real printed circuit board. Deep matte-satin solder mask (lighter where it covers copper pour
or decorative traces, darker over bare laminate, with clearance gaps around exposed copper), glossy gold (ENIG) traces,
pads and plated holes, white single-stroke silkscreen (outlines, reference designators, captions), black epoxy chips
with gull-wing tin pins, 0805 resistors/capacitors/LEDs, a pin header, one low raking key light from the left-front and
shallow depth of field. **Signature mechanic:** a signal is a bright HDR pulse with a comet tail running along an
octilinear trace (45° bends, vias that flash as it passes); when it reaches a part, the part powers up (LED lights and
spills colour onto the mask, a chip's etched label glows, a silkscreen caption prints itself left to right) while the
camera tracks the pulse at macro scale and settles on each part. Silkscreen text is the label system.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/27-circuit-board/` ("how a signal moves: input → processor → memory → output").

**Good for:** how computers / chips / AI hardware / data pipelines work, cause-and-effect chains, "signal flows from A
to B", fan-out and fan-in, step-by-step processes that have a physical "this part does X" reading.
**Avoid for:** soft, emotional or organic topics; charts with many values; long text (silkscreen captions are one short
line); anything needing many simultaneous labels; very fast cutting (in-world captions need the camera to hold).

## Props (`style.props`; board coordinates x right, z toward the viewer, board top y = 0, ×100 macro scale)
| factory | what it makes |
|---|---|
| `board({ seed, w, d })` | FR4 slab with mask + edge materials, plated corner holes, fiducials. `userData.place(part, [x,z], rotY)`, `addTrace(route)`, `reserve(rect)`, `silk(item)`, then **`bake()` once** (paints the colour + height/roughness canvases from everything registered: pour, seeded non-crossing covered traces with tented vias, clearances, silkscreen) |
| `trace(route, { width })` | exposed gold trace (trapezoid section, mitered 45° bends) along a planner route |
| `vias([[x,z]])` | instanced gold annular rings + drill holes (place at `[0,0]`) |
| `pad({ w, d, round })` | SMD pad |
| `chip({ kind:"qfp"\|"soic", body:[w,d,h], perSide, pitch, name, ref })` | epoxy body, gull-wing pins on pads, stroke-font laser label (`setPower(p)` glows it), pin-1 dimple, silk outline + designator |
| `passive({ kind:"resistor"\|"capacitor", axis, ref })` | 0805 part, tinned end caps on pads |
| `led({ axis, ref, color })` | 0805 LED, resin lens; `setPower(p)`; silk cathode bar |
| `connector({ pins, axis, ref })` | through-hole pin header (square pin-1 pad) |
| `crystal({ axis, ref })` | unmarked low metal-can resonator |
| `part(spec)` | dispatch on `spec.kind` (use with the same PARTS data the planner routes from) |
| `pulse(route)` | additive HDR ribbon: `userData.set(plan.pulseAt(t, p), afterglowOn)` — head, tail, powered afterglow |
| `flash({ radius })` | additive glow disc (via / pad / pin flashes), `userData.set(level)` |
| `silkLabel(text, { cap, align })` | flat silkscreen caption with a print-on wipe: `userData.setReveal(u)`; `userData.size` for `reserve` |
| `lightPool(n)` | fixed pool of point lights (no shader recompiles): `userData.assign([{ at, color, intensity }])` |
| `bench({ y })` | dark work surface below the board |
Helpers: `traceGeometry`, `ribbonGeometry`, `drawStrokeText`, `strokeTextWidth`. `style.render(t, { focus })` = DOF focus + render.

## Planner — `signals.js` (pure, Node-safe; `style.plan`, also imported by scene.config.js)
`octiRoute(waypoints, { chamfer, lead })` (straight + 45° legs, 90° corners chamfered, `{ at, via:true }` waypoints become
vias with arc-length `s`) · `routePoint(route, s)` · `projectS` · `partPin(part, side, i)` / `chipPads(part)` (pad centres,
shared with the 3D factories) · `planSignals(nets)` (`start` or `after: netId, delay` chaining → pulses with t0/t1/via
times + sorted `events` launch/via/arrive) · `pulseAt`, `headPoint`, `powerAt`, `flashAt`, `revealAt` ·
`cameraAt(t, shots, plan)` / `cameraKeys(...)` (macro holds and pulse-tracking shots cross-faded with smootherstep, sampled
per frame into ordinary rig keys) · `signalVoices()` for `kit/schedule.scoreFromEvents(plan.events, voices)`.

## Recipe
1. In scene.config.js: `PARTS` (plain data), routes from `partPin` waypoints, `NETS` chained with `after`, `PLAN =
   planSignals(NETS)`; derive BEATS, caption on/off times and SHOTS from `PLAN.arrive/launch`; `CAMERA = cameraKeys(...)`;
   `SCORE = scoreFromEvents(PLAN.events, signalVoices()) + bed + caption ticks`.
2. In scene.js: `board()` → `place(part(p), p.at)` for every part → `trace` + `addTrace` for every route → `vias` →
   captions (`silkLabel`, `place`, `reserve`) → `bake()`. Per frame: pulses, flashes, part power, light pool, caption reveal.
3. Captions: one at a time — print on arrival, wipe off as the camera leaves; leave room for them with `reserve`.

## Sound palette (kit voices, from the plan)
launch = `blip` [0,7] (pitch 1.6) + a gliding `whir` 420→760 Hz for the trip · via = `tick` (1.4) · arrive at a chip =
`click` + low `chime` (0.6; memory 0.75) · arrive at an LED = `pop` + `sparkle` · caption print = soft `tick` · processor
"thinking" = rising ticks · bed = `pad` root 55 Hz [0,7,12,15,19], `brightness: 650` **Hz**, gain .85 + `hum` 60 Hz at .05
once powered. Demo measured: mean −21.3 dB, peak −3.9 dBFS (measured, not listened to).

## Tuning knobs (`spec`)
`palettes` (`green` default, `blue`, `black`, `red`, `purple`, `copper` — pass `createStyle(stage, { palette })`) ·
`board.pxPerMetre` (900 ≈ 1:1 at the demo's macro distance), `decoTraces`, `clearance`, `mottle`, `height/roughness` ·
`trace.width/height/topInset/chamfer` · `pulse.intensity` (4.5 HDR; above ~8 the bloom becomes a halo blob),
`tail`, `halo`, `afterglow`, `light.intensity` (keep ≤ 0.3 or the spill washes the mask), `viaFlash` · `led.strength`
(≈1; higher turns the lens white under neutral tone mapping) and `led.light` · `chip.glow.strength` · `silk.cap/stroke/wipe` ·
`dof.aperture/maxblur` · key light height (`lights[0].position`, ~13° above the board).

## Known limitations
- The board top is one baked canvas (5760 × 3240 for a 6.4 × 3.6 m board): fine at ~2.5–3 m camera distance; closer
  macro shots soften the covered traces/silk. Raise `pxPerMetre` with care (GPU memory).
- Exposed copper and gold glint hard under the raking key and bloom a little (orange streaks on trace walls facing the
  key); they can read like a second pulse at a glance. Bloom threshold 2.0 keeps it modest; lower it and they compete.
- LED lenses go pink-white rather than saturated red at full power (neutral tone mapping); the red lives in the spill.
- Gull-wing pins are a simple extruded profile; from the front they read as flat grey slabs, not as formed metal.
- Decorative covered traces are random walks: they look plausible but do not "connect" anything; designators are
  placed by rule and can crowd neighbouring parts (set `refAt`).
- Captions are in-world planes: they foreshorten with camera elevation (keep el ≥ ~30°) and need the camera to hold.
- Part rotation in `place()` supports multiples of 90° for footprints; `partPin` assumes unrotated chips (rotate by
  choosing sides instead).
