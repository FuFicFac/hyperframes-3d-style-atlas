// styles/loom-weave/spec.js — STYLE_SPEC for "Loom Weave". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs; scene.config.js reads the loom layout for the pick plan and camera shots).
// Units: metres, Y-up, colours sRGB hex. The loom is drawn at a generous toy scale (5 cm warp spacing) so 40 threads and
// 36 rows fill a 16:9 frame with every crossing ~20 px wide in the final wide.
//
// The look: a pale wooden tabletop loom in bright daylight seen from the weaver's side, a little above. Forty cream warp
// threads run from the cloth beam (front) through a per-thread jacquard harness (string heddles with brass eyes and small
// weights) and a reed, to the warp beam (back). A boat shuttle carries red, gold or blue weft through the shed; the reed
// beats each row into the fell. To the right, a brown punched card on a warm lightbox advances one row per pick in step
// with the cloth: its holes glow, and each row of holes is exactly the row of lifted threads woven beside it.

export const STYLE_SPEC = {
  id: "loom-weave",
  name: "Loom Weave",
  description:
    "A wooden tabletop jacquard loom in bright daylight, seen from the weaver's side: cream warp threads, a harness of string heddles that lift threads one by one, a boat shuttle flying red, gold and blue weft through the shed, a reed beating each row into the fell, and the growing cloth rendered crossing by crossing (a shader reads the weave draft: over/under per crossing, thread relief and twist). Beside the cloth a brown punched card glows on a lightbox and advances one row per pick in step with the cloth, so each row of holes sits beside the row of cloth it wove. A draft planner (pattern bitmap + plain-weave borders) decides every lift; shed, shuttle, beat, cloth advance, card pins and every clack, swish and thump are functions of t from the same pick plan, which speeds up so a motif emerges out of ordinary-looking rows.",
  palette: {
    bg: "#efe8dc",
    table: "#e3d6c2",
    wood: "#c98d4e",
    woodDark: "#8a5a2e",
    warp: "#f3ead6",
    red: "#d2392f",
    gold: "#f0b429",
    blue: "#1f5fbf",
    card: "#8f5f36",
    glow: "#fff0bf",
    brass: "#c9a03c",
    ink: "#1d2f5c",
  },
  world: {
    background: "#efe8dc",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    table: { type: "standard", baseColor: "#ffffff", roughness: 0.75, metalness: 0, map: { source: "wood", size: 512, boards: 4, seed: 98, dark: "#cdbb9f", mid: "#e0d1b8", light: "#ece1cd", repeat: [3, 3], description: "pale limed-oak table boards" } },
    wood: { type: "standard", baseColor: "#ffffff", roughness: 0.55, metalness: 0, map: { source: "wood", size: 256, boards: 1, seed: 981, dark: "#a86b35", mid: "#c98d4e", light: "#ddaa6c", repeat: [1, 1], description: "honey beech loom frame" } },
    woodDark: { type: "standard", baseColor: "#8a5a2e", roughness: 0.45, metalness: 0 },
    warp: { type: "standard", baseColor: "#f3ead6", roughness: 0.85, metalness: 0 },
    cloth: { type: "standard", baseColor: "#ffffff", roughness: 0.86, metalness: 0 },
    card: { type: "standard", baseColor: "#ffffff", roughness: 0.8, metalness: 0 },
    cord: { type: "standard", baseColor: "#5b4636", roughness: 0.8, metalness: 0 },
    brass: { type: "standard", baseColor: "#e3b955", roughness: 0.36, metalness: 0.55 },
    lead: { type: "standard", baseColor: "#4a4a50", roughness: 0.4, metalness: 0.6 },
    lightbox: { type: "standard", baseColor: "#f6eedf", roughness: 0.6, metalness: 0, emission: { color: "#ffe7a8", strength: 0.6 } },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fffaf0", groundColor: "#b9a58a", intensity: 1.15 },
    {
      // daylight from a window at front-left, high: short soft shadows of threads and harness falling back-right
      id: "key", type: "directional", color: "#fff3df", intensity: 2.5, position: [-4.0, 8.5, 5.0], target: [0, 0, -0.6],
      shadow: { softness: 1.4, mapSize: 4096, extent: 3.6, near: 1, far: 30, bias: -0.0002, normalBias: 0.008 },
    },
  ],
  post: {
    bloom: { strength: 0.22, radius: 0.25, threshold: 2.4 },
    vignette: { darkness: 0.22, offset: 1.2 },
  },
  camera: { fov: 32, near: 0.2, far: 60, drift: { amp: 0, speed: 0.2 } }, // locked holds: dense thread detail compresses
  text: { font: "sans", weight: 800, color: "#1d2f5c", height: 0.3 },

  // ---- loom layout (scene.config.js builds the pick plan + shots from this) --------------------------------------------
  loom: {
    warps: 40,          // warp threads (= card columns)
    spacing: 0.05,      // warp spacing (m)
    pick: 0.05,         // row pitch (m), cloth and card
    x0: -2.1,           // left edge of the warp band
    y: 0.32,            // cloth / warp plane height above the table
    zFell: -0.9,        // the fell line (newest row); cloth + card advance toward +z (the weaver)
    lead: 2,            // extra rows of bare warp between the finished cloth and the cloth beam
    zReed: -1.26,       // reed rest (beats to the fell)
    zHeddle: -1.65,     // harness line (heddle eyes)
    zBack: -2.55,       // warp beam
    shedUp: 0.26,       // eye rise for a lifted warp (m)
    shedDown: 0.07,     // eye drop for a lowered warp
    zShuttle: -1.07,    // shuttle path (between fell and reed rest)
    railX: [-2.78, 0.56],
    harnessTop: 1.28,   // comber board height
    thread: 0.009,      // warp radius (3D segments)
    relief: 0.012,      // cloth thread relief (normal strength, m)
  },
  card: { x0: 0.78, colPitch: 0.04, margin: 0.13, hole: 0.34, rowsPerCard: 6, glow: 2.2, pulse: 2.0, boost: 1.6, weft: 0.0105, readerDepth: 0.3, pin: 0.07 },
  shuttle: { length: 0.36, width: 0.08, height: 0.05, restL: -2.46, restR: 0.24 },
  wefts: { border: ["#d2392f", "#f0b429", "#d2392f"], motif: "#1f5fbf" },

  // ---- overlay caption: a woven name-tape (top centre) -----------------------------------------------------------------
  caption: {
    x: 960, y: 44, h: 86, cap: 42, maxW: 900,
    font: '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif', weight: 700,
    plate: "#f8f1df", stitch: "#c8352b", ink: "#1d2f5c", shadow: "rgba(40,25,10,0.28)",
  },

  sound: {
    shed: { gain: 0.34, pitch: 0.7 },
    throw: { gain: 0.3, pitch: 1.6 },
    catch: { gain: 0.22, pitch: 0.8 },
    beat: { gain: 0.5, pitch: 1.3 },
    card: { gain: 0.14, pitch: 1.4 },
    bed: { gain: 0.42, root: 147, chord: [0, 7, 12, 16], brightness: 800 },
  },
  sfx: { enter: "clack", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Every pick: heddles lift this row's threads (clack), the shuttle crosses the open shed trailing weft (swish), the reed beats it into the fell (thump), and the cloth and card advance one row (tick).",
    "Picks speed up exponentially (planner solves the rate) so slow plain rows give way to a fast clatter in which the motif appears.",
    "Card row k and cloth row k advance together and always lie side by side: hole = lifted thread = cream on top.",
    "Camera: locked holds joined by short eased moves (no drift); the woven cloth never moves except its one-row advance per pick.",
  ],
};
