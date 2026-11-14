// scene.config.js — 12-studio-product: "On-device AI: the chip in your pocket" as a product commercial.
// Plain data only (Node-importable). Units: metres (floor = y 0, hero at the origin), Y-up, seconds.
// Sweeps, glows and shots come from the style's THREE-free plan module, so SCORE uses the same times.
import { sweepPeak, shotKeys, wavePlan } from "./_atlas/styles/studio-product/lightplan.js";

export const ID = "12-studio-product";
export const STYLE = "studio-product";
export const DURATION = 15;
export const FPS = 30;

export const BEATS = [
  { id: "reveal", t: 0.0, dur: 3.8 },  // black → rim traces the lid edge → strip sweep reveals the chip: ON-DEVICE AI
  { id: "neural", t: 3.8, dur: 2.8 },  // macro arc over the surface; one etched region glows: NEURAL ENGINE
  { id: "wave", t: 6.6, dur: 2.8 },    // top-down: more regions pulse in a wave: RUNS WITHOUT THE CLOUD
  { id: "private", t: 9.4, dur: 2.8 }, // pull back, chip rotating, floor reflection: PRIVATE BY DEFAULT
  { id: "hero", t: 12.2, dur: 2.8 },   // hero three-quarter, final sweep: AI THAT STAYS WITH YOU
];
const at = (id, off = 0) => BEATS.find((b) => b.id === id).t + off;

// ---- the hero: a generic, unbranded system-on-chip package (metres; the scene scales it up for the set) ----
export const CHIP = {
  lift: 0.22,                                                     // floats above the floor on the invisible turntable
  substrate: { w: 2.6, h: 0.12, radius: 0.07, bevel: 0.012 },     // satin dark ceramic
  pads: { perSide: 21, length: 0.15, width: 0.045, height: 0.012, inset: 0.05, rows: 1 }, // gold
  lid: { w: 1.86, h: 0.1, radius: 0.12, bevel: 0.022 },           // brushed aluminium heat-spreader frame
  window: { w: 1.22, radius: 0.05, recess: 0.012 },               // black glass die under the lid window
  grid: { cols: 6, rows: 6, gap: 0.085, seed: 17 },               // etched "cores"
  smd: { count: 14, seed: 4 },                                    // tiny passives between pads and lid
  pin1: { r: 0.045, inset: 0.13 },                                // accent dot on the lid corner (lathed)
  bga: { pitch: 0.16, radius: 0.026, keepOut: 0.8 },             // solder-ball grid underneath (sparkles in the mirror floor)
};
// the NEURAL ENGINE region (cells i0..i1, j0..j1; j = 0 is the back row)
export const NEURAL = { i0: 0, i1: 2, j0: 0, j1: 1 };

// ---- light plan ----
export const TRACE = { on: at("reveal", 0.35), dur: 1.4, fadeAt: at("reveal", 2.2) };
export const STUDIO = { on: at("reveal", 1.75), dur: 1.4 };
export const SWEEPS = [
  { t: at("reveal", 1.3), dur: 1.6, yaw: 0.35, peak: 1 },     // the reveal sweep
  { t: at("neural", 0.25), dur: 2.3, yaw: 1.1, peak: 0.55 },  // a slow glint across the macro
  { t: at("private", 0.4), dur: 2.0, yaw: -0.6, peak: 0.7 },  // across the pull-back
  { t: at("hero", 0.3), dur: 1.5, yaw: -0.25, peak: 1 },      // the final sweep
];
export const GLOW = {
  neuralOn: at("neural", 0.55),
  wave: wavePlan(6, 6, { origin: [1, 0], start: at("wave", 0.35), step: 0.17 }),
  idleOn: at("private", 0.0), idle: 0.32, neural: 0.9, heroOn: at("hero", 0.9), hero: 0.85,
};
// environment yaw (rad, cheap: scene.environmentRotation): the hero shot turns the studio so the big rim strip
// leaves the die and the glowing cores read under the tagline
export const ENV_ROT = [{ t: 0, v: 0 }, { t: 12.19, v: 0 }, { t: 12.2, v: 0.7 }, { t: 15, v: 0.8 }];
export const TURNTABLE = [
  { t: 0, v: -0.55 }, { t: 9.4, v: 0.39 }, { t: 12.2, v: 1.0 }, { t: 15, v: 1.25, ease: "outCubic" },
];

// ---- type ----
export const TITLES = [
  { id: "title", text: "ON-DEVICE AI", sub: "THE CHIP IN YOUR POCKET", y: -0.66, on: at("reveal", 2.05), off: at("reveal", 3.35) },
  { id: "cloud", text: "RUNS WITHOUT THE CLOUD", y: -0.72, size: 0.8, on: at("wave", 0.6), off: at("wave", 2.35) },
  { id: "private", text: "PRIVATE BY DEFAULT", sub: "YOUR DATA STAYS ON THE DEVICE", y: -0.66, on: at("private", 0.6), off: at("private", 2.35) },
  { id: "tag", text: "AI THAT STAYS WITH YOU", y: -0.66, size: 0.86, on: at("hero", 0.75), off: 99 },
];
export const CALLOUTS = [
  { id: "neural", text: "NEURAL ENGINE", sub: "DEDICATED AI CORES", dir: [1, 1], knee: 0.36, run: 0.3, on: at("neural", 0.8), off: at("neural", 2.35) },
];

// ---- camera: one shot per beat, hard cuts on the beat boundaries ----
export const SHOTS = [
  { t: at("reveal"), dur: 3.8, from: { pos: [3.3, 1.5, 5.8], target: [0, 0.18, 0], fov: 28 }, to: { pos: [2.8, 1.3, 5.0], target: [0, 0.2, 0], fov: 28 } },
  { t: at("neural"), dur: 2.8, path: "arc", from: { pos: [1.55, 1.3, 1.45], target: [-0.25, 0.42, -0.2], fov: 30 }, to: { pos: [-0.55, 1.22, 2.0], target: [-0.2, 0.42, -0.2], fov: 30 } },
  { t: at("wave"), dur: 2.8, from: { pos: [0.6, 5.9, 3.9], target: [0, 0.1, 0.75], fov: 30 }, to: { pos: [0.35, 5.3, 3.4], target: [0, 0.12, 0.7], fov: 30 } },
  { t: at("private"), dur: 2.8, from: { pos: [1.3, 0.72, 3.1], target: [0, 0.36, 0], fov: 28 }, to: { pos: [3.1, 1.25, 8.6], target: [0, 0.3, 0], fov: 28 } },
  { t: at("hero"), dur: 2.8, from: { pos: [4.25, 1.8, 5.25], target: [0, 0.15, 0], fov: 28 }, to: { pos: [3.85, 1.62, 4.75], target: [0, 0.17, 0], fov: 28 } },
];
export const CAMERA = shotKeys(SHOTS);

// The set (floor/sweep) is the only spec object; the chip is assembled in scene.js from the style's helpers.
export const OBJECTS = [
  { id: "set", primitive: "procedural", factory: "sweep", procedural: "black seamless cyclorama (60x44 m, 9 m cove) whose floor is a blurred planar mirror (half-res mirrored render, 12-tap blur, Fresnel, radial fade 1.4-5.5 m)", dims: {} },
];

// ---- sound: every cue derives from BEATS / SWEEPS / GLOW ----
const whooshAtPeak = (s, { dur = 1.6, pitch = 0.5, gain = 0.8, pan = 0, seed } = {}) => ({ t: Math.max(0, sweepPeak(s) - dur * 0.7), type: "whoosh", dir: "in", dur, pitch, q: 0.9, gain, pan, seed });
const rings = [...new Set(GLOW.wave.map((c) => c.ring))].map((r) => ({ ring: r, on: GLOW.wave.find((c) => c.ring === r).on }));
export const SCORE = [
  // dark pad bed (brightness = low-pass cutoff in Hz) + a second layer once the studio is up
  { t: 0, type: "pad", dur: DURATION, root: 55, chord: [0, 7, 12, 15, 19], brightness: 420, attack: 2.5, release: 3, gain: 0.6 },
  { t: STUDIO.on, type: "pad", dur: DURATION - STUDIO.on, root: 110, chord: [0, 7, 10, 15], brightness: 900, attack: 3, release: 3, gain: 0.2, seed: 3 },
  // 1 reveal: rim trace riser, deep sweep whoosh, sub hit + rumble as the strip crosses the chip
  { t: TRACE.on, type: "riser", dur: TRACE.dur + 0.5, pitch: 0.55, gain: 0.22 },
  { t: TRACE.on, type: "sparkle", dur: 0.9, gain: 0.08, pitch: 0.7 },
  whooshAtPeak(SWEEPS[0], { dur: 1.8, pitch: 0.45, gain: 0.9 }),
  { t: sweepPeak(SWEEPS[0]), type: "thud", dur: 1.5, pitch: 0.42, gain: 1.0 },
  { t: sweepPeak(SWEEPS[0]), type: "rumble", dur: 2.8, pitch: 0.7, gain: 0.45 },
  { t: TITLES[0].on, type: "chime", dur: 2.4, pitch: 0.5, gain: 0.12 },
  // 2 neural: cut whoosh, slow glint, glow chime + shimmer, callout tick
  { t: at("neural"), type: "whoosh", dir: "out", dur: 0.6, pitch: 0.6, gain: 0.35, seed: 5 },
  whooshAtPeak(SWEEPS[1], { dur: 2.0, pitch: 0.55, gain: 0.45, pan: 0.3, seed: 6 }),
  { t: GLOW.neuralOn, type: "chime", dur: 2.6, pitch: 0.75, gain: 0.3 },
  { t: GLOW.neuralOn + 0.05, type: "sparkle", dur: 1.1, gain: 0.14, pitch: 0.9, seed: 7 },
  { t: CALLOUTS[0].on, type: "tick", gain: 0.22 },
  // 3 wave: cut whoosh, one soft chime per ring of the ripple, rising
  { t: at("wave"), type: "whoosh", dir: "out", dur: 0.6, pitch: 0.55, gain: 0.32, seed: 8 },
  ...rings.map((r) => ({ t: r.on, type: "chime", dur: 1.6, pitch: 0.75 * 2 ** ((r.ring * 2) / 12), gain: 0.15, pan: -0.4 + r.ring * 0.18, seed: 20 + r.ring })),
  { t: rings[0].on, type: "sparkle", dur: 1.2, gain: 0.1, pitch: 1.1, seed: 9 },
  { t: TITLES[1].on, type: "tick", gain: 0.2, seed: 10 },
  // 4 private: deep pull-back whoosh + low thud, sweep across the pull-back
  { t: at("private"), type: "thud", dur: 0.9, pitch: 0.5, gain: 0.5 },
  { t: at("private"), type: "whoosh", dir: "out", dur: 2.6, pitch: 0.42, gain: 0.55, seed: 11 },
  whooshAtPeak(SWEEPS[2], { dur: 1.8, pitch: 0.5, gain: 0.45, pan: -0.3, seed: 12 }),
  { t: TITLES[2].on, type: "tick", gain: 0.2, seed: 13 },
  // 5 hero: cut whoosh, final sweep whoosh, soft sub hit + low chime on the tagline
  { t: at("hero"), type: "whoosh", dir: "out", dur: 0.6, pitch: 0.5, gain: 0.3, seed: 14 },
  whooshAtPeak(SWEEPS[3], { dur: 1.7, pitch: 0.45, gain: 0.85, seed: 15 }),
  { t: TITLES[3].on, type: "thud", dur: 1.6, pitch: 0.4, gain: 0.75, seed: 16 },
  { t: TITLES[3].on, type: "rumble", dur: 2.2, pitch: 0.6, gain: 0.3, seed: 17 },
  { t: TITLES[3].on + 0.05, type: "chime", dur: 2.8, pitch: 0.5, gain: 0.2, seed: 18 },
];
export const DUCK = [];
export const NOTES = "Chip assembled in scene.js from studio-product helpers (bevelSlab, contactPads, etchedPanel, lathedBody, edgeTrace, turntable). Unbranded, no performance figures.";
