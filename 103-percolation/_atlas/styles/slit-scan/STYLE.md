# Slit-Scan (`slit-scan`)

**Look.** Time-displacement photography of a bright toy bench. A cream set, flat soft light, saturated toys in steady rigid
motion: a four-colour square beam spinning on its long axis, a straight beaded rod bobbing up and down, a row of metronomes
ticking in unison. The camera shows a different moment in every screen column, `w(t, x) = t − lag(t, x)`, so the beam twists
into a corkscrew, the rod bends into a wave and the unison fans into a ripple — while the posts (which do not move) stay
straight. No tone mapping, no grain; a ruler along the bottom is coloured by the lag of each column (yellow = now, violet = oldest).

**Good for:** time vs space, "the same data read in a different order", latency and lag, rolling-shutter intuition, streaming,
history folded into one picture (a context window). **Avoid for:** static subjects (nothing happens), subjects that move
sideways fast (they smear, see limitations), anything needing a moving camera with heavy parallax, dark/moody looks.

## Planner — `timeslice.js` (pure, Node-safe; `style.plan` / `style.motion`)
| export | what |
|---|---|
| `createTimeMap({ sweep: {t0,t1}, delay: keys, profile: keys, bands })` | the plan: `lag(t,x)`, `worldTime(t,x)`, `delay(t)`, `weights(t)`, `nodes(t,K)`, `scan(t)`, `events({duration, subjects, toys})` |
| `PROFILES` | `ramp` (left = then), `centre` (centre = now), `bands` (n repeated ramps; implemented, not used by the demo) |
| `createToys(spec.toys)` | closed-form world-time motion: `beamAngle(w)`, `rodY(w)`, `metAngle(w)`, `tickIndex(w)`, `metX()` |
| `sliceVoices(spec.sound)` | voice table for `kit/schedule.scoreFromEvents` |

The sweep is a true slit-scan: the scan line freezes each column as it passes (`lag = max(0, (t−t0) − x·D)`), which at `t1`
equals the live map `delay = D` with the ramp profile, so the hand-over to the dial is continuous.

## Props
| prop | what |
|---|---|
| `bench(T = spec.toys)` | wall, floor, posts, beam, rod, metronomes → `{ group, toys, pose(w), parts }`; `pose(w)` puts every part at world time w |
| `timeCamera(bench)` | the stateless multi-pass; installs itself as `stage.post`. `cam.set(map, t)` each frame, then `stage.render(t)` |
| `ui(labels)` | overlay: one caption plate at a time, THEN / NOW ruler labels (follow the profile weights), delay knob → `update(t, map)` |

**How the time camera works (no frame history).** Per frame it renders the scene `K+1` times (`spec.slices.count` = 640):
node j (x = j/K) is the whole scene posed at `t − lag_j`, drawn with a scissor two strips wide into target A (even j) or
B (odd j). The composite shader blends the two nodes around each pixel linearly, so there are no strip seams; it also draws
the scan-line glow and the ruler from the same lag table. Slices are 2× supersampled (box-filtered down) instead of MSAA.
Scissor state lives on the render targets only; the canvas scissor/viewport is never changed. Measured: 641 slice renders
with shadows, 15 s demo renders in ~76 s on the M1 Pro.

## Signature motion
Rigid toys → scan line writes the time map left to right → the map goes live → the delay dial is turned to 0 (everything snaps
straight) and up (twice the twist) → the profile folds to centre-out. Camera locked.

## Sound (all from the plan's events)
`whir` tone per dial segment, pitch `base × 2^(delay / octavePer)`; one `tick` per metronome extreme *as shown in its column*
(unison = one loud tick, a time map = a roll of ticks); a `blip` as the scan line crosses each metronome; `whoosh`/`chime`
for sweep and fold, `pop`+`thud` when the dial hits zero; a quiet `pad` bed.

## Tuning knobs (spec.js)
`slices.count` (must divide 3840 into even pixel strips: 160/240/320/480/640), `slices.supersample`, `toys.beam.rate`,
`toys.rod.period/amp`, `toys.metronome.period/swing`, `ruler.lagMax/tickStep`, `knob.max`, `sound.tone`.

## Known limitations (hit while building)
- Neighbouring slices are cross-faded, not motion-compensated: at K = 128 fast edges showed comb fringes and stair steps;
  320 was better; 640 is clean at the demo's speeds. Keep (speed in px per second of world time) × (lag per strip) under ~2 px.
- Subjects moving ALONG the time axis at a speed near 1 / (lag gradient) stretch into long smears (real slit-scan behaviour, but
  it reads as a glitch). The metronomes were slowed (period 1.8 s, swing 0.46 rad) to keep bob speed × gradient ≈ 0.6.
- Shadows are re-rendered per slice (cost), and each column shows the shadow of its own moment — correct, slightly odd on the wall.
- The ruler is drawn by the composite shader; the lag table is a uniform float array of K+1 entries (641 — fine on ANGLE/Metal,
  may exceed the uniform limit on small GPUs: lower `slices.count`).
- No kit post stack (no bloom/grain/vignette passes); `stage.post` is the time camera, whose `set(map, t)` is not `post.set(effects)`.
- Only column (x) time maps are implemented; `slices.axis` is recorded but rows are not wired.
- No numbers on screen: the knob and ruler ticks (every 0.5 s of lag) carry the scale.
