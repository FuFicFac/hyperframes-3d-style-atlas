// styles/bullet-time/spec.js — STYLE_SPEC for "Bullet Time" (a frozen moment). Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the time warp + splash plan) and the browser.
// Units: metres, seconds of WORLD time. The set is toy-scale exaggerated (a 2.9 m bowl, a 0.44 m ball) so droplets of a
// few centimetres read at 1080p and the splash plays out over about a second of world time at real gravity.
//
// The look: a bright white high-speed-photography studio (pale calibration-grid floor, white haze, four softboxes on
// stands). A striped orange ball bounces in and drops into a big white bowl of cobalt-blue liquid. Everything in the
// world is a closed-form function of WORLD time w; the video's clock t is mapped to w by timewarp.js (run, freeze,
// reverse, forward, release) while the camera follows its own, never-stopping arc.

export const STYLE_SPEC = {
  id: "bullet-time",
  name: "Bullet Time",
  description:
    "A frozen moment: in a bright white high-speed-photography studio a striped orange ball bounces in and drops into a big white bowl of cobalt-blue liquid, and mid-splash TIME STOPS — the crown, its beaded rim, the spray of droplets and the ripples hang perfectly still while the camera keeps sweeping a near-full circle around them. Two clocks: timewarp.js maps video time t to WORLD time w(t) (run, freeze, reverse, forward, release, with linear rate ramps, so w is piecewise quadratic and exact), and separately lays out the camera arc. Every world thing — the ball's bounce and plunge, the lathe-profile crown with pinching lobes, ballistic droplets, floor splats, the cavity, ripples and the rebound jet — is a closed-form function of w, never stepped, so time can be scrubbed backward (the splash un-happens) and forward again. Sound follows w: every bounce, impact, pinch and droplet landing is cued wherever w(t) crosses it (reversed re-crossings included), with jog ticks while scrubbing and a pitch-dropping whir into the freeze. A two-track overlay gauge (CAMERA vs WORLD) shows the decoupling.",
  palette: {
    bg: "#f3f5f8",
    floor: "#eef1f5",
    grid: "#cfd6e0",
    gridMajor: "#aab4c3",
    ceramic: "#fbfbf8",
    liquid: "#1f56e6",
    liquidDeep: "#123a9e",
    ball: "#ff5a1f",
    ballStripe: "#fff4e6",
    housing: "#5b6370",
    stand: "#7b8492",
    softbox: "#ffffff",
    ink: "#14171c",
    chip: "#14171c",
    chipInk: "#ffffff",
    accent: "#ff5a1f",
    track: "#3a4150",
    world: "#3f7bff",
  },
  world: {
    background: "#f3f5f8",
    fog: { color: "#f3f5f8", near: 13, far: 46 },
    environment: "room",
    environmentIntensity: 0.75,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    floor: { type: "standard", baseColor: "#ffffff", roughness: 0.82, metalness: 0 },
    ceramic: { type: "physical", baseColor: "#fbfbf8", roughness: 0.22, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.15 },
    liquid: { type: "physical", baseColor: "#1f56e6", roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, side: "double" },
    droplet: { type: "physical", baseColor: "#2a62f0", roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 },
    splat: { type: "physical", baseColor: "#2458e0", roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 },
    ball: { type: "physical", baseColor: "#ffffff", roughness: 0.3, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.12 },
    housing: { type: "standard", baseColor: "#5b6370", roughness: 0.6, metalness: 0.1 },
    stand: { type: "standard", baseColor: "#7b8492", roughness: 0.45, metalness: 0.5 },
    softbox: { type: "standard", baseColor: "#ffffff", roughness: 0.9, metalness: 0, emission: { color: "#ffffff", strength: 1.15 } },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#dfe5ee", intensity: 1.05 },
    {
      id: "key", type: "directional", color: "#fffaf2", intensity: 2.5, position: [3.5, 9, 4.5], target: [-0.4, 0.6, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 5.2, near: 0.5, far: 30, bias: -0.0006, normalBias: 0.03 },
    },
    { id: "rim", type: "directional", color: "#eaf2ff", intensity: 0.9, position: [-5, 5, -5], target: [0, 1, 0] },
  ],
  post: {
    vignette: { darkness: 0.16, offset: 1.2 },
  },
  camera: { fov: 35, near: 0.3, far: 90, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#14171c", height: 0.4 },

  // ---- the set ----------------------------------------------------------------------------------------------
  floor: { size: 90, cell: 0.5, major: 4, line: 3 },         // calibration grid: 0.5 m cells, every 4th line heavier
  softboxes: { n: 4, radius: 10.5, az0: 0.785, w: 2.0, h: 2.6, d: 0.35, y: 3.3, tilt: 0.16 },
  bowl: { footR: 0.82, rimR: 1.45, rimY: 0.95, wall: 0.1, curve: 0.6, liquidY: 0.85, liquidR: 1.325, segments: 96 },
  ball: {
    r: 0.22, dip: 0.6,          // ball centre is dip x r above the surface at w = 0
    bounceW: -0.9,              // world time of the floor bounce before the plunge
    vx: 2.4,                    // m/s toward the bowl (the ball comes in from -x)
    restitution: 0.8, spin: -9, // rad/s about z while flying
    sinkTau: 0.19, driftTau: 0.06, spinTau: 0.12,
  },
  // ---- the splash (timewarp.js createSplash; all times are world seconds after impact) -------------------------
  crown: {
    r0: 0.34, spread: 0.75,      // base radius = r0 + spread x sqrt(w)
    height: 1.0, life: 0.9, riseExp: 0.5, fallExp: 1.3,   // height = height x beta-bump(w / life)
    lean: 0.42, leanExp: 1.4,    // outward lean of the wall
    lobes: 13, lobeAmp: 0.42, lobeBias: 0.35, lobeSharp: 2.2, lobeIn: [0.05, 0.3], lobePhase: 0.6,
    thBase: 0.075, thTop: 0.026, bead: 0.036, foot: 0.11, sink: 0.05, swell: 0.07,
    steps: 12, cap: 6, segments: 130,
  },
  cavity: { depth: 0.34, life: 0.6, riseExp: 0.6, fallExp: 1.4 },
  ripples: { amp: 0.034, k: 9, omega: 14, reach: 0.7, hold: 0.6, decay: 0.8, rings: 56, segments: 96 },
  jet: { start: 0.5, life: 1.0, height: 1.45, riseExp: 0.7, fallExp: 1.2, base: 0.34, neck: 0.085, bulb: 0.065, pinch: 0.82, dropR: 0.105, steps: 26, segments: 32 },
  droplets: {
    seed: 76,
    lobe: { pinch: [0.2, 0.3], r: [0.058, 0.084], out: [0.3, 0.9], up: [0.7, 1.5], swirl: 0.3 },
    second: { delay: [0.07, 0.13], r: [0.036, 0.052], out: [0.2, 0.6], up: [0.2, 0.8] },
    spray: { n: 46, launch: [0.004, 0.07], speed: [2.6, 4.9], elev: [0.7, 1.3], r: [0.022, 0.052], ring: [0.9, 1.25] },
    stretch: 0.045, stretchMax: 1.35,   // elongation along velocity: 1 + stretch x speed, capped
    growIn: 0.03, splatScale: 2.4, splatIn: 0.05,
  },

  // ---- overlay: caption chip (bottom-left) + two-clock gauge (bottom-right) -----------------------------------
  caption: { x: 96, y: 916, h: 88, cap: 44, maxW: 800, font: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: 700 },
  gauge: {
    x: 1204, y: 890, w: 620, h: 122, label: 21, barH: 14, pad: 22, labelW: 118, iconW: 44,
    font: '"Helvetica Neue", Helvetica, Arial, sans-serif', names: ["CAMERA", "WORLD"],
  },

  sound: {
    bed: { root: 110, chord: [0, 7, 12, 16], brightness: 820, gain: 0.5 },
    bounce: { thud: 0.5, tick: 0.2 },
    impact: { squish: 0.85, thud: 0.6, whoosh: 0.4, reverse: 0.45 },
    plip: { gain: 0.22, pitch: [2.4, 1.1] },
    splat: { gain: 0.16 },
    pinch: { gain: 0.07 },
    jet: { gain: 0.3 },
    ramp: { hz: 70, span: 330, gain: 0.34 },
    tick: { gain: 0.1, step: 0.03, minRate: 0.03, maxRate: 0.6 },
    freeze: { gain: 0.22 },
    slowPitch: 0.6,             // event pitch multiplier as the world rate goes to 0 (1 at full speed)
  },
  sfx: { enter: "thud", exit: "whooshOut", move: "servo", land: "bubble", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Two clocks: video time t drives the camera; world time w(t) = integral of a piecewise-linear rate (run 1, freeze 0, reverse < 0, forward, release) drives everything else.",
    "Every world object is a closed-form function of w (ballistic droplets, beta-bump crown and jet profiles, travelling ripples): seekable, reversible, never stepped.",
    "The camera never stops: one long Catmull-Rom arc (azimuth, radius, elevation, target) sampled into dense keys; the world freezes inside it.",
    "Sound follows w: each world event is cued wherever w(t) crosses it, forward or reversed; jog ticks every fixed step of w while scrubbing; a gliding whir on every rate ramp.",
  ],
};
