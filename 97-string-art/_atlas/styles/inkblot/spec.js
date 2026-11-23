// styles/inkblot/spec.js — STYLE_SPEC for "Inkblot". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the blot plan + score) and the browser.
// Units: metres, toy-scale: the card is 3.6 x 1.7 m so a pencil line ~1.6 cm wide reads at 1080p.
//
// The look: a heavy cream card on a pale blue-grey desk in bright soft daylight. Wet ink is dripped on the left half,
// the right half folds over on a real hinge, is rubbed with a wooden press, and peels open on a mirrored blot with
// feathered bleeding edges and darker pooled rims. Pencil outlines then "read" the same blot three different ways.
// HALF-SPACE: every ink / pencil coordinate is (a, b): a = distance from the centre crease (0..sheet.width/2),
// b = up the sheet (-height/2..height/2, +b = away from the viewer = world -z). Both halves evaluate the same
// function of (a, b), so the blot is mirrored by construction.

export const STYLE_SPEC = {
  id: "inkblot",
  name: "Inkblot",
  description:
    "Symmetric inkblots on heavy cream card in bright, soft daylight (original blots, not the Rorschach plates). Glossy beads of wet ink (black plus crimson and indigo) drip onto one half of an open sheet; the other half folds shut on a real hinge, a wooden press rubs it down, and the sheet peels open on a perfectly mirrored blot with noise-feathered bleeding edges, a pale capillary halo and darker pooled rims. The ink is a closed-form field (a sum of smooth elliptical blobs and voids from a seeded plan, warped by paper-fibre noise) evaluated per pixel in the card's shader in half-space, so both halves show the same function; wet ink is glossy and domed and dries to matte. Then the same blot is read several ways: pencil outlines (graphite on paper, chalk-white over ink) draw themselves on, suggest one thing, fade, and suggest another. The blot never changes, only the reading. Drip plips, the fold, the press, the peel and every pencil stroke are scored from the same plan.",
  palette: {
    bg: "#9bb5ba",
    desk: "#86a4ab",
    paper: "#f4ecd9",
    paperBack: "#efe6d2",
    paperEdge: "#e2d6bd",
    ink: "#15141a",
    crimson: "#b3122e",
    indigo: "#243a9c",
    graphite: "#2a2930",
    chalk: "#f6efe2",
    wood: "#b98a55",
    woodDark: "#7c5632",
    caption: "#1b1a20",
    captionText: "#f6efe2",
    accent: "#b3122e",
  },
  world: {
    background: "#9bb5ba",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    desk: { type: "standard", baseColor: "#86a4ab", roughness: 0.92, metalness: 0, map: { source: "noise", size: 256, scale: 28, octaves: 4, seed: 81, colorA: "#f4f7f7", colorB: "#ffffff", contrast: 1, repeat: [6, 4], description: "very faint felt mottling" } },
    paper: { type: "standard", baseColor: "#f4ecd9", roughness: 0.9, metalness: 0 },
    paperBack: { type: "standard", baseColor: "#efe6d2", roughness: 0.92, metalness: 0 },
    paperEdge: { type: "standard", baseColor: "#e2d6bd", roughness: 0.95, metalness: 0 },
    drop: { type: "physical", baseColor: "#15141a", roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 },
    wood: { type: "standard", baseColor: "#b98a55", roughness: 0.5, metalness: 0 },
    woodDark: { type: "standard", baseColor: "#7c5632", roughness: 0.45, metalness: 0 },
    felt: { type: "standard", baseColor: "#3d4a52", roughness: 1, metalness: 0 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#ffffff", groundColor: "#b7b0a2", intensity: 1.25 },
    {
      // soft window daylight from the upper left, behind the sheet: the folding flap throws its shadow toward the viewer
      id: "key", type: "directional", color: "#fff6e6", intensity: 1.9, position: [-3.2, 6.5, -2.4], target: [0, 0, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 3.2, near: 0.5, far: 20, bias: -0.0003, normalBias: 0.012 },
    },
    { id: "fill", type: "directional", color: "#e4ecff", intensity: 0.35, position: [3.5, 3, 4], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.2, offset: 1.2 },
  },
  camera: { fov: 30, near: 0.2, far: 60, drift: { amp: 0, speed: 0.3 } },
  text: { font: "serif", weight: 700, color: "#1b1a20", height: 0.3 },

  // ---- the card
  sheet: { width: 3.6, height: 1.7, thickness: 0.012, gap: 0.002, crease: { width: 0.007, shade: 0.16 }, mottle: 0.035 },

  // ---- ink look (shader knobs; lengths in metres of half-space)
  ink: {
    k: 1.6,               // blob falloff: w = exp(-k (q - 1)), q = squared normalised distance; contour at sum = 1
    distScale: 0.078,     // ln(field) -> pseudo distance (m)
    warp: 0.045,          // domain warp by low-frequency noise (m): organic lobes
    edgeLow: 0.03,        // edge displacement by mid noise (m)
    edgeFine: 0.014,      // fine feathering (m), grows with bleed
    feather: [0.004, 0.012], // edge softness wet -> bled
    halo: { width: 0.07, strength: 0.34 }, // pale capillary bleed around the blot after pressing
    rim: { width: 0.016, strength: 0.3 },  // darker pooled rim
    body: [0.985, 1.0],    // ink film opacity range inside (mottled by noise)
    noiseScale: [0.55, 3.1, 9.0], // tiles per metre for the low / mid / fine noise lookups
    wetRoughness: 0.16, dryRoughness: 0.78,
    bead: { height: 0.05, falloff: 0.035, pressed: 0.12 }, // wet dome relief (normal tilt) before / after pressing
    colors: ["#15141a", "#b3122e", "#243a9c"],
    maxBlobs: 24,
  },

  // ---- the blot (half-space). drops: the ink that is dripped (pressed shape rx, ry, rot deg; col = ink.colors index);
  // sats: small splashes that land with a parent drop; voids: paper showing through the pressed blot.
  blot: {
    seed: 81,
    scale: 0.86,       // the design below is authored at 1.0 and scaled about the crease centre
    drops: [
      { id: "wingA", a: 0.50, b: 0.36, rx: 0.42, ry: 0.26, rot: 10, col: 0 },
      { id: "body2", a: 0.0, b: -0.08, rx: 0.085, ry: 0.22, rot: 0, col: 0 },
      { id: "lowA", a: 0.46, b: -0.32, rx: 0.36, ry: 0.24, rot: -24, col: 0 },
      { id: "wingB", a: 1.0, b: 0.46, rx: 0.34, ry: 0.22, rot: 18, col: 0 },
      { id: "tip", a: 1.28, b: 0.58, rx: 0.17, ry: 0.13, rot: 25, col: 1 },
      { id: "body1", a: 0.0, b: 0.24, rx: 0.08, ry: 0.2, rot: 0, col: 0 },
      { id: "wingC", a: 1.05, b: 0.12, rx: 0.2, ry: 0.13, rot: -10, col: 2 },
      { id: "head", a: 0.0, b: 0.52, rx: 0.12, ry: 0.12, rot: 0, col: 0 },
      { id: "lowB", a: 0.8, b: -0.5, rx: 0.2, ry: 0.16, rot: -30, col: 0 },
      { id: "body3", a: 0.0, b: -0.4, rx: 0.08, ry: 0.2, rot: 0, col: 0 },
      { id: "lowC", a: 0.3, b: -0.62, rx: 0.15, ry: 0.12, rot: 0, col: 1 },
      { id: "link", a: 0.22, b: 0.14, rx: 0.13, ry: 0.1, rot: 0, col: 2 },
    ],
    sats: [
      { a: 0.2, b: 0.74, r: 0.05, col: 0, parent: "head" },
      { a: 0.33, b: 0.83, r: 0.038, col: 0, parent: "head" },
      { a: 1.5, b: 0.3, r: 0.035, col: 1, parent: "tip" },
      { a: 1.42, b: -0.12, r: 0.045, col: 2, parent: "wingC" },
      { a: 1.02, b: -0.76, r: 0.035, col: 0, parent: "lowB" },
      { a: 0.16, b: -0.76, r: 0.045, col: 1, parent: "lowC" },
      { a: 1.55, b: 0.72, r: 0.03, col: 0, parent: "wingB" },
      { a: 0.62, b: -0.78, r: 0.03, col: 0, parent: "lowA" },
    ],
    voids: [
      { a: 0.56, b: 0.37, rx: 0.11, ry: 0.075, rot: 10, strength: 1.5 },
      { a: 0.5, b: -0.33, rx: 0.06, ry: 0.05, rot: 0, strength: 1.3 },
    ],
    bead: 0.42,        // bead radius = bead x sqrt(rx ry) before pressing
    beadMin: 0.03,
  },

  // ---- timing defaults (seconds; the scene may override through createBlot)
  timing: {
    drip: { first: 0.3, last: 2.45, fall: 0.32, height: 2.4, pop: 0.22 },
    fold: { start: 2.85, shut: 3.75 },
    press: { start: 3.85, end: 5.0, rubs: 3 },
    peel: { start: 5.15, open: 6.4 },
    dry: 4.2,          // wet sheen e-folding time after the peel (s)
    bleed: 2.4,        // capillary bleed time constant after the peel (s)
    read: { draw: 1.35, hold: 0.65, fade: 0.3, gap: 0.12 },
  },

  // ---- pencil readings
  pencil: { width: 0.02, sketch: 0.006, pxPerMetre: 560, tooth: 0.3, opacity: 0.95 },

  // ---- press (a wooden rubbing disc)
  press: { radius: 0.3, height: 0.07, knob: 0.11 },

  caption: { cap: 54, h: 96, y: 944, font: "Georgia, 'Times New Roman', serif", weight: 700 },

  sound: {
    plip: { gain: 0.5 },
    fold: { gain: 0.5 },
    slap: { gain: 0.42 },
    rub: { gain: 0.34 },
    squelch: { gain: 0.3 },
    peel: { gain: 0.42 },
    pencil: { gain: 0.7 },
    read: { gain: 0.2, notes: [392, 493.88, 587.33] },
    bed: { gain: 0.3, root: 196, brightness: 800 },
  },
  sfx: { enter: "bubble", exit: "paper", move: "paper", land: "thud", emphasis: "chime", ui: "penScratch", bed: "pad" },
  motion: [
    "Ink is a closed-form field in half-space (a = distance from the crease, b = up the sheet): both halves evaluate the same sum of blobs, so the blot is mirrored by construction.",
    "Drops fall and land as glossy round beads on one half; the other half folds over on a hinge (angle from the plan), is rubbed down, and peels open; the blobs spread to their pressed shapes only while the card is shut.",
    "After the peel the edge keeps feathering (capillary bleed) and the wet sheen dries to matte over a few seconds.",
    "Readings: pencil outlines draw on stroke by stroke (order baked into a texture channel), graphite on paper and chalk-white over ink; one reading at a time, the blot itself never changes.",
    "Camera: three locked shots (drip, fold, top-down read) with one move between each.",
  ],
};
