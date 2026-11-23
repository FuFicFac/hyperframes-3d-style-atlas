// styles/layer-print/spec.js — STYLE_SPEC for "Layer Print" (a desktop 3D printer building a part layer by layer).
// Plain data only: JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js).
// Units: metres at TOY SCALE (the printer is ~5 m wide so the kit's lights, shadows and text sizes apply unchanged; read
// 1 m as ~5 cm of a real machine). Y-up; the bed surface is at y = printer.bedY; plan coordinates start there.
//
// The look: a bright workshop (pale birch bench, light pegboard wall, a few filament spools), an open aluminium-frame
// printer with a dark gridded heated bed, a gantry that rises with the layers and a teal print head whose brass nozzle
// glows. Warm coral-to-yellow filament is laid as real beads: every layer is a visible toolpath (outer perimeter, inner
// perimeter, infill), the just-laid plastic glows for a moment, and the finished part keeps its fine layer ridges.

export const STYLE_SPEC = {
  id: "layer-print",
  name: "Layer Print",
  description:
    "A generic desktop 3D printer in a bright workshop: an open aluminium frame, a dark gridded heated bed, a gantry that rises with the part and a print head with a glowing brass nozzle laying down coloured filament. The object grows layer by layer and every layer is drawn as its real toolpath — outer perimeter, inner perimeter, then infill (scan lines on the floor, a zigzag inside the wall) — from a slicer plan (slicer.js): the part is sliced once into timed polylines, the whole bead geometry is built once with a per-vertex deposit time, and a frame shows every bead whose time has passed, cut exactly at the nozzle. The planned path of the current layer shows ahead of the nozzle as a thin line, fresh plastic glows for a moment, and the finished part keeps fine layer ridges. Print time is compressed honestly: timing stages speed up layer after layer. Stepper servo/whir cues per move and a tick per layer change come from the same plan.",
  palette: {
    bg: "#e6ebee",
    wall: "#e3e9ec",
    bench: "#d9bf96",
    ink: "#1c2530",
    frame: "#c8cdd2",
    bed: "#2a3038",
    head: "#17a79c",
    filament: "#ff6a3d",
    accent: "#ffd23f",
    path: "#49e0f2",
    hot: "#ff7a1a",
  },
  world: {
    background: "#e6ebee",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#ffffff", roughness: 0.72, metalness: 0, map: { source: "wood", size: 512, boards: 4, seed: 74, dark: "#c2a271", mid: "#d9bf96", light: "#e8d3ae", repeat: [3, 3], description: "pale birch workbench boards" } },
    wall: { type: "standard", baseColor: "#e3e9ec", roughness: 0.95, metalness: 0 },
    aluminium: { type: "standard", baseColor: "#cdd2d7", roughness: 0.38, metalness: 0.8 },
    steel: { type: "standard", baseColor: "#9aa2ab", roughness: 0.3, metalness: 0.9 },
    dark: { type: "standard", baseColor: "#2b3038", roughness: 0.6, metalness: 0.1 },
    bed: { type: "standard", baseColor: "#ffffff", roughness: 0.58, metalness: 0.15, map: { source: "grid", size: 512, cells: 4, line: 3, bg: "#2a3038", fg: "#465060", repeat: [3, 3], description: "dark textured build plate with a printed grid" } },
    headShell: { type: "physical", baseColor: "#17a79c", roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 },
    brass: { type: "standard", baseColor: "#d9a441", roughness: 0.3, metalness: 0.9 },
    sock: { type: "standard", baseColor: "#c2452d", roughness: 0.7, metalness: 0 },
    nozzleTip: { type: "standard", baseColor: "#ffb060", roughness: 0.4, metalness: 0, emission: { color: "#ff7a1a", strength: 5.0 } },
    bedGlow: { type: "standard", baseColor: "#ff8a4a", roughness: 0.5, metalness: 0, emission: { color: "#ff5a2a", strength: 1.6 } },
    tube: { type: "standard", baseColor: "#f4f6f8", roughness: 0.4, metalness: 0 },
    // the printed plastic: vertex colours carry the filament gradient (base must stay white)
    filament: { type: "physical", baseColor: "#ffffff", roughness: 0.44, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.35, vertexColors: true },
    spoolA: { type: "standard", baseColor: "#17a79c", roughness: 0.5, metalness: 0 },
    spoolB: { type: "standard", baseColor: "#ffd23f", roughness: 0.5, metalness: 0 },
    spoolC: { type: "standard", baseColor: "#6b5bd6", roughness: 0.5, metalness: 0 },
    spoolD: { type: "standard", baseColor: "#ff6a3d", roughness: 0.5, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#b9ab95", intensity: 1.15 },
    {
      id: "key", type: "directional", color: "#fff4e4", intensity: 2.5, position: [-5.5, 9.5, 6.5], target: [0, 1.2, 0],
      shadow: { softness: 2.2, mapSize: 4096, extent: 5.2, near: 1, far: 30, bias: -0.0004, normalBias: 0.012 },
    },
    { id: "rim", type: "directional", color: "#dcecff", intensity: 0.7, position: [6, 5, -4], target: [0, 1.2, 0] },
  ],
  post: {
    bloom: { strength: 0.35, radius: 0.3, threshold: 2.6 },
    vignette: { darkness: 0.22, offset: 1.2 },
  },
  camera: { fov: 32, near: 0.3, far: 80, drift: { amp: 0, speed: 0.2 } },   // no drift: the laid part never moves, so holds compress well
  text: { font: "sans", weight: 800, color: "#1c2530", height: 0.4 },

  // ---- the printer (toy-scale metres) ----------------------------------------------------------------------------
  printer: {
    bedY: 0.42,                       // bed surface height above the bench
    bed: { w: 4.2, d: 3.8, t: 0.1 },
    post: { x: 2.55, z: 2.2, s: 0.22, h: 5.3 },   // 4 posts at (+-x, +-z), square section s
    rail: 0.18,                       // gantry rail / beam section
    gantryUp: 1.55,                   // gantry beam centre above the nozzle tip
    beamBack: 0.3,                    // the X beam sits this far behind the nozzle
    head: { w: 0.62, h: 0.62, d: 0.5 },
    nozzle: { r: 0.075, h: 0.15, tip: 0.036 },
    light: { color: "#ffb070", intensity: 2.2, distance: 2.4 },   // small warm point light at the nozzle
    spool: { r: 0.6, w: 0.3, x: 1.25 },
    tube: { r: 0.024, points: 14, sag: 0.9 },
  },
  // ---- the bead (extruded plastic) --------------------------------------------------------------------------------
  bead: {
    layerHeight: 0.05,
    width: 0.085,
    height: 0.058,                    // a little taller than the layer so stacked beads fuse; the groove is the layer ridge
    radial: 8,
    wall: 0.34,
    ringPts: 96,
    zigs: 36,
    floorLayers: 2,
    hot: { color: "#ff6a1a", strength: 0.9, tau: 0.3 },           // just-laid plastic glows, cooling over ~tau seconds
    stops: [[0, "#ff5647"], [0.5, "#ff8a2b"], [1, "#ffd23f"]],  // filament colour up the height (a gradient spool)
  },
  ghost: { color: "#49e0f2", width: 0.03, height: 0.014, minLayer: 0.4 },   // planned path ahead of the nozzle (slow layers only)
  shape: { height: 2.3, lobes: 6, lobe: 0.06, twist: 0.7, profile: [[0, 1.0], [0.42, 1.42], [0.82, 1.0], [1, 1.2]] },
  speeds: { travel: 3, outer: 1, inner: 1.15, infill: 1.6 },

  // ---- overlay caption chip (bottom centre) -------------------------------------------------------------------------
  caption: {
    x: 960, y: 922, h: 92, cap: 44, maxW: 900,
    font: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: 800,
    plate: "#ffffff", edge: "#1c2530", ink: "#1c2530", bar: "#ff6a3d", barOff: "#d5dbe0",
  },

  sound: {
    motor: { hzLo: 82, refSpeed: 4, octSpan: 6.5, octaves: 1.7 },   // move speed (m/s) -> motor pitch
    run: { gain: 0.3 },
    fast: { gain: 0.34 },
    zig: { gain: 0.26, hzA: 150, hzB: 185 },
    tick: { gain: 0.5, fast: 0.3, pitchLo: 0.9, pitchHi: 1.5 },
    home: { gain: 0.3 },
    done: { gain: 0.3 },
    bed: { gain: 0.5, root: 98, chord: [0, 7, 12, 16], brightness: 700 },
    fan: { gain: 0.1, hz: 120 },
  },
  sfx: { enter: "servo", exit: "whooshOut", move: "whir", land: "tick", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "The nozzle follows one planned move list (slicer.js): travel, outer perimeter, inner perimeter, infill, layer after layer; the head, beam and gantry sit exactly on plan.nozzleAt(t).",
    "Every bead vertex carries its deposit time; a frame draws the beads whose time has passed and cuts the last one at the nozzle. Laid plastic never moves.",
    "Timing stages speed up layer after layer (accel per layer), so minutes of printing pass in seconds without a cut.",
    "The planned path of the current layer shows ahead of the nozzle as a thin cyan line while layers are slow enough to follow.",
    "Camera: locked shots joined by short eased moves, no drift.",
  ],
};
