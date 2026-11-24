# Granular Sorting (`granular-sorting`)

**Look.** A bright kitchen-lab at toy scale (the jar is 3.3 m wide, about 15x a real bench jar, so one bead reads at
1080p). A clear, straight-sided, flat-fronted glass jar, one bead layer deep (inside depth = one red bead), with bright
glass edge rods, a thick glass base and a brushed aluminium lid rail, clamped by two aluminium corner blocks to the
platform of a small white lab shaker (teal trim, dark control strip with a knob and three LEDs). Pale speckled stone
counter, sage half-offset tiled wall. The jar holds 480 small cream beads (instanced, slight tone variation, seeded
depth jitter) and twelve large glossy red ones (2.3x the radius). Neutral tone mapping, room environment, warm key from
the front-left, cool rim, light vignette, no bloom, no grain. Thin dark halo rings mark the red beads; dark red
screen-space trails draw their climb; cream beads that slip under the watched bead turn amber. One white overlay caption
plate, top centre, with a tiny bead-heap icon.

Motion type: numerically simulated rest states, drawn transitions. Every bead's position after every tap comes from a
seeded 2D Monte Carlo tap-and-settle simulation in `shaker.js` (the classic lift-then-resettle model of shaking used to
study the "Brazil nut" effect, not a force/contact DEM): each tap lifts the bed and loosens it (each bead rises by
`lift + dilate x height`), then 40 passes visit the beads lowest first and try small random moves that may only go down
or sideways and may never overlap another bead or the jar (hard discs). Small beads find room in the gaps under large
ones far more often than a large bead finds a gap its size, so the large ones ratchet up. Nothing is tuned toward the
answer: the plate simply stops at the first tap after which all twelve red beads stay uncovered (tap 47 in the demo).
It runs once at load (about 0.6 s in Node on the M1 Pro), never inside `renderAt`. The motion BETWEEN stored rest
states is drawn, not simulated: in a real-time tap the bed rises with the platform (scaled to 0.35 of the model's lift
so the hops stay "tiny"), then falls back lowest first, gliding sideways into the next rest state (vertical like a
fall, sideways eased); in the fast forward each tap is one quick eased step. A force-based DEM (spring-dashpot contacts,
gravity, sinusoidal/tapped floor) was tried first and rejected: too slow to sort within the 3 s load budget and too
soft (20-30 % overlaps on landing).

## Planner (`shaker.js`; `style.plan` / `style.motion`; THREE-free, Node-safe, imports only kit/time.js)
| call | what |
|---|---|
| `simulate(spec.sim)` | the run: `{ N, nL, r, W, taps, xs, ys (Float32Array, (taps + 1) x N rest positions), summary[], moves, sim }`. Seeded placement (red beads in stratified height bands), settle, then `taps` lift-and-resettle cycles. Throws if a bead cannot be placed. |
| `overlapAudit(run, every)` | worst pair overlap over stored states (0 by construction; checked in scratch: 0.00). |
| `coverOf`, `uncoveredCount`, `sortedTap(run, from, hold)` | how many cream beads sit above a red one; the first tap after which every red bead stays uncovered. |
| `arrivals(run, i, c)`, `pickFocus(run, c0, c1, margin)` | cream beads newly under red bead i after tap c; the red bead that best shows the gap-filling rule over a tap window (rise + 1.5 x arrivals, away from walls, mid-bed). |
| `smoothTrail(run, i, end, half)` | moving-average rest path for the drawn trail. |
| `runHash(run)`, `nthRoot(a, n)` | bit-exact hash of every stored position (Node vs browser gate); exact-arithmetic root for the move-size schedule. |
| `createPlan(run, schedule)` | playback: `phase(t)`, `positions(t, X, Y)`, `plate(t)`, `focus`, `focusPos(t)`, `trails`, `arrive`/`arriveT` (tap/time each red bead reaches the top), `tapTime(c)`, `uncovered[]`, `sortedShare(t)`, `events()`; `schedule = { taps: [{t, dur}], fast: {t0, t1, slope}, hop, focus: {c0, c1, margin}, end? }`. |
| `layout(spec)` | metres: inside floor, inside width/height/depth, outer box, `toWorld(x, y)`. |
| `shakerVoices(spec.sound)` | voices for `kit/schedule.scoreFromEvents`: `tap` (dry rattle: short `paper` crackle + low `thud` + seeded `click`s, brighter with the share of red beads on top, quieter/shorter in the fast forward), `stop` (soft marimba). |

Demo run: 492 beads, 64 taps simulated, 47 shown (9 real-time + 38 strobed). Uncovered red beads by tap:
0,1,1,2,3,4,4,4,4,4,5 ... 9 (tap 21) ... 10 (31) ... 12 (47). Focus bead 3 rises 6.4 small radii over taps 6-9 with 5
cream beads arriving beneath it.

## Props (`style.props`)
| prop | what |
|---|---|
| `rig(plan, { highlight })` | builds and adds everything; `{ group, platform, beads, rings, trails, update(t, { ringStart(i), trailLevel(i), highlight(j) }) }`. |
| `set()` | speckled stone counter (top y = 0) + sage tiled wall (canvas tile texture, half-offset rows). |
| `shakerBody()` | white rounded body, teal trim, rubber feet, dark control strip, chrome knob, three LEDs (lit while shaking). |
| `jarGlass()` | moving platform, glass base, four panes (opacity 0.035, env 0.25), twelve edge rods, lid rail, corner clamps. |
| `beads(plan, { highlight })` | two InstancedMeshes (480 cream at 22x14 segments, 12 red at 44x28); `update(t, hi)` writes every matrix from `plan.positions`; listed cream beads tint toward `spec.highlight.color` (instance colour = target / base, linear). |
| `rings(plan, beads)` | 12 halo rings (depthTest off) that grow and fade around a red bead; `update(t, startOf(i))`. |
| `trails(plan, beads)` | one `screenLines` mesh (capacity 12 x (end + 2) segments) rewritten from t each frame: the smoothed rest path up to the current tap + the live bead, frozen at the tap it reached the top. |
| `caption()` | overlay plate; `userData.show(text, alpha)` (the plate stays up, only the text fades). |

## Signature motion
- Beat 1: dark halo rings pop around the twelve red beads bottom to top ("at every height").
- Each real-time tap: platform bump, the bed rises (higher beads more), falls back bottom first; the plan's next rest state.
- Close-up on the focus bead: its trail grows under it; the cream beads that slip into the gap under it turn amber as each tap lands.
- Fast forward (the wow): the camera pulls back from the close-up while the taps accelerate (about 4 to 20 per second);
  red trails rise like roots behind every climbing red bead and fade once it reaches the top.
- The plate stops; halo rings sweep across the twelve red beads now all on top.

## Sound palette
Per tap: `paper` crackle (density 0.7) + `thud` (pitch 1.6) + 9 seeded `click`s spread over 0.16 s, all pitched up to
1.55x as more red beads reach the top; fast-forward taps: 3 clicks, half gain. Rising `marimba` blips for the opening
rings, a bright marimba arpeggio for the final rings, a soft marimba chord at the stop, `whoosh` in/out on the two camera
moves, a warm `pad` bed (G2 open voicing, 700 Hz). Demo measured: mean -23.2 dB, max -2.7 dBFS (scratch runs; see the
final report for the last run). Measured, never listened to.

## Tuning knobs (`spec.sim`, `spec.hop`, `spec.sound`)
- `sim.width/small/large/bigR` (jar and bead counts; keep `width x bed height` near 16:9-friendly), `sim.lift/dilate`
  (shake strength: higher sorts in fewer taps, looser bed), `sim.sweeps/tries/step` (settle quality vs load time),
  `sim.taps` (must exceed the sorted tap), `sim.seed`.
- `hop.vis` (drawn hop height as a share of the model's lift), `hop.up/stagger/fall`, `hop.plate/plateShare`,
  `hop.fastStep/fastHop`. Scene: `SCHEDULE.taps`, `fast.slope` (starting rate share), `focus.c0/c1`.
- `trails.width/color/z`, `rings.*`, `highlight.color`, `glassLook.env`, `jar.unit/innerH/zJitter`.

## Good for / avoid for
- Good for: accumulation and uneven outcomes, emergent order with no designer, "small repeated pushes add up",
  selection effects, sorting by size, Matthew-effect and sedimentation metaphors, how granular things behave.
- Avoid for: anything needing exact physical rates (taps-to-sort here depends on the model's lift/dilate, not on a real
  shaker), fluids, dark or sombre topics, single-object stories (the look is a crowd of beads).

## Known limitations
- 2D model: one bead layer; the cream beads' depth jitter is look only. Hard discs with no friction, no inertia and no
  convection rolls; the sorting is the Monte Carlo void-filling mechanism only. Packing is loose (about 0.75 area fraction).
- Taps-to-sort (47) and the per-tap rise follow from `lift`/`dilate`, chosen so it sorts inside a 15 s demo; real jars
  take far more taps.
- Positions between rest states are interpolated (hop drawn at 0.35 of the model's lift); beads may pass close to one
  another mid-fall (rest states never overlap).
- Surface red beads wander sideways between taps (nothing holds them); the trails stop at each bead's arrival tap so the
  wander does not scribble; a frozen trail end can sit a little away from its bead before it fades.
- The simulation is re-run at every page load and in Node (render-sfx/export-spec): about 0.6 s each. Node (sound) and
  Chrome (picture) must produce the same run to the bit: with `Math.pow` in the move-size schedule they did not
  (hashes 3aca5bec vs 237f3969 — a last-bit difference flips Monte Carlo accept/reject). The schedule now uses
  `nthRoot` (Newton, + - x / only) and repeated multiplication; both give `404ce3de`. `runHash(run)` (FNV-1a over the
  float32 bits) is checked against `RUN_HASH` in scene.config.js and throws in either environment on a mismatch (the
  browser throw fails `hyperframes check` as a page_error; `GS_RECORD=1` skips the Node throw to re-record). Change
  `spec.sim` -> re-record the constant. No other transcendental call feeds the simulation (sin/cos only shape the
  drawn hop and plate per frame; `Math.sqrt` is exactly rounded).
- Kit candidates: none promoted. A generic "instanced bead field from a stored run" helper and per-instance highlight
  tinting (target / base colour) could serve other particle styles.
