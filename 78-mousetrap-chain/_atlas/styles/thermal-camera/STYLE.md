# Thermal Camera (`thermal-camera`)

A handheld thermal imager's view of ordinary objects. The geometry is plain (desk, PC tower with its side open, monitor,
keyboard, mug, a hand); what changes is **what is measured**: the picture is temperature, not light. Every part has a
temperature that is a closed-form function of t, rendered through an unlit shader into an ironbow palette (black, deep
purple, magenta, red-orange, yellow, white). Things glow because work is happening in them; heat creeps along heat sinks,
rises as a plume, lingers as a handprint and fades when the work stops. A sensor pass adds a soft blur, a faint pixel grid and
gentle seeded noise; the imager HUD (crosshair + spot reading, colour scale with min/max and a marker, caption, SAMPLE DATA
tag) is drawn on the overlay in exact colours.

Demo: `Builder/HyperFrames/3d-style-atlas-pilot/56-thermal-camera/` (15 s).

## Good for / avoid for

- **Good for:** "work shows up as heat" — load, effort, activity, energy use; what is busy vs idle in a system; ideas that
  "warm up" as they activate; things spreading from a source (conduction front); traces left behind (residual heat, memory,
  footprints); before/after "it cooled down".
- **Avoid for:** exact colour branding (the palette IS the data), anything needing many readable labels in-world, real
  measurements (temperatures here are invented — keep the SAMPLE DATA tag unless the user supplies real data), materials or
  textures (everything is one shader by design).

## Files

| File | What |
|---|---|
| `spec.js` | palette (incl. `ironbow` stops), `range` (°C mapped to the palette), `ambient`, `emissivity`, `form`, `sensor`, `set` (object sizes), `hand`, `heat` (sources, parts, standby offsets, print, plume), `hud`, `sound` |
| `style.js` | thermal ShaderMaterial, sensor pass, `deskSet(plan)`, `hud()`; exposes `style.plan` / `style.motion` = heat.js |
| `heat.js` | **planner (Node-safe, no THREE)**: `level`, `reach`, `createHeatPlan(spec, cfg)` → `part(id, s, t)`, `desk(...)`, `printAmp/printWidth/printSDF`, `handPose`, `puffs(t)`, `spot(t)`, `events()`; `handShape`/`handSDF`, `towerPoints`, `ironbow(stops, u)` |

## Signature mechanic (heat.js)

- `level(src, t)`: 0 before `on`; `1 − e^(−(t−on)/up)` while on; the value at `off` decays `e^(−(t−off)/down)` after.
- Conduction front: `R = k·√(t − on)` (frozen at off). `T(part, s, t) = base + dT · level · e^(−s/λ) · (1 − smoothstep(R−w, R+w, s))`,
  `s` = distance (m) of the point from the part's source, precomputed per vertex once.
- Residual print: amplitude rises during contact (`rise`), decays after lift (`fade`); the outline is the signed distance to
  the same hand shape the 3D hand is built from, blurred by `w = width + spread·√(age)` — the print keeps its shape and spreads.
- Plume: puff slots emitted at `rate`, each carrying the source level **at its emission time**, so the plume thins out by
  itself after switch-off.
- `spot(t)`: the reading for the crosshair; the scene's camera keys target the spot point (drift 0), so the number is the thing
  in the middle. `null` (shown `--.-`) while the camera moves.
- `events()`: spin-up, fan, display on, touch, lift, power-down — SCORE comes from these (scene.config.js).

## Rendering

- One unlit `ShaderMaterial` for every surface; temperature is a per-vertex attribute `aTemp` (°C) written each frame.
  Fragment: `Ta = mix(reflected, T + top·max(n.y,0), eps)`, `eps = mix(grazing, 1, |N·V|^power)` — cooler at silhouettes like real
  emissivity, so forms read with no lighting. Output = normalised temperature in the red channel of the HDR target.
- Sensor pass inserted before tone mapping (`post.insertBefore(..., "output")`): 7×7 gaussian, temporal noise
  `hash(cell, frame)`, static column noise, ironbow lookup in sRGB, then sRGB→linear so OutputPass (`toneMapping: none`)
  reproduces the stops exactly. Finish pass adds a light vignette.
- Puffs are transparent billboards that alpha-blend a scalar temperature (exact).
- Background clear value = the reflected temperature (the target holds temperature, not colour).

## Props

| Prop | What |
|---|---|
| `deskSet(plan)` | wall, floor, desk (300×150 grid for the print), PC tower (open side, motherboard, cooler base + 12 fins + heat pipes, GPU, PSU, top exhaust fan), monitor (bezel, screen gradient from the backlight edge, neck, base), keyboard (merged keys), mug, hand (palm, fingers, thumb, forearm), plume puffs. `update(t)` — call after `rig.update(t)`. |
| `hud()` | `update(T, captionText, captionAlpha)`; static frame (corner brackets, scale bar, MAX/MIN, SAMPLE DATA tag, info line), crosshair + SP1 reading, bar marker, caption chip. Also exported singly: `hudFrame`, `crosshair`, `barMarker`, `caption`. |

## Sound palette

Imager beep (`blip`) per caption, fan spin-up (`servo` 70→210 Hz), fan noise (`whir` held while on), power-down (`servo`
200→55 Hz), display-on `blip`, soft `thud` on touch, `paper` on lift, dark `pad` bed (98 Hz, 650 Hz cutoff). All times from the
heat plan's `events()` and the caption times. Levels measured, not listened to.

## Knobs

`range.min/max` (the most important: room temp should land ~0.2 of the palette, the hero heat near the top), `ambient.*`,
`emissivity.grazing` (edge contrast; lower = stronger silhouettes), `form.top`, `sensor.blur/grid/noise/fixed`, per-part
`dT/lambda/k/w`, source `up/down`, `print.dT/rise/fade/spread`, `plume.*`.

## Limitations (seen while building the demo)

- At room temperature everything sits in one indigo-purple band: that is the point of the first beat, but it is low-contrast.
  Separation comes only from small standby offsets and the grazing-angle term; a long idle shot will look muddy.
- The fixed range means anything hotter than `range.max` clips to white (the fins read 51 °C on a 50 °C scale; the marker pins at
  the top). Raise `max` if the hero detail must not clip.
- The plume is a stack of soft billboards: from some angles it reads as separate blobs rather than a continuous column.
- The hand is a stylised primitive hand (rounded palm, capsule fingers, cylinder forearm); fine at thermal blur, not up close.
- Heat in a part depends on distance from ONE source; there is no real diffusion between parts (desk ↔ tower halo is faked by a
  distance falloff from the footprint).
- Sensor noise changes every frame and costs bitrate; keep `sensor.noise` small.
- Temperatures are invented; the on-screen SAMPLE DATA tag is always shown by `hud()`.
