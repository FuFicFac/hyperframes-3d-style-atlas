# Magnetic Memory (`magnetic-memory`)

**Look.** A bright white tabletop board lying flat on a pale warm table, holding a lattice of 56 x 30 small square cells.
Each cell has a hard two-tone tile on an axle: matte cream on one face, deep indigo lacquer on the other, thin vermilion
edges that flash while a tile swings over. A red-and-silver bar magnet (vertical bar, dark collar, silver rod handle
with a black grip) sweeps over the board; tiles under it swing over in a wave and latch. Neutral tone mapping keeps the
cream / indigo / red palette as designed; a soft key from upper left, hemisphere fill, a faint back rim. The lacquer face
gets its own dimmed copy of the room environment (`tile.darkEnv`) so top-down views stay dark while low views still gleam.
Light depth of field (focus on the camera target) softens the far board in low shots. Captions sit on an indigo plate with
a cream rule and a tiny red/silver magnet icon, top centre, on the overlay (exact colours, Helvetica bold). No liquid.

Motion type: analytical with memory, plus two art-directed parts. The magnet's pose is a cubic-Hermite curve through
hand-set keys in t. The pull at each tile is the closed-form vertical field of a two-pole bar (near pole at height h,
far pole at h + L, Bz ~ h/r1^3 - (h+L)/r2^3); a tile flips at the first time the push against its current face exceeds
its own seeded threshold, and latches. Flip times are found once at page load by sampling the known path every 1/240 s
and interpolating the crossing, so any frame is computed directly (no stepping in renderAt). Art-directed: the flip is a
closed-form damped spring swing (~0.3 s, about 12 % overshoot), not rigid-body dynamics; the pre-flip lean (tilt ~
(push/threshold)^2, max 0.35 rad) is a visual cue; the beat-1 "settle" flurry (30 % of tiles flip once into their
starting face in the first 1.7 s, as if the board had just been shaken) is seeded, not physical. The point-pole field is
a textbook approximation; it was not checked against a real magnet or real tiles.

## Signature mechanic (`memory.js`, Node-safe; `style.plan` / `style.motion`)
- Tiles: seeded starting face (`darkShare`), seeded log-normal thresholds (`coerc.median`, `coerc.sigma`).
- Passes: `[{ id, pol, from, to, keys: [{ t, x, z, h, hold? }] }]`. `pol` +1 = red end down (pushes to dark),
  -1 = turned over, silver end down (pushes to pale). Outside its window a pass is off (magnet hidden, no field).
- Hysteresis is what makes the memory: nothing pulls a tile back when the magnet leaves; only a later opposite push
  stronger than its threshold can. A higher pass is weaker (peak ~ 1/h^2): in the demo pass 1 peaks at 38 pull units,
  pass 2 at 3.2 against a median threshold of 2.2, so pass 2 flips back only the low-threshold tiles (127 of the 762
  dark tiles; the rest stay).
- Track width scales like (h1 / threshold)^(1/3) and the second pass's lane like its height, so with point poles the
  rewrite lane is ~0.7 x the track width. The demo runs pass 2 at a shallow angle along the track's left arm so the
  partial rewrite covers a long stretch instead of a small crossing.

| call | what |
|---|---|
| `planMemory({ cols, rows, pitch, seed, darkShare, coerc, settle, magnet: { q, L }, passes, dt, swing, tilt })` | the plan (~150 ms for 1680 tiles and 6.4 s of passes) |
| `plan.angle(i, t, m?)`, `plan.stateAt(i, t)`, `plan.magnetAt(t)`, `plan.push(i, t)` | state at t |
| `plan.flipsOf(i)`, `plan.stats`, `plan.events({ binHz })`, `memoryVoices(spec.sound)` | flips, numbers, sound events |
| `hermite(keys, t, field)`, `pull(d2, h, L)` | building blocks (also used by the demo camera) |

## Good for / avoid for
- Good for: memory, path dependence, bias and priors, "you can't un-ring the bell", hysteresis, how training leaves
  traces, habits, history shaping the next step, why order matters, partial overwriting.
- Avoid for: smooth reversible change (the point is that it does NOT go back), liquid or organic looks (that is
  ferrofluid), anything needing exact magnet physics or real field maps, dark or moody pieces.

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `memoryBoard(plan)` | table + board + tiles + magnet, added to the scene; `update(t)` |
| `tiles(plan)` | one InstancedMesh (1680), 3 face materials by group (edges, cream +y, indigo -y); `userData.update(t)` |
| `magnet()` | bar (red/silver halves), collar, rod handle, grip; `userData.set({ x, z, h, pol, on })` (pol -1 rolls it over the handle axis) |
| `board()`, `table()` | base slab (pit colour), merged white lattice walls, raised white frame; matte table plane |
| `caption()` | overlay indigo plate with the magnet icon; `userData.show(text, alpha)` |

## Sound palette
`click` per 1/30 s bin of flips (gain ~ sqrt(count), panned by the bin's mean x): quiet high ticks for the beat-1 settle,
a fast run that follows the magnet on pass 1, a sparser, lower run on pass 2. A soft warm `pad` bed under everything
(no clicks while the magnet is away), `whoosh`es as the magnet arrives and leaves and under the camera dive. All cue
times come from the plan / BEATS.

## Knobs (spec.js)
- `grid` (cols, rows, pitch), `tile` (size, thickness, bevel, sink, `darkEnv`), `board` (margin, pit depth, wall, lip),
  `magnet` (bar width, length L, handle direction and sizes).
- `plan`: seed, `darkShare`, thresholds (median, sigma), settle flurry, swing spring, tilt, `h1` / `h2` pass heights.
- `dof` (relativeAperture, maxblur), `fly` (demo fly-along: height, side offset, look-ahead, fov), `caption`, `sound`.

## Known limits (seen while building the demo)
- Dense high-contrast grid under a moving camera: the demo MP4 is ~12 MB and needed CRF 23.
- Pass 2's rewrite is clear in the final wide but quieter than pass 1's track: a point-pole magnet cannot make a lane as
  wide as the track and still flip only "some" tiles; the demo runs pass 2 along the track's left arm to compensate.
- At top-down angles a faint brighter patch remains on the lacquer under the camera (the room environment's ceiling
  light), even with `darkEnv` 0.2.
- The magnet enters and leaves through frame edges; it is ~6 % of frame width in the wides (bar 0.26 x 0.9 m on a
  5.6 m board). Its shadow mostly falls behind it.
- The turned-over magnet in pass 2 (red end up) is shown, not explained.
- Not watched in motion at full speed; audio levels measured, not listened to.
