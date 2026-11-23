# Flipbook (`flipbook`)

**Look.** A hand-drawn pencil flipbook on a warm, bright wooden desk. A pad of cream paper (1.6 x 1.0 m pages, toy-scale
so a pencil line ~1.5 cm wide reads at 1080p) lies on a chipboard back, clamped along its far edge under a walnut bar
with two brass screws. Most pages are bent back over the bar in a fan, their free edges pinched by a stylised thumb.
Every page carries its own graphite drawing: bold soft-edged lines with paper-tooth grain, light construction circles,
crosses and arcs, diagonal hatching, smudges, and a pencil page number in the corner. A yellow hex pencil can finish a
line on the first page. The caption is a strip of masking tape with pencil-dark text on the overlay (exact colours).

**Signature mechanic.** Pages riffle under a thumb, and the drawings come alive (`riffle.js`, THREE-free):
- **release plan**: explicit slow release times + a piecewise-linear rate curve `[[t, pagesPerSec]]` integrated at 1 ms
  (one page per whole-number crossing). Flip duration comes from the local rate (`flip.slow` .. `flip.fast`);
- **page shape** = hinge angle `phi` + uniform bend `kappa` + corner twist, integrated along the page from the binding
  every frame (`bendPage`), clamped so a page never passes through the stack or the desk;
- **held** pages fan back over the bar (hinge angle steps per rank, free edges pinched near one angle); the inner page
  slips out first, flicks straight, falls toward the viewer with its free edge lagging, slaps flat, bounces once, settles;
- **drawings**: page k = drawing k from `drawingFor(k)` (polylines in page units). Line boil: every stroke is displaced by a
  smooth page-seeded wobble, so the drawing shimmers like real hand-drawn animation;
- only the settled top page and the airborne pages show a drawing; they paint into a pool of canvases (slot = k mod pool),
  repainted only when the slot's page changes and uploaded right after the redraw. Pages below the settled top are hidden
  and replaced by a block whose height grows with the landed count;
- **sound** from the same plan: a thumb `tick` per release, a `paper` slap per landing (slow pages add an air `whoosh` and a
  soft `thud`), a `marimba` note when a page carrying a bounce contact lands, a `chime` when the wings appear, `penScratch`
  for the opening pencil stroke.

The demo story (original): a ball bounces twice, sprouts wings at the top of the third hop, becomes a round bird, loops
round the page and flies off the top right, dropping a feather that drifts down to the ground line.

## Good for / avoid for
- Good for: "how animation works", frames per second, persistence of vision, iteration ("one small change per page"),
  sketch-to-life reveals, origin stories, creative process, playful explainers, kids/education topics.
- Avoid for: text-heavy content (drawings are line art only), data, long holds on one image (the point is motion),
  photoreal looks, dark moods.

## Planner (`riffle.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `createRiffle({ slow, rate, stopAt, flip, bounce, held, fall, pool })` | the release plan: `pages[k] = { release, flip, land, settle }`; throws if more pages are visible at once than `pool`. |
| `plan.pageState(k, t)` | `{ mode: "flat"|"held"|"air"|"buried", phi, kappa, twist }` (closed form of t). |
| `plan.drawnRange(t)`, `plan.settledTop(t)`, `plan.releasedCount(t)`, `plan.thumbPulse(t)` | which pages show drawings; thumb flick. |
| `bendPage(state, { W, D, nx, ns, y0, z0 }, out)` | vertex positions of one bent page. |
| `poseAt(k)`, `drawingFor(k, { last, boil, lineW })`, `STORY` | the character on drawing k; the page's strokes, smudges and `finishStroke`. |
| `events(plan, { pencil })`, `riffleVoices(spec.sound)` | release / land / contact / wings / pencil events -> SCORE via kit `scoreFromEvents`. |

To draw a different story, replace `poseAt` / `drawingFor` (keep them pure and indexed by page).

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `flipbook(plan, { thumbX })` | everything: desk, board, landed block, clamp bar, every page, pencil, thumb; `update(t, { progress, pencil: { on, p, lift, out } })`. |
| `pencil()` | yellow hex pencil, tip at the origin. |
| `thumb()` | stylised thumb (capsule + nail), pad tip at the origin. |
| `clampBar(topY)`, `desk()` | set pieces. |
| `caption()` | overlay masking-tape caption, `userData.show(text, alpha)`. |

## Sound palette
`tick` (release), `paper` (slap), `whoosh` + `thud` (slow pages), `marimba` (bounce contacts, C5/E5/G5), `chime`
(wings), `penScratch` (pencil), a warm `pad` bed (root 196 Hz, open fifths, brightness 850 Hz), two camera whooshes.
All event times come from the plan.

## Knobs (spec.js)
- `page`: size, stacking thickness, bend grid, canvas size, pool size.
- `drawing`: line width, boil amplitude, graphite passes, grain, colours, paper fibre.
- `flip` (slow/fast durations and the rates they map to), `bounce`, `held` (fan angles, pinch angle), `fall` (lag, twist, accel).
- `pencil`, `thumb`, `bar`, `desk` wood, lights `key`/`fill`/`rim`, `caption`, `sound` gains.

## Known limits (seen while building the demo)
- Pages are zero-thickness sheets; the held fan reads as a bent bundle, not as countable sheets, and its free edges are
  only roughly pinched under the thumb (the thumb is stylised and does not deform).
- Mid-flight pages partly cover the page below while they fall; in the close-up the new drawing arrives as a wipe from the
  top edge rather than a clean cut (this is also how a real flipbook looks, but it softens the 12 fps read).
- Each visible page repaints a 2048 x 1280 canvas when it enters the drawn range; seeking at random (checks) repaints all
  of them — fine for 15 s renders, slow for scrubbing.
- Drawings are polylines; there is no pressure taper along a stroke (passes + grain fake the graphite).
- In the demo the thumb sits at the fan's free edges, which are above the top of frame in every shot once the page is
  framed large — so the thumb is effectively unseen; the held fan reads as a tall blank wall of page backs behind the bar.
  Frame higher (or lower `held.free`) if the thumb must show, at the cost of a smaller page.
- The bird's downstroke wing crosses its hatching; at 12 drawings a second it reads, frame by frame it is busy.
- Audio levels were measured (demo sfx.wav mean -22.4 dB, peak -2.3 dBFS; MP4 mean -22.5 dB, peak -2.6 dBFS), not listened to.
