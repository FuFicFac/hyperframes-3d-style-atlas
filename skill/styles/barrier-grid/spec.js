// styles/barrier-grid/spec.js — STYLE_SPEC for "Barrier Grid" (scanimation). Plain data only: JSON-serializable, no THREE,
// no window. Importable from Node (export-spec.mjs, scene.config.js for the barrier plan + score) and the browser.
// Units: metres, toy scale (the card is 1.78 m wide so one print strip of 7.5 mm is ~7.4 px in the wide shot). The card lies
// in the XY plane facing +Z (the desk is the plane z = 0 behind it); head-on cameras look down −Z. "Up" in the picture = +Y.
//
// The look: a cream printed card on a light wooden desk. Its picture area is an interlaced print: six frames of a bird
// flapping, cut into vertical strips 7.5 mm wide, strip i carrying frame (i mod 6). On its own it is a striped blur. A
// clear acetate sheet printed with opaque bright coral stripes (opaque 5 strips, clear 1 strip) lies a hair above it: only one
// strip in six shows through, so one frame shows; slide the sheet one strip and the next frame shows. Bright even light;
// cream card, near-black navy ink, one spot colour (teal), coral stripes; a soft shadow under the acetate (separate sheet).

export const STYLE_SPEC = {
  id: "barrier-grid",
  name: "Barrier Grid",
  description:
    "Scanimation: a cream card printed with six interlaced frames of a flapping bird in near-black navy (strip i = frame i mod 6) and a clear acetate sheet of bright opaque coral stripes, five strips opaque and one clear, lying a hair above it. Alone the card is a striped blur; with the sheet on, each slit shows one strip and so one frame: the bird is a bold dark shape of slivers on a bright coral-and-cream field. Slide the sheet and the bird flaps, by real occlusion: the card never changes. Two analytic shaders (the print and the barrier, both anti-aliased per pixel), a pale wooden desk, bright even light, navy ink, one teal spot colour for the secondary print.",
  palette: {
    desk: "#d9b98f",
    paper: "#f4ecd9",
    ink: "#1a2238",        // near-black navy: the bird, the index comb, the keyline
    teal: "#0f8f86",       // secondary print: pulse rings, frame meter, beak + eyes
    tealDeep: "#0b6f69",
    barrier: "#f2876d",    // the acetate's opaque stripes: bright light coral
    caption: "#1c1e24",
    captionInk: "#f6efe0",
    accent: "#13a196",
  },
  world: {
    background: "#cfae83",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.35,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    desk: { type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0, map: { source: "wood", size: 1024, boards: 4, seed: 114, grainFreq: 18, grainWarp: 1.6, contrast: 0.22, dark: "#dcc09a", mid: "#ead3b2", light: "#f5e4c9", seam: "#c9a984", description: "pale maple boards, soft grain" } },
    cardEdge: { type: "standard", baseColor: "#efe6d2", roughness: 0.85, metalness: 0 },
    acetateRim: { type: "physical", baseColor: "#e9f1f4", roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, opacity: 0.85 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fff8ec", groundColor: "#c9b394", intensity: 1.3 },
    { id: "key", type: "directional", color: "#fff6e6", intensity: 1.7, position: [0.6, 3.0, 6.0], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.05, offset: 1.4 },     // barely there: keeps the post stack for the macro depth of field
  },
  camera: { fov: 12, near: 0.02, far: 40, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#18191d", height: 0.3 },

  // ---- the grid (the whole mechanism in four numbers) -----------------------------------------------------------
  grid: {
    frames: 6,          // N: frames interlaced in the print = strips per barrier period
    strip: 0.0075,      // w: one print strip (m). 7.4 px in the wide shot; the barrier period N·w = 45 mm
    slit: 1,            // clear strips per period (the rest, N − slit, are opaque)
    gap: 0.004,         // acetate height above the print (m) — "a hair"; it is what the macro shows
  },

  // ---- the card ---------------------------------------------------------------------------------------------------
  // picture area centred on the world origin; margins make it a polaroid-like card (wide bottom margin = caption room)
  card: {
    picW: 1.62, picH: 0.84,           // 216 strips × 7.5 mm; picture centre = (0, 0)
    margin: { top: 0.07, side: 0.08, bottom: 0.21 },
    thick: 0.004,
    band: { y0: -0.464, y1: -0.435 },   // index comb under the picture: strip k carries a tooth (k+1)/N tall (left uncovered)
    meter: { y0: -0.41, h: 0.032 },      // frame meter inside the picture's foot (under the sheet): strip k carries a teal bar (k+1)/N tall
    keyline: 0.0022, keylineGap: 0.005, // printed navy frame line around the picture, 5 mm outside it
    grain: 0.022,                       // low-frequency paper mottling (± fraction)
    gradient: 0.04,                     // gentle light fall-off across the card (brighter top-left)
    level: 1.12,                        // print brightness (the card shader's own light level, linear multiplier)
    shadowCard: { soft: 0.05, opacity: 0.38, offset: [0.012, -0.03] },
  },

  // ---- the print: one original bird, front view, six phases of a flap (planner draws it from these) ------------------
  bird: {
    centre: [0, -0.05], scale: 1.22,
    bob: 0.035,                          // body rises on the downstroke (m, before scale)
    body: { top: [0, 0.03], rTop: 0.1, bot: [0, -0.13], rBot: 0.064 },
    head: { c: [0, 0.13], r: 0.074 },
    beak: [[-0.022, 0.116], [0.022, 0.116], [0, 0.068]],
    eyes: { dx: 0.03, y: 0.148, r: 0.013 },
    tail: [[-0.085, -0.215], [0.085, -0.215], [0, -0.1]],
    shoulder: [0.06, 0.035], arm: 0.25, hand: 0.27,
    rShoulder: 0.092, rWrist: 0.068, rTip: 0.026,   // bold chord: one-in-six slivers still read as a solid shape
    armAngle: { mean: 0.07, amp: 0.5 },           // rad: arm elevation = mean + amp·cos(2πφ)
    handAngle: { amp: 0.36, lag: 0.95 },           // rad: hand = arm + amp·cos(2πφ − lag) (the wrist lags: M shape)
    feather: { len: 0.075, r: 0.016, spread: 0.22 },  // two extra primaries fanning at the tip
  },

  // ---- wing-beat pulse rings behind the bird (light teal tint, part of every frame: they expand by spacing/N per frame) ----
  pulse: { centre: [0, -0.02], spacing: 0.15, width: 0.012, tint: 0.36, fadeFrom: 0.35, fadeTo: 0.95, fade: 0.55, yMin: -0.33 },

  // ---- the acetate (local x measured from the picture's left edge; mesh.x = −picW/2 + offset·strip) -------------------
  acetate: {
    left: -0.5, right: 1.8, bottom: -0.429, top: 0.62,
    thick: 0.0006,
    clear: 0.035,                       // alpha of the clear slits (a faint plastic film)
    sheen: 0.03,                        // faint highlight on the film (never darkens the stripes)
    edgeGlow: 0.55,                     // brightness of the cut edge line
    shadow: { strength: 0.42, penumbra: 0.45, light: [0.12, 0.75, 1.0] },   // analytic shadow on the print; light = direction TO the light
    deskShadow: { opacity: 0.22, soft: 0.06 },
  },

  // ---- overlay caption chip (bottom centre, exact colours; the top-left 140×110 px stays free) -----------------------
  caption: {
    cx: 960, y: 928, h: 88, cap: 41, maxW: 1100,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#1c1e24", edge: "#f6efe0", ink: "#f6efe0", accent: "#13a196", iconPaper: "#f4ecd9", iconBar: "#5d6068",
  },

  sound: {
    bed: { gain: 0.34, root: 98, brightness: 900 },
    slide: { gain: 0.45 },             // acetate hiss (rustle), scaled by barrier speed
    whoosh: { gain: 0.42 },
    land: { gain: 0.6 },
    tick: { gain: 0.3, decay: 0.22, notes: [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5], maxRate: 26 },
    step: { gain: 0.4 },
    cam: { gain: 0.16 },
    settle: { gain: 0.12 },
  },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "rustle", land: "thud", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "The card's print is a pure function of card position (never of t): strip i = floor((x + picW/2)/w) shows frame i mod 6.",
    "The barrier is a real second plane a hair above the card: opaque 5 strips, clear 1; its x offset (in strips) is the only animated input.",
    "Picture motion comes from occlusion: offset k (integer) uncovers strips i ≡ k (mod 6) = frame k; between integers two frames mix.",
    "Head-on long-lens camera (fov 12°) for every shot except the oblique macro, so the sheets show no parallax.",
  ],
};
