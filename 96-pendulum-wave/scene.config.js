// scene.config.js — 96-pendulum-wave: "How a model knows word order" (positional encoding) told by a pendulum wave
// (style "pendulum-wave"). Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). Every angle, trail, lamp flash, freeze-frame and note comes from the one PLAN.
// World: the row runs along X (longest pendulum at -X), balls swing along Z, released from the +Z side by a plank.
import { STYLE_SPEC as S } from "./_atlas/styles/pendulum-wave/spec.js";
import { createPlan, waveVoices, panOf } from "./_atlas/styles/pendulum-wave/wave.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "96-pendulum-wave";
export const STYLE = "pendulum-wave";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "release", t: 0, dur: 2.8, label: "Released together" },
  { id: "drift", t: 2.8, dur: 3.4, label: "Each has its own rhythm" },
  { id: "freeze", t: 6.2, dur: 3.6, label: "Every moment: a new pattern" },
  { id: "words", t: 9.8, dur: 2.5, label: "How AI tags word order" },
  { id: "line", t: 12.3, dur: 2.7, label: "And back in one line" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.15), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the one plan
// release: the plank drops; two freeze-frames (the clock ramps to 0, holds, ramps back); catchAt: the cycle completes.
export const TIMING = {
  release: 0.5,
  freezes: [{ slow: 6.75, stop: 7.0, go: 7.9, full: 8.1 }, { slow: 8.6, stop: 8.85, go: 9.65, full: 9.85 }],
  catchAt: 13.0,
};
export const PLAN = createPlan({ rig: S.rig, timing: TIMING, end: DURATION });
export const CARDS = {
  titles: (t) => (t < B.words.t ? ["moment A", "moment B"] : ["word 1", "word 2"]),
  alpha: { off: B.line.t - 0.35, dur: 0.3 },
};

// ---------------------------------------------------------------- camera: one move per beat, locked holds
const FOV = S.camera.fov;
const WIN = { x0: -0.94, x1: 0.94, y0: -0.94, y1: 0.62 };               // the caption plate owns the top band
const CARD_WIN = { x0: -0.9, x1: 0.9, y0: -0.4, y1: 0.62 };             // freeze cards own the bottom corners
const ROW = [[-3.75, 0.28, -0.85], [3.75, 1.3, 0.85]];                   // the balls and their swing
const shot = (box, az, el, o = {}) => {
  const k = fitShot({ box }, { azimuth: az, elevation: el, fov: FOV, window: WIN, fill: 1, ...o });
  return { pos: k.pos, target: k.target, fov: FOV };
};
const OPEN = shot([[-3.75, 0.0, -0.85], [3.75, 2.6, 0.9]], -0.5, 0.2);       // front-left 3/4: row, strings, plank
const OPEN2 = shot([[-3.75, 0.0, -0.85], [3.75, 2.3, 0.9]], -0.42, 0.18);    // a slow push while they drift apart
const TELE = 20;                                                          // end-on telephoto: near and far balls read alike
const END = shot([[-3.75, 0.25, -0.85], [3.75, 1.2, 0.85]], -1.5, 0.3, { fov: TELE });   // from the long end: the snake
END.fov = TELE;
const TOP = shot(ROW, 0, 0.95, { window: CARD_WIN });                     // high front: the frozen patterns
const TOP2 = shot(ROW, 0.18, 0.78, { window: CARD_WIN });
const FINAL = shot([[-3.75, 0.25, -0.2], [3.75, 1.45, 0.9]], 0.62, 0.16);   // low front-right on the caught line
const FINAL2 = shot([[-3.75, 0.25, -0.2], [3.75, 1.45, 0.9]], 0.56, 0.15, { fill: 1.06 });
export const CAMERA = [
  { t: 0, ...OPEN },
  { t: B.drift.t - 0.3, ...OPEN2, ease: "inOutSine" },
  { t: B.drift.t + 0.9, ...END, ease: "inOutSine", path: "arc" },
  { t: B.freeze.t - 0.2, ...END },
  { t: TIMING.freezes[0].stop - 0.1, ...TOP, ease: "inOutSine", path: "arc" },
  { t: B.words.t + 0.1, ...TOP },
  { t: B.line.t - 0.2, ...TOP2, ease: "inOutSine" },
  { t: TIMING.catchAt - 0.1, ...FINAL, ease: "inOutSine", path: "arc" },
  { t: DURATION, ...FINAL2, ease: "outSine" },
];

// ---------------------------------------------------------------- framing gate: the row stays in frame in every held shot
export const FRAMING = framingReport([
  { id: "row-open", box: ROW, from: 0, to: B.drift.t - 0.3, required: true },
  { id: "row-end", box: ROW, from: B.drift.t + 0.9, to: B.freeze.t - 0.2, required: true },
  { id: "row-top", box: ROW, from: TIMING.freezes[0].stop - 0.1, to: B.words.t + 0.1, required: true },
  { id: "row-final", box: [[-3.75, 0.3, 0.4], [3.75, 0.75, 0.85]], from: TIMING.catchAt - 0.1, to: DURATION, required: true },
], CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, window: { x0: -0.97, x1: 0.97, y0: -0.97, y1: 0.66 } });

if (!FRAMING.ok && !globalThis.process?.env?.PW_NOGATE) {
  throw new Error(`96-pendulum-wave framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events (one bar note per centre crossing)
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, waveVoices(S.sound), { seedBase: 196, pan: panOf(S.rig) });
export const DUCK = [];
export const NOTES = {
  mechanism: "wave.js: pendulum k makes (16 + k) swings per cycle; angle = A_k cos(2 pi (16 + k) tau / T); L_k ~ 1 / (16 + k)^2; tau(t) = planned clock (freezes); T = tau(catchAt), so all 15 are back on the plank at 13.0 s.",
  plan: `T = ${PLAN.T.toFixed(2)} s of clock, ${EVENTS.filter((e) => e.kind === "tick").length} centre crossings (one note + lamp flash each), lengths ${PLAN.balls[PLAN.n - 1].L.toFixed(2)}..${PLAN.balls[0].L.toFixed(2)} m`,
  framing: FRAMING.ok ? "ok" : `FAILS ${JSON.stringify(FRAMING.spans.slice(0, 4))}`,
  numbers: "no data shown; the fingerprint cards plot the frozen ball displacements from the plan",
};
