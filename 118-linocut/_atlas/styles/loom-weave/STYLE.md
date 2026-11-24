# Loom Weave (`loom-weave`)

**Look.** A pale honey-beech tabletop jacquard loom on a limed-oak table in bright daylight, seen from the weaver's side and
a little above. Forty cream warp threads run from the cloth beam (front) through a harness of string heddles (dark cords,
brass eyes, small lead weights hanging below) and a reed with brass dents to the warp beam (back). A boat-shaped shuttle
with a coloured bobbin flies the weft (red, gold, then blue) through the shed; the reed beats each row into the fell. The
cloth is drawn crossing by crossing by a shader that reads the weaving draft, so a lifted warp lies over the weft (cream
shows) and a lowered one under it (weft colour shows), with round thread profiles, arching over each crossing, twist and
per-thread tone. To the right a brown punched card feeds out of a wooden reader onto a warm lightbox, one row per pick, in
step with the cloth: its holes glow, and each row of holes lies beside the row of cloth it wove. Neutral tone mapping keeps
the palette as designed. Caption: a cream woven name-tape with a red running stitch and navy text (overlay, exact colours).

**Signature mechanic.** A weaving draft planned in `draft.js` (THREE-free, Node-safe):
- a motif bitmap (rows x warp threads, row 0 = bottom = woven first) plus plain-weave border rows give the **lift table**:
  for each pick, which warp threads rise. The lift table *is* the punch card (hole = thread rises = cream on top);
- picks speed up exponentially (`d_k = dMin + (dFirst - dMin) e^(-k/tau)`, tau solved by bisection so the last pick ends at
  `tEnd`): slow plain rows first, then a fast clatter in which the motif appears;
- each pick, as closed-form functions of its local phase: shed change (heddles move from last pick's lifts to this one's),
  shuttle flight with the trailing weft, reed beat (contact at 79 %), then the cloth AND the card advance one row;
- the fell, reed, harness and reader stay fixed; cloth row k and card row k advance together, so they always lie side by side;
- the reader's brass pins rise with the lifted threads; the newest row of holes pulses as it slides out;
- SCORE from the same plan: `clack` per shed change (gain ~ share of lifted threads), `whoosh` per throw (panned by
  direction), `click` when the shuttle lands, `thud` per beat, `tick` per card advance, all a little softer as picks speed up.

## Good for / avoid for
- Good for: "the first program", punched cards, Jacquard / Babbage / Lovelace history, "instructions -> output", data as a
  pattern, pixels and bitmaps, row-by-row generation (scanlines, autoregressive models emitting one row/token at a time),
  craft and making, emblem or logo reveals as woven pixel art, warm and friendly explainers.
- Avoid for: photographic or detailed images (40 x 30 crossings: bold pixel art only, two colours per row), anything that
  must change after it is woven (rows never change), smooth curves, dark moods, very fast cutting.

## Planner (`draft.js`; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `robotMotif()` | the demo motif: an original 40 x 30 robot (`{ W, H, cells }`, 1 = warp up / cream). |
| `rectMotif(W, H, rects)` | build your own motif from inclusive cell rectangles (`{ x:[x0,x1], y:[y0,y1], v }`, later wins). |
| `buildDraft(motif, { border, borderWefts, motifWeft })` | lift table + weft colour per row; `holes(k)`, `rowString(k)`, `motifRows`. |
| `planPicks(draft, { t0, tEnd, dFirst, dMin, close })` | the pick plan: `picks`, `tau`, `at(t)` (k, u, n advance, shedU, flyU, beat, adv, side, weftOn, weftZ), `lift(j, t, s)`, `events()`, `rowsDoneAt(t)`, `pickStart/End(k)`. |
| `loomVoices(spec.sound)` | voices for kit `scoreFromEvents` (shed / throw / catch / beat / advance). |
| `PHASE` | the per-pick phase fractions (shed, flight, beat, advance). |

Writing a motif: cream (1) = warp-faced figure, 0 = weft-faced ground in the row's weft colour. Each row has ONE weft colour,
so colour changes are horizontal bands; give the figure at least 2 cells of stroke width or it reads as noise at 1080p.

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `loom(plan)` | everything (table, frame, warp + harness, reed, shuttle, weft, cloth, card); `update(t, { boost })` (boost 0..1 brightens the card holes). |
| `cloth(draft, tex)` | cloth plane + draft shader (`userData.update(n)`). |
| `card(draft, tex)` | lightbox, card strip shader (glowing holes, seams, lace holes), reader housing, brass pins, card roll; `userData.update(n, pinUp, pulseRow, pulse, boost)`. |
| `warp(plan)` | 3 instanced segments per thread (lead, fell -> eye, eye -> back beam), heddle cords, eyes, weights. |
| `reed()`, `shuttle()`, `weft()`, `frame(rows)`, `table()` | parts; each has `userData.update(...)`. |
| `draftTexture(draft)` | W x N DataTexture (rgb = weft colour sRGB bytes, a = lift). |
| `caption()` | overlay name-tape, `userData.show(text, alpha)`. |

## Sound palette
`clack` (heddle/hook clatter, pitch 0.7), `whoosh` (shuttle throw, short, pitch 1.6, panned), `click` (shuttle lands), `thud`
(reed beat, pitch 1.3), `tick` (card advance), a warm `pad` bed (147 Hz, 800 Hz cutoff), one soft `whoosh` per camera move
and a `chime` on the final line in the demo. All times from the pick plan / BEATS.

## Knobs (spec.js)
- `loom`: warps, spacing, pick pitch, x0, plane height, fell / reed / heddle / back-beam z, shed rise and drop, shuttle path,
  rails, harness height, 3D thread radius, cloth relief.
- `card`: x0, column pitch, margin, hole size (share of pitch), rows per card (seams + lace holes), glow, pulse, boost, weft radius.
- `shuttle`: size and rest positions. `wefts`: border colours (cycled) and motif colour. `caption`: tape look.
- `sound`: gain / pitch per voice and the bed.

## Known limits (seen while building the demo)
- Only two colours per row (warp cream + that row's weft): multi-colour figures need weft bands or a second motif weft.
- Weft-faced ground rows float the weft across the full width (not structurally real cloth; reads fine at this scale).
- The card's physical linkage to the harness is implied (pins on the reader rise with the lifted threads); no cords connect them.
- At the fastest picks (0.2 s) the shuttle crosses in ~3 frames: it reads as a flicker, not a flight. Keep `dMin` >= 0.2.
- Thread joints at the fell and the heddle eyes are plain cylinder ends; close-ups closer than the demo's opening show them.
- The cloth shader uses `fwidth` for anti-aliasing (computed before the discard, outside branches); the 3D warp lead under
  the woven cloth is hidden by the opaque cloth plane, not removed.
