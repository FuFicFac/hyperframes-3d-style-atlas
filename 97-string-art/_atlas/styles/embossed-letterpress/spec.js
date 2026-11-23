// styles/embossed-letterpress/spec.js — STYLE_SPEC for "Embossed Letterpress". Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js) and the browser.
// Units: metres (a 34 cm card is modelled 10x: 3.4 m wide), Y-up, sRGB hex, radians, three.js light units.
//
// The look: fine stationery under a low raking light. The sheet lies in the XY plane facing +Z (the camera
// looks along -Z, a few degrees from the normal). Every mark is RELIEF: per-layer height maps (type and
// ornaments rasterised once at load, blurred for the press shoulder, plus a wide blur for the pillow) are
// combined in the sheet shader with a 0..1 press amount per layer; normals come from the height gradient,
// and a short height-field march toward the key light casts the shadow inside each impression.

export const STYLE_SPEC = {
  id: "embossed-letterpress",
  name: "Embossed Letterpress",
  description:
    "Fine stationery under raking light: one heavyweight cotton sheet with deckled edges where type and ornaments are pressed in (debossed with uneven spot ink), raised (blind embossed) or stamped in gold foil that flashes as the light sweeps; a brass die descends, presses with a soft thud and lifts to reveal each impression.",
  palette: {
    bg: "#1f2229",        // charcoal board under the card (fills the frame margins)
    board: "#2a2e37",
    paper: "#f2ead9",     // cream cotton card
    paperShade: "#e6dcc7",
    deckle: "#f8f2e6",    // lighter, thinner feathered edge
    navy: "#1c2a4a",      // spot ink 1
    oxblood: "#7a2433",   // spot ink 2
    gold: "#d9ae58",      // foil (F0, sRGB)
    copper: "#c8794e",
    brass: "#b8933f",
    die: "#2c2621",       // die block (dark iron-oxide wood)
  },
  world: {
    background: "#1f2229",
    environment: "room",          // only the brass die uses it; the sheet shader has its own fake env for foil
    environmentIntensity: 0.55,
    toneMapping: "neutral",       // keeps the cream and spot inks as designed (ACES greys cream)
    exposure: 1.0,
  },
  // The sheet: geometry, relief and the press shoulder. All lengths in metres (card space, origin at the centre).
  sheet: {
    width: 3.4, height: 2.0,
    pxPerMetre: 1000,             // relief raster resolution (1 mm per texel at 10x scale)
    wideDownsample: 4,            // the pillow (wide blur) map is stored at 1/4 resolution
    segments: [170, 100],         // vertex grid for the press dip (relief itself is per-pixel)
    shoulder: 0.0022,             // blur radius of the press shoulder (soft wall of an impression)
    pillowRadius: 0.022,          // blur radius of the pillow (paper pushed up around a deep impression)
    depth: { deboss: 0.0042, emboss: 0.0032, ink: 0.0042, foil: 0.0018 }, // relief depth per layer kind at press = 1
    pillow: { deboss: 0.45, emboss: 0.0, ink: 0.4, foil: 0.25 },        // pillow height as a fraction of depth
    maxLayers: 8,                 // 2 sharp + 2 wide RGBA textures (one channel per layer)
    deckle: { width: 0.016, freq: 46, seed: 7, edgeLighten: 0.06, edgeDrop: 0.0012 },
    thickness: 0.006,             // gap to the sheet below (casts a thin raking shadow sliver)
    dip: { depth: 0.006, soft: 0.07 }, // how far the sheet sinks under the die (low-frequency vertex dip)
  },
  // Paper surface: cotton fibre albedo + fine fibre bump (static textures, tiled per metre; never per-frame grain)
  fibre: { size: 512, perMetre: 2.2, seed: 41, albedo: 0.075, bump: 0.0005, fibres: 0.8 },
  ink: {
    coverage: [0.42, 0.62],       // smoothstep on the shoulder map -> ink edge
    squash: 0.28,                 // darker ring at letter edges (letterpress squash/halo)
    mottle: 0.16,                 // uneven ink density (low-frequency noise)
    skip: 0.08,                   // fine speckle where ink skipped the fibres
    roughness: 0.62,
  },
  foil: {
    color: "#d9ae58",
    roughness: 0.32,
    brush: 0.2,                   // micro "brushed" streak normal along X (anisotropic-ish look)
    env: { low: "#3b2a18", high: "#fff1d2", base: 0.55 }, // fake environment the foil reflects
    band: { width: 0.11, strength: 5.5 },                  // travelling highlight band (driven by the scene: flash/bandPos)
  },
  // Raking key + soft fill. The key azimuth (around +Z, 0 = from +X) and elevation are keyed by the scene.
  lighting: {
    key: { color: "#ffe9c9", intensity: 3.1, azimuth: 2.5, elevation: 0.33 },
    fill: { color: "#ece4d6", intensity: 0.6, frontal: 0.55 },
    paperSpec: 0.035,             // faint satin sheen on cotton
    selfShadow: { steps: 7, reach: 0.016, soft: 0.0009, strength: 0.82 },
    dieShadow: { strength: 0.78, soft: 0.035, softPerMetre: 0.45, ao: 0.35, fadeHeight: 0.45 },
  },
  materials: {
    brass: { type: "standard", baseColor: "#a3854a", roughness: 0.48, metalness: 1 },          // die block
    dieFace: { type: "standard", baseColor: "#3a3836", roughness: 0.35, metalness: 0.8 },      // steel face plate
    knob: { type: "standard", baseColor: "#2c2621", roughness: 0.5, metalness: 0.05 },         // ebony knob
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#f3ead8", groundColor: "#2a2420", intensity: 0.8 },
    { id: "key", type: "directional", color: "#ffe9c9", intensity: 3.1, position: [-4, 3, 1.6], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.22, radius: 0.35, threshold: 2.4 },
    tiltShift: { focus: 0.5, range: 0.36, blur: 1.6 },
    vignette: { darkness: 0.36, offset: 1.08 },
  },
  camera: { fov: 26, near: 0.3, far: 40, drift: { amp: 0.012, speed: 0.22 } },
  // Type: canvas font stacks (system fonts on macOS; Georgia fallback elsewhere)
  type: {
    display: "Didot, 'Bodoni 72', 'Big Caslon', Georgia, serif",
    text: "Baskerville, 'Hoefler Text', Georgia, serif",
    smallCaps: "'Bodoni 72 Smallcaps', Didot, Georgia, serif",
    tracking: 0.12,               // em, display caps
  },
  text: { font: "serif", weight: 400, color: "#1c2a4a", height: 0.12 },
  // Press timing (pressplan.js): seconds and metres in card space.
  press: {
    approach: 0.78,               // travel from off-frame to contact
    settle: 0.2,                  // last straight-down part of the approach (heavy, accelerating)
    hover: 0.32,                  // height above the sheet where the straight-down part starts
    dwell: 0.24,                  // die rests on the sheet (impression forms underneath)
    lift: 0.42, exit: 0.5,        // straight up, then away
    from: [0, 1.9, 1.3],          // default off-frame offset (card up, toward the camera)
    reliefIn: 0.16,               // relief 0 -> 1 after contact (hidden under the die)
    kick: { amount: 0.012, freq: 34, decay: 14 }, // camera nudge on contact
  },
  sfx: { enter: "paper", exit: "rustle", move: "whoosh", land: "thud", emphasis: "sparkle", ui: "click", bed: "pad" },
  motion: [
    "Every mark arrives by a press: a brass die travels in from off-frame, drops straight down the last 0.3 m, rests 0.24 s while the sheet dips and the relief forms under it, then lifts straight up and away.",
    "Relief depth is a per-layer press amount 0..1 (a uniform), so impressions can also grow in without a die; height maps never change after load.",
    "The raking key light sweeps slowly in azimuth (low, ~19 deg elevation): debossed walls facing it catch light, the far walls fall into shadow.",
    "Gold foil flashes when a travelling highlight band crosses it, and glints along the walls of its impression as the key moves.",
    "Camera: macro, very slow drift; push to each impression as it is pressed, pull back to the whole card at the end; tilt-shift follows the subject.",
  ],
};
