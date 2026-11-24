# Cloud Chamber

**Look.** The tabletop instrument that makes invisible particles visible. A shallow glass tank on a black cold plate, a
thin layer of mist lit from the left by a sheet lamp, deep blue-black everywhere else. Nothing seems to be in it — then
white condensation trails streak across the mist out of nowhere: short fat straight stubs, long thin needles from wall to
wall, faint wandering threads. Each trail appears in a few hundredths of a second, then only ages: it widens, sinks,
wanders, curdles into droplets and fades over about two seconds. Lower a source into the mist and stubs fan out of one
point like a fountain; switch on the magnet under the plate and every path bends — the light threads wind into shrinking
spirals. Demo: `84-cloud-chamber/` ("Invisible, until you look this way").

**Good for:** making invisible activity visible; "it was there all along"; background processes; detecting signals;
evidence and traces; interpretability (seeing what a model does inside); monitoring. **Avoid for:** anything that needs
text or numbers in the 3D layer, precise diagrams, bright/friendly looks, long holds on one object (the picture is
traffic, not a thing).

**Not light-painting.** There a pen draws one line slowly and it stays. Here nothing draws: hundreds of independent
events each flash in whole and decay, and the rate of events is the story.

## Files

| File | What |
|---|---|
| `spec.js` | palette, world (AgX), bloom, `tank`, `kinds` (alpha / muon / beta / ray), `field`, `trail`, `mist`, `glass`, `lamp`, `source`, `magnet`, `room`, caption, `sound` |
| `tracks.js` | **planner (Node-safe)**: `createPlan({ seed, phases }, STYLE_SPEC)`, `trackVoices(SND)`, `trackPan(tank)` |
| `style.js` | `createStyle(stage)` → props below; `helpers.room(level, lampOn)` |

## The planner (`tracks.js`)

`phases = [{ t0, t1, field: 0|1, rate: { muon, beta, alpha } (trails/s anywhere in the tank), source?: { p: [x, z], dir,
spread, r0, rate: { ray, beta } } }]`. Event times are stratified (rate × duration slots with seeded jitter: even
traffic, no droughts). Source headings use golden-ratio angles so a fan fills evenly. Every event's curve is integrated
ONCE at 5 cm steps: heading' = field · q / radius (+ seeded wobble and rare kinks for threads); for `spiral` kinds the
radius shrinks along the path, so the trail winds inward. Trails end at the glass; muons run wall to wall.
Plan API: `tracks` (pts, tan, u, s, wander, t, reveal, life, width, bright, warm, kind, field, fromSource), `events()`
(one per trail, for SCORE), `aliveAt(t)`, `box()`, `phaseAt(t)`. Each trail has its own generator, so changing a rate
does not reshuffle the other trails' shapes (it does change which trail gets which index).

## Props

| Prop | What | Hook |
|---|---|---|
| `trails(plan)` | one merged camera-facing ribbon mesh; per-vertex appear time, life, width, brightness, wander | `update(t, gain)` |
| `mist()` | stacked additive noise sheets in the tank, brighter toward the lamp | `update(t, level)` |
| `chamber()` | cold plate, base, glass panes + additive edge lines, foot rail, sheet lamp bar | — |
| `room()` | table + wall, seen only while the room light is on | — |
| `source({ p })` | rod lowered from above with a glowing amber bead + small point light | `update(u, level)` (u 0 out, 1 in) |
| `magnet()` | coil outline on the plate | `setLevel(k)` |
| `caption()` | overlay chip (exact colours, after post) | `userData.show(text, alpha)` |

`helpers.room(level, lampOn)`: 1 = ordinary lit room, 0 = dark. Scales room lights, background, glass reflections and the
bloom threshold (0.9 dark → 3.2 lit, so the lit room does not haze). Call it every frame.

## Signature motion

Per vertex `age = t − (birth + u · reveal)`. From age alone: head-to-tail reveal (reveal = length / kind speed), a birth
flash, widening (`trail.widen`), sinking (`fall`), seeded sideways wander, 2D droplet break-up (threshold rises with
age), power-law fade. No rebuilds, no buffers; seeking in any order gives the same frame. Keep the camera locked while
trails appear; one move in (room → light sheet) and one small arc at the end.

## Sound

Low cold `hum` (55 Hz) + dark `pad`. One `tick` per trail straight from `plan.events()` via `scoreFromEvents`
(alpha low and fat, ray lower-mid, muon sharp, beta faint and high; panned by x). `clack` lamp switch, `whoosh` as the
room dims, `clack` when the source seats, `thud` + sustained `buzz` for the magnet, soft `chime` at the end.

## Tuning knobs

- Busier / calmer: the phase `rate`s in the scene. About 15–20 trails alive reads as "traffic"; 45–50 as a fountain.
- Contrast: `mist.level` (0.03; above ~0.06 the frame goes milky), `post.bloom.strength` (0.4; 0.75 washed the fountain out), `trail.level`.
- Curl: `field.radius` (first loop radius at q = 1) and `field.shrink`; per kind `q` (sign = turn direction).
- Trail ageing: `trail.widen`, `wander`, `beadFreq`, kind `life`.
- Tank height `tank.h` must stay low (0.75) for a camera at ~35° elevation, or the front glass edge crosses the picture.

## Known limitations

- Trails are flat camera-facing ribbons in a thin layer: fine from 25–45° elevation, they thin out near edge-on.
- The mist is noise sheets, not volumetric; from very low angles the layers show as bands.
- Glass is a whisper (additive panes + edge lines): no refraction, no reflections of the trails on the plate.
- The magnet is only signalled by a thin coil outline and by the curling itself; there is no visible hardware.
- Units are toy scale (tank 8 m wide). The "physics" is pictorial: curvature and lengths are tuned to read, not computed.
- In the lit opening the trails are still faintly visible (gain 0.07) — deliberate, so the first second is not dead.
- Old fat stubs break into soft blotches that can look smudgy in a still; they read better in motion.
