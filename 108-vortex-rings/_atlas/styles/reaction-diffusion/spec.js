// styles/reaction-diffusion/spec.js — STYLE_SPEC for "Reaction-Diffusion" (Gray–Scott in a petri dish). Plain data only:
// JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the simulation +
// score) and the browser.
// Units: metres. The dish is toy-scale exaggerated (2 m across) so the camera can sit at macro distances of 1–4 m.
//
// The look: a macro shot of a shallow glass dish on a pale lab bench. Cream gel fills it; a deep-teal pattern grows in
// the gel, slightly raised so the key light catches its edges and a wet specular glint runs along every stripe.
// grayscott.js runs the two-chemical simulation once at load and stores the activator field every half second; the gel
// shader blends the two neighbouring stored states, samples them with a smooth (B-spline) filter, raises the surface
// from the same value and shades it. Five drops land, ring out, pinch into spots, split, meet and lock into a maze.

export const STYLE_SPEC = {
  id: "reaction-diffusion",
  name: "Reaction-Diffusion",
  description:
    "Rules, not a plan: a macro shot of a shallow glass petri dish on a pale lab bench, filled with cream gel in which a deep-teal pattern grows. Five drops land; each spreads into a ring that pinches into spots, the spots split again and again, fronts from different drops meet and lock into one winding maze. The pattern is a real Gray–Scott reaction-diffusion simulation (two substances, 9-point Laplacian, explicit Euler, seeded drops) run once on the CPU at page load; the activator field is stored every 0.5 s of video and the gel shader blends the two neighbouring states, B-spline-filters them, raises the surface from the same value (wet glossy relief) and optionally tints each drop's territory. Soft drop plinks, then a quiet granular crackle whose density follows how much of the dish is patterned and still changing.",
  palette: {
    bg: "#e3e4e1",
    bench: "#dfe1df",
    gel: "#f3e7cc",
    gelDeep: "#e6d3ac",
    ink: "#0b5c63",         // deep teal pattern
    inkDeep: "#073f47",     // pattern cores
    rim: "#f8f4ec",
    caption: "#0b3f45",
    captionInk: "#fbf6ea",
    accent: "#e07a3a",
    // one hue per drop's territory (beat 4 "Neighbours compete"); all dark enough to read on cream
    colonies: ["#0b5c63", "#1f4f93", "#2f7d45", "#7a3f86", "#b4582a"],
  },
  world: {
    background: "#e3e4e1",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.55,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#dfe1df", roughness: 0.78, metalness: 0, bump: { source: "bumpNoise", scale: 36, octaves: 3, seed: 109, strength: 0.12, description: "fine fbm noise: matte laminate bench top" } },
    drop: { type: "physical", baseColor: "#0d6d74", roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 },
    bottleLiquid: { type: "physical", baseColor: "#0d6d74", roughness: 0.2, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.1 },
    cap: { type: "standard", baseColor: "#2b2e33", roughness: 0.55, metalness: 0 },
    bulb: { type: "standard", baseColor: "#c85a32", roughness: 0.6, metalness: 0 },
    tape: { type: "standard", baseColor: "#f4efe2", roughness: 0.85, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fbf8f1", groundColor: "#a39d92", intensity: 1.1 },
    {
      // warm key from front-left and fairly low (35°): it rakes across the gel so raised pattern edges catch light
      id: "key", type: "directional", color: "#fff1dc", intensity: 2.4, position: [-3.4, 3.0, 2.6], target: [0, 0, 0],
      shadow: { softness: 2.5, mapSize: 2048, extent: 2.2, near: 0.5, far: 14, bias: -0.0005, normalBias: 0.01 },
    },
    { id: "rim", type: "directional", color: "#d9e6ff", intensity: 0.6, position: [2.6, 2.4, -4.0], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.28, offset: 1.15 },
  },
  camera: { fov: 32, near: 0.05, far: 30, drift: { amp: 0, speed: 0.2 } },   // no drift: holds stay still (bitrate)
  text: { font: "sans", weight: 700, color: "#0b3f45", height: 0.3 },

  // ---- the dish -------------------------------------------------------------------------------------------
  dish: {
    radius: 1.0,          // inner radius = gel radius (m)
    wall: 0.022,          // glass wall thickness
    height: 0.15,         // wall height above the bench
    floor: 0.025,         // glass floor thickness
    gelTop: 0.075,        // gel surface height above the bench (before relief)
    meniscus: 0.012,      // gel climbs the wall by this much over the outer `meniscusW`
    meniscusW: 0.06,
    segments: 360,        // gel grid (vertex displacement)
    glass: { color: "#e8f3f1", alphaFace: 0.05, alphaRim: 0.55, fresnelPower: 2.2, rimStrength: 0.35 },
  },
  // ---- the gel shader ------------------------------------------------------------------------------------
  gel: {
    relief: 0.02,          // m the pattern stands proud of the gel at full activator
    edge: [0.35, 0.4],      // activator (0..1 of vMax) -> ink coverage smoothstep
    core: [0.55, 0.85],     // -> deeper core colour
    gloss: 80,              // Blinn exponent of the wet glint
    spec: 0.7,              // glint strength
    sheen: 0.18,            // grazing fresnel brightening (wet gel)
    mottle: 0.035,          // static cream mottling amplitude
    colonyBase: 0,          // how much each drop's territory is tinted outside beat 4 (0 = all one teal)
    colonyBlur: 2,          // box-blur passes on the territory colours (soft borders)
    sss: 0.22,              // soft light that wraps into shadowed slopes (gel is translucent)
  },
  // ---- simulation (grayscott.js) --------------------------------------------------------------------------
  sim: {
    n: 160, radius: 76, Du: 1.0, Dv: 0.5, seed: 109, seedNoise: 0.03, storeEvery: 0.25, vMax: 0.5, claimAt: 0.18,
    // mitosis regime (spots split) eased to a coral/maze regime (spots stretch and lock into stripes)
    spots: { F: 0.0367, k: 0.0649 },
    stripes: { F: 0.0545, k: 0.062 },
    ring: { r: 14, w: 4 },          // each drop lands as an annulus (cells): it pinches into spots
  },
  drop: { radius: 0.06, fall: 0.42, height: 1.6, squash: 0.2, ripple: { amp: 0.006, speed: 0.9, width: 0.05, decay: 2.6, life: 1.1 } },

  // ---- overlay caption (top-left chip) -----------------------------------------------------------------------
  caption: {
    x: 84, y: 66, h: 92, cap: 42, font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#0b3f45", edge: "#2a6a70", ink: "#fbf6ea", dot: "#f3e7cc", maxW: 900,
  },

  sound: {
    drop: { gain: 0.75, pitch: [0.85, 1.25] },
    grain: { gain: [0.05, 0.16], pitch: [1.4, 3.2], rate: [3, 30] },
    bed: { gain: 0.42, root: 146.8, chord: [0, 7, 12, 16], brightness: 700, attack: 2.5, release: 2.5 },
  },
  sfx: { enter: "bubble", exit: "whooshOut", move: "whoosh", land: "bubble", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "The pattern is simulated (Gray–Scott) once at load; renderAt only picks the two stored states around t and blends them.",
    "Video time -> simulation steps is a time-lapse clock: almost frozen while the drops land, then fast.",
    "Each drop falls (inQuad), squashes into the gel and leaves a damped ripple ring; the same landing time injects its ring of activator.",
    "Camera: one move per beat, still holds; macro and raking in beat 4 so the relief catches the light; full-dish pull-back at the end.",
  ],
};
