// styles/pin-art/spec.js — STYLE_SPEC for "Pin Art". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the pin plan + score) and the browser.
// Units: metres (a giant pinscreen: 8 cm pin pitch so a single pin head still reads at 1080p), Y-up, sRGB hex, radians.
//
// The look: a giant pin-impression toy on a dark matte desk. A clear acrylic frame holds a dense grid of thousands of
// slim polished metal pins with domed heads. A strong low raking key light and a soft coloured rim light turn any
// relief pushed into the field into bright pin heads and long shadows. Every pin's extension is a height sampled from
// a target height field (text and icons via distance fields with a rounded bevel, a hand, a rolling ball, ripples,
// bar charts, terrain, bitmaps); pins.js (THREE-free) morphs between fields with a travelling wave, a tiny overshoot
// and a metallic settle, and the same plan drives the shimmer / tick / thud sound.

export const STYLE_SPEC = {
  id: "pin-art",
  name: "Pin Art",
  description:
    "A giant pin-impression toy (pinscreen): a clear acrylic frame holding a dense grid of thousands of slim polished metal pins with domed heads, on a dark matte desk under a strong low raking key light and a soft coloured rim light, so any relief pushed into the pins reads as a field of bright pin heads and long shadows. Polished steel by default, brass and anodised colour finishes. Shapes are pressed through the field as a pure function of time: every pin's extension is sampled from a target height field built from text and icons (distance fields with a rounded bevel), a hand, a ball rolling underneath, ripples from a tap, bars rising as columns of pins, terrain or a bitmap; transitions morph between fields with a wave that travels across the grid (per-pin delay from position, eased, tiny overshoot, metallic settle) and pins drop back in a cascade. The camera orbits low so relief and shadows read.",
  palette: {
    bg: "#0d0d10",
    desk: "#17161a",
    plate: "#0b0b0e",
    steel: "#c9ccd2",
    brass: "#d6b266",
    ink: "#e9ebef",
    rim: "#8fb1ff",          // cool rim light
    key: "#fff1dd",          // warm raking key
    amber: "#f2b24a",
    anodised: ["#3f7be0", "#e0503f", "#2fb39a", "#e4a63a", "#9a5fd6", "#d94f8a"],  // blue, red, teal, gold, violet, rose
  },
  world: {
    background: "#0d0d10",
    sky: null,
    fog: { color: "#0d0d10", near: 14, far: 30 },
    environment: null,        // style.js builds a procedural studio env (kit studioEnvironment) from `studio` below
    toneMapping: "neutral",   // keeps the steel neutral and the anodised colours as designed
    exposure: 1.2,
    shadowType: "auto",
  },
  materials: {
    desk: { type: "standard", baseColor: "#17161a", roughness: 0.9, metalness: 0, bump: { source: "bumpNoise", scale: 48, octaves: 3, seed: 50, strength: 0.25, description: "fine fbm noise: matte painted desk top" } },
    plate: { type: "standard", baseColor: "#0b0b0e", roughness: 0.55, metalness: 0 },
    acrylicEdge: { type: "standard", baseColor: "#8a96a8", roughness: 0.45, metalness: 0 },
    screw: { type: "standard", baseColor: "#9da2aa", roughness: 0.3, metalness: 1 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#c9d3e6", groundColor: "#0d0c10", intensity: 0.12 },
    {
      // low raking key from the front-left (~18 deg): lights the walls facing the camera, shadows fall back-right: long pin shadows across the field
      id: "key", type: "directional", color: "#fff1dd", intensity: 3.4, position: [-7.2, 3.1, 6.6], target: [0, 0, 0],
      shadow: { softness: 1.4, mapSize: 4096, extent: 6.4, near: 0.5, far: 30, bias: -0.0003, normalBias: 0.006 },
    },
    // soft coloured rim from behind: outlines the far side of every raised pin head
    { id: "rim", type: "directional", color: "#8fb1ff", intensity: 0.8, position: [5.5, 2.4, -8.5], target: [0, 0, 0] },
  ],
  // procedural reflection environment for the polished metal (kit studio.studioEnvironment)
  studio: {
    size: 256,
    sigma: 0.01,
    room: { w: 30, h: 14, d: 30, color: "#020203" },
    panels: [
      { id: "top", kind: "softbox", size: [14, 9], pos: [0, 7, 2.5], intensity: 2.2, color: "#f4f1ec", soft: 0.3 },
      { id: "keyStrip", kind: "strip", size: [1.2, 5], pos: [-8, 2.6, 7.5], intensity: 7, color: "#fff1dd", soft: 0.35 },
      { id: "rimStrip", kind: "strip", size: [0.8, 5], pos: [6, 2.2, -9.5], intensity: 3.5, color: "#8fb1ff", soft: 0.35 },
      { id: "front", kind: "card", size: [18, 6], pos: [0, 3, 12], intensity: 0.7, gradient: [[0, "#000000"], [0.7, "#5a5d66"], [1, "#a0a4ad"]] },
    ],
    sweep: { size: [16, 0.4], radius: 9, from: 0.2, to: 2.6, intensity: 0, color: "#ffffff", soft: 0.35, edgeFade: 0.16 },
    sweepLight: { intensity: 0, color: "#ffffff" },
    quantum: 0.002,
  },
  post: {
    bloom: { strength: 0.12, radius: 0.3, threshold: 3.2 },   // only the brightest head glints bloom
    vignette: { darkness: 0.5, offset: 1.0 },
  },
  camera: { fov: 34, near: 0.2, far: 60, drift: { amp: 0, speed: 0.2 } },   // no drift: still holds keep 1000s of glints still
  text: { font: "sans", weight: 700, color: "#e9ebef", height: 0.3 },

  // ---- the pin field --------------------------------------------------------------------------------------
  field: {
    cols: 100, rows: 84, pitch: 0.08,      // 8400 pins, 8.0 x 6.72 m
    headR: 0.036,                         // domed head radius (0.45 x pitch: heads nearly touch)
    headH: 0.03,                          // head height (collar + dome)
    shaftR: 0.011,                        // slim shaft
    length: 1.7,                          // shaft length below the head (max extension + hidden part)
    rest: 0.0,                            // extra rest height above the plate (heads sit on the plate)
    maxExt: 1.35,                         // tallest extension the planner allows (m)
    radial: 10, domeRings: 4,             // pin geometry resolution (lathe)
    ao: { strength: 1.8, max: 0.75, depthTone: 0.62, depthRange: 0.22 },  // neighbour occlusion (a pin next to taller pins darkens) + resting pins sit darker, down in the plate
  },
  finishes: {
    steel: { color: "#d2d5db", roughness: 0.2, metalness: 1, envIntensity: 1.0 },
    brass: { color: "#d6b266", roughness: 0.2, metalness: 1, envIntensity: 1.0 },
    blackChrome: { color: "#6b6e75", roughness: 0.12, metalness: 1, envIntensity: 1.1 },
    anodised: { color: "#c9ccd2", roughness: 0.26, metalness: 0.85, envIntensity: 0.9 },   // tint per pin from palette.anodised
  },
  frame: {
    margin: 0.2,          // acrylic border width around the pin grid
    height: 0.24,         // frame wall height above the plate
    base: 0.16,           // plate/base box thickness below y = 0 (hides the shafts)
    radius: 0.03,
    alphaFace: 0.07, alphaRim: 0.62,
  },
  desk: { size: 60, y: -0.16 },

  // ---- morph feel (pins.js) ------------------------------------------------------------------------------
  morph: {
    spring: { stiffness: 210, damping: 20 },  // zeta ~0.69: ~5 % overshoot, metallic settle in ~0.55 s
    settle: 0.62,                            // s after which a pin is held exactly at its target (still frames)
    spread: 1.1,                             // default wave sweep time across the field (s)
    jitter: 0.025,                           // seeded per-pin delay jitter (s): an organic front
    drop: { fall: 0.24, bounce: 0.05, bounceT: 0.12 },   // cascade: gravity fall + one tiny bounce
    bevel: 0.1,                              // default rounded bevel width for distance-field sources (m)
  },

  // ---- the beat label: one caption chip pinned to the screen (overlay = exact colours) ---------------------
  caption: {
    x: 96, y: 70, h: 88, cap: 38,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#16171b", edge: "#3a3d45", ink: "#eef0f4", dot: "#c9ccd2", dotHi: "#ffffff",
  },
  sampleTag: { text: "SAMPLE DATA", x: 1824, y: 70, h: 60, cap: 26, ink: "#16171b", plate: "#f2b24a" },

  sound: {
    bin: 1 / 15,                       // shimmer bins (s)
    eps: 0.004,                        // a pin "moves" in a frame when it travels more than this (m)
    lone: 36,                          // fewer moving pins than this in a bin = single ticks
    shimmer: { gain: 0.16, pitch: [2.2, 3.6], maxPerBin: 4 },
    tick: { gain: 0.14, pitch: 2.8 },
    thud: { gain: 0.5, pitch: 0.8 },
    bell: { gain: 0.16, notes: [1, 1.335, 1.498, 2.0] },   // soft bell theme: root, fourth, fifth, octave (pitch multipliers)
    bed: { gain: 0.7, root: 110, brightness: 700 },
  },
  sfx: { enter: "tick", exit: "whooshOut", move: "sparkle", land: "thud", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Every pin's extension = a height sampled from the current target height field; nothing else moves the pins.",
    "Morph: per-pin delay from its position (directional, radial or seeded random wave), then a closed-form spring with ~5 % overshoot and a metallic settle; held exactly once settled.",
    "Cascade: pins drop back with a gravity fall and one tiny bounce, in a seeded or swept order.",
    "Layers: a ball rolling under the field (a travelling spherical bump, max with the field) and ripples spreading from a tap (added, then gone).",
    "Camera: orbits low so relief and long shadows read; holds still between morphs (thousands of glints compress badly in motion).",
  ],
};
