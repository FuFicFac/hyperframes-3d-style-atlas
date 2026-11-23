// scene.config.js — 89-uv-reveal: "AI's invisible watermark" (style "uv-reveal").
// Plain data + the style's pure torch planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The torch path, the pool radius, the room level, the afterglow and every sound cue come from PLAN.
// World: the sheet (3.2 x 1.8 m, toy scale) lies on the desk centred on the origin; +X right, +Z toward the viewer.
import { STYLE_SPEC as S } from "./_atlas/styles/uv-reveal/spec.js";
import { createPlan, torchVoices } from "./_atlas/styles/uv-reveal/torchplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, prepareKeys, sampleCameraKeys, screenExtent, boxCorners } from "./_atlas/kit/framing.js";

export const ID = "89-uv-reveal";
export const STYLE = "uv-reveal";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "page", t: 0, dur: 2.9, label: "A normal printed page" },
  { id: "torch", t: 2.9, dur: 2.1, label: "Switch on a UV torch" },
  { id: "sweep", t: 5.0, dur: 3.7, label: "Hidden ink starts to glow" },
  { id: "stamp", t: 8.7, dur: 2.6, label: "A stamp you never saw" },
  { id: "reveal", t: 11.3, dur: 3.7, label: "AI's invisible watermark" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// one label at a time, no gaps: each fades out over 0.2 s right before the next fades in
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.2 : Infinity }));

// ---------------------------------------------------------------- the torch plan (the one plan)
// Pool centre (x, z) and radius r over time. The torch glides in over the lit page, clicks on above the illustration,
// sweeps the sheet in an S, reads along the stamp with a wider beam, then lifts away: the pool grows past the sheet.
const R0 = 0.5, H0 = 0.74;      // sweep: pool radius / lens distance (m)
const R1 = 0.78, H1 = 1.0;      // reading the stamp: the head is zoomed a little wider
export const KEYS = [
  { t: 0, x: 4.9, z: 0.35, r: R0, h: H0, stop: true },
  { t: 0.9, x: 4.9, z: 0.35, r: R0, h: H0, stop: true },
  { t: 2.75, x: -0.95, z: -0.36, r: R0, h: H0, stop: true },
  { t: B.torch.t + 0.9, x: -0.95, z: -0.36, r: R0, h: H0, stop: true },
  { t: B.sweep.t, x: -0.6, z: -0.42, r: R0, h: H0 },
  { t: B.sweep.t + 0.95, x: 0.5, z: -0.45, r: R0, h: H0 },
  { t: B.sweep.t + 1.65, x: 1.15, z: -0.3, r: R0, h: H0 },
  { t: B.sweep.t + 2.25, x: 1.1, z: 0.4, r: R0, h: H0 },
  { t: B.sweep.t + 2.95, x: 0.2, z: 0.52, r: R0, h: H0 },
  { t: B.sweep.t + 3.6, x: -1.0, z: 0.5, r: R0, h: H0 },
  { t: B.stamp.t + 0.55, x: -0.86, z: 0.17, r: R1, h: H1, stop: true },   // onto the stamp's left end ...
  { t: B.stamp.t + 2.3, x: 0.7, z: -0.07, r: R1, h: H1, stop: true },     // ... and along it: MADE - BY - AI
  { t: B.reveal.t, x: 0.7, z: -0.07, r: R1, h: H1, stop: true },
  { t: B.reveal.t + 1.7, x: 0, z: 0, r: 6.0, h: 6.0, stop: true },        // lift away: the pool grows past the sheet
];
export const PLAN = createPlan({
  keys: KEYS,
  switchOn: B.torch.t + 0.4,
  lightsOff: B.reveal.t,
  floodDur: 1.4,
  legs: [{ t: 1.0, dur: 1.6 }, { t: B.sweep.t, dur: 1.5 }, { t: B.sweep.t + 1.7, dur: 1.6 }, { t: B.stamp.t + 0.5, dur: 1.7 }],
  torch: S.torch,
  end: DURATION,
  seed: 7,
});

// ---------------------------------------------------------------- camera: three-quarter desk view, one push, one rise
const SHEET = { box: [[-S.page.w / 2, 0, -S.page.h / 2], [S.page.w / 2, 0.02, S.page.h / 2]] };
const WIDE = fitShot(SHEET, { azimuth: 0.1, elevation: 0.9, fov: S.camera.fov, window: { y1: 0.7, y0: -0.92 }, fill: 0.86, align: [0, 0] });
const WORK = fitShot(SHEET, { azimuth: 0.04, elevation: 1.02, fov: S.camera.fov, window: { y1: 0.72, y0: -0.95 }, fill: 0.97, align: [0, 0] });
const TOP = fitShot(SHEET, { azimuth: 0, elevation: 1.5, fov: S.camera.fov, window: { x0: -1, x1: 1, y0: -1, y1: 1 }, fill: 1.05, align: [0, 0] });
export const CAMERA = [
  { t: 0, pos: WIDE.pos, target: WIDE.target, fov: S.camera.fov },
  { t: 1.0, pos: WIDE.pos, target: WIDE.target, fov: S.camera.fov },
  { t: B.torch.t + 1.6, pos: WORK.pos, target: WORK.target, fov: S.camera.fov, ease: "inOutSine" },
  { t: B.reveal.t - 0.1, pos: WORK.pos, target: WORK.target, fov: S.camera.fov },
  { t: B.reveal.t + 2.1, pos: TOP.pos, target: TOP.target, fov: S.camera.fov, ease: "inOutCubic" },
  { t: DURATION, pos: TOP.pos, target: TOP.target, fov: S.camera.fov },
];

// ---------------------------------------------------------------- framing gate
// 1) the whole sheet stays in frame (small overshoot allowed only for the final fill), 2) the sheet is never small
// (>= 70 % of frame width in every shot), 3) the final frame is FILLED by the sheet (>= 97 % of width and height).
export const FRAMING = framingReport(() => [{ id: "sheet", box: SHEET.box }], CAMERA, {
  duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, window: { x0: -1.06, x1: 1.06, y0: -1.06, y1: 1.06 },
});
const K = prepareKeys(CAMERA, { fov: S.camera.fov });
export const FILL = (() => {
  let minW = 9, endW = 0, endH = 0;
  for (let f = 0; f <= DURATION * 10; f++) {
    const t = f / 10, e = screenExtent(sampleCameraKeys(K, t, { fov: S.camera.fov }), boxCorners(...SHEET.box));
    const w = (e.x[1] - e.x[0]) / 2, h = (e.y[1] - e.y[0]) / 2;
    minW = Math.min(minW, w);
    if (f === DURATION * 10) { endW = w; endH = h; }
  }
  return { minW: +minW.toFixed(3), endW: +endW.toFixed(3), endH: +endH.toFixed(3), ok: minW >= 0.7 && endW >= 0.97 && endH >= 0.97 };
})();
if ((!FRAMING.ok || !FILL.ok) && !globalThis.process?.env?.UVR_NOGATE) {
  throw new Error(`89-uv-reveal framing: ${JSON.stringify({ spans: FRAMING.spans.slice(0, 6), fill: FILL })}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, torchVoices(S.sound), { seedBase: 211 });
export const DUCK = [];
export const NOTES = {
  mechanism: "torchplan.js: pool(t) = timed Hermite keys + hand sway; glow mask = lamp(t) x (1 - smoothstep(soft r, r, d)) max'ed with 20 afterglow samples weighted e^(-age/tau); the hidden layer is added to the sheet's emission x mask in the shader. Room level, uvFill, bloom and the spot follow roomAt / onAt / floodAt.",
  switchOn: PLAN.switchOn, lightsOff: PLAN.lightsOff, stampFoundAt: PLAN.stampAt, markPings: PLAN.hits.length,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s)` : "FAILS",
  fill: FILL,
  content: "The page, its illustration and the hidden marks are original and generic; the watermark/stamp are an analogy for invisible AI-content watermarks, not a depiction of any real scheme.",
};
