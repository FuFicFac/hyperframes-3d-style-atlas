// styles/pin-art/pins.js — the pin planner for "Pin Art". PURE: no THREE, no window, no DOM (Node-safe), so
// scene.config.js can import it for SCORE and framing, and style.js reads the very same plan for the picture.
//
// Model: a grid of pins (cols x rows at `pitch`, centred on the origin, x right, z toward the viewer). Every pin's
// extension h_i(t) (metres above rest) is a closed-form function of t:
//
//   h_i(t) = H0_i + sum_k  dH_k,i * s_k(t - t_k - delay_k,i)      (steps: morphs between static target fields)
//   then   h = max(h, ball(t))  and  h += ripple(t)                 (layers: dynamic, additive)
//
// dH_k = target_k - target_(k-1) is precomputed per step, so overlapping waves compose exactly; s_k is a closed-form
// spring (tiny overshoot, metallic settle, held exactly at 1 after `settle` s) or a gravity drop with one small bounce.
// delay_k,i comes from the pin's position: a directional sweep, a radial wave from a point, or a seeded random order.
//
// Height sources (all plain data -> Float32Array of heights for the grid):
//   flat | text (stroke-font distance field + rounded bevel) | strokes (any polylines) | polygon (filled SDF) |
//   icon (named polygon/stroke shapes) | hand (capsule union) | dome (static sphere cap) | bars (columns from values) |
//   terrain (kit heightField) | bitmap (rows of "#") | max (union of sources)
import { clamp, lerp, spring, hash01, ease } from "../../kit/time.js";
import { layoutStrokeText } from "../../kit/strokefont.js";
import { heightField } from "../../kit/heightfield.js";

// ---------------------------------------------------------------- grid
/** pinGrid({ cols, rows, pitch }) -> { cols, rows, pitch, n, x, z, w, d, index(c, r) } */
export function pinGrid({ cols, rows, pitch }) {
  const n = cols * rows;
  const x = new Float32Array(n), z = new Float32Array(n);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = c + r * cols;
    x[i] = (c - (cols - 1) / 2) * pitch;
    z[i] = (r - (rows - 1) / 2) * pitch;
  }
  return { cols, rows, pitch, n, x, z, w: cols * pitch, d: rows * pitch, index: (c, r) => c + r * cols };
}

// ---------------------------------------------------------------- distance helpers
/** quarter-round shoulder: 0 at the edge, 1 once `depth` >= bevel (rounded, not linear) */
export function bevelProfile(depth, bevel) {
  if (depth <= 0) return 0;
  if (depth >= bevel) return 1;
  const u = 1 - depth / bevel;
  return Math.sqrt(Math.max(0, 1 - u * u));
}
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
  const u = L2 > 0 ? clamp(((px - ax) * vx + (pz - az) * vz) / L2) : 0;
  const dx = px - (ax + u * vx), dz = pz - (az + u * vz);
  return Math.sqrt(dx * dx + dz * dz);
}
function segsOf(polys) {
  const s = [];
  for (const p of polys) for (let k = 1; k < p.length; k++) s.push([p[k - 1][0], p[k - 1][1], p[k][0], p[k][1]]);
  return s;
}
function bboxOf(polys, pad) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of polys) for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
}
function insidePoly(px, pz, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function capsuleSD(px, pz, a, b, r) { return segDist(px, pz, a[0], a[1], b[0], b[1]) - r; }
function smin(a, b, k) { const h = clamp(0.5 + (0.5 * (b - a)) / k); return lerp(b, a, h) - k * h * (1 - h); }

/** strokeField(grid, polys [[x,z]...], { radius, bevel, height }) — rounded ridges along polylines (text, outlines). */
function strokeField(grid, polys, { radius, bevel, height }, out) {
  const segs = segsOf(polys);
  const [x0, z0, x1, z1] = bboxOf(polys, radius + 0.01);
  for (let i = 0; i < grid.n; i++) {
    const px = grid.x[i], pz = grid.z[i];
    if (px < x0 || px > x1 || pz < z0 || pz > z1) continue;
    let d = Infinity;
    for (const s of segs) { const q = segDist(px, pz, s[0], s[1], s[2], s[3]); if (q < d) d = q; }
    const h = height * bevelProfile(radius - d, bevel);
    if (h > out[i]) out[i] = h;
  }
}
/** polygonField: filled polygon (even-odd) with a rounded bevel inside the outline. */
function polygonField(grid, pts, { bevel, height }, out) {
  const closed = [...pts, pts[0]];
  const segs = segsOf([closed]);
  const [x0, z0, x1, z1] = bboxOf([pts], 0.01);
  for (let i = 0; i < grid.n; i++) {
    const px = grid.x[i], pz = grid.z[i];
    if (px < x0 || px > x1 || pz < z0 || pz > z1) continue;
    if (!insidePoly(px, pz, pts)) continue;
    let d = Infinity;
    for (const s of segs) { const q = segDist(px, pz, s[0], s[1], s[2], s[3]); if (q < d) d = q; }
    const h = height * bevelProfile(d, bevel);
    if (h > out[i]) out[i] = h;
  }
}

// ---------------------------------------------------------------- named icons (unit size, centred, z toward viewer)
const TAU = Math.PI * 2;
export const ICONS = {
  heart: () => { const p = []; for (let k = 0; k < 64; k++) { const a = (k / 64) * TAU; const x = 16 * Math.sin(a) ** 3; const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a); p.push([x / 34, -y / 34 - 0.05]); } return { polygon: p }; },
  star: () => { const p = []; for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU - Math.PI / 2; const r = k % 2 ? 0.21 : 0.5; p.push([Math.cos(a) * r, Math.sin(a) * r]); } return { polygon: p }; },
  circle: () => { const p = []; for (let k = 0; k < 48; k++) { const a = (k / 48) * TAU; p.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5]); } return { polygon: p }; },
  ring: () => { const p = []; for (let k = 0; k <= 48; k++) { const a = (k / 48) * TAU; p.push([Math.cos(a) * 0.4, Math.sin(a) * 0.4]); } return { strokes: [p], radius: 0.09 }; },
  check: () => ({ strokes: [[[-0.42, 0.02], [-0.12, 0.3], [0.44, -0.3]]], radius: 0.1 }),
  arrow: () => ({ polygon: [[-0.5, 0.12], [0.08, 0.12], [0.08, 0.32], [0.5, 0], [0.08, -0.32], [0.08, -0.12], [-0.5, -0.12]] }),
  plus: () => ({ strokes: [[[-0.42, 0], [0.42, 0]], [[0, -0.42], [0, 0.42]]], radius: 0.12 }),
};

// ---------------------------------------------------------------- sources -> height arrays
/**
 * heightsFrom(src, grid, defaults) -> { h: Float32Array (m), tint: Int8Array | null (palette index per pin, -1 = none) }
 *   src.kind:
 *   "flat"
 *   "text"    { text, cap, center:[x,z], radius, bevel, height, letterSpacing, wordSpacing }  stroke-font distance field
 *   "strokes" { strokes:[[[x,z]...]], radius, bevel, height }
 *   "polygon" { points:[[x,z]...], bevel, height }
 *   "icon"    { shape: keyof ICONS, center, size, bevel, height, radius? }
 *   "hand"    { center, size, rot, height, bevel, dome }                 palm + five capsule fingers (smooth union)
 *   "dome"    { center, r, top }                                          static sphere-cap impression
 *   "bars"    { values:[0..1], box:[x0,z0,x1,z1], gap, maxH, colors:[palette index] }  columns of pins
 *   "terrain" { field: kit heightField spec, height, base, box?:[x0,z0,x1,z1] }
 *   "bitmap"  { rows:["..##.."], cell, center, height, bevel }           rounded-square cells
 *   "max"     { of:[src...] }
 */
export function heightsFrom(src, grid, D = {}) {
  const h = new Float32Array(grid.n);
  let tint = null;
  const bevelD = D.bevel ?? 0.1;
  const add = (s) => {
    const k = s.kind;
    if (k === "flat" || !k) return;
    if (k === "max") { s.of.forEach(add); return; }
    const bevel = s.bevel ?? bevelD;
    if (k === "text") {
      const L = layoutStrokeText(s.text, s.cap, { letterSpacing: s.letterSpacing ?? 0.3, wordSpacing: s.wordSpacing ?? 0.6, bendRadius: 0.12 });
      const [cx, cz] = s.center ?? [0, 0];
      const yMid = s.cap / 2;
      const polys = L.chars.flatMap((c) => c.strokes.map((st) => st.map((p) => [cx + p[0], cz - (p[1] - yMid)])));
      strokeField(grid, polys, { radius: s.radius, bevel, height: s.height }, h);
    } else if (k === "strokes") {
      strokeField(grid, s.strokes, { radius: s.radius, bevel, height: s.height }, h);
    } else if (k === "polygon") {
      polygonField(grid, s.points, { bevel, height: s.height }, h);
    } else if (k === "icon") {
      const I = ICONS[s.shape]();
      const [cx, cz] = s.center ?? [0, 0], S = s.size;
      const tf = (p) => [cx + p[0] * S, cz + p[1] * S];
      if (I.polygon) polygonField(grid, I.polygon.map(tf), { bevel, height: s.height }, h);
      else strokeField(grid, I.strokes.map((p) => p.map(tf)), { radius: (s.radius ?? I.radius) * S, bevel, height: s.height }, h);
    } else if (k === "hand") {
      const [cx, cz] = s.center, S = s.size, rot = s.rot ?? 0, co = Math.cos(rot), si = Math.sin(rot);
      const P = (x, z) => [cx + (x * co - z * si) * S, cz + (x * si + z * co) * S];
      // unit hand: palm centred at origin, fingers toward -z (away from a front camera)
      const caps = [
        [P(-0.16, 0.14), P(0.16, 0.14), 0.25],     // palm (wide capsule)
        [P(-0.13, -0.05), P(0.13, -0.05), 0.24],
        [P(-0.25, -0.24), P(-0.29, -0.62), 0.075], // index .. little
        [P(-0.08, -0.29), P(-0.09, -0.76), 0.08],
        [P(0.09, -0.27), P(0.11, -0.7), 0.078],
        [P(0.25, -0.2), P(0.31, -0.52), 0.07],
        [P(-0.33, 0.12), P(-0.58, -0.18), 0.085],  // thumb
      ];
      const pad = 0.95 * S;
      for (let i = 0; i < grid.n; i++) {
        const px = grid.x[i], pz = grid.z[i];
        if (Math.abs(px - cx) > pad || Math.abs(pz - cz) > pad) continue;
        let d = Infinity;
        for (const [a, b, r] of caps) d = smin(d, capsuleSD(px, pz, a, b, r * S), 0.05 * S);
        const swell = 1 + (s.dome ?? 0.15) * clamp(-d / (0.25 * S));
        const v = (s.height * bevelProfile(-d, bevel) * swell) / (1 + (s.dome ?? 0.15));
        if (v > h[i]) h[i] = v;
      }
    } else if (k === "dome") {
      const [cx, cz] = s.center;
      for (let i = 0; i < grid.n; i++) {
        const d2 = (grid.x[i] - cx) ** 2 + (grid.z[i] - cz) ** 2;
        if (d2 >= s.r * s.r) continue;
        const v = s.top - s.r + Math.sqrt(s.r * s.r - d2);
        if (v > h[i]) h[i] = v;
      }
    } else if (k === "bars") {
      const [x0, z0, x1, z1] = s.box, nB = s.values.length, gap = s.gap ?? 0.2;
      const bw = (x1 - x0 - gap * (nB - 1)) / nB;
      tint = tint ?? new Int8Array(grid.n).fill(-1);
      for (let i = 0; i < grid.n; i++) {
        const px = grid.x[i], pz = grid.z[i];
        if (px < x0 || px > x1 || pz < z0 || pz > z1) continue;
        const b = Math.floor((px - x0) / (bw + gap));
        if (b < 0 || b >= nB || px - x0 - b * (bw + gap) > bw) continue;
        const v = s.values[b] * s.maxH;
        if (v > h[i]) { h[i] = v; tint[i] = s.colors ? s.colors[b % s.colors.length] : b; }
      }
    } else if (k === "terrain") {
      const f = heightField(s.field);
      const box = s.box ?? [-Infinity, -Infinity, Infinity, Infinity];
      for (let i = 0; i < grid.n; i++) {
        const px = grid.x[i], pz = grid.z[i];
        if (px < box[0] || px > box[2] || pz < box[1] || pz > box[3]) continue;
        const v = (s.base ?? 0) + Math.max(0, f(px, pz)) * (s.height ?? 1);
        if (v > h[i]) h[i] = v;
      }
    } else if (k === "bitmap") {
      const rows = s.rows, R = rows.length, C = Math.max(...rows.map((r) => r.length)), cell = s.cell;
      const [cx, cz] = s.center ?? [0, 0];
      const ox = cx - (C * cell) / 2, oz = cz - (R * cell) / 2;
      for (let i = 0; i < grid.n; i++) {
        const c = Math.floor((grid.x[i] - ox) / cell), r = Math.floor((grid.z[i] - oz) / cell);
        if (r < 0 || r >= R || c < 0 || c >= C || rows[r][c] !== "#") continue;
        const lx = grid.x[i] - ox - c * cell, lz = grid.z[i] - oz - r * cell;
        const edge = Math.min(lx, cell - lx, lz, cell - lz);
        const v = s.height * bevelProfile(edge + 0.5 * grid.pitch, s.bevel ?? cell * 0.3);
        if (v > h[i]) h[i] = v;
      }
    } else throw new Error(`pins: unknown source kind "${k}"`);
  };
  add(src);
  return { h, tint };
}

// ---------------------------------------------------------------- wave delays
/**
 * waveWeights(grid, wave) -> Float32Array 0..1 per pin (0 = first to move)
 *   wave: { type: "dir", dir:[dx,dz] } | { type: "radial", c:[x,z], inward? } | { type: "random", seed }
 *         | { type: "rows" } (front row first) — normalised over the WHOLE field so the speed is shape-independent.
 */
export function waveWeights(grid, wave = { type: "dir", dir: [1, 0] }) {
  const w = new Float32Array(grid.n);
  let lo = Infinity, hi = -Infinity;
  const val = (i) => {
    const x = grid.x[i], z = grid.z[i];
    if (wave.type === "radial") { const v = Math.hypot(x - wave.c[0], z - wave.c[1]); return wave.inward ? -v : v; }
    if (wave.type === "random") return hash01(i, wave.seed ?? 1, 77);
    if (wave.type === "rows") return -z;
    const L = Math.hypot(wave.dir[0], wave.dir[1]) || 1;
    return (x * wave.dir[0] + z * wave.dir[1]) / L;
  };
  for (let i = 0; i < grid.n; i++) { const v = val(i); w[i] = v; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const span = hi - lo || 1;
  for (let i = 0; i < grid.n; i++) w[i] = (w[i] - lo) / span;
  return w;
}

// ---------------------------------------------------------------- settle curves
/** springSettle(tau, M) -> 0..~1.05..1 closed-form spring, held at exactly 1 after M.settle s. */
export function springSettle(tau, M) {
  if (tau <= 0) return 0;
  if (tau >= M.settle) return 1;
  return spring(tau, M.spring);
}
/** dropSettle(tau, M) -> gravity fall to 1 at M.drop.fall, then one small bounce back toward 0, then exactly 1. */
export function dropSettle(tau, M) {
  const { fall, bounce, bounceT } = M.drop;
  if (tau <= 0) return 0;
  if (tau < fall) return (tau / fall) ** 2;
  const b = tau - fall;
  if (b < bounceT) return 1 - bounce * Math.sin((Math.PI * b) / bounceT);
  return 1;
}
/** time of the spring's first peak (the "landing" of a morph front) */
export function springPeak(M) {
  const { stiffness = 120, damping = 12, mass = 1 } = M.spring;
  const w0 = Math.sqrt(stiffness / mass), z = damping / (2 * Math.sqrt(stiffness * mass));
  return z < 1 ? Math.PI / (w0 * Math.sqrt(1 - z * z)) : 3 / w0;
}

// ---------------------------------------------------------------- layers (dynamic)
/** ball layer: a sphere rolling under the field; returns null outside its window. */
function ballCenter(L, t) {
  if (t < L.t0 || t > L.t1) return null;
  const u = toE(L.ease ?? "linear")((t - L.t0) / (L.t1 - L.t0));
  return [lerp(L.from[0], L.to[0], u), lerp(L.from[1], L.to[1], u)];
}
const toE = (e) => (typeof e === "function" ? e : ease[e] ?? ease.linear);

// ---------------------------------------------------------------- the plan
/**
 * createPlan(grid, M = spec.morph, { steps, layers, maxExt, rest })
 *   steps:  [{ id, t, to: src, wave, spread = M.spread, jitter = M.jitter, seed, settle: "spring"|"drop", spring? }]
 *   layers: [{ kind: "ball", id, from:[x,z], to:[x,z], t0, t1, r, top, ease }
 *            { kind: "ripple", id, c:[x,z], t0, amp, speed, wavelength, trail, life }]
 * -> plan { grid, steps, layers, heightsAt(t, out), progressAt(k, i, t), tintAt(...), shapeBox(k), stepTimes(k),
 *           motionStats({ t0, t1, fps, eps }), events(S.sound, { t0, t1, fps }) }
 */
export function createPlan(grid, M, o = {}) {
  const maxExt = o.maxExt ?? 1.5;
  const steps = [];
  let prev = new Float32Array(grid.n);
  (o.steps ?? []).forEach((st, k) => {
    const { h, tint } = heightsFrom(st.to, grid, { bevel: M.bevel });
    for (let i = 0; i < grid.n; i++) h[i] = Math.min(h[i], maxExt);
    const dH = new Float32Array(grid.n);
    const idx = [];
    for (let i = 0; i < grid.n; i++) { dH[i] = h[i] - prev[i]; if (Math.abs(dH[i]) > 1e-5) idx.push(i); }
    const w = waveWeights(grid, st.wave);
    const spread = st.spread ?? M.spread, jit = st.jitter ?? M.jitter, seed = st.seed ?? 31 + k * 17;
    const delay = new Float32Array(grid.n);
    for (let i = 0; i < grid.n; i++) delay[i] = w[i] * spread + hash01(i, seed) * jit;
    const MM = { ...M, spring: st.spring ?? M.spring, settle: st.settle === "drop" ? M.drop.fall + M.drop.bounceT : M.settle };
    const fn = st.settle === "drop" ? (tau) => dropSettle(tau, MM) : (tau) => springSettle(tau, MM);
    let dMin = Infinity, dMax = -Infinity;
    const ds = idx.map((i) => delay[i]).sort((a, b) => a - b);
    for (const i of idx) { dMin = Math.min(dMin, delay[i]); dMax = Math.max(dMax, delay[i]); }
    const land = st.settle === "drop" ? M.drop.fall : springPeak(MM);
    steps.push({
      ...st, k, target: h, tint, dH, idx: Int32Array.from(idx), delay, fn, MM,
      first: st.t + (idx.length ? dMin : 0),
      last: st.t + (idx.length ? dMax : 0),
      end: st.t + (idx.length ? dMax : 0) + MM.settle,
      landAt: st.t + (ds.length ? ds[Math.floor(ds.length * 0.85)] : 0) + land,
      changed: idx.length,
    });
    prev = h;
  });
  const layers = (o.layers ?? []).map((L) => ({ ...L }));

  function heightsAt(t, out = new Float32Array(grid.n)) {
    out.fill(0);
    for (const s of steps) {
      if (t <= s.first) continue;
      const { idx, dH, delay, fn } = s, t0 = s.t;
      if (t >= s.end) { for (let q = 0; q < idx.length; q++) { const i = idx[q]; out[i] += dH[i]; } continue; }
      for (let q = 0; q < idx.length; q++) {
        const i = idx[q];
        const tau = t - t0 - delay[i];
        if (tau > 0) out[i] += dH[i] * fn(tau);
      }
    }
    for (const L of layers) {
      if (L.kind === "ball") {
        const c = ballCenter(L, t);
        if (!c) continue;
        const r = L.r, base = L.top - r, reach = Math.sqrt(Math.max(0, r * r - base * base));
        for (let i = 0; i < grid.n; i++) {
          const dx = grid.x[i] - c[0]; if (dx > reach || dx < -reach) continue;
          const dz = grid.z[i] - c[1]; if (dz > reach || dz < -reach) continue;
          const d2 = dx * dx + dz * dz;
          if (d2 >= reach * reach) continue;
          const v = base + Math.sqrt(r * r - d2);
          if (v > out[i]) out[i] = v;
        }
      } else if (L.kind === "ripple") {
        const tau = t - L.t0;
        if (tau <= 0 || tau >= L.life) continue;
        const front = L.speed * tau, fade = (1 - tau / L.life) ** 2, lam = L.wavelength, trail = L.trail ?? lam * 1.5;
        for (let i = 0; i < grid.n; i++) {
          const r = Math.hypot(grid.x[i] - L.c[0], grid.z[i] - L.c[1]);
          const u = r - front;
          if (u > lam) continue;
          const env = u > 0 ? Math.exp(-((u / (0.35 * lam)) ** 2)) : Math.exp(u / trail);
          const ring = Math.max(0, Math.cos((TAU * u) / lam));
          out[i] += L.amp * fade * env * ring / Math.sqrt(1 + r);
        }
      }
    }
    for (let i = 0; i < grid.n; i++) out[i] = out[i] < 0 ? 0 : out[i] > maxExt ? maxExt : out[i];
    return out;
  }

  /** progress of step k at pin i (0..1, clamped) — e.g. to fade an anodised tint in as the pin rises */
  function progressAt(k, i, t) {
    const s = steps[k];
    if (!s || t <= s.first) return 0;
    if (t >= s.end) return 1;
    return clamp(s.fn(t - s.t - s.delay[i]));
  }

  /** shapeBox(k, minH) -> { min:[x,0,z], max:[x,h,z] } of the pins raised by step k's target (framing gates) */
  function shapeBox(k, minH = 0.02) {
    const s = steps[k];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, hm = 0;
    for (let i = 0; i < grid.n; i++) {
      if (s.target[i] < minH) continue;
      x0 = Math.min(x0, grid.x[i]); x1 = Math.max(x1, grid.x[i]); z0 = Math.min(z0, grid.z[i]); z1 = Math.max(z1, grid.z[i]); hm = Math.max(hm, s.target[i]);
    }
    return x0 === Infinity ? null : { min: [x0, 0, z0], max: [x1, hm, z1] };
  }

  /** motionStats({ t0, t1, fps, eps }) -> [{ t, moving }] pins that move more than eps between consecutive frames */
  function motionStats({ t0 = 0, t1, fps = 30, eps = 0.004 } = {}) {
    const n = Math.round((t1 - t0) * fps);
    let a = heightsAt(t0), b = new Float32Array(grid.n);
    const out = [];
    for (let f = 1; f <= n; f++) {
      const t = t0 + f / fps;
      heightsAt(t, b);
      let m = 0;
      for (let i = 0; i < grid.n; i++) if (Math.abs(b[i] - a[i]) > eps) m++;
      out.push({ t: t - 1 / fps, moving: m });
      const tmp = a; a = b; b = tmp;
    }
    return out;
  }

  /**
   * events(snd, { t0, t1, fps }) -> [{ t, kind, ... }] for kit scoreFromEvents (see pinVoices):
   *   shimmer { n: moving pins in the bin, k: ticks }  — dense metallic shimmer whose density follows the moving count
   *   tick    { n }                                    — a lone pin (or a few) moving
   *   thud    { w: share of the field that changed }   — a shape lands (85 % of its front has peaked)
   *   bell    { note }                                 — soft bell theme on each landing
   *   sweep   { w, dur }                               — one sparkle wash per morph
   */
  function events(snd, { t0 = 0, t1, fps = 30 } = {}) {
    const stats = motionStats({ t0, t1, fps, eps: snd.eps });
    const ev = [];
    const binF = Math.max(1, Math.round(snd.bin * fps));
    for (let f = 0; f < stats.length; f += binF) {
      let m = 0;
      for (let q = f; q < Math.min(stats.length, f + binF); q++) m = Math.max(m, stats[q].moving);
      if (m <= 0) continue;
      const t = stats[f].t;
      if (m < snd.lone) ev.push({ t, kind: "tick", n: m });
      else ev.push({ t, kind: "shimmer", n: m, k: Math.min(snd.shimmer.maxPerBin, 1 + Math.floor(Math.log2(m / snd.lone))), bin: snd.bin, share: m / grid.n });
    }
    steps.forEach((s, j) => {
      if (!s.changed) return;
      const w = s.changed / grid.n;
      ev.push({ t: s.first, kind: "sweep", w, dur: s.last - s.first + 0.4 });
      ev.push({ t: s.landAt, kind: "thud", w, drop: s.settle === "drop" });
      if (s.settle !== "drop") ev.push({ t: s.landAt + 0.02, kind: "bell", note: snd.bell.notes[j % snd.bell.notes.length] });
    });
    return ev.sort((a, b) => a.t - b.t);
  }

  return { grid, steps, layers, maxExt, heightsAt, progressAt, shapeBox, motionStats, events, ballCenter: (id, t) => ballCenter(layers.find((l) => l.id === id), t) };
}

// ---------------------------------------------------------------- sound
/** pinVoices(S.sound) -> voices for kit/schedule.scoreFromEvents (distinct seeds come from there). */
export function pinVoices(snd) {
  const [p0, p1] = snd.shimmer.pitch;
  return {
    shimmer: (e, { index }) => {
      const out = [];
      for (let j = 0; j < e.k; j++) {
        const r = hash01(index, j, 5);
        out.push({ type: "tick", gain: snd.shimmer.gain * (0.6 + 0.4 * Math.min(1, e.share * 8)) * (0.75 + 0.5 * r), pitch: lerp(p0, p1, hash01(index, j, 9)), dur: 0.012, offset: (j / e.k) * e.bin + r * 0.01 });
      }
      return out;
    },
    tick: (e, { index }) => [{ type: "tick", gain: snd.tick.gain * Math.min(1, 0.45 + e.n / 30), pitch: snd.tick.pitch * (0.9 + 0.2 * hash01(index, 3)), dur: 0.014 }],
    sweep: (e) => [{ type: "sparkle", gain: 0.1 + 0.25 * Math.sqrt(e.w), dur: Math.min(2.2, e.dur), notes: 10, pitch: 1.6 }],
    thud: (e) => [{ type: "thud", gain: snd.thud.gain * (0.5 + Math.sqrt(e.w)) * (e.drop ? 0.7 : 1), pitch: snd.thud.pitch * (e.drop ? 1.2 : 1), dur: 0.5 }],
    bell: (e) => [{ type: "chime", gain: snd.bell.gain, pitch: e.note, dur: 1.8, notes: 4 }],
  };
}

// ---------------------------------------------------------------- helpers for scenes
/** fieldBox(grid, top) -> [min, max] of the pin field (framing) */
export const fieldBox = (grid, top = 0.05) => [[-grid.w / 2, 0, -grid.d / 2], [grid.w / 2, top, grid.d / 2]];
