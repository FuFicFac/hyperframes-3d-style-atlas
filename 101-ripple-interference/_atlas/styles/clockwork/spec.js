// styles/clockwork/spec.js — STYLE_SPEC for "Clockwork". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js) and the browser.
// Units: metres (a macro "movement" about 10 m across, so gear module 0.05 m = teeth ~0.16 m apart), Y-up, sRGB hex,
// radians, three.js light units. The main plate is the XY plane at z = 0 facing +Z; wheels stack toward the camera.
//
// The look: the inside of a fine mechanical movement shot macro — brushed and polished brass wheels with involute
// teeth and spoked hubs on a dark anthracite plate with perlage, brass bridges with Geneva stripes and engraved
// lettering, heat-blued screws and arbors, ruby jewels in polished chatons, a mainspring barrel, a balance with a
// breathing hairspring, an anchor escapement. Warm macro light, soft reflections from a procedural studio, shallow
// depth of field. Captions sit on a small enamel plaque with a brass bezel.

export const STYLE_SPEC = {
  id: "clockwork",
  name: "Clockwork",
  description:
    "The inside of a fine mechanical movement shot macro: brushed brass wheels with involute teeth and spoked hubs on a dark perlaged plate, Geneva-striped brass bridges with engraved lettering, blued screws, ruby jewels, a mainspring barrel, a balance wheel with a breathing hairspring and an anchor escapement that ticks the whole gear train forward in discrete steps; a cam drops a lever and a hammer strikes a bell. Captions on a small enamel plaque.",
  palette: {
    bg: "#0b0a09",
    plate: "#4a4642",          // anthracite (rhodium-plated, darkened) main plate
    plateDeep: "#1e1d1b",
    brass: "#d6ab55",          // wheels
    brassDeep: "#9c7430",
    gilt: "#e3bd6d",           // bridges (gilt brass)
    gold: "#e8c27a",           // balance rim, chatons
    steel: "#c4c7cc",          // polished pinions / arbors
    blued: "#2b4fb0",          // heat-blued screws, hairspring
    bluedDeep: "#1a2c6e",
    ruby: "#b3122c",
    enamel: "#f3eee2",         // caption plaque field
    ink: "#1b1a17",            // plaque lettering / engraving fill
    bezel: "#c99b45",
    primary: "#d6ab55",
    secondary: "#2b4fb0",
    accent: "#b3122c",
  },
  world: {
    background: "#0b0a09",
    environment: null,          // style.js builds a procedural warm studio PMREM (`studio` below) via kit studio.js
    toneMapping: "neutral",     // keeps brass gold and blued steel blue (ACES greys and desaturates both)
    exposure: 1.12,
    shadowType: "pcf",          // key shadow.softness applies
  },
  materials: {
    // brushed brass: style.js adds a circular-grain roughness map + radial anisotropy (watch-wheel "sunburst" glint)
    brass: { type: "physical", baseColor: "#d6ab55", roughness: 0.3, metalness: 1 },
    brassPolished: { type: "physical", baseColor: "#e0b765", roughness: 0.14, metalness: 1 },
    gilt: { type: "physical", baseColor: "#e3bd6d", roughness: 0.32, metalness: 1 },          // bridges (map: Geneva stripes)
    plate: { type: "physical", baseColor: "#4a4642", roughness: 0.4, metalness: 1 },          // map: perlage
    gold: { type: "physical", baseColor: "#e8c27a", roughness: 0.18, metalness: 1 },
    steel: { type: "physical", baseColor: "#d2d5da", roughness: 0.27, metalness: 1 },
    blued: { type: "physical", baseColor: "#3d6ad8", roughness: 0.3, metalness: 0.75, clearcoat: 0.6, clearcoatRoughness: 0.12, emission: { color: "#2a55c8", strength: 0.18 } },
    ruby: { type: "physical", baseColor: "#b3122c", roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, emission: { color: "#d01838", strength: 0.35 } },
    spring: { type: "physical", baseColor: "#5f6a7c", roughness: 0.3, metalness: 1 },           // mainspring (dark steel)
  },
  // per-material extras style.js applies (MeshPhysicalMaterial.anisotropy, maps)
  finish: {
    grain: { size: 512, rings: 260, contrast: 0.22, seed: 9, roughness: [0.22, 0.4] }, // circular grain on wheels
    anisotropy: 0.6,          // radial brushing: highlights stretch into the classic wheel "sunburst"
    side: { roughness: 0.48, env: 0.45 },   // flanks/side walls of every extruded part (tames tooth-flank glints)
    perlage: { pitch: 0.22, radius: 0.15, ppm: 190, contrast: 0.24, seed: 4 },        // plate: overlapping circular graining
    stripes: { pitch: 0.16, ppm: 520, contrast: 0.2, angleDeg: -28 },                 // bridges: Côtes de Genève
    engraving: { font: '"Copperplate", "Didot", "Baskerville", Georgia, serif', fill: "#2a1f12", glint: "rgba(255,236,190,0.75)" },
  },
  // Procedural studio for reflections (kit studio.studioEnvironment): warm macro softboxes. Metres around the origin.
  studio: {
    size: 256,
    sigma: 0.02,
    room: { w: 30, h: 20, d: 30, color: "#060504" },
    panels: [
      { id: "front", kind: "card", size: [16, 9], pos: [0, -2.5, 13], intensity: 0.7, gradient: [[0, "#000000"], [0.55, "#6b5236"], [1, "#ffdcae"]] },
      { id: "key", kind: "softbox", size: [6, 4], pos: [-8, 7, 8], intensity: 1.6, color: "#ffd9a8", soft: 0.3 },
      { id: "top", kind: "softbox", size: [10, 2.2], pos: [1, 9, 3], intensity: 1.1, color: "#fff0dc", soft: 0.35 },
      { id: "rim", kind: "strip", size: [0.7, 8], pos: [9, 1, 6], intensity: 2.2, color: "#cfe0ff", soft: 0.3 },
      { id: "low", kind: "strip", size: [14, 0.6], pos: [0, -8, 7], intensity: 0.9, color: "#ffcf9a", soft: 0.35 },
    ],
    sweep: { size: [12, 0.5], radius: 10, from: 0.4, to: 2.4, intensity: 0, color: "#ffffff", soft: 0.35 },
    quantum: 0.002,
  },
  envIntensity: 1.0,
  steelEnv: 1.6,            // polished steel needs more of the studio or it reads black against the dark plate
  lights: [
    { id: "ambient", type: "hemisphere", color: "#fff0dd", groundColor: "#2a2018", intensity: 0.38 },
    // warm macro key from upper left-front: every wheel throws a soft shadow onto the plate below it
    { id: "key", type: "directional", color: "#ffd8a6", intensity: 2.6, position: [-6, 7, 9], target: [0, 0, 0],
      shadow: { softness: 5, mapSize: 4096, extent: 6, near: 2, far: 30, bias: -0.0003, normalBias: 0.012 } },
    { id: "rim", type: "directional", color: "#d4e2ff", intensity: 0.7, position: [8, 1.5, 5], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.16, radius: 0.3, threshold: 4.0 },  // only the sharpest glints (pre-tone-mapping HDR)
    vignette: { darkness: 0.5, offset: 1.05 },
    grain: { amount: 0.01, fps: 30 },
  },
  dof: { aperture: 0.0005, maxblur: 0.0035 },                   // macro: background wheels go soft
  camera: { fov: 30, near: 0.2, far: 60, drift: { amp: 0.0, speed: 0.2 } },
  text: { font: '"Didot", "Bodoni 72", "Baskerville", Georgia, serif', weight: 700, color: "#1b1a17", height: 0.3 },
  plaque: {
    // caption plaque on the overlay (exact colours, after post): enamel field, brass bezel, black roman capitals
    font: '"Baskerville", "Didot", Georgia, serif', weight: 600, tracking: 0.14,
    heightFrac: 0.082,       // plaque height as a fraction of frame height
    x: 0, y: -0.79,          // NDC centre (inside the safe area)
    inDur: 0.45, outDur: 0.35, rise: 0.03,
  },
  geometry: {
    module: 0.05,             // gear module (m): pitch radius = module × teeth / 2
    wheelThickness: 0.06,
    rimWidth: 1.6,            // × module, rim below the tooth roots
    hubRadius: 2.4,           // × module (min), hub around the arbor
    spokeWidth: 1.5,          // × module
    arborRadius: 0.035,
    jewel: { r: 0.075, chaton: 0.12 },
    screw: { r: 0.09 },
    bevel: 0.006,
  },
  sfx: {
    tick: "tick (pitch 1.7 tick / 1.45 tock) + very soft clack body, one per escapement beat (from the planner)",
    strike: "clack (hammer) + chime pitch .9, 2.6 s + chime pitch .45 (body), at the planner's strike time",
    caption: "click (pitch .8) as each plaque lands",
    bedNote: "pad A2 (0,7,12,16) brightness 650 Hz, gain ~.2",
    bed: "pad",
    enter: "click", exit: "click", move: "whoosh", land: "clack", emphasis: "chime", ui: "tick",
  },
  motion: [
    "One oscillator paces everything: the balance swings as a sine; every pass through centre is a beat.",
    "At each beat the anchor flips and the escape wheel steps half a tooth (with a tiny recoil); every other arbor's angle is the escape wheel's times its tooth ratio — the whole train ticks together, directions alternating.",
    "Cams turn with their arbor; the follower climbs the ramp step by step, drops off the edge, and the hammer strikes the bell — the drop can only happen on an escapement step.",
    "Camera: slow macro dollies with shallow depth of field, locked during the beats that matter; one wide pull-back at the end.",
    "Captions: one enamel plaque at a time, rising in from the bottom with a soft click.",
  ],
};
