// styles/guilloche/spec.js — STYLE_SPEC for "Guilloche" (a rose engine engraving a silver dial). Plain data only:
// JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs, scene.config.js for the plan + score)
// and the browser. Units: metres (toy scale: the dial is 2 m across so the camera can work at 1.5–5 m).
//
// The look: a silver disc lying face-up on a brass chuck on a dark-teal bench, seen close. A steel graver on a brass
// slide arm touches the turning disc and leaves bright wavy grooves; ring after ring, each phase-shifted, they weave a
// rosette. The grooves are NOT geometry: one shader on the disc finds, per pixel, the nearby cut rings from the closed
// form in guilloche.js and tilts the normal with a V-groove cross-section, so the walls glint under a code-generated
// studio environment as the disc turns. Two brass dials (lobes, phase step) sit at the front right; turning them
// re-forms every ring at once. Finally translucent deep-blue enamel floods across and a light sweeps over it.

export const STYLE_SPEC = {
  id: "guilloche",
  name: "Guilloche",
  description:
    "Two dials, endless lace: a silver dial on a small brass rose engine on a dark-teal bench, seen close. A fixed steel graver on a brass slide touches the turning disc and cuts one wavy ring per turn, r(θ) = R_k + a·sin(n·θ + k·s); ring after ring, each shifted a little, the waves weave a rosette. The grooves are not geometry: one shader on the disc evaluates the nearby rings in closed form for every pixel, gives each a V cross-section and tilts the normal, so the cut walls glint under a procedural studio environment as the disc turns. Two brass dials set the lobe count n and the phase step s; turning one re-forms every ring at once. Finally translucent deep-blue enamel floods across and a light sweeps over the finished dial. Lathe hum, a rising cutting hiss per ring, ratchet clicks per dial step, a soft pour and a bell.",
  palette: {
    bg: "#2c5f62",
    bench: "#2f6467",       // dark teal bench (kept mid-dark: the silver disc is the bright subject)
    benchEdge: "#24504f",
    silver: "#e9ecef",      // disc metal (specular colour)
    brass: "#d0a85c",
    brassDark: "#a37a35",
    steel: "#b9c2ca",
    enamel: "#1d4fc4",      // what light through the enamel looks like over bright silver
    enamelDeep: "#0b2470",  // in the deepest grooves
    dialFace: "#f2ead8",
    dialInk: "#1d2a2e",
    pointer: "#b8322a",
    caption: "#10302f",
    captionInk: "#f7f0e0",
    accent: "#d0a85c",
  },
  world: {
    background: "#2c5f62",
    sky: null,
    fog: null,
    environment: null,       // the studio env (studio below) is built by style.js
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    bench: { type: "standard", baseColor: "#2f6467", roughness: 0.82, metalness: 0, bump: { source: "bumpNoise", scale: 30, octaves: 3, seed: 116, strength: 0.06, description: "fine fbm noise: painted / linoleum bench top" } },
    brass: { type: "standard", baseColor: "#d0a85c", roughness: 0.3, metalness: 1 },
    brassSatin: { type: "standard", baseColor: "#c39a4e", roughness: 0.45, metalness: 1 },
    steel: { type: "standard", baseColor: "#c4ccd3", roughness: 0.22, metalness: 1 },
    darkSteel: { type: "standard", baseColor: "#4a5258", roughness: 0.4, metalness: 0.8 },
    silverRim: { type: "standard", baseColor: "#dfe3e7", roughness: 0.25, metalness: 1 },
    pointer: { type: "standard", baseColor: "#b8322a", roughness: 0.4, metalness: 0.2 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#f3f6f8", groundColor: "#4a6b6b", intensity: 0.9 },
    {
      // key from back-left, fairly high: rakes the grooves so one wall of each catches it; shadows on the bench
      id: "key", type: "directional", color: "#fff4e4", intensity: 2.2, position: [-2.6, 4.2, -2.2], target: [0, 0, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 2.6, near: 0.5, far: 14, bias: -0.0004, normalBias: 0.01 },
    },
    { id: "rim", type: "directional", color: "#dfe9ff", intensity: 0.8, position: [3.0, 2.2, 2.4], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.18, radius: 0.35, threshold: 2.4 },
    vignette: { darkness: 0.22, offset: 1.2 },
  },
  camera: { fov: 32, near: 0.05, far: 40, drift: { amp: 0, speed: 0.2 } }, // no drift: holds stay still (bitrate)
  text: { font: "sans", weight: 700, color: "#10302f", height: 0.3 },

  // ---- procedural studio environment (kit studio.studioEnvironment): what the metal and its grooves reflect ----
  studio: {
    size: 256,
    sigma: 0.004,
    room: { w: 24, h: 18, d: 24, color: "#3b4448" },  // tall enough that the top softbox and the sweep arc (radius 7) are inside it
    panels: [
      // big overhead softbox (slightly behind): flat silver and one wall of every groove read bright
      { id: "top", kind: "softbox", size: [5.5, 4.2], pos: [0, 6.0, -1.8], intensity: 1.35, color: "#fffaf2", soft: 0.3 },
      // strips around the set: the other groove walls pick these up as the disc turns (moving glints)
      { id: "stripL", kind: "strip", size: [0.7, 6], pos: [-6.2, 3.0, -1.0], intensity: 4.0, color: "#fff1e0", soft: 0.3 },
      { id: "stripR", kind: "strip", size: [0.7, 6], pos: [6.2, 3.0, 0.8], intensity: 3.2, color: "#e6efff", soft: 0.3 },
      { id: "stripB", kind: "strip", size: [9, 0.6], pos: [0, 2.6, -7.5], intensity: 3.0, color: "#ffffff", soft: 0.35 },
      // low, wide back panels: grazing views (beat 3) reflect these, so the lands stay bright silver, not black
      { id: "backL", kind: "softbox", size: [7, 3.2], pos: [-4.6, 3.6, -7.2], intensity: 1.1, color: "#fff6ea", soft: 0.35 },
      { id: "backR", kind: "softbox", size: [7, 3.2], pos: [5.2, 3.4, -6.0], intensity: 1.0, color: "#eef4ff", soft: 0.35 },
      { id: "sideL", kind: "softbox", size: [3.2, 2.6], pos: [-7.5, 3.0, 2.5], intensity: 0.7, color: "#fff3e4", soft: 0.35 },
      { id: "front", kind: "card", size: [10, 4], pos: [0, 3.2, 7.2], intensity: 0.55, gradient: [[0, "#2a3236"], [0.6, "#8a9298"], [1, "#e8ecef"]] },
      { id: "floorBounce", kind: "card", size: [14, 14], pos: [0, -5.5, 0], intensity: 0.18, gradient: [[0, "#3f7f80"], [1, "#0f2224"]], radial: true },
    ],
    // the travelling light for beat 5: a long bar on an arc around the X axis. from/to cover only the elevations the
    // disc mirrors toward a ~70° camera, so the reflected band glides over the dial from the far edge to the near edge
    sweep: { size: [24, 1.9], radius: 7, from: 0.9, to: 1.68, intensity: 9, color: "#ffffff", soft: 0.1 },  // soft is a fraction of BOTH sides: keep it small or the bar shrinks to a blob
    sweepLight: { intensity: 0, color: "#ffffff" },  // off: a directional light on the glossy clear coat blooms into a hot spot
    quantum: 0.002,
  },

  // ---- the machine -----------------------------------------------------------------------------------------
  disc: {
    radius: 1.0,          // silver disc (m)
    thickness: 0.03,
    top: 0.115,           // disc top above the bench (chuck height + thickness)
    hub: 0.12,            // polished arbor nut radius at the centre
    chuck: { radius: 1.08, height: 0.085, screws: 8 },  // brass chuck under the disc; 8 clamp screws (8-fold: see planner)
    segments: 256,
  },
  rings: { count: 36, r0: 0.2, r1: 0.95, amp: 0.04, ampPow: 0, ampRef: 0.95 },
  groove: {
    width: 0.6,           // groove half-width as a fraction of the ring spacing (> .5: neighbours overlap into sharp ridges)
    slope: 0.42,          // wall slope (depth / half-width): ~23° walls
    tip: 0.05,            // rounding of the V bottom (fraction of the half-width)
    occlusion: 0.4,       // the deepest part of a groove reflects this much less (reads as a cut, not a raised wire)
    roughCut: 0.11,       // bright-cut walls
    roughFlat: 0.3,       // uncut, lapped silver
    detail: [0.8, 2.0],   // groove half-width in pixels: below .8 px the relief fades to a rough satin (anti-alias)
  },
  enamel: {
    // Beer–Lambert-ish tint of the silver under the enamel: exp(-sigma * (base + groove depth term))
    sigma: [3.0, 1.7, 0.36],
    base: 0.68,
    grooveDepth: 0.9,
    edge: 0.05,            // width of the flowing front (m)
    bead: 1.1,             // clear-coat bulge at the front
    dir: [0.94, -0.34],    // flood direction in disc coords (x right, y = -z)
    wobble: 0.085,
    clearcoatRoughness: 0.06,
  },
  cutter: {
    phi: 0.72,            // world angle of the cutter (rad, CCW seen from above, 0 = +X): back right
    postR: 1.48,          // post distance from the disc centre
    armY: 0.33,           // arm height above the disc top
    toolLen: 0.3,
    lift: 0.12,           // how far the graver rises when lifted
    swing: -1.75,         // arm swing (rad) about the post when the work is done
  },
  swarf: { turns: 6, radius: 0.034, wire: 0.0062, length: 0.2 },
  dials: {
    radius: 0.155,
    pedestal: { r: 0.19, h: 0.08 },
    pos: [[1.52, 0.16], [1.31, 0.66]],  // dial "n" then dial "s" (x, z) on the bench: right of the chuck

    sweep: [-2.3, 2.3],   // pointer travel (rad) over each dial's range
    nRange: [4, 16],
    sRange: [0, 3.0],
  },

  // ---- overlay caption (bottom-left chip; the top-left 140 x 110 px corner stays clear for the reel badge) -----
  caption: {
    x: 92, y: 922, h: 92, cap: 34, font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 700,
    plate: "#10302f", edge: "#d0a85c", ink: "#f7f0e0", icon: "#d0a85c", maxW: 820,
  },

  sound: {
    bed: { gain: 0.36, root: 98, chord: [0, 7, 12, 19], brightness: 650, attack: 1.2, release: 2.2 },
    hum: { gain: 0.16, hz: 50 },
    cut: { gain: [0.16, 0.24], pitch: [0.5, 1.15] },
    touch: { gain: 0.35 },
    ratchet: { gain: 0.42 },
    pour: { gain: 0.55 },
    bell: { gain: 0.55, pitch: 1.0 },
  },
  sfx: { enter: "click", exit: "whooshOut", move: "whoosh", land: "click", emphasis: "chime", ui: "clack", bed: "pad" },
  motion: [
    "The disc turns (apparent speed eases from fast to still); the graver rides the current ring's wave, r = R_k + a·sin(n·θ + k·s).",
    "Rings are cut inside-out, one turn each, faster and faster: a strobed time-lapse — whole 1/n turns per frame are invisible because the cut pattern is n-fold symmetric.",
    "Dial clicks re-form every ring at once: n steps one lobe per click (blending n and n+1), s eases per click.",
    "Enamel floods across as a wavy front with a clear-coat bead; a studio light bar sweeps over at the end.",
  ],
};
