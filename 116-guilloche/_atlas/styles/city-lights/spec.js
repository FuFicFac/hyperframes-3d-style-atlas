// styles/city-lights/spec.js — STYLE_SPEC for "City Lights": an invented skyline at blue hour seen across water.
// Plain data only (JSON-serializable, no THREE, no window): importable from Node (export-spec, render-sfx, cityplan.js)
// and the browser. Units: metres, Y-up right-handed, sRGB hex, radians, seconds.
//
// The look: layered rows of towers and mid-rise blocks in deep indigo, thousands of warm lit windows, rooftop beacons,
// a deck-arch bridge with moving headlights, a quay road, reflections shimmering on the water, a dusk gradient sky with
// a last band of orange and the first stars. Signature: WINDOWS AS PIXELS — every facade is a grid of windows whose
// on/off/colour is planned by cityplan.js (THREE-free): natural seeded switch-on waves, then programs that organise
// the windows into bar charts, floor-by-floor fills, dot-matrix words, a heartbeat pulse and a countdown.

export const STYLE_SPEC = {
  id: "city-lights",
  name: "City Lights",
  description:
    "An invented city skyline at blue hour seen across water: layered rows of towers and mid-rise blocks in deep indigo with thousands of warm lit windows, rooftop beacons, a deck-arch bridge with moving headlights, a lamplit quay road, reflections shimmering and smearing on the water, and a gradient dusk sky with a last band of orange and the first stars. Windows are pixels, as a pure function of time: every facade is a window grid whose on/off/colour comes from a THREE-free plan — windows come on in seeded waves as dusk deepens, then organise into information: a row of towers becomes a bar chart (lit height = value, LED number signs on the roofs), one tower fills floor by floor like a progress bar, a wide block spells a word like a dot-matrix display, a heartbeat pulse runs across the skyline, and floors go dark one by one for a countdown. Traffic streams as moving dashes at planned densities, and the water repeats it all, smeared.",
  palette: {
    bg: "#1b2452",
    ink: "#fff1dc",
    primary: "#ffc879",     // warm window
    secondary: "#8fb4ff",   // cool window / TV glow
    accent: "#ff8a4c",      // last band of orange
    facade: "#131a3c",
    facadeTop: "#2c3a7c",
    glass: "#1e2a5c",
    haze: "#5a5f9e",
    water: "#0b1236",
    beacon: "#ff3b30",
    sodium: "#ffad5c",
    head: "#fff4de",
    tail: "#ff4a3a",
    led: "#ffd27a",
    captionCard: "#0d1330",
    captionInk: "#fff1dc",
    captionRule: "#ffb45e",
    captionSub: "#ffcf8a",
  },
  world: {
    background: "#1b2452",     // the sky dome covers it; kept as a fallback
    environment: null,
    toneMapping: "neutral",    // warm windows must stay warm; ACES desaturates them toward white
    exposure: 1.0,
  },
  materials: {
    // lit props (bridge deck, blimp body, ferry hull). City, sky, water, LEDs and lights are custom shaders in style.js.
    deck: { type: "standard", baseColor: "#1a2042", roughness: 0.8, metalness: 0.1 },
    stone: { type: "standard", baseColor: "#171c38", roughness: 0.9, metalness: 0 },
    blimp: { type: "standard", baseColor: "#8a93b8", roughness: 0.55, metalness: 0.2 },
    hull: { type: "standard", baseColor: "#e9e6e0", roughness: 0.5, metalness: 0.05 },
    signFrame: { type: "standard", baseColor: "#0c1024", roughness: 0.6, metalness: 0.4 },
  },
  lights: [
    // blue-hour sky light from above + warm horizon bounce: only the few lit props use these
    { id: "sky", type: "hemisphere", color: "#6d7fd6", groundColor: "#1a1530", intensity: 1.1 },
    { id: "glow", type: "directional", color: "#ffb37a", intensity: 0.7, position: [10, 12, -60], target: [0, 0, 0] },
    { id: "front", type: "directional", color: "#9fb0ff", intensity: 0.35, position: [0, 20, 80], target: [0, 10, 0] },
  ],
  post: {
    // threshold is LINEAR HDR before tone mapping: the sky tops out ~0.7, lit windows are 2.2–4, beacons 6
    bloom: { strength: 0.38, radius: 0.42, threshold: 1.05 },
    vignette: { darkness: 0.28, offset: 1.1 },
    grain: { amount: 0, fps: 30 },       // no grain: the window field + water shimmer already dominate bitrate
  },
  camera: { fov: 30, near: 1, far: 3200, drift: { amp: 0, speed: 0.18 } },  // holds are locked off (dense windows under a drifting camera blow the file size)
  text: { font: "sans", weight: 700, color: "#fff1dc", height: 2 },
  sfx: { enter: "tick", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Windows switch on in seeded waves as dusk deepens: each window has a planned on-time (a west-to-east wave + floor + jitter), some never light, a few flick off and back on later.",
    "Programs take a building's windows over one by one (a staggered cascade, ~0.5 s), so the skyline visibly ORGANISES into information instead of cross-fading.",
    "Bar chart: lit floors rise to value/max x floors with an eased count; the LED roof sign counts up with it. Fill: windows light in reading order, floor by floor, the head window flashing.",
    "Word/icon: a 5x7 dot-matrix bitmap is wiped onto a wide block column by column; every other window on that face goes dark.",
    "Heartbeat: a lub-dub pair of light fronts runs across the whole skyline (every window near the front brightens and whitens, even dark ones). Countdown: floors go dark from the top in steps while the roof sign shows the digit.",
    "Traffic: head- and tail-light dashes stream along the bridge and quay at planned densities; the water re-renders everything mirrored and smears it into shimmering vertical streaks.",
  ],

  // ---------------------------------------------------------------- style-specific tuning
  city: {
    floorH: 1.6,                 // metres per floor (all buildings) — small floors = many windows per tower
    groundY: 1.2,                // quay / street level
    xCenter: -8,                 // downtown centre (skyline profile peak)
    profileWidth: 130,           // gaussian width of the height profile (m)
    rows: [
      // z = row front line (buildings extend back by depth); floors scaled by the downtown profile
      { z: -40, x: [-190, 190], floors: [8, 26], cols: [6, 14], cellW: [1.05, 1.35], depth: [12, 20], gap: [1.5, 5], haze: 0.0, types: [0, 1, 1, 3] },
      { z: -78, x: [-230, 230], floors: [16, 44], cols: [8, 16], cellW: [1.1, 1.35], depth: [14, 22], gap: [2, 7], haze: 0.3, types: [0, 0, 2, 1] },
      { z: -122, x: [-290, 290], floors: [20, 60], cols: [8, 18], cellW: [1.15, 1.4], depth: [16, 24], gap: [2, 9], haze: 0.5, types: [2, 0, 2, 1] },
      { z: -180, x: [-380, 380], floors: [16, 52], cols: [10, 20], cellW: [1.2, 1.45], depth: [18, 26], gap: [3, 12], haze: 0.72, types: [0, 2, 1] },
    ],
    beaconFloors: 36,            // buildings at least this tall get a blinking rooftop beacon
    antennaFloors: 48,           // ... and an antenna mast
    atlasW: 512,                 // window-state atlas width (texels); height grows to fit
  },
  // window cell geometry per building type: [marginX, marginBottom, marginTop] as fractions of the cell
  windowTypes: [
    { id: "office", m: [0.1, 0.2, 0.12], density: 0.56, cool: 0.35, mullion: 0.5 },
    { id: "residential", m: [0.24, 0.3, 0.2], density: 0.46, cool: 0.08, mullion: 0 },
    { id: "glass", m: [0.04, 0.16, 0.1], density: 0.5, cool: 0.4, mullion: 0.25 },
    { id: "slab", m: [0.16, 0.22, 0.16], density: 0.5, cool: 0.2, mullion: 0 },
  ],
  windows: {
    gain: 1.55,                  // HDR emission of a fully lit window (bloom threshold 0.95)
    programGain: 2.3,            // windows driven by a program read a little brighter than natural ones
    unlit: 0.0,                  // level of a program's "off" windows
    lotDensity: [0.45, 1.45],    // per-building multiplier on the type's lit density
    warm: ["#ffcf86", "#ffbe6a", "#ffdca6", "#ffe8c4", "#ffb35c"],
    cool: ["#f2f1ff", "#cfe0ff", "#9ec0ff"],
    natural: { start: 0.15, dur: 3.4, wave: 0.55, flick: 0.12, offChance: 0.07, offAfter: [2.5, 9], offFor: [0.8, 3] },
    take: { stagger: 0.55, dur: 0.12 },  // program takeover cascade
    pulse: { width: 18, speed: 260, gap: 0.2, boost: 0.9, white: 0.55, lift: 0.28 },
  },
  programs: {
    bar: { color: "#ffd38a", dur: 1.6, ease: "outCubic" },
    fill: { color: "#bfe8ff", head: "#ffffff", ease: "inOutSine" },
    bitmap: { color: "#fff0d2", wipe: 0.9, off: 0.0 },
    countdown: { color: "#ffb48a", stepFloor: 0.025 },
  },
  facade: {
    base: "#10153a", top: "#28336f", side: 0.72, glass: "#1d2756", glassSky: 0.35,
    haze: "#585d9c", hazeNear: 170, hazeK: 0.006, hazeMax: 0.72, windowHaze: 0.55,
  },
  sky: {
    radius: 1500,
    // elevation (sin of angle above horizon) -> colour; "early" at t=0, "late" at the end (dusk deepens, never black)
    stops: [-0.08, 0.0, 0.035, 0.08, 0.16, 0.3, 0.55, 1.0],
    early: ["#ffb977", "#ffb36f", "#ff9558", "#e8777c", "#a2639e", "#55529f", "#2b3a85", "#152257"],
    late: ["#ff9f5e", "#ff9a5c", "#f07a52", "#c0607c", "#7a4f98", "#3d4592", "#1f2d72", "#0d1849"],
    glowAzimuth: 0.15,           // horizon glow centre (radians from -Z, + = right)
    glowWidth: 1.1,
    stars: { density: 0.0045, size: 0.55, fadeIn: [1.5, 9], twinkle: 0.35, minElev: 0.12 },
  },
  water: {
    color: "#0a1134", distort: 0.006, smear: 0.06, taps: 9, fresnel: [0.42, 0.95], sparkle: 0.25,
    waves: [[0.11, 0.0, 1.0, 1.3], [0.23, 0.6, 0.55, 2.1], [0.41, -0.4, 0.3, 2.9], [0.07, 1.3, 0.9, 0.8]], // [k, dirAngle, amp, speed]
    rtScale: 0.5,
  },
  bridge: { z: 30, deckY: 7.2, width: 12, span: 52, x: [-420, 420], archRise: 6.2, lampEvery: 13, lampY: 4.2, lane: [-2.2, 2.2] },
  quay: { z: -36.5, y: 1.2, depth: 4, lampEvery: 9 },
  traffic: { dash: [5.5, 0.55], headGain: 3.4, tailGain: 3.0, sodiumGain: 2.6 },
  beacon: { color: "#ff3b30", gain: 7, r: 0.75, period: [1.6, 2.6], duty: 0.18 },
  led: { color: "#ffd27a", gain: 3.4, off: 0.07, dot: 0.36, atlasW: 256, atlasH: 128 },
  blimp: { len: 34, banner: [26, 4.4], ledPitch: 0.42, nav: "#ff3b30" },
  ferry: { len: 26, ledPitch: 0.36 },
  caption: {
    xPx: 96, yPx: 930, hPx: 92, padPx: 34, rulePx: 7, fontPx: 46, weight: 600,
    font: '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif',
    fadeIn: 0.35, fadeOut: 0.35, slide: 18, cardAlpha: 0.78,
    sub: { fontPx: 24, weight: 700, tracking: 4, gapPx: 14 },
  },
  sound: {
    hush: { gain: 0.42, every: 1.9 },                     // city hush: low rumble swells
    bed: { root: 130.81, chords: [[0, 7, 12, 16], [-4, 3, 7, 12], [-2, 5, 9, 14], [-5, 2, 7, 11]], every: 3.75, attack: 1.4, release: 1.8, brightness: 760, gain: 0.5 },
    wave: { bin: 0.11, gain: 0.05, max: 0.11 },          // soft ticks as windows light in the dusk wave
    floor: { gain: 0.11, pitch: [1.4, 2.4] },              // one tick per floor lit by a program
    blip: { gain: 0.06 },
    pulse: { gain: 0.42, pitch: 0.55 },                     // heartbeat thump per front
    countdown: { gain: 0.16, step: 0.24 },
    swell: { gain: 0.34, root: 196, chord: [0, 4, 7, 11, 14], brightness: 1500, dur: 4.2 },
    horn: { gain: 0.11, hz: 98, dur: 1.9 },
  },
};
