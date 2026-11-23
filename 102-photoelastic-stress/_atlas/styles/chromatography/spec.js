// styles/chromatography/spec.js — STYLE_SPEC for "Chromatography" (paper chromatography on a daylight lab bench).
// Plain data only: JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for
// the plan + score) and the browser. Units: metres, Y-up, radians, sRGB hex. Toy-scale exaggerated (a 1.2 m strip in
// a 0.6 m jar) so bands and the paper's fibre read at 1080p.
//
// The look: a white tiled lab wall, a pale grey resin bench, a short wide glass jar with a little clear solvent,
// a strip of white filter paper hanging into it from a binder clip on a clamp-stand arm, a steel rule beside it, a felt
// pen, and a small drying rack with two strips that have already been run. The strip is ONE shader: fibre texture
// baked in code, a darker damp region under a wobbly solvent front with a faint tide line, and dye bands as soft
// Gaussians that SUBTRACT light (Beer–Lambert per RGB channel), so overlapping dyes read black.

export const STYLE_SPEC = {
  id: "chromatography",
  name: "Chromatography",
  description:
    "Paper chromatography on a bright daylight lab bench: a white filter-paper strip hangs from a binder clip into a short glass jar with a little clear solvent, beside a steel rule, in front of a white tiled wall; a felt pen dots black ink near the bottom, the damp solvent front climbs the paper (square-root-of-time wicking on a speeding time-lapse clock) and the black dot stretches and splits into blue, magenta and yellow bands, each travelling at its own fixed fraction of the front and widening as it goes; the strip is lifted out and hung on a rack beside two finished strips with different band sets. The strip is one shader: code-baked fibre texture, darker damp region with a tide line, and Gaussian dye bands that subtract light per RGB channel (overlaps go dark, separated dyes show their colour). Clean whites, cool steel and glass, three saturated dye colours.",
  palette: {
    bg: "#e9ecee",
    wall: "#e6eaec",
    grout: "#b4bdc3",
    bench: "#b9c2c8",
    benchEdge: "#9aa3aa",
    paper: "#f7f6f1",
    steel: "#c4cad0",
    darkSteel: "#4b5157",
    clip: "#24272b",
    pen: "#2b2e33",
    penBand: "#e8e6df",
    glass: "#e3f0f2",
    solvent: "#d8ecf2",
    ink: "#1c2026",
    blue: "#1f5fc7",
    magenta: "#d1307e",
    yellow: "#f2c21b",
  },
  world: {
    background: "#e9ecee",
    sky: null,
    fog: { color: "#e9ecee", near: 9, far: 22 },
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#b9c2c8", roughness: 0.5, metalness: 0 },
    benchEdge: { type: "standard", baseColor: "#9aa3aa", roughness: 0.5, metalness: 0 },
    wall: { type: "standard", baseColor: "#ffffff", roughness: 0.35, metalness: 0, map: { source: "grid", size: 512, cells: 4, line: 5, bg: "#e6eaec", fg: "#b4bdc3", description: "white square wall tiles with grey grout, 4 tiles per texture tile" } },
    steel: { type: "standard", baseColor: "#c4cad0", roughness: 0.32, metalness: 0.9 },
    darkSteel: { type: "standard", baseColor: "#4b5157", roughness: 0.45, metalness: 0.6 },
    clip: { type: "physical", baseColor: "#24272b", roughness: 0.32, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.2 },
    pen: { type: "physical", baseColor: "#2b2e33", roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3 },
    penBand: { type: "standard", baseColor: "#e8e6df", roughness: 0.5, metalness: 0 },
    nib: { type: "standard", baseColor: "#16181b", roughness: 0.9, metalness: 0 },
    paper: { type: "standard", baseColor: "#ffffff", roughness: 0.9, metalness: 0, side: "double" },
    rule: { type: "standard", baseColor: "#ffffff", roughness: 0.38, metalness: 0.55 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#f6f9ff", groundColor: "#b9bcbe", intensity: 1.15 },
    {
      // daylight from a window high on the left: short soft shadows fall right and back
      id: "key", type: "directional", color: "#fffaf2", intensity: 2.1, position: [-3.2, 4.4, 2.6], target: [-0.3, 0.6, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 2.3, near: 0.5, far: 14, bias: -0.0004, normalBias: 0.01 },
    },
    { id: "rim", type: "directional", color: "#dfe9ff", intensity: 0.6, position: [2.6, 2.4, -3.0], target: [0, 0.6, 0] },
  ],
  post: {
    vignette: { darkness: 0.2, offset: 1.2 },
  },
  camera: { fov: 30, near: 0.05, far: 30, drift: { amp: 0, speed: 0.2 } }, // locked holds: paper fibre + moving camera = bitrate
  text: { font: "sans", weight: 700, color: "#1c2026", height: 0.1 },

  // ---- set (bench top at y = 0, jar centred on the origin, strip plane at z = 0 facing +Z) ---------------------
  bench: { w: 5.2, d: 2.4, thick: 0.06, front: 1.1 },
  wall: { z: -1.25, w: 10, h: 3.2, tile: 0.16 },
  jar: { r: 0.3, h: 0.3, glass: 0.012, base: 0.022, solventY: 0.12, segments: 72 },
  glass: { color: "#e3f0f2", alphaFace: 0.05, alphaRim: 0.55, fresnelPower: 2.6, rimStrength: 0.3, envIntensity: 1.1 },
  solventGlass: { color: "#cfe8f0", alphaFace: 0.12, alphaRim: 0.42, fresnelPower: 2.0, rimStrength: 0.12, envIntensity: 0.8 },
  stand: { base: [0.42, 0.03, 0.26], z: -0.5, rodR: 0.012, rodH: 1.98, armR: 0.009, boss: 0.055 },
  rule: { x: 0.258, w: 0.042, thick: 0.003, len: 1.12, top: 0.05, tick: 0.01 },
  rack: { y: 1.6, z: -0.2, x0: -2.36, x1: -0.8, r: 0.01, footR: 0.07 },
  clip: { w: 0.11, h: 0.05, d: 0.028, wire: 0.003, hook: 0.03 },
  pen: { r: 0.022, len: 0.3, cone: 0.045, nibR: 0.0055, nibLen: 0.014 },

  // ---- the strip -------------------------------------------------------------------------------------------
  strip: { L: 1.2, W: 0.4, bow: 0.008, dotV: 0.26, dotU: 0, segW: 10, segL: 2 },
  paper: {
    tile: 0.2,           // metres per fibre-texture tile
    fibre: 0.11,         // fibre contrast (darkening of the darkest fibres)
    fibres: 5200,        // fibres drawn into the 512 px tile
    wobble: 0.012,       // m of front-line wobble (from the formation noise)
    wet: "#dde3e7",      // multiply colour of damp paper (slightly cool grey)
    soaked: "#c9d3da",   // below the solvent surface
    tide: 0.2,          // darkening of the thin tide line at the front
    wetRough: 0.55,      // damp paper is a little glossier
  },
  // the black ink: three dyes with fixed retention factors (Rf) — absorbance per RGB channel in `dyes`
  ink: [
    { dye: "blue", rf: 0.3, mass: 1.0 },
    { dye: "magenta", rf: 0.56, mass: 0.9 },
    { dye: "yellow", rf: 0.84, mass: 1.05 },
  ],
  dyes: {
    blue: [3.05, 1.05, 0.1],
    magenta: [0.4, 2.3, 0.75],
    yellow: [0.15, 0.25, 2.75],
  },
  spread: { s0: 0.024, au: 0.11, av: 0.014, bloom: 0.008, bloomAt: 0.04, crispDry: 2.4, crispWet: 1.6, tail: 0.1, gain: 3.5, suMax: 0.125 },
  // the two strips that were run earlier (rack, left to right): different inks, different band sets
  finished: [
    { name: "green ink", frontV: 0.98, ink: [{ dye: "blue", rf: 0.34, mass: 0.95 }, { dye: "yellow", rf: 0.78, mass: 1.15 }] },
    { name: "violet ink", frontV: 1.0, ink: [{ dye: "blue", rf: 0.2, mass: 0.7 }, { dye: "magenta", rf: 0.5, mass: 1.05 }, { dye: "yellow", rf: 0.9, mass: 0.35 }] },
  ],

  // ---- overlay caption chip (top left) ------------------------------------------------------------------------
  caption: {
    x: 72, y: 56, h: 92, cap: 40, maxW: 860,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#1c2026", edge: "#39404a", ink: "#f7f6f1",
  },

  sound: {
    penIn: { gain: 0.16 },
    tick: { gain: 0.55, scratch: 0.3 },
    lower: { gain: 0.18 },
    dip: { gain: 0.4 },
    hiss: { gain: 0.34, density: 0.55, pitch: 1.5 },
    split: { gain: 0.42, notes: { yellow: 783.99, magenta: 587.33, blue: 392.0 } },
    lift: { gain: 0.3 },
    hang: { gain: 0.4 },
    chord: { gain: 0.3, root: 392.0, notes: [0, 4, 7, 12] },
    bed: { gain: 0.26, root: 196.0, chord: [0, 7, 12, 16], brightness: 1100 },
  },
  sfx: { enter: "tick", exit: "whooshOut", move: "whoosh", land: "click", emphasis: "marimba", ui: "tick", bed: "pad" },
  motion: [
    "Solvent front: distance above the solvent = K·sqrt(process time) (Lucas–Washburn wicking); process time is a time-lapse clock that speeds up once the front passes the dot.",
    "Each dye's band centre = origin + Rf × (front − origin); its width grows linearly with the distance it has travelled and its peak falls so its amount is conserved.",
    "Colour is subtractive per RGB channel (exp(−Σ absorbance·concentration)): overlapping dyes read black, separated ones show their own colour.",
    "Strip moves are rigid: lowered on the clamp arm into the jar, lifted out on a Bezier arc to the rack with a small damped sway.",
    "Camera: locked holds, one move per beat, following the dot and then the bands up the strip; one pull-back to the rack at the end.",
  ],
};
