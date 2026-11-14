// styles/origami/spec.js — STYLE_SPEC for "Origami". Plain data only: JSON-serializable, no THREE, no window.
// Units: metres at toy scale (a 15 cm kami sheet is modelled ~17x: 2.5 m), Y-up right-handed, sRGB hex, radians,
// three.js light units.
//
// The look: single square sheets of coloured kami paper (colour front, washi-white back) folded on screen into
// crisp faceted models on a calm light-oak desk, in soft window light from the left. Every fold is a rigid rotation of
// paper facets about a crease (styles/origami/folds.js); the folding itself is the show.

export const STYLE_SPEC = {
  id: "origami",
  name: "Origami",
  description:
    "Japanese paper folding on a calm oak desk: single sheets of two-sided kami paper fold on screen, crease by crease, into crisp faceted models lit by soft window light, labelled with ink-printed washi strips.",
  palette: {
    bg: "#d9d3c9",          // far room falloff (warm grey)
    table: "#c9bdab",
    kami: "#2f5ea6",        // aizome blue kami (front)
    washi: "#f6f2e9",       // white back of the sheet
    kinari: "#ebe2d0",      // unbleached washi: the slightly warmer second side of a white sheet
    core: "#fbf8f2",        // cut edge / paper core
    vermilion: "#d4472f",   // chiyogami accent
    gold: "#e2b45e",
    cream: "#f5ead2",
    indigo: "#22355f",
    sakura: "#e7a2ae",
    matcha: "#7d9a5b",
    sumi: "#1f1c19",        // ink
    hanko: "#c3342b",       // seal red
    strip: "#f8f3e7",       // label strip paper
    guide: "#3b302a",       // dashed crease guides
  },
  world: {
    background: "#d9d3c9",
    fog: { color: "#d9d3c9", near: 11, far: 26 },
    environment: null,
    toneMapping: "neutral",  // keeps the kami colours as designed
    exposure: 1.05,
    shadowType: "pcf",       // pcf so shadow.softness applies
  },
  // Paper: one layer = a thin slab. pitch > thickness leaves a hair of air between stacked layers (no z-fight,
  // and the stacked edges read as layers). Imperfection: flat folds spring back a fraction of a degree, open folds
  // land within ± open deg, seeded per model.
  paper: {
    thickness: 0.003,
    pitch: 0.0042,
    imperfect: { flat: [0.03, 0.1], open: 1.4 },
    bendSegments: 8,          // sweep resolution of the rounded crease strip
    fibre: { size: 512, seed: 31, strands: 1600, length: [0.02, 0.09], darkShare: 0.22, cloud: 0.05, grain: 0.035, repeatPerSheet: 2.2, description: "kozo fibre strands + faint cloud + fine grain (style-local fibreCanvas), multiplied under every paper colour; also the bump map" },
    bump: { strength: 0.008, description: "fibre relief: the fibre canvas as a bump map, one tile per sheet (bump UV = sheet UV, which the crease groove shares)" },
    sheen: { gradient: 0.07, tone: 0.025, description: "per-facet vertex-colour gradient (seeded direction) + tone shift: each facet catches the light a little differently" },
    crease: { texSize: 1024, width: 0.0042, dark: 0.06, groove: 0.0065, depth: 0.004, description: "creases baked in sheet UV, revealed per fold step: a soft groove (bump, shaded by the light) + a faint pressed darkening" },
    roughness: 0.74,
  },
  // Chiyogami (patterned paper) presets: pattern, ground, ink, accent, tiles per sheet.
  chiyogami: {
    seigaihaRed: { pattern: "seigaiha", ground: "#d4472f", ink: "#f5ead2", accent: "#e2b45e", tiles: 12 },
    seigaihaGold: { pattern: "seigaiha", ground: "#c93f2a", ink: "#e2b45e", accent: "#f5ead2", tiles: 6 },
    shippoRed: { pattern: "shippo", ground: "#d4472f", ink: "#f5ead2", accent: "#e2b45e", tiles: 6 },
    kanokoRed: { pattern: "kanoko", ground: "#cf4430", ink: "#f8eedb", accent: "#9e2a1c", tiles: 9 },
    asanohaIndigo: { pattern: "asanoha", ground: "#22355f", ink: "#e9dcc0", accent: "#e2b45e", tiles: 5 },
  },
  textures: {
    // a real writing desk: one calm light-oak veneer, fine straight grain along X, no plank seams, low contrast
    desk: { size: 1024, metresPerTile: 5, seed: 19, lines: 64, warp: 5, contrast: 0.55, blotch: 0.03, pore: 0.014,
      dark: "#c1b7a8", mid: "#d3cbbf", light: "#ded8ce", roughness: 0.6, roughVar: 0.12, description: "light oak veneer desk top (style-local deskTextures)" },
  },
  materials: {
    table: { type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0, bump: { scale: 80, octaves: 2, seed: 5, strength: 0.08, description: "fine pore noise" } },
    paperFront: { type: "standard", baseColor: "#2f5ea6", roughness: 0.74, metalness: 0, vertexColors: true },
    paperBack: { type: "standard", baseColor: "#f6f2e9", roughness: 0.78, metalness: 0, vertexColors: true },
    paperEdge: { type: "standard", baseColor: "#fbf8f2", roughness: 0.85, metalness: 0, emission: { color: "#fbf8f2", strength: 0.18 } }, // thin cores never read as dark slivers
  },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#eef0f2", groundColor: "#8f8678", intensity: 0.8 },
    // window light: low from the left, slightly behind, warm white; soft shadows
    { id: "key", type: "directional", color: "#fff1dd", intensity: 3.6, position: [-7.2, 6.6, 2.6], target: [0.2, 0, 0.0],
      shadow: { softness: 7, mapSize: 4096, extent: 6, near: 1, far: 30, bias: -0.0003, normalBias: 0.006 } },
    { id: "fill", type: "directional", color: "#dde6f3", intensity: 0.42, position: [6, 3.5, 6], target: [0, 0.3, 0] },
  ],
  // soft contact shadow fitted under each folded model (style.props.contact): reach = height over which it fades
  contact: { color: "#2a2118", opacity: 0.42, pad: 0.07, reach: 0.12, stand: [0.2, 0.45], nearShare: [0.3, 0.5], y: 0.0015, min: 0.12 },
  // window frame (shoji) shadow: an invisible lattice between the key light and the table casts soft bars
  window: { enabled: false, distance: 3.4, width: 7.0, height: 5.2, mullions: 3, transoms: 2, bar: 0.07, frame: 0.0, offset: [0.4, -0.2] },
  post: {
    tiltShift: { focus: 0.5, range: 0.36, blur: 1.6 },
    vignette: { darkness: 0.28, offset: 1.1 },
    grain: { amount: 0.014, fps: 30 },
  },
  camera: { fov: 30, near: 0.3, far: 60, drift: { amp: 0.03, speed: 0.22 } },
  text: { font: '"Hiragino Mincho ProN", "Hiragino Mincho Pro", "YuMincho", Georgia, serif', weight: 600, color: "#1f1c19", height: 0.06 },
  label: {
    // washi strip pinned to the overlay (exact colours): kicker line + main line, a vermilion seal, deckled ends
    pxPerUnit: 220, mainSize: 0.56, kickerSize: 0.3, letterSpacing: 0.06, padX: 0.55, padY: 0.3, seal: "折", sealSize: 0.62,
    deckle: 0.08, fibre: 0.05, rule: "#c3342b", shadow: 0.22,
  },
  guide: { width: 3, level: 0.8, valley: [0.06, 0.04, 0, 0], mountain: [0.06, 0.03, 0.01, 0.03], lead: 0.45, fade: 0.35 },
  tuning: {
    foldDur: 0.5,           // s per fold step (flat folds ease in-out; open folds settle with ~4 % overshoot)
    pairLag: 0.2,           // s between a left fold and its mirror
    gap: 0.12,              // s between consecutive steps
    wipeSoft: 0.18,         // softness of the colour/pattern wipe across the sheet (UV units)
    stackPitch: 0.0055,     // vertical spacing of sheets in a stack
  },
  sfx: { enter: "paper", exit: "rustle", move: "whoosh", land: "fold", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "Models are folded on screen: each step rotates a set of rigid paper facets about a crease line; the angle is a pure function of t.",
    "Steps nest: a later crease is carried by the facets an earlier step folded, so a sequence builds a real folded shape.",
    "A dashed crease guide (valley = dashes, mountain = dash-dot) draws on just before each fold and fades as the paper swings.",
    "Flat folds ease in-out and land one paper pitch above the stack they cover; open folds settle with a ~4 % springy overshoot.",
    "Crease lines appear on the paper as each fold happens and stay; a crease-only step folds and opens again.",
    "Finished models then move as characters: a dart glides, a glider flaps by re-angling its wing creases.",
    "Camera: calm three-quarter view from above, slow drift, push in on the fold, pull out for the reveal.",
  ],
};
