// styles/conveyor-factory/line.js — the production-line planner: release schedule -> per-item position and state over time.
// Pure: no THREE, no window, no DOM (Node-safe). Imported by style.js (the picture) AND by scene.config.js (SCORE,
// counters, camera shots, framing gate), so every beep, hiss, thunk and servo whirr lands on the frame its station acts.
//
// MODEL. A network of belt SEGMENTS (3D polylines with true circular fillets; arc length s from each start). A ROUTE is
// a list of segments (route-s = distance from the route start). Items are released at s = 0 at planned times and move
// at belt speed v. STATIONS sit at fixed s; each is a FIFO resource with a dwell (0 = acts in passing):
//   start = max(arrival, resource.free); leave = start + dwell; free = leave + gap / v   (one pitch to move up)
// A discrete-event pass over the release list (always serving the earliest arrival) gives every item's free-flow
// knots (t, s): moving at v, holding at stations. That is precomputed once — nothing is carried between frames.
// ACCUMULATION, per frame: on each segment, in entry order, an item's position is min(free s, s of the item ahead - gap),
// so a station that is slower than the belt grows a visible queue that advances a pitch at a time when the head leaves.
// (p_i(t) = min_j<=i (f_j(t) - (i - j) gap) — a closed form of t.) verify() proves every station acts with the item
// physically there.
//
//   makePath(pts, { radius })              -> { pts, cum, length, at(s) -> { p, t }, project([x, z]) -> s }
//   buildNetwork(S, line?, stations?)      -> net: segments, routes (offsets), stations (route-s), sort map
//   releasePlan(net, { t0, t1, interval, jitter, mix, bursts, seed })   -> items [{ id, type, release, route }]
//   planLine(net, items, S, { fail })      -> plan: visits, events, positions(t), counts, lights, diverter, robot poses
//   chooseReject(plan, at, types)          -> id of the first item whose QC read is at or after `at`
//   armIK(S.robot, base, effector)         -> { yaw, q1, q2, q3, wrist, elbow, shoulder } analytic two-joint IK
//   lineVoices(S.sound)                    -> voices for kit/schedule.scoreFromEvents
//   fitShot(pts, o) / framingCheck(keys, regions, o)   (local copies of bead-abacus' shot fitting; see STYLE.md)
import { clamp, ease, rng, smoothstep } from "../../kit/time.js";
import { sampleCameraKeys, screenExtent, cameraBasis } from "../../kit/framing.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, u) => a + (b - a) * u;
const lerp3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];

// ------------------------------------------------------------------------------------------------ paths
/**
 * filletArcs(pts, r, step = .03) -> polyline whose corners are replaced by true circular arcs of radius r (sampled every
 * `step` rad), in the plane of each corner (works for plan curves and for incline knees alike).
 */
export function filletArcs(pts, r, step = 0.03) {
  if (pts.length < 3 || !(r > 0)) return pts.map((p) => [...p]);
  const out = [[...pts[0]]];
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1], P = pts[i], B = pts[i + 1];
    const u = nrm(sub(P, A)), w = nrm(sub(B, P));
    const turn = Math.acos(clamp(dot(u, w), -1, 1));
    if (turn < 1e-4) { out.push([...P]); continue; }
    const d = Math.min(r * Math.tan(turn / 2), 0.5 * len(sub(P, A)), 0.5 * len(sub(B, P)));
    const rr = d / Math.tan(turn / 2);
    const q1 = sub(P, mul(u, d));
    const n1 = nrm(sub(w, mul(u, dot(u, w))));          // in-plane normal from the incoming leg toward the outgoing one
    const c = add(q1, mul(n1, rr));
    const m = Math.max(2, Math.ceil(turn / step));
    for (let k = 0; k <= m; k++) {
      const ph = (turn * k) / m;
      out.push(add(c, mul(add(mul(n1, -Math.cos(ph)), mul(u, Math.sin(ph))), rr)));
    }
  }
  out.push([...pts[pts.length - 1]]);
  return out;
}

/**
 * makePath(pts, { radius = 0 }) -> { pts, cum, length, at(s) -> { p, t }, project([x, z]) -> s, ends }
 * Tangents are interpolated between per-vertex tangents, so an item turning on a curve rotates smoothly (no 2-degree steps).
 */
export function makePath(pts0, { radius = 0 } = {}) {
  const P = filletArcs(pts0, radius);
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + len(sub(P[i], P[i - 1])));
  const length = cum[cum.length - 1];
  const segT = P.slice(1).map((p, i) => nrm(sub(p, P[i])));
  const vT = P.map((_, i) => nrm(add(segT[Math.max(0, i - 1)], segT[Math.min(segT.length - 1, i)])));
  const at = (s0) => {
    const s = clamp(s0, 0, length);
    let lo = 1, hi = P.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
    const i = Math.max(1, lo), L = cum[i] - cum[i - 1], k = L ? (s - cum[i - 1]) / L : 0;
    const p = lerp3(P[i - 1], P[i], k);
    // beyond the ends: extrapolate along the end tangent (items in the hood before the visible belt)
    if (s0 < 0) return { p: add(P[0], mul(segT[0], s0)), t: segT[0] };
    if (s0 > length) return { p: add(P[P.length - 1], mul(segT[segT.length - 1], s0 - length)), t: segT[segT.length - 1] };
    return { p, t: nrm(lerp3(vT[i - 1], vT[i], k)) };
  };
  const project = (q) => {
    let best = Infinity, bs = 0;
    for (let i = 1; i < P.length; i++) {
      const a = [P[i - 1][0], 0, P[i - 1][2]], b = [P[i][0], 0, P[i][2]];
      const e = sub(b, a), l2 = dot(e, e) || 1e-12, k = clamp(dot(sub([q[0], 0, q[1]], a), e) / l2);
      const dd = len(sub([q[0], 0, q[1]], add(a, mul(e, k))));
      if (dd < best - 1e-9) { best = dd; bs = cum[i - 1] + k * (cum[i] - cum[i - 1]); }
    }
    return bs;
  };
  return { pts: P, cum, length, at, project };
}

// ------------------------------------------------------------------------------------------------ network
/**
 * buildNetwork(S, line = S.line, stations = S.stations) -> net = { v, gap, beltY, segments: { id: path + { id, kind } },
 *   routes: { id: { segs, offs, length, stops: [station refs sorted by route-s] } }, stations: [{ ..., s (segment-local),
 *   routeS: { route: s } }], sort, items: S.items, timing: S.timing }
 * Stations name their segment and an x (projected onto it) or an explicit s.
 */
export function buildNetwork(S, line = S.line, stations = S.stations) {
  const segments = {};
  for (const [id, g] of Object.entries(line.segments)) segments[id] = Object.assign(makePath(g.pts, { radius: g.radius ?? 0 }), { id, kind: g.kind ?? "straight" });
  const st = stations.map((s) => {
    const seg = segments[s.seg];
    const sl = s.s != null ? s.s : seg.project([s.x, s.z ?? seg.at(0).p[2]]);
    return { ...s, s: sl, p: seg.at(sl).p };
  });
  const routes = {};
  for (const [rid, segs] of Object.entries(line.routes)) {
    const offs = [];
    let acc = 0;
    for (const sid of segs) { offs.push(acc); acc += segments[sid].length; }
    const stops = [];
    for (const s of st) {
      const k = segs.indexOf(s.seg);
      if (k < 0) continue;
      s.routeS = s.routeS ?? {};
      s.routeS[rid] = offs[k] + s.s;
      stops.push(s);
    }
    stops.sort((a, b) => a.routeS[rid] - b.routeS[rid]);
    routes[rid] = { id: rid, segs, offs, length: acc, stops };
  }
  return { v: line.v, gap: line.gap, beltY: line.beltY, beltW: line.beltW, segments, routes, stations: st, sort: line.sort, items: S.items, timing: S.timing, line };
}

/** segOf(route, s) -> index of the segment holding route-s (a boundary belongs to the EARLIER segment: an item holding at
 *  a merge waits at the end of its lane, not on the shared belt). */
function segIndex(route, s) {
  let k = 0;
  for (let i = 1; i < route.offs.length; i++) if (s > route.offs[i] + 1e-7) k = i;
  return k;
}

// ------------------------------------------------------------------------------------------------ release schedule
/**
 * releasePlan(net, { t0, t1, interval = 1.2, jitter = .25, mix = { carton: .5, parcel: .2, tote: .3 }, maxRun = { tote: 1 },
 *   bursts = [{ at, n, type | pattern: [types...], interval }], seed = 7 }) -> [{ id, i, type, release, route }]
 * A planned release rate: steady releases with seeded jitter and type mix, plus bursts (n items of one type at a tighter
 * interval — the way a bottleneck is staged). Spacing never drops below gap / v.
 */
export function releasePlan(net, o = {}) {
  const R = rng(o.seed ?? 7);
  const minDt = net.gap / net.v + 0.02;
  const mix = o.mix ?? { carton: 0.5, parcel: 0.2, tote: 0.3 };
  const types = Object.keys(mix), tot = types.reduce((a, k) => a + mix[k], 0);
  const bursts = (o.bursts ?? []).map((b) => ({ ...b, end: b.at + (b.n - 1) * Math.max(minDt, b.interval ?? minDt) }));
  const maxRun = o.maxRun ?? { tote: 1 };
  const out = [];
  let t = o.t0 ?? 0, run = { type: null, n: 0 };
  const push = (type, at) => {
    run = run.type === type ? { type, n: run.n + 1 } : { type, n: 1 };
    out.push({ type, release: +at.toFixed(4) });
  };
  while (t < (o.t1 ?? 15)) {
    const b = bursts.find((q) => t >= q.at - minDt && t <= q.end + 1e-9);
    if (b) {
      const pat = b.pattern ?? [b.type];
      for (let k = 0; k < b.n; k++) push(pat[k % pat.length], b.at + k * Math.max(minDt, b.interval ?? minDt));
      t = b.end + Math.max(minDt, o.interval ?? 1.2);
      bursts.splice(bursts.indexOf(b), 1);
      continue;
    }
    let type, guard = 0;
    do {
      let x = R.next() * tot;
      type = types[types.length - 1];
      for (const k of types) { if ((x -= mix[k]) < 0) { type = k; break; } }
    } while (maxRun[type] != null && run.type === type && run.n >= maxRun[type] && ++guard < 20);
    push(type, t);
    t += Math.max(minDt, (o.interval ?? 1.2) + (R.next() * 2 - 1) * (o.jitter ?? 0.25));
  }
  out.sort((a, b) => a.release - b.release);
  return out.map((x, i) => ({ id: `i${i}`, i, ...x, route: net.sort[x.type] }));
}

// ------------------------------------------------------------------------------------------------ robot geometry
/**
 * armIK(R = S.robot, base [x, y, z], effector [x, y, z]) -> { yaw, q1, q2, q3, shoulder, elbow, wrist }
 *   Turret yaw about +Y (0 = arm reaching toward +X), shoulder pitch q1 (from horizontal, up +), elbow bend q2 (>= 0;
 *   forearm angle = q1 - q2), wrist pitch q3 relative to the forearm so the tool hangs straight down. Elbow-up solution.
 *   The wrist sits `tool` above the effector (the suction cup face). Out-of-reach targets clamp to full stretch.
 */
export function armIK(R, base, eff) {
  const shoulder = [base[0], base[1] + R.shoulderH, base[2]];
  const wrist = [eff[0], eff[1] + R.tool, eff[2]];
  const dx = wrist[0] - shoulder[0], dz = wrist[2] - shoulder[2];
  const yaw = Math.atan2(-dz, dx);
  const r = Math.hypot(dx, dz), h = wrist[1] - shoulder[1];
  const dmax = R.L1 + R.L2 - 1e-4, dmin = Math.abs(R.L1 - R.L2) + 1e-4;
  const d = clamp(Math.hypot(r, h), dmin, dmax);
  const c2 = clamp((d * d - R.L1 * R.L1 - R.L2 * R.L2) / (2 * R.L1 * R.L2), -1, 1);
  const q2 = Math.acos(c2);
  const q1 = Math.atan2(h, r) + Math.atan2(R.L2 * Math.sin(q2), R.L1 + R.L2 * Math.cos(q2));
  const q3 = -Math.PI / 2 - (q1 - q2);
  const dir = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const elbow = [shoulder[0] + dir[0] * R.L1 * Math.cos(q1), shoulder[1] + R.L1 * Math.sin(q1), shoulder[2] + dir[2] * R.L1 * Math.cos(q1)];
  return { yaw, q1, q2, q3, shoulder, elbow, wrist };
}

// ------------------------------------------------------------------------------------------------ the plan
const PICK_KEYS = ["down", "grip", "up", "travel", "lower", "release", "back"];

/**
 * planLine(net, items, S, { fail = [] ids, robotBase, pallet }) -> plan
 *   plan.items[k]: { ...item, knots [[t, s]], visits { stationId: { A, start, leave } }, out: { kind: "chute"|"robot", t } }
 *   plan.positions(t) -> [{ id, type, visible, p, yaw, pitch, state: { tagged, stamped, fill, sealed, fail, onBelt } }]
 *   plan.events: [{ t, kind, ... }] sorted (scan, divertOut/In, pressDown, stamp, pressUp, pour, qc, reject, push, chuteLand,
 *     wrap, servo (robot moves), place, count) — the SAME list drives the score
 *   plan.counts(t) -> { scanned, filled, rejected, packed }    plan.lights(t) -> { stationId: { red, amber, green } }
 *   plan.diverter(t) -> arm angle 0..divertAngle    plan.press(t) -> ram 0 (up)..1 (down)    plan.pour(t) -> 0..1
 *   plan.push(t) -> pusher stroke 0..1    plan.wrapSpin(t) -> ring angle    plan.robot(t) -> armIK pose + effector + carried
 *   plan.queue(stationId, t) -> number of items waiting    plan.verify() -> { ok, issues }
 */
export function planLine(net, items0, S, o = {}) {
  const T = net.timing, v = net.v, gap = net.gap;
  const fail = new Set(o.fail ?? []);
  const items = items0.map((it) => ({ ...it, fail: fail.has(it.id), knots: [[it.release, 0]], visits: {}, out: null, size: net.items[it.type].size }));
  const RB = o.robotBase ?? net.line.robot.base;
  const PAL = o.pallet ?? net.line.robot.pallet;
  const pickT = T.pick, cycle = PICK_KEYS.reduce((a, k) => a + pickT[k], 0);
  const free = new Map();
  const state = items.map((it) => ({ k: 0, tPrev: it.release, sPrev: 0, done: false }));
  const routeOf = (it) => net.routes[it.route];

  // ---- discrete-event pass: always serve the earliest arrival at its next station (FIFO per station, by arrival)
  for (;;) {
    let best = -1, bestA = Infinity;
    items.forEach((it, i) => {
      const s = state[i];
      if (s.done) return;
      const R = routeOf(it), st = R.stops[s.k];
      if (!st) { s.done = true; return; }
      const A = s.tPrev + (st.routeS[it.route] - s.sPrev) / v;
      if (A < bestA - 1e-9) { bestA = A; best = i; }
    });
    if (best < 0) break;
    const it = items[best], s = state[best], R = routeOf(it), st = R.stops[s.k], sk = st.routeS[it.route];
    const A = bestA;
    const start = Math.max(A, free.get(st.id) ?? -Infinity);
    let dwell = st.dwell ?? 0;
    if (st.kind === "push" && !it.fail) dwell = 0;
    if (st.kind === "pick") dwell = pickT.down + pickT.grip;
    const leave = start + dwell;
    free.set(st.id, st.kind === "pick" ? start + cycle : leave + gap / v);
    it.visits[st.id] = { A, start, leave, s: sk, kind: st.kind };
    it.knots.push([A, sk]);
    if (leave > A + 1e-9) it.knots.push([leave, sk]);
    s.tPrev = leave; s.sPrev = sk; s.k++;
    if (st.kind === "push" && it.fail) { it.out = { kind: "chute", t: leave }; s.done = true; }
    if (st.kind === "pick") { it.out = { kind: "robot", t: start }; s.done = true; }
  }
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));

  // free-flow route-s at t (null before release)
  const freeS = (it, t) => {
    const K = it.knots;
    if (t < it.release) return null;
    for (let j = 1; j < K.length; j++) {
      if (t <= K[j][0]) {
        const [t0, s0] = K[j - 1], [t1, s1] = K[j];
        return s1 === s0 ? s0 : s0 + (t - t0) * v;
      }
    }
    const [tl, sl] = K[K.length - 1];
    return it.out ? sl : sl + (t - tl) * v;
  };
  // time the item's free s leaves sTarget going forward (entry into the segment after a boundary)
  const tLeave = (it, sT) => {
    const K = it.knots;
    for (let j = 1; j < K.length; j++) if (K[j][1] > sT + 1e-9) return K[j - 1][1] >= sT - 1e-9 ? K[j - 1][0] : K[j - 1][0] + (sT - K[j - 1][1]) / v;
    return Infinity;
  };
  // per-segment entry order (for accumulation)
  const segOrder = {};
  for (const it of items) {
    const R = routeOf(it);
    R.segs.forEach((sid, k) => {
      const tE = k === 0 ? it.release : tLeave(it, R.offs[k]);
      (segOrder[sid] ??= []).push({ it, tE, k });
    });
  }
  for (const sid of Object.keys(segOrder)) segOrder[sid].sort((a, b) => a.tE - b.tE || a.it.i - b.it.i);

  // ---- robot picks (in order of pick start): effector path, slot, carried item
  const picks = items.filter((it) => it.out?.kind === "robot").sort((a, b) => a.out.t - b.out.t).map((it, j) => {
    const c = it.out.t;
    const ph = {}; let acc = c;
    for (const k of PICK_KEYS) { ph[k] = [acc, acc + pickT[k]]; acc += pickT[k]; }
    const col = j % PAL.cols, row = Math.floor(j / PAL.cols) % PAL.rows, layer = Math.floor(j / (PAL.cols * PAL.rows));
    const slot = [PAL.center[0] + (col - (PAL.cols - 1) / 2) * PAL.pitch[0], PAL.top + layer * PAL.layer, PAL.center[2] + (row - (PAL.rows - 1) / 2) * PAL.pitch[1]];
    return { it, c, ph, slot, j, end: acc };
  });
  const pickStation = net.stations.find((s) => s.kind === "pick");
  const pickPt = pickStation ? pickStation.p : [0, net.beltY, 0];
  const beltTop = net.beltY + net.items.lift;
  const maxH = Math.max(...Object.values(net.items).filter((x) => x.size).map((x) => x.size[2]));
  const hoverY = beltTop + maxH + T.hoverLift;
  const idleEff = [pickPt[0], hoverY, pickPt[2]];
  // cylindrical interpolation around the robot base (turret sweeps; radius and height lerp)
  const cyl = (a, b, u) => {
    const pa = [a[0] - RB[0], a[2] - RB[2]], pb = [b[0] - RB[0], b[2] - RB[2]];
    const ra = Math.hypot(pa[0], pa[1]), rb = Math.hypot(pb[0], pb[1]);
    let aa = Math.atan2(pa[1], pa[0]), ab = Math.atan2(pb[1], pb[0]);
    while (ab - aa > Math.PI) ab -= 2 * Math.PI;
    while (ab - aa < -Math.PI) ab += 2 * Math.PI;
    const an = lerp(aa, ab, u), r = lerp(ra, rb, u);
    return [RB[0] + Math.cos(an) * r, lerp(a[1], b[1], u), RB[2] + Math.sin(an) * r];
  };
  const effector = (t) => {
    const P = picks.find((q) => t >= q.c && t < q.end);
    if (!P) return { eff: idleEff, carried: null };
    const h = P.it.size[2];
    const grip = [pickPt[0], beltTop + h, pickPt[2]];
    const liftY = Math.max(hoverY, P.slot[1] + h + T.hoverLift);
    const up = [pickPt[0], liftY, pickPt[2]];
    const place = [P.slot[0], P.slot[1] + h, P.slot[2]];
    const above = [P.slot[0], liftY, P.slot[2]];
    const u = (k) => ease.inOutSine(clamp((t - P.ph[k][0]) / (P.ph[k][1] - P.ph[k][0])));
    let eff, carried = null;
    if (t < P.ph.grip[0]) eff = lerp3(idleEff, grip, u("down"));
    else if (t < P.ph.up[0]) eff = grip;
    else if (t < P.ph.travel[0]) eff = lerp3(grip, up, u("up"));
    else if (t < P.ph.lower[0]) eff = cyl(up, above, u("travel"));
    else if (t < P.ph.release[0]) eff = lerp3(above, place, u("lower"));
    else if (t < P.ph.back[0]) eff = place;
    else {
      const k = u("back");
      eff = k < 0.35 ? lerp3(place, above, k / 0.35) : cyl(above, idleEff, (k - 0.35) / 0.65);
    }
    if (t >= P.ph.grip[1] && t < P.ph.back[0]) carried = P.it.id;
    return { eff, carried, pick: P };
  };

  // ---- events (one list: picture cues + score)
  const events = [];
  const E = (t, kind, x = {}) => events.push({ t, kind, ...x });
  for (const it of items) {
    const V = it.visits;
    if (V.scan) E(V.scan.start, "scan", { id: it.id, type: it.type });
    if (V.press) { E(V.press.start + T.pressDown, "pressDown", { id: it.id }); E(V.press.start + T.pressHit, "stamp", { id: it.id }); E(V.press.start + T.pressUp, "pressUp", { id: it.id }); }
    if (V.fill) { const d = V.fill.leave - V.fill.start; E(V.fill.start + T.fillOpen, "pour", { id: it.id, dur: d - T.fillOpen - T.fillClose }); E(V.fill.leave - T.fillClose, "filled", { id: it.id }); }
    if (V.qc) E(V.qc.start, it.fail ? "reject" : "qc", { id: it.id });
    if (it.fail && V.push) {
      E(V.push.start, "push", { id: it.id });
      const ch = net.line.chute, L = Math.hypot(ch.z1 - ch.z0, ch.y0 - ch.y1);
      it.chute = { t0: V.push.leave, len: L, land: V.push.leave + T.pushOut + Math.sqrt((2 * Math.max(0.01, L - it.size[1] - 0.08)) / T.slideAccel) };
      E(it.chute.land, "chuteLand", { id: it.id });
    }
    if (V.wrap) E(V.wrap.start, "wrap", { id: it.id });
  }
  for (const P of picks) {
    E(P.ph.down[0], "servo", { phase: "down", dur: pickT.down + pickT.grip });
    E(P.ph.up[0], "servo", { phase: "travel", dur: pickT.up + pickT.travel + pickT.lower });
    E(P.ph.back[0], "servo", { phase: "back", dur: pickT.back });
    E(P.ph.grip[0], "grip", { id: P.it.id });
    E(P.ph.release[0], "place", { id: P.it.id, j: P.j });
  }
  // diverter windows (merged): the arm goes out before a tote reaches it and back after the last of a run
  const dv = items.filter((it) => it.route === "B" && it.visits.divert).map((it) => [it.visits.divert.start - T.divertLead, it.visits.divert.start + T.divertHold]);
  const win = [];
  for (const w of dv.sort((a, b) => a[0] - b[0])) {
    const last = win[win.length - 1];
    if (last && w[0] <= last[1] + T.divertRamp * 2) last[1] = Math.max(last[1], w[1]);
    else win.push([...w]);
  }
  for (const w of win) { E(w[0], "divertOut"); E(w[1], "divertIn"); }
  events.sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : 1));
  // counters tick when a count changes
  const countKinds = { scan: "scanned", filled: "filled", reject: "rejected", place: "packed" };
  for (const e of [...events]) if (countKinds[e.kind]) E(e.t + 0.04, "count", { counter: countKinds[e.kind] });
  events.sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : 1));
  const countTimes = { scanned: [], filled: [], rejected: [], packed: [] };
  for (const e of events) if (e.kind === "count") countTimes[e.counter].push(e.t);
  const countAt = (arr, t) => { let n = 0; for (const x of arr) if (x <= t) n++; return n; };

  // ---- per-frame queries --------------------------------------------------------------------------------------------
  function positions(t) {
    const out = new Map();
    // belt items: free-flow s, then accumulation per segment in entry order
    const freeOf = new Map();
    for (const it of items) {
      const s = freeS(it, t);
      if (s == null) continue;
      if (it.out?.kind === "chute" && t >= it.out.t) continue;
      if (it.out?.kind === "robot" && t >= it.out.t + pickT.down + pickT.grip) continue;
      freeOf.set(it.id, s);
    }
    const chained = new Map();
    for (const [sid, list] of Object.entries(segOrder)) {
      let prev = Infinity;
      for (const { it, k } of list) {
        const s = freeOf.get(it.id);
        if (s == null) continue;
        const R = routeOf(it);
        if (segIndex(R, s) !== k) continue;
        let local = s - R.offs[k];
        local = Math.min(local, prev - gap);
        prev = local;
        chained.set(it.id, { sid, local, s: R.offs[k] + local });
      }
    }
    const rob = effector(t);
    for (const it of items) {
      const V = it.visits, st = stateOf(it, t);
      let p = null, yaw = 0, pitch = 0, roll = 0, visible = true, mode = "belt";
      const c = chained.get(it.id);
      if (c) {
        const a = net.segments[c.sid].at(c.local);
        p = [a.p[0], a.p[1] + net.items.lift + it.size[2] / 2, a.p[2]];
        yaw = Math.atan2(-a.t[2], a.t[0]);
        pitch = Math.asin(clamp(a.t[1], -1, 1));
      } else if (it.out?.kind === "chute" && t >= it.out.t) {
        // pushed sideways off the belt onto the inclined roller chute (rolls over the edge), then slides with constant
        // acceleration until it rests against the bin wall
        const ch = net.line.chute, V0 = V.push, R = net.routes[it.route];
        const P0 = net.segments[R.segs[R.segs.length - 1]].at(V0.s - R.offs[R.offs.length - 1]).p;
        const tau = t - it.chute.t0, h = it.size[2], tilt = Math.atan2(ch.y0 - ch.y1, ch.z1 - ch.z0);
        const d = [0, -Math.sin(tilt), Math.cos(tilt)], n = [0, Math.cos(tilt), Math.sin(tilt)];
        const top = add([ch.x, ch.y0, ch.z0 + it.size[1] * 0.5 + 0.04], mul(n, h / 2 + net.items.lift));
        mode = "chute";
        if (tau < T.pushOut) {
          const u = ease.inOutSine(tau / T.pushOut);
          p = lerp3([P0[0], net.beltY + net.items.lift + h / 2, P0[2]], top, u);
          roll = tilt * smoothstep(0.55, 1, u);
        } else {
          const L = it.chute.len - it.size[1] - 0.08, sl = Math.min(L, 0.5 * T.slideAccel * (tau - T.pushOut) ** 2);
          p = add(top, mul(d, sl));
          roll = tilt;
        }
      } else if (it.out?.kind === "robot" && t >= it.out.t + pickT.down + pickT.grip) {
        const P = picks.find((q) => q.it === it);
        if (rob.carried === it.id) { mode = "robot"; p = [rob.eff[0], rob.eff[1] - it.size[2] / 2, rob.eff[2]]; }
        else { mode = "pallet"; p = [P.slot[0], P.slot[1] + it.size[2] / 2, P.slot[2]]; }
      } else visible = false;
      out.set(it.id, { id: it.id, type: it.type, visible, p, yaw, pitch, roll, mode, state: st, size: it.size });
    }
    return out;
  }
  function stateOf(it, t) {
    const V = it.visits;
    const fillU = V.fill ? smoothstep(V.fill.start + T.fillOpen, V.fill.leave - T.fillClose, t) : 0;
    return {
      tagged: !!V.scan && t >= V.scan.start,
      stamped: !!V.press && t >= V.press.start + T.pressHit,
      fill: it.type === "tote" ? fillU * T.fillLevel : 0,
      sealed: !!V.wrap && t >= V.wrap.start,
      fail: it.fail && !!V.qc && t >= V.qc.start,
      ok: !it.fail && !!V.qc && t >= V.qc.start,
    };
  }
  const queue = (sid, t) => items.filter((it) => it.visits[sid] && it.visits[sid].A <= t && t < it.visits[sid].start - 1e-6).length;
  const busy = (sid, t) => items.some((it) => it.visits[sid] && t >= it.visits[sid].start && t < it.visits[sid].leave);
  function lights(t) {
    const L = {};
    for (const st of net.stations) L[st.id] = { red: 0, amber: 0, green: 1 };
    if (L.fill) { const q = queue("fill", t); if (q >= T.queueAmber) L.fill = { red: 0, amber: 1, green: 0 }; else if (q === 1) L.fill = { red: 0, amber: 0, green: 1 }; }
    if (L.qc) for (const it of items) if (it.fail && it.visits.qc && t >= it.visits.qc.start && t < it.visits.qc.start + T.rejectRed) {
      const blink = Math.floor((t - it.visits.qc.start) / 0.2) % 2 === 0 ? 1 : 0.25;
      L.qc = { red: blink, amber: 0, green: 0 };
    }
    if (L.scan) for (const it of items) if (it.visits.scan && Math.abs(t - it.visits.scan.start) < 0.12) L.scan.green = 1.6;
    return L;
  }
  const diverter = (t) => {
    let a = 0;
    for (const w of win) a = Math.max(a, smoothstep(w[0], w[0] + T.divertRamp, t) * (1 - smoothstep(w[1], w[1] + T.divertRamp, t)));
    return a * T.divertAngle;
  };
  /** press(t) -> { k: ram 0 (up)..1 (on the item), top: y of the top of the item under the ram (or the belt) } */
  const pressSt = net.stations.find((x) => x.kind === "press");
  const press = (t) => {
    let k = 0, top = net.beltY + net.items.lift;
    for (const it of items) {
      const V = it.visits.press;
      if (!V) continue;
      const tau = t - V.start;
      if (tau < -0.4 || tau > T.pressUp + 0.6) continue;
      if (tau >= -0.4 && tau <= T.pressUp + 0.6) top = Math.max(top, net.beltY + net.items.lift + it.size[2]);
      if (tau < T.pressDown || tau > T.pressUp + 0.2) continue;
      if (tau < T.pressHit) k = Math.max(k, ease.inQuad((tau - T.pressDown) / (T.pressHit - T.pressDown)));
      else if (tau < T.pressUp) k = Math.max(k, 1);
      else k = Math.max(k, 1 - ease.inOutSine((tau - T.pressUp) / 0.2));
    }
    return { k, top, at: pressSt?.p };
  };
  const pour = (t) => {
    let k = 0;
    for (const it of items) {
      const V = it.visits.fill;
      if (!V) continue;
      k = Math.max(k, smoothstep(V.start + T.fillOpen - 0.08, V.start + T.fillOpen + 0.06, t) * (1 - smoothstep(V.leave - T.fillClose - 0.08, V.leave - T.fillClose + 0.04, t)));
    }
    return k;
  };
  const push = (t) => {
    let k = 0;
    for (const it of items) if (it.fail && it.visits.push) {
      const tau = t - it.visits.push.start;
      if (tau < 0 || tau > it.visits.push.leave - it.visits.push.start + T.pushOut + 0.5) continue;
      const tp = it.visits.push.leave - it.visits.push.start;
      k = Math.max(k, tau < tp ? 0 : tau < tp + T.pushOut ? ease.inOutSine((tau - tp) / T.pushOut) : 1 - ease.inOutSine((tau - tp - T.pushOut) / 0.5));
    }
    return k;
  };
  // wrapper ring angle: spins while an item is inside the tunnel (closed form: integral of a smooth on/off speed)
  const wrapWins = items.filter((it) => it.visits.wrap).map((it) => [it.visits.wrap.start - 0.45, it.visits.wrap.start + 0.45]);
  const wrapSpin = (t) => {
    let a = 0;
    for (const [w0, w1] of wrapWins) a += clamp(t - w0, 0, w1 - w0) * 9;
    return a;
  };
  const robot = (t) => {
    const r = effector(t);
    return { ...armIK(S.robot, RB, r.eff), eff: r.eff, carried: r.carried };
  };
  /** verify(): every station acts with the item physically there (accumulation never delays an in-passing station), no
   *  queue spills off its segment, items on one belt never closer than gap - 1 mm. */
  function verify(dt = 1 / 30, t0 = -2, t1 = 16) {
    const issues = [];
    for (const it of items) for (const [sid, V] of Object.entries(it.visits)) {
      if (V.start < t0 || V.start > t1) continue;
      const P = positions(V.start + 1e-4).get(it.id);
      const st = net.stations.find((s) => s.id === sid);
      if (!P?.p || !P.visible) continue;
      const d = Math.hypot(P.p[0] - st.p[0], P.p[2] - st.p[2]);
      if (d > 0.03) issues.push({ t: +V.start.toFixed(3), id: it.id, station: sid, off: +d.toFixed(3) });
    }
    return { ok: issues.length === 0, issues };
  }
  return {
    net, items, byId, events, picks, segOrder, cycle,
    positions, stateOf, counts: (t) => ({ scanned: countAt(countTimes.scanned, t), filled: countAt(countTimes.filled, t), rejected: countAt(countTimes.rejected, t), packed: countAt(countTimes.packed, t) }),
    lights, queue, busy, diverter, press, pour, push, wrapSpin, robot, verify, freeS,
    beltOffset: (t) => v * t,
  };
}

/** chooseReject(plan, at, types = ["carton", "parcel"]) -> id of the first item of those types whose QC read is >= at. */
export function chooseReject(plan, at, types = ["carton", "parcel"]) {
  const c = plan.items.filter((it) => types.includes(it.type) && it.visits.qc && it.visits.qc.start >= at).sort((a, b) => a.visits.qc.start - b.visits.qc.start);
  return c[0]?.id ?? null;
}

// ------------------------------------------------------------------------------------------------ sound
/** lineVoices(S.sound) -> voices for kit/schedule.scoreFromEvents: the station sounds of the line. */
export function lineVoices(snd = {}) {
  const g = (k, d) => snd[k]?.gain ?? d;
  return {
    scan: () => [{ type: "blip", dur: 0.07, gain: g("beep", 0.12), pitch: snd.beep?.pitch ?? 1.6, notes: [0, 7] }],
    divertOut: () => [{ type: "whooshOut", dur: 0.22, gain: g("hiss", 0.1), pitch: snd.hiss?.pitch ?? 2.4 }, { type: "click", dur: 0.03, gain: 0.08, pitch: 0.7, offset: 0.2 }],
    divertIn: () => [{ type: "whooshOut", dur: 0.2, gain: g("hiss", 0.1) * 0.8, pitch: (snd.hiss?.pitch ?? 2.4) * 0.9 }],
    pressDown: () => [{ type: "whooshOut", dur: 0.16, gain: g("hiss", 0.1) * 0.7, pitch: 2.0 }],
    stamp: () => [{ type: "thud", dur: 0.32, gain: g("stamp", 0.42), pitch: snd.stamp?.pitch ?? 1.2 }, { type: "clack", dur: 0.1, gain: g("stamp", 0.42) * 0.55, pitch: 0.55, offset: 0.002 }],
    pressUp: () => [{ type: "whooshOut", dur: 0.3, gain: g("hiss", 0.1), pitch: 2.8 }],
    pour: (e) => [{ type: "rustle", dur: Math.max(0.3, e.dur), gain: g("pour", 0.22), density: 0.9, pitch: 0.8 }],
    qc: () => [{ type: "blip", dur: 0.06, gain: g("beep", 0.12) * 0.7, pitch: 2.0, notes: [0, 4] }],
    reject: () => [{ type: "buzz", dur: 0.55, gain: g("buzz", 0.1), hz: 180, flicker: 0 }, { type: "blip", dur: 0.12, gain: g("beep", 0.12), pitch: 0.9, notes: [3, 0] }],
    push: () => [{ type: "whooshOut", dur: 0.3, gain: g("hiss", 0.1) * 1.3, pitch: 2.2 }],
    chuteLand: () => [{ type: "thud", dur: 0.3, gain: 0.22, pitch: 1.5 }],
    wrap: () => [{ type: "whir", dur: 0.9, gain: g("wrap", 0.06), hz: 320, hz2: 360, grit: 0.25 }],
    servo: (e) => [{ type: "servo", dur: Math.max(0.15, e.dur), gain: g("servo", 0.11) * (e.phase === "travel" ? 1 : 0.75), hz: snd.servo?.hz ?? 130, hz2: (snd.servo?.hz2 ?? 240) * (e.phase === "back" ? 0.8 : 1), grit: snd.servo?.grit ?? 0.22 }],
    grip: () => [{ type: "whooshOut", dur: 0.12, gain: g("hiss", 0.1) * 0.6, pitch: 3.0 }],
    place: () => [{ type: "thud", dur: 0.25, gain: g("place", 0.16), pitch: snd.place?.pitch ?? 0.7 * 2 }],
    count: () => [{ type: "tick", dur: 0.015, gain: g("tick", 0.08), pitch: 1.6 }],
  };
}

// ------------------------------------------------------------------------------------------------ camera (local copy)
/**
 * fitShot(pts, { elev, azim, fov, aspect, win }) -> { pos, target, fov }: the closest camera on that bearing whose view puts
 * every point inside the NDC window `win`, centred in it (bead-abacus' fitShot, copied: a kit promotion candidate).
 */
export function fitShot(pts, o = {}) {
  const { elev = 0.6, azim = 0, fov = 32, aspect = 16 / 9 } = o;
  const win = { x0: -0.88, x1: 0.88, y0: -0.6, y1: 0.86, ...(o.win ?? {}) };
  const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
  const dir = [Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev)];
  const wc = [(win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2], ww = [(win.x1 - win.x0) / 2, (win.y1 - win.y0) / 2];
  const th = Math.tan((fov * Math.PI) / 360);
  const make = (d) => {
    let tgt = [...c];
    for (let it = 0; it < 10; it++) {
      const cam = { pos: [tgt[0] + dir[0] * d, tgt[1] + dir[1] * d, tgt[2] + dir[2] * d], target: tgt, fov };
      const e = screenExtent(cam, pts, { aspect });
      const mid = [(e.x[0] + e.x[1]) / 2, (e.y[0] + e.y[1]) / 2];
      const B = cameraBasis(cam);
      const dx = (mid[0] - wc[0]) * th * aspect * d, dy = (mid[1] - wc[1]) * th * d;
      tgt = [tgt[0] + B.right[0] * dx + B.up[0] * dy, tgt[1] + B.right[1] * dx + B.up[1] * dy, tgt[2] + B.right[2] * dx + B.up[2] * dy];
    }
    return { pos: [tgt[0] + dir[0] * d, tgt[1] + dir[1] * d, tgt[2] + dir[2] * d], target: tgt, fov };
  };
  const fits = (d) => {
    const cam = make(d), e = screenExtent(cam, pts, { aspect });
    return !e.behind && (e.x[1] - e.x[0]) / 2 <= ww[0] && (e.y[1] - e.y[0]) / 2 <= ww[1];
  };
  let lo = 0.5, hi = 80;
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
  const cam = make(hi);
  const r5 = (x) => +x.toFixed(5);
  return { pos: cam.pos.map(r5), target: cam.target.map(r5), fov };
}

/** framingCheck(keys, regions(t) -> [{ id, pts }], { duration, dt, drift, fov, aspect, win }) -> { ok, fails, worst } (asymmetric window). */
export function framingCheck(keys, regions, o = {}) {
  const { dt = 1 / 30, drift = null, fov = 32, aspect = 16 / 9 } = o;
  const win = { x0: -0.9, x1: 0.9, y0: -0.62, y1: 0.9, ...(o.win ?? {}) };
  const duration = o.duration ?? keys[keys.length - 1].t;
  const fails = [];
  let worst = { over: -Infinity };
  for (let i = 0; i <= Math.round(duration / dt); i++) {
    const t = +Math.min(duration, i * dt).toFixed(6);
    const cam = sampleCameraKeys(keys, t, { drift, fov });
    for (const r of regions(t)) {
      const e = screenExtent(cam, r.pts, { aspect });
      const over = Math.max(win.x0 - e.x[0], e.x[1] - win.x1, win.y0 - e.y[0], e.y[1] - win.y1);
      if (over > worst.over) worst = { t, id: r.id, over: +over.toFixed(4) };
      if (e.behind || over > 0) fails.push({ t, id: r.id, over: +over.toFixed(4) });
    }
  }
  return { ok: fails.length === 0, fails, worst };
}
