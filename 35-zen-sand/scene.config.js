// scene.config.js — 35-zen-sand: "clearing the noise" in a raked dry garden (style "zen-sand").
// Plain data + pure helpers. No THREE, no window: imported by scene.js (browser) and by render-sfx / export-spec (Node).
// The sand program is planned HERE with the style's pure planner (sandplan.js); BEATS, the camera keys, the captions and
// every hiss / knock / bowl tone in SCORE derive from that one plan. Plan coords: metres on the sand, +y away from camera.
import { STYLE_SPEC } from "./_atlas/styles/zen-sand/spec.js";
import { planSand, sandVoices, bowlTone } from "./_atlas/styles/zen-sand/sandplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "35-zen-sand";
export const STYLE = "zen-sand";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---- the garden
export const STONES = [
  { id: "big", x: 1.3, y: -0.05, rx: 0.34, ry: 0.28, h: 0.24, seed: 4, yaw: 0.3 },
  { id: "small", x: 1.86, y: 0.88, rx: 0.16, ry: 0.14, h: 0.13, seed: 12, yaw: -0.5 },
];
export const MOSS = [{ x: 1.52, y: 0.18, r: 0.085, seed: 21 }, { x: 1.7, y: 0.98, r: 0.05, seed: 22, count: 30 }];
const [BIG, SMALL] = STONES;
const CLEAR = [-2.25, -1.25, 0.56, 1.25];

// ---- the sand program (pre items are already in the sand at t = 0)
const LINES = Array.from({ length: 6 }, (_, k) => {
  const y = -1.05 + k * 0.42, xs = k % 2 ? [2.35, -2.35] : [-2.35, 2.35];
  return { id: `pre-lines-${k}`, type: "rake", pre: true, tines: 6, spacing: 0.07, path: [[xs[0], y], [xs[1], y]] };
});
export const PROGRAM = [
  ...LINES,
  { id: "pre-ring", type: "rings", pre: true, c: [SMALL.x, SMALL.y], r: 0.3, tines: 3, spacing: 0.07, a0: -90, sweep: 364 },
  { id: "pre-noise", type: "scribble", pre: true, rect: [-2.0, -1.05, 0.45, 1.05], n: 7, len: 2.2, seed: 11 },
  // beat 1: a flat board drags across and erases the noise
  { id: "clear", type: "smooth", rect: CLEAR, at: 0.15 },
  // beat 2: the stylus writes one word
  { id: "word", type: "text", text: "FOCUS", cap: 0.48, x: -0.86, y: 0.2, gap: 0.12 },
  // beat 3: the rolling ball draws an arrow toward the stone
  { id: "arrow", type: "arrow", a: [-1.72, -0.24], b: [0.22, -0.24], head: 0.2, tool: "ball", gap: 0.12 },
  // beat 4: the rake comes in along a straight path and circles the stone: concentric rings
  { id: "rings", type: "rings", c: [BIG.x, BIG.y], r: 0.555, tines: 4, spacing: 0.075, a0: -90, sweep: 366, enter: [[-0.35, BIG.y - 0.555], [BIG.x, BIG.y - 0.555]], gap: 0.12 },
];
export const PLAN = planSand(PROGRAM, STYLE_SPEC.plan);
const I = PLAN.byId;

// ---- beats (derived from the plan, so retiming the program retimes the camera, captions and sound)
export const BEATS = [
  { id: "clear", t: 0, dur: I.word.start, label: "CLEAR THE NOISE" },
  { id: "word", t: I.word.start, dur: I.arrow.start - I.word.start, label: "NAME WHAT MATTERS" },
  { id: "arrow", t: I.arrow.start, dur: I.rings.start - I.arrow.start, label: "PICK ONE DIRECTION" },
  { id: "rings", t: I.rings.start, dur: DURATION - I.rings.start, label: "LET THE REST SETTLE" },
];
if (I.rings.end > DURATION - 0.4) throw new Error(`plan overruns: rings end ${I.rings.end.toFixed(2)} s`);
const C = STYLE_SPEC.caption;
export const LABELS = BEATS.map((b, i) => ({
  text: b.label,
  t0: b.t + (i ? 0 : 0.2),
  t1: i < BEATS.length - 1 ? BEATS[i + 1].t - C.lead : DURATION + 1,
}));

// ---- camera: high three-quarter shots on plan targets
const shot = (x, y, dist, elev = 0.92, yaw = 0, fov = 30) => {
  const ce = Math.cos(elev), tgt = [x, 0, -y];
  return { pos: [tgt[0] + Math.sin(yaw) * ce * dist, Math.sin(elev) * dist, tgt[2] + Math.cos(yaw) * ce * dist].map((v) => +v.toFixed(4)), target: tgt, fov };
};
const SHOTS = {
  wide: shot(0, 0.02, 5.25, 0.94),
  word: shot(-0.86, 0.47, 3.3, 0.98, -0.03),
  arrow: shot(-0.72, 0.2, 3.5, 0.97, -0.02),
  rings: shot(0.62, -0.02, 3.9, 0.95, 0.06),
  end: shot(0.05, 0.02, 5.1, 0.98, 0.0),
};
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const key = (t, s, ease = "inOutSine") => ({ t: +t.toFixed(3), ...s, ease });
export const CAMERA = [
  key(0, SHOTS.wide),
  key(I.clear.end - 0.3, SHOTS.wide),
  key(B.word.t + 1.1, SHOTS.word),
  key(I.word.end - 0.2, SHOTS.word),
  key(B.arrow.t + 0.8, SHOTS.arrow),
  key(B.rings.t + 0.2, SHOTS.arrow),
  key(B.rings.t + 1.5, SHOTS.rings),
  key(I.rings.end - 0.6, SHOTS.rings),
  key(DURATION - 0.2, SHOTS.end),
];

export const OBJECTS = [
  {
    id: "garden", primitive: "procedural", factory: "garden",
    procedural: "4.4 x 2.5 m tray of pale sand in a wooden frame on a dark table: a height field rebuilt from t by the zen-sand planner (rake lines, rings, traced word, arrow, board erase) shaded by a low sun; two smooth dark stones, moss, rake / stylus / rolling ball / smoothing board posed from the same plan",
    dims: { program: PROGRAM, stones: STONES, moss: MOSS },
  },
];

// ---- SCORE: hiss / knocks from the plan, a low bowl tone on every beat, a quiet warm bed
const S = STYLE_SPEC.sound;
const pan = (e) => Math.max(-0.5, Math.min(0.5, (e.x ?? 0) * 0.2));
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.bed.gain, root: S.bed.root, chord: S.bed.chord, attack: S.bed.attack, release: S.bed.release, brightness: S.bed.brightness },
  ...BEATS.flatMap((b, i) => bowlTone(b.t + (i ? 0 : 0.05), { ...S.bowl, pitch: S.bowl.pitch * [1, 1.122, 1.26, 0.89][i], seed: 400 + i * 10 })),
  ...scoreFromEvents(PLAN.events, sandVoices(S), { pan, seedBase: 101 }),
];
export const DUCK = [];
export const NOTES = {
  items: PLAN.items.filter((it) => !it.pre).map((it) => ({ id: it.id, type: it.type, start: +it.start.toFixed(3), end: +it.end.toFixed(3) })),
  contacts: PLAN.ops.length,
  mechanism: "Sand = height field rebuilt per frame from planSand(PROGRAM) (completed-op prefix cache keyed by op count + the in-progress op applied on a copy); hiss/knocks = scoreFromEvents(PLAN.events, sandVoices()); bowl tone per BEATS entry.",
};
