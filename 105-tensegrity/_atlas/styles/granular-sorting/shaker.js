// styles/granular-sorting/shaker.js — the bead simulation and the playback plan for "Granular Sorting".
// Pure: no THREE, no window, no DOM; imports only kit/time.js. scene.config.js imports it (Node for render-sfx /
// export-spec, the browser for the picture), runs the simulation ONCE at load, and every picture and sound cue reads
// the stored result.
//
//   simulate(sim)               -> a seeded Monte Carlo tap-and-settle simulation of one layer of hard beads in a
//                                  flat-fronted jar (the classic lift-then-resettle model of shaking): after every tap
//                                  the bed is lifted and loosened, then each bead, lowest first, makes many small
//                                  random moves that may only go down or sideways and may never overlap a bead or the
//                                  jar. Small beads find room in the gaps that open under large ones far more often
//                                  than a large bead finds a gap its own size, so the large ones ratchet up.
//                                  Stores the rest position of every bead after every tap (plain Float32Arrays).
//   createPlan(run, schedule)   -> playback: video time t -> tap index + phase (real-time taps, then a strobed fast
//                                  forward), bead positions at any t, the plate height, the focus bead, events().
//   shakerVoices(spec.sound)    -> voices for kit/schedule.scoreFromEvents.
//
// Units inside the simulation: small-bead radius = 1. The style scales to metres.
import { rng, hash01, clamp, smoothstep, ease } from "../../kit/time.js";

// ------------------------------------------------------------------------------------------- hard-disc bookkeeping
function makeGrid(W, Htop, cell, N) {
  const nx = Math.ceil(W / cell) + 2, ny = Math.ceil(Htop / cell) + 2;
  return { cell, nx, ny, head: new Int32Array(nx * ny), next: new Int32Array(N), prev: new Int32Array(N), at: new Int32Array(N) };
}
const cellOf = (G, x, y) => {
  let a = Math.floor(x / G.cell) + 1, b = Math.floor(y / G.cell) + 1;
  if (a < 0) a = 0; else if (a >= G.nx) a = G.nx - 1;
  if (b < 0) b = 0; else if (b >= G.ny) b = G.ny - 1;
  return b * G.nx + a;
};
function gridInsert(G, i, c) {
  G.at[i] = c; G.prev[i] = -1; G.next[i] = G.head[c];
  if (G.head[c] >= 0) G.prev[G.head[c]] = i;
  G.head[c] = i;
}
function gridRemove(G, i) {
  const c = G.at[i];
  if (G.prev[i] >= 0) G.next[G.prev[i]] = G.next[i]; else G.head[c] = G.next[i];
  if (G.next[i] >= 0) G.prev[G.next[i]] = G.prev[i];
}
function gridBuild(G, x, y, N) {
  G.head.fill(-1);
  for (let i = 0; i < N; i++) gridInsert(G, i, cellOf(G, x[i], y[i]));
}

/**
 * simulate(sim) -> run
 * sim = { seed, width, small, large, bigR, spread, looseHeight, settleSweeps, taps, lift, dilate, sweeps, tries,
 *         step: [first, last] (largest random move per sweep, shrinking), cell, ceiling }
 * run = { N, nL, r, W, taps, xs, ys (Float32Array, (taps + 1) x N; sample 0 = the settled start, sample c = rest
 *         after tap c), summary[c], moves, checks }
 */
export function simulate(sim) {
  const R = rng(sim.seed), W = sim.width, nL = sim.large, N = sim.small + nL;
  const r = new Float64Array(N), x = new Float64Array(N), y = new Float64Array(N);
  const rS = 1 + sim.spread, rMax = Math.max(sim.bigR, rS);
  const G = makeGrid(W, sim.ceiling, sim.cell ?? 2.2, N);
  const reachOf = (ri) => Math.ceil((ri + rMax) / G.cell);

  // ---- free test: may bead i sit at (px, py)?
  function free(i, px, py) {
    const ri = r[i];
    if (px < ri || px > W - ri || py < ri) return false;
    const s = reachOf(ri);
    const a0 = Math.floor(px / G.cell) + 1, b0 = Math.floor(py / G.cell) + 1;
    const bl = Math.max(0, b0 - s), bh = Math.min(G.ny - 1, b0 + s), al = Math.max(0, a0 - s), ah = Math.min(G.nx - 1, a0 + s);
    for (let b = bl; b <= bh; b++) {
      for (let a = al; a <= ah; a++) {
        for (let j = G.head[b * G.nx + a]; j >= 0; j = G.next[j]) {
          if (j === i) continue;
          const dx = x[j] - px, dy = y[j] - py, rr = ri + r[j];
          if (dx * dx + dy * dy < rr * rr) return false;
        }
      }
    }
    return true;
  }

  // ---- seeded starting heap: large beads in stratified height bands, small ones placed at random around them
  const H0 = sim.looseHeight;
  G.head.fill(-1);
  for (let i = 0; i < nL; i++) {
    r[i] = sim.bigR;
    const span = (H0 - 2 * sim.bigR - 2) / nL, b0 = sim.bigR + 1 + i * span;
    let ok = false;
    for (let tries = 0; tries < 2000 && !ok; tries++) {
      const px = R.range(sim.bigR, W - sim.bigR), py = R.range(b0, b0 + span);
      // successive bands must not stack in one column
      if (i > 0 && Math.abs(px - x[i - 1]) < W * 0.25 && tries < 1500) continue;
      x[i] = px; y[i] = py;
      if (free(i, px, py)) { ok = true; gridInsert(G, i, cellOf(G, px, py)); }
    }
    if (!ok) throw new Error(`shaker: could not place large bead ${i}`);
  }
  for (let i = nL; i < N; i++) {
    r[i] = 1 + sim.spread * (R.next() * 2 - 1);
    let ok = false;
    for (let tries = 0; tries < 20000 && !ok; tries++) {
      const px = R.range(r[i], W - r[i]), py = R.range(r[i], H0 + tries * 0.01);
      x[i] = px; y[i] = py;
      if (free(i, px, py)) { ok = true; gridInsert(G, i, cellOf(G, px, py)); }
    }
    if (!ok) throw new Error(`shaker: could not place small bead ${i}`);
  }

  // ---- one settle pass: beads lowest-first, each tries small moves that go down or sideways (never up)
  const order = new Int32Array(N);
  const idx = Array.from({ length: N }, (_, i) => i);
  function sortByHeight() {
    idx.sort((a, b) => (y[a] - y[b]) || (a - b));
    for (let i = 0; i < N; i++) order[i] = idx[i];
  }
  let moves = 0;
  function sweep(step, tries) {
    sortByHeight();
    for (let q = 0; q < N; q++) {
      const i = order[q];
      for (let k = 0; k < tries; k++) {
        const px = x[i] + step * (2 * R.next() - 1), py = y[i] - step * R.next();
        if (!free(i, px, py)) continue;
        x[i] = px; y[i] = py; moves++;
        const c = cellOf(G, px, py);
        if (c !== G.at[i]) { gridRemove(G, i); gridInsert(G, i, c); }
      }
    }
  }
  function settle(sweeps, tries, [s0, s1]) {
    for (let s = 0; s < sweeps; s++) sweep(s0 * Math.pow(s1 / s0, s / Math.max(1, sweeps - 1)), tries);
  }
  settle(sim.settleSweeps, sim.tries, sim.step);

  const taps = sim.taps;
  const xs = new Float32Array((taps + 1) * N), ys = new Float32Array((taps + 1) * N);
  const store = (c) => { for (let i = 0; i < N; i++) { xs[c * N + i] = x[i]; ys[c * N + i] = y[i]; } };
  store(0);
  for (let c = 1; c <= taps; c++) {
    // the tap: lift and loosen the whole bed (each bead rises by lift + dilate x its height), then resettle
    for (let i = 0; i < N; i++) y[i] = y[i] + sim.lift + sim.dilate * (y[i] - r[i]);
    gridBuild(G, x, y, N);
    settle(sim.sweeps, sim.tries, sim.step);
    store(c);
  }

  // ---- summaries: how high the large beads sit relative to the bed surface after each tap
  const summary = [];
  for (let c = 0; c <= taps; c++) {
    let top = -1e9, sumL = 0, minL = 1e9;
    for (let i = nL; i < N; i++) top = Math.max(top, ys[c * N + i] + r[i]);
    for (let i = 0; i < nL; i++) { const yy = ys[c * N + i]; sumL += yy; minL = Math.min(minL, yy); }
    summary.push({ c, surface: top, meanLarge: sumL / nL, minLarge: minL });
  }
  return { N, nL, r: Float32Array.from(r), W, taps, xs, ys, summary, moves, sim };
}

/** overlapAudit(run, every) -> worst overlap as a fraction of the contact distance over the audited samples. */
export function overlapAudit(run, every = 1) {
  const { N, r, xs, ys, taps } = run;
  let worst = 0;
  for (let c = 0; c <= taps; c += every) {
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = xs[c * N + i] - xs[c * N + j], dy = ys[c * N + i] - ys[c * N + j], rr = r[i] + r[j];
      if (dx * dx + dy * dy < rr * rr) worst = Math.max(worst, (rr - Math.sqrt(dx * dx + dy * dy)) / rr);
    }
  }
  return worst;
}

// ------------------------------------------------------------------------------------------- reading a run
/** coverOf(run, c, i) -> how many small beads sit above large bead i, inside its column, after tap c. */
export function coverOf(run, c, i) {
  const { N, nL, r, xs, ys } = run, xi = xs[c * N + i], yi = ys[c * N + i];
  let n = 0;
  for (let j = nL; j < N; j++) if (Math.abs(xs[c * N + j] - xi) < r[i] + 0.6 && ys[c * N + j] > yi) n++;
  return n;
}
/** uncoveredCount(run, c) -> large beads with nothing above them after tap c. */
export function uncoveredCount(run, c) {
  let n = 0;
  for (let i = 0; i < run.nL; i++) if (coverOf(run, c, i) === 0) n++;
  return n;
}
/** sortedTap(run, from) -> first tap c >= from where every large bead is uncovered for this tap and the next `hold`. */
export function sortedTap(run, from = 1, hold = 2) {
  for (let c = from; c + hold <= run.taps; c++) {
    let ok = true;
    for (let k = 0; k <= hold && ok; k++) ok = uncoveredCount(run, c + k) === run.nL;
    if (ok) return c;
  }
  return -1;
}

/**
 * pickFocus(run, c0, c1, margin) -> the large bead that best shows the gap-filling rule over taps c0+1 .. c1:
 * score = its rise (in small radii) + 1.5 x the number of small beads that newly arrive under it, among large beads
 * at least `margin` from the walls and below the top quarter of the bed at tap c0.
 */
export function pickFocus(run, c0, c1, margin = 10) {
  const { N, nL, r, xs, ys, W } = run;
  let best = { i: -1, score: -1e9 };
  const surf = run.summary[c0].surface;
  for (let i = 0; i < nL; i++) {
    const x0 = xs[c0 * N + i], y0 = ys[c0 * N + i];
    if (x0 < margin || x0 > W - margin || y0 > surf * 0.72 || y0 < surf * 0.25) continue;
    let arrivals = 0;
    for (let c = c0; c < c1; c++) {
      const xi = xs[(c + 1) * N + i], yi = ys[(c + 1) * N + i], xp = xs[c * N + i], yp = ys[c * N + i];
      for (let j = nL; j < N; j++) {
        const under = (cc, X, Y) => { const dx = Math.abs(xs[cc * N + j] - X), dy = Y - ys[cc * N + j]; return dx < r[i] && dy > 0 && dy < r[i] + 2.6; };
        if (under(c + 1, xi, yi) && !under(c, xp, yp)) arrivals++;
      }
    }
    const score = (ys[c1 * N + i] - y0) + 1.5 * arrivals;
    if (score > best.score) best = { i, score, rise: ys[c1 * N + i] - y0, arrivals };
  }
  return best;
}

// ------------------------------------------------------------------------------------------- playback plan
/**
 * createPlan(run, schedule) -> plan
 * schedule = {
 *   taps: [{ t, dur }]          real-time taps 1..n (each shows the hop: lift, loosen, fall back into the next rest state)
 *   fast: { t0, t1, slope }     strobed fast forward through taps n+1 .. end: one quick step per tap, accelerating
 *                               (slope = starting rate as a share of the average rate)
 *   end                         the last tap to show (default: sortedTap(run))
 *   hop: { up, stagger, vis, plate } phase share of the rise, bottom-to-top landing stagger, hop scale, plate lift
 *   focus: { c0, c1, margin }   which taps the close-up watches (default: the taps of the second real-time group)
 * }
 * plan = { run, end, nRT, tapTimes, phase(t) -> { c, u, mode }, positions(t, X, Y) fills sim-unit positions,
 *          plate(t) (sim units), focus, focusPos(t), sortedShare(t), events(), restXY(c, i) }
 */
export function createPlan(run, S) {
  const { N, nL, r, xs, ys } = run;
  const nRT = S.taps.length;
  const end = S.end ?? sortedTap(run, nRT + 2);
  if (end < 0) throw new Error("shaker: the run never sorts; raise sim.taps or the shake strength");
  if (end > run.taps) throw new Error(`shaker: end tap ${end} > simulated taps ${run.taps}`);
  const H = S.hop, F = S.fast;
  const nFast = end - nRT;
  // fast-forward progress: x(u) = a u + (1 - a) u^2 (rate starts at a x average, ends at (2 - a) x average)
  const a = F.slope;
  const fastC = (t) => {
    const u = clamp((t - F.t0) / (F.t1 - F.t0), 0, 1);
    return nRT + nFast * (a * u + (1 - a) * u * u);
  };
  // fast tap k (1-based over all taps) starts where fastC crosses k - 1
  const fastStart = (k) => {
    const y = (k - 1 - nRT) / nFast;                 // solve (1 - a) u^2 + a u - y = 0
    const u = a === 1 ? y : (-a + Math.sqrt(a * a + 4 * (1 - a) * y)) / (2 * (1 - a));
    return F.t0 + u * (F.t1 - F.t0);
  };

  /** phase(t) -> { c: rest state the tap starts from, u: 0..1 through the tap, mode: "rest" | "hop" | "fast" } */
  function phase(t) {
    if (t < S.taps[0].t) return { c: 0, u: 0, mode: "rest" };
    for (let k = 0; k < nRT; k++) {
      const T = S.taps[k];
      if (t < T.t) return { c: k, u: 0, mode: "rest" };
      if (t < T.t + T.dur) return { c: k, u: (t - T.t) / T.dur, mode: "hop" };
    }
    if (t < F.t0) return { c: nRT, u: 0, mode: "rest" };
    if (t >= F.t1) return { c: end, u: 0, mode: "rest" };
    const x = fastC(t), c = Math.min(end - 1, Math.floor(x));
    return { c, u: clamp(x - c, 0, 1), mode: "fast" };
  }

  // per-bead landing order inside a hop: lower beads land first
  const lift = (c, i) => (run.sim.lift + run.sim.dilate * (ys[c * N + i] - r[i])) * H.vis;
  const surf = run.summary.map((q) => q.surface);
  function positions(t, X, Y) {
    const p = phase(t), c = p.c, u = p.u;
    if (p.mode === "rest" || u <= 0) {
      for (let i = 0; i < N; i++) { X[i] = xs[c * N + i]; Y[i] = ys[c * N + i]; }
      return p;
    }
    const c1 = c + 1;
    if (p.mode === "fast") {
      const s = smoothstep(0, H.fastStep, u);
      const bump = Math.sin(Math.PI * clamp(u / H.fastStep, 0, 1)) * H.fastHop;
      for (let i = 0; i < N; i++) {
        X[i] = xs[c * N + i] + (xs[c1 * N + i] - xs[c * N + i]) * s;
        Y[i] = ys[c * N + i] + (ys[c1 * N + i] - ys[c * N + i]) * s + bump * lift(c, i);
      }
      return p;
    }
    // a real-time hop: rise with the plate (bed loosens: higher beads rise more), then fall back bottom first,
    // sliding sideways into the next rest state while falling
    const sTop = surf[c] || 1;
    for (let i = 0; i < N; i++) {
      const x0 = xs[c * N + i], y0 = ys[c * N + i], x1 = xs[c1 * N + i], y1 = ys[c1 * N + i];
      const L = lift(c, i), h = clamp(y0 / sTop, 0, 1);
      const uFall0 = H.up + H.stagger * h, uFall1 = Math.min(1, uFall0 + H.fall);
      if (u < uFall0) {
        const k = ease.outQuad(clamp(u / uFall0, 0, 1));
        X[i] = x0; Y[i] = y0 + L * k;
      } else {
        const k = clamp((u - uFall0) / (uFall1 - uFall0), 0, 1);
        const ks = smoothstep(0, 1, k), kf = k * k;               // sideways eased, vertical like a fall
        X[i] = x0 + (x1 - x0) * ks;
        Y[i] = (y0 + L) + (y1 - (y0 + L)) * kf;
      }
    }
    return p;
  }
  /** plate(t) -> plate lift in sim units (a raised-cosine bump per tap; a quick buzz in the fast forward) */
  function plate(t) {
    const p = phase(t);
    if (p.mode === "hop") { const k = clamp(p.u / H.plateShare, 0, 1); return H.plate * 0.5 * (1 - Math.cos(2 * Math.PI * k)); }
    if (p.mode === "fast") { const k = clamp(p.u / H.fastStep, 0, 1); return H.plate * 0.6 * 0.5 * (1 - Math.cos(2 * Math.PI * k)); }
    return 0;
  }
  const fc = S.focus ?? {};
  const focus = pickFocus(run, fc.c0 ?? (S.focusTaps?.[0] ?? 0), fc.c1 ?? nRT, fc.margin ?? 10);
  const restXY = (c, i) => [xs[c * N + i], ys[c * N + i]];
  /** focusPos(t) -> the focus bead's position eased between rest states (for the camera; no hop jitter) */
  function focusPos(t) {
    const p = phase(t), i = focus.i;
    const k = p.mode === "rest" ? 0 : smoothstep(0.15, 0.95, p.u);
    const c1 = Math.min(end, p.c + (p.mode === "rest" ? 0 : 1));
    return [xs[p.c * N + i] + (xs[c1 * N + i] - xs[p.c * N + i]) * k, ys[p.c * N + i] + (ys[c1 * N + i] - ys[p.c * N + i]) * k];
  }
  const uncovered = Array.from({ length: run.taps + 1 }, (_, c) => uncoveredCount(run, c));
  /** sortedShare(t) -> share of large beads uncovered in the state shown at t (drives the rattle brightness) */
  const sortedShare = (t) => uncovered[Math.min(end, phase(t).c)] / nL;

  /** events() -> [{ kind: "tap" | "stop", t, c, share, fast }] for kit/schedule.scoreFromEvents */
  function events() {
    const ev = [];
    S.taps.forEach((T, k) => ev.push({ kind: "tap", t: T.t, c: k + 1, share: uncovered[k + 1] / nL, fast: false, dur: T.dur }));
    for (let c = nRT + 1; c <= end; c++) ev.push({ kind: "tap", t: fastStart(c), c, share: uncovered[c] / nL, fast: true, dur: 0.1 });
    ev.push({ kind: "stop", t: F.t1, c: end, share: uncovered[end] / nL });
    return ev;
  }
  return { run, end, nRT, nFast, firstTap: S.taps[0].t, stopT: F.t1, phase, positions, plate, focus, focusPos, restXY, uncovered, sortedShare, events, fastStart, surface: surf };
}

/** shakerVoices(sound) -> voices for kit/schedule.scoreFromEvents: a dry bead rattle per tap (clicks + a short
 *  crackle), brighter as more large beads reach the top; quieter and shorter in the fast forward; nothing after the stop. */
export function shakerVoices(Snd) {
  const R = Snd.rattle;
  return {
    tap: (e) => {
      const bright = 1 + R.brighten * e.share, g = e.fast ? R.fastGain : 1;
      const out = [
        { type: "paper", dur: e.fast ? 0.09 : R.crackleDur, density: R.density, pitch: R.cracklePitch * bright, gain: R.crackle * g },
        { type: "thud", dur: 0.16, pitch: 1.6, gain: R.thump * g },
      ];
      const n = e.fast ? R.fastClicks : R.clicks;
      for (let k = 0; k < n; k++) {
        const f = hash01(e.c, k, 111);   // stable per tap / click
        out.push({ type: "click", offset: (e.fast ? 0.012 : R.spread / 2) + (k / n) * (e.fast ? 0.06 : R.spread) * (0.6 + 0.8 * f), pitch: (R.clickPitch + R.clickVar * f) * bright, gain: R.click * g * (0.6 + 0.4 * f) });
      }
      return out;
    },
    stop: (e) => [{ type: "marimba", hz: Snd.settle.hz, notes: Snd.settle.notes, step: 0.11, decay: 0.5, dur: 1.6, gain: Snd.settle.gain, offset: 0.12 }],
  };
}

// ------------------------------------------------------------------------------------------- world layout
/** layout(spec) -> where the jar sits in metres: { u (m per sim unit), floorY (inside floor at rest), innerW, innerH,
 *  innerD, outer box, platformY (platform top at rest), toWorld(x, y) -> [X, Y] at rest (no plate lift) } */
export function layout(spec) {
  const J = spec.jar, SH = spec.shaker, u = J.unit;
  const innerW = spec.sim.width * u, innerH = J.innerH * u, innerD = 2 * spec.sim.bigR * u + J.depthPad;
  const platformY = SH.feet + SH.body.h + SH.platform.h;
  const floorY = platformY + J.base;
  const g = J.glass;
  return {
    u, innerW, innerH, innerD, platformY, floorY,
    outer: { x0: -innerW / 2 - g, x1: innerW / 2 + g, y0: platformY, y1: floorY + innerH + J.lidH, z0: -innerD / 2 - g, z1: innerD / 2 + g },
    toWorld: (x, y) => [(x - spec.sim.width / 2) * u, floorY + y * u],
  };
}
