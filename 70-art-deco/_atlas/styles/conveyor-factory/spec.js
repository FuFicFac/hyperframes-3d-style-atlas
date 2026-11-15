// styles/conveyor-factory/spec.js — STYLE_SPEC for "Conveyor Factory". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the line plan + score + shots) and the browser.
// Units: metres at real scale (a carton is ~0.5 m), Y-up right-handed, sRGB hex, radians.
//
// The look: a bright, friendly modern packing line at three-quarter height. Cream concrete floor with painted safety
// lines and hatched zones, mint-green and safety-yellow machinery with rounded guards, black ribbed belts on steel
// frames and rollers, kraft cartons, coloured totes and poly parcels, overhead signboards and a counter board, stack
// lights (red / amber / green) on every station, a yellow robot arm, soft daylight from skylights.
// The mechanism: line.js plans every item as a pure function of time through a network of belt segments, with stations
// that transform it (scan, divert, press, fill, check / reject, wrap, robot pick-and-place) and accumulating queues.
// Line frame: the line runs along +X (left to right on screen), the viewer sits at +Z, floor at y = 0.

export const STYLE_SPEC = {
  id: "conveyor-factory",
  name: "Conveyor Factory",
  description:
    "A bright, friendly modern packing line at three-quarter height: cream floor with painted safety lines, mint-green and safety-yellow machinery with rounded guards, black ribbed belts on steel frames, kraft cartons, coloured totes and poly parcels, overhead signboards, red/amber/green stack lights, a yellow robot arm and soft skylight daylight. A process becomes a production line: items enter at a planned rate and every item's position is a closed-form function of time through belt segments; stations transform them as they pass (scanner tags, diverter sorts, press stamps, filler loads, quality gate rejects one down a chute, wrapper seals, robot arm picks and places), queues build where a station is slower than the belt, stack lights follow station state and overhead counters tick.",
  palette: {
    bg: "#e9e6de",
    floor: "#ebe3d1",
    floorLine: "#f2c230",
    floorWhite: "#f8f5ee",
    floorDark: "#2a2a28",
    mint: "#8fd6b9",
    mintDark: "#58ad8e",
    yellow: "#f4c22f",
    steel: "#c9ced4",
    steelDark: "#7d858d",
    belt: "#1d1f21",
    rib: "#34383b",
    kraft: "#c79a63",
    tape: "#d9b98a",
    totes: ["#2f6fc0", "#e3603b", "#7a62b8"],
    parcel: "#e9ecee",
    fill: "#e9b55a",
    sign: "#23333f",
    signInk: "#f6f4ee",
    counter: "#ffb43d",
    red: "#e8392e",
    amber: "#f6a51f",
    green: "#36c25a",
    wall: "#e3e5e1",
    window: "#f1f7ff",
    ink: "#1f2a33",
  },
  world: {
    background: "#e9e6de",
    fog: { color: "#e9e6de", near: 26, far: 60 },
    environment: "room",
    environmentIntensity: 0.38,   // steel frames, rollers and the film wrap need something to reflect
    toneMapping: "neutral",       // keeps the mint / yellow / cream palette as designed (ACES greys the cream floor)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    floor: { type: "standard", baseColor: "#ffffff", roughness: 0.86, metalness: 0 },     // map: painted floor canvas (style.js)
    mint: { type: "physical", baseColor: "#8fd6b9", roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4 },
    mintDark: { type: "physical", baseColor: "#58ad8e", roughness: 0.48, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.45 },
    yellow: { type: "physical", baseColor: "#f4c22f", roughness: 0.4, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.35 },
    steel: { type: "standard", baseColor: "#c9ced4", roughness: 0.32, metalness: 0.85 },
    steelDark: { type: "standard", baseColor: "#7d858d", roughness: 0.45, metalness: 0.7 },
    rubber: { type: "standard", baseColor: "#26292b", roughness: 0.75, metalness: 0 },
    joint: { type: "standard", baseColor: "#3a4046", roughness: 0.5, metalness: 0.2 },
    belt: { type: "standard", baseColor: "#ffffff", roughness: 0.7, metalness: 0 },        // map: ribbed belt (scrolls)
    kraft: { type: "standard", baseColor: "#ffffff", roughness: 0.78, metalness: 0 },      // map: kraft board
    parcel: { type: "standard", baseColor: "#e9ecee", roughness: 0.55, metalness: 0 },
    fill: { type: "standard", baseColor: "#e9b55a", roughness: 0.9, metalness: 0 },
    wall: { type: "standard", baseColor: "#e3e5e1", roughness: 0.9, metalness: 0 },
    window: { type: "standard", baseColor: "#e8f1fb", roughness: 0.3, metalness: 0, emission: { color: "#f1f7ff", strength: 1.15 } },
    wood: { type: "standard", baseColor: "#c9a26f", roughness: 0.8, metalness: 0 },
    sign: { type: "standard", baseColor: "#23333f", roughness: 0.5, metalness: 0.1 },
  },
  lights: [
    { id: "sky", type: "hemisphere", color: "#f7f9ff", groundColor: "#ddd3c0", intensity: 1.15 },
    {
      // skylight daylight: high and a little behind-left, soft short shadows falling toward the viewer
      id: "sun", type: "directional", color: "#fff6e8", intensity: 2.2, position: [-3.5, 14, -5], target: [0, 0, 0],
      shadow: { softness: 6, mapSize: 4096, extent: 9.5, near: 2, far: 34, bias: -0.0003, normalBias: 0.02 },
    },
    { id: "fill", type: "directional", color: "#eef3ff", intensity: 0.45, position: [4, 6, 10], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.32, radius: 0.35, threshold: 2.4 },   // only lit stack-light lenses and the scanner curtain bloom
    vignette: { darkness: 0.18, offset: 1.15 },
  },
  camera: { fov: 32, near: 0.3, far: 80, drift: { amp: 0.01, speed: 0.18 } },
  text: { font: "sans", weight: 700, color: "#1f2a33", height: 0.3 },

  // ---- the reference line layout (line.js builds the network from it; a scene may pass its own) -------------------
  line: {
    v: 0.8,               // belt speed, m/s (texture scroll and roller spin follow it)
    gap: 0.66,            // minimum centre-to-centre spacing of items on a belt (accumulation pitch)
    beltY: 0.78,          // belt top height
    beltW: 0.72,          // belt width
    segments: {
      // incline infeed out of the hood, scanner on the flat
      infeed: { pts: [[-7.1, 0.36, -0.9], [-6.45, 0.36, -0.9], [-5.15, 0.78, -0.9], [-4.0, 0.78, -0.9]], radius: 1.4, kind: "incline" },
      laneA: { pts: [[-4.0, 0.78, -0.9], [2.4, 0.78, -0.9]], kind: "straight" },
      laneB: { pts: [[-4.0, 0.78, -0.9], [-3.05, 0.78, -0.9], [-2.15, 0.78, 0.42], [0.55, 0.78, 0.42], [1.45, 0.78, -0.9], [2.4, 0.78, -0.9]], radius: 0.95, kind: "curve" },
      post: { pts: [[2.4, 0.78, -0.9], [5.45, 0.78, -0.9]], kind: "straight" },
    },
    routes: { A: ["infeed", "laneA", "post"], B: ["infeed", "laneB", "post"] },
    sort: { carton: "A", parcel: "A", tote: "B" },     // diverter: item type -> route
    beds: [                                              // roller transfer beds over the split and the merge
      { id: "split", x: [-4.2, -2.3], z: [-1.32, 0.02] },
      { id: "merge", x: [1.15, 2.95], z: [-1.32, 0.02] },
    ],
    hood: { x: [-7.25, -6.25], h: 1.1 },
    chute: { x: 3.6, z0: -0.42, z1: 1.25, y0: 0.74, y1: 0.3, w: 0.66 },
    robot: { base: [6.05, 0, -0.12], pallet: { center: [6.1, 0, 0.98], cols: 4, rows: 3, pitch: [0.56, 0.44], top: 0.15, layer: 0.4 } },
  },
  stations: [
    { id: "scan", kind: "scan", seg: "infeed", x: -4.55, name: "SCAN" },
    { id: "divert", kind: "divert", seg: "infeed", x: -3.95, name: "SORT" },
    { id: "press", kind: "press", seg: "laneA", x: -1.35, dwell: 0.42, name: "PRESS" },
    { id: "fill", kind: "fill", seg: "laneB", x: -0.15, dwell: 2.0, name: "FILL" },
    { id: "merge", kind: "merge", seg: "post", s: 0, name: "MERGE" },
    { id: "qc", kind: "qc", seg: "post", x: 3.05, name: "CHECK" },
    { id: "push", kind: "push", seg: "post", x: 3.6, dwell: 0, name: "REJECT" },
    { id: "wrap", kind: "wrap", seg: "post", x: 4.3, name: "WRAP" },
    { id: "pick", kind: "pick", seg: "post", x: 5.2, name: "PACK" },
  ],
  items: {
    carton: { size: [0.5, 0.4, 0.36], weight: 0.5 },
    tote: { size: [0.56, 0.4, 0.28], weight: 0.3 },
    parcel: { size: [0.44, 0.32, 0.12], weight: 0.2 },
    lift: 0.014,          // item bottom above the belt surface (belt crown + roller beds)
  },
  // ---- station timing (line.js reads these) ---------------------------------------------------------------------------
  timing: {
    scanSweep: 0.32,      // light-curtain sweep half-window around the read
    divertLead: 0.6, divertHold: 0.35, divertRamp: 0.22,   // diverter arm: out before the tote arrives, back after
    divertAngle: 0.62,    // arm swing (rad)
    pressDown: 0.06, pressHit: 0.18, pressUp: 0.3,          // ram timing inside the press dwell (s from start)
    fillOpen: 0.22, fillClose: 0.3,                        // pour starts / ends this long inside the fill dwell
    fillLevel: 0.78,      // tote fill level (fraction of inner height)
    queueAmber: 2,        // stack light turns amber at this many waiting items
    pushOut: 0.34, slideAccel: 2.6,                        // reject: pusher stroke time, chute acceleration (m/s²)
    rejectRed: 1.6,       // QC stack light red window after a reject read
    pick: { down: 0.1, grip: 0.04, up: 0.1, travel: 0.27, lower: 0.1, release: 0.03, back: 0.26 },
    hoverLift: 0.32,      // effector clearance above an item while travelling
  },
  robot: {
    pedestal: [0.62, 0.42],   // pedestal radius x height
    shoulderH: 1.02,          // shoulder pivot height above the floor
    L1: 1.0, L2: 0.98,        // upper arm, forearm
    tool: 0.26,               // wrist to suction cup face (tool hangs vertical)
    thick: 0.16,
  },
  signs: { y: 2.75, h: 0.46, font: '"Avenir Next Condensed", "Helvetica Neue", Arial, sans-serif', weight: 700 },
  counter: { font: '"Menlo", "Monaco", monospace', labelFont: '"Avenir Next Condensed", "Helvetica Neue", Arial, sans-serif', digits: 3 },
  belt: { tile: 0.36, ribs: 6, px: 256 },
  floorTex: { size: [26, 14], center: [0, 0.1], pxPerMetre: 80 },

  // ---- overlay: one caption card (exact colours) + a SAMPLE DATA stamp ------------------------------------------------
  caption: { x: 92, y: 920, h: 92, cap: 46, font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700, card: "#fbfaf6", ink: "#1f2a33", rule: "#f4c22f" },
  stamp: { text: "SAMPLE DATA", x: 1828, y: 952, cap: 24, color: "#d0342a", font: '"Avenir Next Condensed", "Helvetica Neue", Arial, sans-serif' },

  sound: {
    hum: { gain: 0.05, hz: 50 },
    bed: { gain: 0.6, root: 110, brightness: 820 },
    beep: { gain: 0.12, pitch: 1.6 },
    hiss: { gain: 0.1, pitch: 2.4 },
    stamp: { gain: 0.42, pitch: 1.2 },
    pour: { gain: 0.22 },
    servo: { gain: 0.11, hz: 130, hz2: 240, grit: 0.22 },
    place: { gain: 0.16, pitch: 0.7 },
    tick: { gain: 0.08 },
    buzz: { gain: 0.1 },
    wrap: { gain: 0.06 },
    caption: { gain: 0.1 },
  },
  sfx: { enter: "blip", exit: "whooshOut", move: "servo", land: "thud", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Items enter from the hood up an incline belt at a planned release rate; every item's position is a closed-form function of (t - release) along its route, with holds at stations.",
    "Accumulation: an item never comes closer than one pitch to the item ahead on the same belt, so a slow station grows a visible queue that advances in steps when the head leaves.",
    "Stations transform items as they pass: the scanner curtain sweeps and a tag appears; the diverter arm swings totes onto the curved lane; the press ram stamps a mark; the filler pours a tote to a level.",
    "The quality gate flags one item, the pusher shoves it onto the roller chute where it slides into the bin (red light); the wrapper ring spins and items leave sealed in film.",
    "The robot arm (analytic two-joint IK) picks each item at the end stop and places it on the pallet grid; belts scroll and rollers turn at belt speed; stack lights and overhead counters follow the plan.",
  ],
};
