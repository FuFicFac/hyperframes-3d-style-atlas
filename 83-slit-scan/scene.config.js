// scene.config.js — 83-slit-scan: "Every column is a different moment" (style "slit-scan").
// Plain data + the style's pure time-slice planner. No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). The picture and the SCORE read the same MAP (lag per column per video time).
import { STYLE_SPEC as S } from "./_atlas/styles/slit-scan/spec.js";
import { createTimeMap, createToys, sliceVoices } from "./_atlas/styles/slit-scan/timeslice.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, projectPoint } from "./_atlas/kit/framing.js";

export const ID = "83-slit-scan";
export const STYLE = "slit-scan";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "live", t: 0, dur: 2.4, label: "Rigid toys, steady motion" },
  { id: "scan", t: 2.4, dur: 2.8, label: "Scan it column by column" },
  { id: "map", t: 5.2, dur: 2.4, label: "Left is then, right is now" },
  { id: "dial", t: 7.6, dur: 4.2, label: "Nothing bent. Only time." },
  { id: "fold", t: 11.8, dur: 3.2, label: "One picture, many moments" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.35 : Infinity }));

// ---------------------------------------------------------------- the one plan: lag(t, x)
export const MAP = createTimeMap({
  sweep: { t0: B.scan.t + 0.2, t1: B.scan.t + 2.6 },            // the scan line writes the map: 2.4 s across the frame
  delay: [
    { t: B.dial.t, v: 2.4 },                                     // live map, held
    { t: B.dial.t + 0.95, v: 0, ease: "inOutCubic" },            // dial down: everything snaps straight
    { t: B.dial.t + 1.75, v: 0 },
    { t: B.dial.t + 3.7, v: 4.8, ease: "inOutCubic" },           // dial up: twice the twist
    { t: B.fold.t + 0.2, v: 4.8 },
    { t: B.fold.t + 1.6, v: 2.6, ease: "inOutCubic" },
  ],
  profile: [
    { t: B.fold.t + 0.2, mix: { ramp: 1 } },
    { t: B.fold.t + 1.6, mix: { centre: 1 }, ease: "inOutCubic" }, // fold: now in the middle, the past at both edges
  ],
});
export const TOYS = createToys(S.toys);

// ---------------------------------------------------------------- camera: locked front view
const CAM = { pos: [0, 3.05, 16.9], target: [0, 2.5, 0], fov: S.camera.fov };
export const CAMERA = [{ t: 0, ...CAM }, { t: DURATION, ...CAM }];

const T = S.toys;
const REGIONS = [
  { id: "frame", box: [[-T.postX - 0.2, 0, -0.3], [T.postX + 0.2, T.rod.y + T.rod.amp + T.rod.beadR, 0.3]] },
  { id: "metronomes", box: [[-T.metronome.span / 2 - 0.7, 0, T.metronome.z], [T.metronome.span / 2 + 0.7, 1.5, T.metronome.z + 0.3]] },
];
export const FRAMING = framingReport(() => REGIONS, CAMERA, { duration: DURATION, fov: S.camera.fov, safe: 0.97 });
if (!FRAMING.ok) throw new Error(`83-slit-scan framing: ${JSON.stringify(FRAMING.spans.slice(0, 4))}`);

// screen x (0..1) of each metronome: the column whose world time decides when it ticks
export const SUBJECTS = TOYS.metX().map((x, i) => ({ id: `met${i}`, x: (projectPoint(CAM, [x, T.metronome.pivotY, T.metronome.z + 0.26])[0] + 1) / 2 }));

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a bed
export const EVENTS = MAP.events({ duration: DURATION, subjects: SUBJECTS, toys: TOYS });
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 7, 12, 16], brightness: S.sound.bed.brightness, seed: 5 },
  ...scoreFromEvents(EVENTS, sliceVoices(S.sound), { seedBase: 211 }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "timeslice.js: world time shown at screen x is w(t, x) = t - lag(t, x); sweep lag = max(0, (t - t0) - x D), then lag = delay(t) x profile(t, x). Each frame renders the scene at K+1 world times (scissored strips, two ping-pong targets) and blends neighbours; no frame history.",
  slices: S.slices.count,
  framing: `ok (worst ${JSON.stringify(FRAMING.worst)})`,
  events: EVENTS.reduce((m, e) => ((m[e.kind] = (m[e.kind] ?? 0) + 1), m), {}),
  ruler: "ruler colour = lag of that column (yellow = now, violet = oldest); tick lines every 0.5 s of lag",
};
