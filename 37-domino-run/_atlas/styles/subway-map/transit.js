// styles/subway-map/transit.js — the subway-map planner. Pure functions: NO THREE, no window, no DOM.
// Imports only kit/time.js + kit/pathmath.js, so scene.config.js (Node: render-sfx, export-spec) and style.js
// (browser) read the SAME plan: route geometry, track-laying clock, station arrival times, train timetables, and
// the event list the SCORE is built from. Exposed as `style.plan`.
//
// Coordinates: the map is drawn on the panel top (XZ plane). A grid point is [gx, gz] in grid units
// (gz grows toward the viewer = screen-down in the overview). world = [origin[0] + gx * grid, y, origin[1] + gz * grid].
import { clamp, ease, lerp } from "../../kit/time.js";
import { filletPath, pathLength, pointAt } from "../../kit/pathmath.js";

const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

/**
 * octilinear(waypoints, { order = "straight" }) -> [[gx, gz], ...] corner points
 *   Each leg between consecutive waypoints is split into at most one straight run (0 / 90 deg) and one 45-degree
 *   diagonal, so the whole route only ever runs at 0 / 45 / 90 degrees. A waypoint may carry a third element
 *   "s" (straight first) or "d" (diagonal first) to choose the elbow for the leg ARRIVING at it.
 */
export function octilinear(waypoints, { order = "straight" } = {}) {
  const out = [[waypoints[0][0], waypoints[0][1]]];
  for (let i = 1; i < waypoints.length; i++) {
    const [ax, az] = out[out.length - 1];
    const [bx, bz, o = order === "straight" ? "s" : "d"] = waypoints[i];
    const dx = bx - ax, dz = bz - az, m = Math.min(Math.abs(dx), Math.abs(dz));
    if (m > 1e-9 && Math.abs(Math.abs(dx) - Math.abs(dz)) > 1e-9) {
      const diag = [sgn(dx) * m, sgn(dz) * m];
      const elbow = o === "d" ? [ax + diag[0], az + diag[1]] : [bx - diag[0], bz - diag[1]];
      out.push(elbow);
    }
    out.push([bx, bz]);
  }
  return out;
}

/**
 * routePath(waypoints, { grid = 1, origin = [0, 0], y = 0, bend = 0.9, order, step = 0.05 }) -> route
 *   route = { pts (filleted, resampled every `step` m, [x, y, z]), corners (world), length, at(s) -> { p, t },
 *             project([x, z] world) -> s (closest arc length), stationS(gridPoint) -> s, grid, origin, y }
 *   Rounded bends come from kit filletPath (radius `bend`). Resampling makes draw-on clipping uniform.
 */
export function routePath(waypoints, o = {}) {
  const { grid = 1, origin = [0, 0], y = 0, bend = 0.9, order = "straight", step = 0.05 } = o;
  const W = (g) => [origin[0] + g[0] * grid, y, origin[1] + g[1] * grid];
  const corners = octilinear(waypoints, { order }).map(W);
  const raw = filletPath(corners, bend);
  const L = pathLength(raw);
  const n = Math.max(2, Math.ceil(L / step));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(pointAt(raw, (L * i) / n).p);
  const length = pathLength(pts);
  const project = (q) => {
    let best = Infinity, bestS = 0, acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const ex = b[0] - a[0], ez = b[2] - a[2], l2 = ex * ex + ez * ez || 1e-12;
      const k = clamp(((q[0] - a[0]) * ex + (q[1] - a[2]) * ez) / l2);
      const px = a[0] + ex * k, pz = a[2] + ez * k, d = Math.hypot(q[0] - px, q[1] - pz);
      const sl = Math.sqrt(l2);
      if (d < best) { best = d; bestS = acc + k * sl; }
      acc += sl;
    }
    return bestS;
  };
  return {
    pts, corners, length, grid, origin, y,
    at: (s) => pointAt(pts, clamp(s, 0, length)),
    project,
    world: W,
    stationS: (g) => project([origin[0] + g[0] * grid, origin[1] + g[1] * grid]),
  };
}

/**
 * layPlan(keys [{ t, s }], { ease = "inOutSine" }) -> { head(t) -> s | -1, start, end, keys }
 *   The track-laying clock: the drawn length of a route as a function of time. Between keys the head eases
 *   (inOutSine = it slows into every keyed station, which is where the station pops). Before the first key the
 *   route is not started (-1); after the last key it holds.
 */
export function layPlan(keys, { ease: e = "inOutSine" } = {}) {
  const K = keys.slice().sort((a, b) => a.t - b.t);
  const f = ease[e] ?? ease.inOutSine;
  const head = (t) => {
    if (t < K[0].t) return -1;
    for (let i = 1; i < K.length; i++) if (t < K[i].t) return lerp(K[i - 1].s, K[i].s, f((t - K[i - 1].t) / (K[i].t - K[i - 1].t)));
    return K[K.length - 1].s;
  };
  // inverse (for ticks): the first time head(t) >= s, by bisection inside the bracketing key segment (monotone)
  const timeAt = (s) => {
    if (s <= K[0].s) return K[0].t;
    for (let i = 1; i < K.length; i++) {
      if (s <= K[i].s + 1e-9) {
        let a = K[i - 1].t, b = K[i].t;
        for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (head(m) < s) a = m; else b = m; }
        return b;
      }
    }
    return Infinity;
  };
  return { head, timeAt, keys: K, start: K[0].t, end: K[K.length - 1].t };
}

/**
 * timetable({ stops [s...] (arc lengths in travel order; may reverse), depart, dwell = .7, vmax = 3, accel = 3,
 *             appear = .35, dwells? [per stop] }) -> { at(t) -> { s, dir, v, visible, grow, moving }, events, end, legs }
 *   Closed-form trapezoid (or triangle) speed profile per leg, dwell at every intermediate stop. The train pops
 *   in `appear` s before it departs and then stays visible (dwelling at its last stop). events:
 *   { kind: "depart" | "arrive", t, i, dur (accel or brake time), last }.
 */
export function timetable(o) {
  const { stops, depart, dwell = 0.7, vmax = 3, accel = 3, appear = 0.35 } = o;
  const legs = [];
  let t = depart;
  for (let i = 1; i < stops.length; i++) {
    const D = Math.abs(stops[i] - stops[i - 1]);
    const tri = D < (vmax * vmax) / accel;
    const vp = tri ? Math.sqrt(D * accel) : vmax;
    const ta = vp / accel;
    const T = tri ? 2 * ta : D / vmax + ta;
    legs.push({ i, t0: t, T, D, vp, ta, s0: stops[i - 1], s1: stops[i], dir: sgn(stops[i] - stops[i - 1]) || 1 });
    t += T + (o.dwells?.[i] ?? dwell);
  }
  const dist = (L, u) => { // distance covered u seconds into leg L
    if (u <= L.ta) return 0.5 * accel * u * u;
    if (u >= L.T - L.ta) { const r = L.T - u; return L.D - 0.5 * accel * r * r; }
    return 0.5 * accel * L.ta * L.ta + L.vp * (u - L.ta);
  };
  const at = (tt) => {
    const grow = clamp((tt - (depart - appear)) / appear);
    const visible = tt >= depart - appear;
    if (tt < depart || !legs.length) return { s: stops[0], dir: legs[0]?.dir ?? 1, v: 0, visible, grow, moving: false };
    for (const L of legs) {
      if (tt < L.t0) return { s: L.s0, dir: L.dir, v: 0, visible, grow, moving: false }; // dwelling before this leg
      if (tt <= L.t0 + L.T) {
        const u = tt - L.t0;
        const v = u < L.ta ? accel * u : u > L.T - L.ta ? accel * (L.T - u) : L.vp;
        return { s: L.s0 + L.dir * dist(L, u), dir: L.dir, v, visible, grow, moving: true };
      }
    }
    const L = legs[legs.length - 1];
    return { s: L.s1, dir: L.dir, v: 0, visible, grow, moving: false };
  };
  const events = [];
  legs.forEach((L, k) => {
    events.push({ kind: "depart", t: L.t0, i: L.i - 1, dur: L.ta });
    events.push({ kind: "arrive", t: L.t0 + L.T, i: L.i, dur: L.ta, brakeAt: L.t0 + L.T - L.ta, last: k === legs.length - 1 });
  });
  return { at, events, legs, end: legs.length ? legs[legs.length - 1].t0 + legs[legs.length - 1].T : depart };
}

/**
 * layEvents(lay, { route, stations [{ s, id, interchange? }], tieEvery = 1, id }) -> events
 *   { kind: "layStart", t, dur } per moving key segment, { kind: "tie", t, n } each time the head passes a
 *   multiple of `tieEvery` metres (a track click), { kind: "station", t, id, s, interchange } when the head
 *   reaches a station.
 */
export function layEvents(lay, { stations = [], tieEvery = 1, id = "" } = {}) {
  const ev = [];
  const K = lay.keys;
  for (let i = 1; i < K.length; i++) if (K[i].s !== K[i - 1].s) ev.push({ kind: "layStart", t: K[i - 1].t, dur: K[i].t - K[i - 1].t, route: id, from: K[i - 1].s, to: K[i].s });
  const s0 = K[0].s, s1 = K[K.length - 1].s;
  let n = 0;
  for (let s = Math.ceil(s0 / tieEvery) * tieEvery + tieEvery; s < s1 - 0.25; s += tieEvery) ev.push({ kind: "tie", t: lay.timeAt(s), n: n++, route: id });
  for (const st of stations) ev.push({ kind: "station", t: lay.timeAt(st.s), id: st.id, s: st.s, interchange: !!st.interchange, route: id });
  return ev.sort((a, b) => a.t - b.t);
}

/**
 * gapBehindHead(train, lay, t0, t1, dt = 1/60) -> smallest (head - train front) along the route over [t0, t1]
 * for a train running in +s; negative = the train overtook the track that was still being laid. `front` = half
 * the train length. Use it in scene.config.js to assert a timetable never outruns the laying head.
 */
export function gapBehindHead(train, lay, t0, t1, { front = 0.5, dt = 1 / 60 } = {}) {
  let worst = { gap: Infinity, t: t0 };
  for (let t = t0; t <= t1 + 1e-9; t += dt) {
    const p = train.at(t);
    if (!p.visible || t >= lay.end) continue; // once the route is fully laid there is no head to outrun
    const g = lay.head(t) - (p.s + front);
    if (g < worst.gap) worst = { gap: g, t };
  }
  return worst;
}

/** stationName helper for UI: key on/off window for a beat-driven label. */
export const labelWindow = (on, off, { inDur = 0.3, outDur = 0.3 } = {}) => ({ on, off, inDur, outDur });

/** glideKey(t, focus [x, z], { back, up, side, lead, ease, fov }) -> camera key: low glide behind-left of focus. */
export function glideKey(t, focus, { back = 6.5, up = 3.4, side = -5.2, lead = 1.6, ease: e = "inOutSine", fov } = {}) {
  const k = { t, pos: [focus[0] + side, up, focus[1] + back], target: [focus[0] + lead, 0, focus[1] - 0.4], ease: e };
  if (fov) k.fov = fov;
  return k;
}
