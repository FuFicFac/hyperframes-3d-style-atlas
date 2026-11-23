// scene.config.js — 93-tessellation-morph: "latent space — sliding smoothly from one idea to another", told by a wall of
// interlocking tiles whose shared edges morph plain tile -> fish -> bird, then show the whole slide on one wall, then a
// row of birds peels off and flies at the camera. Plain data + the style's pure planner (tiling.js): no THREE, no window.
// Imported by scene.js (browser) and by render-sfx / export-spec (Node), so every click / whoosh / flutter in SCORE comes
// from the same morph plan the picture is drawn from. The wall is the XY plane (z = 0); tiles stand out toward +Z.
import { STYLE_SPEC as S } from "./_atlas/styles/tessellation-morph/spec.js";
import { makeTiling, planWall, tilingVoices } from "./_atlas/styles/tessellation-morph/tiling.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport } from "./_atlas/kit/framing.js";

export const ID = "93-tessellation-morph";
export const STYLE = "tessellation-morph";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (every window below derives from these)
export const BEATS = [
  { id: "tiles", t: 0, dur: 2.2, label: "Start with plain tiles" },
  { id: "fish", t: 2.2, dur: 3.0, label: "Bend the edges: fish" },
  { id: "birds", t: 5.2, dur: 3.2, label: "Slide further: birds" },
  { id: "space", t: 8.4, dur: 3.2, label: "Latent space, on one wall" },
  { id: "fly", t: 11.6, dur: 3.4, label: "Then an idea takes off" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const end = (id) => B[id].t + B[id].dur;
// one label at all times: the plate stays up, the text cross-fades at each beat boundary
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: i ? b.t - 0.05 : -1, off: BEATS[i + 1] ? BEATS[i + 1].t - 0.3 : Infinity }));

// ---------------------------------------------------------------- the morph plan (the one schedule)
const SWEEP = { dir: [1, 0], per: 0.045, from: [-9, 0] };   // a change rolls left -> right across the wall
export const GRADIENT = { stops: [[-7.2, 0], [-3.8, 1], [-0.6, 1], [3.0, 2]], slide: { t0: B.fly.t, dur: 1.4, dx: -3.4, ease: "inOutSine" } };
export const TILING = makeTiling({ a: S.tiling.a, b: S.tiling.b, keys: S.tiling.keys, per: S.tiling.per });
export const PLAN = planWall({
  tiling: TILING, size: S.tiling.size, duration: DURATION,
  bounds: { x0: -19, x1: 19, y0: -10, y1: 10 },
  heights: S.tile.heights, taps: S.tile.tap, binHz: 16,
  press: [{ t0: 0.0, from: [-7, 3], speed: 7, depth: -0.55, dur: 0.75 }],   // a pop-out wave rolls across the wall (negative depth = raise)
  field: {
    start: 0,
    stages: [
      { t0: B.fish.t + 0.1, dur: 1.4, to: 1, tap: true, sweep: SWEEP },
      { t0: B.birds.t + 0.1, dur: 1.4, to: 2, tap: true, sweep: SWEEP },
      { t0: B.space.t + 0.05, dur: 1.9, to: GRADIENT, ease: "inOutSine" },
    ],
  },
  flight: {
    rowY: 0, xMin: 0.5, xMax: 9.5, t0: B.fly.t + 0.45, stagger: 0.22, order: "rtl",
    lift: { dur: 0.5, h: 0.8 }, vel: [0.8, 0.6, 4.2], ramp: 0.6, flap: { hz: 2.4, amp: 0.6, base: 0.25 }, climb: 0.22, yaw: 0.55, bob: 0.1,
  },
});

// ---------------------------------------------------------------- camera: close oblique -> wide -> swing to meet the birds
const fov = S.camera.fov;
const CLOSE_A = { pos: [-2.6, 2.2, 10.6], target: [0.4, 0.15, 0] };
const CLOSE_B = { pos: [-1.6, 1.6, 9.7], target: [0.6, 0.1, 0] };
const WIDE = { pos: [0.2, 0.6, 21.5], target: [0.2, -0.2, 0] };
const MEET = { pos: [9.5, -0.8, 18], target: [4.5, 1.0, 2.0] };
const LAST = { pos: [10.0, -0.4, 18.6], target: [6.3, 1.9, 3.6] };
export const CAMERA = [
  { t: 0, ...CLOSE_A, fov },
  { t: B.fish.t + 0.2, ...CLOSE_B, fov, ease: "inOutSine" },
  { t: B.space.t + 0.1, ...CLOSE_B, fov },
  { t: B.space.t + 2.0, ...WIDE, fov, ease: "inOutCubic" },
  { t: B.fly.t + 0.1, ...WIDE, fov },
  { t: B.fly.t + 2.2, ...MEET, fov, ease: "inOutSine" },
  { t: DURATION, ...LAST, fov, ease: "linear" },
];

// framing gate: every flying bird stays inside the frame until the end
const flyRegions = (t) => PLAN.flyers.filter((T) => t > T.flight.t0).map((T) => {
  const p = PLAN.poseAt(T, t), h = PLAN.heights[T.parity];
  return { id: `bird${T.flight.k}`, box: [[T.cx + p.x - 1.1, T.cy + p.y - 1.1, h + p.z - 0.6], [T.cx + p.x + 1.1, T.cy + p.y + 1.1, h + p.z + 0.6]] };
});
export const FRAMING = framingReport(flyRegions, CAMERA, { duration: DURATION, t0: B.fly.t, drift: S.camera.drift, fov, safe: 0.98 });
if (!FRAMING.ok && !globalThis.process?.env?.TM_NOGATE) throw new Error(`93-tessellation-morph framing: ${JSON.stringify(FRAMING.spans.slice(0, 4))}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a bed + one whoosh per camera move
export const EVENTS = PLAN.events({ x0: -12, x1: 12, y0: -7.5, y1: 7.5 });
const SND = S.sound;
export const SCORE = [
  ...scoreFromEvents(EVENTS, tilingVoices(SND), { seedBase: 193 }),
  { t: 0, type: "pad", root: SND.bed.root, chord: SND.bed.chord, dur: DURATION, attack: 0.5, release: 1.6, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 3 },
  { t: CAMERA[2].t, type: "whoosh", dir: "out", dur: CAMERA[3].t - CAMERA[2].t, gain: 0.2, seed: 5 },
  { t: CAMERA[4].t, type: "whoosh", dir: "in", dur: CAMERA[5].t - CAMERA[4].t, gain: 0.18, seed: 7 },
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "tiling.js: a diamond lattice cell whose two side pairs are each ONE shared curve (what bulges out of one side is cut from its opposite), key shapes = curve pairs, morph = point-wise interpolation; each edge takes its own morph value from a field m(x, y, t), so a gradient across the wall stays gap-free.",
  tiles: PLAN.stats,
  framing: FRAMING.ok ? `ok (worst ${JSON.stringify(FRAMING.worst)})` : `FAILS ${JSON.stringify(FRAMING.spans.slice(0, 4))}`,
  sound: "one click per 1/16 s bin of tile dips (press ripple, clicks home at each key), a whoosh per morph stage and the slide, a pop + paper rustle per bird lift-off, a soft paper flutter per wing down-stroke, a chime as the first bird leaves; warm pad bed.",
};
