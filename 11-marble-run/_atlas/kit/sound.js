// sound.js — procedural SFX as pure DSP into Float32Arrays. No Web Audio graph, no THREE, no window.
// Runs identically in Node and the browser; output is sample-deterministic for a given score + seed.
import { rng, hashString, clamp } from "./time.js";

const TAU = Math.PI * 2;

// ---------- DSP primitives ----------

/** RBJ biquad. type: "lp"|"hp"|"bp"|"peak". Call .set() any time (per-block sweeps are fine). */
export function biquad(sr, type = "lp", freq = 1000, q = 0.707, gainDb = 0) {
  let b0, b1, b2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const f = {
    set(fr, qq = q, gdb = gainDb) {
      fr = clamp(fr, 10, sr * 0.45);
      const w = (TAU * fr) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * qq);
      let A0;
      if (type === "lp") { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; A0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
      else if (type === "hp") { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; A0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
      else if (type === "bp") { b0 = al; b1 = 0; b2 = -al; A0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
      else { const A = 10 ** (gdb / 40); b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; A0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
      b0 /= A0; b1 /= A0; b2 /= A0; a1 /= A0; a2 /= A0;
      return f;
    },
    tick(x) {
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      return y;
    },
  };
  return f.set(freq, q, gainDb);
}

/** One-pole lowpass (cheap smoothing). */
export function onePole(sr, freq) {
  const a = Math.exp((-TAU * freq) / sr);
  let y = 0;
  return { tick: (x) => (y = x + a * (y - x)) };
}

/** Attack/decay envelope value at time s (seconds). shape: exponent of decay curve. */
export const adEnv = (s, attack, decay, shape = 3) =>
  s < 0 ? 0 : s < attack ? s / attack : Math.max(0, 1 - (s - attack) / decay) ** shape;

/** Attack-hold-release with linear attack/release (for pads, hums). */
export const ahr = (s, attack, hold, release) =>
  s < 0 ? 0 : s < attack ? s / attack : s < attack + hold ? 1 : Math.max(0, 1 - (s - attack - hold) / release);

const buf = (sr, dur) => new Float32Array(Math.max(1, Math.ceil(sr * dur)));

// ---------- voices: (sr, opts, r) -> Float32Array (mono) ----------
// Every voice accepts `dur` and `pitch` (multiplier, default 1) where meaningful.

export const VOICES = {
  /** Filtered-noise sweep. dir "in" (rising, peaks ~70% through) | "out" (falling, peaks early). */
  whoosh(sr, { dur = 0.6, dir = "in", pitch = 1, q = 1.6 }, r) {
    const out = buf(sr, dur), bp = biquad(sr, "bp", 400, q), bp2 = biquad(sr, "bp", 400, q * 0.7);
    const lo = 250 * pitch, hi = 3200 * pitch;
    for (let i = 0; i < out.length; i++) {
      const u = i / out.length;
      const sw = dir === "in" ? u : 1 - u;
      if (i % 32 === 0) { const fr = lo * (hi / lo) ** (sw ** 1.4); bp.set(fr); bp2.set(fr * 1.5); }
      const peak = dir === "in" ? 0.7 : 0.25;
      const env = u < peak ? (u / peak) ** 2 : ((1 - u) / (1 - peak)) ** 1.6;
      const n = r.next() * 2 - 1;
      out[i] = (bp.tick(n) * 0.8 + bp2.tick(n) * 0.5) * env * 2.4;
    }
    return out;
  },
  /** Cartoon pop: fast downward pitch blip + click. */
  pop(sr, { dur = 0.12, pitch = 1 }, r) {
    const out = buf(sr, dur);
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const s = i / sr;
      const f = (300 + 900 * Math.exp(-s * 70)) * pitch;
      ph += (TAU * f) / sr;
      const click = s < 0.003 ? (r.next() * 2 - 1) * (1 - s / 0.003) * 0.6 : 0;
      out[i] = Math.sin(ph) * adEnv(s, 0.002, dur - 0.002, 2.5) + click;
    }
    return out;
  },
  /** Short tick. */
  click(sr, { dur = 0.03, pitch = 1 }, r) {
    const out = buf(sr, dur), hp = biquad(sr, "bp", 3500 * pitch, 2);
    for (let i = 0; i < out.length; i++) {
      const s = i / sr;
      out[i] = (hp.tick(r.next() * 2 - 1) * 2 + Math.sin(TAU * 2800 * pitch * s) * 0.4) * Math.exp(-s * 220);
    }
    return out;
  },
  /** Paper: crackly band-limited rustle. fold:true adds a soft crease thump at the end. */
  paper(sr, { dur = 0.45, fold = false, pitch = 1, density = 0.35 }, r) {
    const out = buf(sr, dur), bp = biquad(sr, "bp", 3000 * pitch, 0.9), lp = biquad(sr, "lp", 220, 0.8);
    let gate = 0, gateLen = 0;
    for (let i = 0; i < out.length; i++) {
      const u = i / out.length, s = i / sr;
      if (gateLen-- <= 0) { gate = r.chance(density) ? r.range(0.3, 1) : r.range(0, 0.15); gateLen = Math.floor(r.range(0.002, 0.012) * sr); }
      const env = Math.sin(Math.PI * u) ** 0.6;
      let v = bp.tick(r.next() * 2 - 1) * gate * env * 2.2;
      if (fold) { const fs = s - dur * 0.75; if (fs >= 0) v += lp.tick(r.next() * 2 - 1) * Math.exp(-fs * 40) * 3; }
      out[i] = v;
    }
    return out;
  },
  /**
   * Wet clay / dough squish: a soft low "plop" (pitch drops 180 -> 70 Hz) under a gloopy low-passed noise
   * smear that wobbles at ~25 Hz. dur = .32. Use for squash, knead, stick, blob-merge.
   */
  squish(sr, { dur = 0.32, pitch = 1 }, r) {
    const out = buf(sr, dur), lp = biquad(sr, "lp", 900 * pitch, 1.2), bp = biquad(sr, "bp", 420 * pitch, 3);
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const s = i / sr, u = i / out.length;
      const f = (70 + 110 * Math.exp(-s * 18)) * pitch;
      ph += (TAU * f) / sr;
      const wob = 0.6 + 0.4 * Math.sin(TAU * 25 * s + r.range(-0.02, 0.02));
      const n = r.next() * 2 - 1;
      out[i] = Math.sin(ph) * adEnv(s, 0.008, dur, 2) * 0.8 + (lp.tick(n) * 0.9 + bp.tick(n) * 0.6) * wob * Math.sin(Math.PI * u) ** 0.7 * 0.9;
    }
    return out;
  },
  /**
   * Pen / pencil / plotter scratch on paper: band-passed grainy noise (~2.5-4.5 kHz) with stroke-rate
   * amplitude jitter. dur = .5 (one stroke; call per line drawn); speed = strokes texture rate (default 1).
   */
  penScratch(sr, { dur = 0.5, pitch = 1, speed = 1 }, r) {
    const out = buf(sr, dur), bp = biquad(sr, "bp", 3400 * pitch, 1.4), hp = biquad(sr, "hp", 1800 * pitch, 0.7);
    let g = 0, gl = 0;
    for (let i = 0; i < out.length; i++) {
      const u = i / out.length;
      if (gl-- <= 0) { g = r.range(0.35, 1); gl = Math.floor(r.range(0.004, 0.02) * sr / speed); }
      if (i % 64 === 0) bp.set(3400 * pitch * (1 + 0.25 * Math.sin(TAU * u * 3 * speed)));
      const env = Math.min(1, u / 0.06) * Math.min(1, (1 - u) / 0.12);
      out[i] = hp.tick(bp.tick(r.next() * 2 - 1)) * g * env * 0.9;
    }
    return out;
  },
  /**
   * Crowd murmur: many overlapping band-limited "voices" (formant-filtered noise bursts at a syllable rate of
   * ~3-6 Hz) — an audience settling, a room of people. dur = 2.5, density = .6 (0..1), pitch moves the formants.
   */
  murmur(sr, { dur = 2.5, pitch = 1, density = 0.6 }, r) {
    const out = buf(sr, dur), nV = Math.max(3, Math.round(4 + density * 8));
    const voices = Array.from({ length: nV }, () => ({ f1: biquad(sr, "bp", r.range(350, 800) * pitch, 4), f2: biquad(sr, "bp", r.range(1000, 2200) * pitch, 6), rate: r.range(2.8, 6), ph: r.range(0, TAU), g: r.range(0.5, 1) }));
    const lp = biquad(sr, "lp", 2600 * pitch, 0.7);
    for (let i = 0; i < out.length; i++) {
      const s = i / sr, u = i / out.length;
      let v = 0;
      for (const o of voices) {
        const syl = Math.max(0, Math.sin(TAU * o.rate * s + o.ph + 0.8 * Math.sin(TAU * 0.7 * s + o.ph))) ** 2;
        const n = r.next() * 2 - 1;
        v += (o.f1.tick(n) * 0.9 + o.f2.tick(n) * 0.45) * syl * o.g;
      }
      out[i] = lp.tick(v / Math.sqrt(nV)) * 9.6 * Math.min(1, u / 0.15) * Math.min(1, (1 - u) / 0.25);
    }
    return out;
  },
  /**
   * Servo / motor whir: a buzzy saw-ish tone whose pitch GLIDES from hz to hz2 (spin-up or turn), with a little
   * gear chatter and a soft stop. dur = .8, hz = 110, hz2 = 220 (end pitch), grit = .3. Robots, gimbals, drives.
   */
  servo(sr, { dur = 0.8, pitch = 1, hz = 110, hz2 = 220, grit = 0.3 }, r) {
    const out = buf(sr, dur), lp = biquad(sr, "lp", 2400 * pitch, 0.9), bp = biquad(sr, "bp", 3200 * pitch, 3);
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const s = i / sr, u = i / out.length;
      const f = (hz + (hz2 - hz) * (u < 0.7 ? Math.sin((u / 0.7) * Math.PI / 2) : 1)) * pitch;
      ph += f / sr;
      const x = ph % 1;
      let v = 0;
      for (let h = 1; h <= 6; h++) v += Math.sin(TAU * h * ph) / h; // saw-like
      v = lp.tick(v * 0.5 + (x < 0.08 ? 0.3 : 0)) + bp.tick(r.next() * 2 - 1) * grit * 0.5;
      out[i] = v * ahr(s, 0.04, Math.max(0, dur - 0.16), 0.12) * 0.4;
    }
    return out;
  },
  /** Low impact. */
  thud(sr, { dur = 0.45, pitch = 1 }, r) {
    const out = buf(sr, dur), lp = biquad(sr, "lp", 400 * pitch, 0.9);
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const s = i / sr;
      const f = (55 + 90 * Math.exp(-s * 30)) * pitch;
      ph += (TAU * f) / sr;
      out[i] = Math.sin(ph) * adEnv(s, 0.003, dur, 2.2) * 1.1 + lp.tick(r.next() * 2 - 1) * Math.exp(-s * 25) * 0.9;
    }
    return out;
  },
  /** Build-up: noise sweep + rising tone, loudest at the end (event t = start; it ends at t+dur). */
  riser(sr, { dur = 1.5, pitch = 1 }, r) {
    const out = buf(sr, dur), bp = biquad(sr, "bp", 300, 2);
    let ph = 0, ph2 = 0;
    for (let i = 0; i < out.length; i++) {
      const u = i / out.length;
      if (i % 32 === 0) bp.set(300 * pitch * 20 ** u);
      const f = 180 * pitch * 4 ** u;
      ph += (TAU * f) / sr; ph2 += (TAU * f * 1.007) / sr;
      const env = u ** 2 * (u > 0.97 ? (1 - u) / 0.03 : 1);
      out[i] = (bp.tick(r.next() * 2 - 1) * 1.4 + (Math.sin(ph) + Math.sin(ph2)) * 0.18) * env;
    }
    return out;
  },
  /** Bell chime (inharmonic partials). sparkle:true = a cluster of tiny high pings instead. */
  chime(sr, { dur = 1.4, pitch = 1, sparkle = false, notes = 6 }, r) {
    const out = buf(sr, dur);
    const pings = sparkle
      ? Array.from({ length: notes }, () => ({ at: r.range(0, dur * 0.45), f: r.range(2200, 5200) * pitch, a: r.range(0.25, 0.5), d: r.range(10, 18) }))
      : [1, 2.76, 5.4, 8.93].map((m, k) => ({ at: 0, f: 880 * pitch * m, a: [0.6, 0.3, 0.18, 0.08][k], d: 2.5 + k * 2 }));
    for (const p of pings) {
      for (let i = Math.floor(p.at * sr); i < out.length; i++) {
        const s = i / sr - p.at;
        out[i] += Math.sin(TAU * p.f * s) * p.a * Math.exp(-s * p.d) * Math.min(1, s / 0.002);
      }
    }
    return out;
  },
  /** Bubble: quick upward chirp. */
  bubble(sr, { dur = 0.1, pitch = 1 }) {
    const out = buf(sr, dur);
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const s = i / sr;
      ph += (TAU * (350 + 2200 * s / dur) * pitch) / sr;
      out[i] = Math.sin(ph) * adEnv(s, 0.004, dur - 0.004, 1.5) * 0.9;
    }
    return out;
  },
  /** Sub rumble bed. */
  rumble(sr, { dur = 2, pitch = 1 }, r) {
    const out = buf(sr, dur), lp = biquad(sr, "lp", 90 * pitch, 1.2);
    for (let i = 0; i < out.length; i++) {
      const s = i / sr;
      out[i] = (lp.tick(r.next() * 2 - 1) * 4 + Math.sin(TAU * 42 * pitch * s) * 0.35) * ahr(s, dur * 0.25, dur * 0.35, dur * 0.4);
    }
    return out;
  },
  /** Mechanical clack: double click through a resonant body. */
  clack(sr, { dur = 0.12, pitch = 1 }, r) {
    const out = buf(sr, dur), bp = biquad(sr, "bp", 1300 * pitch, 6), bp2 = biquad(sr, "bp", 2600 * pitch, 4);
    const gap = 0.018;
    for (let i = 0; i < out.length; i++) {
      const s = i / sr;
      const exc = (s < 0.002 ? 1 : 0) + (s > gap && s < gap + 0.002 ? 0.7 : 0);
      const n = exc * (r.next() * 2 - 1) * 4;
      out[i] = (bp.tick(n) * 1.6 + bp2.tick(n)) * Math.exp(-s * 35);
    }
    return out;
  },
  /** UI blip: soft square tone. notes: [semitone offsets] plays a quick arpeggio. */
  blip(sr, { dur = 0.08, pitch = 1, notes = [0] }) {
    const step = dur, out = buf(sr, step * notes.length), lp = biquad(sr, "lp", 4000, 0.7);
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const k = Math.min(notes.length - 1, Math.floor(i / (step * sr)));
      const s = i / sr - k * step;
      ph += (TAU * 880 * pitch * 2 ** (notes[k] / 12)) / sr;
      const sq = Math.tanh(Math.sin(ph) * 3) * 0.5;
      out[i] = lp.tick(sq) * adEnv(s, 0.003, step - 0.003, 1.3);
    }
    return out;
  },
  /** Electric hum/buzz (neon). flicker: 0..1 adds stuttering dropouts. */
  buzz(sr, { dur = 1.5, pitch = 1, hz = 120, flicker = 0.3 }, r) {
    const out = buf(sr, dur), bp = biquad(sr, "bp", 1800, 1.2);
    let gate = 1, gateLen = 0;
    for (let i = 0; i < out.length; i++) {
      const s = i / sr, f = hz * pitch;
      if (gateLen-- <= 0) { gate = r.chance(flicker * 0.4) ? r.range(0, 0.3) : 1; gateLen = Math.floor(r.range(0.02, 0.08) * sr); }
      let v = 0;
      for (let h = 1; h <= 7; h++) v += Math.sin(TAU * f * h * s) / h;
      v = Math.tanh(v * 1.5) * 0.35 + bp.tick(r.next() * 2 - 1) * 0.12;
      out[i] = v * gate * ahr(s, 0.03, dur - 0.13, 0.1);
    }
    return out;
  },
  /**
   * Soft ambient pad (music bus by default). root: Hz; chord: semitone offsets from root.
   * brightness: LOW-PASS CUTOFF IN HZ (default 1200; ~300 = dark, ~600-900 = warm, 2000+ = bright).
   * It is not 0..1: values below ~40 Hz filter out the whole chord (0.35 measured -89 dBFS rms = silent).
   */
  pad(sr, { dur = 6, root = 220, chord = [0, 4, 7, 11], attack = 1.2, release = 1.5, brightness = 1200 }) {
    if (brightness < 40 && typeof console !== "undefined") console.warn(`[atlas] pad brightness ${brightness}: this is a low-pass cutoff in Hz, not 0..1 — the pad will be inaudible (try 300-2000)`);
    const out = buf(sr, dur), lp = biquad(sr, "lp", brightness, 0.6);
    const vs = chord.flatMap((n) => [0.996, 1.004].map((d) => ({ f: root * 2 ** (n / 12) * d, ph: n * 0.37 })));
    for (let i = 0; i < out.length; i++) {
      const s = i / sr;
      let v = 0;
      for (const o of vs) {
        const p = TAU * o.f * s + o.ph;
        v += Math.sin(p) * 0.6 + Math.sin(2 * p) * 0.15 + Math.sin(3 * p) * 0.06;
      }
      const lfo = 1 + 0.08 * Math.sin(TAU * 0.2 * s);
      out[i] = lp.tick(v / vs.length) * lfo * ahr(s, attack, Math.max(0, dur - attack - release), release) * 0.9;
    }
    return out;
  },
};
VOICES.tick = (sr, o, r) => VOICES.click(sr, { dur: 0.015, pitch: 1.4, ...o }, r);
VOICES.rustle = (sr, o, r) => VOICES.paper(sr, { fold: false, ...o }, r);
VOICES.fold = (sr, o, r) => VOICES.paper(sr, { fold: true, ...o }, r);
VOICES.impact = VOICES.thud;
VOICES.sparkle = (sr, o, r) => VOICES.chime(sr, { sparkle: true, dur: 0.9, ...o }, r);
VOICES.hum = (sr, o, r) => VOICES.buzz(sr, { flicker: 0, hz: 60, ...o }, r);
VOICES.whooshIn = (sr, o, r) => VOICES.whoosh(sr, { ...o, dir: "in" }, r);
VOICES.whooshOut = (sr, o, r) => VOICES.whoosh(sr, { ...o, dir: "out" }, r);

VOICES.whir = (sr, o, r) => VOICES.servo(sr, { grit: 0.15, ...o }, r);

// ---------------------------------------------------------------- pass 7 voices (2026-11-13; existing voices untouched)
/**
 * pluck: plucked string (Karplus-Strong). Seeded noise burst in a delay line of sr/hz samples, averaged with a
 *   fractional (allpass-free, linear) delay so the pitch is exact; `bright` 0..1 shapes the burst (low-passed for a
 *   duller, nylon pluck), `decay` = seconds to fall ~60 dB (sets the loop gain). Pure JS, deterministic (rng from the
 *   event seed). opts: { dur = 1.2, hz = 220, pitch = 1, decay = 1.0, bright = 0.6, notes?: [semitones], step = 0.09 }
 *   `notes` plays a strum/arpeggio, one pluck every `step` s.
 */
VOICES.pluck = (sr, { dur = 1.2, hz = 220, pitch = 1, decay = 1.0, bright = 0.6, notes = [0], step = 0.09 }, r) => {
  const out = buf(sr, dur + step * (notes.length - 1));
  notes.forEach((semi, k) => {
    const f = hz * pitch * 2 ** (semi / 12);
    const D = Math.max(2, sr / f - 0.5);         // loop = D + 0.5 (the two-tap average) = sr / f exactly
    const N = Math.floor(D), frac = D - N;
    const off = Math.round(k * step * sr), len = out.length - off;
    if (len <= 0) return;
    const y = new Float32Array(len);
    const lp = onePole(sr, 300 + 9000 * clamp(bright, 0, 1));
    const burst = new Float32Array(N + 2);
    for (let i = 0; i < burst.length; i++) burst[i] = lp.tick(r.next() * 2 - 1);
    let mean = 0;
    for (const v of burst) mean += v / burst.length;
    const g = Math.pow(10, -3 / (Math.max(0.05, decay) * f)); // per-period loop gain: -60 dB after `decay` s
    const at = (j) => (j < 0 ? 0 : y[j]);
    for (let i = 0; i < len; i++) {
      if (i < burst.length) { y[i] = burst[i] - mean; continue; }
      const d0 = at(i - N) + (at(i - N - 1) - at(i - N)) * frac;       // y[i - D]
      const d1 = at(i - N - 1) + (at(i - N - 2) - at(i - N - 1)) * frac; // y[i - D - 1]
      y[i] = g * 0.5 * (d0 + d1);
    }
    for (let i = 0; i < len; i++) out[off + i] += y[i] * 0.6 * Math.min(1, i / (0.0015 * sr));
  });
  return out;
};
/**
 * marimba: struck wooden bar. Partials at 1 : 4 : 10 (a tuned marimba bar's 1st, 2nd and 3rd modes, ~1 : 3.9 : 9.2
 *   rounded as tuners aim for), higher partials decaying much faster, a soft mallet click, short overall decay.
 *   opts: { dur = 0.9, hz = 440, pitch = 1, decay = 0.2 (s, fundamental 1/e time), notes?: [semitones], step = 0.12, mallet = 0.5 }
 *   The last 30 ms of the buffer fade out (no truncation click if decay is long for dur).
 */
VOICES.marimba = (sr, { dur = 0.9, hz = 440, pitch = 1, decay = 0.2, notes = [0], step = 0.12, mallet = 0.5 }, r) => {
  const out = buf(sr, dur + step * (notes.length - 1));
  const parts = [[1, 1, 1], [4, 0.32, 3.2], [10, 0.1, 7]]; // [ratio, amp, decay speed-up]
  notes.forEach((semi, k) => {
    const f = hz * pitch * 2 ** (semi / 12), off = Math.round(k * step * sr);
    const bp = biquad(sr, "bp", Math.min(sr * 0.45, f * 6), 1.2);
    const ph = parts.map(() => r.range(0, 0.2));
    for (let i = 0; off + i < out.length; i++) {
      const s = i / sr, att = Math.min(1, s / 0.0015);
      let v = 0;
      for (let p = 0; p < parts.length; p++) {
        const [m, a, sp] = parts[p];
        if (f * m < sr * 0.45) v += Math.sin(TAU * (f * m * s + ph[p])) * a * Math.exp((-s * sp) / decay);
      }
      const click = s < 0.006 ? bp.tick((r.next() * 2 - 1) * mallet) * Math.exp(-s * 900) : 0;
      out[off + i] += (v * 0.5 + click) * att;
    }
  });
  const fade = Math.round(0.03 * sr);
  for (let i = Math.max(0, out.length - fade); i < out.length; i++) out[i] *= (out.length - i) / fade;
  return out;
};

const MUSIC_TYPES = new Set(["pad"]);

/**
 * renderScore(score, opts) -> { left: Float32Array, right: Float32Array, sampleRate }
 *   score: [{ t, type, gain = 1, pan = 0 (-1..1), bus?: "sfx"|"music", seed?, ...voiceOpts }]
 *          t = onset in seconds (whoosh "in" peaks ~70% into its dur; riser ends at t+dur).
 *   opts:  { duration (s, required), sampleRate = 48000, seed = 1, master = 0.8,
 *            duck = [{start, end}] — music bus drops to duckLevel inside these ranges,
 *            duckLevel = 0.3, duckAttack = 0.08, duckRelease = 0.35 (s),
 *            ceiling = 0.89 (≈ -1 dBFS limiter ceiling) }
 */
export function renderScore(score, opts = {}) {
  const { duration, sampleRate: sr = 48000, seed = 1, master = 0.8, duck = [], duckLevel = 0.3, duckAttack = 0.08, duckRelease = 0.35, ceiling = 0.89 } = opts;
  if (!(duration > 0)) throw new Error("renderScore: duration (seconds) is required");
  const N = Math.ceil(duration * sr);
  const bus = { sfx: [new Float32Array(N), new Float32Array(N)], music: [new Float32Array(N), new Float32Array(N)] };

  for (const ev of score) {
    const make = VOICES[ev.type];
    if (!make) throw new Error(`renderScore: unknown sound type "${ev.type}"`);
    const r = rng((hashString(ev.type) ^ Math.round(ev.t * 1000) * 2654435761 ^ (ev.seed ?? 0) ^ seed) >>> 0);
    const mono = make(sr, ev, r);
    const g = ev.gain ?? 1, pan = clamp(ev.pan ?? 0, -1, 1);
    const gl = Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2 * g, gr = Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2 * g;
    const [L, R] = bus[ev.bus ?? (MUSIC_TYPES.has(ev.type) ? "music" : "sfx")];
    const start = Math.round(ev.t * sr);
    for (let i = 0; i < mono.length; i++) {
      const j = start + i;
      if (j < 0) continue;
      if (j >= N) break;
      L[j] += mono[i] * gl;
      R[j] += mono[i] * gr;
    }
  }

  // ducking envelope for the music bus (deterministic one-pole smoothing)
  const left = new Float32Array(N), right = new Float32Array(N);
  const aA = Math.exp(-1 / (duckAttack * sr)), aR = Math.exp(-1 / (duckRelease * sr));
  let dg = 1;
  for (let i = 0; i < N; i++) {
    const s = i / sr;
    const target = duck.some((d) => s >= d.start && s < d.end) ? duckLevel : 1;
    const a = target < dg ? aA : aR;
    dg = target + a * (dg - target);
    left[i] = (bus.sfx[0][i] + bus.music[0][i] * dg) * master;
    right[i] = (bus.sfx[1][i] + bus.music[1][i] * dg) * master;
  }
  limit(left, right, sr, ceiling);
  return { left, right, sampleRate: sr };
}

/** Look-ahead peak limiter (2 ms attack ramp, 120 ms release) + soft safety clip. In place. */
export function limit(L, R, sr, ceiling = 0.89) {
  const N = L.length, g = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    g[i] = p > ceiling ? ceiling / p : 1;
  }
  const att = 1 / (0.002 * sr), rel = 1 / (0.12 * sr);
  for (let i = N - 2; i >= 0; i--) g[i] = Math.min(g[i], g[i + 1] + att);
  for (let i = 1; i < N; i++) g[i] = Math.min(g[i], g[i - 1] + rel);
  const soft = (x) => (Math.abs(x) <= 0.8 ? x : Math.sign(x) * (0.8 + 0.18 * Math.tanh((Math.abs(x) - 0.8) / 0.18)));
  for (let i = 0; i < N; i++) {
    L[i] = soft(L[i] * g[i]);
    R[i] = soft(R[i] * g[i]);
  }
}

/** encodeWav({left, right, sampleRate}) -> Uint8Array (16-bit PCM stereo WAV). */
export function encodeWav({ left, right, sampleRate }) {
  const N = left.length, bytes = 44 + N * 4, b = new Uint8Array(bytes), v = new DataView(b.buffer);
  const str = (o, s) => [...s].forEach((ch, i) => (b[o + i] = ch.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, bytes - 8, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, N * 4, true);
  for (let i = 0, o = 44; i < N; i++, o += 4) {
    v.setInt16(o, Math.round(clamp(left[i], -1, 1) * 32767), true);
    v.setInt16(o + 2, Math.round(clamp(right[i], -1, 1) * 32767), true);
  }
  return b;
}
