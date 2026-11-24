# Linocut

A grey-green lino block mounted on birch ply sits on a pale wooden bench under a low, warm side light. A V-gouge with a
turned wooden handle ploughs grooves into it and lifts curls of lino that flick onto the bench; cut lino shows paler and
warmer than the uncut top. A black rubber roller rolls across and only the raised parts turn glossy black, with roller
streaks in the sheen. Cream paper hinges down, a round baren rubs loops over it (the image ghosts through the sheet
where it has passed), and the sheet peels back from one corner: the print is solid black and cream, salt-and-peppered
where the ink was thin, and it is the MIRROR of the block — a backwards word on the block reads correctly on paper.

Motion type: Art-directed. The carving order, stroke speeds, roller, paper, baren and peel are planned for clarity, not
simulated. The groove depth is a closed-form V profile per stroke combined by a maximum over strokes (never stepped);
the inking rule (only texels shallower than ~0.34 mm catch ink) and the transfer under the baren are simple
thresholds, not a physical ink model. No claim of historical or physical accuracy beyond "this is how relief printing
works: carve away what should stay white, ink the top, print a mirror".

## Good for / avoid for

- Good for: how printing works, "negative space" / subtractive thinking, mirrors and reversal, craft explainers,
  titles that reveal themselves (a backwards word that prints the right way round), anything about stamps, seals,
  type and impressions.
- Avoid for: fine detail or small text (the gouge widths set a ~3 mm minimum line; cap height ≥ 40 mm on a 0.3 m block),
  colour (one ink, one block — use `ukiyo-e` or `risograph` for colour layering), long sequences of carving (the
  per-texel bake is per design; a new design re-bakes in ~1 s at page load).

## Props (style.props)

| prop | what it is |
|---|---|
| `linocutBench(plan, { present })` | everything below wired to one plan; `update(t)` sets every pose and uniform |
| `bench()` | 2.4 m pale wood plane (`woodTexture`, spec.wood) |
| `block(plan, U)` | birch-ply base, lino walls (open box), and the carved top: a 640 × 480 plane displaced and shaded from the carve bake |
| `gouge()` | V blade (extruded V), steel shaft, brass ferrule, turned mushroom handle; origin at the cutting tip, body behind along −X, tilted `spec.gouge.tilt` |
| `chips(plan)` | one InstancedMesh: a curled lino shaving per stroke (green outside, tan inside) |
| `roller()` | brayer: inked rubber drum (roughness streaks so the roll reads), hubs, bent steel frame, wooden handle trailing −X |
| `paper(plan, U)` | the sheet: corner curl on a cylinder + hinge + rigid present matrix in the vertex shader; back face = print, front = ghost |
| `baren()` | dark lacquered disc, bamboo face, knot handle |
| `caption()` | overlay plate, bottom-left, exact colours; `show(prev, text, u)` rolls the old line up and out as the new one rolls in |

Planner (`lino.js`, Node-safe, `style.plan`): `makeDesign`, `contourLoops` (marching squares), `createLinoPlan(cfg)` →
`strokes`, `toolAt`, `chipAt`, `rollerAt`, `inkFront`, `paperAt`, `barenAt`, `bake(nx, ny)`, `rubBake(nx, ny)`,
`events()`, `fingerprint()`.

## Signature motion

1. Close, low, behind the gouge: it follows four planned contour cuts round the crescent moon at hand speed (~0.12 m/s),
   a curl riding the tip of each and flicked onto the bench at the end.
2. Time-lapse clearing: the remaining contours, roof-tile lines and the cat's eye, then ~19 clearing columns with a
   deeper V; speed ramps ×7 over the first strokes. The design is there but pale on grey.
3. Roller lands, rolls without slipping; behind its contact line the raised top turns glossy black: the word reads
   backwards.
4. Paper hinges down from the far edge; the baren rubs four rows of loops; the ghost appears under its path; the
   near-right corner curls back and shows the first black shapes.
5. The sheet keeps peeling, lifts, flips (slerp) and faces the camera beside the block: LOOK reads the right way round.

## Sound palette

Per stroke: `penScratch` + low `rustle` + a `tick` (long strokes) or a single pitched `tick` (time-lapse strokes) over a
dense `rustle` bed; roller: `thud` on landing, dense low `rustle` + `whir` while rolling; paper: `paper` with a fold
thump; one short `rustle` per baren loop; a slow `paper` + `rustle` peel; `whoosh` on the lift; a `marimba` chord
(0-4-7-12) + soft `chime` on the reveal; `pad` bed at 110 Hz.

## Tuning knobs (spec.js)

- `block`: size, ply/lino thickness, top-plane segments, bake resolution (1200 × 900 = 0.25 mm/texel).
- `linoShade`: top / cut / deep-cut colours, mottle, roughness, `frontSoft` (cut front softness in s), `normalGain`.
- `inkShade`: ink colour, roughness + roller-streak variation, `inkMaxDepth`/`inkMinDepth` (what counts as "raised").
- `print`: paper, ink, ghost strength, `speck` (salt-and-pepper), `transferSoft`.
- `gouge`, `chip`, `roller`, `barenShape`: dimensions. `caption`: plate geometry, font, roll time.
- Planner (`PLAN_DEFAULTS` in lino.js, overridable from the scene): gouge widths/depths, clearing spacing, windows,
  speed ramp, roller/paper/baren/peel/present timings, and `DESIGN_DEFAULTS` (the artwork).

## Known limitations

- Written while building; see the demo's HANDOFF/final report for what was verified.
