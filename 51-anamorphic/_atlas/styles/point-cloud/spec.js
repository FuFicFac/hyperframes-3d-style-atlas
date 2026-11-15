// styles/point-cloud/spec.js — STYLE_SPEC for "Point Cloud Scan (LiDAR)". Plain data only: JSON-serializable, no THREE,
// no window. Importable from Node (export-spec.mjs, scene.config.js for the scan plan + score) and the browser.
// Units: metres, Y-up, sRGB hex, radians.
//
// The look: no surfaces at all. The world exists only as measured dots laid down by a terrestrial laser scanner on a
// tripod: a vertical fan of rays turning slowly in azimuth. Dots carry range rings that spread with distance, SCAN
// SHADOWS (empty holes behind every object, invisible from the scanner and obvious from anywhere else) and a clean
// range colour ramp (cyan near -> yellow -> magenta far) shaded by return intensity, on near-black. scan.js
// (THREE-free) casts the rays and is shared with SCORE.

export const STYLE_SPEC = {
  id: "point-cloud",
  name: "Point Cloud Scan (LiDAR)",
  description:
    "A LiDAR scan made only of measured dots on near-black: a scanner head on a tripod turns while a thin bright laser fan sweeps the room and the world appears dot by dot, coloured by range (cyan near, yellow, magenta far) and shaded by return intensity. No surfaces are ever drawn: objects (a figure, a chair, a bicycle, a plant, a table, walls with a door and a window) exist only as ray targets. The scan shows the tells of a real terrestrial scan: rings and lines that spread with distance, and scan shadows — empty holes behind every object that the laser could not see, hidden from the scanner's own viewpoint and dramatic once the camera orbits away. A second scan from another tripod fills the holes.",
  palette: {
    bg: "#04050a",
    near: "#22d8ff",       // range ramp: near
    mid: "#ffe04a",        //             middle
    far: "#ff3fae",        //             far
    laser: "#c8ffd8",      // the laser fan (pale green-white, outside the ramp)
    flash: "#ffffff",      // a dot's first frame
    scanner: "#5d6470",
    scannerHi: "#c7ccd6",
    ink: "#e8f6ff",
    plate: "#0b0e16",
    edge: "#24324a",
  },
  world: {
    background: "#04050a",
    sky: null,
    fog: null,
    environment: null,
    toneMapping: "neutral",   // the range ramp reads as designed
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    tripod: { type: "standard", baseColor: "#3c414b", roughness: 0.45, metalness: 0.6 },
    head: { type: "standard", baseColor: "#5d6470", roughness: 0.4, metalness: 0.3 },
    headTrim: { type: "standard", baseColor: "#c7ccd6", roughness: 0.3, metalness: 0.5 },
    lens: { type: "standard", baseColor: "#0b0d12", roughness: 0.15, metalness: 0.2, emission: { color: "#c8ffd8", strength: 1.6 } },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#b9c6dd", groundColor: "#05060a", intensity: 0.9 },
    { id: "key", type: "directional", color: "#e9f1ff", intensity: 1.6, position: [4, 6, 5], target: [0, 1, 0] },
    { id: "rim", type: "directional", color: "#7fd8ff", intensity: 1.2, position: [-5, 3, -6], target: [0, 1, 0] },
  ],
  post: {
    bloom: { strength: 0.35, radius: 0.25, threshold: 1.05 },   // only the laser fan and fresh-dot flashes (> 1) bloom
    vignette: { darkness: 0.45, offset: 1.05 },
  },
  camera: { fov: 40, near: 0.05, far: 80, drift: { amp: 0, speed: 0.2 } },  // no drift: still holds keep 100k+ dots still (bitrate)
  text: { font: "sans", weight: 700, color: "#e8f6ff", height: 0.3 },

  // ---- the scanner (scan.js) -------------------------------------------------------------------------------
  scan: {
    nAz: 1440,                 // columns per 360 deg sweep (0.25 deg)
    nEl: 520,                  // rays per column
    elMin: -1.25,              // rad (-72 deg): the blind cone under the tripod is real
    elMax: 1.05,               // rad (+60 deg)
    jitter: 0.35,              // seeded angular jitter (fraction of a step): a measured, not printed, grid
    rangeNoise: 0.004,         // +/- m range noise
    dropout: 0.03,             // share of returns lost at random
    grazing: 0.12,             // cos(incidence) below which returns start to fail
    maxRange: 30,
  },
  dots: {
    splat: 0.85,               // dot world size = range x angular step x splat (1 = edge to edge seen from the scanner)
    minPx: 1.6, maxPx: 9,      // clamp on screen
    ramp: { near: 1.2, far: 7.5 },   // range (m) mapped to near -> mid -> far colour
    shade: [0.42, 1.0],        // intensity (0..1) mapped to brightness
    flash: { dur: 0.22, gain: 1.9 },  // a fresh dot starts white-hot and settles to its colour
  },
  laser: { every: 5, opacity: 0.32, coreOpacity: 0.9, width: 1 },  // fan = one line per `every` rays of the current column
  tripod: { height: 1.45, legSpread: 0.42, legR: 0.014, head: [0.16, 0.24, 0.14] },

  // ---- overlay: caption chip + live dot counter -----------------------------------------------------------
  caption: {
    x: 96, y: 70, h: 88, cap: 38,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#0b0e16", edge: "#24324a", ink: "#e8f6ff",
  },
  counter: { x: 96, y: 960, h: 50, cap: 22, ink: "#9fb3cc", hi: "#22d8ff", plate: "#0b0e16" },

  sound: {
    bin: 1 / 30,
    ticks: { perBin: 3, gain: 0.07, pitch: [2.4, 3.6] },
    whir: { gain: 0.16, hz: [92, 104], second: 1.12, hum: 0.05, humHz: 46 },
    spinup: { lead: 0.5, gain: 0.12, hz: [60, 180] },
    done: { gain: 0.24, chime: 0.1, hz: 330, notes: [1, 1.335] },
    bed: { gain: 0.55, root: 55, brightness: 600 },
  },
  sfx: { enter: "servo", exit: "whooshOut", move: "whir", land: "tick", emphasis: "marimba", ui: "tick", bed: "pad" },
  motion: [
    "A dot exists only once the laser has reached its column: reveal time = sweep start + column / columns x sweep duration.",
    "The head yaws with the sweep; a thin bright fan joins the laser origin to the current column's hits.",
    "Fresh dots flash white for ~0.2 s and settle to their range colour (cyan near -> yellow -> magenta far).",
    "Camera: hold still while dots appear; one move per beat (into the scanner's own eye, then out and above to show the scan shadows).",
    "A second tripod scans from elsewhere and its dots fill the shadows of the first.",
  ],
};
