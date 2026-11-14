// styles/neon-sign/spec.js — STYLE_SPEC for "Neon Sign": glass-tube neon on a dark painted brick wall
// at night. Plain data only (JSON-serializable, no THREE, no window). Units: metres, Y-up, sRGB hex,
// radians, three.js light units. Includes the single-stroke tube font so non-Three translators can
// rebuild identical lettering (see `font` at the bottom).

import { STROKE_FONT } from "../../kit/strokefont.js";

export const STYLE_SPEC = {
  id: "neon-sign",
  name: "Neon Sign",
  description:
    "Glass-tube neon lettering and icons on stand-off mounts over a dark painted brick wall at night; tubes flicker on, spill coloured light onto the bricks, and cable back to a transformer box.",
  palette: {
    bg: "#07070a",
    wall: "#2b2629",
    mortar: "#151314",
    ink: "#f4e9d8",
    // classic gas/phosphor colours (the lit tube hue; the hot core blooms toward white)
    warmWhite: "#ffd9a8",
    pink: "#ff2d8a",
    cyan: "#19e3ff",
    amber: "#ff9a1f",
    violet: "#a64dff",
    lime: "#8dff3a",
    primary: "#ff2d8a",
    secondary: "#19e3ff",
    accent: "#ff9a1f",
  },
  world: {
    background: "#07070a",
    fog: null,
    environment: "room",
    environmentIntensity: 0.06, // a whisper of reflection so unlit glass reads as glass
    toneMapping: "neutral", // keeps gas colours saturated; ACES pushed lime/cyan cores to white
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    // maps (brick colour, bump, roughness) are painted procedurally by style.js from `wall` below
    wall: { type: "standard", baseColor: "#ffffff", roughness: 0.72, metalness: 0 },
    glass: { type: "standard", baseColor: "#8a8d96", roughness: 0.16, metalness: 0 }, // NOT physical+clearcoat: in r181 that suppresses emissive
    cap: { type: "standard", baseColor: "#121214", roughness: 0.55, metalness: 0.1 },
    mount: { type: "standard", baseColor: "#a3a7ae", roughness: 0.38, metalness: 0.35 }, // light galvanised hardware
    cable: { type: "standard", baseColor: "#2c2e35", roughness: 0.3, metalness: 0 }, // rubber-jacketed GTO cable, catches moonlight
    housing: { type: "standard", baseColor: "#7d838c", roughness: 0.42, metalness: 0.2 },
    acrylic: { type: "standard", baseColor: "#1d1f26", roughness: 0.1, metalness: 0, opacity: 0.9 },
  },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#6a7ca8", groundColor: "#1a1418", intensity: 1.1 },
    { id: "moon", type: "directional", color: "#9db4ff", intensity: 1.5, position: [-5, 9, 7], target: [0, 0, 0],
      shadow: { softness: 2, mapSize: 2048, extent: 8, bias: -0.0005, normalBias: 0.02 } },
    { id: "street", type: "spot", color: "#ffb36b", intensity: 45, position: [6.5, 7.5, 5], target: [3.4, -1.9, 0],
      angle: 0.55, penumbra: 0.9, distance: 30, decay: 2 },
  ],
  post: {
    bloom: { strength: 0.85, radius: 0.32, threshold: 1.0 },
    vignette: { darkness: 0.5, offset: 1.15 },
    grain: { amount: 0.03, fps: 30 },
  },
  camera: { fov: 35, near: 0.1, far: 100, drift: { amp: 0.025, speed: 0.35 } },
  text: { font: "sans", weight: 800, color: "#f4e9d8", height: 0.3 },
  sfx: { enter: "buzz", exit: "click", move: "whoosh", land: "clack", emphasis: "buzz", ui: "tick", bed: "hum" },
  motion: [
    "Tubes switch on one letter (or stroke) at a time with a seeded stutter flicker (~0.45 s) that settles to steady; never fade.",
    "A constant hum-level shimmer (±3%) rides on every lit tube; spill light on the wall follows the same level.",
    "Camera: one slow dolly-in across the whole scene with slight lateral parallax; tiny drift; no cuts, no orbiting.",
    "Nothing else moves: no letters slide, scale or rotate. Change of meaning = a tube switching on/off or re-lighting in a new colour.",
  ],

  // ---- look numbers consumed by style.js ----
  neon: {
    tubeRadius: 0.042,     // × cap height
    radialSegments: 14,
    bendRadius: 0.09,      // corner fillet radius × cap height (glass is bent, never sharp)
    standoff: 0.075,       // wall → tube centre, metres
    letterSpacing: 0.25,   // gap between glyph bounds × cap height
    wordSpacing: 0.52,     // space advance × cap height
    lineHeight: 1.55,
    emissive: 2.2,         // emissiveIntensity of a fully lit tube (HDR, × lumaGain^lumaExp; bloom threshold 1.0)
    coreFalloff: 1.6,      // view-facing core brighter than edges (pow on N·V)
    coreEdge: 0.35,        // edge emissive fraction
    glassTint: 0.22,       // how much the unlit glass takes the tube's hue
    capLength: 1.8,        // × tube radius
    capRadius: 1.15,        // × tube radius
    mountEvery: 0.8,       // metres of tube between stand-offs
    clipScale: 0.45,       // clip ring wire radius × mountRadius (thin metal band, not a dark smudge)
    lumaExp: 0.5,          // tube emissive × lumaGain^exp: tames bright gases (lime) so cores stay coloured
    mountRadius: 0.0065,
    cableRadius: 0.011,
  },
  flicker: { dur: 0.48, pulses: [4, 7], pulseLen: [0.035, 0.09], pulseLevel: [0.25, 1.15], dark: 0.04, hum: 0.03, humHz: 3.1, offDur: 0.22 },
  spill: {
    lightIntensity: 0.6,    // point light candela at level 1 (per spill light)
    lumaRef: 0.32, lumaMin: 0.4, lumaMax: 1.6, // per-colour luminance balance for spill + glow (lime ≈ 0.45×, violet ≈ 1.5×)
    lightZ: 0.55,          // metres off the wall
    lightDistance: 2.7,
    glowStrength: 0.13,    // additive wall-glow decal at level 1
    glowWidth: 1.5,        // decal halo width × cap height
    glowRes: 72,           // decal px per cap height
  },
  wall: {
    width: 22, height: 13, pxPerMetre: 180,
    brickW: 0.30, brickH: 0.095, mortar: 0.013,
    colors: ["#3e4049", "#3a3c45", "#44454e", "#383a43", "#413f47"], // dark blue-grey paint
    mortarColor: "#25262c",
    chip: 0.12,             // fraction of bricks with paint wear showing older red brick
    chipColor: "#5e3a31",
    grime: 0.4, streaks: 140, seed: 7,
    bumpStrength: 2.2,
  },
  plate: { emissive: 1.25, unlit: 0.012, padding: 0.4, radius: 0.05, depth: 0.05, rim: 0.007, edge: 2.6, body: 0.14 },
  transformer: { w: 0.5, h: 0.34, d: 0.16, lamp: "#ff3020", lampGlow: 2.5 },

  // ---- single-stroke tube font: kit/strokefont.js (same data; exported here for translators) ----
  font: STROKE_FONT,
};
