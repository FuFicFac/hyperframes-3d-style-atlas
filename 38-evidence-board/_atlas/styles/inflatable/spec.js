// styles/inflatable/spec.js — STYLE_SPEC for "Inflatable": glossy inflated vinyl and foil-balloon objects in a bright
// seamless studio. Plain data only (JSON-serializable, no THREE, no window): importable from Node (export-spec,
// render-sfx, inflate.js users) and the browser. Units: metres, Y-up right-handed, sRGB hex, radians, three.js light units.
//
// The look: puffy pillow letters, numbers and icons with a flat welded seam round the edge, pinched scalloped edges,
// tight wrinkles radiating from the seam, a little valve; two finishes (candy vinyl, mirror foil). Every object is a
// 2D outline whose skin is REBUILT from the flat shape every frame from fill(t): thickness swells from the middle out
// (pillow profile from distance-to-edge), wrinkles tighten and fade, the edge pulls in and scallops, it stands up,
// overshoots and wobbles to rest. See inflate.js (the THREE-free planner shared by picture and sound).

export const STYLE_SPEC = {
  id: "inflatable",
  name: "Inflatable",
  description:
    "Glossy inflated vinyl and mirror-foil balloon objects in a bright seamless studio: puffy pillow letters, numbers, arrows, stars, hearts and speech bubbles with a flat welded seam round the edge, pinched scalloped corners, tight wrinkles radiating from the seam, a little valve and strong soft-box highlights. Inflation is a pure function of time: each object starts as a flat, crumpled outline on the floor, its skin is rebuilt every frame from fill(t) — thickness swells from the middle outward, wrinkles tighten and fade, it stands up, overshoots and wobbles to rest with a squeaky stretch. Objects also deflate (sag, fold, sink), bump neighbours and squash on contact, get squeezed so the air shifts to one side, or float up on ribbons and bob. Words inflate letter by letter; air hiss, rubber squeaks and a boing come from the same plan.",
  palette: {
    bg: "#f4eee8",
    sweep: "#f2ebe4",
    floor: "#efe7df",
    ink: "#2a2233",
    primary: "#ff5c8a",
    secondary: "#3fa9f5",
    accent: "#ffcc3d",
    // candy vinyl
    pink: "#ff5c8a",
    lemon: "#ffcc3d",
    mint: "#2fd39a",
    sky: "#3fa9f5",
    tangerine: "#ff8a3d",
    grape: "#9a6bff",
    cherry: "#f2364b",
    // mirror foil
    gold: "#ffd877",
    silver: "#dfe3ea",
    rose: "#f2a496",
    ribbon: "#ffffff",
    captionCard: "#ffffff",
    captionInk: "#2a2233",
    captionSub: "#8a7f93",
  },
  world: {
    background: "#f4eee8",
    environment: null,          // style.js builds a procedural BRIGHT studio PMREM (spec.studio) — foil needs it
    toneMapping: "neutral",     // candy colours must stay candy; ACES greys the warm-white sweep
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    sweep: { type: "standard", baseColor: "#f2ebe4", roughness: 0.92, metalness: 0 },
    // vinyl: base for every candy colour (style.js clones per object and sets the colour). Clearcoat = the glossy skin.
    vinyl: { type: "physical", baseColor: "#ff5c8a", roughness: 0.42, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.0 },
    // mirror foil: metal with a little roughness so soft-box reflections never become 1-pixel glints
    foil: { type: "physical", baseColor: "#f0c25a", roughness: 0.16, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.12 },
    ribbon: { type: "physical", baseColor: "#ffffff", roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 },
    valve: { type: "physical", baseColor: "#ffffff", roughness: 0.3, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.1, opacity: 1 },
    weight: { type: "physical", baseColor: "#dfe3ea", roughness: 0.22, metalness: 1 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#ffffff", groundColor: "#efe1d6", intensity: 0.75 },
    // key: high front-left soft box; soft PCF shadow keeps the floor shadows pillowy
    { id: "key", type: "directional", color: "#fff6ee", intensity: 1.7, position: [-5, 9, 7], target: [0, 0.6, 0],
      shadow: { softness: 6, mapSize: 4096, extent: 6.5, near: 2, far: 30, bias: -0.0003, normalBias: 0.015 } },
    // rim from behind-right: outlines the tops of the pillows against the warm sweep
    { id: "rim", type: "directional", color: "#f1f4ff", intensity: 0.9, position: [5, 6, -7], target: [0, 0.8, 0] },
    { id: "fill", type: "directional", color: "#fff1f4", intensity: 0.35, position: [6, 2.5, 6], target: [0, 0.6, 0] },
  ],
  post: {
    bloom: { strength: 0.16, radius: 0.45, threshold: 2.8 },  // only the soft-box highlights on foil bloom (linear HDR > 2.8)
    vignette: { darkness: 0.18, offset: 1.15 },
    grain: { amount: 0.008, fps: 30 },
  },
  camera: { fov: 32, near: 0.3, far: 80, drift: { amp: 0.015, speed: 0.25 } },
  text: { font: "rounded", weight: 800, color: "#2a2233", height: 0.4 },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "whoosh", land: "squish", emphasis: "chime", ui: "blip", bed: "pad" },
  motion: [
    "Inflate: fill(t) 0 -> 1 rebuilds the skin from the flat outline every frame: thickness = pillow profile (distance-to-edge) times an air front that spreads from the middle outward; crumple and wrinkles fade with fill.",
    "As fill passes ~40 % the object stands up from the floor about its bottom edge, hops, then overshoots: a squeaky vertical stretch, a bulge and a side rock that ring down as a closed-form damped sine.",
    "Words inflate letter by letter (stagger ~0.5 s); each letter's overshoot bumps its left neighbour, which squashes on the contact side and rocks away (planned, not simulated).",
    "Deflate: fill drops fast, the top sags and folds forward, then the whole skin flops backward and sinks flat, wrinkles returning.",
    "Squeeze: the air shifts to one side (one half thins, the other bulges and pushes outward). Float: foil balloons lift on ribbons tied to a weight and bob.",
  ],

  // ---------------------------------------------------------------- style-specific tuning
  font: {
    // macOS system face (no web font: the HyperFrames compiler would fetch one). Puffy round terminals read as inflatable.
    family: '"Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif',
    load: ['400 120px "Arial Rounded MT Bold"'],
    tracePx: 360, simplify: 0.9,
    tracking: 0.17,              // extra letter gap (fraction of cap): inflated letters contract, leave room for the bump
  },
  skin: {
    cell: 0.0125,                // vertex grid spacing (m) for a ~1.1 m cap; the skin is a regular grid cut by a distance mask
    maskPx: 0.0028,              // distance-mask texel size (m); max maskMax px per side
    maskMax: 512,
    seam: 0.02,                  // flat welded flange width (m)
    tube: 1.05,                  // pillow radius = tube x inradius (vertical tangent at the seam, round crown)
    fattenGlyph: 0.042,          // glyph outlines are dilated this much (m at cap 1.1): balloon letters are chubbier than type
    crownCap: 0.2,               // crown height cap (m): wide shapes (hearts, bubbles) dome instead of ballooning into spheres
    dRange: 0.08,                // mask distance encoding range (m) either side of the edge
    blur: 3,                     // profile blur passes (rounds the medial ridge so it never reads as a bevel)
    vinylThick: 0.95,            // crown height per side as a fraction of the pillow radius (vinyl: puffy)
    foilThick: 0.62,             // foil balloons are flatter
    front: 0.85,                 // air front: how much of the profile is still flat at fill 0 (centre fills first)
    pull: 0.16,                  // in-plane edge pull-in at full fill (fraction of crown height) — the outline shrinks as it puffs
    scallop: 0.3,                // edge scallop depth (fraction of the pull) between pinch points
    scallopEvery: 2,             // scallop period in wrinkle periods
    crumple: 0.05,               // crumple amplitude at fill 0 (m)
    crumpleFreq: 2.4,            // crumple noise frequency (1/m)
    wobbleXY: 0.012,             // limp outline waviness at fill 0 (m)
    wrinkle: { lambda: 0.06, amp: 0.0036, reach: 0.045, resid: 0.3, limp: 0.7, foilLimp: 0.25, limpReach: 1.2, foilAmp: 1.2, octave: 0.3 },
    weld: { ridges: 3, amp: 0.0012, darken: 0.12, rough: 0.25 },
  },
  finishes: {
    vinyl: { roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9 },
    foil: { roughness: 0.16, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.12, envMapIntensity: 1.25 },
  },
  valve: { r: 0.034, h: 0.016, capR: 0.024, capH: 0.02, color: "#ffffff", opacity: 0.85, neck: { w: 0.07, l: 0.11 } },
  ribbon: { r: 0.008, n: 48, curls: 2.5, curlR: 0.035, sway: 0.05, swayPeriod: 3.1, sag: 0.18 },
  weight: { r: 0.075, h: 0.09 },
  // Procedural BRIGHT studio for reflections (kit studioEnvironment): white room, big top soft box, two strips, a
  // warm-white floor bounce and ONE dark flag so mirror foil has contrast (a uniformly white room makes foil read flat).
  studio: {
    size: 256,
    sigma: 0.012,                // slight pre-blur: soft-box edges stay soft on foil (no hot 1-px glints that flicker)
    room: { w: 26, h: 14, d: 26, color: "#aaa29e" },
    panels: [
      { id: "top", kind: "softbox", size: [8, 4], pos: [0, 7, 1], intensity: 3.4, color: "#ffffff", soft: 0.3 },
      { id: "keyStrip", kind: "strip", size: [1.4, 6], pos: [-7, 3, 4], intensity: 3.8, color: "#fff6ee", soft: 0.35 },
      { id: "rimStrip", kind: "strip", size: [1.2, 6], pos: [7, 3, -4], intensity: 3.0, color: "#f1f4ff", soft: 0.35 },
      { id: "front", kind: "card", size: [14, 5], pos: [0, 1.5, 12.5], intensity: 0.9, gradient: [[0, "#cfc6c0"], [1, "#ffffff"]] },
      { id: "floor", kind: "card", size: [20, 20], pos: [0, -6.5, 0], intensity: 0.75, gradient: [[0, "#f6ece4"], [1, "#a69a92"]], radial: true },
      { id: "back", kind: "card", size: [16, 5], pos: [0, 2.2, -12.5], intensity: 0.65, gradient: [[0, "#d8d0ca"], [1, "#ffffff"]] },
      { id: "flag", kind: "card", size: [6, 7], pos: [12.5, 2.5, 3], intensity: 0.12, gradient: [[0, "#2a2a30"], [1, "#4a4a52"]] },
    ],
    sweep: { size: [1, 1], radius: 9, from: 0.2, to: 2.6, intensity: 0, color: "#ffffff", soft: 0.3 },
    quantum: 0.002,
  },
  set: { width: 44, depth: 26, height: 12, radius: 3, z: -6.5, contact: 0.28 },
  caption: {
    // overlay pill: exact colours, drawn after post. One fixed region for the whole scene.
    x: -0.86, y: 0.8, height: 0.056, pad: [0.62, 0.46], dot: 0.42, weight: 800, tracking: 0.02,
    font: '"Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif',
    fadeIn: 0.3, fadeOut: 0.3, pop: 0.35, shadow: 0.1,
    sub: { height: 0.026, weight: 700, tracking: 0.12, color: "#8a7f93" },
  },
  plan: {
    // inflate.js defaults (overridable per event)
    inflate: { dur: 1.3, stand: [0.38, 0.92], hop: 0.18, overshoot: { amp: 1, freq: 2.6, decay: 3.4 }, stretch: 0.1, bulge: 0.07, rock: 0.05 },
    deflate: { dur: 1.3, fold: [0.12, 0.55, 0.7], flop: [0.45, 1.0], foldAngle: 1.25 },
    bump: { dur: 0.75, amount: 0.12, rock: 0.07, freq: 3.2, decay: 4.5 },
    squeeze: { dur: 1.2, amount: 0.55, in: 0.3, out: 0.35 },
    float: { dur: 2.2, bob: 0.05, bobPeriod: 2.7, sway: 0.05 },
    word: { step: 0.5 },
  },
  sound: {
    bed: { root: 261.63, chords: [[0, 4, 7, 12], [-5, 2, 7, 11], [-3, 4, 9, 12], [-7, 0, 5, 9]], every: 2, overlap: 0.6, attack: 0.5, release: 1.0, brightness: 1800, gain: 0.72 },
    theme: { step: 0.25, gain: 0.07, pitch: 1, pattern: [0, 2, 1, 2, 3, 2, 1, 2], from: 0.25 },
    hiss: { step: 0.17, dur: 0.24, gain: 0.11, pitch: [0.55, 1.5] },
    squeak: { gain: 0.16, pitch: [1.5, 2.1], at: [0.55, 0.85], buzz: 0.05 },
    boing: { gain: 0.22, hz: 105, hz2: 250, dur: 0.32, tail: 0.09 },
    deflate: { gain: 0.2, hz: 150, hz2: 55, flop: 0.32 },
    bump: { gain: 0.24, squeak: 0.1 },
    squeeze: { gain: 0.22, squeak: 0.14 },
    float: { gain: 0.06, notes: [0, 4, 7, 12] },
  },
};
