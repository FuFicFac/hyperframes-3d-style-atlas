// lines.js — screen-space line ribbons with exact PIXEL widths, analytic anti-aliasing, round caps,
// draw-on progress, dash/dot patterns (in metres along the line) and optional hidden-line passes.
// Promoted from the blueprint-build pilot (identical shader). Lines blend with MAX by default (light ink on
// dark paper never doubles at joins); pass blending: "normal" for dark ink on light grounds.
//   const l = screenLines(stage, [[[0,0,0],[1,0,0],[1,1,0]]], { width: 3, color: "#fff" });
//   scene.add(l); l.userData.setProgress(tl.p("draw", t));   // 0..1 plots the polylines on
import * as THREE from "three";
import { clamp } from "./time.js";
import { pathLength, pointAt, vec3 } from "./pathmath.js";

const { sub, len } = vec3;

// ======================================================================== line shader ==================
const LINE_VS = /* glsl */ `
attribute vec3 iA; attribute vec3 iB; attribute vec2 iU; attribute vec2 iS;
uniform vec2 uRes; uniform float uWidth; uniform float uBias;
varying vec2 vP; varying vec2 vA; varying vec2 vB; varying vec2 vU; varying vec2 vS;
void main() {
  vec4 a = modelViewMatrix * vec4(iA, 1.0);
  vec4 b = modelViewMatrix * vec4(iB, 1.0);
  if (uBias != 0.0) {
    if (projectionMatrix[2][3] == 0.0) { a.z += uBias; b.z += uBias; }
    else { a.xyz += normalize(-a.xyz) * uBias; b.xyz += normalize(-b.xyz) * uBias; }
  }
  vec4 ca = projectionMatrix * a; vec4 cb = projectionMatrix * b;
  vec2 hr = uRes * 0.5;
  vec2 sa = ca.xy / ca.w * hr; vec2 sb = cb.xy / cb.w * hr;
  vec2 d = sb - sa; float L = length(d);
  vec2 dir = L > 1e-4 ? d / L : vec2(1.0, 0.0);
  vec2 nr = vec2(-dir.y, dir.x);
  float ext = uWidth * 0.5 + 1.5;
  vec2 p = (position.x < 0.5 ? sa - dir * ext : sb + dir * ext) + nr * position.y * ext;
  vec4 c = position.x < 0.5 ? ca : cb;
  gl_Position = vec4(p / hr * c.w, c.z, c.w);
  vP = p; vA = sa; vB = sb; vU = iU; vS = iS;
}`;
const LINE_FS = /* glsl */ `
uniform vec3 uColor; uniform float uLevel; uniform float uProgress; uniform float uWidth; uniform vec4 uDash;
varying vec2 vP; varying vec2 vA; varying vec2 vB; varying vec2 vU; varying vec2 vS;
void main() {
  if (uProgress <= vU.x) discard;
  vec2 ab = vB - vA; float L2 = dot(ab, ab);
  float hEnd = 1.0, du = vU.y - vU.x;
  if (uProgress < vU.y && du > 1e-7) hEnd = (uProgress - vU.x) / du;
  float hRaw = L2 > 1e-6 ? dot(vP - vA, ab) / L2 : 0.0;
  float h = clamp(hRaw, 0.0, hEnd);
  float d = length(vP - (vA + ab * h));
  float alpha = clamp(uWidth * 0.5 + 0.5 - d, 0.0, 1.0);
  if (uDash.x > 0.0) {
    float sl = vS.y - vS.x;
    float pxPerS = sl > 1e-6 ? sqrt(L2) / sl : 1e3;
    float s = mix(vS.x, vS.y, clamp(hRaw, 0.0, 1.0));
    float P = uDash.x + uDash.y + uDash.z + uDash.w;
    float m = mod(s, P);
    float on = clamp(min(m, uDash.x - m) * pxPerS + 0.5, 0.0, 1.0);
    if (uDash.z > 0.0) {
      float c0 = uDash.x + uDash.y;
      on = max(on, clamp(min(m - c0, c0 + uDash.z - m) * pxPerS + 0.5, 0.0, 1.0));
    }
    alpha *= on;
  }
  if (alpha <= 0.002) discard;
  #ifdef LINE_STRAIGHT_ALPHA
  gl_FragColor = vec4(uColor, uLevel * alpha);           // normal blending: edges fade to whatever is behind
  #else
  gl_FragColor = vec4(uColor * (uLevel * alpha), 1.0);   // MAX blending: edges fade toward black = no-op under MAX
  #endif
  #include <colorspace_fragment>
}`;

let QUAD = null;
export function quadGeometry() {
  if (QUAD) return QUAD;
  QUAD = new THREE.BufferGeometry();
  QUAD.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0]), 3));
  QUAD.setIndex([0, 2, 1, 2, 3, 1]);
  return QUAD;
}

export const MAXBLEND = { blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor };

/** Raw line material. depth: "visible" (LessEqual, biased) | "hidden" (Greater: only where occluded) | "none" (sheet layer). */
/**
 * lineMaterial({ width, color, level, dash, depth, bias, res, straightAlpha = false }) -> ShaderMaterial (MAX blending).
 *   straightAlpha: output (colour, level x coverage) for NORMAL blending (dark ink on light grounds); the default
 *   premultiplied-on-black output is only correct under MAX blending (it fringes to black under normal blending).
 */
export function lineMaterial({ width, color, level = 1, dash = null, depth = "visible", bias = 0.03, res = [1920, 1080], straightAlpha = false }) {
  const m = new THREE.ShaderMaterial({
    vertexShader: LINE_VS,
    fragmentShader: LINE_FS,
    uniforms: {
      uRes: { value: new THREE.Vector2(res[0], res[1]) },
      uWidth: { value: width },
      uBias: { value: depth === "none" ? 0 : bias },
      uColor: { value: (color?.isColor ? color : new THREE.Color(color ?? "#ffffff")).clone() },
      uLevel: { value: level },
      uProgress: { value: 1.0001 },
      uDash: { value: new THREE.Vector4(...(dash ?? [0, 0, 0, 0])) },
    },
    transparent: true,
    side: THREE.DoubleSide, // ribbons are built in screen space; a mirrored parent (sheet layer y-flip) would otherwise cull them
    depthWrite: false,
    depthTest: depth !== "none",
    depthFunc: depth === "hidden" ? THREE.GreaterDepth : THREE.LessEqualDepth,
    ...MAXBLEND,
  });
  if (straightAlpha) m.defines = { LINE_STRAIGHT_ALPHA: "" };
  m.toneMapped = false;
  return m;
}

// ======================================================================== polyline buffers =============
/**
 * Lay out polylines on a 0..1 plotting clock. windows[k] = [a, b] is when polyline k is drawn.
 *   order "sequential" (one pen, length-proportional, pen-up gaps) | "parallel" (all 0..1) | explicit o.windows.
 */
export function plotWindows(polys, o = {}) {
  if (o.windows) return o.windows;
  const n = polys.length;
  if (o.order === "parallel" || n <= 1) return polys.map(() => [0, 1]);
  const lens = polys.map((p) => pathLength(p));
  const T = lens.reduce((s, x) => s + x, 0) || 1;
  const eff = lens.map((l) => l + T * 0.012); // dots and short ticks still take a moment
  const E = eff.reduce((s, x) => s + x, 0);
  const gap = o.gap ?? 0.015;
  const usable = Math.max(0.2, 1 - gap * (n - 1));
  let acc = 0;
  return eff.map((l) => { const a = acc, b = a + (l / E) * usable; acc = b + gap; return [a, Math.min(1, b)]; });
}

export function fillBuffers(polys, windows, A, B, U, S) {
  let k = 0;
  polys.forEach((pts, pi) => {
    const [wa, wb] = windows[pi];
    const L = pathLength(pts);
    if (pts.length === 1 || L < 1e-9) {
      const p = pts[0];
      A.set(p, k * 3); B.set(p, k * 3); U.set([wa, wb], k * 2); S.set([0, 0], k * 2); k++;
      return;
    }
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const sl = len(sub(pts[i], pts[i - 1]));
      if (sl < 1e-9) continue;
      const u0 = wa + ((wb - wa) * acc) / L, u1 = wa + ((wb - wa) * (acc + sl)) / L;
      A.set(pts[i - 1], k * 3); B.set(pts[i], k * 3); U.set([u0, u1], k * 2); S.set([acc, acc + sl], k * 2);
      acc += sl; k++;
    }
  });
  return k;
}
export const segCount = (polys) => polys.reduce((s, p) => s + Math.max(1, p.length - 1), 0);
const to3 = (p) => [p[0], p[1], p[2] ?? 0];

/**
 * screenLines(stage, polys, { width = 2 (px at the stage height), color = "#fff", level = 1, dash = null
 *   ([dash, gap, dot, gap] metres along the line), depth = "visible"|"hidden"|"none", bias = .03 (m toward the
 *   camera so lines beat their own surfaces), hidden = null | { width, color, level, dash } (adds a GREATER-depth
 *   pass of the same lines: dashed hidden edges), order = "sequential"|"parallel", windows, gap = .015,
 *   capacity, blending = "max"|"normal", renderOrder = 2 }) -> Mesh (InstancedBufferGeometry, frustumCulled off)
 *   userData: setProgress(p 0..1), setLevel(k), setPolys(polys) (same capacity), headLocal(p) -> [x,y,z] pen
 *   position, polys, windows, materials. polys: [[x,y,z] | [x,y]...]. Depth occluders: an invisible
 *   depth-only fill (MeshBasicMaterial colorWrite:false + polygonOffset 3/2) hides back lines.
 */
export function screenLines(stage, polysIn, o = {}) {
  let polys = polysIn.map((p) => p.map(to3)).filter((p) => p.length);
  const res = [stage.width, stage.height];
  const normal = o.blending === "normal";
  const blend = normal ? { blending: THREE.NormalBlending } : {};
  const cap = o.capacity ?? Math.max(1, segCount(polys));
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quadGeometry().index;
  geo.setAttribute("position", quadGeometry().attributes.position);
  const A = new Float32Array(cap * 3), B = new Float32Array(cap * 3), U = new Float32Array(cap * 2), S = new Float32Array(cap * 2);
  const attrs = { iA: new THREE.InstancedBufferAttribute(A, 3), iB: new THREE.InstancedBufferAttribute(B, 3), iU: new THREE.InstancedBufferAttribute(U, 2), iS: new THREE.InstancedBufferAttribute(S, 2) };
  for (const [k, a] of Object.entries(attrs)) { a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, a); }
  let windows = plotWindows(polys, o);
  geo.instanceCount = fillBuffers(polys, windows, A, B, U, S);
  // normal blending uses straight alpha (edges fade to the background); MAX uses the premultiplied form
  const mk = (q, depth) => Object.assign(lineMaterial({ width: q.width ?? 2, color: q.color ?? "#ffffff", level: q.level ?? 1, dash: q.dash ?? null, depth, bias: o.bias ?? 0.03, res, straightAlpha: normal }), blend);
  const mat = mk(o, o.depth ?? "visible");
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = o.renderOrder ?? 2;
  mesh.name = o.name ?? "screenLines";
  const mats = [mat];
  if (o.hidden) {
    const hm = mk({ width: 1.5, level: 0.6, dash: [0.085, 0.055, 0, 0], color: o.color, ...o.hidden }, "hidden");
    const hmesh = new THREE.Mesh(geo, hm);
    hmesh.frustumCulled = false; hmesh.renderOrder = mesh.renderOrder; hmesh.name = `${mesh.name}:hidden`;
    mesh.add(hmesh);
    mats.push(hm);
  }
  const base = mats.map((m) => m.uniforms.uLevel.value);
  let lvl = 1, prog = 1;
  const vis = () => { mesh.visible = prog > 0 && lvl > 0.001; };
  Object.assign(mesh.userData, {
    polys, materials: mats,
    get windows() { return windows; },
    setProgress(p) { prog = p; for (const m of mats) m.uniforms.uProgress.value = p >= 1 ? 1.0001 : p; vis(); return mesh; },
    setLevel(k) { lvl = k; mats.forEach((m, i) => (m.uniforms.uLevel.value = base[i] * k)); vis(); return mesh; },
    setPolys(np) {
      polys = np.map((p) => p.map(to3));
      mesh.userData.polys = polys;
      windows = plotWindows(polys, o);
      geo.instanceCount = fillBuffers(polys, windows, A, B, U, S);
      for (const a of Object.values(attrs)) a.needsUpdate = true;
      return mesh;
    },
    headLocal(p) {
      if (!polys.length) return null;
      let k = 0;
      for (let i = 0; i < polys.length; i++) if (p >= windows[i][0]) k = i;
      const [a, b] = windows[k], pts = polys[k];
      const L = pathLength(pts);
      return pointAt(pts, clamp((p - a) / Math.max(1e-6, b - a)) * L).p;
    },
  });
  return mesh;
}
