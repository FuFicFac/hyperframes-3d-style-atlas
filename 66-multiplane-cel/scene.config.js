// scene.config.js — 66-multiplane-cel: "Painted on glass" — a storybook picture that turns out to be six panes of
// painted glass under a film camera (style "multiplane-cel"). Plain data + the style's pure shot planner. No THREE, no
// window: imported by scene.js (browser) and by render-sfx / export-spec (Node). The camera path, the sliding tray,
// the bird's drawings and every sound come from one plan built from BEATS.
import { STYLE_SPEC as S } from "./_atlas/styles/multiplane-cel/spec.js";
import { createPlan, multiplaneVoices, fitKey, project, paneArt } from "./_atlas/styles/multiplane-cel/multiplane.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "66-multiplane-cel";
export const STYLE = "multiplane-cel";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "open", t: 0, dur: 3.4, label: "A painted storybook" },
  { id: "push", t: 3.4, dur: 2.6, label: "Push in: the layers part" },
  { id: "reveal", t: 6.0, dur: 3.4, label: "Six panes of painted glass" },
  { id: "slide", t: 9.4, dur: 2.3, label: "Slide one pane sideways" },
  { id: "back", t: 11.7, dur: 3.3, label: "The picture changes" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const end = (b) => b.t + b.dur;

// ---------------------------------------------------------------- the rig shot (fitted, not hand-typed)
const R = S.rig, PICT = R.lensY - R.baseY; // reference lens height above the bottom pane
const RIG_PTS = [];
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  RIG_PTS.push([sx * (R.postX + 0.06), R.topY, sz * (R.postZ + 0.06)]);
  RIG_PTS.push([sx * (R.postX + 0.25), R.plinth.y + R.plinth.h, sz * (R.postZ + 0.15)]);
}
RIG_PTS.push([0, R.lensY + 1.15, 0.1], [0, R.lensY + 1.15, -0.1]); // film magazine top
const RIG_WINDOW = { x0: -0.92, x1: 0.92, y0: -0.84, y1: 0.9 };   // the plinth may sit behind the caption chip; the stack stays clear
export const RIG_KEY = fitKey(RIG_PTS, { az: 0.22, el: 0.55, fov: S.camera.fov, window: RIG_WINDOW, fill: 0.98 });
// the slide shot: closer and higher over the stack so the paintings read while one tray slides
const STACK_PTS = [];
for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [R.baseY, R.baseY + 5 * R.gap]) STACK_PTS.push([sx * (S.rig.pane.w / 2 + 0.1), y, sz * (S.rig.pane.d / 2 + 0.05)]);
export const SLIDE_KEY = fitKey(STACK_PTS, { az: 0.12, el: 1.2, fov: S.camera.fov, window: RIG_WINDOW, fill: 0.97 });
const MID_OUT = { target: [0, R.baseY + 0.6, 0.1], az: 0.3, el: 0.98, dist: 6.4 };   // half-way: high above, turning out

// back in BELOW the film camera: eye at lens height, 60 deg down, so the camera body above stays out of frame
const LOW_IN = { target: [0, R.baseY, 0], az: 0.12, el: 1.05, dist: PICT / Math.sin(1.05) };

// ---------------------------------------------------------------- camera keys (picture keys: [x, z, height above sky pane])
const KEYS = [
  { t: B.open.t, pic: [-0.06, 0.02, PICT + 0.04] },
  { t: B.push.t, pic: [0.04, 0.0, PICT - 0.2], ease: "linear" },
  { t: end(B.push), pic: [0.22, -0.08, PICT - 0.9], ease: "inOutSine" },
  { t: B.reveal.t + 1.2, ...MID_OUT, ease: "inCubic" },
  { t: end(B.reveal) - 0.4, ...RIG_KEY, ease: "outCubic" },
  { t: B.slide.t + 0.1, ...RIG_KEY },
  { t: B.slide.t + 1.3, ...SLIDE_KEY, ease: "inOutSine" },
  { t: B.back.t, ...SLIDE_KEY },
  { t: B.back.t + 1.2, ...LOW_IN, ease: "inOutSine" },
  { t: B.back.t + 2.0, pic: [0.0, 0.0, PICT], ease: "outCubic" },
];

export const PLAN = createPlan(S, {
  keys: KEYS,
  slide: { level: 3, du: 0.55, t0: B.slide.t + 0.75, t1: end(B.slide) - 0.1 },
  bird: { u0: -0.22, au: 0.55, v0: 0.42, av: 0.05, period: 18, turnAt: 7.6 },
  end: DURATION,
  cues: [
    { kind: "box", t: B.open.t + 0.05, notes: [0, 4, 7, 12] },
    { kind: "chirp", t: B.open.t + 0.55 },
    { kind: "push", t: B.push.t, dur: B.push.dur },
    { kind: "box", t: B.push.t + 0.1, notes: [7, 12], g: 0.7 },
    { kind: "pull", t: B.reveal.t, dur: 1.8 },
    { kind: "settle", t: end(B.reveal) - 0.4, dur: B.back.t - (end(B.reveal) - 0.4) + 0.6 },
    { kind: "box", t: end(B.slide) - 0.2, notes: [4, 7, 11], g: 0.7 },
    { kind: "push", t: B.back.t, dur: 2.0 },
    { kind: "land", t: B.back.t + 2.0 },
    { kind: "box", t: B.back.t + 2.0, notes: [0, 4, 7, 12, 16] },
    { kind: "chirp", t: B.back.t + 2.4 },
  ],
});

export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.15 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.35 : Infinity }));

// ---------------------------------------------------------------- gates (run at import: render-sfx / build fail on a bad shot)
// 1) inside the picture, every frame is fully painted: the sky pane covers the whole view and the hills/meadow
//    sheets cover it sideways and at the bottom (no glass edge or steel ever shows in a picture shot).
// 2) the rig shot keeps the whole rig inside the safe window and wide in frame.
const lay = PLAN.layout;
const coverage = [];
for (let f = 0; f <= DURATION * FPS; f++) {
  const t = f / FPS, c = PLAN.cameraAt(t);
  if (!c.picture) continue;
  for (const id of ["sky", "hills", "meadow"]) {
    const L = lay.byId[id], a = paneArt(S, L), d = c.pos[1] - L.y, hh = d * lay.tanH, hw = hh * lay.aspect;
    const ok = c.pos[0] - hw >= a.x0 && c.pos[0] + hw <= a.x1 && c.pos[2] + hh <= a.z1 && (id !== "sky" || c.pos[2] - hh >= a.z0);
    if (!ok) coverage.push({ t, id });
  }
}
const rigCam = PLAN.cameraAt(B.slide.t);
const ndc = RIG_PTS.map((p) => project(rigCam, p, { fov: S.camera.fov }));
export const RIG_FRAME = {
  x: [Math.min(...ndc.map((q) => q[0])), Math.max(...ndc.map((q) => q[0]))].map((v) => +v.toFixed(3)),
  y: [Math.min(...ndc.map((q) => q[1])), Math.max(...ndc.map((q) => q[1]))].map((v) => +v.toFixed(3)),
};
RIG_FRAME.widthShare = +((RIG_FRAME.x[1] - RIG_FRAME.x[0]) / 2).toFixed(3);
if ((coverage.length || RIG_FRAME.widthShare < 0.7) && !globalThis.process?.env?.MPC_NOGATE) {
  throw new Error(`66-multiplane-cel gates: ${JSON.stringify({ coverage: coverage.slice(0, 6), rig: RIG_FRAME })}`);
}

// export-spec: the camera as sampled keys (pos/target/up — the plan's camera can look straight down)
export const CAMERA = Array.from({ length: DURATION * 2 + 1 }, (_, i) => {
  const t = i / 2, c = PLAN.cameraAt(t);
  return { t, pos: c.pos.map((v) => +v.toFixed(4)), target: c.target.map((v) => +v.toFixed(4)), up: c.up.map((v) => +v.toFixed(4)), fov: c.fov, ease: "linear" };
});
export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, multiplaneVoices(S.sound), { seedBase: 167 });
export const DUCK = [];
export const NOTES = {
  mechanism: "multiplane.js: layers painted in the reference lens' picture coordinates on panes at baseY + i*gap; camera keys are spherical (az, el, dist) around a target with up = (-sin el sin az, cos el, -sin el cos az) so it can look straight down; picture shots only change height (+ a small truck) so each pane scales by d0/d — parallax.",
  slide: { level: "grove", metres: +PLAN.slideMetres.toFixed(3) },
  rigFrame: RIG_FRAME,
  bird: "8 wing drawings on twos (pose = floor(t*15) mod 8); position held for two frames; one paper flap per downstroke in SCORE, level from the camera's distance",
};
