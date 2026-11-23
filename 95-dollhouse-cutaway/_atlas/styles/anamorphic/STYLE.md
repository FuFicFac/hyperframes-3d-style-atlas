# Anamorphic Illusion (`anamorphic`)

**Look.** A bright, pale gallery room (warm off-white walls, a lit ceiling, a floor of large pale concrete tiles, skirting
boards). Dozens of chunky painted rods — bent slices of a stroke with rounded ends, satin coral or cobalt in three shades
— hang on thin dark strings from small ceiling hooks at wildly different depths. From every angle it is clutter. From one
sweet spot (a yellow taped cross on the floor marks where to stand) every rod slides onto its slice of one figure and the
clutter becomes a crisp word or shape that fills the frame. A high front-left key throws soft shadows of the pieces onto
the floor and walls, and those shadows keep showing the true scatter even at the locked moment. Two figures can share
one room, each with its own sweet spot and colour; the figure not being read sinks to a quiet desaturated mid-tone
(never faded into the wall). The beat label is a dark pill chip with a small yellow eye mark, bottom centre, on the
overlay (exact colours). Tone mapping `neutral`, drift 0.

**Signature mechanic.** The one thing only 3D can do: an image that exists from exactly one viewpoint.
`anamorph.js` (THREE-free) lays a figure (stroke-font text, a star, a heart, any polylines) on an image plane at distance
`d0` in front of the sweet-spot eye `E` (camera basis built exactly as kit `framing.cameraBasis` / three's `lookAt`), cuts its
polylines into pieces of ~`chunk` metres, and moves every point of piece k along its own eye ray: `X = E + s_k (P − E)`,
rod radius `s_k · r0`. A central projection from E maps X back onto P, so the figure is exact from E at constant apparent
stroke width; anywhere else the pieces sit at depths `s ∈ [0.42, 1.7] × d0` and parallax tears it apart within a few
degrees. Depths are stratified + seeded, clamped per piece to the interval that keeps the whole rod inside the room
(walls, floor, ceiling, minimum distance from the eye). With `avoid: [otherPlan]`, each piece picks, among 25 candidate
depths, the one nearest its seeded depth whose projection from the OTHER figure's sweet spot clears that figure's strokes
— so two figures in one room do not cover each other at their locks (the other figure's image from its own eye does not
depend on its depths, so plan B once, then A avoiding B, then B avoiding A).

The camera does all the work: pieces never move toward the figure. `errorTrack` replays the rig (kit
`sampleCameraKeys`, bit-identical to `camera.js`) and measures each figure's alignment error (RMS NDC distance between
where the pieces project and where the flat figure projects; exactly 0 at E). `alignEvents` turns that curve into
`converge` events (error falls through 0.32 / 0.16 / 0.08 / 0.04), a `lock` (error ≤ 1e-4), a `release` and `tear` events
(rising back through the thresholds); `lockWindows` gives lock on/off times; `swayWeight` is EXACTLY 0 inside every lock
window (pieces may sway a little on their strings only away from locks). The picture (sway gate, dim, lock flash) and
the sound (rising marimba, snap, falling plucks) both read these.

## Good for / avoid for

- **Good for:** "it depends how you look at it", perspective / point-of-view messages, reveals of one word or one icon,
  "the pieces only make sense together", hidden-in-plain-sight, title reveals with a twist, two readings of one set.
- **Avoid for:** long text (more than ~6 stroke letters gets thin), anything that must be read while the camera moves,
  multi-step processes, numbers that must be exact (they only exist at the lock), scenes that need a free-roaming camera.

## Planner (`anamorph.js`, Node-safe; `style.plan` / `style.motion`)

| function | what it does |
|---|---|
| `planFigure({ id, eye, target, figure, d0, fill, fov, align, radius \| radiusAbs, chunk, step, depth, minDist, wallGap, room, ceiling, seed, tones, avoid })` | the piece plan: `pieces[{ k, s, r, pts, img, hang, stringLen, tone, mid }]`, `box` (figure corners on the image plane), `sweet { pos, target, fov }` (a camera key that locks it), `r0`, `figH` |
| `figurePolys(fig)` | `{ kind: "text", text }` (kit stroke font) / `"star"` / `"heart"` / `"polys"` |
| `alignmentError(fig, cam)` | RMS NDC tear of a figure through a camera pose |
| `errorTrack(figs, CAMERA, { duration, dt, fov, drift })` | error curves over the whole move |
| `alignEvents(track, id)` / `lockWindows(events)` | converge / lock / release / tear events; lock windows |
| `swayWeight(t, windows)` | 0..1 sway gate (0 inside locks) |
| `alignVoices(spec.sound)` | `scoreFromEvents` voices: marimba converge notes, clack + thud + chime on lock, plucks on tear |

## Prop factories (`style.props`)

| prop | what it is |
|---|---|
| `room({ min, max })` | floor (tiled), back + side walls, lit ceiling, skirting |
| `pieceSet(plan, { colors })` | every piece of a plan: a swept rod (kit `sweepGeometry` + sphere caps) built at its planned position inside a pivot at its hanging point, its string and a ceiling hook; `userData.update(t, { sway, dim, glow })` |
| `tapeMark(pos)` | yellow taped cross on the floor under a sweet spot |
| `caption()` | overlay pill chip (eye mark + text), bottom centre; `userData.show(text, alpha)` |
| `rodGeometry(pts, r, radial)` | one rod (tube + caps, merged) |

## Sound palette

Pad bed (G2 root, open fifths, 900 Hz), a soft `whoosh` per camera move, rising `marimba` notes (G4 C5 E5 G5) as the
pieces converge, a snap on the lock (`clack` + low `thud` + `chime`), falling `pluck` notes (E4 C4 G3) as it tears.
Every alignment sound comes from the error curve of the planned camera move. Levels measured only, never listened to:
demo mean −20.8 dB, peak about −1 dBFS.

## Knobs (spec.js)

`pieces.radius` (stroke chunkiness), `pieces.chunk` (piece length: shorter = more pieces, more tear), `pieces.depth`
(depth spread: wider = harder tear, but far pieces get huge and near pieces tiny), `pieces.minDist`, `pieces.sway`,
`pieces.dimMix` / `dimTone`, `pieces.glow`, `room` (bounds the depths), `palette.figA/figB`, `caption`, `sound`.
Per scene: `fill` and `align` of each figure at its sweet spot, `d0`, the eye positions, `avoid`.

## Known limits (seen while building the demo)

- Exactness needs drift 0 and a camera key exactly at `plan.sweet` with the same fov; any drift or a different fov
  tears the figure. Approach with `outCubic` so the lock lands softly; the planner's lock time comes a little before the
  key (error < 1e-4 ~0.14 s early).
- Sharp corners inside one piece (star tips) are swept with a single mitre, so they read as flat-cut tips rather than
  rounded joints. Text with rounded glyphs (O) looks best.
- Strings cross the figure at the lock (they are real objects); with many pieces the top of frame is busy with strings.
- Far pieces of one figure can sit close to the other figure's camera and appear huge at the frame edge (demo: big muted
  coral rods on the right at the star lock). Plan sweet spots far apart, or tighten `depth`.
- `avoid` only clears the other figure's strokes at its sweet spot; during moves pieces of both colours mix freely.
- Long words: the figure is width-limited, so letters get small; 4–6 stroke letters is the comfortable range.
