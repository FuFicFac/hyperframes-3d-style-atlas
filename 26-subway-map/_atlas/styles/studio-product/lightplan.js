// styles/studio-product/lightplan.js — the light/shot schedule as pure functions of t. NO THREE, no window:
// imported by style.js (the picture) AND by a scene's scene.config.js (so SCORE whooshes/chimes derive from
// the same sweep and glow plan, and render-sfx / export-spec still run in Node).
import { clamp, smoothstep, toEase } from "../../kit/time.js";
// shotKeys, wavePlan, pulse: kit/schedule.js (promoted, identical code)
export { shotKeys, wavePlan, pulse } from "../../kit/schedule.js";

/**
 * sweepAt(t, sweeps, edgeFade = .16) -> { u, level }
 *   sweeps: [{ t, dur, ease = "inOutSine", peak = 1, yaw = 0 }] — the strip travels u: 0 → 1 over dur.
 *   level fades in/out over the first/last `edgeFade` of the travel; outside every sweep level = 0
 *   (u parks at 0). The last-started sweep wins.
 */
export function sweepAt(t, sweeps = [], edgeFade = 0.16) {
  let out = { u: 0, level: 0, yaw: 0 };
  for (const s of sweeps) {
    if (t < s.t || t > s.t + s.dur) continue;
    const u = toEase(s.ease ?? "inOutSine")(clamp((t - s.t) / s.dur));
    const lin = clamp((t - s.t) / s.dur);
    const level = (s.peak ?? 1) * smoothstep(0, edgeFade, lin) * (1 - smoothstep(1 - edgeFade, 1, lin));
    out = { u, level, yaw: s.yaw ?? 0 };
  }
  return out;
}

/** sweepPeak(s) -> time the strip passes the top of the arc (u = .5) — use for whoosh/hit timing. */
export const sweepPeak = (s) => s.t + s.dur * 0.5;

/** studioLevel(t, { on, dur = 1.2, off?, offDur = .8 }) -> 0..1  (black stage → lit studio, smooth) */
export function studioLevel(t, { on = 0, dur = 1.2, off = Infinity, offDur = 0.8 } = {}) {
  const down = Number.isFinite(off) ? 1 - smoothstep(off, off + offDur, t) : 1; // smoothstep(∞, ∞) is NaN
  return smoothstep(on, on + dur, t) * down;
}

/**
 * keyed(t, keys) -> value: piecewise interpolation of [{ t, v, ease = "linear" }] (ease = the segment
 * ARRIVING at the key). Holds outside. Used for turntable angles and any slow scalar.
 */
export function keyed(t, keys) {
  if (t <= keys[0].t) return keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) return a.v + (b.v - a.v) * toEase(b.ease ?? "linear")(b.t > a.t ? (t - a.t) / (b.t - a.t) : 1);
  }
  return keys[keys.length - 1].v;
}



