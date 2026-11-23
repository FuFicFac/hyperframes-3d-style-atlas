// scene.config.js — 104-chromatography: "What is in the black?" (style "chromatography").
// Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). The picture, the camera gate and every sound cue come from the one PLAN below.
// Set: bench top at y = 0, jar centred on the origin, strip plane at z = 0 facing +Z (toward the camera).
import { STYLE_SPEC as S } from "./_atlas/styles/chromatography/spec.js";
import { createPlan, chromaVoices } from "./_atlas/styles/chromatography/chromaplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "104-chromatography";
export const STYLE = "chromatography";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard: approved times + labels)
export const BEATS = [
  { id: "dot", t: 0, dur: 2.5, label: "One black dot" },
  { id: "climb", t: 2.5, dur: 3, label: "The solvent climbs" },
  { id: "split", t: 5.5, dur: 3.5, label: "The black comes apart" },
  { id: "pace", t: 9, dur: 3, label: "Each colour, its own pace" },
  { id: "parts", t: 12, dur: 3, label: "One spot. Many parts." },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// one label at a time: in with its beat (the first is up at t = 0), out just before the next one comes in
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: i ? b.t - 0.15 : 0, inDur: i ? 0.15 : 0, off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity, outDur: 0.25 }));

// ---------------------------------------------------------------- the plan
const CLIP_DROP = 0.07;      // arm -> strip top
const ARM_DOWN = 1.34;       // arm height once lowered: strip top 1.27, bottom 0.07 (5 cm below the solvent)
const RAISE = 0.4;           // how much higher the strip hangs while it is dotted (bottom clear of the jar)
const SLOT_X = [-2.06, -1.58, -1.1];
const SLOT_TOP = S.rack.y - CLIP_DROP;
export const TIMES = {
  penIn: 0, touch0: 0.5, touch1: 1.0, penOut: 1.7,
  lower0: 1.15, lower1: 2.4, wet: 2.1, meetDot: B.split.t - 0.15,
  rampA: B.split.t - 0.2, rampB: B.split.t + 1.2, stop: B.parts.t + 0.15, liftEnd: B.parts.t + 1.55, hang: B.parts.t + 1.65, end: DURATION,
};
export const PLAN = createPlan({
  strip: S.strip, solventY: S.jar.solventY, ink: S.ink, spread: S.spread, t: TIMES, frontAtStop: 1.0,
  arm: { y0: ARM_DOWN + RAISE, y1: ARM_DOWN }, clipDrop: CLIP_DROP, home: [0, 0],
  slot: { p: [SLOT_X[2], SLOT_TOP, S.rack.z], rise: 0.45 },
  pen: { axis: [0.62, 0.38, 0.69], approach: 0.3, retreat: 0.55 },
});
export const SLOTS = SLOT_X.slice(0, 2).map((x) => ({ x, yTop: SLOT_TOP, z: S.rack.z }));

// ---------------------------------------------------------------- camera: one move per beat, locked holds
const fov = S.camera.fov;
const W2 = S.strip.W / 2;
const at = (u, v, t) => PLAN.worldAt(u, v, t);
const stripBox = (v0, v1, t, u0 = -W2, u1 = W2) => {
  const a = at(u0, v0, t), b = at(u1, v1, t);
  return { box: [[a[0], a[1], -0.02], [b[0], b[1], 0.03]] };
};
const WIN = { x0: -0.7, x1: 0.95, y0: -0.92, y1: 0.92 }; // keep the subject right of the caption chip
const SHOT = {
  dot: fitShot(stripBox(0.02, 0.5, 0), { azimuth: -0.22, elevation: 0.1, fov, window: WIN, fill: 1 }),
  dip: fitShot({ box: [[-S.jar.r, 0, -S.jar.r], [S.jar.r, 0.56, S.jar.r]] }, { azimuth: -0.22, elevation: 0.2, fov, window: WIN, fill: 1 }),
  climb: fitShot(stripBox(0.0, 0.42, B.climb.t + 2), { azimuth: -0.2, elevation: 0.16, fov, window: WIN, fill: 1 }),
  split: fitShot(stripBox(0.17, 0.8, B.split.t + 2), { azimuth: -0.18, elevation: 0.08, fov, window: WIN, fill: 1 }),
  pace: fitShot({ box: [[-0.02, 0.45, -0.02], [S.rule.x + S.rule.w / 2, 1.12, 0.03]] }, { azimuth: -0.32, elevation: 0.05, fov, window: WIN, fill: 1 }),
  rack: fitShot({ box: [[SLOT_X[0] - W2 - 0.05, SLOT_TOP - S.strip.L + 0.36, S.rack.z], [SLOT_X[2] + W2 + 0.05, S.rack.y + 0.06, S.rack.z]] }, { azimuth: 0.06, elevation: 0.04, fov, window: { x0: -0.95, x1: 0.95, y0: -0.97, y1: 0.76 }, fill: 1 }),
};
const key = (t, s, ease) => ({ t, pos: s.pos, target: s.target, fov, ...(ease ? { ease } : {}) });
export const CAMERA = [
  key(0, SHOT.dot),
  key(1.05, SHOT.dot),
  key(2.55, SHOT.dip, "inOutSine"),
  key(3.0, SHOT.dip),
  key(5.0, SHOT.climb, "inOutSine"),
  key(5.6, SHOT.climb),
  key(7.4, SHOT.split, "inOutSine"),
  key(9.0, SHOT.split),
  key(10.3, SHOT.pace, "inOutSine"),
  key(TIMES.stop, SHOT.pace),
  key(TIMES.liftEnd + 0.15, SHOT.rack, "inOutCubic"),
  key(DURATION, SHOT.rack),
];

// ---------------------------------------------------------------- framing gate (subject region per beat)
export const FRAMING = framingReport([
  { id: "dot", pts: (t) => [at(-0.06, 0.2, t), at(0.06, 0.32, t)], from: 0, to: B.split.t, required: true },
  { id: "bands", pts: (t) => { const d = PLAN.dyesAt(t); return [at(-0.08, d[0].v - 0.03, t), at(0.08, d[2].v + 0.03, t)]; }, from: B.split.t, to: B.parts.t, required: true },
  { id: "rack", box: [[SLOT_X[0] - W2, SLOT_TOP - S.strip.L + 0.4, S.rack.z], [SLOT_X[2] + W2, S.rack.y, S.rack.z]], from: 13.8, to: DURATION, required: true },
], CAMERA, { duration: DURATION, drift: S.camera.drift, fov, safe: 0.95 });
if (!FRAMING.ok && !globalThis.process?.env?.CHROMA_NOGATE) throw new Error(`104-chromatography framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a quiet bed
export const EVENTS = PLAN.events();
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: S.sound.bed.chord, brightness: S.sound.bed.brightness, attack: 1.0, release: 1.6 },
  ...scoreFromEvents(EVENTS, chromaVoices(S.sound), { seedBase: 104, pan: (e) => (e.kind === "split" ? { blue: -0.2, magenta: 0, yellow: 0.2 }[e.dye] ?? 0 : 0) }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "chromaplan.js: front = solvent + K*sqrt(process time); process time is a time-lapse clock (1x, then a smoothstep ramp to `rate`x); each dye centre = origin + Rf*(front - origin), width grows linearly with distance, amplitude conserves the amount. Strip shader subtracts light per RGB channel.",
  K: +PLAN.K.toFixed(4), timeLapseRate: +PLAN.rate.toFixed(3),
  separations: PLAN.separations(),
  front: Object.fromEntries([2.5, 4, 5.35, 7, 9, 12.15].map((t) => [t, +PLAN.front(t).toFixed(3)])),
  framing: FRAMING.ok ? `ok (worst ${JSON.stringify(FRAMING.worst)})` : "FAILS",
};
