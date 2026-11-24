// styles/loom-weave/style.js — "Loom Weave": a wooden tabletop jacquard loom weaving a picture row by row, with the punched
// card that drives it glowing beside the cloth. The look lives in spec.js; WHICH thread rises WHEN lives in draft.js (the
// THREE-free pick planner shared with SCORE). This file turns a plan into pictures:
//   - cloth: one plane + shader reading the draft as a DataTexture (rgb = weft colour of the row, a = lift). Per pixel it
//     finds the crossing (warp j, row k = n(t) - distance from fell), picks the top thread (lifted warp = warp over weft),
//     and shades round thread profiles, arching over crossings, twist and per-thread tone (analytic normals, no maps).
//   - card: one plane + shader with glowing holes where the draft lifts, card seams, lace holes; same row mapping as the
//     cloth, so card row k always lies beside cloth row k.
//   - warp: 3 instanced segments per thread (lead / fell->eye / eye->back beam); harness cords, brass eyes, lead weights;
//     a reed that beats; a boat shuttle and the trailing weft; reader pins that rise with the lifted threads.
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { uploadTexture } from "../../kit/textures.js";
import { clamp, hash01, lerp } from "../../kit/time.js";
import * as draftLib from "./draft.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, LM = spec.loom, CD = spec.card, SH = spec.shuttle;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  const W = LM.warps, sp = LM.spacing, yC = LM.y;
  const xWarp = (j) => LM.x0 + (j + 0.5) * sp;
  const xRight = LM.x0 + W * sp;
  const cardX = (j) => CD.x0 + (j + 0.5) * CD.colPitch;
  const cardRight = CD.x0 + W * CD.colPitch;
  const zFrontOf = (rows) => LM.zFell + (rows + LM.lead) * LM.pick;

  const box = (w, h, d, mat, x, y, z, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; if (name) m.name = name;
    return m;
  };
  const rodX = (r, len, mat, x, y, z, name) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 32), mat);
    m.rotation.z = Math.PI / 2; m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; if (name) m.name = name;
    return m;
  };

  // ---------------------------------------------------------------- table
  /** table({ size }) -> pale wooden tabletop at y = 0 */
  function table(o = {}) {
    const size = o.size ?? 30;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), materials.table);
    if (materials.table.map) materials.table.map.repeat.set(size / 3, size / 3);
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.name = "table";
    return m;
  }

  // ---------------------------------------------------------------- loom frame
  /** frame(rows) -> Group: side rails, cloth + warp beams, harness castle + comber board, shuttle shelves */
  function frame(rows, o = {}) {
    const g = new THREE.Group(); g.name = "loom-frame";
    const zF = zFrontOf(rows), [xl, xr] = LM.railX;
    const z0 = LM.zBack - 0.18, z1 = zF + 0.16, railH = yC - 0.1;
    for (const x of [xl, xr]) {
      g.add(box(0.1, railH, z1 - z0, materials.wood, x, railH / 2, (z0 + z1) / 2, "rail"));
      g.add(box(0.1, LM.harnessTop + 0.06 - railH, 0.08, materials.wood, x, (railH + LM.harnessTop + 0.06) / 2, LM.zHeddle, "upright"));
      g.add(box(0.12, 0.16, 0.14, materials.wood, x, railH + 0.05, zF + 0.03, "beam-block"));
      g.add(box(0.12, 0.16, 0.14, materials.wood, x, railH + 0.05, LM.zBack, "beam-block"));
    }
    const span = xr - xl + 0.1;
    const cb = rodX(0.07, span, materials.wood, (xl + xr) / 2, yC - 0.072, zF + 0.03, "cloth-beam");
    const wb = rodX(0.07, span, materials.wood, (xl + xr) / 2, yC - 0.072, LM.zBack, "warp-beam");
    g.add(cb, wb);
    g.add(box(span + 0.06, 0.05, 0.14, materials.wood, (xl + xr) / 2, LM.harnessTop, LM.zHeddle, "comber-board"));
    // shuttle shelves at both ends of the shed
    for (const x of [SH.restL, SH.restR]) g.add(box(SH.length + 0.06, 0.03, 0.14, materials.woodDark, x, yC - 0.05, LM.zShuttle, "shuttle-shelf"));
    g.userData.update = (n) => { cb.rotation.x = (-n * LM.pick) / 0.07; wb.rotation.x = (-n * LM.pick) / 0.07; };
    return g;
  }

  // ---------------------------------------------------------------- instanced segment helper
  const UP = new THREE.Vector3(0, 1, 0);
  function segments(count, mat, radial = 8, name = "segments") {
    const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, radial, 1, false), mat, count);
    m.name = name; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), M = new THREE.Matrix4();
    m.userData.set = (i, pa, pb, r) => {
      a.set(pa[0], pa[1], pa[2]); b.set(pb[0], pb[1], pb[2]);
      d.subVectors(b, a); const len = Math.max(1e-5, d.length()); d.multiplyScalar(1 / len);
      q.setFromUnitVectors(UP, d); s.set(r, len, r);
      M.compose(a.add(b).multiplyScalar(0.5), q, s); m.setMatrixAt(i, M);
    };
    return m;
  }

  // ---------------------------------------------------------------- warp + harness
  /** warp(plan) -> Group; userData.update(t, state): lead, fell->eye, eye->back segments; cords, eyes, weights follow the eyes */
  function warp(plan) {
    const g = new THREE.Group(); g.name = "warp";
    const rows = plan.draft.N, zF = zFrontOf(rows), r = LM.thread;
    const threads = segments(W * 3, materials.warp, 8, "warp-threads");
    const cords = segments(W, materials.cord, 5, "heddle-cords");
    const lower = segments(W, materials.cord, 5, "heddle-lower");
    const weights = segments(W, materials.lead, 8, "heddle-weights");
    const eyes = new THREE.InstancedMesh(new THREE.TorusGeometry(0.016, 0.0045, 6, 14), materials.brass, W);
    eyes.name = "heddle-eyes"; eyes.castShadow = true; eyes.frustumCulled = false;
    for (const m of [cords, lower, weights]) m.castShadow = true;
    g.add(threads, cords, lower, weights, eyes);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), pv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const topY = LM.harnessTop - 0.025;
    g.userData.update = (t, s) => {
      for (let j = 0; j < W; j++) {
        const x = xWarp(j), h = plan.lift(j, t, s);
        const yE = yC + (h > 0 ? h * LM.shedUp : h * LM.shedDown);
        threads.userData.set(j * 3, [x, yC - 0.02, zF + 0.03], [x, yC - 0.02, LM.zFell], r);
        threads.userData.set(j * 3 + 1, [x, yC - 0.006, LM.zFell + 0.004], [x, yE, LM.zHeddle], r);
        threads.userData.set(j * 3 + 2, [x, yE, LM.zHeddle], [x, yC - 0.002, LM.zBack], r);
        cords.userData.set(j, [x, topY, LM.zHeddle], [x, yE + 0.016, LM.zHeddle], 0.0028);
        lower.userData.set(j, [x, yE - 0.016, LM.zHeddle], [x, yE - 0.17, LM.zHeddle], 0.0028);
        weights.userData.set(j, [x, yE - 0.17, LM.zHeddle], [x, yE - 0.235, LM.zHeddle], 0.0085);
        pv.set(x, yE, LM.zHeddle); M.compose(pv, q, one); eyes.setMatrixAt(j, M);
      }
      for (const m of [threads, cords, lower, weights, eyes]) m.instanceMatrix.needsUpdate = true;
    };
    return g;
  }

  // ---------------------------------------------------------------- reed / beater
  /** reed() -> Group: top bar, race board, dents; userData.update(beat 0..1) swings it from rest to the fell */
  function reed() {
    const g = new THREE.Group(); g.name = "reed";
    const x0 = SH.restL - SH.length / 2 - 0.04, x1 = SH.restR + SH.length / 2 + 0.04;
    const top = yC + 0.2, bot = yC - 0.11;
    g.add(box(xRight - LM.x0 + 0.16, 0.05, 0.05, materials.wood, (LM.x0 + xRight) / 2, top + 0.025, 0, "reed-top"));
    g.add(box(x1 - x0, 0.035, 0.08, materials.wood, (x0 + x1) / 2, bot - 0.0175, 0.0, "shuttle-race"));
    const dents = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0035, top - bot, 0.026), materials.brass, W + 1);
    dents.name = "reed-dents"; dents.castShadow = true; dents.frustumCulled = false;
    const M = new THREE.Matrix4();
    for (let j = 0; j <= W; j++) { M.makeTranslation(LM.x0 + j * sp, (top + bot) / 2, 0); dents.setMatrixAt(j, M); }
    g.add(dents);
    for (const x of [LM.x0 - 0.08, xRight + 0.08]) g.add(box(0.05, top - bot + 0.08, 0.05, materials.wood, x, (top + bot) / 2, 0, "reed-end"));
    g.position.z = LM.zReed;
    g.userData.update = (beat) => { g.position.z = lerp(LM.zReed, LM.zFell - 0.03, beat); };
    return g;
  }

  // ---------------------------------------------------------------- shuttle + weft
  /** shuttle() -> Group: boat-shaped beech shuttle with brass tips and a bobbin of weft; userData.update(x, colourHex) */
  function shuttle() {
    const g = new THREE.Group(); g.name = "shuttle";
    const geo = new THREE.SphereGeometry(1, 40, 16);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), k = Math.pow(Math.max(0, 1 - x * x), 0.25);
      pa.setXYZ(i, x * SH.length / 2, pa.getY(i) * k * SH.height / 2, pa.getZ(i) * k * SH.width / 2);
    }
    geo.computeVertexNormals();
    const body = new THREE.Mesh(geo, materials.woodDark); body.castShadow = true; body.name = "shuttle-body";
    const bobMat = new THREE.MeshStandardMaterial({ color: P.red, roughness: 0.8 }); bobMat.name = "bobbin";
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(SH.height * 0.42, SH.height * 0.42, SH.length * 0.42, 20), bobMat);
    bob.rotation.z = Math.PI / 2; bob.position.y = SH.height * 0.34; bob.castShadow = true; bob.name = "shuttle-bobbin";
    g.add(body, bob);
    for (const sgn of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.05, 12), materials.brass);
      tip.rotation.z = -sgn * Math.PI / 2; tip.position.x = sgn * (SH.length / 2 + 0.012); g.add(tip);
    }
    const yS = yC - LM.shedDown * ((LM.zShuttle - LM.zFell) / (LM.zHeddle - LM.zFell)) + SH.height / 2 - 0.004;
    g.position.set(SH.restL, yS, LM.zShuttle);
    g.userData.update = (x, hex) => { g.position.x = x; bobMat.color.set(hex); };
    return g;
  }
  /** weft() -> thin coloured strand trailing from the selvedge to the shuttle; userData.update(on, xa, xb, z, hex) */
  function weft() {
    const mat = new THREE.MeshStandardMaterial({ color: P.red, roughness: 0.85 }); mat.name = "weft";
    const m = new THREE.Mesh(new THREE.CylinderGeometry(CD.weft, CD.weft, 1, 8), mat);
    m.rotation.z = Math.PI / 2; m.castShadow = true; m.name = "weft-strand"; m.visible = false;
    m.userData.update = (on, xa, xb, z, hex) => {
      const len = Math.abs(xb - xa);
      m.visible = on && len > 0.01;
      m.scale.set(1, Math.max(0.01, len), 1);
      m.position.set((xa + xb) / 2, yC + 0.002, z);
      mat.color.set(hex);
    };
    return m;
  }

  // ---------------------------------------------------------------- draft texture
  /** draftTexture(draft) -> DataTexture W x N: rgb = weft colour (sRGB bytes), a = 255 where the warp lifts */
  function draftTexture(draft) {
    const data = new Uint8Array(draft.W * draft.N * 4);
    for (let k = 0; k < draft.N; k++) {
      // raw sRGB bytes as written in the spec; the shader linearises them (pow 2.2)
      const r = parseInt(draft.weft[k].slice(1, 3), 16), gg = parseInt(draft.weft[k].slice(3, 5), 16), b = parseInt(draft.weft[k].slice(5, 7), 16);
      for (let j = 0; j < draft.W; j++) {
        const o = (k * draft.W + j) * 4;
        data[o] = r; data[o + 1] = gg; data[o + 2] = b; data[o + 3] = draft.lift[k * draft.W + j] ? 255 : 0;
      }
    }
    const tex = new THREE.DataTexture(data, draft.W, draft.N, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.NoColorSpace; tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  // ---------------------------------------------------------------- cloth
  const HASH = "float lwHash(float n){ return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }";
  /** cloth(draft, tex) -> Mesh: the woven cloth (rows >= 0) between the fell and the cloth beam; userData.update(n) */
  function cloth(draft, tex) {
    const rows = draft.N, zF = zFrontOf(rows);
    const mat = materials.cloth.clone(); mat.name = "cloth";
    const U = {
      uDraft: { value: tex }, uN: { value: 0 }, uX0: { value: LM.x0 }, uSp: { value: sp }, uPick: { value: LM.pick },
      uZFell: { value: LM.zFell }, uW: { value: W }, uRows: { value: rows }, uRelief: { value: LM.relief },
      uWarp: { value: new THREE.Color(P.warp) },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLwPos;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLwPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          varying vec3 vLwPos;
          uniform sampler2D uDraft; uniform float uN, uX0, uSp, uPick, uZFell, uW, uRows, uRelief; uniform vec3 uWarp;
          ${HASH}`)
        .replace("#include <map_fragment>", `#include <map_fragment>
          float lwU = (vLwPos.x - uX0) / uSp;
          float lwD = (vLwPos.z - uZFell) / uPick;
          float lwRc = uN - lwD;
          vec2 lwAA = vec2(fwidth(lwU), fwidth(lwRc));
          float lwJ = floor(lwU), lwK = floor(lwRc);
          float lu = fract(lwU) - 0.5, lv = fract(lwRc) - 0.5;
          if (lwD < 0.0 || lwK < 0.0) discard;
          vec4 lwCell = texture2D(uDraft, vec2((clamp(lwJ, 0.0, uW - 1.0) + 0.5) / uW, (clamp(lwK, 0.0, uRows - 1.0) + 0.5) / uRows));
          float up = step(0.5, lwCell.a);
          vec3 weftC = pow(lwCell.rgb, vec3(2.2));
          float hw = mix(0.40, 0.47, up), hf = mix(0.485, 0.43, up);
          float aU = clamp(lwAA.x, 0.015, 0.25), aV = clamp(lwAA.y, 0.015, 0.25);
          float mW = 1.0 - smoothstep(hw - aU, hw + aU, abs(lu));
          float mF = 1.0 - smoothstep(hf - aV, hf + aV, abs(lv));
          float showW = mW * (up + (1.0 - up) * (1.0 - mF));
          float showF = mF * ((1.0 - up) + up * (1.0 - mW));
          float sW = clamp(lu / hw, -0.995, 0.995), sF = clamp(lv / hf, -0.995, 0.995);
          float pW = sqrt(1.0 - sW * sW), pF = sqrt(1.0 - sF * sF);
          float cv = cos(6.2832 * lv), cu = cos(6.2832 * lu);
          float archW = mix(0.3, 0.6 + 0.4 * cv, up), archF = mix(0.6 + 0.4 * cu, 0.3, up);
          float hWarp = pW * archW, hWeft = pF * archF;
          float dpW = -sW / (hw * max(pW, 0.12)), dpF = -sF / (hf * max(pF, 0.12));
          vec2 gWarp = vec2(dpW * archW, pW * up * (-0.4 * 6.2832 * sin(6.2832 * lv)));
          vec2 gWeft = vec2(pF * (1.0 - up) * (-0.4 * 6.2832 * sin(6.2832 * lu)), dpF * archF);
          float lwSum = showW + showF + 1e-4;
          vec2 lwG = (gWarp * showW + gWeft * showF) / lwSum;
          float lwH = (hWarp * showW + hWeft * showF) / lwSum;
          vec3 lwN = normalize(vec3(-lwG.x * uRelief / uSp, 1.0, lwG.y * uRelief / uPick));
          vec3 warpC = uWarp * (0.94 + 0.06 * lwHash(lwJ));
          vec3 weftJ = weftC * (0.92 + 0.08 * lwHash(lwK + 37.0));
          float twW = 0.9 + 0.1 * sin(6.2832 * (lv * 2.0 + lu * 1.4) + lwJ * 1.7);
          float twF = 0.9 + 0.1 * sin(6.2832 * (lu * 2.0 - lv * 1.4) + lwK * 2.3);
          vec3 lwCol = (warpC * twW * showW + weftJ * twF * showF) / lwSum;
          float lwCover = clamp(showW + showF, 0.0, 1.0);
          vec3 lwGap = mix(weftC, uWarp, up) * 0.16;
          diffuseColor.rgb = mix(lwGap, lwCol * mix(0.62, 1.0, lwH), lwCover);`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
          normal = normalize((viewMatrix * vec4(lwN, 0.0)).xyz);`);
    };
    mat.customProgramCacheKey = () => "loom-cloth-v1";
    const len = zF - LM.zFell;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W * sp, len), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(LM.x0 + (W * sp) / 2, yC, LM.zFell + len / 2);
    m.receiveShadow = true; m.castShadow = false; m.name = "cloth";
    m.userData.update = (n) => { U.uN.value = n; };
    return m;
  }

  // ---------------------------------------------------------------- punched card + reader
  /** card(draft, tex) -> Group: lightbox, card plane (glowing holes), reader housing with pins, card roll, front tray.
   *  userData.update(n, pins(j) -> 0..1, pulseRow, pulse) */
  function card(draft, tex) {
    const g = new THREE.Group(); g.name = "card";
    const rows = draft.N, zF = zFrontOf(rows), len = zF - LM.zFell;
    const x0 = CD.x0 - CD.margin, x1 = cardRight + CD.margin, wid = x1 - x0, cx = (x0 + x1) / 2;
    // lightbox under the card
    g.add(box(wid + 0.12, yC - 0.02, len + 0.06, materials.wood, cx, (yC - 0.02) / 2 - 0.004, LM.zFell + len / 2, "lightbox-case"));
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(wid - 0.01, len), materials.lightbox);
    lb.rotation.x = -Math.PI / 2; lb.position.set(cx, yC - 0.018, LM.zFell + len / 2); lb.receiveShadow = true; lb.name = "lightbox";
    g.add(lb);
    const mat = materials.card.clone(); mat.name = "card";
    const U = {
      uDraft: { value: tex }, uN: { value: 0 }, uCX0: { value: CD.x0 }, uCP: { value: CD.colPitch }, uPick: { value: LM.pick },
      uZFell: { value: LM.zFell }, uW: { value: W }, uRows: { value: rows }, uHole: { value: CD.hole }, uRPC: { value: CD.rowsPerCard },
      uMargin: { value: CD.margin }, uCard: { value: new THREE.Color(P.card) }, uGlowC: { value: new THREE.Color(P.glow) },
      uGlow: { value: CD.glow }, uBoost: { value: 0 }, uPulseRow: { value: -10 }, uPulse: { value: 0 },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLwPos;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLwPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          varying vec3 vLwPos;
          uniform sampler2D uDraft; uniform float uN, uCX0, uCP, uPick, uZFell, uW, uRows, uHole, uRPC, uMargin, uGlow, uBoost, uPulseRow, uPulse;
          uniform vec3 uCard, uGlowC;
          ${HASH}`)
        .replace("#include <map_fragment>", `#include <map_fragment>
          float cU = (vLwPos.x - uCX0) / uCP;
          float cD = (vLwPos.z - uZFell) / uPick;
          float cRc = uN - cD;
          float cFw = max(fwidth(vLwPos.x), fwidth(vLwPos.z)) * 0.9;
          float cJ = floor(cU), cK = floor(cRc);
          float clu = fract(cU) - 0.5, clv = fract(cRc) - 0.5;
          if (cD < 0.0 || cK < -1.0) discard; // the card feeds out of the reader: emerged rows + a one-row leader
          vec4 cCell = texture2D(uDraft, vec2((clamp(cJ, 0.0, uW - 1.0) + 0.5) / uW, (clamp(cK, 0.0, uRows - 1.0) + 0.5) / uRows));
          float cIn = step(0.0, cJ) * step(cJ, uW - 1.0) * step(0.0, cK);
          float cOn = step(0.5, cCell.a) * cIn;
          float cR = uHole * min(uCP, uPick);
          float cr = length(vec2(clu * uCP, clv * uPick));
          float cHole = (1.0 - smoothstep(cR - cFw, cR + cFw, cr)) * cOn;
          float cCr = mod(cRc, uRPC);
          float cLz = min(abs(cCr - 1.5), abs(cCr - (uRPC - 1.5))) * uPick;
          float cLx = min(abs(vLwPos.x - (uCX0 - uMargin * 0.5)), abs(vLwPos.x - (uCX0 + uW * uCP + uMargin * 0.5)));
          float cLace = (1.0 - smoothstep(0.011 - cFw, 0.011 + cFw, length(vec2(cLx, cLz)))) * step(0.0, cK);
          float cDs = abs(fract(cRc / uRPC + 0.5) - 0.5) * uRPC * uPick;
          float cSeam = (1.0 - smoothstep(0.0025, 0.0025 + cFw, cDs)) * step(0.0, cK + 0.5);
          float cTone = 0.93 + 0.07 * lwHash(floor(cRc / uRPC) + 11.0);
          float cOpen = max(cHole, cLace);
          diffuseColor.rgb = mix(uCard * cTone * (1.0 - 0.45 * cSeam), vec3(0.03), cOpen);
          float cPulse = uPulse * (1.0 - step(0.5, abs(cK - uPulseRow)));`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          totalEmissiveRadiance += uGlowC * (cHole * (uGlow + uBoost + cPulse) + cLace * 0.5 * uGlow);`);
    };
    mat.customProgramCacheKey = () => "loom-card-v1";
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(wid, len), mat);
    pl.rotation.x = -Math.PI / 2; pl.position.set(cx, yC - 0.008, LM.zFell + len / 2); pl.receiveShadow = true; pl.name = "card-strip";
    g.add(pl);
    // reader housing over the fell line, card roll behind, pins on top
    const rd = CD.readerDepth, rh = 0.12;
    g.add(box(wid + 0.14, rh + 0.03, rd, materials.wood, cx, yC - 0.03 + (rh + 0.03) / 2, LM.zFell - rd / 2 + 0.006, "reader"));
    g.add(box(wid + 0.02, 0.012, rd * 0.6, materials.brass, cx, yC + rh + 0.006, LM.zFell - rd / 2 + 0.006, "reader-plate"));
    const rollMat = new THREE.MeshStandardMaterial({ color: P.card, roughness: 0.8 }); rollMat.name = "card-roll";
    const roll = rodX(0.13, wid - 0.02, rollMat, cx, yC + 0.02, LM.zFell - rd - 0.16, "card-roll");
    g.add(roll);
    const pins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0085, 0.0085, CD.pin, 10), materials.brass, W);
    pins.name = "reader-pins"; pins.castShadow = true; pins.frustumCulled = false;
    g.add(pins);
    const M = new THREE.Matrix4();
    const pinBase = yC + rh + 0.012 - CD.pin / 2 + 0.006;
    g.userData.update = (n, pinUp, pulseRow, pulse, boost = 0) => {
      U.uN.value = n; U.uBoost.value = boost; U.uPulseRow.value = pulseRow; U.uPulse.value = pulse;
      roll.rotation.x = (n * LM.pick) / 0.13;
      for (let j = 0; j < W; j++) { M.makeTranslation(cardX(j), pinBase + CD.pin * 0.75 * pinUp(j), LM.zFell - rd / 2 + 0.006); pins.setMatrixAt(j, M); }
      pins.instanceMatrix.needsUpdate = true;
    };
    return g;
  }

  // ---------------------------------------------------------------- overlay caption: a woven name-tape
  /** caption() -> overlay tape (cream, red running stitch, navy text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1300, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 1.25);
      const pw = Math.min(Wc - 16, tw + 2 * pad), ph = Q.h, oy = 6, ox = Math.round((Wc - pw) / 2);
      x.fillStyle = Q.shadow; x.beginPath(); x.roundRect(ox + 3, oy + 7, pw, ph, 6); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 6); x.fill();
      // faint woven ribs
      x.globalAlpha = 0.07; x.fillStyle = Q.ink;
      for (let yy = oy + 4; yy < oy + ph - 2; yy += 4) x.fillRect(ox + 4, yy, pw - 8, 1);
      x.globalAlpha = 1;
      // running stitch border
      x.strokeStyle = Q.stitch; x.lineWidth = 3; x.setLineDash([12, 8]);
      x.beginPath(); x.roundRect(ox + 9, oy + 9, pw - 18, ph - 18, 4); x.stroke(); x.setLineDash([]);
      // folded ends
      x.fillStyle = Q.stitch;
      for (const ex of [ox + 22, ox + pw - 22]) { x.beginPath(); x.arc(ex, oy + ph / 2, 5, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "center";
      x.fillText(st.text, ox + pw / 2, oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * loom(plan) -> { group, cloth, card, warp, reed, shuttle, weft, update(t) } (adds itself to the scene)
   *   update(t): reads plan.at(t) once and drives every part from it.
   */
  function loom(plan, o = {}) {
    const draft = plan.draft, group = new THREE.Group(); group.name = "loom";
    const tex = draftTexture(draft);
    uploadTexture(stage, tex);
    const fr = frame(draft.N), wp = warp(plan), rd = reed(), sh = shuttle(), wf = weft(), cl = cloth(draft, tex), cdg = card(draft, tex);
    group.add(table(o.table), fr, wp, rd, sh, wf, cl, cdg);
    stage.scene.add(group);
    const xEdgeL = LM.x0 - 0.01, xEdgeR = xRight + 0.01;
    return {
      group, cloth: cl, card: cdg, warp: wp, reed: rd, shuttle: sh, weft: wf, frame: fr, texture: tex,
      update(t, o2 = {}) {
        const s = plan.at(t);
        const k = clamp(s.k, 0, draft.N - 1), hex = draft.weft[k];
        fr.userData.update(s.n);
        wp.userData.update(t, s);
        rd.userData.update(s.beat);
        // shuttle: rests on the side it last arrived at; flies with flyU during the pick
        const from = s.dir > 0 ? SH.restL : SH.restR, to = s.dir > 0 ? SH.restR : SH.restL;
        const x = s.k < 0 ? SH.restL : s.k >= draft.N ? (s.side > 0 ? SH.restR : SH.restL) : lerp(from, to, s.flyU);
        sh.userData.update(x, hex);
        const entry = s.dir > 0 ? xEdgeL : xEdgeR;
        const tail = clamp(x - s.dir * SH.length * 0.5, xEdgeL, xEdgeR);
        wf.userData.update(s.weftOn && s.k >= 0 && s.k < draft.N, entry, tail, lerp(LM.zShuttle, LM.zFell - 0.004, s.weftZ), hex);
        cl.userData.update(s.n);
        // card: pins follow the lifted threads; the newest row of holes pulses as it slides out beside its cloth row
        const pinUp = (j) => clamp(plan.lift(j, t, s), 0, 1);
        const pulse = s.k >= 0 && s.k < draft.N ? CD.pulse * Math.sin(Math.PI * clamp(s.adv)) : 0;
        cdg.userData.update(s.n, pinUp, s.k, pulse, (o2.boost ?? 0) * CD.boost);
      },
    };
  }

  const props = { table, frame, warp, reed, shuttle, weft, cloth, card, caption, loom, draftTexture };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: draftLib, motion: draftLib, helpers: { xWarp, cardX, zFrontOf, hash01 },
  };
}
