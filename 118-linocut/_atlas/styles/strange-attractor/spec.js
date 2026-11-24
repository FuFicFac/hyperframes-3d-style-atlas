// styles/strange-attractor/spec.js — STYLE_SPEC for "Strange Attractor" (the Lorenz butterfly drawn as thick glossy
// tubes, a wire sculpture in a bright studio). Plain data only: JSON-serializable, no THREE, no window. Importable from
// Node (export-spec.mjs, scene.config.js for the plan + score) and the browser. Units: metres.
//
// World mapping: a Lorenz point (x, y, z) sits at world ((x) s, (z + lift) s, (-y) s) with s = world.scale, so the
// butterfly's wings are left/right, its height is up and the floor is y = 0. The numbers that define the simulation
// (time map, twin search, cloud) live in `sim`; scene.config.js passes them to lorenz.createPlan.

export const STYLE_SPEC = {
  id: "strange-attractor",
  name: "Strange Attractor",
  description:
    "The Lorenz butterfly as a glossy wire sculpture in a bright studio: each path is a thick lacquered tube (coral, teal) with a glowing bead at its head, drawn as the last few seconds of the path, over a pale floor that catches its soft shadow. Paths are integrated once at load (lorenz.js, fixed-step RK4) and read back by time; two starts a hair apart run as one twisted two-colour strand until they part at a fork, and a speck of 200 beads bursts across both wings. A small unlabelled dial shows the gap between the two beads.",
  palette: {
    bg: "#f1ece4",
    bgTop: "#f7f3ed",
    floor: "#ebe5dc",
    ink: "#222833",
    coral: "#f15a45",
    coralDeep: "#c43a2a",
    teal: "#0f9e95",
    tealDeep: "#0a6f69",
    gold: "#f0a92c",
    plum: "#7d5ba6",
    plate: "#232a36",
    plateEdge: "#f0a92c",
    plateText: "#fbf7f0",
    dial: "#fbf8f3",
    dialEdge: "#232a36",
    dialTrack: "#e2dbd0",
  },
  world: {
    background: "#f1ece4",
    sky: null,
    fog: null,
    environment: null, // a procedural studio env (studio below) gives the reflections
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
    scale: 0.1,       // metres per Lorenz unit (the butterfly is ~3.4 m wide, ~3.6 m tall)
    lift: 1.5,        // Lorenz units added to z: the lowest dive (z ~ 2) floats a hand above the floor
  },
  materials: {
    floor: { type: "standard", baseColor: "#ebe5dc", roughness: 0.9, metalness: 0 },
    coral: { type: "physical", baseColor: "#f15a45", roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 },
    teal: { type: "physical", baseColor: "#0f9e95", roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 },
    beadCoral: { type: "physical", baseColor: "#ff5a3c", roughness: 0.2, metalness: 0, clearcoat: 1, emission: { color: "#ff4a2a", strength: 1.3 } },
    beadTeal: { type: "physical", baseColor: "#12c2b4", roughness: 0.2, metalness: 0, clearcoat: 1, emission: { color: "#00b3a4", strength: 1.3 } },
    cloud: { type: "physical", baseColor: "#ffffff", roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fffaf4", groundColor: "#e6ddd0", intensity: 1.1 },
    {
      // soft key from the upper front-left: the sculpture throws a soft shadow back and down onto the floor
      id: "key", type: "directional", color: "#fff6ec", intensity: 2.0, position: [-2.5, 12, 3.5], target: [0, 1.8, 0],
      shadow: { softness: 6, mapSize: 2048, extent: 3.4, near: 2, far: 22, bias: -0.0004, normalBias: 0.02 },
    },
  ],
  // procedural studio environment (kit studio.js): pale room, a big top softbox and two tall strips for long glossy
  // highlights along the tubes
  studio: {
    size: 256,
    sigma: 0.01,
    room: { w: 26, h: 14, d: 26, color: "#9a948b" },
    panels: [
      { id: "top", kind: "softbox", size: [8, 4], pos: [0, 6.5, 1], intensity: 2.2, color: "#fffaf2", soft: 0.25 },
      { id: "keyStrip", kind: "strip", size: [0.9, 7], pos: [-7, 3, 5], intensity: 3.2, color: "#fff4e8", soft: 0.3 },
      { id: "rimStrip", kind: "strip", size: [0.7, 7], pos: [7, 3, -5], intensity: 2.6, color: "#eef4ff", soft: 0.3 },
      { id: "front", kind: "card", size: [14, 5], pos: [0, 1.5, 12], intensity: 0.9, gradient: [[0, "#6d6a66"], [1, "#ffffff"]] },
      { id: "floorBounce", kind: "card", size: [18, 18], pos: [0, -6.5, 0], intensity: 0.7, gradient: [[0, "#ffffff"], [1, "#8a847c"]], radial: true },
    ],
    sweep: { size: [1, 1], radius: 9, from: 0.1, to: 2.7, intensity: 0, color: "#ffffff", soft: 0.3 },
    quantum: 0.0015,
  },
  backdrop: { width: 60, depth: 40, height: 22, radius: 8, z: -9 },
  tube: {
    radius: 0.045,        // m (0.45 Lorenz units)
    radial: 14,
    every: 2,             // display sample every N integration steps
    taper: 0.16,          // tau over which the tail thins to a point (and the start grows from one)
    strandOffset: 1.0,    // centre offset of each tube in the strand, in tube radii (1 = touching)
    twist: 9,             // Lorenz units of arc per full twist of the strand
    open: [0.35, 1.6],    // cross-track distance (Lorenz units) over which the strand opens to the true paths
    ramp: 0.3,            // tau over which the twin emerges from inside the coral tube
    trail: [[0, 5], [11.5, 5], [13.2, 6.5], [15, 7]], // [t, trail length in tau] (piecewise linear)
  },
  bead: { radius: 0.12 },
  cloud: {
    bead: 0.042,          // m
    tail: 0.32,           // tau
    tailWidth: 5.0,       // px at the head
    pop: 0.35,            // s for the speck to appear
    colors: ["#f15a45", "#f0a92c", "#0f9e95", "#7d5ba6"],
  },
  // the simulation (lorenz.createPlan): video-time rate knots, the twin search and the cloud
  sim: {
    h: 0.002,
    knots: [[0, 0.5], [2.8, 0.55], [6, 0.65], [9.5, 0.65], [9.7, 0.3], [10.3, 0.3], [10.75, 0.75], [12, 0.8], [13.2, 2.0], [15, 2.0]],
    start: [1, 1, 20],
    preroll: [68, 72, 0.05],
    dir: [1, 1, 1],
    split: {
      tol: 0.2, sep: 1.0, forkTau: 0.5, forkX: 4, minSwitches: 1, minTogether: 2,
      agreeLead: 0.5, agreeMax: 0.35, crossWin: 0.2, rejoinMin: 1.2, rejoinAfter: 0.8, delta: [1e-6, 0.05], ratio: 1.03,
    },
    cloud: { count: 200, radius: 1.5, lead: 0.2, seed: 121, h: 0.004 },
  },
  gauge: { x: 1596, y: 904, w: 236, h: 112, max: 30, power: 0.5 },
  caption: {
    x: 470, y: 904, w: 980, h: 112, radius: 22, cap: 50, weight: 800,
    font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    plate: "#232a36", edge: "#f0a92c", text: "#fbf7f0",
  },
  post: {
    bloom: { strength: 0.55, radius: 0.45, threshold: 1.6 },
    vignette: { darkness: 0.18, offset: 1.15 },
  },
  camera: { fov: 30, near: 0.3, far: 120, drift: { amp: 0, speed: 0.3 } },
  text: { font: "sans", weight: 800, color: "#222833", height: 0.4 },
  sound: {
    bed: { gain: 0.22, root: 98, brightness: 700 },
    voice: { hz: 196, step: 0.25, zMid: 25, semiPerUnit: 0.45, scale: [0, 2, 4, 7, 9], gain: 0.34, decay: 1.4, bright: 0.45, detune: 1.2, detuneRef: 30 },
    cloud: { voices: 16, step: 0.34, gain: 0.07 },
    swell: { gain: 0.16, root: 196, brightness: 1400 },
    fork: { gain: 0.3 },
  },
  sfx: { enter: "pop", exit: "whooshOut", move: "whoosh", land: "pluck", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Every path is integrated once at load (fixed-step RK4) and read back by t: the tube is the last few tau of the path up to now.",
    "Two starts a hair apart share one twisted two-colour strand while the twin stays on the coral's path; it opens for good at the fork.",
    "The cloud: 200 starts packed into a speck at the fork, released together, spread across both wings.",
    "Camera: one move per beat; the fork shot faces the split so one bead goes left and one right.",
  ],
};
