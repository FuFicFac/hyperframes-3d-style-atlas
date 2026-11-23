// styles/constructivist-poster/spec.js — STYLE_SPEC for "Constructivist Poster". Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the build plan + score).
// Units: metres. The poster is a 16.6 x 9.4 m board (fills a 9 m-tall orthographic frame with a little bleed) standing
// in the XY plane, facing +Z (the camera). Each element is a thick painted card / wood plane at its own height above
// the board, on hidden dowels, so a hard key light throws real offset shadows and a camera tilt reveals the relief.
//
// The look: 1920s Constructivist graphic design — cream lithograph paper, red, black and one grey, heavy diagonals,
// a wedge striking a circle, condensed block capitals. Original compositions only; neutral copy (BUILD, IDEA, SIGNAL,
// FORWARD), no symbols, slogans or portraits. Motion is percussive: fast ease-in, dead stop, tiny overshoot.

export const STYLE_SPEC = {
  id: "constructivist-poster",
  name: "Constructivist Poster",
  description:
    "A 1920s Constructivist poster that builds itself with force: a red wedge drives diagonally into a white circle, heavy black bars slam in on a 35 degree axis, a black cone throws words that grow as they fly, wheels roll along a bar and stop dead against the circle, and blocks of condensed capitals swing in on hinges. Cream lithograph paper, red / black / one grey, mottled ink and slight misregistration. Every element is a thick painted card at its own height on hidden dowels, so a hard key light throws offset shadows; once the poster locks, an orthographic camera tilts to reveal the layered relief, then snaps back flat. Motion is percussive (hard ease-in, dead stop, tiny ring) and every move has a mechanical hit from the same build plan.",
  palette: {
    bg: "#c9bfab",
    paper: "#ebe0c8",
    red: "#c42a1c",
    black: "#1a1715",
    grey: "#8e8a83",
    white: "#f7f2e4",
    dowel: "#9a8f7c",
    edge: "#cfc3a8",
  },
  world: {
    background: "#c9bfab",
    sky: null,
    fog: null,
    environment: null,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    // lithograph paper: even fibres (no tile streaks across a 16 m sheet) + fine grain, baked once
    paper: { type: "standard", baseColor: "#ffffff", roughness: 0.95, metalness: 0, map: { source: "paper", size: 1024, base: "#f1e8d4", fiber: 0.045, grain: 0.05, seed: 68, variant: "even", repeat: [3, 1.7] } },
    boardEdge: { type: "standard", baseColor: "#cfc3a8", roughness: 0.9, metalness: 0 },
    // inks: a mottled grey-white noise multiplies each ink colour (uneven lithograph laydown). UV = metres on cut cards.
    red: { type: "standard", baseColor: "#c42a1c", roughness: 0.85, metalness: 0, map: { source: "noise", size: 256, scale: 22, octaves: 4, seed: 681, colorA: "#ddd3c6", colorB: "#ffffff", contrast: 1.25, repeat: [0.22, 0.22] } },
    black: { type: "standard", baseColor: "#1a1715", roughness: 0.8, metalness: 0, map: { source: "noise", size: 256, scale: 22, octaves: 4, seed: 682, colorA: "#a8a39d", colorB: "#ffffff", contrast: 1.25, repeat: [0.2, 0.2] } },
    grey: { type: "standard", baseColor: "#8e8a83", roughness: 0.9, metalness: 0, map: { source: "noise", size: 256, scale: 22, octaves: 4, seed: 683, colorA: "#ebe6dd", colorB: "#ffffff", contrast: 1.1, repeat: [0.2, 0.2] } },
    white: { type: "standard", baseColor: "#f7f2e4", roughness: 0.9, metalness: 0, map: { source: "noise", size: 256, scale: 22, octaves: 3, seed: 684, colorA: "#f5f1e9", colorB: "#ffffff", contrast: 1.1, repeat: [0.2, 0.2] } },
    dowel: { type: "standard", baseColor: "#9a8f7c", roughness: 0.8, metalness: 0 },
  },
  lights: [
    // even, slightly warm fill so the shadow side of every card is a readable mid-tone, not black
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#f4efe6", intensity: 1.6 },
    {
      // hard key from upper-left, in front: short crisp offset shadows down-right (offset ~ 0.35 x card height)
      id: "key", type: "directional", color: "#ffffff", intensity: 2.1, position: [-4, 4.8, 19], target: [0, 0, 0],
      shadow: { softness: 1.0, mapSize: 4096, extent: 10, near: 1, far: 50, bias: -0.0003, normalBias: 0.01 },
    },
  ],
  post: {
    vignette: { darkness: 0.22, offset: 1.15 },
    grain: { amount: 0.014, fps: 15 },
  },
  camera: { fov: 30, near: 1, far: 90, projection: "orthographic", viewHeight: 9.0, drift: { amp: 0, speed: 0.2 } },
  text: { font: '"Impact", "Haettenschweiler", "DIN Condensed", "Arial Black", sans-serif', weight: 400, color: "#1a1715", height: 0.6 },

  // ---- construction ---------------------------------------------------------------------------------------
  board: { w: 16.6, h: 9.4, depth: 0.3 },
  card: { thickness: 0.16, dowelR: 0.08 },                 // every painted plane is 16 cm thick, held on dowels
  misregister: { offset: [0.07, -0.055], alpha: 1 },        // the underprint copy under type and the circle
  type: {
    font: '"Impact", "Haettenschweiler", "DIN Condensed", "Arial Black", sans-serif',
    weight: 400, px: 220, tracking: 0.02,
  },
  feel: { power: 3, over: 0.035, period: 0.16, decay: 0.07 },   // strike(): hard ease-in, dead stop, tiny ring

  // ---- overlay caption: a black slab with cream condensed caps and a red tab (exact colours, after post) ----
  caption: {
    x: 960, y: 60, h: 92, cap: 50, maxW: 900,
    font: '"Impact", "DIN Condensed", "Arial Black", sans-serif', weight: 400,
    plate: "#1a1715", ink: "#f2e9d4", tab: "#c42a1c",
  },

  sound: {
    hit: { gain: 0.5, dur: 0.4, pitch: 1.0, clack: 0.32, clackPitch: 0.9 },
    swish: { gain: 0.15, q: 1.4, pitch: 1.6 },
    tick: { gain: 0.32, pitch: 1.3 },
    throw: { gain: 0.25, pitch: 1.2, pop: 0.18 },
    servo: { gain: 0.3, hz: 90, hz2: 170 },
    bed: { root: 55, chord: [0, 7, 12], brightness: 420, gain: 0.26, humHz: 55, hum: 0.04 },
  },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "whoosh", land: "impact", emphasis: "clack", ui: "click", bed: "pad" },
  motion: [
    "Every piece arrives with strike(): u^3 ease-in (fastest just before contact), a dead stop on the hit, then a tiny damped ring (3.5 %).",
    "Slides travel along the piece's own diagonal from off-frame; drops fall toward the board (the shadow offset shrinks to its rest gap); hinges swing flat from edge-on.",
    "What gets struck recoils: the circle jolts along the wedge's axis and the whole sheet shakes a few pixels on heavy hits.",
    "Wheels roll along a rail (turn = distance / radius) with a ratchet tick per spoke and stop dead against the circle.",
    "After the poster locks, the orthographic camera tilts (arc) to show the card layers on their dowels, holds still, then snaps back flat with an outBack overshoot.",
  ],
};
