// styles/endless-zoom/zoom.js — the LEVEL PLANNER for "Endless Zoom". Pure maths: no THREE, no window, no DOM.
// Imported by style.js (picture) and by scene.config.js (labels, SCORE, checks) so sound and picture share one plan.
//
// Model. A chain of N levels; each is a self-contained world authored at unit size (frame = 16/9 x 1, centred on the
// origin). Level m holds a PORTAL at its origin: the outline of level m+1's window, shrunk by R_m. Level m+1 lives
// inside it at scale 1/R_m. The last level's portal holds level 0, so the chain is a loop.
//
// Zoom. One global zoom clock tau (seconds, tau = t + phase, wrapped to the loop). The zoom is exponential in tau with
// one rate k for the whole loop: level m is drawn at scale S_m(tau) = exp(k (tau - tau_m)), where tau_m is the moment it
// exactly fills the frame. Level durations are T_m = ln(R_m) / k, so a level with a deeper portal simply lasts longer
// and perceived speed never changes. k = ln(prod R) / duration closes the loop exactly: at t = duration every scale
// equals its value at t = 0. Scale is always computed from t, never accumulated.
//
// At any moment only two levels are drawn: the OUTER level n (S in [1, R_n)) and the INNER level n+1 seen through
// level n's portal (S in [1/R_n, 1)), fading in through the portal window as it grows (alpha from S_inner).

import { clamp, smoothstep } from "../../kit/time.js";

/** Window shapes (inner level's own units): rounded rect / circle; both cover the 16:9 frame with margin for sway. */
export const SHAPES = {
  rrect: { kind: "rrect", hw: 0.95, hh: 0.56, r: 0.14 },
  circle: { kind: "circle", hw: 1.08, hh: 1.08, r: 1.08 },
};

const wrapTo = (x, a, d) => ((((x - a) % d) + d) % d) + a; // x into [a, a + d)

/**
 * createZoomPlan(levels, opts) -> plan
 *   levels: [{ id, R, label, labelAt? (inner scale at which its label takes over, default opts.labelAt) }]
 *   opts:   { duration = 15, phase = 0.8 (tau at t = 0), fade = [0.2, 0.5] (inner alpha ramp over S_inner),
 *             labelAt = 0.5, labelFade = 0.25, blinkCycles = 16 (cursor / spark blinks per loop) }
 */
export function createZoomPlan(levels, opts = {}) {
  const { duration = 15, phase = 0.8, fade = [0.2, 0.5], labelAt = 0.5, labelFade = 0.25, blinkCycles = 16 } = opts;
  const N = levels.length;
  const lnR = levels.map((L) => Math.log(L.R));
  const lnTotal = lnR.reduce((a, b) => a + b, 0);
  const k = lnTotal / duration;
  const T = lnR.map((x) => x / k);
  const tau0 = [];
  { let acc = 0; for (let i = 0; i < N; i++) { tau0.push(acc); acc += T[i]; } }
  const prev = (m) => (m - 1 + N) % N;

  const tauAt = (t) => wrapTo(t + phase, 0, duration);
  const tOfTau = (tau) => wrapTo(tau - phase, 0, duration);

  /** state(t) -> { tau, outer, inner, f, Sout, Sin, alpha } */
  function state(t) {
    const tau = tauAt(t);
    let n = 0;
    for (let i = 0; i < N; i++) if (tau >= tau0[i]) n = i;
    const Sout = Math.exp(k * (tau - tau0[n]));
    const Sin = Sout / levels[n].R;
    return { tau, outer: n, inner: (n + 1) % N, f: (tau - tau0[n]) / T[n], Sout, Sin, alpha: smoothstep(fade[0], fade[1], Sin) };
  }
  /** localTime(m, t): seconds since level m filled the frame, in [-T_prev, duration - T_prev) (continuous while visible). */
  const localTime = (m, t) => wrapTo(tauAt(t) - tau0[m], -T[prev(m)], duration);
  /** scaleOf(m, t): the level's scale on its current visit (meaningful while it is outer or inner). */
  const scaleOf = (m, t) => Math.exp(k * localTime(m, t));

  // ---------------------------------------------------------------- labels: one per level, swapped (never overlapping)
  const onTau = levels.map((L, m) => tau0[m] + Math.log(L.labelAt ?? labelAt) / k);
  const windows = levels.map((L, m) => ({ level: m, text: L.label, on: onTau[m], off: m + 1 < N ? onTau[m + 1] : onTau[0] + duration }));
  /** label(t) -> { text, alpha, level } (alpha fades in/out over labelFade at each swap) */
  function label(t) {
    const tau = wrapTo(tauAt(t), onTau[0], duration);
    for (const w of windows) {
      if (tau >= w.on && tau < w.off) {
        const a = Math.min(clamp((tau - w.on) / labelFade), clamp((w.off - tau) / labelFade));
        return { text: w.text, alpha: a, level: w.level };
      }
    }
    return { text: "", alpha: 0, level: -1 };
  }
  /** labelSpans(): per level, the clip-time spans (split at the loop seam) and the fully visible seconds. */
  function labelSpans() {
    return windows.map((w) => {
      const a = tOfTau(w.on), b = a + (w.off - w.on);
      const spans = b <= duration ? [[a, b]] : [[a, duration], [0, b - duration]];
      return { level: w.level, text: w.text, spans: spans.map((s) => s.map((x) => +x.toFixed(3))), full: +(w.off - w.on - 2 * labelFade).toFixed(3) };
    });
  }

  // ---------------------------------------------------------------- crossings (one per level): label swap moments
  /** crossings() -> [{ t, level, fill }] sorted by t; t = label swap, fill = when the level fills the frame */
  const crossings = () => levels.map((L, m) => ({ t: tOfTau(onTau[m]), level: m, id: L.id, fill: tOfTau(tau0[m]) })).sort((a, b) => a.t - b.t);

  // ---------------------------------------------------------------- the blink shared by the cursor and the spark
  const blinkPeriod = duration / blinkCycles;
  /** blink(t) -> 0..1, periodic in the loop: cursor glow in the chat, spark flashes in the switch (same clock). */
  function blink(t) {
    const ph = wrapTo(tauAt(t), 0, blinkPeriod) / blinkPeriod; // 0..1
    const c = Math.cos(ph * Math.PI * 2);
    return clamp((c + 0.15) * 2.4);
  }
  const blinkCycle = (t) => Math.floor(tauAt(t) / blinkPeriod);

  // ---------------------------------------------------------------- Shepard tone, from the same zoom clock
  /**
   * shepard({ octaves = 3, steps = 36, base = 55, partials = 7, centre = 3.2, width = 1.1, dur, overlap = 0.25 })
   *   -> [{ t, hz, gain, dur }]: a discrete Shepard scale. Pitch position x(tau) = octaves * ln S / ln(prod R) rises
   *   with the zoom (so it loops when the zoom loops). Each step sounds every partial base * 2^(i + frac x) with a FIXED
   *   bell-curve loudness over log-frequency, so the top partial fades out as a new one fades in at the bottom.
   *   Notes that cross the loop seam are also emitted shifted by -duration so the audio loops too.
   */
  function shepard(o = {}) {
    const { octaves = 3, steps = 36, base = 55, partials = 7, centre = 3.2, width = 1.1, overlap = 0.25 } = o;
    const step = duration / steps, dur = o.dur ?? step + overlap, out = [];
    for (let j = 0; j < steps; j++) {
      const tau = j * step, x = (octaves * (k * tau)) / lnTotal, frac = x - Math.floor(x);
      const t = tOfTau(tau);
      for (let i = 0; i < partials; i++) {
        const oct = i + frac, gain = Math.exp(-((oct - centre) ** 2) / (2 * width * width));
        if (gain < 0.02) continue;
        const ev = { t: +t.toFixed(4), hz: +(base * 2 ** oct).toFixed(3), gain: +gain.toFixed(4), dur: +dur.toFixed(4), step: j, partial: i };
        out.push(ev);
        if (t + dur > duration) out.push({ ...ev, t: +(t - duration).toFixed(4), wrapped: true });
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }

  // ---------------------------------------------------------------- checks the build can gate on
  /** report(dt) -> { ok, loop, labels, minAlphaGap } : loop closes, labels long enough, one at a time. */
  function report(dt = 1 / 30) {
    const a = state(0), b = state(duration - 1e-9 + 1e-9);
    const loop = { ok: a.outer === b.outer && Math.abs(a.Sout - b.Sout) < 1e-9 && Math.abs(blink(0) - blink(duration)) < 1e-9 };
    const spans = labelSpans();
    const shortLabels = spans.filter((s) => s.full < 1.5);
    let blank = 0, longestBlank = 0;
    for (let t = 0; t <= duration + 1e-9; t += dt) {
      if (label(t).alpha < 0.05) { blank += dt; longestBlank = Math.max(longestBlank, blank); } else blank = 0;
    }
    return { ok: loop.ok && !shortLabels.length && longestBlank < 0.6, loop, k: +k.toFixed(4), T: T.map((x) => +x.toFixed(3)), labels: spans, shortLabels, longestBlank: +longestBlank.toFixed(3) };
  }

  return { N, k, T, tau0, duration, phase, fade, levels, lnTotal, state, localTime, scaleOf, tauAt, tOfTau, label, labelSpans, crossings, blink, blinkCycle, blinkPeriod, shepard, report };
}

/** portalSize(shape, R) -> { hw, hh, r }: the outline of the next level's window inside a level whose depth is R. */
export const portalSize = (shape, R) => ({ kind: shape.kind, hw: shape.hw / R, hh: shape.hh / R, r: shape.r / R });

/** sdRoundBox(x, y, shape) -> signed distance (negative inside); same formula as the portal shader. */
export function sdRoundBox(x, y, s) {
  const qx = Math.abs(x) - s.hw + s.r, qy = Math.abs(y) - s.hh + s.r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - s.r;
}

/** zoomVoices(S): SCORE mapping for scheduled events (kit schedule.scoreFromEvents). */
export function zoomVoices(snd) {
  return {
    shepard: (e) => ({ type: "pad", root: e.hz, chord: [0], attack: snd.shepard.attack, release: snd.shepard.release, brightness: snd.shepard.brightness, gain: snd.shepard.gain * e.gain, dur: e.dur }),
    crossing: (e) => ({ type: "chime", pitch: snd.chime.pitches[e.level % snd.chime.pitches.length], dur: 1.6, gain: snd.chime.gain }),
    whoosh: (e) => ({ type: "whoosh", dir: "in", dur: 0.9, gain: snd.whoosh.gain, pitch: 1 + 0.06 * e.level }),
    sparkle: () => ({ type: "sparkle", dur: 1.2, notes: 9, gain: snd.sparkle.gain }),
  };
}
