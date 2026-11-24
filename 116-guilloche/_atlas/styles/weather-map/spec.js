// styles/weather-map/spec.js — STYLE_SPEC for "Weather Map". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js) and the browser.
// Units: metres (the relief map is 24 x 13.5 m, 16:9 so a wide shot fills the frame), Y-up right-handed, sRGB hex,
// radians, three.js light units. Map coords [x, z]: +x east, +z south (toward the viewer). Sea level = y 0.
//
// The look: a broadcast weather map made physical. A raised relief model of an INVENTED landmass (seeded coastline,
// hills, a seabed with soft depth shading under a glossy water sheet) sits in a dark frame on a studio table; a layer
// of soft cloud puffs floats above it casting real shadows; above the clouds a "glass" graphics layer carries bold
// broadcast graphics: white isobars, red warm / blue cold fronts with marching symbols, big H and L, flowing wind
// arrows. Temperature bands are draped on the land. No real country, broadcaster, logo or branding.

export const STYLE_SPEC = {
  id: "weather-map",
  name: "Weather Map",
  description:
    "A broadcast weather map made physical: a raised relief model of an invented landmass (seeded coastline, hills, depth-shaded sea) on a studio table, soft cloud puffs floating above it casting shadows, and bold broadcast graphics on a glass layer above: white isobars from a pressure field, red warm and blue cold fronts with marching symbols, big H and L centres, flowing wind arrows, temperature bands draped on the land and weather icons that pop up over invented places. Fronts and pressure centres advance as functions of time; clouds and their shadows travel with them, and a place's icon and colour band change the moment its front arrives, while the camera sweeps like a broadcast fly-over.",
  palette: {
    bg: "#0a1424",            // studio darkness around the table
    table: "#142236",
    frame: "#1c2c44",         // map frame / plinth
    frameEdge: "#2c4466",
    seaDeep: "#123c66",
    seaMid: "#1f6596",
    seaShallow: "#4aa3c8",
    coast: "#efe6c4",         // thin sand rim at the shoreline
    land: ["#6fa857", "#93b65e", "#c2b56f", "#a8906a", "#8e8278", "#cfc6b4"], // hypsometric: lowland -> peak
    cloud: "#f5f7fa",
    rain: "#cfe3ff",
    isobar: "#ffffff",
    cold: "#2f6fe8",
    warm: "#e5402f",
    high: "#2f6fe8",
    low: "#e5402f",
    arrow: "#ffffff",
    // temperature band ramp, cold -> hot (one colour per 2-degree band; SAMPLE DATA only)
    temps: ["#3d63d6", "#4b8fe0", "#55b8d8", "#69c79a", "#a5d65f", "#e9d548", "#f4a53a", "#ec6a35", "#d9412f"],
    // overlay (lower third + place cards)
    ink: "#0d1b30",
    navy: "#10284a",
    white: "#ffffff",
    accent: "#e5402f",
    tag: "#f2cf3e",
    sun: "#ffc93a",
    bolt: "#ffd84a",
    drop: "#6fb7ff",
  },
  world: {
    background: "#0a1424",
    environment: "room",
    environmentIntensity: 0.18,
    toneMapping: "neutral",  // keeps the hypsometric greens and broadcast red/blue as designed (ACES greys and desaturates)
    exposure: 1.0,
    shadowType: "pcf",       // pcf so the key's shadow.softness applies (soft cloud shadows)
  },
  materials: {
    table: { type: "standard", baseColor: "#142236", roughness: 0.8, metalness: 0 },
    frame: { type: "physical", baseColor: "#1c2c44", roughness: 0.45, metalness: 0.1, clearcoat: 0.4, clearcoatRoughness: 0.3 },
    relief: { type: "standard", baseColor: "#ffffff", roughness: 0.88, metalness: 0, vertexColors: true },
    water: { type: "physical", baseColor: "#2a74a8", roughness: 0.22, metalness: 0, opacity: 0.32, clearcoat: 0.25, clearcoatRoughness: 0.35 },
    cloud: { type: "standard", baseColor: "#f5f7fa", roughness: 1, metalness: 0, emission: { color: "#9fb4cc", strength: 0.16 } },
    pin: { type: "standard", baseColor: "#f4f6f8", roughness: 0.4, metalness: 0 },
    pole: { type: "standard", baseColor: "#1c2c44", roughness: 0.5, metalness: 0.2 },
    graphic: { type: "standard", baseColor: "#ffffff", roughness: 0.45, metalness: 0, emission: { color: "#ffffff", strength: 0.25 } },
  },
  // ---- geometry knobs (metres)
  map: { w: 24, d: 13.5, segX: 300, segZ: 170, frame: 0.55, frameH: 0.16, plinth: 0.7, floorY: -0.42 },
  land: {
    seed: 23, center: [0.6, 0.2], radius: [9.8, 5.3], warp: 0.42, warpScale: 3.6, height: 1.0, coastRamp: 0.16,
    floor: -0.4, seaSlope: 1.4,
    hills: [
      { c: [-3.8, -1.6], amp: 0.55, sigma: 1.6 },
      { c: [-2.2, -2.6], amp: 0.35, sigma: 1.0 },
      { c: [4.6, -1.2], amp: 0.42, sigma: 1.8 },
      { c: [1.2, 1.8], amp: 0.18, sigma: 2.4 },
    ],
    bays: [{ c: [2.8, 5.3], amp: 0.42, sigma: 1.5 }, { c: [-9.4, -1.4], amp: 0.35, sigma: 1.3 }],
    islets: [{ c: [-9.6, 4.3], r: 1.4, amp: 0.18 }, { c: [10.3, -4.4], r: 1.0, amp: 0.16 }],
    detail: { amp: 0.22, scale: 1.6 },
    peak: 0.95,             // colour ramp top (metres)
  },
  layers: {
    cloud: [1.25, 1.75],    // cloud puff centre height range (above the tallest hill, below the graphics)
    graphics: 2.2,          // the glass graphics layer: isobars, fronts, H/L, arrows (always above the clouds)
  },
  isobar: { step: 4, px: 1.7, halo: 2.4, haloAlpha: 0.32 },  // hPa between lines, core / halo half-widths in pixels
  front: { radius: 0.075, symbol: 0.42, spacing: 0.95, march: { wave: 3.2, rate: 0.9, amp: 0.28 } },
  marker: { letter: 1.35, disc: 0.78 },
  arrows: { cols: 13, rows: 7, length: 0.62, width: 0.2, rate: 0.55, vRef: 4.5, minLevel: 0.12 },
  bandsKnob: { step: 2, mix: 0.58, edge: 0.55, min: 5 },     // temperature bands: degrees per band, opacity, band-edge darkening, ramp start
  clouds: { flatten: 0.62, rainPer: 3, rainLen: 0.34 },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#dfe9ff", groundColor: "#1d2a3c", intensity: 1.0 },
    // high soft key from upper left-front: clouds throw readable, soft shadows a little south-east of themselves
    { id: "key", type: "directional", color: "#fff4e4", intensity: 2.5, position: [-7, 20, 8], target: [0, 0, 0],
      shadow: { softness: 6, mapSize: 4096, extent: 15, near: 4, far: 50, bias: -0.0004, normalBias: 0.02 } },
    { id: "rim", type: "directional", color: "#9cc0ff", intensity: 0.6, position: [6, 8, -14], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.34, offset: 1.1 },
    grain: { amount: 0.006, fps: 30 },   // nearly clean: the camera never stops and the sea is a big flat gradient
  },
  camera: { fov: 34, near: 0.3, far: 160, drift: { amp: 0.03, speed: 0.2 } },
  text: {
    font: "sans", weight: 800, color: "#ffffff", height: 0.42,
    stack: '"Helvetica Neue", Helvetica, Arial, sans-serif',   // macOS system faces only (no web fonts)
    lowerPx: 60,   // lower-third headline (screen px at 1080p)
    cardPx: 27,    // place-card name
  },
  sfx: {
    weather: "rain = paper hiss + pop; storm = rumble (thunder) + thud; cloud = soft pop; clear = short chime",
    centre: "H = pop + chime; L = low pop + thud + rumble swell",
    front: "whoosh over each front's grow window",
    caption: "two-note blip broadcast sting + tick",
    enter: "pop", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "chime", ui: "blip", bed: "pad",
  },
  motion: [
    "Pressure centres move on keyed tracks (weather.keyed2); the low deepens in, the isobars are drawn by a shader from the same pressure formula, so they re-curve every frame.",
    "Fronts are rigid curves attached to the low: they grow out of it, then advance with it; symbols ripple in a marching wave along the line.",
    "Clouds and rain ride in the low's frame along the fronts, so cloud shadows sweep the land with the weather.",
    "A place's weather is a function of its side of each front (weather.weatherAt); change times are solved once (placeEvents) and drive icon swaps AND the sound.",
    "Camera: broadcast fly-over — high wide, a low sweep in from the sea following the low, a tracking pass along the cold front, then a rise to a frame-filling wide.",
  ],
};
