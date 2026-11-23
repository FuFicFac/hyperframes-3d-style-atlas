// styles/evidence-board/spec.js — STYLE_SPEC for "Evidence Board". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs; scene.config.js imports it for the thread planner + score) and the browser.
// Units: metres (paper items ~2x real size so typed text reads at 1080p), Y-up right-handed, sRGB hex, radians.
//
// The look: an investigator's cork board on a dim office wall under a desk lamp. Calm cork in a dark oak frame, pinned
// index cards with typewriter text, instant-photo prints whose pictures are drawn in code (objects, places, diagrams —
// never people), torn notebook scraps, a map fragment of an invented place, sticky flags, coloured map pins, and RED
// STRING drawn pin to pin. threads.js (pure, Node-safe) plans every pin-in, string draw, wrap, twang, flag and marker
// stroke, so the picture and the SCORE read the same plan.
// Board frame: cork surface = the z = 0 plane, board centre = world origin, viewer at +Z, gravity -Y (down the board).

export const STYLE_SPEC = {
  id: "evidence-board",
  name: "Evidence Board",
  description:
    "An investigator's cork board on a dim office wall under a desk lamp: calm cork in a dark oak frame, pinned index cards with typewriter text, instant-photo prints of code-drawn pictures (objects, places, diagrams), torn notebook scraps, a map fragment of an invented place, sticky flags and coloured map pins. Items fly in and are pinned one at a time (tilt, pin drives home with a bounce); red string is drawn pin to pin, sagging as a catenary, wrapping each pin and pulling taut with a twang, until the web reveals the link; a marker circles the key item and the camera follows the thread.",
  palette: {
    bg: "#0d0b0a",
    wall: "#2a231e",
    cork: "#b8946a",
    corkDark: "#8a6c4c",
    corkLight: "#d4b48a",
    frame: "#3b2416",
    card: "#f3ecdc",
    cardRule: "#8fb2cf",
    cardRed: "#c9605a",
    photoBorder: "#f4f1ea",
    scrap: "#f1ecdf",
    scrapRule: "#9fb5d1",
    mapPaper: "#ece2c8",
    mapInk: "#3c5a78",
    ink: "#1f1b17",
    pencil: "#3a3a40",
    string: "#b3201c",
    marker: "#d1271f",
    pins: ["#d23b2f", "#2f6db5", "#e2b62f", "#3a9a5b", "#f2efe6", "#1f1f22"],
    flags: ["#ff8a3d", "#f5d33c", "#4fc3e8", "#ff6f9a", "#8bdc5a"],
  },
  world: {
    background: "#0d0b0a",
    environment: "room",
    environmentIntensity: 0.08,  // a glint on pin heads and the glossy prints, nothing more
    toneMapping: "neutral",      // keeps cream paper cream and the red string red (ACES greys paper)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    frame: { type: "physical", baseColor: "#ffffff", roughness: 0.55, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.5 },
    wall: { type: "standard", baseColor: "#2a231e", roughness: 0.95, metalness: 0 },
    needle: { type: "standard", baseColor: "#c9ccd1", roughness: 0.28, metalness: 1 },
    lampShade: { type: "standard", baseColor: "#24382c", roughness: 0.4, metalness: 0.35 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#efe2cc", groundColor: "#120d09", intensity: 0.42 },
    {
      // the desk lamp: warm pool on the board from upper left, falling off toward the corners
      id: "lamp", type: "spot", color: "#ffe9cc", intensity: 9.0, position: [-0.55, 0.95, 1.35], target: [0.05, -0.05, 0],
      angle: 0.78, penumbra: 0.85, decay: 2, distance: 0,
      shadow: { softness: 3, mapSize: 2048, near: 0.4, far: 3.5, bias: -0.0002, normalBias: 0.002 },
    },
    // a faint cool spill from the right (window light from the office): lifts the shadow side of pins and string
    { id: "spill", type: "directional", color: "#9fb4cc", intensity: 0.28, position: [1.6, 0.3, 1.2], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.12, radius: 0.4, threshold: 3.0 },   // effectively off; only pin-head glints
    vignette: { darkness: 0.55, offset: 1.0 },
    grain: { amount: 0.012, fps: 30 },                        // tiny: the cork already reads as texture (bitrate!)
  },
  camera: { fov: 30, near: 0.05, far: 10, drift: { amp: 0.004, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#1f1b17", height: 0.03 },

  // ---- board -----------------------------------------------------------------------------------------------
  board: {
    W: 1.8, H: 1.1,                 // cork area (m)
    frame: { width: 0.06, depth: 0.035, bevel: 0.008 },
    cork: {
      px: 2048,                     // texture width (height follows the aspect)
      blotch: 0.06, blotchScale: 5, // CALM: low-contrast large blotches
      grain: 0.07, grainCells: 260, // granules (~7 mm toy scale), low contrast — bitrate under a moving camera
      pits: 0.05,                   // sparse darker pits
      bumpScale: 1.0,               // bump strength (keep low: per-pixel relief moves with the camera)
      seed: 11,
      pinholes: 90,                 // old pin holes scattered over the cork (lived-in)
    },
    wall: { w: 6, h: 4, z: -0.04 },
  },

  // ---- paper items (all sizes in metres) ------------------------------------------------------------------
  paper: {
    px: 900,                         // canvas px per metre of item... x this scale (see style.js pxPerM)
    pxPerM: 2600,                    // texture resolution: 0.3 m card -> 780 px wide
    seg: 14,                         // plane subdivision for the static curl
    curl: 0.005,                     // corner lift away from the pin (m at the far corner)
    roughness: 0.82,
    gloss: { roughness: 0.32, clearcoat: 0.35 },   // instant-photo face
    layer: 0.0016,                   // z step between overlapping items
  },
  card: {
    W: 0.32, H: 0.2,
    font: '"American Typewriter", "Courier New", Courier, monospace',
    titleCap: 0.021, lineCap: 0.016, line: 0.026, margin: 0.03,
  },
  photo: {
    W: 0.25, H: 0.3, border: 0.014, bottom: 0.062,   // instant-print frame; picture is square-ish above the caption strip
    font: '"Marker Felt", "Noteworthy", "Bradley Hand", sans-serif', cap: 0.022,
    fade: 0.12,                      // print warmth/fade over the drawn picture
  },
  scrap: { W: 0.25, H: 0.16, font: '"Noteworthy", "Bradley Hand", "Marker Felt", sans-serif', cap: 0.0155, tear: 0.012 },
  map: { W: 0.34, H: 0.26, font: '"American Typewriter", "Courier New", monospace', cap: 0.013, tear: 0.01 },
  flag: { W: 0.05, H: 0.018, alpha: 0.88 },

  // ---- pins + string ---------------------------------------------------------------------------------------
  pin: {
    head: 0.0085, neck: 0.0035, needle: 0.0009,   // ball-head map pin (radii)
    length: 0.03,                 // exposed shaft + head height above the cork when home
    raise: 0.032,                 // how far it sits proud while the item flies in
    drive: 0.11, bounce: 0.0035, bounceDecay: 0.06, bounceHz: 9,
  },
  string: {
    radius: 0.0016, radial: 6, n: 72,       // tube
    z: 0.016,                     // string height above the cork at the pins (wraps the shaft under the head)
    speed: 0.62,                  // draw speed (m/s along the chord)
    minDraw: 0.55, maxDraw: 1.1,  // draw duration clamp (s)
    slack: 0.075,                 // extra length while drawing (catenary sag)
    taut: 0.0035,                 // extra length once pulled taut
    lift: 0.05,                   // the free end is carried off the board on an arc
    wrapTurns: 1.25, wrapR: 0.0032, wrapPts: 9, wrapDur: 0.16,
    tighten: 0.16,                // pull-taut time after the wrap
    twang: { amp: 0.0045, decay: 0.16, hz: 8.5 },
    roughness: 0.75,
  },
  fly: {
    dur: 0.5, z: 0.42, hover: 0.012,        // item flies in from in front of the board, holds just off the cork
    from: [0.18, -0.14],                    // default offset (m) the flight starts from, scaled by side
    tilt: [0.55, -0.45, 0.5],               // start rotation (rad) — eased to the landing tilt
    landTilt: 0.12,                         // extra z tilt on landing, swings back after the pin with a damped wobble
    swingHz: 2.2, swingDecay: 0.35,
    pinDelay: 0.08,                         // landing -> pin drive
  },
  marker: { width: 0.007, dur: 0.75, turns: 1.08, wobble: 0.06, z: 0.003 },
  flagPop: { dur: 0.18 },

  // ---- the beat label: a strip of masking tape with typed text, on the overlay (exact colours) --------------
  caption: {
    x: 92, y: 60, h: 86, cap: 40,
    font: '"American Typewriter", "Courier New", monospace', weight: 700,
    tape: "#e9dcb8", tapeEdge: "#cdbd93", ink: "#231c15",
  },

  sound: {
    flutter: { gain: 0.22, pitch: 1.5 },
    thunk: { gain: 0.5, pitch: 1.7 },
    prick: { gain: 0.16, pitch: 0.7 },
    draw: { gain: 0.12, pitch: 2.2 },
    wrap: { gain: 0.12, pitch: 1.3 },
    twang: { gain: 0.3, hz: 196, hz2: 182 },
    flag: { gain: 0.2, pitch: 1.9 },
    marker: { gain: 0.28, pitch: 1.15 },
    bed: { gain: 0.75, root: 98, brightness: 700 },
  },
  sfx: { enter: "paper", exit: "whooshOut", move: "rustle", land: "thud", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Pin-in: an item flies in from in front of the board, tumbling and fluttering, holds just off the cork with a tilt, then the pin drives home with a small bounce and the item swings about the pin into place.",
    "String: the free end is carried from pin to pin on an arc; the drawn length grows with time and hangs as a true catenary under gravity, wraps the far pin and pulls taut with a short decaying twang.",
    "Flags and marker: sticky flags pop onto items; a red marker circles the key item stroke by stroke.",
    "Camera: square-on to the board with a little parallax, following each new string from pin to pin like a train of thought, ending on a wide that fills the frame with the finished web.",
  ],
};
