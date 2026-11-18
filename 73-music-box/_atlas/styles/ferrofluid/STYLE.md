# Ferrofluid

**Look.** Invisible forces made visible. There is no solid hero: the subject is a mirror-flat pool of jet-black magnetic
liquid in a glazed white dish on a pale studio bench. A polished steel magnet (red pole band) hangs above it on a rod; lower
it and the pool heaps into a mound and erupts into a crown of sharp, glossy, hexagonally packed spikes that follow the magnet,
split into two crowns when a second magnet arrives, and sag back to a mirror when the magnets lift away. The black fluid is
read entirely through reflections: crisp studio strips, the white dish rim reflected as a pale band on every spike flank, and
rim strips that outline the spike silhouettes against the light wall. Neutral tone mapping; light set, black subject.

Demo: `Builder/HyperFrames/3d-style-atlas-pilot/54-ferrofluid/` (15 s).

## Good for / avoid for

- **Good for:** invisible forces, fields and influence (cause → visible effect), attraction / pull, "the thing responds to
  you", one source vs two sources (split), tension and release, physics explainers, calm-but-uncanny title moments.
- **Avoid for:** anything needing text, numbers or many labelled parts in the scene; step-by-step processes; colourful or
  warm topics (the palette is black/white/steel with one red accent); more than two field sources (shader slots = 2).

## Props (`style.props`)

| Prop | What it is |
|---|---|
| `fluid(opts)` | Raymarched ferrofluid on a tight bounding box. `userData.set(magnets, peak)` each frame: `magnets` = `[{ pos:[x,y,z], s }]` from `field.js`, `peak` = `plan.peak(t)` (fits the box height and tightens the spike pitch). |
| `magnet(opts)` | Steel cylinder + red pole band + rod; origin at the bottom face. `userData.update(pos)`. |
| `dish(opts)` | Glazed white ceramic dish (lathe), inner radius = pool radius. Factory `dish`. |
| `set(opts)` | Pale bench sweeping into a pale wall (kit cyclorama at `bench.y`). Factory `set`. |
| `caption(opts)` | Overlay chip: black glossy pill, white text, three-spike icon. `userData.show(text, alpha)`. |

## Planner module — `field.js` (Node-safe)

`createField(magnets, spec.field)` → plan. A magnet = `{ id, keys:[{ t, pos, ease }] }` (closed-form keyed path, y = face
height above the pool). Strength `s = smoothstep(far, near, y) ^ curve`, so lowering a magnet *is* turning the field up.
`magnetsAt(t)`, `fieldAt(x, z, t)` (sum of Gaussians, `sigma`), `peak(t)`, `total(t)`, `events({ t0, t1, fps, tickStep,
humStep })` → erupt / tick / collapse / hum events; `fieldVoices(spec.sound)` maps them for `kit/schedule.scoreFromEvents`.
`scene.config.js` imports it for SCORE and the framing gate; `style.plan` exposes it for the picture.

## Signature motion

- Spikes are a function of the local field only: cone height ∝ g^0.85 (g = field above the Rosensweig-style threshold),
  base radius shrinks with g (sharper), sub-threshold cells give tiny ripple bumps, pitch tightens ~14 % at full field.
- The crown follows a moving magnet (cells rise at the leading edge, sink at the trailing edge: the lattice is world-fixed).
- Two magnets → two Gaussians → the crown splits by itself. Lift → strength falls → spikes sag and melt flat.
- Camera: low three-quarter macro (fov 30, ~2.3–2.8 m), moves only while the fluid moves, no drift (bitrate).

## Sound palette (all from `field.js` events)

Low pad bed (55 Hz, cutoff 420 Hz) · `hum` segments every 0.4 s whose gain follows the total field (60 Hz, onsets on whole
cycles so segments stay in phase) · `squish` + `bubble` on each erupt · soft `tick`s as strength rises through levels and
while a strong magnet travels · `bubble` + `squish` "plop" on collapse. Levels measured, not listened to.

## Tuning knobs (spec.js)

`spikes.{spacing, tighten, height, heightCurve, jitter, radius, blend, mound, ripple, gridAngle}` · `field.{near, far, curve,
sigma, threshold}` · `fluid.{f0, occlusion, magnetReflect}` · `env.panels` (strip positions in az/el; the meshes get a
matching studio PMREM generated from the same list) · `env.dishBand` (the white rim band every spike reflects) ·
`march.{steps, relax}`.

## Technique notes

- Cost stays flat with spike count: each SDF sample evaluates only the 3 triangular-lattice cells around it (any other cone is
  ≥ 0.866 pitch away, so the step is capped at 0.36 pitch inside the spike layer). 1080p stills render in a few seconds.
- The fluid ignores three.js lights; it is shaded only by the analytic env (GLSL) — keep strips and direct lights on matching
  sides if you move them.
- The env's lower hemisphere is NOT the bench: just below the horizon it is the white dish rim (a pale band), steeper down
  it is black (the pool). Without that band the spikes merge into the black pool; with a bright bench they turn grey.

## Known limitations

- Lower spikes still read darker than the tips; the crown separates mainly by the edge highlights and the dish-rim band.
  Thin sub-threshold ripples at the crown edge alias slightly (thin white streaks).
- No spike-to-spike reflections (only AO) and no surface ripples after a collapse; the melt is a smooth shrink, not a slosh.
- The magnets do not cast shadows onto the fluid (raymarched surface receives no shadow map); the rod casts no shadow at all
  (a 4 m rod shadow streaked across the bench).
- Max 2 magnets (`march.maxMagnets`); raising it adds Gaussians to every SDF sample.
- The lattice is world-fixed, so a fast-moving magnet makes spikes "pop" at the leading edge rather than travel.
