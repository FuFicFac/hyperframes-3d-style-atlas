// scene.config.js — 62-cubism: "One object, many views" (style "cubism").
// Plain data + the style's pure facet planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every crack tick, view swing, paper flip and strum in SCORE comes from the same plan the facets read.
// Picture plane = XY sheet at z = 0, centred on the origin, 3.2 x 1.8 m visible (overscanned 8 % for the facets/views).
import { STYLE_SPEC as S } from "./_atlas/styles/cubism/spec.js";
import { createPlan, viewKeys, cubismVoices, bedScore } from "./_atlas/styles/cubism/facets.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "62-cubism";
export const STYLE = "cubism";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "still", t: 0, dur: 2.8, label: "A plain still life" },
  { id: "break", t: 2.8, dur: 2.8, label: "The picture plane breaks" },
  { id: "views", t: 5.6, dur: 3.0, label: "Every side at once" },
  { id: "collage", t: 8.6, dur: 3.2, label: "Paper, wood, letters" },
  { id: "resolve", t: 11.8, dur: 3.2, label: "One object, many views" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.15 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.35 : Infinity }));

// ---------------------------------------------------------------- the plan (overscanned frame)
const OS = S.frame.overscan;
const FW = S.frame.w * OS, FH = S.frame.h * OS;
// collage cut-outs that slide in during the collage beat (plane metres; from = start offset, off-frame)
const EXTRAS = [
  { id: "news-strip", kind: 2, pts: [[-1.18, 0.12], [-0.42, 0.22], [-0.46, 0.5], [-1.22, 0.42]], from: [-1.4, 0.3], rot: 0.4, settle: [0.05, -0.03] },
  { id: "wood-rhomb", kind: 1, pts: [[0.52, -0.62], [1.12, -0.5], [0.98, -0.1], [0.38, -0.22]], from: [1.5, -0.6], rot: -0.5, settle: [-0.04, 0.02] },
  { id: "blue-paper", kind: 0, pts: [[0.92, 0.5], [1.46, 0.42], [1.52, 0.8], [0.98, 0.88]], from: [0.6, 1.3], rot: 0.3, settle: [0.0, -0.05] },
];
export const PLAN = createPlan({
  frame: { w: FW, h: FH }, facets: S.facets, views: S.views, beats: B, motion: S.facetMotion, collage: S.collage, extras: EXTRAS, strumAt: 0.12,
});

// ---------------------------------------------------------------- viewpoint cameras (one per view, render targets)
// fitShot frames the still life in the VISIBLE frame at the stage fov; the render camera uses the wider overscan fov.
const FOV = S.camera.fov;
const FOV_RT = (2 * Math.atan(OS * Math.tan((FOV * Math.PI) / 360)) * 180) / Math.PI;
const VK = viewKeys(S.still.subject, S.views, { fov: FOV, fovRT: FOV_RT });
const [OPEN] = viewKeys(S.still.subject, [{ ...S.views[0], az: S.orbit.az[0], el: S.orbit.el[0] }], { fov: FOV, fovRT: FOV_RT });
const key = (t, v, extra = {}) => ({ t, pos: v.pos, target: v.target, fov: v.fov, roll: v.roll ?? 0, ...extra });
export const VIEW_CAMS = VK.map((v, k) => {
  const keys = [key(0, OPEN), key(B.still.t + B.still.dur, VK[0], { ease: "inOutSine" })];
  const sv = PLAN.views[k];
  if (k > 0) keys.push(key(sv.swingAt, VK[0]), key(sv.swingAt + sv.swingDur, v, { path: "arc", ease: "inOutCubic" }));
  return keys;
});

// ---------------------------------------------------------------- stage camera: frames the picture plane exactly; a slow push in the resolve
const DIST = S.frame.h / 2 / Math.tan((FOV * Math.PI) / 360);
export const CAMERA = [
  { t: 0, pos: [0, 0, DIST], target: [0, 0, 0], fov: FOV },
  { t: B.resolve.t + 0.3, pos: [0, 0, DIST], target: [0, 0, 0], fov: FOV },
  { t: DURATION, pos: [0.04, -0.02, DIST * 0.93], target: [0.02, -0.01, 0], fov: FOV, ease: "inOutSine" },
];

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a bed per beat
export const EVENTS = PLAN.events();
export const SCORE = [...scoreFromEvents(EVENTS, cubismVoices(S.sound), { seedBase: 151 }), ...bedScore(B, S.sound, DURATION)].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "facets.js: seeded convex partition of the picture plane; each facet samples the render target of its own viewpoint camera at its rest frame UV; crack/swing/slide/flip/resolve windows are closed-form; SCORE from plan.events().",
  facets: PLAN.facets.map((f) => ({ i: f.i, view: f.view, crackAt: +f.crackAt.toFixed(3), flip: f.flip ? { at: f.flip.at, kind: f.flip.kind } : null })),
  views: S.views.map((v, k) => ({ id: v.id, swingAt: PLAN.views[k].swingAt })),
  words: "stencilled words on newsprint/label are decorative (LE JOUR, BAR, VIN); no data on screen",
};
