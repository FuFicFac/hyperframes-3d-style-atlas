// styles/lichtenberg/spec.js — STYLE_SPEC for "Lichtenberg" (fractal wood burning). Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the burn plan + score) and the browser.
// Units: metres. The board is a big 1.6 m x 0.94 m pale maple slab so the thinnest twig (3 mm) still reads at 1080p.
//
// The look: a pale maple board on a dark slate workbench mat, two copper electrodes clamped to it (red lead = question,
// blue lead = answer). A high-voltage discharge burns a branching fractal tree into the wood: a white-blue arc at
// every burning tip, a glowing orange ember just behind it, then a near-black charred groove with a soft brown scorch
// halo. burnplan.js plans the whole tree (shape, widths, burn times) once; the board shader draws any time t from one
// baked distance/time field, so a frame costs one textured quad.

export const STYLE_SPEC = {
  id: "lichtenberg",
  name: "Lichtenberg",
  description:
    "Fractal wood burning: a pale maple board on a dark slate workbench mat with two copper electrodes clamped to it. A high-voltage discharge burns a branching Lichtenberg figure into the wood between them. The whole tree is planned once, seeded (space colonisation from the first electrode, half-width from downstream length, a burn time per node, dead ends everywhere and exactly one path that reaches the second electrode) and baked into a distance + burn-time field; at time t each groove is drawn up to its burn front: white-blue arc at the tip, glowing orange ember just behind, near-black char with a soft brown scorch halo after. When the one path connects, a return stroke flashes back along it, the channel widens and stays glowing. Smoke wisps, flickering tip glints, the crackle, the hum and the connection crack all come from the same plan.",
  palette: {
    bg: "#232a31",
    bench: "#2b343d",
    benchLine: "#3d4a56",
    wood: "#ecd9b4",
    woodMid: "#e2c99c",
    woodDark: "#cfae7c",
    woodEdge: "#b98f5c",
    char: "#17100c",
    scorch: "#8a5326",
    ember: "#ffa62e",
    emberCool: "#e2380c",
    arc: "#9fd0ff",
    flash: "#6fb4ff",
    winHot: "#ff7a10",
    winMid: "#ffe2a0",
    copper: "#c8763c",
    steel: "#aeb4bb",
    question: "#d8402c",
    answer: "#2f7fd6",
    ink: "#3a2616",
    smoke: "#8e8a86",
    chip: "#1a1310",
    chipText: "#f6ead2",
  },
  world: {
    background: "#232a31",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.3,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#ffffff", roughness: 0.9, metalness: 0, map: { source: "grid", size: 512, cells: 4, line: 3, bg: "#2b343d", fg: "#3d4a56", description: "dark slate cutting mat with a faint 5 cm grid" } },
    wood: { type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0 },        // the top gets its map + burn shader in style.js
    woodEdge: { type: "standard", baseColor: "#c9a26c", roughness: 0.7, metalness: 0 },
    copper: { type: "standard", baseColor: "#c8763c", roughness: 0.5, metalness: 1 },
    steel: { type: "standard", baseColor: "#aeb4bb", roughness: 0.55, metalness: 1 },
    clamp: { type: "standard", baseColor: "#23262b", roughness: 0.55, metalness: 0.2 },
    leadQ: { type: "standard", baseColor: "#d8402c", roughness: 0.5, metalness: 0 },
    leadA: { type: "standard", baseColor: "#2f7fd6", roughness: 0.5, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fff6ea", groundColor: "#8a8478", intensity: 1.0 },
    {
      // soft high key from the far left: short soft shadows from the electrodes toward the viewer's right
      id: "key", type: "directional", color: "#fff1dc", intensity: 2.3, position: [-1.4, 3.2, -1.2], target: [0, 0, 0],
      shadow: { softness: 2.5, mapSize: 2048, extent: 1.3, near: 0.5, far: 12, bias: -0.0003, normalBias: 0.004 },
    },
  ],
  post: {
    bloom: { strength: 0.55, radius: 0.45, threshold: 1.25 },
    vignette: { darkness: 0.28, offset: 1.15 },
  },
  camera: { fov: 30, near: 0.05, far: 30, drift: { amp: 0, speed: 0.2 } },   // no drift: still holds keep the file small
  text: { font: "sans", weight: 800, color: "#3a2616", height: 0.042 },

  // ---- the board and the two electrodes (board coordinates: metres, x right, y toward the viewer) ------------
  board: { w: 1.6, h: 0.938, thickness: 0.04, y: 0.04, pxPerMetre: 1000, woodPx: [1280, 750], seed: 88 },
  bench: { size: 9, gridMetres: 0.2 },
  electrodes: {
    q: [0.118, 0.469], a: [1.482, 0.469],
    r: 0.03, h: 0.014, bolt: 0.013, lead: 0.011,
    tag: { cap: 0.03, dy: 0.088, q: "QUESTION", a: "ANSWER", opacity: 0.88 },
  },
  // where the tree may not go: the caption chip (top-left, in the wide shot) and the two stamped tags
  keepOut: [
    { id: "caption", x0: 0, y0: 0, x1: 0.8, y1: 0.128 },
    { id: "tagQ", x0: 0, y0: 0.525, x1: 0.31, y1: 0.6 },
    { id: "tagA", x0: 1.33, y0: 0.525, x1: 1.6, y1: 0.6 },
  ],

  // ---- the tree (burnplan.js growTree) ---------------------------------------------------------------------
  grow: {
    spacing: 0.047,          // attractor grid pitch: sets twig density
    step: 0.016,             // node spacing along a branch
    influence: 0.115,        // an attractor pulls its nearest node when closer than this
    kill: 0.03,              // ...and is used up when a node comes this close
    influenceAnswer: 0.17, killAnswer: 0.05, answerPull: 2.2, answerClear: 0.085, answerStop: 0.012,
    rootClear: 0.03,
    wiggle: 0.42,            // rad sd of the per-step direction jitter (the jagged, crackled line)
    minGap: 0.5,             // x step: new nodes keep this far from every other node
    margin: 0.03,
    maxIter: 500,
    spur: { p: 0.3, steps: [1, 3], len: [0.5, 0.95], angle: [0.7, 1.5], gap: 0.42 },
  },
  width: { min: 0.0018, max: 0.0084, power: 0.5, win: 0.0105 },   // half-widths (m)
  // ---- burn timing defaults (a scene overrides start / connect / die from its beats) -------------------------
  times: {
    start: 0.45, connect: 10.0, leap: 0.16, leapLen: 0.07, sweep: 0.26,
    die: 9.2, dieSpread: 2.4, bigArm: 0.7,     // arms shorter than bigArm die earlier in proportion
    speed: [0.8, 1.2], delay: [0.02, 0.22], slow: 1.35, minLife: 0.3,
    pruneLate: 0.9,                            // side branches that would fork this close (s) to `die` or later are not grown: the last stretch belongs to the winner
  },

  // ---- how a burnt texel looks (board shader uniforms; distances mm, times s, emissive in linear HDR) --------
  burn: {
    halo: { base: 0.004, k: 1.9, fall: 0.42, amount: 0.8, time: 1.3 },   // scorch halo radius = base + k x half-width
    char: { grain: 0.35 },
    ember: { tau: 0.45, widthTau: 0.035, gain: 3.6, spill: 0.3 },        // glow just behind the front; thick grooves stay hot longer
    arc: { tau: 0.075, gain: 16, spill: 0.16 },                           // the white-blue front itself
    win: { glow: 0.014, inner: 5.4, flashTau: 0.5, flashGain: 10, hotGain: 1.7, sustain: 0.6, cool: 3.0 },
  },
  glints: { max: 220, size: 0.024, sizeW: 3.5, gain: 7, flicker: 0.6, electrode: 0.13, pre: 0.08 },   // additive tip flares
  smoke: {
    life: [1.5, 2.3], size: [0.045, 0.075], rise: 0.13, drift: [0.035, -0.02], grow: 2.6, alpha: 0.24,
    dieGap: 0.16, trailGap: 0.11, lag: 0.4, minWidth: 0.0022, winEvery: 3, max: 96,
  },
  flash: { dim: 0.5, rise: 0.05, hold: 0.25, fall: 1.3, bloom: 0.12, shake: 0.004, shakeDur: 0.45 },   // key light dips while the flash is up
  crackle: { bin: 0.07, popShare: 0.16, fizzGap: 0.22, sizzleEvery: 1.6, sizzleFull: 40 },

  // ---- overlay caption chip (top-left) ------------------------------------------------------------------------
  caption: {
    x: 40, y: 34, h: 92, cap: 40, maxW: 860,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#1a1310", edge: "#5a3a20", ink: "#f6ead2", icon: "#ff9a3c",
  },

  sound: {
    strike: { clack: 0.5 },
    hum: { hz: 100, flicker: 0.55, gain: 0.2, low: 0.16 },
    crackle: { gain: 0.3, pop: 0.22 },
    fizz: { gain: 0.1 },
    sizzle: { gain: 0.3 },
    connect: { riser: 0.3, riserDur: 1.3, thud: 0.95, clack: 0.7, zap: 0.6, whoosh: 0.45 },
    glow: { chime: 0.22, root: 110, chord: [0, 7, 12, 16], brightness: 900, gain: 0.42 },
    room: { root: 55, chord: [0, 7], brightness: 500, gain: 0.3 },
  },
  sfx: { enter: "tick", exit: "whooshOut", move: "rustle", land: "thud", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Nothing is simulated per frame: the tree, its widths and every node's burn time are planned once; a groove at time t is drawn up to (t - ta) / (tb - ta).",
    "Three ages of a burn: white-blue arc at the front (under 0.1 s), orange ember cooling to dark red behind it (about half a second, longer on thick trunks), then black char with a brown scorch halo that keeps spreading for a second.",
    "Side branches slow down as they die; the winning path keeps a steady crawl, then leaps the last gap.",
    "The connection: a return stroke runs back along the winning path in a quarter second, the room light dips, the channel widens and stays glowing.",
    "Camera: one rise from a low three-quarter view to near top-down while the tree spreads, then locked; a few millimetres of shake on the connection.",
  ],
};
