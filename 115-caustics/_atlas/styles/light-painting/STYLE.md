# Light Painting

**Look.** A long-exposure night photograph. A camera on a tripod with the shutter open; a person waves a small light in
empty air, and everywhere the light has been stays glowing. Trails are hand-waved, not bent glass: they wobble, overshoot
corners, swell into bright blobs where the pen paused, thin out and dim where it flicked fast, and break where the light was
switched off between letters. Around them sits a real place, barely visible: wet asphalt that reflects the trails in
puddles, a soft out-of-focus town and tree line on a sodium-lit horizon, a few bokeh street lights, and a faint smeared
ghost of the painter. Strokes hang at different depths, so a slow camera arc shows the drawing is a sculpture in the air.
An overlay shows the exposure timer; the shutter clunks open at the start, snaps shut at the end, and the frame
"develops" (a touch brighter and warmer) and holds as the finished photo. Demo: `3d-style-atlas-pilot/59-light-painting/`.

**Good for:** titles and one-word claims with a human, handmade feel; "this happens over time" / "the record of a
process" ideas (logs, memory, history, traces, accumulation); reveals of a simple icon (idea bulb, star, arrow, spiral);
night/creative/photography topics. **Avoid for:** dense text (more than ~6 letters per line gets thin), data and numbers
(nothing here is precise), daytime or bright, calm/clean corporate looks, anything that needs exact colours in the 3D layer.

**Not neon-sign.** Neon is fixed glass tubes on a wall that switch on. Here there is no object: the line exists only
because the exposure remembers where a moving light went, so it GROWS behind a moving pen tip and carries the hand.

## Files

| File | What |
|---|---|
| `spec.js` | palette, world (AgX), bloom, `hand` (planner tuning), `trail`, `pen`, `painter`, `location`, `develop`, `shutter`, caption/indicator, `sound` |
| `strokes.js` | **planner (Node-safe)**: `createDrawing(moves, spec.hand, { seed })`, `ICONS` (star, bulb, spiral, arrow, ring), `painterAt`, `strokeVoices` |
| `style.js` | `createStyle(stage)` → props below; `helpers.shutterClosure(t, at)`, `helpers.develop(t, at)`, `helpers.mirrorRoot` |

## The planner (`strokes.js`)

`moves = [{ id, kind: "text"|"icon", text?, cap?, icon?, opts?, at:[x,y,z], size?, yaw?, pitch?, roll?, letterZ?, wobble?,
color, t0, t1, dwell?, group? }]`. Text comes from the kit stroke font (`layoutStrokeText`); `letterZ` gives each letter
its own depth. Every stroke is: overshoot hook at sharp corners → small fillet → resample (2 cm) → seeded wobble (x/y tremor +
slow drift in z) → speed profile (slow at start/end/turns + seeded hesitation) → per-sample absolute time `T`, brightness `B`
and width `W` from pen speed (slow = bright + fat, fast = thin + dim; faster strokes are also dimmer overall) → sometimes one
"switched off" gap. Plan API: `strokes`, `penAt(t)` (position, on, colour, speed), `events({ chunk })` (one `start` per
stroke + `shimmer` chunks with speed), `box(t, ids)`, `drawnFraction(id, t)`, `centroid(id)`. The trail at t is just the
samples with `T <= t`: closed form, no accumulation buffer. Time budget per move: travel gaps scale with the jump between
strokes; draw time ∝ length^0.75; throws if a move has no time to draw.

## Props

| Prop | What |
|---|---|
| `trails(plan)` | one camera-facing ribbon mesh for all strokes (+ mirrored copy); `update(t, level)` |
| `blobs(plan)` | start / corner / lift-off blobs; appear at plan time and swell while the pen dwells |
| `pen()` | flare billboard (hot point + two star streaks) + point light; `update(plan.penAt(t), live)` |
| `painter(plan)` | ghost: 7 translucent time-lagged poses (capsules), sway, arm reaching the pen; `update(t, { freezeAt, level })` |
| `backdrop()` / `ground()` / `bokeh()` | curved night horizon canvas, wet asphalt, 3D bokeh at the sides (mirrored) |
| `spill(plan, groups)` | one point light per colour group that fills in as that group is drawn |
| `caption()` / `indicator()` / `shutter()` | overlay chip top-left, exposure chip top-right (closed / open + seconds / exposure), focal-plane blades |

## Signature motion

The pen sits (blob grows) → sweeps, trail growing behind it → light off, travels → next stroke. Camera still while
drawing; one arc (`path: "arc"`) to ~38° and back to ~15° to show depth. Shutter: closed → open (clunk) → … → close (clunk)
→ black ~0.16 s → reopen on the developed photo. After the close nothing new is recorded (the scene clamps plan time).

## Sound palette

`pad` bed (110 Hz, warm, brightness 700 Hz) · `tick` at every stroke start · `buzz` shimmer chunks every 0.1 s while the
light is on, gain and pitch following pen speed · `clack` + low `thud` for the shutter open/close · soft `chime` when the
print develops. All from `PLAN.events()` + `SHUTTER` (derived from BEATS). Levels measured, not listened to.

## Knobs

`trail.width / halo / core / coreFrom` (thickness, colour body, how soon slow parts over-expose to white) ·
`hand.wobble / overshoot / speed / response / gaps` (hand character) · per-move `wobble` multiplier (long sweeps want 3–4) ·
`pen.level / light` · `bloom` (threshold 0.55, strength 0.95) · `painter.opacity / copies / sway` · `location.bokeh` ·
`develop.exposure / tint` · `trail.mirror` (puddle reflection level / size).

## Known limitations (seen while building)

- The painter ghost is a capsule mannequin. Kept very faint on purpose; at higher opacity it reads as a mannequin, not a person.
- Long one-piece sweeps (the 19 m ring) still look smoother than a real hand even with `wobble: 4`; short strokes look right.
- The pen point light near the ground can make a big coloured pool on the asphalt (it did at 7 cd; 3.2 is the compromise).
- The mirrored reflection is a flipped copy with a puddle mask, not a ray-traced reflection: no ripple distortion, and the
  reflection of the lower half of the frame is cut by the frame bottom.
- The first ~0.4 s is black (shutter closed) by design; only the overlay chips show.
- Lower third of the frame is dark ground; the scene relies on reflections and the pen spill for life there.
- Text and the overlay use macOS system fonts (Helvetica Neue / Menlo); stroke-font letters are uppercase only.
