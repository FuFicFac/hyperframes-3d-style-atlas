// scene.config.js — 14-origami: "One square, no cuts" — two sheets on a writing desk fold, crease by crease, into a
// swan and a heart. Plain data + pure choreography. No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). Both models are folded by the style's fold engine (folds.js); the SCORE is generated
// from the same fold timelines (one paper-fold sound per fold step), so every crease sounds exactly on the picture.
// Units: metres, Y-up, radians, seconds, sRGB hex. Desk top = y 0.
import { STYLE_SPEC as S } from "./_atlas/styles/origami/spec.js";
import { buildFolds, model, foldTimeline } from "./_atlas/styles/origami/folds.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "14-origami";
export const STYLE = "origami";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "open", t: 0.0, dur: 1.1 },    // two plain squares land on the desk
  { id: "swan", t: 1.1, dur: 5.6 },    // the left sheet folds into a standing swan: A SWAN
  { id: "heart", t: 6.7, dur: 5.2 },   // the right sheet folds into a heart: A HEART
  { id: "hero", t: 11.9, dur: 3.1 },   // pull back, the heart stands up beside the swan: NO CUTS, NO GLUE
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => B[id].t + off;

// ---------------------------------------------------------------- the two models (one sheet each, 2 m square at toy scale)
const build = (m) => buildFolds(model(m.model, m.modelOpts), { thickness: S.paper.thickness, pitch: S.paper.pitch, seed: m.seed, imperfect: S.paper.imperfect });
const F = S.tuning.foldDur, LAG = S.tuning.pairLag;

// swan: yawed so its side faces the camera (beak to -x); white sheet, faintly warmer second side (two-tone washi)
export const SWAN = {
  model: "swan", modelOpts: { size: 1.0 }, seed: 4, front: "washi", back: "kinari",
  pos: [-1.5, 0, 0.1], yaw: Math.PI / 2,
};
export const SWAN_PLAN = build(SWAN);
const s0 = at("swan");
export const SWAN_CUES = {
  kiteL: { at: s0 + 0.15, dur: F },
  kiteR: { at: s0 + 0.15 + LAG, dur: F },
  turn: { at: s0 + 1.0, dur: 0.6 },
  narrowL: { at: s0 + 1.75, dur: F },
  narrowR: { at: s0 + 1.75 + LAG, dur: F },
  half: { at: s0 + 2.6, dur: 0.55 },
  neck: { at: s0 + 3.3, dur: F },
  head: { at: s0 + 3.95, dur: 0.4 },
  tail: { at: s0 + 4.45, dur: 0.4 },
  stand: { at: s0 + 4.95, dur: 0.6 },
};
export const SWAN_TL = foldTimeline(SWAN_PLAN, SWAN_CUES);

// heart: starts white side up, ends a clean vermilion heart, top away from the camera
export const HEART = {
  model: "heart", modelOpts: { size: 1.0 }, seed: 6, front: "washi", back: "vermilion",
  pos: [1.65, 0, -0.05], yaw: 0,
};
export const HEART_PLAN = build(HEART);
const h0 = at("heart");
export const HEART_CUES = {
  top: { at: h0 + 0.1, dur: F },
  bottom: { at: h0 + 0.7, dur: F },
  sideR: { at: h0 + 1.3, dur: F },
  sideL: { at: h0 + 1.3 + LAG, dur: F },
  turn: { at: h0 + 2.15, dur: 0.6 },
  tops: { at: h0 + 2.95, dur: 0.45 },
  pointR: { at: h0 + 3.55, dur: 0.4 },
  pointL: { at: h0 + 3.55 + LAG, dur: 0.4 },
  reveal: { at: h0 + 4.4, dur: 0.6 },
};
export const HEART_TL = foldTimeline(HEART_PLAN, HEART_CUES);

// ---------------------------------------------------------------- landing + hero moves
export const LAND = { at: 0.05, dur: 0.75, from: 0.32, tilt: 0.07, lag: 0.12 };       // the swan sheet lands, the heart sheet `lag` later
export const HEART_RISE = { at: at("hero", 0.35), dur: 1.3, lift: 0.3, tilt: 0.95, slide: [-0.35, 0, 0.45] };   // stands up on its point, leaning back to face us
export const SWAN_TURN = { at: at("hero", 0.25), dur: 1.6, yaw: -0.35, slide: [0.25, 0, 0.15] };

// ---------------------------------------------------------------- labels (washi strips, top-left, one at a time)
export const TAG_POS = { x: -0.86, y: 0.72, unit: 0.1 };   // unit = frame-height fraction of one label unit
export const TAGS = [
  { kicker: "FOLD 1 · KITE BASE", text: "A SWAN", in: at("open", 0.35), out: at("swan", 5.35) },
  { kicker: "FOLD 2 · FLAT FOLDS", text: "A HEART", in: at("heart", 0.15), out: at("heart", 4.85) },
  { kicker: "ONE SQUARE EACH", text: "NO CUTS, NO GLUE", in: at("hero", 0.3), out: DURATION + 1 },
];
export const TAG_ANIM = { inDur: 0.5, outDur: 0.38 };

// ---------------------------------------------------------------- camera: calm three-quarter view, push in on each model
const SW = SWAN.pos, HT = HEART.pos;
export const CAMERA = [
  { t: 0.0, pos: [0.1, 5.3, 6.3], target: [0.05, 0.0, -0.05], fov: 30 },
  { t: at("swan", 0.1), pos: [0.0, 5.2, 6.1], target: [0.0, 0.0, -0.05], fov: 30, ease: "linear" },
  { t: at("swan", 1.4), pos: [SW[0] + 0.2, 4.6, 4.7], target: [SW[0] + 0.05, 0.05, SW[2] - 0.1], fov: 30, ease: "inOutSine" },   // push in on the folds
  { t: at("swan", 4.3), pos: [SW[0] + 0.25, 4.2, 4.6], target: [SW[0] + 0.05, 0.12, SW[2] - 0.1], fov: 30, ease: "linear" },
  { t: at("swan", 5.5), pos: [SW[0] + 0.35, 2.7, 5.0], target: [SW[0] + 0.05, 0.55, SW[2] - 0.05], fov: 30, ease: "inOutSine" },  // the swan stands
  { t: at("heart", 0.05), pos: [SW[0] + 0.4, 2.65, 4.9], target: [SW[0] + 0.05, 0.55, SW[2] - 0.05], fov: 30, ease: "linear" },
  { t: at("heart", 1.2), pos: [HT[0] - 0.1, 4.7, 4.3], target: [HT[0] - 0.15, 0.0, HT[2] - 0.45], fov: 30, ease: "inOutSine" },          // over to the heart
  { t: at("heart", 4.2), pos: [HT[0] - 0.2, 4.4, 4.2], target: [HT[0] - 0.15, 0.05, HT[2] - 0.45], fov: 30, ease: "linear" },
  { t: at("hero", 0.1), pos: [HT[0] - 0.3, 4.3, 4.35], target: [HT[0] - 0.05, 0.1, HT[2] - 0.2], fov: 30, ease: "inOutSine" },
  { t: at("hero", 1.8), pos: [0.15, 2.9, 6.4], target: [0.1, 0.5, 0.0], fov: 30, ease: "inOutSine" },                              // pull back: both
  { t: DURATION, pos: [0.1, 2.85, 6.25], target: [0.1, 0.5, 0.0], fov: 30, ease: "linear" },
];

export const OBJECTS = [
  { id: "table", primitive: "procedural", factory: "table", procedural: "calm light-oak desk top, 40 x 40 m plane at y = 0 (style-local veneer texture + roughness)", dims: { size: 40 }, position: [0, 0, 0] },
];

// ---------------------------------------------------------------- SCORE (folds from both fold timelines' events)
const pan = (x) => Math.max(-0.6, Math.min(0.6, x / 3));
const foldVoices = {
  // a crisp paper fold whose crease thump (at 75 % of dur) lands as the flap lands, plus a dry crease press
  fold: (e) => [
    { type: "paper", fold: true, dur: e.dur * 1.12, gain: e.flat ? 0.62 : 0.5, pitch: 0.95 + (e.seed % 4) * 0.07, density: 0.45 },
    { type: "click", offset: e.dur * 0.97, dur: 0.02, gain: 0.1, pitch: 0.5 },
  ],
  crease: (e) => [
    { type: "paper", fold: true, dur: e.dur * 0.55, gain: 0.55, pitch: 1.0, density: 0.45 },
    { type: "rustle", offset: e.dur * 0.55, dur: e.dur * 0.45, gain: 0.3, pitch: 1.15 },
  ],
  turn: (e) => [
    { type: "rustle", dur: e.dur * 1.15, gain: 0.42, pitch: 0.8, density: 0.5 },
    { type: "whoosh", dur: e.dur, gain: 0.12, pitch: 0.7 },
  ],
  refold: (e) => [{ type: "rustle", dur: 0.38, gain: 0.26, pitch: 1.25 }],
};
const swanSfx = scoreFromEvents(SWAN_TL.events, foldVoices, { pan: (e) => pan(SW[0] + e.x * 0.3), seedBase: 31 });
const heartSfx = scoreFromEvents(HEART_TL.events, foldVoices, { pan: (e) => pan(HT[0] + e.x * 0.3), seedBase: 131 });

const tagSfx = TAGS.flatMap((g, i) => [
  { t: g.in, type: "rustle", dur: 0.32, gain: 0.16, pitch: 1.5, pan: -0.45, seed: 200 + i },
  ...(g.out < DURATION ? [{ t: g.out, type: "rustle", dur: 0.25, gain: 0.1, pitch: 1.7, pan: -0.45, seed: 220 + i }] : []),
]);

export const SCORE = [
  // quiet airy bed: open fifths, bright low-pass (brightness is a cutoff in Hz), slow swell
  { t: 0, type: "pad", dur: DURATION, gain: 0.3, root: 196, chord: [0, 7, 12, 14, 19], attack: 2.2, release: 2.4, brightness: 1500 },
  { t: 0, type: "pad", dur: DURATION, gain: 0.12, root: 392, chord: [0, 7, 14], attack: 3, release: 3, brightness: 2600, seed: 3 },
  // the two sheets land
  { t: LAND.at + LAND.dur * 0.55, type: "paper", dur: 0.4, gain: 0.32, pitch: 0.8, pan: pan(SW[0]), seed: 5 },
  { t: LAND.at + LAND.lag + LAND.dur * 0.55, type: "paper", dur: 0.4, gain: 0.28, pitch: 0.86, pan: pan(HT[0]), seed: 7 },
  { t: LAND.at, type: "whoosh", dur: LAND.dur * 0.7, gain: 0.08, pitch: 0.8, seed: 6 },
  ...swanSfx,
  ...heartSfx,
  ...tagSfx,
  // the swan stands: a soft chime on its landing
  { t: SWAN_CUES.stand.at + SWAN_CUES.stand.dur * 0.9, type: "chime", dur: 1.6, gain: 0.07, pitch: 1.0, notes: 3, pan: pan(SW[0]), seed: 340 },
  // the heart is revealed, then stands up beside the swan
  { t: HEART_CUES.reveal.at + HEART_CUES.reveal.dur * 0.9, type: "chime", dur: 1.8, gain: 0.08, pitch: 1.12, notes: 4, pan: pan(HT[0]), seed: 341 },
  { t: HEART_RISE.at, type: "whoosh", dir: "in", dur: HEART_RISE.dur * 0.8, gain: 0.18, pitch: 0.65, pan: pan(HT[0]), seed: 400 },
  { t: HEART_RISE.at + HEART_RISE.dur * 0.95, type: "chime", dur: 2.0, gain: 0.11, pitch: 0.75, notes: 4, seed: 401 },
].sort((a, b) => a.t - b.t);
export const DUCK = [];

export const NOTES = {
  mechanism: "Swan and heart are styles/origami/folds.js MODELS.swan / MODELS.heart built by buildFolds (rigid facets, nested creases, auto layer lift). Picture: foldModel.userData.update(t) reads foldTimeline(PLAN, CUES).at(t). SCORE = scoreFromEvents(timeline.events): one paper fold per fold step.",
  swan: SWAN_PLAN.steps.map((s) => ({ id: s.id, kind: s.kind, at: SWAN_CUES[s.id]?.at, dur: SWAN_CUES[s.id]?.dur, moved: s.moved.length })),
  heart: HEART_PLAN.steps.map((s) => ({ id: s.id, kind: s.kind, at: HEART_CUES[s.id]?.at, dur: HEART_CUES[s.id]?.dur, moved: s.moved.length })),
  facets: { swan: SWAN_PLAN.facets.length, heart: HEART_PLAN.facets.length },
};
