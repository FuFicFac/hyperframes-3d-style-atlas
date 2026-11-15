// pathmath.js — pure 3D polyline math (no THREE; Node-safe). Re-exported by paths.js.
// Promoted from the neon-sign pilot.
// A "stroke" is a list of [x, y] / [x, y, z] points and/or arcs ["a", cx, cy, rx, ry, deg0, deg1]
// (degrees CCW from +x; deg1 < deg0 runs clockwise; arcs are sampled every ~5 degrees).
import { clamp, TAU } from "./time.js";

const DEG = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const vec3 = { sub, add, mul, dot, len, nrm };

/** expandStroke(stroke, scale = 1, offset = [0,0], z = 0) -> [[x,y,z], ...] (arcs sampled, duplicates dropped). */
export function expandStroke(stroke, scale = 1, offset = [0, 0], z = 0) {
  const pts = [];
  const push = (x, y, zz = z) => {
    const p = [offset[0] + x * scale, offset[1] + y * scale, zz];
    const q = pts[pts.length - 1];
    if (!q || len(sub(p, q)) > 1e-6) pts.push(p);
  };
  for (const e of stroke) {
    if (e[0] === "a") {
      const [, cx, cy, rx, ry, d0, d1] = e;
      const n = Math.max(2, Math.ceil(Math.abs(d1 - d0) / 5));
      for (let i = 0; i <= n; i++) {
        const a = (d0 + ((d1 - d0) * i) / n) * DEG;
        push(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
      }
    } else push(e[0], e[1], e.length > 2 ? e[2] : z);
  }
  return pts;
}

/** filletPath(pts, r) -> pts with every corner sharper than ~7 degrees replaced by a sampled bend of radius r. */
export function filletPath(pts, r) {
  if (pts.length < 3 || r <= 0) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1], P = pts[i], B = pts[i + 1];
    const la = len(sub(P, A)), lb = len(sub(B, P));
    const u = nrm(sub(P, A)), v = nrm(sub(B, P));
    const turn = Math.acos(clamp(dot(u, v), -1, 1));
    if (turn < 0.12) { out.push(P); continue; }
    const d = Math.min(r * Math.tan(Math.min(turn, 3.0) / 2), 0.48 * la, 0.48 * lb);
    const q1 = sub(P, mul(u, d)), q2 = add(P, mul(v, d));
    const m = Math.ceil(turn / 0.18) + 2;
    for (let k = 0; k <= m; k++) {
      const s = k / m, a = (1 - s) * (1 - s), b = 2 * s * (1 - s), c = s * s;
      out.push([a * q1[0] + b * P[0] + c * q2[0], a * q1[1] + b * P[1] + c * q2[1], a * q1[2] + b * P[2] + c * q2[2]]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** pathLength(pts) -> total polyline length. */
export const pathLength = (pts) => pts.reduce((s, p, i) => (i ? s + len(sub(p, pts[i - 1])) : 0), 0);

/** pointAt(pts, s) -> { p, t } position and unit tangent at arc length s (clamped to the ends). */
export function pointAt(pts, s) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = len(sub(pts[i], pts[i - 1]));
    if (acc + seg >= s || i === pts.length - 1) {
      const k = seg ? clamp((s - acc) / seg) : 0;
      return { p: add(pts[i - 1], mul(sub(pts[i], pts[i - 1]), k)), t: nrm(sub(pts[i], pts[i - 1])) };
    }
    acc += seg;
  }
  return { p: pts[0], t: [1, 0, 0] };
}


/**
 * sagPoints(anchors [[x,y,z]...], { sag = .22, step = .15, minSeg = 6 }) -> polyline that droops between
 * consecutive anchors (parabola; depth = sag x span x .25 at mid-span, so longer spans sag more). For cables,
 * ropes, bunting, power lines; feed it to paths.tubeAlong. (tiny-diorama)
 */
export function sagPoints(anchors, { sag = 0.22, step = 0.15, minSeg = 6 } = {}) {
  const pts = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    const span = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(minSeg, Math.ceil(span / step));
    for (let k = i ? 1 : 0; k <= n; k++) {
      const u = k / n;
      pts.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag * span * 0.25 * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u]);
    }
  }
  return pts;
}

// promoted 2026-11-13 (pass 4, felt-stitch)
const P3 = (p) => [p[0], p[1], p[2] ?? 0];
/** strokeOutline(points, halfWidth, { cap = 8 }) -> closed polygon around an open polyline (round ends):
 *  felt letters / cut-outs / stickers are cut from these. Assumes bends are filleted wider than halfWidth (strokefont does). */
export function strokeOutline(pts, hw, { cap = 8 } = {}) {
  const P = pts.map(P3);
  if (P.length === 1 || pathLength(P) < 1e-4) {
    const c = P[0], out = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; out.push([c[0] + Math.cos(a) * hw, c[1] + Math.sin(a) * hw]); }
    return out;
  }
  const n = P.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    L.push([P[i][0] - ty * hw, P[i][1] + tx * hw]);
    R.push([P[i][0] + ty * hw, P[i][1] - tx * hw]);
  }
  const capPts = (c, from, sweep) => { const o = []; for (let k = 1; k < cap; k++) { const a = from + (k / cap) * sweep; o.push([c[0] + Math.cos(a) * hw, c[1] + Math.sin(a) * hw]); } return o; };
  const t1 = Math.atan2(P[n - 1][1] - P[n - 2][1], P[n - 1][0] - P[n - 2][0]);
  const t0 = Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]);
  return [...L, ...capPts(P[n - 1], t1 + Math.PI / 2, -Math.PI), ...R.reverse(), ...capPts(P[0], t0 - Math.PI / 2, -Math.PI)];
}


// ---------------------------------------------------------------- promoted 2026-11-13 (pass 6: subway-map, circuit-board)
/**
 * octilinearCorners(waypoints, { lead = "straight" }) -> [[gx, gy], ...] corner points (grid units, 2D)
 *   Each leg between consecutive waypoints becomes at most one straight run (0 / 90 deg) and one 45 deg diagonal, so the
 *   route only ever runs at 0 / 45 / 90 deg. lead = which comes first: "straight" | "diag" ("s" / "d" also accepted),
 *   per leg on the leg's END waypoint as a third element ([gx, gy, "d"]) or { at: [gx, gy], lead }. Duplicate and
 *   collinear interior points are dropped. (subway-map octilinear + circuit-board octiRoute, same rule.)
 */
export function octilinearCorners(waypoints, { lead = "straight" } = {}) {
  const W = waypoints.map((w) => (Array.isArray(w) ? { at: [w[0], w[1]], lead: w[2] } : { at: [w.at[0], w.at[1]], lead: w.lead }));
  const isDiag = (l) => l === "d" || l === "diag";
  const pts = [W[0].at.slice()];
  const sg = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  for (let i = 1; i < W.length; i++) {
    const [ax, ay] = pts[pts.length - 1], [bx, by] = W[i].at;
    const dx = bx - ax, dy = by - ay, m = Math.min(Math.abs(dx), Math.abs(dy));
    if (m > 1e-9 && Math.abs(Math.abs(dx) - Math.abs(dy)) > 1e-9) {
      const d = [sg(dx) * m, sg(dy) * m];
      pts.push(isDiag(W[i].lead ?? lead) ? [ax + d[0], ay + d[1]] : [bx - d[0], by - d[1]]);
    }
    pts.push([bx, by]);
  }
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = out[out.length - 1];
    if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) > 1e-9) out.push(pts[i]);
  }
  const o2 = [out[0]];
  for (let i = 1; i < out.length - 1; i++) {
    const a = o2[o2.length - 1], b = out[i], c = out[i + 1];
    if (Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-9) o2.push(b);
  }
  if (out.length > 1) o2.push(out[out.length - 1]);
  return o2;
}

/** chamferCorners(pts, c) -> every RIGHT-angle corner cut into two 45 deg bends, cut length min(c, 45 % of each leg).
 *  45 deg corners stay sharp (they are already octilinear). 3D points; the cut runs in the path's own plane. */
export function chamferCorners(pts, c) {
  if (pts.length < 3 || !(c > 0)) return pts.map(P3);
  const P = pts.map(P3), out = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], n = P[i + 1];
    const l1 = len(sub(b, a)), l2 = len(sub(n, b));
    const d1 = mul(sub(b, a), 1 / (l1 || 1)), d2 = mul(sub(n, b), 1 / (l2 || 1));
    if (Math.abs(dot(d1, d2)) < 0.05) {
      const k = Math.min(c, l1 * 0.45, l2 * 0.45);
      out.push(sub(b, mul(d1, k)), add(b, mul(d2, k)));
    } else out.push(b);
  }
  out.push(P[P.length - 1]);
  return out;
}

/** arcTable(pts) -> { pts, cum, length, at(s) -> { p, t, i }, project(q) -> s } — O(log n) arc-length lookup on a
 *  3D polyline (pointAt is O(n)); project() takes [x, y, z] (or [x, z] for an "xz"-plane route: pass plane = "xz"). */
export function arcTable(pts, { plane = null } = {}) {
  const P = pts.map(P3), cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + len(sub(P[i], P[i - 1])));
  const length = cum[cum.length - 1];
  const at = (s) => {
    s = clamp(s, 0, length);
    let lo = 1, hi = P.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
    const i = Math.max(1, lo), a = P[i - 1], b = P[i], L = cum[i] - cum[i - 1];
    const k = L ? (s - cum[i - 1]) / L : 0;
    return { p: add(a, mul(sub(b, a), k)), t: nrm(sub(b, a)), i: i - 1 };
  };
  const project = (q0) => {
    const q = plane === "xz" && q0.length === 2 ? [q0[0], 0, q0[1]] : P3(q0);
    const flat = plane === "xz";
    let best = Infinity, bs = 0;
    for (let i = 1; i < P.length; i++) {
      const a = flat ? [P[i - 1][0], 0, P[i - 1][2]] : P[i - 1], b = flat ? [P[i][0], 0, P[i][2]] : P[i];
      const e = sub(b, a), l2 = dot(e, e) || 1e-12, k = clamp(dot(sub(q, a), e) / l2);
      const d = len(sub(q, add(a, mul(e, k))));
      if (d < best) { best = d; bs = cum[i - 1] + k * (cum[i] - cum[i - 1]); }
    }
    return bs;
  };
  return { pts: P, cum, length, at, project };
}

/**
 * octilinearRoute(waypoints, { grid = 1, origin = [0, 0], plane = "xz", level = 0, lead = "straight",
 *                              bend = "round" | "chamfer" | "none", radius = 0.5, chamfer = 0.3, step = 0 }) -> route
 *   Grid waypoints (see octilinearCorners) -> a 0 / 45 / 90 deg path in world metres with rounded (filletPath, radius m)
 *   or chamfered (chamferCorners, chamfer m: PCB style) bends, plus O(log n) arc-length lookup.
 *   plane "xz": world = [origin[0] + gx * grid, level, origin[1] + gy * grid] (map on a table / floor; gy grows toward
 *   the viewer). plane "xy": world = [origin[0] + gx * grid, origin[1] + gy * grid, level] (a wall / board).
 *   step > 0 resamples the bent path every `step` m (uniform draw-on clipping).
 *   route = { corners (world, unbent), pts, cum, length, at(s) -> { p, t, i }, project(world point) -> s,
 *             world(gridPt) -> [x, y, z], stationS(gridPt) -> s }
 */
export function octilinearRoute(waypoints, o = {}) {
  const { grid = 1, origin = [0, 0], plane = "xz", level = 0, lead = "straight", bend = "round", radius = 0.5, chamfer = 0.3, step = 0 } = o;
  const world = (g) => (plane === "xy" ? [origin[0] + g[0] * grid, origin[1] + g[1] * grid, level] : [origin[0] + g[0] * grid, level, origin[1] + g[1] * grid]);
  const corners = octilinearCorners(waypoints, { lead }).map(world);
  let pts = bend === "round" ? filletPath(corners, radius) : bend === "chamfer" ? chamferCorners(corners, chamfer) : corners.slice();
  if (step > 0) {
    const L = pathLength(pts), n = Math.max(2, Math.ceil(L / step)), tab = arcTable(pts), out = [];
    for (let i = 0; i <= n; i++) out.push(tab.at((L * i) / n).p);
    pts = out;
  }
  const tab = arcTable(pts);
  return { corners, ...tab, world, stationS: (g) => tab.project(world(g)) };
}
