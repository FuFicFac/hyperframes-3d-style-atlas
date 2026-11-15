// styles/microscope-slide/spec.js — STYLE_SPEC for "Microscope slide": the view DOWN a light-microscope eyepiece.
// Plain data only (JSON-safe, no THREE, no window). Every number that defines the look lives here.
// Units: the specimen is measured in MICROMETRES (µm) — the shader works in specimen µm, not scene metres.
// Colours are sRGB hex; style.js converts them to linear for the shader (the post stack's OutputPass returns sRGB).

export const STYLE_SPEC = {
  id: "microscope-slide",
  name: "Microscope Slide",
  description:
    "The view down a light-microscope eyepiece: a luminous circular field, translucent living cells with dark membrane rims and DIC-style relief, a razor-thin focal plane, focus racks, objective clicks, and cells dividing one into two into four.",
  palette: {
    bg: "#f6f1e7", // luminous warm-white field
    stainTeal: "#dcefe9",
    stainPink: "#f6e2ea",
    cyto: "#efe2ea", // faint pink-lilac cytoplasm absorption
    rim: "#5e5a6e", // membrane line
    nucleus: "#b7b2dc", // pale violet nucleus stain
    nucleolus: "#7b6fb4",
    chromosome: "#7a2f8f", // deep magenta-violet chromosome stain
    granule: "#6c6672",
    surround: "#0b0c10", // inside the eyepiece tube
    ink: "#f4f1ea",
    accent: "#e9b949",
  },
  world: { background: "#0b0c10", toneMapping: "none", exposure: 1.0 },
  materials: {},
  lights: [],
  post: { grain: { amount: 0.012, fps: 30 } },
  camera: { fov: 35, near: 0.1, far: 10, drift: { amp: 0, speed: 0 } },
  text: { font: "sans", weight: 700, color: "#f4f1ea", height: 0.5 },
  sfx: { enter: "pop", exit: "whooshOut", move: "whir", land: "pluck", emphasis: "marimba", ui: "clack", bed: "pad" },

  // ---------------------------------------------------------------- the eyepiece
  field: {
    center: [0.573, 0.5], // field centre as a fraction of frame width / height (right of centre: captions sit on the left)
    radius: 0.462, // field-stop radius as a fraction of frame height (diameter ≈ 92 % of the frame height)
    edge: 2.2, // field-stop softness (px)
    fringe: 3.2, // chromatic fringe at the field stop (px between the red and blue edges)
    falloff: 0.16, // illumination falloff toward the field edge (x (r/R)^4)
    surroundGlow: 0.35, // faint light scattered into the tube around the field
  },
  // ---------------------------------------------------------------- brightfield / DIC look
  look: {
    relief: 0.34, // DIC shear relief: bright on one side of every edge, dark on the other
    shear: [-0.62, 0.78], // shear direction (bright side faces it)
    halo: 0.075, // phase halo just outside the membrane
    rimDark: 0.62, // membrane line darkness
    cytoAbsorb: 0.22, // cytoplasm tint strength
    nucAbsorb: 0.5, // nucleus stain strength
    chromAbsorb: 0.92, // chromosome stain strength
    granules: 0.34, // granule darkness
    stain: 0.55, // background stain blotches
    domeShade: 0.11, // relief across the body (rounded thickness)
    glow: 0.12, // rounded mitotic cells go phase-bright
    widths: { rim: 0.42, relief: 1.4, haloOffset: 0.75, halo: 0.95 }, // µm
  },
  // ---------------------------------------------------------------- optics: depth of field
  optics: {
    dofK: 0.42, // µm of blur per µm of defocus at the reference field radius
    dofRef: 22, // reference field radius (µm) for dofK: lower power (bigger field) = deeper focus
    baseBlur: 0.08, // µm, always
    blink: { dur: 0.42, dark: 0.92, blur: 3.5 }, // objective change: dark blink + blur spike
  },
  // ---------------------------------------------------------------- lineage (culture.js)
  lineage: {
    daughterScale: 0.8, // daughter radius / parent radius at division
    sEndK: 1.06, // final lobe half-separation / daughter radius (a hair over 1 = the waist closes)
    nucK: 0.42, // nucleus radius / cell radius
    push: 0.45, // daughters drift apart by push x their radius after the split
    pushDur: 2.2, // s
    growth: 0.1, // daughters grow 10 % over growDur
    growDur: 3.5,
    drift: { amp: 0.9, speed: 1 }, // µm, slow seeded wander
    wobble: 0.05, // membrane wobble (fraction of radius)
    spin: 0.18, // slow orientation sway (rad)
    elong: 0.14, // interphase elongation
  },
  debris: { count: 44, spread: 95, zRange: 11, size: [0.25, 1.1], seed: 404 },
  // ---------------------------------------------------------------- overlay (exact colours, drawn after post)
  caption: { x: 104, y: 470, maxW: 470, cap: 54, weight: 700, font: '"Helvetica Neue", Helvetica, Arial, sans-serif', ink: "#f4f1ea", rule: "#e9b949" },
  scaleBar: { right: 1800, y: 905, h: 7, cap: 28, ink: "#f4f1ea", font: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  sampleTag: { right: 1800, y: 140, text: "SAMPLE DATA", cap: 22, h: 40, plate: "#e9b949", ink: "#1b1a17" },
  magTag: { right: 1800, y: 196, cap: 46, ink: "#f4f1ea", sub: "#a9a59b" },
  // ---------------------------------------------------------------- sound palette
  sound: {
    bed: { gain: 0.5, root: 196, brightness: 900 },
    water: { gain: 0.22 },
    round: { gain: 0.35, pitch: 0.8 },
    align: { gain: 0.32, hz: 523.25 },
    split: { gain: 0.9, hz: 392, pop: 0.35 },
    objective: { click: 0.75, clunk: 0.55 },
    focus: { gain: 0.32 },
  },
  motion: [
    "Cells drift on slow seeded sines measured from their birth time; nothing is integrated, so the culture is a pure function of t.",
    "Division: round up -> chromatin condenses -> band at the equator -> two sets pulled to the poles -> waist pinches (smooth union, k -> 0) -> two cells.",
    "Focus racks move the focal plane z; every cell's blur is |z - focus| x dofK, so cells at other depths swim in and out as it passes.",
    "Objective changes are steps hidden inside a dark blink with a blur spike, then a short re-focus.",
  ],
};
