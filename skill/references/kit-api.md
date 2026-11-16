# 3d-style-atlas — Kit API, Style Contract, Scene Rules

Three.js r181 (`three@0.181.2`) scenes rendered to MP4 by HyperFrames. Every frame is a pure
function of time `t`. Sound is synthesized by plain DSP code that runs identically in Node and the browser.

## 0. Conventions (apply everywhere: code, specs, JSON exports)

| Thing | Convention |
|---|---|
| Units | 1 unit = 1 metre |
| Axes | Y-up, right-handed. Ground = XZ plane at y = 0. Default camera looks toward -Z. |
| Colors | sRGB hex strings (`"#e4572e"`). The renderer outputs sRGB with tone mapping (ACES by default). |
| Angles | radians. `rotation` is Euler XYZ order `[x, y, z]`. |
| Camera fov | vertical field of view in **degrees** (three.js convention). |
| Light intensity | three.js physical units: directional / hemisphere / ambient = lux-like scalar; spot / point = candela with `decay: 2`. |
| Time | seconds from composition start. `t` in `renderAt(t)`, beats, score, camera keys. |
| Easing | names from `ease` in `kit/time.js` (formulas in §2.3). Input is clamped to 0..1; f(0)=0, f(1)=1. |
| Randomness | only `rng(seed)` or `hash01(...)`. Never `Math.random`. |

## 1. Layout and how a composition reaches the kit

```
Skills/3d-style-atlas/
  kit/        core.js time.js camera.js lights.js presets.js textures.js text.js post.js builders.js spec.js sound.js player.js
              overlay.js motion.js terrain.js paths.js pathmath.js strokefont.js shapes.js export.js
              lines.js edges.js noise.js materials.js voxels.js bitmapfont.js
              studio.js callouts.js stagecraft.js schedule.js effects.js choreo.js selfcheck.js
              fontoutline.js optics.js sdf.js iso.js relief.js framing.js heightfield.js canvas.js
  styles/<id>/spec.js     STYLE_SPEC (plain data)
  styles/<id>/style.js    createStyle(stage, opts) (Three.js code)
  vendor/three/           three.module.min.js + three.core.min.js + addons/ (three@0.181.2, MIT)
  scripts/    new-scene.mjs build.mjs build-index.mjs build-gallery.mjs sync-kit.mjs render-sfx.mjs export-spec.mjs export-blender.mjs check-frames.mjs test-kit.mjs serve.mjs lib/chrome.mjs
  references/ kit-api.md (this) style-authoring.md (how to build a style) style-index.json + STYLES.md (generated catalogue) blender-translation.md blender/
<project>/                (a HyperFrames project, e.g. Builder/HyperFrames/3d-style-atlas-pilot/00-smoke/)
  index.html  scene.js  scene.config.js  sfx.wav  scene.spec.json  _atlas/ (generated copy)  renders/  export/ (Blender hand-off)
```

**The project gets a copied `_atlas/` folder** (from `scripts/sync-kit.mjs`). HyperFrames serves and
bundles only the project directory, so `../../Skills/...` imports and symlinks are not used. Relative
imports inside the copy (`./_atlas/kit/core.js`) work under `lint`, `check`, `snapshot`, `render`, and
`serve.mjs`. Never edit `_atlas/`. Edit the skill and re-sync. The copy is about 0.9 MB.

**Three.js is vendored** in `vendor/three` and resolved with an importmap. There is no CDN at render
time: no network dependency, the version is pinned, and every addon resolves against the same core.
The HyperFrames runtime and GSAP still load from jsDelivr, as in every HyperFrames project. Under
`render`, the WebGL probe reported `ANGLE Metal Renderer: Apple M1 Pro` (hardware GPU capture).

Vendored addons (`three/addons/...`): `postprocessing/{EffectComposer,RenderPass,ShaderPass,MaskPass,Pass,UnrealBloomPass,OutputPass,BokehPass}`,
`shaders/{CopyShader,LuminosityHighPassShader,OutputShader,BokehShader}`, `geometries/RoundedBoxGeometry`,
`environments/RoomEnvironment`, `utils/BufferGeometryUtils`, `exporters/GLTFExporter`, `loaders/GLTFLoader` (the last two for the
Blender export and its verification; not used at render time). To add one, copy it from the npm tarball
of `three@0.181.2` (`examples/jsm/...`) into `vendor/three/addons/` at the same relative path.

## 2. Kit modules

### 2.1 `core.js` (re-exports everything from `time.js`, plus `THREE`)

- `createStage({ canvas="#stage", width=1920, height=1080, background=0x101014|null, fov=35, near=0.1, far=200, shadows=true, shadowType="pcfsoft"|"pcf"|"vsm"|"basic", toneMapping="aces"|"agx"|"neutral"|"none", exposure=1, antialias=true }) → stage`
  - `stage = { THREE, renderer, scene, camera, canvas, width, height, post, overlay, time, render(t), mount(renderAt, meta) }`
  - Built synchronously: `preserveDrawingBuffer: true`, pixelRatio 1, sRGB output, shadow maps enabled.
  - `stage.render(t)` renders with the **current** `stage.camera` (it may be replaced) through `stage.post` if attached (its
    render pass is re-pointed every frame), otherwise a plain render, then draws `stage.overlay` on top. (Before 2026-11-13 it
    used the camera captured at createStage, so a replaced camera was ignored by the render but used by `projectToScreen`.)
  - `projection: "orthographic"` (createStage option or `spec.camera.projection`) gives an orthographic camera.
- `makeOrthoCamera({ fov, near, far, aspect, viewHeight })`: an OrthographicCamera that keeps a `fov`; the rig frames it so the
  **target plane** matches a perspective camera with that fov (half-height = distance × tan(fov/2)), unless a `viewHeight`
  (full frame height, world units) is given. `setOrthoFrame(cam, viewHeight)`. `setProjection(stage, "orthographic"|"perspective", { viewHeight })`
  swaps `stage.camera` keeping its pose. Use orthographic for elevations/plans/isometric: perspective doubles back edges in a front view.
  - `stage.mount(renderAt, { duration, score, duck })` listens for `hf-seek` (`e.detail.time`), renders `window.__hfThreeTime || 0` immediately, and exposes `window.__atlas = { renderAt, stage, duration, score }`. In a plain browser tab it also lazy-loads `player.js`.
- `stage.sync()`: refresh every world matrix (scene graph + `stage.camera`, which is NOT in the scene graph). The renderer only does
  this inside `render()`, so reading `matrixWorld` / projecting in renderAt before that reads the PREVIOUS seek's pose. Call it after
  moving things, before you read matrices. `worldPoint(obj, local)` → world Vector3 with obj's parent chain refreshed. `rig.update`
  and `projectToScreen`/`pinToScreen` refresh the camera (`updateWorldMatrix(true, false)`) themselves.
- `isPreviewContext() → bool`: true only for a top-level, non-automated, non-headless tab with no HyperFrames render globals. Override with `?player=1` or `?player=0`.
- `shadowAll(root, cast=true, receive=true)`
- `SHADOW_TYPES`. **`light shadow.softness` (radius) only has an effect with `pcf` / `vsm`.** In r181, `pcfsoft` uses a fixed kernel
  (checked in the shader source). `applyStyleSpec` resolves `world.shadowType`, default **`"auto"`** = `pcf` when any light sets
  `shadow.softness`, else `pcfsoft`. An explicit `pcfsoft`/`basic` with a softness set logs a `[atlas]` warning.

### 2.2 `time.js` (pure; Node-safe)

- `rng(seed|string) → { next(), range(a,b), int(a,b) (inclusive), pick(arr), sign(), chance(p), gaussian(mean=0, sd=1), shuffle(arr), fork(salt) }` (mulberry32)
- `hash01(...ints) → [0,1)`: stateless per-index or per-frame randomness. `hashString(s) → uint32`
- Math: `clamp(x, lo=0, hi=1)`, `lerp(a,b,t)`, `invLerp(a,b,x)`, `remap(x, inMin, inMax, outMin, outMax, clamped=true)`, `smoothstep(e0,e1,x)`
  (**open-ended safe** since 2026-11-13: equal or infinite edges — e.g. `1 - smoothstep(off, off + d, t)` with `off = Infinity` — act as a
  step instead of returning NaN; NaN used to propagate into light intensities and blank the frame), `lerp3(a,b,t)`, `TAU`, `deg(d)`.
  **Pass 6:** `lerp`, `invLerp`/`remap`, `beat` and `envelope` are open-ended safe too — an infinite edge/endpoint is a deliberate
  "never"/"forever" (`lerp(0, Inf, 0) = 0`, `invLerp(-Inf, 0, 3) = 1`, `beat(t, Infinity, d) = 0`, `envelope(t, on, Infinity) = 1` once
  in). Each still computes the old formula and only falls back when it would be NaN, so finite inputs are bit-identical
  (`scripts/test-kit.mjs` checks 20 000 random cases and every infinite case).
- `ease.<name>(t)` and `toEase(nameOrFn)`
- `spring(t, { stiffness=120, damping=12, mass=1 })`: closed-form damped spring step from 0 to 1, with overshoot when underdamped. `t` is seconds since start.
- `beat(t, start, dur, ease="linear") → 0..1`
- `envelope(t, start, end, inDur=.3, outDur=.3, eIn="outCubic", eOut="inCubic")`: rises, holds, falls.
- `new Timeline(beats)` with `beats = [{ id, t, dur, ...extra }]`: `.p(id, t, ease)`, `.get(id)`, `.at(id, offset)`, `.active(t)`, `.end`
- `beatsFromSrt(srtOrVtt, ids?) → [{ id, t, dur, text }]`
- `beatsFromWords(words, markers?)`: `words = [{ text|word, start, end }]` (the shape `hyperframes transcribe` produces); `markers = [{ id, word }]` → one beat per marker, lasting until the next marker.
- `duckFromBeats(beats, pad=0.1) → [{ start, end }]`, for `renderScore({ duck })`.

### 2.3 Easing formulas (u = clamp(t, 0, 1))

| name | f(u) |
|---|---|
| linear | u |
| inQuad / outQuad | u² / 1-(1-u)² |
| inOutQuad | u<.5 ? 2u² : 1-(-2u+2)²/2 |
| inCubic / outCubic | u³ / 1-(1-u)³ |
| inOutCubic | u<.5 ? 4u³ : 1-(-2u+2)³/2 |
| inOutSine / outSine | -(cos πu - 1)/2 / sin(πu/2) |
| inExpo / outExpo | 2^(10u-10) / 1-2^(-10u) (exact 0 and 1 at the ends) |
| inOutExpo | u<.5 ? 2^(20u-10)/2 : (2-2^(-20u+10))/2 |
| inBack / outBack (s=1.70158) | (s+1)u³-su² / 1+(s+1)(u-1)³+s(u-1)² |
| inOutBack (s=1.70158·1.525) | standard Penner inOutBack |
| outElastic | 2^(-10u)·sin((10u-0.75)·2π/3)+1 |
| outBounce | Penner outBounce (n=7.5625, d=2.75). First ground contact at u = 1/2.75 ≈ 0.364. |
| spring (function) | 1 - e^(-ζω₀t)(cos ω_d t + (ζω₀/ω_d) sin ω_d t), ω₀=√(k/m), ζ=c/(2√(km)) |

### 2.4 `camera.js`

`createCameraRig(camera, keys, { drift? }) → { keys, sample(t), update(t) }`
- `keys = [{ t, pos:[x,y,z], target:[x,y,z], fov?, roll?, ease?, path?, viewHeight? }]`. A key's `ease` and `path` apply to the segment that arrives at it (default `inOutCubic`). The camera holds before the first key and after the last.
- **Position interpolates in a straight line by default** (`path: "linear"`): a big swing around the subject cuts through the
  middle and passes closer to the target, so large orbits needed extra keys. `path: "arc"` interpolates the offset from the target
  in cylindrical coordinates around +Y (azimuth the short way, radius and height lerped): one key pair = a clean constant-distance orbit.
- Orthographic cameras (`makeOrthoCamera`): the rig also sets the frustum each update from `viewHeight` (keyed, lerped) or fov × distance.
- `drift = { amp=0.15, speed=0.25, orbit=0 }`: a deterministic sin/cos sway, plus an optional orbit around the target in rad/s. Both apply at all times.
- Call `rig.update(t)` inside `renderAt`.

### 2.5 `lights.js` / `presets.js`

- `lightsFromSpec(scene, rig, { intensity=1 }) → { group, [id]: light }`. `rig` is an array of light specs (§4).
- `addLights(scene, preset, opts)` = `lightsFromSpec(scene, LIGHT_PRESETS[preset])`. Presets are `soft`, `studio`, `stage`, and `flat`. They are plain data in `presets.js`.
- `configureShadow(light, { softness=4, mapSize=2048, extent=8, near=.5, far=40, bias=-0.0004, normalBias=0.02 })`. `extent` is the half-width of the directional shadow frustum in metres. Keep it tight around the set, because a smaller extent gives sharper shadows.
- `useRoomEnvironment(renderer, scene, intensity=1)`: a synchronous PMREM environment for reflections.

### 2.6 `textures.js` (seeded; tileable unless noted)

- `valueNoise2(x, y, seed, period)`, `fbm2(x, y, { seed, octaves=4, lacunarity=2, gain=.5, period })` (pure; they live in `noise.js` since
  pass 6 and are re-exported here — Node planners import them from `noise.js`, which has no THREE)
- `noiseTexture({ size=256, scale=8, octaves=4, seed, colorA, colorB, contrast=1, repeat, srgb })`
- `paperTexture({ size=512, base="#f4efe6", fiber=.06, grain=.05, seed, repeat, variant="classic"|"even" })`. The default `classic`
  fibres are stretched 16:1 along V with 6-cell blotches: repeated across a large sheet they read as streaks and a tile grid.
  `variant: "even"` (pass 6, opt-in) = isotropic 40-cell fibre noise + weaker 12-cell blotches, same mean tone: use it for big sheets.
- `gridTexture({ size=512, cells=8, line=2, bg, fg, major=0, majorColor, repeat })`
- `gradientTexture({ size, stops:[[pos, color]], type:"linear"|"radial", angle=90, cx, cy })` (clamped, not tileable)
- `bumpFromNoise({ size=256, scale=16, octaves=3, seed, repeat })`: linear grayscale, for `bumpMap` or `roughnessMap`
- `speckleTexture({ size, density, base, dot|[dots], radius:[min,max], seed })`
- Plumbing: `makeCanvas(w, h, { willReadFrequently = true })` (pass 7: creates the 2D context itself with `willReadFrequently`, so
  every painter here and any later `getContext("2d")` on it rasterise on the CPU — repeatable across page loads; `false` = old GPU canvas),
  `canvasTexture(canvas, { repeat, srgb, anisotropy })`, `paintPixels(size, (u, v, x, y) => [r,g,b]|gray)`.
  **`paintPixels` returns an HTMLCanvasElement, not a texture** (unlike the `*Texture` factories): wrap it,
  `canvasTexture(paintPixels(256, f), { repeat })`, before using it as a `map`.
- `uploadTexture(stage | renderer, ...textures)` (pass 6): `needsUpdate = true` + `renderer.initTexture(tex)` NOW. Call it in renderAt
  right after redrawing a CanvasTexture/DataTexture, before `stage.render` (determinism trap, `style-authoring.md` §5).

### 2.7 `text.js`

`createTextLabel(text, opts) → Mesh`: a PlaneGeometry centred on the origin, facing +Z.
Options: `height=.6` (world height of one line), `fontSize=128` (canvas px), `font=FONTS.sans`, `weight=700`, `italic`, `color`,
`background=null`, `radius`, `padding=.25`, `maxWidth=0` (wrap width in canvas px), `align`, `lineHeight=1.15`, `letterSpacing`,
`stroke={color,width}`, `lit=false` (MeshBasic with toneMapped off), `castShadow` (alphaTest shadows), `anisotropy=8`,
`willReadFrequently=true` (pass 7; CPU-rasterised label canvas — `false` = the old GPU canvas).
**Exact colours:** `lit:false` is exact only when the stage has **no post stack**. With post on, the OutputPass tone-maps the whole
3D scene, labels included (measured: `#808080` → `#8d8d8d` under ACES), and bloom/tilt-shift/grain apply. For exact-colour UI put the
label on the overlay: `pinToScreen(stage, label, {...})` (§2.13).
`mesh.userData.setText(str)` redraws the label only when the string changes; a size change disposes the GPU texture so it re-allocates
(before 2026-11-13 a different-length string was uploaded into the first string's storage: frames depended on seek order). The
`document.fonts.ready` redraw now uses the CURRENT text (it used to restore the original, undoing an early `setText`). `FONTS = { sans, serif, mono, rounded, display }` are system stacks
(Helvetica Neue / Georgia / Menlo / ...) that resolve without network in headless Chrome on this Mac.
Glyphs are rasterized by the OS, so text is pixel-identical on this machine but may differ slightly on another OS.
Text is a flat plane: keep the camera within about ±60° of the plane normal, or rotate the label toward the camera's end position.

### 2.8 `post.js`

`createPost(stage, { bloom?, tiltShift?, vignette?, grain?, tint? }) → post`. This also sets `stage.post`.
- `bloom = { strength=.6, radius=.4, threshold=.85 }` (UnrealBloomPass). **The threshold is linear HDR luminance before tone mapping.**
  Lit light-coloured surfaces go above 1.0, so on light scenes use `threshold` 2–3. In testing, 0.95 hazed the whole neutral
  scene and 2.5 was clean. Dark or neon scenes use 0.6–1.0, with emissive `strength` above 1 on the parts that should glow.
- `tiltShift = { focus=.5 (0 bottom..1 top), range=.12, blur=6 }` (two separable passes)
- `vignette = { darkness=.45, offset=1.0 }`, `grain = { amount=.04, fps=30 }`, `tint = hex`
- Pass order: Render → Bloom → TiltShift H/V → Output (tone map and sRGB) → Finish (tint, vignette, grain).
- `post.render(t)` is stateless. Grain is `hash(pixel, floor(t·fps))`. No pass reads the previous frame.
- `post.set({...})` updates parameters live, for example to drive bloom strength from `t` inside `renderAt`.

### 2.9 `builders.js`

- `createGround({ size=40, material, color, roughness=.9, shadowOnly=false, shadowOpacity=.25 })`
- `createCyclorama({ width=40, depth=20, height=14, radius=5, segments=24, material, color })`: a seamless floor-to-wall sweep.
- `createTile({ w=1.6, h=1, d=.12, radius=.06, material, color })`: a rounded slab. `floatAt(t, { amp=.08, speed=1, phase }) → { y, rx, rz }`
- Re-exports `RoundedBoxGeometry`.

### 2.10 `spec.js` (plain data → Three)

- `materialFromSpec(m, name?)` / `materialsFromSpec({ name: m })` (sets `material.name = name`), `textureFromSpec(t)`, `geometryFromSpec(primitive, dims)`
- `lightsFromSpec` (re-exported from `lights.js`)
- `objectsFromSpec(scene, OBJECTS, materials, { textStyle, factories }) → { [id]: Object3D }`. Stores `userData.spec`, `userData.base`
  and `userData.intrinsicScale`. Parents are resolved via `parent: id`, which must appear earlier in the list.
  **Scale (spec and tracks) multiplies the constructed scale** (`intrinsicScale`: `[1,1,1]` for primitives, the plane size for text, whatever a
  factory set). So `scale: 0 → 1` on a text label keeps its aspect (it used to reset the plane to 1 × 1). `base.scale` is in these spec units.
- `animateObjects(objs, timeline|BEATS, t)`: applies every object's `anim` tracks.
- `evalTrack(tracks, timeline, t, base)`: at time `t`, the last track that has started applies (eased and clamped). Before the first track starts, that track's `from` holds, so entrances start hidden.
- `applyStyleSpec(stage, STYLE_SPEC, { post=true }) → { materials, lights, post, shadowType }`: applies world (background, `sky`, fog,
  environment, toneMapping, exposure, shadowType), camera **fov, near, far** (near/far used to be ignored), lights, materials, post. Sets `stage.styleSpec`.
- `resolveShadowType(world, lights)`, `skyTexture(sky)`, `warnOnce(msg)` (validation messages show as `[atlas] ...` in `hyperframes check`).

### 2.11 `sound.js` (pure DSP; Node + browser; sample-deterministic)

- `renderScore(score, { duration, sampleRate=48000, seed=1, master=.8, duck=[], duckLevel=.3, duckAttack=.08, duckRelease=.35, ceiling=.89 }) → { left, right, sampleRate }`
  - `score = [{ t, type, gain=1, pan=0, bus?, seed?, ...voiceOpts }]`. `t` is the onset. Each event's noise is seeded from
    `hash(type) ^ round(t·1000) ^ seed ^ global seed`, so two **same-type events in the same millisecond are identical** unless
    you give them different `seed`s (per-event `seed` has existed since the first kit; use integers ≥ 2 — `seed` equal to the
    global seed cancels out).
  - There are two buses. `pad` defaults to `music`; everything else defaults to `sfx`. The music bus ducks inside the `duck` ranges.
  - The master goes through a look-ahead peak limiter (2 ms attack, 120 ms release) to a ceiling of about -1 dBFS, then a soft safety clip.
- `encodeWav(buf) → Uint8Array` (16-bit stereo PCM)
- DSP building blocks: `biquad(sr, "lp"|"hp"|"bp"|"peak", f, q)`, `onePole`, `adEnv`, `ahr`, `limit`
- Voices (`VOICES`). Every voice accepts `dur` and `pitch` (a multiplier).

| type | opts | notes |
|---|---|---|
| `whoosh` (`whooshIn` / `whooshOut`) | `dur=.6, dir="in"\|"out", q=1.6` | "in" peaks ~70% into `dur`; "out" peaks ~25% in |
| `pop` | `dur=.12` | pitch drop 1200→300 Hz plus a click |
| `click` / `tick` | `dur=.03` | |
| `paper` / `rustle` / `fold` | `dur=.45, fold, density=.35` | `fold` adds a crease thump at 75% |
| `thud` / `impact` | `dur=.45` | |
| `riser` | `dur=1.5` | **ends** at t+dur |
| `chime` / `sparkle` | `dur=1.4, sparkle, notes=6` | |
| `bubble` | `dur=.1` | |
| `rumble` | `dur=2` | |
| `clack` | `dur=.12` | mechanical double click |
| `blip` | `dur=.08, notes=[0,4,7]` | `notes` are semitones; one `dur` per note |
| `buzz` / `hum` | `dur=1.5, hz=120, flicker=.3` | neon hum; `hum` = 60 Hz, no flicker |
| `pad` | `dur=6, root=220 (Hz), chord=[0,4,7,11] (semitones), attack, release, brightness=1200` | music bus. **`brightness` is a low-pass cutoff in Hz** (300 dark, 600–900 warm, 2000+ bright), not 0..1: values < 40 warn and are inaudible (0.35 measured −89 dBFS rms) |
| `squish` | `dur=.32` | wet clay / dough plop + gloopy smear |
| `penScratch` | `dur=.5, speed=1` | pen/pencil/plotter scratch on paper; one per stroke |
| `murmur` | `dur=2.5, density=.6` | crowd/audience murmur (formant-filtered syllable bursts) |
| `servo` / `whir` | `dur=.8, hz=110, hz2=220, grit=.3` (`whir`: grit .15) | motor/servo tone gliding hz → hz2 |
| `pluck` (pass 7) | `dur=1.2, hz=220, decay=1 (s to −60 dB), bright=.6, notes=[0], step=.09` | Karplus-Strong string, exact pitch (fractional delay); `notes` = strum. Measured, not listened to: ≈ −30 dB rms over its `dur` at gain 1 (single note) |
| `marimba` (pass 7) | `dur=.9, hz=440, decay=.2 (s, fundamental 1/e), notes=[0], step=.12, mallet=.5` | wooden bar, partials 1 : 4 : 10 (upper ones decay 3–7× faster) + mallet click, 30 ms end fade. ≈ −18.5 dB rms at gain 1 (measured, not listened to); chords can sum above 1.0 — lower `gain` |

### 2.12 `player.js`

`attachPlayer(api)` is loaded only by `stage.mount` when `isPreviewContext()` is true. It provides
play/pause (or Space), scrub, ←/→ frame step, a time readout, a sound toggle, and a voiceover file
picker. The rAF loop only *calls* `renderAt(t)`. Audio is the same `renderScore` buffer, played through
an AudioContext that starts on click. A loaded voiceover plays from t=0 alongside the SFX.
Under HyperFrames render, check, or snapshot, nothing is added to the DOM.

### 2.13 `overlay.js` (UI drawn after post)

- `getOverlay(stage) → { scene, camera, aspect, add(obj), remove(obj), render() }`. Created on first call; `stage.render` then draws it after
  post with its own orthographic camera. Everything on it is `toneMapped:false`, `fog:false`: **exact palette colours, no bloom, blur, grain or vignette**.
- `pinToScreen(stage, obj, { x=0, y=0, height=.06, world=null, offset=[0,0] })`: puts obj on the overlay at NDC (x, y) (−1..1, y up);
  1 object unit = `height` × frame height, **multiplied by the object's own scale at its first pin** (stored in `userData.pinBase`), so a
  text label keeps its aspect (it used to be squashed to 1 × 1; wrapping in a Group is no longer needed). `world: [x,y,z]` anchors it to a 3D point through `stage.camera` (call every frame);
  `obj.userData.offscreen` is true (and obj hidden) when the point is behind the camera. `obj.userData.pinScale = [sx,sy,sz]` multiplies the scale (e.g. a fold).
- `projectToScreen(stage, p) → { x, y, behind }`, `exactColours(obj)`.
- Overlay objects never occlude against the 3D scene. A label that must hide behind geometry stays in the scene (and gets tone-mapped).

### 2.14 `motion.js` (pure f(t))

`pop(t, start, dur=.5, overshoot=1.9)` (outBack grow, 0 before start) · `hopArc(u, height)` (parabola, peak at u=.5) ·
`growAll(group, t, start, { spread=1, dur=.5, overshoot })` (children by `userData.delay`, scale from `userData.baseScale`) ·
`hinge(t, popAt, foldAt=∞, { pop:{stiffness,damping}, foldDur=.36, foldEase })` (spring open, eased fold) · `stagger(i, step=.13)` ·
`flicker(t, onTime, seed, { dur, pulses, pulseLen, pulseLevel, dark, hum, humHz, fps=30, off, offDur })` (seeded switch-on stutter + hum; `FLICKER_DEFAULTS`).

### 2.15 `terrain.js`

- **Node-safe since pass 6:** `heightField` and `descentPath` live in `heightfield.js` (pure, imports only `noise.js`/`time.js`);
  `terrain.js` re-exports them, so existing imports keep working. Planners/scene.config.js import `./_atlas/kit/heightfield.js`.
- `heightField(spec) → h(x, z, { detail })`: `{ offset, terms: [bowl|gauss|ridge], noise: {amp, scale, octaves, seed}, island: {rx, rz, edge, drop} }`.
- `descentPath(h, { start, lr, momentum, steps })` (gradient descent, precomputed).
- `facetize(geometry, tone | (f, centroid, normal) => color, { jitter: {lightness, hue}, seed })`: non-indexed, flat normals, one vertex colour per face.
- `terrainMesh({ width, depth, segX, segZ, height | field, seed, jitter, color(f, cen, n, hNorm), range, floor, faceJitter, material })`
  → Mesh with `userData.heightAt(x,z)` (exact faceted surface), `normalAt(x,z)`, `field`, `bounds`. Use a `vertexColors` material.

### 2.16 `paths.js` / `pathmath.js` / `strokefont.js`

- `pathmath.js` (pure, Node-safe): `expandStroke(stroke, scale, offset, z)` (points + `["a",cx,cy,rx,ry,deg0,deg1]` arcs), `filletPath(pts, r)`,
  `pathLength(pts)`, `pointAt(pts, s) → {p, t}`, `vec3`.
- `paths.js` (re-exports pathmath): `sweepGeometry(pts, radius, radial=12)` (tube, parallel-transport frames, open ends),
  `tubeAlong(stroke, { radius, bend, radial, caps })` (expand + fillet + sweep + sphere caps), `rodGeometry(a, b, r, seg)`.
  **Winding:** tubes wind outward (front faces outside) since 2026-11-13; before, triangles faced inward and only the explicit normals
  hid it. The temporary `inward` legacy option was removed once no style used it.
  `pathFrames(pts, upHint)` + `profileSweep(frames, profile [[b,n]...], { uScale, caps })`: hard-edged 2D cross-section swept along a path (rails, gutters, trim).
  `roadGeometry(points2D, { width, bend, y, curb, step }) → { geometry, path, length, at(s) }`: flat ribbon + side walls along a path.
- `pathmath.sagPoints(anchors, { sag=.22, step=.15 })`: drooping cable/rope polyline between anchors.
- `strokefont.js` (pure): `STROKE_FONT` (single-stroke uppercase/digits/punctuation, cap height 1) and
  `layoutStrokeText(text, cap, { letterSpacing=.25, wordSpacing=.52, lineHeight=1.55, align, bendRadius=.09 }) → { chars:[{ch,i,x0,x1,line,strokes}], width, lines }`.

- Stroke font extra glyphs (2026-11-13): `— · → Ø ×`.

### 2.17 `shapes.js` (cut-outs and cards)

- `shapes.{rect, roundRect, bubble}` are bottom-centre anchored; `circle, ellipse, scallop, star` centred; `poly(pts)`, `withHoles(shape, holes)`. Also named exports.
- `cardGeometry(shape, thickness, curveSegments=24, normalizedUV=false) → { geo, bbox }`: groups 0 front / 1 back (UV mirrored) / 2 cut edge.
- `cardMesh(shape, { thickness=.012, front, back, edge, curveSegments, normalizedUV })` → Mesh with `[front, back, edge]` materials.
- `hingeGroup(content, { axis="x", closed=π/2, open=0 })` → pivot with `userData.setOpen(u)` / `setAngle(a)`; feed it `motion.hinge(t, ...)`.

### 2.18 `textures.js` additions

- `paintPixels(size | [w, h], f)`: non-square canvases (u = x/w, v = y/h).
- `woodTexture({ size, boards, seed, grainFreq, grainWarp, contrast, dark, mid, light, seam, repeat })` (also `TextureSpec.source: "wood"`).
- `printTexture(bbox, draw(h), { pxPerMetre, maxPx, background, colors, font, weight, textColor, multiply:{canvas, repeatPerMetre} }) → { texture, canvas, s }`:
  print artwork in face metres (`h.text/measure/fill/stroke/circle/rect/roundRect/X/Y`). `printedMaterial(template, bbox, draw, opts)` = the card-face material.

### 2.19 Pass-2 promotions (2026-11-13)

- `lines.js` (`blending: "normal"` now outputs straight alpha `vec4(colour, level×coverage)` so edges fade to the background,
  not to black; MAX blending keeps the premultiplied form; `lineMaterial({ straightAlpha })`): `screenLines(stage, polys, { width (px), color, level, dash ([dash,gap,dot,gap] m), depth "visible"|"hidden"|"none", bias=.03,
  hidden:{width,color,level,dash}, order "sequential"|"parallel", gap, capacity, blending "max"|"normal" })` → Mesh with
  `userData.setProgress(p)`, `setLevel(k)`, `setPolys`, `headLocal(p)`. Exact pixel widths, analytic AA, round caps, draw-on, dashes.
  Raw parts: `lineMaterial`, `plotWindows`, `fillBuffers`, `quadGeometry`, `MAXBLEND`. Pair with a depth-only fill
  (`MeshBasicMaterial({ colorWrite:false, polygonOffset:true, polygonOffsetFactor:3, polygonOffsetUnits:2 })`) to hide back lines.
- `edges.js`: `analyseEdges(geometry, featureDeg=24) → { verts, feature, cand }`, `chainEdges(verts, edges)` → polylines,
  `silhouetteSegments(verts, cand, camera, object)` (per frame; perspective or orthographic),
  `outlineMesh(stage, mesh, { creaseDeg=30, color, width, creaseWidth, level, creaseLevel, bias, blending="normal" })` → `{ crease, sil, sync(camera), style() }`:
  ink creases + per-frame silhouettes on SHADED meshes (call `sync(camera)` after the camera moves).
- `noise.js` (pure): `noise3(x,y,z,seed)`, `fbm3(x,y,z,seed,oct=3)`, `h3`.
- `materials.js`: `objectSpaceBump(material, { freq=40, strength=.002, offset })` — UV-free micro relief (uniforms in `userData.objBump`).
- `voxels.js`: `occupancyMasks(pos, n, active, tol)`, `voxelMaterial(base, { fill, ao:{strength,radius,corner} })` (per-face neighbour AO,
  instance attribute `voxMask`), `cubeSteps`, `waveKey`, `flightPose(home, i, t, opts)` (closed-form scatter → assemble).
- `bitmapfont.js` (pure): `FONT_5X7`, `FONT_W/H`, `measureBitmapText`, `bitmapTextCells(str, { spacing, lineGap, align })`.
- `motion.js`: `dropIn(t, start, dur, from)`, `spinAngle(t, start, rate, ramp)`, `onTwos(t, fps=15)`, `poseIndex`, `squashScale(sy)`.
- `textures.js`: `blobTexture()` (radial alpha), `softRectTexture({ soft, radius })` (rounded-square drop shadow), `gradientTexture`
  stops accept an optional alpha `[pos, color, alpha]`.
- `builders.js`: `contactShadow({ w, d, opacity, color, y })`. `post.js`: `focusOn(stage, point, { range, min, max })` (aim tilt-shift).
- Not promoted (documented pattern instead): split-flap's per-instance glyph-atlas selection — see `style-authoring.md` §4.

### 2.20 `export.js` (Blender hand-off; browser-only, never used at render time)

Driven by `scripts/export-blender.mjs`. `install()` sets `window.__atlasExport`; `rendererReport`, `lightReport`, `materialReport`,
`textureReport`, `bake(api, ids, {fps, frames})` (calls the real `renderAt` per frame), `exportGLB(stage, ids)`. Output format: `references/blender-translation.md` §10.

### 2.21 Pass-3 promotions (2026-11-13)

- `studio.js`: `studioEnvironment(stage, S, { lights })` (procedural softbox/strip/card environment → PMREM, memoised; `studio.set({ level,
  sweepU, sweepLevel, yaw, rotation })`), `reflectiveSweep(stage, material, { resolution, strength, facing, blur, fade, envIntensity, sweep,
  center })` (blurred-mirror cyclorama; call `floor.userData.renderReflection(renderer, scene, camera)` before `stage.render`),
  `depthOfField(stage, { aperture, maxblur, focus, relativeAperture })` → `{ pass, setFocus(distance) }` (BokehPass after the render pass;
  pass-7 focus rules in §2.25). See studio-product's spec for `S`.
- `callouts.js`: `callout(stage, label, { dir, knee, run, sub, look })` (hairline elbow to a 3D anchor; `userData.update(t, { anchor, on, off })`),
  `titleLockup(stage, title, { sub, x, y, size, rule, look })`, `overlayText`, `hairline`, `CALLOUT_LOOK`.
- `stagecraft.js`: `followSpot({ from, to, angle, color, intensity, beamOpacity, beamSoftness, dust, dustScale, penumbra, softness, mapSize })`
  (SpotLight + additive dusty cone beam; `aim`, `setLevel`, `setTime`), `pleatedCurtain({ width, height, z, seed, material, cloth })`
  (`setOpen(u)`), `archOutline({ halfWidth, height, rise, y0 })`, `archBand(outer, inner)` (U band as one polygon).
- `schedule.js` (pure, Node-safe): `scoreFromEvents(events, voices, { pan, seedBase, seedStep })` (planned events → SCORE with distinct seeds),
  `minSeparation(tracks, t0, t1, dt)`, `shotKeys(shots)` (hard cuts for the camera rig), `pulse`, `fadeWindow`, `wavePlan`, `odometerValues(v, digits)`.
- `effects.js`: `burst(material, { count, seed, colors, speed, up, gravity, life, geometry })` (`update(tau)`), `groundPulse(groundFn, { segments, color, lift })`.
- `materials.js`: `fresnelGlass({ color, alphaFace, alphaRim, fresnelPower, rim, rimStrength, innerGlow, toLight, ... })` (no transmission pass).
- `textures.js`: `plaqueCanvas(text, { kind: "engraved"|"stamped", cap, font, metal, ink, wood, glintScale })` → `{ canvas, rm, w, h }`, `digitDrumTexture({ font, ink, paper })`.
  The engraved bevel glint is offset a fixed 6 mm (doubles lettering below ~0.1 m cap); pass 6 adds opt-in `glintScale` = offset as a
  fraction of `cap` (0.02–0.03; 0.03 × cap 0.2 = the old 6 mm). Default output unchanged.
- `shapes.withHoles` now WARNS when a hole crosses the outline (measured: three then fills the whole shape = renders solid; a hole merely
  touching the outline cuts fine). Notch the outline instead (`archBand`).
- Not promoted: exploded-view's assembly manager (`explode.js`) and spotlight's cue helpers stay with their styles (too specific).

### 2.22 Pass-4 (2026-11-13): determinism tools and promotions

- `selfcheck.js` + `scripts/check-frames.mjs --deep`: in-page `selfCheck(window.__atlas, times)` renders every probe time after t=0,
  in a shuffled interleaved order and twice in a row, compares canvas pixel hashes (`canvasHash`), and scans the raw HDR scene for
  NaN/Inf (`hdrScan`; pass 6: every pixel at full resolution — it was a 1/8-size target sampled on a 48 × 48 grid and missed a NaN). Catches canvas-state carry-over, stale matrices, first-state-wins programs, NaN shaders.
  Verified on planted bugs (accumulation → order/repeat failures; `pow(-1, .5)` → NaN count).
- `materials.GLSL_SAFE`: `safePow`, `safeNorm`, `safeDiv` for custom shaders (pow of a negative = NaN; bloom smears it across the frame).
- `studio.depthOfField(stage, { aperture, maxblur, exclude, legacyPrepass })`: the BokehPass depth pre-pass now hides objects that write
  no depth in the real render (`skipsDepth`: `userData.noDepth`, lines/points/sprites, all-`depthWrite:false` materials such as
  screenLines ribbons, decals, contact shadows, additive glows). `legacyPrepass: true` keeps the old behaviour (studio-product and
  toy-brick pass it to stay pixel-identical; without it their frames change by thin sub-pixel rims at decal edges, max 29-53 levels).
- `post.insertBefore(pass, "output"|"finish", key)`: add a pass at a known stage ("output" = linear HDR before tone mapping).
- `choreo.js` (pure): poses (`pose`, `mixPose`, `offsetPose`), `SPRINGS`, `progress`, `track(t, keys)` (spring/ease keyed pose tracks,
  closed form), `flyFrom`, `recede`, `flipAngle`, layouts (`fanLayout`, `stackLayout`, `gridLayout`, `rowLayout`), typing
  (`typePlan(text, start, { cps, jitter, seed })` → per-character times also used for key-tick SCORE, `typedCount`, `keyTimes`, `caretOn`),
  `bezierPath`, `along`, `window01`, `ramp`. (crt-retro's `planScreen` is the same typing idea extended to a whole terminal session; kept local.)
- `bitmapfont.js`: extra 5×7 glyphs `> < _ · [ ] ( ) | * ; ↓ ▒`; `BOX_CHARS` (box-drawing arms per cell).
- `materials.plasticSurface(material, { roughFreq, roughVar, scratchFreq, scratchAmount, scratchCover, bumpFreq, bumpStrength })`:
  UV-free roughness blotches + micro-scratches + moulding ripple.
- `shapes.slabGeometry(poly, thickness, uvOf, colorOf)`: two-sided convex facet with front/back/edge groups. `textures.chiyogamiCanvas({ pattern:
  "seigaiha"|"shippo"|"kanoko"|"asanoha", ground, ink, accent, px, seed })`: seamless Japanese paper tiles.
- `pathmath.strokeOutline(points, halfWidth, { cap })`: closed outline around an open polyline (cut-out letters). `paths.liveTube(n,
  radial, radius, material)`: tube whose centreline is rewritten each frame (`userData.set(points)`).
- Not promoted (style-specific or not general enough yet): floating-screens' fake projected shadows and card painter (pattern documented
  in style-authoring §5), CRT screen shader and env-only glass, toy-brick build planner/`validateLayout`/sticker, felt fuzz shells and
  stitch planner, origami fold engine, hologram's per-line scan uniforms.

### 2.23 Pass-5 (2026-11-13): batch-4 promotions and tooling

- `fontoutline.js`: `loadFonts({ load, families, timeout })` (await before building type; report says which faces really
  resolved), `glyphOutline(ch, { font, tracePx, simplify })` (raster → marching squares → RDP → even/odd shapes), `kerning`,
  `glyphGeometry(ch, cap, T = EXTRUDE_TYPE, font)` (bevelled extrusion keeping the true outline), `layoutLine(text, cap, { tracking })`.
- `post.whipBlurPass(stage, taps = 9)` → `pass.userData.set(px)` horizontal whip blur before tone mapping.
- `overlay.screenCanvas(stage, wPx, hPx, draw, { upload=false, willReadFrequently=false (pass 7, opt-in) })` → 1:1 screen-pixel canvas on the overlay (`place(xPx, yPx, scale)`, `set(state)`
  redraws only when the JSON state changes, `opacity(a)`): exact-pixel UI (lower thirds, tags, tickers). Pass 6: `upload: true` uploads
  the canvas at build and inside every redrawing `set()` (`renderer.initTexture`) — use it for new styles; the default stays lazy.
- `optics.js` (pure): convex glass pieces (`prismShape`, `boxShape`, `gemShape`, `sphereShape`, `lensShape`, `rodShape`, `worldShape`),
  `trace(ray, pieces)` with per-wavelength `ior` (dispersion), `spectrum`, `refract`, `reflect`, `clipPath`, `polyFaces`, `nmToRGB`.
- `sdf.js` (pure): SDF primitive scene description for raymarched liquids (`prim`, `sph`, `cap`, `rbox`, `SHAPES`, `mixPrims`,
  `morphThrough`, `wobbleBlob`, `orbiters`, `splitPrims`, droplet plans). The raymarching shader is the liquid-chrome style's.
- `iso.js` (pure): `ISO` angles, `SCREEN_RIGHT/UP`, `isoKey(t, focus, viewHeight)` (true-isometric orthographic camera keys),
  `hexToRgb`, `rgbToHex`, `mixHex`, `threeTones(base, knobs)` (flat top/left/right face tones).
- `relief.js`: `bakeHeightLayers(layers [{ draw(ctx, W, H, ppm) }], { width, height, pxPerMetre, shoulder, pillowRadius })` →
  up to 4 relief layers per RGBA DataTexture (sharp + wide/pillow), baked once (embossing, deboss, coins, seals).
- Stroke font glyphs `_ ≠ ✗ ✓` (chalkboard).
- `scripts/check-frames.mjs` clears `renders/checks/` every run and writes `RUN.txt` (run time, MP4 mtime, newest scene/style
  edit) plus an **mp4-vs-code** verdict: it snapshots frame-aligned times and compares them with the exact MP4 frames (PSNR;
  identical code ≈ 32–45 dB through the encoder, < 26 dB = STALE). `--no-mp4-check` skips it. `scripts/build-index.mjs` also writes `references/STYLES.md`;
  `scripts/build-gallery.mjs` writes `3d-style-atlas-pilot/gallery.html` + `contact-sheet.jpg`.
- `studio.depthOfField` `legacyPrepass` is no longer used by any style (studio-product and toy-brick dropped it after a look review).
- Not promoted (style-specific shaders; copy from the style): glass-light's pre-render-then-refract glass material and one-draw-call
  beam mesh, liquid-chrome's raymarch mesh / chrome environment GLSL / sparkle points / barrel lens pass, isometric-pastel's planar
  shadows / unlit three-tone shader / dot-grid ground / `route.setDraw`, embossed-letterpress's relief sheet shader and analytic box
  shadow, chalkboard's board-canvas cache.

### 2.24 Pass-6 (2026-11-13): batch-5 promotions (styles 25–36) and tooling

- `framing.js` (pure, Node-safe — no THREE): shot maths for planners and build gates.
  - `sampleCameraKeys(keys, t, { drift, fov=35 })` → `{ pos, target, fov, roll, viewHeight }`: **bit-identical** to
    `createCameraRig(camera, keys, { drift }).sample(t)` — eases, `path: "arc"`, roll, `viewHeight`, drift sway and drift `orbit`
    (`test-kit.mjs`: 3 × 3001 samples, all equal). `fov` = the rig camera's fov (spec.camera.fov) for keys without one. `prepareKeys(keys, { fov })`.
  - `projectPoint(cam, p, { aspect=16/9, ortho })` → `[ndcX, ndcY, depth]` (three's `Vector3.project` to ~1e-15; depth ≤ 0 = behind),
    `cameraBasis(cam)`, `boxCorners(min, max)`, `screenExtent(cam, pts, opts)` → `{ m, x, y, behind }`.
  - `framingReport(regions, keys, { duration, t0, dt=1/30, drift, fov, aspect, ortho, safe=.9 })` → `{ ok, worst, fails, spans, samples }`.
    `regions = [{ id, pts | box:[min,max], from, to, required }]` (pts may be `(t) => points`) or `(t) => [{ id, pts|box }]`. Every sample
    where a required region passes |NDC| > safe (or goes behind the camera) is a fail; `spans` merges them per region into time ranges.
    Gate the build on it (chalkboard's pattern) and keep the subject large: a passing report with the hero at 30 % of frame is still a weak shot.
  - Local copies stay in chalkboard/chalk.js, card-table/dealer.js (and the circuit-board/subway planners' camera code); not refactored.
- `pathmath.js` octilinear router (from subway-map `routePath` + circuit-board `octiRoute`): `octilinearCorners(waypoints, { lead })`
  (grid points → 0/45/90° corners; `lead` "straight"|"diag", per leg as `[gx, gy, "s"|"d"]` or `{ at, lead }`), `chamferCorners(pts, c)`
  (each right angle → two 45° bends, PCB style), `arcTable(pts, { plane })` → `{ pts, cum, length, at(s) → {p, t, i} (O(log n)), project(q) → s }`,
  and `octilinearRoute(waypoints, { grid=1, origin=[0,0], plane="xz"|"xy", level=0, lead, bend="round"|"chamfer"|"none", radius=.5, chamfer=.3, step=0 })`
  → `{ corners, pts, cum, length, at, project, world(g), stationS(g) }`.
- `heightfield.js` (pure): `heightField`, `descentPath` moved out of terrain.js; `noise.js` now also holds `valueNoise2`/`fbm2`.
- `textures.uploadTexture`, `screenCanvas({ upload })`, `paperTexture({ variant: "even" })`, `plaqueCanvas({ glintScale })` (above).
- `time.js`: open-ended `lerp`/`invLerp`/`remap`/`beat`/`envelope` (§2.2).
- `selfcheck.js`: `hdrScan(stage, { scale=1, grid=0, locate=true })` scans every pixel of the raw HDR scene and returns `box` (frame px,
  top-left origin), `first`, and `hit` (the mesh a camera ray through the first bad pixel meets — a hint; shader-displaced vertices are
  not seen). `blackBlocks(read, { tile=16, around=24, min=2 })`: exact-black 16 px tiles inside lit areas in the FINAL frame (what NaN
  looks like after bloom, and NaN born in a post pass the scene scan cannot see) — reported as a warning. `readCanvas(stage)`. Run time:
  the whole in-page check took 1.2 s for clockwork's 6 probe times on the M1 Pro. Verified on a planted 2-pixel `pow(-1, .5)`: the full scan finds it, the old sparse scan did not.
- `scripts/test-kit.mjs`: Node tests for the above (`node scripts/test-kit.mjs`, exits 1 on failure). THREE is resolved from `vendor/`
  through a `node:module` resolve hook only for the rig comparison; the pure modules are imported first, which proves they are Node-safe.
- `scripts/new-scene.mjs`: every SCORE type it writes is validated against `VOICES`; a spec `sfx` role holding a description instead of a
  voice name falls back (`bed` → `pad`, `enter` → `pop`, `ui` → `click`, `move` → `whoosh`) with a note; a pad bed gets `root`/`brightness`
  in Hz; `dir`/`dur` only for whoosh. (The reported `sfx.bed` failure did not reproduce against the 37 current specs; all scaffold and
  `render-sfx` clean, and neutral/clockwork/weather-map scaffolds pass `build.mjs --skip-render` with 0 lint errors/warnings.)
- Not promoted (still local): chalkboard `boardShot`, card-table `tableShot` (shot *fitting* differs per subject geometry — framing.js gives
  the projection + replay they share), circuit-board's via/pin/pulse planner, subway's `layPlan`/`timetable`.

### 2.25 Pass-7 (2026-11-13): canvas determinism, DoF scale, framing windows + fitShot, pluck/marimba

- `canvas.js` (Node-safe, no THREE): `CANVAS_DEFAULTS = { willReadFrequently: true }`, `canvas2d(canvas, { willReadFrequently })`,
  `newCanvas(w, h, opts)`. **Every kit canvas that ends up in a texture or overlay is now created with
  `getContext("2d", { willReadFrequently: true })`** — `makeCanvas` (so all `textures.js` painters: paper, noise, grid, gradient,
  speckle, wood, print, plaqueCanvas, digitDrumTexture, chiyogami, blob/softRect, `paintPixels`), `createTextLabel`, relief masks and
  the `fontoutline` trace canvas. **Exception: `screenCanvas` is opt-in** (`{ willReadFrequently: true }`; default stays the GPU
  canvas): with it on by default, 40-bead-abacus failed its deep self-check — a ±1-level flicker on ONE pixel of the style's own
  GPU nameplate canvas when t=7.9 was revisited in shuffled order (old kit stable 3×40 renders; nameplate forced to CPU: stable;
  screenCanvas off: stable). New styles should opt in. Chrome's GPU 2D canvas rasterised large text slightly differently on each page
  load (newspaper-press); the CPU path is repeatable. The attribute only counts on the FIRST `getContext("2d")` of a canvas, so the kit
  creates the context at creation time; a style's later plain `getContext("2d")` gets the CPU context too (and a style that asked for
  `willReadFrequently` on a kit canvas — lab-glassware, pinball-table — now actually gets it). Opt-out per call
  (`{ willReadFrequently: false }`) or page-wide (`CANVAS_DEFAULTS.willReadFrequently = false` before building). Canvases a style
  creates itself with `document.createElement("canvas")` are not touched — create them with `newCanvas` / `canvas2d`.
  Pixel impact on the 51 demos: see `3d-style-atlas-pilot/_kit-regression-2026-11-13/pass7.md`.
- `studio.depthOfField` scale fix. BokehShader blurs by `clamp(aperture × (focus − depth), ±maxblur)` in METRES; the pass started at a
  fixed focus of 5 m, so a ~1 m set that never calls `setFocus` (mixing-console) sat 3.9 m in front of the focal plane and every pixel
  clamped at `maxblur` (uniform blur; reproduced with a 1 m test scene). Now, until `setFocus` is first called, the focus follows the
  camera rig's current target each frame (`camera.userData.rigTarget`, written by `rig.update`); no rig target → 5 m and a one-time
  `[atlas]` warning. `setFocus` keeps the old sticky behaviour exactly (the DoF demos call it every frame: hashes unchanged).
  New options: `focus: <number>` (old fixed focal distance), `focus: "target"` (always follow the rig target), `relativeAperture`
  (aperture = relativeAperture / focus each frame: blur depends on (focus − depth) / focus, so one value looks alike at 1 m and 10 m;
  try 0.004–0.01). Aperture 0 gives no blur (checked: equal to no DoF within half-float rounding).
- `camera.js`: `rig.update` stores the sampled target in `camera.userData.rigTarget` (no pixel effect).
- `framing.js`: `framingReport(..., { window, keepOut })` — `window: { x0, x1, y0, y1 }` NDC (y up) asymmetric safe window (per-region
  `window` override; missing sides = ±safe); `keepOut: [{ id, x0, x1, y0, y1, from, to }]` overlay rectangles (caption band, lower
  third) a required region's projected box must not overlap (region `keepOut: false` or `keepOut: [ids]` exempts). Fails now carry
  `reason` ("safe" | "window" | "behind" | "keepOut:<id>") and `over`; spans carry `reasons`. Without window/keepOut the result is the
  old one. `pxRect(x, y, w, h, { width, height })` → NDC rect from a top-left pixel box. `subjectPoints(subject)`.
  `fitShot(subject, { azimuth=0, elevation=.35, fov=35, aspect, ortho, window, fill=.9, align=[0,0], distance=[.05,500], roll, round=5 })`
  → `{ pos, target, fov, dist, extent, viewHeight? }`: a camera key on the given bearing (azimuth 0 = camera on +Z looking −Z; elevation
  above horizontal) at the distance where the subject (points / `{ box }` / mixed) fills `fill` of the window on its limiting axis,
  target shifted so the projected box sits at `align` (−1 left/bottom … 1 right/top). Checked in `test-kit` through the real rig +
  THREE projection (fill within 0.002, bearing within 1e-4 rad) and against bead-abacus' local `fitShot` (same key within 1 mm).
  Fill is per key — replay the whole move with `framingReport`. Local copies (chalkboard `boardShot`, card-table `tableShot`,
  bead-abacus / conveyor-factory / city-lights / star-chart / mixing-console `fitShot`, pinball `fieldShot`, ink-wash `sheetShot`,
  sticky-notes `boardShot`) were not refactored.
- `sound.js`: `pluck` and `marimba` voices (table in §2.11). The 26 existing voices/aliases render bit-identical (`test-kit`: sha256 of a
  fixed 12 s score over all of them equals the pass-6 kit's).
- `scripts/check-frames.mjs`: `RUN.txt` is written once at exit (also on a crash), via a temp name + rename; a locked/unwritable file or an
  undeletable old still prints a WARNING instead of crashing; stale `*conflicted copy*` files and temp files in `renders/checks/` are
  removed at the start of a run. RUN.txt now also records the determinism and deep self-check verdicts.
- `scripts/test-kit.mjs`: + sound golden hash, pluck/marimba pitch/partials/determinism, canvas defaults, framing window/keepOut, fitShot.

## 3. Style contract

A style is `styles/<id>/` with exactly two modules.

**`spec.js`** exports `STYLE_SPEC`. It is plain, JSON-serializable data with no THREE and no window:
```js
{
  id, name, description,
  palette: { bg, ink, primary, secondary, accent, ... },      // sRGB hex
  world: { background: hex|null, sky?: {top, horizon, horizonAt, bottom?}, fog?: {color, near, far}, environment?: "room"|null,
           environmentIntensity?, toneMapping?: "aces"|"agx"|"neutral"|"none", exposure?, shadowType?: "auto"|"pcfsoft"|"pcf"|"vsm" },
  materials: { <name>: MaterialSpec },
  lights: [ LightSpec ],             // may start from LIGHT_PRESETS.<preset>
  post: { bloom?, tiltShift?, vignette?, grain?, tint? },   // createPost params; {} = no post
  camera: { fov, near?, far?, drift?: {amp, speed, orbit} },
  text: { font: FONTS key or CSS stack, weight, color, height },
  sfx: { enter, exit, move, land, emphasis, ui, bed },      // VOICES type names
  motion: [ "signature motion notes, one sentence each" ],
}
```
- `MaterialSpec = { type: "standard"|"physical"|"basic"|"toon"|"lambert", baseColor, roughness, metalness,
  emission?: {color, strength}, clearcoat?, clearcoatRoughness?, transmission?, ior?, thickness?, sheen?, iridescence?,
  opacity?, flatShading?, vertexColors?, side?: "front"|"double", map?: TextureSpec, bump?: {...TextureSpec, strength, description}, roughnessMap?: TextureSpec }`
  - `vertexColors: true` multiplies baseColor by the geometry's `color` attribute (use `"#ffffff"` when vertex colours carry the palette).
  - `emission` works on standard, physical, toon and **lambert**; on `basic` it is ignored with a warning. `clearcoat` does **not** kill
    emission in r181 (measured): the coat's Fresnel dims it ~2 % facing the camera and ~30 % at the silhouette.
- `TextureSpec = { source: "noise"|"paper"|"grid"|"speckle"|"gradient"|"bumpNoise"|"wood", ...that factory's params, description? }`
- `LightSpec = { id, type: "directional"|"spot"|"point"|"hemisphere"|"ambient", color, groundColor?, intensity,
  position?, target?, angle? (rad, spot), penumbra?, distance?, decay?, shadow?: { softness, mapSize, extent, bias, normalBias } }`

**`style.js`** exports `STYLE_SPEC` (a re-export) and `createStyle(stage, opts) → style`:
```js
{ spec, palette, materials, lights, post, textStyle, camera,
  props: { <name>: (opts) => Object3D, ... },   // the look's building blocks
  factories: { <name>: (objSpec, materials) => Object3D },  // for OBJECTS with primitive "procedural"
  sfx }                                           // = spec.sfx
```
Rules:
1. Start with `const { materials, lights, post } = applyStyleSpec(stage, STYLE_SPEC, opts)`. Every number that defines the look belongs in the spec, not hard-coded in `style.js`.
2. `props` and `factories` are synchronous, deterministic (`rng(seed)` only), and do no network I/O. Time-dependent behaviour goes in helpers such as `prop.userData.update(t)`, which the scene calls from `renderAt`. Props never animate themselves.
3. Before writing a helper, check §2.13–2.19: overlay labels, motion, terrain, tubes, stroke font, shapes/cards, wood and print textures are already in the kit.
4. Geometry that cannot be described as primitives goes in `factories`. Its OBJECTS entry carries `procedural: "<one-line description>"` so non-Three translators know what it is.
5. Use only the kit and the vendored three addons. Do not edit `kit/`; propose kit changes instead.
6. `styles/neutral/` is the reference implementation. Copy its shape.

## 4. Scene contract

A scene is a HyperFrames project with these files:

**`scene.config.js`**: plain data, importable from Node.
```js
export const ID, STYLE /* style id */, DURATION /* s */, FPS = 30;
export const BEATS  = [{ id, t, dur }];
export const CAMERA = [{ t, pos, target, fov, ease }];
export const OBJECTS = [{ id, primitive, dims, position, rotation, scale, material, castShadow?, receiveShadow?,
                          text?, textOpts?, parent?, factory?, procedural?, anim?: [AnimTrack] }];
export const SCORE  = [{ t, type, gain, pan, ...voiceOpts }];   // derive t from BEATS (see 00-smoke)
export const DUCK   = [];   // [{start,end}] voiceover phrases; duckFromBeats(beatsFromSrt(srt))
```
- primitives and their `dims`: `box {w,h,d}`, `roundedBox {w,h,d,radius,segments}`, `sphere {r,segments}`,
  `cylinder {rTop,rBottom|r,h,segments}`, `cone {r,h}`, `torus {r,tube,segments}`, `plane {w,h}`, `capsule {r,length}`,
  `icosahedron {r,detail}`, `text {height}` (+ `text`, `textOpts`), `ground {size, shadowOnly}`, `cyclorama {width,depth,height,radius}`,
  `procedural` (+ `factory`, `procedural`)
- `AnimTrack = { prop: "position"|"rotation"|"scale"|"opacity", beat?: id, at?: s, offset=0, dur? (default = beat dur),
  from?, to?, ease="inOutCubic" }`. Values are absolute. `scale` may be a scalar.

**`scene.js`**: the composition script.
```js
import { createStage, Timeline } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec, animateObjects } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/neutral/style.js";
import { DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK } from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const tl = new Timeline(BEATS);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });

function renderAt(t) {
  animateObjects(objs, tl, t);          // data-driven motion first
  // ...hand-written extras derived ONLY from t / tl.p(...) ...
  rig.update(t);
  stage.render(t);
}
stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
```

**`index.html`**: copy `Builder/HyperFrames/3d-style-atlas-pilot/00-smoke/index.html`. It needs these parts:
GSAP and the HyperFrames runtime `<script>` tags; the importmap (`three` → `./_atlas/vendor/three/three.module.min.js`,
`three/addons/` → `./_atlas/vendor/three/addons/`); a root `<div data-composition-id="main" data-start="0" data-duration=D data-width="1920" data-height="1080">`;
`<canvas id="stage" class="clip" data-start="0" data-duration=D data-track-index="0">` as a direct child (no wrapper div, to avoid the lint nesting warning);
`<audio id="sfx" src="sfx.wav" data-start="0" data-duration=D data-track-index="2" data-volume="1">`;
an optional voiceover `<audio id="vo" src="vo.wav" data-start="0" data-duration=D data-track-index="3">`;
an inline `window.__timelines["main"] = gsap.timeline({ paused: true })` (lint requires a registered timeline, and Three owns the motion);
and `<script type="module" src="./scene.js">`. Keep `data-duration` equal to `DURATION`.

### Scene-authoring rules (non-negotiable)
1. All state is set from `t` inside `renderAt`. Use no rAF, `Clock`, `Date.now()`, `performance.now()`, or `Math.random`, and no accumulation across frames (no `x += v`, no physics stepping, no trail buffers). Seeking must work in any order.
2. Build everything synchronously at module load. Load no remote assets. Procedural textures and the vendored three are fine.
3. Every number goes in `scene.config.js` where practical. `scene.js` adds only the motion that can't be described as tracks.
4. Sound cues derive from `BEATS` (`at("drop", 0.327)`), so retiming a beat retimes its sound.
5. Use text sparingly: system font stacks, at least 0.35 m tall at a typical 6–9 m camera distance, facing the camera's end position.
6. Keep camera moves slow (one move per 2–3 s), with no cuts inside a scene. Use the rig's `drift` for life during holds.

## 5. Build and render: exact commands

New scene and the one-command build (preferred):
```bash
SK="$HOME/Library/CloudStorage/Dropbox/D Second Brain/Skills/3d-style-atlas"
node "$SK/scripts/new-scene.mjs" <project dir> --style <id> [--duration 6]   # valid project wired to the style
node "$SK/scripts/build.mjs" <project dir> [--checks 1,4.5,9] [--blender] [--crf 22] [--skip-render]
#   sync-kit -> render-sfx -> export-spec -> lint (0 err, 0 warn) -> check -> render (standard, CRF 22); exits 1 on failure
node "$SK/scripts/check-frames.mjs" <project dir> --times 1,4.5,9   # renders/checks/t*.png + seek-order determinism + volumedetect
node "$SK/scripts/export-blender.mjs" <project dir>                 # <project>/export/ (bake, glb, textures, refs, manifest)
node "$SK/scripts/test-kit.mjs"                                      # kit maintainers: Node tests of the pure maths
```
Encode default: `--quality standard --crf 22` (x264 medium); override with `build.mjs --crf N`. The pilots at the old CRF 18 were
16–33 MB for 15 s. Dense grids under a constantly moving camera (voxel: ~1.1 MB/s at 22) need `--crf 25`–`26` to stay under ~12 MB.

The individual steps:
```bash
SK="$HOME/Library/CloudStorage/Dropbox/D Second Brain/Skills/3d-style-atlas"
cd "<project dir>"                          # e.g. .../Builder/HyperFrames/3d-style-atlas-pilot/00-smoke
node "$SK/scripts/sync-kit.mjs" .           # copy kit/styles/vendor -> ./_atlas (re-run after kit/style edits)
node "$SK/scripts/render-sfx.mjs" .         # scene.config.js SCORE -> ./sfx.wav (deterministic)
node "$SK/scripts/export-spec.mjs" .        # -> ./scene.spec.json (style + scene, renderer-agnostic)
npx hyperframes lint                        # must be 0 errors, 0 warnings
npx hyperframes check                       # runtime + layout + audio gate
npx hyperframes render --output renders/<id>.mp4 --fps 30 --quality standard --crf 22
# optional checks
npx hyperframes snapshot --at 1,3,4.5 --no-end -o /tmp/snaps   # exact-time stills
node "$SK/scripts/serve.mjs" . --port 4321   # standalone preview player at http://localhost:4321/
```
Voiceover: put `vo.wav` in the project, add the `<audio id="vo">` element, and set `DUCK` from its SRT
(`duckFromBeats(beatsFromSrt(srt))`). Then re-run `render-sfx`. Beats can also come from `beatsFromSrt` or `beatsFromWords`.

`export-spec.mjs` output: `{ format: "3d-style-atlas/spec@1", conventions, style: STYLE_SPEC, scene: { id, style, duration, fps, resolution, beats, camera, objects, score, duck, notes } }`.
