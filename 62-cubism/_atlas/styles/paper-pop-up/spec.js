// styles/paper-pop-up/spec.js — STYLE_SPEC for "Paper Pop-Up". Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs) and the browser.
// Units: metres (a 32 cm book is modelled ~20x: 6.4 m wide), Y-up right-handed, sRGB hex, radians,
// three.js light units.
//
// The look: a pop-up book lying open on a warm wood table. The spine runs along X at z = 0, the "far"
// page is z < 0 and the "near" page z > 0. Die-cut card pieces stand on hinge lines parallel to the
// spine, face +Z (the reader), fold forward (toward +Z) to lie flat, and pop up with a spring.

export const STYLE_SPEC = {
  id: "paper-pop-up",
  name: "Paper Pop-Up",
  description:
    "A mid-century pop-up book open on a wooden table: matte die-cut card pieces with light cut edges hinge up from the page in staggered layers, under a soft warm key light.",
  palette: {
    bg: "#2a1c13",        // room falloff beyond the table
    wood: "#7a5034",
    woodDark: "#472c1d",
    woodLight: "#9e6d46",
    page: "#f4ead4",      // book page cream
    cream: "#f7efdc",     // cream card
    ink: "#22313b",       // deep blue-black ink
    teal: "#2e7d78",
    tealLight: "#7fb7ae",
    mustard: "#e2a730",
    mustardDark: "#b58222",
    coral: "#e4694e",
    coralDark: "#b84d38",
    cover: "#1f3d44",     // book cloth
    edge: "#fbf7ec",      // die-cut card core (lighter than any face)
    cardBack: "#eee3cb",
    slot: "#3a2d22",      // pull-tab slot shadow
  },
  world: {
    background: "#2a1c13",
    fog: { color: "#2a1c13", near: 13, far: 30 },
    environment: null,
    toneMapping: "neutral", // Khronos PBR Neutral keeps the printed palette faithful
    exposure: 1.28,
    shadowType: "pcf",      // pcf so shadow.softness (radius) applies; pcfsoft ignores it in r181
  },
  // Paper geometry/feel. Thickness is world metres at book scale (0.6 mm card x 20).
  paper: {
    cardThickness: 0.012,
    glueGap: 0.0015,        // air gap between glued layers (no z-fighting at 1.5 mm)
    stackGap: 0.003,        // gap between flattened pieces when folded
    leafThickness: 0.008,
    leafStep: 0.006,        // vertical spacing of stacked leaves
    curveSegments: 28,      // shape curve resolution for extrusion
    bendMaxEdge: 0.22,      // pieces riding a turning leaf are tessellated to this edge length so they bend with it
    printPxPerMetre: 420,   // resolution of printed faces (text, patterns)
    fibre: { size: 512, base: "#f5f5f5", fiber: 0.05, grain: 0.035, seed: 41, repeatPerMetre: 0.9, description: "white paper fibre multiplied under every printed colour" },
    // card backs: a faint wash of the face colour plus a printed hatch, so folded pieces still read
    back: { tint: 0.3, hatchEvery: 0.06, hatchWidth: 0.012, hatchAlpha: 0.16, hatchColor: "#22313b", glow: 0.22 },
    pageBorder: { inset: 0.16, width: 0.012, color: "#c9b48c", gutterShade: 0.18, gutterShadeWidth: 0.22 },
  },
  textures: {
    wood: { size: 1024, metres: 5.0, boards: 5, seed: 23, grainFreq: 22, grainWarp: 2.2, contrast: 0.5, seamColor: "#2e1c12", description: "planks along X, fbm-warped sine grain, per-board tone shift, dark seams" },
    pageEdge: { size: 256, lines: 64, light: "#f2e8d0", dark: "#cdbd9b", description: "stacked page edges: fine horizontal lines" },
  },
  materials: {
    table: { type: "standard", baseColor: "#ffffff", roughness: 0.58, metalness: 0, bump: { scale: 64, octaves: 2, seed: 5, strength: 0.25, description: "fine wood pore noise" } },
    cover: { type: "standard", baseColor: "#1f3d44", roughness: 0.88, metalness: 0, bump: { scale: 96, octaves: 2, seed: 8, strength: 0.6, description: "book-cloth weave noise" } },
    page: { type: "standard", baseColor: "#ffffff", roughness: 0.93, metalness: 0 },
    pageEdge: { type: "standard", baseColor: "#ffffff", roughness: 0.95, metalness: 0 },
    card: { type: "standard", baseColor: "#ffffff", roughness: 0.9, metalness: 0, bump: { scale: 40, octaves: 3, seed: 17, strength: 0.18, description: "paper fibre bump, shared by all card faces" } },
    cutEdge: { type: "standard", baseColor: "#fbf7ec", roughness: 0.95, metalness: 0, emission: { color: "#fbf7ec", strength: 0.3 } }, // card core glows faintly: no dark slivers edge-on
    cardBack: { type: "standard", baseColor: "#eee3cb", roughness: 0.92, metalness: 0, emission: { color: "#eee3cb", strength: 0.22 } },
    slot: { type: "standard", baseColor: "#3a2d22", roughness: 1, metalness: 0 },
  },
  // Inks: card face colours (each becomes a material `ink:<name>` sharing the card template).
  inks: ["cream", "ink", "teal", "tealLight", "mustard", "mustardDark", "coral", "coralDark"],
  lights: [
    { id: "ambient", type: "hemisphere", color: "#fff1dc", groundColor: "#6a4630", intensity: 1.35 },
    { id: "key", type: "directional", color: "#ffe0b5", intensity: 3.1, position: [-5.5, 8.5, 6.5], target: [0.3, 0, -0.3],
      shadow: { softness: 5, mapSize: 4096, extent: 4.6, near: 2, far: 30, bias: -0.0004, normalBias: 0.012 } },
    { id: "fill", type: "directional", color: "#d9e4f5", intensity: 0.45, position: [7, 3.5, 4], target: [0, 0.5, 0] },
    { id: "rim", type: "directional", color: "#ffd9a8", intensity: 0.8, position: [2, 5, -8], target: [0, 0.5, 0] },
  ],
  post: {
    tiltShift: { focus: 0.5, range: 0.3, blur: 2.2 },
    vignette: { darkness: 0.34, offset: 1.1 },
    grain: { amount: 0.022, fps: 30 },
  },
  camera: { fov: 30, near: 0.5, far: 80, drift: { amp: 0.035, speed: 0.3 } },
  text: { font: "serif", weight: 700, color: "#22313b", height: 0.36 },
  tuning: {
    lean: 0.16,                                   // rest lean back (rad) so faces tilt toward a high camera
    pop: { stiffness: 170, damping: 16 },         // zeta ~0.61 -> ~9% overshoot, settles in ~0.5 s
    popStagger: 0.13,                             // s between layers, back-to-front
    foldDur: 0.36, foldStagger: 0.05, foldEase: "inOutCubic",
    turnDur: 0.78, turnEase: "inOutSine", curl: 0.85, curlFrom: 0.04, curlTo: 0.7, breath: 0.035, // travelling curl: bend starts at curlFrom*D and travels to curlTo*D
    pullDur: 0.45, pullEase: "inOutCubic",
  },
  sfx: { enter: "paper", exit: "rustle", move: "whoosh", land: "thud", emphasis: "pop", ui: "click", bed: "pad" },
  motion: [
    "Printed text is baked into card-face textures (lit with the card), never floating labels.",
    "Every piece rotates up about its hinge line on a damped spring (~9% overshoot, settle ~0.5 s); hinge angle is a pure function of t.",
    "Layers pop back-to-front with ~0.14 s stagger; folding flat runs front-to-back so flattened pieces stack without crossing.",
    "Page turn: all pieces fold flat, the leaf (carrying them, bent with it) arcs over the spine with a curl that travels from the spine to the free edge; flat pieces nearby breathe up a few degrees; the next spread pops.",
    "Pull-tabs slide along their slot in ~0.45 s and trigger a pop or a swing elsewhere on the spread.",
    "Camera: three-quarter view down onto the book, one slow push-in per spread, a small pull-back during each page turn; never cut.",
  ],
};
