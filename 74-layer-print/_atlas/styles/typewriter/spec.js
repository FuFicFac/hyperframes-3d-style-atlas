// styles/typewriter/spec.js — STYLE_SPEC for the "typewriter" style. Plain data only: JSON-serializable, no THREE,
// no window. Importable from Node (export-spec.mjs, typeplan.js) and the browser.
// Units: "metres" at about 10x life size (the machine is 3.4 wide) so it sits at the kit's usual camera distances.
// Y-up right-handed, the typist (and the camera) on +Z. Colours sRGB hex, angles radians, three.js light units.

export const STYLE_SPEC = {
  id: "typewriter",
  name: "Typewriter",
  description:
    "A generic mid-century manual typewriter (no brand marks) on a pale wooden desk in daylight, shot close: sea-green enamel body, round cream keys in chrome rings, a U-shaped basket of steel type bars, a two-colour inked ribbon between two spools, cream paper on a black rubber platen. Words appear on the paper one struck letter at a time: the key dips, its type bar swings up and hits the print point, the ribbon lifts, the inked glyph is there when the bar falls back, and the carriage steps one column left. At the end of a line the bell rings, the lever throws the carriage back and the paper feeds up a line. Every strike, space, bell, ratchet tick and carriage stop is a sound cue from the same typing plan that drives the picture.",
  palette: {
    bg: "#efe6d6",
    wall: "#f1e9da",
    desk: "#d2a676",
    enamel: "#4f9488",
    enamelDark: "#23292b",
    chrome: "#e8ecef",
    steel: "#9aa0a6",
    rubber: "#19191b",
    keycap: "#f3ead6",
    paper: "#f7f0dd",
    ink: "#1d1b22",
    inkRed: "#b8281f",
    accent: "#e2a12b",
  },
  world: {
    background: "#efe6d6",
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    desk: {
      type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0,
      map: { source: "wood", size: 1024, boards: 4, seed: 31, grainFreq: 18, contrast: 0.32, dark: "#b68a5c", mid: "#cfa474", light: "#e2bf92", seam: "#9c7448", repeat: [3, 2.4], description: "pale oak planks running left-right" },
    },
    wall: { type: "standard", baseColor: "#f1e9da", roughness: 1, metalness: 0 },
    enamel: { type: "physical", baseColor: "#4f9488", roughness: 0.34, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.18 },
    enamelDark: { type: "standard", baseColor: "#23292b", roughness: 0.8, metalness: 0.1 },
    chrome: { type: "standard", baseColor: "#e8ecef", roughness: 0.2, metalness: 1 },
    steel: { type: "standard", baseColor: "#9aa0a6", roughness: 0.38, metalness: 0.9 },
    rubber: { type: "standard", baseColor: "#19191b", roughness: 0.85, metalness: 0 },
    bakelite: { type: "physical", baseColor: "#1c1a1a", roughness: 0.35, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3 },
    keycap: { type: "standard", baseColor: "#f3ead6", roughness: 0.45, metalness: 0 },
    paper: { type: "standard", baseColor: "#ffffff", roughness: 0.92, metalness: 0, side: "double", map: { source: "paper", size: 512, base: "#f7f0dd", fiber: 0.035, grain: 0.03, seed: 5, variant: "even", description: "cream bond paper, even fibre" } },
    paperPlain: { type: "standard", baseColor: "#f4ecd8", roughness: 0.92, metalness: 0 },
    mug: { type: "physical", baseColor: "#e9e2d2", roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 },
    pencil: { type: "standard", baseColor: "#e2a12b", roughness: 0.5, metalness: 0 },
    pencilWood: { type: "standard", baseColor: "#e3c79d", roughness: 0.8, metalness: 0 },
    graphite: { type: "standard", baseColor: "#2a2a2e", roughness: 0.5, metalness: 0.3 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#ffffff", groundColor: "#e4d2b4", intensity: 1.0 },
    {
      // window daylight from front-left and above: lights the page face-on, short soft shadows to the back-right
      id: "key", type: "directional", color: "#fff3df", intensity: 2.9, position: [-4.5, 7.5, 5.5], target: [0, 1, -0.2],
      shadow: { softness: 3, mapSize: 2048, extent: 4.6, near: 0.5, far: 30, bias: -0.0006, normalBias: 0.03 },
    },
    { id: "rim", type: "directional", color: "#eaf2ff", intensity: 1.1, position: [5, 5, -6], target: [0, 1, 0] },
  ],
  post: {
    vignette: { darkness: 0.2, offset: 1.2 },
  },
  camera: { fov: 30, near: 0.3, far: 80, drift: { amp: 0, speed: 0.2 } },
  text: { font: '"Courier New", Courier, monospace', weight: 700, color: "#1d1b22", height: 0.3 },
  sfx: { enter: "clack", exit: "whooshOut", move: "rustle", land: "thud", emphasis: "marimba", ui: "tick", bed: "pad" },
  motion: [
    "One struck letter at a time: key dips, its type bar swings from the basket to the print point (about 0.1 s up, 0.14 s back), the ribbon lifts, the glyph is on the paper when the bar falls away, the carriage steps one column left.",
    "Line end: bell, then the return lever throws the carriage back to the left margin (0.5 s) while the platen ratchets the paper up one line.",
    "Strike times are snapped to frames so the bar is at the paper on a rendered frame; nothing eases in or fades — ink is either struck or not.",
    "Camera: slow moves fitted to the page + machine; it follows the carriage smoothly, never the single steps.",
  ],

  // ---- the machine (metres at ~10x life size; origin on the desk under the middle of the body) --------------
  machine: {
    width: 3.4,                         // body width (x)
    deck: [[2.05, 0.04], [2.05, 0.2], [1.92, 0.3], [0.42, 0.56], [-1.5, 0.56], [-1.5, 0.04]],   // side profile [z, y]
    shoulder: { x: 1.275, w: 0.85, y0: 0.5, y1: 1.0, z0: -0.72, z1: 0.45, radius: 0.09 },
    rail: { z0: -1.48, z1: -0.74, y1: 0.86 },
    printPoint: [0, 1.3, -0.9],         // where every type bar hits the paper
    paperTilt: 0.35,                    // the sheet leans back this much from vertical (rad)
    platen: { r: 0.2, length: 3.0, knobR: 0.27, knobL: 0.16 },
    carriage: { w: 3.2, h: 0.14, d: 0.62, endW: 0.08, endH: 0.52, endD: 0.62 },
    basket: { R: 0.7, d: 0.14, spread: 1.05, rest: 1.83, barW: 0.03, barT: 0.016, slug: [0.06, 0.09, 0.05], tube: 0.055 },
    ribbon: { h: 0.13, restBelow: 0.17, off: 0.024, half: 0.2, post: [0.9, -0.8], spool: [1.27, -0.42], spoolR: 0.3, spoolH: 0.14 },
    bail: { up: 0.122, r: 0.016, roller: 0.045, rollerX: 1.21 },
    rest: { w: 2.3, y0: 0.24, y1: 1.0, back: 0.03 },
    lever: { pivot: [-1.6, 1.5, -0.95], len: 0.95, yaw: -0.55, swing: 0.5 },
    bell: { pos: [-1.3, 1.0, 0.16], r: 0.13 },
    paper: { w: 2.6, top: 0.34, below: 0.12 },   // sheet width, top margin above the first line, tuck below the print line
  },
  keyboard: {
    rows: ["234567890-", "QWERTYUIOP", "ASDFGHJKL;", "ZXCVBNM,.?"],
    pitch: 0.265,
    stagger: [-0.1, 0, 0.07, 0.2],
    y: [0.82, 0.71, 0.6, 0.49],
    z: [0.72, 0.98, 1.24, 1.5],
    tilt: 0.3,
    capR: 0.1, topR: 0.084, capH: 0.035, stem: 0.3,
    glyphH: 0.17,
    space: { w: 1.55, h: 0.06, d: 0.17, y: 0.4, z: 1.77 },
    depth: 0.085,
  },
  // ---- the typed page ---------------------------------------------------------------------------------------
  page: {
    cols: 14,            // characters per line (big type: a 14-column page)
    pitch: 0.16,         // column pitch
    lineHeight: 0.27,
    em: 0.265,           // glyph em size on the paper (cap height ~0.57 em)
    jitter: { x: 0.006, y: 0.008, rot: 0.02, ink: 0.08 },   // seeded per-character misregistration and ink density
  },
  glyphs: { chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;?-:!'", cellW: 96, cellH: 128, px: 100, cols: 8, speckle: 0.1 },
  // ---- typing mechanics (seconds) ---------------------------------------------------------------------------
  typing: {
    jitter: 0.22, minGap: 0.1, seed: 72,
    barRise: 0.1, barFall: 0.14,
    keyLead: 0.11, keyBottom: 0.02, keyUp: 0.12,
    stepDelay: 0.02, stepDur: 0.05,
    ribbonRise: 0.07, ribbonFall: 0.1,
    bellAfter: 0.13, returnAfter: 0.26, returnDur: 0.5, feedDur: 0.22, feedTicks: 4, afterReturn: 0.16,
    spoolStep: 0.14,
  },
  sound: {
    bed: { root: 110, chord: [0, 7, 12, 16], brightness: 520, gain: 0.34 },
    strike: { clack: 0.55, thud: 0.34 },
    space: { thud: 0.3, tick: 0.2 },
    bell: { hz: 2093, decay: 0.5, gain: 0.5 },
    ret: { zip: 0.38, tick: 0.22, stop: 0.5 },
  },
};
