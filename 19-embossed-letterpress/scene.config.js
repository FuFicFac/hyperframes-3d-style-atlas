// scene.config.js — 19-embossed-letterpress: "The three parts of a good prompt" as one letterpress card built up
// by presses. Plain data only (Node-importable). Card space: metres, origin at the card centre, x right, y up,
// +z toward the camera (the card lies in the XY plane). Press timing comes from the style's THREE-free plan
// module, so every thud in SCORE lands on the frame where a die touches the paper.
import { planPresses, pressEvents } from "./_atlas/styles/embossed-letterpress/pressplan.js";

export const ID = "19-embossed-letterpress";
export const STYLE = "embossed-letterpress";
export const DURATION = 15;
export const FPS = 30;

export const BEATS = [
  { id: "title", t: 0.0, dur: 2.9 },   // blank card slides onto the board (blind border + seal); foil title stamps in
  { id: "role", t: 2.9, dur: 2.9 },    // I. ROLE — Act as a patient tutor
  { id: "task", t: 5.8, dur: 2.9 },    // II. TASK — Explain photosynthesis
  { id: "format", t: 8.7, dur: 2.9 },  // III. FORMAT — In three short steps
  { id: "finale", t: 11.6, dur: 3.4 }, // light sweeps, foil flashes, CLEAR IN, CLEAR OUT stamps at the bottom
];
const at = (id, off = 0) => BEATS.find((b) => b.id === id).t + off;

// ---- the card ----
export const CARD = { width: 3.4, height: 2.0, slide: { from: [1.7, 0, 0], at: 0, dur: 0.8 } };
export const BOARD = { width: 9, height: 6, color: "#2a2e37" };
const COLX = [-1.13, 0, 1.13];
const column = (i, numeral, word, example) => [
  { type: "text", text: numeral, x: COLX[i], y: 0.2, size: 0.085, font: "display", tracking: 0.12, anchor: "cap" },
  { type: "text", text: word, x: COLX[i], y: 0.035, size: 0.165, font: "display", tracking: 0.07, anchor: "cap" },
  { type: "text", text: example, x: COLX[i], y: -0.16, size: 0.088, font: "text", italic: true, anchor: "cap" },
];
// ≤ 8 relief layers; kinds: emboss (blind, raised) · deboss (blind, pressed) · ink (pressed + spot ink) · foil
export const LAYERS = [
  { id: "border", kind: "emboss", items: [
    { type: "border", inset: 0.075, rules: [{ w: 0.007, gap: 0 }, { w: 0.0025, gap: 0.022 }], corner: { r: 0.044, lobes: 8, loops: 4, ratio: 0.4, w: 0.0026, at: 0.011 } },
    { type: "guilloche", x0: -0.95, x1: 0.95, y: -0.8, amp: 0.018, waves: 26, strands: 4, w: 0.0016 },
    { type: "rosette", x: -1.27, y: -0.53, r: 0.08, lobes: 10, loops: 5, ratio: 0.42, w: 0.0026 },
    { type: "rosette", x: 1.27, y: -0.53, r: 0.08, lobes: 10, loops: 5, ratio: 0.42, w: 0.0026 },
  ] },
  { id: "seal", kind: "emboss", depth: 0.0032, items: [{ type: "seal", x: 0, y: 0.74, r: 0.088, letter: "P", beads: 32 }] },
  { id: "title", kind: "foil", items: [{ type: "text", text: "A GOOD PROMPT", x: 0, y: 0.47, size: 0.205, weight: 700, font: "display", tracking: 0.1, anchor: "cap" }] },
  { id: "rules", kind: "ink", ink: "oxblood", items: [
    { type: "fleuronRule", x0: -0.8, x1: 0.8, y: 0.315, w: 0.0035, diamond: 0.02, gap: 0.03 },
    { type: "rule", x0: -0.565, y0: 0.24, x1: -0.565, y1: -0.22, w: 0.0026 },
    { type: "rule", x0: 0.565, y0: 0.24, x1: 0.565, y1: -0.22, w: 0.0026 },
    { type: "fleuronRule", x0: -0.55, x1: 0.55, y: -0.37, w: 0.003, diamond: 0.016, gap: 0.026 },
  ] },
  { id: "role", kind: "ink", ink: "navy", items: column(0, "I", "ROLE", "Act as a patient tutor") },
  { id: "task", kind: "ink", ink: "navy", items: column(1, "II", "TASK", "Explain photosynthesis") },
  { id: "format", kind: "ink", ink: "navy", items: column(2, "III", "FORMAT", "In three short steps") },
  { id: "final", kind: "foil", items: [{ type: "text", text: "CLEAR IN, CLEAR OUT", x: 0, y: -0.53, size: 0.118, weight: 700, font: "display", tracking: 0.16, anchor: "cap" }] },
];
// layers that are on the sheet before any press, and layers that grow in without a die
export const PRESSED_AT_START = ["border", "seal"];
export const GROW = [{ id: "rules", t: at("title", 2.05), dur: 0.7 }];

// ---- presses (die face centre + size on the card; contact time) ----
export const PRESSES = planPresses([
  { id: "title", at: at("title", 1.55), x: 0, y: 0.47, w: 2.15, h: 0.34, kind: "foil", from: [0, 1.9, 1.4] },
  { id: "role", at: at("role", 0.8), x: COLX[0], y: 0.02, w: 0.98, h: 0.56, kind: "ink", from: [-0.2, 1.8, 1.3] },
  { id: "task", at: at("task", 0.8), x: COLX[1], y: 0.02, w: 0.98, h: 0.56, kind: "ink", from: [0, 1.8, 1.3] },
  { id: "format", at: at("format", 0.8), x: COLX[2], y: 0.02, w: 0.98, h: 0.56, kind: "ink", from: [0.2, 1.8, 1.3] },
  { id: "final", at: at("finale", 1.25), x: 0, y: -0.53, w: 1.95, h: 0.22, kind: "foil", from: [0, -1.8, 1.3] },
]);
export const EVENTS = pressEvents(PRESSES);

// ---- light: raking key azimuth (rad around the card normal, 0 = from +x, pi/2 = from the top) / elevation ----
export const LIGHT = {
  azimuth: [{ t: 0, v: 2.62 }, { t: at("finale"), v: 2.2 }, { t: at("finale", 1.3), v: 0.85 }, { t: 15, v: 0.62 }],
  elevation: [{ t: 0, v: 0.31 }, { t: at("finale"), v: 0.34 }, { t: at("finale", 1.3), v: 0.3 }, { t: 15, v: 0.32 }],
  intensity: [{ t: 0, v: 0.88 }, { t: 0.8, v: 1 }],
};
// foil highlight band sweeps (level/pos from pressplan.flashAt)
export const FLASHES = [
  { t: PRESSES[0].reveal - 0.05, dur: 1.2, from: -0.55, to: 0.55, peak: 0.85 },
  { t: at("finale", 0.1), dur: 1.4, from: -0.6, to: 0.6, peak: 1 },
  { t: PRESSES[4].reveal, dur: 1.3, from: -0.6, to: 0.6, peak: 1 },
];

// ---- camera: macro, slow; push to each press, pull back for the finale ----
export const CAMERA = [
  { t: 0, pos: [0.2, -0.9, 5.15], target: [0, 0.0, 0], fov: 26 },
  { t: at("title", 2.9), pos: [0.12, -0.82, 4.9], target: [0, 0.03, 0], fov: 26, ease: "inOutSine" },
  { t: at("role", 0.85), pos: [-0.72, -0.62, 3.0], target: [-0.8, 0.03, 0], fov: 26 },
  { t: at("role", 2.9), pos: [-0.7, -0.6, 2.85], target: [-0.8, 0.03, 0], fov: 26, ease: "inOutSine" },
  { t: at("task", 0.85), pos: [0.06, -0.62, 3.0], target: [0, 0.03, 0], fov: 26 },
  { t: at("task", 2.9), pos: [0.04, -0.6, 2.85], target: [0, 0.03, 0], fov: 26, ease: "inOutSine" },
  { t: at("format", 0.85), pos: [0.84, -0.62, 3.0], target: [0.8, 0.03, 0], fov: 26 },
  { t: at("format", 2.9), pos: [0.8, -0.6, 2.85], target: [0.8, 0.03, 0], fov: 26, ease: "inOutSine" },
  { t: at("finale", 1.1), pos: [0, -0.92, 5.05], target: [0, -0.02, 0], fov: 26 },
  { t: 15, pos: [0, -0.88, 4.88], target: [0, -0.02, 0], fov: 26, ease: "inOutSine" },
];

// The board is the only spec object; the relief card, dies and light rig are built in scene.js from the style.
export const OBJECTS = [
  { id: "board", primitive: "procedural", factory: "board", procedural: "charcoal cotton board under the card (9x6 m plane, fibre relief, receives the card's raking shadow sliver)", dims: { width: 9, height: 6, color: "#2a2e37" }, position: [0, 0, -0.006] },
];

// ---- sound: every cue derives from the press plan / BEATS ----
const voice = {
  approach: (e, i) => [{ t: e.t, type: "whoosh", dir: "in", dur: 0.7, pitch: 0.42, q: 0.8, gain: 0.22, pan: e.x * 0.25, seed: 10 + i }],
  contact: (e, i) => [
    { t: e.t, type: "thud", dur: 0.65, pitch: 0.42, gain: 0.5, pan: e.x * 0.2, seed: 30 + i },
    { t: e.t + 0.012, type: "paper", dur: 0.38, density: 0.22, pitch: 0.55, gain: 0.42, pan: e.x * 0.25, seed: 50 + i },
  ],
  lift: (e, i) => [{ t: e.t + 0.03, type: "paper", dur: 0.42, density: 0.12, pitch: 0.75, gain: 0.26, pan: e.x * 0.25, seed: 70 + i }],
  reveal: () => [],
  foil: (e, i) => [
    { t: e.t, type: "sparkle", dur: 1.1, pitch: 1.15, gain: 0.2, pan: 0, seed: 90 + i },
    { t: e.t + 0.04, type: "chime", dur: 1.8, pitch: 0.8, gain: 0.07, seed: 110 + i },
  ],
};
export const SCORE = [
  // quiet room bed: warm low pad (brightness = low-pass cutoff in Hz) + a little air
  { t: 0, type: "pad", dur: DURATION, root: 98, chord: [0, 7, 12, 16, 19], brightness: 650, attack: 2.2, release: 3, gain: 0.42 },
  { t: 0, type: "rumble", dur: DURATION, pitch: 0.5, gain: 0.035, seed: 3 },
  // the card slides onto the board
  { t: CARD.slide.at + 0.02, type: "paper", dur: 0.75, density: 0.3, pitch: 0.7, gain: 0.45, pan: 0.3, seed: 5 },
  ...EVENTS.flatMap((e, i) => voice[e.kind](e, i)),
  // finale: the light sweep and its foil flash
  { t: at("finale", 0.05), type: "whoosh", dir: "in", dur: 1.4, pitch: 0.38, q: 0.7, gain: 0.16, seed: 130 },
  { t: FLASHES[1].t + FLASHES[1].dur * 0.45, type: "sparkle", dur: 1.2, pitch: 1.3, gain: 0.16, seed: 131 },
];
export const DUCK = [];
export const NOTES = "Card, dies and light rig are built in scene.js from embossed-letterpress props (reliefSheet with LAYERS, pressDie per PRESSES, rakingLight with LIGHT keys).";
