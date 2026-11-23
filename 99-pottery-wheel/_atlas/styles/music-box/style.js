// styles/music-box/style.js — "Music Box": the open movement of a music box on pale wood. The look lives in spec.js;
// WHERE every pin sits, HOW every tooth moves and WHEN every note sounds lives in tune.js (THREE-free planner shared
// with SCORE). This file turns a plan into pictures: a turned-brass cylinder (canvas map with engraved track rings and
// bar lines) carrying ONE InstancedMesh of steel pins, a steel comb whose 12 teeth pivot at their roots from
// plan.deflection(i, t), a crank + pinion, a wheel + worm + two-vane governor, brackets, bedplate, wood, and an
// overlay caption plate (exact colours). Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { makeCanvas, canvasTexture, woodTexture } from "../../kit/textures.js";
import { hash01, TAU } from "../../kit/time.js";
import * as tune from "./tune.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, M = spec.movement;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const C = M.cylinder, PN = M.pins, CB = M.comb, G = M.gear, DR = M.drive, GV = M.governor;
  const Yc = M.axisY, Rp = C.radius + PN.height;
  const toothTop = Yc + Rp * Math.sin(PN.aPre) - PN.radius;      // rest height of the tooth tops: just under an arriving pin
  const tipZ = Rp - PN.height * 0.6;                               // tooth tips reach under the pins
  const gearR = (G.module * G.teeth) / 2, pinionR = (G.module * DR.pinion) / 2;
  const shadow = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
  const box = (w, h, d, mat, x, y, z) => { const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)); m.position.set(x, y, z); return m; };
  /** a cylinder whose axis lies along X, centred at (x, y, z) */
  const rodX = (r, len, mat, x, y, z, seg = 24) => { const m = shadow(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat)); m.rotation.z = -Math.PI / 2; m.position.set(x, y, z); return m; };

  // ---------------------------------------------------------------- wood
  /** wood({ size }) -> pale wooden table top (kit woodTexture, wide boards = macro scale) */
  function wood(o = {}) {
    const W = spec.wood, size = o.size ?? W.size;
    if (!materials.wood.map) {
      materials.wood.map = woodTexture({ size: 1024, boards: W.boards, seed: W.seed, dark: W.dark, mid: W.mid, light: W.light, seam: W.seam, contrast: W.contrast, grainFreq: W.grainFreq, repeat: [size / W.tile, size / W.tile] });
      materials.wood.needsUpdate = true;
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), materials.wood);
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.name = "wood";
    return m;
  }

  // ---------------------------------------------------------------- gear (spur wheel in the YZ plane, turning about X)
  /** gearGeometry(teeth, module, thickness, holes) -> extruded wheel; a tooth k sits at angle 2 PI k / N - PI / 2 from +Y toward +Z */
  function gearGeometry(N, m, thickness, holes = 0) {
    const r = (m * N) / 2, rr = r - 1.25 * m, ra = r + m, p = TAU / N;
    const s = new THREE.Shape();
    for (let k = 0; k < N; k++) {
      const c = k * p;
      for (const [rad, da] of [[rr, -0.3], [ra, -0.16], [ra, 0.16], [rr, 0.3]]) {
        const a = c + da * p, x = rad * Math.cos(a), y = rad * Math.sin(a);
        if (k === 0 && da === -0.3) s.moveTo(x, y); else s.lineTo(x, y);
      }
    }
    s.closePath();
    for (let h = 0; h < holes; h++) {
      const a = (h / holes) * TAU, hr = r * 0.2, hc = r * 0.55;
      const path = new THREE.Path();
      path.absarc(hc * Math.cos(a), hc * Math.sin(a), hr, 0, TAU, true);
      s.holes.push(path);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, curveSegments: 20 });
    g.translate(0, 0, -thickness / 2);
    g.rotateY(Math.PI / 2);       // shape plane XY -> YZ, thickness along X
    return g;
  }

  // ---------------------------------------------------------------- cylinder map: turned brass + the engraved "staff"
  function cylinderMap(plan) {
    const W = 2048, H = 1024, cv = makeCanvas(W, H), x = cv.getContext("2d");
    x.fillStyle = P.brass; x.fillRect(0, 0, W, H);
    for (let row = 0; row < H; row++) {      // lathe marks: faint light / dark lines running around the cylinder
      const k = hash01(row, 73) - 0.5;
      x.fillStyle = k > 0 ? `rgba(255,240,200,${(k * 0.34).toFixed(3)})` : `rgba(70,40,5,${(-k * 0.3).toFixed(3)})`;
      x.fillRect(0, row, W, 1);
    }
    const rowOf = (px) => (0.5 - px / C.length) * H;                           // v = 1 at +X end; canvas row 0 = v 1
    const colOf = (psi) => ((((psi - Math.PI / 2) / TAU) % 1) + 1) % 1 * W;    // u = (psi - PI/2) / TAU
    x.fillStyle = M.track.ring;
    for (const T of plan.teeth) x.fillRect(0, Math.round(rowOf(T.x)) - 1, W, 3);   // one ring per tooth = one pitch
    x.fillStyle = M.track.bar;                                                    // one line along the axis per bar = time
    const y0 = rowOf(plan.teeth[plan.teeth.length - 1].x + CB.pitch * 0.5), y1 = rowOf(plan.teeth[0].x - CB.pitch * 0.5);
    for (let s = 0; plan.tune.t0 + s * plan.tune.step < C.period - 0.5; s += M.track.barEvery) {
      const psi = Math.PI / 2 + PN.aRel - plan.omega * (plan.tune.t0 + s * plan.tune.step);
      x.fillRect(Math.round(colOf(psi)) - 1, y0, 3, y1 - y0);
    }
    return canvasTexture(cv, { anisotropy: 16 });
  }

  /** cylinder(plan) -> Group at the axis (turns about X): drum + caps, the pins (one InstancedMesh), both wheels. userData.setAngle(a) */
  function cylinder(plan) {
    const g = new THREE.Group(); g.name = "cylinder"; g.position.set(0, Yc, 0);
    const mat = materials.cylinder;
    mat.map = cylinderMap(plan); mat.needsUpdate = true;
    const drum = shadow(new THREE.Mesh(new THREE.CylinderGeometry(C.radius, C.radius, C.length, C.segments, 1), [mat, materials.cylinderCap, materials.cylinderCap]));
    drum.rotation.z = -Math.PI / 2; g.add(drum);
    // pins: axis along the radius at angle psi (from +Y toward +Z), x = the tooth's x
    const len = PN.height + PN.embed;
    const pg = new THREE.CylinderGeometry(PN.radius * 0.82, PN.radius, len, 12);
    const pins = shadow(new THREE.InstancedMesh(pg, materials.pin, plan.pins.length), true, false);
    pins.name = "pins"; pins.frustumCulled = false;
    const q = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const rc = C.radius + (PN.height - PN.embed) / 2;
    plan.pins.forEach((pn, k) => {
      q.setFromAxisAngle(X, pn.psi);
      pos.set(pn.x, rc * Math.cos(pn.psi), rc * Math.sin(pn.psi));
      pins.setMatrixAt(k, m4.compose(pos, q, one));
    });
    pins.instanceMatrix.needsUpdate = true;
    g.add(pins);
    // the two wheels ride on the cylinder: right = driven by the crank pinion, left = drives the governor worm
    const wheelGeo = gearGeometry(G.teeth, G.module, G.thickness, 6);
    for (const sx of [1, -1]) {
      const w = shadow(new THREE.Mesh(wheelGeo, materials.brassPolished));
      w.position.x = sx * G.x;
      w.rotation.x = sx > 0 ? DR.bearing + Math.PI / 2 : 0;    // a tooth points at the pinion when the cylinder angle is 0
      g.add(w);
    }
    g.userData.setAngle = (a) => { g.rotation.x = a; };
    return g;
  }

  // ---------------------------------------------------------------- comb
  /** comb(plan) -> Group: steel heel on a brass block with blued screws + one pivoting tooth per pitch. userData.update(t) */
  function comb(plan) {
    const g = new THREE.Group(); g.name = "comb";
    const hz0 = CB.heelZ[0], hz1 = CB.heelZ[1], hw = CB.pitch * CB.teeth;
    const xm = CB.x0 + (CB.pitch * (CB.teeth - 1)) / 2;
    g.add(box(hw, CB.heelThickness, hz1 - hz0, materials.steel, xm, toothTop - CB.heelThickness / 2, (hz0 + hz1) / 2));
    const blockH = toothTop - CB.heelThickness - M.bedplate.h;
    g.add(box(hw + 0.1, blockH, hz1 - hz0 + 0.04, materials.brass, xm, M.bedplate.h + blockH / 2, (hz0 + hz1) / 2 + 0.04));
    // a recessed darker panel with two small screws breaks up the block's front face
    g.add(box(hw - 0.3, blockH - 0.2, 0.012, materials.cylinderCap, xm, M.bedplate.h + blockH / 2, hz1 + 0.06 + 0.004));
    for (const s of [-1, 1]) {
      const sc = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 20), materials.brassPolished));
      sc.rotation.x = Math.PI / 2; sc.position.set(xm + s * (hw / 2 - 0.07), M.bedplate.h + blockH / 2, hz1 + 0.07); g.add(sc);
    }
    for (let k = 0; k < 4; k++) {
      const sx = xm + (k - 1.5) * (hw / 4), sz = (hz0 + hz1) / 2 + 0.02;
      const head = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.066, 0.03, 24), materials.screw)); head.position.set(sx, toothTop + 0.015, sz); g.add(head);
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.006, 0.014), materials.steel); slot.position.set(sx, toothTop + 0.031, sz); slot.rotation.y = 0.5 + k * 0.9; g.add(slot);
    }
    const teeth = plan.teeth.map((T) => {
      const rootZ = tipZ + T.length;
      // the fixed root: from the heel out to where the tooth starts to flex
      if (hz0 - rootZ > 0.002) g.add(box(CB.pitch, CB.heelThickness, hz0 - rootZ + 0.004, materials.steel, T.x, toothTop - CB.heelThickness / 2, (hz0 + rootZ) / 2));
      const geo = new THREE.BoxGeometry(CB.width, CB.thickness, T.length);
      geo.translate(0, -CB.thickness / 2, -T.length / 2);       // pivot at the root, top face at y = 0, tip at z = -length
      const mat = materials.tooth.clone();
      mat.emissive = new THREE.Color(P.glow); mat.emissiveIntensity = 0;
      const mesh = shadow(new THREE.Mesh(geo, mat));
      mesh.position.set(T.x, toothTop, rootZ); mesh.name = `tooth-${T.name}`;
      g.add(mesh);
      return { T, mesh, mat };
    });
    g.userData.update = (t) => {
      for (const { T, mesh, mat } of teeth) {
        mesh.rotation.x = Math.asin(Math.max(-0.5, Math.min(0.5, plan.deflection(T.i, t) / T.length)));   // tip travel -> pivot angle
        mat.emissiveIntensity = plan.energy(T.i, t) * M.vib.glow;
      }
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- frame: bedplate, brackets, arbor
  function frame() {
    const g = new THREE.Group(); g.name = "frame";
    const B = M.bedplate, bw = B.x[1] - B.x[0], bd = B.z[1] - B.z[0];
    const bed = shadow(new THREE.Mesh(new RoundedBoxGeometry(bw, B.h, bd, 3, 0.03), materials.brass));
    bed.position.set((B.x[0] + B.x[1]) / 2, B.h / 2, (B.z[0] + B.z[1]) / 2); g.add(bed);
    g.add(rodX(0.05, M.bracket.x * 2 + 0.3, materials.steel, 0, Yc, 0));                       // the arbor
    // right bracket: carries the arbor and the crank shaft
    const crankY = Yc + (gearR + pinionR) * Math.cos(DR.bearing), crankZ = (gearR + pinionR) * Math.sin(DR.bearing);
    const rb = shadow(new THREE.Mesh(new RoundedBoxGeometry(M.bracket.t, crankY + 0.18 - B.h, crankZ + 0.5, 3, 0.04), materials.brass));
    rb.position.set(M.bracket.x, B.h + (crankY + 0.18 - B.h) / 2, (crankZ + 0.5) / 2 - 0.28); g.add(rb);
    // left bracket: the arbor only
    const lb = shadow(new THREE.Mesh(new RoundedBoxGeometry(M.bracket.t, Yc + 0.16 - B.h, 0.46, 3, 0.04), materials.brass));
    lb.position.set(-M.bracket.x, B.h + (Yc + 0.16 - B.h) / 2, 0); g.add(lb);
    for (const sx of [1, -1]) g.add(rodX(0.09, 0.03, materials.brassPolished, sx * (M.bracket.x + M.bracket.t / 2 + 0.015), Yc, 0));   // bearing caps
    g.userData.crank = [crankY, crankZ];
    return g;
  }

  /** crank(pos) -> Group on the crank shaft axis: shaft, pinion, arm, wooden knob. userData.setAngle(a) */
  function crank(y, z) {
    const g = new THREE.Group(); g.name = "crank"; g.position.set(0, y, z);
    g.add(rodX(0.04, DR.crankX - G.x + 0.1, materials.steel, (DR.crankX + G.x) / 2 - 0.02, 0, 0));
    const pin = shadow(new THREE.Mesh(gearGeometry(DR.pinion, G.module, G.thickness * 1.4, 0), materials.brassPolished));
    pin.position.x = G.x; pin.rotation.x = DR.bearing + (3 * Math.PI) / 2 - Math.PI / DR.pinion;   // a gap faces the wheel's tooth
    g.add(pin);
    const arm = box(0.05, DR.arm + 0.1, 0.09, materials.brassPolished, DR.crankX + 0.025, DR.arm / 2, 0); g.add(arm);
    g.add(rodX(0.07, 0.07, materials.brassPolished, DR.crankX + 0.025, 0, 0));
    g.add(rodX(DR.knobR, DR.knobLen, materials.knob, DR.crankX + 0.05 + DR.knobLen / 2, DR.arm, 0, 28));
    g.add(rodX(DR.knobR * 0.55, 0.03, materials.brassPolished, DR.crankX + 0.05 + DR.knobLen + 0.012, DR.arm, 0));
    g.userData.setAngle = (a) => { g.rotation.x = a; };
    return g;
  }

  /** governor() -> Group on the worm's vertical axis: shaft, worm thread, hub and two air vanes. userData.setAngle(a) */
  function governor() {
    const x = -G.x, z = gearR + GV.wormR;
    const g = new THREE.Group(); g.name = "governor"; g.position.set(x, 0, z);
    const foot = box(0.26, 0.1, 0.26, materials.brass, 0, M.bedplate.h + 0.05, 0);
    const spin = new THREE.Group(); spin.name = "governor-spin";
    const top = Yc + GV.top;
    const shaft = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, top + 0.1 - M.bedplate.h, 16), materials.steel));
    shaft.position.y = (top + 0.1 + M.bedplate.h) / 2; spin.add(shaft);
    const core = shadow(new THREE.Mesh(new THREE.CylinderGeometry(GV.wormR * 0.72, GV.wormR * 0.72, 0.44, 20), materials.brassPolished));
    core.position.y = Yc; spin.add(core);
    const pitch = Math.PI * G.module, turns = 4.5, pts = [];
    for (let k = 0; k <= turns * 24; k++) {
      const a = (k / 24) * TAU;
      pts.push(new THREE.Vector3(GV.wormR * Math.cos(a), Yc + (a / TAU - turns / 2) * pitch, GV.wormR * Math.sin(a)));
    }
    const thread = shadow(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 48, 0.022, 8, false), materials.brassPolished));
    spin.add(thread);
    const hub = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GV.vane[1] * 0.7, 20), materials.brassPolished));
    hub.position.y = top; spin.add(hub);
    for (const s of [1, -1]) {
      const v = box(GV.vane[0], GV.vane[1], 0.014, materials.brassPolished, s * GV.vaneOffset, top, 0);
      spin.add(v);
    }
    g.add(foot, spin);
    g.userData.setAngle = (a) => { spin.rotation.y = a; };
    return g;
  }

  // ---------------------------------------------------------------- overlay caption plate
  /** caption() -> overlay plate (ivory, brass edge, three pins as an icon); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 24, Hp = Q.h + 28;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), ic = Math.round(Q.h * 0.5);
      const pw = Math.min(W - 16, pad + ic + Math.round(pad * 0.7) + tw + pad), ph = Q.h, oy = 6, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(60,35,10,0.28)"; x.beginPath(); x.roundRect(ox + 2, oy + 8, pw, ph, 18); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 18); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 4; x.beginPath(); x.roundRect(ox + 2, oy + 2, pw - 4, ph - 4, 16); x.stroke();
      // icon: three pins on a staff line, rising
      const cx = ox + pad, cy = oy + ph / 2;
      x.fillStyle = Q.pin;
      for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(cx + 6 + k * (ic / 2.4), cy + (1 - k) * ic * 0.26, 7, 0, TAU); x.fill(); }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + Math.round(pad * 0.7), oy + Math.round(ph / 2) + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * movement(plan) -> { group, cylinder, comb, crank, governor, update(t) } (adds itself to the scene)
   *   update(t): cylinder angle, every tooth, the crank and the governor from the plan — all closed forms of t.
   */
  function movement(plan) {
    const group = new THREE.Group(); group.name = "music-box";
    const fr = frame(); group.add(fr);
    const cyl = cylinder(plan); group.add(cyl);
    const cb = comb(plan); group.add(cb);
    const cr = crank(fr.userData.crank[0], fr.userData.crank[1]); group.add(cr);
    const gv = governor(); group.add(gv);
    stage.scene.add(group);
    const update = (t) => {
      cyl.userData.setAngle(plan.cylAngle(t));
      cb.userData.update(t);
      cr.userData.setAngle(plan.crankAngle(t));
      gv.userData.setAngle(-plan.wormAngle(t));
    };
    update(0);
    return { group, cylinder: cyl, comb: cb, crank: cr, governor: gv, update };
  }

  const props = { wood, cylinder, comb, frame, crank, governor, caption, movement };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: tune, motion: tune, geometry: { toothTop, tipZ, gearR, pinionR },
  };
}
