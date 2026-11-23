// styles/granular-sorting/spec.js — STYLE_SPEC for "Granular Sorting". Plain data only: JSON-serializable, no THREE,
// no window. Importable from Node (export-spec.mjs, scene.config.js for the simulation + score) and the browser.
// Units: metres at toy scale (the jar is 3.3 m wide, about 15x a real bench jar) so single beads read at 1080p.
//
// The look: a bright kitchen-lab. A clear, straight-sided, flat-fronted glass jar (one bead layer deep) stands on the
// aluminium platform of a small white lab shaker on a pale stone counter, in front of a sage tiled wall. It is filled
// with small cream beads and twelve large glossy red ones. shaker.js simulates the taps; the picture reads the result.

export const STYLE_SPEC = {
  id: "granular-sorting",
  name: "Granular Sorting",
  description:
    "A bright kitchen-lab: a clear, straight-sided, flat-fronted glass jar one bead layer deep, clamped to the aluminium platform of a small white lab shaker on a pale stone counter in front of a sage tiled wall, filled with small cream beads and twelve large glossy red ones mixed at every height. Each tap of the platform lifts and loosens the bed; small beads fall into the gaps that open under the large ones, so the large ones ratchet up and end on top. Bead positions come from a seeded Monte Carlo tap-and-settle simulation run once at load (shaker.js); the hop between stored rest states is drawn.",
  palette: {
    bg: "#eef1ec",
    wall: "#cfe0d4",
    grout: "#f4f6f2",
    counter: "#ebe7df",
    cream: "#f1e4c6",
    red: "#d3242c",
    redDeep: "#9c1218",
    shaker: "#f4f5f6",
    accent: "#2e8c83",
    alu: "#c9cfd5",
    ink: "#1f2a2e",
    glass: "#dff2ee",
    plate: "#ffffff",
  },
  world: {
    background: "#eef1ec",
    fog: { color: "#eef1ec", near: 18, far: 40 },
    environment: "room",
    environmentIntensity: 0.8,
    toneMapping: "neutral",     // keeps the red saturated and the cream warm
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    counter: { type: "standard", baseColor: "#ffffff", roughness: 0.55, metalness: 0 },         // map: speckled stone (style.js)
    wall: { type: "standard", baseColor: "#ffffff", roughness: 0.4, metalness: 0 },             // map: tile canvas (style.js)
    shakerBody: { type: "physical", baseColor: "#f4f5f6", roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3 },
    shakerTrim: { type: "physical", baseColor: "#2e8c83", roughness: 0.4, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3 },
    panel: { type: "physical", baseColor: "#1f2a2e", roughness: 0.35, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.2 },
    platform: { type: "physical", baseColor: "#c9cfd5", roughness: 0.3, metalness: 0.85 },
    rubber: { type: "standard", baseColor: "#2a2f33", roughness: 0.85, metalness: 0 },
    knob: { type: "physical", baseColor: "#e9edf1", roughness: 0.18, metalness: 1 },
    led: { type: "standard", baseColor: "#5fe0b4", roughness: 0.4, metalness: 0, emission: { color: "#5fe0b4", strength: 1.4 } },
    ledOff: { type: "standard", baseColor: "#3c4a46", roughness: 0.4, metalness: 0 },
    glass: { type: "physical", baseColor: "#e8f6f3", roughness: 0.04, metalness: 0, opacity: 0.035, side: "front" },
    glassEdge: { type: "physical", baseColor: "#bfe3da", roughness: 0.08, metalness: 0, opacity: 0.55, clearcoat: 1, clearcoatRoughness: 0.05 },
    lid: { type: "physical", baseColor: "#d9dee3", roughness: 0.28, metalness: 0.9 },
    beadSmall: { type: "physical", baseColor: "#f1e4c6", roughness: 0.38, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.25, sheen: 0.2 },
    beadLarge: { type: "physical", baseColor: "#d3242c", roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 },
    ring: { type: "basic", baseColor: "#1f2a2e", opacity: 0.9 },
    beaker: { type: "physical", baseColor: "#e8f6f3", roughness: 0.05, metalness: 0, opacity: 0.18, clearcoat: 1, clearcoatRoughness: 0.03, side: "double" },
    wood: { type: "standard", baseColor: "#c99a62", roughness: 0.6, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#e3ddd0", intensity: 0.95 },
    {
      id: "key", type: "directional", color: "#fff6ea", intensity: 2.6, position: [-4.5, 7.5, 6.5], target: [0, 1.2, 0],
      shadow: { softness: 4, mapSize: 2048, extent: 3.6, near: 0.5, far: 26, bias: -0.0004, normalBias: 0.02 },
    },
    { id: "rim", type: "directional", color: "#e8f4ff", intensity: 0.9, position: [4.5, 5, -5], target: [0, 1.2, 0] },
  ],
  post: {
    vignette: { darkness: 0.16, offset: 1.2 },
  },
  camera: { fov: 30, near: 0.1, far: 60, drift: { amp: 0, speed: 0.2 } },   // locked during holds (bitrate)
  text: { font: "sans", weight: 700, color: "#1f2a2e", height: 0.3 },

  // ---- the simulation (shaker.js units: small-bead radius = 1) ----------------------------------------------------
  sim: {
    seed: 111,
    width: 72,             // jar inside width in small radii
    small: 480,            // cream beads (radius 1 +- spread)
    large: 12,             // red beads
    bigR: 2.3,             // red bead radius (2.3x the cream ones)
    spread: 0.06,          // cream radius spread (keeps the layer from crystallising)
    looseHeight: 64,       // height of the loose starting heap before it settles
    settleSweeps: 120,     // settle passes for the starting heap
    taps: 64,              // taps simulated (the plan shows up to the first tap after which all twelve stay on top)
    lift: 2,               // every tap lifts the bed by this much ...
    dilate: 0.2,           // ... plus this share of each bead's height (the bed loosens)
    sweeps: 40,            // resettle passes after each tap
    tries: 3,              // random moves tried per bead per pass
    step: [1.0, 0.15],     // largest move per pass, first -> last (down or sideways only)
    cell: 2.2,
    ceiling: 140,
  },
  // ---- the jar, the shaker, the set (metres) -------------------------------------------------------------------
  jar: {
    unit: 0.045,           // metres per small-bead radius (cream bead 9 cm, red bead 21 cm at toy scale)
    innerH: 40,            // inside height in small radii
    glass: 0.028, base: 0.05, edgeR: 0.022, lidH: 0.07,
    depthPad: 0.012,       // inside depth = red bead diameter + this
    zJitter: 0.3,          // cream bead depth jitter (share of the free depth), look only
    clampW: 0.16,
  },
  shaker: {
    body: { w: 3.9, h: 0.5, d: 1.05, r: 0.06 },
    platform: { w: 3.7, h: 0.07, d: 0.78 },
    feet: 0.04,
    panel: { w: 1.5, h: 0.3 },
  },
  set: { counterTop: 0, counterDepth: 3.4, wallZ: -1.3, tile: { w: 0.42, h: 0.21, grout: 0.012 } },
  hop: { up: 0.3, stagger: 0.25, fall: 0.42, vis: 0.35, plate: 1.4, plateShare: 0.42, fastStep: 0.55, fastHop: 0.22 },
  trails: { width: 7, color: "#b8141c", level: 1, z: 0.072 },
  rings: { color: "#1f2a2e", width: 0.06, grow: 1.75, dur: 0.65 },
  highlight: { color: "#f6b938" },              // cream beads that slip under the close-up bead turn amber
  glassLook: { env: 0.25, edgeEnv: 0.8 },

  // ---- overlay caption (top centre) ---------------------------------------------------------------------------
  caption: {
    x: 960, y: 46, h: 112, cap: 62, maxW: 1240,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#ffffff", edge: "#1f2a2e", ink: "#1f2a2e", chip: "#d3242c", chip2: "#e9d8b2",
  },

  sound: {
    rattle: { crackle: 0.55, crackleDur: 0.22, density: 0.7, cracklePitch: 0.9, clicks: 9, fastClicks: 3, spread: 0.16, clickPitch: 0.75, clickVar: 0.5, click: 0.32, thump: 0.25, brighten: 0.55, fastGain: 0.5 },
    settle: { hz: 523.25, notes: [0, 7, 12], gain: 0.22 },
    bed: { root: 98, chord: [0, 7, 12, 16], gain: 0.34, brightness: 700 },
  },
  sfx: { enter: "click", exit: "tick", move: "whoosh", land: "click", emphasis: "marimba", ui: "tick", bed: "pad" },
  motion: [
    "One tap per shake: the platform rises and falls (raised cosine); the bed rides up, loosens (higher beads rise more), then falls back lowest first into the next simulated rest state.",
    "Rest states come from a seeded Monte Carlo tap-and-settle simulation (shaker.js): lift + loosen, then down-or-sideways random moves with no overlaps, lowest bead first.",
    "Small beads fill the gaps that open under large ones; large ones rarely find a gap their size, so they ratchet up a step per tap.",
    "Fast forward strobes the rest states: one quick step per tap, accelerating; red trails draw each large bead's path.",
    "The plate stops on the first tap after which all twelve red beads stay uncovered.",
  ],
};
