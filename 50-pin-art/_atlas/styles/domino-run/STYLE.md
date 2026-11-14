# Domino Run (`domino-run`)

**Look.** A domino rally on a polished honey-oak floor, seen low and close in warm window daylight. Hundreds of glossy,
plain-faced lacquered tiles (tomato, saffron, teal, cobalt, cream, plum — no pips, no marks) stand in curving lines,
spirals and branches, step up pale beech blocks and cross a plank bridge. The floor is a blurred mirror (kit
`reflectiveSweep`) so every tile has a soft reflection; the room falls off into warm dark fog. Tiles are ~10x a real
domino (0.25 x 0.5 x 0.08 m) so they read at 1080p. The beat label is a cream caption chip with a tiny two-tone domino,
pinned to the screen (overlay: exact colours, never blurred).

**Signature mechanic.** A chain reaction solved as a pure function of time by `rally.js` (THREE-free):
- every tile's **trigger time** = earliest arrival of the topple wave over a trigger graph (lines at a set speed per path,
  a split, a merge, a ball arrival, a field fan) — Dijkstra once at build;
- every tile's **fall angle** = a closed-form accelerating fall from its trigger, `hit * G((t - trig) / dt)`, clamped by the
  exact corner-on-face **contact** with the next tile, `c(psi) = psi + asin((d cos psi - T - dy sin psi) / H)`, so it strikes
  the next tile exactly `dt` later and comes to rest leaning on it (~75 deg = acos(T/d) on a straight run); the last tile
  of a line falls flat; a tile before a step leans on the step edge at most. Evaluated in descending trigger order: O(n)
  per frame, nothing carried between frames. `plan.worstOverlap(times)` proves in Node that no tile passes the next one.
- two-colour **fields** topple row by row (or in a vee from the entry tile, or along a snake) and show a picture/word on
  their backs to a camera on the falling side;
- **gadgets**: a ball rolls (closed-form deceleration) and starts or relays a line, a flag springs up when a line's last
  tile lands, a banner unrolls when a set of tiles has landed.
- The same plan drives the clicks in SCORE (one per topple, binned) and the chase camera (`chaseKeys` follows the
  window-averaged wave front).

## Good for / avoid for
- Good for: cause and effect, knock-on consequences, "one small thing triggers the next", sequences and dependencies,
  branching outcomes, a reveal at the end of a process (a word or simple picture of up to ~15 x 11 cells).
- Avoid for: data and numbers (the field is a low-resolution bitmap), long text, anything that must be read while the
  camera moves fast, abstract software flows (use floating-screens / circuit-board), precise mechanisms (marble-run).

## Planner (`rally.js`, Node-safe; `style.plan` / `style.motion`) — the layout "prop factories"
| call | what |
|---|---|
| `createRally(STYLE_SPEC, { speed })` | builder; everything below hangs off it. |
| `R.path([[x,z]...], { fillet })` | filleted, resampled path with `tangent(s)` / `point2(s)`. `spiral(center, r0, r1, turns, { theta0, dir })` gives spiral points to append. |
| `R.line(id, path, { spacing, speed, colors, run, back, colorAt, levels, bridge, s0, s1 })` | a line of tiles along a path. `levels: [[k, L]]` = from tile k stand on block level L (**stair**); `bridge: [k0, k1]` renders that raised run as a plank **bridge** on piers. |
| `R.split(A, [B, C])`, `R.merge([A, B], C)`, `R.link(a, b, { contact, delay })`, `R.start(tile, t)` | branching: one tile strikes two side-by-side tiles; a merge tile falls at the first arrival; raw links and timed pushes. |
| `R.field(id, rows, { origin, dir, pitch, paper, ink, front, order: "rows"\|"vee"\|"snake", entryCol, spread, speed })` | **picture field**: bitmap rows (`'#'` = ink; row 0 is hit first) to two-colour tiles; `F.entry`, `F.lastRow`, `F.box`. |
| `R.ball({ from, into, at \| by, v0, decel, r })` | rolling **ball** gadget: starts `into` on arrival (throws if it would stop short). |
| `R.flag({ at, yaw, by })`, `R.banner({ at, yaw, by, delay })` | **flag** springs up / **banner** unrolls when `by` lands. |
| `R.solve()` → `plan` | `tiles` (trig, land, p, yaw, colours), `events`, `anglesAt(t, out)`, `front(line, t)`, `chase(route, t)`, `ballAt(B, t)`, `lineSpan(id)`, `blocks`, `gadgets`, `worstOverlap(times)`. |
| `toppleEvents(events, { bin })` + `rallyVoices(S.sound)` | sound thinning (one click per bin, gain ~ sqrt(count), a clack body when 3+) for `kit/schedule.scoreFromEvents`. |
| `chaseKeys(plan, { route, shots, smooth, dt })` | dense linear CAMERA keys chasing the wave front; shots = offset/look (or fixed target) reached at shot.t, eased between. Gate them with `kit/framing.framingReport`. |

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `rally(plan)` | everything for a plan: floor + `tiles` + `blocks` + balls + gadgets; `update(t)`, `reflect([x, z])` (moves the sun's tight shadow box and renders the floor mirror — call after `rig.update`). |
| `tiles(plan)` | one InstancedMesh for every tile; per-instance front/back colours (`aFront`/`aBack` instanced attributes; the back face + its rim take `aBack`); `userData.update(t)`. |
| `tile({ front, back })` | a single tile (pivot at its front bottom edge), `userData.setAngle(a)`. |
| `blocks(plan)` | stair blocks and plank bridges from `plan.blocks`. |
| `ball(B, plan)`, `flag(G)`, `banner(G)` | gadgets; each has `userData.update(t)`. |
| `floor({ size })` | the reflective wood floor (`userData.reflect(center)`). |
| `caption()` | the beat label chip on the overlay; `userData.show(text, alpha)` (canvas uploaded on redraw). |

## Sound palette
Topple = short high `click` per bin (+ `clack` body when 3+ tiles share a bin, always in fields); line end = `clack`
landing; ball = low `rumble` for the roll + `clack`/`thud` on impact; flag = `pop` + short whoosh; banner = whoosh +
`paper` flap + soft `thud`; reveal = `chime`; bed = warm `pad` (196 Hz, 900 Hz cutoff). Demo levels (measured, not
listened to): see the demo report.

## Knobs (spec.js)
`tile` (W/H/T, spacing, gloss), `wave` (speed, push = how much of the fall is linear, contact margin), `stair` (rise,
widths, deck), `field` (pitch, vee spread), `ball`, `flag`, `banner`, `caption`, `sound` (bin, gains), `palette.tiles`,
the floor material (wood map, clearcoat) and the reflection settings in `style.js floor()`, `lights.sun` (offset from the
chase target; the scene moves it).

## Known limits
- The topple is a 2D model in each tile's own plane. On curves the contact distance is made conservative by the yaw
  difference (`d - W/2 |sin dyaw|`), so the inside of a tight curve can show a few mm gap; keep radii >= ~0.9 m at the
  default spacing. Merges assume the arriving lines roughly share the merge tile's heading.
- Fallen tiles in a field overlap like shingles, so each cell shows only a strip of its back face: pictures read best
  from a high camera on the falling side and at ~15 columns or fewer; the demo's "GO" reads
  but are pixel art, not type.
- Stairs and bridges must sit on straight path segments (blocks are straight boxes). Steps down rely on the tile pivoting
  at the step edge; there is no "tumble down a flight".
- The reflection pass renders the scene twice per frame; the floor mirror shows a faint vertical smear under thin poles.
- The flag pennant is flat-shaded cloth with a small travelling ripple (vertex rewrite from t, no physics).
- Caption font is a system stack (Avenir Next): pixel-identical on this Mac only.
