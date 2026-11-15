# Ink Wash (`ink-wash`)

**Look.** A brush-and-ink painting coming to life on a large sheet of soft, fibrous off-white paper with deckled edges,
lying on a charcoal felt mat. Along the far edge: an ink stone with a pool of black ink and an ink stick, a celadon water
bowl, two small porcelain dishes (vermilion, indigo), a porcelain brush rest and a pale soapstone seal block. Black ink in
every strength (wet pooled darks, mid greys, pale misty washes, dry-brush flying white) plus at most two accents. Bright,
quiet, lots of deliberate empty paper, but the painted subject is large.

**Signature mechanic.** A painting made stroke by stroke as a pure function of time. Each stroke is a path with a
pressure profile and an ink load; a real 3D bamboo brush travels it (tilts with travel, presses, the tuft squashes,
splays and bends back), and ink exists exactly as far as the brush has gone. Width follows pressure; the stroke starts
with a pooled dark where the brush landed and runs dry into streaky flying white as the planned load empties. After the
brush passes, wet ink bleeds (edges feather along the paper fibres), lightens and loses its gloss as it dries, and a
darker rim settles at the edge — all closed forms of the stroke's own landing time per point. Washes sweep in as broad wet
shapes, bloom outward and settle with darker edges, fading into mist; a drop of colour into a wet wash opens as a soft
flower (wet-in-wet). The ink layer is re-rendered into a half-float texture every frame from the plan and t alone, so any
seek order gives the same frame.

## Good for / avoid for

- **Good for:** calm reflective pieces, big-picture ideas, journeys, nature metaphors, "less is more", one brushed word,
  simple diagrams with gravitas (an arrow, an open circle, a line), chapter openers.
- **Avoid for:** dense information, many labels, numbers/charts, fast energetic edits, anything that needs exact
  typography in the painting (brushed text uses the kit's single-stroke Latin capitals only). No real-script calligraphy
  and no seals with real characters — the seal is an abstract geometric mark.

## Files

| File | What |
|---|---|
| `spec.js` | Palette, sheet / ink / brush / props tuning, planner defaults (`plan`), lights, camera, caption, sound. |
| `style.js` | `createStyle(stage)`: ink-layer renderer (stroke, wash, blot, seal shaders), paper shader, props, caption. |
| `inkplan.js` | **THREE-free planner** shared by picture and sound: `planInk(program)` → strokes (per-point landing time, half width, load, speed), washes, blots, seals, brush timeline, seal-block timeline, dips, events; `brushPose`, `stampPose`, `strokeHead`, `sheetShot` (camera fitting), subject helpers, `inkVoices`, `beatTones`. |

## Program items (`planInk`)

`stroke {path, smooth, profile, width, tone, color, speed, load, dwell}` · `line {a,b,bow}` · `arrow {a,b,head}` ·
`circle {c,r,a0,sweep}` (open ensō) · `text {text,x,y,cap,width,align}` (kit stroke font, brushed) ·
`wash {shape | ellipse, dir, tone, color, grade, mist, dur, bloom, edge}` · `bloom {c,r,color,tone,tau,petals,rim}` ·
`splatter {c,dir,n,reach,spread,size}` (seeded drops after a brush flick) · `seal {c,size,color,pattern}` · `pause` · `park`.
Any painting item takes `dip: "ink"|"water"|"vermilion"|"indigo"` (the brush flies to that station first; water swirls and
ripples the bowl) and `rinse: true`. Items start when the brush gets there, so BEATS should be derived from `plan.byId`.
Profiles: `press-lift`, `swell`, `even`, `taper`, `sweep`, `dot`, or your own `[[u, p], ...]`. Helpers: `mountainShape`,
`boatItems`, `birdItem`, `smoothPath`.

## Prop factories (`style.props`)

| Factory | What |
|---|---|
| `painting({ plan })` | Whole set; `userData.update(t)` renders the ink layer for t and poses brush, seal block, ripples. Also `factories.painting` for OBJECTS. |
| `sheet(inkTexture)` | Paper: fibre field + mottling, deckled translucent edge, Beer–Lambert ink absorption, wet ink glossier. |
| `mat()` | Felt mat + the sheet's soft lifted-edge shadow. |
| `brush()` | Bamboo brush, `userData.setPose(brushPose(plan, t))`: lean, trail, press squash/splay/bend, ink-coloured wet tip. |
| `inkStone()`, `inkStick()`, `waterBowl()` (ripples from dips), `colourDish(color)`, `brushRest()` | Set dressing / dip stations. |
| `sealBlock()` | Soapstone seal block with a vermilion face, `userData.setPose(stampPose(plan, t))`. |
| `inkLayer(plan)` | The offscreen ink renderer alone (`render(t)`, `texture`). Marks: stroke ribbons (stencil per stroke), wash SDF quads, blots (blooms + splatter), seals. |
| `caption(labels)` | Overlay caption on a slip of paper (exact colours), tiny abstract vermilion mark, serif caps. |

## Sound palette (from the same plan)

`inkVoices`: per stroke a soft `whoosh` (dir "out") plus a faint `paper` texture whose duration is the stroke's own
duration (airier as the brush runs dry); per wash two long hushed whooshes; `bubble` drips after colour dips and rinses;
`squish` for dips and dabs; `click` per splatter drop; `thud` + `click` for the seal press; a click when the brush is laid
on its rest. `beatTones` per beat: a breathy flute-like tone (single pad note + octave, high airy whoosh breath) and a low
plucked string (pad with a 4 ms attack, sfx bus). Bed: a quiet low pad (root 73 Hz, cutoff 460 Hz).

## Knobs

`ink.bleed / tauBleed` (how far / fast edges feather), `ink.tauDry / lighten / edgeDark` (drying), `ink.dry` (load range
for flying white), `ink.bristles / streak`, `ink.halo`, `ink.px` (texture resolution), `plan.consume` (how fast a brush
empties), `plan.speed / textSpeed / travelSpeed`, `brush.lean / leanDir / trail / bend / squash / spread`,
`sheet.fibreTone / mottle / deckle`, `caption.*`.

## Known limits (seen while building the demo)

- The brush flies between items and dips; each dip trip costs ~0.8 s. In a 15 s piece budget two or three dips. The demo
  dropped a water rinse to fit, so the water bowl is set dressing there (the rinse + ripple path works but is not in the demo).
- A long uniform stroke with a full brush still reads a little "marker-even" in the core; texture comes mainly from the
  feathered bleed, dried rim and the dry end. Give long strokes a lower `load` or a varied profile.
- Stroke ribbons are fixed-width geometry; extremely tight turns (radius below the stroke half width) are handled by the
  per-stroke stencil (no double ink) but the inner side of the turn can look slightly clipped.
- Washes are polygons + a baked SDF (192 px across): very thin wash shapes lose detail; use strokes for thin things.
- Overlapping washes add density (darker overlap) — real behaviour, but a near shape does not hide a far one.
- The paper fills most of the frame only at elevations ≥ ~1.1 rad; lower three-quarter views show felt at the far corners.
- Wet-ink gloss is subtle under the soft key light. Nobody has listened to the audio; levels were measured.
