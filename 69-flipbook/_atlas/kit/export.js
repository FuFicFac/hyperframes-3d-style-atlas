// export.js — in-browser data capture for the Blender hand-off (driven by scripts/export-blender.mjs).
// Runs inside the real composition page and calls the real window.__atlas.renderAt(t), so code-driven
// motion (renderAt tweaks, springs, drift, flicker, setOpen...) is captured exactly as rendered.
// Nothing here is used at render time. All functions are pure reads except the renderAt calls and the
// temporary node renaming during GLB export (restored afterwards).
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { SHADOW_TYPES } from "./core.js";

export const EXPORT_VERSION = "3d-style-atlas/blender-export@1";
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const hex = (c) => `#${c.getHexString()}`;
const TONE_NAMES = { [THREE.NoToneMapping]: "none", [THREE.ACESFilmicToneMapping]: "aces", [THREE.AgXToneMapping]: "agx", [THREE.NeutralToneMapping]: "neutral", [THREE.LinearToneMapping]: "linear", [THREE.ReinhardToneMapping]: "reinhard", [THREE.CineonToneMapping]: "cineon" };
const SHADOW_NAMES = Object.fromEntries(Object.entries(SHADOW_TYPES).map(([k, v]) => [v, k]));
const TEX_SLOTS = ["map", "bumpMap", "roughnessMap", "metalnessMap", "normalMap", "emissiveMap", "alphaMap", "aoMap", "clearcoatMap"];
const WRAP = { [THREE.RepeatWrapping]: "repeat", [THREE.ClampToEdgeWrapping]: "clamp", [THREE.MirroredRepeatWrapping]: "mirror" };

/** Stable unique ids for every node under the scene: name (or type) + "#n" for duplicates, parent path for unnamed. */
function assignIds(scene) {
  const used = new Map();
  const ids = new Map();
  scene.traverse((o) => {
    if (o === scene) return;
    let base = o.name || `${ids.get(o.parent) ?? "scene"}/${o.type}`;
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    ids.set(o, n ? `${base}#${n}` : base);
  });
  return ids;
}

const allMaterials = (scene) => {
  const m = new Map();
  scene.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const x of ms) if (!m.has(x)) m.set(x, o);
  });
  return m;
};
const effVisible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

/** Renderer + post settings as actually resolved on this stage. */
export function rendererReport(stage) {
  const { renderer, scene, camera } = stage;
  const gl = renderer.getContext();
  const attrs = gl.getContextAttributes?.() ?? {};
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const post = stage.post;
  const P = post?.passes ?? {};
  const spec = stage.styleSpec ?? {};
  return {
    threeRevision: THREE.REVISION,
    glRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
    resolution: [stage.width, stage.height],
    pixelRatio: renderer.getPixelRatio(),
    outputColorSpace: renderer.outputColorSpace,
    toneMapping: TONE_NAMES[renderer.toneMapping] ?? renderer.toneMapping,
    toneMappingExposure: renderer.toneMappingExposure,
    antialias: !!attrs.antialias,
    postMsaaSamples: post ? post.composer.renderTarget1.samples : null,
    postTargetType: post ? "HalfFloat (linear HDR)" : null,
    shadowMap: { enabled: renderer.shadowMap.enabled, type: SHADOW_NAMES[renderer.shadowMap.type] ?? renderer.shadowMap.type },
    background: scene.background?.isColor ? hex(scene.background) : scene.background?.isTexture ? "texture (see textures[] role 'background')" : null,
    fog: scene.fog ? { kind: "linear-view-z-smoothstep", color: hex(scene.fog.color), near: scene.fog.near, far: scene.fog.far } : null,
    environment: scene.environment ? { kind: spec.world?.environment ?? "custom", intensity: scene.environmentIntensity } : null,
    camera: { fovDeg: camera.fov, near: camera.near, far: camera.far, aspect: camera.aspect, fovAxis: "vertical" },
    post: post
      ? {
          order: ["render (linear HDR)", ...(P.bloom ? ["bloom (linear, pre-tonemap)"] : []), ...(P.tiltH ? ["tiltShift H+V (linear)"] : []), "output (tone map + sRGB)", "finish (tint, vignette, grain on display values)"],
          bloom: P.bloom ? { strength: P.bloom.strength, radius: P.bloom.radius, threshold: P.bloom.threshold, thresholdSpace: "linear HDR luminance before tone mapping" } : null,
          tiltShift: P.tiltH ? { focus: P.tiltH.uniforms.uFocus.value, range: P.tiltH.uniforms.uRange.value, blur: P.tiltH.uniforms.uBlur.value } : null,
          vignette: { darkness: P.finish.uniforms.uVignette.value, offset: P.finish.uniforms.uVigOffset.value },
          grain: { amount: P.finish.uniforms.uGrain.value },
          tint: hex(P.finish.uniforms.uTint.value),
        }
      : null,
    overlay: stage.overlay ? { objects: stage.overlay.scene.children.length, note: "drawn after post, no tone mapping" } : null,
  };
}

/**
 * Light report with units and Blender-facing softness. Softness heuristics (documented in
 * blender-translation.md §10.5): effective blur radius in shadow-map texels = shadow.radius for pcf/vsm,
 * ~1 for pcfsoft (fixed kernel), 0 for basic; blurWorld = radius x texel size (m) at the light's target
 * distance; sunAngleDeg = deg(2 atan(blurWorld)) (penumbra = 2 x blurWorld at 1 m occluder->receiver);
 * sourceRadius = blurWorld x L (point/spot at distance L, same 1 m reference).
 */
export function lightReport(stage, ids) {
  const out = [];
  const type = SHADOW_NAMES[stage.renderer.shadowMap.type];
  const specLights = Object.fromEntries((stage.styleSpec?.lights ?? []).map((l) => [l.id, l]));
  stage.scene.traverse((l) => {
    if (!l.isLight) return;
    const kind = l.isDirectionalLight ? "directional" : l.isSpotLight ? "spot" : l.isPointLight ? "point" : l.isHemisphereLight ? "hemisphere" : l.isAmbientLight ? "ambient" : l.type;
    const wp = l.getWorldPosition(new THREE.Vector3());
    const tp = l.target ? l.target.getWorldPosition(new THREE.Vector3()) : null;
    const unit = kind === "spot" || kind === "point" ? "candela (three physical, decay 2)" : "lux-like scalar (three physical)";
    const e = {
      id: ids.get(l), type: kind, color: hex(l.color), intensity: r6(l.intensity), unit,
      groundColor: l.groundColor ? hex(l.groundColor) : undefined,
      position: wp.toArray().map(r6), target: tp?.toArray().map(r6),
      distance: l.distance, decay: l.decay, angle: l.angle, penumbra: l.penumbra,
      specIntensity: specLights[l.name]?.intensity,
      blender: kind === "directional" ? { type: "SUN", strength: r6(l.intensity) } : kind === "point" || kind === "spot" ? { type: kind.toUpperCase(), watts: r6(4 * Math.PI * l.intensity) } : { type: "WORLD", strength: r6(l.intensity / Math.PI) },
      castShadow: !!l.castShadow,
    };
    if (l.castShadow && l.shadow) {
      const s = l.shadow, cam = s.camera, map = s.mapSize.x;
      const effR = type === "pcf" || type === "vsm" ? s.radius : type === "pcfsoft" ? 1 : 0;
      const L = tp ? wp.distanceTo(tp) : wp.length();
      let texel;
      if (cam.isOrthographicCamera) texel = (cam.right - cam.left) / map;
      else texel = (2 * L * Math.tan(THREE.MathUtils.degToRad(cam.fov ?? 90) / 2)) / map;
      const blur = effR * texel;
      e.shadow = {
        mapSize: map, softness: s.radius, softnessEffectiveTexels: effR, shadowType: type, bias: s.bias, normalBias: s.normalBias,
        extent: cam.isOrthographicCamera ? cam.right : undefined, near: cam.near, far: cam.far, texelMetres: r6(texel), blurMetres: r6(blur),
        sunAngleDeg: kind === "directional" ? r6(THREE.MathUtils.radToDeg(2 * Math.atan(blur))) : undefined,
        sourceRadius: kind !== "directional" ? r6(blur * L) : undefined,
        softnessNote: "heuristic: penumbra matched at 1 m occluder->receiver distance",
      };
    }
    out.push(e);
  });
  return out;
}

/** Texture + label inventory; returns { textures: [...], labels: [...], files: { name: dataURL } }. */
export function textureReport(stage, ids) {
  const files = {};
  const byImage = new Map();
  const textures = [];
  const fileFor = (img, hint) => {
    if (byImage.has(img)) return byImage.get(img);
    let url = null;
    try {
      if (img instanceof HTMLCanvasElement) url = img.toDataURL("image/png");
      else if (img && img.width) { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d").drawImage(img, 0, 0); url = c.toDataURL("image/png"); }
    } catch { url = null; }
    if (!url) return null;
    const name = `${hint.replace(/[^a-z0-9_.-]+/gi, "_").slice(0, 60)}_${byImage.size}.png`;
    byImage.set(img, name);
    files[name] = url;
    return name;
  };
  const texInfo = (tex, role, extra) => {
    const file = fileFor(tex.image, `${role}_${extra.material ?? "scene"}`);
    textures.push({
      file, role, ...extra, size: tex.image ? [tex.image.width, tex.image.height] : null, colorSpace: tex.colorSpace,
      wrapS: WRAP[tex.wrapS], wrapT: WRAP[tex.wrapT], repeat: tex.repeat.toArray(), offset: tex.offset.toArray(), rotation: tex.rotation, flipY: tex.flipY,
    });
  };
  if (stage.scene.background?.isTexture) texInfo(stage.scene.background, "background", { mapping: "screen-space (fills the frame, top->bottom)" });
  const labels = [];
  for (const [mat, owner] of allMaterials(stage.scene)) {
    const users = [];
    stage.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : [o.material]; if (ms.includes(mat)) users.push(ids.get(o)); });
    for (const slot of TEX_SLOTS) {
      const t = mat[slot];
      if (!t || !t.image) continue;
      texInfo(t, slot, { material: mat.name || mat.uuid.slice(0, 8), materialType: mat.type, usedBy: users.slice(0, 50), usedByCount: users.length, bumpScale: slot === "bumpMap" ? mat.bumpScale : undefined });
    }
    if (owner.userData?.setText && mat.map) {
      labels.push({
        id: ids.get(owner), lines: owner.userData.lines, file: byImage.get(mat.map.image), planeSizeMetres: [r6(owner.scale.x), r6(owner.scale.y)],
        lit: !mat.isMeshBasicMaterial, toneMapped: mat.toneMapped, alphaTest: mat.alphaTest, castShadow: owner.castShadow, onOverlay: !!stage.overlay && isUnder(owner, stage.overlay.scene),
      });
    }
  }
  return { textures, labels, files };
}
const isUnder = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };

/** Resolved materials (type + flags + values) keyed by name. */
export function materialReport(stage, ids) {
  const out = [];
  for (const [m] of allMaterials(stage.scene)) {
    const e = { name: m.name || m.uuid.slice(0, 8), type: m.type, side: m.side === THREE.DoubleSide ? "double" : m.side === THREE.BackSide ? "back" : "front", transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, depthWrite: m.depthWrite, depthTest: m.depthTest, toneMapped: m.toneMapped, vertexColors: m.vertexColors, flatShading: !!m.flatShading, blending: m.blending };
    if (m.color) e.color = hex(m.color);
    for (const k of ["roughness", "metalness", "emissiveIntensity", "envMapIntensity", "bumpScale", "clearcoat", "clearcoatRoughness", "transmission", "ior", "thickness", "sheen", "iridescence", "specularIntensity"]) if (m[k] !== undefined) e[k] = m[k];
    if (m.emissive) e.emissive = hex(m.emissive);
    if (m.onBeforeCompile && m.onBeforeCompile.toString().length > 30) e.customShader = "onBeforeCompile hook (approximate with the base PBR values)";
    out.push(e);
  }
  return out;
}

/**
 * bake(api, { fps, frames }) -> per-frame capture by calling api.renderAt(n / fps) for n = 0..frames-1.
 *   camera: dense arrays (matrixWorld column-major 16, fovDeg) — one per frame.
 *   nodes[id]: sparse keys [[frame, matrixWorld16]] (only when it changes) + vis [[frame, bool]].
 *   lights[id]: sparse [[frame, { intensity, color, position }]]. materials[name]: sparse [[frame, {...}]].
 *   post: sparse [[frame, {...}]]. deforming: ids whose vertex positions changed during the bake.
 */
export async function bake(api, ids, { fps = 30, frames }) {
  const { stage } = api;
  const nodes = {}, lights = {}, mats = {}, post = [];
  const cam = { matrixWorld: [], fovDeg: [], near: stage.camera.near, far: stage.camera.far };
  const last = new Map();
  const changed = (key, val) => { const s = JSON.stringify(val); if (last.get(key) === s) return false; last.set(key, s); return true; };
  const posVersion = new Map();
  const deforming = new Set();
  const gl = stage.renderer.getContext();
  for (let f = 0; f < frames; f++) {
    // yield + finish every 10 frames so the page and GPU process stay responsive during long bakes
    if (f % 10 === 0) { gl.finish(); await new Promise((r) => setTimeout(r, 0)); }
    api.renderAt(f / fps);
    stage.camera.updateMatrixWorld();
    cam.matrixWorld.push(stage.camera.matrixWorld.elements.map(r6));
    cam.fovDeg.push(r6(stage.camera.fov));
    stage.scene.traverse((o) => {
      if (o === stage.scene) return;
      const id = ids.get(o) ?? ids.set(o, `${o.name || o.type}@f${f}`).get(o);
      const m = o.matrixWorld.elements.map(r6);
      const n = (nodes[id] ??= { keys: [], vis: [] });
      if (changed(`m:${id}`, m)) n.keys.push([f, m]);
      const v = effVisible(o);
      if (changed(`v:${id}`, v)) n.vis.push([f, v]);
      if (o.isLight) {
        const L = { intensity: r6(o.intensity), color: hex(o.color) };
        if (changed(`l:${id}`, L)) (lights[id] ??= []).push([f, L]);
      }
      const pa = o.geometry?.attributes?.position;
      if (pa) {
        if (posVersion.has(o) && posVersion.get(o) !== pa.version) deforming.add(id);
        posVersion.set(o, pa.version);
      }
    });
    for (const [m] of allMaterials(stage.scene)) {
      const k = m.name || m.uuid.slice(0, 8);
      const val = { opacity: r6(m.opacity), visible: m.visible };
      if (m.emissive) { val.emissive = hex(m.emissive); val.emissiveIntensity = r6(m.emissiveIntensity); }
      if (m.color) val.color = hex(m.color);
      if (changed(`mat:${m.uuid}`, val)) (mats[k] ??= []).push([f, val]);
    }
    if (stage.post) {
      const P = stage.post.passes;
      const val = { bloom: P.bloom ? [P.bloom.strength, P.bloom.radius, P.bloom.threshold].map(r6) : null, tilt: P.tiltH ? [P.tiltH.uniforms.uFocus.value, P.tiltH.uniforms.uRange.value, P.tiltH.uniforms.uBlur.value].map(r6) : null, vignette: r6(P.finish.uniforms.uVignette.value), grain: r6(P.finish.uniforms.uGrain.value) };
      if (changed("post", val)) post.push([f, val]);
    }
  }
  return {
    format: "3d-style-atlas/bake@1", fps, frames, frameRule: "frame n <-> t = n / fps, n = 0 .. frames-1",
    space: "three.js world space (Y-up, metres); matrices column-major (THREE.Matrix4.elements); convert with C = Rx(+90deg)",
    camera: cam, nodes, lights, materials: mats, post, deforming: [...deforming],
  };
}

/** exportGLB(stage, ids) -> base64 GLB of the whole scene (nodes renamed to their bake ids, restored after). */
export async function exportGLB(stage, ids, { maxTextureSize = 2048 } = {}) {
  const saved = [];
  stage.scene.traverse((o) => { if (ids.has(o)) { saved.push([o, o.name]); o.name = ids.get(o); } });
  try {
    const buf = await new GLTFExporter().parseAsync(stage.scene, { binary: true, onlyVisible: false, maxTextureSize, trs: false });
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  } finally {
    for (const [o, n] of saved) o.name = n;
  }
}

/** Set up window.__atlasExport for the Node driver. */
export function install() {
  const api = window.__atlas;
  if (!api) throw new Error("export.js: window.__atlas missing (stage.mount not called?)");
  const ids = assignIds(api.stage.scene);
  const X = (window.__atlasExport = { api, ids, out: {} });
  X.static = () => {
    api.renderAt(0);
    const tex = textureReport(api.stage, ids);
    X.out.files = tex.files;
    return { renderer: rendererReport(api.stage), lights: lightReport(api.stage, ids), materials: materialReport(api.stage, ids), textures: tex.textures, labels: tex.labels, nodeCount: ids.size };
  };
  X.bake = async (fps, frames) => { X.out.bake = JSON.stringify(await bake(api, ids, { fps, frames })); return X.out.bake.length; };
  X.glb = async (t = 0) => { api.renderAt(t); X.out.glb = await exportGLB(api.stage, ids); return X.out.glb.length; };
  X.ref = (t) => { api.renderAt(t); X.out.ref = api.stage.canvas.toDataURL("image/png"); return X.out.ref.length; };
  X.chunk = (key, i, n) => X.out[key].slice(i, i + n);
  X.fileNames = () => Object.keys(X.out.files ?? {});
  X.file = (name) => { X.out.file = X.out.files[name]; return X.out.file.length; };
  return true;
}
