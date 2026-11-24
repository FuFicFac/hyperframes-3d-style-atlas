# CT Scan (`ct-scan`)

Slice by slice. A bright, clean scanner room: white floor, teal walls with soft panel seams, white clear-coated machines
with glowing teal trim. A sealed kraft cardboard box (paper tape, generic "this way up" and "fragile" marks, a blank
label) rides a lift column up through a white scanner ring on two legs; a glowing teal line loop hugs the box at the
scan plane, so the line crawls DOWN the box as it rises. On a big floating white-bezelled panel each slice draws in
LARGE in a hero view (an exact grey cross-section, bright on a dark screen, magnified 1.3x on the robot) beside a
scan-height gauge, then shrinks into a 4 x 5 grid of thumbnails, faster and faster. The thumbnails swing off the panel
like doors (edge-on for a moment), fly down and line up as a spaced row of thin dark film cards with bright shapes and
glowing frames on a teal turntable; the gaps close from the feet end, the cards cross-fade into a ray-marched volume —
a ghostly cream box with a coral toy robot inside and gold metal parts — which tips upright and turns. A dial (overlay,
three coloured detents) removes cardboard, then plastic; the camera pushes in until two meshing gold gears and a
wind-up key turning on one axle fill the frame.

Demo: `124-ct-scan` — "Slice by slice" (15 s, 5 beats: What is in the sealed box? / X-rays take one thin slice /
Many thin slices, stacked / Together: the hidden shape / Dial it: see only metal).

Motion type: exact slicing of a defined volume; staging art-directed. The box and robot are a list of signed-distance
primitives in three materials, baked once into a voxel grid; every slice image is the exact cross-section of that grid
at the card's height (plus the analytic gears/key at their current angle), and the volume is a ray march of the same
grid. It is NOT a simulation of X-ray physics: there is no attenuation projection, no reconstruction (filtered back
projection) and no beam hardening — "grey" is simply a fixed weight per material (cardboard 0.36, plastic 0.7, metal
1.0) plus a little seeded grain, and the volume colours are a chosen transfer function. Real CT slices are
perpendicular to the direction of travel; here the box rises through a horizontal ring so the slices are horizontal
(physically consistent), but the scan plane is drawn at the ring's TOP face (art-directed, so it can be seen). The box
lift, the card peel/flight/close, the tip-up, the turn and the dial are eased closed-form curves, not physics.

## Signature mechanic (`volume.js`, Node-safe; `style.plan` / `style.motion`)

- The hidden object: `BOX` (0.72 x 0.8 x 0.6 m, 18 mm walls) and `ROBOT` (an original chunky wind-up toy: rounded feet,
  round legs with metal knee pins, hips with a metal axle, a HOLLOW chest with a round front window and two meshing
  metal gears inside on metal axles, a metal key shaft out of the back, a waving arm and a lowered arm with round
  hands and metal shoulder pins, a neck of three metal rings, a hollow head with metal eyes and mouth slot, two splayed
  metal antennae with ball tips). `modelParts()` = static SDF parts `{ m, sd, bb }` (rounded box, capped cylinder,
  sphere, capsule, y-torus, shells as max(outer, -inner)). Only + - * / sqrt abs min max floor are used, so Node and
  Chrome bake identical bytes.
- `bakeVolume({ nx=116, ny=128, nz=96, soft })` (6.25 mm voxels, ~150 ms in Node): per-material COVERAGE
  clamp(0.5 - sd / (soft * voxel), 0, 1) rasterised over each part's bounding box, max per material, then metal wins
  over plastic, plastic over cardboard → RGBA bytes (R card, G plastic, B metal). Also a blurred top-down projection
  (metres of each material) for the turntable shadow, voxel counts and a checksum.
- The turning metal is analytic (`GEARS`, `AXLES`, `KEY`, `gearSd`, `keySd`, `gearPhases`; the gear axles and the key
  shaft too, so they stay crisp in the final close-up): gear A (12 teeth) sits on the key's axle, gear B (8 teeth) at the meshing distance, phased so a tooth of A sits in a gap of B; B turns
  -angle x 12/8. The same formulas are in the style's GLSL.
- `panelLayout(panel)` (shared by the style and the demo's camera maths): hero view (the slice turned 90°, box.w wide x
  box.d tall, scaled to `inner`), the gauge strip, the thumbnail cells.
- `createPlan(cfg)` → `{ heights, volume, events, boxY, scanAt, cellCentre, heroCentre, drawT, drawAt, leaveT, gaugeAt,
  cardAt, rowX, closeAt, fadeAt, tipAt, turnAt, blockAt, panelLiftAt, dialAt, keyAt, gearsAt, keyClicks }`. Card k:
  appears in the hero at `drawT(k)` (slow first draws, then a steady 0.095 s step) turned 90°, magnified (`heroZoom`),
  wipes in, holds until the next slice starts, then shrinks into its cell (turn and zoom ease back); `gaugeAt` gives the
  scan-height marker. At its peel (`peel.t0 + k·step`) it swings −90° about its left edge (door), flies (inOutCubic + a bulge toward the camera, scale
  0.6 → 1) to its row position; the row is cumulative gaps (spread 1.8 → 1) that close one by one from the feet end,
  so the cards never cross. Closed, card k sits exactly at local height h_k of the lying block. The key angle is a
  closed-form linear speed ramp; its quarter turns (ratchet clicks) are solved exactly with sqrt.
- `events`: glide, scanOn, scan (whirr), scanOff, toPanel, draw ×20, peel ×20, land ×20, swing, close, snap ×19,
  reveal, tip, stand, fade ×2, detent ×6, metal, ratchet. SCORE = `kit/schedule.scoreFromEvents`.
  `fingerprint(plan)` hashes every event time, the slice heights and the volume checksum; the demo records it and
  checks it in Node AND in the page (throws on mismatch).

## The shaders (the look)

- Slice card (`CARD_FS`): the card's uv (/ `uZoom`) → local (x, z) at the card's height; coverage = `textureLod(uVol)`
  + analytic metal, contrast-sharpened; grey = dot(coverage, grey weights) + static voxel-scale grain (integer hash on
  the sample position, so hero and thumbnail agree). `uBase` 1 = an opaque cell on the dark screen; 0 = a dark film card
  (alpha `filmAlpha`, lowered as the row closes) whose shapes are drawn brighter (`filmInk`) with a glowing border. `uDraw` wipes the image in from the top with a teal line. Thin frame bars (merged boxes) keep a card visible
  edge-on.
- Volume (`volFS`): a unit box (BackSide) ray-marched in object space, 64 steps between the entry and exit of the march
  bounds (the whole box, or only the robot's bounds once the cardboard is invisible, so the same 64 steps are ~1 voxel).
  Card + plastic: front-to-back emission/absorption with per-material colour, extinction and a contrast "sharpen" on
  coverage, gradient shading (3 extra taps), and a bisection at surface entry that weights the first step by the part
  that is really inside (kills stair-step contours). Metal: an opaque iso-surface (coverage 0.5) found by 5-step
  bisection, normal from central differences, lit as warm gold (key + fill diffuse, a white specular, darkened toward
  the silhouette); rays that only graze metal get a dark fringe — together a soft dark outline. Per-material visibility (`uVis`) comes from the dial with a small plastic residual.
- Turntable shadow: a plane under the volume reading the baked top-down projection, darkened by visible material,
  offset toward the light; it fades in after the tip-up.

## Good for / avoid for

- Good for: "what is inside", hidden structure, X-ray/CT/MRI/tomography, 3D printing layers, "many 2D views make a 3D
  model", data → model reveals (point clouds, scans, embeddings), threshold / filter / segmentation ideas, packaging and
  product teardowns, any object you can describe as SDF primitives in up to three materials.
- Avoid for: organic or fine detail below ~2 voxels (6 mm at the demo scale), more than three material classes,
  fully opaque realistic objects (the look is ghostly by design), long holds on a moving camera (bitrate), anything
  that must claim real radiological accuracy.

## Prop factories (`style.props`)

| prop | what it is |
|---|---|
| `ctScan(plan)` | everything for one plan: room, scanner (box, lift, sheet, line), panel, plinth + turntable, the slice cards, the volume and its shadow; `update(t)` poses all of it |
| `room()` | white floor disc, teal wall cylinder (unlit gradient, soft seams, white cove) |
| `scanner()` | white extruded ring on two legs, teal band + glowing lip, spinning detector band in the bore, lift column + tray, the kraft box, the additive scan sheet and the glowing line loop; `userData` exposes the parts |
| `cardboardBox()` | rounded kraft box with canvas faces: tape over the lid seam and down the sides, handling marks, a blank label |
| `panel()` | floating screen: white rounded bezel, dark screen canvas with the hero view frame (crosshair, corner ticks), the gauge strip and the thumbnail cells, a teal glow strip; `userData.setGauge(on, h)` moves the scan-height marker and fills the scanned part |
| `plinth()` | white plinth, teal band and lip, a turntable with light rim ticks (shows the turn) |
| `sliceCard(U, k, h)` | one slice: shader plane + frame bars (panel cell ↔ film card) |
| `volumeMesh(U)` / `volumeShadow(plan)` | the ray-marched volume (scale = box size) and its baked turntable shadow |
| `caption()` | overlay chip at the bottom left inside the 5 % margin (deep-teal plate with a bright edge, slice-and-scan-line icon, white bold text, cap height 58 px = 5.4 % of 1080). A vertical roll: the old label rolls up and out of the plate as the new one rolls in from below, with a quick expo crossing that ends just after the beat start |
| `dial()` | overlay knob at the bottom right: dark-teal ring, three detent dots (cream/coral/gold = card/plastic/metal; removed ones turn hollow), a white knob with a teal pointer |

## Sound palette (all from the plan)

Bed: soft pad (110 Hz, 700 Hz cutoff). Scan: `whir` gliding 118 → 236 Hz over the scan (pitch follows the scan
line), blips at scan on/off, a low `servo` + whoosh as the box glides in. Panel: one `tick` per slice drawn (an
accelerating run: pitch falls top → bottom, panned left → right), a blip for the first. Peel: soft `paper` flips, tiny clicks as cards land.
Close: a whoosh and a run of 19 quick `tick`s as each gap snaps shut. Reveal: `chime` + a bright major-seventh pad
swell. Tip-up: whoosh + `thud` as it stands. Dial: whoosh-out per material removed, three `click` detents per step,
a high chime when only metal remains, a `clack` ratchet per quarter turn of the key. Measured on the demo: max −2.6
dBFS, mean about −23.5 dB (not listened to).

## Tuning knobs (spec.js)

- `palette` / `room` / `materials`: wall teal, floor, machine whites, glow strengths (keep `tealGlow` ≤ ~2 or the scan
  ring hazes under bloom).
- `scanner`: ring radii and thickness, `scanY`, sheet alpha, line colour/strength/width, detector speed.
- `panel`: `inner` (screen height: sets the hero and the cell size), cols/rows of thumbnails, gap, pad, bezel, gauge
  width, screen colours.
- `slice`: ink, film colour, `filmAlpha` (spaced) → `filmClosed` (closed), `filmInk` (shape brightness on film), grey
  weights, `sharpen`, grain, frame colour/width.
- `volume`: `steps` (64), material colours (metal = warm gold), `emission`, `sigma` (extinction per metre), `shade`,
  `light`, `soft` (analytic coverage ramp, voxels), `sharpen`, `residual` (visibility left after the dial; 0 in the
  demo), `robotBounds`, `metalSpec`, `outline`.
- `shadow`, `bake` (grid size and coverage softness: 1.4 smooths the trilinear iso-surface of small spheres and rods).
- `caption` (cap 58 px, plate 150 px, `roll`), `dial`, `sound`.
- Plan cfg (scene.config.js): slice count and heights, draw schedule (`gaps`, `step`, `durs`, `heroZoom`, `toCell`),
  peel / close / fade / tip / turn / dial / key timings, row spread.

## Known limitations (seen while building)

- Voxel resolution is 6.25 mm: small baked spheres and rods show faint wood-grain contour rings on their iso-surface
  in close-ups (bake `soft` 1.4 reduces it); analytic gear/key edges are crisp, baked ones are slightly soft.
- The film cards are separate transparent planes: their sort order can swap when the camera crosses their plane
  (only edge-on, briefly). The cross-fade from cards to the volume is a blend, not a continuous transformation.
- Ghost-box walls show faint vertical sampling streaks at grazing angles (64 steps over the whole box).
- Metal is drawn as an opaque surface; very thin metal (< ~2 voxels) can be missed by the 64-step march in wide shots.
- The demo's staging is art-directed (scan plane at the ring top; the reconstruction appears on a separate plinth).
- A standing robot is a portrait subject: the upright-volume shots leave teal wall at the sides; the final shot pushes
  in on the gears and key to fill the frame (a shoulder pin and the hip axle are cut by the frame edge there).
- The late slices go through the hero view fast (0.095 s each): only the first five can be read there; the rest read
  as thumbnails. The big caption reserves the bottom 20 % of the left two-thirds of the frame, so every shot sits higher.
- The roll still passes through ~0.1 s where both labels are half-clipped in the plate (it is a roll, not a cut).
- Not watched in motion at full speed during authoring; audio measured, not heard.
