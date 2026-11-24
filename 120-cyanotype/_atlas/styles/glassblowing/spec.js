// styles/glassblowing/spec.js — STYLE_SPEC for "glassblowing". Plain data only: JSON-serializable, no THREE, no window.
// Units: metres, Y-up right-handed, colours sRGB hex, angles radians, three.js light units.
// The glass shapes (profile keys), heat model and tool sizes live here; gather.js turns them into a plan.

export const STYLE_SPEC = {
  id: "glassblowing",
  name: "Glassblowing",
  description:
    "A daylit hot shop (pale plaster, oak bench, steel rails, a dark steel marver, a furnace mouth glowing at the back). A steel blowpipe lies across two rails, turning, with a glowing gather of glass on its end. The glass is a surface of revolution whose outer and inner profiles blend through named shapes with its volume kept constant, so the wall thins as a breath inflates it; jacks that move on their own pinch a neck and open a flared lip. Its colour comes from temperature through a hot-body ramp (white-yellow, orange, dull red, none); as it cools from the tip inward it clears to aqua glass with two spiral canes, and the light through it lands on the marver.",
  palette: {
    bg: "#d9d1c4",
    wall: "#e2d9cb",
    floor: "#9c968c",
    oak: "#b9824f",
    marver: "#3b4148",
    steel: "#c9ced3",
    ink: "#1d1b1a",
    glass: "#35cbbb",
    glassDeep: "#06504e",
    caneA: "#2246e0",
    caneB: "#ffb21c",
    hot: "#ff8a1e",
    furnace: "#ff9a34",
    caption: "#1d1b1a",
  },
  world: {
    background: "#d9d1c4",
    fog: null,
    environment: "room",
    environmentIntensity: 0.45,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    plaster: { type: "standard", baseColor: "#e2d9cb", roughness: 0.95, metalness: 0 },
    concrete: { type: "standard", baseColor: "#9c968c", roughness: 0.9, metalness: 0 },
    oak: { type: "standard", baseColor: "#b9824f", roughness: 0.62, metalness: 0, map: { source: "wood", size: 512, boards: 4, seed: 122, grainFreq: 9, contrast: 0.55, dark: "#8a5a33", mid: "#b9824f", light: "#d9a26c", seam: 0.25, description: "oak boards, warm grain" } },
    oakDark: { type: "standard", baseColor: "#7b4f2c", roughness: 0.7, metalness: 0 },
    steel: { type: "physical", baseColor: "#d6dade", roughness: 0.3, metalness: 0.85, clearcoat: 0.2, clearcoatRoughness: 0.3 },
    darkSteel: { type: "physical", baseColor: "#5d646b", roughness: 0.42, metalness: 0.75 },
    brick: { type: "standard", baseColor: "#a8826b", roughness: 0.92, metalness: 0 },
    brickDark: { type: "standard", baseColor: "#6e5446", roughness: 0.95, metalness: 0 },
    furnaceSteel: { type: "physical", baseColor: "#4a4f55", roughness: 0.5, metalness: 0.7 },
    brass: { type: "physical", baseColor: "#c8a04a", roughness: 0.3, metalness: 1 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#e4ecf4", groundColor: "#b79c80", intensity: 1.05 },
    {
      id: "sun", type: "directional", color: "#fff1dc", intensity: 2.3, position: [-1.15, 2.3, -1.45], target: [0.12, 0.05, 0.05],
      shadow: { softness: 3, mapSize: 2048, extent: 1.0, bias: -0.0004, normalBias: 0.02 },
    },
    { id: "fill", type: "directional", color: "#e6eefa", intensity: 0.95, position: [1.3, 1.2, 2.4], target: [0.1, 0.2, 0] },
  ],
  post: {
    bloom: { strength: 0.5, radius: 0.32, threshold: 1.7 },
    vignette: { darkness: 0.2, offset: 1.15 },
    grain: { amount: 0.008, fps: 30 },
  },
  camera: { fov: 30, near: 0.03, far: 20, drift: { amp: 0.0015, speed: 0.3 } },
  text: { font: "sans", weight: 800, color: "#1d1b1a", height: 0.05 },
  sfx: { enter: "pop", exit: "whooshOut", move: "whoosh", land: "clack", emphasis: "chime", ui: "click", bed: "rumble" },
  motion: [
    "The glass profile blends point by point between named keys (gather, bubble, long drop, necked bulb, opened vase) with its volume held constant.",
    "Temperature: exponential cooling with two reheats; at the end it drains from the tip inward and the glass clears.",
    "The pipe turns at a piecewise-linear rate (closed-form angle); when it pauses the hot end sags, and recentres when turning resumes.",
    "Camera: side-on while the glass swells and is pinched; one move to three-quarter above for the cool-down, so the light through the glass lands on the marver.",
  ],

  // ---- the set (bench top at y = 0, pipe axis at y = set.pipeY, pipe tip at x = 0) --------------------------------------
  set: {
    pipeY: 0.32,
    bench: { x0: -1.6, x1: 0.95, z0: -0.5, z1: 0.42, thick: 0.05, legH: 0.75 },
    marver: { x0: -0.14, x1: 0.62, z0: -0.34, z1: 0.36, thick: 0.022, roughness: 0.38, metalness: 0.55, color: "#3b4148" },
    rails: [{ x: -0.22 }, { x: -0.72 }],
    rail: { w: 0.028, h: 0.034, z0: -0.36, z1: 0.3, post: 0.022 },
    pipe: { x0: -1.95, r: 0.0135, marks: 6, markColor: "#4b5157", grip: { x0: -1.95, x1: -1.45, color: "#7b4f2c" }, collar: { x: -0.06, r: 0.017, w: 0.012 } },
    floor: { y: -0.75 },
    wall: { z: -1.45, w: 6.5, h: 3.2, color: "#e2d9cb", shade: "#c9bfb0" },
    window: { x: -1.05, y: 0.75, w: 1.1, h: 1.0, panes: [3, 3], mullion: 0.035, frame: "#f4efe7", sky: "#eef6ff", level: 1.35 },
    furnace: { x: 0.95, y: -0.1, w: 1.0, h: 1.25, d: 0.6, mouthR: 0.21, mouthY: 0.42, glow: "#ffb24a", core: "#fff0c4", rim: "#ff6a12", level: 2.4,
      light: { color: "#ff9a3c", intensity: 0.6, distance: 0, offset: [0, 0, 0.5] } },
    paddle: { x: -0.45, z: 0.27, len: 0.42, w: 0.11, t: 0.018, handleR: 0.012, handleL: 0.22 },
  },

  // ---- the glass: profile keys (x along the pipe from its tip, r from the axis), loop = outer + rim + inner ----------------
  gather: {
    pipeR: 0.0135, boreR: 0.0055,
    counts: { outer: 84, rim: 9, inner: 64 },
    volumeKey: "gather",
    keys: {
      gather: {
        outer: [[-0.026, 0.0135], [-0.014, 0.03], [0.004, 0.05], [0.03, 0.062], [0.06, 0.0665], [0.09, 0.063], [0.115, 0.05], [0.132, 0.03], [0.141, 0]],
        inner: [[0.006, 0], [0.004, 0.004], [0, 0.0055]],
      },
      bubble: {
        outer: [[-0.026, 0.0135], [-0.014, 0.032], [0.008, 0.058], [0.04, 0.075], [0.08, 0.081], [0.12, 0.076], [0.15, 0.06], [0.172, 0.032], [0.181, 0]],
        inner: [[0.165, 0], [0.158, 0.026], [0.134, 0.052], [0.094, 0.064], [0.054, 0.06], [0.024, 0.042], [0.008, 0.018], [0, 0.0055]],
      },
      drop: {
        outer: [[-0.026, 0.0135], [-0.012, 0.028], [0.014, 0.046], [0.06, 0.06], [0.11, 0.07], [0.16, 0.072], [0.2, 0.06], [0.227, 0.034], [0.237, 0]],
        inner: [[0.221, 0], [0.213, 0.03], [0.188, 0.055], [0.144, 0.06], [0.094, 0.052], [0.048, 0.038], [0.016, 0.02], [0, 0.0055]],
      },
      necked: {
        outer: [[-0.026, 0.0135], [-0.013, 0.025], [0.006, 0.031], [0.024, 0.0255], [0.044, 0.041], [0.075, 0.071], [0.115, 0.086], [0.158, 0.084], [0.198, 0.066], [0.224, 0.036], [0.233, 0]],
        inner: [[0.217, 0], [0.209, 0.03], [0.188, 0.059], [0.152, 0.073], [0.112, 0.074], [0.076, 0.059], [0.05, 0.032], [0.032, 0.013], [0.016, 0.009], [0, 0.0055]],
      },
      vase: {
        open: true,
        outer: [[-0.026, 0.0135], [-0.013, 0.025], [0.006, 0.031], [0.024, 0.0255], [0.044, 0.041], [0.075, 0.071], [0.112, 0.085], [0.15, 0.081], [0.184, 0.066], [0.208, 0.063], [0.232, 0.077], [0.252, 0.101]],
        inner: [[0.249, 0.0925], [0.23, 0.069], [0.206, 0.055], [0.182, 0.057], [0.15, 0.072], [0.112, 0.076], [0.076, 0.06], [0.05, 0.033], [0.032, 0.013], [0.016, 0.009], [0, 0.0055]],
      },
    },
  },

  // ---- heat: temperature 0 (room) .. ~1.15 (white-hot); glow colour from a code-built hot-body ramp ----------------------
  heat: {
    start: 1.0, floor: 0.5, tau: 13,          // exponential cooling toward `floor` between reheats (the shop keeps it workable)
    tipCool: 0.08,                            // the far end runs a little cooler (thinner)
    drain: 1.05, coolTau: 0.5,                // final cool-down: the base lags the tip by `drain` s; e-fold time coolTau
    clearHi: 0.47, clearLo: 0.27,             // clarity = smoothstep(clearHi, clearLo, T)
    ramp: [                                    // [T, colour, intensity] — piecewise-linear hot-body ramp
      [0.27, "#000000", 0.0],
      [0.38, "#5e0f02", 0.5],
      [0.5, "#c22d06", 1.2],
      [0.64, "#ff6410", 2.1],
      [0.8, "#ff9c2c", 3.0],
      [0.95, "#ffd27a", 3.9],
      [1.12, "#fff6e2", 5.2],
    ],
  },

  // ---- glass look (custom shader: path-length tint, fresnel reflections, spiral canes) ----------------------------------
  look: {
    aqua: "#2fd1bf", deep: "#04524f", amber: "#e0901c", rim: "#ffffff",
    sigma: 14,            // absorption per metre of glass path (Beer-Lambert alpha)
    alphaMin: 0.16,       // even the thinnest wall keeps this much tint
    edgePath: [0.012, 0.06], // path (m) over which the tint deepens to `deep` (the dark refracted edge line)
    rimStrength: 1.4, specStrength: 1.0, sunSpec: 7, sunShine: 380,
    throughGlow: 0.55,    // light scattered through the glass on the side away from the sun
    hotSpec: 0.55,        // reflections on the glowing glass (honey sheen)
    hotPath: 0.035,       // glow saturates with glass path (m) — a bubble glows as a bright shell with a dimmer centre
    hotFloor: 0.38,
    stripe: { width: 0.2, twist: 1.15, hotDark: 0.32, alpha: 0.92, farAlpha: 0.8 },
    innerAlpha: 0.12,
    env: { sky: "#dde7f0", ground: "#6b5a4a", strip: "#ffffff", stripLevel: 2.6, window: "#fff6e8", windowLevel: 3.2, front: "#ffffff", frontLevel: 2.2, furnace: "#ff9a34", furnaceLevel: 1.6 },
    flareGlass: 0.0,
  },

  // ---- light through the glass onto the marver --------------------------------------------------------------------------
  bench: {
    samples: 48,
    tint: "#1fc6b4",
    hotShadow: 0.42,      // direct light left under the glowing (opaque) glass
    edgeDark: 0.62,       // light lost where it grazes the wall (dark outline)
    caustic: 2.2,         // bright line along the centre (the vessel acts as a lens)
    ring: 1.1,            // bright band just inside the dark outline
    caneTint: 0.75,
    glowPool: 0.5,        // orange pool from the hot glass (point light, x glow)
  },

  // ---- tools -------------------------------------------------------------------------------------------------------------
  jacks: { bladeL: 0.36, bladeW: 0.016, bladeT: 0.006, bowGap: 0.05, bowTube: 0.0055, grip: { from: 0.22, to: 0.34, r: 0.0105 } },
  pulse: { color: "#d8f4ff", r: 0.022, len: 0.07, level: 3.2 },
  glowLight: { intensity: 0.22, color: "#ff8a30" },

  // ---- overlay caption (top right, exact colours) ------------------------------------------------------------------------
  caption: {
    right: 1822, y: 58, h: 118, cap: 72, maxW: 1240, roll: 0.42,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 800,
    plate: "#1d1b1a", plateAlpha: 0.9, ink: "#fff6ea", hotAccent: "#ff7a1a", coldAccent: "#35d0c0",
  },

  sound: {
    bed: { gain: 0.55, seg: 2.4, hop: 1.2 },
    pad: { gain: 0.36, root: 55, brightness: 320 },
    breath: { gain: 0.5 }, swell: { gain: 0.2 }, swing: { gain: 0.3 }, tap: { gain: 0.5 }, scrape: { gain: 0.18 },
    reheat: { gain: 0.55 }, ping: { gain: 0.42 },
  },
};
