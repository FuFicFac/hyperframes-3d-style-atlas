# Strange Attractor (`strange-attractor`)

**Look.** The Lorenz butterfly as a glossy wire sculpture floating in a bright, pale studio. Each path is a thick
lacquered tube (coral, teal; clearcoat, procedural softbox environment for long highlights) with a glowing bead at
its head, and only the last few seconds of the path are drawn, so the sculpture draws itself and lets go of its tail
(tapered to a point). The floor is a warm off-white that dissolves into the backdrop through matching fog and catches
the sculpture's soft shadow (the shadow follows the same time window as the tubes). Two starts a hair apart run as ONE
twisted two-colour strand while they agree, then unravel at a fork. A speck of 200 small multicoloured beads (coral,
gold, teal, plum) with hairline ribbon tails bursts across both wings at the end. Neutral tone mapping, light bloom on
the beads, a faint vignette, no grain. Overlay: one caption plate (ink navy, gold edge, a coral/teal figure-eight
icon) bottom-centre with a counter-wheel roll between labels, and a small unlabelled dial bottom-right that shows the
gap between the two beads (teal = together, coral = apart).

Motion type: numerically simulated. The Lorenz system (sigma 10, rho 28, beta 8/3) is integrated with fixed-step RK4
(h = 0.002) ONCE at page load (and once in Node for the score and camera); the scene reads stored tables at
tau(t). tau(t) is the exact integral of a piecewise-linear playback rate (slower at the fork, faster for the cloud);
that rate, the twisted-strand display, the tube taper/trail lengths and all camera moves are art-directed. The strand
lays the twin on the coral's own path while its cross-track distance is below 0.35 Lorenz units: the beads are at
their true positions along that path, but the half-tube offset is a display choice, not physics.

## Planner (`lorenz.js`; `style.plan` / `style.motion`; THREE-free, Node-safe)
| call | what |
|---|---|
| `integrate(p0, h, n)` | RK4 from p0, every step stored (Float64Array). Only + - * / : bit-identical in Node and Chrome. |
| `timeMap(knots)` | `{ tau(t), tOf(tau), rate(t) }`; rate piecewise linear in video time, tau its exact quadratic integral, inverse by a quadratic solve (sqrt only). |
| `createPlan({ h, knots, end, start, preroll:[min,max,step], twinAt, dir, geoEvery, split, cloud, maxTries })` | ONE long trajectory from `start`; candidate coral paths are windows of it (on the attractor). Keeps windows that switch wings near `split.at` (and >= `minSwitches` before the twin, >= `minTogether` together). For each, a geometric grid of twin offsets `delta` (repeated multiplication, no pow) is tried: the SPLIT is where the twins reach opposite wings (`forkX`) within `forkTau` of the gap opening past `sep`; it must fall at `at +- tol`, the twin must stay on the coral's path (cross-track <= `agreeMax`) until `agreeLead` s before, and never come back within `rejoinMin`. Throws if nothing qualifies. Then 200 cloud starts (uniform ball, integer RNG) around the coral's path just before the fork, released at `cloud.at`. Returns tables + `headA/headB/sep/cloudAt(t)`, `split` (t, forkT, agree, rejoin, preroll...), `switches`, `hash`. |
| `crossTrack(A, B, kTw, k, win)` | distance from the twin to the coral's path (nearest of +-win steps) and the step shift. |
| `tableHash(plan)` | FNV-1a over A, B, every cloud path, delta and the split tau. The demo records it (`RUN_HASH` = 60846d09) and throws on a mismatch in Node or in the page. |
| `strand(plan, { every, rOff, twist, w0, w1, ramp })` | PICTURE ONLY (cos/sin): display centrelines. Twisted-strand layout on the coral's path while the running-max cross-track gap < w0, blend to the true paths by w1 (for good), twin emerges from inside the coral over `ramp` tau. |
| `noteEvents(plan, o)` | the score's notes: each bead's height -> semitones, snapped to a pentatonic scale, one note every `step` s; before the split the twin = coral note + `detune * sqrt(gap / detuneRef)` semitones; after it, its own line; cloud voices sample cloud beads. |
| `worldMap(scale, lift)` | Lorenz (x, y, z) -> world (x s, (z + lift) s, -y s): wings left/right, z up, floor at y = 0. |

Demo numbers (sample data from the run): twin offset 0.0021 Lorenz units (about 1/20 000 of the butterfly's size),
split at 9.45 s video (target 9.3 +- 0.2), opposite wings at 10.69 s, closest later approach 7.9 units, 7 loops and
6 wing switches before the split, plan build ~0.25 s in Node with the narrowed preroll range.

## Props (`style.props`)
| prop | what |
|---|---|
| `studio()` | 120 m floor (receives shadow), scene fog = backdrop colour, kit `studioEnvironment` with spec.studio panels (top softbox, two tall strips, a front card, a floor bounce). |
| `attractor(plan)` | `strand()` display paths -> two swept tubes (own parallel-transport sweep with `aTau` + `aCenter` attributes). `windowed()` patches MeshPhysicalMaterial AND a MeshDepthMaterial (customDepthMaterial, so the shadow matches): age = tau(t) - aTau; discard outside [0, trail]; radius tapers at the tail and the path start; `uGrow` thins the whole tube. Beads ride the display heads. `update(t)`, `head(t)`. |
| `cloud(plan)` | ONE InstancedMesh of 200 glossy beads (instance colours from spec.cloud.colors) placed from `plan.cloudAt` each frame; ONE ribbon mesh holding every bead's whole path (2 verts per sample, screen-space width in px, DoubleSide), windowed by the same age test. outBack pop at `cloud.at`. |
| `gauge()` | overlay dial (screenCanvas, CPU canvas, uploaded on redraw): track, teal->gold->coral fill, ticks, needle, half-coral/half-teal hub. Reading = (gap / max)^power, quantised to 1/720. Fades in with the twin. |
| `caption()` | overlay plate + two clipped text layers; `show(labels, t, { roll, lead })` rolls the old label up and out while the new one rolls in (never overprints; always one label). |

## Signature motion
- A bead draws a glossy tube along the Lorenz flow; only the last ~5 tau stay, the tail tapers away.
- A twin appears inside the first tube and winds round it as a two-colour rope; loop after loop together, through
  several wing switches; the dial barely moves, then creeps.
- At a fork both dive down the middle; the rope unravels and one bead is thrown to each wing (playback slowed to 0.3).
- A speck of 200 bursts along both wings; the tubes thin to let the cloud carry the butterfly's shape.
- Demo camera: fitted shots (kit `fitShot` on the visible trail), a slow orbit, a push-in that faces the fork from
  azimuth ~1.07 rad (the parting direction is mostly along Lorenz y, so this view shows it left/right), then a pull
  back. `scene.config.js` replays the rig with `framingReport` and throws if a bead or the drawn trail leaves the
  window above the caption or touches the badge corner / dial.

## Sound palette (all from the plan)
- `pluck` per bead every 0.25 s, pitch = bead height (snapped pentatonic, 196 Hz centre). Coral and twin share the
  pluck seed, so while together they are one doubled note (unison) and the growing detune turns into a slow beat;
  after the split two separate lines.
- A warm `pad` bed (98 Hz, fifths); an outward `whoosh` at the split; at the cloud a `pad` swell (maj9), a quiet
  `sparkle` and 16 quiet plucks sampled from cloud beads (pan by x).
- Measured, never listened to: mean about -21.6 dB, max about -3 dBFS.

## Tuning knobs
- `spec.world.scale`, `lift`; `spec.tube`: `radius`, `radial`, `every`, `taper`, `strandOffset` (1.1: a hair of
  gap avoids z-fighting at the contact line), `twist`, `open` [w0, w1], `ramp`, `trail` [[t, tau]], `thin` [[t, scale]].
- `spec.bead.radius`; `spec.cloud`: `bead`, `tail`, `tailWidth`, `pop`, `colors`.
- `spec.sim`: `knots` (playback rate), `start`, `preroll` (narrow it around the found window to keep load fast),
  `dir`, `split` (tol, sep, forkTau, forkX, minSwitches, minTogether, agreeLead, agreeMax, crossWin, rejoinMin,
  rejoinAfter, delta, ratio), `cloud` (count, radius, lead, seed, h).
- `spec.gauge` (`max`, `power`), `spec.caption`, `spec.sound`.

## Good for / avoid for
- Good for: sensitivity to initial conditions, chaos and forecasting limits, "same rules, different outcomes",
  ensembles / many runs of one model, divergence of two nearly equal systems, any 3D flow drawn as a path.
- Avoid for: anything needing a predictable or repeating path, flat diagrams, dark neon looks (the style is built for
  a pale studio), very long trails (the wings' inner spirals become dense coils).

## Known limitations
- Changing the beat times or the rate knots changes which window/delta the search picks (or makes it fail): re-record
  `RUN_HASH` and re-tune the fork camera keys. The search tries windows in preroll order; a wide preroll range can
  take ~3 s at load.
- The strand is a display layout: inside the strand the twin is drawn on the coral's path, half a tube to the side.
- Near the wing centres the paths spiral slowly; with a fast end-rate they draw dense coils (thinned in beat 5).
- Tubes that touch tangentially z-fight along the contact line (stair-stepped seams, seen with strandOffset 1.0);
  1.1 leaves a hair of gap. Where unrelated tube segments cross at grazing angles, small seams can still show in
  close-ups.
- The cloud's coverage breathes (beads bunch when they pass the slow region near the origin).
