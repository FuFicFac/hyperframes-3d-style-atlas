// styles/pendulum-wave/style.js — "Pendulum Wave": a row of big rainbow balls on V-strings under a curved wooden beam,
// on a bright bench. The look lives in spec.js; WHERE every ball is, WHEN it crosses the centre and WHAT a freeze-frame
// holds lives in wave.js (THREE-free planner shared with SCORE). This file turns a plan into pictures: bench + lamps,
// beam + A-frames + brass hangers, ONE InstancedMesh each for balls, strings, trail ghosts and lamps, the release
// plank, an overlay caption plate and the overlay fingerprint cards. Props never animate themselves: the scene calls
// update(t), and every update assigns from t (no accumulation).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { createGround } from "../../kit/builders.js";
import { getOverlay, pinToScreen, projectToScreen, screenCanvas } from "../../kit/overlay.js";
import { woodTexture } from "../../kit/textures.js";
import { clamp, smoothstep, TAU } from "../../kit/time.js";
import * as wave from "./wave.js";
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
  const Y = new THREE.Vector3(0, 1, 0);
  const ballColors = P.balls.map((h) => new THREE.Color(h));
  const colorOf = (k) => ballColors[k % ballColors.length];

  // wood: one texture for the beam (shape UVs are metres), a quarter-turned copy for legs and plank (grain along the length)
  const W = spec.wood;
  const woodOpts = { size: 512, boards: W.boards, seed: W.seed, dark: W.dark, mid: W.mid, light: W.light, seam: W.seam, contrast: W.contrast, grainFreq: W.grainFreq };
  materials.wood.map = woodTexture({ ...woodOpts, repeat: [W.perMetre, W.perMetre] });
  materials.wood.needsUpdate = true;
  const legMat = materials.wood.clone();
  legMat.map = woodTexture({ ...woodOpts, seed: W.seed + 1, repeat: [1.5, 0.5] });
  legMat.map.center.set(0.5, 0.5); legMat.map.rotation = Math.PI / 2;
  legMat.name = "woodLeg";
  materials.woodLeg = legMat;

  /** a square timber from a to b */
  function timber(a, b, w, d, mat) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), dir = vb.clone().sub(va), len = dir.length();
    const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, len, d), mat));
    m.position.copy(va).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(Y, dir.normalize());
    return m;
  }

  // ---------------------------------------------------------------- bench
  /** bench(plan?) -> Group: the bright bench, the plank's slot and (with a plan) one lamp per pendulum. userData.update(t) */
  function bench(plan) {
    const g = new THREE.Group(); g.name = "bench";
    g.add(createGround({ size: 140, material: materials.bench }));
    const rowLen = R.spacing * (R.count - 1);
    const zb = R.reach - R.ballRadius - R.plank.thickness / 2 - 0.004;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(rowLen + 2 * R.plank.over + 0.1, 0.004, R.plank.thickness + 0.05), materials.slot);
    slot.position.set(0, 0.002, zb); slot.receiveShadow = true; g.add(slot);
    g.userData.update = () => {};
    if (plan) {
      const LM = R.lamp, benchCol = new THREE.Color(P.bench);
      const geo = new THREE.CircleGeometry(LM.radius, 36); geo.rotateX(-Math.PI / 2);
      const lamps = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: "#ffffff" }), plan.n);
      lamps.name = "lamps"; lamps.frustumCulled = false;
      const m4 = new THREE.Matrix4(), c = new THREE.Color();
      const dim = plan.balls.map((b) => colorOf(b.k).clone().lerp(benchCol, LM.dim));
      plan.balls.forEach((b) => { lamps.setMatrixAt(b.k, m4.makeTranslation(b.x, LM.y, 0)); lamps.setColorAt(b.k, dim[b.k]); });
      lamps.instanceMatrix.needsUpdate = true;
      g.add(lamps);
      g.userData.update = (t) => {
        for (const b of plan.balls) {
          const glow = Math.max(Math.exp(-plan.sinceCrossing(b.k, t) / LM.decay), plan.unison(t));   // 0 before the first crossing
          lamps.setColorAt(b.k, c.copy(dim[b.k]).lerp(colorOf(b.k), glow));
        }
        lamps.instanceColor.needsUpdate = true;
      };
      g.userData.update(0);
    }
    return g;
  }

  // ---------------------------------------------------------------- frame: curved beam, two A-frames, brass hangers
  /** frame(plan) -> Group (static). The beam's underside follows the string lengths, so it IS the graph of period^2. */
  function frame(plan) {
    const g = new THREE.Group(); g.name = "frame";
    const B = R.beam, A = R.aframe, H = R.hanger;
    const half = (R.spacing * (plan.n - 1)) / 2 + B.over;
    const s = new THREE.Shape(), N = 64;
    for (let i = 0; i <= N; i++) { const x = -half + (2 * half * i) / N, y = plan.beamY(x) + H.drop; if (i) s.lineTo(x, y); else s.moveTo(x, y); }
    for (let i = N; i >= 0; i--) { const x = -half + (2 * half * i) / N; s.lineTo(x, plan.beamY(x) + H.drop + B.height); }
    s.closePath();
    const beamGeo = new THREE.ExtrudeGeometry(s, { depth: B.depth, bevelEnabled: false });
    beamGeo.translate(0, 0, -B.depth / 2);
    g.add(shadow(new THREE.Mesh(beamGeo, materials.wood)));
    for (const [sx, spread] of [[-1, A.spreadTall], [1, A.spreadShort]]) {
      const x = sx * (half - 0.08), top = plan.beamY(x) + H.drop + B.height * 0.6;
      for (const sz of [-1, 1]) g.add(timber([x, top, 0], [x, 0, sz * spread], A.leg, A.leg, legMat));
      g.add(timber([x, A.foot / 2, -spread - 0.12], [x, A.foot / 2, spread + 0.12], A.leg * 1.25, A.foot, legMat));
    }
    // hangers: a rod down from the beam and a level bar that carries the two strings
    const rodGeo = new THREE.CylinderGeometry(H.rod, H.rod, 1, 10), barGeo = new THREE.CylinderGeometry(H.bar, H.bar, 2 * R.vHalf + 0.04, 10);
    barGeo.rotateZ(Math.PI / 2);
    const rods = shadow(new THREE.InstancedMesh(rodGeo, materials.brass, plan.n), true, false);
    const bars = shadow(new THREE.InstancedMesh(barGeo, materials.brass, plan.n), true, false);
    rods.frustumCulled = bars.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    plan.balls.forEach((b) => {
      const len = H.drop + 0.03;
      rods.setMatrixAt(b.k, m4.compose(v.set(b.x, b.pivotY + len / 2, 0), q, sc.set(1, len, 1)));
      bars.setMatrixAt(b.k, m4.makeTranslation(b.x, b.pivotY, 0));
    });
    g.add(rods, bars);
    return g;
  }

  // ---------------------------------------------------------------- pendulums: balls, V-strings, trail ghosts
  /** pendulums(plan) -> Group. userData.update(t): every ball, both of its strings and its trail ghosts from the plan. */
  function pendulums(plan) {
    const g = new THREE.Group(); g.name = "pendulums";
    const n = plan.n, TR = R.trail, J = TR.ghosts;
    const balls = shadow(new THREE.InstancedMesh(new THREE.SphereGeometry(R.ballRadius, 48, 32), materials.ball, n));
    const strings = shadow(new THREE.InstancedMesh(new THREE.CylinderGeometry(R.stringRadius, R.stringRadius, 1, 6), materials.string, 2 * n), false, false);
    const ghostMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: TR.opacity, depthWrite: false });
    const ghosts = new THREE.InstancedMesh(new THREE.SphereGeometry(R.ballRadius, 20, 14), ghostMat, n * J);
    balls.name = "balls"; strings.name = "strings"; ghosts.name = "trail"; ghosts.renderOrder = 2;
    balls.frustumCulled = strings.frustumCulled = ghosts.frustumCulled = false;
    const white = new THREE.Color("#ffffff");
    for (const b of plan.balls) {
      balls.setColorAt(b.k, colorOf(b.k));
      const gc = colorOf(b.k).clone().lerp(white, TR.lighten);
      for (let j = 0; j < J; j++) ghosts.setColorAt(b.k * J + j, gc);
    }
    g.add(balls, strings, ghosts);
    const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), q = new THREE.Quaternion(), p = new THREE.Vector3(), a = new THREE.Vector3(), d = new THREE.Vector3(), sc = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    g.userData.update = (t) => {
      const rate = plan.rate(t), live = clamp(rate * 4, 0, 1);
      for (const b of plan.balls) {
        const c = plan.pos(b.k, t);
        p.set(c[0], c[1], c[2]);
        balls.setMatrixAt(b.k, m4.compose(p, q0, one));
        for (const s of [-1, 1]) {
          a.set(b.x + s * R.vHalf, b.pivotY, 0);
          d.copy(p).sub(a);
          const len = d.length();
          q.setFromUnitVectors(Y, d.multiplyScalar(1 / len));
          strings.setMatrixAt(b.k * 2 + (s > 0 ? 1 : 0), m4.compose(a.addScaledVector(d, len / 2), q, sc.set(1, len, 1)));
        }
        for (let j = 0; j < J; j++) {
          // a ghost still overlapping its ball (slow swing near a turn) would read as a pale spot on it: shrink it away
          const gp = plan.ghost(b.k, t, j + 1), sep = Math.hypot(gp[0] - c[0], gp[1] - c[1], gp[2] - c[2]);
          const k = live * Math.max(0, 1 - (j + 1) * TR.shrink) * smoothstep(1.0 * R.ballRadius, 1.8 * R.ballRadius, sep);
          ghosts.setMatrixAt(b.k * J + j, m4.compose(p.set(gp[0], gp[1], gp[2]), q0, sc.set(k, k, k)));
        }
      }
      ghosts.visible = live > 0.001;
      balls.instanceMatrix.needsUpdate = strings.instanceMatrix.needsUpdate = ghosts.instanceMatrix.needsUpdate = true;
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- the plank that releases and catches
  /** plank(plan) -> Mesh: a board standing behind the displaced balls; it drops into the bench slot. userData.update(t) */
  function plank(plan) {
    const K = R.plank, len = R.spacing * (plan.n - 1) + 2 * K.over;
    const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(len, K.height, K.thickness), materials.plank));
    m.name = "plank";
    const z = R.reach - R.ballRadius - K.thickness / 2 - 0.004;
    m.userData.update = (t) => {
      const u = plan.plankDrop(t);
      m.position.set(0, K.y0 + K.height / 2 - K.drop * u, z);
      m.visible = u < 0.999;
    };
    m.userData.update(0);
    return m;
  }

  // ---------------------------------------------------------------- overlay caption plate
  /** caption() -> overlay plate (white, ink edge, three rainbow dots as an icon); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 24, Hp = Q.h + 28;
    const dots = [P.balls[0], P.balls[6], P.balls[11]];
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), ic = Math.round(Q.h * 0.62);
      const pw = Math.min(Wc - 16, pad + ic + Math.round(pad * 0.6) + tw + pad), ph = Q.h, oy = 6, ox = Math.round((Wc - pw) / 2);
      x.fillStyle = "rgba(28,36,48,0.2)"; x.beginPath(); x.roundRect(ox + 2, oy + 8, pw, ph, 22); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 22); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 4; x.beginPath(); x.roundRect(ox + 2, oy + 2, pw - 4, ph - 4, 20); x.stroke();
      const cx = ox + pad, cy = oy + ph / 2;
      dots.forEach((c, k) => { x.fillStyle = c; x.beginPath(); x.arc(cx + 8 + k * (ic / 2.5), cy + [-0.2, 0.22, -0.05][k] * ic, 10, 0, TAU); x.fill(); });
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + Math.round(pad * 0.6), oy + Math.round(ph / 2) + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- overlay fingerprint cards + camera flash
  /**
   * cards(plan) -> { update(t, { titles: [[..per card]], alpha = 1 }), slots }
   *   One card per planned freeze. At the freeze: a white flash, the card fades in, and one dot per ball flies from
   *   the ball's place on screen (projected through stage.camera — call after the camera rig) down to its slot on the
   *   card: x = index, y = the frozen displacement. Then a stem joins each dot to the centre rule.
   */
  function cards(plan) {
    const C = spec.card, n = plan.n, ov = getOverlay(stage);
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(4 * ov.aspect, 4), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    flash.renderOrder = 5; flash.visible = false; ov.add(flash);
    const dotGeo = new THREE.CircleGeometry(1, 32);
    const ink = new THREE.Color(C.edge);
    const up = new THREE.Vector3(), wp = new THREE.Vector3();
    const list = plan.freezes.map((f, i) => {
      const fp = plan.fingerprint(i);
      const cardX = i % 2 === 0 ? C.margin : stage.width - C.margin - C.w, cardY = stage.height - C.margin - C.h;
      const slot = (k) => [cardX + C.padX + (k * (C.w - 2 * C.padX)) / (n - 1), cardY + C.midY + fp[k] * C.swing];
      const plate = screenCanvas(stage, C.w + 16, C.h + 20, (x, Wc, Hc, st) => {
        x.fillStyle = "rgba(28,36,48,0.2)"; x.beginPath(); x.roundRect(8, 14, C.w, C.h, C.radius); x.fill();
        x.fillStyle = C.plate; x.beginPath(); x.roundRect(6, 4, C.w, C.h, C.radius); x.fill();
        x.strokeStyle = C.edge; x.lineWidth = 4; x.beginPath(); x.roundRect(8, 6, C.w - 4, C.h - 4, C.radius - 2); x.stroke();
        x.fillStyle = C.ink; x.font = `${C.weight} ${C.cap}px ${C.font}`; x.textBaseline = "middle"; x.textAlign = "left";
        x.fillText(st.title ?? "", 6 + 30, 4 + 44);
        x.strokeStyle = C.rule; x.lineWidth = 3; x.setLineDash([10, 8]);
        x.beginPath(); x.moveTo(6 + C.padX - 26, 4 + C.midY); x.lineTo(6 + C.w - C.padX + 26, 4 + C.midY); x.stroke();
        x.setLineDash([]);
        if (st.stems) {
          x.strokeStyle = C.stem; x.lineWidth = 5; x.lineCap = "round";
          for (let k = 0; k < n; k++) { const sx = 6 + C.padX + (k * (C.w - 2 * C.padX)) / (n - 1); x.beginPath(); x.moveTo(sx, 4 + C.midY); x.lineTo(sx, 4 + C.midY + fp[k] * C.swing); x.stroke(); }
        }
      }, { upload: true, willReadFrequently: true });
      plate.userData.place(cardX - 6, cardY - 4);
      const dots = plan.balls.map((b) => {
        const ring = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: ink, transparent: true, depthTest: false, depthWrite: false }));
        const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: colorOf(b.k), transparent: true, depthTest: false, depthWrite: false }));
        ring.renderOrder = 11; dot.renderOrder = 12; ring.visible = dot.visible = false;
        ov.add(ring); ov.add(dot);
        return { ring, dot };
      });
      return { f, fp, plate, dots, slot, landed: f.stop + 0.1 + C.fly + (n - 1) * C.stagger };
    });
    const ndc = (px, py) => [(px / stage.width) * 2 - 1, 1 - (py / stage.height) * 2];
    function update(t, o = {}) {
      const alpha = o.alpha ?? 1;
      let fl = 0;
      for (const cd of list) {
        const { f, plate, dots } = cd, i = f.i;
        if (t >= f.stop) fl = Math.max(fl, C.flashPeak * (1 - smoothstep(0, C.flash, t - f.stop)));
        const a = smoothstep(f.stop + 0.02, f.stop + 0.3, t) * alpha;
        plate.userData.set({ title: o.titles?.[i] ?? "", stems: t >= cd.landed });
        plate.userData.opacity(a);
        for (const b of plan.balls) {
          const { ring, dot } = dots[b.k];
          const start = f.stop + 0.1 + b.k * C.stagger;
          const on = t >= start && alpha > 0.003;
          ring.visible = dot.visible = on;
          if (!on) continue;
          const u0 = clamp((t - start) / C.fly, 0, 1), u = u0 < 0.5 ? 4 * u0 * u0 * u0 : 1 - (-2 * u0 + 2) ** 3 / 2;
          const w = plan.posAtTau(b.k, f.tau);
          const s0 = projectToScreen(stage, w);                                   // refreshes the camera matrices
          up.setFromMatrixColumn(stage.camera.matrixWorld, 1);
          const s1 = projectToScreen(stage, wp.set(w[0], w[1], w[2]).addScaledVector(up, R.ballRadius));
          const r0 = (Math.abs(s1.y - s0.y) / 2) * 0.9, r1 = C.dot / stage.height;   // radius as a fraction of the frame height
          const [ex, ey] = ndc(...cd.slot(b.k));
          const x = s0.x + (ex - s0.x) * u, y = s0.y + (ey - s0.y) * u + Math.sin(Math.PI * u) * 0.08, r = r0 + (r1 - r0) * u;
          pinToScreen(stage, dot, { x, y, height: r });
          pinToScreen(stage, ring, { x, y, height: r + 3.5 / stage.height });
          dot.material.opacity = ring.material.opacity = alpha * smoothstep(0, 0.12, u0);
        }
      }
      flash.material.opacity = fl; flash.visible = fl > 0.003;
    }
    update(0);
    return { update, list };
  }

  // ---------------------------------------------------------------- everything for one plan
  /** rig(plan) -> { group, bench, frame, pendulums, plank, update(t) } (adds itself to the scene) */
  function rig(plan) {
    const group = new THREE.Group(); group.name = "pendulum-wave";
    const bn = bench(plan), fr = frame(plan), pd = pendulums(plan), pk = plank(plan);
    group.add(bn, fr, pd, pk);
    stage.scene.add(group);
    const update = (t) => { bn.userData.update(t); pd.userData.update(t); pk.userData.update(t); };
    update(0);
    return { group, bench: bn, frame: fr, pendulums: pd, plank: pk, update };
  }

  const props = { bench, frame, pendulums, plank, caption, cards, rig };
  return { spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx, plan: wave, motion: wave };
}
