# Ripple Interference (`ripple-interference`)

**Look.** A shallow ripple tank on a dark walnut bench in a pale studio sweep (toy scale: the tank is 5 m x 3.4 m
inside, the wavelength 0.7 m, so a band of calm reads at 1080p). Clear turquoise water over a pale tiled floor; the
grout lines bend with every ripple (refraction) and the crests throw bright caustic bands on the floor. Two brass
dippers hang from dark driver housings on one brass bar across the back third; two corks with small red and yellow
flags float as markers. Crest faces catch a thin warm glint. Neutral tone mapping (the turquoise and the flags stay as
designed), room environment for the brass, warm key from front-left, cool side light, light vignette, no bloom, no
grain. Captions sit on one white overlay plate with an ink edge and a two-ring icon, top centre.

**Signature mechanic.** Two point sources; the water is their exact sum, a closed form in t (`ripple.js`):
- `h(x, z, t) = sum_i A(r_i) env_i(tau_i) cos(omega tau_i - phi_i(tau_i))`, `tau_i = t - r_i / c` (retarded time),
  `A(r) = A0 / sqrt(1 + r / r0)` (ring spreading), `env_i` = a smoothstep ramp from the source's start (the first ring
  is the wave front);
- source 2's timing `phi_2` slides `0 -> pi` (half a cycle). Because it is evaluated at the retarded time, the change
  leaves the dipper and travels outward at the wave speed: the still lines of calm sweep sideways across the tank,
  near the bar first, then past the corks;
- the corks sit on solved lines: A on the centre line (equal paths), B where the paths differ by half a wavelength
  (found by bisection). In step A bobs and B sits still; out of step they swap. The planner measures it
  (`ampAt`): demo values 0.037 m vs 0.002 m in step, 0.000 m vs 0.037 m out of step;
- the same formula is emitted as GLSL (`plan.glsl()`, constants baked in) for the water shader, and evaluated in JS for
  the corks (height + tilt from the gradient); the dippers follow the drive phase; one tap per dipper stroke
  (`psi = pi + 2 pi m`, found by stepping + bisection) feeds the score.

Motion type: analytical. Height = sum of two travelling ring waves, a closed form in t; corks and dippers ride the same
function. Not checked against a real tank: no wall reflections, no damping beyond the 1/sqrt(r) spreading, linear
superposition only, and the floor caustics and the crest glint are shading approximations (see Limits).

## Good for / avoid for
- Good for: coordination vs conflict ("two inputs in step add up, out of step cancel"), phase and timing, noise
  cancelling, interference and diffraction, antenna arrays / beam steering (slide the phase and the beam moves),
  ensembles and voting where timing matters, anything "the same two parts, a different pattern".
- Avoid for: more than two or three sources (the shader sums them per pixel; fine to ~4), long static holds (the look
  IS the motion), dark or sombre topics (bright toy look), real measured numbers (no data on screen).

## Planner (`ripple.js`; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `createPlan({ wave, tank, timing: { starts: [t1, t2], slide: { t0, t1, to } }, corks: { z }, end })` | `{ omega, k, c, sources [{ i, x, z, start }], phi, psi, env, amp, height(x, z, t), grad(x, z, t), dipper(i, t) -> { stroke, on }, corks [{ id, x, z, role }], taps [[t...] per source], ampAt(x, z, t0, t1), events(), glsl() }` |
| `plan.glsl()` | GLSL `rippleH(vec2 xz, float t)` with the same constants (the shader twin of `height`) |
| `rippleVoices(spec.sound)` | voices for `kit/schedule.scoreFromEvents` (`bed`, `tap`, `join`, `slide`) |
| `panOf(tank)` | event -> stereo pan from the source's x |

## Props (`style.props`)
| prop | what |
|---|---|
| `rig(plan)` | builds and adds everything; `{ group, bench, tank, water, dippers, corks, update(t) }` |
| `bench()` | walnut bench top (kit `woodTexture`) + pale cyclorama |
| `tank()` | four walls, glossy pale rim; inner box = +-halfX, +-halfZ |
| `water(plan)` | ONE plane (320 x 220 segments) + ONE ShaderMaterial: vertex displacement by `rippleH`, per-pixel normals by central differences of the same function, refraction to an analytic tiled floor plane (no floor mesh), caustic light `exp(K h)` at the floor point, absorption by path length (turquoise), Fresnel reflection of an analytic studio (sky gradient, soft panel behind the tank, side strip), sun specular, crest glint; `userData.update(t)` sets `uT` |
| `dippers(plan)` | brass posts + bar, driver housings, a rod + brass ball per source riding the drive phase (raised and idle before its start) |
| `corks(plan)` | speckled cork, pin, triangular flag (A red, B yellow); float on `plan.height`, tilt from `plan.grad` |
| `caption()` | overlay plate with a two-ring icon; `userData.show(text, alpha)` |

## Signature motion
- Beat by beat: rings from one dipper; the second joins and the still lines of calm open between bands of chop; low
  and close on the corks (one bobs, one is still); the timing slides half a cycle and the calm lines sweep sideways
  from the bar outward until the corks have swapped; pull back high over the whole tank.
- Camera: one move per beat (`kit/framing.fitShot` keys), locked holds, framing gate in scene.config.js.

## Sound palette
`marimba` tap per dipper stroke (left G4, right C5, gain 0.22, decay 0.12 s) + a tiny `bubble` drip, panned by the
source's x — the taps fall into unison in step and into alternation out of step; one `clack` when the second dipper
joins; a `whir` glide (180 -> 120 Hz) while the timing slides; a low `pad` (G2, 750 Hz cutoff) as the bed. Measured,
never listened to.

## Tuning knobs (`spec.wave`, `spec.water`, `spec.tank`, `spec.rig`)
- `wave.freq/lambda` (c = lambda x freq), `sep` (in wavelengths: 2 gives two calm lines each side in step), `A0/r0`
  (amplitude and spreading), `ramp`, `srcZ`, `dipAmp`.
- `water.absorb/scatter` (the turquoise), `caustic/causticMin/causticMax` (floor band contrast), `floorLight`,
  `sky/panel/strip/sun` (reflections), `glint.lift/power/shine` (crest light: lift = how far above the mirror
  direction, shine = how thin).
- `tank.tile` (grout spacing; the refraction cue), `tank.depth`, `segX/segZ` (displacement only).
- Scene: `TIMING = { starts, slide }` and the cork line `z`; everything else (corks, taps, score) follows.

## Known limitations
- Linear superposition with 1/sqrt(r) spreading only: no wall reflections (the walls are perfect absorbers), no
  dispersion, no damping; the dipper does not displace water itself (the source term does).
- Caustics are an approximation: floor light = `exp(K h)` of the height at the refracted floor point (the
  Laplacian of a ring wave is about -k^2 h), not traced light. The crest glint is art-directed and camera-relative
  (a lamp a few degrees above and right of each pixel's mirror direction) so crests catch light from any camera height.
- The water does not receive shadows (custom shader): the corks, rods and bar cast none on it. The refraction sees an
  analytic floor plane; rays that leave the inner box see a flat wall tone, not the real walls.
- With the phase slide evaluated at the retarded time, source 2 briefly runs at a lower frequency while it slides
  (that is what a timing change does); the slide is kept slower than the drive so the phase stays monotonic.
