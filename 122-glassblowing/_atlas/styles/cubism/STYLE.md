# Cubism (`cubism`)

**Look.** A real 3D café still life (a classical guitar lying face-up, a green bottle with a stencilled "VIN" label, a
wine glass, a bowl with a lemon, apple and pear, a folded newspaper, all on a round walnut table in a warm ochre room)
that turns into an analytic-then-synthetic Cubist picture. The picture plane is a flat 16:9 sheet cut into ~14 angular
convex facets; **each facet shows the still life through its own camera**. Palette runs plain lit render -> analytic
(soft-posterised umber / sienna / ochre / pale-grey bands, tinted per facet, light-to-dark "passage" shading across
each facet, ink lines traced inside the image) -> synthetic (flat three-tone papers: black/blue/cream, brown/ochre/cream,
black/green/yellow, umber/vermilion/cream; collage backs of coloured paper, faux-bois wood grain, newsprint with
stencilled letters, a charcoal drawing of the view, diamond wallpaper) -> bold (thicker contours). Dark brushy contour
lines on every facet edge, canvas weave in screen space, brush grain in facet space. A cream paper caption strip with a
vermilion square lives on the overlay (exact colours). The method of Picasso / Braque / Gris, not a copy of a painting.

**Signature mechanic: simultaneous viewpoints.**
- The still life is its own `THREE.Scene` (the spec lights and room environment are moved into it). Every frame, one
  kit camera rig per viewpoint (front three-quarter, bird's-eye table top, left, right, eye level, tilted) is updated
  from t and renders into a half-float 4x MSAA render target (1600 x 900) before the stage renders.
- The picture is a base sheet + one `ShapeGeometry` per facet. A facet's shader samples its viewpoint's target at the
  facet's REST frame UV (attribute `frameUv`), so the image travels with the facet as it slides, rotates and flips.
- Before the break all viewpoint cameras share view 0's keys, so the facets tile seamlessly into one ordinary picture.
  Cracks (the contour lines) then propagate outward from the subject, and each viewpoint's camera swings on an arc
  (`path: "arc"`) to its own bearing. As a facet's camera swings it also **re-aims** (its centroid samples a point near
  the subject) and zooms in, so edge facets show guitar / bottle / bowl, not empty wall.
- Facets flip like card about an in-plane axis; the back face is collage (back-face coords are mirrored across the flip
  axis so print reads right). Collage cut-outs slide in from outside the frame and stick.
- Resolve: slides pull back toward rest (`finalKeep`), rotations square up, facets lift into a shallow relief, lines
  thicken, the stage camera pushes in 7 %.

## Good for / avoid for
- Good for: "many perspectives on one thing", multiple stakeholders / viewpoints, deconstruct -> reassemble, art and
  design history, "look at it from every side", analysis vs. synthesis, remix and collage topics, title cards with a
  painterly bold finish.
- Avoid for: anything needing exact reading of one object (the point is fragmentation), numbers and charts, dark
  moody scenes, long holds (the look lives in the transitions), fast camera moves.

## Planner (`facets.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `partition({ w, h, count, seed, focus, aimShare, minShare, maxVerts })` | seeded convex cuts of the plane (about half aimed through `focus`, so shards radiate). |
| `viewKeys(subject, views, { fov, fovRT })` | one fitShot camera per viewpoint; `fovRT` = the wider overscan fov the render camera uses. |
| `createPlan({ frame, facets, views, beats, motion, collage, extras, strumAt })` | the plan: per facet view, crack time, swing, slides, flip, recentre aim/zoom, resolve. |
| `plan.facetPose(i, t)`, `plan.extraPose(j, t)` | `{ x, y, z, rz, s, flip }` offsets from the rest centroid (closed form). |
| `plan.stateAt(t)` | `{ analytic, synth, bold, push }` global look. |
| `plan.lineAt(i, t)`, `plan.swingAt(k, t)`, `plan.recentreAt(i, t)` | contour level, viewpoint swing, facet re-aim amount. |
| `plan.events()`, `cubismVoices(spec.sound)`, `bedScore(beats, spec.sound, end)` | SCORE via kit `scoreFromEvents` + one pad per beat. |

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `picture(plan, viewCams)` | everything: still life, render targets, base sheet, facets, cut-outs; `update(t)`. |
| `stillLife()`, `guitar()`, `bottle()`, `wineGlass()`, `fruitBowl()`, `newspaper()`, `table()`, `room()` | the still-life pieces (added to `style.stillScene`). |
| `facetMaterial(o)`, `facetMesh(pts, c, FW, FH, mat)` | the facet shader / mesh (for custom pictures). |
| `caption()` | overlay paper strip, `userData.show(text, alpha)`. |

## Sound palette
A guitar strum (`pluck` chord) in the first 0.2 s; a `thud` + `clack` when the plane breaks and a `tick` per facet
crack (panned by position); a `whoosh` + one `pluck` note per viewpoint swing; soft `rustle` on slides; `paper` (fold)
+ `marimba` per card flip; `paper` + small `thud` per pasted cut-out; a full major strum + `chime` when the composition
settles. Bed: one `pad` per beat (open fifth -> minor umber -> minor -> major 7 -> major), overlapping. All times from
the plan.

## Knobs (spec.js)
- `frame`: plane size, `overscan`, render-target size/samples. `facets`: count, seed, focus, aim share, min area.
- `still`: table, object placement, `subject.box` that every view frames. `views`: bearing / elevation / roll / fill /
  window per viewpoint. `orbit`: view 0's opening move.
- `facetMotion`: crack spread, swing start/step/dur, slide sizes and windows, rotation, overlap, relief, `recentre`
  (aim jitter, zoom), resolve keep/spread/duration, palette windows.
- `collage`: flips (count, timing, kinds), paper colours, cut-out timing, words. `look`: line width / bold / jitter,
  inner-ink thresholds, bands, passage, weave, brush. `sound`: every gain + the bed chords.

## Known limits (seen while building the demo)
- Seven full scene renders per frame (six viewpoints + the stage) at 1600 x 900 MSAA: renders are slower than most
  styles (the still life is simple; a heavy scene would multiply the cost).
- The guitar dominates most facets because it sits in the middle of every view; bottle and glass appear in fewer
  facets. Re-aim jitter (`recentre.jitter`) spreads it a bit; explicit per-facet aim targets would be better.
- Lit cream surfaces (spruce top, newspaper, wall) map to the lightest synthetic tone, so the synthetic phase has some
  large flat cream areas.
- Facet seams at rest rely on adjacent triangles + the base sheet showing the same image; a hairline can appear at a
  seam under MSAA when facets sit at different z (invisible in the checked stills).
- Flipped facets mirror their outline about the flip axis, so collage backs do not tile with neighbours (intended as
  cut paper, but there are small gaps where the base sheet shows through).
- Stencilled letters are drawn (Futura / Avenir Next Condensed + paper bridges); there is no stencil font on the Mac.
- Audio levels were measured, not listened to.
