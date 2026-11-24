// styles/laser-mirrors/spec.js — STYLE_SPEC for "Laser & Mirrors". Plain data only (no THREE, no window).
// Units: metres (toy scale: the bench is ~12 m wide so a mirror reads at 1080p), Y-up, colours sRGB hex, radians.
export const STYLE_SPEC = {
  id: "laser-mirrors",
  name: "Laser & Mirrors",
  description:
    "An optics bench seen from above at an angle: a slate-blue anodised breadboard with a hole grid, a cream laser head, small swivelling mirrors on posts (silver glass in aluminium yokes; the router mirror in brass), a glass splitter that rises from a well, and drum-shaped sensor targets with name plates. Light haze makes the beam a thick glowing line; an exact ray tracer reflects it mirror to mirror, so turning one mirror re-routes the whole downstream path live.",
  palette: {
    bg: "#262d38",
    bench: "#6b7c92",
    benchHole: "#3d4858",
    rail: "#2a303a",
    steel: "#aeb6c0",
    alu: "#dfe4ea",
    brass: "#f0ae2c",
    body: "#ece8dc",
    dark: "#1c2028",
    ink: "#f4f6f9",
    beam: "#ff3d8b",
    cyan: "#22d3ff",
    amber: "#ffab1f",
    green: "#4dff7a",
  },
  // beam colours by name (plan colours are these keys); linear HDR gain is applied in the shader
  beamColors: { main: "#ff3d8b", cyan: "#22d3ff", amber: "#ffab1f", green: "#4dff7a" },
  world: {
    background: "#262d38",
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",
    exposure: 1.0,
  },
  materials: {
    benchSide: { type: "standard", baseColor: "#39424f", roughness: 0.7, metalness: 0.3 },
    rail: { type: "standard", baseColor: "#2a303a", roughness: 0.85, metalness: 0.1 },
    steel: { type: "standard", baseColor: "#aeb6c0", roughness: 0.35, metalness: 0.85 },
    alu: { type: "standard", baseColor: "#dfe4ea", roughness: 0.5, metalness: 0.25 },
    brass: { type: "standard", baseColor: "#f0ae2c", roughness: 0.4, metalness: 0.35 },
    dark: { type: "standard", baseColor: "#1c2028", roughness: 0.6, metalness: 0.2 },
    body: { type: "standard", baseColor: "#ece8dc", roughness: 0.55, metalness: 0.05 },
    mirror: { type: "standard", baseColor: "#f2f6fb", roughness: 0.05, metalness: 1.0 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#dfe8f5", groundColor: "#59616d", intensity: 0.85 },
    { id: "key", type: "directional", color: "#fff4e4", intensity: 1.9, position: [-6, 12, 7], target: [0, 0, 0], shadow: { softness: 3, mapSize: 2048, extent: 9, bias: -0.0005, normalBias: 0.03 } },
    { id: "fill", type: "directional", color: "#b8cdf0", intensity: 0.45, position: [8, 6, -4], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.55, radius: 0.45, threshold: 1.9 },
    vignette: { darkness: 0.3, offset: 1.15 },
  },
  camera: { fov: 30, near: 0.5, far: 80, drift: { amp: 0, speed: 0 } },
  text: { font: "sans", weight: 800, color: "#f4f6f9", height: 0.42 },

  // ---- bench and components (the planner's 2D layout comes from the scene; these are the 3D dimensions)
  bench: { margin: 0.32, thickness: 0.5, holePitch: 0.5, holeR: 0.055, pxPerMetre: 150, railT: 0.2, railH: 1.05, railFrontH: 0.22 },
  beamY: 0.95,
  beam: { half: 0.2, coreK: 38, core: 5.2, halo: 1.55, haze: 0.16, spillHalf: 0.62, spill: 0.34, maxSegments: 28, headSize: 1.1, hitSize: 0.95, hitLevel: 1.5, flareSize: 1.5 },
  mirror: {
    glassT: 0.06, frameT: 0.08, barD: 0.12, postR: 0.08, baseR: 0.36, baseH: 0.08, holderH: 0.24, knobR: 0.14,
    // emissive sheen painted on the silvered face: sky gradient top -> bottom, glints [x0, width, alpha] slanting up-right
    sheen: { base: "#e9f1fa", level: 0.85, sky: ["#8fb4dc", "#e4f0fb", "#9fbfe0", "#5d7fa6"], glints: [[0.12, 0.1, 0.75], [0.3, 0.04, 0.55], [0.62, 0.07, 0.4]] },
  },
  laser: { length: 1.5, width: 0.78, height: 0.66, nozzleR: 0.15, nozzleL: 0.26 },
  target: { bodyH: 0.56, bandH: 0.2, capR: 0.8, labelY: 1.95, labelTilt: -0.62, labelH: 0.4, idle: "#465062", lit: 2.6, halo: 2.2, pool: 1.9 },
  splitter: { height: 0.9, sides: 3, wellR: 0.62, low: -0.03, engage: 0.6, color: "#bfe6ff", glow: 2.0 },
  caption: {
    x: 960, y: 946, h: 86, cap: 44, maxW: 900,
    font: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: 700,
    plate: "#10151d", edge: "#3a4556", ink: "#f4f6f9", mark: "#ff3d8b",
  },
  sound: {
    bed: { root: 110, chord: [0, 7, 12, 19], brightness: 700, gain: 0.3 },
    hum: { hz: 120, gain: 0.1 },
    power: { click: 0.5, riser: 0.45, gain: 0.25 },
    launch: { gain: 0.45, blip: 0.3 },
    ping: { hz: 1320, scale: [0, 3, 7, 10, 12, 15], decay: 0.1, gain: 0.5 },
    chime: { dur: 1.3, gain: 0.55, bell: 0.4, pitch: { SEARCH: 1.0, CODE: 1.189, ANSWER: 1.498 } },
    servo: { hz: 170, hz2: 250, gain: 0.3, tick: 0.4 },
    split: { whir: 0.3, clack: 0.5, whoosh: 0.5, sparkle: 0.4 },
  },
  sfx: { enter: "blip", exit: "whooshOut", move: "servo", land: "marimba", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "The beam is traced exactly from the mirror angles at t; it first arrives along its path at a planned speed.",
    "A mirror turn is eased (inOutSine); the downstream beam sweeps and re-routes live, nothing is keyframed by hand.",
    "Hit points flare on arrival then hold a small glow; a target drum lights in its own colour while struck.",
    "The splitter rises from its well; when the glass meets the beam the fan grows so every child arrives together.",
    "Camera: locked during holds, one eased move per beat at most.",
  ],
};
