// styles/wireframe-hologram/spec.js — STYLE_SPEC for "Wireframe Hologram": a volumetric holographic display
// floating above a dark glossy projector table in a dim briefing room. Everything in the hologram is light:
// additive cyan wireframes, point clouds and translucent scan-filled faces with fresnel rims, one amber accent
// for the active element. Plain data only (JSON-serializable, no THREE, no window). Units: metres, Y-up, sRGB hex,
// radians, three.js light units, px at 1080p for screen-space widths.

export const STYLE_SPEC = {
  id: "wireframe-hologram",
  name: "Wireframe Hologram",
  description:
    "A sci-fi briefing-room hologram: additive cyan wireframes, point clouds and fresnel-rimmed scan-filled faces materialise bottom-to-top above a projector ring on a dark glossy table, with drifting scanlines, seeded glitch slices, HUD rings and amber highlights.",
  palette: {
    bg: "#020508",
    table: "#04070a",
    housing: "#0b1117",
    holo: "#38e1ff",       // primary hologram cyan
    holoDeep: "#0e8fae",   // teal for faint webs, faces, beam
    holoHot: "#d4fbff",    // near-white core for pulses / firing nodes
    accent: "#ffad3b",     // amber: the active element
    accentHot: "#ffe2b0",
    hud: "#4fcfe6",
    text: "#c6f7ff",
    textDim: "#5fa9b9",
    primary: "#38e1ff",
    secondary: "#0e8fae",
  },
  world: {
    background: "#020508",
    fog: null,
    environment: "room",
    environmentIntensity: 0.05,  // a whisper: the housing reads as metal, the table stays black
    toneMapping: "neutral",      // keeps cyan/amber saturated (ACES pushes bright cyan to white first)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    table: { type: "physical", baseColor: "#04070a", roughness: 0.22, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.12 },
    housing: { type: "standard", baseColor: "#0d141b", roughness: 0.38, metalness: 0.75 },
    bezel: { type: "standard", baseColor: "#1a242e", roughness: 0.28, metalness: 0.85 },
    lens: { type: "standard", baseColor: "#03070b", roughness: 0.08, metalness: 0.2, emission: { color: "#0e8fae", strength: 0.25 } },
  },
  lights: [
    { id: "room", type: "hemisphere", color: "#2a4a5c", groundColor: "#020304", intensity: 0.35 },
    { id: "key", type: "directional", color: "#7fb6d6", intensity: 0.35, position: [-6, 9, 6], target: [0, 0, 0] },
    // the hologram's own spill onto housing + table; scaled by the projector level in style.update
    { id: "emitter", type: "point", color: "#38e1ff", intensity: 9, position: [0, 0.9, 0], distance: 9, decay: 2 },
  ],
  post: {
    bloom: { strength: 0.62, radius: 0.42, threshold: 0.82 }, // only HDR cores (levels > 1) bloom; faint webs stay crisp
    vignette: { darkness: 0.6, offset: 1.05 },
    grain: { amount: 0.012, fps: 30 },                         // low: grain on near-black dominates bitrate
  },
  camera: { fov: 30, near: 0.3, far: 80, drift: { amp: 0.035, speed: 0.22 } },
  text: { font: "mono", weight: 700, color: "#c6f7ff", height: 0.3 },
  sfx: { enter: "sparkle", exit: "whooshOut", move: "whir", land: "blip", emphasis: "chime", ui: "blip", bed: "pad" },
  motion: [
    "Materialise bottom-to-top behind a bright scan front: points first, then edges, then translucent faces (lags in `materialise`); dematerialise is the same run in reverse.",
    "Data travels as short bright dashes along edges; a node brightens when its pulses arrive, the active element switches to amber.",
    "The volume never sits dead: scan bands drift upward, a ±4 % hum flicker, rare seeded glitch slices shear a thin band sideways for 1–3 frames.",
    "Camera orbits slowly at table height (path: 'arc' keys) with gentle push-ins; HUD rings rotate at constant rates.",
  ],

  // ---- look numbers consumed by style.js ----
  holo: {
    pointSize: 0.06,       // metres (perspective-scaled sprite; core + halo)
    pointCore: 0.32,       // core radius as a fraction of the sprite
    pointLevel: 1.6,       // HDR level of a steady point (bloom threshold .82)
    edgeWidth: 1.5,        // px at 1080p
    edgeLevel: 1.15,
    faceAlpha: 0.075,      // additive face fill (facing the camera)
    rimStrength: 0.85,     // fresnel rim brightness
    rimPower: 2.4,
    scanSpacing: 0.42,     // metres between upward-drifting scan bands (world y)
    scanWidth: 0.03,
    scanSpeed: 0.32,       // m/s upward
    scanBoost: 0.9,        // extra brightness inside a band (faces + points)
    frontGlow: 3.0,        // brightness of the materialise front
    frontSoft: 0.07,       // metres: front fall-off
    frontColor: "#d4fbff",
  },
  materialise: { edgesLag: 0.16, facesLag: 0.34, span: 0.66 }, // phases of one 0..1 run (points lead)
  flicker: { hum: 0.035, humHz: 7.3, jitter: 0.03, fps: 30, power: { dur: 0.55, pulses: [4, 6], pulseLen: [0.03, 0.08], pulseLevel: [0.3, 1.2], dark: 0.05 } },
  glitch: { fps: 15, rate: 0.55, maxShift: 16, bandH: [0.006, 0.035], yRange: [0.28, 0.9], chroma: 2.2, seed: 913 }, // rate = slices/s on average
  raster: { period: 4.0, depth: 0.16, drift: 9 },  // fine screen scanlines (px period, depth on bright pixels, px/s upward)
  fringe: { amount: 1.6 },                           // chromatic fringe in px at the frame corner (radial, stateless)
  projector: {
    radius: 2.5, height: 0.16, bevel: 0.05,
    emitterRadius: 1.15, emitterWidth: 0.06, lensRadius: 1.05,
    ringLevel: 2.4, segments: 128,
  },
  beam: { baseRadius: 1.1, topRadius: 4.4, height: 4.6, level: 0.11, edge: 0.65, streaks: 28, seed: 31 },
  dust: { count: 320, radius: 3.6, height: 4.4, size: 0.022, level: 0.9, speed: 0.11, swirl: 0.05, seed: 77 },
  table: { radius: 11, reflect: 0.55, facing: 0.18, blur: 3.2, fade: [3.5, 10.5], glow: 0.55, glowRadius: 4.2 },
  pulse: { width: 2.0, level: 1.7, len: 0.13, carried: 0.55 }, // dash px, HDR level, length (fraction of the edge); carried-path level
  hud: { width: 1.2, level: 0.9, tickLevel: 0.7, color: "#4fcfe6" },
  overlay: {
    captionHeight: 0.058, subHeight: 0.03, labelHeight: 0.032, readoutHeight: 0.026,
    typeRate: 32,          // characters per second for the typewriter reveal
    lineWidthPx: 1.4, bracketPx: 22,
  },
};
