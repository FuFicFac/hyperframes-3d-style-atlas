// styles/granular-sorting/style.js — "Granular Sorting": a flat-fronted glass jar of cream and red beads on a small lab
// shaker in a bright kitchen-lab. The look lives in spec.js; WHERE every bead is at any t comes from shaker.js (a
// THREE-free Monte Carlo tap-and-settle simulation, run once at load, plus a playback plan shared with SCORE). This file
// turns a plan into pictures: counter + tiled wall, the shaker (body, trim, control panel, moving platform), the jar
// (glass panes, edge rods, base, lid rail, corner clamps), two instanced bead meshes, highlight rings, red trails and an
// overlay caption plate. Props never animate themselves: the scene calls update(t), and every update assigns from t.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { RoundedBoxGeometry } from "../../kit/builders.js";
import { screenCanvas } from "../../kit/overlay.js";
import { screenLines } from "../../kit/lines.js";
import { canvasTexture, speckleTexture } from "../../kit/textures.js";
import { newCanvas } from "../../kit/canvas.js";
import { hash01, clamp, smoothstep, TAU } from "../../kit/time.js";
import * as shaker from "./shaker.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, J = spec.jar, SH = spec.shaker;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const L = shaker.layout(spec);
  const shadow = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
  const rbox = (w, h, d, r, mat) => shadow(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat));
  const cyl = (r, h, mat, seg = 32) => shadow(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat));

  for (const k of ["glass", "glassEdge", "beaker"]) { materials[k].transparent = true; materials[k].depthWrite = false; }
  materials.ring.transparent = true; materials.ring.depthWrite = false;
  materials.glass.envMapIntensity = spec.glassLook.env; materials.glassEdge.envMapIntensity = spec.glassLook.edgeEnv;

  // ---------------------------------------------------------------- set: counter + tiled wall
  function tileTexture() {
    const T = spec.set.tile, px = 256, cols = 2, rows = 4;           // one tile = 2:1, half-brick offset rows
    const W = px * cols, H = (px / 2) * rows, cv = newCanvas(W, H), x = cv.getContext("2d");
    x.fillStyle = P.grout; x.fillRect(0, 0, W, H);
    const g = Math.max(2, Math.round((T.grout / T.w) * px));
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (px / 2);
      for (let c = -1; c <= cols; c++) {
        const x0 = c * px + off + g / 2, y0 = r * (px / 2) + g / 2, w = px - g, h = px / 2 - g;
        const tone = 0.94 + 0.06 * hash01(r, c, 7);
        const grd = x.createLinearGradient(0, y0, 0, y0 + h);
        const base = new THREE.Color(P.wall).multiplyScalar(tone);
        grd.addColorStop(0, `#${base.clone().lerp(new THREE.Color("#ffffff"), 0.22).getHexString()}`);
        grd.addColorStop(1, `#${base.getHexString()}`);
        x.fillStyle = grd; x.beginPath(); x.roundRect(x0, y0, w, h, 10); x.fill();
      }
    }
    const tex = canvasTexture(cv, { repeat: [12 / (T.w * cols), 5 / (T.h * rows)] });
    return tex;
  }
  /** set() -> Group: stone counter (top at y = 0) and the sage tiled wall behind it */
  function set() {
    const g = new THREE.Group(); g.name = "set";
    materials.counter.map = speckleTexture({ size: 512, density: 0.5, base: P.counter, dot: ["#cfc8bb", "#ddd6ca", "#f7f4ee", "#b9b2a6"], radius: [0.6, 2.2], seed: 111, repeat: [6, 3] });
    materials.counter.needsUpdate = true;
    const top = shadow(new THREE.Mesh(new THREE.BoxGeometry(12, 0.1, spec.set.counterDepth), materials.counter), false, true);
    top.position.set(0, -0.05, spec.set.wallZ + spec.set.counterDepth / 2); g.add(top);
    materials.wall.map = tileTexture(); materials.wall.needsUpdate = true;
    const wall = shadow(new THREE.Mesh(new THREE.PlaneGeometry(12, 5), materials.wall), false, true);
    wall.position.set(0, 2.5, spec.set.wallZ); g.add(wall);
    return g;
  }

  // ---------------------------------------------------------------- shaker: body, trim, panel, feet (static)
  /** shakerBody() -> Group: the white lab shaker under the platform (static parts) */
  function shakerBody() {
    const g = new THREE.Group(); g.name = "shaker";
    const B = SH.body;
    const body = rbox(B.w, B.h, B.d, B.r, materials.shakerBody); body.position.set(0, SH.feet + B.h / 2, 0); g.add(body);
    const trim = rbox(B.w + 0.006, 0.05, B.d + 0.006, 0.02, materials.shakerTrim); trim.position.set(0, SH.feet + B.h - 0.07, 0); g.add(trim);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const f = cyl(0.07, SH.feet, materials.rubber, 20); f.position.set(sx * (B.w / 2 - 0.2), SH.feet / 2, sz * (B.d / 2 - 0.15)); g.add(f);
    }
    // control panel on the front face: dark glass strip, one knob, two LEDs (no numerals)
    const pn = SH.panel, fz = B.d / 2;
    const panel = rbox(pn.w, pn.h, 0.02, 0.03, materials.panel); panel.position.set(0.85, SH.feet + B.h * 0.44, fz); g.add(panel);
    const knob = cyl(0.085, 0.06, materials.knob, 40); knob.rotation.x = Math.PI / 2; knob.position.set(0.35, SH.feet + B.h * 0.44, fz + 0.04); g.add(knob);
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.012), materials.panel); notch.position.set(0.35 + 0.035, SH.feet + B.h * 0.44 + 0.03, fz + 0.072); notch.rotation.z = -0.9; g.add(notch);
    const leds = [];
    for (let k = 0; k < 3; k++) {
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 10), materials.ledOff);
      led.position.set(0.85 + k * 0.16, SH.feet + B.h * 0.44, fz + 0.02); g.add(led); leds.push(led);
    }
    const slots = rbox(0.9, 0.12, 0.012, 0.02, materials.panel); slots.position.set(-1.0, SH.feet + B.h * 0.44, fz + 0.002); g.add(slots);
    g.userData.leds = leds;
    return g;
  }

  // ---------------------------------------------------------------- the jar (moves with the platform)
  /** jarGlass() -> Group: base, glass panes, edge rods, lid rail and the two corner clamps on the platform */
  function jarGlass() {
    const g = new THREE.Group(); g.name = "jar";
    const w = L.innerW, h = L.innerH, d = L.innerD, gl = J.glass, y0 = L.floorY;
    const platform = rbox(SH.platform.w, SH.platform.h, SH.platform.d, 0.02, materials.platform);
    platform.position.set(0, L.platformY - SH.platform.h / 2, 0); g.add(platform);
    const base = rbox(w + 2 * gl + 0.04, J.base, d + 2 * gl + 0.04, 0.012, materials.glassEdge);
    base.position.set(0, L.platformY + J.base / 2, 0); base.castShadow = false; g.add(base);
    // panes: front + back (thin), two sides
    const pane = (W, H, D, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), materials.glass); m.position.set(x, y, z); m.renderOrder = 5; g.add(m); return m; };
    pane(w + 2 * gl, h, gl * 0.6, 0, y0 + h / 2, d / 2 + gl * 0.3);
    pane(w + 2 * gl, h, gl * 0.6, 0, y0 + h / 2, -d / 2 - gl * 0.3);
    pane(gl, h, d, -w / 2 - gl / 2, y0 + h / 2, 0);
    pane(gl, h, d, w / 2 + gl / 2, y0 + h / 2, 0);
    // edge rods: the bright vertical and horizontal glass edges that make the jar read
    const rod = (len, x, y, z, horiz) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(J.edgeR, J.edgeR, len, 16), materials.glassEdge);
      if (horiz) m.rotation.z = Math.PI / 2;
      m.position.set(x, y, z); m.renderOrder = 6; g.add(m);
    };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(h, sx * (w / 2 + gl / 2), y0 + h / 2, sz * (d / 2 + gl / 2), false);
    for (const sz of [-1, 1]) for (const yy of [y0, y0 + h]) rod(w + 2 * gl, 0, yy, sz * (d / 2 + gl / 2), true);
    // lid rail
    const lid = rbox(w + 2 * gl + 0.05, J.lidH, d + 2 * gl + 0.05, 0.015, materials.lid);
    lid.position.set(0, y0 + h + J.lidH / 2, 0); g.add(lid);
    // corner clamps holding the jar to the platform
    for (const sx of [-1, 1]) {
      const c = rbox(J.clampW, 0.16, d + 2 * gl + 0.12, 0.02, materials.platform);
      c.position.set(sx * (w / 2 + gl + J.clampW / 2 - 0.02), L.platformY + 0.08, 0); g.add(c);
      const s = cyl(0.03, 0.04, materials.rubber, 6); s.position.set(sx * (w / 2 + gl + J.clampW / 2 - 0.02), L.platformY + 0.18, 0); g.add(s);
    }
    return g;
  }

  /** beads(plan, { highlight }) -> Group with two InstancedMeshes (cream, red). userData.update(t, hi) poses every bead
   *  from the plan; hi(j) 0..1 tints listed cream beads toward spec.highlight.color (the ones that slip under) */
  function beads(plan, o = {}) {
    const g = new THREE.Group(); g.name = "beads";
    const run = plan.run, N = run.N, nL = run.nL, u = L.u;
    const small = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 22, 14), materials.beadSmall, N - nL);
    const large = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 44, 28), materials.beadLarge, nL);
    small.name = "creamBeads"; large.name = "redBeads";
    for (const m of [small, large]) { shadow(m); m.frustumCulled = false; g.add(m); }
    // instance colours multiply the material colour: the highlight factor is highlight / base per channel (linear)
    const bLin = new THREE.Color(spec.materials.beadSmall.baseColor), hLin = new THREE.Color(spec.highlight.color);
    const col = new THREE.Color(), baseCol = [], hiCol = new THREE.Color(hLin.r / bLin.r, hLin.g / bLin.g, hLin.b / bLin.b);
    for (let i = nL; i < N; i++) { const k = 0.9 + 0.1 * hash01(i, 3, 111); col.setRGB(k, k * (0.985 + 0.015 * hash01(i, 5)), k * (0.96 + 0.04 * hash01(i, 9))); baseCol[i] = col.clone(); small.setColorAt(i - nL, col); }
    small.instanceColor.needsUpdate = true;
    const hiList = [...new Set(o.highlight ?? [])];
    // depth: red beads sit on the mid-plane; cream ones get a seeded depth jitter inside the free depth (look only)
    const Z = new Float32Array(N);
    for (let i = nL; i < N; i++) Z[i] = (hash01(i, 11, 111) * 2 - 1) * J.zJitter * Math.max(0, L.innerD / 2 - run.r[i] * u);
    const X = new Float64Array(N), Y = new Float64Array(N), M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    g.userData.X = X; g.userData.Y = Y;
    g.userData.update = (t, hi = () => 0) => {
      plan.positions(t, X, Y);
      if (hiList.length) {
        for (const j of hiList) small.setColorAt(j - nL, col.copy(baseCol[j]).lerp(hiCol, clamp(hi(j), 0, 1)));
        small.instanceColor.needsUpdate = true;
      }
      for (let i = 0; i < N; i++) {
        const [wx, wy] = L.toWorld(X[i], Y[i]), rr = run.r[i] * u;
        p.set(wx, wy, Z[i]); s.set(rr, rr, rr); M.compose(p, q, s);
        if (i < nL) large.setMatrixAt(i, M); else small.setMatrixAt(i - nL, M);
      }
      small.instanceMatrix.needsUpdate = true; large.instanceMatrix.needsUpdate = true;
    };
    g.userData.update(0);
    return g;
  }

  /** rings(plan) -> Group of thin white rings around the red beads; userData.update(t, pulses) where
   *  pulses(i) -> start time of bead i's ring (or Infinity) */
  function rings(plan, beadGroup) {
    const g = new THREE.Group(); g.name = "rings";
    const RG = spec.rings, nL = plan.run.nL, list = [];
    const geo = new THREE.RingGeometry(1 - RG.width * 3, 1, 64);
    for (let i = 0; i < nL; i++) {
      const m = new THREE.Mesh(geo, materials.ring.clone()); m.material.depthTest = false; m.renderOrder = 8; m.visible = false; g.add(m); list.push(m);
    }
    g.userData.update = (t, startOf) => {
      const X = beadGroup.userData.X, Y = beadGroup.userData.Y, rr = spec.sim.bigR * L.u;
      list.forEach((m, i) => {
        const s0 = startOf(i), k = (t - s0) / RG.dur;
        m.visible = k > 0 && k < 1;
        if (!m.visible) return;
        const [wx, wy] = L.toWorld(X[i], Y[i]);
        const sc = rr * (1.05 + (RG.grow - 1.05) * smoothstep(0, 1, k));
        m.position.set(wx, wy, 0); m.scale.set(sc, sc, 1);   // a halo drawn over everything around the bead
        m.material.opacity = spec.materials.ring.opacity * (1 - k) * smoothstep(0, 0.12, k);
      });
    };
    return g;
  }

  /** trails(plan) -> screen-space red lines through each red bead's rest positions; userData.update(t, level(i)) */
  function trails(plan, beadGroup) {
    const TR = spec.trails, run = plan.run, nL = run.nL;
    const cap = nL * (plan.end + 2);
    const mesh = screenLines(stage, [[[0, 0, 0], [0, 0.001, 0]]], { width: TR.width, color: TR.color, level: TR.level, depth: "visible", blending: "normal", capacity: cap, name: "trails", renderOrder: 4 });
    const zf = TR.z;                          // in front of every cream bead, behind the front of the red ones
    mesh.userData.update = (t, levelOf) => {
      const ph = plan.phase(t), X = beadGroup.userData.X, Y = beadGroup.userData.Y;
      const polys = [];
      let lv = 0;
      for (let i = 0; i < nL; i++) {
        const a = levelOf(i);
        if (a <= 0.001) continue;
        lv = Math.max(lv, a);
        const pts = [];
        const tr = plan.trails[i];
        for (let c = 0; c <= Math.min(ph.c, tr.length - 1); c++) { const [wx, wy] = L.toWorld(tr[c][0], tr[c][1]); pts.push([wx, wy, zf]); }
        // while climbing, the live bead extends its trail; after it reaches the top the trail stays where it arrived
        if (ph.c < tr.length - 1 || (ph.c === tr.length - 1 && ph.u === 0)) { const [hx, hy] = L.toWorld(X[i], Y[i]); pts.push([hx, hy, zf]); }
        if (pts.length >= 2) polys.push(pts);
      }
      if (!polys.length) { mesh.userData.setLevel(0); return; }
      mesh.userData.setPolys(polys);
      mesh.userData.setLevel(lv);
    };
    return mesh;
  }

  // ---------------------------------------------------------------- overlay caption plate
  /** caption() -> overlay plate (white, ink edge, an icon of cream dots under one red bead); userData.show(text, a) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 24, Hp = Q.h + 28;
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), ic = Math.round(Q.h * 0.62);
      const pw = Math.min(Wc - 16, pad + ic + Math.round(pad * 0.6) + tw + pad), ph = Q.h, oy = 6, ox = Math.round((Wc - pw) / 2);
      x.globalAlpha = 1;
      x.fillStyle = "rgba(28,40,44,0.18)"; x.beginPath(); x.roundRect(ox + 2, oy + 8, pw, ph, 24); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 24); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 4; x.beginPath(); x.roundRect(ox + 2, oy + 2, pw - 4, ph - 4, 22); x.stroke();
      // icon: a little heap of cream dots with the red bead on top
      const cx = ox + pad + ic / 2, cy = oy + ph / 2 + 4, d = ic / 6;
      x.fillStyle = Q.chip2; x.strokeStyle = "#b89d66"; x.lineWidth = 2;
      for (const [dx, dy] of [[-2, 1.6], [0, 1.6], [2, 1.6], [-1, 0], [1, 0], [-2.6, 0.2], [2.6, 0.2]]) { x.beginPath(); x.arc(cx + dx * d, cy + dy * d, d * 0.95, 0, TAU); x.fill(); x.stroke(); }
      x.fillStyle = Q.chip; x.beginPath(); x.arc(cx, cy - 1.7 * d, d * 1.9, 0, TAU); x.fill();
      x.fillStyle = "rgba(255,255,255,0.7)"; x.beginPath(); x.arc(cx - 0.6 * d, cy - 2.3 * d, d * 0.45, 0, TAU); x.fill();
      x.globalAlpha = st.a;
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + Math.round(pad * 0.6), oy + Math.round(ph / 2) + 3);
      x.globalAlpha = 1;
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text, a: Math.round(a * 50) / 50 }); mesh.userData.opacity(1); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /** rig(plan, { highlight: [small bead ids] }) -> { group, platform, beads, rings, trails, update(t, { ringStart, trailLevel, highlight(j) }) } */
  function rig(plan, o0 = {}) {
    const group = new THREE.Group(); group.name = "granular-sorting";
    const st = set(), body = shakerBody();
    const moving = new THREE.Group(); moving.name = "platform+jar";
    const jar = jarGlass(), bd = beads(plan, { highlight: o0.highlight }), rg = rings(plan, bd), tr = trails(plan, bd);
    moving.add(jar, bd, rg, tr);
    group.add(st, body, moving);
    stage.scene.add(group);
    const leds = body.userData.leds;
    const update = (t, o = {}) => {
      moving.position.y = plan.plate(t) * L.u;
      bd.userData.update(t, o.highlight);
      rg.userData.update(t, o.ringStart ?? (() => Infinity));
      tr.userData.update(t, o.trailLevel ?? (() => 0));
      const mode = plan.phase(t).mode, on = mode !== "rest" || (t > plan.firstTap && t < plan.stopT);
      leds.forEach((m, k) => { m.material = on && (k === 0 || (mode === "fast" && k < 3) || k === 1) ? materials.led : materials.ledOff; });
    };
    update(0);
    return { group, platform: moving, beads: bd, rings: rg, trails: tr, update };
  }

  const props = { set, shakerBody, jarGlass, beads, rings, trails, caption, rig };
  return { spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx, plan: shaker, motion: shaker, helpers: { layout: L } };
}
