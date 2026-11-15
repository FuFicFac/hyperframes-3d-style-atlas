// styles/kintsugi/spec.js — STYLE_SPEC for "Kintsugi" (break and mend with gold). Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the fracture plan + score) and the browser.
// Units: metres. The bowl is toy-scale exaggerated (2.3 m across) so a gold seam ~2 cm wide reads at 1080p.
//
// The look: a glossy celadon tea bowl on pale oatmeal linen in soft window daylight. It falls and breaks into a
// dozen-odd shards along a seeded fracture (fracture.js), the shards drift back into place, and molten gold runs along
// every seam from one pour point on the rim, ending as a raised, glossy, slightly irregular gold bead with a few
// gold-filled chips. The same plan drives the shard clinks and the gold "pour" chimes.

export const STYLE_SPEC = {
  id: "kintsugi",
  name: "Kintsugi",
  description:
    "Break and mend: a glossy celadon tea bowl on pale oatmeal linen in soft window daylight falls, cracks along a seeded fracture (weighted spherical Voronoi of warped surface directions, so each crack runs through the whole wall) and splays into a dozen-odd shards that tip outward, clink down on the cloth convex side down and rest; they rise along arcs and slot back home; then molten gold runs ALONG the seams from one pour point on the rim (a Dijkstra arrival field over the seam network, baked into a texture), glowing hot at its leading tip and cooling to a raised, glossy, slightly irregular gold bead, with a few chipped-out spots filled flush with gold. Seams are evaluated per fragment, so they stay crisp at any distance. Ends on a slow orbit with the gold catching the light. Shard landings, returns and every seam junction the gold reaches are sound cues from the same plan.",
  palette: {
    bg: "#efe8dc",
    linen: "#e7ddcd",
    linenThread: "#d6c8b2",
    glaze: "#98c2aa",
    glazeDeep: "#5f917a",
    glazeLight: "#c4ddcd",
    iron: "#9b7a5a",
    foot: "#d6bf9c",
    bisque: "#cdb08a",
    gold: "#f0c25a",
    goldDeep: "#b9852c",
    hot: "#ffb05a",
    ink: "#2a2622",
    chip: "#2b2724",
    chipInk: "#f6efe2",
  },
  world: {
    background: "#efe8dc",
    sky: null,
    fog: { color: "#efe8dc", near: 9, far: 24 },
    environment: "room",
    environmentIntensity: 0.75,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    linen: { type: "standard", baseColor: "#ffffff", roughness: 0.95, metalness: 0 },
    glaze: { type: "physical", baseColor: "#98c2aa", roughness: 0.2, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.12 },
    stream: { type: "standard", baseColor: "#f0c25a", roughness: 0.2, metalness: 1, emission: { color: "#ffb05a", strength: 2.2 } },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#f4f6f8", groundColor: "#d9cdb9", intensity: 1.15 },
    {
      // soft window daylight from back-left, a little warm: short soft shadows forward-right, a long gloss on the glaze
      id: "key", type: "directional", color: "#fff1dd", intensity: 2.5, position: [-4.5, 6.5, -2.8], target: [0, 0.3, 0],
      shadow: { softness: 4, mapSize: 2048, extent: 3.2, near: 0.5, far: 24, bias: -0.0005, normalBias: 0.02 },
    },
    // front-right bounce card: lifts the camera-side wall so the glaze and seams read
    { id: "bounce", type: "directional", color: "#fff8ee", intensity: 0.9, position: [4, 2.5, 5], target: [0, 0.4, 0] },
  ],
  post: {
    bloom: { strength: 0.35, radius: 0.35, threshold: 2.2 },   // only the gold glints and the molten tip bloom
    vignette: { darkness: 0.22, offset: 1.15 },
  },
  camera: { fov: 30, near: 0.3, far: 60, drift: { amp: 0, speed: 0.2 } },
  text: { font: "serif", weight: 600, color: "#2a2622", height: 0.3 },

  // ---- the bowl (lathe profile, metres) -------------------------------------------------------------------
  bowl: {
    rimR: 1.15, rimY: 0.85, wall: 0.045, footR: 0.46, footH: 0.09, footW: 0.07, under: 0.06, flare: 1.7,
    centreY: 0.42,      // C = (0, centreY, 0): every surface point is labelled by its direction from C
    steps: 80,          // profile steps along the outer and inner wall
    segments: 360,      // lathe segments around
  },
  // ---- the fracture (fracture.js makeField) -----------------------------------------------------------------
  fracture: {
    seed: 63,
    base: { weight: 0.48 },                                     // the foot piece (stays put)
    rings: [
      { n: 5, elev: -0.17, elevJitter: 0.09, azJitter: 0.22, weight: 0 },   // lower wall
      { n: 7, elev: 0.21, elevJitter: 0.07, azJitter: 0.2, weight: 0 },     // rim pieces
    ],
    waves: [
      { n: 6, freq: [3, 6], amp: 0.05 },       // big wander of each crack
      { n: 6, freq: [14, 26], amp: 0.011 },    // fine jaggedness
    ],
  },
  shardMotion: {
    impactDir: [0.15, -1, 0.3],   // cracks race out from here (the foot, camera side)
    crackSpeed: 7,                // rad/s of direction
    crackDelay: 0.08,
    startJitter: 0.08,
    fallDur: [0.62, 0.8], ringFallExtra: 0.1, pop: 0.1,
    bounce: 0.05, bounceT: 0.16,
    restYaw: 0.5, footprint: 0.92, restRadius: [1.3, 1.8], gap: 0.04, baseClear: 0.6, maxRadius: 2.35,
    returnStep: 0.09, returnJitter: 0.05, ringReturnExtra: 0.25, returnDur: [1.1, 1.4], arc: 0.3, seat: 0.006,
    setDown: 0.3, rock: 0.035, liftH: 0.3, liftTilt: 0.06, baseJolt: 0.02,
  },
  gold: {
    gridU: 720, gridV: 200,       // arrival-field texture
    pourAz: 1.4,                  // rim azimuth (atan2(z, x)) of the pour point; the scene passes its own
    flowDur: 2.5,                 // s for the gold to reach the farthest seam
    halfWidth: 0.0105,            // m, gold bead half width (x width wobble 0.75..1.25)
    grow: 0.07,                   // rad behind the front over which the bead swells to full width
    hot: 0.42,                    // rad behind the front that still glows molten
    bump: 1.1,                    // bead normal tilt at its edge
    crackWidth: 0.0028,           // m, dark hairline half width once cracked
  },
  chips: { n: 3, elev: [-0.3, 0.33], radius: [0.032, 0.05], minSep: 0.9 },
  linen: { size: 40, threadsPerMetre: 34, contrast: 0.05, slub: 0.08, seed: 7 },

  // ---- overlay caption chip (bottom-left; the bowl is an ellipse so the corner is free) -------------------
  caption: {
    x: 120, y: 930, h: 84, cap: 40, maxW: 820,
    font: '"Hiragino Mincho ProN", "Songti SC", Georgia, serif', weight: 600,
    plate: "#2b2724", edge: "#4a423a", ink: "#f6efe2", gold: "#e3b552",
  },

  sound: {
    bed: { root: 146.83, chord: [0, 7, 14, 19], brightness: 760, gain: 0.5 },
    clink: { hz: 1760, decay: 0.11, gain: 0.32, tick: 0.18 },
    impact: { thud: 0.55, crack: 0.6, crackle: 0.45 },
    home: { hz: 1175, gain: 0.2, clack: 0.22 },
    whoosh: 0.32,
    pour: { root: 293.66, brightness: 2200, gain: 0.32, sizzle: 0.12 },
    junction: { pitch: 1.5, gain: 0.13 },
    koto: { hz: 293.66, gain: 0.55 },
  },
  sfx: { enter: "marimba", exit: "whooshOut", move: "whoosh", land: "marimba", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Every surface point is labelled by its direction from a point inside the bowl, so outer wall, rim and inner wall break together and each crack runs through the whole wall.",
    "Seams are evaluated per fragment (warped weighted spherical Voronoi): crisp hairlines and gold beads at any distance; the shards share one geometry and discard what is not theirs.",
    "Shards tip outward and fall on closed-form arcs to precomputed resting poses (convex side down, relaxed apart), bounce twice, then rise on arcs and slot home — nothing simulated.",
    "Gold runs along the seam network from one pour point (Dijkstra arrival field baked to a texture): hot at the tip, swelling to a raised glossy bead behind it.",
  ],
};
