# Galton Board (`galton-board`)

**Look.** A Galton board (bean machine) standing on a bright oak desk against a pale wall: a glass-fronted maple frame
(6.3 m wide, toy-scale so a 0.14 m ball reads at 1080p), an enamel-blue backboard, a triangle of 78 brass pegs between
two maple guide rails, a walnut hopper with a brass spout, cream bin dividers and polished steel balls (one red
"tracer"). Window daylight from upper left throws peg and ball shadows down-right on the backboard. A red enamel bell
curve is drawn on the glass over the finished stacks. A notebook, pencil and a few coins dress the desk. Captions are
one cream overlay chip, top-left (the peg triangle leaves that corner of the board free).

**Signature mechanic: a seeded, precomputed ball plan** (`plinko.js`, THREE-free, shared by picture and sound):
- each ball gets a release time (gaps ease from 0.65 s to 0.08 s) and one left/right choice per peg row
  (`hash01(seed, ball, row) < pRight`), so its bin is known before it moves;
- its path is closed form: drop from the spout onto the apex peg, one parabolic hop per row (duration and arc height
  jittered per hop; the first few balls are slower so one ball can be followed), a ballistic fall into the bin that
  clears the divider first, two small bounces, rest;
- stack slots are handed out in arrival order per bin, three abreast (column order shuffled per row), and a ball never
  lands before the ball under it — the histogram grows ball by ball and never rearranges;
- every peg keeps its sorted hit times: a struck peg flashes (instance colour) and swells for ~0.1 s;
- `events()` lists every release, peg hit and landing; SCORE = `scoreFromEvents(events, galtonVoices(...))`: a click
  per release, a tick per peg hit (pitch falls a little per row), one marimba note per BIN (pentatonic, left to
  right) + a click per landing — so the centre notes sound most often;
- `bellCurve()` gives the normal outline (binomial mean and sd, in metres of stacked balls) that the curve prop draws.

## Good for / avoid for
- Good for: probability and distributions, "randomness adds up to a pattern", sampling and sample size, the central
  limit idea, noise vs signal, how an LLM picks the next token (many weighted coin flips; set `plan.pRight` off 0.5
  for a skewed pile), A/B-test intuition, risk.
- Avoid for: exact statistics (one seeded run, not data), anything text-heavy (one caption chip), stories that need
  several different objects, fast cuts (the board wants slow frontal moves).

## Planner (`plinko.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `layout(spec.board)` | pegs `[{ id, row, j, x, y }]`, `binX(b)`, `dividers`, `rowY(k)`, spout / hopper / floor heights, `inner` / `outer` boxes, `slot(b, m)`. |
| `createPlan(spec, overrides)` | balls (`t0`, `choices`, `js`, `tHit`, `bin`, `slot`, `tLand`), `histogram`, `maxStack`, `lastLand`. |
| `plan.pos(i, t)` | `[x, y, z]` or `null` before release. |
| `plan.pegGlow(pegId, t)` | 0..1 flash of a struck peg. `plan.counts(t)`, `plan.landed(t)`. |
| `plan.events()` | `release` / `peg` / `land` events sorted by time. |
| `bellCurve(spec, n, samples)` | `[[x, y]]` normal outline of the expected stacks. `binomial(rows, p)`. |
| `galtonVoices(spec.sound, layout)` | voices for `kit/schedule.scoreFromEvents`. `releaseTimes(plan)`. |

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `board()` | frame, backboard, dividers, guide rails, hopper + spout, instanced pegs, glass; `update(plan, t)` flashes struck pegs. |
| `balls(plan)` | one InstancedMesh of steel spheres; `update(t)` poses them from `plan.pos` (scale 0 before release). |
| `curve(points)` | red enamel tube on the glass; `userData.setProgress(u)` draws it left to right. |
| `desk()` | oak desk, wall, notebook + pencil, coins. |
| `caption()` | overlay chip, `userData.show(text, alpha)`; top-left. |

## Signature motion
Balls only. Frontal camera: hopper close-up, the peg field, the bins, the whole board, then the finished stacks filling
the frame while the curve is drawn; the camera is locked during holds.

## Sound palette
`click` at each release, a dense rattle of quiet `tick`s (one per peg hit), `marimba` + `click` per landing (one note
per bin), `penScratch` while the curve is drawn, a `chime` when it closes. Bed: a quiet C `pad` (brightness 800 Hz).

## Knobs (spec.js)
- `board`: rows, peg pitch `dx` / row pitch `dy`, peg and ball radius, `cols` abreast per bin, divider height, gaps,
  hopper and frame sizes, guide rails.
- `plan`: `seed`, `n`, `pRight` (bias), release gaps, hop time / jitter / arc, fall gravity, bounce, z jitter,
  flash decay, `tracers` (red balls).
- `peg.flash` / `peg.swell`, `glass`, `curve`, `wood`, palette, `caption`, `sound`.

## Known limits (seen while building the demo)
- Nothing is simulated: balls do not collide with each other. In the dense stream near the apex they overlap for a
  few frames (z jitter hides some of it), and a ball always lands exactly on top of a peg.
- The demo seed (279) was PICKED from seeds 1–400 for the histogram closest to the binomial; other seeds give lumpier
  piles (which is also the honest point of the board). Treat the pile as sample data; no numbers are shown.
- `binH` must hold the tallest stack: `ceil(maxStack / cols)` ball diameters (the plan reports `maxStack`; nothing
  checks it for you). With 100 balls and 3 abreast the centre bin reaches 9 rows.
- The hopper is an opaque block: there is no visible reservoir of waiting balls, they simply appear in the spout.
- The board is nearly square (6.3 x 5.4 m), so a whole-board shot fills only ~55 % of the frame width; the demo's
  final shot frames the bins and lower peg rows instead, which fills it.
- The caption chip sits over the left guide rail / a few pegs in the close shots.
- The glass is a faint fresnel pane with no real reflections or refraction; pegs are plain cylinders.
- 1300 sound events (ticks) render in a few seconds; many more balls would make the rattle a continuous noise.
