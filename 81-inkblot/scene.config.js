// scene.config.js — 81-inkblot: "Same ink. Different story." — a folded-card inkblot read three ways (style "inkblot").
// Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every plip, the fold, the rubs, the peel and every pencil scratch in SCORE come from the same
// blot plan the picture reads. Sheet 3.6 x 1.7 m centred on the origin, crease along z, inked half at x < 0,
// the flap (x > 0) folds over it. Units: metres, Y-up, radians, seconds.
import { STYLE_SPEC as S } from "./_atlas/styles/inkblot/spec.js";
import { createBlot, events as blotEvents, blotVoices } from "./_atlas/styles/inkblot/blotplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "81-inkblot";
export const STYLE = "inkblot";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "drip", t: 0, dur: 2.75, label: "Drip some ink" },
  { id: "fold", t: 2.75, dur: 3.75, label: "Fold. Press. Peel." },
  { id: "moth", t: 6.5, dur: 2.4, label: "A moth?" },
  { id: "faces", t: 8.9, dur: 2.4, label: "Two faces?" },
  { id: "mask", t: 11.3, dur: 2.4, label: "A mask?" },
  { id: "same", t: 13.7, dur: 1.3, label: "Same ink. Different story." },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.08 : 0.15), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.42 : Infinity }));

// ---------------------------------------------------------------- the blot plan (the one schedule)
const RD = S.timing.read;
export const PLAN = createBlot({
  blot: S.blot, ink: S.ink, sheet: S.sheet,
  timing: {
    ...S.timing,
    drip: { ...S.timing.drip, first: B.drip.t + 0.3, last: B.drip.t + 2.4 },
    fold: { start: B.fold.t + 0.1, shut: B.fold.t + 1.0 },
    press: { ...S.timing.press, start: B.fold.t + 1.1, end: B.fold.t + 2.25 },
    peel: { start: B.fold.t + 2.4, open: B.fold.t + 3.65 },
  },
  readAt: [B.moth.t + 0.05, B.faces.t + 0.05, B.mask.t + 0.05],
});
if (PLAN.readings.some((r, k) => r.tEnd > (BEATS[3 + k]?.t ?? DURATION) + 0.01 && k < 2)) throw new Error("81-inkblot: a reading overruns its beat");

// ---------------------------------------------------------------- camera: three locked shots, one move between each
const W = S.sheet.width, H = S.sheet.height, fov = S.camera.fov;
const SHEET = { box: [[-W / 2, 0, -H / 2], [W / 2, 0.03, H / 2]] };
// the flap's free edge sweeps a half circle of radius W/2 over the crease
const ARC = [];
for (const th of [0.5, 0.8, 1.1, 1.4, 1.7, 2.0, 2.3, 2.6]) for (const z of [-H / 2, H / 2]) ARC.push([(W / 2) * Math.cos(th), (W / 2) * Math.sin(th) + 0.014, z]);
const BAND = { x0: -0.95, x1: 0.95, y0: -0.62, y1: 0.94 }; // the caption pill lives below y = -0.72
const DRIP = fitShot(SHEET, { elevation: 1.02, azimuth: -0.1, fov, window: BAND, fill: 1 });
const FOLD = fitShot({ points: [...ARC], box: SHEET.box }, { elevation: 0.86, azimuth: 0.22, fov, window: { ...BAND, y1: 0.97 }, fill: 1 });
const TOP = fitShot(SHEET, { elevation: 1.5, azimuth: 0, fov, window: BAND, fill: 1 });
const MID = fitShot(SHEET, { elevation: 1.2, azimuth: 0.1, fov, window: BAND, fill: 0.97 });
const key = (t, s, ease, path) => ({ t, pos: s.pos, target: s.target, fov, ...(ease ? { ease } : {}), ...(path ? { path } : {}) });
const HALF = { box: [[-W / 2, 0, -H / 2], [0, 0.12, H / 2]] }; // the shut card (inked half + flap on top)
const PRESS = fitShot(HALF, { elevation: 0.95, azimuth: 0.16, fov, window: { x0: -0.5, x1: 0.62, y0: -0.56, y1: 0.9 }, fill: 1 });
const TP = PLAN.timing;
export const CAMERA = [
  key(0, DRIP),
  key(B.fold.t - 0.25, DRIP),
  key(B.fold.t + 0.6, FOLD, "inOutSine", "arc"),
  key(TP.fold.shut - 0.1, FOLD),
  key(TP.press.start + 0.35, PRESS, "inOutSine"),
  key(TP.peel.start - 0.05, PRESS),
  key(TP.peel.start + 0.65, MID, "inOutSine"),
  key(TP.peel.open + 0.05, TOP, "outSine", "arc"),
  key(DURATION, TOP),
];
export const SHOTS = { DRIP, FOLD, PRESS, MID, TOP };

// ---------------------------------------------------------------- framing gate: the whole sheet stays in frame, above the caption
export const FRAMING = framingReport((t) => [{ id: "sheet", box: t > TP.fold.shut - 0.15 && t < TP.peel.open - 0.25 ? HALF.box : SHEET.box }], CAMERA, {
  duration: DURATION, drift: S.camera.drift, fov, window: { x0: -0.99, x1: 0.99, y0: -0.7, y1: 0.99 },
});
if (!FRAMING.ok && !globalThis.process?.env?.BLOT_NOGATE) {
  throw new Error(`81-inkblot framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a soft bed + camera air + a last chime
export const EVENTS = blotEvents(PLAN);
const SND = S.sound;
const panOf = (e) => (e.a != null ? -0.5 * Math.min(1, e.a / (W / 2)) : 0); // drops land on the left half
export const SCORE = [
  ...scoreFromEvents(EVENTS, blotVoices(SND), { seedBase: 181, pan: panOf }),
  { t: 0, type: "pad", root: SND.bed.root, chord: [0, 7, 12, 16], dur: DURATION, attack: 0.8, release: 1.6, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 3 },
  { t: PLAN.timing.peel.start + 0.2, type: "whoosh", dir: "out", dur: 1.1, q: 0.9, pitch: 0.7, gain: 0.1, seed: 5 },
  { t: B.same.t, type: "chime", dur: 1.3, pitch: 0.9, notes: 4, gain: 0.16, seed: 7 },
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "blotplan.js: seeded drop landing times -> beads; hinge angle, press, bleed and wet sheen are closed forms of t; the ink field is a sum of elliptical blobs evaluated per pixel in half-space (mirrored by construction); readings are polylines with per-stroke draw windows baked into an order channel.",
  drops: PLAN.drops.length, splashes: PLAN.sats.length, voids: PLAN.voids.length,
  readings: PLAN.readings.map((r) => `${r.id} @ ${r.t0}s (${r.strokes.length} strokes)`),
  framing: FRAMING.ok ? `ok (worst ${JSON.stringify(FRAMING.worst)})` : "FAILS",
};
