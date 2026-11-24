# Risograph

**Look.** A sheet of rough off-white paper on a slate-teal print tray, filling the frame at a slight tilt, printed one
flat ink at a time by a drum that rolls across it on two steel rails. Three inks: fluorescent pink, medium blue, warm
yellow. Coarse halftone dots (each ink at its own screen angle: 15°, 75°, 45°), slightly ragged dot edges, ink that skips
on the paper tooth and lies a little unevenly. Where inks overlap they multiply into purple, green, orange-red and a
near-black. Registration marks in the margins show each layer's error as three offset crosshairs.

Motion type: art-directed. The drum path, the reveal line, the registration error, the two nudges and the sprung snap are
eased / closed-form functions of t chosen for readability. The overprint colour model is the standard multiply
approximation (paper × Π(1 − coverage × density × (1 − ink)) in linear RGB), not a spectral ink model; the cosine spot is a
common analytic halftone threshold, not a measured riso screen. Not checked against a real duplicator.

**Good for:** how layered printing works (separations, overprint, registration), "three ingredients make every colour",
before/after alignment reveals, poster / zine / indie-print looks, anything where layers add up to a picture.
**Avoid for:** photographic subjects (the poster is flat shapes), fine type (the screen breaks thin strokes unless tone 1),
long holds on the macro (fine dots under camera moves cost bitrate).

## Props (`createStyle(stage).props`)

| prop | what |
|---|---|
| `risoPress(plan, { poster })` | the whole set: tilted rig with tray, sheet (print shader), drum + table; `update(t)` reads `plan.uniformsAt(t)` |
| `printMaterial(poster)` | MeshStandardMaterial with the print injected (`onBeforeCompile`); `userData.set(u)` takes `{ reg, line }` per ink |
| `sheet(mat)` | printed top plane (sheet-local xy) over a 4 mm paper body + soft contact shadow |
| `tray()` | enamel tray (top at y = 0), rim, two steel rails for the drum brackets |
| `drum()` | ink sleeve (colour = weights of the three inks), clamp bar (shows the roll), flanges, hubs, axle, brackets; `userData.set(plan.drumAt(t))` |
| `table()` | matte plane under the tray |
| `caption()` | overlay chip: paper plate, ink outline, hard pink offset shadow, three overprinted ink discs; `userData.show(a, b, u)` rolls `a` up and out while `b` rolls in (never two texts on top of each other) |

Planner `riso.js` (Node-safe, `style.plan`): `POSTER` (the artwork as shapes + tone per ink), `posterTones(P, x, y)` (JS
twin of the shader), `posterGLSL(P)` (the same numbers as anti-aliased GLSL), `planRiso(spec, timing)` → `{ passes,
drumAt, lineAt, regAt, regFrac, uniformsAt, events, stats, fingerprint }`, `risoVoices(spec)`, `sheetToWorld(spec, sx, sy)`.

## Signature motion

1. The drum lands, rolls across the sheet (inOutSine) and the ink appears exactly behind its contact line; passes
   alternate direction.
2. Parked at the tray edge, the drum spins once while its sleeve changes to the next ink (a pluck at that ink's pitch).
3. A layer lands off-register (offset + small turn about the sheet centre); later two eased nudges (outBack) and a sprung
   snap (`spring`, ζ ≈ 0.44) bring every layer into register.

## Sound palette

Per pass: `thud` (pitch by ink) + `paper` slide + `whir` drum roll at half the ink pitch. Re-ink: short `whir` spin +
`pluck` at the ink pitch (pink A3, blue C#4, yellow E4). Snap: `paper` slide, two `clack` nudges, `click` + `clack` +
`thud`, then a `marimba` chord of the three ink pitches (A major) with a soft `chime`. Bed: `pad` on A2. Whoosh per camera move.

## Tuning knobs (spec.js)

`inks[]` (colour, density, screen angle, pitch) · `halftone.cell` (screen pitch; keep ≥ ~16 px on screen in the wide) ·
`gain`, `rough`, `toothSkip`, `mottle`, `paperTone` · `sheet` size / tilt · `drum` radius · `caption` · `sound` gains.
The artwork: `POSTER` in riso.js (sky band tones, sun, ridges, sea rows, glint, bird, registration marks).

## How the print shader works (copy this if you need layered screened inks elsewhere)

One `MeshStandardMaterial` with the print injected at `#include <map_fragment>` (`onBeforeCompile`, cache key
`risoPrint-v2`), so real lights and the drum's shadow map fall on the print. Per pixel: `aa` = one pixel in sheet metres
from `fwidth` (computed once, outside any branch); per ink (constant 3-step loop, uniform control flow): rigid
registration transform → `posterTone(q, aa)` (analytic shapes, edges anti-aliased over `aa`) → cosine spot
`0.5 − 0.25(cos 2πx + cos 2πy)` at the ink's screen angle → coverage `smoothstep(±w, tone' − spot + rough)` with
`w = fwidth(...)` → × reveal line × mottle × tooth skip → multiply overprint. Cells under ~3 px fall back to the mean tone
(no aliasing). Grain (`rsGrain`) is fbm whose octaves fade in only once they are ≥ ~3 px on screen.

## Demo (117-risograph)

Beats: First ink: pink shapes (0) · Second ink: blue on top (3) · Third ink: out of line (6) · Line them up: it snaps (9) ·
Three inks made them all (12). Camera: wide hold → push to the bird on the sun's edge → pull to a medium → two small
nudges and the snap at 10.7 s → push to a macro of the far range's rosettes → back out to the full print. Shots are
`framing.fitShot` keys on the tilted sheet; `framingReport` gates the bird and macro (above the caption) and the final wide.
Rendered at CRF 25 (11.3 MB); at CRF 22 it was 17.4 MB.

## Limitations (hit while building)

- Bitrate: every camera move and the snap shift thousands of dots at once (2–2.3 MB/s in those seconds at CRF 24). The demo
  holds the camera while the drum works, keeps moves ≤ 1.3 s and ships at CRF 25; grain octaves finer than ~3 px are
  dropped. A longer piece with constant camera motion would need a coarser `halftone.cell` or fewer moves.
- The first grain version (single value-noise octave, threshold 0.6–0.88) showed "+"-shaped lattice blotches in solids at
  close range; the rotated fbm fixed it. Keep the tooth subtle: strong skip reads as dirt in the macro.
- The fold between lit and shaded mountain facets is a slanted straight line per peak; with a vertical fold the facet
  edge read as a seam through the halftone.
- The drum re-inks while parked off the sheet; in the tight wide the left park position is out of shot, so the blue →
  yellow colour change happens off-frame (pink → blue is visible on the right).
- The bird is a near-black brown (all three inks), not true black: the multiply model with these three inks bottoms out
  around #321a0a. A fourth black ink would be needed for real blacks.
- Overprint is a multiply in linear RGB with a density factor per ink; no ink trapping, opacity or paper absorption model.
- The registration "slide" of a printed layer is art-directed (real misregistration is fixed once printed).
