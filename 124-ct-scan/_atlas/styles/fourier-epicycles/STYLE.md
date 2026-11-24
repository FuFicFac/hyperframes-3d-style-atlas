# Fourier Epicycles (`fourier-epicycles`)

**Look.** A sheet of cream paper on a pale drafting table, seen from above at a slight angle in bright, warm
daylight. A brass pivot post stands on the paper. A chain of brass arms is stacked on it, each arm turning on the end
of the one before, each with its circle drawn as a thin brass ring (analytic anti-aliased ring shader with a sheen
that follows the key light). At the end of the chain hangs a coral pen with a rounded top in a thin brass clamp; its
dark nib leaves a blue-black ink line. Earlier, coarser drawings stay on the paper as faint grey lines. The arms throw
short shadows down-right. Neutral tone mapping, almost no bloom, a light vignette, no grain. One caption plate (ink
navy, brass edge, a small epicycle icon) sits bottom-centre on the overlay; labels change with a counter-wheel roll.

Motion type: exact. The pen position is a finite Fourier sum evaluated at the phase for t:
`z(p) = c_0 + sum_{j<K} c_{k_j} e^{2 pi i k_j p}`. Every arm is one term, turning at whole-number speed `k_j`; the ink
line is the same sum sampled over one turn and drawn up to the current phase (never accumulated). The phase follows a
trapezoid speed ramp in t (closed form). ART-DIRECTED parts: the songbird outline itself (hand-placed control
points), how new arms unfurl (length 0 -> r with a small overshoot, largest first), the pen lift between drawings,
the arm thickness/stacking (not mechanically realisable: arms pass through each other's rings), and the beat-5 lift
and fade. No claim of historical accuracy is made about any real epicycle machine.

## Planner (`epicycles.js`; `style.plan` / `style.motion`; THREE-free, Node-safe)
| call | what |
|---|---|
| `BIRD` | 33 control points `[x, y, "s"?]` of an original perched songbird (beak, round crown, nape dip, wingtip notch, long tail, one leg with toes), counter-clockwise, ~2 units wide. `"s"` = sharp corner (zero tangent). |
| `splineLoop(ctrl, per)` | closed cubic Hermite spline (Catmull-Rom tangents; zero at sharp points) -> dense polyline. |
| `resampleLoop(pts, n)` | n points evenly spaced by arc length. |
| `twiddles(n)` | cos/sin table for 2 pi m / n from sqrt and + - x / only (half-angle recursion, then binary products). Math.sin/cos are not used, so Node and Chrome get bit-identical coefficients. |
| `dft(points)`, `sortTerms(coeffs)` | plain-JS DFT for k = -n/2 .. n/2-1; c_0 = pivot, the rest sorted by amplitude (ties: smaller abs k, then k). |
| `termHash(plan)` | FNV-1a over k, re, im of every sorted term; the demo records it (`RUN_HASH` = 64340916) and throws on a mismatch in Node or the page. |
| `rampPhase(u, a)` | trapezoid speed profile 0..1 (accelerate, cruise, decelerate). |
| `createPlan({ stages: [{ id, K, grow, draw, ramp, samples }], scale, center, growEach })` | `state(t)` (stage, K, phase, per-arm unfurl factor), `joints(t)` (pivot ... pen tip, world XZ), `curve(i)` (stage i's closed K-term polyline), `tip(t)`, `smoothTip(t, w)`, `phaseAt(i, t)`, `curveBox(i)`, `captured(K)` (energy share), `events()` (`arm` per arm with k, r and relative size, `stroke` per drawing, `close` per finished outline), `radius(j)`, `hash`. |

Demo numbers (scale 1 m per bird unit): |c| of the first terms 0.609 (k=1), 0.219 (k=-1), 0.122 (k=-2), 0.083 (k=2),
0.081 (k=-3) m; the 60th term is 0.5 mm, the largest |k| among the first 60 is 40. Energy captured: K1 81.8 %, K3
95.7 %, K12 99.83 %, K60 > 99.99 %.

## Props (`style.props`)
| prop | what |
|---|---|
| `table({ center })` | maple table top (kit `woodTexture`, pale palette), paper sheet (kit `paperTexture` "even"), four tape corners. |
| `chain(plan)` | pivot post; ONE `InstancedMesh` of arm bars (unit box scaled to length/height/width), ONE of pivot hubs, ONE of rings (flat quad + ring shader: `aHalf` per instance, minimum on-screen line width via `fwidth`, half-width capped at `ringMaxLocal` x radius), and the pen. `update(t, { ppm, lift, alpha })`: poses everything from `plan.joints(t)`; arm width never below `minArmPx` on screen (ppm = screen px per metre at the paper); alpha fades all chain materials (transparent from the start) and the key light's `shadow.intensity`. |
| `inkLines(plan)` | one kit `screenLines` ribbon per stage, built as one 2-point polyline per phase step with explicit windows, so draw progress == phase exactly. `update(t, ppm)`: width = clamp(world x ppm, minPx, maxPx); once the next stage starts, the outline fades to grey and to `greyScale` x width. Opaque colours (normal blending) so joints never double up. |
| `caption()` | overlay plate + two text canvases (`willReadFrequently`, uploaded on redraw). `show(labels, t, { roll, lead })`: a 0.24 s counter-wheel roll clipped to the plate, finishing `lead` s before each label's time. |

## Signature motion
- One arm turns once and the pen draws a circle; more arms ride on the end of the first and the line goes lumpy;
  twelve make a blunt bird; sixty draw the bird.
- New arms unfurl largest-first from the pen end while the pen is lifted; the previous outline greys.
- Demo camera: one fitted shot per early beat (widening only as far as each drawing needs); at the end of beat 3 a
  push-in to the pen at the beak; the 48 small arms unfurl in close-up; then a camera FITTED every 0.1 s to
  everything drawn so far + pen + outer arms (distance only ever grows, smoothed), landing on the wide; slow push to
  the final shot. `scene.config.js` replays the rig and throws if the drawn line, the pen or the bird leaves the
  window above the caption or touches the badge corner.

## Sound palette (all from `plan.events()`)
- Additive tone: one `pad` partial per arm (`chord: [0]`, root = f0 x |k|, f0 196 Hz; gain ~ (r / r_0)^0.7; pan by
  the sign of k), entering as the arm unfurls, held to the end and released over the last 2.8 s. The tone gets richer
  as circles are added. Note: the kit `pad` detunes each note by +-0.4 %, so higher partials beat (a shimmer, not pure
  sines).
- `tick` per unfurling arm (48 in 0.45 s in beat 4: a ratchet), `penScratch` per drawing, a firmer `tick` as each
  outline closes, a soft `chime` when the bird closes, an outward `whoosh` as the chain lifts.
- Measured on the demo (see the final report for the last numbers), never listened to.

## Tuning knobs
- `spec.chain`: `armW`, `armWRatio`, `armH`, `minH`, `base`, `gap`, `gapK` (stack height), `hub`, `ringW`,
  `minRingPx`, `ringMaxLocal`, `minArmPx`, `post`, `pen` (r, nib, collar, collarH, above, lift), `sheenAngle`.
- `spec.ink`: `world`, `minPx`, `maxPx`, `greyScale`, `greyMinPx`, `lift`, `bias`.
- `spec.sound.partial`: `f0`, `gain`, `curve`, `attack`, `release`, `brightness`.
- Planner: the outline (`BIRD` or `opts.bird`), `n` (256), each stage's `K`, `grow`, `draw`, `ramp`, `samples`;
  `growEach` (unfurl time per arm).

## Good for / avoid for
- Good for: "complex from simple parts", approximation getting better with more terms, Fourier / frequency ideas,
  signals and compression, model capacity (more parameters, finer detail), any closed outline drawn by machine.
- Avoid for: open strokes or several separate shapes (one closed line only; pen never lifts mid-drawing), text,
  shapes with very thin spikes (they need many more terms), dark moody looks.

## Known limitations
- The arms are a visual model, not a buildable linkage: bars and rings pass through each other's planes; the stack
  height is art-directed (~0.11 m for 60 arms).
- Terms past ~30 are under 2 mm long: in wide shots they read as a small cluster at the pen, not individual arms;
  only the close-up shows them. The top-down camera hides most of the stack's depth.
- Fast arms (|k| up to 40 in ~2.8 s) alias at 30 fps (wagon-wheel) — accepted as the "chaos" look.
- Ink lines are screen-space ribbons (kit `screenLines`): they are not shaded, so an arm's shadow does not darken the
  ink or the grey lines under it.
- The grey K = 1 circle lies under the first brass ring after beat 1 and is mostly hidden by it.
- Paper fills every frame; the drafting table is only implied (it would show past a sheet edge in a wider shot).
