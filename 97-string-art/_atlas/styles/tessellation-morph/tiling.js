// styles/tessellation-morph/tiling.js — the gap-free morphing tile planner (pure: no THREE, no window, no DOM).
// Imported by style.js for the picture AND by scene.config.js (Node) for SCORE, so clicks and whooshes come from the
// same morph plan the wall is drawn from.
//
// The idea. A lattice cell is a parallelogram K, K+a, K+a+b, K+b. Its four sides are two PAIRS: the side along a and its
// copy shifted by b; the side along b and its copy shifted by a. Replace each pair by ONE curve (endpoints fixed on the
// lattice corners): whatever the curve pushes out of one side, the shifted copy cuts from the opposite side, so the
// cells still cover the plane exactly once — no gap, no overlap — whatever the curve is (as long as it does not cross
// itself or its partner). A "key shape" is therefore just two curves (edge a, edge b); morphing between key shapes is
// interpolating those two curves point by point. And because an edge is SHARED by the two tiles on either side, every
// edge may carry its own morph value (taken at the edge's midpoint from a field m(x, y, t)): the wall can show square ->
// fish -> bird in one frame, left to right, and it still never opens a gap.
import { clamp, lerp, smoothstep, toEase, hash01 } from "../../kit/time.js";

// ------------------------------------------------------------------------------------------------ curves
/**
 * sampleEdge(ctrl, per = 4) -> Float64Array of (ctrl.length - 1) * per + 1 points (x, y pairs).
 *   ctrl: [[x, y, corner?], ...] control points the curve passes through (first/last = the lattice corners).
 *   Catmull-Rom between points; a truthy third entry (and both ends) makes a sharp corner (one-sided tangents).
 *   Every key shape uses the SAME number of control points, so point k of one key corresponds to point k of the next.
 */
export function sampleEdge(ctrl, per = 4) {
  const n = ctrl.length - 1;
  const out = new Float64Array((n * per + 1) * 2);
  const corner = (i) => i === 0 || i === n || !!ctrl[i][2];
  const tan = (i, side, c) => {
    if (corner(i)) return side > 0 ? ctrl[i + 1][c] - ctrl[i][c] : ctrl[i][c] - ctrl[i - 1][c];
    return (ctrl[i + 1][c] - ctrl[i - 1][c]) / 2;
  };
  let w = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < per; k++) {
      const u = k / per, u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      for (let c = 0; c < 2; c++) out[w++] = h00 * ctrl[i][c] + h10 * tan(i, 1, c) + h01 * ctrl[i + 1][c] + h11 * tan(i + 1, -1, c);
    }
  }
  out[w++] = ctrl[n][0]; out[w++] = ctrl[n][1];
  return out;
}

const segHit = (ax, ay, bx, by, cx, cy, dx, dy) => {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
};
/** polygonCheck(flat) -> { simple, area }: O(n^2) self-intersection test + signed area (CCW > 0). */
export function polygonCheck(p) {
  const n = p.length / 2;
  let area = 0, simple = true;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; }
  for (let i = 0; i < n && simple; i++) {
    const i2 = (i + 1) % n;
    for (let j = i + 2; j < n; j++) {
      const j2 = (j + 1) % n;
      if (j2 === i) continue;
      if (segHit(p[2 * i], p[2 * i + 1], p[2 * i2], p[2 * i2 + 1], p[2 * j], p[2 * j + 1], p[2 * j2], p[2 * j2 + 1])) { simple = false; break; }
    }
  }
  return { simple, area: area / 2 };
}

// ------------------------------------------------------------------------------------------------ the tiling
/**
 * makeTiling({ a, b, keys, per = 4 }) -> tiling
 *   a, b: lattice vectors of a UNIT cell (e.g. [.5, -.5] and [.5, .5]: squares standing on a corner).
 *   keys: [{ id, a: ctrl, b: ctrl, details? }] key shapes in order of the morph value (key k sits at m = k). ctrl of
 *         edge a runs K -> K + a, of edge b K -> K + b, in cell units with K at the origin.
 *   tiling.n            segments per edge (every edge has n + 1 points; a tile outline has 4n)
 *   tiling.edge(kind, m, out, off, ox, oy, s)   write the n + 1 points of edge "a" (0) / "b" (1) at morph m
 *   tiling.outline(m)   Float64Array(8n): one whole tile at uniform m, CCW from K (K, .., K+a, .., K+a+b, .., K+b, ..)
 *   tiling.validate(step) -> { ok, area, worst: [...] }: every sampled m must give a simple polygon of the cell's area,
 *                       and the chord K -> K+a+b (the fold line of a flying tile) must split it into two simple halves.
 */
export function makeTiling({ a, b, keys, per = 4 }) {
  if (!keys?.length) throw new Error("tiling: no key shapes");
  const nc = keys[0].a.length;
  for (const k of keys) if (k.a.length !== nc || k.b.length !== nc) throw new Error(`tiling: key "${k.id}" needs ${nc} control points per edge`);
  const n = (nc - 1) * per;
  const samp = keys.map((k) => [sampleEdge(k.a, per), sampleEdge(k.b, per)]);
  const K = keys.length;
  function edge(kind, m, out, off = 0, ox = 0, oy = 0, s = 1) {
    const mm = clamp(m, 0, K - 1), k0 = Math.min(K - 2 < 0 ? 0 : K - 2, Math.floor(mm)), f = mm - k0;
    const A = samp[k0][kind], B = samp[Math.min(K - 1, k0 + 1)][kind];
    for (let q = 0; q <= n; q++) {
      out[off + 2 * q] = ox + s * (A[2 * q] + (B[2 * q] - A[2 * q]) * f);
      out[off + 2 * q + 1] = oy + s * (A[2 * q + 1] + (B[2 * q + 1] - A[2 * q + 1]) * f);
    }
    return out;
  }
  const ea = new Float64Array(2 * (n + 1)), eb = new Float64Array(2 * (n + 1));
  function outline(m, out = new Float64Array(8 * n)) {
    edge(0, m, ea); edge(1, m, eb);
    for (let q = 0; q < n; q++) {
      out[2 * q] = ea[2 * q]; out[2 * q + 1] = ea[2 * q + 1];                                             // K -> K+a
      out[2 * (n + q)] = a[0] + eb[2 * q]; out[2 * (n + q) + 1] = a[1] + eb[2 * q + 1];                       // K+a -> K+a+b
      out[2 * (2 * n + q)] = b[0] + ea[2 * (n - q)]; out[2 * (2 * n + q) + 1] = b[1] + ea[2 * (n - q) + 1];   // K+a+b -> K+b
      out[2 * (3 * n + q)] = eb[2 * (n - q)]; out[2 * (3 * n + q) + 1] = eb[2 * (n - q) + 1];               // K+b -> K
    }
    return out;
  }
  const cellArea = Math.abs(a[0] * b[1] - a[1] * b[0]);
  function validate(step = 0.05) {
    const worst = [];
    for (let m = 0; m <= K - 1 + 1e-9; m += step) {
      const o = outline(m), c = polygonCheck(o);
      const lower = o.slice(0, 2 * (2 * n + 1)), upper = new Float64Array(2 * (2 * n + 1));
      for (let q = 0; q <= 2 * n; q++) { const r = (2 * n + q) % (4 * n); upper[2 * q] = o[2 * r]; upper[2 * q + 1] = o[2 * r + 1]; }
      const lo = polygonCheck(lower), up = polygonCheck(upper);
      const ok = c.simple && Math.abs(c.area - cellArea) < 1e-6 && lo.simple && up.simple && lo.area > 0 && up.area > 0;
      if (!ok) worst.push({ m: +m.toFixed(3), simple: c.simple, area: +c.area.toFixed(5), lower: lo.simple && lo.area > 0, upper: up.simple && up.area > 0 });
    }
    return { ok: worst.length === 0, area: cellArea, worst };
  }
  return { a, b, keys, per, n, keyCount: K, edge, outline, validate, cellArea };
}

/** detailWeight(k, m, { lo = .72, hi = .97 }) -> 0..1: how present key k's eyes / marks are at morph value m. */
export const detailWeight = (k, m, { lo = 0.72, hi = 0.97 } = {}) => smoothstep(lo, hi, 1 - Math.abs(m - k));

// ------------------------------------------------------------------------------------------------ the morph field
const stopsAt = (stops, x) => {
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const u = (x - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return lerp(stops[i - 1][1], stops[i][1], u * u * (3 - 2 * u));
    }
  }
  return stops[stops.length - 1][1];
};
/**
 * makeField({ start = 0, stages }) -> m(x, y, t)
 *   stages (in time order): { t0, dur, to, ease = "inOutCubic", sweep?: { dir: [dx, dy], per, from: [x, y] } }
 *     to: a number (every tile goes to that key) or { stops: [[x, m], ...], slide?: { t0, dur, dx, ease } } — a
 *         left-to-right gradient of morph values (smooth between stops); `slide` then moves the whole gradient by dx.
 *     sweep: the stage starts later the further a point lies along `dir` from `from` (per = seconds per metre), so a
 *         change rolls across the wall instead of happening everywhere at once.
 *   m is a pure function of (x, y, t): stage k blends whatever the earlier stages give toward its own target.
 */
export function makeField({ start = 0, stages = [] }) {
  const S = stages.map((s) => ({ ...s, e: toEase(s.ease ?? "inOutCubic"), se: s.to?.slide ? toEase(s.to.slide.ease ?? "inOutCubic") : null }));
  const delay = (s, x, y) => (s.sweep ? Math.max(0, ((x - s.sweep.from[0]) * s.sweep.dir[0] + (y - s.sweep.from[1]) * s.sweep.dir[1]) * s.sweep.per) : 0);
  const target = (s, x, t) => {
    if (typeof s.to === "number") return s.to;
    const sl = s.to.slide;
    const dx = sl ? sl.dx * s.se(clamp((t - sl.t0) / sl.dur)) : 0;
    return stopsAt(s.to.stops, x - dx);
  };
  const m = (x, y, t) => {
    let v = start;
    for (const s of S) {
      const u = (t - s.t0 - delay(s, x, y)) / s.dur;
      if (u <= 0) continue;
      v = lerp(v, target(s, x, t), s.e(clamp(u)));
    }
    return v;
  };
  m.stages = S; m.delay = delay; m.target = target;
  return m;
}

// ------------------------------------------------------------------------------------------------ the wall plan
const bump = (u) => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u));
/**
 * planWall({ tiling, size, bounds, field, taps, press, heights, flight, binHz }) -> plan
 *   size: metres per cell unit. bounds: { x0, x1, y0, y1 } — every tile whose centre lies inside is built.
 *   field: makeField options (the morph schedule).
 *   press: [{ t0, from: [x, y], speed, depth, dur }] ripples that press tiles in one after another (a click each).
 *   taps: { depth, dur } — every tile also dips once when a stage with `tap: true` finishes on it (it "clicks home").
 *   heights: [h0, h1] tile thickness for the two colours (parity 0 / 1).
 *   flight: { rowY, xMin, xMax, t0, stagger, order: "rtl"|"ltr", lift: { dur, h }, vel: [vx, vy, vz], ramp, flap: { hz, amp, base },
 *             climb, yaw, bob } — the tiles of one row leave the wall one after another (closed-form pose, see poseAt).
 *
 *   plan.tiles[i] = { i, j, kx, ky (corner K, metres), cx, cy (centre), parity, ea, eb1, ea1, eb (edge indices), flight }
 *   plan.edges[e] = { kind, ox, oy, mx, my }
 *   plan.frame(t) -> { edgePts, tileM, tileZ } (typed arrays rewritten from t on every call — no state carried over)
 *   plan.poseAt(tile, t) -> null | { x, y, z, yaw, pitch, roll, flap, s } for a flying tile
 *   plan.events() -> [{ t, kind, ... }] for kit scoreFromEvents (kinds: morph, slide, tap, eye, lift, flap)
 */
export function planWall(o) {
  const { tiling, size = 2, bounds, binHz = 16 } = o;
  const { a, b, n } = tiling;
  const m = makeField(o.field ?? {});
  const heights = o.heights ?? [0.12, 0.2];
  const P = (i, j) => [(i * a[0] + j * b[0]) * size, (i * a[1] + j * b[1]) * size];
  // lattice index range that can reach the bounds
  const det = a[0] * b[1] - a[1] * b[0];
  const inv = (x, y) => [(x * b[1] - y * b[0]) / det / size, (a[0] * y - a[1] * x) / det / size];
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  for (const [x, y] of [[bounds.x0, bounds.y0], [bounds.x1, bounds.y0], [bounds.x0, bounds.y1], [bounds.x1, bounds.y1]]) {
    const [i, j] = inv(x, y);
    i0 = Math.min(i0, Math.floor(i) - 1); i1 = Math.max(i1, Math.ceil(i) + 1); j0 = Math.min(j0, Math.floor(j) - 1); j1 = Math.max(j1, Math.ceil(j) + 1);
  }
  const edges = [], edgeIx = new Map();
  const edgeOf = (kind, i, j) => {
    const key = `${kind}:${i}:${j}`;
    let e = edgeIx.get(key);
    if (e === undefined) {
      const [ox, oy] = P(i, j), d = kind ? b : a;
      e = edges.length; edgeIx.set(key, e);
      edges.push({ kind, ox, oy, mx: ox + (d[0] * size) / 2, my: oy + (d[1] * size) / 2 });
    }
    return e;
  };
  const tiles = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const [kx, ky] = P(i, j);
    const cx = kx + ((a[0] + b[0]) * size) / 2, cy = ky + ((a[1] + b[1]) * size) / 2;
    if (cx < bounds.x0 || cx > bounds.x1 || cy < bounds.y0 || cy > bounds.y1) continue;
    tiles.push({ index: tiles.length, i, j, kx, ky, cx, cy, parity: (((i + j) % 2) + 2) % 2, ea: edgeOf(0, i, j), eb1: edgeOf(1, i + 1, j), ea1: edgeOf(0, i, j + 1), eb: edgeOf(1, i, j), flight: null });
  }

  // ---- taps: when each tile dips (press ripples + "clicks home" at the end of tap stages)
  const TAP = { depth: 0.035, dur: 0.26, ...(o.taps ?? {}) };
  const tapList = tiles.map(() => []);
  for (const pr of o.press ?? []) {
    tiles.forEach((T, k) => tapList[k].push({ t: pr.t0 + Math.hypot(T.cx - pr.from[0], T.cy - pr.from[1]) / pr.speed, depth: pr.depth ?? TAP.depth, dur: pr.dur ?? TAP.dur, kind: "press" }));
  }
  m.stages.forEach((s, si) => {
    if (!s.tap) return;
    tiles.forEach((T, k) => tapList[k].push({ t: s.t0 + m.delay(s, T.cx, T.cy) + s.dur * (s.tapAt ?? 0.94), depth: TAP.depth, dur: TAP.dur, kind: "home", stage: si }));
  });

  // ---- flight: one row of tiles leaves the wall
  const F = o.flight ? { stagger: 0.25, order: "rtl", lift: { dur: 0.55, h: 0.7 }, vel: [1.6, 0.7, 1.2], ramp: 0.8, flap: { hz: 2.6, amp: 0.55, base: 0.2 }, climb: 0.25, yaw: 0.2, bob: 0.08, ...o.flight } : null;
  const flyers = [];
  if (F) {
    const row = tiles.filter((T) => Math.abs(T.cy - F.rowY) < 1e-6 && T.cx >= F.xMin && T.cx <= F.xMax).sort((p, q) => (F.order === "rtl" ? q.cx - p.cx : p.cx - q.cx));
    row.forEach((T, k) => { T.flight = { t0: F.t0 + k * F.stagger, k, phase: hash01(T.i, T.j, 93) * 6.283 }; flyers.push(T); });
  }
  function poseAt(T, t) {
    const fl = T.flight;
    if (!fl || t <= fl.t0) return null;
    const s = t - fl.t0;
    const lu = clamp(s / F.lift.dur), lift = 1 - (1 - lu) ** 3;
    const s2 = Math.max(0, s - F.lift.dur * 0.5), g = (s2 * s2) / (s2 + F.ramp);          // smooth start, then ~constant speed
    const on = smoothstep(0, F.lift.dur * 1.4, s);
    const ph = 6.283185307 * F.flap.hz * s + fl.phase;
    return {
      s, x: F.vel[0] * g, y: F.vel[1] * g + F.bob * on * Math.sin(ph - 1.2), z: F.lift.h * lift + F.vel[2] * g,
      yaw: F.climb * smoothstep(0.1, 1.2, s2), pitch: -F.yaw * smoothstep(0.1, 1.4, s2), roll: 0.06 * on * Math.sin(ph * 0.5),
      flap: on * (F.flap.base + F.flap.amp * Math.sin(ph)),
    };
  }

  // ---- per-frame numbers (buffers are rewritten completely from t)
  const E = edges.length, edgePts = new Float32Array(E * (n + 1) * 2), tileM = new Float32Array(tiles.length), tileZ = new Float32Array(tiles.length);
  const tmp = new Float64Array((n + 1) * 2);
  function frame(t) {
    for (let e = 0; e < E; e++) {
      const ed = edges[e];
      tiling.edge(ed.kind, m(ed.mx, ed.my, t), tmp, 0, ed.ox, ed.oy, size);
      edgePts.set(tmp, e * (n + 1) * 2);
    }
    for (let k = 0; k < tiles.length; k++) {
      const T = tiles[k];
      tileM[k] = m(T.cx, T.cy, t);
      let z = 0;
      for (const tp of tapList[k]) z -= tp.depth * bump((t - tp.t) / tp.dur);
      tileZ[k] = z;
    }
    return { edgePts, tileM, tileZ };
  }
  /** ringPoint(T, q, edgePts, out): point q (0..4n-1) of tile T's outline, CCW from K. */
  const EP = (n + 1) * 2;
  function ring(T, pts, out) {
    for (let q = 0; q < n; q++) {
      out[2 * q] = pts[T.ea * EP + 2 * q]; out[2 * q + 1] = pts[T.ea * EP + 2 * q + 1];
      out[2 * (n + q)] = pts[T.eb1 * EP + 2 * q]; out[2 * (n + q) + 1] = pts[T.eb1 * EP + 2 * q + 1];
      out[2 * (2 * n + q)] = pts[T.ea1 * EP + 2 * (n - q)]; out[2 * (2 * n + q) + 1] = pts[T.ea1 * EP + 2 * (n - q) + 1];
      out[2 * (3 * n + q)] = pts[T.eb * EP + 2 * (n - q)]; out[2 * (3 * n + q) + 1] = pts[T.eb * EP + 2 * (n - q) + 1];
    }
    return out;
  }

  // ---- events for the score
  function events(view = bounds) {
    const ev = [];
    const seen = (T) => T.cx >= view.x0 && T.cx <= view.x1 && T.cy >= view.y0 && T.cy <= view.y1;
    m.stages.forEach((s, si) => {
      let dmax = 0;
      for (const T of tiles) if (seen(T)) dmax = Math.max(dmax, m.delay(s, T.cx, T.cy));
      ev.push({ t: s.t0, kind: "morph", dur: s.dur + dmax, stage: si, to: typeof s.to === "number" ? s.to : -1 });
      if (s.to?.slide) ev.push({ t: s.to.slide.t0, kind: "slide", dur: s.to.slide.dur, stage: si });
    });
    const bins = new Map();
    tiles.forEach((T, k) => { if (seen(T)) for (const tp of tapList[k]) { const bq = Math.round(tp.t * binHz); const c = bins.get(bq) ?? { n: 0, x: 0, home: 0 }; c.n++; c.x += T.cx; if (tp.kind === "home") c.home++; bins.set(bq, c); } });
    for (const [bq, c] of [...bins.entries()].sort((p, q) => p[0] - q[0])) ev.push({ t: bq / binHz, kind: "tap", count: c.n, x: c.x / c.n, home: c.home / c.n });
    for (const T of flyers) {
      ev.push({ t: T.flight.t0, kind: "lift", k: T.flight.k, x: T.cx });
      for (let q = 0; q < 12; q++) {                                    // one soft flutter per down-stroke (flap sine peak)
        const tf = T.flight.t0 + (Math.PI / 2 - T.flight.phase + 6.283185307 * q) / (6.283185307 * F.flap.hz);
        if (tf > T.flight.t0 + F.lift.dur * 0.6 && tf < (o.duration ?? 1e9)) ev.push({ t: tf, kind: "flap", k: T.flight.k, x: T.cx });
      }
    }
    return ev.sort((p, q) => p.t - q.t);
  }
  const stats = { tiles: tiles.length, edges: E, pointsPerTile: 4 * n, flyers: flyers.length };
  return { tiling, size, bounds, tiles, edges, n, field: m, heights, flight: F, flyers, frame, ring, poseAt, events, stats, mAt: m };
}

/** voices for kit scoreFromEvents, from spec.sound */
export function tilingVoices(S) {
  return {
    morph: (e) => [{ type: "whoosh", dir: "in", dur: Math.max(0.5, e.dur), gain: S.morph.gain, q: S.morph.q, pitch: S.morph.pitch * (1 + 0.12 * Math.max(0, e.to)) }],
    slide: (e) => [{ type: "whoosh", dir: "out", dur: Math.max(0.5, e.dur), gain: S.slide.gain, pitch: S.slide.pitch }],
    tap: (e) => [{ type: "click", gain: Math.min(S.tap.max, S.tap.gain * Math.sqrt(e.count)), pitch: lerp(S.tap.pressPitch, S.tap.homePitch, e.home), dur: 0.03 }],
    lift: (e) => [
      { type: "pop", gain: S.lift.gain, pitch: S.lift.pitch * (1 + 0.07 * e.k) },
      { type: "paper", gain: S.lift.rustle, dur: 0.4, density: 0.5 },
      ...(e.k === 0 ? [{ type: "chime", gain: S.lift.chime, dur: 1.6, notes: 5 }] : []),
    ],
    flap: () => [{ type: "paper", gain: S.flap.gain, dur: 0.16, density: 0.7 }],
  };
}
