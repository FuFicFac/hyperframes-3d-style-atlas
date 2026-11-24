// styles/cardboard-stop-motion/poses.js — the pure POSE PLANNER for "Cardboard Stop-Motion".
// NO THREE, no window, no DOM: imports only kit/time.js, kit/strokefont.js and this style's spec (plain data), so
// scene.config.js imports it too and builds SCORE from the SAME pose grid the picture uses (a tap lands on every pose
// change of a moving piece, a marker squeak on every pose that adds ink, a pop on every replacement swap).
// Exposed as `style.plan`.
//
// Time model: the picture is evaluated at tq = poseTime(t) = floor(t * fps) / fps. With fps = 10 at 30 fps output every
// pose is held for exactly three frames ("on threes"). Randomness is hash01(seed, poseIndex, channel) — a pure function
// of the pose number, never of state — so jitter and flicker are identical however the timeline is seeked.
import { clamp, lerp, ease as EASE, hash01 } from "../../kit/time.js";
import { layoutStrokeText } from "../../kit/strokefont.js";
import { STYLE_SPEC } from "./spec.js";

const PS = STYLE_SPEC.pose, TU = STYLE_SPEC.tuning, LT = STYLE_SPEC.lettering;
export const POSE_FPS = PS.fps;
const EPS = 1e-6;

// ------------------------------------------------------------------ the grid
/** poseIndex(t, fps) -> integer pose number. */
export const poseIndex = (t, fps = POSE_FPS) => Math.floor(t * fps + EPS);
/** poseTime(t, fps) -> t snapped DOWN to the pose grid (the time the picture is evaluated at). */
export const poseTime = (t, fps = POSE_FPS) => poseIndex(t, fps) / fps;
/** poseCeil(t, fps) -> the first pose time >= t (when an event planned at t first becomes visible). */
export const poseCeil = (t, fps = POSE_FPS) => Math.ceil(t * fps - EPS) / fps;
/** posed(t) -> { i, tq } */
export const posed = (t, fps = POSE_FPS) => { const i = poseIndex(t, fps); return { i, tq: i / fps }; };
/** poseTimes(t0, t1, fps) -> every pose-change instant in [t0, t1) (sound for a piece that moves through that window). */
export function poseTimes(t0, t1, fps = POSE_FPS) {
  const out = [];
  for (let k = Math.ceil(t0 * fps - EPS); k / fps < t1 - EPS; k++) out.push(k / fps);
  return out;
}

// ------------------------------------------------------------------ hand-placement noise
/** jitter(i, seed, k = 1) -> { x, y, rot }: per-pose placement error, amplitude from spec.pose.jitter times k. */
export function jitter(i, seed, k = 1) {
  const a = PS.jitter;
  return {
    x: (hash01(seed, i, 11) - 0.5) * 2 * a.pos * k,
    y: (hash01(seed, i, 12) - 0.5) * 2 * a.pos * k,
    rot: (hash01(seed, i, 13) - 0.5) * 2 * a.rot * k,
  };
}
/** camJitter(i) -> { x, y, z, roll } for the stepped camera. */
export function camJitter(i, seed = 900) {
  const a = PS.camJitter;
  return {
    x: (hash01(seed, i, 1) - 0.5) * 2 * a.pos, y: (hash01(seed, i, 2) - 0.5) * 2 * a.pos,
    z: (hash01(seed, i, 3) - 0.5) * 2 * a.pos, roll: (hash01(seed, i, 4) - 0.5) * 2 * a.rot,
  };
}
/** flicker(i, seed, amp) -> lamp level multiplier for pose i (1 +- amp; a rare deeper dip ~1 pose in 25). */
export function flicker(i, seed = 77, amp = PS.flicker) {
  const h = hash01(seed, i, 5);
  const dip = hash01(seed, i, 6) < 0.04 ? -amp * 1.2 : 0;
  return 1 + (h - 0.5) * 2 * amp + dip;
}
/** moving(tq, start, dur) -> true while a piece is between poses of a move (full jitter); else rest jitter applies. */
export const moving = (tq, start, dur) => tq >= start - EPS && tq <= start + dur + EPS;
/** jitterK(tq, windows) -> 1 while any [start, dur] window is active, else spec.pose.restJitter. */
export const jitterK = (tq, windows) => (windows.some(([s, d]) => moving(tq, s, d)) ? 1 : PS.restJitter);

// ------------------------------------------------------------------ moves (all evaluated at pose time)
const E = (e) => (typeof e === "function" ? e : EASE[e] ?? EASE.linear);
/** prog(tq, start, dur, ease) -> 0..1 */
export const prog = (tq, start, dur, ease = "linear") => E(ease)(clamp((tq - start) / Math.max(dur, EPS)));
/** move(tq, start, dur, a, b, ease) -> number | array lerped a -> b */
export function move(tq, start, dur, a, b, ease = "inOutQuad") {
  const u = prog(tq, start, dur, ease);
  return Array.isArray(a) ? a.map((v, k) => lerp(v, b[k], u)) : lerp(a, b, u);
}
/** standUp(tq, start, dur) -> 0..1 (+ one pose of overshoot, like an animator pushing a flap a bit too far). */
export function standUp(tq, start, dur = TU.standDur) {
  if (tq < start) return 0;
  const u = (tq - start) / dur;
  if (u >= 1) return u < 1 + 1 / (POSE_FPS * dur) ? 1.06 : 1;
  return EASE.outQuad(u);
}
/** tipBack(tq, start, dur) -> 1..0 */
export const tipBack = (tq, start, dur = TU.tipDur) => 1 - prog(tq, start, dur, "inQuad");
/** walk(tq, start, dur, swing) -> { l, r, bob } leg angles alternating every pose while the body slides. */
export function walk(tq, start, dur, swing = TU.walkSwing) {
  if (!moving(tq, start, dur) || tq >= start + dur - EPS) return { l: 0, r: 0, bob: 0 };
  const s = poseIndex(tq) % 2 ? 1 : -1;
  return { l: swing * s, r: -swing * s, bob: 0.04 * (poseIndex(tq) % 2) };
}
/** swing(tq, keys) -> value from [[t, value, ease?]...] keyed poses (holds before/after; segments eased). */
export function keyed(tq, keys) {
  if (tq <= keys[0][0]) return keys[0][1];
  for (let k = 1; k < keys.length; k++) {
    const [t1, v1, e] = keys[k], [t0, v0] = keys[k - 1];
    if (tq < t1) { const u = prog(tq, t0, t1 - t0, e ?? "inOutQuad"); return Array.isArray(v0) ? v0.map((v, j) => lerp(v, v1[j], u)) : lerp(v0, v1, u); }
  }
  return keys[keys.length - 1][1];
}

// ------------------------------------------------------------------ replacement animation
/** swapIndex(tq, start, n, hold) -> -1 before start, then 0..n-1 (each piece held `hold` poses; last one stays). */
export function swapIndex(tq, start, n, hold = TU.swapHold) {
  if (tq < start - EPS) return -1;
  return Math.min(n - 1, Math.floor(((tq - start) * POSE_FPS) / hold + EPS));
}
/** swapTimes(start, n, hold) -> the instants each replacement piece first appears (pose-aligned when start is). */
export const swapTimes = (start, n, hold = TU.swapHold) => Array.from({ length: n }, (_, k) => poseCeil(start) + (k * hold) / POSE_FPS);

// ------------------------------------------------------------------ marker writing
/** strokeCount(text) -> number of marker strokes the stroke font uses for text. */
export const strokeCount = (text) => layoutStrokeText(text, 1, { letterSpacing: LT.letterSpacing, lineHeight: LT.lineHeight }).chars.reduce((s, c) => s + c.strokes.length, 0);
/** writePlan(text, start, strokeDur) -> { text, start, strokeDur, n, end } */
export function writePlan(text, start, strokeDur = LT.strokeDur) {
  const n = strokeCount(text);
  return { text, start, strokeDur, n, end: start + n * strokeDur };
}
/** inked(tq, plan) -> strokes drawn so far (fractional: the last one partially). */
export const inked = (tq, plan) => clamp((tq - plan.start) / plan.strokeDur, 0, plan.n);
/** writeSounds(plan) -> [{ t, strokes }] one entry per POSE that adds ink (one squeak each, length ~ one pose). */
export function writeSounds(plan) {
  const out = [];
  for (const t of poseTimes(poseCeil(plan.start + EPS), plan.end + 1 / POSE_FPS)) {
    const a = inked(t - 1 / POSE_FPS, plan), b = inked(t, plan);
    if (b > a + 1e-3) out.push({ t, strokes: b - a });
  }
  return out;
}
