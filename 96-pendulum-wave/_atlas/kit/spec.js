// spec.js — turn plain-data specs (STYLE_SPEC + scene.config.js) into Three.js objects.
// The data shapes are documented in references/kit-api.md ("Spec schema").
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { toEase, clamp, lerp, Timeline } from "./time.js";
import { noiseTexture, paperTexture, gridTexture, bumpFromNoise, speckleTexture, gradientTexture, woodTexture } from "./textures.js";
import { createTextLabel } from "./text.js";
import { createGround, createCyclorama } from "./builders.js";
import { lightsFromSpec, useRoomEnvironment } from "./lights.js";
import { createPost } from "./post.js";
import { SHADOW_TYPES, setProjection } from "./core.js";

const warned = new Set();
/** console.warn once per message (style/scene validation; visible in `hyperframes check` output). */
export function warnOnce(msg) {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(`[atlas] ${msg}`);
}

const TEX = { noise: noiseTexture, paper: paperTexture, grid: gridTexture, speckle: speckleTexture, gradient: gradientTexture, bumpNoise: bumpFromNoise, wood: woodTexture };

/** textureFromSpec({ source: "noise"|"paper"|"grid"|"speckle"|"gradient"|"bumpNoise"|"wood", ...params }) */
export function textureFromSpec(s) {
  const f = TEX[s.source];
  if (!f) throw new Error(`textureFromSpec: unknown source "${s.source}"`);
  return f(s);
}

/**
 * materialFromSpec(m) -> THREE.Material
 *   m: { type = "standard"|"physical"|"basic"|"toon"|"lambert", baseColor, roughness, metalness,
 *        emission?: {color, strength}, clearcoat?, clearcoatRoughness?, transmission?, ior?, thickness?,
 *        opacity?, flatShading?, vertexColors?, side?: "front"|"double", map?: textureSpec,
 *        bump?: {...textureSpec, strength}, roughnessMap?: textureSpec }
 *   vertexColors: true multiplies baseColor by the geometry's `color` attribute (use baseColor "#ffffff"
 *   when the vertex colours carry the whole palette, e.g. faceted low-poly).
 *   emission works on standard, physical, toon and lambert. On "basic" it is ignored (warned): a basic
 *   material is already unlit, so put the colour in baseColor. clearcoat does NOT kill emission in r181
 *   (measured): it attenuates it by the coat Fresnel, ~2 % facing the camera, ~30 % at the silhouette.
 */
export function materialFromSpec(m, name = "") {
  const type = m.type ?? (m.clearcoat || m.transmission ? "physical" : "standard");
  const p = { color: m.baseColor ?? "#cccccc" };
  if (m.flatShading) p.flatShading = true;
  if (m.vertexColors) p.vertexColors = true;
  if (m.side === "double") p.side = THREE.DoubleSide;
  if (m.opacity != null && m.opacity < 1) Object.assign(p, { transparent: true, opacity: m.opacity });
  if (m.map) p.map = textureFromSpec(m.map);
  if (type === "standard" || type === "physical") {
    Object.assign(p, { roughness: m.roughness ?? 0.6, metalness: m.metalness ?? 0 });
    if (m.emission) Object.assign(p, { emissive: m.emission.color, emissiveIntensity: m.emission.strength ?? 1 });
    if (m.bump) Object.assign(p, { bumpMap: textureFromSpec({ source: "bumpNoise", ...m.bump }), bumpScale: m.bump.strength ?? 1 });
    if (m.roughnessMap) p.roughnessMap = textureFromSpec(m.roughnessMap);
  }
  if (type === "physical") {
    for (const k of ["clearcoat", "clearcoatRoughness", "transmission", "ior", "thickness", "sheen", "iridescence"]) if (m[k] != null) p[k] = m[k];
  }
  if ((type === "toon" || type === "lambert") && m.emission) Object.assign(p, { emissive: m.emission.color, emissiveIntensity: m.emission.strength ?? 1 });
  if (type === "basic" && m.emission) warnOnce(`material "${name}": emission is ignored on type "basic" (already unlit) — put the colour in baseColor or use "standard"`);
  if (m.emission && !(m.emission.strength > 0) && m.emission.strength != null) warnOnce(`material "${name}": emission.strength is ${m.emission.strength} — renders unlit`);
  const C = { standard: THREE.MeshStandardMaterial, physical: THREE.MeshPhysicalMaterial, basic: THREE.MeshBasicMaterial, toon: THREE.MeshToonMaterial, lambert: THREE.MeshLambertMaterial }[type];
  if (!C) throw new Error(`materialFromSpec: unknown type "${type}"`);
  return new C(p);
}

/** materialsFromSpec({ name: materialSpec, ... }) -> { name: THREE.Material } */
export const materialsFromSpec = (mats = {}) => Object.fromEntries(Object.entries(mats).map(([k, v]) => {
  const mat = materialFromSpec(v, k);
  mat.name = mat.name || k;
  return [k, mat];
}));

/** geometryFromSpec(primitive, dims) — see kit-api.md for dims per primitive. */
export function geometryFromSpec(primitive, d = {}) {
  switch (primitive) {
    case "box": return new THREE.BoxGeometry(d.w ?? 1, d.h ?? 1, d.d ?? 1);
    case "roundedBox": return new RoundedBoxGeometry(d.w ?? 1, d.h ?? 1, d.d ?? 1, d.segments ?? 4, d.radius ?? 0.08);
    case "sphere": return new THREE.SphereGeometry(d.r ?? 0.5, d.segments ?? 48, Math.round((d.segments ?? 48) * 0.66));
    case "cylinder": return new THREE.CylinderGeometry(d.rTop ?? d.r ?? 0.5, d.rBottom ?? d.r ?? 0.5, d.h ?? 1, d.segments ?? 48);
    case "cone": return new THREE.ConeGeometry(d.r ?? 0.5, d.h ?? 1, d.segments ?? 48);
    case "torus": return new THREE.TorusGeometry(d.r ?? 0.5, d.tube ?? 0.15, 24, d.segments ?? 64);
    case "plane": return new THREE.PlaneGeometry(d.w ?? 1, d.h ?? 1);
    case "capsule": return new THREE.CapsuleGeometry(d.r ?? 0.3, d.length ?? 1, 8, 24);
    case "icosahedron": return new THREE.IcosahedronGeometry(d.r ?? 0.5, d.detail ?? 0);
    default: throw new Error(`geometryFromSpec: unknown primitive "${primitive}"`);
  }
}

/**
 * objectsFromSpec(scene, objects, materials, { textStyle, factories }) -> { [id]: Object3D }
 *   object spec: { id, primitive, dims?, position?, rotation?, scale?, material?, castShadow = true,
 *                  receiveShadow = true, text? (primitive "text"), textOpts?, anim? }
 *   primitive "text" uses createTextLabel(text, {...textStyle, ...textOpts, height: dims.height}).
 *   primitive "ground" / "cyclorama" use builders with dims as options.
 *   primitive "procedural" calls factories[obj.factory](obj, materials) — the spec carries
 *   `procedural: "<description>"` for non-Three translators.
 *   scale (spec and anim tracks) MULTIPLIES the object's constructed scale, stored in
 *   userData.intrinsicScale: [1,1,1] for primitives, the plane size for text labels (so a scale track
 *   keeps the label's aspect), whatever a factory set for procedural objects.
 */
export function objectsFromSpec(scene, objects = [], materials = {}, { textStyle = {}, factories = {} } = {}) {
  const out = {};
  for (const o of objects) {
    const mat = o.material ? materials[o.material] : undefined;
    if (o.material && !mat) throw new Error(`objectsFromSpec: unknown material "${o.material}" on ${o.id}`);
    let obj;
    if (o.primitive === "text") obj = createTextLabel(o.text ?? "", { ...textStyle, ...(o.textOpts ?? {}), height: o.dims?.height ?? textStyle.height ?? 0.6 });
    else if (o.primitive === "ground") obj = createGround({ ...(o.dims ?? {}), material: mat });
    else if (o.primitive === "cyclorama") obj = createCyclorama({ ...(o.dims ?? {}), material: mat });
    else if (o.primitive === "procedural") {
      const f = factories[o.factory];
      if (!f) throw new Error(`objectsFromSpec: no factory "${o.factory}" for ${o.id}`);
      obj = f(o, materials);
    } else {
      obj = new THREE.Mesh(geometryFromSpec(o.primitive, o.dims), mat ?? new THREE.MeshStandardMaterial());
      obj.castShadow = o.castShadow ?? true;
      obj.receiveShadow = o.receiveShadow ?? true;
    }
    obj.name = o.id;
    const intrinsic = obj.scale.toArray();
    if (o.position) obj.position.set(...o.position);
    if (o.rotation) obj.rotation.set(...o.rotation);
    const specScale = o.scale == null ? [1, 1, 1] : Array.isArray(o.scale) ? o.scale.slice(0, 3) : [o.scale, o.scale, o.scale];
    obj.scale.set(intrinsic[0] * specScale[0], intrinsic[1] * specScale[1], intrinsic[2] * specScale[2]);
    if (o.anim?.some((a) => a.prop === "opacity") && obj.material) {
      obj.material = obj.material.clone();
      obj.material.transparent = true;
    }
    obj.userData.spec = o;
    obj.userData.intrinsicScale = intrinsic;
    // base.scale is in SPEC units (multiplier of intrinsicScale), the same units anim tracks use
    obj.userData.base = { position: obj.position.toArray(), rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z], scale: specScale };
    (o.parent ? out[o.parent] : scene).add(obj);
    out[o.id] = obj;
  }
  return out;
}

const asVec = (v, n) => (Array.isArray(v) ? v : Array(n).fill(v));

/**
 * evalTrack(tracks, timeline, t, base) — value of one property at t.
 * Tracks are sorted by start; at t the LAST track whose start <= t applies (clamped/eased);
 * before the first track starts, the first track's `from` holds. Missing from/to = base.
 */
export function evalTrack(tracks, timeline, t, base) {
  const ts = tracks.map((a) => {
    const b = a.beat ? timeline.get(a.beat) : { t: 0, dur: 0 };
    return { ...a, start: (a.at ?? b.t) + (a.offset ?? 0), dur: a.dur ?? b.dur };
  }).sort((x, y) => x.start - y.start);
  let cur = ts[0], p = 0;
  for (const tr of ts) if (t >= tr.start) cur = tr;
  if (t >= cur.start) p = cur.dur > 0 ? toEase(cur.ease ?? "inOutCubic")(clamp((t - cur.start) / cur.dur)) : 1;
  const from = cur.from ?? base, to = cur.to ?? base;
  if (typeof base === "number") return lerp(from, to, p);
  const n = base.length, f = asVec(from, n), g = asVec(to, n);
  return f.map((x, i) => lerp(x, g[i], p));
}

/**
 * animateObjects(objs, timeline, t) — apply every object's spec.anim at time t.
 *   anim item: { prop: "position"|"rotation"|"scale"|"opacity", beat?: id, at?: seconds, offset = 0,
 *                dur? (default beat.dur), from?, to?, ease = "inOutCubic" }
 *   scale accepts a scalar (uniform) or [x,y,z]; values are absolute, not offsets, and multiply
 *   userData.intrinsicScale (text labels keep their aspect; primitives have intrinsic [1,1,1]).
 * Call inside renderAt BEFORE any hand-written per-object tweaks (so code can add on top).
 */
export function animateObjects(objs, timeline, t) {
  const tl = timeline instanceof Timeline ? timeline : new Timeline(timeline);
  for (const obj of Object.values(objs)) {
    const anim = obj.userData.spec?.anim;
    if (!anim?.length) continue;
    const base = obj.userData.base;
    const byProp = {};
    for (const a of anim) (byProp[a.prop] ??= []).push(a);
    for (const [prop, tracks] of Object.entries(byProp)) {
      if (prop === "opacity") obj.material.opacity = evalTrack(tracks, tl, t, 1);
      else if (prop === "scale") {
        const v = evalTrack(tracks, tl, t, base.scale);
        const k = obj.userData.intrinsicScale ?? [1, 1, 1];
        obj.scale.set(v[0] * k[0], v[1] * k[1], v[2] * k[2]);
        obj.visible = Math.abs(v[0] * v[1] * v[2]) > 1e-6;
      } else obj[prop].set(...evalTrack(tracks, tl, t, base[prop]));
    }
  }
}

/**
 * resolveShadowType(world, lights) -> "pcf"|"pcfsoft"|"vsm"|"basic"
 *   world.shadowType "auto" (the default when unset): "pcf" if any light sets shadow.softness, else
 *   "pcfsoft". An explicit "pcfsoft"/"basic" with a softness set warns: softness has no effect there.
 */
export function resolveShadowType(world = {}, lights = []) {
  const soft = lights.filter((l) => l.shadow && l.shadow !== true && l.shadow.softness != null);
  const want = world.shadowType ?? "auto";
  if (want === "auto") return soft.length ? "pcf" : "pcfsoft";
  if (!SHADOW_TYPES[want]) throw new Error(`world.shadowType "${want}" unknown (auto|pcf|pcfsoft|vsm|basic)`);
  if ((want === "pcfsoft" || want === "basic") && soft.length) {
    warnOnce(`world.shadowType "${want}" ignores shadow.softness (set on: ${soft.map((l) => l.id).join(", ")}); use "pcf" or "auto"`);
  }
  return want;
}

/**
 * applyStyleSpec(stage, spec, { post = true }) -> { materials, lights, post, shadowType }
 *   Applies spec.world (background, sky gradient, fog, environment, toneMapping, exposure, shadowType),
 *   spec.camera (fov, near, far), spec.lights, spec.materials, spec.post.
 *   world.sky = { top, horizon, horizonAt = 0.5, bottom = horizon, size = 256 } | { stops, size }
 *     replaces the flat background with a vertical gradient (top of frame -> bottom). Match fog to horizon.
 */
export function applyStyleSpec(stage, spec, { post = true } = {}) {
  const { scene, renderer, camera } = stage;
  const w = spec.world ?? {};
  if (w.background !== undefined) scene.background = w.background == null ? null : new THREE.Color(w.background);
  if (w.sky) scene.background = skyTexture(w.sky);
  if (w.fog) scene.fog = new THREE.Fog(w.fog.color, w.fog.near, w.fog.far);
  if (w.environment === "room") useRoomEnvironment(renderer, scene, w.environmentIntensity ?? 1);
  if (w.exposure != null) renderer.toneMappingExposure = w.exposure;
  const shadowType = resolveShadowType(w, spec.lights ?? []);
  if (renderer.shadowMap.type !== SHADOW_TYPES[shadowType]) {
    renderer.shadowMap.type = SHADOW_TYPES[shadowType];
    renderer.shadowMap.needsUpdate = true;
  }
  if (w.toneMapping) renderer.toneMapping = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, none: THREE.NoToneMapping }[w.toneMapping];
  const c = spec.camera ?? {};
  if (c.projection && c.projection !== (stage.camera.isOrthographicCamera ? "orthographic" : "perspective")) setProjection(stage, c.projection, { viewHeight: c.viewHeight });
  if (c.fov || c.near != null || c.far != null) {
    const camera = stage.camera;
    if (c.fov) camera.fov = c.fov;
    if (c.near != null) camera.near = c.near;
    if (c.far != null) camera.far = c.far;
    camera.updateProjectionMatrix();
  }
  const lights = lightsFromSpec(scene, spec.lights ?? []);
  const materials = materialsFromSpec(spec.materials);
  const p = post && spec.post && Object.keys(spec.post).length ? createPost(stage, spec.post) : null;
  stage.styleSpec = spec; // read by export-blender (resolved renderer + light report)
  return { materials, lights, post: p, shadowType };
}

/** skyTexture({ top, horizon, horizonAt = .5, bottom, size = 256 } | { stops, size }) -> vertical gradient texture. */
export function skyTexture(sky) {
  const stops = sky.stops ?? [[0, sky.top], [sky.horizonAt ?? 0.5, sky.horizon], [1, sky.bottom ?? sky.horizon]];
  return gradientTexture({ size: sky.size ?? 256, stops, angle: 90 });
}
