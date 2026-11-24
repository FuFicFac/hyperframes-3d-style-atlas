// styles/lab-glassware/spec.js — STYLE_SPEC for "Lab Glassware": a bright, clean laboratory bench in soft daylight.
// Clear glassware (beakers, conical flasks, measuring cylinders, test tubes in a rack, a burette on a stand, a funnel)
// holds saturated coloured liquids with a visible meniscus, printed graduations, bubbles and small enamel labels.
// Liquids are QUANTITIES: every level is computed from a vessel's volume-vs-height curve (liquids.js), pours conserve
// volume between two differently shaped vessels, colours blend by dye (Beer-Lambert) mixing, drops are counted.
// Plain data only (JSON-serializable, no THREE, no window). Units: metres (vessels ~3x real size), Y-up, sRGB hex,
// radians, three.js light units. Liquids are just "A", "B", "C" — no chemicals, formulas or hazard content.

export const STYLE_SPEC = {
  id: "lab-glassware",
  name: "Lab Glassware",
  description:
    "A bright clean laboratory bench in soft daylight: white worktop, pale tiled wall, clear glassware (beakers, conical flasks, measuring cylinders, test tubes in a rack, a burette on a stand, a funnel) holding saturated coloured liquids with a visible meniscus, printed graduations, bubbles and small enamel labels. Liquids are quantities: levels rise and fall to exact graduations from each vessel's volume curve, a vessel tilts and pours a parabolic stream with volume conserved into a differently shaped vessel, colours swirl and settle to a dye blend, a burette drips until the planned drop flips the colour, bubbles fizz and a foam head rises, and layers stack by density.",
  palette: {
    bg: "#eef2f2",
    bench: "#f5f4f0",
    benchEdge: "#e3e1db",
    tile: "#edf3f2",
    tileAlt: "#e6eeee",
    grout: "#cdd6d6",
    ink: "#1d2a44",           // graduation enamel + caption text (deep navy)
    enamel: "#fbfaf6",        // white enamel label patches
    steel: "#c9ced4",
    standBase: "#f1f0ec",
    rack: "#8fb7d9",          // enamel-painted test-tube rack
    stopcock: "#2f6fd6",
    // the liquids: few, saturated, clearly distinct (just "A", "B", "C" ...)
    A: "#1f6fe8",            // blue
    B: "#ffc81e",            // yellow
    C: "#e0257f",            // magenta (burette)
    D: "#ff7a1a",            // orange
    E: "#19b39a",            // teal
    F: "#9be22d",            // lime
    react: "#8b2fd6",        // the colour the mix flips to at the planned drop
    foam: "#fbf8ff",
    stamp: "#d23b2f",
    primary: "#1f6fe8",
    secondary: "#ffc81e",
    accent: "#e0257f",
  },
  world: {
    background: "#eef2f2",
    environment: null,
    toneMapping: "neutral",     // keeps the saturated liquids and the white bench as designed (ACES greys whites)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#f5f4f0", roughness: 0.5, metalness: 0 },
    benchEdge: { type: "standard", baseColor: "#e3e1db", roughness: 0.55, metalness: 0 },
    steel: { type: "standard", baseColor: "#d3d8de", roughness: 0.28, metalness: 0.85 },
    standBase: { type: "standard", baseColor: "#f1f0ec", roughness: 0.45, metalness: 0 },
    rack: { type: "standard", baseColor: "#8fb7d9", roughness: 0.4, metalness: 0 },
    stopcock: { type: "standard", baseColor: "#2f6fd6", roughness: 0.35, metalness: 0 },
    ptfe: { type: "standard", baseColor: "#f4f4f2", roughness: 0.6, metalness: 0 },
    clampPad: { type: "standard", baseColor: "#3a3f47", roughness: 0.8, metalness: 0 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#f7fafc", groundColor: "#e6e2da", intensity: 1.15 },
    {
      // soft daylight from a window on the left, slightly in front: short soft shadows fall right and back
      id: "sun", type: "directional", color: "#fff6ea", intensity: 2.0, position: [-3.6, 5.2, 2.6], target: [0, 0.4, -0.2],
      shadow: { softness: 6, mapSize: 2048, extent: 2.6, near: 1, far: 16, bias: -0.0003, normalBias: 0.02 },
    },
    { id: "fill", type: "directional", color: "#eef4ff", intensity: 0.45, position: [3.5, 2.5, 4], target: [0, 0.5, 0] },
  ],
  post: {
    bloom: { strength: 0.1, radius: 0.35, threshold: 2.6 },   // only the brightest glass glints
    vignette: { darkness: 0.16, offset: 1.15 },
    grain: { amount: 0.005, fps: 30 },                         // dither only (bitrate)
  },
  camera: { fov: 30, near: 0.2, far: 40, drift: { amp: 0.004, speed: 0.2 } },
  text: { font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700, color: "#1d2a44", height: 0.08 },

  // ---- glass (opaque refraction shader over a same-frame pre-render, after glass-light / terrarium) ------------
  glass: {
    prepass: 1.0, samples: 4,
    ior: 1.47, dispersion: 0.012, refract: 0.06, cap: 0.03,
    tint: "#fbfdfd", edgeTint: "#8ea7b4", edgeDark: 0.42, edgeK: 2.4,
    fresnelPow: 4.2, fresnelMin: 0.03,
    rimLine: 0.7, rimAt: 0.2, rimWidth: 0.06, rimColor: "#ffffff",
    env: 1.0, room: "#e9edee", floor: "#f2f0ea",
    panels: [  // analytic lab for reflections: direction (toward the light), size (tan half-angles), intensity, colour
      { dir: [-0.8, 0.3, 0.55], size: [0.22, 0.9], intensity: 1.8, color: "#ffffff" },    // the tall window on the left
      { dir: [0.0, 1.0, 0.15], size: [0.9, 0.12], intensity: 1.2, color: "#fffdf8" },     // a ceiling light strip
      { dir: [0.75, 0.2, 0.6], size: [0.06, 0.7], intensity: 0.9, color: "#f4f8ff" },      // thin right strip
      { dir: [0.0, 0.25, -1.0], size: [1.2, 0.5], intensity: 0.35, color: "#e8efef" },     // the tiled wall behind
    ],
    panelSoft: 0.45,
    seam: 0.25,               // faint mould seam / thickness line brightness
  },
  // ---- liquids -----------------------------------------------------------------------------------------------
  liquid: {
    meniscus: 0.012,          // m the liquid climbs the wall
    menDark: 0.55,            // dark meniscus band strength (front wall)
    menWidth: 0.016,
    edge: 0.62, centre: 0.5,  // wall shading: darker edges, lighter centre
    glow: 0.32,               // back-lit glow in the middle of the wall
    caustic: 0.35,            // bright band on the inner floor
    capFresnel: 0.5, capSpec: 1.4,
    sun: [-0.55, 0.72, 0.42], // light direction used by the liquid shaders (matches the sun)
    sky: "#f4f8fb", ground: "#ece7df",
    swirl: { arms: 2, twist: 7, wind: 22, omega: 7.0, tau: 0.9, settle: 0.95 },
    bubble: { tint: 0.65, rim: 0.7, spec: 2.0 },
    foam: { cell: 120, edge: 0.2, tint: 0.12 },
    pool: { opacity: 0.32, size: 1.9, offset: 0.55 },  // coloured light pool on the bench beside each vessel
  },
  // ---- vessels (outer radius R, height H, wall, base thickness ...) ------------------------------------------
  vessels: {
    beaker: { R: 0.19, H: 0.58, wall: 0.012, base: 0.04, corner: 0.03, lip: 0.012, spout: 0.02 },
    cylinder: { R: 0.125, H: 0.98, wall: 0.012, base: 0.05, foot: 0.035, footR: 0.2, corner: 0.012, lip: 0.011 },
    flask: { R: 0.2, H: 0.5, wall: 0.011, base: 0.03, corner: 0.035, neckR: 0.06, neckH: 0.13, lip: 0.013 },
    tube: { R: 0.042, H: 0.4, wall: 0.006, lip: 0.007 },
    burette: { R: 0.032, H: 0.66, wall: 0.008, tipH: 0.13, tipR: 0.006, lip: 0.006 },
    funnel: { R: 0.15, H: 0.34, stemR: 0.018, stemH: 0.18, wall: 0.008, lip: 0.008 },
  },
  units: { per: 0.000289, name: "units" },   // m^3 per printed graduation unit, shared by every vessel (volume is conserved)
  gradu: {
    ink: "#1d2a44", font: '"Avenir Next Condensed", "Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    span: 1.25,               // radians of the front arc that carries the printed marks
    px: 1024,
  },
  enamel: { patch: "#fbfaf6", font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 800 },
  bench: { w: 9, d: 1.5, h: 0.06, z: -0.25, wallZ: -1.0, tile: 0.15, grout: 0.004 },
  stand: { baseW: 0.62, baseD: 0.72, baseH: 0.03, rodR: 0.014, rodH: 1.9, rodX: 0.22, rodZ: -0.44 },
  rack: { w: 0.72, d: 0.16, h: 0.26, holes: 6 },
  // ---- caption + stamp (overlay = exact colours) -------------------------------------------------------------
  caption: { x: 96, y: 62, h: 92, cap: 46, font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700, card: "#fbfaf6", ink: "#1d2a44", band: "#1f6fe8", inDur: 0.35, outDur: 0.35 },
  stamp: { text: "SAMPLE DATA", x: 1824, y: 74, cap: 26, color: "#d23b2f", font: '"Avenir Next Condensed", "Helvetica Neue", Arial, sans-serif' },
  readout: { font: '"Avenir Next Condensed", "Avenir Next", "Helvetica Neue", Arial, sans-serif', cap: 0.07, card: "#fbfaf6", ink: "#1d2a44" },

  sound: {
    bed: { gain: 0.85, root: 196, chord: [0, 4, 7, 11, 14], brightness: 1500 },
    trickle: { gain: 0.11, every: 0.042, lo: 0.55, hi: 1.7 },   // pitch rises as the receiving vessel fills
    clink: { gain: 0.2, pitch: 2.6 },
    set: { gain: 0.24, pitch: 1.6 },
    drip: { gain: 0.3, pitch: 1.35 },
    fizz: { gain: 0.07 },
    mallet: { gain: 0.2, scale: [0, 2, 4, 7, 9, 12], base: 0.6 },
  },
  sfx: { enter: "bubble", exit: "whooshOut", move: "whoosh", land: "clack", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "Measure: a level rises from the floor of a vessel to an exact graduation (computed from the vessel's volume curve) and settles with a small damped wobble; a reading tag points at the meniscus.",
    "Pour: the source lifts, pivots about its lip and tilts exactly as far as its remaining volume needs to reach the lip; a parabolic stream arcs out and the target rises by the same volume in its own shape.",
    "Mix: the incoming colours swirl through the target in spiral arms and settle to a dye (Beer-Lambert) blend.",
    "Threshold: a burette drips counted drops; each makes a brief bloom that fades until the planned drop spreads its colour through the whole vessel.",
    "Fizz: bubbles stream up the wall and a foam head rises and settles; layered liquids stack by density.",
    "Camera: eye level to read the scales, a little higher to see into the vessels, one slow move per beat, ending on a wide bench that fills the frame.",
  ],
};
