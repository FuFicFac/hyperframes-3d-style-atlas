# Linocut

A grey-green lino block mounted on birch ply sits on a pale wooden bench under a low, warm light from the left. A
V-gouge with a turned wooden handle ploughs grooves into it and lifts curls of lino that ride the blade and are flicked
onto the bench; cut lino shows paler and warmer than the uncut top, and the clearing ridges catch the side light. A
black rubber roller rolls across and only the raised parts turn glossy black, with roller streaks in the sheen. Cream
paper hinges down, a round baren rubs loops over it (the image ghosts through the sheet where it has passed), and the
sheet peels back from one corner: the print is solid black and cream, salt-and-peppered where the ink was thin, and it
is the MIRROR of the block — the backwards word on the block reads correctly on paper.

Motion type: Art-directed. The carving order, stroke speeds, roller, paper, baren and peel are planned for clarity, not
simulated. Groove depth is a closed-form V profile per stroke (deepest stroke wins, never stepped per frame); "ink only
the raised part" is a depth threshold (texels shallower than 0.34 mm catch ink); transfer under the baren is a
first-rub-time ramp; the corner peel is a cylinder curl and the lift is a rigid quaternion slerp. No claim of physical
or historical accuracy beyond the relief-printing principle it shows: carve away what should stay white, ink the top,
print a mirror.

## Good for / avoid for

- Good for: how printing works, subtractive / negative-space thinking, mirrors and reversal, craft explainers, titles
  that reveal themselves (a backwards word that prints the right way round), stamps, seals, type and impressions.
- Avoid for: fine detail or small text (gouge widths set a ~3 mm minimum line; letters need ≥ 40 mm cap on the
  0.3 m block), colour (one block, one ink — use `ukiyo-e` or `risograph` for layered colour), dark moody looks (the
  carved/inked contrast needs a bright, raking-lit bench).

## Props (style.props)

| prop | what it is |
|---|---|
| `linocutBench(plan, { present })` | everything below wired to one plan; `update(t)` sets every pose and uniform. `present = { pos, tilt, yaw }` = where the print ends, facing the camera |
| `bench()` | 2.4 m pale wood plane (`woodTexture`, spec.wood) |
| `block(plan, U)` | birch-ply base, lino walls (open-top box) and the carved top: a 640 × 480 plane displaced by depth(t) from the carve bake; groove normals, cut colour, depth darkening and ink all in one patched MeshStandardMaterial (+ matching depth material for shadows) |
| `gouge()` | V blade (two bevelled steel plates), steel shaft, brass ferrule, turned mushroom handle; origin at the cutting tip, body along −X, tilted `spec.gouge.tilt` |
| `chips(plan)` | one InstancedMesh: a curled lino shaving per stroke (grey-green outside, tan inside) |
| `roller()` | brayer: inked rubber drum (roughness streaks so the roll reads), hubs, bent steel frame, wooden handle trailing −X |
| `paper(plan, U)` | the sheet: corner curl on a cylinder + hinge + rigid present matrix in the vertex shader (normals by finite differences, custom depth material); back face = the print, front face = the ghost |
| `baren()` | dark lacquered disc, bamboo face, knot handle |
| `caption()` | overlay plate (bottom-left, exact colours); `show(prev, text, u)` rolls the old line up and out while the new one rolls in — never two texts cross-faded on top of each other |

Planner `lino.js` (Node-safe; `style.plan`): `makeDesign` (the artwork as an SDF), `contourLoops` (marching squares),
`createLinoPlan(cfg)` → `strokes`, `toolAt`, `chipAt`, `rollerAt`, `inkFront`, `paperAt`, `barenAt`, `bake(nx, ny)`,
`rubBake(nx, ny)`, `events()`, `fingerprint()`. The demo records `fingerprint()` and throws in Node or Chrome if they
differ (`LINO_RECORD=1` to re-record after changing the design or timings).

## Signature motion

1. Low close-up from the front: the gouge ploughs four planned cuts round the crescent moon toward the camera at hand
   speed (~0.12 m/s); a curl rides the blade and is flicked onto the bench when the cut ends.
2. Time-lapse clearing (speed ramps ×7): the other outlines, the roof-tile lines and the cat's eye, then 19 deep
   clearing columns from far edge to near edge. The design is there, but pale on grey; everything is mirrored.
3. The roller lands and rolls without slipping; behind its contact line the raised top turns glossy black:
   the word reads backwards.
4. Paper hinges down from the far edge, the baren rubs four rows of loops (the ghost appears under its path), the
   near-right corner curls back on a cylinder showing the first black shapes.
5. The peel continues, the sheet lifts and flips (slerp) to face the camera parallel to the image plane beside the
   block: LOOK reads the right way round next to the backwards block.

All cuts run toward the viewer or sideways, so the handle trails away and never looms into the lens.

## Sound palette

Per hand-speed stroke `penScratch` + low `rustle` + `tick`; per time-lapse stroke one pitched `tick`, over a dense
`rustle` bed for the clearing; roller `thud` on landing, dense low `rustle` + `whir` while rolling; `paper` with a fold
thump when the sheet lands; one short `rustle` per baren loop; a slow `paper` + `rustle` peel; `whoosh` on the lift;
`marimba` chord (0-4-7-12, 220 Hz) + soft `chime` on the reveal; `pad` bed at 110 Hz. Every cue comes from
`plan.events()`.

## Tuning knobs (spec.js)

- `block`: size, ply / lino thickness, top-plane segments, bake resolution (1200 × 900 = 0.25 mm per texel).
- `linoShade`: top / cut / deep-cut colours, `ao` (groove darkening), mottle, roughness, `frontSoft` (s), `normalGain`.
- `inkShade`: ink colour, roughness + roller-streak variation, `inkMaxDepth` / `inkMinDepth` (what counts as raised).
- `print`: paper, ink, ghost strength, `speck` (salt-and-pepper), `transferSoft`.
- `gouge`, `chip`, `roller`, `barenShape`: dimensions. `caption`: plate geometry, font, `roll` / `lead` timing.
- Lights: the `key` must rake from the SIDE (left): with a front key the visible groove wall is the lit one and
  grooves read flat.
- Planner (`PLAN_DEFAULTS` in lino.js, overridable per scene): gouge widths/depths, clearing spacing, carve windows,
  speed ramp, roller / paper / baren / peel / present timings; `DESIGN_DEFAULTS` is the artwork.

## Known limitations (hit while building)

- Beat 2 is a time-lapse: ~74 strokes in 2.8 s, many only 1–3 frames long; the gouge visibly jumps between strokes.
- The two-slot bake (first stroke, deepest stroke per texel) loses an intermediate stroke's depth until the deepest one
  passes; invisible here, but a design with many overlapping cuts at different times would show it.
- At the beat-1 hop between the first two cuts the handle swings across the close-up and fills the left of the frame
  for ~0.1 s.
- Carved edges show a slight raster fringe at 0.25 mm per texel in the close-up (reads as hand-cut, but it is aliasing).
- The baren path misses ~0.5 % of the block (corners); those texels transfer at the end of the rub (art-directed).
- The print hangs in the air at the end (no hands, no easel) — it "lifts and faces the camera".
- A new design re-bakes at page load (~1 s for 1200 × 900, plus ~0.2 s of planning); keep designs bold (SDF shapes).
- Fonts: the caption uses the system stack (Avenir Next / Helvetica Neue); the LOOK lettering is geometry, not a font.
