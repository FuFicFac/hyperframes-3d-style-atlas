// scene.config.js — 75-paper-marbling: "Every pass reshapes the pattern" (style "paper-marbling").
// Plain data + the style's pure marbling planner. No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). The picture, the tools and every sound cue come from the one PLAN below.
// Bath = XZ rectangle centred on the origin; marbling coords x -> +X, y -> +Z (toward the viewer).
import { STYLE_SPEC as S } from "./_atlas/styles/paper-marbling/spec.js";
import { createPlan, ringDrops, marbleVoices } from "./_atlas/styles/paper-marbling/marbleplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "75-paper-marbling";
export const STYLE = "paper-marbling";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (every operation time derives from these)
export const BEATS = [
  { id: "drops", t: 0, dur: 4.4, label: "Input: plain drops of ink" },
  { id: "stylus", t: 4.4, dur: 2.9, label: "Pass 1 stretches it" },
  { id: "comb", t: 7.3, dur: 2.1, label: "Pass 2 folds it again" },
  { id: "paper", t: 9.4, dur: 2.1, label: "Simple moves compound" },
  { id: "print", t: 11.5, dur: 3.5, label: "Every pass is in the print" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the recipe -> the plan
const DROPS = ringDrops({
  start: B.drops.t + 0.25, cadence: 0.17, hop: 0.08,
  groups: [
    { c: [-1.0, -0.38], inks: ["indigo", "cream", "vermilion"], r: [0.44, 0.31, 0.2] },
    { c: [0.9, 0.42], inks: ["teal", "ochre", "indigo"], r: [0.44, 0.31, 0.2] },
    { c: [0.0, -0.45], inks: ["vermilion", "cream", "teal"], r: [0.42, 0.3, 0.2] },
    { c: [-0.55, 0.5], inks: ["ochre", "indigo", "cream"], r: [0.42, 0.3, 0.19] },
    { c: [1.05, -0.45], inks: ["indigo", "ochre", "vermilion"], r: [0.42, 0.3, 0.19] },
    { c: [0.2, 0.45], inks: ["cream", "vermilion", "indigo"], r: [0.4, 0.29, 0.19] },
    { c: [-1.3, 0.45], inks: ["teal", "cream", "ochre"], r: [0.38, 0.27, 0.18] },
  ],
});
const strokeAt = (i) => B.stylus.t + 0.2 + i * 0.54;
const STROKES = [
  ...[-1.2, -0.6, 0, 0.6, 1.2].map((x, i) => ({ kind: "tine", t0: strokeAt(i), t1: strokeAt(i) + 0.44, a: [x, 0], dir: [0, i % 2 ? -1 : 1] })),
  { kind: "comb", t0: B.comb.t + 0.4, t1: B.comb.t + 1.8, a: [0, 0.12], dir: [1, 0] },
];
const PAPER_T = { in: B.paper.t, laid: B.paper.t + 1.6, peel: B.print.t, peelEnd: B.print.t + 1.4, lift: B.print.t + 1.3, liftEnd: B.print.t + 2.3 };
export const PLAN = createPlan({
  tray: { w: S.tray.w, h: S.tray.h, bathY: S.tray.bathY }, inks: S.inks, maxOps: S.maxOps,
  defaults: { drop: S.drop, tine: S.tine, comb: S.comb }, tools: S.tools,
  drops: DROPS, strokes: STROKES, paper: { ...S.paper, t: PAPER_T }, end: DURATION,
});

export const JARS = []; // the tray fills the frame; ink cups (style.props.jars) would be cut by the frame edges

// ---------------------------------------------------------------- camera: locked top-down three-quarter, ONE move for the print
const ow = S.tray.w / 2 + S.tray.wall, oh = S.tray.h / 2 + S.tray.wall;
const TRAY = { box: [[-ow, 0, -oh], [ow, S.tray.height, oh]] };
const SHEET_END = PLAN.paper.cornersAt(DURATION);
const MAIN = fitShot(TRAY, { elevation: 1.13, fov: S.camera.fov, window: { x0: -0.95, x1: 0.95, y1: 0.7, y0: -0.95 }, fill: 1 });
const FIN = fitShot(SHEET_END, { elevation: S.paper.present.elevation, fov: S.camera.fov, window: { x0: -0.95, x1: 0.95, y1: 0.72, y0: -0.9 }, fill: 1 });
export const CAMERA = [
  { t: 0, pos: MAIN.pos, target: MAIN.target, fov: S.camera.fov },
  { t: PAPER_T.lift - 0.1, pos: MAIN.pos, target: MAIN.target, fov: S.camera.fov },
  { t: PAPER_T.liftEnd - 0.1, pos: FIN.pos, target: FIN.target, fov: S.camera.fov, ease: "inOutSine" },
  { t: DURATION, pos: FIN.pos, target: FIN.target, fov: S.camera.fov },
];

// ---------------------------------------------------------------- framing gate: tray while making, sheet once presented
export const FRAMING = framingReport([
  { id: "tray", box: TRAY.box, from: 0, to: PAPER_T.lift - 0.1, required: true },
  { id: "sheet", pts: (t) => PLAN.paper.cornersAt(t), from: PAPER_T.liftEnd, to: DURATION, required: true },
], CAMERA, { duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, safe: 0.97 });
if (!FRAMING.ok && !globalThis.process?.env?.MARBLE_NOGATE) throw new Error(`75-paper-marbling framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a quiet bed
export const EVENTS = PLAN.events();
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: S.sound.bed.chord, brightness: S.sound.bed.brightness, attack: 1.2, release: 1.5 },
  ...scoreFromEvents(EVENTS, marbleVoices(S.sound), { seedBase: 175, pan: (e) => Math.max(-0.6, Math.min(0.6, (e.x ?? 0) / 2.4)) }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "marbleplan.js: closed-form marbling operations (ink drop, tine line, comb) applied in plan order; each pixel is inverse-mapped through the operations so far (the running one by its progress). No simulation.",
  operations: PLAN.ops.map((o) => (o.kind === "drop" ? { kind: o.kind, t0: o.t0, t1: +o.t1.toFixed(3), c: o.c, r: o.r, ink: o.inkName } : { kind: o.kind, t0: +o.t0.toFixed(3), t1: +o.t1.toFixed(3), a: o.a, dir: o.m, alpha: o.alpha, lambda: o.lambda, spacing: o.spacing })),
  inkCoverage: { afterDrops: +PLAN.coverage(B.stylus.t + 0.25).toFixed(3), final: +PLAN.coverage(B.paper.t).toFixed(3) },
  paper: PAPER_T,
  framing: FRAMING.ok ? `ok (worst ${JSON.stringify(FRAMING.worst)})` : "FAILS",
};
