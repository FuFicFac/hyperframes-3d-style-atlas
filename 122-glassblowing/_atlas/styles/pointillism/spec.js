// styles/pointillism/spec.js — STYLE_SPEC for "Pointillism" (a painting made only of dots of pure, unmixed paint).
// Plain data only: JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js and
// the dots.js planner) and the browser. Units: metres. The canvas stands upright in the XY plane (paint surface at z = 0,
// facing +Z), centred on the origin; the camera looks along -Z.
//
// The look: a big stretched canvas in a bright, warm studio. Thousands of round dabs of pure paint from a ten-hue
// palette (no browns, no greys, no black) sit side by side with a little raised relief, a darker rim and a wet highlight;
// cream canvas weave shows between them. Two round brushes dab on their own. Colours are never mixed on the canvas:
// "green" is lemon and cerulean dots, shadows carry a share of the complementary hue, and a defocus (the squint) shows
// the eye doing the mixing.

export const STYLE_SPEC = {
  id: "pointillism",
  name: "Pointillism",
  description:
    "A big stretched canvas in a bright warm studio, painted only with small round dabs of pure, unmixed paint from a ten-hue palette (no browns, greys or black). Each dab has a little raised relief, a darker rim and a wet highlight; cream canvas weave shows between them. A planner (dots.js) builds an original sunlit scene from gradients and shapes, scatters ~10,000 dots on a jittered grid and gives each one a pure palette colour by a seeded rule so the local average matches the scene: mostly the two nearest pure hues in proportion, plus a share of the complementary hue in shadows. Dots pop on region by region; two round brushes dab on their own in close-up; a display-space defocus (the squint) melts the dots into the colours the eye mixes.",
  palette: {
    bg: "#f3ede2",
    wall: "#f1ebdf",
    canvas: "#f4ecda",
    canvasEdge: "#ece2cc",
    stretcher: "#e2cf9f",
    handle: "#efd59c",
    ferrule: "#c9ccd2",
    bristle: "#f1e3b8",
    plate: "#1d2147",
    plateEdge: "#ffd23a",
    plateText: "#fffaf0",
    // the paint: ten clean hues, no browns, no greys, no black (order = palette index used by the planner)
    paint: {
      white: "#fff8ea",
      lemon: "#ffe03a",
      orange: "#ff8a1c",
      vermilion: "#f03c2a",
      rose: "#ff5fa2",
      lilac: "#c6a8ff",
      violet: "#7a46e0",
      ultramarine: "#2b47d6",
      cerulean: "#1a9ff0",
      sky: "#86ccff",
    },
  },
  world: {
    background: "#f3ede2",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.45,
    toneMapping: "none",   // paint colours must read as designed; every lit value is kept <= 1
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    wall: { type: "standard", baseColor: "#efe8dc", roughness: 0.95, metalness: 0 },
    canvasEdge: { type: "standard", baseColor: "#ece2cc", roughness: 0.9, metalness: 0 },
    stretcher: { type: "standard", baseColor: "#e2cf9f", roughness: 0.75, metalness: 0 },
    handle: { type: "physical", baseColor: "#efd59c", roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.2 },
    ferrule: { type: "physical", baseColor: "#c9ccd2", roughness: 0.28, metalness: 1 },
    bristle: { type: "standard", baseColor: "#ffffff", roughness: 0.6, metalness: 0, vertexColors: true },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fffaf2", groundColor: "#eadfcb", intensity: 1.15 },
    {
      // the studio window: upper left and in front of the canvas (the dots' shader uses the same direction)
      id: "key", type: "directional", color: "#fff6ea", intensity: 1.5, position: [-2.6, 3.2, 4.0], target: [0, 0, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 2.6, near: 0.5, far: 14, bias: -0.0004, normalBias: 0.01 },
    },
  ],
  post: {
    vignette: { darkness: 0.08, offset: 1.25 },
  },
  camera: { fov: 30, near: 0.01, far: 30, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 800, color: "#fffaf0", height: 0.3 },

  // ---- the canvas and the dots (planner + shader) ------------------------------------------------------------
  canvas: {
    w: 3.5, h: 2.0,          // metres (aspect 1.75: the full view nearly fills 16:9)
    depth: 0.045,            // stretcher depth
    weave: 0.0046,           // canvas thread period (m); fades out analytically once it is under ~3 px on screen
    weaveAmp: 0.1,
    wallGap: 0.02,           // canvas back to wall
  },
  dots: {
    cols: 132, rows: 76,     // ~10,000 dots on a jittered, row-offset grid
    jitter: 0.32,            // x cell size
    radius: 0.6,             // x cell width (dabs overlap a little: ~85-90 % cover)
    radiusVar: 0.24,
    aspect: [1.0, 1.28],     // dabs are slightly oval ...
    angle: [0.35, 1.05],     // ... and lean the same way (rad), like one hand's strokes
    edgeWobble: 0.07,        // irregular dab outline (fraction of radius)
    relief: 0.55,            // slope of the dome's sides (shading only): a LITTLE raised
    rim: 0.36,               // darker rim strength
    gloss: 0.12,             // wet highlight strength
    shadow: 0.2,             // soft cast shadow beside each dab (on whatever is under it)
    streaks: 0.045,          // bristle streaks inside a dab (fade out when tiny on screen)
    lift: 0.0008,            // quads sit this far in front of the canvas
    light: [-0.45, 0.55, 0.7],
    flat: 0.93,              // how bright a flat-lit dab is (x its paint colour)
    pop: 0.16,               // s: a dab pops from 0 to full size with a small overshoot
    complement: 0.22,        // max share of complementary dots in the deepest shadow
  },
  brush: {
    tipLen: 0.05, belly: 0.0105, tipR: 0.0035, ferruleR: 0.0115, ferruleLen: 0.045, handleR: 0.0085, handleLen: 0.34,
    load: 0.42,              // fraction of the bristles carrying paint
    squash: 0.28,            // bristle squash at full press
    hop: 0.03,               // m the tip lifts between dabs
  },
  defocus: { taps: 18, sigmaMax: 19 },   // display-space gaussian (px at 1080p; ~1.4 dot spacings in the full view)

  // ---- overlay caption plate (bottom centre: clear of the top-left badge box) ---------------------------------
  caption: {
    w: 960, h: 104, x: 480, y: 918, radius: 52, cap: 58,
    font: '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif', weight: 700,
    plate: "#1d2147", edge: "#ffd23a", text: "#fffaf0",
    icon: ["#ff8a1c", "#2b47d6", "#ffe03a", "#1a9ff0", "#ff5fa2"],
  },

  sound: {
    dab: { gain: 0.7 },
    patter: { gain: 0.1, bin: 0.025 },
    region: { gain: 0.4, notes: [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66] },
    bed: { gain: 0.36, root: 130.81, brightness: 700 },
    open: { gain: 0.45, root: 261.63, brightness: 2600 },
    push: { gain: 0.3 },
  },
  sfx: { enter: "pop", exit: "whooshOut", move: "whoosh", land: "tick", emphasis: "marimba", ui: "tick", bed: "pad" },
  motion: [
    "A dab pops from nothing to full size with a small overshoot when a brush touches or when its region's flood front reaches it; it never moves again.",
    "Regions fill one after another as ragged fronts spreading from an origin (water from the first dabs, the sky from the horizon, the tree up its trunk).",
    "Brushes dab on their own: descend along their axis, squash, lift, hop to the next spot.",
    "The squint is a display-space gaussian blur whose radius is a function of t; the dots melt into the colours the eye mixes and sharpen again.",
  ],
};
