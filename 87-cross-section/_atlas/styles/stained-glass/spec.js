// styles/stained-glass/spec.js — STYLE_SPEC for "Stained Glass": a cathedral leaded window seen from a dim stone
// interior. Coloured glass panes in dark lead came, lit from behind; the light pours through as coloured shafts and lands
// as coloured patches on the flagstones. Plain data only (JSON-serializable, no THREE, no window).
// Units: metres, Y-up, sRGB hex, radians (degrees where named *Deg), three.js light units.

export const STYLE_SPEC = {
  id: "stained-glass",
  name: "Stained Glass",
  description:
    "A cathedral leaded window seen from a dim stone nave: coloured glass panes (thickness variation, seeds/bubbles, ripple, darker edges at the lead) held in dark lead came with soldered joints and iron saddle bars, set in a splayed stone reveal; lit from behind, the window throws coloured light shafts through dusty air and coloured patches (lead lines and all) across the flagstones. An image is assembled pane by pane, the light comes up behind it, and each region glows as it is named while the sun moves.",
  palette: {
    bg: "#0b0a09",
    stone: "#8a8073",
    stoneDark: "#3b362f",
    mortar: "#2a2620",
    floor: "#6f665a",
    lead: "#2b2a29",
    ink: "#f2e6c9",
    inkDim: "#b9a988",
    primary: "#2c5fc0",
    secondary: "#c0242e",
    accent: "#f0b21c",
  },
  world: {
    background: "#0b0a09",
    fog: { color: "#0b0a09", near: 18, far: 40 },
    environment: null,
    toneMapping: "neutral",          // glass hues must read as designed (ACES desaturates the saturated emissive glass)
    exposure: 1.0,
    shadowType: "pcf",
  },
  materials: {
    stone: { type: "standard", baseColor: "#8a8073", roughness: 0.92, metalness: 0 },
    floor: { type: "standard", baseColor: "#7a7064", roughness: 0.85, metalness: 0 },
    lead: { type: "standard", baseColor: "#2b2a29", roughness: 0.42, metalness: 0.65 },
    iron: { type: "standard", baseColor: "#1c1b1a", roughness: 0.6, metalness: 0.5 },
  },
  lights: [
    { id: "room", type: "hemisphere", color: "#8e94a6", groundColor: "#1a1510", intensity: 0.95 },
    // dim cool fill from the nave (camera side) so the stone reads before the window lights up
    { id: "fill", type: "spot", color: "#9aa6c4", intensity: 260, position: [5, 7, 14], target: [0, 2.6, 0], angle: 0.6, penumbra: 1, distance: 40, decay: 2,
      shadow: { softness: 5, mapSize: 1024, bias: -0.0005, normalBias: 0.03 } },
  ],
  post: {
    bloom: { strength: 0.4, radius: 0.55, threshold: 1.25 },  // lit glass (HDR 1.5–3) blooms; stone and the floor patches mostly do not
    vignette: { darkness: 0.55, offset: 1.05 },
    grain: { amount: 0.012, fps: 30 },                          // dither only (dark stone gradients band without it)
  },
  camera: { fov: 36, near: 0.3, far: 60, drift: { amp: 0.02, speed: 0.22 } },
  text: { font: "serif", weight: 400, color: "#f2e6c9", height: 0.3 },
  sfx: { enter: "tick", exit: "whooshOut", move: "whoosh", land: "tick", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "The lead came is laid first: every came grows along its edge (bottom up, frame first), soldered joints appear as the lines meet.",
    "Panes are SET into the leading one by one: each flies in from the nave side, turns and settles flat into its cell (one glass tick per bin).",
    "The light comes up behind the glass: the whole window glows, shafts appear in the dusty air, coloured patches land on the floor.",
    "Each region glows brighter as it is named, then settles; the sun moves slowly so shafts and floor patches sweep.",
  ],

  // ---- look numbers consumed by style.js ------------------------------------------------------------------
  // Glass tones (sRGB): palette keys used by glazing.js figures and fields.
  tones: {
    skyA: "#1d4fb4", skyB: "#2a62c8", skyC: "#3d76d6", skyD: "#173f98", skyE: "#5a86d8",
    sunA: "#ffc21a", sunB: "#ff9f12", ray: "#ffd65a",
    cloudA: "#e6ecf2", cloudB: "#cfdbe8", cloudC: "#dfe6ee", drop: "#6fd0ff",
    leafA: "#2f9a3c", leafB: "#58b83a", leafC: "#1f7a3a", leafD: "#8cc63f",
    barkA: "#7a4a22", barkB: "#93592a",
    soilA: "#6b3a1c", soilB: "#8a5226", soilC: "#a5672a", soilD: "#5a3218", root: "#e09a2c",
    ruby: "#c0242e", rubyB: "#9e1a2a", gold: "#f0b21c", skin: "#f3c9a0", violet: "#6b3fa8", white: "#eef0e8",
  },
  glass: {
    gain: 2.5,              // HDR gain of fully lit glass (× tone × level); > bloom threshold for bright tones
    ambient: 0.03,          // unlit glass seen from the dim nave (fraction of its tone)
    sheen: 0.05,            // faint interior reflection on the unlit glass
    edgeWidth: 0.07,        // m: darkening band next to the lead
    edgeDark: 0.35,         // transmission at the lead edge (1 = no darkening)
    thick: 0.35,            // thickness variation (deeper colour + darker where thick)
    thickScale: 2.2,        // 1/m: thickness noise frequency
    ripple: 0.12, rippleFreq: 26,   // streaky ripple (seeded direction per pane)
    bubbles: 0.6, bubbleScale: 34, bubbleCover: 0.16,   // seeds/bubbles: bright cores with dark rims
    setDur: 0.55, setFly: 0.9, setTurn: 0.6, setScale: 0.55,  // a pane's flight into its cell (s, m toward the nave, rad, start scale)
    pre: 0.03,              // backlight before the light comes up
  },
  lead: { width: 0.042, depth: 0.03, frameWidth: 0.085, frameDepth: 0.05, barWidth: 0.05, barDepth: 0.06, joint: 0.034 },
  window: {
    glassZ: -0.42,          // glass plane behind the inner wall face (z = 0)
    splay: 0.42,            // m: the reveal widens toward the nave
    sill: 1.25,             // window sill height above the floor
    cookie: [640, 800],
    outside: "#4a5468",     // the dim daylight seen through the empty leading (sRGB, unlit)     // light-cookie render size (the window as seen by the sun)
  },
  room: { width: 22, depth: 22, height: 11, block: [0.92, 0.46], flag: [1.1, 0.8], seed: 4 },
  shafts: {
    steps: 34, density: 0.085, gain: 1.0, lod: 2.2,     // raymarched shafts (cookie mip lod: softer than the floor)
    dust: 0.55, dustScale: 1.4, dustDrift: [0.05, 0.02, 0.03],   // motes/haze modulation (slow, pure f(t))
    forward: 1.6,           // extra brightness looking toward the window (forward scattering)
    box: [[-8, 0, 0], [8, 8, 11]],
  },
  floorLight: { gain: 3.2, lod: 0.6, wall: 0.0 },
  spill: { intensity: 18, distance: 14, pos: [0, 3.6, 2.2], floorIntensity: 2.2, floorDistance: 8, floorHeight: 1.6 },
  overlay: {
    font: "serif", px: 50, tracking: 6, color: "#f4e8cc", sub: "#b9a988",
    rule: "#4a4540", ruleWidth: 3, quarry: 13,
    fadeDur: 0.45, outDur: 0.4, rise: 10,
  },
};
