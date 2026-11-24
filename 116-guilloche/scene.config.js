// scene.config.js — 116-guilloche: "Two dials, endless lace" — a rose engine engraving a silver dial (style
// "guilloche"). Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). The SAME plan gives the picture and the sound: one rising cutting hiss per ring at the
// times the graver cuts it, a ratchet click per dial step, a pour as the enamel front moves, a bell under the light sweep.
// World: the disc (radius 1 m) lies face-up at the origin, its top DISC_Y above the bench; seen from above, -Z is up.
import { STYLE_SPEC as S } from "./_atlas/styles/guilloche/spec.js";
import { createPlan, fingerprint } from "./_atlas/styles/guilloche/guilloche.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, pxRect } from "./_atlas/kit/framing.js";

export const ID = "116-guilloche";
export const STYLE = "guilloche";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard 116: times + labels verbatim)
export const BEATS = [
  { id: "ring", t: 0, dur: 2.6, label: "One wavy ring" },
  { id: "shift", t: 2.6, dur: 3.0, label: "Shift each ring a little" },
  { id: "weave", t: 5.6, dur: 3.0, label: "The waves weave a rosette" },
  { id: "dial", t: 8.6, dur: 3.2, label: "Turn a dial: new pattern" },
  { id: "rule", t: 11.8, dur: 3.2, label: "Simple rule, rich pattern" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// exactly one label at all times: the current beat's label, swapped AT the beat boundary under a brief dip (alpha >= .4)
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t, off: BEATS[i + 1] ? BEATS[i + 1].t : Infinity }));
export const labelAt = (t) => {
  const L = LABELS.find((l) => t < l.off) ?? LABELS[LABELS.length - 1];
  const d = Math.min(...BEATS.slice(1).map((b) => Math.abs(t - b.t)));
  return { text: L.text, alpha: 0.4 + 0.6 * smooth(0, 0.16, d) };
};
function smooth(a, b, x) { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); }

// ---------------------------------------------------------------- the plan (guilloche.js)
export const DESIGN = { n0: 8, s0: 0.45, n1: 13, s1: 2.4 };
export const PLAN = createPlan({
  fps: FPS, duration: DURATION, phi: S.cutter.phi, rings: S.rings, nGear: DESIGN.n0, s0: DESIGN.s0,
  // apparent disc speed (deg/s): one slow readable turn for ring 0, then calmer; comes to rest before the dials turn
  // (the re-weave reads best on a still dial, and a turning fine pattern is the most expensive thing to encode)
  speed: [[0, 180], [2.2, 180], [2.75, 16], [5.6, 12], [6.6, 8], [B.dial.t - 0.2, 5], [B.dial.t + 0.3, 0]],
  // hidden 1/8-turn steps per frame (strobed time-lapse): 0 = real speed, 4 = half a turn per frame
  gears: [[0, 0], [B.shift.t, 1], [3.4, 2], [4.0, 4], [5.5, 2], [5.85, 1], [6.6, 0]],
  cutStart: 0.35, approach: 0.33, gaps: { 0: 0.3 },
  lift: { hop: 0.4, retractDur: 0.4, swingAt: 6.75, swingDur: 1.0 },
  dials: [
    { id: "n", t0: 9.15, from: DESIGN.n0, to: DESIGN.n1, steps: 5, every: 0.17, dur: 0.12 },
    { id: "s", t0: 10.5, from: DESIGN.s0, to: DESIGN.s1, steps: 6, every: 0.15, dur: 0.12 },
  ],
  enamel: { t0: 12.2, t1: 13.7 },
  sweep: { t0: 13.25, t1: 14.95 },
});
// The plan runs in Node (sound) and in the page (picture); its ring times must agree. Recorded from this code in
// Node and headless Chrome; any other value fails here in BOTH environments instead of shipping picture != sound.
export const PLAN_HASH = "3d8359c6";
export const PLAN_HASH_NOW = fingerprint(PLAN);
if (typeof globalThis.window !== "undefined") globalThis.window.__guillocheHash = PLAN_HASH_NOW;
if (PLAN_HASH_NOW !== PLAN_HASH && !globalThis.process?.env?.GUILLOCHE_RECORD) {
  throw new Error(`116-guilloche: plan hash ${PLAN_HASH_NOW} != recorded ${PLAN_HASH} (${typeof globalThis.window !== "undefined" ? "browser" : "node"})`);
}

// ---------------------------------------------------------------- camera: one move per beat, still holds
const Y = S.disc.top, fov = S.camera.fov;
const WIN = { x0: -0.97, x1: 0.97, y0: -0.97, y1: 0.97 };
const shot = (sub, o) => { const s = fitShot(sub, { fov, window: WIN, ...o }); return { pos: s.pos, target: s.target, fov }; };
const box = (x0, z0, x1, z1, h = 0.02) => ({ box: [[x0, Y, z0], [x1, Y + h, z1]] });
// the head-on hold from beat 4 to the end: the whole dial fills the frame height (the chuck rim just crops), pushed a
// little right so the caption strip (bottom left) stays on the bench, both dials inside the frame on the right. The
// camera does not move again after 9 s: a still frame of a fine pattern is cheap to encode; only the morphs, the enamel
// front and the light bar change pixels.
const HEAD_WIN = { x0: -0.92, x1: 0.62, y0: -0.995, y1: 0.995 };
const HEAD = (() => { const s = fitShot(box(-1, -1, 1, 1, 0.02), { fov, window: HEAD_WIN, elevation: 1.27, azimuth: 0.03, fill: 1.0 }); return { pos: s.pos, target: s.target, fov }; })();
const OPEN = shot(box(-0.36, -0.42, 0.42, 0.34, 0.3), { elevation: 0.92, azimuth: -0.18, fill: 1.0 });
const OPEN2 = shot(box(-0.32, -0.38, 0.38, 0.3, 0.3), { elevation: 0.98, azimuth: -0.12, fill: 1.0 });
const WIDE = shot(box(-0.98, -0.98, 0.98, 0.98), { elevation: 1.08, azimuth: -0.06, fill: 1.0 });
const OBL1 = shot(box(-0.75, -0.2, 0.05, 0.62), { elevation: 0.5, azimuth: -0.55, fill: 1.0 });
const OBL2 = shot(box(-0.72, -0.2, 0.08, 0.62), { elevation: 0.49, azimuth: -0.5, fill: 1.0 });
export const CAMERA = [
  { t: 0, ...OPEN },
  { t: 2.4, ...OPEN2, ease: "inOutSine" },
  { t: B.shift.t + 0.15, ...OPEN2 },
  { t: 5.0, ...WIDE, ease: "inOutCubic" },
  { t: B.weave.t, ...WIDE },
  { t: 6.35, ...OBL1, ease: "inOutCubic" },
  // beat 3 "slow close pass": the camera all but holds (a few cm of creep) and the turning disc carries the grooves
  // past it, so the walls glint; a still camera keeps the encode small
  { t: 8.45, ...OBL2, ease: "inOutSine" },
  { t: 8.95, ...HEAD, ease: "inOutCubic" },
  { t: DURATION, ...HEAD },
];

// ---------------------------------------------------------------- framing gate (camera replay; kit/framing.js)
const dialPts = S.dials.pos.flatMap(([x, z]) => [[x - S.dials.pedestal.r, 0.1, z - S.dials.pedestal.r], [x + S.dials.pedestal.r, 0.1, z + S.dials.pedestal.r], [x - S.dials.pedestal.r, 0.1, z + S.dials.pedestal.r], [x + S.dials.pedestal.r, 0.1, z - S.dials.pedestal.r]]);
export const CAPTION_RECT = pxRect(S.caption.x, S.caption.y, 760, S.caption.h);
export const FRAMING = framingReport((t) => {
  const R = [];
  if (t < B.shift.t) R.push({ id: "ring0", box: [[-0.3, Y, -0.3], [0.3, Y, 0.3]] });
  else if (t < B.weave.t) R.push({ id: "core", box: [[-0.25, Y, -0.25], [0.25, Y, 0.25]] });
  // the hold fills the frame height with the disc (its rim may touch the frame edge); the pattern core and both dials must be inside
  if (t >= 9.0) R.push({ id: "pattern", box: [[-0.9, Y, -0.9], [0.9, Y, 0.9]] }, { id: "dials", pts: dialPts });
  return R;
}, CAMERA, { duration: DURATION, drift: S.camera.drift, fov, window: WIN });
if (!FRAMING.ok && !globalThis.process?.env?.GUILLOCHE_NOGATE) {
  throw new Error(`116-guilloche framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
const SND = S.sound;
const lerp = (a, b, u) => a + (b - a) * u;
const VOICES = {
  touch: () => [{ type: "click", gain: SND.touch.gain, pitch: 1.6 }],
  cut: (e) => [{ type: "penScratch", dur: Math.max(0.075, e.dur), speed: 1.4, gain: lerp(SND.cut.gain[0], SND.cut.gain[1], e.u), pitch: lerp(SND.cut.pitch[0], SND.cut.pitch[1], e.u) }],
  step: () => [{ type: "clack", gain: 0.22, pitch: 1.3 }],
  spinup: (e) => [{ type: "whir", dur: 0.45, hz: 70 + 25 * e.m, hz2: 130 + 50 * e.m, gain: 0.2 }],
  lift: () => [{ type: "clack", gain: 0.25, pitch: 0.9 }],
  ratchet: (e) => [{ type: "clack", gain: SND.ratchet.gain, pitch: e.dial === "n" ? 1.15 + 0.04 * e.i : 0.9 + 0.03 * e.i, dur: 0.09 }],
  pour: (e) => [
    { type: "whoosh", dur: e.dur + 0.3, dir: "in", pitch: 0.42, q: 0.7, gain: SND.pour.gain },
    { type: "rustle", dur: e.dur, density: 0.18, pitch: 0.6, gain: 0.12, offset: 0.15 },
  ],
  bell: () => [{ type: "chime", dur: 2.2, pitch: SND.bell.pitch, gain: SND.bell.gain }],
};
export const EVENTS = PLAN.events;
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: SND.bed.gain, root: SND.bed.root, chord: SND.bed.chord, brightness: SND.bed.brightness, attack: SND.bed.attack, release: SND.bed.release, seed: 7 },
  { t: 0, type: "hum", dur: B.rule.t + 0.6, hz: SND.hum.hz, gain: SND.hum.gain, seed: 9 },
  { t: B.rule.t - 0.1, type: "servo", dur: 0.9, hz: 95, hz2: 40, grit: 0.1, gain: 0.16, seed: 13 },
  ...scoreFromEvents(EVENTS, VOICES, { seedBase: 116, pan: (e) => (e.kind === "ratchet" ? 0.45 : e.kind === "cut" ? 0.25 : 0) }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "guilloche.js: ring k is r(θ) = R_k + a·sin(n·θ + k·s); the disc shader evaluates the nearby rings in closed form per pixel (V-groove normal tilt, union of cuts). Disc angle = apparent rotation + whole 1/8-turn steps per frame (strobed time-lapse).",
  rings: `${PLAN.K} rings, cut ${PLAN.ts[0].toFixed(2)}–${PLAN.cutEnd.toFixed(2)} s`,
  design: `n ${DESIGN.n0} -> ${DESIGN.n1} (5 clicks), s ${DESIGN.s0} -> ${DESIGN.s1} (6 clicks)`,
  planHash: PLAN_HASH_NOW,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s)` : "FAILS",
  captionRect: CAPTION_RECT,
};
