// styles/impasto/spec.js — STYLE_SPEC for "Impasto" (thick oil paint laid stroke by stroke along a flow field).
// Plain data only: JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for
// the stroke plan + score) and the browser.
// Units: metres. The canvas is 4.8 x 2.7 m (16:9) lying flat on a table (y up = paint height); strokes are toy-scale
// exaggerated (30-40 cm long, 1.2-2 cm thick) so each one reads at 1080p and casts a real shadow under a raking light.
//
// The look: a primed, woven canvas. Short thick strokes with sculpted relief (bristle grooves running along the stroke,
// raised ridges at both edges, a blob where the brush lifted) are laid one after another along a seeded swirling vector
// field (strokes.js): halo rings around a moon and stars, a big double swirl in the sky, contour strokes on the hills,
// flame strokes on a cypress, short dabs for a village. Ultramarine, cobalt, chrome yellow, viridian, orange. A raking
// light sweeps across so the ridges cast tiny shadows and catch glossy highlights. Then the sky flows: every stroke
// slides along its own streamline as a pure function of t.

export const STYLE_SPEC = {
  id: "impasto",
  name: "Impasto",
  description:
    "Thick oil paint in the post-impressionist manner: on a primed woven canvas, short fat brushstrokes with real 3D relief (bristle grooves along the stroke, raised edge ridges, a blob where the brush lifted, two colours dragged together) are laid one after another along a seeded swirling flow field — halo rings around a glowing moon and stars, a big double swirl in the sky, contour strokes on rolling hills, flame strokes up a cypress, dabs for a village — in ultramarine, cobalt, chrome yellow, viridian and orange. A raking light sweeps across so the paint ridges cast tiny shadows and catch glossy highlights; the camera can drop low and close so the canvas reads as a landscape of paint. Then the swirls flow: every stroke slides along its own precomputed streamline as a pure function of t. One InstancedMesh (~1,100 strokes), each instance bent into a constant-curvature arc in the vertex shader, with per-pixel bristle normals in the fragment shader; a planner schedules the stroke order and the brush sounds from the same list.",
  palette: {
    bg: "#efe9dc",
    canvas: "#f2ede1",
    table: "#c9a77c",
    ink: "#1d2433",
    ultramarine: "#2c4aa0",
    cobalt: "#3f6cc0",
    chrome: "#f2c53a",
    viridian: "#2e7d5b",
    orange: "#e88a2a",
    chip: "#f6f1e6",
    chipEdge: "#c9bfa9",
  },
  world: {
    background: "#efe9dc",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.45,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    canvas: { type: "standard", baseColor: "#f2ede1", roughness: 0.88, metalness: 0 },
    canvasEdge: { type: "standard", baseColor: "#e9e2d2", roughness: 0.9, metalness: 0 },
    stretcher: { type: "standard", baseColor: "#b8916a", roughness: 0.7, metalness: 0 },
    table: { type: "standard", baseColor: "#ffffff", roughness: 0.75, metalness: 0, map: { source: "wood", size: 512, boards: 5, seed: 64, dark: "#9b7650", mid: "#bf9a6e", light: "#d8b98f", repeat: [3, 3], description: "light oak table boards" } },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fbf6ec", groundColor: "#a89a86", intensity: 1.05 },
    {
      // the RAKING key: direction is re-set every frame from `rake` below (elevation + azimuth keys); this is the start pose
      id: "key", type: "directional", color: "#fff3df", intensity: 2.5, position: [-6, 4.2, 2.5], target: [0, 0, 0],
      shadow: { softness: 1.6, mapSize: 4096, extent: 2.95, near: 0.5, far: 24, bias: -0.00015, normalBias: 0.004 },
    },
  ],
  post: {
    vignette: { darkness: 0.22, offset: 1.15 },
  },
  camera: { fov: 32, near: 0.08, far: 40, drift: { amp: 0, speed: 0.2 } },   // no drift: still holds keep 1,100 strokes still
  text: { font: "serif", weight: 700, color: "#1d2433", height: 0.3 },

  // ---- canvas + table ------------------------------------------------------------------------------------
  canvas: {
    w: 4.8, h: 2.7, thickness: 0.045, y: 0.045,          // top surface height above the table
    weave: { px: 512, threads: 64, repeat: [20, 11], bump: 0.6, description: "plain-weave linen threads, primed" },
    underpaint: { strength: 0.78, lighten: 0.18, fade: 0.35 },   // thin wash under the strokes: mix toward stroke colour
  },
  table: { size: 14 },

  // ---- strokes: relief profile (unit stroke: u 0..1 along, v -1..1 across) -----------------------------------
  stroke: {
    segU: 30, segV: 12,
    bristles: 7,          // grooves across the stroke (fragment normals)
    groove: 0.16,         // groove depth (share of stroke height)
    rim: 0.38,            // raised edge ridge height
    rimAt: 0.8,           // |v| of the ridge crest
    blob: 0.75,           // extra height of the lift blob
    blobAt: 0.86, blobW: 0.075,
    edge: 0.18,           // height left at the outline (a step: later strokes sit on earlier ones)
    startTaper: 0.07, endCap: 0.12, blobWiden: 0.22,
    streak: 0.55,         // how much the second colour streaks through
    lift: 0.0006, liftStep: 0.0000055,   // base lift + per-stroke-order lift (later strokes lie on top)
    roughness: 0.3, grooveRough: 0.25, envBoost: 1.0,
    normalStrength: 1.0,
  },

  // ---- raking light keys: { t, elev (rad above canvas), az (rad, 0 = from +X, pi/2 = from -Z) } -----------------
  rakeDefault: [{ t: 0, elev: 0.62, az: 2.5 }],

  // ---- overlay caption chip (bottom centre) ----------------------------------------------------------------
  caption: {
    x: 960, y: 912, h: 84, cap: 40, maxW: 820,
    font: 'Georgia, "Times New Roman", Times, serif', weight: 700, italic: true,
    plate: "#f6f1e6", edge: "#c9bfa9", ink: "#1d2433", dab: ["#2c4aa0", "#f2c53a", "#2e7d5b"],
  },

  sound: {
    minGap: 0.075, slowDur: 0.3,
    brush: { gain: 0.55, body: 0.32, fast: 0.55, pitch: 0.42 },
    lift: { gain: 0.3 },
    beat: { gain: 0.16, notes: [392, 440, 494, 587, 659] },
    flow: { whoosh: 0.35, root: 98, chord: [0, 7, 12, 16], brightness: 900, gain: 0.32 },
    bed: { root: 110, chord: [0, 7, 12, 19], brightness: 750, gain: 0.5 },
  },
  sfx: { enter: "penScratch", exit: "whooshOut", move: "whoosh", land: "squish", emphasis: "marimba", ui: "tick", bed: "pad" },
  motion: [
    "A stroke grows from its start point along its own arc (progress = outCubic over its duration); the lift blob rides at the brush end.",
    "Stroke order and timing come from strokes.js: moon and stars first, then the sky spiralling out from the big swirl, then hills, village, fields and the cypress last; each beat accelerates into a time-lapse.",
    "The raking key light's elevation and azimuth are keyed on t; low elevation makes every ridge cast a shadow.",
    "Flow: after flow.t0 each stroke slides along its precomputed streamline by v * G(t) — halo rings rotate, the swirl turns; nothing is integrated per frame.",
  ],
};
