// styles/low-poly/spec.js — STYLE_SPEC for the Low-Poly style. Plain data only:
// JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs) and the browser.
// Units: metres, Y-up right-handed, colors sRGB hex, angles radians, three.js light units.
//
// Look: a miniature world of flat, faceted shapes (folded paper / cut stone). Every triangle is one
// tone; neighbouring facets differ slightly (per-face colour jitter). Warm late-afternoon key light,
// crisp-but-soft PCF shadows, cool hemisphere fill, light warm distance fog, gentle slow orbit.

export const STYLE_SPEC = {
  id: "low-poly",
  name: "Low-Poly Miniature",
  description:
    "A faceted miniature world: noise-displaced flat-shaded terrain with height colour bands and per-face jitter, cone trees, chipped rocks, puffy faceted clouds, a sea of tilted facets, warm key light and soft haze.",
  palette: {
    skyTop: "#a9cfd0",
    skyHorizon: "#e3e9d9",
    bg: "#e3e9d9",
    ink: "#2a2833",
    paper: "#fff6e6",
    paperShade: "#efe0c6",
    // terrain bands, low -> high
    sand: "#e9cf98",
    meadow: "#8fb069",
    grass: "#6f9d5c",
    moss: "#a6ae63",
    ochre: "#d6a65f",
    clay: "#c98552", // warm terracotta-ochre; kept ~30° of hue away from the crimson hero
    rock: "#8d8078",
    snow: "#fbf4ea",
    water: "#4aa3a8",
    waterDeep: "#2f7f8e",
    foliage: "#3e7d57",
    foliageLight: "#5d9a58",
    trunk: "#7b5238",
    cloud: "#fffaf3",
    primary: "#e0344e", // hero object (crimson coral) — separated from the clay ridge
    secondary: "#2f7f8e", // deep teal
    accent: "#f5bf3c", // markers, flags, highlights (marigold)
  },
  world: {
    background: "#e3e9d9", // replaced by the world.sky gradient (kit skyTexture)
    sky: { top: "#a3cbcf", horizon: "#e3e9d9", horizonAt: 0.5, bottom: "#e3e9d9" }, // bottom = fog colour: distant sea melts into haze
    fog: { color: "#e3e9d9", near: 36, far: 115 }, // pale sea-mist (not sand) so the far sea reads as haze
    environment: null,
    toneMapping: "neutral", // Khronos PBR Neutral keeps the designed palette (ACES greys the paper banners)
    exposure: 1.05,
    shadowType: "pcf", // softness (radius) only works with pcf/vsm
  },
  materials: {
    // vertexColors are enabled in style.js for the faceted meshes (MaterialSpec has no vertexColors key)
    terrain: { type: "standard", baseColor: "#ffffff", // colours come from terrainColors
            roughness: 0.95, metalness: 0, flatShading: true },
    facet: { type: "standard", baseColor: "#ffffff", roughness: 0.9, metalness: 0, flatShading: true },
    water: { type: "standard", baseColor: "#4aa3a8", roughness: 0.3, metalness: 0, flatShading: true },
    cloud: { type: "standard", baseColor: "#fffaf3", roughness: 1, metalness: 0, flatShading: true, emission: { color: "#fff3e0", strength: 0.18 } },
    hero: { type: "standard", baseColor: "#e0344e", roughness: 0.6, metalness: 0, flatShading: true },
    marker: { type: "standard", baseColor: "#f5bf3c", roughness: 0.7, metalness: 0, flatShading: true },
    pole: { type: "standard", baseColor: "#5a4a40", roughness: 0.9, metalness: 0, flatShading: true },
    glow: { type: "standard", baseColor: "#ffd25e", roughness: 0.4, metalness: 0, flatShading: true, emission: { color: "#ffb92e", strength: 6 } },
  },
  terrainColors: {
    // [normalized height 0..1, colour] — bands are hard steps (one colour per face), not gradients
    bands: [
      [0.0, "#e9cf98"],
      [0.12, "#8fb069"],
      [0.32, "#6f9d5c"],
      [0.52, "#a6ae63"],
      [0.68, "#d6a65f"],
      [0.84, "#c98552"],
    ],
    steepColor: "#8d8078", // faces steeper than steepAt (normal.y below) turn to rock
    steepAt: 0.72,
    jitter: { lightness: 0.045, hue: 0.012 }, // per-face random offset in HSL
  },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#dfeef0", groundColor: "#8a6a4e", intensity: 1.15 },
    {
      id: "key", type: "directional", color: "#ffe2b8", intensity: 3.1, position: [-12, 18, 10], target: [0, 0, 0],
      shadow: { softness: 2.5, mapSize: 4096, extent: 18, near: 1, far: 70, bias: -0.0006, normalBias: 0.04 },
    },
    { id: "fill", type: "directional", color: "#bcd7ff", intensity: 0.45, position: [10, 6, 8], target: [0, 0, 0] },
    { id: "rim", type: "directional", color: "#ffd1a3", intensity: 0.8, position: [4, 7, -14], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.55, radius: 0.45, threshold: 2.6 }, // light scene: only emissive "glow" blooms
    tiltShift: { focus: 0.42, range: 0.32, blur: 2.5 }, // miniature feel, biased to the distant top; bottom stays nearly sharp
    vignette: { darkness: 0.28, offset: 1.15 },
    grain: { amount: 0.015, fps: 30 },
  },
  camera: { fov: 32, near: 0.3, far: 160, drift: { amp: 0.12, speed: 0.35, orbit: 0.012 } },
  text: { font: "sans", weight: 800, color: "#2a2833", height: 0.5 },
  banner: { paper: "#fff6e6", paperShade: "#efe0c6", fold: "#d9c6a4", chip: "#e0344e", chipShade: "#b92a3c", chipText: "#fff6e6", ink: "#2a2833", letterSpacing: 4 },
  sfx: { enter: "pop", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "chime", ui: "paper", bed: "pad" },
  motion: [
    "Props grow up out of the ground with a slight overshoot (spring / outBack, ~0.5 s), staggered by a seeded delay.",
    "Water facets bob and clouds drift slowly and continuously; nothing is ever fully still.",
    "Labels are flat paper banners with a numbered octagon chip; they unfold left-to-right (outBack) and fold away upward.",
    "Movement across terrain is a sequence of discrete hops (parabolic arcs) that leave small flags or a dotted trail.",
    "Camera: establish wide and high, follow the hero at a three-quarter angle, settle wide; a slow constant orbit adds life.",
  ],
};
