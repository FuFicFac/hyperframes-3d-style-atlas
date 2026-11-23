# Bullet Time (`bullet-time`)

**Look.** A bright white high-speed-photography studio: pale calibration-grid floor fading into white haze, four softboxes
on stands. A striped orange ball bounces in and drops into a big white bowl of cobalt-blue liquid. Mid-splash the world's
clock stops: the crown wall, its beaded fingers, the spray and the ripples hang still while the camera keeps sweeping
almost a full circle around them. Time is then scrubbed backward (the splash un-happens, the ball rises back out), forward
again, and released. A two-track overlay gauge (CAMERA always running, WORLD playhead stopping / reversing) names the trick.

**The mechanic: two clocks.** `timewarp.js` (pure, Node-safe) holds both.
- `createWarp({ w0, phases: [{ at, rate, ramp }] })` — world rate dw/dt is piecewise linear in video time, so world time
  `w(t)` is piecewise quadratic: exact, closed form. `crossings(we)` returns every video time at which the world clock
  passes a world time (forward or reversed); `gridCrossings(step)` gives jog ticks; `ramps()` the rate changes; `mode(t)`.
- `cameraPath(waypoints)` + `cameraKeys(path, duration)` — one Catmull-Rom arc over azimuth / radius / elevation / target,
  sampled into dense linear keys for the kit rig. It never reads `w`.
- `createSplash(STYLE_SPEC)` — the world as closed-form functions of `w` (impact at w = 0): `ball(w)` (floor bounce,
  parabola, exponential plunge), `crown(w)` + `crownProfile(theta, state, out)` (lathe wall: base radius r0 + spread·√w,
  height = beta bump of w, lobes that grow in), `surfaceY(r, w)` (cavity, swell, travelling ripples), `jet(w)` +
  `jetProfile`, `droplets` / `droplet(i, w)` (ballistic; launched from the lobe tips with the tip's own velocity, plus an
  early spray), `splats` (floor marks that exist only for w ≥ landing time), `events()`, `points(w)` for framing.
- `timedEvents(warp, events)`, `clockEvents(warp, sound)`, `bulletVoices(sound)` → SCORE through `kit/schedule.scoreFromEvents`.

Nothing is stepped: the scene calls `world.userData.update(WARP.w(t))`, and every vertex, instance matrix and splat is
rewritten from `w`. Scrubbing backward is the same code path as forward.

**Good for.** "Pause and look closer"; analysing one instant; cause and effect inside a split second; replays;
inference time vs wall-clock time; anything where the observer's clock and the subject's clock come apart.

**Avoid for.** Long processes (the world has about one second of content), text-heavy explainers, dark/moody topics,
anything needing a transparent or refractive liquid (this one is opaque paint-like liquid by design).

## Props

| prop | what | time hook |
|---|---|---|
| `studio()` | grid floor (0.5 m cells, heavier every 2 m) + 4 softboxes on stands at 10.5 m | static |
| `bowl()` | white ceramic lathe bowl, rim 1.45 m radius | static |
| `ball(plan)` | striped ball (stripe shows the spin stopping) | `update(w)` |
| `liquid(plan)` | surface polar grid + crown wall + rebound jet (all rewritten per frame) | `update(w)` |
| `droplets(plan)` | instanced ballistic droplets (stretched along velocity) + floor splats | `update(w)` |
| `world(plan)` | all of the above | `update(w)` |
| `caption()` | overlay chip, bottom-left | `show(text, alpha)` |
| `gauge()` | overlay two-clock gauge, bottom-right | `show({ cam, world, impact, mode }, alpha)` |

## Signature motion
1. Run at rate 1 → linear ramp to 0 (0.4 s) → freeze. The camera's move is continuous straight through the freeze.
2. Big arc during the freeze (≈ 200° in 5 s), slight push-in; softboxes and floor grid sweep past as parallax references.
3. Scrub: rate −0.36 then +0.36 with 0.4 s ramps; land on the same frozen instant again.
4. Release to rate 1, then ease to a crawl (0.05) at the top of the rebound jet for the final hold.

## Sound palette
Soft pad bed. World events (floor bounce, plunge, lobe pinch-offs, droplet landings in liquid = `bubble`, on the floor =
`tick`, jet rise / pinch) are placed at every crossing of `w(t)`: pitch drops with the world rate at the crossing, reversed
crossings are softer, and the reversed plunge is a whoosh that peaks AT the crossing. The clock itself: a `servo` glide on
every rate ramp (pitch falls into the freeze, rises on release), a `chime` when the world stops from full speed, and
`tick`s every 0.03 s of world time while scrubbing (rate between 0.03 and 0.6), so the ratchet speed follows the scrub.

## Tuning knobs (spec.js)
- `crown.height / life / riseExp / fallExp` — how tall and when; `lobes`, `lobeAmp`, `lobeSharp` — the fingers;
  `segments` ≥ 16 per lobe or the tips facet.
- `droplets.spray.speed / elev / n`, `droplets.lobe.pinch` (world time the beads let go — put the freeze just after it).
- `jet.height / start / pinch`, `cavity.depth`, `ripples.*`.
- `ball.bounceW`, `ball.vx`, `ball.dip` — the approach; the impact speed is derived so the plunge is continuous.
- Scene side: the warp `phases` and the camera waypoints; `gauge` / `caption` boxes.

## Known limitations (real ones)
- The splash is a stylised surface of revolution, not a fluid sim: the crown wall is one lathe profile with cosine lobes,
  so every finger has the same shape and spacing; droplets never merge and do not disturb the surface where they land.
- Droplets that would hit the bowl's outer wall are not tested — they are sent to the floor; a few pass close to the rim.
- The ball is simply hidden under opaque liquid after the plunge; its cap pokes through the cavity floor around the freeze.
- The crown's base and the surface swell are separate meshes that only meet under the wall's flared foot; a very low
  camera inside the bowl would see the join.
- Lobe beads stay on the crown after their droplet leaves (the droplet appears at the tip rather than necking off).
- No motion blur at full speed, no depth of field: "frozen" and "running" frames differ only by motion.
- The grid floor under a constantly moving camera costs bitrate; the demo keeps the grid pale for that reason.
- Sound was measured (levels), not listened to.
