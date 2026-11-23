// styles/schlieren/spec.js — STYLE_SPEC for "Schlieren". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the plume plan + score) and the browser.
// Units: metres, toy-scale (the mirror is 2.1 m across so the plume reads at 1080p). Y-up; the mirror faces +Z, the
// camera looks back at it from near the knife edge.
//
// The look: an optics bench in a dim lab. A large round concave mirror in a black cell glows evenly (lit from a pinhole
// lamp at its centre of curvature). A candle stands in front of it. A razor blade on a micrometer stand, the lamp and a
// box camera sit near the focus. With the blade out the disc is plain bright ivory: candle silhouette + flame, nothing
// else. Slide the blade into the focus and the disc dims to even grey — and the air becomes visible: the sideways rate
// of change of the warm plume's density shows as light on one side, dark on the other, rising and rolling.

export const STYLE_SPEC = {
  id: "schlieren",
  name: "Schlieren",
  description:
    "Invisible air made visible: a big round mirror on an optics bench in a dim lab, a candle in front of it, a razor blade on a micrometer stand at the focus. With the blade out the mirror is an even ivory disc showing only the candle and its flame; slide the blade into the focus and the disc dims to grey and the 'still' air above the flame appears as a rising, rolling plume drawn in light and dark. One shader on the disc: a procedural plume density (closed form of position and t: rising, widening, rolling, pushed sideways by a breath puff in closed form) and the picture is its sideways derivative ∂n/∂x — what a vertical knife edge really selects.",
  palette: {
    bg: "#07090d",
    wall: "#10131a",
    bench: "#191c22",
    anodised: "#1d2129",
    alu: "#a9afb8",
    steel: "#9aa0a8",
    brass: "#b8924f",
    wax: "#efe6d4",
    wick: "#1a1410",
    flame: "#ffb347",
    flameCore: "#fff1c9",
    straw: "#ecebe6",
    strawBand: "#e0483b",
    ink: "#16181d",
    caption: "#efe9dc",
    accent: "#ff9a3c",
  },
  world: {
    background: "#07090d",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.22,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#191c22", roughness: 0.72, metalness: 0.1, bump: { source: "bumpNoise", scale: 40, octaves: 3, seed: 112, strength: 0.08, description: "fine fbm noise: matte optical-table top" } },
    wall: { type: "standard", baseColor: "#10131a", roughness: 0.95, metalness: 0 },
    anodised: { type: "physical", baseColor: "#1d2129", roughness: 0.38, metalness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.3 },
    alu: { type: "standard", baseColor: "#a9afb8", roughness: 0.3, metalness: 0.9 },
    steel: { type: "standard", baseColor: "#9aa0a8", roughness: 0.22, metalness: 1 },
    blade: { type: "standard", baseColor: "#d4d9df", roughness: 0.12, metalness: 1 },
    brass: { type: "standard", baseColor: "#b8924f", roughness: 0.3, metalness: 1 },
    wax: { type: "physical", baseColor: "#efe6d4", roughness: 0.55, metalness: 0, sheen: 0.4 },
    wick: { type: "standard", baseColor: "#1a1410", roughness: 0.9, metalness: 0 },
    straw: { type: "physical", baseColor: "#ecebe6", roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 },
    strawBand: { type: "standard", baseColor: "#e0483b", roughness: 0.4, metalness: 0 },
    camBody: { type: "standard", baseColor: "#24272e", roughness: 0.5, metalness: 0.3 },
    lens: { type: "physical", baseColor: "#0b0e14", roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 },
    knob: { type: "standard", baseColor: "#ff9a3c", roughness: 0.45, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#9fb2d6", groundColor: "#1a1d24", intensity: 0.55 },
    {
      id: "key", type: "directional", color: "#dfe7ff", intensity: 1.1, position: [-3.5, 4.5, 5.5], target: [0, 1.2, 0.8],
      shadow: { softness: 3, mapSize: 2048, extent: 3.4, near: 0.5, far: 20, bias: -0.0008, normalBias: 0.04 },
    },
    { id: "rim", type: "directional", color: "#ffd9b0", intensity: 1.4, position: [3.5, 2.5, -3.0], target: [0, 1.3, 0.3] },
  ],
  post: {
    bloom: { strength: 0.5, radius: 0.45, threshold: 1.15 },
    vignette: { darkness: 0.32, offset: 1.12 },
  },
  camera: { fov: 34, near: 0.1, far: 60, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#16181d", height: 0.3 },

  // ---- the bench -------------------------------------------------------------------------------------------
  bench: { y: 0, w: 5.2, d: 6.4, z: 1.6, thick: 0.08 },
  rail: { w: 0.16, h: 0.06, z0: -0.4, z1: 4.4 },
  wall: { z: -1.6, w: 14, h: 7 },

  // ---- the mirror ------------------------------------------------------------------------------------------
  mirror: {
    R: 1.05, y: 1.55, z: 0, cell: 0.11, cellDepth: 0.16, back: 0.06,
    bright: [0.9, 0.86, 0.78],     // ordinary view: the evenly lit disc (linear)
    brightFall: 0.1,               // gentle fall-off toward the rim (source beam)
    grey: [0.2, 0.2, 0.205],       // schlieren view: the knife at half cut (linear)
    light: [1.08, 1.0, 0.86],      // where the gradient bends light past the knife
    dark: [0.006, 0.01, 0.026],    // where it bends light onto the knife
    contrast: 0.5,                 // schlieren gain: s = contrast × ∂n/∂x (1/m), soft-clipped
    bevel: 0.022,                  // darker bevel ring at the edge of the glass
    room: 0.022,                   // faint large-scale room convection in the field (keeps the grey alive)
    seamLine: 0.006,               // half-width (m) of the split seam line
  },

  // ---- the candle ------------------------------------------------------------------------------------------
  candle: { x: 0.08, z: 0.6, r: 0.055, h: 0.3, y0: 0.48, dishR: 0.1, postR: 0.022 },
  flame: { h: 0.17, r: 0.032, glow: 0.38, emissive: 3.2, light: 0.9, tipInside: 0.03 },

  // ---- knife edge, lamp, camera (near the focus) -------------------------------------------------------------
  blade: { w: 0.26, h: 0.11, t: 0.004, y: 1.02, z: 3.0, focusX: 0.5, spot: 0.016, from: 1.25, to: 0.5, stand: 0.06 },
  lamp: { x: 0.5, y: 1.2, z: 3.05 },
  camBox: { x: 0.78, y: 1.02, z: 3.35, w: 0.26, h: 0.2, d: 0.34 },

  // ---- the straw (beat 4) ----------------------------------------------------------------------------------
  straw: { y: 0.28, len: 1.9, r: 0.02, hidden: -2.7, tip: -0.48 },   // y and x relative to the flame tip

  // ---- the plume (plume space: flame tip = origin, metres) ----------------------------------------------------
  plume: {
    v: 0.45,          // rise speed (m/s)
    w0: 0.012,        // column half-width at the flame tip
    spread: 0.13,     // half-width growth per metre of height
    decay: 0.6,       // amplitude halves by this height
    rollScale: 5.2,   // rolling: noise frequency (1/m)
    rollAmp: 0.075,   // rolling: domain-warp amplitude (m)
    rollGrow: 0.35,   // rolling grows over this height above the transition
    rollTop: 1.9, rollLow: 0.28,
    sway: 0.012,      // slow sway of the column (m)
    h: 0.008,         // central-difference step (m)
    evolve: 0.35,     // how fast the rolling pattern changes in its own frame
    pulseLen: 0.24,   // spacing of the travelling bulges (m)
    flickerAmt: 1,
  },
  puff: { sigT: 0.2, sigY: 0.075, A: 1.5, jet: { U: 1.15, life: 0.65, w0: 0.014, spread: 0.11, amp: 0.85 } },

  // ---- overlay caption chip (top-left, exact colours) ------------------------------------------------------
  caption: {
    x: 60, y: 52, h: 92, cap: 40, maxW: 740,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#efe9dc", edge: "#ffffff", ink: "#16181d", icon: "#16181d", iconGrey: "#8d8f93", accent: "#ff9a3c",
  },

  sound: {
    bed: { gain: 0.32, root: 55, brightness: 420 },
    slide: { gain: 0.32, servo: 0.22 },
    cut: { gain: 0.45 },
    air: { gain: 0.34, dur: 2.4 },
    straw: { gain: 0.22 },
    puff: { gain: 0.7 },
    swirl: { gain: 0.28 },
    seam: { gain: 0.3 },
    settle: { gain: 0.1 },
  },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "servo", land: "tick", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "The disc is one shader: plume density = closed form of (x, y, t); the picture = its sideways derivative (central difference), soft-clipped, light/dark on grey.",
    "The plume lives in the candle's vertical plane: each disc pixel casts the camera ray to that plane, so the plume stays on the flame from any camera.",
    "Blade travel, field dimming, plume reveal, the rolling transition height, the straw and the split seam are eased keys from the plan; the breath push is a closed-form erf integral.",
    "Camera: one move per beat, still during holds; the disc stays the largest thing in frame.",
  ],
};
