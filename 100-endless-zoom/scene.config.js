// scene.config.js — 100-endless-zoom: "What is inside one AI answer", style "endless-zoom". Plain data + the style's
// pure level planner. No THREE, no window: imported by scene.js (browser) and by render-sfx / export-spec (Node).
// The label windows, every Shepard step, chime and whoosh in SCORE come from the same zoom plan the picture reads.
import { STYLE_SPEC as S } from "./_atlas/styles/endless-zoom/spec.js";
import { createZoomPlan, zoomVoices } from "./_atlas/styles/endless-zoom/zoom.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "100-endless-zoom";
export const STYLE = "endless-zoom";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- the chain of worlds (loop order). R = portal depth:
// the next world lives inside this one's portal at scale 1/R. window = how this world is framed inside the previous one.
export const CHAIN = [
  { id: "chat", builder: "chat", window: "circle", R: 12, label: "And it all adds up to this", labelAt: 0.35 },
  { id: "tokens", builder: "tokens", window: "rrect", R: 6, label: "Every word is a token" },
  { id: "numbers", builder: "numbers", window: "rrect", R: 6, label: "Every token is numbers" },
  { id: "network", builder: "network", window: "rrect", R: 6, label: "Numbers flow through layers" },
  { id: "chip", builder: "chip", window: "circle", R: 20, label: "Layers run on chips" },
  { id: "switch", builder: "switch", window: "rrect", R: 7, label: "A spark, on or off" },
];

// the clip opens on a question; the same world closes on the answer (the picture loops, only this text differs)
export const OPEN_LABEL = "What's inside one answer?";
export const PLAN = createZoomPlan(CHAIN, {
  duration: DURATION, openLabel: OPEN_LABEL, phase: S.zoom.phase, fade: S.zoom.fade, labelAt: S.zoom.labelAt, labelFade: S.zoom.labelFade, blinkCycles: S.zoom.blinkCycles,
});

// beats = one per world, starting at its label swap (the chat world's beat wraps across the loop seam)
const CROSS = PLAN.crossings();
export const BEATS = [{ id: "open", t: 0, dur: +CROSS[0].t.toFixed(3), label: OPEN_LABEL }, ...CROSS.map((c, i) => ({ id: CHAIN[c.level].id, t: +c.t.toFixed(3), dur: +((CROSS[i + 1]?.t ?? DURATION) - c.t).toFixed(3), label: CHAIN[c.level].label, fill: +c.fill.toFixed(3) }))];

// ---------------------------------------------------------------- gate: the loop closes, labels long enough, one at a time
export const REPORT = PLAN.report();
if (!REPORT.ok && !globalThis.process?.env?.EZ_NOGATE) throw new Error(`100-endless-zoom plan: ${JSON.stringify({ loop: REPORT.loop, short: REPORT.shortLabels, minSum: REPORT.minLabelAlphaSum })}`);

export const CAMERA = []; // the zoom world places the camera (fixed dolly + periodic sway); the zoom is the worlds' scale
export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: Shepard scale (the bed) + chime per crossing
const voices = zoomVoices(S.sound);
const EVENTS = [
  ...PLAN.shepard(S.sound.shepard).map((e) => ({ ...e, kind: "shepard" })),
  ...CROSS.map((c) => ({ t: c.t, kind: "crossing", level: c.level })),
  ...CROSS.map((c) => ({ t: Math.max(0, c.t - 0.55), kind: "whoosh", level: c.level })),
  ...CROSS.filter((c) => c.level === 0).map((c) => ({ t: c.t + 0.02, kind: "sparkle" })),
];
export const SCORE = scoreFromEvents(EVENTS, voices, { seedBase: 300, pan: (e) => (e.kind === "shepard" ? ((e.partial % 2) * 2 - 1) * 0.25 : 0) }).sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "zoom.js: S_m(t) = exp(k (tau - tau_m)), tau = t + phase wrapped; k = ln(prod R) / duration; T_m = ln R_m / k. Two worlds drawn per frame: the outer one directly, the inner one through the portal window (render target, SDF mask, alpha from S_inner).",
  k: +PLAN.k.toFixed(4),
  levelSeconds: PLAN.T.map((x) => +x.toFixed(3)),
  totalZoom: Math.round(Math.exp(PLAN.lnTotal)),
  labels: REPORT.labels,
};
