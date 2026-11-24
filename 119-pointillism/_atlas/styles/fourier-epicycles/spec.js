// styles/fourier-epicycles/spec.js — STYLE_SPEC for "Fourier Epicycles" (a chain of spinning brass arms whose tip
// draws a picture). Plain data only: JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs,
// scene.config.js for the plan + score) and the browser. Units: metres. The drawing lies in the XZ plane (paper top at
// y = 0); the bird's "up" is world -Z, so a camera above and on the +Z side sees it upright. Toy scale: the bird is
// ~2 m across so the chain's arms read at 1080p.
//
// The look: a pale maple drafting table under bright warm daylight, a big sheet of cream paper, a brass pivot post and a
// chain of brass arms stacked one on the end of the last, each with its circle drawn as a thin brass ring. A coral-tipped
// pen at the end of the chain leaves a blue-black ink line. Earlier, coarser attempts stay on the paper in faint grey.

export const STYLE_SPEC = {
  id: "fourier-epicycles",
  name: "Fourier Epicycles",
  description:
    "A chain of spinning brass arms on a drafting table: each arm turns at a whole-number speed on the end of the last, each with its circle drawn as a thin brass ring, and a coral-tipped pen at the end of the chain leaves a blue-black ink line on cream paper. The arms are the terms of a discrete Fourier transform of a closed outline (epicycles.js: arc-length resampling, DFT in plain JS, terms sorted by size), so one arm draws a circle, a few draw a lumpy loop and sixty draw the picture. The ink line is the same finite sum evaluated up to the current phase; earlier, coarser outlines stay on the paper in faint grey. Bright warm daylight, brass, ink blue-black and one coral accent.",
  palette: {
    bg: "#e9dcc0",
    table: "#e6d2ae",
    tableDark: "#c9ad82",
    paper: "#f8f2e4",
    paperEdge: "#e9dfc8",
    tape: "#efe3c2",
    ink: "#18202f",
    grey: "#b3ab9c",
    brass: "#d0a548",
    brassLight: "#f7dc8f",
    brassDeep: "#7f5c1c",
    steel: "#5b5f66",
    coral: "#ff6450",
    nib: "#23262c",
    plate: "#1c2433",
    plateEdge: "#c99d45",
    plateText: "#fbf4e4",
  },
  world: {
    background: "#e9dcc0",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.5,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    table: { type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0 },
    paper: { type: "standard", baseColor: "#ffffff", roughness: 0.92, metalness: 0 },
    tape: { type: "standard", baseColor: "#efe3c2", roughness: 0.55, metalness: 0, opacity: 0.82 },
    brass: { type: "physical", baseColor: "#d0a548", roughness: 0.38, metalness: 1 },
    brassDark: { type: "physical", baseColor: "#9c7431", roughness: 0.38, metalness: 1 },
    steel: { type: "physical", baseColor: "#8d9198", roughness: 0.3, metalness: 1 },
    coral: { type: "standard", baseColor: "#ff6450", roughness: 0.42, metalness: 0, emission: { color: "#ff6450", strength: 0.18 } },
    nib: { type: "standard", baseColor: "#23262c", roughness: 0.35, metalness: 0.4 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fffaf2", groundColor: "#e4d6ba", intensity: 1.3 },
    {
      // warm daylight from the upper left and a little behind: arms throw short crisp shadows down-right on the paper
      id: "key", type: "directional", color: "#fff5e6", intensity: 2.2, position: [-2.6, 5.2, -1.4], target: [0, 0, 0],
      shadow: { softness: 2.2, mapSize: 4096, extent: 1.9, near: 1, far: 14, bias: -0.0003, normalBias: 0.006 },
    },
  ],
  post: {
    bloom: { strength: 0.1, radius: 0.3, threshold: 3.0 },   // only brass glints
    vignette: { darkness: 0.1, offset: 1.2 },
  },
  camera: { fov: 30, near: 0.02, far: 40, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 800, color: "#fbf4e4", height: 0.3 },

  // ---- the set -----------------------------------------------------------------------------------------------
  table: { size: [12, 8], wood: { size: 1024, boards: 6, seed: 113, grainFreq: 26, grainWarp: 1.4, contrast: 0.28, repeat: [3, 2] } },
  paper: { w: 3.7, h: 2.5, thick: 0.004, texture: { size: 1024, fiber: 0.025, grain: 0.018, seed: 113, variant: "even", repeat: [3, 2] }, tape: [0.26, 0.09] },

  // ---- the chain (planner output is in metres; these only size what is drawn) ----------------------------------
  chain: {
    scale: 1.0,             // bird units -> metres (the bird is ~2 m across)
    armW: 0.04,             // width of arm 0; others scale with sqrt(r) ...
    armWRatio: 0.62,        // ... but never wider than this x their length (tiny arms stay bars, not blobs)
    armH: 0.26,             // bar height / bar width (keeps the 60-arm stack ~0.11 m tall)
    minH: 0.0004,           // thinnest bar (m)
    minArmPx: 3.2,          // minimum drawn arm width on screen (px)
    base: 0.018,            // height of arm 0's underside above the paper
    gap: 0.0003,            // vertical gap between stacked arms ...
    gapK: 0.12,             // ... plus this x the bar height
    hub: 0.78,              // pivot hub radius / arm width
    ringW: 0.12,            // ring line width / arm width (world)
    minRingPx: 1.6,         // minimum drawn ring line width (px)
    ringMaxLocal: 0.32,     // ring half-width never more than this x its radius (tiny rings stay rings)
    post: { r: 0.045, base: 0.072, plate: 0.005 },
    pen: { r: 0.0105, nib: 0.024, collar: 0.0135, collarH: 0.007, above: 0.012, lift: 0.012 },
    sheenAngle: 2.4,        // ring highlight direction (rad, in the paper plane) to match the key light
  },
  ink: { world: 0.0095, minPx: 8, maxPx: 22, greyScale: 0.6, greyMinPx: 4.5, lift: 0.0015, bias: 0.004 },

  // ---- overlay caption plate (bottom centre: clear of the top-left badge box and below the drawing) -------------
  caption: {
    w: 940, h: 100, x: 490, y: 920, radius: 50, cap: 56,
    font: '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif', weight: 700,
    plate: "#1c2433", edge: "#c99d45", text: "#fbf4e4", ring: "#e2bd68", dot: "#ff6450",
  },

  sound: {
    partial: { f0: 196, gain: 0.3, curve: 0.7, attack: 0.3, release: 2.8, brightness: 7000 },
    unfurl: { gain: 0.16 },
    scratch: { gain: 0.09 },
    close: { gain: 0.9 },
    lift: { gain: 0.32 },
    done: { gain: 0.55 },
  },
  sfx: { enter: "tick", exit: "whooshOut", move: "penScratch", land: "tick", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Every arm turns at a whole-number speed k (once per cycle for k = 1, twice for k = 2, backwards for negative k) on the end of the arm before it; the pen is the sum of all arms.",
    "The ink line is the same finite Fourier sum evaluated from phase 0 up to the current phase — never accumulated; each drawing is exactly one full turn.",
    "New arms unfurl largest first (length 0 -> r with a small overshoot) while the pen is lifted; the previous outline fades to faint grey.",
    "Arms are stacked one on the end of the last; tiny outer arms keep a minimum on-screen width, rings a minimum line width.",
  ],
};
