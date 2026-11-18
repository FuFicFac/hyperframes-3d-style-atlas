# Mousetrap Chain (`mousetrap-chain`)

**Look.** The classic chain-reaction demonstration on a bright blue sports-hall floor with white and yellow court lines.
A neat grid of generic toy-scale spring traps (pale wooden board, yellow pedal, steel spring, red paddle hammer in a wire
frame; no brand, no markings), each loaded with two white ping-pong balls. One orange ball is bounced in. Traps are
~5.5x real size (0.34 x 0.56 m) and balls ~4x (r 0.075 m) so a single ball reads at 1080p. Neutral tone mapping, soft
sun + sky fill, hard readable ball shadows on the floor; no grain, no bloom. A snapped trap flips its red paddle from the
back half onto the yellow pedal, so the floor changes from yellow-fronted to red-fronted trap by trap: the spread of the
reaction is readable as colour even in the wide shot. UI is on the overlay (exact colours): one cream caption chip and a
dark dot-chart panel.

**Signature mechanic.** A branching cascade planned once by `cascade.js` (THREE-free, seeded, event-driven):
- a landing on a set trap **snaps** it (generation = the ball's generation + 1) and throws its two balls;
- each thrown ball is **aimed at a set trap nobody else is aiming at** (near the first trap for the early generations, so
  a close camera can follow), so generations double — 1, 2, 4, 8, 16 — until set traps run out; after that balls are
  lobbed free, high and wide (the eruption);
- every leg is a **closed-form ballistic arc**; after its first landing a ball takes up to three damped bounces and a
  decelerating roll to rest. `plan.ballAt(i, t)` and `plan.trapPose(i, t)` are pure functions of `t`;
- balls of the first `cleanGens` generations steer their bounces into the aisles so the doubling stays exact while it
  is countable; later balls may trip traps by accident;
- the last ball to land gets a long dribble (the coda) before silence; resting balls are pushed apart once at plan time
  so none interpenetrate in the final frame;
- the same plan gives SCORE (one snap per trap + ball ticks, binned), the beats, the camera lock time and the dot chart.

## Good for / avoid for
- Good for: exponential growth, virality, chain reactions, cascading failures, "one input triggers everything", tipping
  points, compounding, and "growth stops when the fuel runs out".
- Avoid for: anything that needs numbers or text in the scene, precise mechanisms (marble-run, clockwork), ordered
  sequences where each step matters (domino-run), calm or premium subjects — this style is busy by design.

## Planner (`cascade.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `planCascade(STYLE_SPEC, overrides?)` | runs the simulation; `overrides` = any key of `spec.cascade` (`seed`, `first`, `t0`, `flight`, `cleanGens` ...). Returns the plan. |
| `plan.ballAt(i, t, out?)` | `{ x, y, z, on }` — ball i at time t (`on` false = the dropped ball before it enters). |
| `plan.trapPose(i, t, out?)` | `{ dx, dy, dz, yaw, angle }` — hop, permanent small shove and hammer angle of trap i. |
| `plan.countsAt(t)` / `plan.counts` / `plan.gens` | traps snapped per generation at t / in total / their snap times. |
| `plan.genTime(k)`, `plan.airborneAt(t)`, `plan.tEnd`, `plan.sprung`, `plan.coda`, `plan.first` | timing hooks for beats, camera lock and gates. |
| `plan.events` | `[{ t, kind: "snap", trap, gen, x, z } \| { t, kind: "tick", ball, speed, x, z, on, n }]`. |
| `plan.track(i)` | `{ id, r, t0, at(t) }` for `kit/schedule.minSeparation`. |
| `soundEvents(plan, { snapBin, tickBin, minSpeed })` | thinned events (one per time bin, with `count`) for `scoreFromEvents`. |
| `cascadeVoices(spec.sound)` | voices map: snap = `clack` + short `thud`; tick = `pop` (on a trap) or `tick` (floor). |
| `trapLayout(S)`, `gridBox(S, margin, top)`, `hammerAngle(tau, S)` | layout, framing box, paddle swing. |

## Props (`style.props`)
| prop | what |
|---|---|
| `cascade(plan, { floor })` | everything: floor + traps + balls, added to the scene; `.update(t)`. |
| `floor({ size })` | blue floor plane + white boundary box and yellow outer box round the trap field. |
| `traps(plan)` | five InstancedMeshes (board, pedal, spring, wire, paddle) sharing one pose; `userData.update(t)`. |
| `balls(plan)` | one InstancedMesh, per-instance colour (the first ball orange); `userData.update(t)`. |
| `caption()` | overlay chip; `userData.show(text, alpha)`. |
| `genChart(plan)` | overlay panel: one cluster of dots per generation, a dot lights when its trap snaps (no numbers); `userData.show(t, alpha)`. |

## Signature motion
- Snap: paddle swings 180 degrees in 0.085 s with a small rebound; the board hops 7 cm and stays slightly out of line
  (the finished floor looks disturbed, not reset).
- Throw / bounce / roll: ballistic arcs under real g (9.81 m/s2). On a ~5x scene that reads as the slow-motion footage
  this demonstration is known from.
- Camera: close on one trap -> follows the first two balls up -> one long pull-back to the whole floor -> LOCKED for
  the eruption -> one slow rise after the storm to the shot the finished floor fills.

## Sound palette
One `clack` (+ short `thud` body) per trap snap, `pop` for a ball on a board, `tick` for a ball on the floor, all from
`plan.events`, binned (20 ms snaps, 30 ms ticks, gain grows with the square root of the count, capped) with distinct
seeds, so the eruption is a dense roar rather than stacked identical hits. A soft `pad` bed that ends with the storm and
a low `rumble` under the eruption; the ending is the last ball's dribble, then nothing.

## Tuning knobs (`spec.js`)
- `grid` (cols, rows, pitch) and `trap` / `ball` sizes. More traps = longer doubling and a bigger storm.
- `cascade.t0`, `cascade.flight[]` (seconds in the air per generation: sets the cadence of the doubling),
  `cascade.reach[]` (how far from the first trap each early generation may land), `cascade.cleanGens`.
- `cascade.free` (height and range of the eruption lobs), `restitution`, `bounces`, `roll`, `coda`.
- `cascade.drop.hops` (how the first ball arrives), `cascade.first`, `cascade.seed`.
- `sound.snapBin` / `tickBin` / `minSpeed` (density cap), `chart` and `caption` geometry.

## Choices made (demo 78)
- 16 x 10 = 160 traps, 321 balls. Seated balls all white and the first ball orange: "one input" stays findable.
- The paddle is a solid red plate rather than a bare wire so set / sprung reads as a colour change at any distance.
- The dot chart shows traps snapped per generation; it is a picture of the doubling, not a statistic.

## Known limitations
- Balls do not collide with each other in the air or while rolling; only resting positions are separated. In the
  countable generations two balls can pass within a few centimetres (the demo's `NOTES.earlySeparation` reports it).
- Balls do not collide with paddles, springs or seated balls; a ball can rest on a sprung trap's paddle but its height
  follows the board, and a late ball can roll to a stop touching a set trap's seated balls until that trap snaps.
- A snapped trap's small shove is cosmetic: the height field balls ride on uses the unshoved boards.
- Generations after `cleanGens` are not exact powers of two (accidental trips); the last generation is whatever is left.
- Dense storm: hundreds of small moving balls cost bitrate. Keep the camera locked while more than a few dozen balls
  are in the air; the demo moves the camera only before the eruption and after it.
- Sound was measured (levels), not listened to.
