// styles/fourier-epicycles/epicycles.js — the planner of "Fourier Epicycles". THREE-free, window-free, Node-safe:
// imported by style.js (picture) AND by scene.config.js (camera keys, framing gate, SCORE), so sound and picture read the
// same terms.
//
// Pipeline (runs ONCE when the module is used, well under a second):
//   1. outline  — an original songbird silhouette given as a few dozen control points (bird units: x right, y up,
//                 about 2 wide), joined by a closed cubic Hermite spline (Catmull-Rom tangents, zero tangent at the
//                 points flagged sharp: beak tip, tail corners, toes) into ONE continuous closed line.
//   2. resample — N = 256 points spaced evenly by arc length along that line.
//   3. DFT      — c_k = (1/N) sum_n z_n e^{-2 pi i k n / N}, k = -N/2 .. N/2-1, plain JS. The twiddle table is built
//                 from sqrt and + - * / only (half-angle recursion), never Math.sin / Math.cos, so Node and Chrome
//                 compute bit-identical coefficients and therefore the same amplitude ORDER (termHash proves it).
//   4. sort     — c_0 (the centroid) is the fixed pivot; every other term is sorted by amplitude |c_k|, largest first
//                 (ties: smaller |k|, then k). Term j of the chain is arm j.
//   5. tip      — with K terms at phase p (0..1): z(p) = c_0 + sum_{j<K} c_{k_j} e^{2 pi i k_j p}. Joint j is the partial
//                 sum before arm j. The ink line of a beat is that same sum sampled densely over one cycle; it is drawn
//                 up to the CURRENT phase (never accumulated across frames).
// Nothing here steps in time: phaseAt(t) is a closed-form ramp of t, and every position is a finite sum at that phase.

const N_DEFAULT = 256;

// ------------------------------------------------------------------ the songbird (original; bird units, y up)
// Perched songbird facing right, body tilted up toward the head: short conical beak, round crown, nape dip, wingtip
// notch on the back, long tail angled down-left, round chest, one stubby leg with forward toes.
// Traversed counter-clockwise (top edge right -> left, underside left -> right). s = sharp corner.
export const BIRD = [
  [1.02, 0.44, "s"],   // beak tip
  [0.86, 0.53],         // upper mandible
  [0.76, 0.62],         // forehead
  [0.64, 0.69],         // crown
  [0.50, 0.70],
  [0.38, 0.64],         // back of head
  [0.30, 0.53],         // nape dip
  [0.16, 0.47],         // shoulder
  [-0.02, 0.40],        // back
  [-0.20, 0.30],
  [-0.34, 0.20, "s"],   // wingtip over the tail
  [-0.42, 0.16],        // tail root
  [-0.62, 0.02],
  [-0.84, -0.14],
  [-1.02, -0.27, "s"],  // tail tip (upper corner)
  [-0.95, -0.36, "s"],  // tail tip (lower corner)
  [-0.74, -0.26],
  [-0.54, -0.16],       // under the tail
  [-0.38, -0.13],       // vent
  [-0.22, -0.22],       // belly
  [-0.06, -0.30],
  [0.02, -0.32],        // leg, back edge
  [0.00, -0.48],
  [-0.04, -0.56, "s"],  // heel / back toe
  [0.12, -0.56, "s"],   // front toe tip
  [0.08, -0.50],
  [0.08, -0.33],        // leg, front edge
  [0.22, -0.28],        // chest bottom
  [0.42, -0.16],        // chest
  [0.58, 0.00],         // throat
  [0.68, 0.18],         // chin
  [0.80, 0.33],         // lower mandible base
  [0.90, 0.39],
];

/** closed cubic Hermite spline through control points [x, y, flag?]; `per` samples per span -> [[x, y], ...] (open list) */
export function splineLoop(ctrl, per = 48, tension = 0.5) {
  const n = ctrl.length, out = [];
  const P = (i) => ctrl[((i % n) + n) % n];
  const tan = (i) => {
    const p = P(i);
    if (p[2] === "s") return [0, 0];
    const a = P(i - 1), b = P(i + 1);
    return [(b[0] - a[0]) * tension, (b[1] - a[1]) * tension];
  };
  for (let i = 0; i < n; i++) {
    const p0 = P(i), p1 = P(i + 1), m0 = tan(i), m1 = tan(i + 1);
    for (let s = 0; s < per; s++) {
      const u = s / per, u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      out.push([h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0], h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1]]);
    }
  }
  return out;
}

/** resample a closed polyline to `n` points evenly spaced by arc length (starting at its first point) */
export function resampleLoop(pts, n) {
  const m = pts.length, cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % m];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    cum[i + 1] = cum[i] + Math.sqrt(dx * dx + dy * dy);
  }
  const L = cum[m], out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (L * k) / n;
    while (j < m - 1 && cum[j + 1] <= s) j++;
    const a = pts[j], b = pts[(j + 1) % m], seg = cum[j + 1] - cum[j];
    const u = seg > 0 ? (s - cum[j]) / seg : 0;
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return { pts: out, length: L };
}

/**
 * twiddles(n) -> { cos: Float64Array(n), sin: Float64Array(n) } for angles 2 pi m / n, n a power of two >= 8.
 * Built from sqrt and + - * / only: half angles from pi/2 down to 2 pi / n, then each entry from the binary digits
 * of m (a product of at most log2 n exactly-known rotations, applied in a fixed order). Deterministic across engines.
 */
export function twiddles(n) {
  const levels = Math.round(Math.log2(n));
  if (1 << levels !== n || n < 8) throw new Error(`twiddles: n must be a power of two >= 8 (got ${n})`);
  // rot[b] = angle 2 pi 2^b / n
  const rot = new Array(levels);
  rot[levels - 2] = [0, 1];                 // pi/2 (2^(levels-2) * 2 pi / n = pi / 2)
  rot[levels - 1] = [-1, 0];                // pi
  for (let b = levels - 3; b >= 0; b--) {
    const [c, s] = rot[b + 1];
    const ch = Math.sqrt((1 + c) / 2);      // cos(x/2), x in (0, pi/2]
    rot[b] = [ch, s / (2 * ch)];
  }
  const C = new Float64Array(n), S = new Float64Array(n);
  for (let m = 0; m < n; m++) {
    let c = 1, s = 0;
    for (let b = levels - 1; b >= 0; b--) {
      if (m & (1 << b)) { const [rc, rs] = rot[b]; const nc = c * rc - s * rs; s = c * rs + s * rc; c = nc; }
    }
    C[m] = c; S[m] = s;
  }
  return { cos: C, sin: S };
}

/** dft(points [[x,y]]) -> [{ k, re, im, r }] for k = -n/2 .. n/2-1 (c_k = 1/n sum z_n e^{-2 pi i k n / N}) */
export function dft(points) {
  const n = points.length, tw = twiddles(n), out = [];
  for (let k = -n / 2; k < n / 2; k++) {
    let re = 0, im = 0;
    for (let j = 0; j < n; j++) {
      const m = (((k * j) % n) + n) % n;         // e^{-i a} = cos a - i sin a
      const c = tw.cos[m], s = tw.sin[m], x = points[j][0], y = points[j][1];
      re += x * c + y * s;
      im += y * c - x * s;
    }
    re /= n; im /= n;
    out.push({ k, re, im, r: Math.sqrt(re * re + im * im) });
  }
  return out;
}

/** order terms: k = 0 apart (the pivot), the rest by amplitude, largest first (ties: smaller |k|, then smaller k) */
export function sortTerms(coeffs) {
  const dc = coeffs.find((c) => c.k === 0);
  const rest = coeffs.filter((c) => c.k !== 0).sort((a, b) => b.r - a.r || Math.abs(a.k) - Math.abs(b.k) || a.k - b.k);
  return { dc, terms: rest };
}

/** termHash(plan) -> 8 hex chars: FNV-1a over k and the raw bits of re, im of every sorted term (+ the pivot) */
export function termHash(plan) {
  let h = 0x811c9dc5;
  const f = new Float64Array(1), u = new Uint32Array(f.buffer);
  const eat = (w) => { for (let b = 0; b < 4; b++) { h ^= w & 0xff; h = Math.imul(h, 0x01000193); w >>>= 8; } };
  const num = (x) => { f[0] = x; eat(u[0]); eat(u[1]); };
  num(plan.dc.re); num(plan.dc.im);
  for (const t of plan.terms) { eat(t.k >>> 0); num(t.re); num(t.im); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** rampPhase(u, a) -> 0..1: trapezoid speed profile (accelerate over the first a, cruise, decelerate over the last a) */
export function rampPhase(u, a = 0.1) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const v = 1 / (1 - a);
  if (u < a) return (v * u * u) / (2 * a);
  if (u > 1 - a) return 1 - (v * (1 - u) * (1 - u)) / (2 * a);
  return v * (u - a / 2);
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const outBack = (u) => { const s = 1.70158, v = clamp01(u) - 1; return 1 + (s + 1) * v * v * v + s * v * v; };

/**
 * createPlan(opts) -> plan
 *   opts: { bird = BIRD, n = 256, scale = 1, center = [0, 0] (world x, z of bird origin),
 *           stages: [{ id, K, grow: [t0, t1] | null, draw: [t0, t1], ramp, samples }], growEach = .16 (s per arm) }
 *   World mapping: bird (x, y) -> world (x * scale + center[0], -y * scale + center[1]) in the XZ plane (y up = -Z),
 *   so a camera on +Z looking down sees the bird upright.
 *   plan.state(t) -> { stage, K, phase, drawing, grow[] } — which stage is active, the phase of the drawing stage, and
 *   each arm's length factor 0..1 (new arms unfurl largest first during a stage's grow window).
 *   plan.joints(t) -> [[X, Z], ...] K+1 joint positions (pivot first, pen tip last) in world metres.
 *   plan.curve(i) -> closed world polyline of stage i's K-term curve (samples + 1 points, first = last).
 *   plan.events() -> sound events (arm on, stroke, close).
 */
export function createPlan(opts = {}) {
  const n = opts.n ?? N_DEFAULT, scale = opts.scale ?? 1, cen = opts.center ?? [0, 0];
  const bird = opts.bird ?? BIRD;
  const dense = splineLoop(bird, opts.per ?? 48);
  const { pts: samples, length: perimeter } = resampleLoop(dense, n);
  const coeffs = dft(samples);
  const { dc, terms } = sortTerms(coeffs);
  const stages = (opts.stages ?? []).map((s, i) => ({ i, ramp: 0.1, samples: 512, grow: null, ...s }));
  const growEach = opts.growEach ?? 0.16;
  const W = (x, y) => [x * scale + cen[0], -y * scale + cen[1]];
  const TAU = Math.PI * 2;

  // when each arm j first appears (the first stage whose K covers it), and its unfurl window
  const armOn = terms.map(() => null);
  stages.forEach((st, si) => {
    const prevK = si ? stages[si - 1].K : 0;
    const news = st.K - prevK;
    for (let j = prevK; j < st.K; j++) {
      if (!st.grow) { armOn[j] = { stage: si, t0: -Infinity, t1: -Infinity }; continue; }
      const [g0, g1] = st.grow;
      const span = Math.max(0, g1 - g0 - growEach);
      const t0 = g0 + (news > 1 ? (span * (j - prevK)) / (news - 1) : 0);
      armOn[j] = { stage: si, t0, t1: t0 + growEach };
    }
  });
  const maxK = stages.length ? Math.max(...stages.map((s) => s.K)) : 0;

  /** the stage active at t: the last stage whose grow (or draw) window has started */
  function stageAt(t) {
    let cur = 0;
    stages.forEach((s, i) => { const start = s.grow ? s.grow[0] : s.draw[0]; if (t >= start || i === 0) cur = i; });
    return cur;
  }
  function phaseAt(i, t) {
    const s = stages[i], [d0, d1] = s.draw;
    return rampPhase((t - d0) / (d1 - d0), s.ramp);
  }
  function state(t) {
    const si = stageAt(t), st = stages[si];
    const grow = [];
    for (let j = 0; j < st.K; j++) {
      const on = armOn[j];
      grow.push(on.t1 === -Infinity ? 1 : outBack((t - on.t0) / (on.t1 - on.t0)) * (t >= on.t0 ? 1 : 0));
    }
    const phase = phaseAt(si, t);
    return { stage: si, K: st.K, phase, drawing: t >= st.draw[0] && t <= st.draw[1], grow };
  }
  /** bird-unit sum of the first K terms at phase p with per-arm length factors g (default 1) -> partial sums */
  function partials(K, p, g) {
    const out = [[dc.re, dc.im]];
    let x = dc.re, y = dc.im;
    for (let j = 0; j < K; j++) {
      const c = terms[j], a = TAU * c.k * p, ca = Math.cos(a), sa = Math.sin(a), f = g ? g[j] : 1;
      x += (c.re * ca - c.im * sa) * f;
      y += (c.re * sa + c.im * ca) * f;
      out.push([x, y]);
    }
    return out;
  }
  function tipBird(K, p) { const ps = partials(K, p); return ps[ps.length - 1]; }
  function joints(t) {
    const s = state(t);
    return partials(s.K, s.phase, s.grow).map(([x, y]) => W(x, y));
  }
  const curves = stages.map((s) => {
    const m = s.samples, out = [];
    for (let i = 0; i <= m; i++) { const [x, y] = tipBird(s.K, (i % m) / m); out.push(W(x, y)); }
    return out;
  });
  function curve(i) { return curves[i]; }
  /** bounding box [[x0, z0], [x1, z1]] of stage i's curve (world) */
  function curveBox(i) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of curves[i]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return [[x0, z0], [x1, z1]];
  }
  /** tip (world) at time t; smoothTip averages it over +-w seconds (camera follow) */
  function tip(t) { const j = joints(t); return j[j.length - 1]; }
  function smoothTip(t, w = 0.3, steps = 24) {
    let x = 0, z = 0;
    for (let i = 0; i <= steps; i++) { const p = tip(t - w + (2 * w * i) / steps); x += p[0]; z += p[1]; }
    return [x / (steps + 1), z / (steps + 1)];
  }
  function events() {
    const ev = [];
    terms.slice(0, maxK).forEach((c, j) => {
      const on = armOn[j];
      ev.push({ t: on.t0 === -Infinity ? 0 : on.t0, kind: "arm", j, k: c.k, r: c.r * scale, rel: c.r / terms[0].r, stage: on.stage, grown: on.t0 !== -Infinity });
    });
    stages.forEach((s, i) => {
      ev.push({ t: s.draw[0], kind: "stroke", stage: i, K: s.K, dur: s.draw[1] - s.draw[0] });
      ev.push({ t: s.draw[1], kind: "close", stage: i, K: s.K });
    });
    return ev.sort((a, b) => a.t - b.t || (a.j ?? -1) - (b.j ?? -1));
  }
  /** fraction of the outline's energy captured by the first K terms (for notes) */
  function captured(K) {
    const tot = terms.reduce((s, c) => s + c.r * c.r, 0);
    return terms.slice(0, K).reduce((s, c) => s + c.r * c.r, 0) / tot;
  }

  const plan = {
    n, scale, center: cen, perimeter: perimeter * scale, samples, dc, terms, stages, armOn, maxK,
    W, state, phaseAt, stageAt, partials, joints, tip, smoothTip, curve, curveBox, events, captured,
    radius: (j) => terms[j].r * scale,
  };
  plan.hash = termHash(plan);
  return plan;
}
