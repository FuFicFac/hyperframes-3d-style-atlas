// styles/pinball-table/spec.js — STYLE_SPEC for "Pinball Table". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the ball plan + score) and the browser.
//
// The look: an electro-mechanical pinball playfield seen from the player's end with the glass off. A glossy printed
// wooden playfield (original abstract art and words), chrome rails and a steel ball, rubber-ringed posts, mushroom pop
// bumpers with coloured caps, a drop-target bank, rollover lanes, slingshots, two flippers, a plastic ramp with a wire
// return, and LIT INSERTS under the playfield (arrows, circles, lettered lamps). A backglass with mechanical score reels
// stands at the far end.
// The ball is planned by pinplan.js (pure, Node-safe): a contact schedule -> piecewise ballistic / rolling segments ->
// ball position(t), flipper angles, lamp levels and reel values. Sound reads the same plan.
//
// FIELD FRAME (used by pinplan.js and every layout number below): x across the playfield (-W/2 .. W/2, + = right as the
// player sees it), v up the table from the near (flipper) end (0 .. L), h height above the playfield surface.
// World: the playfield's near edge centre is the world origin; the field is tilted up by `table.tiltDeg` about X, so
// field (x, v, h) -> world (x, h cos + v sin, h sin - v cos). Units: metres at ~2x real size, so parts read at 1080p.

export const STYLE_SPEC = {
  id: "pinball-table",
  name: "Pinball Table",
  description:
    "An electro-mechanical pinball playfield seen from the player's end, glass off: glossy printed wooden playfield with original abstract art, chrome rails and a steel ball, rubber-ringed posts, mushroom pop bumpers with coloured caps, a drop-target bank, rollover lanes, slingshots, two flippers, a plastic ramp and lit inserts under the playfield, plus a backglass with mechanical score reels. The ball follows a planned contact schedule; every contact lights lamps, drops targets and steps the reels.",
  palette: {
    bg: "#0c0a09",
    navy: "#1a2766",
    blue: "#2c4fb8",
    teal: "#159a94",
    orange: "#ef7d22",
    yellow: "#ffcb2e",
    red: "#d9302a",
    magenta: "#c8306e",
    cream: "#f5ead0",
    ink: "#141016",
    wood: "#b98a55",
    chrome: "#e8ebef",
  },
  world: {
    background: "#0c0a09",
    environment: "room",
    environmentIntensity: 0.4, // chrome, the ball and the playfield clear coat need something to reflect
    toneMapping: "neutral",     // keeps the printed art and insert colours as drawn (ACES greys the cream, desaturates lamps)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    chrome: { type: "standard", baseColor: "#e6e9ee", roughness: 0.2, metalness: 1 },
    steel: { type: "standard", baseColor: "#e9ecef", roughness: 0.06, metalness: 1 },
    cabinet: { type: "standard", baseColor: "#2a1a12", roughness: 0.55, metalness: 0 },
    wall: { type: "standard", baseColor: "#f1ece2", roughness: 0.4, metalness: 0 },
    blackPlastic: { type: "standard", baseColor: "#17151a", roughness: 0.35, metalness: 0 },
    whitePlastic: { type: "physical", baseColor: "#f4f1ea", roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 },
    rubberRed: { type: "standard", baseColor: "#c22a22", roughness: 0.75, metalness: 0 },
    rubberWhite: { type: "standard", baseColor: "#eeeae0", roughness: 0.8, metalness: 0 },
    rubberBlack: { type: "standard", baseColor: "#1b1a1c", roughness: 0.8, metalness: 0 },
    floor: { type: "standard", baseColor: "#100c0a", roughness: 0.95, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffe9cc", groundColor: "#1a120c", intensity: 0.75 },
    {
      // the room light above and behind the player: the main shading and the only shadow caster
      id: "key", type: "directional", color: "#fff1dc", intensity: 1.55, position: [-0.9, 3.4, 1.6], target: [0, 0, -1.0],
      shadow: { softness: 3, mapSize: 2048, extent: 1.55, near: 0.5, far: 7, bias: -0.0003, normalBias: 0.006 },
    },
    // GI: the warm glow of the bulbs under the rails and plastics, as a soft low fill from the player's end (no shadows)
    { id: "gi", type: "directional", color: "#ffc98a", intensity: 0.55, position: [0.6, 1.2, 2.4], target: [0, 0, -1.0] },
  ],
  post: {
    bloom: { strength: 0.75, radius: 0.35, threshold: 2.3 }, // lit inserts, bumper caps and the backglass bloom; lit art does not
    vignette: { darkness: 0.42, offset: 1.0 },
  },
  camera: { fov: 36, near: 0.05, far: 30, drift: { amp: 0.004, speed: 0.2 } },
  text: { font: "sans", weight: 700, color: "#141016", height: 0.05 },

  // ---- the table (field frame) -------------------------------------------------------------------------------
  table: {
    W: 1.0, L: 2.1, tiltDeg: 6.5,          // playfield size and pitch
    thick: 0.03,                             // playfield board thickness (visible at the shooter lane / edges)
    ballR: 0.03,
    G: 1.25,                                 // down-table acceleration used by ballistic segments (m/s^2, field units)
    wallH: 0.14, wallT: 0.05,                // cabinet side walls above the playfield
    art: { pxPerM: 1500, woodShow: 0.07, keyline: 3 },
    clearcoat: 0.85, clearcoatRoughness: 0.06, roughness: 0.42, envOnField: 0.18,
  },
  flipper: { pivotX: 0.205, v: 0.30, len: 0.165, rp: 0.027, rt: 0.012, h: 0.034, restDeg: -30, upDeg: 26, rise: 0.05, fall: 0.13, hold: 0.16, rubber: 0.0055 },
  bumpers: {
    r: 0.058, skirt: 0.078, h: 0.07, ringDrop: 0.016, kick: 0.09,
    list: [
      { id: "A", at: [-0.07, 1.56], cap: "#e0352b", word: "TASK" },
      { id: "B", at: [0.22, 1.50], cap: "#ffc21f", word: "TASK" },
      { id: "C", at: [0.08, 1.26], cap: "#2f63d8", word: "TASK" },
    ],
  },
  slings: {
    h: 0.05, rubber: 0.007, kick: 0.012, kickDur: 0.11, plastic: "#ef7d22",
    // triangle per side: A bottom-outer, B top-outer, C bottom-inner; the rubber face is B -> C (mirrored for R)
    L: { A: [-0.355, 0.46], B: [-0.355, 0.70], C: [-0.255, 0.42] },
  },
  orbit: { c: [0, 1.58], R: 0.465, wallH: 0.06, innerFrom: 18, innerTo: 162, innerGap: 0.075 },
  shooter: { x: 0.465, wallX: 0.43, wallTo: 1.45, rest: 0.13, pull: 0.07, tipLen: 0.1 },
  leftLane: { x: -0.465, wallX: -0.425, wallFrom: 1.62, wallTo: 1.0, rollovers: [1.46, 1.34, 1.22, 1.10], insertX: -0.385 },
  inlane: { x: 0.398, dividerX: 0.448, top: 0.70, guideTo: [0.25, 0.345] },
  bank: { c: [0.30, 1.02], aimAt: [-0.10, 0.33], pitch: 0.068, w: 0.058, hgt: 0.058, d: 0.012, face: 0.012, letters: ["D", "O", "N", "E"], insertOff: 0.078, fall: 0.075 },
  ramp: {
    width: 0.078, wallH: 0.03, plastic: "#cfe0f0", opacity: 0.34, wireR: 0.0035,
    // centre line (x, v, h): plastic up-ramp, a hairpin at the top, then the wire return dropping into the left inlane
    up: [[-0.10, 0.93, 0.0], [-0.135, 1.10, 0.04], [-0.17, 1.30, 0.10], [-0.175, 1.38, 0.12]],
    turn: { c: [-0.2375, 1.40], r: 0.0625, h: 0.13 },
    down: [[-0.30, 1.38, 0.125], [-0.30, 1.10, 0.095], [-0.30, 0.90, 0.07], [-0.33, 0.83, 0.055], [-0.385, 0.785, 0.04], [-0.40, 0.765, 0.03]],
    wireFrom: 1, // index in `down` where the plastic ends and the wire form starts (the U-turn and first leg are plastic)
  },
  posts: [
    // rubber-ringed posts (field x, v); slings and bank add their own
    [-0.452, 0.70], [0.405, 1.45], [-0.25, 1.75], [0.30, 1.77], [0.40, 0.48], [-0.44, 0.48],
  ],
  rollover: { r: 0.016, dip: 0.004, dur: 0.12 },

  // ---- lamps: every insert under the playfield (field x, v), size in metres, rotation in degrees -------------
  lampGain: 3.6,          // emissive multiplier at level 1 (flashes add on top; bloom threshold 1.0 is crossed by lit inserts)
  lampOff: 0.34,          // unlit insert colour = colour * lampOff (dark translucent plastic)
  lamps: [
    // GOAL — the left rollover lane (one letter per rollover, read top to bottom)
    { id: "G", shape: "circle", color: "#ffcb2e", at: [-0.385, 1.46], size: 0.05, letter: "G", group: "goal" },
    { id: "O1", shape: "circle", color: "#ffcb2e", at: [-0.385, 1.34], size: 0.05, letter: "O", group: "goal" },
    { id: "A", shape: "circle", color: "#ffcb2e", at: [-0.385, 1.22], size: 0.05, letter: "A", group: "goal" },
    { id: "L", shape: "circle", color: "#ffcb2e", at: [-0.385, 1.10], size: 0.05, letter: "L", group: "goal" },
    // DONE — one lettered lamp in front of each drop target (positions computed from bank in pinplan.layout)
    { id: "D", shape: "circle", color: "#ff5a3c", bankIndex: 0, size: 0.052, letter: "D", group: "done" },
    { id: "O2", shape: "circle", color: "#ff5a3c", bankIndex: 1, size: 0.052, letter: "O", group: "done" },
    { id: "N", shape: "circle", color: "#ff5a3c", bankIndex: 2, size: 0.052, letter: "N", group: "done" },
    { id: "E", shape: "circle", color: "#ff5a3c", bankIndex: 3, size: 0.052, letter: "E", group: "done" },
    // the progress ladder in the middle of the field: one word per concept, lit as each is completed (bottom up)
    { id: "pGOAL", shape: "roundRect", color: "#ffcb2e", at: [0, 0.585], size: [0.17, 0.064], word: "GOAL", group: "ladder" },
    { id: "pTASKS", shape: "roundRect", color: "#4fd1c5", at: [0, 0.675], size: [0.17, 0.064], word: "TASKS", group: "ladder" },
    { id: "pDONE", shape: "roundRect", color: "#ff5a3c", at: [0, 0.765], size: [0.17, 0.064], word: "DONE", group: "ladder" },
    { id: "pSHIP", shape: "roundRect", color: "#7fb2ff", at: [0, 0.855], size: [0.17, 0.064], word: "SHIP", group: "ladder" },
    // ramp chevrons (chase toward the ramp mouth)
    { id: "r1", shape: "chevron", color: "#7fb2ff", at: [-0.165, 0.60], size: 0.064, rot: 12, group: "rampArrows" },
    { id: "r2", shape: "chevron", color: "#7fb2ff", at: [-0.152, 0.685], size: 0.064, rot: 12, group: "rampArrows" },
    { id: "r3", shape: "chevron", color: "#7fb2ff", at: [-0.139, 0.77], size: 0.064, rot: 12, group: "rampArrows" },
    // bank arrows (point at the drop targets)
    { id: "b1", shape: "arrow", color: "#ff5a3c", at: [0.165, 0.69], size: 0.07, rot: -28, group: "bankArrows" },
    { id: "b2", shape: "arrow", color: "#ff5a3c", at: [0.205, 0.79], size: 0.07, rot: -28, group: "bankArrows" },
    // lane arrow (points up the left lane entrance from below — the "set the goal" shot)
    { id: "la", shape: "arrow", color: "#ffcb2e", at: [-0.395, 0.93], size: 0.062, rot: 0, group: "laneArrows" },
    // multipliers between the slingshots
    { id: "x2", shape: "circle", color: "#ffffff", at: [-0.114, 0.47], size: 0.046, word: "2X", group: "mult" },
    { id: "x3", shape: "circle", color: "#ffffff", at: [-0.038, 0.47], size: 0.046, word: "3X", group: "mult" },
    { id: "x4", shape: "circle", color: "#ffffff", at: [0.038, 0.47], size: 0.046, word: "4X", group: "mult" },
    { id: "x5", shape: "circle", color: "#ffffff", at: [0.114, 0.47], size: 0.046, word: "5X", group: "mult" },
    // attract ring above the bumpers (small round lamps on an arc) — chases at the start and the finale
    { id: "s0", shape: "star", color: "#ff7ab6", ring: 0, size: 0.04, group: "ring" },
    { id: "s1", shape: "star", color: "#ffcb2e", ring: 1, size: 0.04, group: "ring" },
    { id: "s2", shape: "star", color: "#4fd1c5", ring: 2, size: 0.04, group: "ring" },
    { id: "s3", shape: "star", color: "#ff7ab6", ring: 3, size: 0.04, group: "ring" },
    { id: "s4", shape: "star", color: "#ffcb2e", ring: 4, size: 0.04, group: "ring" },
    { id: "s5", shape: "star", color: "#4fd1c5", ring: 5, size: 0.04, group: "ring" },
    { id: "s6", shape: "star", color: "#ff7ab6", ring: 6, size: 0.04, group: "ring" },
    // the shooter-lane triangle (skill shot hint), lit at launch
    { id: "sk", shape: "triangle", color: "#4fd1c5", at: [0.465, 0.55], size: 0.05, rot: 0, group: "shooter" },
  ],
  ring: { c: [0, 1.58], r: 0.33, from: 28, to: 152 }, // attract ring arc (field), lamps evenly spaced from -> to (degrees)
  // bumper caps and slingshot plastics are lamps too (ids "bumpA".."bumpC", "slingL", "slingR"); flash on contact

  // ---- art (printed playfield; all original abstract shapes and words) ------------------------------------------
  art: {
    title: "ALL TARGETS",
    words: { tasks: "TASKS", goal: "GOAL", ship: "SHIP IT" },
    font: '"Futura", "Avenir Next Condensed", "Helvetica Neue", Arial, sans-serif',
    zones: { low: "#1a2766", mid: "#f5ead0", high: "#c8306e", top: "#1a2766" },
    rays: ["#ffcb2e", "#ef7d22"],
    rings: ["#ef7d22", "#f5ead0", "#d9302a", "#f5ead0", "#ffcb2e"],
    stars: "#ffcb2e",
    keyline: "#141016",
    paintAlpha: 0.94, // a hint of wood grain shows through the paint
  },

  // ---- score reels and backglass -------------------------------------------------------------------------------
  score: {
    reels: 6, gap: 0.085, roll: 0.07,   // score motor: one pulse at a time, >= gap apart; each reel step rolls in `roll` s
    awards: { sling: [1, 1], bumper: [2, 1], rollover: [3, 1], target: [3, 1], goal: [3, 5], done: [3, 5], ramp: [4, 1], bonus: [3, 5] },
  },
  backglass: {
    w: 1.3, h: 0.86, d: 0.26, lift: 0.1, back: 0.06,  // head size; lift above the far end of the cabinet; set back from it
    px: 1300,
    reel: { r: 0.085, w: 0.066, gap: 0.008 },
    window: { w: 0.5, h: 0.075, y: 0.17 },            // reel window centre height above the panel bottom
    art: { ground: "#121a4a", rays: ["#c8306e", "#ef7d22", "#ffcb2e", "#159a94"], title: "#ffcb2e", titleEdge: "#c8306e" },
    glow: 0.85, sample: "SAMPLE DATA", reelPhase: 0,
  },

  // ---- the beat caption: an apron instruction card pinned to the screen (overlay = exact colours) ---------------
  caption: { x: 92, y: 70, h: 88, cap: 44, font: '"Futura", "Avenir Next Condensed", "Helvetica Neue", Arial, sans-serif', weight: 700, card: "#f5ead0", ink: "#141016", stripe: "#d9302a", edge: "#1a2766" },

  sound: {
    bed: { gain: 0.5, root: 98, brightness: 700 },
    hum: { gain: 0.035 },
    flip: { gain: 0.55 },
    bumper: { gain: 0.6 },
    sling: { gain: 0.5 },
    target: { gain: 0.55 },
    rollover: { gain: 0.3 },
    launch: { gain: 0.55 },
    pull: { gain: 0.12 },
    ramp: { gain: 0.3 },
    wire: { gain: 0.32 },
    roll: { gain: 0.12 },
    reel: { gain: 0.22 },
    chime: { gain: 0.2, pitch: [1.6, 1.2, 0.9, 0.68, 0.5, 0.4] },  // pitch by reel (10s high ... 100,000s low)
    bell: { gain: 0.32, pitch: 0.36 },
  },
  sfx: { enter: "clack", exit: "thud", move: "whoosh", land: "thud", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "Ball: a planned contact schedule, not physics — piecewise ballistic arcs on the tilted field (constant down-table pull), rolls along the orbit rail and the ramp with a quadratic speed profile, and rides on the flipper face for a few frames before each shot.",
    "Every contact is an event: pop bumpers flash their caps and drop their kick ring, slingshot rubbers bulge, drop targets sink one by one, rollover stars dip, and the lettered insert behind each lights.",
    "Inserts are lamps with states: latched on with a flash, blinking 'next shot' arrows, chasing chevrons and an attract ring, completion blinks when a word is finished.",
    "Score reels step one pulse at a time like an EM score motor (queued, ~11 pulses/s) with a small overshoot per step; each pulse sounds a reel click and a chime pitched by its reel.",
    "Camera: the player's end, one slow move per beat, following the ball's area of play; the final shot pulls back to the whole field with the backglass.",
  ],
};
