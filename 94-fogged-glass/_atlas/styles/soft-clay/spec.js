// styles/soft-clay/spec.js — STYLE_SPEC for "Soft Clay". Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs) and the browser.
// Units: metres (a ~25 cm tabletop set modelled ~10x: props 0.5–2 m), Y-up right-handed, sRGB hex,
// radians, three.js light units.
//
// The look: a stop-motion claymation tabletop. Every prop is modelling clay — chunky rounded forms with
// seeded lumps, thumb dents and a fine tool-mark grain, matte with a faint waxy sheen — in saturated
// plasticine colours on a soft seamless paper sweep. Object motion is shot "on twos" (12–15 poses/s),
// the camera moves smoothly, and the surface "boils" a little on every new pose.

export const STYLE_SPEC = {
  id: "soft-clay",
  name: "Soft Clay",
  description:
    "A stop-motion claymation tabletop: chunky, slightly lumpy plasticine props with thumb dents and a waxy sheen on a warm paper sweep, animated on twos with squash-and-stretch and surface boil.",
  palette: {
    bg: "#efe3d0",        // paper sweep (warm oat)
    sweep: "#f1e4cf",
    sweepShade: "#d9c4a6",
    ink: "#33283a",       // aubergine "black" clay (never pure black)
    cream: "#f6ead2",
    tomato: "#e5483a",
    tangerine: "#f2902c",
    sun: "#f6c33b",
    leaf: "#58a84f",
    mint: "#7fd1b2",
    teal: "#1f9e9a",
    sky: "#4d8ad6",
    grape: "#7a55bf",
    bubblegum: "#f27ca2",
    blush: "#f6a9b8",
    cocoa: "#8a5636",
    stone: "#9aa0a8",
  },
  world: {
    background: "#efe3d0",
    fog: { color: "#efe3d0", near: 16, far: 34 },
    environment: "room",
    environmentIntensity: 0.22,   // just enough for the waxy highlight to read
    toneMapping: "neutral",       // keeps plasticine hues as designed (ACES greys the cream sweep)
    exposure: 1.05,
    shadowType: "pcf",            // pcf so shadow.softness applies
  },
  materials: {
    // paper sweep: very rough, faint fibre bump
    sweep: { type: "standard", baseColor: "#f1e4cf", roughness: 0.97, metalness: 0, bump: { scale: 48, octaves: 3, seed: 7, strength: 0.08, description: "faint paper tooth" } },
    // clay template: every palette colour becomes a clone (materials["clay:<name>"]). The surface
    // detail (micro-bump + tool marks + pose boil) is an object-space shader patch, see `clay` below.
    clay: { type: "physical", baseColor: "#ffffff", roughness: 0.62, metalness: 0, sheen: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.55 },
  },
  // clay surface (style.js patches it into every clay material; object-space so it sticks to the prop)
  clay: {
    sheenColor: "#fff3e6",
    sheenRoughness: 0.55,
    microBump: { freq: 9.0, strength: 0.07, description: "fbm grain in object space (fingertip texture)" },
    toolMarks: { freq: 3.0, stretch: 4.0, strength: 0.03, description: "short streaks along a slowly varying diagonal, masked to patches: modelling-tool drags" },
    boil: { amount: 0.6, description: "per-pose shift of the micro-bump lookup (stop-motion re-handling); 0 = off" },
    wobble: { amp: 0.07, freq: 1.6, description: "seeded low-frequency vertex displacement, fraction of size" },
    dents: { count: [2, 4], radius: [0.16, 0.3], depth: 0.075, description: "thumbprint dents: seeded shallow elliptical hollows with a raised lip" },
    contactFlatten: 0.06, // fraction of height flattened where a blob rests on the table
    segments: 48,         // sphere/lathe resolution (wobble needs tessellation)
  },
  // clay colours that get a material (materials["clay:<name>"] and materials[<name>])
  clays: ["cream", "ink", "tomato", "tangerine", "sun", "leaf", "mint", "teal", "sky", "grape", "bubblegum", "blush", "cocoa", "stone"],
  lights: [
    { id: "ambient", type: "hemisphere", color: "#fff4e6", groundColor: "#c9a986", intensity: 1.15 },
    // big soft studio key from camera-left, high: long soft shadows to the right-back
    { id: "key", type: "directional", color: "#fff1dd", intensity: 2.6, position: [-6, 9, 7], target: [0.4, 0, -0.4],
      shadow: { softness: 9, mapSize: 2048, extent: 6.5, near: 2, far: 30, bias: -0.0005, normalBias: 0.03 } },
    { id: "fill", type: "directional", color: "#dfe8ff", intensity: 0.55, position: [8, 3.5, 6], target: [0, 0.8, 0] },
    { id: "rim", type: "directional", color: "#ffe0c2", intensity: 0.9, position: [2, 6, -8], target: [0, 0.8, 0] },
  ],
  post: {
    bloom: { strength: 0.35, radius: 0.5, threshold: 2.4 },   // only the glowing hero blooms
    tiltShift: { focus: 0.52, range: 0.34, blur: 2.4 },      // shallow tabletop depth cue
    vignette: { darkness: 0.28, offset: 1.15 },
    grain: { amount: 0.018, fps: 15 },                        // grain changes on twos too
  },
  camera: { fov: 30, near: 0.4, far: 80, drift: { amp: 0.03, speed: 0.25 } },
  text: { font: "rounded", weight: 800, color: "#33283a", height: 0.4 },
  // clay lettering (stroke font swept into rolled coils)
  lettering: { coilRatio: 0.15, letterSpacing: 0.3, wordSpacing: 0.55, lineHeight: 1.45, bendRadius: 0.16, press: 0.62, radial: 10 },
  tuning: {
    fps: 15,              // pose rate for object motion ("on twos" at 30 fps); camera stays at 30
    squash: 0.32,         // max squash on landing (scaleY = 1 - squash)
    stretch: 0.22,        // max stretch in flight
    anticipation: 0.12,   // crouch before a hop, s
    settle: { stiffness: 260, damping: 11 }, // jiggle after landing (underdamped)
    popDur: 0.4,          // squash-pop entrance duration
    boilJitter: 0.012,    // per-pose rotation jitter (rad) and 0.4x that in metres
    morphDur: 0.5,        // squish-down-and-re-form time
  },
  sfx: { enter: "pop", exit: "bubble", move: "whoosh", land: "thud", emphasis: "chime", ui: "click", bed: "pad", squish: "bubble+thud+paper (layered)" },
  motion: [
    "Object motion is quantised to 15 poses/s (each pose held 2 frames at 30 fps); only the camera moves every frame.",
    "Every move squashes: crouch before a hop, stretch along the arc, splat on landing, underdamped jiggle to rest — volume preserved.",
    "Shapes change by squishing flat and re-forming as the new shape (never by cross-fading or plain scaling).",
    "Each new pose shifts the surface micro-texture and adds a tiny seeded rotation jitter: the clay 'boils' like re-handled plasticine.",
    "Labels are rolled clay coils pressed onto a cream plaque; letters pop on one per pose.",
    "Camera: a slow dolly across the tabletop, low three-quarter angle, one move per beat, never cuts.",
  ],
};
