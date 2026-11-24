// styles/glass-light/style.js — "Glass & Light": an optics bench. Polished glass solids on a dark matte bench in a
// dim hazy room; beams of light computed by real ray optics (./optics.js: Snell refraction, TIR, per-wavelength IOR)
// travel through them as volumetric additive shafts, a prism fans white light into a spectrum, caustics land on the
// table where the rays do. Everything is synchronous and seeded; time enters only through the update/set calls the
// scene makes from renderAt, and style.render(t) rebuilds the refraction source inside the same call.
//
// GLASS approach: an OPAQUE custom shader. Each frame style.render() (1) renders the mirror-floor pass, (2) renders the
// scene WITHOUT the glass into a half-float target (the refraction source — same frame, no feedback), (3) renders the
// frame: every glass fragment samples that target at a screen offset given by refract() of the view ray through its
// (bevel-rolled, micro-rippled) normal, once per colour channel with a different IOR (chromatic fringes), multiplies by a
// Beer-like thickness tint, and adds Fresnel reflection of an analytic softbox studio, a rim, and coloured light from
// nearby beam points. Glass writes depth, so beams behind it are seen THROUGH it (refracted), never on top of it.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { rng, clamp, smoothstep, lerp, toEase } from "../../kit/time.js";
import { reflectiveSweep as kitReflectiveSweep, depthOfField as kitDepthOfField } from "../../kit/studio.js";
import { titleLockup as kitTitleLockup, overlayText, hairline, CALLOUT_LOOK } from "../../kit/callouts.js";
import { getOverlay, projectToScreen } from "../../kit/overlay.js";
import { GLSL_SAFE } from "../../kit/materials.js";
import * as optics from "./optics.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC, optics };

const lin = (hex) => new THREE.Color(hex); // THREE.Color(hex) is linear-sRGB internally
const NGLOW = 6;

// ===================================================================== shared GLSL ======================
const NOISE_GLSL = /* glsl */ `
float gh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gh(i), gh(i + vec3(1,0,0)), f.x), mix(gh(i + vec3(0,1,0)), gh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gh(i + vec3(0,0,1)), gh(i + vec3(1,0,1)), f.x), mix(gh(i + vec3(0,1,1)), gh(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

// ===================================================================== glass material ===================
const GLASS_VERT = /* glsl */ `
attribute float aEdge; attribute vec3 aEdgeDir;
varying vec3 vW; varying vec3 vN; varying vec3 vED; varying float vEdge; varying vec3 vObj; varying vec4 vClip;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz; vObj = position;
  vN = mat3(modelMatrix) * normal;
  vED = mat3(modelMatrix) * aEdgeDir;
  vEdge = aEdge;
  gl_Position = projectionMatrix * viewMatrix * wp;
  vClip = gl_Position;
}`;
const GLASS_FRAG = /* glsl */ `
#define NGLOW ${NGLOW}
uniform sampler2D tBg; uniform float uRefractOn;
uniform vec3 uIor; uniform float uRefract; uniform vec3 uAbsorb; uniform float uThick;
uniform float uBevel; uniform float uRoll; uniform float uEdgeDark; uniform float uEnv; uniform float uImperf;
uniform float uFresPow; uniform float uFresMin; uniform float uPanelSoft; uniform float uGlowSpec;
uniform vec3 uRim; uniform vec3 uSelf; uniform vec3 uTint; uniform vec3 uRoom; uniform vec3 uFloorC;
uniform vec3 uPD[4]; uniform vec3 uPU[4]; uniform vec3 uPV[4]; uniform vec3 uPC[4]; uniform vec2 uPS[4];
uniform vec4 uGlowP[NGLOW]; uniform vec3 uGlowC[NGLOW];
varying vec3 vW; varying vec3 vN; varying vec3 vED; varying float vEdge; varying vec3 vObj; varying vec4 vClip;
${GLSL_SAFE}
${NOISE_GLSL}
vec3 envAt(vec3 R){
  vec3 c = mix(uFloorC, uRoom, smoothstep(-0.25, 0.25, R.y));
  for (int i = 0; i < 4; i++) {
    float dd = dot(R, uPD[i]);
    if (dd > 0.05) {
      float u = dot(R, uPU[i]) / dd, v = dot(R, uPV[i]) / dd;
      float m = (1.0 - smoothstep(uPS[i].x * (1.0 - uPanelSoft), uPS[i].x, abs(u))) * (1.0 - smoothstep(uPS[i].y * (1.0 - uPanelSoft), uPS[i].y, abs(v)));
      c += uPC[i] * m;
    }
  }
  return c;
}
void main(){
  vec3 N = safeNorm(vN);
  if (!gl_FrontFacing) N = -N;
  float e = 1.0 - smoothstep(0.0, uBevel, vEdge);
  N = safeNorm(N + safeNorm(vED) * (e * e) * uRoll);
  vec3 q = vObj * 7.0;
  N = safeNorm(N + uImperf * 2.0 * (vec3(gn(q), gn(q + 17.3), gn(q + 31.7)) - 0.5));
  vec3 V = safeNorm(vW - cameraPosition);
  float ndv = clamp(-dot(N, V), 0.0, 1.0);
  float fres = mix(uFresMin, 1.0, safePow(1.0 - ndv, uFresPow));
  vec3 R = reflect(V, N);
  vec3 refl = envAt(R) * uEnv;
  vec3 glow = vec3(0.0);
  for (int k = 0; k < NGLOW; k++) {
    float r = uGlowP[k].w;
    if (r > 0.0) {
      vec3 L = uGlowP[k].xyz - vW;
      float d2 = dot(L, L);
      glow += uGlowC[k] * exp(-d2 / (r * r));
      refl += uGlowC[k] * safePow(max(dot(R, safeNorm(L)), 0.0), uGlowSpec) * 1.5;
    }
  }
  vec3 trans;
  if (uRefractOn > 0.5) {
    vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
    vec3 Nv = safeNorm((viewMatrix * vec4(N, 0.0)).xyz);
    vec3 Vv = safeNorm((viewMatrix * vec4(V, 0.0)).xyz);
    vec3 Tr = refract(Vv, Nv, 1.0 / uIor.r), Tg = refract(Vv, Nv, 1.0 / uIor.g), Tb = refract(Vv, Nv, 1.0 / uIor.b);
    trans.r = texture2D(tBg, clamp(suv + (Tr.xy - Vv.xy) * uRefract, 0.002, 0.998)).r;
    trans.g = texture2D(tBg, clamp(suv + (Tg.xy - Vv.xy) * uRefract, 0.002, 0.998)).g;
    trans.b = texture2D(tBg, clamp(suv + (Tb.xy - Vv.xy) * uRefract, 0.002, 0.998)).b;
  } else {
    trans = uRoom;
  }
  float thick = uThick * (1.0 + 1.4 * (1.0 - ndv));
  vec3 absorb = exp(-uAbsorb * thick);
  float tf = (1.0 - fres) * (1.0 - uEdgeDark * safePow(1.0 - ndv, 1.5)) * (1.0 - 0.88 * e);
  vec3 col = trans * absorb * tf + refl * fres + uRim * safePow(1.0 - ndv, 3.0) + (glow + uSelf) * uTint * (0.45 + 0.55 * ndv);
  gl_FragColor = vec4(col, 1.0);
}`;

/** studio panels -> shader uniform arrays (direction + gnomonic frame + colour·intensity + half sizes) */
function panelUniforms(G) {
  const PD = [], PU = [], PV = [], PC = [], PS = [];
  for (let i = 0; i < 4; i++) {
    const p = G.panels[i] ?? { dir: [0, 1, 0], size: [0, 0], intensity: 0, color: "#000000" };
    const d = new THREE.Vector3(...p.dir).normalize();
    const ref = Math.abs(d.y) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(d, ref).normalize();
    const v = new THREE.Vector3().crossVectors(u, d).normalize();
    PD.push(d); PU.push(u); PV.push(v); PC.push(lin(p.color).multiplyScalar(p.intensity)); PS.push(new THREE.Vector2(...p.size));
  }
  return { uPD: { value: PD }, uPU: { value: PU }, uPV: { value: PV }, uPC: { value: PC }, uPS: { value: PS } };
}

/**
 * glassMaterial(shared, { tint, density, thickness, refract, ior, dispersion, self }) -> ShaderMaterial (opaque glass).
 *   tint: "clear" | a spec.glass.tints key | hex. density: absorption per m. thickness: typical path length (m).
 *   refract: screen offset scale (bigger = stronger lensing; scale with piece size). self: constant inner glow colour.
 *   material.userData.glass = its uniforms (uSelf, uTint, uRefract ... are live).
 */
export function glassMaterial(shared, o = {}) {
  const G = STYLE_SPEC.glass;
  const clear = o.tint == null || o.tint === "clear";
  const tintHex = clear ? G.clear.tint : (G.tints[o.tint] ?? o.tint);
  const density = o.density ?? (clear ? G.clear.density : G.density);
  const tc = lin(tintHex);
  const absorb = new THREE.Vector3(1 - tc.r, 1 - tc.g, 1 - tc.b).multiplyScalar(density);
  const n = o.ior ?? G.ior, dsp = o.dispersion ?? G.dispersion;
  const U = {
    ...shared,
    uIor: { value: new THREE.Vector3(n - dsp / 2, n, n + dsp / 2) },
    uRefract: { value: o.refract ?? G.refract },
    uAbsorb: { value: absorb },
    uThick: { value: o.thickness ?? 0.4 },
    uTint: { value: clear ? new THREE.Color(1, 1, 1) : tc.clone().lerp(new THREE.Color(1, 1, 1), 0.25) },
    uSelf: { value: lin(o.self ?? "#000000") },
  };
  const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, side: THREE.DoubleSide });
  m.userData.glass = U;
  m.name = `glass:${clear ? "clear" : o.tint}`;
  return m;
}

// ===================================================================== glass geometry ===================
/**
 * polyGeometry(planes) -> BufferGeometry of the convex polyhedron (optics.polyFaces), each face fanned from its
 * centroid so every triangle owns exactly one outer edge: aEdge = distance to that edge (m), aEdgeDir = outward
 * in-plane direction. The glass shader rolls the normal toward aEdgeDir inside the bevel band -> rounded-edge glints.
 */
export function polyGeometry(planes) {
  const faces = optics.polyFaces(planes);
  const P = [], N = [], E = [], ED = [];
  const v = (a) => new THREE.Vector3(...a);
  for (const f of faces) {
    const n = v(f.n), pts = f.pts.map(v);
    const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const e = b.clone().sub(a);
      const out = e.clone().cross(n).normalize();
      const h = c.clone().sub(a).dot(out) * -1; // centroid -> edge distance (positive)
      for (const [p, d] of [[c, h], [a, 0], [b, 0]]) {
        P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); E.push(d); ED.push(out.x, out.y, out.z);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute("aEdge", new THREE.Float32BufferAttribute(E, 1));
  g.setAttribute("aEdgeDir", new THREE.Float32BufferAttribute(ED, 3));
  g.computeBoundingSphere();
  return g;
}
function smoothAttrs(g) {
  const n = g.attributes.position.count;
  g.setAttribute("aEdge", new THREE.Float32BufferAttribute(new Float32Array(n).fill(1e3), 1));
  g.setAttribute("aEdgeDir", new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  return g;
}
/** lensGeometry(shape.lens) -> lathe of the two spherical caps + rim, optical axis = local X. */
export function lensGeometry(L, seg = 72) {
  const { radius, R, off } = L, k = 24, prof = [];
  for (let i = 0; i <= k; i++) { const r = (radius * i) / k; prof.push(new THREE.Vector2(Math.max(1e-4, r), -off + Math.sqrt(R * R - r * r))); }
  for (let i = k; i >= 0; i--) { const r = (radius * i) / k; prof.push(new THREE.Vector2(Math.max(1e-4, r), off - Math.sqrt(R * R - r * r))); }
  const g = new THREE.LatheGeometry(prof, seg);
  g.rotateZ(-Math.PI / 2);
  g.computeVertexNormals();
  return smoothAttrs(g);
}

// ===================================================================== beams ===========================
const BEAM_VERT = /* glsl */ `
attribute vec3 aA; attribute vec3 aB; attribute vec2 aSE; attribute vec2 aS; attribute vec2 aWd; attribute vec3 aCol; attribute vec3 aHead;
uniform float uFlat; uniform float uFlatY;
varying float vAc; varying float vS; varying vec3 vWp; varying vec3 vCol; varying vec3 vHead;
${GLSL_SAFE}
void main(){
  vec3 P = mix(aA, aB, aSE.y);
  vec3 dir = safeNorm(aB - aA);
  vec3 side;
  if (uFlat > 0.5) { side = safeNorm(cross(dir, vec3(0.0, 1.0, 0.0))); P.y = uFlatY; }
  else side = safeNorm(cross(dir, safeNorm(cameraPosition - P)));
  P += side * aSE.x * mix(aWd.x, aWd.y, aSE.y);
  vAc = aSE.x; vS = mix(aS.x, aS.y, aSE.y); vWp = P; vCol = aCol; vHead = aHead;
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}`;
const BEAM_FRAG = /* glsl */ `
uniform float uCore; uniform float uCoreK; uniform float uHalo; uniform float uHaloK; uniform float uFall; uniform float uHeadSoft;
uniform float uSpark; uniform float uDust; uniform float uDustScale; uniform float uTime; uniform vec3 uDrift; uniform vec3 uPulse;
varying float vAc; varying float vS; varying vec3 vWp; varying vec3 vCol; varying vec3 vHead;
${NOISE_GLSL}
void main(){
  float head = 1.0 - smoothstep(vHead.x - uHeadSoft, vHead.x, vS);
  if (head <= 0.0) discard;
  float a = vAc;
  float core = exp(-a * a * uCoreK) * uCore;
  float n = gn(vWp * uDustScale + uDrift * uTime) * 0.6 + gn(vWp * uDustScale * 2.7 + 5.0 + uDrift.zxy * uTime) * 0.4;
  float halo = exp(-a * a * uHaloK) * uHalo * (1.0 - uDust + uDust * 2.0 * n);
  float fall = 1.0 / (1.0 + vS * uFall);
  float spark = 1.0 + uSpark * smoothstep(vHead.x - 0.9, vHead.x - 0.05, vS);
  float pk = 1.0;
  float pa = vHead.y * smoothstep(vHead.z, vHead.z + 0.2, vS);
  if (pa > 0.0) {
    float ph = fract((vS - uTime * uPulse.y) * uPulse.x);
    float bump = smoothstep(0.0, 0.18, ph) * (1.0 - smoothstep(0.28, 0.5, ph));
    pk = mix(1.0, (1.0 - uPulse.z) + uPulse.z * 2.4 * bump, pa);
  }
  gl_FragColor = vec4(vCol * (core + halo) * head * fall * spark * pk, 1.0);
}`;

/**
 * beamBundle({ capacity = 96, flat = false }) -> Mesh: every visible beam segment in ONE draw call (additive ribbons).
 *   Camera-facing (flat=false: the shaft) or lying on the bench (flat=true: the dim light spill under the shaft).
 *   userData.set(items, t): items = [{ a, b, s0, s1, w0, w1, color:THREE.Color (× level), head, pulse, pulseFrom }]
 *   (use beamItems(path, ...) to build them). Pure: rewrites all attributes every call.
 */
export function beamBundle({ capacity = 96, flat = false } = {}) {
  const B = STYLE_SPEC.beam;
  const n = capacity * 4;
  const g = new THREE.BufferGeometry();
  const mk = (k) => new THREE.BufferAttribute(new Float32Array(n * k), k).setUsage(THREE.DynamicDrawUsage);
  const A = { aA: mk(3), aB: mk(3), aSE: mk(2), aS: mk(2), aWd: mk(2), aCol: mk(3), aHead: mk(3) };
  for (const [k, v] of Object.entries(A)) g.setAttribute(k, v);
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const idx = [];
  for (let i = 0; i < capacity; i++) { const o = i * 4; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  g.setIndex(idx);
  for (let i = 0; i < capacity; i++) {
    [[-1, 0], [1, 0], [-1, 1], [1, 1]].forEach(([s, e], k) => A.aSE.setXY(i * 4 + k, s, e));
  }
  const S = B.spill;
  const uniforms = {
    uCore: { value: flat ? 0 : B.core }, uCoreK: { value: B.coreK }, uHalo: { value: flat ? S.level : B.halo }, uHaloK: { value: flat ? 2.2 : B.haloK },
    uFall: { value: B.falloff }, uHeadSoft: { value: B.headSoft }, uSpark: { value: flat ? 0 : B.spark }, uDust: { value: flat ? 0.2 : B.dust },
    uDustScale: { value: B.dustScale }, uTime: { value: 0 }, uDrift: { value: new THREE.Vector3(...B.dustDrift) },
    uPulse: { value: new THREE.Vector3(B.pulse.freq, B.pulse.speed, B.pulse.depth) }, uFlat: { value: flat ? 1 : 0 }, uFlatY: { value: S.y },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = flat ? 2 : 6;
  mesh.userData.noDepth = true;
  mesh.userData.set = (items, t = 0) => {
    uniforms.uTime.value = t;
    const m = Math.min(items.length, capacity);
    for (let i = 0; i < m; i++) {
      const it = items[i], w = flat ? S.width : 1;
      for (let k = 0; k < 4; k++) {
        const j = i * 4 + k;
        A.aA.setXYZ(j, ...it.a); A.aB.setXYZ(j, ...it.b); A.aS.setXY(j, it.s0, it.s1);
        A.aWd.setXY(j, it.w0 * w, it.w1 * w); A.aCol.setXYZ(j, it.color.r, it.color.g, it.color.b);
        A.aHead.setXYZ(j, it.head, it.pulse ?? 0, it.pulseFrom ?? 0);
      }
    }
    for (const a of Object.values(A)) a.needsUpdate = true;
    g.setDrawRange(0, m * 6);
    mesh.visible = m > 0;
  };
  mesh.userData.set([]);
  return mesh;
}
/**
 * beamItems(path, { color, level = 1, head = Infinity, width, pulse = 0, pulseFrom = 0, from = 0 }) -> bundle items
 *   for one traced path (optics.trace result or a segment list). head = distance travelled so far (m).
 */
export function beamItems(path, o = {}) {
  const B = STYLE_SPEC.beam;
  const segs = path.segments ?? path;
  const c = (o.color?.isColor ? o.color.clone() : lin(o.color ?? "#ffffff")).multiplyScalar(o.level ?? 1);
  const w = o.width ?? B.width, head = Number.isFinite(o.head) ? o.head : 1e4;
  const out = [];
  for (const g of segs) {
    if (g.s0 >= head || g.s1 - g.s0 < 1e-5 || g.s1 < (o.from ?? 0)) continue;
    out.push({ a: g.a, b: g.b, s0: g.s0, s1: g.s1, w0: w + g.s0 * B.grow, w1: w + g.s1 * B.grow, color: c, head, pulse: o.pulse ?? 0, pulseFrom: o.pulseFrom ?? 0 });
  }
  return out;
}

// ===================================================================== caustics ========================
/**
 * causticDecals({ capacity = 24 }) -> Mesh: additive soft ellipses ON the bench (y = spec.caustic.y), stretched
 * along the arriving beam (grazing beams smear long). userData.set([{ p, dir:[x,z], length, width, color }]).
 * Use causticFor(path, color, level) to place one where a traced ray actually lands.
 */
export function causticDecals({ capacity = 24 } = {}) {
  const C = STYLE_SPEC.caustic;
  const n = capacity * 4, g = new THREE.BufferGeometry();
  const mk = (k) => new THREE.BufferAttribute(new Float32Array(n * k), k).setUsage(THREE.DynamicDrawUsage);
  const A = { aC: mk(3), aAx: mk(4), aCol: mk(3), aCo: mk(2) };
  for (const [k, v] of Object.entries(A)) g.setAttribute(k, v);
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const idx = [];
  for (let i = 0; i < capacity; i++) { const o = i * 4; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  g.setIndex(idx);
  for (let i = 0; i < capacity; i++) [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, y], k) => A.aCo.setXY(i * 4 + k, x, y));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uY: { value: C.y }, uCoreG: { value: C.core } },
    vertexShader: /* glsl */ `attribute vec3 aC; attribute vec4 aAx; attribute vec3 aCol; attribute vec2 aCo; uniform float uY;
      varying vec2 vCo; varying vec3 vCol;
      void main(){ vec2 ax = aAx.xy; vec2 pp = vec2(-ax.y, ax.x);
        vec3 P = aC + vec3(ax.x, 0.0, ax.y) * aCo.x * aAx.z + vec3(pp.x, 0.0, pp.y) * aCo.y * aAx.w; P.y = uY;
        vCo = aCo; vCol = aCol; gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uCoreG; varying vec2 vCo; varying vec3 vCol;
      void main(){ float r2 = dot(vCo, vCo);
        float m = exp(-r2 * 3.2) * 0.55 + exp(-r2 * 16.0) * uCoreG;
        m *= 1.0 - smoothstep(0.75, 1.0, max(abs(vCo.x), abs(vCo.y)));
        gl_FragColor = vec4(vCol * m, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.userData.noDepth = true;
  mesh.userData.set = (list) => {
    const m = Math.min(list.length, capacity);
    for (let i = 0; i < m; i++) {
      const d = list[i];
      for (let k = 0; k < 4; k++) {
        const j = i * 4 + k;
        A.aC.setXYZ(j, ...d.p); A.aAx.setXYZW(j, d.dir[0], d.dir[1], d.length, d.width); A.aCol.setXYZ(j, d.color.r, d.color.g, d.color.b);
      }
    }
    for (const a of Object.values(A)) a.needsUpdate = true;
    g.setDrawRange(0, m * 6);
    mesh.visible = m > 0;
  };
  mesh.userData.set([]);
  return mesh;
}
/** causticFor(path, color, level, { width }) -> decal | null (only when the ray ended on the floor). */
export function causticFor(path, color, level = 1, o = {}) {
  const C = STYLE_SPEC.caustic;
  if (!path?.end || path.end.kind !== "floor" || level <= 0) return null;
  const d = path.end.d, h = Math.hypot(d[0], d[2]) || 1;
  const sinG = Math.min(1, Math.abs(d[1]));
  const width = o.width ?? Math.max(C.minWidth, STYLE_SPEC.beam.width * 1.1);
  const length = width * Math.min(C.maxStretch, 1 / Math.max(sinG, 1e-3));
  const col = (color.isColor ? color.clone() : lin(color)).multiplyScalar(level * C.level);
  return { p: path.end.p, dir: [d[0] / h, d[2] / h], length, width, color: col };
}

// ===================================================================== points: dust + glints ===========
const POINTS_VERT = /* glsl */ `attribute vec3 aCol; attribute float aSize; attribute float aStar; uniform float uPx;
  varying vec3 vCol; varying float vStar;
  void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aStar > 0.5 ? aSize : aSize * uPx / max(-mv.z, 0.1);
    vCol = aCol; vStar = aStar; gl_Position = projectionMatrix * mv; }`;
const POINTS_FRAG = /* glsl */ `varying vec3 vCol; varying float vStar;
  void main(){ vec2 d = gl_PointCoord - 0.5; float r2 = dot(d, d) * 4.0;
    float g;
    if (vStar > 0.5) {
      float edge = 1.0 - smoothstep(0.3, 0.5, max(abs(d.x), abs(d.y)));
      g = (exp(-r2 * 60.0) * 2.0 + exp(-r2 * 9.0) * 0.25 + exp(-abs(d.x) * 70.0) * exp(-abs(d.y) * 7.0) + exp(-abs(d.y) * 70.0) * exp(-abs(d.x) * 7.0)) * edge;
    } else {
      g = exp(-r2 * 5.0) * (1.0 - smoothstep(0.7, 1.0, r2));
    }
    gl_FragColor = vec4(vCol * g, 1.0); }`;
function pointsMesh(capacity) {
  const g = new THREE.BufferGeometry();
  const mk = (k) => new THREE.BufferAttribute(new Float32Array(capacity * k), k).setUsage(THREE.DynamicDrawUsage);
  const A = { position: mk(3), aCol: mk(3), aSize: mk(1), aStar: mk(1) };
  for (const [k, v] of Object.entries(A)) g.setAttribute(k, v);
  const mat = new THREE.ShaderMaterial({ uniforms: { uPx: { value: 1000 } }, vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 7;
  return { pts, A, g, mat };
}
/**
 * glints({ capacity = 32 }) -> Points: four-point star glints (screen-sized px). userData.set([{ p, color, size, level }]).
 * Place them at optics events (beam entry/exit points) and on the hero's edges.
 */
export function glints({ capacity = 32 } = {}) {
  const { pts, A, g } = pointsMesh(capacity);
  pts.userData.set = (list) => {
    const m = Math.min(list.length, capacity);
    for (let i = 0; i < m; i++) {
      const l = list[i], c = (l.color.isColor ? l.color.clone() : lin(l.color)).multiplyScalar(l.level ?? 1);
      A.position.setXYZ(i, ...l.p); A.aCol.setXYZ(i, c.r, c.g, c.b); A.aSize.setX(i, l.size ?? STYLE_SPEC.glint.size); A.aStar.setX(i, 1);
    }
    for (const a of Object.values(A)) a.needsUpdate = true;
    g.setDrawRange(0, m);
    pts.visible = m > 0;
  };
  pts.userData.set([]);
  return pts;
}
/**
 * dustMotes({ count, box, seed, size, radius, level }) -> Points: seeded motes drifting in the room air (pure f(t)); each
 * lights up by its distance to the lit beam segments. userData.update(t, items, camera) (items = beamBundle items).
 */
export function dustMotes(o = {}) {
  const D = { ...STYLE_SPEC.dust, ...o };
  const { pts, A, g, mat } = pointsMesh(D.count);
  const r = rng(D.seed);
  const [lo, hi] = D.box;
  const motes = Array.from({ length: D.count }, () => ({
    p: [r.range(lo[0], hi[0]), r.range(lo[1], hi[1]), r.range(lo[2], hi[2])],
    ph: [r.range(0, 6.28), r.range(0, 6.28), r.range(0, 6.28)], sp: r.range(0.12, 0.35), amp: r.range(0.03, 0.09), s: r.range(0.6, 1.4),
  }));
  for (let i = 0; i < D.count; i++) A.aStar.setX(i, 0);
  const tmp = [0, 0, 0];
  pts.userData.update = (t, items, camera) => {
    if (camera) mat.uniforms.uPx.value = 1080 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const R2 = D.radius * D.radius;
    motes.forEach((m, i) => {
      tmp[0] = m.p[0] + Math.sin(t * m.sp + m.ph[0]) * m.amp + t * 0.012;
      tmp[1] = m.p[1] + Math.sin(t * m.sp * 0.7 + m.ph[1]) * m.amp * 0.6 - t * 0.006;
      tmp[2] = m.p[2] + Math.cos(t * m.sp * 0.8 + m.ph[2]) * m.amp;
      let cr = 0, cg = 0, cb = 0;
      for (const it of items) {
        const sEnd = Math.min(it.s1, it.head);
        if (sEnd <= it.s0) continue;
        const ab = [it.b[0] - it.a[0], it.b[1] - it.a[1], it.b[2] - it.a[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
        const umax = (sEnd - it.s0) / (it.s1 - it.s0 || 1);
        let u = ((tmp[0] - it.a[0]) * ab[0] + (tmp[1] - it.a[1]) * ab[1] + (tmp[2] - it.a[2]) * ab[2]) / L2;
        u = clamp(u, 0, umax);
        const dx = tmp[0] - it.a[0] - ab[0] * u, dy = tmp[1] - it.a[1] - ab[1] * u, dz = tmp[2] - it.a[2] - ab[2] * u;
        const k = Math.exp(-(dx * dx + dy * dy + dz * dz) / R2);
        if (k < 1e-3) continue;
        cr += it.color.r * k; cg += it.color.g * k; cb += it.color.b * k;
      }
      const tw = 0.6 + 0.4 * Math.sin(t * 3.1 * m.s + m.ph[1] * 3);
      A.position.setXYZ(i, tmp[0], tmp[1], tmp[2]);
      A.aCol.setXYZ(i, Math.min(cr, 3) * D.level * tw, Math.min(cg, 3) * D.level * tw, Math.min(cb, 3) * D.level * tw);
      A.aSize.setX(i, D.size * 0.001 * m.s);
    });
    for (const a of Object.values(A)) a.needsUpdate = true;
  };
  return pts;
}

// ===================================================================== hairline caption ================
/**
 * hairlineCaption(stage, text, { x = -.84, y = -.74, sub, look }) -> overlay Group: thin light caps in a FIXED region
 * (left-aligned at NDC x, y), a hairline rule drawn under it, and a hairline leader from the rule's end to a 3D anchor
 * (dot + ring). userData.update(t, { on, off, anchor:[x,y,z] | null }).
 */
export function hairlineCaption(stage, text, o = {}) {
  const OV = { ...CALLOUT_LOOK, ...STYLE_SPEC.overlay, ...o.look }, ov = getOverlay(stage), font = FONTS[OV.font] ?? OV.font;
  const PX = 2 / 1080;
  const g = new THREE.Group();
  const txt = overlayText(text, { height: OV.labelHeight * (o.size ?? 1), weight: OV.labelWeight, tracking: OV.labelTracking, color: OV.labelColor, font });
  const sub = o.sub ? overlayText(o.sub, { height: OV.subHeight, weight: 400, tracking: OV.labelTracking, color: OV.subColor, font }) : null;
  const rule = hairline(OV.lineColor), leader = hairline(OV.lineColor);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: OV.dotColor, transparent: true, depthTest: false }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.84, 1, 48), new THREE.MeshBasicMaterial({ color: OV.lineColor, transparent: true, depthTest: false }));
  g.add(txt, rule, leader, dot, ring);
  if (sub) g.add(sub);
  ov.add(g);
  const x0 = (o.x ?? -0.84) * ov.aspect, y0 = o.y ?? -0.74;
  g.userData.width = txt.userData.w / ov.aspect; // NDC width of the text (for layout checks)
  g.userData.update = (t, { on, off = Infinity, anchor = null } = {}) => {
    const vis = t >= on && t < off + OV.outDur;
    g.visible = vis;
    if (!vis) return;
    const out = Number.isFinite(off) ? 1 - smoothstep(off, off + OV.outDur, t) : 1;
    const a = smoothstep(on, on + OV.fadeDur, t) * out;
    const rise = (1 - toEase("outCubic")(clamp((t - on) / (OV.fadeDur * 2)))) * OV.rise;
    const tw = txt.userData.w;
    txt.position.set(x0 + tw / 2 - 0.006, y0 + txt.userData.h * 0.34 - rise, 0);
    txt.material.opacity = a;
    const ry = y0 - txt.userData.h * 0.12;
    const ru = toEase("inOutCubic")(clamp((t - on) / OV.drawDur));
    const rx1 = x0 + tw * 0.98;
    rule.userData.set([x0, ry], [lerp(x0, rx1, ru), ry], OV.lineWidthPx, out);
    if (sub) { sub.position.set(x0 + sub.userData.w / 2 - 0.004, ry - sub.userData.h * 0.62 + rise * 0.5, 0); sub.material.opacity = smoothstep(on + 0.25, on + 0.25 + OV.fadeDur, t) * out; }
    if (anchor) {
      const p = projectToScreen(stage, anchor);
      const A = [p.x * ov.aspect, p.y], S = [rx1 + 0.02, ry];
      const lu = toEase("inOutCubic")(clamp((t - on - OV.drawDur * 0.6) / OV.drawDur));
      leader.userData.set(S, [lerp(S[0], A[0], lu), lerp(S[1], A[1], lu)], OV.lineWidthPx, out * 0.85);
      const pop = toEase("outBack")(clamp((t - on - OV.drawDur * 1.5) / 0.35));
      dot.visible = ring.visible = pop > 0.001 && !p.behind;
      dot.position.set(A[0], A[1], 0); dot.scale.setScalar(OV.dotPx * PX * pop); dot.material.opacity = out;
      ring.position.set(A[0], A[1], 0); ring.scale.setScalar(OV.ringPx * PX * (0.6 + 0.4 * pop)); ring.material.opacity = out * 0.8;
    } else {
      leader.visible = dot.visible = ring.visible = false;
    }
  };
  g.visible = false;
  return g;
}

// ===================================================================== createStyle ======================
/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true, dof = true }
 *   style.render(t, { focus:[x,y,z] }) = mirror-floor pass + refraction pre-pass (glass hidden) + DOF focus + stage.render.
 *   ALWAYS use it instead of stage.render(t) (glass samples the pre-pass).
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, G = spec.glass;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const { renderer, scene } = stage;

  // ---- refraction source: same-frame pre-render without glass ----
  const bgRT = new THREE.WebGLRenderTarget(Math.round(stage.width * G.prepass), Math.round(stage.height * G.prepass), { type: THREE.HalfFloatType, samples: 0 });
  const glowP = Array.from({ length: NGLOW }, () => new THREE.Vector4(0, 0, 0, 0));
  const glowC = Array.from({ length: NGLOW }, () => new THREE.Color(0, 0, 0));
  const shared = {
    tBg: { value: bgRT.texture }, uRefractOn: { value: 1 },
    uBevel: { value: G.bevel }, uRoll: { value: G.bevelRoll }, uEdgeDark: { value: G.edgeDark }, uEnv: { value: G.env },
    uImperf: { value: G.imperfection }, uFresPow: { value: G.fresnelPow }, uFresMin: { value: G.fresnelMin },
    uPanelSoft: { value: G.panelSoft }, uGlowSpec: { value: G.glowSpec },
    uRim: { value: lin(G.rim).multiplyScalar(G.rimStrength) }, uRoom: { value: lin(G.room) }, uFloorC: { value: lin(G.floor) },
    ...panelUniforms(G),
    uGlowP: { value: glowP }, uGlowC: { value: glowC },
  };
  const glassMeshes = [];
  const dof = opts.dof === false || !post ? { pass: null, setFocus() {} } : kitDepthOfField(stage, spec.dof);
  let floor = null;
  const decals = [];

  /**
   * glassPiece(kind, { id, size..., tint, density, refract, self, mount }) -> Group (add to the SCENE root).
   *   kinds: "prism" {side, height, apex} · "block" {w, h, d} · "gem" {w, h, d, edge, corner} · "sphere" {r} ·
   *          "lens" {radius, R, thick} (axis = local X, centre at the group origin) · "rod" {r, length} (axis X) ·
   *          "poly" {pts:[[x,z]...], height} (any convex extruded footprint, e.g. a wedge).
   *   userData: mesh, material, piece(): optics piece from the group's CURRENT position/rotation, kind, shape.
   *   mount: true adds a thin dark post + foot under lenses/rods (moves with the piece).
   */
  function glassPiece(kind, o = {}) {
    const glass = o.glass ?? (kind === "prism" ? spec.prism.glass : optics.GLASS.crown);
    let shape, geo, size;
    switch (kind) {
      case "prism": shape = optics.prismShape(o); size = o.side ?? 0.8; break;
      case "block": shape = optics.boxShape(o); size = Math.max(o.w ?? 0.5, o.d ?? 0.5); break;
      case "gem": shape = optics.gemShape(o); size = Math.max(o.w ?? 1.3, o.d ?? 1.3); break;
      case "poly": shape = optics.extrudedPoly(o.pts, 0, o.height ?? 0.5); size = 0.6; break;
      case "sphere": shape = optics.sphereShape(o); size = 2 * (o.r ?? 0.3); geo = smoothAttrs(new THREE.SphereGeometry(o.r ?? 0.3, 64, 48).translate(0, o.r ?? 0.3, 0)); break;
      case "lens": shape = optics.lensShape(o); size = 2 * (o.radius ?? 0.42); geo = lensGeometry(shape.lens); break;
      case "rod": shape = optics.rodShape(o); size = 2 * (o.r ?? 0.08); geo = smoothAttrs(new THREE.CylinderGeometry(o.r ?? 0.08, o.r ?? 0.08, o.length ?? 1.2, 64, 1).rotateZ(Math.PI / 2)); break;
      default: throw new Error(`glassPiece: unknown kind "${kind}"`);
    }
    if (!geo) geo = polyGeometry(shape.planes);
    const mat = glassMaterial(shared, { tint: o.tint, density: o.density, thickness: o.thickness ?? size * 0.6, refract: o.refract ?? G.refract * clamp(size / 0.8, 0.5, 1.8), self: o.self });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.name = `glass:${o.id ?? kind}`;
    glassMeshes.push(mesh);
    const grp = new THREE.Group();
    grp.name = `piece:${o.id ?? kind}`;
    grp.add(mesh);
    if (o.mount) {
      const y0 = kind === "lens" ? -(o.radius ?? 0.42) : -(o.r ?? 0.08);
      const yBase = -(o.mountHeight ?? 0.55);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, y0 - yBase, 16), materials.metal);
      stem.position.y = (y0 + yBase) / 2;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.035, 32), materials.metal);
      foot.position.y = yBase + 0.0175;
      const clamp_ = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 8, 24), materials.metal);
      clamp_.position.y = y0 - 0.005; clamp_.rotation.x = Math.PI / 2;
      for (const m of [stem, foot, clamp_]) { m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    }
    grp.userData = {
      kind, shape, mesh, material: mat, id: o.id ?? kind,
      piece: () => ({ id: o.id ?? kind, shape, glass, pos: grp.position.toArray(), rot: [grp.rotation.x, grp.rotation.y, grp.rotation.z] }),
    };
    return grp;
  }

  /**
   * emitter({ label, color, size:[w,h,d], height }) -> Group: dark anodised source head on a pedestal, glowing aperture
   * on its +X face, an engraved label on its +Z face that lights with the beam. Origin = bench under the head.
   * userData.setLevel(k) (0..1), ray() -> { o, d } world ray leaving the aperture (+X rotated by rotation.y).
   */
  function emitter(o = {}) {
    const E = spec.emitter, [w, h, d] = o.size ?? E.size, H = o.height ?? 0.55;
    const g = new THREE.Group();
    g.name = `emitter:${o.label ?? ""}`;
    const head = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.035), materials.metal);
    head.position.y = H;
    const ped = new THREE.Mesh(new RoundedBoxGeometry(w * 0.55, H - h / 2, d * 0.6, 2, 0.02), materials.metalDark);
    ped.position.y = (H - h / 2) / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(E.aperture * 1.35, 0.014, 10, 36), materials.metal);
    ring.rotation.y = Math.PI / 2; ring.position.set(w / 2 + 0.006, H, 0);
    const col = lin(o.color ?? "#ffffff");
    const discMat = new THREE.MeshBasicMaterial({ color: col.clone() });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(E.aperture, 32), discMat);
    disc.rotation.y = Math.PI / 2; disc.position.set(w / 2 + 0.004, H, 0);
    for (const m of [head, ped, ring]) { m.castShadow = m.receiveShadow = true; }
    g.add(head, ped, ring, disc);
    let label = null;
    if (o.label) {
      label = createTextLabel(o.label, { ...textStyle, height: o.labelHeight ?? E.label, weight: 500, color: o.color ?? "#ffffff", letterSpacing: 18, padding: 0.3 });
      label.position.set(-w * 0.04, H, d / 2 + 0.004);
      g.add(label);
    }
    g.userData = {
      head, label, disc, color: col,
      setLevel(k) {
        k = clamp(k, 0, 1);
        discMat.color.copy(col).multiplyScalar(0.15 + 5 * k);
        if (label) label.material.color.setScalar(0.35 + (E.labelInk + 0.6) * k);
      },
      ray() {
        g.updateWorldMatrix(true, false);
        const p = new THREE.Vector3(w / 2 + 0.02, H, 0).applyMatrix4(g.matrixWorld);
        const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(g.quaternion);
        return { o: p.toArray(), d: dir.toArray() };
      },
    };
    g.userData.setLevel(0);
    return g;
  }

  /**
   * spillLights({ count }) -> Group of PointLights (fixed count: changing the light count recompiles every shader);
   * userData.set([{ p, color, level }]) puts coloured light where beams pass/land (bench pools, emitter faces).
   */
  function spillLights(o = {}) {
    const S = { ...spec.spillLights, ...o };
    const g = new THREE.Group();
    const L = Array.from({ length: S.count }, () => { const l = new THREE.PointLight("#ffffff", 0, S.distance, 2); g.add(l); return l; });
    g.userData.set = (list) => {
      L.forEach((l, i) => {
        const it = list[i];
        if (!it) { l.intensity = 0; return; }
        l.position.set(...it.p); l.color.copy(it.color.isColor ? it.color : lin(it.color)); l.intensity = S.intensity * (it.level ?? 1);
      });
    };
    return g;
  }

  const props = {
    /** bench({ width, depth, height, radius }) — dark matte cyclorama whose floor is a faint blurred mirror. */
    bench(o = {}) {
      floor = kitReflectiveSweep(stage, materials.bench, { ...spec.floor, ...o });
      floor.userData.hide.push(...decals);
      return floor;
    },
    glassPiece,
    prism: (o = {}) => glassPiece("prism", o),
    block: (o = {}) => glassPiece("block", o),
    gem: (o = {}) => glassPiece("gem", o),
    sphere: (o = {}) => glassPiece("sphere", o),
    lens: (o = {}) => glassPiece("lens", { mount: true, ...o }),
    rod: (o = {}) => glassPiece("rod", o),
    emitter,
    beams: (o = {}) => beamBundle(o),
    spill: (o = {}) => { const m = beamBundle({ ...o, flat: true }); decals.push(m); floor?.userData.hide.push(m); return m; },
    caustics: (o = {}) => { const m = causticDecals(o); decals.push(m); floor?.userData.hide.push(m); return m; },
    glints: (o = {}) => glints(o),
    dust: (o = {}) => dustMotes(o),
    spillLights,
    caption: (text, o = {}) => hairlineCaption(stage, text, o),
    titleLockup: (title, o = {}) => kitTitleLockup(stage, title, { ...o, look: { ...spec.overlay, ...o.look } }),
    label: (text, o = {}) => createTextLabel(text, { ...textStyle, ...o }),
  };

  /** setGlow([{ p, color, radius }]) — beam points that tint and light the glass from inside (≤ 6). */
  function setGlow(list = []) {
    for (let i = 0; i < NGLOW; i++) {
      const it = list[i];
      if (!it || !(it.radius > 0)) { glowP[i].set(0, 0, 0, 0); glowC[i].setRGB(0, 0, 0); continue; }
      glowP[i].set(it.p[0], it.p[1], it.p[2], it.radius);
      glowC[i].copy(it.color.isColor ? it.color : lin(it.color));
    }
  }

  return {
    spec,
    palette: spec.palette,
    materials,
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories: {
      bench: (s) => props.bench(s.dims ?? {}),
      glass: (s) => glassPiece(s.dims?.kind ?? "block", { id: s.id, ...(s.dims ?? {}) }),
      emitter: (s) => emitter({ label: s.text, ...(s.dims ?? {}) }),
    },
    optics,
    dof,
    setGlow,
    glassMeshes,
    helpers: { beamItems, causticFor, polyGeometry, lensGeometry, glassMaterial: (o) => glassMaterial(shared, o) },
    /** render(t, { focus }) — mirror pass, refraction pre-pass (glass hidden), DOF focus, then stage.render(t). */
    render(t, { focus } = {}) {
      const cam = stage.camera;
      cam.updateMatrixWorld();
      if (focus) dof.setFocus(cam.position.distanceTo(new THREE.Vector3(...focus)));
      shared.uRefractOn.value = 0;
      if (floor) floor.userData.renderReflection(renderer, scene, cam);
      const vis = glassMeshes.map((m) => m.visible);
      glassMeshes.forEach((m) => (m.visible = false));
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(bgRT);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.setRenderTarget(prev);
      glassMeshes.forEach((m, i) => (m.visible = vis[i]));
      shared.uRefractOn.value = 1;
      stage.render(t);
    },
    sfx: spec.sfx,
  };
}
