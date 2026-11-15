// styles/newspaper-press/spec.js — STYLE_SPEC for "Newspaper Press". Plain data only (JSON-safe, no THREE, no window).
// A broadsheet front page as a physical object on a print-shop imposing table: warm newsprint with show-through and
// fold creases, heavy black serif headlines, column rules, greeked justified body text, procedural halftone photographs.
// Units: metres, Y-up, sRGB hex, radians. Page coordinates: origin = page centre, x right, y up the page.
export const STYLE_SPEC = {
  id: "newspaper-press",
  name: "Newspaper Press",
  description:
    "A broadsheet front page as a physical object: warm newsprint with show-through and fold creases, heavy black serif headlines, column rules, greeked justified body text and procedural halftone photos — spun in, printed live by an ink roller, circled in red grease pencil.",
  palette: {
    bg: "#24272a",
    desk: "#3a3d40",
    paper: "#efe9da",
    paperEdge: "#d9d0ba",
    ink: "#1a1918",
    red: "#c42a1f",
    steel: "#8a8f94",
    rubber: "#141414",
  },
  world: {
    background: "#24272a",
    environment: "room",
    environmentIntensity: 0.18,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    desk: { type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0.25 },
    rubber: { type: "physical", baseColor: "#121212", roughness: 0.32, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3 },
    steel: { type: "standard", baseColor: "#9aa0a6", roughness: 0.32, metalness: 1 },
    grip: { type: "standard", baseColor: "#5a3a22", roughness: 0.55, metalness: 0 },
    wax: { type: "standard", baseColor: "#c42a1f", roughness: 0.5, metalness: 0 },
    wrapper: { type: "standard", baseColor: "#b02a20", roughness: 0.75, metalness: 0 },
    paperEdge: { type: "standard", baseColor: "#ffffff", roughness: 0.95, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#f6f2ea", groundColor: "#2b2a28", intensity: 1.05 },
    {
      id: "key", type: "directional", color: "#fff6e8", intensity: 2.6, position: [-1.4, 2.6, -0.9], target: [0, 0, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 1.0, near: 0.5, far: 6, bias: -0.0002, normalBias: 0.004 },
    },
  ],
  post: {
    vignette: { darkness: 0.42, offset: 1.05 },
  },
  camera: { fov: 30, near: 0.04, far: 12, drift: { amp: 0, speed: 0.18 } },
  text: { font: "serif", weight: 700, color: "#1a1918", height: 0.04 },

  // ---- the sheet (front page) ----------------------------------------------------------------------------
  page: {
    W: 0.58, H: 0.74,            // broadsheet-ish portrait sheet, metres
    ppm: 4200,                   // texture pixels per metre (raise per page via opts.ppm when the camera pushes in close)
    margin: 0.022,
    cols: 6, gutter: 0.0062,
    linePitch: 0.0034,           // body leading (≈ 9.6 pt)
    bodyEm: 0.0027,              // body type size
    foldY: 0,                    // horizontal fold (page y)
    segments: [44, 72],          // mesh segments (x, y): page turn + fold ridge
    ridge: 0.0016,               // fold tent height (m)
    ridgeWidth: 0.035,
    waviness: 0.0012,            // low-frequency sheet undulation (m)
    cornerLift: 0.0025,          // free corners curl up (m)
    seed: 7,
  },
  fonts: {
    masthead: '"Bodoni 72", Didot, Georgia, serif',
    headline: 'Charter, "Times New Roman", Georgia, serif',
    deck: 'Charter, Georgia, serif',
    body: '"Times New Roman", Times, Georgia, serif',
    label: '"Times New Roman", Times, Georgia, serif',
    headlineWeight: 900, mastheadWeight: 700,
    capRatio: 0.70,              // cap height / em (planner model)
    capWidth: 0.66,              // average cap advance / em (planner model; painter fits to the planned width)
    fitRange: [0.7, 1.12],       // horizontal scale range the painter may use to fill a planned width
  },
  paper: {
    base: "#efe9da",
    fiber: 0.05, grain: 0.035, tile: 0.14, seed: 21,
    showThrough: 0.085,          // darkening from the other side's print
    showBias: 3.2,               // mip bias for the show-through blur
    foldDark: 0.14, foldWidth: 0.0016,
    quarterFoldDark: 0.05,
  },
  ink: {
    color: "#1a1918",
    density: 0.93,
    headSoft: 0.004,             // soft edge of the live ink pass (fraction of page height)
    wetBand: 0.07, wetRough: 0.32, wet: 0.85,
    roughness: 0.92,
  },
  halftone: {
    pitch: 0.0034,               // dot cell (m): ≈ 9–10 px at the full-width shot; coarse on purpose (no moiré, cheap to encode)
    angle: 0.7854,               // 45°
    developFloor: 0.14,          // dot size when first printed; develop grows it to full tone
    flatBelowPx: [2.2, 4.5],     // dots fade to flat tone when a cell is smaller than this many screen pixels (anti-moiré)
  },
  spin: { turns: 1.25, tilt: 0.55, startScale: 0.05, wobble: 0.025 },
  turn: { bend: 1.1, cornerLead: 0.35, lift: 0.012 },
  roller: { r: 0.024, len: 0.64, handle: 0.22, approach: 0.28, exit: 0.3 },
  grease: { width: 0.0026, wax: 0.55, cap: 0.6, lift: 0.06, leadIn: 0.28, leadOut: 0.4 },
  stack: { sheets: 36, thick: 0.013, drop: 0.32, bounce: 0.0025 },
  sound: {
    spin: { gain: 0.42, pitch: 0.9 },
    land: { gain: 0.6, pitch: 0.7 },
    turn: { gain: 0.5, pitch: 0.8 },
    roll: { gain: 0.36, hz: 62, hz2: 70 },
    press: { gain: 0.07, every: 0.32 },
    develop: { gain: 0.16 },
    pencil: { gain: 0.5, pitch: 0.55, speed: 0.75 },
    drop: { gain: 0.75, pitch: 0.55 },
    bed: { gain: 0.52, root: 98, brightness: 650 },
  },
  sfx: { enter: "whoosh", exit: "paper", move: "whoosh", land: "thud", emphasis: "penScratch", ui: "click", bed: "pad" },
  motion: [
    "Spin-in: the page spins in from depth about the frame centre (1¼ turns, decelerating), its tilt settles, and it lands flat with a soft thud and a 2 mm camera kick.",
    "Ink pass: a rubber roller rolls down the sheet; headline, rules, columns and photo appear behind its contact line, with a wet sheen that dries in ~0.4 s.",
    "Develop: a printed halftone starts as pin-prick dots and the dots grow to full tone over ~1.2 s.",
    "Emphasis: the camera pushes into a column and a red grease pencil loops a key line (one overshooting hand-drawn ellipse).",
    "Scene changes: the top page turns over with a curl, or a bundle of papers thumps down onto the stack.",
    "Camera: top-down with a small forward tilt (≤ 25°), holds while things print; one move per beat.",
  ],
};
