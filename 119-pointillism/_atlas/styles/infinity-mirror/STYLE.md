# Infinity Mirror (`infinity-mirror`)

**Look.** A framed light box on a dark gallery wall in a pool of warm light. Inside, between a rear mirror and a
half-silvered front glass, hangs ONE real layer: a rounded hoop of 40 large warm and coloured bulbs and a small glowing
robot. Every reflection is real instanced geometry — generation n is the real layer reflected n times (alternately
flipped, one cavity depth further back, dimmed by mirror × glass reflectance per bounce, so deep copies go dim and
green). Unlit HDR colour + bloom on near-black; tone mapping `neutral` so the bulb hues survive.

**Signature mechanic — recursion you can count.** `recursion.js` (Node-safe planner, exposed as `style.plan`) owns:
- the depth schedule `genT[n]` / `depth(t)`: generations arrive one at a time (1, 2, 3 … `slow`), then rush to `generations`;
- the optics: `atten(n) = mirror^ceil(n/2) × glass^floor(n/2)` per channel, `gain(t)` (exposure follows the generation
  the camera is at), `tint(n, t)`;
- the geometry: `genMatrix(n, tilt, D)` = `Rot(−n·tilt) · Flip^n` about the mirrors' hinge line (exact at tilt 0 via sinc);
  tilt = π / `ringCells` closes the tunnel into a ring of 2 × ringCells cells;
- the camera: `camera(t)` — exterior keys → push through the glass → fly the centreline `centre(g, tilt)` →
  Hermite exit back to the head-on pose; the scene samples it at every frame into rig keys;
- `events()` + `mirrorVoices()` → SCORE (via `kit/schedule.scoreFromEvents`).

**Good for.** Recursion, self-reference, feedback loops, echo chambers, "a model trained on its own output", agents
calling agents, infinite regress, compounding bias (the tilt).
**Avoid for.** Anything needing readable in-world text (copies overlap toward the vanishing point), bright daylight
scenes, more than two or three objects in the real layer (the centre of the tunnel must stay open for the flight).

## Props (`style.props`)
| prop | what | hooks |
|---|---|---|
| `tunnel(plan, { figure })` | hoop + bulbs + figure as three InstancedMeshes, one instance per generation | `update(t)` |
| `gallery()` | wall with the aperture cut out (pool-of-light shader + bulb spill), floor, frame, box liner, glass sheen | `update({ on, glass, glow })` |
| `caption()` | overlay pill, bottom centre | `userData.show(text, alpha)` |
| `counter()` | overlay chip, bottom right (`COPIES n` outside, `COPY n` in flight) | `userData.show(plan.counter(t))` |
| `hoopGeometry`, `bulbsGeometry(plan)`, `figureGeometry`, `generationMaterial` | parts, for custom real layers | — |

## Signature motion
1. Bulbs switch on round the hoop (`plan.lit`).
2. The tunnel grows one reflection at a time; each new generation arrives a little hot (`optics.flash`).
3. A thing placed in the real layer ripples into every copy (`place.ripple` s per generation).
4. Push through the glass, fly the centreline; colour drains to green as the counter climbs.
5. The mirrors lean: the tunnel bends, closes into a ring, and the flight ends back in front of the box.

## Sound palette
Pad bed + quiet 60 Hz hum; `tick` per second bulb; one `pluck` per new generation, each lower (`gen.semis`), quieter
(`gainFall`) and duller (`brightFall`) — an echo of the picture; `pop` + echo pops for the placed figure; `riser` into the
glass, `whoosh` + `chime` at the crossing; one panned `tick` per generation passed in flight; `servo` for the tilt;
`chime` + strummed `pluck` on arrival. All times come from `plan.events()`.

## Tuning knobs (spec.js)
`cavity.depth` (spacing of copies), `cavity.generations`, `cavity.ringCells` (tightness of the bend), `cavity.tail/tailLevel`;
`optics.mirror/glass` (how fast copies dim and how green), `optics.exposure` (0 fixed … 1 full auto) and `maxGain`;
`bulbs.count/radius/level/colourLevel/pattern`; `figure.scale`; `gallery.pool/spill`; `post.bloom`.
Scene side (TIMES): `grow`, `place.ripple`, `dive.keys` (generation coordinate over time), `tilt`, `exit`, `flyY`, `fov.fly`.

## Known limitations (real ones)
- The tilt is modelled symmetrically (each mirror leans tilt/2 about a hinge in the real layer's plane) so the real layer
  stays put; the drawn frame and glass sheen do not lean.
- The loop is a loop of the CAMERA (it ends in its head-on starting pose); the box's state differs (bent tunnel, figure).
- The ring passes through the gallery, so the gallery is hidden during the flight and generations past `ringCells` are
  hidden once the camera is back outside; ~0.3 s of near-black separates the two (the far half-ring fades first).
- No side-wall reflections and no light cast by the bulbs on the figure: everything is unlit emissive.
- With full tilt only ~10 generations are visible from the front (the rest curve behind the wall).
- `flyY` must clear the figure's antenna (figure height ≈ 1.27 × `figure.scale` from the hoop's bottom).
- ~0.5 M triangles (43 instances × 40 spheres); fine on an M1 Pro, raise `bulbs.count` with care.
- Fast flight (≈ 10 generations/s) can strobe at 30 fps; slow `dive.keys` or lower `generations` if it does.
