// styles/anamorphic/spec.js — STYLE_SPEC for "Anamorphic Illusion". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the piece plan + score) and the browser.
// Units: metres (a gallery room ~18 x 6.4 x 17 m), Y-up, sRGB hex, radians.
//
// The look: a bright, pale gallery room with a tiled concrete floor. Dozens of chunky painted rods (bent pieces of a
// stroke, rounded ends) hang on thin dark strings at wildly different depths — clutter from every angle but one. From the
// sweet spot (a taped cross on the floor marks where to stand) every piece slides onto its slice of one figure and the
// clutter snaps into a word or a shape; a few steps aside it tears apart again. Cast shadows on the floor and walls keep
// showing the true scatter even at the locked moment. anamorph.js (THREE-free) places the pieces along eye rays.

export const STYLE_SPEC = {
  id: "anamorphic",
  name: "Anamorphic Illusion",
  description:
    "A bright pale gallery room where dozens of chunky painted rods hang on thin strings at very different depths: meaningless clutter from every angle except one sweet spot (a taped cross on the floor), where every piece lines up into one crisp word or shape. Each piece is a slice of the figure moved along its own eye ray and scaled with distance, so from the sweet spot the figure is exact and from a few degrees off parallax tears it apart. Two figures can share one room (each with its own sweet spot and colour); the figure not being read sinks to its own muted mid-tone. Soft cast shadows on the floor and walls show the true scatter even at the locked moment.",
  palette: {
    bg: "#e9e4dc",
    wall: "#efebe4",
    wallSide: "#e3ddd3",
    floor: "#cfc8bc",
    floorLine: "#b9b1a4",
    ceiling: "#f4f1ec",
    string: "#2b2b30",
    tape: "#f2c230",
    ink: "#1d1f24",
    figA: ["#e8492c", "#f0643a", "#d93d27"],    // coral / vermilion shades (figure A)
    figB: ["#1f6fd1", "#2b84e6", "#1a5fb8"],    // cobalt shades (figure B)
  },
  world: {
    background: "#e9e4dc",
    sky: null,
    fog: { color: "#e9e4dc", near: 26, far: 60 },
    environment: "room",
    environmentIntensity: 0.25,
    toneMapping: "neutral",      // keeps the painted colours as designed on a light set
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    wall: { type: "standard", baseColor: "#efebe4", roughness: 0.95, metalness: 0 },
    wallSide: { type: "standard", baseColor: "#e3ddd3", roughness: 0.95, metalness: 0 },
    floor: {
      type: "standard", baseColor: "#ffffff", roughness: 0.85, metalness: 0,
      map: { source: "grid", size: 512, cells: 4, line: 3, bg: "#d3ccc0", fg: "#bbb3a6", repeat: [5, 5], description: "large pale concrete tiles, 1.8 m, thin grout lines" },
    },
    ceiling: { type: "standard", baseColor: "#f4f1ec", roughness: 0.95, metalness: 0, emission: { color: "#f4f1ec", strength: 0.45 } },   // lit ceiling panels
    string: { type: "standard", baseColor: "#2b2b30", roughness: 0.6, metalness: 0 },
    hook: { type: "standard", baseColor: "#8d8f96", roughness: 0.35, metalness: 0.9 },
    tape: { type: "standard", baseColor: "#f2c230", roughness: 0.7, metalness: 0 },
    rail: { type: "standard", baseColor: "#d8d2c8", roughness: 0.8, metalness: 0 },
  },
  pieceMaterial: { roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35 },   // satin painted wood
  lights: [
    { id: "sky", type: "hemisphere", color: "#ffffff", groundColor: "#c9bfae", intensity: 1.35 },
    {
      // high key from front-left: soft shadows fall back-right onto the floor and the back wall
      id: "key", type: "directional", color: "#fff6e8", intensity: 2.1, position: [-7, 13, 10], target: [0.5, 0, -1],
      shadow: { softness: 2.5, mapSize: 4096, extent: 13, near: 1, far: 45, bias: -0.0004, normalBias: 0.03 },
    },
    { id: "fill", type: "directional", color: "#e6eeff", intensity: 0.45, position: [9, 5, 8], target: [0, 2, 0] },
  ],
  post: {
    bloom: { strength: 0.08, radius: 0.3, threshold: 3.0 },
    vignette: { darkness: 0.28, offset: 1.15 },
  },
  camera: { fov: 40, near: 0.2, far: 80, drift: { amp: 0, speed: 0.2 } },   // NO drift: a sweet spot must be exact
  text: { font: "sans", weight: 800, color: "#1d1f24", height: 0.4 },

  // ---- the room (style.js room()) ------------------------------------------------------------------------
  room: { min: [-9.5, 0, -5.5], max: [9.5, 6.4, 12.5], rail: 0.12, skirting: 0.14 },
  // ---- pieces (anamorph.js) -------------------------------------------------------------------------------
  pieces: {
    radius: 0.075,          // rod radius on the image plane as a fraction of the figure height (chunky)
    chunk: 0.62,            // piece arc length on the image plane (m)
    step: 0.07,             // resample step along a piece (m)
    depth: [0.42, 1.7],     // depth factor range (x d0)
    minDist: 3.2,           // never closer than this to the eye (m)
    wallGap: 0.25,
    radial: 14,             // rod cross-section segments
    stringR: 0.009,         // string radius (m)
    sway: 0.09,             // max sway angle (rad) about the string, only away from locks
    swaySpeed: 0.7,
    dimMix: 0.86,           // the figure not being read: mix toward its own grey mid-tone (lifted toward dimTone)
    dimTone: [0.56, 0.57, 0.6],   // linear RGB the grey is lifted toward: a quiet pale mid-tone, not the wall colour
    glow: 0.38,             // emissive flash strength at the lock
  },
  tapeMark: { size: 0.7, width: 0.09 },

  // ---- the beat label: one caption chip pinned to the screen (overlay = exact colours) ---------------------
  caption: {
    y: 948, h: 86, cap: 40,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#1d1f24", ink: "#f6f3ee", eye: "#f2c230",
  },

  sound: {
    converge: { gain: 0.32, notes: [392, 523.25, 659.25, 783.99] },   // G4 C5 E5 G5 — rises as the pieces line up
    lock: { clack: 0.6, thud: 0.55, chime: 0.22 },
    tear: { gain: 0.5, notes: [329.63, 261.63, 196] },                  // E4 C4 G3 — falls as it tears apart
    whoosh: { gain: 0.22 },
    bed: { gain: 0.75, root: 98, brightness: 900 },
  },
  sfx: { enter: "marimba", exit: "pluck", move: "whoosh", land: "clack", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Pieces never move toward the figure: they hang still (a faint sway away from locks); the CAMERA's position is what assembles or tears the figure.",
    "Approach the sweet spot with a decelerating move and land exactly on it; hold perfectly still while locked (drift 0, sway exactly 0).",
    "Leave the sweet spot sideways: parallax tears the figure apart within a few degrees.",
    "The figure not being read sinks to its own muted mid-tone; the read figure flashes once at the lock.",
  ],
};
