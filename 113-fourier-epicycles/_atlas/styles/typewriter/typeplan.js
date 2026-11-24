// styles/typewriter/typeplan.js — PURE typing plan + machine layout for the typewriter style. No THREE, no window,
// no DOM: imported by style.js (browser) for the picture AND by a scene's scene.config.js (Node) for SCORE and the
// camera, so every clack, bell and ratchet tick sits exactly on the strike / return the picture shows.
//
//   layout(S)                 -> machine frame: print point, paper axes, type-bar pivots, key positions, carriage x per column
//   createTypePlan(S, lines)  -> plan: per-character strike times (snapped to frames), which key and type bar move,
//                                carriage column, line feeds, bells, plus closed-form readers of the machine state at t
//   typeVoices(SND)           -> voices for kit/schedule.scoreFromEvents(plan.events(), ...)
//
// lines = [{ text, at = 0 (earliest start, s), cps = 7, ink = "black" | "red", ret = true (carriage return after), feed = 1 }]
import { clamp, lerp, hash01, toEase } from "../../kit/time.js";
import { typePlan } from "../../kit/choreo.js";

const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** layout(S) -> the machine's fixed geometry as plain arrays (world metres, machine at the origin). */
export function layout(S) {
  const M = S.machine, K = S.keyboard, G = S.page;
  const tilt = M.paperTilt;
  const u = [0, Math.cos(tilt), -Math.sin(tilt)];   // up the sheet
  const n = [0, Math.sin(tilt), Math.cos(tilt)];    // out of the sheet, toward the typist
  const X = [1, 0, 0];
  const P = M.printPoint;
  const platenC = add(P, n, -M.platen.r);
  // keys: id = its character; position = centre of the cap top
  const keys = [];
  K.rows.forEach((row, r) => {
    [...row].forEach((ch, j) => keys.push({ id: ch, row: r, x: (j - (row.length - 1) / 2) * K.pitch + K.stagger[r], y: K.y[r], z: K.z[r] }));
  });
  // one type bar per key, in left-to-right key order around the U of the basket
  const order = keys.map((k, i) => i).sort((a, b) => keys[a].x - keys[b].x || keys[a].row - keys[b].row);
  const B = M.basket, C = add(P, n, B.d), L = Math.hypot(B.R, B.d);
  const strikeAngle = -Math.atan2(B.d, B.R);
  const bars = order.map((ki, k) => {
    const a = lerp(-B.spread, B.spread, k / (order.length - 1));
    keys[ki].bar = k;
    const e1 = add([0, 0, 0], add([-Math.sin(a), 0, 0], u, Math.cos(a)));          // toward the centre of the pivot circle
    const axis = add([Math.cos(a), 0, 0], u, Math.sin(a));                          // hinge axis (tangent)
    const pivot = add(add(C, X, B.R * Math.sin(a)), u, -B.R * Math.cos(a));
    return { k, key: keys[ki].id, a, pivot, e1, axis };
  });
  const keyOf = Object.fromEntries(keys.map((k) => [k.id, k]));
  const colX = (col) => (col - (G.cols - 1) / 2) * G.pitch;      // page-local x of a column centre
  const carriageX = (col) => -colX(col);                          // carriage x that puts that column at the print point
  /** barDir(bar, s) -> unit direction of a bar at swing s (0 = at rest in the basket, 1 = at the paper). */
  const barDir = (bar, s) => {
    const psi = lerp(B.rest, strikeAngle, s);
    return add(add([0, 0, 0], bar.e1, Math.cos(psi)), n, Math.sin(psi));
  };
  /** pagePoints(carX, feedLines) -> the four corners of the visible sheet (world). */
  const pagePoints = (carX, feedLines) => {
    const top = M.paper.top + feedLines * G.lineHeight, h = M.paper.w / 2;
    return [[-h, 0], [h, 0], [h, top], [-h, top]].map(([x, y]) => add([P[0] + carX + x, P[1], P[2]], u, y));
  };
  return { u, n, P, platenC, keys, keyOf, bars, barLength: L, strikeAngle, colX, carriageX, barDir, pagePoints, tilt };
}

/** createTypePlan(S, lines, { fps = 30 }) -> plan (see the header). Deterministic; times snapped to frames. */
export function createTypePlan(S, lines, { fps = 30 } = {}) {
  const T = S.typing, G = S.page, L = layout(S);
  const q = (x) => Math.round(x * fps) / fps;
  const chars = [], returns = [], moves = [], smooth = [];
  let cursor = 0;
  lines.forEach((ln, li) => {
    const text = ln.text.slice(0, G.cols);
    const tp = typePlan(text, Math.max(ln.at ?? 0, cursor), { cps: ln.cps ?? 7, jitter: T.jitter, seed: T.seed + li * 13, pause: 0.06 });
    let last = -Infinity;
    [...text].forEach((ch, col) => {
      const t = Math.max(q(tp.times[col]), q(last + T.minGap));
      last = t;
      const i = chars.length, key = ch === " " ? " " : L.keyOf[ch] ? ch : null;
      if (key === null) throw new Error(`typeplan: no key for "${ch}"`);
      const J = G.jitter;
      chars.push({
        i, ch, line: li, col, t, key, bar: ch === " " ? -1 : L.keyOf[ch].bar, ink: ln.ink ?? "black",
        jx: (hash01(i, 3, T.seed) - 0.5) * 2 * J.x, jy: (hash01(i, 5, T.seed) - 0.5) * 2 * J.y,
        rot: (hash01(i, 7, T.seed) - 0.5) * 2 * J.rot, density: 1 - J.ink * hash01(i, 11, T.seed),
      });
      moves.push({ t0: t + T.stepDelay, t1: t + T.stepDelay + T.stepDur, from: col, to: col + 1, ease: "outCubic" });
    });
    const first = chars[chars.length - text.length].t;
    smooth.push({ t0: first, t1: last + T.stepDelay + T.stepDur, from: 0, to: text.length, ease: "linear" });
    cursor = last + T.minGap;
    if (ln.ret !== false) {
      const t0 = q(last + T.returnAfter), t1 = t0 + T.returnDur;
      const R = { t0, t1, bell: q(last + T.bellAfter), fromCol: text.length, line: li, feed: ln.feed ?? 1 };
      returns.push(R);
      moves.push({ t0, t1, from: text.length, to: 0, ease: "inOutCubic" });
      smooth.push({ t0, t1, from: text.length, to: 0, ease: "inOutSine" });
      cursor = t1 + T.afterReturn;
    }
  });
  const strikes = chars.filter((c) => c.bar >= 0);
  const byBar = {}, byKey = {};
  for (const c of strikes) (byBar[c.bar] ??= []).push(c.t);
  for (const c of chars) (byKey[c.key] ??= []).push(c.t);
  const EPS = 1e-4;
  const track = (list, t) => {
    let v = list.length ? list[0].from : 0;
    for (const m of list) {
      if (t < m.t0) break;
      v = lerp(m.from, m.to, toEase(m.ease)(clamp((t - m.t0) / (m.t1 - m.t0))));
    }
    return v;
  };
  // swing: 0 at rest, 1 on the strike frame; accelerates in, eases back
  const swing = (tau, rise, fall) => (tau <= -rise || tau >= fall ? 0 : tau <= 0 ? ((tau + rise) / rise) ** 2 : (1 - tau / fall) ** 2);
  const peak = (times, t, rise, fall, shift = 0) => {
    let m = 0;
    if (times) for (const ts of times) m = Math.max(m, swing(t - ts + shift, rise, fall));
    return m;
  };
  const plan = {
    lines, chars, strikes, returns, layout: L,
    start: chars[0]?.t ?? 0,
    end: Math.max(chars[chars.length - 1]?.t ?? 0, returns[returns.length - 1]?.t1 ?? 0),
    /** col(t): carriage column (fractional while it steps or returns). colSmooth(t): the same without the steps (for cameras). */
    col: (t) => track(moves, t),
    colSmooth: (t) => track(smooth, t),
    carriageX: (t) => L.carriageX(track(moves, t)),
    /** feed(t): lines the paper has been fed up (fractional during a return). */
    feed: (t) => returns.reduce((s, R) => s + R.feed * toEase("outCubic")(clamp((t - R.t0) / T.feedDur)), 0),
    /** typed(t): how many inked glyphs are on the page (strikes with time <= t). */
    typed: (t) => { let k = 0; while (k < strikes.length && strikes[k].t <= t + EPS) k++; return k; },
    /** barSwing(bar, t) -> 0 rest .. 1 at the paper. */
    barSwing: (bar, t) => peak(byBar[bar], t, T.barRise, T.barFall),
    /** keyDip(keyId, t) -> 0 up .. 1 fully down (bottoms out keyBottom before the strike). */
    keyDip: (key, t) => peak(byKey[key], t, T.keyLead - T.keyBottom, T.keyUp, T.keyBottom),
    /** ribbon(t) -> { lift: 0..1, ink } — the vibrator raises the ribbon for each strike (higher for red). */
    ribbon: (t) => {
      let lift = 0, ink = "black";
      for (const c of strikes) { const v = swing(t - c.t, T.ribbonRise, T.ribbonFall); if (v > lift) { lift = v; ink = c.ink; } }
      return { lift, ink };
    },
    /** spool(t): ribbon advance in radians (one step per strike, eased). */
    spool: (t) => strikes.reduce((s, c) => s + T.spoolStep * clamp((t - c.t) / 0.08), 0),
    /** lever(t): 0..1 throw of the return lever. */
    lever: (t) => returns.reduce((m, R) => Math.max(m, clamp((t - R.t0 + 0.06) / 0.1) * (1 - clamp((t - R.t1 + 0.08) / 0.18))), 0),
    /** bell(t): signed clapper swing, decaying after each bell. */
    bell: (t) => returns.reduce((s, R) => s + (t >= R.bell ? Math.exp(-(t - R.bell) * 7) * Math.cos((t - R.bell) * 60) : 0), 0),
    /** events(): everything that makes a sound, in time order. */
    events: () => {
      const ev = [];
      for (const c of chars) {
        const kx = c.key === " " ? 0 : L.keyOf[c.key].x;
        ev.push({ t: c.t, kind: c.bar >= 0 ? "strike" : "space", ch: c.ch, i: c.i, ink: c.ink, pan: clamp(kx / 2.2, -0.6, 0.6), v: hash01(c.i, 17, T.seed) });
      }
      for (const R of returns) {
        ev.push({ t: R.bell, kind: "bell", pan: -0.3 });
        ev.push({ t: R.t0, kind: "return", dur: T.returnDur, pan: 0 });
        for (let k = 0; k < T.feedTicks * R.feed; k++) ev.push({ t: R.t0 + ((k + 0.5) / (T.feedTicks * R.feed)) * T.feedDur, kind: "feedTick", k, pan: 0.2 });
        ev.push({ t: R.t1 - 0.03, kind: "stop", pan: 0.35 });
      }
      return ev.sort((a, b) => a.t - b.t);
    },
  };
  return plan;
}

/** typeVoices(SND) -> voices for scoreFromEvents (SND = STYLE_SPEC.sound). One clack per strike, one bell per line end. */
export function typeVoices(SND) {
  return {
    strike: (e) => [
      { type: "clack", pitch: 0.95 + 0.5 * e.v, gain: SND.strike.clack * (0.85 + 0.3 * e.v) },
      { type: "thud", dur: 0.07, pitch: 2.2, gain: SND.strike.thud },
    ],
    space: () => [
      { type: "thud", dur: 0.09, pitch: 1.5, gain: SND.space.thud },
      { type: "tick", pitch: 0.8, gain: SND.space.tick },
    ],
    bell: () => [{ type: "marimba", hz: SND.bell.hz, decay: SND.bell.decay, dur: 1.5, mallet: 0.9, gain: SND.bell.gain }],
    return: (e) => [{ type: "rustle", dur: e.dur, density: 0.95, pitch: 1.9, gain: SND.ret.zip }],
    feedTick: (e) => [{ type: "tick", pitch: 1.1 + 0.08 * e.k, gain: SND.ret.tick }],
    stop: () => [
      { type: "thud", dur: 0.2, pitch: 1.1, gain: SND.ret.stop },
      { type: "clack", pitch: 0.7, gain: SND.ret.stop * 0.7 },
    ],
  };
}
