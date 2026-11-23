# Pottery Wheel

**Look.** A potter's wheel in a sunlit plaster studio. Wet, glossy grey-brown clay spins on a steel wheel head (turned
rings, pencil centring marks, a dried clay smear) inside a pale sage splash pan with dark slurry pooled in it. Behind it a
warm plaster wall carries the window's sheared light patch, and two shelves of finished glazed pots sit soft in the depth
of field. The clay is ONE surface of revolution whose profile is a pure function of t: it morphs between named key
profiles (lump, cone, opened cylinder, bowl, collar, vase) bottom-up like a real pull, its volume held constant so it is
always visibly the same clay. A wooden kidney rib on a long dowel rides the wall where the profile is changing fastest;
at the end the wheel slows and a brush lays a deep teal glaze on in a helix from foot to lip, breaking warm at the lip.
Bright, warm, tactile; neutral tone mapping so the palette reads as designed.

**Good for:** "same thing, reshaped" stories — fine-tuning, refactoring, iteration, one resource many uses, training as
shaping, craft and patience, before/after transformations of a single object, product evolution.
**Avoid for:** many objects at once, hard-edged or mechanical subjects, data-heavy explainers (one hero, one silhouette),
anything that needs text on the object.

## Files
| file | what |
|---|---|
| `spec.js` | every look number: palette, lights, key profiles (`keys`), counts, volume, wobble, spin, streaks, glaze, tool/brush, set, caption, sound |
| `throw.js` | **the planner** (pure, Node-safe): `keyProfile`, `volume`, `createPlan(S, P)` → `profileAt(t)`, `spinAngle(t)`, `wobbleAt(t)`, `toolAt(t)`, `glazeAt(t)`, `brushAt(t)`, `extent(t)`, `events()`; `wheelVoices(SND)` for `scoreFromEvents` |
| `style.js` | turns the plan into pictures (props below) |

## Props (`style.props`)
| prop | what | per-frame |
|---|---|---|
| `room()` | plaster wall with painted sun patch, pale plank floor, two shelves of lathe pots | static |
| `wheel(plan)` | steel head (marks turn with `spinAngle`), slurry disc sized to the foot, splash pan, slurry pool, body | `update(t)` |
| `clay(plan)` | one grid mesh (profile points × 144 angles): positions, FD normals, vertex colours (slip streaks, glaze helix) and a per-vertex gloss attribute rewritten from the plan | `update(t)` |
| `rib(plan)` | wooden kidney rib oriented to the wall tangent at `toolAt(t)`; its dowel is `rib.userData.handle` (add it to the scene) | `update(t)` |
| `brush(plan)` | flat glaze brush at the glaze front on the left silhouette; handle `brush.userData.handle` | `update(t)` |
| `caption()` | overlay chip, bottom-left, throwing-spiral mark; `userData.show(text, alpha)` | per label |

`style.dof` is a depth-of-field pass that follows the camera-rig target (`relativeAperture`), so the shelf pots blur.

## Signature motion (the plan)
- **Profile morph.** Each key profile = outer polyline (foot → lip) + inner polyline (lip → floor at the axis), smoothed
  by Catmull-Rom and arc-length resampled per part (10 + 132 + 104 points), so point k of every key is the same bit of
  clay. A segment `{ t0, t1, from, to, via?, stagger }` moves every point with its own eased progress
  `u_i = ease(u(1+w) − w·λ_i)` (λ = height fraction): the foot moves first, the lip last, like a pull. `via` makes the
  move a quadratic Bézier per point through a third key (bowl → collar → vase in one continuous move).
- **Volume.** Every frame the profile is rescaled radially so the Pappus volume equals `profile.volume` (0.27 m³).
- **Spin.** rps is constant, then eases down; the angle is its closed-form integral. Slip streaks and the centring wobble
  (3 sine lobes + an off-centre offset) are fixed to the clay angle θ + φ(t); the wobble amplitude damps to 0 while centring.
- **Throwing rings** grow in during the pull (uneven amplitude) as a displacement along the profile normal.
- **Rib** contact = velocity-weighted centroid (|dP/dt|⁴) of the outer wall; with no motion it eases to mid-wall. It
  slides in/out with the tool windows.
- **Glaze** = a helix front in λ (`front + spiral·saw(θc)`), so it reads as brushed on while spinning; ridges and the lip break warm.

## Sound palette (all from `plan.events()`)
`pad` bed (C, warm) · `whir` wheel hum pitched by rps (`hz0 + hzPerRps·rps`, glides down as the wheel slows) ·
`squish` slaps while centring (softer as the wobble damps) and at each shaping contact · `squish`+`rustle` squelch where
the profile moves fastest · soft `whoosh` as the rib comes in/out · `rustle` brush stroke once per wheel revolution while
glazing · `marimba` arpeggio + `chime` when the glaze is done.

## Knobs
`keys.*` (add your own shapes; same outer/inner convention), `profile.volume / stagger / rings / ringAmp`, `wobble.amp /
offset / terms`, `spin.rps / endRps` (keep ≤ ~1.2 rps at 30 fps or the lobes strobe), `streaks`, `glaze.soft / spiral`,
palette `clay*` / `glaze*`, `tool.azimuth` (= −camera azimuth so the rib sits on the right silhouette), `brush.azimuth`
(≈ π − camera azimuth), `dof.relativeAperture`, `sunPatch`.

## Limitations (hit while building)
- The clay mesh is rewritten on the CPU every frame (~35k vertices): fine for one hero, not for a row of pots.
- The rib and brush azimuths are tied to ONE camera azimuth; a big orbit puts them off the silhouette (they would float).
- Shapes must keep the outer/inner convention; a key whose inner wall crosses the outer wall (too-thin walls) self-intersects —
  the volume normalisation rescales radially and can thicken or thin walls of keys whose natural volume is far from the target.
- No real hands: the tool on a dowel stands in for them.
