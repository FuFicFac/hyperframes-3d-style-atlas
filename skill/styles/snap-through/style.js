// styles/snap-through/style.js — "Snap-Through": a bright workbench rig where a blue spring-steel arch carries brass
// weights until it snaps through. The look lives in spec.js; WHERE the crown is, WHEN each weight lands, how the stack
// hops and what the dial reads lives in snap.js (THREE-free planner shared with SCORE). This file turns a plan into
// pictures: bench + wall, base plate, pedestals, clamp jaws and cap screws, the strip (one segmented box rewritten from
// the crown each frame) and its snap ghosts, the tray + post, seven slotted brass weights, the ready stand, the dial
// gauge (face texture drawn once, needle + plunger from the plan) and an overlay caption plate. Props never animate
// themselves: the scene calls update(t), and every update assigns from t (no accumulation).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { RoundedBoxGeometry } from "../../kit/builders.js";
import { screenCanvas } from "../../kit/overlay.js";
import { woodTexture, canvasTexture } from "../../kit/textures.js";
import { newCanvas } from "../../kit/canvas.js";
import { clamp, smoothstep, TAU } from "../../kit/time.js";
import * as snap from "./snap.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, R = spec.rig;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const shadow = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
  const rbox = (w, h, d, r, mat) => shadow(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat));
  const cyl = (r, h, mat, seg = 40) => shadow(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat));

  // wood worktop: kit woodTexture, grain along X
  const WD = spec.wood;
  materials.bench.map = woodTexture({ size: 1024, boards: WD.boards, seed: WD.seed, dark: WD.dark, mid: WD.mid, light: WD.light, seam: WD.seam, contrast: WD.contrast, grainFreq: WD.grainFreq, grainWarp: WD.grainWarp, repeat: [10 / WD.tileLen, 4.6 / (WD.boards * WD.boardW)] });
  materials.bench.needsUpdate = true;
  materials.stripGhost.transparent = true; materials.stripGhost.depthWrite = false;
  materials.glass.transparent = true; materials.glass.depthWrite = false;

  // ---------------------------------------------------------------- bench + wall
  /** bench() -> Group: wooden worktop (top at y = 0) and a painted wall behind it */
  function bench() {
    const g = new THREE.Group(); g.name = "bench";
    const top = shadow(new THREE.Mesh(new THREE.BoxGeometry(10, 0.12, 4.6), materials.bench), false, true);
    top.position.set(0, -0.06, 0.5); g.add(top);
    const wall = shadow(new THREE.Mesh(new THREE.PlaneGeometry(24, 10), materials.wall), false, true);
    wall.position.set(0, 4.6, -1.85); g.add(wall);
    return g;
  }

  // ---------------------------------------------------------------- frame: base plate, pedestals, clamps, ready stand
  /** frame() -> Group (static): base plate, two pedestals, lower + upper jaws, cap screws + washers, the ready stand */
  function frame() {
    const g = new THREE.Group(); g.name = "frame";
    const BP = R.basePlate, C = R.clamp, PD = R.pedestal, T = R.strip.thick;
    const plate = rbox(BP.w, BP.h, BP.d, 0.015, materials.basePlate); plate.position.set(BP.x, BP.h / 2, 0); g.add(plate);
    const jawLow = R.clampY - T / 2 - C.jawH, pedH = jawLow - BP.h;
    for (const sx of [-1, 1]) {
      const cx = sx * (R.span / 2 + C.len / 2);
      const ped = rbox(C.len - 0.04, pedH, PD.d, PD.chamfer, materials.pedestal); ped.position.set(cx, BP.h + pedH / 2, 0); g.add(ped);
      const lo = rbox(C.len, C.jawH, C.w, 0.012, materials.jaw); lo.position.set(cx, jawLow + C.jawH / 2, 0); g.add(lo);
      const hi = rbox(C.len, C.jawH, C.w, 0.012, materials.jaw); hi.position.set(cx, R.clampY + T / 2 + C.jawH / 2, 0); g.add(hi);
      for (const sz of [-1, 1]) {
        const z = sz * C.w * 0.3, y0 = R.clampY + T / 2 + C.jawH;
        const washer = cyl(C.boltR * 1.45, 0.012, materials.chrome); washer.position.set(cx, y0 + 0.006, z); g.add(washer);
        const head = cyl(C.boltR, 0.05, materials.bolt, 6); head.position.set(cx, y0 + 0.012 + 0.025, z); head.rotation.y = 0.3 + sz * 0.2; g.add(head);
        const sock = new THREE.Mesh(new THREE.CylinderGeometry(C.boltR * 0.45, C.boltR * 0.45, 0.004, 6), materials.needle);
        sock.position.set(cx, y0 + 0.012 + 0.051, z); sock.rotation.y = head.rotation.y; g.add(sock);
      }
      // two screws holding each pedestal to the plate
      for (const sz of [-1, 1]) { const s = cyl(0.028, 0.02, materials.bolt, 6); s.position.set(cx + sx * 0.22, BP.h + 0.01, sz * 0.34); g.add(s); }
    }
    const RD = R.ready;
    const stand = cyl(RD.plateR, RD.baseY, materials.basePlate, 48); stand.position.set(RD.x, RD.baseY / 2, RD.z); g.add(stand);
    const rp = cyl(R.post.r, RD.postH, materials.chrome, 20); rp.position.set(RD.x, RD.baseY + RD.postH / 2, RD.z); g.add(rp);
    const knob = shadow(new THREE.Mesh(new THREE.SphereGeometry(R.post.r * 1.5, 20, 12), materials.chrome)); knob.position.set(RD.x, RD.baseY + RD.postH, RD.z); g.add(knob);
    return g;
  }

  // ---------------------------------------------------------------- the strip + snap ghosts
  function stripGeometry() {
    const S = R.strip, len = R.span + 2 * S.inClamp;
    const geo = new THREE.BoxGeometry(len, S.thick, S.width, S.segs, 1, 1);
    geo.userData.base = Float32Array.from(geo.attributes.position.array);
    return geo;
  }
  function bend(geo, plan, c) {
    const pos = geo.attributes.position, b = geo.userData.base;
    for (let i = 0; i < pos.count; i++) pos.setY(i, b[i * 3 + 1] + R.clampY + c * plan.profile(b[i * 3]));
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  /** strip(plan) -> Group: the blue strip and its ghosts. userData.update(t) */
  function strip(plan) {
    const g = new THREE.Group(); g.name = "strip";
    const main = shadow(new THREE.Mesh(stripGeometry(), materials.strip)); main.name = "steel"; main.frustumCulled = false;
    g.add(main);
    const GH = R.ghosts, ghosts = [];
    for (let k = 1; k <= GH.count; k++) {
      const m = new THREE.Mesh(stripGeometry(), materials.stripGhost.clone()); m.frustumCulled = false; m.renderOrder = 3; m.visible = false;
      ghosts.push(m); g.add(m);
    }
    g.userData.update = (t) => {
      bend(main.geometry, plan, plan.crown(t));
      const inWin = t >= plan.snapGo && t < plan.snapGo + GH.window;
      ghosts.forEach((m, i) => {
        const tg = t - (i + 1) * GH.step;
        const speed = Math.abs(plan.crown(tg + 0.004) - plan.crown(tg - 0.004)) / 0.008;
        const a = inWin ? clamp(speed / 6, 0, 1) * (1 - i / (GH.count + 0.5)) * spec.materials.stripGhost.opacity : 0;
        m.visible = a > 0.01;
        m.material.opacity = a;
        if (m.visible) bend(m.geometry, plan, plan.crown(tg));
      });
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- tray + weights
  function slottedDisc() {
    const W = R.weight, r = W.r, hr = W.hole, sw = W.slot / 2;
    const a0 = Math.asin(sw / r), a1 = Math.asin(sw / hr);
    const s = new THREE.Shape();
    s.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    s.absarc(0, 0, r, a0, TAU - a0, false);
    s.lineTo(Math.cos(a1) * hr, -Math.sin(a1) * hr);
    s.absarc(0, 0, hr, TAU - a1, a1, true);
    s.closePath();
    const bev = 0.007;
    const geo = new THREE.ExtrudeGeometry(s, { depth: W.thick - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: 0.006, bevelSegments: 3, curveSegments: 48 });
    geo.translate(0, 0, -(W.thick - 2 * bev) / 2);
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    return geo;
  }
  /** tray(plan) -> Group: saddle + plate + post riding the crown. userData.update(t) */
  function tray(plan) {
    const g = new THREE.Group(); g.name = "tray";
    const TR = R.tray;
    const sad = cyl(TR.saddleR, TR.saddle, materials.jaw); sad.position.y = TR.saddle / 2; g.add(sad);
    const pl = cyl(TR.r, TR.thick, materials.tray, 56); pl.position.y = TR.saddle + TR.thick / 2; g.add(pl);
    const rim = shadow(new THREE.Mesh(new THREE.TorusGeometry(TR.r - 0.006, 0.008, 10, 64), materials.tray)); rim.rotation.x = Math.PI / 2; rim.position.y = TR.saddle + TR.thick; g.add(rim);
    const pst = cyl(R.post.r, R.post.height, materials.chrome, 20); pst.position.y = TR.saddle + TR.thick + R.post.height / 2; g.add(pst);
    const knob = shadow(new THREE.Mesh(new THREE.SphereGeometry(R.post.r * 1.5, 20, 12), materials.chrome)); knob.position.y = TR.saddle + TR.thick + R.post.height; g.add(knob);
    g.userData.update = (t) => { g.position.y = plan.trayTop(t) - TR.saddle - TR.thick; };
    g.userData.update(0);
    return g;
  }
  /** weights(plan) -> Group of seven slotted brass discs. userData.update(t) poses each from plan.pose(d, t) */
  function weights(plan) {
    const g = new THREE.Group(); g.name = "weights";
    const geo = slottedDisc(), list = [];
    for (let d = 0; d < R.weight.count; d++) {
      const m = shadow(new THREE.Mesh(geo, materials.brass)); m.name = `weight${d}`;
      m.userData.baseRy = Math.PI / 2 + 0.35 * Math.sin(d * 2.4 + 0.5);   // slots face the wall (hidden from the front)
      list.push(m); g.add(m);
    }
    g.userData.update = (t) => {
      list.forEach((m, d) => {
        const q = plan.pose(d, t);
        m.position.set(q.p[0], q.p[1], q.p[2]);
        m.rotation.set(q.rx, m.userData.baseRy + q.ry, q.rz);
      });
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- dial gauge
  function dialFace(limit) {
    const N = 1024, cv = newCanvas(N, N), x = cv.getContext("2d"), c = N / 2;
    x.fillStyle = P.face; x.beginPath(); x.arc(c, c, c, 0, TAU); x.fill();
    const ang = (a) => a - Math.PI / 2;               // 0 at twelve o'clock, clockwise
    x.lineCap = "butt";
    x.strokeStyle = "#cfe0f7"; x.lineWidth = 40; x.beginPath(); x.arc(c, c, c * 0.79, ang(0), ang(limit)); x.stroke();
    x.strokeStyle = P.red; x.lineWidth = 32; x.beginPath(); x.arc(c, c, c * 0.79, ang(limit), ang(TAU) - 0.02); x.stroke();
    for (let i = 0; i < 100; i++) {
      const a = ang((i / 100) * TAU), long = i % 10 === 0, mid = i % 5 === 0;
      const r0 = c * (long ? 0.83 : mid ? 0.87 : 0.9), r1 = c * 0.96;
      x.strokeStyle = P.ink; x.lineWidth = long ? 9 : mid ? 6 : 3.5;
      x.beginPath(); x.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); x.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); x.stroke();
    }
    // the limit mark: a bold red wedge pointing at the threshold
    const a = ang(limit);
    x.fillStyle = P.red; x.beginPath();
    x.moveTo(c + Math.cos(a) * c * 0.97, c + Math.sin(a) * c * 0.97);
    x.lineTo(c + Math.cos(a - 0.07) * c * 0.72, c + Math.sin(a - 0.07) * c * 0.72);
    x.lineTo(c + Math.cos(a + 0.07) * c * 0.72, c + Math.sin(a + 0.07) * c * 0.72);
    x.closePath(); x.fill();
    x.strokeStyle = "#c9ced3"; x.lineWidth = 4; x.beginPath(); x.arc(c, c, c * 0.62, 0, TAU); x.stroke();
    const tex = canvasTexture(cv, { repeat: [1, 1] });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }
  /** gauge(plan) -> Group: body, face, bezel, glass, needle, stem, plunger, column. userData.update(t) */
  function gauge(plan) {
    const g = new THREE.Group(); g.name = "gauge";
    const D = R.dial, z0 = D.z, front = z0 + D.depth / 2;
    const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(D.r, D.r, D.depth, 64), materials.gaugeBody));
    body.rotation.x = Math.PI / 2; body.position.set(0, D.y, z0); g.add(body);
    const face = new THREE.Mesh(new THREE.CircleGeometry(D.r * 0.9, 96), new THREE.MeshStandardMaterial({ map: dialFace(plan.dialLimit), roughness: 0.55, metalness: 0 }));
    face.material.name = "dialFace"; face.receiveShadow = true;
    face.position.set(0, D.y, front + 0.002); g.add(face);
    const bezel = shadow(new THREE.Mesh(new THREE.TorusGeometry(D.r * 0.93, D.r * 0.07, 16, 96), materials.chrome)); bezel.position.set(0, D.y, front + 0.01); g.add(bezel);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(D.r * 0.9, 64), materials.glass); glass.position.set(0, D.y, front + 0.03); glass.renderOrder = 4; g.add(glass);
    // needle: a long tapered pointer with a short tail, pivot cap on top
    const ns = new THREE.Shape();
    ns.moveTo(-0.014, -D.r * 0.2); ns.lineTo(0.014, -D.r * 0.2); ns.lineTo(0.005, D.r * 0.84); ns.lineTo(-0.005, D.r * 0.84); ns.closePath();
    const needle = shadow(new THREE.Mesh(new THREE.ExtrudeGeometry(ns, { depth: 0.006, bevelEnabled: false }), materials.needle), true, false);
    const tip = new THREE.Mesh(new THREE.ExtrudeGeometry((() => { const s = new THREE.Shape(); s.moveTo(-0.0085, D.r * 0.58); s.lineTo(0.0085, D.r * 0.58); s.lineTo(0.0052, D.r * 0.84); s.lineTo(-0.0052, D.r * 0.84); s.closePath(); return s; })(), { depth: 0.0065, bevelEnabled: false }), materials.redMark);
    const pivot = new THREE.Group(); pivot.position.set(0, D.y, front + 0.012); pivot.add(needle, tip); g.add(pivot);
    const cap = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.016, 32), materials.chrome)); cap.rotation.x = Math.PI / 2; cap.position.set(0, D.y, front + 0.022); g.add(cap);
    // stem (fixed sleeve) + plunger (slides with the strip) + contact ball
    const stemTop = R.clampY - 0.46;
    const stem = cyl(D.stemR, stemTop - (D.y + D.r) + 0.01, materials.chrome, 24); stem.position.set(0, (stemTop + D.y + D.r) / 2, z0); g.add(stem);
    const collar = cyl(D.stemR * 1.5, 0.03, materials.chrome, 24); collar.position.set(0, D.y + D.r + 0.012, z0); g.add(collar);
    const plunger = cyl(D.plungerR, 1, materials.chrome, 16); g.add(plunger);
    const ball = shadow(new THREE.Mesh(new THREE.SphereGeometry(D.plungerR * 1.7, 20, 12), materials.chrome)); g.add(ball);
    // column down to the base plate
    const colTop = D.y - D.r, colBot = R.basePlate.h;
    const col = cyl(D.columnR, colTop - colBot + 0.02, materials.pedestal, 32); col.position.set(0, (colTop + colBot) / 2, z0 - 0.01); g.add(col);
    const foot = rbox(0.24, 0.05, 0.2, 0.01, materials.gaugeBody); foot.position.set(0, colBot + 0.025, z0 - 0.01); g.add(foot);
    g.userData.update = (t) => {
      pivot.rotation.z = -plan.dial(t);
      const under = R.clampY + plan.crown(t) - R.strip.thick / 2, tipY = under - D.plungerR * 1.7;
      const len = Math.max(0.01, tipY - stemTop + 0.02);
      plunger.scale.set(1, len, 1); plunger.position.set(0, stemTop - 0.02 + len / 2, z0);
      ball.position.set(0, tipY, z0);
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- overlay caption plate
  /** caption() -> overlay plate (white, ink edge, a blue arch + brass dot icon); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 24, Hp = Q.h + 28;
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), ic = Math.round(Q.h * 0.62);
      const pw = Math.min(Wc - 16, pad + ic + Math.round(pad * 0.6) + tw + pad), ph = Q.h, oy = 6, ox = Math.round((Wc - pw) / 2);
      x.fillStyle = "rgba(28,36,48,0.2)"; x.beginPath(); x.roundRect(ox + 2, oy + 8, pw, ph, 22); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 22); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 4; x.beginPath(); x.roundRect(ox + 2, oy + 2, pw - 4, ph - 4, 20); x.stroke();
      // icon: a little blue arch with a brass weight on its crown (flipped once the arch has snapped)
      const cx = ox + pad + ic / 2, cy = oy + ph / 2 + 6, s = st.flip ? -1 : 1;
      x.strokeStyle = Q.chip; x.lineWidth = 7; x.lineCap = "round";
      x.beginPath(); x.moveTo(cx - ic / 2, cy); x.quadraticCurveTo(cx, cy - s * ic * 0.55, cx + ic / 2, cy); x.stroke();
      x.fillStyle = Q.chip2; x.beginPath(); x.roundRect(cx - 10, cy - s * ic * 0.275 - 20 + 3, 20, 14, 3); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + Math.round(pad * 0.6), oy + Math.round(ph / 2) + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a, flip = false) => { mesh.userData.set({ text, flip }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /** rig(plan) -> { group, strip, tray, weights, gauge, update(t) } (adds itself to the scene) */
  function rig(plan) {
    const group = new THREE.Group(); group.name = "snap-through";
    const bn = bench(), fr = frame(), st = strip(plan), tr = tray(plan), wg = weights(plan), ga = gauge(plan);
    group.add(bn, fr, st, tr, wg, ga);
    stage.scene.add(group);
    const update = (t) => { st.userData.update(t); tr.userData.update(t); wg.userData.update(t); ga.userData.update(t); };
    update(0);
    return { group, strip: st, tray: tr, weights: wg, gauge: ga, update };
  }

  /** shake(t, plan) -> [dx, dy] camera jolt in metres after the snap (decaying, from t only) */
  const shake = (t, plan, amp = 0.025) => {
    const s = t - plan.snapGo;
    if (!(s > 0) || s > 0.8) return [0, 0];
    const k = amp * Math.exp(-s * 7) * smoothstep(0, 0.03, s);
    return [k * Math.sin(s * 71) * 0.5, k * Math.sin(s * 53 + 1.1)];
  };

  const props = { bench, frame, strip, tray, weights, gauge, caption, rig };
  return { spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx, plan: snap, motion: snap, helpers: { shake } };
}
