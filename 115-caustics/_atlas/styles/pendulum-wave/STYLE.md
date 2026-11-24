# Pendulum Wave (`pendulum-wave`)

**Look.** A classic pendulum-wave demonstration on a bright, cool-white bench (toy scale: balls 0.43 m across, the row
7 m long, so one ball reads at 1080p). Fifteen big glossy balls, saturated rainbow by index (red = longest, slowest;
magenta = shortest, fastest), each on a V of dark strings from a level brass hanger bar. The hangers drop from one
curved wooden beam whose underside IS the graph of period squared, carried by two wide A-frames (tall at the long end).
A wooden plank stands behind the displaced balls to release them and rises again to catch them. Under each ball a
round lamp in the bench flashes the ball's colour when it crosses the centre. Neutral tone mapping (keeps the yellows
and reds saturated), room environment, warm key from front-left, cool rim, light vignette, no bloom, no grain.
Captions sit on one white overlay plate with an ink edge, top centre; freeze-frame "fingerprint" cards sit in the bottom
corners (exact colours).

**Signature mechanic.** One closed form, planned in `wave.js` (THREE-free, Node-safe):
- pendulum k makes `N + k` swings per cycle (`N = rig.swings0` = 16): `angle_k = A_k cos(2 pi (N + k) tau / T)`;
- string lengths follow from the periods: `L_k = Lmin ((N + n - 1) / (N + k))^2`; `A_k = asin(reach / L_k)` so every ball
  leaves (and returns to) the same straight plank;
- `tau(t)` is a planned clock (piecewise-linear rate, closed form, invertible): stopped before the release, rate 1,
  ramps to 0 for a freeze-frame and back, stopped again at the catch. `T = tau(catchAt)`, so whatever freezes you plan,
  all 15 balls are back on the plank exactly at `catchAt`;
- trails are the same formula at earlier clock times (`tau - j * step * rate`), so they vanish in a freeze; ghosts that
  still overlap their ball are shrunk away;
- one tick per front-to-back centre crossing (`tau = (m + 1/4) T / swings`, mapped back through the clock): a lamp flash
  and one pentatonic marimba note pitched by index. The sound goes chord (release clack) -> ripple -> fast patter ->
  ripple -> unison chord at the catch;
- freeze-frames: a camera flash, then one dot per ball flies from the ball's projected screen position to an overlay
  card, x = index, y = the frozen displacement (`fingerprint(i)`), then stems join the dots to the rule;
- at the catch every lamp lights at once (`unison(t)`): a rainbow dotted line on the bench under the caught row.

## Good for / avoid for
- Good for: positional encoding / "each position gets its own pattern of frequencies", Fourier ideas, phase and
  interference, sync and drift, clocks and hashing ("every moment has a unique fingerprint"), order out of apparent
  chaos, periodicity, anything where a single rule makes a complex pattern and then resolves.
- Avoid for: data with real numbers (the cards plot shapes only), long holds of static content (the look IS the motion),
  dark or sombre topics (bright toy look), more than ~20 pendulums (the beam gets steep and balls small).

## Planner (`wave.js`; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `createClock(segments)` | `{ tau(t), rate(t), tOf(tau), total }` from `[{ t0, t1, r0, r1 }]` rate ramps. |
| `clockSegments({ release, freezes: [{ slow, stop, go, full }], catchAt, end })` | the demo clock. |
| `createPlan({ rig, timing, end })` | `{ n, T, gEff, balls [{ k, x, swings, hz, L, amp, pivotY }], tau, rate, angleAtTau, posAtTau, pos(k, t), ghost(k, t, j), crossings, sinceCrossing(k, t), freezes, fingerprint(i), plankDrop(t), unison(t), beamY(x), lengthOf, events() }`. Throws if a pendulum is shorter than the reach. |
| `waveVoices(spec.sound)` | voices for `kit/schedule.scoreFromEvents` (`bed`, `tick`, `release`, `freeze`, `resume`, `catch`). |
| `panOf(rig)` | event -> stereo pan from x along the row. |

## Props (`style.props`)
| prop | what |
|---|---|
| `rig(plan)` | builds and adds everything; `{ group, bench, frame, pendulums, plank, update(t) }`. |
| `bench(plan?)` | ground, plank slot, one InstancedMesh of lamps (flash at crossings, all on after the catch). |
| `frame(plan)` | curved extruded beam (underside = period^2 curve), two A-frames, instanced brass rods + hanger bars. |
| `pendulums(plan)` | InstancedMeshes: balls (instance colour), 2 strings per ball, trail ghosts. |
| `plank(plan)` | release/catch board; drops into the bench slot. |
| `caption()` | overlay plate with three rainbow dots; `userData.show(text, alpha)`. |
| `cards(plan)` | fingerprint cards + flash; `update(t, { titles: [...per card], alpha })` — call AFTER `rig.update` (it projects the balls through the camera). |

## Signature motion
- Released together from the plank, the row drifts into a travelling snake, a double helix (best end-on), groups,
  apparent chaos, then a long sweeping wave that tightens back into one line at the catch.
- Camera: one move per beat, locked holds. Front-left 3/4 for the release; a telephoto (fov 20) end-on view from the
  long end through the tall A-frame for the snake; high front for the freezes (cards in the bottom corners); low
  front-right on the caught line for the end.

## Sound palette
`marimba` per centre crossing (G-major pentatonic from G3, longest = lowest, gain 0.085, decay 85 ms) panned by x;
`clack` + soft `whoosh` at the release; `click` + `clack` + small `chime` per freeze (the shutter); `whoosh` on resume;
`clack` + `thud` + a rolled marimba chord at the catch; a low `pad` (G2, 800 Hz cutoff) as the bed. Demo measured:
mean about -26 dB, max -1.6 dBFS. Measured, never listened to.

## Tuning knobs (`spec.rig`, `spec.sound`, `spec.card`)
- `count`, `swings0` (higher = gentler beam slope but faster swings), `lengthMin`, `reach`, `spacing`, `ballRadius`.
- `trail.ghosts/step/shrink/opacity` — trail length and look; `lamp.decay/dim` — the crossing flash.
- `plank.*` — drop distance and timing; `aframe.spreadTall/spreadShort` — keep wide so an end-on camera sees past the legs.
- `card.*` — card size, dot size, fly time and stagger, flash strength; `sound.*` — levels, scale and root.
- Scene: `TIMING = { release, freezes, catchAt }` — the clock; everything else (T, crossings, cards, score) follows.

## Known limitations
- Physics is the small-angle ideal (pure cosine at every amplitude); the short pendulums swing ~40 degrees, where a real
  one would be slower. Lengths come from the periods with a compressed time scale (effective g about 300 m/s^2).
- With `swings0` 16 the fastest ball does 2.9 swings/s: at 30 fps it is about 10 frames per swing, so the trails do the
  work; much higher `swings0` will strobe.
- The re-sync is gradual by nature (the last second is a long sweeping wave), so the "snap into line" is a tightening,
  not an instant; the catch lamps + chord carry the moment.
- Strings are straight cylinders and the V's do not wrap the ball; balls never collide because the spacing (0.5 m) is
  larger than a diameter, which is not checked if you change `spacing`/`ballRadius`.
- The fingerprint cards plot only z (the swing), not the small rise of each ball; card dot flights assume a held camera
  during the freeze (they read the live camera, so a moving camera just bends the flight).
- In a move past the long end the tall A-frame's near leg sweeps across the balls for a few frames.
