# Embossed Letterpress (`embossed-letterpress`)

Fine stationery under a low raking light. The whole picture is one heavyweight cream cotton card with deckled
edges, lying on a charcoal board. Every mark is relief. Type and rules are **debossed** with uneven spot ink
(navy and oxblood, with a darker squash ring at letter edges). Borders, guilloche and the monogram seal are
**blind embossed**. Titles are **gold foil**, which glints along the walls of the impression and flashes as a
highlight band travels across it. Each mark arrives with a press: a brass die drops straight down the last
0.3 m, rests while the sheet dips, then lifts to reveal the impression. The light carries the look: the key
sits ~19° above the sheet and sweeps slowly in azimuth, so walls that face it catch light and walls that
face away fall into a marched height-field shadow. Neutral tone mapping, light bloom on foil only,
tilt-shift following the subject. Demo: `Builder/HyperFrames/3d-style-atlas-pilot/19-embossed-letterpress/`.

**Good for:** "the N parts of X", principles, manifestos, definitions, quotes, invitations/launch cards, title cards,
premium or craft brands, anything that should feel considered and permanent. One card per idea; restack sheets to change scenes.
**Avoid for:** data/charts, process flows with motion, many small labels, fast edits, dark or neon moods, anything with
more than ~8 independent reveals per sheet, or text below ~0.07 m em (it becomes a blur of walls).

## How the relief works
`bakeRelief` draws each layer once (white on black, card metres) and blurs it by `sheet.shoulder` (press shoulder) into
one channel of a full-res RGBA texture, and by `sheet.pillowRadius` at ¼ res (pillow). Layer height =
`depth × press × (sharp − pillow × max(wide − sharp, 0))`. The shader takes the gradient (fwidth-aware) to get normals,
adds tiled fibre bump, and marches 7 steps toward the key for self-shadow. A `press` uniform per layer (0..1) is the only
time input. Height maps never change, so seeking is free and deterministic.

## Props (`style.props`)
| factory | what it makes |
|---|---|
| `reliefSheet({ width=3.4, height=2, color, foil, deckle, layers })` | the card. `layers` (≤ 8): `{ id, kind: "deboss"\|"emboss"\|"ink"\|"foil", ink: "navy"\|"oxblood"\|hex, depth?, pillow?, items? \| draw(h, ornaments) }`. `userData.setPress(id, u)`, `setFlash(level, pos)`, `setDie(state, die)`, `setDip(rect, u)`, `setSlide([x,y,z])`, `setTurn(u, edge)`, `content` (attach dies here) |
| `paperBoard({ width, height, color })` | plain fibre board under the stack; `userData.setCaster(rect, gap)` draws the card's raking shadow sliver |
| `pressDie({ w, h, height=.16, knob })` | brass block on a steel face with an ebony knob; origin = face centre. `userData.setState(plan.dieState(t, p))` |
| `rakingLight({ plane })` | `set({ azimuth, elevation, intensity })` (around the sheet normal, 0 = from +x) feeds every sheet + the die's light; `syncView(camera)` after the camera rig |
| `sheetStack([sheets], { gap })` | sheets stacked down −Z; slide or turn sheets with `setSlide` / `setTurn` |

Layer `items` are plain data (JSON-safe): `text { text, x, y, size (em m), font: display\|text\|smallCaps, weight, italic, tracking, align, anchor:"cap" }`,
`rule`, `fleuronRule`, `border { inset, rules:[{w,gap}], corner }`, `rosette`, `guilloche`, `seal { letter, beads }`, `circle`, `ring`, `diamond`.
`style.ornaments` has the same draw functions; `style.helpers`: `painter, drawItems, bakeRelief, fibreTexture, paperMaterial`.
Factories: `board`, `reliefSheet`. Materials: `brass dieFace knob` (the sheets use their own shader).

## Plan module `pressplan.js` (THREE-free; import it in `scene.config.js`)
`planPresses([{ id, at, x, y, w, h, kind, from }])` → start/contact/release/reveal/clear · `dieState(t, p)` · `reliefAt` · `contactAt` ·
`kickAt(t, plans)` (camera nudge) · `pressEvents(plans)` → approach/contact/lift/reveal|foil cues for SCORE · `keyed(t, keys)` · `flashAt(t, flashes)`.
Only one die should be down at a time: the sheet has one die-shadow/dip slot.

## Recipe
1. Lay out layers in card metres. Keep presses for the story beats and set always-present ornaments to press 1.
2. `PRESSES = planPresses(...)`; in renderAt set each die from `dieState`, `setPress(id, state.relief)`, `setDie`/`setDip` for the active one.
3. Key `LIGHT.azimuth` slowly (about 0.5 rad per 10 s), then sweep about 1.4 rad in about 1.3 s for a finale. Pair `FLASHES` with foil reveals.
4. Push the camera to each press and pull back for the whole card. Keep it within ~15° of the normal.

## Sound palette
Per press: low `whoosh` on approach (pitch .42); a heavy, soft `thud` on contact (pitch .42, gain ≈ .5, so five thuds stay
under the bed); `paper` (density .22, pitch .55) for the creak at contact and again on the lift; `sparkle` plus a quiet `chime` on foil reveals.
Bed: `pad` root 98 Hz, `brightness: 650` (Hz cutoff), gain .42, plus `rumble` at .035 for room air. The mix sits at about −22 dB mean, −1 dBFS peak.

## Tuning knobs (`spec.js`)
`sheet.depth.*` / `sheet.pillow.*` (relief per kind), `sheet.shoulder` (wall softness; above ~3 mm small type smears),
`sheet.pillowRadius`, `sheet.deckle`, `sheet.dip`; `fibre.albedo/bump` (cotton texture; affects MP4 size);
`ink.coverage/squash/mottle/skip`; `foil.roughness/brush/env/band`; `lighting.key/fill/selfShadow/dieShadow`; `press.*` timing; `type.*` font stacks.

## Known limitations
- At most 8 relief layers per sheet, with one ink colour per layer. Each layer is a full-card texture channel (≈110 MB GPU at 1000 px/m), and baking takes about 1 s at load.
- Relief is shading only (normals + marched shadow), not displacement: silhouettes stay flat, so keep the camera within ~15–20° of the normal.
- The die shadow is an analytic soft box, not a shadow map, and only one die is active at a time. The die's underside is never shown engraved.
- Lines thinner than ~2.5 mm blur into a single ridge after the 2.2 mm shoulder blur: guilloche rosettes read as medallions, not fine engraving.
- Foil "anisotropy" is a brushed normal plus a scripted highlight band; it is not a true anisotropic BRDF.
- Fonts are macOS system faces (Didot, Baskerville). On another OS they fall back to Georgia.
