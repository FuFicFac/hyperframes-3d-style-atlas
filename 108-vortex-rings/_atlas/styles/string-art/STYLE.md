# String Art (`string-art`)

**Look.** An upright, mid-walnut board (5.4 x 3.0 m, toy scale; horizontal planks from the kit wood texture with visible
grain, slim moulded frame) brightly lit by warm workshop light from the upper left plus a cool front fill. Rows and a ring of brass nails stand proud of the face and throw short shadows. Saturated cotton
thread (lemon-gold, turquoise, magenta, lime; 25 mm thick so it reads in the full-board shot; albedo kept a little below
white so lit thread stays saturated instead of going pastel under tone mapping) is wound nail to nail; every
thread is perfectly straight, yet together they draw smooth curves. Threads stack in winding order, cast thin shadows,
carry a soft sheen and a touch of self-light so they keep their hue in shadow. A steel needle with a glowing bead of the
thread colour draws each thread up to the current point; a small wrap ring appears round each nail it turns on. Neutral
tone mapping keeps the thread colours as designed. A cream caption tag (top-left, overlay, exact colours) carries a brass
nail dot and a thread tail in the current colour.

**Signature mechanic: curve stitching** (`winding.js`, THREE-free, shared by picture and sound):
- `layoutBoard` lays out nails from plain data: parabola **fans** (two nail rows from a corner, n intervals each; arms `L`, or
  unequal `Lu`/`Lv` — a ~3:2 fan fills a 16:9 frame far better than a square one) and nail
  **rings** (N nails on a circle), deduplicating shared nails;
- fan thread i joins row-V nail n-i to row-U nail i, so the envelope is a parabola tangent to both rows. `fanSegs` gives
  them as separate strands (the needle hops between them, starting at the end nearest the last one — used for the
  "refine the curve" story: one thread, then every third, then the rest, each growing outward from the middle thread) or as one continuous zigzag thread with short
  runs along the nail row;
- ring figures are chords m -> 2m mod N. With N odd, doubling is a permutation, so the chords split into closed cycles
  (N = 73: eight cycles of nine) and each cycle is wound as ONE continuous thread, like real string art;
- a **run** = one needle laying a segment list between t0 and t1; time is spread by length (constant needle speed) plus a
  cost per hop; the run's ease applies inside each segment (eased when slow, linear when fast). Threads get their height
  from global winding order (`z0 + order x dz`), so crossings layer correctly;
- the picture reads `plan.threadAt(i, t)` (drawn fraction) and `plan.tipAt(winder, t)` (needle point, direction, fade);
  SCORE reads `plan.events()`: a pluck per thread (pitch rising with its index in the run, on a pentatonic ladder; dense
  runs thin to every 2nd/3rd thread and soften, ticks for the rest), a tick per needle lift and run start.

## Good for / avoid for
- Good for: "many simple parts add up to something smooth" (neural networks as sums of straight pieces, Fourier-style
  build-ups, approximation, ensembles, crowdsourcing), maths-made-visible explainers, craft and patience, calm process
  shots, before / few / many refinement arcs, logo-ish reveals built from lines.
- Avoid for: text-heavy content (caption only), organic or soft subjects, fast cuts, anything that needs curved strands
  (threads are always straight), data with exact numbers.

## Planner (`winding.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `layoutBoard(spec.layout)` | `{ nails:[{ id, p, group }], fans:{ id: { rowU, rowV, ... } }, rings:{ id: { ids, ... } }, P(id) }` |
| `fanSegs(L, fanId, indices, { mode })` | parabola threads, `"separate"` (hops) or `"zigzag"` (continuous, arm runs) |
| `ringCycles(L, ringId, mult = 2)` | closed cycles of k -> mult*k mod N (throws if not a permutation: use N coprime to mult) |
| `ringSegs(L, ringId, { mult, order })` | the cycles as segments, continuous inside a cycle, a hop between cycles |
| `createPlan(spec, L, runs)` | `{ threads, hops, runs, winders, threadAt(i, t), tipAt(w, t), events(), n }` |
| `stringVoices(spec.sound)` | voices for `kit/schedule.scoreFromEvents` |

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `board()` | stained board (front face z = 0), frame strips, the wall behind (z = `board.wallZ`). |
| `nails(L)` | two InstancedMeshes (shaft, head) with a seeded hair of tilt. |
| `threads(plan)` | one InstancedMesh of open cylinders; `userData.update(t)` draws every thread to its fraction. |
| `wraps(plan)` | instanced rings round nail shafts where threads turn on / start; pop in over 80 ms. |
| `needles(plan)` | one steel needle per winder, leaning back against its motion, glowing bead at the point. |
| `caption()` | overlay tag, `userData.show(text, alpha, threadColour)`. |

## Sound palette
`pluck` (Karplus-Strong) per thread from 196 Hz up a two-octave pentatonic ladder as a run progresses, softer and
shorter in dense runs; `tick` for needle lifts, run starts and thinned threads; a `whoosh` on the pull-back; a `chime`
when the last thread is tied off. Bed: a quiet C `pad` (brightness 820 Hz). Measured, not listened to.

## Knobs (spec.js)
- `board` (size, frame, wall distance), `wood` (planks, grain frequency/warp, contrast) + palette wood tones.
- `nail` (shaft/head radius, height), `thread` (radius, z0, dz layering, wrap ring size, glow), `needle` (length, tilt,
  lift on hops, bead size/glow, fade in/out).
- `layout.fans` (corner, row directions, arm length L or Lu/Lv, intervals n, colour), `layout.rings` (centre, R, N odd, phase =
  where nail 0 and therefore the cardioid cusp sits).
- `sound` (bed, pluck base/decay/brightness/ladder, tick and whoosh gains). Palette: three thread colours, brass, tag.

## Known limits (seen while building the demo)
- Threads never sag or vibrate; they are rigid cylinders (by design: "every thread is straight"). The wraps are rings,
  not modelled turns, and continuous threads change height by a hair at each nail.
- Very dense runs (17+ threads/s) make the needle zip; it reads as weaving, not as individual threads.
- Beats 1-3 use a follow camera (in the demo's scene.config.js) that fits the box of the threads laid so far and slides
  inside the board; the full 3:2 fan then fills ~75 % of the frame width. A square fan would only fill ~half.
- At oblique camera angles the board's far edge comes into frame quickly (the board is only ~16:9), so the fan shots are
  near straight-on; the 3D read comes from the raking close-up and from the thread/nail shadows.
- Bright, light thread colours go pastel under neutral tone mapping in this light; the thread albedo is #c4c4c4 x colour.
  An orange-yellow thread nearly vanished against the mid-brown wood: keep thread hues away from the wood's hue.
- The top-left corner of the final board stays empty wood for the caption tag.
- Fonts: the caption names Avenir Next (macOS system font); other systems fall back to Helvetica / Arial.
