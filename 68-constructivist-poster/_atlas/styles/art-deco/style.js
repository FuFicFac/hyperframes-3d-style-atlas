// styles/art-deco/style.js — "Art Deco": symmetric unfolding and stepped ascent. The look lives in spec.js; WHEN every
// piece unfolds lives in deco.js (THREE-free planner shared with SCORE). This file turns a plan into pictures:
// a marble wall with bronze-and-lacquer elevator doors (canvas-inlaid fan), a folding-fan gold sunburst over a stepped
// marble plinth, a telescoping ziggurat tower (merged static detail per tier: fluting, glowing window bays, chevron
// parapets, setback ledges), mirrored wings, a spire, crown ornaments in mirrored pairs, two mirrored searchlight beams,
// a framed title panel, an inlaid marble floor and an overlay caption chip (exact colours).
// Everything is built mirrored about x = 0 (left parts are built with a sign, never with a negative scale).
// Props never animate themselves: the scene calls update(t).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { makeCanvas, canvasTexture } from "../../kit/textures.js";
import { clamp } from "../../kit/time.js";
import * as deco from "./deco.js";
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
  const TY = spec.type;

  // ---------------------------------------------------------------- merged static geometry, one mesh per material
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  function acc() {
    const parts = {};
    const api = {
      add(mat, geo, x = 0, y = 0, z = 0, ry = 0, rz = 0, rx = 0) {
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
        g.clearGroups();
        _e.set(rx, ry, rz); _q.setFromEuler(_e); _v.set(x, y, z);
        g.applyMatrix4(_m.compose(_v, _q, _one));
        (parts[mat] ??= []).push(g);
        return api;
      },
      box(mat, w, h, d, x, y, z, ry = 0, rz = 0) { return api.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, ry, rz); },
      build(group, { cast = true, receive = true } = {}) {
        for (const [k, list] of Object.entries(parts)) {
          const mesh = new THREE.Mesh(mergeGeometries(list, false), materials[k]);
          mesh.castShadow = cast; mesh.receiveShadow = receive; mesh.name = k;
          group.add(mesh);
        }
        return group;
      },
    };
    return api;
  }

  /** a flat wedge (fan ray) pointing +y from r0 to r1, half-angles a0 (inner) / a1 (outer), extruded `depth` toward +z */
  function wedgeGeometry(r0, r1, a0, a1, depth, stepped = true) {
    const s = new THREE.Shape();
    const x0 = Math.tan(a0) * r0, x1 = Math.tan(a1) * r1;
    s.moveTo(-x0, r0); s.lineTo(x0, r0); s.lineTo(x1, r1 * (stepped ? 0.97 : 1));
    if (stepped) { s.lineTo(x1 * 0.55, r1 * 0.985); s.lineTo(x1 * 0.55, r1); s.lineTo(-x1 * 0.55, r1); s.lineTo(-x1 * 0.55, r1 * 0.985); }
    s.lineTo(-x1, r1 * (stepped ? 0.97 : 1)); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 });
  }
  /** a fan sector from angle b0 to b1 (rad, from +x), radius r, extruded depth; segments n */
  function sectorGeometry(r, b0, b1, depth, n = 24, rIn = 0) {
    const s = new THREE.Shape();
    s.moveTo(Math.cos(b0) * rIn, Math.sin(b0) * rIn);
    for (let i = 0; i <= n; i++) { const b = b0 + ((b1 - b0) * i) / n; s.lineTo(Math.cos(b) * r, Math.sin(b) * r); }
    if (rIn > 0) for (let i = n; i >= 0; i--) { const b = b0 + ((b1 - b0) * i) / n; s.lineTo(Math.cos(b) * rIn, Math.sin(b) * rIn); }
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 });
  }
  /** a chevron "^" of two bars, centre (x, y), arm length L, bar t, on the z plane */
  function chevron(A, mat, x, y, z, L, t, d = 0.05, ang = 0.72) {
    const dx = (Math.cos(ang) * L) / 2, dy = (Math.sin(ang) * L) / 2;
    A.box(mat, L, t, d, x - dx, y - dy, z, 0, ang);
    A.box(mat, L, t, d, x + dx, y - dy, z, 0, -ang);
  }

  // ---------------------------------------------------------------- canvases
  /** paint(ctx, W, H) on a CPU canvas -> sRGB CanvasTexture */
  function canvasTex(W, H, paint, o = {}) {
    const c = makeCanvas(W, H);
    const x = c.getContext("2d");
    paint(x, W, H);
    const tex = canvasTexture(c, { anisotropy: 8 });
    if (o.repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(o.repeat[0], o.repeat[1]); }
    return tex;
  }
  /** sunray emblem: half-fan of n rays + rings, centre (cx, cy), radius r, upward */
  function paintFan(x, cx, cy, r, n, col, lw) {
    x.strokeStyle = col; x.fillStyle = col; x.lineWidth = lw; x.lineCap = "butt";
    for (const k of [0.36, 0.72, 1]) { x.beginPath(); x.arc(cx, cy, r * k, Math.PI, 2 * Math.PI); x.stroke(); }
    for (let i = 0; i <= n; i++) {
      const a = Math.PI + (Math.PI * i) / n;
      x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 0.36, cy + Math.sin(a) * r * 0.36); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); x.stroke();
    }
    x.beginPath(); x.arc(cx, cy, r * 0.26, Math.PI, 2 * Math.PI); x.closePath(); x.fill();
  }

  // ---------------------------------------------------------------- floor + plinth
  /** floor() -> cream marble plaza with gold inlay lines and jade lozenges (canvas tile, 4 m) */
  function floor(o = {}) {
    const size = o.size ?? spec.floor.size, cell = 4;
    const tex = canvasTex(512, 512, (x, W, H) => {
      x.fillStyle = P.marble; x.fillRect(0, 0, W, H);
      // soft veining
      x.strokeStyle = "rgba(170,150,115,0.16)"; x.lineWidth = 3;
      for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(0, 60 + i * 80); x.bezierCurveTo(160, 20 + i * 90, 340, 120 + i * 70, W, 70 + i * 80); x.stroke(); }
      x.fillStyle = P.marbleShade; x.fillRect(0, 0, W, 10); x.fillRect(0, 0, 10, H);
      x.fillStyle = P.gold; x.fillRect(0, 3, W, 4); x.fillRect(3, 0, 4, H);
      x.fillStyle = P.jade; x.beginPath(); x.moveTo(0, -46); x.lineTo(46, 0); x.lineTo(0, 46); x.lineTo(-46, 0); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(W, H - 46); x.lineTo(W + 46, H); x.lineTo(W, H + 46); x.lineTo(W - 46, H); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(W, -46); x.lineTo(W + 46, 0); x.lineTo(W, 46); x.lineTo(W - 46, 0); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(0, H - 46); x.lineTo(46, H); x.lineTo(0, H + 46); x.lineTo(-46, H); x.closePath(); x.fill();
    }, { repeat: [size / cell, size / cell] });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0, o.z ?? spec.floor.z); m.receiveShadow = true; m.name = "floor";
    return m;
  }
  /** plinth() -> long stepped marble band across the back (the "horizon" the sun rises over), gold trim on each step */
  function plinth() {
    const S = spec.plinth, g = new THREE.Group(), A = acc();
    for (const [h, back] of S.steps) {
      A.box("marble", S.width, h, 1.2, 0, h / 2, S.z - back);
      A.box("gold", S.width, 0.07, 0.04, 0, h - 0.06, S.z - back + 0.62);
    }
    A.build(g); g.name = "plinth";
    return g;
  }

  // ---------------------------------------------------------------- sunburst (folding fan)
  /** sunburst(plan) -> Group; userData.update(t) sets every ray's angle from plan.rayAngle(i, t) */
  function sunburst(plan) {
    const S = spec.sunburst, g = new THREE.Group(); g.name = "sunburst";
    g.position.set(...S.center);
    const slot = plan.fan.slot, rays = [];
    const gGeo = wedgeGeometry(S.inner, S.outer, slot * 0.5 * 0.5, slot * 0.5 * 0.78, S.depth);
    const cGeo = wedgeGeometry(S.inner + 0.6, S.outer * 0.86, slot * 0.5 * 0.42, slot * 0.5 * 0.62, S.depth);
    for (const r of plan.fan.rays) {
      const m = new THREE.Mesh(r.j % 2 ? cGeo : gGeo, r.j % 2 ? materials.rayCream : materials.goldRay);
      m.position.z = -r.j * 0.04;           // outer blades sit behind inner ones: a closed fan shows its front blade
      m.castShadow = false; m.receiveShadow = true;
      g.add(m); rays.push(m);
    }
    // the sun: glowing disc + stepped gold rings (in front of the blades)
    const sun = new THREE.Mesh(new THREE.CircleGeometry(S.sunRadius, 64), materials.sun);
    sun.position.z = 0.32; g.add(sun);
    for (const [k, rr] of [[0, 1.04], [1, 1.16], [2, 1.3]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(S.sunRadius * rr, S.sunRadius * rr + 0.12 - k * 0.02, 64), materials.gold);
      ring.position.z = 0.3 - k * 0.02; g.add(ring);
    }
    g.userData.update = (t) => { for (let i = 0; i < rays.length; i++) rays[i].rotation.z = plan.rayAngle(i, t) - Math.PI / 2; };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- doorway (wall + stepped frame + sliding doors)
  function doorCanvas() {
    const W = 1200, H = 1000, c = makeCanvas(W, H), x = c.getContext("2d");
    const gold = "#f0c868";
    const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#c08a4c"); gr.addColorStop(1, "#8f5f30");
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    for (const x0 of [0, 600]) {
      x.fillStyle = P.lacquer; x.fillRect(x0 + 44, 44, 512, 880);
      x.strokeStyle = gold; x.lineWidth = 6; x.strokeRect(x0 + 62, 62, 476, 844);
    }
    x.save(); x.beginPath(); x.rect(44, 44, 512, 880); x.rect(644, 44, 512, 880); x.clip();
    paintFan(x, 600, 470, 400, 16, gold, 13);
    x.lineWidth = 9; x.strokeStyle = gold;
    for (const x0 of [0, 600]) {
      for (const dx of [140, 460]) { x.beginPath(); x.moveTo(x0 + dx, 500); x.lineTo(x0 + dx, 880); x.stroke(); }
      for (let k = 0; k < 4; k++) {
        const y = 650 + k * 62; x.beginPath(); x.moveTo(x0 + 180, y + 50); x.lineTo(x0 + 300, y); x.lineTo(x0 + 420, y + 50); x.stroke();
      }
    }
    x.restore();
    x.fillStyle = "#d39a58"; x.fillRect(0, 936, W, 64);
    x.fillStyle = "#3a2410"; x.fillRect(597, 0, 6, H);
    const leaf = (sx) => { const cc = makeCanvas(600, H); cc.getContext("2d").drawImage(c, sx, 0, 600, H, 0, 0, 600, H); return canvasTexture(cc, { anisotropy: 8 }); };
    return [leaf(0), leaf(600)];
  }
  /** doorway() -> Group; userData.update(t, visible): leaves slide apart by plan.doorOpen(t) */
  function doorway(plan) {
    const D = spec.doors, g = new THREE.Group(); g.name = "doorway";
    const [ow, oh] = D.opening, T = D.wallThickness, z = D.z, zf = z + T / 2;
    const [WW, WH] = D.wallSize, A = acc();
    const sideW = WW / 2 - ow / 2;
    A.box("marble", sideW, WH, T, -(ow / 2 + sideW / 2), WH / 2, z);
    A.box("marble", sideW, WH, T, ow / 2 + sideW / 2, WH / 2, z);
    A.box("marble", ow, WH - oh, T, 0, oh + (WH - oh) / 2, z);
    // lacquer dado + gold trim along the wall foot
    A.box("lacquer", WW, 0.55, 0.06, 0, 0.275, zf + 0.03);
    A.box("gold", WW, 0.06, 0.08, 0, 0.58, zf + 0.04);
    // stepped keystone frame around the opening (each step further out and proud)
    for (let s = 0; s < D.frame.steps; s++) {
      const off = 0.1 + s * D.frame.step, bw = 0.17, dz = 0.06 + s * 0.06;
      for (const sg of [-1, 1]) A.box("gold", bw, oh + off, dz, sg * (ow / 2 + off), (oh + off) / 2, zf + dz / 2);
      A.box("gold", ow + 2 * off + bw, bw, dz, 0, oh + off, zf + dz / 2);
    }
    const ft = oh + 0.1 + (D.frame.steps - 1) * D.frame.step;
    [[2.0, 0.22], [1.3, 0.22], [0.7, 0.22]].forEach(([w, h], i) => A.box("gold", w, h, 0.2, 0, ft + 0.1 + h / 2 + i * h, zf + 0.1));
    // jade pilasters with gold fluting, mirrored
    for (const sg of [-1, 1]) {
      const px = sg * (ow / 2 + 1.75);
      A.box("jade", 0.95, 6.2, 0.16, px, 3.1, zf + 0.08);
      for (const dx of [-0.28, 0, 0.28]) A.add("gold", new THREE.CylinderGeometry(0.045, 0.045, 5.6, 10), px + dx, 3.1, zf + 0.18);
      A.box("gold", 1.15, 0.18, 0.26, px, 6.25, zf + 0.12);
      A.box("gold", 1.15, 0.12, 0.26, px, 0.66, zf + 0.12);
      // little sunray fan atop each pilaster
      A.add("gold", sectorGeometry(0.62, 0, Math.PI, 0.08, 18, 0.18), px, 6.34, zf + 0.12);
    }
    // transom fan over the doorway (above the keystone)
    A.add("jade", sectorGeometry(1.5, 0, Math.PI, 0.06, 32), 0, ft + 0.85, zf + 0.04);
    for (let i = 0; i <= 8; i++) {
      const a = (Math.PI * i) / 8;
      A.box("gold", 1.2, 0.05, 0.08, Math.cos(a) * 0.85, ft + 0.85 + Math.sin(a) * 0.85, zf + 0.1, 0, a);
    }
    A.build(g);
    // the two leaves: bronze boxes with the inlaid lacquer face (front face carries the canvas)
    const [tl, tr] = doorCanvas();
    const leaves = [tl, tr].map((tex, i) => {
      const face = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: "#ffffff", emissiveIntensity: 0.12, metalness: 0.55, roughness: 0.3 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(ow / 2, oh, D.leafThickness), [materials.bronze, materials.bronze, materials.bronze, materials.bronze, face, materials.bronze]);
      m.castShadow = true; m.receiveShadow = true; m.name = i ? "doorR" : "doorL";
      g.add(m);
      return m;
    });
    g.userData.update = (t, visible = true) => {
      g.visible = visible;
      const u = plan.doorOpen(t);
      leaves[0].position.set(-ow / 4 - u * D.slide, oh / 2, z);
      leaves[1].position.set(ow / 4 + u * D.slide, oh / 2, z);
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- the tower
  const TW = spec.tower;
  const tierBase = []; { let y = 0; for (const tr of TW.tiers) { tierBase.push(y); y += tr.h + TW.cap; } tierBase.push(y); }
  const tierTop = (k) => tierBase[k + 1];

  /** window bays + fluting on one face. face: "front" | "left" | "right"; faceW = width along the face */
  function faceBays(A, w, h, d, face, nb, o = {}) {
    const margin = Math.min(0.5, w * 0.08), usable = w - 2 * margin, p = usable / nb;
    const ry = face === "front" ? 0 : face === "right" ? Math.PI / 2 : -Math.PI / 2;
    const out = face === "front" ? d / 2 : o.half;   // distance of the face plane from the tier axis
    const place = (u, y, off) => {   // u along the face (left->right as seen from outside), off = outward
      if (face === "front") return [u, y, out + off];
      if (face === "right") return [out + off, y, -u];
      return [-(out + off), y, u];
    };
    const stripH = h * 0.74, yc = h * 0.47;
    for (let i = 0; i < nb; i++) {
      const u = -usable / 2 + p * (i + 0.5);
      if (o.skip === i) continue;
      const sw = p * 0.6;
      let [x, y, z] = place(u, yc, 0.025); A.box("lacquer", sw, stripH, 0.05, x, y, z, ry);
      const rows = Math.max(2, Math.floor(stripH / 0.5)), gap = 0.09, ph = (stripH - (rows + 1) * gap) / rows;
      for (let r = 0; r < rows; r++) {
        const yy = yc - stripH / 2 + gap + ph / 2 + r * (ph + gap);
        [x, y, z] = place(u, yy, 0.06); A.box("glass", sw - 0.16, ph, 0.03, x, y, z, ry);
      }
    }
    for (let i = 0; i <= nb; i++) {
      const u = -usable / 2 + p * i;
      const [x, y, z] = place(u, yc, TW.flute * 0.7);
      A.add("gold", new THREE.CylinderGeometry(TW.flute, TW.flute, h * 0.8, 10), x, y, z);
    }
  }

  /** tier({ w, h, d, bays, entrance, chevrons }) -> Group with its base at y = 0 (static detail merged per material) */
  function tier(tr, o = {}) {
    const g = new THREE.Group(), A = acc();
    const { w, h, d } = tr, cap = TW.cap, ov = TW.capOver;
    A.box("marble", w, h, d, 0, h / 2, 0);
    faceBays(A, w, h, d, "front", tr.bays, { skip: o.entrance ? Math.floor(tr.bays / 2) : -1 });
    const sideBays = Math.max(1, Math.round(d / 1.5));
    faceBays(A, d, h, d, "right", sideBays, { half: w / 2 });
    faceBays(A, d, h, d, "left", sideBays, { half: w / 2 });
    // setback ledge: gold trim + marble cap + a jade line
    A.box("gold", w + 0.05, 0.08, d + 0.05, 0, h - 0.05, 0);
    A.box("marble", w + 2 * ov, cap, d + 2 * ov, 0, h + cap / 2, 0);
    A.box("jade", w + 2 * ov + 0.02, 0.05, d + 2 * ov + 0.02, 0, h + cap * 0.35, 0);
    // chevron parapet row under the ledge (front)
    if (o.chevrons !== false) {
      const n = Math.max(3, Math.round((w - 0.6) / 0.62)), span = w - 0.6;
      for (let i = 0; i < n; i++) chevron(A, "gold", -span / 2 + (span * (i + 0.5)) / n, h - 0.24, d / 2 + 0.03, 0.26, 0.055);
    }
    if (o.entrance) {
      const ew = 1.5, eh = Math.min(2.0, h * 0.72);
      A.box("lacquer", ew, eh, 0.08, 0, eh / 2, d / 2 + 0.04);
      A.box("glass", ew - 0.3, eh * 0.38, 0.04, 0, eh * 0.62, d / 2 + 0.09);
      for (let s = 0; s < 3; s++) {
        const off = 0.08 + s * 0.14, dz = 0.1 + s * 0.05;
        for (const sg of [-1, 1]) A.box("gold", 0.09, eh + off, dz, sg * (ew / 2 + off), (eh + off) / 2, d / 2 + dz / 2);
        A.box("gold", ew + 2 * off + 0.09, 0.09, dz, 0, eh + off, d / 2 + dz / 2);
      }
      A.add("gold", sectorGeometry(0.55, 0, Math.PI, 0.06, 18, 0.12), 0, eh + 0.55, d / 2 + 0.06);
    }
    A.build(g);
    return g;
  }

  /** spire() -> Group (base at y = 0): stepped gold base, needle, rings */
  function spire() {
    const S = TW.spire, g = new THREE.Group(), A = acc();
    [[1.3, 0.24], [0.95, 0.26], [0.62, 0.3]].reduce((y, [w, h]) => { A.box("gold", w, h, w, 0, y + h / 2, 0); return y + h; }, 0);
    A.add("gold", new THREE.ConeGeometry(S.r, S.h - 0.8, 16), 0, 0.8 + (S.h - 0.8) / 2, 0);
    for (const [y, r] of [[1.15, 0.36], [1.55, 0.3], [1.95, 0.24]]) A.add("gold", new THREE.CylinderGeometry(r, r, 0.07, 16), 0, y, 0);
    A.add("glass", new THREE.SphereGeometry(0.14, 16, 12), 0, 1.1 + 0.0, 0);
    A.build(g); g.name = "spire";
    return g;
  }

  // ---------------------------------------------------------------- crown ornaments (mirrored pairs; sign s = -1 | 1)
  // each returns a Group positioned at its slot; update(u) moves it in from its entry pose (u 0 -> 1, clamped)
  function ornament(build, entry) {
    const g = new THREE.Group(), A = acc(); build(A); A.build(g, { cast: false });
    g.userData.entry = entry; return g;
  }
  /** crown(plan) -> { group, update(t) } — every ornament of plan.ornaments, mirrored */
  function crown(plan) {
    const group = new THREE.Group(); group.name = "crown";
    const Z = TW.z, tiers = TW.tiers, items = [];
    const add = (id, g, slot, entry) => { g.position.set(...slot); g.userData.slot = slot; g.userData.entry = entry; g.userData.id = id; group.add(g); items.push(g); };
    for (const s of [-1, 1]) {
      // finials: stepped gold pyramids on tier-2 front roof corners, drop from above
      { const t2 = tiers[2];
        add("finials", ornament((A) => { [[0.5, 0.3], [0.36, 0.3], [0.22, 0.3]].reduce((y, [w, h]) => { A.box("gold", w, h, w, 0, y + h / 2, 0); return y + h; }, 0); A.add("glass", new THREE.SphereGeometry(0.11, 12, 8), 0, 1.0, 0); }),
          [s * (t2.w / 2 - 0.2), tierTop(2), Z + t2.d / 2 - 0.2], { dy: 2.6 }); }
      // chevron fins standing on tier-3 roof beside tier 4, slide in from outside
      { const t3 = tiers[3], t4 = tiers[4], x = s * (t4.w / 2 + (t3.w - t4.w) / 4 + 0.05);
        add("chevrons", ornament((A) => { A.box("jade", 0.62, 1.15, 0.08, 0, 0.58, -0.05); for (let k = 0; k < 4; k++) chevron(A, "gold", 0, 0.32 + k * 0.24, 0.02, 0.36, 0.07, 0.07); A.box("gold", 0.7, 0.08, 0.14, 0, 1.18, 0); }),
          [x, tierTop(3), Z + t3.d / 2 - 0.12], { dx: s * 2.6 }); }
      // sunray fans: quarter fans springing outward from tier-3 roof corners (widen the crown silhouette)
      { const t3 = tiers[3];
        add("sunfans", ornament((A) => {
          const b0 = s > 0 ? 0.12 : Math.PI / 2, b1 = s > 0 ? Math.PI / 2 : Math.PI - 0.12;
          A.add("jade", sectorGeometry(1.75, b0, b1, 0.05, 20, 0.3), 0, 0, -0.04);
          for (let i = 0; i <= 5; i++) { const b = b0 + ((b1 - b0) * i) / 5; A.box("gold", 1.5, 0.08, 0.1, Math.cos(b) * 1.05, Math.sin(b) * 1.05, 0.03, 0, b); }
          A.add("gold", sectorGeometry(0.34, b0 - 0.1, b1 + 0.1, 0.12, 10), 0, 0, 0);
        }), [s * (t3.w / 2 + 0.05), tierTop(3) - 0.02, Z + t3.d / 2 - 0.1], { grow: true, rz: -s * 0.9 }); }
      // scallop shells on tier-4 front, swing in
      { const t4 = tiers[4];
        add("scallops", ornament((A) => {
          A.add("gold", sectorGeometry(0.52, 0, Math.PI, 0.06, 24), 0, 0, 0);
          for (let i = 1; i < 7; i++) { const b = (Math.PI * i) / 7; A.box("goldRay", 0.42, 0.035, 0.08, Math.cos(b) * 0.27, Math.sin(b) * 0.27, 0.05, 0, b); }
          A.box("gold", 0.62, 0.08, 0.1, 0, -0.03, 0.03);
        }), [s * (t4.w / 2 - 0.62), tierBase[4] + t4.h * 0.58, Z + t4.d / 2 + 0.03], { grow: true, rz: s * Math.PI }); }
      // stepped keystone frame around tier-4's window, halves slide together
      { const t4 = tiers[4], top = t4.h * 0.9, xo = 0.85;
        add("keystone", ornament((A) => {
          const bw = 0.11, d = 0.12;
          A.box("gold", bw, top - 0.35, d, s * xo, 0.12 + (top - 0.35) / 2, 0);
          const steps = [[xo, 0.52, top - 0.3], [0.52, 0.26, top - 0.15], [0.26, 0, top]];
          for (const [a, b, y] of steps) {
            A.box("gold", Math.abs(a - b) + bw, bw, d, s * (a + b) / 2, y, 0);
            A.box("gold", bw, 0.15 + bw, d, s * b, y - 0.075, 0);
          }
        }), [0, tierBase[4], Z + t4.d / 2 + 0.07], { dx: s * 1.6 }); }
      // jade crest (half sunburst behind the spire base), each half unfolds out from the centre line
      { const t4 = tiers[4];
        add("crest", ornament((A) => {
          const b0 = s > 0 ? 0 : Math.PI / 2, b1 = s > 0 ? Math.PI / 2 : Math.PI;
          A.add("jade", sectorGeometry(1.35, b0, b1, 0.08, 16), 0, 0, 0);
          for (let i = 0; i <= 4; i++) { const b = b0 + ((b1 - b0) * i) / 4; A.box("gold", 1.05, 0.06, 0.12, Math.cos(b) * 0.75, Math.sin(b) * 0.75, 0.05, 0, b); }
          A.add("gold", sectorGeometry(1.42, b0, b1, 0.1, 16, 1.3), 0, 0, 0.02);
        }), [0, tierTop(4) - 0.02, Z + t4.d / 2 - 0.35], { rz: -s * Math.PI / 2 }); }
    }
    stage.scene.add(group);
    return {
      group,
      update(t) {
        for (const g of items) {
          const u = Math.min(1, plan.ornamentU(g.userData.id, t)), on = plan.ornamentOn(g.userData.id, t);
          g.visible = on;
          const [x, y, z] = g.userData.slot, E = g.userData.entry;
          g.position.set(x + (E.dx ?? 0) * (1 - u), y + (E.dy ?? 0) * (1 - u), z);
          g.rotation.z = (E.rz ?? 0) * (1 - u);
          const sc = E.grow ? Math.max(0.001, u) : 1;
          g.scale.set(sc, sc, 1);
        }
      },
    };
  }

  /** tower(plan) -> { group, tiers, wings, spire, update(t) } — telescoping ziggurat + mirrored wings + spire */
  function tower(plan) {
    const group = new THREE.Group(); group.name = "tower";
    const Z = TW.z;
    const tiers = TW.tiers.map((tr, k) => {
      const g = tier(tr, { entrance: k === 0 });
      g.position.set(0, tierBase[k], Z); g.name = `tier${k}`; group.add(g);
      return g;
    });
    const WG = TW.wings, wings = [];
    for (const s of [-1, 1]) {
      let y = 0;
      WG.tiers.forEach(([w, h], k) => {
        const g = tier({ w, h, d: WG.d - k * 0.8, bays: k ? 2 : 3 }, {});
        const x = s * (TW.tiers[0].w / 2 + WG.gap + WG.w / 2);
        g.position.set(x, y, Z - 0.4); g.userData.base = y; g.userData.h = h; g.userData.k = k; g.name = `wing${s}${k}`;
        group.add(g); wings.push(g);
        y += h + TW.cap;
      });
    }
    const sp = spire(); sp.position.set(0, tierTop(4), Z); group.add(sp);
    stage.scene.add(group);
    return {
      group, tiers, wings, spire: sp, tierBase, tierTop,
      update(t) {
        tiers.forEach((g, k) => {
          const u = Math.min(1, plan.tierRise(k, t));
          g.visible = plan.tierOn(k, t);
          g.position.y = tierBase[k] - (1 - u) * (TW.tiers[k].h + TW.cap);   // telescopes out of the tier below
        });
        for (const g of wings) {
          const k = g.userData.k, u = Math.min(1, plan.tierRise(k, t));
          g.visible = plan.tierOn(k, t);
          g.position.y = g.userData.base - (1 - u) * (g.userData.h + TW.cap);
        }
        const su = plan.spireU(t);
        sp.visible = su > 0.001;
        sp.scale.set(1, Math.max(0.001, su), 1);
      },
    };
  }

  // ---------------------------------------------------------------- searchlights (mirrored additive beams)
  function beamMaterial(o = {}) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(o.color ?? "#fff4dc") }, uLevel: { value: 0 }, uOpacity: { value: o.opacity ?? 0.3 } },
      vertexShader: `varying float vH; varying float vF;
        void main(){ vH = clamp(uv.y, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normal); vec3 v = normalize(-mv.xyz + vec3(1e-6)); vF = abs(dot(n, v));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uLevel; uniform float uOpacity; varying float vH; varying float vF;
        void main(){ float a = uLevel * uOpacity * pow(max(vH, 0.0), 1.3) * smoothstep(0.05, 0.75, vF);
          gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0)); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
  }
  /** searchlights(plan) -> { group, update(t) }: two cone beams at x = ±S.x leaning in mirror image */
  function searchlights(plan) {
    const S = spec.searchlight, group = new THREE.Group(); group.name = "searchlights";
    const geo = new THREE.CylinderGeometry(0.22, S.radius, S.length, 32, 1, true);   // uv.y: 0 at the far (wide) end
    geo.translate(0, S.length / 2, 0);
    // CylinderGeometry uv.y runs 1 (top) -> 0 (bottom): we want brightness near the lamp, so flip
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const beams = [-1, 1].map((s) => {
      const pivot = new THREE.Group(); pivot.position.set(s * S.x, 0.4, S.z);
      const m = new THREE.Mesh(geo, beamMaterial({ opacity: S.opacity })); m.renderOrder = 3; m.userData.noDepth = true;
      pivot.add(m); group.add(pivot);
      return { s, pivot, m };
    });
    stage.scene.add(group);
    return {
      group,
      update(t) {
        const lv = plan.lightLevel(t), a = plan.lightAngle(t);
        for (const b of beams) {
          b.pivot.rotation.z = b.s * a;           // right beam (s = 1) leans toward -x by a; left mirrors it
          b.m.material.uniforms.uLevel.value = lv;
          b.pivot.visible = lv > 0.001;
        }
      },
    };
  }

  // ---------------------------------------------------------------- title panel
  /** panel(plan, { title, sub }) -> { group, update(t) }: stepped gold frame unfolds from the centre, lettering fades in */
  function panel(plan, o = {}) {
    const S = spec.panel, g = new THREE.Group(); g.name = "panel";
    g.position.set(0, S.y, S.z);
    const W = S.w, H = S.h;
    const field = canvasTex(2048, Math.round((2048 * H) / W), (x, cw, ch) => {
      const gr = x.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0, "#1d7b72"); gr.addColorStop(1, "#11514b");
      x.fillStyle = gr; x.fillRect(0, 0, cw, ch);
      x.strokeStyle = "#f0c868"; x.lineWidth = 6;
      const m = 34, st = 26;
      x.beginPath(); x.moveTo(m + st, m); x.lineTo(cw - m - st, m); x.lineTo(cw - m - st, m + st); x.lineTo(cw - m, m + st);
      x.lineTo(cw - m, ch - m - st); x.lineTo(cw - m - st, ch - m - st); x.lineTo(cw - m - st, ch - m); x.lineTo(m + st, ch - m);
      x.lineTo(m + st, ch - m - st); x.lineTo(m, ch - m - st); x.lineTo(m, m + st); x.lineTo(m + st, m + st); x.closePath(); x.stroke();
      // mirrored sunray emblems at both ends
      for (const cx of [190, cw - 190]) paintFan(x, cx, ch * 0.66, 120, 10, "#f0c868", 7);
    });
    const fieldMat = new THREE.MeshStandardMaterial({ map: field, emissiveMap: field, emissive: "#ffffff", emissiveIntensity: 0.12, roughness: 0.35, metalness: 0 });
    const fieldMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), fieldMat);
    fieldMesh.position.set(0, H / 2, 0.02); fieldMesh.receiveShadow = true; g.add(fieldMesh);
    // lettering on its own transparent plane (fades in after the frame)
    const txt = canvasTex(2048, Math.round((2048 * H) / W), (x, cw, ch) => {
      x.clearRect(0, 0, cw, ch);
      const cap = ch * 0.27;
      x.font = `700 ${Math.round(cap * 1.36)}px ${TY.display}`;
      x.letterSpacing = `${Math.round(cap * TY.tracking * 1.1)}px`;
      x.textAlign = "center"; x.textBaseline = "alphabetic";
      const tx = cw / 2 + Math.round(cap * TY.tracking * 0.55), ty = ch * 0.6;
      x.fillStyle = "rgba(10,40,36,0.55)"; x.fillText(o.title ?? "ART DECO", tx + 6, ty + 8);
      x.fillStyle = "#fbf3e2"; x.fillText(o.title ?? "ART DECO", tx, ty);
      x.fillStyle = "#f0c868"; x.fillRect(cw * 0.3, ch * 0.69, cw * 0.4, 6);
      const sc = ch * 0.06;
      x.font = `600 ${Math.round(sc * 1.36)}px ${TY.face}`;
      x.letterSpacing = `${Math.round(sc * 0.45)}px`;
      x.fillStyle = "#f0c868"; x.fillText(o.sub ?? "SYMMETRY  ·  TERRACES  ·  GOLD", cw / 2 + Math.round(sc * 0.25), ch * 0.84);
    });
    const txtMat = new THREE.MeshBasicMaterial({ map: txt, transparent: true, opacity: 0, depthWrite: false });
    const txtMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), txtMat);
    txtMesh.position.set(0, H / 2, 0.06); txtMesh.renderOrder = 2; g.add(txtMesh);
    // stepped frame halves (built per side, so each half scales out from x = 0)
    const halves = [-1, 1].map((s) => {
      const hg = new THREE.Group(), A = acc();
      for (let k = 0; k < S.steps; k++) {
        const off = 0.06 + k * S.step, bw = 0.14, d = 0.1 + k * 0.08, z = -0.02 - k * 0.03;
        A.box("gold", W / 2 + off, bw, d, s * (W / 4 + off / 2), -off, z);
        A.box("gold", W / 2 + off, bw, d, s * (W / 4 + off / 2), H + off, z);
        A.box("gold", bw, H + 2 * off + bw, d, s * (W / 2 + off), H / 2, z);
      }
      // keystone crest steps at top centre (each half carries its half)
      [[1.8, 0.2], [1.2, 0.2], [0.6, 0.22]].forEach(([w, h], i) => A.box("gold", w / 2, h, 0.22, s * w / 4, H + 0.06 + (S.steps - 1) * S.step + 0.12 + h / 2 + i * 0.2, 0));
      // lacquer back slab
      A.box("lacquer", W / 2 + 0.6, H + 0.9, 0.12, s * (W / 4 + 0.3), H / 2, -0.16);
      A.build(hg);
      g.add(hg);
      return hg;
    });
    // marble plinth under the panel (static)
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, S.y + 0.02, 1.1), materials.marble);
    base.position.set(0, -S.y / 2, -0.2); base.castShadow = base.receiveShadow = true; g.add(base);
    stage.scene.add(g);
    return {
      group: g,
      update(t) {
        const f = plan.panelFrame(t), a = plan.panelText(t);
        g.visible = f > 0.001;
        for (const hg of halves) hg.scale.set(Math.max(0.001, f), 1, 1);
        fieldMesh.scale.set(Math.max(0.001, f), 1, 1);
        txtMat.opacity = a; txtMesh.visible = a > 0.003;
        base.scale.set(Math.max(0.001, f), 1, 1);
      },
    };
  }

  // ---------------------------------------------------------------- overlay caption chip
  /** caption() -> overlay chip: lacquer plate, gold stepped double border, mirrored fan icons; userData.show(text, a) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1240, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `700 ${Math.round(Q.cap * 1.32)}px ${TY.face}`;
      x.letterSpacing = `${Math.round(Q.cap * TY.tracking)}px`;
      const tw = Math.round(x.measureText(st.text).width);
      const ic = Math.round(Q.h * 0.62), pad = Math.round(Q.cap * 0.75);
      const pw = Math.min(W - 16, pad + ic + pad + tw + pad + ic + pad), ph = Q.h, ox = Math.round((W - pw) / 2), oy = 8;
      const notch = (inset, n) => {
        const a = ox + inset, b = oy + inset, c = ox + pw - inset, d = oy + ph - inset;
        x.beginPath(); x.moveTo(a + n, b); x.lineTo(c - n, b); x.lineTo(c - n, b + n); x.lineTo(c, b + n); x.lineTo(c, d - n); x.lineTo(c - n, d - n);
        x.lineTo(c - n, d); x.lineTo(a + n, d); x.lineTo(a + n, d - n); x.lineTo(a, d - n); x.lineTo(a, b + n); x.lineTo(a + n, b + n); x.closePath();
      };
      x.fillStyle = "rgba(0,0,0,0.25)"; x.save(); x.translate(0, 6); notch(0, 14); x.fill(); x.restore();
      x.fillStyle = Q.plate; notch(0, 14); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 3; notch(6, 12); x.stroke();
      x.lineWidth = 1.5; notch(12, 9); x.stroke();
      for (const cx of [ox + pad + ic / 2, ox + pw - pad - ic / 2]) paintFan(x, cx, oy + ph * 0.7, ic * 0.5, 8, Q.edge, 3);
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "center";
      x.fillText(st.text, ox + pw / 2 + Math.round(Q.cap * TY.tracking * 0.5), oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  const props = { floor, plinth, sunburst, doorway, tier, spire, crown, tower, searchlights, panel, caption };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: deco, motion: deco, tierBase, tierTop,
  };
}
