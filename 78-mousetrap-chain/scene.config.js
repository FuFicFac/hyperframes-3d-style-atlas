// scene.config.js — 78-mousetrap-chain: "One becomes two becomes all" — how things go viral (style "mousetrap-chain").
// Plain data + the style's pure cascade planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Beats, labels, the camera pull-back and every snap / ball tick in SCORE come from the same plan
// the picture reads. Floor = XZ plane, x right, z toward the viewer.
import { STYLE_SPEC as S } from "./_atlas/styles/mousetrap-chain/spec.js";
import { planCascade, soundEvents, cascadeVoices, gridBox } from "./_atlas/styles/mousetrap-chain/cascade.js";
import { scoreFromEvents, minSeparation } from "./_atlas/kit/schedule.js";
import { fitShot, framingReport, boxCorners } from "./_atlas/kit/framing.js";

export const ID = "78-mousetrap-chain";
export const STYLE = "mousetrap-chain";
export const DURATION = 15;   // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- the plan
export const PLAN = planCascade(S);
const G = (k) => PLAN.genTime(k);                       // first snap of generation k
const r1 = (x) => Math.round(x * 10) / 10;
const T_STORM = G(6);                                   // 32+ traps at once: the floor erupts
const T_QUIET = r1(Math.max(...PLAN.balls.filter((b) => b.id !== PLAN.coda).map((b) => (b.tRest < Infinity ? b.tRest : 0))));
let tc = T_STORM + 1.5;
while (tc < DURATION - 2 && PLAN.airborneAt(tc) > 8) tc += 0.1;
const T_CALM = r1(tc);                                  // the storm is over: only a handful of balls still in the air

// ---------------------------------------------------------------- beats + labels (one at a time)
export const BEATS = [
  { id: "drop", t: 0, label: "One ball drops in" },
  { id: "two", t: r1(G(1)), label: "One becomes two" },
  { id: "doubling", t: r1(G(3)), label: "Four. Eight. Sixteen…" },
  { id: "eruption", t: r1(T_STORM), label: "Then everything at once" },
  { id: "silence", t: T_CALM, label: "Until nothing is left" },
];
BEATS.forEach((b, i) => { b.dur = r1((BEATS[i + 1]?.t ?? DURATION) - b.t); });
export const LABELS = [
  { text: BEATS[0].label, on: 0.15, off: G(1) - 0.15 },
  { text: BEATS[1].label, on: G(1) + 0.4, off: G(3) },
  { text: BEATS[2].label, on: G(3) + 0.45, off: T_STORM - 0.15 },
  { text: BEATS[3].label, on: T_STORM + 0.3, off: BEATS[4].t - 0.45 },
  { text: BEATS[4].label, on: BEATS[4].t, off: Infinity },
];

export const CHART_ON = G(1) - 0.6;                     // the dot chart appears just before the first snap

// ---------------------------------------------------------------- camera: close on one trap -> pull back -> LOCKED wide
const f = PLAN.traps[PLAN.first];
const FOV = S.camera.fov;
const CLOSE0 = fitShot({ box: [[f.x - 2.2, 0, f.z - 0.45], [f.x + 0.75, 0.7, f.z + 0.75]] }, { azimuth: 0.3, elevation: 0.36, fov: FOV, fill: 1 });
const CLOSE1 = fitShot({ box: [[f.x - 0.95, 0, f.z - 0.45], [f.x + 0.95, 0.7, f.z + 0.6]] }, { azimuth: 0.24, elevation: 0.38, fov: FOV, fill: 1 });
// MID: the first two generations' traps, with head-room for the arcs of the first thrown balls
const earlyTraps = PLAN.traps.filter((t) => PLAN.genOf[t.i] >= 1 && PLAN.genOf[t.i] <= 2);
const ex = earlyTraps.map((t) => t.x), ez = earlyTraps.map((t) => t.z);
const MID = fitShot({ box: [[Math.min(...ex) - 0.8, 0, Math.min(...ez) - 0.7], [Math.max(...ex) + 0.8, 1.35, Math.max(...ez) + 0.7]] }, { azimuth: 0.2, elevation: 0.42, fov: FOV, fill: 1 });
const FIELD = gridBox(S, 0.3, 0.25);
const WIDE = fitShot({ box: [FIELD.min, FIELD.max] }, { azimuth: 0.1, elevation: 0.5, fov: FOV, fill: 1, window: { x0: -0.96, x1: 0.96, y0: -0.95, y1: 0.8 }, align: [0, -1] });
const FILL = fitShot({ box: [FIELD.min, FIELD.max] }, { azimuth: 0.06, elevation: 0.7, fov: FOV, fill: 1, window: { x0: -0.96, x1: 0.96, y0: -0.95, y1: 0.62 } });
const T_LOCK = r1(T_STORM - 0.25);
const T_RISE = r1(T_CALM - 0.4);                        // after the storm: one slow rise to the shot the finished floor fills
const key = (t, s, extra = {}) => ({ t, pos: s.pos, target: s.target, fov: s.fov, ...extra });
export const CAMERA = [
  key(0, CLOSE0),
  key(G(1) - 0.1, CLOSE1, { ease: "inOutSine" }),
  key(G(1) + 0.8, MID, { ease: "inOutSine" }),          // follow the first two balls up
  key(T_LOCK, WIDE, { ease: "inOutCubic" }),
  key(T_RISE, WIDE),
  key(T_RISE + 2.4, FILL, { ease: "inOutSine" }),
  key(DURATION, FILL),
];

// framing gate: the first trap while the camera is close; the whole trap field once the camera is locked.
export const FRAMING = framingReport((t) => {
  const out = [];
  if (t < G(2)) out.push({ id: "first", pts: boxCorners([f.x - 0.3, 0, f.z - 0.4], [f.x + 0.3, 0.3, f.z + 0.4]) });
  if (t >= T_LOCK) out.push({ id: "field", pts: boxCorners(gridBox(S, 0).min, gridBox(S, 0).max) });
  return out;
}, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, safe: 0.96 });
if (!FRAMING.ok && !globalThis.process?.env?.TRAPS_NOGATE) throw new Error(`78-mousetrap-chain framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: one snap per trap + ball ticks from the plan
export const EVENTS = soundEvents(PLAN, S.sound);
const HALF = gridBox(S, 0).max[0];
export const SCORE = [
  { t: 0, type: "pad", dur: T_QUIET + 1.2, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 7, 12, 16], attack: 1.2, release: 2.4, brightness: S.sound.bed.brightness },
  { t: T_STORM - 0.2, type: "rumble", dur: Math.max(1.5, T_CALM - T_STORM), gain: 0.22, seed: 57 },
  ...scoreFromEvents(EVENTS, cascadeVoices(S.sound), { seedBase: 101, pan: (e) => Math.max(-0.7, Math.min(0.7, e.x / HALF * 0.7)) }),
];
export const DUCK = [];

// the countable generations must not have balls passing through each other in the air
const early = PLAN.balls.filter((b) => b.gen >= 0 && b.gen <= 3).map((b) => PLAN.track(b.id));
const SEP = minSeparation(early, 0, G(5), 1 / 60);
export const NOTES = {
  mechanism: "cascade.js simulates the chain once (seeded, event-driven): a landing on a set trap snaps it and throws its two balls, each aimed at a set trap nobody else is aiming at; closed-form ballistic legs, damped bounces, a roll to rest.",
  traps: PLAN.traps.length, sprung: PLAN.sprung, balls: PLAN.balls.length,
  generations: PLAN.counts.slice(1),
  times: { firstSnap: +G(1).toFixed(2), storm: +T_STORM.toFixed(2), calm: T_CALM, quiet: T_QUIET, lastBallRests: +PLAN.tEnd.toFixed(2), cameraLock: T_LOCK },
  earlySeparation: { gap: +SEP.d.toFixed(3), t: +(SEP.t ?? 0).toFixed(2) },
  soundEvents: EVENTS.length,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s, ${FRAMING.worst?.id})` : "FAILS",
};
