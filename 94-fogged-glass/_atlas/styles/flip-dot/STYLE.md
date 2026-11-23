# Flip-Dot Display (`flip-dot`)

**Look.** A giant electromechanical flip-disc sign (the kind old buses and station boards used) on a blue painted wall.
A dark metal housing with a bright inner lip frames a charcoal back plate; in front of it sits a 64 x 36 grid of 2304
round discs at 20 cm pitch, fluorescent yellow on one side and matt black on the other, each on a thin diagonal axle.
A warm key light from the upper left and a weak cool kick make a mid-flip disc show a lit face, a dark edge and then
the other side; every disc rests at a slightly different tilt and tone (seeded), so the field looks like hardware, not
like pixels. Tone mapping is `neutral` so the yellow stays yellow. The beat label is a black caption chip with a yellow
edge and a 3 x 3 disc icon on the overlay (exact colours). White discs: `createStyle(stage, { bright: palette.brightAlt })`.

**Signature mechanic.** Pictures are plain bitmaps (1 = bright side). `flipplan.js` (THREE-free) turns a start bitmap
and a list of target bitmaps into single-disc flip events `{ t, i, to, step }`:
- a disc flips in a step only if its bit changes; its start time is `step.t + order_i * spread + jitter_i`, where
  `order_i` comes from the disc's position — a **scan** line in any direction, a **radial** ring from a point (or
  closing on it), **rows** / **cols**, or a seeded **random** sprinkle — so changes travel as visible waves;
- a disc's angle is a closed form of its last flip: a fast half turn on the diagonal axle that reaches the stop at
  ~0.18 s, rebounds a few degrees (the spring's overshoot is folded back, it never passes the stop) and is held at
  EXACTLY flat after `flip.settle` (0.55 s), so holds are pixel-still. The planner throws if a step would re-flip a
  disc before its previous flip has settled;
- the angles go into one instance attribute; the vertex shader turns the disc (position and normal) and the fragment
  shader picks the yellow or the black side from a per-face attribute. One draw call for all discs, one for the axles,
  no shadows from the discs, no per-frame textures;
- **noise -> picture**: `denoisePasses(picture, grid, { levels })` gives a diffusion-style sequence. Every disc has a
  fixed seeded rank (discs next to an edge of the picture rank lower when `edgeBias > 0`); at noise level `p` the
  discs ranked below `p` take a fresh random bit, the rest show the picture. Level 1 is pure noise with no trace of the
  picture; each pass flips fewer discs than the last;
- the same flip list makes the sound (`plan.events`): flips are counted per 1/30 s when they hit the stop; one or two
  click one by one, more become 1-4 tick grains whose loudness follows the count (density -> clatter).

## Good for / avoid for
- Good for: reveals out of noise, "this turns into that" between two icons or words, counters and short words in the
  5 x 7 font, status signs, anything about bits / on-off / sampling / thresholds, wipes that should feel mechanical.
- Avoid for: grey levels or colour pictures (a disc has two states), fine detail (a feature needs 2+ discs; the board is
  64 x 36), long text (10 characters of 5 x 7 fill the width at scale 1), quiet or soft moods (it clatters), exact
  numbers unless they are real (mark SAMPLE DATA yourself; the style has no tag).

## Planner (`flipplan.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `dotGrid({ cols, rows, pitch })` | the board (XY plane, row 0 on top): `n`, `x[]`, `y[]`, `w`, `h`, `point(c, r, z)`. |
| `noiseBits(grid, seed, p)`, `solidBits(grid, v)` | seeded noise / a blank board. |
| `bitsFromRows(grid, ["..##.."], { center, on, base })`, `textBits(grid, "HELLO", { scale, center, on, base })` | hand-drawn rows; kit 5 x 7 font text. |
| `painter(grid, { design: [W, H], fill })` | raster API in design units: `ellipse`, `rect`, `poly`, `line`, `trace` (1-disc line), `cells`; `v` = 0, 1 or `"xor"`. |
| `PICTURES.cat(grid, { wink })`, `PICTURES.bulb(grid)` | original icons drawn for 64 x 36 (scale to other boards). |
| `denoisePasses(picture, grid, { levels, seed, edgeBias, edgeReach })` | `{ passes, order }`: one bitmap per noise level. `matchFraction(a, b)`, `edgeDistance`. |
| `waveOrder(grid, wave)` | 0..1 order per disc: `{ type: "scan", dir }`, `{ type: "radial", c, inward }`, `{ type: "rows" \| "cols", reverse }`, `{ type: "random", seed }`, `{ type: "none" }`. |
| `createPlan(grid, spec.flip, { initial, steps: [{ id, t, to, wave, spread, jitter, seed }] })` | the plan: `flips`, `steps[k].{ count, first, last, end }`, `landAt`, `anglesAt(t, out)`, `bitsAt(t)`, `movingAt(t)`, `flipsIn({ c0, c1, r0, r1 }, t0, t1)`, `events(spec.sound, { t0, t1 })`. |
| `flipVoices(spec.sound)` | voices for kit `scoreFromEvents`. |
| `flipSettle(tau, F)`, `flipLandTime(F)`, `boardBox(grid, { margin, depth })`, `asciiBits(bits, grid)` | the flip curve, when it clicks, framing box, a Node preview. |

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `sign(plan, { bright, dark })` | everything for one plan: wall + housing + axles + discs (adds itself to the scene); `update(t)`. |
| `discField(plan, { bright, dark })` | the InstancedMesh of discs; `userData.update(t)`. |
| `axles(grid)` | one thin diagonal rod per disc (instanced). |
| `housing(grid, { margin, bezel })` | printed back plate + metal bezel + bright lip. |
| `wall({ size, z })` | the painted wall. |
| `caption()` | overlay chip; `userData.show(text, alpha)`. |
| `discGeometry({ r, t, radial })` | one disc facing +Z with the `aFace` attribute. |

## Signature motion
- Nothing moves except discs flipping; every picture change is a set of single flips from the plan.
- Waves: scan, ring, rows, sprinkle; the front is ragged by `flip.jitter`.
- Camera moves only while discs flip; holds are pixel-still. Close-ups from ~30 degrees off-axis show the half turn.

## Sound palette
`tick` per lone flip (to-yellow a little higher than to-black), `tick` grains for clatter with gain ~ sqrt(count / `sound.ref`),
`clack` accents for chosen discs (the demo uses them for the discs in its close-up), a low `pad` bed, `chime` on a reveal.

## Tuning knobs (spec.js)
- `board`: `cols`, `rows`, `pitch`, `discR`, `discT`, `axis` (pivot), `tilt` / `tone` (per-disc spread), `plateZ`, axle size.
- `flip`: `spring` (speed), `bounce`, `settle`, default `spread` and `jitter`.
- `palette.bright` / `dark`, `lights` (key angle decides how strongly a mid-flip disc shades), `caption`, `sound`.

## Known limitations
- Two states only. Grey has to be dithered by hand; there is no dithering helper.
- Discs cast no shadows (cheap on purpose): the half turn reads from shading and silhouette, not from a shadow on the plate.
- A flip takes ~0.18 s to land, far slower than a real disc (~15 ms), so that it is visible at 30 fps. A wave over
  the whole board therefore needs `spread` >= ~0.5 s to read as a wave and not as a blur.
- Steps must be spaced so that no disc is re-flipped within `flip.settle`; `createPlan` throws instead of blending two flips.
- Pure-noise passes flip ~half the board (about 1100 discs): that is the expensive part of the MP4. Keep the camera still
  during them: the demo was 11.5 MB at CRF 25 with a slow pan across the wide passes and a second wide-to-wide move; with
  the camera held during every wide pass and only two moves (push-in, pull-back) it fits at a lower CRF (see the demo's RUN.txt).
- `edgeBias` (resolve big shapes first, edges last) is true to diffusion but hides fine features: at 0.28 the cat's eyes
  were still jumbled a full second after the silhouette read. The demo uses 0.08 with a reveal pass down to level 0.08 so
  the eye the camera sits on reads the moment the wave passes. Keep features at least 2 discs thick.
- The plate "pockets" and bearing blocks are a printed texture, not geometry; from steeper than ~45 degrees the discs
  visibly float 10 cm in front of a flat plate.
- `denoisePasses` is a cartoon of diffusion (re-roll what is still noise, fix the rest); it is not a denoising model.
- The 5 x 7 text path (`textBits`) and `PICTURES.bulb` are implemented and checked in Node as bitmaps only; the demo renders the cat.
