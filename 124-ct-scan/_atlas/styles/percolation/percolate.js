// styles/percolation/percolate.js — the percolation planner (pure: no THREE, no window, no DOM; Node-safe).
// Imported by style.js (picture) AND by the demo's scene.config.js (camera target + SCORE), so every valve click, every
// gurgle and the final rush come from the same plan as the pixels.
//
// Model: bond percolation on a square grid. W x H joints (nodes); a full-width TOP trough (T) above row 0 and a BOTTOM
// trough (B) below row H-1. Bonds (pipes, each with one valve):
//   vertical   : (H + 1) rows x W columns — trough T -> row 0, row j-1 -> row j, row H-1 -> trough B
//   horizontal : H rows x (W - 1)
// Valves open in a seeded random order. An incremental union-find finds the EXACT bond that first joins T to B (the
// "deciding" bond, index kStar in the order): connectivity is solved, not staged. Bonds before it open across the first
// beats, the deciding bond opens alone later, bonds after it never open.
//
// Water = earliest-arrival flood from T over open bonds (Dijkstra, each bond usable once its valve has turned; travel time
// per bond: `dt` before the join, `dtRace` after it, `dtDecide` through the deciding pipe). B is a sink: water that reaches
// the bottom trough does not climb back up other pipes. Every pipe's fill is therefore a closed form of t: from end a it
// starts at sa and takes da, from end b at sb / db (both ends can fill towards each other in a loop).
//
// Cluster tint: dry open clusters get a pastel colour (union by size: the larger cluster's colour wins on a merge; the
// smaller one's pipes cross-fade); the cluster touching the bottom trough gets its own "bottom" tint (index -2); pipes
// joined to the wet top cluster get index -1 (pending) until water reaches them. A pipe shows water colour once water is in it.
import { rng, clamp } from "../../kit/time.js";

// ------------------------------------------------------------------ grid
/** grid(W, H) -> { W, H, nNodes, T, B, bonds: [{ a, b, kind: "v"|"h", i, j, ax, ay, bx, by }] } (grid units, y up, centred) */
export function grid(W, H) {
  const nNodes = W * H, T = nNodes, B = nNodes + 1;
  const gx = (i) => i - (W - 1) / 2;
  const gy = (j) => (H - 1) / 2 - j; // j = -1 -> trough T line, j = H -> trough B line
  const node = (i, j) => (j < 0 ? T : j >= H ? B : j * W + i);
  const bonds = [];
  for (let j = 0; j <= H; j++) for (let i = 0; i < W; i++) {
    bonds.push({ a: node(i, j - 1), b: node(i, j), kind: "v", i, j, ax: gx(i), ay: gy(j - 1), bx: gx(i), by: gy(j) });
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < W - 1; i++) {
    bonds.push({ a: node(i, j), b: node(i + 1, j), kind: "h", i, j, ax: gx(i), ay: gy(j), bx: gx(i + 1), by: gy(j) });
  }
  const nodeXY = (n) => (n === T || n === B ? null : [gx(n % W), gy(Math.floor(n / W))]);
  return { W, H, nNodes, T, B, bonds, nodeXY, gx, gy };
}

// ------------------------------------------------------------------ union-find
function makeUF(n) {
  const parent = new Int32Array(n), size = new Int32Array(n).fill(1);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  /** union -> [winnerRoot, loserRoot] (or null when already joined) */
  const union = (a, b) => {
    let ra = find(a), rb = find(b);
    if (ra === rb) return null;
    if (size[ra] < size[rb] || (size[ra] === size[rb] && ra > rb)) [ra, rb] = [rb, ra];
    parent[rb] = ra; size[ra] += size[rb];
    return [ra, rb];
  };
  return { find, union, size };
}

/** firstSpanning(g, order) -> index k in `order` of the bond that first joins T and B (exact, incremental union-find) */
export function firstSpanning(g, order) {
  const uf = makeUF(g.nNodes + 2);
  for (let k = 0; k < order.length; k++) {
    const e = g.bonds[order[k]];
    uf.union(e.a, e.b);
    if (uf.find(g.T) === uf.find(g.B)) return k;
  }
  return -1;
}

/** bfs hop distances from `src` over the bonds in `open` (array of bond ids), never passing through `block` nodes */
function hops(g, open, src, block = []) {
  const adj = new Map();
  for (const id of open) {
    const e = g.bonds[id];
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push(e.b); adj.get(e.b).push(e.a);
  }
  const d = new Map([[src, 0]]), q = [src], blocked = new Set(block);
  while (q.length) {
    const u = q.shift();
    if (blocked.has(u) && u !== src) continue;
    for (const v of adj.get(u) ?? []) if (!d.has(v)) { d.set(v, d.get(u) + 1); q.push(v); }
  }
  return d;
}

/**
 * analyse(W, H, seed) -> { order, kStar, frac, star, upHops, downHops, col, row } — one seeded opening order and where it
 * spans. upHops = hops from T to the deciding bond's wet end; downHops = hops from its other end to B, both through the
 * bonds open before it.
 */
export function analyse(W, H, seed) {
  const g = grid(W, H);
  const order = rng(seed).shuffle(g.bonds.map((_, i) => i));
  const kStar = firstSpanning(g, order);
  const before = order.slice(0, kStar);
  const star = g.bonds[order[kStar]];
  const fromT = hops(g, before, g.T, [g.B]);
  const fromB = hops(g, before, g.B, [g.T]);
  const [up, down] = fromT.has(star.a) ? [star.a, star.b] : [star.b, star.a];
  return {
    g, order, kStar, frac: kStar / g.bonds.length, star, starId: order[kStar], wetEnd: up, dryEnd: down,
    upHops: fromT.get(up) ?? Infinity, downHops: fromB.get(down) ?? Infinity,
  };
}

/**
 * findSeed(W, H, { from, count, accept(a) }) -> first seed in [from, from + count) whose analysis passes `accept`.
 * Deterministic: used to choose a seed whose deciding bond sits mid-board with a long dry run below it. The demo stores the
 * chosen seed in the spec; planPercolation re-checks the criteria and throws if they no longer hold.
 */
export function findSeed(W, H, { from = 1, count = 4000, accept } = {}) {
  for (let s = from; s < from + count; s++) { const a = analyse(W, H, s); if (accept(a)) return { seed: s, ...a }; }
  return null;
}

// ------------------------------------------------------------------ the plan
const PIECE = (x, xs, ys) => { // piecewise-linear map
  if (x <= xs[0]) return ys[0];
  for (let k = 1; k < xs.length; k++) if (x <= xs[k]) return ys[k - 1] + ((ys[k] - ys[k - 1]) * (x - xs[k - 1])) / (xs[k] - xs[k - 1]);
  return ys[ys.length - 1];
};

/**
 * planPercolation(o) -> plan
 *   o = { W, H, seed, tints (count of pastel tints),
 *         open:   { knots: [[share, t], ...] }   // cumulative share of the pre-spanning bonds opened by time t
 *         turn:   seconds a valve takes to turn,
 *         decide: { at, turn, dt }               // the deciding valve: turn start, turn length, water time through it
 *         flow:   { dt, reachB }                 // seconds per pipe before the join; time water should reach trough B
 *         accept: (analysis) => bool            // optional re-check of the seed's shape
 *         binHz }                                // sound binning
 */
export function planPercolation(o) {
  const W = o.W ?? 22, H = o.H ?? 12;
  const A = analyse(W, H, o.seed);
  if (A.kStar < 0) throw new Error("percolate: grid never spans");
  if (o.accept && !o.accept(A)) throw new Error(`percolate: seed ${o.seed} fails the acceptance check (kStar ${A.kStar}, up ${A.upHops}, down ${A.downHops})`);
  const { g, order, kStar } = A;
  const N = g.bonds.length, nN = g.nNodes + 2;
  const TURN = o.turn ?? 0.2, DEC = o.decide, FLOW = o.flow;
  const knots = o.open.knots;

  // ---- valve times
  const tOpen = new Float64Array(N).fill(Infinity), turnDur = new Float64Array(N).fill(TURN), rank = new Int32Array(N).fill(-1);
  for (let k = 0; k < kStar; k++) {
    const share = (k + 0.5) / kStar;
    tOpen[order[k]] = PIECE(share, knots.map((q) => q[0]), knots.map((q) => q[1]));
    rank[order[k]] = k;
  }
  const starId = order[kStar];
  tOpen[starId] = DEC.at; turnDur[starId] = DEC.turn; rank[starId] = kStar;
  const tDone = (e) => tOpen[e] + turnDur[e];
  const lastBefore = tOpen[order[kStar - 1]];

  // ---- flood: earliest arrival from T (B is a sink)
  const adj = Array.from({ length: nN }, () => []);
  for (let e = 0; e < N; e++) if (Number.isFinite(tOpen[e])) { const b = g.bonds[e]; adj[b.a].push([b.b, e]); adj[b.b].push([b.a, e]); }
  const tJoin = DEC.at + DEC.turn + DEC.dt; // water has crossed the deciding pipe
  const flood = (dtRace) => {
    const arr = new Float64Array(nN).fill(Infinity), done = new Uint8Array(nN);
    arr[g.T] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let n = 0; n < nN; n++) if (!done[n] && arr[n] < best) { best = arr[n]; u = n; }
      if (u < 0) break;
      done[u] = 1;
      if (u === g.B) continue; // sink
      for (const [v, e] of adj[u]) {
        const dep = Math.max(arr[u], tDone(e));
        const dur = e === starId ? DEC.dt : dep >= tJoin - 1e-9 ? dtRace : FLOW.dt;
        if (dep + dur < arr[v]) arr[v] = dep + dur;
      }
    }
    return arr;
  };
  // race speed: choose dtRace so water reaches trough B at flow.reachB (bisection on the monotone arrival time)
  let lo = 0.02, hi = 2, arr = null;
  for (let it = 0; it < 50; it++) { const m = (lo + hi) / 2; const a = flood(m); if (a[g.B] > FLOW.reachB) hi = m; else lo = m; }
  const dtRace = (lo + hi) / 2;
  arr = flood(dtRace);
  const durAt = (e, dep) => (e === starId ? DEC.dt : dep >= tJoin - 1e-9 ? dtRace : FLOW.dt);

  // per-pipe fill from each end
  const sa = new Float64Array(N).fill(Infinity), sb = new Float64Array(N).fill(Infinity);
  const da = new Float64Array(N).fill(1), db = new Float64Array(N).fill(1);
  for (let e = 0; e < N; e++) {
    if (!Number.isFinite(tOpen[e])) continue;
    const b = g.bonds[e];
    if (Number.isFinite(arr[b.a]) && b.a !== g.B) { sa[e] = Math.max(arr[b.a], tDone(e)); da[e] = durAt(e, sa[e]); }
    if (Number.isFinite(arr[b.b]) && b.b !== g.B) { sb[e] = Math.max(arr[b.b], tDone(e)); db[e] = durAt(e, sb[e]); }
  }
  // settle time of the water before the join (must be before the deciding beat)
  let settle = 0;
  for (let e = 0; e < N; e++) {
    for (const [s, d] of [[sa[e], da[e]], [sb[e], db[e]]]) if (Number.isFinite(s) && s < DEC.at) settle = Math.max(settle, s + d);
  }

  // ---- cluster tints (replay the order; union by size, the bigger cluster keeps its colour)
  const K = o.tints ?? 6;
  const uf = makeUF(nN);
  const colourOf = new Int32Array(nN).fill(-1); // colour index per root; -1 = none yet
  const members = new Map(); // root -> bond ids
  const tint = Array.from({ length: N }, () => []); // per bond: [[t, colourIndex], ...] (colourIndex -1 = plain/wet-bound)
  let created = 0;
  const wetRootT = () => uf.find(g.T);
  for (let k = 0; k <= kStar; k++) {
    const e = order[k], b = g.bonds[e], t = tOpen[e];
    const ra0 = uf.find(b.a), rb0 = uf.find(b.b);
    const r = uf.union(b.a, b.b);
    const root = uf.find(b.a);
    const ca = colourOf[ra0], cb = colourOf[rb0];
    let c;
    if (root === wetRootT()) c = -1; // joins the wet (top) cluster: no tint, water is coming
    else if (root === uf.find(g.B)) c = -2; // touches the bottom trough (still dry): the "bottom" tint
    else if (r) {
      const [win, lose] = r;
      c = colourOf[win] >= 0 ? colourOf[win] : colourOf[lose] >= 0 ? colourOf[lose] : (created++ % K);
    } else c = ca >= 0 ? ca : cb >= 0 ? cb : (created++ % K);
    colourOf[root] = c;
    // re-colour the merged members whose colour changes (dry merges only; the wet cluster keeps old tints until water)
    const list = [];
    for (const rr of new Set([ra0, rb0])) { const m = members.get(rr); if (m) list.push(...m); members.delete(rr); }
    list.push(e);
    if (c !== -1) for (const x of list) { const h = tint[x]; if (!h.length || h[h.length - 1][1] !== c) h.push([t, c]); }
    else tint[e].push([t, -1]);
    members.set(root, list);
  }

  // ---- B trough
  const tB = arr[g.B];
  // which pipes carry the newly joined water (for highlight / sound): those whose fill starts at or after tJoin
  const raceBonds = [];
  for (let e = 0; e < N; e++) if (Math.min(sa[e], sb[e]) >= DEC.at && Number.isFinite(Math.min(sa[e], sb[e]))) raceBonds.push(e);

  // ---- closed-form state at t
  const plan = {
    W, H, grid: g, N, seed: o.seed, order, kStar, starId, star: g.bonds[starId], wetEnd: A.wetEnd, dryEnd: A.dryEnd,
    tOpen, turnDur, sa, sb, da, db, arr, tint, tB, tJoin, dtRace, settle, lastBefore, raceBonds,
    /** valve angle share 0 (closed) .. 1 (open) — eased with a small overshoot in the picture */
    valveU(e, t) { return clamp((t - tOpen[e]) / turnDur[e]); },
    /** water fill [fa, fb]: share of the pipe filled from end a / from end b (fa + fb <= 1) */
    fill(e, t) {
      const fa = Number.isFinite(sa[e]) ? clamp((t - sa[e]) / da[e]) : 0;
      let fb = Number.isFinite(sb[e]) ? clamp((t - sb[e]) / db[e]) : 0;
      if (fa + fb > 1) fb = 1 - fa;
      return [fa, fb];
    },
    /** tint at t: { from, to, u } colour indices (-1 = none) and blend share */
    tintAt(e, t, fade = 0.25) {
      const h = tint[e];
      let i = -1;
      for (let k = 0; k < h.length; k++) if (h[k][0] <= t) i = k; else break;
      if (i < 0) return { from: -1, to: -1, u: 1 };
      const prev = i > 0 ? h[i - 1][1] : -1;
      return { from: prev, to: h[i][1], u: clamp((t - h[i][0]) / fade) };
    },
    /** bottom trough level 0..1 */
    troughB(t, rise = 1.4) { return Number.isFinite(tB) ? clamp((t - tB) / rise) : 0; },
    /** number of open valves at t (for checks) */
    openCount(t) { let n = 0; for (let e = 0; e < N; e++) if (tOpen[e] <= t) n++; return n; },
    /** is the top cluster joined to B at t (pure connectivity of the valves opened by then) */
    spans(t) { return t >= tOpen[starId]; },
    events(o2 = {}) { return events(plan, o2); },
    stats: {
      bonds: N, opened: kStar + 1, share: +((kStar + 1) / N).toFixed(3), kStar, upHops: A.upHops, downHops: A.downHops,
      deciding: { kind: g.bonds[starId].kind, i: g.bonds[starId].i, j: g.bonds[starId].j },
      lastBefore: +lastBefore.toFixed(3), settle: +settle.toFixed(3), tJoin: +tJoin.toFixed(3), tB: +tB.toFixed(3), dtRace: +dtRace.toFixed(4),
      raceBonds: raceBonds.length, clusters: created,
    },
  };
  if (!(settle < DEC.at)) throw new Error(`percolate: water still moving at ${settle.toFixed(2)} s, after the deciding beat (${DEC.at})`);
  return plan;
}

// ------------------------------------------------------------------ sound events (same plan)
/**
 * events(plan, { binHz }) -> [{ t, kind, ... }] for kit/schedule.scoreFromEvents:
 *   "valves" one per 1/binHz bin of valve turns (n = count), "decide" the deciding valve, "gurgle" one per bin of pipes
 *   starting to fill before the join, "race" bins after the join (n), "trough" when water reaches trough B.
 */
export function events(plan, { binHz = 20 } = {}) {
  const out = [];
  const bin = (list, kind) => {
    const m = new Map();
    for (const t of list) { const k = Math.floor(t * binHz); m.set(k, (m.get(k) ?? 0) + 1); }
    [...m.keys()].sort((a, b) => a - b).forEach((k) => out.push({ t: (k + 0.5) / binHz, kind, n: m.get(k), bin: k }));
  };
  const valves = [], gurgle = [], race = [];
  for (let e = 0; e < plan.N; e++) {
    if (e === plan.starId) continue;
    if (Number.isFinite(plan.tOpen[e])) valves.push(plan.tOpen[e] + plan.turnDur[e] * 0.8);
    const s = Math.min(plan.sa[e], plan.sb[e]);
    if (Number.isFinite(s)) (s >= plan.tJoin - 1e-6 ? race : gurgle).push(s);
  }
  bin(valves, "valves"); bin(gurgle, "gurgle"); bin(race, "race");
  out.push({ t: plan.tOpen[plan.starId] + plan.turnDur[plan.starId] * 0.85, kind: "decide" });
  if (Number.isFinite(plan.tB)) out.push({ t: plan.tB, kind: "trough" });
  return out.sort((a, b) => a.t - b.t);
}

/** voices for scoreFromEvents, levels from spec.sound */
export function percolationVoices(SND) {
  return {
    valves: (e) => [{ type: "click", dur: 0.03, gain: SND.valve.gain * Math.min(1, SND.valve.base + SND.valve.per * Math.sqrt(e.n)), pitch: SND.valve.pitch * (0.85 + 0.3 * ((e.bin * 7919) % 97) / 97), pan: (((e.bin * 131) % 61) / 61 - 0.5) * 0.6 }],
    gurgle: (e) => [{ type: "bubble", dur: 0.1, gain: SND.gurgle.gain * Math.min(1, 0.5 + 0.25 * Math.sqrt(e.n)), pitch: SND.gurgle.pitch * (0.8 + 0.4 * ((e.bin * 37) % 29) / 29) }],
    race: (e) => [{ type: "bubble", dur: 0.1, gain: SND.race.gain * Math.min(1, 0.6 + 0.25 * Math.sqrt(e.n)), pitch: SND.race.pitch * (0.8 + 0.4 * ((e.bin * 53) % 31) / 31) }],
    decide: () => [
      { type: "clack", dur: 0.14, gain: SND.decide.gain, pitch: 0.8 },
      { type: "thud", dur: 0.4, gain: SND.decide.thud, pitch: 1.0, offset: 0.01 },
    ],
    trough: () => [
      { type: "chime", dur: 1.6, notes: 4, sparkle: 0.6, gain: SND.trough.gain, pitch: 1.0 },
      { type: "rumble", dur: 1.6, gain: SND.trough.rumble },
    ],
  };
}
