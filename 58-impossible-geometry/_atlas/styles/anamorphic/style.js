// styles/anamorphic/style.js — "Anamorphic Illusion": chunky painted rods hanging on strings at very different depths in
// a bright gallery room; from one sweet spot they line up into a figure. The look lives in spec.js; WHERE every piece
// hangs lives in anamorph.js (THREE-free planner shared with SCORE and the framing gate). This file turns a figure plan
// into objects: one swept rod (kit sweepGeometry + sphere caps) per piece, built directly at its planned 3D position, a
// thin string from its top up to a ceiling hook, a taped cross on the floor under each sweet spot, the room, and a caption
// chip on the overlay. Props never animate themselves: the scene calls update(t, state).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { sweepGeometry } from "../../kit/paths.js";
import { screenCanvas } from "../../kit/overlay.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as anamorph from "./anamorph.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const PC = spec.pieces;

  // ---------------------------------------------------------------- room
  /** room({ min, max }) -> Group: tiled floor, back + side walls, ceiling with a hanging rail, skirting */
  function room(o = {}) {
    const R = { ...spec.room, ...o };
    const [x0, y0, z0] = R.min, [x1, y1, z1] = R.max;
    const W = x1 - x0, H = y1 - y0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const g = new THREE.Group(); g.name = "room";
    const fm = materials.floor;
    if (fm.map) { fm.map.repeat.set(W / 7.2, D / 7.2); fm.map.wrapS = fm.map.wrapT = THREE.RepeatWrapping; fm.map.needsUpdate = true; }
    const plane = (w, h, mat, pos, rot, name) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(...pos); m.rotation.set(...rot); m.receiveShadow = true; m.name = name; g.add(m); return m;
    };
    plane(W + 4, D + 8, fm, [cx, y0, cz + 2], [-Math.PI / 2, 0, 0], "floor");
    plane(W, H, materials.wall, [cx, y0 + H / 2, z0], [0, 0, 0], "backWall");
    plane(D + 8, H, materials.wallSide, [x0, y0 + H / 2, cz + 2], [0, Math.PI / 2, 0], "leftWall");
    plane(D + 8, H, materials.wallSide, [x1, y0 + H / 2, cz + 2], [0, -Math.PI / 2, 0], "rightWall");
    plane(W, D + 8, materials.ceiling, [cx, y1, cz + 2], [Math.PI / 2, 0, 0], "ceiling");
    // skirting boards
    const sk = R.skirting;
    const board = (w, pos, rotY) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, sk, 0.03), materials.rail);
      m.position.set(...pos); m.rotation.y = rotY; m.receiveShadow = true; g.add(m);
    };
    board(W, [cx, sk / 2, z0 + 0.015], 0);
    board(D + 8, [x0 + 0.015, sk / 2, cz + 2], Math.PI / 2);
    board(D + 8, [x1 - 0.015, sk / 2, cz + 2], Math.PI / 2);
    return g;
  }

  // ---------------------------------------------------------------- pieces
  function rodGeometry(pts, r, radial) {
    const tube = sweepGeometry(pts, r, radial);
    const capA = new THREE.SphereGeometry(r, radial, Math.max(6, radial >> 1)); capA.translate(...pts[0]);
    const capB = new THREE.SphereGeometry(r, radial, Math.max(6, radial >> 1)); capB.translate(...pts[pts.length - 1]);
    const parts = [tube, capA, capB].map((q) => { const n = q.index ? q.toNonIndexed() : q; for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k); return n; });
    return mergeGeometries(parts, false);
  }

  /**
   * pieceSet(fig, { colors }) -> Group of every piece of one figure plan (anamorph.planFigure).
   *   Each piece is a pivot Group at its hanging point (rotates about the vertical string axis for sway) holding the rod
   *   (geometry in world coordinates minus the pivot) and its string up to the ceiling.
   *   userData.update(t, { sway = 0, dim = 0, glow = 0 }) — sway weight 0..1 (0 = exact plan pose), dim 0..1 (mix toward
   *   own mid-tone), glow 0..1 (emissive flash).
   */
  function pieceSet(fig, o = {}) {
    const g = new THREE.Group(); g.name = `pieces-${fig.id}`;
    const colors = (o.colors ?? P.figA).map((c) => new THREE.Color(c));
    const mats = colors.map((c, i) => {
      const m = new THREE.MeshPhysicalMaterial({ color: c.clone(), ...spec.pieceMaterial, emissive: c.clone(), emissiveIntensity: 0 });
      m.name = `piece-${fig.id}-${i}`;
      return m;
    });
    const grey = colors.map((c) => { const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; return new THREE.Color(l, l, l).lerp(new THREE.Color(...PC.dimTone), 0.6); });
    const strGeo = new THREE.CylinderGeometry(PC.stringR, PC.stringR, 1, 5, 1, true); strGeo.translate(0, 0.5, 0);
    const hookGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10);
    const pivots = [];
    for (const p of fig.pieces) {
      const pivot = new THREE.Group();
      pivot.position.set(...p.hang);
      const local = p.pts.map((q) => [q[0] - p.hang[0], q[1] - p.hang[1], q[2] - p.hang[2]]);
      const rod = new THREE.Mesh(rodGeometry(local, p.r, PC.radial), mats[p.tone % mats.length]);
      rod.castShadow = true; rod.receiveShadow = true; rod.name = `piece-${fig.id}-${p.k}`;
      pivot.add(rod);
      if (p.stringLen > 0.01) {
        const s = new THREE.Mesh(strGeo, materials.string);
        s.scale.set(1, p.stringLen, 1); s.castShadow = false; s.name = "string";
        pivot.add(s);
        const h = new THREE.Mesh(hookGeo, materials.hook);
        h.position.set(p.hang[0], p.hang[1] + p.stringLen - 0.02, p.hang[2]);
        g.add(h);
      }
      pivot.userData.phase = (p.k * 2.399) % (Math.PI * 2);
      pivot.userData.amp = 0.6 + 0.4 * Math.sin(p.k * 1.7);
      g.add(pivot); pivots.push(pivot);
    }
    g.userData.update = (t, st = {}) => {
      const sw = st.sway ?? 0, dim = st.dim ?? 0, glow = st.glow ?? 0;
      for (const pv of pivots) pv.rotation.y = sw === 0 ? 0 : sw * PC.sway * pv.userData.amp * Math.sin(t * PC.swaySpeed * 2.1 + pv.userData.phase);
      mats.forEach((m, i) => {
        m.color.copy(colors[i]).lerp(grey[i], dim * PC.dimMix);
        m.emissive.copy(colors[i]);
        m.emissiveIntensity = glow * PC.glow;
      });
    };
    g.userData.update(0);
    return g;
  }

  /** tapeMark(pos [x,y,z]) -> a taped cross on the floor (where to stand) */
  function tapeMark(pos, o = {}) {
    const T = { ...spec.tapeMark, ...o };
    const g = new THREE.Group(); g.name = "tapeMark";
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(T.size, T.width), materials.tape);
      m.rotation.set(-Math.PI / 2, 0, a); m.position.set(pos[0], 0.004, pos[2]); m.receiveShadow = true;
      g.add(m);
    }
    return g;
  }

  // ---------------------------------------------------------------- overlay caption
  /** caption() -> overlay chip, centred at spec.caption.y; a small "eye" mark + text; userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1300, Hp = Q.h + 20;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      x.letterSpacing = "0px";
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.75), ic = Math.round(Q.h * 0.36);
      const pw = Math.min(W - 16, pad + ic * 1.6 + pad * 0.7 + tw + pad), ph = Q.h;
      const ox = Math.round((W - pw) / 2), oy = 4;
      x.fillStyle = "rgba(0,0,0,0.22)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, ph / 2); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, ph / 2); x.fill();
      // eye mark: almond + pupil
      const ex = ox + pad + ic * 0.8, ey = oy + ph / 2;
      x.strokeStyle = Q.eye; x.lineWidth = 4;
      x.beginPath(); x.moveTo(ex - ic * 0.8, ey); x.quadraticCurveTo(ex, ey - ic * 0.75, ex + ic * 0.8, ey); x.quadraticCurveTo(ex, ey + ic * 0.75, ex - ic * 0.8, ey); x.stroke();
      x.fillStyle = Q.eye; x.beginPath(); x.arc(ex, ey, ic * 0.24, 0, Math.PI * 2); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ex + ic * 0.8 + pad * 0.7, ey + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place((stage.width - Wp) / 2, Q.y - Hp / 2);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { room, pieceSet, tapeMark, caption, rodGeometry };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: anamorph, motion: anamorph,
  };
}
