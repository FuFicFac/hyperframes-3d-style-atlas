// styles/liquid-chrome/spec.js — STYLE_SPEC for "Liquid Chrome" (Y2K liquid metal). Plain data only.
// Units: metres, Y-up, colours sRGB hex, angles radians. Every number that defines the look lives here.
export const STYLE_SPEC = {
  id: "liquid-chrome",
  name: "Liquid Chrome",
  description:
    "Turn-of-the-millennium Y2K chrome: mirror-finish liquid metal that flows, merges, splits and re-forms into icons and puffy chrome lettering, floating in a saturated cyan-violet-magenta void with a neon grid, four-point sparkles and lens flares.",
  palette: {
    bg: "#2a0f6e",
    skyTop: "#04104a",
    sky: "#1b4fe0",
    skyHorizon: "#8fd8ff",
    horizon: "#ffffff",
    groundTop: "#1a0700",
    ground: "#ff8a2a",
    groundDeep: "#ffd27a",
    magenta: "#ff2bd6",
    cyan: "#25f0ff",
    violet: "#7b3cff",
    ink: "#ffffff",
    inkStroke: "#16084a",
    inkShadow: "#ff2bd6",
  },
  world: { background: null, environment: null, toneMapping: "neutral", exposure: 1.0 },
  materials: {},
  lights: [],
  post: {
    bloom: { strength: 0.55, radius: 0.55, threshold: 1.25 },
    vignette: { darkness: 0.32, offset: 1.05 },
    grain: { amount: 0.012, fps: 30 },
  },
  camera: { fov: 44, near: 0.3, far: 120, drift: { amp: 0.05, speed: 0.3 } },
  text: { font: "display", weight: 800, color: "#ffffff", height: 0.5 },
  sfx: { enter: "bubble", exit: "whooshOut", move: "whoosh", land: "pop", emphasis: "chime", ui: "blip", bed: "pad" },

  // ---- the procedural chrome environment (what every mirror surface reflects) ----
  // y = elevation of the reflected direction (-1..1). Panels: [azimuth rad, elevation, half-width rad, half-height,
  // softness], colour, intensity (linear HDR; > bloom threshold = flares).
  env: {
    skyTop: "#020628", sky: "#1236b8", skyHorizon: "#3d86ff",
    horizon: "#ffffff", horizonIntensity: 5.0, horizonWidth: 0.016,
    darkBand: 0.07,                                   // black band just under the horizon line (the classic chrome "edge")
    groundTop: "#2a0c02", ground: "#ff8a2a", groundDeep: "#ffd9a0", groundIntensity: 1.05,
    skyBands: [{ y: 0.22, w: 0.012, intensity: 0.7 }, { y: 0.42, w: 0.02, intensity: 0.45 }],
    sun: { az: 0.95, el: 0.5, size: 0.06, intensity: 14, color: "#ffffff", halo: 0.6 },
    panels: [
      { rect: [2.25, 0.2, 0.09, 0.5, 0.06], color: "#ff2bd6", intensity: 2.6 },
      { rect: [0.3, 0.08, 0.08, 0.42, 0.05], color: "#25f0ff", intensity: 2.4 },
      { rect: [0.0, 0.62, 1.6, 0.05, 0.03], color: "#ffffff", intensity: 3.2 },
      { rect: [-0.9, 0.3, 0.06, 0.32, 0.02], color: "#ffffff", intensity: 4.0 },
      { rect: [3.14, 0.1, 0.4, 0.28, 0.08], color: "#7b3cff", intensity: 1.6 },
      { rect: [-1.6, 0.15, 0.35, 0.5, 0.12], color: "#25f0ff", intensity: 1.4 },
    ],
  },
  // ---- chrome shading ----
  chrome: {
    f0: "#e9eef7",          // mirror reflectance tint at normal incidence (chrome is slightly cool)
    edgeBoost: 1.15,        // Fresnel brightening toward silhouettes
    iridescence: 0.0,       // 0 = pure chrome, 0.3-0.6 = oil-slick thin film
    filmThickness: 1.6,     // thin-film rainbow cycles across the facing->grazing range
    occlusion: 0.55,        // crevice darkening where blobs meet (field AO, 3 taps)
    selfReflect: 0.85,      // strength of the blob-reflects-blob second bounce (0 = off)
  },
  // ---- the raymarched liquid ----
  liquid: {
    maxPrims: 40,           // shader slot count (uniform arrays)
    steps: 80,              // primary march steps
    reflectSteps: 22,       // second-bounce march steps
    epsilon: 0.0012,        // hit threshold (relative to distance)
    relax: 0.9,             // step scale (< 1 keeps the wobble displacement safe)
    wobble: { amp: 0.018, freq: 2.6, speed: 1.1 },
    ripple: { freq: 13, speed: 8, decay: 2.0, falloff: 1.1, amp: 0.012, slots: 6 },
    margin: 0.35,           // bounding-box padding around the live prims (m)
  },
  // ---- inflated chrome lettering (stroke font swept as fat tubes) ----
  type: { cap: 0.95, radius: 0.2, letterSpacing: 0.58, wordSpacing: 0.7, lineHeight: 1.75, bend: 0.22, radial: 20, depthScale: 0.85, popDur: 0.75, stagger: 0.06 },
  // ---- flat outlined techno captions (overlay, exact colours) ----
  caption: { font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 800, italic: true, letterSpacing: 0.12, fill: ["#ffffff", "#bfefff"], stroke: "#16084a", strokeWidth: 0.16, shadow: "#ff2bd6", shadowOffset: [0.06, 0.07], height: 0.062 },
  // ---- sparkles + lens flares (screen-space points, HDR so they bloom) ----
  sparkle: { size: 120, color: "#ffffff", level: 3.2, rays: 46, core: 18, diag: 0.35 },
  flare: { halo: 340, haloLevel: 0.18, streak: 900, streakLevel: 0.5, ghosts: [[-0.35, 70, "#25f0ff"], [-0.7, 130, "#ff2bd6"], [-1.1, 50, "#7b3cff"]], ghostLevel: 0.22 },
  // ---- the void ----
  backdrop: {
    stops: ["#0a9fe0", "#3a1aa8", "#a0129e"], angle: 0.5, glow: { color: "#b8a8ff", level: 0.22, radius: 0.5, y: 0.05 },
    orbs: { count: 7, seed: 5, colors: ["#25f0ff", "#ff2bd6", "#ffffff"], size: [0.05, 0.16], level: 0.16, speed: 0.04 },
    level: 0.8,
  },
  grid: { y: -2.6, size: 120, cell: 1.0, line: 0.026, colorNear: "#25f0ff", colorFar: "#ff2bd6", level: 1.0, fade: [3, 38], scroll: 0.35, horizonGlow: 0.6 },
  lens: { barrel: 0.045 },  // fisheye-ish barrel distortion (0 = off)
  motion: [
    "Liquid never rests: the blob is several core spheres circling inside one smooth union (sums of sines), plus a surface wobble.",
    "Splits pinch: cores travel apart on a bowed path while the blend radius swells, so a mercury neck stretches and snaps.",
    "Shapes re-form through a melt: the old shape collapses to a sphere, the new one grows out of it slot by slot (no pops).",
    "Droplets accelerate in on curved paths, stretch into teardrops, sink into the surface and leave a ripple.",
    "Type inflates letter by letter with a springy overshoot; the camera glides on slow arcs through a slight fisheye.",
  ],
};
