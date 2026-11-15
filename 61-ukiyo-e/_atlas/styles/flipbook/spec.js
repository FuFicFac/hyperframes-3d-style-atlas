// styles/flipbook/spec.js — STYLE_SPEC for "Flipbook". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the release plan + score) and the browser.
// Units: metres, toy-scale exaggerated: one page is 1.6 x 1.0 m so a pencil line ~1 cm wide reads at 1080p.
//
// The look: a thick pad of cream paper clamped under a walnut bar on a warm light desk. Most pages are bent back over
// the bar in a fan, pinched by a stylised thumb; the thumb lets them go one at a time and each page curls, falls toward
// the viewer and slaps flat, showing the next pencil drawing. riffle.js plans the releases (and so the sound) and draws
// every page from one story with per-page line boil.

export const STYLE_SPEC = {
  id: "flipbook",
  name: "Flipbook",
  description:
    "A hand-drawn pencil flipbook riffled under a thumb: a thick pad of cream paper clamped under a walnut bar on a warm, bright desk, most of its pages bent back over the bar in a fan pinched by a stylised thumb. The thumb lets the pages go one at a time; each page curls (real bent-page geometry: hinge angle + bend + corner twist, integrated along the page every frame), falls toward the viewer and slaps flat with a small bounce, so the pencil drawing on the pages comes to life. Every page carries its own procedural graphite drawing from one planner: bold soft-edged lines with graphite grain, light construction circles and arcs, hatching, smudges and a pencil page number, with line boil (each page's strokes wobble by a page-seeded displacement). A real pencil can finish a line on the first page. The release plan gives every flip a paper tick and slap in sync, from a slow page-by-page flip to a full-speed riffle at 12 drawings a second.",
  palette: {
    bg: "#efe6d6",
    desk: "#c99b6a",
    paper: "#f6efe0",
    paperBack: "#efe6d3",
    paperEdge: "#e4d9c3",
    graphite: "#2a2a2f",
    construct: "#8d8b88",
    board: "#7d6c58",
    bar: "#5a3b25",
    brass: "#c39a52",
    skin: "#e2a888",
    nail: "#f1cbb8",
    pencil: "#f2b632",
    ink: "#2a2a2f",
    accent: "#d4573b",
  },
  world: {
    background: "#efe6d6",
    sky: null,
    fog: { color: "#efe6d6", near: 9, far: 20 },
    environment: "room",
    environmentIntensity: 0.4,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    board: { type: "standard", baseColor: "#7d6c58", roughness: 0.9, metalness: 0 },
    bar: { type: "standard", baseColor: "#5a3b25", roughness: 0.55, metalness: 0, clearcoat: 0 },
    brass: { type: "standard", baseColor: "#c39a52", roughness: 0.32, metalness: 1 },
    skin: { type: "physical", baseColor: "#e2a888", roughness: 0.55, metalness: 0, sheen: 0.4 },
    nail: { type: "standard", baseColor: "#f1cbb8", roughness: 0.3, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fffaf0", groundColor: "#a08868", intensity: 1.15 },
    {
      // warm desk-lamp key from front-left, high: page faces stay bright, the fan throws soft shadows backward
      id: "key", type: "directional", color: "#fff1dc", intensity: 2.0, position: [-2.6, 5.4, 3.6], target: [0, 0, -0.3],
      shadow: { softness: 2.5, mapSize: 2048, extent: 2.4, near: 0.5, far: 20, bias: -0.0003, normalBias: 0.012 },
    },
    { id: "rim", type: "directional", color: "#dfe8ff", intensity: 0.45, position: [2.4, 2.6, -4.5], target: [0, 0.3, -0.5] },
  ],
  post: {
    vignette: { darkness: 0.22, offset: 1.15 },
  },
  camera: { fov: 32, near: 0.1, far: 40, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#2a2a2f", height: 0.3 },

  // ---- the pad ---------------------------------------------------------------------------------------------
  page: {
    width: 1.6, depth: 1.0,      // m (landscape page; the binding is the far long edge)
    thickness: 0.0016,           // stacking step per page
    nx: 6, ns: 26,               // bend grid (columns across, rows hinge -> free edge)
    canvas: [2048, 1280],        // drawing canvas per pooled page (px)
    pool: 8,                     // canvases: page k draws into slot k % pool
  },
  pad: { board: 0.02, base: 0.006, overhang: 0.02 },
  bar: { depth: 0.13, height: 0.05, overlap: 0.045, screwR: 0.045 },
  desk: { size: 14, wood: { boards: 4, seed: 69, grainFreq: 30, contrast: 0.22, dark: "#9a6b43", mid: "#c99b6a", light: "#ddb486", seam: "#7a5232" }, repeat: 3 },

  // ---- drawing (canvas) --------------------------------------------------------------------------------------
  drawing: {
    lineW: 0.015,               // bold line width (page units of height)
    boil: 0.0032,               // line boil amplitude (page units)
    passes: [[1.25, 0.32], [1.0, 0.6], [0.55, 0.75]],   // [width multiplier, alpha] graphite passes per stroke
    grain: 0.42,                // share of graphite knocked out by the paper-tooth mask
    construct: "#7f7c79", hatch: "#4a4a50", line: "#26262b",
    paperFibre: 0.05,
  },

  // ---- riffle (planner tuning) ----------------------------------------------------------------------------
  flip: { slow: 0.85, fast: 0.3, rateSlow: 1.5, rateFast: 12 },
  bounce: { dur: 0.16, phi: 0.05, kappa: 0.16 },
  held: { phi0: 2.0, step: 0.0035, free: 2.86 },
  fall: { lag: 0.55, twist: 0.22, accel: 0.62 },

  // ---- pencil + thumb ----------------------------------------------------------------------------------------
  pencil: { length: 1.15, radius: 0.028, tilt: [0.62, 0.76, 0.06] },
  thumb: { radius: 0.085, length: 0.42 },

  // ---- overlay caption (a strip of masking tape with pencil text, bottom centre) ----------------------------
  caption: {
    x: 960, y: 936, h: 84, cap: 40, maxW: 820,
    font: '"Noteworthy", "Marker Felt", "Avenir Next", "Helvetica Neue", sans-serif', weight: 700,
    tape: "#efe2b8", tapeEdge: "#d8c58e", ink: "#2a2a2f",
  },

  sound: {
    tick: { gain: 0.22, pitch: 1.35 },
    slap: { gain: 0.42, pitch: 1.1, thud: 0.22 },
    air: { gain: 0.16 },
    contact: { gain: 0.32, notes: [523.25, 659.25, 783.99] },
    wings: { gain: 0.16 },
    pencil: { gain: 0.75 },
    bed: { gain: 0.3, root: 196, brightness: 850 },
  },
  sfx: { enter: "tick", exit: "whooshOut", move: "paper", land: "paper", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Page shape = hinge angle + uniform bend + corner twist, integrated along the page from the binding every frame (closed form of t); never through the stack or the desk.",
    "Held pages fan back over the bar, pinched near one free-edge angle; the inner page slips out first, flicks straight, falls with its free edge lagging, slaps flat and bounces once.",
    "Each page carries its own drawing (page k = drawing k); only the settled top page and the airborne pages get a canvas (pool of 8, slot = k mod 8).",
    "Line boil: every stroke on every page is displaced by a smooth page-seeded wobble, so the drawing shimmers like real hand-drawn animation.",
  ],
};
