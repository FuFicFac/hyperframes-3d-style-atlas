// styles/ship-in-bottle/spec.js — STYLE_SPEC for "Ship in a Bottle". Plain data only: JSON-serializable, no THREE,
// no window. Importable from Node (export-spec.mjs, scene.config.js for the rigging plan + score) and the browser.
// Units: metres at toy scale (the bottle is 5.15 m long so a thread still reads at 1080p), Y-up, sRGB hex, radians.
//
// The look: a bright modeller's bench in daylight. A large clear bottle lies on a wooden cradle, neck to the right.
// A small wooden ship with paper fan sails is built OUTSIDE with its masts hinged flat, slid through the neck on a
// wire, set on a blue putty sea, and raised by pulling ONE thread. rigging.js plans every hinge angle, every thread
// point, the insertion path, the clearance proof and every sound.

export const STYLE_SPEC = {
  id: "ship-in-bottle",
  name: "Ship in a Bottle",
  description:
    "A bright modeller's bench in daylight: a large clear glass bottle lies on a wooden cradle, and a small wooden sailing ship (walnut hull with a red boot and a cream strake, three masts, pleated paper fan sails, thread rigging) is built outside the bottle with its masts hinged flat against the deck. The long thin bundle slides through the narrow neck on a wire, settles onto a blue putty sea, and one thread running out of the neck is pulled: the masts swing upright fore to aft, the sails fan open and the rigging draws taut. A cork goes in. One plan (rigging.js) turns thread length pulled into every hinge angle in closed form, places every thread point (taut or sagging by its slack), carries the insertion path, proves in Node that the folded bundle clears the neck and the raised ship clears the glass, and writes the score.",
  palette: {
    bg: "#e9eef0",
    wall: "#eef2f3",
    bench: "#ead9b8",
    mat: "#c4dcc8",
    matLine: "#e4f0e4",
    glass: "#dcefe9",
    cork: "#c79a62",
    sea: "#2f86d0",
    seaDeep: "#1f66b0",
    foam: "#e8f4ff",
    hullRed: "#c2442e",
    hullWood: "#7b4a2a",
    hullCream: "#f5e8c8",
    deck: "#dcb97c",
    mast: "#b98a52",
    sail: "#fbf4e2",
    sailStripe: "#d9482f",
    thread: "#f2ead8",
    knot: "#d9482f",
    brass: "#d7ab55",
    steel: "#aab2bc",
    cradle: "#b88752",
    ink: "#22303c",
    plate: "#fbf7ec",
    primary: "#2f86d0",
    secondary: "#c2442e",
    accent: "#d7ab55",
  },
  world: {
    background: "#e9eef0",
    fog: { color: "#e9eef0", near: 22, far: 48 },
    environment: "room",
    environmentIntensity: 0.6,
    toneMapping: "neutral",      // keeps the cream paper, the pale bench and the putty blue as designed
    exposure: 1.02,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#ffffff", roughness: 0.7, metalness: 0 },            // wood map added in style.js
    mat: { type: "standard", baseColor: "#ffffff", roughness: 0.85, metalness: 0 },             // cutting mat, grid map in style.js
    wall: { type: "standard", baseColor: "#eef2f3", roughness: 1, metalness: 0 },
    cradle: { type: "standard", baseColor: "#b88752", roughness: 0.6, metalness: 0 },
    plank: { type: "standard", baseColor: "#d8b47e", roughness: 0.62, metalness: 0 },
    hull: { type: "standard", baseColor: "#ffffff", roughness: 0.55, metalness: 0, vertexColors: true, side: "double" },
    mast: { type: "standard", baseColor: "#b98a52", roughness: 0.55, metalness: 0 },
    sail: { type: "standard", baseColor: "#ffffff", roughness: 0.9, metalness: 0, flatShading: true, side: "double" },   // map in style.js
    flag: { type: "standard", baseColor: "#d9482f", roughness: 0.8, metalness: 0, side: "double" },
    thread: { type: "standard", baseColor: "#f2ead8", roughness: 0.9, metalness: 0 },
    knot: { type: "standard", baseColor: "#d9482f", roughness: 0.7, metalness: 0 },
    brass: { type: "physical", baseColor: "#d7ab55", roughness: 0.25, metalness: 1 },
    steel: { type: "physical", baseColor: "#aab2bc", roughness: 0.25, metalness: 1 },
    sea: { type: "standard", baseColor: "#ffffff", roughness: 0.42, metalness: 0, vertexColors: true, side: "double" },
    cork: { type: "standard", baseColor: "#ffffff", roughness: 0.9, metalness: 0 },             // speckle map in style.js
    spool: { type: "standard", baseColor: "#e9dcc0", roughness: 0.6, metalness: 0 },
    pencil: { type: "standard", baseColor: "#f0b429", roughness: 0.5, metalness: 0 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#fbfdff", groundColor: "#e8dcc4", intensity: 1.05 },
    {
      // daylight from a window on the left, in front: short soft shadows fall right and back
      id: "sun", type: "directional", color: "#fff4e2", intensity: 2.3, position: [-4.5, 8.5, 6.0], target: [1.2, 0.6, 0],
      shadow: { softness: 3, mapSize: 4096, extent: 6.2, near: 1, far: 30, bias: -0.0004, normalBias: 0.015 },
    },
    { id: "fill", type: "directional", color: "#e8f1ff", intensity: 0.5, position: [5, 3, 5], target: [0, 1, 0] },
  ],
  post: {
    bloom: { strength: 0.12, radius: 0.4, threshold: 2.7 },   // only the brightest glass glints
    vignette: { darkness: 0.18, offset: 1.15 },
  },
  camera: { fov: 30, near: 0.3, far: 70, drift: { amp: 0, speed: 0.2 } },   // locked during holds
  text: { font: "sans", weight: 700, color: "#22303c", height: 0.3 },

  // ---- the bottle (lies on its side: axis = X, base at the left, mouth at the right) ---------------------------
  bottle: {
    axisY: 1.12, baseX: -2.3, bodyR: 1.0, heel: 0.16,
    shoulderX: [1.3, 1.95], neckR: 0.37, mouthX: 2.85, wall: 0.05,
    lip: { len: 0.17, extra: 0.055 },
    radial: 96,
  },
  glass: {
    color: "#a9d4cd", alphaFace: 0.03, alphaRim: 0.72, fresnelPower: 2.8, rimStrength: 0.12, envIntensity: 0.22, roughness: 0.02, clearcoat: 0,
    thick: { alphaFace: 0.16, alphaRim: 0.8 },                     // base and lip read thicker
    streaks: [                                                     // painted soft highlights: [angle from +Z toward +Y (rad), width (rad), opacity]
      { at: 1.02, width: 0.1, opacity: 0.5 },
      { at: 1.2, width: 0.035, opacity: 0.4 },
      { at: -0.95, width: 0.08, opacity: 0.2 },
    ],
  },
  cradle: { saddles: [-1.5, 0.55], halfWidth: 0.95, top: 0.7, thick: 0.18, rail: 0.05 },
  sea: { level: -0.56, x: [-2.24, 1.46], fall: [1.02, 1.46], drop: 0.36, wave: 0.03, press: 0.015, nx: 96, nz: 22, nb: 14 },

  // ---- the ship (local frame: origin = middle of the flat bottom, +X bow, +Y up, +Z starboard) -----------------
  ship: {
    hull: { stern: -1.1, bow: 1.1, beam: 0.2, sternBeam: 0.15, maxAt: -0.1, bottom: 0.6, deck: 0.15, sheer: 0.05, rail: 0.035, stations: 44 },
    bowsprit: { from: [0.9, 0.2], tip: [1.5, 0.31], r: 0.016 },
    // pull order = array order: fore first (it lies on top of the folded stack), mizzen last. Angles from vertical toward the stern.
    masts: [
      { id: "fore", x: 0.55, len: 1.1, fold: 1.379, up: 0.035, eyelet: "bowsprit" },
      { id: "main", x: 0.0, len: 1.28, fold: 1.466, up: 0.035, eyelet: [0.43, 0.06, 0.028] },      // [x, height above the deck, z]
      { id: "mizzen", x: -0.55, len: 0.92, fold: 1.536, up: 0.035, eyelet: [-0.12, 0.06, -0.028] },
    ],
    mast: { r: 0.022, rTop: 0.013, hinge: 0.025 },
    sail: { lo: 0.25, hi: 0.93, foot: 0.62, head: 0.46, pleats: 10, closed: 0.17, open: 0.965, off: 0.036, billow: 0.05, openFrom: 0.3, brace: -0.75 },   // widths are per metre of mast
    shroud: { at: 0.8, aft: 0.15 },
    thread: { r: 0.0065, tail: 2.4, knot: 0.12, marks: [0.3, 0.6], n: 14 },
    wire: { hook: [0.78, 0.05, 0.07], len: 6.5, r: 0.011 },
    flag: 0.17,
  },
  // ---- the route: built outside on a slip at neck height, slid in along the axis, lowered onto the sea ---------
  route: { xOut: 4.5, xIn: -0.55, margin: 0.03 },
  slip: { x: [3.02, 6.7], halfWidth: 0.34, thick: 0.07 },
  cork: { len: 0.56, r: [0.325, 0.39], seat: 0.3, from: 5.4 },
  // ---- when things happen (rigging.js turns these into pull(t), pose(t), events) ------------------------------
  timing: {
    fold: [[0.5, 1.3], [1.4, 2.2], [2.3, 3.1]],        // mizzen, main, fore fold down (the thread is let out)
    wireIn: [2.5, 3.4],
    slide: [3.5, 6.3],
    lower: [6.3, 7.15],
    wireOut: [7.2, 7.9],
    pull: [[8.1, 9.1], [9.25, 10.25], [10.4, 11.4]],   // fore, main, mizzen rise
    cut: 11.6, tailOut: [11.6, 12.3],
    cork: [11.9, 12.6],
  },

  wood: { size: 40, tile: 8, boards: 5, seed: 82, dark: "#dcc59c", mid: "#ecdcba", light: "#f6ecd4", seam: "#cdb389", contrast: 0.3, grainFreq: 16 },
  mat: { w: 13, d: 6.4, x: 1.6, z: 0.3, cell: 0.4 },

  // ---- overlay caption (top centre) ----------------------------------------------------------------------------
  caption: {
    x: 960, y: 44, h: 112, cap: 62, maxW: 1200,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#fbf7ec", edge: "#2f86d0", ink: "#22303c", icon: "#2f86d0",
  },

  sound: {
    tap: { gain: 0.5, hz: 330 },
    rustle: { gain: 0.22 },
    slide: { gain: 0.16 },
    clink: { gain: 0.3, hz: 2093 },
    land: { gain: 0.3 },
    wire: { gain: 0.12 },
    creak: { gain: 0.14, hz: 300 },
    lock: { gain: 0.42, hz: [523.25, 659.25, 783.99] },     // one soft tick + bar note per mast, rising
    snip: { gain: 0.3 },
    cork: { gain: 0.6 },
    done: { gain: 0.22 },
    pad: { gain: 0.24, root: 130.81, chord: [0, 7, 16], brightness: 900 },
  },
  sfx: { enter: "tick", exit: "whooshOut", move: "whoosh", land: "pop", emphasis: "marimba", ui: "tick", bed: "pad" },
  motion: [
    "One number drives the rigging: thread length pulled. Each mast is a hinge whose angle is a closed form of it (law of cosines on its stay).",
    "Masts rise fore to aft because each stay has exactly the slack of the masts before it; folding is the same plan run backwards.",
    "Threads are straight when taut and sag by their slack when not; sails are pleated paper that fans open as the mast comes up.",
    "The folded bundle slides along the bottle's axis, then is lowered onto the putty sea; the plan proves the clearance at every step.",
    "Camera: one move per beat, locked during holds; the bottle fills the frame once the ship is inside.",
  ],
};
