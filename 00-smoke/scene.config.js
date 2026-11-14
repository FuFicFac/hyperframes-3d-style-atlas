// scene.config.js — plain data for 00-smoke. No THREE, no window: imported by scene.js (browser),
// render-sfx.mjs and export-spec.mjs (Node). Units: metres, Y-up, radians, seconds, sRGB hex.
export const ID = "00-smoke";
export const STYLE = "neutral";
export const DURATION = 5;
export const FPS = 30;

export const BEATS = [
  { id: "drop", t: 0.3, dur: 0.9 },   // cube falls and bounces
  { id: "pop", t: 1.3, dur: 0.45 },   // sphere + torus pop in
  { id: "swing", t: 1.8, dur: 1.7 },  // camera swings to the other side
  { id: "title", t: 3.0, dur: 0.7 },  // label rises in
];

export const CAMERA = [
  { t: 0, pos: [5.5, 3.6, 8.5], target: [0, 0.8, 0], fov: 35 },
  { t: 1.8, pos: [5.0, 3.4, 8.0], target: [0, 0.8, 0], fov: 35, ease: "inOutSine" },
  { t: 3.5, pos: [-4.8, 2.8, 7.4], target: [0, 1.1, 0], fov: 32, ease: "inOutCubic" },
  { t: 5, pos: [-4.2, 2.6, 6.8], target: [0, 1.2, 0], fov: 31, ease: "linear" },
];

export const OBJECTS = [
  { id: "ground", primitive: "ground", dims: { size: 60 }, material: "floor" },
  {
    id: "cube", primitive: "roundedBox", dims: { w: 1, h: 1, d: 1, radius: 0.08 }, material: "clayPrimary",
    position: [-1.7, 0.5, 0], rotation: [0, 0.4, 0],
    anim: [{ prop: "position", beat: "drop", from: [-1.7, 4.5, 0], to: [-1.7, 0.5, 0], ease: "outBounce" }],
  },
  {
    id: "sphere", primitive: "sphere", dims: { r: 0.6 }, material: "claySecondary", position: [0, 0.6, 0.5],
    anim: [{ prop: "scale", beat: "pop", from: 0, to: 1, ease: "outBack" }],
  },
  {
    id: "torus", primitive: "torus", dims: { r: 0.5, tube: 0.18 }, material: "clayAccent",
    position: [1.7, 0.68, 0], rotation: [0, -0.5, 0],
    anim: [
      { prop: "scale", beat: "pop", offset: 0.25, from: 0, to: 1, ease: "outBack" },
      { prop: "rotation", beat: "swing", from: [0, -0.5, 0], to: [0, 0.9, 0], ease: "inOutCubic" },
    ],
  },
  {
    id: "label", primitive: "text", text: "3D STYLE ATLAS", dims: { height: 0.5 }, position: [0, 2.35, 0],
    anim: [
      { prop: "position", beat: "title", from: [0, 1.95, 0], to: [0, 2.35, 0], ease: "outCubic" },
      { prop: "opacity", beat: "title", from: 0, to: 1, ease: "outCubic" },
    ],
  },
];

// SCORE: t = onset seconds. Cue times derive from BEATS so retiming beats retimes sound.
const at = (id, off = 0) => BEATS.find((b) => b.id === id).t + off;
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: 0.22, root: 196, chord: [0, 7, 12, 16] },
  { t: at("drop", -0.05), type: "whoosh", dir: "out", dur: 0.35, gain: 0.35 },
  { t: at("drop", 0.327), type: "thud", gain: 0.9 },            // outBounce first contact = 0.3636 * dur
  { t: at("drop", 0.6), type: "thud", gain: 0.3, pitch: 1.3 },  // second, smaller bounce
  { t: at("pop"), type: "pop", gain: 0.7, pan: 0 },
  { t: at("pop", 0.25), type: "pop", gain: 0.6, pitch: 1.25, pan: 0.4 },
  { t: at("swing", -0.1), type: "whoosh", dir: "in", dur: 1.6, gain: 0.55 },
  { t: at("title"), type: "chime", gain: 0.35, pitch: 1.2 },
  { t: at("title", 0.05), type: "click", gain: 0.4 },
];
export const DUCK = []; // e.g. duckFromBeats(beatsFromSrt(vo_srt)) when a voiceover exists
