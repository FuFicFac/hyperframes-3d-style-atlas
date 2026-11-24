// styles/caustics/spec.js — STYLE_SPEC for "caustics". Plain data only: JSON-serializable, no THREE, no window.
// Units: metres, Y-up right-handed, colours sRGB hex, angles radians, three.js light units.
// The optics (target picture, stirring, ray grid, glass slope) are planned by caustic.js; every number lives here.

export const STYLE_SPEC = {
  id: "caustics",
  name: "Caustics",
  description:
    "A sunlit pale room: a clear, gently lumpy aqua glass slab in a slim steel frame rides a vertical brass rail above a white tabletop. A warm beam comes straight down through it. Close to the table the light is an even patch; as the slab rises the patch swirls into bright curved lines and dark gaps, and at exactly one height it unwinds into a picture. The light on the table is the glass's own ray mesh warped by its deflection field (light conserved per triangle: brightness = area on the glass / area on the table), so folds make real caustic lines, and the slab's bumps are shaded from the same field.",
  palette: {
    bg: "#efe9df",
    wall: "#f1ebe2",
    table: "#fbf8f2",
    ink: "#1b2a33",
    glass: "#bdeee4",
    glassEdge: "#2c8c82",
    brass: "#c9a24a",
    steel: "#aeb6bd",
    beam: "#ffe7bd",
    shadow: "#8fa9c7",
    caption: "#fffaf0",
    accent: "#f0a030",
  },
  world: {
    background: "#efe9df",
    fog: null,
    environment: "room",
    environmentIntensity: 0.6,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    brass: { type: "physical", baseColor: "#c9a24a", roughness: 0.3, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.2 },
    steel: { type: "physical", baseColor: "#c3cbd2", roughness: 0.28, metalness: 1 },
    darkSteel: { type: "standard", baseColor: "#3b4247", roughness: 0.45, metalness: 0.7 },
    lampBody: { type: "physical", baseColor: "#f3efe6", roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 },
    knob: { type: "standard", baseColor: "#1f2326", roughness: 0.5, metalness: 0.1 },
    tableEdge: { type: "standard", baseColor: "#e6dfd3", roughness: 0.8, metalness: 0 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#dfeaff", groundColor: "#f3e7d6", intensity: 1.2 },
    {
      id: "sun", type: "directional", color: "#fff0da", intensity: 1.9, position: [-1.6, 2.2, 2.6], target: [0, 0, -0.2],
      shadow: { softness: 6, mapSize: 2048, extent: 1.3, bias: -0.0004, normalBias: 0.02 },
    },
    { id: "fill", type: "directional", color: "#d2e2ff", intensity: 0.35, position: [2.5, 1.5, 2.5], target: [0, 0.2, 0] },
  ],
  post: {
    bloom: { strength: 0.3, radius: 0.5, threshold: 2.0 },
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
    table: { w: 3.4, d: 2.6, thick: 0.05, z: -0.25, roughness: 0.8 },
    wall: { z: -1.45, w: 7, h: 3.6, base: "#efe7dc", glow: "#fff6e8", glowAt: [-0.9, 1.3], glowR: [1.6, 1.1], shade: "#ddd3c6" },
  },

  // ---- the optics: the planner's inputs --------------------------------------------------------------------------------
  /** target picture: a smiling sun in picture units (square side 1, centred, y up); brightness floor..1 */
  target: {
    n: 256, floor: 0.08, scale: 1.0,
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
  rays: { n: 321 },
  /** glass surface from the deflection field: slope per unit deflection (normal map), normal grid, height integral */
  glass: { slope: 0.42, normalGrid: 192, heightGrid: 97, heightIters: 240 },

  /** the optical bench: glass size, focus height, caustic render target */
  optic: {
    W: 0.6,            // glass side = light patch side (m)
    thick: 0.026,      // glass thickness
    focus: 0.55,       // glass height (bottom face above the table) where the picture is sharp
    margin: 1.4,       // the caustic target covers margin x W (over-focus spills outside the square)
    rt: 2048,          // caustic render target (px per side)
    cap: 60,           // brightness cap at fold lines (x even level)
    blur: 0.9,         // table sampling offset in texels (4 bilinear taps)
    beam: 1.05,        // beam radiance on the table (x albedo) for even light
    sharpWidth: 0.07,  // focus sharpness = exp(-((s - 1) / sharpWidth)^2)
  },

  // ---- the rig ----------------------------------------------------------------------------------------------------------
  rig: {
    frame: { bar: 0.014, h: 0.032, gap: 0.002 },
    fork: { off: 0.02, w: 0.012, h: 0.022, pinR: 0.008, pinL: 0.024 },
    rail: { z: -0.47, r: 0.014, top: 1.42, baseR: 0.085, baseH: 0.014 },
    carriage: { w: 0.085, h: 0.1, d: 0.07, knobR: 0.016 },
    lamp: { y: 1.24, w: 0.7, h: 0.09, panel: "#fff3d6", armR: 0.012 },
    shaft: { opacity: 0.05, color: "#ffe9c4" },
    bumpHeight: 0.0022, // visible lumps on the glass top (from the integrated height field)
  },

  // ---- glass look ---------------------------------------------------------------------------------------------------------
  look: {
    glass: { color: "#c8f2ea", alphaFace: 0.1, alphaRim: 0.62, fresnelPower: 2.2, rim: "#ffffff", rimStrength: 0.42, innerGlow: 0.12, toLight: [-0.4, 1, 0.6], normalScale: 1.0, envIntensity: 1.3 },
    edge: { color: "#2a8a80", emissive: "#5fe0cf", glow: 0.55, roughness: 0.12 },
  },

  // ---- overlay caption (top right, exact colours) ------------------------------------------------------------------------
  caption: {
    right: 1826, y: 58, h: 96, cap: 50, maxW: 900,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#fffaf0", ink: "#1b2a33", accent: "#f0a030", icon: "#2c8c82",
  },

  sound: {
    bed: { gain: 0.5, root: 196, dark: 520, bright: 2600, seg: 2.2, hop: 1.1 },
    click: { gain: 0.55 },
    servo: { gain: 0.16 },
    glint: { gain: 0.16 },
    focus: { gain: 0.42 },
    detune: { gain: 0.28, pitch: 1.035 },
    settle: { gain: 0.2 },
  },
};
