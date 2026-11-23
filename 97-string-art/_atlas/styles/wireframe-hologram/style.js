// styles/wireframe-hologram/style.js — "Wireframe Hologram": a volumetric display floating above a dark glossy
// projector table. Everything in the hologram is LIGHT: additive point clouds, pixel-exact screen-space edges
// (kit/lines.js, MAX-blended so dense webs never build up into a blob) and translucent faces with fresnel rims
// and upward-drifting scan bands. A post pass adds fine raster lines, seeded glitch slices and a radial
// chromatic fringe (all stateless). Props are synchronous and seeded; time enters only through
// userData.setMaterialise(u) / setLevel(k) / update(t) hooks the scene calls, plus style.update(t) once per frame.
import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { rng, hash01, clamp, lerp, smoothstep, TAU } from "../../kit/time.js";
import { flicker } from "../../kit/motion.js";
import { makeCanvas, canvasTexture, blobTexture } from "../../kit/textures.js";
import { getOverlay, projectToScreen } from "../../kit/overlay.js";
import { screenLines } from "../../kit/lines.js";
import { analyseEdges, chainEdges } from "../../kit/edges.js";
import { reflectiveSweep } from "../../kit/studio.js";
import { callout, hairline } from "../../kit/callouts.js";
import { glitchAt, phases, holoLevel } from "./holo.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };
export * as plan from "./holo.js";

// ======================================================================== shaders ======================
const FACE_VS = /* glsl */ `
uniform vec2 uYRange;
varying vec3 vW; varying vec3 vN; varying vec3 vV; varying float vLy; varying vec3 vIC;
void main() {
  vec4 lp = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
  lp = instanceMatrix * lp; n = mat3(instanceMatrix) * n;
  #endif
  vIC = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
  vIC = instanceColor;
  #endif
  vec4 wp = modelMatrix * lp;
  vW = wp.xyz;
  vLy = (lp.y - uYRange.x) / max(1e-4, uYRange.y - uYRange.x);
  vN = normalize(mat3(modelMatrix) * n);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const SCAN_GLSL = /* glsl */ `
uniform float uTime, uFlick, uScanSp, uScanW, uScanSpeed, uScanBoost, uReveal, uFrontSoft, uFrontGlow, uSpan;
uniform vec3 uFront;
float scanBand(float wy) {
  float b = fract((wy - uTime * uScanSpeed) / uScanSp);
  float d = min(b, 1.0 - b) * uScanSp;
  return 1.0 - smoothstep(0.0, uScanW, d);
}
float frontGlow(float ly) {
  if (uReveal >= 1.06) return 0.0;
  float d = max(0.0, (uReveal - ly) * uSpan);
  return exp(-d / uFrontSoft);
}`;
const FACE_FS = /* glsl */ `
uniform vec3 uColor; uniform vec3 uAccent; uniform float uMix, uLevel, uAlpha, uRim, uRimPow;
varying vec3 vW; varying vec3 vN; varying vec3 vV; varying float vLy; varying vec3 vIC;
${SCAN_GLSL}
void main() {
  if (vLy > uReveal) discard;
  float f = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), uRimPow);
  vec3 c = mix(uColor, uAccent, uMix) * vIC;
  float k = (uAlpha + uRim * f) * (1.0 + uScanBoost * scanBand(vW.y));
  vec3 col = c * k * uLevel * uFlick + uFront * frontGlow(vLy) * uFrontGlow * uLevel * 0.35;
  gl_FragColor = vec4(col, 1.0);
}`;
const PTS_VS = /* glsl */ `
attribute float aLevel; attribute float aSize; attribute vec3 aColor;
uniform vec2 uYRange; uniform float uHalfH, uMinPx;
varying vec3 vW; varying float vLy; varying vec3 vC; varying float vL; varying float vFade;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vLy = (position.y - uYRange.x) / max(1e-4, uYRange.y - uYRange.x);
  vec4 mv = viewMatrix * wp;
  float px = aSize * projectionMatrix[1][1] * uHalfH / max(0.05, -mv.z);
  gl_PointSize = max(px, uMinPx);
  vFade = clamp(px / uMinPx, 0.0, 1.0);
  vC = aColor; vL = aLevel;
  gl_Position = projectionMatrix * mv;
}`;
const PTS_FS = /* glsl */ `
uniform float uCore, uLevel;
varying vec3 vW; varying float vLy; varying vec3 vC; varying float vL; varying float vFade;
${SCAN_GLSL}
void main() {
  if (vLy > uReveal || vL <= 0.0) discard;
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float core = 1.0 - smoothstep(uCore * 0.55, uCore, r);
  float halo = pow(max(0.0, 1.0 - r), 2.4) * 0.45;
  float a = (core + halo) * vFade;
  vec3 col = vC * vL * a * uLevel * uFlick * (1.0 + uScanBoost * scanBand(vW.y)) + uFront * frontGlow(vLy) * uFrontGlow * a * uLevel;
  gl_FragColor = vec4(col, 1.0);
}`;
const BEAM_VS = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BEAM_FS = /* glsl */ `
uniform sampler2D tStreak; uniform vec3 uColor; uniform float uLevel, uEdge, uTime;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main() {
  float v = vUv.y;                                   // 0 at the emitter, 1 at the top
  float fall = pow(clamp(1.0 - v, 0.0, 1.0), 1.7) * smoothstep(0.0, 0.04, v);
  float f = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 1.4);
  float streak = texture2D(tStreak, vec2(vUv.x, 0.5)).r;
  float shimmer = 0.88 + 0.12 * sin(v * 26.0 - uTime * 2.3 + vUv.x * 6.2831853 * 3.0);
  float a = uLevel * fall * mix(1.0, f * 1.6, uEdge) * (0.45 + 0.9 * streak) * shimmer;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;
const DUST_VS = /* glsl */ `
attribute vec4 aSeed;  // angle, radius 0..1, y0 0..1, phase
uniform float uTime, uR, uH, uSpeed, uSwirl, uSize, uHalfH, uBase, uTop;
varying float vA;
void main() {
  float y = fract(aSeed.z + uTime * uSpeed * (0.6 + 0.8 * aSeed.w) / uH);
  float rr = mix(uBase, uTop, y) * sqrt(aSeed.y);
  float ang = aSeed.x + uTime * uSwirl * (aSeed.w - 0.5) * 2.0;
  vec3 p = vec3(cos(ang) * rr, y * uH, sin(ang) * rr);
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  gl_PointSize = max(1.5, uSize * projectionMatrix[1][1] * uHalfH / max(0.05, -mv.z));
  float tw = 0.55 + 0.45 * sin(uTime * (1.3 + 2.0 * aSeed.w) + aSeed.x * 7.0);
  vA = smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.6, 1.0, y)) * tw;
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FS = /* glsl */ `
uniform vec3 uColor; uniform float uLevel;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float a = pow(max(0.0, 1.0 - r), 2.0) * vA * uLevel;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;
const HOLO_PASS = {
  uniforms: {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1920, 1080) }, uTime: { value: 0 },
    uPeriod: { value: 4 }, uDepth: { value: 0.15 }, uDrift: { value: 9 }, uFringe: { value: 1.5 }, uChroma: { value: 2 },
    uB0: { value: new THREE.Vector4() }, uB1: { value: new THREE.Vector4() },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uPeriod, uDepth, uDrift, uFringe, uChroma;
uniform vec4 uB0, uB1; varying vec2 vUv;
void main() {
  vec2 uv = vUv; float ch = 0.0;
  if (uB0.w > 0.5 && abs(uv.y - uB0.x) < uB0.y * 0.5) { uv.x += uB0.z / uRes.x; ch = 1.0; }
  if (uB1.w > 0.5 && abs(uv.y - uB1.x) < uB1.y * 0.5) { uv.x += uB1.z / uRes.x; ch = 1.0; }
  vec2 d = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(d);
  vec2 dir = r > 1e-4 ? d / r : vec2(0.0);
  vec2 off = dir * (uFringe * (r / 0.9) * (r / 0.9)) / uRes + vec2(ch * uChroma / uRes.x, 0.0);
  vec4 c = texture2D(tDiffuse, uv);
  c.r = texture2D(tDiffuse, uv + off).r;
  c.b = texture2D(tDiffuse, uv - off).b;
  float lum = max(c.r, max(c.g, c.b));
  float line = 0.5 + 0.5 * sin((gl_FragCoord.y + uTime * uDrift) * 6.2831853 / uPeriod);
  c.rgb *= 1.0 - uDepth * line * smoothstep(0.03, 0.5, lum);
  gl_FragColor = c;
}`,
};

// ======================================================================== small helpers ================
const lin = (pal, c) => new THREE.Color(pal[c] ?? c);
const boxEdges = (cx, cy, cz, s) => {
  const h = s / 2, P = (x, y, z) => [cx + x * h, cy + y * h, cz + z * h];
  const out = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    out.push([P(-1, a, b), P(1, a, b)], [P(a, -1, b), P(a, 1, b)], [P(a, b, -1), P(a, b, 1)]);
  }
  return out;
};
const circlePoly = (r, n, { y = 0, plane = "xz", a0 = 0, a1 = TAU, c = [0, 0, 0] } = {}) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, u = Math.cos(a) * r, v = Math.sin(a) * r;
    out.push(plane === "xz" ? [c[0] + u, c[1] + y, c[2] + v] : [c[0] + u, c[1] + v, c[2] + y]);
  }
  return out;
};
/** normalised-height plotting windows: each polyline draws in from its lowest to its highest point. */
const heightWindows = (polys, y0, y1) => polys.map((p) => {
  const ys = p.map((q) => q[1]);
  const a = (Math.min(...ys) - y0) / Math.max(1e-4, y1 - y0), b = (Math.max(...ys) - y0) / Math.max(1e-4, y1 - y0);
  return [clamp(a, 0, 1), clamp(Math.max(b, a + 1e-4), 0, 1)];
});

// ======================================================================== createStyle =================
/**
 * createStyle(stage, opts?) -> style        (opts: { post = true })
 * props (3D): table, projector, beam, dust, holoMesh, pointGrid, nodeLayer, connectionWeb, hudRing, gizmo, barReadout, scanFront
 * props (overlay, exact colours): caption, readout, tag, leader
 * style.update(t, { power }) once per frame BEFORE style.render(t) (shared time, flicker, glitch slices, emitter light).
 * style.render(t) renders the table reflection then stage.render(t).
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const pal = spec.palette, HO = spec.holo, OVS = spec.overlay;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const halfH = stage.height / 2;

  // ---- shared uniforms (one object per uniform, referenced by every holo material) ----
  const U = { uTime: { value: 0 }, uFlick: { value: 1 } };
  const scanUniforms = () => ({
    uTime: U.uTime, uFlick: U.uFlick,
    uScanSp: { value: HO.scanSpacing }, uScanW: { value: HO.scanWidth }, uScanSpeed: { value: HO.scanSpeed }, uScanBoost: { value: HO.scanBoost },
    uReveal: { value: 2 }, uFrontSoft: { value: HO.frontSoft }, uFrontGlow: { value: HO.frontGlow }, uSpan: { value: 1 },
    uFront: { value: lin(pal, HO.frontColor) }, uYRange: { value: new THREE.Vector2(0, 1) },
  });
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

  function faceMaterial({ color = "holo", accent = "accent", alpha = HO.faceAlpha, rim = HO.rimStrength, level = 1 } = {}) {
    const m = new THREE.ShaderMaterial({
      vertexShader: FACE_VS, fragmentShader: FACE_FS, side: THREE.DoubleSide, ...additive,
      uniforms: { ...scanUniforms(), uColor: { value: lin(pal, color) }, uAccent: { value: lin(pal, accent) }, uMix: { value: 0 },
        uLevel: { value: level }, uAlpha: { value: alpha }, uRim: { value: rim }, uRimPow: { value: HO.rimPower } },
    });
    return m;
  }
  function pointsMaterial() {
    return new THREE.ShaderMaterial({
      vertexShader: PTS_VS, fragmentShader: PTS_FS, ...additive,
      uniforms: { ...scanUniforms(), uHalfH: { value: halfH }, uMinPx: { value: 1.6 }, uCore: { value: HO.pointCore }, uLevel: { value: 1 } },
    });
  }
  /** Points with per-point level/colour/size attributes. pts: [[x,y,z]]. */
  function holoPoints(pts, { size = HO.pointSize, color = "holo", level = HO.pointLevel } = {}) {
    const g = new THREE.BufferGeometry();
    const n = pts.length, P = new Float32Array(n * 3), L = new Float32Array(n), S = new Float32Array(n), C = new Float32Array(n * 3);
    const c = lin(pal, color);
    pts.forEach((p, i) => { P.set(p, i * 3); L[i] = level; S[i] = size; C.set([c.r, c.g, c.b], i * 3); });
    g.setAttribute("position", new THREE.BufferAttribute(P, 3));
    g.setAttribute("aLevel", new THREE.BufferAttribute(L, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(S, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(C, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.Points(g, pointsMaterial());
    m.frustumCulled = false;
    m.renderOrder = 3;
    m.userData.setPoint = (i, lvl, col, sz) => {
      L[i] = lvl;
      if (col) { const cc = col.isColor ? col : lin(pal, col); C[i * 3] = cc.r; C[i * 3 + 1] = cc.g; C[i * 3 + 2] = cc.b; }
      if (sz != null) S[i] = sz;
    };
    m.userData.sync = () => { for (const k of ["aLevel", "aSize", "aColor"]) g.attributes[k].needsUpdate = true; };
    return m;
  }

  // ---- line registry: every hologram line gets the global hum flicker on top of its own level ----
  const lineReg = [];
  function holoLines(polys, o = {}) {
    const col = o.color ?? "holo";
    const m = screenLines(stage, polys, { ...o, width: o.width ?? HO.edgeWidth, color: lin(pal, col), level: 1 }); // level via setOwn
    m.userData.own = o.level ?? HO.edgeLevel;
    m.userData.flick = o.flick ?? true;
    m.userData.setOwn = (k) => { m.userData.own = k; m.userData.setLevel(k * (m.userData.flick ? U.uFlick.value : 1)); return m; };
    m.userData.setColor = (c) => { const cc = c.isColor ? c : lin(pal, c); for (const mt of m.userData.materials) mt.uniforms.uColor.value.copy(cc); return m; };
    m.userData.setOwn(m.userData.own);
    lineReg.push(m);
    return m;
  }

  // ---- materialise plumbing shared by every hologram prop ----
  /** Attach reveal state to a prop: y range (local), points/faces materials, height-windowed lines, a scan front. */
  function revealable(group, { y0, y1, points = [], faces = [], lines = [], front = null }) {
    for (const m of [...points, ...faces]) { m.material.uniforms.uYRange.value.set(y0, y1); m.material.uniforms.uSpan.value = y1 - y0; }
    const front01 = (p) => lerp(-0.06, 1.08, p);
    group.userData.y0 = y0; group.userData.y1 = y1;
    group.userData.setMaterialise = (u) => {
      const ph = phases(clamp(u), spec.materialise);
      for (const m of points) { m.material.uniforms.uReveal.value = front01(ph.points); m.visible = ph.points > 0; }
      for (const m of faces) { m.material.uniforms.uReveal.value = front01(ph.faces); m.visible = ph.faces > 0; }
      for (const l of lines) l.userData.setProgress(clamp(front01(ph.edges)));
      if (front) {
        const on = ph.points > 0 && ph.points < 1;
        front.visible = on;
        if (on) { front.position.y = lerp(y0, y1, clamp(front01(ph.points))); front.userData.setOwn(HO.frontGlow * 0.8 * Math.sin(Math.PI * ph.points) ** 0.5); }
      }
      group.visible = u > 0;
      return group;
    };
    group.userData.setMaterialise(1);
    return group;
  }
  /** A glowing horizontal rectangle (w x d, centred) that rides the materialise front. */
  function scanFront(w, d, { color = "holoHot", cx = 0, cz = 0 } = {}) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const f = holoLines([[[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [x0, 0, z0]]], { color, width: 2.2, level: 2, order: "parallel", flick: false });
    f.renderOrder = 4;
    return f;
  }

  // ======================================================================== props =====================
  const props = {};

  /** table({ radius }) -> Mesh: dark glossy table top at y = 0 (blurred mirror) + additive glow pool. userData.setGlow(k). */
  props.table = (o = {}) => {
    const T = { ...spec.table, ...o };
    const sweep = reflectiveSweep(stage, materials.table, { strength: T.reflect, facing: T.facing, blur: T.blur, fade: T.fade, center: [0, 0] });
    const top = new THREE.Mesh(new THREE.CircleGeometry(T.radius, 96).rotateX(-Math.PI / 2), sweep.material);
    top.name = "table";
    top.receiveShadow = true;
    sweep.userData.hide.push(top);
    const glowMat = new THREE.MeshBasicMaterial({ map: blobTexture(), color: lin(pal, "holoDeep"), ...additive });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(T.glowRadius * 2, T.glowRadius * 2).rotateX(-Math.PI / 2), glowMat);
    glow.position.y = 0.004; glow.renderOrder = 1;
    top.add(glow);
    sweep.userData.hide.push(glow);
    const base = lin(pal, "holoDeep");
    top.userData.setGlow = (k) => { glowMat.color.copy(base).multiplyScalar(k * T.glow); glow.visible = k > 0.001; };
    top.userData.setGlow(1);
    top.userData.renderReflection = (renderer, scene, camera) => sweep.userData.renderReflection(renderer, scene, camera);
    top.userData.sweep = sweep;
    return top;
  };

  /** projector({ radius }) -> Group: bevelled metal housing, dark lens, glowing emitter ring + lens grooves. userData.setLevel(k). */
  props.projector = (o = {}) => {
    const P = { ...spec.projector, ...o };
    const g = new THREE.Group(); g.name = "projector";
    const R = P.radius, H = P.height, b = P.bevel;
    const prof = [[0.001, 0], [R, 0], [R, H - b], [R - b, H], [P.emitterRadius + 0.14, H], [P.emitterRadius + 0.1, H - 0.03], [0.001, H - 0.03]];
    const housing = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), P.segments), materials.housing);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(P.emitterRadius + 0.12, 0.022, 10, P.segments).rotateX(Math.PI / 2), materials.bezel);
    bezel.position.y = H;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(P.lensRadius, P.segments).rotateX(-Math.PI / 2), materials.lens);
    lens.position.y = H - 0.025;
    g.add(housing, bezel, lens);
    const ringMat = new THREE.MeshBasicMaterial({ color: lin(pal, "holo"), ...additive, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(P.emitterRadius - P.emitterWidth / 2, P.emitterRadius + P.emitterWidth / 2, P.segments).rotateX(-Math.PI / 2), ringMat);
    ring.position.y = H - 0.02; ring.renderOrder = 2;
    g.add(ring);
    // lens grooves + a tick crown on the housing top (thin light lines)
    const grooves = holoLines([0.35, 0.6, 0.85].map((r) => circlePoly(r * P.lensRadius, 96, { y: H - 0.02 })), { color: "holoDeep", width: 1.1, level: 0.9, order: "parallel" });
    const tk = [];
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU, r0 = R - 0.32, r1 = r0 + (i % 10 === 0 ? 0.16 : 0.07);
      tk.push([[Math.cos(a) * r0, H + 0.002, Math.sin(a) * r0], [Math.cos(a) * r1, H + 0.002, Math.sin(a) * r1]]);
    }
    const ticks = holoLines(tk, { color: "hud", width: 1.1, level: 0.55, order: "parallel" });
    g.add(grooves, ticks);
    const ringBase = lin(pal, "holo");
    g.userData.setLevel = (k) => {
      ringMat.color.copy(ringBase).multiplyScalar(P.ringLevel * k);
      ring.visible = k > 0.001;
      grooves.userData.setOwn(0.9 * k); ticks.userData.setOwn(0.55 * k);
      materials.lens.emissiveIntensity = (spec.materials.lens.emission?.strength ?? 0.25) * (0.3 + 0.7 * k) * 4;
    };
    g.userData.setLevel(1);
    g.userData.top = H;
    return g;
  };

  /** beam({ baseRadius, topRadius, height }) -> Mesh: faint additive light cone with seeded streaks. userData.setLevel(k). */
  props.beam = (o = {}) => {
    const B = { ...spec.beam, ...o };
    const r = rng(B.seed), N = 256, data = new Uint8Array(N * 4);
    const amp = Array.from({ length: B.streaks }, () => [r.range(0, TAU), r.range(0.2, 1), r.int(1, 24)]);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      let v = 0;
      for (const [ph, w, f] of amp) v += w * Math.max(0, Math.cos(a * f + ph)) ** 6;
      v = clamp(v / (B.streaks * 0.18));
      data.set([v * 255, v * 255, v * 255, 255], i * 4);
    }
    const tex = new THREE.DataTexture(data, N, 1);
    tex.wrapS = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    const geo = new THREE.CylinderGeometry(B.topRadius, B.baseRadius, B.height, 96, 24, true).translate(0, B.height / 2, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VS, fragmentShader: BEAM_FS, side: THREE.DoubleSide, ...additive,
      uniforms: { tStreak: { value: tex }, uColor: { value: lin(pal, "holoDeep") }, uLevel: { value: B.level }, uEdge: { value: B.edge }, uTime: U.uTime },
    });
    const m = new THREE.Mesh(geo, mat);
    m.name = "beam"; m.renderOrder = 1;
    m.userData.setLevel = (k) => { mat.uniforms.uLevel.value = B.level * k; m.visible = k > 0.001; };
    return m;
  };

  /** dust({ count, radius, height }) -> Points: motes drifting up through the beam (pure f(t) in the shader). setLevel(k). */
  props.dust = (o = {}) => {
    const D = { ...spec.dust, ...o }, B = spec.beam, r = rng(D.seed);
    const g = new THREE.BufferGeometry(), seed = new Float32Array(D.count * 4);
    for (let i = 0; i < D.count; i++) seed.set([r.range(0, TAU), r.next(), r.next(), r.next()], i * 4);
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(D.count * 3), 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: DUST_VS, fragmentShader: DUST_FS, ...additive,
      uniforms: { uTime: U.uTime, uR: { value: D.radius }, uH: { value: D.height }, uSpeed: { value: D.speed }, uSwirl: { value: D.swirl },
        uSize: { value: D.size }, uHalfH: { value: halfH }, uBase: { value: B.baseRadius * 1.1 }, uTop: { value: Math.min(D.radius, B.topRadius) },
        uColor: { value: lin(pal, "holo") }, uLevel: { value: D.level } },
    });
    const m = new THREE.Points(g, mat);
    m.frustumCulled = false; m.name = "dust"; m.renderOrder = 2;
    m.userData.setLevel = (k) => { mat.uniforms.uLevel.value = D.level * k; m.visible = k > 0.001; };
    return m;
  };

  /**
   * holoMesh(geometry, { color, featureDeg = 24, points = true, faces = true, edgeLevel, faceAlpha }) -> Group
   *   Any BufferGeometry as a hologram: welded vertices as a point cloud, feature edges as lines, faces as a
   *   translucent fresnel shell. userData.setMaterialise(u), setLevel(k), setAccent(m 0..1).
   */
  props.holoMesh = (geometry, o = {}) => {
    const g = new THREE.Group(); g.name = o.name ?? "holoMesh";
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox, y0 = bb.min.y, y1 = bb.max.y;
    const { verts, feature } = analyseEdges(geometry, o.featureDeg ?? 24);
    const chains = chainEdges(verts, feature);
    const lines = holoLines(chains, { color: o.color ?? "holo", level: o.edgeLevel ?? HO.edgeLevel, windows: heightWindows(chains, y0, y1) });
    const pts = o.points === false ? null : holoPoints(verts, { color: o.color ?? "holo", size: o.pointSize ?? HO.pointSize * 0.7 });
    const face = o.faces === false ? null : new THREE.Mesh(geometry, faceMaterial({ color: o.color ?? "holo", alpha: o.faceAlpha ?? HO.faceAlpha }));
    if (face) face.renderOrder = 1;
    const front = scanFront(bb.max.x - bb.min.x + 0.12, bb.max.z - bb.min.z + 0.12, { cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2 });
    g.add(lines, front, ...(pts ? [pts] : []), ...(face ? [face] : []));
    revealable(g, { y0, y1, points: pts ? [pts] : [], faces: face ? [face] : [], lines: [lines], front });
    const own = lines.userData.own, cBase = lin(pal, o.color ?? "holo"), cAcc = lin(pal, "accent"), tmp = new THREE.Color();
    g.userData.setLevel = (k) => {
      lines.userData.setOwn(own * k);
      if (pts) pts.material.uniforms.uLevel.value = k;
      if (face) face.material.uniforms.uLevel.value = k;
    };
    g.userData.setAccent = (m) => {
      lines.userData.setColor(tmp.copy(cBase).lerp(cAcc, m));
      if (face) face.material.uniforms.uMix.value = m;
      if (pts) { for (let i = 0; i < verts.length; i++) pts.userData.setPoint(i, HO.pointLevel, tmp); pts.userData.sync(); }
    };
    g.userData.parts = { lines, pts, face, front };
    return g;
  };

  /**
   * pointGrid({ cols = 12, rows = 12, pitch = .17, cube = .1, mask: [strings, '#' = lit] | (c, r) -> bool, dimLevel = .22 })
   *   -> Group: a flat XY panel of point-cubes (centred, facing +Z). Lit cells: bright cube edges + filled faces + hot
   *   point; dim cells: faint cube + point. userData.cells [{ c, r, p, lit }], setMaterialise(u), setLevel(k),
   *   setCell(i, boost 0..2, accent 0..1) + sync() for per-cell flashes, width/height.
   */
  props.pointGrid = (o = {}) => {
    const cols = o.cols ?? 12, rows = o.rows ?? 12, pitch = o.pitch ?? 0.17, cs = o.cube ?? 0.1, dim = o.dimLevel ?? 0.22;
    const isLit = typeof o.mask === "function" ? o.mask : (c, r) => (o.mask?.[r]?.[c] ?? ".") === "#";
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      cells.push({ c, r, p: [(c - (cols - 1) / 2) * pitch, ((rows - 1) / 2 - r) * pitch, 0], lit: !!isLit(c, r) });
    const g = new THREE.Group(); g.name = o.name ?? "pointGrid";
    const W = cols * pitch, Hh = rows * pitch, y0 = -Hh / 2, y1 = Hh / 2;
    const lit = cells.filter((x) => x.lit), un = cells.filter((x) => !x.lit);
    const litPolys = lit.flatMap((x) => boxEdges(...x.p, cs)), unPolys = un.flatMap((x) => boxEdges(...x.p, cs * 0.8));
    const litL = holoLines(litPolys, { width: 1.5, level: 1.5, windows: heightWindows(litPolys, y0, y1) });
    const unL = holoLines(unPolys, { width: 1.0, level: dim, color: "holoDeep", windows: heightWindows(unPolys, y0, y1) });
    const pts = holoPoints(cells.map((x) => x.p), { size: HO.pointSize * 0.8 });
    cells.forEach((x, i) => pts.userData.setPoint(i, x.lit ? HO.pointLevel * 1.3 : HO.pointLevel * 0.45, x.lit ? "holoHot" : "holo"));
    pts.userData.sync();
    const fm = faceMaterial({ alpha: 0.12, rim: 0.5 });
    const faces = new THREE.InstancedMesh(new THREE.BoxGeometry(cs, cs, cs), fm, Math.max(1, lit.length));
    const M = new THREE.Matrix4(), white = new THREE.Color(1, 1, 1);
    lit.forEach((x, i) => { M.makeTranslation(...x.p); faces.setMatrixAt(i, M); faces.setColorAt(i, white); });
    faces.count = lit.length; faces.renderOrder = 1; faces.frustumCulled = false;
    const front = scanFront(W + 0.1, cs + 0.16);
    g.add(unL, litL, pts, faces, front);
    revealable(g, { y0, y1, points: [pts], faces: [faces], lines: [litL, unL], front });
    const litIdx = new Map(lit.map((x, i) => [cells.indexOf(x), i]));
    const hot = lin(pal, "holoHot"), acc = lin(pal, "accent"), cyan = lin(pal, "holo"), tmp = new THREE.Color();
    g.userData.setLevel = (k) => {
      litL.userData.setOwn(1.5 * k); unL.userData.setOwn(dim * k);
      pts.material.uniforms.uLevel.value = k; fm.uniforms.uLevel.value = k;
    };
    g.userData.setCell = (i, boost = 0, accent = 0) => {
      const x = cells[i];
      tmp.copy(x.lit ? hot : cyan).lerp(acc, accent);
      pts.userData.setPoint(i, (x.lit ? HO.pointLevel * 1.3 : HO.pointLevel * 0.45) * (1 + boost), tmp);
      if (litIdx.has(i)) faces.setColorAt(litIdx.get(i), new THREE.Color(1, 1, 1).multiplyScalar(1 + boost * 1.5).lerp(acc, accent));
    };
    g.userData.sync = () => { pts.userData.sync(); if (faces.instanceColor) faces.instanceColor.needsUpdate = true; };
    Object.assign(g.userData, { cells, width: W, height: Hh, parts: { litL, unL, pts, faces, front } });
    return g;
  };

  /**
   * nodeLayer({ positions?: [[x,y,z]], cols, rows, pitch, nodeSize, octa = .07, frame = true, color })
   *   -> Group: a plane of glowing nodes (point + tiny wire octahedron each) with a thin corner-bracket frame.
   *   userData.nodes [[x,y,z]] (local), setNode(i, level 0..3, accent 0..1, size?) + sync(), setMaterialise(u),
   *   setLevel(k), marker(i) -> accent ring Lines around node i (scene sets its level via setOwn).
   */
  props.nodeLayer = (o = {}) => {
    let nodes = o.positions;
    if (!nodes) {
      const cols = o.cols ?? 4, rows = o.rows ?? 4, pitch = o.pitch ?? 0.4;
      nodes = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) nodes.push([(c - (cols - 1) / 2) * pitch, ((rows - 1) / 2 - r) * pitch, 0]);
    }
    const g = new THREE.Group(); g.name = o.name ?? "nodeLayer";
    const xs = nodes.map((p) => p[0]), ys = nodes.map((p) => p[1]);
    const pad = o.pad ?? 0.22, x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
    const oc = o.octa ?? 0.07, octPolys = [];
    for (const [x, y, z] of nodes) {
      const V = [[x + oc, y, z], [x, y + oc, z], [x - oc, y, z], [x, y - oc, z], [x, y, z + oc], [x, y, z - oc]];
      octPolys.push([V[0], V[1], V[2], V[3], V[0]], [V[1], V[4], V[3], V[5], V[1]], [V[0], V[4], V[2], V[5], V[0]]);
    }
    const oct = holoLines(octPolys, { width: 1.1, level: 0.9, windows: heightWindows(octPolys, y0, y1) });
    const bl = Math.min(0.28, (x1 - x0) * 0.2), fr = [];
    if (o.frame !== false) {
      for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) fr.push([[cx + sx * bl, cy, 0], [cx, cy, 0], [cx, cy + sy * bl, 0]]);
      fr.push([[x0 + bl * 1.4, y1, 0], [x1 - bl * 1.4, y1, 0]]);
    }
    const frame = holoLines(fr.length ? fr : [[[0, 0, 0]]], { color: "hud", width: 1.1, level: o.frame === false ? 0 : 0.6, windows: heightWindows(fr.length ? fr : [[[0, 0, 0]]], y0, y1) });
    const pts = holoPoints(nodes, { size: o.nodeSize ?? HO.pointSize * 1.6, color: o.color ?? "holo", level: HO.pointLevel });
    const front = scanFront(x1 - x0, 0.3);
    g.add(frame, oct, pts, front);
    revealable(g, { y0, y1, points: [pts], lines: [oct, frame], front });
    const cyan = lin(pal, o.color ?? "holo"), hot = lin(pal, "holoHot"), acc = lin(pal, "accent"), tmp = new THREE.Color();
    const sz = o.nodeSize ?? HO.pointSize * 1.6;
    g.userData.setNode = (i, level = 1, accent = 0, size = null) => {
      tmp.copy(cyan).lerp(hot, clamp(level - 1, 0, 1) * 0.7).lerp(acc, accent);
      pts.userData.setPoint(i, HO.pointLevel * level, tmp, size ?? sz * (0.85 + 0.25 * clamp(level - 1, 0, 1.5)));
    };
    g.userData.sync = () => pts.userData.sync();
    g.userData.setLevel = (k) => { oct.userData.setOwn(0.9 * k); frame.userData.setOwn((o.frame === false ? 0 : 0.6) * k); pts.material.uniforms.uLevel.value = k; };
    g.userData.marker = (i, r = 0.17) => {
      const [x, y, z] = nodes[i];
      const m = holoLines([circlePoly(r, 48, { plane: "xy", y: z, c: [x, y, 0] }), circlePoly(r * 1.45, 48, { plane: "xy", y: z, c: [x, y, 0], a0: 0.3, a1: 2.2 }), circlePoly(r * 1.45, 48, { plane: "xy", y: z, c: [x, y, 0], a0: 3.4, a1: 5.3 })],
        { color: "accent", width: 1.8, level: 0, order: "parallel" });
      g.add(m);
      return m;
    };
    Object.assign(g.userData, { nodes, bounds: { x0, x1, y0, y1 }, parts: { oct, frame, pts, front } });
    return g;
  };

  /**
   * connectionWeb(segs [[a, b]], { color = "holoDeep", level = .55, width = 1, pulse: { width, level, len, color, accent } })
   *   -> Group: faint straight connections (MAX-blended: crossings never brighten) + a "carried" layer for edges that
   *   have fired + travelling pulse dashes. userData.setMaterialise(u) draws the web on (seeded per-edge stagger),
   *   setPulses(t, list [{ i, u, accent }]) draws dash heads at u (0..1+) along edge i, setCarried(idx[], accentIdx[]).
   */
  props.connectionWeb = (segs, o = {}) => {
    const g = new THREE.Group(); g.name = o.name ?? "connectionWeb";
    const r = rng(o.seed ?? 5);
    const polys = segs.map(([a, b]) => [a, b]);
    const windows = polys.map(() => { const d = r.next() * 0.55; return [d, d + 0.45]; });
    const base = holoLines(polys, { color: o.color ?? "holoDeep", width: o.width ?? 1, level: o.level ?? 0.55, windows });
    const PU = { ...spec.pulse, color: "holoHot", accent: "accent", ...o.pulse };
    const cap = polys.length;
    const carried = holoLines(polys, { color: "holo", width: 1.2, level: spec.pulse.carried, capacity: cap, order: "parallel" });
    const carriedA = holoLines(polys, { color: "accent", width: 1.6, level: 1.1, capacity: cap, order: "parallel" });
    const pulses = holoLines(polys, { color: PU.color, width: PU.width, level: PU.level, capacity: cap, order: "parallel", flick: false });
    const pulsesA = holoLines(polys, { color: PU.accent, width: PU.width, level: PU.level, capacity: cap, order: "parallel", flick: false });
    for (const m of [carried, carriedA, pulses, pulsesA]) { m.userData.setPolys([]); m.renderOrder = 3; }
    g.add(base, carried, carriedA, pulses, pulsesA);
    const at = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
    g.userData.setMaterialise = (u) => { base.userData.setProgress(clamp(u)); g.visible = u > 0; return g; };
    g.userData.setLevel = (k) => base.userData.setOwn((o.level ?? 0.55) * k);
    g.userData.setPulses = (list) => {
      const A = [], B = [];
      for (const p of list) {
        const [a, b] = polys[p.i], h = clamp(p.u), tl = clamp(p.u - PU.len);
        if (h - tl < 1e-4) continue;
        (p.accent ? B : A).push([at(a, b, tl), at(a, b, h)]);
      }
      pulses.userData.setPolys(A); pulsesA.userData.setPolys(B);
      pulses.visible = A.length > 0; pulsesA.visible = B.length > 0;
    };
    g.userData.setCarried = (idx, accentIdx = []) => {
      carried.userData.setPolys(idx.map((i) => polys[i])); carriedA.userData.setPolys(accentIdx.map((i) => polys[i]));
      carried.visible = idx.length > 0; carriedA.visible = accentIdx.length > 0;
    };
    g.userData.setCarriedLevel = (k) => { carried.userData.setOwn(spec.pulse.carried * k); carriedA.userData.setOwn(1.1 * k); };
    g.userData.setMaterialise(1);
    Object.assign(g.userData, { polys, parts: { base, carried, carriedA, pulses, pulsesA } });
    return g;
  };

  /**
   * hudRing({ radius = 3, ticks = 72, major = 6, tickLen = .12, arcs = [[a0, a1, dr]], plane = "xz", rate = .1, color = "hud", level })
   *   -> Group of thin rings + tick marks; userData.update(t) spins it at `rate` rad/s, setProgress(p) draws it on,
   *   setLevel(k).
   */
  props.hudRing = (o = {}) => {
    const R = o.radius ?? 3, N = o.ticks ?? 72, maj = o.major ?? 6, tl = o.tickLen ?? 0.12, plane = o.plane ?? "xz";
    const g = new THREE.Group(); g.name = o.name ?? "hudRing";
    const P = (r, a) => (plane === "xz" ? [Math.cos(a) * r, 0, Math.sin(a) * r] : [Math.cos(a) * r, Math.sin(a) * r, 0]);
    const ringPolys = [circlePoly(R, 160, { plane })];
    for (const [a0, a1, dr] of o.arcs ?? []) ringPolys.push(circlePoly(R + dr, 64, { plane, a0, a1 }));
    const tickPolys = [];
    for (let i = 0; i < N; i++) { const a = (i / N) * TAU, L = i % maj === 0 ? tl * 2 : tl; tickPolys.push([P(R, a), P(R + L, a)]); }
    const lvl = o.level ?? spec.hud.level;
    const ring = holoLines(ringPolys, { color: o.color ?? "hud", width: o.width ?? spec.hud.width, level: lvl, order: "parallel" });
    const ticks = holoLines(tickPolys, { color: o.color ?? "hud", width: 1.0, level: lvl * spec.hud.tickLevel, order: "sequential", gap: 0 });
    g.add(ring, ticks);
    g.userData.update = (t) => { if (plane === "xz") g.rotation.y = (o.phase ?? 0) + (o.rate ?? 0.1) * t; else g.rotation.z = (o.phase ?? 0) + (o.rate ?? 0.1) * t; };
    g.userData.setProgress = (p) => { ring.userData.setProgress(p); ticks.userData.setProgress(p); g.visible = p > 0; };
    g.userData.setLevel = (k) => { ring.userData.setOwn(lvl * k); ticks.userData.setOwn(lvl * spec.hud.tickLevel * k); };
    return g;
  };

  /** gizmo({ size = .3 }) -> Group: axis tripod + wire cube + orbit circle; userData.update(t) tumbles it, setLevel(k). */
  props.gizmo = (o = {}) => {
    const s = o.size ?? 0.3, g = new THREE.Group(); g.name = "gizmo";
    const inner = new THREE.Group();
    const cube = holoLines(boxEdges(0, 0, 0, s * 0.7), { color: "hud", width: 1.1, level: 0.8, order: "parallel" });
    const axes = holoLines([[[0, 0, 0], [s, 0, 0]], [[0, 0, 0], [0, s, 0]], [[0, 0, 0], [0, 0, s]]], { color: "holo", width: 1.4, level: 1.3, order: "parallel" });
    const orbit = holoLines([circlePoly(s * 0.95, 64, { plane: "xz" })], { color: "hud", width: 1, level: 0.5 });
    inner.add(cube, axes); g.add(inner, orbit);
    g.userData.update = (t) => { inner.rotation.set(0.5 + 0.3 * Math.sin(t * 0.7), t * (o.rate ?? 0.8), 0.2); orbit.rotation.x = 0.35; };
    g.userData.setLevel = (k) => { cube.userData.setOwn(0.8 * k); axes.userData.setOwn(1.3 * k); orbit.userData.setOwn(0.5 * k); g.visible = k > 0.001; };
    return g;
  };

  /**
   * barReadout({ w = 1, h = .14, ticks = 10, color = "holo" }) -> Group (left-anchored at the origin, facing +Z):
   *   thin frame + tick row + translucent fill. userData.setValue(v 0..1), setLevel(k), setAccent(m).
   */
  props.barReadout = (o = {}) => {
    const w = o.w ?? 1, h = o.h ?? 0.14, n = o.ticks ?? 10;
    const g = new THREE.Group(); g.name = "barReadout";
    const fr = [[[0, -h / 2, 0], [w, -h / 2, 0], [w, h / 2, 0], [0, h / 2, 0], [0, -h / 2, 0]]];
    const tk = [];
    for (let i = 0; i <= n; i++) tk.push([[(w * i) / n, -h / 2 - 0.02, 0], [(w * i) / n, -h / 2 - (i % 5 === 0 ? 0.07 : 0.04), 0]]);
    const frame = holoLines(fr, { color: o.color ?? "holo", width: 1.2, level: 0.9, order: "parallel" });
    const ticks = holoLines(tk, { color: "hud", width: 1, level: 0.55, order: "parallel" });
    const fm = faceMaterial({ color: o.color ?? "holo", alpha: 0.55, rim: 0, level: 1 });
    fm.side = THREE.FrontSide;
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, h * 0.72).translate(0.5, 0, 0), fm);
    fill.position.x = 0.01; fill.renderOrder = 2;
    fm.uniforms.uYRange.value.set(-h, h);
    g.add(frame, ticks, fill);
    g.userData.setValue = (v) => { fill.scale.x = Math.max(1e-4, (w - 0.02) * clamp(v)); fill.visible = v > 0.002; };
    g.userData.setLevel = (k) => { frame.userData.setOwn(0.9 * k); ticks.userData.setOwn(0.55 * k); fm.uniforms.uLevel.value = k; g.visible = k > 0.001; };
    g.userData.setAccent = (m) => { fm.uniforms.uMix.value = m; frame.userData.setColor(lin(pal, o.color ?? "holo").lerp(lin(pal, "accent"), m)); };
    g.userData.setValue(0);
    return g;
  };

  props.scanFront = scanFront;
  props.points = holoPoints;
  props.lines = holoLines;

  // ======================================================================== overlay (exact colours) ===
  const ov = getOverlay(stage);
  const font = FONTS[spec.text.font] ?? spec.text.font;
  /** hudText(text, { height, color, weight, align }) -> overlay Mesh whose canvas holds `text` at full length;
   *  userData.draw(str) redraws only when str changes (pure: keyed by the string). place(x, y) in NDC. */
  function hudText(maxText, o = {}) {
    const fs = 96, padX = 14, weight = o.weight ?? spec.text.weight;
    const c = makeCanvas(8, 8), ctx = c.getContext("2d");
    ctx.font = `${weight} ${fs}px ${font}`;
    const W = Math.ceil(ctx.measureText(maxText + " ").width + padX * 2), Hc = Math.ceil(fs * 1.3);
    c.width = W; c.height = Hc;
    const tex = canvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, color: new THREE.Color(pal[o.color] ?? o.color ?? pal.text) });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    const hgt = o.height ?? OVS.labelHeight, sx = hgt * 2 * (W / Hc) * 1.0, sy = hgt * 2;
    mesh.scale.set(sx, sy, 1);
    mesh.renderOrder = 10;
    let cur = null;
    mesh.userData.draw = (s) => {
      if (s === cur) return;
      cur = s;
      ctx.clearRect(0, 0, W, Hc);
      ctx.font = `${weight} ${fs}px ${font}`;
      ctx.textBaseline = "middle"; ctx.fillStyle = "#ffffff";
      const al = o.align ?? "left";
      ctx.textAlign = al;
      ctx.fillText(s, al === "left" ? padX : al === "right" ? W - padX : W / 2, Hc * 0.54);
      tex.needsUpdate = true;
    };
    // (x, y) = NDC of the text's left / right / centre edge at mid-height
    mesh.userData.place = (x, y) => {
      const al = o.align ?? "left", X = x * ov.aspect;
      mesh.position.set(al === "left" ? X + sx / 2 - (padX / Hc) * sy : al === "right" ? X - sx / 2 + (padX / Hc) * sy : X, y, 0);
    };
    mesh.userData.w = sx; mesh.userData.h = sy;
    mesh.userData.draw(o.initial ?? "");
    ov.add(mesh);
    return mesh;
  }
  const typed = (txt, t, on, rate = OVS.typeRate) => {
    const n = Math.floor((t - on) * rate);
    if (n >= txt.length) return txt;
    return txt.slice(0, Math.max(0, n)) + (Math.floor(t * 12) % 2 ? "█" : "▌");
  };
  const fadeIO = (t, on, off, inD = 0.12, outD = 0.3) => smoothstep(on, on + inD, t) * (Number.isFinite(off) ? 1 - smoothstep(off - outD, off, t) : 1);

  /**
   * caption(stage-fixed, { x = -.86, y = .8, maxText }) -> Group: the scene's one caption area. A tick-bracket,
   *   a typed title (+ blinking cursor while typing), a dim sub line and a hairline.
   *   userData.update(t, items [{ text, sub, on, off, size = 1 }]).
   */
  props.caption = (o = {}) => {
    const g = new THREE.Group();
    const x = o.x ?? -0.86, y = o.y ?? 0.8;
    const maxT = o.maxText ?? "NEURAL NETWORK · FORWARD PASS", big = o.bigScale ?? 1.25;
    const title = hudText(maxT + "█", { height: OVS.captionHeight, color: "text" });
    const titleBig = hudText(maxT + "█", { height: OVS.captionHeight * big, color: "text" });
    const sub = hudText("X".repeat(48), { height: OVS.subHeight, color: "textDim", weight: 500 });
    const bar = hairline(pal.holo), rule = hairline(pal.hud), tick = hairline(pal.accent);
    g.add(title, titleBig, sub, bar, rule, tick);
    ov.add(g); // after the children exist: exactColours() then covers the hairlines too
    const PXu = 2 / stage.height;
    g.userData.update = (t, items) => {
      const it = items.find((i) => t >= i.on && t < (i.off ?? Infinity));
      g.visible = !!it;
      if (!it) return;
      const a = fadeIO(t, it.on, it.off ?? Infinity);
      const T = it.size && it.size > 1 ? titleBig : title, other = T === title ? titleBig : title;
      other.visible = false; T.visible = true;
      T.userData.draw(typed(it.text, t, it.on));
      T.userData.place(x, y); T.material.opacity = a;
      const X = x * ov.aspect, th = T.userData.h;
      const ruleW = smoothstep(it.on, it.on + 0.5, t) * T.userData.w * Math.min(1, (it.text.length + 1.5) / (maxT.length + 2));
      rule.userData.set([X, y - th * 0.52], [X + ruleW, y - th * 0.52], OVS.lineWidthPx, a * 0.8);
      bar.userData.set([X - 16 * PXu, y + th * 0.36], [X - 16 * PXu, y - th * 0.36], 3, a);
      tick.userData.set([X, y - th * 0.52], [X + 40 * PXu, y - th * 0.52], 3, a);
      sub.visible = !!it.sub;
      if (it.sub) {
        sub.userData.draw(typed(it.sub, t, it.on + 0.25, OVS.typeRate * 1.4));
        sub.userData.place(x, y - th * 0.52 - OVS.subHeight * 1.25);
        sub.material.opacity = a * smoothstep(it.on + 0.2, it.on + 0.35, t);
      }
    };
    g.visible = false;
    return g;
  };

  /** readout({ x, y, align = "right", height, maxText, color }) -> overlay text; userData.update(t, str, { on, off }). */
  props.readout = (o = {}) => {
    const m = hudText(o.maxText ?? "X".repeat(36), { height: o.height ?? OVS.readoutHeight, color: o.color ?? "textDim", align: o.align ?? "right", weight: o.weight ?? 500 });
    m.userData.update = (t, str, { on = 0, off = Infinity } = {}) => {
      const a = fadeIO(t, on, off);
      m.visible = a > 0.001;
      if (!m.visible) return;
      m.userData.draw(str); m.userData.place(o.x ?? 0.86, o.y ?? 0.82); m.material.opacity = a;
    };
    m.visible = false;
    return m;
  };

  /** tag(text, { height, color, align = "left" }) -> overlay text pinned to a 3D point;
   *  userData.update(t, { world:[x,y,z], on, off, dx = 0, dy = 0 (NDC), color? }). */
  props.tag = (text, o = {}) => {
    const m = hudText(text, { height: o.height ?? OVS.labelHeight, color: o.color ?? "text", align: o.align ?? "left", weight: o.weight ?? 700 });
    m.userData.draw(text);
    const cols = { base: new THREE.Color(pal[o.color] ?? o.color ?? pal.text) };
    m.userData.update = (t, { world, on = 0, off = Infinity, dx = 0, dy = 0, color = null, alpha = 1 }) => {
      const a = fadeIO(t, on, off, 0.25, 0.3) * alpha;
      m.visible = a > 0.001;
      if (!m.visible) return;
      const p = projectToScreen(stage, world);
      m.userData.place(p.x + dx, p.y + dy);
      m.material.opacity = a;
      m.material.color.copy(color ? new THREE.Color(pal[color] ?? color) : cols.base);
    };
    m.visible = false;
    return m;
  };

  /** leader(text, { dir, knee, run, sub }) -> kit callout in the hologram look (mono, cyan hairline, amber dot). */
  const LEADER_LOOK = { font: spec.text.font, labelWeight: 700, labelTracking: 0.08, labelHeight: OVS.labelHeight * 0.9, subHeight: OVS.subHeight * 0.85,
    lineWidthPx: OVS.lineWidthPx, dotPx: 4, ringPx: 10, lineColor: pal.hud, labelColor: pal.text, subColor: pal.textDim, dotColor: pal.accent,
    drawDur: 0.4, fadeDur: 0.3, outDur: 0.35, rise: 0.008 };
  props.leader = (text, o = {}) => callout(stage, text, { ...o, look: { ...LEADER_LOOK, ...o.look } });

  // ======================================================================== post: holo pass ===========
  let holoPass = null;
  if (post) {
    holoPass = new ShaderPass(HOLO_PASS);
    const u = holoPass.uniforms;
    u.uRes.value.set(stage.width, stage.height);
    u.uPeriod.value = spec.raster.period; u.uDepth.value = spec.raster.depth; u.uDrift.value = spec.raster.drift;
    u.uFringe.value = spec.fringe.amount; u.uChroma.value = spec.glitch.chroma;
    post.insertBefore(holoPass, "output", "holo"); // kit post hook (same insertion point as before)
  }

  // ======================================================================== per-frame =================
  const glitchSpec = { ...spec.glitch, forced: opts.forcedGlitches ?? [] };
  const emitterBase = lights.emitter?.intensity ?? 0;
  let tableRef = null;
  /**
   * update(t, { power = 1, glitch = true }) — shared time + hum flicker for every hologram material and line,
   *   glitch slices + raster in the post pass, emitter light level. Call once per frame before render.
   */
  function update(t, { power = 1, glitch = true } = {}) {
    U.uTime.value = t;
    const f = holoLevel(t, spec.flicker) * power;
    U.uFlick.value = f;
    for (const m of lineReg) m.userData.setLevel(m.userData.own * (m.userData.flick ? f : 1));
    if (lights.emitter) lights.emitter.intensity = emitterBase * power;
    if (holoPass) {
      const u = holoPass.uniforms;
      u.uTime.value = t;
      const gl = glitch ? glitchAt(t, glitchSpec) : { on: false, bands: [] };
      [u.uB0, u.uB1].forEach((b, k) => { const s = gl.bands[k]; s ? b.value.set(s.y, s.h, s.dx, 1) : b.value.set(0, 0, 0, 0); });
    }
  }
  /** power(t, onTime, seed) -> projector switch-on level (kit flicker with this style's power stutter). */
  const powerLevel = (t, on, seed = 3) => flicker(t, on, seed, { ...spec.flicker.power, hum: 0, fps: spec.flicker.fps });
  function render(t) {
    if (tableRef) tableRef.userData.renderReflection(stage.renderer, stage.scene, stage.camera);
    stage.render(t);
  }
  const _table = props.table;
  props.table = (o) => (tableRef = _table(o));

  const factories = {
    table: (s) => props.table(s.dims ?? {}),
    projector: (s) => props.projector(s.dims ?? {}),
    beam: (s) => props.beam(s.dims ?? {}),
    dust: (s) => props.dust(s.dims ?? {}),
    hudRing: (s) => props.hudRing(s.dims ?? {}),
    gizmo: (s) => props.gizmo(s.dims ?? {}),
    pointGrid: (s) => props.pointGrid(s.dims ?? {}),
    nodeLayer: (s) => props.nodeLayer(s.dims ?? {}),
    barReadout: (s) => props.barReadout(s.dims ?? {}),
  };

  return {
    spec, palette: pal, materials, lights, post, textStyle, camera: spec.camera,
    props, factories, sfx: spec.sfx,
    update, render, powerLevel,
    helpers: { glitchAt: (t) => glitchAt(t, glitchSpec), typed, fadeIO, uniforms: U, hudText },
  };
}
