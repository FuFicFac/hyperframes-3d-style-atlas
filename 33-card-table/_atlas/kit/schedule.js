// schedule.js — "scheduled motion -> sound events" (pure, THREE-free, Node-safe). Promoted from marble-run /
// studio-product. The pattern: a pure planner (style's fourth module) precomputes WHEN things happen (impacts,
// flips, cuts, pulses) as plain event objects; renderAt reads the same plan for the picture, and scene.config.js
// turns the events into SCORE with scoreFromEvents — so the sound is exactly on the picture, by construction.
import { clamp, smoothstep } from "./time.js";

/**
 * scoreFromEvents(events, voices, { seedBase = 11, seedStep = 7, pan = (e) => 0 }) -> SCORE entries
 *   events: [{ t, kind, ...anything }]   voices: { [kind]: (e, ctx) => [{ type, gain, pitch, dur, ... }] }
 *   Each returned voice gets t = e.t (unless it sets t / offset), pan = ctx.pan(e) (unless set) and a DISTINCT
 *   seed (seedBase + k x seedStep + j), so same-type events in the same millisecond never sound identical.
 *   ctx = { index, pan, clamp, k(x, lo, hi) }. Unknown kinds are skipped.
 *   e.g. voices.impact = (e) => [{ type: "clack", gain: .4 * Math.sqrt(e.speed / 2.5), pitch: e.surface === "glass" ? 2.1 : .6 }]
 */
export function scoreFromEvents(events, voices, o = {}) {
  const { seedBase = 11, seedStep = 7 } = o;
  const pan = o.pan ?? (() => 0);
  const out = [];
  events.forEach((e, index) => {
    const f = voices[e.kind];
    if (!f) return;
    const list = f(e, { index, pan, clamp, k: (x, lo = 0, hi = 1) => clamp(x, lo, hi) }) ?? [];
    list.forEach((v, j) => {
      const { offset = 0, ...rest } = v;
      out.push({ ...rest, t: (v.t ?? e.t) + offset, pan: v.pan ?? pan(e), seed: v.seed ?? seedBase + index * seedStep + j });
    });
  });
  return out.sort((a, b) => a.t - b.t);
}

/**
 * minSeparation(tracks, t0, t1, dt = 1/120) -> { d, t, i, j }: smallest surface gap between any two moving
 * spheres over [t0, t1] (negative = interpenetration). tracks: [{ id, r, t0?, at(t) -> { p: [x,y,z] } }].
 * A verification helper for planned motion (marbles, packets, particles that must not overlap).
 */
export function minSeparation(tracks, t0, t1, dt = 1 / 120) {
  let worst = { d: Infinity };
  for (let t = t0; t <= t1 + 1e-9; t += dt) {
    const S = tracks.map((p) => (t >= (p.t0 ?? -Infinity) ? p.at(t) : null));
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      if (!S[i] || !S[j]) continue;
      const a = S[i].p, b = S[j].p;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - tracks[i].r - tracks[j].r;
      if (d < worst.d) worst = { d, t, i: tracks[i].id ?? i, j: tracks[j].id ?? j };
    }
  }
  return worst;
}

/**
 * shotKeys(shots) -> camera keys for kit createCameraRig with HARD CUTS between shots (studio-product).
 *   shots: [{ t, dur, from: { pos, target, fov }, to: { pos, target, fov }, ease = "inOutSine", path = "linear"|"arc" }]
 *   Consecutive shots that touch produce two keys at the same t: the rig jumps (a cut). Cuts belong between
 *   scenes/beats, never mid-move; keep each shot >= 2 s.
 */
export function shotKeys(shots) {
  const keys = [];
  for (const s of shots) {
    keys.push({ t: s.t, ...s.from });
    keys.push({ t: s.t + s.dur, ...s.to, ease: s.ease ?? "inOutSine", path: s.path ?? "linear" });
  }
  return keys;
}

/** pulse(t, on, { rise = .12, hold = .25, fall = .9, floor = 0 }) -> 0..1: flares at `on`, settles to `floor`. */
export function pulse(t, on, { rise = 0.12, hold = 0.25, fall = 0.9, floor = 0 } = {}) {
  if (t < on) return 0;
  const up = smoothstep(on, on + rise, t);
  const down = 1 - smoothstep(on + rise + hold, on + rise + hold + fall, t);
  return up * (floor + (1 - floor) * down);
}

/** fadeWindow(t, { on = 0, inDur = 1, off = Infinity, outDur = .8 }) -> 0..1 smooth in, hold, smooth out (open end safe). */
export function fadeWindow(t, { on = 0, inDur = 1, off = Infinity, outDur = 0.8 } = {}) {
  return smoothstep(on, on + inDur, t) * (1 - smoothstep(off, off + outDur, t));
}

/** wavePlan(cols, rows, { origin = [0,0], start = 0, step = .18 }) -> [{ i, j, ring, on }]: Chebyshev-ring ripple onsets. */
export function wavePlan(cols, rows, { origin = [0, 0], start = 0, step = 0.18 } = {}) {
  const out = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const ring = Math.max(Math.abs(i - origin[0]), Math.abs(j - origin[1]));
    out.push({ i, j, ring, on: start + ring * step });
  }
  return out;
}

/** odometerValues(v, digits) -> per-drum values (0..10, fractional) for a mechanical counter: the units drum rolls
 *  continuously; each higher drum carries smoothly only while every lower drum rolls 9 -> 0 (marble-run counter). */
export function odometerValues(v, digits) {
  v = Math.max(0, v);
  const out = [];
  for (let i = 0; i < digits; i++) {
    const place = 10 ** (digits - 1 - i);
    out.push(place === 1 ? v % 10 : (Math.floor(v / place) % 10) + clamp((v % place) - (place - 1)));
  }
  return out;
}
