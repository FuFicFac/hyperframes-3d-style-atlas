// scene.config.js — 112-schlieren: "The air was moving" (style "schlieren").
// Plain data + the style's pure plume planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The beats set the blade travel, the plume reveal, the rolling transition, the straw + puff and the
// split seam; the picture (disc shader uniforms) and every sound cue read the same plan.
import { STYLE_SPEC as S } from "./_atlas/styles/schlieren/spec.js";
import { createPlumePlan, flameTip } from "./_atlas/styles/schlieren/plumeplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { sampleCameraKeys, projectPoint, pxRect } from "./_atlas/kit/framing.js";

export const ID = "112-schlieren";
export const STYLE = "schlieren";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;
export const TITLE = "The air was moving";

// ---------------------------------------------------------------- beats (storyboard, approved: times + labels as written)
export const BEATS = [
  { id: "candle", t: 0, dur: 2.5, label: "A candle. Still air?" },
  { id: "blade", t: 2.5, dur: 3.0, label: "Slide in a blade" },
  { id: "heat", t: 5.5, dur: 3.0, label: "Now the heat shows" },
  { id: "breath", t: 8.5, dur: 3.5, label: "A breath bends it" },
  { id: "always", t: 12, dur: 3.0, label: "It was always moving" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t, inDur: i ? 0.25 : 0.2, outDur: 0.25 }));

// ---------------------------------------------------------------- the plan (from the beats)
export const PLAN_CFG = {
  plume: S.plume,
  lamp: { on: [0.15, 0.85], from: 0.12 },
  blade: { ...S.blade, slide: [B.blade.t + 0.2, B.blade.t + 2.1] },
  reveal: [B.heat.t + 0.1, B.heat.t + 0.9],
  roll: { keys: [[B.heat.t + 0.1, S.plume.rollTop], [B.heat.t + 2.7, S.plume.rollLow, "inOutSine"]] },
  straw: { ...S.straw, in: [B.breath.t + 0.05, B.breath.t + 0.7], out: [B.always.t - 0.5, B.always.t + 0.2] },
  puff: { ...S.puff, t: B.breath.t + 1.1, y: S.straw.y },
  seam: { in: [B.always.t + 0.15, B.always.t + 1.0], from: -S.mirror.R - 0.02, to: -0.1 },
};
export const PLAN = createPlumePlan(PLAN_CFG);

// ---------------------------------------------------------------- camera: from near the knife edge, one move per beat
const fov = S.camera.fov;
const k = (t, pos, target, ease) => ({ t, pos, target, fov, ...(ease ? { ease } : {}) });
export const CAMERA = [
  k(0, [0.1, 1.5, 5.4], [-0.25, 1.42, 0]),
  k(B.blade.t, [0.12, 1.48, 5.15], [-0.25, 1.4, 0], "inOutSine"),
  k(B.blade.t + 0.9, [0.3, 1.4, 5.05], [-0.3, 1.38, 0], "inOutCubic"),
  k(B.heat.t, [0.3, 1.4, 5.05], [-0.3, 1.38, 0]),
  k(B.heat.t + 1.6, [0.0, 1.55, 4.3], [-0.36, 1.53, 0], "inOutCubic"),
  k(B.breath.t, [0.0, 1.55, 4.3], [-0.36, 1.53, 0]),
  k(B.breath.t + 0.8, [-0.1, 1.52, 4.35], [-0.42, 1.5, 0], "inOutSine"),
  k(B.always.t, [-0.1, 1.52, 4.35], [-0.42, 1.5, 0]),
  k(B.always.t + 1.2, [-0.05, 1.55, 4.28], [-0.38, 1.55, 0], "inOutCubic"),
  k(DURATION, [-0.05, 1.55, 4.28], [-0.38, 1.55, 0]),
];

// ---------------------------------------------------------------- framing gate: the mirror rim never touches the caption chip
const CAP = pxRect(S.caption.x, S.caption.y, S.caption.maxW, S.caption.h);
const RIM = Array.from({ length: 96 }, (_, i) => {
  const a = (i / 96) * 2 * Math.PI, r = S.mirror.R + S.mirror.cell;
  return [r * Math.cos(a), S.mirror.y + r * Math.sin(a), S.mirror.z + 0.06];
});
function frameCheck() {
  let worstCap = -9, discFillMin = 9, discFillMax = 0;
  for (let i = 0; i <= DURATION * 30; i++) {
    const t = i / 30, cam = sampleCameraKeys(CAMERA, t, { drift: S.camera.drift, fov });
    let ymin = 9, ymax = -9;
    for (const p of RIM) {
      const [x, y] = projectPoint(cam, p);
      ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
      // how far the rim point reaches into the caption rect (positive = overlap)
      const inside = Math.min(x - CAP.x0, CAP.x1 - x, y - CAP.y0, CAP.y1 - y);
      worstCap = Math.max(worstCap, inside);
    }
    const fill = (Math.min(1, ymax) - Math.max(-1, ymin)) / 2;
    discFillMin = Math.min(discFillMin, fill); discFillMax = Math.max(discFillMax, fill);
  }
  return { capOverlap: +worstCap.toFixed(3), discFillMin: +discFillMin.toFixed(2), discFillMax: +discFillMax.toFixed(2) };
}
export const FRAMING = frameCheck();
if (FRAMING.capOverlap > 0 && !globalThis.process?.env?.SCH_NOGATE) {
  throw new Error(`112-schlieren framing: mirror rim under the caption chip ${JSON.stringify(FRAMING)}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
const SND = S.sound;
const VOICES = {
  slide: (e) => [
    { type: "servo", dur: e.dur, hz: 240, hz2: 300, grit: 0.55, gain: SND.slide.servo },
    { type: "rustle", dur: e.dur, density: 0.12, pitch: 2.4, gain: SND.slide.gain },
  ],
  lamp: (e) => [{ type: "click", pitch: 0.8, gain: SND.cut.gain }, { type: "whoosh", dir: "in", dur: e.dur + 0.3, q: 0.8, pitch: 0.7, gain: SND.straw.gain }],
  cut: () => [{ type: "tick", pitch: 1.3, gain: SND.cut.gain }],
  stop: () => [{ type: "clack", pitch: 1.6, gain: SND.cut.gain * 0.7 }],
  air: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, q: 0.55, pitch: 0.55, pan: e.pan, gain: SND.air.gain * e.level }],
  straw: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, q: 1.2, pitch: 1.1, gain: SND.straw.gain }],
  puff: () => [{ type: "whoosh", dir: "out", dur: 0.55, q: 0.7, pitch: 0.42, pan: -0.35, gain: SND.puff.gain }],
  swirl: (e) => [{ type: "whoosh", dir: "in", dur: 0.75, q: 1.1, pitch: 0.65 + 0.06 * e.k, pan: e.pan, gain: SND.swirl.gain }],
  seam: (e) => [{ type: "whoosh", dir: "in", dur: e.dur + 0.2, q: 1.4, pitch: 1.15, pan: -0.3, gain: SND.seam.gain }],
  settle: () => [{ type: "chime", dur: 1.8, pitch: 0.7, gain: SND.settle.gain }],
};
export const EVENTS = PLAN.events({ end: DURATION });
export const SCORE = [
  { t: 0, type: "pad", root: SND.bed.root, chord: [0, 7, 12], dur: DURATION, attack: 0.8, release: 1.5, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 7 },
  ...scoreFromEvents(EVENTS, VOICES, { seedBase: 311 }),
];
export const DUCK = [];

const tip = flameTip(S);
export const NOTES = {
  title: TITLE,
  mechanism: "plumeplan.js: plume density = closed form of (x, y, t) in the candle's plane (gaussian column widening + fading with height, rolling = 3D value-noise domain warp advected at the rise speed + travelling bulges below a falling transition height); breath push D(y, t) = closed-form erf integral of a gaussian puff along each parcel's rise; picture = ∂n/∂x (central difference), soft-clipped, light/dark on grey.",
  flameTip: tip.map((v) => +v.toFixed(3)),
  puffPushMax: +Math.max(...Array.from({ length: 60 }, (_, i) => PLAN.D(S.straw.y + 0.02 * (i - 10), PLAN_CFG.puff.t + 1.0))).toFixed(3),
  framing: FRAMING,
};
