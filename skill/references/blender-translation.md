# Three.js → Blender translation guide

How to rebuild a 3d-style-atlas scene (`scene.spec.json` from `scripts/export-spec.mjs`) in Blender with Python (`bpy`) so it matches the Three.js render: same framing, same timing, same look. An agent should be able to follow it step by step.

- **Target:** Blender **5.3** (the current stable release; `blender-v5.3-release` reports `BLENDER_VERSION 503`, cycle `release` — [version header](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/blenkernel/BKE_blender_version.h)). The long-term-support line is **5.2 LTS**. The places where 4.2–4.5 differ are noted.
- **Three side:** the vendored `vendor/three` is **r181**. The kit modules this guide relies on are `kit/spec.js`, `kit/camera.js`, `kit/lights.js`, `kit/post.js`, `kit/time.js`, `kit/core.js` and `kit/builders.js`.
- **Companion script:** `references/blender/build_scene_skeleton.py`.
- **Verification status:** see §0.

---

## TLDR

1. **Axes.** Blender = C · Three, where C = Rx(+90°). Positions map `(x, y, z) → (x, −z, y)`. For meshes, empties and anything else whose geometry you build in Blender: Euler XYZ `(a, b, c)` → `rotation_mode='YZX'`, `rotation_euler=(a, −c, b)`. Quaternion `(x, y, z, w)` → Blender `(w, x, −z, y)`. Scale `(sx, sy, sz)` → `(sx, sz, sy)`. Cameras and lights already share Three's local frame (look down −Z, +Y up), so they take only the left multiply: `R_blender = C · R_three`. All of this was checked numerically against three r181.
2. **Camera.** Use `sensor_fit='VERTICAL'`, `sensor_height=24`, and `lens = 24 / (2·tan(fov°/2))`. Three's `fov` is the **vertical field of view in degrees**. Bake the camera every frame from the kit rig. The kit lerps position and target separately, then does a look-at, then adds drift and roll. Blender keyframes can't reproduce that without baking, and baking makes it exact.
3. **Easings.** Every kit easing maps exactly onto a Blender F-curve interpolation mode, except the Expo family (off by ≤ 0.098 % of the change) and `outElastic`, which needs `amplitude = |change|` and `period = 0.3·segment_frames`. Blender's elastic defaults (0.8, 4.1) are wrong for this. `spring()`, overlapping tracks and hand-written `renderAt` code must be **baked**.
4. **Lights.** Use the *Unitless* (glTF-IO "COMPAT") convention: sun strength (W/m²) = Three directional intensity (lux), and point/spot watts = 4π × candela. Do **not** divide by 683; that photometric convention renders about 683× darker than Three. Ambient or hemisphere intensity I becomes world radiance I/π.
5. **Color.** Blender color sockets take **linear** RGB, so convert hex with the sRGB EOTF. Set the view transform to match `toneMapping`: `none → Standard`, `neutral → Khronos PBR Neutral`, `agx → AgX`, `aces → ACES 1.3` plus exposure `log2(exposure/0.6)`. The last two are approximate. For a near-exact color pipeline, render linear EXR and apply Three's own tone-map and post shaders in numpy (§5.4).
6. **Post.** Bloom and tilt-shift run in linear space before tone mapping, so do them in Blender's compositor or in numpy on EXR. Tint, vignette and grain run **after** tone mapping on sRGB values, so apply the kit's exact shader math to the output PNGs.
7. **Output.** Render PNG frames with EEVEE, then mux the WAVs with ffmpeg. Don't render audio inside Blender.
8. **The data gap is now closed by `node scripts/export-blender.mjs <project>`** (§10.5): a per-frame bake taken from the real `renderAt` (camera, every node's world matrix and visibility, lights, material values, post), `geometry.glb`, canvas textures and labels as PNGs, resolved renderer and light settings (with `sunAngleDeg` / `sourceRadius`), audio paths and reference frames. Still missing: vertex-animated meshes (listed as `bake.deforming`) and the room environment HDR.

---

## 0. What was verified, and how

| Claim | Status |
|---|---|
| Axis mapping, YZX-Euler rule, quaternion rule, scale rule, camera rotation `C·R`, look-at construction | **Executed.** Node script vs vendored three r181, 200 random rotations and 100 random look-ats, max residual 3.6e-15. |
| `fov → lens` formula; Three's `getFocalLength()` = Blender `lens` with `sensor_fit='HORIZONTAL'`, `sensor_width=35` | **Executed** (same script). |
| Every kit easing vs Blender's easing code (ported verbatim from [`blenlib/intern/easing.cc`](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/blenlib/intern/easing.cc), v5.3) | **Executed.** Exact to 1e-15, except Expo (≤ 9.77e-4 of the change) and elastic with Blender's default amplitude/period (57 % off). |
| `evalTrack` → keyframe translation (`tracks_to_keys` in the script), evaluated with Blender's F-curve semantics vs the kit `evalTrack` | **Executed** (`--selftest`). Random track sets were checked on every integer frame; max error 2.3e-14. The test caught a real bug: float drift put a key at frame 31.000000000000004. It is fixed now. |
| Kit camera rig port + baked Blender rotation vs three `camera.lookAt` + `rotateZ` | **Executed** (`--selftest`). Max error 2.2e-16. |
| Icosahedron vertex/face table == three `IcosahedronGeometry(1,0)` | **Executed.** |
| bpy API names (sockets, properties, enums, Glare inputs, view-transform names, `media_type`, `strips`, channelbags, bmesh op arguments) | **Checked against Blender 5.3 source** (links inline). Not run. |
| Bake matrix conversion (`C·M·C⁻¹` for nodes, `C·M` for camera/lights), `load_export`, `sparse_at` | **Executed** (`--selftest` → `matrix_selftest`, 50 random affine matrices, max error 1.8e-15; `load_export` read the real `01-low-poly/export/`). |
| `export-blender.mjs` output | **Executed** on `00-smoke` and `01-low-poly`: glb parsed by the vendored `GLTFLoader` r181 and a structural chunk check, bake frames = duration × fps, every PNG non-empty. |
| **The whole bpy section of the script** (including the new glb-import + bake-keying path) | **UNEXECUTED.** Blender is not installed on this machine (`/Applications` has no Blender and it isn't on `PATH`), and I did not install it. |
| Pixel-level brightness/color agreement of any render | **UNVERIFIED.** Run the calibration scene in §10.4 first. |

Claims marked **(unverified)** below are reasoned or remembered, not tested. Treat them as hypotheses.

---

## Quick-reference conversion table

| Quantity | Three.js (spec) | Blender 5.3 | Exact? |
|---|---|---|---|
| Position | `[x, y, z]` m, Y-up | `location = (x, −z, y)` | yes |
| Mesh/empty rotation | Euler `[a, b, c]`, order XYZ, rad | `rotation_mode='YZX'`, `rotation_euler=(a, −c, b)` | yes |
| Mesh/empty quaternion | `(x, y, z, w)` | `rotation_quaternion = (w, x, −z, y)` | yes |
| Mesh/empty scale | `[sx, sy, sz]` | `(sx, sz, sy)` | yes |
| Camera/light orientation | matrix `R` | `C·R`, C = Rx(+90°); look-at = `to_track_quat('-Z','Y')` | yes |
| Vertical FOV | `fov` (deg) | `sensor_fit='VERTICAL'`, `sensor_height=24`, `lens = 12/tan(fov/2)` | yes |
| near / far | `near`, `far` | `clip_start`, `clip_end` | yes |
| Color | `"#rrggbb"` sRGB | linear floats: `c ≤ 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4` | yes |
| Directional light | intensity (lux) | SUN `energy` = intensity (W/m²) | derived; unverified in render |
| Point / spot light | intensity (cd) | `energy` = 4π·intensity (W) | derived; unverified in render |
| Spot cone | `angle` (half), `penumbra` | `spot_size = 2·angle`, `spot_blend = penumbra` | size yes; falloff curve differs |
| Ambient light | intensity I | world Background, strength I/π | derived; diffuse only |
| Hemisphere light | sky, ground, I | world gradient, strength I/π, gradient 1.5× steeper (§4.4) | derived; diffuse only |
| Env intensity | `scene.environmentIntensity` | world Background strength | yes, given the same HDR |
| Tone mapping | `none / neutral / agx / aces` | `Standard / Khronos PBR Neutral / AgX / ACES 1.3` | none and neutral ≈ exact; agx close; aces approximate |
| Exposure | `toneMappingExposure` e | `view_settings.exposure = log2(e)` (ACES: `log2(e/0.6)`) | yes (ACES approximate) |
| Time | seconds `t` | frame `t·fps`, `frame_start = 0` | yes |
| Easing | named (kit) | `keyframe.interpolation` + `.easing` (§7.2) | yes / ≤ 0.1 % / bake |
| Beat | `{id, t, dur}` | `timeline_markers.new(id, frame=round(t·fps))` | yes |
| Emissive | `emissive`, `emissiveIntensity` | `Emission Color` (linear), `Emission Strength` | yes |
| Clearcoat | `clearcoat`, `clearcoatRoughness` | `Coat Weight`, `Coat Roughness` (Coat IOR 1.5) | close |
| Transmission | `transmission`, `ior`, `thickness` | `Transmission Weight`, `IOR` (thickness: none) | approximate |

---

## 1. Coordinate systems and transforms

### 1.1 The basis change

Both apps are right-handed and use metres. Three is Y-up; Blender is Z-up. The basis change is a proper rotation, `C = Rx(+90°)`:

```
C = | 1  0  0 |        three (x, y, z)  ->  blender (x, -z, y)
    | 0  0 -1 |        three +Y (up)    ->  blender +Z
    | 0  1  0 |        three +Z (toward default camera) -> blender -Y
```

Because det C = +1, face winding and normals survive, and nothing gets mirrored.

### 1.2 Two kinds of node, two rules

Write a Three node's matrix as `M` and its parent's as `P`. Then the Blender world matrix is `C · M_world · F`, where:

- **F = C⁻¹ for meshes, empties, groups, and the world itself.** The geometry is built natively in Blender (Z-up primitives) or imported through glTF, which also converts vertex data. The local transform becomes `C · M · C⁻¹`, a conjugation.
- **F = I for cameras and lights.** Three and Blender cameras both look down local −Z with local +Y up, and Blender sun/spot lights also shine down local −Z. The local transform becomes `C · M`.

General parented case: `local_blender = F_parent⁻¹ · M_local_three · F_self`. In the common cases:

| Parent → child | Blender local matrix |
|---|---|
| world/mesh → mesh | `C·M·C⁻¹` |
| world/mesh → camera/light | `C·M` |
| camera → mesh (rare) | `M·C⁻¹` |

Conjugation composes cleanly (`C·P·C⁻¹ · C·M·C⁻¹ = C·P·M·C⁻¹`), so a hierarchy converts node by node. When you set `child.parent = parent` in Python, `matrix_parent_inverse` stays identity, which matches Three's parent semantics. Don't use `bpy.ops.object.parent_set`; it compensates the inverse matrix.

### 1.3 Per-component rules (meshes/empties)

| Three | Blender | Notes |
|---|---|---|
| `position (x,y,z)` | `location (x, −z, y)` | |
| `rotation` Euler `(a,b,c)`, order `'XYZ'` | `rotation_mode='YZX'`, `rotation_euler=(a, −c, b)` | Conjugating gives `Rx(a)·Rz(b)·Ry(−c)`, which is Blender's `'YZX'` order (Y applied first). Each channel maps to exactly one channel, so animated Euler curves transfer with no resampling. Verified. |
| Three Euler order other than XYZ | convert through the quaternion or matrix | The kit always uses XYZ. |
| `quaternion (x,y,z,w)` | `rotation_quaternion (w, x, −z, y)` | Vector part maps like a position. Verified. |
| `scale (sx,sy,sz)` | `scale (sx, sz, sy)` | No sign; scale is along local axes. |

Watch the order conventions. Three `'XYZ'` means the matrix `Rx·Ry·Rz` (intrinsic). Blender's `'XYZ'` means the matrix `Rz·Ry·Rx` (X applied first). Copying Euler numbers straight across with the same order string is wrong, even before the axis change.

### 1.4 Cameras and lights

- Three `Object3D.lookAt` on a camera or light builds `z = normalize(eye − target)`, `x = normalize(up × z)`, `y = z × x`, with `up = (0,1,0)`. In Blender, do the same with world up = +Z on the converted points. That is exactly `(target_b − pos_b).to_track_quat('-Z', 'Y')` (verified equal to `C · R_three`).
- Kit roll is `camera.rotateZ(roll)` after `lookAt`, i.e. a post-multiply by `Rz(roll)`. In Blender: `q = q_lookat @ Quaternion((0,0,1), roll)`. Same sign.
- Degenerate case (looking straight down): Three nudges `z.x` by 1e-4 (unverified detail). The script does the same. Avoid exact top-down camera keys.
- DirectionalLight and SpotLight point from `position` toward `target.position`. The Blender sun or spot gets the same look-at rotation. A sun's location doesn't matter; keep it for readability.

**Track To constraint or computed quaternion?** A `TRACK_TO` constraint (`track_axis='TRACK_NEGATIVE_Z'`, `up_axis='UP_Y'`) on the camera, with an animated target empty, reproduces "lerp pos, lerp target, look at" exactly if both are keyed with the same easing. It can't express drift or roll without an extra parent, though. **Recommendation: bake** location, quaternion and lens on every frame from the kit's `camera.sample(t)` port (`camera_sample` in the script, verified). Call `q.make_compatible(prev)` to stop sign flips.

---

## 2. Camera

### 2.1 Field of view → focal length

Three: `PerspectiveCamera(fov, aspect, near, far)`. `fov` is the **vertical** field of view **in degrees** — the one non-radian angle in our data. Blender:

```python
cam.data.sensor_fit = 'VERTICAL'
cam.data.sensor_height = 24.0                      # any value works if used consistently
cam.data.lens = 24.0 / (2 * math.tan(math.radians(fov) / 2))
# fov 35° -> 38.0591 mm, 50° -> 25.7341 mm (verified)
```

You can also keep `sensor_fit='HORIZONTAL'`, `sensor_width=35` and set `lens = camera.getFocalLength()`. Three's film gauge is 35 mm on the larger side, so the results are identical (verified). Use the vertical form; it doesn't depend on aspect.

- **Aspect and resolution.** Aspect comes only from `render.resolution_x/y` (1920×1080, `resolution_percentage=100`, `pixel_aspect_x/y = 1`). Three's aspect is `width/height` of the stage.
- **Animated FOV.** Lens isn't linear in fov, so key `lens` on every frame. The script does this.
- **Clip planes.** `near → clip_start`, `far → clip_end`. Defaults: kit 0.1 / 200; Blender 0.1 / 1000 (set them explicitly).
- **`camera.zoom`, `filmOffset`, `view` offsets.** Not used by the kit. `zoom` z scales lens by z. `filmOffset` corresponds to `shift_x/shift_y` (unverified mapping).
- **Orthographic.** For a Three `OrthographicCamera(left, right, top, bottom)` with `zoom`: `cam.data.type='ORTHO'` and `ortho_scale = max(right−left, top−bottom)/zoom`. Blender's `ortho_scale` spans the larger dimension when `sensor_fit='AUTO'` (unverified wording; check one frame).

### 2.2 Depth of field

Three's `BokehPass({focus, aperture, maxblur})` is not a lens model. Its blur is `clamp((depth − focus)·aperture, ±maxblur)` in screen-UV units, which is linear in depth. Blender's DoF is a thin-lens model (circle of confusion ∝ |d − S|/d). They can only agree at one chosen depth:

```python
cam.data.dof.use_dof = True
cam.data.dof.focus_distance = focus              # metres; same meaning
# Match blur at a reference depth d_ref (mm units: f = lens, h = sensor_height, S/d in mm):
#   CoC_fraction_of_height ≈ 2·aperture·|d_ref − S|_m        (three, unclamped)
#   CoC_fraction_of_height  = f² |d−S| / (N · d · (S − f) · h) (thin lens)
#   =>  N = f² · |d−S| / (2·aperture·|d−S|_m · d · (S−f) · h)
cam.data.dof.aperture_fstop = N                   # then compare frames and adjust by eye
```

This formula is derived and **unverified**; treat N as a starting point. The kit doesn't use BokehPass yet. If a style adds it, also record `maxblur`, because Blender has no blur clamp.

---

## 3. Materials

### 3.1 Principled BSDF socket names (5.3)

These are taken from [`node_shader_bsdf_principled.cc` @ 5.3](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/nodes/shader/nodes/node_shader_bsdf_principled.cc). Use them with `node.inputs["…"]`:

`Base Color, Metallic, Roughness, IOR, Alpha, Thin Wall, Normal, Weight, Diffuse Roughness, Subsurface Weight, Subsurface Radius, Subsurface Scale, Subsurface IOR, Subsurface Anisotropy, Specular IOR Level, Specular Tint, Anisotropic, Anisotropic Rotation, Tangent, Transmission Weight, Transmission Dispersion Scale, Transmission Dispersion Abbe Number, Coat Weight, Coat Roughness, Coat IOR, Coat Tint, Coat Normal, Sheen Weight, Sheen Roughness, Sheen Tint, Emission Color, Emission Strength, Thin Film Thickness, Thin Film IOR`

Version notes:

- **4.0 renames.** `Emission → Emission Color`, `Clearcoat → Coat Weight`, `Sheen → Sheen Weight`, `Transmission → Transmission Weight`, `Specular → Specular IOR Level`, `Subsurface → Subsurface Weight`. The 4.x line had these too.
- **New in 5.2/5.3** (OpenPBR-based Principled, per the [5.3 manual](https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/principled.html)): `Thin Wall` and `Diffuse Roughness`. In 5.3 the dispersion sockets are named `Transmission Dispersion …`. 5.2's socket list has no dispersion inputs.
- The UI shows short labels inside panels ("Weight" under Coat). Python uses the full names above.
- `Specular IOR Level`: 0.5 = no change, 0 = no reflections, 1 = double at normal incidence (manual).
- `Emission Strength` 1.0 "ensures that the object in the image has the exact same color as the Emission Color" (manual). This is the basis for unlit materials.

### 3.2 MeshStandard / MeshPhysical → Principled

| Three param (kit spec key) | Principled input | Notes |
|---|---|---|
| `color` (`baseColor`) | `Base Color` | linear RGB, alpha 1 |
| `roughness` | `Roughness` | same GGX convention; highlights close (unverified numerically) |
| `metalness` | `Metallic` | |
| (implicit F0 0.04) | `IOR` = 1.5 | Three Standard uses IOR 1.5. Set it explicitly. |
| `ior` (Physical) | `IOR` | |
| `specularIntensity`, `specularColor` | `Specular IOR Level` ≈ 0.5·specularIntensity, `Specular Tint` | **unverified** scale |
| `emissive` (`emission.color`), `emissiveIntensity` (`emission.strength`) | `Emission Color` (linear), `Emission Strength` | 1:1. Both add radiance before tone mapping. |
| `clearcoat`, `clearcoatRoughness` | `Coat Weight`, `Coat Roughness`, `Coat IOR`=1.5 | Three's coat has no tint or absorption. Keep `Coat Tint` white. |
| `transmission` | `Transmission Weight` | Three's transmission is a screen-space refraction of opaque objects. Blender refracts properly in Cycles and uses ray tracing in EEVEE (needs `use_raytracing`). They will look different. |
| `thickness`, `attenuationColor/Distance` | Volume Absorption on the volume output | approximate |
| `sheen`, `sheenColor`, `sheenRoughness` | `Sheen Weight`, `Sheen Tint`, `Sheen Roughness` | |
| `iridescence`, `iridescenceIOR`, `iridescenceThicknessRange` | `Thin Film Thickness` (nm), `Thin Film IOR` | **Cycles only** (manual) |
| `anisotropy`, `anisotropyRotation` | `Anisotropic`, `Anisotropic Rotation` | Cycles only |
| `opacity` + `transparent` | `Alpha` + `mat.surface_render_method='BLENDED'` | 4.2+ property ([rna_material](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/makesrna/intern/rna_material.cc)). Blended sorting differs from Three's per-object sort. |
| `alphaTest` | Math (Greater Than) → Alpha | or keep `DITHERED` |
| `side` Front (default) | `mat.use_backface_culling = True` | Blender's default is double-sided. Three DoubleSide → False. |
| `flatShading` | `mesh.shade_flat()` | `Mesh.shade_flat()` / `shade_smooth()` exist in 5.3 ([_bpy_types.py](https://github.com/blender/blender/blob/blender-v5.3-release/scripts/modules/_bpy_types.py)). Auto-smooth was removed in 4.1; use `set_sharp_from_angle` or the "Smooth by Angle" modifier. |
| `vertexColors: true` | **Color Attribute** node (`ShaderNodeVertexColor`) × base color | Three multiplies vertex color into `color`. |
| `envMapIntensity` | none per material | Bake it into the world strength, or mix |
| `MeshLambertMaterial` | Principled with Roughness 1, `Specular IOR Level` 0 (or Diffuse BSDF) | |

### 3.3 Emissive and "neon" (`toneMapped: false`)

- An emissive value above 1 behaves the same in both apps: linear radiance that is then tone-mapped and bloomed.
- `toneMapped: false` makes Three skip tone mapping **for that material only**, and only when rendering straight to the canvas. Under the kit's EffectComposer (`createPost`), the `OutputPass` tone-maps the whole buffer, so `toneMapped:false` does nothing whenever the style has any post effect. That is how Three r15x+ handles render targets (**unverified for r181**, but it follows from OutputPass doing the tone map). Blender has no per-material tone-mapping bypass.
- What to do:
  - If the style has a post stack, nothing changes.
  - If it doesn't, either render with the `Standard` view, or (Path B, §5.4) render the neon objects to a separate view layer/AOV and composite them after tone mapping.

### 3.4 Unlit (`MeshBasicMaterial`)

`Emission` shader, Strength 1, linear color → exact under the `Standard` view. Under AgX, ACES or Neutral both apps tone-map it, consistently. Side effects:

- In **Cycles** an emissive object lights its neighbours; Three's Basic material doesn't. Set `obj.visible_diffuse = False` and `obj.visible_glossy = False` on those objects.
- In EEVEE with ray tracing off, emission doesn't light other objects (**unverified** for EEVEE 5.x).

Text labels (`kit/text.js`) are Basic + `map` + `transparent`, with `alphaTest` 0.01 or 0.5. In Blender: Image Texture (PNG, sRGB) → Emission color; image alpha → Mix Shader with Transparent BSDF; `surface_render_method='BLENDED'`.

### 3.5 Procedural CanvasTextures (noise, paper, grid, speckle, gradient, bumpNoise)

The kit paints these on a `<canvas>` from seeded pure functions (`valueNoise2`/`fbm2` in `kit/textures.js`). Blender's Noise/Voronoi/Wave/Brick nodes are different algorithms, so they never match pixel for pixel. Options, best first:

1. **Export the canvas as PNG and use an Image Texture node.** Exact. Record `repeat`, `wrapS/T` (RepeatWrapping → `extension='REPEAT'`), `colorSpace` (sRGB → image `colorspace_settings.name='sRGB'`; NoColorSpace/bump → `'Non-Color'`). Feed repeat through a Mapping node (Scale = repeat). `CanvasTexture.flipY` is true, so the canvas top row sits at v=1. Blender images also put row 0 at the bottom (v=0), so UVs line up with no flip.
   - **Caveat: UV layouts.** A Three `BoxGeometry` has 0–1 UVs per face, while Blender's `create_cube(calc_uvs=True)` gives a cross unwrap. Sphere and cylinder seams also differ. For UV-textured primitives, take geometry from glTF (§8.4), or generate Three-identical UVs.
2. **Port the generator to Python** and build the image with `bpy.data.images.new` plus `pixels.foreach_set`. The functions are pure and seeded (`hash01` FNV/murmur mix, mulberry32), so this is exact if you keep 32-bit integer math. Use `& 0xFFFFFFFF` and emulate `Math.imul`.
3. **Re-author procedurally** (approximate):
   - fbm noise → Noise Texture (Scale = cells per tile, Detail = octaves − 1, Roughness = gain)
   - paper grain → Noise + Musgrave-style Noise at a high scale into Bump
   - grid → Brick Texture (mortar = line width) or `fract` math on coordinates
   - speckle → Voronoi (F1) thresholded
   - gradient → Gradient Texture + Color Ramp
   - bump → Bump node (Height ← texture, Strength ≈ calibrate, Distance ≈ bumpScale·0.01). Three's `bumpScale` is in UV-derivative units, so this has to be eyeballed.

### 3.6 Lines and edges (`EdgesGeometry`, `LineSegments`, `Line2`)

| Three | Blender | Mapping |
|---|---|---|
| `EdgesGeometry(geo, thresholdAngle°)` + `LineBasicMaterial` (always 1 px wide in WebGL) | **Freestyle**: `scene.render.use_freestyle = True`, line set with Crease edges, `crease_angle = 180° − thresholdAngle` (derived: Freestyle marks an edge when the *interior* face angle is below the crease angle), plus Silhouette/Border as needed; `render.line_thickness` in px | screen-space px; closest match |
| `Line2` / `LineMaterial({linewidth, worldUnits:false})` | Freestyle thickness = linewidth px | |
| `LineMaterial({worldUnits:true})` or tube-like edges | Wireframe modifier (`thickness` m) on a duplicate, or curve bevel | world-space |
| silhouettes on lots of geometry | Grease Pencil **Line Art** modifier (object type `'GREASEPENCIL'`, modifier type `'LINEART'`, per [rna_object](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/makesrna/intern/rna_object.cc) / [rna_modifier](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/makesrna/intern/rna_modifier.cc)) | Grease Pencil v3 API since 4.3; setup properties **unverified** |

Freestyle works with Cycles and EEVEE (**unverified** for EEVEE 5.3), and it is slow. Freestyle line color goes through the view transform; set it in linear.

### 3.7 Toon (`MeshToonMaterial`)

Three toon without a `gradientMap` uses a 2-tone ramp: irradiance × (0.7 below, 1.0 above `dotNL·0.5+0.5 = 0.7`), i.e. the step is at N·L = 0.4 (from `gradientmap_pars_fragment`, **unverified** for r181). EEVEE recipe:

- Diffuse BSDF (white) → **Shader to RGB** → Color Ramp (Constant; stops at the luminance that corresponds to N·L = 0.4 under your key light) → multiply by base color → Emission.
- Shader to RGB is **EEVEE-only**. That's the 4.x manual; the 5.3 page path 404'd, so it's **unverified** for 5.3.
- The ramp threshold depends on the light's strength, so calibrate it on one frame.
- Cycles has no equivalent; use Principled.

The script falls back to Principled and prints a warning.

---

## 4. Lights

### 4.1 Units on each side

- **Three.** Physically based light units became the default in r155: "`WebGLRenderer.useLegacyLights` is now set to `false` by default and deprecated" ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)). Point/spot `intensity` is **candela** with `decay` 2 (default since r147); directional is **lux**. In the shaders, a directional light adds irradiance `N·L × color × I`, then multiplies by Lambert `albedo/π`. Ambient adds irradiance `color × I` (`getAmbientLightIrradiance` returns it unchanged; `RE_IndirectDiffuse_Physical` multiplies by `RECIPROCAL_PI · albedo`). Source: [`lights_pars_begin.glsl.js`](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/lights_pars_begin.glsl.js), [`lights_physical_pars_fragment.glsl.js`](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/lights_physical_pars_fragment.glsl.js).
- **Blender.** Sun strength is W/m² (irradiance). Point, spot and area are W of radiant flux, "not the electrical Watts" ([manual: Power of Lights](https://docs.blender.org/manual/en/latest/render/lights/light_object.html)).

### 4.2 Conversion

Use the conversion that makes both renderers produce the same pixel values. That's the *Unitless* (`COMPAT`) mode of the official glTF importer ([`imp/light.py`](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/addons/io_scene_gltf2/blender/imp/light.py)), not its *Standard* (`SPEC`) mode:

```
directional:   sun.energy  = intensity_lux                 # COMPAT: pass-through
point / spot:  light.energy = intensity_cd * 4 * pi         # COMPAT: × 4π
(SPEC mode divides both by PBR_WATTS_TO_LUMENS = 683 — physically "correct" photometry,
 but ~683x (9.4 stops) darker than three's render unless you add +9.4 EV exposure)
```

Why COMPAT matches Three:

- A Blender point light of P W has radiant intensity P/(4π) W/sr, so irradiance at distance d is P/(4π d²). With P = 4π·I this equals I/d², which is exactly Three's `I/d²` (decay 2).
- A sun of S W/m² gives irradiance S, the same as Three's lux value.
- Both renderers then apply Lambert `albedo/π`.

This is derived from the source formulas and matches the importer's COMPAT mode. It is **not render-verified**; run §10.4.

Caveats:

- **`distance > 0`** (Three's smooth range cutoff: × `(1 − (d/distance)⁴)²`). Blender has no equivalent. At the "stage" preset's 40 m the factor is about 0.98 at 12 m, so you can ignore it. Short distances need baking into the energy, or `use_custom_distance` (EEVEE hard cutoff).
- **`decay ≠ 2`.** No Blender equivalent; Blender is always inverse-square.
- **Blender light radius.** Point and spot default to `shadow_soft_size = 0.25` m, which softens shadows and enlarges highlights. Three lights are true points, so set `shadow_soft_size = 0` (or a small value if you want soft shadows, §4.5) and `use_soft_falloff = False` ([rna_light](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/makesrna/intern/rna_light.cc)).
- **`light.normalize`** (default on) only matters for sized lights.
- **Global multiplier.** `lightsFromSpec(scene, rig, {intensity})` multiplies every light. Export the **final** intensity.

### 4.3 Spot cone

- Three `angle` is the **half** angle (max π/2), so `spot_size = 2·angle`.
- `penumbra` maps to `spot_blend = penumbra`. This is the glTF convention (`blend = 1 − inner/outer`, with Three's inner = angle·(1−penumbra)).
- Falloff shape: Three uses `smoothstep(cos(angle), cos(angle·(1−penumbra)), cosθ)`; Blender's spot blend uses its own smoothstep on a different parameterisation. Edge softness will differ (**unverified** magnitude). Compare one frame and nudge `spot_blend`.

### 4.4 Ambient and hemisphere → world shader

Three's hemisphere light adds irradiance `I · lerp(ground, sky, 0.5·(N·up)+0.5)` with no occlusion, to diffuse only. A Blender world with radiance `L(ω) = a + b·ω_z` gives a surface irradiance of `π·a + (2π/3)·b·(N·up)`. Matching both terms gives:

```
a = I·(ground+sky)/(2π)          b = 3·I·(sky−ground)/(4π)
=> world radiance = (I/π) · lerp(ground, sky, 0.5 + 0.75·ω_z)   (factor range −0.25..1.25, unclamped)
```

Implementation (in the script): `Texture Coordinate.Generated → Separate XYZ.Z → Map Range (−1..1 → −0.25..1.25, clamp off) → Mix (RGBA, clamp_factor off) → Background(strength I/π)`. Ambient light is a flat `Background(color, I/π)`. Several of these add up with Add Shader. Socket identifiers come from [`node_shader_mix.cc`](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/nodes/shader/nodes/node_shader_mix.cc): `Factor_Float`, `A_Color`, `B_Color`, `Result_Color`. Look up by identifier, because the name "A" occurs five times.

Mismatches:

- The world also produces **specular reflections** and **occlusion**; Three's hemisphere and ambient lights do neither. Rough clay won't show much; glossy materials will.
- With very high sky/ground contrast, the extrapolated ground side goes negative. The script clamps it, which is slightly wrong.
- `Generated` as the direction vector in a world shader is common practice, but **unverified** in 5.3.

**Background ≠ lighting.** Three's `scene.background` color doesn't light anything; Blender's world does. The script uses `Light Path.Is Camera Ray` → Mix Shader so camera rays see the flat background and all other rays see the lighting world. That's correct in Cycles; EEVEE's support for Light Path in the world is **unverified**. The fallback is `film_transparent = True` plus compositing the background color afterwards.

### 4.5 Shadows

- **Three side.** `PCFSoftShadowMap` with `shadow.radius = softness` (texels), `mapSize`, and an orthographic frustum `extent` for directional lights. Only lights with `castShadow` cast, and only meshes with `castShadow` / `receiveShadow` take part.
- **Blender side.** Every object casts and receives by default.
  - `light.use_shadow = bool(spec.shadow)`
  - `obj.visible_shadow = castShadow` ([rna_object](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/makesrna/intern/rna_object.cc))
  - `receiveShadow = false` has no direct equivalent (light/shadow linking can approximate it)
- **Softness doesn't map.** Three blurs in shadow-map texels; Blender penumbrae come from physical light size: `shadow_soft_size` (m) for point/spot and `angle` for the sun. A rough equivalent for a directional light: penumbra ≈ `softness · 2·extent / mapSize` m. For the kit defaults (4, 8, 2048) that's ≈ 0.03 m, which at about 1 m occluder-to-receiver distance is about 2° of sun `angle`. This is a heuristic. **Add an explicit Blender-facing field** (§10).
- EEVEE 5.x uses virtual shadow maps. For accurate soft shadows in final renders set `light.use_shadow_jitter = True`.

### 4.6 RoomEnvironment / PMREM → world HDRI

`useRoomEnvironment` renders three's `RoomEnvironment` (a procedural box room with emissive panels) through PMREM and sets `scene.environment` with `environmentIntensity`. Blender has nothing equivalent, so **export it**:

1. On the Three side, render `new RoomEnvironment()` with a `CubeCamera` into a float cube render target.
2. Run a full-screen shader that writes an equirect **in Blender's convention**. For each output pixel (u, v), compute the Blender direction from Cycles' `direction_to_equirectangular`, which gives `u = 0.5 − atan2(y, x)/(2π)` and `v = 1 − acos(z)/π`, with v=1 as the top row. Then convert to the Three direction `(x_b, z_b, −y_b)` and sample the cube. With this, no Mapping-node rotation is needed. (Formula from [Cycles source](https://github.com/blender/blender/blob/blender-v5.3-release/intern/cycles/util/projection.h).)
3. Read the pixels back as float and write a Radiance `.hdr` (RGBE) or EXR file.
4. In Blender: Environment Texture → Background, strength = `environmentIntensity` (Three's IBL is radiometrically consistent, so there's no π factor; **unverified** by render).

Also note the following.

- **Prefiltering.** PMREM prefilters by roughness; Blender integrates the raw HDR. Glossy reflections should be close and diffuse should be close.
- **Room geometry changed in r183** ("The scene position of `RoomEnvironment` has been updated" — migration guide). Pin the Three revision in the spec.
- **No export available?** Use an approximation: a grey `Background` of about 0.5 × environmentIntensity, plus 2–3 large area lights above. It won't match.

---

## 5. Color management and tone mapping

### 5.1 Hex to linear

Blender color properties and socket defaults are scene-linear (Linear Rec.709 working space by default; 5.x adds a choice of working space — keep the default, which equals Three's linear-sRGB). Convert every hex color:

```python
def srgb_to_linear(c): return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
# "#808080" -> 0.21586 (verified)
```

Image textures carry their own colorspace (sRGB for color maps, Non-Color for data maps).

### 5.2 Three's output pipeline (kit)

- `renderer.outputColorSpace = SRGBColorSpace`.
- Tone mapping comes from `world.toneMapping`. The `createStage` default is **`aces`** when the style doesn't set it.
- `toneMappingExposure = world.exposure`.
- With a post stack the order is: RenderPass (HalfFloat linear) → UnrealBloom → tilt-shift → **OutputPass** (tone map + sRGB) → Finish shader (tint, vignette, grain) on sRGB values.

### 5.3 Path A — native Blender view transform (simple)

View names come from the 5.3 OCIO config ([`config.ocio`](https://github.com/blender/blender/blob/blender-v5.3-release/release/datafiles/colormanagement/config.ocio)): Standard, ACES 1.3, ACES 2.0, Khronos PBR Neutral, AgX, Filmic, Filmic Log, False Color, Raw.

| kit `toneMapping` | Three implementation ([tonemapping_pars_fragment](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js)) | Blender `view_transform` | exposure | Fidelity |
|---|---|---|---|---|
| `none` | clamp, then sRGB OETF | `Standard` | `log2(e)` | exact |
| `neutral` | Khronos PBR Neutral | `Khronos PBR Neutral` (4.2+) | `log2(e)` | near-exact (same reference operator; **unverified** numerically) |
| `agx` | "minimal" polynomial AgX fit of **Blender's** AgX (via Filament) | `AgX`, look `None` | `log2(e)` | close (a fit; small hue and contrast differences) |
| `aces` | Stephen Hill RRT+ODT fit, `color *= exposure / 0.6` ("the scale factor of 1/0.6 is subjective") | `ACES 1.3` (5.x) | `log2(e/0.6)` | approximate: a real RRT+ODT on a Rec.1886 view vs a fit, plus the 1/0.6 shift. Not in 4.x (fall back to AgX). |

Also set:

- `display_device='sRGB'`, `look='None'`, `gamma=1`.
- **`render.dither_intensity = 0`.** Blender adds dither noise by default; Three doesn't.
- `render.filter_size`: Blender's pixel filter (default 1.5 px) is a bit softer than Three's MSAA ×4. Leave it, or try 1.0 (**unverified** look).

**Opinion:** if Blender parity matters for a style, author that style with `toneMapping: "agx"` or `"neutral"`, not `"aces"`.

### 5.4 Path B — Three's exact pipeline in numpy (recommended when matching matters)

1. Render **OpenEXR**, half or float, RGBA. EXR stores scene-linear and ignores the view transform.
2. Run a Python post-processor over the frames (Blender bundles numpy, or use system Python) that ports, line by line:
   - tilt-shift (`kit/post.js`, two 13-tap separable passes, weights `exp(−i²/18)`, radius `blur·smoothstep(0, .35, max(0, |v−focus|−range))` px)
   - UnrealBloom: approximate; or use Blender's Glare node on the EXR first
   - the chosen three tone-map function, including `toneMappingExposure` (and `/0.6` for ACES)
   - the sRGB OETF
   - the Finish shader (§6.3)
3. Write the PNGs.

This removes every view-transform mismatch: only shading differences remain. It's unexecuted and was not built here — it's the next tool to write if Path A isn't close enough.

---

## 6. Post-processing

### 6.1 Bloom — `UnrealBloomPass(strength, radius, threshold)`

- EEVEE's built-in bloom was **removed in 4.2**. Use the compositor **Glare** node with type **Bloom**.
- In 5.x the Glare node's options are input sockets: `Image, Type, Quality, Threshold, Smoothness, Clamp, Maximum, Strength, Saturation, Tint, Size, …` ([node_composite_glare.cc @ 5.3](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/nodes/composite/nodes/node_composite_glare.cc)). Type enum: `BLOOM, GHOSTS, STREAKS, FOG_GLOW, SIMPLE_STAR, SUN_BEAMS, KERNEL`.
- Mapping (approximate, calibrate):
  - `threshold → Threshold` (same idea: luminance in linear HDR before tone mapping; both run at that stage)
  - `strength → Strength`
  - `radius (0..1) → Size`
- The kernels differ: Three uses a 5-level mip chain with gaussian kernels 3–11 and per-level factors lerped by radius.
- **5.0 compositor API change:** "`scene.node_tree` was removed, use `scene.compositing_node_group` instead". Create the tree with `bpy.data.node_groups.new(name, 'CompositorNodeTree')` and assign it ([5.0 Python API notes](https://developer.blender.org/docs/release_notes/5.0/python_api/)). The output-node details of 5.x compositor groups are **unverified**; 4.x used `scene.use_nodes = True` + `scene.node_tree` + Composite node.

### 6.2 Tilt-shift

The kit's tilt-shift is a **screen-space** horizontal-band blur in linear space (§5.4). Options, closest first:

1. **numpy on EXR** with the exact formula (Path B).
2. **Compositor:** a Blur node whose size is driven by a vertical gradient mask. Build the mask from texture coordinates → Map Range → `smoothstep`, then mix sharp and blurred by the mask. (The node API for per-pixel variable blur in 5.x is **unverified**.)
3. **Physical DoF** with a near focus and low f-stop. This gives a convincing "real" miniature look, but the blur follows depth, not screen y. It's a different look, so use it only if the style is fine with that.

### 6.3 Vignette, grain, tint (after tone mapping)

The kit's `FinishShader` runs **after** OutputPass, on sRGB-encoded values. Blender's compositor works in scene-linear before the view transform, so doing these in the compositor puts them in the wrong place. Instead, apply the shader math to the PNG frames (numpy, float32):

```
uv  = (x+0.5)/W, 1 − (y+0.5)/H              # GL uv: origin bottom-left; image row 0 is the top
c  *= tint (linear-hex→ the raw uniform; tint is set via THREE.Color so it's linear — unverified)
q   = (uv − 0.5) * (W/H, 1)
c  *= mix(1, smoothstep(offset, offset − 0.9, |q|), darkness)   # edge0 > edge1: GLSL leaves this
                                                                 # undefined; GPUs evaluate the formula
n   = hash(floor(uv*res) + frame*(17,31)) − 0.5 ; c += n*grain   # hash = kit h(); frame = floor(t*fps+1e-6) % 4096
```

Vignette is exact. Grain matches statistically; it isn't bit-exact, because GPU float32 `fract` differs from numpy. An ffmpeg `geq` filter can do the vignette as well.

---

## 7. Animation

### 7.1 Time

- `scene.frame_start = 0`, `frame_end = round(duration·fps) − 1`, `render.fps = 30`, `fps_base = 1`.
- Frame n ↔ t = n/fps. This is the HyperFrames sampling instant.
- Keys may sit on fractional frames: `keyframe_insert(frame=12.5)` is fine. Snap a key to the integer frame when it's within 1e-6 of one. Float drift (1.0333…·30 = 31.000000000000004) otherwise moves a cut to the wrong frame; the self-test caught exactly this.
- **Beats → markers:** `scene.timeline_markers.new(beat.id, frame=round(beat.t·fps))`. Markers are integer frames.

### 7.2 Named easing → F-curve keyframe

Blender implements Penner's equations ([`easing.cc`](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/blenlib/intern/easing.cc)). A key's `interpolation` and `easing` govern the segment **from that key to the next**, so set them on the segment's *start* key. In `kit/camera.js`, `ease` lives on the key that *ends* the segment ("applies to the segment ARRIVING at this key"), so shift it back by one key. Object tracks (`evalTrack`) carry `ease` on the track, i.e. on its start.

| kit ease | `interpolation` | `easing` | Error vs kit (executed) |
|---|---|---|---|
| linear | `LINEAR` | — | 0 |
| inQuad / outQuad / inOutQuad | `QUAD` | `EASE_IN` / `EASE_OUT` / `EASE_IN_OUT` | ≤ 3e-16 |
| inCubic / outCubic / inOutCubic | `CUBIC` | same pattern | ≤ 1.5e-16 |
| outSine / inOutSine | `SINE` | `EASE_OUT` / `EASE_IN_OUT` | ≤ 3e-16 |
| inExpo / outExpo / inOutExpo | `EXPO` | same pattern | **≤ 9.77e-4 of change.** Blender renormalises `2^(−10t)` to hit 0 and 1 exactly; the kit jumps at the end. Invisible. |
| inBack / outBack / inOutBack | `BACK` | same pattern; `keyframe.back = 1.70158` | ≤ 4.4e-16. Blender multiplies by 1.525 internally for in-out, as the kit does. |
| outBounce | `BOUNCE` | `EASE_OUT` | 0 |
| outElastic | `ELASTIC` | `EASE_OUT`; **`amplitude = |next − this|` per channel, `period = 0.3·(next_frame − this_frame)`** | 5e-16. With Blender's new-key defaults (amplitude 0.8, period 4.1 frames) the error is **57 %**. |
| `spring()`, custom functions, `envelope`, `floatAt`, anything in `renderAt` | — | — | **bake** |

- Blender's `AUTO` easing means EASE_IN for QUAD/CUBIC/QUART/QUINT/SINE/EXPO/CIRC and EASE_OUT for BACK/BOUNCE/ELASTIC ([`fcurve.cc`](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/blenkernel/intern/fcurve.cc)). Always set `easing` explicitly.
- New keys default to `BEZIER` (user preference). Set `bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'` before baking.
- **Extrapolation:** Blender defaults to constant, matching the kit's clamped `ease()` and "before the first track, its `from` holds".

### 7.3 `evalTrack` semantics → keys (what `tracks_to_keys` does)

Kit rules (`kit/spec.js`):

- At time t, the **last track whose start ≤ t** applies.
- Before the first track, the first track's `from` applies.
- A missing `from`/`to` means the object's **base** value, *not* the previous track's `to`.
- `dur = 0` jumps to `to`.
- Values hold after a track ends.

Translation:

1. Each track becomes a key at `start` (value `from`, the track's easing) and a key at `start+dur` (value `to`, `CONSTANT`).
2. A jump (`from ≠` the previous held value, or `dur = 0`) becomes a `CONSTANT` key 0.001 frame before the cut. No integer frame can fall inside that window.
3. **Overlapping tracks**, where a later track cuts into a running one, and unknown easings make the function return `None`, and the property is **baked** (one `LINEAR` key per frame from the `evalTrack` port).

Verified against the kit semantics on random track sets (§0).

Notes:

- Scale accepts a scalar; expand it to 3 components.
- `opacity` drives a per-object material copy's `Alpha` socket. Key `socket.keyframe_insert("default_value")`; the F-curves live on `material.node_tree`.
- The kit hides objects at scale ≈ 0. A zero scale renders nothing in Blender either.

### 7.4 Getting at F-curves in 5.x (layered actions)

"The legacy `Action` API has been removed" in 5.0 (`action.fcurves` is gone, 5.0 notes). Insert one key with `keyframe_insert` (this creates the action, slot and channelbag), then:

```python
from bpy_extras.anim_utils import action_ensure_channelbag_for_slot   # 4.4+
ad = id_.animation_data
fcurves = action_ensure_channelbag_for_slot(ad.action, ad.action_slot).fcurves
fc = fcurves.find(data_path, index=i) or fcurves.new(data_path, index=i)
kp = fc.keyframe_points.insert(frame, value, options={'FAST'}); kp.interpolation = 'CUBIC'; kp.easing = 'EASE_OUT'
fc.update()
```

(Function names verified in [anim_utils.py @ 5.3](https://github.com/blender/blender/blob/blender-v5.3-release/scripts/modules/bpy_extras/anim_utils.py) and [rna_action.cc](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/makesrna/intern/rna_action.cc).) For ≤ 4.3, fall back to `action.fcurves`.

### 7.5 Hinges and pivots

The Three idiom is a `Group` at the hinge position with the child mesh offset inside it, and you rotate the group. In Blender, create an **Empty** at the converted pivot, set `child.parent = empty` (identity parent inverse), and give the child its converted local offset. Animate the empty's `rotation_euler` with the same YZX rule.

### 7.6 "Pure function of time" scenes

The kit's `renderAt(t)` is a pure function: `animateObjects`, then hand-written code. Three ways to reproduce it in Blender, best first:

1. **Bake on the Three side** (recommended). Have the exporter run `renderAt(n/fps)` for every frame (in headless Chrome, or in Node if the scene logic doesn't need WebGL) and record each node's local TRS, plus material scalars, light intensities and camera state. Then key every frame in Blender with LINEAR interpolation. Hand-written tweaks, `floatAt`, `spring`, drift and overlapping tracks all come through for free. See §10.
2. **Port the logic to Python** and key per frame (what the script does for the camera and for tracks).
3. **A `frame_change_pre` handler** that sets state from `t`. It works headless, but set `scene.render.use_lock_interface = True` to avoid render-time race crashes (**unverified** in 5.3), and it isn't saved in the .blend as data. Python **drivers** need auto-exec (`blender -y` / `--enable-autoexec`). Avoid both for deliverables.

### 7.7 Deterministic randomness

The kit's `rng(seed)` is mulberry32 and `hash01` is an FNV/murmur mix, both on 32-bit integers. Port them with explicit `& 0xFFFFFFFF` and an `imul` emulation (`((a*b) & 0xFFFFFFFF)`, then the signed shift semantics `>>> n` → `(x % 2**32) >> n`), or skip the port by exporting the generated values in the bake. Don't use Python's `random` or Blender's noise seeds expecting a match.

---

## 8. Geometry

### 8.1 Primitives → bmesh

All dimensions are in metres. The "orientation" column assumes you build in Blender's native frame and then apply the **converted** transform (§1.3). bmesh argument names are from [`bmesh_opdefines.cc` @ 5.3](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/bmesh/intern/bmesh_opdefines.cc).

| Three (kit dims) | bmesh / bpy | Orientation |
|---|---|---|
| `BoxGeometry(w, h, d)` | `create_cube(bm, size=1)` + `scale(vec=(w, d, h))` | Three height (Y) → Blender Z, depth (Z) → Blender Y |
| `SphereGeometry(r, ws, hs)` (kit: `hs = round(ws·0.66)`) | `create_uvsphere(bm, u_segments=ws, v_segments=hs, radius=r)` | poles Y → Z; matches |
| `CylinderGeometry(rTop, rBottom, h, n)` | `create_cone(bm, cap_ends=True, segments=n, radius1=rBottom, radius2=rTop, depth=h)` | `radius1` is at −depth/2 (bottom; verified in `bmo_primitive.cc`). Three's ring starts at Three +Z = Blender −Y; bmesh starts at +Y. For **odd n**, rotate 180° about Z. |
| `ConeGeometry(r, h, n)` | `create_cone(radius1=r, radius2=0, depth=h)` | same |
| `PlaneGeometry(w, h)` | build the quad in Three coords and convert | **Three's plane is XY, facing +Z → Blender XZ, facing −Y (vertical).** Blender's `primitive_plane_add` is horizontal. Kit floors use `rotation.x = −π/2`, which converts back to horizontal. |
| `TorusGeometry(R, tube, radial, tubular)` | port the generator (script `gen_torus`) | Three's ring lies in XY (axis Z) → Blender XZ (axis −Y). In Three, `radialSegments` goes round the tube and `tubularSegments` round the ring (kit: 24 and `segments`). `primitive_torus_add` names them `minor_segments`/`major_segments` and is Z-axis. |
| `CapsuleGeometry(r, height, capSeg, radial)` (kit: `(r, length, 8, 24)`; renamed `length → height` in r176) | port (`gen_capsule`) | no Blender primitive |
| `RoundedBoxGeometry(w, h, d, seg, radius)` | cube + **Bevel** modifier (`width=radius`, `segments=seg`, `limit_method='NONE'`) + smooth shading | shape is close; normals and segment layout differ (**unverified**) |
| `IcosahedronGeometry(r, 0)` | vertex/face table (`gen_icosahedron`, verified identical) | `create_icosphere(subdivisions=1)` is oriented differently: flat-shaded facets won't line up |
| `IcosahedronGeometry(r, n>0)` | three subdivides each edge linearly into n+1 pieces (20·(n+1)² faces); Blender subdivides recursively (20·4^(s−1)) | they coincide only in face count for n ∈ {1, 3}, and vertex placement still differs. **Export glTF.** |
| `ExtrudeGeometry(shape, {depth, bevel…})` | Curve object (`fill_mode='BOTH'`) from the 2D path, `extrude = depth/2`, then move by `+depth/2` along the Three +Z → Blender −Y axis; `bevel_depth`, `bevel_resolution` | Three extrudes from z=0 to z=depth; Blender extrudes symmetrically. Holes: nested splines fill even-odd. The bevel profile differs. Exact → glTF. |
| `TubeGeometry(curve, tubular, r, radial, closed)` | Curve, POLY spline from **sampled points** (`curve.getSpacedPoints(N)`), `bevel_depth=r`, `bevel_resolution` | Three's default `CatmullRomCurve3` is centripetal and Blender has no Catmull-Rom spline, so sample it. Frame/twist differs (only visible with non-round sections). |
| `LatheGeometry(points, segs)` | Screw modifier, or spin the profile | Three's lathe axis is Y → Blender Z |
| `TextGeometry` / kit `createTextLabel` | kit labels are **canvas textures on a plane** → exported PNG on a plane (§3.4) | Blender text objects use different font rasterisation and metrics. Use the PNG. |
| kit `createGround({size})` | horizontal quad, size × size at z=0 | note: a spec `rotation` *replaces* the builder's −π/2 |
| kit `createCyclorama(...)` | port of the profile (`gen_cyclorama`) | exact |

Call `bmesh.ops.recalc_face_normals` after hand-built meshes. The basis change keeps winding, but generators are easy to get backwards.

### 8.2 Noise-displaced terrain

Three-side terrain uses the kit's value noise or another JS noise. Blender's Noise Texture and Geometry Nodes noise are different functions. For a match:

- **Export the heightfield** (Float32 array) or the mesh via glTF. Exact.
- Or **port the noise** (pure, seeded) and displace a `create_grid(x_segments, y_segments, size)` in Python. Exact.
- Geometry Nodes with Noise Texture gives "the same kind of terrain", not the same terrain.

### 8.3 `procedural: "<description>"` objects

These come from `factories[...]` code on the Three side and can't be rebuilt from data. Export them as GLB (§8.4). The description is for humans and for re-authoring.

### 8.4 glTF round trip — what survives

Three `GLTFExporter` writes `.glb`. Import with `bpy.ops.import_scene.gltf(filepath=…, import_shading='NORMALS', export_import_convert_lighting_mode='COMPAT')` (option names from [glTF-IO `__init__.py`](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/addons/io_scene_gltf2/__init__.py)). The importer converts Y-up to Z-up and corrects camera and light orientation (behaviour per glTF-IO; **unverified** in a run).

| Survives | Partly | Lost |
|---|---|---|
| mesh geometry, normals, **UVs** (exact, incl. Three primitive UV layouts), vertex colors | MeshBasic → `KHR_materials_unlit`; toon/Lambert → exported as standard or skipped (**unverified**) | procedural `renderAt` animation (unless baked into an `AnimationClip` first) |
| node hierarchy and TRS | `flatShading`: there's no glTF flag; use the importer's `import_shading='FLAT'` or `shade_flat()` | post effects (bloom, tilt-shift, vignette, grain) |
| Standard/Physical params incl. `KHR_materials_*` (clearcoat, transmission, ior, specular, sheen, volume, iridescence, emissive_strength, anisotropy) | lines and points (imported as loose edges or verts with no width) | `ShaderMaterial` / `onBeforeCompile` custom shaders |
| textures, incl. CanvasTextures (written as PNG) | `KHR_lights_punctual` (no shadows, no hemisphere or ambient) | fog, background, tone mapping, environment / PMREM |
| cameras (yfov, aspect, near, far) | AnimationClips (linear/step/cubic keys; easing gets baked into samples) | castShadow/receiveShadow, renderOrder, layers |

**Recommended hybrid:** the exporter also writes `geometry.glb` with **one node per spec object id, at identity transform, geometry in object-local space**. Blender imports it, renames and links meshes by id, then assigns transforms, materials and animation from the spec or bake. You get exact geometry and UVs, and Blender-native control of everything else.

---

## 9. Render and audio

### 9.1 Engine choice per style

| Style family | Engine | Why |
|---|---|---|
| clay / studio / flat / paper-cut / toon / neon / UI-tile / diagram | **EEVEE** (`BLENDER_EEVEE` in 5.x; `BLENDER_EEVEE_NEXT` in 4.2–4.5 — "EEVEE's render engine identifier was changed from `BLENDER_EEVEE_NEXT` to `BLENDER_EEVEE`", 5.0 notes) | Rasterised like Three, so closest look. Fast. Shader-to-RGB toon needs it. |
| glass, caustics, real GI, "hero" upgrade renders | **Cycles** | Real refraction and GI, but brighter interiors and colour bleeding that Three never shows. If you want parity, cut bounces (`scene.cycles.diffuse_bounces = 0–1`). |

EEVEE settings for parity:

- `scene.eevee.taa_render_samples = 64`.
- `scene.eevee.use_raytracing = False`: Three has no SSR or SSGI. Turn it on for transmission.
- `use_shadows = True` (property names verified in [rna_scene.cc](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/makesrna/intern/rna_scene.cc)).

### 9.2 Output settings

```python
r = scene.render
r.resolution_x, r.resolution_y, r.resolution_percentage = 1920, 1080, 100
r.fps, r.fps_base = 30, 1.0
scene.frame_start, scene.frame_end = 0, round(duration*30) - 1
r.image_settings.media_type = 'IMAGE'      # 5.0+: set BEFORE file_format (5.0 notes)
r.image_settings.file_format = 'PNG'       # or 'OPEN_EXR' for Path B
r.image_settings.color_mode, r.image_settings.color_depth = 'RGB', '8'
r.filepath = '//frames/f_####'             # -> f_0000.png …
r.dither_intensity = 0.0
```

### 9.3 Audio

**Recommended: render silent frames, then mux with ffmpeg** (ffmpeg is installed here at `~/.local/bin/ffmpeg`):

```bash
ffmpeg -framerate 30 -start_number 0 -i frames/f_%04d.png \
       -i sfx.wav -i vo.wav -filter_complex "[1:a][2:a]amix=inputs=2:normalize=0[a]" \
       -map 0:v -map "[a]" -c:v libx264 -pix_fmt yuv420p -crf 16 -c:a aac -b:a 192k -shortest out.mp4
```

Use the **same WAVs** and the same gain rule as the HyperFrames render (the SCORE / DUCK mix). `normalize=0` keeps unity gain; check what the kit's mix does and mirror it.

Inside Blender, if you really need it:

- `se = scene.sequence_editor_create()`, then `se.strips.new_sound(name, filepath, channel, frame_start)`. `strips` replaced `sequences` in 4.4. Both `strips` and `new_sound` exist in [5.3 RNA](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/makesrna/intern/rna_sequencer_api.cc).
- Output must then be `media_type='VIDEO'`, `file_format='FFMPEG'`, `ffmpeg.audio_codec='AAC'`.
- Caveats (**unverified**):
  - 5.0 "VSE now uses a different scene for its context" (`context.sequencer_scene`).
  - A sequencer that contains only sound strips should still render the 3D camera.

### 9.4 Headless

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
    -P build_scene.py -- scene.spec.json out/ --render
# re-render later without Python:  Blender -b out/scene.blend -a      (or -f 42 for one frame)
```

- `-b` must come before `-P`. Script arguments go after `--` (read them from `sys.argv`).
- `--python-exit-code 1` makes script exceptions fail the process (**unverified** flag spelling in 5.3).
- `--factory-startup` ignores user prefs and add-ons, for reproducibility.

---

## 10. Recommended workflow

### 10.1 Recipe

1. **Three side:** `node scripts/export-blender.mjs <project>` writes `<project>/export/` (§10.5) in one command: it syncs the kit,
   runs export-spec, opens the composition in HyperFrames' own `chrome-headless-shell` (CDP, no puppeteer), drives the real
   `renderAt` for every frame, exports the glb, textures and reference frames, and verifies them (exit 1 if anything is off).
   Or `node scripts/build.mjs <project> --blender` after the MP4 render.
2. **Blender** (`blender -b --factory-startup -P references/blender/build_scene_skeleton.py -- <project>/export OUT_DIR --still 0`):
   1. `read_factory_settings(use_empty=True)`; set LINEAR as the new-key interpolation.
   2. Render settings (§9.2); engine EEVEE.
   3. Color management (§5.3), or EXR for Path B.
   4. World: hemisphere/ambient → world (§4.4), environment HDR (§4.6), camera-ray background.
   5. Materials (§3) → dict by name. Image textures for exported canvases.
   6. Lights (§4): directional/point/spot objects, look-at rotation, COMPAT energy.
   7. Geometry: import `export/geometry.glb` (node names = bake ids) when present (§8.4); otherwise primitives (§8.1).
   8. Animation: with `export/bake.json`, set each node's `matrix_world = C·M·C⁻¹` (camera/lights `C·M`) on every key frame, LINEAR.
      Otherwise use tracks → eased keys (§7.3), with a bake fallback. Meshes in `bake.deforming` (water, cloth, page curl) keep their t=`glb.sampledAt` shape.
   9. Camera: from `bake.camera.matrixWorld[n]` + `fovDeg[n]` (exact), else the ported rig (§1.4, §2.1).
   10. Beats → markers. Save `scene.blend`.
   11. Render frames, then post (Path B / Finish), then ffmpeg mux.
   12. **Compare:** use `export/refs/frame_NNNN.png` (listed in `manifest.refs` with their times) and the Blender frames at the same indices, and diff them (e.g. `ffmpeg -lavfi ssim`, or a side-by-side montage). Fix the biggest delta first: usually exposure/tone map, then lights, then materials.

### 10.2 Compact bpy skeleton (core moves)

This is **unexecuted**; Blender wasn't available. The full version, with the verified pure-math helpers, is `references/blender/build_scene_skeleton.py`.

```python
import bpy, math, mathutils

def lin(h):  # "#rrggbb" sRGB -> linear tuple
    f = lambda c: c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
    h = h.lstrip('#'); return tuple(f(int(h[i:i+2], 16)/255) for i in (0, 2, 4))
t2b = lambda v: (v[0], -v[2], v[1])                                   # three -> blender

# 1. clear scene + render + colour management
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'
scn.render.engine = 'BLENDER_EEVEE'                                   # 'BLENDER_EEVEE_NEXT' on 4.2–4.5
scn.render.resolution_x, scn.render.resolution_y = 1920, 1080
scn.render.fps, scn.frame_start, scn.frame_end = 30, 0, 30*6 - 1
scn.render.image_settings.media_type = 'IMAGE'                        # 5.0+
scn.render.image_settings.file_format = 'PNG'
scn.render.dither_intensity = 0.0
scn.display_settings.display_device = 'sRGB'
scn.view_settings.view_transform = 'AgX'                              # agx | 'Standard' | 'Khronos PBR Neutral' | 'ACES 1.3'
scn.view_settings.look, scn.view_settings.exposure = 'None', math.log2(1.0)

# 2. camera from keyframes (bake per frame; ease belongs to the ARRIVING key in kit/camera.js)
cd = bpy.data.cameras.new("Camera"); cd.sensor_fit, cd.sensor_height = 'VERTICAL', 24.0
cd.clip_start, cd.clip_end = 0.1, 200.0
cam = bpy.data.objects.new("Camera", cd); scn.collection.objects.link(cam); scn.camera = cam
cam.rotation_mode = 'QUATERNION'
keys = [{"t": 0, "pos": [0, 2, 10], "target": [0, .5, 0], "fov": 35},
        {"t": 4, "pos": [4, 3, 6], "target": [0, 1, 0], "fov": 28, "ease": "inOutCubic"}]
def in_out_cubic(u): return 4*u**3 if u < .5 else 1 - (-2*u + 2)**3/2
prev = None
for fr in range(scn.frame_start, scn.frame_end + 1):
    t = fr / scn.render.fps
    a, b = (keys[0], keys[1]) if t < keys[1]["t"] else (keys[1], keys[1])
    u = 0.0 if a is b else in_out_cubic(max(0, min(1, (t - a["t"]) / (b["t"] - a["t"]))))
    L = lambda p, q: [x + (y - x)*u for x, y in zip(p, q)]
    pos, tgt = mathutils.Vector(t2b(L(a["pos"], b["pos"]))), mathutils.Vector(t2b(L(a["target"], b["target"])))
    q = (tgt - pos).to_track_quat('-Z', 'Y')                          # == C · R_three(lookAt), verified
    if prev: q.make_compatible(prev)
    prev = q
    fov = a["fov"] + (b["fov"] - a["fov"])*u
    cam.location, cam.rotation_quaternion = pos, q
    cd.lens = cd.sensor_height / (2*math.tan(math.radians(fov)/2))   # three fov = vertical degrees
    cam.keyframe_insert("location", frame=fr); cam.keyframe_insert("rotation_quaternion", frame=fr)
    cd.keyframe_insert("lens", frame=fr)

# 3. Principled material from a spec entry
def material(name, m):
    mat = bpy.data.materials.new(name); nt = mat.node_tree; nt.nodes.clear()   # (4.x: mat.use_nodes = True first)
    out = nt.nodes.new("ShaderNodeOutputMaterial"); b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    b.inputs["Base Color"].default_value = (*lin(m["baseColor"]), 1)
    b.inputs["Roughness"].default_value = m.get("roughness", .6)
    b.inputs["Metallic"].default_value = m.get("metalness", 0)
    b.inputs["IOR"].default_value = m.get("ior", 1.5)
    if "clearcoat" in m:
        b.inputs["Coat Weight"].default_value = m["clearcoat"]
        b.inputs["Coat Roughness"].default_value = m.get("clearcoatRoughness", 0)
    if "emission" in m:
        b.inputs["Emission Color"].default_value = (*lin(m["emission"]["color"]), 1)
        b.inputs["Emission Strength"].default_value = m["emission"].get("strength", 1)
    return mat
clay = material("clay", {"baseColor": "#e4572e", "roughness": .55})

# 4. light from a spec entry (COMPAT units: sun = lux; point/spot W = 4π·cd)
def light(L):
    kind = {"directional": 'SUN', "point": 'POINT', "spot": 'SPOT'}[L["type"]]
    d = bpy.data.lights.new(L["id"], kind); d.color = lin(L["color"]); d.use_shadow = bool(L.get("shadow"))
    d.energy = L["intensity"] if kind == 'SUN' else 4*math.pi*L["intensity"]
    if kind != 'SUN': d.shadow_soft_size = 0.0
    if kind == 'SPOT': d.spot_size, d.spot_blend = 2*L.get("angle", math.pi/6), L.get("penumbra", .3)
    o = bpy.data.objects.new(L["id"], d); scn.collection.objects.link(o)
    o.location = t2b(L["position"]); o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = (mathutils.Vector(t2b(L.get("target", [0, 0, 0]))) - o.location).to_track_quat('-Z', 'Y')
light({"id": "key", "type": "directional", "color": "#fff1e0", "intensity": 2.4, "position": [5, 8, 6], "shadow": True})

# 5. keyframe an object with an easing: drop in with outBounce over beat [1.0s, +0.8s]
import bmesh
me = bpy.data.meshes.new("box"); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, vec=(1.0, 1.0, 1.0), verts=bm.verts); bm.to_mesh(me); bm.free()   # (w, d, h)
box = bpy.data.objects.new("box", me); scn.collection.objects.link(box); me.materials.append(clay)
box.rotation_mode = 'YZX'                                              # three Euler XYZ (a,b,c) -> (a,-c,b)
box.location = t2b([0, 3, 0]); box.keyframe_insert("location", frame=1.0*30)
box.location = t2b([0, .5, 0]); box.keyframe_insert("location", frame=1.8*30)
from bpy_extras.anim_utils import action_ensure_channelbag_for_slot  # 5.x layered actions
ad = box.animation_data
for fc in action_ensure_channelbag_for_slot(ad.action, ad.action_slot).fcurves:
    k0 = fc.keyframe_points[0]; k0.interpolation, k0.easing = 'BOUNCE', 'EASE_OUT'   # set on the START key
scn.timeline_markers.new("drop", frame=30)

# 6. render one still
scn.frame_set(54); scn.render.filepath = "//still_0054.png"; bpy.ops.render.render(write_still=True)
```

### 10.3 What the Three.js side must record so Blender can match it

This is the most important checklist. ✅ means `export-spec.mjs` / `export-blender.mjs` emit it (file in brackets); ➕ means still missing.

**Global / stage**

1. ✅ `fps`, `duration`, `resolution`, beats, camera keys, objects, score, duck.
2. ✅ [manifest.renderer] **Resolved renderer settings**: `toneMapping` (kit default `aces` when the style is silent), `toneMappingExposure`, `outputColorSpace`, `shadowMap.type`, the `antialias`/MSAA sample count, the background as actually used, camera `near/far/fov` defaults (35 / 0.1 / 200), `pixelRatio`, and **whether a post stack is active**. That flag decides whether `toneMapped:false` and background tone mapping apply.
3. ✅ [manifest.renderer.threeRevision] **`threeRevision`** (currently `181`) and the kit version. RoomEnvironment geometry changed in r183, and CapsuleGeometry's arguments changed in r176.
4. ✅ [manifest.frameRule, bake.frameRule] **Frame rule**: "frame n ↔ t = n/fps, frames 0…round(duration·fps)−1".

**Per-frame bake (top priority)**

5. ✅ [bake.json] **`bake`**: for every frame, the values `renderAt(t)` actually produced, so hand-written code, `floatAt`, `spring`, camera drift/orbit/roll and overlapping tracks all come along:
   - `camera`: `pos[3], quat[4], fov` (world space, Three convention)
   - `objects[id]`: local `pos, quat, scale, visible`, plus any animated material scalar (`opacity`, `emissiveIntensity`, color)
   - `lights[id]`: `pos, target, intensity, color`, if animated
   - `post`: per-frame bloom/tilt params, if `post.set()` is called in `renderAt`
   
   Store quaternions (not Eulers) and only channels that change; the size is fine. The Blender side then becomes "key every frame, LINEAR", which is exact by construction.

**Objects and geometry**

6. ➕ **Resolved geometry parameters**, including the ones the kit hard-codes: torus `radialSegments = 24`, capsule `capSegments 8 / radialSegments 24`, sphere `heightSegments = round(segments·0.66)`, plane/box segment counts.
7. ✅ [geometry.glb; node names = bake ids instead of a `geometryRef`] **`geometry.glb`** (one node per object id, identity transform) for `procedural`, `text`, `roundedBox`, icosahedron detail > 0, extrusions, tubes, terrain, and any UV-textured primitive. Give each spec object a `geometryRef`.
8. ➕ Per object: `castShadow`, `receiveShadow`, `visible`, `renderOrder`, `parent` (✅ partly), and the material name **after** per-object cloning, e.g. opacity clones.
9. ➕ **Resolved base transform at t=0** for builders that apply internal rotations (ground's −π/2), so the Blender side doesn't need to know builder internals.

**Materials and textures**

10. ✅ [manifest.materials] The fully resolved material type and flags: `type`, `side`, `transparent`, `opacity`, `alphaTest`, `depthWrite`, `toneMapped`, `vertexColors`, `envMapIntensity`, `flatShading`, plus Physical extras (`specularIntensity`, `specularColor`, `sheenColor`, `sheenRoughness`, `iridescenceIOR`, `thicknessRange`, `attenuationColor/Distance`).
11. ✅ [textures/*.png, manifest.textures, manifest.labels] **Every canvas texture as a PNG**: `map`, `bump`, `roughnessMap`, and text labels. Record the path, pixel size, `colorSpace`, `repeat`, `offset`, `wrapS/T`, `flipY`, `channel` (`color` / `bump` / `roughness`), and `bumpScale`. For text labels also record the world-space plane `width × height`, `lit`, `alphaTest` and `castShadow`. Keep the generator params (seed, octaves…) for re-authoring.

**Lights and world**

12. ✅ [manifest.lights, incl. `blender` energy hints] **Final light intensities** (after the `lightsFromSpec` `intensity` multiplier), explicit `decay` and `distance`, `castShadow`, shadow `{softness, mapSize, extent, near, far, bias, normalBias}`. **Add Blender-facing intent fields:** `sourceRadius` (m) for point/spot and `sunAngleDeg` for directional, so shadow softness is authored rather than guessed.
13. ➕ **`environmentHdr`**: the room environment exported as an equirect `.hdr`/`.exr` in Blender's convention (§4.6), plus `environmentIntensity` (✅) and `environmentRotation`.
14. ✅ Fog (`color, near, far`). ➕ Note that it's `smoothstep(near, far, viewDepth)` on **view-space z**, not linear and not distance. Blender's mist is linear or quadratic **distance**. Blender: render a Depth/Mist pass and apply `smoothstep` in the compositor or numpy.

**Post and audio**

15. ✅ `post` params. ✅ [manifest.renderer.post] **Resolved defaults** (createPost merges `{strength .6, radius .4, threshold .85}` etc.), plus the pipeline order and the stage each pass runs in (linear vs display).
16. ✅ [manifest.audio] **`audio`**: paths to the rendered SFX WAV and the VO WAV, sample rate, offset, and the exact mix and gain rule used by the HyperFrames render.

**Reference and validation**

17. ✅ [refs/, manifest.refs; 3–5 frames, `--refs` to choose] **Reference frames**: PNGs from the Three render at every beat start (and frame 0 and the last frame), listed in the spec. These are the agent's ground truth for the A/B diff in §10.1, step 12.
18. ➕ A `specHash` and the `export-spec` version, so a Blender build can say which spec it matched.

### 10.4 Calibration scene (run once per machine/Blender version)

A white Lambert sphere, a white plane, and one directional light of intensity π at 45°, with tone mapping `none`, rendered in both apps. The lit face of the plane should come out at sRGB ≈ `0.707` linear → 218/255. Then swap in a point light (intensity 10 cd at 2 m), then an ambient light (π), then a hemisphere light. The test confirms or corrects the factors in §4.2 and §4.4 and the EEVEE world Light Path behaviour, and it's the first thing to run when Blender becomes available.

---

### 10.5 What `export-blender.mjs` writes (verified on 00-smoke and 01-low-poly)

`<project>/export/`:

| File | Contents |
|---|---|
| `scene.spec.json` | Same as `export-spec.mjs` (style + scene plain data). |
| `manifest.json` | `renderer` (three revision, GL renderer, resolution, pixelRatio, outputColorSpace, toneMapping, exposure, antialias, post MSAA samples, shadowMap type **as resolved**, background, fog, environment, camera near/far/fov, post pass order + resolved bloom/tilt/vignette/grain/tint, overlay), `lights[]` (final intensity + unit, colour, world position/target, decay, distance, angle, penumbra, shadow mapSize/bias/extent/near/far, `softness`, `softnessEffectiveTexels`, `texelMetres`, `blurMetres`, **`sunAngleDeg`** (directional) / **`sourceRadius`** (point/spot), and `blender` energy hints: SUN strength = lux, POINT/SPOT W = 4π·cd, WORLD = I/π), `materials[]` (type, colours, PBR values, flags, custom-shader note), `textures[]` (file, role/slot, material, users, pixel size, colorSpace, wrapS/T, repeat, offset, flipY, bumpScale), `labels[]` (id, lines, PNG, plane size in m, lit, toneMapped, alphaTest, castShadow, onOverlay), `bake` summary, `glb` summary, `refs[]` (file, frame, t), `audio[]` (relative + absolute WAV path, sample rate, channels, seconds, mix rule), `verify` (checks below), `pageWarnings`. |
| `bake.json` | `fps`, `frames` (= round(duration·fps)), `camera.matrixWorld[n]` (16, column-major, dense) + `fovDeg[n]` + near/far; `nodes[id] = { keys: [[frame, m16]...], vis: [[frame, bool]...] }` sparse (a key only when the value changes; hold until the next); `lights[id]`, `materials[name]` (opacity, colour, emissive, emissiveIntensity, visible), `post` sparse; `deforming[]` = node ids whose vertices moved during the bake (not baked). |
| `geometry.glb` | GLTFExporter r181, whole scene incl. invisible nodes, node names = bake ids, textures embedded (≤ 2048 px), transforms at `glb.sampledAt` (default t = 0). |
| `textures/*.png` | Every canvas texture (maps, bumps, sky background, text labels). |
| `refs/frame_NNNN.png` | Canvas readbacks from the same page at 3–5 times (default: frame 0, beat starts, last frame). |

Bake ids are the object name, or `parent/Type` for unnamed nodes, with `#n` appended to duplicates (e.g. `flag#3/Mesh#1`). Light-target nodes and helpers are included. Sizes: 00-smoke 11 MB (13 nodes, 150 frames), 01-low-poly 20 MB (335 nodes, 450 frames; most of it is the uncompressed-grain reference PNGs).

Verification run by the script (exit 1 on failure): GLB header/chunk/bufferView bounds check in Node **and** a real parse with the vendored `GLTFLoader` in the page (00-smoke: 5 meshes / 7,024 triangles; 01-low-poly: 254 meshes / 14,330 triangles); `bake` camera frames == duration × fps (150, 450); every PNG has a PNG header and is non-empty. **The Blender side (`build_scene_skeleton.py` bpy section) remains unexecuted: Blender is not installed here.**

---

## 11. Known mismatches (and the compromise)

| Area | Mismatch | Recommended compromise |
|---|---|---|
| ACES tone mapping | Three uses a fitted RRT+ODT with ×1/0.6; Blender's ACES 1.3 is a real ACES Rec.1886 view | Author parity-critical styles with `agx`/`neutral`, or use Path B (numpy tone map on EXR) |
| AgX | Three's AgX is a polynomial fit of Blender's | Accept (close), or Path B |
| `toneMapped:false` neon / text (no post stack) | Blender can't skip tone mapping per material | Standard view, or a separate layer composited after the view transform |
| Background color | Blender's world lights the scene; Three's background doesn't. It may or may not be tone-mapped on the Three side depending on the post stack | Light Path camera-ray mix, or `film_transparent` + post composite |
| Hemisphere/ambient | Blender's world also gives speculars and occlusion | Accept; for glossy materials, lower world strength on glossy rays (Light Path, Cycles) |
| Light units | Derived 4π / 1:1 factors not render-checked; distance cutoff and decay≠2 unsupported | Run §10.4; bake distance falloff into energy |
| Spot falloff | Different smoothstep parameterisation | Match `spot_blend` by eye on one frame |
| Shadows | PCF texel blur vs physical penumbra; no receive-only switch | Author `sourceRadius`/`sunAngleDeg`; use `visible_shadow`; light linking for receive-off |
| Room environment | No Blender equivalent; PMREM prefiltering | Export equirect HDR from Three (§4.6) |
| GI / reflections | Blender (Cycles, EEVEE with ray tracing) adds bounce light and SSR that Three lacks | EEVEE with `use_raytracing=False`; Cycles with low bounces |
| Transmission | Three's screen-space transmission vs true refraction | Accept it, or keep glass styles Blender-native |
| Canvas textures / bump | Different noise algorithms | Export PNGs; port the generator |
| Primitive UVs / icosphere / rounded box / extrude / text | Different tessellation, UVs and metrics | `geometry.glb` from Three |
| Expo easing | Blender renormalises (≤ 0.1 %) | Accept |
| Elastic easing | Blender defaults differ by 57 % | Set `amplitude=|Δ|`, `period=0.3·Δframes` (or bake) |
| `spring()`, code in `renderAt`, overlapping tracks, drift | No F-curve equivalent | Per-frame bake (§10.3, item 5) |
| Bloom | Different kernel and parameter meaning | Glare Bloom, calibrated by eye; or numpy port |
| Tilt-shift | Screen-space band blur vs depth-based DoF | numpy on EXR (exact), or compositor mask blur |
| Vignette / grain / tint | Applied after tone mapping in Three | numpy/ffmpeg on the final PNGs with the kit formula (vignette exact, grain statistical) |
| Anti-aliasing | MSAA ×4 vs Blender's filter (1.5 px default) | Accept; optionally `filter_size = 1.0` |
| Fog | smoothstep on view-z vs linear/quadratic on distance | Depth pass + smoothstep in post |
| Lines | WebGL lines are always 1 px; Freestyle has its own edge detection | Freestyle (crease = 180° − threshold), thickness in px |
| Transparency sorting | Per-object sort vs Blender's blended/dithered | Use `BLENDED` + `use_transparency_overlap`, or alpha-test |
| Audio | Blender VSE context changed in 5.0 | Mux with ffmpeg |

---

## Appendix A — regenerating the self-test reference (`ref.json`)

Run from any scratch directory with Node ≥ 20. `SK` is the skill folder.

```js
// dump.mjs
const SK = `${process.env.HOME}/Library/CloudStorage/Dropbox/D Second Brain/Skills/3d-style-atlas`;
const THREE = await import("file://" + encodeURI(SK + "/vendor/three/three.module.min.js"));
const { ease } = await import("file://" + encodeURI(SK + "/kit/time.js"));
const out = { ease: {}, cam: null };
for (const k of Object.keys(ease)) out.ease[k] = Array.from({ length: 101 }, (_, i) => ease[k](i / 100));
const keys = [{ t: 0, pos: [0, 2, 10], target: [0, .5, 0], fov: 35 },
              { t: 2, pos: [4, 3, 6], target: [0, 1, 0], fov: 28, ease: "inOutCubic", roll: 0.1 }];
const drift = { amp: 0.06, speed: 0.4 }, samples = [];
for (const t of [0, .5, 1, 1.5, 2, 3]) {           // same math as kit/camera.js sample() + update()
  const u = t >= 2 ? 1 : t > 0 ? ease.inOutCubic(t / 2) : 0, L = (a, b) => a.map((v, i) => v + (b[i] - v) * u);
  const pos = L(keys[0].pos, keys[1].pos), target = L(keys[0].target, keys[1].target);
  const fov = 35 + (28 - 35) * u, roll = 0.1 * u;
  pos[0] += Math.sin(t * drift.speed * 2.1) * drift.amp; pos[1] += Math.sin(t * drift.speed * 1.3 + 1.7) * drift.amp * 0.5;
  pos[2] += Math.cos(t * drift.speed * 1.7 + 0.4) * drift.amp * 0.6;
  const cam = new THREE.PerspectiveCamera(fov, 16 / 9, .1, 100);
  cam.position.set(...pos); cam.lookAt(...target); if (roll) cam.rotateZ(roll);
  samples.push({ t, pos, target, fov, roll, quat: cam.quaternion.toArray() });
}
out.cam = { keys, drift, samples };
(await import("node:fs")).writeFileSync("ref.json", JSON.stringify(out));
```

Then run `python3 references/blender/build_scene_skeleton.py --selftest ref.json`. Expected output: `SELFTEST PASSED`, with Expo at ≤ 6e-3 absolute in the random track test.

## Appendix B — primary sources

- Blender 5.3 source (release branch): [principled sockets](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/nodes/shader/nodes/node_shader_bsdf_principled.cc), [glare](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/nodes/composite/nodes/node_composite_glare.cc), [easing](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/blenlib/intern/easing.cc), [F-curve eval](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/blenkernel/intern/fcurve.cc), [keyframe RNA](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/makesrna/intern/rna_fcurve.cc), [light RNA](https://github.com/blender/blender/blob/blender-v5.3-release/source/blender/makesrna/intern/rna_light.cc), [OCIO config](https://github.com/blender/blender/blob/blender-v5.3-release/release/datafiles/colormanagement/config.ocio)
- [Blender 5.0 Python API release notes](https://developer.blender.org/docs/release_notes/5.0/python_api/) — EEVEE id, `compositing_node_group`, layered actions, `media_type`
- Blender manual (5.3): [Principled BSDF](https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/principled.html), [Light objects / Power of Lights](https://docs.blender.org/manual/en/latest/render/lights/light_object.html), [Freestyle](https://docs.blender.org/manual/en/latest/render/freestyle/introduction.html)
- glTF-Blender-IO: [light import conversion](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/addons/io_scene_gltf2/blender/imp/light.py), [import options](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/addons/io_scene_gltf2/__init__.py)
- three.js: [migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide), [tone mapping chunk](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js), [fog chunk](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/fog_fragment.glsl.js), [light chunks](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/lights_pars_begin.glsl.js). The vendored copy is r181; the shader-chunk links are `dev` (≈ r187), and the relevant lines were unchanged at the time of reading.
