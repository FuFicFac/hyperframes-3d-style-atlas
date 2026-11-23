// scene.config.js — 88-lichtenberg: "How a model searches for an answer" — a high-voltage discharge burns a branching
// tree into a pale maple board from the QUESTION electrode; most branches die out, one reaches the ANSWER electrode
// and the whole winning path flashes (style "lichtenberg").
// Plain data + the style's pure burn planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every crackle, fizz, the hum and the connection crack in SCORE come from the same plan the picture reads.
import { STYLE_SPEC as S } from "./_atlas/styles/lichtenberg/spec.js";
import { createPlan, burnVoices } from "./_atlas/styles/lichtenberg/burnplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { fitShot, framingReport } from "./_atlas/kit/framing.js";

export const ID = "88-lichtenberg";
export const STYLE = "lichtenberg";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (every plan time comes from these)
export const BEATS = [
  { id: "ask", t: 0, dur: 2.6, label: "A question goes in" },
  { id: "explore", t: 2.6, dur: 3.6, label: "Many paths are tried" },
  { id: "die", t: 6.2, dur: 3.1, label: "Most of them die out" },
  { id: "connect", t: 9.3, dur: 2.9, label: "One path connects" },
  { id: "answer", t: 12.2, dur: 2.8, label: "That path is the answer" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// one label at a time, no empty stretch: each label hands over to the next within a fifth of a second
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t, off: BEATS[i + 1] ? BEATS[i + 1].t - 0.12 : Infinity }));

// ---------------------------------------------------------------- the one plan
export const TIMES = { ...S.times, start: B.ask.t + 0.45, connect: B.connect.t + 0.75, die: B.connect.t - 0.05 };
export const PLAN = createPlan({
  board: S.board, q: S.electrodes.q, a: S.electrodes.a, keepOut: S.keepOut, seed: S.board.seed,
  grow: S.grow, width: S.width, times: TIMES, smoke: S.smoke, crackle: S.crackle, end: DURATION,
});

// ---------------------------------------------------------------- camera: one rise from a low three-quarter view to near top-down
const W = S.board.w, H = S.board.h, Y = S.board.y;
const rect = (x0, x1) => [[x0, Y, -H / 2], [x1, Y, -H / 2], [x1, Y, H / 2], [x0, Y, H / 2]];
const BOARD = rect(-W / 2, W / 2);
const FULL = (m) => ({ x0: -m, x1: m, y0: -m, y1: m });
const OPEN = fitShot(rect(-W / 2, -W * 0.03), { azimuth: -0.34, elevation: 0.7, fov: S.camera.fov, window: FULL(1), fill: 1 });
const WIDE = fitShot(BOARD, { azimuth: 0, elevation: 1.2, fov: S.camera.fov, window: FULL(1.035), fill: 1 });
const END = fitShot(BOARD, { azimuth: 0, elevation: 1.32, fov: S.camera.fov, window: FULL(1.03), fill: 1 });
const K = (t, s, o = {}) => ({ t, pos: s.pos, target: s.target, fov: S.camera.fov, ...o });
export const CAMERA = [
  K(0, OPEN),
  K(0.5, OPEN),
  K(B.explore.t + 2.0, WIDE, { ease: "inOutSine" }),
  K(B.answer.t, WIDE),
  K(B.answer.t + 1.9, END, { ease: "inOutSine" }),
  K(DURATION, END),
];

// ---------------------------------------------------------------- framing gate: both electrodes inside the safe area once the wide shot is up
const world = (p) => [p[0] - W / 2, Y, p[1] - H / 2];
export const FRAMING = framingReport(
  [{ id: "question", pts: [world(S.electrodes.q)], from: B.explore.t + 2.0 }, { id: "answer", pts: [world(S.electrodes.a)], from: B.explore.t + 2.0 }],
  CAMERA, { duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, safe: 0.93 },
);
if (!FRAMING.ok && !globalThis.process?.env?.LICH_NOGATE) throw new Error(`88-lichtenberg framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a quiet room bed
export const EVENTS = PLAN.events();
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION + 0.5, root: S.sound.room.root, chord: S.sound.room.chord, attack: 0.5, release: 1.5, brightness: S.sound.room.brightness, gain: S.sound.room.gain, seed: 5 },
  ...scoreFromEvents(EVENTS, burnVoices(S.sound), { seedBase: 211, pan: (e) => ((e.x ?? 0.5) - 0.5) * 1.3 }),
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "burnplan.js: seeded space-colonisation tree from the question electrode (one branch reaches the answer electrode), half-width from downstream length, a burn time per node (winning path: steady crawl + leap at `connect`; side branches slow down and die before it). Baked once into a distance + burn-time field; the board shader draws arc / ember / char / scorch / return stroke from one time uniform.",
  plan: PLAN.stats,
  times: { start: TIMES.start, connect: TIMES.connect, lastDeath: PLAN.stats.lastDeath },
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s)` : "FAILS",
  honesty: "A picture of the idea, not of the mechanism: a real model does not burn paths; the tree stands for many candidate continuations being weighed and one being kept.",
};
