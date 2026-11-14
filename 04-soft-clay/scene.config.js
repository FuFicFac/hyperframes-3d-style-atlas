// scene.config.js — 04-soft-clay: "What is training data?" as a claymation tabletop.
// Plain data + pure helpers. No THREE, no window: imported by scene.js (browser), render-sfx.mjs and
// export-spec.mjs (Node). Units: metres, Y-up, radians, seconds, sRGB hex / palette names.
// Set: paper sweep, floor y = 0. Pile of examples on the left, the clay machine centre-back, output right.
export const ID = "04-soft-clay";
export const STYLE = "soft-clay";
export const DURATION = 15;
export const FPS = 30;
export const POSE_FPS = 15; // object motion on twos (mirrors STYLE_SPEC.tuning.fps)

export const BEATS = [
  { id: "pile", t: 0.2, dur: 2.6 },   // examples pop onto the table
  { id: "feed", t: 2.8, dur: 3.4 },   // they hop one by one into the funnel
  { id: "knead", t: 6.2, dur: 2.5 },  // the machine squishes and wobbles
  { id: "out", t: 8.7, dur: 3.1 },    // a mixed lump rolls out, re-forms into a brain, lights up
  { id: "plaque", t: 11.8, dur: 3.2 },// AI LEARNS FROM EXAMPLES
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => B[id].t + off;

export const MACHINE = { pos: [0.2, 0, -0.75], mouthLift: 0.18 };

// Examples: built from style.props[make]; `pop` = entrance time, `hop` = take-off time (flight HOP.dur).
export const ITEMS = [
  { id: "book", make: "book", opts: { color: "tomato", band: "sun", seed: 11 }, pos: [-3.25, 0, 0.35], rotY: 0.35, scale: 0.95, pop: at("pile", 0.15), hop: at("feed", 0.25) },
  { id: "photo", make: "photo", opts: { frame: "sun", sky: "sky", seed: 21 }, pos: [-2.35, 0, -0.55], rotY: 0.15, scale: 0.95, pop: at("pile", 0.4), hop: at("feed", 1.0) },
  { id: "bubble", make: "bubble", opts: { color: "mint", seed: 31 }, pos: [-3.55, 0, -0.75], rotY: 0.3, scale: 0.85, pop: at("pile", 0.65), hop: at("feed", 1.75) },
  { id: "note", make: "note", opts: { color: "grape", seed: 41 }, pos: [-1.75, 0, 0.45], rotY: -0.1, scale: 0.95, pop: at("pile", 0.9), hop: at("feed", 2.5) },
];
export const HOP = { dur: 0.55, height: 0.4, sink: 0.28, spin: 0.25 };

// Output: the mixed lump leaves the chute, drops, rolls right, then squishes and re-forms as a brain.
export const OUTPUT = {
  squash: at("out", 0.05),      // machine big squeeze
  emerge: at("out", 0.15), emergeDur: 0.3,
  drop: at("out", 0.45), dropDur: 0.3,
  roll: at("out", 0.85), rollDur: 0.55,
  morph: at("out", 1.45), morphDur: 0.5,
  glow: at("out", 1.8), glowDur: 0.6,
  rays: at("out", 1.9),
  marbleR: 0.4, brainR: 0.55,
  land: [2.15, 0, -0.7], rest: [3.2, 0, -0.85],
};

export const KNEAD = { start: at("knead", 0.1), end: at("knead", 2.4), cycles: 4 };

// Beat labels: stamped clay plaques hung on clay strings. in/out = start of the drop-in / squish-out.
export const LABELS = [
  { id: "l1", text: "EXAMPLES", cap: 0.27, pos: [-2.6, 1.55, 0.5], in: at("pile", 0.75), out: at("pile", 2.25), color: "cream", letter: "ink", rim: "tomato" },
  { id: "l2", text: "IN THEY GO", cap: 0.25, pos: [1.8, 1.35, 0.6], in: at("feed", 0.65), out: at("feed", 2.85), color: "cream", letter: "ink", rim: "sky" },
  { id: "l3", text: "FIND\nPATTERNS", cap: 0.27, pos: [-2.35, 1.25, -0.1], in: at("knead", 0.15), out: at("knead", 2.1), color: "cream", letter: "ink", rim: "leaf" },
  { id: "l4", text: "A MODEL", cap: 0.27, pos: [3.05, 1.75, -0.1], in: at("out", 1.2), out: at("out", 2.75), color: "cream", letter: "ink", rim: "bubblegum" },
];
export const LABEL_DROP = 0.45; // s for the drop-in (from above, on its strings) and squish-out

// Final plaque.
export const PLAQUE = {
  text: "AI LEARNS\nFROM EXAMPLES", cap: 0.38, pos: [-0.25, 0, 2.8], lean: -0.6,
  drop: at("plaque", 0.1), dropDur: 0.35, lettersAt: at("plaque", 0.5), letterStep: 0.07,
  words: ["tomato", "ink", "ink", "teal"], // colour per word (AI / LEARNS / FROM / EXAMPLES)
};

// Camera: low three-quarter tabletop view; one slow move per beat; follows the action left -> right.
export const CAMERA = [
  { t: 0.0, pos: [-2.2, 2.55, 6.6], target: [-2.35, 0.75, -0.2], fov: 30 },
  { t: 2.6, pos: [-1.35, 2.8, 7.4], target: [-1.2, 0.9, -0.2], fov: 30, ease: "inOutSine" },
  { t: 3.7, pos: [-0.8, 3.2, 8.5], target: [-0.65, 1.2, -0.3], fov: 30, ease: "inOutSine" },
  { t: 5.6, pos: [-0.2, 3.5, 9.1], target: [-0.1, 1.4, -0.3], fov: 30, ease: "inOutCubic" },
  { t: 8.4, pos: [-0.5, 2.95, 7.9], target: [-0.45, 1.2, -0.5], fov: 30, ease: "inOutSine" },
  { t: 11.2, pos: [1.45, 2.6, 7.3], target: [1.6, 1.0, -0.3], fov: 30, ease: "inOutCubic" },
  { t: 12.9, pos: [0.45, 5.6, 10.6], target: [0.5, 0.55, 0.4], fov: 30, ease: "inOutCubic" },
  { t: 15.0, pos: [0.45, 5.35, 10.1], target: [0.5, 0.55, 0.4], fov: 30, ease: "inOutSine" },
];

export const OBJECTS = [
  { id: "sweep", primitive: "procedural", factory: "sweep", procedural: "seamless paper sweep: 40 m wide floor curving (r 6 m) into a back wall at z = -12", dims: { width: 40, depth: 24, height: 14, radius: 6 } },
  { id: "machine", primitive: "procedural", factory: "hopper", procedural: "chunky clay machine: rounded teal body, yellow funnel on top, orange chute on the right, crank on the left, three buttons", dims: {}, position: MACHINE.pos },
];

// ---------------------------------------------------------------- SCORE (every cue from BEATS / data)
const pan = (x) => Math.max(-0.75, Math.min(0.75, x / 4));
const q = (t) => Math.floor(t * POSE_FPS + 1e-6) / POSE_FPS; // sounds land on the pose they belong to
const squish = (t, g = 0.5, p = 1, x = 0) => [
  { t, type: "bubble", dur: 0.16, gain: g * 0.9, pitch: 0.42 * p, pan: pan(x) },
  { t: t + 0.01, type: "thud", dur: 0.3, gain: g * 0.55, pitch: 1.5 * p, pan: pan(x) },
  { t, type: "paper", dur: 0.22, gain: g * 0.35, pitch: 0.55 * p, density: 0.8, pan: pan(x) },
];
const plop = (t, g = 0.5, p = 1, x = 0) => [
  { t, type: "pop", gain: g, pitch: 0.55 * p, pan: pan(x) },
  { t: t + 0.02, type: "thud", dur: 0.25, gain: g * 0.5, pitch: 1.9 * p, pan: pan(x) },
];
const items = ITEMS.flatMap((it, i) => [
  ...plop(q(it.pop), 0.48, 1 + i * 0.08, it.pos[0]),
  { t: it.hop - 0.1, type: "bubble", dur: 0.1, gain: 0.35, pitch: 0.8 + i * 0.07, pan: pan(it.pos[0]) },       // crouch/boing
  { t: it.hop, type: "whoosh", dir: "in", dur: HOP.dur, gain: 0.18, pitch: 1.2, q: 1.4, pan: pan(it.pos[0] / 2) },
  ...squish(it.hop + HOP.dur, 0.5, 0.9 + i * 0.05, MACHINE.pos[0]),                                                  // into the funnel
]);
const labels = LABELS.flatMap((l) => [
  { t: q(l.in + LABEL_DROP * 0.55), type: "thud", dur: 0.3, gain: 0.32, pitch: 1.35, pan: pan(l.pos[0]) },
  { t: q(l.in + LABEL_DROP * 0.55), type: "click", gain: 0.22, pitch: 0.8, pan: pan(l.pos[0]) },
  { t: q(l.out), type: "bubble", dur: 0.12, gain: 0.25, pitch: 0.6, pan: pan(l.pos[0]) },
]);
const kneadCues = Array.from({ length: KNEAD.cycles * 2 }, (_, k) => KNEAD.start + ((k + 0.5) / (KNEAD.cycles * 2)) * (KNEAD.end - KNEAD.start))
  .flatMap((t, k) => squish(q(t), 0.42 + 0.12 * Math.sin((k / (KNEAD.cycles * 2)) * Math.PI), 0.8 + (k % 2) * 0.25, MACHINE.pos[0] + (k % 2 ? 0.8 : -0.8)));
const crankTicks = Array.from({ length: 10 }, (_, k) => ({ t: q(KNEAD.start + 0.12 + k * 0.24), type: "clack", gain: 0.13, pitch: 0.7 + (k % 2) * 0.15, pan: -0.25 }));
const letterCount = PLAQUE.text.replace(/[\s\n]/g, "").length;
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: 0.11, root: 196.0, chord: [0, 4, 7, 14], attack: 1.8, release: 2.5, brightness: 900 },
  ...items,
  ...labels,
  { t: KNEAD.start, type: "rumble", dur: KNEAD.end - KNEAD.start, gain: 0.22, pitch: 1.4 },
  ...kneadCues,
  ...crankTicks,
  // output: squeeze, squelch out, drop, roll, squish-and-re-form, glow
  ...squish(q(OUTPUT.squash), 0.65, 0.7, MACHINE.pos[0]),
  { t: q(OUTPUT.emerge), type: "bubble", dur: 0.3, gain: 0.45, pitch: 0.3, pan: pan(1.5) },
  ...plop(q(OUTPUT.drop + OUTPUT.dropDur), 0.6, 0.8, OUTPUT.land[0]),
  { t: OUTPUT.roll, type: "rumble", dur: OUTPUT.rollDur + 0.1, gain: 0.2, pitch: 2.4 },
  ...squish(q(OUTPUT.morph), 0.55, 1.0, OUTPUT.rest[0]),
  ...plop(q(OUTPUT.morph + OUTPUT.morphDur * 0.5), 0.4, 1.3, OUTPUT.rest[0]),
  { t: OUTPUT.glow, type: "chime", dur: 1.8, gain: 0.26, pitch: 1.0, sparkle: true, notes: 5, pan: pan(OUTPUT.rest[0]) },
  // plaque: whoosh down, big clay slap, letters pop on (one per pose, rising pitch), soft final chime
  { t: PLAQUE.drop - 0.25, type: "whoosh", dir: "in", dur: 0.5, gain: 0.25, pitch: 0.8 },
  ...squish(q(PLAQUE.drop + PLAQUE.dropDur), 0.75, 0.75, 0),
  ...Array.from({ length: letterCount }, (_, i) => ({ t: q(PLAQUE.lettersAt + i * PLAQUE.letterStep), type: "pop", gain: 0.22, pitch: 0.75 + i * 0.03, pan: ((i % 5) - 2) * 0.12 })),
  { t: PLAQUE.lettersAt + letterCount * PLAQUE.letterStep + 0.15, type: "chime", dur: 2.0, gain: 0.24, pitch: 0.75, notes: 4 },
];
export const DUCK = [];
export const NOTES = {
  machine: MACHINE, items: ITEMS, hop: HOP, output: OUTPUT, knead: KNEAD, labels: LABELS, plaque: PLAQUE,
  posing: "Object motion is evaluated at tq = floor(t*15)/15 (on twos); the camera uses t. style.setPose(t) shifts the clay micro-surface per pose.",
};
