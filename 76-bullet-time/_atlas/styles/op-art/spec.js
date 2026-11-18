// styles/op-art/spec.js — STYLE_SPEC for "Op Art" (1960s optical art, after the METHODS of Riley and Vasarely; the
// compositions are our own). Plain data only: JSON-serializable, no THREE, no window. Importable from Node
// (export-spec.mjs, scene.config.js for the plan + score) and the browser.
// Units: metres. One big hard-edged panel hung on a white gallery wall; every pattern on it is computed analytically in
// one fragment shader (no textures), antialiased with fwidth, so stripes stay crisp at any angle without shimmer.
//
// The look: flat black-and-white pattern that the eye reads as depth and motion. (1) Stripes whose spacing and
// black/white duty are warped so a sphere bulges out of the wall, and the bulge travels. (2) A clear acetate sheet of
// rings slides over the ringed panel: moiré bands sweep far faster than the sheet moves. (3) A Vasarely grid of squares
// and circles whose size and colour step ring by ring into a dome, then flips into a tunnel. (4) The camera walks
// off-axis: the "dome" was flat paint on a flat board all along. opplan.js schedules all of it; the score reads the
// same plan.

export const STYLE_SPEC = {
  id: "op-art",
  name: "Op Art",
  description:
    "1960s optical art on a white gallery wall: one large hard-edged panel of pure black-and-white pattern that the eye reads as depth and motion. Vertical stripes whose spacing and black/white duty are warped so a sphere seems to bulge out of the flat wall, and the bulge travels; a clear acetate sheet of rings slides over a ringed panel so moiré bands sweep much faster than the sheet moves; a Vasarely-style grid of checker squares and circles whose size and colour step ring by ring into a dome, then flip into a tunnel, with red and cobalt accents; and a reveal where the camera walks off-axis to show the 'dome' is flat paint on a flat board. Every pattern is analytic in one shader (fwidth antialiasing, stripes >= ~16 px wide, fade to mean grey below Nyquist), camera locked except the reveal, no strobing.",
  palette: {
    bg: "#eeede9",
    wall: "#f1f0ec",
    floor: "#d6d3cc",
    black: "#121212",
    white: "#f7f6f2",
    red: "#e2321f",
    blue: "#1f44c8",
    edge: "#f3f2ee",
    ink: "#141414",
  },
  world: {
    background: "#eeede9",
    sky: null,
    fog: null,
    environment: null,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    wall: { type: "standard", baseColor: "#f1f0ec", roughness: 0.92, metalness: 0 },
    floor: { type: "standard", baseColor: "#d6d3cc", roughness: 0.6, metalness: 0 },
    edge: { type: "standard", baseColor: "#f3f2ee", roughness: 0.7, metalness: 0 },
    back: { type: "standard", baseColor: "#cfc8bb", roughness: 0.9, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#ffffff", groundColor: "#c9c4bc", intensity: 2.5 },
    {
      // gallery wash from high front-left: the panel throws a thin soft shadow down-right onto the wall
      id: "key", type: "directional", color: "#fffaf2", intensity: 1.7, position: [-2.6, 5.2, 5.6], target: [0, 1.4, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 3.2, near: 0.5, far: 20, bias: -0.0004, normalBias: 0.02 },
    },
  ],
  post: {},   // no post: the panel shader writes exact palette colours (no tone map, bloom, grain or vignette on it)
  camera: { fov: 30, near: 0.3, far: 60, drift: { amp: 0, speed: 0.2 } },   // locked: pattern illusions need a still eye
  text: { font: "sans", weight: 700, color: "#141414", height: 0.3 },

  // ---- the panel -------------------------------------------------------------------------------------------
  panel: {
    w: 3.4, h: 1.7,           // m (2:1 so it fills a 16:9 frame with room for the caption under it)
    depth: 0.08,              // stretcher depth: visible as a white edge in the off-axis reveal
    standoff: 0.03,           // gap to the wall (thin shadow line)
    y: 1.62,                  // centre height
  },
  wall: { w: 30, h: 9 },

  // ---- pattern (all in panel metres) -----------------------------------------------------------------------
  pattern: {
    stripe: { period: 0.0773, duty: 0.5 },         // 44 periods across 3.4 m: ~36 px per period at the front shot
    bulge: { R: 0.64, A: 0.45, shade: 0.42, light: [-0.45, 0.55, 0.7], shadeMid: 0.25, dutyMin: 0.3, dutyMax: 0.7, shadow: [0.22, -0.26, 1.02, 0.0], fade: [0.45, 1.0] },   // C0 cap warp (crisp rim, max 1.9x compression); duty 0.3..0.7 keeps bands >= ~8 px
    rings: { period: 0.062, duty: 0.5 },          // panel rings (~29 px)
    acetate: { w: 3.4, h: 1.7, period: 0.062, duty: 0.45, gap: 0.03, tint: 0.0, frame: 0.008, ink: 0.95, glideFrom: 0.16, glideTo: -0.16 },
    grid: { cell: 0.17, lensR: 1.25, dome: 0.5, tunnel: -0.45, rcBig: 0.42, rcSmall: 0.13, accentRings: 2 },
    nyquist: [0.3, 0.6],                           // phase-per-pixel band where a pattern fades to its mean grey
  },

  // ---- overlay caption: a gallery wall label (white card, black type) ----------------------------------------
  caption: {
    x: 960, y: 922, h: 86, cap: 40, maxW: 900,
    font: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: 700,
    card: "#ffffff", edge: "#d8d6d0", ink: "#141414", mark: "#e2321f",
  },

  sound: {
    bed: { gain: 0.62, root: 110, chord: [0, 7, 12], brightness: 900 },
    grow: { pop: 0.5, thud: 0.45 },
    travel: { whoosh: 0.32, servo: 0.16 },
    wipe: { whoosh: 0.34 },
    slide: { paper: 0.35 },
    fringe: { tick: 0.22 },
    align: { chime: 0.2 },
    cell: { marimba: 0.13 },
    reveal: { whoosh: 0.36, thud: 0.5, chime: 0.16 },
  },
  sfx: { enter: "pop", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Nothing in the pattern is a texture: one fragment shader computes stripes, rings and the grid from panel coordinates and the plan's uniforms, antialiased with fwidth.",
    "The bulge is a C1 radial warp of the stripe phase (wide at the centre, compressed at the rim) plus duty-cycle shading from a sphere normal; only the disc changes as it travels.",
    "Moiré is real: two ring gratings (panel + a separate acetate mesh 3 cm in front) multiply; the sheet glides 0.84 m and the bands sweep through ~14 fringes.",
    "Grid steps are per Chebyshev ring of cells: reveal, circle growth and the dome-to-tunnel flip all run outward ring by ring, one marimba note per ring.",
    "Camera: locked front-on until the reveal, then one 2 s arc to ~45 deg off-axis showing a flat painted board.",
  ],
};
