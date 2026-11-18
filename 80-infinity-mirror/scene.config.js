// scene.config.js — 80-infinity-mirror: "A copy of a copy of a copy" (what happens when AI learns from AI), style
// "infinity-mirror". Plain data + the style's pure recursion planner. No THREE, no window: imported by scene.js
// (browser) and by render-sfx / export-spec (Node). The camera keys and every pluck, tick and whoosh in SCORE come
// from the same plan the picture reads.
import { STYLE_SPEC as S } from "./_atlas/styles/infinity-mirror/spec.js";
import { createPlan, mirrorVoices } from "./_atlas/styles/infinity-mirror/recursion.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { fitShot, prepareKeys, sampleCameraKeys, projectPoint } from "./_atlas/kit/framing.js";

export const ID = "80-infinity-mirror";
export const STYLE = "infinity-mirror";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (every plan time comes from these)
export const BEATS = [
  { id: "light", t: 0, dur: 2.2, label: "Start with real data" },
  { id: "copies", t: 2.2, dur: 3.0, label: "A copy of a copy of a copy" },
  { id: "place", t: 5.2, dur: 2.2, label: "Whatever goes in, repeats" },
  { id: "dive", t: 7.4, dur: 2.9, label: "Each copy dimmer, greener" },
  { id: "bend", t: 10.3, dur: 2.4, label: "A tiny bias bends them all" },
  { id: "loop", t: 12.7, dur: 2.3, label: "AI learning from AI" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.15 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- exterior shots (fitted to the frame, above the caption band)
const A = S.aperture, G = S.gallery, hw = A.w / 2 + G.frame.bar, hh = A.h / 2 + G.frame.bar;
export const BOX = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [x, y, G.frame.front]);
const WIN = { x0: -0.95, x1: 0.95, y0: -0.64, y1: 0.93 };
const shot = (az, el, fill = 1) => fitShot(BOX, { azimuth: az, elevation: el, fov: S.camera.fov, window: WIN, fill });
const HEAD = shot(0, 0);
const EXTERIOR = [
  { t: 0, ...shot(-0.2, 0.03) },
  { t: B.copies.t + 2.4, ...shot(0.16, 0.05) },
  { t: B.place.t + 0.6, ...shot(0.16, 0.05) },
  { t: B.dive.t, ...HEAD },
].map((k) => ({ t: k.t, pos: k.pos, target: k.target }));

// ---------------------------------------------------------------- the one plan
const gX = -HEAD.pos[2] / S.cavity.depth;
export const TIMES = {
  duration: DURATION,
  light: { t: 0.25, dur: 1.3 },
  grow: { t: B.copies.t + 0.15, step: 0.3, slow: 7, rushT: B.copies.t + 2.25, rushDur: 0.7 },
  place: { t: B.place.t + 0.35, ripple: 0.03 },
  exterior: EXTERIOR,
  dive: {
    t: B.dive.t,
    keys: [[B.dive.t, gX], [B.dive.t + 1.05, -0.5], [B.dive.t + 2.1, 6.5], [B.bend.t + 0.2, 16.5], [B.bend.t + 1.2, 28], [B.bend.t + 2.0, 37.5], [B.loop.t, 41.6]],
  },
  tilt: { t0: B.bend.t - 0.1, t1: B.bend.t + 1.2, bank: 0.1 },
  exit: { t0: B.loop.t, t1: B.loop.t + 1.65 },
  end: { pos: HEAD.pos, target: HEAD.target },
  fov: { out: S.camera.fov, fly: 58 },
  lead: 4, flyY: 0.5,
};
export const PLAN = createPlan(S, TIMES);

// ---------------------------------------------------------------- camera: the plan's path sampled at every frame
export const CAMERA = Array.from({ length: DURATION * FPS + 1 }, (_, f) => {
  const t = f / FPS, c = PLAN.camera(t);
  return { t, pos: c.pos, target: c.target, fov: c.fov, roll: c.roll, ease: "linear" };
});

// ---------------------------------------------------------------- framing gate: while the camera is in the gallery and
// settled, the whole frame of the box stays in the safe area and above the caption band
const KEYS = prepareKeys(CAMERA, { fov: S.camera.fov });
export const FRAMING = (() => {
  const fails = []; let minFill = 9;
  for (let f = 0; f <= DURATION * FPS; f++) {
    const t = f / FPS;
    if (t > B.dive.t && t < TIMES.exit.t1) continue;
    const cam = sampleCameraKeys(KEYS, t, { fov: S.camera.fov });
    let x0 = 9, x1 = -9;
    for (const p of BOX) {
      const [x, y] = projectPoint(cam, p);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      if (Math.abs(x) > 0.97 || y > 0.96 || y < -0.68) fails.push({ t: +t.toFixed(2), x: +x.toFixed(3), y: +y.toFixed(3) });
    }
    minFill = Math.min(minFill, (x1 - x0) / 2);
  }
  return { ok: fails.length === 0, count: fails.length, fails: fails.slice(0, 5), minFill: +minFill.toFixed(3) };
})();
if (!FRAMING.ok && !globalThis.process?.env?.IM_NOGATE) throw new Error(`80-infinity-mirror framing: ${JSON.stringify(FRAMING)}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a quiet bed
export const EVENTS = PLAN.events();
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION + 0.5, root: S.sound.bed.root, chord: S.sound.bed.chord, attack: 0.5, release: 2.0, brightness: S.sound.bed.brightness, gain: S.sound.bed.gain, seed: 5 },
  { t: TIMES.light.t, type: "hum", dur: DURATION - TIMES.light.t, gain: S.sound.hum.gain, seed: 9 },
  ...scoreFromEvents(EVENTS, mirrorVoices(S.sound), { seedBase: 180, pan: (e) => e.pan ?? 0 }),
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "recursion.js: generation n = the real layer reflected n times, T_n = Rot(-n*tilt) Flip^n about the mirrors' hinge line; atten(n) = mirror^ceil(n/2) x glass^floor(n/2); one instance per generation; camera flies the centreline, the ring closes at tilt = pi/ringCells.",
  generations: PLAN.N,
  ringCells: PLAN.M,
  tGlass: +PLAN.tGlass.toFixed(3),
  framing: FRAMING.ok ? `ok (narrowest exterior width fill ${FRAMING.minFill})` : `FAILS ${JSON.stringify(FRAMING.fails)}`,
};
