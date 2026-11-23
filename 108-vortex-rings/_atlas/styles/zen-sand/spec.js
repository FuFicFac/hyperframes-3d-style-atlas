// styles/zen-sand/spec.js — STYLE_SPEC for "Zen Sand". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js) and the browser.
// Units: metres (a tabletop tray modelled ~4x: 4.4 x 2.5 m of sand), Y-up, sRGB hex, radians, three.js light units.
//
// The look: a raked dry garden seen close. A shallow wooden tray of pale fine sand under one low raking morning sun;
// smooth dark stones, a sprig of moss, wooden tools. Every mark is IN the sand: a height field (sandplan.js) rebuilt
// from t every frame — grooves with soft raised ridges either side, multi-tine rake corrugations, rings around stones,
// traced words, a flat board that erases. Normals and a short march toward the sun (self-shadow) are computed from
// the height field on the CPU and uploaded as a tangent-space normal map + albedo map; the scene's real sun lights it,
// so the stones' cast shadows and the grooves' shading agree.

const SUN = { azimuth: 2.35, elevation: 0.27, distance: 9, color: "#ffe6c4", intensity: 4.2 };
// plan (x, y) -> world (x, 0, -y): the sun's world position from its plan azimuth / elevation (rounded: plain data)
const sunPos = (s) => [Math.cos(s.azimuth) * Math.cos(s.elevation), Math.sin(s.elevation), -Math.sin(s.azimuth) * Math.cos(s.elevation)].map((v) => +(v * s.distance).toFixed(4));

export const STYLE_SPEC = {
  id: "zen-sand",
  name: "Zen Sand",
  description:
    "A raked dry garden seen close: a shallow wooden tray of pale fine sand under a low raking morning sun, smooth dark stones and a sprig of moss. Everything is drawn IN the sand — a rake, stylus or rolling ball travels a planned path and the groove (soft ridges either side catching the light) appears exactly as far as the tool has gone; rake lines flow around stones as concentric rings, words and arrows are traced as grooves, and a flat board drags across to erase a region back to calm.",
  palette: {
    bg: "#1d1a17",        // dark slate table around the tray
    table: "#2a2622",
    sand: "#ebe1ce",      // pale fine sand (albedo, before light)
    sandDeep: "#d8cab2",  // groove floors, a touch darker
    wood: "#a27a4f",      // tray rails
    woodDark: "#5a3d25",
    tool: "#c9a777",      // pale cypress tools
    stone: "#2b2a28",     // smooth dark stones
    moss: "#5b7a35",
    mossLight: "#8aa64c",
    ink: "#33241a",       // caption ink
    tag: "#d2b080",       // caption tag wood
  },
  world: {
    background: "#1d1a17",
    environment: "room",
    environmentIntensity: 0.18,   // only a hint of reflection on the stones
    toneMapping: "neutral",       // keeps the pale sand warm and as designed (ACES greys it)
    exposure: 1.0,
    shadowType: "pcf",
  },
  // ONE sun for the scene light and the CPU self-shadow march. Plan azimuth: radians CCW from +x in the sand plane
  // (+y = away from camera); 2.35 = from the back-left. elevation 0.27 rad ~ 15 deg: low morning rake.
  sun: SUN,
  // The tray and sand
  tray: { w: 4.4, d: 2.5, rail: 0.13, railHeight: 0.075, depth: 0.16 },
  sand: {
    ppm: 200,                     // height-field resolution (cells per metre): 880 x 500 for the demo tray
    roughness: 0.96,
    normalScale: 1.0,
    shade: {
      steps: 10, stepCells: 1.6,  // self-shadow march toward the sun (cells)
      soft: 0.004, strength: 0.62,// shadow softness (m of occlusion to full) and darkness
      grain: 0.035, grainFine: 0.025, mottle: 0.045,  // static albedo grain — keep LOW (bitrate)
      ao: 0.42, aoReach: 0.07,    // darkening of the sand against stones
      grooveTone: 0.06,
      slopeExag: 1.0,
    },
  },
  // Planner defaults (passed to planSand): speeds, hops, groove profiles, tool rest poses. See sandplan.js SAND_DEFAULTS.
  plan: {
    tray: { w: 4.4, d: 2.5 },
    speed: { stylus: 1.8, ball: 1.9, rake: 2.0, board: 1.9 },
    rest: {
      rake: { x: -0.7, y: 1.36, z: 0.085, heading: 0 },
      stylus: { x: 0.9, y: 1.355, z: 0.088, heading: 0 },
      ball: { x: 2.265, y: -0.95, z: 0.08, heading: 0 },
      board: { x: -2.36, y: 0, z: 0.11, heading: 0 },
    },
    profile: { ball: { depth: 0.014, sigma: 0.026, ridge: 0.005, ridgeAt: 0.046, ridgeSigma: 0.014, reach: 0.08 } },
  },
  stones: { detail: 5, lump: 0.09, seedBase: 3 },
  tools: {
    rake: { handle: 1.25, pitch: 0.62, restPitch: 0.04, headDepth: 0.05, tineLen: 0.055 },
    stylus: { len: 0.6, r: 0.013, lean: 0.38 },
    ball: { r: 0.075 },
    board: { width: 0.16, thick: 0.03, len: 2.42, handle: 0.42, lean: 0.8 },
  },
  materials: {
    table: { type: "standard", baseColor: "#2a2622", roughness: 0.92, metalness: 0 },
    rail: { type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0, map: { source: "wood", size: 512, boards: 3, seed: 17, grainFreq: 26, contrast: 0.42, dark: "#5a3d25", mid: "#8a6440", light: "#ae8456", seam: "#4a301d" } },
    tool: { type: "standard", baseColor: "#ffffff", roughness: 0.55, metalness: 0, map: { source: "wood", size: 256, boards: 1, seed: 29, grainFreq: 14, contrast: 0.3, dark: "#9c7748", mid: "#c09a6a", light: "#d8b886", seam: "#9c7748" } },
    stone: { type: "physical", baseColor: "#363431", roughness: 0.46, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5 },
    ball: { type: "physical", baseColor: "#3a3734", roughness: 0.22, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.15 },
    moss: { type: "standard", baseColor: "#ffffff", roughness: 0.95, metalness: 0, vertexColors: true },
  },
  lights: [
    { id: "sun", type: "directional", color: SUN.color, intensity: SUN.intensity, position: sunPos(SUN), target: [0, 0, 0],
      shadow: { softness: 2.2, mapSize: 4096, extent: 2.9, near: 2, far: 18, bias: -0.0003, normalBias: 0.015 } },
    { id: "sky", type: "hemisphere", color: "#cdd6de", groundColor: "#6e5d4a", intensity: 0.95 },
    { id: "front", type: "directional", color: "#f3ead9", intensity: 0.32, position: [1.5, 5, 7], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.32, offset: 1.08 },
    grain: { amount: 0.01, fps: 30 },
  },
  camera: { fov: 30, near: 0.3, far: 40, drift: { amp: 0.018, speed: 0.3 } },
  text: { font: '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif', weight: 600, color: "#33241a", height: 0.3 },
  caption: { w: 820, h: 132, x: 96, y: 72, size: 52, tracking: 0.16, fadeIn: 0.4, fadeOut: 0.35, lead: 0.06 },
  sound: {
    hiss: { rake: { pitch: 0.42, density: 0.85, gain: 0.5 }, stylus: { pitch: 0.62, density: 0.7, gain: 0.34 }, ball: { pitch: 0.3, density: 0.9, gain: 0.4 }, board: { pitch: 0.24, density: 0.95, gain: 0.55 } },
    knock: { type: "clack", pitch: 0.42, gain: 0.42 },
    tick: { type: "clack", pitch: 0.62, gain: 0.12 },
    land: { type: "thud", pitch: 1.9, gain: 0.12 },
    bowl: { pitch: 0.25, gain: 0.3, dur: 4 },
    bed: { root: 55, chord: [0, 7, 12, 19], brightness: 520, gain: 0.5, attack: 2, release: 2 },
  },
  sfx: { enter: "clack", exit: "clack", move: "paper", land: "thud", emphasis: "chime", ui: "clack", bed: "pad" },
  motion: [
    "The sand is a height field rebuilt from t: a groove exists exactly as far as its tool has travelled (trapezoid speed, no accumulation).",
    "One tool at a time: it lifts off its rest on the rail, arcs to the first contact, hops between contacts and arcs back.",
    "Rake corrugations follow any path; a rake circling a stone leaves concentric rings that flow out of the straight lines.",
    "A flat board drags along +x to erase a region back to flat, pushing a soft ridge of sand ahead of it.",
    "Camera: high three-quarter view, gentle push-ins on what is being drawn, long holds, end on the whole tray.",
  ],
};
