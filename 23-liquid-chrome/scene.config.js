// scene.config.js — 23-liquid-chrome: "What is a foundation model?" in Y2K liquid chrome.
// Plain data (Node-importable). Units: metres, Y-up, seconds. The droplet plan comes from the style's THREE-free
// plan module (liquid.js), so every merge bloop in SCORE lands on the frame where that droplet touches the blob.
import { dropletPlan, dropletEvents } from "./_atlas/styles/liquid-chrome/liquid.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "23-liquid-chrome";
export const STYLE = "liquid-chrome";
export const DURATION = 15;
export const FPS = 30;

export const BEATS = [
  { id: "one", t: 0.0, dur: 2.8 },    // one big chrome blob floats and wobbles: ONE BIG MODEL
  { id: "train", t: 2.8, dur: 3.0 },  // droplet streams fly in from every side and merge; it swells: TRAINED ON A BIT OF EVERYTHING
  { id: "split", t: 5.8, dur: 3.6 },  // pinches into four, each re-forms as an icon: WRITE · SEE · CODE · LISTEN
  { id: "orbit", t: 9.4, dur: 2.8 },  // the four orbit the centre, melt back into one: SAME MODEL UNDERNEATH
  { id: "title", t: 12.2, dur: 2.8 }, // the blob becomes a liquid underline; FOUNDATION MODEL inflates in, sparkles
];
const at = (id, off = 0) => BEATS.find((b) => b.id === id).t + off;

// ---- liquid choreography (all times derive from BEATS) ----
export const LIQ = {
  groups: 4, slots: 9,                       // 4 groups x 9 slots = 36 shader slots (slot 0 of each group = its core)
  R0: 1.08, R1: 1.42,                        // blob radius before / after training
  orbiters: { n: 3, seed: 7, size: 0.15, dist: 1.5, speed: 0.75, mergeAt: at("train", 0.05), mergeDur: 0.75 },
  droplets: { count: 24, seed: 11, start: at("train", 0.35), end: at("train", 2.45), dist: [7.5, 10.5], size: [0.1, 0.19], travel: [0.85, 1.25], absorb: 0.42 },
  split: { at: at("split", 0.1), dur: 1.5, k: [0.75, 0.16] },
  morph: { at: at("split", 1.62), dur: 0.8, stagger: 0.1, R: 0.7 },
  icons: [
    { shape: "chat", label: "WRITE", x: -4.3 },
    { shape: "frame", label: "SEE", x: -1.43 },
    { shape: "code", label: "CODE", x: 1.43 },
    { shape: "wave", label: "LISTEN", x: 4.3 },
  ],
  iconScale: 1.1, iconY: 0.15,
  ring: { R: 3.0, y: 0.1, spin: 1.05, angles: [Math.PI, Math.PI / 2, -Math.PI / 2, 0], from: at("orbit", 0.2), settle: 0.9 },
  melt: { at: at("orbit", 1.0), dur: 0.6 },
  merge: { at: at("orbit", 1.85), dur: 0.9 },
  bar: { at: at("title", 0.0), dur: 0.85, y: -1.95, half: 3.3, r: 0.24, depth: 0.16, k: 0.12, glint: 2.6 },
};
export const DROPLETS = dropletPlan({ ...LIQ.droplets, center: [0, 0, 0] });

// ---- inflated title ----
export const TITLE = { text: "FOUNDATION\nMODEL", y: 0.62, start: at("title", 0.35), stagger: 0.07 };

// ---- captions (overlay, one region: bottom centre) ----
export const CAPTIONS = [
  { text: "ONE BIG MODEL", on: at("one", 0.45), off: at("one", 2.6) },
  { text: "TRAINED ON A BIT OF EVERYTHING", on: at("train", 0.3), off: at("train", 2.85) },
  { text: "SAME MODEL UNDERNEATH", on: at("orbit", 0.45), off: at("orbit", 2.65) },
];
export const ICON_CAPTIONS = { on: at("split", 2.5), off: at("orbit", 0.75), stagger: 0.08, y: -1.45 };

// ---- sparkles (scripted glints on the hottest highlights) ----
export const GLINTS = [
  { t: at("one", 0.9), on: "core", size: 150 }, { t: at("one", 2.1), on: "core", size: 110 },
  { t: at("train", 2.55), on: "core", size: 190 },
  ...LIQ.icons.map((_, i) => ({ t: at("split", 2.7 + i * 0.14), on: `icon${i}`, size: 120 })),
  { t: at("orbit", 2.55), on: "core", size: 170 },
  { t: at("title", 1.25), on: "letter:1", size: 170 }, { t: at("title", 1.5), on: "letter:7", size: 140 },
  { t: at("title", 1.75), on: "letter:12", size: 160 }, { t: at("title", 2.05), on: "letter:4", size: 120 },
  { t: at("title", 2.3), on: "letter:14", size: 150 }, { t: at("title", 2.5), on: "bar", size: 130 },
];

// ---- camera: slow glides, a rise to see the orbit ring, a gentle push on the title ----
export const CAMERA = [
  { t: 0, pos: [1.2, 0.9, 7.0], target: [0, 0.05, 0], fov: 44 },
  { t: 2.8, pos: [-0.9, 0.7, 7.5], target: [0, 0.05, 0], fov: 44, ease: "inOutSine" },
  { t: 5.7, pos: [0.4, 0.9, 8.9], target: [0, 0.0, 0], fov: 44, ease: "inOutSine" },
  { t: 6.9, pos: [0, 0.55, 10.8], target: [0, -0.05, 0], fov: 44, ease: "inOutCubic" },
  { t: 9.4, pos: [0, 0.5, 10.6], target: [0, -0.05, 0], fov: 44, ease: "linear" },
  { t: 10.7, pos: [0.3, 4.6, 9.4], target: [0, -0.3, 0], fov: 44, ease: "inOutCubic" },
  { t: 12.1, pos: [0, 0.9, 10.4], target: [0, -0.05, 0], fov: 44, ease: "inOutCubic" },
  { t: 15, pos: [0, 0.5, 9.7], target: [0, -0.1, 0], fov: 44, ease: "outSine" },
];

export const OBJECTS = [
  { id: "backdrop", primitive: "procedural", factory: "backdrop", procedural: "full-screen gradient void (cyan -> violet -> magenta) with a soft centre glow and drifting bokeh orbs", dims: {} },
  { id: "grid", primitive: "procedural", factory: "grid", procedural: "additive neon grid plane at y = -2.6, 1 m cells, cyan near -> magenta far, fading to the horizon, scrolling toward camera", dims: {} },
];

// ---- sound: every cue derives from BEATS / LIQ / DROPLETS ----
const S = LIQ;
const icoT = (i) => S.morph.at + i * S.morph.stagger;
const merges = scoreFromEvents(dropletEvents(DROPLETS), {
  merge: (e, c) => [
    { type: "bubble", dur: 0.09 + e.size * 0.4, pitch: 0.55 + (0.2 - e.size) * 3.2, gain: 0.32 },
    ...(c.index % 3 === 0 ? [{ type: "pop", dur: 0.1, pitch: 0.55, gain: 0.12 }] : []),
  ],
}, { seedBase: 101, pan: (e) => e.pan * 0.8 });
const letters = TITLE.text.replace(/\s/g, "").length;
export const SCORE = [
  // glossy synth-pad bed (brightness = low-pass cutoff in Hz) + an airy top layer
  { t: 0, type: "pad", dur: DURATION, root: 130.81, chord: [0, 4, 7, 11, 14], brightness: 1500, attack: 1.6, release: 2.5, gain: 0.34 },
  { t: 0.5, type: "pad", dur: DURATION - 0.5, root: 523.25, chord: [0, 7, 11, 14], brightness: 3200, attack: 3, release: 3, gain: 0.05, seed: 3 },
  // 1 one: wet bloop as the blob appears, soft chime glint, caption blip
  { t: 0.12, type: "bubble", dur: 0.22, pitch: 0.42, gain: 0.5 },
  { t: 0.15, type: "pop", dur: 0.16, pitch: 0.45, gain: 0.25 },
  { t: CAPTIONS[0].on, type: "blip", notes: [0, 7, 12], dur: 0.06, pitch: 1.0, gain: 0.12 },
  { t: GLINTS[0].t, type: "sparkle", dur: 0.9, gain: 0.12, pitch: 1.1, seed: 4 },
  { t: GLINTS[1].t, type: "sparkle", dur: 0.8, gain: 0.09, pitch: 1.3, seed: 5 },
  // 2 train: orbiters sink in, streams whoosh in, a bloop per merge, rising shimmer into the swell
  { t: S.orbiters.mergeAt + S.orbiters.mergeDur * 0.75, type: "bubble", dur: 0.14, pitch: 0.7, gain: 0.3, seed: 6 },
  { t: at("train", 0.0), type: "whoosh", dir: "in", dur: 1.1, pitch: 0.9, gain: 0.22, pan: -0.4, seed: 7 },
  { t: at("train", 0.6), type: "whoosh", dir: "in", dur: 1.2, pitch: 1.1, gain: 0.18, pan: 0.4, seed: 8 },
  ...merges,
  { t: CAPTIONS[1].on, type: "blip", notes: [0, 5, 9], dur: 0.06, pitch: 1.0, gain: 0.11, seed: 9 },
  { t: at("train", 0.6), type: "riser", dur: 2.0, pitch: 1.3, gain: 0.22 },
  { t: GLINTS[2].t, type: "chime", dur: 1.8, pitch: 1.0, gain: 0.16, seed: 10 },
  { t: GLINTS[2].t, type: "sparkle", dur: 1.0, pitch: 1.2, gain: 0.12, seed: 11 },
  // 3 split: stretch whoosh, four snap bloops as the necks pinch off, blips as each icon forms, label ticks
  { t: S.split.at, type: "whoosh", dir: "out", dur: 0.9, pitch: 0.7, gain: 0.2, seed: 12 },
  ...[0, 1, 2, 3].map((i) => ({ t: S.split.at + S.split.dur * 0.55 + i * 0.05, type: "bubble", dur: 0.16, pitch: 0.45 + i * 0.08, gain: 0.32, pan: [-0.6, -0.2, 0.2, 0.6][i], seed: 20 + i })),
  { t: S.split.at + S.split.dur * 0.55, type: "pop", dur: 0.18, pitch: 0.4, gain: 0.22, seed: 24 },
  ...[0, 1, 2, 3].map((i) => ({ t: icoT(i) + S.morph.dur * 0.8, type: "blip", notes: [0, 7], dur: 0.05, pitch: [1, 1.12, 1.26, 1.5][i], gain: 0.13, pan: [-0.6, -0.2, 0.2, 0.6][i], seed: 30 + i })),
  ...[0, 1, 2, 3].map((i) => ({ t: icoT(i) + S.morph.dur * 0.85, type: "bubble", dur: 0.1, pitch: 0.9 + i * 0.1, gain: 0.18, pan: [-0.6, -0.2, 0.2, 0.6][i], seed: 34 + i })),
  ...[0, 1, 2, 3].map((i) => ({ t: GLINTS[3 + i].t, type: "sparkle", dur: 0.6, pitch: 1.2 + i * 0.1, gain: 0.07, pan: [-0.6, -0.2, 0.2, 0.6][i], seed: 40 + i })),
  // 4 orbit: swirl whoosh, caption blip, melt bloops descending, big merge bloop + soft thud
  { t: at("orbit", 0.05), type: "whoosh", dir: "in", dur: 1.4, pitch: 0.8, gain: 0.22, seed: 50 },
  { t: CAPTIONS[2].on, type: "blip", notes: [0, 4, 7], dur: 0.06, pitch: 0.9, gain: 0.11, seed: 51 },
  ...[0, 1, 2, 3].map((i) => ({ t: S.melt.at + 0.12 * i, type: "bubble", dur: 0.14, pitch: 0.95 - i * 0.12, gain: 0.22, seed: 52 + i })),
  { t: S.merge.at + S.merge.dur * 0.7, type: "bubble", dur: 0.3, pitch: 0.36, gain: 0.5, seed: 56 },
  { t: S.merge.at + S.merge.dur * 0.7, type: "thud", dur: 0.5, pitch: 0.8, gain: 0.3, seed: 57 },
  { t: GLINTS[7].t, type: "sparkle", dur: 0.8, pitch: 1.1, gain: 0.1, seed: 58 },
  // 5 title: blob spreads into the underline, each glyph inflates with a rising pop, sparkle chimes on the glints
  { t: S.bar.at, type: "whoosh", dir: "out", dur: 0.8, pitch: 0.6, gain: 0.2, seed: 60 },
  { t: S.bar.at + S.bar.dur * 0.6, type: "bubble", dur: 0.25, pitch: 0.5, gain: 0.3, seed: 61 },
  ...Array.from({ length: letters }, (_, k) => ({ t: TITLE.start + k * TITLE.stagger + 0.03, type: "pop", dur: 0.09, pitch: 0.8 * 2 ** ((k % 8) * 2 / 12), gain: 0.11, pan: -0.5 + k / letters, seed: 70 + k })),
  { t: TITLE.start + 0.3, type: "riser", dur: 0.9, pitch: 1.5, gain: 0.12, seed: 90 },
  { t: GLINTS[8].t, type: "chime", dur: 2.2, pitch: 1.0, gain: 0.16, seed: 91 },
  ...GLINTS.slice(8).map((g, k) => ({ t: g.t, type: "sparkle", dur: 0.7, pitch: 1.1 + k * 0.08, gain: 0.08, pan: -0.5 + k * 0.2, seed: 92 + k })),
];
export const DUCK = [];
export const NOTES = "Liquid = raymarched SDF of 36 control slots (4 groups x 9) driven by the style's liquid.js plan; type = stroke-font tubes in the same chrome shader; captions on the overlay.";
