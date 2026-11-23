# 3D Zoetrope (`zoetrope`)

**Look.** Animation about animation. A bright toy turntable on a clean cream studio sweep: a glossy turquoise plinth, a
white platter with a printed top (concentric rings, one coloured tick per station) and a band of coloured segments round
its edge, a raised yellow inner tier and a glossy blue spindle cap. Two rings of small saturated sculptures stand on it,
each ring holding 24 successive poses of one looping action: on the platter, sprouts in terracotta pots that grow, bud,
bloom pink, close and sink back; on the tier, red clear-coated balls on thin clear rods that bounce with squash and
stretch. A pendant-style strobe head on a floor stand stands back-right. Neutral tone mapping keeps the toy colours as
designed; a soft room environment gives the gloss highlights. The caption is a pill chip with three toy dots on the
overlay: white by day, dark navy under the strobe.

**Signature mechanic** (`zoetrope.js`, Node-safe; `style.plan` / `style.motion`). Nothing on the disc ever changes shape:
every station is a fixed sculpture baked once (merged per ring and material: 8 draw calls for 48 sculptures). Station `i`
of an `N` ring sits at disc angle `i·2π/N` and carries phase `frac(−i/N)`, so the station at the front shows phase
`frac(θ/2π)`: one action per revolution. The disc angle `θ(t)` is the exact integral of smoothstep speed steps (spin up,
detune, coast), offset so `θ` is an exact multiple of `2π/N` at the strobe lock. Three looks, all pure functions of t:
- **still**: speed 0, a ring of statues;
- **continuous light**: `anglesAt(t)` returns K sub-frame angles over a one-frame shutter and an accumulation pass
  (inserted before tone mapping) re-renders the scene at each and averages them: a true exposure blur, shadows included.
  At the locked speed one frame smears exactly one station spacing, so the stations merge into a band;
- **strobe**: one flash per video frame, the frame shows `θ` at the frame time (no blur). At one station per frame every
  spot on the ring shows the next pose, so each station appears to animate in place (verified on consecutive frames);
  a disc 2.5 % faster than the strobe (`DETUNE`) makes the whole animation creep forward round the disc. The room
  darkens to 8 % in 0.22 s, a front-left spot (the "strobe" light) lights the disc, the visible lamp's lens glows and
  pulses gently frame to frame (±18 % on the small lens only, never the whole frame), with a soft 0.35 s switch-on flash.

## Good for / avoid for
- Good for: how animation / frame rates / persistence of vision work, sampling and aliasing (strobe, wagon-wheel, detune),
  loops and cycles, "same thing, many states", playful reveals ("it was moving all along").
- Avoid for: data and numbers (nothing here encodes a value), long text, dark moody pieces, anything that needs the
  sculptures to change shape over time (they cannot: only the disc moves).

## Planner (`zoetrope.js`)
| call | what |
|---|---|
| `stationPhase(i, N)` | pose phase carried by station i. |
| `ballPose(p, o)`, `flowerPose(p, o)`, `POSES` | closed-form looping poses (ball: bottom height + squash/stretch scale; flower: stem, leaf, head, open, droop). |
| `createSpin({ N, fps, steps:[{t,d,rate}], strobe:[{on,off}], lockAt, shutter, blurSamples })` | the plan. `rate` is in stations per video frame (1 = locked). |
| `plan.theta(t)`, `plan.omega(t)` | disc angle (exact integral) and speed. |
| `plan.anglesAt(t)` | the disc angle(s) a frame shows: one (strobe or still) or K sub-frame angles (blur). |
| `plan.frontPhase(t)`, `plan.strobeOn(t)`, `plan.frameTime(t)`, `plan.smear(t)` | helpers for framing, sound and checks. |
| `plan.events({ t0, t1, bloomAt })` | strobeOn/strobeOff + one `bounce` per front-ball contact and one `bloom` per front-flower bloom, frame by frame. |
| `darkness(strobe, t, fade)`, `onsetFlash(strobe, t, dur)` | room level and switch-on flash from the strobe windows. |

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `turntable({ rings })` | plinth (static) + disc (platter, printed top, stripe band, tier, spindle, rings); `setAngle(a)`. |
| `ring({ pose, N, radius, tier, height, ... })` | merged sculptures for one ring (also used by `turntable`). |
| `sweep()` | cream cyclorama. |
| `lamp({ position, target, size })` | strobe head on a floor stand; `userData.setGlow(k)`. |
| `lighting(strobe, { lamp })` | `update(t)` → room level, strobe spot, lamp glow, background; returns `{ dark, flash }`. |
| `motionBlur(turntable)` | the accumulation pass; `setAngles(plan.anglesAt(t))` every frame. |
| `caption()` | overlay pill chip, `userData.show(text, alpha, night)`. |

## Sound palette
`pad` bed (C major, 900 Hz cutoff) for the mean level; a `whir` chain whose pitch (55 → 150 Hz) and gain follow
`plan.omega(t)` (rising on spin-up, gliding down on the coast); `clack` + a low `buzz` hum (120 Hz, no flicker) for the
strobe window; one `marimba` (G4) per front-ball contact and one `pluck` (C5) per front-flower bloom under the strobe,
from `plan.events`; `click` at strobe off; a soft `marimba` note per label. Measured, not listened to.

## Knobs (spec.js)
- `rings`: pose, N (12–24 tested only at 24), radius, tier, height. `flower`, `ball`: part sizes.
- `spin`: `blurSamples` (16; fewer shows striations in the smear), `shutter` (frames), `strobePeak`, `darkRoom`, `fade`,
  `onset`, `lampGlow`, `lampFlicker`.
- `table`: plinth / platter / tier / spindle sizes. Lights: `key` (day shadows), `strobe` spot position = strobe shadows.

## Known limits (seen while building the demo)
- Blur cost: a continuous-light frame at speed is 16 full scene renders (with shadow maps). Fine on the M1 Pro with 48
  merged sculptures; a much heavier set would want fewer samples or a cheaper blur.
- With 16 samples the smear still shows faint fine striations along the fastest (outer) ring in a full-size still; in
  motion it reads as a blur band.
- The visible strobe head (back-right) is not the light source: the strobe spot is an off-screen head front-left, chosen
  so the sculptures' fronts are lit. The visible head's stand clips the frame edge in the close shots.
- Under the strobe the room is a warm dark grey, not black (the spot spills onto the sweep).
- Strobe "lock" depends on the video frame rate: `fps` in `createSpin` must equal the render fps (30), and `anglesAt`
  quantises strobe frames to `frameTime(t)`, so a still at a non-frame time shows the previous flash.
- Station poses are only as smooth as N: at 24 the ball's contact squash spans ~2 stations; fewer stations would stutter.
- Phases of all stations advance together, so the "contact" wave travels round the ring with the disc; that is how a
  real zoetrope looks without slits, but viewers may read the ring as a wave rather than 24 separate bouncers.
