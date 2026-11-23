// styles/fogged-glass/spec.js — STYLE_SPEC for "Fogged Glass". Plain data only: JSON-serializable, no THREE, no window.
// Units: metres (the pane is 3.2 x 1.8 m, 16:9), Y-up right-handed, colours sRGB hex, angles radians.
// Plan space ("ppx", fogplan.js): 1920 x 1080 units across the pane, x right, y down  (600 ppx per metre).
// The look: a steamed-up window pane in a wooden frame. Behind it a bright sunrise town (painted once, sharp) that the
// fog turns into milky colour blobs and bokeh discs. A finger wipes clear strokes; drops gather under them and run down;
// the fog creeps back over the oldest strokes; a palm wipes the lot.

export const STYLE_SPEC = {
  id: "fogged-glass",
  name: "Fogged Glass",
  description:
    "A steamed-up window pane: behind it a bright sunrise town (sky, balloons, skyline, river, lamps) painted once into a sharp texture and once into a pre-blurred, milky, bokeh-dotted 'fogged' texture. An unseen finger writes in the condensation: the fog mask is a pure function of t — for every pixel, clear = max over planned strokes of (drawn by now x re-fogging decay), redrawn from the plan each frame into a small mask canvas (no accumulation). The pane shader shows the fogged texture where the mask is 0 and the sharp scene where it is 1, with a beaded boundary, a refracting lit/shaded water rim along every wiped edge, a wet sheen on fresh strokes and lens-like drops that gather under the strokes and run down with stick-slip, leaving clear trails. Old strokes narrow and fog over; a palm sweep clears the whole pane and the last fog evaporates. Squeaks, drip plinks, the palm swipe and the reveal chime come from the same plan (fogplan.js).",
  palette: {
    bg: "#d6cbbb",
    wall: "#d6cbbb",
    wood: "#7a553c",
    milk: "#eef1f4",
    skyTop: "#2c4aa0",
    skyMid: "#7466c4",
    coral: "#ee7f7a",
    gold: "#ffd98a",
    river: "#3f6fa8",
    roof: "#4a2a57",
    lamp: "#ffd36a",
    ink: "#1b2140",
    accent: "#ffb23c",
  },
  world: {
    background: "#d6cbbb",
    environment: null,
    toneMapping: "none",   // the pane is an unlit picture: colours come out exactly as painted
    exposure: 1.0,
  },
  materials: {
    wall: { type: "standard", baseColor: "#d6cbbb", roughness: 0.95, metalness: 0 },
    wood: { type: "standard", baseColor: "#8a6144", roughness: 0.7, metalness: 0 },
    sill: { type: "standard", baseColor: "#e9e2d6", roughness: 0.6, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fff4e6", groundColor: "#b9a995", intensity: 2.1 },
    { id: "key", type: "directional", color: "#fff0dc", intensity: 1.2, position: [-2.5, 3.5, 5.0], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.22, offset: 1.15 },
  },
  camera: { fov: 30, near: 0.2, far: 60, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#1b2140", height: 0.3 },

  // ---- the pane ---------------------------------------------------------------------------------------------
  pane: {
    w: 3.2, h: 1.8,             // m (16:9: the final shot fills the frame with it)
    frame: 0.16, frameDepth: 0.12,
    backdrop: 6.0,              // m: how far behind the glass the scene sits (parallax when the camera moves)
    restDistance: 3.359,        // m: camera distance at which the pane exactly fills a 30 degree frame
    zoom: 0.92,                 // fraction of the scene texture seen at rest (the margin is for parallax)
    mask: [960, 540],           // fog-mask canvas (redrawn from the plan every frame)
  },
  woodGrain: { freq: 26, contrast: 0.55, dark: "#7a5236", mid: "#a87a54", light: "#d2a274" },  // the frame's painted grain
  // ---- the fog ----------------------------------------------------------------------------------------------
  fog: {
    blur: 34,                   // px on the 2048 px scene bake (done ONCE at build)
    milk: "#eef1f4", milkAmount: 0.66,        // how white the condensation is (baked into the fogged texture)
    milkBottom: 0.1,            // extra milk toward the bottom of the pane (denser condensation)
    bokeh: { gain: 0.62, rim: 0.3, scale: 1.0 },   // out-of-focus discs of the scene's lights, screened over the milk
    bead: { amount: 0.08, scale: 2.1, edge: 0.26 },  // micro-droplet grain on the fog / how far it breaks up a wiped edge
    rim: { light: 0.55, dark: 0.34, refract: 0.02, dir: [-0.5, 0.8] },  // the water bead along a wiped edge
    wiped: { gain: 0.96, residue: 0.1, sheen: 0.07 },   // the view through a stroke; fog specks left in it; wet sheen
    evaporate: { noise: 0.75 }, // patchiness of the final burn-off
    reflection: 0.035,          // faint room sheen on the glass
  },
  drop: { lens: 11, rimDark: 0.55, highlight: 0.95, squash: 0.74 },
  // ---- the scene behind the glass (painted once; 2048 x 1152) -------------------------------------------------
  scene: {
    size: [2048, 1152], seed: 23, horizon: 0.7,
    sky: [[0, "#2c4aa0"], [0.4, "#7466c4"], [0.7, "#ee7f7a"], [0.9, "#ff9f4a"], [1, "#ffd98a"]],
    sun: { u: 0.2, r: 80, glow: 560, color: "#fff6d0", glowColor: "255,232,160" },
    cloud: { top: "#5a55a8", bottom: "#ff9a86", count: 10 },
    hills: ["#9a78c0", "#7658a8"],
    city: { dark: "#2c2660", light: "#453a86", window: "#ffd870", windowHot: "#ffae4a", rim: "#ff9f6e", lit: 0.34 },
    river: { far: "#ffc878", mid: "#d8789a", near: "#3f5fa8", glitter: "#fff3c0", ripple: "#2a3f86" },
    bank: { color: "#4f4580", rail: "#2a2358", lamp: "#ffe9a8", lampGlow: "255,214,120", tree: "#1f5d5a", treeRim: "#ffa860" },
    roofs: { a: "#4a2a57", b: "#5d3466", rim: "#ff9d5c", window: "#ffd870", chimney: "#3a2046" },
    balloons: [
      { u: 0.53, v: 0.28, r: 128, a: "#e8433f", b: "#fff1d0" },
      { u: 0.83, v: 0.34, r: 80, a: "#1fa7a0", b: "#ffd24a" },
      { u: 0.685, v: 0.47, r: 46, a: "#8a4fd0", b: "#ff9f4a" },
    ],
    bird: "#2a2358",
  },
  // ---- overlay caption chip ---------------------------------------------------------------------------------
  caption: {
    x: 960, y: 30, h: 92, cap: 40, maxW: 960,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#1b2140", edge: "#ffb23c", ink: "#ffffff", dot: "#ffd98a",
  },
  sound: {
    bed: { gain: 0.44, root: 146.83, chord: [0, 7, 12, 16, 19], brightness: 1000 },
    squeak: { hz: 980, grit: 0.08, gain: 0.07, rub: 0.3 },
    plink: { gain: 0.3, note: 0.16 },
    refog: { gain: 0.16 },
    palm: { gain: 0.5, hz: 520, squeal: 0.1 },
    reveal: { gain: 0.5, pad: 0.3 },
  },
  sfx: { enter: "penScratch", exit: "whooshOut", move: "whoosh", land: "bubble", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "Finger strokes are timed polylines: clear = max over strokes of (drawn by now x re-fogging decay); the mask is redrawn from the plan every frame.",
    "Old strokes narrow from the edges and fade as the fog creeps back, in the order they were written.",
    "Drops gather under the lowest point of a stroke, let go and run down with closed-form stick-slip and a seeded wobble, leaving clear trails.",
    "Finale: a palm sweeps two wide arcs, the last corners evaporate in patches and the sharp scene fills the frame.",
    "Camera: slightly oblique at the start (frame and wall visible, parallax through the glass), square-on while the finger writes, one slow push at the reveal.",
  ],
};
