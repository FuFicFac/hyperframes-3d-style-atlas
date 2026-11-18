// styles/studio-product/spec.js — STYLE_SPEC for "Studio Product": one hero object on a dark seamless
// sweep, lit like a phone/car commercial. Long strip-light reflections slide over glossy and brushed
// surfaces, a rim outlines the silhouette, a blurred mirror floor reflects it. Plain data only
// (JSON-serializable, no THREE, no window). Units: metres, Y-up, sRGB hex, radians, three.js light units.
// The reflections come from a PROCEDURAL studio (`studio` below) rendered to a PMREM at load — no images.

export const STYLE_SPEC = {
  id: "studio-product",
  name: "Studio Product",
  description:
    "High-end product commercial: one hero object on a black seamless sweep, procedural softbox/strip-light environment, glossy glass, brushed aluminium and satin ceramic, blurred mirror floor, crisp rim light, slow turntable and light sweeps, ultra-thin callouts.",
  palette: {
    bg: "#020203",
    sweep: "#0c0d10",
    floor: "#050506",
    glass: "#040507",
    aluminium: "#c3c7cd",
    ceramic: "#1c1e22",
    ceramicLight: "#e8e5df",
    gold: "#e0ae5c",
    accent: "#2f74ff", // ONE saturated accent (the "alive" colour: glows, the accent material, the callout dot)
    ink: "#f1f1ee",
    inkDim: "#8d939c",
    line: "#d6d9de",
    primary: "#c3c7cd",
    secondary: "#1c1e22",
  },
  world: {
    background: "#020203",
    fog: { color: "#020203", near: 9, far: 26 }, // the sweep and floor melt into black: no visible set edges
    environment: null,          // style.js builds its own procedural studio PMREM (see `studio`)
    toneMapping: "aces",        // filmic shoulder for strip highlights; accent emissive capped ~2.5 to keep its hue
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    // polished black glass: near-black base, mirror clearcoat — only reads where it reflects a strip
    glass: { type: "physical", baseColor: "#040507", roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 },
    // brushed aluminium: style.js adds a procedural streak roughness/bump map + anisotropy (see `brushed`)
    brushedMetal: { type: "physical", baseColor: "#c3c7cd", roughness: 0.32, metalness: 1 },
    // satin ceramic (dark and light variants)
    ceramic: { type: "physical", baseColor: "#1c1e22", roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.22 },
    ceramicLight: { type: "physical", baseColor: "#e8e5df", roughness: 0.4, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.2 },
    // the one saturated accent: anodised colour with a little emission so it survives the black set
    accent: { type: "physical", baseColor: "#2f74ff", roughness: 0.28, metalness: 0.6, clearcoat: 0.6, clearcoatRoughness: 0.08, emission: { color: "#2f74ff", strength: 0.08 } },
    gold: { type: "standard", baseColor: "#e0ae5c", roughness: 0.2, metalness: 1 },
    // floor + sweep: style.js turns `floor` into the blurred-mirror material (see `floor` block)
    floor: { type: "physical", baseColor: "#050506", roughness: 0.5, metalness: 0 },
  },
  // Direct lights MATCH the environment's emitters (same side, same colour) so diffuse shading, shadows and
  // reflections agree. All of them scale with the studio level (0 = black stage).
  lights: [
    { id: "key", type: "directional", color: "#fff3e6", intensity: 1.1, position: [-6.5, 4.5, 3.5], target: [0, 0.3, 0],
      shadow: { softness: 8, mapSize: 2048, extent: 3.2, bias: -0.0004, normalBias: 0.02 } },
    { id: "top", type: "directional", color: "#fff8f0", intensity: 0.4, position: [0, 9, -1], target: [0, 0, 0] },
    { id: "rimL", type: "spot", color: "#e6eeff", intensity: 70, position: [-4.2, 3.2, -5.2], target: [0, 0.4, 0], angle: 0.42, penumbra: 0.9, distance: 30, decay: 2 },
    { id: "rimR", type: "spot", color: "#e6eeff", intensity: 90, position: [5.4, 2.6, -5.0], target: [0, 0.4, 0], angle: 0.42, penumbra: 0.9, distance: 30, decay: 2 },
    { id: "backdrop", type: "spot", color: "#cfd6e2", intensity: 45, position: [0, 7.5, -3], target: [0, 2.6, -14], angle: 0.32, penumbra: 1, distance: 40, decay: 2 },
  ],
  post: {
    bloom: { strength: 0.4, radius: 0.5, threshold: 2.0 }, // only strip highlights, the rim trace and glows bloom
    vignette: { darkness: 0.55, offset: 1.08 },
    grain: { amount: 0.022, fps: 30 },                     // also the dither that keeps the black gradients from banding
  },
  camera: { fov: 30, near: 0.2, far: 80, drift: { amp: 0.012, speed: 0.3 } },
  text: { font: "sans", weight: 300, color: "#f1f1ee", height: 0.4 },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "The hero sits on an invisible turntable: slow constant rotation (≈0.1 rad/s), eased to rest on the final hero angle.",
    "Light sweeps: a long strip light travels over the top of the set (back horizon → overhead → front) in ~1.3 s; its reflection slides across every glossy face.",
    "Reveal from black: a thin rim light traces the hero's edge, then the first sweep brings the whole studio up.",
    "Camera: slow macro arcs (arc keys) and one pull-back reveal; hard cuts between angles on beats; no handheld shake.",
    "Type: ultra-thin rule + small caps label that draws on (0.45 s), holds, fades; titles are light-weight, widely tracked caps.",
  ],

  // ---- look numbers consumed by style.js -------------------------------------------------------------
  // Procedural studio environment. Rendered once at load (and again only when the sweep/level changes)
  // into a PMREM: a black room with emissive softboxes, strips and gradient cards. Positions in metres
  // around the origin (the hero). intensity = linear radiance multiplier (HDR).
  studio: {
    size: 256,          // PMREM cube face size
    sigma: 0.006,       // PMREM pre-blur (radians-ish): small = crisp strip edges on glossy surfaces
    room: { w: 26, h: 14, d: 26, color: "#010102" },
    panels: [
      { id: "top", kind: "softbox", size: [6, 2.6], pos: [0, 6.2, -1.6], intensity: 1.5, color: "#fff8f0", soft: 0.22 },
      { id: "keyStrip", kind: "strip", size: [0.6, 6], pos: [-7, 2.6, 3.2], intensity: 9, color: "#fff3e6", soft: 0.3 },
      { id: "rimStripR", kind: "strip", size: [0.5, 6.5], pos: [6.5, 2.8, -6.5], intensity: 12, color: "#e8f0ff", soft: 0.3 },
      { id: "rimStripL", kind: "strip", size: [0.4, 5.5], pos: [-6.0, 2.6, -7.5], intensity: 7, color: "#e8f0ff", soft: 0.3 },
      { id: "horizon", kind: "strip", size: [18, 0.32], pos: [0, 0.7, -12.5], intensity: 5, color: "#ffffff", soft: 0.4 },
      { id: "fill", kind: "card", size: [12, 3.5], pos: [0, 1.4, 12.5], intensity: 0.32, gradient: [[0, "#000000"], [0.6, "#7a7d84"], [1, "#ffffff"]] },
      { id: "floorBounce", kind: "card", size: [16, 16], pos: [0, -6.8, 0], intensity: 0.06, gradient: [[0, "#ffffff"], [1, "#000000"]], radial: true },
    ],
    // the travelling sweep strip: a long bar on an arc of `radius` around the X axis (yawed by `yaw`),
    // u = 0 at the back horizon (angle `from`), u = 1 in front (angle `to`); fades in/out at the ends.
    sweep: { size: [20, 0.55], radius: 9, from: 0.12, to: 2.7, intensity: 16, color: "#ffffff", soft: 0.35, edgeFade: 0.16 },
    sweepLight: { intensity: 1.4, color: "#ffffff" }, // matching directional light that follows the strip (diffuse faces)
    quantum: 0.0015,    // re-bake only when sweep/level move more than this (memo keyed by inputs = deterministic)
  },
  // Blurred mirror floor: a second render from the mirrored camera into a half-res target, sampled by the
  // floor with a 12-tap blur, Fresnel, and a radial fade around the hero.
  floor: {
    resolution: 0.5,     // reflection target size × frame
    strength: 0.5,       // reflection gain at grazing
    facing: 0.22,        // reflection gain looking straight down
    blur: 4.5,           // blur radius in reflection-target px
    fade: [1.4, 5.5],    // radial fade (m from the hero): full → none
    envIntensity: 0.12,  // the floor's own env-map sheen (keep low: the mirror carries the reflection)
    specular: 0.25,      // specularIntensity of the floor for direct lights (a broad sheen would grey the black set)
    sweep: { width: 60, depth: 44, height: 18, radius: 9 }, // the cyclorama (floor-to-wall)
  },
  brushed: {
    size: 512, seed: 21, streaks: 0.32, fine: 0.35,   // streak contrast / micro-noise
    perMetre: 1.1,       // texture tiles per metre on extruded caps
    roughness: [0.22, 0.42], // roughness range painted by the streak map
    bump: 0.3,           // bumpScale of the streak map
    anisotropy: 0.75,    // MeshPhysicalMaterial.anisotropy (stretches highlights across the brushing)
  },
  dof: { aperture: 0.0011, maxblur: 0.0045 }, // BokehPass: blur (uv) = (depth - focus) × aperture, clamped
  glow: { color: "#2f74ff", strength: 2.3, idle: 0.0 }, // etched-panel emission (HDR; > bloom threshold when lit)
  trace: { radius: 0.009, color: "#eef3ff", intensity: 9, tail: 0.32 }, // rim-light edge trace (HDR tube)
  overlay: {
    font: "sans",
    titleWeight: 300, titleTracking: 0.32,  // letter spacing in em
    labelWeight: 500, labelTracking: 0.3,
    titleHeight: 0.078,  // one line = this × frame height (cap height ≈ 0.55 × this)
    subHeight: 0.034,
    labelHeight: 0.036,
    lineWidthPx: 1.6, dotPx: 4.5, ringPx: 11,
    lineColor: "#d6d9de", labelColor: "#f1f1ee", subColor: "#8d939c", dotColor: "#2f74ff",
    drawDur: 0.45, fadeDur: 0.4, outDur: 0.45, rise: 0.012,
  },
  turntable: { speed: 0.1 },
};
