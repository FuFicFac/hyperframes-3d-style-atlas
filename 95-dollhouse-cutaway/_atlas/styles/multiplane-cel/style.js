// styles/multiplane-cel/style.js — "Multiplane Cel": painted layers on stacked glass under a film camera.
// The look lives in spec.js; WHERE the camera is, how far the tray has slid and which bird drawing shows live in
// multiplane.js (THREE-free planner shared with SCORE). This file paints and builds:
//   - gouache painters (seeded brush strokes clipped to shapes on CPU canvases, painted once at load): sky, far hills,
//     meadow + path + cottage, tree grove, foreground foliage, plus a glass sheen/dust sheet;
//   - an inked-and-painted cel bird: 8 wing drawings in one atlas (and a blurred silhouette atlas for its cel shadow);
//     a drawing is picked by texture offset (a uniform), never by redrawing;
//   - the rig: plinth, steel posts and rails, six glass trays with peg bars, lamp bars between the shelves, a hand
//     wheel on the sliding tray, a film camera on a bridge at the top, and a bright studio corner around it;
//   - an overlay caption chip (exact colours).
// Props never animate themselves: the scene calls rig.update(t).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { newCanvas } from "../../kit/canvas.js";
import { fresnelGlass } from "../../kit/materials.js";
import { rng, clamp } from "../../kit/time.js";
import * as MP from "./multiplane.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

// ---------------------------------------------------------------- colour helpers (pure)
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbCss = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** shade(rgb, dl): dl > 0 toward white, < 0 toward black */
const shade = (c, dl) => (dl >= 0 ? mixRgb(c, [255, 255, 255], dl) : mixRgb(c, [0, 0, 0], -dl));

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, G = spec.gouache, R = spec.rig;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const LAY = MP.layout(spec);
  const C = (k) => hexRgb(P[k]);

  // ================================================================ gouache painter
  /**
   * painter(level) -> { cv, ctx, W, H, X(u), Y(v), S(r), ... } for one layer canvas. Mapping: u in [-Mu, Mu] across,
   * v in [-Mv, Mv] up; S(r) converts a size in v-units (half frame heights) to px.
   */
  function painter(level, seed) {
    const P0 = R.pane;
    const Mu = level.full ? P0.w / 2 / level.halfW : level.margin;
    const Mv = level.full ? P0.d / 2 / level.halfH : level.margin;
    const W = level.px, H = Math.round((W * Mv * level.halfH) / (Mu * level.halfW));
    const cv = newCanvas(W, H), ctx = cv.getContext("2d");
    ctx.reset?.(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H);
    const k = W / 2048; // stroke scale
    const pp = {
      cv, ctx, W, H, Mu, Mv, k, r: rng(seed),
      X: (u) => ((u + Mu) / (2 * Mu)) * W,
      Y: (v) => ((Mv - v) / (2 * Mv)) * H,
      S: (r) => (r * H) / (2 * Mv),
      U: (x) => (x / W) * 2 * Mu - Mu,
      V: (y) => Mv - (y / H) * 2 * Mv,
      w: level.halfW / level.halfH, // u-unit / v-unit in metres
    };
    return pp;
  }

  /** one brush stroke with bristle marks */
  function stroke(pp, x, y, len, wid, ang, col, a, bend = 0.25) {
    const { ctx, r } = pp;
    const cx = Math.cos(ang), sy = Math.sin(ang), nx = -sy, ny = cx;
    const b = (r.next() - 0.5) * bend * len;
    const x0 = x - (cx * len) / 2, y0 = y - (sy * len) / 2, x1 = x + (cx * len) / 2, y1 = y + (sy * len) / 2;
    const qx = x + nx * b, qy = y + ny * b;
    ctx.lineCap = "round";
    ctx.globalAlpha = a; ctx.strokeStyle = rgbCss(col); ctx.lineWidth = wid;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(qx, qy, x1, y1); ctx.stroke();
    // dry-brush bristle streaks at the stroke's edges
    const dark = shade(col, -0.08), lite = shade(col, 0.1);
    ctx.lineWidth = Math.max(1, wid * 0.16);
    for (const [s, c2] of [[0.36, dark], [-0.3, lite]]) {
      const ox = nx * wid * s, oy = ny * wid * s;
      ctx.globalAlpha = a * 0.75; ctx.strokeStyle = rgbCss(c2);
      ctx.beginPath(); ctx.moveTo(x0 + ox + cx * wid * 0.4, y0 + oy + sy * wid * 0.4); ctx.quadraticCurveTo(qx + ox, qy + oy, x1 + ox - cx * wid * 0.3, y1 + oy - sy * wid * 0.3); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * paint(pp, path, bbox, colorAt, o): flat fill + brush strokes clipped to the shape + a darker brush edge.
   *   colorAt: rgb | (x, y) => rgb. o: { ang = 0, angJit = .35, density = 1, len, wid, lj, edge, edgeW, alpha }
   */
  function paint(pp, path, bbox, colorAt, o = {}) {
    const { ctx, r, k } = pp;
    const col = typeof colorAt === "function" ? colorAt : () => colorAt;
    const [bx0, by0, bx1, by1] = bbox;
    ctx.save();
    if (typeof colorAt === "function" && o.fill) ctx.fillStyle = o.fill; else ctx.fillStyle = rgbCss(col((bx0 + bx1) / 2, (by0 + by1) / 2));
    ctx.globalAlpha = 1; ctx.fill(path);
    ctx.clip(path);
    const L0 = (o.len ?? G.strokeLen).map((v) => v * k), W0 = (o.wid ?? G.strokeWid).map((v) => v * k);
    const area = Math.max(0, bx1 - bx0) * Math.max(0, by1 - by0);
    const n = Math.round(((o.density ?? 1) * G.coverage * area) / (((L0[0] + L0[1]) / 2) * ((W0[0] + W0[1]) / 2)));
    const lj = o.lj ?? G.lightJitter;
    for (let i = 0; i < n; i++) {
      const x = r.range(bx0, bx1), y = r.range(by0, by1);
      const base = col(x, y);
      const ang = (o.ang ?? 0) + (r.next() - 0.5) * 2 * (o.angJit ?? 0.35);
      stroke(pp, x, y, r.range(L0[0], L0[1]), r.range(W0[0], W0[1]), ang, shade(base, (r.next() - 0.5) * 2 * lj), r.range(G.strokeAlpha[0], G.strokeAlpha[1]) * (o.alpha ?? 1));
    }
    ctx.restore();
    if (o.edge !== false) {
      ctx.save();
      ctx.globalAlpha = 0.45; ctx.lineJoin = "round";
      ctx.strokeStyle = rgbCss(shade(col((bx0 + bx1) / 2, (by0 + by1) / 2), -(o.edgeDark ?? G.edgeDark)));
      ctx.lineWidth = (o.edgeW ?? 4) * k; ctx.stroke(path);
      ctx.restore();
    }
  }

  /** blob(cx, cy, rx, ry, r, wob, n) -> Path2D irregular rounded blob */
  function blob(cx, cy, rx, ry, r, wob = 0.12, n = 22) {
    const pts = [];
    const p1 = r.range(0, 6.28), p2 = r.range(0, 6.28);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = 1 + wob * (0.6 * Math.sin(3 * a + p1) + 0.4 * Math.sin(5 * a + p2)) + (r.next() - 0.5) * wob * 0.5;
      pts.push([cx + Math.cos(a) * rx * s, cy + Math.sin(a) * ry * s]);
    }
    return smoothClosed(pts);
  }
  function smoothClosed(pts) {
    const p = new Path2D(), n = pts.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m0 = mid(pts[n - 1], pts[0]);
    p.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) { const m = mid(pts[i], pts[(i + 1) % n]); p.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
    p.closePath();
    return p;
  }
  /** ridge(pp, crest(u) -> v, vBottom) -> { path, bbox } filled area under a crest line */
  function ridge(pp, crest, vBottom, u0 = -pp.Mu, u1 = pp.Mu, step = 0.02) {
    const p = new Path2D();
    p.moveTo(pp.X(u0), pp.Y(vBottom));
    let top = Infinity;
    for (let u = u0; u <= u1 + 1e-9; u += step) { const y = pp.Y(crest(u)); top = Math.min(top, y); p.lineTo(pp.X(u), y); }
    p.lineTo(pp.X(u1), pp.Y(vBottom)); p.closePath();
    return { path: p, bbox: [pp.X(u0), top - 4, pp.X(u1), pp.Y(vBottom)] };
  }
  /** leafPath(x, y, len, wid, ang) -> Path2D pointed leaf from its stem point */
  function leafPath(x, y, len, wid, ang) {
    const c = Math.cos(ang), s = Math.sin(ang), nx = -s, ny = c;
    const tx = x + c * len, ty = y + s * len, mx = x + c * len * 0.45, my = y + s * len * 0.45;
    const p = new Path2D();
    p.moveTo(x, y);
    p.quadraticCurveTo(mx + nx * wid, my + ny * wid, tx, ty);
    p.quadraticCurveTo(mx - nx * wid, my - ny * wid, x, y);
    p.closePath();
    return p;
  }
  const vgrad = (stops) => (x, y, H) => { // stops [[y01, rgb]]
    const t = clamp(y / H);
    for (let i = 0; i < stops.length - 1; i++) {
      const [a, ca] = stops[i], [b, cb] = stops[i + 1];
      if (t <= b) return mixRgb(ca, cb, clamp((t - a) / (b - a)));
    }
    return stops[stops.length - 1][1];
  };
  const pathBox = (pts, pad = 0) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  };

  // ================================================================ the six paintings
  function paintSky(level) {
    const pp = painter(level, G.seed + 1), { ctx, W, H, X, Y, S, r } = pp;
    const g = vgrad([[0, C("skyTop")], [(pp.Mv - 0.75) / (2 * pp.Mv), C("skyTop")], [(pp.Mv - 0.25) / (2 * pp.Mv), C("skyMid")], [(pp.Mv + 0.15) / (2 * pp.Mv), C("skyLow")], [1, C("skyLow")]]);
    const lg = ctx.createLinearGradient(0, 0, 0, H);
    for (let i = 0; i <= 12; i++) lg.addColorStop(i / 12, rgbCss(g(0, (i / 12) * H, H)));
    const all = new Path2D(); all.rect(0, 0, W, H);
    paint(pp, all, [0, 0, W, H], (x, y) => g(x, y, H), { fill: lg, ang: 0, angJit: 0.12, len: [70, 150], wid: [12, 24], lj: 0.045, edge: false, density: 0.9 });
    // sun: soft halo + painted disc
    const sx = X(-0.15), sy = Y(0.74), sr = S(0.085);
    const halo = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 4.5);
    halo.addColorStop(0, rgbCss(C("sun"), 0.75)); halo.addColorStop(1, rgbCss(C("sun"), 0));
    ctx.fillStyle = halo; ctx.fillRect(sx - sr * 5, sy - sr * 5, sr * 10, sr * 10);
    const sun = blob(sx, sy, sr, sr, r, 0.04);
    paint(pp, sun, [sx - sr, sy - sr, sx + sr, sy + sr], C("sun"), { angJit: 3, len: [14, 30], wid: [6, 12], lj: 0.05, edgeDark: 0.04 });
    // clouds: shaded underside first, light tops over it
    const clouds = [[-0.78, 0.5, 0.2], [0.42, 0.62, 0.24], [1.05, 0.42, 0.17], [-1.38, 0.3, 0.16], [1.45, 0.74, 0.2], [-0.45, 0.92, 0.12], [0.0, 1.25, 0.2], [-1.2, 1.15, 0.18], [1.2, 1.2, 0.16]];
    for (const [u, v, s] of clouds) {
      const n = 6;
      const parts = [];
      for (let i = 0; i < n; i++) {
        const du = (i / (n - 1) - 0.5) * s * 2.6 / pp.w, dv = Math.sin((i / (n - 1)) * Math.PI) * s * 0.55;
        parts.push([u + du, v + dv * 0.7, s * r.range(0.42, 0.62)]);
      }
      for (const [cu, cv, cs] of parts) {
        const b = blob(X(cu), Y(cv - cs * 0.1), S(cs * 1.15), S(cs * 0.8), r, 0.1);
        paint(pp, b, [X(cu) - S(cs * 1.2), Y(cv) - S(cs), X(cu) + S(cs * 1.2), Y(cv) + S(cs)], C("cloudShade"), { ang: 0, angJit: 0.4, len: [20, 45], wid: [8, 14], lj: 0.05, edgeDark: 0.04 });
      }
      for (const [cu, cv, cs] of parts) {
        const b = blob(X(cu - 0.01), Y(cv + cs * 0.12), S(cs), S(cs * 0.72), r, 0.12);
        paint(pp, b, [X(cu) - S(cs), Y(cv) - S(cs), X(cu) + S(cs), Y(cv) + S(cs)], C("cloud"), { ang: -0.3, angJit: 0.6, len: [18, 40], wid: [8, 14], lj: 0.035, edge: false });
      }
    }
    return pp.cv;
  }

  function paintHills(level) {
    const pp = painter(level, G.seed + 2), { X, Y, S, r } = pp;
    const far = (u) => 0.2 + 0.07 * Math.sin(u * 2.1 + 0.5) + 0.04 * Math.sin(u * 5.3 + 1.2) + 0.015 * Math.sin(u * 13.0);
    const near = (u) => 0.04 + 0.06 * Math.sin(u * 1.7 + 2.0) + 0.03 * Math.sin(u * 4.1) + 0.01 * Math.sin(u * 11.0 + 1);
    const f = ridge(pp, far, -pp.Mv);
    const cf = C("hillFar"), cn = C("hillNear");
    paint(pp, f.path, f.bbox, (x, y) => shade(cf, clamp((Y(far(pp.U(x))) - y) / S(0.4), -0.15, 0.1) * -0.6), { ang: 0.15, angJit: 0.35, len: [40, 90], wid: [10, 18], lj: 0.05, edgeDark: 0.05, edgeW: 3 });
    // a lighter ridge highlight
    for (let i = 0; i < 260; i++) {
      const u = r.range(-pp.Mu, pp.Mu), y = Y(far(u)) + r.range(2, 18) * pp.k;
      stroke(pp, X(u), y, r.range(30, 70) * pp.k, r.range(5, 9) * pp.k, r.range(-0.2, 0.2), shade(cf, 0.18), 0.25);
    }
    const n = ridge(pp, near, -pp.Mv);
    paint(pp, n.path, n.bbox, (x, y) => mixRgb(cn, shade(cn, -0.12), clamp((y - Y(near(pp.U(x)))) / S(0.6))), { ang: -0.1, angJit: 0.35, len: [36, 80], wid: [10, 18], lj: 0.06, edgeDark: 0.06, edgeW: 3 });
    // distant tree dabs along the near crest
    for (let i = 0; i < 90; i++) {
      const u = r.range(-pp.Mu, pp.Mu), v = near(u) - r.range(0.0, 0.05), rr = S(r.range(0.014, 0.03));
      const b = blob(X(u), Y(v), rr, rr * 1.15, r, 0.15, 12);
      pp.ctx.globalAlpha = 0.85; pp.ctx.fillStyle = rgbCss(shade(cn, -r.range(0.15, 0.28))); pp.ctx.fill(b); pp.ctx.globalAlpha = 1;
    }
    return pp.cv;
  }

  /** the cottage is painted onto the meadow; returns its door position (u, v) */
  function paintMeadow(level) {
    const pp = painter(level, G.seed + 3), { ctx, X, Y, S, r, H } = pp;
    const crest = (u) => -0.04 + 0.075 * Math.exp(-(((u - 0.3) / 0.6) ** 2)) + 0.02 * Math.sin(u * 2.3) + 0.006 * Math.sin(u * 9);
    const m = ridge(pp, crest, -pp.Mv);
    const cTop = C("meadow"), cLow = C("meadowDeep");
    const colAt = (x, y) => mixRgb(cTop, cLow, clamp((y - Y(0.05)) / (H - Y(0.05))));
    const lg = ctx.createLinearGradient(0, Y(0.08), 0, H);
    lg.addColorStop(0, rgbCss(cTop)); lg.addColorStop(1, rgbCss(cLow));
    paint(pp, m.path, m.bbox, colAt, { fill: lg, ang: -0.75, angJit: 0.3, len: [22, 50], wid: [7, 13], lj: 0.07, edgeDark: 0.08, edgeW: 3 });
    // sunny crest light
    for (let i = 0; i < 320; i++) {
      const u = r.range(-pp.Mu, pp.Mu), y = Y(crest(u)) + r.range(3, 40) * pp.k;
      stroke(pp, X(u), y, r.range(20, 50) * pp.k, r.range(5, 9) * pp.k, r.range(-0.3, 0.3), shade(cTop, 0.16), 0.25);
    }
    // small far tree on the left crest
    tree(pp, -0.66, crest(-0.66) - 0.01, 0.075, 0.13, 0.62);
    // path: a ribbon from the bottom edge to the cottage door
    const cl = [[-0.38, -1.42, 0.5], [-0.16, -0.95, 0.34], [-0.34, -0.58, 0.22], [-0.04, -0.3, 0.12], [0.2, -0.1, 0.06], [0.3, -0.005, 0.03]];
    const fine = [];
    for (let s = 0; s < cl.length - 1; s++) for (let q = 0; q < 12; q++) {
      const a = cl[s], b = cl[s + 1], t = q / 12, tt = t * t * (3 - 2 * t);
      fine.push([a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
    fine.push(cl[cl.length - 1]);
    const L = [], Rr = [];
    for (let i = 0; i < fine.length; i++) {
      const a = fine[Math.max(0, i - 1)], b = fine[Math.min(fine.length - 1, i + 1)];
      const dx = X(b[0]) - X(a[0]), dy = Y(b[1]) - Y(a[1]), d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d, ny = dx / d, hw = S(fine[i][2]) / 2;
      L.push([X(fine[i][0]) + nx * hw, Y(fine[i][1]) + ny * hw]); Rr.push([X(fine[i][0]) - nx * hw, Y(fine[i][1]) - ny * hw]);
    }
    const pathPts = L.concat(Rr.reverse());
    const pth = new Path2D(); pathPts.forEach(([x, y], i) => (i ? pth.lineTo(x, y) : pth.moveTo(x, y))); pth.closePath();
    paint(pp, pth, pathBox(pathPts), C("path"), { ang: -1.2, angJit: 0.5, len: [18, 40], wid: [6, 11], lj: 0.08, edgeDark: 0.14, edgeW: 4 });
    // cottage on the crest: gable front + side wall, red roof, chimney, warm windows, smoke
    cottage(pp, 0.3, 0.0);
    // flowers in the grass (more toward the front)
    for (let i = 0; i < 420; i++) {
      const v = -pp.Mv + Math.pow(r.next(), 1.6) * (pp.Mv - 0.08), u = r.range(-pp.Mu, pp.Mu);
      if (v > crest(u) - 0.03) continue;
      const near = clamp((-v + 0.1) / 1.2);
      const rr = (2 + near * 5) * pp.k;
      ctx.globalAlpha = 0.9; ctx.fillStyle = rgbCss(r.chance(0.55) ? C("flowerWhite") : r.chance(0.6) ? C("flowerYellow") : shade(C("flowerRed"), 0.15));
      ctx.beginPath(); ctx.ellipse(X(u), Y(v), rr, rr * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return pp.cv;
  }

  function cottage(pp, u, v) {
    const { ctx, X, Y, S, r, k } = pp;
    const x = X(u), y = Y(v), s = S(1);
    const fw = 0.11 * s, sw = 0.17 * s, wh = 0.095 * s, rh = 0.085 * s, lean = 0.03 * s;
    // front gable wall (left), side wall (right, receding)
    const front = new Path2D(); front.rect(x - fw, y - wh, fw, wh);
    const side = new Path2D(); side.moveTo(x, y); side.lineTo(x + sw, y - lean * 0.4); side.lineTo(x + sw, y - wh - lean * 0.4); side.lineTo(x, y - wh); side.closePath();
    paint(pp, front, [x - fw, y - wh, x, y], C("wallCream"), { ang: 1.4, angJit: 0.3, len: [10, 22], wid: [4, 7], lj: 0.05, edgeDark: 0.25, edgeW: 3 });
    paint(pp, side, [x, y - wh - lean, x + sw, y], C("wallShade"), { ang: 1.4, angJit: 0.3, len: [10, 22], wid: [4, 7], lj: 0.05, edgeDark: 0.25, edgeW: 3 });
    // gable triangle + roof slab
    const gable = new Path2D(); gable.moveTo(x - fw - 0.01 * s, y - wh); gable.lineTo(x - fw / 2, y - wh - rh); gable.lineTo(x + 0.01 * s, y - wh); gable.closePath();
    paint(pp, gable, [x - fw, y - wh - rh, x, y - wh], C("wallCream"), { ang: 1.4, len: [8, 16], wid: [4, 6], lj: 0.05, edgeDark: 0.2, edgeW: 3 });
    const roof = new Path2D();
    roof.moveTo(x - fw / 2, y - wh - rh); roof.lineTo(x + sw + 0.012 * s - fw / 2 + fw / 2, y - wh - rh - lean * 0.4);
    roof.lineTo(x + sw + 0.025 * s, y - wh - lean * 0.4 + 0.006 * s); roof.lineTo(x + 0.012 * s, y - wh + 0.006 * s); roof.closePath();
    paint(pp, roof, [x - fw / 2, y - wh - rh - lean, x + sw + 0.03 * s, y - wh + 0.01 * s], (xx, yy) => mixRgb(C("roof"), C("roofDark"), clamp((yy - (y - wh - rh)) / rh)), { ang: 0.55, angJit: 0.2, len: [12, 26], wid: [4, 8], lj: 0.07, edgeDark: 0.3, edgeW: 3 });
    // chimney + smoke
    const cx = x + sw * 0.62, cyTop = y - wh - rh - 0.035 * s;
    const ch = new Path2D(); ch.rect(cx, cyTop, 0.022 * s, 0.07 * s);
    paint(pp, ch, [cx, cyTop, cx + 0.022 * s, cyTop + 0.07 * s], C("roofDark"), { len: [6, 10], wid: [3, 5], edgeW: 2 });
    for (let i = 0; i < 14; i++) {
      const t = i / 13, px = cx + 0.011 * s + Math.sin(t * 5) * 0.02 * s + t * 0.09 * s, py = cyTop - t * 0.5 * s;
      const rr = (0.014 + t * 0.03) * s;
      ctx.globalAlpha = 0.5 * (1 - t * 0.75); ctx.fillStyle = rgbCss(mixRgb(C("cloud"), C("cloudShade"), 0.4));
      ctx.fill(blob(px, py, rr, rr * 0.8, r, 0.15, 12));
    }
    ctx.globalAlpha = 1;
    // door + windows
    const door = new Path2D(); door.rect(x - fw * 0.66, y - wh * 0.62, fw * 0.32, wh * 0.62);
    paint(pp, door, [x - fw, y - wh, x, y], C("trunk"), { len: [6, 10], wid: [3, 5], edgeW: 2, edgeDark: 0.3 });
    for (const t of [0.25, 0.68]) {
      const wx = x + sw * t, wy = y - wh * 0.72 - lean * 0.4 * t;
      const wn = new Path2D(); wn.rect(wx, wy, 0.032 * s, 0.032 * s);
      paint(pp, wn, [wx, wy, wx + 0.032 * s, wy + 0.032 * s], C("window"), { len: [5, 8], wid: [3, 4], lj: 0.04, edgeW: 3, edgeDark: 0.55 });
      ctx.strokeStyle = rgbCss(shade(C("trunk"), -0.2), 0.8); ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.moveTo(wx + 0.016 * s, wy); ctx.lineTo(wx + 0.016 * s, wy + 0.032 * s); ctx.moveTo(wx, wy + 0.016 * s); ctx.lineTo(wx + 0.032 * s, wy + 0.016 * s); ctx.stroke();
    }
  }

  /** tree(pp, u, vBase, crownR, trunkH, light) — trunk + clustered round crown (light from the upper left) */
  function tree(pp, u, vBase, rad, trunkH, lightness = 1) {
    const { X, Y, S, r } = pp;
    const x = X(u), y = Y(vBase), R0 = S(rad), th = S(trunkH);
    const tw = R0 * 0.16;
    const trunk = new Path2D();
    trunk.moveTo(x - tw, y); trunk.quadraticCurveTo(x - tw * 0.5, y - th * 0.5, x - tw * 0.45, y - th - R0 * 0.4);
    trunk.lineTo(x + tw * 0.45, y - th - R0 * 0.4); trunk.quadraticCurveTo(x + tw * 0.6, y - th * 0.5, x + tw * 1.1, y); trunk.closePath();
    paint(pp, trunk, [x - tw, y - th - R0, x + tw, y], (xx) => (xx > x ? shade(C("trunk"), -0.15) : C("trunk")), { ang: -1.5, angJit: 0.15, len: [14, 30], wid: [4, 7], lj: 0.06, edgeDark: 0.2, edgeW: 3 });
    const cy = y - th - R0 * 0.75;
    const parts = [[0, 0, 0.62]];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + r.range(-0.3, 0.3); parts.push([Math.cos(a) * 0.48, Math.sin(a) * 0.4, r.range(0.4, 0.55)]); }
    const leaf = shade(C("leaf"), (lightness - 1) * -0.3), dark = C("leafDark"), lite = C("leafLight");
    for (const [ox, oy, s] of parts) { // dark mass, offset down-right
      const b = blob(x + ox * R0 + R0 * 0.06, cy + oy * R0 + R0 * 0.08, s * R0, s * R0 * 0.92, r, 0.14);
      pp.ctx.fillStyle = rgbCss(dark); pp.ctx.fill(b);
    }
    for (const [ox, oy, s] of parts) {
      const bx = x + ox * R0, by = cy + oy * R0, br = s * R0 * 0.9;
      const b = blob(bx, by, br, br * 0.92, r, 0.14);
      paint(pp, b, [bx - br, by - br, bx + br, by + br], (xx, yy) => mixRgb(lite, leaf, clamp(((xx - bx) * -0.6 + (yy - by)) / (br * 1.3) * 0.5 + 0.55)), { ang: -0.8, angJit: 1.2, len: [10, 24], wid: [6, 11], lj: 0.08, edgeDark: 0.1, edgeW: 3 });
    }
  }

  function paintGrove(level) {
    const pp = painter(level, G.seed + 4), { X, Y, S, r } = pp;
    // a row of bushes at the grove's foot, then three trees
    for (let i = 0; i < 9; i++) {
      const u = 0.02 + i * 0.09 + r.range(-0.02, 0.02), v = -0.1 + r.range(-0.03, 0.02), rr = S(r.range(0.06, 0.09));
      const b = blob(X(u), Y(v), rr * 1.2, rr, r, 0.14);
      paint(pp, b, [X(u) - rr * 1.3, Y(v) - rr, X(u) + rr * 1.3, Y(v) + rr], (xx, yy) => mixRgb(C("leafLight"), C("leafDark"), clamp((yy - Y(v) + rr) / (2 * rr))), { ang: -0.8, angJit: 1, len: [10, 22], wid: [6, 10], lj: 0.08, edgeW: 3 });
    }
    tree(pp, 0.66, -0.16, 0.24, 0.2, 1.02);
    tree(pp, 0.16, -0.14, 0.28, 0.22, 0.98);
    tree(pp, 0.42, -0.2, 0.34, 0.26, 1.0);
    // a few leaves catching light along the bush row
    for (let i = 0; i < 80; i++) {
      const u = r.range(0.0, 0.8), v = r.range(-0.16, -0.02);
      stroke(pp, X(u), Y(v), r.range(10, 20) * pp.k, r.range(5, 8) * pp.k, r.range(-1, 0), C("leafLight"), 0.4);
    }
    return pp.cv;
  }

  function paintFoliage(level) {
    const pp = painter(level, G.seed + 5), { ctx, X, Y, S, r, k } = pp;
    const fern = C("fern"), fernL = C("fernLight"), dark = shade(C("leafDark"), -0.15);
    // --- dark masses behind the fronds (bottom-left, bottom-right)
    for (const [u, v, rx, ry] of [[-1.15, -1.25, 0.5, 0.42], [1.18, -1.22, 0.52, 0.45], [-1.35, 1.2, 0.5, 0.3]]) {
      const b = blob(X(u), Y(v), S(rx), S(ry), r, 0.12);
      paint(pp, b, [X(u) - S(rx), Y(v) - S(ry), X(u) + S(rx), Y(v) + S(ry)], dark, { ang: -0.8, angJit: 1, len: [16, 34], wid: [7, 12], lj: 0.06, edgeW: 3 });
    }
    // --- fern fronds, bottom-left: curved stems with alternating leaflets
    const frond = (bu, bv, ang, len, curl, col, lite) => {
      let x = X(bu), y = Y(bv), a = ang;
      const L = S(len), steps = 14, seg = L / steps;
      ctx.strokeStyle = rgbCss(shade(col, -0.2)); ctx.lineWidth = 4 * k; ctx.lineCap = "round";
      const pts = [];
      for (let i = 0; i <= steps; i++) { pts.push([x, y, a]); x += Math.cos(a) * seg; y += Math.sin(a) * seg; a += curl / steps; }
      ctx.globalAlpha = 0.9; ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke(); ctx.globalAlpha = 1;
      for (let i = 1; i < pts.length; i++) {
        const [px, py, pa] = pts[i], t = i / steps, ll = S(len) * 0.2 * (1 - t * 0.75), ww = ll * 0.3;
        for (const sgn of [1, -1]) {
          const lp = leafPath(px, py, ll, ww, pa + sgn * 1.05);
          paint(pp, lp, [px - ll, py - ll, px + ll, py + ll], mixRgb(col, lite, t * 0.8), { ang: pa, angJit: 0.3, len: [8, 16], wid: [4, 7], lj: 0.07, edgeDark: 0.18, edgeW: 2, density: 1.4 });
        }
      }
    };
    for (let i = 0; i < 9; i++) frond(-1.3 + r.range(-0.05, 0.25), -1.32, -0.25 - i * 0.16 + r.range(-0.05, 0.05), r.range(0.45, 0.7), r.range(0.4, 0.8), fern, fernL);
    // --- bottom-right bush with flowers
    for (let i = 0; i < 16; i++) {
      const u = r.range(0.62, 1.3), v = r.range(-1.3, -0.72), rr = S(r.range(0.07, 0.12));
      const b = blob(X(u), Y(v), rr, rr * 0.9, r, 0.15);
      paint(pp, b, [X(u) - rr, Y(v) - rr, X(u) + rr, Y(v) + rr], (xx, yy) => mixRgb(fernL, fern, clamp((yy - Y(v) + rr) / (2 * rr) + 0.2)), { ang: -0.8, angJit: 1.2, len: [10, 22], wid: [6, 10], lj: 0.07, edgeW: 3 });
    }
    for (let i = 0; i < 26; i++) {
      const u = r.range(0.62, 1.28), v = r.range(-1.25, -0.74), rr = S(r.range(0.022, 0.034));
      const red = r.chance(0.45), x0 = X(u), y0 = Y(v);
      const petals = red ? 5 : 9;
      for (let p = 0; p < petals; p++) {
        const a = (p / petals) * Math.PI * 2 + r.range(0, 0.4);
        const lp = red ? blob(x0 + Math.cos(a) * rr * 0.55, y0 + Math.sin(a) * rr * 0.55, rr * 0.62, rr * 0.55, r, 0.12, 10) : leafPath(x0, y0, rr * 1.2, rr * 0.28, a);
        ctx.fillStyle = rgbCss(red ? shade(C("flowerRed"), r.range(-0.08, 0.06)) : shade(C("flowerWhite"), -r.range(0, 0.06))); ctx.fill(lp);
      }
      ctx.fillStyle = rgbCss(red ? shade(C("ink"), 0.15) : C("flowerYellow"));
      ctx.beginPath(); ctx.arc(x0, y0, rr * (red ? 0.28 : 0.32), 0, Math.PI * 2); ctx.fill();
    }
    // --- overhanging branch, top-left, with hanging leaves
    const br = [[-1.35, 1.08], [-1.0, 1.02], [-0.72, 0.92], [-0.48, 0.86]];
    ctx.strokeStyle = rgbCss(shade(C("trunk"), -0.25)); ctx.lineCap = "round";
    for (let i = 0; i < br.length - 1; i++) {
      ctx.lineWidth = (26 - i * 7) * k;
      ctx.beginPath(); ctx.moveTo(X(br[i][0]), Y(br[i][1])); ctx.lineTo(X(br[i + 1][0]), Y(br[i + 1][1])); ctx.stroke();
    }
    ctx.lineWidth = 6 * k; ctx.strokeStyle = rgbCss(shade(C("trunk"), 0.05), 0.6);
    ctx.beginPath(); ctx.moveTo(X(-1.35), Y(1.095)); ctx.lineTo(X(-0.75), Y(0.94)); ctx.stroke();
    for (let i = 0; i < 70; i++) {
      const t = r.next(), seg = Math.min(2, Math.floor(t * 3)), f = t * 3 - seg;
      const bu = br[seg][0] + (br[seg + 1][0] - br[seg][0]) * f, bv = br[seg][1] + (br[seg + 1][1] - br[seg][1]) * f;
      const x0 = X(bu), y0 = Y(bv), ll = S(r.range(0.06, 0.1)), a = Math.PI / 2 + r.range(-0.9, 0.7);
      const lp = leafPath(x0, y0, ll, ll * 0.32, a);
      paint(pp, lp, [x0 - ll, y0 - ll, x0 + ll, y0 + ll], r.chance(0.3) ? fernL : mixRgb(fern, dark, r.range(0, 0.5)), { ang: a, angJit: 0.3, len: [8, 14], wid: [4, 7], lj: 0.07, edgeDark: 0.18, edgeW: 2, density: 1.3 });
    }
    // --- tall grass blades along the bottom edge
    for (let i = 0; i < 150; i++) {
      const u = r.range(-pp.Mu, pp.Mu), h = S(r.range(0.12, 0.3)) * (Math.abs(u) > 0.5 ? 1.3 : 0.7);
      const x0 = X(u), y0 = Y(-pp.Mv) + 4, lean = r.range(-0.35, 0.35);
      const p = new Path2D();
      const w = r.range(5, 10) * k;
      p.moveTo(x0 - w, y0); p.quadraticCurveTo(x0 + lean * h * 0.3, y0 - h * 0.6, x0 + lean * h, y0 - h); p.quadraticCurveTo(x0 + lean * h * 0.3 + w * 0.3, y0 - h * 0.55, x0 + w, y0); p.closePath();
      ctx.fillStyle = rgbCss(mixRgb(fern, fernL, r.range(0, 0.6))); ctx.fill(p);
    }
    return pp.cv;
  }

  /** sheen + dust on the top glass, painted over the reference frame of the top pane */
  function paintSheen(level) {
    const pp = painter({ ...level, px: 1536 }, G.seed + 6), { ctx, W, H, r } = pp;
    const GL = spec.glass;
    const g = ctx.createLinearGradient(W * 0.15, 0, W * 0.75, H);
    g.addColorStop(0.0, "rgba(255,255,255,0)"); g.addColorStop(0.42, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(255,255,255,${GL.sheen})`); g.addColorStop(0.56, `rgba(255,255,255,${GL.sheen * 0.5})`);
    g.addColorStop(0.62, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < GL.dust; i++) {
      const x = r.range(0, W), y = r.range(0, H), rr = r.range(0.7, 1.6);
      ctx.fillStyle = `rgba(70,60,50,${r.range(0.18, 0.32)})`;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "rgba(80,70,60,0.18)"; ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) { const x = r.range(0, W), y = r.range(0, H); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + r.range(-20, 20), y + r.range(-20, 20), x + r.range(-30, 30), y + r.range(-30, 30)); ctx.stroke(); }
    return pp.cv;
  }

  // ================================================================ the cel bird (atlas of drawings)
  const CELL = [512, 384];
  /** birdParts(ctx, k, cx, cy) -> Path2Ds for drawing k (wing elevation from the pose) */
  function birdParts(kPose, cx, cy) {
    const a = 1.15 * Math.cos((kPose / spec.cel.poses) * Math.PI * 2);
    const h = 150 * Math.sin(a), hf = h * 0.82;
    const wing = (sx, sy, hh, len) => {
      const p = new Path2D();
      p.moveTo(sx + 26, sy);
      p.quadraticCurveTo(sx + 10, sy - hh * 0.6, sx - 8, sy - hh);
      // scalloped trailing edge (three primaries)
      p.quadraticCurveTo(sx - len * 0.35, sy - hh * 1.02, sx - len * 0.45, sy - hh * 0.86);
      p.quadraticCurveTo(sx - len * 0.6, sy - hh * 0.8, sx - len * 0.66, sy - hh * 0.62);
      p.quadraticCurveTo(sx - len * 0.82, sy - hh * 0.5, sx - len * 0.8, sy - hh * 0.3);
      p.quadraticCurveTo(sx - len * 0.7, sy + 6, sx - len * 0.55, sy + 10);
      p.closePath();
      return p;
    };
    const farWing = wing(cx - 6, cy - 22, hf, 150);
    const nearWing = wing(cx + 14, cy - 8, h, 170);
    const body = new Path2D(); body.ellipse(cx - 6, cy + 10, 118, 58, -0.12, 0, Math.PI * 2);
    const head = new Path2D(); head.arc(cx + 98, cy - 22, 50, 0, Math.PI * 2);
    const tail = new Path2D();
    tail.moveTo(cx - 100, cy + 4); tail.lineTo(cx - 205, cy - 22); tail.lineTo(cx - 168, cy + 18); tail.lineTo(cx - 210, cy + 48); tail.lineTo(cx - 96, cy + 34); tail.closePath();
    const beak = new Path2D(); beak.moveTo(cx + 140, cy - 34); beak.lineTo(cx + 190, cy - 18); beak.lineTo(cx + 140, cy - 6); beak.closePath();
    return { farWing, nearWing, body, head, tail, beak, h };
  }
  function birdAtlas() {
    const n = spec.cel.poses, cols = 4, rows = Math.ceil(n / cols);
    const cv = newCanvas(CELL[0] * cols, CELL[1] * rows), ctx = cv.getContext("2d");
    const sh = newCanvas(CELL[0] * cols, CELL[1] * rows), sx = sh.getContext("2d");
    ctx.reset?.(); sx.reset?.();
    ctx.clearRect(0, 0, cv.width, cv.height); sx.clearRect(0, 0, sh.width, sh.height);
    const ink = P.ink, inkW = spec.cel.ink;
    const fillInk = (p, col) => { ctx.fillStyle = col; ctx.fill(p); ctx.strokeStyle = ink; ctx.lineWidth = inkW; ctx.lineJoin = "round"; ctx.stroke(p); };
    for (let k = 0; k < n; k++) {
      const ox = (k % cols) * CELL[0], oy = Math.floor(k / cols) * CELL[1];
      const cx = ox + CELL[0] / 2 + 20, cy = oy + CELL[1] / 2 + 6;
      const B = birdParts(k, cx, cy);
      ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, CELL[0], CELL[1]); ctx.clip();
      fillInk(B.farWing, P.birdShade);
      fillInk(B.tail, P.birdShade);
      fillInk(B.body, P.bird);
      // belly + cel shade band, clipped to the body (flat tones, no gradient)
      ctx.save(); ctx.clip(B.body);
      ctx.fillStyle = P.birdBelly; ctx.beginPath(); ctx.ellipse(cx + 10, cy + 52, 110, 40, -0.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(20,40,80,0.22)"; ctx.beginPath(); ctx.ellipse(cx - 30, cy + 74, 130, 34, -0.12, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = ink; ctx.lineWidth = inkW; ctx.stroke(B.body);
      fillInk(B.head, P.bird);
      ctx.save(); ctx.clip(B.head);
      ctx.fillStyle = P.birdBelly; ctx.beginPath(); ctx.ellipse(cx + 116, cy + 8, 40, 26, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.beginPath(); ctx.ellipse(cx + 86, cy - 52, 26, 10, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = ink; ctx.lineWidth = inkW; ctx.stroke(B.head);
      fillInk(B.beak, P.beak);
      fillInk(B.nearWing, P.bird);
      // feather lines + cel shade on the near wing
      ctx.save(); ctx.clip(B.nearWing);
      ctx.fillStyle = "rgba(20,40,80,0.2)"; ctx.beginPath(); ctx.ellipse(cx - 70, cy - 8 - B.h * 0.25, 90, Math.abs(B.h) * 0.35 + 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = ink; ctx.lineWidth = inkW * 0.5;
      for (const f of [0.45, 0.66]) { ctx.beginPath(); ctx.moveTo(cx + 14 - 170 * f * 0.6, cy - 8 - B.h * 0.15); ctx.lineTo(cx + 14 - 170 * f, cy - 8 - B.h * (0.86 - f * 0.4)); ctx.stroke(); }
      // eye
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(cx + 112, cy - 30, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(cx + 115, cy - 33, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // silhouette for the cel shadow
      sx.save(); sx.beginPath(); sx.rect(ox, oy, CELL[0], CELL[1]); sx.clip();
      sx.filter = `blur(${spec.cel.shadow.blur}px)`;
      sx.fillStyle = "#000000";
      for (const p of [B.farWing, B.tail, B.body, B.head, B.beak, B.nearWing]) sx.fill(p);
      sx.restore();
    }
    return { cv, sh, cols, rows };
  }

  // ================================================================ textures + layer meshes
  function canvasTex(cv) {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.premultiplyAlpha = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    stage.renderer.initTexture(t);
    return t;
  }
  function paintMat(tex, opacity = 1) {
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide, opacity });
    m.name = "paint";
    return m;
  }
  /** flat horizontal plane (picture-up = -Z) of w x d metres */
  function flat(w, d, mat) {
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = false;
    return m;
  }

  // ================================================================ the rig
  function box(w, h, d, mat, x, y, z, cast = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true;
    return m;
  }
  /** room() -> Group: oak floor + two cream walls (a bright studio corner) */
  function room() {
    const g = new THREE.Group(); g.name = "room";
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), materials.floor);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(44, 16), materials.wall); back.position.set(0, 8, -7.5); back.receiveShadow = true; g.add(back);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(44, 16), materials.wall); left.position.set(-9.5, 8, 0); left.rotation.y = Math.PI / 2; left.receiveShadow = true; g.add(left);
    const skirting = box(44, 0.18, 0.04, materials.camTrim, 0, 0.09, -7.48, false); g.add(skirting);
    const sk2 = box(0.04, 0.18, 44, materials.camTrim, -9.48, 0.09, 0, false); g.add(sk2);
    return g;
  }

  /** camera() -> Group: a film camera body hanging from the bridge, lens pointing straight down */
  function filmCamera() {
    const g = new THREE.Group(); g.name = "filmCamera";
    const lensBottom = R.lensY + 0.1;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 36), materials.lens);
    lens.position.y = lensBottom + 0.1; lens.castShadow = true; g.add(lens);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.016, 10, 36), materials.brass); ring.rotation.x = Math.PI / 2; ring.position.y = lensBottom + 0.02; g.add(ring);
    const bodyM = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.4, 0.52, 3, 0.05), materials.camBody);
    bodyM.position.y = lensBottom + 0.4; bodyM.castShadow = true; g.add(bodyM);
    // film magazine: a rounded housing over the body with one reel cover on its side (a side-on magazine)
    const top = lensBottom + 0.6;
    const mag = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.34, 0.46, 3, 0.12), materials.camBody);
    mag.position.set(-0.04, top + 0.17, 0); mag.castShadow = true; g.add(mag);
    for (const sz of [-1, 1]) {
      const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 32), materials.steelDark);
      cover.rotation.x = Math.PI / 2; cover.position.set(-0.04, top + 0.17, sz * 0.235); g.add(cover);
    }
    // a cantilever arm from a column on the back rail holds the camera over the centre of the stack (no beam
    // across the front, so the rig shots look down into the panes unobstructed)
    const armY = top + 0.34 + 0.05;
    g.add(box(0.16, 0.1, R.postZ + 0.12, materials.steelDark, 0, armY, (-R.postZ + 0.12) / 2));
    g.add(box(0.12, armY - R.topY + 0.05, 0.12, materials.steelDark, 0, (armY + R.topY) / 2, -R.postZ));
    return g;
  }

  /**
   * multiplane(plan) -> { group, trays, bird, update(t) } (adds itself): the painted stack in its rig, in a studio.
   */
  function multiplane(plan) {
    const group = new THREE.Group(); group.name = "multiplane";
    group.add(room());
    const PA = R.pane;
    // plinth + legs
    const pl = R.plinth;
    group.add(box(2 * R.postX + 0.5, pl.h, 2 * R.postZ + 0.3, materials.steelDark, 0, pl.y + pl.h / 2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) group.add(box(0.16, pl.legs, 0.16, materials.steelDark, sx * (R.postX + 0.05), pl.legs / 2, sz * (R.postZ + 0.02)));
    // posts + top frame
    const postH = R.topY - (pl.y + pl.h);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) group.add(box(R.post, postH, R.post, materials.steel, sx * R.postX, pl.y + pl.h + postH / 2, sz * R.postZ));
    group.add(box(2 * R.postX + R.post, 0.1, 0.1, materials.steel, 0, R.topY - 0.05, -R.postZ)); // back top rail only: the front stays open
    for (const sx of [-1, 1]) group.add(box(0.1, 0.1, 2 * R.postZ, materials.steel, sx * R.postX, R.topY - 0.05, 0));
    group.add(filmCamera());

    // paintings
    const atlas = birdAtlas();
    const painters = { sky: paintSky, hills: paintHills, meadow: paintMeadow, grove: paintGrove, foliage: paintFoliage };
    const glassTop = fresnelGlass({ color: "#e6f3ee", alphaFace: spec.glass.alphaFace, alphaRim: spec.glass.alphaRim, fresnelPower: spec.glass.fresnelPower, rimStrength: spec.glass.rimStrength, toLight: [-0.6, 1, 0.7] });
    glassTop.name = "glass";
    glassTop.specularIntensity = 0; glassTop.clearcoat = 0; // no sun hot-spot when looking straight down the stack; the rim term keeps the reveal glassy
    const trays = [];
    let ro = 10;
    for (const L of LAY.levels) {
      const tray = new THREE.Group(); tray.name = `tray-${L.id}`; tray.position.y = L.y;
      // rails (fixed) under the tray, front and back
      for (const sz of [-1, 1]) group.add(box(2 * R.postX, 0.035, 0.07, materials.steel, 0, L.y - PA.thick - 0.02, sz * (PA.d / 2 - 0.02)));
      // glass sheet + its edge
      const glass = new THREE.Mesh(new THREE.BoxGeometry(PA.w, PA.thick, PA.d), [materials.glassEdge, materials.glassEdge, glassTop, glassTop, materials.glassEdge, materials.glassEdge]);
      glass.position.y = -PA.thick / 2; glass.renderOrder = ro++; glass.castShadow = false; tray.add(glass);
      // steel tray border (front/back strips + short ends)
      const tb = R.tray;
      for (const sz of [-1, 1]) tray.add(box(PA.w + 0.04, 0.03, tb, materials.steel, 0, -PA.thick - 0.005, sz * (PA.d / 2 + tb / 2 - 0.01)));
      for (const sx of [-1, 1]) tray.add(box(tb, 0.03, PA.d + 0.06, materials.steel, sx * (PA.w / 2 + tb / 2 - 0.01), -PA.thick - 0.005, 0));
      // peg bar near the front edge of each pane
      const peg = box(R.peg.len, 0.03, 0.06, materials.brass, 0, 0.015, PA.d / 2 - 0.14); tray.add(peg);
      for (let p = 0; p < R.peg.pegs; p++) {
        const px = (p - (R.peg.pegs - 1) / 2) * (R.peg.len * 0.42);
        const pin = p === 1 ? box(0.09, 0.05, 0.03, materials.brass, px, 0.04, PA.d / 2 - 0.14) : new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 14), materials.brass);
        if (p !== 1) { pin.position.set(px, 0.04, PA.d / 2 - 0.14); pin.castShadow = true; }
        tray.add(pin);
      }
      // the painting on this pane
      if (painters[L.id]) {
        const art = MP.paneArt(spec, L);
        const tex = canvasTex(painters[L.id](L));
        const m = flat(art.x1 - art.x0, art.z1 - art.z0, paintMat(tex));
        m.position.y = 0.002; m.renderOrder = ro++; m.name = `art-${L.id}`;
        tray.add(m);
      } else ro++;
      if (L.id === "foliage") {
        const sh = flat(2 * 1.3 * L.halfW, 2 * 1.3 * L.halfH, paintMat(canvasTex(paintSheen({ ...L, margin: 1.3 }))));
        sh.position.y = 0.004; sh.renderOrder = 40; sh.name = "sheen"; tray.add(sh);
      }
      group.add(tray);
      trays.push(tray);
    }
    // lamp bars between the shelves, both sides, glowing toward the stack
    for (let i = 0; i < LAY.levels.length - 1; i++) {
      const y = LAY.levels[i].y + R.gap * 0.5;
      for (const sx of [-1, 1]) {
        const hx = sx * (R.postX - 0.02);
        group.add(box(0.1, 0.12, R.lamp.len, materials.lampHousing, hx, y, 0));
        group.add(box(0.015, 0.05, R.lamp.len - 0.1, materials.lampStrip, hx - sx * 0.057, y - 0.01, 0, false));
      }
    }
    // hand wheel on the sliding tray's front-left (turns as the tray slides)
    const SLv = LAY.levels[plan.slideLevel];
    const wheel = new THREE.Group(); wheel.name = "handWheel";
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 10, 40), materials.steelDark); wheel.add(rim);
    for (let s = 0; s < 4; s++) { const sp = box(0.32, 0.02, 0.02, materials.steelDark, 0, 0, 0); sp.rotation.z = (s * Math.PI) / 4; wheel.add(sp); }
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.09, 12), materials.brass); knob.rotation.x = Math.PI / 2; knob.position.set(0.17, 0, 0.045); wheel.add(knob);
    wheel.position.set(-R.postX + 0.35, SLv.y - 0.05, R.postZ + 0.12);
    group.add(wheel);

    // the cel bird + its cel shadow
    const cel = LAY.byId.cel, grove = LAY.byId.grove;
    const birdW = spec.cel.size * 2 * cel.halfH * (CELL[0] / 420), birdH = birdW * (CELL[1] / CELL[0]);
    const btex = canvasTex(atlas.cv); btex.repeat.set(1 / atlas.cols, 1 / atlas.rows); btex.wrapS = btex.wrapT = THREE.ClampToEdgeWrapping;
    btex.minFilter = THREE.LinearFilter; btex.generateMipmaps = false; // atlas cells: no mip bleed between drawings
    const bird = flat(birdW, birdH, paintMat(btex)); bird.position.y = 0.003; bird.renderOrder = 30; bird.name = "celBird";
    trays[cel.i].add(bird);
    const stex = canvasTex(atlas.sh); stex.repeat.set(1 / atlas.cols, 1 / atlas.rows); stex.minFilter = THREE.LinearFilter; stex.generateMipmaps = false;
    const shadow = flat(birdW * 1.02, birdH * 1.02, paintMat(stex, spec.cel.shadow.alpha)); shadow.renderOrder = 25; shadow.name = "celShadow";
    shadow.position.y = grove.y + 0.004;
    group.add(shadow);
    const setPose = (tex, k, flip) => {
      tex.offset.set((k % atlas.cols) / atlas.cols, 1 - (Math.floor(k / atlas.cols) + 1) / atlas.rows);
    };

    stage.scene.add(group);
    group.traverse((o) => { if (o.isMesh && o.material?.transparent) o.castShadow = false; });
    return {
      group, trays, bird, shadow, wheel,
      update(t) {
        const sl = plan.slideAt(t);
        trays[plan.slideLevel].position.x = sl;
        wheel.rotation.z = -sl / 0.17;
        const b = plan.birdAt(t);
        bird.position.set(b.u * cel.halfW, 0.003, -b.v * cel.halfH);
        bird.scale.x = b.flip ? -1 : 1;
        setPose(btex, b.pose);
        const so = spec.cel.shadow.offset;
        shadow.position.set(b.u * cel.halfW + so[0] * cel.halfH, grove.y + 0.004, -(b.v + so[1]) * cel.halfH);
        shadow.scale.x = b.flip ? -1 : 1;
        setPose(stex, b.pose);
      },
    };
  }

  // ================================================================ overlay caption
  /** caption() -> overlay chip (cream card, ink serif italic, thin brown rule); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1100, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      const font = `${Q.italic ? "italic " : ""}${Q.weight} ${Q.cap * 1.25}px ${Q.font}`;
      x.font = font;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.9);
      const pw = Math.min(W - 16, pad * 2 + tw), ph = Q.h, oy = 6, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(40,25,10,0.25)"; x.beginPath(); x.roundRect(ox + 3, oy + 6, pw, ph, 10); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 10); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 2; x.beginPath(); x.roundRect(ox + 6, oy + 6, pw - 12, ph - 12, 6); x.stroke();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "center"; x.font = font;
      x.fillText(st.text, ox + pw / 2, oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  /** applyCamera(cam, pose) — straight-down-safe camera placement from a multiplane.js pose (uses pose.up) */
  function applyCamera(cam, pose) {
    cam.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    cam.up.set(pose.up[0], pose.up[1], pose.up[2]);
    cam.lookAt(pose.target[0], pose.target[1], pose.target[2]);
    if (cam.fov !== pose.fov) { cam.fov = pose.fov; cam.updateProjectionMatrix(); }
    cam.userData.rigTarget = pose.target;
    cam.updateWorldMatrix(true, false);
  }

  const props = { multiplane, caption, room, filmCamera };
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: MP, motion: MP, layout: LAY, applyCamera,
    painters: { paintSky, paintHills, paintMeadow, paintGrove, paintFoliage, paintSheen, birdAtlas },
  };
}
