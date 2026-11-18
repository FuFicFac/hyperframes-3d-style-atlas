# Op Art (`op-art`)

**Look.** 1960s optical art, after the *methods* of Bridget Riley and Victor Vasarely (the compositions are our own, not
copies of any work). One large 2:1 hard-edged panel (3.4 x 1.7 m, 8 cm stretcher depth) hung 3 cm off a warm-white
gallery wall above a pale floor, lit by a soft high wash that throws a thin shadow line. Everything on the panel is pure
black (#121212) and white (#f7f6f2) until late on, when one red (#e2321f) and one cobalt (#1f44c8) accent arrive. A
gallery wall-label caption (white card, black Helvetica Neue bold, small red square) sits under the panel on the overlay.
There is no post stack, so the panel shader's colours are exact.

**Signature mechanic.** Flat pattern the eye reads as depth and motion, with a reveal that it is flat:
1. **Bulge** — vertical stripes whose phase is warped by a radial cap (`x' = c + dx (1 - A (1 - r²/R²))`, wide at the
   centre, ~1.9x compressed at a crisp rim) plus duty-cycle shading from a sphere normal (thinner black on the lit side).
   Only the disc changes as it travels.
2. **Moiré** — the panel becomes concentric rings; a separate clear acetate mesh of identical rings (3 cm in front)
   slides in and glides 0.32 m across the centre. The product of the two gratings makes broad dark/light lobes that
   swing round far faster than the sheet moves and vanish when the centres align.
3. **Vasarely grid** — checker squares with opposite-colour circles in a lens-warped cell space; Chebyshev ring k appears
   at `gridIn + k·step`, circles grow big at the centre (dome, red heart), then ring by ring the colours invert, circles
   swap big↔small and the lens flips sign (tunnel, cobalt heart), then flip back.
4. **Reveal** — the camera arcs ~33° off-axis and a little above: the "dome" is paint on a flat board.

All of it is one fragment shader on the panel's front face (`aaPulse`: box-filtered stripe coverage from `fwidth`,
fading to the mean grey when a period drops under ~2 px). No textures, no branches around derivatives.

## Good for / avoid for
- Good for: perception and "your brain fills it in" topics, illusions, bias, "it's not what it looks like" reveals,
  pattern / signal / interference explainers (moiré = beat frequencies, aliasing), design and art-history openers,
  bold title cards that need no colour.
- Avoid for: anything with a lot of text or data (the panel is the subject), dark or moody pieces, viewers sensitive to
  high-contrast pattern (keep holds short; no strobing is used), long camera moves (fine pattern + motion = bitrate).

## Planner (`opplan.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `createPlan({ times, pattern, panel })` | the schedule (all times come from the scene's BEATS). |
| `plan.stateAt(t)` | `{ bulge: [x, y, R, A], wipe, acetate: { on, x }, dome, gridReveal, flip, back }` — exactly the shader uniforms. |
| `plan.bulgeAt/wipeAt/acetateAt/domeAt(t)`, `ringIn/ringFlip/ringBack(k)` | the parts. |
| `plan.fringes`, `plan.alignAt` | exact times the sheet offset crosses a ring period (every band moves one fringe) / zero. |
| `plan.events()`, `opVoices(spec.sound)` | sound events -> SCORE via kit `scoreFromEvents`. |

`times` = `{ grow, growDur, start, legs: [{ t0, t1, to }], wipe, wipeDur, slideIn, glide, slideOut, gridIn, revealStep,
domeDur, flip, flipStep, flipDur, back, reveal: [t0, t1], end }`.

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `gallery(plan)` | wall + floor + panel + acetate, added to the scene; `update(t)` sets every uniform from `plan.stateAt(t)`. |
| `panel()` | the board (BoxGeometry; front face = pattern ShaderMaterial, edges white); `userData.update(state, t)`, `userData.box`. |
| `acetate()` | the clear ring sheet; `userData.update({ on, x })`. |
| `room()` | wall plane at z = 0, floor, skirting. |
| `caption()` | overlay wall label; `userData.show(text, alpha)`. |

## Sound palette
Low `pad` bed (110 Hz, fifth + octave, 900 Hz cutoff) sets the mean; a low `pop` + `thud` as the bulge swells out;
`whoosh` + soft `servo` per travel leg, panned toward where the bulge goes; `whoosh` on the wipe; `paper` slides for the
acetate; a `tick` at every fringe crossing and a soft `chime` at alignment; one `marimba` note per grid ring (ascending
pentatonic on reveal and flip-back, descending an octave down on the flip); a long `whoosh`, `thud` and `chime` for the
reveal. Every time comes from the plan.

## Knobs (spec.js)
- `panel` (size, depth, standoff, height), `pattern.stripe` (period, duty), `pattern.bulge` (R, warp A, shade strength,
  light dir, duty limits, shading fade band; `shadow` = an optional cast-shadow duty term, 0 in the demo — see limits),
  `pattern.rings`, `pattern.acetate` (period, duty, glide range), `pattern.grid` (cell, lens radius, dome/tunnel
  strength, circle radii, accent rings), `pattern.nyquist`.
- Lights `fill`/`key`, materials `wall`/`floor`/`edge`, `caption`, `sound`.

## Known limits (seen while building the demo)
- Width rules: stripe period 0.0773 m ≈ 36 px and ring period ≈ 29 px at the front shot; duty is clamped to 0.3..0.7 so
  the thinnest band at the bulge rim stays ~8 px. Shrink the panel in frame or push the camera back and the stripes go
  below that; the shader then fades them to grey rather than aliasing, which reads as a soft grey patch.
- The bulge reads as a swelling "lens" more than a lit ball: vertical stripes can only show horizontal magnification.
  A cast-shadow duty term (`bulge.shadow`) was tried and dropped: its inner edge must stop at the rim, which made the
  stripes jog there. The rim kink (C0 warp) is deliberate.
- The reveal is a modest ~33° because the panel must keep ≥ ~70 % of frame width; at 45°+ a 2:1 panel only fills ~50 %.
  The flatness is shown by uniform foreshortening, the white stretcher edge and the floor, not by a dramatic side view.
- In the reveal the panel's near corner passes behind the caption card (opaque, still readable).
- Cell-reveal and flip boundaries are per cell with a hard step: during the 0.8 s waves a cell edge on the ring boundary
  can show a 1 px seam. Not visible at speed.
- The wall renders warm off-white (~#ebe6e0), not pure white, under neutral tone mapping with these lights.
- Audio levels were measured (see the demo report), not listened to.
