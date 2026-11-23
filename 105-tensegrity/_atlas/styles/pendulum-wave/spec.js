// styles/pendulum-wave/spec.js — STYLE_SPEC for "Pendulum Wave". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the plan + score) and the browser.
// Units: metres, toy scale (balls 0.43 m across, the row is 7 m long) so one ball still reads at 1080p.
//
// The look: a classic pendulum-wave demonstration on a bright bench. A row of large glossy balls, rainbow by index,
// hangs on V-strings from a curved wooden beam on two A-frames; every string is a little shorter than the last.
// wave.js plans every angle, every trail ghost, every tick and the freeze-frames from one closed form.

export const STYLE_SPEC = {
  id: "pendulum-wave",
  name: "Pendulum Wave",
  description:
    "A classic pendulum-wave demonstration on a bright, cool-white bench: a row of 15 large glossy balls, saturated rainbow by index, hangs on V-strings from a curved wooden beam carried by two A-frames, each pendulum a little shorter than the last. Pendulum k completes (N + k) swings in one cycle, so released together from a wooden plank they drift into a travelling snake wave, split into groups, look like chaos, and then all return to one line at the same instant, where the plank catches them. Everything is a closed form of t (wave.js): angles, string lengths (from the periods), motion-trail ghosts (the same formula at earlier times), a lamp on the bench under each ball that flashes at its centre crossing, and one pitched bar note per crossing, so the sound goes from a chord strike to a ripple and back to a unison. A planned clock can freeze the motion: a camera flash, and the frozen positions fly down into an overlay 'fingerprint' card.",
  palette: {
    bg: "#e8eef2",
    bench: "#dde5ea",
    slot: "#8b98a3",
    wood: "#d9a35f",
    woodDark: "#a8743a",
    string: "#39424e",
    ink: "#1c2430",
    plate: "#ffffff",
    edge: "#1c2430",
    // one colour per pendulum, longest (slowest, lowest note) first
    balls: ["#e3242b", "#f04e1b", "#f97a12", "#f9a20c", "#f2c40a", "#b4cf18", "#5bbb2c", "#1daa57", "#10a391", "#1299c4", "#1b7be0", "#3560e6", "#5a47de", "#8a39d3", "#bb2cbe"],
  },
  world: {
    background: "#e8eef2",
    fog: { color: "#e8eef2", near: 22, far: 60 },
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",   // keeps the rainbow saturated (ACES greys the yellows and whitens the reds)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#dde5ea", roughness: 0.92, metalness: 0 },
    slot: { type: "standard", baseColor: "#8b98a3", roughness: 0.9, metalness: 0 },
    wood: { type: "standard", baseColor: "#ffffff", roughness: 0.6, metalness: 0 },          // map added in style.js (kit woodTexture)
    plank: { type: "standard", baseColor: "#c98f4c", roughness: 0.62, metalness: 0 },
    ball: { type: "physical", baseColor: "#ffffff", roughness: 0.3, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.18 },   // x instance colour
    string: { type: "standard", baseColor: "#39424e", roughness: 0.8, metalness: 0 },
    brass: { type: "physical", baseColor: "#d9ae58", roughness: 0.3, metalness: 1 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#c9d3da", intensity: 1.15 },
    {
      id: "key", type: "directional", color: "#fff6ea", intensity: 2.3, position: [-3.5, 10, 6.5], target: [0, 0.5, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 6.2, near: 0.5, far: 30, bias: -0.0004, normalBias: 0.02 },
    },
    { id: "rim", type: "directional", color: "#dbe8ff", intensity: 0.5, position: [4, 5, -6], target: [0, 0.6, 0] },
  ],
  post: {
    vignette: { darkness: 0.2, offset: 1.2 },
  },
  camera: { fov: 32, near: 0.3, far: 90, drift: { amp: 0, speed: 0.2 } },   // locked during holds
  text: { font: "sans", weight: 700, color: "#1c2430", height: 0.4 },

  // ---- the rig (every number wave.js and style.js need) -----------------------------------------------------------
  rig: {
    count: 15,
    swings0: 16,           // pendulum k completes swings0 + k swings in one cycle (16: length ratio 3.5, frame not too steep)
    spacing: 0.5,          // along X; pendulum 0 (longest) at the -X end
    ballRadius: 0.215,
    ballY: 0.52,           // rest height of the ball centres above the bench
    lengthMin: 0.9,        // shortest pendulum (pivot line -> ball centre); the others follow from the periods
    reach: 0.62,           // release displacement along Z, the same for every ball (released from one straight plank)
    vHalf: 0.19,           // half-width of each V of strings at the beam
    stringRadius: 0.009,
    hanger: { drop: 0.32, rod: 0.016, bar: 0.014 },   // each V hangs from its own level brass bar under the curved beam
    beam: { height: 0.16, depth: 0.14, over: 0.5 },
    aframe: { spreadTall: 1.95, spreadShort: 1.05, leg: 0.12, foot: 0.08 },
    plank: { height: 0.66, thickness: 0.045, y0: 0.2, drop: 0.95, dropDur: 0.14, lead: 0.04, over: 0.3 },
    trail: { ghosts: 7, step: 0.011, shrink: 0.075, opacity: 0.3, lighten: 0.3 },   // ghost j = the same formula at tau - j * step * rate
    lamp: { radius: 0.12, y: 0.012, decay: 0.1, dim: 0.72 },                          // dim = mix toward the bench colour when idle
  },
  wood: { seed: 96, boards: 2, dark: "#b9813f", mid: "#d9a35f", light: "#edc387", seam: "#9c6a31", contrast: 0.4, grainFreq: 14, perMetre: 0.5 },

  // ---- overlay caption (top centre) and fingerprint cards (bottom corners) -----------------------------------------
  caption: {
    x: 960, y: 54, h: 112, cap: 62, maxW: 1240,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#ffffff", edge: "#1c2430", ink: "#1c2430",
  },
  card: {
    w: 620, h: 230, margin: 64, radius: 22,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700, cap: 38,
    plate: "#ffffff", edge: "#1c2430", ink: "#1c2430", rule: "#b7c2cb", stem: "#9aa7b2",
    dot: 13, padX: 56, midY: 142, swing: 50,          // px: dot radius, first/last dot inset, centre line, +-reach
    fly: 0.55, stagger: 0.018, flash: 0.32, flashPeak: 0.55,
  },

  sound: {
    // one bar note per centre crossing; pitch by index (G major pentatonic from G3, longest pendulum = lowest)
    scale: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33],
    root: 196,
    tick: { gain: 0.085, dur: 0.38, decay: 0.085, mallet: 0.3 },
    release: { gain: 0.5 },
    shutter: { gain: 0.5 },
    catch: { gain: 0.6 },
    pad: { gain: 0.22, root: 98, chord: [0, 7, 14, 19], brightness: 800 },
  },
  sfx: { enter: "clack", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "marimba", ui: "click", bed: "pad" },
  motion: [
    "Pendulum k: angle = A_k cos(2 pi (N + k) tau / T); A_k = asin(reach / L_k) so every ball leaves the same straight plank.",
    "String lengths come from the periods: L_k = Lmin ((N + n - 1) / (N + k))^2.",
    "tau(t) is a planned clock (piecewise-linear rate, closed form and invertible): it can slow to a freeze-frame and resume.",
    "Trails are the same formula at earlier tau, scaled by the clock rate, so they vanish in a freeze. Nothing accumulates.",
    "At tau = T every ball is back at the plank with zero speed; the plank rises and holds them: start state = end state.",
    "Camera: one move per beat, locked during holds; end-on for the snake, high front for the frozen patterns.",
  ],
};
