// styles/ukiyo-e/spec.js — STYLE_SPEC for "Ukiyo-e" (Japanese woodblock printing). Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the pass plan + score) and the browser.
// Units: metres, toy-scale exaggerated (a 3.3 m sheet) so key lines and wood grain read at 1080p.
//
// The look: a sheet of cream washi with visible kozo fibres on a pale hinoki bench, against two wooden kento guides.
// Carved cherry blocks swing down onto it one at a time and each leaves ONE flat layer in register: the black key line,
// then the flat colours (sky bokashi, Prussian blue, a second blue, ochre, pink). The layers are multiplied onto the
// lit paper (like transparent water-based ink), so paper fibre shows through every colour and the black line survives
// every pass. prints.js plans every pass; the same plan drives the swings, thuds, baren rubs and plucked notes.

export const STYLE_SPEC = {
  id: "ukiyo-e",
  name: "Ukiyo-e",
  description:
    "Japanese woodblock printing in passes: a sheet of cream washi with kozo fibres lies on a pale hinoki bench against two wooden kento registration guides. Carved cherry-wood blocks swing down onto it one at a time like a lid, press (the key block gets a baren rubbing pass over its back), and swing up again to reveal the ONE flat layer each has left in register: first the black key line, then the sky bokashi gradation, Prussian blue, a second blue, ochre and pink, until an original great-wave-and-mountain seascape is complete; a red seal stamps it and the printed layers lift a few centimetres off the paper for a gentle parallax. Each block's underside carries its own inked relief (mirror-correct when it opens) and kento marks. Layers are multiplied onto the lit paper like transparent ink, so fibre and wood grain show in every flat colour and the key line survives every pass.",
  palette: {
    bg: "#e9dcc2",
    bench: "#d9c29a",
    paper: "#f3ead6",
    ink: "#1c1a1f",
    sky: "#7f9cc2",
    prussian: "#1f3f78",
    blue2: "#7fa6c4",
    ochre: "#d39a4a",
    pink: "#e6a49a",
    seal: "#c23a2c",
    blockLight: "#c08a5c",
    blockMid: "#9a6440",
    blockDark: "#6b3f26",
    cut: "#5a3420",
    baren: "#2a2422",
    bamboo: "#c9a96a",
  },
  world: {
    background: "#e9dcc2",
    sky: null,
    fog: { color: "#e9dcc2", near: 12, far: 30 },
    environment: "room",
    environmentIntensity: 0.35,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#ffffff", roughness: 0.78, metalness: 0, map: { source: "wood", size: 1024, boards: 4, seed: 61, grainFreq: 30, grainWarp: 1.6, contrast: 0.32, dark: "#b99a6c", mid: "#d6bd92", light: "#e6d3ae", seam: "#9c7f56", description: "pale hinoki boards" } },
    paper: { type: "standard", baseColor: "#ffffff", roughness: 0.92, metalness: 0 },
    kento: { type: "standard", baseColor: "#b48a5a", roughness: 0.7, metalness: 0 },
    blockSide: { type: "standard", baseColor: "#ffffff", roughness: 0.6, metalness: 0 },
    baren: { type: "standard", baseColor: "#2a2422", roughness: 0.45, metalness: 0.05 },
    bamboo: { type: "standard", baseColor: "#c9a96a", roughness: 0.55, metalness: 0 },
    sealStone: { type: "standard", baseColor: "#8e6b4e", roughness: 0.5, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fff8ec", groundColor: "#a8916e", intensity: 1.05 },
    {
      // soft high key from front-left; short warm shadows fall back-right
      id: "key", type: "directional", color: "#fff3e0", intensity: 2.2, position: [-3.5, 7.5, 4.2], target: [0, 0, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 3.4, near: 0.5, far: 25, bias: -0.0004, normalBias: 0.02 },
    },
    { id: "rim", type: "directional", color: "#e2ecff", intensity: 0.45, position: [3, 4, -6], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.22, offset: 1.15 },
  },
  camera: { fov: 32, near: 0.3, far: 40, drift: { amp: 0, speed: 0.2 } },   // no drift: still holds keep the paper sharp + cheap
  text: { font: "serif", weight: 600, color: "#1c1a1f", height: 0.3 },

  // ---- the sheet ------------------------------------------------------------------------------------------
  sheet: {
    w: 3.3, d: 2.12,          // m, paper sheet (landscape yoko-e)
    margin: 0.09,             // m of bare paper round the image
    thickness: 0.006,
    px: [2048, 1280],         // canvas size of each printed layer (image area)
    fibres: 260,              // kozo strands painted into the paper texture
    layerGap: 0.0007,         // m between stacked layer planes at rest
  },
  bench: { size: 26 },
  kento: { h: 0.025, w: 0.05, len: 0.42 },     // L guide at the near-right corner, straight guide on the near edge (left)

  // ---- blocks ---------------------------------------------------------------------------------------------
  block: { pad: 0.07, thickness: 0.09, facePx: [1024, 680], grain: 0.5, carveDark: 0.62 },
  // order printed = order here; colour = multiply ink; grain = wood-grain streak strength in the flat colour
  layers: [
    { id: "key", color: "#1c1a1f", grain: 0.12, label: "key block" },
    { id: "sky", color: "#7f9cc2", grain: 0.4, label: "sky bokashi" },
    { id: "prussian", color: "#1f3f78", grain: 0.35, label: "Prussian blue" },
    { id: "blue2", color: "#8fb2cc", grain: 0.38, label: "second blue" },
    { id: "ochre", color: "#d39a4a", grain: 0.4, label: "ochre" },
    { id: "pink", color: "#e8a89c", grain: 0.38, label: "pink" },
    { id: "seal", color: "#c23a2c", grain: 0.15, label: "seal" },
  ],
  baren: { r: 0.2, h: 0.045 },
  sealStone: { size: 0.2, h: 0.32 },
  timing: { close: 0.5, hold: 0.2, open: 0.55, exit: 0.35, from: 1.45, to: 1.75, lift: 0.35, exitRise: 2.2, exitBack: 1.2 },
  parallax: { lift: 0.16 },

  // ---- overlay caption (bottom centre) ---------------------------------------------------------------------
  caption: {
    x: 960, y: 950, h: 74, cap: 36, maxW: 900,
    font: '"Hiragino Mincho ProN", "Hiragino Mincho Pro", Georgia, serif', weight: 600,
    plate: "#f3ead6", edge: "#1c1a1f", ink: "#1c1a1f", accent: "#c23a2c",
  },

  sound: {
    bed: { root: 110, chord: [0, 7, 12, 15], brightness: 700, gain: 0.55 },
    swing: { gain: 0.32 },
    contact: { thud: 0.8, clack: 0.35 },
    rub: { gain: 0.38, density: 0.5 },
    peel: { gain: 0.3 },
    reveal: { root: 293.66, gain: 0.85 },
    seal: { thud: 0.75, chime: 0.18 },
  },
  sfx: { enter: "whoosh", exit: "paper", move: "rustle", land: "thud", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "One pass per block: it swings down on a hinge at the sheet's far edge (slam ease), presses, and swings back up; its layer appears under it at contact, so the opening reveals it near edge first.",
    "The key block gets a baren rubbing pass: the disc loops across the block's back in zig-zag rows while pressed.",
    "Layers are multiplied onto the lit paper (like transparent ink): fibre and grain show through, the black line survives every pass.",
    "Finale: a stone seal stamps, then the printed layers lift off the paper in order (key highest) while the camera eases sideways: parallax.",
    "Camera: locked during printing; one slow move only for the finale.",
  ],
};
