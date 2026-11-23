# Cross-Section

**Look.** A clean technical-illustration cutaway on pale drafting paper. A solid object sits there; a slicing plane (a
thin orange frame of glass) sweeps through it and everything on the near side of the plane is simply gone. Where the
plane meets a solid there is a flat, fully saturated CUT FACE with a crisp ink outline — the outer shell's cut face is
section-orange with 45° hatching, every inner part is cut in its own colour, and parts embedded inside other parts
(cores, "neurons") exist only on the cut face. Behind the plane the uncut remainder is drawn in flat three-tone shading
that gets quieter with depth. Unlit, no tone mapping, no post: palette colours reach the screen exactly.
Demo: `87-cross-section/` ("Opening the black box").

**Good for:** "what is inside X", black boxes, anatomy of a system or a machine, layers and stacks, anything where the
inside is the surprise; MRI-style "scan through it" moves; before/after of one object. **Avoid for:** organic or soft
shapes (every solid must be a box, a capsule or a hollow box), stories that need parts to move, photoreal materials,
more than 80 solids in one object.

**Not exploded-view.** There the parts travel apart along an axis and stay whole. Here nothing moves: the plane moves,
and the parts are cut open where they stand.

## Files

| File | What |
|---|---|
| `spec.js` | palette, world (tone mapping "none", no lights, no post), `shade`, `ink`, `capInk`, `hatch`, `shellLook`, `sheet`, `ground`, `focus`, `pulse`, `caption`, `model` (the reference black box), `sound` |
| `slice.js` | **planner (Node-safe)**: solids, `planeAt`, `support`, `cutEvents`, `sideOf`, `onPlane`, `sheetHalf`, `flowPlan`, `blackBoxModel`, `outside` |
| `style.js` | `createStyle(stage)` → props below; `style.plan` = the planner |

## How the cut is made solid

No stencil buffer and no renderer clipping planes. Every solid is an analytic primitive, drawn twice from one list:

1. **Meshes** (instanced boxes, instanced cylinders for capsules, a rounded shell, the cavity walls seen from inside)
   discard their fragments on the removed side of the plane.
2. **Cut faces**: ONE quad lying in the plane. Its fragment shader walks the same list as signed distance functions:
   inside a solid → that solid's flat cut colour (later solids in the list win, so embedded parts go last); near any
   boundary → ink. The boundary distance is measured IN the plane (distance ÷ sin of the angle between the surface
   normal and the plane normal), so a face the plane is grazing does not flood with ink.

So the cut is exact for any plane offset and tilt, costs one extra draw call, and has no state: plane in, picture out.

## The planner (`slice.js`)

- Solids: `box(id, c, h, o)`, `capsule(id, a, b, r, o)` (a = b is a sphere), `shell(id, c, h, { round, wall, innerRound })`.
  Common fields: `kind` (for sound and anchors), `group` (focus group; 0 = never dimmed, no signal), `color`, `cut`
  (cut-face colour), `hatch`, `mesh: false` (embedded: only on the cut face).
- `planeAt(keys, t, origin)` → `{ n, d, u, v, origin, point }`. Keys `{ t, d, yaw, pitch, ease }`; the plane is
  `n·(p − origin) = d`, the kept half is `≤ d`. Lower `d` = deeper cut.
- `cutEvents(prims, keys, { origin, t1 })` → the first time the plane touches each solid (`{ t, kind, id, group, x }`),
  for SCORE: one tick per part as it is opened.
- `flowPlan({ starts, travel, x0, x1, hold, stops })` → `pulses(t)` (two newest pulse positions for the picture) and
  `events` (one per stop per pulse, for SCORE).
- `blackBoxModel(M, palette)` → the demo model (shell, tokens, layer slabs with embedded neurons, wiring, answer block
  with a core) + `anchors`, `stops`, `box`. `outside(model, flow, t)` → tokens riding in and answers coming out.
- `onPlane(p, plane)` → where a label about `p` should point on the cut face; `sheetHalf(h, plane, margin)`.

## Props

| Prop | What | Hook |
|---|---|---|
| `solid(model)` | clipped meshes + the cut-face quad | `setPlane(plane)`, `setSignal(pulses, focusGroup, dim)` |
| `sheet(model)` | the visible slicing plane: thin frame with heavier corners, faint glass | `set(plane, alpha)` |
| `floaters(n)` | unclipped instanced boxes for things outside the solid | `set(i, { c, h, color, scale })` |
| `ground(model)` | drafting paper, fading grid, soft contact shadow of the solid | — |
| `caption()` | overlay chip in one bottom band + hairline leader to a 3D anchor | `show(text, alpha, anchor?)` |

## Signature motion

The plane is the only actor. It arrives at an angle (yaw ≈ −40°) so the first cut starts at one corner and the opening
grows diagonally across the object, squaring up to the camera as it goes; then it creeps on slowly so embedded parts
swell, shrink and appear on the cut face. Camera: one arc while the cut happens (ending nearly square to the cut face),
locked while the plane creeps, one small arc at the end. After the cut, fit the camera to what is LEFT of the object,
not to the whole box.

## Sound

Dark `pad` + low `hum`. `servo` while the sheet approaches, `riser` into the first contact, `thud` + `whoosh` for the
cut, a `sparkle` at the first coloured part, and one `tick`/`clack` per solid from `cutEvents`. The signal plays one
`marimba` step per layer and a `chime` at the answer — played an octave down and quiet while the box is still closed.

## Tuning knobs

- Cut colour and hatching: `palette.cut`, `palette.hatch`, `hatch.freq`, `hatch.duty`.
- Line weight: `capInk.width` (cut faces), `ink.width` (uncut edges); both have a minimum in pixels.
- Depth read behind the plane: `shade.fadeDist`, `shade.fadeMin`; face tones `shade.top/front/side/bottom`.
- Focus: `focus.dim` (how far non-focus parts go to their own grey mid-tone). Signal: `pulse.width`, `pulse.amp`.
- Plane choreography lives in the scene (`PLANE` keys). Keep `d` falling faster than the yaw turns, or parts that were
  removed come back.

## Known limitations

- Solids are axis-aligned boxes, capsules and one hollow box. Capsule MESHES are flat-ended cylinders while their cut
  faces are round-ended: sink wire ends into the solids they join (`wires.sink`).
- Only one shell (one cavity), and everything that can be cut must be inside it (the cut-face shader discards outside).
- 80 solids at most (uniform arrays); the cut-face loop runs for every pixel of the cut face.
- Unlit: no cast shadows inside, no reflections. Depth behind the plane is read from face tones, ink edges and the fade.
- Tubes have no silhouette ink (only boxes have edge lines), so thin wires are quiet against light parts.
- The first-touch time in `cutEvents` uses each solid's bounding support, so the rounded shell is reported a few
  hundredths of a second early.
- The camera must stay on the removed side of the plane; from behind you would look into clipped, uncapped meshes.
- Things outside the solid (`floaters`) are never cut, even when the plane passes them.
