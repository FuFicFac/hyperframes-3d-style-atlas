// styles/zoetrope/spec.js — STYLE_SPEC for "3D Zoetrope". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the spin plan + score) and the browser.
// Units: metres (a big tabletop turntable, ~4 m across, so a 9 cm ball still reads at 1080p), Y-up, sRGB hex, radians.
//
// The look: a bright toy turntable on a clean cream studio sweep. A two-tier platter carries rings of small glossy
// sculptures; each ring holds N successive poses of one looping action (a bouncing ball, a sprout that blooms).
// Still, they are statues; spinning under continuous light they smear into a band (deterministic multi-sample motion
// blur); under a strobe locked to the spin the room goes dark and the sculptures animate in place.

export const STYLE_SPEC = {
  id: "zoetrope",
  name: "3D Zoetrope",
  description:
    "Animation about animation: a bright toy turntable on a clean cream studio sweep carrying rings of small glossy sculptures, each ring holding N successive poses of one looping action (a red ball bouncing with squash and stretch on clear rods, a sprout in a terracotta pot growing, blooming and closing). Standing still it is a row of statues; spun up under continuous light it smears into a blur (deterministic multi-sample motion blur over a one-frame shutter); when a strobe locked to the spin snaps on, the room goes dark, a strobe lamp lights the disc and each station appears to animate in place; a slightly detuned strobe makes the whole animation creep slowly round the disc. Disc angle is a closed-form function of t (smoothstep speed steps, exact integral), so every frame is a pure function of time.",
  palette: {
    bg: "#f3ead9",
    sweep: "#f1e6d2",
    ink: "#1f2230",
    platter: "#fbf8f1",
    tier: "#ffd23f",
    base: "#17b3a3",
    ball: "#ff3b30",
    petal: "#ff4fa3",
    center: "#ffd23f",
    stem: "#2fae4a",
    leaf: "#5fd35f",
    pot: "#e8743b",
    soil: "#5a3a28",
    rod: "#cfd6df",
    cap: "#3d5afe",
    stripes: ["#ff5a5f", "#ffb400", "#17b3a3", "#3d5afe"],
    night: "#151826",       // room colour under the strobe
    strobe: "#eef4ff",
  },
  world: {
    background: "#f3ead9",
    fog: null,
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",   // keep the toy colours as designed
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    sweep: { type: "standard", baseColor: "#f1e6d2", roughness: 0.95, metalness: 0 },
    platter: { type: "standard", baseColor: "#fbf8f1", roughness: 0.55, metalness: 0 },
    tier: { type: "physical", baseColor: "#ffd23f", roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 },
    base: { type: "physical", baseColor: "#17b3a3", roughness: 0.3, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.15 },
    ball: { type: "physical", baseColor: "#ff3b30", roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 },
    petal: { type: "physical", baseColor: "#ff4fa3", roughness: 0.4, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3, side: "double" },
    center: { type: "standard", baseColor: "#ffd23f", roughness: 0.5, metalness: 0 },
    stem: { type: "standard", baseColor: "#2fae4a", roughness: 0.5, metalness: 0 },
    leaf: { type: "standard", baseColor: "#5fd35f", roughness: 0.5, metalness: 0, side: "double" },
    pot: { type: "standard", baseColor: "#e8743b", roughness: 0.7, metalness: 0 },
    soil: { type: "standard", baseColor: "#5a3a28", roughness: 1, metalness: 0 },
    rod: { type: "physical", baseColor: "#cfd6df", roughness: 0.15, metalness: 0.2, clearcoat: 1 },
    cap: { type: "physical", baseColor: "#3d5afe", roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 },
    lampBody: { type: "standard", baseColor: "#2a2d38", roughness: 0.45, metalness: 0.3 },
    lampLens: { type: "standard", baseColor: "#ffffff", roughness: 0.2, metalness: 0, emission: { color: "#eef4ff", strength: 0.05 } },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#ffffff", groundColor: "#e8dcc4", intensity: 1.15 },
    {
      id: "key", type: "directional", color: "#fff4e4", intensity: 2.6, position: [-4.5, 7.5, 5.5], target: [0, 0.4, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 3.6, near: 1, far: 22, bias: -0.0004, normalBias: 0.02 },
    },
    { id: "fill", type: "directional", color: "#dfe9ff", intensity: 0.7, position: [6, 3.5, 4], target: [0, 0.4, 0] },
    {
      // the strobe lamp (off until a strobe window; the scene drives its intensity from the plan)
      id: "strobe", type: "spot", color: "#eef4ff", intensity: 0, position: [-2.55, 2.45, 1.7], target: [0, 0.45, 0.2],
      angle: 0.7, penumbra: 0.55, distance: 14, decay: 2,
      shadow: { softness: 2, mapSize: 2048, near: 1, far: 14, bias: -0.0005, normalBias: 0.02 },
    },
  ],
  post: {
    vignette: { darkness: 0.28, offset: 1.1 },
  },
  camera: { fov: 34, near: 0.1, far: 60, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 800, color: "#1f2230", height: 0.3 },

  // ---- the turntable ---------------------------------------------------------------------------------------
  table: {
    baseR: 2.12, baseH: 0.22,           // glossy turquoise plinth (does not spin)
    platterR: 2.0, platterH: 0.08,      // white outer platter, top at baseH + platterH
    stripeH: 0.06,                      // coloured segment band round the platter edge (one segment per station)
    tierR: 1.22, tierH: 0.3,            // raised yellow inner tier
    spindleR: 0.13, spindleH: 0.36,     // centre spindle + glossy cap
  },
  rings: [
    // outer ring: sprouts in pots (low), inner ring: bouncing balls on rods (tall), so neither hides the other
    { id: "flowers", pose: "flower", N: 24, radius: 1.68, tier: "platter", height: 0.34, scale: 1.0 },
    { id: "balls", pose: "ball", N: 24, radius: 0.92, tier: "tier", height: 0.52, ballR: 0.085 },
  ],
  flower: { potR: 0.085, potH: 0.11, stemR: 0.012, petals: 6, petalLen: 0.085, petalW: 0.05, centerR: 0.032, leafLen: 0.075 },
  ball: { rodR: 0.006, padR: 0.05, squash: 0.42, stretch: 0.22 },
  lamp: { position: [-2.55, 2.45, 1.7], target: [0, 0.45, 0.2], size: 0.4 },

  // ---- spin, blur and strobe (zoetrope.js) -----------------------------------------------------------------
  spin: {
    blurSamples: 16,       // renders averaged per continuous-light frame (deterministic motion blur)
    shutter: 1,            // exposure in frames (1 = full frame: at the locked speed the smear = one station spacing)
    strobePeak: 60,        // strobe spot candela at full
    lampGlow: 2.2,         // lamp lens emission at full
    lampFlicker: 0.18,     // gentle per-frame lens pulse (fraction) so the lamp visibly strobes without flashing the frame
    darkRoom: 0.08,        // room light level under the strobe (fraction of normal)
    fade: 0.22,            // s for the room to darken / brighten
    onset: 0.35,           // s of the soft switch-on flash
  },

  // ---- the beat label: one caption chip pinned to the screen (overlay = exact colours) ---------------------
  caption: {
    x: 96, y: 66, h: 88, cap: 38,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#ffffff", edge: "#e2d8c6", ink: "#1f2230", dots: ["#ff3b30", "#ffd23f", "#17b3a3"],
    nightPlate: "#20243a", nightEdge: "#3a3f5c", nightInk: "#f3f5fb",
  },

  sound: {
    bed: { gain: 0.62, root: 130.8, brightness: 900 },
    whir: { gain: 0.32, hz: 55, hz2: 150, seg: 0.9 },
    bounce: { gain: 0.42, hz: 392 },
    bloom: { gain: 0.3, hz: 523.25 },
    strobeOn: { gain: 0.5 },
    strobeHum: { gain: 0.07, hz: 120 },
    label: { gain: 0.22 },
  },
  sfx: { enter: "marimba", exit: "click", move: "whir", land: "marimba", emphasis: "clack", ui: "click", bed: "pad" },
  motion: [
    "Nothing on the disc ever changes shape: each station is a fixed sculpture of one pose; only the disc angle moves (a closed-form integral of smoothstep speed steps).",
    "Continuous light: the frame averages K renders over a one-frame shutter, so at the locked speed the stations smear into one band.",
    "Strobe: one flash per video frame; at one station per frame every spot shows the next pose, so the ring animates in place; the room darkens to ~13 % and the strobe lamp lights the disc.",
    "Detune: a disc a few percent faster than the strobe makes the whole animation creep forward round the disc.",
  ],
};
