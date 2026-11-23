// styles/tiny-planet/spec.js — STYLE_SPEC for "Tiny Planet". Plain data only: JSON-serializable, no THREE, no window.
// Units: metres (toy scale: the globe is 6 m across), Y-up right-handed, colours sRGB hex, angles radians unless a key
// says "deg" (everything placed on the globe is in latitude / longitude DEGREES: lon 0 faces +Z, +lon turns toward +X).
// Look: one small faceted globe on a warm cream backdrop under a fixed camera and a fixed sun (day on the left, a night
// crescent on the right limb). Everything on it — land, trees, houses, roads, lamps, clouds — is placed in spherical
// coordinates by globe.js and pops up along the surface as the planet turns.

export const STYLE_SPEC = {
  id: "tiny-planet",
  name: "Tiny Planet",
  description:
    "A whole world on one small rotating globe that fills the frame: a faceted low-poly sphere on a warm cream backdrop, lit by a fixed sun so the right limb is always a blue night crescent. A bare grey gridded ball turns under a fixed camera; streams of small word chips rain onto it, and from every landing point a front spreads along the surface: land rises out of the ball, colours in (sea, sand, grass, rock, snow), then trees, houses, roads and clouds pop up, and warm lamps come on as they turn into the night side. One planner (globe.js) places everything in latitude/longitude, computes when each front reaches each vertex and feature in closed form, and writes the score.",
  palette: {
    bg: "#ffe6c4",
    skyTop: "#ffd9b0",
    skyHorizon: "#fff1dc",
    ink: "#1f2a44",
    paper: "#fffaf0",
    accent: "#ef5b3a",
    bare: "#b9c0cc",
    bareDark: "#a4acba",
    grid: "#727c8c",
    oceanDeep: "#2a6fd0",
    ocean: "#3b93e8",
    shallow: "#74cdf0",
    sand: "#f6e2a0",
    grass: "#86d45c",
    meadow: "#5fbe55",
    rock: "#a59a8e",
    snow: "#ffffff",
    front: "#fff3b8",
    road: "#fbeccb",
    plaza: "#ead9b4",
    wall: "#fff7e8",
    roofs: ["#ef5b3a", "#f59a3c", "#d9455f", "#2e86ab"],
    pine: ["#2f9150", "#3aa85a", "#278a62"],
    leaf: ["#58b84a", "#7cc64a", "#f0a63a"],
    trunk: "#8a5a3a",
    cloud: "#ffffff",
    lamp: "#ffcf70",
    chip: "#1f2a44",
    chipLife: "#ef5b3a",
    chipText: "#ffffff",
  },
  world: {
    background: "#ffe6c4",
    sky: { top: "#ffe0bd", horizon: "#fff3e0", horizonAt: 0.55, bottom: "#ffe2c2" },
    environment: null,
    toneMapping: "neutral",
    exposure: 1.0,
  },
  materials: {
    planet: { type: "standard", baseColor: "#ffffff", roughness: 0.82, metalness: 0, flatShading: true, vertexColors: true },
    grid: { type: "standard", baseColor: "#727c8c", roughness: 0.9, metalness: 0, side: "double" },
    road: { type: "standard", baseColor: "#fbeccb", roughness: 0.9, metalness: 0, side: "double" },
    tree: { type: "standard", baseColor: "#ffffff", roughness: 0.85, metalness: 0, flatShading: true, vertexColors: true },
    wall: { type: "standard", baseColor: "#fff7e8", roughness: 0.8, metalness: 0, flatShading: true },
    roof: { type: "standard", baseColor: "#ffffff", roughness: 0.7, metalness: 0, flatShading: true },
    cloud: { type: "standard", baseColor: "#ffffff", roughness: 1, metalness: 0, flatShading: true },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#dfe6ff", groundColor: "#6a5a86", intensity: 0.62 },
    { id: "sun", type: "directional", color: "#fff1d6", intensity: 3.3, position: [-9, 4.6, 6.4], target: [0, 0, 0] },
    { id: "bounce", type: "directional", color: "#9fb4ff", intensity: 0.22, position: [8, -2, 5], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.6, radius: 0.5, threshold: 1.6 }, // light scene: only the lamps (HDR additive points) bloom
    vignette: { darkness: 0.12, offset: 1.25 },
  },
  camera: { fov: 30, near: 0.5, far: 80, drift: { amp: 0, speed: 0 } }, // locked: the planet moves, the camera does not
  text: { font: "rounded", weight: 800, color: "#1f2a44", height: 0.5 },

  // ---- the globe -------------------------------------------------------------------------------------------------
  globe: {
    R: 3,
    detail: 22,                 // icosphere subdivisions: 20 * 23^2 = 10 580 facets
    seed: 85,
    sun: [-9, 4.6, 6.4],        // must match lights.sun.position (night factor for the lamps)
    night: [0.18, -0.12],       // lamps fade in between these values of normal . sunDir
    rise: 0.7,                  // s a vertex takes to rise once the front reaches it (outBack)
    overshoot: 2.2,
    tint: 0.45,                 // s the facet takes to colour in
    flash: 0.5,                 // s of pale "front" tint riding the edge
    faceJitter: 0.07,           // per-facet lightness jitter
    grid: { step: 30, width: 0.036, lift: 0.02, sink: 0.12, seg: 96 },
    terrain: {
      sea: 0.5, coast: 0.035, noise: 0.5, noiseFreq: 1.9,
      hMax: 0.47, hBase: 0.035, ridgeFreq: 4.3, ridgePow: 2.7,
      flat: 0.05,               // plateau height under towns and roads
      rockAt: 0.23, snowAt: 0.35, ice: 68, iceH: 0.05,
    },
  },
  trees: { candidates: 5200, density: 0.6, freq: 3.4, height: [0.2, 0.34], maxAlt: 0.19, margin: 2.6, sink: 0.015, pop: 0.45, leafShare: 0.35 },
  houses: { size: [0.15, 0.21], gap: 2.5, pop: 0.5, sink: 0.01, tower: 0.62 },
  roads: { width: 0.085, lift: 0.014, step: 0.8, draw: 1.3, lampEvery: 4 },
  lamps: { size: 0.3, level: 3.4, lift: 0.07, delay: 0.25, limb: [0.08, 0.45] },   // limb: fade by world normal z so lamps do not stack into a white smear at the edge
  clouds: { alt: 0.72, size: [0.22, 0.36], rate: 3.5, pop: 0.7 },   // rate: deg/s of drift in planet-local longitude
  halo: { size: 12.5, z: -6, opacity: 0.85, color: "#fffdf4" },

  // ---- the word chips ---------------------------------------------------------------------------------------------
  chips: {
    h: 0.3, w: 0.74, cell: [224, 88], font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700, px: 46,
    drop: 5.2,                  // m a chip travels before it lands
    fall: 1.15,                 // s of fall
    gap: 0.14,                  // s between chips of one stream
    count: 11,
    jitter: 0.16, roll: 0.22, bias: [1, 0.3, 0.3],   // approach = normalize(n.x * b0, n.y * b0 + b1, n.z * b2): from the sides/top, not at the lens
    absorb: 0.16,               // s to shrink into the ground
    land: ["hill", "sea", "rock", "sand", "river", "coast", "snow", "peak", "bay", "shore", "the", "of", "and", "is", "a", "wide"],
    life: ["tree", "pine", "home", "road", "lamp", "town", "bird", "roof", "door", "moss", "the", "in", "and", "light", "cloud", "path"],
  },

  // ---- overlay caption (top centre) -------------------------------------------------------------------------------
  caption: {
    x: 960, y: 40, h: 108, cap: 60, maxW: 1100,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#fffaf0", edge: "#1f2a44", ink: "#1f2a44", dot: "#ef5b3a",
  },

  sound: {
    pad: { root: 174.61, chord: [0, 7, 12, 16, 19], brightness: 1500, gain: 0.62 },
    chip: { gain: 0.16, hz: 523.25, scale: [0, 2, 4, 7, 9, 12, 14, 16] },
    stream: { gain: 0.1 },
    rise: { gain: 0.32 },
    tree: { gain: 0.14, every: 7 },
    house: { gain: 0.22, hz: 392, every: 3 },
    lamp: { gain: 0.2 },
    turn: { gain: 0.42 },
    reveal: { gain: 0.5, hz: 87.31 },
    finale: { gain: 0.34 },
  },
  sfx: { enter: "pop", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "The camera is locked; the globe turns about its axis (spin keys in degrees). One fast half-turn is the reveal.",
    "Word chips fall in streams from outside the frame and shrink into the ground where they land.",
    "From each landing point a front spreads along the surface (outQuad): vertices rise with an outBack overshoot, facets colour in behind a pale leading edge.",
    "Trees, houses and clouds pop (outBack) when a later 'life' front reaches them; roads draw outward from the town centre.",
    "Lamps are additive points whose level is the night factor of their current world normal: they come on as they turn into the crescent.",
  ],
};
