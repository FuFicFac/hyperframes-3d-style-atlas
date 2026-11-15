// styles/ferrofluid/spec.js — STYLE_SPEC for "Ferrofluid": jet-black magnetic liquid in a white dish, erupting into
// glossy spikes under steel magnets, on a bright studio set. Plain data only (JSON-safe, no THREE, no window).
// Units: metres, Y-up, sRGB hex, radians. The pool surface sits at y = 0; the dish stands on the bench at y = bench.y.
// Every number that defines the look lives here; style.js reads it, field.js plans the magnets.
export const STYLE_SPEC = {
  id: "ferrofluid",
  name: "Ferrofluid",
  description:
    "Invisible forces made visible: a mirror-flat pool of jet-black magnetic liquid in a white dish erupts into a crown of sharp glossy spikes under a steel magnet, follows it, splits when a second magnet arrives and melts flat when the field goes — black fluid read through bright studio strips on a pale set.",
  palette: {
    bg: "#e7e5e1",
    bench: "#d8d5cf",
    backdrop: "#e9e7e3",
    dish: "#f6f4f0",
    fluid: "#030304",
    steel: "#b9bec6",
    rod: "#8d939b",
    ink: "#ffffff",
    plate: "#101113",
    accent: "#d9473b",
  },
  world: { background: "#e7e5e1", fog: { color: "#e7e5e1", near: 7, far: 16 }, environment: null, toneMapping: "neutral", exposure: 1.0, shadowType: "pcf" },
  materials: {
    bench: { type: "standard", baseColor: "#d8d5cf", roughness: 0.85, metalness: 0 },
    backdrop: { type: "standard", baseColor: "#e9e7e3", roughness: 0.95, metalness: 0 },
    // glazed white ceramic dish: bright, a clear glaze so the strips glint on the rim
    dish: { type: "physical", baseColor: "#f6f4f0", roughness: 0.32, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.08 },
    // polished steel magnet + brushed rod
    steel: { type: "standard", baseColor: "#c9ced6", roughness: 0.16, metalness: 1 },
    rod: { type: "standard", baseColor: "#9aa0a8", roughness: 0.38, metalness: 1 },
    // the red pole band on each magnet (the only saturated colour; tells the two magnets apart from the pool)
    pole: { type: "standard", baseColor: "#d9473b", roughness: 0.35, metalness: 0.1 },
  },
  // Direct lights for the meshes (dish, bench, backdrop, magnets). The fluid ignores them: it is shaded only by the
  // analytic studio env below. Key/rim sit on the same side as the env's strips so reflections and shading agree.
  lights: [
    { id: "sky", type: "hemisphere", color: "#ffffff", groundColor: "#d9d2c8", intensity: 1.35 },
    { id: "key", type: "directional", color: "#fffaf2", intensity: 1.55, position: [-2.6, 4.2, 2.4], target: [0, 0, 0],
      shadow: { softness: 6, mapSize: 2048, extent: 2.2, bias: -0.0005, normalBias: 0.02 } },
    { id: "rim", type: "directional", color: "#f2f6ff", intensity: 0.7, position: [2.4, 2.2, -3.2], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.22, radius: 0.4, threshold: 2.4 },   // only the hottest strip glints on spikes and steel bloom
    vignette: { darkness: 0.2, offset: 1.15 },
    grain: { amount: 0.008, fps: 30 },
  },
  camera: { fov: 30, near: 0.1, far: 40, drift: { amp: 0.0, speed: 0.3 } },
  text: { font: "sans", weight: 700, color: "#ffffff", height: 0.1 },
  sfx: { enter: "squish", exit: "bubble", move: "tick", land: "bubble", emphasis: "squish", ui: "tick", bed: "pad" },

  // ---- the analytic studio environment the fluid reflects (GLSL; crisp strip edges, no PMREM blur) ----
  // Directions in world space: az = atan2(dir.z, dir.x) (−π/2 = straight behind the dish, away from a camera on +z),
  // el = dir.y (−1..1). Below el = 0: the pale bench. 0..lowBand: the pale seamless wall (matches the visible set).
  // Above: a darker studio ceiling so the mirror-flat pool reads BLACK with crisp strip reflections.
  env: {
    bench: "#cfcac2", benchI: 0.85,
    wall: "#e9e7e3", wallI: 0.9, lowBand: [0.02, 0.2],
    ceiling: "#2a2b2e", ceilingTop: "#4a4b4f", ceilingI: 0.55,
    // [az, el, halfWidth (rad), halfHeight (el units), softness], colour, HDR intensity
    panels: [
      { id: "overhead", rect: [-1.57, 0.86, 1.3, 0.1, 0.05], color: "#ffffff", intensity: 5.0 },
      { id: "backStrip", rect: [-1.57, 0.32, 0.9, 0.035, 0.012], color: "#ffffff", intensity: 9.0 },
      { id: "rimLeft", rect: [-2.35, 0.3, 0.07, 0.3, 0.02], color: "#f4f7ff", intensity: 10.0 },
      { id: "rimRight", rect: [-0.75, 0.3, 0.07, 0.3, 0.02], color: "#f4f7ff", intensity: 10.0 },
      { id: "keyBox", rect: [2.4, 0.5, 0.35, 0.22, 0.06], color: "#fff6ea", intensity: 4.0 },
      { id: "fillCard", rect: [1.2, 0.28, 0.5, 0.2, 0.15], color: "#ffffff", intensity: 1.6 },
    ],
    panelRadius: 8,                 // where the matching mesh-env panels sit (studio PMREM for dish + steel)
  },
  // procedural studio PMREM for the MESHES (kit/studio.js), panels generated from env.panels at panelRadius
  studio: { size: 256, sigma: 0.01, room: { w: 18, h: 10, d: 18, color: "#7d7c7a" }, sweep: { size: [1, 0.1], radius: 8, from: 0.1, to: 0.2, intensity: 0, color: "#ffffff", soft: 0.3 }, quantum: 0.002, envIntensity: 1.0 },

  // ---- the fluid: shading ----
  fluid: {
    f0: 0.075,            // reflectance facing the camera (black "oil": the body stays black, strips read crisply)
    edgeBoost: 1.0,       // Fresnel toward silhouettes (1 = physical)
    body: "#030304",      // diffuse body colour (almost nothing)
    bodyLight: 0.06,      // how much the body colour is lit
    occlusion: 0.9,       // crevice darkening between spikes (3-tap field AO)
    magnetReflect: 0.85,  // the steel magnets appear in the mirror (ray vs cylinder in the shader)
  },
  // ---- the fluid: geometry (raymarched SDF; kit/sdf-style smooth union, but a height-field pool + hex cone array) ----
  pool: {
    radius: 1.04,          // pool radius (= dish inner radius)
    depth: 0.06,           // visible depth below the surface (hidden by the dish)
    meniscus: 0.012,       // the liquid climbs the dish wall a little
    meniscusWidth: 0.035,
  },
  spikes: {
    spacing: 0.068,        // hex pitch at zero field (m)
    tighten: 0.14,         // pitch shrinks by this fraction at full field (Rosensweig spacing tightens)
    height: 0.24,          // tallest spike above the mound at field 1
    heightCurve: 0.85,     // h = height * g^curve, g = field above threshold (0..1)
    jitter: 0.18,          // per-spike height jitter (hash of the lattice cell; deterministic)
    radius: [0.5, 0.36],   // base radius / pitch at the threshold -> at full field (spikes get sharper)
    blend: 0.026,          // smooth-union radius spike <-> pool (the melted concave fillet at the base)
    mound: 0.075,          // the pool heaps up under the magnet by this much at field 1
    ripple: 0.006,         // sub-threshold ripples near the crown edge (tiny bumps)
  },
  // ---- the magnetic field (field.js) ----
  field: { near: 0.4, far: 0.95, curve: 1.2, sigma: 0.26, threshold: 0.25 },
  // ---- raymarch budget ----
  march: { steps: 110, relax: 0.85, aoSteps: 3, maxMagnets: 2 },
  // ---- magnet prop (steel cylinder on a rod from above) ----
  magnet: { radius: 0.085, height: 0.2, rod: 0.016, rodLength: 4, poleBand: 0.035, chamfer: 0.01 },
  // ---- dish (lathe profile; rim top at y = rimTop, foot on the bench) ----
  dish: { inner: 1.04, outer: 1.16, rimTop: 0.035, floor: -0.06, foot: -0.12, segments: 160 },
  bench: { y: -0.12 },
  // ---- the beat caption (overlay chip: black glossy plate, white text — exact colours) ----
  caption: { font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700, cap: 46, h: 92, x: 116, y: 78, plate: "#101113", edge: "#3a3c40", ink: "#ffffff", dot: "#000000", dotHi: "#ffffff" },
  // ---- sound palette (field.js fieldVoices) ----
  sound: {
    bed: { root: 55, brightness: 420, gain: 0.5 },
    hum: { gain: 0.16, dur: 0.5 },
    erupt: { gain: 0.6, pitch: 0.8 },
    tick: { gain: 0.16, pitch: 1.1 },
    plop: { gain: 0.42, pitch: 0.55 },
  },
  motion: [
    "No solid hero: the subject is a liquid surface whose shape is a pure function of the magnetic field (field.js) at time t.",
    "Magnets travel on closed-form keyed paths; strength = smoothstep of their height above the pool, so lowering a magnet IS turning the field up.",
    "Under the field the pool heaps into a mound and a hexagonal crown of cones erupts (tallest under the magnet, sharper and tighter as the field rises, ripples at the rim).",
    "The crown follows a moving magnet (spikes rise at the leading edge, sink at the trailing edge) and splits into two crowns when a second magnet arrives.",
    "Lift the magnets and the spikes sag and melt back into a mirror-flat black pool. Camera: low three-quarter macro, moves only while the fluid moves.",
  ],
};
