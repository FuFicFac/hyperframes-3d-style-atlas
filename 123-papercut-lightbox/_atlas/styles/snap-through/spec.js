// styles/snap-through/spec.js — STYLE_SPEC for "Snap-Through". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the plan + score) and the browser.
// Units: metres at toy scale (the strip spans 2.6 m, about 6x a real bench demo) so the strip, clamps and dial read at 1080p.
//
// The look: a bright workbench test rig. A thin tempered-blue spring-steel strip is clamped flat at both ends between
// machined steel jaws on two aluminium pedestals and bowed upward into a shallow arch. A small aluminium tray with a
// post sits on its crown; slotted brass weights stack on the post. A dial gauge under the crown reads the deflection
// through a chrome plunger; a red mark on the dial sits at the limit point. snap.js plans every pose and sound.

export const STYLE_SPEC = {
  id: "snap-through",
  name: "Snap-Through",
  description:
    "A bright workbench test rig for a bistable arch: a thin tempered-blue spring-steel strip clamped flat between machined steel jaws on two aluminium pedestals, bowed upward into a shallow arch, with a small aluminium tray and post on its crown and a dial gauge under it reading the deflection through a chrome plunger (red mark = the limit point). Slotted brass weights fly from a ready stack and drop down the post one at a time; each barely moves the arch, until one more passes the limit load and the strip snaps through to the other side with a short damped ring, the weights hopping ballistically on the tray. Taking every weight off leaves it flipped. The motion is the shallow two-bar (von Mises) arch: load = v^3 - v, closed form (snap.js).",
  palette: {
    bg: "#eef0f1",
    wall: "#e9ebec",
    bench: "#d9b98c",
    steelBlue: "#2f63c9",
    steel: "#a9b0b8",
    alu: "#cfd5db",
    brass: "#d9aa4a",
    ink: "#1d2430",
    red: "#cc1d24",
    face: "#fbfaf6",
    plate: "#ffffff",
  },
  world: {
    background: "#eef0f1",
    fog: { color: "#eef0f1", near: 16, far: 40 },
    environment: "room",
    environmentIntensity: 0.75,
    toneMapping: "neutral",     // keeps the blue steel and the brass saturated, the bench warm
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0 },               // map: kit woodTexture (style.js)
    wall: { type: "standard", baseColor: "#e9ebec", roughness: 0.95, metalness: 0 },
    basePlate: { type: "physical", baseColor: "#5b636d", roughness: 0.42, metalness: 0.75, clearcoat: 0.2, clearcoatRoughness: 0.4 },
    pedestal: { type: "physical", baseColor: "#cfd5db", roughness: 0.32, metalness: 0.85 },
    jaw: { type: "physical", baseColor: "#9aa2ab", roughness: 0.26, metalness: 0.95 },
    bolt: { type: "physical", baseColor: "#3d434b", roughness: 0.35, metalness: 0.9 },
    strip: { type: "physical", baseColor: "#3d78e6", roughness: 0.3, metalness: 0.6, clearcoat: 0.6, clearcoatRoughness: 0.12, iridescence: 0.35, side: "double" },
    stripGhost: { type: "basic", baseColor: "#8fb2f2", opacity: 0.4 },
    tray: { type: "physical", baseColor: "#d6dbe0", roughness: 0.3, metalness: 0.9 },
    brass: { type: "physical", baseColor: "#d9aa4a", roughness: 0.26, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.2 },
    chrome: { type: "physical", baseColor: "#e9edf1", roughness: 0.12, metalness: 1 },
    gaugeBody: { type: "physical", baseColor: "#1f2630", roughness: 0.4, metalness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2 },
    needle: { type: "basic", baseColor: "#141a22" },
    redMark: { type: "basic", baseColor: "#e0262b" },
    glass: { type: "physical", baseColor: "#ffffff", roughness: 0.05, metalness: 0, transmission: 0, opacity: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#d8c7ae", intensity: 0.75 },
    {
      id: "key", type: "directional", color: "#fff4e6", intensity: 3.3, position: [-5.5, 6.5, 3.6], target: [0, 0.9, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 3.9, near: 0.5, far: 24, bias: -0.0004, normalBias: 0.02 },
    },
    { id: "rim", type: "directional", color: "#dfe9ff", intensity: 0.9, position: [3.5, 4.5, -5], target: [0, 1, 0] },
  ],
  post: {
    vignette: { darkness: 0.18, offset: 1.2 },
  },
  camera: { fov: 30, near: 0.2, far: 60, drift: { amp: 0, speed: 0.2 } },   // locked during holds (bitrate, and the dial must read)
  text: { font: "sans", weight: 700, color: "#1d2430", height: 0.3 },

  // ---- the rig (every number snap.js and style.js need) -----------------------------------------------------------
  rig: {
    span: 2.6,             // clamp face to clamp face (x = -1.3 .. 1.3)
    rise: 0.24,            // crown height of the unloaded arch above the clamp line
    clampY: 1.3,           // the clamp line (strip mid-plane at the jaws)
    weightsToLimit: 5.05,  // Qmax / load per weight: five hold (99 % of the limit), the sixth snaps it
    g: 36,                 // m/s^2 at toy scale (about 3.7 g): hops and drops read at 30 fps without looking floaty
    strip: { width: 0.3, thick: 0.018, segs: 160, inClamp: 0.36 },   // ends poke 2 cm out of the jaws
    clamp: { len: 0.34, w: 0.46, jawH: 0.09, bolts: 2, boltR: 0.045 },
    pedestal: { w: 0.42, d: 0.42, chamfer: 0.02 },
    basePlate: { w: 3.4, d: 1.1, h: 0.06, x: 0 },
    tray: { r: 0.21, thick: 0.03, saddle: 0.05, saddleR: 0.07 },
    post: { r: 0.022, height: 0.66 },
    weight: { count: 7, r: 0.16, thick: 0.062, hole: 0.03, slot: 0.05 },
    ready: { x: -2.0, z: 0.68, baseY: 0.04, plateR: 0.22, plateH: 0.03, postH: 0.5 },
    flight: { place: 0.62, remove: 0.62, hover: 0.05, arc: 0.36, liftShare: 0.32 },
    settle: { stiffness: 420, damping: 22 },                    // small damped settle after each load step
    snap: { creep: 0.1, spring: { stiffness: 400, damping: 12 } },   // under-damped ring at the snap (zeta 0.3, 3.1 Hz)
    hop: { restitution: 0.55, stickSpeed: 0.35, maxContacts: 8, spread: 0.06, tilt: 0.6, spin: 0.5 },
    dial: { rev: 3, r: 0.3, depth: 0.1, y: 0.47, z: 0.06, stemR: 0.025, plungerR: 0.011, columnR: 0.045 },
    ghosts: { count: 3, step: 0.022, window: 0.5 },             // translucent strip ghosts during the snap (motion read)
  },
  wood: { seed: 106, boards: 5, dark: "#cfa874", mid: "#e2c497", light: "#f0dbb8", seam: "#b98f5e", contrast: 0.16, grainFreq: 46, grainWarp: 0.35, tileLen: 3, boardW: 0.3 },

  // ---- overlay caption (top centre) ---------------------------------------------------------------------------
  caption: {
    x: 960, y: 50, h: 112, cap: 62, maxW: 1240,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#ffffff", edge: "#1d2430", ink: "#1d2430", chip: "#2f63c9", chip2: "#d9aa4a",
  },

  sound: {
    tone: { root: 110, chord: [0, 7, 12], stepSemis: 1, gain: 0.2, swell: 0.08, brightness: 650, brighten: 110 },
    after: { root: 73.4, chord: [0, 3, 7, 12], gain: 0.28, brightness: 520 },
    clink: { hz: 1568, decay: 0.07, gain: 0.32 },
    pick: { gain: 0.12 },
    snap: { gain: 1.0, ring: 392, ringGain: 0.9 },
    hop: { gain: 0.3, ref: 2.5 },
  },
  sfx: { enter: "marimba", exit: "tick", move: "whoosh", land: "marimba", emphasis: "clack", ui: "tick", bed: "pad" },
  motion: [
    "Crown state v: load = v^3 - v (shallow two-bar arch). Near branch v in [-1, -1/sqrt 3]; the limit load is 2/(3 sqrt 3).",
    "Each weight adds Qmax / 5.05: five weights hold at 99 % of the limit, the sixth passes it and the arch snaps to the far branch.",
    "Strip shape = crown x (1 + cos(2 pi s / span)) / 2: zero slope at both clamps.",
    "Settles are damped springs (closed form); the snap is a 0.1 s creep to the limit point then an under-damped ring to the far state.",
    "The weights on the tray fly ballistically when the tray drops away; contacts with the ringing tray are precomputed with restitution.",
    "Removing weights walks back along the far branch only: v stays above +1. The dial reads the same v.",
  ],
};
