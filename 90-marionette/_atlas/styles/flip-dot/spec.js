// styles/flip-dot/spec.js — STYLE_SPEC for "Flip-Dot Display". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the flip plan + score) and the browser.
// Units: metres (a giant sign: 20 cm disc pitch so one disc still reads at 1080p), Y-up, sRGB hex, radians.
//
// The look: a big electromechanical flip-disc sign (the kind old buses and station boards used) on a blue wall. A
// charcoal back plate with a pocket per cell holds a grid of round discs, fluorescent yellow on one side and matt
// black on the other; each disc pivots on a diagonal axle and physically flips over, hits its stop and bounces a
// little. Pictures are plain bitmaps; flipplan.js (THREE-free) turns a sequence of bitmaps into per-disc flip events
// with scan / radial / row / random wave orders, and the same events make the clatter.

export const STYLE_SPEC = {
  id: "flip-dot",
  name: "Flip-Dot Display",
  description:
    "A giant mechanical flip-disc sign: thousands of round discs, fluorescent yellow on one side and matt black on the other, physically flip on diagonal pivots in visible waves to form pictures and words, with a clatter made from the same flip plan.",
  palette: {
    bg: "#2f5f7e",          // wall behind the sign
    wall: "#3f7598",
    bright: "#f6e61e",      // the lit side of a disc (fluorescent yellow)
    brightAlt: "#f4f1e6",   // white-disc variant (opts.bright)
    dark: "#19191c",        // the matt black side
    plate: "#0f1013",       // back plate
    pocket: "#07080a",      // round pocket under each disc
    pivot: "#3a3d44",       // axle nubs printed on the plate
    bezel: "#2a2e35",       // sign housing
    ink: "#f4f5f7",
    accent: "#f6e61e",
  },
  world: {
    background: "#2f5f7e",
    environment: "room",
    environmentIntensity: 0.22,
    toneMapping: "neutral",   // keeps the yellow yellow (ACES drags it toward white)
    exposure: 1.0,
  },
  materials: {
    wall: { type: "standard", baseColor: "#3f7598", roughness: 0.95, metalness: 0 },
    bezel: { type: "standard", baseColor: "#2a2e35", roughness: 0.5, metalness: 0.55 },
    bezelLip: { type: "standard", baseColor: "#6d737d", roughness: 0.35, metalness: 0.8 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#ffffff", groundColor: "#8a94a3", intensity: 0.85 },
    // key from the upper left, in front of the sign: gives a mid-flip disc a bright edge and a shaded face
    { id: "key", type: "directional", color: "#fff6e6", intensity: 2.5, position: [-7, 9, 12], target: [0, 0, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 11, bias: -0.0005, normalBias: 0.02 } },
    { id: "kick", type: "directional", color: "#bcd6ff", intensity: 0.5, position: [9, -3, 8], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.28, offset: 1.1 },
  },
  camera: { fov: 30, near: 0.2, far: 80, drift: { amp: 0, speed: 0.2 } },   // no drift: holds are pixel-still (thousands of disc edges)
  text: { font: "sans", weight: 700, color: "#f4f5f7", height: 0.3 },

  // ---- the board ---------------------------------------------------------------------------------------------
  board: {
    cols: 64, rows: 36, pitch: 0.2,     // 2304 discs, 12.8 x 7.2 m (16:9)
    discR: 0.091,                       // disc radius (0.455 x pitch: neighbours nearly touch)
    discT: 0.012,                       // disc thickness
    radial: 28,                         // disc roundness
    axis: [0.7071068, 0.7071068, 0],    // pivot axle: the cell's diagonal
    plateZ: -0.022,                     // back plate behind the disc centres (a flipping disc dips into its pocket)
    tilt: 0.045,                        // seeded resting tilt per disc (rad): no two discs catch the light alike
    tone: 0.07,                         // seeded brightness spread per disc
    roughBright: 0.5, roughDark: 0.62,
    tilePx: 96,                         // plate texture: pixels per cell
  },
  housing: { margin: 0.07, bezel: 0.2, depth: 0.2, front: 0.12, wallZ: -0.2, wallSize: [60, 34] },

  // ---- one flip (flipplan.js) --------------------------------------------------------------------------------
  flip: {
    spring: { stiffness: 484, damping: 27.3 },   // reaches the stop in ~0.13 s
    bounce: 1.6,                                  // the overshoot comes back as a rebound off the stop (x this)
    settle: 0.45,                                 // s after which a disc is held exactly flat (still frames)
    spread: 0.9,                                  // default sweep time of a wave across the board (s)
    jitter: 0.07,                                 // seeded per-disc delay (s): a ragged, mechanical front
  },

  // ---- the beat label: one caption chip pinned to the screen (overlay = exact colours) -------------------------
  caption: {
    x: 78, y: 920, h: 84, cap: 36,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#101114", edge: "#f6e61e", ink: "#f4f5f7", dot: "#f6e61e", dotOff: "#3a3c42",
  },

  sound: {
    bin: 1 / 30,                 // clatter bins (s)
    lone: 2,                     // up to this many flips in a bin click one by one
    maxPerBin: 4,                // clatter grains per bin at most
    ref: 70,                     // flips per bin that count as "full clatter"
    pan: 0.7,
    click: { type: "tick", gain: 0.5, pitch: 1.9, dur: 0.03 },
    clatter: { type: "tick", gain: 0.55, pitch: [1.5, 2.5], dur: 0.03 },
    accent: { type: "clack", gain: 0.42, pitch: 1.7, dur: 0.09 },      // a close-up disc landing
    bed: { gain: 0.5, root: 98, brightness: 650 },
  },
  sfx: { enter: "tick", exit: "whooshOut", move: "clack", land: "clack", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Nothing moves except discs flipping: every picture change is a set of single-disc flips from the flip plan.",
    "A flip is a fast half turn on the diagonal axle that hits its stop at ~0.13 s and rebounds a few degrees; a settled disc is exactly still.",
    "Changes travel as waves: a scan line, a ring from a point, row by row, or a seeded sprinkle; the front is ragged by a small per-disc delay.",
    "Sound is the plan: one tick per lone flip, denser grains as more discs land in the same 1/30 s.",
    "Camera: moves only while discs are flipping; holds are pixel-still. Close-ups from ~30 degrees off-axis show the half turn.",
  ],
};
