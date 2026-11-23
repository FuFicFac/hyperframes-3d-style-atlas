// styles/floating-screens/spec.js — STYLE_SPEC for "Floating Screens": a modern software-launch look.
// Crisp UI cards (rounded slabs with canvas-drawn UI faces) float at different depths over a luminous
// mesh-gradient backdrop, with soft key-light drop shadows that grow with height, frosted panels, depth of
// field on the hero card and springy choreography. Plain data only (JSON-serializable, no THREE, no window).
// Units: metres (cards live around z = 0..3, backdrop plane behind), Y-up, sRGB hex, radians.
// UI faces are designed in "dp" (design points, like CSS px): one card metre = ui.dpPerMetre dp.

export const STYLE_SPEC = {
  id: "floating-screens",
  name: "Floating Screens",
  description:
    "Bright SaaS launch-video look: rounded UI cards with crisp canvas-drawn interfaces float at different depths over a soft colour-blob gradient, with large soft drop shadows from a top-left key, frosted-glass panels, depth of field on the hero card, connector lines with travelling chips, a cursor, and springy fly-in / fan / stack / focus choreography.",
  palette: {
    bg: "#eef0fb",
    ink: "#101828",       // primary text
    ink2: "#475467",      // secondary text
    muted: "#98a2b3",     // tertiary text, icons
    line: "#e4e7ec",      // hairlines, greeked text
    lineSoft: "#f0f2f6",
    surface: "#ffffff",   // card face
    surface2: "#f6f7fb",  // inset areas, assistant bubble
    accent: "#5b4df5",    // THE brand accent (indigo-violet)
    accentDark: "#4335d6",
    accentSoft: "#ecebff",
    accentMid: "#c9c3ff",
    success: "#12a26b",
    shadow: "#1d1b4f",    // shadow tint (cool, never grey-black)
    primary: "#5b4df5",
    secondary: "#ffffff",
  },
  world: {
    background: "#eef0fb",
    environment: null,
    toneMapping: "none",  // faces are unlit/designed colours; lit slab edges are kept below 1.0 by the light rig
    exposure: 1.0,
  },
  materials: {
    // slab side walls: bright, lightly glossy, lit by the key so the top edge reads brighter than the bottom
    cardEdge: { type: "standard", baseColor: "#f4f5fb", roughness: 0.42, metalness: 0 },
    // card back when no back face is drawn
    cardBack: { type: "standard", baseColor: "#f1f2f8", roughness: 0.6, metalness: 0 },
    chipEdge: { type: "standard", baseColor: "#d9d5ff", roughness: 0.4, metalness: 0 },
  },
  // Key from the top-left (matches the shadow direction below) + cool sky fill. Edges only: faces are unlit.
  lights: [
    { id: "key", type: "directional", color: "#ffffff", intensity: 1.15, position: [-6, 8, 9], target: [0, 0, 0] },
    { id: "fill", type: "hemisphere", color: "#f3f2ff", groundColor: "#c9cde0", intensity: 1.0 },
  ],
  post: {
    vignette: { darkness: 0.12, offset: 1.25 }, // barely there: airy, not moody
    grain: { amount: 0.022, fps: 30 },          // dither: keeps the big soft gradients from banding in the MP4
  },
  camera: { fov: 30, near: 0.4, far: 80, drift: { amp: 0.035, speed: 0.35 } },
  text: { font: "ui", weight: 600, color: "#101828", height: 0.4 },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "whoosh", land: "tick", emphasis: "chime", ui: "click", bed: "pad" },
  motion: [
    "Cards fly in from depth (behind, below, tilted, small) on a spring and settle with ~6-8 % overshoot; nothing moves linearly.",
    "Layouts are targets: fan, stack, grid, row; cards re-arrange by springing between layout poses, staggered ~60-90 ms.",
    "Focus: the hero scales up and comes forward while the others recede 1-2 m (depth of field blurs them).",
    "UI on the faces animates in sync: typing (per-character plan), progress, rows appearing, toggles, caret blink.",
    "Camera: slow drifting arcs and push-ins (one move per beat), tiny drift during holds; parallax comes from depth.",
    "Connectors draw on, then small glowing chips travel along them; the cursor glides on an eased arc and clicks (dip + ripple).",
  ],

  // ---- look numbers consumed by style.js ---------------------------------------------------------------
  ui: {
    dpPerMetre: 140,      // design points per card metre (a 3.6 m card = 504 dp wide)
    pxPerDp: 3.4,         // canvas pixels per dp (texture resolution; 3.4 x 140 = 476 px/m)
    maxPx: 4096,
    anisotropy: 16,
    fonts: {
      ui: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
      mono: '"SF Mono", Menlo, Monaco, "Courier New", monospace',
    },
    radius: 22,           // card corner radius (dp)
    border: "#e7e9f0",    // 1 dp face border
    sheen: 0.55,          // top-edge inner highlight strength (white, inside the border)
    greek: { h: 7, gap: 8.5, radius: 3.5 }, // greeked text bars (dp)
  },
  card: {
    thickness: 0.05,      // slab depth (m)
    radius: 0.16,         // corner radius in metres for the slab outline (matches ui.radius / dpPerMetre)
    curveSegments: 10,
    outline: { width: 0.035, gap: 0.025, glow: 0.12 }, // accent focus ring around a selected card (m)
  },
  // Fake soft shadows from the key light (no shadow maps): each receiver (backdrop, any card) draws the
  // projected rounded-rect footprints of the casters in front of it; blur and offset grow with the gap.
  shadow: {
    dir: [0.32, -0.5, -1],  // light travel direction (top-left key -> shadows fall down-right, away)
    color: "#1d1b4f",
    opacity: 0.2,           // at zero gap
    blur0: 0.03,            // blur radius (m) at zero gap
    blurPerM: 0.24,         // extra blur per metre of gap
    spreadPerM: 0.03,       // footprint grows this much per metre of gap
    fade: 0.32,             // opacity /= (1 + fade * gap)
    ambient: { opacity: 0.1, blur: 0.22, offset: [0.0, -0.06] }, // a tight always-on occlusion under each card
    maxGap: 7,
    maxCasters: 8,
  },
  backdrop: {
    z: -3.2,
    size: [46, 26],
    base: "#eef0fb",
    // soft colour blobs (mesh-gradient feel); pos in backdrop metres, r = falloff radius, drift amplitude/speed
    blobs: [
      { color: "#c8c0ff", pos: [-7, 4.2], r: 7.5, amp: [1.4, 0.8], speed: 0.08 },
      { color: "#b9e2ff", pos: [7.5, 3.4], r: 7.0, amp: [1.1, 1.0], speed: 0.07 },
      { color: "#ffd8c8", pos: [6.5, -4.6], r: 6.5, amp: [1.3, 0.7], speed: 0.09 },
      { color: "#c9f0e2", pos: [-6.5, -4.8], r: 6.0, amp: [1.0, 0.9], speed: 0.06 },
      { color: "#f6d3f0", pos: [0.5, 0.6], r: 5.0, amp: [1.6, 1.0], speed: 0.05 },
    ],
    strength: 0.9,
    grain: 0.012,         // in-shader dither (linear) on top of post grain
  },
  frosted: {
    color: "#ffffff",
    alphaTop: 0.5, alphaBottom: 0.28, // vertical gradient of the milky fill
    rim: 0.85, rimWidth: 0.05,        // bright inner edge (m)
    tint: "#f4f2ff",
  },
  dof: { aperture: 0.0016, maxblur: 0.0075 },
  connector: { width: 3.2, color: "#5b4df5", level: 0.95, dash: null, arrow: 0.12, chipSize: 0.11 },
  cursor: { size: 0.42, fill: "#101828", stroke: "#ffffff", ripple: "#5b4df5" },
  step: {
    x: -0.86, y: 0.8,       // NDC of the label's left edge / centre line (inside the safe area)
    height: 0.058,          // label height (fraction of frame height)
    pill: "#ffffff", pillAlpha: 0.92, text: "#101828", badge: "#5b4df5", badgeText: "#ffffff",
    tracking: 0.08, weight: 700, inDur: 0.45, outDur: 0.35, rise: 0.02,
  },
};
