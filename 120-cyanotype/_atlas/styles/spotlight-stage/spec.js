// styles/spotlight-stage/spec.js — STYLE_SPEC for "Spotlight Stage". Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs, render-sfx.mjs) and the browser.
// Units: metres, Y-up right-handed, sRGB hex, radians, three.js light units (spot/point = candela, decay 2).
//
// The look: a Victorian toy theatre seen from the stalls. Stage frame: x across the stage, y up from the
// stage boards (y = 0), z toward the audience. The proscenium (gilded arch in a dark plum house wall) sits
// at z = 0, the house curtain just behind it, the painted backdrop at the back (z ≈ -5), the apron and
// footlights in front (z ≈ +1.3), the auditorium floor 1.3 m below the boards, front-row heads at z ≈ +4.

export const STYLE_SPEC = {
  id: "spotlight-stage",
  name: "Spotlight Stage",
  description:
    "A toy theatre in a dark auditorium: crimson velvet curtains with deep folds, a gilded proscenium, warm plank boards, flat painted cut-out actors and scenery on sliders and wires, hard follow-spots with dusty beams and soft pools, warm footlights.",
  palette: {
    void: "#0a0406",        // auditorium darkness (background)
    houseWall: "#3d0d15",   // plum wall around the arch
    velvet: "#8f0d1d",      // curtain crimson
    velvetDeep: "#3a040b",  // fold valleys
    velvetSheen: "#ff7b63", // rim sheen colour
    gold: "#d9a640",
    goldDeep: "#8a5a1a",
    boards: "#8a5a33", boardsDark: "#4a2a16", boardsLight: "#b47c47", seam: "#26140a",
    apron: "#2c170c",
    ink: "#1c1210",         // printed outline / lettering
    parchment: "#f2e3bd",
    cream: "#f8eed6",
    rouge: "#b8302a",       // painted red
    teal: "#2f6f6a",
    tealLight: "#7fb2a6",
    mustard: "#e0a838",
    slate: "#465468",
    slateLight: "#8a9bb0",
    skin: "#efc9a0",
    night: "#1d3157", nightLight: "#4c73a6", moon: "#f6e6b4", hills: "#2a4636", city: "#18213a",
    plywood: "#b89a6c", plyEdge: "#e2cc9f",
    spot: "#fff0d2",        // follow-spot colour (warm white)
    foot: "#ffb15a",        // footlight amber
    audience: "#050203",
  },
  world: {
    background: "#0a0406",
    environment: "room",     // faint reflections so the gilding reads as metal, not brown plastic
    environmentIntensity: 0.16,
    toneMapping: "neutral",  // keeps crimson and gold on-hue (ACES pushes the reds orange and greys the cream signs)
    exposure: 1.18,
    shadowType: "pcf",       // softness (radius) applies with pcf
  },
  materials: {
    velvet: { type: "physical", baseColor: "#a2101f", roughness: 0.82, metalness: 0, sheen: 1, bump: { scale: 160, octaves: 2, seed: 31, strength: 0.25, description: "fine pile noise" } },
    gold: { type: "physical", baseColor: "#e0ad48", roughness: 0.34, metalness: 0.82, clearcoat: 0.2, clearcoatRoughness: 0.4, bump: { scale: 48, octaves: 3, seed: 7, strength: 0.22, description: "worn gilding / gesso noise" } },
    goldDeep: { type: "standard", baseColor: "#9a6420", roughness: 0.5, metalness: 0.7 },
    houseWall: { type: "standard", baseColor: "#ffffff", roughness: 0.92, metalness: 0 },
    boards: { type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0, bump: { scale: 64, octaves: 2, seed: 5, strength: 0.25, description: "wood pores" } },
    apron: { type: "standard", baseColor: "#2c170c", roughness: 0.7, metalness: 0 },
    backdrop: { type: "standard", baseColor: "#ffffff", roughness: 0.96, metalness: 0 },
    paint: { type: "standard", baseColor: "#ffffff", roughness: 0.88, metalness: 0, bump: { scale: 36, octaves: 3, seed: 19, strength: 0.15, description: "brushed gouache on card" } },
    plywood: { type: "standard", baseColor: "#b89a6c", roughness: 0.95, metalness: 0 },
    plyEdge: { type: "standard", baseColor: "#e2cc9f", roughness: 0.95, metalness: 0 },
    wire: { type: "standard", baseColor: "#3a3530", roughness: 0.45, metalness: 0.6 },
    hood: { type: "standard", baseColor: "#2e2620", roughness: 0.45, metalness: 0.65 },
    bulb: { type: "standard", baseColor: "#fff2d8", roughness: 0.4, metalness: 0, emission: { color: "#ffb15a", strength: 2.4 } },
    audience: { type: "standard", baseColor: "#050203", roughness: 1, metalness: 0 },
    masking: { type: "standard", baseColor: "#0d0809", roughness: 1, metalness: 0 },
  },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#6b3a40", groundColor: "#0c0506", intensity: 0.55 },
    // front-of-house wash: keeps the stage readable between spots, throws soft cut-out shadows onto the backdrop
    { id: "wash", type: "directional", color: "#ffd2a0", intensity: 0.85, position: [2.5, 9, 12], target: [0, 1.2, -2],
      shadow: { softness: 6, mapSize: 2048, extent: 7.5, near: 4, far: 40, bias: -0.0005, normalBias: 0.02 } },
    // cool backlight from the flies: rims the velvet and separates the cut-outs from the backdrop
    { id: "back", type: "directional", color: "#f0e0d0", intensity: 0.32, position: [-2, 9, -9], target: [0, 1, 0] },
  ],
  // ---- style-specific tuning (every number that defines the look) ----
  stage: {
    opening: { width: 8.4, height: 4.6, archRise: 0.5 },
    frame: { width: 0.62, depth: 0.32, bevel: 0.07, bead: 0.13, beadDepth: 0.44, cartoucheR: 0.62, columnR: 0.2 },
    wall: { width: 26, height: 14, z: 0.12 },
    floor: { depth: 6.2, apron: 1.45, drop: 1.3, boardWidth: 0.24 },
    backdropZ: -5.2,
    masking: { legX: 4.55, legW: 1.4, depths: [-1.2, -2.8] },
  },
  velvet: {
    sheenColor: "#ff6f5c", sheenRoughness: 0.42,
    valleyShade: 0.38,          // vertex-colour darkening in fold valleys (fake AO)
    folds: 11, foldDepth: 0.17, // pleats per half and closed amplitude (m)
    gatherGrow: 1.5,            // fold amplitude multiplier when fully gathered
    openGap: [0.32, 0.72],      // visible gathered width at the bottom / top when fully open (m from the opening edge)
    hemLift: 0.55,              // inner hem lift when open (swag)
    segments: [150, 40],
    valance: { height: 0.78, swags: 4, sag: 0.24, folds: 34, foldDepth: 0.07, fringe: 0.035 },
  },
  spots: {
    beamOpacity: 0.16,          // additive beam strength at level 1 (before tone map)
    beamSoftness: 1.6,          // edge falloff exponent (view-angle)
    dust: 0.35,                 // drifting dust modulation in the beam (0..1)
    dustScale: 2.4,
    penumbra: 0.32,
    snapOvershoot: 0.35, snapDecay: 9, // thunk: brief over-bright then settle
    mapSize: 2048, softness: 3,
  },
  footlights: { count: 15, lights: 5, color: "#ffb15a", intensity: 3, distance: 6, height: 0.16 },
  paint: {
    pxPerMetre: 220,
    outline: 0.035,             // ink outline width on cut-outs (m)
    hatch: { spacing: 0.055, width: 0.012, alpha: 0.32 },
    grime: 0.16,                // gouache unevenness multiplied over painted faces
    cardThickness: 0.03,
    layerGap: 0.004,
  },
  textures: {
    boards: { size: 1024, metres: 6, boards: 6, seed: 23, grainFreq: 20, grainWarp: 2.0, contrast: 0.45 },
    wall: { size: 512, metres: 2.2, seed: 61, description: "dark plum damask: printed lozenge pattern + noise" },
  },
  motion_tuning: {
    slideDur: 0.9, slideEase: "outCubic", wobble: { amp: 0.045, freq: 9, decay: 4.5 },
    drop: { dur: 0.7, ease: "outCubic", swing: 0.05, freq: 5.5, decay: 3.2 },
    curtain: { openDur: 1.8, openEase: "inOutSine", closeDur: 2.2, closeEase: "inOutSine" },
    sweep: { ease: "inOutCubic", settle: 0.12 },
  },
  post: {
    bloom: { strength: 0.5, radius: 0.55, threshold: 0.95 },
    vignette: { darkness: 0.5, offset: 1.08 },
    grain: { amount: 0.022, fps: 30 },
  },
  camera: { fov: 30, near: 0.5, far: 80, drift: { amp: 0.045, speed: 0.22 } },
  text: { font: '"Superclarendon", "Bodoni 72", Didot, Georgia, serif', subFont: '"Bodoni 72", Didot, Georgia, serif', weight: 700, color: "#1c1210", height: 0.5 },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "rustle", land: "thud", emphasis: "chime", ui: "clack", bed: "pad" },
  motion: [
    "House curtain opens on an inOutSine over ~1.8 s; folds deepen as the cloth gathers, the inner hem swags up and out.",
    "A spot snaps on with a brief over-bright thunk, then sweeps to its mark on inOutCubic with a tiny settle.",
    "Flats slide in from the wings on their floor track (outCubic) and rock on their foot with a damped wobble.",
    "Signs and flats drop from the flies on visible wires and swing to rest like a pendulum.",
    "Scene changes: flats slide out and new ones slide in; never fade a cut-out.",
    "Camera sits in the stalls: one slow push-in over the whole piece with a slight lateral drift; never cut.",
  ],
};
