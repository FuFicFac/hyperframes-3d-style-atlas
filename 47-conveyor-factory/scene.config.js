// scene.config.js — 47-conveyor-factory: "An order, packed" on a bright packing line (SAMPLE DATA counters).
// Plain data + the style's pure line planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every beep, hiss, thunk, pour, servo whirr and counter tick in SCORE comes from exactly the plan
// the picture reads; the queue at the filler is the release schedule's burst meeting a station slower than the belt.
import { STYLE_SPEC as S } from "./_atlas/styles/conveyor-factory/spec.js";
import { buildNetwork, releasePlan, planLine, chooseReject, lineVoices, fitShot, framingCheck } from "./_atlas/styles/conveyor-factory/line.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, boxCorners } from "./_atlas/kit/framing.js";

export const ID = "47-conveyor-factory";
export const STYLE = "conveyor-factory";
export const DURATION = 15;   // keep equal to data-duration in index.html
export const FPS = 30;

// ---- beats (one short label each)
export const BEATS = [
  { id: "enter", t: 0, dur: 3.6, label: "Items enter, get scanned" },
  { id: "sort", t: 3.6, dur: 3.6, label: "Sorted by type" },
  { id: "jam", t: 7.2, dur: 3.5, label: "Filler is the bottleneck" },
  { id: "out", t: 10.7, dur: 4.3, label: "Checked, wrapped, packed" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABEL_FADE = { inDur: 0.2, outDur: 0.12 };
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: i ? b.t - 0.06 : 0.15, off: BEATS[i + 1] ? BEATS[i + 1].t - LABEL_FADE.outDur : Infinity }));

// ---- the line and its release schedule (a made-up packing line; counts on screen are SAMPLE DATA)
export const DATA = {
  sample: true,
  // steady mixed releases from before the clip starts (so the line is already running at t = 0), and one burst of
  // totes (tote, tote, carton ...) that the filler cannot keep up with: the queue grows through the "jam" beat
  release: { t0: -14, t1: DURATION, interval: 1.25, jitter: 0.25, mix: { carton: 0.5, parcel: 0.2, tote: 0.3 }, bursts: [{ at: -5.2, n: 9, pattern: ["tote", "tote", "carton"], interval: 0.86 }], seed: 11 },
  rejectFrom: B.out.t + 0.9,      // the quality gate rejects the first carton / parcel it reads after this
};
export const NET = buildNetwork(S);
export const ITEMS = releasePlan(NET, DATA.release);
const draft = planLine(NET, ITEMS, S);
export const REJECT = chooseReject(draft, DATA.rejectFrom);
export const PLAN = planLine(NET, ITEMS, S, { fail: [REJECT] });
const VERIFY = PLAN.verify();
if (!VERIFY.ok) throw new Error(`line plan: a station acts with the item not there: ${JSON.stringify(VERIFY.issues.slice(0, 3))}`);

// ---- camera: computed shots (subject boxes include the overhead signs; the caption band at the bottom stays clear)
const FOV = S.camera.fov;
const BOX = {
  enter: boxCorners([-7.3, 0, -1.55], [-3.55, 3.0, 0.15]),
  sort: boxCorners([-4.7, 0, -1.55], [-0.75, 3.0, 0.95]),
  jam: boxCorners([-2.75, 0, -1.55], [1.15, 3.0, 0.95]),
  out: boxCorners([2.35, 0, -1.55], [7.35, 3.0, 2.05]),
  all: boxCorners([-7.3, 0, -1.6], [7.3, 3.2, 2.05]),
};
const WIN = { x0: -0.88, x1: 0.88, y0: -0.6, y1: 0.86 };
const SHOTS = {
  enter: fitShot(BOX.enter, { elev: 0.5, azim: -0.3, fov: FOV, win: WIN }),
  enter2: fitShot(BOX.enter, { elev: 0.47, azim: -0.18, fov: FOV, win: WIN }),
  sort: fitShot(BOX.sort, { elev: 0.56, azim: -0.08, fov: FOV, win: WIN }),
  jam: fitShot(BOX.jam, { elev: 0.5, azim: 0.1, fov: FOV, win: WIN }),
  out: fitShot(BOX.out, { elev: 0.52, azim: 0.16, fov: FOV, win: WIN }),
  all: fitShot(BOX.all, { elev: 0.42, azim: 0.5, fov: FOV, win: { x0: -0.89, x1: 0.89, y0: -0.64, y1: 0.88 } }),
};
const key = (t, s, ease = "inOutCubic") => ({ t, ...s, ease });
export const CAMERA = [
  key(0, SHOTS.enter),
  key(B.sort.t, SHOTS.enter2, "inOutSine"),
  key(B.sort.t + 1.2, SHOTS.sort, "inOutCubic"),
  key(B.jam.t, SHOTS.sort),
  key(B.jam.t + 1.1, SHOTS.jam, "inOutCubic"),
  key(B.out.t, SHOTS.jam),
  key(B.out.t + 1.2, SHOTS.out, "inOutCubic"),
  key(B.out.t + 2.3, SHOTS.out),
  key(B.out.t + 3.9, SHOTS.all, "inOutCubic"),
  key(DURATION, SHOTS.all, "linear"),
];

// ---- framing gate: the subject of each beat stays in the window above the caption band, mid-move included
const regions = (t) => {
  if (t < B.sort.t) return [{ id: "enter", pts: BOX.enter }];
  if (t >= B.sort.t + 1.2 && t < B.jam.t) return [{ id: "sort", pts: BOX.sort }];
  if (t >= B.jam.t + 1.1 && t < B.out.t) return [{ id: "jam", pts: BOX.jam }];
  if (t >= B.out.t + 1.2 && t < B.out.t + 2.3) return [{ id: "out", pts: BOX.out }];
  if (t >= B.out.t + 3.9) return [{ id: "all", pts: BOX.all }];
  return [];
};
export const FRAMING = framingCheck(CAMERA, regions, { duration: DURATION, drift: S.camera.drift, fov: FOV, win: { x0: -0.91, x1: 0.91, y0: -0.66, y1: 0.9 } });
export const FRAMING_KIT = framingReport(regions, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, safe: 0.92 });
if (!FRAMING.ok) throw new Error(`framing gate failed: ${JSON.stringify(FRAMING.fails.slice(0, 3))}`);

export const OBJECTS = [
  { id: "floor", primitive: "procedural", factory: "floorSet", procedural: "cream painted concrete floor (yellow walkway lines, hatched robot / reject zones), pale back wall with high windows and steel columns", dims: {} },
];

// ---- SCORE: the plan's station events + belt hum + a soft bed + caption ticks
const inClip = (e) => e.t >= -0.05 && e.t < DURATION - 0.05;
export const EVENTS = PLAN.events.filter(inClip);
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 7, 12, 16], attack: 1.4, release: 1.6, brightness: S.sound.bed.brightness },
  { t: 0, type: "hum", dur: DURATION, gain: S.sound.hum.gain, hz: S.sound.hum.hz, flicker: 0 },
  ...LABELS.map((L, i) => ({ t: Math.max(0, L.on), type: "click", dur: 0.03, gain: S.sound.caption.gain, pitch: 0.6, seed: 31 + i })),
  ...scoreFromEvents(EVENTS.map((e) => ({ ...e, t: Math.max(0, e.t) })), lineVoices(S.sound), {
    seedBase: 101,
    pan: (e) => {
      const st = { scan: -0.55, divertOut: -0.45, divertIn: -0.45, pressDown: -0.25, stamp: -0.25, pressUp: -0.25, pour: 0, qc: 0.25, reject: 0.25, push: 0.3, chuteLand: 0.3, wrap: 0.4, servo: 0.55, grip: 0.55, place: 0.55 };
      return st[e.kind] ?? 0;
    },
  }),
];
export const DUCK = [];
export const NOTES = {
  data: "SAMPLE DATA: the counters (scanned / filled / rejected / packed) are counts of planned events, not measurements.",
  mechanism: "line.js plans every item through the belt network as a pure function of time: free-flow knots from a FIFO discrete-event pass over the release schedule, then per-frame accumulation (an item never closer than one pitch to the one ahead). The filler (2.0 s dwell) is slower than the tote burst, so a queue grows on the curved lane.",
  reject: REJECT,
  framing: `own window check ${FRAMING.ok ? "ok" : "FAIL"} (worst over ${FRAMING.worst.over} at ${FRAMING.worst.t}s); kit safe ${FRAMING_KIT.ok ? "ok" : "FAIL"} (worst ${FRAMING_KIT.worst.ndc})`,
  queuePeak: Math.max(...Array.from({ length: 151 }, (_, k) => PLAN.queue("fill", k / 10))),
};
