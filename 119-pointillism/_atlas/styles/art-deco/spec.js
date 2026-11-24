// styles/art-deco/spec.js — STYLE_SPEC for "Art Deco". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the deco plan + score) and the browser.
// Units: metres. The tower is toy-architecture scale (~15 m with the spire) so ornament reads at 1080p in a wide.
//
// The look: 1920s–30s machine-age ornament in polished brass/gold, black lacquer, cream marble and jade, under a lit
// cream-to-teal sky. Everything is mirrored about x = 0 and grows in terraces. deco.js plans every unfolding (doors,
// fan rays, tiers, spire, crown ornaments, title panel) from one list; the same list drives the chords and clicks.

export const STYLE_SPEC = {
  id: "art-deco",
  name: "Art Deco",
  description:
    "Machine-age Art Deco in polished brass and gold, black lacquer, cream marble and jade under a bright cream-to-teal sky: bronze elevator doors with an inlaid fan slide apart, a gold sunburst fans open ray by ray like a folding fan, a stepped ziggurat skyscraper telescopes up terrace by terrace (vertical fluting, glowing frosted-glass window bays, chevron parapets, a spire extending last) while two searchlights sweep in mirror image, crown ornaments (chevrons, scallop fans, sunray fans, stepped keystone frames, finials) click into place in mirrored pairs, and a framed title panel unfolds from the centre line. The signature is symmetric unfolding and stepped ascent: every element is mirrored about one centre line and grows in terraces; a THREE-free planner (deco.js) times every unfold and the stepped rising chords (one per tier), ray notes and ornament clicks come from the same plan.",
  palette: {
    bg: "#f1e2c4",
    skyTop: "#3f8f8c",
    skyMid: "#9cc7b9",
    skyLow: "#f5e6c8",
    gold: "#e0b04f",
    goldDeep: "#b9852f",
    bronze: "#a86f3c",
    lacquer: "#141416",
    marble: "#f2e8d5",
    marbleShade: "#d9c9a8",
    jade: "#1f7d74",
    jadeDeep: "#135650",
    glass: "#fff3d8",
    ink: "#141416",
    cream: "#fbf3e2",
  },
  world: {
    background: "#f1e2c4",
    // screen-space backdrop: teal zenith -> pale jade -> warm cream horizon (stop 0 = top of frame)
    sky: { stops: [[0, "#3f8f8c"], [0.42, "#8fc0b2"], [0.78, "#f2dfbd"], [1, "#f6e8cc"]], size: 256 },
    fog: null,
    environment: "room",
    environmentIntensity: 0.8,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    gold: { type: "physical", baseColor: "#e3b252", roughness: 0.26, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.2, emission: { color: "#8a5f1c", strength: 0.18 } },
    goldRay: { type: "standard", baseColor: "#e9b44e", roughness: 0.3, metalness: 0.8, emission: { color: "#b9802a", strength: 0.22 } },
    rayCream: { type: "physical", baseColor: "#1f8a7f", roughness: 0.25, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.1, emission: { color: "#0f5a52", strength: 0.2 } },
    bronze: { type: "standard", baseColor: "#a86f3c", roughness: 0.32, metalness: 0.9, emission: { color: "#5a3416", strength: 0.15 } },
    lacquer: { type: "physical", baseColor: "#17171a", roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 },
    marble: { type: "standard", baseColor: "#f2e8d5", roughness: 0.38, metalness: 0, 
      bump: { source: "bumpNoise", scale: 10, octaves: 4, seed: 70, strength: 0.06, description: "soft fbm: honed marble" } },
    marbleShade: { type: "standard", baseColor: "#dccbaa", roughness: 0.45, metalness: 0 },
    jade: { type: "physical", baseColor: "#22867c", roughness: 0.22, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.1, emission: { color: "#0f4a44", strength: 0.25 } },
    glass: { type: "standard", baseColor: "#fff3d8", roughness: 0.55, metalness: 0, emission: { color: "#ffd890", strength: 1.1 } },
    sun: { type: "standard", baseColor: "#fff6df", roughness: 0.5, metalness: 0, emission: { color: "#ffe0a0", strength: 1.3 } },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fff6e6", groundColor: "#a08a68", intensity: 0.8 },
    {
      // warm high key from front-left: gold reads bright, setbacks throw short soft shadows down-right
      id: "key", type: "directional", color: "#ffeccc", intensity: 2.3, position: [-9, 18, 16], target: [0, 6, -12],
      shadow: { softness: 2.5, mapSize: 2048, extent: 16, near: 1, far: 70, bias: -0.0004, normalBias: 0.03 },
    },
    // mirror-side warm fill (keeps the right half from going dark: symmetry wants both halves lit)
    { id: "fillR", type: "directional", color: "#ffe2b8", intensity: 0.7, position: [10, 9, 14], target: [0, 5, -12] },
    // cool back light: rims the setbacks against the sky
    { id: "rim", type: "directional", color: "#d6ecff", intensity: 0.9, position: [0, 14, -30], target: [0, 5, -12] },
  ],
  post: {
    bloom: { strength: 0.22, radius: 0.35, threshold: 2.6 },
    vignette: { darkness: 0.22, offset: 1.15 },
  },
  camera: { fov: 35, near: 0.3, far: 140, drift: { amp: 0, speed: 0.2 } },   // no drift: holds stay still (bitrate)
  text: { font: '"Futura", "Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700, color: "#fbf3e2", height: 0.5 },

  // ---- lettering (system faces only: Futura / Avenir Next / Copperplate / Didot ship with macOS) ----------------
  type: {
    face: '"Futura", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
    display: '"Futura", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
    serif: '"Didot", "Bodoni 72", Georgia, serif',
    tracking: 0.22,          // letter spacing as a fraction of cap size (wide)
  },

  // ---- set pieces ------------------------------------------------------------------------------------------
  doors: {
    z: 4, opening: [6.0, 5.0],          // doorway w x h (m)
    leafThickness: 0.12, wallThickness: 0.6, wallSize: [30, 10],
    frame: { steps: 3, step: 0.32, depth: 0.12 },   // stepped keystone frame around the doorway
    slide: 3.05,                         // each leaf slides this far into the wall pocket
  },
  sunburst: {
    center: [0, 2.0, -21], rays: 17, spread: 180, inner: 2.6, outer: 19, width: 0.075,   // width = half-angle fraction of the slot
    sunRadius: 2.4, depth: 0.25,
  },
  plinth: { z: -19.2, width: 80, steps: [[2.3, 0], [1.5, 0.9], [0.8, 1.8]] },   // [height, setback] stepped band behind the tower
  tower: {
    z: -12,
    tiers: [
      { w: 11.0, h: 2.8, d: 7.0, bays: 7 },
      { w: 8.4, h: 2.6, d: 5.6, bays: 5 },
      { w: 6.2, h: 2.4, d: 4.4, bays: 5 },
      { w: 4.6, h: 2.2, d: 3.4, bays: 3 },
      { w: 3.2, h: 2.0, d: 2.6, bays: 3 },
    ],
    wings: { w: 3.6, gap: 0.5, tiers: [[3.6, 2.0], [2.6, 1.4]], d: 4.0 },   // mirrored flanking blocks [w, h]
    spire: { h: 3.4, r: 0.32 },
    cap: 0.2, capOver: 0.18,             // marble setback ledge thickness + overhang
    flute: 0.07,                         // gold fluting rod radius
  },
  searchlight: { x: 9.5, z: -16, length: 34, radius: 2.4, tilt: 0.16, sweep: 0.32, hz: 0.18, opacity: 0.32 },
  floor: { size: 120, z: -10 },
  panel: { w: 12, h: 3.5, z: -6, y: 1.4, steps: 3, step: 0.22 },

  // ---- overlay caption (bottom centre, exact colours) ----------------------------------------------------------
  caption: {
    x: 960, y: 900, h: 96, cap: 40, maxW: 980,
    plate: "#141416", edge: "#e0b04f", ink: "#fbf3e2", accent: "#2a9a8f",
  },

  sound: {
    bed: { gain: 0.42, root: 73.42, chord: [0, 7, 12, 16, 19], brightness: 700 },
    open: { gain: 0.5, rumble: 0.35, whoosh: 0.3 },
    ray: { gain: 0.26, decay: 0.35 },
    tier: { gain: 0.34, brightness: 2300, dur: 1.5, mallet: 0.22 },
    spire: { riser: 0.28, chime: 0.18 },
    click: { gain: 0.45 },
    title: { gain: 0.42, chime: 0.2 },
  },
  sfx: { enter: "pop", exit: "whooshOut", move: "whoosh", land: "clack", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Everything is mirrored about x = 0: a left part and its mirror move together; nothing happens on one side alone.",
    "Doors slide apart into their wall pockets; the fan behind opens like a folding fan — the outermost blade leads and each ray stops in its slot.",
    "Tiers telescope up out of the tier below (outBack), one chord per tier; the spire extends last; the camera cranes with the growth.",
    "Crown ornaments arrive in mirrored pairs sliding or swinging in toward the centre line and click into place.",
  ],
};
