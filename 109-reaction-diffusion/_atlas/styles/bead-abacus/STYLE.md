# Bead Abacus (`bead-abacus`)

A big counting frame lying on a clean bright tabletop in soft daylight. Warm cherry posts and low rails, polished steel
rods with small brass ferrules, and chunky lacquered wooden beads (round, bicone or disc) in a small confident palette
(tomato red, cobalt, mustard, green, violet, cream). The clearcoat catches the room, the paint is chipped back to bare
beech on the shoulders, and every bead casts a soft contact shadow on its neighbours and on the table. Beads 6–10 of a
row are a darker shade of the row colour, so you can count by fives. Desk nameplates (wooden wedges with cream enamel
faces) carry the row labels on the left and the counts on the right.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/40-bead-abacus/` ("votes, counted": 7 / 4 / 9 → 20 of 100, SAMPLE DATA).

**Signature mechanic:** quantities made physical and countable. Each row has a target count over time; `beads.js` turns
that into bead positions. A moving group slides as one rigid block (every bead travels the same distance), arrives
still moving, clacks against the stack and settles with tiny damped hops. The nameplate changes on the landing frame
and bumps. Operations are shown as moves: add (slide more across), compare (rows as bars), carry (ten return, one moves
on the next rod), percent (a 10×10 frame fills row by row; a brass divider can drop in to mark the line).

**Good for:** showing one real number so it can be felt and counted, "3 out of 10", small comparisons (2–5 rows of
0–10), proportions and percentages (10×10), before/after counts, simple addition with carrying, budgets in tens.
**Avoid for:** values above 10 per row (or 100 per hundred-frame) without rescaling (say what a bead is worth on the
label), decimals, more than ~5 labelled rows in one shot, time series, anything that needs precise values beyond whole
beads, dark/moody looks.

## Files
`spec.js` (all numbers), `style.js` (Three code), `beads.js` (**pure** planner, no THREE — imported by `scene.config.js`
so SCORE, camera shots and the framing gate come from the same plan as the picture). Exposed as `style.plan` / `style.motion`.

## Props (`style.props`)
| factory | what it makes |
|---|---|
| `frame({ rows=3, beads=10, travel, rowPitch, shape, colors, orientation="horizontal"\|"vertical", labels, plates=true\|"total"\|false, initial, fives, plateW, labelW })` | the counting frame: posts, rails, rods, ferrules, beads, contact shadow, row tags (left) and number plates (right). `userData`: `layout`, `beads[r][i]`, `setRow(r, s[])`, `labels`, `plates`, `total`, `rowColor(r)`, `rodWorld(r, s)` |
| `hundredFrame({ shape, colors=[top, bottom], plate=true, plateW })` | 10×10 frame (rows 1–5 one colour, 6–10 another; columns by fives) with one total nameplate |
| `bead({ shape: "round"\|"bicone"\|"disc", color, variant })` | one lacquered bead (superellipse lathe with a bore, axis +X, worn-rim vertex colours) |
| `rod({ length })` | polished steel rod along +X |
| `nameplate({ w, d, kind: "number"\|"label", state })` | desk nameplate; `userData.set(state)`, `update(t, state, since)` (redraw only on change + `uploadTexture`, bump after a change). number: `{ main, sub? }`, label: `{ text, swatch? }` |
| `rowController({ frame, row, plan, format })` | `update(t)`: bead positions + the row's plate from a `planRow` plan |
| `hundredController({ frame, plan, format })` | `update(t, state?, since?)` for a `planHundred` plan (override the plate, e.g. with a percentage) |
| `divider({ frame, between: [r, r+1], nudge } \| { frame, at: s })` | brass bar on the posts between two rows, or across the rods on blocks; `userData.update(t, at)` drop + settle |
| `caption()` | overlay caption card (exact colours): `userData.show(text, alpha)` — one fixed place per scene |
| `stamp({ text="SAMPLE DATA" })` | overlay rubber-stamp tag, top right, always on |
| `surface({ size })` | the bright tabletop |
`style.factories`: `surface`, `frame`, `hundredFrame` (OBJECTS `primitive: "procedural"`, `dims` = options).

## Planner (`beads.js`, Node-safe)
- `frameLayout(S, o)` → rod span `L`, travel `D`, `rowZ`, label/plate positions, `box` (frame-local). `worldBox(layout, at, yaw)`.
- `planRow({ id, n, initial, keys: [{ at, count, mode: "block"|"each", stagger, dur }], layout }, S)` → `xAt(i,t)`, `positions(t)`,
  `countAt(t)` (landed), `lastLand(t)`, `targetAt(t)`, `moves`, `events` (`slide`, `clack` with `count`). Throws if a key starts
  before the previous move has landed.
- `planHundred({ keys: [{ at, value }], noteStep=5 }, S)` → 10 row plans, `valueAt(t)`, events (rows that change move `stagger` apart;
  a running total spills from a full row onto the next).
- `carryKeys({ ones, tens, add, at }, S)` → keys for a ones + tens rod (count up one at a time; at ten: ten back as a block, one tens bead on).
- `slideU`, `settle` (motion curves), `notePitch(count, S.sound.note)`, `collectEvents`, `beadVoices(S.sound)` (for `scoreFromEvents`).
- `fitShot(pts, { elev, azim, fov, win })` → camera key whose view fits the points inside an **asymmetric** NDC window (under the caption
  band), centred. `framingCheck(keys, regions(t), { win })` replays the rig (kit `sampleCameraKeys`) against that window.

## Recipe
1. `scene.config.js`: put the numbers in a `DATA` object (and `sample: true` while they are placeholders); build labels from it;
   `frameLayout` → `planRow`/`planHundred` keys from `BEATS`; shots with `fitShot` from `worldBox`; gate with `framingCheck` + kit
   `framingReport`; `SCORE = scoreFromEvents(collectEvents(...plans), beadVoices(S.sound))` + bed + caption ticks.
2. `scene.js`: `frame(...)` / `hundredFrame()`, one controller per row, `caption()`, `stamp()`; `renderAt` calls `update(t)` on each.
3. Caption swaps text at each beat with a 0.12 s out / 0.2 s in dip, so a label is on screen in every shot.

## Default sound palette
Per landing: wooden `clack` (pitch .62, gain ∝ √beads) + low `click` + a marimba-like note (`chime` at pitch `notePitch(count)`,
pentatonic, rising with the count — only when beads are added). Per slide: a soft `whir` (160 → 100 Hz, grit .12) as long as the
slide. Caption: quiet `paper`. Divider: bright `clack` + small `thud`. Emphasis `chime` (.84) on the payoff. Bed: warm `pad`
(root 130.8 Hz, chord 0/4/7/14, brightness 900 Hz, gain .85). Demo measured mean −20.8 dB, max −2.6 dBFS (measured, not listened to).

## Tuning knobs
`bead`: `R`, `T`, `gap`, `shape`, `exponents` (superellipse per shape), `wear` (amount, rim, freq), `mottle`, `fives` (1 = off).
`frame`: `travel` (free rod in bead pitches), `rowPitch` (≥ 2R + ~0.05 so rows don't overlap from a ~50° camera), `postH`, `rodY`,
`railH`. `hundred.rowPitch`, `hundred.stagger`. `plate`: sizes, fonts, `pop`. `slide`: `dur`, `perBead`, `arrive` (contact speed),
`stagger`, `bounce/hop/hops/decay`. Look: `world.environmentIntensity` (rod and lacquer reflections), `sun` softness / extent.

## Known limitations
- A 3-row frame is very wide (≈ 2.3 × 0.6 m with tags and plates): in 16:9 it is width-limited and fills ~80 % of the width but
  only ~40 % of the height. Use more rows, drop tags or plates, or frame a diagonal if you need it bigger.
- The hundred frame's far rows compress at camera elevations below ~60° (beads of neighbouring rows touch on screen); the demo uses 64–69°.
- Wood grain on the post tops shows faint chevron lines (kit `woodTexture` lines mapped on RoundedBox top faces).
- A bead that lands in "each" mode while the bead ahead is still in its settle hop can overlap it by up to 4.5 mm for a frame or two.
- The marimba is the kit `chime` at low pitch (bell-like inharmonic partials), not a true marimba; there is no marimba voice.
- Nameplates bump (scale) on change; they do not flip. The divider "between rows" needs `nudge = (restY − rodY) / tan(elevation)` from the
  scene, otherwise it appears to lie over the far row from a high camera.
- Vertical orientation was checked in one still (bars grow up from the near end, tags near, plates far) but not used in a demo; it
  needs a rowPitch ≥ tag width (set automatically), which spreads the columns.
- Plate and tag text are OS-rasterised (Avenir Next / Helvetica Neue): identical on this Mac, slightly different elsewhere.
