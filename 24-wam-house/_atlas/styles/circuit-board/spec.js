// styles/circuit-board/spec.js — STYLE_SPEC for "Circuit Board": a macro photograph of a printed circuit
// board. Matte-satin solder mask, glossy gold/copper traces and pads, white silkscreen, black chips with pin
// rows, tiny passives and LEDs, shallow depth of field, one low raking key. Signals travel as bright pulses
// along octilinear traces; parts power up when a pulse reaches them; silkscreen captions print themselves.
// Plain data only (JSON-serializable, no THREE, no window). Units: metres at ×100 "macro" scale (a 64 × 36 mm
// board is 6.4 × 3.6 m; an 0805 resistor is 0.2 m long), Y-up, board top at y = 0, sRGB hex, radians.

// Palette options: createStyle(stage, { palette: "blue" }). Keys are the same in every palette.
const PALETTES = {
  green: {
    maskBare: "#0a3d22",   // solder mask over bare laminate (darker)
    maskCopper: "#16603a", // solder mask over copper pour / covered traces (lighter)
    maskTrace: "#1c7044",  // covered decorative traces (a touch lighter than the pour)
    silk: "#efeee6",       // silkscreen ink
    edge: "#a7a26a",       // FR4 laminate edge
    metal: "#e7bf6a",      // exposed traces and pads (ENIG gold)
    pulse: "#8ff3ff",      // signal pulse (HDR in the shader)
    led: "#ff3b2e",        // LED colour when lit
    glow: "#9ff6ff",       // chip label glow when powered
  },
  blue: { maskBare: "#0c2350", maskCopper: "#173a7c", maskTrace: "#1d4590", silk: "#f2f2ec", edge: "#a7a26a", metal: "#e7bf6a", pulse: "#ffd27a", led: "#ffb12e", glow: "#ffe2a6" },
  black: { maskBare: "#0b0c0d", maskCopper: "#17191b", maskTrace: "#1d2023", silk: "#f0efe8", edge: "#8f8a5c", metal: "#e7bf6a", pulse: "#9fffc2", led: "#36ff7a", glow: "#b9ffd4" },
  red: { maskBare: "#4a0d0b", maskCopper: "#7a1714", maskTrace: "#8a1d19", silk: "#f3f1ea", edge: "#a7a26a", metal: "#d9d9dc", pulse: "#9fe9ff", led: "#ffffff", glow: "#c9f2ff" },
  purple: { maskBare: "#24123f", maskCopper: "#3c1f6a", maskTrace: "#47267b", silk: "#f3f1ea", edge: "#a7a26a", metal: "#e7bf6a", pulse: "#a8ffd8", led: "#46ffb0", glow: "#c8ffe6" },
  copper: { maskBare: "#0a3d22", maskCopper: "#16603a", maskTrace: "#1c7044", silk: "#efeee6", edge: "#a7a26a", metal: "#d98a5c", pulse: "#ffe08a", led: "#ffcf3a", glow: "#fff0b8" },
};

export const STYLE_SPEC = {
  id: "circuit-board",
  name: "Circuit Board",
  description:
    "A macro photograph of a real printed circuit board: deep matte-satin solder mask over copper pours, glossy gold traces and pads, white silkscreen lettering, black chips with gull-wing pin rows, tiny resistors, capacitors and LEDs, shallow depth of field and one low raking light. Signals travel as bright pulses along octilinear traces through vias; each part powers up when a pulse reaches it (LED lights, chip label glows, a silkscreen caption prints itself) while the camera tracks the pulse at macro scale.",
  palettes: PALETTES,
  palette: {
    ...PALETTES.green,
    bg: "#0b0c0d",
    bench: "#141517",
    epoxy: "#161718",
    chipInk: "#8d9096",
    tin: "#c9ccd1",
    ceramic: "#b98f5f",
    resistor: "#1b1b1c",
    ledBody: "#ece8dc",
    ledLens: "#f6efd9",
    ink: "#efeee6",
    primary: "#16603a",
    secondary: "#e7bf6a",
    accent: "#8ff3ff",
  },
  world: {
    background: "#0b0c0d",
    environment: "room",        // something for gold, tin and the mask's satin coat to reflect
    environmentIntensity: 0.32,
    toneMapping: "neutral",     // keeps the mask green and the LED red saturated (ACES greys/whitens them)
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    // style.js gives `mask` the baked board canvas (map + roughness/bump) — the colour here is a fallback
    mask: { type: "physical", baseColor: "#ffffff", roughness: 1.0, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.32 },
    edge: { type: "standard", baseColor: "#a7a26a", roughness: 0.8, metalness: 0 },
    metal: { type: "physical", baseColor: "#e7bf6a", roughness: 0.3, metalness: 1 },
    tin: { type: "standard", baseColor: "#a4a8ae", roughness: 0.36, metalness: 1 },
    epoxy: { type: "physical", baseColor: "#0f1011", roughness: 0.7, metalness: 0, clearcoat: 0.08, clearcoatRoughness: 0.6 },
    ceramic: { type: "standard", baseColor: "#b98f5f", roughness: 0.6, metalness: 0 },
    resistor: { type: "standard", baseColor: "#1b1b1c", roughness: 0.55, metalness: 0 },
    plastic: { type: "standard", baseColor: "#111214", roughness: 0.5, metalness: 0 },
    ledBody: { type: "standard", baseColor: "#ece8dc", roughness: 0.45, metalness: 0 },
    ledLens: { type: "physical", baseColor: "#d8c9b4", roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 },
    bench: { type: "standard", baseColor: "#141517", roughness: 0.85, metalness: 0 },
    hole: { type: "basic", baseColor: "#050505" },
  },
  lights: [
    // the low raking key: ~13° above the board from the left-front — long part shadows, glints on trace walls
    { id: "key", type: "directional", color: "#ffeedb", intensity: 2.6, position: [-7, 1.7, 3.2], target: [0, 0, 0],
      shadow: { softness: 2.5, mapSize: 4096, extent: 4.0, bias: -0.0003, normalBias: 0.01 } },
    // cool back rim from the right-rear: picks out chip edges, pins and silk
    { id: "rim", type: "directional", color: "#cfe0ff", intensity: 0.55, position: [6, 2.4, -5], target: [0, 0, 0] },
    { id: "fill", type: "hemisphere", color: "#a9b8c9", groundColor: "#120f0c", intensity: 0.45 },
  ],
  post: {
    bloom: { strength: 0.55, radius: 0.45, threshold: 2.0 }, // pulses, LEDs and lit chip labels only
    vignette: { darkness: 0.55, offset: 1.05 },
    grain: { amount: 0.01, fps: 30 },                       // dither only: the board texture is the grain
  },
  camera: { fov: 24, near: 0.05, far: 60, drift: { amp: 0.004, speed: 0.22 } },
  text: { font: "sans", weight: 600, color: "#efeee6", height: 0.12 },
  sfx: { enter: "blip", exit: "whooshOut", move: "whir", land: "click", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "A signal is a bright pulse with a short comet tail running along an exposed trace at constant speed; behind it the trace keeps a faint powered glow.",
    "Traces are octilinear (0/45/90°) with 45° chamfered corners; a via flashes as the pulse dives through it.",
    "When a pulse reaches a part it powers up: an LED lights and spills colour on the mask, a chip's silkscreen-style label glows, and a small silkscreen caption prints itself left to right.",
    "The camera is a macro lens: shallow depth of field, low angle, tracking the pulse across the board and settling on each part as it powers up; a final pull-back shows the whole lit path.",
  ],

  // ---- look numbers consumed by style.js / signals.js -------------------------------------------------
  board: {
    w: 6.4, d: 3.6, thickness: 0.16, corner: 0.18,
    pxPerMetre: 900,        // colour canvas density (macro shots see ~1.6 m across: ≈1:1 at 1080p)
    bumpPerMetre: 420,      // bump/roughness canvas density
    bumpScale: 1.6,         // mask relief over covered traces + raised silkscreen
    pourInset: 0.14,        // copper pour keeps this far from the board edge
    clearance: 0.035,       // mask gap around exposed copper (traces, pads)
    decoTraces: 46,         // covered decorative traces (seeded)
    decoWidth: [0.022, 0.05],
    mottle: 0.05,           // mask colour mottling (low-frequency)
    roughness: { bare: 0.42, pour: 0.5, trace: 0.56, silk: 0.95 }, // 0..1, written into the bump canvas (roughnessMap uses G)
    height: { bare: 0.3, pour: 0.42, trace: 0.55, silk: 0.85 },
    holes: { r: 0.11, ring: 0.2, inset: 0.3 },  // plated mounting holes in the corners
    fiducial: { r: 0.05, clear: 0.11 },
  },
  trace: { width: 0.045, height: 0.008, topInset: 0.16, chamfer: 0.1 },
  via: { drill: 0.022, ring: 0.05 },
  pad: { height: 0.006 },
  pulse: {
    tail: 0.42,            // comet tail length (m)
    intensity: 4.5,        // HDR multiplier of the pulse colour at the head
    halo: 2.4,             // ribbon width × trace width (soft glow either side of the trace)
    afterglow: 0.16,       // powered trace level behind the head
    speed: 1.7,            // m/s default
    light: { intensity: 0.22, distance: 0.7, height: 0.09, pool: 5 }, // spill lights (fixed pool: no shader recompiles)
    viaFlash: { radius: 0.14, intensity: 3, dur: 0.35 },
  },
  chip: {
    pinThickness: 0.01, pinReach: 0.15, padOut: 0.11, padLen: 0.15, padWidthFrac: 0.55,
    corner: 0.015, labelCap: 0.085, labelStroke: 0.13,
    glow: { strength: 3.2, idle: 0.0 },
  },
  passive: { length: 0.2, width: 0.125, height: { resistor: 0.05, capacitor: 0.08 }, cap: 0.04, padLen: 0.1, padWidth: 0.15 },
  led: { length: 0.2, width: 0.125, body: 0.03, lens: 0.05, strength: 1.0, light: 0.1 },
  header: { pitch: 0.254, pin: 0.064, pinHeight: 0.62, base: 0.25, pad: 0.17, drill: 0.1 },
  silk: { cap: 0.12, stroke: 0.15, color: "#efeee6", pxPerMetre: 1400, wipe: 0.55, edgeGlow: 0.6 },
  dof: { aperture: 0.0042, maxblur: 0.008 },
};
