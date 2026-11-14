# Isometric Pastel (`isometric-pastel`)

Tech-company explainer isometric illustration, built in real 3D. A strict orthographic **true-isometric** camera (45° azimuth,
35.264° elevation, never rotates; pans and ortho-zooms only) looks at extruded blocks on a 0.5 m grid. Every surface uses an
**unlit three-tone shader**: the world normal picks top (+Y, lightest), left (+Z, mid = the base colour) or right (+X, darkest),
computed from one pastel base (`spec.tones`, sRGB mixes) and written as exact sRGB. No lights, no post, no gradients or specular.
Curved parts (cylinders, capsule people, cables) split hard at the camera line like a vector illustration. Flat **long shadows**
are planar projections at a fixed angle, one flat tone per receiver, clipped to the slab they fall on. Pale ground with an
anti-aliased world-space dot grid; captions/tags are screen-flat on the overlay in a deep ink; one saturated accent.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/20-isometric-pastel/` ("The AI stack").

**Good for:** stacks and layers (tech stacks, org layers, supply chains), systems/flows on a board (data, packets, conveyors),
"how X works" product explainers, cities/campuses/factories in miniature, SaaS/fintech/infra brand explainers.
**Avoid for:** emotion or photo-real material, organic/soft subjects, dramatic lighting or night moods, anything needing camera
orbits or perspective depth (use tiny-diorama for a rounded toy world with real light, exploded-view for product teardowns).

## Props (`style.props`; sync, seeded; origin = bottom centre; screen-left face = +Z, screen-right = +X)
| factory | returns / hooks |
|---|---|
| `toneMat(base, { unique })` · `mesh(geo, color, o)` | three-tone ShaderMaterial (`userData.setBase(hex)`, `setMix(toward, k)`, `tones`) / Mesh |
| `block({ w,h,d, color, at, unique, shadow })` · `prism({ w,h,d, axis })` · `ramp({ w,h,d, up })` · `cylinder({ r,h, rTop })` | Mesh (`userData.dims`); rise with `scale.y` |
| `inset(parent, { face:"left"\|"right"\|"top", u, v, w, h, color, depth })` | flat detail panel (window, vent, LED, screen, icon) |
| `slab({ w,d,h, color, posts, postSize, number })` | floor plate + corner posts; `userData { top, bounds, body, posts, label }` |
| `chip({ size, h, die, pins, pinCount })` · `serverRack({ w,h,d, units, led, seed, rate })` · `coolingUnit({ w,h,d, rate })` | Group; rack/cooler `update(t)` (LED chase, fan) |
| `device({ kind:"phone"\|"tablet"\|"monitor", w,h, screen, ui, phase, period })` | screen on +Z face; `update(t, on)` progress bar + notify dot loop |
| `person({ h, color, skin, hair, seed })` · `tree({ h, r, kind:"ball"\|"cone" })` | capsule figure / lollipop or cone tree |
| `route(points, { kind:"cable"\|"pipe"\|"conveyor", radius, width, bend, color })` | axis path, rounded bends; `userData { path, length, at(s), setDraw(u) }` |
| `packets(route, { size, speed, spacing, count, color })` | `update(t, start, stop)`: blocks travel at constant speed, loop |
| `ripple({ size, grow, bar, color, fadeTo })` · `groundMark({ w,d, bar, dash })` | flat square pulse `set(u)` / dashed plot `set(u)` |
| `ground({ size })` · `isoLabel(text, { plane:"left"\|"right"\|"top", height })` | dot-grid receiver / text on an iso plane |
| `stack(floors, plan)` | `update(t)` (rise/drop/explode/close from `iso.floorOffset`), `pulse(t, i)` |
| `caption({ n, title, sub, color, x, y, size })` · `kicker(text)` · `tag({ n, title, color })` | overlay UI; `update(t, { on, off[, anchor, at] })` |
Also on the style: `castShadows(caster, receiver, { y, bounds, only })` and `updateShadows()` (call after moving things, before render).

**Pure module `iso.js`** (THREE-free, `style.plan`; import it in `scene.config.js`): `threeTones`, `mixHex`, `ISO`, `isoKey(t, focus,
viewHeight, { at:[ndcX,ndcY] })` (camera keys that put `focus` at an NDC spot), `riseU`, `dropY`, `snap`, `loopTimes`,
`stackPlan(floors, { explode, close, pulse })`, `floorOffset`, `stackEvents(plan)` → `scoreFromEvents`.

## Signature motion
Blocks rise out of the ground (outBack scale-y, ~0.4 s) in staggered grid waves (60–90 ms); floors drop from above the frame
and land with one small hop; exploded layers separate vertically with a slight overshoot, then close with a clunk. Loops tick
on fixed clocks (LED chase 4 Hz, packets at constant speed, ripple every 0.9 s, people hop every 1.3 s). Camera: locked iso,
one pan+zoom per beat (inOutCubic ~0.7 s), holds still otherwise. Finale pulse: an accent block climbs the front corner and a
collar pops around each slab bottom → top.

## Sound palette
rise/drop `whoosh` · land `clack` + light `thud` · reveals `pop` (pitch climbs along the wave) · people `bubble` · loops `tick`
(LEDs, packets) · cable draw / coolers `whir` (gain ≤ .06) · captions `blip` [0,5,9] · pulse `blip` per floor [0,4,7,12] + `chime` ·
bed `pad` major-9, root 262 Hz, **brightness 1500–1800 Hz**, gain .5 → mean −23.8 dB.

## Tuning knobs (`spec.js`)
- `tones.top.k` .42 (toward white) / `tones.right.k` .24 (toward `#4a467e`): the whole look; keep top ≥ .35 and right .2–.3.
- `shadow.dir` [1,0] (falls screen down-right) · `length` .62 m per m of height · `k` .13 shadow darkness.
- `grid.cell` .5 / `dotRadius` .035 / `majorEvery` 4 · `outline.enabled` (1 px edge ink, off by default).
- `overlay.captionH` .085 · `tagH` .038 · `popDur` .32. Camera `viewHeight` per beat (8.6 → 17 in the demo), `isoKey.at` for composition.

## Known limitations
- Shadows only fall on their own receiver plane (ground or the slab they stand on): a floor does not shade the floor below,
  and a shadow is clipped (not wrapped) at the slab edge. Thin tall casters (posts) make stray lines on the ground: cast slabs only.
- Tone pick uses `mat3(modelMatrix)·normal`: fine for uniform or axis scales; skewed parents would mis-classify faces.
- 45°-rotated faces sit exactly on the left/right split: keep geometry axis-aligned (90° yaw steps).
- Stacked floors hide most of the lower decks (true iso sees ~1.4 m into a 1 m gap): each floor reads fully only on its own
  beat or when exploded — plan the story that way.
- Slab-edge `number` labels (0.36 m) are decoration, not readable copy; put real text on the overlay.
- `inset` panels are 1–3 cm proud boxes, not boolean cuts; extreme zoom shows their sides.
