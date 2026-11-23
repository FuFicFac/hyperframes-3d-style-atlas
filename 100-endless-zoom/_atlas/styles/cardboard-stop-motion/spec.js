// styles/cardboard-stop-motion/spec.js — STYLE_SPEC for "Cardboard Stop-Motion". Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs, render-sfx via poses.js) and the browser.
// Units: metres (a tabletop set modelled ~5x: board 5 cm thick so the flutes read at 1080p), Y-up right-handed,
// sRGB hex, radians, three.js light units.
//
// The look: a hand-built set of corrugated cardboard on a workbench under a warm clamp lamp. Cut-outs stand upright in
// shallow layers facing +Z (the camera), boxes are real folded boxes. EVERYTHING — objects, camera, lamp flicker, grain —
// is evaluated at pose time tq = floor(t * pose.fps) / pose.fps (10 poses/s = exactly "on threes" at 30 fps), plus a tiny
// seeded per-pose jitter, so each pose is held for 3 identical frames like a real stop-motion take.

export const STYLE_SPEC = {
  id: "cardboard-stop-motion",
  name: "Cardboard Stop-Motion",
  description:
    "A hand-built corrugated-cardboard set on a workbench under a warm clamp lamp: kraft cut-outs with wavy fluted cut edges and wonky hand-cut outlines, marker-pen drawings and lettering, masking tape and brass split-pin joints; everything (camera included) is animated on threes with per-pose jitter and lamp flicker, puppets rotate about split pins, and pieces slide, stand up on tabs and are swapped like replacement animation.",
  palette: {
    bg: "#1b1410",          // dim workshop beyond the bench
    kraft: "#bf9a6c",       // brown kraft liner
    kraftLight: "#cfae84",
    kraftDark: "#9a7448",
    whiteTop: "#ebe3d3",    // white-top board (signs, labels)
    flute: "#b28c5f",       // corrugated medium seen on a cut edge
    cavity: "#3b2414",      // the dark gaps between flute and liner
    ink: "#1f1c22",         // black marker
    red: "#e0473a",
    green: "#4fae63",
    blue: "#5a93e0",
    yellow: "#f5d03a",
    orange: "#f08a30",
    tape: "#e4d3a0",        // masking tape
    brass: "#c99a3d",
    wood: "#8b5b36",
    woodDark: "#5a3820",
    lampShade: "#2f4a3c",
  },
  world: {
    background: "#1b1410",
    fog: { color: "#1b1410", near: 16, far: 34 },
    environment: "room",     // only for the brass split pins; kept low so cardboard stays matte
    environmentIntensity: 0.18,
    toneMapping: "neutral",  // keeps kraft brown and white-top board as designed (ACES greys them)
    exposure: 1.25,
    shadowType: "pcf",       // pcf so shadow.softness applies
  },
  // pose snapping: the signature mechanic (also read by poses.js -> SCORE)
  pose: {
    fps: 10,                 // poses per second: 10 = on threes at 30 fps (every pose held for exactly 3 frames)
    jitter: { pos: 0.006, rot: 0.007 },   // per-pose hand-placement error (m, rad) for every moving piece
    camJitter: { pos: 0.004, rot: 0.0008 },
    flicker: 0.035,          // per-pose lamp level wobble (+-fraction): mains/practical flicker between exposures
    restJitter: 0.35,        // fraction of jitter that pieces keep while "at rest" (a set is touched between frames)
  },
  board: {
    thickness: 0.07,         // corrugated board thickness (exaggerated ~12x so the flutes read at 1080p)
    flutePitch: 0.12,        // one wave of the corrugated medium along a cut edge
    linerFrac: 0.13,         // liner thickness as a fraction of board thickness (each side)
    wonk: { amp: 0.018, freq: 2.2, kink: 0.006, step: 0.07 }, // hand-cut outline wobble (m), low-freq per metre, knife kinks
    showThrough: 0.035,      // faint flute stripes visible through the face liner
    pxPerMetre: 200,         // printed (drawn-on) face resolution
    curveSegments: 18,
  },
  marker: {
    width: 0.055,            // marker stroke width in cap heights
    bleed: 0.18,             // extra soft halo width (ink bleeding into the liner), fraction of stroke width
    bleedAlpha: 0.22,
    wobble: 0.02,            // hand wobble of lettering strokes, in cap heights
    hatch: { gap: 0.042, width: 0.03, angle: 0.7, alpha: 0.9, wash: 0.72 }, // marker colour-fills are hatched, not flat
  },
  textures: {
    kraft: { size: 512, seed: 31, fibre: 0.07, mottle: 0.06, stripes: 11, description: "kraft liner: fbm mottling + fine fibre speckle + faint flute show-through stripes (11 per metre)" },
    edge: { w: 96, h: 64, description: "one flute pitch of a cut edge: two liners, a sine medium, dark cavities" },
    wood: { size: 1024, metres: 6.0, boards: 4, seed: 7, grainFreq: 18, grainWarp: 2.0, contrast: 0.42, seamColor: "#3a2414", description: "bench top planks" },
  },
  materials: {
    kraft: { type: "standard", baseColor: "#ffffff", roughness: 0.92, metalness: 0 },
    edge: { type: "standard", baseColor: "#ffffff", roughness: 0.96, metalness: 0 },
    bench: { type: "standard", baseColor: "#ffffff", roughness: 0.7, metalness: 0 },
    benchSide: { type: "standard", baseColor: "#5a3820", roughness: 0.8, metalness: 0 },
    tape: { type: "standard", baseColor: "#e4d3a0", roughness: 0.75, metalness: 0, opacity: 0.93 },
    brass: { type: "physical", baseColor: "#c99a3d", roughness: 0.32, metalness: 0.85, clearcoat: 0.3, clearcoatRoughness: 0.4 },
    stick: { type: "standard", baseColor: "#c9a77a", roughness: 0.8, metalness: 0 },
    penBody: { type: "physical", baseColor: "#f1efe9", roughness: 0.4, metalness: 0, clearcoat: 0.4 },
    tapeCore: { type: "standard", baseColor: "#b08d62", roughness: 0.9, metalness: 0 },
    lampShade: { type: "standard", baseColor: "#2f4a3c", roughness: 0.45, metalness: 0.3 },
    lampMetal: { type: "standard", baseColor: "#8d8f92", roughness: 0.35, metalness: 0.8 },
    bulb: { type: "standard", baseColor: "#fff1d6", roughness: 0.3, metalness: 0, emission: { color: "#ffd9a0", strength: 5 } },
  },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#fff6ec", groundColor: "#6a5444", intensity: 1.4 },
    { id: "lamp", type: "spot", color: "#ffe6c4", intensity: 70, position: [-1.9, 4.05, 1.4], target: [0.3, 0.6, -0.6], angle: 1.0, penumbra: 0.8, decay: 2,
      shadow: { softness: 4, mapSize: 2048, near: 2, far: 22, bias: -0.0006, normalBias: 0.02 } },
    { id: "fill", type: "directional", color: "#dbe5f5", intensity: 0.9, position: [7, 4, 9], target: [0, 1, 0] },
    { id: "bounce", type: "point", color: "#ffd2a0", intensity: 5, position: [0.5, 3.2, 6.5], decay: 2, distance: 0 },
  ],
  post: {
    bloom: { strength: 0.35, radius: 0.5, threshold: 2.6 },   // only the bulb blooms (pre-tone-mapping luminance)
    vignette: { darkness: 0.38, offset: 1.1 },
    grain: { amount: 0.014, fps: 30 },                          // scene passes POSE time to stage.render, so grain holds per pose
  },
  camera: { fov: 30, near: 0.5, far: 60, drift: null },        // no smooth drift: the camera is stepped like the rest
  text: { font: "rounded", weight: 800, color: "#1f1c22", height: 0.4 },
  lettering: { cap: 0.4, letterSpacing: 0.3, lineHeight: 1.6, strokeDur: 0.04 },  // stroke-font marker lettering; s per stroke when writing on
  tuning: {
    standDur: 0.3,      // stand a piece up on its tab (3 poses)
    tipDur: 0.3,        // tip a piece back flat
    slideStep: 0.1,     // slides advance once per pose (no in-between)
    swapHold: 2,        // poses each replacement piece is held for
    walkSwing: 0.32,    // leg swing (rad) per pose when a puppet slides along
  },
  sfx: { enter: "paper", exit: "rustle", move: "tick", land: "thud", emphasis: "chime", ui: "penScratch", bed: "pad" },
  motion: [
    "Every moving thing is evaluated at pose time tq = floor(t*10)/10: 10 poses per second, each held for exactly 3 frames (on threes).",
    "Each pose adds a tiny hash(pose index) jitter in position and rotation, and the lamp level wobbles a few percent per pose (exposure flicker).",
    "The camera is stepped too: locked off, and when it moves it is nudged once per pose with its own jitter; grain is seeded per pose.",
    "Jointed cut-out puppets move only by rotating parts about brass split pins; walking = legs swinging about hip pins once per pose while the body slides.",
    "Pieces slide in whole steps, stand up on tabs in 3 poses, tip back flat, and are swapped for a different cut-out (replacement animation) instead of morphing.",
    "Marker lettering writes itself on stroke by stroke (one stroke per ~0.05 s, snapped to poses) with a marker squeak per stroke.",
  ],
};
