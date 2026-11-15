// scene.config.js — 68-constructivist-poster: a poster that builds itself with force (style "constructivist-poster").
// Plain data + the style's pure build planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every swish, hit, ratchet tick and servo in SCORE comes from the same PIECES list the picture reads.
// Poster = XY plane facing +Z, centred on the origin, metres; the orthographic frame is 16 x 9 m when flat-on.
import { STYLE_SPEC as S } from "./_atlas/styles/constructivist-poster/spec.js";
import { createPlan, constructVoices } from "./_atlas/styles/constructivist-poster/construct.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "68-constructivist-poster";
export const STYLE = "constructivist-poster";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (every piece time is an offset into one)
export const BEATS = [
  { id: "strike", t: 0, dur: 3.0, label: "Wedge into circle" },
  { id: "bars", t: 3.0, dur: 3.0, label: "Bars slam on the diagonal" },
  { id: "cone", t: 6.0, dur: 3.0, label: "The cone throws the word" },
  { id: "depth", t: 9.0, dur: 3.2, label: "Cut card, real depth" },
  { id: "lock", t: 12.2, dur: 2.8, label: "Built with force" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, dt) => +(B[id].t + dt).toFixed(3);
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.12 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - (b.id === "depth" ? 0.75 : 0.4) : Infinity }));

// ---------------------------------------------------------------- composition (original; neutral copy only)
const RAIL = { from: [-0.3, -4.6], angle: 35 };                 // the heavy bar's centre line; wheels ride its upper edge
const railPt = (s) => [RAIL.from[0] + Math.cos((35 * Math.PI) / 180) * s, RAIL.from[1] + Math.sin((35 * Math.PI) / 180) * s];
const CONE_AT = [-7.0, -2.85];                                  // megaphone narrow end
const MOUTH = [CONE_AT[0] + 3.0 * Math.cos((25 * Math.PI) / 180), CONE_AT[1] + 3.0 * Math.sin((25 * Math.PI) / 180)]; // mouth (3.0 m along 25 deg)
const ray = (a, d) => [MOUTH[0] + Math.cos((a * Math.PI) / 180) * d, MOUTH[1] + Math.sin((a * Math.PI) / 180) * d];

export const LAYOUT = [
  // beat 1 — the circle drops, the wedge drives into it, the grey plane slides under
  { id: "circle", kind: "drop", shape: { type: "disc", r: 2.6 }, material: "white", under: "red", underScale: 1.4, at: [3.6, 0.2], z: 0.85,
    drop: { lift: 3.0, scale: 1.22 }, recoil: { by: "wedge", amp: 0.14, dir: -16 }, dowels: [[0, 0]] },
  { id: "wedge", kind: "slide", shape: { type: "wedge", len: 10.3, width: 2.6 }, material: "red", at: [-7.6, 3.3], angle: -16.06, z: 1.35,
    slide: { dist: 12 }, dowels: [[2.4, 0], [6.6, 0]] },
  { id: "plane", kind: "slide", shape: { type: "bar", len: 9.5, width: 3.0 }, material: "grey", at: [4.1, 0.9], angle: 35, z: 0.25,
    slide: { dist: 12, dir: 215 } },
  // beat 2 — the heavy bar slides up its axis, the short bar slams down across the wedge, two wheels roll and stop dead
  { id: "bar", kind: "slide", shape: { type: "bar", len: 11.6, width: 0.95 }, material: "black", at: railPt(4.6), angle: 35, z: 0.5,
    slide: { dist: 14 }, dowels: [[-3, 0], [3, 0]] },
  { id: "cross", kind: "drop", shape: { type: "bar", len: 3.3, width: 0.85 }, material: "black", at: [-4.35, 2.5], angle: -55, z: 1.0,
    drop: { lift: 3.5, scale: 1.3 } },
  { id: "wheelA", kind: "roll", shape: { type: "wheel", r: 0.42 }, material: "red", at: [0, 0], z: 0.75,
    roll: { rail: RAIL, offset: 0.9, s0: -1.6 } },
  { id: "wheelB", kind: "roll", shape: { type: "wheel", r: 0.42 }, material: "grey", at: [0, 0], z: 0.75,
    roll: { rail: RAIL, offset: 0.9, s0: -2.5 } },
  // beat 3 — the cone swings in on its hinge, throws three rays and two words that grow as they fly, BUILD swings flat
  { id: "handle", kind: "drop", shape: { type: "bar", len: 1.3, width: 0.36 }, material: "black", at: [-6.35, -3.3], angle: -65, z: 0.6,
    drop: { lift: 2.5, scale: 1.2 } },
  { id: "cone", kind: "hinge", shape: { type: "cone", len: 3.0, w0: 0.5, w1: 1.9 }, material: "black", at: CONE_AT, angle: 25, z: 0.9,
    hinge: { x: 0, closed: -82 } },
  { id: "ray1", kind: "ray", shape: { type: "cone", len: 3.4, w0: 0.05, w1: 0.16 }, material: "red", at: ray(8, 0.25), angle: 8, z: 0.55 },
  { id: "ray2", kind: "ray", shape: { type: "cone", len: 3.0, w0: 0.05, w1: 0.16 }, material: "red", at: ray(28, 0.25), angle: 28, z: 0.55 },
  { id: "ray3", kind: "ray", shape: { type: "cone", len: 2.6, w0: 0.05, w1: 0.16 }, material: "red", at: ray(48, 0.25), angle: 48, z: 0.55 },
  { id: "idea", kind: "throw", shape: { type: "word", text: "IDEA", cap: 0.95, color: "black", under: "red" }, at: ray(46, 2.6), angle: 46, z: 1.7,
    throw: { from: MOUTH, scale0: 0.12 } },
  { id: "signal", kind: "throw", shape: { type: "word", text: "SIGNAL", cap: 1.15, color: "red", under: "black" }, at: ray(10, 3.6), angle: 10, z: 1.7,
    throw: { from: MOUTH, scale0: 0.12 } },
  { id: "build", kind: "hinge", shape: { type: "block", text: "BUILD", w: 4.0, h: 1.2, bg: "black", ink: "paper", under: "red" }, material: "black",
    at: [5.3, -3.45], angle: 0, z: 1.1, hinge: { x: -2.0, closed: -84 }, dowels: [[-1.2, 0], [1.2, 0]] },
  // beat 5 — after the snap back, FORWARD stamps down above the circle
  { id: "forward", kind: "drop", shape: { type: "block", text: "FORWARD", w: 3.9, h: 0.95, bg: "red", ink: "paper", under: "black" }, material: "red",
    at: [5.45, 3.45], angle: 0, z: 1.2, drop: { lift: 4.0, scale: 1.35 }, dowels: [[-1.2, 0], [1.2, 0]] },
];

// ---------------------------------------------------------------- the build plan (picture + sound read this)
export const PIECES = [
  { id: "circle", kind: "drop", start: at("strike", 0.0), hit: at("strike", 0.18), weight: 1.1 },
  { id: "wedge", kind: "slide", start: at("strike", 0.2), hit: at("strike", 0.5), weight: 1.5 },
  { id: "plane", kind: "slide", start: at("strike", 1.7), hit: at("strike", 1.98), weight: 0.8 },
  { id: "bar", kind: "slide", start: at("bars", 0.12), hit: at("bars", 0.42), weight: 1.3 },
  { id: "cross", kind: "drop", start: at("bars", 0.78), hit: at("bars", 0.98), weight: 1.2 },
  { id: "wheelA", kind: "roll", start: at("bars", 1.5), hit: at("bars", 2.3), weight: 0.6, roll: { dist: 4.5, r: 0.42, spokes: 4 } },
  { id: "wheelB", kind: "roll", start: at("bars", 1.62), hit: at("bars", 2.48), weight: 0.6, roll: { dist: 4.54, r: 0.42, spokes: 4 } },
  { id: "handle", kind: "drop", start: at("cone", 0.02), hit: at("cone", 0.22), weight: 0.6 },
  { id: "cone", kind: "hinge", start: at("cone", 0.12), hit: at("cone", 0.42), weight: 1.1 },
  { id: "ray1", kind: "ray", start: at("cone", 0.5), hit: at("cone", 0.66), weight: 0.3 },
  { id: "ray2", kind: "ray", start: at("cone", 0.56), hit: at("cone", 0.72), weight: 0.3 },
  { id: "ray3", kind: "ray", start: at("cone", 0.62), hit: at("cone", 0.78), weight: 0.3 },
  { id: "idea", kind: "throw", start: at("cone", 0.82), hit: at("cone", 1.2), weight: 0.6, feel: { power: 0.5, over: 0.05, period: 0.18, decay: 0.08 } },
  { id: "signal", kind: "throw", start: at("cone", 1.3), hit: at("cone", 1.72), weight: 0.6, feel: { power: 0.5, over: 0.05, period: 0.18, decay: 0.08 } },
  { id: "build", kind: "hinge", start: at("cone", 1.95), hit: at("cone", 2.32), weight: 1.1 },
  { id: "forward", kind: "drop", start: at("lock", 0.3), hit: at("lock", 0.52), weight: 1.4 },
];

// ---------------------------------------------------------------- camera: flat-on orthographic, one tilt + snap back
const FLAT = { pos: [0, 0, 30], target: [0, 0, 0], viewHeight: S.camera.viewHeight };
const TILT_AZ = (-42 * Math.PI) / 180, TILT_EL = (26 * Math.PI) / 180;
const TILT = {
  pos: [0.3 + 30 * Math.cos(TILT_EL) * Math.sin(TILT_AZ), 30 * Math.sin(TILT_EL), 0.3 + 30 * Math.cos(TILT_EL) * Math.cos(TILT_AZ)].map((v) => +v.toFixed(4)),
  target: [0.3, 0, 0.3], viewHeight: 8.3,
};
export const CAMS = [
  { id: "tilt", kind: "tilt", t0: at("depth", 0.0), t1: at("depth", 0.85) },
  { id: "snap", kind: "snap", t0: at("depth", 2.55), t1: at("depth", 2.95) },
];
export const CAMERA = [
  { t: 0, ...FLAT },
  { t: CAMS[0].t0, ...FLAT },
  { t: CAMS[0].t1, ...TILT, ease: "outCubic", path: "arc" },
  { t: CAMS[1].t0, ...TILT },
  { t: CAMS[1].t1, ...FLAT, ease: "outBack", path: "arc" },
  { t: DURATION, ...FLAT },
];

export const PLAN = createPlan({ pieces: PIECES, cams: CAMS, feel: S.feel, end: DURATION });
export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, constructVoices(S.sound), { seedBase: 681 });
export const DUCK = [];
export const NOTES = {
  mechanism: "construct.js: strike(t) = u^3 into a dead stop + tiny damped ring; slides along the piece axis, drops toward the board, hinges flat from edge-on, wheels roll s = dist*u^2 with a tick per quarter turn; the camera tilts on an arc to show the card relief and snaps back with outBack.",
  copy: "neutral words only (BUILD, IDEA, SIGNAL, FORWARD); original composition, no symbols or slogans",
  pieces: PIECES.length,
};
