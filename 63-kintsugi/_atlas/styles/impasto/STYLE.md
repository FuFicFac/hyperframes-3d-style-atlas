# Impasto (`impasto`)

**Look.** Thick oil paint in the post-impressionist manner, seen as sculpture. A primed, woven linen canvas (4.8 x 2.7 m,
16:9, toy-scale) lies flat on a light oak table. Short fat brushstrokes, 30-40 cm long and 1.3-2 cm thick, are laid one
after another: each has real relief (a dome, raised ridges along both edges, bristle grooves running along its length, a
fat blob where the brush lifted, a thin rounded start) and drags two colours together in streaks. They follow a swirling
flow field: halo rings around a glowing moon and stars, a big double swirl in the sky, contour strokes on the hills,
flame licks up a cypress, short dabs for a village, furrows in the fields. Palette: ultramarine, cobalt, cerulean, chrome
yellow, viridian, sap green, orange. Glossy wet paint (roughness 0.3) under a moving RAKING key light, so every ridge
catches a highlight and throws a small shadow. A cream caption chip (italic serif, three paint dabs) sits bottom-centre on
the overlay. Distinct from `ink-wash` (flat, monochrome, absorbed into paper): this is coloured, thick, sculptural paint.

**Signature mechanic.** Stroke-by-stroke painting along a flow field (`strokes.js`, THREE-free):
- a composition = regions (moon, stars, sky, cypress, village, hills, fields) with curves and a palette per region; each
  region has a seeded vector field (vortex sums + wind for the sky, pure rings for the moon/stars, hill contours, flame);
- seed points: a jittered grid (per-region spacing) plus concentric rings round the moon and each star;
- each stroke's centreline is the field's streamline through its seed point (RK2, 1 cm steps), integrated ONCE and
  stored; the picture bends every instance into a constant-curvature arc matching the streamline's turn over its length;
- a schedule per group (moon+stars, sky, land): the first `lead` strokes go down one at a time at a readable gap, the rest
  accelerate (`start = t + span * x^pace`) into a time-lapse; order inside a group from a sort key (moon rings outward,
  sky spiralling out from the big swirl, hills left to right, fields top to bottom, the cypress last, bottom to top);
- progress(t) = outCubic((t - start) / dur): a stroke grows from its start point with the lift blob riding at the brush end;
- FLOW: after `flow.t0` each stroke slides along its own precomputed streamline by `v * G(t)` (eased ramp, then linear) —
  halo rings rotate, the swirl turns, the hills drift a little; pure function of t, nothing integrated per frame;
- UNDERPAINT: a 240 x 135 grid records, per cell, the earliest time a stroke covered it and that stroke's colour
  (dilated, then box-blurred in the style), so gaps between strokes show a soft thin wash once the brush has passed;
- SCORE from the same schedule: a brush sound per stroke start (merged under `sound.minGap`), a wet plop at the lift of
  every slow stroke, a marimba note per beat, a whoosh + pad swell when the flow starts.

## Good for / avoid for
- Good for: art and creativity topics, "how something is made, step by step", texture/craft close-ups, "the method behind
  the masterpiece", calm-but-busy openers, process time-lapses, anything that benefits from a hand-made, warm look.
- Avoid for: text or numbers in the picture (only the overlay caption), exact diagrams, fast cutting, very long holds on
  the finished painting (static once painted until the flow), dark/moody pieces (the wide shots read best bright).
- Don't present it as a reproduction of any specific painting: the composition is a parameter (`COMP` in the demo).

## Planner (`strokes.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `createPlan({ W, H, seed, comp, size, schedule, flow, under })` | everything precomputed: strokes, streamlines, schedule, underpaint. |
| `plan.stateAt(t, out)` | per stroke (paint order): x, y, heading, curvature, progress. |
| `plan.poseAt(stroke, s)`, `plan.progressAt(stroke, t)`, `plan.flowAt(stroke, t)` | single-stroke pieces. |
| `plan.region(x, y)`, `plan.field(region, x, y)` | the composition and its fields (canvas coords, metres). |
| `plan.strokes[i]` | `{ reg, kind, x, y, L, W, H, cA, cB, start, dur, v, order, group, ... }`. |
| `plan.underpaint` | `{ w, h, time, color, uncovered }`. |
| `plan.events(spec.sound, BEATS)`, `impastoVoices(spec.sound)` | brush / lift / beat / flow events -> SCORE via kit `scoreFromEvents`. |
| `plan.paintedBy(t)`, `plan.groups` | counts. |

`comp`: `horizon`, `near` (curve coefficients), `cypress { x, sway, top, hw }`, `moon { x, y, r, halo, rings }`,
`star { r, halo, rings }`, `stars [[u, v, scale]]`, `vortices [{ x, y, R, s }]`, `wind`, `bandPitch`, `village`, `palette`
(lists of hex per sub-region). `size`: grid cells + `{ L, W, H }` per kind. `schedule`: `[{ id, groups, t0, t1, dur:
[first, last], lead: [count, gap], pace }]`. `flow`: `{ t0, t1, ramp, speed: { kind: m/s } }`.

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `painting(plan, { rake })` | everything (table, canvas, strokes, raking light); `update(t)`. |
| `strokeField(plan)` | the InstancedMesh: unit grid bent per instance (vertex shader), per-pixel bristle normals and colour streaks (fragment), matching `customDepthMaterial` for shadows, clipped at the canvas edge; `userData.update(t)`. |
| `canvasBoard(plan)` | oak table, stretcher, woven canvas with the timed underpaint wash; `userData.update(t)`. |
| `rake(keys)` | key-light direction from `[{ t, elev, az, intensity }]` (az 0 = from +X, pi/2 = from the canvas top). |
| `caption()` | overlay chip, `userData.show(text, alpha)`. |
| `weaveTexture()` | the plain-weave bump texture. |

## Sound palette
`penScratch` (low, pitch 0.42) + `rustle` per brush stroke, panned by the stroke's x; quieter in the time-lapse phase;
`squish` (pitch 1.5) when a slow stroke lifts; `marimba` per beat; `whoosh` + `pad` swell at the flow; a warm `pad` bed
(110 Hz, brightness 750 Hz) sets the mean. All times come from the plan.

## Knobs (spec.js)
- `stroke`: grid resolution, `bristles`, `groove`, `rim`/`rimAt`, `blob`/`blobAt`/`blobW`, `edge`, taper/cap/widen,
  `streak`, lift per order, roughness, normal strength.
- `canvas`: size, weave threads/repeat/bump, `underpaint` strength/lighten/fade/blur.
- Lights: `fill` hemisphere, `key` directional (re-aimed every frame by `rake`); shadow map 4096 over a 2.95 m extent.
- `sound`: brush/lift/beat/flow/bed gains.

## Known limits (seen while building the demo)
- Strokes are constant-curvature arcs fitted to the streamline, not the full streamline: an S-shaped streamline becomes
  a C (fine for 30-40 cm strokes; long strokes would need a per-instance path texture).
- Where strokes don't overlap the blurred underpaint shows as a pale haze between them; denser/wider strokes hide it.
- Strokes overlap by a per-order lift (later on top), not by a paint simulation: no wet-into-wet mixing at overlaps,
  and at grazing angles you can see the thin edge step of a stroke lying on another.
- Tiny strokes (village, moon centre) read as dog-bone dabs because the blob and taper are scaled with the stroke.
- The flow moves sky strokes along open wind streamlines, so a few slide off the right canvas edge (clipped there) and
  leave a thin washed gap on the left edge by the end.
- The underpaint is a fixed-at-build grid (it does not move with the flow).
- Audio levels were measured, not listened to.
