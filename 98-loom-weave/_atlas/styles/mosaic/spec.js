// styles/mosaic/spec.js — STYLE_SPEC for "Mosaic" (Byzantine / Roman tesserae, opus vermiculatum). Plain data only:
// JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the tile plan + score).
// Units: metres. The panel is 8 x 4.5 m (16:9, so the finished panel fills the frame) with ~10 cm tesserae: each tile is
// ~20 px at 1080p when the whole panel is in frame.
//
// The look: a bed of wet grey lime plaster on a workbench, with a faint red-ochre underdrawing (sinopia). Hand-cut stone
// and glass tesserae are pressed in one after another along the contour lines of the picture (rows trace the outlines
// first, then fill inward; the gold ground is laid in rows that ripple outward from the figure). Every chip is a slightly
// irregular, slightly tilted extruded quad, so a low travelling light makes the gold-leaf glass tiles glint one after
// another. Finally the plaster between the tiles goes dark (grouting) and the camera pulls back to the whole panel.

export const STYLE_SPEC = {
  id: "mosaic",
  name: "Mosaic",
  description:
    "Byzantine / Roman tesserae mosaic built tile by tile: on a bed of wet grey lime plaster with a faint red-ochre underdrawing (sinopia), small hand-cut stone and glass tiles are pressed in one after another along the contour lines of the image (opus vermiculatum: rows of tiles trace the outlines first, then fill inward; the gold ground is laid in rows that ripple outward from the figure), not on a pixel grid. Rows are iso-contours of an exact distance transform of the picture's regions, traced by marching squares and resampled at tile pitch. Each tile is a slightly irregular, slightly tilted 3D chip (stone matte, smalti glossy, gold-leaf glass metallic), so when a low light sweeps across, the gold tiles glint one after another in a travelling shimmer. Once set a tile never moves. The grout darkens at the end and the camera pulls back to the whole bordered panel. Clicks are one per short bin of the same tile schedule, so the sound density follows the laying.",
  palette: {
    bg: "#d9d3c8",
    plaster: "#aca8a0",
    grout: "#3a3530",
    sinopia: "#b4472c",
    table: "#7a5f45",
    frame: "#4a3527",
    ink: "#221d19",
    chip: "#221d19",
    chipInk: "#f4ead2",
    accent: "#d9a73e",
  },
  // tesserae colours (each list = hand-cut variation; the planner picks per tile, seeded)
  tesserae: {
    outline: ["#2a2420", "#332b25", "#231f1c"],
    back: ["#2a7f87", "#2f8a8c", "#246f7c", "#318f93"],
    back2: ["#1f5f73", "#22687a"],
    stripe: ["#e2a33a", "#e8b04b", "#d8952f"],
    belly: ["#efe3c6", "#e8dbbd", "#f3ead4"],
    belly2: ["#e9c3a4", "#e3b796"],
    fin: ["#c8452e", "#d0503a", "#bb3d28"],
    fin2: ["#e0703f", "#e67c48"],
    gill: ["#8e2c22", "#7f261e"],
    pupil: ["#141212"],
    cream: ["#f1ebdc", "#ece4d0", "#f5f0e4"],
    foam: ["#f2f0ea", "#e9ece9"],
    sea1: ["#4f9ec4", "#5aa8cc", "#4893bb"],
    sea2: ["#7cc0d8", "#86c8dd"],
    deep: ["#214f8c", "#275a98", "#1c4680", "#2a5f9c"],
    gold: ["#f2c04a", "#f6ca58", "#ebb540", "#f8d066", "#efbd48"],
    gold2: ["#d99b46", "#f2d48a"],
    borderRed: ["#86302a", "#7a2a24", "#913730"],
    ochre: ["#c9933f", "#bf8837"],
  },
  world: {
    background: "#d9d3c8",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.85,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    table: { type: "standard", baseColor: "#ffffff", roughness: 0.7, metalness: 0, map: { source: "wood", size: 512, boards: 5, seed: 67, dark: "#5a412e", mid: "#7a5f45", light: "#94775a", repeat: [3, 3], description: "worn oak workbench boards" } },
    frame: { type: "standard", baseColor: "#4a3527", roughness: 0.62, metalness: 0 },
    plaster: { type: "standard", baseColor: "#aca8a0", roughness: 0.42, metalness: 0, bump: { source: "bumpNoise", scale: 48, octaves: 4, seed: 671, strength: 0.25, description: "trowelled wet lime plaster" } },
    stone: { type: "standard", baseColor: "#ffffff", roughness: 0.66, metalness: 0 },
    glass: { type: "physical", baseColor: "#ffffff", roughness: 0.3, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.25 },
    gold: { type: "physical", baseColor: "#ffffff", roughness: 0.2, metalness: 0.85, clearcoat: 0.6, clearcoatRoughness: 0.06, emission: { color: "#7a4e0c", strength: 0.5 } },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fff8ee", groundColor: "#8c8276", intensity: 1.0 },
    {
      // warm high key from front-left: bright plaster, short soft tile shadows back-right
      id: "key", type: "directional", color: "#fff1dc", intensity: 2.4, position: [-4.5, 9.0, 5.5], target: [0, 0, 0],
      shadow: { softness: 1.6, mapSize: 4096, extent: 5.0, near: 1, far: 30, bias: -0.0003, normalBias: 0.01 },
    },
  ],
  post: {
    bloom: { strength: 0.3, radius: 0.22, threshold: 2.8 },
    vignette: { darkness: 0.28, offset: 1.15 },
  },
  camera: { fov: 32, near: 0.3, far: 60, drift: { amp: 0, speed: 0.2 } },   // no drift: still holds keep 3k tiles still
  text: { font: "serif", weight: 700, color: "#221d19", height: 0.3 },

  // ---- the panel + tiles ---------------------------------------------------------------------------------
  panel: { width: 8, height: 4.5, border: 3, frame: 0.2, frameH: 0.07, bedDepth: 0.0 },
  tile: {
    pitch: 0.098,        // row spacing = nominal tile size (m); gap fraction below
    gap: 0.15,           // share of pitch left as grout
    thickness: 0.05,
    protrude: 0.024,     // how far the set tile's top stands above the plaster
    bevel: 0.006,
    jitter: 0.09,        // corner jitter of the cut (share of size) — irregular hand-cut chips
    tiltGold: 0.13,      // rad: gold glass is set at a slight random tilt so it glints tile by tile
    tiltStone: 0.035,
    variants: 3,         // distinct cut shapes per kind
    seed: 67,
  },
  set: { dur: 0.24, drop: 0.11, press: 0.006, spin: 0.35 },   // tile drop-in: from 11 cm above, pressed 6 mm, then still
  sweep: { color: "#fff0d0", intensity: 13, height: 1.5, z: -5.5, decay: 1.2 },  // the travelling low light (point light)
  grout: { soft: 0.9 },  // m: soft edge of the grout wipe

  // ---- overlay caption chip (top centre) -------------------------------------------------------------------
  caption: {
    x: 960, y: 46, h: 84, cap: 40, maxW: 820,
    font: 'Georgia, "Times New Roman", Times, serif', weight: 700,
    plate: "#221d19", edge: "#c9a24a", ink: "#f4ead2", gem: "#d9a73e",
  },

  sound: {
    set: { gain: 0.42, base: 0.35, per: 0.22, stonePitch: 0.75, goldPitch: 1.5 },
    sketch: { gain: 0.32 },
    glint: { gain: 0.16, pitch: 1.0 },
    grout: { gain: 0.28 },
    bed: { gain: 0.9, root: 110, chord: [0, 7, 12, 16], brightness: 650 },
  },
  sfx: { enter: "click", exit: "whooshOut", move: "whoosh", land: "click", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Every tile has one set time from tessera.js; it drops 11 cm, presses 6 mm into the plaster over 0.24 s, then never moves again.",
    "Rows are contour lines of the picture (distance-transform iso-lines), laid progressively from a phase anchor: outlines first, then inner rows, then the gold ground rippling outward from the figure, then the border.",
    "Gold tiles carry a random tilt (~7 deg), so the travelling point light catches them one after another.",
    "Camera: three locked shots joined by three short eased moves (no drift); set tiles never move, so holds compress well even while new tiles drop in.",
  ],
};
