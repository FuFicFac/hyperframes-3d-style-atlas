// styles/ink-wash/spec.js — STYLE_SPEC for "Ink Wash". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js) and the browser.
// Units: metres (a big painting sheet modelled ~1.6x real: 3.0 x 1.7 m), Y-up, sRGB hex, radians, three.js light units.
//
// The look: a brush-and-ink painting coming to life on a large sheet of soft, fibrous off-white paper lying on a felt
// mat. Black ink in every strength — wet pooled darks, mid greys, pale washes, dry-brush "flying white" — plus one or
// two restrained accents (vermilion, indigo). A real 3D brush tilts and presses along each stroke; ink appears exactly
// as far as it has gone, then bleeds and dries on a closed-form schedule. The ink layer is rendered into a texture every
// frame from the plan and t alone (style.js: inkLayer), then the paper shader absorbs it (Beer–Lambert, per channel).

export const STYLE_SPEC = {
  id: "ink-wash",
  name: "Ink Wash",
  description:
    "Brush-and-ink painting coming to life on a large sheet of soft fibrous off-white paper with deckled edges, lying on a felt mat beside an ink stone, a water bowl and a brush rest. A real 3D brush tilts and presses along each planned stroke: ink appears exactly as far as the brush has travelled, width follows pressure, the stroke starts wet-dark and runs dry into streaky flying white, then the edges feather outward and the tone lightens as it dries. Broad grey washes bloom and settle with darker edges, a drop of indigo or vermilion spreads into a wet wash as a soft flower, and an abstract seal is pressed at the end.",
  palette: {
    bg: "#3d4043",         // felt mat (outside the sheet)
    paper: "#f3efe5",      // soft off-white sheet
    ink: "#100e0c",        // full-strength sumi black (absorbance target)
    vermilion: "#c9412b",  // the warm accent (seal paste, a sun)
    indigo: "#2c4466",     // the cool accent (water)
    felt: "#45484b",
    feltDark: "#33363a",
    stone: "#2a2b2e",      // ink stone
    stoneEdge: "#3a3b3e",
    glaze: "#dfe6dc",      // celadon bowl glaze
    water: "#8fa3a4",
    porcelain: "#f1f0ea",
    bamboo: "#c8b07a",
    bambooNode: "#9c8452",
    ferrule: "#2b1e17",
    hair: "#d8cbb0",       // dry brush hair
    sealStone: "#b8c2a4",  // pale soapstone seal block
    caption: "#1d1a16",
    captionAccent: "#c9412b",
  },
  world: {
    background: "#3d4043",
    environment: "room",
    environmentIntensity: 0.25,
    toneMapping: "neutral",  // keeps the paper warm off-white (ACES greys it)
    exposure: 1.0,
    shadowType: "pcf",
  },
  sheet: {
    w: 3.0, h: 1.7,
    deckle: 0.018,          // deckle depth at the edges (m)
    roughness: 0.93,
    wetRoughness: 0.42,     // wet ink is glossy for a moment, matte once dry
    fibreRepeat: [7, 4],    // fibre field tiles across the sheet
    mottle: 0.035,          // large-scale paper mottling (keep low: bitrate)
    fibreTone: 0.05,        // visible fibre strands in the paper colour
    shadow: { opacity: 0.32, spread: 0.06 },
  },
  mat: { w: 6.5, h: 4.4, fibre: 0.05 },
  // The ink layer: an offscreen half-float texture (RGB = optical density per channel, A = wetness) re-rendered from the
  // plan every frame. Every mark is additive in density, so overlapping ink darkens like real ink.
  ink: {
    px: 3072,               // texture width (height follows the sheet aspect)
    bleed: 0.013,           // how far wet ink feathers past the brush edge (m)
    tauBleed: 0.7,          // s — bleed growth time constant
    tauDry: 2.4,            // s — drying time constant (tone lightens, gloss goes, darker rim appears)
    lighten: 0.2,           // fraction a wet stroke lightens as it dries
    edgeDark: 0.45,         // dried-edge darkening of wet strokes
    halo: 0.75,              // density of the feathered bleed halo (vs the core)
    dry: [0.42, 0.86],      // load (1 - load) range where flying white starts / is fully dry
    bristles: 15,           // streak frequency across the brush
    streak: 2.2,            // streak frequency along the stroke (per m)
    aa: 0.0012,             // edge softness (m)
    fibreInk: 0.3,          // how strongly fibres modulate the ink
  },
  // Planner defaults (passed to planInk; see inkplan.js INK_DEFAULTS). Stations = where the brush dips.
  plan: {
    sheet: { w: 3.0, h: 1.7 },
    width: 0.062, speed: 1.45, textSpeed: 1.3, travelSpeed: 4.6, consume: 6.5, minTravel: 0.16, dipDur: 0.28, swirlDur: 0.42, dabDur: 0.22, penUp: 0.1, parkDur: 0.5,
    seal: { lift: 0.2, travel: 0.36, press: 0.15, ret: 0.3, hover: 0.12 },
    stations: {
      ink: { x: -1.0, y: 1.16, h: 0.052 },
      water: { x: -0.3, y: 1.18, h: 0.062 },
      vermilion: { x: 0.2, y: 1.15, h: 0.024 },
      indigo: { x: 0.42, y: 1.15, h: 0.024 },
      rest: { x: 1.08, y: 1.13, h: 0.055 },
      seal: { x: 0.78, y: 1.12, h: 0.0 },
    },
  },
  brush: {
    tuft: 0.14, tuftR: 0.027, handle: 0.6, handleR: 0.019, ferrule: 0.048, ferruleR: 0.0225,
    lean: 0.4,               // rad: the hand holds the brush leaning to the right (tuft stays visible from the camera)
    leanDir: [0.95, 0.12],   // (world x, world z) direction of that lean
    trail: 0.22,             // rad of extra lean against the direction of travel at full speed
    bend: 0.42,              // tuft bend (root ahead of the tip) at full press, fraction of tuft length
    squash: 0.36, spread: 0.55,
    wetLen: 0.86,            // fraction of the tuft that carries ink
  },
  props: {
    inkStone: { w: 0.46, d: 0.3, h: 0.055, well: [0.15, 0.09] },
    bowl: { r: 0.15, h: 0.078, water: 0.062 },
    dish: { r: 0.075, h: 0.026 },
    rest: { w: 0.16, h: 0.04 },
    seal: { size: 0.11, h: 0.15 },
  },
  materials: {
    paper: { type: "standard", baseColor: "#ffffff", roughness: 0.93, metalness: 0 },
    felt: { type: "standard", baseColor: "#ffffff", roughness: 1, metalness: 0 },
    stone: { type: "physical", baseColor: "#2a2b2e", roughness: 0.55, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.6 },
    inkPool: { type: "physical", baseColor: "#0b0a09", roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 },
    glaze: { type: "physical", baseColor: "#dfe6dc", roughness: 0.22, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.15 },
    porcelain: { type: "physical", baseColor: "#f1f0ea", roughness: 0.2, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.12 },
    water: { type: "physical", baseColor: "#8fa3a4", roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 },
    bamboo: { type: "standard", baseColor: "#c8b07a", roughness: 0.48, metalness: 0 },
    bambooNode: { type: "standard", baseColor: "#9c8452", roughness: 0.5, metalness: 0 },
    ferrule: { type: "physical", baseColor: "#2b1e17", roughness: 0.32, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.2 },
    sealStone: { type: "physical", baseColor: "#b8c2a4", roughness: 0.38, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3 },
    inkStick: { type: "standard", baseColor: "#151413", roughness: 0.6, metalness: 0 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#f6f3ec", groundColor: "#7c776e", intensity: 1.15 },
    { id: "key", type: "directional", color: "#fff6ea", intensity: 1.75, position: [-2.6, 6.2, -1.6], target: [0, 0, 0],
      shadow: { softness: 5, mapSize: 4096, extent: 2.7, near: 2, far: 14, bias: -0.0003, normalBias: 0.012 } },
    { id: "fill", type: "directional", color: "#eef0f4", intensity: 0.35, position: [2.4, 4, 5], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.22, offset: 1.1 },
  },
  camera: { fov: 30, near: 0.1, far: 40, drift: { amp: 0.01, speed: 0.25 } },
  text: { font: 'Georgia, "Times New Roman", Times, serif', weight: 400, color: "#1d1a16", height: 0.3 },
  caption: { w: 1000, h: 124, x: 96, y: 908, size: 48, tracking: 0.17, fadeIn: 0.45, fadeOut: 0.4, lead: 0.1, slip: "#f6f2e9", slipAlpha: 0.9 },
  sound: {
    swish: { pitch: 0.34, gain: 0.5 },
    wash: { pitch: 0.26, gain: 0.42 },
    drip: { pitch: 0.55, gain: 0.17 },
    seal: { pitch: 1.6, gain: 0.24 },
    flute: { root: 587.33, gain: 0.2, dur: 2.6, brightness: 1800, breath: 0.035 },
    pluck: { root: 73.42, gain: 0.34, dur: 2.2, brightness: 700 },
    bed: { root: 73.42, chord: [0, 7, 12], brightness: 460, gain: 0.85, attack: 2, release: 2.5 },
  },
  sfx: { enter: "whoosh", exit: "whoosh", move: "whoosh", land: "bubble", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "A stroke is a path with a pressure profile: the brush tip travels it and ink exists exactly as far as the brush has gone; width follows pressure.",
    "Each stroke starts with a pooled dark where the brush lands and runs dry into streaky flying white as its planned ink load empties.",
    "After the brush passes, wet ink bleeds (edges feather along the paper fibres) and lightens as it dries — a closed form of the stroke's own time.",
    "Washes sweep in as broad wet shapes, bloom outward and settle with darker edges; a drop of colour into a wet wash opens as a soft flower.",
    "Camera: high three-quarter view down onto the sheet, slow push-ins on what is being painted, long holds, end on the whole sheet.",
  ],
};
