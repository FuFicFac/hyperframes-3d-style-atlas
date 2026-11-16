# Authoring a style — the short guide

Distilled from the three pilots (low-poly, paper-pop-up, neon-sign). API details: `kit-api.md`. Blender hand-off: `blender-translation.md`.

## 1. The contract (what you deliver)

`styles/<id>/` with exactly three files:
- `spec.js` → `STYLE_SPEC`: plain JSON-safe data (palette, world, materials, lights, post, camera, text, sfx, motion notes, plus any
  style-specific tuning blocks). No THREE, no window. **Every number that defines the look lives here.**
- `style.js` → `createStyle(stage, opts)`: starts with `applyStyleSpec(stage, STYLE_SPEC, opts)`, returns
  `{ spec, palette, materials, lights, post, textStyle, camera, props, factories, sfx }` (+ optional `helpers`/`motion`/`shapes`).
  Props are synchronous and seeded; time enters only through `obj.userData.update(t)`/`setOpen(u)`-style hooks the scene calls.
- `STYLE.md`: look in one paragraph, good-for / avoid-for, prop table, signature motion, sound palette, tuning knobs, known limitations.
- **Optional fourth module — a pure schedule/layout module** (e.g. `styles/split-flap-board/flaps.js`): plain functions, **no THREE,
  no window, no DOM**, importing only `kit/time.js` / `pathmath.js` / `noise.js` / `heightfield.js` / `framing.js` / `schedule.js` / `choreo.js` /
  `strokefont.js` / `bitmapfont.js` (all Node-safe; `scripts/test-kit.mjs` imports them in plain Node).
  Use it when timing comes from the content (a flip plan, a stroke-plot clock, a build order): `style.js` imports it for the picture
  **and `scene.config.js` imports it too**, so SCORE is derived from the same schedule (e.g. one `clack` per flip bin) and
  render-sfx / export-spec still run in Node. Name it after what it plans; expose it as `style.motion` or `style.plan`; list it in STYLE.md.
  Five styles use one (flaps.js, cues.js, explode.js, marbles.js, lightplan.js). Pattern: planner → event list → picture reads the plan,
  SCORE = `kit/schedule.scoreFromEvents(events, voices)` (distinct seeds), verify with `minSeparation` when things must not collide.

Plus one demo project (`Builder/HyperFrames/3d-style-atlas-pilot/NN-<id>/`), 15 s, rendered and checked.
Do not edit `kit/`. If you need a kit change, write it up; check kit-api §2.13–2.19 first — overlay labels, motion helpers,
terrain, tubes/paths, the stroke font, 2D shapes + cards + hinges, wood and print textures, screen-space lines + hidden-line edges,
3D noise, UV-free bump, voxel AO, a 5×7 bitmap font, contact shadows, roads/sagging cables, orthographic cameras and orbit (`path:"arc"`)
camera keys, procedural studio env + mirror floor + DoF, hairline callouts, follow-spot beams + curtains, profile sweeps, fresnel glass,
engraved plaques, odometers, bursts, `scoreFromEvents`, pose/spring choreography + typing plans (`choreo.js`), plastic and
paper-facet helpers, camera-replay framing checks (`framing.js`), octilinear routes (`pathmath.octilinearRoute`), `uploadTexture`,
Node-safe height fields (`heightfield.js`) and `check-frames --deep` are already there (kit-api §2.24 for pass 6). `references/style-index.json` (run `scripts/build-index.mjs`)
lists every style, its props, demo and category — check it so a new style isn't a near-duplicate.

## 2. Workflow

```bash
SK="$HOME/Library/CloudStorage/Dropbox/D Second Brain/Skills/3d-style-atlas"
cp -R "$SK/styles/neutral" "$SK/styles/<id>"                       # start from the reference style; rename id/name
node "$SK/scripts/new-scene.mjs" <proj> --style <id> --duration 15  # valid, lint-clean project wired to the style
node "$SK/scripts/build.mjs" <proj> --skip-render                   # sync -> sfx -> spec -> lint -> check (fast loop)
node "$SK/scripts/check-frames.mjs" <proj> --times 1,4,8,12,14.5    # syncs the kit first; stills + determinism + audio
#   ...look at every still, change spec/style/scene, repeat...
node "$SK/scripts/build.mjs" <proj> --checks 1,4,8,12,14.5          # final: + MP4 (CRF 22) + checks
node "$SK/scripts/export-blender.mjs" <proj>                        # optional: export/ for Blender
```
`npx hyperframes snapshot --at 3.2 --no-end -o /tmp/s` is the quickest single still. `serve.mjs` gives a scrubbable player.

## 3. Checklist before you call it done

- [ ] `build.mjs` exits 0: lint 0 errors **and** 0 warnings, check passes, MP4 written.
- [ ] `check-frames --deep` says `determinism: OK` and `deep self-check: OK` (reverse-order snapshots + in-page shuffled /
      repeated renders + a NaN/Inf scan of the HDR scene). Run it LAST, after your final code edit.
- [ ] You looked at ≥ 5 stills across the timeline and at least one at full size, not only the contact sheet.
- [ ] Every label is readable at 1080p, inside the safe area, on screen ≥ 1.5 s; nothing important in the outer 5 %.
- [ ] No `[atlas]` warnings in `hyperframes check` output (they flag ignored shadow softness, dead emission, etc.).
- [ ] Audio: `sfx.wav` max ≤ −1 dBFS, mean around −20 to −28 dB; every visible event that should click/pop has a cue from `BEATS`.
- [ ] MP4 ≤ ~12 MB for 15 s. STYLE.md lists real limitations you hit, not hypothetical ones.

## 4. Hard-won lessons

**Tone mapping and colour**
- Bloom `threshold` is **linear HDR luminance before tone mapping**. Lit light surfaces exceed 1.0: light scenes need 2–3
  (low-poly 2.6, only emission-6 gems bloom); dark/neon scenes 0.6–1.0 with emissive > 1 on what should glow.
- ACES greys cream/paper whites and desaturates saturated emissives (neon greens/whites go white first). Use `neutral` when the
  palette must read as designed (low-poly, paper-pop-up); keep `aces` for photographic/night looks and cap emissive near 2–2.5 if hue matters.
  `agx` is the gentle middle; `neutral`/`agx` also translate to Blender more faithfully than ACES.
- With a post stack, **everything in the 3D scene is tone-mapped**, `toneMapped:false` labels included (#808080 → #8d8d8d under ACES),
  and bloom/blur/grain hit them. For exact-colour UI use the overlay: `pinToScreen(stage, label, { x, y, height })` (drawn after post).
- `clearcoat` does not kill emission (measured in r181): it dims it by the coat Fresnel, ~2 % facing, ~30 % at silhouettes.
  If your glowing thing looks dead, check emission strength, the bloom threshold and tone mapping first.
- `vertexColors` materials multiply baseColor: use `#ffffff` base when vertex colours carry the palette; a vertex-colour material on
  geometry without a `color` attribute renders black.

**Light and shadow**
- `shadow.softness` only works with `pcf`/`vsm`. Leave `world.shadowType` unset (`auto`) or set `pcf`.
- Keep the directional shadow `extent` tight around the set (low-poly: 18 for a 34 × 26 m island; paper: 4.6) — smaller = sharper.
- `camera.near/far` in the spec now apply; keep near as large as the shot allows (0.3–0.5) for depth precision.

**Layout and readability**
- Text: ≥ 0.35 m tall at 6–9 m camera distance (≈ 4 % of frame height); paper found < 0.3 m printed text unreadable; neon caps
  look busy below ~0.3 m. Keep labels within ±60° of facing the camera's end position.
- Keep UI out of the outer 5 % (|NDC| ≤ 0.9). Low-poly banners: long labels (> 26 chars) reach the right edge — measure.
- Label timing: in with the beat, ≥ 1.5 s readable hold, out ≥ 0.4 s before the next label; one label at a time.
- Tilt-shift blurs top and bottom: keep `range` ≥ 0.3 and put labels/heroes in the middle 60 % of frame height; the bottom band
  goes soft first, so nothing important near the frame bottom.
- Scatter props (trees, rocks) must avoid the camera's sightline to the hero: low-poly added an `avoid` band on the camera side of the path.
- Flat decals and cards read as planes beyond ~35° off-axis: keep camera swings modest; hidden-when-covered tricks need a fixed reader side.

**Determinism** (see §5 for the trap checklist)
- All state from `t` in `renderAt`: no rAF, clocks, `Math.random`, accumulation. Vertex-animating props (`water.update(t)`) are fine
  if they rewrite from `t` each call. Memo caches are fine only if keyed purely by inputs (neon's flicker schedule).
- Fonts are OS-rasterised system stacks: pixel-identical on this Mac only. Neon-sign shows ±1-level GPU noise on 1-3 pixels between
  identical runs (additive decals + bloom in half float) — not a seek bug; compare its frames with a tolerance.

**Framing and composition**
- A square subject never fits 16:9 comfortably: a 12 m square diorama tile overflows vertically at any flattering angle. Plan for the
  overflow (crop a corner, keep captions over the empty corner) or use a 16:9-shaped base.
- Small props need ~1.5× toy-scale exaggeration to read at 1080p (diorama desk ×1.6). Measure text blocks before placing them
  (5×7 voxel text: 23 characters at 0.05 m = 6.9 m wide).
- Elevations/plans need an orthographic camera: perspective doubles back edges against front edges in a front view
  (`projection: "orthographic"`, or `setProjection`). Big orbits: use `path: "arc"` keys, or straight keys cut inside the circle.
- Keep thin protruding parts (flaps, cards, decals) within ~25–35° of facing the camera; beyond that they read as planes.

**Techniques that worked (batch 4)**
- Liquid / morphing / blobby surfaces: RAYMARCH an SDF (smooth-union primitives, `kit/sdf.js`) on a box mesh instead of morphing
  meshes — topology changes (split, merge, absorb) come free and stay seek-safe (liquid-chrome).
- Glass that shows what is behind it: PRE-RENDER the scene without the glass into a target, then refract that texture in the glass
  shader (screen-space offset + per-channel IOR); no transmission pass, deterministic (glass-light).
- Exact flat tones (isometric, infographic): an UNLIT three-tone shader (top/left/right from one base colour, `iso.threeTones`) + flat
  planar shadows, not lights + tone mapping (isometric-pastel).
- Embossing / letterpress: bake relief layers into height maps once (`relief.bakeHeightLayers`), animate per-layer height uniforms.
- Real fonts as 3D type: `fontoutline` traces the actual face; `await loadFonts()` first and name the family in index.html CSS.

**Hero, focus and reveals**
- On black (studio, stage, night), a hero needs RIM SEPARATION: a back/strip light or env strip that outlines its top and sides, or it
  merges with the void. Match direct lights to the environment's emitters (same side, colour) so shading, shadows and reflections agree.
- **Focus dimming (supersedes the old "dim by 40–55 %" advice):** move non-focus parts toward THEIR OWN desaturated mid-tone (mix each
  material's colour toward its own grey/luminance at mid value, lower its contrast) and KEEP their outlines/edges — never fade them toward
  the background colour or darken toward black. Fading to the background makes them read as holes or vanish into the set; their own
  mid-tone keeps the object present but quiet, and the focus part pops by saturation and contrast.
- Keep actors/props hidden (scale 0 or `visible = false`) until their reveal beat; set it from `t` in renderAt, never by leaving them
  off-camera — a camera move or a mirror floor will show them early.
- Glare hides emissive detail: a big env strip reflecting in a glossy top, or bloom on a large lit area, washes out etched/glowing
  detail. Turn the environment per shot (`studio.set({ rotation })`), lower bloom strength, or keep emissive small and bright.
- Additive beams/glow crossing camera-side air wash over signs and captions; keep light sources above/behind the subject plane.
- Square or tall subjects in 16:9 (a square tile, an upright robot, a tall machine): tilt the pose or pull back BEFORE motion leaves
  the frame (an upright exploded view exits the top), and plan which corner the caption covers.
- Headings cut off mid-video: check stills at the MIDDLE of every move, not only the beat ends — chalkboard's camera sits too low
  through the middle so the heading clips at the top of frame. A frame-edge check belongs on every move. (Fixed 2026-11-13 by computing shots and
  gating the build on a replay of the rig: chalkboard's `boardShot` + `framingReport` in chalk.js — copy that pattern.)
- **Keep the subject large and the label on screen.** The subject should fill most of the frame in every shot (a correct but tiny hero is
  the commonest weak still); the CURRENT label must be visible in every shot that is about it — check the middle of every move, not just
  the ends; and the final wide must FILL the frame with the finished subject, not sit small in empty set. Gate it with
  `kit/framing.framingReport` (required regions = subject box + current label, per beat) and look at the stills.
- Captions: one fixed region per scene (a single caption area or one peg/plaque), not wherever there's space each beat; in-world
  labels on a panning camera slide out of frame — hold on the frames that contain them.

- Anisotropic / brushed materials (`MeshPhysicalMaterial.anisotropy`, custom tangent-space shaders) need a `tangent` attribute
  (`geometry.computeTangents()` — indexed geometry with normals and UVs) or the tangent frame is NaN on some faces; bloom then spreads it
  into black blocks. `check-frames --deep` now scans every pixel and names the mesh under the first NaN.

**Lights, glow and shadows (new)**
- Lamps and emissive bulbs blow out to white and lose their hue under ACES (split-flap's green lamps above ~1.5). Keep emissive ≈ 1–1.5
  for coloured lights, let bloom carry the glow, and check the lamp core in a full-size still.
- Floating labels cast text-shaped shadows on back walls that read as a ghost second label: set `castShadow = false` on labels (voxel).
- Mirrored parents (a y-flipped sheet layer, `scale.y = -1`) reverse triangle winding: use DoubleSide or the faces get culled (blueprint).
- AO/contact cues sell scale: `contactShadow` under every prop on a ground (diorama), neighbour AO on voxels.

**Scene scale and depth of field (pass 7)**
- The kit BokehPass blurs by aperture × (focus − depth) in METRES. Aperture values tuned on 5–10 m sets do almost nothing on a 1 m
  desk set, and before pass 7 a style that never called `setFocus` was focused at a fixed 5 m — on mixing-console (~1 m from camera)
  every pixel clamped at `maxblur`: uniform blur. Now the focus follows the camera-rig target until you call `setFocus`; for sets far
  from 5 m prefer `depthOfField(stage, { relativeAperture: .006 })` (scale-free) and call `setFocus(distanceToSubject)` every frame,
  or none at all — never on some frames only (setFocus is sticky, so skipping frames makes the focus depend on seek order).
- Small sets also need camera `near` scaled down with them (0.05–0.25), shadow `extent`/`bias` scaled, and drift `amp` of millimetres.

**Performance and size**
- Many changing characters (boards, counters, tickers): bake every glyph once into a canvas **atlas** and select per instance —
  an InstancedMesh with a per-instance glyph-index attribute that the vertex shader turns into a UV offset (split-flap-board's
  `glyphAtlas`/`flapMaterial`). One draw call, no per-frame canvas redraws, deterministic. Copy the pattern from that style.
- Per-part materials/lights are the budget: neon is fine to ~150 letters but ~8 spill point lights total. Water ≤ 60 segments.
- Dense detail under a constantly moving camera dominates bitrate even without grain: the voxel demo was 18 MB at CRF 22 and needed
  `--crf 26` (10.6 MB, no visible mush in a crop of the MP4). Hold the camera still during holds, or raise CRF to 25–26 and look at a crop.
- Fuzzy / noisy surfaces (felt fibres, fur shells, pegboard holes, voxels) + a moving camera + grain blow the size budget: felt was
  33 MB at CRF 22. It reached 8.6 MB by LOCKING the camera during holds and dropping grain (the fibre texture already reads as grain).
  Instead of raising CRF past 26 (smears texture into blocks): hold the camera still, keep moves short, drop or halve grain, and bake
  fuzz as a texture rather than per-pixel noise that changes every frame.
- File-size levers that worked across batches 5–6 (in order): LOCK the camera during holds (drift amp 0 or a held key); move the
  camera only while the subject moves (one move per beat, not a constant slow push); drop grain where the texture already reads as
  grain; for glittery/sparkly or dense scenes raise `build.mjs --crf` to 23–26 (voxel and felt-stitch shipped at 26, pin-art at 26,
  newspaper-press at 23) and look at a
  crop of the MP4 for smearing. Raising CRF past 26 smears texture into blocks — fix motion first.
- Film grain dominates bitrate. CRF 18 gave 16–33 MB per 15 s; the default is now CRF 22 (neon: 9.4 MB, no banding on the dark wall
  in a 3×-brightened crop). CRF 24 halves it again but smears grain into blocks on dark gradients. Above ~0.03 grain, check size.

**Process**
- The first render is never right. Iterate by looking: render stills at the beats, look at them at full size, fix the biggest problem,
  repeat. Every pilot needed several passes (ACES→neutral, sightlines, threshold, label size) that no amount of code reading predicted.
- Audio mean: aim ~−20 dB (±3) with peaks ≤ −1 dBFS (`check-frames` prints both). The mean is set by the BED, not the hits: studio-product
  sits at −17 dB because of a loud sustained low pad (gain .6, 55 Hz) under sparse SFX; exploded-view's −27 dB reads thin. Set the bed
  gain to land the mean, then balance hits. New voices (levels alone, gain 1): `murmur` −19 dB rms mid band (crowd), `servo`/`whir`
  −17 dB rms low-mid gliding tone, `squish` −13 dB rms sub/low plop, `penScratch` −20 dB rms high band.
- `pad` `brightness` is a cutoff in **Hz** (default 1200). Three pilots passed 0.35–0.6 and their beds were silent (−89 to −109 dBFS);
  `render-sfx` now warns. Same-type sound events at the same millisecond need different `seed`s or they are bit-identical.
  New voices: `squish` (clay), `penScratch` (drafting).
- `check-frames` now empties `renders/checks/` each run and writes `RUN.txt`, including an mp4-vs-code PSNR verdict (STALE = re-render). Never review a still you didn't
  just make: stale frames that pre-dated the final render misled two reviews (chalkboard t8.0, wam-house t4.6).
- A HyperFrames render can leave a stale `renders/.<name>.hf-transaction-*` folder (seen when a render was interrupted or Dropbox raced the
  final rename). It is safe to delete once the render process has exited (`pgrep -fl hyperframes` shows nothing); never while a render runs.
- Resuming interrupted work (yours or another agent's): before trusting renders or check stills, confirm they POST-DATE the last
  edit to the style/scene (`ls -lt renders/ renders/checks/` vs the code files), and that `_atlas` is in sync (`check-frames` now
  syncs first; `--no-sync` warns when stale). A stale MP4 has been reported as "done" before.
- Derive every SFX time from `BEATS` so retiming a beat retimes its sound; bounce contact = 0.3636 × dur for `outBounce`.

## 5. Determinism traps (each one shipped at least once)

- [ ] **Stale matrices.** `stage.camera` is not in the scene graph and the renderer only refreshes world matrices inside
      `render()`. Reading `camera.matrixWorld` / `obj.matrixWorld` / `project()` in renderAt BEFORE that reads the previous seek's
      pose. Use `stage.sync()` after moving things, `worldPoint(obj, local)`, or `obj.updateWorldMatrix(true, false)` (parents
      too — `updateMatrixWorld()` on a child uses a stale parent). Kit `rig.update` and `projectToScreen` refresh what they read.
- [ ] **Canvas state carry-over.** A canvas redraw must not depend on the previous draw: `ctx.reset()` (or set font, letterSpacing,
      globalAlpha, composite op, transform, filter explicitly) at the top of every redraw; redraw only when the drawn state changes
      (key the canvas by `JSON.stringify(state)`, as floating-screens' cards do — cheap and seek-safe).
- [ ] **Texture uploads inside renderAt.** A CanvasTexture / DataTexture redrawn in renderAt and left to the lazy upload inside
      `stage.render` has produced a pixel one level off between seek orders on ANGLE/Metal (four batch-5 styles hit it). Upload it yourself
      right after the redraw: `uploadTexture(stage, tex)` (kit/textures.js: `needsUpdate` + `renderer.initTexture`), or
      `screenCanvas(stage, w, h, draw, { upload: true })` for overlay canvases.
- [ ] **Resized canvas textures.** GPU storage is allocated at the first upload; a canvas that changes size needs `texture.dispose()`
      before the next upload (kit `setText` does this now) — otherwise the frame depends on which text was drawn first.
- [ ] **First-state-wins shader programs.** `transparent`, defines, vertexColors, fog etc. are baked into the program: when you flip
      them, set `material.needsUpdate = true`, or the program compiled for whichever state was seen first sticks.
- [ ] **Memo keys.** Caches keyed by anything but the full input (time-quantised level, uuid of a rebuilt geometry) carry state.
- [ ] **Accumulation.** No `+=` across frames, no physics stepping, no "last value" variables; closed forms or precomputed plans.
- [ ] **NaN in shaders.** `pow(x, p)` with x < 0, `normalize(vec3(0))`, `/0` → NaN; bloom smears one NaN pixel across the frame
      (black or garbage frame). Use `materials.GLSL_SAFE` (`safePow`, `safeNorm`, `safeDiv`); `check-frames --deep` scans for NaN/Inf.
- [ ] **GPU-rasterised canvases (pass 7).** Any canvas baked into a texture or overlay must be created with
      `getContext("2d", { willReadFrequently: true })` on its FIRST getContext call (later options are ignored): Chrome's GPU canvas
      rasterised large text slightly differently on each page load (newspaper-press: ±1–2 levels on the masthead between runs).
      Kit canvases do this by default since pass 7 (`makeCanvas`, labels; `screenCanvas` only with `{ willReadFrequently: true }`
      — pass it in new styles); for your own canvases use
      `newCanvas(w, h)` / `canvas2d(canvas)` from `kit/canvas.js` (re-exported by textures.js).
- [ ] **Derivatives or texelFetch inside per-face branches.** Never call `fwidth` / `dFdx` / `dFdy` (or derivative-based texture
      sampling) or `texelFetch` inside an `if` that differs between neighbouring pixels (per face, per instance, per material slot):
      derivatives in non-uniform control flow are undefined, and city-lights' building edges changed between page loads. Compute all
      candidates unconditionally and SELECT arithmetically (`mix(a, b, step(.5, isSide))`), so every pixel runs the same code.
- [ ] **Custom ShaderMaterial on an InstancedMesh.** A hand-written vertex shader must apply the instance transform, or every
      instance draws at the origin (one object, or nothing): use the chunks (`#include <begin_vertex>` then `#include <project_vertex>`,
      which does `mvPosition = instanceMatrix * mvPosition` under `USE_INSTANCING` in r181), or write
      `#ifdef USE_INSTANCING  pos = instanceMatrix * pos;  #endif` yourself; per-instance colour needs `instanceColor` the same way.
      Check a still with an instance far from the origin.
- [ ] **Per-frame jitter accumulated onto a position.** Jitter/shake/wobble is ASSIGNED from t each frame
      (`obj.position.x = base.x + jitter(t)`), never added (`obj.position.x += jitter(t)`): `+=` integrates over whatever frames were
      rendered before, so the pose depends on seek history. Keep the base pose in `userData.base`.
- [ ] **Actors visible before their reveal.** Set visibility/scale from `t` for every beat, including t = 0; never rely on "it is
      off-camera" — camera moves, mirror floors and DoF pre-passes see it.
