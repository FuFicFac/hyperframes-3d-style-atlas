# Split-Flap Board (`split-flap-board`)

A mechanical railway/airport departure board hanging in a dim hall. Rows of black split flaps with off-white
DIN-condensed characters sit in recessed slots of a dark powder-coated housing, under a brushed-aluminium header
strip and frame, with printed column/row labels and three indicator lamps per row. Every cell is a real split-flap
mechanism (static top half, static bottom half, one falling flap, axle gap, side spools). Characters never cut:
each cell steps forward through the charset ~15 flips/s, so rows resolve in a left-to-right ripple with uneven
arrival times. A warm key rakes from upper left; mid-flip flaps catch it and shadow the half below.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/07-split-flap-board/`.

**Good for:** status lists, "what's ready / what's not", leaderboards, schedules, rankings, short reveals of a few words, before/after re-flips.
**Avoid for:** long sentences (> ~26 chars a row), lowercase or non-Latin text, charts, organic subjects, fast-cut edits.

## Files
`spec.js` (all numbers), `style.js` (Three code), `flaps.js` (**pure** layout + flip planner, no THREE — imported
by `scene.config.js` so the SCORE is generated from the same schedule as the picture).

## Props (`style.props`) and pure helpers (`style.motion` = flaps.js)
| factory | what it makes |
|---|---|
| `board(def)` | whole board. `def = { header:{cols,scale}, columns:[{id,cols,label}], rows:[{id,label?}], footer:{cols}, lampColors }`. `userData`: `layout`, `plan`, `setRowText(row, text, at, {block, align}) → {start, arrive}`, `program(items)`, `update(t)`, `state(i,t)`, `lamps[row][color]`, `setLamp(row, color, level)` |
| `housing(layout)` | face plate with slot per row block, brushed header strip, frame bars, back box, hanger rods, screws, printed labels |
| `flapBank(layout)` | instanced cells: static tops/bottoms + flaps (front/back/rim) + spools, axles, fins. `userData.write(i, state)`, `commit()` |
| `lamp({ color, r })` | bezel + domed lens, `userData.setLevel(0..1)` |
| `hall({ w, h, z })` | concrete back wall |
| `glyphAtlas()`, `flapMaterial()`, `paintLabel(text)` | atlas (one whole flap face per glyph + edge cell), atlas material with per-instance glyph remap, painted housing text |

Pure (`flaps.js`): `layoutBoard(def, spec.board)`, `planBoard(layout, program, charset, tuning, seed)`, `addText(plan, item)`,
`cellState(segs, t, charset, tuning) → {top, bottom, front, back, angle}`, `blockText`, `flipEvents(plan)`,
`clatterScore(plan, {bin, gain, maxGain, click})`, `fitText`, `charIndex`. `style.motion.blink(t, from)` for lamps.
`style.factories`: `board`, `hall` (OBJECTS `primitive: "procedural"`, `dims` = the def).

## Recipe
1. In `scene.config.js`: `layoutBoard(BOARD, STYLE_SPEC.board)`, `planBoard(...)` with a `PROGRAM = [{ row, block, text, at }]`
   (row ids `header`/`footer` use block `text`); derive lamp on/off from `plan.items[].arrive`; `SCORE = clatterScore(plan) + ...`.
2. In `scene.js`: `board.userData.program(PROGRAM)` then `board.userData.update(t)` and `setLamp(...)` in `renderAt`.
3. A row ripples as one wave across all its blocks (stagger uses the cell's order in the row). Re-flips start from what's showing.

## Mechanism (do not "simplify")
During a flip cur→next: static top = next top, static bottom = cur bottom, flap front = cur top, flap back = next bottom.
Rotation is about +X from 0 (up) to π (down); the back face's UV is v = 0.5 − y/H so it lands upright, not mirrored.

## Default sound palette
`clatterScore`: one `clack` (+ quiet `click`) per row per 25 ms bin, gain ∝ √flips, panned by x, header flaps lower.
`tick` (pitch .55) relay when a lamp switches. `chime` (pitch .8) on a boarding/arrival moment.
Hall bed: overlapping `rumble` (dur 5, every 2.4 s, gain .32) + very dark `pad` (root 55 Hz, brightness 260, gain .1).

## Tuning knobs
`tuning`: `rate`, `rateJitter` (keep non-integer vs 30 fps so falls are sampled at varied phases), `colStagger`, `startJitter`,
`fallFrac`, `fallKick`, `bounceAmp/Half/Decay/Hold`. `board`: `pitch`, `cellW/H`, `axleGap`, `rowPitch`, `recess`, `misalign`.
`atlas`: `font`, `capHeight`, `glyphWidth`, `hingeShade`, `charset` (order = cycling order). Look: `world.exposure`, key light, `lamps.onStrength`.

## Known limitations
- 26 columns (14 + 12) is the legible maximum at 1080p for a full-frame board; header/footer 15–17 cells.
- Flaps protrude ~0.2 m out of the slots at mid-fall; fine near frontal, odd beyond ~25° off-axis.
- Long wraps (e.g. Y→B) take 40+ flips (~2.8 s): plan the timeline around `arrive`, not `at`.
- Lamps are emissive + bloom only (no light spill onto the housing). Green cores desaturate under ACES above ~1.5.
- Glyphs are OS-rasterised DIN Condensed (falls back to Helvetica Neue elsewhere). Flap shadows ignore the rounded corners.
- The hall wall barely reads; the board carries the frame. `flaps.js` is the documented optional fourth module (`references/style-authoring.md` §1).
