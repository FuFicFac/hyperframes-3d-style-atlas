# Ukiyo-e (`ukiyo-e`)

**Look.** Japanese woodblock printing, shown one pass at a time. A 3.3 m (toy-scale) sheet of cream washi with soft blotches
and seeded kozo fibres lies on a pale hinoki bench against two low wooden kento guides (an L at the near-right corner, a
straight guide on the near edge). Carved cherry blocks swing down onto it like a lid, press, and swing back up. Each
one leaves a single flat layer in register: the black key line first, then the sky bokashi, Prussian blue, a second blue,
ochre and pink. A stone seal stamps a red mark, and the printed layers lift a few centimetres off the paper so they
separate slightly (parallax) as the camera eases sideways. Soft high key light from front-left, neutral tone mapping, a
light vignette. A cream caption chip with a red seal square sits bottom centre on the overlay (exact colours).

**Signature mechanic.** Printing in passes (`prints.js`, THREE-free):
- pass list `[{ id, layer, t, baren?, note }]` -> per pass `t0, contact, open0, open1, exit1`: glide in from the off-stage
  pose, swing down on a hinge along the sheet's FAR edge (slam ease), press (+ baren strokes on the key block), swing up,
  rise away. A layer turns on at `contact`, while the block hides it, so the opening reveals it near edge first;
- the layers are flat planes just above the paper drawn with MULTIPLY blending (`dst * mix(1, ink, a)`, `inkMaterial`),
  so the lit paper, its fibres and the block shadows show through every colour, and the black key line survives
  every later pass, the way transparent water-based ink behaves. Each colour has wood-grain streaks and fine baren
  mottling (goma-zuri) knocked out of it;
- each block's underside carries its own layer as inked relief on darker carved-away wood with chisel marks and kento
  marks, mapped so it is the correct mirror image when it opens (rarely seen in the demo, see limits);
- `sealPose` (a stone seal straight down/up) and `liftAt(t, rank, n)` (finale lift by stacking rank; key + seal highest);
- SCORE comes from the same plan: a whoosh on each swing, a thud + wooden clack at contact, a rustle per baren
  stroke, a paper peel as it opens, a plucked note per reveal climbing the Japanese *in* scale, and thud + chime + a
  three-note pluck for the seal, over a low warm pad.

## Good for / avoid for
- Good for: "built up in layers", processes with ordered stages (each stage adds one layer), registration and
  alignment, craft and making-of topics, Japan/art history, composites ("each part alone means little, together it's
  the picture"), before/after reveals.
- Avoid for: lots of text or numbers (the printed picture is fixed canvas art; the caption is the only text), fast
  pacing (one pass needs ~1.6 s), anything needing a camera that moves a lot, stories that need characters to move.

## Planner (`prints.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `createPrintPlan({ passes, timing, seal, parallax, end })` | the plan (all pass times precomputed). |
| `plan.blockPose(i, t)` | `{ visible, angle, y, z, press }` for pass i (hinge angle in rad, 0 = flat). |
| `plan.printed(t)` | `{ layerId: 0/1 }`: what has been printed by t. |
| `plan.barenAt(t)` | `{ on, u, v, press, rise, k }`: zig-zag loops over the key block's back. |
| `plan.sealPose(t)`, `plan.liftAt(t, rank, n)`, `plan.passAt(t)` | seal stone, finale lift, current pass. |
| `plan.events()`, `printVoices(spec.sound)`, `IN_SCALE` | swing/contact/rub/peel/reveal/seal/bed events -> SCORE via `scoreFromEvents`. |

## Artwork (`artwork.js`, browser canvas only)
`paintLayer(id, ctx, W, H, color)` draws one block's layer in a 2048 x 1280 design space (top = the sheet's far edge):
`key`, `sky`, `prussian`, `blue2`, `ochre`, `pink`, `seal`. The demo picture is an original seascape (a breaking wave on
the left, a smaller swell, two rowing boats, a two-peaked snow-capped mountain, a pink sun, cloud bands, a blank
cartouche with abstract brush marks, a reserved seal square). It is not a copy of a historical print. To print a
different picture, replace the layer functions and keep the ids in `spec.layers`. Foam outlines use a "grow then knock
out" trick (fill the shapes thick in ink, then erase the shapes themselves) that outlines any union of shapes.

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `printSession(plan)` | everything (bench, sheet, kento, layers, one block per pass, baren, seal stone) + `update(t)`. |
| `sheet()`, `washiCanvas()` | the paper: box edge + fibre-textured top plane. |
| `kento()`, `bench()` | low wooden registration guides; pale hinoki bench. |
| `layers(ids)` | one multiply plane per layer: `set(printed, liftFn)`. |
| `layerCanvas(id)`, `inkMaterial(tex, rank)` | layer art + grain; the multiply ShaderMaterial (`uniforms.amount`). |
| `block(id, layerCanvas)` | hinged block group (`userData.setPose(pose)`), inked/carved underside. |
| `baren()`, `sealStone()` | bamboo-sheath baren with a twisted handle; stone seal with a red face. |
| `caption()` | overlay chip, `userData.show(text, alpha)`. |

## Sound palette
`pad` bed (root 110 Hz, chord 0/7/12/15, brightness 700 Hz); `whoosh` (in) per swing; `thud` + `clack` at contact;
`rustle` per baren stroke; `paper` peel; `pluck` per reveal (root D4, *in* scale); seal: `thud` + `chime` + three-note
`pluck`. All times come from the plan.

## Knobs (spec.js)
- `sheet` (size, margin, layer canvas size, fibre count, layer gap), `block` (pad, thickness, face canvas, carve
  darkness), `kento`, `baren`, `sealStone`.
- `layers`: order, ink colour and wood-grain strength per block.
- `timing` (close / glide share / hold / open / exit durations, hinge angles, exit rise/back), `parallax.lift`.
- `caption` (position, font, colours); `sound` gains, bed root/brightness, reveal root.

## Known limits (seen while building the demo)
- The block's back covers most of the sheet for roughly 0.5–1 s of every pass (and ~1.3 s during the key block's baren
  pass), so about a third of the printing time shows a plain wooden slab. Shorter holds help; a smaller block would not
  look like printing.
- The inked, carved underside of each block is built and mirror-correct, but the camera hardly ever sees it: the
  face only turns toward the camera past ~58 degrees of hinge angle, and by then it stands above the top of the frame.
  A future pass could have the block slide toward the camera face-up on its way out.
- The finale "parallax" is subtle (5 cm of lift, a 0.07 rad camera move). A larger lift (16 cm was tried) looks like
  misregistration, not depth.
- Layers are unlit multiply planes: when lifted they cast no shadows. Fog does not apply to them.
- The picture is fixed canvas art (7 canvases of 2048 x 1280 painted at load, ~1–2 s); the style does not
  animate anything inside the picture.
- Physically, real ukiyo-e lays the paper face-down on an inked block and rubs its back with the baren; here the block
  comes down onto the paper (clearer on camera) and the baren rubs the block's back. Kento are physical guides on the
  bench plus marks on each block face.
- Caption font is Hiragino Mincho (macOS system font); other machines fall back to Georgia.
- Audio levels were measured, not listened to.
