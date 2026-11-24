// styles/linocut/spec.js — STYLE_SPEC for "Linocut". Plain data only (JSON-safe, no THREE, no window).
// Units: metres, Y-up right-handed, colours sRGB hex, angles radians, three.js light units.
// A grey-green lino block mounted on birch ply, on a pale wooden bench, lit by a strong low side light so the grooves read.
// The design, the strokes and every time live in lino.js (planner); this file holds how it LOOKS and SOUNDS.

export const STYLE_SPEC = {
  id: "linocut",
  name: "Linocut",
  description:
    "A grey-green lino block on a pale bench: a V-gouge ploughs grooves and lifts curls, a black roller inks only the raised parts, paper is pressed with a round baren and peeled back: the print is the mirror of the block.",
  palette: {
    bg: "#e8dcc6",
    bench: "#dcc6a2",
    lino: "#7f8c73",
    linoEdge: "#6a7660",
    cut: "#cdbd98",
    cutDeep: "#b9a47c",
    ply: "#e0c9a2",
    ink: "#141416",
    paper: "#f3ecdc",
    handle: "#a0602f",
    brass: "#c99a45",
    steel: "#b9bec4",
    baren: "#3a2418",
    bamboo: "#d1b07a",
    plate: "#f6f0e2",
    caption: "#141414",
    accent: "#d2452b",
  },
  world: {
    background: "#e8dcc6",
    fog: null,
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#ffffff", roughness: 0.72, metalness: 0 },
    ply: { type: "standard", baseColor: "#ffffff", roughness: 0.8, metalness: 0 },
    linoSide: { type: "standard", baseColor: "#6f7b65", roughness: 0.78, metalness: 0 },
    handle: { type: "standard", baseColor: "#a0602f", roughness: 0.45, metalness: 0 },
    brass: { type: "standard", baseColor: "#c99a45", roughness: 0.32, metalness: 0.9 },
    steel: { type: "standard", baseColor: "#c4c8cc", roughness: 0.24, metalness: 0.95 },
    rubber: { type: "standard", baseColor: "#17171a", roughness: 0.26, metalness: 0 },
    baren: { type: "standard", baseColor: "#3a2418", roughness: 0.38, metalness: 0 },
    bamboo: { type: "standard", baseColor: "#d1b07a", roughness: 0.6, metalness: 0 },
    slab: { type: "standard", baseColor: "#dfe6e4", roughness: 0.12, metalness: 0, opacity: 0.5 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fff7ea", groundColor: "#d9c3a0", intensity: 1.05 },
    // the raking key: low, from front-left, so groove walls light up on one side and fall into shade on the other
    { id: "key", type: "directional", color: "#fff1dc", intensity: 2.6, position: [-0.62, 0.42, 0.5], target: [0, 0, -0.02],
      shadow: { softness: 2, mapSize: 2048, extent: 0.42, near: 0.05, far: 3, bias: -0.0002, normalBias: 0.0015 } },
    // a soft back light that the glossy ink reflects toward a camera in front
    { id: "sheen", type: "directional", color: "#ffffff", intensity: 0.9, position: [0.15, 0.7, -0.9], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.22, offset: 1.15 },
    grain: { amount: 0.012, fps: 30 },
  },
  camera: { fov: 34, near: 0.02, far: 8, drift: { amp: 0.0012, speed: 0.35 } },
  text: { font: "sans", weight: 800, color: "#141414", height: 0.03 },

  // ---- the look of each part (read by style.js) -------------------------------------------------------
  block: { w: 0.3, h: 0.225, ply: 0.018, lino: 0.0032, segX: 640, segY: 480, bakeX: 1200, bakeY: 900, chamfer: 0.0015 },
  linoShade: {
    top: "#6b7861", // uncut lino (grey-green, slightly mottled)
    cut: "#d2c29d", // freshly cut lino is paler and warmer
    cutDeep: "#ae9a72",
    ao: 0.3, // groove bottoms darker (reads as depth)
    mottle: 0.07, // top-surface tone noise
    roughTop: 0.72, roughCut: 0.9,
    frontSoft: 0.012, // seconds over which a texel goes from uncut to cut as the tip passes
    normalGain: 1.6,
  },
  inkShade: {
    color: "#131315", sheen: "#2a2a30", rough: 0.3, roughVar: 0.12, // glossy, with roller streaks in the roughness
    inkMaxDepth: 0.00034, inkMinDepth: 0.0001, // texels shallower than this catch ink (raised top + groove shoulders)
    streakNormal: 0.09, // roller "orange peel" normal perturbation
  },
  print: {
    paper: "#f3ecdc", ink: "#111113", ghost: 0.32, // how dark the image ghosts through the back of the paper while rubbed
    speck: 0.9, // salt-and-pepper where the ink was thin (0..1)
    transferSoft: 0.32, // seconds for the ink to transfer under the baren
  },
  gouge: { handleLen: 0.088, handleR: 0.0142, ferrule: 0.009, shaft: 0.04, shaftR: 0.0034, blade: 0.014, bladeW: 0.0042, bladeH: 0.0036, tilt: 0.36 },
  chip: { r: 0.0048, width: 0.0042, turns: 1.25 },
  roller: { r: 0.0215, len: 0.245, frame: 0.0028, handleR: 0.011, handleLen: 0.095 },
  barenShape: { r: 0.048, h: 0.009 },
  bench: { w: 2.4, d: 2.4, woodRepeat: [4, 4] },
  wood: { size: 1024, boards: 5, seed: 41, grainFreq: 26, grainWarp: 1.4, contrast: 0.2, dark: "#d4c2a3", mid: "#e4d6bc", light: "#f1e8d6", seam: "#c4ae8a" },

  // ---- overlay caption (bottom-left, exact colours; the old line rolls up and out as the new one rolls in) ----
  caption: {
    x: 84, y: 912, h: 96, cap: 44, maxW: 1000,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 800,
    plate: "#f6f0e2", ink: "#141414", accent: "#d2452b", shadow: "rgba(40,28,10,0.35)",
    roll: 0.34, // seconds of the roll at each beat change
  },

  sound: {
    bed: { gain: 0.62, root: 110, brightness: 720 },
    scrape: { gain: 0.55, pitch: 0.55 },
    tick: { gain: 0.22 },
    blur: { gain: 0.3 },
    roll: { gain: 0.5 },
    paper: { gain: 0.6 },
    rub: { gain: 0.32 },
    peel: { gain: 0.5 },
    chord: { gain: 0.42, hz: 220 },
  },
  sfx: { enter: "pop", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "marimba", ui: "tick", bed: "pad" },
  motion: [
    "Gouge: the tip follows each planned stroke at the groove bottom, tilted ~20°, hops between strokes; one lino curl per stroke rides the tip and is flicked onto the bench.",
    "Carving is a per-texel bake (first-pass time + depth, deepest-stroke time + depth); the shader shows depth(t), never accumulates.",
    "Roller: rolls without slipping across the block; only texels shallower than ~0.3 mm behind its contact line turn glossy black.",
    "Paper: hinges down from the far edge, a baren rubs loops (ink ghosts through where it has passed), the near-right corner peels on a cylinder, then the sheet lifts, flips and faces the camera: the mirrored block prints the right way round.",
  ],
};
