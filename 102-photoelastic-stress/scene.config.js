// scene.config.js — 102-photoelastic-stress: "Where the load really goes" (style "photoelastic-stress").
// Plain data + the style's pure stress planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The beats set the load keys, the analyser slide and the third support's schedule; the picture
// (beam shader uniforms) and every sound cue (servo, glassy tone, seat knock) read the same plan.
import { STYLE_SPEC as S } from "./_atlas/styles/photoelastic-stress/spec.js";
import { createStressPlan } from "./_atlas/styles/photoelastic-stress/stressplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, pxRect } from "./_atlas/kit/framing.js";

export const ID = "102-photoelastic-stress";
export const STYLE = "photoelastic-stress";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;
export const TITLE = "Where the load really goes";

// ---------------------------------------------------------------- beats (storyboard, approved: times + labels as written)
export const BEATS = [
  { id: "clear", t: 0, dur: 2.5, label: "Clear plastic. No load." },
  { id: "load", t: 2.5, dur: 3.0, label: "Load on. Stress shows." },
  { id: "notch", t: 5.5, dur: 3.0, label: "Bands crowd at the notch" },
  { id: "support", t: 8.5, dur: 3.5, label: "Add one more support" },
  { id: "shared", t: 12, dur: 3.0, label: "Same load. Shared." },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// one label at a time: each fades out over the last 0.25 s of its beat while nothing else shows, the next fades in at its beat
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t, inDur: i ? 0.25 : 0.2, off: BEATS[i + 1] ? BEATS[i + 1].t - 0.25 : Infinity, outDur: 0.25 }));

// ---------------------------------------------------------------- the plan (loads, supports, analyser) from the beats
export const PLAN_CFG = {
  beam: S.beam, press: S.press, supports: S.supports, notch: S.notch, Cf: S.photo.Cf,
  analyser: { slide: [B.clear.t + 0.15, B.clear.t + 2.0] },
  plunger: { gap: 0.3, touch: [B.load.t + 0.05, B.load.t + 0.45], turnsPerM: 2.2, turnsPerLoad: 1.6 },
  load: [
    [B.load.t + 0.45, 0],
    [B.load.t + 2.5, 0.55, "inOutSine"],    // bands bloom from the contacts
    [B.notch.t + 0.4, 0.55],
    [B.notch.t + 2.6, 1.0, "inOutSine"],    // the press turns further: bands pack at the notch
  ],
  third: {
    ...S.third, visibleFrom: B.support.t,
    slide: [B.support.t + 0.1, B.support.t + 1.6],   // slides in under the beam along the channel
    lift: [B.support.t + 1.6, B.support.t + 2.0],     // jack up: seats against the beam (knock)
    take: [B.support.t + 2.0, B.support.t + 3.2],     // it takes its share: the notch bands relax (the wow)
  },
};
export const PLAN = createStressPlan(PLAN_CFG);

// ---------------------------------------------------------------- camera: front, slightly above; one move per beat
const CAP = pxRect(S.caption.x, S.caption.y, S.caption.maxW, S.caption.h);
const WIN = { x0: -0.94, x1: 0.94, y0: -0.93, y1: 0.68 }; // keep the subject under the caption band
const fov = S.camera.fov;
const shot = (box, o) => fitShot({ box }, { fov, window: WIN, fill: 1, ...o });
const BEAM_BOX = [[-2.06, 0.62, 0.4], [2.06, 2.12, 0.6]];
export const SHOTS = {
  open: shot([[-2.06, 0.62, 0.4], [2.06, 2.3, 0.6]], { azimuth: -0.2, elevation: 0.1 }),
  load: shot([[-2.06, 0.7, 0.4], [2.06, 2.2, 0.6]], { azimuth: -0.08, elevation: 0.09 }),
  notch: shot([[-0.15, 1.08, 0.44], [1.5, 1.94, 0.56]], { azimuth: 0.04, elevation: 0.06, align: [0, -0.2] }),
  support: shot([[-0.45, 0.56, 0.4], [2.75, 1.96, 0.76]], { azimuth: 0.08, elevation: 0.1 }),
  wide: shot([[-2.1, 0.58, 0.4], [2.1, 2.12, 0.6]], { azimuth: 0.1, elevation: 0.11 }),
};
const key = (t, s, ease) => ({ t, pos: s.pos, target: s.target, fov, ...(ease ? { ease } : {}) });
export const CAMERA = [
  key(0, SHOTS.open),
  key(B.load.t + 0.2, SHOTS.load, "inOutSine"),
  key(B.notch.t, SHOTS.load),
  key(B.notch.t + 1.4, SHOTS.notch, "inOutCubic"),
  key(B.support.t, SHOTS.notch),
  key(B.support.t + 1.0, SHOTS.support, "inOutCubic"),
  key(B.shared.t, SHOTS.support),
  key(B.shared.t + 1.5, SHOTS.wide, "inOutCubic"),
  key(DURATION, SHOTS.wide),
];

// ---------------------------------------------------------------- framing gate: the subject of each beat stays in the window, clear of the caption chip
const regions = (t) => {
  const r = [];
  if (t < B.notch.t) r.push({ id: "beam", box: BEAM_BOX });
  else if (t < B.support.t) r.push({ id: "notch", box: [[0.45, 1.1, 0.44], [1.15, 1.9, 0.56]] });
  else if (t < B.shared.t + 1.5) { r.push({ id: "notch", box: [[0.5, 1.1, 0.44], [1.1, 1.9, 0.56]] }); if (t > B.support.t + 1.0) r.push({ id: "third", box: [[0.25, 0.56, 0.4], [0.6, 1.2, 0.6]] }); }
  else r.push({ id: "beam", box: BEAM_BOX });
  return r;
};
export const FRAMING = framingReport(regions, CAMERA, {
  duration: DURATION, drift: S.camera.drift, fov, window: { x0: -0.96, x1: 0.96, y0: -0.96, y1: 0.96 },
  keepOut: [{ id: "caption", ...CAP }],
});
if (!FRAMING.ok && !globalThis.process?.env?.PE_NOGATE) {
  throw new Error(`102-photoelastic-stress framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
const SND = S.sound;
const VOICES = {
  slide: (e) => [
    { type: "rustle", dur: e.dur, density: 0.28, pitch: 1.6, gain: SND.slide.gain },
    { type: "whoosh", dir: "in", dur: e.dur, q: 0.9, pitch: 0.8, gain: SND.slide.whoosh },
  ],
  servo: (e) => [{ type: "servo", dur: e.dur, hz: e.hz, hz2: e.hz2, grit: SND.servo.grit, gain: SND.servo.gain }],
  touch: () => [{ type: "tick", gain: SND.touch.gain, pitch: 0.7 }, { type: "thud", dur: 0.25, pitch: 1.8, gain: 0.25 }],
  tone: (e) => [{
    type: "pad", bus: "sfx", root: SND.tone.base * Math.pow(2, SND.tone.perOrder * e.order), chord: [0, 12, 19], dur: e.dur,
    attack: e.first ? 0.3 : e.dur / 2, release: e.dur / 2, brightness: SND.tone.brightness,
    gain: SND.tone.gain * Math.min(1, 0.25 + e.order / 2),
  }],
  glide: (e) => [{ type: "whir", dur: e.dur, hz: 88, hz2: 104, gain: SND.glide.gain }],
  lift: (e) => [{ type: "whir", dur: e.dur, hz: 120, hz2: 165, gain: SND.glide.gain * 0.8 }],
  seat: () => [{ type: "thud", dur: 0.5, pitch: 1.1, gain: SND.seat.gain }, { type: "clack", gain: SND.seat.clack, pitch: 0.8 }],
  settle: () => [{ type: "chime", dur: 1.8, pitch: 0.75, gain: SND.settle.gain }],
};
export const EVENTS = PLAN.events({ end: DURATION, toneSeg: 0.5 });
export const SCORE = [
  { t: 0, type: "pad", root: SND.bed.root, chord: [0, 7, 12], dur: DURATION, attack: 0.8, release: 1.5, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 7 },
  ...scoreFromEvents(EVENTS, VOICES, { seedBase: 211 }),
];
export const DUCK = [];
export const NOTES = {
  title: TITLE,
  mechanism: "stressplan.js: σ = Σ Flamant point loads (press + supports, contact half-width a) + bending −M(x)(y−H/2)/I from the reactions (statics; the third support's share is a set value) + notch term Kt·σ_net decaying from the root; R = Cf(σ1−σ2); colour = interference table integrated over 380–780 nm.",
  orders: {
    notchBeat3: +PLAN.order(S.notch.x, S.notch.depth + 0.004, B.support.t).toFixed(2),
    notchShared: +PLAN.order(S.notch.x, S.notch.depth + 0.004, DURATION).toFixed(2),
    midBeat3: +PLAN.order(0, 0.004, B.support.t).toFixed(2),
    midShared: +PLAN.order(0, 0.004, DURATION).toFixed(2),
  },
  reactions: { before: PLAN.forces(B.support.t).map((f) => +f.P.toFixed(3)), after: PLAN.forces(DURATION).map((f) => +f.P.toFixed(3)) },
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s)` : "FAILS",
};
