// styles/isometric-pastel/iso.js — the style's pure planning module (no THREE, no window, no DOM).
// Imported by style.js (picture) AND by scene.config.js (camera keys + SCORE), so sound and picture read one plan.
//   - colour: hex <-> rgb, mix, threeTones(base, knobs)  (flat top / left / right face tones from one base colour)
//   - camera: ISO angles, isoKey() (locked true-isometric camera keys: pan + orthographic zoom only)
//   - motion: riseU / dropY (snappy axis moves with slight overshoot), stackPlan() + floorOffset() (stack / explode /
//             close of layered floors) + stackEvents() for the SCORE, loopTimes() for mechanical loops.
// ---------------------------------------------------------------- colour
// ---------------------------------------------------------------- camera (true isometric, locked)
// Elevation atan(1/sqrt 2) = 35.264 deg: the three axes project at exactly 120 deg to each other (true isometric).
// ---------------------------------------------------------------- motion primitives (pure f(t))
import { clamp, ease } from "../../kit/time.js";
// colour + isometric camera helpers: kit/iso.js (promoted, identical code)
export * from "../../kit/iso.js";

export const riseU = (t, start, dur = 0.45, overshoot = 1.4) => (t <= start ? 0 : ease.outBack(clamp((t - start) / dur), overshoot));
/**
 * dropY(t, start, dur, height, { land = .55, bounce = .1 }) -> extra height above rest: falls (inQuad) for `land`·dur,
 * then one small damped hop of `bounce`·height. Contact at start + land·dur (use for the SFX).
 */
export function dropY(t, start, dur, height, { land = 0.55, bounce = 0.1 } = {}) {
  if (t <= start) return height;
  const u = clamp((t - start) / dur);
  if (u < land) { const f = u / land; return height * (1 - f * f); }
  const v = (u - land) / (1 - land);
  return height * bounce * Math.sin(Math.PI * Math.min(v * 1.6, 1)) * (1 - v);
}
/** snap(t, start, dur, overshoot) -> 0..1 with a slight outBack overshoot (explode / close moves). */
export const snap = (t, start, dur = 0.5, overshoot = 1.2) => (t <= start ? 0 : ease.outBack(clamp((t - start) / dur), overshoot));
/** loopTimes(start, end, period, phase = 0) -> [t...]: the ticks of a mechanical loop (for SCORE). */
export const loopTimes = (start, end, period, phase = 0) => {
  const out = [];
  for (let t = start + phase; t < end - 1e-9; t += period) out.push(+t.toFixed(4));
  return out;
};

// ---------------------------------------------------------------- stacked floors
/**
 * stackPlan(floors, { explode, close, pulse }) -> plan
 *   floors: [{ id, height (floor-to-floor, m), enter: "rise"|"drop", at, dur, dropH = 3.5, sink = slab depth for "rise" }]
 *   explode: { at, dur = .55, gap = 1 (extra m between floors) }, close: { at, dur = .45 }, pulse: { at, step = .22 }
 *   plan.rest[i] = base y of floor i when closed; plan.land[i] = contact time; plan.pulseAt[i] = pulse onset.
 */
export function stackPlan(floors, o = {}) {
  const rest = [];
  let y = 0;
  for (const f of floors) { rest.push(+y.toFixed(4)); y += f.height; }
  const land = floors.map((f) => (f.enter === "drop" ? f.at + (f.dur ?? 0.6) * (f.land ?? 0.55) : f.at + (f.dur ?? 0.6) * 0.62));
  const pulse = o.pulse ?? { at: Infinity, step: 0.22 };
  return {
    floors, rest, land, top: y,
    explode: { dur: 0.55, gap: 1, ...o.explode }, close: { dur: 0.45, ...o.close },
    pulseAt: floors.map((_, i) => pulse.at + i * (pulse.step ?? 0.22)),
  };
}
/** floorOffset(t, plan, i) -> { y (base y of floor i), shown (bool) }: entry (rise from below / drop + hop) + explode/close. */
export function floorOffset(t, plan, i) {
  const f = plan.floors[i], dur = f.dur ?? 0.6;
  let y = plan.rest[i];
  const shown = t >= f.at;
  if (f.enter === "drop") y += dropY(t, f.at, dur, f.dropH ?? 3.5, { land: f.land ?? 0.55, bounce: f.bounce ?? 0.06 });
  else y -= (1 - riseU(t, f.at, dur, 1.25)) * (f.sink ?? 1);
  const E = plan.explode, C = plan.close;
  const open = Math.max(0, snap(t, E.at, E.dur, 1.15) - (t > C.at ? ease.inOutCubic(clamp((t - C.at) / C.dur)) : 0));
  return { y: y + i * E.gap * open, shown, open };
}
/** stackEvents(plan) -> [{ t, kind: "rise"|"land"|"explode"|"close"|"pulse", i }] for scoreFromEvents. */
export function stackEvents(plan) {
  const ev = [];
  plan.floors.forEach((f, i) => {
    ev.push({ t: f.at, kind: f.enter === "drop" ? "fall" : "rise", i });
    ev.push({ t: +plan.land[i].toFixed(4), kind: "land", i });
  });
  if (Number.isFinite(plan.explode.at)) ev.push({ t: plan.explode.at, kind: "explode", i: 0 });
  if (Number.isFinite(plan.close.at)) ev.push({ t: +(plan.close.at + plan.close.dur).toFixed(4), kind: "close", i: 0 });
  plan.pulseAt.forEach((t, i) => Number.isFinite(t) && ev.push({ t: +t.toFixed(4), kind: "pulse", i }));
  return ev.sort((a, b) => a.t - b.t);
}
