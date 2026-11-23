// styles/isometric-pastel/spec.js — STYLE_SPEC for Isometric Pastel. Plain data only:
// JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs) and the browser.
// Units: metres, Y-up right-handed, colors sRGB hex, angles radians.
//
// Look: tech-explainer isometric illustration made truly 3D. Strict orthographic true-isometric camera (35.264 deg
// elevation, 45 deg azimuth, never rotates), extruded blocks on a modular grid, FLAT three-tone faces computed from
// one base colour (top lightest, left mid, right darkest) by an unlit shader — no lights, no gradients, no specular,
// no textures, no post. Flat geometric long shadows at a fixed angle; pale ground with an anti-aliased dot grid.

export const STYLE_SPEC = {
  id: "isometric-pastel",
  name: "Isometric Pastel",
  description:
    "Clean tech-explainer isometric illustration in true 3D: a locked orthographic isometric camera, extruded blocks on a modular grid with flat three-tone faces (top light, left mid, right dark) from a soft pastel palette, geometric long shadows, a pale dot-grid ground, capsule people, axis-aligned cables and conveyors, and one saturated accent.",
  palette: {
    bg: "#f3f1f7",
    ground: "#f3f1f7",
    dot: "#d3cde2",
    ink: "#26244a",
    inkSoft: "#6b6890",
    paper: "#ffffff",
    // pastels (bases = the LEFT face tone; top and right are computed)
    lilac: "#b3a4ee",
    mint: "#8fd8bf",
    peach: "#ffbe9c",
    sky: "#9fc4f3",
    butter: "#ffdc85",
    rose: "#f5a9c2",
    cloud: "#e9e6f3",
    slate: "#6f6b9e",
    // one saturated accent
    accent: "#ff5c39",
    // skin / hair for capsule people
    skin: "#ffd2b5",
    hair: "#3d3966",
    people: ["#ff8a7a", "#7aa7f0", "#ffd166", "#6fcfa8", "#b49cf2"],
  },
  // three face tones from one base: tone = mix(base, toward, k) in sRGB (illustrator tints)
  tones: {
    top: { toward: "#ffffff", k: 0.42 },
    left: { toward: "#ffffff", k: 0.0 },
    right: { toward: "#4a467e", k: 0.24 },
    edge: { toward: "#2b2858", k: 0.45 },
  },
  shadow: {
    // planar long shadow: horizontal offset per metre of height along `dir` (world XZ, fixed angle)
    dir: [1, 0.0],
    length: 0.62,
    toward: "#5b5690", // shadow tone = mix(receiver tone, toward, k)
    k: 0.13,
    lift: 0.004,
  },
  grid: { cell: 0.5, dotRadius: 0.035, majorEvery: 4, majorRadius: 0.055, size: 240 },
  outline: { enabled: false, width: 1, toward: "#2b2858", k: 0.45 }, // optional crease/silhouette ink (1 px LineSegments)
  module: 0.5, // modular grid unit: snap prop sizes/positions to multiples of this
  world: { background: "#f3f1f7", toneMapping: "none", exposure: 1, shadowType: "auto" },
  materials: {}, // unlit three-tone ShaderMaterials are built from the palette in style.js (tones are exact sRGB)
  lights: [], // no scene lights: face tones never depend on lighting
  post: {}, // no post: exact colours, no bloom, no DoF, no grain
  camera: { projection: "orthographic", fov: 30, near: 1, far: 400, viewHeight: 12, dist: 80, drift: null },
  text: { font: "rounded", weight: 800, color: "#26244a", height: 0.5 },
  overlay: {
    captionH: 0.085, // caption word height (fraction of frame height)
    kickerH: 0.03,
    badgeScale: 1.25,
    tagH: 0.038,
    leaderPx: 2.5,
    popDur: 0.32,
    outDur: 0.28,
  },
  sfx: { enter: "pop", exit: "whooshOut", move: "whoosh", land: "clack", emphasis: "chime", ui: "blip", loop: "tick", bed: "pad" },
  motion: [
    "Everything moves along the three iso axes: blocks rise out of the ground (outBack scale-y), floors drop in with one small hop.",
    "Camera is locked at the true isometric angle: only pans (target) and orthographic zoom (viewHeight); never rotates.",
    "Staggered grid reveals: items pop in by row/column with ~60-90 ms steps.",
    "Loops tick with mechanical regularity: packets along cables, LEDs on a fixed clock, fans at constant rate.",
    "Exploded layers separate vertically with a slight overshoot, then close with a clunk.",
  ],
};
