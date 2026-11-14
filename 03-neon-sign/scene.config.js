// scene.config.js — 03-neon-sign: "What is a token?" in glass neon. Plain data only (Node-importable).
// Units: metres (wall = z 0 plane, tubes stand off toward +Z), Y-up, seconds, sRGB hex / palette keys.
export const ID = "03-neon-sign";
export const STYLE = "neon-sign";
export const DURATION = 15;
export const FPS = 30;

export const BEATS = [
  { id: "question", t: 0.3, dur: 1.9 },  // WHAT IS A TOKEN? flickers on, letter by letter (warm white)
  { id: "sentence", t: 2.35, dur: 2.0 }, // CHATBOTS READ TOKENS lights (warm white = plain words)
  { id: "chunks", t: 4.6, dur: 3.2 },    // re-lights as 5 coloured tokens with under-brackets, one per tick
  { id: "ids", t: 7.9, dur: 2.8 },       // token-ID number tubes under each chunk, then the acrylic caption
  { id: "settle", t: 10.8, dur: 4.2 },   // arrow + MODELS READ NUMBERS, NOT WORDS; hold the full sign
];
const at = (id, off = 0) => BEATS.find((b) => b.id === id).t + off;

// Layout (element origin = baseline-centre on the wall; numbers in metres)
export const LAYOUT = {
  question: { text: "WHAT IS A TOKEN?", height: 0.62, y: 2.02, color: "warmWhite", spill: 2, stagger: 0.085, seed: 11 },
  sentence: { text: "CHATBOTS READ TOKENS", height: 0.56, y: 0.8, color: "warmWhite", spill: 3, stagger: 0.06, seed: 23,
    // extra metres before chars 4 (B), 9 (R), 14 (T), 17 (E): every token boundary gets the same visible gap + divider
    gapBefore: { 4: 0.3, 9: 0.06, 14: 0.06, 17: 0.3 } },
  divider: { height: 0.78, color: "warmWhite", gain: 0.55, lead: -0.06 }, // vertical divider tubes between chunks
  bracket: { y: 0.57, h: 0.11, inset: 0.02, cap: 0.34 },
  ids: { height: 0.25, y: 0.1, stagger: 0.035 },
  plate: { text: "WORDS BECOME NUMBERS", height: 0.22, y: -0.62, color: "warmWhite" },
  caption: { text: "MODELS READ NUMBERS, NOT WORDS", height: 0.31, y: -1.5, x: 0.42, color: "amber", spill: 2, stagger: 0.028, seed: 41 },
  arrow: { size: 0.5, x: -3.72, y: -1.35, color: "amber" },
  transformer: { x: 3.95, y: -2.2 },
  cableBusY: -1.98,
  cableSide: 0.22, // cables drop this far right of the sentence's last tube
};

// Each token chunk: char range inside LAYOUT.sentence.text, colour, illustrative token ID, onset.
export const CHUNKS = [
  { text: "CHAT", i0: 0, i1: 3, color: "pink", id: "15592", on: at("chunks", 0.0) },
  { text: "BOTS", i0: 4, i1: 7, color: "cyan", id: "29576", on: at("chunks", 0.6) },
  { text: "READ", i0: 9, i1: 12, color: "amber", id: "1373", on: at("chunks", 1.2) },
  { text: "TOK", i0: 14, i1: 16, color: "violet", id: "11459", on: at("chunks", 1.8) },
  { text: "ENS", i0: 17, i1: 19, color: "lime", id: "727", on: at("chunks", 2.4) },
].map((c, k) => ({ ...c, idOn: at("ids", k * 0.32) }));
export const CHUNK_STAGGER = 0.04;  // letters within a chunk
export const BRACKET_DELAY = 0.12;  // bracket lights just after its chunk
export const PLATE_ON = at("ids", 1.85);
export const ARROW_ON = at("settle", 0);
export const CAPTION_ON = at("settle", 0.3);

export const CAMERA = [
  { t: 0, pos: [-0.55, 0.78, 10.9], target: [-0.18, 0.5, 0], fov: 35 },
  { t: DURATION, pos: [0.4, 0.66, 10.25], target: [0.1, 0.42, 0], fov: 35, ease: "inOutSine" },
];

export const OBJECTS = [
  { id: "wall", primitive: "procedural", factory: "brickWall", procedural: "22x13 m plane at z=0; canvas-painted dark painted running-bond brick (0.30x0.095 m bricks, 13 mm mortar), seeded colour jitter, paint wear chips, fbm grime, water streaks; bump map from the same layout", dims: { width: 22, height: 13, center: [0, 0.3] } },
  { id: "transformer", primitive: "procedural", factory: "transformer", procedural: "wall-mounted neon transformer box 0.5x0.34x0.16 m with flanges, cable glands and a printed rating plate", position: [LAYOUT.transformer.x, LAYOUT.transformer.y, 0] },
  { id: "question", primitive: "procedural", factory: "neonText", procedural: "single-stroke glass tube lettering (style font), tubes on stand-offs 7.5 cm off the wall, dark electrode caps", text: LAYOUT.question.text, textOpts: { height: LAYOUT.question.height, color: LAYOUT.question.color, spill: LAYOUT.question.spill }, position: [0, LAYOUT.question.y, 0] },
  { id: "sentence", primitive: "procedural", factory: "neonText", procedural: "single-stroke glass tube lettering; each letter is an independently lit part", text: LAYOUT.sentence.text, textOpts: { height: LAYOUT.sentence.height, color: LAYOUT.sentence.color, spill: LAYOUT.sentence.spill, gapBefore: LAYOUT.sentence.gapBefore }, position: [0, LAYOUT.sentence.y, 0] },
  { id: "plate", primitive: "procedural", factory: "acrylicPlate", procedural: "lit acrylic caption plate (rounded slab, 4 stand-off screws, system-font text)", text: LAYOUT.plate.text, textOpts: { height: LAYOUT.plate.height, color: LAYOUT.plate.color }, position: [0, LAYOUT.plate.y, 0] },
  { id: "caption", primitive: "procedural", factory: "neonText", procedural: "single-stroke glass tube lettering", text: LAYOUT.caption.text, textOpts: { height: LAYOUT.caption.height, color: LAYOUT.caption.color, spill: LAYOUT.caption.spill }, position: [LAYOUT.caption.x, LAYOUT.caption.y, 0] },
  { id: "arrow", primitive: "procedural", factory: "neonIcon", procedural: "neon arrow icon (shaft + chevron head)", icon: "arrow", dims: { size: LAYOUT.arrow.size, color: LAYOUT.arrow.color, spill: 0 }, position: [LAYOUT.arrow.x, LAYOUT.arrow.y, 0] },
  // brackets, dividers + ID numbers are built in scene.js from CHUNKS (their x comes from the sentence's letter layout)
];

// SCORE: every cue derives from BEATS / CHUNKS.
const chunkPan = (k) => -0.6 + k * 0.3;
export const SCORE = [
  { t: 0, type: "hum", dur: DURATION, gain: 0.16 },                                  // constant transformer hum bed
  { t: 0, type: "hum", dur: DURATION, gain: 0.05, pitch: 2.0, pan: 0.3 },           // 120 Hz overtone layer
  { t: at("question"), type: "buzz", dur: 1.7, flicker: 0.85, gain: 0.42, pan: -0.2 },
  { t: at("question", 0.02), type: "click", gain: 0.5 },
  { t: at("question", 0.45), type: "click", gain: 0.3, pitch: 1.2 },
  { t: at("question", 1.1), type: "click", gain: 0.25, pitch: 0.9 },
  { t: at("sentence"), type: "buzz", dur: 1.6, flicker: 0.8, gain: 0.38, pitch: 1.06 },
  { t: at("sentence", 0.02), type: "click", gain: 0.45, pitch: 1.1 },
  { t: at("sentence", 0.7), type: "click", gain: 0.25 },
  ...CHUNKS.flatMap((c, k) => [
    { t: c.on, type: "tick", gain: 0.75, pan: chunkPan(k) },
    { t: c.on + 0.01, type: "buzz", dur: 0.5, flicker: 0.95, gain: 0.33, pitch: 0.9 + k * 0.06, pan: chunkPan(k) },
    { t: c.on + BRACKET_DELAY, type: "click", gain: 0.35, pitch: 1.3, pan: chunkPan(k) },
  ]),
  ...CHUNKS.flatMap((c, k) => [
    { t: c.idOn, type: "tick", gain: 0.6, pitch: 1.25, pan: chunkPan(k) },
    { t: c.idOn + 0.01, type: "buzz", dur: 0.3, flicker: 0.9, gain: 0.2, pitch: 1.3, pan: chunkPan(k) },
  ]),
  { t: PLATE_ON, type: "clack", gain: 0.55 },
  { t: PLATE_ON + 0.02, type: "buzz", dur: 0.45, flicker: 0.6, gain: 0.25, pitch: 0.8 },
  { t: ARROW_ON, type: "clack", gain: 0.7, pitch: 0.85 },
  { t: ARROW_ON + 0.02, type: "buzz", dur: 0.5, flicker: 0.9, gain: 0.3, pitch: 0.95, pan: -0.5 },
  { t: CAPTION_ON, type: "buzz", dur: 1.4, flicker: 0.75, gain: 0.4, pitch: 0.92 },
  { t: CAPTION_ON + 0.01, type: "click", gain: 0.45 },
];
export const DUCK = [];
export const NOTES = "Brackets and token-ID tubes are built in scene.js from CHUNKS + the sentence letter layout; token IDs are illustrative.";
