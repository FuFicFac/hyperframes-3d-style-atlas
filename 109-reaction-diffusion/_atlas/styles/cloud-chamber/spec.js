// styles/cloud-chamber/spec.js — STYLE_SPEC for "Cloud Chamber": the tabletop instrument that makes invisible particles
// visible. A glass tank on a black cold plate, a thin layer of supersaturated mist lit from the side by a sheet of light;
// white condensation trails streak across it out of nowhere, then drift, widen, bead up and fade.
// Plain data only (JSON-serializable, no THREE, no window). Units: metres (the tank is drawn 8 m wide — toy scale ×20),
// Y-up, sRGB hex, radians, three.js light units. The planner (tracks.js) reads `tank` + `kinds`; style.js reads the rest.

export const STYLE_SPEC = {
  id: "cloud-chamber",
  name: "Cloud Chamber",
  description:
    "A glass tank on a black cold plate with a side-lit layer of mist: white condensation trails (fat stubs, long needles, curly threads, magnet-bent spirals) appear in an instant, then drift, widen, bead up and fade.",
  palette: {
    bg: "#04070e",        // the room with the lights off
    room: "#56627a",      // the room with the lights on (opening only)
    ink: "#eef4ff",
    mist: "#5f8fe8",      // side-lit vapour
    trail: "#f4f8ff",     // condensation: near white, a touch cold
    trailWarm: "#fff1dc", // heavy stubs read slightly warmer
    lamp: "#cfe2ff",
    source: "#ffb45a",    // the little source bead
    magnet: "#ff6a3c",    // coil indicator
    plate: "#07090d",
    frame: "#2a303b",
    table: "#8a8f99",
    primary: "#f4f8ff",
    secondary: "#8fb8ff",
    accent: "#ffb45a",
  },
  world: {
    background: "#04070e",
    fog: null,
    environment: null,
    toneMapping: "agx",
    exposure: 1.0,
  },
  materials: {
    plate: { type: "standard", baseColor: "#07090d", roughness: 0.32, metalness: 0.2 },
    frame: { type: "standard", baseColor: "#2a303b", roughness: 0.45, metalness: 0.7 },
    base: { type: "standard", baseColor: "#1a1d24", roughness: 0.6, metalness: 0.3 },
    table: { type: "standard", baseColor: "#8a8f99", roughness: 0.85, metalness: 0 },
    wall: { type: "standard", baseColor: "#6a7488", roughness: 0.95, metalness: 0 },
    rod: { type: "standard", baseColor: "#9aa0aa", roughness: 0.35, metalness: 0.9 },
  },
  lights: [
    // the ROOM: scaled by helpers.room(level) — full for the ordinary opening view, nearly off after
    { id: "roomSky", type: "hemisphere", color: "#dfe8ff", groundColor: "#59606e", intensity: 1.5 },
    { id: "roomKey", type: "directional", color: "#fff4e2", intensity: 1.7, position: [5, 10, 7], target: [0, 0, 0] },
    // what is left when the room is dark: the cold spill of the sheet lamp along the plate
    { id: "sheet", type: "point", color: "#cfe2ff", intensity: 5, position: [-4.6, 0.5, 0], distance: 14, decay: 2 },
  ],
  post: {
    bloom: { strength: 0.4, radius: 0.35, threshold: 0.9 },
    vignette: { darkness: 0.5, offset: 1.1 },
    grain: { amount: 0.012, fps: 30 },
  },
  camera: { fov: 35, near: 0.3, far: 120, drift: { amp: 0, speed: 0.3 } }, // locked off: trails are the motion
  text: { font: "sans", weight: 700, color: "#eef4ff", height: 0.4 },
  sfx: { enter: "tick", exit: "tick", move: "whoosh", land: "thud", emphasis: "chime", ui: "click", bed: "hum" },
  motion: [
    "Every trail is one planned event (tracks.js): its whole curve is built once; the shader reveals it head-to-tail in a few hundredths of a second.",
    "After birth a trail only ages: it widens, sinks toward the plate, wanders a little, breaks into beads and fades. age = t - birth, nothing accumulates.",
    "Three hands: fat short straight stubs (heavy), long thin straight needles (fast), faint wandering threads (light).",
    "A source makes a fountain: stubs fan out of one point. A magnet under the plate bends everything; light threads wind into shrinking spirals.",
    "Camera locked while trails appear; the one big move is the drop from the ordinary room view into the light sheet as the room dims.",
  ],

  // ---- the tank (tracks.js + style.js) ----
  tank: {
    w: 8, d: 5, h: 0.75,       // inner size
    mist: [0.1, 0.5],          // the sensitive layer: y range where trails form
    margin: 0.12,              // trails stop this far from the glass
  },

  // ---- particle hands (tracks.js). q = how hard the field bends it (sign = turn direction) ----
  kinds: {
    // heavy, slow, straight: short fat bright stub
    alpha: { len: [0.7, 1.25], width: 2.2, bright: 1.5, life: [2.2, 3.0], wobble: 0.0, kink: 0, speed: 26, q: 0.16, spiral: 0, warm: 1, wander: 0.6 },
    // fast, penetrating: long thin dead-straight needle from wall to wall
    muon: { len: [5, 12], width: 0.9, bright: 1.0, life: [1.5, 2.1], wobble: 0.0, kink: 0, speed: 160, q: 0.02, spiral: 0, warm: 0, wander: 0.3 },
    // light, easily knocked about: faint wandering thread
    beta: { len: [1.6, 3.4], width: 0.75, bright: 0.62, life: [1.3, 1.9], wobble: 1.5, kink: 0.07, speed: 60, q: -1.0, spiral: 1, warm: 0, wander: 1 },
    // from the source: longer heavy stubs (the fountain)
    ray: { len: [1.6, 2.8], width: 1.5, bright: 0.95, life: [1.4, 2.0], wobble: 0.0, kink: 0, speed: 40, q: 0.3, spiral: 0, warm: 1, wander: 0.5 },
  },
  field: { radius: 0.62, shrink: 0.82, spiralBright: 1.6, spiralWidth: 1.3 }, // q = 1 at field 1: first loop radius (m) and how much it shrinks by the end

  // ---- trail look (style.js shader) ----
  trail: {
    width: 0.021,          // ribbon half-width at width 1, m
    level: 1.75,           // linear HDR level at bright 1, age 0
    flash: 1.2,            // extra level in the first instant
    flashRate: 7,          // 1/s decay of the flash
    widen: 1.7,            // half-width multiplier gained over a lifetime
    fall: 0.06,            // m/s sink toward the plate
    wander: 0.085,         // m/s sideways diffusion (seeded per vertex)
    beadFreq: 7,           // beads per metre
    fadeExp: 1.35,
    headFade: 0.012,       // s
  },
  mist: {
    layers: 6, level: 0.03, scale: 0.8, drift: [0.07, 0.03], contrast: 2.2,
    lampFalloff: 7.5,      // m: e-fold of the sheet from the lamp side
    edge: 0.5,             // m: fade toward the glass
  },
  glass: { pane: 0.02, paneLit: 0.07, edge: 0.1, edgeLit: 0.55, rail: 0.05 },
  lamp: { level: 3.2, size: [0.16, 0.34, 4.2] },
  source: { rodR: 0.035, beadR: 0.085, level: 2.4, drop: 3.2, light: 0.9 },
  magnet: { level: 1.1, inset: 0.22, width: 0.035 },
  room: { dark: 0.012, bloomBright: 3.2 }, // light level left when "off"; bloom threshold while the room is lit
  caption: { font: "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif", weight: 700, cap: 54, h: 96, x: 96, y: 70,
    plate: "rgba(4,7,14,0.78)", edge: "rgba(190,215,255,0.22)", ink: "#eef4ff", dot: "#8fb8ff" },
  sound: {
    bed: { gain: 0.34, hz: 55 },
    pad: { gain: 0.3, root: 82.4, brightness: 520 },
    tick: {
      alpha: { gain: 0.3, pitch: 0.55, dur: 0.045 },
      ray: { gain: 0.2, pitch: 0.7, dur: 0.04 },
      muon: { gain: 0.24, pitch: 1.25, dur: 0.03 },
      beta: { gain: 0.14, pitch: 1.9, dur: 0.025 },
    },
    lamp: { gain: 0.5 }, dim: { gain: 0.3 }, source: { gain: 0.45 }, magnet: { gain: 0.6, buzz: 0.16 }, end: { gain: 0.2 },
  },
};
