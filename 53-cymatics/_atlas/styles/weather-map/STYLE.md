# Weather Map (`weather-map`)

A broadcast weather map made physical. A raised relief model of an **invented** landmass (seeded warped coastline, hills, a
snow-capped peak, a sand rim, a seabed shaded by depth under a glossy translucent water sheet) sits in a dark frame on a
studio table. Soft cumulus clusters float above the land and throw real, soft shadows on it. Above the clouds a "glass"
graphics layer carries bold broadcast graphics: white isobars with a dark halo, a blue cold front with triangles and a red
warm front with semicircles, big H and L centres on white discs, flowing white wind arrows. Temperature bands (2° steps, dark
band edges) are draped on the land, and navy weather cards (icon + invented town name + temperature) hang above pins. A fixed
broadcast lower third (red FORECAST tab, navy bar, yellow SAMPLE DATA chip) carries the beat headline. Neutral tone mapping, no
bloom, almost no grain. No real country, broadcaster, logo or branding. Demo: `Builder/HyperFrames/3d-style-atlas-pilot/31-weather-map/`.

**Signature mechanic: the weather is a plan, not an animation.** One pure planner (`weather.js`) owns the pressure centres'
tracks, the pressure field, the wind, the fronts (rigid curves attached to the low, growing out of it) and the temperature
field. The isobar shader and the temperature-band shader are generated from the SAME numbers, the clouds and rain ride in the
low's frame so their shadows sweep the land with the front, and each town's weather is a function of which side of each front
it is on — so the moment the front reaches a town its icon swaps and its band shifts. Those change times are solved once
(`placeEvents`) and drive both the icon pops and their sounds. The camera does a broadcast fly-over.

**Good for:** trends moving through a system, forecasts, "what's coming", fronts of change (market mood, adoption waves, a
policy rolling out region by region), before/after across places, pressure building and releasing.
**Avoid for:** real geography or real weather (everything is invented by design; don't present it as a forecast), exact
quantities (temperatures are SAMPLE DATA, isobars carry no numbers), step-by-step processes (use subway-map / low-poly), more than
~6 named places (cards collide at 1080p).

## Props (`style.props`; sync; sea level y = 0, graphics layer y = `spec.layers.graphics`; map coords [x, z], +x east, +z south)
| factory | returns / hooks |
|---|---|
| `landmass()` | relief Mesh (land + seabed) from `landField(spec.land)`; per-pixel sand rim + depth-shaded sea from height; `userData { heightAt(x,z), w, d }` |
| `sea({ level })` | glossy translucent water sheet |
| `table()` | dark studio table + map frame + plinth (hides the relief's cut edges) |
| `tempBands(plan)` | lit overlay on the relief grid; colour = plan temperature field in 2° bands with dark edges; receives cloud shadows; `userData.update(t, level)` |
| `isobars(plan, { y })` | map-sized plane; shader draws contours every `isobar.step` hPa from the plan's pressure formula (constant px width, halo); `userData.update(t, level)` |
| `front(plan, "cold"\|"warm")` | tube + flat symbols on the advancing side; grows out of the low over `grow`, rides with it, symbols ripple in a marching wave; clipped to the map; `userData.update(t)` |
| `pressureMarker("H"\|"L", { color })` | disc + ring + camera-facing letter; `userData.update(t, at[x,z], pop)` (call after `rig.update`) |
| `cloudLayer(plan, { seed })` | cumulus clusters (one InstancedMesh, real shadows) along both fronts + round the low, rain streaks under the cold band / warm sector; edge-faded; `userData.update(t)` |
| `windField(plan, { cols, rows })` | instanced flat arrows that glide through their cell along the local wind (phase = fract(t·rate + hash)), length ∝ speed; `userData.update(t, level)` |
| `placeMarker({ at })` | white puck on the land + pole up to the graphics layer + bead; `userData { top, set(u) }` |
| `placeCard(name, { temps, px })` | overlay: one PRE-BAKED card per weather state (no canvas redraw in renderAt); pops, swaps (old shrinks, new outBack), fades near the frame edge; `userData.update(t, { anchor, on, state, since, prev })` |
| `lowerThird(captions, { x, y, px })` | overlay: fixed bar + one pre-baked headline per caption (slide/fade); `update(t, { i, on, off, barOn })` |
Helpers: `landH(x,z)`, `drawIcon(ctx, state, cx, cy, r)` (sun / cloud / rain / storm / clear, canvas paths, no fonts), `mapClip`, `inMap`.

## Planner — `weather.js` (pure, Node-safe; `style.plan`, also imported by scene.config.js)
- `landField(spec.land)` → `h(x, z)` invented relief (warped ellipse + bays + islets + gaussian hills + fbm3 detail).
- `weatherPlan(cfg)` → `{ L(t), H(t), lowOn, highOn, grow(front, t), pressureAt, windAt, frontAt, weatherAt, tempAt, placeEvents, placeTemp }`.
  cfg: `low/high { keys, appear, amp, sigma }`, `base`, `grad`, `fronts [{ kind, axis, c1, c2, len, grow }]`, `bands`, `temp`, `stateTemp`, `places`.
  A front is `u·s + n·(c1·s + c2·s²)` in the low's frame (n = the symbol side); `frontOffset` gives `{ s, off }` (off < 0 = behind).
- `weatherAt(p, t)` → sun | cloud (just ahead of the warm front) | rain (warm sector / near the low) | storm (within `stormBehind` m behind the cold front) | clear.
- `placeEvents(t0, t1)` → `[{ t, place, from, to }]` (sampled at 1/240 s, bisected); `stateTimeline(events, id)` → `at(t) → { state, since, prev }`.

## Recipe
1. scene.config.js: key the low so its cold front crosses the towns inside the beats you want (print `WEATHER_EVENTS` in Node
   and retime the keys), build SCORE from `placeEvents` with `scoreFromEvents`, derive caption / camera / sound times from BEATS.
2. scene.js: update bands / clouds / isobars / fronts / wind from t, then `rig.update(t)`, then markers, cards and the lower third.
3. Camera: a high wide that already fills the frame, a low sweep in from the sea following the low, a tracking pass along the
   cold front, a rise back to a frame-filling wide. Keep L/H inside the frame at the end (the low keeps moving).

## Sound palette (kit voices, every time from BEATS / the plan / CAMERA)
bed = `pad` D add9 (brightness 750 **Hz**) lifting to E for the clear finale (gain 1.0 → mean ≈ −20 dB) · caption = two-note
`blip` sting + short `whoosh` · H = `pop` + `chime` · L = low `pop` + `thud` + `rumble` swell · fronts = `whoosh` over each grow
window · arrows = soft `whoosh` · town cards = `tick` stagger · rain = `paper` hiss + `pop` · storm = `rumble` (thunder) + `thud` ·
clear = short high `chime` + `pop` · camera moves = low `whoosh` · last key = `chime`.

## Tuning knobs (`spec`)
`land.*` (seed, radius, warp, hills, bays, islets — change the seed for a new invented country), `map.w/d` (16:9 so the wide
fills the frame), `layers.cloud/graphics` (graphics must stay above the clouds, clouds above the tallest hill), `isobar.step/px`,
`front.radius/symbol/spacing/march`, `arrows.*`, `bandsKnob.step/mix/min`, `clouds.flatten/rainPer`, `palette.temps`, `text.lowerPx/cardPx`.

## Known limitations
- The graphics layer floats 2.2 m above the land, so in low oblique shots fronts and isobars sit visibly "above" where they are
  on the land (parallax), and isobars/arrows can project past the map edge over the table. Intended as a glass layer; keep
  low angles short.
- Clouds are smooth white sphere clusters: readable and cheap, but toy-like, not volumetric. Rain streaks are thin and only read
  close up.
- The temperature field is a cartoon (warm sector +, behind the cold front −); the cold air behind the front blends to lavender
  over tan hills. Bands are SAMPLE DATA, not a model.
- Cards are overlay sprites: they never hide behind geometry, can cover the L/H letter when a town is near the low, and fade out
  when their pin nears the frame edge. More than ~6 towns collide.
- Weather states are spatial bands, not a weather model; a town north of the low's track never changes (pick town positions).
- H/L letters are flat camera-facing text (OS-rasterised Helvetica Neue): pixel-identical on this Mac only.
- Temperatures shown on cards are `town.base + stateTemp[state]` — invented, always labelled SAMPLE DATA by the lower third.
