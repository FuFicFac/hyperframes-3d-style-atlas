// styles/exploded-view/spec.js — STYLE_SPEC for the Exploded View style. Plain data only:
// JSON-serializable, no THREE, no window. Importable from Node (export-spec.mjs) and the browser.
// Units: metres, Y-up right-handed, colors sRGB hex, angles radians, three.js light units.
//
// Look: a premium product teardown. One manufactured object floats in a bright seamless studio and
// separates along its assembly axis into precise hard-surface parts (small bevels, lathed profiles,
// plates with holes, gears, fans, coils, PCBs, brass screws). Restrained materials: satin anodised metal,
// matte black plastic, smoked polycarbonate, one accent hero part. Every part carries a thin dark
// screen-space outline. Soft overhead softbox, a floor shadow that stretches as parts separate,
// dashed axis lines between parts, numbered callouts with leaders, a parts legend.

export const STYLE_SPEC = {
  id: "exploded-view",
  name: "Exploded View",
  description:
    "Premium product teardown: one manufactured object in a bright seamless studio separates along its assembly axis into precise bevelled parts (satin metal, matte black plastic, smoked polycarbonate, one accent hero part, brass screws), each outlined in thin dark ink, joined by dashed axis lines, with numbered callouts and a parts legend.",
  palette: {
    bgTop: "#f7f6f3",
    bgBottom: "#e3e1dc",
    ink: "#17191c",          // outlines, label text
    inkSoft: "#5c6169",      // secondary label text
    rule: "#b9bcc1",         // legend rules, dimmed outlines
    accent: "#ff5a1f",       // hero part + active callout
    accentDeep: "#d9400d",
    aluminium: "#c3c7cd",
    graphite: "#2b2e33",
    black: "#1b1d20",
    white: "#efeeeb",
    smoke: "#3d434b",
    brass: "#c9a14a",
    pcb: "#1f5c47",
    pad: "#d6b45a",
    rubber: "#232427",
    led: "#58e0ff",
    shadow: "#3a3c40",
  },
  world: {
    background: "#ebe9e5",
    sky: { stops: [[0, "#f7f6f3"], [0.62, "#eeece8"], [1, "#e0ded9"]] }, // seamless studio sweep, screen-space
    environment: "room", // reflections on satin metal and clearcoat
    environmentIntensity: 0.55,
    toneMapping: "neutral", // keeps the designed palette (ACES greys whites, oranges the accent)
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    // satin anodised aluminium: metallic, mid roughness so the room env reads as a soft sheen
    metal: { type: "physical", baseColor: "#c3c7cd", roughness: 0.34, metalness: 0.85, clearcoat: 0.15, clearcoatRoughness: 0.4 },
    darkMetal: { type: "physical", baseColor: "#6d727a", roughness: 0.38, metalness: 0.8 },
    plasticBlack: { type: "physical", baseColor: "#1b1d20", roughness: 0.62, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.6 },
    plasticGraphite: { type: "physical", baseColor: "#2b2e33", roughness: 0.4, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.25 },
    plasticWhite: { type: "physical", baseColor: "#efeeeb", roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.35 },
    plasticGrey: { type: "physical", baseColor: "#a9adb3", roughness: 0.55, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.5 },
    rubber: { type: "physical", baseColor: "#232427", roughness: 0.85, metalness: 0 },
    // smoked polycarbonate: tinted, translucent, glossy (opacity, not transmission: cheap and post-safe)
    smoke: { type: "physical", baseColor: "#3d434b", roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, opacity: 0.55 },
    accent: { type: "physical", baseColor: "#ff5a1f", roughness: 0.38, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 },
    brass: { type: "physical", baseColor: "#c9a14a", roughness: 0.3, metalness: 0.95 },
    pcb: { type: "physical", baseColor: "#1f5c47", roughness: 0.45, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3 },
    pad: { type: "physical", baseColor: "#d6b45a", roughness: 0.3, metalness: 0.9 },
    led: { type: "standard", baseColor: "#58e0ff", roughness: 0.3, metalness: 0, emission: { color: "#58e0ff", strength: 1.2 } },
    copper: { type: "physical", baseColor: "#c27b4a", roughness: 0.3, metalness: 0.95 },
  },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#ffffff", groundColor: "#d9d6d0", intensity: 0.9 },
    {
      // the softbox: high, slightly left/front, very soft PCF shadow
      id: "softbox", type: "directional", color: "#ffffff", intensity: 2.2, position: [-5, 16, 7], target: [0, 0, 0],
      shadow: { softness: 9, mapSize: 2048, extent: 11, near: 2, far: 45, bias: -0.0004, normalBias: 0.025 },
    },
    { id: "rim", type: "directional", color: "#eef3ff", intensity: 0.9, position: [8, 4, -9], target: [0, 0, 0] },
    { id: "fill", type: "directional", color: "#fff6ec", intensity: 0.45, position: [6, 2, 10], target: [0, 0, 0] },
  ],
  post: {
    bloom: { strength: 0.35, radius: 0.4, threshold: 2.6 }, // light scene: only LEDs bloom
    vignette: { darkness: 0.1, offset: 1.25 },
  },
  camera: { fov: 26, near: 1, far: 140, drift: { amp: 0.03, speed: 0.3, orbit: 0 } },
  text: { font: "sans", weight: 700, color: "#17191c", height: 0.5 },
  // ---- style-specific tuning ----
  outline: {
    width: 1.7,          // px at 1080p: silhouettes (all smooth or hard edges on the silhouette)
    creaseWidth: 1.05,   // px: visible hard creases sharper than creaseDeg
    creaseDeg: 50,       // dihedral angle above which an edge is a drawn crease
    creaseLevel: 0.55,   // crease opacity relative to the silhouette
    color: "#17191c",
    bias: 0.02,          // m toward the camera so lines beat their own surfaces
    highlightWidth: 3.0, // px for the focused part's silhouettes (accent colour; creases stay ink)
    highlightSize: 0.45, // m: meshes smaller than this (bounding radius) get proportionally less extra accent width
  },
  explode: {
    overshoot: 1.35,     // outBack s for the separating parts
    outDur: 0.9,         // default travel time of one part (s)
    backDur: 0.45,       // reassembly travel (inCubic) ...
    snap: { amp: 0.06, freq: 26, decay: 9 }, // ... then a small damped rebound (fraction of the gap)
    screwTurns: 3.5,     // turns a screw spins while it backs out
  },
  focus: {
    // Dimmed parts move toward a per-material "dim colour": their own colour desaturated and its luminance pulled
    // toward a mid-tone, capped well below the backdrop (~0.91 sRGB) so they stay solid shapes, never ghosts.
    // No lerp toward the background and no emissive lift (both washed parts out to white).
    dim: 1,              // how far non-focused parts move toward their dim colour (0 none .. 1 all the way)
    keepSat: 0.22,       // saturation a dimmed part keeps (0 grey .. 1 full)
    mid: 0.5,            // sRGB luminance the dim colour is pulled toward ...
    flatten: 0.6,        // ... by this fraction (black plastic -> dark-mid grey, white plastic -> light-mid grey)
    maxL: 0.6,           // sRGB luminance ceiling of a dim colour (backdrop is ~0.91)
    metalness: 0.65,     // metalness scale on dimmed metals (less env glare, reads as the same grey family)
    dimLine: "#3a3e45",  // outline colour of dimmed parts: still ink, a touch softer than the hero's
    dimLineLevel: 0.8,   // outline opacity of dimmed parts
    glow: 0.018,         // accent emissive on the focused part
  },
  axis: { width: 1.3, color: "#7d8188", dash: [0.16, 0.1, 0.03, 0.1], level: 0.9 }, // dash-dot centre line (m)
  shadow: { floorOpacity: 0.07, blobOpacity: 0.28, blobSpread: 1.25 },
  ui: {
    font: "sans",
    ink: "#17191c",
    inkSoft: "#5c6169",
    rule: "#b9bcc1",
    accent: "#ff5a1f",
    dot: "#17191c",
    dotText: "#ffffff",
    leaderWidth: 1.6,  // px
    paper: "#f7f6f3",
  },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "whoosh", land: "clack", emphasis: "blip", ui: "tick", bed: "pad", servo: "buzz", screw: "click" },
  motion: [
    "The assembled object turns from a flat side view into a three-quarter hero angle (quaternion slerp), with a servo whir.",
    "Parts separate along the assembly axis outermost-first with an outBack overshoot; screws spin out several turns as they travel.",
    "Dash-dot centre lines draw on between separated parts; per-part floor shadows slide apart so the shadow stretches.",
    "One part at a time is focused: others shift to a desaturated mid-tone grey of their own colour (ink outlines and shading kept), the focus part keeps full colour and gets an accent silhouette, and its callout leader draws on, then the label slides in.",
    "The camera arcs slowly around the stack; at the end parts reassemble innermost-first with an inCubic rush and a small damped snap.",
  ],
};
