# Fogged Glass (`fogged-glass`)

**Look.** A steamed-up window pane in a wooden frame. Behind it sits a bright sunrise town (blue-violet sky, coral horizon,
striped balloons, a lit skyline, a river, lamps, roofs) that the condensation turns into milky colour blobs and bokeh
discs. An unseen finger writes in the fog: through the wiped strokes the scene is sharp, each stroke has a lit/shaded
water rim, drops gather under the strokes and run down leaving clear trails, and the fog creeps back over the oldest
strokes (they narrow and cloud over in soft patches). A palm sweep clears the pane and the scene fills the frame.

**Good for.** "What is kept / what is forgotten" stories (context windows, memory, caches, attention), reveals of a
hidden picture, handwriting a few big words, before/after. **Avoid for** dense text (the finger is ~40 px wide; 3 words
of 3–6 letters fill a frame), precise diagrams, anything that needs numbers.

## Files
- `spec.js` — palette, pane, fog, drop, scene-painting colours, caption chip, sound levels.
- `fogplan.js` — **the planner (Node-safe)**: `createPlan({ words, finger, palm, drips, extraDrops, seed, end })`,
  `fogVoices(spec.sound)`, `PANE`, `MAX_DROPS`. Exposed as `style.plan` / `style.motion`.
- `style.js` — `createStyle(stage)`; props below.

## The mechanic
Plan space is 1920 × 1080 units across the pane (x right, y down). Every wipe (finger stroke, drip trail, palm pass) is
a polyline whose points carry `t` (when it was wiped) and `f` (when the fog starts to return there):

`clear(t, pixel) = max over wipes of [t ≥ p.t] × (1 − smoothstep(p.f, p.f + fade, t))`, inside a width that narrows to
40 % while it fades. `plan.segmentsAt(t)` lists the live segments; the style redraws a 960 × 540 mask canvas from that
list every frame with `lighten` compositing (= max) and uploads it immediately. Nothing is accumulated; `plan.clearAt`
is the hard-edged reference. Words are laid out with the kit stroke font, slanted, jittered and timed at constant finger
speed (pen-up hops cost 0.45 × their length). A word's `fogAt` / `fogSpread` / `fade` say when it is forgotten.

Drips: a bead gathers under the lowest point of a stroke, lets go at `t0` and runs
`s(τ) = v (τ − k/ω (sin(ωτ + φ) − sin φ))` (stick-slip, monotonic for k < 1) along `x0 + wobble table(s)`; the time at
each trail point comes from bisection, so the trail is one more timed polyline. The palm kills beads it passes over.
`plan.revealAt(t)` burns off the last fog in patches after the palm.

The scene is painted once (2048 × 1152) and baked once more as the fogged view (one canvas blur + milk + bokeh discs at
the scene's lights): there is no per-frame blur. The shader mixes the two by the mask, breaks the boundary into beads
(threshold wobbled by fine beads + a mid-size fbm "mottle", so a fading stroke clouds over in patches; the post-palm
burn-off is applied after that threshold, with its own smooth fbm edge),
adds the refracting rim, the wet sheen, lens drops (inverted mini-view of the scene) and perspective-correct parallax
(the scene sits `pane.backdrop` metres behind the glass).

## Props
| prop | what |
|---|---|
| `windowSet(plan)` | pane + frame + wall + sill, added to the scene; `update(t)` |
| `pane(plan)` | the glass mesh (3.2 × 1.8 m, XY plane); `userData.update(t)`, `userData.uniforms`, `userData.lights` |
| `frame()` | wooden bars (kit `woodTexture` grain baked once, `spec.woodGrain`; turned 90° on the uprights), wall, sill |
| `caption()` | overlay chip; `userData.show(text, alpha)` |

## Signature motion
Finger writes (ease in/out per stroke) → drops gather and run → oldest word narrows and fogs over in writing order →
palm sweeps two arcs → patches evaporate → slow push on the clear view with fat drops running down.

## Sound (all from `plan.events()`)
`squeak` per finger stroke (`servo` glide + `penScratch` rub), `plink` when a drop lets go (`bubble` + `marimba`),
`refog` (soft `whoosh`), `palm` (`whoosh` + low `servo`), `reveal` (`chime` + bright `pad`), warm `pad` bed.

## Tuning knobs
`fog.milkAmount` (how white the fog is — the fogged/wiped contrast), `fog.blur`, `fog.bokeh.gain`, `fog.bead.edge`
(how far beads + mottle break up an edge / a fading stroke), `fog.wiped.residue` (fog specks left in old strokes),
`woodGrain`, `fog.rim.*`, `drop.lens`, `pane.backdrop` (parallax), `finger.width`, per-word
`fogAt/fogSpread/fade`, `drips.{chance,perWord,speed,length,stick}`, `palm.passes`.

## Decisions made without asking
- Words START / MIDDLE / NOW in three staggered rows (cap 222 units) rather than one small line.
- No visible finger or hand (the brief says unseen); the palm is only its wipe.
- The beads of a forgotten word shrink away with it (reads cleaner than orphan drops).
- Tone mapping `none`: the pane is an unlit picture and should come out as painted.

## Known limitations
- The scene is a flat painted backdrop: parallax moves it as one layer, nothing in it is animated.
- Fading strokes cloud over in soft patches; zoomed in, the fog grain itself still shows the value-noise cell (a faint
  ~4 px checker). Earlier the fade was a hard pixel dissolve and the burn-off edge blocky — both fixed in the shader.
- GLSL note: `patch` is a reserved word in GLSL ES 3 (the shader silently failed to compile with it as a variable name).
- The mask is 960 × 540: stroke edges are soft at ~4 px; fine for finger writing, too coarse for hairlines.
- At most 20 beads at once (`MAX_DROPS`, a fixed shader loop); `drips.max` + `extraDrops` must stay under it.
- Letters over the palest part of the scene (gold horizon) have less contrast with the fog; the rim keeps them readable.
- The fogged bake uses the 2D canvas `filter: blur()` (CPU canvas); identical across runs on this Mac, untested elsewhere.
- Squeaks are a `servo` glide, measured not heard: they may read as a synth chirp rather than skin on glass.
