# Photoelastic Stress (`photoelastic-stress`)

**Look.** A bright lab: an upright white light box, an aluminium loading frame (channel rail, two steel posts, crosshead,
screw press with an orange-knobbed handwheel) and a clear notched plastic beam on black rollers. A second polarising
sheet (the analyser, slim dark frame, orange pull tab) slides across in front. Where it covers, the light box turns deep
indigo-black and the beam shows its stress as interference colours: black where unstressed, then grey, white, straw
yellow, orange, red, violet, blue, green and again, paling at high orders. The colours come from a table integrated over
the spectrum, not a rainbow ramp. Bands crowd at the contacts and the notch and spread out when load is shared.
Neutral tone mapping, light bloom only on the brightest first-order white, overlay caption chip with exact colours.

Motion type: analytical approximation, art-directed in timing. The stress is a closed form evaluated per pixel:
Flamant point-load (half-plane) solutions for the press and every support (contact smoothed over a half-width a),
plus elementary beam bending σxx = −M(x)(y − H/2)/I with M(x) from the support reactions (statics), plus a notch term
(a concentration factor Kt on the net-section bending stress, decaying from the root as (ρ/(ρ+d))^1.35). Retardation
R = Cf·(σ1 − σ2); colour = dark-field circular-polariscope intensity sin²(πR/λ) × a 5600 K blackbody × CIE 1931
colour-matching functions (Wyman–Sloan–Shirley fit), 380–780 nm, white-balanced to the light box. Not a finite-element
solve: the Flamant terms ignore the beam's finite depth and free edges, there is no beam shear term, and the third
support's share is a set value (as if jacked to that force) with the other reactions from statics. Load ramps, the
analyser slide and the support's slide/lift are eased keys. Nothing is simulated; no physical accuracy is claimed beyond
the colour sequence and the qualitative band pattern.

**Good for:** where load / stress / pressure concentrates and how sharing or redundancy relieves it (workload, fragility,
resilience, single points of failure); "invisible forces made visible"; before/after comparisons of a structure.
**Avoid for:** anything needing real numbers (no scale, no units on screen), organic or soft subjects, long text.

## Planner (Node-safe): `stressplan.js`
- `interferenceTable({ n, rMax, kelvin })` → linear-RGB table (R = 0..rMax nm); `colourAt(T, R)`; `cmf(λ)`; `planck(λ, K)`.
- `createStressPlan(cfg)` → `{ load(t), thirdAt(t), forces(t), momentOf(F, x), notchAmp(F), stress(x, y, t), retard, order,
  peakOrder(t), plungerGap(t), wheelAngle(t), analyser(t), uniformsAt(t), events() }`. `uniformsAt(t)` is everything the
  beam shader needs; `stress()` is the same formula in JS (used for the score and for NOTES in scene.config.js).
- `notchOutline(beam, notch)` → the beam outline with a round-rooted V notch. `keyed(keys, t)` eased key interpolation.
- SCORE comes from `plan.events()`: analyser slide, press servo glides (one per load ramp), contact tick, the glassy tone
  (overlapping 0.5 s pad segments whose pitch = base × 2^(perOrder × peak fringe order)), support glide + lift whirs, the
  seat knock, a settle chime.

## Props (`style.props`)
| prop | what |
|---|---|
| `polariscope(plan)` | everything below, added to the scene; `update(t)` sets every uniform and pose from `plan.uniformsAt(t)` |
| `colourTable()` | the 512 × 1 half-float DataTexture (uploaded once at build) + the table |
| `beam(table)` / `photoMaterial(table)` | extruded notched beam; caps carry the photoelastic ShaderMaterial (`userData.set(u)`) |
| `lightBox()` | white housing + diffuser shader (bright where uncovered, `leak` indigo where the analyser covers) |
| `analyserSheet()` | film + frame + tab + guide rail; `userData.set(u)` slides it and updates the shared coverage uniforms |
| `loadingFrame()` | channel rail (low front wall), posts, crosshead, screw, handwheel, plunger; `userData.set(gap, wheelAngle)` |
| `fixedSupport(x)` / `thirdSupport()` / `roller()` | bridge saddles over the channel; the third support slides inside the channel, then jacks up |
| `lab()` | bench + wall; `caption(table)` overlay chip with a fringe-arc icon in true table colours |

**Signature motion.** The analyser's edge sweeps across and the beam/background switch to dark field exactly behind it
(per-pixel ray test against the sheet's rectangle, so it is right from any camera). Bands bloom from the contacts as the
press loads, pack at the notch as the load rises, and relax when a third support takes its share.

**Sound palette.** Low pad bed (82 Hz, fifth + octave), film-slide rustle + whoosh, `servo` glides for the press,
tick + small thud at contact, a glassy high pad (392 Hz × 2^(0.12 × order), octave + twelfth) that rises with the peak
fringe order and falls as the load is shared, `whir` for the support slide and jack, `thud` + `clack` seat knock, a soft
low chime when it settles.

**Knobs (spec.js).** `photo.Cf` (fringes per load: 180 → ~7.1 orders at the notch root at full load, ~1.8 once shared; mid-span bottom 3.7 → 2.2), `photo.gain`
(glow), `photo.edgeGlow` / `clearEdge`, `lightbox.leak` (crossed-polariser black), `notch.{x, depth, width, rho, Kt,
decay}`, `supports`, `press.a` / support `a` (contact width = how tight the contact rosettes are), `third.{x, from,
share, drop}`, `analyser.{w, h, y, z, from}`, `bloom.threshold` (1.25: only first-order white blooms).

**Limits (hit while building).**
- A dark field is dark: beats where the beam is unloaded under the analyser (end of beat 1) are a navy band across the
  middle of the frame; the bright light box above and the rail below keep the frame from going dark.
- Contact rosettes are modest next to the bending bands (Flamant with a 3–3.5 cm contact half-width); a smaller `a`
  tightens them but adds aliasing at the contact.
- The notch term is isotropic around the root (rings), not the true lobed pattern of a notch in bending.
- Long thin coplanar boxes z-fight at grazing camera angles (the rail floor was inset to fix it); the analyser parts do
  not cast shadows (their thin shadows aliased into stair-steps).
- Fringes are smooth gradients and the camera holds between moves: the 15 s demo is 2.9 MB at CRF 22.
- Fonts are the OS's system stack (Avenir Next / Helvetica Neue).
