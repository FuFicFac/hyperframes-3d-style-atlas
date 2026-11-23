# CRT Retro (`crt-retro`)

A beige 1970s–80s computer terminal on a walnut desk in a dark room at night. A chunky yellowed-plastic monitor
(bevelled bezel, tapered hood, moulded vents, brand-less badge, knobs, power LED) sits on a system unit with two
5.25" drives; a two-tone keyboard, mug of pencils, floppies, an articulated lamp and a cork board with handwritten
notes fill the desk. The CRT is the explainer surface: content is drawn each frame (pure f(t)) with a 5×7 pixel font
and shown through a CRT shader on a curved tube. The phosphor glow spills onto the keys and desk.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/17-crt-retro/`.

**Good for:** chat/command-line explainers, "how a program works", history of computing, short dialogues, ASCII
diagrams, small bar charts, before/after text, anything in short uppercase lines.
**Avoid for:** long paragraphs (> 32 columns × ~11 rows), lowercase or non-Latin text, photo content, fast-cut
edits, bright or daytime moods.

## Files
`spec.js` (all numbers), `style.js` (Three code), and `screen.js`, the **pure** screen-program planner (no THREE).
`scene.config.js` imports `screen.js` too, so key clacks, beeps and power sounds come from the same schedule as the picture.

## Props (`style.props`)
| factory | what it makes |
|---|---|
| `workstation({ phosphor, program })` | system unit + monitor + keyboard + cable. `userData`: `program(items) → plan`, `update(t)`, `screen`, `monitor`, `keyboard`, `unit` |
| `monitor({ screen, phosphor })` | bezel, hood, vents, tube + glass, badge, LED, knobs, spill spot + bounce light. `userData.update(t)` |
| `crtScreen({ phosphor, ...crt })` | canvas + CRT `ShaderMaterial`. `program(items)`, `draw(t)`, `set(t)`, `tubeState(t)` |
| `tubeGeometry({ w, h, R })`, `glassShell(geo)` | spherical-cap tube face; additive reflection-only glass |
| `keyboard()` | tapered keycaps with legends on a sloped deck. `userData.update(t, presses)`, `keys[id]` |
| `systemUnit()`, `cable(anchors)` | base box with drive bays and busy LED (`setLed`); sagging cable |
| `desk`, `wall`, `corkBoard({ notes })`, `pinnedNote`, `deskLamp({ base, elbow, head, aim })`, `mug`, `floppy({ label })` | room props (the lamp has a warm shadowed spot, a leak light and `setLevel(k)`) |
| `caption(text)` | overlay lower third in the same 5×7 font, typed on. `userData.update(t, { on, off })` |
| `handwriting(lines, o)` | paper-note CanvasTexture |
`style.factories`: `workstation`, `desk`, `wall`, `corkBoard`, `deskLamp`, `mug`, `floppy`.

Pure (`style.plan` = `screen.js`): `planScreen(program, { cols, rows, typing, seed })`. Item types: `power`, `type`
(human cadence, `enter`), `print` (`beep`, `dim`, `scale: 2`), `prompt`, `clear` (top-to-bottom beam wipe), `box`,
`bar`, `invert`, `cursor`. Items chain with `after: id, gap`. Also `cursorAt`, `cursorTrail`, `powerAt`, `wipeBeam`,
`keyPresses`, `keyDepth`, `visibleCells`, `typingVoices()`, `KEYBOARD_ROWS`, `keyFor`, `GLYPHS`, `BOX_CHARS`.

## Recipe
`PLAN = planScreen(PROGRAM, …)` in scene.config; `SCORE = scoreFromEvents(PLAN.events, typingVoices())` + bed;
derive beats and captions from `PLAN.byId[id].start/end`. In scene.js: `ws.program(PROGRAM)`, then `ws.update(t)` in renderAt.

## Signature motion
Power-on: a bright line opens to a raster with a brightness bloom. Typing at seeded 11–17 cps, with the matching 3D keys
pressing (and shift when needed). The machine prints at ~70 cps after a soft beep. New characters flash and settle,
and the cursor leaves a short trail; both are analytic, from each cell's own reveal time. The cursor stays solid while
moving and blinks when idle. Clears are a beam wipe. Power-off collapses to a line, then a dot that fades. Camera: wide
desk → over the keys → tube fills the frame → pull back.

## Sound palette
`clack` per key (pitch by character), heavier `clack`/`thud` on space and return. A `blip` on replies, faint `tick` on
prints and box traces, a `whoosh` on clears. Power-on is `thud` + `click` + a rising `servo` whine + a 60 Hz `buzz`;
power-off is the reverse. Bed: dark `pad` (55 Hz, brightness 320 Hz), overlapping `rumble` fan, flyback `buzz` while on,
and a drive-seek `servo` at boot.

## Tuning knobs
`crt.phosphor` (`green` P1 / `amber` P3 / `white`), `textLevel`, `halation`, `scanlines` (auto-fade under ~2 px/line),
`mask`/`maskTriads`, `barrel`, `jitter`, `roll`, `vignette`, `reflect`, `glassEnv`, `flash`/`flashTau`,
`cursorGhost`/`ghostTau`, `invertLevel`, `blinkPeriod`, `power.*`. `typing.*` sets cadence, key hold and travel.
`spill.*` and `lamp.*` set the light levels. `hardware.*` sets the geometry.

## Known limitations
- 32 × 14 grid; text must be uppercase and fit the 5×7 glyph set (extra glyphs in `screen.js`). Double size = 16 columns.
- The screen canvas (1280×960) is re-uploaded with mipmaps every frame. That's fine offline but heavy in a live preview.
- Halation partly fills inverse-video glyphs (lower `invertLevel` if they read weak).
- Glass reflects the room environment only. Lamp highlights are painted in the shader, so they don't follow the camera.
- The lamp shade's mouth reads a little flat. The keyboard is only visible in wide or over-the-keys shots, so keys pressing
  during pushed-in typing go unseen.
- The env reflection shows as a soft dark smudge on the tube in close-ups.
