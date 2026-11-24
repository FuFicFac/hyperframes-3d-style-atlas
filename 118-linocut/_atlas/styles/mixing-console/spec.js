// styles/mixing-console/spec.js — STYLE_SPEC for "Mixing Console". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the mix plan, SCORE, shots) and the browser.
// Units: metres (the console is ~1.3x real size so tape labels and meter faces read at 1080p), Y-up, sRGB hex, radians.
//
// The look: a vintage analogue recording console shot close and low across its surface — brushed-aluminium channel
// strips between walnut end-cheeks, long-throw faders, coloured rotary knobs with pointer lines, square lit push
// buttons, LED bargraphs, a meter bridge of needle VU meters with warm backlit cream faces, white console tape with
// hand-written channel names, a jog wheel, and a tape machine turning its reels behind, out of focus.
// Settings are physical: mixplan.js turns parameter tracks into control positions and the planned signal into meter
// readings (closed-form needle ballistics) — and into the sound, so what you hear is what the meters show.

export const STYLE_SPEC = {
  id: "mixing-console",
  name: "Mixing Console",
  description:
    "A vintage analogue recording console shot close and low across its surface in warm studio light: brushed-aluminium channel strips between walnut end-cheeks, long-throw faders, coloured rotary knobs with pointer lines, lit square push-buttons, LED bargraphs, a meter bridge of needle VU meters with warm backlit cream faces, white console tape with hand-written channel names, a jog wheel, and tape reels turning behind in shallow focus. Settings made physical: every control is a labelled parameter — faders glide to planned values (grouped, as if automated), knobs click through detents, buttons latch and light — and the meters respond with real needle ballistics to each channel's level x fader; a master meter sums the mix, solo and mute change it, an EQ knob reshapes a curve display. The sound is the mix: each channel is a synthesized layer whose loudness follows its fader.",
  palette: {
    bg: "#4a3527",
    alu: "#cfccc4",
    aluDark: "#9d9a93",
    legend: "#26252a",
    legendRed: "#b3362b",
    walnut: { dark: "#3b2216", mid: "#61391f", light: "#8a5733" },
    leather: "#2d1f18",
    bridge: "#2c2b29",
    knobs: { gain: "#c3372c", hi: "#2f6cb4", mid: "#3e8d57", lo: "#d68a2a", pan: "#e7e0cd", aux: "#e7e0cd", master: "#c3372c" },
    faderCap: "#2a2a2c",
    faderMaster: "#b8322a",
    vuFace: "#f2e2bb",
    vuInk: "#2a2420",
    vuRed: "#c0392b",
    tape: "#f3f0e6",
    marker: "#1d1d24",
    led: { green: "#3ee05a", amber: "#ffb21e", red: "#ff3c2a" },
    mute: "#ff9a1f",
    solo: "#7cf06a",
    play: "#57e35e",
    wall: "#5b4130",
  },
  world: {
    background: "#4a3527",
    environment: "room",
    environmentIntensity: 0.5,     // brushed aluminium, knob clearcoat and meter glass need something to reflect
    toneMapping: "neutral",        // keeps the cream VU faces and knob colours as designed (ACES greys them)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    walnut: {
      type: "physical", baseColor: "#ffffff", roughness: 0.42, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.3,
      map: { source: "wood", size: 512, boards: 1, seed: 47, grainFreq: 14, grainWarp: 1.6, contrast: 0.35, dark: "#3b2216", mid: "#61391f", light: "#8a5733", description: "oiled walnut end-cheek grain" },
    },
    leather: { type: "physical", baseColor: "#2d1f18", roughness: 0.62, metalness: 0, sheen: 0.4 },
    bridge: { type: "standard", baseColor: "#2c2b29", roughness: 0.55, metalness: 0.35 },
    body: { type: "standard", baseColor: "#3a3633", roughness: 0.6, metalness: 0.2 },
    slot: { type: "standard", baseColor: "#121212", roughness: 0.8, metalness: 0 },
    skirt: { type: "physical", baseColor: "#1e1e20", roughness: 0.35, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3 },
    faderCap: { type: "physical", baseColor: "#2a2a2c", roughness: 0.42, metalness: 0, clearcoat: 0.3 },
    faderMaster: { type: "physical", baseColor: "#b8322a", roughness: 0.4, metalness: 0, clearcoat: 0.3 },
    pointer: { type: "standard", baseColor: "#f4f1ea", roughness: 0.5, metalness: 0 },
    bezel: { type: "standard", baseColor: "#1b1a19", roughness: 0.4, metalness: 0.5 },
    chrome: { type: "standard", baseColor: "#d9dadc", roughness: 0.18, metalness: 1 },
    alu: { type: "standard", baseColor: "#c9c6bf", roughness: 0.34, metalness: 0.85 },
    reelAlu: { type: "standard", baseColor: "#cfd0d2", roughness: 0.28, metalness: 0.9 },
    tapePack: { type: "standard", baseColor: "#3a2a20", roughness: 0.45, metalness: 0.1 },
    rubber: { type: "standard", baseColor: "#1a1a1a", roughness: 0.85, metalness: 0 },
    wall: {
      type: "standard", baseColor: "#ffffff", roughness: 0.8, metalness: 0,
      map: { source: "wood", size: 512, boards: 6, seed: 53, grainFreq: 10, grainWarp: 1.3, contrast: 0.3, dark: "#4a3121", mid: "#6a4630", light: "#86593a", seam: "#2a1b12", description: "vertical wood slat studio wall" },
    },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#fff0da", groundColor: "#5e4a3a", intensity: 1.15 },
    {
      // warm key from above-front-right: knobs and fader caps throw short soft shadows up the strips
      id: "key", type: "directional", color: "#ffe1b8", intensity: 2.7, position: [1.6, 3.2, 2.4], target: [0, 0, -0.1],
      shadow: { softness: 4, mapSize: 4096, extent: 1.15, near: 0.5, far: 9, bias: -0.0002, normalBias: 0.006 },
    },
    { id: "fill", type: "directional", color: "#ffd2a0", intensity: 0.7, position: [-2.4, 1.6, 1.8], target: [0, 0, 0] },
    // warm practical behind: rims the meter bridge and the tape machine so they separate from the wall
    { id: "rim", type: "spot", color: "#ffbf7a", intensity: 9, position: [-0.6, 1.6, -2.3], target: [0.1, 0.2, -1.0], angle: 0.9, penumbra: 0.7, distance: 0, decay: 2 },
    { id: "wallwash", type: "point", color: "#ffb36b", intensity: 2.2, position: [0.9, 1.1, -2.0], distance: 0, decay: 2 },
  ],
  post: {
    bloom: { strength: 0.22, radius: 0.35, threshold: 2.6 },   // lit buttons, LEDs and the EQ trace glow; the lit alu does not
    vignette: { darkness: 0.28, offset: 1.05 },
  },
  dof: { aperture: 0.0022, maxblur: 0.005 },                 // BokehPass: the reels and the wall go soft, the console stays readable
  camera: { fov: 30, near: 0.25, far: 12, drift: { amp: 0.0025, speed: 0.22 } },
  text: { font: "sans", weight: 700, color: "#26252a", height: 0.03 },

  // ---- console geometry (panel space: x across, z toward the viewer, y up; see mixplan.consoleLayout) -------------
  console: {
    stripW: 0.15, masterW: 0.4, depth: 0.95, slope: 0.157, origin: [0, 0, 0],
    plate: 0.012,               // faceplate thickness
    tapeH: 0.05,
    cheekW: 0.06, cheekRise: 0.05,
    armrest: { r: 0.042, gap: 0.012 },
    fascia: 0.3,                // front body height below the panel
    bridge: { h: 0.2, d: 0.24, tilt: 1.19, thick: 0.02 },
    ppm: 2000,                  // faceplate artwork pixels per metre
    brush: { seed: 7, streak: 0.045, fine: 0.03 },
  },
  strip: {
    z: { tape: 0.425, faderBottom: 0.375, faderTop: 0.075, buttons: -0.005, pan: -0.08, lo: -0.155, mid: -0.23, hi: -0.305, gain: -0.385 },
    x: { fader: 0.018, led: -0.043, mute: -0.03, solo: 0.03, knob: 0 },
    knobs: ["gain", "hi", "mid", "lo", "pan"],
    legends: { gain: "GAIN", hi: "HI", mid: "MID", lo: "LO", pan: "PAN" },
  },
  knob: {
    capFinish: { roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.35 },
    skirt: { r: 0.022, h: 0.01 }, cap: { r: 0.0165, rTop: 0.0145, h: 0.017 }, pointer: { w: 0.0022, h: 0.0012 },
    range: 2.6,                  // total sweep (rad), centred on "12 o'clock" (toward the back of the strip)
    kinds: {
      gain: { min: 0, max: 1, detents: 21 },
      hi: { min: -1, max: 1, detents: 21 },
      mid: { min: -1, max: 1, detents: 21 },
      lo: { min: -1, max: 1, detents: 21 },
      pan: { min: -1, max: 1, detents: 21 },
    },
  },
  fader: { slot: { w: 0.007, d: 0.004 }, cap: { w: 0.036, h: 0.02, d: 0.024, radius: 0.004 }, line: 0.0022 },
  button: { size: 0.026, h: 0.011, radius: 0.003, depth: 0.004, latch: 0.0022, lit: 1.6, unlit: 0.0, dim: 0.16, travel: { down: 0.05, up: 0.12 } },
  led: { n: 12, segH: 0.0145, gap: 0.006, w: 0.012, d: 0.004, lit: 2.4, off: 0.07, peakLit: 2.8 },
  vu: {
    w: 0.124, h: 0.088, bezel: 0.008, depth: 0.03, px: 512,
    master: { w: 0.19, h: 0.12 },
    sweep: 0.86,                // needle half-angle (rad) from straight up
    backlight: 0.32,            // emissive strength of the cream face
    needle: { len: 0.82, w: 0.0016 },   // length as a fraction of the face height (pivot below the face)
  },
  eqDisplay: { w: 0.15, h: 0.12, px: 512, glass: "#0e130f", grid: "#2a3b2a", curve: "#ffb347", text: "#d9c9a2", glow: 2.2 },
  jog: { r: 0.055, h: 0.018 },
  tapeLabel: { font: '"Marker Felt", "Chalkboard SE", "Bradley Hand", "Noteworthy", sans-serif', weight: 400, ink: "#1d1d24", cap: 0.034, px: 3000 },
  tapeMachine: {
    at: [0.12, -0.12, -1.75], w: 1.5, h: 0.98, d: 0.32,
    reel: { r: 0.22, hub: 0.045, packMin: 0.07, packMax: 0.19, x: 0.4, y: 0.62 },
    speed: 2.1,                 // tape speed (m/s at the pack edge -> reel angular speed = speed / pack radius)
  },
  wall: { z: -2.7, w: 9, h: 5 },

  // ---- the mix (mixplan.js reads these) ----------------------------------------------------------------------
  mix: {
    tempo: 120,
    law: [[0, null], [0.06, -60], [0.25, -30], [0.45, -15], [0.6, -7], [0.75, 0], [1, 10]],   // null = -infinity (JSON-safe)
    trimRange: 12,
    faderEase: "inOutCubic",
    faderSettle: { amp: 0.03, freq: 3.4, decay: 7.5 },     // motorised fader arriving: a small damped wobble
    padSlice: 0.25,
    window: 3.0,                                          // seconds of past notes a meter sums
    vu: { f0: 1.9, zeta: 0.6 },                           // VU movement: ~300 ms rise, ~9 % overshoot
    led: { f0: 9, zeta: 0.78, hold: 1.0 },                 // LED: fast, peak hold 1 s
    vuFace: { zero: 0.708, peg: 1.06, marks: [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3] },
    ledFace: { n: 12, floor: -27, stepDb: 2.5, amber: 8, red: 10 },
    master: { fader: 0.75, meter: 0.3 },
    eq: { range: 12, fMin: 30, fMax: 18000, lo: { hz: 120, slope: 2.4 }, mid: { hz: 1200, width: 0.9 }, hi: { hz: 6500, slope: 2.4 } },
    // a four-bar loop: chord roots in semitones from A; keys tones from A4; pad intervals from the root
    progression: [
      { name: "Am", root: 0, keys: [0, 3, 7], pad: [0, 3, 7, 12] },
      { name: "F", root: -4, keys: [-4, 0, 3], pad: [0, 4, 7, 12] },
      { name: "C", root: 3, keys: [3, 7, 10], pad: [0, 4, 7, 12] },
      { name: "G", root: -2, keys: [-2, 2, 5], pad: [0, 4, 7, 12] },
    ],
    // channel kinds: pattern on 8th-note steps, meter-input envelope (decay 1/s or sustain), band the voice sits in
    kinds: {
      kick: { steps: [0, 3, 4], vel: [1, 0.7, 0.95], decay: 9, bandHz: 80, meter: 1.7 },
      snare: { steps: [2, 6], vel: [1, 1], decay: 11, bandHz: 2000, meter: 2.6 },
      hats: { steps: [0, 1, 2, 3, 4, 5, 6, 7], vel: [0.55, 1, 0.6, 1, 0.55, 1, 0.6, 1], decay: 24, bandHz: 9000, meter: 3.0 },
      bass: { steps: [0, 2, 3, 4, 6, 7], vel: [1, 0.8, 0.9, 1, 0.8, 0.85], notes: [0, 0, 12, 0, 7, 12], decay: 5, bandHz: 110, meter: 1.05 },
      keys: { steps: [0, 5], vel: [1, 0.75], decay: 1.6, bandHz: 600, airHz: 9000, meter: 1.35 },
      pad: { sustain: true, bandHz: 400, meter: 1.3 },
    },
    // the synthesized layer of each kind (kit VOICES); gain = note gain x this level
    voices: {
      kick: { gain: 0.5, dur: 0.34, pitch: 1 },
      snare: { gain: 0.32, dur: 0.17, density: 0.95, pitch: 0.82, body: 0.45, bodyDur: 0.12, bodyPitch: 2.4 },
      hats: { gain: 0.17, dur: 0.035, pitch: 1.6 },
      bass: { gain: 0.5, dur: 0.22, grit: 0.04, base: 110 },
      keys: { gain: 0.3, dur: 1.6, base: 440, air: 0.55, airDur: 0.9 },
      pad: { gain: 0.3, base: 110, attack: 0.35, release: 0.5, xfade: 0.12, brightness: 900 },
    },
    controls: {
      fader: { hz: 70, hz2: 96, grit: 0.25, gain: 0.05 },
      button: { pitch: 1.7, gain: 0.22 },
      detent: { pitch: 1.25, gain: 0.07 },
    },
  },

  // ---- overlay: one caption card (exact colours) + the SAMPLE DATA stamp ------------------------------------------
  caption: { x: 96, y: 64, h: 92, cap: 46, font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700, card: "#f6efe0", ink: "#26252a", rule: "#c3372c" },
  stamp: { text: "SAMPLE DATA", x: 96, y: 178, align: "left", cap: 24, color: "#c0392b", card: "rgba(246,239,224,0.9)", font: '"Avenir Next Condensed", "Helvetica Neue", Arial, sans-serif' },

  sfx: { enter: "click", exit: "whooshOut", move: "whir", land: "clack", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Faders glide to planned values as automation: a group of faders starts, moves and lands together, with a tiny motorised settle.",
    "Knobs turn through detents (dwell, snap, tick); buttons press down, latch and light (mute amber, solo green).",
    "Meters respond: each VU needle and LED column is the closed-form 2nd-order response to its channel's planned notes x fader; the master meter sums the channels.",
    "Solo one channel and every other meter falls; mute one and the master reading drops — the sound follows exactly.",
    "EQ beat: a HI/MID knob turns and the curve display reshapes on the meter bridge.",
    "Camera: low and close across the surface, sliding along the strips to whatever is being adjusted; a wide at the end.",
  ],
};
