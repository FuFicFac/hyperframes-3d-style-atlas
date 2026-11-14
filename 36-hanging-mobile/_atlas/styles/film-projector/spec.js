// styles/film-projector/spec.js — STYLE_SPEC for "Film Projector". Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs, render-sfx.mjs, reel.js) and the browser.
// Units: metres, Y-up right-handed, sRGB hex, radians, three.js light units (point = candela, decay 2).
//
// The look: a dark screening room. A vintage reel-to-reel projector on a tall stand throws a dusty light cone
// onto a pull-down screen; what it shows is a sepia picture with gate weave, flicker, scratches and dust.
// Room frame: lens at (0, lensY, lensZ) looking down -Z at the screen centre (0, lensY, screenZ).
// The film-strip set (camera rides along the strip) is a separate, unlit "light table" far off to +X.

export const STYLE_SPEC = {
  id: "film-projector",
  name: "Film Projector",
  description:
    "A dark screening room: a vintage reel-to-reel projector (turning reels, threaded film, a glowing lens) throws a dusty volumetric light cone onto a pull-down screen showing a sepia silent-film picture with gate weave, flicker, scratches and dust; the camera rides a sprocketed film strip frame by frame and cuts to the screen for each intertitle card, between a 3-2-1 countdown leader and a tail-out.",
  palette: {
    void: "#060508",
    wall: "#16131a",
    floor: "#1b1512",
    enamel: "#3d443c",      // projector hammertone green-grey
    enamelLight: "#5b6458",
    chrome: "#cfccc4",
    reel: "#a7abb0",
    film: "#2a1a10",        // film pack brown
    lamp: "#ffd9a0",        // lamp leak / vents
    lens: "#fff2da",
    sepiaDark: "#22160b",
    sepiaLight: "#f4dcae",
    screen: "#d8d3c6",
    masking: "#0a090b",
    seat: "#2a1e24",
    cabinet: "#2b1c14",
    cardInk: "#efe4c8",
    cardGround: "#0d0b0a",
    leaderGrey: "#8f8b84",
    edgeCode: "#e8c77a",
  },
  world: {
    background: "#060508",
    environment: "room",       // faint reflections so chrome and enamel read as metal
    environmentIntensity: 0.22,
    toneMapping: "neutral",    // sepia and cream stay on-hue (ACES greys the paper tones)
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    enamel: { type: "physical", baseColor: "#3d443c", roughness: 0.42, metalness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.35, bump: { source: "bumpNoise", scale: 90, octaves: 2, seed: 17, strength: 0.18, description: "hammertone enamel dimples" } },
    enamelLight: { type: "physical", baseColor: "#5b6458", roughness: 0.4, metalness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.35 },
    chrome: { type: "standard", baseColor: "#d8d5ce", roughness: 0.22, metalness: 1 },
    reel: { type: "standard", baseColor: "#a7abb0", roughness: 0.34, metalness: 0.9, side: "double" },
    dark: { type: "standard", baseColor: "#141416", roughness: 0.55, metalness: 0.35 },
    film: { type: "standard", baseColor: "#2a1a10", roughness: 0.32, metalness: 0.05, side: "double" },
    filmPack: { type: "standard", baseColor: "#ffffff", roughness: 0.4, metalness: 0.05 },
    cabinet: { type: "standard", baseColor: "#ffffff", roughness: 0.72, metalness: 0 },
    wall: { type: "standard", baseColor: "#16131a", roughness: 0.95, metalness: 0, bump: { source: "bumpNoise", scale: 40, octaves: 3, seed: 5, strength: 0.4, description: "acoustic cloth weave" } },
    floor: { type: "standard", baseColor: "#1b1512", roughness: 0.95, metalness: 0, bump: { source: "bumpNoise", scale: 140, octaves: 2, seed: 9, strength: 0.35, description: "carpet pile" } },
    masking: { type: "standard", baseColor: "#0a090b", roughness: 1, metalness: 0 },
    seat: { type: "physical", baseColor: "#2a1e24", roughness: 0.8, metalness: 0, sheen: 0.6 },
    case: { type: "standard", baseColor: "#24221f", roughness: 0.5, metalness: 0.6 },
    vent: { type: "lambert", baseColor: "#1a120a", emission: { color: "#ffb766", strength: 3.2 } },
    lensGlass: { type: "lambert", baseColor: "#000000", emission: { color: "#fff2da", strength: 6 } },
  },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#3b3644", groundColor: "#0b0809", intensity: 0.42 },
    // cool rim from the screen side, high: outlines the projector, reels and seat backs against the dark
    { id: "rim", type: "directional", color: "#aebbd4", intensity: 0.55, position: [3.5, 7, -3], target: [0, 2.2, 5] },
    // dim booth key from behind-left so the operator side of the projector has form
    { id: "booth", type: "directional", color: "#ffe2bd", intensity: 0.35, position: [-5, 6, 10], target: [0, 2.0, 4.5],
      shadow: { softness: 4, mapSize: 1024, extent: 3.5, near: 2, far: 25, bias: -0.0005, normalBias: 0.02 } },
  ],
  // ---- style-specific tuning (every number that defines the look) ----
  room: {
    lensY: 2.2, lensZ: 4.4, screenZ: -8.2, wallZ: -8.5, sideX: 7, floorDepth: [-9, 12],
    seats: { rows: [-3.4, -1.9, -0.4, 1.1, 2.6], perRow: 8, spacing: 0.62, aisle: 0.9, back: [0.52, 0.62, 0.08], seatH: 0.48 },
    bounce: { color: "#f4e3c4", intensity: 9, distance: 18, offset: 1.0 }, // screen spill light (candela), offset toward the room
  },
  screen: {
    width: 4.0, height: 3.0,     // projected image (4:3, the silent-era ratio)
    fabric: [4.5, 3.4],          // white surface
    border: 0.14,                // black masking around the fabric
    caseR: 0.11, caseOver: 0.35, // roller case radius / overhang
    pull: { ring: 0.07, drop: 0.28 },
    base: "#16140f",             // what the fabric shows with the lamp off (ambient bounce)
    gain: 1.0,                   // projected white level (linear, before tone mapping)
    vignette: 0.42, hotspot: 0.1, soft: 0.008,
    sepia: 0.88,                 // 0 = neutral black-and-white, 1 = full sepia
  },
  wear: {
    fps: 18,                     // simulated film frame rate (silent era): weave, flicker, dust change per film frame
    weave: [0.0016, 0.0045],     // gate weave amplitude in image uv (x, y)
    flicker: 0.028,              // +- luminance fraction (keep under ~0.06)
    scratch: { slots: 2, run: 9, chance: 0.42, alpha: [0.07, 0.18], width: [0.0011, 0.0024], wander: 0.0018 },
    specks: { slots: 8, density: 0.3, r: [0.0028, 0.0095], bright: 0.3, alpha: 0.75 },
    runout: { density: 0.85, rScale: 1.7, flicker: 0.05 },
  },
  reel: {
    speed: 0.72,                 // film metres per second (toy-scale exaggerated so the reels visibly turn)
    hubR: 0.085, packR0: 0.36, flangeR: 0.43, flangeGap: 0.05, holes: 4, holeR: 0.085,
    spindle: 7.5,                // take-up clutch speed (rad/s) once the loose tail no longer holds it back
    flaps: 4,                    // loose-tail slaps per take-up revolution (one per spoke)
    coastDecay: 2.4,             // empty feed reel spins down (1/s) after the tail leaves
    stopDur: 0.8,                // motor run-down (s)
    lampRamp: 0.15, lampOffDur: 0.25,
  },
  projector: {
    body: [0.44, 0.6, 1.0],      // w, h, d (local: lens toward -Z, origin at base centre)
    base: [0.52, 0.05, 1.16],
    lens: { y: 0.38, r: 0.085, len: 0.3, ringR: 0.097 },
    lampHouse: { x: 0.25, z: 0.08, r: 0.13, h: 0.52, vents: 6 },
    reelX: -0.27,
    feed: [1.25, -0.42],         // hub (y, z)
    takeup: [1.2, 0.5],
    drums: [[0.57, -0.3], [0.13, -0.12]], drumR: 0.05,
    gate: [0.45, 0.2, -0.47],    // top y, bottom y, z
    leak: { color: "#ffbf73", intensity: 1.6, distance: 3.5 },
    cabinet: [0.78, 1.16],       // w, d (height = to the body base)
  },
  beam: {
    color: "#fff0d4",
    density: 0.06,               // in-scatter per metre at level 1 (linear, additive)
    edge: 0.06,                  // soft edge width (fraction of half-extent)
    dust: 0.5, dustScale: 2.6, dustDrift: [0.0, 0.035, 0.02],
    streaks: 0.4, streakFreq: 11,
    image: 0.55,                 // how much the projected picture modulates the beam
    steps: 22,
    lumGrid: [12, 9],            // picture luminance grid that patterns the beam (CPU-computed)
    near: 0.12,                  // starts this far in front of the lens
    apexBoost: 1.5,
  },
  motes: { count: 260, size: 0.018, level: 1.25, drift: 0.07, seed: 41 },
  strip: {
    height: 1.0, pitch: 0.8, image: [0.72, 0.54],
    sprocket: { w: 0.07, h: 0.085, r: 0.016, y: 0.405, step: 0.2 },
    arcR: 3.4, segs: 240, pxPerMetre: 900,
    base: "#140c07", hole: "#ffe9c2", frameLine: "#050302",
    glow: { color: "#ffdcae", level: 1.15, sigma: 1.3, floor: 0.18 },
    table: { color: "#ffcf96", level: 0.55, sigma: 1.6, back: 1.2 },
    camDist: 1.55, camLift: 0.05,
  },
  programme: { w: 1024, h: 768 },
  intertitle: {
    font: 'Didot, "Bodoni 72", Baskerville, Georgia, serif',
    panel: [0.08, 0.745, 0.92, 0.95], // x0, y0, x1, y1 as fractions of the frame (lower card)
    lift: 0.15,                  // pictures are drawn lifted by this fraction so the subject clears the card
    textSize: 0.08, tracking: 0.08, fadeFrames: 4,
    ink: "#efe4c8", ground: "#0d0b0a", border: 0.006,
  },
  leader: { per: 0.6, ground: "#9a968f", dark: "#2b2925", ring: "#f1ece2", font: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  post: {
    bloom: { strength: 0.5, radius: 0.5, threshold: 1.05 },
    vignette: { darkness: 0.55, offset: 1.05 },
  },
  camera: { fov: 32, near: 0.05, far: 90, drift: { amp: 0.018, speed: 0.3 } },
  text: { font: 'Didot, "Bodoni 72", Baskerville, Georgia, serif', weight: 400, color: "#efe4c8", height: 0.4 },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "pad", ui: "click", bed: "hum" },
  sound: {
    clatter: { type: "click", pitch: 0.45, gain: 0.12, accent: 1.25 },
    hum: { hz: 60, gain: 0.17 }, whir: { hz: 92, gain: 0.3 }, rumble: { gain: 0.3 },
    sting: { root: 196, attack: 0.008, release: 1.4, dur: 1.7, brightness: 2400, gain: 0.3, chime: 0.07 },
    chords: [[0, 4, 7, 12], [5, 9, 12, 17], [-3, 4, 9, 12], [7, 11, 14, 19], [0, 7, 12, 16]],
    twoPop: { hz: 1000, dur: 0.042, gain: 0.22 },
  },
  motion: [
    "The projector runs the whole clip: reels turn at v/r with the film pack radius shrinking (feed) and growing (take-up) — closed form from film metres run.",
    "Everything worn (weave, flicker, scratches, dust) changes per simulated 18 fps film frame and is a hash of the frame index, never state.",
    "Camera rides the backlit film strip frame to frame (inOutCubic), then cuts to the screen where that frame is projected large with its intertitle card.",
    "Opens on a 3-2-1 sweep-clock leader with a 2-pop; ends on an end card, clear runout, white tail-out, the lamp dying and the motor running down.",
  ],
};
