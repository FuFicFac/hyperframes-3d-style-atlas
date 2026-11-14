// motion.js — pure, seekable motion helpers shared by styles (every function is f(t, ...) -> number;
// no state, no accumulation). Promoted from the low-poly, paper-pop-up and neon-sign pilots.
import { ease, clamp, lerp, spring, toEase, rng, hash01, TAU } from "./time.js";

/** pop(t, start, dur = .5, overshoot = 1.9) -> 0 before start, then outBack 0 -> ~1.1 -> 1 (grow out of the ground). */
export function pop(t, start, dur = 0.5, overshoot = 1.9) {
  if (t <= start) return 0;
  return ease.outBack((t - start) / dur, overshoot);
}

/** hopArc(u, height) -> extra height of a parabolic hop at progress u (0..1); peak = height at u = .5. */
export const hopArc = (u, height) => 4 * height * clamp(u) * (1 - clamp(u));

/**
 * growAll(group, t, start, { spread = 1, dur = .5, overshoot = 1.9 }) — pop every child in, staggered by
 * child.userData.delay (0..1, seeded by the caller) x spread. Scales from child.userData.baseScale
 * (default [1,1,1]) and hides children until they start.
 */
export function growAll(group, t, start, { spread = 1, dur = 0.5, overshoot = 1.9 } = {}) {
  for (const c of group.children) {
    const k = pop(t, start + (c.userData.delay ?? 0) * spread, dur, overshoot);
    const b = c.userData.baseScale ?? [1, 1, 1];
    c.scale.set(b[0] * Math.max(k, 1e-4), b[1] * Math.max(k, 1e-4), b[2] * Math.max(k, 1e-4));
    c.visible = k > 1e-4;
  }
}

/**
 * hinge(t, popAt, foldAt = Infinity, { pop = { stiffness: 170, damping: 16 }, foldDur = .36, foldEase = "inOutCubic" })
 *   -> open amount: 0 before popAt, damped spring to 1 (overshoots) after, then eased back to 0 from foldAt.
 *   Feed it to a hingeGroup's setOpen(u) (shapes.js) or any lerp(closedAngle, openAngle, u).
 */
export function hinge(t, popAt, foldAt = Infinity, { pop: p = { stiffness: 170, damping: 16 }, foldDur = 0.36, foldEase = "inOutCubic" } = {}) {
  if (t < popAt) return 0;
  if (t < foldAt) return spring(t - popAt, p);
  const u0 = spring(foldAt - popAt, p);
  return lerp(u0, 0, toEase(foldEase)(clamp((t - foldAt) / foldDur)));
}

/** stagger(i, step = .13) -> i-th start offset in seconds. */
export const stagger = (i, step = 0.13) => i * step;

// ---------------------------------------------------------------- flicker (seeded switch-on)
export const FLICKER_DEFAULTS = { dur: 0.48, pulses: [4, 7], pulseLen: [0.035, 0.09], pulseLevel: [0.25, 1.15], dark: 0.04, hum: 0.03, humHz: 3.1, offDur: 0.22 };

const schedCache = new Map(); // pure memo: a schedule depends only on (seed, opts)
function schedule(seed, o) {
  const key = `${seed}|${o.dur}|${o.pulses}|${o.pulseLen}|${o.pulseLevel}`;
  let s = schedCache.get(key);
  if (s) return s;
  const r = rng(seed);
  const n = r.int(o.pulses[0], o.pulses[1]);
  s = [];
  const span = o.dur * 0.82;
  for (let i = 0; i < n; i++) {
    const a = ((i + r.range(0, 0.55)) / n) * span;
    s.push({ a, b: a + r.range(o.pulseLen[0], o.pulseLen[1]), l: r.range(o.pulseLevel[0], o.pulseLevel[1]) });
  }
  schedCache.set(key, s);
  return s;
}

/**
 * flicker(t, onTime, seed = 1, opts?) -> level (0 = off, ~1 = steady on)
 *   Before onTime: 0. For `dur` s after onTime: a seeded stutter of pulses, then steady 1, with a
 *   hum shimmer (+-hum: sin(humHz) + per-frame hash at `fps`). Optional switch-off at `off` over `offDur`.
 *   opts: { dur, pulses:[min,max], pulseLen:[min,max], pulseLevel:[min,max], dark, hum, humHz, fps = 30,
 *           off = null, offDur }   defaults = FLICKER_DEFAULTS. Use for neon, CRT, bulbs, LEDs, glitches.
 */
export function flicker(t, onTime, seed = 1, opts = {}) {
  const o = { ...FLICKER_DEFAULTS, fps: 30, off: null, ...opts };
  if (t < onTime) return 0;
  const u = t - onTime;
  let L;
  if (u >= o.dur) L = 1;
  else {
    L = o.dark * (u / o.dur);
    for (const p of schedule(seed, o)) if (u >= p.a && u < p.b) L = p.l;
    const tail = o.dur * 0.82;
    if (u >= tail) L = Math.max(L, 0.55 + 0.45 * ((u - tail) / (o.dur - tail)));
  }
  if (o.off != null && t >= o.off) {
    const v = t - o.off;
    if (v >= o.offDur) return 0;
    const k = Math.floor(v * 60);
    L *= (1 - v / o.offDur) * (hash01(k, seed, 77) < 0.45 ? 0.15 : 1);
  }
  const f = Math.floor(t * o.fps + 1e-6);
  const shimmer = 0.55 * Math.sin(TAU * o.humHz * t + seed * 1.7) + 0.45 * (2 * hash01(f, seed, 13) - 1);
  return L * (1 + o.hum * shimmer);
}

// ---------------------------------------------------------------- promoted 2026-11-13 (pass 2)
/** dropIn(t, start, dur = .8, from = 3) -> { y, started, landed, squash }: outBounce fall from `from` m; a
 *  damped squash wobble after the first contact. (tiny-diorama) */
export function dropIn(t, start, dur = 0.8, from = 3) {
  const u = clamp((t - start) / dur);
  const y = from * (1 - ease.outBounce(u));
  const contact = start + dur / 2.75;
  const squash = t > contact ? 0.12 * Math.exp(-(t - contact) * 7) * Math.cos((t - contact) * 18) : 0;
  return { y, started: t >= start, landed: u >= 1, squash };
}
/** spinAngle(t, start, rate (rad/s), ramp = 1) -> angle of a rotor that spins up linearly over `ramp` s (closed form; fans, wheels, turbines). */
export function spinAngle(t, start, rate, ramp = 1) {
  const u = t - start;
  if (u <= 0) return 0;
  return u < ramp ? (rate * u * u) / (2 * ramp) : rate * (u - ramp / 2);
}
/** onTwos(t, fps = 15) -> t quantised to a pose rate (15 = "on twos" at 30 fps): stop-motion / hand-made jerk.
 *  Feed object motion the quantised time; keep the camera on raw t. (soft-clay) */
export const onTwos = (t, fps = 15) => Math.floor(t * fps + 1e-6) / fps;
/** poseIndex(t, fps = 15) -> integer pose number (seed per-pose boil/jitter with it). */
export const poseIndex = (t, fps = 15) => Math.floor(t * fps + 1e-6);
/** squashScale(sy) -> [sx, sy, sz] volume-preserving squash/stretch (sx = sz = 1/sqrt(sy)). */
export const squashScale = (sy) => [1 / Math.sqrt(Math.max(sy, 0.05)), sy, 1 / Math.sqrt(Math.max(sy, 0.05))];
