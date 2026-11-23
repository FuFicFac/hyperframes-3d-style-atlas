# Tiny Planet (`tiny-planet`)

**Look.** One small faceted low-poly globe (6 m across, toy scale) on a warm cream backdrop with a soft pale halo behind
it. A fixed sun lights it from the upper left, so the right limb is always a blue night crescent. The camera is locked;
the planet turns. A bare grey ball with a lat/long grid grows a world along its surface: sea, sand, grass, rock and snow
facets, pine and round trees, cream houses with coloured roofs, pale roads, puffy faceted clouds, and warm lamps that come
on as they turn into the night side. Small word chips (ink = land words, coral = life words) rain onto the globe in
streams. Tone mapping `neutral`, no grain, light vignette; captions on a cream overlay pill with an ink edge.

**Good for.** "A world built from what goes in": training data and what a model knows, coverage and blind spots, a
knowledge base filling in, a map being explored, growth of a network or community, anything where "the far side" is a
useful idea (the unseen, the unread, the unmeasured).

**Avoid for.** Precise data or charts; subjects that need a flat stage or long text; dark or moody pieces (the look is
bright; only the crescent is dark); stories with more than ~5 places to label (there are no in-world labels).

## Files
- `spec.js` — palette, materials, lights, plus the blocks the planner and props read: `globe` (radius, facet detail,
  sun direction, rise/tint timings, grid, terrain), `trees`, `houses`, `roads`, `lamps`, `clouds`, `halo`, `chips`
  (word lists, fall), `caption`, `sound`.
- `globe.js` — **the planner (Node-safe, no THREE).** `createPlan({ spec, world, end })`. Exposed as `style.plan` / `style.motion`.
- `style.js` — `createStyle(stage)`; turns a plan into pictures.

## The plan (`globe.js`)
- **Everything is a place on the globe**: `[lat, lon]` in degrees (lon 0 faces +Z, +lon toward +X) or its unit direction.
  Helpers: `dirOf`, `latLonOf`, `angle` (degrees), `slerp`, `frameAt` (east/north/up), `offset(d, bearing, dist)`,
  `rotY`, `fibonacci(n)`, `spinAt(spin, t)`.
- `world` (the scene's content): `continents` (caps `{ at, r, amp }` + 3D fbm → coastline), `towns` (`{ at, r, houses,
  tower }`), `roads` (lists of places joined by great-circle arcs), `reads` (`{ kind: "land" | "life", side, at, t, dur,
  reach }`), `nearPole` / `nearCap` / `edgeNoise` (which cap a read may reach), `clouds` (count), `spin`
  (`{ deg0, rate, turns: [{ t, dur, deg, ease }] }`), `finale`.
- `surface(d)` → final height above the bare ball + colour band (`kind`, `kind2`, `u`), flattened to a plateau under
  towns and roads (which are also forced to be land), ice past `terrain.ice` degrees of latitude.
- **Reading.** A read is a stream of word chips landing at a place from time `t`; from the landing a front spreads along
  the surface, `front = reach · outQuad((t − t0) / dur)`. `landAt(d)` / `lifeAt(d)` invert that in closed form: the
  earliest time a land / life front of the place's own side reaches it. Vertices rise and facets colour at `landAt`;
  trees, houses, road samples, lamps and clouds appear at `lifeAt` (never before the land is up).
- Features, each with a place and a time: `trees` (Fibonacci candidates kept on grass by a forest-noise test),
  `houses` (rejection-sampled inside each town, clear of roads and each other), `roads` (`pts`, `times`), `lamps` (one per
  house, one every few road samples), `clouds` (puff groups, `cloudDir(c, t)` drifts them in longitude), `chips`
  (`chipPose(c, t)` → world position, scale, roll).
- **Proofs for the scene to gate on:** `bareVisible(t)` (share of the visible disc not yet read), `coverage`
  (`unreached`, `lastLand`, `lastLife`, `lastFeature`), `grown(t)`.
- `events()` + `planetVoices(spec.sound)` → SCORE through `kit/schedule.scoreFromEvents` (bed, stream, chip, rise, tree,
  house, lamp, turn, reveal, finale).

## Props (`style.props`)
| prop | what |
|---|---|
| `world(plan)` | Builds everything, adds it to the scene, returns `{ group, planet, surface, update(t) }`. Call `update(t)` after the camera rig. |
| `surface(plan)` | The globe: non-indexed icosphere; `update(t)` rewrites vertex radii and facet colours from arrival times. |
| `grid(plan)` | Lat/long ribbons that sink under the surface where the ground has been read. |
| `trees(plan)` / `houses(plan)` / `clouds(plan)` | InstancedMeshes posed from spherical places; scale = pop from `t`. |
| `roads(plan)` | Ribbons on the plateau, revealed by draw range. |
| `lamps(plan)` | Additive HDR points; level = night factor of the lamp's current world normal (`update(t, spin)`). |
| `chips(plan)` | Camera-facing word quads from one atlas (`update(t, camera)`). |
| `halo()` | Soft pale disc behind the globe. |
| `caption()` | Overlay pill; `userData.show(text, alpha)`. |

## Signature motion
- The camera does not move (one push-in at the very end is the only move); the globe turns at a slow steady rate, with
  one fast eased half-turn as the reveal.
- Chips fall in streams from outside the frame (approach biased to the sides/top so they do not fly at the lens) and
  shrink into the ground; a pale front runs out from the landing, land rises behind it with an outBack overshoot.
- Trees and houses pop (outBack, squashed at first); roads draw outward from the town; lamps fade up as their place
  turns past the terminator.

## Sound palette
Warm major pad bed; a pentatonic marimba tick per chip landing (an octave up for life words); low rumble + squish as
land rises, a small chime when a life front starts; bubbles for trees, plucked notes for houses, a sparkle when a town's
lamps arrive; whoosh + low servo for the half-turn, a thud and a low plucked note on the reveal; sparkle + marimba
arpeggio for the finale.

## Tuning knobs
- `globe.detail` (facet size), `globe.rise` / `overshoot` / `tint` / `flash` (how the front looks), `terrain.hMax`,
  `ridgePow`, `rockAt`, `snowAt` (mountain bulk), `terrain.sea` (land share).
- `globe.sun` + `lights.sun.position` (keep equal) and `globe.night` (where lamps come on); `lamps.level` / `size` / `limb`.
- `chips.count` / `gap` / `fall` / `drop` / `bias` (stream density and where it comes from), word lists.
- `trees.candidates` / `density`, `houses.size` / `gap`, `clouds.alt` / `rate`.

## Decisions and known limitations
- **No shadows.** The directional sun casts none (stage created with `shadows: false`): shadow maps on a faceted sphere
  acne at the terminator and the flat shading already gives the facets depth. Trees and houses therefore have no contact shadow.
- **The night side is only a crescent** (~27 % of the disc at the equator) because the look must stay bright; lamps are
  visible only there. They are additive points that fade toward the limb (`lamps.limb`) so they do not stack into a smear.
- **Reads are restricted to a cap** (`side`), not just to their `reach`: that is what keeps the far side provably bare
  (`bareVisible`) until the scene wants it. A world with no "far side" idea can use one side and `nearCap: 181`.
- Trees stand at the smooth `surface(d)` height while the ground is faceted, so a few float or sink by a centimetre or two
  (`trees.sink` hides most of it). Roads and towns sit on a forced plateau; a road across the sea becomes a causeway.
- Word chips are ~30 px tall at the wide shot: they read as words, but only the nearest are legible. They are opaque
  quads with an alpha-tested rounded corner (no soft edge).
- CPU work per frame is ~32 k vertex writes + ~1 400 instance matrices; no per-frame canvas or texture uploads.
- A sphere cannot fill 16:9: the final push-in crops the poles and leaves backdrop left and right.
- No in-world labels (they would turn away with the planet); the caption is one fixed overlay pill.
