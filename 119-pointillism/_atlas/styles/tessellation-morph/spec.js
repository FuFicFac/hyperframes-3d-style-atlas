// styles/tessellation-morph/spec.js — STYLE_SPEC for "Tessellation Morph". Plain data only: JSON-serializable, no THREE,
// no window. Importable from Node (export-spec.mjs, scene.config.js for the morph plan + score).
// Units: metres, colours sRGB hex, angles radians. The wall is the XY plane (z = 0), tiles stand out toward +Z (the camera).
//
// The look: a wall of interlocking cut-paper / painted tiles in two colours (cream, raised; navy, lower), each with a
// small bevel, lit from the upper left so every edge has a lit side and a shadow side. Every tile is the same creature;
// the creature's outline morphs (plain tile -> fish -> bird) without ever opening a gap, because each side of the lattice
// cell and its opposite side are ONE shared curve (tiling.js). Behind the tiles is a coral backing that only shows
// when a tile leaves the wall.
//
// Key shapes are ORIGINAL simple silhouettes drawn for this style (two curves each, 7 control points per curve, cell
// units: K = [0,0] tail corner, K + a = [.5,-.5] bottom, K + b = [.5,.5] top, K + a + b = [1,0] nose).

const line = (d, n = 7) => Array.from({ length: n }, (_, i) => [(d[0] * i) / (n - 1), (d[1] * i) / (n - 1)]);

export const STYLE_SPEC = {
  id: "tessellation-morph",
  name: "Tessellation Morph",
  description:
    "A wall of interlocking cut-paper tiles in two alternating colours, bevelled and layered so it is clearly 3D, where every tile is the same creature and the creature morphs smoothly (plain tile -> fish -> bird) without ever leaving a gap. Each lattice cell is a parallelogram whose opposite sides are one shared curve: what bulges out of one side is cut from the other, so any curve tiles. Key shapes are pairs of curves; the morph interpolates them point by point, and because each edge carries its own morph value the wall can show the whole transition in one frame, left to right. Eyes, gills, a beak and wing lines fade in only near a key shape. Tiles can leave the wall: a row of birds lifts off, folds along its body line to flap, and flies out, leaving bird-shaped holes. Whooshes, clicks and flutters come from the same morph plan.",
  palette: {
    bg: "#e9603f",
    cream: "#f4ead4",
    navy: "#1c3d61",
    backing: "#e9603f",
    accent: "#f0683f",
    ink: "#14263b",
    plate: "#14263b",
    plateInk: "#f7efdc",
  },
  world: {
    background: "#e9603f",
    fog: null,
    environment: "room",
    environmentIntensity: 0.3,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    tile: { type: "standard", baseColor: "#ffffff", roughness: 0.82, metalness: 0, vertexColors: true, map: { source: "paper", size: 512, base: "#ffffff", fiber: 0.035, grain: 0.03, seed: 93, variant: "even", description: "faint even paper fibre, multiplied over the tile colour" } },
    ink: { type: "standard", baseColor: "#ffffff", roughness: 0.75, metalness: 0, vertexColors: true },
    backing: { type: "standard", baseColor: "#e9603f", roughness: 0.9, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#b9b2c4", intensity: 1.15 },
    {
      // raking key from the upper left, in front of the wall: bevels get a lit side, raised tiles cast short shadows down-right
      id: "key", type: "directional", color: "#fff3df", intensity: 2.1, position: [-7.5, 8.5, 9.5], target: [0, 0, 0],
      shadow: { softness: 2.2, mapSize: 4096, extent: 13, near: 1, far: 40, bias: -0.0006, normalBias: 0.012 },
    },
  ],
  post: { vignette: { darkness: 0.22, offset: 1.2 } },
  camera: { fov: 35, near: 1, far: 60, drift: { amp: 0, speed: 0.2 } },
  text: { font: "rounded", weight: 800, color: "#14263b", height: 0.4 },

  // ---- the tiling --------------------------------------------------------------------------------------------
  tiling: {
    size: 2,                 // metres per cell unit: one creature is 2 m long
    a: [0.5, -0.5],          // lattice vectors of the unit cell (a square standing on its corner)
    b: [0.5, 0.5],
    per: 4,                  // curve samples per control segment (6 segments -> 24 per edge, 96 points per tile)
    keys: [
      { id: "square", name: "plain tile", a: line([0.5, -0.5]), b: line([0.5, 0.5]), details: [] },
      {
        id: "fish", name: "fish",
        // edge b (K -> top): upper tail lobe, tail stem, back, dorsal tip. Shifted by a it is this fish's belly and chin.
        b: [[0, 0], [0.03, 0.17], [-0.02, 0.33, 1], [0.12, 0.17], [0.25, 0.15], [0.38, 0.3], [0.5, 0.5]],
        // edge a (K -> bottom): lower tail lobe, belly, pelvic tip. Shifted by b it is this fish's forehead.
        a: [[0, 0], [0.03, -0.15], [-0.01, -0.29, 1], [0.12, -0.15], [0.26, -0.13], [0.4, -0.29], [0.5, -0.5]],
        details: [
          { type: "eye", at: [0.79, 0.06], r: 0.04 },
          { type: "stroke", pts: [[0.66, 0.17], [0.632, 0.09], [0.626, 0.0], [0.636, -0.08], [0.664, -0.15]], w: 0.024 },
        ],
      },
      {
        id: "bird", name: "bird",
        // edge b: tail tip, back, the raised wing's trailing edge up to the wing tip. Shifted by a: breast and throat.
        b: [[0, 0], [0.03, 0.07], [0.01, 0.14, 1], [0.12, 0.07], [0.27, 0.1], [0.35, 0.36], [0.5, 0.5]],
        // edge a: underside of tail and belly. Shifted by b: the wing's leading edge, neck, crown and beak.
        a: [[0, 0], [0.1, -0.2], [0.18, -0.35], [0.28, -0.4], [0.37, -0.37], [0.44, -0.43], [0.5, -0.5]],
        details: [
          { type: "eye", at: [0.862, 0.045], r: 0.027 },
          { type: "beak", pts: [[0.992, 0.0], [0.94, 0.052], [0.928, -0.048]] },
          { type: "stroke", pts: [[0.33, 0.14], [0.44, 0.06], [0.57, 0.06], [0.665, 0.15]], w: 0.013 },
          { type: "stroke", pts: [[0.43, 0.17], [0.455, 0.27], [0.49, 0.37]], w: 0.01 },
          { type: "stroke", pts: [[0.53, 0.16], [0.535, 0.24], [0.545, 0.31]], w: 0.01 },
        ],
      },
    ],
    detail: { lo: 0.72, hi: 0.97 },   // key k's details appear while |m - k| < 1 - lo and are full at |m - k| < 1 - hi
  },
  tile: {
    heights: [0.24, 0.13],   // thickness by colour: [cream (parity 0), navy (parity 1)] — cream sits proud and casts on navy
    bevelW: 0.045,           // chamfer width in plan (m)
    bevelH: 0.04,            // chamfer height (m)
    tint: 0.035,             // per-tile lightness variation (hand-painted look)
    chamferShade: 0.96,      // chamfer / side wall colour multipliers (the light does most of the work)
    sideShade: 0.86,
    miterMax: 2.2,           // inset mitre clamp (x bevelW) at sharp corners
    chordInset: 1.4,         // the chord ends (tail corner, nose) move this many bevelW along the body line
    uvScale: 3.2,            // metres per paper-texture repeat
    inkLift: 0.004,          // painted details sit this far above the tile face
    tap: { depth: 0.06, dur: 0.28 },   // a tile dips this far when it is pressed / clicks home
  },

  // ---- overlay caption (bottom centre): a plate with the label and a morph slider under it --------------------
  caption: {
    x: 960, y: 846, w: 920, h: 168, cap: 46, textY: 66,
    slider: { x0: 150, y: 140, icon: 52, lift: 34 },
    font: '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif', weight: 700,
    plate: "#14263b", edge: "#f7efdc", ink: "#f7efdc", accent: "#f0683f", dim: "#6f8199",
  },

  sound: {
    morph: { gain: 0.3, q: 1.4, pitch: 0.9 },
    slide: { gain: 0.26, pitch: 1.25 },
    tap: { gain: 0.085, max: 0.4, pressPitch: 0.8, homePitch: 1.35 },
    lift: { gain: 0.36, pitch: 1.0, rustle: 0.22, chime: 0.3 },
    flap: { gain: 0.1 },
    bed: { gain: 0.85, root: 146.8, chord: [0, 7, 12, 16], brightness: 850 },
  },
  sfx: { enter: "click", exit: "whooshOut", move: "whoosh", land: "click", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Nothing translates: the tiles stay on their lattice and only the two shared edge curves change, so the wall is gap-free at every instant.",
    "A morph rolls across the wall (a per-position delay), and each tile dips and clicks home when it reaches a key shape; eyes and marks pop in only near a key.",
    "The morph value can be a left-to-right gradient that slides, so one frame shows plain tile -> fish -> bird.",
    "A row of tiles can leave the wall: lift straight out, fold along the body line to flap, then fly forward and out (closed-form pose), leaving a coral hole of its own shape.",
    "Camera: locked shots joined by short eased moves; no drift.",
  ],
};
