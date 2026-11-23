# Tensegrity (`tensegrity`)

**Look.** A bright studio table (cool off-white top) under a soft blue sky sweep. A three-level tower of pale wooden
struts (kit wood texture, grain along the strut, small brass caps at every end) held only by red cords, toy scale (about
3.3 m tall, struts 7 cm thick, cords 2.6 cm) so one cord reads at 1080p. No strut touches another. A small brass weight
(lathe body, knob, steel band, a three-armed brass spider) and a pair of steel snips with teal grips wait at the side.
Cords are unlit red until they "carry": then they turn hot red-orange with a soft red haze (an alpha glow sleeve that
still reads over the white table). Neutral tone mapping, room environment, warm key from front-left with soft shadows,
cool rim, bloom only on HDR flares (threshold 4), light vignette, no grain. One white overlay caption plate, top left,
with a tiny strut-and-cord icon (exact colours).

Motion type: mixed. Analytical/numerical statics for the shapes: the standing pose (P1), the loaded pose (P2) and the
pose after the cut (P3) are each SOLVED in `tower.js` by damped relaxation (a fixed number of steps on plain arrays, no
RNG) of nearly rigid struts, tension-only elastic cords, pinned feet and, after the cut, a stiff strut-to-strut contact
repulsion; every cord's tension comes from the same solve. Art-directed: the press is an eased, slightly bouncing blend
P1 -> P2; the slump runs along the solver's own heavily damped descent P2 -> P3 (recorded, resampled by distance) on an
eased clock, so its path is plausible but its timing is not a rigid-body simulation (no inertia, no real time scale).
The weight's and the snips' flights, the cut ends' recoil and the glow pulse are art-directed. Tension units are the
solver's own (EA = 700); nothing is calibrated to a real model.

## Signature mechanic (`tower.js`, THREE-free, Node-safe)
- Topology: `levels` twisted three-strut prisms (strut B[j] -> T[j+1], "vert" cord B[j] -> T[j]); each level reaches
  down into the one below (`overlap`) and is hung from it by a zig-zag ring of six cords; one top triangle closes it.
  Minimal: every cord is needed, so one cut releases the prestress and the shape must find a new balance.
- Prestress: cord rest length = `prestrain` x first-guess length; the solve settles the real standing shape (P1).
- Load: the weight is shared by the three top nodes (P2). Cut: cord `cut` removed, contact on (P3). In the demo the
  three top struts end up resting on each other (contacts 6-7 and 6-8): "three struts finally touch".
- Glow ~ T / Tmax (Tmax = largest tension in P2); light-up order bottom -> top; a pulse when the weight lands.
- Pluck pitch = root x sqrt(T / Tmax) x (refLength / L) (an ideal string: f ~ sqrt(T) / L).
- Contacts are found in P3 (gap < 2 strut radii + tol); each gets the time it closes along the slump.

## Good for / avoid for
- Good for: interdependence, distributed load, "every part carries a share", resilience vs fragility, why removing one
  small piece changes everything (single points of failure, keystone ideas), systems thinking, team or network metaphors.
- Avoid for: anything needing exact engineering numbers (units are the solver's own), long static holds (the camera must
  carry still beats), dark or sombre looks, more than ~4 levels (solve time and a very tall subject in 16:9).

## Planner (`tower.js`; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `buildTower(T)` | `{ X0, fixed, struts [{a,b,L0,lv}], cords [{a,b,kind,lv,rest}], topNodes, n }` (kinds: vert, ring, top, optional diag). |
| `relax(model, X, { S, iters, load, cut, contact, damp, snapEvery })` | the static solver; `{ X, snaps }`. |
| `tensions(model, X, S, cut)` / `strutGaps(model, X)` / `strutPair(model, X, i, j)` | tension per cord, strut gaps and contact points. |
| `createPlan({ tower, timing, end })` | `{ P1, P2, P3, T1..T3, Tref, nodes(t), tension(t), glow(t), lit(t), contacts, cutPoint(t), cutHalves(t), weight(t), snips(t), topFrame(X), contactAt(X, c), pitch(T, L), events() }`. ~0.15 s in Node. |
| `towerVoices(spec.tower.sound)` | voices for `kit/schedule.scoreFromEvents` (bed, pluck, strum, lift, land, snipsMove, snipsOpen, snip, knock). |
| `panOf(radius)` | event -> stereo pan from x. |

## Props (`style.props`)
| prop | what |
|---|---|
| `rig(plan)` | builds and adds table + tower + weight + snips; `{ group, table, tower, weight, snips, update(t) }`. |
| `table()` | the studio table top (ground plane). |
| `tower(plan)` | InstancedMeshes: struts (exact length about the node midpoint; tinted when touching), brass caps, cord segments (straight when taut, parabolic sag when slack, colour by glow), glow sleeves (alpha haze shader), plus the two cut ends and contact flares. |
| `weight(plan)` | brass weight; spider arms reach out to the top nodes and ride them after landing. |
| `snips(plan)` | two steel blades + teal grips on a brass pin; opening the blades opens the handles; poses from `plan.snips(t)`. |
| `caption()` | overlay plate, `userData.show(text, alpha)`. |

## Signature motion
- Beat 1: slow orbit, low and front-left, the tower large and right of centre, the props on the table at the left.
- Beat 2: cords light bottom -> top, one pluck each; brighter where tension is higher.
- Beat 3: the weight lifts, travels high, settles on the top nodes; the tower dips ~7 cm with a small bounce; every
  cord flashes, then settles to its solved share; a strummed chord at the new tensions.
- Beat 4: close-up from outside-above the cut cord: the snips arrive from below, open, close; the cord parts and the
  two ends recoil and drop.
- Beat 5: the camera pulls back as the top level slumps along the solved path; two white flares where struts meet;
  the three touching struts warm to orange; the remaining cords glow at their new (uneven) tensions.

## Sound palette
`pluck` (Karplus-Strong) per cord as it lights, pitched from its solved tension and length; a `pluck` strum of the
distinct pitches at the press and a lower, detuned strum (20 distinct pitches, darker, shorter) after the slump;
`thud` + `clack` when the weight lands; `whoosh` on the flights; `click` + high `clack` + a short bright pluck for the
snip; `marimba` + low `clack` knock per strut contact; two `pad` beds (a fifth/octave chord, then a lower, detuned one
from the cut). Demo measured: mean about -26 dB, max -1.6 dBFS. Measured, never listened to.

## Tuning knobs (`spec.tower`)
- Shape: `levels`, `H`, `overlap`, `radius`, `twist`, `step`, `prestrain`; `solver.EA` (cord stiffness) and `load`.
- Which slump: `cut` (index into `cords`; the top cords 21-23 give the "three top struts touch" result with the demo
  numbers; ring and vertical cuts mostly collapse a whole level or tip the top over — search before changing).
- `solver.*`: steps, damping, `snapEvery` / `pathStates` (slump path resolution), contact stiffness.
- `glow.*` (dim/lit/hot colours, haze radius/level/falloff, pulse), `contactGlow.*`, `sag.segments`, `recoil`.
- `weight.*`, `snips.*` (home, rest, tilt of the blade plane, bite, open angle, flight arc), `sound.*`.

## Known limitations
- The slump is a damped (overdamped) descent between two solved poses, not dynamics: no inertia, no swing, no time
  scale; positions between recorded states are linear interpolations (struts are drawn at their exact length about the
  midpoint of their two interpolated end nodes, so caps can sit up to ~1-2 cm off a strut end mid-slump).
- The demo topology is minimal; most cuts (rings, verticals) give a large collapse with the top tipped well over. Small
  parameter changes can change which struts touch — re-run the planner and check `plan.contacts`.
- Contact is a stiff repulsion between strut axes at two strut radii; struts can graze each other's caps; friction is
  not modelled. The weight is a load at the three top nodes only (no tipping or sliding of the weight).
- "Every cord brightens at once" in beat 3 is the art-directed pulse; the solved shares barely change under this small
  load (the verticals of the bottom level actually relax slightly, which the steady glow after the pulse shows).
- Cords are straight cylinders when taut; the sag of slack cords is a parabola from the rest length (no catenary).
- Tall subject in 16:9: the wide shots leave the left third to the props and the caption.
