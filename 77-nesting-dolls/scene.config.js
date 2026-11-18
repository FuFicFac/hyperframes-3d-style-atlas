// scene.config.js — 77-nesting-dolls: "There's a smaller one inside" — model distillation told with nesting dolls
// (style "nesting-dolls"). Plain data + the style's pure nesting planner. No THREE, no window: imported by scene.js
// (browser) and by render-sfx / export-spec (Node). Camera keys, label times and every sound in SCORE come from the
// same plan that hides, poses and lines up the dolls.
// World: the row runs along +X (largest at the left), every doll faces +Z, the table is y = 0.
import { STYLE_SPEC as S } from "./_atlas/styles/nesting-dolls/spec.js";
import { createPlan, nestVoices, panOf } from "./_atlas/styles/nesting-dolls/nest.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "77-nesting-dolls";
export const STYLE = "nesting-dolls";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- the one plan
export const PLAN = createPlan(S.nest, { end: DURATION });
const LV = PLAN.levels, F = PLAN.finale, n = PLAN.n;
const O = (k) => LV[k].open;

// ---------------------------------------------------------------- beats (times come from the plan)
export const BEATS = [
  { id: "big", t: 0, dur: O(0).hop[0], label: "One big model" },
  { id: "inside", t: O(0).hop[0], dur: O(2).t0 - O(0).hop[0], label: "A smaller one inside" },
  { id: "again", t: O(2).t0, dur: F.lastLand - O(2).t0, label: "Distill it. Again." },
  { id: "tiny", t: F.lastLand, dur: F.dive[1] - F.lastLand, label: "Tiny, and still capable" },
  { id: "family", t: F.emerge[0], dur: DURATION - F.emerge[0], label: "Same family, every size" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = [
  { text: B.big.label, on: 0.15, off: B.inside.t + 0.15 },
  { text: B.inside.label, on: B.inside.t + 0.55, off: B.again.t - 0.25 },
  { text: B.again.label, on: B.again.t + 0.25, off: B.tiny.t - 0.2 },
  { text: B.tiny.label, on: B.tiny.t + 0.3, off: F.dive[1] - 0.38 },
  { text: B.family.label, on: F.emerge[0] + 0.55, off: Infinity },
];

// ---------------------------------------------------------------- camera
const FOV = S.camera.fov;
const WIN = { x0: -0.93, x1: 0.93, y0: -0.9, y1: 0.68 };            // the caption plate owns the top band
const shot = (box, az, el, o = {}) => {
  const k = fitShot(box[0]?.box ? box : { box }, { azimuth: az, elevation: el, fov: FOV, window: WIN, fill: 1, ...o });
  return { pos: k.pos, target: k.target, fov: FOV };
};
const CYCLE = LV.slice(0, n - 1).map((L) => shot(PLAN.cycleBox(L.k), 0.26, 0.24, { window: { ...WIN, y1: 0.62 } }));
const tiny = LV[n - 1];
const SOLID = shot([[LV[n - 2].x - 0.5 * LV[n - 2].R, 0, -0.1], [tiny.x + tiny.R + 0.1, LV[n - 2].H * 1.02, tiny.R * 0.6]], 0.12, 0.2);
export const ROW = LV.map((L) => ({ box: PLAN.dollBox(L.k, S.nest.finale.waveHop * 0.4) }));   // one box per doll: a tighter fit than the row's bounding box
const FINAL = shot(ROW, 0.3, 0.13, { window: { ...WIN, x0: -0.95, x1: 0.95, y1: 0.7 } });     // from the small end: the little ones are nearer the lens, so the row fills the frame
const DOT_IN = PLAN.dotOf(n - 1, S.paint.emblem.y), DOT_OUT = PLAN.dotOf(0, S.paint.emblem.y);
const DIVE_END = { pos: [DOT_IN[0], DOT_IN[1] + 0.004, DOT_IN[2] + 0.085], target: DOT_IN, fov: FOV };
const EMERGE_START = { pos: [DOT_OUT[0], DOT_OUT[1] + 0.01, DOT_OUT[2] + 0.26], target: DOT_OUT, fov: FOV };

const mix = (a, b, w) => a.map((v, i) => v + (b[i] - v) * w);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/**
 * zoomKeys(a, b, t0, t1, anchor, dir): camera keys from shot a to shot b whose distance to `anchor` changes
 * GEOMETRICALLY (a constant zoom rate, so a 20x push-in reads as one move). dir "in" eases the start, "out" the end.
 */
function zoomKeys(a, b, t0, t1, anchor, dir, steps = 14) {
  const da = dist(a.pos, anchor), db = dist(b.pos, anchor), keys = [];
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const v = dir === "in" ? 2 * u * u - u * u * u : 1 - (2 * (1 - u) * (1 - u) - (1 - u) * (1 - u) * (1 - u));
    const d = da * Math.pow(db / da, v), w = (d - da) / (db - da);
    keys.push({ t: +(t0 + u * (t1 - t0)).toFixed(4), pos: mix(a.pos, b.pos, w), target: mix(a.target, b.target, w), fov: FOV, ease: "linear" });
  }
  return keys;
}

const TIGHT0 = shot(PLAN.dollBox(0), 0.26, 0.24);
export const CAMERA = [
  { t: 0, ...TIGHT0 },
  { t: O(0).twist[0], ...TIGHT0 },
  { t: O(0).rise[0] + 0.25, ...CYCLE[0], ease: "inOutSine" },
];
for (let k = 1; k < n - 1; k++) {
  CAMERA.push({ t: O(k - 1).hop[0] + 0.12 * O(k - 1).d, ...CYCLE[k - 1] });
  CAMERA.push({ t: O(k).t0 + 0.16 * O(k).d, ...CYCLE[k], ease: "inOutSine" });
}
CAMERA.push({ t: O(n - 2).hop[0] + 0.1 * O(n - 2).d, ...CYCLE[n - 2] });
CAMERA.push({ t: F.lastLand + 0.4, ...SOLID, ease: "inOutSine" });
CAMERA.push({ t: F.dive[0], ...SOLID });
CAMERA.push(...zoomKeys(SOLID, DIVE_END, F.dive[0], F.dive[1], DOT_IN, "in"));
CAMERA.push({ t: F.emerge[0], ...EMERGE_START, ease: "linear" });                 // the hidden cut, under the yellow cover
CAMERA.push(...zoomKeys(EMERGE_START, FINAL, F.emerge[0], F.emerge[1], DOT_OUT, "out"));
CAMERA.push({ t: DURATION, ...FINAL });

/** the yellow cover the camera dives through: alpha from t */
export const COVER = { in: [F.dive[1] - 0.2, F.dive[1] - 0.03], out: [F.emerge[0] + 0.06, F.emerge[0] + 0.36] };

// ---------------------------------------------------------------- framing gate
export const FRAMING = framingReport([
  ...LV.slice(0, n - 1).map((L) => ({ id: `cycle-${L.k}`, box: PLAN.cycleBox(L.k), from: L.open.rise[1] - 0.05, to: L.open.hop[0], required: true })),
  ...ROW.map((r, k) => ({ id: `row-${k}`, box: r.box, from: F.emerge[1], to: DURATION, required: true })),
], CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, window: { x0: -0.96, x1: 0.96, y0: -0.94, y1: 0.72 } });
if (!FRAMING.ok && !globalThis.process?.env?.ND_NOGATE) {
  throw new Error(`77-nesting-dolls framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, nestVoices(S.sound, PLAN), { seedBase: 177, pan: panOf(PLAN) });
export const DUCK = [];
export const NOTES = {
  mechanism: "nest.js: one lathe profile scaled by ratio^k per level; level k opens for cycle * accel^k s (twist, lid off, child rises, child hops aside, lid back, lock). dollPose / lidPose are closed forms of t; a child is invisible until its parent's lid lets go. SCORE = plan.events() pitched by level.",
  fit: `ratio ${S.nest.ratio}: slack ${PLAN.fit.worst} of a parent's height at ${PLAN.fit.at}`,
  dive: "the camera reaches the smallest doll's yellow dot, a flat yellow overlay covers 3 frames, and the camera continues out of the biggest doll's dot (a hidden cut)",
  framing: FRAMING.ok ? "ok" : "FAILS",
  numbers: "no data shown",
};
