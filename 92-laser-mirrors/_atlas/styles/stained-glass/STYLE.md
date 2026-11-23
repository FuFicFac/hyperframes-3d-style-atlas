# Stained Glass (`stained-glass`)

A cathedral leaded window seen from a dim stone nave. Coloured glass panes sit in dark lead came with soldered joints
and iron saddle bars, set in a splayed stone reveal in an ashlar wall above a flagstone floor. The glass has thickness
variation (thicker = deeper colour), a streaky ripple, seeds (bubbles: bright cores, dark rims) and darker edges next
to the lead. It is lit from behind. Every frame the style renders a **light cookie**: the window as the sun sees it,
transmitted colour with the lead in black. The floor shader and a raymarched shaft volume look that cookie up along
the sun direction, so the coloured patches on the flagstones and the shafts in the dusty air carry the real pane
pattern, lead lines included, and move when the sun moves. Neutral tone mapping, bloom only on lit glass. Captions are
cream serif capitals over a lead-grey rule set with diamond quarries; the centre quarry takes the colour of the region
being named.

**Signature mechanic:** the image is assembled pane by pane. The lead is laid first and reads as a silhouette against
the dim daylight. Then the panes fly in from the nave side and settle into their cells, with one glass tick per bin.
Then the light comes up behind the window, and each region glows as it is named before settling. The sun swings
slowly through the clip, so the shafts and floor patches sweep.

**Good for:** big ideas, values, histories, "parts of a whole" diagrams (each part = one region that glows when
named), origin stories, anything that wants reverence or warmth. **Avoid for:** precise data or many numbers, long
labels, fast-paced content, small detail (a pane is ~0.2–0.5 m; text inside the glass is not supported), bright high-key
looks (the effect needs a dark interior).

## Planner: `glazing.js` (THREE-free, Node-safe; `style.plan`)
| export | what |
|---|---|
| `outline(kind, o)` | window shapes, CCW, sill at y = 0: `"arch"` (pointed; `k` = radius/width, .5 round … 1 lancet), `"round"`, `"rose"` (circle), `"rect"` |
| `figures.*` | icons built from convex panes, each `[{ pts, tone, region }]`: `sun`, `cloud`, `drop`, `crown` (wedge crown), `trunk`, `roots`, `star`, `heart`, `person`, `ring`, `petals`; `blob(c, r)` returns an irregular convex OUTLINE for a shaped field |
| `layoutWindow(design)` | `{ frame, border:{width, step, tones}, fields:[{ region, clip \| poly, tones, sites:{density, seed, mode:"random"\|"rings"} }], figures, bars, seed }` → `{ outer, inner, panes, leads, bars, bounds }`. Fields are seeded Voronoi; a field with `poly` (e.g. a leafy crown) is its own Voronoi area and is cut out of the plain fields. Pieces of one cell cut by a figure keep one seed and are joined by **seams** (no lead, no edge darkening), as a glazier cuts one sheet |
| `planGlazing(layout, { lead:[t0,t1], set:[t0,t1], leadDur, order:"rise"\|"centre"\|"regions", seed, bin })` | per-lead `t0/dur`, per-pane `set` (landing time; pieces of one cell land together), joints, and `events` (`lead` / `set` bins → SCORE) |
| `regionLevel(light, region, t)`, `lightEvents(light)` | the light plan: `{ up:[t0,t1], pre, base, named:[{ t, regions, peak, settle, hold, fall }], all:{ t, regions, peak, level } }` |
| `sunDir(t, keys[{t, el, az}])`, `landing(p, d, y)` | the sun (degrees) and where a ray lands (framing checks) |
| polygon kit | `clipHalf`, `clipConvex`, `subtractConvex`, `mergeConvex`, `hull`, `offsetPoly`, `voronoi`, `sites`, `area`, `centroid`, `inradius` |

## Props (`style.props`)
| prop | returns |
|---|---|
| `window(plan, { regions })` | Group at (0, sill, glassZ): ONE merged pane mesh (glass shader; per-pane flight from `aSet`), instanced lead came / frame came / saddle bars (draw-on), solder joints, a dim "outside" plane, and two coloured spill lights. `userData.update(t, levelOf(region, t))`, `userData.anchor(region)` → world centroid of a region |
| `room({ layout })` | ashlar wall with the arch hole, splayed stone reveal down to the glass, flagstone floor that receives the window light (cookie lookup) |
| `shafts(o)` | additive raymarched box volume (BackSide, no depth test) reading the cookie along the sun, with slow dust/haze noise; `userData.update(t, level)` |
| `caption(text, { x, y, align, swatch, sub })` | overlay canvas (exact colour, after post): serif caps + quarry rule; `userData.update(t, { on, off })` |
| `label(text)` | kit text label in the style's serif |

Factories for `OBJECTS`: `room`, `window` (`dims: { design, plan, regions }`), `shafts`. Call `style.setSun(dir)` each
frame and **always `style.render(t)`**: it renders the cookie, then `stage.render(t)`.

## Sound palette
Bed `pad` root 65.4 Hz, chord [0, 7, 12, 16, 19], `brightness` 520 **Hz**, gain ≈ 0.85 (sets the mean). Lead bins: soft
low `tick`. Pane-set bins: `click` (pitch 1.7–1.95) plus a tiny high `chime` on every third bin, panned. Light comes up:
`riser` into a major-seventh `pad` swell (brightness 950 Hz) and a low `chime`. Named region: `chime` + `sparkle` (one
pitch per region). Finale: low `chime`, soft `thud`, `sparkle`, a slow `whoosh` in.

## Tuning knobs (`spec.js`)
`tones` (glass palette), `glass` {gain, ambient, sheen, edgeWidth, edgeDark, thick, thickScale, ripple, rippleFreq,
bubbles, bubbleScale, bubbleCover, setDur, setFly, setTurn, setScale}, `lead` {width, depth, frameWidth, barWidth,
joint}, `window` {glassZ, splay, sill, cookie, outside}, `room` {block, flag}, `shafts` {steps, density, lod, dust,
dustScale, dustDrift, forward, box}, `floorLight` {gain, lod}, `spill`, `post.bloom` (threshold 1.25), `overlay`.

## Known limitations
- One window per style instance (one cookie). Its frame plane is fixed at z = 0, facing +z.
- Figures must be CONVEX pieces that do not overlap each other. `subtractConvex` cuts a field cell into convex pieces;
  seams hide the cuts, but a cell wrapped around a many-sided figure (the sun's rays) still shows faint seam lines up close.
- Shafts ignore occluders. The volume has no depth test and nothing inside the room casts into it. Keep props out of
  the shaft box, or the shafts will draw over them.
- The cookie is a planar projection from the glass plane, so the reveal does not shadow the floor patch.
- Before the light comes up, set panes show only the dim "outside" level (`pre`). Fully black unlit glass reads as
  holes against the lit backdrop.
- The floor patch is long at low sun elevation (< 40°). Frame it before committing to the sun keys (`landing()` helps).
- Lead came is a faceted bead (8-sided cylinder), not a true H-profile. Joints are flattened spheres.
- Text inside the glass (painted grisaille banners) is not implemented. Labels are overlay captions.
