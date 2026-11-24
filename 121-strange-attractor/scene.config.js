// scene.config.js — 121-strange-attractor: "A tiny difference" (style "strange-attractor"). Plain data + the style's pure
// planner. No THREE, no window: imported by scene.js (browser) and by render-sfx / export-spec (Node).
// One plan (lorenz.js) is the single source of truth: the tubes and beads on screen, the gap gauge, the camera keys,
// the framing gate and every sound cue (each bead sings its height) all read it.
import { STYLE_SPEC as S } from "./_atlas/styles/strange-attractor/spec.js";
import { createPlan, noteEvents, worldMap } from "./_atlas/styles/strange-attractor/lorenz.js";
import { framingReport, fitShot, pxRect } from "./_atlas/kit/framing.js";

export const ID = "121-strange-attractor";
export const STYLE = "strange-attractor";
export const TITLE = "A tiny difference";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard 121, labels word for word)
export const BEATS = [
  { id: "rule", t: 0.0, dur: 2.8, label: "One rule, followed exactly" },
  { id: "twin", t: 2.8, dur: 3.2, label: "A twin starts a hair apart" },
  { id: "agree", t: 6.0, dur: 3.0, label: "They agree... for a while" },
  { id: "part", t: 9.0, dur: 3.0, label: "Then they part for good" },
  { id: "cloud", t: 12.0, dur: 3.0, label: "Unpredictable, same shape" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b) => ({ text: b.label, on: b.t }));
// label change: a 0.26 s counter-wheel roll that completes 0.04 s before each beat start (always exactly one label)
export const LABEL_ROLL = { roll: 0.26, lead: 0.04 };

// ---------------------------------------------------------------- the one plan
export const SPLIT_AT = B.part.t + 0.3; // storyboard: the twins part at 9.3 s +- 0.2
export const PLAN = createPlan({
  ...S.sim, end: DURATION, twinAt: B.twin.t,
  split: { ...S.sim.split, at: SPLIT_AT },
  cloud: { ...S.sim.cloud, at: B.cloud.t },
});
// Node (sound, camera) and Chrome (picture) each integrate the plan; the twin search and the split decide what the
// viewer sees and hears, so both must agree to the bit. RUN_HASH was recorded from this code in Node and confirmed in
// the page (window.__saHash); any other value fails here in both environments.
export const RUN_HASH = "60846d09";
if (typeof globalThis.window !== "undefined") globalThis.window.__saHash = PLAN.hash;
if (PLAN.hash !== RUN_HASH && !globalThis.process?.env?.SA_RECORD) {
  throw new Error(`121-strange-attractor: table hash ${PLAN.hash} != recorded ${RUN_HASH} (${typeof globalThis.window !== "undefined" ? "browser" : "node"})`);
}
export const SPLIT = PLAN.split;

// ---------------------------------------------------------------- camera
const W = worldMap(S.world.scale, S.world.lift);
const FOV = S.camera.fov;
const CAP = pxRect(S.caption.x - 10, S.caption.y - 10, S.caption.w + 20, S.caption.h + 20);
const GAUGE = pxRect(S.gauge.x - 8, S.gauge.y - 8, S.gauge.w + 16, S.gauge.h + 16);
const BADGE = pxRect(0, 0, 150, 120); // the reel's number badge (top-left)
const WIN = { x0: -0.95, x1: 0.95, y0: CAP.y1 + 0.03, y1: 0.93 };
const kOf = (t) => Math.max(0, Math.min(PLAN.nA, Math.round(PLAN.T.tau(t) / PLAN.h)));
/** world points of the coral path between video times (every `step` integration steps) */
const pathA = (t0, t1, step = 12) => {
  const out = [];
  for (let k = kOf(t0); k <= kOf(t1); k += step) out.push(W(PLAN.A[3 * k], PLAN.A[3 * k + 1], PLAN.A[3 * k + 2]));
  return out;
};
const pathB = (t0, t1, step = 12) => {
  const out = [];
  for (let k = Math.max(PLAN.kTw, kOf(t0)); k <= kOf(t1); k += step) {
    const j = k - PLAN.kTw;
    out.push(W(PLAN.B[3 * j], PLAN.B[3 * j + 1], PLAN.B[3 * j + 2]));
  }
  return out;
};
const heads = (t) => {
  const a = PLAN.headA(t), out = [W(a[0], a[1], a[2])];
  if (t >= PLAN.twinAt) { const b = PLAN.headB(t); out.push(W(b[0], b[1], b[2])); }
  return out;
};
const trailOf = (t) => {
  const kn = S.tube.trail;
  if (t <= kn[0][0]) return kn[0][1];
  for (let i = 1; i < kn.length; i++) if (t <= kn[i][0]) return kn[i - 1][1] + ((kn[i][1] - kn[i - 1][1]) * (t - kn[i - 1][0])) / (kn[i][0] - kn[i - 1][0]);
  return kn[kn.length - 1][1];
};
/** everything on screen between t0 and t1: each tube's trail window (and the heads) */
const drawn = (t0, t1, step = 12) => {
  const ta = PLAN.T.tOf(Math.max(0, PLAN.T.tau(t0) - trailOf(t0)));
  return [...pathA(ta, t1, step), ...(t1 >= PLAN.twinAt ? pathB(Math.max(ta, PLAN.twinAt), t1, step) : []), ...heads(t1)];
};
const ALL = [...pathA(0, DURATION, 16), ...pathB(B.twin.t, DURATION, 16)];
const shot = (pts, az, el, o = {}) => {
  const k = fitShot(pts, { azimuth: az, elevation: el, fov: FOV, window: WIN, fill: 0.92, ...o });
  return { pos: k.pos, target: k.target, fov: FOV };
};
// beat 1: the first loops; beat 2: the twin joins at the head, the frame widens with the drawing; beat 3: the whole
// butterfly, a slow orbit; beat 4: swing to face the fork (front view: one goes left, one right), then back out;
// beat 5: wide on both wings while the cloud bursts.
const OPEN0 = shot(drawn(0, 1.7), 0.55, 0.16, { fill: 0.9 });
const OPEN1 = shot(drawn(0, 4.4), 0.62, 0.16, { fill: 0.94 });
const TWIN1 = shot(drawn(2.8, 7.2), 0.72, 0.16, { fill: 0.96 });
const AGREE0 = shot(drawn(6.5, 8.8), 0.74, 0.15, { fill: 0.97 });
const AGREE1 = shot(drawn(8.5, 9.0), 0.9, 0.13, { fill: 0.97 });
// the fork: the twins dive down the middle together, then one is thrown left and one right. Their parting direction is
// mostly along the Lorenz y axis, so the camera faces it from azimuth ~1.07 rad (the gap opens across the screen).
const AZF = 1.07;
const FORK0 = shot([...heads(9.35), ...heads(9.75), ...heads(10.0), ...pathA(9.15, 9.45, 4)], AZF, 0.08, { fill: 0.62, align: [0, -0.1] });
const FORK1 = shot([...heads(10.0), ...heads(10.35), ...heads(10.7), ...pathA(9.6, 10.7, 4), ...pathB(9.6, 10.7, 4)], AZF - 0.05, 0.12, { fill: 0.92 });
const PART1 = shot(drawn(10.9, 12.0), 1.0, 0.14, { fill: 0.98 });
const WIDE1 = shot(drawn(12.5, 15), 1.0, 0.2, { fill: 1.0 });
const K = (t, s, ease = "inOutSine", path) => ({ t: +t.toFixed(3), pos: s.pos, target: s.target, fov: FOV, ease, ...(path ? { path } : {}) });
export const CAMERA = [
  K(0, OPEN0),
  K(2.6, OPEN1, "inOutSine"),
  K(B.agree.t - 0.2, TWIN1, "inOutSine"),
  K(B.agree.t + 0.8, AGREE0, "inOutSine"),
  K(B.part.t - 0.2, AGREE1, "inOutSine", "arc"),
  K(9.55, FORK0, "inOutCubic", "arc"),
  K(10.0, FORK0, "linear"),
  K(10.55, FORK1, "inOutSine"),
  K(B.cloud.t - 0.25, PART1, "inOutSine", "arc"),
  K(DURATION, WIDE1, "inOutSine", "arc"),
];

// ---------------------------------------------------------------- framing gate (replays the rig exactly)
// Required inside WIN (above the caption plate), clear of the badge corner and the gauge: the beads at all times, the
// path drawn so far in beats 1-2, the whole butterfly from beat 3 on (except the fork close-up, where the twins are).
const gate = (t) => {
  const out = [{ id: "heads", pts: heads(t) }];
  if (t < B.part.t - 0.3 || t > B.cloud.t - 0.3) out.push({ id: "drawn", pts: drawn(t, t, 24) });
  return out;
};
export const FRAMING = framingReport(gate, CAMERA, {
  duration: DURATION, drift: S.camera.drift, fov: FOV, window: { ...WIN, x0: -0.98, x1: 0.98, y1: 0.97 },
  keepOut: [{ id: "badge", ...BADGE }, { id: "gauge", ...GAUGE, from: B.twin.t }],
});
if (!FRAMING.ok && !globalThis.process?.env?.SA_NOGATE) {
  throw new Error(`121-strange-attractor framing: ${JSON.stringify({ spans: FRAMING.spans.slice(0, 6), worst: FRAMING.worst })}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: every cue from the PLAN
// Each bead sings its height (a plucked string every 0.25 s, snapped to a pentatonic scale). Before the split the twin
// plays the coral note plus a detune that grows with the gap (same pluck, so: perfect unison, then a slow beat); after
// it, each sings its own line. A swell of many quiet voices (cloud beads) and a warm pad bed under everything.
const SND = S.sound, V = SND.voice;
export const NOTES = noteEvents(PLAN, {
  step: V.step, zMid: V.zMid, semiPerUnit: V.semiPerUnit, scale: V.scale, splitT: SPLIT.t, detune: V.detune, detuneRef: V.detuneRef,
  cloudVoices: SND.cloud.voices, cloudStep: SND.cloud.step, end: DURATION,
});
const hzOf = (semi) => V.hz * Math.pow(2, semi / 12);
const panOf = (x) => Math.max(-0.7, Math.min(0.7, x / 22));
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: SND.bed.gain, root: SND.bed.root, chord: [0, 7, 12], attack: 1.0, release: 2.0, brightness: SND.bed.brightness, seed: 3 },
  ...NOTES.map((e) => (e.kind === "note"
    ? { t: e.t, type: "pluck", hz: hzOf(e.semi), dur: V.decay + 0.2, decay: V.decay, bright: V.bright, gain: V.gain, pan: panOf(e.x) * (e.who ? 1 : 1), seed: 1000 + e.k }
    : { t: e.t, type: "pluck", hz: hzOf(e.semi + 12), dur: 0.9, decay: 0.7, bright: 0.6, gain: SND.cloud.gain * (0.5 + 0.5 * Math.min(1, e.u * 3)), pan: panOf(e.x), seed: 5000 + e.who * 97 + e.k })),
  { t: SPLIT.t - 0.1, type: "whoosh", dir: "out", dur: 1.0, gain: SND.fork.gain, pitch: 0.7, seed: 11 },
  { t: B.cloud.t, type: "pad", bus: "sfx", dur: DURATION - B.cloud.t, gain: SND.swell.gain, root: SND.swell.root, chord: [0, 4, 7, 11, 14], attack: 1.4, release: 0.8, brightness: SND.swell.brightness, seed: 13 },
  { t: B.cloud.t + 0.02, type: "sparkle", dur: 0.9, notes: 8, gain: 0.1, seed: 17 },
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES_INFO = {
  mechanism: "lorenz.js integrates the Lorenz system (s 10, r 28, b 8/3) with fixed-step RK4 at load; the twin's offset is searched so the paths part on opposite wings at 9.3 s +- 0.2; the cloud is 200 starts in a speck at the fork.",
  hash: PLAN.hash,
  delta: PLAN.delta,
  split: { t: +SPLIT.t.toFixed(3), forkT: +SPLIT.forkT.toFixed(3), agree: +SPLIT.agree.toFixed(3), rejoinMin: +SPLIT.rejoin.min.toFixed(2), preroll: SPLIT.preroll, tried: SPLIT.tried },
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s, ${FRAMING.worst?.id})` : `FAILS ${JSON.stringify(FRAMING.spans.slice(0, 4))}`,
  notes: NOTES.length,
};
