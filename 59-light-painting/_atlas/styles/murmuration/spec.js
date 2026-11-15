// styles/murmuration/spec.js — STYLE_SPEC for "Murmuration". Plain data only: JSON-serializable, no THREE, no window.
// Importable from Node (export-spec.mjs, scene.config.js for the flock plan + score) and the browser.
// Units: metres (the flock is ~30 m across, seen from ~32 m), Y-up, sRGB hex, radians.
//
// The look: a dusk sky, warm at the horizon and cool at the zenith, a low sun glow and a thin dark tree line with
// pylons for scale. Thousands of tiny near-black birds wheel across it as one pulsing cloud; the cloud itself becomes
// the shape (a blob, a twisted ribbon, an arrow, a ring) and dissolves again. Nothing is placed: every bird's position
// is a closed form of t in flock.js (formation blend + curl-ish noise flow + density waves), shared with the SCORE.

export const STYLE_SPEC = {
  id: "murmuration",
  name: "Murmuration",
  description:
    "A dusk sky (warm horizon, cool zenith, low sun glow, a thin dark tree line with pylons for scale) where thousands of tiny near-black birds wheel as one living cloud. Nothing is placed: each bird has a closed-form position at time t — a blend between its point in the previous and next formation (seeded volumetric samples of a blob, a ribbon, an arrow, a ring, glyphs or an icon), plus a smooth 3D noise flow so the flock swirls and breathes, plus travelling density waves that bunch the birds and bank them toward the camera so a dark band rolls through the cloud. Edges stay soft with stragglers; the whole flock sways and turns as a body. Birds are two-triangle silhouettes that flap with a per-bird phase and point along their velocity (finite difference of the same closed form). The sound is a wing-rush whose level follows flock speed, a low whoosh per density wave, sparse distant calls and a gentle pad.",
  palette: {
    bg: "#1d1a2e",
    zenith: "#26315a",     // cool blue-violet top of the sky
    upper: "#5a5683",      // mid sky, dusky lavender
    low: "#c98a7a",        // rose band above the horizon
    horizon: "#f2b27a",    // warm apricot at the horizon
    sun: "#ffd9a0",
    ground: "#16121a",
    treesNear: "#130f17",
    treesFar: "#3a2d3b",   // hazy far tree line
    bird: "#120f16",       // near-black silhouette (wings facing the camera)
    birdLight: "#3a3242",  // edge-on / banked birds read slightly lighter
    ink: "#f6ead9",        // caption text
  },
  world: {
    background: "#1d1a2e",  // covered by the sky dome
    sky: null,
    fog: null,
    environment: null,
    toneMapping: "none",     // the sky and birds are flat designed colours (unlit shaders, colorspace only)
    exposure: 1.0,
    shadowType: "auto",
  },
  materials: {},
  lights: [],
  post: {},                  // no post: native MSAA keeps the tiny birds crisp, no grain (thousands of moving specks cost bitrate)
  camera: { fov: 42, near: 0.5, far: 900, drift: { amp: 0, speed: 0.2 } },   // still camera: the flock is the motion
  text: { font: "sans", weight: 600, color: "#f6ead9", height: 0.5 },

  // ---- sky dome (screen-filling shader on a big back-side sphere) ------------------------------------------
  sky: {
    radius: 700,
    sunDir: [0.5, 0.06, -1],           // low sun, right of centre
    sunDisc: 0.99985, sunCore: 1.6,     // cos of disc radius; core brightness
    glow: [[0.55, 6], [0.35, 40], [0.5, 400]],   // [strength, exponent] lobes of the sun glow
    bands: { low: 0.035, upper: 0.16, zenith: 0.55 },   // elevation (dir.y) where each colour takes over
    vignette: 0.35,
    dither: 0.0,                        // static dither OFF: noise revealed behind every moving bird doubled the MP4 size
  },
  horizon: {
    near: { z: -140, height: [4.5, 10], seed: 31, step: 0.6 },
    far: { z: -320, height: [10, 19], seed: 47, step: 1.4 },
    pylons: { z: -240, xs: [-128, -30, 68, 166], height: 19, width: 5.5 },
  },

  // ---- birds -----------------------------------------------------------------------------------------------
  birds: {
    count: 12000,
    span: 0.21,                 // wing span (m) before per-bird scale
    size: [0.85, 1.25],         // per-bird scale range
    flapHz: [2.2, 3.4],         // slow enough to resolve at 30 fps (real starlings flap faster: it strobes)
    flapAmp: 1.05,
    faceBase: 0.35,             // how far the wing plane turns toward the camera at rest (0 = level flight, edge-on)
    faceBank: 0.65,             // extra turn while a density wave banks the bird
    haze: { near: 40, far: 80, amount: 0.3 },   // far birds lift toward the horizon colour
  },

  // ---- flock behaviour defaults (flock.js) -----------------------------------------------------------------
  flock: {
    seed: 57,
    flowFreq: 0.11,             // spatial frequency of the noise flow (1 / m)
    flowSpeed: 0.33,            // how fast the flow field evolves
    orbit: [0.06, 0.2],         // per-bird personal loop radius (m)
    orbitW: [1.4, 3.4],         // its angular speed (rad/s)
    straggle: { share: 0.045, flow: 3.2, lag: [0.25, 0.7] },   // stragglers: more flow, they trail behind transitions
    halo: { soft: 0.9, prob: 0.45 },   // soft edges: points accepted outside the shape with p = prob * exp(-(d/soft)^2)
    columns: 72,                // rank-grid assignment: bird i keeps its rough place (column, then height) in every formation
    velDt: 1 / 60,              // finite-difference step for the heading
  },

  // ---- caption (overlay, exact colours) over the dark land under the horizon --------------------------------
  caption: {
    x: 260, y: 884, w: 1400, h: 112, cap: 50,
    font: '"Avenir Next", "Helvetica Neue", Arial, sans-serif', weight: 600, spacing: 1.5,
    ink: "#f6ead9", rule: "#f2b27a", shadow: "rgba(0,0,0,0.55)",
  },

  sound: {
    rush: { step: 0.3, dur: 1.2, pitch: [1.6, 2.1], q: 0.7, gain: [0.05, 0.2] },   // airy wing-rush, gain follows flock speed
    flutter: { step: 0.45, dur: 0.6, density: 0.6, pitch: 1.25, gain: [0.015, 0.07] }, // wingbeat flutter, follows compression
    wave: { gain: 0.5, pitch: 0.45, dur: 1.6 },          // low whoosh as each density wave crosses
    burst: { gain: 0.55, pitch: 0.7, dur: 2.4 },
    calls: { count: 9, gain: [0.03, 0.06], pitch: [2.6, 3.5] },   // sparse distant calls
    bed: { gain: 0.62, root: 98, brightness: 650 },
  },
  sfx: { enter: "whooshIn", exit: "whooshOut", move: "whoosh", land: "rustle", emphasis: "whoosh", ui: "blip", bed: "pad" },
  motion: [
    "Nothing is placed: bird i at time t = blend of its point in the previous and next formation (eased, per-bird delay along a pour direction, a swirling mid-path bulge) + a smooth 3D noise flow + its own small loop.",
    "Density waves: a band that travels through the flock, pulling birds toward its centre and turning their wings toward the camera, so a dark ripple rolls across the cloud.",
    "Soft edges: formations are sampled with a soft halo, stragglers get more flow and trail behind each transition.",
    "Heading = finite difference of the same closed form (t and t + dt); wings flap from t with a per-bird phase and flap/glide rhythm.",
    "Camera: still. The flock sways and turns as a body; the sky never moves.",
  ],
};
