// scene.config.js — 52-zoetrope: "Animation about animation" — a 3D zoetrope (style "zoetrope").
// Plain data + the style's pure spin planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The whir pitch follows the plan's disc speed; every bounce marimba and bloom pluck is a frame where
// the FRONT station under the strobe shows that pose — the same plan the picture reads.
import { STYLE_SPEC as S } from "./_atlas/styles/zoetrope/spec.js";
import { createSpin, TAU } from "./_atlas/styles/zoetrope/zoetrope.js";
import { framingReport, boxCorners } from "./_atlas/kit/framing.js";

export const ID = "52-zoetrope";
export const STYLE = "zoetrope";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (the spin plan's times come from these)
export const BEATS = [
  { id: "still", t: 0, dur: 3.5, label: "24 statues, each frozen" },
  { id: "spin", t: 3.5, dur: 3.5, label: "Spin them: just a blur" },
  { id: "strobe", t: 7.0, dur: 3.4, label: "Add a strobe: they move" },
  { id: "creep", t: 10.4, dur: 2.4, label: "Detune it: they creep" },
  { id: "stop", t: 12.8, dur: 2.2, label: "Light on: statues again" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.25), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the spin plan
const N = S.rings[0].N;
export const DETUNE = 1.025;               // disc 2.5 % faster than the strobe: the animation creeps forward
export const STROBE = [{ on: B.strobe.t, off: B.stop.t }];
export const SPIN = createSpin({
  N, fps: FPS, shutter: S.spin.shutter, blurSamples: S.spin.blurSamples,
  steps: [
    { t: B.spin.t + 0.2, d: 1.9, rate: 1 },           // spin up to one station per frame (the locked speed)
    { t: B.creep.t, d: 0.5, rate: DETUNE },           // detune
    { t: B.stop.t + 0.1, d: 1.9, rate: 0 },           // strobe off: coast to a stop
  ],
  strobe: STROBE,
  lockAt: B.strobe.t,
});

// ---------------------------------------------------------------- camera
// Close slide past the front statues (each pose differs), pull back for the blur, slow push in on the living ring,
// a small swing to show the creep, then back out as it coasts to a stop. One move per beat; holds are still.
export const CAMERA = [
  { t: 0, pos: [-1.9, 1.85, 4.2], target: [-0.5, 0.76, 1.15], fov: 34 },
  { t: B.spin.t - 0.1, pos: [1.9, 1.85, 4.2], target: [0.5, 0.76, 1.15], fov: 34, ease: "inOutSine" },
  { t: B.spin.t + 2.0, pos: [0, 3.25, 5.7], target: [0, 0.48, 0.1], fov: 34, ease: "inOutCubic" },
  { t: B.strobe.t, pos: [0, 3.25, 5.7], target: [0, 0.48, 0.1], fov: 34 },
  { t: B.creep.t, pos: [0, 2.2, 4.3], target: [0, 0.74, 0.85], fov: 34, ease: "inOutSine" },
  { t: B.stop.t, pos: [0.9, 2.5, 4.7], target: [0.1, 0.72, 0.55], fov: 34, ease: "inOutSine" },
  { t: B.stop.t + 1.9, pos: [0, 3.25, 5.7], target: [0, 0.48, 0.1], fov: 34, ease: "inOutCubic" },
  { t: DURATION, pos: [0, 3.25, 5.7], target: [0, 0.48, 0.1], fov: 34 },
];

// ---------------------------------------------------------------- framing gate
// Required: the front stations in every close shot, the whole turntable in the wides. The caption (top-left chip)
// is checked by eye in the stills.
const T = S.table, top = T.baseH + T.platterH;
const frontBox = (cx = 0) => boxCorners([cx - 0.45, top, 0.75], [cx + 0.45, top + T.tierH + 0.75, 1.9]);
const wholeBox = boxCorners([-T.platterR, 0, -T.platterR], [T.platterR, top + T.tierH + 0.7, T.platterR]);
function regions(t) {
  if (t < B.spin.t) return [{ id: "front", pts: frontBox(-0.5 + (t / B.spin.t)) }];
  if ((t > B.spin.t + 2.0 && t < B.strobe.t + 0.3) || t > B.stop.t + 1.9) return [{ id: "turntable", pts: wholeBox }];
  if (t >= B.strobe.t && t < B.stop.t + 1.9) return [{ id: "front", pts: frontBox(0) }];
  return [];
}
export const FRAMING = framingReport(regions, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, safe: 0.92 });
if (!FRAMING.ok && !globalThis.process?.env?.ZOE_NOGATE) {
  throw new Error(`52-zoetrope framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: from the plan
const So = S.sound;
const unit = SPIN.unit;
const whirHz = (t) => So.whir.hz + (So.whir.hz2 - So.whir.hz) * (SPIN.omega(t) / unit);
const whir = [];
for (let t = B.spin.t + 0.2; t < DURATION; t += So.whir.seg) {
  const w = Math.max(SPIN.omega(t), SPIN.omega(t + So.whir.seg)) / unit;
  if (w < 0.03) continue;
  whir.push({ t: +t.toFixed(3), type: "whir", dur: So.whir.seg * 1.25, hz: +whirHz(t).toFixed(2), hz2: +whirHz(t + So.whir.seg).toFixed(2), gain: +(So.whir.gain * Math.min(1, 0.35 + 0.65 * w)).toFixed(3), seed: 300 + whir.length });
}
export const EVENTS = SPIN.events({ t0: 0, t1: DURATION, bloomAt: 0.55 });
const evScore = EVENTS.flatMap((e, k) => {
  const seed = 500 + k;
  if (e.kind === "bounce") return [{ t: e.t, type: "marimba", hz: So.bounce.hz, gain: So.bounce.gain, decay: 0.18, seed }];
  if (e.kind === "bloom") return [{ t: e.t, type: "pluck", hz: So.bloom.hz, gain: So.bloom.gain, decay: 0.6, dur: 0.8, seed }];
  if (e.kind === "strobeOn") return [{ t: e.t, type: "clack", gain: So.strobeOn.gain, seed }, { t: e.t, type: "buzz", hz: So.strobeHum.hz, flicker: 0, dur: STROBE[0].off - STROBE[0].on, gain: So.strobeHum.gain, seed: seed + 1000 }];
  if (e.kind === "strobeOff") return [{ t: e.t, type: "click", gain: So.strobeOn.gain * 0.8, seed }];
  return [];
});
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: So.bed.gain, root: So.bed.root, chord: [0, 4, 7, 12], attack: 1.5, release: 2.0, brightness: So.bed.brightness },
  ...LABELS.map((L, i) => ({ t: L.on, type: "marimba", hz: [523.25, 587.33, 659.25, 698.46, 783.99][i % 5], gain: So.label.gain, decay: 0.25, seed: 200 + i })),
  ...whir,
  ...evScore,
];
export const DUCK = [];
export const NOTES = {
  mechanism: "zoetrope.js: station i carries phase frac(-i/N); disc angle theta(t) = exact integral of smoothstep speed steps; continuous light = mean of K renders over a one-frame shutter; strobe = theta at the frame time (one station per frame when locked, x1.025 detuned).",
  stations: S.rings.map((r) => `${r.id}: ${r.N} x ${r.pose}`),
  lockOffset: +SPIN.offset.toFixed(5),
  events: EVENTS.length,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s, ${FRAMING.worst.id})` : "FAILS",
  tau: TAU,
};
