// styles/glass-light/spec.js — STYLE_SPEC for "Glass & Light": an optics-bench still life. Polished clear and
// coloured glass solids on a dark matte bench in a dim, hazy room; beams of light travel through them, bend by
// Snell's law, split into spectra, focus and land as caustics. Light is the actor. Plain data only
// (JSON-serializable, no THREE, no window). Units: metres, Y-up, sRGB hex, radians, three.js light units.

export const STYLE_SPEC = {
  id: "glass-light",
  name: "Glass & Light",
  description:
    "Optics-bench still life: polished clear and coloured glass solids (prisms, blocks, faceted gems, lenses, spheres, rods) on a dark matte bench in a dim hazy room; volumetric beams computed by real ray optics refract through them, a prism fans white light into a spectrum, caustics and rainbow smears land on the table; screen-space refraction with per-channel dispersion, bevel glints, hairline captions.",
  palette: {
    bg: "#030305",
    bench: "#07080a",
    wall: "#050608",
    metal: "#16181c",
    ink: "#eef2f6",
    inkDim: "#8a93a0",
    line: "#c9d1db",
    cyan: "#3fe3ff",
    magenta: "#ff3fc8",
    amber: "#ffb23a",
    white: "#fff6ea",
    primary: "#3fe3ff",
    secondary: "#ff3fc8",
    accent: "#ffb23a",
  },
  world: {
    background: "#030305",
    fog: { color: "#030305", near: 14, far: 42 },  // the room melts into black; beams fade by their own falloff
    environment: null,
    toneMapping: "neutral",                         // keeps spectral hues and beam colours as designed (ACES greys them)
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    bench: { type: "physical", baseColor: "#07080a", roughness: 0.62, metalness: 0 },   // style.js -> blurred mirror floor
    metal: { type: "physical", baseColor: "#16181c", roughness: 0.38, metalness: 0.7, clearcoat: 0.3, clearcoatRoughness: 0.2 },
    metalDark: { type: "standard", baseColor: "#0b0c0e", roughness: 0.55, metalness: 0.4 },
  },
  lights: [
    { id: "room", type: "hemisphere", color: "#9fb2c8", groundColor: "#050506", intensity: 0.16 },
    { id: "wash", type: "spot", color: "#7f93b8", intensity: 260, position: [0, 7, 1], target: [0.5, 1.6, -12], angle: 0.42, penumbra: 1, distance: 40, decay: 2 }, // dim pool on the back cove: something for the glass to refract
    { id: "key", type: "spot", color: "#e9eef7", intensity: 34, position: [-3.5, 6.5, 3.5], target: [-1, 0, 0], angle: 0.62, penumbra: 1, distance: 30, decay: 2,
      shadow: { softness: 6, mapSize: 2048, bias: -0.0004, normalBias: 0.02 } },
    { id: "rim", type: "spot", color: "#cfe0ff", intensity: 26, position: [2.5, 3.2, -7], target: [0, 0.4, 0], angle: 0.5, penumbra: 1, distance: 30, decay: 2 },
  ],
  post: {
    bloom: { strength: 0.62, radius: 0.55, threshold: 0.85 }, // beam cores (HDR 3-8) and glints bloom; the bench does not
    vignette: { darkness: 0.5, offset: 1.1 },
    grain: { amount: 0.016, fps: 30 },                         // dither: dark gradients + haze band without it
  },
  camera: { fov: 30, near: 0.3, far: 60, drift: { amp: 0.01, speed: 0.25 } },
  text: { font: "sans", weight: 300, color: "#eef2f6", height: 0.24 },
  sfx: { enter: "pad", exit: "whooshOut", move: "whoosh", land: "chime", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "A beam switches on at its emitter and TRAVELS: its head grows along the computed ray path (≈4 m/s), a bright spark at the head.",
    "Glass pieces slide or rotate on the bench and every beam re-routes live: the path is re-traced each frame from the pieces' current transforms.",
    "A prism turns slowly so its spectrum fan breathes and sweeps across the table; caustics follow the computed hit points.",
    "Encoded light pulses: after a piece, a beam can carry travelling packets (pure function of t).",
    "Camera: one slow orbit (arc keys) with shallow depth of field focused on the active piece; no cuts.",
    "Captions: thin light caps in one fixed lower region with a hairline leader drawn to the subject.",
  ],

  // ---- look numbers consumed by style.js -----------------------------------------------------------
  // Glass: opaque custom shader. Refraction = screen-space sample of a same-frame pre-render of the scene WITHOUT
  // the glass (per-channel IOR -> chromatic fringes), Fresnel reflection of an analytic studio (soft panels),
  // bevel roll at polygon edges (bright edge glints + dark internal edge band), Beer-like thickness tint.
  glass: {
    prepass: 0.75,          // pre-render (refraction source) size × frame
    ior: 1.5,               // base IOR for the screen-space refraction
    dispersion: 0.035,      // IOR spread between R and B channels in the shader (chromatic fringes)
    refract: 0.13,          // uv offset per unit of refracted bend (× piece size factor)
    fresnelPow: 4.0,
    fresnelMin: 0.05,
    bevel: 0.045,           // m: fake rounded-edge width on polyhedra
    bevelRoll: 1.7,
    edgeDark: 0.55,         // darkens transmission toward grazing (the dark internal edge band)
    env: 1.0,               // reflection strength
    rim: "#9fb6d6", rimStrength: 0.22,
    imperfection: 0.018,    // normal noise (polish ripple)
    clear: { tint: "#eef6f4", density: 0.25 },
    tints: { cyan: "#7fe8ff", magenta: "#ff8ad8", amber: "#ffc66a", smoke: "#9aa3ad", green: "#8affc8" },
    density: 1.6,           // absorption per metre for coloured glass
    glowRadius: 0.55,       // m: coloured light spill from beam points into the glass volume
    glowSpec: 160,          // tightness of beam-point reflections on glass
    room: "#06070a", floor: "#020203",
    panels: [               // analytic studio for reflections: direction, size (tan half-angles), intensity, colour
      { dir: [-0.35, 0.92, 0.2], size: [0.9, 0.22], intensity: 2.6, color: "#f4f7ff" },  // long overhead strip
      { dir: [-0.95, 0.25, 0.25], size: [0.12, 0.7], intensity: 3.2, color: "#fff1e0" }, // left vertical key strip
      { dir: [0.75, 0.3, -0.6], size: [0.1, 0.6], intensity: 2.4, color: "#d9e6ff" },    // back-right rim strip
      { dir: [0.0, 0.12, 1.0], size: [1.4, 0.05], intensity: 0.7, color: "#ffffff" },    // low front horizon line
    ],
    panelSoft: 0.45,
  },
  // Beams: camera-facing additive ribbons per ray segment; flat dim "spill" ribbons on the table under them.
  beam: {
    width: 0.085,           // m half-width of the halo
    grow: 0.0035,           // width growth per metre travelled (slight divergence)
    core: 6.0,              // core HDR gain (> bloom threshold)
    coreK: 34,              // core sharpness (exp(-k a²) across the ribbon)
    halo: 0.42, haloK: 3.2,
    falloff: 0.06,          // 1 / (1 + s·falloff)
    headSoft: 0.35,         // m: soft leading edge
    spark: 1.6,             // extra brightness right behind the head
    dust: 0.42, dustScale: 3.2, dustDrift: [0.06, 0.03, 0.02],
    pulse: { freq: 2.2, speed: 1.6, depth: 0.55 }, // "encoded" packets (cycles per m, m/s)
    speed: 4.2,             // m/s head travel
    spill: { width: 0.3, level: 0.035, y: 0.004 },
  },
  caustic: { level: 1.4, core: 2.2, minWidth: 0.06, maxStretch: 7, y: 0.005 },
  glint: { size: 46, level: 3.2 },
  dust: { count: 320, size: 9, radius: 0.13, level: 1.6, box: [[-5.6, 0.05, -2.6], [4.8, 1.7, 2.4]], seed: 11 },
  spillLights: { count: 6, distance: 3.2, intensity: 1.6 },
  prism: { glass: { A: 1.5046, B: 0.0042, boost: 12 } }, // crown glass with exaggerated dispersion (order and shape stay physical)
  emitter: { size: [0.95, 0.34, 0.46], aperture: 0.065, label: 0.18, labelInk: 0.85 },
  floor: { resolution: 0.5, strength: 0.13, facing: 0.05, blur: 9, fade: [3.5, 9], envIntensity: 0.0, specular: 0.15,
           sweep: { width: 44, depth: 26, height: 14, radius: 6 } },
  dof: { aperture: 0.0009, maxblur: 0.004 },
  overlay: {
    font: "sans",
    titleWeight: 200, titleTracking: 0.26, labelWeight: 300, labelTracking: 0.2,
    titleHeight: 0.072, subHeight: 0.03, labelHeight: 0.05,
    lineWidthPx: 1.3, dotPx: 4, ringPx: 10,
    lineColor: "#c9d1db", labelColor: "#eef2f6", subColor: "#8a93a0", dotColor: "#ffffff",
    drawDur: 0.6, fadeDur: 0.45, outDur: 0.45, rise: 0.01,
  },
};
