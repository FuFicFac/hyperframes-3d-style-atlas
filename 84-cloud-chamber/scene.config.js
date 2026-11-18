// scene.config.js — 84-cloud-chamber: "Invisible, until you look this way" (style "cloud-chamber").
// Plain data + the style's pure event planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every tick in SCORE is one trail of the same plan the picture reads; the lamp, room, source and
// magnet cues come from BEATS. World: x right, y up, z toward the viewer; the cold plate is y = 0, the tank 8 × 5 m.
import { STYLE_SPEC as S } from "./_atlas/styles/cloud-chamber/spec.js";
import { createPlan, trackVoices, trackPan } from "./_atlas/styles/cloud-chamber/tracks.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport } from "./_atlas/kit/framing.js";

export const ID = "84-cloud-chamber";
export const STYLE = "cloud-chamber";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "empty", t: 0, dur: 2.6, label: "An empty glass box?" },
  { id: "look", t: 2.6, dur: 3.6, label: "Look along the light" },
  { id: "source", t: 6.2, dur: 3.4, label: "Add a source: a fountain" },
  { id: "magnet", t: 9.6, dur: 3.0, label: "Magnet on: paths curl" },
  { id: "end", t: 12.6, dur: 2.4, label: "Invisible, until you look" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.3), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- cues (all from BEATS)
export const CUES = {
  lampOn: B.empty.t + 0.45,                       // the sheet lamp clicks on
  dim: [B.empty.t + 0.75, B.empty.t + 2.3],        // the room light goes down
  sourceIn: [B.source.t + 0.1, B.source.t + 0.7], // the rod comes down into the mist
  magnetOn: B.magnet.t + 0.3,
};
export const SOURCE = { p: [-0.3, 0.1], dir: 0, spread: Math.PI, r0: 0.14 };

// ---------------------------------------------------------------- the event plan (rates in trails / second)
export const PHASES = [
  // traffic was there all along (starts before t = 0 so the first frame already has trails ageing in it)
  { t0: -2.6, t1: B.look.t, field: 0, rate: { muon: 2.4, beta: 3.2, alpha: 1.8 } },
  { t0: B.look.t, t1: CUES.sourceIn[1], field: 0, rate: { muon: 3.0, beta: 4.2, alpha: 2.2 } },
  { t0: CUES.sourceIn[1], t1: CUES.magnetOn, field: 0, rate: { muon: 2.0, beta: 2.4, alpha: 0.8 }, source: { ...SOURCE, rate: { ray: 14, beta: 3 } } },
  { t0: CUES.magnetOn, t1: DURATION + 0.5, field: 1, rate: { muon: 1.8, beta: 4.5, alpha: 0.8 }, source: { ...SOURCE, rate: { ray: 11, beta: 5 } } },
];
export const PLAN = createPlan({ seed: 84, phases: PHASES }, S);

// ---------------------------------------------------------------- camera: ordinary view -> down into the light sheet -> final wide
const CLOSE = { pos: [0, 4.35, 5.9], target: [0, 0.15, -0.2], fov: 35 };
const WIDE = { pos: [1.5, 4.1, 5.9], target: [0.05, 0.12, -0.15], fov: 35 };
export const CAMERA = [
  { t: 0, pos: [3.4, 4.4, 9.4], target: [0, 0.3, 0], fov: 35 },
  { t: B.empty.t + 0.6, pos: [3.4, 4.4, 9.4], target: [0, 0.3, 0], fov: 35 },
  { t: B.look.t + 0.6, ...CLOSE, path: "arc", ease: "inOutCubic" },
  { t: B.end.t, ...CLOSE },
  { t: B.end.t + 1.5, ...WIDE, path: "arc", ease: "inOutSine" },
  { t: DURATION, ...WIDE },
];

// ---------------------------------------------------------------- framing gate: the middle of the plate stays in frame
const REGION = [{ id: "plateMiddle", box: [[-2.6, 0.1, -1.5], [2.6, 0.4, 1.5]], required: true }];
export const FRAMING = framingReport(REGION, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, safe: 0.95 });
if (!FRAMING.ok && !globalThis.process?.env?.CC_NOGATE) {
  throw new Error(`84-cloud-chamber framing: ${JSON.stringify({ spans: FRAMING.spans.slice(0, 6), worst: FRAMING.worst })}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: one tick per trail + cues + bed
const SND = S.sound;
export const EVENTS = PLAN.events().filter((e) => e.t >= 0 && e.t < DURATION - 0.05);
export const SCORE = [
  { t: 0, type: "hum", dur: DURATION, gain: SND.bed.gain, hz: SND.bed.hz },
  { t: 0, type: "pad", dur: DURATION, gain: SND.pad.gain, root: SND.pad.root, chord: [0, 7, 12, 19], attack: 2.0, release: 2.0, brightness: SND.pad.brightness },
  { t: CUES.lampOn, type: "clack", gain: SND.lamp.gain, pitch: 1.3, seed: 3 },
  { t: CUES.dim[0], type: "whoosh", dir: "out", dur: CUES.dim[1] - CUES.dim[0], gain: SND.dim.gain, seed: 4 },
  ...scoreFromEvents(EVENTS, trackVoices(SND), { seedBase: 101, pan: trackPan(S.tank) }),
  { t: CUES.sourceIn[1] - 0.05, type: "clack", gain: SND.source.gain, pitch: 0.7, seed: 5 },
  { t: CUES.magnetOn, type: "thud", gain: SND.magnet.gain, pitch: 0.8, seed: 6 },
  { t: CUES.magnetOn, type: "buzz", dur: DURATION - CUES.magnetOn, hz: 82, flicker: 0.1, gain: SND.magnet.buzz, seed: 7 },
  { t: B.end.t + 0.15, type: "chime", gain: SND.end.gain, dur: 2.2, notes: 4, seed: 8 },
];
export const DUCK = [];
export const NOTES = {
  mechanism: "tracks.js plans every particle event (time, start, heading, kind, field) and builds its curve once; the trail shader computes age = t - (birth + u·reveal) per vertex and from it the reveal, widening, sinking, beading and fade.",
  trails: PLAN.tracks.length,
  samples: PLAN.samples,
  ticks: EVENTS.length,
  aliveAt: Object.fromEntries([1, 4, 8, 12, 14.5].map((t) => [t, PLAN.aliveAt(t)])),
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s)` : "FAILS",
};
