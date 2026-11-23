// studio.js — product-shot studio kit. Promoted from the studio-product pilot (same code; style-specific
// defaults moved into explicit options).
//  * studioEnvironment(stage, S, { lights }) — PROCEDURAL studio env map: emissive softboxes / strips / gradient
//    cards in a black box -> PMREM (synchronous, memoised by level/sweep inputs, deterministic in any seek order).
//    S = { room: { w, h, d, color }, panels: [{ kind: "softbox"|"strip"|"card", pos, size, color, intensity, soft,
//    gradient, radial }], sweep: { size, color, intensity, radius, from, to, soft }, sweepLight?, quantum, sigma, size }
//    (see styles/studio-product/spec.js `studio` for a complete working example).
//  * reflectiveSweep(stage, material, opts) — cyclorama whose floor is a BLURRED MIRROR (mirrored-camera pass
//    into a half-res HDR target, 12-tap rotated Poisson blur, Fresnel, radial fade). Call
//    floor.userData.renderReflection(renderer, scene, camera) every frame BEFORE stage.render.
//  * depthOfField(stage, { aperture, maxblur, focus, relativeAperture }) -> { pass, setFocus(distance) } — BokehPass after the render pass
//    (pass 7: auto-focus on the rig target until setFocus is called; see the note above depthOfField).
import * as THREE from "three";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { createCyclorama } from "./builders.js";
import { softRectTexture, gradientTexture } from "./textures.js";
import { lerp } from "./time.js";

const col = (c) => new THREE.Color(c);

/**
 * studioEnvironment(stage, S = spec.studio, { lights }) -> studio
 *   Builds a small black "room" with emissive softboxes / strips / gradient cards (spec.studio.panels) and a
 *   travelling sweep strip, renders it to a PMREM (synchronously) and sets scene.environment.
 *   studio.set({ level = 1, sweepU = 0, sweepLevel = 0, yaw = 0, rotation = 0 })
 *     level      0..1 scales every static panel AND the spec's direct lights (0 = black stage)
 *     sweepU     0..1 position of the sweep strip on its arc (back horizon → overhead → front)
 *     sweepLevel 0..1 sweep strip brightness (also drives a matching directional "sweepLight")
 *     rotation   rad: scene.environmentRotation.y (cheap, no re-bake)
 *   Re-bakes the PMREM only when level/sweep change by more than spec.studio.quantum (memo keyed by inputs:
 *   deterministic in any seek order). studio.bakes counts re-bakes.
 */
export function studioEnvironment(stage, S, { lights = {} } = {}) {
  const { renderer, scene } = stage;
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(S.room.w, S.room.h, S.room.d), new THREE.MeshBasicMaterial({ color: S.room.color, side: THREE.BackSide }));
  env.add(room);
  const panels = [];
  const softCache = new Map();
  const softTex = (s) => {
    const k = Math.round(s * 100);
    if (!softCache.has(k)) softCache.set(k, softRectTexture({ soft: s, radius: 0.12, size: 128 }));
    return softCache.get(k);
  };
  const makePanel = (p) => {
    let map;
    if (p.kind === "card") map = gradientTexture({ size: 256, stops: p.gradient, type: p.radial ? "radial" : "linear", angle: 90 });
    else map = softTex(p.soft ?? 0.25);
    const m = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.size[0], p.size[1]), m);
    mesh.userData.base = col(p.color ?? "#ffffff").multiplyScalar(p.intensity ?? 1);
    return mesh;
  };
  for (const p of S.panels) {
    const mesh = makePanel(p);
    mesh.position.set(...p.pos);
    // face the hero; vertical strips stay vertical (look at the origin at their own height)
    if (p.kind === "strip" && p.size[1] > p.size[0]) mesh.lookAt(0, p.pos[1], 0);
    else mesh.lookAt(0, 0, 0);
    env.add(mesh);
    panels.push(mesh);
  }
  const SW = S.sweep;
  const strip = makePanel({ kind: "strip", ...SW });
  env.add(strip);

  const sweepLight = new THREE.DirectionalLight(S.sweepLight?.color ?? "#ffffff", 0);
  scene.add(sweepLight, sweepLight.target);
  const lightBase = Object.entries(lights).filter(([k, l]) => l?.isLight).map(([k, l]) => [l, l.intensity]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  let rt = null, last = null;
  const q = S.quantum ?? 0.0015;
  const stripPos = (u, yaw) => {
    const a = lerp(SW.from, SW.to, u);
    return new THREE.Vector3(0, Math.sin(a) * SW.radius, -Math.cos(a) * SW.radius).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  };
  const studio = {
    scene: env,
    panels,
    strip,
    sweepLight,
    bakes: 0,
    get texture() { return rt?.texture ?? null; },
    set({ level = 1, sweepU = 0, sweepLevel = 0, yaw = 0, rotation = 0 } = {}) {
      const key = [level, sweepU, sweepLevel, yaw].map((v) => Math.round(v / q));
      for (const [l, b] of lightBase) l.intensity = b * level;
      const sp = stripPos(sweepU, yaw);
      sweepLight.position.copy(sp);
      sweepLight.intensity = (S.sweepLight?.intensity ?? 1) * sweepLevel;
      scene.environmentRotation.set(0, rotation, 0);
      if (last && key.every((v, i) => v === last[i])) return studio;
      last = key;
      const kq = key[0] * q, sl = key[2] * q;
      for (const p of panels) p.material.color.copy(p.userData.base).multiplyScalar(kq);
      strip.position.copy(stripPos(key[1] * q, key[3] * q));
      strip.lookAt(0, 0, 0);
      strip.material.color.copy(strip.userData.base).multiplyScalar(sl);
      strip.visible = sl > 0;
      const next = pmrem.fromScene(env, S.sigma ?? 0, 0.1, 100, { size: S.size ?? 256 });
      if (rt) rt.dispose();
      rt = next;
      scene.environment = rt.texture;
      studio.bakes++;
      return studio;
    },
  };
  studio.set({ level: 1 });
  return studio;
}

const POISSON = [
  [-0.326, -0.406], [-0.84, -0.074], [-0.696, 0.457], [-0.203, 0.621], [0.962, -0.195], [0.473, -0.48],
  [0.519, 0.767], [0.185, -0.893], [0.507, 0.064], [0.896, 0.412], [-0.322, -0.933], [-0.792, -0.598],
];
/**
 * reflectiveSweep({ width, depth, height, radius, material, center:[x,z] }) -> Mesh (kit cyclorama) whose
 *   floor is a BLURRED MIRROR: userData.renderReflection(renderer, scene, camera) renders the scene from the
 *   camera mirrored in y = 0 into a half-res HDR target (call it every frame before stage.render; style.render
 *   does). The floor shader adds that image with a 12-tap blur, Fresnel and a radial fade around `center`.
 *   userData.uniforms: uStrength, uFacing, uBlur, uFade, uCenter. userData.hide: extra objects hidden in the pass.
 */
export const REFLECTIVE_FLOOR_DEFAULTS = { resolution: 0.5, strength: 0.5, facing: 0.22, blur: 4.5, fade: [1.4, 5.5], envIntensity: 0.12, specular: 0.25, sweep: { width: 40, depth: 20, height: 14, radius: 5 } };
export function reflectiveSweep(stage, material, o = {}) {
  const F = { ...REFLECTIVE_FLOOR_DEFAULTS, ...o };
  const mat = material.clone();
  mat.envMapIntensity = F.envIntensity ?? 0.25;
  if (mat.isMeshPhysicalMaterial) mat.specularIntensity = F.specular ?? 0.25;
  const W = Math.round(stage.width * F.resolution), H = Math.round(stage.height * F.resolution);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 0 });
  const uniforms = {
    tReflect: { value: rt.texture }, uTexMat: { value: new THREE.Matrix4() },
    uStrength: { value: F.strength }, uFacing: { value: F.facing }, uBlur: { value: F.blur },
    uRes: { value: new THREE.Vector2(W, H) }, uFade: { value: new THREE.Vector2(...F.fade) }, uCenter: { value: new THREE.Vector2(...(o.center ?? [0, 0])) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform mat4 uTexMat; varying vec3 vReflW; varying vec4 vReflUv;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvReflW = (modelMatrix * vec4(transformed, 1.0)).xyz; vReflUv = uTexMat * vec4(vReflW, 1.0);");
    const taps = POISSON.map(([x, y]) => `vec2(${x}, ${y})`).join(",");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
uniform sampler2D tReflect; uniform float uStrength, uFacing, uBlur; uniform vec2 uRes, uFade, uCenter;
varying vec3 vReflW; varying vec4 vReflUv;
const vec2 SP_TAPS[12] = vec2[12](${taps});`)
      .replace("#include <opaque_fragment>", `{
  vec2 ruv = vReflUv.xy / vReflUv.w;
  float dist = length(vReflW.xz - uCenter);
  float rad = uBlur * (1.0 + 0.6 * dist);
  vec3 refl = vec3(0.0);
  // per-pixel rotated taps: a bright point blurs to soft noise (hidden by grain), not a 12-dot stamp
  float ang = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  mat2 rot = mat2(cos(ang), sin(ang), -sin(ang), cos(ang));
  for (int k = 0; k < 12; k++) refl += texture2D(tReflect, ruv + rot * SP_TAPS[k] * rad / uRes).rgb;
  refl /= 12.0;
  vec3 Vw = normalize(cameraPosition - vReflW);
  float fres = mix(uFacing, uStrength, pow(1.0 - clamp(Vw.y, 0.0, 1.0), 2.0));
  float fade = 1.0 - smoothstep(uFade.x, uFade.y, dist);
  float onFloor = 1.0 - smoothstep(0.01, 0.35, vReflW.y);
  outgoingLight += refl * fres * fade * onFloor;
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => "studio-product-reflective-floor"; // same key as the style: identical program
  const mesh = createCyclorama({ ...F.sweep, ...o, material: mat });
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const virt = new THREE.PerspectiveCamera();
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const dir = new THREE.Vector3(), up = new THREE.Vector3(), p = new THREE.Vector3();
  mesh.userData = {
    ...mesh.userData,
    uniforms,
    target: rt,
    hide: [],
    renderReflection(renderer, scene, camera) {
      camera.updateMatrixWorld();
      p.setFromMatrixPosition(camera.matrixWorld);
      if (p.y <= 0.001) return;
      camera.getWorldDirection(dir);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      virt.position.set(p.x, -p.y, p.z);
      virt.up.set(up.x, -up.y, up.z);
      virt.lookAt(p.x + dir.x, -p.y - dir.y, p.z + dir.z);
      virt.near = camera.near; virt.far = camera.far;
      virt.updateMatrixWorld();
      virt.projectionMatrix.copy(camera.projectionMatrix);
      virt.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      uniforms.uTexMat.value.copy(bias).multiply(virt.projectionMatrix).multiply(virt.matrixWorldInverse);
      const hidden = [mesh, ...mesh.userData.hide].filter((h) => h.visible);
      hidden.forEach((h) => (h.visible = false));
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, virt);
      renderer.setRenderTarget(prev);
      hidden.forEach((h) => (h.visible = true));
    },
  };
  return mesh;
}

/**
 * depthOfField(stage, { aperture, maxblur, exclude }) -> { pass, setFocus(distance) } — BokehPass after the render pass.
 * Its depth PRE-PASS re-draws the scene with a depth material override, which would also draw things that write no
 * depth in the real render (screenLines' instanced ribbon quads, additive beams/glows, decals, contact shadows,
 * lines/points/sprites) as solid depth and blur the wrong pixels. They are hidden for the pre-pass:
 * any object with userData.noDepth, isLine/isPoints/isSprite, or whose material(s) all have depthWrite === false.
 * exclude(obj) -> bool adds your own rule (e.g. (o) => o.material?.transparent).
 * legacyPrepass: true keeps the pre-2026-11-13 behaviour (everything drawn into the depth pre-pass). No style uses it
 * any more (studio-product and toy-brick dropped it after a look review: the difference is sub-pixel rims only).
 */
export const skipsDepth = (ob) => {
  if (ob.userData?.noDepth || ob.isLine || ob.isPoints || ob.isSprite) return true;
  const ms = Array.isArray(ob.material) ? ob.material : ob.material ? [ob.material] : null;
  return !!ms && ms.length > 0 && ms.every((m) => m.depthWrite === false);
};
/*
 * Pass 7 — scene scale. BokehShader blurs by clamp(aperture × (focus − depth), ±maxblur) with focus and depth in METRES
 * along the view axis. The pass used to start at a fixed focus of 5 m, which only suits ~5 m sets: a ~1 m set whose style
 * never calls setFocus (mixing-console) sits 3.9 m in front of the focal plane, every pixel clamps at maxblur, and the
 * whole frame blurs uniformly. Fix (no change for scenes that call setFocus — the five DoF demos do, every frame):
 *   - until setFocus() is first called, the focus FOLLOWS the camera rig's current target every frame
 *     (camera.userData.rigTarget, written by camera.js rig.update) instead of sitting at 5 m. Without a rig target it
 *     falls back to 5 m and warns once when that is far from the set.
 *   - o.focus: a number = the old fixed focal distance (no auto-focus); "target" = always follow the rig target, even
 *     after setFocus (setFocus then only changes aperture/maxblur).
 *   - o.relativeAperture: scale-free strength. aperture = relativeAperture / focus every frame, so the blur depends on
 *     depth RELATIVE to the focal distance (focus − depth) / focus: the same number looks alike at 1 m and 10 m.
 *     Typical 0.004–0.01. Ignored unless given (the absolute `aperture` stays the default).
 */
export function depthOfField(stage, o = {}) {
  const D = { aperture: 0.0011, maxblur: 0.0045, ...o };
  const post = stage.post;
  if (!post) return { pass: null, setFocus() {} };
  const fixed = typeof D.focus === "number";
  const pass = new BokehPass(stage.scene, stage.camera, { focus: fixed ? D.focus : 5, aperture: D.aperture, maxblur: D.maxblur });
  let manual = fixed; // true once the focus is owned by the caller (setFocus or a numeric o.focus): old behaviour exactly
  let warned = false;
  const autoFocus = () => {
    const cam = stage.camera, tg = cam.userData?.rigTarget;
    pass.camera = cam;
    if (tg) {
      cam.updateWorldMatrix(true, false);
      const e = cam.matrixWorld.elements; // view axis = -Z column
      const d = -((tg.x - e[12]) * e[8] + (tg.y - e[13]) * e[9] + (tg.z - e[14]) * e[10]);
      if (d > 0 && Number.isFinite(d)) pass.uniforms.focus.value = d;
    } else if (!warned) {
      warned = true;
      console.warn("[atlas] depthOfField: no setFocus() and no camera-rig target — focus stays at 5 m; call dof.setFocus(distance) every frame for small sets");
    }
    if (D.relativeAperture != null) pass.uniforms.aperture.value = D.relativeAperture / Math.max(1e-3, pass.uniforms.focus.value);
  };
  const render = pass.render.bind(pass);
  const withFocus = (...args) => {
    if (!manual || D.focus === "target") autoFocus();
    else if (D.relativeAperture != null) pass.uniforms.aperture.value = D.relativeAperture / Math.max(1e-3, pass.uniforms.focus.value);
    return render(...args);
  };
  pass.render = withFocus;
  if (!D.legacyPrepass) pass.render = (...args) => {
    const hidden = [];
    stage.scene.traverseVisible((ob) => { if (ob !== stage.scene && (skipsDepth(ob) || D.exclude?.(ob))) hidden.push(ob); });
    for (const h of hidden) h.visible = false;
    withFocus(...args);
    for (const h of hidden) h.visible = true;
  };
  post.composer.insertPass(pass, 1);
  post.passes.dof = pass;
  return {
    pass,
    setFocus(dist, { aperture, maxblur } = {}) {
      manual = true;
      pass.camera = stage.camera;
      if (D.focus !== "target") pass.uniforms.focus.value = dist;
      if (aperture != null) pass.uniforms.aperture.value = aperture;
      if (maxblur != null) pass.uniforms.maxblur.value = maxblur;
    },
  };
}

