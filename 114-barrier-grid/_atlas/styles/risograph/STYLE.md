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

## Limitations (hit while building)

- (filled in after the build)
