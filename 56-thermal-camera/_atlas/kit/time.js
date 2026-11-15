// time.js — pure, dependency-free helpers. Safe to import from Node AND the browser.
// No THREE, no window. Everything here is a pure function of its inputs.

// ---------- seeded randomness ----------

/** mulberry32 PRNG. rng(seed) -> generator with .next() in [0,1) plus helpers. */
export function rng(seed = 1) {
  let a = (typeof seed === "string" ? hashString(seed) : seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()), // inclusive
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    sign: () => (next() < 0.5 ? -1 : 1),
    chance: (p) => next() < p,
    gaussian: (mean = 0, sd = 1) => {
      const u = Math.max(next(), 1e-12), v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    fork: (salt = 0) => rng((Math.floor(next() * 4294967296) ^ hashString(String(salt))) >>> 0),
  };
  return r;
}

/** Stateless hash -> [0,1). Use for per-index or per-frame randomness without a stream. */
export function hash01(...ints) {
  let h = 2166136261 >>> 0;
  for (const n of ints) {
    h ^= Math.floor(n) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995) >>> 0;
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

// ---------- math ----------

export const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
// Open-ended ranges (pass 6): an infinite edge/endpoint is a deliberate "never" / "forever", not an error. Each helper
// below computes exactly the old formula and only when that gives NaN (Inf - Inf, 0 x Inf, Inf / Inf) falls back to
// the limit / a step, so finite inputs give bit-identical results. Tested by scripts/test-kit.mjs.
export const lerp = (a, b, t) => {
  const r = a + (b - a) * t;
  if (r === r) return r;
  if (a === b) return a;                                   // lerp(Inf, Inf, t)
  return t <= 0 ? a : t >= 1 ? b : r;                      // lerp(0, Inf, 0) = 0, lerp(Inf, 0, 1) = 0
};
export const invLerp = (a, b, x) => {
  if (a === b) return 0;
  const r = (x - a) / (b - a);
  return r === r ? r : x < a ? 0 : 1;                      // infinite edges: a step at a (same rule as smoothstep)
};
export const remap = (x, inMin, inMax, outMin, outMax, clamped = true) => {
  const t = invLerp(inMin, inMax, x);
  return lerp(outMin, outMax, clamped ? clamp(t) : t);
};
/** smoothstep(e0, e1, x): 0 below e0, 1 above e1. Open-ended/degenerate ranges are safe: equal edges (incl.
 *  e0 = e1 = Infinity, e.g. an `off = Infinity` fade) act as a step at e0 instead of returning NaN. */
export const smoothstep = (e0, e1, x) => {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0));
  if (t !== t) return x < e0 ? 0 : 1; // NaN from infinite edges
  return t * t * (3 - 2 * t);
};
export const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const TAU = Math.PI * 2;
export const deg = (d) => (d * Math.PI) / 180;

// ---------- easings: f(0)=0, f(1)=1, input clamped ----------

const c = (t) => clamp(t);
export const ease = {
  linear: (t) => c(t),
  inQuad: (t) => c(t) ** 2,
  outQuad: (t) => 1 - (1 - c(t)) ** 2,
  inOutQuad: (t) => ((t = c(t)) < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t) => c(t) ** 3,
  outCubic: (t) => 1 - (1 - c(t)) ** 3,
  inOutCubic: (t) => ((t = c(t)) < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * c(t)) - 1) / 2,
  outSine: (t) => Math.sin((c(t) * Math.PI) / 2),
  inExpo: (t) => ((t = c(t)) === 0 ? 0 : 2 ** (10 * t - 10)),
  outExpo: (t) => ((t = c(t)) === 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutExpo: (t) => {
    t = c(t);
    if (t === 0 || t === 1) return t;
    return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
  },
  inBack: (t, s = 1.70158) => ((t = c(t)), (s + 1) * t * t * t - s * t * t),
  outBack: (t, s = 1.70158) => ((t = c(t) - 1), 1 + (s + 1) * t * t * t + s * t * t),
  inOutBack: (t, s = 1.70158 * 1.525) => {
    t = c(t);
    return t < 0.5
      ? ((2 * t) ** 2 * ((s + 1) * 2 * t - s)) / 2
      : ((2 * t - 2) ** 2 * ((s + 1) * (t * 2 - 2) + s) + 2) / 2;
  },
  outElastic: (t) => {
    t = c(t);
    if (t === 0 || t === 1) return t;
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  outBounce: (t) => {
    t = c(t);
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

/** Damped spring step response, closed form. 0 -> 1 with overshoot. zeta<1 = bouncy. */
export function spring(t, { stiffness = 120, damping = 12, mass = 1 } = {}) {
  t = Math.max(0, t);
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t); // critically/over-damped approximation
}

/** Resolve an ease given as a function or a name in `ease`. */
export const toEase = (e) => (typeof e === "function" ? e : ease[e] || ease.linear);

// ---------- beats ----------

/** 0..1 progress of a window [start, start+dur], eased. Before -> 0, after -> 1. */
export function beat(t, start, dur, e = "linear") {
  if (dur <= 0) return t >= start ? 1 : 0;
  const u = (t - start) / dur;
  if (u !== u) return t >= start ? 1 : 0; // infinite start AND dur (or t): a step, never NaN (pass 6)
  return toEase(e)(u);
}

/** Rises over [start, start+inDur], holds, falls over [end-outDur, end]. Useful for show/hide. */
export function envelope(t, start, end, inDur = 0.3, outDur = 0.3, eIn = "outCubic", eOut = "inCubic") {
  return Math.min(beat(t, start, inDur, eIn), 1 - beat(t, end - outDur, outDur, eOut));
}

/**
 * Timeline of named beats. beats = [{id, t, dur, ...anything}]
 *   tl.p(id, t, ease?)   -> eased 0..1 progress of that beat
 *   tl.get(id)           -> the beat object
 *   tl.active(t)         -> beats whose window contains t
 *   tl.at(id, offset=0)  -> absolute time (beat start + offset), handy for SCORE cues
 *   tl.end               -> time the last beat ends
 */
export class Timeline {
  constructor(beats = []) {
    this.beats = beats.map((b) => ({ dur: 0, ...b }));
    this.byId = Object.fromEntries(this.beats.map((b) => [b.id, b]));
  }
  get(id) {
    const b = this.byId[id];
    if (!b) throw new Error(`Timeline: unknown beat "${id}"`);
    return b;
  }
  p(id, t, e = "linear") {
    const b = this.get(id);
    return beat(t, b.t, b.dur, e);
  }
  at(id, offset = 0) {
    return this.get(id).t + offset;
  }
  active(t) {
    return this.beats.filter((b) => t >= b.t && t < b.t + b.dur);
  }
  get end() {
    return Math.max(0, ...this.beats.map((b) => b.t + b.dur));
  }
}

function srtTime(s) {
  const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 10 ** m[4].length;
}

/** Parse SRT (or WebVTT) text into beats [{id:'b1', t, dur, text}]. ids optional override list. */
export function beatsFromSrt(text, ids = []) {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/);
  const out = [];
  for (const blk of blocks) {
    const lines = blk.split("\n").filter(Boolean);
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->");
    const t = srtTime(a), end = srtTime(b);
    out.push({ id: ids[out.length] || `b${out.length + 1}`, t, dur: end - t, text: lines.slice(i + 1).join(" ") });
  }
  return out;
}

/**
 * Word timestamps -> beats. words = [{text|word, start, end}] (Whisper / hyperframes transcribe shape).
 * markers = [{id, word}] picks the first occurrence (in order) of each marker word; dur runs to the
 * next marker (or last word end). Without markers, every word becomes a beat.
 */
export function beatsFromWords(words, markers = null) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9']/g, "");
  const ws = words.map((w) => ({ text: w.text ?? w.word, start: w.start, end: w.end }));
  if (!markers) return ws.map((w, i) => ({ id: `w${i}`, t: w.start, dur: w.end - w.start, text: w.text }));
  const out = [];
  let cursor = 0;
  for (const m of markers) {
    const idx = ws.findIndex((w, i) => i >= cursor && norm(w.text) === norm(m.word));
    if (idx < 0) throw new Error(`beatsFromWords: marker word "${m.word}" not found`);
    out.push({ id: m.id, t: ws[idx].start, text: m.word });
    cursor = idx + 1;
  }
  const last = ws.length ? ws[ws.length - 1].end : 0;
  out.forEach((b, i) => (b.dur = (i + 1 < out.length ? out[i + 1].t : last) - b.t));
  return out;
}

/** Voiceover phrases (SRT beats) -> duck ranges for renderScore. */
export const duckFromBeats = (beats, pad = 0.1) => beats.map((b) => ({ start: b.t - pad, end: b.t + b.dur + pad }));
