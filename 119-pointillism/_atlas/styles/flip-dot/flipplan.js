// styles/flip-dot/flipplan.js — the flip planner for "Flip-Dot Display". PURE: no THREE, no window, no DOM (Node-safe),
// so scene.config.js imports it for SCORE and framing, and style.js reads the very same plan for the picture.
//
// Model: a board of two-state discs (cols x rows at `pitch`, in the XY plane facing +Z, row 0 at the top). A disc
// shows its BRIGHT side (bit 1, angle 0) or its DARK side (bit 0, angle PI). A plan is a start bitmap plus a list of
// steps; each step has a target bitmap, and every disc whose bit differs from the previous target gets ONE flip event
//   { t, i, to, step }   with   t = step.t + order_i * step.spread + jitter_i
// where order_i (0..1) comes from the disc's position: a scan in any direction, a radial wave from a point, rows,
// columns or a seeded random order. A disc's angle is then a closed-form function of time: the settled angle of its
// last finished flip, or a damped swing that hits the end stop and bounces a little (flipSettle).
// The same flip list drives the sound: flips are binned (density -> clatter) and lone flips click on their own.
//
// Bitmap sources (all -> Uint8Array, 1 = bright): noiseBits, bitsFromRows, textBits (kit 5x7 font), painter()
// primitives (ellipse / poly / rect / line / pixel line with xor), PICTURES (original icons), and denoisePasses()
// which turns a picture into a "noise -> picture" sequence for diffusion-style reveals.
import { clamp, hash01, spring } from "../../kit/time.js";
import { bitmapTextCells } from "../../kit/bitmapfont.js";

// ---------------------------------------------------------------- grid
/** dotGrid({ cols, rows, pitch }) -> { cols, rows, pitch, n, x, y, w, h, index(c, r), point(c, r, z) } */
export function dotGrid({ cols, rows, pitch }) {
  const n = cols * rows;
  const x = new Float32Array(n), y = new Float32Array(n);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = c + r * cols;
    x[i] = (c - (cols - 1) / 2) * pitch;
    y[i] = ((rows - 1) / 2 - r) * pitch;
  }
  return {
    cols, rows, pitch, n, x, y, w: cols * pitch, h: rows * pitch,
    index: (c, r) => c + r * cols,
    /** world point of a (fractional) cell coordinate: c, r count cells from the top-left, cell centres at +0.5 */
    point: (c, r, z = 0) => [(c - cols / 2) * pitch, (rows / 2 - r) * pitch, z],
  };
}

// ---------------------------------------------------------------- bitmap sources
/** noiseBits(grid, seed, p = .5): seeded random bitmap, each disc bright with probability p. */
export function noiseBits(grid, seed = 1, p = 0.5) {
  const b = new Uint8Array(grid.n);
  for (let i = 0; i < grid.n; i++) b[i] = hash01(seed, 101, i) < p ? 1 : 0;
  return b;
}
/** solidBits(grid, v) */
export function solidBits(grid, v = 0) { return new Uint8Array(grid.n).fill(v ? 1 : 0); }
/** bitsFromRows(grid, ["..##.."], { center: [c, r], on = 1, base }): "#" cells from strings, centred on the board. */
export function bitsFromRows(grid, rows, o = {}) {
  const b = o.base ? Uint8Array.from(o.base) : solidBits(grid, o.on === 0 ? 1 : 0);
  const on = o.on ?? 1, hh = rows.length, ww = Math.max(...rows.map((s) => s.length));
  const c0 = Math.round((o.center?.[0] ?? grid.cols / 2) - ww / 2), r0 = Math.round((o.center?.[1] ?? grid.rows / 2) - hh / 2);
  for (let r = 0; r < hh; r++) for (let c = 0; c < rows[r].length; c++) {
    if (rows[r][c] !== "#") continue;
    const cc = c0 + c, rr = r0 + r;
    if (cc >= 0 && rr >= 0 && cc < grid.cols && rr < grid.rows) b[cc + rr * grid.cols] = on;
  }
  return b;
}
/** textBits(grid, "HELLO", { scale = 1, center: [c, r], on = 1, base }): kit 5x7 font, `scale` discs per font pixel. */
export function textBits(grid, str, o = {}) {
  const s = Math.max(1, Math.round(o.scale ?? 1)), on = o.on ?? 1;
  const b = o.base ? Uint8Array.from(o.base) : solidBits(grid, on ? 0 : 1);
  const cells = bitmapTextCells(str, { align: "left", spacing: o.spacing ?? 1 });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of cells) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const cw = (x1 - x0 + 1) * s, ch = (y1 - y0 + 1) * s;
  const cx = Math.round((o.center?.[0] ?? grid.cols / 2) - cw / 2), cy = Math.round((o.center?.[1] ?? grid.rows / 2) - ch / 2);
  for (const q of cells) for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
    const c = cx + (q.x - x0) * s + dx, r = cy + (y1 - q.y) * s + dy;
    if (c >= 0 && r >= 0 && c < grid.cols && r < grid.rows) b[c + r * grid.cols] = on;
  }
  return b;
}

/**
 * painter(grid, { design: [W, H], fill = 0 }) -> tiny raster API in DESIGN units (scaled uniformly and centred on the
 * board; a cell is "inside" when its centre is). v = 0 | 1 | "xor".
 *   ellipse(cx, cy, rx, ry, v)  poly([[x, y]...], v)  rect(x0, y0, x1, y1, v)
 *   line(a, b, halfWidth, v)    thick line by distance
 *   trace([[x, y]...], v)       1-disc-wide connected pixel line (xor touches each disc once)
 *   cells([[x, y]...], v)       single discs
 *   bits                        the Uint8Array
 */
export function painter(grid, o = {}) {
  const [DW, DH] = o.design ?? [grid.cols, grid.rows];
  const s = Math.min(grid.cols / DW, grid.rows / DH);
  const ox = (grid.cols - DW * s) / 2, oy = (grid.rows - DH * s) / 2;
  const bits = solidBits(grid, o.fill ?? 0);
  const put = (i, v) => { bits[i] = v === "xor" ? 1 - bits[i] : v; };
  const each = (f, v) => {
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
      const x = (c + 0.5 - ox) / s, y = (r + 0.5 - oy) / s;
      if (f(x, y)) put(c + r * grid.cols, v);
    }
  };
  const api = {
    bits, scale: s,
    ellipse(cx, cy, rx, ry, v = 1) { each((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, v); return api; },
    rect(x0, y0, x1, y1, v = 1) { each((x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1, v); return api; },
    poly(pts, v = 1) {
      each((x, y) => {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
      }, v);
      return api;
    },
    line(a, b, hw = 0.5, v = 1) {
      const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy;
      each((x, y) => {
        const u = L2 > 0 ? clamp(((x - a[0]) * vx + (y - a[1]) * vy) / L2) : 0;
        return Math.hypot(x - (a[0] + u * vx), y - (a[1] + u * vy)) <= hw;
      }, v);
      return api;
    },
    cells(list, v = 1) {
      for (const [x, y] of list) {
        const c = Math.floor(x * s + ox), r = Math.floor(y * s + oy);
        if (c >= 0 && r >= 0 && c < grid.cols && r < grid.rows) put(c + r * grid.cols, v);
      }
      return api;
    },
    trace(pts, v = 1) {
      const seen = new Set();
      for (let k = 1; k < pts.length; k++) {
        const c0 = pts[k - 1][0] * s + ox, r0 = pts[k - 1][1] * s + oy, c1 = pts[k][0] * s + ox, r1 = pts[k][1] * s + oy;
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0)) * 2));
        for (let q = 0; q <= steps; q++) {
          const c = Math.floor(c0 + ((c1 - c0) * q) / steps), r = Math.floor(r0 + ((r1 - r0) * q) / steps);
          if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
          const i = c + r * grid.cols;
          if (!seen.has(i)) { seen.add(i); put(i, v); }
        }
      }
      return api;
    },
  };
  return api;
}

/**
 * PICTURES — original icons drawn for a 64 x 36 board (they scale to other boards). 1 = bright.
 *   cat(grid, { wink = false })   a dark cat face on a bright field: ears, almond eyes with slit pupils, nose, mouth, whiskers
 *   bulb(grid)                    a bright lightbulb with rays on a dark field
 */
export const PICTURES = {
  cat(grid, o = {}) {
    const P = painter(grid, { design: [64, 36], fill: 1 });
    const mir = (pts) => pts.map(([x, y]) => [64 - x, y]);
    const earL = [[18.3, 17], [22.6, 1.4], [31.6, 10.9]], innerL = [[22.3, 12.2], [23.6, 5.6], [27.4, 9.9]];
    P.poly(earL, 0).poly(mir(earL), 0);
    P.ellipse(32, 21, 14.6, 12.3, 0);
    P.poly(innerL, 1).poly(mir(innerL), 1);
    // eyes (viewer's left always open; viewer's right closes for the wink)
    P.ellipse(26, 18.5, 4.7, 3.5, 1).ellipse(26, 18.5, 1.1, 2.6, 0);
    if (o.wink) P.trace([[33.6, 18.4], [35.6, 19.9], [40.4, 19.9], [42.4, 18.4]], 1);
    else P.ellipse(38, 18.5, 4.7, 3.5, 1).ellipse(38, 18.5, 1.1, 2.6, 0);
    // nose + mouth
    // nose: a 6 / 4 / 2 disc inverted triangle; mouth: a symmetric "w" hanging from a 2-disc stem
    P.poly([[28.6, 22.8], [35.4, 22.8], [32, 26.4]], 1);
    P.cells([[31.5, 26.5], [32.5, 26.5], [30.5, 27.5], [33.5, 27.5], [27.5, 27.5], [36.5, 27.5], [28.5, 28.5], [29.5, 28.5], [34.5, 28.5], [35.5, 28.5]], 1);
    // whiskers: one disc wide, inverted over whatever is below (bright on the face, dark on the field)
    const wl = [[[24.4, 24.4], [5.6, 20.6]], [[24.4, 26.5], [4.4, 26.5]], [[24.4, 28.4], [9.4, 30.3]]];
    for (const w of wl) { P.trace(w, "xor"); P.trace(mir(w), "xor"); }
    return P.bits;
  },
  bulb(grid) {
    const P = painter(grid, { design: [64, 36], fill: 0 });
    P.ellipse(32, 14.5, 9.2, 9.2, 1);
    P.poly([[26, 20], [38, 20], [36, 27], [28, 27]], 1);
    P.rect(28, 28.2, 36, 29.4, 1).rect(28, 30.4, 36, 31.6, 1).rect(30, 32.6, 34, 33.8, 1);
    P.trace([[29.5, 15.5], [31, 12.5], [32, 15.5], [33, 12.5], [34.5, 15.5]], 0);
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * (1 + k / 6), c = Math.cos(a), s = Math.sin(a);
      P.line([32 + c * 12.5, 14.5 + s * 12.5], [32 + c * 17.5, 14.5 + s * 17.5], 0.6, 1);
    }
    return P.bits;
  },
};

/** edgeDistance(bits, grid, reach): Chebyshev distance (in discs, capped at reach) to the nearest disc of the other state. */
export function edgeDistance(bits, grid, reach = 4) {
  const d = new Uint8Array(grid.n);
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
    const i = c + r * grid.cols;
    let best = reach;
    search: for (let k = 1; k < reach; k++) {
      for (let dr = -k; dr <= k; dr++) for (let dc = -k; dc <= k; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== k) continue;
        const cc = c + dc, rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= grid.cols || rr >= grid.rows) continue;
        if (bits[cc + rr * grid.cols] !== bits[i]) { best = k; break search; }
      }
    }
    d[i] = best;
  }
  return d;
}

/**
 * denoisePasses(picture, grid, { levels = [1, .8, .6, .4, .2, 0], seed = 1, edgeBias = .3, edgeReach = 4 })
 *   -> { passes: [Uint8Array per level], order: Float32Array }
 * A "noise -> picture" sequence. Every disc gets a fixed rank order_i in 0..1 (seeded; discs near an edge of the
 * picture rank lower when edgeBias > 0, so big shapes settle before fine detail). At noise level p, discs with
 * order_i < p are STILL NOISE and take a fresh seeded random bit for that pass; the rest show the picture. Level 1 is
 * pure noise (no trace of the picture), level 0 is the picture. Each pass therefore flips fewer discs than the last.
 */
export function denoisePasses(picture, grid, o = {}) {
  const { levels = [1, 0.8, 0.6, 0.4, 0.2, 0], seed = 1, edgeBias = 0.3, edgeReach = 4 } = o;
  const n = grid.n;
  const ed = edgeBias > 0 ? edgeDistance(picture, grid, edgeReach) : null;
  const score = new Float64Array(n);
  for (let i = 0; i < n; i++) score[i] = (1 - edgeBias) * hash01(seed, 211, i) + (ed ? edgeBias * ((ed[i] - 1) / Math.max(1, edgeReach - 1)) : 0);
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => score[a] - score[b] || a - b);
  const order = new Float32Array(n);
  idx.forEach((i, k) => { order[i] = (k + 0.5) / n; });
  const passes = levels.map((p, k) => {
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = order[i] < p ? (hash01(seed, 977 + k * 31, i) < 0.5 ? 1 : 0) : picture[i];
    return b;
  });
  return { passes, order };
}
/** matchFraction(a, b): share of discs that agree (1 = identical). */
export function matchFraction(a, b) { let m = 0; for (let i = 0; i < a.length; i++) if (a[i] === b[i]) m++; return m / a.length; }

// ---------------------------------------------------------------- wave orders
/**
 * waveOrder(grid, wave) -> Float32Array of 0..1 (when in the sweep each disc goes)
 *   { type: "scan", dir: [dx, dy] }           a straight front moving along dir (world: +x right, +y up)
 *   { type: "radial", c: [x, y], inward }     a ring growing from a world point (or closing on it)
 *   { type: "rows" } | { type: "cols" }       line by line (top first / left first; reverse: true flips it)
 *   { type: "random", seed }                  seeded sprinkle
 *   { type: "none" }                          all at once
 */
export function waveOrder(grid, wave = {}) {
  const n = grid.n, w = new Float32Array(n);
  const type = wave.type ?? "scan";
  if (type === "none") return w;
  for (let i = 0; i < n; i++) {
    const c = i % grid.cols, r = (i - c) / grid.cols;
    if (type === "random") w[i] = hash01(wave.seed ?? 5, 307, i);
    else if (type === "rows") w[i] = r;
    else if (type === "cols") w[i] = c;
    else if (type === "radial") w[i] = Math.hypot(grid.x[i] - (wave.c?.[0] ?? 0), grid.y[i] - (wave.c?.[1] ?? 0));
    else { const d = wave.dir ?? [1, 0]; w[i] = grid.x[i] * d[0] + grid.y[i] * d[1]; }
  }
  if (type === "random") return w;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { lo = Math.min(lo, w[i]); hi = Math.max(hi, w[i]); }
  const flip = (type === "radial" && wave.inward) || wave.reverse;
  for (let i = 0; i < n; i++) { const u = hi > lo ? (w[i] - lo) / (hi - lo) : 0; w[i] = flip ? 1 - u : u; }
  return w;
}

// ---------------------------------------------------------------- one flip, closed form
/**
 * flipSettle(tau, F) -> 0..1 progress of one flip `tau` seconds after it starts: a damped swing that reaches the end
 * stop at ~F.land s, bounces back a little (never passes the stop) and is held at EXACTLY 1 from F.settle s on.
 */
export function flipSettle(tau, F) {
  if (tau <= 0) return 0;
  if (tau >= F.settle) return 1;
  const s = spring(tau, F.spring);
  const q = s > 1 ? 1 - (s - 1) * F.bounce : s;        // overshoot becomes a rebound off the stop
  const e = clamp((tau - F.settle * 0.6) / (F.settle * 0.4));
  return q + (1 - q) * e * e * (3 - 2 * e);
}
/** first time the swing reaches the stop (s) — where the click belongs */
export function flipLandTime(F) {
  for (let k = 1; k < 2000; k++) { const tau = k / 2000 * F.settle; if (spring(tau, F.spring) >= 1) return tau; }
  return F.settle;
}

// ---------------------------------------------------------------- the plan
/**
 * createPlan(grid, F = spec.flip, { initial: bits, steps: [{ id, t, to: bits, wave, spread = F.spread, jitter = F.jitter, seed }] })
 *   -> { grid, initial, steps, flips, landAt, anglesAt(t, out), bitsAt(t, out), movingAt(t), flipsIn(cells, t0, t1),
 *        events(sound, { t0, t1 }), end }
 *   steps[k] gains { k, count, first, last, end } (first/last flip start, end = everything settled).
 *   flips: [{ t, i, to (0|1), step }] sorted by time. Throws when a disc would be asked to flip before its previous
 *   flip has settled (steps too close together): every frame stays a closed form of one flip per disc.
 */
export function createPlan(grid, F, { initial, steps = [] }) {
  const n = grid.n;
  const landAt = flipLandTime(F);
  const per = Array.from({ length: n }, () => []);
  const flips = [];
  let prev = initial;
  const outSteps = steps.map((st, k) => {
    const order = waveOrder(grid, st.wave);
    const spread = st.spread ?? F.spread, jitter = st.jitter ?? F.jitter, seed = st.seed ?? 17 + k * 13;
    let count = 0, first = Infinity, last = -Infinity;
    for (let i = 0; i < n; i++) {
      if (st.to[i] === prev[i]) continue;
      const t = st.t + order[i] * spread + jitter * hash01(seed, 409, i);
      const last_ = per[i][per[i].length - 1];
      if (last_ && t < last_.t + F.settle) throw new Error(`flipplan: step "${st.id ?? k}" flips disc ${i} at ${t.toFixed(3)} s before its previous flip (${last_.t.toFixed(3)} s) has settled; space the steps by spread + jitter + ${F.settle} s`);
      const f = { t, i, to: st.to[i], step: k };
      per[i].push(f); flips.push(f);
      count++; first = Math.min(first, t); last = Math.max(last, t);
    }
    prev = st.to;
    return { ...st, k, count, first: count ? first : st.t, last: count ? last : st.t, end: (count ? last : st.t) + F.settle };
  });
  flips.sort((a, b) => a.t - b.t || a.i - b.i);
  const A0 = (bit) => (bit ? 0 : Math.PI);

  /** every disc's flip angle at t (radians; 0 = bright side to the viewer, PI = dark side) */
  function anglesAt(t, out = new Float32Array(n)) {
    for (let i = 0; i < n; i++) {
      const L = per[i];
      let k = L.length - 1;
      while (k >= 0 && L[k].t > t) k--;
      if (k < 0) { out[i] = A0(initial[i]); continue; }
      const f = L[k], a1 = A0(f.to), a0 = A0(1 - f.to);
      out[i] = a0 + (a1 - a0) * flipSettle(t - f.t, F);
    }
    return out;
  }
  /** logical bits at t (a disc counts as flipped from the moment its flip starts) */
  function bitsAt(t, out = new Uint8Array(n)) {
    for (let i = 0; i < n; i++) {
      const L = per[i];
      let k = L.length - 1;
      while (k >= 0 && L[k].t > t) k--;
      out[i] = k < 0 ? initial[i] : L[k].to;
    }
    return out;
  }
  /** how many discs are mid-flip at t */
  function movingAt(t) {
    let lo = 0, hi = flips.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (flips[m].t < t - F.settle) lo = m + 1; else hi = m; }
    let c = 0;
    for (let k = lo; k < flips.length && flips[k].t <= t; k++) c++;
    return c;
  }
  /** flips of the discs inside a cell box { c0, c1, r0, r1 } (inclusive) between t0 and t1 */
  function flipsIn(box, t0 = -Infinity, t1 = Infinity) {
    return flips.filter((f) => {
      if (f.t < t0 || f.t > t1) return false;
      const c = f.i % grid.cols, r = (f.i - c) / grid.cols;
      return c >= box.c0 && c <= box.c1 && r >= box.r0 && r <= box.r1;
    });
  }
  /**
   * events(S = spec.sound, { t0, t1 }) -> [{ t, kind: "click" | "clatter", count, x (-1..1), to, j }]
   * Clicks land when the disc hits its stop (flip start + landAt). Per S.bin: up to S.lone flips click one by one;
   * more than that become 1..S.maxPerBin clatter grains whose loudness follows the count (density -> clatter).
   */
  function events(S, { t0 = 0, t1 = Infinity } = {}) {
    const bins = new Map();
    for (const f of flips) {
      const tl = f.t + landAt;
      if (tl < t0 || tl > t1) continue;
      const b = Math.floor(tl / S.bin);
      if (!bins.has(b)) bins.set(b, []);
      bins.get(b).push(f);
    }
    const out = [], half = grid.w / 2;
    for (const [b, L] of [...bins.entries()].sort((p, q) => p[0] - q[0])) {
      if (L.length <= S.lone) {
        for (const f of L) out.push({ t: f.t + landAt, kind: "click", count: 1, x: grid.x[f.i] / half, to: f.to, j: f.i });
        continue;
      }
      const grains = Math.min(S.maxPerBin, 1 + Math.floor(Math.log2(L.length)));
      let mx = 0; for (const f of L) mx += grid.x[f.i]; mx /= L.length * half;
      for (let j = 0; j < grains; j++) out.push({ t: (b + (j + hash01(b, j, 53)) / grains) * S.bin, kind: "clatter", count: L.length, grains, x: clamp(mx + (hash01(b, j, 59) - 0.5) * 0.5, -1, 1), to: j % 2, j });
    }
    return out.sort((p, q) => p.t - q.t);
  }
  return { grid, F, initial, steps: outSteps, flips, per, landAt, anglesAt, bitsAt, movingAt, flipsIn, events, end: outSteps.length ? Math.max(...outSteps.map((s) => s.end)) : 0 };
}

/**
 * flipVoices(S = spec.sound) -> voices for kit scoreFromEvents: one short tick per lone flip (to-bright a touch
 * higher than to-dark), clatter grains whose gain grows with sqrt(count / S.ref).
 */
export function flipVoices(S) {
  return {
    click: (e) => [{ type: S.click.type, gain: S.click.gain, pitch: S.click.pitch * (e.to ? 1.12 : 0.9) * (0.94 + 0.12 * hash01(e.j, 71)), dur: S.click.dur, pan: e.x * S.pan }],
    clatter: (e) => [{ type: S.clatter.type, gain: S.clatter.gain * Math.min(1, Math.sqrt(e.count / S.ref)) / Math.sqrt(e.grains), pitch: S.clatter.pitch[0] + (S.clatter.pitch[1] - S.clatter.pitch[0]) * hash01(e.j, Math.round(e.t * 1000), 73), dur: S.clatter.dur, pan: e.x * S.pan }],
  };
}

/** boardBox(grid, { margin = 0, depth = 0 }) -> [min, max] world box of the board (for framing gates / fitShot). */
export function boardBox(grid, { margin = 0, depth = 0 } = {}) {
  return [[-grid.w / 2 - margin, -grid.h / 2 - margin, 0], [grid.w / 2 + margin, grid.h / 2 + margin, depth]];
}
/** asciiBits(bits, grid) -> string preview ("#" bright, "." dark) for Node checks. */
export function asciiBits(bits, grid) {
  let s = "";
  for (let r = 0; r < grid.rows; r++) { for (let c = 0; c < grid.cols; c++) s += bits[c + r * grid.cols] ? "#" : "."; s += "\n"; }
  return s;
}
