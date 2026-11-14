# Blueprint Build (`blueprint-build`)

A cyanotype drafting sheet come to life. Prussian-blue paper (fbm wash, fibres, two fold creases, vignette, grain)
with a 27 px grid; solids drawn as pale **hidden-line** linework: visible edges solid, hidden edges dashed, silhouettes
of curved surfaces recomputed from the camera every frame. Lines are screen-space ribbons (exact px weights,
analytic AA, round caps) blended with MAX so joins never double. Everything **plots on** along its length in drafting
order (construction → outlines → dimensions → lettering) with an amber plotter-head crosshair on the pen tip.
True orthographic camera: front elevation that tilts to isometric. Annotation lives on a flat "sheet layer" in pixels.

**Good for:** anatomy/architecture explainers ("parts of X"), systems and pipelines, exploded views, before/after
assembly, anything where "drawn precisely" = trustworthy. **Avoid for:** emotion, organic/soft subjects, photo-real
material, dense paragraphs, lots of simultaneous motion, fast cutting.

## Props (`style.props`) — all drawables: `userData.setProgress(p 0..1)`, `setLevel(k)`, `headLocal(p)`
| prop | what |
|---|---|
| `hiddenLine(geometry, { hidden="dashed"\|"none", featureAngle=24, drawAxis=[0,-1,0], silWindow })` | depth-only fill + chained crease edges (+dashed hidden pass) + per-frame silhouettes; `setView(cam)` |
| `lines(polys, { kind, width, color, level, dash, hidden, order="sequential"\|"parallel", windows, sheet })` | raw ribbon polylines; `setPolys()` for moving leaders |
| `polyline(stroke)` · `constructionLine(a,b)` · `centreLine(a,b)` (dash-dot) | single strokes (arcs allowed) |
| `text3d(text, { cap, origin, u, v, align })` | single-stroke lettering in any 3D plane |
| `dimension(a, b, { offset, text, normal, ends="arrow"\|"tick", flipText })` | extension lines → dim line → filled arrowheads → value |
| `hatch(poly2D, { origin, u, v, spacing, angle })` | section hatching clipped to any polygon, boustrophedon plot |
| `loopArrow({ center, radius, start, sweep })` | ring with riding arrowhead, hidden stretch dashed; `pointAt(u)` |
| `sheet()` | full-frame paper mesh; `setGrid(k)` fades the grid |
| `border()` · `titleBlock({ x,y,w,h,title,titleCap,fields })` | double rule + zone marks; title block (`frame`/`fields`/`title`) |
| `sheetText(text, { x, y, cap, align })` · `sheetLines(polys)` | lettering / lines on the sheet layer (px, y down) |
| `callout(text, { x, y, cap, anchor })` | dot + leader + shoulder to a 3D anchor; `sync()` each frame, `moveTo(x,y)` |
| `plotterHead()` | amber crosshair; `place([px,py] \| null)` |

`shapes`: `chamferBox(w,h,d,c)`, `lathe(profile,segs)`, `drum(r,h,chamfer)`, `circle(r,n,{center,u,v})`, `rect`.
`helpers`: `setCamera({az,el,dist,target,fov,shift})`, `syncView()` (call after moving camera/parts),
`render()` (**use instead of `stage.render`**), `toSheet(world)`, `headPx(obj,p)`, `sequence(group, parts)`, `layer`.
Kinds (weights px / levels in `spec.line`): outline 3.6, silhouette, hidden 1.7, construction 1.3, centre, dimension,
hatch, leader, text 2.6, title 3.0, border, detail.

Recipe (see `06-blueprint-build/scene.js`): keep a `PLOT` table of `[start,end]` windows in config; in `renderAt`
set camera → part transforms → `setProgress(P(w,t))` → `syncView()` → callout `sync()` → plotter head → `render()`.

## Sound palette
Per plotted stroke: `click` pen-down/pen-up, `paper` (density .6, pitch 1.7) nib scratch for the stroke's duration,
a `tick` train every 75 ms (stepper), quiet `buzz` 150 Hz motor on big plots. `whoosh`+`clack` for parts sliding home,
long low `whoosh` for the tilt, `fold` for the sheet and note changes, `clack`+`thud` rubber stamp on the title block,
`hum` 0.03 room tone. Derive every cue from the plot windows.

## Tuning knobs (`spec.js`)
- `line.weights` / `levels` / `colors`, `dash` (metres) and `dashPx` (sheet), `bias` (0.03 m line-over-fill pull),
  `featureAngle`, `penGap`. Fill offset (`polygonOffset 3/2`) is in `style.js`.
- `palette.paper*`, `grid`; `sheet` {gridMinor/Major + alphas, mottle, grain, fibres, creases, vignette, border}.
- `lettering` {letterSpacing, wordSpacing, slant}; `dimension` {arrowLen, arrowWidth, extGap, extOver, textCap};
  `hatch` {spacing, angle}; `head`; `plot.charTime` (caption write speed). `font` = kit stroke font + — · → Ø ×.

## Known limitations
- The style swaps in an orthographic `stage.camera`; since 2026-11-13 `stage.render` follows it (`helpers.render` is now
  just `stage.render`). Line shader and edge analysis now live in `kit/lines.js` / `kit/edges.js`. No post stack.
- Silhouettes come from mesh adjacency: smooth-shaded closed meshes only; very low tessellation steps visibly.
- Lines plotted on curved rims in elevation draw "half then back" (a circle seen edge-on) — honest but odd-looking.
- Sheet-layer labels are fixed px: they don't follow a moving camera; plan per-view positions (`moveTo`) and
  dip them out mid-move. Leaders can still cross geometry; place anchors by eye.
- Every line piece is one instanced draw; fine to a few thousand segments. Uppercase stroke lettering only.
- Dims/arrowheads are flat triangles in their plane: near edge-on they vanish (keep dims ±60° to the view).
