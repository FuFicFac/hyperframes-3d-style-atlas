# Fireworks (`fireworks`)

**Look.** A deep blue night over a harbour, seen from a locked camera 6 m above the water and 150 m from the launch
barges. A two-layer skyline with warm and cool lit windows sits on the far shore and is mirrored in the water. Shells
climb from the barges on a gold comet tail and burst into PLANNED shapes — a heart, a ring, a star, a letter, a whole
word — drawn in glowing stars that hang, droop and fade. Each burst flashes white, then lights the sky, the building
faces and the water in its own colour; star reflections are squashed, vertically streaked mirror images. No post
stack and no tone mapping: the glow is in the sprite (a white-hot core plus a colour halo, added in display space).
A caption panel with a cold-to-hot TEMPERATURE slider sits on the overlay over the water.

**Signature mechanic.** A closed-form ballistic shell planner (`shells.js`, THREE-free). One formula moves everything:

    tau  = t - t0 - lag
    p(t) = C + D (1 - e^(-k tau)) - y (g / k) (tau - (1 - e^(-k tau)) / k)        0 <= tau <= life

a particle thrown from `C` with velocity `k D` under linear drag `k` and gravity `g`. It flies to its TARGET `C + D`
(95 % of the way after `3 / k` s), then sinks at the terminal speed `g / k`. Brightness = `(1 - (tau/life)^2)^fadePow`,
hotter just after `t0`, twinkling late.
- lift: the shell head uses the same formula with `D` scaled so it is exactly at the apex at the burst time; comet
  sparks are emitted along that path and fall;
- burst: every star's `D` is its point of the planned shape (outline resampled at equal spacing), so the shape forms
  as the stars brake; 4 "ghost" instances per star evaluate the same form a few hundredths of a second earlier (a
  streak while it flies, nothing once it hangs);
- **temperature** `T` per shell (`heat()`): target noise `sigma x T^1.6 x R`; a per-shell "take" (turn, stretch,
  shear, x `T^1.5`); drag variation; a share of stars in other palette colours; and from `T` = 1.0 to 1.6 a blend from
  the plan to a random ball (plain scatter, which also crackles);
- the vertex shader evaluates the formula from the packed plan (`plan.buffers`) and `uTime`: a frame costs no JS per
  star. `plan.starAt(i, t)` is the JS twin (framing gate), `plan.flashAt(t)` the light on sky / skyline / water;
- SCORE from the same plan (`plan.events` + `showVoices`): lift thump + rising whistle that ends at the burst, boom +
  rumble + air per burst (level by shell size, pan by x), a soft sparkle on crisp bursts, hiss + clicks on hot ones.

## Good for / avoid for
- Good for: reveals and finales, "one plan, many outcomes" (sampling, temperature, randomness vs control), celebration
  cards, a word or icon written in the sky, countdowns, year-in-review openers.
- Avoid for: anything with dense text or numbers (a word of ~5-7 capitals is the limit), calm or corporate topics,
  shapes with fine detail (a star is ~1.2 m, a letter ~45 m tall), long holds (a hanging shape is static apart from
  glitter), daylight palettes.

## Planner (`shells.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `shapePoints(shape, { n, R, spacing })` | unit-space points along `ring`, `heart`, `star`, `text` (kit stroke font) or your own `{ lines }`. |
| `wordShells(text, { cap, center, colors, burst, stagger, ... })` | one shell per letter; together they write the word. |
| `heat(T, spec.shells.heat)` | what a temperature does: `{ sigma, scatter, take, hue, speed, crackle }`. |
| `planShow(shells, spec.shells, { palette, extras, crackles })` | the plan: `{ shells, n, buffers, events, starAt, flashAt, shellBox, end }`. |
| `showVoices(spec.sound)` | voices for `kit/schedule.scoreFromEvents(plan.events, ...)`. |
| `cityPlan(spec.skyline)`, `skyStars(spec.sky.stars)`, `bargeLamps(spec.barges)` | pure layout of the set; beacons / stars / lamps are `extras` (fixed sprites). |

Shell: `{ id, burst, x, y, z, R, T, layers: [{ shape | points, scale, color, n, size, life }], from, rise, life, drag,
gravity, size, spacing, ghosts, fadePow, glitterStart, take, lift }`.

## Props (`style.props`)
| prop | what |
|---|---|
| `sky()` | dome: night gradient above the horizon, water gradient below, lifted by the flash colour, static dither. |
| `skyline(city)` | far + near building layers (procedural windows in the shader) and their rippling mirror images. |
| `barges()` | dark launch barges. |
| `show(plan)` | the sprites (one instanced geometry, two meshes: stars and their reflection); `userData.update(t)`. |
| `caption()` | overlay panel; `userData.show(text, alpha, T)` — the alpha fades the text only, panel + gauge stay. |
| `harbour(plan, city)` | all of the above in the scene; `update(t)`. |

## Sound palette
`thud` (lift, boom), `riser` (whistle, ends at the burst), `rumble` + `whoosh` out (burst tail), `sparkle` (crisp
bursts), `rustle` + `click` (crackle), a low `pad` and a quiet `murmur` crowd as the bed. No speed-of-sound delay:
the boom is on the flash.

## Tuning knobs (spec.js)
- `shells.drag` (how fast a shape forms), `gravity` (droop), `life`, `fadePow`, `size`, `spacing`, `ghosts`.
- `shells.heat` — the whole temperature response. `sigma` 0.085 keeps T = 0.8 readable as the shape; 0.16 did not.
- `stars.halo / core / coreFall` (sprite glow), `stars.reflection` (squash, dim, streak, wobble).
- `skyline.*` heights (keep roofs under ~30 m so bursts own the sky), `window.lit`, `flash`.
- `sky.dither` (0 = off; saves bitrate, shows banding), `sky.flashSky / flashWater`.
- `view` — the camera the defaults assume; star `size` is in screen pixels, so it does not scale with distance.

## Known limitations
- Sprites have a fixed pixel size and no depth test: they do not shrink with distance and are never hidden by
  buildings. Keep the camera locked or nearly so.
- The vertex shader and `starAt()` are two copies of one formula; change both.
- Star reflections are a fake (mirror image squashed to 20 % height and streaked), not a true reflection, which
  would fall below the frame from this camera. Reflections are partly hidden by the caption panel.
- A hanging shape is still: only glitter and a slow sink. Holds over ~4 s want a second volley.
- Sparse outlines look beaded, not continuous: at `spacing` 1.2 m letters read as strings of lights. Even at low T a
  crisp outline looks slightly hand-drawn because star sizes vary and neighbours overlap.
- No smoke, no wind. Twinkle uses a `fract(sin())` hash in the shader: identical on one GPU, may differ across GPUs.
- The dark gradient bands in 8 bits without `sky.dither`; with it the file grows.
