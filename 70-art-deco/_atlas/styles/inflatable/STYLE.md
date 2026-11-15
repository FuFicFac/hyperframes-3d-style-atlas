# Inflatable

**Look.** Glossy inflated objects in a bright warm-white seamless studio: puffy pillow letters, numbers, stars, hearts,
arrows and speech bubbles made of candy-coloured vinyl (clearcoat skin) or mirror foil (gold / silver / rose). Every object
has a flat welded seam round the edge, an outline that pulls in and scallops between pinch points, tight wrinkles radiating
from the seam, a little valve (vinyl) or a crimped neck tab (foil), and soft-box highlights from a procedural bright studio
environment. Neutral tone mapping keeps the candy colours candy.

**Signature mechanic: inflation as a pure function of time.** Each object is a 2D outline. At build time a vertex grid is laid
over it and a signed distance field is sampled (distance to edge, edge arc-length phase, inward gradient), plus a mask texture.
Every frame `setPose(pose)` rebuilds the front and back skins **from the flat grid** — nothing is carried between frames:

- thickness = pillow profile from distance-to-edge (circular cap, vertical tangent at the seam, medial ridge blurred) × an air
  front that spreads from the middle outward × fill^0.6;
- the edge pulls in as the skin puffs, scalloped between pinch points (phase of the nearest edge point);
- crumple (static noise × (1 − fill)^1.5) and limp outline waviness fade with fill;
- squeeze (air shifts to one side), contact squash, and the deflate fold are applied on top; normals are recomputed;
- radiating wrinkles + weld ridges are drawn in the fragment shader from the mask (lines of constant phase are perpendicular
  to the edge), amplitude from fill, anti-aliased by `fwidth`; the outline cut is `alphaMap` + `alphaTest` at d = 0, so shadows cut
  identically.

Poses come from the THREE-free planner `inflate.js` (`planInflatables`). Floor contact is solved exactly each frame (lowest
skin vertex after the stand-up tilt), so a growing pillow never sinks into the floor.

## Good for / avoid for

Good for: big friendly titles, single numbers, celebratory announcements ("we hit 5", launches, birthdays), counts going up or
down (inflate the new number, deflate the old), playful "pressure" / "growth" / "running out of air" metaphors, kids' and
consumer explainers.

Avoid for: serious or sad subjects, dense text (more than ~8 letters per shot gets small), thin or decorative fonts (strokes
under ~0.12 cap become noodles), precise diagrams, anything that needs crisp edges.

## Prop factories (`style.props`)

| prop | what it makes |
|---|---|
| `inflatable(loops, { finish, color, seed, valve, fatten, cell, id })` | any outline `[{ outer, holes }]` (metres, y up) → skin Group. `userData.setPose(pose)`, `tie()`, `info`, `home` |
| `letter(ch, { cap, finish, color, font })` | one glyph traced from the system font (`kit/fontoutline`), dilated by `skin.fattenGlyph` |
| `word(text, { cap, colors, ids, tracking, finish })` | kerned letters, each its own inflatable; returns `{ group, letters, ids, width }` with letter homes set |
| `digit(n, o)` | a number balloon (letter with digits) |
| `star(o)`, `heart(o)`, `arrow(o)`, `bubble(o)`, `circle(o)`, `polygon(pts, o)` | shape balloons from `inflate.OUTLINES` |
| `studioSet(dims)` (also `factories.studioSet`) | the bright cyclorama sweep (back wall far behind so the floor is flat under the cast) |
| `contact(obj)` | soft contact blob that follows an object; `userData.update(pose)` |
| `ribbon({ color, seed })` | curly ribbon tube; `userData.update(tieWorld, weightTopWorld, t)` |
| `weight({ color })` | foil-wrapped balloon weight (`userData.top` = ribbon anchor) |
| `caption(stage, beats)` | overlay balloon-pill caption, one beat label at a time (exact colours, after post) |
| `tag(stage, text, { from, to, x, y, align })` | small overlay sub-caption, e.g. "SAMPLE DATA" |

Finishes: `vinyl` (clearcoat, puffy: `skin.vinylThick`) and `foil` (metal, flatter: `skin.foilThick`, more residual
wrinkles). Valve: `"front"` (vinyl default, a plug on the front skin), `"neck"` (foil default, crimped tab under the bottom
edge; the ribbon ties to it), or `null`.

## Planner — `inflate.js` (Node-safe; `style.motion`, `style.plan(actors)`)

- `planInflatables(actors, { K: spec.plan, sound: spec.sound })` → `{ pose(id, t), fillAt(id, t), events }`.
  Actor events: `inflate {t, dur}`, `deflate {t, dur}`, `bump {t, dir, amount}`, `squeeze {t, dur, side, amount}`,
  `float {t, dur, to}`. Overshoot / rock / bump wobble are closed-form damped sines.
- `wordActors(ids, t0, { step, dur })` — letter-by-letter inflation; each letter's overshoot bumps its left neighbour.
- `inflatableVoices(spec.sound)` + `kit/schedule.scoreFromEvents(plan.events, voices)` — the SCORE comes from the same plan.
- `inflatableBed(duration, spec.sound, BEATS)` — the light upbeat theme.
- `OUTLINES.{circle, star, heart, arrow, bubble, roundRect, poly}`, `outlineBounds(loops)`.

## Sound palette (all from the plan)

- **hiss**: pump-stroke chain of short rising `whoosh` sweeps every 0.17 s during an inflate; pitch and gain follow the planned fill.
- **squeak**: `bubble` chirp + thin `servo` glide at 55 % and 85 % of each inflate (rubber stretching).
- **boing** at full: two soft `whir` glides (up, then a short falling tail) + a low `bubble` — no pop.
- **deflate**: falling `whoosh` + low gritty `servo` raspberry gliding down; a `squish` when it flops.
- **bump / squeeze / release**: `squish` + squeak. **float**: soft rising whoosh + a `blip` arpeggio.
- **theme**: bright `pad` in 2 s chords (brightness 1800 Hz — a cutoff in Hz) + a quiet eighth-note `blip` ostinato (0.25 s) on chord tones,
  and a rising blip arpeggio on each beat start. Demo measured mean −20.4 dB, peak −5.9 dBFS.

## Knobs (`spec.skin`, `spec.plan`, `spec.studio`)

`skin.cell` (mesh density), `tube` (pillow roundness), `vinylThick`/`foilThick`/`crownCap` (puffiness), `front` (how centre-first
the air fills), `pull` / `scallop` / `scallopEvery` (edge pinch), `crumple` / `crumpleFreq` (limp folds), `wrinkle.*` (period,
depth, reach from the seam, residual at full, limp boost), `weld.*` (flange ridges), `fattenGlyph`, `seam`.
`plan.inflate.{stand, hop, overshoot, stretch, bulge, rock}`, `plan.bump.*`, `plan.squeeze.*`, `plan.float.*`.
`studio.panels` (the reflection world: keep one bright back card and one dark side flag — foil needs both).

## Known limits (seen while building the demo)

- The skin is a grid cut by a mask, not a conforming mesh: the cut edge shows faint stair-stepping / a thin dark rim at 1080p
  close-ups (it reads as the weld, but it is aliasing). `alphaToCoverage` was not tried.
- Wrinkles are a normal-only effect (shader bump): silhouettes stay smooth except for the vertex scallop; a fully limp sheet
  looks smoothly crumpled rather than sharply creased.
- Mirror foil lying flat at grazing angles goes dark/streaky unless the studio has a bright back card; it is tuned for this
  sweep — a different set needs `studio.panels` retuned.
- Squeeze and contact squash are affine-ish deformations in the outline plane; there is no volume conservation and no real
  collision — contacts must be planned (positions chosen so the bulge just touches).
- Ribbons do not keep a constant length; a dragged weight slides along the floor (`FLOATS.*.weight` start → end).
- Very thin glyph parts (serifs, the counter of a small A) close up when `fattenGlyph` is large.
- Build cost: each object is ~4–12 k vertices × 2 layers rebuilt in JS per frame; ~10 objects is comfortable, 40+ will slow
  renders. `hyperframes check` reports `canvas_content_at_edge` on panning shots where a prop is cropped by the frame (expected).
- Letters use the macOS system face Arial Rounded MT Bold: pixel-identical on this Mac, different elsewhere.
