// styles/domino-run/spec.js — STYLE_SPEC for "Domino Run". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the rally plan + score) and the browser.
// Units: metres (tiles are ~10x a real domino so they read at 1080p from a low close camera), Y-up, sRGB hex, radians.
//
// The look: a domino rally on a polished honey-wood floor, seen low and close in warm window daylight. Hundreds of
// glossy plain-faced tiles stand in curving lines, spirals, branches, up a little stair and across a plank bridge.
// The chain reaction is solved as a pure function of time by rally.js (THREE-free): every tile's trigger time comes
// from the wave speed along its path; its fall angle is a closed form of (t - trigger) that is clamped by the contact
// with the next tile, so each one comes to rest leaning on the next. Fields of two-colour tiles topple to reveal a
// picture or word on their backs. The same plan drives the clicks in SCORE and the chase camera.

export const STYLE_SPEC = {
  id: "domino-run",
  name: "Domino Run",
  description:
    "A domino rally on a polished wooden floor seen low and close: hundreds of glossy plain-faced coloured tiles standing in curving lines, spirals and branching paths, up a little stair and across a plank bridge, in warm window daylight with soft floor reflections. A topple wave runs every path at a set speed; each tile's fall is a closed-form function of time that comes to rest leaning on the next; one tile splits a line in two, lines trip gadgets (a ball rolls, a flag pops up, a banner drops), and a two-colour field topples row by row to reveal a picture or word. The camera chases the wave front.",
  palette: {
    bg: "#2a1d14",
    floor: "#b07a4a",
    ink: "#1d1a22",
    cream: "#f4ead6",
    tiles: ["#d8432f", "#f0a42a", "#1f8c88", "#2e5fb6", "#f4ead6", "#7a4fa0"],  // tomato, saffron, teal, cobalt, cream, plum
    red: "#d8432f", saffron: "#f0a42a", teal: "#1f8c88", cobalt: "#2e5fb6", plum: "#7a4fa0",
    wood: { dark: "#6e4528", mid: "#a8723f", light: "#cf9c62", seam: "#4a2c18" },
    block: "#d9b88a",       // pale beech building blocks (stairs, bridge piers)
    brass: "#c8a050",
  },
  world: {
    background: "#2a1d14",
    sky: null,
    fog: { color: "#3a2a1d", near: 9, far: 26 },   // the far floor sinks into a warm dim room
    environment: "room",
    environmentIntensity: 0.32,
    toneMapping: "neutral",   // keeps the tile palette as designed (ACES greys cream, desaturates saturated tiles)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    // floor: the reflective sweep clones this (map = wood planks along x)
    floor: {
      type: "physical", baseColor: "#ffffff", roughness: 0.34, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.18,
      map: { source: "wood", size: 1024, boards: 6, seed: 37, grainFreq: 20, grainWarp: 2.0, contrast: 0.32, dark: "#6e4528", mid: "#a8723f", light: "#cf9c62", seam: "#4a2c18", repeat: [14, 14], description: "honey oak planks, 0.48 m boards running along x" },
    },
    block: { type: "physical", baseColor: "#d9b88a", roughness: 0.55, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.4 },
    plank: { type: "physical", baseColor: "#c99a63", roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.35 },
    brass: { type: "standard", baseColor: "#c8a050", roughness: 0.3, metalness: 1 },
    pole: { type: "physical", baseColor: "#efe6d4", roughness: 0.4, metalness: 0, clearcoat: 0.4 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#e3ebf7", groundColor: "#6b4a2c", intensity: 0.75 },
    {
      // warm low window sun; the scene moves its position/target with the chase target (shadow stays tight)
      id: "sun", type: "directional", color: "#ffe2bd", intensity: 2.5, position: [-4, 5.2, 3.2], target: [0, 0, 0],
      shadow: { softness: 3, mapSize: 4096, extent: 4.2, near: 0.5, far: 24, bias: -0.0002, normalBias: 0.012 },
    },
    // cool bounce from the room side: separates tile edges from the floor
    { id: "bounce", type: "directional", color: "#c9d6ea", intensity: 0.35, position: [5, 3, -4], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.12, radius: 0.45, threshold: 2.6 },   // only sun glints on the clearcoat bloom
    vignette: { darkness: 0.42, offset: 1.0 },
  },
  camera: { fov: 34, near: 0.05, far: 40, drift: { amp: 0.006, speed: 0.22 } },
  text: { font: "sans", weight: 700, color: "#1d1a22", height: 0.3 },

  // ---- tiles -------------------------------------------------------------------------------------------
  tile: {
    W: 0.25, H: 0.5, T: 0.08,     // width (across the path), height, thickness (along the path)
    radius: 0.014,                // rounded edges (RoundedBoxGeometry)
    spacing: 0.32,                // centre-to-centre along the path (0.64 H: rests at acos(T/d) ~ 75.5 deg)
    roughness: 0.28, clearcoat: 0.85, clearcoatRoughness: 0.08,   // glossy lacquer
    groove: 0.0,                  // plain faces (no pips, no divider)
  },
  wave: {
    speed: 1.75,                  // m/s along the path (0.18 s between tiles at 0.32 m)
    push: 0.55,                   // share of the hit angle reached linearly (rest = accelerating fall)
    margin: 0.004,                // contact clearance (m) kept on the tight side of curves
  },
  stair: { rise: 0.08, margin: 0.02, width: 0.36, deckT: 0.05, pier: 0.12 },
  field: { pitch: 0.32, spread: 0.55 },   // across-row pitch; vee = lateral delay per column (in row steps)
  ball: { r: 0.11, color: "#2e5fb6", v0: 2.4, decel: 0.9 },
  flag: { pole: 1.05, w: 0.42, h: 0.28, color: "#d8432f", spring: { stiffness: 160, damping: 9 } },
  banner: { w: 2.6, h: 0.7, top: 1.55, colors: ["#f4ead6", "#d8432f", "#f0a42a", "#1f8c88", "#2e5fb6"], drop: 0.55 },

  // ---- the beat label: one cream caption chip pinned to the screen (overlay = exact colours) -------------
  caption: {
    x: 96, y: 72, h: 92, cap: 40,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    paper: "#f4ead6", ink: "#1d1a22", chip: ["#d8432f", "#1d1a22"],
  },

  sound: {
    bin: 0.035,                                   // topples closer than this share one click (gain grows with count)
    click: { gain: 0.34, pitch: 1.9 },
    clack: { gain: 0.24, pitch: 1.25 },
    land: { gain: 0.3 },
    roll: { gain: 0.3 },
    flag: { gain: 0.5 },
    banner: { gain: 0.45 },
    bed: { gain: 0.85, root: 196, brightness: 900 },
  },
  sfx: { enter: "click", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "Topple: each tile rotates about its front bottom edge; angle = closed-form accelerating fall from its trigger time, clamped by the contact with the next tile, so it comes to rest leaning on it (~75 deg on a straight run).",
    "Wave: trigger times come from the wave speed along each path (0.16 s per tile at the defaults); the last tile of a line falls flat.",
    "Split / merge: one tile strikes two side-by-side tiles that curve apart; a merge tile falls at the first arrival.",
    "Stair / bridge: tiles step up one block at a time, run across a plank bridge and step down; a tile before a step leans on the step edge.",
    "Field: a grid of two-colour tiles topples row by row (or in a vee from the entry tile) and the backs show a picture or word.",
    "Gadgets: a rolling ball starts or relays the chain (closed-form deceleration), a flag springs up, a banner drops.",
    "Camera: chases the wave front, low and close, then lifts into a wide that fills the frame with the finished field.",
  ],
};
