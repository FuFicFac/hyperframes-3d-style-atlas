// styles/marionette/style.js — "Marionette": a painted wooden string puppet on a toy-theatre stage. The look lives in
// spec.js; WHERE every joint is and WHICH strings are taut lives in strings.js (THREE-free planner shared with SCORE).
// This file turns a pose into pictures: the stage set (plank floor, painted backdrop, pleated curtains), the puppet
// (lacquered blocks, capsules and wooden bead joints placed between the planner's joints), the control bar (spine, hand
// bar, rocking leg bar, tag rail), one live tube per string (straight when taut, sagging when slack), the name tags and
// an overlay caption plate (exact colours). Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { makeCanvas, canvasTexture, woodTexture } from "../../kit/textures.js";
import { liveTube } from "../../kit/paths.js";
import { smoothstep, TAU } from "../../kit/time.js";
import * as rigPlan from "./strings.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const Y = new THREE.Vector3(0, 1, 0);

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const C = spec.palette, PP = spec.puppet, RG = spec.rig, SG = spec.stage, TG = spec.tags, ST = spec.strings;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const M = materials;
  const sh = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = sh(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); return m; };
  const rbox = (w, h, d, r, mat, x = 0, y = 0, z = 0) => mesh(new RoundedBoxGeometry(w, h, d, 4, r), mat, x, y, z);
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  /** put a Y-aligned limb mesh between two joints (its length is fixed by its geometry) */
  const between = (m, p0, p1) => {
    tmpA.set(p0[0], p0[1], p0[2]); tmpB.set(p1[0], p1[1], p1[2]);
    m.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
    tmpB.sub(tmpA).normalize();
    m.quaternion.setFromUnitVectors(Y, tmpB);
  };

  // ---------------------------------------------------------------- the stage set
  function paintBackdrop(x, W, H) {
    const B = SG.backdrop, ppm = W / B.w, X = (m) => W / 2 + m * ppm, Yp = (m) => H - m * ppm;
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.sky); g.addColorStop(0.62, "#d9eef3"); g.addColorStop(0.86, C.skyLow); g.addColorStop(1, C.skyLow);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // soft sun rays fanning up from behind the hills
    x.save(); x.translate(X(0), Yp(0.9));
    for (let k = 0; k < 9; k++) {
      const a0 = -Math.PI + (k * 2 + 0.5) * (Math.PI / 18), a1 = a0 + Math.PI / 18;
      x.fillStyle = "rgba(255,250,225,0.34)";
      x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, W, a0, a1); x.closePath(); x.fill();
    }
    x.restore();
    const cloud = (cx, cy, s) => {
      x.fillStyle = C.cloud;
      for (const [dx, dy, r] of [[-0.42, 0.02, 0.26], [-0.12, 0.16, 0.34], [0.22, 0.1, 0.3], [0.5, 0, 0.22], [0.05, -0.04, 0.3]]) {
        x.beginPath(); x.ellipse(X(cx + dx * s), Yp(cy + dy * s), r * s * ppm, r * s * ppm * 0.8, 0, 0, TAU); x.fill();
      }
      x.fillRect(X(cx - 0.6 * s), Yp(cy + 0.02 * s), 1.25 * s * ppm, 0.2 * s * ppm);
    };
    cloud(-2.55, 2.05, 0.9); cloud(2.5, 1.75, 0.8); cloud(-2.2, 4.75, 1.0); cloud(2.6, 4.3, 0.85);
    const hill = (col, base, amp, f, ph) => {
      x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
      for (let px = 0; px <= W; px += 8) { const m = (px - W / 2) / ppm; x.lineTo(px, Yp(base + amp * Math.sin(m * f + ph) + amp * 0.4 * Math.sin(m * f * 2.3 + ph * 2))); }
      x.lineTo(W, H); x.closePath(); x.fill();
    };
    hill(C.hillFar, 1.02, 0.2, 0.75, 0.6);
    hill(C.hill, 0.58, 0.16, 1.1, 2.2);
  }

  /** stageSet() -> group: plank floor, painted-sky backdrop, two pleated curtains */
  function stageSet() {
    const g = new THREE.Group(); g.name = "toy-theatre";
    const F = SG.floor, depth = F.z1 - F.z0;
    if (!M.floor.map) {
      M.floor.map = woodTexture({ size: 1024, boards: F.boards, seed: F.seed, dark: F.dark, mid: F.mid, light: F.light, seam: F.seam, contrast: F.contrast, grainFreq: F.grainFreq, repeat: [depth / F.tile, F.x / F.tile] });
      M.floor.needsUpdate = true;
    }
    const floorGeo = new THREE.PlaneGeometry(depth, F.x);
    const floor = new THREE.Mesh(floorGeo, M.floor);
    floor.rotation.set(-Math.PI / 2, 0, Math.PI / 2);          // boards run from the back of the stage toward the audience
    floor.position.set(0, 0, (F.z0 + F.z1) / 2); floor.receiveShadow = true; floor.name = "floor";
    g.add(floor);

    const B = SG.backdrop;
    if (!M.backdrop.map) {
      const cv = makeCanvas(B.px[0], B.px[1]);
      paintBackdrop(cv.getContext("2d"), B.px[0], B.px[1]);
      M.backdrop.map = canvasTexture(cv); M.backdrop.needsUpdate = true;
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), M.backdrop);
    back.position.set(0, B.h / 2, B.z); back.receiveShadow = true; back.name = "backdrop";
    g.add(back);

    const Q = SG.curtain;
    for (const sg of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(Q.w, Q.h, Q.pleats * 8, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const u = (pos.getX(i) + Q.w / 2) / Q.w;
        pos.setZ(i, Q.pleat * Math.sin(u * Q.pleats * TAU) + Q.pleat * 0.35 * Math.sin(u * Q.pleats * TAU * 2.1 + 1));
      }
      geo.computeVertexNormals();
      const cur = sh(new THREE.Mesh(geo, M.curtain), true, true);
      cur.position.set(sg * (Q.x0 + Q.w / 2), Q.h / 2, Q.z); cur.name = "curtain";
      g.add(cur);
    }
    return g;
  }

  // ---------------------------------------------------------------- the puppet
  /** puppet() -> group of painted wooden parts; userData.pose(P) places every part from a planner pose */
  function puppet() {
    const g = new THREE.Group(); g.name = "puppet";
    const LR = PP.limbR;
    const capsule = (r, length, mat) => sh(new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, length - 2 * r), 6, 16), mat));
    const bead = (r = LR.joint) => sh(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), M.bead));

    // pelvis
    const pelvis = new THREE.Group();
    pelvis.add(rbox(PP.pelvis.w, PP.pelvis.h, PP.pelvis.d, PP.pelvis.r, M.pelvis));
    pelvis.add(mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 16), M.metal, 0, PP.backHook[0], PP.backHook[1]));
    g.add(pelvis);

    // torso (pivot = waist): body block, chest plate with three buttons, neck and shoulder beads
    const torso = new THREE.Group(); torso.rotation.order = "YXZ";
    const T = PP.torso;
    torso.add(rbox(T.w, T.h, T.d, T.r, M.torso, 0, T.y, 0));
    torso.add(rbox(T.w * 0.62, T.h * 0.5, 0.04, 0.018, M.cream, 0, T.y + 0.04, T.d / 2 + 0.006));
    [[-0.14, C.pelvis], [0, C.head], [0.14, C.thigh]].forEach(([bx, col]) => {
      const b = mesh(new THREE.SphereGeometry(0.05, 16, 12), M.head.clone(), bx, T.y + 0.1, T.d / 2 + 0.03);
      b.material.color.set(col); torso.add(b);
    });
    for (let k = 0; k < 3; k++) torso.add(mesh(new THREE.BoxGeometry(0.3, 0.022, 0.012), M.ink, 0, T.y - 0.03 - k * 0.045, T.d / 2 + 0.03));
    const waistBead = bead(0.12); waistBead.position.y = 0.0; waistBead.scale.set(1.5, 0.7, 1.2); torso.add(waistBead);
    const neckBead = bead(0.1); neckBead.position.y = PP.torsoLen - PP.head.h - 0.05; torso.add(neckBead);
    for (const sg of [-1, 1]) { const s = bead(0.115); s.position.set(sg * PP.shoulder[0], PP.shoulder[1], 0); torso.add(s); }
    g.add(torso);

    // head (pivot = centre): face, bolt ears, screw eye on top
    const head = new THREE.Group(); head.rotation.order = "YXZ";
    const H = PP.head, fz = H.d / 2;
    head.add(rbox(H.w, H.h, H.d, H.r, M.head));
    for (const sg of [-1, 1]) {
      const white = mesh(new THREE.SphereGeometry(0.095, 24, 16), M.eyeWhite, sg * 0.145, 0.055, fz - 0.02); white.scale.z = 0.5; head.add(white);
      const pupil = mesh(new THREE.SphereGeometry(0.048, 16, 12), M.ink, sg * 0.14, 0.05, fz + 0.022); pupil.scale.z = 0.5; head.add(pupil);
      const cheek = mesh(new THREE.CircleGeometry(0.05, 20), M.cheek, sg * 0.215, -0.085, fz + 0.004); cheek.castShadow = false; head.add(cheek);
      const ear = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 20), M.pelvis, sg * (H.w / 2 + 0.03), 0, 0); ear.rotation.z = Math.PI / 2; head.add(ear);
    }
    const smile = mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 24, Math.PI), M.ink, 0, -0.07, fz + 0.004); smile.rotation.z = Math.PI; head.add(smile);
    head.add(mesh(new THREE.TorusGeometry(0.04, 0.013, 8, 16), M.metal, 0, H.h / 2 + 0.03, 0));
    g.add(head);

    // limbs
    const arms = [0, 1].map(() => {
      const a = { upper: capsule(LR.upperArm, PP.upperArm + 0.06, M.upperArm), fore: capsule(LR.foreArm, PP.foreArm, M.foreArm), elbow: bead(0.088), hand: sh(new THREE.Mesh(new THREE.SphereGeometry(LR.hand, 20, 14), M.hand)) };
      g.add(a.upper, a.fore, a.elbow, a.hand);
      return a;
    });
    const legs = [0, 1].map(() => {
      const foot = new THREE.Group(); foot.rotation.order = "YXZ";
      foot.add(rbox(PP.foot.w, PP.foot.h, PP.foot.d, 0.05, M.foot, 0, PP.foot.h / 2, PP.foot.z));
      const l = { thigh: capsule(LR.thigh, PP.thigh + 0.06, M.thigh), shin: capsule(LR.shin, PP.shin, M.shin), knee: bead(0.1), foot };
      g.add(l.thigh, l.shin, l.knee, l.foot);
      return l;
    });

    g.userData.pose = (P) => {
      pelvis.position.set(P.hip[0], P.hip[1], P.hip[2]); pelvis.rotation.y = P.yaw;
      torso.position.set(P.waist[0], P.waist[1], P.waist[2]); torso.rotation.set(P.pitch, P.yaw, 0);
      head.position.set(P.headC[0], P.headC[1], P.headC[2]); head.rotation.set(P.headPitch, P.yaw, 0);
      const fx = Math.sin(P.yaw), fz2 = Math.cos(P.yaw);
      P.arms.forEach((A, i) => {
        const a = arms[i];
        between(a.upper, A.S, A.E); between(a.fore, A.E, A.W);
        a.elbow.position.set(A.E[0], A.E[1], A.E[2]);
        a.hand.position.set(A.W[0], A.W[1], A.W[2]);
      });
      P.legs.forEach((Lg, i) => {
        const l = legs[i];
        between(l.thigh, Lg.H, Lg.K); between(l.shin, Lg.K, Lg.F);
        l.knee.position.set(Lg.K[0], Lg.K[1], Lg.K[2]);
        // foot: flat on the floor; in the air it follows the shin with the toe drooping a little
        const dx = Lg.F[0] - Lg.K[0], dy = Lg.F[1] - Lg.K[1], dz = Lg.F[2] - Lg.K[2];
        const along = Math.atan2(dx * fx + dz * fz2, -dy);
        const up = smoothstep(0.005, 0.07, Lg.F[1]);
        l.foot.position.set(Lg.F[0], Lg.F[1], Lg.F[2]);
        l.foot.rotation.set((-along + 0.3) * up, P.yaw, 0);
      });
    };
    return g;
  }

  // ---------------------------------------------------------------- the control bar
  /** controlBar() -> group (origin = the grip at the back eyelet, rotation order YZX); userData.pose(P.bar) */
  function controlBar() {
    const g = new THREE.Group(); g.name = "control-bar"; g.rotation.order = "YZX";
    if (!M.barWood.map) {
      const W = SG.barWood;
      M.barWood.map = woodTexture({ size: 512, boards: W.boards, seed: W.seed, dark: W.dark, mid: W.mid, light: W.light, seam: W.seam, contrast: W.contrast, grainFreq: W.grainFreq });
      M.barWood.needsUpdate = true;
    }
    const th = 0.1, y0 = th / 2;
    const S = RG.spine, HB = RG.handBar, LB = RG.legBar, TR = RG.tagRail;
    g.add(mesh(new THREE.BoxGeometry(0.15, th, S.z1 - S.z0), M.barWood, 0, y0, (S.z0 + S.z1) / 2));
    g.add(mesh(new THREE.BoxGeometry(HB.half * 2, th, 0.15), M.barWood, 0, y0 + 0.004, HB.z));
    const rail = mesh(new THREE.CylinderGeometry(0.05, 0.05, TR.half * 2, 16), M.barWood, 0, y0, TR.z); rail.rotation.z = Math.PI / 2; g.add(rail);
    const knob = (x, y, z, r, mat) => g.add(mesh(new THREE.SphereGeometry(r, 18, 12), mat, x, y, z));
    for (const sg of [-1, 1]) { knob(sg * HB.half, y0, HB.z, 0.1, M.pelvis); knob(sg * TR.half, y0, TR.z, 0.085, M.thigh); }
    // the grip: a turned handle standing on the back of the spine
    g.add(mesh(new THREE.CylinderGeometry(0.065, 0.08, 0.42, 18), M.barDark, 0, th + 0.21, 0));
    knob(0, th + 0.46, 0, 0.11, M.barDark);
    // eyelets under the bar
    const eyelet = (x, z, parent = g, y = -0.01) => { const e = mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 14), M.metal, x, y, z); e.rotation.y = Math.PI / 2; parent.add(e); };
    eyelet(0, 0); eyelet(0, RG.headZ); eyelet(-HB.eyelet, HB.z); eyelet(HB.eyelet, HB.z);
    for (const q of TG.list) eyelet(q.x, TR.z, g, -0.03);
    // the leg bar rocks on a peg on top of the spine
    const leg = new THREE.Group(); leg.position.set(0, LB.y, LB.z);
    leg.add(mesh(new THREE.BoxGeometry(LB.half * 2, 0.085, 0.13), M.barWood, 0, 0.045, 0));
    for (const sg of [-1, 1]) { leg.add(mesh(new THREE.SphereGeometry(0.08, 16, 12), M.foreArm, sg * LB.half, 0.045, 0)); eyelet(sg * LB.eyelet, 0, leg, -0.005); }
    const peg = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.17, 14), M.barDark, 0, 0.045, 0); peg.rotation.x = Math.PI / 2; leg.add(peg);
    g.add(leg);
    g.userData.legBar = leg;
    g.userData.pose = (B) => {
      g.position.set(B.pos[0], B.pos[1], B.pos[2]);
      g.rotation.set(B.pitch, B.yaw, B.roll);
      leg.rotation.z = B.rock;
    };
    return g;
  }

  // ---------------------------------------------------------------- strings: one live tube each
  /** stringSet(plan) -> group; userData.update(P): taut strings are straight lines, slack ones sag */
  function stringSet(plan) {
    const g = new THREE.Group(); g.name = "strings";
    const tubes = ST.list.map((s) => {
      const mat = M.string.clone(); mat.color.set(s.color); mat.name = `string-${s.id}`;
      const tube = liveTube(ST.points, ST.radial, ST.radius, mat);
      tube.receiveShadow = false; tube.name = `string-${s.id}`;
      g.add(tube);
      return tube;
    });
    const strands = TG.list.map((q) => {
      const mat = M.string.clone(); mat.color.set(q.color);
      const tube = liveTube(2, ST.radial, ST.radius * 0.9, mat);
      tube.receiveShadow = false; tube.name = `strand-${q.id}`;
      g.add(tube);
      return tube;
    });
    g.userData.update = (P) => {
      P.strings.forEach((s, i) => tubes[i].userData.set(plan.stringPoints(s)));
      P.tags.forEach((q, i) => {
        strands[i].visible = q.scale > 0.01;
        strands[i].userData.set([q.eyelet, q.scale > 0.01 ? q.top : [q.eyelet[0], q.eyelet[1] - 0.01, q.eyelet[2]]]);
      });
    };
    return g;
  }

  // ---------------------------------------------------------------- name tags
  function tagTexture(q) {
    const W = 1024, H = Math.round((W * TG.h) / TG.w);
    const cv = makeCanvas(W, H), x = cv.getContext("2d");
    x.fillStyle = q.color; x.fillRect(0, 0, W, H);
    x.strokeStyle = TG.ink; x.lineWidth = 12; x.beginPath(); x.roundRect(22, 22, W - 44, H - 44, 30); x.stroke();
    let px = Math.round(H * 0.62);
    x.font = `${TG.weight} ${px}px ${TG.font}`;
    const maxW = W * 0.8, tw = x.measureText(q.text).width;
    if (tw > maxW) { px = Math.floor((px * maxW) / tw); x.font = `${TG.weight} ${px}px ${TG.font}`; }
    x.fillStyle = TG.ink; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(q.text, W / 2, H / 2 + px * 0.04);
    return canvasTexture(cv);
  }
  /** tagSet() -> group of painted name tags (pivot = the hole at the top); userData.update(P) */
  function tagSet() {
    const g = new THREE.Group(); g.name = "tags";
    const list = TG.list.map((q) => {
      const tag = new THREE.Group(); tag.name = `tag-${q.id}`;
      const body = M.tag.clone(); body.color.set(q.color);
      const face = M.tag.clone(); face.map = tagTexture(q);
      const top = 0.05;
      tag.add(rbox(TG.w, TG.h, TG.t, 0.02, body, 0, -top - TG.h / 2, 0));
      const f = mesh(new THREE.PlaneGeometry(TG.w - 0.02, TG.h - 0.02), face, 0, -top - TG.h / 2, TG.t / 2 + 0.002); f.castShadow = false; tag.add(f);
      tag.add(mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 14), M.metal, 0, -0.02, 0));
      tag.visible = false;
      g.add(tag);
      return tag;
    });
    g.userData.update = (P) => {
      P.tags.forEach((q, i) => {
        const tag = list[i];
        tag.visible = q.scale > 0.01;
        tag.position.set(q.top[0], q.top[1], q.top[2]);
        tag.rotation.z = q.angle;
        const s = Math.max(0.001, q.scale) * (1 + 0.1 * smoothstep(0, 0.3, q.pull));
        tag.scale.set(s, s, s);
      });
    };
    return g;
  }

  // ---------------------------------------------------------------- overlay caption plate
  /** caption() -> overlay plate (cream, red edge, a little control-bar icon); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 24, Hp = Q.h + 28;
    const m = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), ic = Math.round(Q.h * 0.52), gap = Math.round(pad * 0.7);
      const pw = Math.min(W - 16, pad + ic + gap + tw + pad), ph = Q.h, oy = 6, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(40,20,10,0.3)"; x.beginPath(); x.roundRect(ox + 2, oy + 8, pw, ph, 20); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 20); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 5; x.beginPath(); x.roundRect(ox + 3, oy + 3, pw - 6, ph - 6, 17); x.stroke();
      // icon: a control bar with three strings
      const cx = ox + pad + ic / 2, cy = oy + ph / 2;
      x.strokeStyle = Q.ink; x.lineWidth = 6; x.lineCap = "round";
      x.beginPath(); x.moveTo(cx - ic / 2, cy - ic * 0.34); x.lineTo(cx + ic / 2, cy - ic * 0.34); x.stroke();
      x.lineWidth = 3.5; x.strokeStyle = Q.dot;
      for (const k of [-1, 0, 1]) { x.beginPath(); x.moveTo(cx + k * ic * 0.36, cy - ic * 0.34); x.lineTo(cx + k * ic * 0.36, cy + ic * (0.42 - Math.abs(k) * 0.14)); x.stroke(); }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + gap, oy + Math.round(ph / 2) + 3);
    }, { upload: true, willReadFrequently: true });
    m.userData.place(Q.x - Wp / 2, Q.y);
    m.userData.show = (text, a) => { m.userData.set({ text }); m.userData.opacity(a); };
    return m;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * marionette(plan) -> { group, puppet, bar, strings, tags, update(t), pose } (adds itself to the scene)
   *   update(t): one planner pose places the bar, every puppet part, every string and every tag.
   */
  function marionette(plan) {
    const group = new THREE.Group(); group.name = "marionette";
    const pp = puppet(), bar = controlBar(), strs = stringSet(plan), tags = tagSet();
    group.add(pp, bar, strs, tags);
    stage.scene.add(group);
    const update = (t) => {
      const P = plan.pose(t);
      bar.userData.pose(P.bar);
      pp.userData.pose(P);
      strs.userData.update(P);
      tags.userData.update(P);
      return P;
    };
    return { group, puppet: pp, bar, strings: strs, tags, update };
  }

  const props = { stageSet, puppet, controlBar, stringSet, tagSet, caption, marionette };
  const factories = {};
  return {
    spec, palette: spec.palette, materials, lights, post, textStyle, camera: spec.camera,
    props, factories, sfx: spec.sfx,
    plan: rigPlan,          // the THREE-free planner (createPlan, rigVoices, stringPoints, ...)
  };
}
