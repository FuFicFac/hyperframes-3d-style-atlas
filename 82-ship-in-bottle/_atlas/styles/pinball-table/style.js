// styles/pinball-table/style.js — "Pinball Table": an electro-mechanical playfield seen from the player's end, glass off.
// Every look number lives in spec.js; every motion is planned by pinplan.js (pure). Props are synchronous and seeded and
// never animate themselves: time enters only through userData.set / update(...) calls the scene makes from renderAt
// with values the plan computes from t (ball position, flipper angles, lamp levels, kick pulses, reel rolls).
//
// Field-local frame inside the tilted `field` group: X = x (across), Y = h (up from the surface), Z = -v (up the table).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { makeCanvas, canvasTexture, woodTexture, blobTexture } from "../../kit/textures.js";
import { sweepGeometry } from "../../kit/paths.js";
import { screenCanvas } from "../../kit/overlay.js";
import { clamp, lerp, smoothstep, rng } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";
import * as pin from "./pinplan.js";
export { STYLE_SPEC };

const D2R = Math.PI / 180;
const V = (x, v, h = 0) => new THREE.Vector3(x, h, -v);
/** a 2D canvas pinned to the CPU rasterizer (deterministic text across page loads) */
function cpuCanvas(w, h) {
  const c = makeCanvas(w, h);
  const x = c.getContext("2d", { willReadFrequently: true });
  return { c, x };
}
function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fitFont(ctx, text, family, weight, px, maxW, minPx = 8) {
  let s = px;
  for (;;) {
    ctx.font = `${weight} ${Math.round(s)}px ${family}`;
    if (ctx.measureText(text).width <= maxW || s <= minPx) return Math.round(s);
    s *= 0.94;
  }
}
const hexMul = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c; };

// ------------------------------------------------------------------------------------------------ insert shapes
/**
 * shapePoints(def) -> closed polygon [[x, v], ...] centred on the insert's origin, unrotated (+v = up the table).
 * Shapes: circle, roundRect ([w, h]), chevron, arrow, triangle, star. Shared by the lamp meshes and the art's hole rings.
 */
export function shapePoints(def, grow = 1) {
  const s = (Array.isArray(def.size) ? def.size : [def.size, def.size]).map((q) => q * grow);
  const [w, h] = s, out = [];
  switch (def.shape) {
    case "roundRect": {
      const r = Math.min(w, h) * 0.32;
      const corners = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180], [w / 2 - r, -h / 2 + r, 270]];
      for (const [cx, cy, a0] of corners) for (let i = 0; i <= 6; i++) { const a = (a0 + i * 15) * D2R; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
      return out;
    }
    case "chevron": return [[0, h * 0.5], [w * 0.5, -h * 0.05], [w * 0.5, -h * 0.5], [0, -h * 0.05], [-w * 0.5, -h * 0.5], [-w * 0.5, -h * 0.05]];
    case "arrow": return [[0, h * 0.55], [w * 0.42, h * 0.08], [w * 0.16, h * 0.08], [w * 0.16, -h * 0.5], [-w * 0.16, -h * 0.5], [-w * 0.16, h * 0.08], [-w * 0.42, h * 0.08]];
    case "triangle": return [[0, h * 0.55], [w * 0.5, -h * 0.4], [-w * 0.5, -h * 0.4]];
    case "star": { for (let i = 0; i < 10; i++) { const a = (90 + i * 36) * D2R, rr = i % 2 ? w * 0.22 : w * 0.5; out.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return out; }
    default: { for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; out.push([Math.cos(a) * w / 2, Math.sin(a) * w / 2]); } return out; }
  }
}
const rot2 = (p, deg) => { const a = (deg ?? 0) * D2R, c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };

/** flat field geometry from a 2D (x, v) polygon: ShapeGeometry or an extrusion, laid on the field (normal +Y). */
function fieldGeo(pts, depth = 0, opts = {}) {
  const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  const g = depth > 0 ? new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: !!opts.bevel, bevelSize: opts.bevel ?? 0, bevelThickness: opts.bevel ?? 0, bevelSegments: 2, curveSegments: 24 }) : new THREE.ShapeGeometry(sh, 24);
  g.rotateX(-Math.PI / 2);
  return g;
}
/** remap a field geometry's uv to its x/z bounding box (texture top = +v) */
function bboxUV(g) {
  g.computeBoundingBox();
  const b = g.boundingBox, P = g.attributes.position, uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) { uv[i * 2] = (P.getX(i) - b.min.x) / (b.max.x - b.min.x); uv[i * 2 + 1] = (b.max.z - P.getZ(i)) / (b.max.z - b.min.z); }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}
/** a vertical band (wall / rail) of `thick` along a 2D polyline, `height` tall from y0 */
function bandGeo(pts, height, thick, y0 = 0) {
  const n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dv = b[1] - a[1], l = Math.hypot(dx, dv) || 1;
    const nx = -dv / l, nv = dx / l;
    L.push([pts[i][0] + nx * thick / 2, pts[i][1] + nv * thick / 2]);
    R.push([pts[i][0] - nx * thick / 2, pts[i][1] - nv * thick / 2]);
  }
  const g = fieldGeo([...L, ...R.reverse()], height);
  g.translate(0, y0, 0);
  return g;
}
const arcPts = (c, r, a0, a1, n = 40) => Array.from({ length: n + 1 }, (_, i) => { const a = lerp(a0, a1, i / n) * D2R; return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]; });
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// ------------------------------------------------------------------------------------------------ the printed playfield
/**
 * paintPlayfield(S, lay) -> canvas: the original art layer in field metres. Wood grain under ~94 % paint; zones (navy
 * sun-ray apron zone, a target-ring medallion under the progress ladder, a cream band, magenta and a starry orbit top),
 * printed words, keylines, white lane guides and a dark hole ring around every insert.
 */
export function paintPlayfield(S, lay) {
  const T = S.table, A = S.art, ppm = T.art.pxPerM;
  const Wp = Math.round(T.W * ppm), Hp = Math.round(T.L * ppm);
  const { c, x } = cpuCanvas(Wp, Hp);
  const X = (fx) => (fx + T.W / 2) * ppm, Y = (fv) => (T.L - fv) * ppm, M = (m) => m * ppm;
  // wood
  const wood = woodTexture({ size: 1024, boards: 6, seed: 61, grainFreq: 14, contrast: 0.35, dark: "#9a6a3c", mid: "#b98a55", light: "#d2a874", seam: "#8a5c33" });
  for (let yy = 0; yy < Hp; yy += Wp) x.drawImage(wood.image, 0, yy, Wp, Wp);
  wood.dispose();
  const m = T.art.woodShow * 0.2;               // unpainted margin at the rails
  x.save();
  x.beginPath(); x.rect(X(-T.W / 2 + m), Y(T.L - m), M(T.W - 2 * m), M(T.L - 2 * m)); x.clip();
  x.globalAlpha = A.paintAlpha;
  const fillPoly = (pts, col) => { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(X(p[0]), Y(p[1])) : x.moveTo(X(p[0]), Y(p[1])))); x.closePath(); x.fillStyle = col; x.fill(); };
  const key = (w = T.art.keyline) => { x.lineWidth = w; x.strokeStyle = A.keyline; x.stroke(); };
  // zones bottom -> top
  fillPoly([[-0.5, 0], [0.5, 0], [0.5, 1.0], [-0.5, 1.0]], A.zones.low);
  fillPoly([[-0.5, 0.95], [0.5, 0.95], [0.5, 1.36], [-0.5, 1.36]], A.zones.mid);
  fillPoly([[-0.5, 1.33], [0.5, 1.33], [0.5, 2.1], [-0.5, 2.1]], A.zones.high);
  // wavy keyline borders between zones
  for (const [v0, amp, col] of [[0.97, 0.018, A.rays[0]], [1.345, 0.016, S.palette.teal]]) {
    x.beginPath();
    for (let i = 0; i <= 60; i++) { const fx = -0.5 + i / 60, fv = v0 + Math.sin(i * 0.55) * amp; i ? x.lineTo(X(fx), Y(fv)) : x.moveTo(X(fx), Y(fv)); }
    x.lineWidth = M(0.014); x.strokeStyle = col; x.stroke(); key();
  }
  // sun rays from the drain
  for (let i = 0; i < 18; i++) {
    const a0 = (i / 18) * 180 * D2R, a1 = ((i + 0.5) / 18) * 180 * D2R, R0 = 0.06, R1 = 0.5;
    fillPoly([[Math.cos(a0) * R0, 0.05 + Math.sin(a0) * R0], [Math.cos(a0) * R1, 0.05 + Math.sin(a0) * R1], [Math.cos(a1) * R1, 0.05 + Math.sin(a1) * R1], [Math.cos(a1) * R0, 0.05 + Math.sin(a1) * R0]], A.rays[i % 2]);
  }
  // target-ring medallion under the progress ladder
  A.rings.forEach((col, i) => {
    const r = 0.29 - i * 0.05;
    x.beginPath(); x.arc(X(0), Y(0.72), M(r), 0, Math.PI * 2); x.fillStyle = col; x.fill(); key(2);
  });
  // teal diagonal stripes behind the bank
  x.save();
  x.beginPath(); x.rect(X(0.12), Y(1.33), M(0.36), M(0.38)); x.clip();
  for (let i = -6; i < 10; i++) { fillPoly([[0.1 + i * 0.06, 0.95], [0.13 + i * 0.06, 0.95], [0.33 + i * 0.06, 1.36], [0.30 + i * 0.06, 1.36]], S.palette.teal); }
  x.restore();
  // the orbit top: navy disc with stars
  x.beginPath(); x.arc(X(S.orbit.c[0]), Y(S.orbit.c[1]), M(S.orbit.R + 0.04), Math.PI, 0); x.closePath(); x.fillStyle = A.zones.top; x.fill(); key();
  const sr = rng("pf-stars");
  for (let i = 0; i < 26; i++) {
    const a = sr.range(10, 170) * D2R, rr = sr.range(0.12, 0.44), s = sr.range(0.008, 0.02);
    const cx = S.orbit.c[0] + Math.cos(a) * rr, cy = S.orbit.c[1] + Math.sin(a) * rr;
    const pts = []; for (let k = 0; k < 10; k++) { const b = (90 + k * 36) * D2R, q = k % 2 ? s * 0.42 : s; pts.push([cx + Math.cos(b) * q, cy + Math.sin(b) * q]); }
    fillPoly(pts, A.stars);
  }
  // swoosh arcs following the orbit
  for (const [r, col, w] of [[0.36, A.rays[1], 0.012], [0.385, A.rays[0], 0.008]]) {
    x.beginPath(); x.arc(X(S.orbit.c[0]), Y(S.orbit.c[1]), M(r), Math.PI * 1.08, Math.PI * 1.92); x.lineWidth = M(w); x.strokeStyle = col; x.stroke();
  }
  // title arc
  x.globalAlpha = 1;
  {
    const t = A.title, cx = X(S.orbit.c[0]), cy = Y(S.orbit.c[1] - 0.02), R = M(0.205);
    x.font = `800 ${Math.round(M(0.062))}px ${A.font}`;
    x.textAlign = "center"; x.textBaseline = "middle";
    const span = 1.95, n = t.length;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 - span / 2 + (span * (i + 0.5)) / n;
      x.save(); x.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.rotate(a + Math.PI / 2);
      x.lineWidth = M(0.008); x.strokeStyle = A.keyline; x.strokeText(t[i], 0, 0);
      x.fillStyle = A.stars; x.fillText(t[i], 0, 0);
      x.restore();
    }
  }
  // printed words
  const word = (txt, fx, fv, hM, col, deg = 0, edge = A.keyline) => {
    x.save(); x.translate(X(fx), Y(fv)); x.rotate(-deg * D2R);
    x.font = `800 ${Math.round(M(hM))}px ${A.font}`; x.textAlign = "center"; x.textBaseline = "middle";
    x.lineWidth = M(hM * 0.14); x.strokeStyle = edge; x.lineJoin = "round"; x.strokeText(txt, 0, 0);
    x.fillStyle = col; x.fillText(txt, 0, 0); x.restore();
  };
  word(A.words.tasks, 0.075, 1.415, 0.05, S.palette.cream, 0);
  word(A.words.goal, -0.385, 1.56, 0.04, S.palette.yellow, 0);
  word(A.words.ship, -0.235, 0.66, 0.036, "#cfe0ff", 78);
  word("DROP", 0.31, 1.18, 0.034, S.palette.ink, 30, S.palette.cream);
  // white lane guides (shooter lane and the left rollover lane)
  x.globalAlpha = 0.85; x.strokeStyle = S.palette.cream; x.lineWidth = M(0.004); x.setLineDash([M(0.02), M(0.014)]);
  for (const fx of [S.shooter.x]) { x.beginPath(); x.moveTo(X(fx), Y(0.25)); x.lineTo(X(fx), Y(1.4)); x.stroke(); }
  x.beginPath(); x.moveTo(X(S.leftLane.x), Y(1.55)); x.lineTo(X(S.leftLane.x), Y(1.02)); x.stroke();
  x.setLineDash([]);
  x.restore();
  // insert hole rings (dark bevel around every insert)
  for (const L of lay.lamps) {
    const pts = shapePoints(L, 1.0).map((p) => rot2(p, L.rot)).map((p) => [p[0] + L.at[0], p[1] + L.at[1]]);
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(X(p[0]), Y(p[1])) : x.moveTo(X(p[0]), Y(p[1])))); x.closePath();
    x.lineJoin = "round"; x.lineWidth = M(0.007); x.strokeStyle = "rgba(10,8,12,0.92)"; x.stroke();
    x.lineWidth = M(0.0025); x.strokeStyle = "rgba(255,245,220,0.55)"; x.stroke();
  }
  return c;
}

// ------------------------------------------------------------------------------------------------ createStyle
/**
 * createStyle(stage, opts?) -> style. opts: { post = true }
 * props: field, playfield, insertLamp, ball, flipper, popBumper, slingshot, post, dropBank, rollover, rolloverLane,
 *        ramp, orbitRail, guides, apron, plunger, scoreReels, backglass, cabinet, caption, table (everything assembled).
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC, S = spec, P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const T = S.table, r = T.ballR;
  if (lights.key?.shadow) { lights.key.castShadow = true; }
  const tilt = T.tiltDeg * D2R;

  /** field() -> the tilted root group: add every field prop to it (field-local frame). */
  let fieldRoot = null;
  function field() {
    if (fieldRoot) return fieldRoot;
    fieldRoot = new THREE.Group();
    fieldRoot.name = "field";
    fieldRoot.rotation.x = tilt;
    stage.scene.add(fieldRoot);
    return fieldRoot;
  }
  const mesh = (g, m, cast = true, recv = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = recv; return o; };

  // ---- playfield ------------------------------------------------------------------------------------------------
  function playfield(lay) {
    const g = new THREE.Group();
    const tex = canvasTexture(paintPlayfield(S, lay), { anisotropy: 8 });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", map: tex, roughness: T.roughness, metalness: 0, clearcoat: T.clearcoat, clearcoatRoughness: T.clearcoatRoughness, envMapIntensity: T.envOnField });
    mat.name = "playfield";
    const top = new THREE.PlaneGeometry(T.W, T.L);
    top.rotateX(-Math.PI / 2); top.translate(0, 0, -T.L / 2);
    const surf = mesh(top, mat, false, true);
    surf.name = "playfield";
    const board = mesh(new THREE.BoxGeometry(T.W, T.thick, T.L), new THREE.MeshStandardMaterial({ color: "#a77a49", roughness: 0.7 }), false, true);
    board.position.set(0, -T.thick / 2 - 0.0008, -T.L / 2);
    g.add(surf, board);
    return g;
  }

  // ---- insert lamps ----------------------------------------------------------------------------------------------
  /** insertLamp(def) -> Mesh on the field (lettered/worded via its own little canvas); userData.set(level). */
  function insertLamp(def) {
    const pts = shapePoints(def, 0.94);
    const geo = bboxUV(fieldGeo(pts));
    const sz = Array.isArray(def.size) ? def.size : [def.size, def.size];
    const pw = 256, ph = Math.max(64, Math.round(256 * sz[1] / sz[0]));
    const { c, x } = cpuCanvas(pw, ph);
    // translucent insert plastic: a soft centre-bright gradient, then the printed letter/word in ink
    const gr = x.createRadialGradient(pw / 2, ph / 2, 0, pw / 2, ph / 2, Math.max(pw, ph) * 0.62);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.7, "#f2f2f2"); gr.addColorStop(1, "#c8c8c8");
    x.fillStyle = gr; x.fillRect(0, 0, pw, ph);
    const txt = def.letter ?? def.word;
    if (txt) {
      const px = fitFont(x, txt, S.art.font, 800, ph * (def.letter ? 0.72 : 0.62), pw * 0.8);
      x.font = `800 ${px}px ${S.art.font}`; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillStyle = "#16121a"; x.fillText(txt, pw / 2, ph / 2 + px * 0.04);
    }
    const tex = canvasTexture(c, { anisotropy: 8 });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const col = new THREE.Color(def.color).lerp(new THREE.Color("#ffffff"), 0.18);   // a hint of white in the lit core
    const mat = new THREE.MeshStandardMaterial({ color: hexMul(def.color, S.lampOff), map: tex, emissive: col, emissiveMap: tex, emissiveIntensity: 0, roughness: 0.22, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.name = `lamp:${def.id}`;
    const m = mesh(geo, mat, false, true);
    m.position.copy(V(def.at[0], def.at[1], 0.0006));
    m.rotation.y = (def.rot ?? 0) * D2R;
    m.name = `insert:${def.id}`;
    m.userData.set = (level) => { mat.emissiveIntensity = Math.max(0, level) * S.lampGain; };
    return m;
  }

  // ---- ball ------------------------------------------------------------------------------------------------------
  const blob = blobTexture();
  /** ball() -> Group { ball mesh + soft contact shadow }; userData.set([x, v, h]) */
  function ball() {
    const g = new THREE.Group();
    const b = mesh(new THREE.SphereGeometry(r, 48, 32), materials.steel, true, false);
    b.name = "ball";
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(r * 3.2, r * 3.2), new THREE.MeshBasicMaterial({ map: blob, color: "#000000", transparent: true, opacity: 0.55, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.userData.noDepth = true;
    g.add(b, sh);
    g.userData.set = (p) => {
      b.position.copy(V(p[0], p[1], p[2] + r));
      sh.position.copy(V(p[0], p[1], p[2] + 0.0012));
      sh.material.opacity = 0.55;
    };
    return g;
  }

  // ---- flipper ---------------------------------------------------------------------------------------------------
  /** flipper(side) -> pivot Group at the flipper pivot; userData.setAngle(a) (left-equivalent angle from the plan). */
  function flipper(side) {
    const Fp = S.flipper, sx = side === "L" ? 1 : -1;
    const ring = (rad, n = 28) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * rad, Math.sin(a) * rad]; });
    const outline = (grow) => hull([...ring(Fp.rp + grow), ...ring(Fp.rt + grow).map((p) => [p[0] + Fp.len, p[1]])]).map((p) => [p[0] * sx, p[1]]);
    const fix = (pts) => (sx < 0 ? pts.reverse() : pts);
    const g = new THREE.Group();
    const body = mesh(fieldGeo(fix(outline(-0.0015)), Fp.h, { bevel: 0.002 }), materials.whitePlastic);
    body.position.y = 0.002;
    const rub = mesh(fieldGeo(fix(outline(Fp.rubber)), 0.014), materials.rubberRed);
    rub.position.y = Fp.h * 0.42;
    const cap = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 20), materials.chrome);
    cap.position.y = Fp.h + 0.006;
    g.add(body, rub, cap);
    const piv = new THREE.Group();
    piv.add(g);
    piv.position.copy(V(side === "L" ? -Fp.pivotX : Fp.pivotX, Fp.v, 0));
    piv.name = `flipper${side}`;
    piv.userData.setAngle = (a) => { piv.rotation.y = side === "L" ? a : -a; };
    return piv;
  }

  // ---- posts -----------------------------------------------------------------------------------------------------
  /** post([x, v], { rubber = "red", cap }) -> a chrome stem with a rubber ring and a plastic star cap */
  function postProp(at, o = {}) {
    const g = new THREE.Group();
    const stem = mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.05, 14), materials.chrome);
    stem.position.y = 0.025;
    const ring = mesh(new THREE.TorusGeometry(0.0135, 0.0062, 10, 28), o.rubber === "white" ? materials.rubberWhite : o.rubber === "black" ? materials.rubberBlack : materials.rubberRed);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.021;
    const cap = mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.012, 16), new THREE.MeshStandardMaterial({ color: o.cap ?? P.yellow, roughness: 0.3 }));
    cap.position.y = 0.054;
    g.add(stem, ring, cap);
    g.position.copy(V(at[0], at[1], 0));
    return g;
  }

  // ---- pop bumper ------------------------------------------------------------------------------------------------
  function capTop(color, word) {
    const N = 256, { c, x } = cpuCanvas(N, N);
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, N, N);
    x.beginPath(); x.arc(N / 2, N / 2, N * 0.47, 0, Math.PI * 2); x.lineWidth = N * 0.05; x.strokeStyle = "#1a1418"; x.stroke();
    const pts = []; for (let k = 0; k < 10; k++) { const b = (-90 + k * 36) * D2R, q = k % 2 ? N * 0.15 : N * 0.36; pts.push([N / 2 + Math.cos(b) * q, N / 2 - N * 0.03 + Math.sin(b) * q]); }
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath();
    x.fillStyle = "#fff6d8"; x.fill(); x.lineWidth = N * 0.02; x.strokeStyle = "#1a1418"; x.stroke();
    if (word) {
      const px = fitFont(x, word, S.art.font, 800, N * 0.15, N * 0.5);
      x.font = `800 ${px}px ${S.art.font}`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#1a1418";
      x.fillText(word, N / 2, N * 0.8);
    }
    void color;
    const t = canvasTexture(c, { anisotropy: 8 }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }
  /** popBumper(b) -> Group at the bumper centre; userData.update({ level, kick }) — cap lamp level, kick ring 0..1 */
  function popBumper(b) {
    const B = S.bumpers, g = new THREE.Group();
    const skirt = mesh(new THREE.CylinderGeometry(B.skirt, B.skirt * 1.02, 0.007, 40), materials.whitePlastic);
    skirt.position.y = 0.0035;
    const body = mesh(new THREE.CylinderGeometry(B.r * 0.78, B.r * 0.86, B.h * 0.62, 32), materials.whitePlastic);
    body.position.y = B.h * 0.31;
    const ring = mesh(new THREE.CylinderGeometry(B.r * 0.97, B.r * 0.97, 0.013, 40, 1, true), materials.chrome);
    ring.material = materials.chrome;
    const ringY = B.h * 0.34;
    const col = new THREE.Color(b.cap);
    const capSide = new THREE.MeshStandardMaterial({ color: hexMul(b.cap, 0.75), emissive: col, emissiveIntensity: 0, roughness: 0.25 });
    const topTex = capTop(b.cap, b.word);
    const capTopM = new THREE.MeshStandardMaterial({ color: hexMul(b.cap, 0.9), map: topTex, emissive: col, emissiveMap: topTex, emissiveIntensity: 0, roughness: 0.3 });
    const cap = mesh(new THREE.CylinderGeometry(B.r, B.r * 0.92, 0.026, 40), [capSide, capTopM, capSide]);
    cap.position.y = B.h * 0.62 + 0.013;
    const bolt = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 12), materials.chrome);
    bolt.position.y = B.h * 0.62 + 0.028;
    g.add(skirt, body, ring, cap, bolt);
    g.position.copy(V(b.c[0], b.c[1], 0));
    g.name = `bumper${b.id}`;
    g.userData.update = ({ level = 0, kick = 0 }) => {
      const e = Math.max(0, level) * S.lampGain * 0.75;
      capSide.emissiveIntensity = e; capTopM.emissiveIntensity = e * 0.85;
      ring.position.y = ringY - kick * B.ringDrop;
      cap.position.y = B.h * 0.62 + 0.013 - kick * 0.003;
    };
    g.userData.update({});
    return g;
  }

  // ---- slingshot -------------------------------------------------------------------------------------------------
  /** slingshot(s) -> Group (triangle body, lit plastic, three posts, rubber band); userData.update({ level, kick }) */
  function slingshot(s) {
    const SL = S.slings, g = new THREE.Group();
    const inset = (k) => { const cx = (s.A[0] + s.B[0] + s.C[0]) / 3, cy = (s.A[1] + s.B[1] + s.C[1]) / 3; return [s.A, s.B, s.C].map((p) => [lerp(p[0], cx, k), lerp(p[1], cy, k)]); };
    const ccw = (pts) => { const a = (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[1][1] - pts[0][1]) * (pts[2][0] - pts[0][0]); return a < 0 ? pts.slice().reverse() : pts; };
    const body = mesh(fieldGeo(ccw(inset(0.18)), SL.h * 0.85), materials.whitePlastic);
    const col = new THREE.Color(SL.plastic);
    const pm = new THREE.MeshPhysicalMaterial({ color: hexMul(SL.plastic, 0.8), emissive: col, emissiveIntensity: 0, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15, transparent: true, opacity: 0.92 });
    const plastic = mesh(fieldGeo(ccw(inset(-0.12)), 0.004), pm);
    plastic.position.y = SL.h + 0.012;
    g.add(body, plastic);
    for (const p of [s.A, s.B, s.C]) g.add(postProp(p, { rubber: "white", cap: SL.plastic }));
    const band = (a, b, off = 0) => {
      const n = s.n, pts = [];
      for (let i = 0; i <= 12; i++) { const u = i / 12, bow = Math.sin(u * Math.PI); pts.push([lerp(a[0], b[0], u) + n[0] * off * bow, 0.02, -(lerp(a[1], b[1], u) + n[1] * off * bow)]); }
      return pts;
    };
    const outward = (a, b) => { const cx = (s.A[0] + s.B[0] + s.C[0]) / 3, cy = (s.A[1] + s.B[1] + s.C[1]) / 3, mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy, l = Math.hypot(mx, my); return [mx / l, my / l]; };
    const offPt = (p, d, k = 0.0145) => [p[0] + d[0] * k, p[1] + d[1] * k];
    for (const [a, b] of [[s.A, s.B], [s.C, s.A]]) { const d = outward(a, b); g.add(mesh(sweepGeometry(band(offPt(a, d), offPt(b, d)), 0.0055, 8), materials.rubberWhite)); }
    const fd = s.n;
    const faceA = offPt(s.B, fd), faceB = offPt(s.C, fd);
    const face = mesh(sweepGeometry(band(faceA, faceB), 0.0058, 8), materials.rubberWhite);
    g.add(face);
    const faceGeos = [0, 0.33, 0.66, 1].map((k) => sweepGeometry(band(faceA, faceB, k * SL.kick), 0.0058, 8));
    g.name = `sling${s.side}`;
    g.userData.update = ({ level = 0, kick = 0 }) => {
      pm.emissiveIntensity = Math.max(0, level) * S.lampGain * 0.55;
      face.geometry = faceGeos[Math.min(3, Math.round(clamp(kick) * 3))];
    };
    return g;
  }

  // ---- drop-target bank ------------------------------------------------------------------------------------------
  function targetFace(letter, color) {
    const { c, x } = cpuCanvas(160, 160);
    x.fillStyle = color; x.fillRect(0, 0, 160, 160);
    x.fillStyle = "rgba(255,255,255,0.18)"; x.fillRect(0, 0, 160, 34);
    x.font = `800 112px ${S.art.font}`; x.textAlign = "center"; x.textBaseline = "middle";
    x.lineWidth = 8; x.strokeStyle = "#1a1418"; x.strokeText(letter, 80, 88);
    x.fillStyle = "#fff6e0"; x.fillText(letter, 80, 88);
    const t = canvasTexture(c, { anisotropy: 8 }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }
  /** dropBank(bank) -> Group; userData.update(downs[]) with 0 (up) .. 1 (sunk below the playfield) per target */
  function dropBank(bank) {
    const K = S.bank, g = new THREE.Group();
    g.position.copy(V(bank.c[0], bank.c[1], 0));
    g.rotation.y = Math.atan2(bank.t[1], bank.t[0]);
    const n = bank.targets.length, span = (n - 1) * K.pitch + K.w + 0.03;
    const housing = mesh(new THREE.BoxGeometry(span, 0.03, 0.03), materials.blackPlastic);
    housing.position.set(0, 0.015, -0.03);
    const lip = mesh(new THREE.BoxGeometry(span, 0.004, 0.016), materials.chrome);
    lip.position.set(0, 0.002, 0.0);
    g.add(housing, lip);
    for (const sxp of [-span / 2 - 0.006, span / 2 + 0.006]) { const pp = postProp([0, 0]); pp.position.set(sxp, 0, -0.01); g.add(pp); }
    const side = new THREE.MeshStandardMaterial({ color: "#d8d2c4", roughness: 0.35 });
    const tgts = bank.targets.map((tg, k) => {
      const face = new THREE.MeshStandardMaterial({ map: targetFace(tg.letter, P.red), roughness: 0.3 });
      const m = mesh(new THREE.BoxGeometry(K.w, K.hgt, K.d), [side, side, side, side, face, side]);
      m.position.set((k - (n - 1) / 2) * K.pitch, K.hgt / 2, -K.d / 2 + 0.002);
      m.name = `target:${tg.letter}`;
      g.add(m);
      return m;
    });
    g.name = "dropBank";
    g.userData.update = (downs) => tgts.forEach((m, k) => { const d = downs[k] ?? 0; m.position.y = K.hgt / 2 - d * (K.hgt + 0.006); m.visible = d < 0.999; });
    g.userData.update([]);
    return g;
  }

  // ---- rollovers -------------------------------------------------------------------------------------------------
  /** rollover([x, v]) -> a chrome star rollover button; userData.update(dip 0..1) */
  function rollover(at) {
    const R0 = S.rollover.r, pts = [];
    for (let k = 0; k < 10; k++) { const a = (90 + k * 36) * D2R, q = k % 2 ? R0 * 0.45 : R0; pts.push([Math.cos(a) * q, Math.sin(a) * q]); }
    const m = mesh(fieldGeo(pts, 0.004, { bevel: 0.001 }), materials.chrome, false, true);
    m.position.copy(V(at[0], at[1], 0.0005));
    m.userData.update = (dip) => { m.position.y = 0.0005 - dip * S.rollover.dip; };
    return m;
  }
  /** rolloverLane({ x, wallX, wallFrom, wallTo, rollovers }) -> Group (guide wall + star rollovers); userData.update(dips[]) */
  function rolloverLane(Ln) {
    const g = new THREE.Group();
    g.add(mesh(bandGeo([[Ln.wallX, Ln.wallFrom], [Ln.wallX, Ln.wallTo]], 0.045, 0.007), materials.chrome));
    const rs = Ln.rollovers.map((v) => rollover([Ln.x, v]));
    rs.forEach((m) => g.add(m));
    g.userData.update = (dips) => rs.forEach((m, i) => m.userData.update(dips[i] ?? 0));
    return g;
  }

  // ---- orbit rail + guides ---------------------------------------------------------------------------------------
  /** orbitRail(orbit) -> chrome outer rail (arc + straights) and the painted inner orbit wall */
  function orbitRail(O) {
    const g = new THREE.Group(), half = T.W / 2;
    const outer = [[half - 0.004, 0.0], ...arcPts(O.c, O.R + r + 0.006, 0, 180, 60), [-half + 0.004, 0.25]];
    g.add(mesh(bandGeo(outer, O.wallH, 0.008), materials.chrome));
    const inner = arcPts(O.c, O.R - r - 0.012, O.innerFrom, O.innerTo, 40);
    g.add(mesh(bandGeo(inner, O.wallH * 0.85, 0.012), materials.wall));
    g.add(mesh(bandGeo(inner, 0.004, 0.016, O.wallH * 0.85), materials.chrome));
    return g;
  }
  /** guides() -> shooter-lane wall, inlane guides and dividers (chrome bands) */
  function guides() {
    const g = new THREE.Group(), sh = S.shooter, il = S.inlane, Fp = S.flipper;
    g.add(mesh(bandGeo([[sh.wallX, 0.0], [sh.wallX, sh.wallTo]], 0.05, 0.012), materials.wall));
    g.add(mesh(bandGeo([[sh.wallX, 0.0], [sh.wallX, sh.wallTo]], 0.004, 0.016, 0.05), materials.chrome));
    for (const sx of [-1, 1]) {
      const pts = sx < 0 ? [[-il.dividerX, il.top], [-0.44, 0.48], [-Fp.pivotX - 0.045, Fp.v + 0.05]] : [[sh.wallX - 0.006, 0.52], [0.40, 0.48], [Fp.pivotX + 0.045, Fp.v + 0.05]];
      g.add(mesh(bandGeo(pts, 0.035, 0.006), materials.chrome));
    }
    for (const p of S.posts) g.add(postProp(p));
    return g;
  }
  /** apron(lay) -> the printed metal apron below the flippers (two blank instruction cards) */
  function apron() {
    const pts = [[-0.5, 0], [S.shooter.wallX - 0.006, 0], [S.shooter.wallX - 0.006, 0.2], [0.28, 0.2], [0.12, 0.13], [-0.12, 0.13], [-0.28, 0.2], [-0.5, 0.2]];
    const geo = bboxUV(fieldGeo(pts, 0.012));
    const { c, x } = cpuCanvas(1024, 220);
    x.fillStyle = P.navy; x.fillRect(0, 0, 1024, 220);
    for (const cx of [140, 760]) {
      x.fillStyle = P.cream; rrPath(x, cx, 40, 170, 120, 10); x.fill();
      x.fillStyle = P.red; x.fillRect(cx, 40, 170, 18);
      x.fillStyle = "rgba(20,16,22,0.35)"; for (let i = 0; i < 5; i++) x.fillRect(cx + 16, 74 + i * 16, 138 - (i % 2) * 30, 6);
    }
    x.strokeStyle = P.yellow; x.lineWidth = 6; x.strokeRect(6, 6, 1012, 208);
    const tex = canvasTexture(c, { anisotropy: 8 }); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    // top face (ExtrudeGeometry group 0 = caps) gets the print, sides metal
    const m = mesh(geo, [new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.3 }), materials.chrome]);
    return m;
  }

  // ---- ramp ------------------------------------------------------------------------------------------------------
  /** ramp(rampPlan) -> Group: translucent plastic up-ramp and hairpin (floor + side walls), a chrome wire-form return, supports */
  function ramp(Rp) {
    const R = S.ramp, g = new THREE.Group();
    const local = Rp.pts.map((p) => new THREE.Vector3(p[0], p[2], -p[1]));
    const plasticN = Rp.cum.findIndex((c) => c >= Rp.plasticEnd);
    const up = new THREE.Vector3(0, 1, 0);
    const frame = (i) => { const a = local[Math.max(0, i - 1)], b = local[Math.min(local.length - 1, i + 1)]; const tng = b.clone().sub(a).normalize(); const lat = new THREE.Vector3().crossVectors(tng, up).normalize(); return { tng, lat }; };
    // plastic: floor + walls as one strip mesh
    const pos = [], idx = [];
    const strip = (i0, i1, offA, offB, yA, yB) => {
      const base = pos.length / 3;
      for (let i = i0; i <= i1; i++) { const { lat } = frame(i), p = local[i]; pos.push(p.x + lat.x * offA, p.y + yA, p.z + lat.z * offA, p.x + lat.x * offB, p.y + yB, p.z + lat.z * offB); }
      for (let k = 0; k < i1 - i0; k++) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    };
    const w = R.width / 2;
    strip(0, plasticN, -w, w, -0.002, -0.002);
    strip(0, plasticN, -w, -w, -0.002, R.wallH);
    strip(0, plasticN, w, w, -0.002, R.wallH);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); pg.setIndex(idx); pg.computeVertexNormals();
    const pm = new THREE.MeshPhysicalMaterial({ color: R.plastic, roughness: 0.3, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2, transparent: true, opacity: R.opacity, side: THREE.DoubleSide, depthWrite: false });
    const plastic = new THREE.Mesh(pg, pm); plastic.receiveShadow = true; plastic.name = "rampPlastic";
    g.add(plastic);
    // plastic edge trim (chrome lips along the wall tops)
    for (const s of [-1, 1]) {
      const pts = []; for (let i = 0; i <= plasticN; i++) { const { lat } = frame(i), p = local[i]; pts.push([p.x + lat.x * w * s, p.y + R.wallH, p.z + lat.z * w * s]); }
      g.add(mesh(sweepGeometry(pts, 0.0028, 6), materials.chrome, true, false));
    }
    // wire form: two floor rails + two side rails
    for (const [off, y] of [[-0.45, -0.001], [0.45, -0.001], [-1.05, 0.022], [1.05, 0.022]]) {
      const pts = []; for (let i = Math.max(0, plasticN - 1); i < local.length; i++) { const { lat } = frame(i), p = local[i]; pts.push([p.x + lat.x * w * off, p.y + y - R.wireR, p.z + lat.z * w * off]); }
      g.add(mesh(sweepGeometry(pts, R.wireR, 6), materials.chrome, true, false));
    }
    // wire hoops every ~0.1 m
    for (let i = plasticN; i < local.length; i += 5) { const { lat } = frame(i), p = local[i]; const pts = [-1.05, -0.45, 0.45, 1.05].map((o, k) => [p.x + lat.x * w * o, p.y + (k === 0 || k === 3 ? 0.022 : -0.001) - R.wireR, p.z + lat.z * w * o]); g.add(mesh(sweepGeometry(pts, R.wireR * 0.8, 5), materials.chrome, true, false)); }
    // supports: chrome rods down to the field where the ramp is high enough
    for (let i = 4; i < local.length; i += 9) { const p = local[i]; if (p.y < 0.03) continue; const rod = mesh(new THREE.CylinderGeometry(0.004, 0.004, p.y, 8), materials.chrome); rod.position.set(p.x, p.y / 2, p.z); g.add(rod); }
    // entrance lip
    const { lat } = frame(0), p0 = local[0];
    const lip = mesh(new THREE.BoxGeometry(R.width + 0.01, 0.003, 0.03), materials.chrome);
    lip.position.set(p0.x, 0.0015, p0.z + 0.012); lip.rotation.y = Math.atan2(-lat.z, lat.x);
    g.add(lip);
    g.name = "ramp";
    return g;
  }

  // ---- plunger ---------------------------------------------------------------------------------------------------
  /** plunger() -> Group in the shooter lane (rod, spring, knob outside the cabinet); userData.update(offset metres) */
  function plunger() {
    const sh = S.shooter, g = new THREE.Group();
    const tipV = sh.rest - r - 0.002, backV = -0.22;
    const rod = mesh(new THREE.CylinderGeometry(0.006, 0.006, tipV - backV, 12), materials.chrome);
    rod.rotation.x = Math.PI / 2; rod.position.set(sh.x, r, -(tipV + backV) / 2);
    const tip = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 16), materials.rubberBlack);
    tip.rotation.x = Math.PI / 2; tip.position.set(sh.x, r, -(tipV - 0.006));
    const knob = mesh(new THREE.SphereGeometry(0.03, 24, 16), new THREE.MeshPhysicalMaterial({ color: P.red, roughness: 0.2, clearcoat: 1 }));
    knob.scale.set(1, 1, 1.4); knob.position.set(sh.x, r, -backV + 0.0);
    const coil = []; for (let i = 0; i <= 120; i++) { const a = i * 0.5; coil.push([sh.x + Math.cos(a) * 0.011, r + Math.sin(a) * 0.011, -(0.0 + (i / 120) * 0.08)]); }
    const spring = mesh(sweepGeometry(coil, 0.0018, 5), materials.chrome);
    g.add(rod, tip, knob, spring);
    g.userData.update = (off) => { for (const m of [rod, tip, knob]) m.position.z = m.userData.z0 + off; spring.scale.z = 1 - off * 4; };
    for (const m of [rod, tip, knob]) m.userData.z0 = m.position.z;
    g.name = "plunger";
    return g;
  }

  // ---- cabinet ---------------------------------------------------------------------------------------------------
  /** cabinet() -> walls, chrome side rails and lockdown bar (field-local; add to field()) plus legs/floor (world) */
  function cabinet() {
    const g = new THREE.Group(), W2 = T.W / 2, wt = T.wallT, wh = T.wallH;
    const sideMat = materials.cabinet, deep = 0.42;
    const railMat = materials.chrome.clone(); railMat.roughness = 0.3; railMat.name = "sideRail";
    for (const sx of [-1, 1]) {
      const wall = mesh(new THREE.BoxGeometry(wt, wh + deep, T.L + 2 * wt), sideMat);
      wall.position.set(sx * (W2 + wt / 2), (wh - deep) / 2, -T.L / 2);
      const rail = mesh(new THREE.CylinderGeometry(0.016, 0.016, T.L + 2 * wt + 0.02, 20), railMat);
      rail.rotation.x = Math.PI / 2; rail.scale.set(1.6, 1, 0.7);
      rail.position.set(sx * (W2 + wt / 2), wh + 0.008, -T.L / 2);
      // inner wall face: a lighter painted strip above the field
      const inner = mesh(new THREE.PlaneGeometry(T.L, wh), new THREE.MeshStandardMaterial({ color: "#3a2a5a", roughness: 0.6 }), false, true);
      inner.rotation.y = sx * -Math.PI / 2; inner.position.set(sx * (W2 - 0.0005), wh / 2, -T.L / 2);
      g.add(wall, rail, inner);
    }
    const back = mesh(new THREE.BoxGeometry(T.W + 2 * wt, wh + deep, wt), sideMat);
    back.position.set(0, (wh - deep) / 2, -T.L - wt / 2);
    const front = mesh(new THREE.BoxGeometry(T.W + 2 * wt, wh + deep, wt), sideMat);
    front.position.set(0, (wh - deep) / 2, wt / 2);
    const bar = mesh(new THREE.BoxGeometry(T.W + 2 * wt + 0.03, 0.03, 0.07), railMat);
    bar.position.set(0, wh + 0.015, 0.02);
    const under = mesh(new THREE.BoxGeometry(T.W, deep, T.L), sideMat, false, true);
    under.position.set(0, -T.thick - deep / 2, -T.L / 2);
    g.add(back, front, bar, under);
    g.name = "cabinet";
    return g;
  }
  /** room() -> world-space floor + chrome legs under the cabinet */
  function room() {
    const g = new THREE.Group();
    const floor = mesh(new THREE.PlaneGeometry(60, 60), materials.floor, false, true);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.95, -1.2);
    g.add(floor);
    for (const [x, z] of [[-0.55, 0.0], [0.55, 0.0], [-0.55, -2.0], [0.55, -2.0]]) {
      const top = -0.45 + (z < -1 ? 0.2 : 0);
      const leg = mesh(new THREE.BoxGeometry(0.05, top + 0.95, 0.05), materials.chrome);
      leg.position.set(x, (top - 0.95) / 2, z);
      g.add(leg);
    }
    return g;
  }

  // ---- score reels + backglass -----------------------------------------------------------------------------------
  function drumTexture() {
    const cw = 1280, ch = 158, { c, x } = cpuCanvas(cw, ch);
    x.fillStyle = "#f3e7c9"; x.fillRect(0, 0, cw, ch);
    x.fillStyle = "rgba(120,90,40,0.25)"; for (let d = 0; d <= 10; d++) x.fillRect(d * (cw / 10) - 1, 0, 2, ch);
    x.fillStyle = "#1b120b"; x.font = `800 118px ${S.art.font}`; x.textAlign = "center"; x.textBaseline = "middle";
    for (let d = 0; d < 10; d++) { x.save(); x.translate((d + 0.5) * (cw / 10), ch / 2); x.rotate(Math.PI / 2); x.fillText(String(d), 0, 6); x.restore(); }
    const t = canvasTexture(c, { anisotropy: 8 }); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }
  /** scoreReels(n) -> Group of n drums (left = highest digit); userData.update(rolls[k] for k = 0 (units) .. n-1) */
  function scoreReels(n = S.score.reels) {
    const Rl = S.backglass.reel, g = new THREE.Group(), tex = drumTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.32, roughness: 0.55 });
    const drums = [];
    for (let i = 0; i < n; i++) {
      const geo = new THREE.CylinderGeometry(Rl.r, Rl.r, Rl.w, 48, 1, true);
      geo.rotateZ(Math.PI / 2);
      const d = new THREE.Mesh(geo, mat);
      const k = n - 1 - i;     // digit order: left drum = highest place
      d.position.x = (i - (n - 1) / 2) * (Rl.w + Rl.gap);
      drums[k] = d; g.add(d);
    }
    g.userData.update = (rolls) => drums.forEach((d, k) => { d.rotation.x = ((rolls[k] ?? 0) + 0.5) * (Math.PI * 2 / 10) + S.backglass.reelPhase; });   // u = 0 faces +Z; digit d is centred at u = (d + .5) / 10
    g.userData.update([]);
    return g;
  }
  function paintBackglass() {
    const BG = S.backglass, A = BG.art, Wp = BG.px, Hp = Math.round(BG.px * BG.h / BG.w);
    const { c, x } = cpuCanvas(Wp, Hp);
    const M = (m) => (m / BG.w) * Wp, X = (m) => Wp / 2 + M(m), Y = (m) => Hp - M(m);   // metres from bottom centre
    x.fillStyle = A.ground; x.fillRect(0, 0, Wp, Hp);
    // rays from the title centre
    const cx = X(0), cy = Y(BG.h * 0.68);
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * Math.PI * 2, a1 = a0 + Math.PI / 24;
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a0) * Wp, cy + Math.sin(a0) * Wp); x.lineTo(cx + Math.cos(a1) * Wp, cy + Math.sin(a1) * Wp); x.closePath();
      x.fillStyle = A.rays[i % A.rays.length]; x.globalAlpha = 0.55; x.fill();
    }
    x.globalAlpha = 1;
    // concentric target rings behind the title
    [[0.3, A.rays[1]], [0.24, A.ground], [0.18, A.rays[0]], [0.12, A.ground]].forEach(([rr, col]) => { x.beginPath(); x.arc(cx, cy, M(rr), 0, Math.PI * 2); x.fillStyle = col; x.fill(); x.lineWidth = 4; x.strokeStyle = "#0a0a14"; x.stroke(); });
    // title
    const title = S.art.title;
    let px = fitFont(x, title, S.art.font, 800, M(0.15), Wp * 0.86);
    x.font = `800 ${px}px ${S.art.font}`; x.textAlign = "center"; x.textBaseline = "middle"; x.lineJoin = "round";
    x.lineWidth = px * 0.2; x.strokeStyle = "#0a0a14"; x.strokeText(title, cx, cy);
    x.lineWidth = px * 0.09; x.strokeStyle = A.titleEdge; x.strokeText(title, cx, cy);
    x.fillStyle = A.title; x.fillText(title, cx, cy);
    // reel window (transparent) with a lit frame
    const Wn = BG.window, wx = X(-Wn.w / 2), wy = Y(Wn.y + Wn.h / 2), ww = M(Wn.w), wh = M(Wn.h);
    x.fillStyle = "#0a0a14"; rrPath(x, wx - 18, wy - 18, ww + 36, wh + 36, 16); x.fill();
    x.strokeStyle = A.title; x.lineWidth = 6; rrPath(x, wx - 10, wy - 10, ww + 20, wh + 20, 12); x.stroke();
    x.clearRect(wx, wy, ww, wh);
    // small lit boxes and the SAMPLE DATA mark
    const box = (txt, bx, by, col) => { const w = M(0.17), h = M(0.05); x.fillStyle = "#0a0a14"; rrPath(x, X(bx) - w / 2, Y(by) - h / 2, w, h, 8); x.fill(); x.font = `800 ${Math.round(h * 0.6)}px ${S.art.font}`; x.fillStyle = col; x.fillText(txt, X(bx), Y(by) + 2); };
    box("BALL 1", -0.46, 0.18, A.title);
    box("1 PLAYER", 0.46, 0.18, A.rays[3] === undefined ? A.title : "#7fe3da");
    x.font = `700 ${Math.round(M(0.03))}px ${S.art.font}`; x.fillStyle = "#f5ead0"; x.globalAlpha = 0.85;
    x.fillText(BG.sample, X(0), Y(Wn.y - Wn.h / 2 - 0.04));
    x.globalAlpha = 1;
    // border
    x.strokeStyle = "#0a0a14"; x.lineWidth = 14; x.strokeRect(7, 7, Wp - 14, Hp - 14);
    return c;
  }
  /** backglass(frame) -> world Group: wooden head box, lit printed glass with a reel window, score reels behind it;
   *  userData.update({ glow, rolls }) */
  function backglass(frame) {
    const BG = S.backglass, g = new THREE.Group();
    // the head box sits behind the reels; a bezel frame bridges from the glass back to it (the reels show through the window)
    const gapD = 2 * BG.reel.r + 0.03;
    const head = mesh(new THREE.BoxGeometry(BG.w + 0.08, BG.h + 0.08, BG.d), materials.cabinet);
    head.position.set(0, BG.h / 2, -gapD - BG.d / 2);
    const bezel = new THREE.Group();
    for (const [w, h, x, y] of [[BG.w + 0.08, 0.04, 0, BG.h + 0.02], [BG.w + 0.08, 0.04, 0, -0.02], [0.04, BG.h + 0.08, -BG.w / 2 - 0.02, BG.h / 2], [0.04, BG.h + 0.08, BG.w / 2 + 0.02, BG.h / 2]]) {
      const b = mesh(new THREE.BoxGeometry(w, h, gapD + 0.01), materials.cabinet); b.position.set(x, y, -gapD / 2 + 0.004); bezel.add(b);
    }
    const trim = mesh(new THREE.BoxGeometry(BG.w + 0.1, 0.02, 0.04), materials.chrome);
    trim.position.set(0, -0.03, 0.0);
    // neck down to the cabinet
    const neck = mesh(new THREE.BoxGeometry(BG.w * 0.9, BG.lift + 0.3, BG.d * 0.8), materials.cabinet);
    neck.position.set(0, -(BG.lift + 0.3) / 2, -BG.d * 0.5);
    const tex = canvasTexture(paintBackglass(), { anisotropy: 8 }); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const pm = new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: BG.glow, roughness: 0.25, transparent: true, alphaTest: 0.5 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(BG.w, BG.h), pm);
    panel.position.set(0, BG.h / 2, 0.0);
    panel.name = "backglass";
    const reels = scoreReels();
    reels.position.set(0, BG.window.y, -BG.reel.r - 0.004);
    const cavity = mesh(new THREE.BoxGeometry(BG.window.w + 0.04, BG.window.h + 0.04, 0.02), new THREE.MeshStandardMaterial({ color: "#060608" }), false, false);
    cavity.position.set(0, BG.window.y, -2 * BG.reel.r - 0.02);
    g.add(head, bezel, trim, neck, panel, reels, cavity);
    g.position.set(...frame.bottom);
    g.name = "backglassHead";
    g.userData.update = ({ glow = 1, rolls = [] }) => { pm.emissiveIntensity = BG.glow * glow; reels.userData.update(rolls); };
    return g;
  }

  // ---- the caption: an apron instruction card on the overlay (exact colours, never blurred) ---------------------
  /** caption(beats) -> overlay mesh; userData.update(t) shows the beat label whose window contains t (one at a time). */
  function caption(beats) {
    const Q = S.caption, Wp = 900, Hp = Q.h + 28;
    const meshC = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      if ("letterSpacing" in x) x.letterSpacing = `${Math.round(Q.cap * 0.06)}px`;
      const tw = x.measureText(st.text).width, pw = Math.min(W - 16, Math.round(tw + Q.cap * 2.2 + 26)), ph = Q.h, ox = 8, oy = 6;
      x.fillStyle = "rgba(0,0,0,0.45)"; rrPath(x, ox + 4, oy + 7, pw, ph, 8); x.fill();
      x.fillStyle = Q.card; rrPath(x, ox, oy, pw, ph, 8); x.fill();
      x.fillStyle = Q.stripe; x.fillRect(ox + 14, oy + 12, 14, ph - 24);
      x.strokeStyle = Q.edge; x.lineWidth = 4; rrPath(x, ox + 2, oy + 2, pw - 4, ph - 4, 7); x.stroke();
      x.textAlign = "left"; x.textBaseline = "middle"; x.fillStyle = Q.ink;
      x.fillText(st.text, ox + 44, oy + ph / 2 + 2);
    }, { upload: true });
    // pin the overlay canvas to the CPU rasterizer before its first draw
    meshC.userData.canvas.getContext("2d", { willReadFrequently: true });
    meshC.userData.place(Q.x, Q.y);
    const L = beats.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.25), off: beats[i + 1] ? beats[i + 1].t - 0.4 : Infinity }));
    meshC.userData.update = (t) => {
      let shown = false;
      for (const l of L) {
        const a = smoothstep(l.on, l.on + 0.3, t) * (Number.isFinite(l.off) ? 1 - smoothstep(l.off, l.off + 0.3, t) : 1);
        if (a > 0.001 && !shown) { meshC.userData.set({ text: l.text }); meshC.userData.opacity(a); shown = true; }
      }
      if (!shown) { meshC.userData.set({ text: "" }); meshC.userData.opacity(0); }
      stage.renderer.initTexture(meshC.material.map);
    };
    return meshC;
  }

  // ---- the whole table, assembled ---------------------------------------------------------------------------------
  /**
   * table(plan) -> { root, update(state) } with everything above placed from plan.lay.
   *   state = { ball, flip: { L, R }, plunger, lamp(id) -> level, kick: { A, B, C, slingL, slingR }, downs[], dips[], rolls[], glow }
   */
  function table(plan) {
    const lay = plan.lay, root = field();
    root.add(playfield(lay), cabinet(), orbitRail(lay.orbit), guides(), apron(), ramp(lay.ramp));
    stage.scene.add(room());
    const lamps = lay.lamps.map((d) => { const m = insertLamp(d); root.add(m); return m; });
    const bumpers = Object.values(lay.bumpers).map((b) => { const m = popBumper(b); root.add(m); return m; });
    const slings = ["L", "R"].map((s) => { const m = slingshot(lay.slings[s]); root.add(m); return m; });
    const bank = dropBank(lay.bank); root.add(bank);
    const lane = rolloverLane(S.leftLane); root.add(lane);
    const flips = { L: flipper("L"), R: flipper("R") }; root.add(flips.L, flips.R);
    const pl = plunger(); root.add(pl);
    const b = ball(); root.add(b);
    const bg = backglass(pin.backglassFrame(S)); stage.scene.add(bg);
    return {
      root, lamps, bumpers, slings, bank, lane, flips, plunger: pl, ball: b, backglass: bg,
      update(st) {
        b.userData.set(st.ball);
        flips.L.userData.setAngle(st.flip.L); flips.R.userData.setAngle(st.flip.R);
        pl.userData.update(st.plunger ?? 0);
        lamps.forEach((m, i) => m.userData.set(st.lamp(lay.lamps[i].id)));
        bumpers.forEach((m) => { const id = m.name.slice(6); m.userData.update({ level: st.lamp(`bump${id}`), kick: st.kick[id] ?? 0 }); });
        slings.forEach((m, i) => { const s = i ? "R" : "L"; m.userData.update({ level: st.lamp(`sling${s}`), kick: st.kick[`sling${s}`] ?? 0 }); });
        bank.userData.update(st.downs ?? []);
        lane.userData.update(st.dips ?? []);
        bg.userData.update({ glow: st.glow ?? 1, rolls: st.rolls ?? [] });
      },
    };
  }

  const props = {
    field, playfield, insertLamp, ball, flipper, popBumper, slingshot, post: postProp, dropBank, rollover, rolloverLane,
    ramp, orbitRail, guides, apron, plunger, scoreReels, backglass, cabinet, room, caption, table,
  };
  const factories = {
    cabinet: () => { const g = new THREE.Group(); g.name = "cabinetMarker"; return g; },   // the real cabinet is built by table()
  };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: pin, motion: pin,
    helpers: { shapePoints, paintPlayfield, fieldToWorld: (p) => pin.fieldToWorld(S, p) },
  };
}
