# Constructivist Poster

**Look.** A 1920s Constructivist poster that builds itself with force. Cream lithograph paper, red / black / one grey,
and a white circle. A red wedge drives diagonally into the circle, heavy black bars slam in on a 35° axis, a black
megaphone cone throws words that grow as they fly, wheels roll along a bar and stop dead against the circle, and blocks of
condensed capitals (Impact) swing in on hinges. Each element is a thick painted card (16 cm) at its own height above
the board (0.25–1.7 m), held on hidden dowels. A hard key light from the upper left throws offset shadows. Ink is mottled
(a noise map multiplies each ink colour), and type and the circle carry a slightly offset underprint (misregistration).
Once the poster has locked, the **orthographic** camera tilts on an arc to show the relief (cards floating on their dowels),
holds, then snaps back flat with an outBack overshoot. Motion is percussive: hard ease-in (u³), a dead stop, then a tiny
damped ring. Every move has a mechanical hit in the same rhythm.

Original compositions only. Keep the copy neutral (BUILD, IDEA, SIGNAL, FORWARD). No political symbols, slogans,
portraits or reproductions of real posters.

**Good for:** title cards and claims with punch, manifesto-style lists ("three things that matter"), "how it's put
together" reveals (the tilt), bold openers and section stingers, anything that should feel assembled, forceful and graphic.
**Avoid for:** calm or reflective topics, subtle data, long text, photographic subjects, and anything where a
propaganda-poster register would be tone-deaf.

Demo: `Builder/HyperFrames/3d-style-atlas-pilot/68-constructivist-poster/` (15 s, 5 beats).

## Files

| File | What |
|---|---|
| `spec.js` | palette, paper + ink textures, lights, post, ortho camera, card thickness, misregistration offset, type font, `feel`, caption, sound levels |
| `style.js` | `createStyle(stage)` → props below; `buildPoster(layout, plan)` poses every piece from the plan each frame |
| `construct.js` | **Node-safe planner** (imports only `kit/time.js`): `strike`, `jolt`, `createPlan({ pieces, cams, feel, end })`, `constructVoices(sound)`. Exposed as `style.plan` / `style.motion` |

## Props (`style.props`)

| Prop | What |
|---|---|
| `board()` | 16.6 × 9.4 m poster board, paper front at z = 0, 0.3 m deep (its edge shows in the tilt) |
| `slab(shape, material, top, thickness)` | an extruded card whose top face sits at `top` |
| `dowel(x, y, top)` | a hidden standoff from the board to the underside of a card |
| `wheel({ r, material, top })` | a disc with two cream/black spokes and a hub; turns about z |
| `word(text, { cap, color, under, top })` | a cut-out word (lit plane that casts an alpha shadow) plus its misregistered underprint |
| `piece(L)` | one layout entry → Group. `shape.type` is `wedge` `bar` `disc` `cone` `wheel` `block` (printed box face) or `word` |
| `buildPoster(layout, plan)` | every piece + board; `update(t)` applies slide / drop / hinge / roll / throw / ray / recoil, plus the sheet shake |
| `caption()` | overlay slab (black, red tab, cream condensed caps), top centre; `userData.show(text, alpha)` |
| `style.shapes` | the 2D shape builders (`wedge`, `bar`, `disc`, `cone`) |

Layout entry (plain data in `scene.config.js`): `{ id, kind, shape, material, at:[x,y], angle (deg), z, under?,
slide?: { dist, dir? }, drop?: { lift, scale }, hinge?: { x, closed }, roll?: { rail: { from, angle }, offset, s0 },
throw?: { from, scale0 }, recoil?: { by, amp, dir }, dowels? }`. Each timed piece has a PIECES entry with the same id:
`{ id, kind, start, hit, weight, roll?: { dist, r, spokes }, feel? }`.

## Signature motion

- `strike(t, start, hit)`: `((t − start)/(hit − start))^3` up to the hit, then `1 + 0.035·sin(2π·dt/0.16)·e^(−dt/0.07)`.
  For thrown words use `feel: { power: 0.5 }` (fast out of the cone, still a dead stop with a ring).
- Slides travel along the piece's own axis from off-frame. Drops fall toward the board while scaling 1.2–1.35 → 1, so the
  shadow gap closes. Hinges swing flat from almost edge-on (≈ −84°) about an edge at the card's own height.
- The struck circle recoils along the wedge's axis (`recoil`). Heavy hits (weight ≥ 1) shake the sheet a few pixels (`plan.shake`).
- Wheels: `s = dist·u²` along the rail, turn = −s / r, a ratchet tick each quarter turn (tick times are solved from the same formula).
- Camera: flat-on ortho (`viewHeight` 9) → arc to azimuth −42°, elevation 26°, `viewHeight` 8.3 (`outCubic`, 0.85 s) → hold
  → back to flat (`outBack`, 0.4 s).

## Sound palette (`constructVoices`, all from the plan's events)

swish = an `in` whoosh into each hit · hit = `impact` + `clack` (heavier = lower and louder) · hingeHit = `clack` + `thud` ·
tick = `click` per spoke · stop = `clack` + small `thud` · throw/land = `whoosh` out of the cone, then `clack` + `pop` ·
tilt/snap = `servo` glide, and the snap ends in impact + clack · bed = a dark `pad` (55 Hz root, 420 Hz cutoff) + a quiet `hum`.
Demo levels (measured, not listened to): mean −21.3 dB, peak −3.3 dBFS. MP4 2.5 MB at CRF 22.

## Knobs

`spec.lights.key.position` sets the shadow offset (lateral/axial ≈ 0.33, so the offset is about ⅓ of a card's height).
`card.thickness` · `misregister.offset` · ink `map` noise (`scale`, `colorA`, `contrast`) sets how blotchy the litho looks ·
`feel` (power, over, period, decay) · `camera.viewHeight` · `post.grain` (kept low: 0.014 at 15 fps).

## Known limitations (hit while building the demo)

- The opening is sparse: the circle lands at 0.18 s and the wedge at 0.5 s, so the first half-second is mostly empty paper.
  That is the nature of a poster building itself — start a clip with a piece already in place if the first frame matters.
- The ink mottle is a low-frequency noise multiply. It reads as "uneven ink" on red and grey, but on the big white circle it can
  look slightly dirty. There is no rough lithograph edge (the card edges are clean vector cuts).
- Type is a lit plane. In the tilt, words read as thin floating cut-outs (they have no thickness of their own).
- Mid-hinge frames (the cone and BUILD at ~80° open) show a short sliver of card for 0.1–0.2 s. That is correct but not pretty
  in a still.
- Fonts are macOS system faces (Impact, falling back to DIN Condensed / Arial Black): pixel-identical on this Mac only.
- The composition, word positions and wheel stops are hand-placed in `scene.config.js`. There is no automatic collision check
  between thrown words and the bars.
