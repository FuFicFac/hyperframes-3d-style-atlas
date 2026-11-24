// styles/caustics/spec.js — STYLE_SPEC for "caustics". Plain data only: JSON-serializable, no THREE, no window.
// Units: metres, Y-up right-handed, colours sRGB hex, angles radians, three.js light units.
// The optics (target picture, stirring, ray grid, glass slope) are planned by caustic.js; every number lives here.

export const STYLE_SPEC = {
  id: "caustics",
  name: "Caustics",
  description:
    "A sunlit room (white table, slate-blue wall): a clear, lumpy aqua glass slab in a slim steel frame rides a vertical brass rail above a white tabletop. A warm beam comes straight down through it. Close to the table the light is an even patch; as the slab rises the patch swirls into bright curved lines and dark gaps, and at exactly one height it unwinds into a white-hot picture on a dim ground while the room light falls. The light on the table is the glass's own ray mesh warped by its deflection field (light conserved per triangle: brightness = area on the glass / area on the table), so folds make real caustic lines, and the slab's bumps are shaded from the same field.",
  palette: {
    bg: "#efe9df",
    wall: "#8aa2b2",
    table: "#fbf8f2",
    ink: "#1b2a33",
    glass: "#bdeee4",
    glassEdge: "#2c8c82",
    brass: "#c9a24a",
    steel: "#aeb6bd",
    beam: "#ffcf86",
    shadow: "#8fa9c7",
    caption: "#fffaf0",
    accent: "#f0a030",
  },
  world: {
    background: "#efe9df",
    fog: null,
    environment: "room",
    environmentIntensity: 0.3,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    brass: { type: "physical", baseColor: "#c9a24a", roughness: 0.3, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.2 },
    steel: { type: "physical", baseColor: "#e6e9ec", roughness: 0.45, metalness: 0.55 },
    darkSteel: { type: "physical", baseColor: "#b38f3e", roughness: 0.35, metalness: 1 },
    lampBody: { type: "physical", baseColor: "#f3efe6", roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 },
    knob: { type: "standard", baseColor: "#1f2326", roughness: 0.5, metalness: 0.1 },
    tableEdge: { type: "standard", baseColor: "#a8754a", roughness: 0.65, metalness: 0 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#c4d8ff", groundColor: "#efe2cf", intensity: 0.4 },
    {
      id: "sun", type: "directional", color: "#fff0da", intensity: 1.15, position: [-1.6, 2.6, 2.0], target: [0, 0, -0.2],
      shadow: { softness: 3, mapSize: 2048, extent: 1.3, bias: -0.0004, normalBias: 0.02 },
    },
    { id: "fill", type: "directional", color: "#d2e2ff", intensity: 0.06, position: [2.5, 1.5, 2.5], target: [0, 0.2, 0] },
    { id: "window", type: "directional", color: "#fff4e2", intensity: 0.3, position: [-0.8, 1.1, -2.6], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.38, radius: 0.06, threshold: 2.8 },
    vignette: { darkness: 0.18, offset: 1.2 },
    grain: { amount: 0.01, fps: 30 },
  },
  camera: { fov: 38, near: 0.03, far: 30, drift: { amp: 0.0025, speed: 0.3 } },
  text: { font: "sans", weight: 800, color: "#1b2a33", height: 0.05 },
  sfx: { enter: "pop", exit: "whooshOut", move: "servo", land: "click", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "Glass height d(t) is the only optical input: every ray lands at glass point + (d / focus height) x its deflection.",
    "The slab rises on its rail with an inOutSine climb, then an outCubic final approach that locks at the focus height.",
    "Camera: one move per beat; looks down at the table while the light changes; one wide at the end shows slab and picture.",
  ],

  // ---- the set ---------------------------------------------------------------------------------------------------------
  set: {
    table: { w: 2.3, d: 1.9, thick: 0.05, z: -0.3, roughness: 0.8 },
    wall: { z: -1.6, w: 7, h: 3.6, base: "#6f8a9c", glow: "#f1e2c8", glowAt: [-0.9, 1.3], glowR: [1.2, 0.85], shade: "#38505f" },
  },

  // ---- the optics: the planner's inputs --------------------------------------------------------------------------------
  /** target picture: a smiling sun in picture units (square side 1, centred, y up); brightness floor..1 */
  target: {
    n: 256, floor: 0.02, scale: 0.95, blur: 0,
    disc: 0.235, rays: 12, rayPhase: 0.2618, ray0: 0.3, ray1: 0.445, rayW0: 0.034, rayW1: 0.022,
    eyeX: 0.082, eyeY: 0.058, eyeRx: 0.034, eyeRy: 0.048,
    smileY: 0.018, smileR: 0.128, smileA0: 3.65, smileA1: 5.77, smileW: 0.026,
  },
  /** exact area-preserving twists of the unit square (scramble WHERE rays land on the way to focus): centre c, radius r,
   *  angle A (radians at the centre), profile exponent p (angle = A (1 - (d/r)^(2p))^2). Applied in order. */
  stir: {
    amount: 1.0,
    twists: [
      { c: [0.5, 0.5], r: 0.5, A: 3.0, p: 2 },
      { c: [0.38, 0.6], r: 0.2, A: -1.4 },
      { c: [0.64, 0.38], r: 0.2, A: 1.4 },
    ],
  },
  /** the ray mesh: n x n nodes, regular in stirred space */
  rays: { n: 641, lines: { grid: 22, color: "#ffe2b0", opacity: 0.22, top: 0.35 } },
  /** glass surface from the deflection field: slope per unit deflection (normal map), normal grid, height integral */
  glass: { slope: 1.5, normalGrid: 192, heightGrid: 97, heightIters: 240 },

  /** the optical bench: glass size, focus height, caustic render target */
  optic: {
    W: 0.6,            // glass side = light patch side (m)
    thick: 0.026,      // glass thickness
    focus: 0.45,       // glass height (bottom face above the table) where the picture is sharp
    margin: 1.4,       // the caustic target covers margin x W (over-focus spills outside the square)
    rt: 2048,          // caustic render target (px per side)
    cap: 24,           // brightness cap at fold lines (x even level)
    samples: 4,        // MSAA on the caustic target: thin sheared triangles cover pixels fairly (no speckle)
    blur: 0.6,         // table sampling offset in texels (4 bilinear taps)
    beam: 1.4,         // beam radiance on the table (x albedo) for even light
    sharpWidth: 0.07,  // focus sharpness = exp(-((s - 1) / sharpWidth)^2)
  },

  // ---- the rig ----------------------------------------------------------------------------------------------------------
  rig: {
    frame: { bar: 0.01, h: 0.024, gap: 0.002 },
    fork: { off: 0.02, w: 0.012, h: 0.022, pinR: 0.008, pinL: 0.024 },
    rail: { x: -0.395, z: -0.37, r: 0.013, top: 1.42, baseR: 0.06, baseH: 0.012 },
    carriage: { w: 0.085, h: 0.1, d: 0.07, knobR: 0.016 },
    lamp: { y: 1.24, w: 0.7, h: 0.09, panel: "#fff3d6", armR: 0.012 },
    shaft: { opacity: 0.05, color: "#ffe2b0" },
    edgeBand: { w: 0.016, color: "#0a3d39", opacity: 0.78 }, // dark refracted line just inside the slab's rim
    bumpHeight: 0.004, // visible lumps on the glass top (from the integrated height field)
  },

  // ---- what the glass reflects (its own environment: a pale room with a big window behind the bench) -----------
  reflect: {
    room: "#b9c4cc", roomLevel: 0.07, pos: [-1.2, 1.6, -5.5], size: [6.0, 3.4], panes: [5, 3], mullion: 0.07,
    skyTop: "#a9cdff", skyLow: "#fff0d2", level: 2.6, sigma: 0.01,
    lamp: { y: 3.8, size: 1.6, color: "#fff1d8", level: 1.6 },
  },

  // ---- glass look ---------------------------------------------------------------------------------------------------------
  look: {
    glass: { color: "#4fc6b2", alphaFace: 0.26, alphaRim: 0.7, fresnelPower: 2.0, rim: "#ffffff", rimStrength: 0.5, innerGlow: 0.16, toLight: [-0.4, 1, 0.6], normalScale: 1.0, envIntensity: 1.35 },
    edge: { color: "#0d4a45", emissive: "#4fd8c4", glow: 0.8, roughness: 0.1 },
  },

  // ---- overlay caption (top right, exact colours) ------------------------------------------------------------------------
  caption: {
    right: 1830, y: 44, h: 142, cap: 80, maxW: 1500,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 800,
    plate: "#fffaf0", ink: "#0f1a22", edge: "#0f1a22", accent: "#f0a030", icon: "#1f7a70",
  },

  sound: {
    bed: { gain: 0.62, root: 196, dark: 520, bright: 2600, seg: 2.2, hop: 1.1 },
    click: { gain: 0.9 },
    servo: { gain: 0.22 },
    glint: { gain: 0.34 },
    focus: { gain: 1.05 },
    detune: { gain: 0.34, pitch: 1.035 },
    settle: { gain: 0.45 },
  },
};
