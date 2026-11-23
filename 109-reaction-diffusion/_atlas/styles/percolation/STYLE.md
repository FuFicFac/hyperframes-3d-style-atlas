# Percolation (`percolation`)

**Look.** A white enamel board standing upright, front-lit, carrying a square grid of short glass sight-pipes joined by
brass ball fittings. Every pipe has a brass valve with a red lever on its face (across the pipe = shut, along it = open).
A navy trough of blue water runs along the top, a pale empty trough along the bottom. When a valve opens, a flat pastel
band is painted onto the enamel behind its pipe in its cluster's colour (green, lime, peach); the cluster that touches
the bottom trough is amber; pipes the water reaches turn saturated blue (deep blue water inside the glass, a blue band
behind it), and the filling front is the most vivid blue of all, settling in 0.6 s. The deciding link is marked in
magenta from beat 4 to the end: a ring in front of its valve (it pulses in beat 4, then grows 1.5x for the final wide),
its lever and its band, so the final wide still shows which link did it. Neutral tone mapping keeps the palette as designed; a soft
key from upper left gives every pipe a short shadow on the enamel. Captions sit on a navy enamel-sign plate with a white
rule and a water-drop icon, top centre, on the overlay (exact colours, Helvetica bold). Pipes are glass, not brass as
the storyboard says, so the water can be seen; the fittings, valves and rims are brass.

Motion type: exact connectivity, art-directed timing. Which valve joins top to bottom is solved exactly (seeded opening
order + incremental union-find), and which pipes are wet at any t follows exactly from the valves open by then. Valve
times are a seeded order spread over hand-set time knots; water is an earliest-arrival flood (Dijkstra) with a constant
travel time per pipe — not fluid dynamics: no pressure, no flow rate, and the race speed is chosen by bisection so the
water reaches the bottom trough at a set time.

## Signature mechanic (`percolate.js`, Node-safe; `style.plan` / `style.motion`)
- Grid: W x H joints (demo 16 x 8, pitch 0.6 m, fat pipes and valves so each link reads in the wides), a top trough T
  and a bottom trough B. Pipes = (H + 1) rows of vertical pipes (T -> row 0 ... row H-1 -> B) + H rows of horizontal
  pipes: 264 in the demo (it was 24 x 12 / 588 in the first build, which read as a busy texture).
- A seeded shuffle gives the opening order; an incremental union-find finds index kStar, the exact pipe whose opening
  first puts T and B in one cluster. Pipes before it open across beats 1-3 (piecewise-linear knots: share -> time); it
  opens alone in beat 4; pipes after it never open. So the wet region provably ends one pipe short until beat 4.
- Water: earliest arrival from T over open pipes, each usable once its valve has turned; `flow.dt` per pipe before the
  join, `decide.dt` through the deciding pipe, `dtRace` after (bisected so arrival at B = `flow.reachB`). B is a sink:
  water reaching the bottom trough does not climb back up other pipes (those pipes stay amber). Each pipe fills from
  each end that gets water: `fill(e, t) -> [fa, fb]`, closed form, so seeking is exact.
- Tints: replay of the order with union-by-size; the bigger cluster keeps its colour, the smaller one's pipes
  cross-fade (0.25 s); index -1 = joined to the wet cluster (pale, water on its way), -2 = touches the bottom trough.
- `findSeed(W, H, { accept })` searches seeds deterministically; the demo's seed (483) puts a vertical deciding pipe in
  the centre column, row 3, with 3 pipes above it to the top and 8 below it to the bottom, 59.8 % of valves open; water
  settles at 8.1 s (before beat 4), reaches the bottom trough at 12.4 s and finishes its last branch at 14.1 s.
  `planPercolation` re-checks `accept` and throws if water is still moving when the deciding valve turns.

| call | what |
|---|---|
| `planPercolation({ W, H, seed, open: { knots }, turn, decide: { at, turn, dt }, flow: { dt, reachB }, tints, accept })` | the plan (~10 ms) |
| `plan.valveU(e, t)`, `plan.fill(e, t)`, `plan.tintAt(e, t)`, `plan.troughB(t)`, `plan.openCount(t)` | state at t |
| `plan.starId`, `plan.star`, `plan.tJoin`, `plan.tB`, `plan.settle`, `plan.stats` | the deciding pipe and timings |
| `plan.events({ binHz })`, `percolationVoices(spec.sound)` | valves / gurgle / race / decide / trough events -> SCORE |
| `grid`, `analyse`, `firstSpanning`, `findSeed` | building blocks |

## Good for / avoid for
- Good for: tipping points, thresholds, "one more link", adoption and network effects, access, connectivity, phase
  transitions, why a system suddenly works, redundancy and fragility (what if that one valve had stayed shut).
- Avoid for: smooth gradual change (it is a threshold story), anything that needs real flow rates or pressure, small
  grids (below ~12 x 8 the spanning cluster is not dramatic), dark or moody pieces.

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `percolationBoard(plan, { ring: { on, off, inDur, outDur } })` | everything: board, both troughs, network, magenta highlight on the deciding link (ring, lever, band); `update(t)` |
| `network(plan, { highlight: { id, level(t) } })` | 10 InstancedMeshes (glass pipes, joints, valve bodies, collars, levers, lever caps, water from end a / b, bands); `userData.update(t)` |
| `board()`, `trough({ y, level })` (`userData.setLevel(u)`), `focusRing()` (`userData.set(x, y, k, grow)`) | set pieces |
| `caption()` | overlay enamel-sign plate; `userData.show(text, alpha)` |

## Sound palette
`click` per 1/20 s bin of valve turns (gain ~ sqrt(count)); `bubble` per bin of pipes starting to fill (quiet before the
join, louder in the race); a warm `pad` bed released before beat 4 (the held breath: ~1.2 s of silence), then one loud
`clack` + `thud` for the deciding valve; a `riser` that lands as water reaches the bottom trough, `chime` + `rumble`
there, a brighter `pad` under the last beat, two soft `whoosh`es on camera moves. All times from the plan / BEATS.

## Knobs (spec.js)
- `grid` (W, H, pitch), `board` (margins, border, rivets), `pipe` (radii, valve and lever sizes, lever `pop` swell),
  `band` (width, fade), `front` (settle time, boost), `trough`, `ring` (radii, z in front of the lever, final `grow`).
- `plan`: seed, valve turn time, opening knots, deciding valve (turn length, water time through it), flow dt and the time
  water should reach the bottom.
- `palette.tints` (keep blues, purples, pinks and reds out: they read as water or as the highlight), `bottom`, `wetBand`,
  `waterFront`, `bandFront`, `highlight` (magenta).
- `sound`: valve click gain curve, gurgle / race bubble levels, deciding clack, trough chime, bed, rush.

## Known limits (seen while building the demo)
- Brass fittings and red levers on every pipe are still a lot of hardware; at 16 x 8 each link reads, but the board
  is not minimal.
- The grid (aspect ~1.6 with troughs) under a top caption leaves ~13 % plain enamel each side in the wides.
- The vivid-blue front against settled blue is a moderate contrast; the race reads mainly by blue advancing over the
  amber and white (dry) pipes during the pull-back.
- With only 3 pastel tints, neighbouring dry clusters can share a colour.
- Water from the bottom trough does not rise into pipes hanging off it, so a few amber branches stay dry at the end
  (correct for the model, may puzzle a viewer).
- Water timing is per-pipe constant (graph distance), not hydraulics; the race speed is chosen to land on the beat.
- Audio levels were measured, not listened to.
