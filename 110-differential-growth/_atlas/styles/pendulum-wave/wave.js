// styles/pendulum-wave/wave.js — the ONE plan of the "Pendulum Wave" style (pure: no THREE, no window, no DOM; Node-safe).
// From the rig numbers and a planned clock this module derives
//   - every pendulum: swings per cycle, frequency, string length (from the period), release angle;
//   - every pose at any t (closed form), the trail ghosts (the same formula at earlier clock times);
//   - every centre crossing (the tick: a bench lamp flash + one pitched note), mapped through the clock;
//   - the frozen "fingerprints" (ball positions at each freeze-frame) and the plank that releases and catches.
// style.js reads the plan for the picture; scene.config.js turns plan.events() into SCORE with waveVoices().
import { clamp, TAU } from "../../kit/time.js";

/**
 * createClock(segments) -> { tau(t), rate(t), tOf(tau), total, segments }
 *   segments: contiguous [{ t0, t1, r0, r1 }] — the clock RATE goes linearly from r0 to r1 over [t0, t1] (rate >= 0).
 *   tau(t) is the integral (piecewise quadratic, closed form); tOf(tau) is the earliest t that reaches tau.
 */
export function createClock(segments) {
  const S = [];
  let acc = 0;
  for (const s of segments) {
    const len = s.t1 - s.t0;
    if (!(len > 0) || s.r0 < 0 || s.r1 < 0) throw new Error(`pendulum-wave clock: bad segment ${JSON.stringify(s)}`);
    S.push({ ...s, len, tau0: acc, tau1: acc + ((s.r0 + s.r1) / 2) * len });
    acc = S[S.length - 1].tau1;
  }
  const total = acc, first = S[0], last = S[S.length - 1];
  const segAt = (t) => { for (const s of S) if (t < s.t1) return s; return last; };
  const tau = (t) => {
    if (t <= first.t0) return 0;
    if (t >= last.t1) return total;
    const s = segAt(t), d = t - s.t0;
    return s.tau0 + s.r0 * d + ((s.r1 - s.r0) / (2 * s.len)) * d * d;
  };
  const rate = (t) => {
    if (t < first.t0 || t >= last.t1) return 0;
    const s = segAt(t);
    return s.r0 + ((s.r1 - s.r0) * (t - s.t0)) / s.len;
  };
  const tOf = (x) => {
    if (x <= 0) return first.t0;
    for (const s of S) {
      if (s.tau1 <= s.tau0 || x > s.tau1) continue;
      const a = (s.r1 - s.r0) / (2 * s.len), b = s.r0, c = x - s.tau0;
      const d = Math.abs(a) < 1e-12 ? c / b : (-b + Math.sqrt(Math.max(0, b * b + 4 * a * c))) / (2 * a);
      return s.t0 + clamp(d, 0, s.len);
    }
    return last.t1;
  };
  return { tau, rate, tOf, total, segments: S };
}

/**
 * clockSegments({ release, freezes: [{ slow, stop, go, full }], catchAt, end }) -> segments for createClock
 *   stopped until `release`, rate 1 after it; each freeze ramps 1 -> 0 over [slow, stop], holds to `go`, ramps back by
 *   `full`; stopped again from `catchAt` (the instant the cycle completes).
 */
export function clockSegments({ release, freezes = [], catchAt, end }) {
  const segs = [];
  if (release > 0) segs.push({ t0: 0, t1: release, r0: 0, r1: 0 });
  let t = release;
  for (const f of freezes) {
    segs.push({ t0: t, t1: f.slow, r0: 1, r1: 1 }, { t0: f.slow, t1: f.stop, r0: 1, r1: 0 }, { t0: f.stop, t1: f.go, r0: 0, r1: 0 }, { t0: f.go, t1: f.full, r0: 0, r1: 1 });
    t = f.full;
  }
  segs.push({ t0: t, t1: catchAt, r0: 1, r1: 1 });
  if (end > catchAt) segs.push({ t0: catchAt, t1: end, r0: 0, r1: 0 });
  return segs;
}

/**
 * createPlan({ rig, timing: { release, freezes, catchAt }, end }) -> plan
 *   rig = STYLE_SPEC.rig. The cycle time T is whatever the clock accumulates between release and catch, so the
 *   pendulums are back in one line exactly at `catchAt`.
 *   plan = { n, T, gEff, balls: [{ k, x, swings, hz, L, amp, pivotY }], clock, tau(t), rate(t),
 *            angleAtTau(k, tau), posAtTau(k, tau) -> [x, y, z], pos(k, t), ghost(k, t, j) -> [x, y, z],
 *            crossings: [[t, ...] per ball], sinceCrossing(k, t), fingerprint(i) -> [z / reach per ball],
 *            freezes, plankDrop(t) -> 0 (up, holding) .. 1 (down), unison(t) -> 0..1 lamp glow after the catch,
 *            beamY(x), events(), timing, end }
 */
export function createPlan({ rig: R, timing, end }) {
  const n = R.count;
  const clock = createClock(clockSegments({ ...timing, end }));
  const T = clock.total;
  const top = R.swings0 + n - 1;
  const lengthOf = (kappa) => R.lengthMin * (top / (R.swings0 + kappa)) ** 2;     // period^2: also used between pendulums (beam curve)
  const balls = [];
  for (let k = 0; k < n; k++) {
    const swings = R.swings0 + k, L = lengthOf(k);
    if (L <= R.reach) throw new Error(`pendulum-wave: pendulum ${k} (L ${L.toFixed(2)}) is shorter than the reach ${R.reach}`);
    balls.push({ k, x: (k - (n - 1) / 2) * R.spacing, swings, hz: swings / T, L, amp: Math.asin(R.reach / L), pivotY: R.ballY + L });
  }
  const gEff = balls[0].L * (TAU * balls[0].hz) ** 2;       // the gravity that gives these periods at these lengths (same for all)
  const angleAtTau = (k, x) => balls[k].amp * Math.cos((TAU * balls[k].swings * x) / T);
  const posAtTau = (k, x) => {
    const b = balls[k], a = angleAtTau(k, x);
    return [b.x, b.pivotY - b.L * Math.cos(a), b.L * Math.sin(a)];
  };
  const pos = (k, t) => posAtTau(k, clock.tau(t));
  const ghost = (k, t, j) => posAtTau(k, Math.max(0, clock.tau(t) - j * R.trail.step * clock.rate(t)));

  // centre crossings, front -> back only (phase = PI/2 + 2 PI m): tau = (m + 1/4) T / swings, mapped back through the clock
  const crossings = balls.map((b) => {
    const out = [];
    for (let m = 0; m < b.swings; m++) out.push(clock.tOf(((m + 0.25) * T) / b.swings));
    return out;
  });
  const sinceCrossing = (k, t) => {
    const c = crossings[k];
    let last = -Infinity;
    for (let i = 0; i < c.length && c[i] <= t; i++) last = c[i];
    return t - last;
  };

  const freezes = (timing.freezes ?? []).map((f, i) => ({ ...f, i, tau: clock.tau(f.stop) }));
  const fingerprint = (i) => balls.map((b) => posAtTau(b.k, freezes[i].tau)[2] / R.reach);

  const PK = R.plank;
  const smooth = (u) => { const c = clamp(u, 0, 1); return c * c * (3 - 2 * c); };
  const plankDrop = (t) => smooth((t - (timing.release - PK.lead)) / PK.dropDur) * (1 - smooth((t - (timing.catchAt - 0.02)) / PK.dropDur));

  // unison(t): 0 until the catch, then every bench lamp lights at once and settles at 0.8 (the "one line" glow)
  const unison = (t) => (t < timing.catchAt ? 0 : smooth((t - timing.catchAt) / 0.18) * (0.8 + 0.2 * Math.exp(-(t - timing.catchAt) / 0.4)));

  const beamY = (x) => R.ballY + lengthOf(clamp(x / R.spacing + (n - 1) / 2, -1.2, n + 0.2));

  const events = () => {
    const ev = [{ t: 0, kind: "bed", dur: end }, { t: timing.release - PK.lead, kind: "release" }];
    crossings.forEach((c, k) => c.forEach((t) => { if (t < end) ev.push({ t, kind: "tick", k, x: balls[k].x }); }));
    for (const f of freezes) ev.push({ t: f.stop, kind: "freeze", i: f.i }, { t: f.go, kind: "resume", i: f.i });
    ev.push({ t: timing.catchAt, kind: "catch" });
    return ev.sort((a, b) => a.t - b.t);
  };

  return {
    n, T, gEff, balls, clock, tau: clock.tau, rate: clock.rate, angleAtTau, posAtTau, pos, ghost, crossings, sinceCrossing,
    freezes, fingerprint, plankDrop, unison, beamY, lengthOf, events, timing, end, rig: R,
  };
}

/** waveVoices(STYLE_SPEC.sound) -> voices for kit/schedule.scoreFromEvents */
export function waveVoices(S) {
  return {
    bed: (e) => [{ type: "pad", dur: e.dur, gain: S.pad.gain, root: S.pad.root, chord: S.pad.chord, brightness: S.pad.brightness, attack: 0.4, release: 1.2 }],
    tick: (e) => [{ type: "marimba", hz: S.root * 2 ** (S.scale[e.k] / 12), gain: S.tick.gain, dur: S.tick.dur, decay: S.tick.decay, mallet: S.tick.mallet }],
    release: () => [{ type: "clack", gain: S.release.gain, pitch: 0.7 }, { type: "whoosh", dir: "out", dur: 0.5, gain: S.release.gain * 0.5 }],
    freeze: () => [{ type: "click", gain: S.shutter.gain, pitch: 0.8 }, { type: "clack", gain: S.shutter.gain * 0.8, pitch: 1.5, offset: 0.04 }, { type: "chime", gain: S.shutter.gain * 0.45, dur: 1.0, notes: 3, offset: 0.12 }],
    resume: () => [{ type: "whoosh", dir: "out", dur: 0.35, gain: S.shutter.gain * 0.35 }],
    catch: () => [{ type: "clack", gain: S.catch.gain, pitch: 0.6 }, { type: "thud", gain: S.catch.gain * 0.8, dur: 0.4 }, { type: "marimba", hz: S.root, notes: [0, 7, 12, 16, 19, 24], step: 0.012, gain: S.catch.gain * 0.5, dur: 1.8, decay: 0.5, offset: 0.02 }],
  };
}

/** panOf(rig) -> event -> stereo pan from x along the row */
export const panOf = (R) => (e) => (e.x === undefined ? 0 : clamp(e.x / (R.spacing * R.count * 0.5), -1, 1) * 0.7);
