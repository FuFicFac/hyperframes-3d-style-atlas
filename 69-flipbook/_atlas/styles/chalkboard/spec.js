// styles/chalkboard/spec.js — STYLE_SPEC for "Chalkboard". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the chalk schedule + score) and the browser.
// Units: metres (real classroom scale), Y-up right-handed, sRGB hex, radians, three.js light units.
//
// The look: a real slate chalkboard in a worn oak frame with a chalk tray, mounted on a painted classroom wall and
// lit by soft daylight from a window on the left. Teaching happens as chalk that appears stroke by stroke: every
// stroke is stamped into a board canvas as a pure function of t and shown through a "tooth" shader, so light
// pressure only catches the peaks of the slate (grainy, broken chalk) and heavy pressure fills in.
// Board frame: board centre = world origin, slate surface at z = 0 facing +Z; wall behind at z = wall.z.

export const STYLE_SPEC = {
  id: "chalkboard",
  name: "Chalkboard",
  description:
    "A real classroom chalkboard filmed in 3D: a dusty green slate in a worn oak frame with a chalk tray (sticks, a felt eraser, dust) on a painted wall, side-lit by window daylight. Grainy, pressure-varying hand-drawn chalk writes itself stroke by stroke over ghosts of old lessons; a floating chalk stick shedding dust follows the stroke tip, the eraser lifts off the tray to wipe a region and leaves a ghost.",
  palette: {
    bg: "#1d1f1c",
    wall: "#9fa38c",        // pale sage classroom paint
    slate: "#2c3b33",       // green slate
    slateDark: "#1f2b25",
    slateLight: "#3a4b41",
    oak: "#8a6440",
    // chalk colours (used sparingly: white for teaching, yellow = the model's guess, pink = wrong, green = right, blue = system)
    chalk: { white: "#f1efe6", yellow: "#f3dc72", pink: "#f2a0b8", blue: "#9ccbeb", green: "#a6dd98" },
    felt: "#3b3a38",
  },
  world: {
    background: "#1d1f1c",
    environment: "room",
    environmentIntensity: 0.22,  // faint room reflections: gives the slate its glancing sheen
    toneMapping: "neutral",      // chalk colours must read as designed
    exposure: 1.0,
    shadowType: "pcf",
  },
  // Board + frame + tray geometry (metres). The slate is 16:9-ish so the board fills the frame.
  board: {
    w: 3.4, h: 1.9,
    frame: { width: 0.085, depth: 0.05, radius: 0.007, front: 0.032 }, // front = how far the rail face stands proud of the slate
    backing: 0.025,                                                     // slate panel thickness (wall at z = -backing)
    tray: { depth: 0.12, thick: 0.03, lip: 0.022, lipThick: 0.014, overhang: 0.06 },
    ppm: 600,                     // chalk canvas pixels per metre (3.4 m -> 2040 px)
    slatePpm: 300,                // static slate base texture px per metre
  },
  slate: {
    seed: 7,
    mottle: 0.16, mottleScale: 3.2, // low-frequency slate mottling (multiplied)
    streak: 0.05,                    // horizontal grain streaks
    ghosts: 6,                       // how many "previous lesson" fragments are baked in, half-erased
    ghostLevel: 0.5,                 // ghost chalk opacity before erasing
    erasedTo: [0.1, 0.24],           // fraction of the ghost left after the old wipes (seeded per wipe)
    smears: 11,                      // old eraser arc smears (faint haze)
    smearLevel: 0.025,
    dustEdge: 0.12,                  // dust haze rising from the tray (fraction of board height)
    dustLevel: 0.1,
  },
  // The tooth shader: coverage = smoothstep(tooth - soft, tooth + soft, chalkAlpha * gain); + haze * alpha.
  tooth: { size: 512, repeat: [3.0, 1.68], floor: 0.17, soft: 0.2, gain: 1.25, haze: 0.22, micro: 0.1, seed: 31 },
  // The chalk planner (chalk.js). All lengths in metres, speeds in m/s, times in seconds.
  chalk: {
    width: 0.013,                  // nominal chalk line width
    headingWidth: 1.25,            // heading strokes x this
    flow: 0.3,                     // alpha per stamp at pressure 1
    stampSpacing: 0.36,            // stamp step as a fraction of the stamp radius
    dabs: 8,                       // grain sprite variants per colour
    speed: 5.0,                    // shapes (lines, boxes, circles) — explainer pace, ~2x a real teacher
    hatchSpeed: 9.0,               // hatch scribbles are fast
    textSpeed: 54,                 // handwriting, in cap-heights per second of pen-down travel
    minTextSpeed: 5.0,             // m/s floor so small labels don't crawl
    retrace: 3.2,                  // heading double-stroke retrace speed multiplier
    minStroke: 0.018,
    penUp: 0.008, charGap: 0.014, wordGap: 0.035, lineGap: 0.07, itemGap: 0.07,
    step: 0.004,                   // resample spacing of every stroke (m)
    jitter: { wobble: 0.022, wobbleFreq: 1.3, baseline: 0.07, lineTilt: 0.012, scaleX: 0.11, scaleY: 0.07,
      slant: 0.07, slantVar: 0.05, rot: 0.035, lift: 0.035, letterSpacing: 0.24, wordSpacing: 0.58 },
    shape: { wobble: 0.0035, wobbleFreq: 4.5, bow: 0.012, overshoot: 0.025 },
    pressure: { text: 0.9, heading: 1.0, shape: 0.85, hatch: 0.55, landing: 0.25, taper: 0.4, skip: 0.13, skipLevel: 0.3 },
    heading: { offset: [0.009, -0.006] },
    eraser: { w: 0.15, h: 0.055, d: 0.04, band: 0.14, speed: 6.0, strength: 0.86, smear: 0.1, lift: 0.5, ret: 0.55 },
    smudge: { width: 0.05, strength: 0.55, smear: 0.1 },
  },
  // Floating chalk stick + falling dust (closed form from the plan).
  floatChalk: { r: 0.0078, len: 0.095, tilt: [0.34, -0.3, 0.89], hop: 0.028, idle: 0.75, fade: 0.3, rest: 0.05 },
  dust: { perMetre: 34, life: 1.15, gravity: 0.32, drift: 0.05, size: 0.0065, level: 0.9, capacity: 900 },
  textures: {
    wall: { size: 512, scale: 6, octaves: 5, seed: 8, colorA: "#9a9e87", colorB: "#aeb299", description: "painted plaster, slightly uneven" },
    oak: { size: 1024, boards: 3, seed: 41, grainFreq: 30, contrast: 0.45, dark: "#5b3d22", mid: "#8a6440", light: "#a98258", description: "worn oak rails" },
  },
  materials: {
    wall: { type: "standard", baseColor: "#ffffff", roughness: 0.93, metalness: 0 },
    oak: { type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0 },
    slate: { type: "standard", baseColor: "#ffffff", roughness: 0.58, metalness: 0 },
    trayDust: { type: "standard", baseColor: "#ffffff", roughness: 0.8, metalness: 0 },
    felt: { type: "standard", baseColor: "#3b3a38", roughness: 1, metalness: 0 },
    eraserBack: { type: "standard", baseColor: "#6b4a2c", roughness: 0.55, metalness: 0 },
    chalkStick: { type: "standard", baseColor: "#f1efe6", roughness: 0.95, metalness: 0 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#c9d6e6", groundColor: "#3a332a", intensity: 0.55 },
    // window daylight from the left: falloff across the board, frame + chalk shadows, window mullion shadows on the wall
    { id: "window", type: "spot", color: "#fff1dc", intensity: 210, position: [-5.4, 2.7, 4.3], target: [0.5, -0.25, 0], angle: 0.5, penumbra: 0.95, decay: 2, distance: 0,
      shadow: { softness: 5, mapSize: 2048, near: 3, far: 14, bias: -0.0002, normalBias: 0.01 } },
    { id: "fill", type: "directional", color: "#e9eef5", intensity: 0.35, position: [3, 1.2, 5], target: [0, 0, 0] },
  ],
  // Optional off-camera window mullions (shadow-only geometry) between the window light and the wall. Off by default:
  // at classroom distances the bar shadows read as dark blobs across the writing.
  window: { enabled: false, at: [-2.75, 1.37, 2.37], w: 1.6, h: 2.1, bars: [2, 3], bar: 0.07, yaw: 0.9 },
  post: {
    vignette: { darkness: 0.42, offset: 1.05 },
  },
  // framing: chalk.js boardShot()/framingReport() — square-on, eye-level shots fitted to board regions; the report fails any
  // frame where the heading or the item being drawn passes |NDC| > limit (the outer 5 %), mid-move included.
  camera: { fov: 30, near: 0.3, far: 30, drift: { amp: 0.006, speed: 0.18 },
    framing: { fov: 30, safe: 0.84, limit: 0.9, side: 0.16, up: 0.02, minDist: 2.4, maxDist: 5.4, pad: 0.03 } },
  text: { font: "sans", weight: 700, color: "#f1efe6", height: 0.1 },
  sfx: { enter: "penScratch", exit: "paper", move: "whoosh", land: "click", emphasis: "penScratch", ui: "click", bed: "pad" },
  // Sound palette for chalkVoices() (chalk.js): every value is a voice option or gain.
  sound: {
    scratch: { pitch: 0.5, pitchVar: 0.12, gain: 0.3, speedRef: 1.6 },
    tap: { pitch: 0.3, gain: 0.1, liftGain: 0.22 },
    erase: { pitch: 0.36, density: 0.9, gain: 0.5 },
    eraserLift: { pitch: 1.8, gain: 0.06 },
    eraserDrop: { pitch: 1.4, gain: 0.13 },
  },
  motion: [
    "Strokes draw on along their length in natural writing order: letters stroke by stroke, short pen-up hops between strokes, slower landings and quick lifts.",
    "Headings are double-stroked (each stroke retraced fast with a small offset); fills are quick hatch scribbles; emphasis = double underline or a loose circle.",
    "A floating chalk stick rides the active stroke tip, hops between strokes, drifts away in long pauses and sheds closed-form dust that falls and fades.",
    "Erasing: the felt eraser lifts off the tray, wipes the region in boustrophedon rows (leaving a ghost and a dusty smear), and returns.",
    "Camera: square-on and at eye level with what it frames (boardShot), gentle push/pan between computed shots that always keep the heading and the active writing inside the safe area (framingReport); hold during writing.",
  ],
};
