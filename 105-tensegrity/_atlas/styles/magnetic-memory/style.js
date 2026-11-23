// styles/magnetic-memory/style.js — "Magnetic Memory": a white tabletop board of latching two-tone tiles and a
// red-and-silver bar magnet on a handle. The look lives in spec.js; WHEN each tile flips (and the magnet's path) lives in
// memory.js (THREE-free planner, shared with SCORE). This file turns a plan into pictures: the board (base, pit floor,
// lattice, frame), one InstancedMesh of tiles (three materials by face group: cream top, indigo bottom, vermilion edges),
// the magnet, the table and an overlay caption plate. Props never animate themselves: the scene calls update(t), which
// rewrites every tile matrix and the magnet pose from t.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { RoundedBoxGeometry } from "../../kit/builders.js";
import { depthOfField } from "../../kit/studio.js";
import * as memory from "./memory.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  // depth of field: scale-free aperture, focus follows the camera rig's target every frame (kit pass-7 rule)
  const dof = spec.dof && post ? depthOfField(stage, { relativeAperture: spec.dof.relativeAperture, maxblur: spec.dof.maxblur, focus: "target" }) : null;
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const G = spec.grid, T = spec.tile, BD = spec.board, p = G.pitch;
  const cellsW = G.cols * p, cellsD = G.rows * p;
  /** outer size of the board (frame included), metres: [width x, depth z] */
  const boardSize = () => [cellsW + 2 * BD.margin, cellsD + 2 * BD.margin];

  // ---------------------------------------------------------------- the table
  /** table() -> Mesh: a large matte plane under the board */
  function table(o = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(o.size ?? 40, o.size ?? 40), materials.table);
    m.rotation.x = -Math.PI / 2;
    m.position.y = -BD.pitDepth - BD.base;
    m.receiveShadow = true; m.name = "table";
    return m;
  }

  // ---------------------------------------------------------------- the board
  /** board() -> Group: base slab (pit colour on top), white lattice of cell walls (one merged mesh), white raised frame */
  function board() {
    const g = new THREE.Group(); g.name = "board";
    const [W, D] = boardSize();
    const base = new THREE.Mesh(new RoundedBoxGeometry(W, BD.base, D, 3, 0.03), materials.pit);
    base.position.y = -BD.pitDepth - BD.base / 2; base.receiveShadow = true; base.castShadow = true; base.name = "base";
    g.add(base);
    // lattice: rows+1 walls along X, cols+1 walls along Z, flush with y = 0 at the top
    const parts = [];
    const wh = BD.pitDepth;
    for (let r = 0; r <= G.rows; r++) {
      const b = new THREE.BoxGeometry(cellsW + BD.wall, wh, BD.wall);
      b.translate(0, -wh / 2, (r - G.rows / 2) * p);
      parts.push(b);
    }
    for (let c = 0; c <= G.cols; c++) {
      const b = new THREE.BoxGeometry(BD.wall, wh, cellsD + BD.wall);
      b.translate((c - G.cols / 2) * p, -wh / 2, 0);
      parts.push(b);
    }
    const lattice = new THREE.Mesh(mergeGeometries(parts), materials.lattice);
    lattice.name = "lattice"; lattice.receiveShadow = true; lattice.castShadow = true;
    g.add(lattice);
    // frame: four rounded bars around the cells, a little proud of the lattice (the lip)
    const fh = BD.pitDepth + BD.lip, m = BD.margin;
    const bars = [
      [W, m, 0, -(cellsD / 2 + m / 2)], [W, m, 0, cellsD / 2 + m / 2],
      [m, cellsD + 0.002, -(cellsW / 2 + m / 2), 0], [m, cellsD + 0.002, cellsW / 2 + m / 2, 0],
    ];
    for (const [a, b, x, z] of bars) {
      const f = new THREE.Mesh(new RoundedBoxGeometry(a, fh, b, 3, 0.012), materials.board);
      f.position.set(x, BD.lip - fh / 2, z); f.receiveShadow = true; f.castShadow = true; f.name = "frame";
      g.add(f);
    }
    g.userData.size = [W, D];
    return g;
  }

  // ---------------------------------------------------------------- the tiles (one InstancedMesh, three face materials)
  /**
   * tiles(plan) -> InstancedMesh; userData.update(t) sets every tile's axle angle from plan.angle(i, t).
   *   Face groups of the box: +x/-x/+z/-z edges (vermilion), +y cream (angle 0 = pale up), -y indigo (angle PI = dark up).
   */
  function tiles(plan) {
    const geo = new RoundedBoxGeometry(T.size, T.thick, T.size, 2, T.radius);
    materials.tileDark.envMapIntensity = T.darkEnv ?? 1; // a top-down view reflects the bright room ceiling: keep the lacquer dark
    const mats = [materials.tileEdge, materials.tileEdge, materials.tilePale, materials.tileDark, materials.tileEdge, materials.tileEdge];
    const mesh = new THREE.InstancedMesh(geo, mats, plan.N);
    mesh.name = "tiles"; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    const M = new THREE.Matrix4(), R = new THREE.Matrix4();
    const y0 = -T.thick / 2 - T.sink;
    const update = (t) => {
      const m = plan.magnetAt(t);
      for (let i = 0; i < plan.N; i++) {
        const a = plan.angle(i, t, m);
        R.makeRotationX(a);
        M.makeTranslation(plan.X[i], y0, plan.Z[i]).multiply(R);
        mesh.setMatrixAt(i, M);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    update(0);
    mesh.userData.update = update;
    return mesh;
  }

  // ---------------------------------------------------------------- the magnet
  /**
   * magnet() -> Group: vertical red-and-silver bar (red half down at roll 0) with a dark collar at its middle and a
   *   horizontal handle + grip on the roll axis. Origin = the centre of the bar's lower face. userData.set({ x, z, h, pol, on }): h = height of the
   *   lower face above the tile tops; pol -1 = turned over about the handle axis (silver end down).
   */
  function magnet() {
    const MG = spec.magnet, H = MG.handle;
    const g = new THREE.Group(); g.name = "magnet";
    const roll = new THREE.Group(); roll.position.y = MG.L / 2; g.add(roll); // pivot at the bar's middle
    const half = (mat, y) => {
      const b = new THREE.Mesh(new RoundedBoxGeometry(MG.w, MG.L / 2, MG.w, 3, MG.radius), mat);
      b.position.y = y; b.castShadow = true; b.receiveShadow = true; roll.add(b); return b;
    };
    half(materials.magnetRed, -MG.L / 4);
    half(materials.magnetSilver, MG.L / 4);
    // handle: horizontal, along dir, from the collar
    const dir = new THREE.Vector3(...H.dir).normalize();
    const collar = new THREE.Mesh(new RoundedBoxGeometry(MG.w + 0.05, MG.collar, MG.w + 0.05, 2, 0.012), materials.grip);
    collar.castShadow = true; roll.add(collar);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(H.r, H.r, H.len, 16), materials.magnetSilver);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    rod.quaternion.copy(q);
    rod.position.copy(dir.clone().multiplyScalar(MG.w / 2 + H.len / 2));
    rod.castShadow = true; roll.add(rod);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(H.gripR, H.gripR * 0.92, H.grip, 20), materials.grip);
    grip.quaternion.copy(q);
    grip.position.copy(dir.clone().multiplyScalar(MG.w / 2 + H.len - H.grip / 2 + 0.02));
    grip.castShadow = true; roll.add(grip);
    // roll axis = the handle direction (turning the wand over swaps the ends)
    const axis = dir.clone();
    g.userData.set = ({ x, z, h, pol, on }) => {
      g.visible = !!on;
      g.position.set(x, h, z);
      roll.quaternion.setFromAxisAngle(axis, pol < 0 ? Math.PI : 0);
    };
    g.userData.set({ x: 0, z: 0, h: 5, pol: 1, on: false });
    return g;
  }

  // ---------------------------------------------------------------- overlay caption (indigo plate, magnet icon)
  /** caption() -> overlay plate; userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1200, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), ic = Math.round(Q.h * 0.62);
      const pw = Math.min(W - 16, pad + ic + Math.round(pad * 0.8) + tw + pad), ph = Q.h, oy = 6, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(20,24,40,0.26)"; x.beginPath(); x.roundRect(ox + 2, oy + 7, pw, ph, 16); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 16); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 3; x.beginPath(); x.roundRect(ox + 6, oy + 6, pw - 12, ph - 12, 11); x.stroke();
      // icon: a tiny bar magnet, red half and silver half
      const bw = ic, bh = Math.round(ic * 0.36), bx = ox + pad, by = oy + Math.round((ph - bh) / 2);
      x.fillStyle = Q.red; x.beginPath(); x.roundRect(bx, by, bw / 2, bh, [4, 0, 0, 4]); x.fill();
      x.fillStyle = Q.silver; x.beginPath(); x.roundRect(bx + bw / 2, by, bw / 2, bh, [0, 4, 4, 0]); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + Math.round(pad * 0.8), oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y - 6);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /** memoryBoard(plan) -> { group, board, tiles, magnet, update(t) } (adds itself to the scene) */
  function memoryBoard(plan) {
    const group = new THREE.Group(); group.name = "magnetic-memory";
    group.add(table());
    const bd = board(); group.add(bd);
    const tl = tiles(plan); group.add(tl);
    const mg = magnet(); group.add(mg);
    stage.scene.add(group);
    return {
      group, board: bd, tiles: tl, magnet: mg,
      update(t) {
        tl.userData.update(t);
        mg.userData.set(plan.magnetAt(t));
      },
    };
  }

  const props = { table, board, tiles, magnet, caption, memoryBoard };
  return {
    spec, palette: P, materials, lights, post, dof, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: memory, motion: memory, boardSize,
  };
}
