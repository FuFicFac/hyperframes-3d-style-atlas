// styles/differential-growth/spec.js — STYLE_SPEC for "Differential Growth" (a growing paper ribbon packed into a hoop).
// Plain data only: JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the
// simulation + score) and the browser. Units: metres, Y-up, radians, sRGB hex. Toy-scale: a 2 m hoop so the folds read.
//
// The look: a bright pastel studio (mint sweep, warm white table), a low clear glass hoop, and inside it a coral-pink
// paper ribbon standing on edge. The ribbon is the simulated curve from growth.js extruded upward: one mesh, its
// vertices rewritten each frame from the stored curve (two paper faces + a lighter cut top edge).

export const STYLE_SPEC = {
  id: "differential-growth",
  name: "Differential Growth",
  description:
    "A bright pastel studio: a coral-pink paper ribbon stands on edge inside a low clear glass hoop on a warm white table in front of a mint sweep. The ribbon keeps growing longer but the hoop does not get bigger, so the ring swells to the glass, buckles into a row of waves that fold inward, each wave sprouts smaller waves, and the hoop ends packed with one continuous, never-crossing ribbon (seen from straight above as a coral maze). The ribbon is a stepped 2D simulation run once at load (springs, bending, short-range repulsion, a circular wall, points inserted as it grows), stored per video frame and extruded upward; a light band can run along its whole length to show it is a single strip.",
  palette: {
    bg: "#cfeee3",
    sweep: "#cfeee3",
    table: "#fbf7f1",
    tableEdge: "#e9e1d6",
    ribbon: "#ff6f61",
    ribbonB: "#ff8f7e",
    ribbonEdge: "#ffd9cf",
    glass: "#e8f6f2",
    ink: "#2b2230",
    sweepLight: "#fff3d6",
  },
  world: {
    background: "#cfeee3",
    sky: null,
    fog: { color: "#cfeee3", near: 9, far: 24 },
    environment: "room",
    environmentIntensity: 0.6,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    sweep: { type: "standard", baseColor: "#cfeee3", roughness: 0.95, metalness: 0 },
    table: { type: "standard", baseColor: "#fbf7f1", roughness: 0.8, metalness: 0 },
    tableEdge: { type: "standard", baseColor: "#e9e1d6", roughness: 0.8, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#f1dcd6", intensity: 1.35 },
    {
      // soft key high front-left: short shadows inside the folds, bright tops
      id: "key", type: "directional", color: "#fff6ec", intensity: 2.0, position: [-2.4, 5.2, 3.0], target: [0, 0, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 1.5, near: 0.5, far: 14, bias: -0.0003, normalBias: 0.01 },
    },
    { id: "rim", type: "directional", color: "#e6fff6", intensity: 0.7, position: [2.6, 2.0, -3.4], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.16, offset: 1.25 },
  },
  camera: { fov: 30, near: 0.05, far: 40, drift: { amp: 0, speed: 0.2 } }, // locked holds: dense folds + moving camera = bitrate
  text: { font: "sans", weight: 700, color: "#2b2230", height: 0.1 },

  // ---- set ----------------------------------------------------------------------------------------------------
  table: { r: 3.2, thick: 0.05, segments: 96 },
  sweepWall: { width: 30, depth: 16, height: 9, radius: 3, z: -3.6 },
  hoop: { r: 1.0, wall: 0.03, h: 0.085, segments: 160 },
  glass: { color: "#e8f6f2", alphaFace: 0.07, alphaRim: 0.6, fresnelPower: 2.4, rimStrength: 0.35, envIntensity: 1.2 },

  // ---- ribbon (extrusion of the simulated curve) ---------------------------------------------------------------
  ribbon: {
    h: 0.13,           // standing height (m)
    thick: 0.006,      // paper thickness (m); faces sit at ±thick/2 from the curve
    roughness: 0.72,
    glow: 0.2,         // paper translucency fake: emissive share of the face colour (keeps deep folds pink, not grey)
    gradient: 0.35,    // colour drift along the ribbon's length (ribbon → ribbonB), so it reads as one long strip
    sweepWidth: 0.035, // width of the light band that can run along the ribbon (in material coordinate, 0..1)
    sweepGain: 0.9,
  },

  // ---- the simulation (growth.js) -----------------------------------------------------------------------------
  growth: {
    R: 1.0 - 0.0075,   // wall for the curve = hoop inner radius minus half the paper thickness and a hair
    wallGap: 0.0045,
    seed: 110,
    M: 4096,           // stored points per frame (fixed material coordinates)
    substeps: 8,
    // natural length (m) of the ribbon on the video clock; d = repulsion radius (spacing between neighbouring walls)
    lengthKeys: [[0, 2.639], [2.5, 3.1416], [5.4, 6.2832], [6.5, 8.6], [8.5, 14], [12, 33], [13.6, 42], [15, 43.5]],
    scaleKeys: [[0, 0.2], [7.5, 0.2], [8.6, 0.17], [11.5, 0.08], [15, 0.072]],
    bendKeys: [[0, 1], [15, 1]],
    sim: { grip: 0, jitter: 0.04, noise: 0.006, modes: [[7, 0.012]] },
  },

  // ---- overlay caption chip (top left) ------------------------------------------------------------------------
  caption: {
    x: 72, y: 56, h: 92, cap: 40, maxW: 860,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#2b2230", edge: "#4a3d50", ink: "#fff8f2",
  },

  sound: {
    rustle: { gain: 0.42, density: 0.5, pitch: 1.2 },
    fold: { gain: 0.32, pitch: 1.4 },
    contact: { gain: 0.32, hz: 523.25 },
    rise: { gain: 0.14 },
    settle: { gain: 0.26, root: 392.0, notes: [0, 4, 7, 12] },
    trace: { gain: 0.1 },
    bed: { gain: 0.3, root: 196.0, chord: [0, 7, 12, 16], brightness: 1000 },
  },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "whoosh", land: "tick", emphasis: "marimba", ui: "tick", bed: "pad" },
  motion: [
    "The ribbon's natural length grows on a schedule; the curve is stepped at load (springs, bending, repulsion, wall, point insertion) and stored per video frame.",
    "Until it first touches the glass the ring expands as a uniform scale (the stress-free solution for a free ring); after that the wall turns growth into compression and the ring buckles inward.",
    "The repulsion radius shrinks on a schedule, so the long walls of the first waves buckle again at a smaller scale: waves upon waves.",
    "Camera: locked holds, one move per beat; drifts down to ribbon height for the folds, ends straight overhead on the packed hoop.",
  ],
};
