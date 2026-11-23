// scene.config.js — 110-differential-growth: "When room runs out" (style "differential-growth").
// Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The ribbon's shape at every t, the camera gate and every sound cue come from the one PLAN below.
// Set: table top at y = 0, hoop centred on the origin; the simulated 2D curve (x, y) maps to world (x, z).
import { STYLE_SPEC as S } from "./_atlas/styles/differential-growth/spec.js";
import { createGrowthPlan, growthVoices } from "./_atlas/styles/differential-growth/growth.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "110-differential-growth";
export const STYLE = "differential-growth";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard: approved times + labels)
export const BEATS = [
  { id: "ribbon", t: 0, dur: 2.5, label: "A simple ribbon" },
  { id: "grow", t: 2.5, dur: 3, label: "It keeps growing" },
  { id: "buckle", t: 5.5, dur: 3, label: "No room. It buckles." },
  { id: "folds", t: 8.5, dur: 3.5, label: "Folds upon folds" },
  { id: "limit", t: 12, dur: 3, label: "Growth meets its limit" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// one label at a time: in with its beat (the first is up at t = 0), out just before the next one comes in
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: i ? b.t - 0.15 : 0, inDur: i ? 0.15 : 0, off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity, outDur: 0.25 }));

// ---------------------------------------------------------------- the plan (stepped once at load, stored per frame)
const G = S.growth;
export const PLAN = createGrowthPlan({ ...G, fps: FPS, duration: DURATION });
// The simulation is chaotic, so Node (SCORE, render-sfx) and Chrome (picture) must compute it bit-identically.
// growth.js uses only IEEE-exact arithmetic; this recorded hash of every stored frame is checked in BOTH places
// (here and in scene.js). After retuning the growth spec, run the config in Node and record the new value.
export const PLAN_HASH = 161238584;
if (PLAN.hash !== PLAN_HASH && !globalThis.process?.env?.DG_NOHASH) throw new Error(`110-differential-growth: simulation hash ${PLAN.hash} != recorded ${PLAN_HASH}`);
export const TIMES = {
  rise0: 0.08, rise1: 0.9,                   // the ribbon stands up out of the flat ring
  contact: PLAN.contactTime,                 // first touch of the glass (from the simulation)
  sweep0: B.limit.t + 0.75, sweep1: DURATION - 0.25, // a light band runs the whole length: one continuous ribbon
};

// ---------------------------------------------------------------- camera: one move per beat, locked holds
const fov = S.camera.fov;
const Hr = S.hoop.r + S.hoop.wall, Rh = S.ribbon.h;
const hoopBox = { box: [[-Hr, 0, -Hr], [Hr, Rh, Hr]] };
const WIN = { x0: -0.95, x1: 0.95, y0: -0.95, y1: 0.7 }; // keep the hoop below the caption chip
const SHOT = {
  // open close on the ring (the hoop partly cropped), pull back as it swells toward the glass
  open: fitShot({ box: [[-0.62, 0, -0.62], [0.62, Rh, 0.62]] }, { azimuth: 0, elevation: 0.86, fov, window: WIN, fill: 1.0 }),
  ring: fitShot({ box: [[-0.8, 0, -0.8], [0.8, Rh, 0.8]] }, { azimuth: 0.08, elevation: 0.9, fov, window: WIN, fill: 1.0 }),
  glass: fitShot(hoopBox, { azimuth: 0.3, elevation: 1.0, fov, window: WIN, fill: 1.12 }),
  waves: fitShot({ box: [[-0.95, 0, -0.95], [0.95, Rh, 0.95]] }, { azimuth: 0.42, elevation: 1.02, fov, window: { ...WIN, y1: 0.78 }, fill: 1.1 }),
  // ribbon height: just outside the glass, looking across the folds
  low: { pos: [0.78, 0.46, 1.72], target: [-0.1, 0.0, -0.3] },
  // straight overhead; the disc fills the frame height (a little cropped)
  top: { pos: [0, 3.6, 0.02], target: [0, 0, 0] },
};
const key = (t, s, ease) => ({ t, pos: s.pos, target: s.target, fov, ...(ease ? { ease } : {}) });
export const CAMERA = [
  key(0, SHOT.open),
  key(2.6, SHOT.ring, "inOutSine"),
  key(5.4, SHOT.glass, "inOutSine"),
  key(5.6, SHOT.glass),
  key(8.0, SHOT.waves, "inOutSine"),
  key(8.6, SHOT.waves),
  key(11.3, SHOT.low, "inOutSine"),
  key(B.limit.t, SHOT.low),
  key(B.limit.t + 1.4, SHOT.top, "inOutCubic"),
  key(DURATION, SHOT.top),
];

// ---------------------------------------------------------------- framing gate (subject region per beat)
const disc = (r, y = 0) => Array.from({ length: 24 }, (_, i) => [r * Math.cos((i / 24) * 2 * Math.PI), y, r * Math.sin((i / 24) * 2 * Math.PI)]);
export const FRAMING = framingReport([
  { id: "ring", pts: (t) => [...disc(PLAN.radiusAt(t) + 0.03, 0), ...disc(PLAN.radiusAt(t) + 0.03, Rh)], from: 0, to: 4.5, required: true },
  { id: "hoop", pts: [...disc(0.9, 0), ...disc(0.9, Rh)], from: 4.5, to: 8.6, required: true },
  { id: "folds", pts: [[-0.45, 0, -0.65], [0.25, Rh, 0.05], [-0.45, Rh, 0.05], [0.25, 0, -0.65]], from: 8.6, to: B.limit.t, required: true },
  { id: "packed", pts: disc(0.82, Rh), from: B.limit.t + 1.4, to: DURATION, required: true },
], CAMERA, { duration: DURATION, drift: S.camera.drift, fov, safe: 0.95 });
if (!FRAMING.ok && !globalThis.process?.env?.DG_NOGATE) throw new Error(`110-differential-growth framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + beats + a quiet bed
export const EVENTS = [
  ...PLAN.events({ grain: 0.25, tickGap: 0.11 }),
  { kind: "rise", t: TIMES.rise0, dur: TIMES.rise1 - TIMES.rise0 },
  { kind: "settle", t: B.limit.t + 0.15 },
  { kind: "trace", t: TIMES.sweep0, dur: TIMES.sweep1 - TIMES.sweep0 },
].sort((a, b) => a.t - b.t);
const SND = S.sound;
const voices = {
  ...growthVoices(SND),
  rise: (e) => [{ type: "whoosh", dir: "in", dur: e.dur + 0.2, q: 1.3, pitch: 1.3, gain: SND.rise.gain }, { type: "paper", dur: 0.4, fold: true, density: 0.4, gain: SND.rustle.gain * 0.8, offset: e.dur - 0.25 }],
  settle: () => [{ type: "marimba", hz: SND.settle.root, notes: SND.settle.notes, step: 0.08, decay: 0.8, dur: 2.0, mallet: 0.35, gain: SND.settle.gain }],
  trace: (e) => [{ type: "whir", dur: e.dur, hz: 330, hz2: 660, gain: SND.trace.gain }],
};
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: SND.bed.gain, root: SND.bed.root, chord: SND.bed.chord, brightness: SND.bed.brightness, attack: 1.0, release: 1.6 },
  ...scoreFromEvents(EVENTS, voices, { seedBase: 110 }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "growth.js: closed curve, natural length L(t) on a schedule; springs + biharmonic bending + short-range repulsion (radius d(t), scheduled) + circular wall with grip; edges split as they grow; uniform-scale free expansion until first contact. Stepped once at load (8 substeps per video frame), resampled to 4096 fixed material points per frame, blended linearly between frames; every frame and every half-way blend tested for self-crossing (throws).",
  contactTime: PLAN.contactTime,
  planHash: PLAN.hash,
  stats: PLAN.stats,
  foldCount: Object.fromEntries([5, 6, 7, 8.5, 10, 11.5, 13, 15].map((t) => [t, PLAN.foldCount[Math.round(t * FPS)]])),
  foldTicks: EVENTS.filter((e) => e.kind === "fold").length,
  framing: FRAMING.ok ? `ok (worst ${JSON.stringify(FRAMING.worst)})` : "FAILS",
};
