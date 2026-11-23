# Schlieren (`schlieren`)

**Look.** An optics bench in a dim lab: a large round mirror (2.1 m, toy scale) in a black anodised cell on a yoke, a
candle on a brass post in front of it, a razor blade on a small micrometer stage near the camera, and a navy back wall
with a soft pool of light behind the mirror for rim separation. With the blade out the disc is an even, glowing ivory
field showing only the candle's silhouette and its flame. Slide the blade into the focus (its edge lights up) and the
disc dims to an even grey; then the "still" air above the flame appears as a plume drawn in cream light on one side and
near-black navy on the other, smooth near the flame and rolling higher up. Neutral tone mapping, bloom only on the flame
and the lit blade edge, overlay caption chip (ivory plate, knife-edge icon, orange rule) with exact colours.

Motion type: art-directed. The plume is a procedural flow, a closed form of position and t, not a fluid solve: a
gaussian warm column that widens and fades with height, a slow sway, "rolling" = a domain warp by 3D value noise
advected upward at the rise speed plus travelling bulges, switched on above a transition height that falls during
beat 3 (art-directed: smooth first, then rolling). The breath push is a closed form: a gaussian puff (in time and
height) integrated along each rising parcel's path gives an erf expression for the sideways displacement D(y, t); its
vertical shear adds extra rolling (the "eddies"). The picture is the plume's SIDEWAYS rate of change ∂n/∂x (central
difference), which is what a vertical knife edge selects, soft-clipped onto light/dark around grey. Not physically
calibrated: no real refractive-index values, no optics model of the knife cut (field level and plume contrast are
eased keys), the breath jet is a drawn streak.

**Good for:** hidden processes and disturbances made visible ("it was always happening, you just couldn't see it"),
heat, airflow, invisible influence, before/after reveals, "the right instrument shows what the eye misses".
**Avoid for:** anything needing numbers, bright cheerful topics (it is a dim set by design), many simultaneous subjects,
long text. Overlaps in theme with cloud-chamber, thermal-camera and uv-reveal ("invisible made visible").

## Planner (Node-safe): `plumeplan.js`
- `createPlumePlan(cfg)` → `{ lamp, bladeX, cut, field, gain, rollY, strawX, jet, jetFront, seamX, D, uniformsAt(t), events({ end }) }`.
  `uniformsAt(t)` is everything the disc shader, blade, flame and straw need; `events()` is the sound plan.
- `puffDisplacement(y, t, puff, v)` closed-form breath push (same formula as `puffD` in GLSL); `erf(x)` (A&S 7.1.26).
- `PLUME_GLSL`: value noise, `erfA`, `puffD`, `plumeN` (plume density), `jetN` (breath streak), `schlierenS` (∂n/∂x).
- `flameTip(spec)`, `flicker(t)` (sum of incommensurate sines), `keyed(keys, t)`.
- SCORE comes from `plan.events()`: lamp click + swell, blade servo + scrape, a tick when the edge crosses the focus, a
  clack when it stops, overlapping airy whooshes from the reveal on (level follows reveal + rolling), straw whoosh,
  breath puff, four swirl whooshes as the pushed segment rises, the seam whoosh and a low chime.

## Props (`style.props`)
| prop | what |
|---|---|
| `schlierenBench(plan)` | everything below, added to the scene; `update(t)` sets every uniform and pose from `plan.uniformsAt(t)` |
| `mirror()` / `discMaterial()` | lathe-profile cell + back + yoke + post; the glass disc carries the schlieren ShaderMaterial (casts each pixel's camera ray to the candle's plane, so the plume stays on the flame from any camera) |
| `candle()` / `flameMaterial()` | brass post + dish, wax with a melted cup, wick, additive fresnel flame, glow sprite, flame point light; `userData.set(flicker)` |
| `knifeEdge()` / `razorShape()` | post, micrometer stage (orange knob), sliding carriage + razor blade (slot cut-out), edge line that lights at the focus; `userData.set(edgeX, cut)` |
| `straw()` | white straw with a red band; `userData.set(tipX, visible)` |
| `pinholeLamp()`, `boxCamera()` | small set props near the focus (kept out of the demo's frames) |
| `lab()` | optical table + rail + unlit gradient wall; `caption()` overlay chip |

**Signature motion.** The disc switches from ordinary view to schlieren view: even grey, then a light/dark plume rising
from the flame, smooth and then rolling; a breath kinks it and the kink rises away; a seam splits the disc into ordinary
view (left) and schlieren view (right).

**Sound palette.** Low pad bed (55 Hz, fifth + octave, 480 Hz low-pass), lamp click, servo + high rustle for the blade,
tick/clack, low airy whooshes (q 0.55, pitch 0.55) panned left/right, a low falling whoosh for the breath, short swirl
whooshes, a brighter seam whoosh, a soft low chime. Measured, not listened to.

**Knobs (spec.js).** `mirror.{bright, grey, light, dark, contrast, room, bevel}` (field colours + schlieren gain;
contrast 0.22 keeps the upper plume unsaturated), `plume.{v, w0, spread, decay, rollScale, rollAmp, rollGrow, rollTop,
rollLow, pulseLen, evolve, sway}`, `puff.{sigT, sigY, A, jet}` (A 1.5 m/s → ~0.3 m push), `blade.{w, h, y, z, focusX,
spot, from, to, glint}`, `straw`, `candle`, `flame`, `wall.{base, glow, glowAt, glowR}`, `caption`.

**Limits (hit while building).**
- A round subject in 16:9 leaves the sides dark; the disc sits right of centre so its rim clears the top-left caption
  chip (scene.config.js gates this: the build throws if a rim point enters the chip). The left third is navy wall.
- The plume reads more like soft smoke than the crisp filaments of a real schlieren photo near the flame (the laminar
  base saturates to solid light/dark halves); the upper part shows gradients.
- The puff's push is a pure sideways shift of each parcel: the kinked segment is stretched into a thin sheet at its
  tip, and "eddies" are extra noise warp from the shear, not shed vortices.
- The knife's cut is not an optics model: field dimming follows the edge over an art-directed 0.12 m "spot", and the
  plume contrast is held at zero until beat 3 so beat 2 reads as even grey.
- The disc shader evaluates 4-octave value noise 9× per pixel; fine at 1080p on the M1 Pro.
- Fonts are the OS's system stack (Avenir Next / Helvetica Neue).
