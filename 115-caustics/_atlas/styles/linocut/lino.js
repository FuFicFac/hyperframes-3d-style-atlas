// styles/linocut/lino.js — the linocut PLANNER (pure, Node-safe: no THREE, no window, no DOM).
// Imported by style.js (picture) and by the demo's scene.config.js (SCORE, camera keys), so every groove, the roller,
// the paper, the baren and every sound cue come from the same plan.
//
// Coordinates. PRINT space (px, py): the picture as it should read on paper, metres, y up, centred on the block.
// BLOCK space (bx, by): the lino as it lies on the bench seen from above, bx = -px (the block is carved MIRRORED),
// by = py. WORLD: x = bx, z = -by, the lino top at y = block.top (style.js).
//
// What it plans (all closed forms or one-off bakes, never stepped per frame):
//  * makeDesign(): an original bold design as a signed-distance function (crescent moon, a cat on a roof with a
//    chimney, four stars, the word LOOK, a raised border; carved details: two roof-tile lines and the cat's eye).
//    Negative = raised (printing) area. A seeded low-frequency wobble makes the edges look hand cut.
//  * strokes: (1) contour cuts with a small V: marching squares on the SDF at a fixed offset, chained, smoothed,
//    split at corners and by length, oriented to push away from the carver; (2) detail cuts (tile lines, eye);
//    (3) clearing columns with a deep V, spaced so the background is fully covered. Each stroke gets [t0, t1].
//  * bake(nx, ny): per texel of the block, the time the gouge first passed it and the groove depth then, plus the
//    time and depth of the deepest stroke (max over strokes, never accumulated over frames). The shader reads
//    depth(t) = max(dFirst * [t >= tFirst], dMax * [t >= tDom]).
//  * toolAt(t): gouge tip pose (cutting / hopping between strokes / approach / exit); chipAt(i, t): the curl of lino
//    each stroke lifts, riding the tip then flicked onto the bench.
//  * roller, paper hinge, baren path (+ a baked first-rub time map), corner peel, lift-and-present: functions of t.
//  * events(): one cue per stroke / roll / paper / rub loop / peel / reveal for the SCORE.
import { clamp, lerp, smoothstep, ease, hashString, rng } from "../../kit/time.js";
import { valueNoise2 } from "../../kit/noise.js";

const SQ = Math.SQRT1_2;
const len2 = (x, y) => Math.sqrt(x * x + y * y);

// ---------------------------------------------------------------- 2D signed distance primitives (exact or close)
function sdBox(px, py, cx, cy, hx, hy) {
  const dx = Math.abs(px - cx) - hx, dy = Math.abs(py - cy) - hy;
  return len2(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}
const sdRoundBox = (px, py, cx, cy, hx, hy, r) => sdBox(px, py, cx, cy, hx - r, hy - r) - r;
const sdCircle = (px, py, cx, cy, r) => len2(px - cx, py - cy) - r;
function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return len2(pax - bax * h, pay - bay * h);
}
/** thick segment with square ends (oriented box), th = full thickness */
function sdOrientedBox(px, py, ax, ay, bx, by, th) {
  const l = len2(bx - ax, by - ay), dx = (bx - ax) / l, dy = (by - ay) / l;
  const qx0 = px - (ax + bx) * 0.5, qy0 = py - (ay + by) * 0.5;
  const qx = Math.abs(dx * qx0 + dy * qy0) - l * 0.5, qy = Math.abs(-dy * qx0 + dx * qy0) - th * 0.5;
  return len2(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}
function sdPoly(px, py, v) {
  const n = v.length;
  let d = (px - v[0][0]) ** 2 + (py - v[0][1]) ** 2, s = 1;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const ex = v[j][0] - v[i][0], ey = v[j][1] - v[i][1];
    const wx = px - v[i][0], wy = py - v[i][1];
    const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    const bx = wx - ex * h, by = wy - ey * h;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= v[i][1], c2 = py < v[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
function sdEllipse(px, py, cx, cy, rx, ry) {
  const x = px - cx, y = py - cy;
  const k0 = len2(x / rx, y / ry), k1 = len2(x / (rx * rx), y / (ry * ry));
  return k1 < 1e-9 ? -Math.min(rx, ry) : (k0 * (k0 - 1)) / k1;
}
/** Catmull-Rom through pts (open), `per` samples per span (polynomial only: identical in Node and Chrome) */
function catmull(pts, per) {
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function smin(a, b, k) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
}
/** 4-point star polygon (vertex angles are multiples of 45°: exact constants, no trig) */
function starPoly(cx, cy, r, inner = 0.3) {
  const dirs = [[1, 0], [SQ, SQ], [0, 1], [-SQ, SQ], [-1, 0], [-SQ, -SQ], [0, -1], [SQ, -SQ]];
  return dirs.map(([x, y], k) => { const rr = k % 2 ? r * inner : r; return [cx + x * rr, cy + y * rr]; });
}

// ---------------------------------------------------------------- the design (print space, metres)
export const DESIGN_DEFAULTS = {
  seed: 118,
  wobble: 0.0006, // ± metres of hand-cut edge wobble
  wobbleFreq: 70, // noise cells per metre
  frame: { hx: 0.136, hy: 0.0985, r: 0.004 },
  letters: { text: "LOOK", base: -0.088, cap: 0.05, stroke: 0.0125, gap: 0.011, widths: { L: 0.034, O: 0.044, K: 0.038 } },
  roof: { y0: -0.0265, left: 0.0134, right: -0.0118, tiles: [0.34, 0.68] },
  chimney: { x0: 0.058, x1: 0.078, top: 0.0105, cap: 0.0028 },
  moon: { c: [0.082, 0.057], r: 0.032, bite: [0.0128, 0.0098], biteR: 0.0287 },
  stars: [[0.008, 0.084, 0.0075], [0.118, 0.012, 0.0062], [-0.117, 0.074, 0.0062], [0.027, 0.046, 0.005]],
};

/**
 * makeDesign(o) -> { outer(px,py), full(px,py), roofTop(px), detailLines: [[ [px,py], ... ]], eye, cfg }
 *   outer: SDF of everything raised (negative inside); full: outer minus the carved details (tile lines, eye).
 */
export function makeDesign(o = {}) {
  const D = { ...DESIGN_DEFAULTS, ...o };
  const F = D.frame, Lt = D.letters, R = D.roof, C = D.chimney, M = D.moon;
  const roofTop = (px) => lerp(R.left, R.right, (px + 0.16) / 0.32);
  const roofPoly = [[-0.16, R.y0], [0.16, R.y0], [0.16, R.right], [-0.16, R.left]];

  // letters
  const W = Lt.widths, T = Lt.stroke, yb = Lt.base, Hc = Lt.cap;
  const chars = Lt.text.split("");
  const total = chars.reduce((s, ch) => s + W[ch], 0) + Lt.gap * (chars.length - 1);
  let x = -total / 2;
  const glyphs = chars.map((ch) => { const g = { ch, x0: x, w: W[ch] }; x += W[ch] + Lt.gap; return g; });
  function sdGlyph(px, py, g) {
    const x0 = g.x0, w = g.w;
    if (g.ch === "L") return Math.min(sdBox(px, py, x0 + T / 2, yb + Hc / 2, T / 2, Hc / 2), sdBox(px, py, x0 + w / 2, yb + T / 2, w / 2, T / 2));
    if (g.ch === "O") {
      const cx = x0 + w / 2, cy = yb + Hc / 2;
      return Math.max(sdRoundBox(px, py, cx, cy, w / 2, Hc / 2, 0.019), -sdRoundBox(px, py, cx, cy, w / 2 - T, Hc / 2 - T * 0.98, 0.0085));
    }
    // K: stem + two arms trimmed to the glyph box
    const stem = sdBox(px, py, x0 + T / 2, yb + Hc / 2, T / 2, Hc / 2);
    const up = sdOrientedBox(px, py, x0 + T * 0.55, yb + Hc * 0.38, x0 + w + 0.004, yb + Hc + 0.006, T * 1.08);
    const lo = sdOrientedBox(px, py, x0 + T * 0.75 + 0.006, yb + Hc * 0.58, x0 + w + 0.004, yb - 0.006, T * 1.14);
    const box = sdBox(px, py, x0 + w / 2, yb + Hc / 2, w / 2, Hc / 2);
    return Math.min(stem, Math.max(Math.min(up, lo), box));
  }

  // cat (sits on the roof, faces the moon, head up); the tail is a Catmull-Rom curve through a few knots
  const TAIL = catmull([[-0.09, 0.0125], [-0.104, 0.0135], [-0.1155, 0.019], [-0.1205, 0.029], [-0.118, 0.038], [-0.111, 0.0425]], 6);
  function sdCat(px, py) {
    let d = sdEllipse(px, py, -0.072, 0.0255, 0.025, 0.0205);
    d = smin(d, sdEllipse(px, py, -0.058, 0.0445, 0.0152, 0.024), 0.006);
    d = smin(d, sdCircle(px, py, -0.0495, 0.0715, 0.0142), 0.006);
    d = smin(d, sdEllipse(px, py, -0.0505, 0.0115, 0.0085, 0.0055), 0.003);
    d = smin(d, sdPoly(px, py, [[-0.0632, 0.0752], [-0.0538, 0.0838], [-0.0606, 0.0935]]), 0.0025);
    d = smin(d, sdPoly(px, py, [[-0.0468, 0.0852], [-0.0365, 0.0758], [-0.0372, 0.0935]]), 0.0025);
    let td = 1;
    for (let i = 0; i + 1 < TAIL.length; i++) td = Math.min(td, sdSegment(px, py, TAIL[i][0], TAIL[i][1], TAIL[i + 1][0], TAIL[i + 1][1]) - lerp(0.0038, 0.0029, i / TAIL.length));
    return smin(d, td, 0.003);
  }
  const stars = D.stars.map(([cx, cy, r]) => starPoly(cx, cy, r));
  const eye = { c: [-0.0445, 0.0745], rx: 0.0033, ry: 0.0019 };

  const wob = (px, py) => D.wobble * (2 * valueNoise2(px * D.wobbleFreq + 17.3, py * D.wobbleFreq + 4.1, D.seed) - 1);
  function outer(px, py) {
    let d = -sdRoundBox(px, py, 0, 0, F.hx, F.hy, F.r); // the raised border (everything outside the inner box)
    d = Math.min(d, sdPoly(px, py, roofPoly));
    d = Math.min(d, sdBox(px, py, (C.x0 + C.x1) / 2, (C.top + R.y0) / 2, (C.x1 - C.x0) / 2, (C.top - R.y0) / 2));
    d = Math.min(d, sdBox(px, py, (C.x0 + C.x1) / 2, C.top, (C.x1 - C.x0) / 2 + C.cap, C.cap));
    d = Math.min(d, sdCat(px, py));
    d = Math.min(d, Math.max(sdCircle(px, py, M.c[0], M.c[1], M.r), -sdCircle(px, py, M.c[0] + M.bite[0], M.c[1] + M.bite[1], M.biteR)));
    for (const s of stars) d = Math.min(d, sdPoly(px, py, s));
    for (const g of glyphs) d = Math.min(d, sdGlyph(px, py, g));
    return d + wob(px, py);
  }
  // carved details inside the raised roof and the cat's head
  const tileY = (px, f) => lerp(R.y0, roofTop(px), f);
  const detailLines = R.tiles.map((f) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const px = lerp(-0.1325, 0.1325, i / 40); pts.push([px, tileY(px, f)]); }
    return pts;
  });
  function details(px, py) {
    let d = 1;
    for (const f of R.tiles) {
      const y = tileY(px, f);
      const line = Math.max(Math.abs(py - y) - 0.0011, Math.abs(px) - 0.1325);
      d = Math.min(d, line);
    }
    return Math.min(d, sdEllipse(px, py, eye.c[0], eye.c[1], eye.rx, eye.ry));
  }
  const full = (px, py) => Math.max(outer(px, py), -details(px, py));
  return { outer, full, details, roofTop, detailLines, eye, glyphs, cfg: D };
}

// ---------------------------------------------------------------- marching squares -> closed loops
/** contourLoops(f, [x0,y0,x1,y1], step, level) -> [[ [x,y], ... ]] iso-lines of f = level (closed loops inside bounds) */
export function contourLoops(f, bounds, step, level) {
  const [x0, y0, x1, y1] = bounds;
  const nx = Math.round((x1 - x0) / step) + 1, ny = Math.round((y1 - y0) / step) + 1;
  const g = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) g[j * nx + i] = f(x0 + i * step, y0 + j * step) - level;
  const P = (i, j) => g[j * nx + i];
  const hE = (i, j) => (j * nx + i) * 2, vE = (i, j) => (j * nx + i) * 2 + 1;
  const pt = new Map();
  const edgePoint = (id) => {
    if (pt.has(id)) return pt.get(id);
    const k = id >> 1, i = k % nx, j = (k - i) / nx;
    const a = P(i, j), b = id & 1 ? P(i, j + 1) : P(i + 1, j);
    const u = a / (a - b);
    const p = id & 1 ? [x0 + i * step, y0 + (j + u) * step] : [x0 + (i + u) * step, y0 + j * step];
    pt.set(id, p);
    return p;
  };
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  };
  for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
    const v0 = P(i, j), v1 = P(i + 1, j), v2 = P(i + 1, j + 1), v3 = P(i, j + 1);
    const c = (v0 > 0 ? 1 : 0) | (v1 > 0 ? 2 : 0) | (v2 > 0 ? 4 : 0) | (v3 > 0 ? 8 : 0);
    if (c === 0 || c === 15) continue;
    const B = hE(i, j), Rr = vE(i + 1, j), Tt = hE(i, j + 1), Lf = vE(i, j);
    if (c === 5 || c === 10) {
      const ctr = (v0 + v1 + v2 + v3) / 4 > 0;
      if ((c === 5) === ctr) { link(B, Rr); link(Tt, Lf); } else { link(Lf, B); link(Rr, Tt); }
      continue;
    }
    const e = [];
    if ((c & 1) !== (c >> 1 & 1)) e.push(B);
    if ((c >> 1 & 1) !== (c >> 2 & 1)) e.push(Rr);
    if ((c >> 2 & 1) !== (c >> 3 & 1)) e.push(Tt);
    if ((c >> 3 & 1) !== (c & 1)) e.push(Lf);
    link(e[0], e[1]);
  }
  const seen = new Set(), loops = [];
  const keys = [...adj.keys()].sort((a, b) => a - b);
  for (const start of keys) {
    if (seen.has(start)) continue;
    const ids = [start];
    seen.add(start);
    let prev = -1, cur = start;
    for (;;) {
      const nb = adj.get(cur).filter((n) => n !== prev && !seen.has(n));
      if (!nb.length) break;
      prev = cur; cur = nb[0];
      seen.add(cur); ids.push(cur);
    }
    const closed = adj.get(cur).includes(start) && ids.length > 2;
    if (closed) loops.push(ids.map(edgePoint));
  }
  return loops;
}

// ---------------------------------------------------------------- polyline helpers
export function arcTable(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return cum;
}
/** point + unit tangent at arc length s */
export function sampleAt(pts, cum, s) {
  const L = cum[cum.length - 1];
  s = clamp(s, 0, L);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo] || 1, u = (s - cum[lo]) / seg;
  const a = pts[lo], b = pts[hi];
  const tx = b[0] - a[0], ty = b[1] - a[1], tl = len2(tx, ty) || 1;
  return { p: [lerp(a[0], b[0], u), lerp(a[1], b[1], u)], t: [tx / tl, ty / tl] };
}
function resampleLoop(loop, ds) {
  const pts = [...loop, loop[0]];
  const cum = arcTable(pts), L = cum[cum.length - 1];
  const n = Math.max(8, Math.round(L / ds));
  const out = [];
  for (let k = 0; k < n; k++) out.push(sampleAt(pts, cum, (k / n) * L).p);
  return out;
}
function smoothLoop(p, iters = 3) {
  let a = p;
  for (let it = 0; it < iters; it++) {
    const n = a.length;
    a = a.map((q, i) => { const l = a[(i - 1 + n) % n], r = a[(i + 1) % n]; return [(l[0] + 2 * q[0] + r[0]) / 4, (l[1] + 2 * q[1] + r[1]) / 4]; });
  }
  return a;
}
/** split a closed loop at sharp corners, then by length; returns open polylines */
function splitLoop(loop, { cornerDeg = 48, win = 4, maxLen = 0.09, minLen = 0.006 }) {
  const n = loop.length;
  const turn = loop.map((q, i) => {
    const a = loop[(i - win + n) % n], b = loop[(i + win) % n];
    const ux = q[0] - a[0], uy = q[1] - a[1], vx = b[0] - q[0], vy = b[1] - q[1];
    const c = (ux * vx + uy * vy) / ((len2(ux, uy) * len2(vx, vy)) || 1);
    return clamp(c, -1, 1);
  });
  const cosT = Math.cos((cornerDeg * Math.PI) / 180);
  let cuts = [];
  for (let i = 0; i < n; i++) {
    if (turn[i] > cosT) continue;
    let isMin = true;
    for (let k = -win; k <= win; k++) if (k && turn[(i + k + n) % n] < turn[i]) { isMin = false; break; }
    if (isMin) cuts.push(i);
  }
  if (!cuts.length) { // no corner: start at the point with the lowest y (nearest the carver)
    let lo = 0;
    for (let i = 1; i < n; i++) if (loop[i][1] < loop[lo][1]) lo = i;
    cuts = [lo];
  }
  const pieces = [];
  for (let c = 0; c < cuts.length; c++) {
    const a = cuts[c], b = cuts[(c + 1) % cuts.length];
    const m = ((b - a + n) % n) || n;
    const piece = [];
    for (let k = 0; k <= m; k++) piece.push(loop[(a + k) % n]);
    pieces.push(piece);
  }
  const out = [];
  for (const piece of pieces) {
    const cum = arcTable(piece), L = cum[cum.length - 1];
    if (L < minLen) continue;
    const parts = Math.max(1, Math.ceil(L / maxLen));
    for (let q = 0; q < parts; q++) {
      const s0 = (q / parts) * L, s1 = ((q + 1) / parts) * L, steps = Math.max(2, Math.round((s1 - s0) / 0.001));
      const pl = [];
      for (let k = 0; k <= steps; k++) pl.push(sampleAt(piece, cum, lerp(s0, s1, k / steps)).p);
      out.push(pl);
    }
  }
  return out;
}

// ---------------------------------------------------------------- the plan
export const PLAN_DEFAULTS = {
  block: { w: 0.3, h: 0.225 },
  contour: { hw: 0.0028, depth: 0.0013, offset: 0.8, maxLen: 0.085 },
  detail: { hw: 0.0017, depth: 0.0009 },
  clear: { hw: 0.0092, depth: 0.0027, spacing: 0.0142, margin: 0.0035, wobble: 0.0009 },
  grid: 0.0006, // marching-squares step (m)
  firstLoop: "moon", // carved in the close-up (beat 1)
  windows: { approach: [0, 0.32], carve1: [0.32, 2.86], carve2: [3.04, 5.86], exit: [5.86, 6.5] },
  speedRamp: { from: 1, to: 7, over: 7 }, // beat-2 speed multiplier ramps over the first N strokes
  gapFrac: { carve1: 0.16, carve2: 0.22 }, // share of each slot spent hopping to the next stroke
  roller: { r: 0.0215, enter: [6.22, 6.58], roll: [6.58, 8.3], leave: [8.3, 8.86], x: [-0.36, -0.152, 0.152, 0.36], hover: 0.11 },
  paper: { w: 0.33, h: 0.255, down: [9.02, 9.6], from: 0.42, rise: 0.07 },
  baren: { r: 0.048, in: [9.56, 9.78], rub: [9.78, 10.98], out: [10.98, 11.3], rows: [0.082, 0.027, -0.027, -0.082], loop: 0.024, loopsPerSec: 4.5, xr: 0.118 },
  peel: { start: 11.08, mid: 12.0, end: 12.7, fracMid: 0.36, fracEnd: 0.62, curlR: 0.034 },
  present: { lift: [12.45, 13.75], flatten: [12.75, 13.6] },
  reveal: 13.62,
};

/**
 * createLinoPlan(cfg) -> plan
 *   cfg = { ...PLAN_DEFAULTS overrides, design: DESIGN_DEFAULTS overrides }
 *   plan.strokes: [{ i, kind: "contour"|"detail"|"clear", loop, pts (block xy), cum, len, hw, depth, t0, t1 }]
 *   plan.toolAt(t), plan.chipAt(i, t), plan.rollerAt(t), plan.paperAt(t), plan.barenAt(t), plan.events(), plan.bake(nx, ny),
 *   plan.rubBake(nx, ny), plan.sdBlock(bx, by), plan.fingerprint()
 */
export function createLinoPlan(cfg = {}) {
  const C = { ...PLAN_DEFAULTS, ...cfg };
  for (const k of ["block", "contour", "detail", "clear", "windows", "speedRamp", "gapFrac", "roller", "paper", "baren", "peel", "present"]) C[k] = { ...PLAN_DEFAULTS[k], ...(cfg[k] ?? {}) };
  const design = makeDesign(cfg.design ?? {});
  const BW = C.block.w, BH = C.block.h;
  const F = design.cfg.frame;
  const toBlock = (p) => [-p[0], p[1]];
  const sdBlock = (bx, by) => design.full(-bx, by);
  const sdBlockOuter = (bx, by) => design.outer(-bx, by);

  // ---- contour strokes (print space loops -> block space pieces)
  const lvl = C.contour.hw * C.contour.offset;
  const rawLoops = contourLoops(design.outer, [-0.15, -0.1125, 0.15, 0.1125], C.grid, lvl);
  const loops = rawLoops
    .map((l) => smoothLoop(resampleLoop(l, 0.001), 3))
    .filter((l) => arcTable([...l, l[0]]).at(-1) > 0.012);
  const M = design.cfg.moon;
  const isMoonLoop = (l) => { let sx = 0, sy = 0; for (const p of l) { sx += p[0]; sy += p[1]; } sx /= l.length; sy /= l.length; return len2(sx - M.c[0], sy - M.c[1]) < M.r; };
  const firstIdx = loops.findIndex(isMoonLoop);
  const away = (pl) => (pl[pl.length - 1][1] < pl[0][1] - 0.002 ? pl.slice().reverse() : pl);
  const mk = (kind, pts, hw, depth, loop = -1) => ({ kind, pts, hw, depth, loop });
  const first = [], rest = [];
  loops.forEach((l, li) => {
    const pieces = splitLoop(l, { maxLen: li === firstIdx ? C.contour.maxLen : 0.16 }).map((pl) => away(pl.map(toBlock)));
    for (const pl of pieces) {
      // pieces that only follow the inside of the border are left to the clearing columns (they carry no motif)
      const onBorder = pl.filter((p) => Math.abs(p[0]) > F.hx - 0.006 || Math.abs(p[1]) > F.hy - 0.006).length / pl.length;
      if (li !== firstIdx && onBorder > 0.7) continue;
      (li === firstIdx ? first : rest).push(mk("contour", pl, C.contour.hw, C.contour.depth, li));
    }
  });
  // beat 1: nearest-the-carver piece first, then around
  first.sort((a, b) => a.pts[0][1] - b.pts[0][1]);
  // beat 2 contours: greedy nearest neighbour from where the first loop ended
  const ordered = [];
  let at = first.length ? first[first.length - 1].pts.at(-1) : [0, -0.1];
  const pool = rest.slice();
  while (pool.length) {
    let bi = 0, bd = Infinity;
    pool.forEach((s, k) => { const d = len2(s.pts[0][0] - at[0], s.pts[0][1] - at[1]); if (d < bd) { bd = d; bi = k; } });
    const s = pool.splice(bi, 1)[0];
    ordered.push(s); at = s.pts.at(-1);
  }
  // detail cuts: roof tile lines (split in two each) and the eye
  const details = [];
  for (const line of design.detailLines) {
    const bl = line.map(toBlock), half = Math.floor(bl.length / 2);
    details.push(mk("detail", away(bl.slice(0, half + 1)), C.detail.hw, C.detail.depth));
    details.push(mk("detail", away(bl.slice(half)), C.detail.hw, C.detail.depth));
  }
  const E = design.eye;
  details.push(mk("detail", [toBlock([E.c[0] - E.rx * 0.95, E.c[1]]), toBlock([E.c[0] + E.rx * 0.95, E.c[1]])], C.detail.hw * 1.15, C.detail.depth));
  // clearing columns (block space, near edge -> far edge, left -> right)
  const cols = [];
  const xin = F.hx - C.clear.margin, nCol = Math.floor((2 * xin) / C.clear.spacing) + 1;
  const x0c = -((nCol - 1) * C.clear.spacing) / 2;
  for (let c = 0; c < nCol; c++) {
    const bxc = x0c + c * C.clear.spacing, pts = [];
    for (let k = 0; k <= 50; k++) {
      const by = lerp(F.hy - 0.002, -F.hy + 0.002, k / 50); // far edge -> near edge
      pts.push([bxc + C.clear.wobble * (2 * valueNoise2(c * 3.1 + 0.5, by * 40 + 7.7, 911) - 1), by]);
    }
    cols.push(mk("clear", pts, C.clear.hw, C.clear.depth));
  }
  const strokes = [...first, ...ordered, ...details, ...cols].map((s, i) => {
    const cum = arcTable(s.pts);
    return { ...s, i, cum, len: cum[cum.length - 1] };
  });

  // ---- timing: beat 1 at a steady hand speed, beat 2 ramps up (time-lapse)
  const nFirst = first.length;
  function schedule(list, [w0, w1], gapFrac, speed) {
    const wts = list.map((s, k) => s.len / speed(k));
    const tot = wts.reduce((a, b) => a + b, 0);
    const gapEach = ((w1 - w0) * gapFrac) / Math.max(1, list.length);
    const scale = ((w1 - w0) * (1 - gapFrac)) / tot;
    let t = w0;
    list.forEach((s, k) => { s.t0 = t; s.t1 = t + wts[k] * scale; t = s.t1 + gapEach; });
  }
  schedule(strokes.slice(0, nFirst), C.windows.carve1, C.gapFrac.carve1, () => 1);
  const SR = C.speedRamp;
  schedule(strokes.slice(nFirst), C.windows.carve2, C.gapFrac.carve2, (k) => lerp(SR.from, SR.to, clamp(k / SR.over)));
  const T_END = strokes[strokes.length - 1].t1;

  // ---- tool pose
  const TOOL_EXIT = [C.windows.exit[0] > T_END ? C.windows.exit[0] : T_END + 0.02, C.windows.exit[1]];
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // heading of a block-space tangent (tx, ty) = world direction (tx, 0, -ty); an Object3D with rotation.y = yaw points its +X there
  const yawOf = (t2) => Math.atan2(t2[1], t2[0]);
  /** toolAt(t) -> { x, y (block), lift (m above top), dig (0..1), yaw (rad, world: dir = (cos, 0, sin)·), visible, stroke, u } */
  function toolAt(t) {
    const s0 = strokes[0];
    if (t <= s0.t0) {
      const u = ease.outCubic(clamp((t - C.windows.approach[0]) / (s0.t0 - C.windows.approach[0])));
      const a = sampleAt(s0.pts, s0.cum, 0);
      return { x: a.p[0] - a.t[0] * 0.05 * (1 - u), y: a.p[1] - a.t[1] * 0.05 * (1 - u), lift: 0.045 * (1 - u), dig: u > 0.98 ? 1 : 0, yaw: yawOf(a.t), visible: true, stroke: -1, u: 0 };
    }
    if (t >= T_END) {
      const last = strokes[strokes.length - 1], a = sampleAt(last.pts, last.cum, last.len);
      const u = ease.inOutCubic(clamp((t - TOOL_EXIT[0]) / (TOOL_EXIT[1] - TOOL_EXIT[0])));
      return { x: a.p[0] + 0.18 * u, y: a.p[1] + 0.06 * u, lift: 0.004 + 0.16 * u, dig: 0, yaw: yawOf(a.t) - 0.5 * u, visible: t < TOOL_EXIT[1], stroke: -1, u: 1 };
    }
    // find the stroke whose [t0, next.t0) contains t (strokes are in time order)
    let lo = 0, hi = strokes.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (strokes[m].t0 <= t) lo = m; else hi = m; }
    const k = strokes[hi].t0 <= t ? hi : lo;
    const s = strokes[k];
    if (t <= s.t1) {
      const u = (t - s.t0) / (s.t1 - s.t0 || 1);
      const a = sampleAt(s.pts, s.cum, u * s.len);
      let lift = 0;
      if (s.kind === "clear") lift = 0.0045 * (1 - smoothstep(-0.001, 0.003, sdBlockOuter(a.p[0], a.p[1])));
      return { x: a.p[0], y: a.p[1], lift, dig: s.depth / C.clear.depth, yaw: yawOf(a.t), visible: true, stroke: k, u };
    }
    const n = strokes[k + 1];
    const a = sampleAt(s.pts, s.cum, s.len), b = sampleAt(n.pts, n.cum, 0);
    const u = clamp((t - s.t1) / (n.t0 - s.t1 || 1));
    const e = ease.inOutSine(u);
    const dist = len2(b.p[0] - a.p[0], b.p[1] - a.p[1]);
    const ya = yawOf(a.t), yb = yawOf(b.t);
    return { x: lerp(a.p[0], b.p[0], e), y: lerp(a.p[1], b.p[1], e), lift: 4 * u * (1 - u) * Math.min(0.03, 0.005 + 0.12 * dist), dig: 0, yaw: ya + wrapA(yb - ya) * e, visible: true, stroke: -1, u };
  }

  // ---- chips: one curl per stroke, riding the tip, then flicked onto the bench beside the nearest block edge
  const chipRest = strokes.map((s, i) => {
    const r = rng(7000 + i * 13);
    const e = s.pts[s.pts.length - 1];
    // nearest edge of the block
    const dl = e[0] + BW / 2, dr = BW / 2 - e[0], db = e[1] + BH / 2, dt = BH / 2 - e[1];
    const m = Math.min(dl, dr, db, dt), off = r.range(0.018, 0.075);
    let x = e[0] + r.range(-0.03, 0.03), y = e[1] + r.range(-0.03, 0.03);
    if (m === dl) x = -BW / 2 - off; else if (m === dr) x = BW / 2 + off; else if (m === db) y = -BH / 2 - off; else y = BH / 2 + off;
    return { x, y, yaw: r.range(-Math.PI, Math.PI), roll: r.range(-0.6, 0.6), size: s.kind === "clear" ? r.range(0.9, 1.25) : s.kind === "detail" ? 0.55 : r.range(0.6, 0.8) };
  });
  const FLICK = 0.34;
  /** chipAt(i, t) -> null | { x, y (block), h (m above lino top; negative = down on the bench), yaw, grow 0..1, flying 0..1, onBench } */
  function chipAt(i, t) {
    const s = strokes[i];
    if (t < s.t0) return null;
    const R = chipRest[i];
    if (t <= s.t1) {
      const tl = toolAt(t);
      return { x: tl.x, y: tl.y, h: 0.0012, yaw: tl.yaw, grow: clamp((t - s.t0) / (s.t1 - s.t0 || 1)), flying: 0, size: R.size, roll: 0 };
    }
    const a = sampleAt(s.pts, s.cum, s.len);
    const u = clamp((t - s.t1) / FLICK), e = ease.outCubic(u);
    const yaw0 = yawOf(a.t);
    return {
      x: lerp(a.p[0], R.x, e), y: lerp(a.p[1], R.y, e),
      h: 0.0012 + 4 * u * (1 - u) * 0.05, // arc height above the lino top; style.js lowers it onto the bench as u -> 1
      yaw: lerp(yaw0, R.yaw, e), grow: 1, flying: u, size: R.size, roll: R.roll * e, landed: u >= 1,
    };
  }

  // ---- roller
  const RL = C.roller;
  /** rollerAt(t) -> { visible, x (world/block x of the contact line), lift (m above the lino top), spin (rad), contact } */
  function rollerAt(t) {
    const [xa, xb, xc, xd] = RL.x;
    if (t < RL.enter[0] || t > RL.leave[1]) return { visible: false, x: xa, lift: RL.hover, spin: 0, contact: xb - 1 };
    let x, lift;
    if (t < RL.enter[1]) { const u = ease.outCubic(clamp((t - RL.enter[0]) / (RL.enter[1] - RL.enter[0]))); x = lerp(xa, xb, u); lift = RL.hover * (1 - u) ** 2; }
    else if (t < RL.roll[1]) { const u = ease.inOutSine(clamp((t - RL.roll[0]) / (RL.roll[1] - RL.roll[0]))); x = lerp(xb, xc, u); lift = 0; }
    else { const u = ease.inCubic(clamp((t - RL.leave[0]) / (RL.leave[1] - RL.leave[0]))); x = lerp(xc, xd, u); lift = RL.hover * u * u; }
    return { visible: true, x, lift, spin: -(x - xa) / RL.r, contact: t >= RL.roll[0] ? x : xb - 1 };
  }
  /** inked extent: block texels with bx < inkFront(t) are inked (the roller's contact line has passed them) */
  const inkFront = (t) => (t < RL.roll[0] ? -1 : t > RL.roll[1] ? 1 : rollerAt(t).x);

  // ---- paper, baren, peel, present
  const PA = C.paper, BA = C.baren, PE = C.peel, PR = C.present;
  /** paperAt(t) -> { visible, hinge (rad, 0 = flat on the block), rise (m), fold (0..1 of the diagonal from the near-right corner), curlR, present (0..1), flatten (0..1) } */
  function paperAt(t) {
    if (t < PA.down[0]) return { visible: false, hinge: Math.PI * PA.from, rise: PA.rise, fold: 0, curlR: PE.curlR, present: 0, flatten: 0 };
    const u = clamp((t - PA.down[0]) / (PA.down[1] - PA.down[0]));
    const hinge = Math.PI * PA.from * (1 - ease.inQuad(u));
    const rise = PA.rise * (1 - ease.outCubic(clamp(u * 1.6)));
    let fold = 0;
    if (t > PE.start) fold = t < PE.mid ? PE.fracMid * ease.inOutSine((t - PE.start) / (PE.mid - PE.start)) : lerp(PE.fracMid, PE.fracEnd, ease.outSine(clamp((t - PE.mid) / (PE.end - PE.mid))));
    const present = ease.inOutCubic(clamp((t - PR.lift[0]) / (PR.lift[1] - PR.lift[0])));
    const flatten = ease.inOutSine(clamp((t - PR.flatten[0]) / (PR.flatten[1] - PR.flatten[0])));
    return { visible: true, hinge, rise, fold, curlR: PE.curlR, present, flatten };
  }
  const nRows = BA.rows.length, rubDur = BA.rub[1] - BA.rub[0];
  /** baren centre over the block at t (block space) + height + visibility */
  function barenAt(t) {
    if (t < BA.in[0] || t > BA.out[1]) return { visible: false, x: 0, y: 0, lift: 0.12, spin: 0 };
    const rowDur = rubDur / nRows;
    const path = (tt) => {
      const v = clamp((tt - BA.rub[0]) / rubDur) * nRows;
      const r = Math.min(nRows - 1, Math.floor(v)), f = v - r;
      const dir = r % 2 ? -1 : 1;
      const xRow = lerp(-BA.xr * dir, BA.xr * dir, ease.inOutSine(f));
      // blend between rows near the turn
      const yRow = BA.rows[r] + (r + 1 < nRows ? (BA.rows[r + 1] - BA.rows[r]) * smoothstep(0.85, 1, f) : 0);
      const ph = 2 * Math.PI * BA.loopsPerSec * (tt - BA.rub[0]);
      const amp = BA.loop * smoothstep(BA.rub[0], BA.rub[0] + 0.15, tt) * (1 - smoothstep(BA.rub[1] - 0.15, BA.rub[1], tt));
      return [xRow + amp * Math.cos(ph), yRow + amp * Math.sin(ph) * 0.8, ph];
    };
    void rowDur;
    let p, lift;
    if (t < BA.rub[0]) { const u = ease.outCubic((t - BA.in[0]) / (BA.in[1] - BA.in[0])); p = path(BA.rub[0]); lift = 0.12 * (1 - u); }
    else if (t <= BA.rub[1]) { p = path(t); lift = 0; }
    else { const u = ease.inCubic((t - BA.out[0]) / (BA.out[1] - BA.out[0])); p = path(BA.rub[1]); p = [p[0] + 0.16 * u, p[1] + 0.05 * u, p[2]]; lift = 0.14 * u; }
    return { visible: true, x: p[0], y: p[1], lift, spin: p[2] * 0.25, path };
  }

  // ---- bakes
  /**
   * bake(nx, ny) -> { nx, ny, data: Float32Array(nx*ny*4) [tFirst, dFirst, tDom, dMax] per texel, block space,
   *                   row 0 = by = -BH/2, texel centres at ((i+.5)/nx, (j+.5)/ny) }, NEVER = 99 for uncarved texels
   */
  function bake(nx, ny) {
    const NEVER = 99;
    const data = new Float32Array(nx * ny * 4);
    const cls = new Uint8Array(nx * ny); // 0 raised, 1 background, 2 carved detail
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const bx = ((i + 0.5) / nx - 0.5) * BW, by = ((j + 0.5) / ny - 0.5) * BH;
      const o = sdBlockOuter(bx, by);
      const k = j * nx + i;
      cls[k] = o > 0 ? 1 : design.details(-bx, by) < 0 ? 2 : 0;
      data[k * 4] = NEVER; data[k * 4 + 1] = 0; data[k * 4 + 2] = NEVER; data[k * 4 + 3] = 0;
    }
    const dxT = BW / nx, dyT = BH / ny;
    // per stroke: max profile over its segments (time = time at the nearest point), then merged into two slots
    // (first stroke to touch the texel, deepest stroke) -- strokes are in time order, so "first" is never replaced
    const sProf = new Float32Array(nx * ny), sTime = new Float32Array(nx * ny), touched = new Int32Array(nx * ny);
    for (const s of strokes) {
      const want = s.kind === "detail" ? 2 : 1;
      const dur = s.t1 - s.t0;
      let nT = 0;
      for (let q = 0; q + 1 < s.pts.length; q++) {
        const a = s.pts[q], b = s.pts[q + 1], sa = s.cum[q], sl = s.cum[q + 1] - sa;
        const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - s.hw) / dxT + nx / 2)), i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0]) + s.hw) / dxT + nx / 2));
        const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - s.hw) / dyT + ny / 2)), j1 = Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1]) + s.hw) / dyT + ny / 2));
        const ex = b[0] - a[0], ey = b[1] - a[1], ee = ex * ex + ey * ey || 1e-12;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = j * nx + i;
          if (cls[k] !== want) continue;
          const px = ((i + 0.5) / nx - 0.5) * BW - a[0], py = ((j + 0.5) / ny - 0.5) * BH - a[1];
          const h = clamp((px * ex + py * ey) / ee, 0, 1);
          const d = len2(px - ex * h, py - ey * h);
          if (d >= s.hw) continue;
          const prof = s.depth * (1 - d / s.hw);
          if (sProf[k] === 0) touched[nT++] = k;
          if (prof > sProf[k]) { sProf[k] = prof; sTime[k] = s.t0 + (dur * (sa + h * sl)) / (s.len || 1); }
        }
      }
      for (let n = 0; n < nT; n++) {
        const k = touched[n], o = k * 4, prof = sProf[k], tp = sTime[k];
        if (data[o] >= NEVER) { data[o] = tp; data[o + 1] = prof; }
        if (prof > data[o + 3]) { data[o + 3] = prof; data[o + 2] = tp; }
        sProf[k] = 0;
      }
    }
    // uncovered background (should be none) and dilation of times into raised texels (zero depth) so linear
    // filtering at the design edges blends depth to 0 instead of jumping to NEVER
    let uncovered = 0;
    for (let k = 0; k < nx * ny; k++) if (cls[k] && data[k * 4] >= NEVER) uncovered++;
    for (let pass = 0; pass < 2; pass++) {
      const src = data.slice();
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (src[k * 4] < NEVER) continue;
        let best = NEVER;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const v = src[(jj * nx + ii) * 4];
          if (v < NEVER) best = Math.min(best, v);
        }
        if (best < NEVER) { data[k * 4] = best; data[k * 4 + 2] = best; }
      }
    }
    return { nx, ny, data, uncovered, NEVER };
  }
  /** rubBake(nx, ny) -> Float32Array first time the baren covered each point of the PAPER (block space, paper extent) */
  function rubBake(nx, ny) {
    const out = new Float32Array(nx * ny).fill(99);
    const B = barenAt(BA.rub[0]);
    const PW = PA.w, PH = PA.h, r2 = BA.r * BA.r;
    const steps = Math.round(rubDur * 480);
    for (let q = 0; q <= steps; q++) {
      const tt = BA.rub[0] + (q / steps) * rubDur;
      const [cx, cy] = B.path(tt);
      const i0 = Math.max(0, Math.floor(((cx - BA.r) / PW + 0.5) * nx)), i1 = Math.min(nx - 1, Math.ceil(((cx + BA.r) / PW + 0.5) * nx));
      const j0 = Math.max(0, Math.floor(((cy - BA.r) / PH + 0.5) * ny)), j1 = Math.min(ny - 1, Math.ceil(((cy + BA.r) / PH + 0.5) * ny));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = ((i + 0.5) / nx - 0.5) * PW - cx, y = ((j + 0.5) / ny - 0.5) * PH - cy;
        if (x * x + y * y <= r2) { const k = j * nx + i; if (tt < out[k]) out[k] = tt; }
      }
    }
    // coverage over the BLOCK area (where ink can transfer); the few corners the path misses get the last rub time
    let miss = 0, tot = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = ((i + 0.5) / nx - 0.5) * PW, y = ((j + 0.5) / ny - 0.5) * PH;
      if (Math.abs(x) <= BW / 2 && Math.abs(y) <= BH / 2) { tot++; if (out[j * nx + i] >= 99) miss++; }
      if (out[j * nx + i] >= 99) out[j * nx + i] = BA.rub[1];
    }
    return { nx, ny, data: out, missFrac: miss / tot };
  }

  // ---- events for the SCORE (times are plain arithmetic on the stroke table)
  function events() {
    const ev = [{ kind: "approach", t: C.windows.approach[0], dur: strokes[0].t0 }];
    for (const s of strokes) ev.push({ kind: "carve", t: s.t0, dur: Math.max(0.03, s.t1 - s.t0), len: s.len, type: s.kind, pan: clamp(s.pts[0][0] / (BW / 2), -1, 1) * 0.5 });
    ev.push({ kind: "toolAway", t: TOOL_EXIT[0], dur: TOOL_EXIT[1] - TOOL_EXIT[0] });
    ev.push({ kind: "rollerLand", t: RL.enter[1] - 0.04 });
    ev.push({ kind: "roll", t: RL.roll[0], dur: RL.roll[1] - RL.roll[0] });
    ev.push({ kind: "rollerOff", t: RL.leave[0], dur: RL.leave[1] - RL.leave[0] });
    ev.push({ kind: "paperDown", t: PA.down[0], dur: PA.down[1] - PA.down[0] });
    const loops = Math.floor(rubDur * BA.loopsPerSec);
    for (let q = 0; q < loops; q++) {
      const tt = BA.rub[0] + q / BA.loopsPerSec;
      ev.push({ kind: "rub", t: tt, dur: 1 / BA.loopsPerSec, pan: clamp(barenAt(tt).x / (BW / 2), -1, 1) * 0.4, q });
    }
    ev.push({ kind: "peel", t: PE.start, dur: PE.end - PE.start });
    ev.push({ kind: "lift", t: PR.lift[0], dur: PR.lift[1] - PR.lift[0] });
    ev.push({ kind: "reveal", t: C.reveal });
    return ev.sort((a, b) => a.t - b.t);
  }

  /** short hex over the stroke table (count, kinds, rounded lengths and times): print it in Node and the page */
  function fingerprint() {
    const s = strokes.map((q) => `${q.kind[0]}${Math.round(q.len * 1e6)}:${Math.round(q.t0 * 1e6)}:${Math.round(q.t1 * 1e6)}`).join("|");
    return hashString(`${strokes.length}#${s}`).toString(16).padStart(8, "0");
  }

  return {
    cfg: C, design, strokes, nFirst, carveEnd: T_END, toolExit: TOOL_EXIT,
    sdBlock, sdBlockOuter, toolAt, chipAt, chipRest, rollerAt, inkFront, paperAt, barenAt, bake, rubBake, events, fingerprint,
  };
}
