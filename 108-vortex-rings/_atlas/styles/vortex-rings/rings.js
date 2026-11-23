// styles/vortex-rings/rings.js — the numerical heart of "Vortex Rings". THREE-free, window-free, Node-safe: imported by
// style.js (picture) AND by scene.config.js (camera keys, framing gate, SCORE), so sound and picture read the same table.
//
// Model: N coaxial thin-cored vortex rings (axis = +x). Each ring i has circulation G_i, radius R_i, axial position X_i
// and a core radius a_i. Per ring:
//   dX_i/dt = U_self(i) + u_x(induced by every other ring at the core circle of i)
//   dR_i/dt =             u_r(induced by every other ring at the core circle of i)
//   U_self  = G / (4 pi R) * (ln(8R/a) - 1/4)                    (Kelvin / Saffman thin ring, uniform core)
//   induced = Biot–Savart of a circular filament: Stokes stream function
//             psi = G/(2 pi) sqrt(r R') [ (2/k - k) K(k) - (2/k) E(k) ],  k^2 = 4 r R' / ((x-x')^2 + (r+R')^2)
//             u_x = (1/r) d psi/dr,  u_r = -(1/r) d psi/dx   (central differences; K, E by the AGM)
//   core    = a^2 = (a0^2 + 4 nu tau) * R0 / R   (volume conservation of the core while it stretches + slow viscous growth)
//   spin    = d phi/dt = G / (2 pi a^2)  (solid-body rotation of the core: the smoke's roll)
// Integrated ONCE with classic fixed-step RK4 (dt = 1/480 s) from the first launch to `end`; states stored every step;
// state(i, t) interpolates linearly between stored steps (well below a pixel at 30 fps). A ring exists from its launch
// time on; before that it is not in the system. The leapfrog / pass-through is NOT keyframed: it comes out of the
// mutual induction. Units: metres, seconds. Seeded nothing: the dynamics use only + - * /, Math.sqrt and detLog
// (no engine-dependent transcendental), so Node and Chrome store bit-identical tables (tableHash).

const PI = Math.PI;

/** complete elliptic integrals K(k), E(k) by the arithmetic–geometric mean (modulus k, 0 <= k < 1) */
export function ellipKE(k) {
  let a = 1, b = Math.sqrt(Math.max(0, 1 - k * k)), c = k;
  let sum = 0.5 * c * c, p = 0.5;
  for (let n = 0; n < 40; n++) {
    const an = (a + b) / 2, bn = Math.sqrt(a * b);
    c = (a - b) / 2; a = an; b = bn; p *= 2;
    sum += p * c * c;
    if (Math.abs(c) < 1e-16) break;
  }
  const K = PI / (2 * a);
  return { K, E: K * (1 - sum) };
}

/** Stokes stream function of a ring filament (G, radius R, at axial x0) at meridional point (r, x) */
export function ringPsi(G, R, x0, r, x) {
  const dx = x - x0;
  const den = dx * dx + (r + R) * (r + R);
  const k2 = (4 * r * R) / den;
  const k = Math.sqrt(Math.min(k2, 1 - 1e-14));
  if (k < 1e-9) return 0;
  const { K, E } = ellipKE(k);
  return (G / (2 * PI)) * Math.sqrt(r * R) * ((2 / k - k) * K - (2 / k) * E);
}

/** velocity [u_x, u_r] induced by a ring filament (G, R at x0) at (r, x); central differences of the stream function */
export function ringVel(G, R, x0, r, x) {
  const h = 1e-5 * Math.max(R, r, 1e-3);
  const dpr = (ringPsi(G, R, x0, r + h, x) - ringPsi(G, R, x0, r - h, x)) / (2 * h);
  const dpx = (ringPsi(G, R, x0, r, x + h) - ringPsi(G, R, x0, r, x - h)) / (2 * h);
  return [dpr / r, -dpx / r];
}

/**
 * detLog(x): natural log from + - * / only (power-of-two range reduction, then the atanh series), so Node and Chrome
 * get the same bits. Math.log is not required to be exactly rounded and differed between the two (measured: the
 * stored table hashed b3c4f6b9 in Node and af680bc0 in the page). Accurate to ~1 ulp-ish for x > 0.
 */
const LN2 = 0.6931471805599453;
export function detLog(x) {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  let e = 0;
  while (x >= 2) { x /= 2; e++; }
  while (x < 1) { x *= 2; e--; }
  if (x > 1.4142135623730951) { x /= 2; e++; }
  const s = (x - 1) / (x + 1), s2 = s * s;
  let term = s, sum = 0;
  for (let n = 1; n < 40; n += 2) { sum += term / n; term *= s2; }
  return e * LN2 + 2 * sum;
}

/** self-induced speed of a thin ring with a uniform core */
export const selfSpeed = (G, R, a) => (G / (4 * PI * R)) * (detLog((8 * R) / a) - 0.25);

/**
 * createPlan({ rings, nu, dt, end, start }) -> plan
 *   rings: [{ id, launch (s), x0 (m, where it is born), R0, a0, G }]
 *   plan.state(i, t) -> { alive, age, x, R, a, U, Ur, spin, G } | { alive:false }
 *   plan.table: { t:[], rings:[{ x:[], R:[], phi:[], U:[], Ur:[] }] } (step dt)
 *   plan.pass: [{ t, front, rear }] times where the rear ring's centre plane crosses the front ring's (the threading)
 *   plan.impulse: { start, end, drift } total G R^2 (the model's conserved impulse) — a self-check of the integrator
 */
export function createPlan({ rings, nu = 0, dt = 1 / 480, end = 15, start = null }) {
  const n = rings.length;
  const t0 = start ?? Math.min(...rings.map((r) => r.launch));
  const steps = Math.ceil((end - t0) / dt) + 1;
  const core = (i, R, tau) => Math.sqrt((rings[i].a0 * rings[i].a0 + 4 * nu * Math.max(0, tau)) * rings[i].R0 / R);

  // state vector per ring: [x, R, phi]
  function deriv(t, S, out) {
    for (let i = 0; i < n; i++) {
      const g = rings[i];
      if (t < g.launch - 1e-12) { out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = 0; continue; }
      const x = S[i * 3], R = S[i * 3 + 1];
      const a = core(i, R, t - g.launch);
      let ux = selfSpeed(g.G, R, a), ur = 0;
      for (let j = 0; j < n; j++) {
        if (j === i || t < rings[j].launch - 1e-12) continue;
        const xj = S[j * 3], Rj = S[j * 3 + 1];
        const aj = core(j, Rj, t - rings[j].launch);
        const v = ringVel(rings[j].G, Rj, xj, R, x);
        // soften inside the cores: two filaments never get closer than their smoke
        const d2 = (x - xj) * (x - xj) + (R - Rj) * (R - Rj), s = d2 / (d2 + a * a + aj * aj);
        ux += v[0] * s; ur += v[1] * s;
      }
      out[i * 3] = ux; out[i * 3 + 1] = ur; out[i * 3 + 2] = g.G / (2 * PI * a * a);
    }
    return out;
  }

  const T = new Float64Array(steps);
  const X = rings.map(() => new Float64Array(steps)), RR = rings.map(() => new Float64Array(steps)), PH = rings.map(() => new Float64Array(steps));
  const UX = rings.map(() => new Float64Array(steps)), UR = rings.map(() => new Float64Array(steps));
  let S = new Float64Array(n * 3);
  rings.forEach((g, i) => { S[i * 3] = g.x0; S[i * 3 + 1] = g.R0; S[i * 3 + 2] = 0; });
  const k1 = new Float64Array(n * 3), k2 = new Float64Array(n * 3), k3 = new Float64Array(n * 3), k4 = new Float64Array(n * 3), tmp = new Float64Array(n * 3);
  const record = (s, t) => {
    T[s] = t;
    deriv(t, S, k1);
    for (let i = 0; i < n; i++) { X[i][s] = S[i * 3]; RR[i][s] = S[i * 3 + 1]; PH[i][s] = S[i * 3 + 2]; UX[i][s] = k1[i * 3]; UR[i][s] = k1[i * 3 + 1]; }
  };
  let t = t0;
  record(0, t);
  for (let s = 1; s < steps; s++) {
    deriv(t, S, k1);
    for (let q = 0; q < n * 3; q++) tmp[q] = S[q] + 0.5 * dt * k1[q];
    deriv(t + 0.5 * dt, tmp, k2);
    for (let q = 0; q < n * 3; q++) tmp[q] = S[q] + 0.5 * dt * k2[q];
    deriv(t + 0.5 * dt, tmp, k3);
    for (let q = 0; q < n * 3; q++) tmp[q] = S[q] + dt * k3[q];
    deriv(t + dt, tmp, k4);
    const Sn = new Float64Array(n * 3);
    for (let q = 0; q < n * 3; q++) Sn[q] = S[q] + (dt / 6) * (k1[q] + 2 * k2[q] + 2 * k3[q] + k4[q]);
    S = Sn;
    t = t0 + s * dt;
    record(s, t);
    for (let i = 0; i < n; i++) if (!(Number.isFinite(S[i * 3]) && S[i * 3 + 1] > 0)) throw new Error(`vortex-rings: ring ${i} blew up at t=${t.toFixed(3)}`);
  }

  function state(i, tq) {
    const g = rings[i];
    if (tq < g.launch) return { alive: false, age: tq - g.launch, x: g.x0, R: g.R0, a: g.a0, U: 0, Ur: 0, spin: 0, G: g.G };
    const f = Math.min(steps - 1, Math.max(0, (tq - t0) / dt));
    const s = Math.min(steps - 2, Math.floor(f)), u = f - s;
    const L = (A) => A[s] + (A[s + 1] - A[s]) * u;
    const R = L(RR[i]);
    return { alive: true, age: tq - g.launch, x: L(X[i]), R, a: core(i, R, tq - g.launch), U: L(UX[i]), Ur: L(UR[i]), spin: L(PH[i]), G: g.G };
  }

  // the threading: the rear ring's centre plane crosses the front ring's
  const pass = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const from = Math.max(rings[i].launch, rings[j].launch);
    for (let s = 1; s < steps; s++) {
      if (T[s - 1] < from) continue;
      const d0 = X[i][s - 1] - X[j][s - 1], d1 = X[i][s] - X[j][s];
      if (d0 < 0 && d1 >= 0) pass.push({ t: T[s - 1] + dt * (d0 / (d0 - d1)), front: j, rear: i, Rrear: RR[i][s], Rfront: RR[j][s] });
    }
  }
  pass.sort((a, b) => a.t - b.t);

  const impulseAt = (s) => rings.reduce((acc, g, i) => acc + (T[s] >= g.launch ? g.G * RR[i][s] * RR[i][s] : 0), 0);
  const lastLaunch = Math.max(...rings.map((r) => r.launch));
  const sL = Math.min(steps - 1, Math.ceil((lastLaunch - t0) / dt) + 1);
  const imp0 = impulseAt(sL), imp1 = impulseAt(steps - 1);

  return {
    rings, dt, t0, end, steps, state, pass,
    table: { t: T, rings: rings.map((_, i) => ({ x: X[i], R: RR[i], phi: PH[i], U: UX[i], Ur: UR[i] })) },
    impulse: { start: imp0, end: imp1, drift: Math.abs(imp1 - imp0) / Math.max(1e-12, Math.abs(imp0)) },
    /** maxima over [ta, tb] of a ring's axial speed (for sound scaling) */
    speedRange(i, ta = t0, tb = end) {
      let lo = Infinity, hi = -Infinity;
      for (let s = 0; s < steps; s++) if (T[s] >= Math.max(ta, rings[i].launch) && T[s] <= tb) { lo = Math.min(lo, UX[i][s]); hi = Math.max(hi, UX[i][s]); }
      return [lo, hi];
    },
  };
}

/**
 * soundEvents(plan, { taps, step, end }) -> [{ t, kind, ring, speed, rel }]: everything the score hears, from the plan.
 *   taps: [{ t, ring, hard }] (the drum hits), step: seconds between "air" samples of each travelling ring.
 */
export function soundEvents(plan, { taps = [], step = 0.4, end = plan.end } = {}) {
  const ev = [];
  for (const tp of taps) ev.push({ t: tp.t, kind: "tap", ring: tp.ring, hard: tp.hard ?? 0 });
  let vmax = 0;
  plan.rings.forEach((g, i) => { vmax = Math.max(vmax, plan.speedRange(i)[1]); });
  plan.rings.forEach((g, i) => {
    for (let t = g.launch + 0.05; t < end - 0.3; t += step) {
      const s = plan.state(i, t);
      ev.push({ t, kind: "air", ring: i, speed: s.U, rel: s.U / vmax, x: s.x });
    }
  });
  for (const p of plan.pass) if (p.t > 0 && p.t < end) ev.push({ t: p.t - 0.35, kind: "pass", ring: p.rear, rel: 1 });
  return ev.sort((a, b) => a.t - b.t);
}

/**
 * tableHash(plan) -> 8 hex chars: FNV-1a over the raw bytes of every stored step (t, and per ring x, R, phi, U, Ur).
 * Node (sound, camera keys) and Chrome (picture) each integrate the plan themselves; this proves they agree to the bit.
 */
export function tableHash(plan) {
  let h = 0x811c9dc5;
  const arrays = [plan.table.t];
  for (const r of plan.table.rings) arrays.push(r.x, r.R, r.phi, r.U, r.Ur);
  for (const arr of arrays) {
    const u = new Uint32Array(arr.buffer, arr.byteOffset, arr.length * 2);
    for (let k = 0; k < u.length; k++) {
      let w = u[k];
      for (let b = 0; b < 4; b++) { h ^= w & 0xff; h = Math.imul(h, 0x01000193); w >>>= 8; }
    }
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
