// styles/fogged-glass/fogplan.js — the stroke / drip plan of a fogged window pane. Pure, Node-safe: no THREE, no window.
// Pane space ("ppx"): PANE.W x PANE.H = 1920 x 1080 units, x right, y DOWN (like a canvas), origin top-left.
//
// The fog mask is a pure function of t. Every wipe is a polyline whose points carry two times:
//   p.t  when the finger (or palm, or a running drop) reached the point  -> "drawn by now" = t >= p.t
//   p.f  when the fog starts to creep back over that point               -> decay = 1 - smoothstep(p.f, p.f + fade, t)
// and for every pixel:   clear(t, x, y) = max over wipes of  drawn x decay  (inside the wipe's width, which also narrows
// as the fog closes in from the edges). Nothing is accumulated: the painter redraws the mask from segmentsAt(t).
//
// Drips are planned too: a bead gathers under the lowest point of a stroke, lets go at t0 and runs down with stick-slip
//   s(tau) = v * (tau - k/w * (sin(w tau + phi) - sin(phi)))     (0 <= k < 1: monotonic, speed swings between v(1-k) and v(1+k))
// along x(s) = x0 + wobble table lookup; its clear trail is one more timed polyline (time at distance s by bisection).
//
// createPlan(...) -> { strokes, drips, segmentsAt(t), dropsAt(t), clearAt(t, x, y), revealAt(t), fingerAt(t), events() }
import { clamp, smoothstep, lerp, rng } from "../../kit/time.js";
import { layoutStrokeText } from "../../kit/strokefont.js";

export const PANE = { W: 1920, H: 1080 };
export const MAX_DROPS = 20;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** resample a polyline [[x, y], ...] at ~step spacing (keeps the corners) */
function resample(pts, step) {
  const out = [pts[0].slice(0, 2)];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = dist(a, b), n = Math.max(1, Math.round(d / step));
    for (let k = 1; k <= n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
  }
  return out;
}

/**
 * planWord(word, finger, R) -> strokes of one written word.
 * word = { text, t, dur, x (left), y (baseline), cap, slant, fogAt, fogSpread, fade }
 * Finger speed is constant over drawn path + pen-up hops (hops cost `hop` x their length), scaled to fill `dur`.
 */
function planWord(word, finger, R, wi) {
  const lay = layoutStrokeText(word.text, word.cap, { align: "left", letterSpacing: word.letterSpacing ?? 0.27, bendRadius: 0.12 });
  const slant = word.slant ?? 0.08, wob = finger.wobble ?? 5;
  const raw = [];
  for (const c of lay.chars) {
    const jy = R.range(-1, 1) * word.cap * 0.025, js = 1 + R.range(-1, 1) * 0.035, ph = R.range(0, 6.28);
    c.strokes.forEach((s, si) => {
      const pts = resample(s.map((p) => {
        const ly = p[1] * js, lx = c.x0 + (p[0] - c.x0) * js;
        return [word.x + lx + slant * ly, word.y - ly + jy];
      }), finger.step ?? 12).map((p, i) => [p[0] + wob * Math.sin(i * 0.21 + ph), p[1] + wob * 0.6 * Math.cos(i * 0.17 + ph * 1.7)]);
      raw.push({ pts, ch: c.ch, ci: c.i, si });
    });
  }
  // time budget: drawn length + weighted hops
  const hop = finger.hop ?? 0.45;
  let total = 0;
  raw.forEach((s, i) => {
    s.len = s.pts.reduce((a, p, k) => (k ? a + dist(p, s.pts[k - 1]) : 0), 0);
    s.hop = i ? dist(raw[i - 1].pts[raw[i - 1].pts.length - 1], s.pts[0]) * hop : 0;
    total += s.len + s.hop;
  });
  const speed = total / word.dur;
  let clock = word.t;
  const spread = word.fogSpread ?? 0.35, fogAt = word.fogAt ?? Infinity;
  return raw.map((s) => {
    clock += s.hop / speed;
    let acc = 0;
    const t0 = clock;
    const pts = s.pts.map((p, k) => {
      if (k) acc += dist(p, s.pts[k - 1]);
      // ease in/out inside one stroke: the finger starts and stops
      const u = s.len > 0 ? acc / s.len : 0, e = u + 0.07 * Math.sin(2 * Math.PI * u) * -1;
      const t = t0 + (e * s.len) / speed;
      return { x: p[0], y: p[1], t, f: fogAt + (t - word.t) * spread };
    });
    clock = t0 + s.len / speed;
    return { kind: "finger", word: wi, ch: s.ch, width: finger.width, fade: word.fade ?? 1.5, pts, t0, t1: clock, len: s.len };
  });
}

/** planPalm(pass, palm) -> one wide wipe along a quadratic arc a -> via -> b */
function planPalm(pass, palm) {
  const n = 48, pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, e = u * u * (3 - 2 * u), k = 1 - e;
    const x = k * k * pass.a[0] + 2 * k * e * pass.via[0] + e * e * pass.b[0];
    const y = k * k * pass.a[1] + 2 * k * e * pass.via[1] + e * e * pass.b[1];
    pts.push({ x, y, t: pass.t + u * pass.dur, f: Infinity });
  }
  return { kind: "palm", width: pass.width ?? palm.width, fade: 1, pts, t0: pass.t, t1: pass.t + pass.dur, len: 0 };
}

/**
 * createPlan({ words, palm: { width, passes: [{ t, dur, a, via, b }], evaporate: { delay, dur } }, finger, drips, extraDrops, seed, end })
 */
export function createPlan(o = {}) {
  const R = rng(o.seed ?? 5);
  const end = o.end ?? 15;
  const finger = { width: 38, step: 12, hop: 0.45, wobble: 5, fresh: 1.3, ...(o.finger ?? {}) };
  const D = { chance: 0.5, max: 12, perWord: 4, gather: [0.5, 1.5], speed: [80, 190], stick: 0.85, omega: [2.6, 5.2], length: [130, 430], radius: [9, 15], trail: 0.5, wobble: 5, cell: 80, minGap: 70, ...(o.drips ?? {}) };
  const palm = { width: 620, passes: [], evaporate: { delay: 0.1, dur: 0.9 }, ...(o.palm ?? {}) };
  const words = o.words ?? [];

  const strokes = [];
  words.forEach((w, wi) => strokes.push(...planWord(w, finger, R.fork(11 + wi), wi)));
  const palmStrokes = palm.passes.map((p) => planPalm(p, palm));
  const palmEnd = palmStrokes.length ? Math.max(...palmStrokes.map((s) => s.t1)) : Infinity;
  const palmStart = palmStrokes.length ? Math.min(...palmStrokes.map((s) => s.t0)) : Infinity;

  // ---------------------------------------------------------------- drips
  const RD = R.fork(77);
  const mkDrip = (q) => {
    const d = { ...q };
    d.k = d.k ?? D.stick; d.w = d.w ?? RD.range(...D.omega); d.phi = d.phi ?? RD.range(0, 6.28);
    d.table = Array.from({ length: 24 }, (_, i) => (i ? RD.range(-1, 1) * D.wobble : 0));
    d.sAt = (tau) => (tau <= 0 ? 0 : d.v * (tau - (d.k / d.w) * (Math.sin(d.w * tau + d.phi) - Math.sin(d.phi))));
    d.xAt = (s) => {
      const c = s / D.cell, i = Math.min(Math.floor(c), d.table.length - 2), u = clamp(c - i), e = u * u * (3 - 2 * u);
      return d.x0 + lerp(d.table[i], d.table[i + 1], e);
    };
    // run time: bisection for s(tau) = L (monotonic)
    const inv = (s) => { let lo = 0, hi = (s / d.v) * 3 + 4; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (d.sAt(m) < s) lo = m; else hi = m; } return (lo + hi) / 2; };
    d.L = Math.min(d.L, PANE.H + 40 - d.y0);
    d.run = inv(d.L); d.tStop = d.t0 + d.run;
    // trail: one timed polyline (points every 8 units of run)
    const n = Math.max(2, Math.ceil(d.L / 8));
    d.trail = { kind: "trail", word: d.word, width: d.r * 2 * D.trail, fade: d.fade ?? 1.5, t0: d.t0, t1: d.tStop, len: d.L, pts: Array.from({ length: n + 1 }, (_, i) => { const s = (d.L * i) / n; return { x: d.xAt(s), y: d.y0 + s, t: d.t0 + inv(s), f: d.f }; }) };
    /** head position and radius at t (radius 0 = no bead) */
    d.at = (t) => {
      const s = Math.min(d.sAt(t - d.t0), d.L);
      const grow = smoothstep(d.tg, d.t0, t), spent = 1 - 0.4 * (s / d.L);
      const gone = (1 - smoothstep(d.f, d.f + (d.fade ?? 1.5) + 0.6, t)) * (1 - smoothstep(d.tKill, d.tKill + 0.1, t));
      return { x: d.xAt(s), y: d.y0 + s, r: d.r * grow * spent * gone, s, v: t > d.t0 && t < d.tStop ? 1 : 0 };
    };
    return d;
  };
  const drips = [];
  // candidates: the lowest point of each finger stroke
  const cands = strokes.map((s) => { let b = s.pts[0]; for (const p of s.pts) if (p.y > b.y) b = p; return { s, p: b }; });
  for (const c of cands) {
    if (drips.length >= D.max) break;
    if (!RD.chance(D.chance)) continue;
    if (drips.filter((d) => d.word === c.s.word).length >= D.perWord) continue;
    if (drips.some((d) => Math.abs(d.x0 - c.p.x) < D.minGap && Math.abs(d.y0 - c.p.y) < 200)) continue;
    const g = RD.range(...D.gather);
    drips.push(mkDrip({ word: c.s.word, x0: c.p.x, y0: c.p.y + finger.width * 0.42, tg: c.p.t + 0.1, t0: c.p.t + 0.1 + g, v: RD.range(...D.speed), L: RD.range(...D.length), r: RD.range(...D.radius), f: c.p.f, fade: c.s.fade, tKill: Infinity }));
  }
  // extra free drops (on already-clear glass after the palm, or anywhere): { x, y, t, gather, v, L, r }
  for (const e of o.extraDrops ?? []) {
    if (drips.length >= MAX_DROPS) break;
    drips.push(mkDrip({ word: -1, x0: e.x, y0: e.y, tg: e.t, t0: e.t + (e.gather ?? 0.5), v: e.v ?? 150, L: e.L ?? 400, r: e.r ?? 16, f: Infinity, fade: 1, tKill: Infinity, free: true }));
  }
  // the palm wipes beads away: first palm sample that passes over the head
  for (const d of drips) {
    if (d.free) continue;
    outer: for (const ps of palmStrokes) for (const p of ps.pts) {
      const h = d.at(p.t);
      if (Math.hypot(h.x - p.x, h.y - p.y) < ps.width * 0.5) { d.tKill = p.t; break outer; }
    }
    if (d.tKill === Infinity && palmStrokes.length) d.tKill = palmEnd;
  }
  const wipes = [...strokes, ...drips.filter((d) => !d.free).map((d) => d.trail), ...palmStrokes];

  // ---------------------------------------------------------------- queries (all pure functions of t)
  const decay = (p, fade, t) => 1 - smoothstep(p.f, p.f + fade, t);
  /**
   * segmentsAt(t) -> [{ x0, y0, x1, y1, w, level, fresh, kind }] every wipe segment drawn by t that is not fogged over.
   * level 0..1 = clear amount; w = width now (narrows to `closeTo` x width while refogging); fresh 0..1 = just wiped (wet).
   */
  function segmentsAt(t, out = []) {
    out.length = 0;
    for (const s of wipes) {
      if (t < s.t0) continue;
      const P = s.pts;
      for (let i = 1; i < P.length; i++) {
        const a = P[i - 1], b = P[i];
        if (a.t > t) break;
        const dk = decay(a, s.fade, t);
        if (dk <= 0.004) continue;
        let x1 = b.x, y1 = b.y;
        if (b.t > t) { const u = (t - a.t) / (b.t - a.t); x1 = lerp(a.x, b.x, u); y1 = lerp(a.y, b.y, u); }
        out.push({ x0: a.x, y0: a.y, x1, y1, w: s.width * lerp(0.4, 1, dk), level: dk, fresh: s.kind === "trail" ? 0 : 1 - smoothstep(0, finger.fresh, t - a.t), kind: s.kind });
      }
    }
    return out;
  }
  /** reference: clear amount at one point (hard-edged; the painter anti-aliases and the shader softens) */
  function clearAt(t, x, y) {
    let c = 0;
    for (const g of segmentsAt(t)) {
      const dx = g.x1 - g.x0, dy = g.y1 - g.y0, l2 = dx * dx + dy * dy;
      const u = l2 > 0 ? clamp(((x - g.x0) * dx + (y - g.y0) * dy) / l2) : 0;
      if (Math.hypot(x - g.x0 - u * dx, y - g.y0 - u * dy) <= g.w / 2) c = Math.max(c, g.level);
    }
    return Math.max(c, revealAt(t));
  }
  /** dropsAt(t) -> [{ x, y, r, v }] beads with r > 0 (at most MAX_DROPS) */
  function dropsAt(t, out = []) {
    out.length = 0;
    for (const d of drips) { const h = d.at(t); if (h.r > 0.25) out.push(h); }
    return out;
  }
  /** global evaporation after the palm (0..1): the last corners of fog burn off */
  const revealAt = (t) => smoothstep(palmEnd + palm.evaporate.delay, palmEnd + palm.evaporate.delay + palm.evaporate.dur, t);
  /** where the finger / palm touches the glass now: { x, y, down, kind } */
  function fingerAt(t) {
    for (const s of [...strokes, ...palmStrokes]) {
      if (t < s.t0 || t > s.t1) continue;
      const P = s.pts;
      for (let i = 1; i < P.length; i++) if (P[i].t >= t) { const u = clamp((t - P[i - 1].t) / (P[i].t - P[i - 1].t || 1)); return { x: lerp(P[i - 1].x, P[i].x, u), y: lerp(P[i - 1].y, P[i].y, u), down: 1, kind: s.kind }; }
    }
    return { x: 0, y: 0, down: 0, kind: "none" };
  }

  /** events() -> sound cues from the same plan: bed, squeak (one per finger stroke), plink (drop lets go), refog, palm, reveal */
  function events() {
    const ev = [{ kind: "bed", t: 0, dur: end }];
    for (const s of strokes) ev.push({ kind: "squeak", t: s.t0, dur: s.t1 - s.t0, x: s.pts[0].x, len: s.len, down: s.pts[s.pts.length - 1].y > s.pts[0].y });
    for (const d of drips) if (d.t0 < Math.min(d.tKill, end - 0.2)) ev.push({ kind: "plink", t: d.t0, x: d.x0, r: d.r });
    words.forEach((w) => { if (Number.isFinite(w.fogAt ?? Infinity)) ev.push({ kind: "refog", t: w.fogAt, dur: (w.fade ?? 1.5) + w.dur * (w.fogSpread ?? 0.35), x: w.x }); });
    for (const s of palmStrokes) ev.push({ kind: "palm", t: s.t0, dur: s.t1 - s.t0, x: s.pts[0].x });
    if (palmStrokes.length) ev.push({ kind: "reveal", t: palmEnd, x: PANE.W / 2 });
    return ev.sort((a, b) => a.t - b.t);
  }

  /** bounding box of one word's strokes (pane units, including the finger width) */
  const wordBox = (wi) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of strokes) if (s.word === wi) for (const p of s.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const h = finger.width / 2;
    return { x0: x0 - h, y0: y0 - h, x1: x1 + h, y1: y1 + h };
  };

  return { strokes, palmStrokes, drips, wipes, words, palmStart, palmEnd, end, segmentsAt, clearAt, dropsAt, revealAt, fingerAt, events, wordBox };
}

/** fogVoices(S) -> kind -> voice list, for kit/schedule.scoreFromEvents (S = spec.sound) */
export function fogVoices(S) {
  const pan = (x) => clamp((x / PANE.W) * 2 - 1, -1, 1) * 0.6;
  const scale = [0, 3, 7, 10, 12, 15, 19, 22];
  return {
    bed: (e) => [{ type: "pad", dur: e.dur, gain: S.bed.gain, root: S.bed.root, chord: S.bed.chord, brightness: S.bed.brightness, attack: 0.5, release: 1.2 }],
    // finger on wet glass: a short gliding tone (up on up-strokes, down on down-strokes) + a breath of friction noise
    squeak: (e, { index }) => {
      const dur = clamp(e.dur, 0.08, 0.6), hz = S.squeak.hz * (1 + 0.06 * ((index * 7) % 5 - 2));
      return [
        { type: "servo", dur, hz: e.down ? hz * 1.18 : hz, hz2: e.down ? hz : hz * 1.22, grit: S.squeak.grit, gain: S.squeak.gain, pan: pan(e.x) },
        { type: "penScratch", dur, speed: 0.7, gain: S.squeak.rub, pan: pan(e.x) },
      ];
    },
    plink: (e, { index }) => [{ type: "bubble", dur: 0.09, pitch: 1.5 + 0.12 * scale[index % scale.length] / 3, gain: S.plink.gain, pan: pan(e.x) }, { type: "marimba", offset: 0.01, dur: 0.5, hz: 880 * Math.pow(2, scale[index % scale.length] / 12), decay: 0.12, gain: S.plink.note, pan: pan(e.x) }],
    refog: (e) => [{ type: "whoosh", dir: "out", dur: Math.min(e.dur, 2.2), gain: S.refog.gain, q: 0.9, pan: pan(e.x) }],
    palm: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, gain: S.palm.gain, q: 1.2, pan: pan(e.x) }, { type: "servo", dur: e.dur * 0.9, hz: S.palm.hz, hz2: S.palm.hz * 1.5, grit: 0.25, gain: S.palm.squeal, pan: pan(e.x) }],
    reveal: () => [{ type: "chime", sparkle: true, dur: 2.2, notes: 8, gain: S.reveal.gain }, { type: "pad", dur: 3.2, gain: S.reveal.pad, root: S.bed.root * 2, chord: [0, 4, 7, 12, 16], brightness: 2400, attack: 0.3, release: 1.0 }],
  };
}
