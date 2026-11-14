// styles/liquid-chrome/style.js — "Liquid Chrome": Y2K mirror-finish liquid metal (style contract, kit-api §3).
//
// The liquid is a RAYMARCHED signed-distance field (not marching cubes: the vendored three has no MarchingCubes
// addon, and a polygonised field facets and pops while it morphs). A bounding box mesh runs a fragment shader
// that marches a smooth union of up to `liquid.maxPrims` control primitives (rounded boxes: spheres, capsules,
// slabs; union or carve) uploaded every frame from plain data (liquid.js). It shades a perfect mirror against a
// procedural chrome environment written in GLSL (deep-blue sky, white-hot horizon line, black band, warm ground,
// coloured panels, a sun), adds a second bounce so blobs reflect each other, field AO in the crevices, optional
// thin-film iridescence, writes gl_FragDepth so meshes (puffy type) sort against it, and anti-aliases its own
// silhouette from the closest approach. The same env + chrome GLSL shades the inflated lettering meshes.
//
// Nothing animates itself: scenes build prim lists from t (liquid.js helpers) and call liquid.userData.set(prims, t).
import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { tubeAlong } from "../../kit/paths.js";
import { layoutStrokeText } from "../../kit/strokefont.js";
import { FONTS } from "../../kit/text.js";
import { pinToScreen, projectToScreen } from "../../kit/overlay.js";
import { GLSL_SAFE } from "../../kit/materials.js";
import { rng, clamp, lerp, smoothstep, spring, ease, TAU } from "../../kit/time.js";
import * as plan from "./liquid.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const lin = (hex) => new THREE.Color(hex); // THREE.Color converts sRGB hex -> linear working space
const MAXPANELS = 6;

// ------------------------------------------------------------------------------------------------ GLSL
const ENV_GLSL = /* glsl */ `
uniform vec3 uSkyTop, uSky, uSkyHor, uHor, uGTop, uGround, uGDeep, uSunCol, uF0;
uniform float uHorI, uHorW, uDarkBand, uGroundI, uEnvYaw;
uniform vec4 uSun;            // dir xyz (env frame), angular size (rad)
uniform vec2 uSunI;           // intensity, halo
uniform vec4 uBands[2];       // y, width, intensity, -
uniform vec4 uPanR[${MAXPANELS}];       // azimuth, elevation, half-width (rad), half-height
uniform vec4 uPanC[${MAXPANELS}];       // linear rgb, intensity
uniform float uPanS[${MAXPANELS}];      // edge softness
uniform vec4 uChrome;         // edgeBoost, iridescence, filmThickness, occlusion
${GLSL_SAFE}
vec3 chromeEnv(vec3 d) {
  float cy = cos(uEnvYaw), sy = sin(uEnvYaw);
  d = vec3(cy * d.x + sy * d.z, d.y, -sy * d.x + cy * d.z);
  float y = clamp(d.y, -1.0, 1.0);
  float az = atan(d.z, d.x);
  vec3 col;
  if (y >= 0.0) {
    col = mix(uSkyHor, uSky, smoothstep(0.0, 0.12, y));
    col = mix(col, uSkyTop, smoothstep(0.12, 0.75, y));
    for (int i = 0; i < 2; i++) { vec4 B = uBands[i]; float q = (y - B.x) / max(B.y, 1e-4); col += mix(uSkyHor, uHor, 0.5) * B.z * exp(-q * q); }
  } else {
    float g = -y;
    col = mix(uGTop, uGround, smoothstep(uDarkBand, uDarkBand + 0.14, g));
    col = mix(col, uGDeep, smoothstep(0.4, 0.98, g));
    col *= uGroundI;
  }
  float hq = y / max(uHorW, 1e-4);
  col += uHor * uHorI * exp(-hq * hq);
  for (int i = 0; i < ${MAXPANELS}; i++) {
    vec4 R = uPanR[i]; if (uPanC[i].a <= 0.0) continue;
    float da = abs(mod(az - R.x + 3.14159265, 6.2831853) - 3.14159265);
    float s = max(uPanS[i], 1e-3);
    float m = (1.0 - smoothstep(R.z - s, R.z, da)) * (1.0 - smoothstep(R.w - s, R.w, abs(y - R.y)));
    col = mix(col, uPanC[i].rgb * uPanC[i].a, m);
  }
  float cs = dot(d, uSun.xyz);
  col += uSunCol * (uSunI.x * smoothstep(cos(uSun.w), cos(uSun.w * 0.55), cs) + uSunI.y * exp((cs - 1.0) * 30.0));
  return col;
}
// mirror shading: env reflection x Fresnel-tinted F0, edge boost, optional thin-film rainbow, AO
vec3 chromeShade(vec3 n, vec3 v, vec3 envCol, float ao) {
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fr = safePow(1.0 - ndv, 5.0);
  vec3 F = mix(uF0, vec3(1.0), fr) * (1.0 + (uChrome.x - 1.0) * fr);
  vec3 col = envCol * F;
  if (uChrome.y > 0.0) {
    vec3 film = 0.5 + 0.5 * cos(6.2831853 * (uChrome.z * (1.0 - ndv) + vec3(0.0, 0.33, 0.67)));
    col *= mix(vec3(1.0), film * 1.55, uChrome.y * (0.35 + 0.65 * (1.0 - ndv)));
  }
  return col * ao;
}
`;

const LIQUID_VERT = /* glsl */ `
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const liquidFrag = (L) => /* glsl */ `
#define MAXP ${L.maxPrims}
#define NRIP ${L.ripple.slots}
uniform vec4 uA[MAXP];   // centre xyz, presence w
uniform vec4 uB[MAXP];   // half extents xyz, rounding r
uniform vec4 uC[MAXP];   // cos/sin rot (Z), cos/sin yaw (Y)
uniform vec4 uD[MAXP];   // k, op, presence offset, bound radius
uniform int uCount;
uniform vec3 uBMin, uBMax;
uniform float uTime, uPix;
uniform vec4 uWob;       // amp, freq, speed, -
uniform vec4 uRip[NRIP]; // xyz, age (< 0 = off)
uniform float uRipA[NRIP];
uniform vec4 uRipP;      // freq, speed, decay, falloff
uniform mat4 projectionMatrix; // set by three (also used for gl_FragDepth here)
varying vec3 vW;
${ENV_GLSL}
float sdRB(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float field(vec3 p) {
  float d = 1e3;
  for (int i = 0; i < MAXP; i++) {
    if (i >= uCount) break;
    vec4 A = uA[i];
    if (A.w <= 0.001) continue;
    vec4 D = uD[i];
    vec3 q = p - A.xyz;
    float bound = length(q) - D.w;
    if (D.y > 0.0 && bound > d + D.x) continue;      // too far to touch the union (smin reach = k)
    vec4 C = uC[i];
    q = vec3(C.z * q.x - C.w * q.z, q.y, C.w * q.x + C.z * q.z);
    q.xy = vec2(C.x * q.x + C.y * q.y, -C.y * q.x + C.x * q.y);
    vec4 B = uB[i];
    float di = sdRB(q, B.xyz, B.w) + D.z;
    float k = max(D.x, 1e-4);
    d = D.y > 0.0 ? smin(d, di, k) : -smin(-d, di, k);
  }
  return d;
}
float wobble(vec3 p) {
  float f = uWob.y, s = uWob.z * uTime;
  return uWob.x * sin(p.x * f + s) * sin(p.y * f * 1.13 - s * 0.8) * sin(p.z * f * 0.91 + s * 1.2);
}
float mapD(vec3 p) { return field(p) + wobble(p); }
float ripple(vec3 p) {
  float h = 0.0;
  for (int j = 0; j < NRIP; j++) {
    vec4 R = uRip[j]; if (R.w < 0.0) continue;
    float r = length(p - R.xyz);
    float front = R.w * uRipP.y / uRipP.x;           // the ring travels outward
    h += uRipA[j] * sin(r * uRipP.x - R.w * uRipP.y) * exp(-R.w * uRipP.z) * exp(-r * uRipP.w) * smoothstep(front + 0.6, front - 0.2, r) * smoothstep(0.04, 0.3, r);   // no spike at the impact point
  }
  return h;
}
vec3 normalAt(vec3 p, float e) {
  const vec2 k = vec2(1.0, -1.0);
  return safeNorm(k.xyy * (mapD(p + k.xyy * e) + ripple(p + k.xyy * e)) + k.yyx * (mapD(p + k.yyx * e) + ripple(p + k.yyx * e)) +
                  k.yxy * (mapD(p + k.yxy * e) + ripple(p + k.yxy * e)) + k.xxx * (mapD(p + k.xxx * e) + ripple(p + k.xxx * e)));
}
vec2 boxHit(vec3 ro, vec3 rd) {
  vec3 inv = 1.0 / (abs(rd) + 1e-6) * sign(rd + 1e-9);
  vec3 t0 = (uBMin - ro) * inv, t1 = (uBMax - ro) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  return vec2(max(max(tn.x, tn.y), tn.z), min(min(tf.x, tf.y), tf.z));
}
float occlusion(vec3 p, vec3 n) {
  float o = 0.0, w = 1.0;
  for (int i = 1; i <= 3; i++) { float h = 0.06 * float(i); o += (h - mapD(p + n * h)) * w; w *= 0.6; }
  return clamp(1.0 - uChrome.w * o * 4.0, 0.0, 1.0);
}
// second bounce: does the reflected ray hit the liquid again? (blobs mirror each other)
vec3 bounce(vec3 p, vec3 n, vec3 r) {
  float t = 0.03;
  for (int i = 0; i < ${L.reflectSteps}; i++) {
    vec3 q = p + n * 0.012 + r * t;
    float d = mapD(q);
    if (d < 0.004) {
      vec3 n2 = normalAt(q, 0.004);
      vec3 r2 = reflect(r, n2);
      return chromeShade(n2, -r, chromeEnv(r2), 1.0) * ${(L.selfReflect ?? 0.85).toFixed(3)};
    }
    t += max(d, 0.01);
    if (t > 6.0) break;
  }
  return chromeEnv(r);
}
void main() {
  vec3 ro = cameraPosition, rd = normalize(vW - ro);
  vec2 tb = boxHit(ro, rd);
  float t = max(tb.x, 0.0);
  if (tb.y <= t) discard;
  bool hit = false;
  float dmin = 1e3, tmin = t;
  for (int i = 0; i < ${L.steps}; i++) {
    vec3 p = ro + rd * t;
    float d = mapD(p);
    float px = uPix * t;
    if (d < px * 0.35) { hit = true; break; }
    if (d / px < dmin) { dmin = d / px; tmin = t; }
    t += d * ${L.relax.toFixed(3)};
    if (t > tb.y) break;
  }
  float alpha = 1.0;
  if (!hit) {                                   // silhouette anti-aliasing from the closest approach
    alpha = clamp(1.0 - dmin / 1.25, 0.0, 1.0);
    if (alpha <= 0.0) discard;
    t = tmin;
  }
  vec3 p = ro + rd * t;
  vec3 n = normalAt(p, max(uPix * t * 0.75, 0.0015));
  vec3 v = -rd;
  vec3 r = reflect(rd, n);
  vec3 env = ${L.selfReflect > 0 ? "bounce(p, n, r)" : "chromeEnv(r)"};
  vec3 col = chromeShade(n, v, env, occlusion(p, n));
  vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
  gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

const CHROME_VERT = /* glsl */ `
varying vec3 vW; varying vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const CHROME_FRAG = /* glsl */ `
varying vec3 vW; varying vec3 vN;
uniform float uOpacity;
${ENV_GLSL}
void main() {
  vec3 n = safeNorm(vN);
  vec3 v = safeNorm(cameraPosition - vW);
  if (dot(n, v) < 0.0) n = -n;
  vec3 col = chromeShade(n, v, chromeEnv(reflect(-v, n)), 1.0);
  gl_FragColor = vec4(col, uOpacity);
}
`;

const SPARK_VERT = /* glsl */ `
attribute float aSize; attribute float aLevel; attribute float aRot; attribute float aKind; attribute vec3 aColor;
varying float vLevel; varying float vRot; varying float vKind; varying vec3 vColor;
void main() {
  vLevel = aLevel; vRot = aRot; vKind = aKind; vColor = aColor;
  gl_Position = vec4(position.xy, 0.0, 1.0);
  gl_PointSize = aLevel > 0.0 ? aSize : 0.0;
}
`;
const SPARK_FRAG = /* glsl */ `
varying float vLevel; varying float vRot; varying float vKind; varying vec3 vColor;
uniform vec3 uStar; // rays sharpness, core sharpness, diagonal weight
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0; p.y = -p.y;
  float c = cos(vRot), s = sin(vRot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  float r = length(p), I = 0.0;
  if (vKind < 0.5) {                     // four-point star
    vec2 a = abs(p);
    float rays = exp(-a.y * uStar.x) * pow(max(1.0 - a.x, 0.0), 2.2) + exp(-a.x * uStar.x) * pow(max(1.0 - a.y, 0.0), 2.2);
    vec2 d = vec2(p.x + p.y, p.x - p.y) * 0.7071;
    vec2 ad = abs(d);
    float diag = exp(-ad.y * uStar.x * 1.3) * pow(max(1.0 - ad.x * 2.0, 0.0), 2.0) + exp(-ad.x * uStar.x * 1.3) * pow(max(1.0 - ad.y * 2.0, 0.0), 2.0);
    I = rays + diag * uStar.z + exp(-r * r * uStar.y) * 1.5;
  } else if (vKind < 1.5) {              // soft halo
    I = exp(-r * r * 5.0) * (1.0 - smoothstep(0.7, 1.0, r));
  } else if (vKind < 2.5) {              // ghost disc with a rim
    I = (0.35 * (1.0 - smoothstep(0.82, 0.92, r)) + 0.65 * exp(-pow((r - 0.87) * 14.0, 2.0)));
  } else {                               // anamorphic streak
    I = exp(-abs(p.y) * 90.0) * pow(max(1.0 - abs(p.x), 0.0), 2.5);
  }
  gl_FragColor = vec4(vColor * vLevel * I, 1.0);
}
`;

const BACK_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uS0, uS1, uS2, uGlow;
uniform float uAngle, uGlowLevel, uGlowR, uGlowY, uLevel, uAspect, uTime;
uniform vec4 uOrb[8]; uniform vec3 uOrbC[8]; uniform float uOrbLevel;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec2 q = vUv - 0.5; q.x *= uAspect;
  float g = clamp(0.5 + dot(q, vec2(sin(uAngle), cos(uAngle))) * 0.9, 0.0, 1.0);
  vec3 col = g < 0.5 ? mix(uS0, uS1, g * 2.0) : mix(uS1, uS2, g * 2.0 - 1.0);
  col *= uLevel;
  float gr = length(q - vec2(0.0, uGlowY)) / uGlowR;
  col += uGlow * uGlowLevel * exp(-gr * gr * 2.0);
  for (int i = 0; i < 8; i++) {
    vec4 o = uOrb[i]; if (o.z <= 0.0) continue;
    vec2 c = vec2(o.x + 0.04 * sin(uTime * 0.31 + o.w), o.y + 0.03 * cos(uTime * 0.27 + o.w * 1.7));
    float d = length(q - c) / o.z;
    col += uOrbC[i] * uOrbLevel * (exp(-d * d * 3.0) * 0.8 + 0.12 * exp(-pow((d - 0.95) * 9.0, 2.0)));
  }
  col += (h21(gl_FragCoord.xy) - 0.5) / 255.0;   // dither against banding
  gl_FragColor = vec4(col, 1.0);
}
`;

const GRID_VERT = /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GRID_FRAG = /* glsl */ `
varying vec3 vW;
uniform vec3 uNear, uFar; uniform float uCell, uLine, uLevel, uScroll; uniform vec2 uFade;
void main() {
  vec2 g = vec2(vW.x, vW.z + uScroll) / uCell;
  vec2 fw = fwidth(g);
  float w = uLine / uCell;
  vec2 b = smoothstep(w + fw, w - fw * 0.5, abs(fract(g - 0.5) - 0.5));
  float line = max(b.x, b.y);
  float dist = length(vW.xz - cameraPosition.xz);
  float fade = smoothstep(uFade.x * 0.4, uFade.x, dist) * (1.0 - smoothstep(uFade.x, uFade.y, dist));
  float aa = clamp(1.0 - max(fw.x, fw.y) * 1.2, 0.0, 1.0);    // fade out where cells shrink below a few pixels
  vec3 col = mix(uNear, uFar, smoothstep(uFade.x, uFade.y, dist));
  gl_FragColor = vec4(col * uLevel * line * fade * aa, 1.0);
}
`;

const LENS_SHADER = {
  uniforms: { tDiffuse: { value: null }, uK: { value: 0.04 }, uAspect: { value: 16 / 9 } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uK, uAspect; varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5; d.x *= uAspect;
      float rmax2 = 0.25 * (uAspect * uAspect + 1.0);
      vec2 s = d * (1.0 + uK * dot(d, d)) / (1.0 + uK * rmax2);
      s.x /= uAspect;
      gl_FragColor = texture2D(tDiffuse, s + 0.5);
    }`,
};

// ------------------------------------------------------------------------------------------------ createStyle
/** createStyle(stage, opts?) -> style        opts: { post = true } */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette, E = spec.env, CH = spec.chrome, L = spec.liquid;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // ---- shared environment / chrome uniforms (one object: every chrome surface reflects the same world) ----
  const sunDir = (az, el) => new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
  const envU = {
    uSkyTop: { value: lin(E.skyTop) }, uSky: { value: lin(E.sky) }, uSkyHor: { value: lin(E.skyHorizon) }, uHor: { value: lin(E.horizon) },
    uGTop: { value: lin(E.groundTop) }, uGround: { value: lin(E.ground) }, uGDeep: { value: lin(E.groundDeep) },
    uSunCol: { value: lin(E.sun.color) }, uF0: { value: lin(CH.f0) },
    uHorI: { value: E.horizonIntensity }, uHorW: { value: E.horizonWidth }, uDarkBand: { value: E.darkBand }, uGroundI: { value: E.groundIntensity }, uEnvYaw: { value: 0 },
    uSun: { value: new THREE.Vector4(...sunDir(E.sun.az, E.sun.el).toArray(), E.sun.size) }, uSunI: { value: new THREE.Vector2(E.sun.intensity, E.sun.halo) },
    uBands: { value: [0, 1].map((i) => { const b = E.skyBands[i]; return b ? new THREE.Vector4(b.y, b.w, b.intensity, 0) : new THREE.Vector4(0, 1, 0, 0); }) },
    uPanR: { value: [] }, uPanC: { value: [] }, uPanS: { value: [] },
    uChrome: { value: new THREE.Vector4(CH.edgeBoost, CH.iridescence, CH.filmThickness, CH.occlusion) },
  };
  for (let i = 0; i < MAXPANELS; i++) {
    const p = E.panels[i];
    envU.uPanR.value.push(p ? new THREE.Vector4(p.rect[0], p.rect[1], p.rect[2], p.rect[3]) : new THREE.Vector4());
    const c = p ? lin(p.color) : new THREE.Color(0);
    envU.uPanC.value.push(new THREE.Vector4(c.r, c.g, c.b, p ? p.intensity : 0));
    envU.uPanS.value.push(p ? p.rect[4] : 0.01);
  }
  /** env.set({ yaw, iridescence, horizon }) — rotate the reflected world (cheap) / tint the film. Call from renderAt. */
  const env = {
    uniforms: envU,
    set({ yaw = 0, iridescence = CH.iridescence, horizon = E.horizonIntensity } = {}) {
      envU.uEnvYaw.value = yaw;
      envU.uChrome.value.y = iridescence;
      envU.uHorI.value = horizon;
    },
    /** the sun direction in WORLD space (for placing sparkles on the hottest highlight) */
    sunWorld() {
      const s = envU.uSun.value, y = envU.uEnvYaw.value;
      // env applies Ry(yaw) to world dirs, so world = Ry(-yaw) * envDir
      const c = Math.cos(-y), si = Math.sin(-y);
      return new THREE.Vector3(c * s.x + si * s.z, s.y, -si * s.x + c * s.z);
    },
  };

  // ---- the liquid (raymarched SDF in a bounding box) ----
  function liquid(o = {}) {
    const LL = { ...L, ...o, ripple: { ...L.ripple, ...(o.ripple ?? {}) }, selfReflect: o.selfReflect ?? CH.selfReflect };
    const N = LL.maxPrims, NR = LL.ripple.slots;
    const U = {
      ...envU,
      uA: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
      uB: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
      uC: { value: Array.from({ length: N }, () => new THREE.Vector4(1, 0, 1, 0)) },
      uD: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
      uCount: { value: 0 },
      uBMin: { value: new THREE.Vector3(-1, -1, -1) }, uBMax: { value: new THREE.Vector3(1, 1, 1) },
      uTime: { value: 0 }, uPix: { value: 0.001 },
      uWob: { value: new THREE.Vector4(LL.wobble.amp, LL.wobble.freq, LL.wobble.speed, 0) },
      uRip: { value: Array.from({ length: NR }, () => new THREE.Vector4(0, 0, 0, -1)) },
      uRipA: { value: new Array(NR).fill(0) },
      uRipP: { value: new THREE.Vector4(LL.ripple.freq, LL.ripple.speed, LL.ripple.decay, LL.ripple.falloff) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: U, vertexShader: LIQUID_VERT, fragmentShader: liquidFrag(LL),
      side: THREE.BackSide, transparent: true, depthWrite: true, depthTest: true,
    });
    mat.name = "liquidChrome";
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 0;
    mesh.name = "liquid";
    const live = [];
    mesh.userData = {
      prims: live,
      /** set(prims, t): upload a primitive list (liquid.js format) for time t and fit the bounding box */
      set(prims, t = 0) {
        if (prims.length > N) throw new Error(`liquid: ${prims.length} prims > maxPrims ${N}`);
        live.length = 0;
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        prims.forEach((p, i) => {
          const ext = Math.max(p.he[0], p.he[1], p.he[2]) + p.r;
          const off = (1 - clamp(p.w)) * (ext + 0.05);
          U.uA.value[i].set(p.c[0], p.c[1], p.c[2], clamp(p.w));
          U.uB.value[i].set(p.he[0], p.he[1], p.he[2], p.r);
          U.uC.value[i].set(Math.cos(p.rot), Math.sin(p.rot), Math.cos(p.yaw), Math.sin(p.yaw));
          U.uD.value[i].set(p.k, p.op, off, Math.hypot(p.he[0], p.he[1], p.he[2]) + p.r);
          if (p.w > 0.001 && p.op > 0) {
            live.push(p);
            const pad = ext + p.k * 0.5 + LL.margin;
            for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p.c[a] - pad); hi[a] = Math.max(hi[a], p.c[a] + pad); }
          }
        });
        U.uCount.value = prims.length;
        U.uTime.value = t;
        mesh.visible = live.length > 0;
        if (!mesh.visible) return mesh;
        U.uBMin.value.set(...lo);
        U.uBMax.value.set(...hi);
        mesh.position.set((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
        mesh.scale.set(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
        const cam = stage.camera;
        U.uPix.value = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / stage.height;
        return mesh;
      },
      /** setRipples([{ p:[x,y,z], age, amp }]) — up to ripple.slots rings (age in s; amp default spec) */
      setRipples(list = []) {
        for (let j = 0; j < NR; j++) {
          const r = list[j];
          if (r && r.age >= 0) { U.uRip.value[j].set(r.p[0], r.p[1], r.p[2], r.age); U.uRipA.value[j] = r.amp ?? LL.ripple.amp; }
          else { U.uRip.value[j].set(0, 0, 0, -1); U.uRipA.value[j] = 0; }
        }
        return mesh;
      },
      uniforms: U,
    };
    return mesh;
  }

  // ---- chrome material for meshes (same env + shading as the liquid) ----
  function chromeMaterial({ opacity = 1 } = {}) {
    const m = new THREE.ShaderMaterial({ uniforms: { ...envU, uOpacity: { value: opacity } }, vertexShader: CHROME_VERT, fragmentShader: CHROME_FRAG, side: THREE.DoubleSide });
    m.name = "chrome";
    return m;
  }
  const chrome = chromeMaterial();
  materials.chrome = chrome;

  // ---- inflated chrome lettering ----
  /**
   * inflatedText(text, { cap, radius, letterSpacing, wordSpacing, lineHeight, bend, radial, depthScale })
   *   -> Group centred on its middle. userData.chars = per-glyph groups (pivot at glyph centre), width, height.
   *   userData.update(t, start, { stagger, popDur, order }) inflates the glyphs in with a springy overshoot.
   */
  function inflatedText(text, o = {}) {
    const T = { ...spec.type, ...o };
    const lay = layoutStrokeText(text, T.cap, { letterSpacing: T.letterSpacing, wordSpacing: T.wordSpacing, lineHeight: T.lineHeight, bendRadius: T.bend });
    const root = new THREE.Group();
    root.name = `inflated:${text.replace(/\n/g, " ")}`;
    const lineH = T.lineHeight * T.cap;
    const yShift = ((lay.lines - 1) * lineH) / 2 - T.cap / 2;
    const chars = lay.chars.map((c) => {
      const geos = c.strokes.map((s) => tubeAlong(s, { radius: T.radius * T.cap, radial: T.radial, caps: true }));
      const g = mergeGeometries(geos, false);
      const cx = (c.x0 + c.x1) / 2, cy = -c.line * lineH + T.cap / 2;
      g.translate(-cx, -cy, 0);
      const mesh = new THREE.Mesh(g, chrome);
      const holder = new THREE.Group();
      holder.position.set(cx, cy + yShift, 0);
      holder.add(mesh);
      holder.userData = { ch: c.ch, line: c.line, index: c.i, home: holder.position.clone() };
      root.add(holder);
      return holder;
    });
    root.userData = {
      chars, width: lay.width, height: lay.lines * lineH - (lineH - T.cap) + 2 * T.radius * T.cap, lines: lay.lines,
      /** update(t, start): glyph k starts at start + k*stagger; scale springs 0 -> 1 (overshoot), z puffs last */
      update(t, start, { stagger = T.stagger, popDur = T.popDur } = {}) {
        chars.forEach((h, k) => {
          const tau = t - start - k * stagger;
          h.visible = tau > 0;
          if (!h.visible) return;
          const s = spring(tau, { stiffness: 210, damping: 13 });
          const puff = spring(Math.max(0, tau - 0.05), { stiffness: 150, damping: 9 });
          h.scale.set(s, s * (1 + 0.12 * Math.sin(Math.min(tau / popDur, 1) * Math.PI)), Math.max(0.001, puff * T.depthScale));
          h.position.copy(h.userData.home);
          h.position.y += (1 - ease.outCubic(clamp(tau / (popDur * 0.6)))) * -0.35 * T.cap;
        });
        return root;
      },
    };
    return root;
  }

  // ---- sparkles + lens flares (screen-space points, additive HDR) ----
  const gl = stage.renderer.getContext();
  const maxPoint = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)?.[1] ?? 256) | 0;
  /**
   * sparkles({ capacity }) -> Points. userData.set(list): list of { x, y (NDC), kind: "star"|"halo"|"ghost"|"streak",
   *   size (px at 1080p), level, color (hex), rot }. Unused capacity is hidden. Sizes clamp to the GPU point limit.
   * userData.flare(x, y, level, { color }) -> list entries for a lens flare at NDC (x, y): halo + streak + ghosts.
   */
  function sparkles({ capacity = 48 } = {}) {
    const S = spec.sparkle, F = spec.flare;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(capacity * 3), size = new Float32Array(capacity), level = new Float32Array(capacity);
    const rot = new Float32Array(capacity), kind = new Float32Array(capacity), color = new Float32Array(capacity * 3);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aLevel", new THREE.BufferAttribute(level, 1));
    g.setAttribute("aRot", new THREE.BufferAttribute(rot, 1));
    g.setAttribute("aKind", new THREE.BufferAttribute(kind, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { uStar: { value: new THREE.Vector3(S.rays, S.core, S.diag) } }, vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    m.name = "sparkle";
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = 20;
    pts.userData.noDepth = true;
    const KIND = { star: 0, halo: 1, ghost: 2, streak: 3 };
    const tmp = new THREE.Color();
    pts.userData.set = (list = []) => {
      for (let i = 0; i < capacity; i++) {
        const s = list[i];
        if (!s || !(s.level > 0)) { level[i] = 0; size[i] = 0; continue; }
        pos[i * 3] = s.x; pos[i * 3 + 1] = s.y; pos[i * 3 + 2] = 0;
        size[i] = Math.min(maxPoint, (s.size ?? S.size) * (stage.height / 1080));
        level[i] = s.level; rot[i] = s.rot ?? 0; kind[i] = KIND[s.kind ?? "star"];
        tmp.set(s.color ?? S.color);
        color[i * 3] = tmp.r; color[i * 3 + 1] = tmp.g; color[i * 3 + 2] = tmp.b;
      }
      for (const a of Object.values(g.attributes)) a.needsUpdate = true;
      return pts;
    };
    pts.userData.flare = (x, y, lv = 1, { color = "#ffffff", streak = true } = {}) => {
      const out = [{ x, y, kind: "halo", size: F.halo, level: F.haloLevel * lv, color }];
      if (streak) out.push({ x, y, kind: "streak", size: F.streak, level: F.streakLevel * lv, color: "#bfefff" });
      for (const [f, sz, c] of F.ghosts) out.push({ x: x * f, y: y * f, kind: "ghost", size: sz, level: F.ghostLevel * lv, color: c });
      return out;
    };
    pts.userData.maxPoint = maxPoint;
    return pts;
  }
  /** highlightPoint(prim, cameraPos) -> world point on a (roughly round) prim where the env sun glints */
  function highlightPoint(p, camPos) {
    const c = new THREE.Vector3(...p.c);
    const V = camPos.clone().sub(c).normalize();
    const h = env.sunWorld().add(V).normalize();
    const R = p.r + Math.max(...p.he) * 0.5;
    return c.addScaledVector(h, R);
  }

  // ---- the void: gradient backdrop with glow + drifting orbs ----
  function backdrop(o = {}) {
    const B = { ...spec.backdrop, ...o };
    const r = rng(B.orbs.seed);
    const orb = [], orbC = [];
    for (let i = 0; i < 8; i++) {
      if (i < B.orbs.count) {
        orb.push(new THREE.Vector4(r.range(-0.8, 0.8), r.range(-0.42, 0.42), r.range(...B.orbs.size), r.range(0, TAU)));
        orbC.push(lin(B.orbs.colors[i % B.orbs.colors.length]));
      } else { orb.push(new THREE.Vector4(0, 0, 0, 0)); orbC.push(new THREE.Color(0)); }
    }
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uS0: { value: lin(B.stops[0]) }, uS1: { value: lin(B.stops[1]) }, uS2: { value: lin(B.stops[2]) }, uGlow: { value: lin(B.glow.color) },
        uAngle: { value: B.angle }, uGlowLevel: { value: B.glow.level }, uGlowR: { value: B.glow.radius }, uGlowY: { value: B.glow.y },
        uLevel: { value: B.level }, uAspect: { value: stage.width / stage.height }, uTime: { value: 0 },
        uOrb: { value: orb }, uOrbC: { value: orbC }, uOrbLevel: { value: B.orbs.level },
      },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.99999, 1.0); }",
      fragmentShader: BACK_FRAG, depthWrite: false, depthTest: false,
    });
    m.name = "backdrop";
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    mesh.userData.noDepth = true;
    mesh.userData.update = (t) => { m.uniforms.uTime.value = t; };
    return mesh;
  }

  // ---- neon grid floor fading to the horizon ----
  function gridFloor(o = {}) {
    const G = { ...spec.grid, ...o };
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uNear: { value: lin(G.colorNear) }, uFar: { value: lin(G.colorFar) }, uCell: { value: G.cell }, uLine: { value: G.line },
        uLevel: { value: G.level }, uScroll: { value: 0 }, uFade: { value: new THREE.Vector2(...G.fade) },
      },
      vertexShader: GRID_VERT, fragmentShader: GRID_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    m.name = "grid";
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(G.size, G.size), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = G.y;
    mesh.renderOrder = -5;
    mesh.userData.noDepth = true;
    mesh.userData.update = (t, level = 1) => { m.uniforms.uScroll.value = t * G.scroll; m.uniforms.uLevel.value = G.level * level; };
    return mesh;
  }

  // ---- flat outlined techno captions (overlay: exact colours, drawn after post) ----
  /**
   * caption(text, { size, letterSpacing }) -> Mesh on the overlay.
   *   userData.update(t, { on, off, x, y, height }) — pops in (outBack), slides up, fades out; hidden outside [on, off].
   */
  function caption(text, o = {}) {
    const C = { ...spec.caption, ...o };
    const px = 128, pad = Math.round(px * 0.45);
    const cv = document.createElement("canvas");
    const ctx = cv.getContext("2d");
    const font = `${C.italic ? "italic " : ""}${C.weight} ${px}px ${C.font}`;
    const setup = () => { ctx.font = font; ctx.letterSpacing = `${Math.round(px * C.letterSpacing)}px`; ctx.textBaseline = "middle"; ctx.textAlign = "left"; };
    setup();
    const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
    const h = Math.round(px * 1.5);
    cv.width = w; cv.height = h;
    ctx.reset?.();
    setup();
    ctx.lineJoin = "round";
    const y = h / 2, x0 = pad;
    ctx.fillStyle = C.shadow;
    ctx.strokeStyle = C.shadow;
    ctx.lineWidth = px * C.strokeWidth;
    ctx.strokeText(text, x0 + px * C.shadowOffset[0], y + px * C.shadowOffset[1]);
    ctx.fillText(text, x0 + px * C.shadowOffset[0], y + px * C.shadowOffset[1]);
    ctx.strokeStyle = C.stroke;
    ctx.strokeText(text, x0, y);
    const grad = ctx.createLinearGradient(0, y - px * 0.4, 0, y + px * 0.4);
    grad.addColorStop(0, C.fill[0]);
    grad.addColorStop(0.55, C.fill[0]);
    grad.addColorStop(0.56, C.fill[1]);
    grad.addColorStop(1, C.fill[1]);
    ctx.fillStyle = grad;
    ctx.fillText(text, x0, y);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    m.name = `caption:${text}`;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.scale.set(w / h, 1, 1);
    mesh.renderOrder = 30;
    mesh.userData.aspect = w / h;
    mesh.userData.update = (t, { on, off = Infinity, x = 0, y: yy = -0.74, height = C.height * (o.size ?? 1) * 1.5, world = null, offset = [0, 0] } = {}) => {
      const a = smoothstep(on, on + 0.3, t) * (1 - smoothstep(off - 0.3, off, t));
      mesh.visible = a > 0.001;
      const pop = t < on ? 0 : ease.outBack(clamp((t - on) / 0.45));
      mesh.userData.pinScale = [lerp(0.6, 1, pop), lerp(0.6, 1, pop), 1];
      m.opacity = a;
      const lift = (1 - ease.outCubic(clamp((t - on) / 0.5))) * -0.04;
      pinToScreen(stage, mesh, { x, y: yy + lift, height, world, offset: [offset[0], offset[1] + lift] });
      if (!(a > 0.001)) mesh.visible = false;
      return mesh;
    };
    return mesh;
  }

  // ---- fisheye-ish wide lens (barrel distortion before tone mapping) ----
  let lensPass = null;
  if (post && spec.lens?.barrel) {
    lensPass = new ShaderPass(LENS_SHADER);
    lensPass.uniforms.uK.value = spec.lens.barrel;
    lensPass.uniforms.uAspect.value = stage.width / stage.height;
    post.insertBefore(lensPass, "output", "lens");
  }

  const props = { liquid, inflatedText, sparkles, backdrop, gridFloor, caption };
  const factories = {
    backdrop: () => backdrop(),
    grid: () => gridFloor(),
    liquid: () => liquid(),
  };

  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, sfx: spec.sfx,
    props, factories, env, plan, shapes: plan.SHAPES, motion: plan,
    helpers: { chromeMaterial, highlightPoint, projectToScreen: (p) => projectToScreen(stage, p), lensPass },
  };
}
