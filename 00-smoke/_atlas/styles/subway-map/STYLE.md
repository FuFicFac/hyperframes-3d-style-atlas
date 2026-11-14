# Subway Map (`subway-map`)

A transit diagram made physical. Thick glossy enamel strips (one per route, clearcoated, rounded top edges) sit on a clean
off-white panel with a faint 1 m dot grid. Routes run only at 0 / 45 / 90 degrees with rounded bends; stations are white
pucks with a thick ink ring; interchanges are ink-ringed capsules linking two routes; trains are small ink-dark capsule cars
with a lit window band and a route-colour skirt. Captions are station-sign pills on the overlay; station names are white
pill tags anchored to the map. Soft daylight key from upper left, neutral tone mapping (the panel stays white, line colours
stay as designed), almost no grain. **The signature mechanic: routes lay their own track** — the drawn length is a closed-form
clock that eases into each station, where the station pops; trains then run the laid line on a timetable, and the camera glides
low behind the laying head before pulling up to the whole diagram. Original generic design: no real network's geometry, line
names, roundel, logo or brand colour set. Demo: `Builder/HyperFrames/3d-style-atlas-pilot/26-subway-map/` ("Idea to launch").

**Good for:** processes with branches and loops, user journeys, pipelines, step-by-step timelines, decision routes ("go or
rework"), onboarding paths, roadmaps, "where you are in the process".
**Avoid for:** quantities and charts (no data encodings beyond order), emotional or organic subjects, dense networks (> ~5 routes /
~20 stations gets unreadable at 1080p), anything that needs free curves (everything is octilinear by design).

## Props (`style.props`; sync; panel TOP is y = 0; map coords [x, z], +z = screen-down in the overview)
| factory | returns / hooks |
|---|---|
| `panel({ w, d, h, dots })` | rounded panel, top at y = 0, printed dot grid; `userData { w, d, h, top }` |
| `table({ size })` | receiving plane at y = −panel.h |
| `route(waypoints \| routePath, { color, width, height, bend })` | enamel strip with rounded head + tail caps; `userData { path, length, at(s), setDraw(s), color, material }`. `setDraw(s)` = drawn metres (−1 hides). Draw-on uses `setDrawRange` on segment-ordered indices, so the shadow pass clips too. `color` = palette index or hex |
| `station({ r, ring, h })` | white puck + ink ring; `userData.set(u)` pop scale, `userData.top` |
| `interchange({ a:[x,z], b:[x,z] })` | ink-ringed capsule; `userData.set(u, grow)` — grow 0..1 stretches it from a to b |
| `train({ color, length, width, height, lift })` | capsule car; `userData.place(path, s, dir, grow)` (rides on the strip, sits down into station pucks at stops) |
| `youAreHere({ color })` | ink pin + coloured head + pulse ring on the panel; `userData.update(t, at)` (outBounce drop, pulse loop) |
| `legend({ items:[{color,text}], title, w, row, cap })` | in-world key plate with mini strips + printed names; `userData.set(u)` |
| `sign({ x, y, px })` | overlay caption as a station sign (strip + station dot + step number + text); `userData.update(t, { on, off, text, color, n })` — ONE fixed region |
| `tag(text, { kind: "name"\|"here", px })` | overlay pill anchored to a 3D point; `userData.update(t, { on, off, anchor, align, dx, dy })` |
Helpers: `enamel(hex)` (cached per colour), `colour(i|hex)`, `stripGeometry(pts, { hw, hh, re })`, `puckGeometry(r, h, re)`.

## Planner — `transit.js` (pure, Node-safe; `style.plan`, also imported by scene.config.js)
- `octilinear(waypoints, { order })` → corners: each leg = at most one straight + one 45° run (waypoint `[x, z, "s"|"d"]` picks the elbow).
- `routePath(waypoints, { grid, origin, bend, step })` → `{ pts, length, at(s), project([x,z]), stationS(gridPt) }` (kit `filletPath`, resampled).
- `layPlan([{ t, s }])` → `{ head(t), timeAt(s), start, end }` — the track-laying clock (inOutSine between keys; −1 before start).
- `timetable({ stops, depart, vmax, accel, dwell, appear })` → `{ at(t) → { s, dir, v, visible, grow, moving }, events, legs, end }`:
  closed-form trapezoid/triangle speed per leg; events `depart` / `arrive` (with `brakeAt`).
- `layEvents(lay, { stations, tieEvery, id })` → `layStart` / `tie` (a click per metre of track) / `station` events.
- `gapBehindHead(train, lay, t0, t1)` → assert that no train outruns track still being laid (the demo config throws if one does).
- `glideKey(t, [x, z], { back, up, side, lead })` → a low-glide camera key behind-left of a map point.

## Recipe
1. In scene.config.js: draw routes as grid waypoints, place stations as grid points (`stationS`), key each route's lay clock so the
   head reaches each station ON its beat, write timetables, `gapBehindHead`-check them, and build SCORE from `layEvents` + timetable
   events with `scoreFromEvents`. Interchanges get a grow window (from the line that arrives/leaves).
2. In scene.js: `route.setDraw(lay.head(t))`, `station.set(pop(t, arrival))`, `interchange.set(on, grow)`, `train.place(path, q.s, …)`.
3. Camera: `glideKey` per beat behind the head, one final key to an overview that fits the whole panel; name tags + legend only in the overview.

## Sound palette (kit voices, all from the plan)
laying = `whir` (150 → 230 Hz, low gain) per lay stretch + `tick` each metre · station = `pop` + two-note `blip` [0, 7] ·
interchange = `clack` + short `chime` · train depart = `servo` 90 → 190 Hz over the accel time · arrive = `servo` down at `brakeAt` +
`click` + two-tone door `blip` [4, 0] · caption = `tick` · pull-up = `whoosh` · bed = `pad` G maj7 (brightness 900 **Hz**) lifting
to A for the finale, gain 1.0 (sets the mean ≈ −21 dB).

## Tuning knobs (`spec`)
`route.width/height/edge/bend` (0.46 m strips read from the overview at ~27 m), `station.r/ring/h`, `interchange.*`,
`train.length/width/height/lift`, `panel.w/d/dot`, `palette.lines` (generic evenly spaced hues — swap freely, do not copy a real
network's set), key `shadow.softness`, `post.grain` (keep ≤ 0.01: the camera never stops).

## Known limitations
- Laying is clipped per 5 cm segment and hidden under the rounded head cap; at extreme close-up a sub-millimetre open edge could show.
- Trains are single cars and do not check each other: two trains on one strip can overlap (plan them one-way or offset in time).
- At a stop the train sinks into the station puck (by design, so trains need not hover). Station pucks on a diagonal read slightly oval.
- The in-world legend is printed text lying flat: it skews with perspective on the left/right of a wide shot and is low contrast
  (light plate on a light panel). Fine in a near-top overview, unreadable in the low glide — show it only at the end.
- Low-glide shots between stations can be sparse (one strip on a big white panel); a beat with no train in view looks quiet.
- Text is OS-rasterised Helvetica Neue (system face): pixel-identical on this Mac only.
- Captions and tags are overlay pills: they never hide behind geometry.
