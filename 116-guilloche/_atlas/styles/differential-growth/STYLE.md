# Differential Growth (`differential-growth`)

**Look.** A bright pastel studio: a mint sweep, a round warm-white table, and on it a low clear glass hoop with a mint
lip. Inside the hoop a coral-pink paper ribbon stands on edge (light-coral cut top edge). The ribbon keeps getting longer
but the hoop does not: the ring swells to the glass, buckles into a row of waves that fold inward, each wave sprouts
smaller waves, and the hoop ends packed with one continuous, never-crossing ribbon that reads from straight above as a
coral maze. A yellow band can run the ribbon's whole length to prove it is a single strip. Toy-scale (a 2 m hoop,
13 cm ribbon, 9 mm paper) so the folds read at 1080p.

Motion type: numerically simulated (2D, overdamped, fixed step), with art-directed schedules. `growth.js` steps a closed
curve once at page load: neighbour springs toward a rest length that grows on a schedule L(t), a biharmonic bending term,
short-range repulsion between non-neighbours (radius d(t)), a circular wall with full grip (touching nodes do not slide),
a tiny seeded inward "imperfection" nudge for touching nodes, and edge splitting as the ribbon grows. Art-directed parts:
L(t) and d(t) are keyed schedules (d shrinks after the first waves, which is what makes the second generation of smaller
waves); before first contact the ring grows as a uniform scale (the stress-free solution for a free ring, so it stays
round until it meets the glass); a faint seeded 7-lobe wobble in the starting ring. It is not a calibrated elastic-rod
model: no physical stiffness, friction or paper properties were measured, and the 3D ribbon is only the 2D curve extruded
(no twisting or sagging out of plane).

**Signature mechanic.** Growth against a fixed boundary: the same rule (grow, stay apart, stay inside) produces a plain
ring, then a row of waves, then waves on waves, then a packed maze. The curve is stored per video frame at 4096 fixed
material points (Catmull–Rom through the simulation nodes) and the ribbon mesh is rewritten from it each frame.

**Good for.** Constraint and pressure ("when room runs out"), growth vs. capacity, how simple local rules make complex
global form, scaling limits, crowding, emergence, folding/packing (brains, guts, coral, lettuce leaves).
**Avoid for** numbers or text in the picture, anything where the exact final pattern must be designed in advance (it is
whatever the simulation produces), fast action, many separate objects.

## Files
- `spec.js` — palette, materials, lights, set dimensions (table, sweep, hoop, glass), ribbon look, the simulation
  schedules (`growth`), caption chip, sound levels.
- `growth.js` — **pure planner, Node-safe** (imports only `kit/time.js`): `createGrowthPlan`, `growthVoices`,
  `crossings`, `monotoneKeys`, `xsin`/`xcos`.
- `style.js` — `createStyle(stage)`: room, hoop, ribbon mesh + paper shader, caption; `style.plan` / `style.motion` = the planner.

## Planner (`growth.js`)
- `createGrowthPlan({ R, wallGap, seed, fps, duration, M, substeps, lengthKeys, scaleKeys, bendKeys, sim, verify })` →
  `{ M, F, frames (Float32Array F×M×2), curveAt(t, out), lengthAt(t), scaleAt(t), radiusAt(t), foldCount, nodes,
  contactTime, hash, events({ grain, tickGap }), stats }`.
- Runs at load (about 2.2–2.4 s in Node on the M1 Pro for 450 frames × 8 substeps, up to 2 688 nodes, plus the checks).
- **No self-crossing, tested:** every stored frame AND every half-way blend between neighbouring frames is checked for
  segment intersections (spatial grid); the planner throws if any is found. Hard constraints make it hold: minimum edge
  length, minimum 2nd/3rd-neighbour chord (no node-scale zigzag), and a hard minimum distance (0.6·d) for close pairs.
- **Engine-exact:** the stepping is chaotic, so it uses only + − × ÷ and sqrt (own Taylor `xsin`/`xcos`, no
  `Math.cos/sin/hypot`); Node (SCORE) and Chrome (picture) compute bit-identical frames. `plan.hash` (FNV-1a of the
  frames) is recorded in the scene and checked in both places — a mismatch throws. (The first build used `Math.cos`:
  Chrome's run diverged from Node's and crossed itself in a frame Node never produced.)
- `events()` → `rustle` grains every 0.25 s (level = growth rate dL/dt), `fold` ticks when the count of inward-bending runs
  reaches a new high (≥ 0.11 s apart), `contact` at first touch of the glass.
- `growthVoices(spec.sound)` → voices for `kit/schedule.scoreFromEvents`.

## Props (`style.props`)
| prop | what |
|---|---|
| `growthTable(plan)` | everything for one plan (adds itself): room, hoop, ribbon; `update(t, { rise, sweep, sweepGain })` |
| `ribbon(plan)` | Mesh: three strips of 2×M vertices (paper face +n, face −n, cut top edge); `userData.update(t, o)` rewrites positions/normals from `plan.curveAt(t)`; `rise` scales the height (0..1), `sweep` = material coordinate of the yellow band |
| `ribbonMaterial()` | MeshStandard + injected GLSL: colour drift along the ribbon (`aM`), lighter top edge (`aPart`), yellow band mixed into the diffuse, slight self-light (paper translucency fake) |
| `hoop()` | fresnel-glass ring (outer + inner wall, torus lip), tinted top band, contact shade |
| `room()` | mint cyclorama + round warm-white table, top at y = 0 |
| `caption()` | overlay chip (plum plate, coral wavy-ring icon, cream text), `userData.show(text, alpha)` |

## Signature motion
- The ribbon stands up out of a flat ring (outBack, first second), grows round, meets the glass.
- First waves fold inward all round, deepen into fingers, then the fingers' walls buckle again at a smaller scale.
- Camera: high three-quarter views (pulling back as the ring swells), a long drift down to ribbon height just outside the
  glass (the folds as walls), then up to straight overhead on the packed maze while the yellow band runs its length.

## Sound palette
Quiet `pad` bed; soft `paper` rustle grains whose level follows the growth rate; a `tick` each time a new fold forms
(from the simulation's fold count); a `marimba` note at first contact with the glass; `whoosh` + paper fold for the rise;
a `marimba` arpeggio as the hoop fills; a quiet rising `whir` under the yellow trace.

## Tuning knobs (spec)
- `growth.lengthKeys` — how much ribbon there is when (packing density at the end; ~57 m fills a 2 m hoop at d = 0.07).
- `growth.scaleKeys` — wall spacing d(t); shrinking it later makes the second generation of waves.
- `growth.sim` — `grip` (0 = touching nodes don't slide; > 0 lets length funnel into one place), `jitter`, `modes`,
  `noise`, `minEdge`, `minChord`, `hard`, `split`, `spring`, `bend`, `repel`, `exclude`.
- `ribbon.h / thick / glow / gradient / sweepWidth / sweepGlow`, `hoop.lip / lipOpacity`.
- After ANY change to `growth` or `R`, re-record the scene's `PLAN_HASH` (run scene.config.js in Node with `DG_NOHASH=1`).

## Known limitations
- Schedules are art-directed (see Motion type); wave counts and timing depend on them and on the seed.
- Between stored frames the curve is blended linearly (frames are 1/30 s apart; half-way blends are crossing-tested).
- A small empty patch can remain at the very centre at 15 s: the folds grow in from the wall and reach the centre last.
- Ribbon is a 2D curve extruded straight up: no out-of-plane buckling, twist or sag; the paper has no fibre texture.
- The glass is fresnel-only (no refraction).
- Load-time simulation (~2.3 s) delays the first frame; keep `M`, the length schedule and `substeps` near these values.
- With wall grip 0 and no imperfection the ring just stays compressed against the glass and then folds in one place;
  the seeded jitter is required. It also shows: for ~0.5 s around 6.3 s the ring looks crinkly at the glass before the
  waves organise. Halving it (0.02) made the planner throw (a crossing at 14.6 s), so 0.04 stays; retuning any `growth`
  value needs the full crossing test to pass again (it runs on every load).
