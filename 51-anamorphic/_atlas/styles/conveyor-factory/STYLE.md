# Conveyor Factory (`conveyor-factory`)

A bright, friendly modern packing line seen at three-quarter height, under soft skylight daylight. Cream painted concrete
floor with yellow walkway lines, saw-cut joints and black/yellow hatched zones. Mint-green and safety-yellow machinery with
rounded guards. Black ribbed belts on steel channel frames, square-tube legs and turning end drums. Steel roller beds over
the split and the merge. Kraft cartons with tape, coloured plastic totes and grey poly parcels. Numbered navy signboards
hang overhead, along with a dark counter board with amber digits. Red/amber/green stack lights sit on the stations, a yellow
robot arm packs a wooden pallet, and the back wall is pale and panelled with high windows and steel columns. The shading
is semi-realistic and clean (neutral tone mapping, no grain). It is not blocky and not a tilt-shift miniature.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/47-conveyor-factory/` ("an order, packed": scan → sort → press / fill →
check → wrap → pack, with a bottleneck at the filler and one reject; the counters are SAMPLE DATA).

**Signature mechanic:** a process becomes a production line, and the line is a pure function of time. Items enter at a
planned release rate. `line.js` moves every item through a network of belt segments, and its position is a closed-form
function of (t − release), with holds at stations. Stations change items as they pass:
- the scanner's light curtain sweeps and a tag appears
- the diverter arm swings totes onto the curved lane
- the press ram stamps a mark
- the filler pours a tote to a level
- the quality gate flags one item and the pusher shoves it down the roller chute into the bin
- the wrapper ring spins and the film grows over the item as it passes through
- the robot arm (analytic two-joint IK) picks at the end stop and places on the pallet grid

On accumulating belts an item never comes closer than one pitch to the item ahead, so a station slower than the belt grows
a visible queue that steps forward each time the head leaves. Stack lights follow station state: amber for a queue, a
blinking red for a reject. The overhead counters tick, and the belts and rollers scroll at belt speed.

**Good for:** workflows and pipelines, input → steps → output, bottlenecks and throughput (queues are real consequences
of the schedule), sorting / routing / classification, quality checks and rejects, automation explainers, "where does the
time go" stories, before/after capacity changes (change a dwell or the release rate and re-plan).
**Avoid for:** abstract data with no flow, more than ~8 stations in one line (it gets too wide for 16:9), precise numbers
beyond counts, dark or moody looks, toy or miniature looks (use isometric-pastel / tiny-diorama / toy-brick), marble
mechanisms (marble-run).

## Files
`spec.js` (all look numbers, the reference line layout, station list and timing), `style.js` (Three code), `line.js`
(**pure** planner, no THREE: imported by `scene.config.js`, so SCORE, counters, the camera and the framing gate come from
the same plan as the picture). Exposed as `style.plan` / `style.motion`.

## Props (`style.props`)
| factory | what it makes |
|---|---|
| `packingLine({ net, plan, signs, counters, sample })` | the whole line from a network and plan: belts, beds, chute, hood, every station, stack lights, numbered signs, the counter board, robot, pallet and one item per planned item. `userData.update(t)` drives all of it |
| `beltSegment({ path, width, legs, legStep, skipLegs, endRollers, side })` | one belt (straight, curve, incline or merge: they differ only in the path). Ribbed ribbon on the shared scrolling texture, steel channels, skirt, legs, turning end drums |
| `rollerBed({ x, z, y, pitch, r })` | steel-framed bed of free rollers (transfer over a split or merge); the rollers turn with belt speed |
| `chute({ x, z0, z1, y0, y1, w })` | inclined gravity roller chute with yellow rails and a red reject bin; `userData.update(dist)` |
| `item({ type: "carton"\|"tote"\|"parcel", seed, color })` | an item with its state decals: tag, stamp, QC cross or tick, tote fill, film wrap. `userData.apply(pose, { sealU })` |
| `scannerGate({ x, z })` | mint arch, read head, light curtain + laser line; `update({ sweep, level, itemTop })` |
| `diverter({ x, z, len })` | yellow pivot post, swing arm and rubber paddle; `update(angle)` |
| `press({ x, z })` | mint gantry press, steel ram and yellow die head; `update({ k, top })` |
| `filler({ x, z })` | yellow hopper on a C-frame, valve and nozzle, granule stream; `update(pour)` |
| `qcGate({ x, z })` | vision arch with camera dome and ring light; `update(level)` |
| `pusher({ x, z, stroke })` | pneumatic side pusher; `update(k)` |
| `wrapper({ x, z })` | one tower with a cantilever, yellow ring housing, spinning steel ring with a film roll; `update(angle)`, `userData.ringX` |
| `robotArm({ base })` | yellow arm: pedestal, turret, upper arm, forearm, wrist, suction tool; `update(armIK pose)` |
| `pallet({ center, cols, rows, pitch })` | wooden pallet sized to the slot grid |
| `stackLight({ height })` | pole with green / amber / red lenses; `userData.set({ red, amber, green })` |
| `sign({ text, step, w, h, hang })` | hanging navy signboard with a mint step disc |
| `counterBoard({ counters, w, h, sample })` | hanging counter board with amber digits and a SAMPLE DATA tag. `update(counts)` redraws only on change and calls `uploadTexture` |
| `hood({ x, z, h, w })` | infeed hood with a strip curtain (items are released inside it) |
| `floorSet({ line, wall, wallZ })` | painted floor, outer floor, back wall with windows, columns and a dado band |
| `caption()`, `stamp()` | overlay caption card (bottom left) and SAMPLE DATA stamp (bottom right), exact colours |
`style.helpers.setBelts(t)` scrolls the shared belt texture; call it once per frame. `style.factories.floorSet` is for OBJECTS.

## Planner (`line.js`, Node-safe)
- `makePath(pts, { radius })`: polyline with true circular fillets, smooth interpolated tangents, `at(s)` and `project([x, z])`.
- `buildNetwork(S, line?, stations?)`: segments, routes (with segment offsets) and stations at route-s. Stations name a segment plus an x or s.
- `releasePlan(net, { t0, t1, interval, jitter, mix, maxRun, bursts: [{ at, n, type | pattern, interval }], seed })`: a seeded
  steady release with a type mix, plus bursts. Spacing is never below gap / v. Start `t0` well before 0 so the line is full at t = 0.
- `planLine(net, items, S, { fail })` does a FIFO discrete-event pass, `start = max(arrival, free)`, `free = leave + gap / v`
  (robot: `start + cycle`), then exposes these per-frame queries:
  - `positions(t)`: accumulation per segment in entry order
  - `events` (one list for the picture and the score)
  - `counts(t)`, `lights(t)`, `queue(id, t)`, `diverter(t)`, `press(t)`, `pour(t)`, `push(t)`, `wrapSpin(t)`, `robot(t)`
  - `verify()`: every station acts with its item physically there
- `chooseReject(plan, at, types)`, `armIK(S.robot, base, effector)` (elbow-up, tool hanging vertical), `lineVoices(S.sound)`.
- `fitShot`, `framingCheck`: local copies of bead-abacus' shot fitting (a kit promotion candidate).

## Recipe
1. `scene.config.js`:
   - `NET = buildNetwork(S)`; `ITEMS = releasePlan(NET, {...})`
   - plan once, `chooseReject`, then plan again with `fail`
   - throw if `PLAN.verify()` fails
   - shots: `fitShot` on boxes that include the overhead signs, with the window above the bottom caption band; gate with `framingCheck`
   - `SCORE = scoreFromEvents(PLAN.events in the clip, lineVoices(S.sound))` + pad bed + belt hum + caption clicks.
2. `scene.js`: `packingLine({ net, plan })`, `caption()`, `stamp()`; in `renderAt`, call `setBelts(t)`, `line.update(t)` and the caption.
3. To stage a bottleneck, release a burst of the slow station's type (the demo uses tote, tote, carton at 0.86 s against a
   2.0 s filler). The queue length is then a consequence of the schedule, not hand-animated.

## Default sound palette
- Scanner: `blip` pair. Diverter / press / pusher / grip: short high `whooshOut` hisses.
- Stamp: `thud` + `clack`. Pour: dense `rustle` for the pour time.
- QC pass: soft `blip`. Reject: `buzz` + falling `blip`. Chute landing: `thud`. Wrapper: `whir`.
- Robot: one `servo` per move (down, travel, back). Place: `thud`. Every counter change: `tick`.
- Bed: belt `hum` (50 Hz, gain .05) under a quiet `pad` (root 110 Hz, chord 0/7/12/16, brightness 820 Hz).
- Demo measured mean −21.4 dB and max −3.3 dBFS in the MP4. These are measurements; nobody has listened to it.

## Tuning knobs
- `line`: belt speed `v`, accumulation pitch `gap`, `beltY`, `beltW`, segment polylines and fillet radii, `routes`, `sort`, `beds`, `hood`, `chute`, `robot.base`, `pallet`.
- `stations[]`: positions and `dwell` (this sets the bottleneck).
- `timing`: scanner sweep, diverter lead / hold / angle, press stroke timing, fill open / close / level, `queueAmber`,
  push stroke, chute acceleration, reject red window, robot pick phases (cycle ≈ 0.9 s), hover clearance.
- `robot`: link lengths, shoulder height, tool length. `items`: sizes.
- `belt`: rib count, tile. `signs`, `counter`: fonts. Look: `world.environmentIntensity`, sun softness / extent, bloom threshold.

## Known limitations
- `verify()` guards one thing: the model computes in-passing station times from free flow. If a queue backs up past a
  pass-through station (for example a slow robot queueing items back into the wrapper), that station's event time would be
  wrong, and `verify()` throws instead. Keep the end-of-line robot faster than the belt's arrival rate, or move the stations apart.
- Merging is a FIFO resource with a one-pitch gap. Items from two lanes never collide, but the planner does not prioritise lanes.
- Wrapped kraft cartons read slightly pink-grey under the clear film shell (a transparent white layer over kraft). The film
  reads as "wrapped" but not as crisp stretch film.
- Film grows from the leading end as the item passes the ring (a scale, not real wrapping), and the ring's film roll does not unspool.
- Signboards and the counter board are flat planes. Keep the camera within ~35° of facing them (the demo's final wide is at 29°).
  In close shots the counter board is cut off at the top of frame.
- The whole reference line is ~14.6 m long. A straight-on wide is width-limited and leaves empty floor at the bottom, so the
  demo's final wide is a diagonal (azim 0.5 rad), which fills the frame.
- Stack lights on top of the press and scanner are small, and some sit behind the signs. The filler's light stands on its
  own floor pole so the amber is readable.
- Items have no physics: the reject rolls onto the chute along a scripted ease and then slides with constant acceleration.
- Text (signs, counters, tags) is OS-rasterised (Avenir Next Condensed / Menlo): identical on this Mac, slightly different elsewhere.
