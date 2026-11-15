// scene.config.js — 61-ukiyo-e: one woodblock print made in passes (style "ukiyo-e").
// Plain data + the style's pure pass planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every swing, thud, baren rub, peel and plucked note in SCORE comes from the same pass plan the
// blocks read; pass start times come from BEATS.
// Sheet = XZ rectangle centred on the origin; the far edge (top of the picture) is -Z.
import { STYLE_SPEC as S } from "./_atlas/styles/ukiyo-e/spec.js";
import { createPrintPlan, printVoices } from "./_atlas/styles/ukiyo-e/prints.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "61-ukiyo-e";
export const STYLE = "ukiyo-e";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (pass start times come from these)
export const BEATS = [
  { id: "key", t: 0, dur: 3.1, label: "First, the black key line" },
  { id: "sky", t: 3.1, dur: 2.0, label: "Sky: a soft gradation" },
  { id: "blues", t: 5.1, dur: 3.35, label: "Blue, then a second blue" },
  { id: "warm", t: 8.45, dur: 3.35, label: "Each colour in register" },
  { id: "seal", t: 11.8, dur: 3.2, label: "One print, six blocks" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.35 : Infinity }));

// ---------------------------------------------------------------- the pass plan (the one schedule)
const T = S.timing;
const passLen = (baren = 0) => T.close + T.hold + baren + T.open + T.exit;
const BAREN = { strokes: 4, dur: 1.2 };
const t1 = B.blues.t + passLen(), t2 = B.warm.t + passLen();
export const PASSES = [
  { id: "key", layer: "key", t: B.key.t, baren: BAREN, note: 0 },
  { id: "sky", layer: "sky", t: B.sky.t, note: 2 },
  { id: "prussian", layer: "prussian", t: B.blues.t, note: 3 },
  { id: "blue2", layer: "blue2", t: t1, note: 4 },
  { id: "ochre", layer: "ochre", t: B.warm.t, note: 5 },
  { id: "pink", layer: "pink", t: t2, note: 7 },
];
export const PLAN = createPrintPlan({
  passes: PASSES, timing: T, end: DURATION,
  seal: { id: "seal", layer: "seal", t: B.seal.t + 0.1 },
  parallax: { t: B.seal.t + 1.1, dur: DURATION - (B.seal.t + 1.1), lift: S.parallax.lift },
});
// every pass must be out of frame before the next one glides in, and before its beat ends
for (let i = 1; i < PLAN.passes.length; i++) {
  if (PLAN.passes[i].t0 < PLAN.passes[i - 1].exit1 - 1e-6) throw new Error(`61-ukiyo-e: pass ${PLAN.passes[i].id} starts before ${PLAN.passes[i - 1].id} has left`);
}
if (PLAN.passes.at(-1).exit1 > B.seal.t + 1e-6) throw new Error("61-ukiyo-e: last pass runs into the seal beat");

// ---------------------------------------------------------------- camera: locked three-quarter while printing, one slow finale move
const SHEET = { box: [[-S.sheet.w / 2, 0, -S.sheet.d / 2], [S.sheet.w / 2, 0.01, S.sheet.d / 2]] };
const WIN = { x0: -0.94, x1: 0.94, y0: -0.7, y1: 0.93 };      // caption chip sits below y = -0.74
const PRINT = fitShot(SHEET, { elevation: 1.02, fov: S.camera.fov, window: WIN, fill: 1.0 });
const FINAL = fitShot(SHEET, { azimuth: 0.07, elevation: 1.2, fov: S.camera.fov, window: { x0: -0.97, x1: 0.97, y0: -0.71, y1: 0.96 }, fill: 1.0 });
export const CAMERA = [
  { t: 0, pos: PRINT.pos, target: PRINT.target, fov: S.camera.fov },
  { t: PLAN.parallax.t - 0.4, pos: PRINT.pos, target: PRINT.target, fov: S.camera.fov },
  { t: DURATION, pos: FINAL.pos, target: FINAL.target, fov: S.camera.fov, ease: "inOutSine" },
];

// ---------------------------------------------------------------- framing gate: the whole sheet in frame, above the caption
export const FRAMING = framingReport(() => [{ id: "sheet", box: SHEET.box }], CAMERA, {
  duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, window: { x0: -0.97, x1: 0.97, y0: -0.73, y1: 0.97 },
});
if (!FRAMING.ok && !globalThis.process?.env?.UKI_NOGATE) {
  throw new Error(`61-ukiyo-e framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, printVoices(S.sound), { seedBase: 161 });
export const DUCK = [];
export const NOTES = {
  mechanism: "prints.js: one pass per block (glide in, swing down on a far-edge hinge, press, baren rub on the key block, swing up, leave); its layer appears under it at contact. Layers are multiply-blended planes over the lit washi; the finale lifts them by stacking rank (key and seal highest).",
  passes: PLAN.passes.map((p) => ({ id: p.id, t0: +p.t0.toFixed(3), contact: +p.contact.toFixed(3), open0: +p.open0.toFixed(3), exit1: +p.exit1.toFixed(3) })),
  seal: PLAN.seal && { t0: PLAN.seal.t0, contact: PLAN.seal.contact },
  framing: FRAMING.ok ? `ok (worst ${JSON.stringify(FRAMING.worst?.ndc)} at ${FRAMING.worst?.t}s)` : "FAILS",
  artwork: "an original seascape composed for this demo (wave, swell, boats, snow-capped mountain, sun, clouds); not a copy of any historical print",
};
