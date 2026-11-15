// styles/spotlight-stage/cues.js — pure stagecraft motion (no THREE, no window, no DOM). Every function is
// f(t, ...) -> plain numbers, so scene.config.js can import the same cues to time the SCORE (a slide's
// arrival clack, a drop's landing thud) and render-sfx / export-spec still run in Node.
// Imports only kit/time.js and the plain-data spec.
import { clamp, lerp, ease, toEase, spring } from "../../kit/time.js";
import { STYLE_SPEC } from "./spec.js";

const M = STYLE_SPEC.motion_tuning;
const S = STYLE_SPEC.spots;

/**
 * curtain(t, openAt, closeAt = Infinity, { openDur, closeDur, openEase, closeEase, closeTo = 0 }) -> open amount 0..1
 * 0 before openAt, eased to 1 over openDur; from closeAt eased back to `closeTo` over closeDur.
 */
export function curtain(t, openAt, closeAt = Infinity, o = {}) {
  const { openDur = M.curtain.openDur, closeDur = M.curtain.closeDur, openEase = M.curtain.openEase, closeEase = M.curtain.closeEase, closeTo = 0 } = o;
  const up = toEase(openEase)(clamp((t - openAt) / openDur));
  if (t < closeAt) return up;
  return lerp(up, closeTo, toEase(closeEase)(clamp((t - closeAt) / closeDur)));
}

/**
 * slide(t, start, from, to, { dur, ease, wobble:{amp,freq,decay} }) -> { x, rot, arrived, arriveAt }
 * A flat on a floor track: eased travel from -> to, a lean into the travel, then a damped rock on its foot
 * (rot = rotation.z about the bottom edge). Before start it holds `from`.
 */
export function slide(t, start, from, to, o = {}) {
  const { dur = M.slideDur, ease: e = M.slideEase, wobble: W = M.wobble } = o;
  const u = clamp((t - start) / dur);
  const x = lerp(from, to, toEase(e)(u));
  const dir = Math.sign(to - from) || 1;
  const end = start + dur;
  let rot = -dir * 0.03 * Math.sin(Math.PI * u) * (t > start ? 1 : 0); // lean into the travel (top trails)
  if (t > end) rot += dir * W.amp * Math.sin(W.freq * (t - end)) * Math.exp(-W.decay * (t - end));
  return { x, rot, arrived: t >= end, arriveAt: end };
}

/**
 * drop(t, start, { from = 7, to = 0, dur, out = null, outDur = .6 }) -> { y, swing, landAt, visible }
 * Lowered from the flies on wires: a springy stop (the lines stretch), pendulum swing that decays, and an
 * optional fly-out at `out` (inCubic back up to `from`). `y` is the hang point height (the scene adds it).
 */
export function drop(t, start, o = {}) {
  const D = M.drop;
  const { from = 7, to = 0, out = null, outDur = 0.6, stiffness = 70, damping = 10 } = o;
  const k = t <= start ? 0 : spring(t - start, { stiffness, damping });
  let y = lerp(from, to, k);
  const u = t - start;
  let swing = u > 0 ? D.swing * Math.sin(D.freq * u) * Math.exp(-D.decay * u) : 0;
  if (out != null && t > out) {
    const v = toEase("inCubic")(clamp((t - out) / outDur));
    y = lerp(y, from, v);
    swing += 0.02 * Math.sin(Math.PI * v);
  }
  // first time it is within 2 cm of its mark (for the landing thud)
  const landAt = start + 0.38 * Math.sqrt(70 / stiffness);
  return { y, swing, landAt, visible: t > start - 1e-6 && (out == null || t < out + outDur) };
}

/**
 * snap(t, at, { off = null, offDur = .25 }) -> spot level (0 = dark, 1 = full)
 * A follow-spot striking: a 2-frame stutter, a brief over-bright "thunk", settle; optional fade-out.
 */
export function snap(t, at, o = {}) {
  const { off = null, offDur = 0.25, level = 1 } = o;
  if (t < at) return 0;
  const u = t - at;
  let L = u < 1 / 30 ? 0.45 : u < 2 / 30 ? 0.2 : 1 + S.snapOvershoot * Math.exp(-S.snapDecay * (u - 2 / 30));
  if (off != null && t >= off) L *= 1 - ease.inOutSine(clamp((t - off) / offDur));
  return L * level;
}

/**
 * aim(t, keys, { stiffness = 85, damping = 13 }) -> [x, y, z]
 * Follow-spot operator: keys = [{ t, p: [x,y,z] }]. From each key's t the aim swings (damped spring, a
 * small overshoot) from wherever the previous swing had got to toward its p. Pure, closed form.
 */
export function aim(t, keys, o = {}) {
  const { stiffness = 85, damping = 13 } = o;
  let cur = keys[0].p.slice();
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t <= k.t) break;
    const next = keys[i + 1];
    const tEnd = next && t > next.t ? next.t : t; // position at the moment the next swing starts
    const s = spring(tEnd - k.t, { stiffness: k.stiffness ?? stiffness, damping: k.damping ?? damping });
    cur = cur.map((c, j) => lerp(c, k.p[j], s));
  }
  return cur;
}

/** popIn(t, at, dur = .35) -> scale 0..~1.1..1 (outBack) for bubbles / props that pop up. */
export const popIn = (t, at, dur = 0.35) => (t <= at ? 0 : ease.outBack(clamp((t - at) / dur)));

/** popOut(t, at, dur = .22) -> 1..0 (inBack shrink). */
export const popOut = (t, at, dur = 0.22) => (t <= at ? 1 : 1 - ease.inBack(clamp((t - at) / dur)));
