// styles/endless-zoom/spec.js — STYLE_SPEC for "Endless Zoom". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the level plan + score) and the browser.
// Units: one level's frame = 16/9 x 1 (level units; the camera sees exactly that frame at scale 1), Y-up, radians, sRGB hex.
//
// The look: one unbroken, constant-speed zoom inward through nested worlds. Each world is a small, bright, toy-like 3D
// relief (rounded extruded shapes, soft drop shadows, one clean colour key) authored at unit size with a PORTAL at its
// centre: a tile, a node, a cell, a spark whose face is the next world's background colour. As the camera dollies in,
// the next world fades in on the portal's face and grows until it is the whole frame. The last world's portal holds the
// first one, so the zoom ends exactly where it started.

export const STYLE_SPEC = {
  id: "endless-zoom",
  name: "Endless Zoom",
  description:
    "One continuous, constant-speed zoom inward through nested worlds, each a bright toy-like 3D relief in its own clean colour key (cream chat app, coral token tiles, electric-blue glowing value sliders, golden neural network, green circuit board with a chip, violet switch with a spark). Every world is authored at unit size around a portal at its centre whose face is the next world's colour; the camera dollies in exponentially (one rate for the whole loop, so perceived speed never changes), the next world fades in on the portal's face and grows until it fills the frame, and only two worlds are ever drawn (the outer one directly, the inner one rendered through the portal as a live window). The last portal contains the first world: the loop closes and the final frame equals the first. A rising Shepard scale and a chime per crossing come from the same zoom clock.",
  palette: {
    ink: "#241a3a",
    white: "#ffffff",
    // one colour key per world (background), in loop order
    chat: "#ffeedd",
    tokens: "#ff6a52",
    numbers: "#2f5bff",
    network: "#ffc43a",
    chip: "#14a86c",
    switch: "#8e4cff",
    // details
    bubble: "#ffffff",
    userBubble: "#4d9dff",
    inputBar: "#ffffff",
    placeholder: "#a99c95",
    cursor: "#ff6a52",
    tilePastels: ["#ffd5df", "#c8f1d1", "#cfe2ff", "#fff0b5", "#e5d5ff"],
    tileInk: "#2a1d3f",
    rail: "#5d84ff",
    railLit: "#ffd86a",
    knob: "#ffc43a",
    bracket: "#e8eeff",
    grid: "#4a71ff",
    node: "#23305e",
    nodeRim: "#fff6df",
    link: "#fff8ea",
    pulse: "#ff5a3c",
    pcbTrace: "#f2c14e",
    chipBody: "#2a2d36",
    chipPin: "#d9dde6",
    die: "#b9c0d4",
    cell: "#dcd6ff",
    cellLit: "#7ef2ff",
    pad: "#f1c15a",
    gate: "#c9b6ff",
    spark: "#fff4e6",
    arc: "#e9f3ff",
    shadow: "#1b1030",
  },
  world: {
    background: "#ffeedd",
    fog: null,
    environment: "room",
    environmentIntensity: 0.32,
    toneMapping: "neutral", // keeps the colour keys as designed (ACES greys the cream and desaturates the glow)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {},
  lights: [
    { id: "sky", type: "hemisphere", color: "#ffffff", groundColor: "#d9cfc4", intensity: 1.35 },
    { id: "key", type: "directional", color: "#fff4e8", intensity: 1.55, position: [-1.2, 1.6, 2.4], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.42, radius: 0.45, threshold: 1.05 },
    vignette: { darkness: 0.22, offset: 1.15 },
  },
  camera: { fov: 35, near: 0.01, far: 60, sway: { yaw: 0.03, pitch: 0.018 } }, // sway: radians, periodic over the loop
  text: { font: "sans", weight: 800, color: "#241a3a", height: 0.07 },
  // ---------------------------------------------------------------- the mechanism's tuning
  zoom: {
    phase: 0.8,          // tau at t = 0 (how far into the first world the clip starts)
    fade: [0.2, 0.5],    // inner world alpha ramps over these inner scales
    labelAt: 0.5,        // label swaps when the incoming world reaches this scale
    labelFade: 0.25,
    blinkCycles: 16,     // cursor / spark blinks per loop (integer: the blink loops)
    portalLift: 0.0005,  // the live window floats this far above the portal face (level units)
  },
  relief: {
    shadow: { dx: 0.012, dy: -0.018, opacity: 0.26, soft: 0.42 }, // soft drop shadow offset (light from top-left)
    bevel: 0.006,
    bgDepth: -0.06,
  },
  caption: { y: 918, h: 92, cap: 50, maxW: 1100, weight: 800, dot: 16 },
  glow: { cursor: 1.6, knob: 0.55, railLit: 2.2, pulse: 2.6, cellLit: 1.7, spark: 2.4, arc: 3.2, gate: 0.9 },
  sound: {
    shepard: { octaves: 3, steps: 36, base: 55, partials: 7, centre: 3.3, width: 1.05, attack: 0.12, release: 0.22, brightness: 2600, gain: 0.34 },
    chime: { gain: 0.24, pitches: [1.0, 1.122, 1.26, 1.335, 1.498, 1.682] },
    whoosh: { gain: 0.16 },
    sparkle: { gain: 0.32 },
  },
  sfx: { enter: "chime", exit: "whooshOut", move: "whoosh", land: "chime", emphasis: "sparkle", ui: "blip", bed: "pad" },
  motion: [
    "The zoom is s(t) = exp(k t) with one k for the whole loop: constant perceived speed, scale computed from t, never accumulated.",
    "Only two worlds are drawn: the outer one directly, the inner one rendered to a target and shown through the portal window.",
    "The inner world fades in on the portal's face (whose colour is its background), then grows until it is the frame.",
    "Inside each world, small motion (bobbing tiles, settling sliders, travelling pulses, flickering switches) runs on the world's own local clock, so a world looks the same on every visit.",
    "The camera only sways (periodic yaw/pitch of a few degrees) for parallax; the dolly itself is the zoom.",
  ],
};
