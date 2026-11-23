// styles/impasto/style.js — "Impasto": thick oil paint laid stroke by stroke along a flow field. The look lives in
// spec.js; WHERE every stroke lies, WHEN it is painted and HOW it flows lives in strokes.js (THREE-free planner shared
// with SCORE). This file turns a plan into pictures:
//   - ONE InstancedMesh for every stroke: a unit (u, v) grid bent in the vertex shader into a constant-curvature arc of
//     the stroke's length/width (per-instance attributes), with the low-frequency relief (dome, edge ridges, lift blob,
//     taper/cap outline) displaced into real geometry so it casts shadows (a matching customDepthMaterial), and the
//     high-frequency bristle grooves + colour streaks evaluated per pixel (analytic normals, no derivatives);
//   - a primed woven canvas on a stretcher on a light oak table; the canvas shader fades in a thin UNDERPAINT wash per
//     cell at the time the plan says the brush passed (DataTexture, built once);
//   - a raking key light whose elevation/azimuth are keyed on t;
//   - an overlay caption chip (exact colours).
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { paintPixels, canvasTexture, uploadTexture } from "../../kit/textures.js";
import { lerp, clamp, ease } from "../../kit/time.js";
import { GLSL_SAFE } from "../../kit/materials.js";
import * as strokesPlanner from "./strokes.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

// ---------------------------------------------------------------- GLSL: shared stroke profile
const PROFILE = /* glsl */ `
uniform vec4 uP1; // bristles, groove, rim, rimAt
uniform vec4 uP2; // blob, blobAt, blobW, edge
uniform vec4 uP3; // startTaper, endCap, blobWiden, streak
float imp2(float x) { return x * x; }
// half-width factor along the stroke: rounded start, widening lift blob, round end cap
float impHw(float u) {
  float a = clamp((uP3.x - u) / uP3.x, 0.0, 1.0);
  float st = sqrt(max(0.0, 1.0 - a * a));
  float b = clamp((u - (1.0 - uP3.y)) / uP3.y, 0.0, 1.0);
  float en = sqrt(max(0.0, 1.0 - b * b));
  float bw = 1.0 + uP3.z * exp(-imp2((u - uP2.y) / (uP2.z * 1.6)));
  return st * en * (0.88 + 0.12 * u) * bw;
}
// low-frequency height (units of stroke height): dome + edge ridges + lift blob, thin at the start, a step at the edge
float impLow(float u, float v) {
  float av = min(abs(v), 1.0);
  float body = 1.0 - av * av * 0.55;
  float rim = uP1.z * exp(-imp2((av - uP1.w) / 0.11));
  float blob = uP2.x * exp(-imp2((u - uP2.y) / uP2.z)) * (1.0 - av * av);
  float along = 0.72 + 0.28 * smoothstep(0.0, 0.3, u);
  float edge = mix(1.0, uP2.w, smoothstep(0.86, 1.0, av));
  return (body * along + rim + blob) * edge;
}
`;

const VERT_HEAD = /* glsl */ `
attribute vec4 aDim;   // L, W, H, kappa (local; + bends toward local +z)
attribute vec4 aAnim;  // progress, seed, lift, flip (+-1)
varying vec2 vImpW;    // world xz (for the canvas-edge clip)
${PROFILE}
vec3 impPos(vec3 p, out vec3 T, out vec3 Sd, out float hw, out float Lc) {
  float prog = aAnim.x;
  float L0 = aDim.x;
  Lc = max(L0 * prog, 0.002);
  float u = p.x, v = p.z;
  float s = -0.5 * L0 + u * Lc;
  float k = aDim.w;
  float sg = k < 0.0 ? -1.0 : 1.0;
  k = sg * max(abs(k), 1e-4);
  float th = s * k;
  T = vec3(cos(th), 0.0, sin(th));
  Sd = vec3(-sin(th), 0.0, cos(th));
  vec3 C = vec3(sin(th) / k, 0.0, 2.0 * sin(0.5 * th) * sin(0.5 * th) / k);
  hw = impHw(u);
  float grow = smoothstep(0.0, 0.2, prog);
  float h = impLow(u, v * aAnim.w) * aDim.z * grow;
  vec3 q = C + Sd * (v * hw * 0.5 * aDim.y) + vec3(0.0, h + aAnim.z, 0.0);
  vec4 wq = vec4(q, 1.0);
  #ifdef USE_INSTANCING
    wq = instanceMatrix * wq;
  #endif
  vImpW = (modelMatrix * wq).xz;
  return q;
}
`;

/** onBeforeCompile for the stroke MeshStandardMaterial */
function strokeShader(uniforms) {
  return (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
${VERT_HEAD}
attribute vec3 aCA;
attribute vec3 aCB;
varying vec2 vImpUV;
varying float vImpSeed;
varying vec3 vImpCA;
varying vec3 vImpCB;
varying vec3 vImpT;
varying vec3 vImpS;
varying vec3 vImpN;
varying vec3 vImpMet; // current length, full width, height*grow
varying float vImpFlip;`)
      .replace("#include <begin_vertex>", `
  vec3 impT, impS; float impHW, impLc;
  vec3 transformed = impPos(position, impT, impS, impHW, impLc);
  vImpUV = vec2(position.x, position.z);
  vImpSeed = aAnim.y;
  vImpFlip = aAnim.w;
  vImpCA = aCA; vImpCB = aCB;
  vImpMet = vec3(impLc, aDim.y, aDim.z * smoothstep(0.0, 0.2, aAnim.x));
  mat3 impM = mat3(modelViewMatrix);
  #ifdef USE_INSTANCING
    impM = impM * mat3(instanceMatrix);
  #endif
  vImpT = normalize(impM * impT);
  vImpS = normalize(impM * impS);
  vImpN = normalize(impM * vec3(0.0, 1.0, 0.0));`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
${GLSL_SAFE}
${PROFILE}
uniform float uNormalK;
uniform vec4 uClip;
varying vec2 vImpW;
uniform float uRough;
uniform float uGrooveRough;
varying vec2 vImpUV;
varying float vImpSeed;
varying vec3 vImpCA;
varying vec3 vImpCB;
varying vec3 vImpT;
varying vec3 vImpS;
varying vec3 vImpN;
varying vec3 vImpMet;
varying float vImpFlip;
float impGroove(float u, float v) {
  float sd = vImpSeed;
  float bl = exp(-imp2((u - uP2.y) / uP2.z));
  float g = 0.5 + 0.5 * sin(3.14159265 * uP1.x * (v + 0.07 * sin(u * 9.0 + sd * 40.0)) + sd * 30.0);
  float fine = 0.5 + 0.5 * sin(3.14159265 * uP1.x * 2.3 * (v + 0.05 * sin(u * 13.0 + sd * 17.0)) + sd * 11.0);
  return uP1.y * (0.75 * g + 0.25 * fine) * (1.0 - 0.75 * bl) * smoothstep(0.02, 0.14, u);
}
float impH(float u, float v) { float vf = v * vImpFlip; return impLow(u, vf) + impGroove(u, vf); }
`)
      .replace("#include <clipping_planes_fragment>", `
  if (vImpW.x < uClip.x || vImpW.x > uClip.y || vImpW.y < uClip.z || vImpW.y > uClip.w) discard;
  #include <clipping_planes_fragment>`)
      .replace("#include <color_fragment>", `#include <color_fragment>
  float impU = vImpUV.x, impV = vImpUV.y;
  float impVf = impV * vImpFlip;
  float impSt = 0.5 + 0.5 * sin(3.14159265 * uP1.x * 0.5 * (impVf + 0.15 * sin(impU * 6.0 + vImpSeed * 50.0)) + vImpSeed * 20.0 + impU * 2.0);
  float impMix = smoothstep(0.35, 0.85, impSt) * uP3.w;
  float impGv = impGroove(impU, impVf) / max(uP1.y, 1e-3);
  diffuseColor.rgb = mix(vImpCA, vImpCB, impMix) * (0.86 + 0.2 * impGv);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
  roughnessFactor = uRough + uGrooveRough * (1.0 - impGv);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  {
    float e = 0.004;
    float dhu = (impH(impU + e, impV) - impH(impU - e, impV)) / (2.0 * e);
    float dhv = (impH(impU, impV + e) - impH(impU, impV - e)) / (2.0 * e);
    float hwf = max(impHw(impU), 0.08);
    float dhs = vImpMet.z * dhu / max(vImpMet.x, 0.002);
    float dhw = vImpMet.z * dhv / (0.5 * vImpMet.y * hwf);
    vec3 nn = normalize(vImpN) - uNormalK * (dhs * normalize(vImpT) + dhw * normalize(vImpS));
    normal = safeNorm(nn);
  }`);
  };
}

/** onBeforeCompile for the stroke shadow depth material (same bend + low-frequency relief) */
function strokeDepthShader(uniforms) {
  return (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
${VERT_HEAD}`)
      .replace("#include <begin_vertex>", `
  vec3 impT, impS; float impHW, impLc;
  vec3 transformed = impPos(position, impT, impS, impHW, impLc);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec4 uClip;\nvarying vec2 vImpW;")
      .replace("#include <clipping_planes_fragment>", `
  if (vImpW.x < uClip.x || vImpW.x > uClip.y || vImpW.y < uClip.z || vImpW.y > uClip.w) discard;
  #include <clipping_planes_fragment>`);
  };
}

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const CV = spec.canvas, SK = spec.stroke;
  const CW = CV.w, CH = CV.h, top = CV.y;
  /** canvas coords (x right, y up, metres) -> world [X, Y, Z] on the canvas top */
  const toWorld = (x, y, h = 0) => [x - CW / 2, top + h, CH / 2 - y];

  // ---------------------------------------------------------------- table + stretcher + woven canvas with underpaint
  function weaveTexture() {
    const Wv = CV.weave, n = Wv.threads;
    const cnv = paintPixels(Wv.px, (u, v) => {
      const fu = (u * n) % 1, fv = (v * n) % 1, i = Math.floor(u * n), j = Math.floor(v * n);
      const over = (i + j) % 2 === 0;
      const warp = Math.sin(Math.PI * fu) ** 0.6 * (0.75 + 0.25 * Math.sin(Math.PI * fv));
      const weft = Math.sin(Math.PI * fv) ** 0.6 * (0.75 + 0.25 * Math.sin(Math.PI * fu));
      const slub = 0.06 * Math.sin(u * 37.0 + Math.sin(v * 11.0) * 2.0);
      return 0.25 + 0.6 * (over ? warp : weft) + slub;
    });
    return canvasTexture(cnv, { repeat: Wv.repeat, srgb: false });
  }

  /** underpaint DataTexture from plan.underpaint: rgb = lightened stroke colour (sRGB), a = paint time / 16 s */
  function underpaintTexture(plan) {
    const U = plan.underpaint, n = U.w * U.h, data = new Uint8Array(n * 4), c = new THREE.Color(), white = new THREE.Color("#ffffff");
    // per-cell stroke colour (linear), then a few box-blur passes so the wash is a soft scumble, not a cell mosaic
    let rgb = new Float32Array(n * 3);
    for (let q = 0; q < n; q++) { c.set(U.color[q] ?? P.canvas).lerp(white, CV.underpaint.lighten); rgb[3 * q] = c.r; rgb[3 * q + 1] = c.g; rgb[3 * q + 2] = c.b; }
    for (let pass = 0; pass < (CV.underpaint.blur ?? 3); pass++) {
      const out = new Float32Array(n * 3);
      for (let j = 0; j < U.h; j++) for (let i = 0; i < U.w; i++) {
        let r = 0, g = 0, b = 0, k = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const a = i + di, bb = j + dj; if (a < 0 || bb < 0 || a >= U.w || bb >= U.h) continue;
          const s = 3 * (bb * U.w + a); r += rgb[s]; g += rgb[s + 1]; b += rgb[s + 2]; k++;
        }
        const q = 3 * (j * U.w + i); out[q] = r / k; out[q + 1] = g / k; out[q + 2] = b / k;
      }
      rgb = out;
    }
    for (let q = 0; q < n; q++) {
      c.setRGB(rgb[3 * q], rgb[3 * q + 1], rgb[3 * q + 2]); const h = c.getHex();
      data[4 * q] = (h >> 16) & 255; data[4 * q + 1] = (h >> 8) & 255; data[4 * q + 2] = h & 255;
      const t = U.time[q];
      data[4 * q + 3] = Number.isFinite(t) ? Math.round(clamp(t / 16) * 254) : 255;
    }
    const tex = new THREE.DataTexture(data, U.w, U.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  /** canvasBoard(plan) -> Group (table, stretcher, canvas); userData.update(t) fades the underpaint in */
  function canvasBoard(plan) {
    const g = new THREE.Group(); g.name = "canvasBoard";
    const tsize = spec.table.size;
    const tm = materials.table;
    const table = new THREE.Mesh(new THREE.PlaneGeometry(tsize, tsize), tm);
    table.rotation.x = -Math.PI / 2; table.receiveShadow = true; table.name = "table"; g.add(table);
    const st = new THREE.Mesh(new THREE.BoxGeometry(CW, CV.thickness - 0.002, CH), [materials.canvasEdge, materials.canvasEdge, materials.canvasEdge, materials.canvasEdge, materials.canvasEdge, materials.canvasEdge]);
    st.position.y = (CV.thickness - 0.002) / 2; st.castShadow = true; st.receiveShadow = true; st.name = "stretcher"; g.add(st);
    const uTime = { value: 0 };
    const under = underpaintTexture(plan);
    uploadTexture(stage, under);
    const mat = materials.canvas.clone();
    mat.bumpMap = weaveTexture(); mat.bumpScale = CV.weave.bump;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uUnder = { value: under };
      shader.uniforms.uTime = uTime;
      shader.uniforms.uStrength = { value: CV.underpaint.strength };
      shader.uniforms.uFade = { value: CV.underpaint.fade };
      shader.uniforms.uCSize = { value: new THREE.Vector2(CW, CH) };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform vec2 uCSize;\nvarying vec2 vCUv;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vCUv = position.xy / uCSize + 0.5;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D uUnder;\nuniform float uTime;\nuniform float uStrength;\nuniform float uFade;\nvarying vec2 vCUv;")
        .replace("#include <map_fragment>", `#include <map_fragment>
  vec4 upd = texture2D(uUnder, vCUv);
  float upT = upd.a * (16.0 * 255.0 / 254.0);
  float upR = smoothstep(upT, upT + uFade, uTime) * (1.0 - step(0.995, upd.a));
  diffuseColor.rgb = mix(diffuseColor.rgb, upd.rgb, upR * uStrength);`);
    };
    mat.customProgramCacheKey = () => "impasto-canvas";
    const cv = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH, 1, 1), mat);
    cv.rotation.x = -Math.PI / 2; cv.position.y = top; cv.receiveShadow = true; cv.name = "canvas"; g.add(cv);
    g.userData.update = (t) => { uTime.value = t; };
    g.userData.canvas = cv;
    return g;
  }

  // ---------------------------------------------------------------- the strokes (one InstancedMesh)
  /** strokeField(plan) -> InstancedMesh of every stroke; userData.update(t) bends, grows and flows them all */
  function strokeField(plan, o = {}) {
    const N = plan.n, su = o.segU ?? SK.segU, sv = o.segV ?? SK.segV;
    // unit grid: u 0..1 along (x), v -1..1 across (z); y = 0 (height comes from the shader)
    const pos = [], nor = [], idx = [];
    for (let j = 0; j <= sv; j++) for (let i = 0; i <= su; i++) { pos.push(i / su, 0, -1 + (2 * j) / sv); nor.push(0, 1, 0); }
    for (let j = 0; j < sv; j++) for (let i = 0; i < su; i++) {
      const a = j * (su + 1) + i, b = a + 1, c = a + (su + 1), d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    const aDim = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
    const aAnim = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
    const aCA = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    const aCB = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    aDim.setUsage(THREE.DynamicDrawUsage); aAnim.setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.Color();
    plan.strokes.forEach((st, j) => {
      aDim.setXYZW(j, st.L, st.W, st.H, 0);
      aAnim.setXYZW(j, 0, st.seed, SK.lift + st.order * SK.liftStep, st.flip);
      col.set(st.cA); aCA.setXYZ(j, col.r, col.g, col.b);
      col.set(st.cB); aCB.setXYZ(j, col.r, col.g, col.b);
    });
    geo.setAttribute("aDim", aDim); geo.setAttribute("aAnim", aAnim); geo.setAttribute("aCA", aCA); geo.setAttribute("aCB", aCB);
    const uniforms = {
      uP1: { value: new THREE.Vector4(SK.bristles, SK.groove, SK.rim, SK.rimAt) },
      uP2: { value: new THREE.Vector4(SK.blob, SK.blobAt, SK.blobW, SK.edge) },
      uP3: { value: new THREE.Vector4(SK.startTaper, SK.endCap, SK.blobWiden, SK.streak) },
      uClip: { value: new THREE.Vector4(-CW / 2 + 0.004, CW / 2 - 0.004, -CH / 2 + 0.004, CH / 2 - 0.004) },
      uNormalK: { value: SK.normalStrength }, uRough: { value: SK.roughness }, uGrooveRough: { value: SK.grooveRough },
    };
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: SK.roughness, metalness: 0, envMapIntensity: SK.envBoost });
    mat.name = "paint";
    mat.onBeforeCompile = strokeShader(uniforms);
    mat.customProgramCacheKey = () => "impasto-stroke";
    mat.shadowSide = THREE.FrontSide;
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = strokeDepthShader(uniforms);
    depth.customProgramCacheKey = () => "impasto-stroke-depth";
    depth.side = THREE.FrontSide;
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.customDepthMaterial = depth;
    mesh.name = "strokes"; mesh.frustumCulled = false;
    mesh.castShadow = true; mesh.receiveShadow = true;
    const state = new Float32Array(N * 5), M = mesh.instanceMatrix.array, D = aDim.array, A = aAnim.array;
    mesh.userData.update = (t) => {
      plan.stateAt(t, state);
      for (let j = 0; j < N; j++) {
        const b = j * 5, prog = state[b + 4], m = j * 16;
        D[j * 4 + 3] = -state[b + 3];          // canvas curvature (ccw +) -> local (+ toward local +z = clockwise on canvas)
        A[j * 4] = prog;
        const on = prog > 0 ? 1 : 0, c = Math.cos(state[b + 2]) * on, s = Math.sin(state[b + 2]) * on;
        M[m] = c; M[m + 1] = 0; M[m + 2] = -s; M[m + 3] = 0;
        M[m + 4] = 0; M[m + 5] = on; M[m + 6] = 0; M[m + 7] = 0;
        M[m + 8] = s; M[m + 9] = 0; M[m + 10] = c; M[m + 11] = 0;
        M[m + 12] = state[b] - CW / 2; M[m + 13] = top; M[m + 14] = CH / 2 - state[b + 1]; M[m + 15] = 1;
      }
      mesh.instanceMatrix.needsUpdate = true; aDim.needsUpdate = true; aAnim.needsUpdate = true;
    };
    mesh.userData.update(0);
    return mesh;
  }

  // ---------------------------------------------------------------- raking light
  /** rake(keys) -> { update(t) } sets the key light's direction from [{ t, elev, az, intensity? }] (eased, pure f(t)) */
  function rake(keys = spec.rakeDefault, o = {}) {
    const key = lights.key, dist = o.distance ?? 9, base = key.intensity;
    const sample = (t) => {
      if (t <= keys[0].t) return keys[0];
      for (let i = 1; i < keys.length; i++) if (t <= keys[i].t) {
        const a = keys[i - 1], b = keys[i], u = ease.inOutSine((t - a.t) / Math.max(1e-6, b.t - a.t));
        return { elev: lerp(a.elev, b.elev, u), az: lerp(a.az, b.az, u), intensity: lerp(a.intensity ?? 1, b.intensity ?? 1, u) };
      }
      return keys[keys.length - 1];
    };
    return {
      sample,
      update(t) {
        const k = sample(t), ce = Math.cos(k.elev);
        key.position.set(ce * Math.cos(k.az) * dist, Math.sin(k.elev) * dist, -ce * Math.sin(k.az) * dist);
        key.target.position.set(0, 0, 0);
        key.intensity = base * (k.intensity ?? 1);
        key.updateMatrixWorld(); key.target.updateMatrixWorld();
      },
    };
  }

  // ---------------------------------------------------------------- overlay caption chip
  /** caption() -> overlay chip (cream plate, three paint dabs, italic serif); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1100, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.italic ? "italic " : ""}${Q.weight} ${Q.cap * 1.25}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.75), ic = Math.round(Q.h * 0.62);
      const pw = Math.min(W - 16, pad + ic + pad * 0.8 + tw + pad), ph = Q.h, oy = 6;
      const ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(20,24,40,0.30)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 12); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 12); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 11); x.stroke();
      // icon: three short fat dabs (ultramarine, chrome yellow, viridian)
      const cx = ox + pad + ic / 2, cy = oy + ph / 2;
      Q.dab.forEach((c, k) => {
        x.save(); x.translate(cx - ic * 0.3 + k * ic * 0.3, cy + (k - 1) * 2); x.rotate(-0.9 + k * 0.25);
        x.fillStyle = c; x.beginPath(); x.ellipse(0, 0, ic * 0.42, ic * 0.12, 0, 0, Math.PI * 2); x.fill(); x.restore();
      });
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + pad * 0.8, oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text: a > 0.003 ? text : "" }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /** painting(plan, { rake }) -> { group, board, strokes, light, update(t) } (adds itself to the scene) */
  function painting(plan, o = {}) {
    const group = new THREE.Group(); group.name = "impasto";
    const board = canvasBoard(plan); group.add(board);
    const sf = strokeField(plan, o); group.add(sf);
    stage.scene.add(group);
    const light = rake(o.rake ?? spec.rakeDefault);
    return {
      group, board, strokes: sf, light,
      update(t) { board.userData.update(t); sf.userData.update(t); light.update(t); },
    };
  }

  const props = { canvasBoard, strokeField, rake, caption, painting, weaveTexture };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: strokesPlanner, motion: strokesPlanner, toWorld,
  };
}
