// styles/differential-growth/growth.js — PURE planner for "Differential Growth" (no THREE, no window, no DOM).
// Imports only kit/time.js, so scene.config.js (SCORE, Node) and style.js (picture, browser) share ONE simulation.
//
// What it simulates: a closed 2D curve (the ribbon seen from above) whose natural length L(t) grows on a schedule
// inside a fixed circular wall (the hoop). Fixed-step, overdamped (position-update) dynamics:
//   - neighbour springs pull each edge toward its rest length (rest = L(t) × its share of the material),
//   - a discrete bending term (biharmonic smoothing) keeps the curve fair at the current length scale,
//   - short-range repulsion keeps every pair of non-neighbouring nodes at least ~d(t) apart (spatial hash),
//   - the wall projects nodes back inside radius R − gap,
//   - an edge whose rest length exceeds split × d(t) is split at its midpoint (growth adds points).
// d(t), the repulsion radius, is a SCHEDULE (art-directed): large while the first waves form, shrinking later, so the
// long walls of the first waves buckle again at a smaller scale ("folds upon folds").
// Every node carries a material coordinate m ∈ [0,1) (a node inserted between two others takes the mid value). Each
// video frame the curve is resampled at M fixed material coordinates and stored, so any t can be read back (and
// blended between neighbouring frames) without stepping in renderAt. The stored curves are tested for self-crossing
// and the planner THROWS if any frame (or any half-way blend between frames) crosses itself.
import { rng, clamp, hash01 } from "../../kit/time.js";

/** monotone cubic (Fritsch–Carlson) through keys [[t, v], ...] -> f(t); held flat outside the keys */
export function monotoneKeys(keys) {
  const n = keys.length, T = keys.map((k) => k[0]), V = keys.map((k) => k[1]);
  if (n === 1) return () => V[0];
  const dk = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) dk.push((V[i + 1] - V[i]) / (T[i + 1] - T[i]));
  m[0] = dk[0]; m[n - 1] = dk[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = dk[i - 1] * dk[i] <= 0 ? 0 : (dk[i - 1] + dk[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (dk[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / dk[i], b = m[i + 1] / dk[i], s = a * a + b * b;
    if (s > 9) { const tau = 3 / Math.sqrt(s); m[i] = tau * a * dk[i]; m[i + 1] = tau * b * dk[i]; }
  }
  return (t) => {
    if (t <= T[0]) return V[0];
    if (t >= T[n - 1]) return V[n - 1];
    let i = 0; while (t > T[i + 1]) i++;
    const h = T[i + 1] - T[i], u = (t - T[i]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * V[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * V[i + 1] + (u3 - u2) * h * m[i + 1];
  };
}

/** segment intersection test (proper crossing or touching), points as numbers */
function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * crossings(P, count, R) -> { hits, first }: self-intersections of the closed polygon P (x0,y0,x1,y1,...), adjacent
 * segments excluded. Uniform grid over [-R, R]²; cell = 2 × longest segment.
 */
export function crossings(P, count, R) {
  let maxLen = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    maxLen = Math.max(maxLen, Math.hypot(P[2 * j] - P[2 * i], P[2 * j + 1] - P[2 * i + 1]));
  }
  const cell = Math.max(2 * maxLen, 1e-4), G = Math.max(1, Math.ceil((2 * R + 4 * cell) / cell));
  const head = new Int32Array(G * G).fill(-1), next = [], segOf = [];
  const ci = (v) => clamp(Math.floor((v + R + 2 * cell) / cell), 0, G - 1);
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const x0 = ci(Math.min(P[2 * i], P[2 * j])), x1 = ci(Math.max(P[2 * i], P[2 * j]));
    const y0 = ci(Math.min(P[2 * i + 1], P[2 * j + 1])), y1 = ci(Math.max(P[2 * i + 1], P[2 * j + 1]));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const c = gy * G + gx; segOf.push(i); next.push(head[c]); head[c] = segOf.length - 1;
    }
  }
  let hits = 0, first = null;
  for (let c = 0; c < G * G; c++) {
    for (let a = head[c]; a >= 0; a = next[a]) for (let b = next[a]; b >= 0; b = next[b]) {
      const i = segOf[a], j = segOf[b];
      if (i === j) continue;
      const dij = Math.abs(i - j);
      if (dij <= 1 || dij >= count - 1) continue;
      const i1 = (i + 1) % count, j1 = (j + 1) % count;
      if (segHit(P[2 * i], P[2 * i + 1], P[2 * i1], P[2 * i1 + 1], P[2 * j], P[2 * j + 1], P[2 * j1], P[2 * j1 + 1])) {
        hits++; if (!first) first = [Math.min(i, j), Math.max(i, j)];
      }
    }
  }
  return { hits, first };
}

/**
 * createGrowthPlan(o) -> plan
 *  o = { R, wallGap, seed, fps, duration, M, substeps (n | [[t, n]]), lengthKeys: [[t, L]], scaleKeys: [[t, d]],
 *        bendKeys: [[t, passes]], sim: { split, spring, bend, repel, exclude, maxStep, noise, modes, latch, minEdge,
 *        minChord, grip, touch, hard, jitter }, verify = true }
 *  plan = { M, F, fps, frames (Float32Array F×M×2), curveAt(t, out), lengthAt(t), scaleAt(t), radiusAt(t),
 *           foldCount (Int16Array F), nodes (Int32Array F), events(o), stats }
 */
export function createGrowthPlan(o) {
  const R = o.R ?? 1, wallGap = o.wallGap ?? 0.01, Rw = R - wallGap;
  const fps = o.fps ?? 30, duration = o.duration ?? 15, M = o.M ?? 4096;
  // substeps per video frame: a number or keys [[t, n]] (more while the ring expands freely, so the springs keep up)
  const subOf = Array.isArray(o.substeps) ? monotoneKeys(o.substeps) : () => o.substeps ?? 8;
  let totalSteps = 0;
  const S = { split: 0.45, spring: 0.5, bend: 0.04, repel: 0.5, exclude: 1.3, maxStep: 0.12, noise: 0.02, latch: 0.03, minEdge: 0.45, minChord: 0.7, grip: 0.15, touch: 0.004, hard: 0.6, jitter: 0.01, ...(o.sim ?? {}) };
  const Lof = monotoneKeys(o.lengthKeys), dOf = monotoneKeys(o.scaleKeys);
  const bendOf = monotoneKeys(o.bendKeys ?? [[0, 1]]);
  const F = Math.round(duration * fps) + 1;
  const R0 = rng(o.seed ?? 110);

  // ---- state (capacity grows by reallocation)
  let cap = 1024, N = 0;
  let X = new Float64Array(cap), Y = new Float64Array(cap), Mm = new Float64Array(cap);
  let DX = new Float64Array(cap), DY = new Float64Array(cap), LX = new Float64Array(cap), LY = new Float64Array(cap);
  let BX = new Float64Array(cap), BY = new Float64Array(cap);
  let C = new Float64Array(cap + 1);
  const grow = (n) => {
    if (n <= cap) return;
    while (cap < n) cap *= 2;
    const nx = new Float64Array(cap), ny = new Float64Array(cap), nm = new Float64Array(cap);
    nx.set(X.subarray(0, N)); ny.set(Y.subarray(0, N)); nm.set(Mm.subarray(0, N));
    X = nx; Y = ny; Mm = nm;
    DX = new Float64Array(cap); DY = new Float64Array(cap); LX = new Float64Array(cap); LY = new Float64Array(cap);
    BX = new Float64Array(cap); BY = new Float64Array(cap);
    C = new Float64Array(cap + 1);
  };
  const dmOf = (i) => (i === N - 1 ? 1 - Mm[i] : Mm[i + 1] - Mm[i]);

  // ---- initial ring: radius from L(0), small seeded low-order wobble so buckling has somewhere to start
  {
    const L0 = Lof(0), d0 = dOf(0), r0 = L0 / (2 * Math.PI);
    const n0 = Math.max(24, Math.ceil(L0 / (0.7 * S.split * d0)));
    grow(n0); N = n0;
    const w = Array.from({ length: n0 }, () => 1 + 0.3 * (R0.next() - 0.5));
    const sw = w.reduce((a, b) => a + b, 0);
    const modes = [2, 3, 4, 5, 6, 7].map((k) => ({ k, a: R0.range(-1, 1) / k, p: R0.range(0, 2 * Math.PI) }));
    // optional dominant imperfection modes [[k, relative amplitude]]: where the ring first touches the glass
    for (const [k, a] of S.modes ?? []) modes.push({ k, a: a / S.noise, p: R0.range(0, 2 * Math.PI) });
    let m = 0;
    for (let i = 0; i < n0; i++) {
      Mm[i] = m;
      const th = 2 * Math.PI * m;
      let rr = 1; for (const q of modes) rr += S.noise * q.a * Math.cos(q.k * th + q.p);
      X[i] = r0 * rr * Math.cos(th); Y[i] = r0 * rr * Math.sin(th);
      m += w[i] / sw;
    }
  }

  // ---- spatial hash (rebuilt each step)
  let gHead = new Int32Array(1), gNext = new Int32Array(cap);
  let minGapFrame = Infinity, contactT = null;
  // free expansion: until the ring first reaches the wall nothing resists it, so uniform growth is applied as the
  // stress-free solution (a uniform scale about the centroid by L(t)/L(t - dt)); after first contact (latched) the
  // springs carry all growth, and the wall turns it into compression.
  let touched = false, prevL = Lof(0);
  let stepIndex = 0;
  const seedInt = (o.seed ?? 110) | 0;
  function step(t) {
    stepIndex++;
    const L = Lof(t), d = dOf(t), rmax = S.split * d;
    if (!touched) {
      let cxm = 0, cym = 0, rmx = 0;
      for (let i = 0; i < N; i++) { cxm += X[i]; cym += Y[i]; }
      cxm /= N; cym /= N;
      const k = L / prevL;
      for (let i = 0; i < N; i++) {
        X[i] = cxm + (X[i] - cxm) * k; Y[i] = cym + (Y[i] - cym) * k;
        rmx = Math.max(rmx, X[i] * X[i] + Y[i] * Y[i]);
      }
      if (rmx >= (Rw - S.latch) * (Rw - S.latch)) { touched = true; contactT = t; }
    }
    prevL = L;
    // split long edges (rest = L × dm)
    let need = 0;
    for (let i = 0; i < N; i++) if (L * dmOf(i) > rmax) need++;
    if (need) {
      grow(N + need);
      const nx = new Float64Array(cap), ny = new Float64Array(cap), nm = new Float64Array(cap);
      let k = 0;
      for (let i = 0; i < N; i++) {
        nx[k] = X[i]; ny[k] = Y[i]; nm[k] = Mm[i]; k++;
        const dm = dmOf(i);
        if (L * dm > rmax) {
          const j = (i + 1) % N;
          nx[k] = (X[i] + X[j]) / 2; ny[k] = (Y[i] + Y[j]) / 2; nm[k] = Mm[i] + dm / 2; k++;
        }
      }
      X = nx; Y = ny; Mm = nm; N = k;
      if (gNext.length < cap) gNext = new Int32Array(cap);
    }
    // cumulative rest arc for the repulsion exclusion
    C[0] = 0; for (let i = 0; i < N; i++) C[i + 1] = C[i] + L * dmOf(i);
    const Ltot = C[N], excl = S.exclude * d;
    DX.fill(0, 0, N); DY.fill(0, 0, N);
    // springs
    for (let i = 0; i < N; i++) {
      const j = i === N - 1 ? 0 : i + 1;
      const ex = X[j] - X[i], ey = Y[j] - Y[i], len = Math.sqrt(ex * ex + ey * ey) || 1e-12;
      const c = S.spring * 0.5 * (len - L * dmOf(i)) / len;
      DX[i] += c * ex; DY[i] += c * ey; DX[j] -= c * ex; DY[j] -= c * ey;
    }
    // bending: dx = -bend × Lap(Lap(x)), applied bendIters(t) times on a running copy (each pass is a stable
    // explicit biharmonic smoothing step; many passes = a stiffer ribbon at this scale = longer first waves)
    const nb = Math.max(1, Math.round(bendOf(t)));
    for (let i = 0; i < N; i++) { BX[i] = X[i]; BY[i] = Y[i]; }
    for (let it = 0; it < nb; it++) {
      for (let i = 0; i < N; i++) {
        const a = i === 0 ? N - 1 : i - 1, b = i === N - 1 ? 0 : i + 1;
        LX[i] = BX[a] + BX[b] - 2 * BX[i]; LY[i] = BY[a] + BY[b] - 2 * BY[i];
      }
      for (let i = 0; i < N; i++) {
        const a = i === 0 ? N - 1 : i - 1, b = i === N - 1 ? 0 : i + 1;
        BX[i] -= S.bend * (LX[a] + LX[b] - 2 * LX[i]); BY[i] -= S.bend * (LY[a] + LY[b] - 2 * LY[i]);
      }
    }
    for (let i = 0; i < N; i++) { DX[i] += BX[i] - X[i]; DY[i] += BY[i] - Y[i]; }
    // repulsion (grid cell = d)
    const G = Math.ceil((2 * R + 2 * d) / d) + 1;
    if (gHead.length < G * G) gHead = new Int32Array(G * G);
    gHead.fill(-1, 0, G * G);
    const cx = (v) => clamp(Math.floor((v + R + d) / d), 0, G - 1);
    for (let i = 0; i < N; i++) { const c = cy(i); gNext[i] = gHead[c]; gHead[c] = i; }
    function cy(i) { return cx(Y[i]) * G + cx(X[i]); }
    const d2 = d * d;
    let minGap = Infinity;
    const PI = [], PJ = [], PR = []; // close pairs: get a hard minimum distance in the constraint pass
    for (let i = 0; i < N; i++) {
      const gx = cx(X[i]), gy = cx(Y[i]);
      for (let oy = -1; oy <= 1; oy++) {
        const yy = gy + oy; if (yy < 0 || yy >= G) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = gx + ox; if (xx < 0 || xx >= G) continue;
          for (let j = gHead[yy * G + xx]; j >= 0; j = gNext[j]) {
            if (j <= i) continue;
            const ex = X[j] - X[i], ey = Y[j] - Y[i], q = ex * ex + ey * ey;
            if (q >= d2) continue;
            let arc = C[j] - C[i]; if (arc > Ltot - arc) arc = Ltot - arc;
            // nodes close along the ribbon keep arc/exclude of distance (continuous with d at arc = exclude·d): a chain
            // cannot crumple or invert at node scale under compression; everything else keeps the full radius d
            const r0 = arc < excl ? arc / S.exclude : d;
            if (q >= r0 * r0) continue;
            const dist = Math.sqrt(q) || 1e-12;
            if (arc >= excl && dist < minGap) minGap = dist;
            if (dist < 0.85 * r0) { PI.push(i); PJ.push(j); PR.push(S.hard * r0); }
            const c = S.repel * 0.5 * (r0 - dist) / dist;
            DX[i] -= c * ex; DY[i] -= c * ey; DX[j] += c * ex; DY[j] += c * ey;
          }
        }
      }
    }
    // apply, clamped, then the wall
    const ms = S.maxStep * d;
    for (let i = 0; i < N; i++) {
      let dx = DX[i], dy = DY[i];
      const m2 = dx * dx + dy * dy;
      if (m2 > ms * ms) { const k = ms / Math.sqrt(m2); dx *= k; dy *= k; }
      // wall friction: a node touching the glass keeps only `grip` of its sliding (tangential) motion
      const r0w = Math.sqrt(X[i] * X[i] + Y[i] * Y[i]);
      if (r0w > Rw - S.touch) {
        const nx = X[i] / r0w, ny = Y[i] / r0w, tn = -dx * ny + dy * nx;
        dx += -(1 - S.grip) * tn * -ny; dy += -(1 - S.grip) * tn * nx;
        // imperfection: a tiny seeded inward nudge (hash of material coordinate + step), so a ring pressed on the
        // perfect circle can start to buckle anywhere, not only where the first big kink happens to be
        const j = S.jitter * d * hash01(Math.round(Mm[i] * 1e7), stepIndex, seedInt);
        dx -= j * nx; dy -= j * ny;
      }
      let x = X[i] + dx, y = Y[i] + dy;
      const r = Math.sqrt(x * x + y * y);
      if (r > Rw) { x *= Rw / r; y *= Rw / r; }
      X[i] = x; Y[i] = y;
    }
    // neighbours never pass each other and no node folds sharper than ~90°: each edge keeps at least minEdge × its
    // rest length and each second neighbour pair (i, i+2) at least minChord × their rest arc (Gauss–Seidel sweeps,
    // then back inside the wall)
    const keepApart = (i, j, lo) => {
      const ex = X[j] - X[i], ey = Y[j] - Y[i], len = Math.sqrt(ex * ex + ey * ey);
      if (len >= lo || len < 1e-12) return;
      const k = 0.5 * (lo - len) / len;
      X[i] -= k * ex; Y[i] -= k * ey; X[j] += k * ex; Y[j] += k * ey;
    };
    for (let it = 0; it < 3; it++) for (let i = 0; i < N; i++) {
      const j = i === N - 1 ? 0 : i + 1, j2 = j === N - 1 ? 0 : j + 1, j3 = j2 === N - 1 ? 0 : j2 + 1;
      keepApart(i, j, S.minEdge * L * dmOf(i));
      keepApart(i, j2, S.minChord * L * (dmOf(i) + dmOf(j)));
      keepApart(i, j3, S.minChord * L * (dmOf(i) + dmOf(j) + dmOf(j2)));
    }
    for (let it = 0; it < 2; it++) for (let p = 0; p < PI.length; p++) keepApart(PI[p], PJ[p], PR[p]);
    for (let i = 0; i < N; i++) {
      const r = Math.sqrt(X[i] * X[i] + Y[i] * Y[i]);
      if (r > Rw) { X[i] *= Rw / r; Y[i] *= Rw / r; }
    }
    minGapFrame = Math.min(minGapFrame, minGap);
  }

  // ---- resample at M fixed material coordinates into frame f
  const frames = new Float32Array(F * M * 2);
  const nodes = new Int32Array(F), gaps = new Float32Array(F), maxR = new Float32Array(F);
  function store(f) {
    const base = f * M * 2;
    let i = 0, rm = 0;
    for (let k = 0; k < M; k++) {
      const mk = k / M;
      while (i < N - 1 && Mm[i + 1] <= mk) i++;
      const j = i === N - 1 ? 0 : i + 1, dm = dmOf(i), u = dm > 0 ? (mk - Mm[i]) / dm : 0;
      const x = X[i] + (X[j] - X[i]) * u, y = Y[i] + (Y[j] - Y[i]) * u;
      frames[base + 2 * k] = x; frames[base + 2 * k + 1] = y;
      rm = Math.max(rm, Math.hypot(x, y));
    }
    nodes[f] = N; gaps[f] = minGapFrame; maxR[f] = rm;
  }

  store(0);
  for (let f = 1; f < F; f++) {
    minGapFrame = Infinity;
    const sub = Math.max(1, Math.round(subOf((f - 0.5) / fps)));
    for (let s = 1; s <= sub; s++) step((f - 1 + s / sub) / fps);
    totalSteps += sub;
    store(f);
  }

  // ---- verification: no stored frame and no half-way blend between neighbouring frames crosses itself
  let checked = 0;
  if (o.verify !== false) {
    const tmp = new Float32Array(M * 2);
    for (let f = 0; f < F; f++) {
      const A = frames.subarray(f * M * 2, (f + 1) * M * 2);
      const r = crossings(A, M, R + 0.1); checked++;
      if (r.hits) throw new Error(`differential-growth: curve crosses itself in frame ${f} (t=${(f / fps).toFixed(3)}), ${r.hits} hit(s), segments ${r.first}`);
      if (f < F - 1) {
        const B = frames.subarray((f + 1) * M * 2, (f + 2) * M * 2);
        for (let k = 0; k < M * 2; k++) tmp[k] = (A[k] + B[k]) / 2;
        const rb = crossings(tmp, M, R + 0.1); checked++;
        if (rb.hits) throw new Error(`differential-growth: blend between frames ${f} and ${f + 1} crosses itself, ${rb.hits} hit(s)`);
      }
    }
  }

  // ---- fold count per frame: concave runs (the curve bending back toward the centre) longer than d/2.
  // Curvature sign from a chord stride of ~d/4 of arc (resampled points sit on straight node-to-node segments,
  // so a finer stride only measures rounding noise).
  const foldCount = new Int16Array(F);
  for (let f = 0; f < F; f++) {
    const A = frames.subarray(f * M * 2, (f + 1) * M * 2), d = dOf(f / fps), L = Lof(f / fps);
    const s = Math.max(2, Math.round((M * 0.25 * d) / L)), n = Math.floor(M / s), seg = L / n;
    const sign = new Int8Array(n);
    for (let q = 0; q < n; q++) {
      const a = ((q - 1 + n) % n) * s, b = q * s, c = ((q + 1) % n) * s;
      const ax = A[2 * b] - A[2 * a], ay = A[2 * b + 1] - A[2 * a + 1], bx = A[2 * c] - A[2 * b], by = A[2 * c + 1] - A[2 * b + 1];
      sign[q] = ax * by - ay * bx < 0 ? -1 : 1; // the ring runs counter-clockwise: convex = +1
    }
    let s0 = 0; while (s0 < n && sign[s0] < 0) s0++;
    if (s0 === n) continue;
    let runs = 0, runLen = 0, inRun = false;
    for (let q = 0; q <= n; q++) {
      if (sign[(s0 + q) % n] < 0) { inRun = true; runLen += seg; }
      else if (inRun) { if (runLen > d * 0.5) runs++; inRun = false; runLen = 0; }
    }
    foldCount[f] = runs;
  }

  const fi = (t) => clamp(t * fps, 0, F - 1);
  const plan = {
    M, F, fps, duration, R, frames, nodes, foldCount, gaps, maxR,
    lengthAt: Lof, scaleAt: dOf,
    /** radiusAt(t): largest |p| of the stored curve (blended) */
    radiusAt(t) { const x = fi(t), a = Math.floor(x), b = Math.min(F - 1, a + 1), u = x - a; return maxR[a] * (1 - u) + maxR[b] * u; },
    /** curveAt(t, out?) -> Float32Array M×2 of (x, z-plane y) points, linearly blended between stored frames */
    curveAt(t, out = new Float32Array(M * 2)) {
      const x = fi(t), a = Math.floor(x), b = Math.min(F - 1, a + 1), u = x - a;
      const A = a * M * 2, B = b * M * 2;
      if (u === 0) { out.set(frames.subarray(A, A + M * 2)); return out; }
      for (let k = 0; k < M * 2; k++) out[k] = frames[A + k] * (1 - u) + frames[B + k] * u;
      return out;
    },
    /** events({ grain, tickGap, contactR }) -> [{ kind, t, ... }] rustle grains (level = growth rate), fold ticks, contact */
    events(e = {}) {
      const grain = e.grain ?? 0.25, tickGap = e.tickGap ?? 0.11, out = [];
      let peak = 0;
      const rate = (t) => (Lof(t + 0.05) - Lof(t - 0.05)) / 0.1;
      for (let t = 0; t <= duration + 1e-9; t += 0.05) peak = Math.max(peak, rate(t));
      for (let t = 0; t < duration - grain / 2; t += grain) out.push({ kind: "rustle", t: +t.toFixed(4), dur: grain * 1.6, level: rate(t + grain / 2) / peak });
      let best = 0, last = -1;
      for (let f = 1; f < F; f++) {
        const c = foldCount[f];
        if (c > best) {
          const t = f / fps;
          if (t - last >= tickGap) { out.push({ kind: "fold", t: +t.toFixed(4), n: c, jump: c - best }); last = t; }
          best = c;
        }
      }
      const contact = e.contactR ?? Rw - 0.002;
      for (let f = 0; f < F; f++) if (maxR[f] >= contact) { out.push({ kind: "contact", t: +(f / fps).toFixed(4) }); break; }
      return out.sort((a, b) => a.t - b.t);
    },
    contactTime: contactT,
    stats: { steps: totalSteps, contactTime: contactT, maxNodes: Math.max(...nodes), minGap: Math.min(...Array.from(gaps).filter(Number.isFinite)), checked },
  };
  return plan;
}

/** growthVoices(SND) -> voices for kit/schedule.scoreFromEvents */
export function growthVoices(SND) {
  return {
    rustle: (e) => (e.level < 0.03 ? [] : [{ type: "paper", dur: e.dur, density: SND.rustle.density, pitch: SND.rustle.pitch, gain: SND.rustle.gain * (0.3 + 0.7 * Math.sqrt(e.level)) }]),
    fold: (e) => [{ type: "tick", dur: 0.03, pitch: SND.fold.pitch * (1 + 0.04 * ((e.n * 7) % 5)), gain: SND.fold.gain * Math.min(1.3, 0.75 + 0.15 * e.jump) }],
    contact: () => [{ type: "marimba", hz: SND.contact.hz, decay: 0.6, dur: 1.4, mallet: 0.35, gain: SND.contact.gain }],
  };
}
