# Lichtenberg (`lichtenberg`)

**Look.** Fractal wood burning. A pale maple board (1.6 m x 0.94 m, toy-scale exaggerated so a 3.6 mm twig still reads
at 1080p) lies on a dark slate cutting mat. Two copper electrode pucks are bolted to it, a red lead on the left and a
blue lead on the right, each with a stamped tag ("QUESTION" / "ANSWER" in the demo). A high-voltage discharge burns a
branching Lichtenberg figure into the wood: a white-blue arc at every burning tip, an orange ember just behind it
cooling to dark red, then a near-black charred groove with a soft brown scorch halo. Strong value and hue separation:
black tree on cream wood, orange embers, blue-white arcs, and one orange glowing channel at the end. A caption chip
(char plate, cream text) sits top-left on the overlay.

**Signature mechanic.** A seeded, precomputed burn plan (`burnplan.js`, THREE-free):
- `growTree`: space colonisation from the first electrode. A jittered grid of attractor points covers the free board;
  each attractor pulls its nearest node one `step` toward it (with a seeded wiggle, which makes the line jagged) and is
  used up when a node comes within `kill`. The tree fills the board and stops wherever attractors ran out: dead ends
  everywhere. The second electrode is one more attractor with a longer reach; the first node to reach it is the winner
  and nothing else may enter its clear zone. Short side spurs are added afterwards for the feathery edge. `keepOut`
  rectangles (caption, tags) are never entered.
- half-width per node from its downstream length (`min + (max - min) * (weight / total) ^ power`): thick trunks, thin twigs.
- a burn time per node. Winning path: a steady crawl from `start`, then a leap over the last `leapLen` ending exactly
  at `connect`. Every side subtree starts when its fork burns (plus a small delay) and follows
  `t = fork + delay + dur * (d / dmax) ^ slow`, so it slows down as it dies; all are dead before `die`. Subtrees that
  would fork in the last `pruneLate` seconds are not grown: the final stretch belongs to the winner alone.
- `bakeField`: the plan is rasterised once into two float textures at 1 mm per texel: (signed distance to the nearest
  groove edge, burn time at the nearest groove point, halo radius) and (signed distance to the widened winning channel,
  position along it). The board is ONE MeshStandardMaterial with an injected fragment block: `age = uTime - burnTime`
  gives arc (age < 0.1 s), ember (exp decay, longer on thick grooves), char (inside the groove) and scorch (halo that
  keeps spreading for about a second). After `connect` a return stroke runs back along the winning channel in `sweep`
  seconds; the channel widens, flashes white-blue, cools through yellow to a sustained orange core with a char rim.
- Tip flares (flat additive quads, seeded per-frame flicker) and smoke wisps (camera-facing puffs: from dying tips, a
  rate-limited trail behind the front, and the whole winning path after the flash) are two InstancedMeshes rewritten
  from the plan each frame. The key light dips and bloom lifts for about a second on the connection.
- SCORE from the same plan: a strike clack and mains buzz for as long as anything burns, one crackle per 70 ms bin
  (the thickest node igniting in it; panned by x), a fizz per dying branch, a sizzle bed scaled by the number of live
  fronts, a riser into the connection, thud + clack + zap + whoosh on it, a chime and a warm chord after.

## Good for / avoid for
- Good for: search and exploration ("many paths tried, one kept"), decision trees, routing, how lightning or a network
  finds a path, spread and reach, "the connection is the moment", growth from one seed, before/after reveals where
  the result stays on screen as an object.
- Avoid for: anything needing text or numbers inside the picture (only the caption and two tags), exact physics or
  exact ML mechanics (it is a metaphor), more than two terminals (the planner has one start and one goal), long holds
  after the burn (the finished board is static apart from smoke), small insets (twigs vanish below about 1.5 px/mm).

## Planner (`burnplan.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `growTree({ board, q, a, keepOut, seed, grow })` | `{ nodes: [{ p, parent, spur }], winner, attractors }`. |
| `createPlan({ board, q, a, keepOut, seed, grow, width, times, smoke, crackle, end })` | the plan: nodes with `t`, `w`, `win`, `s`; `segs`; `winPath`; `stats`. |
| `plan.tipsAt(t, out)` | burning fronts `[x, y, halfWidth, heat]` (closed form scan of the segments). |
| `plan.alive(t)`, `plan.burnt(t)` | number of burning fronts; share of the tree length burnt. |
| `plan.wisps`, `plan.deaths` | smoke puffs `{ t, x, y, life, size, seed }`; dead ends `{ t, x, y, w }`. |
| `plan.events()`, `burnVoices(spec.sound)` | strike / crackle / fizz / sizzle / connect / glow -> SCORE via kit `scoreFromEvents`. |
| `bakeField(plan, { pxPerMetre, halo, winHalf, winGlow })` | the two Float32Array fields the shader reads. |

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `burnBoard(plan, { tags })` | everything: bench, board, both electrodes, flares, smoke; `update(t, camera)` (call after the camera rig), `shake(t)`, `flashAt(t)`. |
| `board(plan)` | slab + burn-shaded top; `userData.setTime(t)`. |
| `burnMaterial(plan)`, `woodMap(seed)` | the material alone (to burn another flat surface); the painted maple map. |
| `electrode({ at, side, lead, tag, tagDx })` | copper puck, bolt, ring terminal, lead off the board, stamped tag. |
| `glints(plan)`, `smoke(plan)` | the InstancedMeshes; `userData.update(t[, camera])`. |
| `bench()` | dark slate cutting mat. |
| `caption()` | overlay chip, `userData.show(text, alpha)`; top-left. |

## Sound palette
`clack` + `buzz`/`hum` (strike and mains hum), `tick` / `click` / `pop` (crackle), `rustle` (fizz and sizzle bed),
`riser` -> `thud` + `clack` + `buzz` + `whoosh` (connection), `chime` (sparkle) + `pad` (afterglow), a low `pad` room bed.

## Tuning knobs (spec.js)
- `grow.spacing` (twig density), `grow.step`, `grow.wiggle` (jaggedness), `grow.spur.p` (feathering), `board.seed`.
- `width.min / max / power` (line weights), `width.win` (widened winning channel, half-width).
- `times.*` (start, connect, die, dieSpread, slow, pruneLate, sweep); a scene sets start / connect / die from its beats.
- `burn.halo`, `burn.ember`, `burn.arc`, `burn.win` (shader look), `glints`, `smoke`, `flash` (light dip, bloom lift, shake).
- `keepOut`: board rectangles the tree avoids; move them with the caption and tags.

## Known limitations
- One start, one goal, one board. The tree shape comes from the seed; the winning path is whichever branch arrives, so
  it is fairly direct (space colonisation grows outward). It cannot be told to take a particular route.
- The bake is about half a second of JavaScript at page load (1600 x 938 texels, two RGBA float textures, about
  48 MB of GPU memory). It needs linear filtering of float textures; without `OES_texture_float_linear` it falls
  back to half floats (not exercised on this machine).
- The groove is shaded flat (colour and emission only, no relief normal), so at a low camera angle it reads as a
  drawn line rather than a carved channel. The demo spends most of its time near top-down.
- Flares are flat quads on the board: from a low angle they are ellipses. Smoke is a few dozen soft puffs, not a
  simulation, and reads as grey smudges in a still.
- The arc/ember region ahead of a front is cut by nearest-groove cells, so very wide `burn.arc.spill` values show
  polygonal shards (keep it under about 0.2).
- Tags are flat text planes; seen from the side of the board they foreshorten and look slanted.
