// scene.config.js — 71-galton-board: "Chance has a shape" — steel balls bounce down a Galton board and pile into a bell
// curve (style "galton-board"). Plain data + the style's pure ball planner. No THREE, no window: imported by scene.js
// (browser) and by render-sfx / export-spec (Node). Every peg tick, release click and bin note in SCORE comes from the
// same plan the picture reads. No numbers are shown on screen.
import { STYLE_SPEC as S } from "./_atlas/styles/galton-board/spec.js";
import { createPlan, layout, bellCurve, galtonVoices } from "./_atlas/styles/galton-board/plinko.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { fitShot, framingReport } from "./_atlas/kit/framing.js";

export const ID = "71-galton-board";
export const STYLE = "galton-board";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "one", t: 0, dur: 3.0, label: "One ball. Left or right?" },
  { id: "coin", t: 3.0, dur: 2.7, label: "Every peg is a coin flip" },
  { id: "path", t: 5.7, dur: 2.9, label: "Each path is pure chance" },
  { id: "pile", t: 8.6, dur: 3.3, label: "Together, a pattern" },
  { id: "shape", t: 11.9, dur: 3.1, label: "Chance has a shape" },
];
const Bt = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.15 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.45 : Infinity }));

// ---------------------------------------------------------------- the one plan
export const L = layout(S.board);
export const PLAN = createPlan(S, { start: Bt.one.t + 0.25 });
export const CURVE = { pts: bellCurve(S, PLAN.n, S.curve.samples), on: Bt.shape.t + 0.5, dur: 1.5 };

// ---------------------------------------------------------------- camera: fitted shots, frontal, locked during holds
const O = L.outer, Z0 = 0, Z1 = S.board.glassZ;
const REG = {
  top: [[-2.0, L.rowY(5) - 0.2, Z0], [2.0, L.innerTop + 0.1, Z1]],                 // hopper + the first six rows
  field: [[O.x0 + 0.1, L.dividerTop - 0.25, Z0], [O.x1 - 0.1, L.spoutY + 0.3, Z1]], // the whole peg triangle
  bins: [[O.x0, O.y0, Z0], [O.x1, L.rowY(8) + 0.1, Z1]],                           // bins + the last rows
  whole: [[O.x0, 0, O.z0], [O.x1, O.y1, O.z1]],
  final: [[O.x0, O.y0 + 0.1, Z0], [O.x1, L.rowY(6), Z1]],                          // the finished stacks + the curve
};
const WIN = { x0: -0.94, x1: 0.94, y0: -0.92, y1: 0.92 };
const shot = (box, az, el, fill = 1, extra = {}) => fitShot({ box }, { azimuth: az, elevation: el, fov: S.camera.fov, window: WIN, fill, ...extra });
const K = (t, s, o = {}) => ({ t, pos: s.pos, target: s.target, fov: S.camera.fov, ...o });
const SH = {
  top: shot(REG.top, 0.2, 0.03),
  field: shot(REG.field, 0.08, 0.02),
  bins: shot(REG.bins, -0.14, 0.06),
  whole: shot(REG.whole, 0.26, 0.05, 1, { window: { ...WIN, y0: -0.96, y1: 0.96 } }),
  final: shot(REG.final, 0.0, 0.03),
};
export const CAMERA = [
  K(0, SH.top),
  K(1.2, SH.top),
  K(Bt.coin.t, SH.field, { ease: "inOutSine" }),
  K(Bt.path.t - 0.2, SH.field),
  K(Bt.path.t + 1.5, SH.bins, { ease: "inOutSine" }),
  K(Bt.pile.t, SH.bins),
  K(Bt.pile.t + 1.5, SH.whole, { ease: "inOutSine" }),
  K(Bt.shape.t - 0.3, SH.whole),
  K(Bt.shape.t + 1.3, SH.final, { ease: "inOutSine" }),
  K(DURATION, SH.final),
];
// framing gate: at each hold the shot's own region must be inside the safe window
const HOLDS = [["top", 0, 1.2], ["field", Bt.coin.t, Bt.path.t - 0.2], ["bins", Bt.path.t + 1.5, Bt.pile.t], ["whole", Bt.pile.t + 1.5, Bt.shape.t - 0.3], ["final", Bt.shape.t + 1.3, DURATION]];
export const FRAMING = framingReport(HOLDS.map(([id, from, to]) => ({ id, box: REG[id], from, to, required: true })), CAMERA, { duration: DURATION, fov: S.camera.fov, safe: 0.97 });
if (!FRAMING.ok && !globalThis.process?.env?.GALTON_NOGATE) throw new Error(`71-galton-board framing: ${JSON.stringify(FRAMING.spans ?? FRAMING.worst)}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a quiet bed + the curve
export const EVENTS = PLAN.events();
const pan = (e) => Math.max(-0.7, Math.min(0.7, (e.x ?? 0) / 4));
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION + 0.5, root: S.sound.bed.root, chord: S.sound.bed.chord, attack: 0.5, release: 2.0, brightness: S.sound.bed.brightness, gain: S.sound.bed.gain, seed: 5 },
  ...scoreFromEvents(EVENTS, galtonVoices(S.sound, L), { seedBase: 171, pan }),
  // the bell curve is drawn on the glass: a pen stroke left to right, then a chime when it closes
  { t: CURVE.on, type: "penScratch", dur: CURVE.dur, gain: S.sound.curve.gain, pan: -0.3, seed: 9001 },
  { t: CURVE.on + CURVE.dur * 0.5, type: "penScratch", dur: CURVE.dur * 0.5, gain: S.sound.curve.gain * 0.8, pan: 0.3, seed: 9002 },
  { t: CURVE.on + CURVE.dur, type: "chime", dur: 2.0, gain: S.sound.final.gain, notes: 5, seed: 9003 },
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "plinko.js: per ball a seeded left/right choice per peg row -> closed-form path (drop, parabolic hop per row, ballistic fall, two bounces) -> bin and stack slot in arrival order. Struck pegs flash from the plan's hit times. SCORE = scoreFromEvents(plan events).",
  data: "SAMPLE DATA: the histogram is one seeded run of fair left/right choices (seed picked for a clean bell); no numbers are shown on screen.",
  balls: PLAN.n, rows: L.rows, bins: L.bins, histogram: PLAN.histogram,
  firstRelease: +PLAN.firstRelease.toFixed(2), lastRelease: +PLAN.lastRelease.toFixed(2), lastLand: +PLAN.lastLand.toFixed(2),
  events: EVENTS.length,
  framing: FRAMING.ok ? "ok" : `FAILS ${JSON.stringify(FRAMING.spans)}`,
};
