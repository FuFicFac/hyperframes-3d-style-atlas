// styles/card-table/spec.js — STYLE_SPEC for "Card Table". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the dealer plan + score) and the browser.
// Units: metres (cards ~2.8x real size so they read at 1080p), Y-up right-handed, sRGB hex, radians, three.js light units.
//
// The look: a card table under a low hanging lamp. Calm baize cloth (green by default; `baizes` holds other cloths),
// a bevelled wooden rail, and a deck of ORIGINAL information cards on thick linen-finish stock with rounded corners:
// faces carry a big code-drawn icon, a title, a one-line caption and a corner index; backs carry a geometric lattice
// with a rosette medallion. Poker-style chips and a dealer button act as counters and markers.
// Every card move (riffle, deal, flip, fan, spread, stack, slide) is planned by dealer.js (pure, Node-safe), so the
// snaps, slides, riffle ticks and chip clinks in SCORE come from the same plan the picture reads.
// Table frame: baize surface at y = 0, table centre = world origin, the dealer/viewer sits at +Z looking toward -Z.

export const STYLE_SPEC = {
  id: "card-table",
  name: "Card Table",
  description:
    "A card table under a low hanging lamp: calm green baize, a bevelled wooden rail, and a deck of original illustrated information cards (thick linen stock, rounded corners, geometric backs; faces with a big drawn icon, title, caption and corner index). Cards riffle, deal along spinning arcs with a soft landing slide, flip with a bend, fan, spread and stack; chips and a dealer button slide in to mark the pick.",
  palette: {
    bg: "#0b0a09",
    baize: "#1f6a45",
    baizeDark: "#123f29",
    rail: "#5a3220",
    stock: "#f3ede0",       // card stock (cream)
    stockEdge: "#e2d9c6",
    ink: "#1f1d1b",
    muted: "#6b655c",
    back: "#7b2333",        // card back field (oxblood)
    backInk: "#efe4cf",     // card back line work
    brass: "#c39a4e",
    accents: ["#2a7f8f", "#d0632f", "#5b4a9e", "#3f8a4a", "#c2453c", "#c9962b"],
  },
  // alternative cloths: createStyle(stage, { baize: "blue" })
  baizes: {
    green: { cloth: "#1f6a45", dark: "#123f29", sheen: "#5fae7f" },
    blue: { cloth: "#1d4f78", dark: "#10304c", sheen: "#6f9fcf" },
    red: { cloth: "#7a2028", dark: "#4a1117", sheen: "#c86a72" },
    charcoal: { cloth: "#2f3336", dark: "#1a1c1e", sheen: "#7d8489" },
  },
  world: {
    background: "#0b0a09",
    environment: "room",
    environmentIntensity: 0.12,  // just enough to put a glint on chips, brass and the card sheen
    toneMapping: "neutral",      // keeps cream stock cream and the accent inks as drawn (ACES greys paper)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    rail: { type: "physical", baseColor: "#ffffff", roughness: 0.38, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.25 },
    brass: { type: "standard", baseColor: "#c39a4e", roughness: 0.32, metalness: 1 },
    shade: { type: "standard", baseColor: "#1d3a2c", roughness: 0.45, metalness: 0.3 },
    floor: { type: "standard", baseColor: "#17120e", roughness: 0.9, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#f4e6cc", groundColor: "#120d09", intensity: 0.32 },
    {
      // the hanging lamp: a warm pool on the cloth, falling off to the rail
      id: "lamp", type: "spot", color: "#ffe2b5", intensity: 4.0, position: [0, 0.95, 0.12], target: [0, 0, 0.1],
      angle: 0.82, penumbra: 0.75, decay: 2, distance: 0,
      shadow: { softness: 4, mapSize: 2048, near: 0.3, far: 2.2, bias: -0.00015, normalBias: 0.0015 },
    },
    // a faint cool kicker from behind the far rail: separates card edges and chip rims from the cloth
    { id: "kick", type: "directional", color: "#b9c8d8", intensity: 0.22, position: [0.6, 0.7, -1.4], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.18, radius: 0.5, threshold: 2.6 },   // only the brass glints bloom
    vignette: { darkness: 0.5, offset: 1.0 },
  },
  camera: { fov: 34, near: 0.05, far: 8, drift: { amp: 0.003, speed: 0.22 } },
  text: { font: "sans", weight: 700, color: "#1f1d1b", height: 0.03 },

  // ---- table --------------------------------------------------------------------------------------------
  table: {
    W: 1.6, D: 1.1, corner: 0.22,       // baize surface (rounded rectangle), metres
    rail: { width: 0.13, height: 0.045, bevel: 0.022, corner: 0.3, env: 0.25 },
    texture: { px: 1024, contrast: 0.035, scale: 3.2, seed: 5 },   // CALM cloth: low-contrast, large-scale only (bitrate!)
    sheen: 0.55, sheenRoughness: 0.75, roughness: 0.94,
  },
  lamp: { y: 0.95, shadeR: 0.26, shadeH: 0.18, cord: 1.2, bulb: "#fff1d6", bulbStrength: 2.2 },

  // ---- cards --------------------------------------------------------------------------------------------
  card: {
    W: 0.18, H: 0.25, radius: 0.017, th: 0.0022,   // thick stock; deck layer pitch = th + gap
    gap: 0.0002,
    cols: 26, rows: 14,                // deformation grid (columns follow the rounded corners exactly)
    px: 720,                           // face/back canvas width (height = px * H / W)
    linen: 0.05,                       // linen cross-hatch strength baked into the stock
    roughness: 0.58, sheen: 0.25,
    dim: 0.55,                         // colour multiplier for "not chosen" cards
    fonts: {
      title: '"Avenir Next Condensed", "Helvetica Neue", Arial, sans-serif',
      caption: '"Avenir Next", "Helvetica Neue", Arial, sans-serif',
      index: '"Avenir Next Condensed", "Helvetica Neue", Arial, sans-serif',
      titleWeight: 700, captionWeight: 500, indexWeight: 700,
    },
  },
  back: { field: "#7b2333", ink: "#efe4cf", border: 0.012, lattice: 7, seed: 3 },

  // ---- dealer (planner tuning; dealer.js reads these) ----------------------------------------------------
  riffle: {
    split: 0.45,        // the cut: top half lifts away to one side, bottom half slides to the other
    gapX: 0.135,        // half-pile centre offset from the deck centre (along the long axis)
    mergeX: 0.1,        // where released cards land (inner ends overlap by 2*(H/2 - mergeX))
    lift: 0.05,         // cut arc height
    peel: 0.42,         // inner-end lift while riffling (fraction of half card length)
    pace: 0.036,        // mean seconds between released cards (seeded unevenness on top)
    jitter: 0.45,
    fall: 0.07,         // a released card's drop time
    settle: 0.12,       // pause before squaring
    square: 0.38,       // the halves are pushed together
  },
  deal: { flight: 0.42, slide: 0.06, slideDur: 0.32, height: 0.1, turns: 1, bend: 0.035, jitter: 0.04 },
  flip: { dur: 0.46, clear: 0.012, bend: 0.06 },
  move: { dur: 0.5 },
  chip: { r: 0.05, h: 0.011, drop: 0.12, bounce: 0.004, pitch: 0.0112 },
  button: { r: 0.06, h: 0.016, text: "DEALER" },
  chipColors: [
    { body: "#b8332c", insert: "#f2ebdc" },
    { body: "#20507a", insert: "#f2ebdc" },
    { body: "#26262a", insert: "#d9b45a" },
    { body: "#2f7a4c", insert: "#f2ebdc" },
    { body: "#eae3d4", insert: "#8a2b2b" },
  ],

  // ---- the beat label: a small brass plaque pinned to the screen (overlay = exact colours) ---------------
  plaque: { x: 96, y: 74, h: 92, cap: 38, font: '"Copperplate", Georgia, serif', weight: 700, brass: ["#e3c27a", "#b98a3c", "#8e6427"], ink: "#2a1b0d" },

  sound: {
    riffle: { gain: 0.32, pitch: 2.4 },
    split: { gain: 0.38 },
    square: { gain: 0.42 },
    deal: { gain: 0.22, pitch: 1.6 },
    land: { gain: 0.42 },
    flip: { gain: 0.5 },
    slide: { gain: 0.32 },
    chip: { gain: 0.36, pitch: 2.6 },
    button: { gain: 0.5 },
    bed: { gain: 0.85, root: 110, brightness: 800 },
  },
  sfx: { enter: "paper", exit: "whooshOut", move: "rustle", land: "paper", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "Riffle: the deck is cut into two halves, the inner ends peel up and cards drop alternately (one tick each) into one pile, then the halves are squared.",
    "Deal: each card leaves the top of the deck on a low arc, spinning flat (one turn), touches down short of its spot and slides the last few centimetres to rest.",
    "Flip: a card lifts on its long edge, turns over with a slight bend and snaps flat; a row turns over in a wave (one snap per card).",
    "Fan / spread / stack: cards slide between computed layouts (fan arc, overlapping ribbon, squared stack) layer by layer, never through each other.",
    "Pick: the chosen card slides forward into the lamp light while the others ease back and dim; chips and the dealer button slide in to mark it.",
    "Camera: high three-quarter view from the dealer's seat, one slow move per beat, ending close and nearly top-down on the chosen card.",
  ],
};
