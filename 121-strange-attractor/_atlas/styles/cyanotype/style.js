// styles/cyanotype/style.js — "Cyanotype": a sun print. The look lives in spec.js; WHEN the sun shines, when each
// object lands and lifts, the dose, the slide and the water front live in exposure.js (THREE-free planner shared with
// SCORE). This file turns a plan into pictures:
//   - sheet(): the paper. ONE MeshStandardMaterial whose shader looks the colour up per pixel:
//       dose = S(t) - dot(masks(p), covered(t))    (S and the four covered integrals come from the plan)
//       k = (1 - exp(-dose / tau)) / norm          (art-directed response)
//       colour = mix(unwashed(k), washed(k), wet)  (wet = behind the water front)
//     The four print masks (fern, key, feather, lace) are baked ONCE from the same silhouette data that builds the meshes,
//     blurred by each object's height (soft shadow edge), packed into one RGBA DataTexture. A second baked texture holds
//     the brushed coating (ragged edges) and the paper tooth.
//   - fern (extruded pinnae, curled), key (bevelled brass extrusion), feather and lace (alpha cards with baked canvases),
//     red push pins, a light wooden board, a white enamel tray with a blue rim and its water (a front with a crest).
//   - caption(): overlay chip at the bottom left; labels ROLL (old slides up and out as the new one comes in).
// Props never animate themselves: the scene calls set.update(t).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { newCanvas, canvas2d } from "../../kit/canvas.js";
import { uploadTexture, woodTexture } from "../../kit/textures.js";
import { clamp, rng, ease } from "../../kit/time.js";
import { fbm2 } from "../../kit/noise.js";
import * as exposure from "./exposure.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const TAU = Math.PI * 2;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const SH = spec.sheet, OB = spec.objects, BD = spec.board, TR = spec.tray;
  const boardTop = BD.h;
  const sunMax = 2.5, shadeBase = lights.shade ? lights.shade.intensity : 1;
  if (materials.brass) materials.brass.envMapIntensity = spec.brassEnv ?? 1;

  // ---------------------------------------------------------------- silhouettes (shared by meshes and masks)
  const fernData = exposure.fernFrond(OB.fern);
  const keyData = exposure.keyOutline(OB.key);
  const featherData = exposure.featherOutline(OB.feather);
  const laceData = exposure.laceLayout(OB.lace);

  const path = (x, poly) => { x.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) x.lineTo(poly[i][0], poly[i][1]); x.closePath(); };

  // ---------------------------------------------------------------- card canvases (feather + lace)
  /** a canvas mapped to an object-local box (metres, y up): returns { canvas, ctx, bb, ppm } with ctx in metres */
  function cardCanvas(bb, ppm, pad) {
    const b = { minX: bb.minX - pad, maxX: bb.maxX + pad, minY: bb.minY - pad, maxY: bb.maxY + pad };
    const W = Math.ceil((b.maxX - b.minX) * ppm), H = Math.ceil((b.maxY - b.minY) * ppm);
    const c = newCanvas(W, H), x = canvas2d(c);
    const reset = () => { x.setTransform(ppm, 0, 0, -ppm, -b.minX * ppm, b.maxY * ppm); };
    reset();
    return { canvas: c, ctx: x, bb: b, ppm, W, H, reset };
  }

  function featherCards() {
    const F = featherData, O = OB.feather, ppm = 1800;
    const mk = () => cardCanvas(F.bbox, ppm, 0.03);
    const col = mk(), alp = mk(), msk = mk();
    const R = rng(4120);
    // colour: opaque canvas, background = the vane's own mid colour (alpha lives in its own map)
    let x = col.ctx;
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = P.feather; x.fillRect(0, 0, col.W, col.H); x.restore();
    const g = x.createLinearGradient(0, 0, F.length, 0);
    g.addColorStop(0, "#c3cad8"); g.addColorStop(0.35, "#9ea9bf"); g.addColorStop(0.7, P.feather); g.addColorStop(0.86, P.featherTip); g.addColorStop(1, "#3b465e");
    x.fillStyle = g; x.fillRect(F.bbox.minX - 0.03, F.bbox.minY - 0.03, F.bbox.maxX - F.bbox.minX + 0.06, F.bbox.maxY - F.bbox.minY + 0.06);
    // barbs: soft streaks leaning toward the tip
    x.save(); x.beginPath(); path(x, F.vane); x.clip();
    for (let s = F.vaneFrom; s < 1; s += 0.0105) {
      for (const side of [1, -1]) {
        const c = F.centre(s), tn = F.tangent(s), nr = [-tn[1] * side, tn[0] * side];
        const len = 0.08;
        x.beginPath(); x.moveTo(c[0], c[1]);
        x.quadraticCurveTo(c[0] + nr[0] * len * 0.5 + tn[0] * len * 0.15, c[1] + nr[1] * len * 0.5 + tn[1] * len * 0.15, c[0] + nr[0] * len + tn[0] * len * 0.6, c[1] + nr[1] * len + tn[1] * len * 0.6);
        x.strokeStyle = R.next() < 0.5 ? "rgba(255,255,255,0.10)" : "rgba(25,35,70,0.10)";
        x.lineWidth = 0.0024; x.stroke();
      }
    }
    x.restore();
    // rachis + quill
    const strokeRachis = (ctx, color) => {
      for (let k = 0; k < F.rachis.length - 1; k++) {
        const u = k / (F.rachis.length - 1);
        ctx.beginPath(); ctx.moveTo(...F.rachis[k]); ctx.lineTo(...F.rachis[k + 1]);
        ctx.strokeStyle = color; ctx.lineWidth = 0.0055 * (1 - 0.8 * u) + 0.0008; ctx.lineCap = "round"; ctx.stroke();
      }
    };
    strokeRachis(x, "#eef1f6");
    // downy barbs at the base
    const wisps = [];
    for (let i = 0; i < 70; i++) {
      const s = 0.05 + (F.vaneFrom + 0.03 - 0.05) * R.next(), side = R.next() < 0.5 ? 1 : -1;
      const c = F.centre(s), tn = F.tangent(s), nr = [-tn[1] * side, tn[0] * side];
      const len = 0.025 + 0.035 * R.next(), lean = -0.2 + 0.6 * R.next(), wob = (R.next() - 0.5) * 0.02;
      wisps.push([c, [c[0] + nr[0] * len * 0.5 + tn[0] * (len * lean + wob), c[1] + nr[1] * len * 0.5 + tn[1] * (len * lean + wob)], [c[0] + nr[0] * len + tn[0] * len * lean * 1.4, c[1] + nr[1] * len + tn[1] * len * lean * 1.4]]);
    }
    const drawWisps = (ctx, color, w) => { for (const [a, b, c] of wisps) { ctx.beginPath(); ctx.moveTo(...a); ctx.quadraticCurveTo(...b, ...c); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.stroke(); } };
    drawWisps(x, "rgba(214,222,236,0.9)", 0.0016);
    // alpha: vane opaque, wisps soft
    x = alp.ctx;
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = "#000"; x.fillRect(0, 0, alp.W, alp.H); x.restore();
    x.fillStyle = "#fff"; x.beginPath(); path(x, F.vane); x.fill();
    strokeRachis(x, "#fff");
    drawWisps(x, "rgba(255,255,255,0.55)", 0.0016);
    // print mask: the vane lets a little light through (cover < 1), the down more
    x = msk.ctx;
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, msk.W, msk.H); x.restore();
    x.fillStyle = `rgba(255,255,255,${O.cover})`; x.beginPath(); path(x, F.vane); x.fill();
    strokeRachis(x, "#fff");
    drawWisps(x, `rgba(255,255,255,${O.down})`, 0.0016);
    return { col, alp, msk };
  }

  function laceCards() {
    const Ld = laceData, ppm = 2400;
    const bb = { minX: 0, maxX: Ld.w, minY: 0, maxY: Ld.h };
    const mk = () => cardCanvas(bb, ppm, 0.008);
    const col = mk(), alp = mk();
    const body = (x) => {
      x.beginPath(); x.rect(0, Ld.edgeY, Ld.w, Ld.h - Ld.edgeY); x.fill();
      for (const s of Ld.scallops) { x.beginPath(); x.arc(s.x, s.y, s.r, 0, TAU); x.fill(); }
      for (const s of Ld.scallops) { x.beginPath(); x.arc(s.x, s.y - s.r - 0.0012, 0.0032, 0, TAU); x.fill(); } // picots
    };
    const holes = (x) => {
      for (const h of Ld.holes) { x.beginPath(); x.arc(h.x, h.y, h.r, 0, TAU); x.fill(); }
      for (const h of Ld.petals) { x.beginPath(); x.ellipse(h.x, h.y, h.r * 1.25, h.r * 0.68, h.a, 0, TAU); x.fill(); }
      for (const h of Ld.net) { x.beginPath(); x.moveTo(h.x, h.y - h.r * 1.3); x.lineTo(h.x + h.r, h.y); x.lineTo(h.x, h.y + h.r * 1.3); x.lineTo(h.x - h.r, h.y); x.closePath(); x.fill(); }
      for (const h of Ld.eyelets) { x.beginPath(); x.arc(h.x, h.y, h.r, 0, TAU); x.fill(); }
      for (const s of Ld.scallops) { x.beginPath(); x.arc(s.x, s.y - 0.001, s.r * 0.42, 0, TAU); x.fill(); }
    };
    const rings = (x) => {
      for (const h of Ld.holes) { x.beginPath(); x.arc(h.x, h.y, h.r + 0.0012, 0, TAU); x.stroke(); }
      for (const h of Ld.petals) { x.beginPath(); x.ellipse(h.x, h.y, h.r * 1.25 + 0.0012, h.r * 0.68 + 0.0012, h.a, 0, TAU); x.stroke(); }
      for (const h of Ld.eyelets) { x.beginPath(); x.arc(h.x, h.y, h.r + 0.001, 0, TAU); x.stroke(); }
      for (const s of Ld.scallops) { x.beginPath(); x.arc(s.x, s.y - 0.001, s.r * 0.42 + 0.0012, 0, TAU); x.stroke(); }
    };
    // colour (opaque): cotton white with thread rings around the holes, a cord along the top
    let x = col.ctx;
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = P.lace; x.fillRect(0, 0, col.W, col.H); x.restore();
    x.strokeStyle = "#ddd4c2"; x.lineWidth = 0.0016; rings(x);
    x.strokeStyle = "#e4dccb"; x.lineWidth = 0.002;
    x.beginPath(); x.moveTo(0, Ld.h - 0.004); x.lineTo(Ld.w, Ld.h - 0.004); x.stroke();
    x.beginPath(); x.moveTo(0, Ld.edgeY + 0.006); x.lineTo(Ld.w, Ld.edgeY + 0.006); x.stroke();
    // alpha (and print mask): body minus holes
    x = alp.ctx;
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = "#000"; x.fillRect(0, 0, alp.W, alp.H); x.restore();
    x.fillStyle = "#fff"; body(x);
    x.fillStyle = "#000"; holes(x);
    return { col, alp, msk: alp };
  }

  const feaC = featherCards();
  const laceC = laceCards();

  // ---------------------------------------------------------------- print masks (baked once)
  /** box blur (3 passes) of a Float32 channel in place, radius r px */
  function blur(ch, W, H, r) {
    if (r < 1) return;
    const tmp = new Float32Array(Math.max(W, H));
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < H; y++) { // rows
        const o = y * W; let acc = 0; const n = 2 * r + 1;
        for (let i = -r; i <= r; i++) acc += ch[o + Math.min(W - 1, Math.max(0, i))];
        for (let xx = 0; xx < W; xx++) {
          tmp[xx] = acc / n;
          acc += ch[o + Math.min(W - 1, xx + r + 1)] - ch[o + Math.max(0, xx - r)];
        }
        for (let xx = 0; xx < W; xx++) ch[o + xx] = tmp[xx];
      }
      for (let xx = 0; xx < W; xx++) { // columns
        let acc = 0; const n = 2 * r + 1;
        for (let i = -r; i <= r; i++) acc += ch[Math.min(H - 1, Math.max(0, i)) * W + xx];
        for (let y = 0; y < H; y++) {
          tmp[y] = acc / n;
          acc += ch[Math.min(H - 1, y + r + 1) * W + xx] - ch[Math.max(0, y - r) * W + xx];
        }
        for (let y = 0; y < H; y++) ch[y * W + xx] = tmp[y];
      }
    }
  }
  function bakeMasks() {
    const ppm = SH.maskPx, W = Math.round(SH.w * ppm), H = Math.round(SH.d * ppm);
    const X0 = -SH.w / 2, Z0 = -SH.d / 2;
    const data = new Uint8Array(W * H * 4);
    const c = newCanvas(W, H), x = canvas2d(c);
    const draw = {
      fern: () => { x.fillStyle = "#fff"; for (const p of fernData.pinnae) { x.beginPath(); path(x, p.poly); x.fill(); } x.beginPath(); path(x, fernData.rachis); x.fill(); },
      key: () => { x.fillStyle = "#fff"; x.beginPath(); path(x, keyData.outer); path(x, keyData.hole); x.fill("evenodd"); },
      feather: () => { const b = feaC.msk.bb; x.transform(1, 0, 0, -1, 0, 0); x.drawImage(feaC.msk.canvas, b.minX, -b.maxY, b.maxX - b.minX, b.maxY - b.minY); },
      lace: () => { const b = laceC.msk.bb; x.transform(1, 0, 0, -1, 0, 0); x.drawImage(laceC.msk.canvas, b.minX, -b.maxY, b.maxX - b.minX, b.maxY - b.minY); },
    };
    for (const id of ["fern", "key", "feather", "lace"]) {
      const o = OB[id], cs = Math.cos(o.rot), sn = Math.sin(o.rot);
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
      // object-local (metres, y up) -> mask px: world x = pos.x + c*px - s*py, world z = pos.z - s*px - c*py
      x.setTransform(ppm * cs, -ppm * sn, -ppm * sn, -ppm * cs, (o.pos[0] - X0) * ppm, (o.pos[1] - Z0) * ppm);
      draw[id]();
      const img = x.getImageData(0, 0, W, H).data;
      const ch = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) ch[i] = img[i * 4] / 255;
      blur(ch, W, H, Math.round((o.soft * ppm) / 1.7));
      for (let i = 0; i < W * H; i++) data[i * 4 + o.ch] = Math.round(clamp(ch[i]) * 255);
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    uploadTexture(stage, tex);
    return tex;
  }
  /** paper texture: R = coating (brushed rectangle, ragged ends), G = paper tooth + brush streaks */
  function bakePaper() {
    const ppm = Math.round(SH.maskPx / 2), W = Math.round(SH.w * ppm), H = Math.round(SH.d * ppm);
    const C = SH.coat, data = new Uint8Array(W * H * 4);
    const x0 = -SH.w / 2 + C.inset[0], x1 = SH.w / 2 - C.inset[0], z0 = -SH.d / 2 + C.inset[1], z1 = SH.d / 2 - C.inset[1];
    const e = 1.2 / ppm;
    const sm = (a, b, v) => { const u = clamp((v - a) / (b - a)); return u * u * (3 - 2 * u); };
    for (let j = 0; j < H; j++) {
      const z = -SH.d / 2 + (j + 0.5) / ppm;
      // brush strokes run along x: each row ends at a slightly different x (streaky ends left and right)
      const nl = (fbm2(z * 38, 3.1, { seed: 11, octaves: 3 }) - 0.5) * 2, nr = (fbm2(z * 38, 7.7, { seed: 12, octaves: 3 }) - 0.5) * 2;
      const fl = (fbm2(z * 3, 1.3, { seed: 13, octaves: 2 }) - 0.5) * 2, fr = (fbm2(z * 3, 5.3, { seed: 14, octaves: 2 }) - 0.5) * 2;
      for (let i = 0; i < W; i++) {
        const x = -SH.w / 2 + (i + 0.5) / ppm;
        const nt = (fbm2(x * 6, 2.2, { seed: 15, octaves: 3 }) - 0.5) * 2, nb = (fbm2(x * 6, 9.2, { seed: 16, octaves: 3 }) - 0.5) * 2;
        const dl = x - (x0 + C.rag * nl + C.streak * fl), dr = x1 + C.rag * nr + C.streak * fr - x;
        const dt = z - (z0 + 0.5 * C.rag * nt), db = z1 + 0.5 * C.rag * nb - z;
        let coat = sm(-e, e, dl) * sm(-e, e, dr) * sm(-e, e, dt) * sm(-e, e, db);
        // a little density variation along the strokes (the coating is brushed on)
        const streak = fbm2(x * 2.5, z * 22, { seed: 17, octaves: 3 });
        coat *= 0.95 + 0.05 * streak;
        const tooth = 1 - SH.fibre * fbm2(x * 70, z * 70, { seed: 18, octaves: 2 });
        const k = (j * W + i) * 4;
        data[k] = Math.round(clamp(coat) * 255); data[k + 1] = Math.round(clamp(tooth) * 255); data[k + 2] = 0; data[k + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
    tex.needsUpdate = true;
    uploadTexture(stage, tex);
    return tex;
  }

  // ---------------------------------------------------------------- the sheet (the shader is the style)
  /**
   * sheet(plan) -> Group (paper + edge) with userData.update({ S, cov: [4], front }) and userData.uniforms
   */
  function sheet(plan) {
    const g = new THREE.Group(); g.name = "sheet";
    const PR = spec.print;
    const mask = bakeMasks(), paperT = bakePaper();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    mat.name = "cyanotypeSheet";
    const col = (h) => new THREE.Color(h);
    const U = {
      uMask: { value: mask }, uPaperT: { value: paperT },
      uS: { value: 0 }, uCov: { value: new THREE.Vector4() },
      uTauN: { value: new THREE.Vector2(plan.tau, plan.kNorm) },
      uU0: { value: col(PR.unwashed[0][0]) }, uU1: { value: col(PR.unwashed[1][0]) }, uU2: { value: col(PR.unwashed[2][0]) },
      uW0: { value: col(PR.washed[0][0]) }, uW1: { value: col(PR.washed[1][0]) }, uW2: { value: col(PR.washed[2][0]) },
      uStops: { value: new THREE.Vector3(PR.unwashed[1][1], PR.washed[1][1], PR.washGamma) },
      uPaperW: { value: col(P.paper) },
      uFront: { value: new THREE.Vector4(-9, PR.front.width, PR.front.develop, PR.front.wobble) },
      uSize: { value: new THREE.Vector2(SH.w, SH.d) },
      uWetDark: { value: PR.wetDarken },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform vec2 uSize; varying vec2 vSh;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSh = position.xy / uSize + 0.5;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
uniform sampler2D uMask, uPaperT;
uniform float uS, uWetDark;
uniform vec4 uCov, uFront;
uniform vec2 uTauN, uSize;
uniform vec3 uU0, uU1, uU2, uW0, uW1, uW2, uStops, uPaperW;
varying vec2 vSh;
float gWet;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
{
  vec2 mUv = vec2(vSh.x, 1.0 - vSh.y);
  vec4 msk = texture2D(uMask, mUv);
  vec4 ppr = texture2D(uPaperT, mUv);
  float dose = max(uS - dot(msk, uCov), 0.0);
  float k = clamp((1.0 - exp(-dose / uTauN.x)) / uTauN.y, 0.0, 1.0);
  vec3 unw = mix(mix(uU0, uU1, clamp(k / uStops.x, 0.0, 1.0)), uU2, clamp((k - uStops.x) / (1.0 - uStops.x), 0.0, 1.0));
  float kw = pow(max(k, 1e-5), uStops.z);
  vec3 wsh = mix(mix(uW0, uW1, clamp(kw / uStops.y, 0.0, 1.0)), uW2, clamp((kw - uStops.y) / (1.0 - uStops.y), 0.0, 1.0));
  float sx = (vSh.x - 0.5) * uSize.x, sz = (0.5 - vSh.y) * uSize.y;
  float fr = uFront.x + uFront.w * (0.6 * sin(sz * 7.0 + 1.3) + 0.4 * sin(sz * 17.0 + 0.4));
  float wet = 1.0 - smoothstep(fr - uFront.y, fr, sx);
  float dev = 1.0 - smoothstep(fr - uFront.z, fr - 0.25 * uFront.y, sx);
  vec3 wshD = mix(mix(unw, uPaperW, 0.3), wsh, 0.45 + 0.55 * dev);
  vec3 c = mix(unw, wshD, wet);
  c = mix(uPaperW, c, ppr.r);
  c *= mix(1.0, ppr.g, 1.0) * mix(1.0, uWetDark, wet);
  diffuseColor.rgb = c;
  gWet = wet;
}`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.45, gWet);`);
    };
    const geo = new THREE.PlaneGeometry(SH.w, SH.d, 1, 1);
    const paper = new THREE.Mesh(geo, mat);
    paper.rotation.x = -Math.PI / 2; paper.receiveShadow = true; paper.name = "paper";
    g.add(paper);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(SH.w, 0.002, SH.d), materials.paperEdge);
    edge.position.y = -0.0011; edge.receiveShadow = true; edge.castShadow = false; g.add(edge);
    g.userData.uniforms = U;
    g.userData.update = (st) => {
      U.uS.value = st.S;
      U.uCov.value.set(st.cov[0], st.cov[1], st.cov[2], st.cov[3]);
      U.uFront.value.x = Math.max(-9, Math.min(9, st.front));
    };
    return g;
  }

  // ---------------------------------------------------------------- the four objects
  /** an object holder: outer (position, turn) > tilt pivot at the object's centre > content */
  function holder(content, bb, name) {
    const outer = new THREE.Group(); outer.name = name;
    const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
    const pivot = new THREE.Group(); pivot.position.set(cx, 0, -cy); outer.add(pivot);
    content.position.set(-cx, 0, cy); pivot.add(content);
    outer.userData.pivot = pivot;
    return outer;
  }
  /** distance of (x, y) to a polyline (min over samples) */
  const distTo = (pts, x, y) => { let d = Infinity; for (const [px, py] of pts) d = Math.min(d, (px - x) * (px - x) + (py - y) * (py - y)); return Math.sqrt(d); };

  function fern() {
    const O = OB.fern, R = rng(O.seed + 7);
    const cA = new THREE.Color(P.fern), cB = new THREE.Color(P.fernLight), tmp = new THREE.Color();
    const centre = []; for (let k = 0; k <= 80; k++) centre.push(fernData.centre(-O.stipe / O.length + (1 + O.stipe / O.length) * (k / 80)));
    const geos = [];
    const addShape = (poly, tone) => {
      const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: O.thick, bevelEnabled: false, curveSegments: 1 });
      const pos = geo.attributes.position, n = pos.count, cols = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        const d = distTo(centre, x, y);
        // curl the pinna tips up a little (shadows under them), colour lighter toward the tips
        pos.setZ(i, pos.getZ(i) + O.curl * Math.pow(clamp(d / (O.leaf * 0.9)), 1.6));
        tmp.copy(cA).lerp(cB, clamp(tone + 0.55 * d / O.leaf));
        cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      geo.deleteAttribute("uv");
      geos.push(geo.toNonIndexed ? (geo.index ? geo.toNonIndexed() : geo) : geo);
    };
    for (const p of fernData.pinnae) addShape(p.poly, 0.05 + 0.2 * R.next());
    addShape(fernData.rachis, 0.0);
    const merged = mergeGeometries(geos, false);
    merged.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
    mat.name = "fern";
    const mesh = new THREE.Mesh(merged, mat);
    mesh.rotation.x = -Math.PI / 2; mesh.castShadow = true; mesh.receiveShadow = true;
    const g = new THREE.Group(); g.add(mesh);
    return holder(g, fernData.bbox, "fern");
  }

  function key() {
    const O = OB.key;
    const shape = new THREE.Shape(keyData.outer.map(([x, y]) => new THREE.Vector2(x, y)));
    shape.holes.push(new THREE.Path(keyData.hole.map(([x, y]) => new THREE.Vector2(x, y)).reverse()));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: O.thick, bevelEnabled: true, bevelThickness: O.bevel, bevelSize: O.bevel * 0.8, bevelSegments: 2, curveSegments: 6 });
    geo.translate(0, 0, O.bevel);
    const mesh = new THREE.Mesh(geo, materials.brass);
    mesh.rotation.x = -Math.PI / 2; mesh.castShadow = true; mesh.receiveShadow = true;
    const g = new THREE.Group(); g.add(mesh);
    return holder(g, keyData.bbox, "key");
  }

  /** an alpha card (canvas colour + canvas alpha) on a gently curved plane, with an alpha-tested shadow */
  function card(C, curl, name) {
    const b = C.col.bb, w = b.maxX - b.minX, h = b.maxY - b.minY;
    const geo = new THREE.PlaneGeometry(w, h, 48, 8);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / w + 0.5, v = pos.getY(i) / h + 0.5;
      pos.setZ(i, curl * (Math.sin(Math.PI * u) * 0.8 + 0.4 * (2 * v - 1) * (2 * v - 1)));
    }
    geo.translate(b.minX + w / 2, b.minY + h / 2, 0);
    geo.computeVertexNormals();
    const map = new THREE.CanvasTexture(C.col.canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    const am = new THREE.CanvasTexture(C.alp.canvas); am.colorSpace = THREE.NoColorSpace; am.anisotropy = 8;
    uploadTexture(stage, map, am);
    // alphaTest also drives the SHADOW: three copies the material's alphaTest into the depth material (r181), so a
    // transparent card without it casts its whole rectangle. A low test keeps the visible edge soft.
    const mat = new THREE.MeshStandardMaterial({ map, alphaMap: am, transparent: true, alphaTest: 0.06, depthWrite: false, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
    mat.name = name;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2; mesh.castShadow = true; mesh.receiveShadow = false;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: am, alphaTest: 0.4, side: THREE.DoubleSide });
    mesh.renderOrder = 2;
    return mesh;
  }
  function feather() {
    const mesh = card(feaC, OB.feather.curl, "feather");
    const g = new THREE.Group(); g.add(mesh);
    return holder(g, featherData.bbox, "feather");
  }
  function lace() {
    const mesh = card(laceC, 0.002, "lace");
    const g = new THREE.Group(); g.add(mesh);
    return holder(g, { minX: 0, maxX: laceData.w, minY: 0, maxY: laceData.h }, "lace");
  }

  // ---------------------------------------------------------------- board, table, pins, tray, water
  function table() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), materials.table);
    m.rotation.x = -Math.PI / 2; m.position.x = TR.x / 2; m.receiveShadow = true; m.name = "table";
    return m;
  }
  function board() {
    const W = BD.wood;
    const tex = woodTexture({ size: 1024, boards: 1, seed: 31, grainFreq: W.grainFreq, contrast: W.contrast, dark: W.dark, mid: W.mid, light: W.light, seam: W.seam });
    tex.colorSpace = THREE.SRGBColorSpace;
    uploadTexture(stage, tex);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0 });
    mat.name = "board";
    const m = new THREE.Mesh(new RoundedBoxGeometry(BD.w, BD.h, BD.d, 2, 0.008), mat);
    m.position.y = BD.h / 2; m.castShadow = true; m.receiveShadow = true; m.name = "board";
    return m;
  }
  function pin() {
    const PN = spec.pins, g = new THREE.Group();
    const head = new THREE.Mesh(new THREE.CylinderGeometry(PN.r * 0.9, PN.r, PN.h, 28), materials.pin);
    head.position.y = PN.h / 2 + 0.002; head.castShadow = true; g.add(head);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(PN.r * 0.55, PN.r * 0.75, PN.h * 0.7, 24), materials.pin);
    top.position.y = PN.h + 0.002 + PN.h * 0.35; top.castShadow = true; g.add(top);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(PN.r * 0.55, 20, 10, 0, TAU, 0, Math.PI / 2), materials.pin);
    cap.scale.y = 0.5; cap.position.y = PN.h * 1.7 + 0.002; g.add(cap);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(PN.r * 1.05, PN.r * 1.05, 0.002, 28), materials.pinMetal);
    disc.position.y = 0.001; g.add(disc);
    return g;
  }
  function tray() {
    const g = new THREE.Group(); g.name = "tray";
    const w = TR.w, d = TR.d, h = TR.h, t = TR.wall;
    const floor = new THREE.Mesh(new RoundedBoxGeometry(w, TR.floor, d, 2, 0.006), materials.tray);
    floor.position.y = TR.floor / 2; floor.receiveShadow = true; g.add(floor);
    const wall = (ww, dd, x, z) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(ww, h, dd, 2, 0.01), materials.tray);
      m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m);
      const rim = new THREE.Mesh(new RoundedBoxGeometry(ww + 0.004, TR.rim, dd + 0.004, 2, 0.004), materials.trayRim);
      rim.position.set(x, h - TR.rim / 2 + 0.002, z); g.add(rim);
    };
    wall(w, t, 0, -d / 2 + t / 2); wall(w, t, 0, d / 2 - t / 2);
    wall(t, d - 2 * t + 0.002, -w / 2 + t / 2, 0); wall(t, d - 2 * t + 0.002, w / 2 - t / 2, 0);
    g.position.x = TR.x;
    return g;
  }
  /** water(): a transparent sheet over the tray floor; a front with a bright crest sweeps along x */
  function water() {
    const Wt = spec.water, PR = spec.print;
    const iw = TR.w - 2 * TR.wall, id = TR.d - 2 * TR.wall;
    const mat = new THREE.MeshStandardMaterial({ color: Wt.color, transparent: true, depthWrite: false, roughness: Wt.roughness, metalness: 0, opacity: 1 });
    mat.name = "water";
    const U = {
      uFront: { value: new THREE.Vector4(-9, PR.front.wobble, Wt.crestW, Wt.crest) },
      uWater: { value: new THREE.Vector4(Wt.alpha, Wt.ripple, 0, -9) },
      uSheen: { value: new THREE.Vector4(Wt.sheen, Wt.sheenW, ...new THREE.Vector2(...Wt.sheenDir).normalize().toArray()) },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vWp; varying vec3 vTX; varying vec3 vTY;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWp = position.xy;\nvTX = normalize((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);\nvTY = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
uniform vec4 uFront, uWater, uSheen;
varying vec2 vWp; varying vec3 vTX; varying vec3 vTY;
float wBehind; float wCrest; vec2 wGrad;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
{
  float sx = vWp.x, sz = -vWp.y;
  float fr = uFront.x + uFront.y * (0.6 * sin(sz * 7.0 + 1.3) + 0.4 * sin(sz * 17.0 + 0.4));
  wBehind = 1.0 - smoothstep(fr - 0.006, fr + 0.004, sx);
  float cx = (sx - (fr - 0.8 * uFront.z)) / uFront.z;
  wCrest = exp(-cx * cx) * wBehind;
  // the crest is a rounded ridge: slope along x; slow broad ripples behind it
  float rp = uWater.y * (sin(sx * 9.0 - uWater.z * 5.0 + sz * 3.0) * 0.5 + sin(sz * 11.0 + sx * 4.0 + uWater.z * 3.0) * 0.5);
  wGrad = vec2(-2.0 * cx * exp(-cx * cx) * 0.9, 0.0) * wBehind + vec2(rp, 0.6 * rp) * wBehind;
  // a broad soft reflection drifting over the wet print (reads as a glossy water film)
  float sb = (dot(vec2(sx, sz), uSheen.zw) - uWater.w) / uSheen.y;
  float sheen = uSheen.x * exp(-sb * sb) * wBehind;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), clamp(0.75 * wCrest + 4.0 * sheen, 0.0, 1.0));
  diffuseColor.a = wBehind * (uWater.x + uFront.w * wCrest) + sheen;
}`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
normal = normalize(normal - wGrad.x * vTX + wGrad.y * vTY);`);
    };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(iw, id, 1, 1), mat);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(TR.x, TR.floor + TR.water, 0); mesh.renderOrder = 3; mesh.name = "water";
    /** update(front, t, washT0): front position (sheet x), time (ripples), wash start (the sheen drifts after it) */
    mesh.userData.update = (front, t, washT0) => {
      U.uFront.value.x = Math.max(-9, Math.min(9, front)); U.uWater.value.z = t; mesh.visible = front > -1.2;
      const u = clamp((t - washT0 - Wt.sheenDelay) / Wt.sheenDur);
      U.uWater.value.w = u <= 0 ? -9 : Wt.sheenFrom + (Wt.sheenTo - Wt.sheenFrom) * ease.inOutSine(u);
    };
    return mesh;
  }

  // ---------------------------------------------------------------- overlay caption with a roll between labels
  /** caption() -> overlay chip (Prussian-blue plate, pale sensitiser edge + a sun icon, cream text); userData.show({ a, b, u }) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 24;
    const font = `${Q.weight} ${Math.round(Q.cap * 1.42)}px ${Q.font}`;
    const mc = newCanvas(8, 8), mx = canvas2d(mc);
    const widths = new Map();
    const widthOf = (s) => { if (!s) return 0; if (!widths.has(s)) { mx.font = font; widths.set(s, Math.ceil(mx.measureText(s).width)); } return widths.get(s); };
    const pad = Math.round(Q.cap * 0.75), ic = Math.round(Q.h * 0.5);
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.a && !st.b) return;
      const pw = Math.min(W - 16, pad + ic + pad + st.w + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(10,25,40,0.28)"; x.beginPath(); x.roundRect(ox + 3, oy + 7, pw, ph, 14); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 14); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 3; x.beginPath(); x.roundRect(ox + 1.5, oy + 1.5, pw - 3, ph - 3, 13); x.stroke();
      // icon: a small sun
      const cx = ox + pad + ic / 2, cy = oy + ph / 2;
      x.fillStyle = Q.icon; x.beginPath(); x.arc(cx, cy, ic * 0.24, 0, TAU); x.fill();
      x.strokeStyle = Q.icon; x.lineWidth = 3.2; x.lineCap = "round";
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; x.beginPath(); x.moveTo(cx + Math.cos(a) * ic * 0.36, cy + Math.sin(a) * ic * 0.36); x.lineTo(cx + Math.cos(a) * ic * 0.5, cy + Math.sin(a) * ic * 0.5); x.stroke(); }
      // text window: the old label rolls up and out while the new one rolls in from below
      const tx = ox + pad + ic + pad;
      x.save(); x.beginPath(); x.rect(tx - 4, oy + 4, pw - (tx - ox) - 4, ph - 8); x.clip();
      x.font = font; x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      const ty = oy + Math.round(ph / 2) + 2, roll = ph * 0.82;
      if (st.a) x.fillText(st.a, tx, ty - st.u * roll);
      if (st.b) x.fillText(st.b, tx, ty + (1 - st.u) * roll);
      x.restore();
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (L) => {
      const u = Math.round(clamp(L.u) * 1000) / 1000;
      const b = u > 0 ? L.b : "";
      const e = ease.inOutCubic(u);
      const w = Math.round(widthOf(L.a) * (1 - e) + (b ? widthOf(b) : widthOf(L.a)) * e);
      mesh.userData.set({ a: u < 1 ? L.a : "", b, u, w });
      mesh.userData.opacity(1);
    };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * sunPrint(plan) -> { group, sheet, objects, pins, tray, water, update(t) } (adds itself to the scene)
   *   update(t): sun level, object poses, the dose uniforms, pins, the slide into the tray and the water front.
   */
  function sunPrint(plan) {
    const group = new THREE.Group(); group.name = "sunPrint";
    group.add(table());
    group.add(board());
    const sh = sheet(plan); group.add(sh);
    const ids = plan.objects.map((o) => o.id);
    const makers = { fern, key, feather, lace };
    const objs = ids.map((id) => { const m = makers[id](); group.add(m); return m; });
    const PN = spec.pins;
    const pinPos = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (SH.w / 2 - PN.inset[0]), sz * (SH.d / 2 - PN.inset[1])]);
    const pins = pinPos.map(() => { const p = pin(); group.add(p); return p; });
    const tr = tray(); group.add(tr);
    const wt = water(); group.add(wt);
    stage.scene.add(group);
    const yRest = boardTop + SH.lift;
    const objLift = { fern: 0.0006, key: 0.0004, feather: 0.0012, lace: 0.0009 };
    const sun = lights.sun, shade = lights.shade;
    const shadeBasePos = shade ? shade.position.clone() : null;
    return {
      group, sheet: sh, objects: objs, pins, tray: tr, water: wt,
      update(t) {
        const s = plan.sunAt(t);
        if (sun) sun.intensity = sunMax * s;
        if (shade) shade.intensity = shadeBase * (1 - 0.3 * s);
        objs.forEach((m, i) => {
          const p = plan.objectAt(i, t);
          m.visible = p.visible;
          m.position.set(p.x, yRest + objLift[ids[i]] + p.y, p.z);
          m.rotation.set(0, p.rot, 0);
          m.userData.pivot.rotation.set(p.tiltX, 0, p.tiltZ);
        });
        pins.forEach((m, j) => {
          const q = plan.pinAt(j, t);
          m.visible = q.visible;
          m.position.set(pinPos[j][0] + q.dx, yRest + q.y, pinPos[j][1] + q.dz);
          m.rotation.set(0.6 * q.spin * (j % 2 ? 1 : -1), 0, 0.4 * q.spin);
        });
        const sl = plan.sheetAt(t);
        sh.position.set(sl.x, sl.y, 0);
        sh.rotation.set(0, 0, -sl.tilt);
        sh.userData.update({ S: plan.doseAt(t), cov: plan.coverAt(t), front: plan.washAt(t) });
        wt.userData.update(plan.washAt(t), t, plan.cfg.wash.t0);
        // the shade light (and its shadow box) follows the sheet into the tray
        if (shade) {
          shade.position.set(shadeBasePos.x + sl.x, shadeBasePos.y, shadeBasePos.z);
          shade.target.position.set(sl.x, 0, 0);
          shade.target.updateMatrixWorld();
        }
      },
    };
  }

  const props = { sheet, fern, key, feather, lace, pin, board, table, tray, water, caption, sunPrint };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: exposure, motion: exposure,
    shapes: { fern: fernData, key: keyData, feather: featherData, lace: laceData },
  };
}
