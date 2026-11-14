// styles/star-chart/spec.js — STYLE_SPEC for "Star Chart". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs; scene.config.js imports it for skyplan.js + SCORE) and the browser.
//
// The look: a planetarium night. A deep blue-black dome of sky with a visible gradient, a Milky-Way band and thousands of
// seeded stars (size + colour variety, gentle deterministic twinkle) over a low dark horizon silhouette (hills, trees, an
// observatory with a warm slit). Over the sky, antique celestial-atlas graphics in fine GOLD line: a coordinate grid, an
// ecliptic with ticks, constellation stick figures, engraved figure outlines and small serif star names.
// Units: the observer stands at the origin; sky layers are spheres of radius ~160–220 m; angles in the planner are degrees.

export const STYLE_SPEC = {
  id: "star-chart",
  name: "Star Chart",
  description:
    "A planetarium night: a deep blue-black dome of sky with a visible gradient, a Milky-Way band and thousands of seeded stars (size and colour variety, gentle deterministic twinkle) over a low dark horizon of hills, trees and an observatory; antique celestial-atlas graphics drawn over it in fine gold line — coordinate grid, ticked ecliptic, constellation stick figures, engraved figure outlines, small serif star names. The invented sky turns about a pole so stars rise, drift and trail; chosen stars brighten one by one, gold lines draw between them into original constellations (each a concept, each star a part), an engraved figure fades up, a name plate writes on, a presenter's arrow sweeps to what is being named, and a dashed line connects two constellations.",
  palette: {
    bg: "#050816",
    zenith: "#050a1f",
    mid: "#0f1f48",
    horizon: "#2f4f86",
    glow: "#7a5568",          // faint warm afterglow low in the west
    gold: "#e8c46c",
    goldBright: "#ffdc8e",
    goldDim: "#b8924a",
    ink: "#f3e3b8",
    hillNear: "#03050b",
    hillFar: "#0c1630",
    slit: "#ffb35c",
    pointer: "#ffd7a3",
  },
  world: {
    background: "#050816",
    toneMapping: "neutral",   // keeps gold gold and the sky blue (ACES desaturates both)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {},              // everything is unlit / custom-shaded (sky, stars, lines, silhouettes)
  lights: [],
  post: {
    bloom: { strength: 0.75, radius: 0.5, threshold: 0.82 },   // star cores, highlighted stars, gold lines (HDR level > 1)
    vignette: { darkness: 0.32, offset: 1.05 },
    grain: { amount: 0.0, fps: 30 },                            // none: twinkling stars already cost bitrate
  },
  camera: { fov: 54, near: 0.5, far: 420, drift: null },
  text: { font: '"Hoefler Text", Baskerville, Georgia, serif', weight: 400, color: "#e8c46c", height: 1 },

  // ---- the turning sky ---------------------------------------------------------------------------------------------
  sky: {
    lat: 38,                                  // pole altitude toward the north (behind the viewer)
    spin: { w0: 3.4, w1: 0.55, tau: 1.6 },    // deg/s: a time-lapse wheel at the start easing to a slow drift
    radius: { gradient: 230, milkyWay: 200, stars: 185, grid: 172, lines: 168, labels: 160 },
  },
  gradient: { horizonGlowAz: 70, glowWidth: 0.9, glowHeight: 0.16, glowLevel: 0.55 },
  catalogue: {
    seed: 4417, count: 5200, bandFrac: 0.42, bandSigma: 6.5,   // share crowding the Milky-Way band, its gaussian width (deg)
    magMin: -1.0, magMax: 6.4, magRef: 3.0,
    sizeMin: 2.3, sizeK: 1.0,                // px: faint stars ~2 px, the brightest ~9 px (bloom adds the glow)
    intensity: 2.0, fluxGamma: 0.5,         // linear intensity at magRef; < 1 compresses the magnitude range
    colors: [["#a9c4ff", 14], ["#d8e4ff", 26], ["#fff8ee", 30], ["#ffeec8", 16], ["#ffd29a", 10], ["#ffab7a", 4]],
  },
  twinkle: { amp: 0.22, rate: [0.9, 2.6], horizonBoost: 1.6 },
  milkyWay: { through: [[-14, 2], [30, 80]], at: 7, width: 8.0, level: 0.3, core: "#d9dbe6", edge: "#6f88c8", lanes: 0.72, knots: 0.5 },
  trails: { mag: 2.7, tau: 1.3, pieces: 3, width: 1.5, level: 0.5, color: "#dfe6ff", minRate: 0.9 },
  grid: { raStep: 15, decs: [-45, -30, -15, 0, 15, 30, 45, 60, 75], width: 1.15, level: 0.42, color: "#c9a453", equatorLevel: 0.62 },
  ecliptic: { through: [[-62, 12], [62, 44]], at: 8, width: 1.9, level: 0.9, color: "#e8c46c", tickEvery: 5, tickDeg: 0.55, majorEvery: 30, majorDeg: 1.3 },
  hero: {
    base: 3.2, baseIntensity: 1.2,            // before lighting: an ordinary bright-ish star
    size: 30, intensity: 5.0,                 // lit: big warm core + halo + faint engraved rays
    color: "#fff1d0", halo: "#ffcf7a", spikes: 0.5,
    rise: 0.22, flare: 0.7, flareDecay: 0.35, finaleBoost: 0.25,
  },
  lines: {
    width: 2.3, level: 1.5, color: "#e8c46c",  // level > 1 = HDR: the gold carries real brightness and blooms a little
    gapDeg: 1.05, delay: 0.08, dur: 0.42,      // atlas gap at each star; line starts after the later star lights
    ringDeg: 0.85, ringDur: 0.32, ringWidth: 1.3, ringLevel: 1.15,
  },
  figure: { width: 1.3, level: 0.72, color: "#d6ae5c", dur: 1.0 },
  link: { width: 2.0, level: 1.35, color: "#ffdc8e", dash: [2.6, 1.6, 0, 0] },
  plate: {
    font: '"Hoefler Text", Baskerville, Georgia, serif', weight: 600, heightDeg: 2.5, tracking: 0.22, level: 0.88,
    color: "#ffdc8e", writeDur: 0.9, soft: 0.06, widthUnits: 1.1,
  },
  names: { font: '"Hoefler Text", Baskerville, Georgia, serif', italic: true, weight: 400, heightDeg: 1.45, level: 1.3, color: "#f0d08a", offsetDeg: 1.25, fade: 0.35 },
  pointer: {
    color: "#ffd7a3", intensity: 1.5, lengthDeg: 3.0, widthDeg: 1.25, gapDeg: 1.0, sweep: 0.55, fadeIn: 0.35, wobbleDeg: 0.06,
    beam: { origin: [3.2, -1.4, -2.6], width: 2.4, level: 0.22 },
  },
  shooting: { lenDeg: 9, width: 2.2, level: 2.2, color: "#fff4dc" },
  horizon: {
    near: { radius: 52, alt: [1.0, 5.2], seed: 31, color: "#03050b" },
    far: { radius: 88, alt: [2.4, 7.5], seed: 57, color: "#0b152e" },
    trees: [
      { az: -48, alt: 4.2, h: 5.5, kind: "fir" }, { az: -45.5, alt: 4.0, h: 4.2, kind: "fir" }, { az: -43, alt: 4.1, h: 6.2, kind: "fir" },
      { az: -14, alt: 2.6, h: 3.6, kind: "round" }, { az: 9, alt: 2.0, h: 3.0, kind: "round" },
      { az: 49, alt: 3.2, h: 4.8, kind: "fir" }, { az: 51.5, alt: 3.4, h: 3.6, kind: "fir" },
    ],
    observatory: { az: 31, alt: 3.6, size: 3.4, slit: "#ffb35c", slitLevel: 0.75, window: "#ffc477" },
  },
  caption: {
    x: 96, y: 924, h: 92, cap: 44,
    font: '"Hoefler Text", Baskerville, Georgia, serif', weight: 600,
    panel: "rgba(5,8,22,0.82)", rule: "#c9a453", ink: "#f3d892", star: "#ffdc8e",
  },

  sound: {
    ping: { gain: 0.22, pitch: 0.62, magTop: 1.8, magStep: 0.3 },
    line: { gain: 0.035, pitch: 2.4 },
    figure: { gain: 0.07, pitch: 0.9 },
    plate: { gain: 0.11, pitch: 0.42 },
    sweep: { gain: 0.03, pitch: 1.6 },
    link: { gain: 0.05, pitch: 0.8 },
    linked: { gain: 0.12, pitch: 0.5 },
    shoot: { gain: 0.06, pitch: 2.6 },
    grid: { gain: 0.05 },
    bed: { gain: 0.95, root: 110, chord: [0, 7, 12, 16, 19], brightness: 850 },   // the bowed pad (brightness = Hz)
    dome: { gain: 0.7, root: 55, chord: [0, 7, 12], brightness: 260 },            // the low dome hum
    hum: { gain: 0.04 },
  },
  sfx: { enter: "chime", exit: "whooshOut", move: "whoosh", land: "chime", emphasis: "sparkle", ui: "chime", bed: "pad" },
  motion: [
    "The whole invented sky turns about a pole as a pure function of time: a short time-lapse wheel at the start (bright stars trail), easing to a slow drift, so stars rise in the east and set behind the hills in the west.",
    "Constellation: chosen stars brighten one by one with a flare and a soft glass ping, an engraved gold ring circles each, and gold lines draw star to star (with the atlas gap at each end).",
    "Figure and name: an engraved gold figure outline fades and draws up around the stick figure; the name plate writes on left to right with a bright pen edge; italic star names fade in beside each star.",
    "Pointer: a warm presenter's arrow sweeps on great circles to each star as it is named, a faint beam back to the presenter; a dashed gold line connects two constellations while the arrow glides along it.",
  ],
};
