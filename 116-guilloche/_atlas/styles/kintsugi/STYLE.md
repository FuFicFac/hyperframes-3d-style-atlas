# Kintsugi (`kintsugi`)

**Look.** A glossy celadon tea bowl (2.3 m across, toy-scale so a ~2 cm gold seam reads at 1080p) on pale oatmeal linen in
soft window daylight. The glaze pools deeper green low down, thins paler toward the rim, and shows a thin iron-brown lip;
the foot ring is unglazed buff clay. Broken edges show the clay body (bisque). Gold is metallic with a room-environment
reflection, slightly lumpy, and blooms only where it glints or is still molten. A bottom-left caption chip (dark plate,
Mincho serif, a small gold seam mark) lives on the overlay in exact colours.

**Signature mechanic: break and mend** (`fracture.js`, THREE-free, shared by picture and sound):
- every surface point is labelled by its DIRECTION from a point on the axis inside the bowl, so the outer wall, rim and
  inner wall break together and each crack runs through the whole wall;
- fracture = a weighted spherical Voronoi (1 foot piece + a lower ring + a rim ring of sites, seeded jitter) of the
  directions after a sum-of-sines warp (big wander + fine jaggedness). The signed edge distance to the nearest other cell,
  times the distance from the centre, is "metres from the seam";
- the SAME formula runs per fragment in GLSL: every shard is a mesh on ONE lathe geometry (its own index buffer of nearby
  triangles) whose shader discards what is not its own — crisp, perfectly matching seams at any distance; a matching
  `customDepthMaterial` per shard does the same for shadows. Back faces render as bisque, so a separated piece's broken edge
  reads as solid clay;
- shard motion is closed form: tip outward and fall on an arc to a precomputed resting pose on the cloth (convex side down,
  footprint circles relaxed apart once at build), two bounces, rest, rise on an arc and slot home with a tiny seat; a
  per-frame ground clamp (min y of ~70 sample points) keeps pieces out of the table. The foot piece stays and jolts;
- gold: on a 720 x 200 (azimuth x elevation) grid the seam cells are found, a Dijkstra ALONG THE SEAMS from one pour point
  on the rim gives each seam cell an arrival distance, a second pass dilates it everywhere, and it is baked into a
  half-float texture (sampled with `textureLod`). Gold is present where `front(t) > arrival`: it runs down each crack and
  splits at junctions, glowing hot at the tip and swelling to a raised bead behind it (analytic normal tilt across the seam,
  width wobble 0.75–1.25, lacquer lumps — no derivatives);
- a few chips (seeded spots on seams) go missing at the break (holes) and fill flush with gold when the front reaches them;
- SCORE from the same plan: a clink when the bowl is set down, whoosh on the lift, impact + crack + crackle, one ceramic
  clink per shard landing (+ a quieter bounce), a clack + tap per shard seating home, a warm pad + faint sizzle under the
  pour, a chime at every seam junction the gold reaches, and a koto-like pluck strum + chime when the last seam is sealed.

## Good for / avoid for
- Good for: resilience, repair, "mistakes become part of the story", recovery and post-mortems, craft and care, before /
  broken / after arcs, anything where the fix should be visible and valued, calm reflective openers and closers.
- Avoid for: data, lists, text-heavy content (only the overlay caption), fast cuts, anything needing several objects
  (one hero), exact fracture physics (the pattern is designed, not simulated).

## Planner (`fracture.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `bowlProfile(spec.bowl)` | the lathe profile segments (r, y, normals, glaze/rim flags), top elevation, centre height. |
| `makeField(spec.fracture, seed)` | sites, warp waves, `at(dir)` -> `{ a, b, e, sc }` (nearest, runner-up, chord edge distance). |
| `createPlan(spec, { land, lift, impact, gather, pour, end, pourAz })` | everything: shards (centroid, normal, rest pose, timings), seam grid + arrival field, junctions, chips. |
| `plan.pose(i, t)` -> `{ q, pos }` | shard i: world = q · (p − c) + pos. `plan.worldPoints(i, t)` for framing. |
| `plan.crackFront(t)`, `plan.goldFront(t)`, `plan.broken(t)` | shader drivers (radians of direction / 0-1). |
| `plan.events()`, `kintsugiVoices(spec.sound)` | setDown / lift / impact / land / bounce / home / pour / junction / sealed -> SCORE via `scoreFromEvents`. |
| `quat`, `v3`, `dirOf`, `azOf`, `elevOf`, `dirFromAzEl` | small helpers (no THREE). Azimuth convention: `atan2(z, x)`. |

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `bowl(plan)` | all shards + pivots, shared uniforms, arrival texture; `update(t)` poses shards and sets crack/gold uniforms. |
| `bowlGeometry(plan)` | the lathe with `aGlaze`/`aRim` and `userData.shardIndex` (per-shard triangle lists). |
| `linen({ size })` | the cloth plane with a soft procedural plain weave. |
| `caption()` | overlay chip, `userData.show(text, alpha)`; bottom-left (the bowl is an ellipse, the corner is free). |

## Sound palette
`marimba` at 1.4–3.5 kHz with short decay as ceramic clinks, `tick`/`clack` taps, `impact` + `clack` + dense `rustle` for
the crack, `whoosh` on lift and gather, a warm `pad` (sfx bus) + faint high `rustle` sizzle under the pour, `chime` notes on
a pentatonic step per gold junction, a `pluck` strum (koto-like) at the seal. Bed: a quiet D `pad` (brightness 760 Hz).

## Knobs (spec.js)
- `bowl`: rim radius/height, wall, foot, flare, `centreY` (direction origin), profile `steps`, lathe `segments`.
- `fracture`: seed, base weight (how far up the foot piece reaches), rings (count, elevation, jitter), warp waves.
- `shardMotion`: crack speed, fall durations, pop, bounce, rest radius / relaxation, return order/durations, arc,
  set-down, rock, lift height.
- `gold`: arrival grid size, pour azimuth (scene overrides), flow duration, bead half width, grow and hot lengths, bump,
  crack hairline width. `chips`: count, elevation band, radius, spacing. Palette: glaze / deep / light / iron / gold / hot.

## Known limits (seen while building the demo)
- The pieces are not physically simulated: falling shards can brush through each other for a frame or two while tipping,
  and the returning pieces converge without collision checks. Resting poses use footprint circles, so curved pieces can
  sit slightly apart from where real pieces would rest.
- The direction labelling makes cracks run straight through the wall (no oblique fracture faces) and the broken edge is
  the back faces of the shell coloured as bisque, not modelled edge faces — fine at this scale, visible in an extreme close-up.
- The gold front is a distance along the seam network on the direction sphere, so it runs at the same angular speed
  inside and outside the bowl (the same seam fills on both faces at once).
- Seam width and the gold bump are approximations (chord distance on the warped sphere x radius); widths vary by
  ±25 % on purpose and a little more where the warp stretches.
- The bowl is the only hero; there is no table dressing, so wide shots rely on the scattered pieces to fill the frame.
- Fonts: the caption names Hiragino Mincho ProN (macOS system font); other systems fall back to Songti / Georgia.
- Framing: the fall is fast, so the follow camera pulls back just before the pieces spread; for ~0.5 s around the impact
  (t ≈ 2.6–3.6 in the demo) the bowl fills only ~56–65 % of the frame width. Everywhere else it is 70–92 %.
- The scattered-pieces shot leaves the bottom of the frame mostly cloth (pieces kept above the caption band).
- Demo numbers (measured, not listened to): sfx.wav mean −22.9 dB, peak −1.1 dBFS; MP4 mean −23.0 dB, peak −1.4 dBFS.
  MP4 4.4 MB at CRF 22 (smooth surfaces, no grain; the linen weave is low contrast on purpose).
