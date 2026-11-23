// styles/marionette/spec.js — STYLE_SPEC for "Marionette". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the string plan + score) and the browser.
// Units: metres at toy-theatre scale exaggerated ~4x (the puppet is 2.4 m tall, strings are 3 cm thick) so a string
// still reads at 1080p. World: puppet stands at the origin facing +Z, stage floor = y 0, the control bar hangs above.
//
// The look: a lacquered, brightly painted wooden string puppet on a small toy-theatre stage (pale painted sky backdrop,
// red curtains, plank floor), worked from above by a wooden control bar. strings.js is the whole mechanism: the bar's
// pose and the pull on each string are the ONLY inputs; every joint is solved in closed form from fixed string lengths.

export const STYLE_SPEC = {
  id: "marionette",
  name: "Marionette",
  description:
    "A lacquered, brightly painted wooden string puppet on a small toy-theatre stage (pale painted-sky backdrop, red pleated curtains, plank floor), worked from above by a wooden control bar with a rocking leg bar and a rail of painted name tags. A closed-form string rig is the whole mechanism: the bar's pose (lift, pitch, roll, yaw, leg-bar rock) and the pull on each tagged string are the only animated inputs; every string has a fixed length, so each limb end hangs from its eyelet and the joints are solved analytically (torso = pendulum under the head string with the hips held by the back string, arms = two-bone IK under their eyelets, knees = sphere-sphere intersection, shins hang, feet stop on the floor) with a planned damped sway. Taut strings are straight, slack ones sag. Wood clacks, string creaks and plucks come from the same control plan.",
  palette: {
    bg: "#cfe8f3",
    sky: "#bfe2f2",
    skyLow: "#fdf1cf",
    hill: "#9ccf8f",
    hillFar: "#bfe0a8",
    cloud: "#ffffff",
    curtain: "#c7283a",
    floor: "#e2b877",
    wood: "#c9914f",
    woodDark: "#8a5a2b",
    bead: "#e8bf7c",
    head: "#ffc531",
    torso: "#16a3a0",
    pelvis: "#e5473c",
    upperArm: "#f47b20",
    foreArm: "#ffd24a",
    hand: "#e5473c",
    thigh: "#2f5fc4",
    shin: "#f47b20",
    foot: "#d6332e",
    ink: "#1f2a52",
    cream: "#fff4d8",
    cheek: "#ff8f8f",
    metal: "#b9bec6",
  },
  world: {
    background: "#cfe8f3",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.45,
    toneMapping: "neutral",   // painted toy colours must stay as painted (ACES greys the yellows and creams)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    floor: { type: "standard", baseColor: "#ffffff", roughness: 0.7, metalness: 0 },            // map: kit woodTexture (style.js)
    backdrop: { type: "standard", baseColor: "#ffffff", roughness: 0.95, metalness: 0 },         // map: painted sky (style.js)
    curtain: { type: "standard", baseColor: "#c7283a", roughness: 0.82, metalness: 0, side: "double" },
    barWood: { type: "standard", baseColor: "#ffffff", roughness: 0.55, metalness: 0 },          // map: kit woodTexture (style.js)
    barDark: { type: "standard", baseColor: "#8a5a2b", roughness: 0.5, metalness: 0 },
    bead: { type: "physical", baseColor: "#e8bf7c", roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3 },
    head: { type: "physical", baseColor: "#ffc531", roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 },
    torso: { type: "physical", baseColor: "#16a3a0", roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 },
    pelvis: { type: "physical", baseColor: "#e5473c", roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 },
    upperArm: { type: "physical", baseColor: "#f47b20", roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 },
    foreArm: { type: "physical", baseColor: "#ffd24a", roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 },
    hand: { type: "physical", baseColor: "#e5473c", roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 },
    thigh: { type: "physical", baseColor: "#2f5fc4", roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 },
    shin: { type: "physical", baseColor: "#f47b20", roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 },
    foot: { type: "physical", baseColor: "#d6332e", roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 },
    ink: { type: "standard", baseColor: "#1f2a52", roughness: 0.5, metalness: 0 },
    cream: { type: "standard", baseColor: "#fff4d8", roughness: 0.5, metalness: 0 },
    cheek: { type: "standard", baseColor: "#ff8f8f", roughness: 0.6, metalness: 0 },
    eyeWhite: { type: "physical", baseColor: "#ffffff", roughness: 0.25, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.15 },
    metal: { type: "standard", baseColor: "#b9bec6", roughness: 0.35, metalness: 1 },
    string: { type: "standard", baseColor: "#ffffff", roughness: 0.8, metalness: 0 },             // cloned per string (colour)
    tag: { type: "standard", baseColor: "#ffffff", roughness: 0.55, metalness: 0 },               // cloned per tag (map)
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#e9c79a", intensity: 1.15 },
    {
      // warm high key from front-left: the puppet's shadow falls back-right on the floor and softly on the backdrop
      id: "key", type: "directional", color: "#fff1dc", intensity: 2.3, position: [-4.2, 8.5, 7.5], target: [0, 1.8, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 5.2, near: 0.5, far: 30, bias: -0.0005, normalBias: 0.02 },
    },
    { id: "side", type: "directional", color: "#dcecff", intensity: 0.55, position: [5, 4, 5], target: [0, 1.6, 0] },
  ],
  post: {
    vignette: { darkness: 0.22, offset: 1.2 },
  },
  camera: { fov: 30, near: 0.3, far: 80, drift: { amp: 0, speed: 0.2 } },   // locked during holds (file size, readable tags)
  text: { font: "rounded", weight: 800, color: "#1f2a52", height: 0.3 },

  // ---- the puppet (every number strings.js and style.js need) ---------------------------------------------------
  puppet: {
    thigh: 0.46, shin: 0.5,                 // hip joint -> knee -> sole
    hipHalf: 0.2, hipDrop: 0.06,            // hip joints: +-x from the pelvis centre, below it
    waist: 0.11,                            // pelvis centre -> waist joint (the torso pitches here)
    torsoLen: 1.3,                          // waist -> top of head (the rod the head string holds up)
    shoulder: [0.5, 0.6],                   // shoulder joint: x, height above the waist
    upperArm: 0.45, foreArm: 0.5,           // shoulder -> elbow -> wrist
    backHook: [0.05, -0.2],                 // back-string hook on the pelvis: height above its centre, z (behind)
    kneeHook: 0.09,                         // knee-string hook: in front of the knee centre
    headNod: 0.4,                           // extra head pitch per radian of torso pitch
    limbR: { upperArm: 0.085, foreArm: 0.075, thigh: 0.1, shin: 0.085, hand: 0.13, joint: 0.095 },
    head: { w: 0.62, h: 0.52, d: 0.5, r: 0.14 },
    torso: { w: 0.78, h: 0.7, d: 0.42, r: 0.1, y: 0.4 },
    pelvis: { w: 0.62, h: 0.26, d: 0.38, r: 0.08 },
    foot: { w: 0.24, h: 0.13, d: 0.42, z: 0.09 },
  },
  // ---- the control (bar-local coordinates: origin = the grip at the back eyelet, +Z toward the audience) -----------
  rig: {
    barY: 3.5,                              // rest height of the bar's underside eyelets
    headZ: 0.8,                             // head eyelet sits this far in front of the back eyelet (the puppet stands under it)
    handBar: { z: 1.15, half: 1.4, eyelet: 1.05 },
    legBar: { z: 1.5, y: 0.1, half: 0.62, eyelet: 0.5 },
    tagRail: { z: 1.74, half: 2.3 },
    spine: { z0: -0.22, z1: 1.8 },
    wristRest: 1.35,                        // rest height of the wrists (they hang under the hand eyelets, strings taut)
    kneeSlack: 0.04,                        // spare length on the knee strings at rest (they sag a little)
    lag: 0.1,                               // s the body trails the bar
    sway: { tau: 0.5, cap: 0.26, hz: { body: 1.15, arm: 1.7, leg: 1.9, tag: 1.3 } },
    swayGain: { x: [0.32, 0], z: [0, 0.32], y: [0.05, 0.16], pitch: [0, 0.3], roll: [0.26, 0], yaw: [0.12, 0.16], rock: [0, 0], pull: [0.1, 0.05] },
    blend: 0.06,                            // m of tautness over which a limb moves from "hanging" to "held by its string"
    footEps: 0.012,
  },
  strings: {
    radius: 0.017, radial: 6, points: 14, sagMax: 0.42,
    list: [
      { id: "head", tag: "training", color: "#2443a6" },
      { id: "back", tag: "data", color: "#7b3fb5" },
      { id: "handL", tag: "rules", color: "#12865a" },
      { id: "handR", tag: "prompt", color: "#d92d2d" },
      { id: "kneeL", tag: "feedback", color: "#d97706" },
      { id: "kneeR", tag: "feedback", color: "#d97706" },
    ],
  },
  tags: {
    w: 1.4, h: 0.38, t: 0.045, rows: [0.26, 0.68],              // strand length for row 0 / row 1
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 800, ink: "#fff6dc",
    list: [
      { id: "rules", text: "RULES", x: -1.5, row: 0, color: "#12865a" },
      { id: "feedback", text: "FEEDBACK", x: -0.76, row: 1, color: "#d97706" },
      { id: "training", text: "TRAINING", x: 0, row: 0, color: "#2443a6" },
      { id: "data", text: "DATA", x: 0.76, row: 1, color: "#7b3fb5" },
      { id: "prompt", text: "PROMPT", x: 1.5, row: 0, color: "#d92d2d" },
    ],
    drop: { dur: 0.5, swing: 0.3, swingHz: 1.7, swingTau: 0.45 },
  },
  stage: {
    floor: { x: 18, z0: -2.4, z1: 10, tile: 3.2, boards: 6, seed: 90, dark: "#c99a5b", mid: "#e2b877", light: "#f1d39c", seam: "#a87a43", contrast: 0.42, grainFreq: 16 },
    backdrop: { w: 18, h: 9.5, z: -1.7, px: [2048, 1088] },
    curtain: { x0: 2.95, w: 5, h: 9.5, z: -0.5, pleat: 0.13, pleats: 9 },
    barWood: { boards: 3, seed: 41, dark: "#a06c34", mid: "#c9914f", light: "#e2b274", seam: "#8a5a2b", contrast: 0.5, grainFreq: 26 },
  },
  // ---- overlay caption (bottom centre, over the stage floor) -----------------------------------------------------
  caption: {
    x: 960, y: 918, h: 104, cap: 58, maxW: 1240,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#fff6dc", edge: "#c7283a", ink: "#1f2a52", dot: "#c7283a",
  },
  sound: {
    step: { gain: 0.5, hz: 196, wood: 0.34 },        // foot on the stage: clack + low wooden bar
    knock: { gain: 0.3, hz: 330 },                    // limbs knocking as a string takes the weight
    creak: { gain: 0.11, hz: 520 },                   // string / eyelet creak when the bar starts to move
    pluck: { gain: 0.3, hz: 392 },                    // a string going taut
    tag: { gain: 0.34, hz: 523.25 },                  // a name tag dropping to the end of its strand
    pull: { gain: 0.42, hz: 659.25 },
    pad: { gain: 0.13, root: 196, chord: [0, 4, 7, 14], brightness: 950 },
  },
  sfx: { enter: "clack", exit: "whooshOut", move: "servo", land: "clack", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Only the control moves: bar lift/pitch/roll/yaw, leg-bar rock and the pull on a tagged string (keys + sine windows).",
    "Every string has a fixed length: a limb end hangs straight under its eyelet when the arm can reach, else on the lowest point of the string sphere / reach sphere intersection.",
    "The torso is a rod hung from the head string with the hips held by the back string: pitch the bar forward and the puppet bows.",
    "Rock the leg bar and the knees lift in turn; the shins hang and the feet stop on the floor (step clacks are found by scanning the plan).",
    "Each control move leaves a damped sway (effective gravity tilt), closed form; slack strings sag by the length they have spare.",
    "Camera: one move per beat, locked in holds; the reveal is a crane up the strings to the bar.",
  ],
};
