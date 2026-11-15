// scene.config.js — 64-impasto: a night landscape painted stroke by stroke in thick oil (style "impasto").
// Plain data + the style's pure stroke planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every brush sound, lift plop and beat accent in SCORE comes from the same stroke schedule the
// picture reads. Composition is our own (moon upper right, double swirl, cypress left, village on the hill foot) — the
// post-impressionist METHOD (strokes following a swirling field), not any specific painting.
// Canvas coords: x right, y up (metres); world X = x - W/2, Z = H/2 - y, canvas top at y = S.canvas.y.
import { STYLE_SPEC as S } from "./_atlas/styles/impasto/spec.js";
import { createPlan, impastoVoices } from "./_atlas/styles/impasto/strokes.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "64-impasto";
export const STYLE = "impasto";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "moon", t: 0, dur: 3.0, label: "Load the brush" },
  { id: "sky", t: 3.0, dur: 3.2, label: "Follow the swirl" },
  { id: "land", t: 6.2, dur: 2.9, label: "Hills, cypress, village" },
  { id: "relief", t: 9.1, dur: 2.9, label: "A landscape of paint" },
  { id: "flow", t: 12.0, dur: 3.0, label: "Now the sky flows" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.35 : Infinity }));

// ---------------------------------------------------------------- composition (normalised u = x/W, v = y/H unless noted)
const W = S.canvas.w, H = S.canvas.h;
export const COMP = {
  horizon: [0.42, 0.045, 0.025],            // far-hill crest: v = a + b sin(2.1u + .5) + c sin(5.3u + 1.2)
  near: [0.21, 0.05, 0.015],                // near-hill line (fields below)
  cypress: { x: 0.15, sway: 0.03, top: 0.9, hw: 0.3 },        // hw in metres
  moon: { x: 0.82, y: 0.78, r: 0.13, halo: 0.44, rings: [0.04, 0.1, 0.16, 0.22, 0.28, 0.34, 0.4] },   // r/halo/rings in metres
  star: { r: 0.06, halo: 0.2, rings: [0.035, 0.09, 0.15] },
  stars: [[0.33, 0.88, 1], [0.47, 0.93, 0.8], [0.62, 0.62, 0.9], [0.68, 0.92, 0.8], [0.4, 0.66, 0.85], [0.95, 0.55, 0.8], [0.26, 0.62, 0.7]],
  vortices: [{ x: 0.52, y: 0.74, R: 0.62, s: 2.6 }, { x: 0.31, y: 0.8, R: 0.36, s: -1.8 }],   // R in metres, s = strength (+ ccw)
  wind: 1,
  bandPitch: 0.13,
  village: { u0: 0.42, u1: 0.8, v0: 0.01, v1: 0.085 },
  palette: {
    moonCore: ["#f7d64a", "#fbe78a", "#f4c232", "#fff1b0"],
    moonRing: ["#f0a536", "#f6d55a", "#e98f2a", "#f9e07a"],
    moonHalo: ["#e9e08a", "#b9d4e4", "#f2e6a0", "#d8e6c8", "#f6d55a"],
    starCore: ["#fff6cc", "#f8e27a", "#ffffff"],
    starHalo: ["#efe08a", "#c3dcec", "#f7f0c8", "#9fc3e6"],
    skyLight: ["#9cc3e6", "#cfe1ef", "#e9d87a", "#7fb0e0", "#bcd6ea"],
    skyMid: ["#3f6cc0", "#2f58ad", "#5b8bd0", "#4a7ac8", "#2c4aa0"],
    skyDeep: ["#2a4597", "#34559f", "#2c4aa0", "#3f6cc0"],
    cypress: ["#1f4a39", "#173a2b", "#26395f", "#2f6a48", "#3c7d4f"],
    hills: ["#3a5296", "#4a68a8", "#33467e", "#3d7a78", "#5b78b8", "#2e6e6a"],
    wall: ["#ebdfb6", "#dcbc6a", "#f0e6c8"],
    roof: ["#2e4580", "#3b5596"],
    window: ["#f39a2b", "#ffcf4a"],
    fields: ["#3f8a52", "#6a9a3e", "#a9b545", "#2f7d5b", "#5b9a4a"],
    fieldsLow: ["#d7b03a", "#c98a2e", "#a9b545", "#e3c14a", "#6a9a3e", "#e88a2a"],
  },
};
export const SIZE = {
  cell: 0.115, cypressCell: 0.085, villageCell: 0.06, moonPitch: 0.12, starPitch: 0.1,
  sky: { L: 0.36, W: 0.105, H: 0.013 }, moon: { L: 0.2, W: 0.08, H: 0.016 }, star: { L: 0.16, W: 0.068, H: 0.016 },
  hills: { L: 0.32, W: 0.1, H: 0.013 }, fields: { L: 0.34, W: 0.105, H: 0.014 }, village: { L: 0.12, W: 0.055, H: 0.016 },
  cypress: { L: 0.3, W: 0.09, H: 0.02 },
};
// painting order: lead = first strokes at a fixed readable gap; pace < 1 = the rest accelerates into a time-lapse
export const SCHEDULE = [
  { id: "moon", groups: ["moon", "stars"], t0: B.moon.t + 0.06, t1: B.sky.t + 0.2, dur: [0.42, 0.16], lead: [3, 0.22], pace: 0.7 },
  { id: "sky", groups: ["sky"], t0: B.sky.t - 0.35, t1: B.land.t + 0.15, dur: [0.3, 0.13], lead: [2, 0.16], pace: 0.85 },
  { id: "land", groups: ["hills", "village", "fields", "cypress"], t0: B.land.t, t1: B.relief.t + 0.2, dur: [0.28, 0.14], lead: [2, 0.14], pace: 0.9 },
];
export const FLOW = { t0: B.flow.t, t1: DURATION, ramp: 1.2, speed: { sky: 0.085, moon: 0.075, star: 0.085, hills: 0.03, fields: 0.035, village: 0, cypress: 0 } };
export const PLAN = createPlan({
  W, H, seed: 64, comp: COMP, size: SIZE, schedule: SCHEDULE, flow: FLOW,
  under: { w: 240, h: 135, reach: 1.05, delay: 0.45, dilate: 4, dilateLag: 0.25 },
});

// ---------------------------------------------------------------- raking light keys (elev above canvas, az: 0 = from +X)
export const RAKE = [
  { t: 0, elev: 0.62, az: 2.4, intensity: 1 },
  { t: B.relief.t, elev: 0.62, az: 2.4, intensity: 1 },
  { t: B.relief.t + 1.1, elev: 0.2, az: 2.0, intensity: 1.9 },
  { t: B.flow.t - 0.1, elev: 0.22, az: 0.95, intensity: 1.9 },
  { t: B.flow.t + 1.6, elev: 0.62, az: 0.8, intensity: 1 },
  { t: DURATION, elev: 0.62, az: 0.8, intensity: 1 },
];

// ---------------------------------------------------------------- camera
const Y = S.canvas.y;
const box = (x0, x1, y0, y1) => ({ box: [[x0 - W / 2, Y, H / 2 - y1], [x1 - W / 2, Y + 0.02, H / 2 - y0]] });
const fov = S.camera.fov;
const FULL = { x0: -1, x1: 1, y0: -1, y1: 1 };
const WIDE = fitShot(box(0, W, 0, H), { elevation: 1.2, fov, window: FULL, fill: 1.04 });
const mx = COMP.moon.x * W, my = COMP.moon.y * H;
const TIGHT = fitShot(box(mx - 0.24, mx + 0.24, my - 0.135, my + 0.135), { elevation: 1.15, fov, window: FULL, fill: 1.0 });
const MOON = fitShot(box(0.42 * W, W, 0.4 * H, H), { elevation: 1.1, fov, window: FULL, fill: 1.0 });
// low and close: from just inside the bottom edge, looking up the canvas across fields, village and hills into the sky
const LOW = { pos: [0.62, Y + 0.3, 1.25], target: [0.46, Y, 0.6] };
const LOW2 = LOW; // held still: the raking light is the only motion (bitrate)
export const CAMERA = [
  { t: 0, pos: TIGHT.pos, target: TIGHT.target, fov },
  { t: 2.4, pos: MOON.pos, target: MOON.target, fov, ease: "inOutSine" },
  { t: 4.4, pos: WIDE.pos, target: WIDE.target, fov, ease: "inOutCubic" },
  { t: B.relief.t, pos: WIDE.pos, target: WIDE.target, fov },
  { t: B.relief.t + 1.5, pos: LOW.pos, target: LOW.target, fov, ease: "inOutSine" },
  { t: B.flow.t - 0.1, pos: LOW2.pos, target: LOW2.target, fov, ease: "linear" },
  { t: B.flow.t + 1.8, pos: WIDE.pos, target: WIDE.target, fov, ease: "inOutSine" },
  { t: DURATION, pos: WIDE.pos, target: WIDE.target, fov },
];
export const FRAMING = framingReport(() => [{ id: "canvasCentre", box: box(0.3 * W, 0.7 * W, 0.3 * H, 0.7 * H).box }], CAMERA, {
  duration: DURATION, drift: S.camera.drift, fov, safe: 1.6,
});

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the stroke schedule's events + a warm bed
export const EVENTS = PLAN.events(S.sound, BEATS);
const SB = S.sound.bed;
export const SCORE = [
  { t: BEATS[0].t, type: "pad", bus: "music", root: SB.root, chord: SB.chord, dur: DURATION, attack: 0.5, release: 1.6, brightness: SB.brightness, gain: SB.gain, seed: 3 },
  ...scoreFromEvents(EVENTS, impastoVoices(S.sound, BEATS), { seedBase: 101 }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "strokes.js: seeded jittered grid + moon/star rings; each stroke = the region field's streamline through its seed point (RK2), bent as a constant-curvature arc; schedule per region group (lead strokes slow, rest accelerating); flow = slide along the stroke's own streamline by v*G(t).",
  strokes: PLAN.n,
  groups: PLAN.groups,
  underpaintUncovered: PLAN.underpaint.uncovered,
  framing: FRAMING.ok ? "ok" : FRAMING.spans.slice(0, 4),
};
