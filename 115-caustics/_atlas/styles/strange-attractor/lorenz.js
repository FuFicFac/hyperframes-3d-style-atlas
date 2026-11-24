// styles/strange-attractor/lorenz.js — the numerical heart of "Strange Attractor". THREE-free, window-free, Node-safe:
// imported by style.js (picture) AND by scene.config.js (camera keys, framing gate, SCORE), so sound and picture read the
// same tables.
//
// Model: the Lorenz system  x' = s (y - x),  y' = x (r - z) - y,  z' = x y - b z  with the classic s = 10, r = 28,
// b = 8/3. Integrated ONCE at load with classic fixed-step RK4 (only + - * /, so Node and Chrome store bit-identical
// tables; tableHash proves it). Video time t maps to simulation time tau through a piecewise-linear RATE (a smooth
// slow-down at the fork, a speed-up for the cloud); tau(t) is its exact piecewise-quadratic integral, inverted with a
// quadratic solve (sqrt only).
//
// What the planner decides (and fails loudly if it cannot):
//   - the coral path A: a start point rolled onto the attractor, integrated from tau = 0 to the end;
//   - the twin B: starts at video time `twinAt` at A's position plus delta * dir. delta is SEARCHED on a log grid so that
//     |A - B| first exceeds `sepSplit` at video time splitAt +- tol, the two then sit on opposite wings within `forkTau`
//     (one goes left, one goes right), and they never come back within `rejoinMin` until the end;
//   - the cloud: `count` starts packed into a ball of radius `radius` around A at the fork (shortly before the split),
//     released at video time `cloud.at`, integrated to the end.
// Nothing steps at render time: the scene reads positions from the stored tables for any t.

const SIG = 10, RHO = 28, BET = 8 / 3;

/** Lorenz right-hand side for state (x, y, z) into out[o..o+2] */
function rhs(x, y, z, out, o) {
  out[o] = SIG * (y - x);
  out[o + 1] = x * (RHO - z) - y;
  out[o + 2] = x * y - BET * z;
}

const K = new Float64Array(12);
/** one RK4 step of size h from (x, y, z) into out[o..o+2] */
function rk4(x, y, z, h, out, o) {
  rhs(x, y, z, K, 0);
  rhs(x + 0.5 * h * K[0], y + 0.5 * h * K[1], z + 0.5 * h * K[2], K, 3);
  rhs(x + 0.5 * h * K[3], y + 0.5 * h * K[4], z + 0.5 * h * K[5], K, 6);
  rhs(x + h * K[6], y + h * K[7], z + h * K[8], K, 9);
  out[o] = x + (h / 6) * (K[0] + 2 * K[3] + 2 * K[6] + K[9]);
  out[o + 1] = y + (h / 6) * (K[1] + 2 * K[4] + 2 * K[7] + K[10]);
  out[o + 2] = z + (h / 6) * (K[2] + 2 * K[5] + 2 * K[8] + K[11]);
}

/** integrate(p0, h, n) -> Float64Array(3 (n + 1)): the state at every step, starting with p0 */
export function integrate(p0, h, n) {
  const P = new Float64Array(3 * (n + 1));
  P[0] = p0[0]; P[1] = p0[1]; P[2] = p0[2];
  for (let k = 0; k < n; k++) rk4(P[3 * k], P[3 * k + 1], P[3 * k + 2], h, P, 3 * k + 3);
  return P;
}

/** speed |v| of the flow at a point (for sound / checks) */
export function flowSpeed(x, y, z) {
  const o = new Float64Array(3);
  rhs(x, y, z, o, 0);
  return Math.sqrt(o[0] * o[0] + o[1] * o[1] + o[2] * o[2]);
}

/**
 * timeMap(knots) -> { tau(t), tOf(tau), rate(t) }: knots [[t, rate], ...] (t increasing), rate piecewise linear,
 * constant before the first and after the last knot. tau(0) = 0 when the first knot is at t = 0.
 */
export function timeMap(knots) {
  const n = knots.length;
  const cum = [0];
  for (let i = 1; i < n; i++) {
    const [t0, r0] = knots[i - 1], [t1, r1] = knots[i];
    cum.push(cum[i - 1] + (t1 - t0) * (r0 + r1) / 2);
  }
  const rate = (t) => {
    if (t <= knots[0][0]) return knots[0][1];
    for (let i = 1; i < n; i++) {
      const [t0, r0] = knots[i - 1], [t1, r1] = knots[i];
      if (t <= t1) return r0 + (r1 - r0) * (t - t0) / (t1 - t0);
    }
    return knots[n - 1][1];
  };
  const tau = (t) => {
    if (t <= knots[0][0]) return (t - knots[0][0]) * knots[0][1];
    for (let i = 1; i < n; i++) {
      const [t0, r0] = knots[i - 1], [t1, r1] = knots[i];
      if (t <= t1) {
        const u = t - t0, a = (r1 - r0) / (t1 - t0);
        return cum[i - 1] + r0 * u + 0.5 * a * u * u;
      }
    }
    return cum[n - 1] + (t - knots[n - 1][0]) * knots[n - 1][1];
  };
  const tOf = (s) => {
    if (s <= 0) return knots[0][0] + s / knots[0][1];
    for (let i = 1; i < n; i++) {
      if (s <= cum[i]) {
        const [t0, r0] = knots[i - 1], [t1, r1] = knots[i];
        const a = (r1 - r0) / (t1 - t0), d = s - cum[i - 1];
        if (Math.abs(a) < 1e-12) return t0 + d / r0;
        // 0.5 a u^2 + r0 u - d = 0, stable root
        const disc = Math.sqrt(Math.max(0, r0 * r0 + 2 * a * d));
        return t0 + (2 * d) / (r0 + disc);
      }
    }
    return knots[n - 1][0] + (s - cum[n - 1]) / knots[n - 1][1];
  };
  return { tau, tOf, rate, knots };
}

/** seeded mulberry32 (integer maths only: identical in Node and Chrome) */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist3 = (P, i, Q, j) => {
  const dx = P[3 * i] - Q[3 * j], dy = P[3 * i + 1] - Q[3 * j + 1], dz = P[3 * i + 2] - Q[3 * j + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/**
 * crossTrack(A, B, kTw, k, win) -> { d, s }: distance from the twin at step k (B index k - kTw) to the coral's PATH
 * (nearest of A[k - win .. k + win]) and the step shift s of that nearest point. A twin that merely lags a little along
 * the same track has a cross-track distance near zero; it grows only when the paths themselves part.
 */
export function crossTrack(A, B, kTw, k, win) {
  const nA = A.length / 3 - 1, j = k - kTw;
  const bx = B[3 * j], by = B[3 * j + 1], bz = B[3 * j + 2];
  let best = Infinity, bs = 0;
  for (let s = -win; s <= win; s++) {
    const q = k + s;
    if (q < 0 || q > nA) continue;
    const dx = A[3 * q] - bx, dy = A[3 * q + 1] - by, dz = A[3 * q + 2] - bz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) { best = d; bs = s; }
  }
  return { d: Math.sqrt(best), s: bs };
}

/**
 * createPlan(o) -> plan
 *   o: { h, knots, end, start:[x,y,z], preroll:[min, max, step] (tau), twinAt (s), dir:[x,y,z], geoEvery,
 *        split: { at, tol, sep, forkTau, forkX, agreeLead (s), agreeMax, crossWin (tau), rejoinMin, rejoinAfter (s),
 *                 delta: [lo, hi], ratio, minSwitches }, cloud: { at (s), count, radius, lead (tau), seed, h }, maxTries }
 *   plan: { T (timeMap), h, A, nA, kTw, tauTw, twinAt, B (B[3 j] = step kTw + j), nB, delta, split: {...},
 *           cloud: { at, tau0, h, n, count, P: [Float64Array], center }, headA(t), headB(t), sep(t), cloudAt(i, t), hash }
 */
export function createPlan(o) {
  const h = o.h ?? 0.002;
  const T = timeMap(o.knots);
  const end = o.end ?? 15;
  const tauEnd = T.tau(end + 0.1);
  const nA = Math.ceil(tauEnd / h);
  const S = o.split;
  const geo = o.geoEvery ?? 2;
  const kTw = Math.round(T.tau(o.twinAt) / (h * geo)) * geo;
  const tauTw = kTw * h;
  const dn = Math.sqrt(o.dir[0] * o.dir[0] + o.dir[1] * o.dir[1] + o.dir[2] * o.dir[2]);
  const dir = o.dir.map((v) => v / dn);
  const nB = nA - kTw;
  const kOf = (t) => Math.min(nA, Math.max(0, Math.round(T.tau(t) / h)));
  const kLate = kOf(S.at + S.tol + 0.05);
  const kForkMax = Math.round(S.forkTau / h);
  const win = Math.round((S.crossWin ?? 0.2) / h);

  // ONE long trajectory W from `start`; every candidate coral path A is a window of it beginning `preroll` tau in
  // (already on the attractor). A true split can only happen where the coral switches wings, so keep the windows whose
  // path switches wings near the target time (and at least `minSwitches` times before the twin starts, so the opening
  // loops visit both wings), in order of preroll; search the twin's offset for each until one works.
  const [p0min, p0max, p0step] = o.preroll ?? [20, 60, 0.05];
  const W = integrate(o.start ?? [1, 1, 20], h, Math.round(p0max / h) + nA + 1);
  const kSwitch0 = kOf(S.at - S.tol - 0.15), kSwitch1 = kOf(S.at + S.tol);
  const offsets = [];
  const stepK = Math.max(1, Math.round(p0step / h));
  for (let off = Math.round(p0min / h); off <= Math.round(p0max / h); off += stepK) {
    let near = false, before = 0;
    for (let k = 1; k <= kSwitch1; k++) {
      if (W[3 * (off + k)] * W[3 * (off + k - 1)] < 0) {
        if (k >= kSwitch0) near = true;
        else if (k < kTw) before++;
      }
    }
    if (near && before >= (S.minSwitches ?? 0)) offsets.push(off);
  }
  let A = null, pick = null, offPick = -1, cands = [], tried = 0;

  /**
   * evaluate one delta. The SPLIT is where the twins part for good: kOpp = the first step where they sit on opposite
   * wings (x of different sign, both |x| > forkX); kc = the step after the last one before kOpp with |A - B| <= sep
   * (where the gap opens and keeps opening); a true fork reaches opposite wings within forkTau of kc.
   */
  function trial(delta, full) {
    const b0 = [A[3 * kTw] + delta * dir[0], A[3 * kTw + 1] + delta * dir[1], A[3 * kTw + 2] + delta * dir[2]];
    const n = full ? nB : Math.min(nB, kLate - kTw + 2 * kForkMax + 2);
    const B = integrate(b0, h, n);
    let kOpp = -1;
    for (let j = 1; j <= n; j++) {
      const xa = A[3 * (kTw + j)], xb = B[3 * j];
      if (xa * xb < 0 && Math.abs(xa) > S.forkX && Math.abs(xb) > S.forkX) { kOpp = kTw + j; break; }
    }
    if (kOpp < 0) return { delta, kc: -1 };
    let kc = -1;
    for (let k = kOpp; k > kTw; k--) if (dist3(A, k, B, k - kTw) <= S.sep) { kc = k + 1; break; }
    if (kc < 0 || kOpp - kc > kForkMax) return { delta, kc: -1 };
    const res = { delta, kc, tc: T.tOf(kc * h), fork: kOpp, B };
    if (full) {
      // agreement: the twin stays ON the coral's path (cross-track distance) until agreeLead before the split
      const kAg = kOf(res.tc - S.agreeLead);
      let agree = 0;
      for (let k = kTw; k <= kAg; k += 4) agree = Math.max(agree, crossTrack(A, B, kTw, k, win).d);
      res.agree = agree;
      const k0 = kOf(res.tc + S.rejoinAfter);
      let minD = Infinity, kMin = -1;
      for (let k = k0; k <= nA; k++) { const d = dist3(A, k, B, k - kTw); if (d < minD) { minD = d; kMin = k; } }
      res.rejoin = { min: minD, t: T.tOf(kMin * h) };
    }
    return res;
  }

  // the search: a geometric grid of deltas, then the full check on the candidates closest to the target time
  // (grid by repeated multiplication: no pow, so both engines try the very same deltas)
  function searchDelta() {
    const [lo, hi] = S.delta;
    const ratio = S.ratio ?? 1.03;
    cands = [];
    for (let delta = lo; delta <= hi; delta *= ratio) {
      const r = trial(delta, false);
      if (r.kc >= 0 && Math.abs(r.tc - S.at) <= S.tol) cands.push(r);
    }
    cands.sort((a, b) => Math.abs(a.tc - S.at) - Math.abs(b.tc - S.at) || a.delta - b.delta);
    for (const c of cands.slice(0, 12)) {
      const r = trial(c.delta, true);
      if (o.debug) o.debug(`  window ${tried} d=${c.delta.toExponential(2)} tc=${r.tc.toFixed(2)} agree=${r.agree.toFixed(2)} rejoin=${r.rejoin.min.toFixed(2)}`);
      if (r.agree <= S.agreeMax && r.rejoin.min >= S.rejoinMin) return r;
    }
    return null;
  }

  for (const off of offsets) {
    if (tried >= (o.maxTries ?? 24)) break;
    tried++;
    A = W.slice(3 * off, 3 * (off + nA + 1));
    pick = searchDelta();
    if (pick) { offPick = off; break; }
  }
  if (!pick) {
    throw new Error(`strange-attractor: no start (${offsets.length} windows, ${tried} tried) and offset in [${S.delta}] parts the twins at ${S.at} +- ${S.tol} s on opposite wings, on one path before, never rejoining after`);
  }
  const B = pick.B;
  const delta = pick.delta;

  // the cloud: a speck around the coral's path at the fork (just before the split), released at cloud.at
  const C = o.cloud;
  const hc = C.h ?? 0.004;
  const kFork = Math.max(kTw, pick.kc - Math.round((C.lead ?? 0.2) / h));
  const c0 = [A[3 * kFork], A[3 * kFork + 1], A[3 * kFork + 2]];
  const tauC0 = T.tau(C.at);
  const nC = Math.ceil((tauEnd - tauC0) / hc) + 1;
  const rnd = mulberry(C.seed ?? 121);
  const cloudP = [];
  const starts = [];
  while (starts.length < C.count) {
    const u = 2 * rnd() - 1, v = 2 * rnd() - 1, w = 2 * rnd() - 1;
    if (u * u + v * v + w * w > 1) continue;
    starts.push([c0[0] + C.radius * u, c0[1] + C.radius * v, c0[2] + C.radius * w]);
  }
  for (const s of starts) cloudP.push(integrate(s, hc, nC));

  // lookups (linear interpolation between stored steps: well under a pixel)
  const lerpAt = (P, f, out, oo = 0) => {
    const n = P.length / 3 - 1;
    const ff = Math.min(n, Math.max(0, f));
    const i = Math.min(n - 1, Math.floor(ff)), u = ff - i;
    out[oo] = P[3 * i] + (P[3 * i + 3] - P[3 * i]) * u;
    out[oo + 1] = P[3 * i + 1] + (P[3 * i + 4] - P[3 * i + 1]) * u;
    out[oo + 2] = P[3 * i + 2] + (P[3 * i + 5] - P[3 * i + 2]) * u;
    return out;
  };
  const twinAt = T.tOf(tauTw);
  const headA = (t, out = [0, 0, 0]) => lerpAt(A, T.tau(t) / h, out);
  const headB = (t, out = [0, 0, 0]) => lerpAt(B, (T.tau(t) - tauTw) / h, out);
  const sep = (t) => {
    if (t < twinAt) return 0;
    const a = headA(t), b = headB(t);
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  };
  const cloudAt = (i, t, out = [0, 0, 0]) => lerpAt(cloudP[i], (T.tau(t) - tauC0) / hc, out);
  // wing switches of the coral (video times): for the camera and the score
  const switches = [];
  for (let k = 1; k <= nA; k++) if (A[3 * k] * A[3 * k - 3] < 0) switches.push(T.tOf(k * h));

  const plan = {
    T, h, end, tauEnd, A, nA, kTw, tauTw, twinAt, B, nB, delta, dir, win,
    split: { t: pick.tc, tau: pick.kc * h, k: pick.kc, forkT: T.tOf(pick.fork * h), agree: pick.agree, rejoin: pick.rejoin,
      candidates: cands.length, preroll: offPick * h, windows: offsets.length, tried },
    cloud: { at: C.at, tau0: tauC0, h: hc, n: nC, count: C.count, P: cloudP, center: c0, kFork, radius: C.radius },
    headA, headB, sep, cloudAt, switches,
  };
  plan.hash = tableHash(plan);
  return plan;
}

/**
 * tableHash(plan) -> 8 hex chars: FNV-1a over the raw bytes of A, B, every cloud path and delta. Node (sound, camera)
 * and Chrome (picture) each integrate the plan; this proves they agree to the bit.
 */
export function tableHash(plan) {
  let hh = 0x811c9dc5;
  const arrays = [plan.A, plan.B, ...plan.cloud.P, new Float64Array([plan.delta, plan.split.tau])];
  for (const arr of arrays) {
    const u = new Uint32Array(arr.buffer, arr.byteOffset, arr.length * 2);
    for (let k = 0; k < u.length; k++) {
      let w = u[k];
      for (let b = 0; b < 4; b++) { hh ^= w & 0xff; hh = Math.imul(hh, 0x01000193); w >>>= 8; }
    }
  }
  return (hh >>> 0).toString(16).padStart(8, "0");
}

/**
 * strand(plan, o) -> { tau, A, B, n, j0, every, cross, f }: DISPLAY centrelines (picture only; uses cos/sin), sampled every
 * `every` steps. While the twin is on the coral's path (cross-track distance below w0) both tubes are laid on that ONE
 * path, side by side and wound round each other (a two-colour twisted strand, one full turn per `twist` units of arc
 * length), each at its own head position along it; from w0 to w1 the display blends to the true positions; beyond w1
 * (and for good: the running maximum is used) it IS the true path. The twin emerges from inside the coral tube over
 * `ramp` tau after it starts. o: { every, rOff, twist, w0, w1, ramp }
 */
export function strand(plan, o) {
  const every = o.every ?? 2, h = plan.h, A = plan.A, B = plan.B, kTw = plan.kTw;
  const n = Math.floor(plan.nA / every) + 1;
  const j0 = kTw / every; // first display sample of the twin
  const tau = new Float64Array(n);
  for (let j = 0; j < n; j++) tau[j] = j * every * h;
  // twisted frame U along the coral path (parallel transport + twist by arc length)
  const U = new Float64Array(3 * n);
  let nx = 0, ny = 0, nz = 1, arc = 0;
  for (let j = 0; j < n; j++) {
    const a = Math.max(0, j - 1) * every, b = Math.min(n - 1, j + 1) * every, k = j * every;
    let tx = A[3 * b] - A[3 * a], ty = A[3 * b + 1] - A[3 * a + 1], tz = A[3 * b + 2] - A[3 * a + 2];
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    if (j === 0) { const ax = Math.abs(tx) < 0.9 ? 1 : 0, ay = 1 - ax; nx = ay * tz; ny = -ax * tz; nz = ax * ty - ay * tx; }
    const dp = nx * tx + ny * ty + nz * tz;
    nx -= dp * tx; ny -= dp * ty; nz -= dp * tz;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
    if (j > 0) { const q = k - every; arc += Math.sqrt((A[3 * k] - A[3 * q]) ** 2 + (A[3 * k + 1] - A[3 * q + 1]) ** 2 + (A[3 * k + 2] - A[3 * q + 2]) ** 2); }
    const ph = (arc / o.twist) * Math.PI * 2, c = Math.cos(ph), sn = Math.sin(ph);
    U[3 * j] = c * nx + sn * bx; U[3 * j + 1] = c * ny + sn * by; U[3 * j + 2] = c * nz + sn * bz;
  }
  const ss = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
  // cross-track distance (running max) and blend factor per sample
  const cross = new Float64Array(n), f = new Float64Array(n), shift = new Int32Array(n);
  let run = 0;
  for (let j = j0; j < n; j++) {
    const k = j * every;
    if (k - kTw > plan.nB) break;
    const ct = crossTrack(A, B, kTw, k, plan.win);
    run = Math.max(run, ct.d);
    cross[j] = run; shift[j] = ct.s;
    f[j] = ss(0, o.ramp, tau[j] - plan.tauTw) * (1 - ss(o.w0, o.w1, run));
  }
  const DA = new Float64Array(3 * n), DB = new Float64Array(3 * (n - j0));
  for (let j = 0; j < n; j++) {
    const k = j * every;
    for (let c = 0; c < 3; c++) DA[3 * j + c] = A[3 * k + c] + f[j] * U[3 * j + c] * o.rOff;
    if (j < j0) continue;
    // the twin sits on the coral's track at its nearest point (shift), on the other side of the strand
    const jj = Math.min(n - 1, Math.max(0, Math.round((k + shift[j]) / every)));
    const kk = Math.min(plan.nA, Math.max(0, k + shift[j]));
    for (let c = 0; c < 3; c++) {
      const b = B[3 * (k - kTw) + c];
      DB[3 * (j - j0) + c] = b + f[j] * (A[3 * kk + c] - U[3 * jj + c] * o.rOff - b);
    }
  }
  return { tau, A: DA, B: DB, n, j0, every, cross, f };
}

/**
 * noteEvents(plan, o) -> [{ t, kind, who, z, semi }]: the score's notes, all from the tables.
 *   Each bead sings a note every `step` s (from its start); its pitch is its height mapped to semitones and snapped
 *   to `scale`. While the twins are within one semitone of each other, the twin keeps the coral note plus the tiny
 *   exact difference (a slow beat between the two voices); beyond that each sings its own snapped line.
 *   o: { step, zMid, semiPerUnit, scale, cloudVoices, cloudStep, end }
 */
export function noteEvents(plan, o) {
  const ev = [];
  const snap = (s) => {
    const oct = Math.floor(s / 12), r = s - oct * 12;
    let best = o.scale[0], bd = Infinity;
    for (const q of [...o.scale, o.scale[0] + 12]) { const d = Math.abs(q - r); if (d < bd) { bd = d; best = q; } }
    return oct * 12 + best;
  };
  const semiOf = (z) => (z - o.zMid) * o.semiPerUnit;
  const end = o.end ?? plan.end;
  for (let k = 0; ; k++) {
    const t = 0.05 + k * o.step;
    if (t > end - 0.25) break;
    const a = plan.headA(t);
    const sa = semiOf(a[2]), qa = snap(sa);
    ev.push({ t, kind: "note", who: 0, z: a[2], semi: qa, x: a[0] });
    if (t >= plan.twinAt) {
      const b = plan.headB(t);
      const sb = semiOf(b[2]);
      const near = Math.abs(sb - sa) < 1;
      ev.push({ t, kind: "note", who: 1, z: b[2], semi: near ? qa + (sb - sa) : snap(sb), x: b[0], near });
    }
  }
  if (o.cloudVoices) {
    const C = plan.cloud;
    for (let v = 0; v < o.cloudVoices; v++) {
      const i = Math.floor((v * C.count) / o.cloudVoices);
      for (let k = 0; ; k++) {
        const t = C.at + 0.1 + (v / o.cloudVoices) * o.cloudStep + k * o.cloudStep;
        if (t > end - 0.3) break;
        const p = plan.cloudAt(i, t);
        ev.push({ t, kind: "cloud", who: 2 + v, z: p[2], semi: snap(semiOf(p[2])), x: p[0], u: (t - C.at) / (end - C.at) });
      }
    }
  }
  return ev.sort((p, q) => p.t - q.t || p.who - q.who);
}
