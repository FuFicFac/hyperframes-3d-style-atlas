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
    bg: "#2a1d15",
    wall: "#3a2a1f",
    woodDark: "#3d2516",
    woodMid: "#62402a",
    woodLight: "#86593a",
    woodSeam: "#1d110a",
    brass: "#d9b25c",
    brassDeep: "#8a6a2c",
    threadA: "#ffb20a",     // warm marigold yellow (the story fan)
    threadB: "#1fd6c8",     // turquoise (second fan)
    threadC: "#ff3d7f",     // magenta (the cardioid)
    ink: "#24170f",
    tag: "#f4ead6",
    tagEdge: "#d9c7a6",
  },
  world: {
    background: "#2a1d15",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",
    exposure: 1.15,
    shadowType: "auto",
  },
  materials: {
    board: { type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0 },
    frame: { type: "standard", baseColor: "#3a2416", roughness: 0.5, metalness: 0 },
    wall: { type: "standard", baseColor: "#4a382b", roughness: 0.95, metalness: 0 },
    brass: { type: "physical", baseColor: "#d9b25c", roughness: 0.4, metalness: 1 },
    thread: { type: "physical", baseColor: "#ffffff", roughness: 0.62, metalness: 0, sheen: 0.3 },
    needle: { type: "physical", baseColor: "#e6e8ec", roughness: 0.18, metalness: 1 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fff4e4", groundColor: "#5a4030", intensity: 0.95 },
    {
      // warm workshop key from upper left, raking enough that threads and nails throw short crisp shadows down-right
      id: "key", type: "directional", color: "#ffe6c4", intensity: 3.6, position: [-4.2, 4.6, 6.0], target: [0, 0, 0],
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
  wood: { size: 1024, boards: 5, seed: 97, grainFreq: 40, grainWarp: 1.6, contrast: 0.35, repeat: [1, 1] },
  nail: { shaftR: 0.0085, height: 0.085, headR: 0.017, headH: 0.007, segments: 10 },
  thread: {
    radius: 0.0065,        // m (13 mm thick: ~5 px in the full-board shot)
    z0: 0.03,              // height of the first thread above the board face
    dz: 0.00018,           // each later thread sits a hair higher (winding order) so crossings layer like real thread
    wrapR: 0.0145,         // wrap ring radius round a nail shaft
    wrapTube: 0.0042,
    sheenColor: "#ffffff",
    glow: 0.06,            // a touch of self-light so thread in shadow keeps its hue
  },
  needle: { length: 0.26, radius: 0.0055, tilt: 0.62, lift: 0.07, bead: 0.017, beadGlow: 2.6, fadeIn: 0.22, fadeOut: 0.3 },

  // ---- the layout (planner input; metres in board coordinates, origin at the board centre) ----------------
  layout: {
    fans: [
      { id: "fanA", corner: [2.5, -1.3], u: [-1, 0], v: [0, 1], L: 2.05, n: 24, color: "threadA" },
      { id: "fanB", corner: [-2.5, -1.3], u: [1, 0], v: [0, 1], L: 2.05, n: 24, color: "threadB" },
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
    pluck: { hz: 196, decay: 0.9, bright: 0.55, gain: 0.5, steps: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24] },
    tick: { gain: 0.1 },
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
