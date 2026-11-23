// scene.config.js — 105-tensegrity: "Nothing touches" (distributed support and interdependence), style "tensegrity".
// Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every node position, cord tension, glow, contact and sound comes from the one PLAN (tower.js).
// World: the tower stands at the origin on the table (y = 0); the weight and the snips wait at the front-left.
import { STYLE_SPEC as S } from "./_atlas/styles/tensegrity/spec.js";
import { createPlan, towerVoices, panOf } from "./_atlas/styles/tensegrity/tower.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "105-tensegrity";
export const STYLE = "tensegrity";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard, approved: times and labels as written)
export const BEATS = [
  { id: "gaps", t: 0, dur: 3, label: "Sticks that never touch" },
  { id: "cords", t: 3, dur: 3, label: "The cords carry it" },
  { id: "press", t: 6, dur: 3, label: "Press down. All share." },
  { id: "cut", t: 9, dur: 2.5, label: "Cut one cord" },
  { id: "lean", t: 11.5, dur: 3.5, label: "Each leans on all" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// one label at a time with no empty gap: each fades out over the 0.2 s before the next beat, the next fades in from its beat
export const LABEL_FADE = { in: 0.25, out: 0.2 };
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: i ? b.t : 0.05, off: BEATS[i + 1] ? BEATS[i + 1].t - LABEL_FADE.out - 0.02 : Infinity }));

// ---------------------------------------------------------------- the one plan
export const TIMING = {
  lightFrom: B.cords.t + 0.15, lightStep: 0.095,                       // beat 2: cords light bottom -> top
  place: { lift: B.press.t + 0.05, land: B.press.t + 0.95 },            // beat 3: the weight is set on top
  snips: { lift: B.cut.t - 0.05, arrive: B.cut.t + 0.85, open: B.cut.t + 0.95, close: B.cut.t + 1.55 },
  cut: B.cut.t + 2.1,                                                    // beat 4: the snips close on one cord
  slump: { from: B.cut.t + 2.16, dur: 1.5 },                             // beat 5: the solved slump
  retreat: { from: B.cut.t + 2.15, dur: 0.8 },
};
export const PLAN = createPlan({ tower: S.tower, timing: TIMING, end: DURATION });

// ---------------------------------------------------------------- camera
const FOV = S.camera.fov;
const WIN = { x0: -0.2, x1: 0.94, y0: -0.94, y1: 0.92 };                // the caption plate owns the top-left corner
const bounds = (X) => {
  const lo = [Infinity, 0, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < PLAN.n; i++) for (let q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], X[3 * i + q]); hi[q] = Math.max(hi[q], X[3 * i + q]); }
  return [lo, hi];
};
const TOWER1 = bounds(PLAN.P1), TOWER3 = bounds(PLAN.P3);
const WTOP = [[TOWER1[0][0], 0, TOWER1[0][2]], [TOWER1[1][0], TOWER1[1][1] + 0.5, TOWER1[1][2]]];   // with the weight on top
const shot = (box, az, el, o = {}) => {
  const k = fitShot({ box }, { azimuth: az, elevation: el, fov: FOV, window: WIN, fill: 0.96, ...o });
  return { pos: k.pos, target: k.target, fov: o.fov ?? FOV };
};
const LEFT = { align: [-0.5, 0] };                                       // nudge the tall tower toward the middle
const OPEN = shot(TOWER1, -0.62, 0.13, LEFT);
const ORBIT = shot(TOWER1, -0.05, 0.15, LEFT);
const RISE = shot(TOWER1, 0.42, 0.2, LEFT);
const PRESS = shot(WTOP, 0.2, 0.3, LEFT);
const PRESS2 = shot(WTOP, 0.05, 0.26, LEFT);
// close-up on the cut: look across the snips' blade plane at the cut point
const cp = PLAN.cutPoint(TIMING.cut), sn = PLAN.snips(TIMING.cut);
const side = Math.abs(sn.pivotAxis[1]) > 0.6 ? Math.sign(sn.pivotAxis[1]) : Math.sign(sn.pivotAxis[2]);   // above, or in front of, the blades
const look = [0, 1, 2].map((q) => side * sn.pivotAxis[q] * 0.8 + sn.axis[q] * 0.35 + (q === 1 ? 0.25 : 0));
const ll = Math.hypot(...look);
const CLOSE_D = 2.35;
const aim = (off, up) => [0, 1, 2].map((q) => cp[q] + sn.axis[q] * off + (q === 1 ? up : 0));
const CLOSE = { pos: aim(0.1, 0.2).map((x, q) => x + (look[q] / ll) * CLOSE_D), target: aim(0.1, 0.2), fov: FOV };
const CLOSE2 = { pos: aim(0.06, 0.16).map((x, q) => x + (look[q] / ll) * (CLOSE_D - 0.3)), target: aim(0.06, 0.16), fov: FOV };
const WIN_END = { x0: -0.36, x1: 0.94, y0: -0.94, y1: 0.92 };           // the last caption is short: more room on the left
const TOP3 = [[TOWER3[0][0], 0.45, TOWER3[0][2]], TOWER3[1]];             // the slumped tower; its feet may leave the bottom edge
const FINAL = shot(TOP3, -0.25, 0.22, { fill: 0.98, window: WIN_END });
const FINAL2 = shot(TOP3, -0.42, 0.2, { fill: 1.0, window: WIN_END });
export const CAMERA = [
  { t: 0, ...OPEN },
  { t: B.cords.t, ...ORBIT, ease: "linear", path: "arc" },
  { t: B.press.t, ...RISE, ease: "inOutSine", path: "arc" },
  { t: TIMING.place.land + 0.3, ...PRESS, ease: "inOutSine", path: "arc" },
  { t: B.cut.t - 0.05, ...PRESS2, ease: "inOutSine" },
  { t: TIMING.snips.arrive + 0.1, ...CLOSE, ease: "inOutCubic" },
  { t: TIMING.cut, ...CLOSE2, ease: "inOutSine" },
  { t: TIMING.slump.from + 1.25, ...FINAL, ease: "inOutSine" },
  { t: DURATION, ...FINAL2, ease: "outSine", path: "arc" },
];

// ---------------------------------------------------------------- framing gate: the tower stays in frame in the wide shots
export const FRAMING = framingReport([
  { id: "tower-open", box: TOWER1, from: 0, to: TIMING.place.lift, required: true },
  { id: "tower-press", box: WTOP, from: TIMING.place.land + 0.3, to: B.cut.t - 0.05, required: true },
  { id: "tower-final", box: TOP3, from: TIMING.slump.from + 1.25, to: DURATION, required: true },
], CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, window: { x0: -0.97, x1: 0.97, y0: -0.97, y1: 0.97 } });

if (!FRAMING.ok && !globalThis.process?.env?.TG_NOGATE) {
  throw new Error(`105-tensegrity framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events (one pluck per cord, pitched by tension)
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, towerVoices(S.tower.sound), { seedBase: 105, pan: panOf(S.tower.radius) });
export const DUCK = [];
export const NOTES = {
  mechanism: "tower.js: three twisted three-strut levels joined by zig-zag cord rings; P1/P2/P3 solved by damped relaxation (struts stiff, cords tension-only, contact after the cut); glow ~ T/Tmax; pitch ~ sqrt(T)/L.",
  plan: `Tmax ${PLAN.Tref.toFixed(1)}; cut cord ${PLAN.cut} (${PLAN.cutCord.kind}); contacts ${PLAN.contacts.map((c) => `${c.i}-${c.j}@${c.t.toFixed(2)}s`).join(", ")}`,
  framing: FRAMING.ok ? "ok" : `FAILS ${JSON.stringify(FRAMING.spans.slice(0, 4))}`,
  numbers: "no numbers on screen",
};
