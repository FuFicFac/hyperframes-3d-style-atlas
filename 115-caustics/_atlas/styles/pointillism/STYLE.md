# Pointillism (`pointillism`)

**Look.** A big stretched canvas on a warm studio wall, filling the frame. The picture is made only of small round
dabs of pure, unmixed paint from a ten-hue palette (cream white, lemon, orange, vermilion, rose, lilac, violet,
ultramarine, cerulean, sky; no browns, greys or black). Each dab is a slightly irregular oval that leans the same way
as its neighbours, with a raised-dome shading from the studio window (upper left), a darker rim, a small wet highlight,
faint bristle streaks in close-up and a soft violet cast shadow beside it. Cream canvas weave shows between the dabs
(it fades out analytically once the threads are smaller than ~3 px on screen). Two round brushes (pale lacquered
handles, steel ferrules, bristles loaded with orange or ultramarine) dab on their own. No tone mapping (every lit value
is kept at or under 1, so the paint reads as designed), almost no vignette, no bloom, no grain. One caption plate
(deep indigo, lemon edge, a cluster of paint dots as its icon) sits bottom-centre on the overlay; labels change with a
counter-wheel roll so exactly one is always readable.

Motion type: art-directed. Dot placement is a seeded jittered grid; each dot's colour comes from a seeded rule
(best pair of allowed pure hues for the local scene colour, decomposed in display sRGB, plus complementary dots in
shadow) — a stylised model of divisionist colour, not a reconstruction of any painter's method. Dots pop in on a
planned schedule (ragged region fronts), brushes follow closed-form hop/press curves, and the "mixing in the eye" is a
display-space gaussian defocus whose radius is a function of t. Display-space (sRGB) averaging is how a squint is
usually simulated on screen; it is NOT a physically linear-light model of the eye (averaging lemon and cerulean in
linear light gives a paler, greyer green). No claim of historical accuracy is made.

## Planner (`dots.js`; `style.plan` / `style.motion`; THREE-free, Node-safe)
| call | what |
|---|---|
| `PAINT`, `PAINT_IDS`, `COMPLEMENT` | the ten paints (from `spec.palette.paint`, index order) and the complementary hue used in shadows. |
| `SCENE`, `sceneAt(X, Y)` | an original sunlit lake scene in canvas units (X 0..w/h, Y 0..1 up): sky gradient with soft clouds, sun disc + halo, violet hills, a lake with ripples, a gold sun-glitter column and the boat's reflection, a sailing boat (red hull, big cream mainsail, lilac jib, dotted mast), one large tree (crown = noisy union of ellipses, each leaf mass lit up-right; violet/orange trunk), a grass bank with the tree's shadow. Returns the region, a target colour + allowed paints, or an explicit two-paint mix (the crown and grass use ONLY lemon + cerulean/ultramarine), and a shade share. Only + - * /, comparisons and integer-hash value noise: identical in Node and Chrome. |
| `decompose(c, allow)` | the pair of allowed paints and weight whose mix is nearest the target (display sRGB). |
| `createPlan({ seed, regions, dabs, brushes })` | 132 x 76 row-offset jittered grid (10,032 dots): position, radius, lean, aspect, edge seed, relief, ONE palette index, region, appear time. The `dabs.times.length` dots nearest `dabs.at` are placed by two brushes (right half orange, left half ultramarine, alternating); every other dot appears when its region's ragged front (from `origin`, `gamma` shapes the speed, `jit` the raggedness) reaches it. Returns typed arrays, `order` (draw order = appear order), `dabs`, `regionTimes` (with `done`), `brushPose(b, t)` (tip x, y, height, press), `events()` (`dab`, `patter` bins, `region` completions), `hash` (FNV over times, colours, regions, positions), `stats()`, `inCrown(X, Y)`, `toMetres`, `toCanvas`. ~50 ms in Node. |

## Props (`style.props`)
| prop | what |
|---|---|
| `studio()` | warm wall (receives the canvas shadow), canvas body (stretcher depth `spec.canvas.depth`), canvas face with the weave shader (paint surface at z = 0). |
| `dots(plan)` | ONE mesh: `InstancedBufferGeometry` of quads + one `ShaderMaterial` (attributes aOff, aShape, aCol, aT). Irregular oval dab, dome normal, rim, gloss, streaks, cast shadow, analytic AA, clipped to the canvas. `update(t)` only sets `uTime`; each dab pops (outBack, `spec.dots.pop` s) at its planned time. |
| `brushes(plan)` | two brushes (lathe bristles with a vertex-colour paint load, ferrule + crimp, lacquered handle + band) and soft contact-shadow blobs; `update(t)` poses them from `plan.brushPose`, squashing the bristles on contact. |
| `defocus()` | two separable gaussian `ShaderPass`es inserted before the kit's finish pass (display space). `set(sigmaPx)`; 0 disables both. |
| `caption()` | overlay plate + two text canvases (`willReadFrequently`, uploaded on redraw). `show(labels, t, { roll, lead })`: counter-wheel roll clipped to the plate. |

## Signature motion
- Close-up: two brushes take turns dabbing orange and blue dots side by side; the dots stay separate.
- Regions flood one after another as ragged fronts of popping dabs (water out from the first dabs, sky up from the
  horizon, hills and grass from the right, then the boat and the tree during the step back, the sun last).
- The step back: a straight dolly from the glitter on the water to the whole canvas, edge just inside the frame.
- The squint: a display-space blur melts the dots into the colours the eye mixes, then sharpens again.
- Push in on the tree: its "green" is lemon and cerulean dots.

## Sound palette (all from `plan.events()` + the squint schedule)
- `pop` + soft `tick` per brush dab (panned by brush), a patter of `tick`/`pop` per 25 ms bin whose gain follows the
  number of dots popping in that bin, a `marimba` note (rising C-major pentatonic) as each region completes, a low warm
  `pad` bed, a bright `pad` that opens with the defocus, a `whoosh` for the push-in and a two-note marimba
  (blue + yellow) on the close-up. Measured, not listened to.

## Tuning knobs
- `spec.palette.paint` (the ten hues; order = palette index), `spec.dots`: `cols`, `rows`, `jitter`, `radius`,
  `radiusVar`, `aspect`, `angle`, `edgeWobble`, `relief`, `rim`, `gloss`, `shadow`, `streaks`, `lift`, `light`, `flat`,
  `pop`, `complement`. `spec.canvas`: size, depth, `weave`, `weaveAmp`. `spec.brush`: dimensions, `load`, `squash`,
  `hop`. `spec.defocus`: `taps`, `sigmaMax`. `spec.sound`: gains and notes.
- Planner: `SCENE` (composition and target colours), `ALLOW` (which paints each part may use), region timing in the
  scene (`regions`), `dabs` (spot, times).

## Good for / avoid for
- Good for: "parts that add up", perception and resolution ideas (pixels, dithering, halftone, sampling, how a display
  or a camera sensor mixes colour), anything revealed by stepping back, art explainers, colour theory.
- Avoid for: fine detail or small text (the picture has ~132 dots across), dark moody looks (the palette has no
  darks), hard-edged diagrams, fast camera moves (dense dots cost bitrate).

## Known limitations
- (filled in after the final run)
