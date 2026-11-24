// styles/cyanotype/spec.js — STYLE_SPEC for "Cyanotype" (a sun print). Plain data only: JSON-serializable, no THREE, no
// window. Importable from Node (export-spec.mjs, the demo's scene.config.js) and the browser. Units: metres, toy scale
// (the sheet is 1.7 m across so the camera can work at 1–2.5 m).
//
// The look: a sheet of sensitised paper (pale yellow-green coating brushed onto white paper, ragged brush edges) pinned
// to a light wooden drawing board in sunshine. Flat things lie on it: a green fern frond, a brass key, a grey-blue
// feather, a strip of white lace. The sun builds a dose on every uncovered point; the coating darkens from yellow-green
// through sage to bronze-grey around the objects. Lifted, they leave pale silhouettes (the early-lifted feather a
// half-dark ghost). The sheet slides into a white enamel tray, a wave of water crosses it, and everything exposed floods
// to deep Prussian blue while the shapes turn paper-white. The print colour is ONE shader on the sheet:
// k = response(dose), colour = table(k, washed); dose comes from exposure.js in closed form.

export const STYLE_SPEC = {
  id: "cyanotype",
  name: "Cyanotype",
  description:
    "Sunlight makes the print: a sheet of pale yellow-green sensitised paper pinned to a light wooden board in strong sun, with a fern frond, a brass key, a grey-blue feather and a strip of lace lying on it as flat procedural objects with real thickness and shadows. Every uncovered point collects a dose (the closed-form integral of the sun over the time it was uncovered); the paper darkens to bronze-grey around the objects, the feather lifted early prints as a half-dark ghost, the others leave crisp pale silhouettes. The sheet slides into a white enamel tray, a wave of water crosses it and the exposed paper floods to deep Prussian blue with paper-white shapes. One shader on the sheet looks colour up from (dose, washed). Soft thuds, a warm pad that brightens with the sun, lift whooshes, a water slosh and a rising chime.",
  palette: {
    bg: "#c3d3d0",
    table: "#c3d3d0",        // pale sage-blue table (only seen at the margins and around the tray)
    paper: "#f6f3ea",        // paper white (uncoated border, washed highlights)
    coat: "#dde28a",         // sensitiser, unexposed: pale yellow-green
    sage: "#aeae7c",         // half-exposed, unwashed
    bronze: "#766a57",       // fully exposed, unwashed: bronze-grey
    blueMid: "#5b82c2",      // washed, half dose
    prussian: "#133a86",     // washed, full dose: deep Prussian blue
    fern: "#3d8f2f",
    fernLight: "#7cbb45",
    brass: "#d0a54c",
    lace: "#f8f4ea",
    feather: "#8b98b2",
    featherTip: "#4b5873",
    pin: "#d2402f",
    tray: "#f3f3ef",
    trayRim: "#2a4f9c",
    caption: "#133a86",
    captionInk: "#fbf7ea",
    accent: "#e2e386",
  },
  world: {
    background: "#c3d3d0",
    sky: null,
    fog: null,
    environment: "room",     // soft reflections for the brass key and the water
    environmentIntensity: 0.32,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    table: { type: "standard", baseColor: "#c3d3d0", roughness: 0.92, metalness: 0 },
    paperEdge: { type: "standard", baseColor: "#f2efe6", roughness: 0.95, metalness: 0 },
    brass: { type: "standard", baseColor: "#d9ae52", roughness: 0.36, metalness: 0.72 },
    pin: { type: "standard", baseColor: "#d2402f", roughness: 0.35, metalness: 0 },
    pinMetal: { type: "standard", baseColor: "#cfd3d6", roughness: 0.25, metalness: 1 },
    tray: { type: "standard", baseColor: "#f3f3ef", roughness: 0.22, metalness: 0 },
    trayRim: { type: "standard", baseColor: "#2a4f9c", roughness: 0.3, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#f1f5fb", groundColor: "#b9ab8c", intensity: 1.15 },
    {
      // open shade: soft light from high above-front; soft contact shadows before and after the sun
      id: "shade", type: "directional", color: "#eef3ff", intensity: 1.15, position: [-0.5, 4.0, 1.4], target: [0, 0, 0],
      shadow: { softness: 7, mapSize: 2048, extent: 1.35, near: 1, far: 9, bias: -0.0005, normalBias: 0.004 },
    },
    {
      // the sun: warm, from back-left, crisp shadows; its level is driven by the plan (0 in shade)
      id: "sun", type: "directional", color: "#fff6e6", intensity: 0, position: [-2.5, 2.5, -1.7], target: [0, 0, 0],
      shadow: { softness: 1.6, mapSize: 2048, extent: 1.35, near: 1, far: 9, bias: -0.0005, normalBias: 0.004 },
    },
  ],
  post: {
    bloom: { strength: 0.12, radius: 0.3, threshold: 2.6 },
    vignette: { darkness: 0.16, offset: 1.25 },
  },
  camera: { fov: 34, near: 0.05, far: 30, drift: { amp: 0, speed: 0.2 } }, // no drift: holds stay still (bitrate)
  text: { font: "sans", weight: 700, color: "#133a86", height: 0.3 },

  // ---- the set (all heights in metres above the table, y = 0) ---------------------------------------------------
  board: { w: 2.1, d: 1.5, h: 0.03, wood: { dark: "#e2cda8", mid: "#e9d7b6", light: "#f1e4ca", seam: "#d6bf98", contrast: 0.16, grainFreq: 9 } },
  sheet: {
    w: 1.7, d: 1.1, lift: 0.0012,           // paper above its support
    coat: { inset: [0.075, 0.07], rag: 0.018, streak: 0.03 },  // brushed coating: inset from the paper edge, raggedness
    maskPx: 1300,                           // print-mask resolution (px per metre)
    fibre: 0.05,                            // paper tooth (low: fine noise under a moving camera costs bitrate)
  },
  // exposure response (art-directed): k = (1 - exp(-d / (tau * Sfull))) / norm; colour stops by k
  print: {
    tau: 0.7,
    unwashed: [["#dde28a", 0], ["#aeae7c", 0.42], ["#766a57", 1]],
    washed: [["#f6f3ea", 0], ["#4f78bd", 0.5], ["#0f2f78", 1]],
    washGamma: 0.9,
    front: { width: 0.03, develop: 0.22, wobble: 0.035 },
    wetDarken: 0.93,
  },
  // the four things on the paper (sheet coords: x right, z toward the camera; rot about +Y, CCW from above)
  objects: {
    fern: { ch: 0, pos: [-0.6, 0.3], rot: 1.1, length: 0.8, pairs: 19, leaf: 0.175, width: 0.026, bend: 0.06, stipe: 0.12, thick: 0.003, curl: 0.012, soft: 0.0022, seed: 120 },
    key: { ch: 1, pos: [0.1, -0.28], rot: -0.08, scale: 1.3, thick: 0.012, bevel: 0.003, soft: 0.004 },
    feather: { ch: 2, pos: [0.06, 0.16], rot: 0.45, length: 0.56, lead: 0.036, trail: 0.06, bend: 0.05, cover: 0.86, down: 0.5, soft: 0.003, curl: 0.01 },
    lace: { ch: 3, pos: [-0.02, 0.41], rot: 0, length: 0.78, height: 0.15, motif: 0.098, soft: 0.0012 },
  },
  brassEnv: 2.5,                          // the key reflects the soft room strongly (bright brass even in shade)
  pins: { inset: [0.035, 0.035], r: 0.024, h: 0.014 },
  tray: { x: 2.25, w: 2.0, d: 1.36, h: 0.075, wall: 0.04, floor: 0.015, water: 0.012, rim: 0.012 },
  water: { color: "#e4f3f6", alpha: 0.045, crest: 0.6, crestW: 0.026, ripple: 0.1, roughness: 0.06, sheen: 0.09, sheenW: 0.3, sheenDir: [0.8, 0.6], sheenFrom: -1.5, sheenTo: 1.3, sheenDelay: 0.25, sheenDur: 2.2 },

  // ---- overlay caption (bottom-left chip; the top-left 140 x 110 px corner stays clear for the reel badge) ------
  caption: {
    x: 92, y: 932, h: 92, cap: 34, font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#133a86", edge: "#e2e386", ink: "#fbf7ea", icon: "#e2e386", maxW: 860, roll: 0.36,
  },

  sound: {
    bed: { gain: 0.34, root: 110, chord: [0, 7, 12, 16], brightness: 600, attack: 1.0, release: 2.0 },
    sun: { gain: 0.3, brightness: 2400 },
    land: { gain: 0.5 },
    lift: { gain: 0.32 },
    pin: { gain: 0.28 },
    slide: { gain: 0.45 },
    wash: { gain: 0.6 },
    chime: { gain: 0.42 },
  },
  sfx: { enter: "thud", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "Objects are tossed onto the sheet one after another (drop, small hop, settle); the feather glides in rocking.",
    "The sun comes out: the dose on every uncovered point rises with the integral of the sun level; colour follows k(dose).",
    "Lifted objects fly off; the dose under them stops at their lift, so they leave pale silhouettes (early lift = ghost).",
    "The sheet slides into a tray; a water front sweeps across and the print develops to Prussian blue behind it.",
  ],
};
