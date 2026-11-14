// scene.config.js — 25-stained-glass: "What a tree needs", assembled pane by pane in a cathedral window.
// Plain data (Node-importable). Window space: metres, x right, y up, origin at the sill centre. The glazier's plan
// (which pane lands when, which region glows when) comes from styles/stained-glass/glazing.js — the SAME plan drives the
// picture (scene.js) and the sound (SCORE below), so retiming a beat retimes both.
import { figures, layoutWindow, planGlazing, lightEvents } from "./_atlas/styles/stained-glass/glazing.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "25-stained-glass";
export const STYLE = "stained-glass";
export const DURATION = 15;   // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "build", t: 0.0, dur: 4.2 },   // lead came is laid, panes are set (dim), the light comes up
  { id: "sun", t: 4.2, dur: 2.7 },     // the sun glows
  { id: "air", t: 6.9, dur: 2.7 },     // sky, cloud and rain glow
  { id: "soil", t: 9.6, dur: 2.7 },    // soil and roots glow
  { id: "whole", t: 12.3, dur: 2.7 },  // the tree and everything with it; the sun swings
];
const at = (id, off = 0) => BEATS.find((b) => b.id === id).t + off;

// ---- the design: a pointed arch with a ruby/gold border, sky and soil fields, figures built from panes ----
const HORIZON = 1.05;
export const DESIGN = {
  seed: 3,
  frame: { kind: "arch", w: 3.6, spring: 2.7, k: 0.72, seg: 16, resample: 0.22 },
  border: { width: 0.16, step: 0.42, tones: ["ruby", "gold", "rubyB", "gold"], region: "border" },
  fields: [
    { id: "sky", region: "sky", clip: [[0, -1, -HORIZON]], tones: ["skyA", "skyB", "skyC", "skyD", "skyE", "skyB"], sites: { density: 6.5, seed: 1 } },
    { id: "soil", region: "soil", clip: [[0, 1, HORIZON]], tones: ["soilA", "soilB", "soilC", "soilD"], sites: { density: 9, seed: 2 } },
    // the crown: a leafy shaped field (its own Voronoi panes in four greens)
    { id: "crown", region: "crown", poly: figures.blob([-0.1, 2.9], 0.9, { n: 15, wobble: 0.07, seed: 7, squash: 0.98 }),
      tones: ["leafA", "leafB", "leafC", "leafD", "leafB"], sites: { density: 26, seed: 4 } },
  ],
  figures: [
    ...figures.trunk([-0.1, 0.55], [-0.1, 2.06], { w0: 0.42, w1: 0.26 }),
    ...figures.roots([-0.1, 0.6], { n: 5, len: 0.5, spread: 2.1, width: 0.06 }),
    ...figures.sun([-0.55, 4.35], 0.26, { rays: 8, rayOut: 1.7, rot: 0.2 }),
    ...figures.cloud([0.55, 4.05], 0.75),
    ...[[1.0, 3.55], [1.3, 3.05], [1.05, 2.55], [1.32, 2.1]].flatMap((c) => figures.drop(c, 0.2)),
  ],
  bars: [1.7, 3.35],
};
export const REGIONS = ["border", "sky", "soil", "crown", "trunk", "roots", "sun", "cloud", "rain"];
export const GLAZE = { lead: [0.15, 1.9], set: [0.85, 3.45], leadDur: 0.35, order: "rise", seed: 5, bin: 0.12 };
export const PLAN = planGlazing(layoutWindow(DESIGN), GLAZE);

// ---- the light: comes up behind the glass, then each region glows as it is named ----
export const LIGHT = {
  up: [at("build", 3.35), at("build", 4.35)], pre: 0.12, base: 0.55,
  named: [
    { t: at("sun", 0.3), regions: ["sun"], peak: 1.5, settle: 0.85, hold: 1.6, fall: 0.8 },
    { t: at("air", 0.3), regions: ["sky", "cloud", "rain"], peak: 1.3, settle: 0.8, hold: 1.6, fall: 0.8 },
    { t: at("soil", 0.3), regions: ["soil", "roots"], peak: 1.45, settle: 0.8, hold: 1.6, fall: 0.8 },
  ],
  all: { t: at("whole", 0.3), regions: ["crown", "trunk"], peak: 1.45, level: 1.0 },
};
// sun direction keys (degrees): elevation above the horizon, azimuth (+ = light travels toward +x)
export const SUN = [
  { t: 0, el: 47, az: -15 },
  { t: at("whole"), el: 45, az: 2, ease: "inOutSine" },
  { t: DURATION, el: 43, az: 14, ease: "inOutSine" },
];

// ---- captions: one at a time, one fixed region (lower centre); swatch = the region's glass colour ----
export const CAPTIONS = [
  { text: "WHAT A TREE NEEDS", on: at("build", 0.5), off: at("build", 3.75), swatch: "leafB" },
  { text: "SUNLIGHT", on: LIGHT.named[0].t, off: at("sun", 2.3), swatch: "sunA" },
  { text: "AIR AND WATER", on: LIGHT.named[1].t, off: at("air", 2.3), swatch: "skyC" },
  { text: "MINERALS FROM THE SOIL", on: LIGHT.named[2].t, off: at("soil", 2.3), swatch: "soilC" },
  { text: "TOGETHER, IT GROWS", on: LIGHT.all.t, off: Infinity, swatch: "leafA" },
];
export const CAPTION_POS = { x: 100, y: 470, align: "left" };   // left column; the window sits right of centre

// ---- camera: window right of centre while it is built, then back and up to show the shafts and the floor light ----
export const CAMERA = [
  { t: 0, pos: [-2.3, 3.9, 10.6], target: [-2.05, 3.65, 0], fov: 36 },
  { t: at("build", 3.3), pos: [-2.2, 3.85, 10.2], target: [-1.95, 3.6, 0], fov: 36, ease: "inOutSine" },
  { t: at("air", 0.2), pos: [-4.2, 5.3, 15.2], target: [-2.35, 2.7, 2.2], fov: 42, ease: "inOutSine" },
  { t: at("whole"), pos: [-4.9, 5.4, 15.5], target: [-2.7, 2.7, 2.3], fov: 42, ease: "inOutSine" },
  { t: DURATION, pos: [-5.4, 5.5, 15.4], target: [-2.5, 2.75, 2.3], fov: 42, ease: "inOutSine" },
];

export const OBJECTS = [
  { id: "room", primitive: "procedural", factory: "room", dims: { design: DESIGN },
    procedural: "stone nave: 22 x 11 m ashlar wall at z = 0 with a pointed-arch hole, a splayed stone reveal down to the glass (z = -0.42), 22 x 22 m flagstone floor that receives the coloured window light" },
  { id: "window", primitive: "procedural", factory: "window", dims: { design: DESIGN, plan: GLAZE, regions: REGIONS },
    procedural: "leaded stained-glass window: merged pane mesh (custom glass shader, per-pane flight into its cell), instanced lead came, solder joints, iron saddle bars" },
  { id: "shafts", primitive: "procedural", factory: "shafts", dims: {},
    procedural: "raymarched light-shaft volume (box) sampling the window light cookie along the sun direction; additive" },
];

// ---- sound: every cue from PLAN.events (lead bins, pane-set bins) and lightEvents(LIGHT). pad brightness = Hz ----
const NAMED_PITCH = [1.0, 1.335, 0.89];
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, root: 65.41, chord: [0, 7, 12, 16, 19], brightness: 520, attack: 2.2, release: 2.5, gain: 0.85 },
  ...scoreFromEvents([...PLAN.events, ...lightEvents(LIGHT)], {
    lead: (e) => [{ type: "tick", gain: Math.min(0.1, 0.035 + 0.012 * e.n), pitch: 0.55 }],
    set: (e, c) => [
      { type: "click", gain: Math.min(0.2, 0.08 + 0.03 * e.n), pitch: 1.7 + 0.25 * ((c.index * 7) % 5) / 4 },
      ...(c.index % 3 === 0 ? [{ type: "chime", dur: 0.5, gain: 0.04, pitch: 2.2 + 0.3 * ((c.index * 5) % 4) / 3 }] : []),
    ],
    up: (e) => [
      { type: "riser", dur: e.dur + 0.4, gain: 0.16, pitch: 0.6, offset: -0.4 },
      { type: "pad", bus: "music", dur: DURATION - e.t, root: 130.81, chord: [0, 4, 7, 11, 14], brightness: 950, attack: 1.0, release: 2.0, gain: 0.2 },
      { type: "chime", dur: 2.6, gain: 0.14, pitch: 0.5, offset: e.dur },
    ],
    named: (e) => [
      { type: "chime", dur: 2.4, gain: 0.22, pitch: NAMED_PITCH[e.i % 3] },
      { type: "sparkle", dur: 1.2, gain: 0.07, pitch: NAMED_PITCH[e.i % 3] * 1.2 },
    ],
    all: () => [
      { type: "chime", dur: 3.2, gain: 0.26, pitch: 0.5 },
      { type: "thud", dur: 1.4, gain: 0.32, pitch: 0.42 },
      { type: "sparkle", dur: 1.6, gain: 0.08, pitch: 0.9 },
      { type: "whoosh", dir: "in", dur: 1.4, gain: 0.12, pitch: 0.45, offset: -0.9 },
    ],
  }, { pan: (e) => (e.kind === "set" ? Math.sin(e.t * 3.1) * 0.35 : 0) }),
];
export const DUCK = [];
export const NOTES = "The window plan (pane polygons, lead order, set times) is glazing.planGlazing(layoutWindow(DESIGN), GLAZE), computed identically in Node (SCORE) and the browser (picture). Floor patches and shafts are cookie lookups along the sun direction (SUN keys), not baked.";
