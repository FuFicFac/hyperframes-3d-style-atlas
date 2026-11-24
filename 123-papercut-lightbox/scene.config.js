// scene.config.js — 123-papercut-lightbox: "Depth made of light" (style "papercut-lightbox").
// Plain data + the style's pure planner (layers.js). No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The beats set every window of the plan (slides, room light, backlight, lamp drift, warmth, window
// lamp); the picture and every sound cue read the same plan.
// World: the box is centred on the origin, sheets face +Z (the camera side), the front sheet at z = 0, the back sheet at
// z = -0.084, the walnut lip in front of z = 0.003 .. 0.015. Sheet x/y = world x/y once a sheet has slid home.
import { STYLE_SPEC as S } from "./_atlas/styles/papercut-lightbox/spec.js";
import { createLightboxPlan } from "./_atlas/styles/papercut-lightbox/layers.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { sampleCameraKeys, projectPoint } from "./_atlas/kit/framing.js";

export const ID = "123-papercut-lightbox";
export const STYLE = "papercut-lightbox";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;
export const TITLE = "Depth made of light";

// ---------------------------------------------------------------- beats (storyboard: times + labels as written)
export const BEATS = [
  { id: "cut", t: 0, dur: 2.6, label: "Plain white paper, cut" },
  { id: "stack", t: 2.6, dur: 3.4, label: "Stack the layers apart" },
  { id: "light", t: 6.0, dur: 3.0, label: "Light it from behind" },
  { id: "move", t: 9.0, dur: 3.0, label: "Move: the layers slide" },
  { id: "depth", t: 12.0, dur: 3.0, label: "Depth, made only of light" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// the caption slide for beat k runs [t - lead, t - lead + roll]: the new line is fully in just before the beat starts
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: i ? b.t - S.caption.lead : 0, roll: S.caption.roll }));

// ---------------------------------------------------------------- the plan (every window from the beats)
const st = B.stack.t;
export const PLAN_CFG = {
  // back sheet first; sky, far and near mountains slide in during beat 1, the other four one by one in beat 2
  slides: [[-0.6, 0.12], [0.2, 0.95], [1.15, 1.9], [st + 0.15, st + 0.7], [st + 0.85, st + 1.4], [st + 1.55, st + 2.1], [st + 2.25, st + 2.8]],
  room: [B.light.t - 0.05, B.light.t + 0.4],
  switchAt: B.light.t + 0.1,
  back: { on: B.light.t + 0.12 },
  // the backlight sits low behind the mountains (dawn glow); it drifts left in beat 3, sweeps right in beat 4, sinks in 5
  light: [
    { t: 0, p: [-0.03, 0.04] }, { t: B.light.t + 0.6, p: [-0.03, 0.04] }, { t: B.move.t, p: [-0.15, 0.045] },
    { t: B.depth.t, p: [0.16, 0.045] }, { t: B.depth.t + 2.4, p: [0.05, 0.012] },
  ],
  warm: [B.depth.t + 0.1, B.depth.t + 2.4],
  lamp: { on: B.depth.t + 0.75 },
  wind: [B.move.t, B.move.t + B.move.dur],
};
export const PLAN = createLightboxPlan(PLAN_CFG);

// Picture (Chrome) and sound (Node) both use the plan: record its fingerprint and fail loudly in either environment if
// they ever disagree (PLAN_RECORD=1 prints instead of failing, to re-record after changing the design or the timings).
export const PLAN_HASH = "0c98d36b";
export const PLAN_HASH_NOW = PLAN.fingerprint();
if (typeof globalThis.window !== "undefined") globalThis.window.__lightboxHash = PLAN_HASH_NOW;
if (PLAN_HASH_NOW !== PLAN_HASH && !globalThis.process?.env?.PLAN_RECORD) {
  throw new Error(`123-papercut-lightbox: plan hash ${PLAN_HASH_NOW} != recorded ${PLAN_HASH} (${typeof globalThis.window !== "undefined" ? "browser" : "node"})`);
}

// ---------------------------------------------------------------- camera: one move per beat, holds between
const fov = S.camera.fov;
const key = (t, pos, target, ease) => ({ t, pos, target, fov, ...(ease ? { ease } : {}) });
export const CAMERA = [
  // beat 1: oblique close-up from the front left, looking into the box at the mountain sheets as they slide in
  key(0, [-0.131, 0.15, 0.146], [0.05, 0.052, -0.07]),
  key(B.stack.t, [-0.112, 0.128, 0.138], [0.062, 0.03, -0.07], "inOutSine"),
  // beat 2: swing round to the front while the other sheets slide in: almost flat
  key(st + 2.2, [0, 0.002, 0.62], [0, 0.002, -0.04], "inOutCubic"),
  key(B.light.t - 0.5, [0, 0.002, 0.62], [0, 0.002, -0.04]),
  // beat 3: push in as the backlight comes on, the picture fills the frame, then drift left
  key(B.light.t + 0.7, [0, 0.002, 0.46], [0, 0.002, -0.04], "inOutCubic"),
  key(B.move.t, [-0.1, 0.004, 0.44], [-0.035, 0.002, -0.04], "inOutSine"),
  // beat 4: track sideways: the sheets slide against each other
  key(B.depth.t - 0.1, [0.1, 0.004, 0.44], [0.035, 0.002, -0.04], "inOutSine"),
  // beat 5: settle in the middle, a little closer
  key(B.depth.t + 2.6, [0, -0.002, 0.445], [0, -0.002, -0.04], "inOutCubic"),
  key(DURATION, [0, -0.002, 0.445], [0, -0.002, -0.04]),
];

// ---------------------------------------------------------------- framing: after beat 2 the picture fills the frame
// worst = the largest NDC margin between the opening's edge and the frame edge (0 = the opening covers the frame)
const [opw, oph] = S.frame.opening;
const lipZ = PLAN.cfg.box.frontZ + 0.003 + S.frame.lipDepth;
const OPEN = [[-opw / 2, -oph / 2, lipZ], [opw / 2, -oph / 2, lipZ], [opw / 2, oph / 2, lipZ], [-opw / 2, oph / 2, lipZ]];
export const FILL = (() => {
  let worst = 0, at = null;
  for (let i = 0; i <= 270; i++) {
    const t = B.light.t + 0.7 + (i / 270) * (DURATION - B.light.t - 0.7);
    const cam = sampleCameraKeys(CAMERA, t, { drift: S.camera.drift, fov });
    const p = OPEN.map((q) => projectPoint(cam, q));
    const m = Math.max(Math.max(p[0][0], p[3][0]) + 1, 1 - Math.min(p[1][0], p[2][0]), Math.max(p[0][1], p[1][1]) + 1, 1 - Math.min(p[2][1], p[3][1]), 0);
    if (m > worst) { worst = m; at = +t.toFixed(2); }
  }
  return { worst: +worst.toFixed(4), at };
})();

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
const SND = S.sound;
const VOICES = {
  slide: (e) => [
    { type: "paper", dur: e.dur + 0.05, density: 0.26, pitch: 0.82 + 0.07 * e.k, gain: SND.slide.gain },
    { type: "rustle", dur: e.dur * 0.8, density: 0.5, pitch: 1.1 + 0.05 * e.k, gain: SND.slide.gain * 0.35 },
  ],
  click: (e) => [
    { type: "click", pitch: 0.72 + 0.1 * e.k, gain: SND.click.gain },
    { type: "thud", pitch: 2.4 + 0.15 * e.k, dur: 0.12, gain: SND.click.gain * 0.35 },
  ],
  switch: () => [{ type: "clack", pitch: 0.62, gain: SND.switch.gain }],
  glow: (e) => [
    { type: "pad", dur: e.dur, root: SND.swell.root, chord: [0, 7, 12, 16, 19], attack: 1.3, release: 1.8, brightness: SND.swell.brightness, gain: SND.swell.gain },
    { type: "chime", dur: 1.6, pitch: 0.7, notes: 5, gain: 0.1, offset: 0.05 },
  ],
  wind: (e) => [
    { type: "whoosh", dir: "in", dur: e.dur * 0.62, q: 0.55, pitch: 0.42, gain: SND.wind.gain },
    { type: "whoosh", dir: "out", dur: e.dur * 0.6, q: 0.5, pitch: 0.38, gain: SND.wind.gain * 0.85, offset: e.dur * 0.42 },
    { type: "rustle", dur: e.dur, density: 0.12, pitch: 0.35, gain: SND.wind.gain * 0.5 },
  ],
  warm: (e) => [{ type: "pad", dur: e.dur, root: SND.swell.root * 0.8909, chord: [0, 4, 7, 11, 14], attack: 1.2, release: 1.4, brightness: 900, gain: SND.swell.gain * 0.6 }],
  lamp: () => [
    { type: "pluck", hz: SND.lamp.hz, notes: [0, 4, 7, 12], step: 0.1, decay: 1.1, bright: 0.45, dur: 1.8, gain: SND.lamp.gain },
    { type: "chime", dur: 1.4, pitch: 0.9, notes: 4, gain: 0.08, offset: 0.1 },
  ],
};
export const EVENTS = PLAN.events();
export const SCORE = [
  { t: 0, type: "pad", root: SND.bed.root, chord: [0, 7, 12], dur: DURATION, attack: 0.5, release: 1.6, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 7 },
  ...scoreFromEvents(EVENTS, VOICES, { seedBase: 211, pan: (e) => (e.kind === "slide" || e.kind === "click" ? 0.35 : 0) }),
];
export const DUCK = [];

export const NOTES = {
  title: TITLE,
  planHash: PLAN_HASH_NOW,
  sheets: PLAN.shapes.map((s) => s.id),
  fill: FILL,
  mechanism: "layers.js: seven seeded cut outlines (ridges, conifers, house with window holes, leaf border) -> extruded sheets + a 7-layer coverage array texture (sharp/soft/softer); each sheet emits backlight(p) * tau * product over sheets behind of (1 - (1 - tau) * mask_j(q_j)), q_j on the line from the lamp to p.",
};
