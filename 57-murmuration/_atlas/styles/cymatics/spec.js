// styles/cymatics/spec.js — STYLE_SPEC for "Cymatics" (Chladni plate). Plain data only: JSON-serializable, no THREE,
// no window. Importable from Node (export-spec.mjs, scene.config.js for the grain plan + score) and the browser.
// Units: metres. The plate is toy-scale exaggerated (2.4 m square) so a single sand grain (~6 mm) still reads at 1080p.
//
// The look: a dark anodised square plate on a speaker-driver post over a clean, light lab bench. Tens of thousands of
// bright warm-white sand grains. A tone plays; grains on antinodes bounce, grains on nodal lines sit still, and the
// sand gathers into the crisp nodal figure of that mode. chladni.js plans every grain from one mode list; the same
// list drives the tones, the sand hiss and the lock chimes.

export const STYLE_SPEC = {
  id: "cymatics",
  name: "Cymatics",
  description:
    "Sound builds the picture: a dark anodised square metal plate on a speaker driver, dusted with tens of thousands of bright warm-white sand grains, on a clean light lab bench under a strong soft key light. A tone plays and the sand dances (grains on antinodes hop, grains on nodal lines sit still) and gathers into the crisp geometric nodal-line figure of that frequency (Chladni figure, w = cos(n pi x)cos(m pi y) +/- cos(m pi x)cos(n pi y)); the pitch steps up and the figure shatters and re-forms into a more intricate one. Every grain's settled position per mode is precomputed (seeded Newton steps onto the nodal set + a little spread); motion is a closed-form blend with per-grain delay plus a hop proportional to the local plate amplitude. The plate flexes slightly with the mode shape. Sustained tones, a sand hiss and lock chimes come from the same mode list.",
  palette: {
    bg: "#cfcac1",
    bench: "#d8d3ca",
    benchEdge: "#9c968c",
    plate: "#1d2129",
    plateEdge: "#4a505c",
    sand: "#f6ecd8",
    sandShade: "#e6d3b0",
    driver: "#2a2c31",
    brass: "#b9975b",
    ink: "#1b1d22",
    accent: "#e2803a",
    display: "#7cf0b4",
  },
  world: {
    background: "#cfcac1",
    sky: null,
    fog: { color: "#cfcac1", near: 9, far: 22 },
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",
    exposure: 1.05,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#d8d3ca", roughness: 0.82, metalness: 0, bump: { source: "bumpNoise", scale: 40, octaves: 3, seed: 53, strength: 0.15, description: "fine fbm noise: matte laminate bench top" } },
    benchEdge: { type: "standard", baseColor: "#9c968c", roughness: 0.7, metalness: 0 },
    plate: { type: "physical", baseColor: "#1d2129", roughness: 0.38, metalness: 0.65, clearcoat: 0.25, clearcoatRoughness: 0.4 },
    plateEdge: { type: "standard", baseColor: "#4a505c", roughness: 0.3, metalness: 0.9 },
    driver: { type: "standard", baseColor: "#2a2c31", roughness: 0.55, metalness: 0.3 },
    brass: { type: "standard", baseColor: "#b9975b", roughness: 0.3, metalness: 1 },
    box: { type: "standard", baseColor: "#e9e5dd", roughness: 0.5, metalness: 0 },
    knob: { type: "standard", baseColor: "#24262b", roughness: 0.4, metalness: 0.2 },
    cable: { type: "standard", baseColor: "#2b2d33", roughness: 0.6, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fbf7f0", groundColor: "#8f8a82", intensity: 0.9 },
    {
      // soft high key from front-left: lights the sand bright, throws short soft shadows back-right
      id: "key", type: "directional", color: "#fff4e4", intensity: 2.6, position: [-3.2, 6.2, 3.4], target: [0, 0, 0],
      shadow: { softness: 2.2, mapSize: 2048, extent: 2.6, near: 0.5, far: 20, bias: -0.0004, normalBias: 0.01 },
    },
    // cool back light: a thin rim on grain tops and the plate's far edge
    { id: "rim", type: "directional", color: "#cfe0ff", intensity: 0.7, position: [2.5, 3.0, -5.0], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.32, offset: 1.1 },
  },
  camera: { fov: 34, near: 0.2, far: 40, drift: { amp: 0, speed: 0.2 } },   // no drift: still holds keep 40k grains still
  text: { font: "sans", weight: 700, color: "#1b1d22", height: 0.3 },

  // ---- the plate -----------------------------------------------------------------------------------------
  plate: {
    size: 2.4,              // m, square (toy-scale)
    thickness: 0.03,
    y: 0.62,                // top surface height above the bench
    segments: 96,           // top-surface grid for the flex
    flex: 0.012,            // m of bend at |w| = 2 (static mode-shape flex while a tone plays)
    bevel: 0.006,
    post: { r: 0.09, driverR: 0.36, driverH: 0.22 },
  },
  bench: { size: 30, y: 0 },

  // ---- the sand ------------------------------------------------------------------------------------------
  sand: {
    grains: 24000,
    size: [0.0055, 0.0095],   // grain radius range (m)
    hop: 0.024,                // m hop height on an antinode at full drive
    kick: 0.16,                // plate units: gaussian 'shatter' kick before a grain walks to its nearest new line
    mix: 0.4,                  // share of grains re-dealt from a uniform start at each pitch step (fills new lines evenly)
    spread: 0.0045,            // plate units: gaussian sd across a nodal line (line width)
    margin: 0.012,
    tint: 0.12,                // per-grain colour variance toward sandShade
    seed: 53,
  },
  move: { delay: [0, 1.0], jitter: 0.08, dur: [0.75, 1.0], dance: 0.0, danceHz: [1.5, 2.5] },   // per-grain gather timing + perpendicular dance
  straggle: { share: 0.02, delay: [0.5, 2.6], dur: [1.8, 3.4] },            // a few late grains keep walking during holds
  hopFeel: { hz: [3.6, 4.2], attack: 0.25, dead: [0.08, 0.6], phaseJitter: 0.25, spatial: 0.9 },   // hop = smoothstep(dead, |w|/2): grains on a line sit perfectly still (bitrate + legibility)
  lockShare: 0.9,

  // ---- overlay: caption chip (top centre) + frequency readout (top-right) ----------------------------------
  caption: {
    x: 960, y: 44, h: 88, cap: 38, align: "center", maxW: 760,   // centred above the plate's far edge
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#1b1d22", edge: "#3b3f48", ink: "#f4f1ea", wave: "#f6ecd8",
  },
  readout: { x: 1824, y: 44, h: 88, cap: 40, plate: "#1b1d22", edge: "#3b3f48", ink: "#7cf0b4", unit: "#a9b3c2" },

  sound: {
    tone: { gain: 0.5, tilt: 0.5, attack: 0.18, release: 0.45, releaseLast: 1.2, overlap: 0.25, brightness: 1600 },
    hiss: { gain: 0.32, density: 0.55, pitch: 1.25, whoosh: 0.18 },
    lock: { tick: 0.35, chime: 0.11 },
    room: { gain: 0.35, dur: 15 },
  },
  sfx: { enter: "tick", exit: "whooshOut", move: "rustle", land: "tick", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Sand position = closed-form blend from where it was to the precomputed nodal-line position of the current mode, with per-grain delay; nothing is simulated.",
    "Hop = drive envelope x local |w| x |sin|: antinodes bounce, nodal lines sit still — the figure is legible because the lines are the still part.",
    "A pitch step re-targets every grain from its current position (continuous), so the old figure shatters and the new one forms.",
    "Camera: near-top-down three-quarter; moves only while the sand moves, perfectly still during holds (40k grains cost bitrate).",
  ],
};
