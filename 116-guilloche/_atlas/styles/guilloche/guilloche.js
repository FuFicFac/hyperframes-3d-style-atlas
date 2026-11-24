// styles/guilloche/guilloche.js — the rose-engine PLANNER for the "guilloche" style. Pure data in, plain data out:
// no THREE, no window, no DOM; imports only kit/time.js. Imported by style.js (the picture) AND by the demo's
// scene.config.js (the sound), so every cut, ratchet click and pour is on the picture by construction.
//
// The pattern (closed form, evaluated per pixel by the disc shader with the same formula):
//   ring k (k = 0 .. K-1, cut inside-out):  r_k(θ) = R_k + a_k · w(θ),
//   w(θ) = (1 - b) · sin(nA·θ + k·s) + b · sin(nB·θ + k·s)
// where θ is the angle in the DISC's own frame, n (lobes per turn) and s (phase step per ring) are the two dials, and
// a_k = amp · (R_k / ampRef)^ampPow (ampPow 0 = one fixed amplitude). While dial 1 clicks from n to n+1 the design is a
// blend (nA = n, nB = n+1, b = 0..1), so every intermediate curve is still a smooth closed ring.
//
// Time: the disc angle Θ(t) = A(t) + (2π / nGear) · G(t).
//   A(t)  the APPARENT rotation: integral of speed keys (deg/s, linear between keys) — what the viewer sees turn.
//   G(t)  hidden whole symmetry steps: `gear` m adds m · (2π / nGear) per video frame. The cut pattern has exact
//         nGear-fold symmetry (every ring does), so a 30 fps camera sees it turn only by A — but each ring needs a
//         full 2π of Θ, so gear 2 cuts a ring in ~4 frames. This is a strobed time-lapse, honestly: a real fast
//         spinning disc filmed with a short shutter looks exactly like this. Gears change only on frame boundaries,
//         so G is a whole number on every rendered frame.
// Each ring is exactly one turn of Θ, started where the previous one ended (plus optional gaps). Everything else
// (cutter radius and lift, arm swing, dials, enamel front, light sweep, sound events) is a closed form of t on top.
import { clamp, smoothstep } from "../../kit/time.js";

export const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const sstep = (a, b, x) => smoothstep(a, b, x);
const outBack = (u, s = 1.70158) => { const x = clamp(u) - 1; return 1 + (s + 1) * x * x * x + s * x * x; };

/** ringLayout({ count, r0, r1, amp, ampPow, ampRef }) -> { K, R: [], A: [], dR, r0, r1, aMax } */
export function ringLayout(L) {
  const K = L.count, dR = (L.r1 - L.r0) / (K - 1);
  const R = [], A = [];
  for (let k = 0; k < K; k++) {
    R.push(L.r0 + k * dR);
    A.push(L.amp * Math.pow(R[k] / (L.ampRef ?? 1), L.ampPow ?? 0));
  }
  return { K, R, A, dR, r0: L.r0, r1: L.r1, aMax: Math.max(...A), amp: L.amp, ampPow: L.ampPow ?? 0, ampRef: L.ampRef ?? 1 };
}

/** w(θ) for ring k under design D = { nA, nB, b, s } */
export function wave(D, k, th) {
  return (1 - D.b) * Math.sin(D.nA * th + k * D.s) + D.b * Math.sin(D.nB * th + k * D.s);
}
/** r_k(θ) under design D */
export function ringRadius(lay, D, k, th) { return lay.R[k] + lay.A[k] * wave(D, k, th); }

/** piecewise-linear speed keys [[t, deg/s]] -> integral A(t) in radians (closed form, exact) */
function speedIntegral(keys) {
  const T = keys.map((k) => k[0]), V = keys.map((k) => k[1]);
  const C = [0];
  for (let i = 0; i + 1 < T.length; i++) C.push(C[i] + 0.5 * (V[i] + V[i + 1]) * (T[i + 1] - T[i]));
  const A = (t) => {
    if (t <= T[0]) return V[0] * (t - T[0]) * DEG;
    const n = T.length;
    if (t >= T[n - 1]) return (C[n - 1] + V[n - 1] * (t - T[n - 1])) * DEG;
    let i = 0;
    while (t > T[i + 1]) i++;
    const d = t - T[i], slope = (V[i + 1] - V[i]) / (T[i + 1] - T[i]);
    return (C[i] + V[i] * d + 0.5 * slope * d * d) * DEG;
  };
  const speed = (t) => {
    if (t <= T[0]) return V[0];
    if (t >= T[T.length - 1]) return V[V.length - 1];
    let i = 0;
    while (t > T[i + 1]) i++;
    return V[i] + ((V[i + 1] - V[i]) * (t - T[i])) / (T[i + 1] - T[i]);
  };
  return { A, speed };
}

/** gear keys [[t, m]] -> G(t) = whole symmetry steps (frames snapped) */
function gearIntegral(keys, fps) {
  const F = keys.map((k) => Math.round(k[0] * fps)), M = keys.map((k) => k[1]);
  const G = (t) => {
    const f = t * fps;
    let g = 0;
    for (let i = 0; i < F.length; i++) {
      const a = F[i], b = i + 1 < F.length ? F[i + 1] : Infinity;
      if (f <= a) break;
      g += M[i] * (Math.min(f, b) - a);
    }
    return g;
  };
  const gearAt = (t) => { const f = t * fps; let m = 0; for (let i = 0; i < F.length; i++) if (f >= F[i]) m = M[i]; return m; };
  return { G, gearAt, frames: F };
}

/** dial plan: { id, t0, from, to, steps, every, dur } -> click times + value(t) + pointer value(t) */
function dialPlan(d) {
  const clicks = [];
  for (let i = 0; i < d.steps; i++) clicks.push(d.t0 + i * d.every);
  const stepV = (d.to - d.from) / d.steps;
  const value = (t) => { let v = d.from; for (const c of clicks) v += stepV * sstep(c, c + d.dur, t); return v; };
  // the pointer snaps a little faster than the pattern flows, with a small overshoot (a ratchet)
  const pointer = (t) => { let v = d.from; for (const c of clicks) v += stepV * outBack(clamp((t - c) / (d.dur * 0.7)), 2.2); return v; };
  return { ...d, clicks, value, pointer, stepV };
}

/**
 * createPlan(cfg) -> plan. cfg = {
 *   fps, duration, phi (cutter world angle, rad), rings: ringLayout input, nGear, s0,
 *   speed: [[t, deg/s]], gears: [[t, m]], cutStart, gaps: { [ringIndex]: seconds after that ring },
 *   approach (s the tool takes to come down), lift: { hop, retractAt, retractDur, swingAt, swingDur },
 *   dials: [{ id: "n" | "s", t0, from, to, steps, every, dur }],
 *   enamel: { t0, t1 }, sweep: { t0, t1 } }
 */
export function createPlan(cfg) {
  const fps = cfg.fps ?? 30;
  const lay = ringLayout(cfg.rings);
  const K = lay.K;
  const sp = speedIntegral(cfg.speed);
  const gr = gearIntegral(cfg.gears, fps);
  const nGear = cfg.nGear;
  const Theta = (t) => sp.A(t) + (TAU / nGear) * gr.G(t);

  // ---- rings: start / end times (bisection on the monotonic Θ; +,-,*,/ only -> identical in Node and Chrome)
  const ts = [], te = [], Ts = [];
  let t0 = cfg.cutStart;
  for (let k = 0; k < K; k++) {
    const th0 = Theta(t0), target = th0 + TAU;
    let lo = t0, hi = t0 + 0.05;
    while (Theta(hi) < target) { hi += 0.25; if (hi > cfg.duration + 5) throw new Error(`guilloche: ring ${k} never closes (disc stopped?)`); }
    for (let it = 0; it < 64; it++) { const mid = 0.5 * (lo + hi); if (Theta(mid) < target) lo = mid; else hi = mid; }
    ts.push(t0); te.push(hi); Ts.push(th0);
    t0 = hi + (cfg.gaps?.[k] ?? 0);
  }
  const cutEnd = te[K - 1];

  /** cut state at t: { done (rings complete), cur (ring being cut or -1), arc (rad cut of cur), seam (disc-local start angle of cur) } */
  const cutAt = (t) => {
    if (t < ts[0]) return { done: 0, cur: -1, arc: 0, seam: 0 };
    let k = 0;
    while (k + 1 < K && t >= ts[k + 1]) k++;
    if (t >= te[k]) return { done: k + 1, cur: -1, arc: 0, seam: 0 };
    const arc = clamp(Theta(t) - Ts[k], 0, TAU);
    return { done: k, cur: k, arc, seam: cfg.phi - Ts[k] };
  };

  // ---- dials and design
  const dials = Object.fromEntries((cfg.dials ?? []).map((d) => [d.id, dialPlan(d)]));
  const nDial = dials.n, sDial = dials.s;
  const designAt = (t) => {
    const n = nDial ? nDial.value(t) : nGear;
    const nA = Math.floor(n + 1e-9), b = n - nA;
    return { nA, nB: nA + 1, b: b < 1e-6 ? 0 : b, s: sDial ? sDial.value(t) : cfg.s0 };
  };

  // ---- the cutter: radius it touches (follows the current ring's wave), lift (0 = touching, 1 = up), arm swing
  const L = cfg.lift ?? {};
  const cutterAt = (t) => {
    const D = designAt(t), th = Theta(t);
    const local = cfg.phi - th; // disc-local angle under the cutter
    let k = 0;
    while (k + 1 < K && t >= ts[k + 1]) k++;
    let r, lift = 0;
    if (t < ts[0]) {
      r = ringRadius(lay, D, 0, local);
      lift = 1 - sstep(ts[0] - (cfg.approach ?? 0.4), ts[0], t);
    } else if (t < te[k]) {
      r = ringRadius(lay, D, k, local);
    } else if (k + 1 < K) {
      // in a gap after ring k: hop up, step out to ring k+1, come down
      const g0 = te[k], g1 = ts[k + 1], u = (t - g0) / Math.max(1e-6, g1 - g0);
      r = ringRadius(lay, D, k, local) + (ringRadius(lay, D, k + 1, local) - ringRadius(lay, D, k, local)) * sstep(0.2, 0.8, u);
      lift = (L.hop ?? 0.35) * Math.sin(Math.PI * clamp(u));
    } else {
      r = ringRadius(lay, D, K - 1, local);
      lift = sstep(cutEnd, cutEnd + (L.retractDur ?? 0.45), t);
    }
    const swing = sstep(L.swingAt ?? cutEnd + 0.4, (L.swingAt ?? cutEnd + 0.4) + (L.swingDur ?? 0.9), t);
    const cutting = t >= ts[0] && t < cutEnd && t < te[k];
    return { r, lift, swing, local, cutting, ring: k };
  };

  // ---- enamel front + light sweep
  const E = cfg.enamel ?? { t0: Infinity, t1: Infinity };
  const enamelAt = (t) => sstep(E.t0, E.t1, t);
  const S = cfg.sweep ?? { t0: Infinity, t1: Infinity };
  const sweepAt = (t) => ({ u: clamp((t - S.t0) / (S.t1 - S.t0)), level: sstep(S.t0, S.t0 + 0.35, t) * (1 - sstep(S.t1 - 0.35, S.t1, t)) });

  // ---- sound events (the SAME times as the picture)
  const events = [];
  for (let k = 0; k < K; k++) events.push({ t: ts[k], kind: "cut", ring: k, dur: te[k] - ts[k], u: k / (K - 1) });
  events.push({ t: ts[0] - 0.02, kind: "touch" });
  for (let k = 0; k + 1 < K; k++) if ((cfg.gaps?.[k] ?? 0) > 0) events.push({ t: te[k] + 0.05, kind: "step", ring: k });
  events.push({ t: cutEnd + 0.02, kind: "lift" });
  for (const d of Object.values(dials)) d.clicks.forEach((c, i) => events.push({ t: c, kind: "ratchet", dial: d.id, i }));
  for (const [i, [t, m]] of cfg.gears.entries()) if (i > 0 && m > cfg.gears[i - 1][1]) events.push({ t, kind: "spinup", m });
  if (Number.isFinite(E.t0)) events.push({ t: E.t0, kind: "pour", dur: E.t1 - E.t0 });
  if (Number.isFinite(S.t0)) events.push({ t: S.t0 + 0.5 * (S.t1 - S.t0), kind: "bell" });
  events.sort((a, b) => a.t - b.t);

  return {
    cfg, lay, K, fps, nGear, Theta, speed: sp.speed, apparent: sp.A, gearAt: gr.gearAt,
    ts, te, cutEnd, cutAt, designAt, dials, cutterAt, enamelAt, sweepAt, events,
  };
}

/** fingerprint(plan) -> short hex of the ring start/end times (rounded to 1e-6 s): print it in Node and the page */
export function fingerprint(plan) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { const x = Math.round(v * 1e6) | 0; h ^= x & 0xffff; h = Math.imul(h, 16777619) >>> 0; h ^= x >>> 16; h = Math.imul(h, 16777619) >>> 0; };
  plan.ts.forEach(mix); plan.te.forEach(mix);
  return (h >>> 0).toString(16).padStart(8, "0");
}
