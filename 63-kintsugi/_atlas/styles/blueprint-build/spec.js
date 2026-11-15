// styles/blueprint-build/spec.js — STYLE_SPEC for "Blueprint Build": a cyanotype drafting sheet come to life.
// Plain data only (JSON-serializable, no THREE, no window). Units: metres in the 3D drawing, PIXELS
// (1920x1080 frame, y down) on the sheet layer, sRGB hex, radians. Every number that defines the look lives here.
import { STROKE_FONT } from "../../kit/strokefont.js";

// Extra single-stroke glyphs this style needs (cap height 1, baseline 0). Kit promotion candidate.
const EXTRA_GLYPHS = {
  "—": { w: 0.8, s: [[[0, 0.46], [0.8, 0.46]]] },
  "·": { w: 0.0, s: [[[0, 0.5], [0, 0.44]]] },
  "→": { w: 0.86, s: [[[0, 0.46], [0.84, 0.46]], [[0.56, 0.7], [0.86, 0.46], [0.56, 0.22]]] },
  "Ø": { w: 0.7, s: [[["a", 0.35, 0.5, 0.35, 0.5, 98, 442]], [[0.0, -0.06], [0.7, 1.06]]] },
  "×": { w: 0.44, s: [[[0, 0.68], [0.44, 0.24]], [[0.44, 0.68], [0, 0.24]]] },
};

export const STYLE_SPEC = {
  id: "blueprint-build",
  name: "Blueprint Build",
  description:
    "A cyanotype drafting sheet come to life: deep Prussian-blue paper with a faint grid, fibres and fold creases; objects drawn as crisp pale hidden-line linework (visible edges solid, hidden edges dashed) that plots on stroke by stroke, with dash-dot centre-lines, dimensions, leaders, hatching and a title block in single-stroke technical lettering. Front elevation tilts into an isometric view.",
  palette: {
    bg: "#1a5296",
    paper: "#1a5296",
    paperDark: "#134581",
    paperLight: "#2463ab",
    grid: "#7aa6dc",
    ink: "#eef6ff",        // outlines, lettering
    inkSoft: "#c4dcf6",    // dimensions, leaders
    construction: "#8db4e4",
    hidden: "#a9c8ee",
    accent: "#ffd27a",     // plotter head marker only (the one warm note on the sheet)
    primary: "#eef6ff",
    secondary: "#8db4e4",
  },
  world: { background: "#1a5296", fog: null, environment: null, toneMapping: "none", exposure: 1.0 },
  materials: {
    // Lines are a custom screen-space ribbon shader (style.js); fills are depth-only. These are for translators.
    fill: { type: "basic", baseColor: "#000000", description: "depth-only occluder (colorWrite off, polygonOffset 1/1)" },
    ink: { type: "basic", baseColor: "#eef6ff", description: "line/arrowhead colour; blended with MAX (lighten) so overlaps never double" },
  },
  lights: [],
  post: {}, // no post: keeps MSAA + exact colours; vignette and grain are painted into the sheet itself
  camera: { fov: 9, near: 20, far: 120, distance: 46, drift: { amp: 0, speed: 0 } },
  text: { font: "mono", weight: 600, color: "#eef6ff", height: 0.3 },
  sfx: { enter: "click", exit: "click", move: "whoosh", land: "clack", emphasis: "fold", ui: "tick", bed: "hum", plot: "paper" },
  motion: [
    "Lines plot on along their length in drafting order: construction lines, then outlines, then dimensions, then lettering.",
    "One pen at a time: a small amber plotter-head crosshair rides the tip of whatever is being drawn.",
    "Parts slide apart along their dash-dot axis lines (exploded view) with an inOutCubic ease and a soft clack at rest.",
    "Camera: orthographic-like long lens (9° fov); holds a flat front elevation, then one slow tilt to isometric; never cuts.",
    "Annotation lives on the sheet (screen space): leaders re-attach to their 3D anchors as the view tilts.",
  ],

  // ---- look numbers consumed by style.js ----
  line: {
    // stroke weights in PIXELS at 1080p (screen-space ribbons, analytic anti-aliasing, round caps/joins)
    weights: { outline: 3.6, silhouette: 3.6, hidden: 1.7, construction: 1.3, centre: 1.6, dimension: 1.9, hatch: 1.3, leader: 1.9, text: 2.6, title: 3.0, border: 2.4, detail: 2.2 },
    // brightness multipliers on the colour (MAX blending: a dim line just lightens the paper less)
    levels: { outline: 1.0, silhouette: 1.0, hidden: 0.62, construction: 0.5, centre: 0.7, dimension: 0.85, hatch: 0.6, leader: 0.85, text: 1.0, title: 1.0, border: 0.8, detail: 0.85 },
    colors: { outline: "ink", silhouette: "ink", hidden: "hidden", construction: "construction", centre: "construction", dimension: "inkSoft", hatch: "inkSoft", leader: "inkSoft", text: "ink", title: "ink", border: "inkSoft", detail: "inkSoft" },
    // dash patterns in METRES along the line [dash, gap, dot, gap] (dot 0 = plain dashes); sheet-layer lines use px
    dash: { hidden: [0.085, 0.055, 0, 0], centre: [0.34, 0.06, 0.035, 0.06], construction: null },
    dashPx: { hidden: [10, 7, 0, 0], centre: [30, 7, 4, 7] },
    bias: 0.03,           // metres: visible lines are pulled toward the camera so they win the depth test against their own fill
    featureAngle: 24,     // degrees between face normals that makes an edge a drawn feature edge
    penGap: 0.015,        // fraction of a sequential plot spent pen-up between strokes
  },
  lettering: { letterSpacing: 0.28, wordSpacing: 0.62, lineHeight: 1.6, bendRadius: 0.0, slant: 0.0 },
  dimension: { arrowLen: 0.17, arrowWidth: 0.055, extGap: 0.07, extOver: 0.12, textCap: 0.17, textGap: 0.08, tickLen: 0.12 },
  hatch: { spacing: 0.075, angle: 0.785 },
  loopArrow: { headLen: 0.32, headWidth: 0.13 },
  head: { radius: 11, cross: 22, weight: 2.0 },
  sheet: {
    width: 1920, height: 1080, seed: 31,
    gridMinor: 27, gridMajor: 135, gridMinorAlpha: 0.13, gridMajorAlpha: 0.26, gridLine: 1.0,
    mottle: 0.4, mottleScale: 4, grain: 6, fibres: 900,
    creases: { x: [0.515], y: [0.49], width: 26, light: 0.12, dark: 0.12 },
    vignette: 0.32, fade: [{ x: 0.08, y: 0.12, r: 0.32, a: 0.06 }, { x: 0.82, y: 0.86, r: 0.36, a: 0.05 }],
    border: { outer: 30, inner: 44, zones: 6, rows: 4 },
  },
  plot: { charTime: 0.034, minTime: 0.25 },

  // ---- single-stroke lettering (kit/strokefont.js + the extra glyphs above) ----
  font: { cap: 1, glyphs: { ...STROKE_FONT.glyphs, ...EXTRA_GLYPHS } },
};
