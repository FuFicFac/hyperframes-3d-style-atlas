# Snap-Through (`snap-through`)

**Look.** A bright workbench test rig at toy scale (the strip spans 2.6 m, about 6x a real bench demo). A thin
tempered-blue spring-steel strip is clamped flat between machined steel jaws (two hex cap screws each) on two
aluminium pedestals, bowed upward into a shallow arch; its ends poke 2 cm out of the jaws. A dark steel base plate,
light maple worktop (kit `woodTexture`), pale wall. A small aluminium tray with a saddle block and a chrome post rides
the crown; slotted brass weights (slots turned to the wall) stack on the post. A dial gauge under the crown reads the
deflection through a chrome plunger that touches the strip's underside: white face, graduations only (no numerals), a
pale blue band up to a bold red wedge at the limit point, red band beyond it, black needle with a red tip. A ready
stand with seven weights on the bench at the left front. Neutral tone mapping, room environment, warm key from the
front-left, cool rim, light vignette, no bloom, no grain. One white overlay caption plate, top centre, with a tiny arch
icon that flips when the arch does.

Motion type: analytical with art-directed transitions. The static crown heights are exact solutions of the shallow
two-bar (von Mises) arch load curve `Q = v^3 - v` (the textbook bistable force-deflection curve, normalised; not a
clamped elastica, see Limits); the snap happens at that curve's limit point. The settles after each load step and the
ring after the snap are closed-form damped springs with hand-picked stiffness/damping (art-directed timing, not derived
from the strip's mass or stiffness), and the 0.1 s creep into the limit point is an eased blend. The weights' hop is
ballistic (free fall under a toy-scale g = 36 m/s^2, contacts with the moving tray found numerically in the planner,
restitution 0.55); the stack moves as one body with a small art-directed fan-out and wobble while airborne. Weight
placements and removals are eased Bezier carries (no hand) plus a free-fall drop down the post.

## Planner (`snap.js`; `style.plan` / `style.motion`; THREE-free, Node-safe)
| call | what |
|---|---|
| `QMAX`, `V_LIMIT`, `loadOf(v)`, `nearBranch(Q)`, `farBranch(Q)` | the load curve, its limit point and the two stable branches (bisection, exact to double precision). |
| `createPlan({ rig, schedule: { lands, lifts }, end })` | `{ v(t), crown(t), trayTop(t), postTop(t), profile(s), onTray(t), dial(t), dialLimit, pose(d, t), air(t), stackBottom(t), snapT, snapGo, stickT, steps, levels, hops, arcs, place, remove, events() }`. The first landing past `QMAX` is the snap; throws if the schedule removes more than it placed or empties the ready stack. |
| `snapVoices(spec.sound)` | voices for `kit/schedule.scoreFromEvents`: `tone` (rising held pad, one segment per load level), `after` (low minor pad after the snap), `pick`, `clink`, `lastClink`, `snap`, `hop`, `lift`, `setDown`. |
| `panOf(rig)` | event -> stereo pan from x. |

Demo levels (weight = Qmax / 5.05): v = -1, -0.959, -0.913, -0.856, -0.781, -0.624 (five weights, 99 % of the limit),
then the sixth weight -> far branch 1.178; removals walk it back only to 1.153 ... 1.000. The dial turns one revolution
per 3 rises: 0 deg -> 45 deg before the snap (red mark at 50.7 deg), whips to ~336 deg in the ring, settles ~261 deg.

## Props (`style.props`)
| prop | what |
|---|---|
| `rig(plan)` | builds and adds everything; `{ group, strip, tray, weights, gauge, update(t) }`. |
| `bench()` | maple worktop (top at y = 0) and the wall. |
| `frame()` | base plate, pedestals, lower/upper jaws, cap screws + washers, ready stand + post (static). |
| `strip(plan)` | one segmented box (160 segments) re-bent from `crown(t)` each frame (shape `(1 + cos(2 pi s / span)) / 2`, zero slope at the jaws) + 3 translucent ghosts of earlier shapes, shown only while it snaps. |
| `tray(plan)` | saddle, tray plate with rim, chrome post + knob, riding the crown. |
| `weights(plan)` | seven slotted brass discs (extruded shape with hole + slot, bevelled) posed from `plan.pose(d, t)`. |
| `gauge(plan)` | dial body, canvas face (drawn once), bezel, glass, needle (= `plan.dial(t)`), stem, sliding plunger + contact ball, column + foot. |
| `caption()` | overlay plate; `userData.show(text, alpha, flipped)`. |
| `helpers.shake(t, plan, amp)` | decaying camera jolt after the snap, from t only (scene adds it to the rig pose). |

## Signature motion
- Each weight rises off the ready stand, crosses high (clear of the pedestals), hovers over the post and drops onto
  the stack with a clink; the arch settles a hair lower and the needle creeps toward the red wedge.
- The sixth weight lands; 0.1 s later the strip snaps through (ghosts trail it), rings, the stack flies off the tray
  and bounces (5 planned contacts in the demo, stuck after 0.5 s), the needle whips almost a full turn and the camera jolts.
- Lifting every weight off leaves the strip flipped; the needle stays deep in the red.
- Camera: one move per beat, locked holds (front-right 3/4 -> closer, lower front for the snap -> orbit to front-left).

## Sound palette
Rising held tone: one `pad` segment per load level (110 Hz open fifth, up one semitone and a little brighter per
weight); `tick` on pick-up; `marimba` (G6 region, short decay) + `click` per landing; at the snap `clack` + `click` +
`thud` + two `pluck`s (steel ring, 392 / 588 Hz); `marimba` + `click` per stack contact scaled by impact speed; after the
snap a low minor `pad` (D2); `tick` per lift and a lower `marimba` per set-down. Demo measured: mean -25.9 dB, max
-1.6 dBFS. Measured, never listened to.

## Tuning knobs (`spec.rig`, `spec.sound`)
- `rise`, `span`, `clampY`; `weightsToLimit` (5.05 = five hold, the sixth snaps; 4.05 snaps on the fifth).
- `settle` / `snap.spring` stiffness + damping (ring frequency and decay), `snap.creep`.
- `g`, `hop.restitution`, `hop.stickSpeed`, `hop.spread/tilt/spin` (airborne look), `post.height` (keep above the hop).
- `flight.place/remove/hover/arc/liftShare`; `dial.rev` (rises per needle turn), `dial.r`.
- `ghosts.count/step/window`; `sound.*` levels, roots and steps.
- Scene: `SCHEDULE = { lands, lifts }` — everything else (levels, snap time, hops, dial, score) follows.

## Good for / avoid for
- Good for: thresholds and tipping points, "nothing, nothing, then everything", hysteresis / no way back, decisions
  and commitment, phase changes, bistable switches and memory bits, load and failure.
- Avoid for: gradual or reversible change (the look IS the jump), real numeric loads (the dial has no numerals),
  dark or sombre topics.

## Known limitations
- The load curve is the shallow two-bar (von Mises) arch, drawn on a strip with a clamped cosine shape. A real clamped
  strip snaps through an asymmetric mode and its limit load differs; the shape here stays symmetric throughout.
- Strip length is not conserved (the shape just scales); the thickness offset is vertical, not along the normal.
- The ring frequency/damping and the settle are chosen for readability at 30 fps (3.1 Hz ring), not computed from
  the steel; the hop uses g = 36 m/s^2 (about 3.7 g at toy scale).
- The stack hops as one rigid body (discs fan out a little by art direction); the top disc rises at most 4 cm above the post
  top in the demo, which is not checked if `post.height`, `g` or `restitution` change.
- The dial plunger pushes nothing (its force is not in the model). Weights are carried by an invisible hand.
- Flights are verified clear of the pedestals only for the demo schedule (scratch check, not built into the planner).
