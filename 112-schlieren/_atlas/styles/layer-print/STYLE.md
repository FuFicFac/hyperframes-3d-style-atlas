# Layer Print (`layer-print`)

**Look.** A generic desktop 3D printer in a bright workshop (toy scale: the machine is ~5 m wide so kit lights and text
sizes apply; read 1 m as ~5 cm). A pale birch bench, a light pegboard wall, three filament spools and two smooth earlier
prototypes as set dressing. The printer is an open aluminium frame (four posts, top and bottom rectangles), a dark
gridded build plate with a warm strip on its front edge (heated), a gantry that rises with the part, an X beam that
slides front-back and a teal print head (fan, finned heat sink, red silicone block, brass nozzle with a glowing tip and
a small warm point light) fed by a white filament tube from a spool on the top bar. No brand marks. The plastic is laid
as real beads — flattened tubes 8.5 cm wide and 5.8 cm tall on a 5 cm layer pitch — in a coral -> orange -> yellow
gradient up the height; just-laid plastic glows for ~0.3 s. Neutral tone mapping, a warm high key with soft shadows, a
cool rim, bloom only on the nozzle. A white caption pill with a 5-bar "layers" icon that fills with print progress sits
bottom centre on the overlay (exact colours).

**Signature mechanic.** A toolpath plan in `slicer.js` (THREE-free, Node-safe):
- `vaseShape` — an original lobed, twisted pot as `radius(theta, y)` (a smooth height profile x soft flutes);
- `sliceShape` — one layer per 5 cm: outer perimeter loop, inner perimeter loop, then infill. Floor layers get scan
  lines at +/-45 deg (boustrophedon, one polyline); wall layers get a zigzag between the two perimeters (alternate
  layers mirror it, so it reads as a lattice from above). Print order = perimeter, perimeter, infill;
- `planPrint` — joins every path into ONE move list (`runs`: travel / outer / inner / infill) and times it from
  `stages: [{ t0, t1, accel, to: [layer, path] }]`: inside a stage a move lasts length / (feed x accel^layer), scaled to
  fill the stage. `accel > 1` makes each layer faster than the last — the honest time compression (demo: layer 0 takes
  ~5 s, layers 1-9 are each 1.22x faster, the last 36 layers pass in ~3 s; no cut);
- `plan.nozzleAt(t)` is the nozzle point (approach from home before the first move, lift-and-park after the last). The
  head, beam and gantry are placed from it every frame, so the nozzle tip sits exactly on the bead being laid;
- the picture: the whole bead mesh is built ONCE (`sweepRuns`, ~100k vertices, triangles in time order, each vertex
  carrying its deposit time `aTime`). A frame sets `drawRange` to the segment the nozzle is on and a `uT` uniform; the
  shader discards past the nozzle inside that segment and adds the hot glow `exp(-(uT - aTime) / tau)`. Nothing is
  rebuilt, laid plastic never moves (small MP4), any seek order gives the same frame;
- the planned path of the current layer shows ahead of the nozzle as a thin cyan line (same geometry builder, thin
  profile, shown where `aTime > uT` on the current layer) while a layer lasts >= 0.4 s;
- SCORE from the same runs (`plan.events()` + `printVoices`): a `whir` per perimeter, a grittier `servo` per infill
  path, one short alternating `servo` per floor scan line, grouped rising `whir`s for the fast layers (pitch follows the
  feed rate), a `tick` per layer change, a `servo` for homing / parking and a `chime` when the head parks.

## Good for / avoid for
- Good for: "built up step by step", generation layer by layer (tokens, diffusion steps, training epochs as layers),
  additive progress, prototypes and iteration, idea -> object, "slow at first, then fast", maker / hardware topics.
- Avoid for: anything that must change after it is laid (beads never move), subjects with overhangs, bridges or separate
  islands (the slicer handles one star-shaped outline per layer, no supports), text or logos as the printed part,
  dark or moody pieces, more than one part per plate.

## Planner (`slicer.js`; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `vaseShape({ height, lobes, lobe, twist, profile })` | the shape: `radius(theta, y)`, `rMax`. Write your own object with the same two fields for another star-shaped part. |
| `sliceShape(shape, { layerHeight, bead, wall, ringPts, zigs, floorLayers, seam })` | layers `[{ i, y, floor, paths: [{ kind, closed, scan, pts }] }]`. |
| `planPrint(layers, { stages, speeds, home, approach: { t0 }, park: { dur, lift, to }, slow, group })` | the timed plan. |
| `plan.nozzleAt(t)` | `{ p: [x, y, z] (bed coordinates, bead centre), ext, layer, kind, moving }`. |
| `plan.layerAt(t)`, `plan.progress(t)`, `plan.layerT0/T1`, `plan.t0/t1/tEnd`, `plan.height`, `plan.rMax` | for captions, cameras, framing. |
| `plan.runs` / `plan.beads` | every move / every extruding move: `{ kind, layer, closed, pts, cum, len, t0, t1, times }`. |
| `plan.events()`, `printVoices(spec.sound)` | home / run / zig / layer / park / done events -> SCORE via kit `scoreFromEvents`. |
| `rectilinearFill(poly, pitch, angle)`, `profileAt(keys, u)` | building blocks. |

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `printJob(plan, { workshop })` | everything: workshop, printer, part, planned-path line; `update(t)`. |
| `part(plan)` | the bead mesh; `userData.update(t)`. Put it in a group at `y = spec.printer.bedY`. |
| `ghost(plan)` | planned path of the current layer ahead of the nozzle; `userData.update(t)`. |
| `printer()` | frame, bed, spool, gantry, beam, head, tube; `userData.setNozzle(planPoint, glow 0..1)`. |
| `workshop({ size, wallZ })`, `miniPot(material, scale)` | bench, pegboard wall, spools, two smooth prototypes. |
| `caption()` | overlay pill; `userData.show(text, alpha, progress 0..1)`. |
| `sweepRuns(runs, { w, h, radial, colorOf })`, `filamentColor(u)` | the bead geometry builder and the gradient. |

## Sound palette
`whir` (perimeters, fast layers) and `servo` (infill, scan lines, homing, parking) with pitch from the feed rate, `tick`
per layer change (pitch rises with height), `chime` on park, a low `pad` bed plus a quiet 120 Hz fan `hum`, one soft
`whoosh` per camera move in the demo. All times come from the plan / BEATS.

## Knobs (spec.js)
- `shape`: height, profile keys, lobes, flute depth, twist. `bead`: layer height, bead width / height (ridge depth),
  radial segments, wall thickness, ring points, zigzag count, floor layers, hot glow (colour, strength, tau), gradient stops.
- `speeds`: relative feed per move kind. Timing itself is the scene's `stages` (beats).
- `printer`: bed size and height, post positions and height, gantry height above the nozzle (`gantryUp`: keep it high
  or the beam hides the layer in steep shots), `beamBack`, head, nozzle, nozzle light, spool, tube.
- `ghost`: colour, line size, `minLayer` (shortest layer that still shows its planned path).
- `caption`, `sound` (motor pitch map, gains, bed, fan).

## Known limits (seen while building the demo)
- The slicer is not a general slicer: one star-shaped outline per layer (radius as a function of angle), insets are
  radial offsets (fine for gentle flutes, wrong for sharp corners), no overhang check, no supports, no retraction.
- Floor scan lines take the first and last crossing of each line, so a strongly concave outline would be bridged.
- In the fast stage a layer lasts 2-3 frames: the head strobes around the rim like a real time-lapse; the motion reads
  as speed, not as a path. Keep `ghost.minLayer` >= 0.4 s or the planned path flickers.
- The shadow pass uses the same drawRange but no discard, so the segment under the nozzle casts its whole shadow a
  fraction of a second early (hidden under the head).
- From steep camera angles the X beam and the head cover part of the layer behind the nozzle; shots below ~0.8 rad
  elevation with `gantryUp` 1.55 keep the beam clear of the part.
- A square machine in 16:9: the final shot fits the PART; the frame posts cross the sides of the picture.
- The deposit time is a float32 attribute: fine for clips up to a few minutes, not for hour-long timelines.
- Audio levels were measured, not listened to. The clip was checked in stills, not watched in motion.
