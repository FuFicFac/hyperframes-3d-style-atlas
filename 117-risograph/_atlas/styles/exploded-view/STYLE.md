# Exploded View (`exploded-view`)

A premium product teardown. One manufactured object floats in a bright seamless studio (screen-space gradient + a shadow-only
floor) and separates along its assembly axis into precise hard-surface parts: bevelled plates with holes, lathed profiles,
rounded shells, gears, fans, coils, a PCB with seeded components, brass screws. Materials are restrained: satin anodised metal, matte black and
graphite plastic, smoked polycarbonate (opacity), one accent hero part. Every part carries thin dark **screen-space ink** (kit
`lines.js` + `edges.js`): silhouettes recomputed per frame plus visible creases > 50°. A soft overhead softbox (PCF 9) and a
per-part floor blob make the shadow stretch as parts separate. Dash-dot centre lines join each part to its seat; callouts
are numbered dots + elbow leaders + a grotesque label (overlay, exact colours); a parts legend lists everything.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/10-exploded-view/`.

**Good for:** "what's inside X", product anatomy, hardware/how-it-works explainers, assembly order, BOM walk-throughs, launch films.
**Avoid for:** organic/soft subjects, places and flows (use tiny-diorama), linework-only drafting (blueprint-build), dark moods,
anything with more than ~12 parts in one stack or parts that must deform.

## Props (`style.props`; synchronous, seeded; Y = assembly axis, base at y = 0 unless noted)
| factory | returns / hooks |
|---|---|
| `roundedBox({ w,h,d, radius, material })` · `drum({ r,h, chamfer, r0 })` · `ring({ r,h, wall, chamfer, phiStart, phiLength })` | Mesh |
| `plate({ shape:"rect"\|"circle", w,d \| r, radius, h, bevel, holes:[{x,z,r} \| {x,z,w,d,radius}] })` | extruded bevelled plate, through-holes/slots |
| `lathe(profile[[r,y]], { segments, phiStart, phiLength })` · `shell({ r,h, wall, fillet })` | Mesh (`shapes.drumProfile/shellProfile`) |
| `gear({ teeth, r, tooth, h, bore, windows })` | extruded spur gear |
| `fan({ blades, r, hub, h, pitch })` · `coil({ r, turns, wire, length, core })` | Group; fan `spin(a)` |
| `screw({ r, length, head, headH })` | origin under the head, shank −Y, threaded; `turn(a)` |
| `wheel({ r, w, hub, spokes, tread })` · `roller({ r, length, flights, turns, core, vanes, caps })` | axle along X; `roll(a)` |
| `pcb({ w,d,h, radius, holes, seed, chips, caps, coils, connectors, leds, pads, mainAt })` | board + components; `chip` (anchor), `setLeds(k)` |
| `assembly(parts, { plan, floorY })` | root Group; `update(t)`, `explode(a\|{id:a})`, `setPose(q)`, `setFocus({id:w}, k)`, `worldOf(id, p)`, `sync(camera)`, `shadows` (add to scene), `setFloor(y)` |
| `callout({ n, title, sub, side, anchors, height })` | overlay; `set(reveal, hide)`, `setActive(k)`, `place({ anchors:[world], label:[ndcX,ndcY] })` |
| `legend(items[{n,name}], { title, width, rowGap })` · `titleBlock(title, { kicker })` | overlay; `set(reveal)`, legend `setActive({n:w})` |
| `outline(mesh)` · `outlineAll(root)` | ink on any mesh (assembly does this for you); `sync(camera)`, `style(color, width, level)` |

Part record for `assembly`: `{ id, object, rest:[x,y,z], offset, dir?=[0,1,0], spin? (screws), seat? (axis lines to this part),
axes?:[[x,z]], footprint? (floor blob radius) }`. Call `update(t)` → `setFocus` → pcb `setLeds` → `rig.update(t)` → `sync(camera)` → render.

**Schedule module `explode.js`** (THREE-free, also `style.plan`): `explodePlan(parts, { outAt, outStep, outDur, backAt, backStep, backDur })`
(outermost-first by |offset|, explicit `rank` wins; reassembly innermost-first), `explodeAmount(t, rec, plan)` (outBack out, inCubic in +
damped rebound), `screwAngle`, `explodeCues(plan)` → `{ leave, arrive, snap, spin }` for the SCORE. Import it in `scene.config.js`.

## Signature motion
Assembled object turns from edge-on to an upright three-quarter hero, then tips so the stack lies diagonally (lower-left → upper-right)
while parts separate outermost-first with an outBack overshoot and screws spin out 3.5 turns. Camera arcs a few degrees (`path:"arc"`).
One focus at a time: the hero keeps full colour and contrast and its silhouettes turn accent (3 px, thinner on small sub-meshes;
creases stay ink); every other part shifts to its own **dim colour** — desaturated (22 % saturation kept), luminance pulled 60 %
toward mid-grey and capped at 0.6 sRGB (backdrop ≈ 0.91), metalness ×0.65 — and keeps dark ink outlines (#3a3e45, 80 %),
shading and floor shadows. Black plastic becomes dark-mid grey, white plastic light-mid grey, the orange lidar a warm grey:
the assembly stays readable as solid shapes. The hero's leader draws on, label slides in.
Reassembly runs innermost-first (inCubic) with a small damped snap, then the object turns back to the hero view.

## Sound palette (`spec.sfx`)
leave `whoosh` (out, ~0.2) · settle `tick` · screws: 9 `click`s across the spin window · servo whir = stepped `buzz` (flicker 0, 90–180 Hz,
gain ≤ .07) · focus `blip` + `tick` · snap `clack` per part + `thud` + `chime` · bed `pad` (brightness **850 Hz**).

## Tuning knobs
- `outline.width` 1.7 px / `creaseWidth` 1.05 / `creaseDeg` 50 / `highlightWidth` 3 / `highlightSize` .45 m (smaller meshes get less extra accent width; < .12 m stay ink).
- `focus.dim` 1 (how far to the dim colour), `keepSat` .22, `mid` .5, `flatten` .6, `maxL` .6 (keep it well under the backdrop),
  `metalness` .65, `dimLine` #3a3e45 / `dimLineLevel` .8, `glow` .018 (higher tints dark parts orange).
  Do NOT dim by lerping toward the backdrop or adding emissive lift: on this light studio that washes parts to white ghosts (the old behaviour).
- `explode.overshoot` 1.35, `outDur` .9, `backDur` .45, `snap {amp m, freq, decay}`, `screwTurns`.
- `shadow.floorOpacity` .07 (real PCF shadow) / `blobOpacity` .28; softbox `softness` 9, `extent` 11.
- Stack framing: tilt the axis ~ (0.7, 0.55, 0.45) with the camera at 36° elevation → stack at ~15° on screen, faces visible at ~47°.

## Known limitations
- `lines.js` outputs `colour × alpha` with alpha 1, which fringes black under normal blending; the style patches the fragment to straight
  alpha (`STRAIGHT`) — kit promotion candidate.
- Silhouettes are CPU per mesh per frame (~11 parts, fine); hundreds of parts would need merging per part.
- Smoked parts use `opacity` with `depthWrite:false`: ink behind them shows through (reads as x-ray), sorting can flip on overlap.
- Exploding straight up from an upright pose leaves the frame: tilt the pose and pull the camera back *before* the first part leaves.
- Off-axis parts (`dir`) draw axis lines from their docking point, which pass through the seat's solid (depth-hidden, ok on opaque seats).
- Hero accent on parts with many interior silhouettes (tyre treads, thin brush arms) still reads mostly orange at 1080p; the
  highlight is per mesh, not a single outer contour of the part (that would need a part-level silhouette pass).
- `outlineMesh.style()` paints creases and silhouettes one colour; the style overrides the silhouette uniform after it to keep
  creases ink — kit promotion candidate (separate silhouette/crease colour).
- Overlay leaders never occlude, so anchors on hidden faces still get dots; pick anchors on the camera side.
