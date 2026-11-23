// styles/mousetrap-chain/spec.js — STYLE_SPEC for "Mousetrap Chain". Plain data only: JSON-serializable, no THREE,
// no window. Importable from Node (export-spec.mjs, scene.config.js for the cascade plan + score) and the browser.
// Units: metres (traps are ~5.5x real size and balls ~4x so one ball reads at 1080p), Y-up, sRGB hex, radians.
//
// The look: the classic chain-reaction demonstration on a bright blue sports-hall floor. A neat grid of generic
// spring traps (pale wooden board, yellow pedal, red paddle hammer), each loaded with two white ping-pong balls.
// One orange ball is bounced in; cascade.js (THREE-free planner) works out which ball lands on which trap when,
// every ball's ballistic arcs and every trap's snap time. A snapped trap flips its red paddle onto the yellow pedal,
// so the floor changes colour trap by trap as the reaction spreads.

export const STYLE_SPEC = {
  id: "mousetrap-chain",
  name: "Mousetrap Chain",
  description:
    "The classic chain-reaction demonstration on a bright blue sports-hall floor: a neat grid of toy-scale spring traps (pale wooden board, yellow pedal, red paddle hammer), each loaded with two white ping-pong balls. One orange ball is bounced in, trips one trap, which flings two balls, which trip two more — one, two, four, eight — until the whole floor erupts in a storm of flying balls and settles with every trap sprung. A seeded planner precomputes every landing, ballistic arc and snap; the same plan drives the picture, the snaps and ball ticks in the score, and a row of dots that doubles generation by generation.",
  palette: {
    bg: "#dfeaf5",
    floor: "#2f7fc4",
    floorDark: "#2a74b6",
    line: "#f6f8fb",
    lineAccent: "#ffd23a",
    ink: "#16202c",
    wood: "#edd3a2",
    pedal: "#ffc928",
    paddle: "#e23d36",
    steel: "#8d98a6",
    ball: "#fbfbf6",
    first: "#ff7a14",
    paper: "#fbfaf4",
  },
  world: {
    background: "#dfeaf5",
    fog: { color: "#cfe0f1", near: 22, far: 60 },
    environment: "room",
    environmentIntensity: 0.4,
    toneMapping: "neutral",     // keeps the primary palette as designed
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    floor: {
      type: "physical", baseColor: "#ffffff", roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3,
      map: { source: "noise", size: 512, scale: 6, octaves: 4, seed: 78, colorA: "#5aa9e8", colorB: "#6bb6ef", contrast: 1.0, repeat: [10, 10], description: "faint mottling of a poured blue sports floor" },
    },
    line: { type: "standard", baseColor: "#f6f8fb", roughness: 0.6, metalness: 0 },
    lineAccent: { type: "standard", baseColor: "#ffd23a", roughness: 0.6, metalness: 0 },
    wood: { type: "standard", baseColor: "#ffffff", roughness: 0.7, metalness: 0 },      // per-instance board tint
    pedal: { type: "physical", baseColor: "#ffc928", roughness: 0.4, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3 },
    paddle: { type: "physical", baseColor: "#e23d36", roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.25 },
    steel: { type: "standard", baseColor: "#9aa5b3", roughness: 0.32, metalness: 0.85 },
    ball: { type: "physical", baseColor: "#ffffff", roughness: 0.5, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.5 },   // per-instance colour
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#f4f8ff", groundColor: "#7da6cf", intensity: 1.0 },
    {
      id: "sun", type: "directional", color: "#fff3e0", intensity: 2.3, position: [-5.5, 10, 5], target: [0, 0, 0],
      shadow: { softness: 2.5, mapSize: 4096, extent: 7.6, near: 1, far: 30, bias: -0.0003, normalBias: 0.012 },
    },
    { id: "bounce", type: "directional", color: "#d5e6ff", intensity: 0.4, position: [6, 4, -5], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.22, offset: 1.15 },
  },
  camera: { fov: 35, near: 0.1, far: 120, drift: { amp: 0, speed: 0 } },   // locked: hundreds of moving balls + camera motion blows the file size
  text: { font: "sans", weight: 700, color: "#16202c", height: 0.3 },

  // ---- the floor of traps ------------------------------------------------------------------------------
  grid: { cols: 16, rows: 10, pitchX: 0.54, pitchZ: 0.74 },
  trap: {
    w: 0.34, l: 0.56, h: 0.05, radius: 0.012,          // board: across, along (z), thick
    woods: ["#edd3a2", "#e6c88f", "#f1dbb0", "#e9cf9b"],
    pedalW: 0.2, pedalL: 0.2, pedalT: 0.014, pedalZ: 0.15,   // yellow pedal on the +z half
    pivotY: 0.022,                                      // hammer axis above the board top
    paddleW: 0.27, paddleL: 0.235, paddleT: 0.012, wire: 0.011,
    springR: 0.024, springL: 0.22,
    seat: 0.03, seatX: 0.082, seatZ: -0.135,            // where the two balls sit on the set paddle
    snap: { dur: 0.085, rebound: 0.3, decay: 0.07, rate: 42, hop: 0.07, hopDur: 0.2, settle: 0.09, shift: 0.035, yaw: 0.2 },
  },
  ball: { r: 0.075, segments: 20 },
  court: { margin: 0.55, width: 0.07, outer: 1.5 },

  // ---- the chain reaction (cascade.js) -------------------------------------------------------------------
  cascade: {
    seed: 78,
    gravity: 9.81,             // real g on a ~5x scene reads as the slow-motion footage this demo is known from
    first: [7, 5],             // [col, row] of the trap the one ball lands on
    t0: 1.8,                   // s: the first snap
    drop: { at: 0.1, from: [-1.3, 0.7, 0.35], hops: [{ t: 0.5, p: [-3.5, 0.5] }, { t: 1.15, p: [-1.5, 0.5] }] },   // bounced in: floor hops at aisle crossings (p in pitches from the first trap), then the pedal
    flight: [1.05, 1.05, 0.95, 0.85, 0.8, 0.75, 0.7, 0.7],   // s by generation of the trap that throws (index 0 unused)
    flightPerMetre: 0.03, flightJitter: 0.07,
    reach: [0, 1.5, 2.3, 3.2, 4.4, 1e9],                        // early generations land near the first trap (camera is close)
    throwMin: 0.7, throwMax: 3.4, aimJitter: 0.035,
    free: { dist: [1.0, 4.8], tau: [0.9, 1.7] },               // lobs once no set traps are left (apex up to ~3.5 m)
    cleanGens: 5,              // balls of generations below this steer bounces into aisles (exact doubling)
    aisleMargin: 0.03,
    restitution: 0.6, kick: 2.6, friction: 0.6, scatter: 0.7, minSpeed: 0.5, minBounce: 1.0, bounces: 3,
    roll: { dist: [0.15, 0.8], dur: [0.6, 1.5] },
    boundsMargin: 0.85,
    coda: { on: true, restitution: 0.74, bounces: 7, friction: 0.8 },   // the last ball dribbles on alone before silence
  },

  // ---- overlay UI (exact colours) -------------------------------------------------------------------------
  caption: {
    x: 96, y: 72, h: 96, cap: 42,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    paper: "#fbfaf4", ink: "#16202c", dot: "#ff7a14",
  },
  chart: {
    right: 96, y: 72, dot: 13, gap: 5, rows: 8, colGap: 16, pad: 22,
    panel: "rgba(14,26,42,0.78)", lit: "#fbfbf6", first: "#ff7a14", base: "rgba(255,255,255,0.28)",
  },

  sound: {
    snapBin: 0.02, tickBin: 0.03, minSpeed: 0.9,
    snap: { gain: 0.42, body: 0.22, pitch: 1.35, maxBoost: 2.0 },
    tick: { gain: 0.3, pitchTrap: 1.7, pitchFloor: 1.5, maxBoost: 1.8 },
    bed: { gain: 0.5, root: 146.83, brightness: 800 },
  },
  sfx: { enter: "tick", exit: "whooshOut", move: "whoosh", land: "clack", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "Snap: a trap's red paddle swings 180 degrees from the back half onto the yellow pedal in under 0.1 s with a small rebound; the board hops and stays slightly shoved out of line.",
    "Throw: the two balls on the paddle leave on closed-form ballistic arcs, each aimed at a set trap nobody else is aiming at, so generations double until traps run out.",
    "Bounce: every ball takes up to three damped bounces and a decelerating roll to rest; early generations steer into the aisles, late ones trip traps by accident.",
    "Eruption: with no set traps left to aim at, balls are lobbed high and wide; the camera is locked for the whole storm.",
    "Coda: the last ball to land dribbles on alone, then silence with every trap sprung.",
    "Camera: starts close on one trap, pulls back generation by generation to reveal the whole floor, then holds.",
  ],
};
