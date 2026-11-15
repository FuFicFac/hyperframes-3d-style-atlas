// styles/light-painting/spec.js — STYLE_SPEC for "Light Painting": a long-exposure night photograph. A camera on a
// tripod with the shutter open, a person waving a small light in empty air; everywhere the light has been stays glowing.
// Plain data only (JSON-serializable, no THREE, no window). Units: metres, Y-up, sRGB hex, radians, three.js light units.
// The planner (strokes.js) reads `hand`; style.js reads the rest.

export const STYLE_SPEC = {
  id: "light-painting",
  name: "Light Painting",
  description:
    "A long-exposure night photograph: a moving light leaves hand-drawn glowing trails hanging in dark air over wet ground — wobble, speed-dependent brightness, pause blobs, a ghosted painter, and a shutter that opens and closes.",
  palette: {
    bg: "#04050a",
    ink: "#f2ece2",
    amber: "#ff9a3c",   // warm LED / sparkler
    cyan: "#3ad8ff",    // cool LED wand
    magenta: "#ff3fa4", // gel-filtered torch
    white: "#fff4e4",
    primary: "#ff9a3c",
    secondary: "#3ad8ff",
    accent: "#ff3fa4",
    skyTop: "#020308",
    skyHorizon: "#1c2236",
    glow: "#3a2a2c",    // sodium haze on the horizon
    ground: "#07080b",
  },
  world: {
    background: "#04050a",
    fog: null,
    environment: null,
    toneMapping: "agx", // keeps trail hue in the halo while slow, over-exposed cores go white (ACES lost the hue)
    exposure: 1.0,
  },
  materials: {
    // wet asphalt: dark, fairly smooth so the pen light leaves a specular streak
    ground: { type: "standard", baseColor: "#0b0c10", roughness: 0.42, metalness: 0,
      bump: { source: "bumpNoise", scale: 40, octaves: 3, seed: 59, strength: 0.25, description: "fine asphalt grain, 40 cells/tile" } },
    ghost: { type: "standard", baseColor: "#4a4c55", roughness: 0.9, metalness: 0 },
  },
  lights: [
    { id: "night", type: "hemisphere", color: "#3a4666", groundColor: "#050506", intensity: 0.35 },
  ],
  post: {
    bloom: { strength: 0.95, radius: 0.55, threshold: 0.55 },
    vignette: { darkness: 0.55, offset: 1.1 },
    grain: { amount: 0.018, fps: 30 },
  },
  camera: { fov: 35, near: 0.3, far: 120, drift: { amp: 0, speed: 0.3 } }, // a tripod: no handheld drift
  text: { font: "sans", weight: 700, color: "#f2ece2", height: 0.4 },
  sfx: { enter: "tick", exit: "clack", move: "buzz", land: "thud", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "The trail is everything the pen has passed: per-sample time T baked by strokes.js, the shader shows T <= t. No accumulation.",
    "Slow = brighter and fatter (and the core over-exposes to white); fast flicks = thin, dim and coloured.",
    "The pen sits for a beat before each stroke (a bright blob), overshoots corners, and switches off between strokes.",
    "Camera on a tripod: still during drawing; one slow arc reveals the strokes hang at different depths.",
    "Shutter clunks open at the start and closes at the end; the frame then 'develops' (slightly brighter, warmer) and holds.",
  ],

  // ---- hand character (strokes.js) ----
  hand: {
    step: 0.02,            // resample spacing, m
    fillet: 0.03,          // corner rounding after overshoot, m
    cornerTurn: 0.75,      // rad: corners sharper than this get an overshoot hook
    overshoot: 0.085,      // m past the corner
    wobble: { amp: 0.04, freq: 0.9, ampZ: 0.12, freqZ: 0.35, jitter: 0.006, jitterFreq: 9 },
    speed: { curv: 1.4, start: 2.2, startLen: 0.09, end: 1.0, endLen: 0.07, noise: 0.45, noiseFreq: 2.1 },
    response: {
      vRef: 3.2,           // m/s: strokes drawn faster than this are dimmer overall
      globalExp: 0.3,
      brightExp: 0.8, brightMin: 0.3, brightMax: 2.3,
      widthExp: 0.5, widthMin: 0.5, widthMax: 1.8,
      flutter: 0.28,       // battery / hand-angle breathing along a stroke
      blobStart: 2.2, blobCorner: 1.3, blobEnd: 0.9, blobSize: 0.085, blobCurv: 6,
    },
    gaps: { chance: 0.35, len: 0.07, minLen: 1.6 },
    travel: { base: 0.12, perM: 0.05, dwell: 0.07, lenExp: 0.75, lift: 0.35 },
  },

  // ---- trail look (style.js shaders) ----
  trail: {
    width: 0.03,           // half-width of the ribbon at response 1, m
    halo: 1.15,            // coloured body level (linear HDR)
    core: 2.6,             // white-hot core level at full brightness
    coreFrom: 0.75,        // brightness where the core starts to over-expose
    coreSharp: 16,         // core profile exponent across the ribbon
    headFade: 0.004,       // s: reveal edge softness at the pen
    mirror: { level: 0.32, widen: 2.2, puddleScale: 0.45, puddleCut: 0.42, ripple: 0.05 },
  },
  pen: {
    flare: 0.32,           // flare quad half-size, m
    level: 5.0,            // core level
    streak: 0.9,           // star-streak level
    light: 3.2,            // point light candela at level 1 (spill on ground and painter)
    lightDistance: 7,
  },
  blobs: { level: 1.25 },
  spill: { light: 2.4, distance: 9, lift: 0.4 }, // per-colour-group fill once trails exist (the drawing lights the ground)
  painter: { opacity: 0.075, copies: 7, lag: 0.45, lagSamples: 7, reach: 0.65, behind: 0.75, height: 1.78, smear: 0.11, sway: 0.16, swayHz: 0.9 },
  location: {
    groundSize: [90, 70], groundZ: -20,
    backdrop: { z: -45, width: 190, height: 52, horizonY: 0, seed: 59, px: 2048 },
    bokeh: { count: 11, seed: 7, zRange: [-32, -18], xRange: [8, 26], yRange: [0.25, 1.6], size: [0.25, 0.55], level: [0.15, 0.4],
      colors: ["#ffb35c", "#ffd28a", "#9fc4ff", "#ff7a50", "#ffe7b8"] },
  },
  develop: { exposure: 1.18, tint: "#fff1e0", dur: 0.6 },
  shutter: { closeDur: 0.11, hold: 0.16, openDur: 0.13 },
  caption: { font: "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif", weight: 700, cap: 44, h: 78, x: 112, y: 76,
    plate: "rgba(10,11,16,0.72)", edge: "rgba(255,255,255,0.10)", ink: "#f2ece2", dot: "#ff9a3c" },
  indicator: { font: "Menlo, 'SF Mono', Monaco, monospace", cap: 24, h: 52, x: 1808, y: 76, plate: "rgba(10,11,16,0.72)",
    ink: "#e8e2d8", dim: "#8a8a92", rec: "#ff3b30" },
  sound: {
    bed: { gain: 0.6, root: 110, brightness: 700 },
    tick: { gain: 0.22, pitch: 1.4 },
    shimmer: { gain: 0.12, hz: 165, flicker: 0.55, vRef: 6 },
    shutter: { gain: 0.75, pitch: 0.55, thud: 0.35 },
    develop: { gain: 0.22 },
  },
};
