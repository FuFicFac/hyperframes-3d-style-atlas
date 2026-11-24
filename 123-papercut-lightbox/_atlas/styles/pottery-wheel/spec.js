// styles/pottery-wheel/spec.js — STYLE_SPEC for "Pottery Wheel". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the throw plan + score) and the browser.
// Units: metres (toy scale: the clay is ~1.3 m tall as a vase so throwing rings and tool marks read at 1080p).
//
// The look: a potter's wheel in a sunlit plaster studio. Wet grey-brown clay spins on a steel wheel head inside a pale
// splash pan; it is ONE surface of revolution whose profile is a pure function of t, interpolated between named key
// profiles (lump -> cone -> opened cylinder -> bowl -> collar -> vase) with its volume held constant, so it reads as the
// same clay. Spin shows through slip streaks, the lumpy off-centre wobble that damps as it is centred, and marks on the
// wheel head. A wooden rib on a handle presses where the profile is changing fastest; at the end a glaze brush sweeps
// colour on as the wheel slows. Wheel hum, wet squelches and the glaze brush come from the same plan (throw.js).

export const STYLE_SPEC = {
  id: "pottery-wheel",
  name: "Pottery Wheel",
  description:
    "A potter's wheel in a sunlit plaster studio: wet, glossy grey-brown clay spins on a steel wheel head inside a pale splash pan, a window's light patch on the wall behind it and a shelf of finished glazed pots out of focus. The clay is one lathe surface whose profile is a pure function of t, morphing between named key profiles (lump, cone, opened cylinder, bowl, collar, vase) bottom-up like a real pull, with its volume held constant so it is always the same clay. Spin reads through slip streaks, throwing rings that appear once it is thrown, a lumpy off-centre wobble that damps as it is centred, and marks on the wheel head. A wooden rib on a handle rides the wall exactly where the profile is changing fastest. At the end the wheel slows and a brush sweeps glaze on in a spiral from foot to lip. Wheel hum pitched by spin speed, wet squelches at shape changes and the brush come from the same plan.",
  palette: {
    bg: "#e9dfcf",
    plaster: "#e3d8c6",
    plasterShade: "#d2c4ad",
    sun: "#fff5e2",
    clay: "#5f5249",
    clayDark: "#4a3f37",
    clayLight: "#85766a",
    slip: "#8d7d70",
    glaze: "#1f6f8b",
    glazeDeep: "#123f5c",
    glazeBreak: "#c99a5b",
    steel: "#9aa0a3",
    pan: "#c9d2cc",
    wheelBody: "#7f998c",
    wood: "#b98a55",
    woodDark: "#8a5f34",
    bristle: "#e9d9b5",
    ink: "#2a2420",
  },
  world: {
    background: "#e9dfcf",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.38,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    plaster: { type: "standard", baseColor: "#ffffff", roughness: 0.95, metalness: 0 },
    floor: { type: "standard", baseColor: "#ffffff", roughness: 0.85, metalness: 0 },
    steel: { type: "standard", baseColor: "#ffffff", roughness: 0.38, metalness: 0.75 },
    pan: { type: "standard", baseColor: "#c9d2cc", roughness: 0.55, metalness: 0 },
    slurry: { type: "physical", baseColor: "#5a4d44", roughness: 0.3, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 },
    body: { type: "standard", baseColor: "#7f998c", roughness: 0.5, metalness: 0.05 },
    wood: { type: "standard", baseColor: "#b98a55", roughness: 0.6, metalness: 0 },
    woodDark: { type: "standard", baseColor: "#8a5f34", roughness: 0.6, metalness: 0 },
    ferrule: { type: "standard", baseColor: "#c8b27a", roughness: 0.3, metalness: 0.9 },
    bristle: { type: "standard", baseColor: "#e9d9b5", roughness: 0.8, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#f6f2ea", groundColor: "#bba78c", intensity: 1.0 },
    {
      // late-morning sun through a window at front-left: warm, soft shadow thrown back-right onto the wheel head and wall
      id: "sun", type: "directional", color: "#ffeed6", intensity: 3.0, position: [-4.2, 5.2, 4.0], target: [0, 0.4, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 3.2, near: 0.5, far: 20, bias: -0.0006, normalBias: 0.03 },
    },
    // cool bounce from the right (the white studio wall off-camera): keeps the shadow side of wet clay readable
    { id: "bounce", type: "directional", color: "#e6eef5", intensity: 0.9, position: [4.5, 1.8, 3.0], target: [0, 0.5, 0] },
    // rim from behind-right: a thin highlight down the clay's edge against the plaster
    { id: "rim", type: "directional", color: "#fff6ea", intensity: 1.4, position: [2.5, 3.5, -4.0], target: [0, 0.5, 0] },
  ],
  post: {
    bloom: { strength: 0.18, radius: 0.3, threshold: 2.6 },
    vignette: { darkness: 0.2, offset: 1.15 },
  },
  dof: { relativeAperture: 0.01, maxblur: 0.0045 },  // gentle: the kit bokeh leaks foreground colour into blurred background, so keep the halo small
  camera: { fov: 30, near: 0.2, far: 40, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 600, color: "#2a2420", height: 0.3 },

  // ---- the clay (throw.js) -----------------------------------------------------------------------------------
  profile: {
    counts: { bottom: 10, outer: 132, inner: 104 },   // profile points per part (axis->foot, foot->lip, lip->floor axis)
    segments: 144,                                    // around
    volume: 0.27,                                     // m^3 held constant (every frame is rescaled radially to this)
    rings: 15,                                        // throwing rings up the wall (by profile fraction)
    ringAmp: 0.0026,                                  // m
    stagger: 0.42,                                    // a pull moves the foot first and reaches the lip last
  },
  // key profiles: outer = foot -> lip top, inner = lip top -> floor at the axis (r, y in metres). Smoothed by a
  // Catmull-Rom spline and arc-length resampled per part, so point k of every key is the "same" bit of clay.
  keys: {
    lump: {
      outer: [[0.5, 0], [0.52, 0.05], [0.51, 0.15], [0.45, 0.28], [0.34, 0.39], [0.19, 0.45], [0.04, 0.47]],
      inner: [[0.025, 0.471], [0.0, 0.472]],
    },
    cone: {
      outer: [[0.44, 0], [0.45, 0.06], [0.42, 0.3], [0.36, 0.6], [0.28, 0.86], [0.17, 1.0], [0.04, 1.05]],
      inner: [[0.02, 1.051], [0.0, 1.052]],
    },
    cylinder: {
      outer: [[0.42, 0], [0.43, 0.05], [0.41, 0.3], [0.39, 0.7], [0.385, 1.0], [0.37, 1.1]],
      inner: [[0.33, 1.13], [0.3, 1.1], [0.29, 0.75], [0.285, 0.4], [0.27, 0.26], [0.14, 0.22], [0.0, 0.215]],
    },
    bowl: {
      outer: [[0.36, 0], [0.38, 0.04], [0.5, 0.16], [0.68, 0.32], [0.83, 0.48], [0.9, 0.58]],
      inner: [[0.875, 0.61], [0.84, 0.58], [0.74, 0.47], [0.58, 0.33], [0.4, 0.22], [0.2, 0.16], [0.0, 0.15]],
    },
    collar: {
      outer: [[0.36, 0], [0.4, 0.05], [0.42, 0.3], [0.38, 0.65], [0.29, 1.0], [0.25, 1.28], [0.25, 1.4]],
      inner: [[0.22, 1.42], [0.2, 1.39], [0.2, 1.25], [0.24, 0.95], [0.32, 0.62], [0.34, 0.3], [0.24, 0.16], [0.0, 0.14]],
    },
    vase: {
      outer: [[0.33, 0], [0.38, 0.05], [0.5, 0.25], [0.53, 0.45], [0.45, 0.72], [0.26, 0.98], [0.16, 1.13], [0.155, 1.26], [0.21, 1.38], [0.24, 1.44]],
      inner: [[0.21, 1.455], [0.18, 1.41], [0.125, 1.28], [0.12, 1.14], [0.21, 0.97], [0.39, 0.72], [0.47, 0.45], [0.44, 0.25], [0.3, 0.13], [0.0, 0.11]],
    },
  },
  wobble: { amp: 0.075, offset: 0.035, terms: [[2, 1.3, 4, 1], [3, -0.7, 7, 0.6], [5, 2.1, -3, 0.35]] },
  spin: { rps: 1.0, endRps: 0.16 },        // visual revolutions per second (kept slow so the wobble reads, no strobing)
  streaks: { amp: 0.2, freq: [2, 3, 5] },  // slip streaks (clay-fixed): lightness modulation
  glaze: { soft: 0.022, spiral: 0.035, footBare: 0.035 },
  tool: { azimuth: -0.26, gap: 0.004, ribW: 0.34, ribH: 0.2, ribT: 0.012, handle: 1.8, handleR: 0.024, handleTilt: 0.75, handleYaw: 0.5, retract: 0.55 },
  brush: { azimuth: 2.9, len: 1.6, handleR: 0.022, headW: 0.17, headH: 0.13, headT: 0.05, tilt: 0.55, yaw: -0.45 },

  // ---- the set -----------------------------------------------------------------------------------------------
  wheel: { headR: 0.8, headT: 0.07, panR: 1.08, panH: 0.2, bodyR: 0.62, floorY: -0.95, marks: 6 },
  room: { wallZ: -2.6, wallW: 14, wallH: 7, shelfY: 0.62, shelfZ: -2.38 },
  sunPatch: { x: 0.25, y: 0.42, w: 0.36, h: 0.62, skew: -0.16, soft: 0.05, mullion: 0.018 }, // fractions of the wall texture

  // ---- overlay caption (bottom-left, over the splash pan) -------------------------------------------------------------
  caption: {
    x: 112, y: 900, h: 88, cap: 44, maxW: 860,
    font: '"Avenir Next", "Gill Sans", "Helvetica Neue", Helvetica, sans-serif', weight: 600,
    plate: "#3a2e26", edge: "#5a4a3d", ink: "#fbf4e8", accent: "#d9a46a",
  },

  sound: {
    bed: { root: 130.81, chord: [0, 7, 12, 16], brightness: 820, gain: 0.55 },
    hum: { hz0: 52, hzPerRps: 46, gain: 0.32, grit: 0.12 },
    squish: { gain: 0.5, pitch: 1.0 },
    tool: { gain: 0.18 },
    brush: { gain: 0.3 },
    finish: { hz: 392, gain: 0.32 },
  },
  sfx: { enter: "squish", exit: "whooshOut", move: "whoosh", land: "squish", emphasis: "marimba", ui: "tick", bed: "pad" },
  motion: [
    "The clay is one lathe surface: every frame its profile is interpolated between named key profiles, bottom-up like a pull, then rescaled radially so its volume never changes.",
    "Spin is shown, not simulated: slip streaks and a lumpy off-centre wobble are fixed to the clay and rotate with a closed-form spin angle; the wobble damps to zero as the clay is centred.",
    "The wooden rib sits where the profile is moving fastest (velocity-weighted centroid of the profile), so the tool rides up the wall during a pull.",
    "Glaze sweeps on as a spiral front from foot to lip while the wheel slows; a brush rides the front.",
  ],
};
