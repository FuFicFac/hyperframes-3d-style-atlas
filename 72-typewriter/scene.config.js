// scene.config.js — 72-typewriter: "One letter at a time" — a manual typewriter types five short lines (style "typewriter").
// Plain data + the style's pure typing planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The typed text on the paper IS the label. Every clack, bell, ratchet tick and carriage stop in
// SCORE comes from the same plan the picture reads; the camera keys are fitted to the same plan's carriage and page.
import { STYLE_SPEC as S } from "./_atlas/styles/typewriter/spec.js";
import { createTypePlan, typeVoices } from "./_atlas/styles/typewriter/typeplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { ramp } from "./_atlas/kit/choreo.js";
import { fitShot, prepareKeys, sampleCameraKeys, projectPoint } from "./_atlas/kit/framing.js";

export const ID = "72-typewriter";
export const STYLE = "typewriter";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats: one typed line each (the line is the label)
export const BEATS = [
  { id: "one", t: 0, dur: 2.85, label: "ONE LETTER" },
  { id: "time", t: 2.85, dur: 2.35, label: "AT A TIME." },
  { id: "model", t: 5.2, dur: 2.7, label: "A MODEL WRITES" },
  { id: "token", t: 7.9, dur: 2.75, label: "ONE TOKEN" },
  { id: "again", t: 10.65, dur: 1.75, label: "AT A TIME." },
  { id: "page", t: 12.4, dur: 2.6, label: "" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));

// ---------------------------------------------------------------- the one plan
export const LINES = [
  { text: B.one.label, at: B.one.t + 0.5, cps: 7 },
  { text: B.time.label, at: B.time.t, cps: 7 },
  { text: B.model.label, at: B.model.t, cps: 8.2 },
  { text: B.token.label, at: B.token.t, cps: 5, ink: "red" },   // the red half of the ribbon, struck slowly
  { text: B.again.label, at: B.again.t, cps: 7.5 },
];
export const PLAN = createTypePlan(S, LINES, { fps: FPS });
const L = PLAN.layout, M = S.machine;

// ---------------------------------------------------------------- camera: shots fitted to the machine + page, per sample
const box = (x0, x1, y0, y1, z0, z1) => [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [z0, z1].map((z) => [x, y, z])));
const carX = (t) => L.carriageX(PLAN.colSmooth(t));
const WIN = { x0: -0.93, x1: 0.93, y0: -0.9, y1: 0.9 };
// wide: the whole machine (body, carriage where it is now, the page)
const wide = (t) => [
  ...box(-M.width / 2, M.width / 2, 0.05, 1.0, -1.45, 2.0),
  ...box(carX(t) - 1.85, carX(t) + 1.85, 0.9, 1.5, -1.4, -0.8),
  ...L.pagePoints(carX(t), PLAN.feed(t)),
  ...[-1, 1].map((sx) => [carX(t) + sx * M.rest.w / 2, L.P[1] + M.rest.y1 * L.u[1], L.P[2] + M.rest.y1 * L.u[2]]),   // top of the paper rest
];
// close: the page, the print point, the basket and the spools (keys cropped off the bottom)
const close = (t) => [
  ...L.pagePoints(carX(t), PLAN.feed(t)),
  ...box(-1.45, 1.45, 0.75, 1.15, -0.7, 0.3),
];
const AZ = [[0, -0.46], [2.6, -0.3], [5.0, -0.1], [9.8, 0.12], [12.6, 0.24], [15, 0.2]];
const EL = [[0, 0.3], [5.0, 0.4], [9.8, 0.4], [12.8, 0.24], [15, 0.24]];
const CLOSE = [[0, 0], [2.4, 0], [5.0, 1], [10.4, 1], [12.9, 0.22], [15, 0.22]];   // 0 = wide, 1 = close
const mix = (a, b, w) => a.map((v, i) => v + (b[i] - v) * w);
const camAt = (t) => {
  const o = { azimuth: ramp(t, AZ), elevation: ramp(t, EL), fov: S.camera.fov, window: WIN, fill: 1 };
  const w = ramp(t, CLOSE), a = fitShot(wide(t), o), b = w > 0 ? fitShot(close(t), o) : a;
  return { pos: mix(a.pos, b.pos, w), target: mix(a.target, b.target, w) };
};
const STEP = 1 / 10;
export const CAMERA = Array.from({ length: Math.round(DURATION / STEP) + 1 }, (_, k) => {
  const t = +(k * STEP).toFixed(3);
  return { t, ...camAt(Math.min(t, 13.6)), fov: S.camera.fov, ease: "linear" };   // locked for the final hold
});

// ---------------------------------------------------------------- framing report: the page's corners, replayed
const KEYS = prepareKeys(CAMERA, { fov: S.camera.fov });
export const FRAMING = (() => {
  let worst = { m: 0, t: 0 }, minW = { v: 9, t: 0 };
  for (let f = 0; f <= DURATION * 15; f++) {
    const t = f / 15, cam = sampleCameraKeys(KEYS, t, { fov: S.camera.fov });
    const pts = L.pagePoints(PLAN.carriageX(t), PLAN.feed(t)).map((p) => projectPoint(cam, p));
    const m = Math.max(...pts.flatMap((p) => [Math.abs(p[0]), Math.abs(p[1])]));
    if (m > worst.m) worst = { m: +m.toFixed(3), t: +t.toFixed(2) };
    const w = (Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]))) / 2;
    if (w < minW.v) minW = { v: +w.toFixed(3), t: +t.toFixed(2) };
  }
  return { ok: worst.m <= 0.97, worstPageNdc: worst, narrowestPageWidth: minW };
})();
if (!FRAMING.ok && !globalThis.process?.env?.TW_NOGATE) throw new Error(`72-typewriter framing: ${JSON.stringify(FRAMING)}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a quiet room bed
export const EVENTS = PLAN.events();
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION + 0.5, root: S.sound.bed.root, chord: S.sound.bed.chord, attack: 0.5, release: 2.0, brightness: S.sound.bed.brightness, gain: S.sound.bed.gain, seed: 5 },
  ...scoreFromEvents(EVENTS, typeVoices(S.sound), { seedBase: 172, pan: (e) => e.pan ?? 0 }),
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "typeplan.js: text -> per-character strike times snapped to frames, key + type bar per character, carriage column, line feeds, bell; picture and SCORE read the same plan.",
  strikes: PLAN.strikes.length,
  returns: PLAN.returns.map((r) => +r.t0.toFixed(2)),
  lineTimes: LINES.map((_, i) => PLAN.chars.filter((c) => c.line === i).map((c) => c.t)).map((a) => [a[0], a[a.length - 1]]),
  end: PLAN.end,
  framing: FRAMING,
};
