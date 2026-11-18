// styles/nesting-dolls/spec.js — STYLE_SPEC for "Nesting Dolls". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the nesting plan + score) and the browser.
// Units: metres, toy scale exaggerated (the biggest doll is 2.2 m tall) so the smallest still reads at 1080p.
//
// The look: a family of lathe-turned, hand-painted, lacquered wooden nesting dolls on a pale birch table in soft
// window daylight. ONE lathe profile (nest.js) scaled per level makes every shell; each doll wears the same simple
// geometric pattern with a little less detail than the one it came out of, and a belly emblem of concentric rings —
// one ring per doll still inside it — around a yellow dot. The design is original to this style.

export const STYLE_SPEC = {
  id: "nesting-dolls",
  name: "Nesting Dolls",
  description:
    "A family of lathe-turned, hand-painted, lacquered wooden nesting dolls on a pale birch table in soft window daylight. One lathe profile scaled per level makes every shell (hollow lid + cup with a bare-wood tenon, or solid for the smallest). The big doll's head twists, lifts off with a wooden pop and is set down behind; a smaller doll rises out of the cup and hops aside; the head goes back on; again and again, faster and higher-pitched as they shrink, down to the solid one. Each doll wears the same geometric pattern with less detail than its parent, and a belly emblem of concentric rings — one ring per doll still inside — around a yellow dot. A camera dive into the smallest doll's dot comes out of the biggest doll's dot onto the whole family lined up large to small. One plan (nest.js) drives visibility, every pose, the line-up and the score.",
  palette: {
    bg: "#e7ecee",
    table: "#ecdcbb",
    ink: "#2b2a33",
    cream: "#fbf1dc",
    sun: "#f8c630",          // the dot at the centre of every emblem (and the colour the camera dives through)
    cheek: "#f2917f",
    wood: "#e7c995",         // bare turned wood inside the shells
    // one body colour per level, big -> small
    dolls: ["#1c9a96", "#ee5a4b", "#4252b8", "#4fa646", "#dc4f97", "#f08326", "#7b4fc0", "#2f8fd6"],
  },
  world: {
    background: "#e7ecee",
    sky: null,
    fog: { color: "#e7ecee", near: 14, far: 34 },
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",   // the paint colours must read as designed
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    table: { type: "standard", baseColor: "#c2bcb2", roughness: 0.7, metalness: 0 },                                   // map: kit woodTexture (style.js); the grey base keeps the sunlit top below clipping so shadows read
    paint: { type: "physical", baseColor: "#ffffff", roughness: 0.42, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.16 },   // cloned per doll, map = its painted canvas
    bare: { type: "standard", baseColor: "#ffffff", roughness: 0.8, metalness: 0 },                                    // map: turned bare wood (style.js)
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fffaf0", groundColor: "#d9c7a4", intensity: 0.8 },
    { id: "sky", type: "directional", color: "#fff4e2", intensity: 0.45, position: [-4.5, 8.5, 6.5], target: [0, 0.6, 0] },
    { id: "rim", type: "directional", color: "#dfeaff", intensity: 0.55, position: [5, 4.5, -6], target: [0, 0.8, 0] },
  ],
  // the window: a soft-edged spot with a window-pane gobo, same bearing as "sky"; it is the only shadow caster
  window: {
    color: "#fff1d6", intensity: 2.7, position: [-5.2, 9.6, 7.2], target: [0.2, 0.3, 0],
    angle: 0.46, penumbra: 0.55, panes: [3, 2], bar: 0.16, soft: 0.07, dark: 0.45,
    shadow: { mapSize: 2048, near: 4, far: 28, bias: -0.0006, normalBias: 0.02 },
  },
  post: {
    vignette: { darkness: 0.2, offset: 1.2 },
  },
  camera: { fov: 30, near: 0.05, far: 60, drift: { amp: 0, speed: 0.2 } },   // locked during holds
  text: { font: "sans", weight: 700, color: "#2b2a33", height: 0.3 },

  // ---- the nest (every number nest.js and style.js need) ----------------------------------------------------------
  nest: {
    count: 6,
    ratio: 0.77,               // each doll is this fraction of the one it comes out of (nest.js checks it fits)
    height: 2.2,               // the biggest doll, metres
    split: 0.47,               // where lid and cup part, fraction of the doll's height
    wall: { top: 0.022, bottom: 0.034 },
    tenon: { h: 0.03, gap: 0.002 },      // the bare-wood lip on the cup that the lid sits over
    floor: 0.03,               // cavity floor height
    ceiling: 0.972,            // cavity ceiling height inside the lid
    clearance: 0.003,
    gap: [0.05, 0.06],         // line-up gap between neighbours: metres + fraction of their mean height
    segments: 72,              // lathe segments around
    // timing: cycle k lasts cycle * accel^k seconds; the phases are fractions of the cycle
    start: 0.55, cycle: 2.25, accel: 0.87,
    phases: { twist: [0, 0.2], lidOut: [0.2, 0.5], rise: [0.3, 0.54], hop: [0.54, 0.84], lidBack: [0.64, 0.95], lock: [0.95, 1.1] },
    twist: 1.05,               // rad the lid turns before it lets go
    lidPark: [-0.26, -0.92],   // where the lid is set down, x and z in doll heights (behind the cup)
    lidArc: 0.4,               // lid hop height, doll heights
    riseClear: 0.02,           // how far above the tenon the child rises before it hops, parent heights
    hopArc: 0.4,               // child hop height, child heights
    lean: 0.2,                 // rad a hopping doll leans into the hop
    squash: { amount: 0.13, decay: 9, hz: 4.4 },
    finale: { knockAfter: 0.5, knockGap: 0.24, diveAfter: 1.25, dive: 1.15, emerge: 1.35, waveAfter: 0.25, waveStep: 0.12, waveDur: 0.4, waveHop: 0.22 },
  },
  // ---- the paint (unit-height coordinates: y = 0 foot, 1 crown) ----------------------------------------------------
  paint: {
    canvas: [2048, 1024], canvasBig: [4096, 2048],   // canvasBig: the first and last level (the camera dives into one emblem and pulls out of the other)
    emblem: { y: 0.252, dot: 0.046, ring: 0.0165, edge: 0.011 },
    face: { y: 0.752, r: 0.108, eye: [0.038, 0.014, 0.0125], smile: [0.03, 0.03, 0.0075], cheek: [0.066, 0.022, 0.017] },
    cap: { y: 0.9, scallops: 14, r: 0.03 },
    collar: { y: [0.525, 0.6], count: 14 },
    belt: { y: [0.4, 0.452], dots: 22, r: 0.011 },
    hem: { y: [0.03, 0.125], teeth: 18 },
    polka: { rows: [0.19, 0.31], count: 16, r: 0.017, keepOut: 0.2 },
    // decoration is dropped level by level ("distilled"): a level paints an item while level <= its limit
    detail: { polka: 1, hem: 2, belt: 3, collar: 4, cap: 4 },
    seam: 0.0035,
  },
  tableWood: { size: 40, tile: 8, boards: 5, seed: 77, dark: "#e6d7b8", mid: "#f1e6cd", light: "#fbf5e6", seam: "#d8c6a2", contrast: 0.26, grainFreq: 16 },

  // ---- overlay caption (top centre) and the dive cover ----------------------------------------------------------------
  caption: {
    x: 960, y: 46, h: 108, cap: 58, maxW: 1180,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#fffaf0", edge: "#2b2a33", ink: "#2b2a33",
  },

  sound: {
    creak: { gain: 0.5, servo: 0.1, hz: [64, 96] },
    pop: { gain: 0.6 },
    rise: { gain: 0.1 },
    land: { gain: 0.55, thud: 0.3, decay: 0.16 },
    lid: { gain: 0.22 },
    seat: { gain: 0.3, note: 0.16 },
    knock: { gain: 0.42 },
    dive: { gain: 0.34, riser: 0.16 },
    emerge: { gain: 0.3, chime: 0.3 },
    wave: { gain: 0.42 },
    pad: { gain: 0.26, root: 130.81, chord: [0, 7, 16, 19], brightness: 1100 },
    scale: [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25],   // C-major pentatonic: one note per level
    pitchPower: 0.62,          // noise voices are pitched by (1 / scale) ^ pitchPower: smaller doll = higher
  },
  sfx: { enter: "pop", exit: "whooshOut", move: "whoosh", land: "marimba", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Twist, pop, set the head down behind; the smaller doll rises out of the cup, leans and hops aside; the head goes back on and locks.",
    "Each cycle is 13 % shorter than the last and every sound is pitched higher: the rhythm accelerates as the dolls shrink.",
    "A child is invisible until its parent's lid lets go (visibility is set from t by the plan).",
    "Landing: a damped squash wobble. The solid doll only wiggles and knocks.",
    "Camera: one move per cycle, pushing in as the dolls get smaller; the last push dives through the smallest doll's yellow dot and pulls out of the biggest doll's dot to the whole row.",
  ],
};
