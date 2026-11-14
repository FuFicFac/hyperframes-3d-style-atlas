# Soft Clay (`soft-clay`)

A stop-motion claymation tabletop. Every prop is modelling clay: chunky rounded forms with seeded lumps,
shallow thumb dents with a raised lip, a fine fingertip grain and faint tool streaks, matte with a waxy
sheen, in saturated plasticine colours (tomato, sun, teal, mint, grape, bubblegum) on a warm seamless
paper sweep under one big soft key. Objects move **on twos** (15 poses/s) with squash-and-stretch on every
move. The surface "boils" on each new pose, and the camera glides smoothly at 30 fps. Labels are rolled
clay coils pressed onto cream plaques. Demo: `Builder/HyperFrames/3d-style-atlas-pilot/04-soft-clay/`.

**Good for:** friendly explainers ("what is X", input → process → output), kids and education, product metaphors built from simple icons, playful brand stories, short loops.
**Avoid for:** precise data or charts, photoreal or technical subjects, dark or serious topics, long text (more than about 3 words per label), fast cuts.

## Props (`style.props`, all seeded and synchronous; pivot = centre of the base, y = 0 on the table)
| factory | what it makes |
|---|---|
| `sweep({ width, depth, height, radius })` | paper cyclorama (also `factories.sweep`) |
| `blob({ r, color, stretch:[x,y,z], seed, dents, wobble })` | lumpy ball/ellipsoid with a flattened contact patch |
| `coil({ stroke, r, color, seed })` | rolled snake along points/arcs (kit stroke format) |
| `puck({ r, h, color })` · `slab({ w, h, d, radius, color })` | flattened disc · chunky rounded block |
| `letters(text, { cap, color, colors(ch,i,word) })` | stroke-font clay coils; `userData.chars` (one group per glyph), `width`, `height` |
| `plaque({ text, cap, color, letterColor, colors, rim, hang, pad, depth })` | stamped sign; `hang` adds strings; `userData.showLetters(n, popDur)` pops glyphs on |
| `book` · `photo` · `bubble` · `note` · `star` · `arrow` | explainer icons (book lying flat, framed picture, chat bubble, double note, puffy star, flat arrow) |
| `marble({ r, colors, swirl })` | half-kneaded multi-colour lump (vertex-colour swirl) |
| `brain({ r, color, folds })` | two-lobed brain with rolled gyri; `userData.setGlow(u)` |
| `hopper({ w, h, d, body, funnel, rim })` | clay machine: funnel, chute (+X), crank, buttons. `userData.mouth`, `chute`, `setKnead(k, tq)` (also `factories.hopper`) |
| `rays({ n, r0, r1, color })` | cartoon shine coils; `userData.setOpen(u)` |

Lower level: `style.geo.{blob,slab,puck,lathe,coil,extrude}` return clayified geometry, `style.clayify(geo, { size, seed, wobble, dents, flatten })`
turns any geometry into clay, and `style.clay(name|hex)` returns the shared clay material (`materials["clay:<name>"]`).

## Motion (`style.motion`, pure)
`onTwos(t)` → posed time (use it for **all** object motion; the camera keeps `t`) · `vol(sy)` volume-preserving scale ·
`squashPop(t, start)` grow in with a stretch-then-splat · `squashOut(t, start)` · `hop(t, start, dur, from, to, { height, land, spin })` →
`{ pos, scale, rot, phase }` (crouch, stretched arc, splat, jiggle) · `jiggle(t, at, amt)` underdamped settle ·
`morph(t, at)` → `{ a, b, swapped }` (squish the old shape flat, re-form the new one) · `knead(t, start, end, { cycles })` · `boil(t, seed)`.
Per frame: `style.setPose(t)` (shifts the micro-surface per pose), then `style.applyBoil(obj, tq, seed)` after setting a pose.

## Recipe
1. Build props once, add them to the scene, and keep a holder group per moving prop (position/yaw). Squash the prop inside it, because the pivot is at the base.
2. In `renderAt`: `tq = motion.onTwos(t)`, `style.setPose(t)`, drive everything from `tq`, then `rig.update(t)`.
3. Face labels toward the camera's position at their mid-time (`atan2`). Use one label at a time, with ≥ 1.5 s of hold.

## Default sound palette (kit voices, layered)
**squish** = `bubble` (pitch ~.4) + `thud` (pitch 1.5) + low dense `paper`. **plop** (entrance) = low `pop` + light `thud`. A small `bubble` boing before a hop,
a soft `whoosh` in the air, a squish on landing. `rumble` + alternating squishes + quiet `clack`s while kneading. A `chime` (sparkle) on the reveal.
Rising `pop`s for each plaque letter. Under it all, a warm `pad` (G add9, gain ≈ .11).

## Tuning knobs (`spec.clay`, `spec.tuning`, `spec.lettering`)
`clay.wobble.amp/freq` (lumpiness), `clay.dents.count/radius/depth` (thumbprints), `clay.microBump`, `clay.toolMarks` (surface), `clay.boil.amount`,
`clay.contactFlatten`, `clay.segments`. `tuning.fps` (pose rate: 12 is chunkier, 15 is the default, 30 turns twos off), `squash`, `stretch`, `anticipation`,
`settle`, `popDur`, `morphDur`, `boilJitter`. `lettering.coilRatio` (stroke weight), `press`, spacing. Look: key `shadow.softness` (9), `post.tiltShift`, `world.exposure`.

## Known limitations
- Clay surface detail is an object-space `onBeforeCompile` patch on MeshPhysicalMaterial. It will not survive a GLTF/Blender export (bake it or rebuild it as a noise bump node).
- Lettering is the kit stroke font (uppercase only, monoline). The coil ends of A, M and N meet at sharp points, which read slightly lighter.
- Wobble needs tessellation. Extruded shapes (`star`) only wobble at their outline, and their caps stay flat.
- `morph` swaps meshes at mid-squish. There is no true geometry blend, so keep the two shapes about the same footprint.
- Brain glow is subtle by design (emissive 1.3 on pink, below the 2.4 bloom threshold). Raise `setGlow` beyond 1 or lower the threshold for a real bloom.
- Coils use the kit tube directly: `kit/paths.js` winds tubes outward since 2026-11-13 (the local re-wind was removed; same triangles).
- First load builds about 60 clay meshes on the CPU (≈ 1 s). Seeking is deterministic in any order.
