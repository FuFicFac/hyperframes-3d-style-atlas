# Chalkboard (`chalkboard`)

A real classroom chalkboard filmed in 3D: a mottled green slate in a worn oak frame with a chalk tray (sticks, a felt
eraser, dust) on a sage plaster wall, side-lit by a soft window spot from the left (falloff across the board, frame
shadows). Chalk is stamped stroke by stroke into a board canvas as a pure function of t — grainy dabs, pressure that
lands heavy and lifts light, skips — and shown through a **tooth shader** (coverage = smoothstep against a slate-tooth
texture), so faint chalk catches only the peaks. Hand-jittered stroke-font lettering, wobbly lines, circles that never
close, hatch-scribble fills, ghosts of half-erased old lessons, a floating chalk stick that rides the stroke tip and
sheds falling dust, and an eraser that lifts off the tray, wipes in rows and leaves a dusty ghost.
Looks nothing like blueprint-build: loose and dusty, not precise ink; no 3D objects drawn, the board is the canvas.

**Good for:** "teacher explains" topics, worked examples, simple charts/diagrams built piece by piece, myth-vs-fact,
"the wrong answer, crossed out", nostalgic/educational tone. **Avoid for:** dense paragraphs, photo/product subjects,
precise technical drawing (use blueprint-build), anything needing lowercase or many fast cuts.

## Props (`style.props`) / factories (`chalkboard`, `wall`, `windowMullions`)
| prop | what |
|---|---|
| `board({ sticks, eraserRest })` | slate + backing + oak frame + tray (lip, brackets, dust decal), chalk sticks, eraser, floating chalk, dust points. `userData.setPlan(plan)`, `update(t)` (paints the board, moves chalk/eraser/dust), `rest`, `parts` |
| `wall({ w, h })` · `windowMullions()` | painted wall plane · optional shadow-only window bars (`spec.window.enabled`, off by default) |
| `chalkStick(color, len)` · `eraser()` · `floatingChalk()` · `dust()` | the individual props (reusable in other sets) |

## The chalk program (`chalk.js`, Node-safe; `style.plan`)
`planChalk(program, spec.chalk) → { strokes, ops, events, byId, end }`. Items (board metres, centre 0,0, y up), each
with `at` | `after`+`gap` | chain, `color` (white/yellow/pink/blue/green or hex), `speed`, `pressure`, `seed`:
`text {text,x,y,cap,align,heading,lineHeight}` (heading = double-stroked) · `line {a,b,bow}` · `arrow {a,b,head}` ·
`circle {c,rx,ry,a0,sweep}` · `box {x0,y0,x1,y1}` · `bar {x0,y0,w,h,hatch:{color,spacing,angle}}` · `hatch {rect}` ·
`underline {x0,x1,y,double,spacing}` · `strike {x0,x1,y,n}` · `tick`/`xmark {c,size}` · `smudge {pts}` · `erase {rect,strength}`.
Helpers: `chalkText`/`textBox(item)` (measure jittered ink to place blanks/circles), `CHALK_FONT` (stroke font + `_ ≠ ✗ ✓`),
`tipAt`, `eraserAt`, `strokeProgress`, `pressureAt`, `hatchPath`, `erasePath`, `chalkVoices(spec.sound)`.
Framing (same module, pure): `boardShot(regions, { ...spec.camera.framing, plan })` → a camera key `{pos,target,fov}` that
looks square-on at the regions (item ids or board boxes) from eye level (`up` .02 m above their centre, `side` .16 m right)
and backs off until they fit `|NDC| ≤ safe` (.84). `framingReport(plan, CAMERA, { ...framing, duration, drift })` replays
the kit rig (eases + drift) every 0.1 s and fails any sample where a started heading or an item being drawn passes
`limit` (.9 = the outer 5 %). `itemBox`, `unionBox`, `projectPoint`, `sampleCameraKeys` are exported too.
Recipe (21-chalkboard): config builds `PLAN = planChalk(PROGRAM)`; BEATS from `PLAN.byId`; CAMERA = `boardShot` shots
(always including the heading) keyed on plan times, then `if (!framingReport(...).ok) throw` so a bad shot fails the build; SCORE =
`scoreFromEvents(PLAN.events, chalkVoices())`; scene: `board.setPlan(PLAN)`, then `board.update(t)` → `rig.update(t)` → `stage.render(t)`.

## Signature motion
Natural writing order at explainer pace (~2× a teacher; ~10 chars/s), pen-up hops between strokes, slow landings and
quick lifts. Emphasis = double underline, loose circle, pink strike. Eraser pass = lift, boustrophedon rows, return.
Camera: square-on at eye level, computed shots only. Gentle moves (3.4–4.0 m, ~1 s inOutSine) between holds; every shot
includes the heading, so a push-in never crops it, and the active item is in frame before its first stroke. End on the
whole-lesson frame. Don't hand-type `pos`/`target`: the old hand-typed keys put the camera ~0.3 m below the content and the
heading went off the top through the middle of the clip.

## Sound palette (all from the plan)
`penScratch` (pitch ~.5, speed from stroke velocity) per stroke; low `click` tap on landings, louder after long lifts;
`paper` (pitch .36, density .9) per erase; soft `thud`s for eraser lift/drop. Room bed: `pad` 55 Hz, `brightness` 380 Hz,
gain .5 + quiet `rumble` (demo mean −22 dB, peak −5 dB).

## Tuning knobs (`spec.js`)
- `chalk`: `width`, `flow`, `stampSpacing`, speeds (`textSpeed` caps/s, `minTextSpeed`, `speed`, `hatchSpeed`, `retrace`),
  gaps (`penUp`, `charGap`, `wordGap`, `lineGap`, `itemGap`), `jitter` (wobble, baseline, slant, scale, rot), `shape`, `pressure`
  (landing, taper, skip), `eraser` (size, band, speed, strength, smear .1 — the wipe haze feathers out toward the rect
  edge so it no longer reads as a grey box), `smudge`.
- `camera.framing` {safe, limit, side, up, minDist, maxDist, pad}: shot fitting and the framing gate.
- `tooth` {repeat, floor, soft, gain, haze, micro} — the chalk/slate look lives here. `slate` {mottle, ghosts, ghostLevel,
  erasedTo, smears, dustEdge}. `board` {w, h, frame, tray, ppm}. `floatChalk`, `dust`. Lights: window spot + hemisphere.

## Known limitations
- Framing is a hard trade with a full board: the heading must stay in, and this demo's lesson spans the whole slate, so
  the tightest shot is ~3.4 m and the closing hold ~3.95 m (body caps ≈ 60 px, chart labels ≈ 38 px at 1080p). Shorter
  lessons that use half the board get closer. `framingReport` models linear camera paths only (no `path: "arc"`).
- The bottom ~12 % of the slate carries the tray-dust haze; labels placed below y ≈ −0.8 m sit in it (still readable).
- Uppercase only (kit stroke font); `✗` reads as a plain X. Handwriting is printed caps, not cursive.
- Pace: 15 s holds ~140 characters only at ~10 chars/s — faster than real chalk; trim copy before slowing it down.
- The board canvas is 2040×1140 (600 px/m): a push-in closer than ~3 m starts to soften strokes; raise `board.ppm`.
- Every frame re-copies and re-uploads the full chalk canvas while something is drawing (~9 MB texture upload);
  a backward seek repaints the whole lesson (fine for render, the scrub player can hitch).
- The eraser reads as a brown block edge-on; the floating chalk is small in wide shots (it's 1.5× real size).
- Vertical frame rails show the kit wood texture's wavy grain across the rail (UV runs across, not along).
- Window mullion shadows (optional) read as dark blobs across the writing at these distances — left off.
