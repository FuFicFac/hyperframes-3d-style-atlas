// styles/galton-board/plinko.js — the ball plan for the Galton board. Pure: no THREE, no window, no DOM; imports only
// kit/time.js, so scene.config.js (Node: render-sfx, export-spec) and style.js (browser) read the SAME plan.
//
//   layout(spec.board)            -> where every peg, bin, divider, the spout and the hopper are (metres)
//   createPlan(spec, overrides)   -> every ball: release time, left/right choice per row, hit time per row, bin,
//                                    stack slot (arrival order per bin), landing time; plus
//                                    pos(i, t), pegGlow(pegId, t), counts(t), events(), histogram
//   bellCurve(spec, n, samples)   -> the expected (normal) outline of the stacks, as [x, y] points
//   galtonVoices(spec.sound, L)   -> voices for kit/schedule.scoreFromEvents
//
// Nothing is simulated: a ball's position at time t is a closed form of its own precomputed times.
import { hash01 } from "../../kit/time.js";

/** layout(B = spec.board) -> coordinates of the machine. Board plane = XY, backboard face z = 0, desk y = 0. */
export function layout(B) {
  const R = B.rows, bins = R + 1;
  const floorY = B.feet + B.base;                 // top of the bottom rail = floor of the bins
  const dividerTop = floorY + B.binH;
  const lastY = dividerTop + B.gapBin;            // centre height of the last peg row
  const rowY = (k) => lastY + (R - 1 - k) * B.dy;
  const apexY = rowY(0);
  const spoutY = apexY + B.gapTop;                // mouth of the spout
  const funnelY = spoutY + B.spoutLen;            // bottom of the hopper block
  const innerTop = funnelY + B.hopperH;
  const halfIn = (bins * B.dx) / 2;
  const pegs = [];
  for (let k = 0; k < R; k++) for (let j = 0; j <= k; j++) pegs.push({ id: pegs.length, row: k, j, x: (j - k / 2) * B.dx, y: rowY(k) });
  const pegId = (k, j) => (k * (k + 1)) / 2 + j;
  const binX = (b) => (b - R / 2) * B.dx;
  const colStep = B.cols > 1 ? (B.dx - B.wall - 2 * B.ballR - 0.004) / (B.cols - 1) : 0;
  const colX = (c) => (c - (B.cols - 1) / 2) * colStep;
  const dividers = Array.from({ length: R }, (_, j) => (j - R / 2 + 0.5) * B.dx);   // directly below the last-row pegs
  return {
    rows: R, bins, pegs, pegId, binX, colX, colStep, dividers, rowY,
    floorY, dividerTop, lastY, apexY, spoutY, funnelY, innerTop, halfIn,
    contact: B.pegR + B.ballR,                    // ball centre above a peg centre at the moment of contact
    ballZ: B.pegLen / 2,
    inner: { x0: -halfIn, x1: halfIn, y0: floorY, y1: innerTop },
    outer: { x0: -halfIn - B.frame, x1: halfIn + B.frame, y0: B.feet, y1: innerTop + B.frame, z0: -B.depthBack, z1: B.depthFront },
    /** rest position of the m-th ball to arrive in bin b: rows of `cols`, column order shuffled per row */
    slot(b, m, seed = 0) {
      const row = Math.floor(m / B.cols), k = m % B.cols;
      const order = Array.from({ length: B.cols }, (_, c) => c).sort((p, q) => hash01(seed, b * 131 + row, p) - hash01(seed, b * 131 + row, q));
      const col = order[k];
      return { row, col, x: binX(b) + colX(col), y: floorY + B.ballR + row * 2 * B.ballR };
    },
  };
}

/** releaseTimes(P) -> n release times: gaps ease from gap0 to gapMin with the ball index */
export function releaseTimes(P) {
  const out = [];
  let t = P.start;
  for (let i = 0; i < P.n; i++) {
    out.push(t);
    t += P.gapMin + (P.gap0 - P.gapMin) * Math.exp(-i / P.gapTau);
  }
  return out;
}

/**
 * createPlan(spec, overrides = {}) -> plan
 *   plan.balls[i] = { id, t0, choices[R] (0 left / 1 right), js[R+1] (peg index per row, js[R] = bin), tHit[R],
 *                     bin, slot { row, col, x, y }, tLand, z, tracer }
 *   plan.pos(i, t) -> [x, y, z] | null (not released yet)
 *   plan.pegGlow(pegId, t) -> 0..1 flash of a struck peg      plan.counts(t) -> landed balls per bin
 *   plan.events() -> [{ t, kind: "release" | "peg" | "land", ball, row, peg, x, bin, level }] sorted by t
 */
export function createPlan(spec, overrides = {}) {
  const B = spec.board, P = { ...spec.plan, ...overrides }, L = layout(B);
  const R = L.rows, r = B.ballR;
  const rel = P.releases ?? releaseTimes(P);
  const n = rel.length;
  const balls = [];
  for (let i = 0; i < n; i++) {
    const hop = P.hop + (P.hopSlow - P.hop) * Math.exp(-i / P.slowBalls);
    const choices = [], js = [0], tHit = [rel[i] + P.drop], arcs = [];
    for (let k = 0; k < R; k++) {
      const c = hash01(P.seed, i, k) < P.pRight ? 1 : 0;
      choices.push(c);
      js.push(js[k] + c);
      arcs.push(P.arc * (0.6 + 0.9 * hash01(P.seed + 2, i, k)));
      if (k < R - 1) tHit.push(tHit[k] + hop * (1 + P.hopJitter * (2 * hash01(P.seed + 1, i, k) - 1)));
    }
    balls.push({
      id: i, t0: rel[i], choices, js, tHit, arcs, bin: js[R], tEnter: tHit[R - 1],
      z: L.ballZ + P.zJitter * (2 * hash01(P.seed + 3, i) - 1), tracer: (P.tracers ?? []).includes(i),
    });
  }
  // stack slots in arrival order per bin; a ball never lands before the ball under it
  const perBin = Array.from({ length: L.bins }, () => []);
  for (const b of [...balls].sort((p, q) => p.tEnter - q.tEnter || p.id - q.id)) perBin[b.bin].push(b);
  const yEnter = L.lastY + L.contact;
  for (const list of perBin) {
    const under = {};
    list.forEach((b, m) => {
      b.slot = L.slot(b.bin, m, P.seed);
      b.fall = Math.sqrt((2 * (yEnter - b.slot.y)) / P.gFall);
      b.tLand = Math.max(b.tEnter + b.fall, (under[b.slot.col] ?? -1) + 0.03);
      b.fall = b.tLand - b.tEnter;
      under[b.slot.col] = b.tLand;
    });
  }
  const histogram = perBin.map((l) => l.length);
  // per-peg hit times (sorted) for the flash
  const hits = L.pegs.map(() => []);
  for (const b of balls) for (let k = 0; k < R; k++) hits[L.pegId(k, b.js[k])].push(b.tHit[k]);
  for (const h of hits) h.sort((a, b) => a - b);

  const xAt = (b, k) => (b.js[k] - k / 2) * B.dx;
  function pos(i, t) {
    const b = balls[i];
    if (t < b.t0) return null;
    if (t < b.tHit[0]) {                                            // out of the spout onto the apex peg
      const u = (t - b.t0) / P.drop, y0 = L.spoutY + r * 0.5, y1 = L.apexY + L.contact;
      return [0, y0 + (y1 - y0) * u * u, b.z];
    }
    if (t < b.tEnter) {                                             // hop from row k to row k + 1
      let k = 0;
      while (k < R - 2 && t >= b.tHit[k + 1]) k++;
      const u = (t - b.tHit[k]) / (b.tHit[k + 1] - b.tHit[k]);
      const x0 = xAt(b, k), x1 = xAt(b, k + 1), y0 = L.rowY(k) + L.contact;
      return [x0 + (x1 - x0) * u, y0 - B.dy * u + 4 * b.arcs[k] * u * (1 - u), b.z];
    }
    const x0 = xAt(b, R - 1), xc = L.binX(b.bin), xs = b.slot.x, ys = b.slot.y;
    if (t < b.tLand) {                                              // off the last peg, into the bin
      const u = (t - b.tEnter) / b.fall;
      const u1 = Math.min(1, u / 0.45), e1 = 1 - (1 - u1) * (1 - u1);              // clear the divider early
      const u2 = Math.min(1, Math.max(0, (u - 0.4) / 0.6)), e2 = u2 * u2 * (3 - 2 * u2);
      const hopUp = 4 * b.arcs[R - 1] * Math.min(1, u * 3) * Math.max(0, 1 - u * 3);   // a last little kick off the peg
      return [x0 + (xc - x0) * e1 + (xs - xc) * e2, yEnter + hopUp - (yEnter - ys) * u * u, b.z];
    }
    const s = t - b.tLand, d1 = P.bounceDur, d2 = P.bounceDur * 0.6;                 // two small bounces, then rest
    let y = ys;
    if (s < d1) { const u = s / d1; y += P.bounce * 4 * u * (1 - u); }
    else if (s < d1 + d2) { const u = (s - d1) / d2; y += P.bounce * 0.3 * 4 * u * (1 - u); }
    return [xs, y, b.z];
  }

  function pegGlow(id, t) {
    const h = hits[id];
    let lo = 0, hi = h.length;                                      // last hit <= t
    while (lo < hi) { const m = (lo + hi) >> 1; if (h[m] <= t) lo = m + 1; else hi = m; }
    if (!lo) return 0;
    return Math.exp(-(t - h[lo - 1]) / P.glowTau);
  }
  const counts = (t) => perBin.map((l) => l.reduce((a, b) => a + (b.tLand <= t ? 1 : 0), 0));
  const landed = (t) => balls.reduce((a, b) => a + (b.tLand <= t ? 1 : 0), 0);

  function events() {
    const ev = [];
    for (const b of balls) {
      ev.push({ t: b.t0, kind: "release", ball: b.id, x: 0 });
      for (let k = 0; k < R; k++) ev.push({ t: b.tHit[k], kind: "peg", ball: b.id, row: k, peg: L.pegId(k, b.js[k]), x: xAt(b, k) });
      ev.push({ t: b.tLand, kind: "land", ball: b.id, bin: b.bin, level: b.slot.row, x: b.slot.x });
    }
    return ev.sort((a, b) => a.t - b.t);
  }

  return {
    layout: L, params: P, n, balls, perBin, histogram, hits, pos, pegGlow, counts, landed, events,
    firstRelease: rel[0], lastRelease: rel[n - 1], lastLand: Math.max(...balls.map((b) => b.tLand)),
    maxStack: Math.max(...histogram),
  };
}

/** binomial pmf for the board (rows trials, chance pRight) */
export function binomial(rows, p = 0.5) {
  const out = [];
  let c = 1;
  for (let k = 0; k <= rows; k++) { out.push(c * p ** k * (1 - p) ** (rows - k)); c = (c * (rows - k)) / (k + 1); }
  return out;
}

/**
 * bellCurve(spec, n, samples = 96) -> [[x, y]]: the normal curve the stack tops are expected to follow for n balls
 * (mean and sd of the binomial, heights in metres of stacked balls: cols abreast, one ball diameter per row).
 */
export function bellCurve(spec, n, samples = 96) {
  const B = spec.board, L = layout(B), p = spec.plan.pRight;
  const mu = (p - 0.5) * B.rows * B.dx, sd = Math.sqrt(B.rows * p * (1 - p)) * B.dx;
  const perBall = (2 * B.ballR) / B.cols;
  const out = [];
  for (let s = 0; s <= samples; s++) {
    const x = L.inner.x0 + 0.06 + ((L.inner.x1 - L.inner.x0 - 0.12) * s) / samples;
    const dens = (n * B.dx) / (sd * Math.sqrt(2 * Math.PI)) * Math.exp(-((x - mu) ** 2) / (2 * sd * sd));
    out.push([x, L.floorY + dens * perBall]);
  }
  return out;
}

/** galtonVoices(spec.sound, layout) -> voices for scoreFromEvents: release click, peg tick, one marimba note per bin */
export function galtonVoices(S, L) {
  const note = (b) => 12 * Math.floor(b / S.land.scale.length) + S.land.scale[b % S.land.scale.length];
  return {
    release: () => [{ type: "click", gain: S.release.gain, pitch: S.release.pitch }],
    peg: (e) => [{
      type: "tick", gain: S.peg.gain * (0.65 + 0.7 * hash01(e.ball, e.row, 3)),
      pitch: S.peg.pitch * (1 - (S.peg.spread * e.row) / L.rows) * (0.94 + 0.12 * hash01(e.ball, e.row, 5)),
    }],
    land: (e) => [
      { type: "marimba", hz: S.land.root * 2 ** (note(e.bin) / 12), dur: S.land.dur, decay: S.land.decay, gain: S.land.gain },
      { type: "click", gain: S.land.click, pitch: 1.3 + 0.05 * e.level },
    ],
  };
}
