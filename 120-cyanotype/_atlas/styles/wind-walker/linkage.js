// styles/wind-walker/linkage.js — the walking-linkage planner for "Wind Walker". PURE: no THREE, no window, no DOM
// (imports only kit/time.js), so scene.config.js, render-sfx and export-spec can run it in plain Node.
//
// One leg = seven sticks in a plane, solved in closed form from the crank angle by TWO circle–circle intersections:
//   1. a straight-line four-bar: crank O–A, coupler A–B (extended past B to the tracer T), rocker P–B.
//        B = circle(A, coupler) ∩ circle(P, rocker)          -> T = a rigid point of the coupler
//      The proportions were found by a numeric search (not a textbook set): T runs along an almost flat line at
//      almost constant speed for ~1/3 of the crank turn, then lifts and swings back.
//   2. a pantograph that scales T's little loop by k about the hip H (H, T and the foot F stay collinear):
//        M = circle(H, thigh/k) ∩ circle(T, shin/k)          -> knee K = H + k(M − H), foot F = H + k(T − H)
// The mirrored (aft) leg on the same crank pin is the same solve at angle π − θ, x flipped.
//
// The gait: legs are phase-offset copies along one crankshaft. At every crank angle the LOWEST foot carries the
// creature: the body's forward travel is locked to that foot (body x = X_k − footX) and its height to it (body y =
// −min footY), so the supporting foot neither slides nor sinks. Both are closed-form functions of the crank angle
// (handover angles are found once by bisection). Touchdowns (-> footprints and step thuds) come from the same plan.
import { clamp, hash01 } from "../../kit/time.js";

export const TAU = Math.PI * 2;

/** circleCircle(c1, r1, c2, r2, sign) -> [x, y] | null: the intersection on the left (sign +1) / right (−1) of c1 -> c2. */
export function circleCircle(c1, r1, c2, r2, sign = 1) {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1], d = Math.hypot(dx, dy);
  if (d < 1e-12 || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const mx = c1[0] + (a * dx) / d, my = c1[1] + (a * dy) / d;
  return [mx - (sign * h * dy) / d, my + (sign * h * dx) / d];
}

/**
 * solveLeg(L, theta, side = 1) -> { ok, O, A, P, B, T, H, M, K, N, F } (2D points, metres, origin = crank axis, x forward, y up)
 *   L = spec.linkage: { crank, pivot:[x,y], coupler, rocker, ext, off, hip:[x,y], thigh, shin, k }
 *   side −1 = the mirrored leg sharing the crank pin (solved at π − θ, x flipped).
 */
export function solveLeg(L, theta, side = 1) {
  const th = side > 0 ? theta : Math.PI - theta;
  const O = [0, 0], P = [L.pivot[0], L.pivot[1]], H = [L.hip[0], L.hip[1]];
  const A = [L.crank * Math.cos(th), L.crank * Math.sin(th)];
  const B = circleCircle(A, L.coupler, P, L.rocker, 1);
  if (!B) return { ok: false };
  const ux = (B[0] - A[0]) / L.coupler, uy = (B[1] - A[1]) / L.coupler;
  const T = [A[0] + ux * (L.coupler + L.ext) - uy * L.off, A[1] + uy * (L.coupler + L.ext) + ux * L.off];
  const k = L.k, p1 = L.thigh / k, p2 = L.shin / k;
  const M = circleCircle(H, p1, T, p2, 1);
  if (!M) return { ok: false };
  const K = [H[0] + k * (M[0] - H[0]), H[1] + k * (M[1] - H[1])];
  const F = [H[0] + k * (T[0] - H[0]), H[1] + k * (T[1] - H[1])];
  const N = [T[0] + (k - 1) * (M[0] - H[0]), T[1] + (k - 1) * (M[1] - H[1])];
  const out = { ok: true, O, A, P, B, T, H, M, K, N, F };
  if (side < 0) for (const key of ["A", "P", "B", "T", "H", "M", "K", "N", "F"]) out[key] = [-out[key][0], out[key][1]];
  return out;
}

/** The seven sticks of one leg as [fromKey, toKey, layer] (layer = z slot so sticks pass each other). */
export const STICKS = [
  ["O", "A", 0, "crank"], ["A", "B", 1, "coupler"], ["B", "T", 1, "coupler"], ["P", "B", 2, "rocker"],
  ["H", "K", 1, "thigh"], ["K", "F", 2, "shin"], ["M", "T", 2, "link"], ["T", "N", 3, "link"],
];
export const JOINTS = ["A", "B", "T", "M", "K", "N"];

/** stickLengths(L) -> the bar lengths in metres (for STYLE.md / NOTES). */
export function stickLengths(L) {
  return {
    crank: L.crank, coupler: +(L.coupler + L.ext).toFixed(4), rocker: L.rocker, thigh: L.thigh, shin: L.shin,
    linkMT: +(L.shin / L.k).toFixed(4), linkTN: +((L.thigh * (L.k - 1)) / L.k).toFixed(4), ground: +Math.hypot(...L.pivot).toFixed(4),
  };
}

/**
 * createGait(L, G) -> gait.   G = spec.gait: { stations, spacing, phaseStep (rad per station), contact (m) }
 *   legs: [{ id, station, side, z, phase }]   (side +1 fore, −1 aft; aft legs get the same crank pin)
 *   foot(j, theta) -> [x, y] in the body frame      leg(j, theta) -> full solveLeg result
 *   bodyX(theta), bodyY(theta): closed form; stride = advance per crank turn; dir = crank sign that walks toward +x
 *   contacts[j] = { down, up } crank angles (mod TAU) where foot j comes within G.contact of the sand / leaves it
 *   report: numeric verification (flat stance, constant speed, slip).
 */
export function createGait(L, G) {
  const nS = G.stations, legs = [];
  for (let s = 0; s < nS; s++) for (const side of [1, -1]) {
    legs.push({ id: legs.length, station: s, side, z: (s - (nS - 1) / 2) * G.spacing, phase: s * G.phaseStep });
  }
  const nL = legs.length;
  const build = (dir) => {
    const leg = (j, th) => solveLeg(L, dir * th + legs[j].phase, legs[j].side);
    const foot = (j, th) => leg(j, th).F;
    const support = (th) => { let s = 0, m = Infinity; for (let j = 0; j < nL; j++) { const y = foot(j, th)[1]; if (y < m) { m = y; s = j; } } return s; };
    // handovers over one turn: sample, then bisect each change of the supporting leg
    const NS = 2880, cuts = [];
    let prev = support(0);
    const first = prev;
    for (let i = 1; i <= NS; i++) {
      const th = (i / NS) * TAU, s = i === NS ? first : support(th);
      if (s !== prev) {
        let lo = ((i - 1) / NS) * TAU, hi = th;
        for (let it = 0; it < 48; it++) { const mid = (lo + hi) / 2; if (foot(prev, mid)[1] <= foot(s, mid)[1]) lo = mid; else hi = mid; }
        cuts.push({ th: (lo + hi) / 2, to: s });
        prev = s;
      }
    }
    // intervals [th0, th1) with their supporting leg and the constant X so that bodyX = X − footX is continuous
    const iv = [];
    let th0 = 0, s = first, X = foot(first, 0)[0];
    for (const c of cuts) {
      iv.push({ th0, th1: c.th, leg: s, X });
      const bx = X - foot(s, c.th)[0];
      s = c.to; th0 = c.th; X = bx + foot(s, c.th)[0];
    }
    iv.push({ th0, th1: TAU, leg: s, X });
    const stride = X - foot(s, TAU)[0];
    return { leg, foot, iv, stride };
  };
  let dir = 1, g = build(1);
  if (g.stride < 0) { dir = -1; g = build(-1); }
  const { leg, foot, iv, stride } = g;
  const bodyX = (theta) => {
    const n = Math.floor(theta / TAU), ph = theta - n * TAU;
    let lo = 0, hi = iv.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (iv[mid].th0 <= ph) lo = mid; else hi = mid - 1; }
    return n * stride + iv[lo].X - foot(iv[lo].leg, ph)[0];
  };
  const bodyY = (theta) => { let m = Infinity; for (let j = 0; j < nL; j++) m = Math.min(m, foot(j, theta)[1]); return -m; };
  const height = (j, theta) => foot(j, theta)[1] + bodyY(theta);          // foot j above the sand
  const worldX = (j, theta) => foot(j, theta)[0] + bodyX(theta);

  // contact windows: where each foot is within G.contact of the sand
  const NC = 1440, contacts = [];
  for (let j = 0; j < nL; j++) {
    let down = null, up = null;
    for (let i = 0; i < NC; i++) {
      const a = (i / NC) * TAU, b = ((i + 1) / NC) * TAU;
      const ha = height(j, a) - G.contact, hb = height(j, b) - G.contact;
      if (ha > 0 && hb <= 0) { let lo = a, hi = b; for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (height(j, m) - G.contact > 0) lo = m; else hi = m; } down = (lo + hi) / 2; }
      if (ha <= 0 && hb > 0) { let lo = a, hi = b; for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (height(j, m) - G.contact <= 0) lo = m; else hi = m; } up = (lo + hi) / 2; }
    }
    contacts.push({ down, up });
  }

  // ---- numeric verification
  const report = (() => {
    const N = 1440, f0 = [];
    for (let i = 0; i < N; i++) f0.push(solveLeg(L, (i / N) * TAU, 1).F);
    const ys = f0.map((p) => p[1]), xs = f0.map((p) => p[0]);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    // one leg's path: the stance segment = samples within G.contact of the lowest point
    const st = ys.map((y) => y - yMin <= G.contact);
    const stN = st.filter(Boolean).length;
    let sx0 = Infinity, sx1 = -Infinity, sy1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < N; i++) if (st[i] && st[(i + 1) % N]) {
      sx0 = Math.min(sx0, xs[i]); sx1 = Math.max(sx1, xs[i]); sy1 = Math.max(sy1, ys[i] - yMin);
      const v = Math.abs(xs[(i + 1) % N] - xs[i]) * N / TAU; v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    // gait: slip of every foot while it is in contact, body speed ripple, bob
    let slip = 0, bob0 = Infinity, bob1 = -Infinity, bv0 = Infinity, bv1 = -Infinity, feetMin = nL, feetSum = 0;
    for (let j = 0; j < nL; j++) {
      const c = contacts[j]; if (c.down == null || c.up == null) continue;
      const span = ((c.up - c.down) % TAU + TAU) % TAU;
      let a = Infinity, b = -Infinity;
      for (let i = 0; i <= 200; i++) { const x = worldX(j, c.down + (span * i) / 200); a = Math.min(a, x); b = Math.max(b, x); }
      slip = Math.max(slip, b - a);
    }
    for (let i = 0; i < N; i++) {
      const th = (i / N) * TAU, y = bodyY(th); bob0 = Math.min(bob0, y); bob1 = Math.max(bob1, y);
      const v = (bodyX(th + TAU / N) - bodyX(th)) * N / TAU; bv0 = Math.min(bv0, v); bv1 = Math.max(bv1, v);
      let n = 0; for (let j = 0; j < nL; j++) if (height(j, th) <= G.contact) n++;
      feetMin = Math.min(feetMin, n); feetSum += n;
    }
    const r = (v, d = 4) => +v.toFixed(d);
    return {
      stanceCrankDeg: r((stN / N) * 360, 1),            // crank angle one foot spends within `contact` of its lowest point
      stanceLength: r(sx1 - sx0), stanceSag: r(sy1, 5),   // m: length of the flat segment and its deviation from flat
      stanceSpeedRipple: r((v1 - v0) / ((v1 + v0) / 2)),  // foot speed variation along the flat segment
      stepHeight: r(yMax - yMin), pathWidth: r(Math.max(...xs) - Math.min(...xs)),
      stride: r(stride), dir,
      bodyBob: r(bob1 - bob0, 5), bodySpeedRipple: r((bv1 - bv0) / ((bv1 + bv0) / 2)),
      maxFootSlip: r(slip, 5),                             // m: worst travel of any foot over the sand while in contact
      feetDownMin: feetMin, feetDownMean: r(feetSum / N, 2), handovers: iv.length - 1,
      rideHeight: r((bob0 + bob1) / 2),
      ok: sy1 <= G.contact && slip < 0.03 && feetMin >= 2 && stride > 0,
    };
  })();

  return { L, G, legs, dir, stride, foot, leg, bodyX, bodyY, height, worldX, contacts, intervals: iv, report };
}

/**
 * crankClock({ theta0, rate (turns/s), ramps: [{ t, dur, to }] }) -> { theta(t), rate(t), timeOf(theta) }
 *   Closed form: constant rates joined by smoothstep ramps (the integral of smoothstep is u³ − u⁴/2).
 */
export function crankClock(C) {
  const ramps = [...(C.ramps ?? [])].sort((a, b) => a.t - b.t);
  const I = (u) => (u <= 0 ? 0 : u >= 1 ? u - 0.5 : u * u * u - (u * u * u * u) / 2);
  const S = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const turns = (t) => { let v = C.rate * t, r = C.rate; for (const k of ramps) { v += (k.to - r) * k.dur * I((t - k.t) / k.dur); r = k.to; } return v; };
  const rate = (t) => { let v = C.rate, r = C.rate; for (const k of ramps) { v += (k.to - r) * S((t - k.t) / k.dur); r = k.to; } return v; };
  const theta = (t) => (C.theta0 ?? 0) + TAU * turns(t);
  const timeOf = (th) => {
    let lo = -200, hi = 200;
    for (let i = 0; i < 70; i++) { const m = (lo + hi) / 2; if (theta(m) < th) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  return { theta, rate, timeOf };
}

/**
 * createPlan(S, times) -> plan (everything the picture and the score read).
 *   S = STYLE_SPEC (linkage, gait, clock, hero);  times = { end, past (s of trail before t = 0), clock? (overrides S.clock) }
 *   pose(t) -> { theta, x, y, rate }          legs / leg(j, t) -> solved joints (body frame)
 *   prints: [{ t, leg, x, z, n }] sorted by t (touchdowns from −past to end)   events(): step / creak / turn for SCORE
 *   loop(j, n) -> [[x, y]...] the closed foot path of leg j in the body frame, starting at the crank angle of t = loopStart
 */
export function createPlan(S, times = {}) {
  const L = S.linkage, G = S.gait;
  const gait = createGait(L, G);
  const clock = crankClock(times.clock ?? S.clock);
  const end = times.end ?? 15, past = times.past ?? 12;
  const pose = (t) => { const theta = clock.theta(t); return { theta, x: gait.bodyX(theta), y: gait.bodyY(theta), rate: clock.rate(t) }; };
  const leg = (j, t) => gait.leg(j, clock.theta(t));
  const hero = gait.legs.find((l) => l.station === (S.hero?.station ?? G.stations - 1) && l.side === (S.hero?.side ?? 1)).id;

  // touchdowns -> footprints
  const thA = clock.theta(-past), thB = clock.theta(end);
  const prints = [];
  gait.legs.forEach((lg, j) => {
    const c = gait.contacts[j]; if (c.down == null) return;
    for (let n = Math.floor(thA / TAU) - 1; n <= Math.ceil(thB / TAU); n++) {
      const th = c.down + n * TAU; if (th < thA || th > thB) continue;
      prints.push({ t: clock.timeOf(th), leg: j, n, x: gait.worldX(j, th), z: lg.z, side: lg.side, station: lg.station, hero: j === hero });
    }
  });
  prints.sort((a, b) => a.t - b.t);

  const events = () => {
    const ev = [];
    const zMax = Math.max(...gait.legs.map((l) => Math.abs(l.z))) || 1;
    for (const p of prints) if (p.t >= 0 && p.t < end) ev.push({ t: p.t, kind: "step", leg: p.leg, hero: p.hero, pan: clamp(-p.z / zMax, -1, 1) * 0.6, rate: clock.rate(p.t), k: hash01(p.leg, p.n + 64) });
    // one creak per half crank turn, one knock per turn
    for (let n = Math.ceil(clock.theta(0) / Math.PI); n * Math.PI < thB; n++) {
      const t = clock.timeOf(n * Math.PI); if (t < 0 || t >= end) continue;
      ev.push({ t, kind: n % 2 ? "creak" : "turn", n, rate: clock.rate(t), k: hash01(n + 7, 3) });
    }
    return ev.sort((a, b) => a.t - b.t);
  };

  const loop = (j, n = 240, key = "F", t0 = 0) => {
    const th0 = clock.theta(t0), pts = [];
    for (let i = 0; i <= n; i++) { const p = gait.leg(j, th0 + (i / n) * TAU)[key]; pts.push([p[0], p[1]]); }
    return pts;
  };
  /** fraction of the loop's ARC LENGTH drawn once the crank has turned from t0 to t (clamped 0..1) */
  const loopProgress = (pts, t, t0 = 0) => {
    const u = clamp((clock.theta(t) - clock.theta(t0)) / TAU, 0, 1);
    const n = pts.length - 1, f = u * n, i = Math.min(n - 1, Math.floor(f));
    let acc = 0, at = 0, total = 0;
    for (let q = 0; q < n; q++) { const d = Math.hypot(pts[q + 1][0] - pts[q][0], pts[q + 1][1] - pts[q][1]); if (q < i) acc += d; if (q === i) at = acc + d * (f - i); total += d; }
    return total > 0 ? at / total : 0;
  };
  return { S, gait, clock, pose, leg, hero, prints, events, loop, loopProgress, end, past, report: gait.report, sticks: stickLengths(L) };
}

/** walkerVoices(sound) -> voices for kit/schedule.scoreFromEvents (step thuds, tube creaks, crank knocks). */
export function walkerVoices(Q, level = () => 1) {
  return {
    step: (e) => {
      const g = level(e.t);
      const out = [{ type: "thud", dur: Q.step.dur, pitch: Q.step.pitch * (0.85 + 0.4 * e.k), gain: Q.step.gain * g * (0.75 + 0.5 * e.k) },
        { type: "paper", dur: 0.09, pitch: 0.55, density: 0.7, gain: Q.step.grit * g }];
      if (e.hero) out.push({ type: "tick", dur: 0.03, pitch: 0.8, gain: Q.step.heroTick });
      return out;
    },
    creak: (e) => [{ type: "servo", dur: Q.creak.dur, hz: Q.creak.hz * (0.9 + 0.3 * e.k), hz2: Q.creak.hz * (0.72 + 0.2 * e.k), grit: 0.7, gain: Q.creak.gain * level(e.t) }],
    turn: (e) => [{ type: "clack", dur: 0.1, pitch: Q.turn.pitch * (0.9 + 0.2 * e.k), gain: Q.turn.gain * level(e.t) }],
  };
}
