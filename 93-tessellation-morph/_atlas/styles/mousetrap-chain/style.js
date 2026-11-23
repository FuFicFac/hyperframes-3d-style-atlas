// styles/mousetrap-chain/style.js — "Mousetrap Chain": a sports-hall floor of set spring traps loaded with ping-pong
// balls; one ball starts a doubling chain reaction. The look lives in spec.js; the reaction lives in cascade.js
// (THREE-free planner shared with SCORE, beats and camera). This file turns a plan into pictures: instanced boards,
// pedals, springs and paddle hammers posed from plan.trapPose(i, t), one InstancedMesh of balls posed from
// plan.ballAt(i, t), the court floor, and two overlay pieces (caption chip + the generation dot chart).
// Props never animate themselves: the scene calls cascade.update(t) from renderAt; every pose is a pure function of t.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import * as cascade from "./cascade.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const _m = new THREE.Matrix4(), _h = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _Y = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, TR = spec.trap, BL = spec.ball;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // ---------------------------------------------------------------- floor + painted court lines
  /** floor({ size = 90 }) -> Group: blue sports floor with a white boundary box round the trap field and a yellow outer box. */
  function floor(o = {}) {
    const size = o.size ?? 90;
    const root = new THREE.Group();
    root.name = "floor";
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), materials.floor);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    root.add(ground);
    const box = cascade.gridBox(spec, 0);
    const K = spec.court;
    const ring = (margin, mat, y) => {
      const x0 = box.min[0] - margin, x1 = box.max[0] + margin, z0 = box.min[2] - margin, z1 = box.max[2] + margin, w = K.width;
      const bars = [[(x0 + x1) / 2, z0, x1 - x0 + w, w], [(x0 + x1) / 2, z1, x1 - x0 + w, w], [x0, (z0 + z1) / 2, w, z1 - z0 + w], [x1, (z0 + z1) / 2, w, z1 - z0 + w]];
      for (const [x, z, lx, lz] of bars) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(lx, lz), mat);
        m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true;
        root.add(m);
      }
    };
    ring(K.margin, materials.line, 0.003);
    ring(K.outer, materials.lineAccent, 0.002);
    return root;
  }

  // ---------------------------------------------------------------- traps (4 instanced parts sharing one pose)
  const boardGeo = (() => { const g = new RoundedBoxGeometry(TR.w, TR.h, TR.l, 2, TR.radius); g.translate(0, TR.h / 2, 0); return g; })();
  const pedalGeo = (() => { const g = new RoundedBoxGeometry(TR.pedalW, TR.pedalT, TR.pedalL, 2, TR.pedalT * 0.45); g.translate(0, TR.h + TR.pedalT / 2, TR.pedalZ); return g; })();
  const springGeo = (() => { const g = new THREE.CylinderGeometry(TR.springR, TR.springR, TR.springL, 16); g.rotateZ(Math.PI / 2); g.translate(0, TR.h + TR.pivotY, 0); return g; })();
  // hammer: pivot at the origin, lying along -z when set. A steel U wire with a red paddle plate inside it.
  const wireGeo = (() => {
    const w = TR.wire, L = TR.paddleL + 0.03, hw = TR.paddleW / 2 + w * 0.6;
    const arm = (x) => { const g = new THREE.BoxGeometry(w, w, L); g.translate(x, 0, -L / 2); return g; };
    const bar = new THREE.BoxGeometry(hw * 2 + w, w, w); bar.translate(0, 0, -L);
    return mergeGeometries([arm(-hw), arm(hw), bar]);
  })();
  const paddleGeo = (() => { const g = new RoundedBoxGeometry(TR.paddleW, TR.paddleT, TR.paddleL, 2, TR.paddleT * 0.45); g.translate(0, 0, -TR.paddleL / 2 - 0.022); return g; })();

  /** traps(plan) -> Group of instanced boards / pedals / springs / hammers; userData.update(t) poses them from the plan. */
  function traps(plan) {
    const n = plan.traps.length;
    const root = new THREE.Group();
    root.name = "traps";
    const mk = (geo, mat, cast = true) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false; root.add(m); return m; };
    const board = mk(boardGeo, materials.wood), pedal = mk(pedalGeo, materials.pedal, false), spring = mk(springGeo, materials.steel, false);
    const wire = mk(wireGeo, materials.steel, false), paddle = mk(paddleGeo, materials.paddle);
    plan.traps.forEach((t, i) => board.setColorAt(i, _c.set(TR.woods[(t.c * 7 + t.r * 13 + ((t.c * t.r) % 3)) % TR.woods.length])));
    board.instanceColor.needsUpdate = true;
    const pose = {};
    root.userData.update = (t) => {
      for (let i = 0; i < n; i++) {
        const T = plan.traps[i];
        plan.trapPose(i, t, pose);
        _q.setFromAxisAngle(_Y, pose.yaw);
        _m.compose(_p.set(T.x + pose.dx, pose.dy, T.z + pose.dz), _q, _s);
        board.setMatrixAt(i, _m); pedal.setMatrixAt(i, _m); spring.setMatrixAt(i, _m);
        _h.makeRotationX(pose.angle).setPosition(0, TR.h + TR.pivotY, 0);
        _h.premultiply(_m);
        wire.setMatrixAt(i, _h); paddle.setMatrixAt(i, _h);
      }
      for (const m of [board, pedal, spring, wire, paddle]) m.instanceMatrix.needsUpdate = true;
    };
    root.userData.update(0);
    return root;
  }

  // ---------------------------------------------------------------- balls
  /** balls(plan) -> InstancedMesh of every ball (two per trap + the one that starts it); userData.update(t). */
  function balls(plan) {
    const n = plan.balls.length;
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(BL.r, BL.segments, Math.round(BL.segments * 0.7)), materials.ball, n);
    mesh.name = "balls";
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    plan.balls.forEach((b, i) => mesh.setColorAt(i, _c.set(b.trap < 0 ? P.first : P.ball)));
    mesh.instanceColor.needsUpdate = true;
    const o = {};
    _q.identity();
    mesh.userData.update = (t) => {
      for (let i = 0; i < n; i++) {
        plan.ballAt(i, t, o);
        const k = o.on ? 1 : 0;
        _m.makeScale(k, k, k).setPosition(o.x, o.y, o.z);
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    mesh.userData.update(0);
    return mesh;
  }

  // ---------------------------------------------------------------- overlay: caption chip
  /** caption() -> overlay chip; userData.show(text, alpha). One per scene, fixed position (spec.caption). */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1100, Hp = Q.h + 26;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.3}px ${Q.font}`;
      const tw = x.measureText(st.text).width;
      const dotR = Q.h * 0.2, pad = Q.cap * 0.8;
      const pw = Math.min(W - 16, pad + dotR * 2 + pad * 0.7 + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(10,30,60,0.28)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, ph / 2); x.fill();
      x.fillStyle = Q.paper; x.beginPath(); x.roundRect(ox, oy, pw, ph, ph / 2); x.fill();
      x.fillStyle = Q.dot; x.beginPath(); x.arc(ox + pad + dotR, oy + ph / 2, dotR, 0, Math.PI * 2); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + dotR * 2 + pad * 0.7, oy + ph / 2 + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- overlay: the generation dot chart
  /**
   * genChart(plan) -> overlay panel: one cluster of dots per generation (1, 2, 4, 8 ... stacked `rows` high), a dot
   * lights when its trap snaps. No numbers: the doubling is the shape. userData.show(t, alpha).
   */
  function genChart(plan, o = {}) {
    const Q = { ...spec.chart, ...o };
    const step = Q.dot + Q.gap;
    const cols = plan.counts.map((c) => Math.ceil(c / Q.rows));
    const used = plan.counts.map((c, k) => k).filter((k) => plan.counts[k] > 0);
    const Wp = Math.ceil(Q.pad * 2 + used.reduce((a, k) => a + cols[k] * step - Q.gap, 0) + (used.length - 1) * Q.colGap) + 8;
    const Hp = Math.ceil(Q.pad * 2 + Q.rows * step - Q.gap + 12) + 8;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      x.fillStyle = Q.panel; x.beginPath(); x.roundRect(2, 2, W - 8, H - 8, 22); x.fill();
      const y0 = H - 6 - Q.pad;                          // baseline
      let cx = 2 + Q.pad;
      for (const k of used) {
        const wCol = cols[k] * step - Q.gap;
        x.fillStyle = Q.base; x.fillRect(cx, y0 - 3, wCol, 3);
        const lit = st.counts[k] ?? 0;
        for (let d = 0; d < lit; d++) {
          const col = Math.floor(d / Q.rows), row = d % Q.rows;
          x.fillStyle = k === 1 ? Q.first : Q.lit;
          x.beginPath(); x.arc(cx + col * step + Q.dot / 2, y0 - 10 - row * step - Q.dot / 2, Q.dot / 2, 0, Math.PI * 2); x.fill();
        }
        cx += wCol + Q.colGap;
      }
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(stage.width - Q.right - Wp + 6, Q.y);
    mesh.userData.show = (t, a = 1) => { mesh.userData.set({ counts: plan.countsAt(t) }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /** cascade(plan, { floor = true }) -> { group, floor, traps, balls, update(t) } added to the scene. */
  function cascadeProps(plan, o = {}) {
    const group = new THREE.Group();
    group.name = "cascade";
    const fl = o.floor === false ? null : floor();
    if (fl) group.add(fl);
    const tr = traps(plan), bl = balls(plan);
    group.add(tr, bl);
    stage.scene.add(group);
    return { group, floor: fl, traps: tr, balls: bl, update(t) { tr.userData.update(t); bl.userData.update(t); } };
  }

  const props = { floor, traps, balls, caption, genChart, cascade: cascadeProps };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: cascade, motion: cascade,
  };
}
