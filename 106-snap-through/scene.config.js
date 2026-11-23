// scene.config.js — 106-snap-through: "Then, all at once" (thresholds and decisions), told by a bistable spring-steel
// arch (style "snap-through"). Plain data + the style's pure planner. No THREE, no window: imported by scene.js
// (browser) and by render-sfx / export-spec (Node). Every crown height, weight pose, hop, dial angle and sound cue
// comes from the one PLAN. World: the strip spans x = -1.3 .. 1.3 at the clamp line y = 1.22; the ready stack stands
// on the bench at the left front; the dial gauge sits under the crown facing +Z.
import { STYLE_SPEC as S } from "./_atlas/styles/snap-through/spec.js";
import { createPlan, snapVoices, panOf } from "./_atlas/styles/snap-through/snap.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "106-snap-through";
export const STYLE = "snap-through";
export const TITLE = "Then, all at once";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard 106, approved)
export const BEATS = [
  { id: "holds", t: 0, dur: 2.5, label: "A shallow arch holds" },
  { id: "little", t: 2.5, dur: 3, label: "Add a little. Nothing." },
  { id: "more", t: 5.5, dur: 3, label: "More. Still holding." },
  { id: "one", t: 8.5, dur: 2.5, label: "One more" },
  { id: "back", t: 11, dur: 4, label: "No small step back" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : -0.3), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the one plan
// lands: the instant each weight comes to rest on the tray (1 in beat 1, 2 + 2 in beats 2-3, the sixth in beat 4 = the
// snap); lifts: removal r starts (top of the stack first), all in beat 5.
export const SCHEDULE = {
  lands: [B.holds.t + 0.95, B.little.t + 0.65, B.little.t + 1.95, B.more.t + 0.65, B.more.t + 1.95, B.one.t + 0.85],
  lifts: [0, 1, 2, 3, 4, 5].map((r) => B.back.t + 0.15 + r * 0.5),
};
export const PLAN = createPlan({ rig: S.rig, schedule: SCHEDULE, end: DURATION });

// ---------------------------------------------------------------- camera: one move per beat, locked holds
const FOV = S.camera.fov;
const WIN = { x0: -0.94, x1: 0.94, y0: -0.94, y1: 0.62 };       // the caption plate owns the top band
const RIG = { box: [[-1.7, 0.0, -0.25], [1.7, 1.62, 0.5]] };           // base plate, pedestals, clamps, arch, dial
const READY = { box: [[-2.22, 0.0, 0.46], [-1.78, 0.56, 0.9]] };        // the ready stand and its stack
const POST_UP = [0, 2.33, 0], POST_DOWN = [0, 1.9, 0];                   // post knob before / after the snap
const ALL = [RIG, READY, POST_UP];
const shot = (subject, az, el, o = {}) => {
  const k = fitShot(subject, { azimuth: az, elevation: el, fov: FOV, window: WIN, fill: 1, ...o });
  return { pos: k.pos, target: k.target, fov: FOV };
};
const OPEN = shot(ALL, 0.34, 0.24, { fill: 0.97 });
const OPEN2 = shot(ALL, 0.24, 0.21);
const MID = shot([{ box: [[-1.7, 0.12, -0.2], [1.7, 1.62, 0.3]] }, READY, POST_UP], 0.12, 0.2, { fill: 1.03 });
const END = shot([RIG, READY, POST_DOWN], -0.3, 0.22);
const END2 = shot([RIG, READY, POST_DOWN], -0.36, 0.2, { fill: 1.04 });
export const CAMERA = [
  { t: 0, ...OPEN },
  { t: B.little.t - 0.2, ...OPEN2, ease: "inOutSine" },
  { t: B.more.t - 0.3, ...OPEN2 },
  { t: B.more.t + 0.5, ...MID, ease: "inOutSine" },
  { t: PLAN.snapGo + 1.2, ...MID },
  { t: B.back.t + 0.9, ...END, ease: "inOutSine", path: "arc" },
  { t: DURATION, ...END2, ease: "outSine" },
];
export const SHAKE = { amp: 0.03 };

// ---------------------------------------------------------------- framing gate: the rig stays in frame in every held shot
export const FRAMING = framingReport([
  { id: "rig-open", pts: [RIG.box[0], RIG.box[1], POST_UP], from: 0, to: B.more.t - 0.3, required: true },
  { id: "rig-mid", box: [[-1.7, 0.12, -0.2], [1.7, 1.62, 0.3]], from: B.more.t + 0.5, to: PLAN.snapGo + 1.2, required: true },
  { id: "rig-end", box: RIG.box, from: B.back.t + 0.9, to: DURATION, required: true },
], CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, window: { x0: -0.97, x1: 0.97, y0: -0.97, y1: 0.66 } });

if (!FRAMING.ok && !globalThis.process?.env?.ST_NOGATE) {
  throw new Error(`106-snap-through framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, snapVoices(S.sound), { seedBase: 106, pan: panOf(S.rig) });
export const DUCK = [];
export const NOTES = {
  mechanism: "snap.js: shallow two-bar arch, load = v^3 - v; each weight = Qmax / 5.05; near branch until the 6th weight, then the far branch; removals walk the far branch back only to v = +1.",
  plan: `levels v = ${PLAN.levels.map((l) => l.v.toFixed(3)).join(", ")}; snap at ${PLAN.snapT.toFixed(2)} s (goes ${PLAN.snapGo.toFixed(2)} s); ${PLAN.hops.length} stack contacts, stuck at ${PLAN.stickT.toFixed(2)} s`,
  framing: FRAMING.ok ? "ok" : `FAILS ${JSON.stringify(FRAMING.spans.slice(0, 4))}`,
  numbers: "no data shown; the dial has graduations only (no numerals)",
};
