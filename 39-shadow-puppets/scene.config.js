// scene.config.js — 39-shadow-puppets: "The Tall Tale". A small fox walks onto a shadow-theatre screen, steps back toward
// the lamp and becomes a soft giant, the lamp swings and every shadow sways, then the fox returns to the cloth — it never grew.
// Plain data (Node-importable). The show plan (poses, lamp, events) comes from styles/shadow-puppets/puppetry.js: the SAME
// plan drives the picture (scene.js) and the sound (SCORE below), so retiming a beat retimes both.
import { planShow, themeFromBeats, cut } from "./_atlas/styles/shadow-puppets/puppetry.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "39-shadow-puppets";
export const STYLE = "shadow-puppets";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "title", t: 0.0, dur: 3.0 },  // scenery slides in; the title comes from the lamp (huge, soft) to the cloth (crisp)
  { id: "fox", t: 3.0, dur: 3.2 },    // a small fox walks in at the cloth: small and crisp
  { id: "giant", t: 6.2, dur: 3.2 },  // it steps back toward the lamp: a soft giant; the jaw opens
  { id: "lamp", t: 9.4, dur: 2.8 },   // the lamp swings: far shadows sway and stretch, near scenery barely moves
  { id: "end", t: 12.2, dur: 2.8 },   // back at the cloth, small again; the moon rises
];
const at = (id, off = 0) => BEATS.find((b) => b.id === id).t + off;
const end = (id, off = 0) => { const b = BEATS.find((x) => x.id === id); return b.t + b.dur + off; };

// ---- captions: one at a time, on the storyteller's plaque under the screen ----
export const CAPTIONS = [
  { text: "A SHADOW FABLE", on: at("title", 0.0), off: end("title", -0.45) },
  { text: "A SMALL FOX", on: at("fox", 0.25), off: end("fox", -0.45) },
  { text: "NEAR THE LAMP: A GIANT", on: at("giant", 0.25), off: end("giant", -0.45) },
  { text: "MOVE THE LAMP: IT SWAYS", on: at("lamp", 0.2), off: end("lamp", -0.45) },
  { text: "THE FOX NEVER GREW", on: at("end", 0.25), off: Infinity },
];
export const CAPTION_POS = { x: 960, y: 958 };

// ---- puppet designs (each part drawn in the puppet's own frame, metres; origin = where the puppet "stands") ----
const fox = {
  parts: {
    body: {
      cut: {
        fill: [
          cut.ellipse(0, 0.47, 0.46, 0.19, 48),
          cut.poly([[0.22, 0.4], [0.5, 0.56], [0.6, 0.74], [0.42, 0.78], [0.24, 0.62]]),             // neck
          cut.poly([[0.4, 0.72], [0.47, 0.98], [0.55, 0.8], [0.6, 1.0], [0.66, 0.79], [0.88, 0.7], [0.86, 0.665], [0.6, 0.64], [0.45, 0.66]]), // head + ears + snout
        ],
        holes: [
          { poly: cut.circle(0.62, 0.745, 0.022, 16) },                         // eye (plain cut)
          { poly: cut.diamond(-0.2, 0.49, 0.12, 0.17), gel: "ruby" },
          { poly: cut.diamond(0.0, 0.49, 0.12, 0.17), gel: "amber" },
          { poly: cut.diamond(0.2, 0.49, 0.12, 0.17), gel: "sapphire" },
          ...[-0.3, -0.1, 0.1, 0.3].map((x) => ({ poly: cut.circle(x, 0.37, 0.016, 12) })),
          ...[-0.3, -0.1, 0.1, 0.3].map((x) => ({ poly: cut.circle(x, 0.61, 0.016, 12) })),
        ],
      },
      rod: [0.02, 0.36], rodLean: 4,
    },
    jaw: { parent: "body", joint: [0.58, 0.655], cut: { fill: [cut.poly([[0.52, 0.665], [0.84, 0.66], [0.8, 0.63], [0.6, 0.6], [0.5, 0.63]])] } },
    tail: {
      parent: "body", joint: [-0.4, 0.5],
      cut: { fill: [cut.leaf([-0.38, 0.5], [-1.0, 0.78], 0.13, 20)], holes: [{ poly: cut.leaf([-0.78, 0.68], [-0.95, 0.76], 0.035, 10), gel: "emerald" }] },
    },
    legF: { parent: "body", joint: [0.27, 0.4], cut: { fill: [cut.poly([[0.23, 0.42], [0.32, 0.42], [0.33, 0.04], [0.38, 0.0], [0.27, 0.0], [0.25, 0.05]])] }, rod: [0.31, 0.06], rodLean: 9 },
    legB: { parent: "body", joint: [-0.28, 0.4], cut: { fill: [cut.poly([[-0.34, 0.43], [-0.22, 0.43], [-0.26, 0.2], [-0.24, 0.04], [-0.19, 0.0], [-0.3, 0.0], [-0.32, 0.18]])] }, rod: [-0.26, 0.06], rodLean: 2 },
  },
};
const hillsNear = { fill: [cut.hills(-3.6, 3.6, 0.0, 0.62, 2.2, { seed: 1 })], holes: [
  ...[-2.6, -1.2, 0.4, 1.9, 3.0].map((x, i) => ({ poly: cut.diamond(x, 0.33, 0.14, 0.19), gel: i % 2 ? "amber" : "emerald" })),
  ...[-1.9, -0.4, 1.15, 2.45].map((x) => ({ poly: cut.circle(x, 0.31, 0.025, 12) })),
] };
const hillsFar = { fill: [cut.hills(-3.4, 3.4, 0.0, 0.85, 1.6, { seed: 4 })], holes: [] };
const tree = {
  fill: [cut.poly([[-0.07, 0], [0.07, 0], [0.05, 1.15], [0.2, 1.4], [0.16, 1.43], [0.03, 1.27], [-0.03, 1.27], [-0.16, 1.43], [-0.2, 1.4], [-0.05, 1.15]]), cut.circle(0, 1.62, 0.52, 56)],
  holes: [
    ...Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * 2 * Math.PI + 0.3; return { poly: cut.leaf([0.12 * Math.cos(a), 1.62 + 0.12 * Math.sin(a)], [0.4 * Math.cos(a), 1.62 + 0.4 * Math.sin(a)], 0.06, 12), gel: i % 3 === 0 ? "amber" : "emerald" }; }),
    { poly: cut.circle(0, 1.62, 0.055, 16), gel: "ruby" },
  ],
};
const moon = { fill: [cut.circle(0, 0, 0.34, 64)], holes: [{ poly: cut.crescent(-0.02, 0, 0.27, [0.17, 0.07], 48), gel: "amber" }, { poly: cut.circle(0.12, 0.05, 0.03, 14) }, { poly: cut.circle(0.05, -0.12, 0.022, 12) }] };
export const DESIGNS = { fox, hillsNear, hillsFar, tree, moon };
export const CARD = { hillsFar: 0.3 };   // far hills are thin translucent card: a lighter layer behind the near hills
export const TITLE = { text: "THE TALL TALE", cap: 0.4, weight: 0.21 };

// ---- the show: shadow-space keys against the home lamp (at = where the shadow's origin lands, size = magnification) ----
const LAMP_HOME = { x: 0, y: 2.15, z: -4.0, r: 0.09 };
const FOX_Y = 0.8;
export const SHOW = {
  lamp: {
    home: LAMP_HOME,
    keys: [
      { t: 0, ...LAMP_HOME, level: 1 },
      { t: at("lamp", 0.2), ...LAMP_HOME },
      { t: at("lamp", 1.45), x: 0.85, y: 1.7, z: -3.5, ease: "inOutSine" },
      { t: end("lamp", -0.1), x: -0.75, y: 1.95, z: -3.8, ease: "inOutSine" },
      { t: at("end", 1.1), ...LAMP_HOME, ease: "inOutSine" },
    ],
  },
  actors: {
    hillsFar: { kind: "scenery", keys: [{ t: 0.1, at: [7.6, 0.18], size: 1.12 }, { t: 1.5, at: [0.15, 0.18], ease: "outCubic" }] },
    hillsNear: { kind: "scenery", keys: [{ t: 0.0, at: [-7.6, 0.4], size: 1.02 }, { t: 1.3, at: [0, 0.4], ease: "outCubic" }] },
    tree: { kind: "scenery", keys: [{ t: at("fox", 0.2), at: [6.2, 0.62], size: 1.22 }, { t: at("fox", 1.5), at: [2.25, 0.62], ease: "outCubic", tap: true }] },
    moon: { kind: "scenery", swishMin: 0.5, keys: [{ t: 0, at: [-2.05, 0.2], size: 1.18, op: 0 }, { t: at("end", 0.15), op: 1 }, { t: at("end", 1.7), at: [-2.05, 3.0], ease: "outCubic" }] },
    title: {
      kind: "title", swishMin: 0.3,
      keys: [
        { t: 0.0, at: [0, 2.3], size: 2.4, op: 1 },
        { t: 2.0, at: [0, 2.55], size: 1.04, ease: "outCubic", tap: true },
        { t: at("fox", 0.0), at: [0, 2.55] },
        { t: at("fox", 0.75), at: [0, 4.9], ease: "inCubic", op: 1 },
        { t: at("fox", 0.8), op: 0 },
      ],
    },
    fox: {
      kind: "puppet",
      keys: [
        { t: at("fox", 0.0), at: [-5.2, FOX_Y], size: 1.05 },
        { t: at("fox", 2.5), at: [-0.9, FOX_Y], ease: "outSine", tap: true },
        { t: at("giant", 0.15), at: [-0.9, FOX_Y] },
        { t: at("giant", 2.0), at: [-0.35, 0.6], size: 2.75, ease: "inOutSine", tap: true },
        { t: at("lamp", 0.0), at: [-0.35, 0.6] },
        { t: at("lamp", 0.6), at: [-0.4, 0.62], size: 2.15, ease: "inOutSine" },
        { t: at("end", 0.1), at: [-0.4, 0.62] },
        { t: at("end", 1.4), at: [0.35, FOX_Y], size: 1.05, ease: "inOutSine", tap: true },
      ],
      limbs: {
        legF: { swing: { amp: 24, rate: 1.55, phase: 0, on: [at("fox", 0.0), at("fox", 2.55)] }, steps: true },
        legB: { swing: { amp: 22, rate: 1.55, phase: Math.PI, on: [at("fox", 0.0), at("fox", 2.55)] } },
        tail: {
          base: 4,
          keys: [{ t: 0, a: 0 }, { t: at("giant", 1.8), a: 0 }, { t: at("giant", 2.3), a: 14, ease: "outBack" }, { t: at("end", 0.4), a: 14 }, { t: at("end", 1.2), a: 0 }],
          swing: { amp: 9, rate: 0.9, phase: 0, on: [at("fox", 0.0), DURATION + 1], ramp: 0.6 },
        },
        jaw: { keys: [{ t: 0, a: 0 }, { t: at("giant", 2.0), a: 0 }, { t: at("giant", 2.35), a: -22, ease: "outBack", tap: true }, { t: at("end", 0.2), a: -22 }, { t: at("end", 0.7), a: 0, tap: true }] },
      },
    },
  },
  theme: themeFromBeats(BEATS, {
    title: { notes: [0, 4, 7, 12, 7], step: 0.24, offset: 0.15, gain: 1 },
    fox: { notes: [7, 9, 7, 4], step: 0.2, offset: 0.2, gain: 0.85 },
    giant: { notes: [0, -5, -8, -12], step: 0.34, offset: 0.25, gain: 1.1 },
    lamp: { notes: [4, 7, 4, 2], step: 0.3, offset: 0.25, gain: 0.85 },
    end: { notes: [0, 4, 7, 9, 12], step: 0.22, offset: 0.25, gain: 1 },
  }),
  ripple: { base: 0.35, swish: 0.6, tau: 0.9, max: 1.2 },
};
export const PLAN = planShow(SHOW);

// ---- camera: barely moves; the screen fills the frame (zoom is done with puppets) ----
export const CAMERA = [
  { t: 0, pos: [0, 2.06, 7.45], target: [0, 2.06, 0], fov: 35 },
  { t: at("fox", 0.5), pos: [0, 2.06, 7.05], target: [0, 2.06, 0], fov: 35, ease: "inOutSine" },
  { t: DURATION, pos: [0, 2.06, 6.95], target: [0, 2.06, 0], fov: 35, ease: "inOutSine" },
];

export const OBJECTS = [
  { id: "screen", primitive: "procedural", factory: "screen", dims: {},
    procedural: "shadow-theatre screen: 6.4 x 3.4 m self-lit cloth (shader showing the projector's per-frame transmission map, weave, sag, ripple, hem) in a pine frame with a deep playboard; dark wall with an opening; floor" },
];

// ---- sound: every cue from PLAN.events (swishes, steps, taps, lamp moves, plucked theme). pad brightness = Hz ----
const PLUCK_BASE = 0.5;
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, root: 98, chord: [0, 7, 12, 16, 19], brightness: 650, attack: 1.8, release: 2.2, gain: 0.9 },
  { t: at("giant", 1.0), type: "pad", dur: end("lamp") - at("giant", 1.0), root: 73.4, chord: [0, 7, 10, 15], brightness: 420, attack: 1.2, release: 1.6, gain: 0.45 },
  ...scoreFromEvents(PLAN.events, {
    pluck: (e) => [
      { type: "blip", dur: 0.5, notes: [0], pitch: PLUCK_BASE * 2 ** (e.note / 12), gain: 0.085 * e.gain },
      { type: "blip", dur: 0.32, notes: [0], pitch: PLUCK_BASE * 2 * 2 ** (e.note / 12), gain: 0.025 * e.gain },
      { type: "click", dur: 0.012, pitch: 0.7, gain: 0.05 * e.gain },
    ],
    swish: (e) => [
      { type: "whoosh", dir: "in", dur: Math.min(1.6, Math.max(0.5, e.dur)), pitch: 0.42, q: 0.9, gain: Math.min(0.2, 0.08 + 0.03 * e.dist) },
      { type: "rustle", dur: Math.min(1.4, Math.max(0.4, e.dur * 0.8)), pitch: 0.38, density: 0.18, gain: 0.07 },
    ],
    step: () => [{ type: "clack", pitch: 0.42, gain: 0.09 }],
    tap: (e) => [
      { type: "clack", pitch: e.part === "jaw" ? 0.6 : 0.48, gain: 0.2 },
      ...(e.id === "title" ? [{ type: "thud", dur: 0.5, pitch: 0.7, gain: 0.22 }] : []),
      ...(e.id === "fox" && e.depth > 1.5 ? [{ type: "thud", dur: 1.0, pitch: 0.45, gain: 0.4 }, { type: "rumble", dur: 1.6, pitch: 0.8, gain: 0.25 }] : []),
    ],
    lamp: (e) => [
      { type: "whir", dur: Math.min(1.6, e.dur), hz: 70, hz2: 92, gain: 0.05 },
      { type: "whoosh", dir: "in", dur: Math.min(1.4, e.dur), pitch: 0.5, q: 0.8, gain: 0.08 },
    ],
  }, { pan: (e) => (e.kind === "step" ? (e.part === "legF" ? 0.15 : -0.15) : e.kind === "pluck" ? Math.sin(e.j * 1.3) * 0.25 : 0) }),
];
export const DUCK = [];
export const NOTES = "Every pose, lamp move and sound cue comes from puppetry.planShow(SHOW). Shadows are not shadow maps: each cut-out's baked SDF is read along the lamp ray (penumbra 2 r (1 - s)), multiplied into a transmission map the cloth shader displays.";
