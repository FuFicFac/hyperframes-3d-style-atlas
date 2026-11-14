# Tiny Diorama (`tiny-diorama`)

A whole little world on one floating 16:10 tile, like a designer's desk model or a mobile-game map piece. The tile is
a thick slab built from stacked bevelled layers (grass/soil/rock, or pavement/concrete/rock). Each lower layer is inset
5 cm, and half-buried pebbles sit in its sides. On top are chunky rounded buildings, lollipop and capsule trees, toy
cars and peg people. Materials are pastel-saturated matte plastic with a light clearcoat sheen, under `neutral` tone mapping.
Light comes from one soft sun (PCF, radius 6) plus a hemisphere fill, and every piece carries a radial contact-shadow blob as fake AO.
The tile hangs over a soft vertical gradient and casts a soft square drop shadow. The camera is narrow (fov 20) and near-isometric
three-quarter. Tilt-shift is re-aimed at the active subject every frame. Labels are overlay pin markers plus one caption pill, so they are exact-colour and never blurred.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/05-tiny-diorama/`.

**Good for:** "where does X go / how does X flow" systems (networks, supply chains, energy, water, logistics, cloud),
cities and neighbourhoods, onboarding maps, numbered step walkthroughs over places, and friendly product or infra explainers.
**Avoid for:** precise data or charts, dark or serious subjects, organic or photoreal scenes, anything bigger than one tile
(this style is about a contained world), and dense text.

## Prop factories (`style.props`; synchronous, seeded)
| factory | returns / hooks |
|---|---|
| `tile({ size=14, depth=size×.625, layers \| "urban", radius, inset, pebbles, seed })` | Group, top at y=0; `update(t,{dropAt,dropDur,dropFrom})` drop + bob; `dropShadow` (add to scene) |
| `building({ w,d,h, color, roof:"gable"\|"flat"\|"none", roofColor, roofH, windows:[[x,y]]\|n, door, chimney })` | Group; `setGlow(u)`, `height` |
| `house(o)` | gable `building` with chimney and two windows |
| `dataCentre({ w,d,h, racks=4, fans=2, color })` | `setRack(i,lvl)`, `setFan(angle)`, `setPower(u)` |
| `tree({ seed, height, kind:"round"\|"tall"\|"duo" })` · `bush({ seed, size })` | Group, origin at ground |
| `car({ color, seed, length=.9 })` | faces +X; `setRoll(dist)` |
| `peg({ color, height=.6 })` | peg person; `userData.head` |
| `desk({ laptop=true, w=.7 })` | table + laptop; `setScreen(u)` |
| `road(points[[x,z]], { width=.8, bend, dashes })` | raised ribbon; `path`, `length`, `at(s)→{p,dir,yaw}` |
| `pole({ height=2.1 })` | `userData.top` cable anchor |
| `cable(anchors[[x,y,z]], { sag=.22, radius })` | sagging tube (outward winding); `pts`, `length`, `at(u)`, `setReveal(u)` (grows with a round head cap) |
| `packet({ size, color })` · `token({ color, size, glow })` | glowing sphere · candy cube |
| `pulseRing({ r, color })` | `setPulse(u)` |
| `contactShadow({ w, d, opacity })` | AO blob (already inside every piece) |
| `scatter({ size, count, seed, make(r,i), avoid:[{x,z,r}], spacing, margin })` | Group; children get `delay` and `baseScale` (use kit `growAll`) |
| `pinMarker({ number, tag, color, side })` | overlay pin, origin at the tip; `set(reveal, hide, t)` |
| `caption(text, { number })` · `kicker(text)` | overlay pill / small title line; `set(reveal, hide)` |

`style.helpers`: `dropIn(t,start,dur,from)→{y,squash,started}`, `spinAngle(t,start,rate,ramp)` (closed-form spin-up),
`focusOn(worldPt)` (tilt-shift focus follows a point), `pin(obj,opts)` (= kit `pinToScreen`), `tint(color, base)`, `pop`.
`style.factories` exposes the 3D props to `objectsFromSpec` (`params`; road takes `points` and cable takes `anchors` in params).

## Signature motion
The tile falls in with an outBounce and a squash, then bobs about 6 cm. Its drop shadow tightens on landing. Buildings drop in with a
bounce, and trees, bushes and pegs pop up (outBack) in seeded order. Packets and tokens ride the road and cable polylines with `inOutSine`.
The camera orbits 22–28° and eases between 39 m and 33 m, so the whole tile always stays in frame. Tilt-shift focus follows the active subject. Pins pop from their tip, and one caption pill shows at a time.

## Default sound palette (`spec.sfx`)
enter `pop` · land `thud` (pitch 0.7 for the tile, about 1.2 for pieces) · move `bubble` · ui `blip` · emphasis `chime` (sparkle) ·
bed `pad` (C major add9, `brightness` 750 Hz — it is a low-pass cutoff in Hz, not 0..1; bed about −36 dBFS rms). Typing uses `click`, the data centre uses `hum` (110 Hz) + `rumble`, and arrivals use `tick`.

## Tuning knobs
- `spec.tile.layers` / `inset` / `radius` / `pebbles` / `bob` / `dropShadow`: the slab cross-section and the float.
- `spec.contact.opacity` / `spread`: how strong the AO blobs are (about 0.3–0.45 reads as toy-on-table).
- `post.tiltShift.range` 0.32, `blur` 4.5. Call `helpers.focusOn(target)` every frame, or the focus sits at frame centre.
- `materials.plastic.clearcoat` 0.35: more gives a glossier, vinyl-toy look. `bloom.threshold` 2.4 means only emissive parts bloom.
- `camera.fov` 20: keep 16–24 so the view stays near-isometric. For the 14 × 8.75 m tile with a top caption, use azimuth 22–28°, elevation 30° and a distance of 33–39 m.

## Known limitations
- A square tile always overflows 16:9. Use the 16:10 default and keep tall trees off the back-left quarter, or they rise into the caption.
- Overlay pins never occlude: a pin anchored behind a building still draws on top.
- Small props (laptop, pegs) need about 1.5× toy-scale exaggeration to read at 1080p. The demo scales the desk by 1.6.
- The story has to sit about 1 m forward of the tile centre, or the cable and pins crowd the caption. One material per building or rack for glow, which is fine up to about 20 glowing pieces.
