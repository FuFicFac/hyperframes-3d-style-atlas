// styles/hanging-mobile/balance.js — the balance planner for "Hanging Mobile". Pure: no THREE, no window, no DOM.
// Imported by style.js (the picture) AND by scene.config.js (SCORE, camera targets), so sound and picture read one plan.
//
// Model (all closed form, every value a pure function of t):
//   A mobile is a tree of ARMS. An arm is a straight wire of length `len`; LOADS hang from points `at` (0..1 along
//   the wire) on threads of length `drop`; a load is a SHAPE (flat sheet-metal plate) or another ARM. Each arm hangs
//   from its own thread at a pivot `p` (metres from the wire's left end). The pivot loop sits `h` above the wire's
//   load line (a stirrup), which is what makes a tilted arm come to rest instead of tipping over.
//   Weight of a shape = area (shoelace of its outline) x sheet density x scale^2. Weight of an arm = wire + subtree.
//   Balance point  p* = sum(w_i x_i) / sum(w_i)  (wire mass at len/2 included).
//   Rest tilt (torque balance of the stirrup arm):  tan(theta*) = (p - p*) / h ; theta > 0 = counter-clockwise
//   (right end up) seen from the front. `gain` scales it for calmer pictures (1 = the plain physics).
//   Every change of a weight or a pivot changes theta* of that arm AND of every ancestor (subtree weights), so
//   "hang one thing and everything shifts" falls out of the maths.
//   Swing: theta(t) = theta*(-inf) + sum_k dTheta_k * S(t - t_k), the superposition of closed-form damped steps
//   (kit `spring`) over every change instant (ramps are split into `steps` stairs). Linear oscillator => exact.
//   Re-balance: the pivot loop slides along the wire to the new p* (eased), so theta* returns to 0 and the arm
//   swings back to level. Yaw: each arm turns slowly about its own thread: yaw = base + rate t + swing sin(...).
//
// API
//   shapeOutline(shape) -> [[x, y], ...] CCW (kinds: disc, leaf, crescent, triangle, custom, plus kidney, petal)
//   shapeInfo(shape, { density, inset }) -> { pts (hang frame: hole at origin, centroid straight below), area, weight0,
//       centroid, bottom: [x, y] (lowest point = tag hole), minY, maxY, minX, maxX }
//   planMobile(spec, events = [], knobs = {}) -> plan
//     spec  = { id, len, h?, pivot?: "solve"|0..1, yaw?: {base, rate, swing, period, phase}, loads: [Load] } (the root arm)
//     Load  = { id?, at: 0..1, drop: m, shape?: Shape, arm?: Arm }   Shape = { id, kind, color, tag?, face?, yaw?, ...dims }
//     events: { t, kind: "hang", arm, load: Load, dur? } | { t, kind: "remove", shape|arm, dur? }
//           | { t, kind: "weight", shape, scale, dur?, ease? } | { t, kind: "rebalance", arm, dur?, ease? }
//       hang/remove/weight accept `rebalance: { delay, dur, stagger } | true`: adds rebalance events for the
//       changed arm and every ancestor (deepest first, `stagger` apart) — the classic "find the new centre".
//     plan.armAt(id, t)   -> { p, pStar, target, tilt, dtilt, yaw, weight }
//     plan.loadAt(id, t)  -> { present (weight on), shown (0..1 visible), L (current thread length), lag (rad) }
//     plan.shapeAt(id, t) -> { scale, yaw, weight }
//     plan.pose(t)        -> world-ish transforms with the ROOT PIVOT at [0,0,0]: { arms: {id: {pivot, ends}}, shapes: {id: {hole, centroid, box}} }
//     plan.events         -> sound/picture events [{ t, kind: "spool"|"hook"|"lift"|"grow"|"slide"|"swing"|"settle", ... }]
//     plan.bounds(t0, t1, dt) -> { min, max } of every shape corner over a window (for framing)
import { clamp, lerp, toEase, TAU } from "../../kit/time.js";

export const BALANCE_DEFAULTS = {
  density: 1.0,          // sheet weight per m^2 (only ratios matter)
  wireDensity: 0.05,     // wire weight per metre
  h: 0.14,               // default stirrup height (m): bigger = stiffer arm, smaller tilts
  gain: 0.28,            // visual tilt gain (1 = plain physics)
  maxTilt: 0.6,          // soft limit (rad) through tanh, keeps silly specs on screen
  period: 2.0,           // swing period (s) of a 1.5 m arm; scales with sqrt(len / 1.5)
  zeta: 0.2,             // damping ratio of the swing
  lag: 0.22,             // thread pendulum lag: hanger leans by -lag x (parent angular velocity)
  inset: 0.035,          // hang hole inset from the outline (m)
  steps: 10,             // stairs per ramp (weight change, pivot slide)
  hang: { dur: 0.9 },    // spool-out of a newly hung load (weight lands at the end)
  remove: { dur: 0.7 },
  weight: { dur: 0.6, ease: "inOutCubic" },
  rebalance: { delay: 2.0, dur: 1.0, ease: "inOutSine", stagger: 0.35 },
  swingSound: { min: 0.035, max: 3 },     // rad: swing extremes below min are silent; max extremes per change
  settle: 0.05,          // rad: |theta - theta*| stays below this for a full period after a slide = "settled"
};

// ------------------------------------------------------------------ 2D outline maths
export function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
export function polyCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], c = p[0] * q[1] - q[0] * p[1];
    a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c;
  }
  return [cx / (3 * a), cy / (3 * a)];
}
const rot2 = (p, a, o = [0, 0]) => {
  const c = Math.cos(a), s = Math.sin(a), x = p[0] - o[0], y = p[1] - o[1];
  return [o[0] + x * c - y * s, o[1] + x * s + y * c];
};
const ccw = (pts) => (polyArea(pts) < 0 ? pts.slice().reverse() : pts);

/** shapeOutline(shape) -> CCW polygon in metres (shape's own frame, roughly centred). */
export function shapeOutline(s) {
  const k = s.kind ?? "disc";
  let pts = [];
  if (k === "disc") {
    const r = s.r ?? 0.3, n = s.segments ?? 64;
    for (let i = 0; i < n; i++) pts.push([Math.cos((i / n) * TAU) * r, Math.sin((i / n) * TAU) * r]);
  } else if (k === "leaf" || k === "petal") {
    // pointed ellipse with a fuller belly on one side; `bend` curls the tip
    const L = s.len ?? 0.7, W = s.w ?? 0.3, n = 36, belly = s.belly ?? 0.75, bend = s.bend ?? 0.12, pw = k === "petal" ? 0.6 : 0.9;
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push([L * (u - 0.5), (W / 2) * Math.sin(Math.PI * u) ** pw + bend * L * (u - 0.5) ** 2]); }
    for (let i = n - 1; i > 0; i--) { const u = i / n; pts.push([L * (u - 0.5), -(W / 2) * belly * Math.sin(Math.PI * u) ** pw + bend * L * (u - 0.5) ** 2]); }
  } else if (k === "crescent") {
    // outer circle r at the origin minus an inner circle (cut x r) shifted right by shift x r
    const r = s.r ?? 0.35, ri = r * (s.cut ?? 0.8), d = r * (s.shift ?? 0.42), n = 40;
    const x = (r * r - ri * ri + d * d) / (2 * d), y = Math.sqrt(Math.max(1e-9, r * r - x * x));
    const a = Math.atan2(y, x), b = Math.atan2(y, x - d);
    for (let i = 0; i <= n; i++) { const th = a + (i / n) * (TAU - 2 * a); pts.push([Math.cos(th) * r, Math.sin(th) * r]); }
    for (let i = 1; i < n; i++) { const th = TAU - b - (i / n) * (TAU - 2 * b); pts.push([d + Math.cos(th) * ri, Math.sin(th) * ri]); }
  } else if (k === "triangle") {
    const w = s.w ?? 0.5, h = s.h ?? 0.5, sk = s.skew ?? 0;
    pts = [[-w / 2, -h / 3], [w / 2, -h / 3], [sk * w, (2 * h) / 3]];
    if (s.round) { // softly rounded corners (sheet is cut, not punched)
      const out = [], r = s.round;
      for (let i = 0; i < 3; i++) {
        const p = pts[i], a = pts[(i + 2) % 3], b = pts[(i + 1) % 3];
        const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
        const A = [p[0] + ((a[0] - p[0]) / da) * r, p[1] + ((a[1] - p[1]) / da) * r], B = [p[0] + ((b[0] - p[0]) / db) * r, p[1] + ((b[1] - p[1]) / db) * r];
        for (let j = 0; j <= 4; j++) { const u = j / 4, m = [lerp(A[0], p[0], 1 - u), lerp(A[1], p[1], 1 - u)], q = [lerp(p[0], B[0], u), lerp(p[1], B[1], u)]; out.push([lerp(m[0], q[0], u), lerp(m[1], q[1], u)]); }
      }
      pts = out;
    }
  } else if (k === "kidney") {
    const r = s.r ?? 0.3, n = 64, dent = s.dent ?? 0.28;
    for (let i = 0; i < n; i++) { const th = (i / n) * TAU, rr = r * (1 - dent * Math.max(0, Math.cos(th - Math.PI / 2)) ** 3) * (1 + 0.18 * Math.cos(th)); pts.push([Math.cos(th) * rr * 1.25, Math.sin(th) * rr]); }
  } else if (k === "custom") {
    pts = (s.pts ?? []).map((p) => [p[0], p[1]]);
  } else throw new Error(`hanging-mobile: unknown shape kind "${k}"`);
  if (s.rot) pts = pts.map((p) => rot2(p, s.rot));
  return ccw(pts);
}

/**
 * shapeInfo(shape, { density, inset }) -> outline in the HANG frame: the hole (default: the topmost point, inset
 * toward the centroid) at the origin and the plate rotated so its centroid hangs straight below it — the way a
 * real plate hangs from one hole. `shape.hole = [x, y]` (in the shape frame) overrides the hole.
 */
export function shapeInfo(s, o = {}) {
  const density = (o.density ?? BALANCE_DEFAULTS.density) * (s.gauge ?? 1);
  const inset = o.inset ?? BALANCE_DEFAULTS.inset;
  const pts0 = shapeOutline(s);
  const area = polyArea(pts0), c0 = polyCentroid(pts0);
  let hole = s.hole;
  if (!hole) {
    const top = pts0.reduce((m, p) => (p[1] > m[1] ? p : m), pts0[0]);
    const dx = c0[0] - top[0], dy = c0[1] - top[1], d = Math.hypot(dx, dy) || 1;
    hole = [top[0] + (dx / d) * inset, top[1] + (dy / d) * inset];
  }
  const v = [c0[0] - hole[0], c0[1] - hole[1]];
  const turn = -Math.PI / 2 - Math.atan2(v[1], v[0]);
  const pts = pts0.map((p) => { const q = rot2(p, turn, hole); return [q[0] - hole[0], q[1] - hole[1]]; });
  const c = rot2(c0, turn, hole);
  const centroid = [c[0] - hole[0], c[1] - hole[1]];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, bottom = pts[0];
  for (const p of pts) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    if (p[1] < bottom[1]) bottom = p;
  }
  // tag hole: on the plumb line through the hole (x = 0, where the centroid hangs), just inside the lowest edge
  // crossing it, so a tag thread hangs straight down from the plate's visual bottom
  let low = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a[0] <= 0) !== (b[0] <= 0)) { const y = a[1] + ((0 - a[0]) / (b[0] - a[0])) * (b[1] - a[1]); low = Math.min(low, y); }
  }
  if (!Number.isFinite(low)) low = bottom[1];
  const tb = [0, low + inset];
  return { pts, area, weight0: area * density, centroid, hole: [0, 0], bottom: tb, minX, maxX, minY, maxY, turn };
}

// ------------------------------------------------------------------ tiny rigid transforms (R row-major 3x3, o)
const I3 = () => ({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], o: [0, 0, 0] });
const Ry = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const Rz = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const mul3 = (A, B) => { const C = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return C; };
const app3 = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
const xf = (T, local) => { const r = app3(T.R, local); return [T.o[0] + r[0], T.o[1] + r[1], T.o[2] + r[2]]; };
const translate = (T, v) => ({ R: T.R, o: xf(T, v) });
const rotate = (T, R) => ({ R: mul3(T.R, R), o: T.o });

/** closed-form damped step (0 -> 1) and its derivative; zeta < 1 */
function stepS(tau, w0, z) {
  if (tau <= 0) return 0;
  const wd = w0 * Math.sqrt(1 - z * z), e = Math.exp(-z * w0 * tau);
  return 1 - e * (Math.cos(wd * tau) + ((z * w0) / wd) * Math.sin(wd * tau));
}
function stepD(tau, w0, z) {
  if (tau <= 0) return 0;
  const wd = w0 * Math.sqrt(1 - z * z);
  return ((w0 * w0) / wd) * Math.exp(-z * w0 * tau) * Math.sin(wd * tau);
}

// ------------------------------------------------------------------ the planner
export function planMobile(rootSpec, eventsIn = [], knobs = {}) {
  const K = { ...BALANCE_DEFAULTS, ...knobs };
  for (const k of ["hang", "remove", "weight", "rebalance", "swingSound"]) K[k] = { ...BALANCE_DEFAULTS[k], ...(knobs[k] ?? {}) };
  const arms = new Map(), shapes = new Map(), loads = new Map();
  let autoId = 0;

  // ---- flatten the nested spec (initial loads: present from -inf)
  function addArm(a, parentLoad) {
    if (!a.id) a = { ...a, id: `arm${autoId++}` };
    if (arms.has(a.id)) throw new Error(`hanging-mobile: duplicate arm id ${a.id}`);
    const len = a.len ?? 1.5;
    const node = {
      id: a.id, kind: "arm", len, h: a.h ?? K.h, spec: a, parentLoad, loads: [],
      w0: TAU / ((a.period ?? K.period) * Math.sqrt(len / 1.5)), zeta: a.zeta ?? K.zeta,
      yaw: { base: 0, rate: 0, swing: 0, period: 24, phase: 0, ...(a.yaw ?? {}) },
      wire: len * (a.wireDensity ?? K.wireDensity), pivotMode: a.pivot ?? "solve", slides: [],
    };
    arms.set(a.id, node);
    (a.loads ?? []).forEach((l) => addLoad(node, l, -Infinity));
    return node;
  }
  function addLoad(arm, l, from) {
    const id = l.id ?? `${arm.id}.L${arm.loads.length}`;
    const load = { id, arm, at: l.at ?? 0.5, drop: l.drop ?? 0.4, from, landAt: from, until: Infinity, liftDur: K.remove.dur, hangDur: K.hang.dur, child: null };
    if (Number.isFinite(from)) { load.hangDur = l.dur ?? K.hang.dur; load.landAt = from + load.hangDur; }
    if (l.shape) {
      const s = l.shape, sid = s.id ?? `${id}.S`;
      const info = shapeInfo(s, { density: K.density, inset: K.inset });
      const shape = { id: sid, kind: "shape", spec: { ...s, id: sid }, info, load, scales: [], yaw: { base: s.face ?? 0, rate: 0, swing: 0, period: 18, phase: 0, ...(s.yaw ?? {}) } };
      shapes.set(sid, shape);
      load.child = shape;
    } else if (l.arm) {
      load.child = addArm(l.arm, load);
    } else throw new Error(`hanging-mobile: load ${id} has neither shape nor arm`);
    loads.set(id, load);
    arm.loads.push(load);
    return load;
  }
  const root = addArm(rootSpec, null);

  // ---- events
  const events = [...eventsIn].sort((a, b) => a.t - b.t);
  const ancestors = (armNode) => { const out = []; let a = armNode; while (a) { out.push(a); a = a.parentLoad?.arm ?? null; } return out; };
  const soundEvents = [];
  const ramps = [];       // [t0, t1] windows where weights/pivots move continuously
  const instants = [];    // instantaneous weight changes
  const autoRebalance = [];
  for (const e of events) {
    let changedArm = null, tChange = e.t;
    if (e.kind === "hang") {
      const arm = arms.get(e.arm);
      if (!arm) throw new Error(`hanging-mobile: hang onto unknown arm ${e.arm}`);
      const load = addLoad(arm, { ...e.load, dur: e.dur ?? e.load.dur }, e.t);
      instants.push(load.landAt);
      soundEvents.push({ t: e.t, kind: "spool", arm: arm.id, load: load.id, dur: load.hangDur });
      soundEvents.push({ t: load.landAt, kind: "hook", arm: arm.id, load: load.id, weight: subtreeW0(load.child) });
      changedArm = arm; tChange = load.landAt;
    } else if (e.kind === "remove") {
      const target = e.shape ? shapes.get(e.shape)?.load : arms.get(e.arm)?.parentLoad;
      if (!target) throw new Error(`hanging-mobile: remove of unknown ${e.shape ?? e.arm}`);
      target.until = e.t; target.liftDur = e.dur ?? K.remove.dur;
      instants.push(e.t);
      soundEvents.push({ t: e.t, kind: "lift", arm: target.arm.id, load: target.id, dur: target.liftDur });
      changedArm = target.arm;
    } else if (e.kind === "weight") {
      const sh = shapes.get(e.shape);
      if (!sh) throw new Error(`hanging-mobile: weight change on unknown shape ${e.shape}`);
      const dur = e.dur ?? K.weight.dur;
      sh.scales.push({ t: e.t, dur, to: e.scale, ease: toEase(e.ease ?? K.weight.ease) });
      ramps.push([e.t, e.t + dur]);
      soundEvents.push({ t: e.t, kind: "grow", shape: sh.id, arm: sh.load.arm.id, dur, factor: e.scale });
      changedArm = sh.load.arm; tChange = e.t + dur;
    } else if (e.kind === "rebalance") {
      autoRebalance.push({ t: e.t, arm: e.arm, dur: e.dur ?? K.rebalance.dur, ease: e.ease ?? K.rebalance.ease });
    }
    if (changedArm && e.rebalance) {
      const R = { ...K.rebalance, ...(e.rebalance === true ? {} : e.rebalance) };
      ancestors(changedArm).forEach((a, i) => autoRebalance.push({ t: tChange + R.delay + i * R.stagger, arm: a.id, dur: R.dur, ease: R.ease }));
    }
  }
  function subtreeW0(n) { return n.kind === "shape" ? n.info.weight0 : n.wire + n.loads.reduce((s, l) => s + subtreeW0(l.child), 0); }

  // ---- weights (pure functions of t)
  function scaleAt(sh, t) {
    let s = sh.spec.scale ?? 1;
    for (const k of sh.scales) { if (t <= k.t) break; s = lerp(s, k.to, k.ease(clamp((t - k.t) / k.dur))); }
    return s;
  }
  const loadOn = (l, t) => t >= l.landAt && t < l.until;
  function weightOf(n, t) {
    if (n.kind === "shape") { const s = scaleAt(n, t); return n.info.weight0 * s * s; }
    let w = n.wire;
    for (const l of n.loads) if (loadOn(l, t)) w += weightOf(l.child, t);
    return w;
  }
  function balancePoint(a, t) {
    let W = a.wire, M = a.wire * a.len / 2;
    for (const l of a.loads) if (loadOn(l, t)) { const w = weightOf(l.child, t); W += w; M += w * l.at * a.len; }
    return M / W;
  }

  // ---- pivots: initial solve, then slides (sorted per arm); slide target = balance point at the slide's end
  for (const a of arms.values()) a.p0 = a.pivotMode === "solve" ? balancePoint(a, -1e9) : a.pivotMode * a.len;
  autoRebalance.sort((x, y) => x.t - y.t);
  for (const r of autoRebalance) {
    const a = arms.get(r.arm);
    if (!a) throw new Error(`hanging-mobile: rebalance of unknown arm ${r.arm}`);
    a.slides.push({ t: r.t, dur: r.dur, ease: toEase(r.ease), to: null });
    ramps.push([r.t, r.t + r.dur]);
  }
  for (const a of arms.values()) {
    for (const s of a.slides) s.to = balancePoint(a, s.t + s.dur + 1e-6);
  }
  function pivotAt(a, t) {
    let p = a.p0;
    for (const s of a.slides) { if (t <= s.t) break; p = lerp(p, s.to, s.ease(clamp((t - s.t) / s.dur))); }
    return p;
  }
  const softTilt = (x) => K.maxTilt * Math.tanh(x / K.maxTilt);
  const targetAt = (a, t) => softTilt(Math.atan((K.gain * (pivotAt(a, t) - balancePoint(a, t))) / a.h));

  // ---- change instants -> per-arm staircase of target changes
  const T = [];
  for (const ti of instants) T.push(ti - 1e-4, ti + 1e-4);
  for (const [t0, t1] of ramps) for (let j = 0; j <= K.steps; j++) T.push(t0 + ((t1 - t0) * j) / K.steps);
  T.sort((x, y) => x - y);
  const TT = T.filter((x, i) => i === 0 || x - T[i - 1] > 1e-7);
  for (const a of arms.values()) {
    a.th0 = targetAt(a, -1e9);
    a.kicks = [];
    let prev = a.th0;
    for (let j = 0; j < TT.length; j++) {
      const v = targetAt(a, TT[j]);
      const d = v - prev;
      if (Math.abs(d) > 1e-7) a.kicks.push({ t: j ? (TT[j - 1] + TT[j]) / 2 : TT[j], d });
      prev = v;
    }
  }
  function tiltAt(a, t) {
    let th = a.th0, dth = 0;
    for (const k of a.kicks) { if (t <= k.t) break; th += k.d * stepS(t - k.t, a.w0, a.zeta); dth += k.d * stepD(t - k.t, a.w0, a.zeta); }
    return { tilt: th, dtilt: dth };
  }
  const yawOf = (y, t) => y.base + y.rate * t + y.swing * Math.sin((TAU * t) / y.period + y.phase);

  // ---- public samplers
  function armAt(id, t) {
    const a = typeof id === "string" ? arms.get(id) : id;
    const { tilt, dtilt } = tiltAt(a, t);
    return { p: pivotAt(a, t), pStar: balancePoint(a, t), target: targetAt(a, t), tilt, dtilt, yaw: yawOf(a.yaw, t), weight: weightOf(a, t) };
  }
  function loadAt(id, t) {
    const l = typeof id === "string" ? loads.get(id) : id;
    let shown = 1, L = l.drop;
    if (Number.isFinite(l.from)) {
      if (t < l.from) { shown = 0; L = 0; }
      else { const u = clamp((t - l.from) / l.hangDur); shown = clamp(u / 0.25); L = l.drop * (1 - (1 - u) ** 3) + 0.04 * Math.sin(Math.PI * u) * (1 - u); }
    }
    if (t >= l.until) { const u = clamp((t - l.until) / l.liftDur); shown *= 1 - clamp((u - 0.55) / 0.45); L = lerp(L, 0, toEase("inCubic")(u)); }
    const lag = -K.lag * tiltAt(l.arm, t).dtilt;
    return { present: loadOn(l, t), shown, L: Math.max(0, L), lag };
  }
  function shapeAt(id, t) {
    const s = typeof id === "string" ? shapes.get(id) : id;
    return { scale: scaleAt(s, t), yaw: yawOf(s.yaw, t), weight: weightOf(s, t) };
  }

  /** pose(t): transforms with the root pivot at the origin, mirroring style.js's hierarchy exactly. */
  function pose(t) {
    const out = { arms: {}, shapes: {} };
    const walkArm = (a, T0) => {
      const st = armAt(a, t);
      const Tyaw = rotate(T0, Ry(st.yaw)), Ttilt = rotate(Tyaw, Rz(st.tilt));
      const Tbar = translate(Ttilt, [-st.p, -a.h, 0]);
      out.arms[a.id] = { pivot: T0.o, left: xf(Tbar, [0, 0, 0]), right: xf(Tbar, [a.len, 0, 0]), ...st };
      for (const l of a.loads) {
        const ls = loadAt(l, t);
        if (ls.shown <= 0) continue;
        const Th = rotate(translate(Tbar, [l.at * a.len, 0, 0]), Rz(-st.tilt + ls.lag));
        const Tc = translate(Th, [0, -ls.L, 0]);
        if (l.child.kind === "arm") walkArm(l.child, Tc);
        else {
          const s = l.child, ss = shapeAt(s, t), Ts = rotate(Tc, Ry(ss.yaw)), k = ss.scale, I = s.info;
          const box = [[I.minX, I.minY], [I.maxX, I.minY], [I.maxX, I.maxY], [I.minX, I.maxY]].map((q) => xf(Ts, [q[0] * k, q[1] * k, 0]));
          out.shapes[s.id] = { hole: Tc.o, centroid: xf(Ts, [I.centroid[0] * k, I.centroid[1] * k, 0]), bottom: xf(Ts, [I.bottom[0] * k, I.bottom[1] * k, 0]), box, shown: ls.shown, ...ss };
        }
      }
    };
    walkArm(root, I3());
    return out;
  }
  function bounds(t0, t1, dt = 0.25) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let t = t0; t <= t1 + 1e-9; t += dt) {
      const P = pose(t);
      const pts = [...Object.values(P.shapes).flatMap((s) => s.box), ...Object.values(P.arms).flatMap((a) => [a.left, a.right])];
      for (const p of pts) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
    }
    return { min, max };
  }

  // ---- swing extremes + settle instants (sound), scanned once from the closed form
  function scanSwings(duration) {
    const out = [], dt = 1 / 120;
    for (const a of arms.values()) {
      const kickTimes = a.kicks.map((k) => k.t);
      if (!kickTimes.length) continue;
      let prevD = null, count = 0, lastKick = -Infinity;
      for (let t = 0; t <= duration; t += dt) {
        const recent = kickTimes.filter((k) => k <= t).pop() ?? -Infinity;
        if (recent !== lastKick && recent > lastKick + 0.3) { count = 0; lastKick = recent; }
        const { tilt, dtilt } = tiltAt(a, t);
        if (prevD !== null && Math.sign(dtilt) !== Math.sign(prevD) && prevD !== 0) {
          const amp = Math.abs(tilt - targetAt(a, t));
          if (amp >= K.swingSound.min && count < K.swingSound.max && t > lastKick + 0.15) {
            out.push({ t, kind: "swing", arm: a.id, amp, side: Math.sign(tilt - targetAt(a, t)) });
            count++;
          }
        }
        prevD = dtilt;
      }
      for (const s of a.slides) {
        // settled = from here on, |theta - theta*| stays under K.settle for a whole swing period (closed form, scanned)
        const per = TAU / a.w0, next = a.slides.find((q) => q.t > s.t)?.t ?? Infinity;
        for (let t = s.t + s.dur; t <= Math.min(duration, next); t += dt) {
          let ok = true;
          for (let u = t; u <= t + per && ok; u += dt * 2) ok = Math.abs(tiltAt(a, u).tilt - targetAt(a, u)) < K.settle;
          if (ok) { out.push({ t, kind: "settle", arm: a.id }); break; }
        }
        out.push({ t: s.t, kind: "slide", arm: a.id, dur: s.dur, dist: Math.abs(s.to - pivotAt(a, s.t)) });
      }
    }
    return out;
  }

  const plan = {
    knobs: K, root, arms, shapes, loads,
    armAt, loadAt, shapeAt, pose, bounds,
    weightOf: (id, t) => weightOf(arms.get(id) ?? shapes.get(id), t),
    balancePoint: (id, t) => balancePoint(arms.get(id), t),
    events: [],
    /** finalize(duration): fills plan.events (sound/picture cues) for [0, duration]. Called by planMobile when knobs.duration is set. */
    finalize(duration) {
      plan.events = [...soundEvents, ...scanSwings(duration)].filter((e) => e.t >= 0 && e.t < duration).sort((x, y) => x.t - y.t);
      return plan;
    },
  };
  if (K.duration) plan.finalize(K.duration);
  return plan;
}

/** mobilePlan(STYLE_SPEC, mobile, events, extra) -> planMobile with the style's balance knobs + sheet density. */
export function mobilePlan(S, mobile, events = [], extra = {}) {
  return planMobile(mobile, events, { ...(S.balance ?? {}), density: S.sheet?.density ?? 1, ...extra });
}

// ------------------------------------------------------------------ sound palette (data from spec.sound)
/** mobileVoices(S) -> scoreFromEvents voices: wire clinks, spool whisper, slide scrape, settle chime, swing ticks. */
export function mobileVoices(S) {
  return {
    spool: (e) => [{ type: "whoosh", dir: "in", dur: Math.max(0.4, e.dur * 0.9), gain: S.spool.gain, pitch: S.spool.pitch }],
    hook: (e) => [
      { type: "click", gain: S.hook.gain, pitch: S.hook.pitch },
      { type: "chime", gain: S.hook.chime, notes: 2, dur: 1.1, pitch: S.hook.chimePitch },
    ],
    lift: (e) => [{ type: "click", gain: S.hook.gain * 0.7, pitch: S.hook.pitch * 1.2 }, { type: "whoosh", dir: "out", dur: e.dur, gain: S.spool.gain }],
    grow: (e) => [
      { type: "whir", hz: S.grow.hz, hz2: S.grow.hz * (e.factor ?? 1.3), dur: e.dur + 0.15, gain: S.grow.gain },
      { type: "thud", offset: e.dur, gain: S.grow.thud, pitch: S.grow.thudPitch },
    ],
    slide: (e) => [{ type: "paper", dur: Math.max(0.35, e.dur * 0.85), density: 0.5, gain: S.slide.gain * clampN(e.dist / 0.12, 0.4, 1.2), pitch: S.slide.pitch }],
    swing: (e) => [{ type: "tick", gain: S.swing.gain * clampN(e.amp / 0.2, 0.25, 1), pitch: S.swing.pitch * (e.side > 0 ? 1 : 1.12) }],
    settle: () => [{ type: "chime", notes: 3, dur: 1.4, gain: S.settle.gain, pitch: S.settle.pitch }],
  };
}
const clampN = (x, a, b) => Math.min(b, Math.max(a, x));

/** mobileBed(duration, S) -> the calm gallery bed: a slow pad (brightness is a cutoff in Hz) in overlapping chords. */
export function mobileBed(duration, S) {
  const B = S.bed, n = Math.ceil(duration / B.every), out = [];
  for (let i = 0; i < n; i++) {
    const t = i * B.every;
    out.push({ t: Math.max(0, t - (i ? B.overlap : 0)), type: "pad", root: B.root, chord: B.chords[i % B.chords.length], dur: Math.min(duration - t + B.overlap, B.every + B.overlap * 2), attack: i ? B.attack : 0.8, release: B.release, brightness: B.brightness, gain: B.gain, seed: 3 + i });
  }
  return out;
}
