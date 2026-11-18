// styles/galton-board/spec.js — STYLE_SPEC for "Galton Board" (bean machine). Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the ball plan + score) and the browser.
// Units: metres. The board is toy-scale exaggerated (6.3 m wide, balls 0.14 m) so a single ball reads at 1080p.
// The board stands upright in the XY plane facing +Z; the backboard face is z = 0, the desk top is y = 0.
//
// The look: a glass-fronted maple frame on a bright oak desk, an enamel-blue backboard with a triangle of brass pegs,
// a walnut hopper with a brass spout, polished steel balls. Balls bounce left / right down the pegs and stack in
// bins three abreast, so the histogram grows ball by ball; a red enamel bell curve is drawn on the glass at the end.
// plinko.js plans every ball (choices, closed-form path, bin, stack slot); picture and sound read the same plan.

export const STYLE_SPEC = {
  id: "galton-board",
  name: "Galton Board",
  description:
    "A Galton board (bean machine) on a bright oak desk: a glass-fronted maple frame, an enamel-blue backboard with a triangular field of brass pegs, a walnut hopper with a brass spout and polished steel balls. A seeded, precomputed ball plan (plinko.js) gives every ball its left/right choice at each peg row, a closed-form path (drop, one parabolic hop per row, ballistic fall into its bin, two small bounces) and a stack slot, so the histogram grows ball by ball into a bell curve. Pegs flash and swell when struck; every peg tick, release click and bin landing (one marimba note per bin) is a sound cue from the same plan. A red enamel bell curve is drawn on the glass over the finished stacks.",
  palette: {
    bg: "#f1ebe0",
    wall: "#f3eee4",
    desk: "#dcbb8a",
    deskDark: "#bd9562",
    deskLight: "#edd3a8",
    maple: "#e2bd84",
    mapleDark: "#c0935a",
    mapleLight: "#f1d6a6",
    walnut: "#6f4a2e",
    walnutDark: "#4a2f1c",
    walnutLight: "#8f6240",
    board: "#1f587c",
    brass: "#e0b04e",
    brassHot: "#fff0b0",
    steel: "#d5dade",
    tracer: "#e8442e",
    enamel: "#e8442e",
    divider: "#f2e8d2",
    paper: "#fbf7ee",
    ink: "#22303a",
    chip: "#fbf6ea",
    chipEdge: "#c79a3c",
    chipInk: "#1d2a33",
  },
  world: {
    background: "#f1ebe0",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.85,   // steel and brass need something to reflect
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    desk: { type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0 },      // map: light oak (style.js)
    wall: { type: "standard", baseColor: "#f3eee4", roughness: 0.95, metalness: 0 },
    maple: { type: "standard", baseColor: "#ffffff", roughness: 0.5, metalness: 0 },      // map: maple grain
    walnut: { type: "standard", baseColor: "#ffffff", roughness: 0.55, metalness: 0 },    // map: walnut grain
    board: { type: "standard", baseColor: "#1f587c", roughness: 0.82, metalness: 0 },
    divider: { type: "standard", baseColor: "#f2e8d2", roughness: 0.6, metalness: 0 },
    brass: { type: "physical", baseColor: "#e0b04e", roughness: 0.26, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.3 },
    peg: { type: "standard", baseColor: "#ffffff", roughness: 0.3, metalness: 0.85 },     // instance colour carries brass + flash
    steel: { type: "standard", baseColor: "#ffffff", roughness: 0.14, metalness: 1 },     // instance colour carries steel / tracer
    enamel: { type: "standard", baseColor: "#cf2a17", roughness: 0.4, metalness: 0 },
    paper: { type: "standard", baseColor: "#ffffff", roughness: 0.9, metalness: 0 },
    pencil: { type: "standard", baseColor: "#f2b632", roughness: 0.5, metalness: 0 },
    graphite: { type: "standard", baseColor: "#3a3a3d", roughness: 0.5, metalness: 0.2 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#e6d5b8", intensity: 1.0 },
    {
      // window daylight from upper left-front: peg and ball shadows fall down-right on the blue backboard
      id: "key", type: "directional", color: "#fff3e2", intensity: 3.1, position: [-5.5, 10.5, 9.5], target: [0, 2.6, 0],
      shadow: { softness: 2.5, mapSize: 4096, extent: 5.2, near: 1, far: 40, bias: -0.0005, normalBias: 0.02 },
    },
    { id: "bounce", type: "directional", color: "#eaf2ff", intensity: 0.7, position: [7, 3, 8], target: [0, 2.5, 0] },
  ],
  post: {
    bloom: { strength: 0.25, radius: 0.3, threshold: 2.4 },    // only glints on steel / brass and the struck pegs
    vignette: { darkness: 0.2, offset: 1.2 },
  },
  camera: { fov: 30, near: 0.4, far: 80, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#22303a", height: 0.36 },

  // ---- the board (metres; plinko.js layout() turns this into peg / bin / hopper coordinates) ----------------
  board: {
    rows: 12,            // peg rows; bins = rows + 1
    dx: 0.46,            // peg pitch within a row = bin pitch
    dy: 0.22,            // row pitch
    pegR: 0.035, pegLen: 0.2,
    ballR: 0.07,
    cols: 3,             // balls abreast in a bin
    wall: 0.024,         // bin divider thickness
    binH: 1.36,          // divider height (9 rows of balls + margin)
    gapBin: 0.28,        // last peg row centre above the divider tops
    gapTop: 0.3,         // spout mouth above the apex peg centre
    spoutLen: 0.16, spoutR: 0.1,
    hopperH: 0.52, hopperHalfTop: 1.55, hopperHalfBottom: 0.15,
    frame: 0.18,         // frame rail thickness
    base: 0.2, feet: 0.06,
    depthBack: 0.1, depthFront: 0.3,   // frame from z = -depthBack to +depthFront
    glassZ: 0.235,
    guide: { offset: 0.4, thick: 0.05, from: -0.9, to: 11.3 },   // maple guide rails along the peg triangle (in row units)
  },
  // ---- the ball plan (plinko.js createPlan) ---------------------------------------------------------------
  plan: {
    seed: 279,          // picked from seeds 1-400 for the histogram closest to the binomial (see STYLE.md)
    n: 100,              // balls
    pRight: 0.5,         // chance of bouncing right at a peg (0.5 = fair)
    start: 0.25,         // first release, s
    gap0: 0.65, gapMin: 0.08, gapTau: 2.5,    // release gaps ease from gap0 to gapMin (per ball index)
    drop: 0.22,          // spout -> apex peg, s
    hop: 0.135, hopSlow: 0.2, slowBalls: 3,   // s per row; the first few balls are slower so one ball can be followed
    hopJitter: 0.2,      // +- fraction per hop
    arc: 0.045,          // hop height above the straight line, m (x 0.6..1.5 per hop)
    gFall: 16,           // m/s^2 for the fall into the bin (toy pace)
    bounce: 0.035, bounceDur: 0.13,
    zJitter: 0.03,       // balls sit at slightly different depths between backboard and glass
    glowTau: 0.09,       // s, struck-peg flash decay
    tracers: [0],        // ball ids painted red
  },
  peg: { flash: 2.4, swell: 0.35 },    // struck peg: colour x (1 + flash * g), radius x (1 + swell * g)
  glass: { color: "#eaf4f6", alphaFace: 0.012, alphaRim: 0.4, fresnelPower: 2.4, rim: "#ffffff", rimStrength: 0.12, roughness: 0.06, envIntensity: 0.3 },
  curve: { radius: 0.03, samples: 120, z: 0.262 },
  wood: {
    desk: { boards: 5, seed: 31, grainFreq: 16, contrast: 0.28, repeat: [5, 3], size: 26 },
    maple: { boards: 1, seed: 17, grainFreq: 9, contrast: 0.22 },
    walnut: { boards: 1, seed: 9, grainFreq: 12, contrast: 0.4 },
  },
  desk: { width: 44, depth: 18, wallZ: -2.6 },
  dressing: { notebook: [4.75, 0, 0.7], coins: [-4.3, 0, 0.9] },

  // ---- overlay caption chip (top-left: the peg triangle leaves that corner of the board free) ---------------
  caption: {
    x: 84, y: 70, h: 104, cap: 50, maxW: 900,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#fbf6ea", edge: "#c79a3c", ink: "#1d2a33", mark: "#e8442e",
  },

  sound: {
    bed: { root: 130.81, chord: [0, 7, 12, 16], brightness: 800, gain: 0.5 },
    release: { gain: 0.12, pitch: 0.7 },
    peg: { gain: 0.11, pitch: 1.9, spread: 0.5 },                 // tick per peg hit; pitch falls a little per row
    land: { root: 392, scale: [0, 2, 4, 7, 9], gain: 0.16, decay: 0.06, dur: 0.3, click: 0.14 },   // one note per bin
    curve: { gain: 0.3 },
    final: { gain: 0.3 },
  },
  sfx: { enter: "click", exit: "whooshOut", move: "whoosh", land: "marimba", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Balls are the only actors. Each ball is a closed-form function of time from plinko.js: drop from the spout, one parabolic hop per peg row (left or right from a seeded choice), a ballistic fall into its bin, two small bounces, rest in its stack slot.",
    "Stack slots are handed out in arrival order per bin (three abreast), so the histogram grows ball by ball and never rearranges.",
    "A struck peg flashes and swells for a tenth of a second; ticks, release clicks and one marimba note per bin come from the same plan.",
    "Camera: frontal, a few slow moves from the hopper down to the bins, locked during holds; the bell curve is drawn on the glass left to right.",
  ],
};
