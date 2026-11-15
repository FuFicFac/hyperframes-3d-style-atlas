// styles/cubism/spec.js — STYLE_SPEC for "Cubism". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the facet plan + score) and the browser.
//
// The look: a café still life (guitar, bottle, wine glass, fruit bowl, folded newspaper on a round wooden table) is
// rendered from several cameras into render targets. The picture plane is a flat 16:9 sheet cut into angular convex
// facets; each facet shows the still life through ITS OWN camera, so one picture holds many viewpoints at once.
// Palette moves from the plain lit render -> analytic (ochre / umber / grey bands, facet "passage" shading, ink lines)
// -> synthetic (flat 3-tone coloured papers, faux-bois wood grain, newsprint with stencilled letters, wallpaper,
// charcoal drawing) -> bold. Canvas weave, brush grain and dark contour lines on every facet edge.

export const STYLE_SPEC = {
  id: "cubism",
  name: "Cubism",
  description:
    "Analytic-to-synthetic Cubism made from a real 3D still life: a guitar, bottle, wine glass, fruit bowl and folded newspaper on a round café table are rendered from six cameras into render targets, and the flat picture plane fractures into angular convex facets that EACH show the same still life from a different viewpoint (front three-quarter, bird's-eye table top, left, right, eye level, tilted) - simultaneous viewpoints. Facets crack in with dark contour lines, their cameras swing apart, they slide, rotate and overlap; the palette drains to analytic ochre/umber/grey bands with facet passage shading and ink edges, then pieces flip over like card to synthetic collage (flat coloured paper, faux-bois wood grain, newsprint with stencilled letters, wallpaper, charcoal drawing) and the whole settles into a bold flat composition. Canvas weave and brush grain over everything. Every facet pose, crack, swing and flip comes from one seeded plan (facets.js) that also writes the sound.",
  palette: {
    bg: "#d9ccb0",
    wall: "#dccfb4",
    wallLow: "#b9a888",
    wood: "#8a5a34",
    woodDark: "#4c2f1b",
    spruce: "#d9a85e",
    guitarSide: "#7a4423",
    bottle: "#2f5a3e",
    glass: "#dfe7e3",
    wine: "#6e1f24",
    ceramic: "#ece4d2",
    lemon: "#e6c23a",
    apple: "#b6402c",
    pear: "#9aaa4a",
    news: "#ece4cf",
    ink: "#1c1712",
    // analytic ramp (dark -> light) and facet tints
    umber: "#3d2c1f",
    sienna: "#8a6640",
    ochre: "#c8a66a",
    greyLight: "#ddd5c2",
    tintGreen: "#9aa088",
    tintBlue: "#8e98a2",
    tintWarm: "#c9a477",
    // synthetic papers
    blue: "#2d4f86",
    vermilion: "#c8442c",
    green: "#3f6b4a",
    cream: "#efe5cc",
    black: "#1d1a17",
    brown: "#6b4426",
    yellow: "#e2b23c",
  },
  world: {
    background: "#d9ccb0",
    sky: null,
    environment: "room",
    environmentIntensity: 0.35,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    tableTop: { type: "standard", baseColor: "#ffffff", roughness: 0.55, metalness: 0, map: { source: "wood", size: 1024, boards: 4, seed: 61, dark: "#5a3520", mid: "#8a5a34", light: "#b07a4a", description: "warm planked walnut table top" } },
    tableDark: { type: "standard", baseColor: "#4c2f1b", roughness: 0.6, metalness: 0 },
    floor: { type: "standard", baseColor: "#7d6a55", roughness: 0.9, metalness: 0 },
    spruce: { type: "standard", baseColor: "#d9a85e", roughness: 0.42, metalness: 0 },
    guitarSide: { type: "standard", baseColor: "#7a4423", roughness: 0.4, metalness: 0 },
    fretboard: { type: "standard", baseColor: "#2a1d14", roughness: 0.5, metalness: 0 },
    hole: { type: "basic", baseColor: "#140d08" },
    string: { type: "standard", baseColor: "#e6e1d6", roughness: 0.3, metalness: 0.8 },
    bottle: { type: "physical", baseColor: "#2f5a3e", roughness: 0.18, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.1 },
    glass: { type: "physical", baseColor: "#e7efea", roughness: 0.08, metalness: 0, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.05 },
    wine: { type: "standard", baseColor: "#6e1f24", roughness: 0.2, metalness: 0 },
    ceramic: { type: "standard", baseColor: "#ece4d2", roughness: 0.35, metalness: 0 },
    lemon: { type: "standard", baseColor: "#e6c23a", roughness: 0.55, metalness: 0 },
    apple: { type: "standard", baseColor: "#b6402c", roughness: 0.4, metalness: 0 },
    pear: { type: "standard", baseColor: "#9aaa4a", roughness: 0.5, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fff6e8", groundColor: "#8a7a64", intensity: 1.15 },
    {
      // warm studio-window key from front-left: crisp shadows of the bottle and guitar across the table top
      id: "key", type: "directional", color: "#fff1dc", intensity: 2.4, position: [-2.2, 3.4, 2.0], target: [0, 0.75, 0],
      shadow: { softness: 2.0, mapSize: 2048, extent: 1.1, near: 0.5, far: 9, bias: -0.0005, normalBias: 0.012 },
    },
    { id: "rim", type: "directional", color: "#dfe6f2", intensity: 0.8, position: [2.0, 2.2, -2.6], target: [0, 0.75, 0] },
  ],
  post: {
    vignette: { darkness: 0.22, offset: 1.2 },
  },
  camera: { fov: 34, near: 0.1, far: 40, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#1c1712", height: 0.3 },

  // ---- the picture plane ---------------------------------------------------------------------------------
  frame: {
    w: 3.2, h: 1.8,          // visible picture plane (m); the stage camera frames exactly this at rest
    overscan: 1.08,          // facets / views cover this much more so slides and the end push never show an edge
    rt: [1600, 900],         // render-target size per viewpoint (covers the overscanned plane)
    rtSamples: 4,
  },
  facets: { count: 14, seed: 62, focus: [0.05, -0.05], aimShare: 0.55, minShare: 0.03, maxVerts: 8, keepMain: 2 },

  // ---- the still life (metres, table centre at the origin) -----------------------------------------------
  still: {
    table: { r: 0.64, y: 0.74, th: 0.04 },
    subject: { box: [[-0.62, 0.72, -0.5], [0.62, 1.1, 0.52]] },   // what every view frames (fitShot)
    guitar: { at: [-0.05, 0.10], yaw: 0.62, scale: 1.0 },
    bottle: { at: [0.26, -0.22] },
    glass: { at: [0.38, 0.12] },
    bowl: { at: [-0.32, -0.26] },
    news: { at: [0.18, -0.08], yaw: -0.35 },
  },
  // six viewpoints: azimuth/elevation (rad) around the still life; fill = share of the frame window
  views: [
    { id: "front", az: 0.3, el: 0.62, fill: 0.98 },
    { id: "above", az: 0.15, el: 1.42, fill: 0.96, roll: 0.35 },
    { id: "left", az: -1.05, el: 0.38, fill: 0.98 },
    { id: "right", az: 1.25, el: 0.30, fill: 0.98, roll: -0.12 },
    { id: "level", az: -0.2, el: 0.12, fill: 1.0 },
    { id: "tilt", az: 0.75, el: 0.9, fill: 0.96, roll: 0.28 },
  ],
  orbit: { az: [0.12, 0.3], el: [0.58, 0.62] },   // view 0's slow opening move (the "ordinary 3D" beat)

  // ---- facet motion (plane metres / radians / seconds) -----------------------------------------------------
  facetMotion: {
    crack: { start: 0.05, spread: 0.55, dur: 0.3 },
    swing: { start: 0.5, step: 0.34, dur: 1.25 },
    slide1: [0.03, 0.09], slide1Dur: 1.0,
    slide2: [0.07, 0.19], slide2At: [0.1, 1.3], slide2Dur: 1.5,
    lateral: 0.05, rot1: 0.05, rot2: 0.09,
    overlap: [1.04, 1.12],
    zRange: 0.05, reliefZ: 0.05,
    finalKeep: [0.25, 0.6], resolveSpread: 0.45, resolveDur: 1.4,
    palette: { analytic: [0.35, 2.6], synth: [0.1, 1.7], bold: [0.2, 1.5] },
  },
  collage: {
    flips: 6, flipStart: 0.2, flipStep: 0.26, flipDur: 0.7,
    kinds: [2, 1, 0, 3, 4, 0],          // 0 coloured paper, 1 wood grain, 2 newsprint, 3 charcoal drawing, 4 wallpaper
    papers: ["#2d4f86", "#c8442c", "#3f6b4a", "#e2b23c"],
    extraStart: 1.7, extraStep: 0.32, extraDur: 0.6,
    tints: 3, synthSets: 4,
    words: ["LE JOUR", "BAR", "VIN", "CAFÉ"],
  },
  look: {
    lineW: 0.0055, lineBold: 0.0045, lineJitter: 0.35,   // facet contour width (m) + bold extra + brush wobble
    innerInk: [0.09, 0.26],                              // sobel thresholds for drawn lines inside each view
    bands: 5,                                            // analytic posterise bands (soft steps)
    passage: 0.28,                                       // facet light->dark gradient strength (analytic)
    weave: [0.035, 0.09],                                // canvas weave strength: plain render -> painted
    brush: 0.07,                                         // brush-grain strength (analytic onward)
  },
  caption: {
    x: 960, y: 918, h: 80, cap: 36, maxW: 900,
    font: '"Avenir Next Condensed", "Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    paper: "#efe5cc", edge: "#1c1712", ink: "#1c1712", accent: "#c8442c",
  },

  sound: {
    strum: 0.55,
    crack: { thud: 0.5, clack: 0.35 },
    tick: 0.22,
    swing: { whoosh: 0.22, pluck: 0.32 },
    slide: 0.16,
    flip: { paper: 0.45, marimba: 0.18 },
    paste: { paper: 0.4, thud: 0.25 },
    resolve: { strum: 0.6, chime: 0.14 },
    bed: [
      { root: 196, chord: [0, 7, 12], brightness: 1100, gain: 0.22 },
      { root: 147, chord: [0, 3, 7, 10], brightness: 650, gain: 0.26 },
      { root: 131, chord: [0, 3, 7, 12], brightness: 600, gain: 0.26 },
      { root: 196, chord: [0, 4, 7, 11], brightness: 1500, gain: 0.22 },
      { root: 196, chord: [0, 4, 7, 12, 16], brightness: 1300, gain: 0.24 },
    ],
  },
  sfx: { enter: "pluck", exit: "whooshOut", move: "whoosh", land: "paper", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Each facet shows the still life through its own camera (render targets); facets keep their image as they slide.",
    "Cracks propagate outward from the subject; each viewpoint's camera swings from the common view to its own on an arc.",
    "Facets flip over like card about an in-plane axis to reveal collage backs; cut-outs slide in and stick.",
    "Stage camera is locked except a slow push-in during the resolve.",
  ],
};
