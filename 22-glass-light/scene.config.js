// scene.config.js — 22-glass-light: "Multimodal AI: many inputs, one model" on an optics bench.
// Plain data only (Node-importable). Units: metres (bench = y 0), Y-up, radians, seconds, sRGB hex.
// Beam paths are NOT stored here: scene.js traces them every frame from the pieces' keyed transforms
// (styles/glass-light/optics.js). Sound cues derive from BEATS and the CUES below.

export const ID = "22-glass-light";
export const STYLE = "glass-light";
export const DURATION = 15;
export const FPS = 30;

export const BEATS = [
  { id: "inputs", t: 0.0, dur: 3.4 },   // dark bench; TEXT / IMAGE / AUDIO beams switch on and travel
  { id: "encode", t: 3.4, dur: 3.0 },   // each beam's own glass piece slides in; beams bend toward the centre
  { id: "fuse", t: 6.4, dur: 3.0 },     // the three meet inside the faceted block, which glows
  { id: "answer", t: 9.4, dur: 3.0 },   // one white beam exits right; the prism fans it into a spectrum
  { id: "mind", t: 12.4, dur: 2.6 },    // slow orbit, glints, final title
];
const at = (id, off = 0) => BEATS.find((b) => b.id === id).t + off;

export const H = 0.55;                  // beam height above the bench
export const CORE = [0, H, 0];          // where the inputs meet (inside the gem)

// ---- inputs: emitter group origin (bench), colour, switch-on time, tone (Hz) ----
export const INPUTS = [
  { id: "text", label: "TEXT", color: "#3fe3ff", pos: [-5.1, 0, -1.4], on: at("inputs", 0.75), hz: 220.0, piece: "lensT" },
  { id: "image", label: "IMAGE", color: "#ff3fc8", pos: [-5.1, 0, 0.0], on: at("inputs", 1.3), hz: 277.18, piece: "blockI" },
  { id: "audio", label: "AUDIO", color: "#ffb23a", pos: [-5.1, 0, 1.4], on: at("inputs", 1.85), hz: 329.63, piece: "wedgeA" },
];
export const WHITE = { on: at("answer", 0.2), color: "#fff4e6", dir: [1, -0.075, 0] };
export const SPEED = 4.2;               // m/s beam head travel (= spec.beam.speed)

// ---- glass pieces: kind + options + keyed transforms [{ t, pos, rot, ease }] ----
export const PIECES = [
  { id: "core", kind: "gem", opts: { w: 1.3, h: 1.1, d: 1.3, edge: 0.28, corner: 0.32, tint: "clear", refract: 0.16 },
    keys: [{ t: 0, pos: [0, 0, 0], rot: [0, 0, 0] }] },
  { id: "lensT", kind: "lens", opts: { radius: 0.42, R: 0.9, tint: "cyan", density: 1.2, mountHeight: 0.55 },
    keys: [{ t: 0, pos: [-2.7, H, -2.35], rot: [0, 0, 0] }, { t: at("encode", 0.45), pos: [-2.7, H, -2.35], rot: [0, 0, 0] },
           { t: at("encode", 1.35), pos: [-2.7, H, -1.15], rot: [0, 0, 0], ease: "inOutCubic" }] },
  { id: "blockI", kind: "block", opts: { w: 0.5, h: 0.85, d: 0.5, tint: "magenta", density: 1.4 },
    keys: [{ t: 0, pos: [-2.2, 0, -0.85], rot: [0, 0.1, 0] }, { t: at("encode", 0.1), pos: [-2.2, 0, -0.85], rot: [0, 0.1, 0] },
           { t: at("encode", 0.95), pos: [-2.2, 0, 0], rot: [0, 0.45, 0], ease: "inOutCubic" }] },
  { id: "wedgeA", kind: "poly", opts: { pts: [[-0.24, -0.22], [0.24, -0.22], [0, 0.36]], height: 0.85, tint: "amber", density: 1.4 },
    keys: [{ t: 0, pos: [-2.7, 0, 2.6], rot: [0, 0, 0] }, { t: at("encode", 0.8), pos: [-2.7, 0, 2.6], rot: [0, 0, 0] },
           { t: at("encode", 1.7), pos: [-2.7, 0, 1.4], rot: [0, 0, 0], ease: "inOutCubic" }] },
  { id: "prism", kind: "prism", opts: { side: 0.8, height: 0.75, tint: "clear" },
    keys: [{ t: 0, pos: [2.1, 0, 0], rot: [0, -0.13, 0] }, { t: at("answer", 1.5), pos: [2.1, 0, 0], rot: [0, -0.13, 0] },
           { t: at("answer", 2.9), pos: [2.1, 0, 0], rot: [0, -0.31, 0], ease: "inOutSine" },
           { t: at("mind", 2.4), pos: [2.1, 0, 0], rot: [0, -0.07, 0], ease: "inOutSine" }] },
  // set dressing: smoke sphere and a green rod catch the light but stay out of every beam
  { id: "ball", kind: "sphere", opts: { r: 0.3, tint: "smoke", density: 1.0 }, keys: [{ t: 0, pos: [0.9, 0, -2.05], rot: [0, 0, 0] }] },
  { id: "rodG", kind: "rod", opts: { r: 0.075, length: 1.3, tint: "green", density: 1.2 }, keys: [{ t: 0, pos: [-3.4, 0.075, -2.45], rot: [0, 0.32, 0] }] },
];

// ---- cue times (derived from BEATS) ----
export const CUES = {
  engage: { blockI: at("encode", 0.6), lensT: at("encode", 1.0), wedgeA: at("encode", 1.35) }, // piece crosses its beam
  encoded: at("encode", 1.0),            // packets start to travel after each piece
  fuse: at("fuse", 0.45),                // block glows
  white: WHITE.on,
  prismHit: WHITE.on + 2.0 / SPEED,      // white head reaches the prism (~2 m)
  fanLand: WHITE.on + 5.3 / SPEED,       // spectrum lands on the bench
  sweep: at("answer", 1.4),
  title: at("mind", 0.4),
};

// ---- type: one fixed caption region (lower left) with a hairline leader to the subject ----
export const CAPTIONS = [
  { id: "inputs", text: "MANY INPUTS", sub: "TEXT · IMAGE · AUDIO", on: at("inputs", 1.55), off: at("inputs", 3.05), anchor: null },
  { id: "numbers", text: "EACH BECOMES NUMBERS", on: at("encode", 0.75), off: at("encode", 2.65), anchor: "lensT" },
  { id: "together", text: "ONE MODEL SEES THEM TOGETHER", on: at("fuse", 0.55), off: at("fuse", 2.6), anchor: "core" },
  { id: "answer", text: "ONE ANSWER, DRAWN FROM ALL OF IT", on: at("answer", 0.95), off: at("answer", 2.7), anchor: "fan" },
];
export const TITLE = { text: "MULTIMODAL = MANY SENSES, ONE MIND", y: -0.7, size: 0.78, on: CUES.title };
export const CAPTION_POS = { x: -0.84, y: -0.76 };

// ---- camera: one slow orbit (arc keys), easing to near-holds on the beats ----
export const CAMERA = [
  { t: 0, pos: [-6.2, 3.6, 8.0], target: [-2.7, 0.45, 0.2], fov: 30 },
  { t: at("encode"), pos: [-4.7, 3.6, 8.5], target: [-2.0, 0.45, 0.1], fov: 30, path: "arc", ease: "inOutSine" },
  { t: at("fuse"), pos: [-1.9, 3.1, 8.4], target: [-1.0, 0.5, -0.1], fov: 30, path: "arc", ease: "inOutSine" },
  { t: at("answer"), pos: [1.7, 3.1, 8.2], target: [1.0, 0.45, -0.5], fov: 30, path: "arc", ease: "inOutSine" },
  { t: at("mind"), pos: [3.6, 3.3, 8.0], target: [1.7, 0.35, -0.7], fov: 30, path: "arc", ease: "inOutSine" },
  { t: DURATION, pos: [-0.2, 4.7, 11.4], target: [-1.0, 0.3, -0.3], fov: 30, path: "arc", ease: "inOutSine" },
];
export const FOCUS = [
  { t: 0, v: [-4.6, 0.55, 0] }, { t: at("encode"), v: [-2.6, 0.55, -0.4] }, { t: at("fuse"), v: [-0.6, 0.55, 0] },
  { t: at("answer", 0.5), v: [0.6, 0.55, 0] }, { t: at("mind"), v: [2.4, 0.3, -0.6] }, { t: DURATION, v: [0, 0.4, -0.2] },
];

export const OBJECTS = [
  { id: "bench", primitive: "procedural", factory: "bench", procedural: "dark matte bench + back cove (44x26 m cyclorama, 6 m cove) whose floor is a faint blurred planar mirror", dims: {} },
  ...INPUTS.map((i) => ({ id: `emit-${i.id}`, primitive: "procedural", factory: "emitter", text: i.label, position: i.pos,
    procedural: `light-source head (0.95x0.42x0.58 m dark anodised box on a pedestal) with a glowing aperture on +X and an engraved "${i.label}" label`, dims: { color: i.color } })),
  ...PIECES.map((p) => ({ id: p.id, primitive: "procedural", factory: "glass", position: p.keys[0].pos, rotation: p.keys[0].rot,
    procedural: `glass ${p.kind} (${p.opts.tint ?? "clear"}) — custom screen-space-refraction glass shader; convex shape for the ray tracer`, dims: { kind: p.kind, mount: p.kind === "lens", ...p.opts } })),
];

// ---- sound: every cue derives from BEATS / INPUTS / CUES. pad brightness = low-pass cutoff in Hz ----
const toneEnd = at("answer", 0.6);
export const SCORE = [
  // quiet dark bed
  { t: 0, type: "pad", dur: DURATION, root: 55, chord: [0, 7, 12, 19], brightness: 360, attack: 2.2, release: 2.5, gain: 0.2 },
  // 1 inputs: switch click + glassy ping + a sustained soft tone per beam (A3 / C#4 / E4 = A major when they meet)
  ...INPUTS.flatMap((i, k) => [
    { t: i.on, type: "tick", gain: 0.3, pitch: 0.8 + k * 0.15, seed: 11 + k },
    { t: i.on, type: "chime", dur: 1.8, pitch: (i.hz * 4) / 880, gain: 0.09, pan: -0.4, seed: 21 + k },
    { t: i.on, type: "pad", bus: "music", dur: toneEnd - i.on, root: i.hz, chord: [0, 12], brightness: 1500, attack: 0.35, release: 1.6, gain: 0.11, pan: -0.3 + k * 0.3, seed: 31 + k },
  ]),
  { t: INPUTS[0].on - 0.2, type: "whoosh", dir: "in", dur: 1.6, pitch: 0.5, gain: 0.22, pan: -0.5, seed: 5 },
  // 2 encode: a glassy chime as each piece crosses its beam + a soft slide whoosh
  ...INPUTS.flatMap((i, k) => [
    { t: CUES.engage[i.piece] - 0.5, type: "whoosh", dir: "in", dur: 0.7, pitch: 0.7, gain: 0.16, pan: -0.4, seed: 41 + k },
    { t: CUES.engage[i.piece], type: "chime", dur: 2.2, pitch: (i.hz * 8) / 880 / 2, gain: 0.16, pan: -0.3 + k * 0.3, seed: 51 + k },
    { t: CUES.engage[i.piece] + 0.04, type: "sparkle", dur: 0.8, pitch: 1.0 + k * 0.15, gain: 0.07, seed: 61 + k },
  ]),
  { t: CUES.encoded, type: "blip", dur: 0.06, notes: [0, 7, 12, 7], pitch: 0.5, gain: 0.05, seed: 7 },
  // 3 fuse: riser into a deep resonant swell, the chord blooms, sub hit + rumble
  { t: CUES.fuse - 1.3, type: "riser", dur: 1.3, pitch: 0.5, gain: 0.2 },
  { t: CUES.fuse, type: "thud", dur: 1.6, pitch: 0.38, gain: 0.7 },
  { t: CUES.fuse, type: "rumble", dur: 3.2, pitch: 0.6, gain: 0.38 },
  { t: CUES.fuse - 0.2, type: "pad", bus: "music", dur: 5.4, root: 110, chord: [0, 4, 7, 12, 16], brightness: 900, attack: 0.9, release: 2.2, gain: 0.22, seed: 71 },
  { t: CUES.fuse + 0.05, type: "chime", dur: 2.6, pitch: 0.5, gain: 0.2, seed: 72 },
  // 4 answer: white beam leaves (soft whoosh), prism ping, spectrum lands (sparkle), sweep shimmer
  { t: CUES.white, type: "whoosh", dir: "in", dur: 0.8, pitch: 0.6, gain: 0.3, pan: 0.2, seed: 81 },
  { t: CUES.prismHit, type: "chime", dur: 2.0, pitch: 1.0, gain: 0.2, pan: 0.35, seed: 82 },
  { t: CUES.fanLand, type: "sparkle", dur: 1.4, pitch: 0.8, notes: 9, gain: 0.16, pan: 0.45, seed: 83 },
  { t: CUES.fanLand, type: "chime", dur: 2.4, pitch: 1.26, gain: 0.12, pan: 0.45, seed: 84 },
  { t: CUES.sweep + 0.1, type: "whoosh", dir: "in", dur: 1.4, pitch: 0.45, gain: 0.18, pan: 0.4, seed: 85 },
  { t: CUES.sweep + 0.4, type: "sparkle", dur: 1.2, pitch: 1.1, gain: 0.08, pan: 0.5, seed: 86 },
  // 5 mind: low chime + soft sub on the title, warm pad tail
  { t: CUES.title, type: "chime", dur: 2.6, pitch: 0.5, gain: 0.2, seed: 91 },
  { t: CUES.title, type: "thud", dur: 1.4, pitch: 0.4, gain: 0.45, seed: 92 },
  { t: CUES.title + 0.15, type: "sparkle", dur: 1.4, pitch: 0.9, gain: 0.08, seed: 93 },
  { t: CUES.title - 0.3, type: "pad", bus: "music", dur: DURATION - CUES.title + 0.3, root: 220, chord: [0, 4, 7, 11], brightness: 1100, attack: 1.2, release: 1.4, gain: 0.14, seed: 94 },
];
export const DUCK = [];
export const NOTES = "Beam paths are traced every frame (styles/glass-light/optics.js) from the PIECES' keyed transforms: Snell refraction, TIR, per-wavelength IOR for the prism fan. The three inputs stop at the point inside the gem closest to CORE; the white answer beam starts at CORE.";
