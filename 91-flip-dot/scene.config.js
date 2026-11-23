// scene.config.js — 91-flip-dot: "How an AI image appears out of noise" on a giant flip-disc sign (style "flip-dot").
// Plain data + the style's pure flip planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every click in SCORE comes from the same flip plan the discs read.
// Board = XY plane facing +Z, x right, y up; cell (c, r) counts from the top-left.
import { STYLE_SPEC as S } from "./_atlas/styles/flip-dot/spec.js";
import { dotGrid, noiseBits, PICTURES, denoisePasses, createPlan, flipVoices, boardBox, matchFraction } from "./_atlas/styles/flip-dot/flipplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, boxCorners, fitShot } from "./_atlas/kit/framing.js";

export const ID = "91-flip-dot";
export const STYLE = "flip-dot";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;
const SEED = 91; // the only source of randomness (kit hash01 / rng)

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "noise", t: 0, dur: 2.6, label: "Start with pure noise" },
  { id: "passes", t: 2.6, dur: 3.0, label: "Each pass removes noise" },
  { id: "close", t: 5.6, dur: 3.0, label: "Fewer discs flip each pass" },
  { id: "reveal", t: 8.6, dur: 3.0, label: "A picture snaps into view" },
  { id: "final", t: 11.6, dur: 3.4, label: "Noise in, picture out" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// one label at a time; the chip is only ever off for the ~0.2 s it takes to swap the text
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0 : 0.1), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.22 : Infinity }));

// ---------------------------------------------------------------- the picture and the denoising passes
export const GRID = dotGrid(S.board);
export const PICTURE = PICTURES.cat(GRID);
const WINK = PICTURES.cat(GRID, { wink: true });
// noise level per pass: 1 = pure noise (no trace of the picture), 0 = the picture
// the reveal pass (0.6 -> 0.08) leaves only 8 % of discs noisy, so the eye the close-up sits on reads the moment the
// wave passes; a light edge bias still lets the big shapes settle a touch before the fine detail
const LEVELS = [1, 0.9, 0.78, 0.6, 0.08, 0.03, 0];
const DN = denoisePasses(PICTURE, GRID, { levels: LEVELS, seed: SEED, edgeBias: 0.08, edgeReach: 4 });
const INITIAL = noiseBits(GRID, SEED);
/** the close-up looks at the cat's right eye (still noise at that point); the reveal wave starts there */
export const FOCUS_CELL = [38, 18.5];
export const FOCUS = GRID.point(FOCUS_CELL[0], FOCUS_CELL[1], 0);

export const PLAN = createPlan(GRID, S.flip, {
  initial: INITIAL,
  steps: [
    { id: "reroll", t: B.noise.t + 0.35, to: DN.passes[0], wave: { type: "scan", dir: [1, -0.25] }, spread: 0.95 },
    { id: "pass1", t: B.passes.t + 0.1, to: DN.passes[1], wave: { type: "scan", dir: [0.2, -1] }, spread: 0.8 },
    { id: "pass2", t: B.passes.t + 1.45, to: DN.passes[2], wave: { type: "scan", dir: [-0.2, -1] }, spread: 0.8 },
    { id: "pass3", t: B.close.t + 0.4, to: DN.passes[3], wave: { type: "random", seed: SEED + 3 }, spread: 2.0, jitter: 0 },
    { id: "pass4", t: B.reveal.t + 0.1, to: DN.passes[4], wave: { type: "radial", c: [FOCUS[0], FOCUS[1]] }, spread: 1.25 },
    { id: "pass5", t: B.reveal.t + 2.05, to: DN.passes[5], wave: { type: "random", seed: SEED + 5 }, spread: 0.5, jitter: 0 },
    { id: "pass6", t: B.final.t + 0.2, to: DN.passes[6], wave: { type: "random", seed: SEED + 6 }, spread: 0.9, jitter: 0 },
    { id: "wink", t: B.final.t + 1.95, to: WINK, wave: { type: "rows" }, spread: 0.1, jitter: 0.03 },
    { id: "unwink", t: B.final.t + 2.6, to: PICTURE, wave: { type: "rows", reverse: true }, spread: 0.1, jitter: 0.03 },
  ],
});
const step = (id) => PLAN.steps.find((s) => s.id === id);

// ---------------------------------------------------------------- camera: angled wide -> close-up -> pull back -> full frame
// Two moves only, both while discs are flipping; every hold is pixel-still (2304 disc edges cost bitrate when they move).
const SIGN = boardBox(GRID, { margin: S.housing.margin + S.housing.bezel, depth: S.housing.front });
const FOV = S.camera.fov;
const DISCS = boardBox(GRID, { margin: 0, depth: 0 });
const shot = (azimuth, elevation, fill, box = DISCS) => { const k = fitShot({ box }, { azimuth, elevation, fov: FOV, fill, window: { x0: -1, x1: 1, y0: -1, y1: 1 } }); return { pos: k.pos, target: k.target, fov: FOV }; };
// angled wides fit the DISC area edge to edge (the near bezel leaves the frame); the final frame fits the whole sign
const OPEN = shot(-0.22, -0.03, 1.0), FULL = shot(0, 0, 0.965, SIGN);
const CU = { az: 0.52, el: 0.17, dist: 3.3 };
const CLOSE = {
  pos: [FOCUS[0] + CU.dist * Math.sin(CU.az) * Math.cos(CU.el), FOCUS[1] + CU.dist * Math.sin(CU.el), CU.dist * Math.cos(CU.az) * Math.cos(CU.el)],
  target: [FOCUS[0], FOCUS[1], 0], fov: FOV,
};
const PUSH_IN = step("pass2").last - 0.2;              // the push-in starts as the last wide pass lands
const PULLED_BACK = step("pass4").last + 0.3;
export const CAMERA = [
  { t: 0, ...OPEN },
  { t: PUSH_IN, ...OPEN },
  { t: step("pass3").t + 0.1, ...CLOSE, ease: "inOutCubic" },
  { t: step("pass4").t - 0.1, ...CLOSE },
  { t: PULLED_BACK, ...FULL, ease: "inOutSine" },   // the pull-back rides the reveal wave and lands head-on
  { t: DURATION, ...FULL },
];

// ---------------------------------------------------------------- framing gate
// Wides: the picture area (the cat's head) stays inside the frame. Close-up: the focus patch stays inside the middle of the frame.
const signPts = [GRID.point(16, 1), GRID.point(48, 1), GRID.point(16, 34), GRID.point(48, 34)];
const patch = boxCorners([FOCUS[0] - 0.7, FOCUS[1] - 0.45, 0], [FOCUS[0] + 0.7, FOCUS[1] + 0.45, 0]);
function regions(t) {
  const out = [];
  if (t <= PUSH_IN || t >= PULLED_BACK) out.push({ id: "sign", pts: signPts });
  out.push({ id: "focus", pts: patch, window: { x0: -0.8, x1: 0.8, y0: -0.8, y1: 0.8 } });
  return out;
}
export const FRAMING = framingReport(regions, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, safe: 0.995 });
if (!FRAMING.ok && !globalThis.process?.env?.FLIP_NOGATE) throw new Error(`91-flip-dot framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + accents + a soft bed
export const EVENTS = PLAN.events(S.sound, { t0: 0, t1: DURATION });
// the discs in the close-up frame land with a nearer, woodier clack while the camera is there
const NEAR = { c0: Math.floor(FOCUS_CELL[0]) - 8, c1: Math.floor(FOCUS_CELL[0]) + 7, r0: Math.floor(FOCUS_CELL[1]) - 4, r1: Math.floor(FOCUS_CELL[1]) + 4 };
export const NEAR_FLIPS = PLAN.flipsIn(NEAR, step("pass3").t, step("pass4").t - 0.2);
const A = S.sound.accent;
const hf = (i, k) => ((Math.imul(i + 1, 2654435761) >>> 0) % 1000) / 1000 * k;
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 7, 12, 19], attack: 1.2, release: 2.0, brightness: S.sound.bed.brightness },
  ...scoreFromEvents(EVENTS, flipVoices(S.sound), { seedBase: 101 }),
  ...NEAR_FLIPS.map((f, k) => ({ t: f.t + PLAN.landAt, type: A.type, gain: A.gain, pitch: A.pitch * (f.to ? 1.1 : 0.92) * (0.95 + hf(f.i, 0.1)), dur: A.dur, pan: 0, seed: 5000 + k * 3 })),
  { t: PUSH_IN, type: "whoosh", dir: "in", dur: 1.2, gain: 0.16, pan: 0.2, seed: 7001 },
  { t: step("pass4").t, type: "whoosh", dir: "out", dur: 1.2, gain: 0.2, pan: 0, seed: 7002 },
  { t: step("pass4").last + PLAN.landAt, type: "chime", dur: 1.6, gain: 0.3, notes: 4, pitch: 1.0, seed: 7003 },
  { t: step("unwink").last + PLAN.landAt + 0.05, type: "chime", dur: 0.6, gain: 0.2, notes: 3, pitch: 1.5, seed: 7004 },
];
export const DUCK = [];
export const NOTES = {
  mechanism: "flipplan.js: a seeded noise bitmap, then denoisePasses(picture) at noise levels " + LEVELS.join(" / ") + " (level 1 = pure noise, 0 = picture); createPlan turns each change of bitmap into single-disc flip events ordered by a scan / radial / random wave; each disc's angle is a closed form of its last flip.",
  discs: GRID.n,
  flips: PLAN.flips.length,
  steps: PLAN.steps.map((s) => ({ id: s.id, t: s.t, first: +s.first.toFixed(3), last: +s.last.toFixed(3), end: +s.end.toFixed(3), flips: s.count, match: +matchFraction(s.to, PICTURE).toFixed(3) })),
  openingMatch: +matchFraction(INITIAL, PICTURE).toFixed(3),
  nearFlips: NEAR_FLIPS.length,
  scoreEvents: SCORE.length,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s, ${FRAMING.worst?.id})` : "FAILS",
  honesty: "A simplified picture of diffusion: real models predict and remove noise in a learned latent space; here each pass re-rolls the still-noisy discs and fixes the rest.",
};
