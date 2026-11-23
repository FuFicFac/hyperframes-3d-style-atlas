// styles/constructivist-poster/style.js — "Constructivist Poster". The look lives in spec.js; WHEN every piece
// arrives (and every sound) lives in construct.js (THREE-free planner shared with SCORE). This file turns a layout
// + plan into pictures: a cream lithograph board, and every element as a thick extruded card (wedge, bar, disc, cone,
// wheel, type block, cut-out word) at its own height on hidden dowels, casting hard shadows. buildPoster() poses
// every piece from plan.u(id, t) each frame: slide along its axis, drop onto the board, swing on a hinge, roll on a
// rail, or fly out of the cone growing as it travels. Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { makeCanvas, canvasTexture } from "../../kit/textures.js";
import { clamp, lerp, deg } from "../../kit/time.js";
import * as construct from "./construct.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const C = spec.card;

  // ---------------------------------------------------------------- board
  /** board() -> Mesh: the poster board (front face = cream paper at z = 0, depth behind it) */
  function board(o = {}) {
    const B = { ...spec.board, ...o };
    const g = new THREE.BoxGeometry(B.w, B.h, B.depth);
    g.translate(0, 0, -B.depth / 2);
    const E = materials.boardEdge;
    const m = new THREE.Mesh(g, [E, E, E, E, materials.paper, E]); // +x -x +y -y +z(front) -z
    m.receiveShadow = true; m.castShadow = true; m.name = "board";
    return m;
  }

  // ---------------------------------------------------------------- shapes (local coords, metres)
  const shapes = {
    /** wedge: base edge centred on the origin (x = 0), tip at (+len, 0) */
    wedge: ({ len, width }) => { const s = new THREE.Shape(); s.moveTo(0, -width / 2); s.lineTo(len, 0); s.lineTo(0, width / 2); s.closePath(); return s; },
    /** bar: rectangle centred on the origin, long along x */
    bar: ({ len, width }) => { const s = new THREE.Shape(); s.moveTo(-len / 2, -width / 2); s.lineTo(len / 2, -width / 2); s.lineTo(len / 2, width / 2); s.lineTo(-len / 2, width / 2); s.closePath(); return s; },
    /** disc: circle centred on the origin */
    disc: ({ r }) => { const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI * 2, false); return s; },
    /** cone: megaphone trapezoid, narrow end (w0) at x = 0, mouth (w1) at x = len */
    cone: ({ len, w0, w1 }) => { const s = new THREE.Shape(); s.moveTo(0, -w0 / 2); s.lineTo(len, -w1 / 2); s.lineTo(len, w1 / 2); s.lineTo(0, w0 / 2); s.closePath(); return s; },
  };

  /** extruded card mesh: shape -> slab from z = top - thickness to z = top */
  function slab(shape, material, top, thickness = C.thickness, curveSegments = 48) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments });
    g.translate(0, 0, top - thickness);
    const m = new THREE.Mesh(g, material);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  /** a hidden wooden dowel from the board (z = 0) up to the underside of a card at `top` */
  function dowel(x, y, top) {
    const h = Math.max(0.02, top - C.thickness);
    const g = new THREE.CylinderGeometry(C.dowelR, C.dowelR, h, 16);
    g.rotateX(Math.PI / 2); g.translate(x, y, h / 2);
    const m = new THREE.Mesh(g, materials.dowel); m.castShadow = true; m.receiveShadow = true; m.name = "dowel";
    return m;
  }

  /** printed block face: condensed capitals filling a w x h face */
  function blockTexture(text, w, h, o = {}) {
    const T = spec.type, px = 120;
    const W = Math.round(w * px), H = Math.round(h * px);
    const cv = makeCanvas(W, H);
    const x = cv.getContext("2d");
    x.fillStyle = o.bg ?? P.black; x.fillRect(0, 0, W, H);
    let size = H * 0.98;
    x.font = `${T.weight} ${size}px ${T.font}`;
    const tw = x.measureText(text).width;
    const maxW = W * (o.fillW ?? 0.88);
    if (tw > maxW) { size *= maxW / tw; x.font = `${T.weight} ${size}px ${T.font}`; }
    x.textAlign = "center"; x.textBaseline = "middle";
    if (o.under) { x.fillStyle = o.under; x.fillText(text, W / 2 + H * 0.035, H / 2 + H * 0.06); }   // misregistered underprint
    x.fillStyle = o.ink ?? P.paper; x.fillText(text, W / 2, H / 2 + H * 0.04);
    const tex = canvasTexture(cv, { srgb: true, anisotropy: 8 });
    return tex;
  }

  /** wheel({ r, material }) -> Group: a disc with three cream spokes and a hub (turns about z) */
  function wheel({ r, material = "red", top = 0.4 }) {
    const g = new THREE.Group(); g.name = "wheel";
    g.add(slab(shapes.disc({ r }), materials[material], top));
    const spokeMat = material === "black" ? materials.white : materials.black;
    for (let k = 0; k < 2; k++) {
      const sp = slab(shapes.bar({ len: r * 1.7, width: r * 0.2 }), spokeMat, top + 0.03, 0.03, 4);
      sp.rotation.z = (k * Math.PI) / 2; g.add(sp);
    }
    g.add(slab(shapes.disc({ r: r * 0.26 }), materials.white, top + 0.05, 0.05, 24));
    return g;
  }

  /** word(text, { cap, color, under, top }) -> Group: a cut-out word (lit plane, casts a hard shadow) + misregistered underprint */
  function word(text, o = {}) {
    const T = spec.type, g = new THREE.Group(); g.name = `word:${text}`;
    const mk = (color, z) => {
      const m = createTextLabel(text, { height: o.cap ?? 1, fontSize: T.px, font: T.font, weight: T.weight, color, padding: 0.03, lit: true, castShadow: true, lineHeight: 1.0 });
      m.position.z = z; m.receiveShadow = true;
      m.material.roughness = 0.9;
      return m;
    };
    const top = o.top ?? 0.8;
    const front = mk(o.color ?? P.red, top);
    g.add(front);
    if (o.under) {
      const u = mk(o.under, top - 0.02);
      u.position.x = spec.misregister.offset[0]; u.position.y = spec.misregister.offset[1];
      u.castShadow = false;
      g.add(u);
    }
    g.userData.width = front.scale.x;
    return g;
  }

  // ---------------------------------------------------------------- one piece from a layout entry
  /**
   * piece(L) -> Group positioned at L.at, rotated L.angle (deg), with userData { L, inner, pivot }.
   *   L.shape: { type: "wedge"|"bar"|"disc"|"cone"|"wheel"|"block"|"word", ...dims }, L.material, L.z (top height),
   *   L.dowels: [[x, y]] local dowel spots (default: one at the shape's middle), L.under (misregistered copy).
   */
  function piece(L) {
    const outer = new THREE.Group(); outer.name = L.id;
    outer.position.set(L.at[0], L.at[1], 0);
    outer.rotation.z = deg(L.angle ?? 0);
    const pivot = new THREE.Group(); outer.add(pivot);
    const inner = new THREE.Group(); pivot.add(inner);
    const S = L.shape, top = L.z ?? 0.3, mat = materials[L.material ?? "black"];
    let mid = [0, 0];
    if (S.type === "wheel") inner.add(wheel({ r: S.r, material: L.material, top }));
    else if (S.type === "word") inner.add(word(S.text, { cap: S.cap, color: S.color ? P[S.color] ?? S.color : P.red, under: S.under ? P[S.under] ?? S.under : null, top }));
    else if (S.type === "block") {
      const box = new THREE.BoxGeometry(S.w, S.h, C.thickness * 1.6);
      box.translate(0, 0, top - C.thickness * 0.8);
      const face = new THREE.MeshStandardMaterial({ map: blockTexture(S.text, S.w, S.h, { bg: P[S.bg ?? "black"], ink: P[S.ink ?? "paper"], under: S.under ? P[S.under] : null }), roughness: 0.85 });
      face.name = `face:${S.text}`;
      const side = materials[S.bg ?? "black"];
      const m = new THREE.Mesh(box, [side, side, side, side, face, side]);
      m.castShadow = m.receiveShadow = true;
      inner.add(m);
    } else {
      const shape = shapes[S.type](S);
      inner.add(slab(shape, mat, top));
      if (S.type === "wedge") mid = [S.len * 0.33, 0];
      if (S.type === "cone") mid = [S.len * 0.5, 0];
      if (L.under) {
        const u = slab(shape, materials[L.under], top - C.thickness - 0.005, 0.03);
        u.position.x = spec.misregister.offset[0] * (L.underScale ?? 1); u.position.y = spec.misregister.offset[1] * (L.underScale ?? 1);
        inner.add(u);
      }
    }
    if (S.type !== "word" && top > C.thickness + 0.02) for (const d of L.dowels ?? [mid]) inner.add(dowel(d[0], d[1], top - (S.type === "block" ? C.thickness * 0.6 : 0)));
    // hinge: the pivot sits on the hinge edge (local x = L.hinge.x), the content is shifted back so the rest pose is unchanged
    // (and at the card's own height, so an edge-on card stands on its hinge line instead of swinging from the board)
    const hz = L.hinge ? Math.max(0, top - C.thickness) : 0;
    if (L.hinge) { pivot.position.set(L.hinge.x, 0, hz); inner.position.set(-L.hinge.x, 0, -hz); }
    outer.userData = { L, inner, pivot, hz };
    return outer;
  }

  // ---------------------------------------------------------------- the whole poster
  /**
   * buildPoster(layout, plan) -> { group, sheet, pieces, update(t) } (adds itself to the scene)
   *   layout: [{ id, kind, shape, material, at:[x,y], angle (deg), z, slide?: { dist, dir? (deg) }, drop?: { lift, scale },
   *             hinge?: { x, closed (deg) }, roll?: { rail: { from:[x,y], angle }, offset, s0 }, throw?: { from:[x,y], scale0 },
   *             ray?: true, recoil?: { by, amp, dir (deg) } }]  — every timed piece has a plan entry with the same id.
   *   update(t): every piece posed from plan.u / plan.raw / plan.rollAt, plus the sheet shake from plan.shake(t).
   */
  function buildPoster(layout, plan) {
    const group = new THREE.Group(); group.name = "poster";
    const sheet = new THREE.Group(); sheet.name = "sheet"; group.add(sheet);
    sheet.add(board());
    const pieces = layout.map((L) => { const g = piece(L); sheet.add(g); return g; });
    stage.scene.add(group);

    function update(t) {
      const sh = plan.shake(t);
      sheet.position.set(sh.x, sh.y, 0);
      for (const g of pieces) {
        const { L, inner, pivot, hz } = g.userData;
        const p = plan.byId[L.id];
        g.position.set(L.at[0], L.at[1], 0);
        g.rotation.z = deg(L.angle ?? 0);
        inner.position.z = -hz; inner.scale.set(1, 1, 1); inner.rotation.set(0, 0, 0);
        inner.position.x = L.hinge ? -L.hinge.x : 0; inner.position.y = 0;
        pivot.rotation.set(0, 0, 0);
        if (!p) { g.visible = true; continue; }
        g.visible = t > p.start;
        const u = plan.u(L.id, t), r = plan.raw(L.id, t);
        if (L.kind === "slide") {
          const a = deg(L.slide.dir ?? L.angle ?? 0), d = L.slide.dist * (1 - u);
          g.position.x -= Math.cos(a) * d; g.position.y -= Math.sin(a) * d;
        } else if (L.kind === "drop") {
          inner.position.z = L.drop.lift * (1 - u);
          const s = lerp(L.drop.scale ?? 1, 1, clamp(u, 0, 1.2));
          inner.scale.set(s, s, 1);
        } else if (L.kind === "hinge") {
          pivot.rotation.y = deg(L.hinge.closed) * (1 - u);
        } else if (L.kind === "roll") {
          const R = L.roll, ra = deg(R.rail.angle), ro = plan.rollAt(L.id, t);
          const s = R.s0 + ro.s, n = [-Math.sin(ra), Math.cos(ra)];
          g.position.set(R.rail.from[0] + Math.cos(ra) * s + n[0] * R.offset, R.rail.from[1] + Math.sin(ra) * s + n[1] * R.offset, 0);
          inner.rotation.z = ro.angle;
        } else if (L.kind === "throw") {
          const f = L.throw.from, k = clamp(u, 0, 1.1);
          g.position.set(lerp(f[0], L.at[0], k), lerp(f[1], L.at[1], k), 0);
          const s = lerp(L.throw.scale0 ?? 0.15, 1, u);
          inner.scale.set(s, s, 1);
        } else if (L.kind === "ray") {
          inner.scale.set(Math.max(0.001, u), 1, 1);
        }
        if (L.recoil) { // knocked by another piece's hit: a jolt along a direction
          const q = plan.byId[L.recoil.by], j = construct.jolt(t, q.hit, L.recoil.amp, { period: 0.13, decay: 0.08 }), a = deg(L.recoil.dir);
          g.position.x += Math.cos(a) * j; g.position.y += Math.sin(a) * j;
        }
      }
    }
    update(0);
    return { group, sheet, pieces, update };
  }

  // ---------------------------------------------------------------- overlay caption
  /** caption() -> overlay slab (black, red tab, cream condensed caps), top centre; userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1100, Hp = Q.h + 20;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.25}px ${Q.font}`;
      if ("letterSpacing" in x) x.letterSpacing = "2px";
      const tw = Math.round(x.measureText(st.text).width);
      const tab = Math.round(Q.h * 0.42), pad = Math.round(Q.cap * 0.55);
      const pw = Math.min(W - 16, tab + pad + tw + pad), ph = Q.h, ox = Math.round((W - pw) / 2), oy = 4;
      x.fillStyle = "rgba(26,23,21,0.25)"; x.fillRect(ox + 8, oy + 8, pw, ph);           // hard print shadow
      x.fillStyle = Q.plate; x.fillRect(ox, oy, pw, ph);
      x.fillStyle = Q.tab; x.fillRect(ox, oy, tab, ph);
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + tab + pad, oy + Math.round(ph / 2) + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { board, slab, dowel, wheel, word, piece, buildPoster, caption };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    shapes, plan: construct, motion: construct,
  };
}
