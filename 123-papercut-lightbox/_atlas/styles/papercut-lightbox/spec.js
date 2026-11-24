// styles/papercut-lightbox/spec.js — STYLE_SPEC for "Papercut Lightbox". Plain data only (JSON-safe, no THREE, no window).
// Units: metres, Y-up right-handed, colours sRGB hex, angles radians, three.js light units.
// A deep walnut shadow box on a slate wall holds seven sheets of white cut paper 14 mm apart. Lit from the room it is
// white on white; lit from behind, every sheet glows by how many sheets the light has already passed through.
// WHAT is cut, WHEN each sheet slides in and where the backlight is live in layers.js (planner); this file holds the look.

export const STYLE_SPEC = {
  id: "papercut-lightbox",
  name: "Papercut Lightbox",
  description:
    "Seven sheets of white cut paper slide into the slots of a deep walnut shadow box: white on white under the room light, then lit from behind they become a glowing misty valley, far sheets bright and cool, near sheets dark and warm.",
  palette: {
    bg: "#34404c",
    wall: "#34404c",
    paper: "#f7f4ee",
    walnut: "#4f3221",
    slot: "#140c07",
    panel: "#b4b0a9",
    dawn: "#c8dcff",
    dawnGlow: "#ffe0c4",
    sunset: "#ffae6a",
    sunsetGlow: "#ff7f36",
    lamp: "#ffb347",
    plate: "#1f150e",
    caption: "#fbf3e4",
    accent: "#f2a03d",
  },
  world: {
    background: "#34404c",
    fog: null,
    environment: null,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    wall: { type: "standard", baseColor: "#55677a", roughness: 0.96, metalness: 0 },
    walnut: { type: "standard", baseColor: "#ffffff", roughness: 0.55, metalness: 0 },
    slot: { type: "standard", baseColor: "#2a1a10", roughness: 0.9, metalness: 0 },
    backboard: { type: "standard", baseColor: "#2a1a10", roughness: 0.8, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#f3f5ff", groundColor: "#e6dfd3", intensity: 1.45 },
    // the raking room light: a low lamp at the lower left, in front, ~40° off the sheet normal. A ridge has paper BELOW
    // it, so only a light from below throws its shadow UP onto the sheet behind, where it shows as a band above every
    // cut edge. On the sheets that shadow is analytic (style.js roomShadow: sharp next to the edge, softer the further
    // behind); the shadow map only serves the box and the wall.
    { id: "key", type: "directional", color: "#fffaf2", intensity: 4.6, position: [-0.52, -0.42, 0.74], target: [0, 0, -0.04],
      shadow: { softness: 3, mapSize: 2048, extent: 0.42, near: 0.05, far: 3, bias: -0.0003, normalBias: 0.002 } },
  ],
  post: {
    bloom: { strength: 0, radius: 0.45, threshold: 1.15 },
    vignette: { darkness: 0.2, offset: 1.15 },
  },
  camera: { fov: 30, near: 0.02, far: 6, drift: { amp: 0.0007, speed: 0.3 } },
  text: { font: "sans", weight: 800, color: "#fbf3e4", height: 0.03 },

  // ---- the look of each part (read by style.js) -------------------------------------------------------
  frame: {
    opening: [0.48, 0.27], // the window in the walnut front lip (m); the sheets behind it are 0.522 × 0.312
    lipDepth: 0.012, wallT: 0.025, backT: 0.008,
    castShadow: true,
    woodTile: 0.45, // metres of wall per wood texture tile
    wood: { size: 1024, boards: 1, seed: 61, grainFreq: 30, grainWarp: 1.6, contrast: 0.4, dark: "#5a3822", mid: "#7c5234", light: "#a0714a", seam: "#3e2616" },
  },
  paper: {
    color: "#fbfaf7", roughness: 0.93,
    formation: 0.1, // backlit paper is cloudy: transmission varies ±5 % (also the seeded dither against banding)
    formationScale: 9.0, // tiles per metre of the formation noise
    roomMottle: 0.03, // the same cloudiness, much weaker, under the room light
  },
  backlight: {
    // paper lets this fraction of each colour through (linear): red passes best, so deeper sheets turn darker AND warmer
    tau: [0.56, 0.47, 0.38],
    gain: 3.0, // backlight level that reaches the back sheet (linear)
    base: 0.44, // even part of the diffuser panel
    hot: 1.05, // plus a soft hot spot centred on the light (σ below): a dawn glow low behind the mountains
    hotSigma: 0.15,
    soft: 14, // 1/m: a projected sheet edge softens with distance (dz·soft: 0 sharp .. 1 softest of four mask levels)
    panelGain: 2.3, // the diffuser seen directly (moon, stars): brighter than the light through a sheet
    dawn: "#a9c3ff", dawnGlow: "#ffd6ae", sunset: "#ffa45e", sunsetGlow: "#ff7a30",
    lamp: "#ffb347", lampGain: 4.0, lampR: 0.011, lampHalo: 0.014, lampHaloGain: 0.45,
    bloom: 0.26, // bloom strength at full backlight
  },
  room: {
    key: 4.4, fill: 1.45, fillDark: 0.0,
    shadow: 0.8, // how much of the key a sheet in front blocks (the hemisphere fill is never blocked)
    soft: 11, // 1/m: shadow softness grows with the gap between caster and sheet (dz·soft: 0 sharp .. 1 softest)
    frame: 0.3, // how dark the walnut lip's soft shadow falls on the sheets
  },

  // ---- overlay caption (bottom-left, exact colours): the new line slides in from the right like a sheet into its slot,
  //      pushing the old line out to the left — never two lines cross-faded on top of each other ----
  caption: {
    x: 100, y: 896, h: 98, cap: 46, maxW: 980,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "rgba(31,21,14,0.92)", ink: "#fbf3e4", accent: "#f2a03d", shadow: "rgba(0,0,0,0.32)",
    roll: 0.28, // seconds of the slide at each beat change
    lead: 0.3, // the slide starts this long before the beat (done 0.02 s before it)
  },

  sound: {
    bed: { gain: 0.3, root: 98, brightness: 650 },
    swell: { gain: 0.62, root: 98, brightness: 1100 },
    slide: { gain: 0.5 },
    click: { gain: 0.55 },
    switch: { gain: 0.7 },
    wind: { gain: 0.34 },
    lamp: { gain: 0.42, hz: 392 },
  },
  sfx: { enter: "paper", exit: "whooshOut", move: "whoosh", land: "click", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Sheets slide into their slots from the right (outCubic, a click as each lands), back sheet first.",
    "Room light: a raking key from the upper left; every cut edge throws a thin shadow onto the sheet behind.",
    "Backlight: a sheet glows by the light left after every sheet between it and the lamp (soft projected masks), so near sheets go darker and warmer; moving the lamp sweeps every projected edge.",
    "Camera: oblique close-up while the first sheets slide, front view for the stack, a sideways track for parallax.",
  ],
};
