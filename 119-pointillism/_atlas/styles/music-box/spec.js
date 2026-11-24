// styles/music-box/spec.js — STYLE_SPEC for "Music Box". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the tune plan + score) and the browser.
// Units: metres, toy-scale exaggerated (the pinned cylinder is 2.6 m long) so a single pin still reads at 1080p.
//
// The look: the open movement of a music box shot macro in warm bright light on pale wood. A lathe-turned brass
// cylinder studded with steel pins turns slowly; each pin presses down and releases one tooth of a steel comb and the
// tooth rings; a hand crank drives the cylinder through a pinion, a worm spins a two-vane governor. tune.js plans every
// pin, every tooth movement and every note from one note list.

export const STYLE_SPEC = {
  id: "music-box",
  name: "Music Box",
  description:
    "The open movement of a music box, shot macro in warm bright light on pale wood: a lathe-turned brass cylinder studded with steel pins turns slowly toward a polished steel comb; each pin presses one tooth down and lets it go, the tooth springs back, rings visibly and warms in colour for a moment; a hand crank with a wooden knob drives the cylinder through a brass pinion and a worm spins a two-vane governor. One note list (tune.js) places every pin (angle around the cylinder = when, position along the axis = which tooth), moves every tooth in closed form and writes the score, one pitched bar note per pin at the exact release time. Engraved track rings and bar lines on the cylinder make it read as a score. Captions on an ivory plate with a brass edge.",
  palette: {
    bg: "#ead9ba",
    wood: "#e6cfa6",
    woodDark: "#c9a877",
    brass: "#d9ae58",
    brassDeep: "#a67a30",
    brassLight: "#f0cf85",
    steel: "#d6d9de",
    steelDark: "#8e949e",
    glow: "#ffa000",
    knob: "#7a4a2a",
    ivory: "#f7f0df",
    ink: "#2a1d12",
    accent: "#c2452d",
  },
  world: {
    background: "#ead9ba",
    sky: null,
    fog: { color: "#ead9ba", near: 16, far: 38 },
    environment: "room",
    environmentIntensity: 0.85,
    toneMapping: "neutral",   // keeps brass gold and pale wood pale (ACES greys both)
    exposure: 1.08,
    shadowType: "auto",
  },
  materials: {
    wood: { type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0 },                  // map added in style.js (kit woodTexture)
    brass: { type: "physical", baseColor: "#d9ae58", roughness: 0.3, metalness: 1 },                 // bedplate, brackets, comb block
    brassPolished: { type: "physical", baseColor: "#e6bd66", roughness: 0.16, metalness: 1 },        // gears, vanes, crank
    cylinder: { type: "physical", baseColor: "#ffffff", roughness: 0.27, metalness: 1 },             // map: turned brass + track rings (style.js)
    cylinderCap: { type: "physical", baseColor: "#c79a48", roughness: 0.35, metalness: 1 },
    steel: { type: "physical", baseColor: "#aeb4bd", roughness: 0.34, metalness: 1 },                // comb heel, arbor
    tooth: { type: "physical", baseColor: "#b8bec7", roughness: 0.3, metalness: 1 },                 // cloned per tooth (warm tint while ringing)
    pin: { type: "physical", baseColor: "#f1f2f4", roughness: 0.18, metalness: 1 },
    screw: { type: "physical", baseColor: "#39507c", roughness: 0.25, metalness: 1 },                // blued steel
    knob: { type: "standard", baseColor: "#7a4a2a", roughness: 0.45, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fff6e6", groundColor: "#c9ab7c", intensity: 1.0 },
    {
      // warm high key from front-left: bright brass, short soft shadows falling back-right
      id: "key", type: "directional", color: "#fff0d8", intensity: 2.7, position: [-3.6, 7.0, 4.6], target: [0.2, 0.5, 0.5],
      shadow: { softness: 2.4, mapSize: 2048, extent: 3.6, near: 0.5, far: 24, bias: -0.0004, normalBias: 0.012 },
    },
    { id: "rim", type: "directional", color: "#dbe8ff", intensity: 0.4, position: [3.5, 4.0, -5.0], target: [0, 0.6, 0] },
  ],
  post: {
    vignette: { darkness: 0.26, offset: 1.15 },
  },
  camera: { fov: 30, near: 0.3, far: 60, drift: { amp: 0, speed: 0.2 } },   // locked during holds (bitrate + macro steadiness)
  text: { font: "sans", weight: 700, color: "#2a1d12", height: 0.3 },

  // ---- the movement (every number tune.js and style.js need) ---------------------------------------------------
  movement: {
    axisY: 0.78,                                    // cylinder axis height above the wood
    cylinder: { radius: 0.5, length: 2.6, period: 14.6, segments: 96 }, // one turn = one tune (14.6 s)
    pins: { height: 0.05, radius: 0.021, embed: 0.02, aPre: 0.05, aRel: 0.07 },   // contact starts aPre before the tip line, releases aRel after (rad)
    comb: {
      teeth: 12, x0: -1.1, pitch: 0.2, width: 0.16, thickness: 0.045,
      lengthLow: 1.0, lengthHigh: 0.5,              // low notes = long teeth (left), high = short (right)
      heelZ: [1.5, 1.82], heelThickness: 0.07, minGap: 0.6,
    },
    vib: { hz: [6.5, 10.5], tau: [0.5, 0.3], glow: 0.42, glowTau: 0.7 },   // visible ring: frequency (Hz, below 15 = no aliasing at 30 fps), decay, tint
    bedplate: { x: [-1.85, 1.85], z: [-0.7, 1.93], h: 0.1 },
    bracket: { x: 1.5, t: 0.1 },
    gear: { teeth: 40, module: 0.028, thickness: 0.06, x: 1.37 },          // pitch radius = module * teeth / 2 = 0.56
    drive: { ratio: 5, pinion: 8, bearing: 0.96, crankX: 1.72, arm: 0.34, knobLen: 0.34, knobR: 0.075, clicks: 8, x: 1.6 },
    governor: { ratio: 40, wormR: 0.07, vane: [0.27, 0.15], vaneOffset: 0.2, top: 0.72 },   // worm: one turn per wheel tooth
    track: { ring: "rgba(92,58,12,0.42)", bar: "rgba(92,58,12,0.26)", barEvery: 4 },        // engraved staff on the cylinder
  },
  wood: { size: 28, tile: 7, boards: 4, seed: 73, dark: "#dcc59d", mid: "#ecdcbb", light: "#f7edd6", seam: "#c9ae82", contrast: 0.36, grainFreq: 18 },

  // ---- overlay caption (top centre: over the plain wood behind the cylinder) -------------------------------------
  caption: {
    x: 960, y: 50, h: 108, cap: 60, maxW: 1160,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#f7f0df", edge: "#b8893a", ink: "#2a1d12", pin: "#b8893a",
  },

  sound: {
    note: { gain: 0.25, dur: 2.2, decay: [0.62, 0.36], mallet: 0.22, tilt: 0.35, tick: 0.1 },
    shimmer: { gain: 0.24, dur: 1.6, decay: 1.4, bright: 0.85 },
    ratchet: { gain: 0.12, pitch: 0.8 },
    whir: { gain: 0.06, hz: 164, grit: 0.12 },
    pad: { gain: 0.13, root: 130.81, chord: [0, 7, 16], brightness: 900 },
  },
  sfx: { enter: "tick", exit: "whooshOut", move: "whir", land: "tick", emphasis: "marimba", ui: "tick", bed: "pad" },
  motion: [
    "The cylinder turns at a constant rate (angle = omega * t); nothing else drives the picture.",
    "A pin presses its tooth down for ~0.3 s, lets go, and the tooth rings: tip = -A exp(-s/tau) cos(2 pi f s), closed form.",
    "A ringing tooth warms in colour for a moment, so the eye finds the note the ear hears.",
    "Crank = 5 x the cylinder rate through a pinion; governor worm = 40 x (one turn per wheel tooth).",
    "Camera: one short move per beat, locked during holds; macro shots sit on the line where pins meet tooth tips.",
  ],
};
