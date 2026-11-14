// scene.config.js — 10-exploded-view: "Inside a robot vacuum" — how it sees and cleans.
// Plain data + the style's pure explode schedule (no THREE, no window): imported by scene.js (browser) and by
// render-sfx / export-spec (Node). Units: metres (robot scaled ×10: 3.5 m across), Y-up, radians, s, sRGB hex.
// Part coordinates are assembly-local: +Y = the robot's up axis (the explode axis); the pivot tilts that axis
// toward screen upper-right so the tall stack lies diagonally across the 16:9 frame.
import { explodePlan, explodeCues } from "./_atlas/styles/exploded-view/explode.js";

export const ID = "10-exploded-view";
export const STYLE = "exploded-view";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "intro", t: 0.0, dur: 2.5 },   // assembled robot turns into the hero three-quarter view; title
  { id: "explode", t: 2.5, dur: 2.5 }, // parts separate along the axis, outermost first; screws spin out
  { id: "lidar", t: 5.0, dur: 2.6 },   // 1 LIDAR — maps the room
  { id: "brain", t: 7.6, dur: 2.5 },   // 2 BRAIN — plans the path
  { id: "work", t: 10.1, dur: 2.6 },   // 3 WHEELS + BRUSH — do the work
  { id: "snap", t: 12.7, dur: 2.3 },   // reassemble with a staggered snap; legend stays
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => B[id].t + off;

// ---------------------------------------------------------------- robot geometry (assembly-local)
export const ROBOT = { r: 1.75, wallH: 0.5, lidarZ: -0.55 };
export const SCREWS = [45, 135, 225, 315].map((deg) => { const a = (deg * Math.PI) / 180; return [+(Math.cos(a) * 1.42).toFixed(3), +(Math.sin(a) * 1.42).toFixed(3)]; });
export const WHEEL_X = 1.28;
export const SIDE_BRUSH_AT = [1.0, 1.02];
// PARTS: rest = assembled position; offset = exploded distance along +Y. Order = top to bottom (legend numbers).
export const PARTS = [
  { id: "lidar", n: 1, name: "Lidar turret", rest: [0, 0.78, ROBOT.lidarZ], offset: 9.0, seat: "cover", footprint: 0.6, anchor: [0, 0.55, 0] },
  { id: "screws", n: 2, name: "Screws ×4", rest: [0, 0.85, 0], offset: 7.9, seat: "cover", spin: true, axes: SCREWS, footprint: 0 },
  { id: "cover", n: 3, name: "Top cover", rest: [0, 0.45, 0], offset: 6.6, seat: "board", footprint: 1.75 },
  { id: "board", n: 4, name: "Main board", rest: [0, 0.5, 0.1], offset: 4.95, seat: "battery", footprint: 1.2 },
  { id: "battery", n: 5, name: "Battery pack", rest: [0, 0.1, 0.55], offset: 3.6, seat: "bin", footprint: 0.9 },
  { id: "bin", n: 6, name: "Dust bin", rest: [0, 0.1, -0.7], offset: 1.85, seat: "chassis", footprint: 0.9 },
  { id: "chassis", n: 7, name: "Chassis + bumper", rest: [0, 0, 0], offset: 0, footprint: 1.8, anchor: [0, 0.3, 1.75] },
  // the two wheel modules drop out of their wells and spread sideways (off-axis dir) so neither hides behind the chassis
  { id: "wheelL", n: 8, name: "Drive wheels", rest: [-WHEEL_X, 0.06, 0], offset: 2.1, dir: [-0.6, -1, 0], seat: "chassis", footprint: 0.45 },
  { id: "wheelR", n: 8, name: "Drive wheels", rest: [WHEEL_X, 0.06, 0], offset: 2.1, dir: [0.6, -1, 0], seat: "chassis", footprint: 0.45 },
  { id: "roller", n: 9, name: "Roller brush", rest: [0, 0.02, 0.32], offset: -3.35, seat: "chassis", footprint: 0.9, anchor: [-0.3, 0.16, 0.12] },
  { id: "sideBrush", n: 10, name: "Side brush", rest: [SIDE_BRUSH_AT[0], -0.08, SIDE_BRUSH_AT[1]], offset: -4.45, seat: "chassis", footprint: 0.7, anchor: [0.62, 0.04, 0.1] },
];
export const PLAN_OPTS = { outAt: at("explode", 0.68), outStep: 0.13, outDur: 0.95, backAt: at("snap", 0.0), backStep: 0.06, backDur: 0.4 };
export const PLAN = explodePlan(PARTS.map(({ id, offset, spin, rank }) => ({ id, offset, spin, rank })), PLAN_OPTS);
const CUES = explodeCues(PLAN);

// ---------------------------------------------------------------- pose + camera
// Pivot orientation keys: the robot's up-axis (world direction) + a yaw about that axis, slerped (inOutCubic)
// between keys. Intro: edge-on -> upright hero three-quarter; explode: tips over so the stack lies diagonally
// across the 16:9 frame (lower-left -> upper-right); snap: back to the upright hero.
const HERO = { axis: [0.0, 1.0, 0.1], yaw: -0.55 };
const STACK = { axis: [0.7, 0.55, 0.45], yaw: -0.35 };
export const POSE = {
  keys: [
    { t: 0.0, axis: [0.0, 1.0, -0.42], yaw: -2.6 },
    { t: 0.25, axis: [0.0, 1.0, -0.42], yaw: -2.6 },
    { t: 2.35, ...HERO },
    { t: at("explode", -0.1), ...HERO },
    { t: at("explode", 1.3), ...STACK },
    { t: at("snap", 0.8), ...STACK },
    { t: at("snap", 1.9), ...HERO },
  ],
  turn: { at: 0.25, dur: 2.1 },
  stackAxis: STACK.axis,
  centre: 4.2, // stack centre along the axis when exploded (camera target follows it)
};
export const FLOOR_Y = -4.8;
// orbitKey(t, azimuth deg (from +z toward +x), elevation deg, distance, target) — targets/ distances tuned by looking
const orbitKey = (t, az, el, dist, target, fov = 26, ease, path = "arc") => {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  const pos = [target[0] + dist * Math.cos(e) * Math.sin(a), target[1] + dist * Math.sin(e), target[2] + dist * Math.cos(e) * Math.cos(a)];
  return { t, pos: pos.map((v) => +v.toFixed(3)), target, fov, path, ...(ease ? { ease } : {}) };
};
const AX = POSE.stackAxis, AL = Math.hypot(...AX);
const C = AX.map((v) => +((v / AL) * POSE.centre).toFixed(3)); // exploded stack centre (world)
const H = [0, 0.25, 0]; // assembled robot centre
export const CAMERA = [
  orbitKey(0.0, 24, 12, 10.6, H),
  orbitKey(2.4, 16, 30, 11.0, H, 26, "inOutSine"),
  orbitKey(2.5, 15, 30, 11.1, H, 26, "linear"),
  orbitKey(4.1, 5, 36, 19.8, C, 26, "inOutCubic"),
  orbitKey(7.6, 2, 36, 19.6, C, 26, "inOutSine"),
  orbitKey(10.1, -1, 36, 19.6, C, 26, "inOutSine"),
  orbitKey(12.7, -3, 36, 19.8, C, 26, "inOutSine"),
  orbitKey(13.5, -4, 36, 19.6, C, 26, "inOutSine"),
  orbitKey(14.6, 12, 28, 11.2, H, 26, "inOutCubic"),
  orbitKey(15.0, 11, 28, 11.0, H, 26, "inOutSine"),
];

// ---------------------------------------------------------------- focus + labels (overlay NDC; tuned by looking)
export const FOCUS = [
  { beat: "lidar", parts: ["lidar"], legend: [1] },
  { beat: "brain", parts: ["board"], legend: [4] },
  { beat: "work", parts: ["wheelL", "wheelR", "roller", "sideBrush"], legend: [8, 9, 10] },
];
export const CALLOUTS = [
  { n: 1, title: "LIDAR", sub: "MAPS THE ROOM", anchors: [["lidar", [0, 0.62, 0]]], label: [0.58, 0.7], side: "left", in: at("lidar", 0.25), out: at("brain", -0.35) },
  { n: 2, title: "BRAIN", sub: "PLANS THE PATH", anchors: [["board", "chip"]], label: [-0.42, 0.32], side: "left", in: at("brain", 0.2), out: at("work", -0.35) },
  {
    n: 3, title: "WHEELS + BRUSH", sub: "DO THE WORK",
    // numbered dot goes on the first anchor: the roller (fully visible; wheelR sits half behind the chassis rim)
    anchors: [["roller", [0.35, 0.18, 0.1]], ["wheelL", [-0.13, 0.0, 0.2]], ["wheelR", [0.13, 0.0, 0.2]], ["sideBrush", [0, 0.1, 0]]],
    label: [-0.14, -0.64], side: "right", in: at("work", 0.2), out: at("snap", -0.2),
  },
];
export const UI = {
  title: "INSIDE A ROBOT VACUUM", kicker: "EXPLODED VIEW · HOW IT SEES AND CLEANS", titleAt: 0.35, titleXY: [-0.86, 0.8], titleH: 0.062,
  legendAt: at("explode", 1.9), legendXY: [0.6, -0.18], legendH: 0.031, legendW: 7.6,
  calloutH: 0.062, revealDur: 0.9, hideDur: 0.35,
};

// ---------------------------------------------------------------- motion extras
export const SPIN = { lidarRate: 5.5, lidarFast: 14, wheelRate: 5, rollerRate: 9, sideRate: 6 };

export const OBJECTS = []; // the robot is built procedurally in scene.js from style.props (see PARTS / NOTES)

// ---------------------------------------------------------------- SCORE (every cue derives from BEATS or the explode plan)
const pan = (id) => ({ lidar: 0.45, screws: 0.4, cover: 0.3, board: 0.15, battery: 0.0, bin: -0.1, chassis: -0.2, wheelL: -0.4, wheelR: -0.3, roller: -0.45, sideBrush: -0.55 })[id] ?? 0;
const screwSpin = CUES.spin.find((s) => s.id === "screws");
export const SCORE = [
  { t: 0, type: "pad", dur: 12.9, gain: 0.16, root: 196, chord: [0, 7, 14, 16], attack: 1.2, release: 1.6, brightness: 850 },
  { t: at("snap", -0.1), type: "pad", dur: 2.4, gain: 0.17, root: 220, chord: [0, 7, 12, 16, 19], attack: 0.3, release: 1.4, brightness: 1100 },
  // intro: servo whir as the robot turns (stepped buzz = motor), title tick
  { t: POSE.turn.at, type: "whoosh", dir: "in", dur: 1.0, gain: 0.25, pitch: 0.8 },
  ...[0, 0.32, 0.64, 0.98].map((o, i) => ({ t: POSE.turn.at + 0.1 + o, type: "buzz", flicker: 0, hz: 92 + i * 14, dur: 0.42, gain: 0.07, pitch: 1, pan: -0.15 + i * 0.1, seed: 5 + i })),
  { t: POSE.turn.at + POSE.turn.dur - 0.05, type: "clack", gain: 0.35, pitch: 0.8 },
  { t: UI.titleAt, type: "tick", gain: 0.35 },
  { t: UI.titleAt + 0.12, type: "blip", notes: [0, 7], dur: 0.06, gain: 0.22 },
  // explode: a soft whoosh per part as it leaves, a light clack as it settles; screws click while they spin out
  ...CUES.leave.filter((c) => c.id !== "chassis").map((c, i) => ({ t: c.t, type: "whoosh", dir: "out", dur: 0.55, gain: 0.2, pitch: 0.9 + (i % 4) * 0.12, pan: pan(c.id), seed: 11 + i })),
  ...CUES.arrive.filter((c) => c.id !== "chassis").map((c, i) => ({ t: c.t, type: "tick", gain: 0.25, pitch: 0.8 + (i % 3) * 0.15, pan: pan(c.id), seed: 31 + i })),
  ...Array.from({ length: 9 }, (_, k) => ({ t: +(screwSpin.t0 + 0.03 + (k * (screwSpin.t1 - screwSpin.t0)) / 9).toFixed(3), type: "click", gain: 0.22 - k * 0.012, pitch: 1.5 + (k % 2) * 0.2, pan: 0.4, seed: 51 + k })),
  { t: at("explode", 0.1), type: "rumble", dur: 1.6, gain: 0.12, pitch: 1.4 },
  // focus beats: servo whir on the lidar spin-up, data blips on the board, motor buzz + whoosh on the wheels/brushes
  ...CALLOUTS.map((c) => ({ t: c.in, type: "blip", notes: [0, 12], dur: 0.05, gain: 0.25 })),
  ...CALLOUTS.map((c) => ({ t: c.in + 0.32, type: "tick", gain: 0.3, pitch: 1.2 })),
  ...[0, 0.3, 0.6].map((o, i) => ({ t: at("lidar", 0.1 + o), type: "buzz", flicker: 0, hz: 120 + i * 30, dur: 0.5, gain: 0.07, pan: 0.45, seed: 61 + i })),
  { t: at("lidar", 0.15), type: "riser", dur: 0.9, gain: 0.08, pitch: 1.8, pan: 0.45 },
  ...[0, 0.18, 0.31, 0.52, 0.66, 0.9, 1.05].map((o, i) => ({ t: at("brain", 0.45 + o), type: "blip", notes: [[0, 4, 7, 12, 7, 4, 12][i]], dur: 0.05, gain: 0.14, pitch: 1.5, pan: 0.15, seed: 71 + i })),
  { t: at("work", 0.1), type: "buzz", flicker: 0, hz: 70, dur: 2.0, gain: 0.07, pan: -0.4, seed: 81 },
  { t: at("work", 0.15), type: "whoosh", dir: "in", dur: 1.2, gain: 0.18, pitch: 0.7, pan: -0.4 },
  // snap: rush in, one clack per part (innermost first), a deep thud when the shell closes, a chime to finish
  { t: at("snap", 0.0), type: "whoosh", dir: "in", dur: 0.7, gain: 0.3, pitch: 1.1 },
  ...CUES.snap.filter((c) => c.id !== "chassis").map((c, i) => ({ t: c.t, type: "clack", gain: 0.42, pitch: 0.8 + i * 0.06, pan: pan(c.id), seed: 91 + i })),
  { t: Math.max(...CUES.snap.map((c) => c.t)), type: "thud", gain: 0.6, pitch: 1.1 },
  { t: Math.max(...CUES.snap.map((c) => c.t)) + 0.15, type: "chime", dur: 1.6, gain: 0.22, pitch: 1.0 },
];
export const DUCK = [];
export const NOTES = "Robot built procedurally from exploded-view props (plate/lathe/ring/shell/pcb/coil/fan/gear/wheel/roller/screw). Explosion = style explode.js plan (pure f(t)); SCORE derives from the same plan. Overlay callouts anchored to part-local points; legend + title pinned in NDC.";
