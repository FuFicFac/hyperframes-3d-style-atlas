// styles/photoelastic-stress/spec.js — STYLE_SPEC for "Photoelastic Stress". Plain data only: JSON-serializable, no
// THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the stress plan + score) and the browser.
// Units: metres, toy-scale (the beam is 4 m long so its bands read at 1080p). Y-up; the light box faces +Z, the camera
// looks back toward it.
//
// The look: an upright light box in a bright lab, a clear notched plastic beam on two roller supports in an aluminium
// loading frame with a screw press, and a second polarising sheet (the analyser) that slides across in front. Where the
// analyser covers, the light box goes deep indigo-black and the beam shows its stress as interference colours
// (computed from the spectrum, not a rainbow ramp): black where unstressed, then grey, white, yellow, red, violet, blue,
// green... bands crowd where stress concentrates.

export const STYLE_SPEC = {
  id: "photoelastic-stress",
  name: "Photoelastic Stress",
  description:
    "Stress shows as colour: a clear notched plastic beam in an aluminium loading frame stands in front of a bright upright light box; a second polarising sheet slides across and, under it, the beam turns black and blooms with interference-colour bands (isochromatics of a dark-field circular polariscope) when the screw press loads it. Band colour is computed per pixel from the retardation R = Cf (σ1 − σ2) through a colour table integrated over the visible spectrum (blackbody light box × CIE colour-matching functions × sin²(πR/λ)); the stress is an analytical approximation (Flamant point loads for the press and every support + beam bending from the support reactions + a notch concentration factor). Bands crowd at the notch and the contacts and spread out when a third support shares the load.",
  palette: {
    bg: "#e9eaec",
    wall: "#eceef0",
    bench: "#d9dbde",
    benchEdge: "#9da2a8",
    alu: "#c4c9cf",
    aluDark: "#7e858d",
    steel: "#8b9097",
    housing: "#f4f5f6",
    lightbox: "#ffffff",
    leak: "#0f1230",
    film: "#3a3f44",
    acrylic: "#dff1f2",
    ink: "#14161c",
    accent: "#e8622c",
    roller: "#2b2f36",
    jack: "#3c6fd1",
  },
  world: {
    background: "#e9eaec",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#d9dbde", roughness: 0.78, metalness: 0, bump: { source: "bumpNoise", scale: 36, octaves: 3, seed: 102, strength: 0.12, description: "fine fbm noise: matte lab bench laminate" } },
    wall: { type: "standard", baseColor: "#eceef0", roughness: 0.95, metalness: 0 },
    housing: { type: "standard", baseColor: "#f4f5f6", roughness: 0.45, metalness: 0 },
    alu: { type: "standard", baseColor: "#c4c9cf", roughness: 0.32, metalness: 0.85 },
    aluDark: { type: "standard", baseColor: "#7e858d", roughness: 0.4, metalness: 0.8 },
    steel: { type: "standard", baseColor: "#8b9097", roughness: 0.25, metalness: 1 },
    roller: { type: "standard", baseColor: "#2b2f36", roughness: 0.35, metalness: 0.6 },
    jack: { type: "standard", baseColor: "#3c6fd1", roughness: 0.4, metalness: 0.2 },
    accent: { type: "standard", baseColor: "#e8622c", roughness: 0.45, metalness: 0 },
    rubber: { type: "standard", baseColor: "#24262b", roughness: 0.8, metalness: 0 },
    acrylicEdge: { type: "physical", baseColor: "#8fa7ab", roughness: 0.22, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.1 },
    film: { type: "physical", baseColor: "#3a3f44", roughness: 0.18, metalness: 0, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.1 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#a9adb3", intensity: 1.1 },
    {
      id: "key", type: "directional", color: "#fff6ea", intensity: 2.2, position: [-3.5, 6.5, 6.5], target: [0, 1.4, 0.5],
      shadow: { softness: 3, mapSize: 2048, extent: 4.6, near: 0.5, far: 24, bias: -0.0008, normalBias: 0.045 },
    },
    { id: "rim", type: "directional", color: "#dfe9ff", intensity: 0.6, position: [4.0, 3.5, 4.0], target: [0, 1.4, 0.5] },
  ],
  post: {
    bloom: { strength: 0.3, radius: 0.35, threshold: 1.25 },
    vignette: { darkness: 0.22, offset: 1.15 },
  },
  camera: { fov: 34, near: 0.2, far: 60, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#14161c", height: 0.3 },

  // ---- the polariscope (light box + analyser) ---------------------------------------------------------------
  lightbox: {
    w: 7.0, h: 3.3, y0: 0.62, z: 0, depth: 0.3, rim: 0.12,
    level: 1.0,                // HDR level of the bare diffuser (through the first polariser)
    tint: [0.97, 0.985, 1.0],  // linear tint of the polarised light-box white
    falloff: 0.12,             // darkening toward the diffuser edges
    leak: [0.012, 0.014, 0.05],// crossed-polariser leakage (deep indigo), × level
  },
  analyser: {
    w: 5.6, h: 1.04, y: 1.55, z: 0.98, frame: 0.05, frameDepth: 0.04, from: -5.0, to: 0, soft: 0.004,
  },

  // ---- the specimen ---------------------------------------------------------------------------------------
  beam: { L: 4.0, H: 0.7, T: 0.12, y0: 1.2, z: 0.5, edge: 0.006 },
  notch: { x: 0.8, depth: 0.2, width: 0.2, rho: 0.03, Kt: 2.4, decay: 1.35 },
  // fringe constant: nm of retardation per stress unit (stress = load units per m², see stressplan.js)
  photo: {
    Cf: 180, rMax: 4200, tableN: 512, kelvin: 5600,
    gain: 1.55,           // how bright the bands glow under the analyser (× light-box level)
    edgeGlow: 0.16,       // faint bright line at machined edges (residual 'edge effect') so the dark beam still reads
    clearEdge: 0.5,       // dark refraction line at the edges when seen without the analyser
    clearTint: [0.93, 0.975, 0.98],
  },

  // ---- the loading frame -----------------------------------------------------------------------------------
  frame: {
    rail: { x: 3.1, y0: 0.5, y1: 0.84, front: 0.63, z0: 0.24, z1: 0.76, lip: 0.07 },   // channel rail on the bench; low front wall so the sliding support shows
    posts: { x: 2.75, r: 0.07, top: 3.08 },
    crosshead: { y: 2.86, h: 0.22, d: 0.3 },
    screw: { r: 0.045, wheelR: 0.3, wheelY: 3.25 },
    plunger: { r: 0.12, h: 0.22, noseR: 0.06 },
    roller: { r: 0.075, len: 0.2 },
  },
  supports: [{ x: -1.7, a: 0.03 }, { x: 1.7, a: 0.03 }],
  press: { x: 0, a: 0.035 },
  third: { x: 0.42, from: 2.65, a: 0.03, share: 0.58, drop: 0.33 },
  bench: { y: 0.5, size: 40 },

  // ---- overlay caption chip (top-left, exact colours) ------------------------------------------------------
  caption: {
    x: 64, y: 56, h: 92, cap: 40, maxW: 880,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#14161c", edge: "#3a3f4a", ink: "#f5f6f8",
  },

  sound: {
    bed: { gain: 0.5, root: 82.4, brightness: 700 },
    slide: { gain: 0.5, whoosh: 0.22 },
    servo: { gain: 0.42, grit: 0.35 },
    touch: { gain: 0.5 },
    tone: { gain: 0.11, base: 392, perOrder: 0.12, brightness: 3800 },
    glide: { gain: 0.32 },
    seat: { gain: 0.95, clack: 0.4 },
    settle: { gain: 0.12 },
  },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "servo", land: "thud", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Band colour = interference-colour table (integrated over the spectrum) at R = Cf × (σ1 − σ2); the stress is a closed form of the load and support positions at t, evaluated per pixel in one shader.",
    "The analyser slides across; coverage is a ray test in the shader, so the light box and the beam switch to dark-field exactly behind its edge.",
    "Load ramps are eased keys; the handwheel turns with plunger travel + load; supports move on eased keys. Nothing is simulated.",
    "Camera: front, slightly above, one move per beat, still during holds (fringes are dense detail).",
  ],
};
