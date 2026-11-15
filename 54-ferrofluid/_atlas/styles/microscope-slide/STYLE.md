# Microscope Slide (`microscope-slide`)

**Look.** The view down a light-microscope eyepiece, the one style that is not at tabletop scale. A bright circular field (warm white
with faint teal and pink stain blotches) sits in a dark eyepiece tube. Soft, translucent living cells drift in it. Each cell has a dark
membrane line, DIC/phase-style relief (bright on one side of every edge, dark on the other), a faint phase halo, a pale violet stained
nucleus with a nucleolus, and small refractile granules. Specks and out-of-focus cells float at other depths. The focal plane is
razor-thin, so anything off it becomes a soft, low-contrast disc. The signature mechanic is the central event of biology: one cell
becomes two, then four.

**Demo:** `Builder/HyperFrames/3d-style-atlas-pilot/60-microscope-slide/` (15 s).

## Good for / avoid for
- **Good for:** biology and growth explainers. Also as a metaphor for things that copy themselves or multiply (cells, viruses,
  replication, compounding, "one becomes many"). Works for any "look closer" reveal, or a focus-pull "now it's clear" beat.
- **Avoid for:** anything that needs real measurements (the scale bar and magnification are illustrative and must carry the SAMPLE
  DATA tag), dark or moody pieces (the field is bright by design), and dense text inside the field.

## How it is built (different from the other styles)
A brightfield image is a projection of light passing through the slide, so the specimen is **not** a lit 3D set. It is one full-screen
fragment shader working in specimen **micrometres**:
- **Cells** are 2D signed-distance bodies: two lobes joined by a smooth union (`smin`, blend `k`). While a cell divides, the lobes move
  apart and `k` shrinks to 0, so the waist pinches on its own. This is the same smooth-union technique liquid-chrome uses in 3D. The
  interphase wobble is a seeded angular harmonic, assigned from t.
- **Shading:** thickness-weighted cytoplasm absorption, membrane line, relief = SDF gradient · shear direction, phase halo, cytoplasm
  mottling, Worley granules (kept out of the nucleus), stained nucleus with chromatin texture, nucleolus and envelope line. Condensed
  chromatin threads appear in prophase. The **chromosomes** are 10 discrete rods mirrored about the equator: at the plate each rod and
  its mirror read as a sister-chromatid pair, and as they separate the arms trail toward the equator.
- **Depth of field per body:** blur `b = baseBlur + dofK·sqrt(dofRef/umR)·|z − focus|` (µm) widens every edge, and each feature's
  contrast drops by `w/(w+b)`. A focus rack is just keys on the focal-plane z, so cells at other depths swim in and out as it passes.
  The kit BokehPass is not used; the blur is computed inside the shader.
- **Eyepiece:** field stop with a per-channel radius (chromatic fringe), illumination falloff, a tube surround with a faint scattered
  glow, and a dark blink for objective changes.
- **Overlay** (exact colours, drawn after post): caption on the left over the surround, objective tag, scale bar sized from the current
  field radius, and an amber **SAMPLE DATA** chip.

## Planner module: `culture.js` (Node-safe)
- `createCulture({ roots, lineage, horizon })` builds the **lineage plan**. Each cell has a birth time, an optional division
  `{ t, dur }` and two daughters (`next[g-1]` times generation g). The centre is assigned from t: birth position + eased push along the
  division axis + seeded sine drift *measured from the birth time*, so it stays continuous across the split and nothing accumulates.
  Cells divide along their long axis (the angle at division start), and daughters are born round, then relax.
  `plan.at(t)` returns every live cell's shader parameters. `plan.events({ visible })` returns `round` / `align` / `split` events.
- `divisionShape(p, R, L)` maps phase p to the shape: rounding 0–.15, prophase .15–.32, metaphase .32–.50, anaphase .50–.68,
  telophase with a progressive pinch .68–.95, abscission .95–1. At p = 1 the parent is exactly two lobes at ±sEnd with their nuclei,
  which is where the daughters start.
- `createOptics({ view, focus, blink })` covers the objective (field radius in µm and the magnification tag; `click: true` keys step
  inside a dark blink), the stage centre, and the focal-plane z. `optics.events()` returns `objective` and `focus` events.
- `fieldFit(plan, optics, ids)` is the framing gate: the fraction of the field radius that the given lineage fills.
  `cultureVoices(snd)` gives the voices for `kit/schedule.scoreFromEvents`.

## Props (`style.props`)
| prop | what |
|---|---|
| `microscopeField(plan, optics)` | the full-screen shader mesh; `userData.update(t)` writes every uniform (nearest 32 cells) |
| `caption()` | left caption; `\n` forces a line break, otherwise it wraps at `caption.maxW`; `show(text, a)` |
| `scaleBar()` | right-aligned bar + "N µm"; `show({ um, px }, a)` |
| `magTag()` | "63×" + OBJECTIVE; `show(mag, a)` |
| `sampleTag()` | amber SAMPLE DATA chip; `show(a)` |

## Sound palette (from the same plans)
A warm pad and a low rumble form the bed, with seeded soft `bubble`s as watery ambience. Each division gets a `bubble` when it rounds
up, a `marimba` dyad when the chromosomes align, and a `pluck` + soft `pop` when the waist closes (pitched up for later generations).
An objective change is `clack` + `thud`, and each focus rack is a `whir` (pitch follows the direction). Only divisions inside the field
get a sound. Nobody has listened to it; only the levels were measured.

## Knobs (spec.js)
`field` (centre, radius, fringe, falloff), `look` (relief, shear, halo, rimDark, stain strengths, widths in µm), `optics` (dofK, dofRef,
baseBlur, blink), `lineage` (daughterScale, sEndK, nucK, push, growth, drift, wobble, spin, elong), `debris`, overlay blocks, `sound`.

## Limits (hit while building the demo)
- **The division is a simplified illustration.** There is no spindle, the nuclear envelope just fades, the chromosome count and shapes
  are decorative, and the timing is compressed (minutes to hours become seconds). Do not present it as accurate cell biology.
- Scale bar and magnification are illustrative SAMPLE DATA. Field radius ∝ 1/magnification is a consistent fiction, not a calibration.
- In the last ~0.4 s before a split completes (k → 0), a thin diagonal seam shows where the two lobes meet. It comes from the gradient
  of `min()` flipping the relief there, and it disappears once the daughters are born.
- Cells are drawn as separate bodies. Overlapping cells at the same depth composite like stacked filters, not like squashed cells, so
  keep roots apart (the demo checks this offline; there is no runtime separation).
- Cells of one lineage look alike: daughters inherit the parent's look, with only seed-level variation.
- At most 32 cells are drawn at once (the nearest to the field centre). A low-power field with more cells drops the outermost ones.
- No Blender translation is meaningful: the picture is a 2D shader, so `export-blender` has no geometry to bake.
