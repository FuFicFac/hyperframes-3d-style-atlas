// styles/terrarium/spec.js — STYLE_SPEC for "Terrarium": a sealed glass bottle garden on a sunlit windowsill.
// A thick clear jar (screen-space refraction of a same-frame pre-render, Fresnel window reflections, thick-wall rim
// lines, a cork) holds visible strata (pebbles, charcoal, soil), moss, ferns and small plants; condensation beads on
// the inner glass and runs back into the soil; daylight with leaf shadows passes to night and back.
// Plain data only (JSON-serializable, no THREE, no window). Units: metres, Y-up, sRGB hex, radians, three.js light units.

export const STYLE_SPEC = {
  id: "terrarium",
  name: "Terrarium",
  description:
    "A sealed glass bottle garden on a sunlit windowsill: a thick clear jar with rim highlights and a cork, visible strata (pebbles, charcoal, soil) poured in band by band, moss cushions, unfurling ferns and leafy stems growing on a seeded plan, condensation that beads on the inner glass and runs back into the soil, soft daylight through a window with leaf shadows that passes to night and back; hand-lettered paper tags on string as labels.",
  palette: {
    bg: "#d9d2c3",
    wall: "#e4dccb",
    wallShade: "#b9ae98",
    sill: "#efe9dc",
    frame: "#f3efe6",
    paper: "#efe2c4",
    paperEdge: "#c9b48a",
    ink: "#2e2418",
    string: "#9a7b52",
    pebble: ["#b9b1a3", "#8f877b", "#d2c8b6", "#a0917c", "#6f6a62"],
    charcoal: "#24221f",
    soil: "#4a3424",
    soilWet: "#2c1e14",
    moss: ["#5d8a2e", "#4a7426", "#7aa53a", "#3d6322"],
    fern: "#4f8a34",
    leaf: ["#3f7a3a", "#5c9a45", "#2f6532"],
    vine: "#4c7f30",
    cork: "#b98a55",
    sky: "#cfe3f0",
    night: "#1d2a44",
    primary: "#5c9a45",
    secondary: "#4a3424",
    accent: "#e9a94b",
  },
  world: {
    background: "#d9d2c3",
    environment: null,
    toneMapping: "neutral",        // paper tags, plaster and greens read as designed (ACES greys paper)
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    wall: { type: "standard", baseColor: "#e4dccb", roughness: 0.95, metalness: 0 },
    sill: { type: "standard", baseColor: "#efe9dc", roughness: 0.6, metalness: 0 },
    frame: { type: "standard", baseColor: "#f3efe6", roughness: 0.55, metalness: 0 },
    plaster: { type: "standard", baseColor: "#e6dfcf", roughness: 0.92, metalness: 0 },
    cork: { type: "standard", baseColor: "#b98a55", roughness: 0.9, metalness: 0 },
    stem: { type: "standard", baseColor: "#4f7f2c", roughness: 0.62, metalness: 0 },
    leaf: { type: "standard", baseColor: "#ffffff", roughness: 0.5, metalness: 0, side: "double" },
    moss: { type: "standard", baseColor: "#ffffff", roughness: 0.85, metalness: 0, vertexColors: true },
    rock: { type: "standard", baseColor: "#8d867a", roughness: 0.88, metalness: 0, flatShading: true },
    string: { type: "standard", baseColor: "#9a7b52", roughness: 0.95, metalness: 0 },
    wood: { type: "standard", baseColor: "#8a6440", roughness: 0.8, metalness: 0 },
  },
  lights: [
    { id: "room", type: "hemisphere", color: "#f3efe6", groundColor: "#a39680", intensity: 1.25 },
    // the sun: a spot from outside the window (behind the jar), leaf-gobo map + soft shadows; style.js drives it from dayCycle
    { id: "sun", type: "spot", color: "#fff1d6", intensity: 900, position: [-4.5, 8.5, -9.5], target: [0.2, 0.6, 0.4], angle: 0.36, penumbra: 0.55, distance: 40, decay: 2,
      shadow: { softness: 5, mapSize: 2048, bias: -0.0003, normalBias: 0.02 } },
    // soft room fill from the camera side so the strata facing us read
    { id: "fill", type: "spot", color: "#fbf3e6", intensity: 70, position: [-3.0, 4.2, 7.5], target: [0, 0.9, 0], angle: 0.55, penumbra: 1, distance: 30, decay: 2 },
    // night: cool moonlight through the same window (0 by day)
    { id: "moon", type: "spot", color: "#9db6e8", intensity: 0, position: [3.5, 7.5, -9], target: [0, 0.6, 0.3], angle: 0.4, penumbra: 0.8, distance: 40, decay: 2 },
  ],
  post: {
    bloom: { strength: 0.32, radius: 0.5, threshold: 1.55 },  // window glow + glass glints only (light scene: linear HDR threshold)
    vignette: { darkness: 0.32, offset: 1.1 },
    grain: { amount: 0.008, fps: 30 },                       // dither only: bitrate
  },
  camera: { fov: 30, near: 0.3, far: 60, drift: { amp: 0.012, speed: 0.22 } },
  text: { font: "\"Noteworthy\", \"Marker Felt\", \"Chalkboard SE\", \"Bradley Hand\", cursive", weight: 700, color: "#2e2418", height: 0.3 },
  sfx: { enter: "rustle", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Strata pour in one band at a time: a grain stream falls through the neck, a mound builds under it, then slumps and settles (damped wobble).",
    "Plants grow on a seeded plan: stems extend, fern croziers uncoil base-to-tip, leaves scale in (outBack) as the growing tip passes each node, moss cushions spread out from seed points.",
    "Water cycle: droplets condense on the inner glass (grow, bead), the biggest run down accelerating and stretching, vanish into the soil, which darkens.",
    "Day passes to night and back: the sun spot (leaf gobo) slides and dims, the window sky goes blue-black with cool moonlight, then dawn warms it again.",
    "Camera: slow push-ins on a big jar; labels are hand-lettered paper tags that drop in on a string and swing to rest.",
  ],

  // ---- look numbers consumed by style.js ------------------------------------------------------------
  jar: { kind: "bottle", R: 1.05, H: 1.85, neckR: 0.46, neckH: 0.3, shoulder: 0.42, glass: 0.055, bulge: 0.035, heel: 0.16, radial: 128 },
  // Glass: OPAQUE custom shader on the outer front surface. Each frame style.render() pre-renders the scene WITHOUT the
  // outer glass into a half-float target and the glass samples it with a refracted screen offset (per-channel IOR),
  // adds Fresnel reflection of an analytic room (window panels), a thick-wall inner rim line, a faint green body tint at
  // grazing angles and condensation haze. The far wall (inner surface, back faces) renders in the pre-pass as faint
  // reflections so it is seen THROUGH the front.
  glass: {
    prepass: 1.0, samples: 4,
    ior: 1.5, dispersion: 0.012, refract: 0.085,
    tint: "#f6f9f6", edgeTint: "#8fb0a2", edgeDark: 0.55, edgeK: 2.2,
    fresnelPow: 4.5, fresnelMin: 0.035,
    rimLine: 0.85, rimAt: 0.24, rimWidth: 0.05, rimColor: "#f4fbff",
    env: 1.0, room: "#5a5348", floor: "#3a3530",
    panels: [  // analytic room for reflections: direction (toward the light), size (tan half-angles), intensity, colour
      { dir: [-0.62, 0.35, 0.7], size: [0.16, 0.95], intensity: 2.6, color: "#fffaf0" },   // tall room window on the camera's left -> vertical streak
      { dir: [0.0, 0.5, -1.0], size: [0.85, 0.6], intensity: 1.4, color: "#eaf3ff" },      // the window behind (seen at grazing)
      { dir: [0.75, 0.25, 0.62], size: [0.07, 0.8], intensity: 1.2, color: "#fff2df" },     // thin right strip
      { dir: [0.0, 1.0, 0.0], size: [0.6, 0.6], intensity: 0.45, color: "#ffffff" },        // ceiling
    ],
    panelSoft: 0.5,
    haze: "#eef3f1", hazeTop: 2.25, hazeBottom: 1.05, hazeAmount: 0.42,
    back: { level: 0.16, streak: 0.55 },                     // far wall (pre-pass only)
    lipRadius: 0.05,
  },
  layers: {
    pebbles: { depth: 0.26, grains: 90, size: [0.035, 0.07], mound: 0.1, residual: 0.05, stream: 0.1, tex: "pebbles" },
    charcoal: { depth: 0.12, grains: 70, size: [0.03, 0.055], mound: 0.07, residual: 0.03, stream: 0.08, tex: "charcoal" },
    soil: { depth: 0.44, grains: 110, size: [0.02, 0.04], mound: 0.16, residual: 0.09, stream: 0.11, tex: "soil" },
    wave: 0.018,            // m: wavy strata boundaries
    texPerMetre: 1.4,       // texture repeats per metre of wall
  },
  plants: {
    leafColors: ["#3f7a3a", "#5c9a45", "#2f6532", "#6aa84f"],
    fernColors: ["#4f8a34", "#5f9d3c", "#3f7a2c"],
    mossColors: ["#5d8a2e", "#4a7426", "#7aa53a", "#3d6322"],
    stemRadius: 0.018, frondRadius: 0.011, vineRadius: 0.011,
  },
  droplets: { capacity: 160, flatten: 0.42, level: 1.0, spec: 2.4, rim: 0.55 },
  sun: { day: 900, color: "#fff1d6", dusk: "#ffb36b", az: 0.35, gobo: { leaves: 46, seed: 4, dark: 0.18, blur: 6 } },
  sky: { day: "#cfe3f0", dusk: "#f2b98a", night: "#16223b", level: 1.5, nightLevel: 0.7 },
  set: { sillDepth: 3.4, sillW: 9, windowZ: -1.75, opening: [-3.3, 2.6, 0.0, 4.4], mullionX: -0.35, transomY: 2.45 },
  tag: { font: "\"Noteworthy\", \"Marker Felt\", \"Chalkboard SE\", \"Bradley Hand\", cursive", weight: 700, paper: "#efe2c4", edge: "#c9b48a", ink: "#2e2418",
         string: "#8a6a44", ring: "#d8c7a0", swing: { amp: 0.16, omega: 7.5, zeta: 2.2, drop: 0.5 } },
};
