// styles/inflatable/inflate.js — the INFLATION PLANNER. Pure functions: no THREE, no window, no DOM (Node-safe; imports
// only kit/time.js and kit/schedule.js). style.js reads poses from it for the picture and scene.config.js derives the
// SCORE from the same plan (air hiss whose pitch follows fill, squeaks, the boing at full, deflate raspberries, bumps).
//
//   const plan = planInflatables(actors, { K: STYLE_SPEC.plan });
//   plan.pose(id, t) -> { fill, stand, lift, sy, sx, bulge, rock, fold, squash, squashDir, squeeze, squeezeSide,
//                         float, offset:[x,y,z], bob }   (closed form; no state between calls)
//   plan.events      -> sound/marker events [{ t, kind, id, dur, ... }]   (feed kit/schedule.scoreFromEvents)
//
// actors: [{ id, start: "flat"|"full", home: [x,y,z]?, events: [ { kind, t, dur?, ... } ] }]
//   inflate { t, dur }            flat -> full; stands up, hops, overshoots (stretch + bulge + rock), rings down
//   deflate { t, dur }            full -> flat; sags, folds forward, flops backward and sinks
//   bump    { t, dur, dir, amount } contact squash on side `dir` (+1 = contact on its right, -1 = left) + rock away
//   squeeze { t, dur, side, amount } air shifts toward `side` (+1 right / -1 left), released with a wobble
//   float   { t, dur, to:[x,y,z] }  lifts from home to `to` on its ribbon, then bobs
// Events of one actor must not overlap in the same channel (inflate/deflate are sequential).
import { clamp, lerp, smoothstep, ease, hashString, hash01 } from "../../kit/time.js";

const TAU = Math.PI * 2;
const ringDown = (tau, freq, decay) => (tau <= 0 ? 0 : Math.exp(-decay * tau) * Math.sin(TAU * freq * tau));
const sm = (a, b, x) => smoothstep(a, b, x);

export const PLAN_DEFAULTS = {
  inflate: { dur: 1.3, stand: [0.38, 0.92], hop: 0.18, overshoot: { amp: 1, freq: 2.6, decay: 3.4 }, stretch: 0.1, bulge: 0.07, rock: 0.05 },
  deflate: { dur: 1.3, fold: [0.12, 0.55, 0.7], flop: [0.45, 1.0], foldAngle: 1.25 },
  bump: { dur: 0.75, amount: 0.12, rock: 0.07, freq: 3.2, decay: 4.5 },
  squeeze: { dur: 1.2, amount: 0.55, in: 0.3, out: 0.35 },
  float: { dur: 2.2, bob: 0.05, bobPeriod: 2.7, sway: 0.05 },
  word: { step: 0.5 },
};

/** inflate easing: the limp sheet barely moves at first, then the air rushes in, slowing as the skin tightens. */
export const inflateCurve = (u) => {
  u = clamp(u);
  const a = ease.inOutSine(u);
  return clamp(a * (1 + 0.12 * Math.sin(Math.PI * u)) - 0.0);
};
/** deflate: fast initial loss, slow limp end. */
export const deflateCurve = (u) => 1 - ease.outQuad(clamp(u));

function merge(K) {
  const out = {};
  for (const k of Object.keys(PLAN_DEFAULTS)) out[k] = { ...PLAN_DEFAULTS[k], ...(K?.[k] ?? {}) };
  out.inflate.overshoot = { ...PLAN_DEFAULTS.inflate.overshoot, ...(K?.inflate?.overshoot ?? {}) };
  return out;
}

/**
 * wordActors(ids, t0, { step, dur, start = "flat", bump = true, amount }) -> actors: one inflate per letter, staggered
 *   by `step`; when bump is on, each letter's overshoot bumps its LEFT neighbour (contact on that neighbour's right).
 */
export function wordActors(ids, t0, o = {}) {
  const step = o.step ?? PLAN_DEFAULTS.word.step, dur = o.dur ?? PLAN_DEFAULTS.inflate.dur;
  const actors = ids.map((id, i) => ({ id, start: o.start ?? "flat", events: [{ kind: "inflate", t: t0 + i * step, dur }] }));
  if (o.bump !== false) {
    for (let i = 1; i < ids.length; i++) {
      const tFull = t0 + i * step + dur;
      actors[i - 1].events.push({ kind: "bump", t: tFull - 0.02, dir: 1, amount: o.amount ?? PLAN_DEFAULTS.bump.amount, by: ids[i] });
    }
  }
  return actors;
}

/**
 * planInflatables(actors, { K }) -> plan with pose(id, t) and events (see header).
 */
export function planInflatables(actors, o = {}) {
  const K = merge(o.K);
  const byId = new Map();
  for (const a of actors) {
    const evs = [...(a.events ?? [])].map((e) => ({ ...K[e.kind], ...e, dur: e.dur ?? K[e.kind]?.dur ?? 1 })).sort((p, q) => p.t - q.t);
    byId.set(a.id, { ...a, events: evs, levels: evs.filter((e) => e.kind === "inflate" || e.kind === "deflate") });
  }

  function fillAt(id, t) {
    const A = byId.get(id);
    let fill = A.start === "full" ? 1 : 0;
    for (const e of A.levels) {
      if (t < e.t) break;
      const u = (t - e.t) / e.dur;
      fill = e.kind === "inflate" ? inflateCurve(u) : deflateCurve(u);
    }
    return fill;
  }

  function pose(id, t) {
    const A = byId.get(id);
    if (!A) throw new Error(`inflate.js: unknown actor "${id}"`);
    const full = A.start === "full";
    const P = { fill: full ? 1 : 0, stand: full ? 1 : 0, lift: 0, sy: 1, sx: 1, bulge: 0, rock: 0, fold: 0, squash: 0, squashDir: 1, squeeze: 0, squeezeSide: 1, float: 0, offset: [0, 0, 0], bob: 0, sway: 0 };
    // ---- level channel (inflate / deflate), sequential
    for (const e of A.levels) {
      if (t < e.t) break;
      const u = (t - e.t) / e.dur;
      if (e.kind === "inflate") {
        P.fill = inflateCurve(u);
        P.fold = 0;
        const st = ease.outBack(clamp((u - e.stand[0]) / (e.stand[1] - e.stand[0])));
        P.stand = clamp(st, 0, 1.06);
        // hop while standing up, then the overshoot rings down from the moment it is full
        P.lift = e.hop * Math.sin(Math.PI * clamp((u - e.stand[0]) / (1 - e.stand[0])));
        const w = ringDown(t - (e.t + e.dur), e.overshoot.freq, e.overshoot.decay) * e.overshoot.amp;
        P.sy = 1 + e.stretch * w;
        P.sx = 1 - e.stretch * 0.45 * w;
        P.bulge = e.bulge * Math.max(0, w);
        P.rock = e.rock * ringDown(t - (e.t + e.dur * 0.92), e.overshoot.freq * 0.7, e.overshoot.decay * 0.8);
        P.lift += Math.max(0, w) * e.hop * 0.35;
      } else {
        P.fill = deflateCurve(u);
        const [f0, f1, f2] = e.fold;
        P.fold = sm(f0, f1, u) * (1 - sm(f2, 1, u));
        P.stand = 1 - ease.inCubic(clamp((u - e.flop[0]) / (e.flop[1] - e.flop[0])));
        P.lift = 0;
        P.rock = 0.03 * ringDown(t - e.t, 1.6, 2.5);
      }
    }
    // ---- contact channels (additive)
    for (const e of A.events) {
      if (t < e.t) continue;
      const tau = t - e.t;
      if (e.kind === "bump") {
        const tin = 0.09;
        const s = tau < tin ? ease.outQuad(tau / tin) : Math.exp(-e.decay * (tau - tin)) * Math.cos(TAU * e.freq * (tau - tin));
        if (tau < e.dur * 2.5) {
          P.squash += e.amount * Math.max(0, s);
          P.squashDir = e.dir;
          P.rock += -e.dir * e.rock * ringDown(tau, e.freq * 0.6, e.decay * 0.7);
        }
      } else if (e.kind === "squeeze") {
        const u = tau / e.dur;
        const k = sm(0, e.in, u) * (1 - sm(1 - e.out, 1, u));
        const wob = u > 1 ? 0.25 * ringDown(tau - e.dur, 2.4, 4) : 0;
        P.squeeze += e.amount * (k + wob);
        P.squeezeSide = e.side ?? 1;
        P.rock += (e.side ?? 1) * 0.02 * k;
      } else if (e.kind === "float") {
        const u = clamp(tau / e.dur);
        const fe = ease.inOutSine(u);
        const home = A.home ?? [0, 0, 0];
        P.float = fe;
        const ph = hash01(hashString(id)) * TAU;
        const bobOn = sm(0.15, 0.7, u);
        P.bob = e.bob * Math.sin((TAU * tau) / e.bobPeriod + ph) * bobOn;
        P.sway = e.sway * Math.sin((TAU * tau) / (e.bobPeriod * 1.37) + ph * 1.7) * bobOn;
        P.offset = [(e.to[0] - home[0]) * fe, (e.to[1] - home[1]) * fe + P.bob, (e.to[2] - home[2]) * fe];
        // a foil balloon leaving the floor lifts its bottom first: little extra stretch on take-off
        P.sy *= 1 + 0.05 * Math.sin(Math.PI * clamp(u * 2.2));
      }
    }
    return P;
  }

  // ---- sound/marker events, all derived from the same events (and fill curve)
  const events = [];
  const S = o.sound ?? null;
  for (const A of byId.values()) {
    const salt = hashString(A.id);
    for (const e of A.events) {
      if (e.kind === "inflate") {
        const step = S?.hiss?.step ?? 0.17;
        const n = Math.max(2, Math.floor(e.dur / step));
        for (let k = 0; k < n; k++) {
          const tk = e.t + k * step;
          events.push({ t: tk, kind: "hiss", id: A.id, fill: fillAt(A.id, tk + step * 0.6), k });
        }
        const at = S?.squeak?.at ?? [0.55, 0.85];
        at.forEach((a, j) => events.push({ t: e.t + e.dur * a + (hash01(salt, j) - 0.5) * 0.06, kind: "squeak", id: A.id, r: hash01(salt, j + 7) }));
        events.push({ t: e.t + e.dur, kind: "boing", id: A.id, r: hash01(salt, 3) });
      } else if (e.kind === "deflate") {
        events.push({ t: e.t, kind: "deflate", id: A.id, dur: e.dur });
        events.push({ t: e.t + e.dur * (e.flop[0] + (e.flop[1] - e.flop[0]) * 0.92), kind: "flop", id: A.id });
      } else if (e.kind === "bump") {
        events.push({ t: e.t, kind: "bump", id: A.id, amount: e.amount, r: hash01(salt, 11) });
      } else if (e.kind === "squeeze") {
        events.push({ t: e.t, kind: "squeeze", id: A.id, dur: e.dur, r: hash01(salt, 13) });
        events.push({ t: e.t + e.dur, kind: "release", id: A.id, r: hash01(salt, 17) });
      } else if (e.kind === "float") {
        events.push({ t: e.t, kind: "float", id: A.id, dur: e.dur });
      }
    }
  }
  events.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));

  return { K, actors: byId, pose, fillAt, events };
}

/** inflatableVoices(S = spec.sound) -> voices for kit/schedule.scoreFromEvents(plan.events, voices). */
export function inflatableVoices(S) {
  const H = S.hiss, Q = S.squeak, B = S.boing, D = S.deflate;
  return {
    // pump-stroke air hiss: a chain of short rising noise sweeps whose pitch follows the planned fill
    hiss: (e) => [{ type: "whoosh", dir: "in", dur: H.dur, q: 1.1, gain: H.gain * (0.7 + 0.5 * e.fill), pitch: lerp(H.pitch[0], H.pitch[1], e.fill) }],
    // rubbery squeak: an upward chirp + a thin buzzy glide
    squeak: (e) => [
      { type: "bubble", dur: 0.09, gain: Q.gain, pitch: lerp(Q.pitch[0], Q.pitch[1], e.r) },
      { type: "servo", hz: 820 + 260 * e.r, hz2: 1180 + 300 * e.r, dur: 0.16, grit: 0.05, gain: Q.buzz },
    ],
    // pop-free "boing" when full: a soft rising glide with a short falling tail
    boing: (e) => [
      { type: "whir", hz: B.hz * (0.92 + 0.16 * e.r), hz2: B.hz2 * (0.92 + 0.16 * e.r), dur: B.dur, grit: 0.02, gain: B.gain },
      { type: "whir", hz: B.hz2 * 0.9, hz2: B.hz * 1.3, dur: 0.22, grit: 0.02, gain: B.gain * 0.5, offset: B.tail },
      { type: "bubble", dur: 0.12, pitch: 0.55 + 0.1 * e.r, gain: B.gain * 0.35, offset: 0.02 },
    ],
    // deflate: falling air + a low rubbery raspberry gliding down
    deflate: (e) => [
      { type: "whoosh", dir: "out", dur: e.dur * 0.9, q: 1.0, pitch: 0.9, gain: D.gain * 0.8 },
      { type: "servo", hz: D.hz, hz2: D.hz2, dur: e.dur * 0.75, grit: 0.55, gain: D.gain * 0.55 },
    ],
    flop: () => [{ type: "squish", dur: 0.34, pitch: 0.8, gain: D.flop }],
    bump: (e) => [
      { type: "squish", dur: 0.26, pitch: 1.25, gain: S.bump.gain * clamp(e.amount / 0.12, 0.4, 1.3) },
      { type: "bubble", dur: 0.07, pitch: 1.8 + 0.4 * e.r, gain: S.bump.squeak },
    ],
    squeeze: (e) => [
      { type: "servo", hz: 700 + 200 * e.r, hz2: 1250, dur: Math.min(0.5, e.dur * 0.4), grit: 0.08, gain: S.squeeze.squeak },
      { type: "squish", dur: 0.4, pitch: 1.0, gain: S.squeeze.gain },
    ],
    release: (e) => [{ type: "bubble", dur: 0.1, pitch: 1.6 + 0.3 * e.r, gain: S.squeeze.squeak * 0.9 }, { type: "squish", dur: 0.28, pitch: 1.3, gain: S.squeeze.gain * 0.6 }],
    float: (e) => [
      { type: "whoosh", dir: "in", dur: Math.min(1.2, e.dur * 0.55), pitch: 1.4, gain: S.float.gain * 1.6 },
      { type: "blip", notes: S.float.notes, dur: 0.07, pitch: 1, gain: S.float.gain, offset: 0.1 },
    ],
  };
}

/**
 * inflatableBed(duration, S = spec.sound, beats) -> the light upbeat theme: a bright pad in 2 s chords (brightness is a
 *   cutoff in Hz) plus a soft blip ostinato on chord tones from S.theme.from; each beat start gets a little rising arpeggio.
 */
export function inflatableBed(duration, S, beats = []) {
  const B = S.bed, T = S.theme, out = [];
  const n = Math.ceil(duration / B.every);
  for (let i = 0; i < n; i++) {
    const t = i * B.every;
    out.push({ t: Math.max(0, t - (i ? B.overlap : 0)), type: "pad", root: B.root, chord: B.chords[i % B.chords.length], dur: Math.min(duration - t + B.overlap, B.every + B.overlap * 2), attack: i ? B.attack : 0.3, release: B.release, brightness: B.brightness, gain: B.gain, seed: 5 + i });
  }
  const steps = Math.floor((duration - T.from - 0.6) / T.step);
  for (let k = 0; k <= steps; k++) {
    const t = T.from + k * T.step;
    const chord = B.chords[Math.floor(t / B.every) % B.chords.length];
    const deg = T.pattern[k % T.pattern.length] % chord.length;
    const semi = chord[deg] + 12;
    const accent = k % 4 === 0 ? 1 : 0.7;
    out.push({ t, type: "blip", notes: [semi], dur: 0.09, pitch: T.pitch, gain: T.gain * accent, pan: (k % 2 ? 0.18 : -0.18), seed: 40 + k });
  }
  beats.forEach((b, i) => {
    if (b.t <= 0.01) return;
    out.push({ t: b.t, type: "blip", notes: [12, 16, 19, 24], dur: 0.06, pitch: 1, gain: T.gain * 1.1, seed: 300 + i });
  });
  return out.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------- pure 2D outlines (metres, y up, centred)
// Each returns [{ outer: [[x,y],...], holes: [[...]] }]. style.js accepts these or glyph outlines.
const circlePts = (cx, cy, r, n = 48, a0 = 0) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(a0 + (i / n) * TAU), cy + r * Math.sin(a0 + (i / n) * TAU)]);

function roundCorners(pts, r, seg = 6) {
  if (!(r > 0)) return pts;
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const a = [p0[0] - p1[0], p0[1] - p1[1]], b = [p2[0] - p1[0], p2[1] - p1[1]];
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    const rr = Math.min(r, la * 0.45, lb * 0.45);
    const A = [p1[0] + (a[0] / la) * rr, p1[1] + (a[1] / la) * rr], Bp = [p1[0] + (b[0] / lb) * rr, p1[1] + (b[1] / lb) * rr];
    for (let k = 0; k <= seg; k++) {
      const u = k / seg;
      // quadratic bezier A -> p1 -> B
      out.push([(1 - u) * (1 - u) * A[0] + 2 * (1 - u) * u * p1[0] + u * u * Bp[0], (1 - u) * (1 - u) * A[1] + 2 * (1 - u) * u * p1[1] + u * u * Bp[1]]);
    }
  }
  return out;
}

export const OUTLINES = {
  circle: (r = 0.5) => [{ outer: circlePts(0, 0, r, 72), holes: [] }],
  /** star: n points, outer radius r, inner ratio k, corner rounding round (m) */
  star: (r = 0.55, { n = 5, k = 0.48, round = 0.035 } = {}) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = Math.PI / 2 + (i / (n * 2)) * TAU;
      const rr = i % 2 ? r * k : r;
      pts.push([rr * Math.cos(a), rr * Math.sin(a)]);
    }
    return [{ outer: roundCorners(pts, round, 5), holes: [] }];
  },
  /** heart of width w (classic parametric heart, bottom point slightly rounded) */
  heart: (w = 1.1) => {
    const pts = [], n = 120;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const x = 16 * Math.sin(a) ** 3;
      const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
      pts.push([(x / 32) * w, (y / 32) * w + 0.06 * w]);
    }
    return [{ outer: pts, holes: [] }];
  },
  /** arrow pointing +x: total length len, shaft width w, head width hw, head length hl */
  arrow: (len = 1.2, { w = 0.32, hw = 0.72, hl = 0.5, round = 0.04 } = {}) => {
    const x0 = -len / 2, x1 = len / 2 - hl;
    const pts = [[x0, -w / 2], [x1, -w / 2], [x1, -hw / 2], [len / 2, 0], [x1, hw / 2], [x1, w / 2], [x0, w / 2]];
    return [{ outer: roundCorners(pts, round, 5), holes: [] }];
  },
  /** speech bubble: rounded rect w x h with a tail at the bottom-left */
  bubble: (w = 1.3, h = 0.9, { r = 0.28, tail = 0.26 } = {}) => {
    const hw = w / 2, hh = h / 2;
    const pts = [[-hw, -hh], [-hw * 0.55, -hh], [-hw * 0.78, -hh - tail], [-hw * 0.2, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    return [{ outer: roundCorners(pts, r, 8), holes: [] }];
  },
  roundRect: (w = 1, h = 0.6, r = 0.15) => [{ outer: roundCorners([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], r, 8), holes: [] }],
  /** custom polygon (any simple polygon, metres) with optional corner rounding */
  poly: (pts, round = 0) => [{ outer: roundCorners(pts, round, 5), holes: [] }],
};

/** outlineBounds(loops) -> { min:[x,y], max:[x,y] } (Node-safe: used by scene configs to frame shapes). */
export function outlineBounds(loops) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const L of loops) for (const [x, y] of L.outer) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { min: [x0, y0], max: [x1, y1] };
}
