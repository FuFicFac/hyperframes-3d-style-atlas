// styles/wam-house/spec.js — STYLE_SPEC for "Why AI Matters — House": the channel's branded 3D package
// (idents, lower thirds, chapter cards, key stats, quotes, end cards). Plain data only (JSON-safe, no THREE,
// no window). Units: metres, Y-up, sRGB hex, radians, three.js light units. Palette = the channel's historical
// defaults (youtube-video-builder SKILL.md): navy #0a1424, green #39d98a, blue #3b7bff, paper #f2ecdf, red #ff5d4f.

export const STYLE_SPEC = {
  id: "wam-house",
  name: "Why AI Matters — House",
  description:
    "The Why AI Matters channel package: a deep-navy newsroom studio with a faint floor grid, horizon line, haze and a reflective floor; extruded League Gothic capitals with paper faces and green/blue rim-lit bevels that rise letter by letter out of THE RULE (one thick electric-green bar that always draws on first and becomes plinth, underline, divider and progress bar); warm paper cards with serif headlines and Space Mono metadata; red reserved for the one thing that matters most; quick whip-pans between sets and rock-steady holds.",
  palette: {
    bg: "#0a1424",       // navy (brand)
    navyDeep: "#060d18",
    floor: "#0d1a2f",
    grid: "#1c3156",
    green: "#39d98a",    // THE RULE — the only green device
    blue: "#3b7bff",     // secondary light / "WHY" in the mark
    paper: "#f2ecdf",    // display faces, cards
    paperShade: "#ddd4c0",
    ink: "#0a1424",      // type on paper
    inkSoft: "#4a5568",
    red: "#ff5d4f",      // ≤ once per frame: the single most important thing
    mute: "#8fa0bb",     // secondary mono on navy
    primary: "#f2ecdf",
    secondary: "#3b7bff",
    accent: "#39d98a",
  },
  // Font stacks are ONE setting each. League Gothic + Space Mono are embedded by the HyperFrames compiler when
  // index.html CSS names them (see `fonts.css`); the serif is a SYSTEM fallback for Newsreader (not used: it was
  // not in the renderer's font cache). To switch to Newsreader: put "Newsreader" first in `serif` and in fonts.css.
  fonts: {
    display: '"League Gothic", "Arial Narrow", "Helvetica Neue", sans-serif',
    mono: '"Space Mono", Menlo, "Courier New", monospace',
    serif: '"Iowan Old Style", Georgia, "Times New Roman", serif',
    css: ["League Gothic", "Space Mono"],   // families index.html must reference so the compiler embeds them
    load: ['400 128px "League Gothic"', '400 64px "Space Mono"', '700 64px "Space Mono"'],
    loadTimeout: 4000,
  },
  world: {
    background: "#0a1424",
    fog: { color: "#0a1424", near: 16, far: 44 },
    environment: null,            // style.js bakes a branded procedural studio (see `studio`)
    toneMapping: "neutral",       // palette must read as designed (paper stays paper, green stays green)
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    face: { type: "standard", baseColor: "#f2ecdf", roughness: 0.55, metalness: 0, emission: { color: "#f2ecdf", strength: 0.2 } },
    faceBlue: { type: "standard", baseColor: "#3b7bff", roughness: 0.5, metalness: 0, emission: { color: "#3b7bff", strength: 0.18 } },
    faceGreen: { type: "standard", baseColor: "#39d98a", roughness: 0.5, metalness: 0, emission: { color: "#39d98a", strength: 0.18 } },
    faceRed: { type: "standard", baseColor: "#ff5d4f", roughness: 0.5, metalness: 0, emission: { color: "#ff5d4f", strength: 0.12 } },
    side: { type: "physical", baseColor: "#16243f", roughness: 0.28, metalness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.15 },
    rule: { type: "standard", baseColor: "#39d98a", roughness: 0.35, metalness: 0, emission: { color: "#39d98a", strength: 0.85 } },
    paper: { type: "standard", baseColor: "#f2ecdf", roughness: 0.85, metalness: 0 },
    paperEdge: { type: "standard", baseColor: "#d9cfba", roughness: 0.9, metalness: 0 },
    floor: { type: "physical", baseColor: "#0d1a2f", roughness: 0.62, metalness: 0 },
  },
  // Lights FOLLOW the active set (style.lightsAt(x)); positions are relative to the set centre.
  lights: [
    { id: "key", type: "directional", color: "#fff3e4", intensity: 2.5, position: [-3.5, 7.5, 9], target: [0, 0.8, 0],
      shadow: { softness: 7, mapSize: 2048, extent: 7.5, bias: -0.0005, normalBias: 0.03 } },
    { id: "fill", type: "hemisphere", color: "#3a5a96", groundColor: "#0a1424", intensity: 0.55 },
    { id: "rimGreen", type: "spot", color: "#39d98a", intensity: 260, position: [-6.5, 4.2, -4.5], target: [0, 0.8, 0], angle: 0.62, penumbra: 0.85, distance: 40, decay: 2 },
    { id: "rimBlue", type: "spot", color: "#3b7bff", intensity: 320, position: [6.5, 4.0, -4.5], target: [0, 0.8, 0], angle: 0.62, penumbra: 0.85, distance: 40, decay: 2 },
    { id: "wash", type: "spot", color: "#9fb4dc", intensity: 60, position: [0, 9, -2], target: [0, 0, -9], angle: 0.7, penumbra: 1, distance: 40, decay: 2 },
  ],
  post: {
    bloom: { strength: 0.42, radius: 0.55, threshold: 0.95 }, // the rule's emission and rim glints bloom; paper faces stay under
    vignette: { darkness: 0.5, offset: 1.05 },
    grain: { amount: 0.018, fps: 30 },                        // dither for the navy gradients (keeps H.264 from banding)
  },
  camera: { fov: 30, near: 0.3, far: 120, drift: { amp: 0, speed: 0 } }, // holds are rock steady: no drift
  text: { font: "display", weight: 400, color: "#f2ecdf", height: 0.6 },
  sfx: { enter: "whoosh", exit: "whooshOut", move: "whoosh", land: "thud", emphasis: "chime", ui: "tick", bed: "pad", logo: "blip" },
  motion: [
    "THE RULE draws on first (outExpo, ~0.4 s, left → right); every other element keys off its end time.",
    "Display capitals rise out of the rule's top face, one by one (55 ms stagger, 0.5 s, back-out with ~6 % overshoot), clipped at the slot.",
    "Set changes are whip-pans: an 18 m lateral truck in 0.45 s (inOutExpo) with a horizontal motion-blur pass, then a 0.5 m dolly-in that settles in 0.6 s.",
    "Holds are locked off: no drift, no float. Paper cards flip in on a stiff spring and land square to camera.",
    "Overlay UI (lower third, data labels, sample tags) is drawn 1:1 at screen pixels: rule draws, plate unfolds from it, mono types on.",
  ],

  // ---- look numbers consumed by style.js ----------------------------------------------------------------
  set: {
    spacing: 18,                 // metres between sets along +X (whip-pan distance)
    floor: { width: 150, depth: 60, height: 22, radius: 10, centerX: 36 },
    gridCell: 1.0,               // floor grid pitch (m)
    gridLine: 0.035,             // line width as a fraction of a cell
    grid: { bg: "#0d1a2f", line: "#1f3a66", major: 4, majorLine: "#2a4c82" },
    horizon: { z: -17, width: 160, thickness: 0.05, color: "#4f7fd6", strength: 1.6, glow: 0.22 },
    haze: [  // soft additive light pools behind each set (relative to the set centre)
      { pos: [-4.5, 2.6, -9], size: [13, 7], color: "#3b7bff", opacity: 0.16 },
      { pos: [5.0, 1.8, -8], size: [11, 6], color: "#39d98a", opacity: 0.07 },
      { pos: [0, 4.5, -12], size: [22, 9], color: "#1f3f7a", opacity: 0.22 },
    ],
  },
  studio: {   // procedural environment for reflections on bevels: brand-coloured strips in a navy room
    size: 128, sigma: 0.02, quantum: 0.002,
    room: { w: 30, h: 16, d: 30, color: "#05090f" },
    panels: [
      { id: "top", kind: "softbox", size: [8, 3], pos: [0, 7, 4], intensity: 0.9, color: "#fff3e4", soft: 0.3 },
      { id: "greenStrip", kind: "strip", size: [0.6, 7], pos: [-8, 3, -6], intensity: 2.6, color: "#39d98a", soft: 0.3 },
      { id: "blueStrip", kind: "strip", size: [0.6, 7], pos: [8, 3, -6], intensity: 3.0, color: "#3b7bff", soft: 0.3 },
      { id: "horizon", kind: "strip", size: [24, 0.3], pos: [0, 0.6, -13], intensity: 1.2, color: "#6f96e6", soft: 0.4 },
    ],
    sweep: { size: [1, 1], radius: 9, from: 0.1, to: 2.7, intensity: 0, color: "#ffffff", soft: 0.3, edgeFade: 0.1 },
    sweepLight: { intensity: 0, color: "#ffffff" },
  },
  floor: {
    resolution: 0.5, strength: 0.42, facing: 0.14, blur: 3.6, fade: [2.5, 9], envIntensity: 0.05, specular: 0.2,
  },
  type: {                      // extruded display capitals
    tracePx: 420,              // glyph raster size for outline tracing (px per em)
    simplify: 1.1,             // RDP tolerance in raster px
    depth: 0.3,                // extrusion as a fraction of cap height
    bevel: 0.02,               // bevel size as a fraction of cap height (grows OUTWARD: the face keeps the true outline)
    bevelSegments: 2,
    tracking: 0.035,           // extra letter spacing (× cap height)
    crease: 0.3,               // radians: normals smoothed below this angle (keep < bevel step angle so faces stay flat)
    rise: { stagger: 0.055, dur: 0.5, overshoot: 1.25, sink: 0.35 },
  },
  rule: {                      // THE RULE (3D): a low bevelled bar, emissive green; letters stand on it
    height: 0.14, depth: 0.62, overhang: 0.22, bevel: 0.025, draw: 0.42,
  },
  card: {                      // paper slabs
    thickness: 0.07, radius: 0.06, pxPerMetre: 400, flip: { stiffness: 210, damping: 19 },
    fibre: 0.018, grain: 0.025, seed: 11, selfLit: 0.32,
  },
  whip: { dur: 0.45, settle: 0.6, dolly: 0.55, blur: 0.65, taps: 16 }, // blur = shutter fraction (frame-widths moved × blur)
  overlay: {                   // screen-pixel UI (1:1, exact colours, never blurred)
    safe: 0.05,                // title-safe margin (fraction of each dimension)
    monoPx: 44, monoTracking: 0.14, tickPx: 10,
    lowerThird: { x: 132, y: 742, namePx: 112, subPx: 38, ruleH: 12, padX: 30, gap: 0 },
    bug: { x: 132, y: 92, px: 64 },
  },
  stat: { decimals: 1, countDur: 1.15, ease: "outCubic" },
  // the channel's sonic logo: four kit `blip` notes rising in a sus4 shape (C5 F5 G5 C6) + a soft chime and
  // low thud on the last note. dt in seconds from the logo start; the plan module turns it into SCORE events.
  sonicLogo: [
    { dt: 0.0, type: "blip", pitch: 0.5946, notes: [0], dur: 0.09, gain: 0.32 },
    { dt: 0.16, type: "blip", pitch: 0.5946, notes: [5], dur: 0.09, gain: 0.3 },
    { dt: 0.32, type: "blip", pitch: 0.5946, notes: [7], dur: 0.09, gain: 0.32 },
    { dt: 0.56, type: "blip", pitch: 0.5946, notes: [12], dur: 0.22, gain: 0.36 },
    { dt: 0.56, type: "chime", pitch: 1.189, dur: 1.4, gain: 0.16 },
    { dt: 0.56, type: "thud", pitch: 0.8, dur: 0.5, gain: 0.5 },
  ],
  bed: { root: 55, chord: [0, 7, 12, 15, 19], brightness: 520, gain: 0.55 },
};
