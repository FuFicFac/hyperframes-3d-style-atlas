// styles/dollhouse-cutaway/spec.js — STYLE_SPEC for "Dollhouse Cutaway": a toy building seen straight on with its front
// wall swung open like a dollhouse; a grid of furnished rooms that start dim and light up warmly, one after another, as
// a little courier travels through them along belts, pipes, a lift, a chute and steps.
// Plain data only (JSON-serializable, no THREE, no window). Units: metres, Y-up, sRGB hex, radians, seconds.
// rooms.js (the room-graph planner) reads `house` and `route`; style.js reads the rest. Everything is UNLIT: one small
// shader bakes each room's lamp into its own surfaces (no real lights, no shadows, no post stack), tone mapping "none".

export const STYLE_SPEC = {
  id: "dollhouse-cutaway",
  name: "Dollhouse Cutaway",
  description:
    "A toy house seen front-on with its front wall swung open: a grid of brightly coloured furnished rooms that start dim and light up warmly one by one as a glowing courier travels room to room along belts, pipes, a lift, a chute and steps.",
  palette: {
    bg: "#2c3a6e",
    skyTop: "#1f2a5a", skyMid: "#3b4f93", skyLow: "#e58f6a",
    ink: "#161a2e",
    shell: "#f6ead2",       // plywood cut edges of walls and floors
    facade: "#f3dfbd", facadeLine: "#e3c99d", trim: "#ffffff", shutter: "#3f7fbf", door: "#d9483b", knob: "#ffd23f",
    inside: "#d8b98a",      // inner face of the swinging front
    glassOff: "#232c4f", glassOn: "#ffd98a",
    roof: "#50608a", roofAlt: "#42507a", chimney: "#b9553d", plinth: "#6f7896", plinthTop: "#8b94b3",
    sign: "#161c38", signInk: "#fff4d6",
    ceiling: "#f4efe6", wood: "#c98f5a", woodDark: "#8a5a36", steel: "#b9c2d0", steelDark: "#5d6678", rubber: "#3a3f52",
    bulb: "#fff1c4", shade: "#ffffff", glass: "#cfefff",
    parcel: "#ffd23f", parcelTape: "#e2582e", tokens: ["#19c3ff", "#ff4fa3", "#7be04a", "#ffffff"],
    answer: "#ffffff", answerRing: "#ffb300", tick: "#22b455", halo: "#fff0b8",
    primary: "#ffd23f", secondary: "#3d8fd6", accent: "#ef6fa3",
  },
  world: { background: "#2c3a6e", fog: null, environment: null, toneMapping: "none", exposure: 1.0 },
  materials: {},   // none: every surface is the style's unlit room shader or a plain basic material
  lights: [],
  post: {},
  camera: { fov: 24, near: 2, far: 140, drift: { amp: 0, speed: 0 } },
  text: { font: "rounded", weight: 800, color: "#fff4d6", height: 0.86 },
  sfx: { enter: "thud", exit: "whooshOut", move: "servo", land: "clack", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "The front wall is two half-doors on side hinges: they swing toward the camera and out of frame (frontAt).",
    "Rooms never move; each one's light level, activity and action pulses are pure functions of t from the route plan.",
    "One courier (parcel -> tokens -> answer) is the only traveller; its position along the connectors comes from the plan.",
    "A room dims to a 'visited' level when the courier leaves; in the finale every room switches to full in a ripple.",
    "Camera: straight on, one push-in while the front opens, then a very slow sideways creep for parallax.",
  ],

  // ---------------------------------------------------------------- look
  shade: { top: 1.0, front: 0.93, side: 0.8, bottom: 0.74 },          // flat tone per face normal
  light: {
    dim: 0.5, dimSat: 0.6, cool: [0.78, 0.86, 1.12],                  // an unlit room: its own colours, quieter and cooler
    warm: [1.06, 1.0, 0.9], bounce: 0.64, direct: 0.62, falloff: 0.1, // a lit room
    over: 0.22,                                                       // extra gain per level above 1 (finale)
    exterior: 0.86, exteriorFinale: 1.0,
    glow: 0.2, glowFinale: 0.34, halo: 0.55,                          // additive warm haze per room; sky halo in the finale
  },
  levels: { visited: 0.42, finale: 1.3 },

  // ---------------------------------------------------------------- the house (read by rooms.js houseLayout)
  house: {
    cols: 3, floors: 2, roomW: 5.4, roomH: 3.3, depth: 3.4, wall: 0.3,
    trackZ: -1.2, plinth: { h: 0.45, out: 1.5 },
    roof: { h: 1.6, eave: 0.25, top: 6.2, front: 0.35 },
    sign: { w: 11.4, h: 1.12, y: 0.82, z: 0.5 },
    chimney: { w: 0.9, top: 1.85 },
    door: { dx: -1.35, w: 1.15, h: 2.15 },
    window: { dx: 1.35, w: 1.5, h: 1.7, sill: 0.9 },
    front: { thick: 0.25, angle: 1.78 },
    rooms: [
      { id: "mail", col: 0, floor: 0, wall: "#3d8fd6", floorCol: "#c98f5a", spot: [0.3, 1.23] },
      { id: "tokens", col: 1, floor: 0, wall: "#e8604c", floorCol: "#d9c7a8", spot: [0, 1.23] },
      { id: "library", col: 2, floor: 0, wall: "#44a565", floorCol: "#b9794a", spot: [-0.6, 1.23] },
      { id: "workshop", col: 2, floor: 1, wall: "#f0b93a", floorCol: "#9aa3b5", spot: [1.85, 1.5], walkTo: [-2.0, 1.5], stations: [0.8, 0.1, -0.6, -1.3] },
      { id: "check", col: 1, floor: 1, wall: "#8a63d2", floorCol: "#d9c7a8", spot: [0.2, 1.23] },
      { id: "answer", col: 0, floor: 1, wall: "#ef6fa3", floorCol: "#c98f5a", spot: [0.4, 0.73], tube: -1.5 },
    ],
    layers: ["#2f80ff", "#00b8a9", "#ff4fa3", "#ff7a1a"],
    pipeHigh: 2.72, pipeDx: 1.95, liftDx: 1.85, steps: [[-1.6, 0.98], [-2.25, 0.73]],
    hover: [1.0, 2.75],   // where the answer hovers: dx from the chimney, dy above the top slab
  },

  // ---------------------------------------------------------------- the route (read by rooms.js planRoute): times in s
  route: {
    door: { open: 0.3, shut: 1.0, dur: 0.16 },
    front: { t0: 1.3, t1: 2.8 },
    entry: { t0: 0.5 },
    stops: [
      { room: "mail", arrive: 0.95, leave: 2.95, light: 0.2, actions: [{ kind: "stamp", at: 1.3 }, { kind: "stamp", at: 1.62 }] },
      { room: "tokens", arrive: 3.5, leave: 4.7, actions: [{ kind: "chop", at: 0.28 }, { kind: "chop", at: 0.54 }, { kind: "chop", at: 0.8 }] },
      { room: "library", arrive: 5.6, leave: 6.75, actions: [{ kind: "book", at: 0.3 }, { kind: "book", at: 0.52 }, { kind: "book", at: 0.74 }, { kind: "book", at: 0.96 }] },
      { room: "workshop", arrive: 7.7, leave: 9.3, walk: [0.15, 1.45], actions: [{ kind: "fuse", at: 1.5 }] },   // + one "press" per station, timed by the walk
      { room: "check", arrive: 9.8, leave: 11.3, actions: [{ kind: "tick", at: 1.05 }] },
      { room: "answer", arrive: 11.9, leave: 12.4, actions: [{ kind: "pump", at: 0.15 }, { kind: "pump", at: 0.4 }] },
    ],
    exit: { out: 13.1, settle: 13.45 },
    finale: { t: 13.4, step: 0.07, period: 0.52 },
    lightDelay: 0.06,
    labels: ["A question arrives", "Chopped into tokens", "It looks things up", "Layers do the work", "The answer is checked", "Out comes an answer"],
  },

  courier: { parcel: 0.74, token: 0.36, gap: 0.44, answer: 0.8, halo: 2.4, bubble: 1.35 },

  sound: {
    pad: { gain: 0.3, root: 110, brightness: 900 },
    padHigh: { gain: 0.12, root: 220, brightness: 1400 },
    door: { gain: 0.42 }, front: { gain: 0.4 }, thunk: { gain: 0.6 },
    switch: { gain: 0.34 }, chime: { gain: 0.3, base: 392, steps: [0, 2, 4, 7, 9, 12] },
    action: { gain: 0.26 }, move: { gain: 0.16 }, out: { gain: 0.5 }, finale: { gain: 0.42 },
  },
};
