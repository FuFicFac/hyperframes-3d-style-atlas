// styles/toy-brick/spec.js — STYLE_SPEC for "Toy Brick": a build made of GENERIC interlocking plastic
// construction bricks (plain studs, no brand, no logos), shot like toy-photography macro on a studio table.
// Plain data only (JSON-serializable, no THREE, no window). Units: metres, Y-up, sRGB hex, radians, three.js units.
//
// Look: glossy moulded ABS bricks/plates/slopes/arches/rounds/tiles of varied sizes on a regular stud grid,
// hairline seams and tiny bevels so every piece reads, crisp soft-box reflections from a PROCEDURAL studio
// environment, micro-scratch roughness variation, warm sheen on light colours, tinted transparent pieces,
// a studded baseplate on a pale studio table, shallow depth of field + light tilt-shift for macro scale.

export const STYLE_SPEC = {
  id: "toy-brick",
  name: "Toy Brick",
  description:
    "Generic interlocking plastic construction bricks shot as toy-photography macro: glossy moulded ABS bricks, plates, slopes, arches, rounds and tiles on a stud grid with hairline seams and tiny bevels, crisp soft-box reflections, tinted transparent pieces, a studded baseplate on a pale studio table, shallow depth of field; everything is BUILT — bricks drop in bottom-up and snap down with a squash and a click.",
  palette: {
    bg: "#e9e4dc",
    table: "#ece7df",
    baseplate: "#b4bac1",     // light bluish grey baseplate (neutral, lets the primaries pop)
    ink: "#1d1e22",
    // brick colours (saturated primaries + neutrals + pastel accents)
    red: "#c8170e",
    yellow: "#f6c218",
    blue: "#0b5bb5",
    green: "#1d8c3c",
    orange: "#f57d12",
    white: "#f3f1ec",
    black: "#1c1d21",
    lightGrey: "#a3a8ad",
    darkGrey: "#5d6168",
    lavender: "#b8a3ec",
    mint: "#8fdcc0",
    pink: "#f4a3c4",
    sky: "#86c6ef",
    // transparent tints
    transClear: "#e8f2f6",
    transYellow: "#ffd23a",
    transBlue: "#4fb0ff",
    transOrange: "#ff8a2a",
    // UI (overlay stickers: exact colours)
    sticker: "#fbfaf7",
    stickerShadow: "#1d1e22",
    primary: "#c8170e",
    secondary: "#0b5bb5",
    accent: "#f6c218",
  },
  world: {
    background: "#e9e4dc",
    fog: { color: "#e9e4dc", near: 6, far: 16 },  // the far table melts into the sweep
    environment: null,          // style.js builds a procedural soft-box studio (kit studio.js) -> PMREM
    toneMapping: "neutral",     // keeps the primaries as designed (ACES greys the white and desaturates the yellow)
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    // glossy ABS: physical, low roughness + light clearcoat; colour per instance via style.color(hex)
    plastic: { type: "physical", baseColor: "#ffffff", roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.035 },
    baseplate: { type: "physical", baseColor: "#b4bac1", roughness: 0.26, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.08 },
    table: { type: "physical", baseColor: "#ece7df", roughness: 0.62, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.4 },
    eye: { type: "physical", baseColor: "#141416", roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 },
  },
  // the stud grid (all proportions in pitches P)
  brick: {
    pitch: 0.1,          // P: world metres per stud (≈ 12.5× real scale; reads at 1080p in a macro shot)
    plate: 0.4,          // plate height / P (brick = 3 plates = 1.2 P)
    studR: 0.3,          // stud radius / P (diameter 0.6 P)
    studH: 0.2,          // stud height / P
    studBevel: 0.035,    // stud top edge round-over / P
    studSegments: 28,
    gap: 0.014,          // hairline seam: each body is inset this much per side / P
    topGap: 0.012,       // tiny vertical gap so stacked seams read / P
    bevel: 0.06,         // body edge radius / P
    bevelSegments: 3,
    roundR: 0.47,        // round 1x1 body radius / P
    slopeLip: 0.34,      // slope front lip height / brick height
    arch: { pillar: 0.5, rise: 0.78, segments: 18 }, // arch: pillar width / P, opening height / P
    pegStud: true,
  },
  plastic: {
    // object-space micro surface (no UVs): roughness variation + fine scratches + tiny moulding ripple
    roughVar: [0.75, 1.4],   // roughness multiplier range from low-frequency noise
    roughFreq: 6,            // cycles / metre of the roughness blotches
    scratchFreq: 260,        // scratch density (cycles / metre across the scratch)
    scratchAmount: 0.55,     // how much a scratch raises roughness
    scratchCover: 0.06,      // fraction of surface crossed by scratches
    bumpFreq: 140, bumpStrength: 0.00005,
    sheen: 0.55, sheenRoughness: 0.45, sheenColor: "#ffd9b0",  // warm subsurface-ish edge glow on light colours
    lightLum: 0.6,           // colours brighter than this (luma) get the warm sheen
    warmEmissive: 0.025,     // + a whisper of warm emission on light colours (light bleeding through ABS)
    envIntensity: 1.0,
  },
  trans: {
    transmission: 0.95, roughness: 0.05, thickness: 0.06, ior: 1.52, attenuationDistance: 0.35, clearcoat: 1,
    glow: 1.7,           // emissive strength of a "glowing" trans brick (HDR, blooms above the threshold)
  },
  // procedural soft-box studio (kit studioEnvironment) — crisp rectangles in every glossy face
  studio: {
    size: 256,
    sigma: 0.004,
    room: { w: 24, h: 12, d: 24, color: "#1e1d1b" },
    panels: [
      { id: "top", kind: "softbox", size: [5, 3], pos: [-0.5, 6, 0.5], intensity: 1.7, color: "#fff8ee", soft: 0.14 },
      { id: "frontKey", kind: "softbox", size: [5, 3.2], pos: [-2.5, 3, 7], intensity: 1.8, color: "#fff6ea", soft: 0.12 },
      { id: "frontFill", kind: "softbox", size: [3, 2], pos: [4, 1.8, 7], intensity: 1.3, color: "#f2f6ff", soft: 0.15 },
      { id: "key", kind: "softbox", size: [3.2, 4], pos: [-6.5, 3.2, 4.5], intensity: 3.0, color: "#fff4e6", soft: 0.16 },
      { id: "fill", kind: "softbox", size: [3, 3], pos: [7, 2.6, 5], intensity: 1.1, color: "#eef4ff", soft: 0.22 },
      { id: "rim", kind: "strip", size: [0.6, 5], pos: [5, 3, -7], intensity: 4.5, color: "#ffffff", soft: 0.25 },
      { id: "rim2", kind: "strip", size: [0.5, 4.5], pos: [-6, 3, -6.5], intensity: 3.0, color: "#ffffff", soft: 0.25 },
      { id: "floor", kind: "card", size: [20, 20], pos: [0, -5.5, 0], intensity: 0.35, gradient: [[0, "#e6dfd3"], [1, "#6f6a62"]], radial: true },
      { id: "front", kind: "card", size: [14, 5], pos: [0, 1.5, 11.5], intensity: 0.35, gradient: [[0, "#8a857c"], [1, "#f2ede4"]] },
    ],
    sweep: { size: [10, 0.5], radius: 8, from: 0.3, to: 2.6, intensity: 0, color: "#ffffff", soft: 0.3 },
    sweepLight: { intensity: 0, color: "#ffffff" },
    quantum: 0.002,
  },
  lights: [
    { id: "hemi", type: "hemisphere", color: "#fbf6ef", groundColor: "#c9c0b3", intensity: 0.45 },
    {
      id: "key", type: "directional", color: "#fff1e0", intensity: 4.6, position: [-6, 5.5, 2.6], target: [0, 0.5, 0],
      shadow: { softness: 5, mapSize: 4096, extent: 2.0, near: 2, far: 18, bias: -0.0003, normalBias: 0.008 },
    },
    { id: "fill", type: "directional", color: "#e4ecff", intensity: 0.55, position: [5, 2.5, 5], target: [0, 0.4, 0] },
    { id: "rim", type: "directional", color: "#ffffff", intensity: 1.1, position: [3, 4, -6], target: [0, 0.5, 0] },
  ],
  post: {
    bloom: { strength: 0.55, radius: 0.5, threshold: 2.6 },   // light scene: only the glowing trans brick blooms
    tiltShift: { focus: 0.5, range: 0.34, blur: 2.6 },        // slight macro tilt-shift (re-aimed per frame)
    vignette: { darkness: 0.28, offset: 1.15 },
    grain: { amount: 0 },                                      // no grain: stud grids + motion already cost bitrate
  },
  dof: { aperture: 0.006, maxblur: 0.011 },                    // BokehPass (kit depthOfField): shallow macro focus
  camera: { fov: 26, near: 0.15, far: 40, drift: { amp: 0.006, speed: 0.35, orbit: 0 } },
  text: { font: "rounded", weight: 800, color: "#1d1e22", height: 0.08 },
  ui: {
    font: "rounded", weight: 800, ink: "#1d1e22", card: "#fbfaf7", shadow: "#1d1e22", shadowOpacity: 0.22,
    radius: 0.32,        // card corner radius (fraction of card height)
    pad: 0.5,            // horizontal padding (card heights)
    badge: 0.62,         // stud badge diameter (card heights)
    popDur: 0.42, outDur: 0.3, tilt: 0.06,                     // sticker slaps on with a tiny rotation settle
  },
  sfx: { enter: "clack", exit: "tick", move: "tick", land: "clack", emphasis: "chime", ui: "pop", bed: "pad" },
  motion: [
    "Things are BUILT: bricks drop in one at a time from above, slow like a hand placing them, hover, then PRESS down onto the studs with a ~6 % squash wobble and a plastic click (closed-form from a build schedule).",
    "Build order is bottom-up, back-to-front, left-to-right; layers can go fast (0.08–0.15 s apart) once the idea is clear.",
    "Pieces can fly in from a loose pile on an arc, turning upright, then snap; a build can un-build top-down (pop off the studs, rise, shrink).",
    "Brickfilm option: part poses quantised to 15 fps (on twos) while the camera stays smooth.",
    "Sub-assemblies slide along the grid in whole-stud steps (studSteps).",
    "Camera: low macro three-quarter, slow arc, focus racks to the active part (DoF + tilt-shift aimed at it); final pull-back reveal.",
  ],
};
