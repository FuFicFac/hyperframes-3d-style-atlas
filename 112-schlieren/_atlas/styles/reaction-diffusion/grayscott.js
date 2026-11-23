// styles/reaction-diffusion/grayscott.js — the Gray–Scott planner (Node-safe: no THREE, no window, no DOM).
// Imported by style.js (the picture reads its stored states) and by scene.config.js (SCORE, framing), so the sound and
// the image come from the same simulation.
//
// The model (numerically simulated, run ONCE when the module's createPlan is called — never inside renderAt):
//   Two substances U (the "feed", everywhere at first) and V (the "activator" carried by the drops) on a square grid
//   clipped to a circular dish. Each step (explicit Euler, dt = 1, 9-point Laplacian 0.2 / 0.05 / -1):
//     u' = u + Du*lap(u) - u*v*v + F*(1 - u)
//     v' = v + Dv*lap(v) + u*v*v - (F + k)*v
//   The dish rim is no-flux (outside cells that touch the dish copy their nearest inside neighbour; o.rim = "fixed"
//   holds them at u = 1, v = 0 instead). Drops are discs of v (with seeded noise) injected at
//   the step that matches their landing time. F and k follow a schedule keyed by VIDEO time (art-directed: a
//   spot-splitting regime first, then eased toward a stripe/maze regime so the fronts lock into stripes).
//   Video time -> simulation steps is a monotone piecewise-linear clock (a time-lapse that speeds up after the drops).
//   A state of V is stored every `storeEvery` seconds of video as bytes; the scene blends the two neighbouring states.
//   Every cell also remembers WHICH drop's pattern reached it first (a passive "colony" label, the label of the
//   strongest labelled neighbour when v first passes `claimAt`) so the picture can tint territories.
// Grid coordinates: (i, j) = column, row; dish coords (x, y) in 0..1 with (0.5, 0.5) the dish centre.
import { rng, clamp } from "../../kit/time.js";

/** piecewise-linear monotone map through [[x, y], ...] (holds the ends) */
function piecewise(keys, x) {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [x1, y1] = keys[i];
    if (x <= x1) {
      const [x0, y0] = keys[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return keys[keys.length - 1][1];
}
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

/** F/k at video time t from a schedule [{ t, F, k }] (smoothstep between keys) */
export function paramsAt(schedule, t) {
  if (t <= schedule[0].t) return { F: schedule[0].F, k: schedule[0].k };
  for (let i = 1; i < schedule.length; i++) {
    const b = schedule[i];
    if (t <= b.t) {
      const a = schedule[i - 1], u = sstep(a.t, b.t, t);
      return { F: a.F + (b.F - a.F) * u, k: a.k + (b.k - a.k) * u };
    }
  }
  const z = schedule[schedule.length - 1];
  return { F: z.F, k: z.k };
}

/**
 * createPlan(o) -> plan
 *   o = {
 *     n: 160,                    grid size (cells per side)
 *     radius: 76,                dish radius in cells (centred)
 *     Du: 1, Dv: 0.5,            diffusion rates (cells^2 per step)
 *     clock: [[t, steps], ...],  video seconds -> cumulative simulation steps (monotone)
 *     schedule: [{ t, F, k }],   feed / kill keyed by video time
 *     seeds: [{ x, y, r, t }],   drops: dish coords, radius in cells, landing time (s)
 *     seedNoise: .15, seed: 109,
 *     storeEvery: .5, duration: 15, vMax: .5, claimAt: .18,
 *   }
 *   plan = { n, radius, layers, times, states (Uint8Array layers*n*n), labels (Uint8Array n*n, 0 = none, 1..S),
 *            coverage[], activity[], mask, stepsAt(t), layerAt(t) -> { i, f }, coverageAt(t), activityAt(t),
 *            steps }
 */
export function createPlan(o) {
  const N = o.n ?? 160, R = o.radius ?? N * 0.475, Du = o.Du ?? 1, Dv = o.Dv ?? 0.5;
  const W = N + 2; // padded row width: a one-cell border that is always outside the dish
  const size = W * W;
  let u = new Float32Array(size).fill(1), v = new Float32Array(size);
  let u2 = new Float32Array(size).fill(1), v2 = new Float32Array(size);
  const lab = new Uint8Array(size);
  const c = (N - 1) / 2;
  // per-row x range inside the dish (padded indices)
  const rowLo = new Int32Array(W), rowHi = new Int32Array(W).fill(-1);
  const mask = new Uint8Array(N * N);
  let cells = 0;
  for (let j = 0; j < N; j++) {
    const dy = j - c;
    if (Math.abs(dy) > R) continue;
    const hw = Math.sqrt(R * R - dy * dy);
    const i0 = Math.max(0, Math.ceil(c - hw)), i1 = Math.min(N - 1, Math.floor(c + hw));
    rowLo[j + 1] = i0 + 1; rowHi[j + 1] = i1 + 1;
    for (let i = i0; i <= i1; i++) { mask[j * N + i] = 1; cells++; }
  }
  // no-flux rim: every outside cell that touches the dish copies its nearest inside neighbour after each step
  const ghost = [];
  if (o.rim !== "fixed") {
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const p = j * W + i;
      if (i >= rowLo[j] && i <= rowHi[j]) continue;
      let best = -1, bd = 9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const jj = j + dj, ii = i + di;
        if (jj < 0 || jj >= W || ii < 0 || ii >= W || ii < rowLo[jj] || ii > rowHi[jj]) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = jj * W + ii; }
      }
      if (best >= 0) ghost.push(p, best);
    }
  }
  const r = rng(o.seed ?? 109);
  const seeds = (o.seeds ?? []).map((s, k) => ({ ...s, id: k + 1, step: Math.round(piecewise(o.clock, s.t)) }));
  const duration = o.duration ?? 15, every = o.storeEvery ?? 0.5;
  const layers = Math.round(duration / every) + 1;
  const times = Array.from({ length: layers }, (_, k) => +(k * every).toFixed(6));
  const vMax = o.vMax ?? 0.5, claimAt = o.claimAt ?? 0.18, noise = o.seedNoise ?? 0.15;
  const states = new Uint8Array(layers * N * N);
  const coverage = new Float32Array(layers), activity = new Float32Array(layers);
  const prev = new Float32Array(N * N);

  const inject = (s) => {
    const cx = s.x * (N - 1) + 1, cy = s.y * (N - 1) + 1, rr = s.r;
    for (let j = Math.floor(cy - rr - 1); j <= Math.ceil(cy + rr + 1); j++) {
      if (j < 1 || j > N) continue;
      for (let i = Math.floor(cx - rr - 1); i <= Math.ceil(cx + rr + 1); i++) {
        if (i < rowLo[j] || i > rowHi[j]) continue;
        const d = Math.hypot(i - cx, j - cy);
        if (d > rr) continue;
        const p = j * W + i;
        // soft-edged disc, or (s.ring = width in cells) an annulus hugging the outer edge
        const e = s.ring ? 1 - sstep(s.ring / 2 - 1, s.ring / 2 + 0.5, Math.abs(d - (rr - s.ring / 2 - 0.5))) : 1 - sstep(rr - 1.5, rr, d);
        if (e <= 0) continue;
        u[p] = u[p] * (1 - e) + 0.5 * e;
        v[p] = Math.max(v[p], e * (0.25 + noise * (r.next() - 0.5)));
        lab[p] = s.id;
      }
    }
  };

  const store = (k) => {
    const base = k * N * N;
    let cov = 0, act = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const q = j * N + i, val = v[(j + 1) * W + (i + 1)];
      states[base + q] = Math.round(clamp(val / vMax) * 255);
      if (mask[q]) { if (val > claimAt) cov++; act += Math.abs(val - prev[q]); }
      prev[q] = val;
    }
    coverage[k] = cov / cells;
    activity[k] = k ? act / cells : 0;
  };

  let step = 0;
  const lastSeedStep = seeds.reduce((m, s) => Math.max(m, s.step), 0);
  const injectDue = () => { for (const s of seeds) if (!s.done && s.step <= step) { inject(s); s.done = true; } };
  for (let k = 0; k < layers; k++) {
    const target = Math.round(piecewise(o.clock, times[k]));
    while (step < target) {
      injectDue();
      // the video time of this step (inverse clock) -> F, k
      const tv = invClock(o.clock, step);
      const { F, k: K } = paramsAt(o.schedule, tv);
      const FK = F + K;
      for (let j = 1; j <= N; j++) {
        const lo = rowLo[j], hi = rowHi[j];
        if (hi < lo) continue;
        for (let p = j * W + lo, pe = j * W + hi; p <= pe; p++) {
          const uc = u[p], vc = v[p];
          const lu = 0.2 * (u[p - 1] + u[p + 1] + u[p - W] + u[p + W]) + 0.05 * (u[p - W - 1] + u[p - W + 1] + u[p + W - 1] + u[p + W + 1]) - uc;
          const lv = 0.2 * (v[p - 1] + v[p + 1] + v[p - W] + v[p + W]) + 0.05 * (v[p - W - 1] + v[p - W + 1] + v[p + W - 1] + v[p + W + 1]) - vc;
          const uvv = uc * vc * vc;
          u2[p] = uc + Du * lu - uvv + F * (1 - uc);
          const nv = vc + Dv * lv + uvv - FK * vc;
          v2[p] = nv;
          if (lab[p] === 0 && nv > claimAt) { // first claim: the strongest labelled neighbour's colony
            let best = 0, bv = -1;
            for (const q of [p - 1, p + 1, p - W, p + W, p - W - 1, p - W + 1, p + W - 1, p + W + 1]) if (lab[q] && v[q] > bv) { bv = v[q]; best = lab[q]; }
            lab[p] = best;
          }
        }
      }
      // swap buffers (cells outside the dish are never written: they stay u = 1, v = 0 in both)
      let sw = u; u = u2; u2 = sw; sw = v; v = v2; v2 = sw;
      for (let g = 0; g < ghost.length; g += 2) { u[ghost[g]] = u[ghost[g + 1]]; v[ghost[g]] = v[ghost[g + 1]]; }
      step++;
    }
    injectDue();
    store(k);
  }
  if (lastSeedStep > step) throw new Error("grayscott: a seed lands after the last stored state");

  const labels = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) labels[j * N + i] = lab[(j + 1) * W + (i + 1)];

  const layerAt = (t) => {
    const x = clamp(t / every, 0, layers - 1);
    const i = Math.min(layers - 2, Math.floor(x));
    return { i, f: x - i };
  };
  const sampleArr = (arr, t) => { const { i, f } = layerAt(t); return arr[i] * (1 - f) + arr[i + 1] * f; };
  return {
    n: N, radius: R, layers, times, every, states, labels, coverage, activity, mask, vMax, claimAt,
    seeds: seeds.map(({ x, y, r: rr, t, id, step: st }) => ({ x, y, r: rr, t, id, step: st })),
    steps: step,
    stepsAt: (t) => piecewise(o.clock, t),
    layerAt,
    coverageAt: (t) => sampleArr(coverage, t),
    activityAt: (t) => sampleArr(activity, t),
    /** v (0..vMax) at dish coords (x, y) at video time t, bilinear in space and linear between stored states */
    vAt(t, x, y) {
      const { i: L, f } = layerAt(t);
      const gx = clamp(x) * (N - 1), gy = clamp(y) * (N - 1);
      const i0 = Math.min(N - 2, Math.floor(gx)), j0 = Math.min(N - 2, Math.floor(gy)), fx = gx - i0, fy = gy - j0;
      const at = (l, i, j) => states[l * N * N + j * N + i] / 255;
      const bil = (l) => (at(l, i0, j0) * (1 - fx) + at(l, i0 + 1, j0) * fx) * (1 - fy) + (at(l, i0, j0 + 1) * (1 - fx) + at(l, i0 + 1, j0 + 1) * fx) * fy;
      return (bil(L) * (1 - f) + bil(L + 1) * f) * vMax;
    },
  };
}

/** inverse of a monotone piecewise-linear clock: simulation step -> video time */
export function invClock(keys, s) {
  if (s <= keys[0][1]) return keys[0][0];
  for (let i = 1; i < keys.length; i++) {
    const [x1, y1] = keys[i];
    if (s <= y1) {
      const [x0, y0] = keys[i - 1];
      return y1 === y0 ? x1 : x0 + ((x1 - x0) * (s - y0)) / (y1 - y0);
    }
  }
  return keys[keys.length - 1][0];
}

/**
 * texturePlan(plan, o) -> plain event list for SCORE: one soft drop per seed landing, and a granular texture whose grain
 * density follows the stored activity x coverage (how much of the dish is patterned and still changing).
 *   o = { start, end, rate: [min, max] grains/s, quietBelow }
 */
export function texturePlan(plan, o = {}) {
  const out = [];
  for (const s of plan.seeds) out.push({ t: s.t, kind: "drop", seed: s.id });
  const t0 = o.start ?? 2.5, t1 = o.end ?? 15;
  const [rMin, rMax] = o.rate ?? [4, 26];
  const aMax = Math.max(1e-6, ...plan.activity);
  let t = t0, n = 0;
  while (t < t1) {
    const cov = plan.coverageAt(t), act = plan.activityAt(t) / aMax;
    const dens = clamp(Math.sqrt(cov) * (0.35 + 0.65 * act));
    const rate = rMin + (rMax - rMin) * dens;
    if (dens > (o.quietBelow ?? 0.02)) out.push({ t: +t.toFixed(4), kind: "grain", level: dens, seed: 200 + n });
    n++;
    t += (1 / rate) * (0.6 + 0.8 * hash(n));
  }
  return out;
}
const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
