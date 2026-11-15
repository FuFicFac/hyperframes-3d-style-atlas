// materials.js — material patches (onBeforeCompile) that need no UVs. Promoted from the soft-clay pilot
// (its micro-bump; the tool-mark and boil parts stay in the style).
import * as THREE from "three";

const GLSL = /* glsl */ `
varying vec3 vObjPos;
uniform vec3 uObjBumpOffset;
uniform vec2 uObjBump; // freq (cycles per metre), strength (metres of relief)
float obH(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float obN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(obH(i), obH(i + vec3(1,0,0)), f.x), mix(obH(i + vec3(0,1,0)), obH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(obH(i + vec3(0,0,1)), obH(i + vec3(1,0,1)), f.x), mix(obH(i + vec3(0,1,1)), obH(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float obHeight(vec3 p) {
  vec3 q = p * uObjBump.x + uObjBumpOffset;
  return (obN(q) * 0.55 + obN(q * 2.07 + 7.1) * 0.3 + obN(q * 4.3 + 3.7) * 0.15) * uObjBump.y;
}
vec3 obPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float fd) {
  vec3 sX = dFdx(surfPos), sY = dFdy(surfPos);
  vec3 R1 = cross(sY, surfNorm), R2 = cross(surfNorm, sX);
  float det = dot(sX, R1) * fd;
  vec3 grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(det) * surfNorm - grad);
}`;

/**
 * objectSpaceBump(material, { freq = 40, strength = .002, offset = [0,0,0] }) -> material (patched in place)
 *   Fine 3-octave value-noise relief evaluated in OBJECT space (no UVs needed, sticks to the mesh as it
 *   moves, no seams on lathes/extrusions/merged geometry). Works on standard / physical / lambert / phong.
 *   material.userData.objBump = { uObjBump, uObjBumpOffset } uniforms: animate uObjBumpOffset per pose for
 *   stop-motion "boil". Relief is in metres: keep strength ~ 1/(10 x freq). Clones need patching again.
 */
export function objectSpaceBump(m, { freq = 40, strength = 0.002, offset = [0, 0, 0] } = {}) {
  const U = { uObjBump: { value: new THREE.Vector2(freq, strength) }, uObjBumpOffset: { value: new THREE.Vector3(...offset) } };
  m.userData.objBump = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObjPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObjPos = transformed;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\n${GLSL}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        { float hC = obHeight(vObjPos); normal = obPerturb(-vViewPosition, normal, vec2(dFdx(hC), dFdy(hC)), faceDirection); }`);
  };
  m.customProgramCacheKey = () => "atlas-objbump-v1";
  m.needsUpdate = true;
  return m;
}

/**
 * fresnelGlass({ color = "#dfeee8", roughness = .05, clearcoat = 1, envIntensity = 1, alphaFace = .08, alphaRim = .7,
 *   fresnelPower = 2.5, rim = "#ffffff", rimStrength = .25, innerGlow = 0, toLight = [-1, 1, 1], doubleSide = true,
 *   depthWrite = false }) -> MeshPhysicalMaterial. Thin glass that READS on any background: alpha rises from
 *   alphaFace (looking through) to alphaRim (grazing) by Fresnel, specular is kept at full strength (premultiplied
 *   blend), an optional coloured inner glow sits opposite the light. No transmission pass (cheap, deterministic).
 *   Uniforms in material.userData.glass. (marble-run)
 */
export function fresnelGlass(o = {}) {
  const g = { color: "#dfeee8", roughness: 0.05, clearcoat: 1, envIntensity: 1, alphaFace: 0.08, alphaRim: 0.7, fresnelPower: 2.5, rim: "#ffffff", rimStrength: 0.25, innerGlow: 0, toLight: [-1, 1, 1], doubleSide: true, depthWrite: false, ...o };
  const m = new THREE.MeshPhysicalMaterial({
    color: g.color, roughness: g.roughness, metalness: 0, clearcoat: g.clearcoat, clearcoatRoughness: 0.04,
    envMapIntensity: g.envIntensity, transparent: true, depthWrite: !!g.depthWrite, side: g.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  const U = {
    uAlpha: { value: new THREE.Vector2(g.alphaFace, g.alphaRim) }, uFres: { value: g.fresnelPower },
    uRim: { value: new THREE.Color(g.rim).multiplyScalar(g.rimStrength) },
    uGlow: { value: new THREE.Color(g.color).multiplyScalar(g.innerGlow) }, uToLight: { value: new THREE.Vector3(...g.toLight) }, // the shader normalises
  };
  m.userData.glass = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec2 uAlpha;\nuniform float uFres;\nuniform vec3 uRim;\nuniform vec3 uGlow;\nuniform vec3 uToLight;")
      .replace("#include <opaque_fragment>", `
        float gFres = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), uFres);
        float gA = mix(uAlpha.x, uAlpha.y, gFres);
        vec3 gSpec = max(outgoingLight - totalDiffuse, vec3(0.0));
        float gIn = smoothstep(0.05, 0.75, -dot(normalize(normal), normalize((viewMatrix * vec4(uToLight, 0.0)).xyz))) * (1.0 - 0.7 * gFres);
        gl_FragColor = vec4(totalDiffuse * gA + gSpec + uRim * gFres + uGlow * gIn, max(gA, 0.0));`);
  };
  m.customProgramCacheKey = () => "atlas-fresnel-glass-1";
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  return m;
}

/**
 * GLSL_SAFE — paste into custom shaders (onBeforeCompile / ShaderMaterial). pow(x, p) is UNDEFINED for x < 0 in
 * GLSL and returns NaN on most GPUs; one NaN pixel in the HDR buffer is smeared across the frame by bloom (the
 * wireframe-hologram's first render was black). Likewise normalize(vec3(0)) and x / 0. Use:
 *   safePow(x, p)  = pow(max(x, 0.0), p)       safeNorm(v) = v * inversesqrt(max(dot(v, v), 1e-12))
 *   safeDiv(a, b)  = a / (abs(b) < 1e-6 ? 1e-6 : b)
 * `scripts/check-frames.mjs --deep` scans the HDR scene for NaN/Inf (kit/selfcheck.js hdrScan).
 */
export const GLSL_SAFE = /* glsl */ `
float safePow(float x, float p) { return pow(max(x, 0.0), p); }
vec3 safePow(vec3 x, float p) { return pow(max(x, vec3(0.0)), vec3(p)); }
vec3 safeNorm(vec3 v) { return v * inversesqrt(max(dot(v, v), 1e-12)); }
float safeDiv(float a, float b) { return a / (abs(b) < 1e-6 ? (b < 0.0 ? -1e-6 : 1e-6) : b); }
`;

// ---------------------------------------------------------------- promoted 2026-11-13 (pass 4, toy-brick)
/**
 * plasticSurface(material, { roughFreq, roughVar: [lo, hi], scratchFreq, scratchAmount, scratchCover, bumpFreq, bumpStrength })
 *   -> material (patched in place): UV-free, WORLD-space roughness blotches (roughness x lo..hi), fine directional
 *   micro-scratches (raise roughness along hairlines) and a faint moulding ripple (normal perturbation). Moulded plastic,
 *   lacquer, painted metal. Uniforms in material.userData.plastic. (Unlike objectSpaceBump it also varies roughness.)
 */
const PLASTIC_GLSL = /* glsl */ `
varying vec3 vTbP;
uniform vec4 uTbA; // roughFreq, roughLo, roughHi, scratchFreq
uniform vec4 uTbB; // scratchAmount, scratchCover, bumpFreq, bumpStrength
float tbH(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float tbN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(tbH(i), tbH(i + vec3(1,0,0)), f.x), mix(tbH(i + vec3(0,1,0)), tbH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(tbH(i + vec3(0,0,1)), tbH(i + vec3(1,0,1)), f.x), mix(tbH(i + vec3(0,1,1)), tbH(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float tbScratch(vec3 p) {
  // two families of long thin streaks (stretched noise thresholded to hairlines)
  float s = 0.0;
  vec3 q1 = vec3(p.x * 0.12 + p.z * 0.05, p.y, p.z * 1.0 - p.x * 0.4) * uTbA.w;
  vec3 q2 = vec3(p.z * 0.11 - p.x * 0.07, p.y * 0.9, p.x + p.z * 0.35) * uTbA.w * 0.8 + 17.0;
  float n1 = tbN(q1), n2 = tbN(q2);
  s = max(smoothstep(1.0 - uTbB.y, 1.0 - uTbB.y * 0.35, n1), smoothstep(1.0 - uTbB.y * 0.7, 1.0 - uTbB.y * 0.2, n2) * 0.7);
  return s;
}
vec3 tbPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float fd) {
  vec3 sX = dFdx(surfPos), sY = dFdy(surfPos);
  vec3 R1 = cross(sY, surfNorm), R2 = cross(surfNorm, sX);
  float det = dot(sX, R1) * fd;
  vec3 grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(det) * surfNorm - grad);
}`;

export function plasticSurface(m, S = {}) {
  S = { roughFreq: 6, roughVar: [0.75, 1.25], scratchFreq: 30, scratchAmount: 0.25, scratchCover: 0.06, bumpFreq: 9, bumpStrength: 0.0006, ...S };
  const U = {
    uTbA: { value: new THREE.Vector4(S.roughFreq, S.roughVar[0], S.roughVar[1], S.scratchFreq) },
    uTbB: { value: new THREE.Vector4(S.scratchAmount, S.scratchCover, S.bumpFreq, S.bumpStrength) },
  };
  m.userData.plastic = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTbP;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTbP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\n${PLASTIC_GLSL}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        { float blot = tbN(vTbP * uTbA.x) * 0.65 + tbN(vTbP * uTbA.x * 2.3 + 5.0) * 0.35;
          roughnessFactor *= mix(uTbA.y, uTbA.z, blot);
          roughnessFactor = min(1.0, roughnessFactor + tbScratch(vTbP) * uTbB.x); }`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        { float hC = (tbN(vTbP * uTbB.z) * 0.6 + tbN(vTbP * uTbB.z * 2.1 + 3.0) * 0.4) * uTbB.w;
          normal = tbPerturb(-vViewPosition, normal, vec2(dFdx(hC), dFdy(hC)), faceDirection); }`);
  };
  m.customProgramCacheKey = () => "toy-brick-plastic-v1"; // same program key as the toy-brick style
  m.needsUpdate = true;
  return m;
}

