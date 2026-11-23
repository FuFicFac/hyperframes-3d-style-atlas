// styles/magnetic-memory/spec.js — STYLE_SPEC for "Magnetic Memory". Plain data only: JSON-serializable, no THREE,
// no window. Importable from Node (export-spec.mjs, and the demo's scene.config.js for the plan, camera and SCORE).
// Units: metres, Y-up. The board lies flat on a table in the XZ plane (tile tops at y = 0); +Z is the camera side.
//
// The look: a bright white tabletop board with a lattice of small square cells. Each cell holds a hard two-tone tile on
// an axle: matte cream on one face, glossy deep-indigo lacquer on the other, vermilion edges. Every tile latches either
// way. A red-and-silver bar magnet on a dark handle sweeps over the board; tiles under it swing over and stay.

export const STYLE_SPEC = {
  id: "magnetic-memory",
  name: "Magnetic Memory",
  description:
    "A bright white tabletop board holding a lattice of small two-tone latching tiles (matte cream one face, glossy indigo lacquer the other, vermilion edges), each on its own axle. A red-and-silver bar magnet on a dark handle sweeps a curve over the board: tiles under it swing over in a wave and stay flipped when it leaves. A weaker, higher pass with the magnet turned over flips only some back. Every tile's flip time is the first moment the pull at its cell beats its own seeded threshold along the magnet's known path, so any frame is computed directly. Neutral tone mapping, soft key light, hard tiles, no liquid.",
  palette: {
    bg: "#e8e2d7",
    table: "#e6ded0",
    board: "#fbfaf6",
    lattice: "#ffffff",
    pit: "#aab6c4",
    pale: "#f3e7c9",
    dark: "#1e2950",
    edge: "#e0623a",
    red: "#d62f2a",
    silver: "#cfd5dc",
    grip: "#25282e",
    ink: "#1e2950",
    cream: "#fff6df",
  },
  world: {
    background: "#e8e2d7",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.7,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    table: { type: "standard", baseColor: "#e6ded0", roughness: 0.88, metalness: 0 },
    board: { type: "physical", baseColor: "#fbfaf6", roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.2 },
    lattice: { type: "standard", baseColor: "#ffffff", roughness: 0.5, metalness: 0 },
    pit: { type: "standard", baseColor: "#aab6c4", roughness: 0.9, metalness: 0 },
    tilePale: { type: "standard", baseColor: "#f3e7c9", roughness: 0.62, metalness: 0 },
    tileDark: { type: "physical", baseColor: "#1e2950", roughness: 0.32, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 },
    tileEdge: { type: "standard", baseColor: "#e0623a", roughness: 0.5, metalness: 0 },
    magnetRed: { type: "physical", baseColor: "#d62f2a", roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.12 },
    magnetSilver: { type: "standard", baseColor: "#d3d8de", roughness: 0.24, metalness: 1 },
    grip: { type: "physical", baseColor: "#25282e", roughness: 0.55, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#bdb4a6", intensity: 1.15 },
    {
      id: "key", type: "directional", color: "#fff5e8", intensity: 2.2, position: [-4.5, 8, 5], target: [0, 0, 0],
      shadow: { softness: 1.2, mapSize: 4096, extent: 4.4, near: 1, far: 30, bias: -0.0004, normalBias: 0.012 },
    },
    { id: "rim", type: "directional", color: "#e9f0ff", intensity: 0.55, position: [5, 3, -6], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.12, radius: 0.25, threshold: 2.8 },
    vignette: { darkness: 0.2, offset: 1.2 },
  },
  dof: { relativeAperture: 0.006, maxblur: 0.005 },   // kit/studio.depthOfField, focus on the rig target
  fly: { height: 1.3, side: 0.35, ahead: 0.75, fov: 40 }, // demo fly-along over the track: camera height, near-side offset, look-ahead (s of path), fov
  camera: { fov: 30, near: 0.1, far: 60, drift: { amp: 0, speed: 0.2 } }, // locked holds keep the MP4 small
  text: { font: "sans", weight: 800, color: "#fff6df", height: 0.4 },

  // ---- board + tile geometry (metres) -------------------------------------------------------------------------
  grid: { cols: 56, rows: 30, pitch: 0.1 },
  tile: { size: 0.086, thick: 0.014, radius: 0.004, sink: 0.002, darkEnv: 0.2 },   // sink: tile top below the lattice top; darkEnv: env reflection on the lacquer face
  board: { margin: 0.2, pitDepth: 0.06, wall: 0.01, lip: 0.012, base: 0.1 },

  // ---- the magnet (a vertical bar on a horizontal handle; roll PI = turned over) -------------------------------
  magnet: {
    w: 0.26, L: 0.9, radius: 0.03,
    handle: { r: 0.032, len: 1.25, grip: 0.5, gripR: 0.05, dir: [-0.8, 0, -0.6] },
    collar: 0.08,
  },

  // ---- the plan (memory.js) ---------------------------------------------------------------------------------------
  plan: {
    seed: 107,
    darkShare: 0.25,
    coerc: { median: 2.2, sigma: 0.55 },     // tile thresholds, log-normal (pull units of memory.pull with q = 1)
    settle: { share: 0.3, t0: 0.05, t1: 1.7 },
    q: 1,
    dt: 1 / 240,
    swing: { stiffness: 484, damping: 24 },  // the flip: a damped swing (omega0 22 rad/s, zeta 0.55)
    tilt: { max: 0.35, show: true },         // radians: lean toward the magnet before a flip
    h1: 0.16,                                // first pass: near pole 16 cm above the tiles
    h2: 0.52,                                // second pass: higher, so weaker
  },

  // ---- overlay caption (a dark indigo plate with a small bar-magnet icon, top centre) -------------------------------
  caption: {
    x: 960, y: 56, h: 88, cap: 50, maxW: 900,
    font: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: 800,
    plate: "#1e2950", edge: "#f3e7c9", ink: "#fff6df", red: "#e0403a", silver: "#d3d8de",
  },

  sound: {
    settle: { gain: 0.32, base: 0.35, per: 0.22, pitch: 1.35 },
    pass1: { gain: 0.5, base: 0.4, per: 0.2, pitch: 1.1 },
    pass2: { gain: 0.42, base: 0.45, per: 0.25, pitch: 0.92 },
    bed: { gain: 0.5, root: 110, chord: [0, 7, 12, 14], brightness: 900 },
    whoosh: { gain: 0.22 },
  },
  sfx: { enter: "click", exit: "whooshOut", move: "whoosh", land: "click", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Every tile has its own flip times from memory.js: the first moment the magnet's pull at its cell beats its seeded threshold.",
    "A flip is a closed-form damped swing about the tile's axle (about 0.3 s); before it, a pushed tile leans toward the magnet.",
    "After the magnet leaves, nothing moves: the track is pure memory.",
    "Camera: locked holds joined by short eased moves (no drift): top-down, three-quarter, a low raking glide along the track, high wide.",
  ],
};
