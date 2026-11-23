# Endless Zoom

**Look.** One unbroken, constant-speed zoom inward through nested worlds that ends exactly where it began. Each world
is a small, bright, toy-like 3D relief (rounded extruded slabs and pucks, soft drop shadows, neutral tone mapping) in
its own clean colour key — cream chat app, coral token tiles, electric-blue glowing value sliders, golden neural
network, green circuit board with a chip, violet switch with a spark. Every world holds a PORTAL at its centre (a
cursor, a tile, a knob, a node, a cell, a spark) whose face is the NEXT world's background colour: as the camera
dollies in, the next world fades in on that face and grows until it is the frame. The last portal holds the first
world, so the loop closes and the last frame equals the first.

**Good for:** "what is inside X" explainers (an answer, a photo, a file, a cell, a city), scale journeys, loops for
socials (the clip repeats seamlessly), channel idents. **Avoid for:** anything needing a wide establishing shot that
holds still, side-by-side comparisons, more than ~7 worlds in 15 s (each needs ≈ 2 s to read), content whose
portal cannot sit at the centre of its world.

## The mechanism (zoom.js, Node-safe planner)

- `createZoomPlan(levels, { duration, phase, fade, labelAt, labelFade, blinkCycles })`. `levels = [{ id, R, label, labelAt? }]`.
- One rate for the loop: `k = ln(Π R) / duration`, level durations `T_m = ln R_m / k` (deeper portal = longer stay,
  same perceived speed). Zoom clock `tau = t + phase` (wrapped). World m is drawn at `S_m = exp(k (tau - tau_m))`.
  Scale is always computed from t, never accumulated.
- `state(t) → { outer, inner, Sout, Sin, alpha }`: only two worlds are drawn. `alpha = smoothstep(fade, Sin)`.
- `localTime(m, t)`: the world's own clock (continuous across its visit and identical on every visit, so the chat
  world at the end equals the chat world at the start). `blink(t)`: the shared cursor/spark blink (loops).
- `label(t)`, `labelSpans()`, `crossings()` (label swap times = beats + chimes), `report()` (loop closes, labels ≥ 1.5 s,
  never two labels at once — the demo's scene.config.js throws if it fails).
- `shepard(opts)`: discrete Shepard scale whose pitch position is `octaves · ln S / ln Π R` (rises with the zoom, loops
  when the zoom loops), octave-spaced partials with a fixed bell-curve loudness; notes crossing the seam are duplicated
  at t − duration so the audio loops too. `zoomVoices(S.sound)` maps events to kit voices (pad partials, chime,
  whoosh, sparkle).
- `SHAPES` (window outlines: `rrect` 0.95 × 0.56 r 0.14, `circle` r 1.08 — both cover the 16:9 frame with margin for
  sway), `portalSize(shape, R)`, `sdRoundBox`.

## Picture (style.js)

`props.zoomWorld(plan, chain)` builds every world, a half-float MSAA render target and one portal window per world.
Per frame: camera sway (periodic yaw/pitch, fixed dolly distance D = 0.5 / tan(fov/2) so a world at S = 1 fills the
frame exactly) → inner world rendered alone into the target (its own window hidden) → outer world drawn with its portal
window: a plane on the portal face whose shader masks the outline with an anti-aliased rounded-box SDF and samples the
target at the same screen pixel. Same camera for both passes, so the inner world's relief and parallax are exact
through the window, and bloom/tone mapping run once on the composite.

| prop / builder | what |
|---|---|
| `zoomWorld(plan, chain)` | the whole mechanism; `chain[m] = { builder, window }` |
| `builders.chat` | chat app: question bubble, answer bubble ending in a glowing coral pill cursor (portal), input bar |
| `builders.tokens` | rows of pastel token tiles (tokenizer colours), centre tile = portal |
| `builders.numbers` | a column of glowing rails with gold knobs inside vector brackets on a grid, centre knob = portal |
| `builders.network` | 5 layers of pucks in depth, instanced links, travelling pulses, centre node = portal |
| `builders.chip` | board with gold traces, package, pins, die with an instanced flickering switch grid, centre cell = portal |
| `builders.switch` | two contacts, glowing gate, jagged arcs per blink, white-hot spark disc with the next cursor as its core |
| `caption()` | overlay chip, bottom centre, white text + a dot in the current world's colour |
| `slab`, `slabGeo`, `dropShadow`, `word`, `portalWindow` | helpers (slab = extruded rounded rect with top face at z = 0; word = label created at the resolution its zoom range needs) |

Builder contract: `(ctx) → { group, update(local, t, S, innerAlpha) }`, `ctx = { portal, face, bg, R, core, blink, blinkCycle }`.
Author at unit size (frame 16/9 × 1), portal face top at z = 0 and centred on the origin, everything else at z ≤ ~0.02
(content above the portal plane rushes at the camera as S grows), background card at `relief.bgDepth`.

## Sound palette
Shepard scale (36 steps, 3 octaves per loop, pad partials, the bed), a chime per crossing (pitch rising per world),
a soft whoosh just before each crossing, a sparkle on the final crossing (the spark becomes the cursor).

## Tuning knobs (spec.js)
`zoom.phase` (where in the first world the clip starts), `zoom.fade` (inner alpha ramp in inner scale), `zoom.labelAt`,
`zoom.blinkCycles` (integer so the blink loops), `relief.shadow`, `glow.*` (emission per glowing part), `camera.sway`,
`sound.shepard` (octaves, steps, bell centre/width, gain). Per demo: the chain's `R` (portal depth) and `window`.

## Known limitations
- Portals must sit at each world's origin: the zoom is a pure centred dolly (the fixed point never moves on screen).
  Off-centre portals would need the fixed point to move with continuous velocity; not implemented.
- A portal is `window / R`, so a shallow R makes the portal big in its own world (R = 6 → the portal is 1/6 of the frame
  height). Text-heavy worlds (the chat) need a deep R (10) so the cursor is text-sized; a "grid of tiny switches" needs
  R ≈ 20. Every world needs detail near its centre at up to R× magnification.
- Words are canvas labels created at the resolution their zoom range needs (`word()` caps at 640 px font); a word that
  stays on screen past ~9× magnification would blur. Background patterns are textures and magnify with their world.
- Two scene renders per frame (inner world to a half-float MSAA target, then the composite). Glow (bloom) is computed
  on the composite only, so a glowing inner world's halo is clipped at the window edge until it fills the frame.
- The window uses the same camera; camera sway beyond ~3° would let a frame corner escape the window at the moment a
  world takes over (windows have ~7 % margin; circle windows r 1.08 vs the frame's 1.02 corner).
- Loop audio: Shepard notes crossing the seam are duplicated at negative t; chimes/whooshes near the seam are not.
- Measured, not heard: Shepard partials are kit `pad` notes (a discrete Shepard scale, not a continuous glissando).
