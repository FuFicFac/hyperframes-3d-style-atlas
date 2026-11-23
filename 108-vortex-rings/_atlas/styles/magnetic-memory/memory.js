// styles/magnetic-memory/memory.js — the plan for "Magnetic Memory". Pure: no THREE, no window, no DOM.
// Imported by style.js (the picture) AND by the demo's scene.config.js (camera, SCORE), so every flip and every click
// comes from the same schedule.
//
// Model (analytical with memory):
//   - A board of cols x rows latching tiles. Tile i has a seeded initial state (0 = pale up, 1 = dark up) and a seeded
//     coercive threshold c_i (log-normal around `coerc.median`).
//   - The magnet is a vertical bar on a handle: two point poles, the near one at height h above the tiles, the far one
//     at h + L. Its pose (x, z, h, polarity) is a smooth cubic-Hermite curve through keys in t: no stepping.
//     The vertical pull at a tile: Bz = pol * q * ( h / r1^3 - (h + L) / r2^3 ), r1 / r2 = distance to each pole.
//     pol = +1 (red end down) pushes tiles to dark, pol = -1 (silver end down) pushes them to pale.
//   - A tile flips at the FIRST time the push against its current state exceeds its threshold (hysteresis: it then
//     latches; nothing pulls it back unless an opposite push exceeds the threshold later). Flip times are found once at
//     load by sampling the known path at `dt` and interpolating the crossing (no physics stepping, no state per frame).
//   - The flip itself is a short damped swing (closed-form spring) about the tile's axle; before a flip, a tile that is
//     being pushed tilts a little toward the magnet (tilt ~ (push / threshold)^2), and relaxes when the magnet leaves.
//   - Beat 1 "settle": a seeded share of tiles flip once into their initial state in the first ~1.6 s (art-directed:
//     the board was just shaken), so the mechanic is visible from the first second.
import { rng, clamp, spring } from "../../kit/time.js";

const TAU = Math.PI * 2;

/** cubic Hermite through keys [{ t, ...fields }] (Catmull-Rom tangents, non-uniform); holds outside the key range */
export function hermite(keys, t, field) {
  const n = keys.length;
  if (t <= keys[0].t) return keys[0][field];
  if (t >= keys[n - 1].t) return keys[n - 1][field];
  let k = 0;
  while (k < n - 2 && t > keys[k + 1].t) k++;
  const a = keys[k], b = keys[k + 1];
  const h = b.t - a.t, u = (t - a.t) / h;
  const tan = (i) => {
    const p = keys[Math.max(0, i - 1)], q = keys[Math.min(n - 1, i + 1)];
    if (keys[i].hold) return 0;
    return (q[field] - p[field]) / Math.max(1e-6, q.t - p.t);
  };
  const m0 = tan(k) * h, m1 = tan(k + 1) * h;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a[field] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * b[field] + (u3 - u2) * m1;
}

/** pole-pair vertical pull at horizontal distance^2 d2 for near-pole height h and bar length L (q = 1) */
export function pull(d2, h, L) {
  const H = h + L;
  const r1 = d2 + h * h, r2 = d2 + H * H;
  return h / (r1 * Math.sqrt(r1)) - H / (r2 * Math.sqrt(r2));
}

/**
 * planMemory(o) -> plan
 *   o = { cols, rows, pitch, seed, darkShare, coerc: { median, sigma }, settle: { share, t0, t1 },
 *         magnet: { q, L }, passes: [{ id, pol, from, to, keys: [{ t, x, z, h, hold? }] }], dt,
 *         swing: { stiffness, damping }, tilt: { max, show } }
 *   Plan API: tileXZ(i), magnetAt(t), push(i, t), angle(i, t), stateAt(i, t), flipsOf(i), events({ binHz }), stats
 */
export function planMemory(o) {
  const { cols, rows, pitch, seed } = o;
  const N = cols * rows;
  const R = rng(seed);
  const X = new Float64Array(N), Z = new Float64Array(N), C = new Float64Array(N);
  const init = new Uint8Array(N);
  const settleT = new Float64Array(N).fill(Infinity);
  const settleDir = new Int8Array(N);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    X[i] = (c - (cols - 1) / 2) * pitch;
    Z[i] = (r - (rows - 1) / 2) * pitch;
  }
  // seeded draws in a fixed order (one fork per quantity, so changing one knob does not reshuffle the others)
  const Rs = R.fork(1), Rc = R.fork(2), Rf = R.fork(3);
  for (let i = 0; i < N; i++) init[i] = Rs.next() < o.darkShare ? 1 : 0;
  for (let i = 0; i < N; i++) C[i] = o.coerc.median * Math.exp(o.coerc.sigma * Rc.gaussian(0, 1));
  for (let i = 0; i < N; i++) {
    if (Rf.next() < o.settle.share) {
      // settle times bunched early (the first second is busy), tailing off by t1
      const u = Rf.next();
      settleT[i] = o.settle.t0 + (o.settle.t1 - o.settle.t0) * u * u;
      settleDir[i] = Rf.next() < 0.5 ? 1 : -1;
    } else { Rf.next(); Rf.next(); }
  }

  const { q, L } = o.magnet;
  const passes = o.passes;
  /** magnet pose at t: { x, z, h, pol, on, pass } (on = inside a pass window: visible and pulling) */
  const magnetAt = (t) => {
    for (const P of passes) {
      if (t >= P.from && t <= P.to) {
        return { x: hermite(P.keys, t, "x"), z: hermite(P.keys, t, "z"), h: hermite(P.keys, t, "h"), pol: P.pol, on: true, pass: P.id };
      }
    }
    return { x: 0, z: 0, h: 99, pol: 0, on: false, pass: null };
  };
  /** signed push at tile i from pose m: > 0 toward dark, < 0 toward pale */
  const pushFrom = (i, m) => {
    if (!m.on) return 0;
    const dx = X[i] - m.x, dz = Z[i] - m.z;
    return m.pol * q * pull(dx * dx + dz * dz, m.h, L);
  };

  // ---- flip schedule: sample each pass window, first crossing of the threshold against the current state
  const flips = Array.from({ length: N }, () => []); // [{ t, to, dir, pass }]
  const state = new Uint8Array(init);
  const dt = o.dt ?? 1 / 240;
  const prev = new Float64Array(N);
  let maxPush = [0, 0];
  passes.forEach((P, pi) => {
    const n = Math.ceil((P.to - P.from) / dt);
    let m = magnetAt(P.from);
    for (let i = 0; i < N; i++) prev[i] = pushFrom(i, m);
    for (let s = 1; s <= n; s++) {
      const t = Math.min(P.to, P.from + s * dt), t0 = Math.min(P.to, P.from + (s - 1) * dt);
      m = magnetAt(t);
      for (let i = 0; i < N; i++) {
        const f = pushFrom(i, m);
        if (Math.abs(f) > maxPush[pi]) maxPush[pi] = Math.abs(f);
        const against = state[i] === 0 ? f : -f;           // push toward the other state
        const before = state[i] === 0 ? prev[i] : -prev[i];
        if (against > C[i]) {
          const u = before < C[i] ? clamp((C[i] - before) / Math.max(1e-9, against - before)) : 0;
          const tf = t0 + (t - t0) * u;
          const mf = magnetAt(tf);
          const dir = mf.z < Z[i] ? 1 : -1;               // the edge nearer the magnet lifts first
          state[i] = 1 - state[i];
          flips[i].push({ t: tf, to: state[i], dir, pass: P.id });
        }
        prev[i] = f;
      }
    }
  });

  const SW = o.swing, TILT = o.tilt.max;
  /** settled state at t (after any flip that has started) */
  const stateAt = (i, t) => {
    let s = init[i];
    if (Number.isFinite(settleT[i]) && t < settleT[i]) s = 1 - s;
    for (const f of flips[i]) if (t >= f.t) s = f.to;
    return s;
  };
  /**
   * angle(i, t, m?) -> rotation about the tile's axle (radians; a multiple of PI = latched, even = pale up, odd = dark up).
   *   During a flip: the damped swing from the last flip (starting from the pre-flip tilt). Otherwise: the latched angle,
   *   plus a small tilt toward the magnet while a push works against the latched face. m = magnetAt(t) (pass it in when
   *   evaluating every tile of one frame).
   */
  const angleFull = (i, t, m = magnetAt(t)) => {
    let kNow; // latched multiple of PI at t
    let lastFlip = null;
    let k = (init[i] ? 1 : 0);
    if (Number.isFinite(settleT[i])) {
      const k0 = k + settleDir[i];
      if (t < settleT[i]) kNow = k0;
      else { lastFlip = { t: settleT[i], from: k0, dir: -settleDir[i], tilt: 0 }; kNow = k; }
    } else kNow = k;
    for (const f of flips[i]) {
      if (t < f.t) break;
      lastFlip = { t: f.t, from: kNow, dir: f.dir, tilt: TILT };
      kNow = kNow + f.dir;
    }
    if (lastFlip) {
      const tau = t - lastFlip.t;
      if (tau < 1.2) return Math.PI * lastFlip.from + lastFlip.dir * (lastFlip.tilt + (Math.PI - lastFlip.tilt) * spring(tau, SW));
    }
    const base = Math.PI * kNow;
    if (!m.on || !o.tilt.show) return base;
    const f = pushFrom(i, m);
    const s = ((kNow % 2) + 2) % 2;
    const against = s === 0 ? f : -f;
    if (against <= 0) return base;
    const dir = m.z < Z[i] ? 1 : -1;
    const r = Math.min(1, against / C[i]);
    return base + dir * TILT * r * r;
  };

  // ---- stats (for NOTES and tuning)
  const count = (fn) => { let n = 0; for (let i = 0; i < N; i++) if (fn(i)) n++; return n; };
  const tEnd = passes[passes.length - 1].to + 1;
  const byPass = Object.fromEntries(passes.map((P) => [P.id, count((i) => flips[i].some((f) => f.pass === P.id))]));
  const darkAt = (t) => count((i) => stateAt(i, t) === 1);
  const stats = {
    tiles: N, initialDark: count((i) => init[i] === 1), settleFlips: count((i) => Number.isFinite(settleT[i])),
    flipsByPass: byPass,
    toPale2: count((i) => flips[i].some((f) => f.pass === passes[passes.length - 1].id && f.to === 0)),
    toDark2: count((i) => flips[i].some((f) => f.pass === passes[passes.length - 1].id && f.to === 1)),
    dark: { start: darkAt(2.0), afterPass1: darkAt(passes[0].to + 0.01), end: darkAt(tEnd) },
    maxPush: maxPush.map((v) => +v.toFixed(3)), medianThreshold: o.coerc.median,
  };

  /** sound events: one per 1/binHz bin of flips, by kind ("settle" | pass id), n = count, plus mean x for pan */
  const events = ({ binHz = 30 } = {}) => {
    const bins = new Map();
    const add = (t, kind, x) => {
      const b = Math.floor(t * binHz), key = `${kind}:${b}`;
      const e = bins.get(key) ?? { t: (b + 0.5) / binHz, kind, n: 0, sx: 0, bin: b };
      e.n++; e.sx += x; bins.set(key, e);
    };
    for (let i = 0; i < N; i++) {
      if (Number.isFinite(settleT[i])) add(settleT[i], "settle", X[i]);
      for (const f of flips[i]) add(f.t, f.pass, X[i]);
    }
    const halfW = ((cols - 1) / 2) * pitch;
    return [...bins.values()].map((e) => ({ t: e.t, kind: e.kind, n: e.n, bin: e.bin, x: e.sx / e.n / halfW })).sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : 1));
  };

  return {
    cols, rows, pitch, N, X, Z, C, init, flips, settleT, passes,
    tileXZ: (i) => [X[i], Z[i]],
    magnetAt, push: (i, t) => pushFrom(i, magnetAt(t)), pushFrom,
    angle: angleFull, stateAt, flipsOf: (i) => flips[i], events, stats, TAU,
  };
}

/** memoryVoices(spec.sound) -> voices for kit/schedule.scoreFromEvents (click runs; sparser and softer on pass 2) */
export function memoryVoices(S) {
  const run = (V) => (e) => [{
    type: "click", dur: 0.028,
    gain: V.gain * Math.min(1, V.base + V.per * Math.sqrt(e.n)),
    pitch: V.pitch * (0.86 + 0.28 * ((e.bin * 7919) % 97) / 97),
    pan: clamp(e.x * 0.7, -0.7, 0.7),
  }];
  return { settle: run(S.settle), pass1: run(S.pass1), pass2: run(S.pass2) };
}
