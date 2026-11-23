// styles/crt-retro/spec.js — STYLE_SPEC for "CRT Retro". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the typing score) and the browser.
// Units: metres (real desk scale), Y-up right-handed, sRGB hex, radians, three.js light units.
//
// The look: a beige 1970s–80s computer terminal on a wooden desk in a dim room at night. The monitor's CRT
// is the explainer surface: content is drawn per frame (pure f(t)) into a canvas with a 5x7 pixel font and shown
// through a CRT shader (barrel, scanlines, grille hint, halation, jitter, roll, vignette) on a curved glass tube.
// Desk frame: desk top = y 0, monitor bezel faces +Z (toward the camera), wall behind at z = wall.z.

export const STYLE_SPEC = {
  id: "crt-retro",
  name: "CRT Retro",
  description:
    "A vintage beige computer terminal on a wood desk in a dark room at night: a chunky yellowed-plastic monitor with a deeply curved CRT whose phosphor text types itself (scanlines, barrel curvature, halation, a block cursor), a clacky two-tone keyboard whose keys press with the typing, floppy drives, a desk lamp, a mug and a pinned note; the screen glow spills colour onto the desk and keys.",
  palette: {
    bg: "#050506",
    wall: "#2a2622",        // warm dark painted plaster
    plastic: "#d6c7a1",     // yellowed beige / putty case
    plasticDark: "#b9a982", // shaded / older panels
    keyAlpha: "#d8ccb0",    // letter keycaps
    keyMod: "#6e5a46",      // brown modifier keycaps
    legend: "#2b2118",
    tubeOff: "#121513",     // unpowered phosphor glass
    paper: "#efe6cf",
    ink: "#2a2fa0",         // ball-point blue on the note
    pin: "#c4302b",
    mug: "#3d5a4b",
    lampMetal: "#1d2420",
    caption: "#f1e6c8",
    captionPlate: "#0b0a08",
  },
  world: {
    background: "#050506",
    fog: { color: "#050506", near: 3.5, far: 7 },
    environment: "room",
    environmentIntensity: 0.06, // only enough to give the plastic and glass a faint room reflection
    toneMapping: "aces",
    exposure: 1.15,
    shadowType: "pcf",
  },
  // Phosphor presets (style knob: crt.phosphor). core = the colour bright text saturates toward.
  phosphors: {
    green: { color: "#33ff66", core: "#c8ffd2", bg: "#0b1a10", spill: "#58ff8a" }, // P1
    amber: { color: "#ffb000", core: "#ffe7b0", bg: "#1c1206", spill: "#ffb84a" }, // P3
    white: { color: "#e6f0ff", core: "#ffffff", bg: "#12151a", spill: "#d8e4ff" }, // P4
  },
  // CRT tube + shader knobs.
  crt: {
    phosphor: "green",
    cols: 32, rows: 14,       // character grid (32 columns is the legible maximum at 1080p)
    unitPx: 6,                // canvas px per font pixel; a cell is 6 x 10 font pixels (5x7 glyph + gaps)
    pad: [64, 60],            // canvas padding [x, y] px around the grid (keeps text off the curved edge)
    textLevel: 1.55,          // HDR level of lit phosphor (linear, before ACES) — above bloom threshold
    blackLevel: 0.018,        // raster glow when powered but dark
    invertLevel: 0.78,        // inverse-video block level (lower = less halation filling the black glyphs)
    flash: 0.55,              // extra brightness of a freshly drawn character...
    flashTau: 0.09,           // ...decaying analytically from its own reveal time (s)
    cursorGhost: 0.4,        // cursor trail level, decaying from when the cursor left the cell
    ghostTau: 0.07,
    barrel: 0.055,            // image barrel distortion
    scanlines: 0.42,          // scanline depth 0..1 (auto-fades when lines get finer than ~2 px)
    mask: 0.1,                // aperture-grille hint depth
    maskTriads: 300,          // stripe triads across the tube
    halation: 0.55,           // mip-blur phosphor glow around bright text
    jitter: 0.00035,          // per-scanline horizontal jitter (uv units, per frame hash)
    roll: 0.05,               // slow bright roll band depth
    rollSpeed: 0.21,          // roll band passes per second
    vignette: 0.22,           // tube-corner darkening exponent
    cornerSoft: 0.012,
    reflect: 0.07,            // painted-in glass highlight (soft streak upper left)
    glassEnv: 0.09,           // reflectivity of the additive glass shell (faint room reflection)
    blinkPeriod: 1.06,        // cursor blink period (s), on for half
    blinkIdle: 0.45,          // cursor stays solid this long after it last moved
    wipeBand: 0.07,           // height (screen fraction) of the clear-wipe beam
    power: { lineDur: 0.12, openDur: 0.3, bloom: 1.8, bloomDur: 0.45, offLine: 0.13, offDot: 0.12, dotFade: 0.55 },
  },
  // Hardware geometry (metres). Slight toy-scale exaggeration on the keys (x1.15) so they read in wide shots.
  hardware: {
    unit: { w: 0.5, h: 0.12, d: 0.4, z: -0.08, drives: 2 },
    monitor: { w: 0.44, h: 0.38, bezelDepth: 0.032, hoodDepth: 0.36, taper: 0.66, radius: 0.028, feet: 0.006,
      opening: { w: 0.3, h: 0.225, r: 0.024, y: 0.018 }, tube: { w: 0.316, h: 0.238, R: 0.62, recess: 0.03 } },
    keyboard: { pitch: 0.0215, keyH: 0.011, travel: 0.0042, tilt: 0.1, z: 0.4, y: 0.0, margin: [0.026, 0.022], caseH: [0.028, 0.05] },
    cable: { r: 0.0045, sag: 0.05 },
  },
  spill: { intensity: 0.9, angle: 1.05, penumbra: 1, distance: 2.4, bounce: 0.07, bounceDistance: 1.6, idle: 0.3 },
  lamp: { innerShade: "#d9b27a", innerRim: "#1e160e", color: "#ffc27a", intensity: 3.2, angle: 0.62, penumbra: 0.65, distance: 3, leak: 0.25, bulb: 2.2 },
  textures: {
    plastic: { size: 256, scale: 40, octaves: 3, seed: 21, description: "fine moulded-plastic texture bump" },
    yellowing: { size: 256, seed: 5, amount: 0.07, description: "uneven sun-yellowing blotches in the beige" },
    wall: { size: 512, scale: 7, octaves: 5, seed: 8, colorA: "#3d3832", colorB: "#554c42", description: "painted plaster" },
    wood: { size: 1024, boards: 4, seed: 23, grainFreq: 18, contrast: 0.5, dark: "#2f1d12", mid: "#5a3a24", light: "#7b5233", description: "walnut desk planks" },
    cork: { size: 256, density: 0.5, base: "#9a7448", dots: ["#6f5232", "#b88d5c", "#5c4228"], radius: [0.6, 1.6], seed: 3, description: "cork board speckle" },
  },
  materials: {
    plastic: { type: "physical", baseColor: "#d6c7a1", roughness: 0.52, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.5 },
    plasticDark: { type: "standard", baseColor: "#b9a982", roughness: 0.6, metalness: 0 },
    trim: { type: "standard", baseColor: "#2a2621", roughness: 0.55, metalness: 0.05 },   // recess / slots / badge
    vent: { type: "standard", baseColor: "#0d0c0b", roughness: 0.9, metalness: 0 },
    keyAlpha: { type: "standard", baseColor: "#d8ccb0", roughness: 0.45, metalness: 0 },
    keyMod: { type: "standard", baseColor: "#6e5a46", roughness: 0.45, metalness: 0 },
    wood: { type: "physical", baseColor: "#ffffff", roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35 },
    wall: { type: "standard", baseColor: "#ffffff", roughness: 0.95, metalness: 0 },
    paper: { type: "standard", baseColor: "#ffffff", roughness: 0.85, metalness: 0 },
    cork: { type: "standard", baseColor: "#ffffff", roughness: 0.95, metalness: 0 },
    frame: { type: "standard", baseColor: "#3a2a1c", roughness: 0.6, metalness: 0 },
    pin: { type: "physical", baseColor: "#c4302b", roughness: 0.25, metalness: 0, clearcoat: 0.8 },
    mug: { type: "physical", baseColor: "#3d5a4b", roughness: 0.3, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.15 },
    pencil: { type: "standard", baseColor: "#e0a92a", roughness: 0.5, metalness: 0 },
    lampMetal: { type: "physical", baseColor: "#1d2420", roughness: 0.38, metalness: 0.6, clearcoat: 0.5 },
    chrome: { type: "standard", baseColor: "#9a9a96", roughness: 0.25, metalness: 1 },
    disk: { type: "standard", baseColor: "#141414", roughness: 0.55, metalness: 0 },
    cable: { type: "standard", baseColor: "#c9b991", roughness: 0.55, metalness: 0 },
    led: { type: "standard", baseColor: "#1a0505", roughness: 0.3, metalness: 0, emission: { color: "#ff3b2a", strength: 1.6 } },
  },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#6d7c99", groundColor: "#120c08", intensity: 0.32 },
    { id: "moon", type: "directional", color: "#8fa6d6", intensity: 1.1, position: [-2.6, 2.2, 1.1], target: [0, 0.3, -0.3],
      shadow: { softness: 6, mapSize: 2048, extent: 1.4, near: 1, far: 8, bias: -0.0004, normalBias: 0.02 } }, // window light from the left
    { id: "fill", type: "directional", color: "#b39a7e", intensity: 0.12, position: [0.8, 1.2, 3], target: [0, 0.2, 0] },
  ],
  post: {
    bloom: { strength: 0.42, radius: 0.5, threshold: 0.92 },
    vignette: { darkness: 0.5, offset: 1.05 },
    grain: { amount: 0.018, fps: 30 },
  },
  camera: { fov: 30, near: 0.05, far: 12, drift: { amp: 0.004, speed: 0.22 } },
  text: { font: "mono", weight: 700, color: "#f1e6c8", height: 0.05 },
  caption: { x: 0, y: -0.76, height: 0.034, cps: 70, unitPx: 5, padUnits: [7, 5], bar: 3 },
  // Typing cadence (the pure planner in screen.js). Humans ~11–16 cps with seeded jitter; the machine prints fast.
  typing: { cps: 17, jitter: 0.3, spacePause: 0.04, wordHesitate: 0.1, hesitateLen: 0.16, shiftExtra: 0.05, minGap: 0.04,
    enterGap: 0.14, printCps: 55, boxCps: 160, keyHold: [0.05, 0.085], keyDown: 0.018, keyUp: 0.045 },
  sfx: { enter: "thud", exit: "thud", move: "whoosh", land: "clack", emphasis: "blip", ui: "blip", bed: "hum" },
  motion: [
    "Power-on: a bright horizontal line opens to a full raster with a brightness bloom; power-off collapses to a line, then a dot that fades.",
    "Text types at a seeded human cadence (one clack per key, the matching 3D key presses); machine replies print fast after a soft beep.",
    "Freshly drawn characters flash and settle, and the cursor leaves a short trail — both computed from each character's own reveal time.",
    "Screens clear with a top-to-bottom beam wipe; the block cursor is solid while moving and blinks when idle.",
    "Camera: slow push-in from a wide desk shot until the tube fills the frame, an over-the-keys angle for typing, then a pull back out.",
  ],
};
