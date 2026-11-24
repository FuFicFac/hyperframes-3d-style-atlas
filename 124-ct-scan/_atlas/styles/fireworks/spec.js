// styles/fireworks/spec.js — STYLE_SPEC for "Fireworks". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the shell plan + score) and the browser.
// Units: metres (bursts are 50-70 m across, seen from ~150 m over water), Y-up, sRGB hex, radians.
//
// The look: a deep blue night over a harbour. A lit skyline with warm and cool windows sits on the far shore and is
// mirrored in the water. Shells rise from barges on a gold comet tail and burst into PLANNED shapes: every star flies
// from the burst centre to its own target point (ring, heart, letter) with drag, then hangs, droops and fades.
// Nothing is simulated: shells.js gives every star a closed-form position at time t, and the same plan makes the
// thump, whistle, boom and crackle.

export const STYLE_SPEC = {
  id: "fireworks",
  name: "Fireworks",
  description:
    "Night-sky fireworks over a harbour whose bursts form planned shapes. A closed-form ballistic shell planner (shells.js) gives each shell a launch time, an apex and a burst; each star flies from the burst centre to its target point of a planned shape (ring, heart, letter, word) under linear drag, then droops under gravity and fades. A per-shell TEMPERATURE loosens the plan: target noise, a random 'take' on the shape (turn, stretch, shear), speed and colour variety, and above a threshold a blend toward plain scatter. Stars, comet tails, flashes and their water reflections are one instanced draw of glowing sprites evaluated in the vertex shader from t. The skyline and water are lit by the bursts (flash colour from the same plan). Sound — lift thump, rising whistle, boom, crackle — is derived from the same shell plan.",
  palette: {
    bg: "#070b24",
    zenith: "#060a22",       // top of the sky
    mid: "#131a4c",          // mid sky, deep blue
    low: "#2c2a66",          // indigo above the horizon
    glow: "#6a4470",         // city glow at the horizon (dusty rose)
    water: "#0a0f2e",        // water near the camera
    waterFar: "#1f2258",     // water at the far shore
    building: "#0c1030",     // skyline body
    buildingLit: "#1a2052",  // lighter bodies (per-building mix)
    windowWarm: "#ffcf7a",
    windowCool: "#bfe3ff",
    barge: "#04050f",
    pink: "#ff3f86",
    gold: "#ffc64a",
    cyan: "#3fdcff",
    violet: "#a877ff",
    green: "#62ff8f",
    red: "#ff4a36",
    orange: "#ff8a2a",
    white: "#fff3dc",
    ink: "#fbf3e2",          // caption text
    panel: "#060818",        // caption panel
  },
  world: {
    background: "#070b24",   // covered by the sky dome
    sky: null,
    fog: null,
    environment: null,
    toneMapping: "none",     // unlit, designed colours; star sprites add in display space
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {},
  lights: [],
  post: {},                  // no post stack: the glow is in the sprite itself (cheap frames, no bloom haze)
  camera: { fov: 40, near: 1, far: 1500, drift: { amp: 0, speed: 0.2 } },   // locked camera: the bursts are the motion
  text: { font: "sans", weight: 600, color: "#fbf3e2", height: 0.5 },

  // ---- the view the defaults are tuned for -----------------------------------------------------------------
  view: { pos: [0, 6, 150], target: [0, 33.8, 0] },

  // ---- sky dome ---------------------------------------------------------------------------------------------
  sky: {
    radius: 1200,
    bands: { low: 0.05, mid: 0.2, zenith: 0.62 },   // elevation (dir.y) where each colour takes over
    glowHeight: 0.06,          // how far the horizon glow reaches up
    flashSky: 0.2,             // how much the burst flash lifts the sky
    flashWater: 0.16,          // ... and the water
    waterFade: 0.07,           // elevation below the horizon where the water reaches its near colour
    vignette: 0.3,
    dither: 0.75,              // static +-LSB dither against banding in the dark gradient (0 = off)
    stars: { count: 150, size: [2.4, 4.6], level: [0.25, 0.8], seed: 86 },   // tiny fixed sky stars
  },

  // ---- skyline on the far shore -------------------------------------------------------------------------------
  skyline: {
    seed: 8686,
    near: { z: -70, x: [-190, 190], width: [7, 16], gap: [0, 2.5], height: [7, 17], towers: { share: 0.2, height: [20, 29] } },
    far: { z: -120, x: [-260, 260], width: [10, 22], gap: [0, 4], height: [11, 22], towers: { share: 0.25, height: [25, 36] } },
    farTone: 0.55,              // far layer bodies are lifted toward the horizon glow by this much
    window: { cell: [1.7, 2.4], lit: 0.34, coolShare: 0.3, level: 0.95 },
    flash: 0.42,                // how strongly bursts light the faces
    reflection: { level: 0.5, wobble: [0.85, 1.1, 0.45], ripple: 0.3 },   // mirror image in the water
    beacons: { size: 9, color: "#ff3b30", level: 0.9 },
  },
  barges: { xs: [-78, -44, 0, 44, 78], z: 0, w: 9, h: 1.3, d: 4, lamp: "#ffd9a0" },

  // ---- star sprites -------------------------------------------------------------------------------------------
  stars: {
    halo: 0.62,                 // colour halo gain
    haloFall: 5.0,              // gaussian fall-off of the halo
    core: 1.2,                 // white-hot core gain
    coreFall: 34,
    twinkleHz: 18,
    reflection: { squash: 0.2, dim: 0.3, stretch: [0.85, 4.2], wobble: [1.3, 1.2, 0.5] },
  },

  // ---- shell defaults (shells.js) -------------------------------------------------------------------------------
  shells: {
    seed: 86,
    rise: 1.1,                  // launch -> burst (s)
    riseDrag: 1.7,              // drag constant of the lift (higher = more braking near the apex)
    drag: 5.0,                  // star drag k (1/s): 95 % of the way to its target after 3 / k s
    gravity: 2.4,               // droop (m/s^2 before drag): terminal sink = gravity / drag
    life: 2.5,                  // star life (s)
    fadePow: 1.0,                // brightness = (1 - u^2)^fadePow, u = tau / life: holds, then dies
    size: 34,                   // star sprite diameter (px at 1080p)
    spacing: 1.25,             // metres between stars along a planned line
    depth: 0.05,                // z spread of the shape plane, x R
    ghosts: 4, ghostStep: 0.028, ghostFall: 0.5,    // short streak behind each star (same closed form, earlier time)
    hot: 1.2,                   // extra brightness right after the burst
    glitter: 0.45, glitterStart: 0.55,   // twinkle amount, and the share of a star's life after which it starts
    comet: { size: 15, ghosts: 7, ghostStep: 0.022, color: "#ffe9c0", sparks: 62, sparkLife: [0.3, 0.75], sparkSize: 7.5, sparkColor: "#ffb24a", sparkDrift: 1.3, sparkGravity: 7 },
    flash: { size: 330, life: 0.26, level: 0.95 },
    light: { hit: 0.9, hitFall: 5, hang: 0.3 },     // flash light on sky / skyline: hit x e^(-fall tau) + hang x (1 - tau / life)
    // temperature: what T does to a shell (see shells.js heat())
    heat: {
      sigma: 0.085, sigmaPow: 1.6,     // per-star target noise = sigma x T^pow x R
      scatter: [1.0, 1.6],            // T range over which the plan dissolves into a random ball
      take: { pow: 1.5, turn: 0.38, stretch: 0.22, shear: 0.25 },   // per-shell variation of the shape, x T^pow
      hue: [0.5, 1.6, 1.6],           // share of stars taking another palette colour: ((T - a) / (b - a))^p
      speed: 0.35,                    // drag variation x T
      crackle: 1.2,                   // shells at or above this T crackle (twinkle all life + crackle sound)
    },
    confetti: ["pink", "gold", "cyan", "violet", "green", "red", "white"],
  },

  // ---- caption + temperature gauge (overlay, exact colours) over the water ---------------------------------------
  caption: {
    x: 430, y: 880, w: 1060, h: 150, cap: 46,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 600, spacing: 1,
    ink: "#fbf3e2", panel: "rgba(6,8,24,0.72)", edge: "rgba(255,255,255,0.14)", radius: 26,
    gauge: { y: 112, w: 430, h: 10, knob: 13, small: 23, title: "TEMPERATURE", cold: "#3fdcff", warm: "#ffc64a", hot: "#ff4a36", max: 1.8 },
  },

  sound: {
    lift: { gain: 0.16, pitch: 1.5, dur: 0.22 },
    whistle: { gain: 0.05, pitch: [2.4, 3.3] },
    boom: { gain: 0.42, pitch: 0.72, dur: 0.75 },
    tail: { gain: 0.15, dur: 1.3, pitch: 1.15 },      // rumble after the boom
    air: { gain: 0.1, dur: 0.9, pitch: 0.55 },       // whoosh-out of the burst
    crackle: { count: 12, window: [0.25, 1.5], gain: [0.04, 0.09], pitch: [0.8, 1.7], hiss: 0.08 },
    shimmer: { gain: 0.06, pitch: 1.1 },              // soft sparkle on a crisp (cool) burst
    bed: { gain: 0.15, root: 73.4, brightness: 520 },
    crowd: { gain: 0.042, density: 0.5, pitch: 0.9 },
  },
  sfx: { enter: "thud", exit: "whooshOut", move: "riser", land: "thud", emphasis: "sparkle", ui: "click", bed: "pad" },
  motion: [
    "Lift: the shell leaves a barge with a thump and climbs on a braking curve (linear drag) to its apex, trailing gold sparks that fall and fade.",
    "Burst: every star flies from the burst centre to its own target point of the planned shape: p = C + D(1 - e^(-k tau)), fast then settling; a short streak follows it.",
    "Hang: once the shape has formed the stars sink slowly (gravity over drag), glitter and fade; the shape droops as it dies.",
    "Temperature: the same shell at a higher T lands looser, turned and stretched, in more colours; past the threshold it is plain scatter and it crackles.",
    "Light: each burst flashes white, then lights the sky, the skyline and the water in its colour; reflections are squashed, streaked mirror images.",
    "Camera: locked. The bursts are the motion.",
  ],
};
