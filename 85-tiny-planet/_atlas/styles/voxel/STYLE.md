# Voxel Studio (`voxel`)

A voxel-art model photographed in a studio. Everything is made of same-size, slightly bevelled cubes snapped to integer cells,
one `InstancedMesh` per model with per-instance colour. A 0.07 gap keeps the grid readable, and faces pressed against a neighbour
go dark, so the gaps read as thin dark lines. Crevices get smooth ambient occlusion: each cube carries a 26-neighbour occupancy
bit mask that the fragment shader decodes into per-face edge and corner darkening. The palette is limited and flat, with neutral
tone mapping. A warm key, cool fill and rim light the set on a pale cyclorama with soft PCF shadows. The camera is a narrow-FOV
(18°) three-quarter view. Text uses a 5×7 bitmap font and is built from cubes too. Demo: `Builder/HyperFrames/3d-style-atlas-pilot/08-voxel/`.

**Good for:** step-by-step processes and transformations (denoising, compression, pixels to images, building and assembling,
sorting), anything about grids, pixels, games, data cells or blocks, playful tech explainers, and counters and progress.
**Avoid for:** organic or soft subjects (faces, water, cloth), photoreal or premium product looks, long body copy (5×7 text
needs about 6 cubes per character), and smooth curves or precise charts.

## Props (`style.props`) and helpers (`style.helpers`), all seeded and synchronous
| factory | returns / time hook |
|---|---|
| `model(voxels, { size=.12, fill=.93, bevel=.1, capacity, anchor:"none"\|"bottom-center"\|"center", ao, castShadow })` | InstancedMesh scaled by `size`; instance coords are grid cells. `userData.setPose(i,x,y,z,s,rx,ry,rz)`, `setColor(i,r,g,b)` (linear), `setHex`, `setVoxels(v)`, `rest()`, `commit({ao})`, plus `home`/`base`/`pos` arrays |
| `text(str, { size=.054, depth=2, align, color, colorFn(ch,ci,line), capacity })` | voxel-text model. `userData.setText(s)` (deterministic re-layout), `width`/`height` in metres |
| `gapBoard(w, h, d=.6, size)` | dark box to put behind single-layer panels, so the gaps read dark rather than showing the backdrop |
| `studio({ width, depth, height, radius })` | pale cyclorama (kit `createCyclorama` with the `floor` material) |
| `helpers.flight(mesh, i, t, o)` | closed-form pose of cube i: assemble from a seeded scatter cloud (outBack snap plus a decaying tumble), optional `out` (scatter/drop). `o.order`: `random`, `x`, `y`, `z`, `-x`, `-y`, `-z`, or `fn(x,y,z,i)` |
| `helpers.assemble(mesh, t, o)` | `flight` for every cube, then commit. Returns the fraction settled |
| `helpers.cubeSteps(t, start, n, stepDur=.12)` | staircase 0→n, one whole cube per step with a tiny snap overshoot (pushes, extrusions, slides) |
| `helpers.flip(t, at, dur)` | split-flap recolour: `{k, ry, s}`, so swap the colour when `k` flips |
| `helpers.waveKey(x, y, w, h, dir)` | 0..1 diagonal sweep order for ripples |
| `textVoxels`, `measureText`, `FONT_5X7` | bitmap text as voxel data (A–Z, 0–9, `.,:-+=/!?"'→←#%█`) |
| `spriteVoxels(rows, legend, {depth})` / `layerVoxels(layers, legend, {axis})` | ASCII sprite extrusion / stacked slices |
| `boxVoxels`, `sphereVoxels` (shell), `heightVoxels(w, d, h(x,z), color)` | procedural fills |
| `occupancyMasks(pos, n, active, tol)` | the AO input (pure). Cubes off-grid by more than `tol` neither cast nor receive AO |

`style.factories`: `voxBox`, `voxSprite`, `voxSphere`, `voxText`, `studio` (OBJECTS `primitive: "procedural"`, `params`).

## Signature motion
Models assemble cube by cube. Each cube flies from a seeded scattered point to its cell with a per-cube delay (random, or by axis
for layer-by-layer builds and type-on text), tumbles, and snaps in with a small overshoot. Pushes and extrusions move in whole-cube
steps (`cubeSteps`). Recolours ripple across a model as a diagonal wave of split-flap flips (slow) or scale dips (fast). Exits burst
back into the cloud. The camera makes a slow orbit of a few degrees per beat with small push-ins and never cuts. The demo swings
to about −22° yaw to show the relief.

## Sound palette (`spec.sfx`)
enter `click` (a flurry while cubes snap in) · land `clack` (plinth layers, relief pushes) · ui and emphasis `blip` (square-ish,
8-bit: two-note on labels, pitch rising per denoise step, arpeggio on the payoff) · exit `tick` · bed `pad` (G open fifth, then
a brighter major lift). Keyboard "typing" is very short blips (`dur .035`).

## Tuning knobs (`spec.voxel`)
- `size` (0.12 m grid), `fill` (0.93: lower it for wider gaps), `bevel` (0.1 of the edge), `bevelSegments` 2.
- `ao.strength` .55 / `radius` .55 / `corner` .8: how dark and how far crevice shading reaches. A face against a neighbour gets 1.5 × strength.
- `assemble`: default `dur`, `spread`, `radius` (cubes), `overshoot` (outBack s), `spin`.
- `textSize` .45 × grid for 5×7 text. In the demo, labels use a 0.05 m cube (0.35 m cap height at 17 m and FOV 18°) and the caption 0.068 m.
- Post: no grain (it did not help file size), a light vignette, no bloom. Tone mapping is `neutral`, so the flat palette stays as designed.

## Known limitations
- **File size:** the dense cube grid under a constantly moving camera costs about 1.1 MB/s at CRF 22 (18 MB for 15 s, with or
  without grain). The demo renders at `--crf 26` (10.6 MB, with no visible mush on the noise frames in a crop of the MP4 itself).
  Use CRF 25–26, or hold the camera still during holds.
- AO is per model: cubes in different models don't occlude each other. Merge models that touch (the demo puts the frame
  inside the canvas model), or accept a seam at the contact.
- AO multiplies all lighting rather than only the ambient term (a baked look), and it is recomputed every frame from snapped
  positions (about 7k cubes in the demo, with no measurable slowdown in snapshot or render).
- Instance coords are integer cells in one model's own grid. Mixing cube sizes (big cubes for the card, small ones for its text)
  is allowed but breaks the "same size" rule, so keep it to text.
- 5×7 text is wide: 23 characters at 0.05 m make a 6.9 m line. Measure (`userData.width`) before placing, and keep it within ±25° of the camera.
- Floating voxel labels cast hard text-shaped shadows on the back wall that read as a second label. The demo turns `castShadow` off on labels.
- Coincident cubes (extrusion columns before they push out) are allowed. They share a colour, so there is no visible z-fighting.
