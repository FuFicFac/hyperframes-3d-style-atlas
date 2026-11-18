// styles/shadow-puppets/spec.js — STYLE_SPEC for the shadow-theatre style. Plain data only (JSON-safe, no THREE, no window).
// Units: metres, Y-up right-handed, colours sRGB hex, angles radians, three.js light units.
// World frame: the cloth is the plane z = 0 facing the audience (+z); lamp and puppets live behind it (z < 0).
export const STYLE_SPEC = {
  id: "shadow-puppets",
  name: "Shadow Puppets",
  description:
    "A shadow theatre: a warm glowing cloth screen (soft weave, slight sag, a wooden frame) lit from behind by one lamp, on which flat cut-out puppets on rods cast real shadows — crisp at the cloth, big and soft near the lamp — with jewel-coloured gel windows, jointed limbs, sliding scenery layers and a gentle cloth ripple.",
  palette: {
    bg: "#140b07",
    cloth: "#fff1d6",      // the cloth's own tint (multiplies the lamp)
    lamp: "#ffc98a",       // lamp colour (warm tungsten)
    shadow: "#2a140b",     // what a full shadow reads as (ambient front light on the cloth)
    wood: "#6b4128",
    woodDark: "#3a2216",
    card: "#1d120c",       // puppet card (the real cut-outs behind the cloth)
    ink: "#2a160c",
    cream: "#f6e6c4",
    gold: "#d9a441",
  },
  // gel colours (sRGB): the transmission colour of the coloured film in a cut-out window
  gels: {
    ruby: "#e0233f",
    amber: "#ffae1a",
    emerald: "#20b25c",
    sapphire: "#3b7bff",
    violet: "#9a4ae0",
    rose: "#ff6b8e",
    plain: "#ffffff",
  },
  world: { background: "#140b07", environment: null, toneMapping: "neutral", exposure: 1.0, shadowType: "auto" },
  materials: {
    wood: { type: "standard", baseColor: "#8a5634", roughness: 0.62, metalness: 0,
      map: { source: "wood", size: 512, boards: 3, seed: 41, grainFreq: 26, contrast: 0.45, dark: "#5a3520", mid: "#8a5634", light: "#b47a4a", seam: "#24140c", description: "warm stained pine, 3 boards per tile" } },
    woodDark: { type: "standard", baseColor: "#4a2c1b", roughness: 0.7, metalness: 0 },
    card: { type: "standard", baseColor: "#1d120c", roughness: 0.85, metalness: 0, side: "double" },
    rod: { type: "standard", baseColor: "#9a7a52", roughness: 0.6, metalness: 0 },
    brass: { type: "standard", baseColor: "#b8893c", roughness: 0.35, metalness: 0.8 },
    wall: { type: "standard", baseColor: "#24150d", roughness: 0.95, metalness: 0 },
  },
  lights: [
    // front of house: a dim warm wash so the frame reads; the cloth itself is self-lit by the shader (lamp behind)
    { id: "house", type: "hemisphere", color: "#ffd9b0", groundColor: "#1a0e08", intensity: 1.0 },
    { id: "front", type: "directional", color: "#ffcf9e", intensity: 3.0, position: [-2.5, 5.5, 9], target: [0, 2, 0] },
    // the cloth's own glow spilling onto the inner frame faces
    { id: "spill", type: "point", color: "#ffbf7a", intensity: 14, position: [0, 2.1, 1.1], distance: 10, decay: 2 },
  ],
  // the screen: cloth rectangle, frame rails, lamp, transmission
  screen: {
    width: 6.4, height: 3.4, bottom: 0.45,       // cloth extent (world), bottom edge height
    frame: { rail: 0.16, depth: 0.14, playboard: 0.45, cap: 0.05 },  // side/top rail width, rail depth, bottom board height
    sag: 0.035,                                   // cloth bows back this much at the centre (m)
    hem: { width: 0.045, density: 0.72 },         // the double-layer hem along the edges (transmission x density)
    ties: { every: 0.42, size: 0.022 },           // cloth ties to the frame (small dark knots along the hem)
  },
  cloth: {
    gain: 1.0,              // transmitted light at the hot-spot centre (linear)
    falloff: 0.75,          // exponent on the lamp's cos/d^2 falloff (1 = physical, lower = more even)
    hotGain: 0.38,          // forward-scatter hot spot (the lamp glowing through the cloth, toward the viewer)
    hotExp: 22,
    floor: "#2a140b",       // full-shadow colour (front ambient + scatter)
    floorLevel: 0.055,      // linear level of that colour
    weave: { pitch: 0.021, amp: 0.035, slub: 0.05, drape: 0.035, drapeFreq: 1.6 },
    ripple: { amp: 0.0045, shade: 3.5, speed: 0.55, waves: [[0.9, 0.25, 1.0], [-0.55, 0.8, 0.7], [0.35, -0.95, 0.5]] },
  },
  lamp: { x: 0, y: 2.15, z: -4.0, r: 0.09, color: "#ffc98a", level: 1.0 },
  projector: { rt: [1600, 850], margin: 0.06, minWidth: 0.006, cardT: 0.012, gelGain: 0.92, bakePxPerMetre: 340, bakeMax: 900 },
  post: {
    bloom: { strength: 0.22, radius: 0.55, threshold: 1.25 },
    vignette: { darkness: 0.42, offset: 1.05 },
    grain: { amount: 0.012, fps: 30 },
  },
  camera: { fov: 35, near: 0.3, far: 60, drift: { amp: 0.012, speed: 0.22 } },
  text: { font: "serif", weight: 700, color: "#f6e6c4", height: 0.4 },
  overlay: { font: "serif", px: 64, tracking: 7, color: "#f6e6c4", plaque: "#2b170d", edge: "#d9a441", fadeDur: 0.4, outDur: 0.35, rise: 10 },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "whoosh", land: "clack", emphasis: "thud", ui: "click", bed: "pad" },
  sound: {
    bed: { root: 98, chord: [0, 7, 12, 16, 19], brightness: 650 },
    pluck: { base: 0.5, scale: [0, 2, 4, 7, 9, 12, 14, 16] },   // blip pitch multiplier for 440 Hz; pentatonic semitones
    tap: { type: "clack", pitch: 0.42 },
    swish: { type: "whoosh", pitch: 0.42, q: 0.9 },
  },
  motion: [
    "Size and softness come from depth: a puppet moved toward the lamp grows and blurs, toward the cloth it shrinks and sharpens (M = L/(L-d), penumbra = 2r d/(L-d)).",
    "Scenery slides in from the sides in layers at different depths (near-cloth layers crisp, farther layers slightly larger and softer).",
    "Jointed limbs swing on their own rods (walk cycles from the planner; every footfall is a soft wooden tap).",
    "Moving the lamp swings and stretches every shadow at once — far-from-cloth puppets move most.",
    "The camera barely moves: the screen fills the frame; zoom is done with puppets.",
  ],
};
