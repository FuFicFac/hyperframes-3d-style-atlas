// styles/infinity-mirror/spec.js — STYLE_SPEC for "Infinity Mirror". Plain data only: JSON-serializable, no THREE,
// no window. Importable from Node (export-spec.mjs, scene.config.js for the recursion plan + score) and the browser.
// Units: metres, Y-up right-handed, colours sRGB hex, angles radians.
//
// The look: a framed box on a dark gallery wall in a pool of warm light. Between a rear mirror and a half-silvered
// front glass hangs ONE real layer: a hoop of large warm and coloured bulbs and a small figure. Every reflection is
// real instanced geometry (generation n = the real layer mirrored n times, dimmed by reflectance^n and tinted green by
// the glass), so the camera can push through the glass and fly down the tunnel. Tilting the mirrors by pi/ringCells
// closes the tunnel into a ring: fly all the way round and you are back in front of the box.

export const STYLE_SPEC = {
  id: "infinity-mirror",
  name: "Infinity Mirror",
  description:
    "Recursion you can count: a framed light box on a dark gallery wall holds one real layer (a hoop of large warm and coloured bulbs plus a small glowing figure) between a rear mirror and a half-silvered front glass. Each reflection is REAL instanced geometry (generation n = the real layer reflected n times: alternately flipped, stepped back by the cavity depth, dimmed by mirror x glass reflectance per bounce, so deep copies go dim and green), so the tunnel can grow one generation at a time, anything placed in the real layer ripples into every copy, and the camera can push through the front glass and fly down the tunnel past copy after copy. A small tilt between the mirrors turns every step into a rotation about the mirrors' hinge line: the straight tunnel bends, and at pi/ringCells it closes into a ring, so the flight curves all the way round and arrives back in front of the box. One soft pluck per new generation, each quieter, lower and duller, comes from the same plan.",
  palette: {
    bg: "#040406",
    wall: "#6b4a5e",
    wallPool: "#ffd9b0",
    floor: "#2a2028",
    frame: "#d9c7a6",
    hoop: "#3a3230",
    warm: "#ffd7a1",
    amber: "#ffa530",
    coral: "#ff5148",
    magenta: "#ff46ad",
    violet: "#8a66ff",
    cyan: "#35cdff",
    figure: "#49d6ff",
    figureDark: "#10283a",
    eye: "#fff1cf",
    glassTint: "#b9ffd8",
    ink: "#fff3df",
    chip: "#0c0a10",
    chipEdge: "#3b3340",
    green: "#79f2a4",
  },
  world: {
    background: "#040406",
    fog: null,
    environment: null,
    toneMapping: "neutral",   // keeps the bulb hues; ACES turns saturated emissives white first
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    frame: { type: "standard", baseColor: "#d9c7a6", roughness: 0.62, metalness: 0.0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffe9d2", groundColor: "#3a2c36", intensity: 0.55 },
    // the picture light: from above and in front of the box, so the frame's front and top faces catch it
    { id: "picture", type: "directional", color: "#ffe2bd", intensity: 2.0, position: [1.5, 6, 7], target: [0, 0, 0.5] },
  ],
  post: {
    bloom: { strength: 0.62, radius: 0.5, threshold: 0.95 },
    vignette: { darkness: 0.22, offset: 1.2 },
  },
  camera: { fov: 35, near: 0.2, far: 160, drift: { amp: 0, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#fff3df", height: 0.4 },

  // ---- the cavity (recursion.js) ---------------------------------------------------------------------------
  cavity: {
    depth: 1.1,          // D: rear mirror at z = -D/2, front glass at z = +D/2, the real layer in the plane z = 0
    generations: 42,     // deepest reflection that is instanced (0 = the real layer)
    ringCells: 30,       // full tilt = pi / ringCells between the mirrors: the tunnel closes after 2 x ringCells steps
    tail: 6,             // the last `tail` generations fade toward nothing so the tunnel has no hard end
  },
  optics: {
    mirror: [0.975, 0.98, 0.965],   // rear mirror reflectance per bounce (r, g, b)
    glass: [0.755, 0.9, 0.735],     // half-silvered glass, seen from inside: it keeps green best -> deep copies go green
    exposure: 0.7,                  // 0 = fixed exposure, 1 = full auto-exposure to the generation the camera is at
    maxGain: 14,
    flash: 0.9, flashDur: 0.22,     // a new generation arrives a little hot, then settles
    appear: 0.16,                   // s fade-in of a new generation
  },
  // ---- the real layer ---------------------------------------------------------------------------------------
  aperture: { w: 6.2, h: 3.0 },
  hoop: { w: 5.8, h: 2.6, corner: 0.6, tube: 0.034, level: 0.16 },
  bulbs: {
    count: 40, radius: 0.105, level: 1.9, colourLevel: 2.15, limb: 0.42,
    // pattern repeated round the hoop: warm bulbs with a coloured one between
    pattern: ["warm", "amber", "warm", "coral", "warm", "magenta", "warm", "violet", "warm", "cyan"],
  },
  figure: { scale: 1.0, x: 0, level: 1.35, eyeLevel: 2.2, pop: 0.42, overshoot: 1.9 },
  // ---- the gallery ------------------------------------------------------------------------------------------
  gallery: {
    wallZ: 0.3, wallW: 90, wallH: 44,
    frame: { bar: 0.24, front: 0.64 },                  // bar width; z of the frame's front face
    pool: { centre: [0, 0.3], radius: 6.2, level: 0.9, ambient: 0.02 },
    spill: { level: 0.5, reach: 0.55, colour: "#ffb070" },   // bulb glow on the wall round the frame
    floorY: -2.7, floorLevel: 0.55,
    glass: { level: 0.085, streaks: 3.0, edge: 0.05 },
  },
  // ---- overlay chips (bottom band) ----------------------------------------------------------------------------
  caption: { y: 930, h: 92, cap: 50, maxW: 1100, weight: 700 },
  counter: { right: 96, y: 942, h: 68, cap: 34, w: 330 },

  sound: {
    bed: { root: 110, chord: [0, 7, 12, 16], brightness: 700, gain: 0.42 },
    hum: { gain: 0.05 },
    bulb: { gain: 0.16, pitch: 1.5 },
    gen: { hz: 587.33, semis: -0.55, gain: 0.62, gainFall: 0.9, bright: 0.85, brightFall: 0.93, decay: 1.3, rushGain: 0.5 },
    place: { pop: 0.5, echoGain: 0.34, echoFall: 0.86 },
    dive: { riser: 0.3, whoosh: 0.5, glass: 0.4 },
    pass: { gain: 0.2, fall: 0.985, pitch: 1.6, pitchFall: 0.985 },
    tilt: { gain: 0.26 },
    arrive: { chime: 0.4, pluck: 0.5 },
  },
  sfx: { enter: "pluck", exit: "whooshOut", move: "whoosh", land: "pop", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "The tunnel grows one reflection at a time (1, 2, 3 ... then a rush): each new generation fades in a little hot with one pluck, quieter and duller than the last.",
    "Anything placed in the real layer ripples down every generation a few hundredths of a second apart.",
    "The camera pushes through the front glass and flies the tunnel's centreline; exposure follows the generation it is at, so near copies stay readable while their colour drains to green.",
    "Tilting the mirrors bends the tunnel about their hinge line; at pi/ringCells it is a closed ring and the flight ends back in front of the box.",
  ],
};
