# Reaction-Diffusion (`reaction-diffusion`)

A macro shot of a shallow glass petri dish on a pale, cool-grey lab bench. Cream gel fills it; a deep-teal pattern grows
in the gel, standing slightly proud of the surface so the warm, low key light catches its edges and a wet glint runs
along every spot and stripe. Teal drops fall and land as rings, the rings pinch into spots, the spots split again and
again, the fronts from different drops meet and lock into one winding maze. The pattern is a real Gray–Scott
reaction-diffusion simulation, run once when the page loads; the picture only replays stored states.

Demo: `109-reaction-diffusion` — "Rules, not a plan" (15 s, 5 beats: A few seeds / Two simple local rules / Spots split
and spread / Neighbours compete / No one drew this).

Motion type: numerically simulated (pattern) + art-directed (drops, camera, colour). The pattern is the Gray–Scott
two-chemical model stepped on the CPU in `grayscott.js` (explicit Euler, dt = 1, 9-point Laplacian, Du = 1, Dv = 0.5,
160 × 160 grid clipped to a 76-cell-radius disc with a no-flux rim, seeded drops) — NOT on the GPU as the storyboard
said: the run rules require the simulation in the Node-safe planner. Feed/kill are SCHEDULED (art-directed): the
"mitosis" regime F .0367 / k .0649 until 8.5 s, eased to the "coral" regime F .0545 / k .062 by 11.5 s so the spots
stretch and lock into stripes. Video time → simulation steps is a hand-set time-lapse clock (40 steps by 2.5 s, 8200 by
15 s). The activator field is stored every 0.25 s of video and the shader blends linearly between the two neighbouring
stored states (an interpolation, not the simulation, between stores). Drops fall on a closed-form inQuad arc and the
ripples are a closed-form damped ring wave; neither is simulated. Colony tint (which drop's pattern reached a cell first)
is a passive label tracked during the same run: a visualisation, not chemistry. Results are identical on every load on
this machine (plain JS doubles/Float32Arrays, seeded RNG); not checked on another CPU/browser.

## Signature mechanic (`grayscott.js`, Node-safe; `style.plan` / `style.motion`)

- `createPlan({ n, radius, Du, Dv, clock, schedule, seeds, seedNoise, seed, storeEvery, duration, vMax, claimAt })` →
  `{ n, radius, layers, times, states (Uint8Array layers·n·n), labels, coverage[], activity[], mask, seeds, steps,
  stepsAt(t), layerAt(t) → { i, f }, coverageAt(t), activityAt(t), vAt(t, x, y) }`. Runs the whole simulation once.
  Seeds are discs or (`ring: w`) annuli of activator injected at the step that matches their landing time.
- `paramsAt(schedule, t)`, `invClock(clock, steps)` — F/k keyed by video time; steps → video time.
- `texturePlan(plan, { start, end, rate })` → events: one `drop` per seed at its landing time, then `grain` events whose
  density follows sqrt(coverage) × (0.35 + 0.65 × normalised activity) — the dish's patterned fraction and how much it
  is still changing; it thins out as the maze locks.
- scene.config.js imports the planner too: the same run drives the picture (DataArrayTexture), SCORE, the colony
  "meet point" the beat-4 camera aims at, and the NOTES.
- Load time (budget ~3 s): the 15 s demo's run (8200 steps on 160²) takes ≈ 1.8 s in Node on the M1 Pro; in headless
  Chrome (chrome-headless-shell, hardware GPU flags) a fresh import of the whole scene.config.js — simulation + meet
  point + framing gate + SCORE — took 1.81–1.91 s over 6 timed imports (2026-11-23).
- `runHash(plan)` → 8-hex FNV-1a over the stored states, colony labels, coverage/activity (Float32 bytes) and step
  count. Node (which makes the sound) and Chrome (which draws the picture) gave the same hash, `1e7b15cb`, before and
  after the change below; scene.config.js records it as `RUN_HASH` and throws in either environment on a mismatch
  (`RD_RECORD=1` to re-record after an intended change). Only exactly-rounded maths (+ − × / and Math.sqrt, Math.imul)
  feeds the run: the one Math.hypot (seed disc distance) was replaced by Math.sqrt of a sum of squares (hash unchanged).

## Good for / avoid for

- Good for: emergence, self-organisation, "local rules → global pattern", morphogenesis (animal coats, coral, fingerprints),
  decentralised systems, anything where nobody is in charge and a pattern still appears.
- Avoid for: precise data, step-by-step mechanisms with named parts, anything that needs text in the scene, very
  short clips (< 8 s: the pattern needs time to grow), or dark moody looks (the gel is meant to be bright).

## Prop factories (`style.props`)

| prop | what it is |
|---|---|
| `petriDish(plan, { bottle, pipette })` | everything: bench, dish, gel, drops, bottle, pipette; `update(t, { colony, wipe })` |
| `gel(plan)` | the hero shader mesh (360² grid): blends two stored states, B-spline filter, relief + normals from the same height, ripples, drop shadows, wet glint, colony tint, ring wipe |
| `dish()` | fresnel-glass wall (outer + inner), clear-coat rim torus, glass foot, soft contact-shadow ring |
| `drops(seeds)` | teal glossy spheres: fall, stretch, squash and vanish at the landing time; `state(t)` feeds the gel's shadow/ripple uniforms |
| `bottle()`, `pipette()` | dropper bottle (teal liquid, label band, cap, rust bulb); a glass pipette lying on the bench |
| `bench()` | matte cool-grey laminate plane |
| `caption()` | overlay chip (deep-teal plate, ring-of-spots icon, cream text), exact colours |

## Sound palette

- `bubble` (+ a quiet high `thud`) per drop, panned by the drop's x — five soft plinks at the landing times.
- `tick` grains (pitch 1.4–3.2, gain .05–.16 with density) from `texturePlan`: a quiet crackle that swells while the
  spots divide and the stripes form and thins as the maze locks.
- `pad` bed, D3 root, open fifth/octave/tenth, 700 Hz cutoff: sets the mean (≈ −25 dB).

## Knobs (spec.js)

- `sim`: grid `n`, dish `radius` (cells), `Du/Dv`, `spots` / `stripes` F-k pairs, `ring` seed shape, `seedNoise`,
  `storeEvery`. The pattern scale is ~10–12 cells per stripe pair: a bigger grid = more, finer stripes (and ~n² load time).
- `gel`: `relief` (m), `edge` (activator band that becomes ink: narrow = crisp), `core`, `gloss` / `spec` / `sheen`,
  `sss` (wrap light), `mottle`, `colonyBase` (territory tint outside beat 4), `colonyBlur`.
- `dish`: radius, wall, height, gelTop, meniscus; `drop`: radius, fall time, height, squash, ripple.
- `palette.colonies`: one hue per drop's territory (beat 4).
- Scene-side (scene.config.js): drop positions/times, the time-lapse `clock`, the F/k `schedule`, `colonyAt(t)` and
  `wipeAt(t)` (the ring wipe that returns every territory to one teal).

## Known limits (seen while building the demo)

- Between stored states (every 0.25 s) the field is linearly blended; the B-spline filter and threshold make that read
  as smooth motion in stills, but a fast split could show a brief cross-dissolve. Not watched in motion.
- Gray–Scott is touchy: filled seed discs above ~8 cells radius and symmetric (noise-free) rings died out; annulus seeds
  (r 14, w 4, noise .03) survive and pinch into spots. Reordering the drops changes the final maze (re-check stills).
- At the extreme macro (beat 4) a cell is ~25 px: the colony borders are softened with a box blur, which leaves short
  colour gradients (olive/brown where green/orange meet). The beat-5 ring wipe has a muddy band mid-sweep.
- The far inner glass wall reads as a pale band between the gel edge and the rim in the wide (physically right, but it
  can look like a gap). The pattern relief is faded to zero over the outer 0.1 m so the gel edge stays clean.
- The caption chip (top-left) overlaps the dish rim in the wide shot; the bottle sits top-right.
- Sound was measured, not listened to. The hash check covers this machine's Node and Chrome only.
