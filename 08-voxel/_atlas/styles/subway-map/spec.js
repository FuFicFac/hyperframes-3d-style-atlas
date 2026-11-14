// styles/subway-map/spec.js — STYLE_SPEC for "Subway Map". Plain data only: JSON-serializable, no THREE,
// no window. Importable from Node (export-spec.mjs, scene.config.js) and the browser.
// Units: metres (the map panel is ~24 x 11 m; one grid unit = 1 m), Y-up right-handed, sRGB hex, radians,
// three.js light units. The panel top is the XZ plane at y = panel.h; routes, stations and trains sit on it.
//
// The look: a transit diagram made physical. Thick glossy enamel strips (one per route) inlaid on a clean
// off-white panel, running only at 0 / 45 / 90 degrees with rounded bends; white station pucks with an ink ring;
// interchange capsules; small rounded trains; tidy sans labels. Original generic design: no real network's
// geometry, line names, roundel, logo or brand colours.

export const STYLE_SPEC = {
  id: "subway-map",
  name: "Subway Map",
  description:
    "A transit diagram made physical: thick glossy enamel route strips on a clean off-white panel, running only at 0/45/90 degrees with rounded bends, white ink-ringed station pucks and interchange capsules. Routes lay their own track over time, stations pop in as the line reaches them, and small rounded trains run the lines on a timetable while the camera glides low over the panel, then pulls up to the whole diagram.",
  palette: {
    bg: "#c9ccc8",          // room / table around the panel (cool grey)
    table: "#c3c6c1",
    panel: "#f3f1ea",       // off-white enamel board
    panelEdge: "#dedad0",
    grid: "#e6e2d8",        // faint 1 m dot grid on the panel
    ink: "#1e2226",         // station rings, labels
    white: "#fbfaf6",       // station fill, trains, label pills
    // route colours: generic, evenly spaced hues (not any network's brand set); use in order
    lines: ["#e2553f", "#2f7fd0", "#2fa36b", "#f2a72e", "#8b5bd0", "#e0679f", "#1aa6b0", "#7a8a2c"],
    window: "#f4f2ea",      // train window band (lit)
    trainBody: "#262b31",   // ink-dark car body: reads on every route colour
    pin: "#1e2226",         // "you are here" pin
    pinRing: "#e2553f",
  },
  world: {
    background: "#c9ccc8",
    environment: "room",
    environmentIntensity: 0.32, // gives the enamel clearcoat a soft highlight
    toneMapping: "neutral",     // keeps the off-white panel white and the line colours as designed (ACES greys paper)
    exposure: 1.0,
    shadowType: "pcf",          // pcf so the key's shadow.softness applies
  },
  materials: {
    table: { type: "standard", baseColor: "#c3c6c1", roughness: 0.92, metalness: 0 },
    panel: { type: "standard", baseColor: "#f3f1ea", roughness: 0.62, metalness: 0 },
    panelEdge: { type: "standard", baseColor: "#dedad0", roughness: 0.7, metalness: 0 },
    enamel: { type: "physical", baseColor: "#ffffff", roughness: 0.34, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.18 }, // cloned per route colour
    stationWhite: { type: "physical", baseColor: "#fbfaf6", roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 },
    ink: { type: "physical", baseColor: "#1e2226", roughness: 0.42, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.25 },
    trainBody: { type: "physical", baseColor: "#262b31", roughness: 0.3, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.12 },
    trainWindow: { type: "physical", baseColor: "#f4f2ea", roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, emission: { color: "#fff3d6", strength: 0.25 } },
    plate: { type: "standard", baseColor: "#e4e0d5", roughness: 0.5, metalness: 0 },
  },
  // geometry knobs (metres)
  route: { width: 0.46, height: 0.07, edge: 0.03, bend: 1.1, step: 0.05, inlay: 0.0 }, // strip cross-section + bend radius
  station: { r: 0.34, ring: 0.085, h: 0.14, edge: 0.03 },                            // puck on top of the strip
  interchange: { r: 0.34, ring: 0.085, h: 0.15 },
  train: { length: 1.15, width: 0.36, height: 0.3, window: 0.075, lift: 0.07 },         // ink capsule car, lit window band, route-colour skirt
  panel: { w: 25, d: 12.5, h: 0.32, radius: 0.22, dot: 0.035, dotEvery: 1, edgeH: 0.06 },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#ffffff", groundColor: "#b9b6ae", intensity: 0.9 },
    // soft daylight key from upper left-front: short, soft shadows that lift the strips off the panel
    { id: "key", type: "directional", color: "#fff6ea", intensity: 2.3, position: [-9, 16, 9], target: [0, 0, 0],
      shadow: { softness: 5, mapSize: 4096, extent: 15, near: 2, far: 60, bias: -0.0003, normalBias: 0.02 } },
    { id: "fill", type: "directional", color: "#dfe8ff", intensity: 0.45, position: [10, 6, 6], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.28, offset: 1.15 },
    grain: { amount: 0.008, fps: 30 },  // nearly clean: grain + a moving camera dominates bitrate
  },
  camera: { fov: 32, near: 0.3, far: 120, drift: { amp: 0.03, speed: 0.22 } },
  text: {
    font: "sans", weight: 700, color: "#1e2226", height: 0.42,
    stack: '"Helvetica Neue", Helvetica, Arial, sans-serif', // system faces only (no web fonts)
    signPx: 54,   // caption sign text size (screen px at 1080p)
    tagPx: 30,    // station name tags (screen px)
  },
  sfx: {
    lay: "whir (low, rising) under every laying stretch + a soft tick each metre of track",
    station: "pop + two-note blip; interchange adds a short chime",
    depart: "servo glide up (hz 90 -> 190) over the accel time",
    arrive: "servo glide down + click at the stop; two-tone door blip",
    enter: "pop", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "chime", ui: "tick", bed: "pad",
  },
  motion: [
    "Routes lay their own track: the drawn length is a closed-form clock (transit.layPlan) that eases into each station, where the station puck pops (outBack).",
    "Every route runs at 0/45/90 degrees with rounded bends (transit.octilinear + kit filletPath); geometry is resampled so the draw-on clip is uniform.",
    "Trains run a closed-form trapezoid timetable (transit.timetable): accelerate, cruise, brake into each stop, dwell; they never outrun the laying head (gapBehindHead).",
    "Camera glides low and slightly behind the laying head, then pulls up to the whole diagram for the finale.",
  ],
};
