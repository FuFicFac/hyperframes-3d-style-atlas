# Caustics (`caustics`)

**Look.** A sunlit pale room seen close: a white tabletop, a clear 0.6 m square glass slab (aqua tint, teal edges, a
bright fresnel rim) in a slim light-steel frame on two brass pivot pins, carried by a fork and a brass carriage on a
vertical brass rail at the back-left corner, with a cream lamp head above it. The slab's top is gently lumpy: it
reflects its own small "room with a big mullioned window" environment, so the lumps read as a wobbling window.
A warm beam comes straight down through the slab. Close to the table the light is an even cream patch; as the slab
rises the patch swirls into bright curved lines and dark gaps, and at exactly one height it unwinds into a bold
smiling sun. Room light eases down as the light gathers so the picture glows; in the wide, faint light threads run
from the glass to the picture. Neutral tone mapping, gentle bloom on the brightest light only, overlay caption chip
(ivory plate, sun-in-a-square glyph, orange rule) top right with exact colours.

Motion type: analytical approximation. Light is traced with small-angle refraction: every ray lands at its glass
point + (glass height / focus height) × its deflection, and the brightness on the table is exact light conservation
over the warped ray mesh. The deflection field is NOT an optical-transport solve: it is a cumulative-sum
(Knothe–Rosenblatt) map from even light to the picture, composed with exact area-preserving twists that scramble the
light on the way to focus. That field is not curl-free, so no real slab could produce it exactly; real caustic lenses
use an optimal-transport (curl-free) map and their in-between patterns look smoother and less swirly. Heights, beam,
room light, camera: eased keys (art-directed). No refractive index, no dispersion, glass thickness ignored.

**Good for:** "hidden information that only appears under the right conditions" (encoding, focus, one correct setting),
lenses and light, "the shape holds the message", reveals that need a physical, slightly magical feel.
**Avoid for:** anything needing numbers or fine text in the picture (bold icons only: the light picture is soft-edged
and an 8 % floor stays lit), dark moody topics (the set is a bright room), stories with several subjects at once.
Differs from glass-light (refraction of a beam through prisms), laser-mirrors (beam paths), cymatics and
ripple-interference (wave patterns).

## Planner (Node-safe): `caustic.js`
- `createCausticPlan(cfg)` → `{ R, src, def, index, n, target, Ng, gdef, normals, heights, N, dFocus, heightAt(t),
  tiltAt(t), sAt(t), sharpAt(t), beamAt(t), roomAt(t), sheenAt(t), raysAt(t), events(), stats }`.
  - target: `sunTarget(n, spec.target)` — analytic signed-distance sun (disc, 12 tapered rays, eyes, smile), floor 8 %.
  - stir: `stirForward` / `stirInverse` — a list of twists (each turns points about a centre by an angle that depends
    only on the distance: area-preserving exactly, inverse in closed form, no stepping).
  - map: column cumulative distribution for x, conditional row distribution (adjacent columns blended) for y.
  - rays: an R × R mesh regular in STIRRED space (R = 641): node g sits on the glass at `stirInverse(g)` and lands at
    `map(g)` when sharp. Meshing in stirred space keeps every triangle compact at focus (clean picture); a glass-regular
    mesh made ruffled streaks at focus.
  - glass: `normals` (RGBA8, slope ∝ deflection on a regular glass grid) and `heights` (least-squares integral of the
    deflection, Gauss–Seidel, for the visible lumps).
  - time: `keyed(t, keys)` for glass height, tilt, room light, glass sheen, ray threads; `sharpAt(t)` = exp(-((s-1)/w)²).
- Runs in ~0.2 s in Node. Sound reads only the keys (plain data); the picture also reads the ray arrays. Node and Chrome
  may differ in the last bits of `Math.sin` in the twists, which only moves pixels, never a sound decision.
  `planHash(plan)` fingerprints the deflections if a later demo needs to compare.

## Props (`style.props`)
| prop | what |
|---|---|
| `causticBench(plan)` | everything below, added to the scene; `update(t)` sets glass height + tilt, renders the caustic target, beam level, lamp panel, shaft, edge glow, glass sheen, ray threads and the room-light dip |
| `causticEngine(plan)` | ONE draw call per frame: the ray mesh into a 2048² half-float target (4× MSAA), additive; vertex = glass point + s·deflection, fragment = abs(det of d(glass point)/d(pixel)), capped — light conserved per triangle, folds add into caustic lines |
| `tableMaterial(engine)` / `room(engine)` | white table (standard material + the caustic as warm added light, 4 bilinear taps) and a pale gradient wall |
| `glassSlab(plan)` / `windowEnv()` | displaced top with the deflection normal map on kit `fresnelGlass`, its own baked window environment, teal edges with emissive "light piping", faint underside |
| `frame()`, `carriageFork()`, `standAndLamp()` | four slim bars + pivot pins; fork + cross bar + brass carriage + knob; base, rail, diagonal lamp arm, lamp head with a warm diffuser panel |
| `rayLines(plan)` | 22 × 22 of the plan's own rays as faint additive threads, glass bottom → landing point (rewritten from t) |
| `beamShaft()`, `caption()` | soft additive column from the lamp to the glass; overlay caption chip, right-aligned |

**Signature motion.** The slab rises on its rail: an even patch → a swirl of bright curved lines and dark gaps →
(final fast approach, outCubic lock) the swirl unwinds into the picture at one height; past it the picture smears into
sharp caustic lines, back to sharp.

**Sound palette.** Glassy pad bed in overlapping 2.2 s segments whose low-pass opens with focus sharpness
(520 → 2600 Hz), two sparkle chimes for glints, a servo for every move of the carriage (pitch rising with the climb),
a click + tick for the beam switch, a bright 5-note chime at the lock, a whoosh for the crane-up, a detuned pad
(× 1.035) while it over-focuses, a soft settle chime. Measured, not listened to.

**Knobs (spec.js).** `target` (sun geometry, `floor`, `scale`, `blur`), `stir.twists` (more angle = more swirl, but
fold lines appear at lower heights), `rays.n` (mesh density: 641 clean, 321 streaky, 201 shows triangles),
`glass.slope` (normal strength), `optic.{W, focus, margin, rt, cap, samples, blur, beam, sharpWidth}`,
`rig.*` (frame, fork, rail, lamp, shaft, bumpHeight), `look.glass/edge`, `reflect` (window environment),
`lights` + the demo's `room` keys (exposure balance of room vs beam), `caption`, `sound`.

**Limits (hit while building).**
- The light picture's floor (8 %) plus room light makes the square read as a lit patch with a brighter picture, not
  a picture on black; contrast is set by the room-light dip (to 24 % at focus). Lower floors showed more artefacts.
- The cumulative-sum map is anisotropic: floor columns next to strokes are sheared, which shows as faint vertical
  hairlines and soft ray tips in a 100 % crop. 4× MSAA on the target and a 641² mesh keep them faint; a true
  optimal-transport solve would remove them.
- The slab cannot be both in view and out of the light's way: in the table shots the camera sits just below the focus
  height, so the slab leaves the top of frame on the way up (we see the light through the glass until then). The wide
  keeps the picture at ~50 % of frame width with only the slab's front half in frame; the caption chip sits over the
  slab's back-right corner there.
- Clear glass over a plain white table shows nothing through it; the lumps are carried by the glass's own window
  reflections, which are dimmed (sheen key) while we look through the slab at the light.
- The beam does not light the slab, frame or rail (it only exists as light on the table, the lamp panel, a faint
  shaft and the threads in the wide).
- Fonts are the OS system stack (Avenir Next / Helvetica Neue).
