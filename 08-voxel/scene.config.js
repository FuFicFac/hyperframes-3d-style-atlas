// scene.config.js — 08-voxel: "How AI makes an image" (diffusion as denoising) in the Voxel Studio style.
// Plain data (no THREE, no window): imported by scene.js (browser) and render-sfx / export-spec (Node).
// Units: metres, Y-up, radians, seconds, sRGB hex. Grid units ("cubes") are noted where used.
export const ID = "08-voxel";
export const STYLE = "voxel";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "build", t: 0.0, dur: 1.4 },    // plinths stack up, frame + noise cubes fly in, prompt card types on
  { id: "noise", t: 0.9, dur: 2.7 },    // 1 START WITH PURE NOISE
  { id: "remove", t: 3.7, dur: 2.8 },   // 2 REMOVE A LITTLE NOISE — steps 1..3, slow split-flap waves
  { id: "repeat", t: 6.6, dur: 3.6 },   // 3 REPEAT, STEP BY STEP — steps 4..20 accelerate
  { id: "resolve", t: 10.25, dur: 2.2 }, // 4 crisp picture; foreground columns push out into relief
  { id: "caption", t: 12.55, dur: 2.45 }, // NOISE -> PICTURE
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => B[id].t + off;

// ---------------------------------------------------------------- the picture (32 x 24, top row first)
// Legend keys -> style palette names. Composed by stamping sprites so each part stays readable as data.
export const LEGEND = {
  B: "skyDeep", b: "sky", s: "skyLight", W: "cloud", Y: "sun", y: "sunCore", O: "sunRay",
  g: "grass", G: "grassDark", c: "cat", d: "catDark", w: "catLight", p: "catPink", k: "ink",
};
// extrusion depth per key once the picture "gains depth" (cubes; 1 = flat)
export const RELIEF = { B: 1, b: 1, s: 1, W: 2, Y: 2, y: 2, O: 2, g: 2, G: 2, c: 3, d: 3, w: 3, p: 3, k: 3 };
const CAT = [
  "..k.......k..",
  ".kck.....kck.",
  ".kpck...kcpk.",
  ".kcckkkkkcck.",
  ".kccdcdcdcck.",
  ".kccccccccck.",
  ".kcckccckcck.",
  ".kcckccckcck.",
  "kkcwwwpwwwckk",
  "kkcwwkwkwwckk",
  "..kcwwwwwck..",
  "..kccwwwcck..",
  ".kcccwwwccck.",
  ".kccdwwwdcck.",
  ".kcccwwwccck.",
  ".kcdcwwwcdck.",
  ".kcwwckcwwck.",
  "..kkkkkkkkk..",
];
const TAIL = [ // stamped at col 17, row 13; curls up the cat's right side
  "....k.",
  "...kck",
  "...kck",
  "...kdk",
  "...kck",
  "...kck",
  "kkkcck",
  "kcccck",
  "kkkkk.",
];
const SUN = [
  ".....O.....",
  ".O.......O.",
  "....YYY....",
  "...YyyyY...",
  "..YyyyyyY..",
  "O.YyyyyyY.O",
  "..YyyyyyY..",
  "...YyyyY...",
  "....YYY....",
  ".O.......O.",
  ".....O.....",
];
const CLOUD = ["..WWW...", ".WWWWWW.", "WWWWWWWW"];
const CLOUD2 = [".WW.", "WWWW"];
function composePicture() {
  const W = 32, H = 24;
  const g = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      if (y >= 19) row.push((x * 13 + y * 7) % 9 === 0 || (y === 19 && x % 4 === 1) ? "G" : "g");
      else if (y === 18 && x % 5 === 2) row.push("g"); // grass blades poking into the sky
      else row.push(y < 6 ? "B" : y < 13 ? "b" : "s");
    }
    g.push(row);
  }
  const stamp = (spr, cx, cy) => spr.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== "." && g[cy + j]?.[cx + i] != null) g[cy + j][cx + i] = ch; }));
  stamp(CLOUD, 0, 1);
  stamp(CLOUD2, 13, 2);
  stamp(SUN, 20, 1);
  stamp(TAIL, 17, 13);
  stamp(CAT, 6, 4);
  return g.map((r) => r.join(""));
}
export const PICTURE = composePicture();

// ---------------------------------------------------------------- set layout (metres; grid = 0.12 m)
export const LAYOUT = {
  canvas: { origin: [-3.31, 0.54, 0], w: 32, h: 24 },           // world centre of pixel (0,0); frame ring at -1 / w / h
  plinth: { origin: [-3.67, 0.06, -0.36], w: 38, h: 3, d: 7 },   // grid cubes
  card: { origin: [1.01, 0.42, 0], w: 21, h: 25, rule: 10, bar: 2 },  // grid cubes; rule/bar = body rows
  cardText: { origin: [1.19, 1.787, 0.087], cube: 0.054, lineStep: 10 }, // small text cubes embossed on the card face
  counter: { origin: [1.19, 0.887, 0.087] },
  cardPlinth: { origin: [0.90, 0.06, -0.24], w: 23, h: 3, d: 5 },
  label: { pos: [0, 3.78, 0.2], cube: 0.05 },                    // bottom-centre of the step labels
  caption: { pos: [0, 3.70, 0.2], cube: 0.068 },
  floor: { width: 40, depth: 22, height: 14, radius: 4, z: -4.2 },
};

// ---------------------------------------------------------------- the diffusion schedule
// Step k (1..20) fires at STEPS[k-1]. Steps 1-3 are slow split-flap waves; 4-20 accelerate.
const fast = [];
{
  const n = 17, t0 = at("repeat", 0.3), i0 = 0.27, i1 = 0.12;
  let t = t0;
  for (let i = 0; i < n; i++) { fast.push(+t.toFixed(3)); t += i0 + ((i1 - i0) * i) / (n - 1); }
}
export const STEPS = [at("remove", 0.5), at("remove", 1.2), at("remove", 1.9), ...fast];
export const DIFFUSION = {
  total: 20,
  signalPow: 5,          // signal fraction a_k = 1 - (1 - k/20)^signalPow
  blocks: [[1, 8], [5, 4], [11, 2], [20, 1]], // [last step, block size]: coarse structure first, detail later
  freshNoise: 0.35,      // each step re-rolls this share of the noise (shimmer between steps)
  noiseSeed: 41,
  noiseHSL: { s: [0.45, 0.85], l: [0.32, 0.72] },
  wave: { slow: 0.42, fast: 0.1 },   // diagonal sweep duration of one step across the canvas (s)
  flip: { slow: 0.24, fast: 0.12, dip: 0.07 },
};
export const RELIEF_PUSH = { at: at("resolve", 0.3), spread: 0.5, stepDur: 0.13, centre: [12, 9] };

// ---------------------------------------------------------------- labels (voxel text, top centre)
export const LABELS = [
  { beat: "noise", text: "1 START WITH PURE NOISE", in: 0.1, out: 2.45 },
  { beat: "remove", text: "2 REMOVE A LITTLE NOISE", in: 0.0, out: 2.5 },
  { beat: "repeat", text: "3 REPEAT, STEP BY STEP", in: 0.0, out: 3.35 },
  { beat: "resolve", text: "4 THE PICTURE APPEARS", in: 0.0, out: 1.95 },
];
export const CAPTION = { beat: "caption", text: "NOISE → PICTURE", in: 0.05 };
export const TEXT_FLIGHT = { dur: 0.36, spread: 0.42, radius: 10, bias: [0, 2, 14], outDur: 0.3, outSpread: 0.18 };
export const CARD = { lines: ["A CAT", "IN THE", "SUN"], typeAt: at("build", 0.75), typeSpread: 0.6 };

// ---------------------------------------------------------------- camera: slow three-quarter orbit, small push-ins
const T0 = [0, 2.0, 0];
const orbit = (yawDeg, dist, pitchDeg = 13, tg = T0) => {
  const y = (yawDeg * Math.PI) / 180, p = (pitchDeg * Math.PI) / 180;
  return [+(tg[0] + Math.sin(y) * Math.cos(p) * dist).toFixed(3), +(tg[1] + Math.sin(p) * dist).toFixed(3), +(tg[2] + Math.cos(y) * Math.cos(p) * dist).toFixed(3)];
};
export const CAMERA = [
  { t: 0, pos: orbit(-14, 18.6, 15), target: T0, fov: 18 },
  { t: 1.6, pos: orbit(-9, 17.6, 14), target: T0, fov: 18, ease: "outCubic" },
  { t: 3.7, pos: orbit(-5, 17.2), target: T0, fov: 18, ease: "inOutSine" },
  { t: 6.6, pos: orbit(1, 17.0), target: T0, fov: 18, ease: "inOutSine" },
  { t: 10.2, pos: orbit(5, 16.8), target: T0, fov: 18, ease: "inOutSine" },
  { t: 12.2, pos: orbit(-22, 16.4, 12, [-0.2, 2.0, 0]), target: [-0.2, 2.0, 0], fov: 18, ease: "inOutCubic" },
  { t: 15, pos: orbit(-15, 17.2, 13), target: T0, fov: 18, ease: "inOutSine" },
];

export const OBJECTS = [
  { id: "studio", primitive: "procedural", factory: "studio", procedural: "seamless cyclorama sweep (floor curving into a back wall), pale warm grey", params: { width: 40, depth: 22, height: 14, radius: 4 }, position: [0, 0, 6.8] },
];

// ---------------------------------------------------------------- sound (all cue times derive from BEATS / STEPS)
const fl = (x) => +x.toFixed(3);
const RAW_SCORE = [
  // soft pad bed, then a brighter major lift when the picture resolves
  { t: 0, type: "pad", dur: 10.6, gain: 0.16, root: 196, chord: [0, 7, 12, 14], attack: 1.0, release: 1.4, brightness: 900 },
  { t: at("resolve", -0.1), type: "pad", dur: 4.85, gain: 0.17, root: 196, chord: [0, 4, 7, 12, 16], attack: 0.5, release: 1.4, brightness: 1500 },
  // build: plinth layers clack down, a flurry of cube clicks as the noise snaps in
  ...[0, 1, 2].map((i) => ({ t: fl(at("build", 0.12 + i * 0.13)), type: "clack", gain: 0.42, pitch: 0.8 + i * 0.12, pan: -0.3 })),
  ...Array.from({ length: 9 }, (_, i) => ({ t: fl(at("build", 0.55 + i * 0.085)), type: "click", gain: 0.3 + (i % 3) * 0.05, pitch: 0.8 + ((i * 7) % 5) * 0.12, pan: ((i * 3) % 7) / 7 - 0.5 })),
  { t: at("build", 1.32), type: "clack", gain: 0.4, pitch: 1.3, pan: -0.2 },
  // prompt card types on (8-bit keystrokes)
  ...Array.from({ length: 6 }, (_, i) => ({ t: fl(CARD.typeAt + 0.06 + i * 0.1), type: "blip", notes: [0], dur: 0.035, gain: 0.16, pitch: 1.5 + (i % 2) * 0.12, pan: 0.45 })),
  // labels: two-note blip as the letters snap in, a soft tick as they burst out
  ...LABELS.flatMap((l) => [
    { t: fl(at(l.beat, l.in + 0.32)), type: "blip", notes: [0, 7], dur: 0.06, gain: 0.3, pitch: 0.75 },
    { t: fl(at(l.beat, l.out)), type: "tick", gain: 0.25, pitch: 0.9 },
  ]),
  // denoising steps: a blip per step, rising in pitch as the picture sharpens; slow steps get a flap clack
  ...STEPS.flatMap((t, i) => [
    { t: fl(t), type: "blip", notes: [0], dur: i < 3 ? 0.07 : 0.045, gain: i < 3 ? 0.32 : 0.2, pitch: 0.7 * 2 ** ((i * 12) / 19 / 12), pan: 0.4 },
    ...(i < 3 ? [{ t: fl(t + 0.12), type: "clack", gain: 0.3, pitch: 1.1, pan: -0.35 }] : []),
  ]),
  // resolve: arpeggio "done" + relief push (one clack per cube step) + a low thud
  { t: at("resolve", 0.0), type: "blip", notes: [0, 4, 7, 12], dur: 0.075, gain: 0.3, pitch: 0.7 },
  ...[0, 1].map((i) => ({ t: fl(RELIEF_PUSH.at + 0.06 + i * RELIEF_PUSH.stepDur), type: "clack", gain: 0.45, pitch: 0.75 - i * 0.08, pan: -0.25 })),
  { t: fl(RELIEF_PUSH.at + 0.33), type: "thud", gain: 0.4, pitch: 1.3 },
  // caption: letters snap in + sparkle
  { t: at("caption", 0.3), type: "blip", notes: [0, 7, 12], dur: 0.07, gain: 0.32, pitch: 0.75 },
  { t: at("caption", 0.55), type: "chime", sparkle: true, dur: 2.0, gain: 0.3 },
];
// SFX bus +3 dB (mean was -30 dB); pads stay where they are
export const SCORE = RAW_SCORE.map((e) => (e.type === "pad" ? e : { ...e, gain: +(e.gain * 1.4).toFixed(3) }));
export const DUCK = [];
export const NOTES = "Canvas = one InstancedMesh: 32x24 picture pixels extruded per RELIEF (extra cubes start coincident at z=0 and step out in whole cubes) + a 2-deep wood frame ring. Colour at step k = lerp(noise_k, blockAverage_k(target), 1-(1-k/20)^5); per-pixel step switches along a diagonal wave with a split-flap flip (steps 1-3) or a scale dip (4-20). All AO is recomputed from snapped cube positions each frame.";
