// styles/loom-weave/draft.js — the weaving DRAFT planner for "Loom Weave". Pure, Node-safe: no THREE, no window, no DOM.
// Imported by style.js (picture) AND by scene.config.js (SCORE), so every heddle clack, shuttle swish and reed thump is
// derived from the same pick plan the picture reads.
//
// Vocabulary (handweaving):
//   warp  = the W threads stretched front-to-back on the loom (cream). warp j sits at x = x0 + (j + .5) * spacing.
//   pick  = one pass of the shuttle = one row of cloth. Row k of the cloth = pick k.
//   lift  = for each pick, which warp threads rise (1) and which stay down (0). Lifted warp lies ON TOP of the weft in that
//           row (cream shows); a lowered warp lies under it (the weft colour shows). This table IS the punch card: a hole
//           at (row k, column j) = warp j rises on pick k.
//   fell  = the edge of the cloth where the newest row is beaten in. Here the fell, reed, heddles and card reader stay put
//           and the cloth AND the card advance one row per pick toward the weaver, so card row k always lies right
//           beside cloth row k.
//
// Per pick (local phase u = (t - t0) / dur):   0 .. SHED      heddles move from the last shed to this pick's shed
//                                               FLY0 .. FLY1   shuttle crosses the open shed, trailing the weft
//                                               BEAT0 .. BEAT2 reed swings to the fell (contact at BEAT1) and back
//                                               ADV0 .. 1      cloth + card advance one row (the new row slides out)
import { clamp, smoothstep, ease } from "../../kit/time.js";

export const PHASE = { SHED: 0.24, FLY0: 0.2, FLY1: 0.66, BEAT0: 0.68, BEAT1: 0.79, BEAT2: 0.9, ADV0: 0.82 };

// ------------------------------------------------------------------------------------------------ motifs
/**
 * rectMotif(W, H, rects) -> Uint8Array(W * H), row-major with row 0 = BOTTOM of the picture (woven first).
 *   rects: [{ x: [x0, x1], y: [y0, y1], v: 1|0 }] inclusive cell ranges, applied in order (later wins).
 *   v = 1: warp up (cream figure), v = 0: warp down (weft-coloured ground).
 */
export function rectMotif(W, H, rects) {
  const m = new Uint8Array(W * H);
  for (const r of rects) {
    for (let y = Math.max(0, r.y[0]); y <= Math.min(H - 1, r.y[1]); y++)
      for (let x = Math.max(0, r.x[0]); x <= Math.min(W - 1, r.x[1]); x++) m[y * W + x] = r.v ?? 1;
  }
  return m;
}

/** robotMotif() -> { W: 40, H: 30, cells } — an original little robot waving nothing, facing the weaver (cream on ground). */
export function robotMotif() {
  const W = 40, H = 30;
  const R = (x0, x1, y0, y1, v = 1) => ({ x: [x0, x1], y: [y0, y1], v });
  const rects = [
    R(18, 21, 26, 28), R(17, 22, 27, 27),            // antenna ball
    R(19, 20, 25, 25),                                // antenna stem
    R(9, 30, 16, 24), R(9, 9, 24, 24, 0), R(30, 30, 24, 24, 0), R(9, 9, 16, 16, 0), R(30, 30, 16, 16, 0), // head, rounded
    R(13, 16, 20, 22, 0), R(23, 26, 20, 22, 0),       // eyes (ground colour shows through)
    R(15, 24, 18, 18, 0),                             // mouth
    R(7, 8, 19, 21), R(31, 32, 19, 21),               // ears
    R(17, 22, 15, 15),                                // neck
    R(11, 28, 5, 14), R(11, 11, 14, 14, 0), R(28, 28, 14, 14, 0), R(11, 11, 5, 5, 0), R(28, 28, 5, 5, 0), // body
    R(15, 24, 8, 11, 0), R(19, 20, 9, 10),            // chest panel with a little core light
    R(6, 9, 7, 13), R(10, 10, 12, 13), R(30, 33, 7, 13), R(29, 29, 12, 13), // arms + shoulders
    R(13, 17, 3, 4), R(22, 26, 3, 4),                 // legs
    R(11, 17, 1, 2), R(22, 28, 1, 2),                 // feet
  ];
  return { W, H, cells: rectMotif(W, H, rects) };
}

// ------------------------------------------------------------------------------------------------ the draft
/**
 * buildDraft(motif, { border = 3, borderWefts = [...], motifWeft }) -> draft
 *   Plain-weave border rows (alternate warps up, swapping each row) below and above the motif; motif rows lift where the
 *   motif is 1. Each row carries its weft colour.
 *   draft = { W, N, lift: Uint8Array(N * W), weft: [hex], kind: ["border"|"motif"], motifRows: [k0, k1], holes(k), rowString(k) }
 */
export function buildDraft(motif, o = {}) {
  const { W, H, cells } = motif;
  const border = o.border ?? 3;
  const bw = o.borderWefts ?? ["#d2392f", "#f0b429", "#d2392f"];
  const mw = o.motifWeft ?? "#1f5fbf";
  const N = H + 2 * border;
  const lift = new Uint8Array(N * W), weft = [], kind = [];
  for (let k = 0; k < N; k++) {
    const isMotif = k >= border && k < border + H;
    kind.push(isMotif ? "motif" : "border");
    weft.push(isMotif ? mw : bw[(k < border ? k : k - border - H) % bw.length]);
    for (let j = 0; j < W; j++) lift[k * W + j] = isMotif ? cells[(k - border) * W + j] : (j + k) % 2;
  }
  const holes = (k) => { let n = 0; for (let j = 0; j < W; j++) n += lift[k * W + j]; return n; };
  const rowString = (k) => Array.from(lift.subarray(k * W, (k + 1) * W), (v) => (v ? "o" : ".")).join("");
  return { W, N, lift, weft, kind, motifRows: [border, border + H - 1], holes, rowString };
}

// ------------------------------------------------------------------------------------------------ the pick plan
/**
 * planPicks(draft, { t0, tEnd, dFirst, dMin, close }) -> plan
 *   Pick durations speed up: d_k = dMin + (dFirst - dMin) * exp(-k / tau), tau solved (bisection) so the last pick ends
 *   at tEnd. `close` = seconds for the shed to settle flat after the last pick.
 *   plan = { draft, picks: [{ k, t0, dur, dir }], tau, at(t) -> state, lift(j, t) -> -1..1, events() }
 */
export function planPicks(draft, o = {}) {
  const N = draft.N, W = draft.W;
  const t0 = o.t0 ?? 0.35, tEnd = o.tEnd ?? 12, dFirst = o.dFirst ?? 1.2, dMin = o.dMin ?? 0.2, close = o.close ?? 0.45;
  const total = tEnd - t0;
  const sumFor = (tau) => { let s = 0; for (let k = 0; k < N; k++) s += dMin + (dFirst - dMin) * Math.exp(-k / tau); return s; };
  let lo = 0.01, hi = 1e4;
  if (sumFor(hi) < total) throw new Error(`draft: ${N} picks cannot fill ${total.toFixed(2)} s with dFirst ${dFirst}`);
  if (sumFor(lo) > total) throw new Error(`draft: ${N} picks at dMin ${dMin} already exceed ${total.toFixed(2)} s`);
  for (let it = 0; it < 80; it++) { const mid = Math.sqrt(lo * hi); if (sumFor(mid) > total) hi = mid; else lo = mid; }
  const tau = Math.sqrt(lo * hi);
  const picks = [];
  let t = t0;
  for (let k = 0; k < N; k++) {
    const dur = dMin + (dFirst - dMin) * Math.exp(-k / tau);
    picks.push({ k, t0: t, dur, dir: k % 2 === 0 ? 1 : -1 });
    t += dur;
  }
  picks[N - 1].dur += tEnd - t; // absorb bisection rounding (~1e-9)
  const ends = picks.map((p) => p.t0 + p.dur);

  /** index of the pick active at t (-1 before the first, N after the last) */
  function pickAt(t) {
    if (t < t0) return -1;
    if (t >= tEnd) return N;
    let a = 0, b = N - 1;
    while (a < b) { const m = (a + b) >> 1; if (ends[m] <= t) a = m + 1; else b = m; }
    return a;
  }
  const L = (k, j) => (k < 0 || k >= N ? 0 : draft.lift[k * W + j] ? 1 : -1);

  /**
   * at(t) -> { k, u, n, shedU, flyU, beat, adv, prevK, side, shuttleDir, weftOn, weftZ, done }
   *   n     = how many rows the cloth/card have advanced (float; row k becomes visible as n passes k)
   *   shedU = 0..1 heddles moving from pick prevK's shed to pick k's shed (use with lift())
   *   flyU  = 0..1 shuttle across this pick (0 before flight, 1 after); side = -1 left / +1 right resting side
   *   beat  = 0..1..0 reed swing (1 = at the fell); weftOn = the trailing weft is visible; weftZ = 0 shed .. 1 fell
   */
  function at(t) {
    const k = pickAt(t);
    if (k < 0) return { k: -1, u: 0, n: 0, shedU: 0, flyU: 0, beat: 0, adv: 0, side: -1, dir: 1, weftOn: false, weftZ: 0, done: 0, closeU: 0 };
    if (k >= N) {
      const closeU = smoothstep(tEnd, tEnd + close, t);
      return { k: N, u: 1, n: N, shedU: 1, flyU: 1, beat: 0, adv: 1, side: picks[N - 1].dir, dir: picks[N - 1].dir, weftOn: false, weftZ: 1, done: 1, closeU };
    }
    const p = picks[k], u = clamp((t - p.t0) / p.dur);
    const shedU = ease.inOutSine(clamp(u / PHASE.SHED));
    const flyU = ease.inOutSine(clamp((u - PHASE.FLY0) / (PHASE.FLY1 - PHASE.FLY0)));
    const beat = u < PHASE.BEAT1 ? ease.inQuad(clamp((u - PHASE.BEAT0) / (PHASE.BEAT1 - PHASE.BEAT0)))
      : 1 - ease.inOutSine(clamp((u - PHASE.BEAT1) / (PHASE.BEAT2 - PHASE.BEAT1)));
    const adv = ease.inOutSine(clamp((u - PHASE.ADV0) / (1 - PHASE.ADV0)));
    const weftOn = u >= PHASE.FLY0 && u < PHASE.ADV0 + 0.02;
    const weftZ = u < PHASE.BEAT1 ? (u < PHASE.BEAT0 ? 0 : ease.inQuad(clamp((u - PHASE.BEAT0) / (PHASE.BEAT1 - PHASE.BEAT0)))) : 1;
    const side = flyU >= 1 ? p.dir : -p.dir;
    return { k, u, n: k + adv, shedU, flyU, beat, adv, side, dir: p.dir, weftOn, weftZ, done: 0, closeU: 0 };
  }

  /** lift(j, t, s = at(t)) -> -1 (down) .. 0 (rest, flat) .. 1 (up): the heddle/eye position of warp j */
  function lift(j, t, s = at(t)) {
    if (s.k < 0) return 0;
    if (s.k >= N) return L(N - 1, j) * (1 - s.closeU);
    const prev = s.k === 0 ? 0 : L(s.k - 1, j);
    return prev + (L(s.k, j) - prev) * s.shedU;
  }

  /** events() -> [{ t, kind: "shed"|"throw"|"catch"|"beat"|"advance", k, ... }] for kit scoreFromEvents */
  function events() {
    const ev = [];
    for (const p of picks) {
      const fly = (PHASE.FLY1 - PHASE.FLY0) * p.dur;
      ev.push({ t: p.t0 + 0.02 * p.dur, kind: "shed", k: p.k, lifted: draft.holes(p.k), W, dur: p.dur });
      ev.push({ t: p.t0 + PHASE.FLY0 * p.dur, kind: "throw", k: p.k, dir: p.dir, dur: fly, pickDur: p.dur });
      ev.push({ t: p.t0 + PHASE.FLY1 * p.dur, kind: "catch", k: p.k, dir: p.dir, pickDur: p.dur });
      ev.push({ t: p.t0 + PHASE.BEAT1 * p.dur, kind: "beat", k: p.k, pickDur: p.dur, motif: draft.kind[p.k] === "motif" });
      ev.push({ t: p.t0 + (PHASE.ADV0 + 0.05) * p.dur, kind: "advance", k: p.k, pickDur: p.dur });
    }
    return ev.sort((a, b) => a.t - b.t);
  }

  /** rowsDoneAt(t) -> rows fully woven (integer) */
  const rowsDoneAt = (t) => { const s = at(t); return s.k < 0 ? 0 : s.k >= N ? N : s.k + (s.u >= PHASE.BEAT1 ? 1 : 0); };
  /** pickStart(k) / pickEnd(k): handy for beat and label timing */
  const pickStart = (k) => picks[clamp(k, 0, N - 1)].t0;
  const pickEnd = (k) => ends[clamp(k, 0, N - 1)];

  return { draft, picks, tau, t0, tEnd, at, lift, events, rowsDoneAt, pickStart, pickEnd, pickAt };
}

/**
 * loomVoices(sound) -> voices for kit scoreFromEvents. Faster picks play a little softer so the clatter thickens without
 * clipping; shuttle swishes pan with the throw direction.
 */
export function loomVoices(S = {}) {
  const g = (base, pickDur) => base * (0.55 + 0.45 * clamp(pickDur / 0.9));
  return {
    shed: (e) => [{ type: "clack", gain: g(S.shed?.gain ?? 0.34, e.dur) * (0.75 + 0.5 * Math.sqrt(e.lifted / e.W)), pitch: S.shed?.pitch ?? 0.7, dur: 0.1 }],
    throw: (e) => [{ type: "whoosh", dir: "in", dur: Math.max(0.09, e.dur * 1.3), gain: g(S.throw?.gain ?? 0.3, e.pickDur), pitch: S.throw?.pitch ?? 1.6, pan: 0.35 * e.dir }],
    catch: (e) => [{ type: "click", gain: g(S.catch?.gain ?? 0.22, e.pickDur), pitch: S.catch?.pitch ?? 0.8, pan: 0.6 * e.dir }],
    beat: (e) => [{ type: "thud", gain: g(S.beat?.gain ?? 0.5, e.pickDur), pitch: S.beat?.pitch ?? 1.3, dur: 0.28 }],
    advance: (e) => [{ type: "tick", gain: g(S.card?.gain ?? 0.14, e.pickDur), pitch: S.card?.pitch ?? 1.4, pan: 0.5 }],
  };
}
