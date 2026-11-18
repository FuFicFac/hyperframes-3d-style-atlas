// styles/point-cloud/scan.js — the LiDAR scan planner for "Point Cloud Scan". Pure functions: no THREE, no window, no DOM.
// Imports only kit/time.js, so scene.config.js (Node: render-sfx, export-spec) and style.js (browser) build the SAME plan:
// the picture reads it (which dots exist, where, what colour, when each one appears) and SCORE reads it (motor whir per
// sweep, tick density = hits per bin, a tone when a sweep completes).
//
// Model: a terrestrial laser scanner on a tripod. A fast spinning mirror throws a vertical fan of rays (one "column");
// the head turns slowly in azimuth, so a full 360 deg sweep is nAz columns laid down in time. Every ray is cast
// analytically against a list of simple primitives (walls, floor, boxes, cylinders, spheres, capsules) that exist only
// as ray targets — they are never drawn. Each hit becomes a dot whose reveal time is when the head reaches that column.
// That gives the three tells of a real scan: rings / lines that spread with range, SCAN SHADOWS behind every object
// (nothing was hit there), and per-dot range + return intensity (cosine of incidence x surface reflectivity).
import { hash01, clamp, lerp } from "../../kit/time.js";

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- primitives (ray targets only)
// floor  { k:"floor", y, x:[x0,x1], z:[z0,z1], refl }
// wallZ  { k:"wallZ", z, x:[x0,x1], y:[y0,y1], holes:[[x0,x1,y0,y1]], refl }   (a wall in the XY plane at z)
// wallX  { k:"wallX", x, z:[z0,z1], y:[y0,y1], holes:[[z0,z1,y0,y1]], refl }   (a wall in the ZY plane at x)
// box    { k:"box", c:[x,y,z] (centre), h:[hx,hy,hz] (half sizes), yaw, refl }
// cyl    { k:"cyl", c:[x,y,z] (base centre), r, h, refl }                       (vertical, capped)
// sph    { k:"sph", c, r, refl }
// cap    { k:"cap", a, b, r, refl }                                              (capsule from a to b)

function rotY([x, y, z], yaw) { const c = Math.cos(yaw), s = Math.sin(yaw); return [x * c + z * s, y, -x * s + z * c]; }
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Object builders: return { id, prims, box:[min,max] } in world space (yaw about +Y, then translate to `at`). */
function group(id, at, yaw, prims, refl) {
  const out = prims.map((p) => {
    const q = { ...p, refl: p.refl ?? refl };
    if (q.c) q.c = add(rotY(q.c, yaw), at);
    if (q.a) q.a = add(rotY(q.a, yaw), at);
    if (q.b) q.b = add(rotY(q.b, yaw), at);
    if (q.k === "box") q.yaw = (q.yaw ?? 0) + yaw;
    return q;
  });
  return { id, prims: out, box: primsBox(out) };
}
function primsBox(prims) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const grow = (p, r) => { for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i] - r); mx[i] = Math.max(mx[i], p[i] + r); } };
  for (const p of prims) {
    if (p.k === "box") { const r = Math.hypot(p.h[0], p.h[2]); grow([p.c[0], p.c[1] - p.h[1] + p.h[1], p.c[2]], 0); grow([p.c[0] - r, p.c[1] - p.h[1], p.c[2] - r], 0); grow([p.c[0] + r, p.c[1] + p.h[1], p.c[2] + r], 0); }
    else if (p.k === "cyl") { grow([p.c[0], p.c[1], p.c[2]], p.r); grow([p.c[0], p.c[1] + p.h, p.c[2]], p.r); }
    else if (p.k === "sph") grow(p.c, p.r);
    else if (p.k === "cap") { grow(p.a, p.r); grow(p.b, p.r); }
  }
  return [mn, mx];
}

export const objects = {
  /** a standing figure ~1.75 m tall, facing +z before yaw */
  figure(at, yaw = 0, o = {}) {
    const s = o.scale ?? 1, P = (x, y, z) => [x * s, y * s, z * s];
    return group(o.id ?? "figure", at, yaw, [
      { k: "cap", a: P(-0.1, 0.09, 0), b: P(-0.09, 0.86, 0), r: 0.075 * s },
      { k: "cap", a: P(0.1, 0.09, 0.04), b: P(0.09, 0.86, 0), r: 0.075 * s },
      { k: "box", c: P(-0.1, 0.04, 0.05), h: P(0.05, 0.04, 0.12) },
      { k: "box", c: P(0.1, 0.04, 0.09), h: P(0.05, 0.04, 0.12) },
      { k: "cap", a: P(0, 0.95, 0), b: P(0, 1.36, 0), r: 0.17 * s },
      { k: "cap", a: P(-0.15, 1.42, 0), b: P(0.15, 1.42, 0), r: 0.075 * s },
      { k: "cap", a: P(-0.23, 1.4, 0), b: P(-0.3, 0.92, 0.06), r: 0.052 * s },
      { k: "cap", a: P(0.23, 1.4, 0), b: P(0.34, 1.0, 0.16), r: 0.052 * s },
      { k: "cap", a: P(0, 1.45, 0), b: P(0, 1.53, 0), r: 0.05 * s },
      { k: "sph", c: P(0, 1.63, 0.01), r: 0.115 * s },
    ], o.refl ?? 0.85);
  },
  /** a simple four-legged chair with a back, seat front toward +z */
  chair(at, yaw = 0, o = {}) {
    const W = 0.46, D = 0.46, H = 0.46, l = 0.022;
    const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ k: "box", c: [sx * (W / 2 - l), H / 2, sz * (D / 2 - l)], h: [l, H / 2, l] }));
    return group(o.id ?? "chair", at, yaw, [
      ...legs,
      { k: "box", c: [0, H + 0.025, 0], h: [W / 2, 0.025, D / 2] },
      { k: "box", c: [-(W / 2 - l), H + 0.25, -(D / 2 - l)], h: [l, 0.25, l] },
      { k: "box", c: [(W / 2 - l), H + 0.25, -(D / 2 - l)], h: [l, 0.25, l] },
      { k: "box", c: [0, H + 0.36, -(D / 2 - l)], h: [W / 2, 0.14, 0.02] },
    ], o.refl ?? 0.95);
  },
  /** a potted plant: pot + stems + a cluster of leafy spheres */
  plant(at, yaw = 0, o = {}) {
    const leaves = [[0, 0.95, 0, 0.26], [0.2, 0.78, 0.08, 0.2], [-0.18, 0.82, -0.06, 0.21], [0.05, 1.18, -0.08, 0.19], [-0.08, 0.7, 0.18, 0.17], [0.12, 1.02, -0.2, 0.17], [-0.2, 1.08, 0.12, 0.15]];
    return group(o.id ?? "plant", at, yaw, [
      { k: "cyl", c: [0, 0, 0], r: 0.21, h: 0.42 },
      { k: "cap", a: [0, 0.4, 0], b: [0.04, 0.85, 0], r: 0.025 },
      ...leaves.map(([x, y, z, r]) => ({ k: "sph", c: [x, y, z], r, refl: 0.7 })),
    ], o.refl ?? 0.9);
  },
  /** a round café table: base disc, pedestal, top */
  table(at, o = {}) {
    return group(o.id ?? "table", at, 0, [
      { k: "cyl", c: [0, 0, 0], r: 0.26, h: 0.035 },
      { k: "cyl", c: [0, 0.03, 0], r: 0.045, h: 0.68 },
      { k: "cyl", c: [0, 0.71, 0], r: 0.42, h: 0.04 },
      { k: "cyl", c: [0.12, 0.75, 0.05], r: 0.045, h: 0.11 },   // a mug
    ], o.refl ?? 0.95);
  },
  /** a bicycle along +x before yaw: wheels are rings of capsules */
  bicycle(at, yaw = 0, o = {}) {
    const R = 0.34, tube = 0.022, seg = 18, wb = 1.02, prims = [];
    for (const cx of [-wb / 2, wb / 2]) {
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
        prims.push({ k: "cap", a: [cx + Math.cos(a0) * R, R + Math.sin(a0) * R, 0], b: [cx + Math.cos(a1) * R, R + Math.sin(a1) * R, 0], r: tube });
      }
      prims.push({ k: "cap", a: [cx, R, -0.03], b: [cx, R, 0.03], r: 0.04 });
    }
    const rear = [-wb / 2, R, 0], front = [wb / 2, R, 0], crank = [-0.05, 0.3, 0], seatT = [-0.2, 0.86, 0], head = [0.36, 0.86, 0];
    const tubes = [[rear, crank], [rear, seatT], [crank, seatT], [seatT, head], [crank, head], [head, front], [head, [0.33, 1.0, 0]]];
    for (const [a, b] of tubes) prims.push({ k: "cap", a, b, r: 0.022 });
    prims.push({ k: "cap", a: [0.33, 1.0, -0.24], b: [0.33, 1.0, 0.24], r: 0.02 });          // handlebar
    prims.push({ k: "box", c: [-0.22, 0.9, 0], h: [0.12, 0.025, 0.06] });                    // saddle
    prims.push({ k: "cap", a: [-0.05, 0.3, -0.09], b: [-0.05, 0.3, 0.09], r: 0.03 });       // crank axle
    return group(o.id ?? "bicycle", at, yaw, prims, o.refl ?? 1.0);
  },
  /** a box (crate / cabinet) */
  crate(at, size, yaw = 0, o = {}) {
    return group(o.id ?? "crate", at, yaw, [{ k: "box", c: [0, size[1] / 2, 0], h: [size[0] / 2, size[1] / 2, size[2] / 2] }], o.refl ?? 0.9);
  },
};

/** roomCorner({ x:[x0,x1], z:[z0,z1], h, window, door }) -> { id:"room", prims } floor + back wall (z0) + left wall (x0) */
export function roomCorner(o = {}) {
  const X = o.x ?? [-4, 4], Z = o.z ?? [-3.4, 3.4], H = o.h ?? 2.7;
  const prims = [
    { k: "floor", y: 0, x: X, z: Z, refl: o.floorRefl ?? 0.75 },
    { k: "wallZ", z: Z[0], x: X, y: [0, H], holes: o.door ? [o.door] : [], refl: o.wallRefl ?? 0.85 },
    { k: "wallX", x: X[0], z: Z, y: [0, H], holes: o.window ? [o.window] : [], refl: o.wallRefl ?? 0.85 },
  ];
  return { id: "room", prims, box: [[X[0], 0, Z[0]], [X[1], H, Z[1]]], X, Z, H };
}

// ---------------------------------------------------------------- analytic ray casts: return t > tMin or Infinity
const EPS = 1e-4;
function hitAabb(o, d, mn, mx) {
  let t0 = -Infinity, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) { if (o[i] < mn[i] || o[i] > mx[i]) return false; continue; }
    let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i];
    if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  return t1 > 0;
}
const inHole = (holes, u, v) => holes.some(([u0, u1, v0, v1]) => u >= u0 && u <= u1 && v >= v0 && v <= v1);

function castPrim(p, o, d, best) {
  switch (p.k) {
    case "floor": {
      if (Math.abs(d[1]) < 1e-9) return null;
      const t = (p.y - o[1]) / d[1];
      if (t <= EPS || t >= best) return null;
      const x = o[0] + d[0] * t, z = o[2] + d[2] * t;
      if (x < p.x[0] || x > p.x[1] || z < p.z[0] || z > p.z[1]) return null;
      return { t, n: [0, 1, 0] };
    }
    case "wallZ": {
      if (Math.abs(d[2]) < 1e-9) return null;
      const t = (p.z - o[2]) / d[2];
      if (t <= EPS || t >= best) return null;
      const x = o[0] + d[0] * t, y = o[1] + d[1] * t;
      if (x < p.x[0] || x > p.x[1] || y < p.y[0] || y > p.y[1] || inHole(p.holes, x, y)) return null;
      return { t, n: [0, 0, Math.sign(o[2] - p.z) || 1] };
    }
    case "wallX": {
      if (Math.abs(d[0]) < 1e-9) return null;
      const t = (p.x - o[0]) / d[0];
      if (t <= EPS || t >= best) return null;
      const z = o[2] + d[2] * t, y = o[1] + d[1] * t;
      if (z < p.z[0] || z > p.z[1] || y < p.y[0] || y > p.y[1] || inHole(p.holes, z, y)) return null;
      return { t, n: [Math.sign(o[0] - p.x) || 1, 0, 0] };
    }
    case "box": {
      const c = Math.cos(p.yaw ?? 0), s = Math.sin(p.yaw ?? 0);
      const rx = o[0] - p.c[0], ry = o[1] - p.c[1], rz = o[2] - p.c[2];
      const lo = [rx * c - rz * s, ry, rx * s + rz * c], ld = [d[0] * c - d[2] * s, d[1], d[0] * s + d[2] * c];
      let t0 = -Infinity, t1 = Infinity, ax = -1, sg = 0;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(ld[i]) < 1e-12) { if (Math.abs(lo[i]) > p.h[i]) return null; continue; }
        let a = (-p.h[i] - lo[i]) / ld[i], b = (p.h[i] - lo[i]) / ld[i], sa = -1;
        if (a > b) { const q = a; a = b; b = q; sa = 1; }
        if (a > t0) { t0 = a; ax = i; sg = sa; }
        if (b < t1) t1 = b;
        if (t0 > t1) return null;
      }
      if (t0 <= EPS || t0 >= best || ax < 0) return null;
      const ln = [0, 0, 0]; ln[ax] = sg;
      return { t: t0, n: [ln[0] * c + ln[2] * s, ln[1], -ln[0] * s + ln[2] * c] };
    }
    case "sph": {
      const ox = o[0] - p.c[0], oy = o[1] - p.c[1], oz = o[2] - p.c[2];
      const b = ox * d[0] + oy * d[1] + oz * d[2], cc = ox * ox + oy * oy + oz * oz - p.r * p.r, h = b * b - cc;
      if (h < 0) return null;
      const t = -b - Math.sqrt(h);
      if (t <= EPS || t >= best) return null;
      return { t, n: [(ox + d[0] * t) / p.r, (oy + d[1] * t) / p.r, (oz + d[2] * t) / p.r] };
    }
    case "cyl": {
      let tb = Infinity, nb = null;
      const ox = o[0] - p.c[0], oz = o[2] - p.c[2];
      const a = d[0] * d[0] + d[2] * d[2];
      if (a > 1e-12) {
        const b = ox * d[0] + oz * d[2], cc = ox * ox + oz * oz - p.r * p.r, h = b * b - a * cc;
        if (h >= 0) {
          const t = (-b - Math.sqrt(h)) / a, y = o[1] + d[1] * t;
          if (t > EPS && y >= p.c[1] && y <= p.c[1] + p.h) { tb = t; nb = [(ox + d[0] * t) / p.r, 0, (oz + d[2] * t) / p.r]; }
        }
      }
      if (Math.abs(d[1]) > 1e-9) {
        for (const [yy, ny] of [[p.c[1] + p.h, 1], [p.c[1], -1]]) {
          const t = (yy - o[1]) / d[1];
          if (t <= EPS || t >= tb) continue;
          const x = ox + d[0] * t, z = oz + d[2] * t;
          if (x * x + z * z <= p.r * p.r) { tb = t; nb = [0, ny, 0]; }
        }
      }
      if (tb >= best) return null;
      return nb ? { t: tb, n: nb } : null;
    }
    case "cap": {
      // capsule intersection (closed form): cylinder body then the nearer hemisphere
      const ba = [p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]], oa = [o[0] - p.a[0], o[1] - p.a[1], o[2] - p.a[2]];
      const baba = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
      const bard = ba[0] * d[0] + ba[1] * d[1] + ba[2] * d[2];
      const baoa = ba[0] * oa[0] + ba[1] * oa[1] + ba[2] * oa[2];
      const rdoa = d[0] * oa[0] + d[1] * oa[1] + d[2] * oa[2];
      const oaoa = oa[0] * oa[0] + oa[1] * oa[1] + oa[2] * oa[2];
      const A = baba - bard * bard;
      let t = Infinity;
      if (A > 1e-12) {
        const B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - p.r * p.r * baba, h = B * B - A * C;
        if (h < 0) return null;
        const tt = (-B - Math.sqrt(h)) / A, y = baoa + tt * bard;
        if (y > 0 && y < baba) t = tt;
      }
      if (t === Infinity) {
        for (const e of [p.a, p.b]) {
          const ox = o[0] - e[0], oy = o[1] - e[1], oz = o[2] - e[2];
          const b = ox * d[0] + oy * d[1] + oz * d[2], cc = ox * ox + oy * oy + oz * oz - p.r * p.r, h = b * b - cc;
          if (h < 0) continue;
          const tt = -b - Math.sqrt(h);
          if (tt > EPS && tt < t) t = tt;
        }
      }
      if (!(t > EPS) || t >= best || t === Infinity) return null;
      const hp = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
      const u = clamp(((hp[0] - p.a[0]) * ba[0] + (hp[1] - p.a[1]) * ba[1] + (hp[2] - p.a[2]) * ba[2]) / baba);
      const n = [hp[0] - (p.a[0] + ba[0] * u), hp[1] - (p.a[1] + ba[1] * u), hp[2] - (p.a[2] + ba[2] * u)];
      const L = Math.hypot(n[0], n[1], n[2]) || 1;
      return { t, n: [n[0] / L, n[1] / L, n[2] / L] };
    }
  }
  return null;
}

/** castRay(world, o, d) -> { t, n, refl, obj } | null — nearest hit over every group (AABB-culled) */
export function castRay(world, o, d) {
  let best = Infinity, hit = null;
  for (const g of world) {
    if (g.box && g.id !== "room" && !hitAabb(o, d, g.box[0], g.box[1])) continue;
    for (const p of g.prims) {
      const h = castPrim(p, o, d, best);
      if (h && h.t < best) { best = h.t; hit = { t: h.t, n: h.n, refl: p.refl ?? 0.85, obj: g.id }; }
    }
  }
  return hit;
}

// ---------------------------------------------------------------- one scan = one sweep from one tripod
/**
 * scan(world, sc, cfg) -> { id, pos, t0, dur, n, pos:Float32Array(n*3), reveal, range, inten, col:Int32Array(nAz+1) ... }
 *   sc  = { id, pos:[x,y,z] (laser origin), t0 (s), dur (s), az0 (rad, 0 = +z), dir (+1 ccw from above / -1), seed }
 *   cfg = { nAz, nEl, elMin, elMax (rad), jitter (fraction of a step), rangeNoise (m), dropout, grazing, maxRange }
 *   Dots are emitted in column order, so reveal[] is sorted: the number of dots visible at t is an upper bound search.
 */
export function scan(world, sc, cfg) {
  const { nAz, nEl, elMin, elMax } = cfg;
  const dAz = TAU / nAz, dEl = (elMax - elMin) / (nEl - 1);
  const seed = sc.seed ?? 1, dir = sc.dir ?? 1;
  const P = [], R = [], D = [], I = [], col = new Int32Array(nAz + 1);
  const o = sc.pos;
  for (let i = 0; i < nAz; i++) {
    col[i] = R.length;
    const tCol = sc.t0 + (i / nAz) * sc.dur;
    for (let j = 0; j < nEl; j++) {
      const ja = (hash01(i, j, seed, 11) - 0.5) * cfg.jitter, je = (hash01(i, j, seed, 13) - 0.5) * cfg.jitter;
      const az = sc.az0 + dir * (i + ja) * dAz, el = elMin + (j + je) * dEl;
      const ce = Math.cos(el);
      const d = [ce * Math.sin(az), Math.sin(el), ce * Math.cos(az)];
      const h = castRay(world, o, d);
      if (!h || h.t > cfg.maxRange) continue;
      const cosI = Math.abs(h.n[0] * d[0] + h.n[1] * d[1] + h.n[2] * d[2]);
      // returns fail at grazing incidence and at random (dropout): both seeded per ray
      if (cosI < cfg.grazing && hash01(i, j, seed, 17) > cosI / cfg.grazing) continue;
      if (hash01(i, j, seed, 19) < cfg.dropout) continue;
      const r = h.t + (hash01(i, j, seed, 23) - 0.5) * 2 * cfg.rangeNoise;
      P.push(o[0] + d[0] * r, o[1] + d[1] * r, o[2] + d[2] * r);
      R.push(tCol + (j / nEl) * (sc.dur / nAz));
      D.push(r);
      I.push(clamp(h.refl * (0.35 + 0.65 * Math.sqrt(cosI)) * (1 - 0.04 * r / cfg.maxRange)));
    }
  }
  col[nAz] = R.length;
  const reveal = Float32Array.from(R);
  return {
    id: sc.id, origin: o.slice(), t0: sc.t0, dur: sc.dur, t1: sc.t0 + sc.dur, az0: sc.az0, dir, nAz, n: R.length,
    pos: Float32Array.from(P), reveal, range: Float32Array.from(D), inten: Float32Array.from(I), col,
    /** dots revealed by time t (reveal <= t) */
    countAt(t) { let lo = 0, hi = reveal.length; while (lo < hi) { const m = (lo + hi) >> 1; if (reveal[m] <= t) lo = m + 1; else hi = m; } return lo; },
    /** the column being measured at t, or -1 outside the sweep */
    columnAt(t) { if (t < sc.t0 || t >= sc.t0 + sc.dur) return -1; return Math.min(nAz - 1, Math.floor(((t - sc.t0) / sc.dur) * nAz)); },
    /** head azimuth at t (rad): az0 before the sweep, az0 + dir*TAU after */
    headAz(t) { return sc.az0 + dir * clamp((t - sc.t0) / sc.dur) * TAU; },
  };
}

/** createPlan(world, scanners, cfg) -> { scans, world, countAt(t), events(snd, {fps,t0,t1}), coverage(...) } */
export function createPlan(world, scanners, cfg) {
  const scans = scanners.map((s) => scan(world, s, cfg));
  const total = scans.reduce((a, s) => a + s.n, 0);
  /**
   * events(snd) -> [{ t, kind, ... }] for kit scoreFromEvents (see scanVoices):
   *   spinup { scan }            the mirror spins up just before a sweep
   *   whir   { dur, scan }       motor whir following the head for the whole sweep
   *   ticks  { k, rate }         fast soft ticks: k per bin from the hit rate in that bin
   *   done   { scan, note }      a tone when a sweep completes
   */
  function events(snd, { fps = 30 } = {}) {
    const ev = [];
    scans.forEach((s, q) => {
      ev.push({ t: Math.max(0, s.t0 - snd.spinup.lead), kind: "spinup", scan: q });
      ev.push({ t: s.t0, kind: "whir", dur: s.dur, scan: q });
      // hit rate per bin, normalised by the busiest bin of this sweep: tick density follows what the laser is hitting
      const bin = snd.bin, nb = Math.ceil(s.dur / bin - 1e-6), hits = [];
      for (let b = 0; b < nb; b++) hits.push(s.countAt(Math.min(s.t1, s.t0 + (b + 1) * bin)) - s.countAt(s.t0 + b * bin));
      const peak = Math.max(1, ...hits);
      hits.forEach((h, b) => {
        const rate = h / peak, k = Math.round(clamp(rate * rate * snd.ticks.perBin, 0, snd.ticks.perBin));
        if (k > 0) ev.push({ t: +(s.t0 + b * bin).toFixed(6), kind: "ticks", k, rate, bin, scan: q });
      });
      ev.push({ t: s.t1, kind: "done", scan: q, note: snd.done.notes[q % snd.done.notes.length] });
    });
    void fps;
    return ev.sort((a, b) => a.t - b.t);
  }
  /**
   * coverage(cell, region) -> per scan set of occupied floor cells (y < 0.05) within region [x0,x1,z0,z1]: shows how much
   *   of the floor each scan saw and how much the second scan fills (used in NOTES, not on screen).
   */
  function coverage(cell = 0.1, region) {
    const [x0, x1, z0, z1] = region, nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
    const sets = scans.map((s) => {
      const m = new Uint8Array(nx * nz);
      for (let i = 0; i < s.n; i++) {
        if (s.pos[i * 3 + 1] > 0.05) continue;
        const cx = Math.floor((s.pos[i * 3] - x0) / cell), cz = Math.floor((s.pos[i * 3 + 2] - z0) / cell);
        if (cx >= 0 && cz >= 0 && cx < nx && cz < nz) m[cx + cz * nx] = 1;
      }
      return m;
    });
    const n = nx * nz, seen = sets.map((m) => m.reduce((a, v) => a + v, 0));
    let union = 0; for (let i = 0; i < n; i++) if (sets.some((m) => m[i])) union++;
    return { cells: n, seen, union };
  }
  return { scans, world, total, cfg, countAt: (t) => scans.reduce((a, s) => a + s.countAt(t), 0), events, coverage };
}

/** scanVoices(S.sound) -> voices for kit/schedule.scoreFromEvents (distinct seeds come from there). */
export function scanVoices(snd) {
  return {
    spinup: (e) => [{ type: "servo", gain: snd.spinup.gain, hz: snd.spinup.hz[0], hz2: snd.spinup.hz[1], dur: snd.spinup.lead + 0.1, grit: 0.1 }],
    whir: (e) => [
      { type: "whir", gain: snd.whir.gain, hz: snd.whir.hz[0], hz2: snd.whir.hz[1], dur: e.dur, pitch: e.scan ? snd.whir.second : 1 },
      { type: "hum", gain: snd.whir.hum, hz: snd.whir.humHz, dur: e.dur, flicker: 0 },
    ],
    ticks: (e, { index }) => {
      const out = [];
      for (let j = 0; j < e.k; j++) {
        const r = hash01(index, j, 31);
        out.push({ type: "tick", gain: snd.ticks.gain * (0.55 + 0.45 * Math.min(1, e.rate)) * (0.7 + 0.6 * r), pitch: lerp(snd.ticks.pitch[0], snd.ticks.pitch[1], hash01(index, j, 37)), dur: 0.01, offset: (j / e.k) * e.bin + r * 0.006 });
      }
      return out;
    },
    done: (e) => [
      { type: "marimba", gain: snd.done.gain, hz: snd.done.hz * e.note, decay: 0.5, notes: [0, 7, 12], step: 0.07, dur: 1.4 },
      { type: "chime", gain: snd.done.chime, pitch: e.note, dur: 1.6, notes: 4 },
    ],
  };
}
