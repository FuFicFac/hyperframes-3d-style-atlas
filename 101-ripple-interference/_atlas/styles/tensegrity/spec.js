// styles/tensegrity/spec.js — STYLE_SPEC for "Tensegrity". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the plan + score) and the browser.
// Units: metres, toy scale (the tower is about 3.4 m tall, struts 7 cm thick, cords 2.6 cm) so one cord reads at 1080p.
//
// The look: a bright studio table under a soft blue sweep. A three-level tower of pale wooden struts held only by red
// cords: no strut touches another. A small brass weight on a three-armed spider and a pair of snips wait at the side.
// tower.js solves the standing shape, the loaded shape and the shape after one cord is cut; cords glow by tension.

export const STYLE_SPEC = {
  id: "tensegrity",
  name: "Tensegrity",
  description:
    "A tensegrity tower on a bright studio table: three levels of pale wooden struts, each pair of strut ends joined only by taut red cords, so no strut touches another. The shape is SOLVED, not keyframed (tower.js): a static balance of nearly rigid struts and tension-only elastic cords gives the standing shape under prestress, the shape with a brass weight on the top three nodes, and the slumped shape after one cord is cut, where strut-on-strut contact is what finally holds it. Every cord's tension sets its glow and the pitch of its pluck; the slump runs along the solver's own damped descent between the two solved poses on an art-directed clock.",
  palette: {
    bg: "#a9cbe0",
    skyTop: "#6fa3c6",
    skyHorizon: "#cfe2ee",
    table: "#e9edf0",
    tableEdge: "#b9c6cf",
    wood: "#ecd6aa",
    woodDark: "#c9a46a",
    cord: "#d3202a",
    cordHot: "#ffd2a8",
    brass: "#d8a845",
    steel: "#c9d0d6",
    grip: "#137a75",
    ink: "#18222c",
    plate: "#ffffff",
    contact: "#fff3c4",
  },
  world: {
    background: "#a9cbe0",
    sky: { top: "#6fa3c6", horizon: "#d3e4ee", horizonAt: 0.62, bottom: "#e4edf2" },
    fog: { color: "#dfe9ef", near: 16, far: 46 },
    environment: "room",
    environmentIntensity: 0.6,
    toneMapping: "neutral",     // keeps the cord red and the brass gold as designed (ACES greys the pale wood)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    table: { type: "standard", baseColor: "#e9edf0", roughness: 0.85, metalness: 0 },
    wood: { type: "standard", baseColor: "#ffffff", roughness: 0.55, metalness: 0 },     // map added in style.js (kit woodTexture)
    brass: { type: "physical", baseColor: "#d8a845", roughness: 0.28, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.2 },
    steel: { type: "physical", baseColor: "#c9d0d6", roughness: 0.22, metalness: 1 },
    grip: { type: "physical", baseColor: "#137a75", roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3 },
    cordCut: { type: "standard", baseColor: "#c41e27", roughness: 0.7, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#c7d4dc", intensity: 1.2 },
    {
      id: "key", type: "directional", color: "#fff4e6", intensity: 2.4, position: [-5, 10, 6], target: [0, 1.4, 0],
      shadow: { softness: 2.5, mapSize: 2048, extent: 3.6, near: 0.5, far: 30, bias: -0.0004, normalBias: 0.02 },
    },
    { id: "rim", type: "directional", color: "#dbe9ff", intensity: 0.7, position: [5, 6, -7], target: [0, 1.4, 0] },
  ],
  post: {
    bloom: { strength: 0.6, radius: 0.3, threshold: 4.0 },   // only the glowing cords (HDR luminance > 4) bloom; the lit table is ~3
    vignette: { darkness: 0.18, offset: 1.2 },
  },
  camera: { fov: 34, near: 0.1, far: 80, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#18222c", height: 0.4 },

  // ---- the tower (every number tower.js needs) ---------------------------------------------------------------------
  tower: {
    levels: 3,
    H: 1.2,              // strut level height in the first guess (the solve settles the real shape)
    overlap: 0.4,        // how far each level reaches down into the one below (the ring then hangs it)
    radius: 0.85,        // node circle radius in the first guess
    twist: 30,           // degrees, top of a level against its bottom (vertical cords B[j] -> T[j])
    step: 90,            // degrees, each level against the one below
    phase: 0,
    prestrain: 0.92,     // cord rest length = prestrain x first-guess length (the prestress)
    load: 3,             // the weight, shared by the three top nodes (solver units; prestress tensions are ~35-55)
    cut: 12,             // the cord the snips cut (a ring cord between levels 2 and 3)
    cutAt: 0.5,          // where along it
    strutRadius: 0.035,
    cordRadius: 0.013,
    capRadius: 0.05,
    contactTol: 0.006,
    solver: {
      ks: 40000, EA: 1200, mass: 2, dt: 0.004, damp: 0.97, dampSlump: 0.97, kContact: 40000, floor: 0.02,
      iters: 30000, itersLoad: 20000, itersSlump: 60000, itersSettle: 0, snapEvery: 250, pathStates: 72,
    },
    flex: { period: 0.42, decay: 0.22, lead: 0 },          // art-directed bounce of the P1 -> P2 blend when the weight lands
    slumpSettle: 0.012,
    recoil: 0.3,                                            // cut ends shorten by this fraction (elastic recoil)
    glow: { rise: 0.22, pulse: 0.9, pulseDecay: 0.55, pulseFloor: 0.35, base: 0.8, hot: 7.0, hotMix: 0.6 },
    sag: { segments: 10 },
    weight: { home: [-2.1, 0, 0.45], seat: 0.06, arc: 1.1, radius: 0.2, height: 0.32, knob: 0.07, arm: 0.022 },
    snips: { home: [-1.5, 0.03, 1.75], bite: 0.32, open: 0.62, arc: 0.7, retreatOut: 1.4, retreatUp: 0.3, blade: 0.42, handle: 0.36 },
    sound: {
      root: 196, refLength: 1.0,
      bed: { gain: 0.32, chord: [0, 7, 12, 16], root: 98, chordAfter: [0, 5.6, 11.3, 14.7], rootAfter: 87, brightness: 700 },
      pluck: { gain: 0.55, dur: 1.4, decay: 1.3, bright: 0.55 },
      strum: { gain: 0.5, step: 0.03, dur: 2.4, decay: 1.8 },
      move: { gain: 0.25 }, land: { gain: 0.6 }, snip: { gain: 0.6 }, knock: { gain: 0.5, hz: 165 },
    },
  },
  wood: { seed: 105, boards: 1, dark: "#c9a46a", mid: "#e3c690", light: "#f3e2bd", seam: "#b88f55", contrast: 0.35, grainFreq: 10 },

  // ---- overlay caption (top left) -----------------------------------------------------------------------------------
  caption: {
    x: 92, y: 70, h: 112, cap: 60, maxW: 980,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#ffffff", edge: "#18222c", ink: "#18222c", cord: "#d3202a",
  },

  sfx: { enter: "pluck", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "pluck", ui: "click", bed: "pad" },
  motion: [
    "Every pose is solved: damped relaxation of stiff struts + tension-only elastic cords (+ strut contact after the cut), fixed step count, no RNG.",
    "Cords glow by solved tension (brightness ~ T / Tmax) and pluck at f ~ sqrt(T) / L (an ideal string).",
    "The press: an art-directed damped blend from the standing pose to the loaded pose; every cord flashes as the load arrives.",
    "The slump: the solver's own damped descent from the loaded pose to the cut pose, resampled by distance, on an eased clock.",
    "Camera: slow orbit while nothing moves, a close-up on the snips for the cut, a pull-back during the slump.",
  ],
};
