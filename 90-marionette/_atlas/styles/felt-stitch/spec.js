// styles/felt-stitch/spec.js — STYLE_SPEC for "Felt & Stitch". Plain data only: JSON-serializable,
// no THREE, no window. Importable from Node (export-spec.mjs) and the browser.
// Units: metres. The set is a felt story board modelled ~26x (a 50 cm board = 13 m), so 3.5 mm felt is
// ~0.09 m thick and embroidery floss (~1 mm) is a ~0.03 m thread. Y-up, the board is the XY plane at z = 0
// facing +Z (the camera); pieces are layered toward +Z. sRGB hex, radians, three.js light units.
//
// The look: a handmade felt craft world. Shapes cut from thick wool felt (soft, matte, fibre-mottled, a
// fuzzy halo at the silhouette, pillowy rounded cut edges), appliquéd in layers onto a felt backdrop and
// held down with visible embroidery stitches (running, blanket, cross, satin, backstitch lettering) in
// contrasting floss. Buttons, beads, sequins, pom-poms and ric-rac as details. Motion is stop-motion on
// twos: pieces flop and settle like fabric, are "sewn on" stitch by stitch, characters hop with a soft squash.

export const STYLE_SPEC = {
  id: "felt-stitch",
  name: "Felt & Stitch",
  description:
    "A handmade felt story board: thick wool-felt cut-outs with fuzzy edges, layered and appliquéd onto a felt backdrop, held down with raised embroidery stitches in contrasting floss, plus buttons, beads and pom-poms; animated on twos with floppy fabric settles and stitch-by-stitch sewing.",
  palette: {
    bg: "#24504f",
    board: "#2f6a68",       // backdrop felt (deep teal)
    boardDark: "#24504f",
    frame: "#5e3354",       // plum border band
    cream: "#f3e6cc",
    oat: "#e3d0ac",
    mustard: "#e3a630",
    mustardDark: "#b98221",
    coral: "#e8664f",
    coralDark: "#bb4a3a",
    teal: "#3f9a92",
    tealLight: "#8ccbbf",
    forest: "#2f6a3f",
    leaf: "#5c9c4a",
    plum: "#6b3a60",
    plumLight: "#a56a96",
    blush: "#f19a9a",
    sky: "#7eb4d8",
    cocoa: "#7a4a32",
    ink: "#2b2230",         // never pure black: dark aubergine felt / floss
    white: "#fbf6ec",
    silver: "#c9ccd2",
  },
  world: {
    background: "#24504f",
    environment: "room",
    environmentIntensity: 0.18,  // only for the needle / bead / sequin glints; felt is roughness 1
    toneMapping: "neutral",      // keep the felt palette as designed (ACES greys cream and mustard)
    exposure: 1.06,
    shadowType: "pcf",           // pcf so key shadow.softness applies
  },
  materials: {
    // felt template: every palette colour becomes a clone (materials["felt:<name>"]), patched with the
    // object-space fibre shader below (felt.fibre / felt.mottle) and given a velvet sheen.
    felt: { type: "physical", baseColor: "#ffffff", roughness: 1, metalness: 0, sheen: 1 },
    // embroidery floss template (vertex colours carry the floss colour x the twist stripes)
    floss: { type: "physical", baseColor: "#ffffff", roughness: 0.55, metalness: 0, sheen: 0.25, vertexColors: true },
    needle: { type: "physical", baseColor: "#d9dde3", roughness: 0.22, metalness: 1, clearcoat: 0.3 },
    bead: { type: "physical", baseColor: "#ffffff", roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 },
    button: { type: "physical", baseColor: "#ffffff", roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 },
    sequin: { type: "physical", baseColor: "#ffffff", roughness: 0.18, metalness: 0.85, iridescence: 0.8 },
    wood: { type: "standard", baseColor: "#c99a62", roughness: 0.55, metalness: 0, bump: { scale: 70, octaves: 2, seed: 9, strength: 0.25, description: "fine birch grain for the embroidery hoop" } },
  },
  // felt colours that get a material (materials["felt:<name>"] and materials[<name>])
  felts: ["board", "boardDark", "frame", "cream", "oat", "mustard", "mustardDark", "coral", "coralDark", "teal", "tealLight", "forest", "leaf", "plum", "plumLight", "blush", "sky", "cocoa", "ink", "white"],
  // felt surface (style.js patches it into every felt material: object space, no UVs)
  felt: {
    thickness: 0.09,        // cut-piece thickness (3.5 mm felt at 26x)
    bevel: 0.38,            // rounded cut edge, fraction of thickness (pillowy edge)
    cutJitter: 0.012,       // hand-cut outline wobble (m)
    cutJitterFreq: 1.6,     // wobbles per metre of outline
    curveSegments: 40,
    sheenColor: 0.42,       // sheen tint = felt colour lerped toward white by this much
    sheenRoughness: 0.55,
    fibre: { freq: 22, stretch: 5, bump: 0.0035, fine: 90, fineBump: 0.0012, sharp: 7, description: "short streaky fibres in four directions (freq per m, stretch along the fibre, ridge sharpness) + fine grain; bump heights in metres; object space" },
    mottle: { freq: 1.4, amount: 0.07, fibreTone: 0.11, description: "low-frequency dye/density mottling and light/dark fibre speckle (fraction of albedo)" },
    fuzz: { shells: 3, offset: 0.03, density: 0.36, freq: 140, brighten: 0.18, rimPower: 1.6, face: 0.16,
      description: "fuzzy halo: shells pushed out along smooth normals; alpha = fibre noise x fresnel (dense at silhouettes, a faint fibre haze on faces)" },
    stuffedPuff: 0.42,      // stuffed form puff height, fraction of the shorter half-size
    stuffedRings: 12,
  },
  // embroidery floss
  thread: {
    radius: 0.019,          // floss radius (m); embroidered text uses cap x text.threadRatio
    depthLift: 0.04,        // depth-only lift (m) so fuzz shells never haze over thread (see style.js)
    arch: 1.15,             // stitch arch above the surface, in radii
    sink: 0.9,              // how far the ends dip into the felt, in radii
    twist: 3.2,             // twist stripes per stitch-length metre of floss (x 1/radius scale)
    stripe: 0.2,            // stripe darkening (0 = plain thread)
    radial: 8, lengthSegs: 8,
    pucker: { size: 1.45, opacity: 0.32, description: "dark dimple decal where the thread enters the felt, in radii" },
    run: { len: 0.17, gap: 0.1 },        // running stitch
    blanket: { step: 0.17, depth: 0.15 },// blanket stitch along an edge
    cross: { size: 0.14 },
    satin: { spacing: 2.05 },            // satin-fill spacing in radii
    back: { len: 0.13, gapRatio: 0.12 }, // backstitch (lettering)
  },
  text: { font: "rounded", weight: 800, color: "#5e3354", height: 0.42, threadRatio: 0.085, letterSpacing: 0.34, wordSpacing: 0.62, lineHeight: 1.5, bendRadius: 0.12, feltWidth: 0.24 },
  lights: [
    { id: "ambient", type: "hemisphere", color: "#fff1de", groundColor: "#4a3a3a", intensity: 1.25 },
    // warm soft key, upper left and in front: gentle shadows between felt layers toward lower right
    { id: "key", type: "directional", color: "#ffe9cf", intensity: 2.5, position: [-6, 7.5, 11], target: [0.4, -0.4, 0],
      shadow: { softness: 6, mapSize: 4096, extent: 8.2, near: 2, far: 40, bias: -0.0004, normalBias: 0.02 } },
    { id: "fill", type: "directional", color: "#d8e6f2", intensity: 0.45, position: [9, -2, 8], target: [0, 0, 0] },
    // grazing rake from the top: lifts the felt fibre relief and the stitch arches
    { id: "rake", type: "directional", color: "#fff4e6", intensity: 0.75, position: [1, 10, 2.2], target: [0, 0, 0] },
  ],
  post: {
    vignette: { darkness: 0.32, offset: 1.08 },
    // no film grain: the felt fibres ARE the texture, and per-pose grain over a full-frame fibre field tripled the MP4 size
  },
  camera: { fov: 30, near: 0.5, far: 80, drift: { amp: 0.025, speed: 0.22 } },
  tuning: {
    fps: 15,                                   // pose rate for object motion (on twos); camera stays at 30
    flop: { from: -1.25, stiffness: 95, damping: 8.5 }, // lay-down: hinge angle (rad, toward camera) -> 0, soft underdamped
    peelDur: 0.42,
    hop: { height: 0.55, squash: 0.24, stretch: 0.14, anticipation: 0.13, settle: { stiffness: 210, damping: 10 } },
    wobble: { amp: 0.085, hz: 2.6 },          // "working" wobble (rad)
    stitchesPerSecond: 22,                     // default sewing speed
    needleDip: 0.11,                           // needle dips in/out once per stitch (m)
  },
  sfx: { enter: "thud", exit: "rustle", move: "whoosh", land: "thud", emphasis: "chime", ui: "tick", bed: "pad",
    pat: "thud(pitch 1.6) + paper(dense, low): soft fabric pat", pull: "whoosh(short, high, q 3) + tick: thread pull", box: "blip/chime: music-box notes" },
  motion: [
    "Object motion is quantised to 15 poses/s (on twos); the camera glides at 30 fps.",
    "Pieces arrive by flopping down onto the board from a hinge (soft underdamped settle) and leave by peeling up.",
    "Things are sewn on: a needle travels along the edge and stitches appear one by one (reveal = f(t)), a thread trailing from the eye.",
    "Characters hop with anticipation, a soft stretch and a squashy landing; while 'working' they wobble and shed little pom-poms and felt sparks.",
    "Paths between things are dashed running stitches sewn on first; items then travel along them.",
    "Labels are embroidered backstitch letters on felt patches (stroke font) or felt letter cut-outs; never flat type.",
  ],
};
