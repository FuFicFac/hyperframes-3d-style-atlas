# Paper Pop-Up (`paper-pop-up`)

A mid-century pop-up book lies open on a warm plank table. Each beat is a spread. Flat die-cut card
pieces (thin extruded 2D shapes with a lighter cut edge, matte fibre-grain paper, flat printed inks in
cream, teal, mustard, coral and ink) hinge up from the pages in parallel layers on a damped spring. The
layers stagger back to front, and a soft warm key light throws contact shadows onto the layers behind.
Captions are printed in serif type on swallowtail ribbons, and the date sits on a scalloped rosette. A
page turn folds every piece flat, arcs the leaf over the spine with a curl that travels from spine to free edge (the folded pieces bend with it), and pops the next spread.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/02-paper-pop-up/`.

**Good for:** timelines and "a short history of X", step-by-step explainers (one spread per step), children's and education topics, storybook brand stories, before/after reveals (pull-tab).
**Avoid for:** dense data or charts, photoreal products, fast-cut energetic edits, anything that needs more than about 8 pieces per spread, and text smaller than 0.3 m.

## Frame
Spine on z = 0. Far page z < 0, near page z > 0, x runs across the book (default W 6.4 × D 2.4 m per page).
Pieces stand facing +Z, hinge on lines parallel to X, and fold **forward** (+Z) to lie flat. Far pieces need `z + height ≤ -0.05`. Near pieces need `z + height ≤ D`.

## Props (`style.props`)
| factory | what it makes |
|---|---|
| `table({ size=40 })` | plank-wood table plane (procedural grain), receives shadows |
| `book({ width, depth, leaves=3, block, coverMargin, coverThickness })` | open hardback. `userData.anchor(spread, "far"\|"near")` → content group. `userData.pose(thetas[], curls[])` turns leaves 0..π with travelling curls (vertex-shader bend; leaf-riding cards are tessellated to `paper.bendMaxEdge`) and hides covered content. `userData.top` |
| `cardPiece({ shape, color, print?(h), thickness, back, printRes })` | die-cut card: front ink/print, back = cream washed 30 % with the face colour + printed hatch (`back:"auto"`), faintly self-lit cut edge (no dark slivers edge-on). `print(h)` draws in shape metres: `h.text/circle/rect/roundRect/fill/stroke/measure` |
| `glue(parent, child, { x, y, back })` | layers a card on a face (1.5 mm gap, no z-fight) |
| `standUp(content, { x, z, rest, stem, stemColor })` | hinge pivot. `userData.setOpen(u)` (0 = flat, 1 = rest, >1 = overshoot), `setAngle`, `setHeight` |
| `flat(content, { x, z, rotY })` | printed-side-up card lying on the page (boards, labels) |
| `stackPage(anchor, items)` | adds items in **pop order** and lifts hinges so flattened pieces stack without intersecting |
| `ribbon({ text, height, maxWidth, color, tail, textColor, ... })` | swallowtail banner. Text auto-fits; `userData.textSize` |
| `dateBadge({ text, r, color, inner, textColor, scallops })` | scalloped rosette with a printed disc |
| `pullTab({ length, width, travel, color, label })` | flat tab under a slotted cover strip. `userData.setPull(u)` |
| `sparkle({ r, color })` | 4-point star card |

`style.shapes`: `rect, roundRect, circle, ellipse, poly, scallop, star, bubble, withHoles` (bottom-centre convention; = kit/shapes.js, which also has cardGeometry/cardMesh/hingeGroup).
`style.motion` (pure): `hinge(t, popAt, foldAt)`, `turn(t, at)`, `curl(t, at)` → `{amount, start}`, `breath(t, at)` (add to u of flat pieces during a turn), `pull(t, at)`, `stagger(i)`.
`style.factories`: `table`, `book` (for OBJECTS `primitive: "procedural"`). `style.ink(name)` returns the material for a palette ink. `style.printMaterial(...)` is the raw printer.

## Recipe
1. `book = factories.book`. For each spread side, build `standUp(...)` pieces, then call `stackPage(book.userData.anchor(s, side), piecesInPopOrder)`.
2. Pop order is far-to-near and back-to-front. Fold order is the reverse. The scene config's `schedule()` shows this.
3. In `renderAt`, call `book.userData.pose([motion.turn(t, flipAt_i)...], [motion.curl(...)])` and `piece.userData.setOpen(motion.hinge(t, popAt, foldAt))`.
4. Start a leaf turn only after every near piece is flat (≈ nNear × foldStagger + foldDur). Pop the next far pieces only after the leaf lands.

## Default sound palette
`paper` with `fold: true` on every pop (pan by x). `pop` under badges and ribbons. `rustle` when a fold starts.
`whoosh` (dir in, ≈ turnDur) on a turn. A soft `thud` (pitch 1.7) plus `paper` on landing. `click` + `paper` on a pull-tab.
A quiet `pad` bed: gain ≈ 0.18, `brightness: 750` (Hz low-pass — not 0..1), F major 7, slow attack → bed ≈ −36 dBFS under a −22 dB mix.

## Tuning knobs (`spec.tuning`, `spec.paper`)
`lean` (rest tilt toward a high camera), `pop.{stiffness,damping}` (overshoot), `popStagger`, `foldDur/foldStagger`,
`turnDur/turnEase`, `curl/curlFrom/curlTo`, `breath`, `pullDur`. Backs: `paper.back.{tint,hatch*,glow}`. Bend tessellation: `paper.bendMaxEdge`. Paper: `cardThickness`, `glueGap`, `stackGap`, `printPxPerMetre`, fibre.
Look: `world.exposure` (1.28), key light `shadow.softness`/`extent`, `post.tiltShift`, `textures.wood`.

## Known limitations
- The leaf bend is a constant-curvature arc beyond a travelling start line, not cloth; tessellating leaf-riding cards costs ~2× render time (≈ 115 s for 15 s).
- Hidden-while-covered is a visibility cheat: the camera must look from the reader's side (+Z, above the book).
- Pieces cannot cross the spine, and far pieces are limited to height ≤ |z| − 0.05.
- The printed text is OS-rasterised Georgia, so other machines may differ by a pixel. Text faces +Z only.
- Stems show as tabs under floating shapes. Glue a post behind the shape (see the thought cloud and eye in the demo).
- First load paints the wood, fibre and page textures (about 1 s). Seeking out of order is deterministic.
