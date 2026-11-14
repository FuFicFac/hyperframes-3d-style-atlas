// scene.config.js — 50-pin-art: "This becomes that" — a giant pinscreen (style "pin-art").
// Plain data + the style's pure pin planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every shimmer tick, thud and bell in SCORE comes from the same plan the pins read.
// Field = XZ plane, x right, z toward the viewer; pins rise in +y.
import { STYLE_SPEC as S } from "./_atlas/styles/pin-art/spec.js";
import { pinGrid, createPlan, pinVoices } from "./_atlas/styles/pin-art/pins.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, boxCorners, sampleCameraKeys, projectPoint, prepareKeys } from "./_atlas/kit/framing.js";

export const ID = "50-pin-art";
export const STYLE = "pin-art";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (the plan's step times come from these)
export const BEATS = [
  { id: "roll", t: 0, dur: 3.2, label: "A field of steel pins" },
  { id: "hand", t: 3.2, dur: 3.2, label: "Press a shape in" },
  { id: "word", t: 6.4, dur: 3.1, label: "This becomes that" },
  { id: "data", t: 9.5, dur: 5.5, label: "Data rises from flat" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.25), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the pin plan
export const GRID = pinGrid(S.field);
// SAMPLE DATA — placeholder bar values, not a measurement (the overlay shows a SAMPLE DATA tag while bars are up)
export const SAMPLE_VALUES = [0.38, 0.62, 0.5, 0.86, 0.72, 1.0];
const BALL = { kind: "ball", id: "ball", from: [-5.3, 0.9], to: [5.3, -0.2], t0: B.roll.t + 0.45, t1: B.roll.t + 3.0, r: 1.2, top: 0.34, ease: "inOutSine" };
const RIPPLE = { kind: "ripple", id: "tap", c: [0, 0.4], t0: B.data.t + 0.75, amp: 0.32, speed: 3.4, wavelength: 0.75, life: 1.7 };
export const PLAN = createPlan(GRID, S.morph, {
  maxExt: S.field.maxExt,
  steps: [
    { id: "hand", t: B.hand.t + 0.15, to: { kind: "hand", center: [0.15, 0.55], size: 3.7, rot: 0.08, height: 0.42, bevel: 0.13, dome: 0.2 }, wave: { type: "radial", c: [0.2, 0.9] }, spread: 0.85 },
    { id: "word", t: B.word.t + 0.15, to: { kind: "text", text: "HELLO", cap: 1.45, center: [0, 0.5], radius: 0.18, bevel: 0.11, height: 0.5 }, wave: { type: "dir", dir: [1, 0] }, spread: 1.25 },
    { id: "drop", t: B.data.t + 0.1, to: { kind: "flat" }, wave: { type: "random", seed: 7 }, spread: 0.6, settle: "drop" },
    { id: "bars", t: B.data.t + 1.5, to: { kind: "bars", values: SAMPLE_VALUES, box: [-3.1, -1.2, 3.1, 1.9], gap: 0.3, maxH: 1.15, colors: [0, 1, 2, 3, 4, 5] }, wave: { type: "dir", dir: [1, 0] }, spread: 1.0 },
  ],
  layers: [BALL, RIPPLE],
});
const step = (id) => PLAN.steps.find((s) => s.id === id);
/** SAMPLE DATA tag window: in as the first bar starts rising, on to the end */
export const SAMPLE_TAG = { on: step("bars").first, off: Infinity };

// ---------------------------------------------------------------- camera: low orbit, still holds between morphs
// Moves only while pins are already moving (morph waves), and every hold is perfectly still: thousands of moving
// specular glints are what costs bitrate, so the camera never adds motion of its own to a hold.
export const CAMERA = [
  { t: 0, pos: [-3.0, 2.7, 7.0], target: [0.3, 0, 1.2], fov: 34 },
  { t: step("hand").t, pos: [-3.0, 2.7, 7.0], target: [0.3, 0, 1.2], fov: 34 },
  { t: step("hand").last + 0.45, pos: [-1.7, 3.2, 7.45], target: [0.2, 0.05, 1.15], fov: 34, path: "arc", ease: "inOutSine" },
  { t: step("word").t - 0.1, pos: [-1.7, 3.2, 7.45], target: [0.2, 0.05, 1.15], fov: 34 },
  { t: step("word").last + 0.1, pos: [0, 6.0, 6.6], target: [0, 0, 0.55], fov: 34, ease: "inOutSine" },
  { t: step("drop").t, pos: [0, 6.0, 6.6], target: [0, 0, 0.55], fov: 34 },
  { t: step("bars").t, pos: [2.0, 4.8, 7.9], target: [0.15, 0.35, 0.55], fov: 34, path: "arc", ease: "inOutSine" },
  { t: DURATION, pos: [2.0, 4.8, 7.9], target: [0.15, 0.35, 0.55], fov: 34 },
];

// ---------------------------------------------------------------- framing gate
// Required: the ball bump while on the field, each shape while it is up, and the whole field in the final wide's
// middle band. The caption (top-left, overlay) must not cover a shape: shape points left of x = -0.2 stay below y = 0.66.
const box = (b) => boxCorners(b.min, b.max);
const shapes = { hand: PLAN.shapeBox(0), word: PLAN.shapeBox(1), bars: PLAN.shapeBox(3) };
function regions(t) {
  const out = [];
  const c = PLAN.ballCenter("ball", t);
  if (c && Math.abs(c[0]) < 2.25) // it enters and leaves through the cropped field sides
    out.push({ id: "ball", pts: boxCorners([c[0] - 0.6, 0, c[1] - 0.6], [c[0] + 0.6, BALL.top, c[1] + 0.6]) });
  if (t > step("hand").last && t < step("word").t) out.push({ id: "hand", pts: box(shapes.hand) });
  if (t > step("word").last && t < step("drop").t) out.push({ id: "word", pts: box(shapes.word) });
  if (t > step("bars").last) out.push({ id: "bars", pts: box(shapes.bars) });
  return out;
}
export const FRAMING = framingReport(regions, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, safe: 0.9 });
const K = prepareKeys(CAMERA, { fov: S.camera.fov });
export const CAPTION_CLEAR = (() => {
  let worst = { y: -Infinity };
  for (let f = 0; f <= DURATION * 10; f++) {
    const t = f / 10, cam = sampleCameraKeys(K, t, { fov: S.camera.fov });
    for (const r of regions(t)) for (const p of r.pts) {
      const [x, y] = projectPoint(cam, p);
      if (x < -0.2 && y > worst.y) worst = { y: +y.toFixed(3), t, id: r.id };
    }
  }
  return { ok: worst.y < 0.66, worst };
})();
if ((!FRAMING.ok || !CAPTION_CLEAR.ok) && !globalThis.process?.env?.PIN_NOGATE) {
  throw new Error(`50-pin-art framing: ${JSON.stringify({ spans: FRAMING.spans.slice(0, 6), caption: CAPTION_CLEAR })}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a soft bed
export const EVENTS = PLAN.events(S.sound, { t0: 0, t1: DURATION, fps: FPS });
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 7, 12, 16], attack: 2.0, release: 2.0, brightness: S.sound.bed.brightness },
  ...scoreFromEvents(EVENTS, pinVoices(S.sound), { seedBase: 101 }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "pins.js: h_i(t) = sum over steps of (target_k - target_k-1) * settle(t - t_k - delay_k,i) (closed-form spring or gravity drop), max with a rolling-ball bump, plus a tap ripple; per-pin delays from position (radial / directional / seeded random).",
  pins: GRID.n,
  steps: PLAN.steps.map((s) => ({ id: s.id, t: s.t, first: +s.first.toFixed(3), last: +s.last.toFixed(3), land: +s.landAt.toFixed(3), changed: s.changed })),
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s, ${FRAMING.worst.id})` : "FAILS",
  caption: CAPTION_CLEAR,
  sampleData: "bar values are SAMPLE DATA placeholders",
};
