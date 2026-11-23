# Vortex Rings (`vortex-rings`)

**Look.** A long glass tank with black walls, lit from the side. Its edges show as faint blue lines, and the light
sheet grazes the black back wall as a deep navy band. At the left end sits a red lacquered drum (3 m across, toy
scale) with brass hoops and tension rods, a cream face with a round hole and a cream skin at the back. A felt
mallet on a swing arm stands behind it. White smoke rings roll out of the hole to the right. The half of the smoke
roll that faces the lamp is warm white; the half turned away is cold blue. The drum and floor are lit by a warm key
from the front-top, a cold rim from behind and a weak hemisphere. AgX tone mapping, moderate bloom on the smoke, a
light vignette, no grain. One overlay caption chip sits top-left, with a small ring glyph.

Motion type: mixed. The NUMERICAL part covers each ring's radius, axial position, core size and roll angle. They
come from the thin-cored coaxial vortex-ring model, integrated once at page load with fixed-step RK4
(dt = 1/480 s). The terms:
- self-induced speed `G/(4 pi R)(ln(8R/a) - 1/4)`;
- Biot–Savart induction between the rings, from the Stokes stream function of a circular filament with
  elliptic integrals by the AGM;
- the core radius from `a^2 = (a0^2 + 4 nu tau) R0 / R`.

The rear ring tightening, threading the front one and the front ring spreading are not keyframed. They come out
of the mutual induction. The total impulse `sum G R^2` is conserved to about 1e-13 in the demo, which is checked
in the plan. The ART-DIRECTED part covers the rest:
- the smoke: sprites pinned around the core in a three-arm rolled sheet;
- the roll rate of sprites outside the core, which falls off as 1/rho^2, plus the ring's waviness;
- the puff-to-ring roll-up in the first 0.55 s;
- the wake;
- the mallet swing and the skin dimple (closed forms of the tap list);
- each tap's initial radius and circulation (the harder tap is simply given a smaller, stronger ring).

## Planner (`rings.js`; `style.plan` / `style.motion`; THREE-free, Node-safe)
| call | what |
|---|---|
| `ellipKE(k)`, `ringPsi`, `ringVel`, `selfSpeed` | the filament maths (AGM elliptic integrals; velocity = central differences of psi; checked against the on-axis closed form to 1e-6). |
| `createPlan({ rings: [{ launch, x0, R0, a0, G }], nu, dt, end })` | integrates once; `{ state(i, t) -> { alive, age, x, R, a, U, Ur, spin }, pass: [{ t, front, rear, Rrear, Rfront }], impulse: { start, end, drift }, table, speedRange(i) }`. It throws if a ring blows up. `state` interpolates linearly between stored steps. |
| `soundEvents(plan, { taps, step })` | `tap` per drum hit, `air` every 0.4 s per travelling ring (with relative speed), and `pass` 0.35 s before each threading. |

Demo numbers: soft tap R0 1.1, a0 0.2, G 2.4 (0.58 m/s); hard tap R0 0.715, a0 0.13, G 3.3 (about 1.3 m/s). The
threading happens at t = 9.69 s, where the rear ring has shrunk to 0.49 and the front ring has spread to 1.26.

## Props (`style.props`)
| prop | what |
|---|---|
| `smoke(plan, i)` | One `InstancedBufferGeometry` of 7600 camera-facing sprites per ring and one draw call. Per-sprite attributes are azimuth, roll phase, distance from the core (in core radii), size, level, and a wake shed time with its shed position (computed from the plan at build). The vertex shader places each sprite from the `(x, R, a, spin)` uniforms, stretches it along the roll direction and shades it warm/cold by the roll normal against `smoke.light`. Additive blending, no depth write. `update(t)` reads `plan.state(i, t)`. |
| `drum()` | shell, face with hole + dark throat + brass lip, hoops, rods, stand, mallet post/axle/arm/felt head, skin (ring geometry rewritten from t). `update(t, taps)`. |
| `tank()` | dark floor, back-wall shader (light-sheet band, panel seams, fade at the ends), additive glass edge bars. |
| `caption()` | overlay chip; `userData.show(text, alpha)`. |
| `helpers.malletAngle(t, taps, M)`, `helpers.skinDip(t, taps, dip)` | pure closed forms used by `drum.update`. |

## Signature motion
- Each tap makes the mallet swing in and the skin ring. A puff leaves the hole as a disc and rolls up into a ring.
- A ring travels with its smoke rolling round the core: inner side forward, outer side back.
- When two rings share the axis, the rear one tightens and speeds up, threads the front one, which spreads and
  slows, and then pulls ahead. Afterwards both relax toward their own sizes and the order is swapped.
- Camera in the demo, one move per beat:
  1. front three-quarter on the drum;
  2. track alongside the ring;
  3. pull back for the second tap;
  4. arc round to look down the line for the threading;
  5. long-lens (24 deg) wide of both rings.

## Sound palette
- Bed: a low `pad` (C2 open voicing, cutoff 520 Hz).
- Per tap: `thud` (lower for the soft tap) plus a short outward `whoosh` at launch.
- Per travelling ring, every 0.4 s: a soft `whoosh` whose gain and pitch follow that ring's speed from the plan.
- At the threading: `rustle` plus a low `whoosh`.

Measured on the demo, never listened to.

## Tuning knobs (`spec.rings`, `spec.smoke`, `spec.drum`)
- `rings.soft/hard` set R0, a0 and G per tap kind; `rings.nu` sets core growth (how fast rings slow);
  `launchDelay`, `x0`, `dt`.
- `smoke.count`, `size`, `level`, `streak`, `lit/shade`, `rhoMax/rhoPow` (smoke thickness), `arms/wind/armSpread/loose`
  (the rolled sheet), `spinScale`, `wobble`, `form`, `wake/wakeLife/wakeDrift`, `light`.
- `drum.mallet.raised/rebound`, `skinDip`; `wall.band/level`; `tank.edgeLevel`.
- Scene: `TAPS` (time, hard). Ring launches, the plan, the camera keys (fitted to the plan) and the score all
  follow from it. `scene.config.js` throws if the threading leaves the "through" beat.

## Good for / avoid for
- Good for: momentum and impulse, one action changing another, feedback between two agents, overtaking and
  leapfrogging, "a push that travels", signals and pulses, unintended consequences.
- Avoid for: bright cheerful topics (the set is dark by design), many rings at once (cost grows with the square of
  the ring count and the smoke turns to mush), exact physics claims (see below).

## Known limitations
- Thin-ring model: there is no core deformation, no ring tilt or instability, no merging and no turbulent
  break-up. Mutual induction is softened inside the cores (`d^2 / (d^2 + a_i^2 + a_j^2)`). The model was never
  checked against an experiment.
- Two coaxial rings that start this far apart pass cleanly, and their radii relax back afterwards. This is a
  property of the conserved-energy, conserved-impulse model, not a bug. So "each changed the other" is shown as
  the exchange during the pass plus the swapped order; the final sizes are not permanently different.
- The harder ring's smaller radius is an art-directed initial condition: the same hole does not really make a
  smaller ring.
- `state(i, t)` interpolates linearly between 1/480 s steps.
- The smoke is additive. It glows rather than occludes, so where the two rings overlap it brightens instead of
  hiding the far ring. Sprites seen edge-on (a ring at the frame edge on a wide lens) pile up toward white.
  The demo uses a 24 deg lens for the wide shot for this reason.
- The mallet strikes the back skin, which is mostly hidden from front three-quarter views. The tap reads by sound
  and by the puff.
- Never watched in motion at speed; judged from stills.
