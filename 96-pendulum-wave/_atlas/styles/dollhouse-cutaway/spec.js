// styles/dollhouse-cutaway/spec.js — STYLE_SPEC for "Dollhouse Cutaway": a toy building seen straight on with its front
// wall swung open like a dollhouse; a grid of brightly coloured furnished rooms that start dim and light up warmly, one
// after another, as a little courier travels through them along a belt, a rail, a lift, steps and a chimney tube.
// Plain data only (JSON-serializable, no THREE, no window). Units: metres, Y-up, sRGB hex, radians, seconds.
// rooms.js (the room-graph planner) reads `house`, `route` and `courier`; style.js reads the rest. Everything is UNLIT:
// one small shader bakes each room's lamp into its own surfaces (no real lights, no shadows, no post stack), tone
// mapping "none", so the palette reaches the screen as written.
// Room furniture positions are [dx, y] = offset from the room's centre and height above the room's floor.

export const STYLE_SPEC = {
  id: "dollhouse-cutaway",
  name: "Dollhouse Cutaway",
  description:
    "A toy house seen front-on with its front wall swung open: a grid of brightly coloured furnished rooms that start dim and light up warmly one by one as a glowing courier travels room to room along a belt, a rail, a lift, steps and a chimney tube.",
  palette: {
    bg: "#2c3a6e",
    skyTop: "#4a62b0", skyMid: "#7f8fd0", skyLow: "#f3b08a",
    skyTopNight: "#141c44", skyMidNight: "#2b3577", skyLowNight: "#b0607a",
    ground: "#46558c", groundFar: "#3a4778", groundShadow: "#262f5a",
    ink: "#161a2e",
    shell: "#f6ead2",       // plywood cut edges of walls and floors
    facade: "#f3dfbd", facadeLine: "#e6cfa6", trim: "#ffffff", shutter: "#3f7fbf", door: "#d9483b", knob: "#ffd23f",
    inside: "#d8b98a",      // inner face of the swinging front
    glassOff: "#2a335c", glassOn: "#ffd98a",
    roof: "#5a6a99", roofAlt: "#4b5a88", chimney: "#c0583f", chimneyCap: "#6e3a2c", plinth: "#6f7896", plinthTop: "#959dbb",
    sign: "#1b2246", signTrim: "#ffd23f", signInk: "#fff4d6",
    ceiling: "#f4efe6", wood: "#c98f5a", woodDark: "#8a5a36", woodLight: "#e2b07a", steel: "#b9c2d0", steelDark: "#5d6678", rubber: "#3a3f52",
    bulb: "#fff4cc", shade: "#ffffff", glass: "#cfefff", paper: "#fbf6ea",
    parcel: "#ffc93c", parcelTape: "#e2582e", tokens: ["#19c3ff", "#ff4fa3", "#7be04a", "#ff9f1c"],
    answer: "#ffffff", answerRing: "#ffb300", tick: "#22c55e", tickOff: "#3a3557", halo: "#fff0b8",
    books: ["#e8604c", "#3d8fd6", "#ffd23f", "#8a63d2", "#f6ead2", "#2fb59a", "#ef6fa3", "#1b2246"],
    primary: "#ffd23f", secondary: "#3d8fd6", accent: "#ef6fa3",
  },
  world: { background: "#2c3a6e", fog: null, environment: null, toneMapping: "none", exposure: 1.0 },
  materials: {},   // none: every surface is the style's unlit room shader or a plain basic material
  lights: [],
  post: {},
  camera: { fov: 24, near: 2, far: 140, drift: { amp: 0, speed: 0 } },
  text: { font: "rounded", weight: 800, color: "#fff4d6", height: 0.78 },
  sfx: { enter: "thud", exit: "whooshOut", move: "servo", land: "clack", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "The front wall is two half-fronts on side hinges: they swing toward the camera and out of frame (frontAt).",
    "Rooms never move; each one's light level, activity and action pulses are pure functions of t from the route plan.",
    "One courier (parcel -> four tokens -> answer orb) is the only traveller; its position along the connectors comes from the plan.",
    "A room dims to a 'visited' level when the courier leaves; in the finale every room switches to full in a ripple.",
    "The caption is a flip sign on the roof: each label flips over (scale y through 0) when the courier heads for the next room.",
  ],

  // ---------------------------------------------------------------- look
  shade: { top: 1.0, front: 0.94, side: 0.8, bottom: 0.72 },          // flat tone per face normal
  light: {
    dim: 0.56, dimSat: 0.62, cool: [0.84, 0.9, 1.1],                  // an unlit room: its own colours, quieter and cooler
    warm: [1.06, 1.0, 0.9], bounce: 0.74, direct: 0.5, falloff: 0.14, // a lit room
    over: 0.16,                                                       // extra gain per level above 1 (finale)
    exterior: 0.92, exteriorFinale: 1.0, emitOff: 0.45,
    glow: 0.16, glowFinale: 0.26, halo: 0.6,                          // additive warm haze per room; courier halo
  },
  levels: { visited: 0.5, finale: 1.25 },

  // ---------------------------------------------------------------- the house (read by rooms.js houseLayout)
  house: {
    cols: 3, floors: 2, roomW: 5.4, roomH: 3.3, depth: 3.4, wall: 0.3,
    trackZ: -0.3, lampZ: 0.15, lampDrop: 0.6,
    plinth: { h: 0.45, out: 1.5, back: 0.6 },
    roof: { h: 1.7, eave: 0.3, top: 8.4, front: 0.35 },
    sign: { w: 11.6, h: 1.2, y: 0.9, z: 0.17, post: 0.12 },
    chimney: { w: 0.9, top: 2.05, z: -0.7 },
    door: { dx: -1.35, w: 1.15, h: 2.15 },
    window: { dx: 1.35, w: 1.3, h: 1.5, sill: 1.05 },
    front: { thick: 0.25, angle: 1.78 },
    rooms: [
      { id: "mail", col: 0, floor: 0, wall: "#3d8fd6", floorCol: "#c98f5a", spot: [0.3, 0.95] },
      { id: "tokens", col: 1, floor: 0, wall: "#e8604c", floorCol: "#e3d3b4", spot: [-1.5, 0.95], row: 1.86 },
      { id: "library", col: 2, floor: 0, wall: "#44a565", floorCol: "#b9794a", spot: [1.2, 0.95], row: 1.2 },
      { id: "workshop", col: 2, floor: 1, wall: "#f0b93a", floorCol: "#9aa3b5", spot: [1.85, 1.2], walkTo: -2.0, stations: [0.8, 0.1, -0.6, -1.3] },
      { id: "check", col: 1, floor: 1, wall: "#8a63d2", floorCol: "#e3d3b4", spot: [0.2, 1.0] },
      { id: "answer", col: 0, floor: 1, wall: "#ef6fa3", floorCol: "#c98f5a", spot: [0.4, 0.5], tube: -1.5 },
    ],
    layers: ["#2f80ff", "#00b8a9", "#ff4fa3", "#ff7a1a"],
    pipeHigh: 2.72, riserDx: 2.25, dropDx: -1.95, liftDx: 1.85,
    steps: [[-1.3, 0.75], [-2.15, 0.5]],
    hover: [1.2, 3.2],   // where the answer bubble hovers: dx from the chimney, dy above the top slab
  },

  // ---------------------------------------------------------------- the route (read by rooms.js planRoute): times in s
  route: {
    entry: { hops: [0.0, 0.26, 0.52], door: 0.74, end: 0.95 },
    door: { open: 0.3, shut: 1.02, dur: 0.2 },
    front: { t0: 1.3, t1: 2.8 },
    stops: [
      { room: "mail", arrive: 0.95, leave: 2.95, actions: [{ kind: "stamp", at: 0.4 }, { kind: "stamp", at: 0.75 }] },
      { room: "tokens", arrive: 3.5, leave: 4.7, actions: [{ kind: "chop", at: 0.22 }, { kind: "chop", at: 0.5 }, { kind: "chop", at: 0.78 }] },
      { room: "library", arrive: 5.6, leave: 6.75, actions: [{ kind: "book", at: 0.2 }, { kind: "book", at: 0.42 }, { kind: "book", at: 0.64 }, { kind: "book", at: 0.86 }] },
      { room: "workshop", arrive: 7.7, leave: 9.3, walk: [0.1, 1.3], actions: [{ kind: "fuse", at: 1.35 }] },   // + one "press" per station, timed by the walk
      { room: "check", arrive: 9.8, leave: 11.3, actions: [{ kind: "tick", at: 1.0 }] },
      { room: "answer", arrive: 11.9, leave: 12.4, actions: [{ kind: "pump", at: 0.08 }, { kind: "pump", at: 0.3 }] },
    ],
    exit: { tube: 12.55, chimney: 13.0, settle: 13.45 },
    finale: { t: 13.45, step: 0.12, period: 0.56 },
    lightDelay: 0.05, lightRamp: 0.14, dimDur: 0.6,
    labelLead: 0.35, flip: 0.12,
    labels: ["A question arrives", "Chopped into tokens", "It looks things up", "Layers do the work", "The answer is checked", "Out comes an answer"],
  },

  courier: { token: 0.42, gap: 0.3, orb: 0.8, halo: 2.6, bubble: [2.9, 2.0, 0.7], hop: 0.45 },

  sound: {
    pad: { gain: 0.34, root: 110, brightness: 900 },
    padHigh: { gain: 0.14, root: 220, brightness: 1500 },
    hop: { gain: 0.32 }, door: { gain: 0.4 }, front: { gain: 0.42 }, thunk: { gain: 0.62 },
    switch: { gain: 0.32 }, chime: { gain: 0.26, base: 392, steps: [0, 2, 4, 7, 9, 12] },
    action: { gain: 0.3 }, move: { gain: 0.14 }, out: { gain: 0.45 }, finale: { gain: 0.4 }, flip: { gain: 0.2 },
  },
};
