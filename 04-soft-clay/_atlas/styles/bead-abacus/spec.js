// styles/bead-abacus/spec.js — STYLE_SPEC for "Bead Abacus". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the bead plan + score + shots) and the browser.
// Units: metres (beads ~5x real size so a viewer can count them at 1080p), Y-up right-handed, sRGB hex, radians.
//
// The look: a big counting frame lying on a clean bright tabletop in soft daylight. A warm hardwood frame (two end
// posts, two low rails), polished steel rods, chunky lacquered wooden beads in a small confident palette with the
// paint worn back to bare wood on the rim. Beads slide along the rods to show numbers: beads.js plans every move
// (block pushes, one-at-a-time counts, carries, a 10x10 frame filling) and the clacks, whirrs and notes in SCORE.
// Frame frame: table at y = 0, rods along +X, row 0 on the far side (top of the screen); the viewer sits at +Z.

export const STYLE_SPEC = {
  id: "bead-abacus",
  name: "Bead Abacus",
  description:
    "A big counting frame on a clean bright tabletop in soft daylight: warm hardwood posts and rails, polished steel rods and chunky lacquered wooden beads (round, bicone or disc) in a small confident palette with paint worn to bare wood on the rims. Quantities become physical and countable: beads slide along their rods as a pushed block and clack home with a tiny settle; rows are labelled bars, shares, counts or place values; desk nameplates at the row ends update when the beads land; a 10x10 frame fills for percentages, and ten beads return while one moves on for a carry.",
  palette: {
    bg: "#efe9df",
    surface: "#eee8de",
    ink: "#23201c",
    muted: "#7a7268",
    wood: { dark: "#6e3d22", mid: "#a5653b", light: "#c98f5c" },
    bare: "#cfae7e",          // bare beech under the worn paint
    steel: "#cfd3d8",
    brass: "#c8a04c",
    enamel: "#f7f2e8",
    // the bead palette: few, saturated, distinguishable (row colours cycle through it)
    beads: ["#d4442c", "#2a63b3", "#e8a51f", "#2e8a62", "#7b3f98", "#ece0c4"],
    stamp: "#c0392b",
  },
  world: {
    background: "#efe9df",
    environment: "room",
    environmentIntensity: 0.32,   // steel rods and the lacquer clearcoat need something to reflect
    toneMapping: "neutral",       // keeps the lacquer colours as designed (ACES greys the bright table)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    surface: { type: "standard", baseColor: "#eee8de", roughness: 0.82, metalness: 0 },
    wood: {
      type: "physical", baseColor: "#ffffff", roughness: 0.46, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35,
      map: { source: "wood", size: 512, boards: 1, seed: 31, grainFreq: 9, grainWarp: 1.1, contrast: 0.22, dark: "#6e3d22", mid: "#a5653b", light: "#c98f5c", description: "warm cherry long grain" },
    },
    steel: { type: "standard", baseColor: "#d4d8de", roughness: 0.22, metalness: 1 },
    bead: { type: "physical", baseColor: "#ffffff", roughness: 0.4, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.18, vertexColors: true },
    brass: { type: "standard", baseColor: "#c8a04c", roughness: 0.3, metalness: 1 },
    plateBody: { type: "physical", baseColor: "#ffffff", roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4,
      map: { source: "wood", size: 256, boards: 1, seed: 37, grainFreq: 8, grainWarp: 1.0, contrast: 0.2, dark: "#6e3d22", mid: "#a5653b", light: "#c98f5c", description: "nameplate wood" } },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#fbf6ee", groundColor: "#d8cdbd", intensity: 1.05 },
    {
      // soft daylight from a window upper left / behind: shadows fall right and toward the viewer, short and soft
      id: "sun", type: "directional", color: "#fff4e4", intensity: 2.1, position: [-3.2, 6.5, -2.2], target: [0, 0, 0],
      shadow: { softness: 5, mapSize: 4096, extent: 3.6, near: 1, far: 16, bias: -0.0002, normalBias: 0.012 },
    },
    { id: "bounce", type: "directional", color: "#f3ece2", intensity: 0.35, position: [3, 2.5, 4], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.08, radius: 0.4, threshold: 3.0 },   // only steel glints
    vignette: { darkness: 0.22, offset: 1.1 },
  },
  camera: { fov: 30, near: 0.2, far: 40, drift: { amp: 0.004, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#23201c", height: 0.08 },

  // ---- props ---------------------------------------------------------------------------------------------
  bead: {
    R: 0.056,            // outer radius
    T: 0.088,            // thickness along the rod
    gap: 0.003,          // resting gap between neighbours (pitch = T + gap)
    hole: 0.0105,        // bore radius (rod r + clearance)
    shape: "round",      // round | bicone | disc
    exponents: { round: 2, bicone: 1.18, disc: 4.5 },   // superellipse profile exponent per shape
    radial: 40, profile: 28,                             // lathe segments
    wear: { amount: 0.5, rim: 0.55, freq: 9, seed: 9 },   // paint worn to bare wood on the rim (vertex colours)
    mottle: 0.025,       // lacquer tone variation
    variants: 3,         // geometry variants per colour (different wear)
    fives: 0.66,         // beads 6-10 of a row use the row colour x this (count by fives); 1 = off
  },
  rod: { r: 0.0072, overhang: 0.004 },
  frame: {
    travel: 4,           // free rod length, in bead pitches
    rowPitch: 0.19,      // row spacing (>= 2R + ~0.04 so rows never overlap from a ~50 degree camera)
    margin: 0.1,         // outer row to rail
    postW: 0.075, postH: 0.17, rodY: 0.104,
    railD: 0.06, railH: 0.1,
    radius: 0.012,
    contact: 0.3,        // contact-shadow opacity under the frame
  },
  hundred: { rowPitch: 0.135, stagger: 0.42 },
  plate: {
    W: 0.28, labelW: 0.42, d: 0.17, h: 0.085, top: 0.025, lip: 0.012, gap: 0.055,
    px: 512,
    font: '"Avenir Next Condensed", "Helvetica Neue", Arial, sans-serif',
    labelFont: '"Avenir Next", "Helvetica Neue", Arial, sans-serif',
    weight: 700,
    pop: { amp: 0.07, dur: 0.32 },     // nameplate bump when the number changes (at the landing)
  },
  divider: { w: 0.03, h: 0.022, block: 0.04, drop: 0.25, dur: 0.38 },

  // ---- the beat label: one caption card pinned to the screen (overlay = exact colours) + SAMPLE DATA stamp ---
  caption: { x: 96, y: 66, h: 96, cap: 48, font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700, card: "#fbf8f2", ink: "#23201c", rule: "#d4442c", inDur: 0.35, outDur: 0.35 },
  stamp: { text: "SAMPLE DATA", x: 1824, y: 74, cap: 26, color: "#c0392b", font: '"Avenir Next Condensed", "Helvetica Neue", Arial, sans-serif' },

  // ---- planner tuning (beads.js reads these) ----------------------------------------------------------------
  slide: {
    dur: 0.36, perBead: 0.012,   // block slide time grows a little with the group size
    arrive: 0.32,                // speed kept at contact (0 = eases to rest silently; >0 = it clacks)
    stagger: 0.24,               // "each" mode: seconds between beads
    bounce: 0.0045, hop: 0.075, hops: 3, decay: 20,   // the settle after the clack (metres, s)
  },
  sound: {
    slide: { gain: 0.09, hz: 160, hz2: 100, grit: 0.12 },
    clack: { gain: 0.44, pitch: 0.62 },
    click: { gain: 0.1, pitch: 0.45 },
    note: { gain: 0.15, base: 0.42, scale: [0, 2, 4, 7, 9], dur: 1.3 },   // marimba-like note, pitch follows the count
    bed: { gain: 0.85, root: 130.8, brightness: 900 },
    caption: { gain: 0.12 },
    emphasis: { gain: 0.16, pitch: 0.84 },
  },
  sfx: { enter: "paper", exit: "whooshOut", move: "whir", land: "clack", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "Count: beads slide from the right stack to the left stack along their rod; a group moves as one rigid block, still moving when it meets the stack, clacks and settles with tiny damped hops.",
    "One-at-a-time counting ('each'): one bead per step, one clack and one rising marimba note per bead; the nameplate ticks up on each landing.",
    "Compare: rows are bars — labelled tags on the left, the count on a desk nameplate on the right; count by fives from the two-tone beads.",
    "Carry: when a ones rod reaches ten, the ten slide back as a block and one bead moves on the tens rod.",
    "Percent: a 10x10 frame fills row by row; a brass divider bar can drop in to mark a line.",
    "Camera: a high three-quarter view looking down on the frame, one slow move per beat, ending with the frame filling the shot.",
  ],
};
