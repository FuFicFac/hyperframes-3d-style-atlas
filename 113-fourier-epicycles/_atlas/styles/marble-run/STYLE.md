# Marble Run (`marble-run`)

A handmade wooden marble machine screwed to a workshop pegboard. Glass marbles (fresnel rim, twisted cat's-eye
vanes, sharp highlight, a coloured inner crescent and a caustic spot in their wall shadow) roll down grooved maple
rails and brass wire tracks, spiral through glass funnels, trip a red flag, roll a brass odometer counter and collect
in jars. Labels are engraved brass plaques and ink-stamped ply tags; arrows are hand-painted on the board. One warm key
from upper left throws every rail's and marble's shadow onto the pegboard — the shadows carry the depth. **The
mechanism is the explanation; marbles are the only actors.** Demo: `Builder/HyperFrames/3d-style-atlas-pilot/11-marble-run/`.

**Good for:** queues, buffers, capacity and overflow (context windows, rate limits, caches, FIFO/LIFO), pipelines and
routing, counting, sorting, "inputs flow through a process", cause-and-effect chains, anything a Rube Goldberg toy explains.
**Avoid for:** abstract or emotional topics, charts with many values, long text, organic subjects, very fast cutting.

## Props (`style.props`; paths are MARBLE-CENTRE polylines, wall = XY plane at z = 0)
| factory | what it makes |
|---|---|
| `wall({ w, h, arrows:[{from,to,color}], origin, bump })` | pegboard with hole grid, mottle, hand-painted arrows (wall metres) |
| `bench({ w, d, h })` | walnut plank bench, top at y = 0 |
| `rail({ path, r, bend, extend:[b,f], standoffs, stopEnd })` | grooved maple rail swept under the path + brass standoffs |
| `wireTrack({ path, r, bend, extend, ties })` | two brass wires the marble rides on, U ties, wall posts |
| `funnel({ center:[x,rimY,z], rMouth, rNeck, height, neck })` | glass cone, brass rim + neck collar, wall arms |
| `tube({ xL, xR, y, z, rIn, wall, sill })` | horizontal glass tube, brass collars, bottom sill at the left mouth, bands |
| `jar({ rIn, h, glass, backstop })` | glass jar with brass rim; optional brass backstop plate (−x side) |
| `tray({ slots, pitch, r })` | walnut tray, `userData.slot(i)` |
| `liftWheel({ R, pockets, r, thickness })` | notched maple wheel, `setAngle(a)`, `pocket(i, a)` |
| `stopPin({ r, h })` · `flag({ len, flag })` | brass pin along +Z · trip lever + pennant, `setAngle(a)` |
| `counter({ digits, label })` | brass odometer, `setValue(v)` (fractional v rolls drums, carries smoothly) |
| `hopper({ x0,x1,y0,y1,depth, outlet, label, cap, pile, colors })` | walnut bin, stamped tag, marble heap, outlet flap `setGate(u)` |
| `plaque({ text, cap, kind:"brass"\|"wood", hang, screws })` | engraved brass / stamped ply; `hang` = swings from its hook (origin) |
| `hook({ len })` · `standoff(p)` · `screw(p)` | pegboard peg · brass post to the wall · screw head |
| `marble({ r, color, seed })` + `caustic(color)` | glass marble, `userData.setPose(plan.at(t))`; `helpers.placeCaustic(spot, p, r)` |
Helpers: `glassMaterial(kind, tint)`, `sweepProfile(frames, profile)`, `pathFrames`, `railProfile`, `lightDir`.

## Motion — `marbles.js` (pure, Node-safe; `style.motion`, also imported by scene.config.js)
`new MarblePlan({ id, r, g, start, at, visibleBefore })` then chain closed-form segments:
`roll(pts, { a | vEnd | mu, v0, bend, surface, hop:{v,e} })` (constant tangential accel, slope default a = 5/7·g·sinθ − μg,
rolling rotation = distance/r about up × dir, optional damped hops) · `fall({to}|{toY}|{toX}, {surface})` (ballistic; `to`
aims the landing) · `bounce({e, min})` · `rebound({dir, amp, dur})` · `custom(dur, {pos, dist, axis})` (coupled pushes) ·
`hold(until)` · `kick(v)` · `impact(surface, speed)`. `plan.at(t) → { p, q, visible }`. Events: `{kind:"impact"|"roll", ...}`.
Also `funnelSpiral(...)`, `overLip({C, r})`, `invert(f, y, a, b)`, `scoreFromEvents(events, {pan, gain, rollGain})`,
`minSeparation(plans, t0, t1)` (verify no marble–marble overlap; the demo's min is 0.000 m = touching).

## Recipe
1. In scene.config.js lay out the machine as marble-centre paths, build one `MarblePlan` per marble, chain segments
   (couple queues with `hold(tc)` + `custom`), and export `PLAN`; `SCORE = scoreFromEvents(all events) + mechanism cues`.
2. Build supports from the same paths in scene.js (`rail`, `wireTrack`, `tube`…). Per frame: `marble.userData.setPose(plan.at(t))`,
   `placeCaustic`, then drive gates/flags/counters from marble positions or event times.
3. Run `minSeparation` in Node before rendering. Hang captions on one hook in open wall space, one at a time.

## Sound palette (kit voices, from the schedule)
glass hit = clack (pitch ~2.1) + short chime (2.4) · wooden knock = clack (0.62) + thud (2.6) · brass tonk = clack (1.45) + chime (1.25) ·
rolling = rumble (pitch 3–5 by speed) + faint paper grit · flag = tick, counter = small clack · gate = click ·
bed = pad C (0,7,12,16,19) `brightness: 700` **Hz**, gain .1 + very quiet low rumble.

## Tuning knobs (`spec`)
`marble.r` (0.18 reads at 9–12 m), `marble.ribbon` (vanes/width/twist), `glass.marble` (alphaFace/Rim, fresnelPower, tintMix,
innerGlow), `glass.vessel`, `glass.caustic`, `rail.grooveHalfWidth/height/wall`, `wire.radius/halfGap`, `physics.g` (30 = toy pace;
9.81 looks slow-motion at this scale), `physics.mu`, `wall.holePitch/holeRadius`, `plaque.metalness`, key `shadow.softness`.

## Known limitations
- Glass is a fresnel-alpha fake (no refraction of what is behind); marbles read slightly pastel against the light board.
- Rolling inside the funnel uses world-up for the spin axis (cone normal ignored) — invisible at speed.
- `fall({to})` aims the landing by adjusting horizontal speed: keep gaps short so the cheat stays under ~20 %.
- Coupled motion (queues, pushes) is hand-choreographed in the scene with `custom`; there is no generic queue solver.
- Two-wire tracks look like one rod when the camera is dead level; give the camera a little height.
- Text is OS-rasterised (Copperplate / Rockwell); thin Copperplate is stroked wider to read at 1080p.
- Labels are in-world: tracking pans can slide persistent labels through the frame edge; hold on frames that contain them.
