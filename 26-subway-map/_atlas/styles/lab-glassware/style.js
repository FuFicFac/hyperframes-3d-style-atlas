// styles/lab-glassware/style.js — "Lab Glassware": a bright clean laboratory bench in soft daylight.
// Everything is synchronous and seeded. Time enters only through the set/update hooks the scene calls from renderAt,
// and style.render(t) rebuilds the refraction source inside the same call (nothing is carried between frames).
//
// GLASS (after glass-light / terrarium): every vessel is ONE closed glass shell (outer wall up, rounded rim, inner wall
// down, thick base) drawn with an OPAQUE refraction shader. style.render() first renders the scene WITHOUT any glass
// (and without the printed marks) into a half-float MSAA target, then the frame: each glass fragment samples that
// target at a refracted screen offset (per-channel IOR), adds Fresnel reflection of an analytic lab (window, ceiling
// strip), blue-grey edge darkening and a bright rim line. Glass writes depth, so nothing inside can sort wrong; glass
// never shows other glass through it (the pre-pass hides all of it).
//
// LIQUID: one lathe of the vessel's inner profile per vessel, clipped by a WORLD-horizontal plane (the level), so a
// tilted vessel's liquid stays level. Front faces are the wall (dark meniscus band, back-lit middle, floor caustic);
// back faces seen through the cut are re-projected onto the plane (ray-plane hit, gl_FragDepth) and shaded as the
// surface: Fresnel lab reflection, meniscus ring, ripples. Colour per fragment = base | density layers | swirl arms
// (two incoming colours) | a spreading reaction front | a fading drop bloom. A FOAM variant of the same body sits on top.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel } from "../../kit/text.js";
import { rng, clamp, lerp, TAU } from "../../kit/time.js";
import { blobTexture, uploadTexture } from "../../kit/textures.js";
import { screenCanvas, projectToScreen } from "../../kit/overlay.js";
import { contactShadow } from "../../kit/builders.js";
import { GLSL_SAFE } from "../../kit/materials.js";
import * as liquids from "./liquids.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC, liquids };

const lin = (hex) => new THREE.Color(hex);
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/** a 2D canvas that is safe to bake into a texture (deterministic CPU raster: willReadFrequently). */
function textCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return { c, ctx };
}
function rrPath(x, X, Y, W, H, r) {
  x.beginPath(); x.moveTo(X + r, Y); x.lineTo(X + W - r, Y); x.quadraticCurveTo(X + W, Y, X + W, Y + r); x.lineTo(X + W, Y + H - r);
  x.quadraticCurveTo(X + W, Y + H, X + W - r, Y + H); x.lineTo(X + r, Y + H); x.quadraticCurveTo(X, Y + H, X, Y + H - r); x.lineTo(X, Y + r);
  x.quadraticCurveTo(X, Y, X + r, Y); x.closePath();
}

// ===================================================================== shaders ==========================
const ENV_GLSL = /* glsl */ `
uniform vec3 uPD[4]; uniform vec3 uPU[4]; uniform vec3 uPV[4]; uniform vec3 uPC[4]; uniform vec2 uPS[4];
uniform float uPanelSoft; uniform vec3 uRoom; uniform vec3 uFloorC; uniform float uEnv;
vec3 envAt(vec3 R){
  vec3 c = mix(uFloorC * 0.85, uRoom, smoothstep(-0.25, 0.25, R.y));
  for (int i = 0; i < 4; i++) {
    float dd = dot(R, uPD[i]);
    if (dd > 0.05) {
      float u = dot(R, uPU[i]) / dd, v = dot(R, uPV[i]) / dd;
      float m = (1.0 - smoothstep(uPS[i].x * (1.0 - uPanelSoft), uPS[i].x, abs(u))) * (1.0 - smoothstep(uPS[i].y * (1.0 - uPanelSoft), uPS[i].y, abs(v)));
      c += uPC[i] * m;
    }
  }
  return c * uEnv;
}`;
const NOISE_GLSL = /* glsl */ `
float gh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gh(i), gh(i + vec3(1,0,0)), f.x), mix(gh(i + vec3(0,1,0)), gh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gh(i + vec3(0,0,1)), gh(i + vec3(1,0,1)), f.x), mix(gh(i + vec3(0,1,1)), gh(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec3 gh3(vec3 p){ return vec3(gh(p), gh(p + 19.19), gh(p + 47.31)); }
// cellular: x = F1, y = F2
vec2 cells(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); float d1 = 8.0, d2 = 8.0;
  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++) {
    vec3 g = vec3(float(a), float(b), float(c)); vec3 o = gh3(i + g); vec3 r = g + o - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; } }
  return vec2(sqrt(d1), sqrt(d2)); }`;

const BASIC_VERT = /* glsl */ `
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec4 vClip;
void main(){
  vec4 lp = vec4(position, 1.0); vec3 nn = normal;
#ifdef USE_INSTANCING
  lp = instanceMatrix * lp; nn = mat3(instanceMatrix) * nn;
#endif
  vec4 wp = modelMatrix * lp;
  vW = wp.xyz; vL = position; vN = mat3(modelMatrix) * nn;
  gl_Position = projectionMatrix * viewMatrix * wp; vClip = gl_Position;
}`;

const GLASS_FRAG = /* glsl */ `
uniform sampler2D tBg; uniform float uRefractOn;
uniform vec3 uIor; uniform float uRefract; uniform float uCap; uniform vec3 uTint; uniform vec3 uEdgeTint; uniform float uEdgeDark; uniform float uEdgeK;
uniform float uFresPow; uniform float uFresMin; uniform float uRimLine; uniform float uRimAt; uniform float uRimW; uniform vec3 uRimC;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec4 vClip;
${GLSL_SAFE}
${ENV_GLSL}
void main(){
  vec3 N = safeNorm(vN);
  vec3 V = safeNorm(vW - cameraPosition);
  float ndv = clamp(-dot(N, V), 0.0, 1.0);
  float fres = mix(uFresMin, 1.0, safePow(1.0 - ndv, uFresPow));
  vec3 refl = envAt(reflect(V, N));
  vec3 trans;
  if (uRefractOn > 0.5) {
    vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
    vec3 Nv = safeNorm((viewMatrix * vec4(N, 0.0)).xyz);
    vec3 Vv = safeNorm((viewMatrix * vec4(V, 0.0)).xyz);
    vec3 Tr = refract(Vv, Nv, 1.0 / uIor.r), Tg = refract(Vv, Nv, 1.0 / uIor.g), Tb = refract(Vv, Nv, 1.0 / uIor.b);
    vec2 oR = (Tr.xy - Vv.xy) * uRefract, oG = (Tg.xy - Vv.xy) * uRefract, oB = (Tb.xy - Vv.xy) * uRefract;
    oR *= min(1.0, uCap / max(length(oR), 1e-5)); oG *= min(1.0, uCap / max(length(oG), 1e-5)); oB *= min(1.0, uCap / max(length(oB), 1e-5));
    trans.r = texture2D(tBg, clamp(suv + oR, 0.002, 0.998)).r;
    trans.g = texture2D(tBg, clamp(suv + oG, 0.002, 0.998)).g;
    trans.b = texture2D(tBg, clamp(suv + oB, 0.002, 0.998)).b;
  } else {
    trans = uRoom;
  }
  float graze = safePow(1.0 - ndv, uEdgeK);
  vec3 body = mix(uTint, uEdgeTint, clamp(graze * 1.7, 0.0, 1.0));
  float tf = (1.0 - fres) * (1.0 - uEdgeDark * graze);
  vec3 col = trans * body * tf + refl * fres;
  float rim = exp(-pow((ndv - uRimAt) / uRimW, 2.0));
  col += uRimC * rim * uRimLine;
  gl_FragColor = vec4(col, 1.0);
}`;

const LIQUID_FRAG = /* glsl */ `
uniform float uLevel; uniform float uMen; uniform float uMenDark; uniform float uMenW; uniform float uLow;
uniform mat4 uInv; uniform float uR[48]; uniform float uRy0; uniform float uRy1; uniform float uFloorY;
uniform vec3 uCol; uniform vec3 uColA; uniform vec3 uColB; uniform float uSwirl; uniform float uSwirlPhase; uniform vec3 uSwirlK;
uniform vec3 uReactCol; uniform vec3 uReactPos; uniform float uReactR;
uniform vec3 uDropCol; uniform vec3 uDropPos; uniform float uDropR; uniform float uDropK;
uniform int uLayerN; uniform float uLayerY[3]; uniform vec3 uLayerC[4];
uniform vec4 uRip[3];
uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uGround;
uniform float uEdge; uniform float uCentre; uniform float uGlow; uniform float uCaustic; uniform float uCapFres; uniform float uCapSpec;
uniform vec3 uFoamCol; uniform float uFoamCell; uniform float uFoamEdge;
uniform mat4 projectionMatrix;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec4 vClip;
${GLSL_SAFE}
${ENV_GLSL}
${NOISE_GLSL}
float rInAt(float y){
  float u = clamp((y - uRy0) / max(uRy1 - uRy0, 1e-4), 0.0, 1.0) * 47.0;
  int i = int(floor(u)); int j = min(i + 1, 47);
  return mix(uR[i], uR[j], u - float(i));
}
vec3 baseColour(vec3 L){
  vec3 c = uCol;
  if (uLayerN > 0) {
    c = uLayerC[0];
    for (int i = 0; i < 3; i++) if (i < uLayerN) c = mix(c, uLayerC[i + 1], smoothstep(uLayerY[i] - 0.003, uLayerY[i] + 0.003, L.y));
  }
  if (uSwirl > 0.001) {
    float ang = atan(L.z, L.x);
    float rr = length(L.xz) / max(rInAt(L.y), 1e-3);
    float s = sin(uSwirlK.x * ang + uSwirlPhase + uSwirlK.y * rr + uSwirlK.z * L.y)
            + 0.35 * sin((uSwirlK.x * 2.0 + 1.0) * ang - uSwirlPhase * 1.6 + uSwirlK.z * 1.7 * L.y);
    vec3 sc = mix(uColA, uColB, smoothstep(-0.3, 0.3, s));
    c = mix(c, sc, uSwirl);
  }
  if (uReactR > 0.0) {
    float d = length(L - uReactPos) + (gn(L * 34.0) - 0.5) * 0.06;
    c = mix(c, uReactCol, smoothstep(uReactR, uReactR - 0.05, d));
  }
  if (uDropK > 0.0) {
    float d = length(L - uDropPos) + (gn(L * 46.0) - 0.5) * 0.03;
    c = mix(c, uDropCol, uDropK * smoothstep(uDropR, uDropR * 0.35, d));
  }
  return c;
}
void main(){
  float top = uLevel + uMen;
  if (gl_FrontFacing) {
    if (vW.y > top || vW.y < uLow) discard;
    vec3 N = safeNorm(vN);
    vec3 V = safeNorm(vW - cameraPosition);
    float ndv = clamp(-dot(N, V), 0.0, 1.0);
    vec3 c = baseColour(vL);
    float dif = clamp(dot(N, uSun) * 0.5 + 0.5, 0.0, 1.0);
    vec3 col;
#ifdef FOAM
    vec2 F = cells(vL * uFoamCell);
    float edge = 1.0 - smoothstep(0.0, 0.16, F.y - F.x);
    vec3 fc = mix(uFoamCol, c, 0.12);
    col = fc * (0.82 + 0.22 * dif) * (1.0 - uFoamEdge * edge) * (0.86 + 0.14 * ndv);
    col *= 1.0 - 0.18 * smoothstep(0.02, 0.0, vW.y - uLow);
#else
    col = c * (uEdge + uCentre * ndv) * (0.82 + 0.28 * dif);
    col = mix(col, mix(c, vec3(1.0), 0.32) * 1.05, uGlow * safePow(ndv, 3.0));
    float flo = 1.0 - smoothstep(0.0, 0.035, vL.y - uFloorY);
    col += c * flo * uCaustic;
    float d = top - vW.y;
    col *= 1.0 - uMenDark * smoothstep(uMenW * 1.5, uMenW * 0.3, d) * smoothstep(0.0, uMenW * 0.3, d);
    col = mix(col, mix(c, vec3(1.0), 0.6), 0.55 * (1.0 - smoothstep(0.0, uMenW * 0.3, d)));
#endif
    gl_FragDepth = gl_FragCoord.z;
    gl_FragColor = vec4(col, 1.0);
  } else {
    if (vW.y > top) discard;
    vec3 ro = cameraPosition; vec3 rd = safeNorm(vW - ro);
    if (rd.y > -1e-4) discard;
    float tt = (uLevel - ro.y) / rd.y;
    if (tt < 0.0) discard;
    vec3 S = ro + rd * tt;
    vec3 Ls = (uInv * vec4(S, 1.0)).xyz;
    float rr = length(Ls.xz) / max(rInAt(Ls.y), 1e-3);
    if (rr > 1.04) discard;
    vec4 cp = projectionMatrix * viewMatrix * vec4(S, 1.0);
    gl_FragDepth = clamp(cp.z / cp.w * 0.5 + 0.5, 0.0, 1.0);
    vec3 c = baseColour(Ls);
    float ndv = abs(rd.y);
    vec3 col;
#ifdef FOAM
    vec2 F = cells(Ls * uFoamCell);
    float edge = 1.0 - smoothstep(0.0, 0.16, F.y - F.x);
    col = mix(uFoamCol, c, 0.08) * (1.0 - uFoamEdge * 0.8 * edge) * (0.95 + 0.1 * gn(Ls * 90.0));
    col *= 1.0 - 0.25 * smoothstep(0.9, 1.02, rr);
#else
    float rip = 0.0;
    for (int i = 0; i < 3; i++) {
      if (uRip[i].w > 0.0) {
        float d = length(Ls.xz - uRip[i].xy);
        float front = smoothstep(uRip[i].z * 0.42 + 0.03, uRip[i].z * 0.42 - 0.01, d);
        rip += uRip[i].w * sin(d * 150.0 - uRip[i].z * 16.0) * exp(-d * 10.0) * front;
      }
    }
    float fres = 0.02 + 0.98 * safePow(1.0 - ndv, 5.0);
    vec3 Nc = safeNorm(vec3(rip * 0.25, 1.0, rip * 0.18));
    vec3 refl = envAt(reflect(rd, Nc));
    col = c * (0.74 + 0.16 * (1.0 - rr * rr));
    col = mix(col, refl, clamp(fres * uCapFres + 0.05, 0.0, 1.0));
    col += refl * uCapSpec * 0.06 * safePow(clamp(1.0 - rr, 0.0, 1.0), 0.5) * step(0.0, rip);
    col += vec3(1.0) * 0.32 * smoothstep(0.88, 0.955, rr) * (1.0 - smoothstep(0.955, 0.985, rr));
    col *= 1.0 - 0.38 * smoothstep(0.972, 1.0, rr);
    col += vec3(rip) * 0.22;
#endif
    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }
}`;

const STREAM_FRAG = /* glsl */ `
uniform vec3 uCol;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec4 vClip;
${GLSL_SAFE}
${ENV_GLSL}
void main(){
  vec3 N = safeNorm(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = safeNorm(vW - cameraPosition);
  float ndv = clamp(-dot(N, V), 0.0, 1.0);
  float fres = 0.03 + 0.97 * safePow(1.0 - ndv, 4.0);
  vec3 refl = envAt(reflect(V, N));
  vec3 col = uCol * (0.5 + 0.62 * ndv) + mix(uCol, vec3(1.0), 0.4) * 0.25 * safePow(ndv, 4.0);
  col = mix(col, refl, fres * 0.6);
  gl_FragColor = vec4(col, 1.0);
}`;

const BUBBLE_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main(){ vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vV = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp; }`;
const BUBBLE_FRAG = /* glsl */ `
uniform vec3 uCol; uniform float uRim; uniform float uSpec; uniform vec3 uSun;
varying vec3 vN; varying vec3 vV;
${GLSL_SAFE}
void main(){ vec3 N = safeNorm(vN); vec3 V = safeNorm(vV);
  float ndv = clamp(-dot(N, V), 0.0, 1.0);
  float rim = safePow(1.0 - ndv, 2.0);
  float sp = safePow(max(dot(reflect(V, N), safeNorm(uSun)), 0.0), 50.0) * uSpec;
  vec3 col = mix(uCol, vec3(1.0), 0.35 + 0.5 * rim) + vec3(sp);
  float a = clamp(0.18 + rim * uRim + sp, 0.0, 0.95);
  gl_FragColor = vec4(col, a); }`;

function panelUniforms(G) {
  const PD = [], PU = [], PV = [], PC = [], PS = [];
  for (let i = 0; i < 4; i++) {
    const p = G.panels[i] ?? { dir: [0, 1, 0], size: [0, 0], intensity: 0, color: "#000000" };
    const d = V3(p.dir).normalize();
    const ref = Math.abs(d.y) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(d, ref).normalize();
    const v = new THREE.Vector3().crossVectors(u, d).normalize();
    PD.push(d); PU.push(u); PV.push(v); PC.push(lin(p.color).multiplyScalar(p.intensity)); PS.push(new THREE.Vector2(...p.size));
  }
  return { uPD: { value: PD }, uPU: { value: PU }, uPV: { value: PV }, uPC: { value: PC }, uPS: { value: PS } };
}

// ===================================================================== createStyle ======================
/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true }
 *   ALWAYS finish renderAt with style.render(t): it refreshes matrices, the liquids' local frames, runs the refraction
 *   pre-pass (glass and printed marks hidden) and then stage.render(t).
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, G = spec.glass, P = spec.palette, LQ = spec.liquid;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const { renderer, scene } = stage;

  // ---- refraction source: same-frame pre-render without glass ----
  const bgRT = new THREE.WebGLRenderTarget(Math.round(stage.width * G.prepass), Math.round(stage.height * G.prepass), { type: THREE.HalfFloatType, samples: G.samples ?? 0 });
  const envU = { uPanelSoft: { value: G.panelSoft }, uRoom: { value: lin(G.room) }, uFloorC: { value: lin(G.floor) }, uEnv: { value: G.env }, ...panelUniforms(G) };
  const glassU = {
    ...envU,
    tBg: { value: bgRT.texture }, uRefractOn: { value: 1 },
    uIor: { value: new THREE.Vector3(G.ior - G.dispersion / 2, G.ior, G.ior + G.dispersion / 2) }, uRefract: { value: G.refract }, uCap: { value: G.cap },
    uTint: { value: lin(G.tint) }, uEdgeTint: { value: lin(G.edgeTint) }, uEdgeDark: { value: G.edgeDark }, uEdgeK: { value: G.edgeK },
    uFresPow: { value: G.fresnelPow }, uFresMin: { value: G.fresnelMin },
    uRimLine: { value: G.rimLine }, uRimAt: { value: G.rimAt }, uRimW: { value: G.rimWidth }, uRimC: { value: lin(G.rimColor) },
  };
  const glassMat = new THREE.ShaderMaterial({ uniforms: glassU, vertexShader: BASIC_VERT, fragmentShader: GLASS_FRAG, side: THREE.FrontSide });
  glassMat.name = "glass";
  const hidden = [];        // glass shells + printed marks: hidden in the pre-pass
  const liquidsList = [];   // liquid bodies whose uInv is refreshed in render()
  const sunDir = V3(LQ.sun).normalize();

  // =================================================================== liquids ==========================
  /** liquidMaterial(prof, { foam }) -> ShaderMaterial (uniform set described in LIQUID_FRAG). */
  function liquidMaterial(prof, o = {}) {
    const S = LQ.swirl;
    const u = {
      ...envU,
      uLevel: { value: prof.floor }, uMen: { value: LQ.meniscus * (o.menScale ?? 1) }, uMenDark: { value: LQ.menDark }, uMenW: { value: LQ.menWidth * (o.menScale ?? 1) },
      uLow: { value: -1e3 }, uInv: { value: new THREE.Matrix4() },
      uR: { value: prof.rTable(48).map((r) => Math.max(0.001, r - 0.0025)) }, uRy0: { value: prof.floor }, uRy1: { value: prof.top }, uFloorY: { value: prof.floor },
      uCol: { value: lin(o.color ?? P.A) }, uColA: { value: lin(P.A) }, uColB: { value: lin(P.B) }, uSwirl: { value: 0 }, uSwirlPhase: { value: 0 },
      uSwirlK: { value: new THREE.Vector3(S.arms, S.twist, S.wind) },
      uReactCol: { value: lin(P.react) }, uReactPos: { value: new THREE.Vector3() }, uReactR: { value: 0 },
      uDropCol: { value: lin(P.C) }, uDropPos: { value: new THREE.Vector3() }, uDropR: { value: 0 }, uDropK: { value: 0 },
      uLayerN: { value: 0 }, uLayerY: { value: [0, 0, 0] }, uLayerC: { value: [lin("#ffffff"), lin("#ffffff"), lin("#ffffff"), lin("#ffffff")] },
      uRip: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] },
      uSun: { value: sunDir.clone() }, uSky: { value: lin(LQ.sky) }, uGround: { value: lin(LQ.ground) },
      uEdge: { value: LQ.edge }, uCentre: { value: LQ.centre }, uGlow: { value: LQ.glow }, uCaustic: { value: LQ.caustic },
      uCapFres: { value: LQ.capFresnel }, uCapSpec: { value: LQ.capSpec },
      uFoamCol: { value: lin(P.foam) }, uFoamCell: { value: LQ.foam.cell }, uFoamEdge: { value: LQ.foam.edge },
    };
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: BASIC_VERT, fragmentShader: LIQUID_FRAG, side: THREE.DoubleSide, defines: o.foam ? { FOAM: 1 } : {} });
    m.name = o.foam ? "foam" : "liquid";
    return m;
  }
  /** lathe of the inner profile (inset), closed at the floor, open at the top. */
  function liquidGeometry(prof, inset = 0.0025, radial = 72) {
    const pts = [new THREE.Vector2(1e-4, prof.floor)];
    const n = 44;
    for (let i = 0; i <= n; i++) {
      const y = lerp(prof.floor, prof.top, i / n);
      const r = Math.max(0.0012, prof.rIn(y) - inset);
      if (i === 0) pts.push(new THREE.Vector2(r * 0.96, prof.floor));
      pts.push(new THREE.Vector2(r, y + (i === 0 ? 0.0015 : 0)));
    }
    return new THREE.LatheGeometry(pts, radial);
  }
  /**
   * liquid(prof, { color, foam, layers }) -> Mesh (vessel-local). userData.set({ level (WORLD y), low, color, colA, colB,
   *   swirl, phase, reactR, reactPos, reactCol, dropK, dropR, dropPos, dropCol, layers: [{ y (local top), color }], rip })
   *   rip: up to 3 [x, z, time, amp] (vessel local). The style refreshes uInv every frame in render().
   */
  function liquid(prof, o = {}) {
    const mat = liquidMaterial(prof, o);
    const m = new THREE.Mesh(liquidGeometry(prof, o.foam ? 0.0035 : 0.0025), mat);
    m.name = o.foam ? "foam" : "liquid"; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
    m.renderOrder = o.foam ? 2 : 1;
    const U = mat.uniforms;
    const setCol = (dst, v) => { if (v != null) dst.value.copy(typeof v === "string" ? lin(v) : v); };
    m.userData.set = (s = {}) => {
      if (s.level != null) U.uLevel.value = s.level;
      if (s.low != null) U.uLow.value = s.low;
      if (s.men != null) { U.uMen.value = s.men; U.uMenW.value = Math.max(0.002, s.men * (LQ.menWidth / LQ.meniscus)); }
      setCol(U.uCol, s.color); setCol(U.uColA, s.colA); setCol(U.uColB, s.colB);
      if (s.swirl != null) U.uSwirl.value = s.swirl;
      if (s.phase != null) U.uSwirlPhase.value = s.phase;
      if (s.reactR != null) U.uReactR.value = s.reactR;
      if (s.reactPos) U.uReactPos.value.set(...s.reactPos);
      setCol(U.uReactCol, s.reactCol);
      if (s.dropK != null) U.uDropK.value = s.dropK;
      if (s.dropR != null) U.uDropR.value = s.dropR;
      if (s.dropPos) U.uDropPos.value.set(...s.dropPos);
      setCol(U.uDropCol, s.dropCol);
      if (s.layers) {
        U.uLayerN.value = Math.max(0, s.layers.length - 1);
        s.layers.forEach((L, i) => { if (i < 4) U.uLayerC.value[i].copy(lin(L.color)); if (i < 3) U.uLayerY.value[i] = L.y; });
      }
      if (s.rip) for (let i = 0; i < 3; i++) { const r = s.rip[i]; U.uRip.value[i].set(r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0, r?.[3] ?? 0); }
      m.visible = s.visible ?? true;
    };
    liquidsList.push(m);
    return m;
  }

  // =================================================================== glass + printed marks ===========
  function outerR(prof, y) {
    const D = prof.dims;
    if (prof.kind === "flask") { const yN = D.H - D.neckH, yC = D.corner * 0.9; return y >= yN ? D.neckR : lerp(D.R, D.neckR, clamp((y - yC) / (yN - yC))); }
    return D.R;
  }
  /** glassShell(prof, radial) -> Mesh: the closed glass shell (refraction shader). */
  function glassShell(prof, radial = 96) {
    const pts = prof.shell.map(([r, y]) => new THREE.Vector2(r, y));
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, radial), glassMat);
    m.name = `glass:${prof.kind}`; m.castShadow = false; m.receiveShadow = false;
    hidden.push(m);
    return m;
  }
  /**
   * marks(prof, { yA, yB, span, ppm, ticks: [{ y (local), len 0..1, text }], patch: { y0, y1, text, color, x0, x1 } })
   *   -> Mesh: printed enamel graduations + an enamel label patch on a front arc of the outer wall (transparent decal).
   */
  function marks(prof, o) {
    const Gd = spec.gradu, span = o.span ?? Gd.span, ppm = o.ppm ?? 1500;
    const R = outerR(prof, (o.yA + o.yB) / 2);
    const W = Math.min(1024, Math.round(span * R * ppm)), H = Math.min(2048, Math.round((o.yB - o.yA) * ppm));
    const sy = H / (o.yB - o.yA), sx = W / (span * R);
    const { c, ctx } = textCanvas(W, H);
    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.globalAlpha = 1;
      const ink = o.ink ?? Gd.ink;
      ctx.fillStyle = ink; ctx.strokeStyle = ink;
      const x0 = Math.round(W * (o.x0 ?? 0.16)), lw = Math.max(2, Math.round(0.0032 * sx));
      for (const tk of o.ticks) {
        const y = Math.round((o.yB - tk.y) * sy);
        const len = Math.round(W * (o.lenK ?? 0.42) * tk.len);
        ctx.fillRect(x0, y - Math.floor(lw / 2), len, lw);
        if (tk.text) {
          const cap = Math.round((o.cap ?? 0.034) * sy);
          ctx.font = `${Gd.weight} ${cap}px ${Gd.font}`; ctx.textBaseline = "middle"; ctx.textAlign = "left";
          ctx.fillText(tk.text, x0 + len + Math.round(cap * 0.3), y + Math.round(cap * 0.04));
        }
      }
      if (o.patch) {
        const Q = o.patch, py0 = Math.round((o.yB - Q.y1) * sy), py1 = Math.round((o.yB - Q.y0) * sy);
        const px0 = Math.round(W * (Q.x0 ?? 0.12)), px1 = Math.round(W * (Q.x1 ?? 0.88));
        const rad = Math.round(Math.min(px1 - px0, py1 - py0) * 0.16);
        ctx.fillStyle = spec.enamel.patch; rrPath(ctx, px0, py0, px1 - px0, py1 - py0, rad); ctx.fill();
        ctx.lineWidth = Math.max(2, Math.round(lw * 0.8)); ctx.strokeStyle = ink; rrPath(ctx, px0 + lw, py0 + lw, px1 - px0 - 2 * lw, py1 - py0 - 2 * lw, Math.max(2, rad - lw)); ctx.stroke();
        const cap = Math.round((py1 - py0) * (Q.cap ?? 0.62));
        ctx.font = `${spec.enamel.weight} ${cap}px ${spec.enamel.font}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = Q.color ?? ink;
        ctx.fillText(Q.text, Math.round((px0 + px1) / 2), Math.round((py0 + py1) / 2 + cap * 0.05));
      }
    };
    draw();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    uploadTexture(renderer, tex);
    if (typeof document !== "undefined" && document.fonts?.ready) document.fonts.ready.then(() => { draw(); uploadTexture(renderer, tex); });
    const n = 24, pts = [];
    for (let i = 0; i <= n; i++) { const y = lerp(o.yA, o.yB, i / n); pts.push(new THREE.Vector2(outerR(prof, y) + 0.0018, y)); }
    const geo = new THREE.LatheGeometry(pts, 32, -span / 2, span);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.FrontSide });
    mat.name = "marks";
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 6; m.name = "marks";
    hidden.push(m);
    return m;
  }
  /** tick list from printed units: every `minor`, longer every `mid`, numbered every `major` (0..max). y from heightFor. */
  function unitTicks(prof, { max, minor, mid, major, from = 0, reading = null }) {
    const out = [];
    for (let u = from; u <= max + 1e-6; u += minor) {
      const k = Math.round(u * 1000) / 1000;
      const y = reading ? reading(k) : liquids.heightFor(prof, liquids.fromUnits(k));
      const isMaj = Math.abs(k / major - Math.round(k / major)) < 1e-6, isMid = Math.abs(k / mid - Math.round(k / mid)) < 1e-6;
      out.push({ y, len: isMaj ? 1 : isMid ? 0.68 : 0.42, text: isMaj ? String(k) : null });
    }
    return out;
  }

  // =================================================================== vessels ==========================
  const blob = blobTexture();
  /** ground(prof, color): contact shadow + coloured light pool on the bench (scene-level; follows the vessel). */
  function ground(prof, color) {
    const g = new THREE.Group(); g.name = "vessel-ground";
    const R = prof.dims.footR ?? prof.dims.R;
    const sh = contactShadow({ w: R * 2.6, d: R * 2.6, opacity: 0.26, color: "#4a4e55", y: 0.0015 });
    const pm = new THREE.MeshBasicMaterial({ map: blob, color: lin(color), transparent: true, opacity: LQ.pool.opacity, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    pm.name = "pool";
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(R * LQ.pool.size, R * LQ.pool.size * 1.25), pm);
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.002; pool.renderOrder = 2;
    g.add(sh, pool);
    g.userData = { sh, pool, R };
    // light pool offset away from the sun (shadow side) on the bench
    const off = new THREE.Vector2(-sunDir.x, -sunDir.z).normalize().multiplyScalar(R * LQ.pool.offset);
    g.userData.set = ({ x, z, y = 0, lift = 0, fill = 0, color: c } = {}) => {
      g.position.set(x, y, z);
      const k = 1 - clamp(lift * 1.4);
      sh.material.opacity = 0.26 * k;
      pool.position.set(off.x, 0.002, off.y);
      pm.opacity = LQ.pool.opacity * k * clamp(fill * 1.6);
      if (c) pm.color.copy(typeof c === "string" ? lin(c) : c);
      g.visible = k > 0.01;
    };
    return g;
  }
  /**
   * vessel(kind, { color, foam, bubbles, marks, dims }) -> Group (origin = centre of the base on the bench).
   *   userData: { profile, glass, liquid, foam?, bubbles?, marks?, ground (add it to the scene yourself),
   *   setPose({ origin, rotZ }) }. Kinds: beaker | cylinder | flask | tube | burette | funnel.
   */
  function vessel(kind, o = {}) {
    const prof = liquids.vesselProfile(kind, o.dims ?? {});
    const g = new THREE.Group(); g.name = `vessel:${kind}`;
    const shell = glassShell(prof, kind === "tube" || kind === "burette" ? 64 : 96);
    g.add(shell);
    const ud = { profile: prof, glass: shell };
    if (kind === "cylinder") {     // hexagonal glass foot
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(prof.dims.footR * 0.93, prof.dims.footR, prof.dims.foot, 6, 1), glassMat);
      foot.position.y = prof.dims.foot / 2; foot.rotation.y = Math.PI / 6; foot.name = "glass:foot";
      hidden.push(foot); g.add(foot);
    }
    if (kind !== "funnel") {
      ud.liquid = liquid(prof, { color: o.color, menScale: kind === "tube" || kind === "burette" ? 0.5 : 1 });
      g.add(ud.liquid);
    }
    if (o.foam) { ud.foam = liquid(prof, { foam: true }); ud.foam.visible = false; g.add(ud.foam); }
    if (o.bubbles) { ud.bubbles = bubbles(o.bubbles, { color: o.color }); g.add(ud.bubbles); }
    if (o.marks) { ud.marks = marks(prof, o.marks); g.add(ud.marks); }
    ud.ground = ground(prof, o.color ?? P.A);
    ud.setPose = ({ origin, rotZ = 0 }) => { g.position.set(origin[0], origin[1], origin[2]); g.rotation.set(0, 0, rotZ); };
    g.userData = ud;
    return g;
  }
  const beaker = (o = {}) => vessel("beaker", o);
  const flask = (o = {}) => vessel("flask", o);
  const cylinder = (o = {}) => vessel("cylinder", o);
  const testTube = (o = {}) => vessel("tube", o);
  const funnel = (o = {}) => vessel("funnel", o);
  /** burette(o) -> vessel("burette") + PTFE stopcock barrel, blue key and a full liquid thread in the tip. */
  function burette(o = {}) {
    const v = vessel("burette", o), D = v.userData.profile.dims;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(D.R * 0.62, D.R * 0.62, D.R * 3.2, 24), materials.ptfe);
    barrel.rotation.z = Math.PI / 2; barrel.position.y = D.tipH * 0.62; barrel.castShadow = true;
    const key = new THREE.Mesh(new RoundedBoxGeometry(D.R * 0.7, D.R * 2.6, D.R * 0.5, 2, D.R * 0.15), materials.stopcock);
    key.position.set(D.R * 1.9, D.tipH * 0.62, 0); key.castShadow = true;
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(D.tipR * 0.5, D.R * 0.42, D.tipH * 0.98, 12), new THREE.MeshBasicMaterial({ color: lin(o.color ?? P.C) }));
    thread.position.y = D.tipH * 0.49; thread.name = "tip-liquid";
    v.add(barrel, key, thread);
    v.userData.tipLiquid = thread;
    return v;
  }

  // =================================================================== moving liquid ===================
  const streamMatFor = (color) => {
    const m = new THREE.ShaderMaterial({ uniforms: { ...envU, uCol: { value: lin(color) } }, vertexShader: BASIC_VERT, fragmentShader: STREAM_FRAG, side: THREE.DoubleSide });
    m.name = "stream"; return m;
  };
  /**
   * stream({ color, n = 24, radial = 12 }) -> Mesh (world space): a tapered liquid tube. userData.set(sp | null, color?)
   *   with sp = liquids.streamPoints(...) ({ pts, radii }).
   */
  function stream(o = {}) {
    const n = o.n ?? 24, radial = o.radial ?? 12;
    const pos = new Float32Array(n * radial * 3), nor = new Float32Array(n * radial * 3), idx = [];
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); geo.setIndex(idx);
    const mat = streamMatFor(o.color ?? P.A);
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.name = "stream"; m.castShadow = false;
    m.userData.set = (sp, color) => {
      m.visible = !!sp;
      if (color) mat.uniforms.uCol.value.copy(typeof color === "string" ? lin(color) : color);
      if (!sp) return;
      const pts = sp.pts, rr = sp.radii;
      let Nv = [0, 0, 1];
      for (let i = 0; i < n; i++) {
        const A = pts[Math.max(0, i - 1)], B = pts[Math.min(n - 1, i + 1)];
        let t = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        const tl = Math.hypot(t[0], t[1], t[2]) || 1; t = [t[0] / tl, t[1] / tl, t[2] / tl];
        const d = Nv[0] * t[0] + Nv[1] * t[1] + Nv[2] * t[2];
        let N = [Nv[0] - t[0] * d, Nv[1] - t[1] * d, Nv[2] - t[2] * d];
        const nl = Math.hypot(N[0], N[1], N[2]) || 1; N = [N[0] / nl, N[1] / nl, N[2] / nl];
        const Bv = [t[1] * N[2] - t[2] * N[1], t[2] * N[0] - t[0] * N[2], t[0] * N[1] - t[1] * N[0]];
        const rad = Math.max(0.0004, rr[i]);
        for (let j = 0; j < radial; j++) {
          const th = (j / radial) * TAU, cs = Math.cos(th), sn = Math.sin(th);
          const dx = N[0] * cs + Bv[0] * sn, dy = N[1] * cs + Bv[1] * sn, dz = N[2] * cs + Bv[2] * sn;
          const q = (i * radial + j) * 3;
          pos[q] = pts[i][0] + dx * rad; pos[q + 1] = pts[i][1] + dy * rad; pos[q + 2] = pts[i][2] + dz * rad;
          nor[q] = dx; nor[q + 1] = dy; nor[q + 2] = dz;
        }
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
      geo.computeBoundingSphere();
    };
    m.visible = false;
    return m;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
  /** drops({ color, capacity = 8, r }) -> InstancedMesh (world): userData.set(liquids.dropState(...)). */
  function drops(o = {}) {
    const cap = o.capacity ?? 8, r = o.r ?? 0.014;
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), streamMatFor(o.color ?? P.C), cap);
    mesh.frustumCulled = false; mesh.name = "drops"; mesh.castShadow = false;
    mesh.userData.set = (list) => {
      for (let i = 0; i < cap; i++) {
        const d = list[i];
        if (!d) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); continue; }
        _q.identity();
        _m.compose(_p.set(d.p[0], d.p[1] - r * (d.stretch - 1) * 0.4, d.p[2]), _q, _s.set(r * d.s / Math.sqrt(d.stretch), r * d.s * d.stretch, r * d.s / Math.sqrt(d.stretch)));
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    mesh.userData.set([]);
    return mesh;
  }
  /**
   * bubbles(capacity, { color }) -> InstancedMesh (vessel-local, rendered in the pre-pass and seen through the glass):
   *   userData.set([{ y, theta, r, pop }], rWall(y), color?) — small spheres pressed against the inner front wall.
   */
  function bubbles(capacity, o = {}) {
    const B = LQ.bubble;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: lin(o.color ?? P.A).lerp(lin("#ffffff"), B.tint) }, uRim: { value: B.rim }, uSpec: { value: B.spec }, uSun: { value: sunDir.clone() } },
      vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG, transparent: true, depthWrite: false,
    });
    mat.name = "bubble";
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), mat, capacity);
    mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.name = "bubbles"; mesh.userData.noDepth = true;
    mesh.userData.set = (list, rWall, color) => {
      if (color) mat.uniforms.uCol.value.copy(typeof color === "string" ? lin(color) : color).lerp(lin("#ffffff"), B.tint);
      for (let i = 0; i < capacity; i++) {
        const b = list[i];
        if (!b) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); continue; }
        const rw = rWall(b.y) - 0.0025 - b.r * 0.35, k = b.r * (1 - 0.6 * b.pop);
        _q.identity();
        _m.compose(_p.set(Math.sin(b.theta) * rw, b.y, Math.cos(b.theta) * rw), _q, _s.set(k, k, k));
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    mesh.userData.set([], () => 0);
    return mesh;
  }

  // =================================================================== set ==============================
  /** tile wall texture: square pale tiles with soft grout and a faint per-tile tone (drawn once, tileable). */
  function tileTexture(seed = 3) {
    const B = spec.bench, N = 1024, tiles = 6, tp = N / tiles, r = rng(seed);
    const { c, ctx } = textCanvas(N, N);
    ctx.fillStyle = P.grout; ctx.fillRect(0, 0, N, N);
    const gp = Math.max(2, Math.round((B.grout / B.tile) * tp));
    for (let i = 0; i < tiles; i++) for (let j = 0; j < tiles; j++) {
      const x = i * tp + gp / 2, y = j * tp + gp / 2, w = tp - gp;
      const base = new THREE.Color(r.chance(0.5) ? P.tile : P.tileAlt).offsetHSL(0, 0, r.range(-0.008, 0.008));
      const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + w);
      g.addColorStop(0, "#" + base.clone().offsetHSL(0, 0, 0.018).getHexString());
      g.addColorStop(1, "#" + base.clone().offsetHSL(0, 0, -0.012).getHexString());
      ctx.fillStyle = g; rrPath(ctx, x, y, w, w, gp * 0.9); ctx.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    uploadTexture(renderer, t);
    return t;
  }
  /** bench(o) -> Group: white worktop slab with a rounded front nosing, and the pale tiled wall behind it. */
  function bench(o = {}) {
    const B = { ...spec.bench, ...o }, g = new THREE.Group(); g.name = "bench";
    const top = new THREE.Mesh(new RoundedBoxGeometry(B.w, B.h, B.d, 3, 0.02), materials.bench);
    top.position.set(0, -B.h / 2, B.z); top.receiveShadow = true; top.castShadow = true;
    const front = new THREE.Mesh(new THREE.BoxGeometry(B.w, 0.9, 0.04), materials.benchEdge);
    front.position.set(0, -B.h - 0.45, B.z + B.d / 2 - 0.06); front.receiveShadow = true;
    const tex = tileTexture(B.seed ?? 3);
    const span = B.tile * 6;
    tex.repeat.set(B.w / span, 3 / span);
    const wallMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0, color: "#ffffff" });
    wallMat.name = "tiles";
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(B.w, 3), wallMat);
    wall.position.set(0, 1.5 - B.h, B.wallZ); wall.receiveShadow = true;
    g.add(top, front, wall);
    return g;
  }
  /** stand(o) -> Group: enamel base plate, steel rod, boss head, clamp arm and jaws holding a burette. userData.holdAt = [x,y,z] (clamp centre, local). */
  function stand(o = {}) {
    const S = { ...spec.stand, ...o }, g = new THREE.Group(); g.name = "stand";
    const base = new THREE.Mesh(new RoundedBoxGeometry(S.baseW, S.baseH, S.baseD, 3, 0.012), materials.standBase);
    base.castShadow = base.receiveShadow = true;
    // the rod stands off to one side behind the vessel, so it never runs down through the glass in a front view
    const rodX = S.rodX, rodZ = S.rodZ;
    base.position.set(rodX * 0.35, S.baseH / 2, rodZ * 0.3);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(S.rodR, S.rodR, S.rodH, 20), materials.steel);
    rod.position.set(rodX, S.rodH / 2, rodZ); rod.castShadow = true;
    const clampY = o.clampY ?? 1.62, reach = Math.hypot(rodX, rodZ), yaw = Math.atan2(-rodX, -rodZ);
    const boss = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.07, 0.06, 2, 0.008), materials.clampPad);
    boss.position.set(rodX, clampY, rodZ); boss.rotation.y = yaw; boss.castShadow = true;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, reach - 0.03, 12), materials.steel);
    arm.rotation.set(Math.PI / 2, 0, 0); arm.position.set(0, 0, (reach - 0.03) / 2);
    const armG = new THREE.Group(); armG.position.set(rodX, clampY, rodZ); armG.rotation.y = yaw; armG.add(arm); arm.castShadow = true;
    const jawL = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.05, 0.022, 2, 0.006), materials.clampPad);
    const jawR = jawL.clone();
    jawL.position.set(0, clampY, -0.042); jawR.position.set(0, clampY, 0.042);
    jawL.castShadow = jawR.castShadow = true;
    g.add(armG);
    g.add(base, rod, boss, jawL, jawR);
    g.userData.holdAt = [0, clampY, 0];
    g.userData.baseTop = S.baseH;
    return g;
  }
  /** rack(o) -> Group: enamel-painted test-tube rack (base, two plates, end posts). userData.slots = [[x,y,z]] tube origins (local). */
  function rack(o = {}) {
    const R = { ...spec.rack, ...o }, g = new THREE.Group(); g.name = "rack";
    const plate = (y, h) => { const m = new THREE.Mesh(new RoundedBoxGeometry(R.w, h, R.d, 2, 0.006), materials.rack); m.position.y = y; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    plate(0.012, 0.024);
    plate(R.h * 0.42, 0.016);
    plate(R.h, 0.02);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new RoundedBoxGeometry(0.026, R.h, R.d * 0.92, 2, 0.006), materials.rack);
      post.position.set(sx * (R.w / 2 - 0.013), R.h / 2, 0); post.castShadow = true; g.add(post);
    }
    g.userData.slots = Array.from({ length: R.holes }, (_, i) => [lerp(-R.w / 2 + 0.08, R.w / 2 - 0.08, i / (R.holes - 1)), 0.026, 0]);
    return g;
  }

  // =================================================================== labels (overlay) ================
  /** caption(text) -> overlay enamel plate for one beat label (pre-drawn once); userData.show(alpha). One fixed place (spec.caption). */
  function caption(text, o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1300, Hp = Q.h + 20;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = x.measureText(st.text).width, pad = Math.round(Q.cap * 0.62), bar = 14;
      const pw = Math.min(W - 16, Math.round(tw + pad * 2 + bar + 10)), ph = Q.h, ox = 4, oy = 4;
      x.fillStyle = "rgba(40,60,80,0.14)"; rrPath(x, ox + 2, oy + 6, pw, ph, 16); x.fill();
      x.fillStyle = Q.card; rrPath(x, ox, oy, pw, ph, 16); x.fill();
      x.strokeStyle = "rgba(29,42,68,0.22)"; x.lineWidth = 2; rrPath(x, ox + 1, oy + 1, pw - 2, ph - 2, 15); x.stroke();
      x.fillStyle = Q.band; rrPath(x, ox + 16, oy + 18, bar - 4, ph - 36, 4); x.fill();
      x.textAlign = "left"; x.textBaseline = "middle"; x.fillStyle = Q.ink;
      x.fillText(st.text, Math.round(ox + bar + pad + 10), Math.round(oy + ph / 2 + 2));
    }, { upload: true });
    mesh.userData.canvas.getContext("2d", { willReadFrequently: true });
    mesh.userData.set({ text, band: Q.band });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (a) => mesh.userData.opacity(a);
    mesh.userData.opacity(0);
    return mesh;
  }
  /** stamp({ text = "SAMPLE DATA" }) -> overlay rubber-stamp tag (right-aligned at spec.stamp.x), always visible. */
  function stamp(o = {}) {
    const Q = { ...spec.stamp, ...o };
    const Wp = 360, Hp = 64;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H) => {
      x.font = `700 ${Q.cap}px ${Q.font}`;
      if ("letterSpacing" in x) x.letterSpacing = `${Math.round(Q.cap * 0.12)}px`;
      const tw = x.measureText(Q.text).width + Q.cap * 0.12, pw = Math.round(tw + Q.cap * 1.1), ph = Math.round(Q.cap * 1.75);
      const ox = W - pw - 4, oy = Math.round((H - ph) / 2);
      x.globalAlpha = 0.92;
      x.strokeStyle = Q.color; x.lineWidth = 3; rrPath(x, ox, oy, pw, ph, 6); x.stroke();
      x.lineWidth = 1.2; rrPath(x, ox + 5, oy + 5, pw - 10, ph - 10, 4); x.stroke();
      x.fillStyle = Q.color; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(Q.text, Math.round(ox + pw / 2 + Q.cap * 0.06), Math.round(oy + ph / 2 + 1));
    }, { upload: true });
    mesh.userData.canvas.getContext("2d", { willReadFrequently: true });
    mesh.userData.set({ text: Q.text });
    mesh.userData.place(Q.x - Wp, Q.y);
    mesh.userData.opacity(1);
    return mesh;
  }
  /**
   * readout(text, { side = "right", color }) -> overlay enamel reading tag with a pointer, anchored to a world point
   *   each frame: userData.update({ at: [x,y,z], alpha }). The pointer tip sits on the anchor (e.g. the meniscus).
   */
  function readout(text, o = {}) {
    const Q = { ...spec.readout, ...o }, side = o.side ?? "right";
    const cap = 40, Hp = 74, Wp = 330;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      x.font = `700 ${cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width), arrow = 22, pw = tw + 44 + 16, ph = 56, oy = Math.round((H - ph) / 2);
      const ox = side === "right" ? arrow + 2 : W - arrow - 2 - pw;
      x.fillStyle = "rgba(40,60,80,0.16)"; rrPath(x, ox + 2, oy + 4, pw, ph, 12); x.fill();
      x.fillStyle = Q.card; rrPath(x, ox, oy, pw, ph, 12); x.fill();
      x.beginPath();
      if (side === "right") { x.moveTo(2, H / 2); x.lineTo(ox + 1, H / 2 - 14); x.lineTo(ox + 1, H / 2 + 14); }
      else { x.moveTo(W - 2, H / 2); x.lineTo(ox + pw - 1, H / 2 - 14); x.lineTo(ox + pw - 1, H / 2 + 14); }
      x.closePath(); x.fill();
      x.strokeStyle = "rgba(29,42,68,0.28)"; x.lineWidth = 2; rrPath(x, ox + 1, oy + 1, pw - 2, ph - 2, 11); x.stroke();
      x.fillStyle = st.color; rrPath(x, ox + 12, oy + 12, 12, ph - 24, 4); x.fill();
      x.fillStyle = Q.ink; x.textAlign = "left"; x.textBaseline = "middle";
      x.fillText(st.text, ox + 34, Math.round(oy + ph / 2 + 2));
    }, { upload: true });
    mesh.userData.canvas.getContext("2d", { willReadFrequently: true });
    mesh.userData.set({ text, color: o.color ?? P.ink });
    mesh.userData.opacity(0);
    mesh.userData.update = ({ at, alpha = 1 }) => {
      if (!(alpha > 0.003)) { mesh.userData.opacity(0); return; }
      const p = projectToScreen(stage, V3(at));
      const px = (p.x + 1) / 2 * stage.width, py = (1 - p.y) / 2 * stage.height;
      mesh.userData.place(Math.round(side === "right" ? px : px - Wp), Math.round(py - Hp / 2));
      mesh.userData.opacity(p.behind ? 0 : alpha);
    };
    return mesh;
  }

  const props = {
    bench, stand, rack, vessel, beaker, flask, cylinder, testTube, burette, funnel,
    liquid, stream, drops, bubbles, marks, ground, caption, stamp, readout,
    label: (text, o = {}) => createTextLabel(text, { ...textStyle, ...o }),
  };

  return {
    spec,
    palette: P,
    materials,
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories: {
      bench: (s) => bench(s.dims ?? {}),
      stand: (s) => stand(s.dims ?? {}),
      rack: (s) => rack(s.dims ?? {}),
    },
    plan: liquids,
    helpers: { unitTicks, outerR, tileTexture, glassShell, liquidGeometry },
    hidden,
    /** render(t) — refresh matrices + liquid frames, refraction pre-pass (glass & marks hidden), then stage.render(t). */
    render(t) {
      scene.updateMatrixWorld(true);
      stage.camera.updateMatrixWorld();
      for (const m of liquidsList) m.material.uniforms.uInv.value.copy(m.matrixWorld).invert();
      glassU.uRefractOn.value = 0;
      const vis = hidden.map((m) => m.visible);
      hidden.forEach((m) => (m.visible = false));
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(bgRT);
      renderer.clear();
      renderer.render(scene, stage.camera);
      renderer.setRenderTarget(prev);
      hidden.forEach((m, i) => (m.visible = vis[i]));
      glassU.uRefractOn.value = 1;
      stage.render(t);
    },
    sfx: spec.sfx,
  };
}
