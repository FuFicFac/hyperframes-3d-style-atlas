// scene.config.js — 57-murmuration: "Simple rules make a shape" (style "murmuration").
// Plain data + the style's pure flock planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every move, density wave and sound cue is derived from BEATS; the wing-rush level comes from the
// same closed-form birds the picture draws (flock.stats).
// World: camera at the eye height of a person in a field, looking toward -Z and slightly up; the flock fills the sky.
import { STYLE_SPEC as S } from "./_atlas/styles/murmuration/spec.js";
import { createFlock, flockVoices } from "./_atlas/styles/murmuration/flock.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, boxCorners, pxRect } from "./_atlas/kit/framing.js";

export const ID = "57-murmuration";
export const STYLE = "murmuration";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "gather", t: 0, dur: 3.4, label: "Thousands of birds" },
  { id: "wave", t: 3.4, dur: 3.4, label: "No leader, just neighbours" },
  { id: "shape", t: 6.8, dur: 5.0, label: "Simple rules make a shape" },
  { id: "letgo", t: 11.8, dur: 3.2, label: "Then it lets go" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.15 : 0.3), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- formations (world metres; flock centre ~ (0, 10.5, 0))
export const FORMS = [
  { id: "stream", kind: "ribbon", path: [[-52, 4, -6], [-41, 6.5, -3], [-31, 5.5, -1], [-22, 8.5, 1], [-15, 10, 1.5]], radius: [2.8, 2.3, 1.5] },
  { id: "ball", kind: "blob", center: [-1, 10.0, 0], radii: [8.8, 4.6, 2.6], wobble: 1.4, seed: 5 },
  { id: "twist", kind: "ribbon", path: [[-15, 8, -2], [-8, 13, 2], [0, 10.5, 0], [8, 7.5, -2], [15, 11.5, 2]], radius: [2.0, 2.8, 1.1, 2.6, 1.6] },
  { id: "arrow", kind: "arrow", center: [0, 10.6, 0], tail: 13, neck: 3.5, tip: 13.5, shaft: 1.55, head: 5.4, depth: 0.9, rot: 0.06, halo: 0.22, soft: 0.6 },
  { id: "ring", kind: "torus", center: [0, 10.1, 0], R: 5.3, r: 1.1, yaw: 0.15, halo: 0.22, soft: 0.6 },
  { id: "away", kind: "ribbon", path: [[-2, 11, 0], [8, 11, -3], [20, 10.5, -10], [34, 10.5, -22], [52, 11, -40]], radius: [3.5, 3, 3.5, 5] },
];
// moves: when each formation starts pouring into the next (from BEATS)
export const MOVES = [
  { to: "ball", t: B.gather.t + 0.1, dur: 1.7, spread: 1.3, dir: [1, 0], bulge: 1.5 },
  { to: "twist", t: B.wave.t + 0.05, dur: 1.6, spread: 0.7, dir: [1, 0.3], bulge: 2.0 },
  { to: "arrow", t: B.shape.t + 0.05, dur: 1.15, spread: 0.55, dir: [1, 0], bulge: 1.4 },
  { to: "ring", t: B.shape.t + 2.55, dur: 1.1, spread: 0.4, dir: [1, 0], bulge: 1.0 },
  { to: "away", t: B.letgo.t + 0.05, dur: 2.2, spread: 1.0, dir: [1, -0.2], bulge: 3.5, bulgeMode: "radial", ease: "inOutQuad" },
];
const centreOf = { ball: [-1, 10.0], twist: [0, 10.5], arrow: [0, 10.6], ring: [0, 10.1] };
const wave = (id, t, form, dir, o) => {
  const l = Math.hypot(dir[0], dir[1]);
  return { id, t, dir, center: (centreOf[form][0] * dir[0] + centreOf[form][1] * dir[1]) / l, ...o };
};
// density waves: dark bands that roll through the flock (times from BEATS)
export const WAVES = [
  wave("w0", B.gather.t + 1.7, "ball", [1, -0.2], { speed: 16, width: 1.6, amp: 0.4, heave: 0.4, extent: 22 }),
  wave("w1", B.wave.t + 0.6, "twist", [1, 0.25], { speed: 19, width: 1.7, amp: 0.5, heave: 0.5, extent: 34 }),
  wave("w2", B.wave.t + 1.9, "twist", [-1, 0.35], { speed: 17, width: 1.7, amp: 0.5, heave: 0.5, extent: 34 }),
  wave("w3", B.shape.t + 1.5, "arrow", [1, 0], { speed: 22, width: 1.4, amp: 0.3, heave: 0.25, extent: 30 }),
  wave("w4", B.shape.t + 3.95, "ring", [0.25, 1], { speed: 13, width: 1.3, amp: 0.3, heave: 0.25, extent: 16 }),
];
// flow amplitude (m): loose while gathering and twisting, tight while a shape holds, wide when it lets go
export const FLOW = [
  [0, 1.1], [2.2, 0.75], [B.wave.t + 0.2, 1.2], [B.shape.t - 0.4, 1.25], [B.shape.t + 1.1, 0.24], [B.shape.t + 2.5, 0.26],
  [B.shape.t + 3.0, 0.6], [B.shape.t + 3.8, 0.24], [B.letgo.t, 0.3], [B.letgo.t + 1.0, 1.3], [DURATION, 1.9],
];
export const BODY = {
  sway: [0.9, 0.45, 0.31, 0.47],
  pivot: [0, 10, 0],
  yaw: [[0, 0.1], [B.wave.t, 0], [B.wave.t + 1.6, 0.42], [B.shape.t - 0.2, -0.1], [B.shape.t + 0.8, 0], [B.letgo.t, 0], [DURATION, -0.25]],
};
export const FLOCK = createFlock(S.flock, S.birds, { forms: FORMS, moves: MOVES, waves: WAVES, flow: FLOW, body: BODY });
export const BIRDS = FLOCK.n;

// ---------------------------------------------------------------- camera: still (the flock is the motion)
export const CAMERA = [
  { t: 0, pos: [0, 1.5, 32], target: [0, 7.5, 0], fov: S.camera.fov },
  { t: DURATION, pos: [0, 1.5, 32], target: [0, 7.5, 0], fov: S.camera.fov },
];

// ---------------------------------------------------------------- framing gate
// Each formed shape (its core, padded for flow + sway) must sit inside the safe window, above the tree line and
// clear of the caption band at the bottom.
const C = S.caption;
const band = { id: "caption", ...pxRect(C.x, C.y, C.w, C.h) };
const mv = (id) => FLOCK.moves.find((m) => m.to === id);
const box = (id) => boxCorners(...FLOCK.formBox(id, 1.2));
function regions(t) {
  const out = [];
  if (t > B.gather.t + 2.6 && t < mv("twist").t) out.push({ id: "ball", pts: box("ball") });
  if (t > mv("arrow").t + 1.8 && t < mv("ring").t) out.push({ id: "arrow", pts: box("arrow") });
  if (t > mv("ring").t + 1.5 && t < mv("away").t) out.push({ id: "ring", pts: box("ring") });
  return out;
}
export const FRAMING = framingReport(regions, CAMERA, {
  duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, safe: 0.9,
  window: { x0: -0.9, x1: 0.9, y0: -0.48, y1: 0.9 }, keepOut: [band],
});
if (!FRAMING.ok && !globalThis.process?.env?.MURM_NOGATE) {
  throw new Error(`57-murmuration framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the flock's events + a soft bed
export const EVENTS = FLOCK.events(S.sound, { t0: 0, t1: DURATION });
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 7, 12, 16, 19], attack: 2.5, release: 2.5, brightness: S.sound.bed.brightness },
  ...scoreFromEvents(EVENTS, flockVoices(S.sound), { seedBase: 211 }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "flock.js: p_i(t) = body(P_0[i] + sum_k (P_k+1[i] - P_k[i]) u_k,i(t) + swirl bulge + A(t) noise flow + personal loop + density-wave compression); heading = finite difference of the same closed form.",
  birds: BIRDS,
  moves: FLOCK.moves.map((m) => ({ from: m.from, to: m.to, first: +m.first.toFixed(3), last: +m.last.toFixed(3) })),
  waves: FLOCK.waves.map((w) => ({ id: w.id, t: w.t, cross: +w.cross.toFixed(3), end: +w.end.toFixed(3) })),
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s, ${FRAMING.worst.id})` : "FAILS",
};
