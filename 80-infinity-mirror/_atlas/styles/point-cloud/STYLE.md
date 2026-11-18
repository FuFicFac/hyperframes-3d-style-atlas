# Point Cloud Scan — LiDAR (`point-cloud`)

No surfaces at all: the world exists only as measured dots laid down by a terrestrial laser scanner on a tripod. A vertical
fan of rays turns slowly in azimuth; a thin pale-green laser fan joins the scanner head to the column being measured, and the
room appears dot by dot on near-black. Dots are coloured by range on a clean ramp (cyan near → yellow → magenta far) and
shaded by return intensity (cosine of incidence × surface reflectivity), so form reads without any lighting. The scan carries
the three tells of a real one: rings and lines that spread with distance, **scan shadows** (empty holes behind every object
where the laser could not see — invisible from the scanner's own eye, dramatic once the camera orbits away), and a blind
cone under the tripod. A second scan from another tripod fills the holes. The only solid object in frame is the scanner prop.

How it differs from `wireframe-hologram`: that style is glowing feature-edge lines + translucent shells of modelled objects in
a projector beam. This one draws no edges and no geometry — only the dots a ray-cast would return, with occlusion holes.

**Good for:** how machines perceive (LiDAR, depth cameras, self-driving, robotics, 3D scanning, photogrammetry), "the map is
not the territory", blind spots / missing data / sampling, surveying and digital twins, measurement vs. reality.
**Avoid for:** warm or human-story topics, anything that needs readable surfaces or textures, text-heavy beats, bright
daytime moods, many small objects (under ~0.2 m they turn to a few dots).

## Files
- `spec.js` — palette, dots (splat, px clamps, range ramp, shade, flash, soft rim), scanner resolution, laser, tripod, caption, counter, sound.
- `scan.js` — **Node-safe planner** (imports only `kit/time.js`): primitives (floor, walls with door/window holes, yawed boxes,
  vertical cylinders, spheres, capsules), object builders (`objects.figure/chair/plant/table/bicycle/crate`, `roomCorner`),
  analytic ray casts, `scan()` / `createPlan()` and `scanVoices()`. `scene.config.js` imports it for SCORE; `style.js` for the picture.
- `style.js` — `createStyle(stage)`; exposes the planner as `style.plan`.

## Prop factories (`style.props`)
| prop | returns / API |
|---|---|
| `scanScene(plan)` | everything for a plan (adds itself): `{ clouds, lasers, scanners, update(t) }` |
| `cloud(scan, { splat, level })` | `THREE.Points` of one scan (dots sorted by reveal; `drawRange` = dots measured by t); `update(t)`, `setSplat(k)`, `setLevel(k)` |
| `laserFan(scan, { every, opacity })` | additive fan from the laser origin to every `every`-th hit of the current column + a bright line along that column; `update(t)` |
| `scanner(scan, { height })` | tripod + yoke head + spinning mirror drum + emissive slit at the scan origin; `update(t)` (head yaw = sweep), `setShow(k)` |
| `caption()` (overlay) | caption chip with a three-dot ramp icon; `show(text, alpha)` |
| `counter()` (overlay) | "DOTS MEASURED n" readout — feed it `plan.countAt(t)` (the real number drawn); `show(n, alpha)` |

## Planner (`scan.js`)
- `scan(world, sc, cfg)`: for column i (azimuth `az0 + dir·i·2π/nAz`) and ray j (elevation `elMin..elMax`) cast against every
  primitive (AABB-culled per object); hit → dot at the measured range ± seeded noise, reveal = `t0 + (i + j/nEl)/nAz · dur`.
  Returns typed arrays + `countAt(t)`, `columnAt(t)`, `headAz(t)`. Seeded angular jitter, dropout and grazing-angle loss.
- `createPlan(world, scanners, cfg)` → `{ scans, total, countAt(t), events(snd), coverage(cell, region) }`.
- `events(snd)`: `spinup` (mirror spin-up before each sweep), `whir` (motor for the sweep), `ticks` (k per 1/30 s bin from the
  hit rate in that bin, normalised to the busiest bin), `done` (tone when a sweep completes). `scanVoices(snd)` maps them to
  `servo`, `whir` + `hum`, `tick`, `marimba` + `chime`.
- Cost: ~0.3 s for 2 × 300 k rays in Node; the same at page load (every render worker pays it).

## Signature motion
- Dots exist only once the laser reaches their column; fresh dots flash white for ~0.2 s, then settle to their range colour.
- Head yaws with the sweep; the laser fan shows the column being measured.
- Camera: lock it while dots appear; one move per beat — into the scanner's own eye (the cloud looks solid, no shadows; the
  tripod hides itself when the camera is inside), then out and above (the shadows appear). A second tripod fills the gaps.

## Sound palette
Low pad bed (55 Hz, 600 Hz cutoff); servo spin-up; motor whir + 46 Hz hum per sweep (second scanner pitched 1.12×); fast soft
ticks whose density follows the hit rate; marimba triad + chime when a sweep completes. Levels measured only (−24 dB mean,
−9.9 dBFS peak in the demo); not listened to.

## Tuning knobs
`scan.nAz / nEl` (density = bitrate), `dots.splat` (1 = dots edge to edge seen from the scanner), `dots.minPx/maxPx`,
`dots.ramp` (range span of the colour ramp — set it to the room), `dots.shade`, `dots.rim` (soft disc edge), `dots.flash`,
`laser.every/opacity`, `scan.jitter/rangeNoise/dropout/grazing` (realism), sweep `t0/dur/az0/dir` per scanner.

## Known limitations (hit while building the demo)
- **Bitrate.** Dots under a moving camera are the worst case for H.264: the demo's moves cost ~3–4 MB per second at CRF 26
  while holds cost ~0.2 MB/s. It took density 1440×520 → 900×330 rays per scan, a soft dot rim, shorter moves (1.0 s / 1.5 s)
  and CRF 26 to go from 37 MB to ~12.5 MB. A dolly INTO the cloud is the most expensive move (everything expands).
- `check-frames` reports the MP4 vs code PSNR at ~23 dB on move frames and flags "STALE?": that is compression loss on
  hundreds of thousands of 2–5 px dots, not a stale render (the MP4 was rendered after the last edit).
- The merged cloud colours each scan by ITS OWN range, so the second scan's dots interleave with a different hue on the walls
  (honest — two scans — but speckly). Colour-by-height or by scan 1's range would be calmer.
- Objects smaller than ~0.2 m (mug, handlebar ends) are only a few dots; the bicycle reads because its wheels are 0.68 m.
- Hard-edged opaque discs alias a little under motion (no MSAA on points through the post chain); `dots.rim` softens it.
- Every render worker re-casts all rays at page load (~0.3–0.5 s); fine at this size, would matter at millions of rays.
- "Millions of dots": the demo draws ~270 k dots in total — the counter shows the real number; do not claim more.
