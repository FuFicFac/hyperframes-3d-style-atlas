// scene.config.js — 74-layer-print: "Built one layer at a time". A lobed, twisted pot printed on a desktop 3D printer in
// the "layer-print" style. Plain data + the style's pure slicer. No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). Every motor whir, zigzag and layer tick in SCORE comes from the same plan the picture reads.
// World: bench at y = 0, bed surface at y = S.printer.bedY, part centred on the origin; +Z toward the camera.
import { STYLE_SPEC as S } from "./_atlas/styles/layer-print/spec.js";
import { vaseShape, sliceShape, planPrint, printVoices } from "./_atlas/styles/layer-print/slicer.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "74-layer-print";
export const STYLE = "layer-print";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (every timing stage comes from these)
export const BEATS = [
  { id: "outline", t: 0, dur: 3.1, label: "First, trace the outline" },
  { id: "infill", t: 3.1, dur: 2.65, label: "Then fill it in" },
  { id: "stack", t: 5.75, dur: 3.65, label: "Layer on layer on layer" },
  { id: "fast", t: 9.4, dur: 3.1, label: "Hours pass in seconds" },
  { id: "done", t: 12.5, dur: 2.5, label: "An idea you can hold" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const end = (id) => B[id].t + B[id].dur;
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.15), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the toolpath plan (the one schedule)
const BD = S.bead;
export const SHAPE = vaseShape(S.shape);
export const LAYERS = sliceShape(SHAPE, { layerHeight: BD.layerHeight, bead: BD.width, wall: BD.wall, ringPts: BD.ringPts, zigs: BD.zigs, floorLayers: BD.floorLayers, seam: Math.PI / 2 + 0.5 });
export const STACK_TO = 10;   // layers 1..9 print in the "stack" beat, each faster than the last; the rest race by in "fast"
export const PLAN = planPrint(LAYERS, {
  speeds: S.speeds,
  stages: [
    { id: "outline", t0: B.outline.t + 0.45, t1: end("outline") - 0.1, to: [0, 2] },            // layer 0: both perimeters
    { id: "infill", t0: B.infill.t + 0.1, t1: end("infill") - 0.1, to: [1, 0] },                // layer 0: scan-line infill
    { id: "stack", t0: B.stack.t + 0.05, t1: end("stack"), accel: 1.22, to: [STACK_TO, 0] },   // x1.22 faster per layer
    { id: "fast", t0: B.fast.t, t1: end("fast"), accel: 1.02, to: null },
  ],
  approach: { t0: -0.45 },
  home: [-0.2, 0.75, 1.9],
  park: { dur: 1.1, lift: 0.5, to: [1.75, SHAPE.height + 0.55, -1.6] },
  slow: 0.45, group: 0.4,
});

// ---------------------------------------------------------------- camera: five locked shots joined by four short moves
const fov = S.camera.fov, Y0 = S.printer.bedY, R = PLAN.rMax + BD.width, H = PLAN.height;
const bx = (r, y0, y1) => ({ box: [[-r, Y0 + y0, -r], [r, Y0 + y1, r]] });
const WIN = { x0: -0.95, x1: 0.95, y0: -0.66, y1: 0.93 };   // the caption chip owns the bottom band
const FLOOR = bx(1.12, 0, 0.12);
export const PART = bx(R, 0, H);
const TOP = fitShot(FLOOR, { azimuth: -0.22, elevation: 0.8, fov, fill: 1, window: WIN });
const RAKE = fitShot(FLOOR, { azimuth: 0.32, elevation: 0.6, fov, fill: 1, window: WIN });
const SIDE = fitShot(bx(R, 0, 1.25), { azimuth: 0.24, elevation: 0.34, fov, fill: 1, window: WIN });
const TALL = fitShot(bx(R, 0, H + 0.75), { azimuth: -0.16, elevation: 0.27, fov, fill: 1, window: { ...WIN, y1: 0.97 } });
const HERO = fitShot(PART, { azimuth: -0.28, elevation: 0.22, fov, fill: 1, window: WIN });
const key = (t, K, extra = {}) => ({ t, pos: K.pos, target: K.target, fov, ...extra });
export const CAMERA = [
  key(0, TOP), key(end("outline") - 0.15, TOP),
  key(B.infill.t + 0.95, RAKE, { ease: "inOutSine", path: "arc" }), key(end("infill") - 0.1, RAKE),
  key(B.stack.t + 1.15, SIDE, { ease: "inOutSine" }), key(end("stack") - 0.15, SIDE),
  key(B.fast.t + 1.1, TALL, { ease: "inOutSine" }), key(end("fast"), TALL),
  key(B.done.t + 1.25, HERO, { ease: "inOutSine", path: "arc" }), key(DURATION, HERO),
];
const MOVES = [[1, 2], [3, 4], [5, 6], [7, 8]].map(([a, b]) => [CAMERA[a].t, CAMERA[b].t]);
// framing gate: the nozzle (where the action is) stays in frame and above the caption band while it prints the slow
// layers, and the finished part sits inside the safe area for the final hold.
const nozzleWorld = (t) => { const p = PLAN.nozzleAt(t).p; return [[p[0], Y0 + p[1], p[2]]]; };
export const FRAMING = framingReport(
  (t) => [
    ...(t >= PLAN.t0 && t <= end("stack") ? [{ id: "nozzle", pts: nozzleWorld(t), window: { x0: -0.95, x1: 0.95, y0: -0.7, y1: 0.95 } }] : []),
    ...(t >= CAMERA[8].t ? [{ id: "part", box: PART.box }] : []),
  ],
  CAMERA, { duration: DURATION, drift: S.camera.drift, fov, safe: 0.96 },
);
if (!FRAMING.ok && !globalThis.process?.env?.LP_NOGATE) throw new Error(`74-layer-print framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + bed + fan + one whoosh per move
export const EVENTS = PLAN.events();
const SND = S.sound;
export const SCORE = [
  ...scoreFromEvents(EVENTS, printVoices(SND), { seedBase: 174 }),
  { t: 0, type: "pad", root: SND.bed.root, chord: SND.bed.chord, dur: DURATION, attack: 0.5, release: 1.5, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 3 },
  { t: 0, type: "hum", hz: SND.fan.hz, dur: PLAN.tEnd, gain: SND.fan.gain, seed: 5 },
  ...MOVES.map(([a, b], i) => ({ t: a, type: "whoosh", dir: i % 2 ? "out" : "in", dur: b - a, gain: 0.16, seed: 7 + 2 * i })),
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "slicer.js: shape radius(theta, y) -> layers of polylines (outer perimeter, inner perimeter, infill) -> one timed move list (stages; accel per layer) -> nozzleAt(t). The bead mesh is built once; each vertex carries its deposit time; a frame sets drawRange + a time uniform.",
  plan: PLAN.stats,
  timeCompression: "layer 0 takes ~5 s; layers 1-9 each 1.22x faster than the one before; the last 36 layers pass in ~3 s. No cut: the same plan, faster.",
  framing: FRAMING.ok ? `ok (worst ${JSON.stringify(FRAMING.worst)})` : "FAILS",
  sound: "whir per perimeter, grittier servo per infill path, one short servo per floor scan line, grouped rising whirs for the fast layers, a tick per layer change, chime when the head parks; pad + fan hum bed.",
};
