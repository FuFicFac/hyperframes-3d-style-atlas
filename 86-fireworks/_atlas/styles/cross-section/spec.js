// styles/cross-section/spec.js — STYLE_SPEC for "Cross-Section": a clean technical-illustration cutaway. A slicing plane
// sweeps through a solid object; everything on the near side of the plane is removed and every solid shows a flat,
// outlined, coloured CUT FACE exactly where the plane meets it. Nothing moves apart: the cut does the revealing.
// Plain data only (JSON-serializable, no THREE, no window). Units: metres, Y-up, sRGB hex, radians.
// The planner (slice.js) reads `model`; style.js reads the rest. Everything is UNLIT (flat tones + ink), so palette
// colours reach the screen exactly: tone mapping "none", no lights, no post stack.

export const STYLE_SPEC = {
  id: "cross-section",
  name: "Cross-Section",
  description:
    "Technical-illustration cutaway: a slicing plane sweeps through a solid object and removes the near side; every part shows a flat coloured cut face with a crisp ink outline (hatched for the outer shell), on pale drafting paper.",
  palette: {
    bg: "#e9edf2",        // drafting paper
    grid: "#c3ccd9",      // paper grid
    ink: "#12151c",       // outlines, caption chip
    shell: "#0b0c10",     // the opaque outer shell
    shellHi: "#565c6b",   // its highlight (rounded edges, top)
    cut: "#ff6a1f",       // the shell's cut face: section orange
    hatch: "#c9480a",     // 45° section hatching on it
    cavity: "#27314a",    // inside walls of the shell
    token: "#19c3ff",
    tokenAlt: "#6fe0ff",
    layers: ["#7b5cff", "#2f80ff", "#00b8a9", "#7ed321", "#ffc21a"],
    wire: "#f3f5f9",
    answer: "#ff3d8b",
    core: "#fff3b0",
    rail: "#b4bdcb",
    sheet: "#ff6a1f",     // the slicing plane's frame
    glass: "#bfe6ff",     // its faint fill
    primary: "#ff6a1f",
    secondary: "#19c3ff",
    accent: "#ff3d8b",
  },
  world: { background: "#e9edf2", fog: null, environment: null, toneMapping: "none", exposure: 1.0 },
  materials: {},            // none: every surface is one of the style's unlit shaders
  lights: [],
  post: {},
  camera: { fov: 30, near: 0.5, far: 120, drift: { amp: 0, speed: 0 } },
  text: { font: "sans", weight: 700, color: "#12151c", height: 0.4 },
  sfx: { enter: "pop", exit: "whooshOut", move: "servo", land: "clack", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "The slicing plane is the only actor: its offset and tilt are a pure function of t (planeAt(keys, t)).",
    "Parts never move apart; each one is clipped at the plane and gets a flat outlined cut face there.",
    "A band of light (the signal) runs through the revealed parts along x; non-focus parts ease to their own grey mid-tone.",
    "Camera: one arc while the cut happens, locked while the plane creeps, one small arc at the end.",
  ],

  // ---------------------------------------------------------------- look
  shade: { top: 1.0, front: 0.86, side: 0.68, bottom: 0.5, topLift: 0.14, fadeDist: 2.4, fadeMin: 0.62 }, // flat tones per face normal; parts darken behind the plane
  ink: { width: 0.011, level: 0.92, minPx: 1.15 },         // outline half-width (m), never thinner than minPx pixels
  capInk: { width: 0.013, minPx: 1.3 },                    // outline of the cut faces
  hatch: { freq: 5.5, duty: 0.2 },                         // stripes per metre across the 45° direction, ink fraction
  shellLook: { gloss: 46, spec: 0.85, top: 0.3, fresnel: 0.55, light: [-0.35, 0.8, 0.5] },
  sheet: { margin: 0.2, frame: 0.03, fill: 0.05, frameLevel: 0.95, tick: 0.3 },
  ground: { cell: 0.5, major: 4, line: 0.008, minor: 0.5, majorLevel: 0.85, fadeNear: 9, fadeFar: 22, shadow: 0.3, shadowSoft: 0.9, shadowOffset: [0.28, -0.3] },
  focus: { dim: 0.45 },
  pulse: { width: 0.34, amp: 0.62 },
  caption: {
    font: "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif", weight: 700, cap: 56, h: 100, y: -0.79,
    plate: "#12151c", ink: "#ffffff", dot: "#ff6a1f", xMax: 0.5,
    leader: { width: 0.0036, halo: 0.0085, dot: 0.011, color: "#ffffff", halo2: "#12151c" },
  },

  // ---------------------------------------------------------------- the reference model: a "black box" AI model
  // x = the direction of flow (tokens in on the left, answer out on the right). Read by slice.js blackBoxModel().
  model: {
    size: [6.4, 3.4, 3.4], wall: 0.26, round: 0.16, innerRound: 0.05,
    tokens: { cols: 2, rows: 3, deep: 3, size: 0.3, x0: -2.68, dx: 0.42, dy: 0.78, dz: 0.34 },
    layers: { n: 5, x0: -1.65, pitch: 0.8, thick: 0.42, h: 2.4, d: 2.4, neurons: 4, neuronR: 0.15, neuronDy: 0.58, neuronZ: 0.95 },
    wires: { r: 0.05, perGap: 5, z: 0.9, seed: 87, sink: 0.05 },
    answer: { x: 2.42, half: [0.36, 0.55, 0.55], coreR: 0.2 },
    rails: { len: 1.5, tokens: 3, rate: 0.42, y: 1.7, zIn: 0, zOut: 1.0, out: 1.1, size: 0.3, answerSize: 0.46 },
  },

  sound: {
    pad: { gain: 0.34, root: 98, brightness: 950 },
    hum: { gain: 0.1, hz: 49 },
    approach: { gain: 0.16 },
    slice: { gain: 0.3 },
    contact: { gain: 0.5 },
    cutTick: { gain: 0.1 },
    reveal: { gain: 0.34 },
    flow: { muffled: 0.07, open: 0.2 },
    answer: { muffled: 0.12, open: 0.3 },
    end: { gain: 0.34 },
  },
};
