// styles/uv-reveal/spec.js — STYLE_SPEC for "UV Reveal". Plain data only: JSON-serializable, no THREE, no window.
// Units: metres (toy scale: the sheet is 3.2 m wide), Y-up right-handed, colours sRGB hex, angles radians.
// The look: an ordinary printed page on a warm oak desk under bright room light. A hand-held UV torch switches on,
// the room dims, and inside the violet pool of light a HIDDEN fluorescent layer glows (cyan / green / magenta on deep
// violet), with a short afterglow behind the moving pool. torchplan.js plans the torch path, the pool radius, the room
// level and the afterglow as pure functions of t; the same plan drives the sound.

export const STYLE_SPEC = {
  id: "uv-reveal",
  name: "UV Reveal",
  description:
    "Two-layer surface revealed by a moving ultraviolet torch: an ordinary printed page (illustration + dummy text) lies on a warm oak desk under bright room light and shows no trace of anything else. A hand-held UV torch switches on, the room light dims, and inside the torch's violet pool a hidden fluorescent layer glows — a repeating watermark lattice, neon contours, a code strip and a big stamp — in saturated cyan, green and magenta on deep violet paper. The pool position, its radius (torch height and beam zoom) and a short phosphor afterglow behind the moving pool are pure functions of t along a planned torch path (torchplan.js); in the shader the visible print sinks to deep violet and the hidden layer is added to the page's emission only where the pool or afterglow masks are non-zero. Final move: the room goes dark, the torch lifts away, the pool radius grows past the sheet and the whole hidden layer glows at once. Switch click, lamp hum, sweep whooshes, per-mark pings and the flood chime come from the same plan.",
  palette: {
    bg: "#cdbfae",
    bgDark: "#0d0620",
    desk: "#b98a5a",
    paper: "#f6f2e8",
    ink: "#2a2c33",
    inkSoft: "#8b8e98",
    uv: "#7a3cff",
    uvDeep: "#2a1466",
    cyan: "#19f0ff",
    green: "#56ff7a",
    magenta: "#ff2bd6",
    lime: "#d8ff3a",
    torch: "#2b2e36",
    torchGrip: "#16181d",
    accent: "#ff7a3c",
  },
  world: {
    background: "#cdbfae",
    environment: null,
    toneMapping: "neutral",   // keeps the saturated fluorescent hues (ACES whitens them)
    exposure: 1.0,
  },
  materials: {
    desk: {
      type: "standard", baseColor: "#ffffff", roughness: 0.78, metalness: 0,
      map: { source: "wood", size: 1024, boards: 6, seed: 41, grainFreq: 20, contrast: 0.42, dark: "#8a5f3a", mid: "#b98a5a", light: "#d9ae7c", seam: "#6b4526", repeat: [2, 2], description: "warm oak planks, 6 boards per tile, tile = 6 x 4 m" },
    },
    paperEdge: { type: "standard", baseColor: "#e9e3d6", roughness: 0.9, metalness: 0 },
    torchBody: { type: "standard", baseColor: "#6b7385", roughness: 0.45, metalness: 0.25 },
    torchGrip: { type: "standard", baseColor: "#262a33", roughness: 0.85, metalness: 0 },
    torchRing: { type: "standard", baseColor: "#d7dbe4", roughness: 0.4, metalness: 0.2 },
    torchLens: { type: "standard", baseColor: "#1a1030", roughness: 0.2, metalness: 0, emission: { color: "#9a66ff", strength: 0.001 } },
    pencilWood: { type: "standard", baseColor: "#e9c48f", roughness: 0.8, metalness: 0 },
    pencilPaint: { type: "standard", baseColor: "#e0572e", roughness: 0.5, metalness: 0 },
    graphite: { type: "standard", baseColor: "#2a2c33", roughness: 0.5, metalness: 0.2 },
    marker: { type: "standard", baseColor: "#d8ff3a", roughness: 0.45, metalness: 0, emission: { color: "#c8ff2a", strength: 0.001 } },
    markerCap: { type: "standard", baseColor: "#23262d", roughness: 0.5, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fff6ea", groundColor: "#a08f7c", intensity: 1.15 },
    {
      // warm room key from front-left: bright page, soft torch shadow falling back-right
      id: "key", type: "directional", color: "#fff1dc", intensity: 2.1, position: [-2.6, 6.0, 2.8], target: [0, 0, 0],
      shadow: { softness: 3.0, mapSize: 2048, extent: 3.4, near: 0.5, far: 20, bias: -0.0004, normalBias: 0.012 },
    },
    // the "blacklight" ambience: 0 in the lit room; the scene raises it with the torch and the final flood
    { id: "uvFill", type: "hemisphere", color: "#6a35ff", groundColor: "#1a0b45", intensity: 0 },
  ],
  post: {
    bloom: { strength: 0, radius: 0.55, threshold: 0.9 },   // strength is driven from the UV level (0 in the lit room)
    vignette: { darkness: 0.3, offset: 1.1 },
  },
  camera: { fov: 34, near: 0.2, far: 60, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#2a2c33", height: 0.3 },

  // ---- the sheet -----------------------------------------------------------------------------------------
  page: {
    w: 3.2, h: 1.8,           // m (16:9 so the final top shot fills the frame)
    thickness: 0.012,
    pxPerMetre: 640,          // both layers are baked once at 2048 x 1152
    y: 0.012,
    roughness: 0.92,
    drop: { from: 0.9, dur: 0.75, tilt: 0.16, yaw: -0.1, slide: 0.5 },   // the sheet settles onto the desk at t = 0
  },
  // ---- the visible print (what the page shows in room light) ------------------------------------------------
  print: {
    font: '"Georgia", "Times New Roman", serif',
    heading: "Morning in the valley",
    paper: "#f6f2e8", ink: "#2a2c33", bar: "#9a9da6", barDark: "#5d606a", rule: "#c9c3b5",
    sky: ["#bfe3f5", "#fbe3c2"], sun: "#ffc94d", hills: ["#8fc7a4", "#5fae86", "#3b8a6b"], river: "#8fd0ea",
    roof: "#d9573c", wall: "#fbf3e2", trunk: "#7a5236", leaf: "#2f7a55", bird: "#3a3f4a",
  },
  // ---- the hidden fluorescent layer (emission only; multiplied by the torch masks) ----------------------------
  hidden: {
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif',
    cyan: "#19f0ff", green: "#56ff7a", magenta: "#ff2bd6", lime: "#d8ff3a",
    mark: "AI",               // the repeating watermark glyph
    stamp: "MADE BY AI",
    stampSub: "SYNTHETIC IMAGE",
    gain: 1.15,               // emission multiplier at full mask (bloom carries the glow; > ~1.6 whitens the hues)
    paperGlow: [0.04, 0.012, 0.14],  // linear RGB the paper itself adds inside the pool (deep violet haze)
    poolTint: [0.22, 0.1, 0.4],       // linear multiplier on the visible print inside the pool: the page goes deep violet
    shimmer: { amp: 0.07, hz: 0.55 }, // slow breathing of the glow during holds
  },
  // ---- the torch and its light ------------------------------------------------------------------------------
  torch: {
    length: 0.95, radius: 0.085, headRadius: 0.13, headLength: 0.24,
    lean: [0.6, 1, -0.2],    // direction from the pool centre up to the lens (the "hand" is to the right)
        poolSoft: 0.68,           // mask = 1 inside poolSoft x r, falling to 0 at r
    spot: { color: "#7d44ff", candela: 1.9, penumbra: 0.65 },
    beam: { color: "#8a55ff", opacity: 0.2 },
    lensGlow: 2.2,
    uvFill: { torch: 0.42, flood: 1.5 },   // uvFill intensity with the torch on / at the full flood
    room: { torch: 0.3, flood: 0.045 },    // room light level with the torch on / at the full flood
    bloom: 0.5,
    afterglow: { tau: 0.8, step: 0.07, samples: 20, radius: 0.85 },    // phosphor trail: weight = e^(-age/tau), tapered to 0 at samples x step
    wobble: { amp: 0.018, hz: 0.7 },       // hand-held sway of the pool (m)
  },
  // ---- overlay caption chip -------------------------------------------------------------------------------
  caption: {
    x: 960, y: 40, h: 92, cap: 40, maxW: 900,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#15101f", edge: "#7a3cff", ink: "#f7f3ff", dot: "#19f0ff",
  },
  sound: {
    bed: { gain: 0.42, root: 110, brightness: 900 },
    bedUv: { gain: 0.36, root: 82.4, brightness: 1500 },
    hum: { gain: 0.16, hz: 100 },
    leg: { gain: 0.32 },
    hit: { gain: 0.3 },
    stamp: { gain: 0.5 },
    flood: { gain: 0.6 },
  },
  sfx: { enter: "paper", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "The torch pool follows a planned path (timed Hermite keys + a tiny hand-held sway); hidden ink glows only inside the pool mask.",
    "Afterglow: the mask is also the max over the last ~1.4 s of pool positions, weighted e^(-age/tau) — a fading phosphor trail.",
    "Switch-on dims the room over ~0.6 s; the final flood kills the room light, lifts the torch away and grows the pool past the sheet.",
    "Camera: one slow push while the torch works, then one rise to a top shot that fills the frame with the glowing sheet.",
  ],
};
