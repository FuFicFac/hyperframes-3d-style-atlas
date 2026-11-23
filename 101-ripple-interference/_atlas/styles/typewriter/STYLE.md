# Typewriter (`typewriter`)

**Look.** A generic mid-century manual typewriter (no brand marks) on a pale oak desk in window daylight, shot close:
sea-green enamel body, round cream keys in chrome rings, a U-shaped basket of steel type bars, a black/red ribbon between
two spools, cream paper on a black rubber platen. Words appear on the paper one struck letter at a time. Neutral tone
mapping, no bloom, no grain; a light vignette. The machine is built at about 10x life size (3.4 m wide) so the kit's usual
camera distances apply.

**Good for.** "One token at a time" (how a language model writes), drafting, quotes, definitions, letters, short
manifestos — anything written word by word where the writing itself is the point. The typed page is the label.

**Avoid for.** Long text (a line holds 14 characters, a page about 6–7 lines before it leaves a 16:9 frame), lower-case or
symbols outside `A–Z 0–9 . , ; ? - : ! '`, numbers-heavy charts, anything that needs several labels on screen at once.

## Modules

| file | what |
|---|---|
| `spec.js` | `STYLE_SPEC`: palette, materials, lights, plus `machine` (all dimensions), `keyboard`, `page` (columns, pitch, line height, jitter), `glyphs` (atlas), `typing` (all mechanism timings), `sound` |
| `typeplan.js` | **pure planner (Node-safe)**: `layout(S)`, `createTypePlan(S, lines, { fps })`, `typeVoices(SND)` |
| `style.js` | `createStyle(stage)` → props below; `style.plan` / `style.motion` = the planner module |

## Props

| prop | what | time hooks |
|---|---|---|
| `props.typewriter(plan)` | the whole machine, posed from a typing plan | `userData.update(t)`; `userData.carriage`, `userData.keys` |
| `props.desk()` | desk top, back wall with painted window light, paper stack, mug, pencil | static |
| `props.glyphAtlas()` | `{ texture, uv(ch) }` the type face baked once into one canvas | static |
| `props.label(text, o)` | kit text label in the type face (not used by the demo) | `userData.setText` |

## The typing plan (signature mechanic)

`createTypePlan(S, lines)` with `lines = [{ text, at, cps, ink: "black"|"red", ret, feed }]` returns one plan that both the
picture and the sound read:

- `chars[]`: per character `{ ch, line, col, t, key, bar, ink, jx, jy, rot, density }` — strike time **snapped to a frame**
  (so the bar is at the paper on a rendered frame), which key dips and which type bar swings, seeded misregistration.
- `returns[]`: `{ bell, t0, t1, fromCol, feed }` — bell, carriage return, line feed.
- closed-form readers: `col(t)` / `carriageX(t)` (steps + returns), `colSmooth(t)` (no steps — for cameras), `feed(t)`,
  `typed(t)`, `barSwing(bar, t)`, `keyDip(key, t)`, `ribbon(t)`, `spool(t)`, `lever(t)`, `bell(t)`.
- `events()` → `strike | space | bell | return | feedTick | stop`; `SCORE = scoreFromEvents(plan.events(), typeVoices(S.sound))`.
- `layout(S)`: print point, sheet axes, bar pivots, key positions, `pagePoints(carX, feed)` for framing gates.

Per-character times come from `kit/choreo.typePlan` (spaces faster, punctuation pauses), then a minimum gap is enforced.

## Signature motion

Key dips → its type bar swings from the basket to the print point (0.1 s up, 0.14 s back) → ribbon lifts (higher for red)
→ the glyph is on the paper when the bar falls away → carriage steps one column left. Line end: bell, the lever throws the
carriage back (0.5 s) while the platen ratchets the paper up a line. Nothing fades: ink is struck or not.

## Sound palette

`clack` + short `thud` per strike (pitch/gain seeded per character, panned by key position), soft `thud` + `tick` for the
space bar, `marimba` 2093 Hz bell at line end, `rustle` zip + `tick` ratchet during the return, `thud` + low `clack` when
the carriage stops, a quiet low `pad` as room tone (sets the mean level).

## Tuning knobs

- `page.cols / pitch / lineHeight / em`: type size and line length (bigger type = fewer columns).
- `typing.*`: swing, key, step, return and bell timings; `minGap` is the fastest allowed repeat.
- `page.jitter`, `glyphs.speckle`: how worn the typing looks.
- `machine.paperTilt`, `machine.basket.*`: sheet lean and the shape of the basket.
- line `cps` and `ink` per line in the scene.

## Known limitations

- Upper case, digits and a few marks only (one glyph per key, no shift); a character without a key throws at plan time.
- The sheet is flat and stiff above the platen and simply grows out of it; it does not curl over the paper rest.
- Type bars are thin boxes; neighbours pass through each other and through the segment near the pivots; a strike is
  2–4 frames at 30 fps, so in a paused frame a bar can be caught mid-air.
- The ribbon is drawn as flat strips and does not wind from one spool to the other; both spools just turn.
- The camera must stay roughly in front (within about ±30°) for the page to read; keys in the foreground are cropped in
  close shots.
- The carriage travels the full page width, so a fixed wide shot needs about 5.8 m of width; the demo fits each camera
  sample to where the carriage is.
- Fonts are OS-rasterised (`Courier New`): pixel-identical on this Mac only.
