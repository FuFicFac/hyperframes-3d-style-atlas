// styles/percolation/spec.js — STYLE_SPEC for "Percolation". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, and the demo's scene.config.js for the plan, camera and SCORE).
// Units: metres, Y-up, the board stands upright in the XY plane facing +Z (the camera side).
//
// The look: a white enamel board, navy border and rivets, carrying a square grid of short glass sight-pipes joined by
// brass cross fittings. Every pipe has a brass valve with a red lever (across the pipe = shut, along it = open). A trough
// of blue water runs along the top, a dry trough along the bottom. Valves open in a seeded random order; open pipes that
// are not yet reached by water are tinted by cluster (a pastel band painted on the enamel behind them); water fills only
// what it can reach from the top, pipe by pipe. One exact valve joins top to bottom; then water runs the board.

export const STYLE_SPEC = {
  id: "percolation",
  name: "Percolation",
  description:
    "A white enamel board of glass sight-pipes, brass cross fittings and red-lever valves in a square grid, a trough of blue water along the top and a dry trough along the bottom. Valves click open in a seeded random order; open pipes are tinted by cluster on the enamel behind them; water fills only what it can reach from the top. An incremental union-find finds the exact valve that first joins top to bottom; when it turns, water runs the newly joined cluster down to the bottom trough. Bright, front-lit, clean diagram look.",
  palette: {
    bg: "#e8e4dc",
    enamel: "#f7f5ef",
    navy: "#1d3570",
    ink: "#14213f",
    brass: "#c9a04a",
    lever: "#d4372c",
    water: "#1f77e0",
    wetBand: "#4f94ff",
    waterFront: "#3fd2ff",
    bandFront: "#8ae6ff",
    highlight: "#ff1f8f",
    bottom: "#ffb938",
    pending: "#d9e2ec",
    gold: "#f2b632",
    tints: ["#7fd36b", "#cfe05a", "#ffa877"],
  },
  world: {
    background: "#e8e4dc",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.75,
    toneMapping: "neutral",
    exposure: 0.95,
    shadowType: "auto",
  },
  materials: {
    enamel: { type: "physical", baseColor: "#f7f5ef", roughness: 0.32, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.18 },
    navy: { type: "physical", baseColor: "#1d3570", roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.15 },
    brass: { type: "standard", baseColor: "#c9a04a", roughness: 0.3, metalness: 0.9 },
    lever: { type: "physical", baseColor: "#d4372c", roughness: 0.35, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.12 },
    water: { type: "physical", baseColor: "#0b55e6", roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, emission: { color: "#0a44c8", strength: 0.7 } },
    troughInside: { type: "standard", baseColor: "#e4eaef", roughness: 0.4, metalness: 0 },
    band: { type: "lambert", baseColor: "#ffffff" },
  },
  glass: { color: "#cbe2ee", alphaFace: 0.24, alphaRim: 0.82, fresnelPower: 1.8, rim: "#3f6a8c", rimStrength: 0.6, envIntensity: 1 },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#b8b0a2", intensity: 1.15 },
    {
      id: "key", type: "directional", color: "#fff6ea", intensity: 2.1, position: [-5, 7, 9], target: [0, 0, 0],
      shadow: { softness: 1.4, mapSize: 4096, extent: 7.2, near: 1, far: 30, bias: -0.0004, normalBias: 0.015 },
    },
    { id: "rim", type: "directional", color: "#e8f0ff", intensity: 0.5, position: [6, 3, 6], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.18, radius: 0.25, threshold: 2.6 },
    vignette: { darkness: 0.22, offset: 1.2 },
  },
  camera: { fov: 30, near: 0.2, far: 80, drift: { amp: 0, speed: 0.2 } }, // locked holds keep the MP4 small
  text: { font: "sans", weight: 800, color: "#ffffff", height: 0.4 },

  // ---- board + network geometry (metres) ----------------------------------------------------------------------
  grid: { W: 16, H: 8, pitch: 0.6 },
  board: { margin: [3.6, 2.2], depth: 0.2, border: 0.16, rivet: 0.06 },
  pipe: { z: 0.13, glassR: 0.095, waterR: 0.077, joint: 0.106, valveR: 0.085, valveD: 0.13, collarR: 0.106, collarL: 0.14, lever: [0.26, 0.048, 0.032], pop: 0.4 },
  band: { width: 0.32, z: 0.004, fade: 0.25 },
  front: { settle: 0.8, boost: 1.3 },   // s: a pipe's water glows bright cyan while it fills, then settles to deep blue
  trough: { h: 0.46, d: 0.34, extra: 0.42, rim: 0.03 },
  ring: { r0: 0.25, r1: 0.335, z: 0.25, grow: 0.5 },   // magenta ring IN FRONT of the deciding valve (z = in front of the lever)

  // ---- the plan (percolate.js) -------------------------------------------------------------------------------------
  plan: {
    seed: 483,
    turn: 0.2,
    open: { knots: [[0, 0.12], [0.18, 2.4], [0.58, 5.4], [1, 7.1]] },
    decide: { at: 9.55, turn: 0.55, dt: 0.6 },
    flow: { dt: 0.16, reachB: 13.1 },
    tints: 3,
  },

  // ---- overlay caption (an enamel sign plate, top centre) ---------------------------------------------------------
  caption: {
    x: 960, y: 56, h: 88, cap: 50, maxW: 900,
    font: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: 800,
    plate: "#1d3570", edge: "#ffffff", ink: "#ffffff", drop: "#5fb0ff",
  },

  sound: {
    valve: { gain: 0.5, base: 0.4, per: 0.25, pitch: 1.15 },
    gurgle: { gain: 0.16, pitch: 0.9 },
    race: { gain: 0.24, pitch: 0.8 },
    decide: { gain: 0.95, thud: 0.6 },
    trough: { gain: 0.32, rumble: 0.35 },
    bed: { gain: 0.55, root: 98, chord: [0, 7, 12, 16], brightness: 700 },
    rush: { gain: 0.5 },
  },
  sfx: { enter: "click", exit: "whooshOut", move: "whoosh", land: "clack", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Every valve has one turn time from percolate.js; its lever swings 90 degrees (outBack) from across the pipe to along it.",
    "Water is an earliest-arrival flood from the top trough over open pipes: each pipe fills from the end the water reaches, at a fixed time per pipe.",
    "Open pipes not yet reached by water are tinted by cluster (a pastel band on the enamel); merged clusters cross-fade to the larger one's colour.",
    "Camera: locked holds joined by short eased moves (no drift): top half, whole board, close-up on the deciding valve, pull back.",
  ],
};
