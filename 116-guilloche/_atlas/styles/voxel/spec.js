// styles/voxel/spec.js — STYLE_SPEC for the Voxel style. Plain data only:
// JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs) and the browser.
// Units: metres, Y-up right-handed, colors sRGB hex, angles radians, three.js light units.
//
// Look: a voxel-art model photographed in a studio. Every object is built from same-size, slightly
// bevelled cubes snapped to an integer grid (InstancedMesh, per-instance colour). Thin dark gaps keep
// the grid readable, crevices get baked-looking ambient occlusion computed from neighbour occupancy,
// a warm key + cool fill light the set, and a clean pale cyclorama catches soft shadows.

export const STYLE_SPEC = {
  id: "voxel",
  name: "Voxel Studio",
  description:
    "Voxel-art models on a pale studio sweep: thousands of bevelled same-size cubes on a strict grid, flat limited palette, thin dark gaps, neighbour-occupancy AO in the crevices, 5x7 voxel lettering, warm key + cool fill, narrow-FOV three-quarter camera; everything moves in whole-cube steps or assembles cube by cube.",
  palette: {
    bg: "#e8e2d7", // studio sweep (warm paper grey)
    floor: "#e6dfd3",
    ink: "#2b2d42", // text, outlines
    accent: "#ff5d3a", // step numbers, chips
    accentDark: "#c9412a",
    wood: "#6b4a35", // plinths, frames
    woodDark: "#4b3326",
    gap: "#1c1a26", // what you see through the gaps between cubes
    card: "#fff7ea",
    cardEdge: "#e9dcc6",
    // picture palette (the demo's pixel art; reusable as a general voxel palette)
    skyDeep: "#4f98dc",
    sky: "#76b9ec",
    skyLight: "#a6d8f4",
    cloud: "#ffffff",
    sunCore: "#fff3a6",
    sun: "#ffd23f",
    sunRay: "#ffa62b",
    grass: "#6cc24a",
    grassDark: "#4f9e3a",
    cat: "#f28c28",
    catDark: "#c55f17",
    catLight: "#fff1dc",
    catPink: "#ff8fa8",
  },
  world: {
    background: "#e8e2d7",
    environment: null,
    toneMapping: "neutral", // keeps the flat palette as designed (ACES greys the cream and desaturates the sky)
    exposure: 1.0,
    shadowType: "pcf", // softness only works with pcf/vsm
  },
  materials: {
    // instance colours carry the palette, so baseColor stays white (instanceColor multiplies it)
    voxel: { type: "standard", baseColor: "#ffffff", roughness: 0.78, metalness: 0 },
    floor: { type: "standard", baseColor: "#e6dfd3", roughness: 0.96, metalness: 0 },
    gap: { type: "standard", baseColor: "#1c1a26", roughness: 1, metalness: 0 },
  },
  voxel: {
    size: 0.12, // world metres per cube (the strict grid)
    fill: 0.93, // cube edge / grid pitch -> 0.07 gap that keeps the grid readable
    bevel: 0.1, // bevel radius as a fraction of the cube edge
    bevelSegments: 2,
    ao: { strength: 0.55, radius: 0.55, corner: 0.8 }, // crevice darkening: max darkening, reach (fraction of a cube), corner weight
    snapTolerance: 0.15, // a cube counts as "on the grid" (occupies a cell for AO) within this many cubes of an integer
    assemble: { dur: 0.45, spread: 0.8, radius: 9, overshoot: 1.25, spin: 2.2 }, // fly-in defaults (cubes)
    textSize: 0.45, // text cube size relative to the scene grid (5x7 font)
  },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#e4ecff", groundColor: "#cbb89c", intensity: 1.35 },
    {
      id: "key", type: "directional", color: "#ffe2c2", intensity: 2.5, position: [-6, 9, 8], target: [0, 1.6, 0],
      shadow: { softness: 3, mapSize: 4096, extent: 7, near: 2, far: 30, bias: -0.0004, normalBias: 0.012 },
    },
    { id: "fill", type: "directional", color: "#bcd3ff", intensity: 0.55, position: [8, 3, 7], target: [0, 1.6, 0] },
    { id: "rim", type: "directional", color: "#fff1dc", intensity: 0.45, position: [3, 6, -8], target: [0, 1.6, 0] },
  ],
  post: {
    vignette: { darkness: 0.22, offset: 1.2 },
    grain: { amount: 0, fps: 30 }, // none: the cube grid is already high-frequency detail; grain 0.008 pushed 15 s to 17.6 MB
  },
  camera: { fov: 18, near: 4, far: 60, drift: { amp: 0.03, speed: 0.3, orbit: 0 } },
  text: { font: "voxel5x7", weight: 400, color: "#2b2d42", height: 0.378 }, // height = 7 rows x textSize x size
  sfx: { enter: "click", exit: "tick", move: "clack", land: "click", emphasis: "blip", ui: "blip", bed: "pad" },
  motion: [
    "Everything moves in whole-cube steps: positions snap to integer cells; pushes and extrusions advance one cube at a time with a tiny outBack overshoot.",
    "Models assemble cube by cube: each cube flies from a seeded scattered start to its home cell with a per-cube seeded delay, a decaying spin and a small overshoot (closed-form, no state).",
    "Builds can also rise layer by layer (order 'y') or sweep left-to-right (order 'x', used for text so it types on).",
    "State changes (recolours) ripple across a model as a fast diagonal wave of split-flap flips or scale dips.",
    "Camera: narrow FOV three-quarter view, slow orbit of a few degrees per beat, small push-ins; never cut.",
  ],
};
