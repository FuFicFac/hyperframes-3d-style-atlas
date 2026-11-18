// styles/paper-marbling/style.js — "Paper Marbling". The look lives in spec.js; WHAT is done to the bath and WHEN lives
// in marbleplan.js (THREE-free planner shared with SCORE). This file turns a plan into pictures:
//   - the bath: a lit plane whose colour is computed per pixel by walking the plan's operations backwards
//     (GLSL copy of marbleplan.sample; 4 sub-samples per pixel from derivatives taken once, outside any branch),
//   - the sheet: a strip mesh whose vertices are rewritten from plan.paper.pointAt(x, z, t); its underside carries the
//     same pattern function (so the print is the bath's mirror image, as in the real craft),
//   - tray, table, ink jars, pipette + falling beads, stylus, comb, and an overlay caption chip.
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import * as marbleplan from "./marbleplan.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const MAX_INKS = 8;

/** GLSL: the marbling function (mirror of marbleplan.sample) */
const marbleGLSL = (n) => /* glsl */ `
#define MARBLE_N ${n}
uniform vec4 uOpA[MARBLE_N];
uniform vec4 uOpB[MARBLE_N];
uniform vec4 uOpC[MARBLE_N];
uniform vec3 uInk[${MAX_INKS}];
uniform vec3 uBase;
uniform vec4 uLook;      // rim, rimStart, mottle, mottleScale
uniform vec4 uSheet;     // paper half w, half h, residue (bath) | ghost (paper), gain
uniform float uPaperMode;
varying vec2 vMarble;
float mHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float mNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mHash(i), mHash(i + vec2(1., 0.)), f.x), mix(mHash(i + vec2(0., 1.)), mHash(i + vec2(1., 1.)), f.x), f.y);
}
vec3 marbleAt(vec2 p) {
  for (int i = MARBLE_N - 1; i >= 0; i--) {
    vec4 A = uOpA[i];
    if (A.x < 0.5) continue;                       // not started / unused
    vec4 B = uOpB[i];
    if (A.x < 1.5) {                               // ink drop
      vec2 d = p - A.yz;
      float d2 = dot(d, d), r2 = A.w * A.w;
      if (d2 < r2) {
        vec2 q = d / max(A.w, 1e-4);
        vec3 c = uInk[int(B.x + 0.5)];
        c *= 1. - uLook.x * smoothstep(uLook.y, 1., length(q));
        c *= 1. + uLook.z * (mNoise(q * uLook.w + float(i) * 7.31) - 0.5) * 2.;
        return c;
      }
      p = A.yz + d * sqrt(max(1. - r2 / d2, 0.));
    } else {                                       // tine line / comb
      vec4 C = uOpC[i];
      vec2 rel = p - A.yz;
      float s = dot(rel, B.xy), n = dot(rel, vec2(-B.y, B.x));
      float dw = abs(mod(n + 0.5 * B.w, max(B.w, 1e-4)) - 0.5 * B.w);
      float d = mix(abs(n), dw, step(1e-4, B.w));
      float g = smoothstep(0., 1., (C.x - s) / C.y);
      p -= B.xy * (A.w * B.z / (d + B.z) * g);
    }
  }
  return uBase * (1. + 0.5 * uLook.z * (mNoise(p * 2.3) - 0.5) * 2.);
}
vec3 marbleAA(vec2 p, vec2 dx, vec2 dy) {          // rotated-grid 4 taps over the pixel footprint
  return 0.25 * (marbleAt(p + 0.125 * dx + 0.375 * dy) + marbleAt(p - 0.375 * dx + 0.125 * dy)
               + marbleAt(p + 0.375 * dx - 0.125 * dy) + marbleAt(p - 0.125 * dx - 0.375 * dy));
}
`;
const MARBLE_APPLY = /* glsl */ `
#include <map_fragment>
{
  vec2 mdx = dFdx(vMarble), mdy = dFdy(vMarble);
  vec3 mc = marbleAA(vMarble, mdx, mdy);
  vec2 me = uSheet.xy - abs(vMarble);
  float inSheet = smoothstep(0., 0.012, min(me.x, me.y));
  float soak = 0.85 + 0.3 * mNoise(vMarble * 9.);
  vec3 bath = mix(mc, uBase, clamp(uSheet.z * inSheet * soak, 0., 1.));           // bath: ink the sheet took away
  vec3 back = mix(uBase, mc, clamp(uSheet.z * soak, 0., 1.));                     // sheet top: wet show-through
  vec3 print = mc * uSheet.w;                                                     // sheet underside: the print
  vec3 sheet = mix(print, back, gl_FrontFacing ? 1. : 0.);
  diffuseColor.rgb = mix(bath, sheet, uPaperMode);
}
`;

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const TR = spec.tray, TL = spec.tools, LK = spec.look;
  const inkColor = spec.inks.map((n) => new THREE.Color(P[n]));
  const up = new THREE.Vector3(0, 1, 0);
  const leanQuat = (lean) => new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(...lean).normalize());

  // ---------------------------------------------------------------- marbling uniforms (shared by bath + sheet)
  const N = spec.maxOps;
  const state = { A: new Float32Array(N * 4), B: new Float32Array(N * 4), C: new Float32Array(N * 4) };
  const inkFlat = new Float32Array(MAX_INKS * 3);
  inkColor.forEach((c, i) => inkFlat.set([c.r, c.g, c.b], i * 3));
  const shared = {
    uOpA: { value: state.A }, uOpB: { value: state.B }, uOpC: { value: state.C }, uInk: { value: inkFlat },
    uLook: { value: new THREE.Vector4(LK.rim, LK.rimStart, LK.mottle, LK.mottleScale) },
  };
  /** marbled(material, { base, paper }) -> the material with the marbling colour injected; userData.marble = its own uniforms */
  function marbled(mat, { base, paper = false, half = [0, 0] }) {
    const own = {
      uBase: { value: new THREE.Color(base) }, uPaperMode: { value: paper ? 1 : 0 },
      uSheet: { value: new THREE.Vector4(half[0], half[1], 0, paper ? LK.printGain : 1) },
    };
    mat.userData.marble = own;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, shared, own);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aMarble;\nvarying vec2 vMarble;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMarble = aMarble;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n" + marbleGLSL(N))
        .replace("#include <map_fragment>", MARBLE_APPLY);
    };
    mat.customProgramCacheKey = () => `paper-marbling-${paper ? "sheet" : "bath"}-${N}`;
    mat.needsUpdate = true;
    return mat;
  }

  // ---------------------------------------------------------------- table + tray
  /** table() -> pale wood table top */
  function table(o = {}) {
    const size = o.size ?? TR.table.size, mat = materials.table;
    if (mat.map) { mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(size / TR.table.plankMetres, size / TR.table.plankMetres); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2; m.position.y = TR.table.y; m.receiveShadow = true; m.name = "table";
    return m;
  }
  /** tray() -> Group: white enamel tray (floor + four walls) with a thin navy rim line */
  function tray() {
    const g = new THREE.Group(); g.name = "tray";
    const { w, h, wall, height, rim } = TR, ow = w + wall * 2, oh = h + wall * 2;
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    add(new THREE.BoxGeometry(ow, 0.03, oh), materials.tray, 0, 0.015, 0);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(ow, height, wall), materials.tray, 0, height / 2, s * (h / 2 + wall / 2));
      add(new THREE.BoxGeometry(wall, height, h), materials.tray, s * (w / 2 + wall / 2), height / 2, 0);
      add(new THREE.BoxGeometry(ow + rim, rim * 0.6, wall + rim), materials.trayRim, 0, height + rim * 0.3, s * (h / 2 + wall / 2));
      add(new THREE.BoxGeometry(wall + rim, rim * 0.6, h + rim * 0), materials.trayRim, s * (w / 2 + wall / 2), height + rim * 0.3, 0);
    }
    return g;
  }
  /** bath() -> Mesh: the liquid surface carrying the marbling function */
  function bath() {
    const geo = new THREE.PlaneGeometry(TR.w, TR.h, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, am = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { am[2 * i] = pos.getX(i); am[2 * i + 1] = pos.getZ(i); }
    geo.setAttribute("aMarble", new THREE.BufferAttribute(am, 2));
    const m = new THREE.Mesh(geo, marbled(materials.bath, { base: P.bath, half: [spec.paper.w / 2, spec.paper.h / 2] }));
    m.position.y = TR.bathY; m.receiveShadow = true; m.name = "bath";
    return m;
  }
  /** jars([{ x, z, ink }]) -> Group: small ceramic cups of ink on the table */
  function jars(list) {
    const g = new THREE.Group(); g.name = "jars";
    const { r, h } = TL.jars;
    for (const j of list) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.86, h, 36), materials.jar);
      cup.position.set(j.x, h / 2, j.z); cup.castShadow = cup.receiveShadow = true; g.add(cup);
      const ink = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 36), new THREE.MeshStandardMaterial({ color: P[j.ink], roughness: 0.25 }));
      ink.rotation.x = -Math.PI / 2; ink.position.set(j.x, h + 0.002, j.z); g.add(ink);
    }
    return g;
  }

  // ---------------------------------------------------------------- tools
  /** pipette() -> Group with origin at the tip; userData.setInk(index) */
  function pipette() {
    const T = TL.pipette, g = new THREE.Group(); g.name = "pipette";
    const L = T.length, r = T.r;
    const glass = materials.glass; glass.transparent = true; glass.depthWrite = false;
    const inkMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3 });
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.3, L * 0.16, 20), inkMat); nozzle.position.y = L * 0.08; g.add(nozzle);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.74, r * 0.74, L * 0.36, 20), inkMat); col.position.y = L * 0.34; g.add(col);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L * 0.56, 24, 1, true), glass); tube.position.y = L * 0.44; tube.renderOrder = 3; g.add(tube);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.25, L * 0.04, 24), materials.brass); collar.position.y = L * 0.73; g.add(collar);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(r * 1.9, 24, 16), materials.rubber); bulb.scale.set(1, 1.7, 1); bulb.position.y = L * 0.75 + r * 2.6; g.add(bulb);
    g.traverse((m) => { if (m.isMesh && m !== tube) m.castShadow = true; });
    g.quaternion.copy(leanQuat(T.lean));
    g.userData.setInk = (i) => inkMat.color.copy(inkColor[i] ?? inkColor[0]);
    return g;
  }
  /** stylus() -> Group with origin at the tip: steel needle + wooden grip */
  function stylus() {
    const T = TL.stylus, g = new THREE.Group(); g.name = "stylus";
    const L = T.length;
    const needle = new THREE.Mesh(new THREE.CylinderGeometry(T.rGrip * 0.45, T.rTip, L * 0.42, 16), materials.steel); needle.position.y = L * 0.21; g.add(needle);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(T.rGrip, T.rGrip * 0.8, L * 0.58, 20), materials.wood); grip.position.y = L * 0.71; g.add(grip);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(T.rGrip, 16, 12), materials.brass); cap.position.y = L; g.add(cap);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.quaternion.copy(leanQuat(T.lean));
    return g;
  }
  /** comb(shape) -> Group with origin at the centre of the tine tips; shape = plan.combShape ({ n, tines, nMin, nMax }) */
  function comb(shape) {
    const T = TL.comb, g = new THREE.Group(); g.name = "comb";
    const len = shape.nMax - shape.nMin + 0.16, mid = (shape.nMax + shape.nMin) / 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(T.bar[0], T.bar[1], len), materials.wood);
    bar.position.set(0, T.tineLen + T.bar[1] / 2, mid); g.add(bar);
    for (const n of shape.tines) {
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(T.tineR, T.tineR * 0.5, T.tineLen, 10), materials.steel);
      tine.position.set(0, T.tineLen / 2, n); g.add(tine);
    }
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.rotation.y = Math.atan2(shape.n[0], shape.n[1]); // local +Z (the bar) along the plan's n
    return g;
  }

  // ---------------------------------------------------------------- the sheet
  /** sheet(plan) -> Mesh; userData.update(t) rewrites every vertex from plan.paper.pointAt and sets ghost / visibility */
  function sheet(plan) {
    const PP = plan.paper, NX = 2, NZ = spec.paper.segments;
    const count = (NX + 1) * (NZ + 1), pos = new Float32Array(count * 3), am = new Float32Array(count * 2), idx = [];
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const k = j * (NX + 1) + i;
      am[2 * k] = -PP.w / 2 + (i / NX) * PP.w; am[2 * k + 1] = -PP.h / 2 + (j / NZ) * PP.h;
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + NX + 1, c = a + 1, d = b + 1;
      idx.push(a, b, c, b, d, c); // +Y normal when flat = the sheet's top (front) face
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aMarble", new THREE.BufferAttribute(am, 2));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setIndex(idx);
    const mat = marbled(materials.paper, { base: P.paper, paper: true });
    mat.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "sheet"; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.update = (t) => {
      const st = PP.state(t);
      mesh.visible = st.visible;
      mat.userData.marble.uSheet.value.z = st.ghost * LK.ghost;
      if (!st.visible) return;
      for (let k = 0; k < count; k++) {
        const p = PP.pointAt(am[2 * k], am[2 * k + 1], t);
        pos[3 * k] = p[0]; pos[3 * k + 1] = p[1]; pos[3 * k + 2] = p[2];
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
    };
    return mesh;
  }

  // ---------------------------------------------------------------- overlay caption chip
  /** caption() -> overlay chip (dark plate, three-ring ink icon, light text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 24;
    const ringCols = [P.vermilion, P.ochre, P.teal];
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Math.round(Q.cap * 1.3)}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.75), ic = Math.round(Q.h * 0.56);
      const pw = Math.min(W - 16, pad + ic + pad + tw + pad), ph = Q.h, oy = 6, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(20,24,40,0.25)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, 16); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 16); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 1, oy + 1, pw - 2, ph - 2, 15); x.stroke();
      const cx = ox + pad + ic / 2, cy = oy + ph / 2;
      ringCols.forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(cx, cy, (ic / 2) * (1 - i * 0.3), 0, Math.PI * 2); x.fill(); });
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + pad, oy + Math.round(ph / 2) + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * marbling(plan, { jars: [{ x, z, ink }] }) -> { group, bath, sheet, update(t) } (adds itself to the scene)
   *   update(t): shader operation state from plan.stateAt(t); pipette, beads, stylus and comb from their tracks; the
   *   sheet's vertices from plan.paper; the bath's residue once the sheet has covered it.
   */
  function marbling(plan, o = {}) {
    const group = new THREE.Group(); group.name = "marbling";
    group.add(table(), tray());
    const b = bath(); group.add(b);
    if (o.jars?.length) group.add(jars(o.jars));
    const pip = pipette(); group.add(pip);
    const beadMat = inkColor.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.15, clearcoat: 0.6 }));
    const beads = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), beadMat[0]); m.castShadow = true; m.visible = false; group.add(m); return m; });
    const sty = stylus(); group.add(sty);
    const cmb = plan.combShape ? comb(plan.combShape) : null; if (cmb) group.add(cmb);
    const sh = plan.paper ? sheet(plan) : null; if (sh) group.add(sh);
    stage.scene.add(group);
    const bathU = materials.bath.userData.marble;
    return {
      group, bath: b, sheet: sh, pipette: pip, stylus: sty, comb: cmb,
      update(t) {
        plan.stateAt(t, state);
        const pp = plan.pipetteAt(t);
        pip.visible = pp.visible; pip.position.set(...pp.tip); pip.userData.setInk(pp.ink);
        beads.forEach((m, i) => {
          const bd = pp.beads[i];
          m.visible = !!bd && bd.scale > 1e-4;
          if (m.visible) { m.position.set(...bd.p); m.scale.setScalar(bd.scale); m.material = beadMat[bd.ink] ?? beadMat[0]; }
        });
        const s = plan.stylusAt(t); sty.visible = s.visible; sty.position.set(...s.tip);
        if (cmb) { const c = plan.combAt(t); cmb.visible = c.visible; cmb.position.set(...c.p); }
        if (sh) {
          sh.userData.update(t);
          bathU.uSheet.value.z = plan.paper.state(t).covered ? LK.residue : 0;
        }
      },
    };
  }

  const props = { table, tray, bath, jars, pipette, stylus, comb, sheet, caption, marbling };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: marbleplan, motion: marbleplan, helpers: { marbled },
  };
}
