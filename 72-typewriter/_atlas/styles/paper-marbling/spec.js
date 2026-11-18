// styles/paper-marbling/spec.js — STYLE_SPEC for "Paper Marbling" (ebru / suminagashi method). Plain data only:
// JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the plan + score)
// and the browser. Units: metres, Y-up, radians, sRGB hex. The tray is toy-scale exaggerated (3.2 m bath) so thin
// combed filaments still read at 1080p.
//
// The look: a white enamel tray of thickened water on a pale wood studio table, seen from above with a slight tilt.
// A pipette lets drops of ink fall; each spreads into a disc and pushes everything already floating outward
// (concentric rings). A stylus and a comb are drawn through the bath and the rings stretch into feathers and chevrons.
// A sheet of paper is rolled onto the surface, peeled away carrying the pattern, lifted and turned to the camera.
// Nothing is simulated: marbleplan.js lists closed-form marbling operations with start/end times and the fragment
// shader inverse-maps every pixel through them.

export const STYLE_SPEC = {
  id: "paper-marbling",
  name: "Paper Marbling",
  description:
    "Paper marbling in a shallow white enamel tray on a bright pale-wood studio table, seen from above with a slight tilt. A glass pipette lets drops of ink fall onto thickened water; each drop spreads into a flat disc and pushes every earlier colour outward into concentric rings; a stylus is drawn back and forth and a comb is pulled across, and the rings stretch into feathers and chevrons; a sheet of paper is rolled onto the bath, peeled away carrying the pattern (the bath is left almost clean), lifted and turned to the camera as a finished print. The pattern is not simulated: it is a composition of closed-form area-preserving marbling deformations (ink-drop displacement, tine-line and comb displacement, from the mathematical marbling literature) applied in plan order; a fragment shader inverse-maps each pixel through the operations so far, the current one partially applied by its progress, so any frame is a pure function of t. Flat saturated inks (indigo, vermilion, ochre, teal, cream) with a slightly denser rim per drop; soft daylight; water plips, soft drags and paper sounds come from the same plan.",
  palette: {
    bg: "#d9cfbf",
    table: "#dcc6a0",
    tray: "#f6f3ec",
    trayRim: "#27406f",
    bath: "#cfdcdb",
    paper: "#f8f2e4",
    indigo: "#22386b",
    vermilion: "#d6452a",
    ochre: "#ecb43c",
    teal: "#2c8c80",
    cream: "#f6ecd4",
    ink: "#1c2233",
    wood: "#b98a55",
    brass: "#b9975b",
    rubber: "#2a2c33",
  },
  world: {
    background: "#d9cfbf",
    sky: null,
    fog: { color: "#d9cfbf", near: 14, far: 34 },
    environment: "room",
    environmentIntensity: 0.4,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    table: { type: "standard", baseColor: "#ffffff", roughness: 0.78, metalness: 0, map: { source: "wood", size: 1024, boards: 4, seed: 75, grainFreq: 18, grainWarp: 1.6, contrast: 0.22, dark: "#d6c3a2", mid: "#e4d4b6", light: "#efe3cb", seam: "#c2ac88", description: "pale birch planks" } },
    tray: { type: "physical", baseColor: "#f6f3ec", roughness: 0.3, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.25 },
    trayRim: { type: "standard", baseColor: "#27406f", roughness: 0.35, metalness: 0 },
    bath: { type: "physical", baseColor: "#ffffff", roughness: 0.3, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3 },
    paper: { type: "standard", baseColor: "#ffffff", roughness: 0.92, metalness: 0, side: "double" },
    wood: { type: "standard", baseColor: "#b98a55", roughness: 0.6, metalness: 0 },
    brass: { type: "standard", baseColor: "#b9975b", roughness: 0.32, metalness: 1 },
    steel: { type: "standard", baseColor: "#c9ccd2", roughness: 0.3, metalness: 1 },
    rubber: { type: "standard", baseColor: "#2a2c33", roughness: 0.7, metalness: 0 },
    glass: { type: "physical", baseColor: "#ffffff", roughness: 0.08, metalness: 0, opacity: 0.32 },
    jar: { type: "physical", baseColor: "#f3f1ec", roughness: 0.25, metalness: 0, clearcoat: 0.4 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fdf9f2", groundColor: "#a39a8c", intensity: 0.95 },
    {
      // soft high daylight key from front-left: short soft tool shadows fall back-right across the bath
      id: "key", type: "directional", color: "#fff5e6", intensity: 2.0, position: [-3.4, 7.0, 4.2], target: [0, 0, 0],
      shadow: { softness: 2.4, mapSize: 2048, extent: 3.4, near: 0.5, far: 24, bias: -0.0004, normalBias: 0.012 },
    },
    { id: "rim", type: "directional", color: "#d6e4ff", intensity: 0.45, position: [3.0, 3.0, -5.0], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.26, offset: 1.15 },
  },
  camera: { fov: 32, near: 0.3, far: 40, drift: { amp: 0, speed: 0.2 } }, // locked during holds: flat colour compresses, drift would not
  text: { font: "sans", weight: 700, color: "#1c2233", height: 0.3 },

  // ---- the tray (bath = XZ rectangle centred on the origin; marbling coords x -> +X, y -> +Z toward the viewer) ----
  tray: {
    w: 3.2, h: 1.8,        // bath (inner) size, m
    wall: 0.07, height: 0.15, rim: 0.03,
    bathY: 0.1,            // bath surface height above the table
    table: { size: 26, y: 0, plankMetres: 2.6 },
  },

  // ---- the inks (index = order here; plans refer to inks by name) -------------------------------------------
  inks: ["indigo", "vermilion", "ochre", "teal", "cream"],
  look: {
    rim: 0.16,             // darkening of a drop's outer rim (pigment gathers at the edge)
    rimStart: 0.8,         // normalised drop radius where the rim starts
    mottle: 0.07,          // +- value mottling carried with the fluid
    mottleScale: 5.0,
    residue: 0.86,         // share of ink the paper takes from under itself (bath is left this much cleaner)
    ghost: 0.14,           // ink showing through the back of the wet sheet
    printGain: 0.96,       // print is slightly more matte than the wet bath
  },
  maxOps: 30,              // shader array size (ops beyond this throw in the planner)

  // ---- operations: defaults for marbleplan.js -----------------------------------------------------------
  drop: { spread: 0.6, ease: "outCubic", fall: 0.12, form: 0.05, height: 0.5, bead: 0.055 },
  tine: { alpha: 0.42, lambda: 0.15, soft: 0.85, margin: 0.06 },
  comb: { alpha: 0.3, lambda: 0.065, soft: 0.7, spacing: 0.24, margin: 0.06 },

  // ---- tools --------------------------------------------------------------------------------------------
  tools: {
    pipette: { length: 0.95, r: 0.038, lean: [1.0, 0.85, 0.5], park: [-3.6, 1.2, -0.6], hop: 0.1 },
    stylus: { length: 1.25, rTip: 0.008, rGrip: 0.032, lean: [0.95, 0.8, 0.6], park: [3.6, 0.9, 0.7], hop: 0.22, dip: 0.012 },
    comb: { bar: [0.07, 0.07], tineLen: 0.24, tineR: 0.013, park: [-3.3, 0.5, 0], exit: [3.3, 0.5, 0], hop: 0.3, dip: 0.02 },
    jars: { r: 0.11, h: 0.16 },
  },

  // ---- the sheet ----------------------------------------------------------------------------------------
  paper: {
    w: 3.0, h: 1.66,        // m: a little smaller than the bath, so a thin patterned margin stays in the tray
    segments: 56,           // along the peel direction (z)
    gap: 0.004,             // m above the bath when laid
    lay: { angle: 0.9, radius: 0.3, from: [3.9, 0.15, 0], slide: 0.36 },   // carried in from the right, far edge down first; slide = share of the lay time
    peel: { angle: 2.15, radius: 0.24, pull: [1.25, 0.1] },                                    // flap leans back ~123 deg: its print side faces the viewer
    present: { centre: [0, 1.3, 0.05], elevation: 0.62, hop: 0.12 },       // final pose: facing a camera at this elevation
  },

  // ---- overlay caption chip (top centre) ------------------------------------------------------------------
  caption: {
    x: 960, y: 40, h: 92, cap: 40, maxW: 900,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#1c2233", edge: "#3a4563", ink: "#f8f2e4",
  },

  sound: {
    plip: { gain: 0.5, pitch: [0.75, 1.5], bubble: 0.34 },
    drag: { gain: 0.26, q: 0.9, pitch: 0.7, bubble: 0.16 },
    comb: { gain: 0.3, rustle: 0.2, density: 0.7 },
    lay: { gain: 0.42 },
    peel: { gain: 0.5, whoosh: 0.26 },
    present: { chime: 0.2, whoosh: 0.22 },
    bed: { gain: 0.3, root: 174.6, chord: [0, 7, 12, 16], brightness: 900 },
  },
  sfx: { enter: "bubble", exit: "whooshOut", move: "whoosh", land: "bubble", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Every pattern frame = the plan's operations so far, composed in order; the current operation is applied by its progress. Nothing is simulated or accumulated.",
    "A drop: radius grows with outCubic (area eases in); everything already floating is pushed out along rays so areas are preserved.",
    "A stylus or comb stroke: ink is dragged along the stroke, falling off with distance from the tine; the drag follows the tool tip across the bath.",
    "The sheet rolls down onto the bath (a moving contact line), rests, is peeled back from the near edge on a cylinder of fixed radius, then moves rigidly up to face the camera.",
    "Camera: locked top-down three-quarter for the whole making; ONE lowering move while the print is presented.",
  ],
};
