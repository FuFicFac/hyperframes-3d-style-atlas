// styles/ink-wash/style.js — "Ink Wash": a brush-and-ink painting coming to life on a big sheet of fibrous paper.
//
// The ink layer is an offscreen half-float render target re-rendered EVERY frame from the plan and t alone (no state is
// carried between frames, any seek order works): RGB = optical density per channel, A = wetness. Marks are additive in
// density (Beer–Lambert), so overlapping ink darkens as real ink does. Three mark shaders:
//   strokes — one ribbon mesh per stroke (per-vertex arc length, landing time, half width, ink load); a round brush head
//             travels the ribbon; core + feathered bleed halo + dry-brush streaks + dried darker rim. Each stroke draws with
//             a distinct stencil ref so a ribbon that folds on a tight bend never double-inks itself.
//   washes  — a quad per wash sampling a signed-distance texture of its shape (baked once): a sweep front lays it in, the
//             edge blooms outward along the fibres and settles with a darker rim; grade and mist fade it.
//   blots   — wet-in-wet blooms (petalled soft flower with a back-run rim) and splatter drops, one merged geometry.
//   seals   — an abstract geometric seal mask (canvas, baked once) pressed at its time.
// The paper shader multiplies its colour by exp(-density) and lowers roughness where the ink is still wet.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { RoundedBoxGeometry } from "../../kit/builders.js";
import { rng, clamp, lerp, smoothstep, hash01 } from "../../kit/time.js";
import { fbm2 } from "../../kit/noise.js";
import { STYLE_SPEC } from "./spec.js";
import * as INK from "./inkplan.js";
export { STYLE_SPEC };

const { planInk, brushPose, stampPose, ripplesAt, polySdf, toWorld } = INK;

// 2D canvas with willReadFrequently (CPU raster path: identical on every page load)
function canvas2d(w, h) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  return [cv, ctx];
}
const lin = (hex) => new THREE.Color(hex); // THREE.Color(hex) is linear-sRGB internally

const GLSL_NOISE = /* glsl */ `
float ihash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = ihash(i), b = ihash(i + vec2(1.0, 0.0)), c = ihash(i + vec2(0.0, 1.0)), d = ihash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`;

const STROKE_VS = /* glsl */ `
attribute float aS; attribute float aSide; attribute float aT; attribute float aV; attribute float aW; attribute float aLoad;
attribute vec4 aSt; attribute vec4 aSt2; attribute vec3 aAbs;
varying vec2 vP; varying float vS, vSide, vT, vV, vW, vLoad; varying vec4 vSt, vSt2; varying vec3 vAbs;
void main() {
  vP = position.xy; vS = aS; vSide = aSide; vT = aT; vV = aV; vW = aW; vLoad = aLoad; vSt = aSt; vSt2 = aSt2; vAbs = aAbs;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const STROKE_FS = /* glsl */ `
uniform float uTime, uBleed, uTauBleed, uTauDry, uLighten, uEdgeDark, uHalo, uDryA, uDryB, uBristles, uStreak, uAA, uFibreInk;
uniform sampler2D uFibre; uniform vec2 uFibreRep, uSheet;
varying vec2 vP; varying float vS, vSide, vT, vV, vW, vLoad; varying vec4 vSt, vSt2; varying vec3 vAbs;
${GLSL_NOISE}
void main() {
  if (uTime < vSt2.z) discard;
  float L = vSt.z, seed = vSt.y;
  float sc = clamp(vS, 0.0, L), along = vS - sc;
  float ahead = max(0.0, vT - uTime) * max(vV, 0.05);
  float dist = length(vec2(along + ahead, vSide));
  float age = max(0.0, uTime - vT);
  vec2 fuv = (vP / uSheet + 0.5) * uFibreRep;
  float fib = texture2D(uFibre, fuv).r;
  float lowN = vnoise(vP * 9.0 + seed * 0.37);
  float dryness = smoothstep(uDryA, uDryB, 1.0 - vLoad);
  float wet = vSt.w * (1.0 - dryness * 0.85);
  float w = vW;
  float rag = ((vnoise(vec2(vS * 55.0, seed * 0.13)) - 0.5) * (0.16 + 0.4 * dryness) + (vnoise(vec2(vS * 260.0, seed * 0.29 + sign(vSide))) - 0.5) * 0.12) * w;
  float we = w + rag;
  float core = 1.0 - smoothstep(we - uAA, we + uAA, dist);
  float bleedR = uBleed * wet * (1.0 - exp(-age / uTauBleed));
  float haloEdge = we + bleedR * (0.2 + 1.1 * fib + 0.5 * lowN);
  float halo = (1.0 - smoothstep(we - uAA, haloEdge + uAA, dist)) * (0.45 + 0.55 * fib);
  // flying white: bristle streaks open up as the brush runs dry (more at the brush edges)
  float b = vSide / max(w, 1e-4);
  float streak = mix(vnoise(vec2(b * uBristles + seed * 3.1, vS * uStreak + seed)), fib, 0.3);
  float thr = dryness * (0.6 + 0.3 * abs(b));  // never fully blank: a dry brush still drags some streaks
  float keep = mix(1.0, smoothstep(thr - 0.07, thr + 0.07, streak), smoothstep(0.0, 0.12, dryness));
  float cov = max(core, halo * uHalo) * keep;
  if (cov < 0.003) discard;
  float dryP = 1.0 - exp(-age / uTauDry);
  float pool = vSt2.x * exp(-max(vS, 0.0) / vSt2.y) * wet;
  float tone = vSt.x * (0.55 + 0.45 * smoothstep(0.0, 0.55, vLoad)) * (1.0 + pool);
  tone *= 1.0 - uLighten * dryP * wet;
  float striate = 0.8 + 0.2 * smoothstep(0.2, 0.8, streak) + 0.12 * (lowN - 0.5);
  float dens = tone * (core * striate + (1.0 - core) * halo * uHalo * 0.6) * keep;
  float ring = exp(-pow((dist - we) / (0.0022 + 0.1 * w), 2.0)) * wet * dryP * uEdgeDark;
  dens += tone * ring * keep * core;
  dens *= 1.0 - uFibreInk * 0.5 + uFibreInk * fib;
  gl_FragColor = vec4(vAbs * dens, cov * wet * (1.0 - dryP));
}`;

const PLAIN_VS = /* glsl */ `
varying vec2 vP;
void main() { vP = (modelMatrix * vec4(position, 1.0)).xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WASH_FS = /* glsl */ `
uniform float uTime, uTauDry, uLighten, uTone, uBloom, uTau, uInset, uSeed, uEdge, uFibreInk;
uniform vec4 uBox; uniform vec2 uDir, uQ, uT, uGrade, uMist, uFibreRep, uSheet; uniform vec3 uAbs;
uniform sampler2D uSdf, uFibre;
varying vec2 vP;
${GLSL_NOISE}
void main() {
  vec2 uv = (vP - uBox.xy) / (uBox.zw - uBox.xy);
  float d = texture2D(uSdf, uv).r;
  float q = (dot(vP, uDir) - uQ.x) / (uQ.y - uQ.x);
  float fib = texture2D(uFibre, (vP / uSheet + 0.5) * uFibreRep).r;
  float n1 = vnoise(vP * 5.0 + uSeed), n2 = vnoise(vP * 21.0 + uSeed * 1.7);
  float qn = clamp(q + 0.06 * (n1 - 0.5), 0.0, 1.0);
  float age = uTime - mix(uT.x, uT.y, qn);
  if (age < -0.04) discard;
  float laid = smoothstep(-0.04, 0.05, age);
  float a = max(age, 0.0);
  float grow = 1.0 - exp(-a / uTau);
  float edge = -uInset + uBloom * grow * (0.25 + 0.8 * fib + 0.55 * n2);
  float soft = 0.0018 + 0.005 * grow;
  float cov = (1.0 - smoothstep(edge - soft, edge + soft, d)) * laid;
  if (cov < 0.002) discard;
  float dryP = 1.0 - exp(-a / uTauDry);
  float mist = 1.0 - smoothstep(uMist.x, uMist.y, q + 0.1 * (n1 - 0.5));
  float gradeK = mix(uGrade.x, uGrade.y, clamp(q, 0.0, 1.0));
  float mott = 0.84 + 0.32 * vnoise(vP * 13.0 + uSeed * 0.3);
  float dens = uTone * gradeK * mist * mott * (1.0 - 0.6 * uLighten * dryP);
  float rim = exp(-pow((d - edge + 0.004) / 0.007, 2.0)) * uEdge * (0.35 + 0.65 * dryP) * (0.4 + 0.6 * mist);
  dens *= 1.0 + rim;
  dens *= 1.0 - uFibreInk * 0.5 + uFibreInk * fib;
  gl_FragColor = vec4(uAbs * dens * cov, cov * (1.0 - dryP) * (0.3 + 0.7 * mist));
}`;

const BLOT_VS = /* glsl */ `
attribute vec2 aC; attribute vec4 aB; attribute vec4 aB2; attribute vec3 aAbs;
varying vec2 vP, vC; varying vec4 vB, vB2; varying vec3 vAbs;
void main() { vP = position.xy; vC = aC; vB = aB; vB2 = aB2; vAbs = aAbs; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BLOT_FS = /* glsl */ `
uniform float uTime, uTauDry, uFibreInk; uniform sampler2D uFibre; uniform vec2 uFibreRep, uSheet;
varying vec2 vP, vC; varying vec4 vB, vB2; varying vec3 vAbs;   // vB = (r, t0, tau, tone)  vB2 = (seed, kind, rim, petals)
${GLSL_NOISE}
void main() {
  float age = uTime - vB.y;
  if (age < 0.0) discard;
  vec2 dp = vP - vC; float rad = length(dp);
  float ang = atan(dp.y, dp.x);
  float fib = texture2D(uFibre, (vP / uSheet + 0.5) * uFibreRep).r;
  float grow = 1.0 - exp(-age / vB.z);
  vec2 cs = vec2(cos(ang), sin(ang));
  float petal = vnoise(cs * vB2.w * 0.55 + vB2.x) * 0.7 + vnoise(cs * vB2.w * 1.05 + vB2.x * 2.0) * 0.3;
  float r = vB.x * grow * (0.84 + 0.26 * petal) + 0.008 * grow * fib;
  float soft = vB2.y > 0.5 ? 0.0012 : 0.003 + 0.016 * grow;
  float cov = 1.0 - smoothstep(r - soft, r + soft, rad);
  if (cov < 0.003) discard;
  float dryP = 1.0 - exp(-age / uTauDry);
  float dens;
  if (vB2.y > 0.5) dens = vB.w * (0.9 + 0.2 * fib);
  else {
    float k = clamp(rad / max(r, 1e-4), 0.0, 1.0);
    dens = vB.w * (0.38 + 0.62 * pow(k, 1.4)) * (0.85 + 0.3 * vnoise(vP * 30.0 + vB2.x));
    dens += vB.w * vB2.z * exp(-pow((rad - r * 0.94) / (0.004 + 0.05 * r), 2.0)) * (0.4 + 0.6 * dryP);
  }
  dens *= 1.0 - uFibreInk * 0.5 + uFibreInk * fib;
  gl_FragColor = vec4(vAbs * dens * cov, cov * (1.0 - dryP));
}`;
const SEAL_FS = /* glsl */ `
uniform float uTime, uT0, uTone; uniform vec3 uAbs; uniform sampler2D uMask; uniform vec4 uBox;
varying vec2 vP;
void main() {
  vec2 uv = (vP - uBox.xy) / (uBox.zw - uBox.xy);
  float m = texture2D(uMask, uv).r;
  float k = smoothstep(uT0, uT0 + 0.07, uTime);
  if (m * k < 0.003) discard;
  gl_FragColor = vec4(uAbs * m * k * uTone, 0.0);
}`;

/**
 * createStyle(stage, opts?) -> style
 *   props:   painting({ plan }) (the whole set: mat, sheet + ink layer, ink stone, water bowl, colour dishes, brush rest,
 *            ink stick, brush, seal block; userData.update(t)), sheet(), mat(), brush(), inkStone(), waterBowl(), colourDish(),
 *            brushRest(), inkStick(), sealBlock(), inkLayer(plan), caption(labels)
 *   plan:    the inkplan.js module (planInk, brushPose, stampPose, sheetShot, mountainShape, boatItems, birdItem, inkVoices, beatTones ...)
 */
export function createStyle(stage, opts = {}) {
  const S = STYLE_SPEC, P = S.palette, SH = S.sheet, K = S.ink, B = S.brush, PR = S.props;
  const { materials, lights, post } = applyStyleSpec(stage, S, opts);
  const textStyle = { font: FONTS[S.text.font] ?? S.text.font, weight: S.text.weight, color: S.text.color, height: S.text.height };
  const renderer = stage.renderer;
  const W = SH.w, H = SH.h;

  // ---------------------------------------------------------------------------------------------- shared textures
  // fibre field: tileable, R = 0..1, long soft kozo strands over fine grain (baked once)
  const fibreTex = (() => {
    const N = 512, [cv, ctx] = canvas2d(N, N), r = rng("ink-wash:fibres");
    ctx.fillStyle = "rgb(128,128,128)"; ctx.fillRect(0, 0, N, N);
    const img = ctx.getImageData(0, 0, N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = 0.5 + 0.22 * (fbm2(x / N * 16, y / N * 16, { seed: 7, octaves: 3, period: 16 }) - 0.5) + 0.12 * (hash01(x, y, 3) - 0.5);
      const i = (y * N + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(clamp(v) * 255); img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.lineCap = "round";
    for (let k = 0; k < 420; k++) {
      const x0 = r.range(0, N), y0 = r.range(0, N), len = r.range(20, 110), a0 = r.range(0, Math.PI * 2), curl = r.range(-0.03, 0.03);
      const bright = r.chance(0.6);
      ctx.strokeStyle = bright ? `rgba(255,255,255,${r.range(0.08, 0.3).toFixed(3)})` : `rgba(0,0,0,${r.range(0.05, 0.18).toFixed(3)})`;
      ctx.lineWidth = r.range(0.6, 1.8);
      for (const [ox, oy] of [[0, 0], [-N, 0], [N, 0], [0, -N], [0, N], [-N, -N], [N, N], [-N, N], [N, -N]]) {
        ctx.beginPath();
        let x = x0 + ox, y = y0 + oy, a = a0;
        ctx.moveTo(Math.round(x * 4) / 4, Math.round(y * 4) / 4);
        for (let s = 0; s < len; s += 4) { a += curl * 4; x += Math.cos(a) * 4; y += Math.sin(a) * 4; ctx.lineTo(Math.round(x * 4) / 4, Math.round(y * 4) / 4); }
        ctx.stroke();
      }
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
    return t;
  })();
  // large-scale paper mottling across the whole sheet (non-repeating)
  const mottleTex = (() => {
    const w = 256, h = Math.round(256 * H / W), [cv, ctx] = canvas2d(w, h), img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = fbm2(x / w * 5, y / h * 5 * H / W, { seed: 19, octaves: 4 });
      const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(clamp(v) * 255); img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace;
    return t;
  })();
  const feltTex = (() => {
    const N = 256, [cv, ctx] = canvas2d(N, N), img = ctx.createImageData(N, N);
    const a = lin(P.felt), b = lin(P.feltDark);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = clamp(0.5 + (fbm2(x / N * 24, y / N * 24, { seed: 23, octaves: 3, period: 24 }) - 0.5) * 1.4 + (hash01(x, y, 9) - 0.5) * S.mat.fibre * 4);
      const i = (y * N + x) * 4;
      img.data[i] = Math.round(toSrgb(lerp(b.r, a.r, v)) * 255); img.data[i + 1] = Math.round(toSrgb(lerp(b.g, a.g, v)) * 255); img.data[i + 2] = Math.round(toSrgb(lerp(b.b, a.b, v)) * 255); img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 9.5); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  })();

  // ---------------------------------------------------------------------------------------------- colour -> absorbance
  const paperLin = lin(P.paper);
  const absOf = (name) => {
    const c = lin(P[name] ?? name);
    return [c.r / paperLin.r, c.g / paperLin.g, c.b / paperLin.b].map((k) => -Math.log(clamp(k, 0.004, 1)));
  };

  // ---------------------------------------------------------------------------------------------- the ink layer
  /**
   * inkLayer(plan) -> { texture, render(t), scene, camera }
   *   Re-renders every mark from the plan at time t into a half-float target (cleared first): pure in t.
   */
  function inkLayer(plan) {
    const px = K.px, py = Math.round((px * H) / W);
    const rt = new THREE.WebGLRenderTarget(px, py, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: true,
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    });
    rt.texture.colorSpace = THREE.NoColorSpace;
    rt.texture.anisotropy = 8;
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -10, 10);
    cam.position.z = 5; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    const common = {
      uTime: { value: 0 }, uFibre: { value: fibreTex }, uFibreRep: { value: new THREE.Vector2(...SH.fibreRepeat) }, uSheet: { value: new THREE.Vector2(W, H) },
      uTauDry: { value: K.tauDry }, uLighten: { value: K.lighten }, uFibreInk: { value: K.fibreInk },
    };
    const additive = (m) => Object.assign(m, {
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    });
    let order = 0;

    // --- washes (drawn first; order is fixed so the half-float sums are identical every frame)
    for (const wa of plan.washes) {
      const pad = 0.09, bb = [wa.bbox[0] - pad, wa.bbox[1] - pad, wa.bbox[2] + pad, wa.bbox[3] + pad];
      const sw = 192, sh = Math.max(16, Math.round((sw * (bb[3] - bb[1])) / (bb[2] - bb[0])));
      const data = new Uint16Array(sw * sh);
      for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
        const x = lerp(bb[0], bb[2], (i + 0.5) / sw), y = lerp(bb[1], bb[3], (j + 0.5) / sh);
        data[j * sw + i] = THREE.DataUtils.toHalfFloat(polySdf(wa.poly, x, y));
      }
      const sdf = new THREE.DataTexture(data, sw, sh, THREE.RedFormat, THREE.HalfFloatType);
      sdf.minFilter = sdf.magFilter = THREE.LinearFilter; sdf.needsUpdate = true;
      const m = additive(new THREE.ShaderMaterial({
        vertexShader: PLAIN_VS, fragmentShader: WASH_FS,
        uniforms: { ...common, uTime: common.uTime, uSdf: { value: sdf }, uBox: { value: new THREE.Vector4(...bb) }, uDir: { value: new THREE.Vector2(...wa.dir) },
          uQ: { value: new THREE.Vector2(wa.qMin, wa.qMax) }, uT: { value: new THREE.Vector2(wa.t0, wa.t1) }, uTone: { value: wa.tone },
          uAbs: { value: new THREE.Vector3(...absOf(wa.color)) }, uGrade: { value: new THREE.Vector2(...wa.grade) }, uMist: { value: new THREE.Vector2(...wa.mist) },
          uBloom: { value: wa.bloom }, uTau: { value: wa.tau }, uInset: { value: wa.inset }, uSeed: { value: (wa.seed % 997) * 0.37 }, uEdge: { value: wa.edge } },
      }));
      const g = new THREE.PlaneGeometry(bb[2] - bb[0], bb[3] - bb[1]);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, 0);
      mesh.renderOrder = order++; mesh.frustumCulled = false;
      scene.add(mesh);
    }

    // --- blots: blooms + splatter drops (one merged geometry)
    if (plan.blots.length) {
      const pos = [], aC = [], aB = [], aB2 = [], aAbs = [], idx = [];
      plan.blots.forEach((b, k) => {
        const R = b.r * 1.35 + 0.012, base = k * 4, A = absOf(b.color);
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          pos.push(b.c[0] + sx * R, b.c[1] + sy * R, 0); aC.push(b.c[0], b.c[1]);
          aB.push(b.r, b.t0, b.tau, b.tone); aB2.push((b.seed % 997) * 0.71, b.kind === "drop" ? 1 : 0, b.rim, b.petals); aAbs.push(...A);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("aC", new THREE.Float32BufferAttribute(aC, 2));
      g.setAttribute("aB", new THREE.Float32BufferAttribute(aB, 4));
      g.setAttribute("aB2", new THREE.Float32BufferAttribute(aB2, 4));
      g.setAttribute("aAbs", new THREE.Float32BufferAttribute(aAbs, 3));
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, additive(new THREE.ShaderMaterial({ vertexShader: BLOT_VS, fragmentShader: BLOT_FS, uniforms: common })));
      mesh.renderOrder = order++; mesh.frustumCulled = false;
      scene.add(mesh);
    }

    // --- strokes: one ribbon per stroke, each with its own stencil ref (no self double-inking on folds)
    const strokeUniforms = { ...common, uTime: common.uTime, uBleed: { value: K.bleed }, uTauBleed: { value: K.tauBleed }, uEdgeDark: { value: K.edgeDark },
      uHalo: { value: K.halo }, uDryA: { value: K.dry[0] }, uDryB: { value: K.dry[1] }, uBristles: { value: K.bristles }, uStreak: { value: K.streak }, uAA: { value: K.aa } };
    const strokeBase = additive(new THREE.ShaderMaterial({ vertexShader: STROKE_VS, fragmentShader: STROKE_FS, uniforms: strokeUniforms }));
    plan.strokes.forEach((st, k) => {
      const n = st.pts.length, A = absOf(st.color), margin = K.bleed * 1.9 + K.aa * 3 + 0.002;
      const pos = [], aS = [], aSide = [], aT = [], aV = [], aW = [], aLoad = [], aSt = [], aSt2 = [], aAbs = [], idx = [];
      const tan = (i) => { const a = st.pts[Math.max(0, i - 1)], b = st.pts[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
      const ring = (p, tg, s, R, tLand, v, w, load) => {
        const nx = -tg[1], ny = tg[0];
        for (const sd of [1, -1]) {
          pos.push(p[0] + nx * R * sd, p[1] + ny * R * sd, 0); aS.push(s); aSide.push(R * sd); aT.push(tLand); aV.push(v); aW.push(w); aLoad.push(load);
          aSt.push(st.tone, (st.seed % 997) * 0.53, st.len, st.wet); aSt2.push(st.pool, st.poolLen, st.t0, st.width); aAbs.push(...A);
        }
      };
      const t0 = tan(0), t1 = tan(n - 1);
      const capA = st.w[0] + margin, capB = st.w[n - 1] + margin;
      ring([st.pts[0][0] - t0[0] * capA, st.pts[0][1] - t0[1] * capA], t0, -capA, capA, st.t0, st.speed[0], st.w[0], st.load[0]);
      for (let i = 0; i < n; i++) ring(st.pts[i], tan(i), st.cum[i], st.w[i] + margin, st.tt[i], st.speed[i], st.w[i], st.load[i]);
      ring([st.pts[n - 1][0] + t1[0] * capB, st.pts[n - 1][1] + t1[1] * capB], t1, st.len + capB, capB, st.tt[n - 1], st.speed[n - 1], st.w[n - 1], st.load[n - 1]);
      for (let i = 0; i < n + 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      for (const [name, arr, sz] of [["aS", aS, 1], ["aSide", aSide, 1], ["aT", aT, 1], ["aV", aV, 1], ["aW", aW, 1], ["aLoad", aLoad, 1], ["aSt", aSt, 4], ["aSt2", aSt2, 4], ["aAbs", aAbs, 3]])
        g.setAttribute(name, new THREE.Float32BufferAttribute(arr, sz));
      g.setIndex(idx);
      const m = strokeBase.clone();
      m.uniforms = strokeUniforms;
      Object.assign(m, { stencilWrite: true, stencilRef: (k % 254) + 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
        stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilFuncMask: 0xff, stencilWriteMask: 0xff });
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = order++; mesh.frustumCulled = false;
      scene.add(mesh);
    });

    // --- seals (abstract geometric marks)
    for (const se of plan.seals) {
      const half = se.size / 2, bb = [se.c[0] - half, se.c[1] - half, se.c[0] + half, se.c[1] + half];
      const m = additive(new THREE.ShaderMaterial({ vertexShader: PLAIN_VS, fragmentShader: SEAL_FS,
        uniforms: { uTime: common.uTime, uT0: { value: se.t0 }, uTone: { value: 1.0 }, uAbs: { value: new THREE.Vector3(...absOf(se.color)) },
          uMask: { value: sealMask(se) }, uBox: { value: new THREE.Vector4(...bb) } } }));
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(se.size, se.size), m);
      mesh.position.set(se.c[0], se.c[1], 0);
      mesh.renderOrder = order++; mesh.frustumCulled = false;
      scene.add(mesh);
    }

    const clear = new THREE.Color();
    function render(t) {
      common.uTime.value = t;
      const prevRT = renderer.getRenderTarget(), prevAlpha = renderer.getClearAlpha();
      renderer.getClearColor(clear);
      const prevAuto = renderer.autoClear;
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      renderer.autoClear = false;
      renderer.render(scene, cam);
      renderer.autoClear = prevAuto;
      renderer.setRenderTarget(prevRT);
      renderer.setClearColor(clear, prevAlpha);
    }
    return { texture: rt.texture, target: rt, render, scene, camera: cam };
  }

  /** sealMask(seal) -> CanvasTexture: an abstract geometric seal (square border, carved circle and bars), worn edges. */
  function sealMask(se) {
    const N = 256, [cv, ctx] = canvas2d(N, N), r = rng(`seal:${se.seed}`);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, N, N);
    ctx.fillStyle = "#fff";
    const m = 10;
    ctx.beginPath(); ctx.roundRect(m, m, N - 2 * m, N - 2 * m, 14); ctx.fill();
    ctx.fillStyle = "#000"; // carved (negative) geometry
    ctx.lineWidth = 15; ctx.strokeStyle = "#000"; ctx.lineCap = "square";
    ctx.beginPath(); ctx.roundRect(34, 34, N - 68, N - 68, 8); ctx.stroke();
    if (se.pattern === 1) {
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(70, 80 + k * 48); ctx.lineTo(N - 70, 80 + k * 48); ctx.stroke(); }
    } else {
      ctx.beginPath(); ctx.arc(N / 2, N / 2 - 10, 46, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(72, N - 72); ctx.lineTo(N - 72, N - 72); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(N / 2, N / 2 + 36); ctx.lineTo(N / 2, N - 72); ctx.stroke();
    }
    // wear: speckle and a soft uneven press
    const img = ctx.getImageData(0, 0, N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      let v = img.data[i] / 255;
      const press = 0.78 + 0.22 * fbm2(x / N * 3, y / N * 3, { seed: se.seed % 97, octaves: 3 });
      if (hash01(x, y, se.seed % 1013) < 0.07) v *= 0.25;
      v *= press;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(clamp(v) * 255);
    }
    ctx.putImageData(img, 0, 0);
    void r;
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.flipY = true;
    return t;
  }

  // ---------------------------------------------------------------------------------------------- set pieces
  const shadowed = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
  const W3 = (x, y, h = 0) => new THREE.Vector3(...toWorld(x, y, h));

  function mat(o = {}) {
    const m = materials.felt;
    m.map = feltTex; m.needsUpdate = true;
    const mesh = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(o.w ?? S.mat.w, o.h ?? S.mat.h), m), false, true);
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = -0.003;
    // soft shadow of the sheet's lifted edges on the felt
    const [cv, ctx] = canvas2d(256, 160);
    const img = ctx.createImageData(256, 160);
    for (let y = 0; y < 160; y++) for (let x = 0; x < 256; x++) {
      const u = (x + 0.5) / 256, v = (y + 0.5) / 160, e = SH.shadow.spread;
      const dx = Math.max(0, Math.abs(u - 0.5) * (W + 2 * e) - W / 2 + e * 0.4), dy = Math.max(0, Math.abs(v - 0.5) * (H + 2 * e) - H / 2 + e * 0.4);
      const a = Math.exp(-((dx * dx + dy * dy) / (e * e * 0.18)));
      const i = (y * 256 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 0; img.data[i + 3] = Math.round(a * 255);
    }
    ctx.putImageData(img, 0, 0);
    const st = new THREE.CanvasTexture(cv);
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(W + 2 * SH.shadow.spread, H + 2 * SH.shadow.spread),
      new THREE.MeshBasicMaterial({ map: st, transparent: true, opacity: SH.shadow.opacity, depthWrite: false, color: 0x000000 }));
    sm.rotation.x = -Math.PI / 2; sm.position.set(0.012, -0.0015, 0.01);
    const g = new THREE.Group(); g.add(mesh, sm);
    return g;
  }

  /** sheet(inkTexture) -> the paper: fibrous off-white, deckled edges, absorbs the ink layer. */
  function sheet(inkTexture) {
    const m = materials.paper;
    const paperC = lin(P.paper);
    m.color.copy(paperC);
    m.transparent = true;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        inkMap: { value: inkTexture }, fibreMap: { value: fibreTex }, mottleMap: { value: mottleTex }, fibreRep: { value: new THREE.Vector2(...SH.fibreRepeat) },
        sheetSize: { value: new THREE.Vector2(W, H) }, deckle: { value: SH.deckle }, mottleAmt: { value: SH.mottle }, fibreTone: { value: SH.fibreTone },
        wetRough: { value: SH.wetRoughness }, fibreInk: { value: K.fibreInk },
      });
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vSheetUv;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvSheetUv = uv;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec2 vSheetUv;
uniform sampler2D inkMap, fibreMap, mottleMap; uniform vec2 fibreRep, sheetSize; uniform float deckle, mottleAmt, fibreTone, wetRough, fibreInk;
float inkWet = 0.0;`)
        .replace("#include <map_fragment>", `#include <map_fragment>
{
  float fib = texture2D(fibreMap, vSheetUv * fibreRep).r;
  float mot = texture2D(mottleMap, vSheetUv).r;
  diffuseColor.rgb *= 1.0 + mottleAmt * (mot - 0.5) * 2.0 + fibreTone * (fib - 0.5) * 2.0;
  // deckled edge: fibrous, uneven, a little translucent
  vec2 dm = min(vSheetUv, 1.0 - vSheetUv) * sheetSize;
  float ed = min(dm.x, dm.y);
  float n = texture2D(fibreMap, vSheetUv * fibreRep * 0.37 + 0.13).r;
  float n2 = texture2D(mottleMap, vSheetUv * 3.0).r;
  float dk = deckle * (0.25 + 0.9 * n2 + 0.5 * n);
  float a = smoothstep(dk - 0.004, dk + 0.003, ed);
  diffuseColor.a *= a * (0.9 + 0.1 * smoothstep(dk, dk + 0.02, ed));
  if (diffuseColor.a < 0.02) discard;
  vec4 ink = texture2D(inkMap, vSheetUv);
  diffuseColor.rgb *= exp(-max(ink.rgb, 0.0) * (1.0 - fibreInk * 0.4 + fibreInk * 0.8 * fib));
  inkWet = clamp(ink.a, 0.0, 1.0);
}`)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, wetRough, inkWet);");
    };
    m.customProgramCacheKey = () => "ink-wash-paper";
    m.needsUpdate = true;
    const mesh = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(W, H), m), false, true);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 1;
    return mesh;
  }

  function inkStone(o = {}) {
    const D = PR.inkStone, g = new THREE.Group();
    const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(D.w, D.h, D.d, 4, 0.018), materials.stone));
    body.position.y = D.h / 2; g.add(body);
    // the well (pooled ink) toward the far end, the flat grinding face toward the near end
    const pool = shadowed(new THREE.Mesh(new THREE.CircleGeometry(1, 48), materials.inkPool), false, true);
    pool.scale.set(D.well[0], D.well[1], 1); pool.rotation.x = -Math.PI / 2; pool.position.set(0, D.h + 0.0012, -D.d * 0.12);
    g.add(pool);
    const lip = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.12, 48), new THREE.MeshStandardMaterial({ color: P.stoneEdge, roughness: 0.75 }));
    lip.scale.set(D.well[0], D.well[1], 1); lip.rotation.x = -Math.PI / 2; lip.position.set(0, D.h + 0.0008, -D.d * 0.12);
    g.add(lip);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(D.w * 0.7, D.d * 0.28), new THREE.MeshPhysicalMaterial({ color: "#1c1c1d", roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
    face.rotation.x = -Math.PI / 2; face.position.set(0, D.h + 0.0009, D.d * 0.28);
    g.add(face);
    return g;
  }
  function inkStick() {
    const m = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.024, 0.05, 3, 0.006), materials.inkStick));
    m.position.y = 0.012;
    return m;
  }
  function bowlGeometry(r, h, wall = 0.01) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(new THREE.Vector2(r * 0.55 + r * 0.45 * Math.sin(u * Math.PI / 2), h * u)); }
    pts.push(new THREE.Vector2(r - wall * 0.3, h + wall * 0.25));
    for (let i = 12; i >= 0; i--) { const u = i / 12; pts.push(new THREE.Vector2(Math.max(0.001, r * 0.55 + r * 0.45 * Math.sin(u * Math.PI / 2) - wall), Math.max(wall, h * u))); }
    pts.unshift(new THREE.Vector2(0.001, 0));
    pts.push(new THREE.Vector2(0.001, wall));
    return new THREE.LatheGeometry(pts, 64);
  }
  /** waterBowl() -> celadon bowl with a water surface that ripples from the plan's dips (userData.update(plan, t)). */
  function waterBowl() {
    const D = PR.bowl, g = new THREE.Group();
    g.add(shadowed(new THREE.Mesh(bowlGeometry(D.r, D.h), materials.glaze)));
    const wm = materials.water;
    const rip = { uAges: { value: new THREE.Vector4(-1, -1, -1, -1) }, uSwirl: { value: 0 } };
    wm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, rip);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vWp; varying vec3 vTx, vTz, vNy;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWp = position.xz; vTx = normalize(normalMatrix * vec3(1.0,0.0,0.0)); vTz = normalize(normalMatrix * vec3(0.0,0.0,1.0)); vNy = normalize(normalMatrix * vec3(0.0,1.0,0.0));");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vWp; varying vec3 vTx, vTz, vNy; uniform vec4 uAges; uniform float uSwirl;")
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
{
  float r = length(vWp) + 1e-5; float g = 0.0;
  for (int k = 0; k < 4; k++) {
    float a = uAges[k]; if (a < 0.0) continue;
    float rr = 0.015 + 0.11 * a, amp = exp(-a * 1.4) * 0.9;
    float x = (r - rr) / 0.018;
    g += amp * (cos(x * 3.0) * 3.0 / 0.018 * exp(-x * x) - sin(x * 3.0) * 2.0 * x / 0.018 * exp(-x * x)) * 0.0015;
  }
  vec2 gr = g * vWp / r;
  normal = normalize(vNy - gr.x * vTx - gr.y * vTz);
}`);
    };
    wm.customProgramCacheKey = () => "ink-wash-water";
    wm.transparent = true; wm.opacity = 0.9;
    const water = new THREE.Mesh(new THREE.CircleGeometry(D.r * 0.9, 64).rotateX(-Math.PI / 2), wm);
    water.position.y = D.water; water.receiveShadow = true;
    g.add(water);
    g.userData.update = (plan, t) => {
      const list = ripplesAt(plan, "water", t).slice(-4);
      const v = [-1, -1, -1, -1];
      list.forEach((r, i) => { v[i] = r.age; });
      rip.uAges.value.set(...v);
    };
    return g;
  }
  function colourDish(color) {
    const D = PR.dish, g = new THREE.Group();
    g.add(shadowed(new THREE.Mesh(bowlGeometry(D.r, D.h, 0.007), materials.porcelain)));
    const paint = new THREE.Mesh(new THREE.CircleGeometry(D.r * 0.68, 40).rotateX(-Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: P[color] ?? color, roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.1 }));
    paint.position.y = D.h * 0.62; paint.receiveShadow = true;
    g.add(paint);
    return g;
  }
  function brushRest() {
    const D = PR.rest, g = new THREE.Group();
    // a low porcelain rest: a bar with two raised ends and a dip in the middle
    const shape = new THREE.Shape();
    shape.moveTo(-D.w / 2, 0); shape.lineTo(-D.w / 2, D.h * 0.8); shape.quadraticCurveTo(-D.w * 0.3, D.h * 1.05, -D.w * 0.15, D.h * 0.55);
    shape.quadraticCurveTo(0, D.h * 0.3, D.w * 0.15, D.h * 0.55); shape.quadraticCurveTo(D.w * 0.3, D.h * 1.05, D.w / 2, D.h * 0.8); shape.lineTo(D.w / 2, 0); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 10 });
    geo.translate(0, 0, -0.0175);
    const m = shadowed(new THREE.Mesh(geo, materials.porcelain));
    m.rotation.y = Math.PI / 2;
    g.add(m);
    return g;
  }
  /** sealBlock() -> pale soapstone block with a vermilion-pasted face; userData.setPose(pose). Origin = centre of the face. */
  function sealBlock() {
    const D = PR.seal, g = new THREE.Group();
    const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(D.size, D.h, D.size, 3, 0.01), materials.sealStone));
    body.position.y = D.h / 2 + 0.004; g.add(body);
    const knob = shadowed(new THREE.Mesh(new THREE.SphereGeometry(D.size * 0.32, 24, 16), materials.sealStone));
    knob.scale.y = 0.6; knob.position.y = D.h + 0.012; g.add(knob);
    const paste = new THREE.Mesh(new THREE.BoxGeometry(D.size * 0.96, 0.005, D.size * 0.96), new THREE.MeshStandardMaterial({ color: P.vermilion, roughness: 0.7 }));
    paste.position.y = 0.0025; g.add(paste);
    g.userData.setPose = (p) => { g.position.set(...toWorld(p.x, p.y, p.h + 0.001)); g.rotation.set(0, 0.0, 0); g.scale.set(1, 1 - 0.04 * p.press, 1); };
    return g;
  }

  // ---------------------------------------------------------------------------------------------- the brush
  /** brush() -> a bamboo brush (tuft bends, squashes and splays). userData.setPose(pose) takes a planner brushPose. */
  function brush() {
    const L = B.tuft, g = new THREE.Group();
    // tuft: lathe from the tip (y = 0) to the root (y = L)
    const prof = [[0.0008, 0], [0.006, 0.06], [0.012, 0.22], [0.0175, 0.45], [0.0205, 0.66], [0.021, 0.82], [0.0195, 1]].map(([r, y]) => new THREE.Vector2(r * (B.tuftR / 0.021), y * L));
    const tuftGeo = new THREE.LatheGeometry(prof, 28);
    const tu = { uTip: { value: lin(P.ink) }, uHair: { value: lin(P.hair) }, uWet: { value: B.wetLen }, uBend: { value: new THREE.Vector3() }, uSquash: { value: 1 }, uSpread: { value: 1 }, uLen: { value: L } };
    const tuftMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    tuftMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, tu);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform vec3 uBend; uniform float uSquash, uSpread, uLen; varying float vYn;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
vYn = clamp(position.y / uLen, 0.0, 1.0);
transformed.xz *= 1.0 + (uSpread - 1.0) * sin(3.14159 * clamp(vYn * 1.1, 0.0, 1.0));
transformed.y *= uSquash;
transformed += uBend * pow(vYn, 1.6);`);
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uTip, uHair; uniform float uWet; varying float vYn;")
        .replace("#include <map_fragment>", "#include <map_fragment>\nfloat wetK = 1.0 - smoothstep(uWet - 0.12, uWet + 0.08, vYn);\ndiffuseColor.rgb = mix(uHair, uTip, wetK);")
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.75, 0.3, wetK);");
    };
    tuftMat.customProgramCacheKey = () => "ink-wash-tuft";
    const tuft = shadowed(new THREE.Mesh(tuftGeo, tuftMat), true, false);
    tuft.frustumCulled = false;
    g.add(tuft);
    const upper = new THREE.Group();
    const ferrule = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(B.ferruleR, B.tuftR * 0.95, B.ferrule, 24), materials.ferrule), true, false);
    ferrule.position.y = B.ferrule / 2; upper.add(ferrule);
    const handle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(B.handleR, B.handleR * 1.05, B.handle, 20), materials.bamboo), true, false);
    handle.position.y = B.ferrule + B.handle / 2; upper.add(handle);
    for (const f of [0.38, 0.78]) {
      const node = shadowed(new THREE.Mesh(new THREE.TorusGeometry(B.handleR * 1.02, 0.0028, 8, 24), materials.bambooNode), true, false);
      node.rotation.x = Math.PI / 2; node.position.y = B.ferrule + B.handle * f; upper.add(node);
    }
    const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(B.handleR * 1.08, B.handleR * 1.08, 0.022, 20), materials.ferrule), true, false);
    cap.position.y = B.ferrule + B.handle + 0.011; upper.add(cap);
    g.add(upper);

    const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3(), lean = new THREE.Vector3(B.leanDir[0], 0, B.leanDir[1]).normalize();
    const dW = new THREE.Vector3(), qUp = new THREE.Quaternion(), qLie = new THREE.Quaternion(), qInv = new THREE.Quaternion(), bendL = new THREE.Vector3();
    qLie.setFromUnitVectors(up, new THREE.Vector3(1, 0.1, 0.18).normalize());
    const colOf = (c) => lin(P[c] ?? P.ink);
    const water = lin("#9a948a");
    g.userData.setPose = (p) => {
      dW.set(p.dir[0], 0, -p.dir[1]);
      const sp = clamp((p.speed ?? 0) / 1.3);
      const trail = B.trail * sp + 0.1 * p.press;
      axis.copy(up).addScaledVector(lean, Math.tan(B.lean)).addScaledVector(dW, -Math.tan(trail)).normalize();
      qUp.setFromUnitVectors(up, axis);
      g.quaternion.copy(qUp).slerp(qLie, p.rest ?? 0);
      g.position.set(...toWorld(p.x, p.y, p.h));
      const pr = clamp(p.press) * (1 - (p.rest ?? 0));
      const squash = 1 - B.squash * pr;
      // bend: the root runs ahead of the tip in the direction of travel (tuft-local space)
      qInv.copy(g.quaternion).invert();
      bendL.copy(dW).applyQuaternion(qInv); bendL.y = 0;
      if (bendL.lengthSq() > 1e-8) bendL.normalize();
      bendL.multiplyScalar(B.bend * L * pr);
      tu.uBend.value.copy(bendL); tu.uSquash.value = squash; tu.uSpread.value = 1 + B.spread * pr;
      upper.position.set(bendL.x, L * squash, bendL.z);
      // ink on the tip: its colour, fading toward wet grey as the load runs out
      const c = colOf(p.color);
      tu.uTip.value.copy(water).lerp(c, clamp(0.25 + 0.85 * (p.load ?? 1)));
      tu.uWet.value = B.wetLen * (0.7 + 0.3 * clamp(p.load ?? 1));
    };
    g.userData.parts = { tuft, upper };
    return g;
  }

  // ---------------------------------------------------------------------------------------------- the whole set
  /**
   * painting({ plan, set = true }) -> Group: felt mat, sheet + ink layer, ink stone, ink stick, water bowl, colour dishes,
   *   brush rest, brush, seal block. userData.update(t) renders the ink layer for t and poses brush, seal block and ripples.
   */
  function painting(o = {}) {
    const plan = o.plan, ST = plan.C.stations, g = new THREE.Group();
    const layer = inkLayer(plan);
    g.add(mat(), sheet(layer.texture));
    const place = (obj, st, dx = 0, dy = 0, yaw = 0) => { obj.position.copy(W3(st.x + dx, st.y + dy, 0)); obj.rotation.y = yaw; g.add(obj); return obj; };
    const stone = place(inkStone(), ST.ink, 0, 0, 0);
    stone.position.y = 0;
    place(inkStick(), ST.ink, 0.06, -0.21, 0.12);
    const bowl = place(waterBowl(), ST.water);
    place(colourDish("vermilion"), ST.vermilion);
    place(colourDish("indigo"), ST.indigo);
    place(brushRest(), ST.rest, 0.07, 0);
    const br = brush(); g.add(br);
    const seal = sealBlock(); g.add(seal);
    g.userData.update = (t) => {
      layer.render(t);
      br.userData.setPose(brushPose(plan, t));
      seal.userData.setPose(stampPose(plan, t));
      bowl.userData.update(plan, t);
    };
    g.userData.layer = layer;
    g.userData.parts = { brush: br, seal, bowl, stone };
    return g;
  }

  // ---------------------------------------------------------------------------------------------- caption (overlay)
  const C = S.caption;
  const capFont = (px) => `${S.text.weight} ${px}px ${textStyle.font}`;
  function drawCaption(ctx, Wp, Hp, st) {
    if (!st.text) return;
    ctx.font = capFont(C.size);
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${(C.tracking * C.size).toFixed(1)}px`;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const s = 34, y0 = Math.round(Hp / 2 - s / 2);
    // a slip of paper behind the words (legible over ink, wash or felt), slightly uneven edges
    const tw = Math.round(Math.min(Wp - 20, 8 + s + 26 + ctx.measureText(st.text).width + 30));
    ctx.save();
    ctx.shadowColor = "rgba(30,24,16,0.28)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    ctx.fillStyle = C.slip; ctx.globalAlpha = C.slipAlpha;
    ctx.beginPath();
    const top = 18, bot = Hp - 18;
    ctx.moveTo(-6, top);
    for (let x = 0; x <= tw; x += 16) ctx.lineTo(x, top + (hash01(x, 1, 77) - 0.5) * 3);
    for (let y = top; y <= bot; y += 8) ctx.lineTo(tw + (hash01(y, 2, 77) - 0.5) * 7, y);
    for (let x = tw; x >= 0; x -= 16) ctx.lineTo(x, bot + (hash01(x, 3, 77) - 0.5) * 3);
    ctx.lineTo(-6, bot); ctx.closePath(); ctx.fill();
    ctx.restore();
    // a small abstract vermilion seal square, then the words in ink
    ctx.fillStyle = P.captionAccent;
    ctx.beginPath(); ctx.roundRect(8, y0, s, s, 4); ctx.fill();
    ctx.strokeStyle = "rgba(255,248,236,0.85)"; ctx.lineWidth = 3;
    ctx.strokeRect(15, y0 + 7, s - 14, s - 14);
    ctx.fillStyle = P.caption;
    ctx.fillText(st.text, 8 + s + 26, Math.round(Hp / 2) + 2);
  }
  /** caption(labels) -> overlay caption (exact colours, after post). labels = [{ t0, t1, text }]; userData.update(t). */
  function caption(labels = [], o = {}) {
    const m = screenCanvas(stage, C.w, C.h, drawCaption, { upload: true });
    const x = o.x ?? C.x, y = o.y ?? C.y;
    m.userData.update = (t) => {
      const Lb = labels.find((l) => t >= l.t0 && t < l.t1);
      if (!Lb) { m.userData.opacity(0); return; }
      const a = smoothstep(Lb.t0, Lb.t0 + C.fadeIn, t) * (1 - smoothstep(Lb.t1 - C.fadeOut, Lb.t1, t));
      m.userData.set({ text: Lb.text });
      m.userData.place(x, y + Math.round((1 - smoothstep(Lb.t0, Lb.t0 + C.fadeIn, t)) * 8));
      m.userData.opacity(a);
    };
    return m;
  }

  const props = { painting, sheet, mat, brush, inkStone, inkStick, waterBowl, colourDish, brushRest, sealBlock, inkLayer, caption };
  const factories = {
    painting: (o) => painting({ ...(o.dims ?? {}), plan: o.dims?.plan ?? planInk(o.dims?.program ?? [], S.plan) }),
  };
  return {
    spec: S, palette: P, materials, lights, post, textStyle, camera: S.camera, props, factories, sfx: S.sfx,
    plan: INK, motion: INK, helpers: { absOf, toWorld, fibreTex },
  };
}

function toSrgb(x) { return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; }
