// styles/vortex-rings/spec.js — STYLE_SPEC for "Vortex Rings": a long black-walled glass tank lit from the side; a
// lacquered drum with a round hole at the left end; a felt mallet taps the drum skin and white smoke rings roll out to
// the right against the dark. Plain data only (JSON-serializable, no THREE, no window). Units: metres (toy scale: the
// drum is 3 m across), Y-up, sRGB hex, radians, three.js light units. The ring axis is +X at y = 0, z = 0; the drum
// face (with the hole) is the plane x = 0. The planner (rings.js) reads `rings`; style.js reads the rest.

export const STYLE_SPEC = {
  id: "vortex-rings",
  name: "Vortex Rings",
  description:
    "A black-walled glass tank lit from the side: a red lacquered drum with a round hole fires white smoke rings that roll around their own cores and travel; two rings on the same line change each other — the rear one tightens and threads the front one, which spreads wide.",
  palette: {
    bg: "#030509",
    ink: "#f3f6ff",
    smokeLit: "#fff0da",   // the side-lit half of the smoke: warm white
    smokeShade: "#3d66d6", // the half turned away from the lamp: cold blue
    smokeCore: "#ffffff",
    shell: "#b3241c",      // drum lacquer
    face: "#e9dfca",       // painted drum face round the hole
    brass: "#c99a3c",
    skin: "#efe4c8",
    felt: "#2f6fd0",       // mallet head
    wood: "#6b4a2c",
    wall: "#05070c",
    floor: "#0a0d14",
    sheet: "#24406e",      // where the light sheet grazes the black back wall
    glass: "#9cc4ff",
    lamp: "#ffd9a6",
    primary: "#fff0da",
    secondary: "#4f74c8",
    accent: "#b3241c",
  },
  world: {
    background: "#030509",
    fog: null,
    environment: "room",
    environmentIntensity: 0.1,
    toneMapping: "agx",
    exposure: 1.05,
  },
  materials: {
    shell: { type: "physical", baseColor: "#b3241c", roughness: 0.32, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.3 },
    face: { type: "standard", baseColor: "#e9dfca", roughness: 0.6, metalness: 0 },
    hole: { type: "standard", baseColor: "#07080b", roughness: 0.9, metalness: 0, side: "double" },
    brass: { type: "standard", baseColor: "#c99a3c", roughness: 0.3, metalness: 0.95 },
    skin: { type: "standard", baseColor: "#efe4c8", roughness: 0.75, metalness: 0, side: "double" },
    felt: { type: "standard", baseColor: "#2f6fd0", roughness: 0.95, metalness: 0 },
    wood: { type: "standard", baseColor: "#6b4a2c", roughness: 0.6, metalness: 0 },
    steel: { type: "standard", baseColor: "#3a3f48", roughness: 0.4, metalness: 0.8 },
    floor: { type: "standard", baseColor: "#0a0d14", roughness: 0.55, metalness: 0.1 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#a9bff0", groundColor: "#0a0d14", intensity: 0.35 },
    // the side lamp: a warm sheet from the front-top (the same direction the smoke shader lights from)
    { id: "lamp", type: "directional", color: "#ffe3bd", intensity: 2.2, position: [-2, 7, 6.5], target: [0, 0, 0] },
    // a cold rim from behind so the drum separates from the black
    { id: "rim", type: "directional", color: "#7fa2ff", intensity: 1.3, position: [-6, 3, -6], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.45, radius: 0.35, threshold: 0.8 },
    vignette: { darkness: 0.42, offset: 1.1 },
  },
  camera: { fov: 35, near: 0.3, far: 120, drift: { amp: 0, speed: 0.3 } },
  text: { font: "sans", weight: 700, color: "#f3f6ff", height: 0.4 },
  sfx: { enter: "thud", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "rustle", ui: "click", bed: "pad" },
  motion: [
    "Ring radius and position come from rings.js: thin-ring self-induction plus Biot–Savart induction between the rings, RK4 at load, read back for any t.",
    "Smoke is a cloud of soft sprites, each pinned to (azimuth, roll phase, distance from the core); it rolls around the core at the core's rotation rate.",
    "A tap: the mallet swings in, the skin dimples, a puff leaves the hole and rolls up into a ring within half a second.",
    "Some smoke is shed behind each ring as it travels and hangs in the tank, fading: a short wake.",
    "Camera tracks alongside, pulls back for the second tap, swings round to the front three-quarter view for the threading, then widens.",
  ],

  // ---- the physics (rings.js): two coaxial rings; launch is tap time + launchDelay ----
  rings: {
    nu: 0.001,                  // m^2/s: slow viscous growth of the cores (rings slow a little as they age)
    dt: 1 / 480,
    x0: 0.25,                   // where a ring is born (just in front of the hole)
    soft: { R0: 1.1, a0: 0.2, G: 2.4 },    // a soft tap: big, slow
    hard: { R0: 0.715, a0: 0.13, G: 3.3 }, // a harder tap: smaller, quicker (art-directed initial condition)
    launchDelay: 0.15,
  },

  // ---- the look ----
  smoke: {
    count: 7600,              // sprites per ring
    wake: 0.22,               // share of sprites that are shed into the wake
    rhoMax: 1.6,              // outermost smoke, in core radii
    rhoPow: 1.15,
    size: [0.03, 0.075],      // sprite half-size range (m) at a0 = 0.2; scales with the core
    level: 0.062,             // per-sprite linear level (additive)
    streak: 1.3,              // sprites stretched along the roll direction
    arms: 3, wind: 1.8, armSpread: 0.16, loose: 0.12, // the rolled-up sheet in the cross-section
    lit: 1.3, shade: 0.5,     // lit / shaded side levels
    spinScale: 1.0,           // 1 = the core's solid-body rate G / (2 pi a^2)
    wobble: 0.018,            // low-mode waviness of the ring radius
    form: 0.55,               // s: puff to ring
    wakeLife: 2.0,            // s: a shed wisp fades over this
    wakeDrift: 0.22,          // share of the ring speed a shed wisp keeps
    light: [-0.25, 0.72, 0.65], // direction TO the lamp (smoke shading)
  },
  drum: {
    r: 1.5, len: 2.6, hole: 0.95, hoop: 0.065, tube: 0.32, rods: 8,
    skinDip: 0.16,            // m the skin dimples at a tap
    mallet: { pivot: [-3.05, 1.95, 0], arm: 1.75, head: 0.2, raised: 0.95, rebound: 0.45 }, // raised: rad away from the skin
  },
  tank: { x: [-4.2, 17], y: [-2.05, 2.25], z: [-2.7, 2.7], edge: 0.024, edgeLevel: 0.22 },
  wall: { band: 0.7, bandY: 0.15, level: 1.0 },
  caption: { font: "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif", weight: 700, cap: 56, h: 100, x: 96, y: 70,
    plate: "rgba(3,5,9,0.74)", edge: "rgba(255,240,218,0.24)", ink: "#f3f6ff", dot: "#ffd9a6" },
  sound: {
    bed: { gain: 0.42, root: 65.4, brightness: 520 },
    tap: { soft: 0.85, hard: 1.0 },
    air: { gain: 0.36, dur: 0.9 },
    pass: { gain: 0.55 },
  },
};
