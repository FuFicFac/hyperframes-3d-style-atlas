// styles/slit-scan/spec.js — STYLE_SPEC for "Slit-Scan" (time-displacement photography). Plain data only:
// JSON-serializable, no THREE, no window. Units: metres, Y-up, colours sRGB hex, radians, seconds.
// The look: bright flat-lit toys in steady motion on a cream set, photographed by a camera whose every screen
// column shows a different moment. `slices` tunes the multi-render time map; `toys` the subjects and their motion.
export const STYLE_SPEC = {
  id: "slit-scan",
  name: "Slit-Scan",
  description: "Bright toys in steady motion, photographed so every screen column shows a different moment: rigid bars twist into corkscrews, straight rods bend into waves, unison becomes a ripple.",
  palette: {
    bg: "#f1eadb", wall: "#f4eee1", floor: "#e6dcc8", ink: "#1d2540",
    coral: "#ff5a4d", yellow: "#ffc531", teal: "#12b5a5", indigo: "#3d4fc4", cream: "#fff8ea", steel: "#56607a",
    then: "#7a3cff", now: "#ffc531", scan: "#ffe9a8",
  },
  world: { background: "#f1eadb", environment: null, toneMapping: "none", exposure: 1, shadowType: "pcf" },
  materials: {
    toy: { type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0, vertexColors: true },
    wall: { type: "standard", baseColor: "#f4eee1", roughness: 0.95, metalness: 0 },
    floor: { type: "standard", baseColor: "#e6dcc8", roughness: 0.95, metalness: 0 },
  },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#ffffff", groundColor: "#d9cdb8", intensity: 1.55 },
    { id: "key", type: "directional", color: "#fff6e8", intensity: 1.9, position: [5, 9.5, 9], target: [0, 2.2, 0], shadow: { softness: 2.5, mapSize: 2048, extent: 8.5, bias: -0.0006, normalBias: 0.03 } },
    { id: "fill", type: "directional", color: "#e4ecff", intensity: 0.45, position: [-7, 3, 6], target: [0, 2.2, 0] },
  ],
  post: {}, // the style installs its own stateless multi-pass (stage.post = the time camera); no kit composer
  camera: { fov: 24, near: 1, far: 80, drift: { amp: 0, speed: 0 } },
  text: { font: "rounded", weight: 800, color: "#1d2540", height: 0.5 },
  sfx: { enter: "pop", exit: "whooshOut", move: "whir", land: "thud", emphasis: "chime", ui: "tick", bed: "pad" },

  // ---- the time camera: K+1 slice nodes across the frame, each a render of the same scene at its own world time
  slices: {
    count: 128,        // K strips (must divide 1920 x supersample evenly for clean strip edges: 96, 120, 128, 160, 192)
    supersample: 2,    // slices are rendered at 2x and box-filtered down (anti-aliasing without MSAA resolves)
    axis: "x",         // time runs along screen x (columns)
    vignette: 0.1,
    scan: { core: 3.2, halo: 46, coreGain: 1.6, haloGain: 0.42 },
  },
  // ---- on-screen ruler (drawn by the composite shader from the same lag table the slices use) + delay knob
  ruler: { x0: 100, x1: 1470, y0: 986, y1: 1030, radius: 22, tickStep: 0.5, lagMax: 4.8, edge: "#1d2540", tick: "#1d2540" },
  knob: { x: 1752, y: 1006, r: 46, max: 5, face: "#fff8ea", ring: "#1d2540", pointer: "#ff5a4d", labelX: 1590 },
  caption: { y: 0.795, height: 0.06, plate: "#1d2540", ink: "#fff8ea", radius: 56 },

  // ---- the subjects. All motion is a closed form of WORLD time w (timeslice.js createToys)
  toys: {
    postX: 5.78, postW: 0.36, postD: 0.56, postH: 5.35,
    beam: { length: 10.9, size: 0.84, y: 2.62, rate: 0.4, colors: ["coral", "yellow", "teal", "indigo"], hubR: 0.66, hubW: 0.2 },
    rod: { length: 11.3, radius: 0.065, y: 4.2, amp: 0.42, period: 1.6, beads: 15, beadR: 0.185, beadSpan: 10.2, colors: ["indigo", "coral", "teal", "yellow"] },
    metronome: { count: 11, span: 10.0, z: 1.35, period: 1.2, swing: 0.56, arm: 1.2, pivotY: 0.2, bob: 0.135, bobAt: 0.78, colors: ["coral", "yellow", "teal"] },
    wallZ: -1.7,
  },
  sound: {
    tone: { gain: 0.2, base: 98, octavePer: 2.4, overlap: 0.12, grit: 0.08 }, // hz = base x 2^(delay / octavePer)
    tick: { gain: 0.34, unison: 0.62 },
    scan: { gain: 0.2 },
    bed: { gain: 0.3, root: 147, brightness: 950 },
  },
  motion: [
    "Nothing in the world ever bends: toys spin, bob and tick rigidly in world time w.",
    "The camera shows world time w(t, x) = t - lag(t, x): a scan line writes the map column by column, then the delay dial stretches and collapses it.",
    "Camera locked; the only screen motion is the toys and the time map.",
  ],
};
