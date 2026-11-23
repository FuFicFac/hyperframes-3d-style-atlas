# Impossible Geometry (`impossible-geometry`)

Sunlit pastel-stone architecture under an **orthographic camera that lies**. A Penrose-style staircase is built as a REAL, open
chain of stone steps (flights of 7 / 3 / 3 / 7). The rise per step is solved so that one step past the last cell lands exactly
`k·v` from the first cell, where `v` is the magic view direction: under an orthographic camera any point can slide along `v`
without moving on screen, so from that one direction the chain closes into a stair that climbs for ever. A little walker hops up
it on a fixed clock and, at the top, steps onto the bottom step (a teleport along `v`, invisible from the magic view). Then the
camera orbits ~30° off and the loop visibly splits open; a dashed line joins the two ends (it lies along `v`, so from the magic view
it is a single dot); the camera returns and the loop seals with a bell. Look: flat **three-tone faces fixed to the sun** (top /
+Z / +X, so they stay true while the camera turns), fine screen-space edge lines on every block (from each face's UV border via
`fwidth`, occlusion-correct for free), terracotta hanging towers with arched doors, a flag, a tree, a soft flat ground shadow and a
calm two-colour sky. No lights, no tone mapping, no post. Demo: `Builder/HyperFrames/3d-style-atlas-pilot/58-impossible-geometry/`.

**Good for:** illusions and "it depends where you stand" ideas; perspective, framing and bias; loops that look like progress
(treadmills, busywork, circular reasoning, growth that returns to start); "the trick revealed" explainers; puzzle/game-feel intros.
**Avoid for:** literal processes (use isometric-pastel or low-poly), data and numbers, emotional or photo-real subjects, anything
that needs a free-roaming camera — the illusion only exists from one direction and the clip must be built around that.

## The seam (how the join stays invisible)
The far end of the chain (cells ≥ `stairs.farFrom`, plus their towers/decor and the walker while it is there) is physically ~`k`
metres NEARER the camera than the first steps, so plain depth testing would draw it over them. Every far-end ("B") material runs a
**tunnel cut** in its fragment shader: cast a ray from the fragment away from the camera; if it enters one of the first-step ("A")
boxes (cells < `stairs.seamCells` + the seam-corner tower's trim and shaft) within `depth`, the fragment sits between A and A's
virtual copy — it would be hidden behind that copy — so it is discarded and the real A shows through. The walker, while standing
on the A end, adds six thin vertical cylinders that hug its silhouette (slightly inside it). `depth = k · fade · (v·w)` with
`fade = sealFade(angle off magic)` (1 below `seam.fullDeg`, 0 beyond `seam.goneDeg`), so off-axis the cut shrinks smoothly to nothing
and the chain is honest. Cells between `seamCells` and `farFrom` are neither (no cut, not a tunnel source): never let a far-end
piece be closer in the chain than `farFrom`, and never make an A piece a cut piece.

## Props (`style.props`; sync, seeded)
| factory | returns / hooks |
|---|---|
| `stairs(plan)` | Group of step blocks (alternating stone tones); `userData { plan, steps[], aBoxes }` |
| `tower({ at:[x,yTop,z], w, len, cap, door:"+z"\|"+x"\|[..], cut })` | hanging tower: trim, shaft, arched door(s), inverted pyramid cap; `userData.boxes` |
| `block({ min, max, color, cut, edges })` | any AABB stone block (ledges, plinths) |
| `flag({ at, pole, w, hgt, color, cut })` · `tree({ at, h, r, cut })` | scale details; flag `update(t)` ripples the cloth (pure f(t)) |
| `walker({ h, color, head })` | pawn figure (origin = feet); `userData { cyls(pos, sy), box(pos), setCut(on) }` |
| `gapLine(a, b)` | dashed screen-space line between the chain's two ends; `set(level)` (scene: `1 - fade`) |
| `groundShadow({ at, w, d })` · `label(text, { x, y })` | soft blob on the invisible ground / overlay caption `update(t, { on, off })` |
Helpers: `helpers.toneMat(base, { cut, edges, unique })`, `helpers.updateSeam({ boxes, cyls, toCamera, magic, k })` (call every frame
after the camera is posed; returns `{ angle, fade, depth }`).

**Pure planner `impossible.js`** (THREE-free, `style.plan`; import it in `scene.config.js`): `penroseStairs({ flights, run, thick,
el })` → `{ cells, n, h, k, offset, magic:{ az, el, dir } }`, `cellBox`, `virtualCell(plan, j)`, `walkerAt(plan, s)` (closed-form hop,
wraps at the seam), `walkParam`, `stepTimes` / `seamCrossings` (landings for the SCORE), `shepard(i, n)` (Shepard-tone partials),
`magicDir`, `viewAngle`, `sealFade`, `orbitKey(t, target, az, el, viewHeight, { path:"arc" })`.

## Signature motion
Camera locked on the magic view while the walker climbs (one hop per step, 3.3 steps/s in the demo); one slow `path:"arc"` orbit
(~1.7 s, inOutSine) ~30° off azimuth and down to ~24° elevation reveals the split; hold while the walker visibly jumps the gap; orbit
back; bell at the instant the seam fade reaches 1 (computed from the camera keys, not hand-timed).

## Sound palette
Footsteps = a **Shepard marimba**: every landing plays the step's 4-octave Shepard chord (`shepard(i, n)`), one octave per lap, so
the pitch climbs for ever and loops exactly like the stairs. Camera turns: low gritty `whir` (60↔88 Hz, grit .7) + `rumble` as the
woody creak; soft `whoosh` out when the loop splits; `chime` when it seals; `bubble` on each seam teleport; `blip` per caption; warm
`pad` bed (root 196 Hz, brightness 1100 Hz, gain .42 → mean about −22 dB). Levels measured, not listened to.

## Tuning knobs (`spec.js`)
- `stairs.flights` (moves per flight; +x minus −x must equal +z minus −z), `run`, `thick`, `elevationDeg` (magic elevation; rise per
  step = |gap|·tan(el)/n — higher elevation = steeper steps), `seamCells`, `farFrom`.
- `tones` (top .45 to white, +X .26 / back .40 toward `#5c5a8a`), `edges.widthPx` 1.35, `edges.k` .5.
- `seam.fullDeg` / `goneDeg` (how quickly the cut fades off-axis), `gap` (dashed line), `shadow`, `world.sky`, `overlay.labelH`.

## Known limitations
- Only one structure type exists (the 4-flight staircase). A Penrose triangle or water channel would reuse the same planner idea and
  tunnel cut but needs its own geometry.
- With 7/3/3/7 flights the rise per step is modest (~0.34 m per 1 m tread at 50°): the stair reads as stepped blocks more than a steep
  staircase; the walker's hops carry most of the "climbing" read. Steeper steps need a higher elevation or longer flights.
- The tunnel cut is exact only at the magic view. While the camera is within `goneDeg` of it (a fraction of a second in each move) a
  small part of the far end is visibly carved away near the join.
- MSAA cannot help where a cut edge meets a silhouette: a 1-px light fringe can appear around the walker's head while it stands on
  the first two steps in front of the far end.
- The walker cylinder tunnel is an approximation of its silhouette (slightly inside): a pixel or two of the far end can overlap its
  outline at the seam.
- Faces facing −X / −Z / down share one "back" tone; keep camera azimuths between 0° and 90° (the demo uses 13°–45°).
- The ground shadow is a blob, not a projection: a true planar shadow would reveal the open plan from the magic view.
