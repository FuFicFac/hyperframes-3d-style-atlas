// styles/hanging-mobile/spec.js — STYLE_SPEC for "Hanging Mobile". Plain data only: JSON-serializable, no THREE,
// no window. Importable from Node (export-spec.mjs, render-sfx.mjs, balance.js users) and the browser.
// Units: metres, Y-up right-handed, sRGB hex, radians, three.js light units.
//
// The look: a kinetic hanging mobile in a bright white gallery. Thin black wire arms, fine dark threads, flat painted
// sheet-metal plates in bold primaries plus black and white, turning slowly in still air; a skylit white wall behind
// catches crisp-soft shadows of everything. Gallery frame: the mobile hangs in the plane z = 0 (root pivot at
// `gallery.rootY`), the wall is the plane z = gallery.wallZ, the floor is y = 0.

export const STYLE_SPEC = {
  id: "hanging-mobile",
  name: "Hanging Mobile",
  description:
    "A kinetic hanging mobile in a bright skylit gallery: thin black wire arms with end loops, fine threads and flat painted sheet-metal plates (disc, leaf, crescent, triangle, custom outlines) in bold red, yellow, blue, black and white turn slowly in still air, while crisp soft shadows drift across the white wall behind. Balance is computed for real: every arm's pivot is solved from the weights on each side (weight = plate area), so hanging a new shape or changing a weight tilts that arm and every arm above it, the whole structure swings and re-settles with a closed-form damped oscillation, and a re-balance slides each pivot loop to the new centre. Small engraved tags hang under the plates; a museum-label overlay carries the words.",
  palette: {
    wall: "#f7f6f3",
    floor: "#d6d1c8",
    ceiling: "#f6f5f2",
    shadowGap: "#3a3835",
    wire: "#151515",
    thread: "#2b2a28",
    red: "#d42a1f",
    yellow: "#f3b80c",
    blue: "#1f4fae",
    black: "#161616",
    white: "#f7f5ef",
    steel: "#8a8c8e",
    tag: "#c9cbcc",
    tagInk: "#1b1b1b",
    labelCard: "#ffffff",
    labelInk: "#171717",
    labelRule: "#bdb8ae",
    labelSub: "#77736b",
  },
  world: {
    background: "#f7f6f3",
    environment: "room",        // faint satin highlights on the painted plates
    environmentIntensity: 0.18,
    toneMapping: "neutral",     // a white wall must stay white and the primaries must stay primary (ACES greys both)
    exposure: 1.12,
    shadowType: "pcf",          // shadow softness needs pcf/vsm
  },
  materials: {
    wall: { type: "standard", baseColor: "#f7f6f3", roughness: 0.96, metalness: 0, bump: { source: "bumpNoise", scale: 26, octaves: 3, seed: 7, strength: 0.06, description: "faint plaster/paint orange-peel" } },
    floor: { type: "standard", baseColor: "#d6d1c8", roughness: 0.62, metalness: 0, map: { source: "noise", size: 512, scale: 6, octaves: 4, seed: 21, colorA: "#cfc9bf", colorB: "#ddd8d0", contrast: 0.8, repeat: [5, 5], description: "polished concrete mottling" } },
    ceiling: { type: "standard", baseColor: "#f6f5f2", roughness: 0.95, metalness: 0 },
    shadowGap: { type: "standard", baseColor: "#3a3835", roughness: 0.9, metalness: 0 },
    skylight: { type: "lambert", baseColor: "#ffffff", emission: { color: "#f3f7ff", strength: 2.2 } },
    wire: { type: "standard", baseColor: "#151515", roughness: 0.38, metalness: 0.65 },
    thread: { type: "standard", baseColor: "#2b2a28", roughness: 0.9, metalness: 0 },
    hook: { type: "standard", baseColor: "#9a9c9e", roughness: 0.3, metalness: 1 },
    edge: { type: "standard", baseColor: "#6f7072", roughness: 0.45, metalness: 0.8 },   // raw sheet edge
    // painted sheet metal: satin enamel, faint clearcoat sheen
    paintRed: { type: "physical", baseColor: "#d42a1f", roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.45 },
    paintYellow: { type: "physical", baseColor: "#f3b80c", roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.45 },
    paintBlue: { type: "physical", baseColor: "#1f4fae", roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.45 },
    paintBlack: { type: "physical", baseColor: "#161616", roughness: 0.48, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 },
    paintWhite: { type: "physical", baseColor: "#f7f5ef", roughness: 0.55, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.5 },
  },
  lights: [
    // skylight + white-room bounce: soft, keeps shadows a light warm grey instead of black holes
    { id: "sky", type: "hemisphere", color: "#ffffff", groundColor: "#d9d3c8", intensity: 1.35 },
    // the key: high, front-left — throws the mobile's shadow down-right onto the wall
    { id: "key", type: "directional", color: "#fffaf1", intensity: 2.1, position: [-4.2, 8.5, 7.5], target: [0.6, 2.3, -1.8],
      shadow: { softness: 3, mapSize: 2048, extent: 4.6, near: 4, far: 22, bias: -0.0004, normalBias: 0.012 } },
    // skylight wash from above-behind (no shadow): lifts the wall top and rims plate edges
    { id: "wash", type: "directional", color: "#eef2fb", intensity: 0.55, position: [0.5, 10, -1], target: [0, 0, 0.5] },
  ],
  post: {
    // threshold well above the lit white wall (linear HDR > 1): only the skylight panel blooms
    bloom: { strength: 0.18, radius: 0.5, threshold: 2.6 },
    vignette: { darkness: 0.08, offset: 1.2 },
  },
  camera: { fov: 34, near: 0.3, far: 60, drift: { amp: 0.02, speed: 0.22 } },
  text: { font: "sans", weight: 500, color: "#171717", height: 0.4 },

  // ---------------------------------------------------------------- style-specific tuning
  gallery: {
    wallZ: -1.7, wallW: 22, wallH: 7.2,       // wall plane behind the mobile
    floorD: [-1.7, 14], floorW: 22,
    ceilingY: 7.0, rootY: 4.6,                // root pivot height; the top thread runs up to the ceiling hook
    shadowGap: 0.025,                         // the dark reveal line where the wall meets the floor
    skylight: { w: 3.2, d: 1.6, z: -0.2 },    // emissive panel in the ceiling over the mobile
  },
  wire: { r: 0.011, loopR: 0.03, loopTube: 0.006, stirrupR: 0.008, bow: 0.035, clipR: 0.018 },
  thread: { r: 0.0042, radial: 5 },            // ~2.3 px at 6 m with fov 34: thick enough not to shimmer
  sheet: { thickness: 0.012, curveSegments: 6, holeR: 0.012, density: 1.0 },
  colors: { red: "paintRed", yellow: "paintYellow", blue: "paintBlue", black: "paintBlack", white: "paintWhite" },
  tag: { cap: 0.045, drop: 0.07, thickness: 0.004, ppm: 1600, font: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: 700, tracking: 0.12, metal: "#cfd1d2", brush: "#b4b7ba", ink: "#202020", border: "#8e9194" },
  balance: {                                  // planner knobs (balance.js BALANCE_DEFAULTS overrides)
    gain: 0.28, period: 2.0, zeta: 0.2, lag: 0.22, h: 0.14, wireDensity: 0.05, steps: 10,
    hang: { dur: 0.9 }, weight: { dur: 0.6, ease: "inOutCubic" }, rebalance: { delay: 2.0, dur: 1.0, ease: "inOutSine", stagger: 0.3 },
  },
  shadows: {
    quality: "good",                          // wall shadow quality knob: draft | good | best
    presets: {
      draft: { mapSize: 1024, softness: 2, extentScale: 1.0 },
      good: { mapSize: 4096, softness: 4, extentScale: 1.0 },
      best: { mapSize: 4096, softness: 7, extentScale: 0.85 },
    },
  },
  label: {                                    // museum wall-label overlay (exact colours, drawn after post)
    x: -0.9, y: -0.66, height: 0.05, card: true, pad: [0.5, 0.42], dot: true, tracking: 0.06, weight: 600,
    font: '"Helvetica Neue", Helvetica, Arial, sans-serif', fadeIn: 0.35, fadeOut: 0.35, rise: 0.012,
  },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "paper", land: "click", emphasis: "chime", ui: "tick", bed: "pad" },
  sound: {
    bed: { root: 196, chords: [[0, 7, 14, 16], [-3, 4, 11, 14], [2, 9, 14, 17], [0, 7, 11, 16]], every: 4, overlap: 1.2, attack: 1.4, release: 2.2, brightness: 950, gain: 0.95 },
    spool: { gain: 0.12, pitch: 1.5 },
    hook: { gain: 0.42, pitch: 2.4, chime: 0.1, chimePitch: 1.6 },
    grow: { hz: 120, gain: 0.12, thud: 0.3, thudPitch: 0.75 },
    slide: { gain: 0.16, pitch: 2.2 },
    swing: { gain: 0.07, pitch: 2.8 },
    settle: { gain: 0.09, pitch: 1.4 },
  },
  motion: [
    "Every arm's pivot is solved from the weights on each side (weight = plate area x sheet density); tilt = atan(gain (p - p*) / h).",
    "Hanging a shape, removing one or changing a weight retargets that arm and every ancestor; each swings there as a closed-form damped step (superposed, never simulated).",
    "Re-balance slides the arm's pivot loop along the wire to the new centre, so the arm swings back to level; nested arms re-balance deepest first.",
    "Each arm turns slowly about its own thread (base + rate t + swing sin), plates turn too, and the hanger threads lean a little behind fast swings.",
    "The white wall is part of the picture: one high front-left key throws crisp soft shadows of wires, threads and plates down-right onto it.",
  ],
};
