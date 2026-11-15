# Murmuration

**Look.** A dusk sky — warm apricot at the horizon, rose band, dusky lavender, cool blue-violet zenith — with a low sun glow
on the right and a thin dark horizon (near tree line, hazy far tree line, a row of lattice pylons with sagging wires) for scale.
Across it, thousands of tiny near-black birds wheel as one living cloud. Nothing is placed: the cloud itself becomes the
shape (blob, twisted ribbon, arrow, ring) and dissolves back into flock. Birds are flat unlit silhouettes, darker when their
wings face the camera, lighter edge-on, lifted slightly toward the horizon colour with distance. No post, no grain.

**Signature mechanic.** `flock.js` (Node-safe planner): every bird has a closed-form position at time t —
a blend of its point in the previous and next formation (eased, per-bird delay along a pour direction, a swirling or
radial mid-path bulge) + a smooth 3D value-noise flow evaluated at (home, t) whose amplitude is keyed per beat + a small
personal loop + travelling **density waves** that pull birds toward the band centre and turn their wings to the camera,
so a dark ripple rolls through the cloud. Heading = finite difference of the same closed form (t and t + dt). Formations are
seeded volumetric samples of an SDF with a soft halo (soft edges, no hard logo of dots), ordered on a rank grid (columns by
x, each by y) so bird i keeps its rough place in every formation and transitions pour instead of scrambling.
No simulation, no stored state: any t renders on its own.

## Good for / avoid for
- Good for: emergence, collective behaviour, "simple rules → complex result", decentralised systems, many-become-one,
  crowds, swarms, data points coalescing into a message, calm reflective openers, a shape or symbol revealed from chaos.
- Avoid for: precise diagrams, text longer than a short word (formation glyphs need large strokes), anything that needs
  exact counts or legible small detail, daylight/brand-colour looks.

## Props (`style.props`)
| prop | what it is |
|---|---|
| `murmuration(flock)` | sky + horizon + birds added to the scene; `update(t)` |
| `sky(o)` | back-side dome, unlit dusk gradient + 3-lobe sun glow + static dither + vignette |
| `horizon(o)` / `treeLine(o)` / `pylons(o)` | silhouettes: fbm crown strip, lattice towers (thin boxes) + catenary wires |
| `birds(flock)` | ONE instanced draw (InstancedBufferGeometry, 5 triangles/bird). Per-instance aPos/aVel/aBank written from `flock.positionsAt(t)`; vertex shader orients along velocity, turns the wing plane to the camera by bank, flaps from uTime with per-bird phase and a flap/glide rhythm |
| `birdGeometry(span)` | the bird: +x forward, wings along ±z |
| `caption()` | centred overlay caption over the dark land with a short warm rule; `show(text, alpha)` |

Planner (`style.plan` = `flock.js`): `createFlock(spec.flock, spec.birds, { forms, moves, waves, flow, body })` →
`positionsAt(t, pos, vel, bank, stride)`, `stats(t)`, `formBox(id, pad)` (framing gate), `events(sound)`;
`flockVoices(sound)` for `scoreFromEvents`; `shapeSdf`, `sampleFormation`. Formation kinds: `blob`, `ribbon` (Catmull-Rom
path + radius profile), `arrow`, `torus`. Glyphs/icons: add an SDF kind (stroke font → ribbon union is the obvious next one).

## Sound palette (all from the plan)
- Wing-rush: overlapping airy `whoosh` every 0.3 s, gain follows mean flock speed (`flock.stats`).
- Flutter: `rustle` every 0.45 s, gain follows compression (bank + inverse spread).
- Density wave: low `whoosh` (pitch 0.45) peaking as each wave crosses the flock centre.
- Burst: `whooshOut` + `rustle` on a radial (`bulgeMode: "radial"`) move.
- Sparse distant calls: seeded short `blip` trills, low gain, panned. Bed: warm `pad` (98 Hz, cutoff 650 Hz).

## Knobs (spec.js)
`birds.count` (16 000 in the demo; ~25 ms/frame JS on an M1 Pro), `birds.span`, `flapHz` (kept 2.6–4.2 Hz so it resolves at
30 fps), `faceBase`/`faceBank` (how dark the wave band gets), `haze`; `flock.flowFreq/flowSpeed`, `orbit`, `straggle`, `halo`
(edge softness; per formation `halo`/`soft` override — use ~0.2/0.6 for shapes that must read), `columns`; sky colours, bands,
glow lobes, sun direction; horizon heights and pylon row. Per scene: forms, moves (t, dur, spread, dir, bulge), waves, the
flow-amplitude keys (tight ≈ 0.25 m while a shape holds, 1–2 m while loose) and body sway/yaw.

## Known limitations (seen while building the demo)
- Shapes read clearly only while the flow amplitude is low (≈ 0.25 m) and the formation halo is reduced; at loose settings an
  arrow is a smudge. Hold a formed shape ≥ ~1 s.
- The flock is one depth layer of ~16 000 birds: dense shapes saturate to a dark mass at 1080p, loose clouds read as specks;
  individual bird shapes are only visible at full size.
- Birds flap far slower than real starlings (aliasing at 30 fps).
- Loose formations (the twist) can brush the top of frame; the framing gate only checks formed shapes (`formBox` cores).
- Stragglers trailing a transition can drip below a shape for a moment (e.g. under the arrow head).
- Bird JS cost grows linearly with count (two closed-form evaluations per bird per frame for the heading).
- No glyph formation yet; words need a new SDF kind.
