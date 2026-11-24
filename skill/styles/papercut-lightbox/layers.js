// styles/papercut-lightbox/layers.js — the planner for "Papercut Lightbox". Plain JS, no THREE, no window, no DOM:
// imported by style.js (picture) and by the demo's scene.config.js (SCORE), so it also runs in Node.
//
//   createLightboxPlan(cfg) -> {
//     cfg, z[k], shapes[k] = { id, outer: [[x,y]...], holes: [[[x,y]...]...] }   (sheet metres, centred, y up)
//     lamp: [x, y, z]                       the little light behind the house window
//     slideAt(k, t) -> { x, visible, u }    sheet k's slide-in offset (+x = still outside the right wall)
//     roomAt(t), backAt(t), warmAt(t), lampAt(t) -> 0..1
//     lightAt(t) -> [x, y, z]               the backlight's position (drives the hot spot AND every projected edge)
//     bakeMasks(nx, ny) -> { nx, ny, n, data: Uint8Array(nx*ny*n*4) }   R sharp, G soft, B softer coverage per sheet
//     events() -> [{ kind, t, dur?, k? }]   every sound cue
//     fingerprint() -> "xxxxxxxx"            integer/time data only (identical in Node and Chrome)
//   }
//
// The light model (used by style.js) is an art-directed layer-transmission approximation, not a scattering simulation:
// a sheet passes a fixed fraction tau (per colour) of the light that reaches it; the light reaching sheet k at p has
// passed every sheet j < k whose (soft) mask covers q_j, the point where the line from the lamp to p crosses sheet j.
import { rng, clamp, lerp, smoothstep, ease } from "../../kit/time.js";
import { valueNoise2 } from "../../kit/noise.js";

export const LAYER_IDS = ["sky", "farMountains", "nearMountains", "forest", "hillHouse", "foreTrees", "leafBorder"];

export const DESIGN_DEFAULTS = {
  step: 0.0006, // ridge sampling (m)
  moon: { c: [0.128, 0.074], r: 0.026 },
  stars: { seed: 5, count: 15, yMin: 0.062, yMax: 0.132, xMin: -0.232, xMax: 0.232, rMin: 0.0026, rMax: 0.0044, clear: 0.016 },
  far: {
    base: 0.004, jag: [0.0052, 0.0026], seed: 11,
    peaks: [{ c: -0.2, h: 0.058, w: 0.11, k: 1.1 }, { c: -0.055, h: 0.086, w: 0.15, k: 1.18 }, { c: 0.085, h: 0.047, w: 0.11, k: 1.1 }, { c: 0.225, h: 0.064, w: 0.12, k: 1.15 }],
  },
  near: {
    base: -0.036, jag: [0.0046, 0.0022], seed: 23,
    peaks: [{ c: -0.235, h: 0.052, w: 0.1, k: 1.05 }, { c: -0.11, h: 0.068, w: 0.12, k: 1.15 }, { c: 0.03, h: 0.05, w: 0.1, k: 1.1 }, { c: 0.165, h: 0.072, w: 0.13, k: 1.2 }],
  },
  forest: { seed: 31, base: -0.064, hMin: 0.022, hMax: 0.048, gapMin: 0.0085, gapMax: 0.0155, widthMin: 0.3, widthMax: 0.4 },
  hill: { base: -0.112, h: 0.058, c: -0.07, w: 0.15, h2: 0.016, c2: 0.17, w2: 0.09 },
  house: { c: -0.07, hw: 0.026, wall: 0.03, roof: 0.024, eave: 0.0055, chimney: [0.009, 0.0165, 0.004] },
  roundTrees: [{ dx: 0.045, r: 0.0155 }, { dx: 0.1, r: 0.0115 }],
  fore: {
    base: -0.12, grass: 0.0075,
    trees: [{ c: -0.218, h: 0.29, w: 0.078, tiers: 5 }, { c: -0.152, h: 0.15, w: 0.046, tiers: 4 }, { c: 0.208, h: 0.255, w: 0.072, tiers: 5 }, { c: 0.152, h: 0.12, w: 0.038, tiers: 3 }],
  },
  leaves: { a: 0.224, b: 0.124, n: 5, seed: 47, veins: false }, // veins = thin slits down the big corner leaves
};

export const PLAN_DEFAULTS = {
  box: { sheet: [0.522, 0.312], gap: 0.014, frontZ: 0, thick: 0.0008, lightZ: -0.17, slideFrom: 0.6 },
  // [start, end] of each sheet's slide (s), back sheet first
  slides: [[-0.3, 0.35], [0.55, 1.25], [1.45, 2.15], [2.75, 3.3], [3.45, 4.0], [4.15, 4.7], [4.85, 5.4]],
  room: [5.95, 6.4], // room light fades out
  back: { on: 6.12, table: [[0, 0], [0.05, 0.62], [0.09, 0.22], [0.14, 0.86], [0.2, 0.7], [0.42, 1]] },
  light: [{ t: 0, p: [-0.04, 0.04] }, { t: 6.6, p: [-0.04, 0.04] }, { t: 9.0, p: [-0.15, 0.045] }, { t: 12.0, p: [0.16, 0.045] }, { t: 14.4, p: [0.05, 0.012] }],
  warm: [12.1, 14.4],
  lamp: { on: 12.75, table: [[0, 0], [0.06, 0.75], [0.1, 0.3], [0.17, 1]] },
  wind: [9.0, 12.0],
  switchAt: 6.1,
  design: DESIGN_DEFAULTS,
};

// ---------------------------------------------------------------- small helpers
const merge = (a, b) => {
  if (b == null) return a;
  if (Array.isArray(a) || typeof a !== "object" || a === null) return b;
  const o = { ...a };
  for (const k of Object.keys(b)) o[k] = k in a ? merge(a[k], b[k]) : b[k];
  return o;
};
const tableAt = (tab, u) => {
  if (u <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (u <= tab[i][0]) {
      const [t0, v0] = tab[i - 1], [t1, v1] = tab[i];
      return lerp(v0, v1, (u - t0) / (t1 - t0));
    }
  }
  return tab[tab.length - 1][1];
};
const circle = (c, r, n) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
});
const star4 = (c, r, rot) => Array.from({ length: 8 }, (_, i) => {
  const a = rot + (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.36 : r;
  return [c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)];
});
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const dedupe = (pts) => pts.filter((p, i) => {
  const q = pts[(i + pts.length - 1) % pts.length];
  return Math.abs(p[0] - q[0]) > 1e-7 || Math.abs(p[1] - q[1]) > 1e-7;
});

/** a mountain range: max of concave peaks + jag (stronger near the tops) */
function rangeFn(R, maxH) {
  return (x) => {
    let h = 0;
    for (const p of R.peaks) {
      const d = Math.abs(x - p.c) / p.w;
      if (d < 1) h = Math.max(h, p.h * Math.pow(1 - d, p.k));
    }
    const amt = 0.35 + 0.65 * clamp(h / maxH);
    const j = R.jag[0] * (valueNoise2(x * 95, 0.37, R.seed) - 0.5) + R.jag[1] * (valueNoise2(x * 270, 0.71, R.seed + 1) - 0.5);
    return R.base + h + j * amt;
  };
}

/** tiered conifer silhouette (max of drooping tents); -Infinity outside the tree */
function conifer(x, T, base, tierH = 0.36) {
  const d = Math.abs(x - T.c);
  if (d >= T.w) return -Infinity;
  const n = T.tiers, th = T.h * tierH;
  let y = -Infinity;
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 1;
    const yb = base + T.h * 0.05 + f * (T.h * 0.95 - th);
    const wi = T.w * (1 - 0.64 * f);
    if (d < wi) y = Math.max(y, yb + th * Math.pow(1 - d / wi, 1.3));
  }
  if (d < T.w * 0.1) y = Math.max(y, base + T.h * 0.08);
  return y;
}

/** a ridge sheet: bottom edge + the ridge, with explicit polylines inserted over [x0, x1] (house, round trees) */
function ridgeSheet(B, D, f, inserts = []) {
  const [SW, SH] = B.sheet, X0 = -SW / 2, X1 = SW / 2, Y0 = -SH / 2;
  const n = Math.round(SW / D.step);
  const ins = [...inserts].sort((a, b) => a.x0 - b.x0);
  const ridge = [];
  let k = 0, i = 0;
  while (i <= n) {
    const x = X0 + (SW * i) / n;
    if (k < ins.length && x > ins[k].x0) {
      ridge.push(...ins[k].pts);
      const end = ins[k].x1;
      k++;
      while (i <= n && X0 + (SW * i) / n < end + 1e-9) i++;
      continue;
    }
    ridge.push([x, f(x)]);
    i++;
  }
  return dedupe([[X0, Y0], [X1, Y0], ...ridge.reverse()]);
}

/** round (scalloped) tree on a ground function g: trunk + crown, as an insert */
function roundTree(g, tx, r, seed) {
  const tw = r * 0.16, gy = g(tx);
  const cy = gy + r * 0.95 + r * 0.94;
  const pts = [[tx - tw, g(tx - tw)], [tx - tw, cy - 0.94 * r]];
  const a0 = (250 / 180) * Math.PI, a1 = (-70 / 180) * Math.PI, N = 72;
  for (let i = 0; i <= N; i++) {
    const a = lerp(a0, a1, i / N);
    const sc = 1 + 0.075 * Math.abs(Math.sin(4.5 * (a - seed)));
    pts.push([tx + r * sc * Math.cos(a), cy + r * sc * Math.sin(a)]);
  }
  pts.push([tx + tw, cy - 0.94 * r], [tx + tw, g(tx + tw)]);
  return { x0: tx - tw, x1: tx + tw, pts };
}

// ---------------------------------------------------------------- the artwork: seven sheets
export function makeDesign(B, D = DESIGN_DEFAULTS) {
  const [SW, SH] = B.sheet, X0 = -SW / 2, X1 = SW / 2, Y0 = -SH / 2, Y1 = SH / 2;
  const sheetRect = rectPts(X0, Y0, X1, Y1);
  const shapes = [];

  // 0 · sky with a cut-out moon and pin-pricked stars (decisions use only rng + distances: identical in Node/Chrome)
  {
    const holes = [circle(D.moon.c, D.moon.r, 120)];
    const S = D.stars, r = rng(S.seed);
    let tries = 0;
    const placed = [];
    while (placed.length < S.count && tries++ < 400) {
      const c = [r.range(S.xMin, S.xMax), r.range(S.yMin, S.yMax)];
      const rad = r.range(S.rMin, S.rMax), rot = r.range(0, Math.PI / 2);
      const d2 = (p) => (c[0] - p[0]) * (c[0] - p[0]) + (c[1] - p[1]) * (c[1] - p[1]); // exact arithmetic only
      const rm = D.moon.r + S.clear + rad;
      if (d2(D.moon.c) < rm * rm) continue;
      if (placed.some((p) => d2(p) < 0.03 * 0.03)) continue;
      placed.push(c);
      holes.push(star4(c, rad, rot));
    }
    shapes.push({ id: "sky", outer: sheetRect, holes, stars: placed.length });
  }

  // 1 · far mountains, 2 · near mountains
  shapes.push({ id: "farMountains", outer: ridgeSheet(B, D, rangeFn(D.far, 0.086)), holes: [] });
  shapes.push({ id: "nearMountains", outer: ridgeSheet(B, D, rangeFn(D.near, 0.072)), holes: [] });

  // 3 · forest: a low hill crowded with tiered conifers
  {
    const F = D.forest, r = rng(F.seed);
    const hill = (x) => F.base + 0.009 * Math.sin(x * 9 + 1) + 0.005 * Math.sin(x * 23 + 0.3);
    const trees = [];
    let x = X0 - 0.012;
    while (x < X1 + 0.012) {
      const tall = 0.7 + 0.6 * valueNoise2(x * 7, 3.3, 41);
      const h = lerp(F.hMin, F.hMax, r.next()) * tall;
      trees.push({ c: x, h, w: h * lerp(F.widthMin, F.widthMax, r.next()), tiers: r.int(3, 4) });
      x += lerp(F.gapMin, F.gapMax, r.next());
    }
    const f = (xx) => {
      let y = hill(xx);
      for (const T of trees) if (Math.abs(xx - T.c) < T.w) y = Math.max(y, conifer(xx, T, hill(T.c)));
      return y;
    };
    shapes.push({ id: "forest", outer: ridgeSheet(B, D, f), holes: [], trees: trees.length });
  }

  // 4 · a hill with a small house (four-pane windows, door, round attic window) and round trees
  let lamp;
  {
    const H = D.hill, Ho = D.house;
    const g = (x) => H.base + H.h * Math.exp(-(((x - H.c) / H.w) ** 2)) + H.h2 * Math.exp(-(((x - H.c2) / H.w2) ** 2)) + 0.0025 * Math.sin(x * 31);
    const c = Ho.c, xL = c - Ho.hw, xR = c + Ho.hw;
    const yW = Math.max(g(xL), g(xR)) + Ho.wall, apex = yW + Ho.roof, e = Ho.eave;
    const roofY = (x) => yW + 0.0015 + (apex - yW - 0.0015) * (1 - Math.abs(x - c) / (Ho.hw + e));
    const [ch0, ch1, chUp] = Ho.chimney;
    const house = [
      [xL, g(xL)], [xL, yW], [xL - e, yW - 0.0015], [xL - e, yW + 0.0015],
      [c, apex],
      [c + ch0, roofY(c + ch0)], [c + ch0, apex + chUp], [c + ch1, apex + chUp], [c + ch1, roofY(c + ch1)],
      [xR + e, yW + 0.0015], [xR + e, yW - 0.0015], [xR, yW], [xR, g(xR)],
    ];
    const inserts = [{ x0: xL, x1: xR, pts: house }];
    D.roundTrees.forEach((T, i) => inserts.push(roundTree(g, c + T.dx + (T.dx > 0 ? Ho.hw : -Ho.hw), T.r, 0.7 + i)));
    const yG = Math.max(g(xL), g(xR));
    const holes = [];
    const win = (cx, cy, w, h, bar) => {
      const pw = (w - bar) / 2, ph = (h - bar) / 2;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const x0 = sx < 0 ? cx - w / 2 : cx + bar / 2, y0 = sy < 0 ? cy - h / 2 : cy + bar / 2;
        holes.push(rectPts(x0, y0, x0 + pw, y0 + ph));
      }
    };
    const wy = yG + 0.016;
    win(c - 0.0135, wy, 0.0105, 0.012, 0.0015);
    win(c + 0.0135, wy, 0.0105, 0.012, 0.0015);
    holes.push(rectPts(c - 0.0042, yG + 0.0035, c + 0.0042, yG + 0.0175)); // door
    holes.push(circle([c, yW + (apex - yW) * 0.38], 0.0036, 40)); // attic window
    lamp = [c, yG + 0.013];
    shapes.push({ id: "hillHouse", outer: dedupe(ridgeSheet(B, D, g, inserts)), holes, house: { c, yG, yW, apex } });
  }

  // 5 · foreground: tall conifers at the sides on a grassy bank
  {
    const Fo = D.fore;
    const ground = (x) => {
      const tuft = Math.max(0, valueNoise2(x * 22, 7.7, 53) - 0.42) / 0.58;
      const saw = 1 - Math.abs(((x * 380) % 1 + 1) % 1 * 2 - 1);
      return Fo.base + 0.006 * Math.sin(x * 17 + 0.4) + 0.004 * Math.sin(x * 41) + Fo.grass * tuft * saw;
    };
    const f = (x) => {
      let y = ground(x);
      for (const T of Fo.trees) y = Math.max(y, conifer(x, T, Fo.base));
      return y;
    };
    shapes.push({ id: "foreTrees", outer: ridgeSheet(B, D, f), holes: [] });
  }

  // 6 · leaf border: the sheet with a big opening whose edge is crowded with pointed leaves (veined at the corners)
  {
    const L = D.leaves, r = rng(L.seed);
    const rb = (th) => Math.pow(Math.abs(Math.cos(th) / L.a) ** L.n + Math.abs(Math.sin(th) / L.b) ** L.n, -1 / L.n);
    const leaves = [];
    const corner = Math.atan2(L.b, L.a);
    const cornerAngles = [corner, Math.PI - corner, Math.PI + corner, 2 * Math.PI - corner];
    cornerAngles.forEach((ca, ci) => {
      const big = ci >= 2 ? 1.15 : 1; // bottom corners a little heavier (foreground foliage)
      const n = 5;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 0.115 + r.range(-0.03, 0.03);
        const Ln = r.range(0.032, 0.062) * big * (1 - 0.35 * Math.abs(i - 2) / 2);
        leaves.push({ th: ca + off, len: Ln, w: Ln * r.range(0.38, 0.46), vein: Ln > 0.042 });
      }
    });
    // small leaves along the edges (skip near the corners, where the clusters are)
    for (let k = 0; k < 52; k++) {
      const th = (k / 52) * Math.PI * 2 + r.range(-0.03, 0.03);
      const dc = Math.min(...cornerAngles.map((ca) => Math.abs(Math.atan2(Math.sin(th - ca), Math.cos(th - ca)))));
      if (dc < 0.3 || r.chance(0.3)) continue;
      const Ln = r.range(0.01, 0.024);
      leaves.push({ th, len: Ln, w: Ln * r.range(0.5, 0.62), vein: false });
    }
    const depthAt = (th) => {
      let dmax = 0;
      for (const lf of leaves) {
        const dth = Math.atan2(Math.sin(th - lf.th), Math.cos(th - lf.th));
        const v = Math.abs(dth) * rb(lf.th);
        if (v >= lf.w) continue;
        const d = lf.len * (1 - Math.asin(v / lf.w) / Math.PI);
        if (d > dmax) dmax = d;
      }
      return dmax;
    };
    const N = 1600, hole = [];
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2, rr = rb(th) - depthAt(th);
      hole.push([rr * Math.cos(th), rr * Math.sin(th)]);
    }
    const holes = [hole];
    for (const lf of leaves) {
      if (!lf.vein || !L.veins) continue;
      const R0 = rb(lf.th), cs = Math.cos(lf.th), sn = Math.sin(lf.th);
      const a = R0 - lf.len * 0.2, b = R0 - lf.len * 0.72, wa = 0.00045, wb = 0.00016;
      holes.push([[a * cs - wa * sn, a * sn + wa * cs], [b * cs - wb * sn, b * sn + wb * cs], [b * cs + wb * sn, b * sn - wb * cs], [a * cs + wa * sn, a * sn - wa * cs]]);
    }
    shapes.push({ id: "leafBorder", outer: sheetRect, holes, leaves: leaves.length });
  }
  return { shapes, lamp };
}

// ---------------------------------------------------------------- rasterising the sheets into coverage masks
/** even-odd coverage of polygons on an nx × ny grid over [x0,x1]×[y0,y1] (row 0 = y0), ss sub-rows, exact spans */
export function rasterize(polys, nx, ny, x0, y0, x1, y1, ss = 4) {
  const out = new Float32Array(nx * ny);
  const kx = nx / (x1 - x0), ky = ny / (y1 - y0);
  const E = [];
  for (const P of polys) {
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const ya = (a[1] - y0) * ky, yb = (b[1] - y0) * ky;
      if (ya === yb) continue;
      E.push([(a[0] - x0) * kx, ya, (b[0] - x0) * kx, yb, Math.min(ya, yb), Math.max(ya, yb)]);
    }
  }
  // bucket edges by row
  const rows = Array.from({ length: ny }, () => []);
  for (const e of E) {
    const r0 = Math.max(0, Math.floor(e[4])), r1 = Math.min(ny - 1, Math.floor(e[5]));
    for (let r = r0; r <= r1; r++) rows[r].push(e);
  }
  const acc = new Float32Array(nx);
  const xs = [];
  for (let row = 0; row < ny; row++) {
    acc.fill(0);
    for (let s = 0; s < ss; s++) {
      const yy = row + (s + 0.5) / ss;
      xs.length = 0;
      for (const e of rows[row]) {
        if (yy >= e[4] && yy < e[5]) xs.push(e[0] + ((yy - e[1]) * (e[2] - e[0])) / (e[3] - e[1]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const a = Math.max(0, xs[i]), b = Math.min(nx, xs[i + 1]);
        if (b <= a) continue;
        const ia = Math.floor(a), ib = Math.floor(b);
        if (ia === ib) { acc[ia] += (b - a) / ss; continue; }
        acc[ia] += (ia + 1 - a) / ss;
        for (let j = ia + 1; j < ib; j++) acc[j] += 1 / ss;
        if (ib < nx) acc[ib] += (b - ib) / ss;
      }
    }
    for (let i = 0; i < nx; i++) out[row * nx + i] = Math.min(1, acc[i]);
  }
  return out;
}

/** three passes of a clamped separable box blur (≈ gaussian, σ ≈ r) */
export function blur(src, nx, ny, r) {
  if (r <= 0) return src;
  let a = Float32Array.from(src), b = new Float32Array(src.length);
  const pass = (from, to, horiz) => {
    const len = horiz ? nx : ny, lines = horiz ? ny : nx, w = 2 * r + 1;
    for (let l = 0; l < lines; l++) {
      const at = (i) => (horiz ? l * nx + clamp(i, 0, len - 1) : clamp(i, 0, len - 1) * nx + l);
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += from[at(i)];
      for (let i = 0; i < len; i++) {
        to[at(i)] = sum / w;
        sum += from[at(i + r + 1)] - from[at(i - r)];
      }
    }
  };
  for (let it = 0; it < 3; it++) {
    pass(a, b, true); pass(b, a, false);
  }
  return a;
}

// ---------------------------------------------------------------- the plan
export function createLightboxPlan(cfg = {}) {
  const C = merge(PLAN_DEFAULTS, cfg);
  const B = C.box, D = C.design;
  const n = LAYER_IDS.length;
  const z = Array.from({ length: n }, (_, k) => B.frontZ - (n - 1 - k) * B.gap);
  const { shapes, lamp } = makeDesign(B, D);
  const lampZ = (z[3] + z[4]) / 2;

  const slideAt = (k, t) => {
    const [s0, s1] = C.slides[k];
    if (t < s0) return { x: B.slideFrom, visible: false, u: 0 };
    const u = clamp((t - s0) / (s1 - s0));
    return { x: B.slideFrom * Math.pow(1 - u, 3), visible: true, u };
  };
  const roomAt = (t) => 1 - smoothstep(C.room[0], C.room[1], t);
  const backAt = (t) => tableAt(C.back.table, t - C.back.on);
  const lampAt = (t) => tableAt(C.lamp.table, t - C.lamp.on);
  const warmAt = (t) => ease.inOutSine(clamp((t - C.warm[0]) / (C.warm[1] - C.warm[0])));
  const lightAt = (t) => {
    const K = C.light;
    let p = K[0].p;
    if (t >= K[K.length - 1].t) p = K[K.length - 1].p;
    else for (let i = 1; i < K.length; i++) {
      if (t < K[i].t) {
        const u = ease.inOutSine((t - K[i - 1].t) / (K[i].t - K[i - 1].t));
        p = [lerp(K[i - 1].p[0], K[i].p[0], u), lerp(K[i - 1].p[1], K[i].p[1], u)];
        break;
      }
    }
    return [p[0], p[1], B.lightZ];
  };

  /** R sharp, G/B/A blurred with box radii `radii` (px) — four softness levels a shader blends by distance */
  function bakeMasks(nx, ny, { ss = 4, radii = [3, 10, 24] } = {}) {
    const [SW, SH] = B.sheet;
    const data = new Uint8Array(nx * ny * n * 4);
    shapes.forEach((S, k) => {
      const cov = rasterize([S.outer, ...S.holes], nx, ny, -SW / 2, -SH / 2, SW / 2, SH / 2, ss);
      const L = [cov, ...radii.map((r) => blur(cov, nx, ny, r))];
      const off = k * nx * ny * 4;
      for (let i = 0; i < nx * ny; i++) for (let c = 0; c < 4; c++) data[off + i * 4 + c] = Math.round(clamp(L[c][i]) * 255);
    });
    return { nx, ny, n, data };
  }

  function events() {
    const ev = [];
    C.slides.forEach(([s0, s1], k) => {
      const t0 = Math.max(0, s0);
      if (s1 - t0 > 0.05) ev.push({ kind: "slide", t: +t0.toFixed(4), dur: +(s1 - t0).toFixed(4), k });
      ev.push({ kind: "click", t: +s1.toFixed(4), k });
    });
    ev.push({ kind: "switch", t: C.switchAt });
    ev.push({ kind: "glow", t: C.back.on, dur: 15 - C.back.on });
    ev.push({ kind: "wind", t: C.wind[0], dur: C.wind[1] - C.wind[0] });
    ev.push({ kind: "warm", t: C.warm[0], dur: 15 - C.warm[0] });
    ev.push({ kind: "lamp", t: C.lamp.on });
    return ev.sort((a, b) => a.t - b.t);
  }

  function fingerprint() {
    const s = JSON.stringify({
      ev: events().map((e) => [e.kind, e.t, e.dur ?? 0, e.k ?? -1]),
      counts: shapes.map((S) => [S.outer.length, S.holes.length, S.holes.reduce((a, h) => a + h.length, 0)]),
    });
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0");
  }

  return { cfg: C, z, n, shapes, lamp: [lamp[0], lamp[1], lampZ], slideAt, roomAt, backAt, lampAt, warmAt, lightAt, bakeMasks, events, fingerprint };
}
