// styles/pointillism/dots.js — the pointillism planner. Pure, THREE-free, Node-safe (imports only kit/time.js,
// kit/noise.js and this style's spec.js). scene.js reads it for the picture, scene.config.js for the camera checks and
// every sound cue, so picture and sound come from one plan.
//
//   SCENE / sceneAt(X, Y)  an original sunlit lake scene built from gradients and shapes (sky, sun, violet hills, lake
//                          with a gold sun-glitter column, a sailing boat with a big sail, one large tree, a grass bank).
//                          Canvas units: X in [0, w/h] left to right, Y in [0, 1] bottom to top. Only + - * / and
//                          comparisons (plus the integer-hash value noise of kit/noise.js): no sin/cos/exp/pow, so Node
//                          and Chrome agree to the bit.
//   createPlan(opts)       ~10,000 dots on a jittered, row-offset grid (seeded). Each dot gets ONE pure palette colour
//                          by a seeded rule so the local average matches the scene colour: the best pair of allowed pure
//                          hues in proportion (decomposed in display sRGB, the space the defocus blurs in), plus a share
//                          of the complementary hue in shadows. Every dot gets an appear time: the first few are dabbed
//                          by two brushes, then regions flood one after another as ragged fronts from an origin.
//                          Returns typed arrays + brushPose(b, t) + events() + hash.
import { rng, hash01, clamp, smoothstep } from "../../kit/time.js";
import { valueNoise2, fbm2 } from "../../kit/noise.js";
import { STYLE_SPEC } from "./spec.js";

const hexRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const PAINT_IDS = Object.keys(STYLE_SPEC.palette.paint);
export const PAINT = PAINT_IDS.map((id) => ({ id, hex: STYLE_SPEC.palette.paint[id], rgb: hexRgb(STYLE_SPEC.palette.paint[id]) }));
const PI_ = Object.fromEntries(PAINT_IDS.map((id, i) => [id, i]));
/** the complementary hue added in shadows (opposite side of the colour wheel, from this palette) */
export const COMPLEMENT = {
  white: "lilac", lemon: "violet", orange: "ultramarine", vermilion: "cerulean", rose: "cerulean",
  lilac: "lemon", violet: "lemon", ultramarine: "orange", cerulean: "orange", sky: "orange",
};
export const REGIONS = ["water", "hills", "sky", "grass", "boat", "tree", "sun"];
const RG = Object.fromEntries(REGIONS.map((id, i) => [id, i]));

// ---------------------------------------------------------------- the scene (canvas units, Y up)
const C = (h) => hexRgb(h);
export const SCENE = {
  horizon: 0.565,
  sun: { x: 1.42, y: 0.84, r: 0.072, halo: 0.25 },
  bank: { y0: 0.258, slope: -0.072, wob: 0.014 },
  glitter: { w0: 0.06, grow: 0.3 },
  crown: [
    [0.40, 0.80, 0.27, 0.20], [0.20, 0.70, 0.19, 0.15], [0.58, 0.71, 0.15, 0.13],
    [0.30, 0.97, 0.28, 0.15], [0.08, 0.88, 0.15, 0.19], [0.55, 0.92, 0.16, 0.12],
  ],
  trunk: { x0: 0.36, lean: 0.05, w0: 0.05, w1: 0.03, top: 0.66 },
  hull: { y0: 0.31, y1: 0.368, xl: [0.895, 0.858], xr: [1.07, 1.135] },
  mast: { x: 0.99, hw: 0.0065, y0: 0.365, y1: 0.83 },
  main: [[0.99, 0.378], [0.99, 0.82], [0.815, 0.386]],
  jib: [[1.006, 0.79], [1.006, 0.386], [1.165, 0.392]],
  refl: 0.115,
  col: {
    skyHorizon: C("#ffe1ac"), skyLow: C("#a6d3ff"), skyTop: C("#5a8ff0"), cloud: C("#ffe6f0"),
    sun: C("#fff28a"), halo: C("#ffd76e"),
    hillLow: C("#8a78dc"), hillTop: C("#caa4ec"),
    waterFar: C("#a8cff7"), waterNear: C("#4a7ee4"), gold: C("#ffa632"),
    grass: C("#b8da4c"), grassRim: C("#e2f07a"), grassShade: C("#6d7ad8"),
    trunkLit: C("#ff8f4a"), trunkShade: C("#7a3fc0"),
    hullLit: C("#ff7a3c"), hull: C("#f0463a"), hullShade: C("#b8407c"),
    main: C("#fff2cc"), mainShade: C("#f6d6cc"), jib: C("#e6d8ff"), mast: C("#5a4ad0"),
  },
};
const ALLOW = {
  sky: ["white", "lemon", "orange", "rose", "lilac", "sky", "cerulean", "ultramarine"],
  sun: ["white", "lemon", "orange"],
  halo: ["white", "lemon", "orange", "sky", "cerulean"],
  hills: ["lilac", "violet", "rose", "sky", "cerulean", "white"],
  water: ["white", "sky", "cerulean", "ultramarine", "violet", "lilac"],
  glitter: ["white", "sky", "cerulean", "ultramarine", "orange", "lemon"],
  grass: ["lemon", "cerulean", "sky", "ultramarine", "violet"],
  trunk: ["orange", "rose", "vermilion", "violet", "ultramarine", "lilac"],
  hull: ["vermilion", "orange", "rose", "violet", "lemon"],
  sail: ["white", "lemon", "lilac", "rose", "sky"],
  mast: ["violet", "ultramarine", "rose"],
  refl: ["white", "lemon", "vermilion", "sky", "cerulean", "ultramarine"],
};
const ALLOW_I = Object.fromEntries(Object.entries(ALLOW).map(([k, v]) => [k, v.map((id) => PI_[id])]));

const hump = (s) => { const q = 1 - s * s; return q > 0 ? q * q : 0; };
export function hillTop(X) {
  const H = SCENE.horizon;
  return H + 0.014 + 0.07 * hump((X - 1.3) / 0.34) + 0.045 * hump((X - 0.9) / 0.22) + 0.03 * hump((X - 1.66) / 0.16) + 0.02 * hump((X - 0.35) / 0.3);
}
export function bankAt(X) {
  const b = SCENE.bank;
  return b.y0 + b.slope * X + b.wob * (valueNoise2(X * 4, 1.5, 7) - 0.5);
}
export function crownField(X, Y) {
  let f = -9;
  for (const [cx, cy, rx, ry] of SCENE.crown) {
    const dx = (X - cx) / rx, dy = (Y - cy) / ry;
    f = Math.max(f, 1 - dx * dx - dy * dy);
  }
  return f + 0.34 * (fbm2(X * 7, Y * 7, { seed: 31, octaves: 3 }) - 0.5);
}
function inTri(X, Y, [a, b, c]) {
  const d1 = (X - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (Y - b[1]);
  const d2 = (X - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (Y - c[1]);
  const d3 = (X - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (Y - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/**
 * sceneAt(X, Y) -> { reg, c, allow, shade } or { reg, pair: [i, j], w, comp, shade } (explicit two-hue mix)
 *   reg = region index (REGIONS), c = target colour (display sRGB 0..1), allow = palette indices the rule may use,
 *   shade = 0..1 share of the complementary hue (x spec.dots.complement).
 */
export function sceneAt(X, Y) {
  const S = SCENE, K = S.col, HZ = S.horizon;
  // ---- tree crown: lemon + cerulean only (the "green" of the demo), violet in its deepest shadow
  const cf = crownField(X, Y);
  if (cf > 0) {
    let best = -9, lx = 0, ly = 0;
    for (const [cx, cy, rx, ry] of S.crown) {
      const dx = (X - cx) / rx, dy = (Y - cy) / ry, f = 1 - dx * dx - dy * dy;
      if (f > best) { best = f; lx = dx; ly = dy; }
    }
    const lt0 = 0.5 + 1.25 * ((X - 0.33) * 0.85 + (Y - 0.8) * 0.5);       // sun on the right: the whole crown
    const clump = 0.5 + 0.5 * (lx * 0.8 + ly * 0.6);                         // each leaf mass lit up-right
    const lt = clamp(0.42 * lt0 + 0.58 * clump + 0.3 * (valueNoise2(X * 22, Y * 22, 37) - 0.5));
    const blue = lt < 0.2 ? PI_.ultramarine : PI_.cerulean;
    return { reg: RG.tree, pair: [PI_.lemon, blue], w: 0.12 + 0.58 * lt, comp: PI_.violet, shade: lt < 0.3 ? (0.3 - lt) / 0.3 : 0 };
  }
  // ---- trunk
  const bank = bankAt(X);
  const T = S.trunk;
  if (Y < T.top && Y > bank - 0.012) {
    const cx = T.x0 + T.lean * (Y - 0.22);
    const k = clamp((Y - 0.22) / 0.42);
    let hw = T.w0 + (T.w1 - T.w0) * k;
    const fl = 1 - (Y - bank) / 0.06;
    if (fl > 0) hw += 0.026 * fl * fl;
    const s = (X - cx) / hw;
    if (s > -1 && s < 1) {
      const lit = smoothstep(-0.25, 0.65, s);
      return { reg: RG.tree, c: mix(K.trunkShade, K.trunkLit, lit), allow: ALLOW_I.trunk, shade: (1 - lit) * 0.6 };
    }
  }
  // ---- boat: sails, mast, hull, reflection
  if (inTri(X, Y, S.main)) {
    const u = clamp((S.main[0][0] - X) / (S.main[0][0] - S.main[2][0]));
    return { reg: RG.boat, c: mix(K.main, K.mainShade, 0.75 * u * u), allow: ALLOW_I.sail, shade: 0 };
  }
  if (inTri(X, Y, S.jib)) {
    const u = clamp((X - S.jib[0][0]) / (S.jib[2][0] - S.jib[0][0]));
    return { reg: RG.boat, c: mix(K.main, K.jib, 0.35 + 0.65 * u), allow: ALLOW_I.sail, shade: 0.15 };
  }
  const M = S.mast;
  if (X > M.x - M.hw && X < M.x + M.hw && Y > M.y0 && Y < M.y1) return { reg: RG.boat, c: K.mast, allow: ALLOW_I.mast, shade: 0 };
  const Hl = S.hull;
  if (Y > Hl.y0 && Y < Hl.y1) {
    const k = (Y - Hl.y0) / (Hl.y1 - Hl.y0);
    const xl = Hl.xl[0] + (Hl.xl[1] - Hl.xl[0]) * k, xr = Hl.xr[0] + (Hl.xr[1] - Hl.xr[0]) * k;
    if (X > xl && X < xr) {
      const c = k > 0.78 ? K.hullLit : mix(K.hullShade, K.hull, smoothstep(0, 0.55, k));
      return { reg: RG.boat, c, allow: ALLOW_I.hull, shade: k < 0.3 ? 0.4 : 0 };
    }
  }
  // ---- sun disc
  const sx = X - S.sun.x, sy = Y - S.sun.y, ds = Math.sqrt(sx * sx + sy * sy);
  if (ds < S.sun.r) return { reg: RG.sun, c: K.sun, allow: ALLOW_I.sun, shade: 0 };
  // ---- sky + hills
  const ht = hillTop(X);
  if (Y > HZ) {
    if (Y < ht) {
      const k = (Y - HZ) / (ht - HZ);
      return { reg: RG.hills, c: mix(K.hillLow, K.hillTop, k), allow: ALLOW_I.hills, shade: 0.25 * (1 - k) };
    }
    const u = (Y - HZ) / (1 - HZ);
    let c = u < 0.12 ? mix(K.skyHorizon, K.skyLow, u / 0.12) : mix(K.skyLow, K.skyTop, (u - 0.12) / 0.88);
    const cl = smoothstep(0.56, 0.76, fbm2(X * 2.2, Y * 5.5, { seed: 21, octaves: 3 })) * smoothstep(0.18, 0.35, u) * smoothstep(0.2, 0.34, ds);
    c = mix(c, K.cloud, 0.55 * cl);
    if (ds < S.sun.halo) {
      const h = 1 - (ds - S.sun.r) / (S.sun.halo - S.sun.r);
      c = mix(c, K.halo, 0.85 * h * h);
      return { reg: RG.sky, c, allow: ALLOW_I.halo, shade: 0 };
    }
    return { reg: RG.sky, c, allow: ALLOW_I.sky, shade: 0 };
  }
  // ---- lake (with the boat's reflection and the sun's glitter column)
  if (Y > bank) {
    const q = clamp((HZ - Y) / (HZ - bank));
    let c = mix(K.waterFar, K.waterNear, q * (2 - q));
    const rip = valueNoise2(X * 5, Y * 46, 11);
    c = mix(c, [1, 1, 1], 0.16 * smoothstep(0.55, 0.85, rip));
    // boat reflection (scheduled with the boat)
    if (Y < Hl.y0 && Y > Hl.y0 - S.refl && X > Hl.xl[0] - 0.01 && X < Hl.xr[0] + 0.01) {
      const d = (Hl.y0 - Y) / S.refl;
      const wob = smoothstep(0.35, 0.65, valueNoise2(X * 6, Y * 60, 17));
      const sail = X < S.main[0][0] + 0.02 && X > S.main[2][0] + 0.06 ? 1 : 0.55;
      const top = d < 0.22 ? K.hull : K.main;
      const s = (1 - d) * (0.45 + 0.55 * wob) * sail;
      return { reg: RG.boat, c: mix(c, top, 0.75 * s), allow: ALLOW_I.refl, shade: 0 };
    }
    const G = S.glitter, gw = G.w0 + G.grow * (HZ - Y);
    const col = 1 - Math.abs(X - S.sun.x) / gw;
    if (col > 0) {
      const streak = smoothstep(0.3, 0.62, valueNoise2(X * 9, Y * 70, 13));
      const g = smoothstep(0, 0.45, col) * streak * (0.6 + 0.4 * (1 - q));
      return { reg: RG.water, c: mix(c, K.gold, 0.95 * g), allow: ALLOW_I.glitter, shade: 0 };
    }
    return { reg: RG.water, c, allow: ALLOW_I.water, shade: 0.12 * q };
  }
  // ---- grass bank, with the tree's shadow
  const ex = (X - 0.36) / 0.44, ey = (Y - 0.1) / 0.085;
  const sh = smoothstep(0.0, 0.35, 1 - ex * ex - ey * ey + 0.3 * (valueNoise2(X * 9, Y * 9, 41) - 0.5));
  // sunlit grass = lemon + cerulean (no green paint); in the tree's shadow cerulean/ultramarine + orange flecks
  const rim = (1 - sh) * smoothstep(0.035, 0, bank - Y);
  const w = (0.56 + 0.2 * rim) * (1 - 0.72 * sh) + 0.06 * (valueNoise2(X * 14, Y * 14, 43) - 0.5);
  return { reg: RG.grass, pair: [PI_.lemon, sh > 0.55 ? PI_.ultramarine : PI_.cerulean], w, comp: PI_.orange, shade: sh };
}

/** best pair (i, j) of allowed hues and weight w (share of i) whose mix is nearest the target (display sRGB) */
export function decompose(c, allow) {
  let best = { e: Infinity, i: allow[0], j: allow[0], w: 1 };
  for (let a = 0; a < allow.length; a++) {
    const A = PAINT[allow[a]].rgb;
    for (let b = a; b < allow.length; b++) {
      const B = PAINT[allow[b]].rgb;
      const d0 = A[0] - B[0], d1 = A[1] - B[1], d2 = A[2] - B[2];
      const dd = d0 * d0 + d1 * d1 + d2 * d2;
      let w = dd > 0 ? ((c[0] - B[0]) * d0 + (c[1] - B[1]) * d1 + (c[2] - B[2]) * d2) / dd : 1;
      w = clamp(w);
      const e0 = B[0] + d0 * w - c[0], e1 = B[1] + d1 * w - c[1], e2 = B[2] + d2 * w - c[2];
      const e = e0 * e0 + e1 * e1 + e2 * e2;
      if (e < best.e - 1e-12) best = { e, i: allow[a], j: allow[b], w };
    }
  }
  return best;
}

const fnv = (h, n) => {
  h ^= n >>> 0; h = Math.imul(h, 16777619) >>> 0;
  return h;
};

/**
 * createPlan({ seed, regions, dabs, brushes }) -> plan
 *   regions: { <name>: { t0, t1, origin: [X, Y] (canvas units), jit = .22 (share of the window that is ragged), gamma,
 *              front?: [[distance m, t], ...] (piecewise-linear front instead of t0..t1; jitS s of raggedness) } }
 *   dabs:    { at: [X, Y], times: [t...], hop, contact } — dab k goes to brush (k % 2): brush 0 (orange, comes from the
 *            right) takes the right half of the nearest dots, brush 1 (blue, from the left) the left half.
 *   brushes: [{ axis: [x, y, z], enter: [t, dist], exit: [dt, dist] }, ...]
 * plan = { n, x, y, r, rot, asp, seed, hgt, col (Uint8 palette index), reg (Uint8), t (appear), W, H, cell,
 *          dabs: [{ k, b, t, x, y, col, i }], regionTimes: [{ id, t0, t1, done, n }], brushPose(b, t), events(), hash,
 *          stats(), toMetres(X, Y), toCanvas(x, y) }
 */
export function createPlan(o = {}) {
  const S = STYLE_SPEC, CV = S.canvas, D = S.dots;
  const W = CV.w, H = CV.h, A = W / H;
  const cols = D.cols, rows = D.rows, sx = W / cols, sy = H / rows;
  const toMetres = (X, Y) => [X * H - W / 2, Y * H - H / 2];
  const toCanvas = (x, y) => [(x + W / 2) / H, (y + H / 2) / H];
  const rnd = rng(o.seed ?? 119);
  const n = cols * rows;
  const x = new Float32Array(n), y = new Float32Array(n), r = new Float32Array(n), rot = new Float32Array(n);
  const asp = new Float32Array(n), seed = new Float32Array(n), hgt = new Float32Array(n), t = new Float32Array(n);
  const col = new Uint8Array(n), reg = new Uint8Array(n);
  const jitT = new Float64Array(n);
  const P0 = new Uint8Array(n), P1 = new Uint8Array(n), Wt = new Float64Array(n), CMP = new Uint8Array(n);
  const counts = new Array(PAINT.length).fill(0);
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++, k++) {
      const off = j & 1 ? 0.5 : 0;
      let px = -W / 2 + (i + 0.25 + off) * sx + (rnd.next() - 0.5) * 2 * D.jitter * sx;
      let py = -H / 2 + (j + 0.5) * sy + (rnd.next() - 0.5) * 2 * D.jitter * sy;
      px = clamp(px, -W / 2 + 0.3 * sx, W / 2 - 0.3 * sx);
      py = clamp(py, -H / 2 + 0.3 * sy, H / 2 - 0.3 * sy);
      x[k] = px; y[k] = py;
      r[k] = D.radius * sx * (1 - D.radiusVar / 2 + D.radiusVar * rnd.next());
      rot[k] = D.angle[0] + (D.angle[1] - D.angle[0]) * rnd.next();
      asp[k] = D.aspect[0] + (D.aspect[1] - D.aspect[0]) * rnd.next();
      seed[k] = rnd.next();
      hgt[k] = 0.8 + 0.4 * rnd.next();
      const pick = (0.5 * rnd.next() + 0.7548776662 * i + 0.56984029 * j) % 1;
      jitT[k] = rnd.next();
      const [X, Y] = toCanvas(px, py);
      const sc = sceneAt(clamp(X, 0, A), clamp(Y, 0, 1));
      reg[k] = sc.reg;
      if (sc.pair) { P0[k] = sc.pair[0]; P1[k] = sc.pair[1]; Wt[k] = clamp(sc.w); }
      else { const d = decompose(sc.c, sc.allow); P0[k] = d.i; P1[k] = d.j; Wt[k] = d.w; }
      const pc = D.complement * sc.shade;
      if (pick < pc) {
        const dom = Wt[k] >= 0.5 ? P0[k] : P1[k];
        CMP[k] = (sc.comp ?? PI_[COMPLEMENT[PAINT_IDS[dom]]]) + 1;
      }
    }
  }
  // ---- colour choice: error diffusion over the grid (blue-noise placement), so the share of each pure hue is right
  // within a dot or two and the squint melts it into the target colour instead of blotches. Error only flows between
  // neighbours mixing the same two hues; a little seeded noise breaks up regular worms. Complementary dots (chosen
  // above) sit outside the diffusion.
  const Err = new Float64Array(n);
  const give = (q, kk, e) => { if (kk >= 0 && kk < n && !CMP[kk] && P0[kk] === P0[q] && P1[kk] === P1[q]) Err[kk] += e; };
  for (let j = 0; j < rows; j++) {
    const ltr = (j & 1) === 0;                                 // serpentine scan
    for (let s = 0; s < cols; s++) {
      const i = ltr ? s : cols - 1 - s, q = j * cols + i;
      let ci;
      if (CMP[q]) ci = CMP[q] - 1;
      else {
        const v = Wt[q] + Err[q];
        const out = v + 0.22 * (hash01(i, j, 7119) - 0.5) >= 0.5 ? 1 : 0;
        ci = out ? P0[q] : P1[q];
        const e = v - out, dir = ltr ? 1 : -1;
        const fwd = i + dir >= 0 && i + dir < cols ? q + dir : -1;
        const dn = j + 1 < rows ? q + cols : -1;
        const dnB = dn >= 0 && i - dir >= 0 && i - dir < cols ? dn - dir : -1;
        const dnF = dn >= 0 && i + dir >= 0 && i + dir < cols ? dn + dir : -1;
        give(q, fwd, e * 7 / 16); give(q, dnB, e * 3 / 16); give(q, dn, e * 5 / 16); give(q, dnF, e * 1 / 16);
      }
      col[q] = ci;
      counts[ci]++;
    }
  }

  // ---- dabs: the dots nearest the macro spot, split right (brush 0, orange) / left (brush 1, blue)
  const dabsIn = o.dabs ?? { at: [1.36, 0.305], times: [0.35, 0.65, 0.95, 1.25, 1.55, 1.85, 2.15, 2.45], hop: S.brush.hop, contact: 0.05 };
  const [dX, dY] = toMetres(dabsIn.at[0], dabsIn.at[1]);
  const N = dabsIn.times.length;
  const near = [];
  for (let q = 0; q < n; q++) {
    const ex = x[q] - dX, ey = y[q] - dY;
    near.push([ex * ex + ey * ey, q]);
  }
  near.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const chosen = near.slice(0, N).map((p) => p[1]).sort((a, b) => x[b] - x[a] || a - b); // right to left
  const right = chosen.slice(0, N / 2).sort((a, b) => y[b] - y[a] || a - b);             // top to bottom
  const left = chosen.slice(N / 2).sort((a, b) => y[b] - y[a] || a - b);
  const dabCol = [PI_.orange, PI_.ultramarine];
  const dabs = dabsIn.times.map((tt, q) => {
    const b = q % 2, i = (b === 0 ? right : left)[q >> 1];
    counts[col[i]]--; col[i] = dabCol[b]; counts[col[i]]++;
    return { k: q, b, t: tt, x: x[i], y: y[i], col: dabCol[b], i };
  });
  const isDab = new Uint8Array(n);
  for (const d of dabs) isDab[d.i] = 1;

  // ---- region floods: ragged fronts from each region's origin
  const RT = o.regions ?? {};
  const regionTimes = REGIONS.map((id) => ({ id, ...(RT[id] ?? { t0: 3, t1: 6, origin: [A / 2, 0.5] }), n: 0, done: 0, maxD: 0 }));
  for (const R of regionTimes) R.o = toMetres(R.origin[0], R.origin[1]);
  const dist = new Float64Array(n);
  for (let q = 0; q < n; q++) {
    const R = regionTimes[reg[q]];
    const ex = x[q] - R.o[0], ey = y[q] - R.o[1];
    dist[q] = Math.sqrt(ex * ex + ey * ey);
    if (!isDab[q]) { R.maxD = Math.max(R.maxD, dist[q]); R.n++; }
  }
  for (let q = 0; q < n; q++) {
    if (isDab[q]) { t[q] = dabs.find((d) => d.i === q).t - 0.6 * dabsIn.contact; continue; }
    const R = regionTimes[reg[q]];
    if (R.front) {
      const F = R.front;
      let tf = F[F.length - 1][1];
      for (let k = 1; k < F.length; k++) {
        if (dist[q] <= F[k][0]) { tf = F[k - 1][1] + ((F[k][1] - F[k - 1][1]) * (dist[q] - F[k - 1][0])) / (F[k][0] - F[k - 1][0]); break; }
      }
      t[q] = tf + (R.jitS ?? 0.25) * jitT[q];
      continue;
    }
    const jit = R.jit ?? 0.22, span = R.t1 - R.t0;
    const u = R.maxD > 0 ? dist[q] / R.maxD : 0;
    const g = R.gamma ?? 1;
    const ug = g === 1 ? u : g === 0.5 ? Math.sqrt(u) : u * u;
    t[q] = R.t0 + span * (1 - jit) * ug + span * jit * jitT[q];
  }
  for (const R of regionTimes) {
    let last = -Infinity;
    for (let q = 0; q < n; q++) if (reg[q] === RG[R.id] && !isDab[q]) last = Math.max(last, t[q]);
    R.done = last + D.pop * 0.6;
  }

  // ---- draw order: later dabs on top (stable: appear time, then index)
  const order = Array.from({ length: n }, (_, q) => q).sort((a, b) => t[a] - t[b] || a - b);

  // ---- brushes (closed form in t)
  const contact = dabsIn.contact, hop = dabsIn.hop;
  const brushes = o.brushes ?? [
    { axis: [0.42, 0.55, 0.72], enter: [-0.25, 0.16], exit: [0.75, 0.32] },
    { axis: [-0.48, 0.5, 0.72], enter: [-0.45, 0.17], exit: [0.75, 0.32] },
  ];
  const touches = [0, 1].map((b) => dabs.filter((d) => d.b === b));
  const norm = (v) => { const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const axes = brushes.map((B) => norm(B.axis));
  const sm = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
  /** brushPose(b, t) -> { x, y, z (tip above the canvas), press 0..1, axis, visible } */
  function brushPose(b, tt) {
    const T = touches[b], B = brushes[b], ax = axes[b];
    const first = T[0], last = T[T.length - 1];
    const along = (p, d) => ({ x: p.x + ax[0] * d, y: p.y + ax[1] * d, z: ax[2] * d });
    if (tt <= first.t - contact) {
      const u = sm((tt - B.enter[0]) / (first.t - contact - B.enter[0]));
      const d = B.enter[1] * (1 - u) * (1 - u);
      return { ...along(first, d), press: 0, axis: ax, visible: true };
    }
    if (tt >= last.t + contact) {
      const u = clamp((tt - last.t - contact) / B.exit[0]);
      const d = B.exit[1] * u * u;
      return { ...along(last, d), press: 0, axis: ax, visible: u < 1 };
    }
    for (let q = 0; q < T.length; q++) {
      const d = T[q];
      if (Math.abs(tt - d.t) <= contact) {
        const v = (tt - d.t) / contact, pr = (1 - v * v) * (1 - v * v);
        return { x: d.x, y: d.y, z: 0, press: pr, axis: ax, visible: true };
      }
      const nx = T[q + 1];
      if (nx && tt > d.t + contact && tt < nx.t - contact) {
        const u = (tt - d.t - contact) / (nx.t - d.t - 2 * contact);
        const s = sm(u), e = 2 * u - 1;
        return { x: d.x + (nx.x - d.x) * s, y: d.y + (nx.y - d.y) * s, z: hop * (1 - e * e * e * e), press: 0, axis: ax, visible: true };
      }
    }
    return { x: last.x, y: last.y, z: 0, press: 0, axis: ax, visible: true };
  }

  // ---- sound events
  function events() {
    const SND = S.sound, ev = [];
    for (const d of dabs) ev.push({ t: d.t, kind: "dab", b: d.b, col: PAINT_IDS[d.col] });
    const bin = SND.patter.bin;
    const bins = new Map();
    for (let q = 0; q < n; q++) {
      if (isDab[q]) continue;
      const kq = Math.floor(t[q] / bin);
      const e = bins.get(kq) ?? { n: 0, regs: new Array(REGIONS.length).fill(0) };
      e.n++; e.regs[reg[q]]++;
      bins.set(kq, e);
    }
    for (const [kq, e] of [...bins.entries()].sort((a, b) => a[0] - b[0])) {
      let rm = 0;
      for (let g = 1; g < e.regs.length; g++) if (e.regs[g] > e.regs[rm]) rm = g;
      ev.push({ t: (kq + 0.5) * bin, kind: "patter", n: e.n, region: REGIONS[rm] });
    }
    const done = regionTimes.map((R) => ({ id: R.id, t: R.done })).sort((a, b) => a.t - b.t);
    done.forEach((R, q) => ev.push({ t: R.t, kind: "region", region: R.id, step: q }));
    return ev.sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : 1));
  }

  // ---- fingerprint (Node and the page must agree: sound is built in Node, the picture in Chrome)
  let h = 2166136261 >>> 0;
  for (let q = 0; q < n; q++) {
    h = fnv(h, Math.round(t[q] * 1e5));
    h = fnv(h, col[q] * 16 + reg[q]);
    h = fnv(h, Math.round(x[q] * 1e5));
  }
  const hash = (h >>> 0).toString(16).padStart(8, "0");

  function stats() {
    const per = Object.fromEntries(PAINT_IDS.map((id, i) => [id, counts[i]]));
    const regs = Object.fromEntries(regionTimes.map((R) => [R.id, { n: R.n, t0: R.t0, done: +R.done.toFixed(3) }]));
    return { n, colours: per, regions: regs };
  }

  return {
    n, x, y, r, rot, asp, seed, hgt, col, reg, t, order, W, H, cell: [sx, sy],
    dabs, regionTimes, brushPose, events, hash, stats, toMetres, toCanvas, paint: PAINT,
    inCrown: (X, Y) => crownField(X, Y) > 0.05,
  };
}
