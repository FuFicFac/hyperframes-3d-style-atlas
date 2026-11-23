# Nesting Dolls (`nesting-dolls`)

**Look.** A family of lathe-turned, hand-painted, lacquered wooden nesting dolls on a pale birch table in soft window
daylight (toy scale: the biggest doll is 2.2 m tall so the smallest, 0.6 m, still reads at 1080p). ONE lathe profile
(`nest.js` `PROFILE`, a Catmull-Rom curve) scaled by `ratio^k` makes every shell: a hollow lid, a hollow cup with a
bare-wood tenon lip and cavity, or a solid body for the smallest. The design is original to this style: a stout peg
silhouette, a cream face disc with two dot eyes, a smile and two cheeks, an accent "cap" with a scalloped edge, a
bunting collar, a beaded belt, a zigzag hem, side polka dots — and a belly **emblem of concentric rings, one ring per
doll still inside it (each in that doll's colour), around a yellow dot**. Decoration is dropped level by level
("distilled"): the smallest keeps only the face and the dot. Glossy clearcoat paint, neutral tone mapping, a gobo spot
("window", the only shadow caster) over hemisphere + sky fill, pale blue-grey wall fog, light vignette, no grain, no
bloom. Captions sit on one cream overlay pill, top centre (exact colours).

**Signature mechanic.** The nest is the plan (`nest.js`, THREE-free). From `spec.nest`:
- **shells**: `shellSections()` cuts the unit profile into lid / cup / tenon / cavity polylines; `fitReport()` proves a
  child (scaled by `ratio`) clears its parent's cavity — `createPlan` throws if it does not (0.77 leaves 0.8 % slack);
- **line-up**: `levels[k].x`, large to small along +X, centred;
- **schedule**: level k opens for `cycle * accel^k` s (2.25 s, then 13 % shorter each time): twist → lid hops off and
  is set down behind → child rises → child leans and hops aside → lid hops back → twists locked;
- **poses**: `dollPose(k, t)` (visible, x, y, lean, turn, squash) and `lidPose(k, t)` (x, y, z, turn in doll heights)
  are closed forms of t. **A child is invisible until its parent's lid lets go.** The solid doll only wiggles and
  knocks; a last wave makes every doll hop once, large to small;
- **score**: `events()` → creak (pen scratch + gritty servo), pop, lid tap, rise whoosh, landing (one marimba note of
  a pentatonic scale per level + thud), seat clack, knocks, dive, emerge, wave. Noise voices are pitched by
  `(1 / scale) ^ pitchPower`, so everything climbs as the dolls shrink. `nestVoices(spec.sound, plan)` maps them for
  `kit/schedule.scoreFromEvents`.

## Good for / avoid for
- Good for: layers of abstraction, "what's inside what", recursion, encapsulation, wrappers around wrappers, big
  model → distilled smaller models, protocol stacks, a family of sizes of one thing.
- Avoid for: anything needing numbers or text in the picture (only the overlay caption), processes with branching or
  feedback (a nest is one straight chain), more than ~8 levels (the smallest gets too small next to the biggest),
  dark or serious topics (the look is bright and playful).

## Planner (`nest.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `PROFILE`, `profileAt(s)`, `radiusAt(y)`, `outerPoints(y0, y1, n)`, `MAX_RADIUS` | the one silhouette (unit height). |
| `shellSections(nest)` | lathe polylines: `cupOuter`, `lidOuter`, `solidOuter`, `foot`, `cupInside[]`, `lidInside[]`. |
| `fitReport(nest)` | `{ ok, worst, at }`: slack between a child and its parent's cavity. |
| `createPlan(nest, { end })` | `{ levels, finale, dollPose(k, t), lidPose(k, t), dotOf(k, emblemY), cycleBox(k), dollBox(k), rowBox(), events() }`. |
| `nestVoices(SND, plan)`, `panOf(plan)` | voices and stereo pan for `scoreFromEvents`. |

## Props (`style.props`)
| prop | what |
|---|---|
| `table({ size })` | pale birch table top (kit `woodTexture`). |
| `family(plan)` | builds every doll, adds them to the scene; `{ group, dolls, update(t) }`. |
| `doll(level, n)` | one doll (shared unit lathe geometry, its own painted canvas); `userData.set(pose, lidPose)`. |
| `caption()` | overlay pill; `userData.show(text, alpha)`. |
| `cover(color)` | full-frame flat colour on the overlay (the dive cover); `userData.set(alpha)`. |
`style.helpers.lathe(points, seg)` (analytic normals, v = height, seam at the back) and `paintDoll(k, n)` are exposed too.

## Signature motion
- Twist with a little stick-slip, pop, the head is set down behind; the child rises, leans into its hop, lands with a
  damped squash wobble; the head hops back and twists locked. Each cycle is shorter and higher-pitched.
- Camera: one move per cycle, pushing in as the dolls shrink, locked during holds.
- The dive: a constant-rate (geometric) push into the smallest doll's yellow dot; a flat yellow overlay covers the
  frame for ~3 frames while the camera jumps to the biggest doll's dot, then a geometric pull-out to the whole row.
  The helper that builds those keys (`zoomKeys`) lives in the demo's `scene.config.js`.

## Sound palette
`penScratch` + gritty `servo` (wood creak), `pop` + low `marimba` (the pop), `tick` + `thud` (lid set down), `whoosh`
(rise, dive, emerge), `marimba` + `thud` (landings, one pentatonic note per level), `clack` (lid seats), `riser`,
`chime`, a soft `pad` bed. Demo levels: see the demo's `renders/checks/RUN.txt`. Measured, never listened to.

## Tuning knobs (`spec.nest`, `spec.paint`, `spec.window`, `spec.sound`)
- `count`, `ratio`, `height`, `split`, `wall`, `tenon` — the nest itself (`fitReport` guards `ratio`).
- `start`, `cycle`, `accel`, `phases` — the rhythm; `twist`, `lidPark`, `lidArc`, `hopArc`, `lean`, `squash` — the acting.
- `finale` — knocks, dive / emerge lengths, the last wave.
- `paint.detail` — which decoration survives to which level; `paint.emblem` — dot and ring sizes; `palette.dolls`.
- `window` — gobo spot: intensity, panes, bar width / softness / darkness. `materials.table.baseColor` sets how
  bright the sunlit table is (kept below clipping so shadows read).

## Known limitations
- The parts move by rule, not collision: the lid passes through the rising child for a few frames on its way to the
  park spot, and a hopping child can graze its parent's rim. Nothing holds the lid — it hops by itself.
- The dive is a hidden cut under a flat colour, not a continuous move; the smallest dot's texture is soft in the last
  frames before the cover (4096 px canvas for the first and last doll, 2048 for the rest).
- Paint is a canvas wrapped by height: shapes are width-corrected at their centre only, so big motifs stretch a
  little where the radius changes, and everything on the crown converges at the pole.
- The lid's park spot is behind the cup, so from a low front camera it is partly hidden by the rising child.
- The gobo's window bars are soft dark bands on the table; they are fixed, so a doll can stand in a band.
- Line-up is large-to-small only, in one row; the smallest doll is 27 % of the biggest and stays small in a full-row shot.
