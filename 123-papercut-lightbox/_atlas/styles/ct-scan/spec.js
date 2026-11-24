// styles/ct-scan/spec.js — STYLE_SPEC for "CT Scan". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, the demo's scene.config.js) and the browser. Units: metres.
//
// The look: a bright, clean scanner room — white floor, teal walls, white machines with glowing teal trim. A sealed
// cardboard box rises on a lift through a white scanner ring; a teal scan line crawls down it. Each slice appears as a
// grey cross-section (bright on a dark screen) on a big floating panel; the slices peel off as thin translucent film
// cards and line up in a spaced row; the row closes into one block and the block becomes a ray-marched volume: a faint
// sand-coloured ghost box with a coral toy robot inside and bright white-gold metal parts. A dial removes cardboard,
// then plastic, leaving the metal: two gears and a wind-up key turning in space.

export const STYLE_SPEC = {
  id: "ct-scan",
  name: "CT Scan",
  description:
    "Slice by slice: a sealed cardboard box rises on a lift through a white scanner ring in a bright white-and-teal room while a teal scan line crawls down it. Each slice appears as an exact grey cross-section (bright on a dark screen) of a baked voxel volume on a big floating panel; the slices peel off as thin translucent film cards, line up in a spaced row, close up into one block and become a ray-marched volume: a ghostly sand-coloured box with a coral toy robot inside and bright white-gold metal parts (gears, wind-up key, eyes, pins). A dial raises the threshold: cardboard fades, then plastic, leaving the metal turning in space. Scanner whirr, slice ticks, a run of snaps as the stack closes, a chord at the reveal, dial clicks.",
  palette: {
    bg: "#3f8f96",
    wall: "#3f8f96",
    floor: "#eef3f2",
    white: "#f4f7f7",
    teal: "#0f9fa3",
    tealGlow: "#5ff3e6",
    screen: "#0c2731",
    sliceInk: "#f2fbfb",
    kraft: "#c39a62",
    kraftDark: "#a77c47",
    tape: "#e3d1a9",
    card: "#f2ddb0",        // volume: cardboard
    plastic: "#ff8a66",     // volume: plastic (coral)
    metal: "#fff2cf",       // volume: metal (white-gold)
    caption: "#0a4f57",
    captionInk: "#ffffff",
    accent: "#5ff3e6",
  },
  world: {
    background: "#3f8f96",
    sky: null,
    fog: null,
    environment: "room",     // soft reflections on the white clear-coated machines
    environmentIntensity: 0.42,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    floor: { type: "standard", baseColor: "#eef3f2", roughness: 0.5, metalness: 0 },
    white: { type: "physical", baseColor: "#f3f6f6", roughness: 0.3, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.22 },
    whiteMatte: { type: "standard", baseColor: "#e6eded", roughness: 0.62, metalness: 0 },
    grey: { type: "standard", baseColor: "#a7b7b9", roughness: 0.45, metalness: 0.15 },
    dark: { type: "standard", baseColor: "#24464c", roughness: 0.4, metalness: 0.1 },
    teal: { type: "standard", baseColor: "#13a4a6", roughness: 0.35, metalness: 0, emission: { color: "#19c9c6", strength: 0.35 } },
    tealGlow: { type: "standard", baseColor: "#5ff3e6", roughness: 0.4, metalness: 0, emission: { color: "#4ff0e4", strength: 3.0 } },
    turntable: { type: "standard", baseColor: "#cfdcdc", roughness: 0.45, metalness: 0 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#ffffff", groundColor: "#a9cfcf", intensity: 1.25 },
    {
      id: "key", type: "directional", color: "#fffaf2", intensity: 2.1, position: [1.2, 6.0, 4.2], target: [-0.6, 0.8, 0],
      shadow: { softness: 6, mapSize: 2048, extent: 3.8, near: 1, far: 16, bias: -0.0004, normalBias: 0.02 },
    },
    { id: "rim", type: "directional", color: "#d8fffb", intensity: 0.55, position: [-3, 3, -4], target: [0, 1, 0] },
  ],
  post: {
    bloom: { strength: 0.5, radius: 0.45, threshold: 1.45 },
    vignette: { darkness: 0.16, offset: 1.25 },
  },
  camera: { fov: 34, near: 0.05, far: 40, drift: { amp: 0, speed: 0.2 } }, // no drift: holds stay still (bitrate)
  text: { font: "sans", weight: 700, color: "#0a4f57", height: 0.3 },

  // ---- the room ------------------------------------------------------------------------------------------------
  room: { floorR: 7, wallR: 6.4, wallH: 7, wallTop: "#2d7a81", wallBottom: "#4f9fa5", seams: 18, seamColor: "#62adb2", coveH: 0.24, cove: "#e8efee" },

  // ---- the scanner: a white ring on two legs; the box rides a lift column up through it ------------------------
  scanner: {
    pos: [-2.0, 0, 0.0],
    scanY: 1.05,                 // the scan plane = the ring's top face
    rIn: 0.62, rOut: 0.98, thick: 0.12,
    leg: { w: 0.14, d: 0.24, x: 0.8 },
    base: { r: 0.5, h: 0.05 },
    column: { r: 0.09 },
    tray: { r: 0.33, h: 0.03 },
    detector: { r: 0.615, h: 0.045, segments: 40, speed: 2.2 },
    sheet: { color: "#5ff3e6", alpha: 0.22 },
    line: { color: "#7dfff2", strength: 5.0, width: 0.012, pad: 0.004 },
  },
  box: { kraft: "#c79e66", kraftDark: "#a97f4a", tape: "#e7d7b2", ink: "#6b4a2b", px: 420 },

  // ---- the floating panel (dark screen, 6 x 3 slice cells) ------------------------------------------------------
  panel: { c: [0.3, 2.42, -0.95], cols: 6, rows: 3, scale: 0.6, gap: 0.05, pad: 0.09, bezel: 0.06, depth: 0.06,
    screen: "#0d2a35", screenEdge: "#12404d", cellLine: "#2c8e97", glow: "#5ff3e6" },

  // ---- the reconstruction plinth + turntable --------------------------------------------------------------------
  plinth: { c: [0.45, 0, 0.35], r: 0.6, h: 0.8, table: 0.03, tableR: 0.54, ticks: 36 },

  // ---- slices: grey = dot(coverage, grey) (cardboard faint, plastic mid, metal white), film cards ---------------
  slice: { ink: "#f2fbfb", film: "#c9f3f1", filmAlpha: 0.05, grey: [0.36, 0.7, 1.0], grain: 0.07, line: "#5ff3e6",
    frame: "#8af0ea", frameAlpha: 0.9, frameW: 0.0045, edge: 0.006 },

  // ---- the ray-marched volume -----------------------------------------------------------------------------------
  volume: {
    steps: 64,
    colors: { card: "#f2ddb0", plastic: "#ff8a66", metal: "#fff1c8" },
    emission: [1.0, 1.25, 3.4],   // per material (card, plastic, metal), multiplies the colour
    sigma: [13, 42, 170],         // extinction per metre of full coverage
    shade: 0.55,                  // gradient shading strength (plastic + card)
    light: [-0.45, 0.8, 0.4],     // shading light direction (volume local)
    soft: 1.25,                   // analytic parts' coverage ramp (voxels)
  },
  shadow: { color: "#1f4a4f", strength: 0.42, offset: [0.035, -0.05], sigma: [4, 12, 40] },
  bake: { nx: 116, ny: 128, nz: 96, soft: 1 },

  // ---- overlay caption (bottom-left chip; the top-left 140 x 110 px corner stays clear for the reel badge) ------
  caption: {
    x: 92, y: 934, h: 92, cap: 35, font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#0a4f57", edge: "#5ff3e6", ink: "#ffffff", icon: "#5ff3e6", maxW: 880, roll: 0.4,
  },
  // ---- the dial (overlay, bottom right, beat 5): three detents = card / plastic / metal ------------------------
  dial: { x: 1724, y: 918, r: 74, knob: "#f4f7f7", ring: "#0a4f57", pointer: "#0f9fa3", detents: [-55, 0, 55],
    colors: ["#e7cf9e", "#ff8a66", "#fff1c8"] },

  sound: {
    bed: { gain: 0.3, root: 110, chord: [0, 7, 12, 19], brightness: 700, attack: 1.2, release: 2.0 },
    whir: { gain: 0.34, hz: 118, hz2: 236 },
    tick: { gain: 0.3 },
    snap: { gain: 0.32 },
    chord: { gain: 0.5 },
    dial: { gain: 0.4 },
    ratchet: { gain: 0.2 },
  },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "whoosh", land: "click", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "The box rides a lift up through the ring at constant speed; the scan plane is fixed, so the teal line crawls DOWN the box.",
    "Each slice draws in on the panel with a wiping scan line; the image is an exact cross-section of the baked volume.",
    "Slices swing off the panel like doors, fly down and line up as a spaced row of film cards (the box lying on its side).",
    "The gaps close from the feet end (a run of snaps); the cards cross-fade into the ray-marched volume, which tips upright and turns.",
    "A dial removes materials by threshold: cardboard, then plastic; the metal key and gears turn (key and gear A share an axle).",
  ],
};
