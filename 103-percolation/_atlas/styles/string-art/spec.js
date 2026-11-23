// styles/string-art/spec.js — STYLE_SPEC for "String Art" (curve stitching on a nail board). Plain data only:
// JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the winding plan +
// score) and the browser. Units: metres. The board stands upright in the XY plane (front face at z = 0, nails point +Z),
// toy-scale (5.4 m x 3.0 m, a 16:9-ish board) so a 13 mm thread is ~5 px wide in the full-board shot.
//
// The look: a dark walnut-stained board, well lit by warm workshop light, with rows and a ring of brass nails. Bright
// saturated thread is wound nail to nail; every thread is perfectly straight, yet together they draw smooth curves
// (parabola fans from two nail rows, a cardioid from a ring). A needle tip draws each thread up to the current point and a
// small wrap appears round each nail it turns on. The same winding plan drives the plucks and ticks.

export const STYLE_SPEC = {
  id: "string-art",
  name: "String Art",
  description:
    "Curve stitching on a nail board: a dark walnut-stained board (well lit, warm workshop light) with rows and a ring of brass nails; saturated cotton thread is wound nail to nail by a moving needle tip, each thread drawn up to the current point with a tiny wrap round every nail it turns on. Every thread is perfectly straight, yet together they make smooth curves — parabola fans between two nail rows, a cardioid from a ring (chords m -> 2m, wound as continuous doubling cycles). Threads stack in winding order, cast thin shadows on the board and catch a soft sheen; nails catch highlights. A winding planner (winding.js) is the single source of truth for picture and sound: a soft pluck per thread, pitch rising with its index.",
  palette: {
    bg: "#5a4232",
    wall: "#6a5040",
    woodDark: "#674430",
    woodMid: "#93694a",
    woodLight: "#b78d66",
    woodSeam: "#4a2c18",
    brass: "#f2cd78",
    brassDeep: "#8a6a2c",
    threadA: "#ffd800",     // lemon-gold yellow (the story fan)
    threadB: "#00d2c4",     // turquoise (second fan)
    threadD: "#86e800",     // lime (top-right fan)
    threadC: "#ff2478",     // magenta (the cardioid)
    ink: "#24170f",
    tag: "#f4ead6",
    tagEdge: "#d9c7a6",
  },
  world: {
    background: "#5a4232",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",
    exposure: 1.15,
    shadowType: "auto",
  },
  materials: {
    board: { type: "standard", baseColor: "#ffffff", roughness: 0.55, metalness: 0 },
    frame: { type: "standard", baseColor: "#5a3820", roughness: 0.45, metalness: 0 },
    wall: { type: "standard", baseColor: "#7a6050", roughness: 0.95, metalness: 0 },
    brass: { type: "physical", baseColor: "#f2cd78", roughness: 0.3, metalness: 1, emission: { color: "#f2cd78", strength: 0.12 } },
    thread: { type: "physical", baseColor: "#c4c4c4", roughness: 0.5, metalness: 0, sheen: 0.2 },
    needle: { type: "physical", baseColor: "#e6e8ec", roughness: 0.18, metalness: 1 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fff4e4", groundColor: "#7a5a44", intensity: 1.15 },
    {
      // warm workshop key from upper left, raking enough that threads and nails throw short crisp shadows down-right
      id: "key", type: "directional", color: "#ffe6c4", intensity: 4.4, position: [-4.2, 4.6, 6.0], target: [0, 0, 0],
      shadow: { softness: 1.6, mapSize: 4096, extent: 3.3, near: 1, far: 20, bias: -0.0004, normalBias: 0.012 },
    },
    // cool-neutral front fill from lower right so the dark wood still reads as wood, not black
    { id: "front", type: "directional", color: "#eef2ff", intensity: 1.1, position: [3.5, -1.5, 7], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.12, radius: 0.3, threshold: 2.6 },   // only the needle glint and the tip bead
    vignette: { darkness: 0.28, offset: 1.1 },
  },
  camera: { fov: 32, near: 0.1, far: 60, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#24170f", height: 0.3 },

  // ---- the board ------------------------------------------------------------------------------------------
  board: { w: 5.4, h: 3.0, d: 0.09, radius: 0.025, frame: 0.07, frameD: 0.13, wallZ: -0.5, wallSize: 30 },
  wood: { size: 1024, boards: 5, seed: 97, grainFreq: 34, grainWarp: 1.8, contrast: 0.5, repeat: [1, 1] },
  nail: { shaftR: 0.0105, height: 0.09, headR: 0.025, headH: 0.009, segments: 12 },
  thread: {
    radius: 0.0125,        // m (25 mm thick: ~9 px in the full-board shot)
    z0: 0.028,              // height of the first thread above the board face
    dz: 0.00016,           // each later thread sits a hair higher (winding order) so crossings layer like real thread
    wrapR: 0.019,         // wrap ring radius round a nail shaft
    wrapTube: 0.0065,
    sheenColor: "#fff2dc",
    glow: 0.16,            // self-light so thread in shadow keeps its hue and reads bright
  },
  needle: { length: 0.26, radius: 0.0055, tilt: 0.62, lift: 0.07, bead: 0.017, beadGlow: 2.6, fadeIn: 0.22, fadeOut: 0.3 },

  // ---- the layout (planner input; metres in board coordinates, origin at the board centre) ----------------
  layout: {
    fans: [
      // unequal arms (Lu along the bottom, Lv up the side): the fan region is ~3:2, so it can fill a 16:9 frame
      { id: "fanA", corner: [2.5, -1.3], u: [-1, 0], v: [0, 1], Lu: 2.45, Lv: 1.6, n: 24, color: "threadA" },
      { id: "fanB", corner: [-2.5, -1.3], u: [1, 0], v: [0, 1], Lu: 2.45, Lv: 1.6, n: 24, color: "threadB" },
      { id: "fanD", corner: [2.5, 1.3], u: [-1, 0], v: [0, -1], Lu: 1.9, Lv: 0.86, n: 18, color: "threadD" },
    ],
    // N odd so doubling mod N is a permutation: chords m -> 2m split into closed cycles, each wound as ONE continuous thread
    rings: [{ id: "ring", center: [0, 0], R: 1.16, N: 73, phase: 1.5707963, color: "threadC" }],
  },

  // ---- overlay caption tag (top-left: the board's top corners stay empty wood; the fans sit in the bottom corners) ---------------------------
  caption: {
    x: 112, y: 72, h: 92, cap: 46, maxW: 860,
    font: '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif', weight: 700,
    plate: "#f4ead6", edge: "#d9c7a6", ink: "#24170f", nail: "#c9a14c",
  },

  sound: {
    bed: { root: 130.81, chord: [0, 7, 12, 16], brightness: 820, gain: 0.55 },
    pluck: { hz: 196, decay: 0.9, bright: 0.55, gain: 1.6, steps: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24] },
    tick: { gain: 0.22 },
    whoosh: 0.3,
    done: { gain: 0.32 },
  },
  sfx: { enter: "pluck", exit: "whooshOut", move: "whoosh", land: "tick", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Every thread is a straight segment from nail to nail; the curve is only the envelope of many of them.",
    "A needle tip draws each thread up to the current point (eased when slow, linear when fast) and lifts in a small arc between threads.",
    "Threads stack in winding order a hair apart and cast thin shadows, so crossings layer like real thread.",
    "Ring figures (chords m -> 2m mod N, N odd) are wound as closed doubling cycles: one continuous thread per cycle.",
  ],
};
