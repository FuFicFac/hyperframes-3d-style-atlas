// styles/wind-walker/spec.js — STYLE_SPEC for "Wind Walker" (a wind-driven walking sculpture on a low-tide beach).
// Plain data only: JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the
// linkage plan + score) and the browser. Units: metres, Y-up, colours sRGB hex, angles radians.
//
// The look: a bright, pale beach at low tide under a blue-white sky. A skeletal creature of pale yellow plastic tubing,
// black cable ties and cloth sails walks across the sand on twelve legs. Every leg is the same planar bar linkage
// (linkage.js: a straight-line four-bar + a pantograph, solved by circle–circle intersections) hung on ONE crankshaft,
// each station a sixth of a turn later, so rigid sticks step in a travelling wave. The opening shows one leg as a
// diagram (ink centre-lines, crank circle, the foot's flat-bottomed loop traced as a glowing path) in sea mist; the mist
// lifts and the whole creature is there, striding, leaving footprints.

export const STYLE_SPEC = {
  id: "wind-walker",
  name: "Wind Walker",
  description:
    "A kinetic walking sculpture on a bright low-tide beach: a skeletal creature of pale plastic tubing, black cable ties and cloth sails whose twelve legs are identical planar bar linkages (a straight-line four-bar feeding a pantograph, solved in closed form by circle–circle intersections) hung on one shared crankshaft, each station a sixth of a turn later, so rigid sticks step in a travelling wave. Body travel and height are locked to the lowest foot, so planted feet do not slide; footprints and step thuds come from the same plan. Opens on ONE leg as a diagram in sea mist (ink centre-lines, crank circle, the foot's flat-bottomed loop traced as a glowing path), then the mist lifts to reveal the whole creature striding across the sand.",
  palette: {
    bg: "#e6eff5",
    mist: "#e6eff5",
    skyTop: "#6fb2ea",
    skyMid: "#a9d2f2",
    sand: "#dcc9a2",
    sandWet: "#c2ad85",
    sandLight: "#ecdcb8",
    print: "#7d6a48",
    sea: "#6fb0d2",
    surf: "#fbfdfd",
    tube: "#f4e3a4",
    tie: "#22262d",
    pin: "#6f7680",
    foot: "#ff6a45",
    sail: "#fffaf0",
    sailCoral: "#ff7d5c",
    sailSun: "#ffcc4d",
    ink: "#17264a",
    inkSoft: "#5a6c94",
    glow: "#ff4a26",
    chip: "#ffffff",
    chipInk: "#17264a",
  },
  world: {
    background: "#e6eff5",
    sky: null,                       // the style draws its own sky dome (world-space gradient + mist veil)
    fog: { color: "#e6eff5", near: 30, far: 230 },
    environment: null,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    sand: { type: "standard", baseColor: "#ffffff", roughness: 0.88, metalness: 0 },
    sea: { type: "standard", baseColor: "#6fb0d2", roughness: 0.35, metalness: 0 },
    tube: { type: "standard", baseColor: "#f4e3a4", roughness: 0.5, metalness: 0 },
    tie: { type: "standard", baseColor: "#22262d", roughness: 0.6, metalness: 0 },
    pin: { type: "standard", baseColor: "#6f7680", roughness: 0.45, metalness: 0.3 },
    foot: { type: "standard", baseColor: "#ff6a45", roughness: 0.7, metalness: 0 },
    sail: { type: "standard", baseColor: "#ffffff", roughness: 0.92, metalness: 0, side: "double" },
    spark: { type: "standard", baseColor: "#ff4a26", roughness: 0.4, metalness: 0, emission: { color: "#ff4a26", strength: 4.5 } },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#dcebff", groundColor: "#e9d3a4", intensity: 1.15 },
    {
      // high sun from the camera side, a little behind the creature's travel: crisp shadows fall away from the camera
      id: "sun", type: "directional", color: "#fff3df", intensity: 2.7, position: [-4.5, 11, 7.5], target: [0, 1, 0],
      shadow: { softness: 2.2, mapSize: 4096, extent: 5.2, near: 1, far: 40, bias: -0.0006, normalBias: 0.02 },
    },
    { id: "bounce", type: "directional", color: "#ffeccb", intensity: 0.35, position: [3, 1.2, 6], target: [0, 1.2, 0] },
  ],
  post: {
    bloom: { strength: 0.5, radius: 0.5, threshold: 2.6 },    // only the glowing foot marker blooms
    vignette: { darkness: 0.16, offset: 1.2 },
  },
  camera: { fov: 32, near: 0.3, far: 700, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#17264a", height: 0.4 },

  // ---- one leg (metres; origin = crank axis; x forward, y up). Lengths found by numeric search, see linkage.js / STYLE.md
  linkage: {
    crank: 0.12,
    pivot: [0.23928, 0.02748],     // rocker pivot P (the frame's lower rail)
    coupler: 0.30828,              // crank pin A -> rocker joint B
    rocker: 0.29484,               // P -> B
    ext: 0.32364,                  // B -> tracer T, along the coupler
    off: -0.02604,                 // T's offset square to the coupler
    hip: [0, 1.2],                 // pantograph pivot H (the ridge rail)
    thigh: 1.5,                    // H -> knee K
    shin: 1.68,                    // K -> foot F
    k: 3,                          // pantograph gain: F = H + k (T − H)
  },
  gait: {
    stations: 6,                   // leg pairs along the crankshaft (fore + aft leg on each crank pin)
    spacing: 0.9,                  // m between stations
    phaseStep: Math.PI / 3,        // crank throw advance per station (the travelling wave)
    contact: 0.006,                // a foot within this of the sand counts as planted
  },
  clock: { theta0: 0, rate: 0.26, ramps: [{ t: 5.8, dur: 2.6, to: 0.44 }] },   // crank turns per second
  hero: { station: 5, side: 1 },   // the leg shown as a diagram (nearest the opening camera)

  build: {
    tubeR: 0.021, railR: 0.028, mastR: 0.022, pinR: 0.011, tieR: 1.55, tieLen: 0.018, tieInset: 0.075,
    layer: 0.05,                   // z slot between sticks of one leg
    crankWeb: 0.2,                 // crank webs sit this far either side of the station plane
    footR: 0.08, footH: 0.035,
    overhang: 0.5,                 // rails run this far past the end stations
  },
  sails: {
    mastBase: 0.0, lean: -0.22, height: [0.95, 0.42],      // mast height = a + b sin(pi (f + .5) / n)
    boomAt: 0.2, boom: 1.22, boomRise: 0.12, gaff: 0.42, yaw: 0.9,   // yaw: boom direction from −x toward +z (rad)
    grid: [8, 12],
    billow: [0.07, 0.3],           // m of belly, calm -> gust
    flutter: 0.035, flutterHz: 1.7,
    colors: ["sail", "sail", "sailCoral", "sail", "sailSun", "sail", "sail"],
    gust: { t: 5.6, dur: 2.2 },
  },
  beach: {
    size: 900, tile: 7, texture: 1024, ripples: 22, rippleWarp: 1.3, rippleDepth: 0.075, blotch: 0.5, bump: 0.5, seed: 79,
    seaZ: -24, seaDepth: 500, surf: 0.9, wetBand: 9,
  },
  sky: { radius: 420, horizon: "#e6eff5", mid: "#a9d2f2", top: "#6fb2ea", cloud: 0.5, seed: 12 },
  mist: { near: 0.35, far: 1.5 },   // opening: fog starts this far BEHIND the hero leg plane and is solid by `far`
  prints: { w: 0.36, d: 0.3, opacity: 0.62, pop: 0.14, y: 0.004 },

  diagram: {
    ink: { bar: 6, ring: 3.5, circle: 3.5, dash: [0.045, 0.035, 0, 0], ray: 2.5, rayDash: [0.07, 0.05, 0, 0] },
    ring: 0.03, pivot: 0.042,
    loop: { width: 7, halo: 22, haloLevel: 0.26, tracer: 3.5 },
    spark: 0.05,
  },
  caption: {
    x: 110, y: 902, h: 96, cap: 46, maxW: 900,
    font: '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif', weight: 700,
  },

  sound: {
    wind: { gain: 0.2, gustGain: 0.45, pitch: 0.42 },
    bed: { root: 110, chord: [0, 7, 12, 16], brightness: 700, gain: 0.14 },
    step: { dur: 0.22, pitch: 1.15, gain: 0.42, grit: 0.1, heroTick: 0.1 },
    creak: { dur: 0.3, hz: 210, gain: 0.07 },
    turn: { pitch: 0.7, gain: 0.07 },
    sail: { gain: 0.3 },
    final: { hz: 440, gain: 0.3 },
  },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "marimba", ui: "tick", bed: "pad" },
  motion: [
    "Every joint of every leg is solved from the crank angle by two circle–circle intersections (straight-line four-bar, then a pantograph); nothing is simulated.",
    "Legs are phase-offset copies along one crankshaft (a sixth of a turn per station, fore and aft legs on each pin): the steps travel along the body as a wave.",
    "The body's forward travel and height are locked to the lowest foot, so a planted foot stays where its print is; footprints appear at each touchdown.",
    "Opening: one leg as a diagram in sea mist (ink centre-lines, crank circle, glowing foot loop); the mist lifts as the wind fills the sails and the camera pulls back to the whole creature.",
  ],
};
