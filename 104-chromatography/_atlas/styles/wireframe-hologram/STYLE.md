# Wireframe Hologram (`wireframe-hologram`)

A sci-fi briefing-room hologram. A volumetric display floats above a metal projector on a dark glossy table in a dim room.
Everything in the volume is light: additive point clouds, pixel-exact cyan edges (kit `lines.js`, MAX-blended so crossings
never stack into a blob) and translucent faces with fresnel rims. Scan bands drift upward, the whole volume carries a ±4 % hum,
and seeded glitch slices shear a thin band sideways for a frame or two. One amber accent marks the active element. A faint
streaked light cone with dust motes rises from the emitter ring; HUD rings, tick crowns and a gizmo sit on the table; the
table mirrors the glow (kit `reflectiveSweep`). A post pass adds fine raster lines, glitch slices and a radial chromatic fringe.

**Good for:** systems and data flow (networks, pipelines, graphs, architectures), "how X works" briefings, AI/tech/sci-fi topics, anything that builds up part by part.
**Avoid for:** warm, organic or human topics; photoreal products; dense paragraphs; bright daytime moods; many colours (one accent only).

## Prop factories (`style.props`)
| prop | returns / API |
|---|---|
| `table({ radius })` | glossy mirror table at y = 0 + glow pool; `setGlow(k)`. `style.render(t)` renders its reflection |
| `projector({ radius })` | housing, lens grooves, emitter ring, 120-tick crown; `setLevel(k)`; `userData.top` |
| `beam({ baseRadius, topRadius, height })` | additive streaked cone; `setLevel(k)` |
| `dust({ count, radius, height })` | motes rising in the beam (closed form in the shader); `setLevel(k)` |
| `holoMesh(geometry, { color, featureDeg, points, faces })` | ANY geometry as points + feature edges + fresnel shell; `setMaterialise(u)`, `setLevel`, `setAccent(m)` |
| `pointGrid({ cols, rows, pitch, cube, mask, dimLevel })` | XY panel of point-cubes (`#` = lit); `cells`, `setCell(i, boost, accent)` + `sync()`, `setMaterialise`, `setLevel` |
| `nodeLayer({ cols, rows, pitch } \| { positions }, { frame, octa, nodeSize })` | plane of nodes (point + wire octahedron) in a bracket frame; `setNode(i, level, accent, size)` + `sync()`, `marker(i)`, `bounds` |
| `connectionWeb(segs, { level, width, seed, pulse })` | faint links + carried-path layer + travelling dashes; `setMaterialise(u)`, `setPulses([{ i, u, accent }])`, `setCarried(idx, accentIdx)` |
| `hudRing({ radius, ticks, major, arcs, plane, rate })` | rings + ticks; `update(t)` spins, `setProgress(p)`, `setLevel` |
| `gizmo({ size })` | axis tripod + wire cube; `update(t)`, `setLevel` |
| `barReadout({ w, h, ticks })` | left-anchored bar; `setValue(v)`, `setLevel`, `setAccent(m)` |
| `scanFront(w, d)`, `points(pts)`, `lines(polys, o)` | raw parts (lines get the hum flicker; `setOwn(level)`) |
| `caption({ x, y, maxText })` (overlay) | one caption area: typed title + cursor, sub, rule; `update(t, [{ text, sub, on, off, size }])` |
| `readout({ x, y, align })` / `tag(text)` / `leader(text, { dir, knee, run })` | telemetry line / text pinned to a 3D point / kit callout in the holo look |

Per frame: `style.update(t, { power })` (shared time, hum, glitch, emitter light), prop hooks, camera, then `style.render(t)`.
`style.powerLevel(t, on, seed)` is the projector's switch-on stutter (kit `flicker`). `factories` cover table, projector, beam,
dust, hudRing, gizmo, pointGrid, nodeLayer and barReadout.

**Pure planner `holo.js`** (no THREE; `style.plan`, importable from `scene.config.js`): `glitchAt / glitchEvents` (seeded slices,
the same events for picture and SFX), `phases(u)` (points → edges → faces), `holoLevel(t)`, `layerGraph(layers, { fanIn, prefer })`
(seeded sparse fan-in), `forwardPlan(graph, { start, travel, active, strength })` (fire times, activations, pulse windows, waves).

## Signature motion
Materialise bottom-to-top behind a bright scan front (points lead, edges +0.16, faces +0.34); run `u` backwards to dematerialise.
Data moves as short dashes; nodes flare when they arrive and keep a slight glow; the active node switches to amber with a ring marker.
Slow volume yaw (±0.05 rad), counter-rotating table rings, camera arcs at table height (`path: "arc"`) with gentle push-ins.

## Sound palette
`bed: pad` (55 Hz, chord 0/7/12/19, **brightness 420 Hz**, gain .85 → mean −21 dB) + `hum` 60 Hz at gain .05 ·
power-up = `servo` 45→190 Hz + `buzz` stutter + `riser` · `enter: sparkle` (high pitch, soft shimmer) · `ui/land: blip`
(one chord per layer wave, from `forwardPlan.waves`) · `tick` for node fires (thinned) · `emphasis: chime` for the answer ·
`click` at pitch 2.4 per glitch slice (`glitchEvents`).

## Tuning knobs (`spec.js`)
- `holo` {pointSize, pointLevel, edgeWidth, edgeLevel, faceAlpha, rimStrength/Power, scanSpacing/Width/Speed/Boost, frontGlow}.
- `pulse` {width 2 px, level 1.7, len .13, carried .55}. Also show only a share of carrying edges (the demo uses 42 %): **all of them form a white blob**.
- `post.bloom` {.62, .42, threshold .82}: lines above level ~1 bloom, the faint web (.5) stays crisp. `raster`, `fringe`, `glitch` {rate, maxShift, bandH, yRange}.
- `beam`, `dust`, `table` {reflect, blur, fade, glow}, `projector`, `hud`, `overlay` {captionHeight .058, typeRate}.

## Known limitations
- Lines (kit `lines.js`) get no scan bands or front glow: they reveal by height windows only. Only points and faces carry the scan bands.
- Glitch slices are screen-space and shear everything in their band (kept to `yRange`, above the table); overlay text is never glitched.
- The reflection pass re-renders the scene at half resolution (about 2× GPU cost), and lines look about 2× wider in the reflection.
- Seen past ~25° off-axis, adjacent lit cubes merge into bars (the "7" still reads). Keep panels within ±20° of the camera.
- Dense graphs: the fan-in must stay at ≤ 6 per node and levels at ~.5, or the web turns into haze. MAX blending prevents stacking but not clutter.
- 1080p bitrate: CRF 22 gave 13.1 MB (raster lines + motes under a moving camera); the demo ships at CRF 24 (9.6 MB) with no visible banding.
- Overlay text uses the OS mono stack (Menlo): pixel-identical on this Mac only.
