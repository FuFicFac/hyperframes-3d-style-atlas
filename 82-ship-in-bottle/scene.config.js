// scene.config.js — 82-ship-in-bottle: "Fold it. Fit it. Unfold it." (style "ship-in-bottle").
// Plain data + the style's pure rigging planner. No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). The plan proves the clearance here (createPlan throws if the folded bundle does
// not fit the neck or the raised ship does not fit the glass), and every sound in SCORE comes from the same plan.
// World: bottle axis = X at y = 1.12, base at x = -2.3, mouth at x = 2.85; the ship is built outside on the right.
import { STYLE_SPEC as S } from "./_atlas/styles/ship-in-bottle/spec.js";
import { createPlan, rigVoices, panOf } from "./_atlas/styles/ship-in-bottle/rigging.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "82-ship-in-bottle";
export const STYLE = "ship-in-bottle";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

const T = S.timing;
// ---------------------------------------------------------------- beats (taken from the style's timing block)
export const BEATS = [
  { id: "fold", t: 0, dur: T.slide[0], label: "Fold it flat" },
  { id: "fit", t: T.slide[0], dur: T.wireOut[1] - T.slide[0], label: "Fit it through the neck" },
  { id: "pull", t: T.wireOut[1], dur: T.cut - T.wireOut[1], label: "Pull one thread" },
  { id: "cork", t: T.cut, dur: DURATION - T.cut, label: "Same ship. Small doorway." },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.15 : 0.25), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.45 : Infinity }));

// ---------------------------------------------------------------- the one plan
export const PLAN = createPlan({ spec: S, end: DURATION });

// ---------------------------------------------------------------- camera: one move per beat, locked holds
const FOV = S.camera.fov;
const WIN = { x0: -0.95, x1: 0.95, y0: -0.92, y1: 0.64 };           // the caption plate owns the top band
const BOTTLE = [[-2.32, 0.12, -1.0], [3.0, 2.14, 1.0]];
const shot = (box, az, el, o = {}) => {
  const k = fitShot({ box }, { azimuth: az, elevation: el, fov: FOV, window: WIN, fill: 1, ...o });
  return { pos: k.pos, target: k.target, fov: FOV };
};
const BUILD = shot([[2.2, 0.8, -0.4], [6.2, 2.42, 0.4]], 0.26, 0.2);          // the ship on the slip, the mouth at the left
const WIDE = shot(BOTTLE, -0.1, 0.2);                                          // the whole bottle
const CLOSE = shot([[-2.1, 0.42, -0.5], [1.9, 2.14, 0.5]], 0.2, 0.12);         // low and near: the masts come up
const FINAL = shot([[-2.32, 0.12, -1.0], [3.2, 2.14, 1.0]], 0.14, 0.22);       // bottle + cork
export const CAMERA = [
  { t: 0, ...BUILD },
  { t: T.slide[0] - 0.1, ...BUILD },
  { t: T.slide[1] - 0.1, ...WIDE, ease: "inOutSine" },                         // travels with the ship into the bottle
  { t: T.wireOut[0], ...WIDE },
  { t: T.pull[0][0] + 0.5, ...CLOSE, ease: "inOutSine", path: "arc" },
  { t: T.cut - 0.1, ...CLOSE },
  { t: T.cork[1] + 0.5, ...FINAL, ease: "inOutSine", path: "arc" },
  { t: DURATION, ...FINAL },
];

// ---------------------------------------------------------------- framing gate
const shipBox = (t) => { const p = PLAN.pose(t); return [[p.x - 1.4, p.y, -0.3], [p.x + 1.5, p.y + 0.3, 0.3]]; };
export const FRAMING = framingReport([
  { id: "ship-build", box: [[3.1, 0.9, -0.3], [6.0, 2.36, 0.3]], from: 0, to: T.slide[0] - 0.1, required: true },
  { id: "ship-travel", pts: (t) => { const b = shipBox(t); return [b[0], b[1], [b[0][0], b[1][1], 0], [b[1][0], b[0][1], 0]]; }, from: T.slide[0], to: T.lower[1], required: true },
  { id: "bottle", box: [[-2.3, 0.2, -0.9], [2.85, 2.1, 0.9]], from: T.slide[1], to: T.wireOut[0], required: true },
  { id: "ship-inside", box: [[-1.95, 0.5, -0.4], [1.0, 2.02, 0.4]], from: T.wireOut[0], to: DURATION, required: true },
  { id: "bottle-end", box: [[-2.3, 0.2, -0.9], [3.1, 2.1, 0.9]], from: T.cork[1] + 0.5, to: DURATION, required: true },
], CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, window: { x0: -0.97, x1: 0.97, y0: -0.97, y1: 0.7 } });
if (!FRAMING.ok && !globalThis.process?.env?.SIB_NOGATE) {
  throw new Error(`82-ship-in-bottle framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, rigVoices(S.sound), { seedBase: 182, pan: panOf(S) });
export const DUCK = [];
const C = PLAN.clearance;
export const NOTES = {
  mechanism: "rigging.js: each mast is a hinge raised by its own stay; stay length shortened ci -> hinge angle by the law of cosines; stays carry the slack of the masts before them, so ONE pull raises fore, main, mizzen in turn. Folding = the same plan backwards.",
  clearance: `folded bundle radius ${C.bundleR.toFixed(3)} m vs neck ${C.neckR.toFixed(3)} m (gap ${C.neckGap.toFixed(3)}); route gap ${C.pathGap.toFixed(3)}; raised ship to glass ${C.raisedGap.toFixed(3)} (asserted in Node, margin ${C.margin})`,
  thread: `total pull ${PLAN.total.toFixed(3)} m = ${PLAN.masts.map((m) => `${m.id} ${m.delta.toFixed(3)}`).join(" + ")}`,
  framing: FRAMING.ok ? "ok" : "FAILS",
  numbers: "no data shown; toy scale (the bottle is 5.15 m long)",
};
