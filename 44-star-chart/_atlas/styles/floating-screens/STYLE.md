# Floating Screens (`floating-screens`)

A bright software-launch look. Rounded UI cards are thin slabs with a soft edge highlight, and each face is drawn to a high-res canvas
(about 476 px/m) in a small light-theme design system: one indigo accent and calm neutrals. The cards float at different depths over a
luminous mesh-gradient backdrop of five drifting colour blobs with dither. Frosted panels sit behind the hero. Soft key-light shadows
come from the top-left and grow softer and fainter with each card's height above the layer behind. Depth of field focuses on the hero.
Tone mapping is `none`: faces are unlit designed colours with a slight key-light shade, and only the slab edges are lit. Step labels are
overlay pills with exact colours that are never blurred. Demo: `Builder/HyperFrames/3d-style-atlas-pilot/18-floating-screens/`.

**Good for:** product and feature walkthroughs, "how X works" for software or AI (RAG, pipelines, integrations), onboarding flows,
dashboards and workflows, anything explained with interfaces. **Avoid for:** physical or organic subjects, dark or moody topics
(use studio-product), dense tables, real product UIs and logos, and scenes that need an environment or a sense of place.

## Factories (`style.props`, synchronous; all cards and panels auto-register as shadow caster and receiver)
| factory | returns / hooks |
|---|---|
| `backdrop({ z, size, blobs, base, grain })` | blob-gradient plane, receives shadows; `update(t)` (done by `style.render`) |
| `card({ w, h, depth, radius, draw(ctx,W,H,state,ui), back, backState, base, baseOpts, state, receive, cast })` | Group: `setState(s)` (memoised redraw), `setPose(pose)`, `setFlip(a)`, `setRing(u)`, `setHaze(k)`, `flip`, `W/H` (dp) |
| `frosted({ w, h, radius, alphaTop, alphaBottom, rim })` | milky glass panel (gradient + sheen + inner rim + Fresnel), `setPose` |
| `chip({ text, w, h, icon, fill, border })` | pill slab (a snippet or data chip) |
| `connector({ width, color, dots, arrow, depth })` | `update({ a, b, progress, level, dots:[u], camera, bend, lift })`: bezier line, draw-on, arrow, travelling dots |
| `cursor()` | pointer with its tip at the origin; `set({ pos, click, presence })` (dip + ripple); casts a shadow |
| `pulseRings({ r, count })` · `dataDot()` | `set(t, start, { period, level })` · glowing billboard packet |
| `stepLabel(text, { number \| icon })` | overlay pill + badge at top-left; `update(t, { on, off })` |

`style.ui` (canvas painter, dp units): `text` (wraps the full string, then draws `count` chars, so typing never reflows), `caps`, `caret`, `greek`,
`icon` (search, doc, spark, send, up, check, user, plus, arrow, bolt, chat, sliders, lock, clock, globe, book, cmd), `avatar`, `pill`, `tag`, `button`, `toggle`,
`progress`, `dots`, `chrome`, `bubble` (`grow`), `searchBar`, `listRow`, `code`, `chart`, `docPage`. `style.render(t, { focus })` runs shadows, face shading, DoF and the render.
`style.helpers`: `applyPose`, `faceCanvas`, `paintFaceBase`, `shadowSystem`, `depthOfField` (kit BokehPass; hides `noDepth` and transparent objects in its depth pre-pass).

**Plan module `choreo.js`** (THREE-free; also import it in `scene.config.js`). It provides `pose`, `track(t, keys)` (spring or ease segments, closed-form),
`flyFrom`, `recede`, `offsetPose`, `SPRINGS`, `progress`, `flipAngle`, `fanLayout`, `stackLayout`, `gridLayout`, `rowLayout`, `typePlan`,
`typedCount`, `keyTimes` (one SCORE tick per char), `caretOn`, `bezierPath`, `along`, `window01` and `ramp`.

## Signature motion
Cards fly in from depth (behind, below, tilted, at 70 % scale) on the `settle` spring, which overshoots about 5 %. Layouts are target poses, so cards
spring between them. The hero comes forward while the others recede 1–2 m and haze about 0.3, and DoF blurs them. UI faces animate in sync:
typing, progress, streaming answers. Connectors draw on, and then chips travel along them. The camera makes one slow arc or push-in per beat.

## Sound palette
The bed is a `pad` maj9 chord at root 196 Hz with `brightness` 2400 **Hz**, plus a 392 Hz shimmer layer. Fly-ins use `whoosh` (pitch 1.0–1.4) and typing uses
`click` (one per char, pitch about 1.9, gain about 0.11). Arrivals and labels use `tick`/`blip`, highlights use `chime`, chips and pills use `pop`, and the model uses `riser` → `chime` + `sparkle`. The demo mean is −24 dB.

## Tuning knobs (`spec.js`)
- `ui.dpPerMetre` / `pxPerDp` set face scale and texture resolution, `ui.radius` sets corners, and `ui.sheen` and `ui.border` shape the face.
- `shadow`: `dir`, `opacity`, `blur0`, `blurPerM`, `spreadPerM`, `fade`, `maxCasters` (8 per receiver).
- `backdrop.blobs` (colour, pos, r, drift), `grain`; `post.grain` 0.022 keeps the gradients from banding at CRF 22.
- `dof.aperture` / `maxblur`; `frosted.*`; `connector.width/arrow`; `step.x/y/height`; `choreo.SPRINGS`.

## Known limitations
- Shadows are fake: each footprint is projected as a rounded rect with up to 8 casters per receiver. Skewed projections are approximated as orthogonal axes.
- The stage camera is not in the scene graph, so call the `connector.update` functions after `rig.update(t)`. Before that, `project()` reads last frame's matrices, and frames differ by seek order.
- Card fades toggle `material.transparent`, and the style bumps `needsUpdate`. Otherwise the shader that was compiled first sticks, because OPAQUE is baked into the program.
- Canvas faces are redrawn only when the JSON state changes, so quantise animated state (e.g. 0.02). Each redraw re-uploads a texture of about 1.7k px.
- Titles in docPage wrap to 2 lines. Long titles on narrow cards push the body down. Fonts are system stacks, pixel-identical on this Mac only.
- BokehPass halos lightly at hero edges over blurred cards.
