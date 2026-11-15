// styles/multiplane-cel/spec.js — STYLE_SPEC for "Multiplane Cel". Plain data only: JSON-serializable, no THREE, no
// window. Importable from Node (export-spec.mjs, scene.config.js for the shot plan + score) and the browser.
// Units: metres. Rig axes: panes are horizontal (XZ), stacked up +Y; the rig camera looks straight DOWN; the top of the
// picture is -Z. A picture coordinate (u, v) is u = -1..1 across the frame width and v = -1..1 up the frame height as
// seen from the reference lens (multiplane.js refFrame); each layer is painted in those coordinates, so a layer lower
// in the stack is painted physically larger, exactly like a real multiplane background.
//
// The look: hand-painted gouache storybook layers (sky, far hills, meadow + cottage, a tree grove, an inked cel bird
// animated on twos, dark foreground foliage) on six glass panes in a steel rig with lamps between the shelves, peg
// bars on every tray and a film camera looking down from the top. Inside the picture everything is flat paint; pulled
// back, it is a lit machine on a studio floor.

export const STYLE_SPEC = {
  id: "multiplane-cel",
  name: "Multiplane Cel",
  description:
    "Classic hand-painted cel animation shot on a multiplane camera: a storybook landscape painted in flat gouache with visible brush strokes (sky, far hills, a meadow with a path and a cottage, a tree grove, dark foreground foliage) and one inked-and-painted cel bird animated on twos, each layer on its own sheet of glass. Inside the picture the camera pushes down through the stack and the layers part with strong parallax; pulled back, the truth: a vertical steel rig of six glass panes with lamps between the shelves, peg bars on every tray and a film camera looking straight down from the top. Sliding one pane sideways changes the picture (a grove slides off and reveals the cottage). Flat unlit paint, crisp black ink and flat colour on the cel with a soft cel shadow, faint glass sheen and a few dust specks.",
  palette: {
    bg: "#ece4d4",
    wall: "#efe6d3",
    floor: "#b98d5f",
    steel: "#7d858d",
    steelDark: "#4b5157",
    brass: "#c29a52",
    lamp: "#ffd9a0",
    glassEdge: "#a9d8c8",
    ink: "#1d1712",
    skyTop: "#8fbfe2",
    skyMid: "#bcdcee",
    skyLow: "#f6e7c6",
    cloud: "#fbf7ee",
    cloudShade: "#c9d6e6",
    sun: "#fff1b8",
    hillFar: "#a7b4d8",
    hillNear: "#86ad9b",
    meadow: "#a9c768",
    meadowDeep: "#78a254",
    path: "#e4c58f",
    wallCream: "#f2e3c3",
    wallShade: "#d3bd96",
    roof: "#c2523b",
    roofDark: "#8f3527",
    window: "#f8d468",
    trunk: "#6b4a33",
    leaf: "#4f8046",
    leafLight: "#86b35c",
    leafDark: "#2f5a37",
    fern: "#2d5636",
    fernLight: "#5f8e4c",
    flowerRed: "#e0533a",
    flowerWhite: "#fbf5e6",
    flowerYellow: "#f3c843",
    bird: "#3f7fc4",
    birdShade: "#2c5e98",
    birdBelly: "#f7e6c4",
    beak: "#f29a2e",
    caption: "#f6ecd4",
    captionInk: "#2b2118",
  },
  world: {
    background: "#ece4d4",
    sky: null,
    fog: null,
    environment: "room",
    environmentIntensity: 0.7,
    toneMapping: "neutral",
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {
    steel: { type: "physical", baseColor: "#7d858d", roughness: 0.38, metalness: 0.75, clearcoat: 0.2, clearcoatRoughness: 0.4 },
    steelDark: { type: "standard", baseColor: "#4b5157", roughness: 0.5, metalness: 0.6 },
    brass: { type: "standard", baseColor: "#c29a52", roughness: 0.3, metalness: 1 },
    camBody: { type: "standard", baseColor: "#33383e", roughness: 0.45, metalness: 0.4 },
    camTrim: { type: "standard", baseColor: "#d9d2c4", roughness: 0.5, metalness: 0.1 },
    lens: { type: "physical", baseColor: "#15181c", roughness: 0.15, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 },
    lampHousing: { type: "standard", baseColor: "#3c4247", roughness: 0.5, metalness: 0.5 },
    lampStrip: { type: "standard", baseColor: "#fff2d8", roughness: 0.6, metalness: 0, emission: { color: "#ffd9a0", strength: 2.6 } },
    glassEdge: { type: "standard", baseColor: "#5f9c8c", roughness: 0.15, metalness: 0, opacity: 0.5 },
    floor: { type: "standard", baseColor: "#ffffff", roughness: 0.62, metalness: 0, map: { source: "wood", size: 1024, boards: 6, seed: 66, grainFreq: 18, contrast: 0.35, dark: "#9a6f45", mid: "#b98d5f", light: "#cfa77a", seam: "#7a5434", repeat: [4, 4], description: "light oak floorboards" } },
    wall: { type: "standard", baseColor: "#efe6d3", roughness: 0.92, metalness: 0 },
  },
  lights: [
    { id: "fill", type: "hemisphere", color: "#fff8ee", groundColor: "#a08a6c", intensity: 1.25 },
    {
      // soft high key from front-left: lights the steel and throws the rig's shadow back-right on the floor
      id: "key", type: "directional", color: "#fff1dc", intensity: 2.0, position: [-6, 11, 7], target: [0, 1.5, 0],
      shadow: { softness: 3, mapSize: 2048, extent: 6.5, near: 1, far: 40, bias: -0.0005, normalBias: 0.02 },
    },
    { id: "rim", type: "directional", color: "#dbe6ff", intensity: 0.6, position: [6, 6, -8], target: [0, 2, 0] },
  ],
  post: {
    bloom: { strength: 0.3, radius: 0.45, threshold: 2.2 },    // only the lamp strips (emission 2.6) bloom; paint (<= 1) never does
    vignette: { darkness: 0.22, offset: 1.15 },
  },
  camera: { fov: 38, near: 0.05, far: 60, drift: { amp: 0, speed: 0.2 } },   // the shot plan (multiplane.js) owns the camera
  text: { font: "serif", weight: 700, color: "#2b2118", height: 0.3 },

  // ---- the rig --------------------------------------------------------------------------------------------
  rig: {
    pane: { w: 7.2, d: 4.0, thick: 0.02 },     // glass sheet (wide: the rig must read wide in a 16:9 frame)
    levels: 6,
    baseY: 0.95,                                // bottom (sky) pane height
    gap: 0.30,                                  // shelf spacing
    lensY: 3.8,                                 // reference lens height (picture coords are defined from here)
    post: 0.12,                                 // square steel post
    postX: 3.7, postZ: 2.1,                     // post centres
    topY: 4.55,                                 // top of the posts (the camera hangs from a bridge here)
    plinth: { y: 0.62, h: 0.14, legs: 0.62 },   // platform the stack stands on
    tray: 0.05,                                 // steel tray border width
    lamp: { len: 3.4, r: 0.07 },                // lamp bars between the shelves (both sides)
    peg: { len: 1.1, pegs: 3 },
  },
  picture: { fov: 50, aspect: 16 / 9 },          // the reference lens' view (a wide lens: strong parallax); layer art is laid out in its frame

  // ---- the painting ----------------------------------------------------------------------------------------
  // layers bottom -> top. margin = how far past the reference frame (in frame halves) each layer is painted;
  // px = canvas width. "full" paints the whole pane (the sky backing).
  layers: [
    { id: "sky", full: true, px: 4096 },
    { id: "hills", margin: 1.15, px: 3584 },
    { id: "meadow", margin: 1.15, px: 3584 },
    { id: "grove", margin: 1.2, px: 3584 },
    { id: "cel", margin: 1.0, px: 0 },          // the bird is its own small cel (atlas), not a full layer
    { id: "foliage", margin: 1.12, px: 3584 },
  ],
  gouache: {
    strokeLen: [26, 70],      // px at canvas scale 2048
    strokeWid: [7, 16],
    strokeAlpha: [0.16, 0.34],
    coverage: 0.9,            // strokes per area ~ coverage * area / (len * wid)
    lightJitter: 0.07,        // +/- lightness of each stroke
    edgeDark: 0.12,           // darker brush edge around shapes
    seed: 66,
  },
  cel: {
    poses: 8,                 // wing-cycle drawings
    fps: 15,                  // on twos
    size: 0.30,               // bird width as a fraction of the frame height (v units)
    ink: 7,                   // ink line width (px in a 512 px cell)
    shadow: { offset: [0.035, -0.05], alpha: 0.32, blur: 9 },   // soft cel shadow (picture units, px blur)
  },
  glass: { alphaFace: 0.012, alphaRim: 0.2, fresnelPower: 3, rimStrength: 0.1, sheen: 0.06, dust: 46 },

  // ---- overlay caption (exact colours) --------------------------------------------------------------------
  caption: {
    x: 960, y: 912, h: 84, cap: 38, maxW: 820,
    font: 'Georgia, "Times New Roman", serif', weight: 700, italic: true,
    plate: "#f6ecd4", edge: "#7a5a3a", ink: "#2b2118",
  },

  sound: {
    bed: { gain: 0.8, root: 196, chord: [0, 7, 12, 16], brightness: 950, attack: 0.35, release: 2.4 },
    box: { gain: 0.34, hz: 784, decay: 1.4, bright: 0.55 },     // music-box pluck phrases at the beats
    chirp: { gain: 0.16, pitch: 3.2 },
    flap: { gain: 0.07, dur: 0.11 },
    push: { gain: 0.32 },
    rig: { hum: 0.07, clack: 0.36, whir: 0.18, thud: 0.3 },
  },
  sfx: { enter: "pluck", exit: "whooshOut", move: "whoosh", land: "clack", emphasis: "chime", ui: "tick", bed: "pad" },
  motion: [
    "Inside the picture the camera only moves straight down the stack (and trucks a little): each pane's image grows by lensDist0 / lensDist(t), so near panes part fast and far panes barely move — the multiplane parallax, not a 3D landscape.",
    "The cel bird is drawn on twos: 8 wing drawings in an atlas, pose = floor(t * 15) mod 8, and its position on the cel is also held for two frames.",
    "Pull back = rise straight up (the picture shrinks inside the steel frame), then swing out to a high three-quarter view of the whole rig.",
    "One tray slides sideways on its rails with a hand wheel; back inside the picture, that layer has moved and the composition changed.",
  ],
};
