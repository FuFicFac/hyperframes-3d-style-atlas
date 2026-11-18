# Newspaper Press (`newspaper-press`)

A broadsheet front page as a physical object on a dark print-shop imposing table, seen from above with a small forward
tilt. Warm off-white newsprint with cloudy formation and short fibres, a horizontal fold tent and a faint quarter fold,
slight show-through of the other side's print, yellowed edges. Heavy black serif headlines set to fill the measure
(condensed by the painter when needed), a generic didone masthead ("THE DAILY SAMPLE" by default), ears, a dateline strip
("SAMPLE EDITION", never a real date unless supplied), double rules, six columns with column rules, greeked justified body
text (random-letter words, never real copy), a boxed key line, and halftone "photographs" generated procedurally from
simple shapes. Neutral tone mapping, no bloom, light vignette, camera locked still during holds.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/29-newspaper-press/`.

**Signature mechanics**
1. **Spin-in** — the page spins in from depth about the frame centre (1¼ turns, decelerating, tilt settling) and lands flat
   with a soft thud, a tiny sheet flutter and a 2 mm camera kick.
2. **Live print** — a rubber ink roller (brayer) rolls down a blank sheet; headline, rules, columns and photo appear behind
   its contact line with a wet sheen that dries over ~7 % of the page.
3. **Develop** — a halftone starts as pin-prick dots and the dots grow to full tone.
4. **Emphasis** — the camera pushes into a column and a red grease pencil (china marker) loops the key line.
5. **Scene changes** — the top page turns over to the left with a curl, or a bundle of the edition thumps down onto the stack.

**Good for:** news-style explainers, announcements, "what happened" recaps, history ("the day X happened"), step-by-step
stories told as successive front pages, a single key line to circle.
**Avoid for:** data/charts (no chart props), anything that needs many readable labels at once, dark/neon moods, long
copy that must be read (body text is greeked by design), fast cutting (sheets are big; the turn needs the camera to rise).

## How it works
Each sheet is baked ONCE at load (`bakeSheet`) into one RGBA `DataTexture`: R = black ink (canvas text/rules), G = photo
tone (procedural greyscale function, per texel), B = the other side's print (half-res, mirrored), A = photo mask. The newsprint
shader (MeshStandard + `onBeforeCompile`) computes halftone dots per pixel from G (45° screen, `halftone.pitch`, analytic AA
via `fwidth`, fades to flat tone when a cell is under ~2–4.5 screen px — no moiré), reveals ink where `v > uHead`, grows dots
with `uDevelop`, darkens paper by B at a blurred mip (show-through), adds fold creases and edge yellowing. No canvas is redrawn
per frame. The sheet mesh (44×72) is rewritten only by `setTurn(u)` (pure deformation; memo keyed by `u`).
The bake canvases are created with `getContext("2d", { willReadFrequently: true })`, which keeps them on Skia's CPU rasterizer.
Under HyperFrames' `--enable-gpu-rasterization` the GPU-rastered masthead glyphs differed by ±1–2 alpha levels on every page
load (stable within a load). That changed the baked ink channel, so `check-frames` determinism failed about 2 runs in 3. Fixed
2026-11-13: the baked data is now bit-identical across loads. Keep this flag on any canvas you bake into a texture.

## Props (`style.props`)
| factory | what it makes |
|---|---|
| `frontPage(content, { ppm, segments, shadow })` | the broadsheet (0.58 × 0.74 m). `content`: `masthead, ears[2], dateline[3], headline, deck, byline, photo {kind, seed}, caption, key {text, col, span, at}, story2, photo2, index, seed`. userData: `setInk(v)`, `setDevelop(u)`, `setTurn(u)`, `setSpin(pose, pivot)`, `setShadow(k)`, `surfaceAt(x,y)`, `local` (page frame for attachments), `rects` (masthead, headline, deck, photo, key, keyBox, aboveFold, columns…) |
| `halftoneImage({ photo, w, h, ppm })` | a loose printed photo clipping (no folds) |
| `pullQuoteCard({ quote ("\n" lines), attribution, w })` | a clipping with quote mark, headline-type quote, rule and attribution |
| `inkRoller({ r, len, handle })` | brayer in PAGE-LOCAL coords (add to `sheet.userData.local`); `userData.set(press.rollerAt(t, ink, S))` |
| `greasePencil(path, { width, surfaceAt })` | waxy red stroke ribbon (grainy coverage, round head) + china marker; `userData.update(press.strokeAt(t, st), press.pencilPose(t, st, S))` |
| `paperStack({ sheets, thick, top: content, ppm })` | bundle of three offset blocks with striped sheet edges, a printed `frontPage` on top; `userData.setDrop(press.dropPose(t, drop, S))`, `userData.top` |
| `desk({ w, d })` | dark grey steel/stone imposing table with old ink smudges |
| `label(text, o)` | kit text label in the style's ink |

Helpers: `inkPass(sheet, roller)(t, ink)`, `spinIn(sheet, pivot)(t, spin)`, `bakeSheet`, `printedSheet(layout)`, `layoutPage`, `cardLayout`, `photoFn`, `restZ`.
Factories (OBJECTS): `desk`, `frontPage` (`dims: { content, ppm }`), `paperStack`, `inkRoller`, `pullQuoteCard`, `halftoneImage`.

## Planner `press.js` (THREE-free; import it in `scene.config.js`)
`layoutPage(content, S)` (headline auto 1–2 lines, painter fills the planned width) · `cardLayout(kind, content, S)` ·
`photoFn({ kind: "skyline"|"notebook"|"press"|"portrait"|"gradient", seed })` · `circlePath(rect, o)` / `underlinePath(rect, o)` ·
`planEdition({ spin, turn, ink, develop[], pencil[], drop, moves }, S)` → `plan.events` · pose functions `spinPose`, `turnAt`,
`inkHead`, `inkTimeAt(v, ink)`, `pageV`, `rollerAt`, `developAt`, `strokeAt`, `pencilPose`, `dropPose`, `kickAt` ·
`shotFor(pageRect, { fov, tilt, margin, origin, dx, dy })` top-down camera keys · `pressVoices(S.sound)` for `scoreFromEvents`.

## Recipe
1. Write the copy per page (≤ ~26-char headlines; mark placeholders SAMPLE). `layoutPage` it in `scene.config.js` to get rects.
2. `PLAN = planEdition(...)` with times derived from BEATS (develop at `inkTimeAt(pageV(photoBottom))`); SCORE = pad bed + `scoreFromEvents(PLAN.events, pressVoices(S.sound))`.
3. Camera: `shotFor(aboveFold)` for the page, `shotFor(keyBox ± margin)` for the push-in. **Rise the camera during a page turn**
   (the sheet stands up to ~0.4 m; the demo keys a `margin: 0.75` shot at the turn's midpoint). Hold the camera still otherwise.
4. renderAt: `spinIn`, `setDevelop`, `setTurn`, `inkPass`, pencil `update`, stack `setDrop`, `rig.update`, then add `kickAt(t)` to the camera y.
5. Give a sheet the camera pushes into `ppm: 5000`; others 4200 (≈ 43 MB / 31 MB GPU each before mips).

## Sound palette (all from `plan.events`)
Spin: `whoosh` in + light `paper` flutter; land: soft `thud` (pitch .7) + `paper` slap. Turn: `paper` with fold + quiet `whoosh`.
Ink pass: `thud` touch-down, low `whir` (62→70 Hz, grit .55) + `rustle` (tacky ink), a quiet `clack` press tick every 0.32 s.
Develop: quiet `riser` ending with a 3-note `chime`. Pencil: `click` + `penScratch` (pitch .55, speed .75). Drop: `whoosh` in +
heavy `thud` (pitch .55) + dense `paper`. Bed: `pad` root 98 Hz, `brightness: 650` (Hz cutoff), gain .52, plus `rumble` .05.
Demo measured: −21.7 dB mean, −2.1 dBFS peak (levels measured, not listened to).

## Tuning knobs (`spec.js`)
`page.*` (size, ppm, margins, columns, leading, fold ridge, waviness, corner lift) · `fonts.*` (stacks, cap model, `fitRange`) ·
`paper.*` (base colour, fibre/grain, `showThrough`, `showBias`, fold darkness) · `ink.*` (colour, density, wet band) ·
`halftone.pitch` (dot cell, m; ≈ 9–10 px at the full-width shot), `halftone.flatBelowPx` (anti-moiré fade), `developFloor` ·
`spin.*`, `turn.*` (bend, corner lead), `roller.*`, `grease.*` (width, wax coverage, lead-in/out), `stack.*`, `sound.*`.

## Known limitations
- The page turn is a top-down shot of a sheet that stands up: the camera must rise during it, and mid-turn the sheet fills
  much of the frame. The turned page's back is a half-res greeked layout (blocks of grey), fine in motion, plain when held.
- Body text is random-letter greek by design; it reads as gibberish when the camera pushes in (as intended — never put real copy there).
- Headline widths are planned from a character-count model (`fonts.capWidth`) and the painter condenses/stretches into that
  width (clamped 0.7–1.12): very wide words get visibly condensed; very short lines stay centred and narrower.
- Halftone photos are simple procedural scenes (skyline, notebook, press rollers, an anonymous silhouette); mid-tones read
  as a checkerboard up close. The develop is most legible on strong silhouettes (skyline) and weakest on light scenes (notebook).
- Fine text + halftone are bitrate-heavy: the demo is 12.8 MB at CRF 22 with the camera locked during holds; it ships at CRF 23 (11.1 MB, re-rendered 2026-11-13; pass `--crf 23` to build.mjs, which defaults to 22).
- Sheets hover ~0.6 mm apart; the stack sits 4 mm above the lower sheet to clear its fold tent (invisible from above).
- Fonts are macOS system faces (Charter, Bodoni 72, Times New Roman); elsewhere they fall back to Georgia/Times and widths shift.
- Shadows of sheets come from soft decals, not the shadow map (except a turning page, which casts for real).
