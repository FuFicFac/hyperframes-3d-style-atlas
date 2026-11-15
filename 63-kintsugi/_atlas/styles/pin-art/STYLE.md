# Pin Art (`pin-art`)

**Look.** A giant pin-impression toy (pinscreen) on a dark matte desk. A clear acrylic frame (kit `fresnelGlass`, a dull
polished top edge, four corner screws) holds a dense grid of 8400 slim polished-steel pins (100 x 84 at 8 cm pitch, a
lathe pin: 11 mm shaft, domed 36 mm head) over a dark base plate. A strong low raking key from the front-left (~18 deg)
lights the walls of every raised shape and throws long pin shadows back-right; a soft cool rim light from behind outlines
far head edges; a procedural studio environment (kit `studioEnvironment`: one big softbox overhead, a warm key strip, a
cool rim strip, a dim front card) gives the polished metal something to reflect. Pins at rest sit slightly darker (down
in the plate) and every pin next to taller neighbours darkens (per-pin neighbour occlusion), so a relief reads as bright
lit walls and heads against a quieter field. Finishes: `steel` (default), `brass`, `blackChrome`, `anodised` (per-pin
tint from `palette.anodised`, used by bars). The beat label is a dark machined caption chip with a 3x3 pin-head icon, and
a separate amber SAMPLE DATA tag; both on the overlay (exact colours).

**Signature mechanic.** Shapes pressed through a field of pins, as a pure function of time (`pins.js`, THREE-free):
- every pin's extension `h_i(t) = sum_k dH_k,i * settle_k(t - t_k - delay_k,i)`, where `dH_k = target_k - target_k-1` is
  precomputed per step (so overlapping waves compose exactly), then `max` with a rolling-ball bump and `+` tap ripples;
- **height sources** are plain data turned into a per-pin height array once at build: stroke-font **text** and **icons**
  via distance fields with a quarter-round **bevel**, filled **polygons**, a **hand** (smooth union of capsules), a static
  **dome**, **bars** from values (columns of pins, with an anodised tint index per bar), **terrain** (kit `heightField`),
  a **bitmap** of `#` cells, and `max` unions;
- **morph**: each pin's delay comes from its position — a directional sweep, a radial wave from a point (or inward), a
  seeded random order, or front-row-first — plus a small seeded jitter; the settle is a closed-form spring (~5 % overshoot,
  metallic ring, held at EXACTLY 1 after `morph.settle` s so holds are pixel-still) or a **cascade drop** (gravity fall +
  one small bounce);
- **layers**: a ball rolling under the field (a travelling sphere-cap bump, `max` with the field) and ripples spreading
  from a tap (added, gone after `life`);
- extensions go into an instance attribute and the vertex shader lifts each pin; the shadow depth material has the same
  displacement, so shadows follow the relief. One draw call for all pins (plus the shadow pass).
- The same plan drives the sound (`plan.events`): shimmer ticks whose density follows the number of pins moving in each
  1/15 s bin, single ticks for a few lone pins, a sparkle wash per morph, a thud when a shape lands (85 % of its front has
  peaked; a lighter one for a cascade) and a soft bell on each landing.

## Good for / avoid for
- Good for: reveals and transformations ("this becomes that"), data that rises out of a flat field, impressions /
  fingerprints / identity (a hand, a face-like dome, a seal), sound-like ripples, tactile titles and single icons.
- Avoid for: long text (a word of ~5 stroke-font capitals fills the field), fine detail below ~3 pins (24 cm), exact
  numbers on the relief (bars are relative; put values in the caption if they exist), fast camera moves (thousands of
  glints cost bitrate), bright/airy moods (the look is a dark desk).

## Planner (`pins.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `pinGrid({ cols, rows, pitch })` | the grid (centred, x right, z toward the viewer); `n`, `x[]`, `z[]`, `w`, `d`. |
| `heightsFrom(src, grid)` | a source (see kinds above) -> `{ h: Float32Array (m), tint: Int8Array \| null }`. `ICONS`: heart, star, circle, ring, check, arrow, plus. |
| `waveWeights(grid, wave)` | per-pin 0..1 order: `{ type: "dir", dir }`, `{ type: "radial", c, inward }`, `{ type: "random", seed }`, `{ type: "rows" }`. |
| `createPlan(grid, spec.morph, { steps, layers, maxExt })` | the plan. Step: `{ id, t, to: src, wave, spread, jitter, seed, settle: "spring"\|"drop", spring }`. Layers: `{ kind: "ball", from, to, t0, t1, r, top, ease }`, `{ kind: "ripple", c, t0, amp, speed, wavelength, trail, life }`. |
| `plan.heightsAt(t, out)` | every pin's extension at t (closed form). |
| `plan.progressAt(k, i, t)`, `plan.shapeBox(k)`, `plan.ballCenter(id, t)` | per-pin step progress (tints), a step's raised box (framing gates), the ball centre. |
| `plan.steps[k]` | `first`, `last` (wave front start/end), `end` (all settled), `landAt` (sound), `changed` (pins). |
| `plan.motionStats({ t0, t1, fps, eps })`, `plan.events(spec.sound, { t0, t1, fps })`, `pinVoices(spec.sound)` | moving-pin counts per frame -> events -> SCORE via kit `scoreFromEvents`. |
| `springSettle`, `dropSettle`, `springPeak`, `bevelProfile`, `fieldBox` | the curves and helpers. |

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `pinScreen(plan, { finish })` | everything for one plan: desk + frame + pin field; `update(t)`. |
| `pinField(plan, { finish, palette, headR, headH, shaftR, length, radial, ao })` | the InstancedMesh; `userData.update(t)`, `userData.setFinish(name)`. Anodised tints fade in with a tinted step and out with the next step that moves the pin. |
| `frame(grid, { margin, height, base })` | dark plinth/plate + clear acrylic border + screws. |
| `desk({ size, y })` | matte dark desk plane. |
| `pinGeometry(o)` | the lathe pin (shaft + collar + dome), head top at local y = 0. |
| `caption()` | overlay chip, `userData.show(text, alpha)`; one fixed position (top-left). |
| `sampleTag()` | overlay amber SAMPLE DATA tag (top-right), `userData.show(alpha)`. Show it whenever bars are up. |

## Sound palette
`pad` bed (110 Hz, open fifth/octave/tenth, 700 Hz cutoff) for the mean level; `tick` shimmer (pitch 2.2–3.6, up to 4 per
1/15 s bin, density from the moving-pin count); single `tick`s for lone pins; one `sparkle` wash per morph scaled by the
share of the field that changes; `thud` (pitch 0.8) when a shape lands, lighter/higher for a cascade; `chime` bell theme
(root, fourth, fifth, octave) on each landing. All times come from the plan; nothing is hand-timed.

## Knobs (spec.js)
- `field`: cols/rows/pitch (pin count = cost), head/shaft sizes, `maxExt`, `ao` (`strength`, `max`, `depthTone`, `depthRange`).
- `finishes`: colour / roughness / metalness / env intensity per finish; `palette.anodised` for tints.
- `morph`: `spring` (stiffness/damping -> overshoot), `settle` (when pins are clamped still), `spread`, `jitter`, `drop`, `bevel`.
- Lights: `key` position = shadow length/direction; `rim` colour/intensity; `studio` panels = what the metal reflects.
- `sound`: bin, eps, lone threshold, gains.

## Known limits (seen while building the demo)
- File size: thousands of moving specular glints compress badly. The demo needed camera moves only during morphs, perfectly
  still holds (drift 0, clamped settles) and `--crf 26` (9.5 MB; at CRF 22 with orbits during holds it was 30.9 MB). A
  crop of a mid-morph MP4 frame is slightly soft but pins stay resolved.
- Legibility depends on the camera: at a low (~20 deg) angle a raised word reads mostly by its lit walls and is hard to
  read; the demo raises the camera to ~40 deg for the word. The low orbit suits hands, bars and terrain better than text.
- The flat field is dark by design (depthTone 0.62); a scene that sits on a flat field for long looks sombre. Raise
  `depthTone` or the top softbox for a brighter field.
- The front acrylic rail shows the first rows of pins through it (clear acrylic); at grazing angles it reads as a doubled
  row of heads.
- Ripples on a square grid look slightly square at low amplitude; the pins are point samples, so anything narrower than
  ~3 pins aliases (thin strokes break up).
- The rim light makes a small blue specular hotspot on the far acrylic corner in low front-left shots.
- Neighbour occlusion and tint loops run on the CPU per frame (8400 pins x 12 neighbours): fine at this size; a much larger
  field would want a height texture and a shader-side sample instead.
- Audio levels were measured (mean −21.5 dB, peak −4.0 dBFS), not listened to.
