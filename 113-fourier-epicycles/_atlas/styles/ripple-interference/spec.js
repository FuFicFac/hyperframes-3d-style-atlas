// styles/ripple-interference/spec.js — STYLE_SPEC for "Ripple Interference". Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the plan + score) and the browser.
// Units: metres, toy scale (the tank is 5 m x 3.4 m inside, the wavelength 0.7 m) so a band of calm reads at 1080p.
//
// The look: a shallow ripple tank on a dark walnut bench, seen low. Clear turquoise water over a pale tiled floor; two
// brass dippers hang from one brass bar; two corks with small flags float as markers. The water is ONE shader: height
// and normals from the closed-form sum in ripple.js, refraction to the floor plane, caustic bands, Fresnel reflection of
// an analytic studio (sky gradient, a big soft panel behind the tank, a low side strip that picks out every crest).

export const STYLE_SPEC = {
  id: "ripple-interference",
  name: "Ripple Interference",
  description:
    "A shallow ripple tank on a dark walnut bench, seen at a low angle: clear turquoise water over a pale tiled floor, two brass dippers on one brass bar, two corks with small flags floating as markers. The water surface is the exact sum of two travelling ring waves (closed form in t, ripple.js): one water mesh displaced in the vertex shader, normals from the same function per pixel, refraction to the floor with caustic bands, Fresnel reflection of an analytic studio whose low side strip picks out every crest. Corks and dippers evaluate the same function in JS. Sliding one source's timing moves the still lines of calm: the corks swap roles.",
  palette: {
    bg: "#c9d4d8",
    wall: "#d5dee1",
    bench: "#4b3426",
    benchEdge: "#2e1f16",
    tankRim: "#eef1f0",
    tankSide: "#d7dedd",
    floor: "#f1f4ee",
    grout: "#b9c8c4",
    water: "#38c6c0",
    deep: "#0f7f86",
    brass: "#d6a94e",
    driver: "#2c3640",
    cork: "#c99a62",
    flagA: "#f2553d",
    flagB: "#ffc928",
    ink: "#17242b",
    plate: "#ffffff",
  },
  world: {
    background: "#c9d4d8",
    fog: { color: "#c9d4d8", near: 16, far: 40 },
    environment: "room",
    environmentIntensity: 0.5,
    toneMapping: "neutral",   // keeps the turquoise and the flag colours as designed
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#ffffff", roughness: 0.55, metalness: 0 },          // walnut map added in style.js
    wall: { type: "standard", baseColor: "#d5dee1", roughness: 0.95, metalness: 0 },
    tankRim: { type: "physical", baseColor: "#eef1f0", roughness: 0.35, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 },
    tankSide: { type: "standard", baseColor: "#d7dedd", roughness: 0.5, metalness: 0 },
    brass: { type: "physical", baseColor: "#d6a94e", roughness: 0.28, metalness: 1 },
    driver: { type: "physical", baseColor: "#2c3640", roughness: 0.45, metalness: 0.2, clearcoat: 0.4, clearcoatRoughness: 0.3 },
    cork: { type: "standard", baseColor: "#ffffff", roughness: 0.9, metalness: 0 },              // cork speckle map in style.js
    flagA: { type: "standard", baseColor: "#f2553d", roughness: 0.6, metalness: 0, side: "double" },
    flagB: { type: "standard", baseColor: "#ffc928", roughness: 0.6, metalness: 0, side: "double" },
    pin: { type: "standard", baseColor: "#3a3f44", roughness: 0.4, metalness: 0.6 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#8a7a6c", intensity: 1.0 },
    {
      id: "key", type: "directional", color: "#fff4e6", intensity: 2.4, position: [-6, 8, 4], target: [0, 0.3, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 4.6, near: 0.5, far: 30, bias: -0.0004, normalBias: 0.02 },
    },
    { id: "side", type: "directional", color: "#dff4ff", intensity: 1.1, position: [8, 2.2, -2], target: [0, 0.3, 0] },
  ],
  post: {
    vignette: { darkness: 0.22, offset: 1.15 },
  },
  camera: { fov: 30, near: 0.2, far: 80, drift: { amp: 0, speed: 0.2 } },   // locked during holds
  text: { font: "sans", weight: 700, color: "#17242b", height: 0.4 },

  // ---- the tank and the waves (every number ripple.js and style.js need) -----------------------------------------
  tank: {
    halfX: 2.5, halfZ: 1.7,     // inner half sizes (m)
    wall: 0.12,                 // wall thickness
    waterY: 0.26,               // rest level of the water above the bench
    rimY: 0.33,                 // top of the walls
    depth: 0.16,                // water depth to the floor (analytic floor plane inside the water shader)
    tile: 0.25,                 // floor tile size (grout lines show the refraction)
    segX: 320, segZ: 220,       // water mesh: displacement only (normals are per pixel), cheap at this size
  },
  wave: {
    freq: 1.5,                  // Hz, both dippers
    lambda: 0.7,                // m  (c = 1.05 m/s)
    A0: 0.05, r0: 0.22,         // amplitude A0 / sqrt(1 + r / r0)
    ramp: 0.6,                  // s, a source's first ring grows over this
    sep: 1.4,                   // source spacing = 2 wavelengths: two calm lines each side in step
    srcZ: -1.05,                // the bar sits over the back third
    dipAmp: 0.05,               // dipper stroke (m)
  },
  water: {
    ior: 1.333, f0: 0.02,
    absorb: [6.5, 1.5, 1.25],  // per metre: red goes first -> turquoise over the pale floor
    scatter: [0.02, 0.13, 0.14], scatterDensity: 3.0,
    caustic: 34.0, causticMin: 0.3, causticMax: 3.0,    // floor light = exp(caustic * h) at the floor point, clamped
    floorLight: 0.85,
    sky: { top: [0.55, 0.68, 0.78], horizon: [0.84, 0.92, 0.95] },
    panel: { dir: [0.0, 0.32, -1.0], size: [1.15, 0.24], soft: 0.08, power: 2.6, color: [1.0, 0.98, 0.94] },   // soft box behind the tank
    strip: { dir: [1.0, 0.16, -0.25], size: [0.22, 0.12], soft: 0.06, power: 3.2, color: [0.9, 0.97, 1.0] },   // low side light
    sun: { dir: [-0.6, 0.8, 0.4], power: 6.0, shine: 900.0 },
    glint: { lift: [0.12, 0.13, 0.0], power: 1.1, shine: 600.0, color: [1.0, 0.98, 0.92] },   // art-directed crest light: sits just above/right of each pixel's mirror direction
    below: [0.22, 0.42, 0.44],   // what the reflection sees below the horizon (the far water and walls, not black)
  },
  rig: {
    barY: 0.95, barR: 0.035, postX: 2.82, postR: 0.05,
    driver: [0.22, 0.2, 0.2],    // housing box (w, h, d) on the bar over each dipper
    rodR: 0.012, ballR: 0.075, dipTop: 0.06,   // ball centre at the top of the stroke, above the water level
    cork: { r: 0.085, h: 0.1, float: 0.03, pin: 0.3, pinR: 0.007, flag: [0.13, 0.085], tilt: 0.9 },
  },
  walnut: { seed: 101, boards: 5, dark: "#2c1c12", mid: "#4b3426", light: "#6b4a33", seam: "#21150d", contrast: 0.55, grainFreq: 12, perMetre: 0.22 },

  // ---- overlay caption (top centre) ---------------------------------------------------------------------------
  caption: {
    x: 960, y: 50, h: 112, cap: 62, maxW: 1240,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#ffffff", edge: "#17242b", ink: "#17242b", ring: "#1aa8a4",
  },

  sound: {
    tap: { hz: [392, 523.25], gain: 0.22, dur: 0.5, decay: 0.12, mallet: 0.25, drip: 0.05 },   // G4 left, C5 right
    join: { gain: 0.32 },
    slide: { gain: 0.16, hz: 180, hz2: 120 },
    pad: { gain: 0.5, root: 98, chord: [0, 7, 12, 16], brightness: 750 },
  },
  sfx: { enter: "clack", exit: "whooshOut", move: "whoosh", land: "bubble", emphasis: "marimba", ui: "click", bed: "pad" },
  motion: [
    "Water height = sum of two travelling ring waves, A(r) env(tau) cos(omega tau - phi(tau)), tau = t - r / c: closed form.",
    "Source 2's timing phi slides 0 -> pi; evaluated at the retarded time, so the change travels outward and the calm lines sweep.",
    "Corks ride the same function in JS (height + tilt from the gradient); dippers follow the drive phase, one tap per stroke.",
    "Camera: one move per beat, locked holds; low and close for the corks, a high pull-back for the whole pattern.",
  ],
};
