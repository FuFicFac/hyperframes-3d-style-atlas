// styles/mosaic/tessera.js — the tesserae planner for "Mosaic". PURE: no THREE, no window, no DOM (Node-safe), so
// scene.config.js imports it for SCORE + framing and style.js reads the very same plan for the picture.
//
// Opus vermiculatum, in code:
//   1. A picture is a priority list of regions, each an inside(x, y) test in panel metres (origin = panel centre, y up).
//      The panel is rasterised once on a fine grid (cell ~ pitch / 8) into region labels.
//   2. One exact Euclidean distance transform (Felzenszwalb) from every label boundary gives d(x, y) = distance to the
//      nearest outline, for every region at once.
//   3. Rows = iso-contours of d inside each region at levels (j + 0.5) * pitch, traced by marching squares and chained
//      into loops. Row 0 hugs the outline, row 1 hugs row 0, ... — the andamento follows the contour, not a grid.
//   4. Each loop is resampled at ~pitch spacing: one tile per sample, long axis along the row tangent. Tiles closer
//      than minGap to an earlier tile are dropped (medial cusps); leftover holes get a smaller filler tile.
//   5. Set times per phase: "rows" = row j starts later than row j-1 and each loop is laid progressively from the point
//      nearest the phase anchor; "radial" = time grows with distance from given regions (a halo spreading outward).
// Everything is seeded; the plan is built once. Tile i at time t is a closed form of (t - t_i): hidden, dropping in,
// pressed, then perfectly still. Sound comes from the same tile list: one click per 1/binHz bin, scaled by how many
// tiles land in it; sinopia scratches, glints and the grout sweep come from the same phase/sweep data.
import { clamp, lerp, smoothstep, rng, hash01 } from "../../kit/time.js";

const PI = Math.PI;
const BIG = 1e20;

// ------------------------------------------------------------------ picture helpers (inside tests)
export const inCircle = (cx, cy, r) => (x, y) => (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r;
/** even-odd point in polygon, pts = [[x, y], ...] */
export function inPoly(pts) {
  return (x, y) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
}

// ------------------------------------------------------------------ exact EDT (Felzenszwalb & Huttenlocher)
function dt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -BIG; z[1] = BIG;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = BIG;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
/** edt(seed Uint8Array W*H, W, H) -> Float32Array distance (in cells) to the nearest seed cell centre */
export function edt(seed, W, H) {
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const g = new Float64Array(W * H);
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < H; j++) f[j] = seed[j * W + i] ? 0 : BIG;
    dt1(f, H, d, v, z);
    for (let j = 0; j < H; j++) g[j * W + i] = d[j];
  }
  const out = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) f[i] = g[j * W + i];
    dt1(f, W, d, v, z);
    for (let i = 0; i < W; i++) out[j * W + i] = Math.sqrt(d[i]);
  }
  return out;
}

// ------------------------------------------------------------------ marching squares + chaining
/**
 * contours(field, W, H, level, [i0, j0, i1, j1]) -> [{ pts: [[gx, gy], ...], closed }] in grid coords (node = cell centre).
 * Saddles resolved by the cell-centre average. Each edge point is shared by exactly two segments, so loops chain cleanly.
 */
export function contours(F, W, H, L, box = [0, 0, W - 1, H - 1]) {
  const [i0, j0, i1, j1] = [Math.max(0, box[0]), Math.max(0, box[1]), Math.min(W - 2, box[2]), Math.min(H - 2, box[3])];
  const segA = [], segB = [], pt = new Map(), adj = new Map();
  const hId = (i, j) => (j * W + i) * 2, vId = (i, j) => (j * W + i) * 2 + 1;
  const point = (id) => {
    if (pt.has(id)) return;
    const c = id >> 1, i = c % W, j = (c - i) / W;
    const a = F[c], b = id & 1 ? F[c + W] : F[c + 1];
    const u = clamp((L - a) / (b - a || 1e-9));
    pt.set(id, id & 1 ? [i, j + u] : [i + u, j]);
  };
  const seg = (a, b) => {
    point(a); point(b);
    const s = segA.length; segA.push(a); segB.push(b);
    if (!adj.has(a)) adj.set(a, []); adj.get(a).push(s);
    if (!adj.has(b)) adj.set(b, []); adj.get(b).push(s);
  };
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const c = j * W + i;
    const f0 = F[c], f1 = F[c + 1], f2 = F[c + W + 1], f3 = F[c + W];
    const k = (f0 > L ? 1 : 0) | (f1 > L ? 2 : 0) | (f2 > L ? 4 : 0) | (f3 > L ? 8 : 0);
    if (k === 0 || k === 15) continue;
    const e0 = hId(i, j), e1 = vId(i + 1, j), e2 = hId(i, j + 1), e3 = vId(i, j);
    const hi = (f0 + f1 + f2 + f3) / 4 > L;
    switch (k) {
      case 1: case 14: seg(e3, e0); break;
      case 2: case 13: seg(e0, e1); break;
      case 3: case 12: seg(e3, e1); break;
      case 4: case 11: seg(e1, e2); break;
      case 6: case 9: seg(e0, e2); break;
      case 7: case 8: seg(e2, e3); break;
      case 5: if (hi) { seg(e0, e1); seg(e2, e3); } else { seg(e3, e0); seg(e1, e2); } break;
      case 10: if (hi) { seg(e3, e0); seg(e1, e2); } else { seg(e0, e1); seg(e2, e3); } break;
    }
  }
  const used = new Uint8Array(segA.length), out = [];
  const other = (s, e) => (segA[s] === e ? segB[s] : segA[s]);
  const next = (e, s) => { const l = adj.get(e); for (const q of l) if (q !== s && !used[q]) return q; return -1; };
  for (let s0 = 0; s0 < segA.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const fwd = [segA[s0], segB[s0]];
    let s = s0, e = segB[s0];
    for (;;) { const q = next(e, s); if (q < 0) break; used[q] = 1; e = other(q, e); s = q; fwd.push(e); }
    const closed = fwd[fwd.length - 1] === fwd[0];
    let ids = fwd;
    if (!closed) { // extend backwards from the start
      const back = []; s = s0; e = segA[s0];
      for (;;) { const q = next(e, s); if (q < 0) break; used[q] = 1; e = other(q, e); s = q; back.push(e); }
      ids = back.reverse().concat(fwd);
    } else ids = fwd.slice(0, -1);
    out.push({ pts: ids.map((id) => pt.get(id)), closed });
  }
  return out;
}

// ------------------------------------------------------------------ polyline helpers
const signedArea = (p) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]); return a / 2; };
function cumLen(p, closed) {
  const c = new Float64Array(p.length + 1);
  for (let i = 1; i <= p.length; i++) {
    const a = p[i - 1], b = p[i % p.length];
    c[i] = c[i - 1] + (i < p.length || closed ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0);
  }
  return c;
}
function at(p, c, s, closed) {
  const L = c[c.length - 1];
  if (closed) s = ((s % L) + L) % L; else s = clamp(s, 0, c[p.length - 1]);
  let lo = 0, hi = p.length;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
  const a = p[lo], b = p[(lo + 1) % p.length], seg = c[lo + 1] - c[lo] || 1e-9, u = (s - c[lo]) / seg;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

// ------------------------------------------------------------------ the planner
/**
 * planMosaic(picture, opts) -> plan
 *   picture: { width, height, regions: [{ id, inside(x,y), kind | kind(ctx), color(ctx) -> hex, phase, outline?: { phase, color(ctx), kind } }],
 *              sinopia: [region ids whose outlines are drawn], guides?: [[[x,y],...], ...] extra sinopia lines }
 *   opts: { pitch, cell, gap, seed, minGap, fill, phases: { name: { t0, t1, mode: "rows"|"radial", rowDur, anchor:[x,y], from:[ids], gamma, spread } },
 *           setDur, sinopia: { t0, t1 }, sweep: { t0, t1, x0, x1 }, grout: { t0, t1 }, binHz }
 *   ctx passed to color/kind: { x, y, row, k, n, d, r (seeded 0..1), region }
 */
export function planMosaic(pic, o) {
  const p = o.pitch, cell = o.cell ?? p / 8, R = rng(o.seed ?? 67);
  const PW = pic.width, PH = pic.height, x0 = -PW / 2, y0 = -PH / 2;
  const W = Math.ceil(PW / cell), H = Math.ceil(PH / cell);
  const gx = (i) => x0 + (i + 0.5) * cell, gy = (j) => y0 + (j + 0.5) * cell;
  const regions = pic.regions.map((r, idx) => ({ ...r, idx }));
  const byId = Object.fromEntries(regions.map((r) => [r.id, r]));

  // 1. labels
  const lab = new Int16Array(W * H).fill(-1);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = gx(i), y = gy(j);
    for (const r of regions) if (r.inside(x, y)) { lab[j * W + i] = r.idx; break; }
  }
  // 2. distance to the nearest outline (metres)
  const seed = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = j * W + i, l = lab[c];
    if (i === 0 || j === 0 || i === W - 1 || j === H - 1 || lab[c - 1] !== l || lab[c + 1] !== l || lab[c - W] !== l || lab[c + W] !== l) seed[c] = 1;
  }
  const dc = edt(seed, W, H), dist = new Float32Array(W * H);
  for (let c = 0; c < W * H; c++) dist[c] = dc[c] * cell + 0.5 * cell;
  const box = regions.map(() => [W, H, -1, -1]), maxD = regions.map(() => 0);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = j * W + i, l = lab[c]; if (l < 0) continue;
    const b = box[l]; if (i < b[0]) b[0] = i; if (j < b[1]) b[1] = j; if (i > b[2]) b[2] = i; if (j > b[3]) b[3] = j;
    if (dist[c] > maxD[l]) maxD[l] = dist[c];
  }
  const sampleD = (x, y) => {
    const i = clamp(Math.round((x - x0) / cell - 0.5), 0, W - 1), j = clamp(Math.round((y - y0) / cell - 0.5), 0, H - 1);
    return dist[j * W + i];
  };
  const labelAt = (x, y) => {
    const i = clamp(Math.round((x - x0) / cell - 0.5), 0, W - 1), j = clamp(Math.round((y - y0) / cell - 0.5), 0, H - 1);
    return lab[j * W + i];
  };

  // 3+4. rows -> candidate tiles
  const F = new Float32Array(W * H);
  const cand = [];   // { x, y, ang, along, region, row, loop, frac }
  const loops = [];  // { region, row, len, phase }
  for (const r of regions) {
    if (box[r.idx][2] < 0) continue;
    for (let c = 0; c < W * H; c++) F[c] = lab[c] === r.idx ? dist[c] : -1;
    const b = box[r.idx], pad = [b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1];
    for (let row = 0; (row + 0.5) * p < maxD[r.idx]; row++) {
      const level = (row + 0.5) * p;
      for (const cl of contours(F, W, H, level, pad)) {
        let pts = cl.pts.map(([a, bb]) => [x0 + (a + 0.5) * cell, y0 + (bb + 0.5) * cell]);
        if (cl.closed && signedArea(pts) < 0) pts = pts.reverse();
        const C = cumLen(pts, cl.closed), len = C[cl.closed ? pts.length : pts.length - 1];
        const phase = row === 0 && r.outline ? r.outline.phase : r.phase;
        const anchor = o.phases[phase]?.anchor ?? [0, 0];
        const li = loops.length;
        loops.push({ region: r.id, row, len, phase });
        if (len < 0.55 * p) continue;
        if (len < 1.6 * p) { // tiny loop: one tile at its centroid
          let cx = 0, cy = 0; for (const q of pts) { cx += q[0]; cy += q[1]; }
          const a0 = at(pts, C, 0, cl.closed), a1 = at(pts, C, len / 2, cl.closed);
          cand.push({ x: cx / pts.length, y: cy / pts.length, ang: Math.atan2(a1[1] - a0[1], a1[0] - a0[0]), along: p * 0.8, region: r.idx, row, loop: li, frac: 0 });
          continue;
        }
        // start at the point nearest the phase anchor
        let s0 = 0, best = Infinity;
        for (let i = 0; i < pts.length; i++) { const dd = Math.hypot(pts[i][0] - anchor[0], pts[i][1] - anchor[1]); if (dd < best) { best = dd; s0 = C[i]; } }
        if (!cl.closed) s0 = 0;
        const n = Math.max(1, Math.round(len / p)), step = len / n;
        const cnt = cl.closed ? n : n + 1;
        for (let k = 0; k < cnt; k++) {
          const s = s0 + (k + (cl.closed ? 0.5 : 0)) * step;
          const q = at(pts, C, s, cl.closed), q0 = at(pts, C, s - p * 0.5, cl.closed), q1 = at(pts, C, s + p * 0.5, cl.closed);
          cand.push({ x: q[0], y: q[1], ang: Math.atan2(q1[1] - q0[1], q1[0] - q0[0]), along: Math.min(step, 1.12 * p), region: r.idx, row, loop: li, frac: (k + 0.5) / cnt, k, n: cnt });
        }
      }
    }
  }

  // acceptance with a spatial hash (rows in order: earlier rows win at cusps)
  const minGap = (o.minGap ?? 0.72) * p, HS = p, hash = new Map();
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  const near = (x, y, rr) => {
    const i = Math.floor(x / HS), j = Math.floor(y / HS); let m = Infinity, who = -1;
    for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) {
      const l = hash.get(key(i + a, j + b2)); if (!l) continue;
      for (const t of l) { const dd = Math.hypot(T.x[t] - x, T.y[t] - y); if (dd < m) { m = dd; who = t; } }
    }
    return m < rr ? who : (rr === Infinity ? who : -1);
  };
  const T = { x: [], y: [], ang: [], along: [], region: [], row: [], loop: [], frac: [], k: [], n: [], filler: [] };
  const add = (c, filler = 0) => {
    const id = T.x.length;
    T.x.push(c.x); T.y.push(c.y); T.ang.push(c.ang); T.along.push(c.along); T.region.push(c.region); T.row.push(c.row);
    T.loop.push(c.loop); T.frac.push(c.frac); T.k.push(c.k ?? 0); T.n.push(c.n ?? 1); T.filler.push(filler);
    const kk = key(Math.floor(c.x / HS), Math.floor(c.y / HS));
    if (!hash.has(kk)) hash.set(kk, []); hash.get(kk).push(id);
    return id;
  };
  cand.sort((a, b) => a.row - b.row || a.region - b.region);
  for (const c of cand) {
    // keep a tile clear of the outline of its own region, and of earlier tiles
    if (near(c.x, c.y, minGap) >= 0) continue;
    add(c);
  }
  const nRow = T.x.length;
  // 4b. filler tiles in holes (medial gaps, region centres)
  const fillStep = p * 0.34;
  for (const r of regions) {
    const b = box[r.idx]; if (b[2] < 0) continue;
    for (let y = gy(b[1]); y <= gy(b[3]); y += fillStep) for (let x = gx(b[0]); x <= gx(b[2]); x += fillStep) {
      const jx = x + (hash01(Math.round(x * 1000), Math.round(y * 1000), 3) - 0.5) * fillStep * 0.5;
      const jy = y + (hash01(Math.round(x * 1000), Math.round(y * 1000), 4) - 0.5) * fillStep * 0.5;
      if (labelAt(jx, jy) !== r.idx) continue;
      const d = sampleD(jx, jy);
      if (d < 0.42 * p) continue;
      const w = near(jx, jy, Infinity);
      if (w >= 0 && Math.hypot(T.x[w] - jx, T.y[w] - jy) < (o.fill ?? 0.86) * p) continue;
      const dx = sampleD(jx + cell * 2, jy) - sampleD(jx - cell * 2, jy), dy = sampleD(jx, jy + cell * 2) - sampleD(jx, jy - cell * 2);
      const ang = Math.atan2(dx, -dy);
      add({ x: jx, y: jy, ang, along: p * 0.78, region: r.idx, row: Math.max(0, Math.floor(d / p - 0.5)), loop: w >= 0 ? T.loop[w] : -1, frac: w >= 0 ? T.frac[w] : 0 }, 1);
    }
  }
  const N = T.x.length;

  // 5. look: colour, kind, size, tilt, variant
  const kindOf = { stone: 0, glass: 1, gold: 2 };
  const color = new Array(N), kind = new Uint8Array(N), variant = new Uint8Array(N);
  const tw = new Float32Array(N), th = new Float32Array(N), tiltX = new Float32Array(N), tiltZ = new Float32Array(N), yaw = new Float32Array(N), sink = new Float32Array(N);
  const rl = R.fork(11), gapF = o.gap ?? 0.14;
  const isOutline = new Uint8Array(N);
  const nearIds = (x, y, ids, rad) => {
    const set = ids.map((id) => byId[id]?.idx);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * 2 * PI; if (set.includes(labelAt(x + Math.cos(a) * rad, y + Math.sin(a) * rad))) return true; }
    return false;
  };
  for (let i = 0; i < N; i++) {
    const r = regions[T.region[i]];
    const ctx = { x: T.x[i], y: T.y[i], row: T.row[i], k: T.k[i], n: T.n[i], d: sampleD(T.x[i], T.y[i]), r: rl.next(), region: r.id, filler: T.filler[i],
      near: (ids, rad = p) => nearIds(T.x[i], T.y[i], ids, rad) };
    const useOutline = T.row[i] === 0 && r.outline && !T.filler[i] && (r.outline.test ? r.outline.test(ctx) : true);
    isOutline[i] = useOutline ? 1 : 0;
    const src = useOutline ? r.outline : r;
    color[i] = src.color(ctx);
    const kd = typeof (src.kind ?? r.kind) === "function" ? (src.kind ?? r.kind)(ctx) : (src.kind ?? r.kind);
    kind[i] = kindOf[kd] ?? 0;
    variant[i] = rl.int(0, 2);
    const filler = T.filler[i];
    tw[i] = clamp(T.along[i], 0.62 * p, 1.12 * p) * (1 - gapF) * rl.range(0.9, 1.04) * (filler ? 0.92 : 1);
    th[i] = p * (1 - gapF) * rl.range(0.88, 1.02) * (filler ? 0.9 : 1);
    const tilt = kind[i] === 2 ? (o.tiltGold ?? 0.12) : (o.tiltStone ?? 0.035);
    tiltX[i] = rl.range(-tilt, tilt); tiltZ[i] = rl.range(-tilt, tilt);
    yaw[i] = T.ang[i] + rl.range(-0.07, 0.07);
    sink[i] = rl.range(0, 1);
  }

  // 6. set times
  const tSet = new Float32Array(N);
  const phaseOf = (i) => { const r = regions[T.region[i]]; return isOutline[i] ? r.outline.phase : r.phase; };
  const radialField = {};
  for (const [name, ph] of Object.entries(o.phases)) {
    if (ph.mode !== "radial") continue;
    const from = new Set((ph.from ?? []).map((id) => byId[id]?.idx));
    const sd = new Uint8Array(W * H);
    for (let c = 0; c < W * H; c++) if (from.has(lab[c])) sd[c] = 1;
    radialField[name] = edt(sd, W, H);
  }
  const maxRow = {}, maxRad = {};
  for (let i = 0; i < N; i++) {
    const ph = phaseOf(i);
    maxRow[ph] = Math.max(maxRow[ph] ?? 0, T.row[i]);
    if (radialField[ph]) {
      const ii = clamp(Math.round((T.x[i] - x0) / cell - 0.5), 0, W - 1), jj = clamp(Math.round((T.y[i] - y0) / cell - 0.5), 0, H - 1);
      maxRad[ph] = Math.max(maxRad[ph] ?? 0, radialField[ph][jj * W + ii]);
    }
  }
  const rt = R.fork(23);
  for (let i = 0; i < N; i++) {
    const name = phaseOf(i), ph = o.phases[name], span = ph.t1 - ph.t0;
    let t;
    if (ph.mode === "radial") {
      const ii = clamp(Math.round((T.x[i] - x0) / cell - 0.5), 0, W - 1), jj = clamp(Math.round((T.y[i] - y0) / cell - 0.5), 0, H - 1);
      const u = Math.pow(radialField[name][jj * W + ii] / (maxRad[name] || 1), ph.gamma ?? 1);
      const along = ph.along ?? 0.4, jit = ph.spread ?? 0.25;
      t = ph.t0 + u * (span - along - jit) + T.frac[i] * along + rt.range(0, jit);
    } else {
      const J = maxRow[name] ?? 0, rowDur = Math.min(span, ph.rowDur ?? span * 0.5);
      const start = ph.t0 + (J > 0 ? (T.row[i] / J) * (span - rowDur) : 0);
      t = start + T.frac[i] * rowDur + rt.range(0, ph.spread ?? 0.04);
    }
    if (T.filler[i]) t += 0.06;
    tSet[i] = clamp(t, ph.t0, ph.t1);
  }

  // order of setting (for counts / sound)
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => tSet[a] - tSet[b]);

  // 7. sinopia: outlines of the chosen regions (contour just inside each), + guide lines; reveal order by cumulative length
  const sinopia = [];
  {
    const ids = new Set((pic.sinopia ?? []).map((id) => byId[id]?.idx));
    for (const r of regions) {
      if (!ids.has(r.idx) || box[r.idx][2] < 0) continue;
      for (let c = 0; c < W * H; c++) F[c] = lab[c] === r.idx ? dist[c] : -1;
      const b = box[r.idx];
      for (const cl of contours(F, W, H, cell * 1.2, [b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1])) {
        if (cl.pts.length < 6) continue;
        const pts = cl.pts.filter((_, k) => k % 3 === 0).map(([a, bb]) => [x0 + (a + 0.5) * cell, y0 + (bb + 0.5) * cell]);
        if (cl.closed) pts.push(pts[0]);
        sinopia.push({ pts, region: r.id });
      }
    }
    for (const g of pic.guides ?? []) sinopia.push({ pts: g, region: "guide" });
    let total = 0;
    for (const s of sinopia) { s.len = cumLen(s.pts, false)[s.pts.length - 1]; total += s.len; }
    let acc = 0;
    for (const s of sinopia) { s.a = acc / total; acc += s.len; s.b = acc / total; }
  }

  // ---------------------------------------------------------------- time functions
  const setDur = o.setDur ?? 0.24;
  /** state of tile i at t: -1 hidden, 0..1 dropping/pressing, 1 = set (still) */
  const stateAt = (i, t) => { const u = (t - (tSet[i] - setDur)) / setDur; return u < 0 ? -1 : u >= 1 ? 1 : u; };
  const countSet = (t) => { let lo = 0, hi = N; while (lo < hi) { const m = (lo + hi) >> 1; if (tSet[order[m]] <= t) lo = m + 1; else hi = m; } return lo; };
  const SN = o.sinopia ?? { t0: 0, t1: 1.5 };
  const sinopiaReveal = (t) => clamp((t - SN.t0) / (SN.t1 - SN.t0));
  const SW = o.sweep ?? null;
  /** light sweep: { u 0..1 across, level 0..1 } */
  const sweepAt = (t) => {
    if (!SW) return { u: 0, level: 0, x: 0 };
    const u = clamp((t - SW.t0) / (SW.t1 - SW.t0));
    const level = smoothstep(SW.t0 - 0.3, SW.t0 + 0.5, t) * (1 - smoothstep(SW.t1 - 0.5, SW.t1 + 0.3, t));
    return { u, level, x: lerp(SW.x0, SW.x1, u) };
  };
  const GR = o.grout ?? null;
  const groutAt = (t) => (GR ? clamp((t - GR.t0) / (GR.t1 - GR.t0)) : 0);

  /** sound events: set-clicks per bin (count-weighted), sinopia scratches, glints over the sweep, grout */
  function events() {
    const ev = [], binHz = o.binHz ?? 24, bins = new Map();
    for (let i = 0; i < N; i++) {
      const b = Math.floor(tSet[i] * binHz);
      if (!bins.has(b)) bins.set(b, { n: 0, gold: 0, glass: 0, first: Infinity });
      const e = bins.get(b); e.n++; if (kind[i] === 2) e.gold++; if (kind[i] === 1) e.glass++; e.first = Math.min(e.first, tSet[i]);
    }
    for (const [b, e] of [...bins.entries()].sort((a, c) => a[0] - c[0])) ev.push({ kind: "set", t: +e.first.toFixed(4), n: e.n, gold: e.gold / e.n, glass: e.glass / e.n, bin: b });
    // sinopia: one scratch per long line, timed by its reveal window
    for (const s of sinopia) if (s.len > 1.2) ev.push({ kind: "sketch", t: +(SN.t0 + s.a * (SN.t1 - SN.t0)).toFixed(4), dur: Math.max(0.25, (s.b - s.a) * (SN.t1 - SN.t0)) });
    if (SW) {
      const K = 6;
      for (let k = 0; k < K; k++) ev.push({ kind: "glint", t: +(SW.t0 + 0.35 + (k / (K - 1)) * (SW.t1 - SW.t0 - 0.9)).toFixed(4), k, K });
    }
    if (GR) ev.push({ kind: "grout", t: GR.t0, dur: GR.t1 - GR.t0 });
    return ev.sort((a, b) => a.t - b.t);
  }

  const kinds = ["stone", "glass", "gold"];
  const countKind = [0, 0, 0]; for (let i = 0; i < N; i++) countKind[kind[i]]++;
  return {
    n: N, rowTiles: nRow, pitch: p, width: PW, height: PH, setDur,
    x: Float32Array.from(T.x), y: Float32Array.from(T.y), yaw, w: tw, h: th, tiltX, tiltZ, sink, kind, variant, color,
    region: Int16Array.from(T.region), row: Int16Array.from(T.row), filler: Uint8Array.from(T.filler), tSet, order,
    regions: regions.map((r) => r.id), loops, sinopia, kinds,
    stats: { tiles: N, rowTiles: nRow, fillers: N - nRow, byKind: Object.fromEntries(kinds.map((k, i) => [k, countKind[i]])), grid: [W, H] },
    stateAt, countSet, sinopiaReveal, sweepAt, groutAt, events, labelAt, distAt: sampleD,
  };
}

// ------------------------------------------------------------------ the demo picture: a leaping fish over waves
/**
 * fishAndWaves({ width, height, pitch, border = 3 rows, palette }) -> picture for planMosaic.
 * A big fish leaping right over two bands of waves, on a gold ground, inside a three-row border (red, dentil, cream).
 */
export function fishAndWaves(o) {
  const { width: PW, height: PH, pitch: p } = o;
  const C = o.palette;
  const bw = (o.border ?? 3) * p;
  const hx = PW / 2 - bw, hy = PH / 2 - bw;
  const pick = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

  // fish frame: local (u, v) -> panel (x, y): rotate by th, scale, translate
  const F = { cx: o.fish?.cx ?? 0.3, cy: o.fish?.cy ?? 0.22, s: o.fish?.s ?? 1.12, th: o.fish?.th ?? 0.13 };
  const ct = Math.cos(F.th), st = Math.sin(F.th);
  const toLocal = (x, y) => { const dx = (x - F.cx) / F.s, dy = (y - F.cy) / F.s; return [dx * ct + dy * st, -dx * st + dy * ct]; };
  const local = (test) => (x, y) => { const [u, v] = toLocal(x, y); return test(u, v); };
  const U0 = -2.0, U1 = 2.05;
  const sOf = (u) => (u - U0) / (U1 - U0);
  const half = (u) => { const s = sOf(u); if (s < 0 || s > 1) return -1; return 0.17 * (1 - s) + 0.92 * Math.pow(Math.sin(PI * Math.pow(s, 1.35)), 0.68); };
  const mid = (u) => 0.1 * Math.sin(PI * clamp(sOf(u)));
  const inBody = (u, v) => { const b = half(u); return b > 0 && Math.abs(v - mid(u)) < b; };
  const stripeC = (u) => mid(u) - 0.16 * Math.max(0, half(u));
  const gillU = (v, u) => 1.02 - 0.3 * Math.pow((v - mid(u)) / 0.9, 2);
  const eye = [1.42, 0.3];

  const wave1 = (x) => -PH / 2 + bw + 0.95 + 0.17 * Math.sin(1.55 * x + 0.5) + 0.05 * Math.sin(3.4 * x + 1.3);
  const wave2 = (x) => wave1(x) - 0.48 + 0.07 * Math.sin(2.2 * x + 2.1);

  const inner = (x, y) => Math.abs(x) < hx && Math.abs(y) < hy;
  const edgeDist = (x, y) => Math.min(PW / 2 - Math.abs(x), PH / 2 - Math.abs(y));

  // the dark outline row only where the fish meets the ground or the sea (internal boundaries keep their own colour)
  const outside = ["gold", "seaLight", "seaDeep", "border"];
  const outlineDark = { phase: "outline", kind: "stone", color: (c) => pick(C.outline, c.r), test: (c) => c.near(outside, p * 1.05) };
  const regions = [
    { id: "border", inside: (x, y) => !inner(x, y), phase: "border", kind: "stone",
      color: (c) => { const e = edgeDist(c.x, c.y); if (e < p * 1.05) return pick(C.borderRed, c.r); if (e < p * 2.05) return c.k % 2 ? pick(C.outline, c.r) : pick(C.cream, c.r); return pick(C.ochre, c.r); } },
    { id: "pupil", inside: local((u, v) => (u - eye[0]) ** 2 + (v - eye[1]) ** 2 < 0.12 ** 2), phase: "fill", kind: "glass", color: (c) => pick(C.pupil, c.r) },
    { id: "eye", inside: local((u, v) => (u - eye[0]) ** 2 + (v - eye[1]) ** 2 < 0.25 ** 2), phase: "fill", kind: "stone", color: (c) => pick(C.cream, c.r) },
    { id: "gill", inside: local((u, v) => inBody(u, v) && Math.abs(u - gillU(v, u)) < 0.075), phase: "outline", kind: "stone", color: (c) => pick(C.gill, c.r) },
    { id: "pectoral", inside: local(inPoly([[0.75, -0.12], [0.02, -0.62], [0.3, -0.78], [0.92, -0.36]])), phase: "fill", kind: "glass",
      outline: { ...outlineDark, test: () => true }, color: (c) => (c.row % 2 ? pick(C.fin, c.r) : pick(C.fin2, c.r)) },
    { id: "stripe", inside: local((u, v) => inBody(u, v) && Math.abs(v - stripeC(u)) < 0.11 * Math.min(1, half(u) / 0.5)), phase: "fill", kind: "glass", color: (c) => pick(C.stripe, c.r) },
    { id: "back", inside: local((u, v) => inBody(u, v) && v > stripeC(u)), phase: "fill", kind: "glass", outline: outlineDark,
      color: (c) => (c.row % 3 === 2 ? pick(C.back2, c.r) : pick(C.back, c.r)) },
    { id: "belly", inside: local(inBody), phase: "fill", kind: "stone", outline: outlineDark, color: (c) => (c.row % 2 ? pick(C.belly2, c.r) : pick(C.belly, c.r)) },
    { id: "dorsal", inside: local(inPoly([[-1.25, 0.45], [-0.95, 1.38], [-0.15, 1.42], [0.6, 0.7]])), phase: "fill", kind: "glass", outline: outlineDark,
      color: (c) => (c.row % 2 ? pick(C.fin, c.r) : pick(C.fin2, c.r)) },
    { id: "ventral", inside: local(inPoly([[-1.05, -0.3], [-0.95, -1.12], [-0.3, -1.05], [0.12, -0.5]])), phase: "fill", kind: "glass", outline: outlineDark,
      color: (c) => (c.row % 2 ? pick(C.fin, c.r) : pick(C.fin2, c.r)) },
    { id: "tail", inside: local(inPoly([[-1.75, 0.18], [-2.9, 1.12], [-2.45, 0.0], [-2.9, -1.12], [-1.75, -0.18]])), phase: "fill", kind: "glass", outline: outlineDark,
      color: (c) => (c.row % 2 ? pick(C.fin, c.r) : pick(C.fin2, c.r)) },
    { id: "seaLight", inside: (x, y) => y < wave1(x) && y >= wave2(x), phase: "sea", kind: "glass",
      color: (c) => (c.row === 0 && c.y > (wave1(c.x) + wave2(c.x)) / 2 ? pick(C.foam, c.r) : c.row % 2 ? pick(C.sea2, c.r) : pick(C.sea1, c.r)) },
    { id: "seaDeep", inside: (x, y) => y < wave2(x), phase: "sea", kind: "glass",
      color: (c) => (c.row % 3 === 0 ? pick(C.sea2, c.r) : pick(C.deep, c.r)) },
    { id: "gold", inside: () => true, phase: "gold", kind: "gold", color: (c) => (c.r < 0.06 ? pick(C.gold2, c.r * 16) : pick(C.gold, c.r)) },
  ];
  // sinopia guide lines: the border's inner edge (snapped rule lines) + a construction centre line
  const guides = [
    [[-hx, hy], [hx, hy], [hx, -hy], [-hx, -hy], [-hx, hy]],
    [[-hx + 0.15, 0], [hx - 0.15, 0]],
  ];
  return {
    width: PW, height: PH, regions, guides,
    sinopia: ["pupil", "eye", "gill", "pectoral", "back", "belly", "dorsal", "ventral", "tail", "seaLight"],
    fishBox: (() => { // panel-space bounding box of the fish (for framing)
      const pts = [[-2.9, 1.12], [-2.9, -1.12], [U1, 0.6], [U1, -0.6], [-0.95, 1.38], [-0.15, 1.42], [-0.95, -1.12]];
      const P = pts.map(([u, v]) => { const x = (u * ct - v * st) * F.s + F.cx, y = (u * st + v * ct) * F.s + F.cy; return [x, y]; });
      return [[Math.min(...P.map((q) => q[0])), Math.min(...P.map((q) => q[1]))], [Math.max(...P.map((q) => q[0])), Math.max(...P.map((q) => q[1]))]];
    })(),
    wave1, wave2,
  };
}

/** voices for kit scoreFromEvents, from spec.sound */
export function mosaicVoices(SND) {
  return {
    set: (e) => {
      const g = SND.set.gain * Math.min(1, SND.set.base + SND.set.per * Math.sqrt(e.n));
      const r = hash01(e.bin, 7);
      return [{ type: "click", dur: 0.03, gain: g, pitch: lerp(SND.set.stonePitch, SND.set.goldPitch, e.gold) * (0.9 + 0.2 * r) + e.glass * 0.25, pan: (r - 0.5) * 0.5 }];
    },
    sketch: (e) => [{ type: "penScratch", dur: Math.min(1.1, e.dur), speed: 0.8, gain: SND.sketch.gain }],
    glint: (e) => [{ type: "chime", dur: 1.3, sparkle: 1, notes: 3, pitch: SND.glint.pitch * Math.pow(2, (e.k % 3) * 4 / 12) * (e.k >= 3 ? 1.5 : 1), gain: SND.glint.gain, pan: lerp(-0.5, 0.5, e.k / Math.max(1, e.K - 1)) }],
    grout: (e) => [{ type: "rustle", dur: e.dur, density: 0.5, pitch: 0.7, gain: SND.grout.gain }],
  };
}
