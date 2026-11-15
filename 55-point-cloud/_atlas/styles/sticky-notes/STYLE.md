# Sticky Notes (`sticky-notes`)

A workshop wall in a daylit studio. A bright whiteboard in an aluminium frame with a ledge is covered in square paper
notes in soft colours (yellow, pink, blue, green, orange). Each note carries a short word in marker hand. Its free edge
curls slightly and throws a soft shadow down and to the right. There are glossy dot stickers, marker-drawn lanes,
headers, boxes, underlines and ticks, and a multi-colour pad of notes leaning on the ledge with markers and an eraser.
Tone mapping is `neutral`, so the board stays white and the note colours stay true.

**Signature mechanic.** Each note is a real bent mesh: a flat grid rebuilt from the flat sheet every frame. The bend
angle (`sheetAngle`) is integrated down each column, then normals are recomputed. The angle is built from:
- a flat adhesive strip (the top 24 %);
- a hinge at the strip line;
- a soft, rolling peel bend that travels from the free edge to the strip;
- a progressive resting curl, stronger at the corners;
- a travelling breeze wave.

All of it is a pure function of time, driven by the planner. A note peels off the pad, flies, and slaps on strip
first; the flap falls (accelerating), bounces once and relaxes into its resting curl. When it moves, it peels its body
up, the strip lets go, and it hops or slides to its new place and slaps again. Dot votes land on its surface and ride
with it. A note that lands on top of others presses them flat.

**Good for:** planning and prioritising, brainstorm → cluster → decide, kanban and workflow boards, lists that get
re-ordered, retrospectives, team processes, "how we decided".
**Avoid for:** dense text (about 2 short words per note), numbers and charts (use chalkboard or blueprint),
product or photo subjects, dark or moody tone, anything needing more than about 15 notes in one shot (they get small).

## Props (`style.props`) / factories (`wall`, `board`)
| prop | what |
|---|---|
| `wallBoard(plan, o)` | Everything from a plan: wall, board, pad, every planned note, dots, marker ink and the marker pen. `userData.update(t)`, `userData.parts` |
| `board({ ledgeItems })` · `wall({ w, h, y })` | Whiteboard (faint ghost smears, clearcoat gloss), aluminium frame with corner caps, ledge with lip, markers and eraser · studio wall plane |
| `note({ color, text, seed })` | Bendable note. Origin is the top-centre; it hangs down −y. `userData.bend(st, breezeAt)` rebuilds it, memoised on the full input. `userData.surface(u, v)` returns `{ p, n, th }` on the current bend |
| `pad(plan)` | Leaning pad: striped multi-colour sheet edges and a blank under-sheet. The queued notes sit on it |
| `dot(color)` | Vinyl dot sticker (glossy cylinder) |
| `markerInk(plan)` | Ribbon meshes, one per marker colour. Each vertex stores the time its point is drawn, so draw-on is a uniform with no texture uploads. Edge pooling and streaks happen in the shader; caps are round |
| `markerPen(color)` | Whiteboard marker (tip at the origin). `wallBoard` rides one on the active stroke tip |
| `caption(labels)` | Overlay beat label: a paper strip with a note-coloured tab and marker hand, pre-drawn at build, fixed bottom-left. `show(i, alpha)` |

## The planner (`notes.js`, Node-safe; `style.plan`)
`planBoard(program, spec)` returns `{ notes, order, dots, marks, strokes, breezes, events, byId, pad, padNotes }`.

The program takes:
- `notes`: `{ id, color, text, place:{x,y,rot} }` for notes already on the wall, or add `pad: true, peel: t` for notes peeled off the pad.
- `moves`: `{ id, t, to, kind: "hop"|"slide" }`.
- `dots`: `{ on, t, u, v, color }`.
- `marks`: `{ id, kind, color, t | after+gap, pre, speed, ... }`. Kinds are `line`, `polyline`, `arrow`, `box` (one loose
  overshooting stroke), `circle`, `underline` (optionally `double`), `check`, and `text` (kit stroke font, hand-jittered).
- `breezes`: `{ t, dur? }`.

Layering: a note that lands overlapping notes already on the wall goes one layer up (0.7 mm) and presses them flat.
Their curl and breeze relax until it leaves.

Queries: `noteState(plan, id, t)`, `sheetAngle`/`sheetPoint`, `breezeLift(plan, X, t)`, `dotState`, `penAt`, `padPose`,
`padUnder`, `markStrokes`.

Framing: `boardShot(box, framing)` looks at a board box from `framing.dir` (slightly right of and above it, so curls and
shadows read) and backs off until the box fits `|NDC| ≤ safe`. `shotFill` is also available.

Sound: `stickyVoices(spec.sound)` (for `scoreFromEvents(plan.events, …)`) and `malletPhrase(t, semitones)`.

**Recipe (41-sticky-notes):**
1. In the config, build `PLAN = planBoard(PROGRAM)`, timing the program from BEATS.
2. Build CAMERA from `boardShot` shots, then gate it with `kit/framing.framingReport`; it throws if a shot's subject
   leaves the safe area mid-move.
3. Build SCORE from `scoreFromEvents(PLAN.events, stickyVoices())`, plus `malletPhrase` on each beat and a pad bed.
4. In the scene, use factory `wallBoard: () => style.props.wallBoard(PLAN)`, then call `wall.update(t)` →
   `caption.show` → `rig.update` → `render`.

Use swap cycles for re-sorts: notes that trade places lift together, so none lands on a note that is still sitting there.

## Signature motion (timings in `spec.timing`)
- **Pad peel:** 0.5 s. The curl rolls in from the bottom edge.
- **Flight:** 0.62 s, along an arc with flutter and spin.
- **Slap:** 0.55 s. Strip contact, then the flap falls over the first 30 % (inQuad), bounces about 17 %, and the curl
  recovers.
- **Wall moves:** lift 0.16 s, hop 0.44 s (or slide 0.36 s), reslap 0.42 s.
- **Breeze:** a Gaussian gust travelling left → right at 3.6 m/s. The lift is always ≥ 0, so edges never go through the
  board.
- **Dots:** drop in 0.16 s with a small squash wobble.
- **Marker:** strokes draw at 2.6 m/s by default (boxes 12, names 6.2 in the demo). The pen hops between strokes and
  between close marks.

## Sound palette (all from the plan)
| event | sound |
|---|---|
| peel off the pad | `paper` rip (pitch 1.7, density .95) |
| flight | soft `whoosh` |
| strip sticks | quiet high `click` |
| flap lands (the slap) | `thud` (pitch 2.6) + low `click` |
| lift / hop on the wall | short `paper` + light `whoosh` |
| dot | `pop` + tick |
| marker stroke | `penScratch` (felt, pitch .6) + faint `servo` squeak (1.65→2.05 kHz) |
| breeze | low `whoosh` + `paper` rustle |

The theme is a light mallet phrase on every beat (`chime` = bar partials, root 220 Hz). The bed is a `pad` at 196 Hz,
`brightness` 900 Hz, gain .55. Demo: sfx mean −21.2 dB, max −1.1 dB (measured, not listened to).

## Tuning knobs (`spec.js`)
- `note`:
  - shape: `size` (0.4 m, about 5× real so words read at 1080p), `strip`, `segX`/`segY`
  - bend: `bendLen`, `restCurl` (0.72 rad at the free edge), `curlPow`, `corner`
  - motion angles: `peelAngle`, `peelLen`, `peelRoll`, `approach`, `liftAngle`
  - layering: `zBase`, `zLayer`
  - paper: `paper` (fibre, edge, back tone)
- `hand`: font stack, size, ink, text centre `y`.
- `timing`: every phase duration, the flight arc and stand-offs.
- `breeze`: `amp`, `width`, `wavelength`, `freq`, `speed`.
- `marker`: width, wobble, speed, gap, z, and `pen` (size, `dir`).
- `pad`: `lean`, `thick`, `sheets`, `x`. `dot`: r, h. `board`: size, frame, ledge, ghost, gloss.
- `caption`: position, size, colours.
- `camera.framing`: fov, `dir`, safe, min/max distance.

## Known limitations
- Note words use macOS system hand fonts (Marker Felt → Noteworthy → Chalkboard SE). They are named only in canvas JS,
  never in index.html CSS, so HyperFrames fetches nothing. They will differ on other machines. Headers and cluster names
  use the kit stroke font (uppercase only).
- The bend runs about one axis only: no diagonal corner peels, no twisting. The corner extra-curl is per column, so it
  reads as a slightly stronger curl at the corners, not a real dog-ear.
- From a near-frontal camera, the resting curl and the breeze are foreshortened. They read mostly through the soft
  shadows and in motion; in a single still the breeze is subtle.
- On the pad the peeled flap shows its back face. The pad shot stays fairly wide so the lifted flap has room above the
  pad (the pad is about 23 % of frame width).
- Overlap layering assumes notes of equal size. Pressed notes are flattened, not deformed around the note on top.
  Hopping notes in a swap cycle can brush through each other in the air for a frame or two.
- In a full-board shot, 9 notes give word heights of about 25–35 px. Long words ("Newsletter") shrink to fit and are
  the smallest.
- The marker pen is drawn at about 2× real size so it reads, and it is still small in wide shots.
- Dots sit on the strip area (flat). Dots placed lower on a curled sheet follow the surface, but that was not exercised
  in the demo.
