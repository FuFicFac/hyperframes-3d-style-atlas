# Low-Poly Miniature (`low-poly`)

A faceted miniature world that looks like folded paper or cut stone. Terrain is a noise-displaced grid with
per-face normals: non-indexed geometry, flat shading, and one vertex colour per triangle. Colour comes in
hard height bands (sand, meadow, grass, moss, ochre, clay), steep faces turn to rock, and each face gets a small HSL jitter, so
neighbouring facets differ slightly. Cone trees, chipped icosahedron rocks, puffy faceted clouds and a sea of bobbing facets sit
under a warm late-afternoon key light. Shadows are crisp but soft (PCF, radius 2.5). There is a cool hemisphere fill, a warm haze
toward the horizon, mild tilt-shift and a slow orbit. Labels are flat paper banners with a numbered octagon chip.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/01-low-poly/`.

**Good for:** journeys and processes over space (optimisation, learning, routes, supply chains, migration, evolution),
geography and ecology, "how a system finds its way" explainers, numbered step-by-step walkthroughs, and calm, friendly, kid-safe topics.
**Avoid for:** precise data (charts and exact values read badly on facets), dark or urgent subjects, UI and product shots,
anything that needs photoreal materials or text-heavy screens, and dense abstract diagrams with no ground plane.

## Prop factories (`style.props`; all seeded, synchronous)
| factory | returns / time hook |
|---|---|
| `terrain({ width, depth, segX, segZ, field \| height(x,z), seed, jitter=.32, range?, waterLevel=0 })` | Mesh; `userData.heightAt(x,z)` (exact faceted surface), `normalAt(x,z)`, `field`, `bounds` |
| `water({ size=90, segments=46, level=0, amp=.08, seed })` | Mesh; `update(t)` bobs the facets |
| `tree({ seed, height?, kind:"pine"\|"round"\|"auto" })` | Group, origin at the ground |
| `rock({ seed, size=.5, squash?, color? })` | Mesh (`userData.sink`) |
| `cloud({ seed, size=1.4, drift=[.25,0,0], bob=.08 })` | Group; `update(t)` drifts from its placed position |
| `scatter(terrain, { count, seed, make(r,i), area?, minH, maxH, minNormalY, avoid:[{x,z,r}], spacing })` | Group; each child gets a seeded `userData.delay` |
| `flag({ seed, height=.7, width?, color? })` | Group; `update(t)` waves the cloth |
| `beacon({ seed, height=2.4 })` | cairn, pole, flag and glowing gem; `update(t)` |
| `hero({ r=.4, detail=1, color? })` | faceted icosphere |
| `arrow({ length=1.6, width=.5, color? })` | flat arrow on XZ, pointing +X |
| `ring({ r=.8, width=.1, segments=10, color? })` | flat ring for pulses (its own transparent material) |
| `trail(points, { spacing=.45, size=.09, groundFn?, lift })` | bead trail; `update(u)` reveals up to the fraction `u` |
| `banner(text, { number })` | screen label; `userData.set(reveal, hide)` (fold/lift via `pinScale`/`lift`; pin with `helpers.pinToScreen`) |
| `burst({ count=44, seed, size=.13, colors, speed, up, gravity, life, floor })` | InstancedMesh confetti of tetrahedra; `update(tau)` closed-form arcs |
| `groundPulse(groundFn, { segments=72, color, lift })` | terrain-hugging band; `update(cx, cz, R, width, opacity)` |

`style.helpers` provides (heightField, descentPath, pop, hopArc now come from kit/terrain.js and kit/motion.js) `heightField(spec)` (JSON terrain: bowl, gauss and ridge terms, fbm noise, island falloff) and
`descentPath(h, {start, lr, momentum, steps})`. It also provides the motion helpers `pop(t, start, dur, overshoot)`,
`hopArc(u, h)` and `growAll(group, t, start, {spread, dur})`, plus `pinToScreen(obj, {x, y, height})` (kit overlay: drawn after post, exact colours) and `facetize(geo, tone|fn, {jitter, seed})`.
`style.factories` exposes terrain, water, tree, rock, cloud, flag, beacon, hero, arrow and ring to `objectsFromSpec`. In OBJECTS, use `primitive: "procedural"` with `factory` and `params`.

## Signature motion
Props pop up out of the ground with an outBack overshoot (about 0.5 s), staggered by a seeded delay. The terrain itself rises from y-scale 0.08.
Movement is made of discrete parabolic hops with a landing squash, and each hop leaves flags and beads behind. Water and clouds never stop moving.
Banners unfold from the chip outward and fold away upward. Payoffs: `burst` confetti plus `groundPulse` light rings that make flags flutter and beads bump as each front passes. The camera establishes high and wide, follows the hero, and settles; the rig adds a 0.012 rad/s orbit.

## Default sound palette (`spec.sfx`)
enter `pop` · exit `whooshOut` · move `whoosh` · land `thud` (pitch about 1.2) · emphasis `chime` (sparkle) · ui `paper` (fold) · bed `pad`
(an open fifth/octave chord around 175 Hz, low brightness). Hops use `tick` on launch and `thud` + `pop` on landing, with pitch stepping as the hero descends.

## Tuning knobs
- `spec.terrainColors.bands` / `steepAt` / `jitter`: the band palette, the rock threshold and the facet contrast (lightness 0.03–0.07 reads well).
- `terrain.segX/segZ` and `jitter`: facet size. About 0.6 m cells reads as low-poly at 15–30 m camera distance.
- `world.fog`, `world.sky`: sea-mist haze. Fog colour = `sky.horizon` = `sky.bottom`; use a pale sea-mist, not sand, or the fogged far sea reads as a beige slab. Run a coarse outer `water` (size 260, below the near sea) past `fog.far`.
- `post.tiltShift` (focus .42, range .32, blur 2.5): blur falls mostly on the distant top; raising `blur` above ~3 smears the foreground band.
- `post.bloom.threshold` 2.6 means only the `glow` material (emission 6) blooms.
- Shadows: key `shadow.extent` 18 covers a 34 × 26 m island. Shrink it for smaller sets to get sharper shadows.

## Known limitations
- Tone mapping is `neutral`, not ACES: ACES greyed the cream paper and the terrain bands.
- Banners live on the kit overlay, so they never occlude against (or hide behind) the 3D scene.
- The kit sky gradient is screen-space: the horizon line in the sky does not track camera pitch; the haze band hides the seam.
- The hero is crimson (`#e0344e`) to stay ~30° of hue away from the clay ridge; keep that gap if you recolour either. (The kit now has an overlay layer — `kit/overlay.js` `pinToScreen(stage, obj)` — drawn after post with exact colours; this style keeps its own banners for its look.)
- `water.update` and `flag.update` rewrite vertices and normals every frame. That is fine at the default sizes (about 14k vertices for water); keep `segments` ≤ 60.
- `scatter` uses rejection sampling with a fixed number of tries. Dense requests return fewer items, deterministically.
- The banner is single-line. Very long labels (over 26 characters at the default height) approach the right safe edge.
