// styles/zoetrope/zoetrope.js — the zoetrope planner. Plain functions: no THREE, no window, no DOM (Node-safe).
// Imported by style.js (the picture) AND by scene.config.js (SCORE, framing), so sound and picture share one plan.
//
// The mechanism:
//   * A ring holds N stations. Station i carries pose phase  frac(-i / N)  of a looping action (0..1).
//     Station i sits at disc-local angle  i * D  (D = 2*pi / N); rotation is about +Y, so a disc angle theta moves
//     station i to world angle  i*D + theta  (world angle 0 = the "front", toward +Z / the camera).
//     The station at the front therefore shows phase  frac(theta / 2pi): one full action per revolution.
//   * Disc speed omega(t) is a sum of smoothstep steps (spin up, detune, coast); theta(t) is its exact integral
//     (closed form), offset so that theta is a multiple of D at the strobe lock: under the strobe the stations land
//     exactly on the same spots every frame.
//   * Three looks, all pure functions of t:
//       still      - omega = 0: a row of statues;
//       continuous - the frame is the average of K renders over a one-frame shutter (blurAngles): a smeared band;
//       strobe     - one flash per video frame, the frame shows theta at the frame time (no blur). At omega = D * fps
//                    each flash finds the disc exactly one station on, so every spot shows the next pose; a slightly
//                    faster disc (detune) makes the whole animation creep slowly round the disc.
import { clamp, smoothstep, ease } from "../../kit/time.js";

export const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);

/** pose phase (0..1) carried by station i of an N-station ring */
export const stationPhase = (i, N) => frac(-i / N + 1e-9);

/** integral of smoothstep((t - t0) / d) from -inf to t (0 before t0, d/2 + (t - t0 - d) after) */
function smoothInt(t, t0, d) {
  if (t <= t0) return 0;
  const u = (t - t0) / d;
  if (u >= 1) return d * 0.5 + (t - t0 - d);
  return d * (u * u * u - 0.5 * u * u * u * u);
}

// ------------------------------------------------------------------------------------------------ poses
/**
 * ballPose(p, o) -> { y, sx, sy }   a bouncing ball (contact at p = 0/1, apex at .5) with squash and stretch.
 *   y = height of the ball's BOTTOM above the rest surface; sx/sy = scale (volume kept).
 */
export function ballPose(p, o = {}) {
  const H = o.height ?? 0.5, sq = o.squash ?? 0.42, st = o.stretch ?? 0.22;
  const d = Math.min(p, 1 - p);                        // distance (in phase) to the nearest contact
  const s = sq * Math.exp(-((d / 0.035) ** 2));        // squash at contact
  const e = st * Math.exp(-(((d - 0.12) / 0.06) ** 2)); // stretch while falling fast near the ground
  const sy = 1 - s + e;
  return { y: H * 4 * d * (1 - d), sy, sx: 1 / Math.sqrt(sy) };
}

/**
 * flowerPose(p, o) -> { stem, leaf, head, open, droop }   a sprout that grows, buds, blooms, closes and sinks back.
 *   stem: stem height (m); leaf 0..1; head 0..1 (bud/flower size); open 0..1 (petal spread); all loop (p=0 == p=1).
 */
export function flowerPose(p, o = {}) {
  const H = o.height ?? 0.34, h0 = o.sprout ?? 0.05;
  const grow = smoothstep(0.0, 0.5, p) * (1 - smoothstep(0.84, 1.0, p));
  const open = smoothstep(0.42, 0.66, p) * (1 - smoothstep(0.74, 0.9, p));
  return {
    stem: h0 + H * grow,
    leaf: smoothstep(0.08, 0.4, p) * (1 - smoothstep(0.86, 1.0, p)),
    head: smoothstep(0.22, 0.5, p) * (1 - smoothstep(0.86, 0.98, p)),
    open,
    droop: smoothstep(0.74, 0.92, p) * (1 - smoothstep(0.92, 1.0, p)),
  };
}

export const POSES = { ball: ballPose, flower: flowerPose };

// ------------------------------------------------------------------------------------------------ the spin plan
/**
 * createSpin({ N, fps, steps, strobe, detune, shutter, blurSamples, lockAt }) -> plan
 *   steps:  [{ t, d, rate }]   disc speed moves to `rate` (in stations per video frame: 1 = locked speed) over d s
 *   strobe: [{ on, off }]      strobe windows (flash per video frame)
 *   lockAt: a time at which theta must be an exact multiple of D (the strobe lock)
 *   blurSamples: K renders averaged per continuous-light frame; shutter: exposure in frames (1 = full frame)
 */
export function createSpin(o) {
  const N = o.N, fps = o.fps ?? 30, D = TAU / N;
  const unit = D * fps;                                   // rad/s at "one station per frame"
  const steps = o.steps.map((s) => ({ ...s }));
  let prev = 0;
  for (const s of steps) { s.dOmega = (s.rate - prev) * unit; prev = s.rate; }
  const rawTheta = (t) => { let a = 0; for (const s of steps) a += s.dOmega * smoothInt(t, s.t, s.d); return a; };
  const omega = (t) => { let w = 0; for (const s of steps) w += s.dOmega * smoothstep(s.t, s.t + s.d, t); return w; };
  const lockAt = o.lockAt ?? 0;
  const r0 = rawTheta(lockAt);
  const offset = -(r0 - Math.round(r0 / D) * D);          // makes theta(lockAt) an exact multiple of D
  const theta = (t) => rawTheta(t) + offset;
  const strobe = o.strobe ?? [];
  const frameTime = (t) => Math.floor(t * fps + 1e-6) / fps;
  const strobeOn = (t) => strobe.some((w) => t >= w.on && t < w.off);
  const shutter = (o.shutter ?? 1) / fps, K = o.blurSamples ?? 10;

  /** the disc angle(s) a frame at t shows: [one angle] under the strobe or when still, else K sub-frame angles */
  function anglesAt(t) {
    if (strobeOn(t)) return [theta(frameTime(t))];
    const a0 = theta(t - shutter / 2), a1 = theta(t + shutter / 2);
    if (Math.abs(a1 - a0) < 1e-4) return [theta(t)];
    const out = [];
    for (let j = 0; j < K; j++) out.push(theta(t - shutter / 2 + ((j + 0.5) / K) * shutter));
    return out;
  }
  /** phase shown by the station nearest the front (world angle 0) at time t */
  function frontPhase(t) {
    const a = strobeOn(t) ? theta(frameTime(t)) : theta(t);
    const i = Math.round(-a / D);                          // station index at the front
    return stationPhase(((i % N) + N) % N, N);
  }
  /** smeared arc per frame in stations (for the blur look and the sound) */
  const smear = (t) => (omega(t) * shutter) / D;

  /**
   * events({ t0, t1, ballAt, bloomAt }) -> [{ t, kind }]: under the strobe, one "bounce" each time the front ball
   * station shows contact (phase wraps), one "bloom" when the front flower passes `bloomAt`; plus strobe on/off.
   */
  function events(e = {}) {
    const out = [];
    const t0 = e.t0 ?? 0, t1 = e.t1 ?? 15, bloomAt = e.bloomAt ?? 0.55;
    for (const w of strobe) { out.push({ t: w.on, kind: "strobeOn" }); out.push({ t: w.off, kind: "strobeOff" }); }
    let last = null;
    for (let f = Math.ceil(t0 * fps); f <= Math.floor(t1 * fps); f++) {
      const t = f / fps;
      if (!strobeOn(t)) { last = null; continue; }
      const p = frontPhase(t);
      if (last != null) {
        if (p < last - 0.5) out.push({ t, kind: "bounce" });
        if (last < bloomAt && p >= bloomAt) out.push({ t, kind: "bloom" });
      }
      last = p;
    }
    return out.sort((a, b) => a.t - b.t);
  }

  return { N, D, fps, unit, steps, strobe, theta, omega, anglesAt, frontPhase, strobeOn, frameTime, smear, events, offset };
}

/** room darkness 0..1 for strobe windows (eased, `fade` s in/out) — scene lights read it */
export function darkness(strobe, t, fade = 0.22) {
  let v = 0;
  for (const w of strobe) v = Math.max(v, clamp((t - w.on) / fade) * (1 - clamp((t - w.off) / fade)));
  return ease.inOutSine(v);
}

/** onset flash 0..1: a short soft overexposure right after each strobe switch-on (decays in `dur` s) */
export function onsetFlash(strobe, t, dur = 0.35) {
  let v = 0;
  for (const w of strobe) if (t >= w.on && t < w.on + dur) v = Math.max(v, 1 - (t - w.on) / dur);
  return v * v;
}
