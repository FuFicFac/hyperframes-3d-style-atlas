// styles/risograph/spec.js — STYLE_SPEC for "Risograph": a sheet of rough off-white paper on a print tray, printed in
// three flat inks (fluorescent pink, medium blue, warm yellow) by a drum that rolls across it. Coarse halftone dots,
// uneven ink, paper tooth; overlaps multiply into purple, green, orange and a near-black.
// Plain data only: JSON-serializable, no THREE, no window. Units: metres, Y-up, colours sRGB hex, angles radians.
// The poster artwork (shapes and per-ink tones) lives in riso.js (POSTER), the pass / registration plan too.

export const STYLE_SPEC = {
  id: "risograph",
  name: "Risograph",
  description:
    "Three flat inks printed one pass at a time by a rolling drum onto rough off-white paper: coarse halftone dots at three screen angles, uneven ink, paper tooth, multiply overprint into purple, green, orange and near-black; layers that land off-register and snap into line.",
  palette: {
    bg: "#c9c3b6",
    paper: "#f4efe3",
    ink: "#211c2a",
    pink: "#ff4aa6",
    blue: "#2f6ab8",
    yellow: "#ffe11a",
    tray: "#3d5560",
    trayRim: "#2f444e",
    steel: "#b9bec4",
    table: "#9a9184",
  },
  world: {
    background: "#c9c3b6",
    environment: "room",
    environmentIntensity: 0.18,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    table: { type: "standard", baseColor: "#9a9184", roughness: 0.92, metalness: 0 },
    tray: { type: "standard", baseColor: "#3d5560", roughness: 0.55, metalness: 0.15 },
    trayRim: { type: "standard", baseColor: "#2f444e", roughness: 0.5, metalness: 0.2 },
    steel: { type: "standard", baseColor: "#b9bec4", roughness: 0.32, metalness: 0.85 },
    darkSteel: { type: "standard", baseColor: "#4a4f57", roughness: 0.4, metalness: 0.7 },
    paperEdge: { type: "standard", baseColor: "#efe9dc", roughness: 0.9, metalness: 0 },
  },
  lights: [
    { id: "hemi", type: "hemisphere", color: "#ffffff", groundColor: "#b9b1a2", intensity: 1.35 },
    {
      id: "key", type: "directional", color: "#fff6ea", intensity: 1.55, position: [-2.6, 6.5, 3.2], target: [0, 0, 0],
      shadow: { softness: 5, mapSize: 2048, extent: 3.2, bias: -0.0004, normalBias: 0.02 },
    },
  ],
  post: { vignette: { darkness: 0.28, offset: 1.15 } },
  camera: { fov: 30, near: 0.04, far: 60, drift: { amp: 0, speed: 0.3 } },
  text: { font: "sans", weight: 800, color: "#211c2a", height: 0.3 },

  // ---------------------------------------------------------------- the print (sheet-local metres, y = picture up)
  sheet: { width: 3.2, height: 2.1, thick: 0.004, tilt: 0.05, y: 0.0 },
  tray: { marginX: 0.62, marginY: 0.42, thick: 0.06, rim: 0.05, rimH: 0.035 },
  inks: [
    { id: "pink", color: "#ff4aa6", density: 0.95, angle: 0.2618, pitch: 220.0 }, // 15 deg screen, A3
    { id: "blue", color: "#2f6ab8", density: 0.93, angle: 1.309, pitch: 277.18 }, // 75 deg screen, C#4
    { id: "yellow", color: "#ffe11a", density: 0.97, angle: 0.7854, pitch: 329.63 }, // 45 deg screen, E4
  ],
  halftone: {
    cell: 0.03,        // screen pitch on the sheet (m): ~17 px in the wide shot, ~100 px in the macro
    gain: 0.05,        // dot gain: tone 1 prints solid, tone 0 prints nothing
    rough: 0.07,       // dot-edge raggedness (fraction of the threshold range)
    roughScale: 220,   // cycles per metre of the dot-edge noise
    toothScale: 150,   // cycles per metre of the paper tooth (ink skips on the peaks)
    toothSkip: 0.45,   // how much ink the tooth peaks drop
    mottle: 0.12,      // large-scale uneven ink (fraction of density)
    mottleScale: 1.6,  // cycles per metre
    paperTone: 0.035,  // paper brightness variation
  },
  drum: { radius: 0.17, flange: 0.195, overhang: 0.2, park: 0.12, railY: 0.0, clampW: 0.05 },
  caption: {
    x: 960, y: 1010, w: 1160, h: 92, cap: 40, font: "\"Helvetica Neue\", Helvetica, Arial, sans-serif", weight: 800,
    plate: "#f7f2e7", ink: "#211c2a", edge: "#211c2a", roll: 0.5,
  },
  sound: {
    bed: { root: 110, chord: [0, 4, 7, 11, 14], brightness: 900, gain: 0.5 },
    roll: 0.34, land: 0.42, slide: 0.16, pluck: 0.32, nudge: 0.34, snap: 0.75, chord: 0.36, lift: 0.18,
  },

  sfx: { enter: "thud", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "marimba", ui: "click", bed: "pad" },
  motion: [
    "The drum rolls across the sheet on two rails; each ink appears exactly behind its contact line (pass direction alternates).",
    "Between passes the parked drum spins in place while its sleeve changes ink colour.",
    "Registration: each ink layer carries an offset (dx, dy, rotation) as a function of t; two eased nudges, then a sprung snap into register.",
    "Camera: hold the wide while the drum works, push in on an edge to show misregistration, macro on the rosette, back out to the full print.",
  ],
};
