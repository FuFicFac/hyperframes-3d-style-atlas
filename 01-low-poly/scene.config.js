// scene.config.js — 01-low-poly: "How a neural network learns" as a low-poly loss landscape.
// Plain data only (no THREE, no window): imported by scene.js (browser), render-sfx.mjs and export-spec.mjs (Node).
// Units: metres, Y-up, radians, seconds, sRGB hex.
export const ID = "01-low-poly";
export const STYLE = "low-poly";
export const DURATION = 15;
export const FPS = 30;

export const BEATS = [
  { id: "intro", t: 0.0, dur: 1.5 },     // island rises out of the sea, trees pop up
  { id: "start", t: 1.4, dur: 2.5 },     // 1 START: RANDOM GUESS — ball drops onto the ridge
  { id: "measure", t: 3.9, dur: 2.1 },   // 2 MEASURE THE SLOPE — ring pulse + downhill arrow
  { id: "step", t: 6.0, dur: 2.7 },      // 3 STEP DOWNHILL — first two hops, flags + trail
  { id: "repeat", t: 8.7, dur: 3.0 },    // 4 REPEAT — six quicker hops, overshoot and curl back
  { id: "trained", t: 11.7, dur: 3.3 },  // 5 LOWEST ERROR = TRAINED — beacon pops, settle wide
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => B[id].t + off;

// The loss landscape (style.helpers.heightField spec). Valley minimum near (-3.4, 2.0).
export const LANDSCAPE = {
  width: 34, depth: 26, segX: 58, segZ: 44, seed: 3, jitter: 0.32, waterLevel: 0,
  field: {
    offset: 0.7,
    terms: [
      { type: "bowl", c: [-3.5, 2.0], k: [0.05, 0.085], max: 2.4 },         // the loss basin
      { type: "gauss", c: [6.5, -3.5], amp: 2.6, sigma: [3.2, 2.6] },       // the starting ridge
      { type: "ridge", a: [-12, -8.5], b: [9, -9], amp: 2.4, width: 2.2 },  // back range (backdrop)
      { type: "gauss", c: [-10.5, -4], amp: 1.6, sigma: [2.5, 2.5] },
      { type: "gauss", c: [10, 5.5], amp: 1.0, sigma: [2.2, 2] },
    ],
    noise: { amp: 0.28, scale: 2.6, octaves: 3, seed: 7 },                  // facet detail (render only)
    island: { rx: 15.5, rz: 11.5, edge: 0.5, drop: 4.0 },                      // coast falls into the sea
  },
};

// Gradient descent with momentum on the smooth field (no noise). Precomputed once; positions are a
// closed-form function of t through HOPS.
export const DESCENT = { start: [4.6, -1.8], lr: 4.5, momentum: 0.55, steps: 8 };
export const BALL = { r: 0.42, dropFrom: 4.5, dropAt: at("start", 0.45), dropDur: 0.7 };
// HOPS[i] moves the ball from path point i to i+1. arc = arcBase + arcPerM * distance.
const quick = [0.5, 0.46, 0.42, 0.38, 0.36, 0.34];
export const HOPS = [
  { t: at("step", 0.3), dur: 0.85 },
  { t: at("step", 1.45), dur: 0.8 },
  ...quick.map((d, i) => ({ t: at("repeat", 0.15) + quick.slice(0, i).reduce((a, b) => a + b + 0.05, 0), dur: d })),
];
export const HOP = { arcBase: 0.35, arcPerM: 0.22, squash: 0.22, flagOffset: 0.62, flagHeight: 0.75, sightline: [1.0, 2.0] };

// Banner labels (screen-pinned). x/y = NDC of the chip centre, height = fraction of frame height.
export const LABELS = [
  { beat: "start", n: 1, text: "START: RANDOM GUESS", in: 0.0, out: -0.45 },
  { beat: "measure", n: 2, text: "MEASURE THE SLOPE", in: 0.0, out: -0.45 },
  { beat: "step", n: 3, text: "STEP DOWNHILL", in: 0.0, out: -0.45 },
  { beat: "repeat", n: 4, text: "REPEAT", in: 0.0, out: -0.45 },
  { beat: "trained", n: 5, text: "LOWEST ERROR = TRAINED", in: 0.95, out: null }, // lands after the beacon + burst
];
export const LABEL_LAYOUT = { x: -0.8, y: 0.7, height: 0.105, revealDur: 0.75, hideDur: 0.4 }; // kit overlay (after post)

// Camera: establish wide/high -> push in on the start -> follow the hops -> settle wide on the valley.
// FOLLOW blends the look-at target toward the ball (0 = key target, 1 = ball).
export const CAMERA = [
  { t: 0, pos: [12.5, 10.5, 16.5], target: [1.2, 1.8, -0.8], fov: 32 },   // open mid-close: ridge + valley, ball ~90 px
  { t: 1.6, pos: [12.5, 10.2, 15.0], target: [2.2, 2.6, -1.0], fov: 32, ease: "inOutSine" },
  { t: 4.2, pos: [12.5, 9.5, 11.5], target: [3.4, 4.0, -1.2], fov: 32, ease: "inOutCubic" },
  { t: 6.2, pos: [11, 9, 12], target: [3.0, 3.6, -0.8], fov: 32, ease: "inOutSine" },
  { t: 8.8, pos: [4.5, 8.5, 15], target: [0, 1.8, 1.5], fov: 32, ease: "inOutCubic" },
  { t: 11.6, pos: [-1.0, 8.6, 15.5], target: [-3.0, 2.3, 1.6], fov: 32, ease: "inOutCubic" },
  { t: 15, pos: [-0.4, 8.4, 14.6], target: [-2.6, 1.7, 0.9], fov: 32, ease: "inOutSine" }, // slow push-in on the payoff
];
export const FOLLOW = [
  { t: 0, w: 0 }, { t: 3.0, w: 0 }, { t: 4.2, w: 0.55 }, { t: 6.2, w: 0.6 }, { t: 11.4, w: 0.6 }, { t: 13.5, w: 0.2 }, { t: 15, w: 0.2 },
];

export const SCATTER = {
  trees: { count: 40, seed: 21, minH: 0.9, maxH: 5.2, minNormalY: 0.82, spacing: 1.1, avoidR: 1.7 },
  rocks: { count: 18, seed: 33, minH: 0.25, maxH: 6.5, minNormalY: 0.5, spacing: 1.4, avoidR: 1.2 },
  growAt: at("intro", 0.45), spread: 1.3, dur: 0.55,
};
// distant islands: big chipped rocks half-sunk in the sea, hazed by fog (horizon interest)
export const ISLANDS = [
  { pos: [-40, -1.2, -42], size: 10, squash: 0.32, color: "#8fb069", seed: 71 },
  { pos: [-24, -1.0, -55], size: 8, squash: 0.4, color: "#a6ae63", seed: 72 },
  { pos: [28, -1.4, -48], size: 12, squash: 0.3, color: "#6f9d5c", seed: 73 },
  { pos: [46, -1.0, -32], size: 8, squash: 0.36, color: "#d6a65f", seed: 74 },
  { pos: [-52, -1.0, -14], size: 9, squash: 0.3, color: "#8fb069", seed: 75 },
];
// ending payoff: light pulses radiate from the beacon (flags flutter + beads bump as each front passes), confetti burst
export const PAYOFF = {
  burstAt: at("trained", 0.5), burst: { count: 60, seed: 61, life: 1.9, size: 0.2, speed: [2.5, 5], up: [2, 4] },
  pulses: [at("trained", 0.6), at("trained", 1.3), at("trained", 2.0), at("trained", 2.7)], pulseDur: 1.4, pulseR: 7.5, pulseWidth: 0.9,
};
export const TERRAIN_RISE = { from: 0.08, at: at("intro"), dur: 1.3 };

export const OBJECTS = [
  { id: "terrain", primitive: "procedural", factory: "terrain", procedural: "flat-shaded displaced grid (heightField spec in LANDSCAPE), per-face colour bands", params: LANDSCAPE },
  { id: "sea", primitive: "procedural", factory: "water", procedural: "faceted bobbing sea plane", params: { size: 96, segments: 48, level: 0, amp: 0.07, seed: 5 } },
  { id: "seaFar", primitive: "procedural", factory: "water", procedural: "coarse outer sea ring (under the near sea) reaching past the fog", params: { size: 260, segments: 44, level: -0.06, amp: 0.1, seed: 6 } },
  { id: "ball", primitive: "procedural", factory: "hero", procedural: "faceted icosphere (detail 1), coral", params: { r: BALL.r, seed: 12 } },
  {
    id: "arrow", primitive: "procedural", factory: "arrow", procedural: "flat extruded arrow lying on the slope", params: { length: 2.2, width: 0.75, color: "#fff6e6" },
    anim: [
      { prop: "scale", beat: "measure", offset: 0.55, dur: 0.6, from: [0.001, 1, 1], to: [1, 1, 1], ease: "outBack" },
      { prop: "scale", beat: "step", offset: 0.0, dur: 0.3, from: [1, 1, 1], to: [0.001, 1, 1], ease: "inCubic" },
    ],
  },
  { id: "ringA", primitive: "procedural", factory: "ring", procedural: "flat 10-sided ring", params: { r: 1, width: 0.12, color: "#fff6e6" } },
  { id: "ringB", primitive: "procedural", factory: "ring", procedural: "flat 10-sided ring", params: { r: 1, width: 0.12, color: "#fff6e6" } },
  {
    id: "beacon", primitive: "procedural", factory: "beacon", procedural: "rock cairn + pole + flag + glowing octahedron", params: { seed: 8, height: 2.8 },
    anim: [{ prop: "scale", beat: "trained", offset: 0.35, dur: 0.7, from: 0, to: 1, ease: "outBack" }],
  },
  { id: "cloud1", primitive: "procedural", factory: "cloud", procedural: "3-5 faceted icosphere puffs", params: { seed: 1, size: 1.6, drift: [0.22, 0, 0] }, position: [-13, 6.5, -12] },
  { id: "cloud2", primitive: "procedural", factory: "cloud", procedural: "3-5 faceted icosphere puffs", params: { seed: 2, size: 1.2, drift: [0.18, 0, 0] }, position: [1, 7.0, -15] },
  { id: "cloud3", primitive: "procedural", factory: "cloud", procedural: "3-5 faceted icosphere puffs", params: { seed: 3, size: 1.4, drift: [0.25, 0, 0] }, position: [12, 5.5, -9] },
  { id: "cloud4", primitive: "procedural", factory: "cloud", procedural: "3-5 faceted icosphere puffs", params: { seed: 4, size: 1.1, drift: [0.2, 0, 0] }, position: [-17, 5.5, 2] },
];

// SCORE: t = onset seconds, derived from BEATS / HOPS so retiming retimes sound.
const hopEnd = (i) => HOPS[i].t + HOPS[i].dur;
export const SCORE = [
  // ambient bed: warm open chord, then a brighter lift for the payoff
  { t: 0, type: "pad", dur: 12.2, gain: 0.2, root: 174.6, chord: [0, 7, 12, 16], attack: 1.2, release: 1.5, brightness: 650 },
  { t: at("trained", -0.2), type: "pad", dur: 3.6, gain: 0.2, root: 196, chord: [0, 4, 7, 12, 19], attack: 0.6, release: 1.4, brightness: 900 },
  // intro: island rises, trees pop
  { t: at("intro"), type: "rumble", dur: 1.5, gain: 0.45 },
  { t: at("intro", 0.05), type: "whoosh", dir: "in", dur: 1.2, gain: 0.35 },
  ...[0, 0.25, 0.5, 0.8, 1.1].map((o, i) => ({ t: SCATTER.growAt + o, type: "pop", gain: 0.28, pitch: 1.1 + i * 0.12, pan: [-0.5, 0.3, -0.2, 0.55, 0][i] })),
  // banners: paper unfold on every label
  ...LABELS.map((l) => ({ t: at(l.beat, l.in), type: "paper", fold: true, dur: 0.45, gain: 0.55, pan: -0.45 })),
  // 1 start: ball drops onto the ridge
  { t: BALL.dropAt - 0.05, type: "whoosh", dir: "out", dur: 0.4, gain: 0.3, pan: 0.3 },
  { t: BALL.dropAt + BALL.dropDur * 0.3636, type: "thud", gain: 0.85, pan: 0.3 },
  { t: BALL.dropAt + BALL.dropDur * 0.73, type: "thud", gain: 0.3, pitch: 1.35, pan: 0.3 },
  // 2 measure: two ring pulses + arrow
  { t: at("measure", 0.2), type: "blip", notes: [0, 7], dur: 0.07, gain: 0.35 },
  { t: at("measure", 0.5), type: "blip", notes: [0, 7], dur: 0.07, gain: 0.3, pitch: 1.12 },
  { t: at("measure", 0.55), type: "whoosh", dir: "in", dur: 0.5, gain: 0.3 },
  { t: at("measure", 1.0), type: "click", gain: 0.35 },
  // hops: soft launch tick, landing thud, flag pop (pitch steps down the slope)
  ...HOPS.flatMap((h, i) => [
    { t: h.t, type: "tick", gain: 0.25, pitch: 1.4 - i * 0.05 },
    { t: hopEnd(i), type: "thud", gain: i < 2 ? 0.6 : 0.4, pitch: 1.2 + i * 0.04, pan: -0.15 },
    { t: hopEnd(i) + 0.06, type: "pop", gain: i < 2 ? 0.45 : 0.3, pitch: 1.5 - i * 0.07, pan: -0.15 },
  ]),
  { t: HOPS[3].t, type: "whoosh", dir: "out", dur: 0.45, gain: 0.25, pan: -0.4 }, // overshoot swing
  // 5 trained: riser into the beacon pop, chime, low thud
  { t: at("trained", 0.35) - 1.2, type: "riser", dur: 1.2, gain: 0.3 },
  { t: at("trained", 0.35), type: "pop", gain: 0.7, pitch: 0.8 },
  { t: at("trained", 0.38), type: "thud", gain: 0.6, pitch: 0.85 },
  { t: at("trained", 0.5), type: "chime", sparkle: true, dur: 2.2, gain: 0.4, pitch: 1.0 },
  ...[0, 0.07, 0.15, 0.24].map((o, i) => ({ t: at("trained", 0.5) + o, type: "pop", gain: 0.3, pitch: 1.6 + i * 0.2, pan: [-0.3, 0.3, -0.1, 0.2][i], seed: 90 + i })),
  ...[0.6, 1.3, 2.0, 2.7].map((o, i) => ({ t: at("trained", o), type: "whoosh", dir: "out", dur: 0.9, gain: 0.22, pitch: 0.75 + i * 0.08, seed: 80 + i })),
];
export const DUCK = [];
export const NOTES = "Ball path = momentum gradient descent on LANDSCAPE.field without noise (DESCENT), hops per HOPS with parabolic arcs; ball y uses the faceted surface height. Labels are screen-pinned banners (LABELS/LABEL_LAYOUT).";
