// styles/sticky-notes/spec.js — STYLE_SPEC for "Sticky Notes". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the board plan + score) and the browser.
// Units: metres, Y-up right-handed, sRGB hex, radians, three.js light units.
//
// The look: a workshop wall in a daylit studio. A big bright whiteboard in an aluminium frame with a ledge, covered in
// square paper notes in soft colours, each with a short marker word, curled at the free edge with a soft shadow under it;
// dot stickers, marker-drawn lanes / headers / boxes / arrows, a pad of notes leaning on the ledge.
// Board frame: board centre = world origin, whiteboard surface at z = 0 facing +Z, y up.
// Notes: origin = TOP-CENTRE of the note, the sheet hangs down local -y; the adhesive strip is the top `strip` fraction.

export const STYLE_SPEC = {
  id: "sticky-notes",
  name: "Sticky Notes",
  description:
    "A workshop wall in a daylit studio: a bright whiteboard in an aluminium frame covered in square paper notes in soft colours, each with a short marker word, curled at the free edge over a soft shadow, plus dot stickers, marker-drawn lanes, headers and boxes, and a pad of notes on the ledge. Notes behave like real sticky notes as pure functions of time: they peel off the pad (the curl travels in from the free edge), fly, slap flat strip-first and flap down to a resting curl, then peel and hop between columns, cluster by colour, collect dot votes and ripple in a travelling breeze.",
  palette: {
    bg: "#e7e3dc",
    wall: "#e9e5de",          // studio wall (warm light grey)
    board: "#fbfbf9",         // whiteboard (stays white: neutral tone mapping, exposure tuned)
    frame: "#c3c7cc",         // anodised aluminium
    ink: "#23272d",           // black marker
    // note colours (soft, stay true under neutral tone mapping)
    notes: { yellow: "#f6df73", pink: "#f4a9c2", blue: "#a3cff0", green: "#b4e0a0", orange: "#f7bd7c" },
    // marker colours
    markers: { black: "#23272d", blue: "#2456a6", red: "#c4352e", green: "#2c8a4c" },
    // dot stickers
    dots: { red: "#e0453a", blue: "#2f6fd1", green: "#2fa253", orange: "#f08a1c" },
  },
  world: {
    background: "#e7e3dc",
    environment: "room",
    environmentIntensity: 0.32,   // soft reflections in the whiteboard gloss and the aluminium
    toneMapping: "neutral",       // white stays white, note colours stay true (ACES greys paper)
    exposure: 1.0,
    shadowType: "pcf",
  },
  // Board, frame, ledge (metres). 16:9-ish so the finished board fills the frame.
  board: {
    w: 4.2, h: 2.4,
    frame: { width: 0.045, depth: 0.03, radius: 0.008, front: 0.012 },
    backing: 0.02,
    ledge: { depth: 0.15, thick: 0.022, lip: 0.03, lipThick: 0.012, gap: 0.015 },
    ghost: { seed: 5, smears: 9, level: 0.035 },   // faint half-erased marker ghosts in the whiteboard
    gloss: 0.3,                                     // whiteboard roughness
  },
  // Notes: the bendable sheet. Curl = single-axis bend about the strip line, rebuilt from the flat sheet every frame.
  note: {
    size: 0.4,                 // square side (≈ 5× a real 76 mm note: legible text at 1080p in a full-board shot)
    strip: 0.24,               // adhesive strip = top 24 % of the sheet (always flat when stuck)
    segX: 8, segY: 32,         // mesh resolution (rows along the bend axis)
    bendLen: 0.045,            // length over which a hinge/peel bend happens (m)
    restCurl: 0.72,            // resting curl angle at the free edge (rad); progressive toward the edge
    curlPow: 1.7,              // curl ∝ ((s - strip) / free)^curlPow
    corner: 0.55,              // the corners curl more than the middle (× (2x/W)^2)
    peelAngle: 2.2,            // angle of the peeled flap on the pad (rad, ~125°)
    peelLen: 0.13,             // the peel bend is soft: it rolls over this length (m)
    peelRoll: 1.1,             // extra roll along the lifted part (rad over the full sheet length)
    approach: 0.95,            // body angle away from the wall just before the strip sticks (rad)
    liftAngle: 0.55,           // body angle when a stuck note is lifted to move (rad)
    zBase: 0.0016, zLayer: 0.0007, // strip height over the board + per-arrival layer step (later arrivals on top)
    canvas: 512,               // note face canvas px
    jitterRot: 0.07,           // seeded in-plane tilt of hand-placed notes (rad)
    paper: { fibre: 0.035, edge: 0.06, back: 0.9 },  // face fibre noise, edge darkening, back-face tone multiplier
  },
  // Note text: macOS system hand fonts, named ONLY in canvas JS (never in index.html CSS, so HyperFrames fetches nothing).
  hand: {
    font: "\"Marker Felt\", \"Noteworthy\", \"Chalkboard SE\", \"Bradley Hand\", cursive",
    weight: 700,
    size: 0.235,               // font px as a fraction of the note canvas (two short lines fit)
    lineHeight: 1.08,
    ink: "#22262c",
    y: 0.58,                   // text block centre, fraction of the face height (below the strip)
  },
  pad: { lean: 0.2, thick: 0.034, sheets: ["yellow", "pink", "blue", "green", "orange"], x: 1.62 },
  // Phase durations (seconds) used by the planner (notes.js)
  timing: {
    padPeel: 0.5,              // curl travels from the free edge to the strip
    fly: 0.62,                 // pad -> wall flight
    slap: 0.55,                // strip sticks, flap falls, bounces, settles to resting curl
    lift: 0.16,                // stuck note: body peels up before the strip lets go
    hop: 0.44,                 // wall -> wall hop
    slide: 0.36,               // short slide (gap closing)
    reslap: 0.42,              // slap after a hop
    flyArc: 0.32, flyOut: 0.34, // flight arc height (y) as fraction of distance, max z out (m)
    hopZ: 0.09, slideZ: 0.025,  // hop / slide stand-off from the board (m)
    dotDrop: 0.16,             // dot sticker drop time
  },
  breeze: { amp: 0.62, width: 1.3, wavelength: 0.9, freq: 2.2, speed: 3.6 },
  dot: { r: 0.037, h: 0.0012 },
  marker: { width: 0.014, wobble: 0.006, speed: 2.6, textSpeed: 26, gap: 0.05, z: 0.0007,
    pen: { r: 0.019, len: 0.27, dir: [0.62, -0.5, 0.6] } },
  textures: {
    wall: { size: 256, scale: 5, octaves: 4, seed: 12, colorA: "#e3dfd7", colorB: "#eeeae3", description: "matte studio wall paint" },
  },
  materials: {
    wall: { type: "standard", baseColor: "#ffffff", roughness: 0.95, metalness: 0 },
    board: { type: "physical", baseColor: "#ffffff", roughness: 0.3, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.18 },
    frame: { type: "physical", baseColor: "#c3c7cc", roughness: 0.32, metalness: 0.85 },
    frameDark: { type: "standard", baseColor: "#5d6168", roughness: 0.6, metalness: 0.2 },
    paper: { type: "standard", baseColor: "#ffffff", roughness: 0.86, metalness: 0 },
    dot: { type: "physical", baseColor: "#ffffff", roughness: 0.28, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 },
    penBody: { type: "standard", baseColor: "#eceff2", roughness: 0.45, metalness: 0 },
    eraser: { type: "standard", baseColor: "#3a3d42", roughness: 0.7, metalness: 0 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#f3f5f8", groundColor: "#b9b2a6", intensity: 1.05 },
    // window daylight from upper left-front: the curl lifts throw soft shadows down-right onto the board
    { id: "window", type: "directional", color: "#fff6ea", intensity: 1.75, position: [-3.2, 3.6, 5.2], target: [0.2, -0.2, 0],
      shadow: { softness: 4, mapSize: 4096, extent: 2.7, near: 1, far: 16, bias: -0.00012, normalBias: 0.0008 } },  // tiny normalBias: notes sit 2 mm off the board
    { id: "fill", type: "directional", color: "#eef3ff", intensity: 0.35, position: [4, 0.5, 5], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.22, offset: 1.15 },
  },
  // Framing: notes.js boardShot() fits a square-on-ish shot (slightly from the right and above, so curls read) to a board box.
  camera: { fov: 30, near: 0.3, far: 40, drift: { amp: 0.006, speed: 0.2 },
    framing: { fov: 30, dir: [0.16, 0.13, 1], safe: 0.9, limit: 0.9, minDist: 1.2, maxDist: 12 } },
  // Beat caption: a paper label strip on the overlay (exact colours), marker hand, bottom-left inside the safe area.
  caption: { x: 140, y: 930, h: 92, cap: 50, paper: "#fffdf6", edge: "#d8d2c2", ink: "#22262c", accent: "#f6df73", tape: "rgba(240,236,220,0.82)" },
  text: { font: "\"Marker Felt\", \"Noteworthy\", \"Chalkboard SE\", cursive", weight: 700, color: "#22262c", height: 0.12 },
  sfx: { enter: "paper", exit: "paper", move: "whoosh", land: "thud", emphasis: "chime", ui: "pop", bed: "pad" },
  // Sound palette for stickyVoices() (notes.js): every value is a voice option or gain.
  sound: {
    peel: { pitch: 1.7, density: 0.95, gain: 0.42 },          // paper rip off the pad
    lift: { pitch: 2.0, density: 0.85, gain: 0.22 },          // quick unpeel on the wall
    slap: { thudPitch: 2.6, thudGain: 0.5, clickPitch: 0.55, clickGain: 0.3 },
    hop: { pitch: 1.9, gain: 0.08 },
    dot: { pitch: 1.75, gain: 0.3, tickGain: 0.12 },
    squeak: { hz: 1650, hz2: 2050, grit: 0.06, gain: 0.035, felt: 0.6, feltGain: 0.2 },
    breeze: { pitch: 0.75, gain: 0.28, rustle: 0.14 },
    mallet: { root: 0.5, gain: 0.16, dur: 0.7 },              // chime pitch multiplier for the theme's root (440 Hz)
  },
  motion: [
    "Peel off the pad: the curl starts at the free (bottom) edge and travels up to the adhesive strip, then the note lets go.",
    "Slap: the strip sticks first; the flap falls flat (accelerating), bounces once and relaxes into a resting curl at the free edge.",
    "Re-sorting: a stuck note peels its body up, the strip lets go, it hops (or slides) to its new place and slaps again; later arrivals layer on top.",
    "Dot votes drop onto a note's surface and ride with it; a marker draws lanes, boxes and names stroke by stroke with a pen riding the tip.",
    "Breeze: a travelling wave ripples every free edge on the board from left to right.",
    "Camera: computed board shots (boardShot), slightly from the right and above so curls and shadows read; gentle moves between holds.",
  ],
};
