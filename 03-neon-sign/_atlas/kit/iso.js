// iso.js — true-isometric camera maths + flat three-tone colour helpers (pure, Node-safe). Promoted from the
// isometric-pastel pilot (identical code).
// styles/isometric-pastel/iso.js — the style's pure planning module (no THREE, no window, no DOM).
// Imported by style.js (picture) AND by scene.config.js (camera keys + SCORE), so sound and picture read one plan.
//   - colour: hex <-> rgb, mix, threeTones(base, knobs)  (flat top / left / right face tones from one base colour)
//   - camera: ISO angles, isoKey() (locked true-isometric camera keys: pan + orthographic zoom only)
//   - motion: riseU / dropY (snappy axis moves with slight overshoot), stackPlan() + floorOffset() (stack / explode /
//             close of layered floors) + stackEvents() for the SCORE, loopTimes() for mechanical loops.
import { clamp, ease } from "./time.js";

// ---------------------------------------------------------------- colour
export const hexToRgb = (h) => {
  const s = h.replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map((c) => c + c).join("") : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
};
export const rgbToHex = (c) => "#" + c.map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, "0")).join("");
/** mixHex(a, b, k) -> hex, straight sRGB mix (illustrator-style tints, not linear light). */
export const mixHex = (a, b, k) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * k)); };

/**
 * threeTones(base, knobs) -> { top, left, right, edge } hex. knobs (spec.tones):
 *   { top: { toward, k }, left: { toward, k }, right: { toward, k }, edge: { toward, k } } — each tone = mix(base, toward, k).
 *   Iso camera at azimuth 45 deg: the +Y face is "top" (lightest), +Z is the LEFT visible face (mid), +X the RIGHT (darkest).
 */
export function threeTones(base, knobs) {
  const t = (q) => (q && q.k ? mixHex(base, q.toward, q.k) : base);
  return { top: t(knobs.top), left: t(knobs.left), right: t(knobs.right), edge: t(knobs.edge) };
}

// ---------------------------------------------------------------- camera (true isometric, locked)
// Elevation atan(1/sqrt 2) = 35.264 deg: the three axes project at exactly 120 deg to each other (true isometric).
export const ISO = { az: Math.PI / 4, el: Math.atan(1 / Math.SQRT2) };
const ISO_DIR = [Math.cos(ISO.el) * Math.sin(ISO.az), Math.sin(ISO.el), Math.cos(ISO.el) * Math.cos(ISO.az)];
export const SCREEN_RIGHT = [Math.SQRT1_2, 0, -Math.SQRT1_2];         // world direction of screen +x
export const SCREEN_UP = [-1 / Math.sqrt(6), 2 / Math.sqrt(6), -1 / Math.sqrt(6)]; // world direction of screen +y
/**
 * isoKey(t, focus [x,y,z], viewHeight, { at = [0,0] (NDC where focus lands), dist = 80, aspect = 16/9, ease }) -> camera key
 *   The camera never rotates: only target (pan) and viewHeight (orthographic zoom) change between keys.
 */
export function isoKey(t, focus, viewHeight, o = {}) {
  const { at = [0, 0], dist = 80, aspect = 16 / 9 } = o;
  const hh = viewHeight / 2, hw = hh * aspect;
  const target = focus.map((v, i) => v - SCREEN_RIGHT[i] * at[0] * hw - SCREEN_UP[i] * at[1] * hh);
  const r = (v) => +v.toFixed(4);
  return { t, pos: target.map((v, i) => r(v + ISO_DIR[i] * dist)), target: target.map(r), viewHeight, ...(o.ease ? { ease: o.ease } : {}) };
}

// ---------------------------------------------------------------- motion primitives (pure f(t))
/** riseU(t, start, dur, overshoot = 1.4) -> 0..~1.05..1: outBack growth, 0 before start (blocks rising out of the ground). */
