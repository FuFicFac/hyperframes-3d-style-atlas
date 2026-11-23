// styles/tiny-diorama/spec.js — STYLE_SPEC for the Tiny Diorama style. Plain data only:
// JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs) and the browser.
// Units: metres, Y-up right-handed, colors sRGB hex, angles radians, three.js light units.
//
// Look: a whole little world on one floating square tile (designer's desk model / mobile-game map
// piece). Thick slab with layered cross-section sides, chunky bevelled buildings, lollipop trees,
// toy cars, peg people. Smooth rounded forms, pastel-saturated matte plastic with a light clearcoat
// sheen, one soft sun, contact darkening, narrow-FOV near-isometric camera, tilt-shift, soft gradient bg.

export const STYLE_SPEC = {
  id: "tiny-diorama",
  name: "Tiny Diorama",
  description:
    "A whole little world on one floating bevelled tile: layered grass/soil/rock slab sides, chunky rounded buildings, lollipop trees, toy cars and peg people in matte pastel plastic, one soft sun, contact shadows, tilt-shift and a narrow near-isometric camera.",
  palette: {
    bgTop: "#cfe8f2",
    bgBottom: "#fbe9dc",
    ink: "#2b2d42",
    paper: "#fffaf2",
    // slab layers (top -> bottom)
    grass: "#8fd18b",
    grassEdge: "#76c27a",
    soil: "#d9965f",
    soilDark: "#b97849",
    rock: "#9aa0b8",
    rockDark: "#7c829c",
    pavement: "#e9e4dc",
    concrete: "#c7c2bb",
    // set dressing
    road: "#5f6680",
    roadLine: "#fff3c4",
    wall: "#fff4e6",
    roof: "#ff7b6b",
    roofAlt: "#6c8cf5",
    trim: "#ffd25a",
    foliage: "#4fbf7a",
    foliageAlt: "#a3d65c",
    trunk: "#a7704a",
    tech: "#7484f0",
    techDark: "#4f5bc4",
    metal: "#dfe4ee",
    pole: "#8a6a55",
    cable: "#3a3d55",
    glow: "#ffd447",
    screen: "#9ff3ff",
    // people / cars (cheerful limited set)
    peg: ["#ff7b6b", "#6c8cf5", "#ffd25a", "#4fbf7a", "#c58cf2"],
    skin: "#ffd9b8",
    car: ["#ff7b6b", "#6c8cf5", "#ffd25a", "#4fc9c2"],
    // UI
    primary: "#ff7b6b",
    secondary: "#6c8cf5",
    accent: "#ffd25a",
    shadow: "#6d6a8a",
  },
  world: {
    background: "#fbe9dc",
    sky: { stops: [[0, "#cfe8f2"], [0.55, "#f3ecea"], [1, "#fbe9dc"]] }, // plain soft vertical gradient
    environment: "room", // faint reflections for the plastic sheen
    environmentIntensity: 0.22,
    toneMapping: "neutral", // keeps the designed pastel palette (ACES greys it)
    exposure: 1.0,
    shadowType: "pcf", // softness only works with pcf/vsm
  },
  materials: {
    // matte plastic: roughness ~.5 + light clearcoat for a slight sheen (physical)
    grass: { type: "physical", baseColor: "#8fd18b", roughness: 0.75, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.6 },
    soil: { type: "physical", baseColor: "#d9965f", roughness: 0.8, metalness: 0, clearcoat: 0.08, clearcoatRoughness: 0.7 },
    rock: { type: "physical", baseColor: "#9aa0b8", roughness: 0.8, metalness: 0, clearcoat: 0.08, clearcoatRoughness: 0.7 },
    plastic: { type: "physical", baseColor: "#ffffff", roughness: 0.5, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35 },
    road: { type: "physical", baseColor: "#5f6680", roughness: 0.7, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.6 },
    metal: { type: "physical", baseColor: "#dfe4ee", roughness: 0.35, metalness: 0.15, clearcoat: 0.5, clearcoatRoughness: 0.2 },
    glow: { type: "standard", baseColor: "#ffd447", roughness: 0.4, metalness: 0, emission: { color: "#ffc21f", strength: 4.5 } },
    screen: { type: "standard", baseColor: "#9ff3ff", roughness: 0.3, metalness: 0, emission: { color: "#7deeff", strength: 1.0 } }, // desk.setScreen drives the intensity per frame
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#f1f6ff", groundColor: "#d8b8a4", intensity: 1.35 },
    {
      id: "sun", type: "directional", color: "#fff1dc", intensity: 2.6, position: [-7, 14, 9], target: [0, 0, 0],
      shadow: { softness: 6, mapSize: 2048, extent: 9.5, near: 2, far: 40, bias: -0.0005, normalBias: 0.03 },
    },
    { id: "fill", type: "directional", color: "#d6e2ff", intensity: 0.55, position: [9, 5, 6], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.5, radius: 0.5, threshold: 2.4 }, // light scene: only emissive packets/windows bloom
    tiltShift: { focus: 0.5, range: 0.32, blur: 4.5 }, // focus is re-aimed at the active subject per frame
    vignette: { darkness: 0.18, offset: 1.2 },
    grain: { amount: 0.008, fps: 30 },
  },
  camera: { fov: 20, near: 2, far: 120, drift: { amp: 0.05, speed: 0.4, orbit: 0 } },
  text: { font: "rounded", weight: 800, color: "#2b2d42", height: 0.5 },
  tile: {
    // default slab: layer thicknesses (m), top first; bevel radius; inset of each lower layer
    layers: [["grass", 0.34], ["soil", 0.95], ["rock", 0.62]],
    urbanLayers: [["pavement", 0.3], ["concrete", 0.9], ["rock", 0.6]],
    radius: 0.16,
    inset: 0.05,
    pebbles: 26, // half-buried rounded pebbles on the soil/rock sides
    bob: { amp: 0.06, speed: 0.55 },
    dropShadow: { below: 1.1, scale: 1.3, opacity: 0.42 },
  },
  contact: { opacity: 0.38, spread: 1.45 }, // fake AO blob under every placed piece (radial alpha)
  ui: {
    // overlay labels (drawn after post: exact colours, never blurred)
    font: "rounded",
    pill: "#fffaf2",
    pillShadow: "#2b2d42",
    pillShadowOpacity: 0.16,
    ink: "#2b2d42",
    badge: "#ff7b6b",
    badgeText: "#fffaf2",
    kicker: "#43465f",
    pinRing: "#fffaf2",
  },
  sfx: { enter: "pop", exit: "whooshOut", move: "bubble", land: "thud", emphasis: "chime", ui: "blip", bed: "pad" },
  motion: [
    "The tile drops in from above with an outBounce and then bobs very gently (sin, ~6 cm); its drop shadow tightens as it lands.",
    "Pieces drop in from above with a bounce or pop up out of the slab (outBack ~0.5 s), staggered by a seeded delay.",
    "Little vehicles and glowing packets travel along roads and cables on precomputed paths (position = f(t)).",
    "The camera orbits a few degrees around the tile and pushes in on the active part; tilt-shift focus follows the subject.",
    "Numbered pin markers pop (outBack) over locations; one caption pill at a time at the top.",
  ],
};
