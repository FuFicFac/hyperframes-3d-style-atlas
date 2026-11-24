// styles/galton-board/style.js — "Galton Board": a glass-fronted bean machine on a bright desk. The look lives in spec.js;
// WHERE every ball is at time t lives in plinko.js (THREE-free planner shared with SCORE). This file turns a plan into
// pictures:
//   - board(): maple frame, enamel-blue backboard, brass pegs (one InstancedMesh; struck pegs flash + swell from the
//     plan's hit times), bin dividers, walnut hopper + brass spout, guide rails, glass pane;
//   - balls(plan): one InstancedMesh of steel spheres posed from plan.pos(i, t) (hidden until released);
//   - curve(points): the red enamel bell curve drawn on the glass (setProgress);
//   - desk(): oak desk + wall + a notebook, pencil and a few coins;
//   - caption(): overlay chip (exact colours), top-left.
// Props never animate themselves: the scene calls update(t) / setProgress(u).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { woodTexture, gridTexture } from "../../kit/textures.js";
import { contactShadow } from "../../kit/builders.js";
import { fresnelGlass } from "../../kit/materials.js";
import { sweepGeometry } from "../../kit/paths.js";
import * as plinko from "./plinko.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, B = spec.board;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const L = plinko.layout(B);

  // ---------------------------------------------------------------- wood maps
  const W = spec.wood;
  materials.desk.map = woodTexture({ ...W.desk, dark: P.deskDark, mid: P.desk, light: P.deskLight, seam: P.deskDark, repeat: W.desk.repeat });
  materials.maple.map = woodTexture({ ...W.maple, size: 512, dark: P.mapleDark, mid: P.maple, light: P.mapleLight, seam: P.maple });
  materials.walnut.map = woodTexture({ ...W.walnut, size: 512, dark: P.walnutDark, mid: P.walnut, light: P.walnutLight, seam: P.walnut });
  for (const k of ["desk", "maple", "walnut"]) materials[k].needsUpdate = true;

  const box = (w, h, d, mat, x, y, z, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; m.name = name ?? "box";
    return m;
  };
  /** a long wooden bar from a to b in the XY plane (grain runs along the bar) */
  const bar = (a, b, thick, depth, z, mat, name) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const m = box(len, thick, depth, mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z, name);
    m.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
    return m;
  };

  // ---------------------------------------------------------------- desk + wall + dressing
  /** desk() -> Group: oak desk top (y = 0), pale wall behind, a notebook + pencil and a few coins beside the board */
  function desk(o = {}) {
    const D = { ...spec.desk, ...o };
    const g = new THREE.Group(); g.name = "desk";
    const top = new THREE.Mesh(new THREE.PlaneGeometry(D.width, D.depth), materials.desk);
    top.rotation.x = -Math.PI / 2; top.position.set(0, 0, D.wallZ + D.depth / 2); top.receiveShadow = true; top.name = "desk-top";
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(D.width, 26), materials.wall);
    wall.position.set(0, 13, D.wallZ); wall.receiveShadow = true; wall.name = "wall";
    g.add(top, wall);
    // notebook (grid paper) + pencil
    const nb = new THREE.Group(); nb.name = "notebook";
    const paperMat = materials.paper.clone();
    paperMat.map = gridTexture({ size: 512, cells: 12, line: 2, bg: P.paper, fg: "#b9cfe0" });
    const cover = box(2.3, 0.07, 3.1, materials.board, 0, 0.035, 0, "notebook-cover");
    const page = box(2.18, 0.03, 2.98, [materials.paper, materials.paper, paperMat, materials.paper, materials.paper, materials.paper], 0, 0.085, 0, "notebook-page");
    const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.9, 6), materials.pencil);
    pencil.rotation.set(Math.PI / 2, 0, 0.5); pencil.position.set(0.25, 0.145, 0.2); pencil.castShadow = true; pencil.name = "pencil";
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.17, 6), materials.graphite);
    tip.position.set(0, -1.035, 0); tip.rotation.x = Math.PI; pencil.add(tip);
    nb.add(cover, page, pencil, contactShadow({ w: 2.9, d: 3.7, opacity: 0.22 }));
    nb.position.set(...spec.dressing.notebook); nb.rotation.y = -0.22;
    g.add(nb);
    // coins: heads or tails
    const coins = new THREE.Group(); coins.name = "coins";
    [[0, 0, 0], [0.02, 0.07, 0.01], [-0.01, 0.14, 0.02], [0.62, 0, 0.35]].forEach(([x, y, z], k) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.065, 40), materials.brass);
      c.position.set(x, y + 0.0325, z); c.castShadow = c.receiveShadow = true; c.name = `coin-${k}`;
      coins.add(c);
    });
    coins.add(contactShadow({ w: 1.5, d: 1.1, opacity: 0.25 }));
    coins.position.set(...spec.dressing.coins);
    g.add(coins);
    stage.scene.add(g);
    return g;
  }

  // ---------------------------------------------------------------- the board
  /**
   * board() -> { group, pegs, update(plan, t) } (adds itself to the scene). Static machine + instanced pegs;
   * update(plan, t) sets every peg's flash colour and swell from plan.pegGlow(id, t).
   */
  function board() {
    const g = new THREE.Group(); g.name = "galton-board";
    const O = L.outer, I = L.inner, F = B.frame;
    const zc = (O.z0 + O.z1) / 2, dz = O.z1 - O.z0;
    const cx = 0, wOut = O.x1 - O.x0;
    // frame: bottom + top rails, two stiles (bars so the grain runs along each), feet
    g.add(bar([O.x0, B.feet + B.base / 2], [O.x1, B.feet + B.base / 2], B.base, dz, zc, materials.maple, "rail-bottom"));
    g.add(bar([O.x0, I.y1 + F / 2], [O.x1, I.y1 + F / 2], F, dz, zc, materials.maple, "rail-top"));
    g.add(bar([O.x0 + F / 2, I.y0], [O.x0 + F / 2, I.y1], F, dz, zc, materials.maple, "stile-left"));
    g.add(bar([O.x1 - F / 2, I.y0], [O.x1 - F / 2, I.y1], F, dz, zc, materials.maple, "stile-right"));
    for (const s of [-1, 1]) g.add(box(0.9, B.feet, dz + 0.5, materials.walnut, s * (wOut / 2 - 0.75), B.feet / 2, zc + 0.1, "foot"));
    g.add(contactShadow({ w: wOut + 0.9, d: 1.6, opacity: 0.3 }));
    // backboard
    const back = box(I.x1 - I.x0, I.y1 - I.y0, 0.04, materials.board, cx, (I.y0 + I.y1) / 2, -0.02, "backboard");
    back.castShadow = false;
    g.add(back);
    // bin dividers
    for (const x of L.dividers) g.add(box(B.wall, B.binH, B.pegLen, materials.divider, x, I.y0 + B.binH / 2, B.pegLen / 2, "divider"));
    // guide rails along the two sides of the peg triangle
    const G = B.guide;
    for (const s of [-1, 1]) {
      const at = (k) => [s * (k * B.dx / 2 + G.offset), L.apexY - k * B.dy];
      g.add(bar(at(G.from), at(G.to), G.thick, B.pegLen, B.pegLen / 2, materials.maple, "guide"));
    }
    // hopper: a walnut funnel block (opaque) + a brass spout; balls come out of the spout
    const sh = new THREE.Shape();
    sh.moveTo(-B.hopperHalfTop, L.innerTop); sh.lineTo(B.hopperHalfTop, L.innerTop);
    sh.lineTo(B.hopperHalfBottom, L.funnelY); sh.lineTo(-B.hopperHalfBottom, L.funnelY); sh.closePath();
    const hopper = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: B.pegLen + 0.01, bevelEnabled: false }), materials.walnut);
    hopper.castShadow = hopper.receiveShadow = true; hopper.name = "hopper";
    g.add(hopper);
    const band = box(2 * B.hopperHalfBottom + 0.1, 0.05, B.pegLen + 0.03, materials.brass, 0, L.funnelY + 0.025, B.pegLen / 2, "hopper-band");
    g.add(band);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(B.spoutR, B.spoutR, B.spoutLen, 28, 1, true), materials.brass.clone());
    spout.material.side = THREE.DoubleSide;
    spout.position.set(0, L.spoutY + B.spoutLen / 2, L.ballZ); spout.castShadow = true; spout.name = "spout";
    g.add(spout);
    // pegs: one InstancedMesh, axis along z, front cap toward the glass
    const pg = new THREE.CylinderGeometry(B.pegR, B.pegR, B.pegLen, 24);
    pg.rotateX(Math.PI / 2); pg.translate(0, 0, B.pegLen / 2);
    const pegs = new THREE.InstancedMesh(pg, materials.peg, L.pegs.length);
    pegs.castShadow = pegs.receiveShadow = true; pegs.frustumCulled = false; pegs.name = "pegs";
    const M = new THREE.Matrix4(), brass = new THREE.Color(P.brass), hot = new THREE.Color(P.brassHot), c = new THREE.Color();
    L.pegs.forEach((p, i) => { M.makeTranslation(p.x, p.y, 0); pegs.setMatrixAt(i, M); pegs.setColorAt(i, brass); });
    g.add(pegs);
    // glass pane
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(I.x1 - I.x0, I.y1 - I.y0), fresnelGlass({ ...spec.glass, doubleSide: false }));
    glass.position.set(cx, (I.y0 + I.y1) / 2, B.glassZ); glass.renderOrder = 5; glass.name = "glass";
    g.add(glass);
    stage.scene.add(g);
    const S = new THREE.Vector3(), Q = new THREE.Quaternion(), T = new THREE.Vector3();
    return {
      group: g, pegs, glass,
      update(plan, t) {
        L.pegs.forEach((p, i) => {
          const k = plan ? plan.pegGlow(i, t) : 0;
          const s = 1 + spec.peg.swell * k;
          M.compose(T.set(p.x, p.y, 0), Q, S.set(s, s, 1));
          pegs.setMatrixAt(i, M);
          c.copy(brass).lerp(hot, Math.min(1, k)).multiplyScalar(1 + spec.peg.flash * k);
          pegs.setColorAt(i, c);
        });
        pegs.instanceMatrix.needsUpdate = true;
        pegs.instanceColor.needsUpdate = true;
      },
    };
  }

  // ---------------------------------------------------------------- balls
  /** balls(plan) -> { mesh, update(t) }: steel spheres posed from plan.pos(i, t); scale 0 until released */
  function balls(plan) {
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(B.ballR, 32, 20), materials.steel, plan.n);
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = "balls";
    const steel = new THREE.Color(P.steel), tracer = new THREE.Color(P.tracer);
    const M = new THREE.Matrix4(), Z = new THREE.Matrix4().makeScale(0, 0, 0);
    plan.balls.forEach((b, i) => { mesh.setMatrixAt(i, Z); mesh.setColorAt(i, b.tracer ? tracer : steel); });
    stage.scene.add(mesh);
    return {
      mesh,
      update(t) {
        for (let i = 0; i < plan.n; i++) {
          const p = plan.pos(i, t);
          if (!p) mesh.setMatrixAt(i, Z);
          else { M.makeTranslation(p[0], p[1], p[2]); mesh.setMatrixAt(i, M); }
        }
        mesh.instanceMatrix.needsUpdate = true;
      },
    };
  }

  // ---------------------------------------------------------------- bell curve on the glass
  /** curve(points [[x, y]]) -> Mesh (red enamel line on the glass); userData.setProgress(u) draws it left to right */
  function curve(points, o = {}) {
    const C = { ...spec.curve, ...o };
    const radial = 10;
    const geo = sweepGeometry(points.map(([x, y]) => [x, y, C.z]), C.radius, radial);
    const total = geo.index.count, per = total / (points.length - 1);
    const m = new THREE.Mesh(geo, materials.enamel);
    m.name = "bell-curve"; m.castShadow = false; m.frustumCulled = false;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(C.radius * 1.5, 16, 12), materials.enamel);
    tip.name = "curve-tip"; m.add(tip);
    m.userData.setProgress = (u) => {
      const segs = Math.round(Math.min(1, Math.max(0, u)) * (points.length - 1));
      geo.setDrawRange(0, Math.round(segs * per));
      m.visible = segs > 0;
      const p = points[segs];
      tip.position.set(p[0], p[1], C.z);
    };
    m.userData.setProgress(0);
    stage.scene.add(m);
    return m;
  }

  // ---------------------------------------------------------------- overlay caption chip (top-left)
  /** caption() -> overlay chip (cream plate, brass edge, a small falling-ball mark, dark text); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 40, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.7), mark = 46;
      const pw = Math.min(Wc - 16, pad + mark + pad * 0.7 + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(20,30,40,0.22)"; x.beginPath(); x.roundRect(ox + 2, oy + 7, pw, ph, 16); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 16); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 4; x.beginPath(); x.roundRect(ox + 2, oy + 2, pw - 4, ph - 4, 14); x.stroke();
      // the mark: a ball above two pegs
      const mx = ox + pad + mark / 2, my = oy + ph / 2;
      x.fillStyle = Q.mark; x.beginPath(); x.arc(mx, my - 17, 11, 0, Math.PI * 2); x.fill();
      x.fillStyle = Q.edge;
      for (const dx of [-14, 14]) { x.beginPath(); x.arc(mx + dx, my + 17, 8, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + mark + pad * 0.7, my + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text: a > 0.003 ? text : "" }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { desk, board, balls, curve, caption };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    layout: L, plan: plinko, motion: plinko,
  };
}
