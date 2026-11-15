// scene.config.js — 60-microscope-slide: "One becomes two" — the view down a light microscope (style "microscope-slide").
// Plain data + the style's pure planner (culture.js). No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). The picture and every division pluck, objective clunk and focus whir in SCORE come
// from the same lineage + optics plans. Specimen units are micrometres; the scale bar and magnification are SAMPLE DATA.
import { STYLE_SPEC as S } from "./_atlas/styles/microscope-slide/spec.js";
import { createCulture, createOptics, fieldFit, cultureVoices } from "./_atlas/styles/microscope-slide/culture.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { rng } from "./_atlas/kit/time.js";

export const ID = "60-microscope-slide";
export const STYLE = "microscope-slide";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "focus", t: 0, dur: 3.4, label: "One living cell" },
  { id: "copy", t: 3.4, dur: 4.4, label: "It copies everything" },
  { id: "split", t: 7.8, dur: 2.8, label: "One becomes two" },
  { id: "many", t: 10.6, dur: 4.4, label: "Then four.\nThen many." },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.25 : 0.5), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the culture (lineage plan)
const HERO = { id: "hero", pos: [0, 0], r: 13, z: 0, angle: 0.42, seed: 11, elong: 0.16,
  divide: { t: 4.5, dur: 5.6 }, next: [{ delay: 0.75, dur: 2.4, jitter: 0.15 }, { delay: 0.35, dur: 1.9, jitter: 0.15 }] };
const NEIGHBOURS = [
  { id: "n1", pos: [-41, 15], r: 10.5, z: 0.4, angle: 1.2, seed: 23, divide: { t: 11.4, dur: 2.5 } },
  { id: "n2", pos: [50, -19], r: 10, z: -0.8, angle: -0.5, seed: 37, divide: { t: 12.1, dur: 2.3 } },
  { id: "n3", pos: [31, 31], r: 9.5, z: 5.5, angle: 0.3, seed: 41 },
  { id: "n4", pos: [-36, -36], r: 10.5, z: -0.3, angle: 2.2, seed: 53, divide: { t: 10.5, dur: 2.6 }, next: [{ delay: 0.35, dur: 1.9, jitter: 0.2 }] },
  { id: "n5", pos: [56, 14], r: 9.5, z: 0.7, angle: 1.7, seed: 67, divide: { t: 12.9, dur: 2.2 } },
  { id: "n6", pos: [-56, -5], r: 11, z: -6.5, angle: 0.1, seed: 71 },
  { id: "n7", pos: [9, 47], r: 10, z: 0.2, angle: 2.8, seed: 83, divide: { t: 12.5, dur: 2.3 } },
  { id: "n8", pos: [-6, -62], r: 9, z: 1.2, angle: 0.9, seed: 97 },
  { id: "n9", pos: [50, -53], r: 10, z: 0.3, angle: -1.1, seed: 101, divide: { t: 11.1, dur: 2.4 } },
  { id: "n10", pos: [-47, 42], r: 10, z: -0.8, angle: 0.6, seed: 113, divide: { t: 12.8, dur: 2.1 } },
  { id: "n11", pos: [22, -38], r: 8.5, z: -4.5, angle: 1.4, seed: 127 },
  { id: "n12", pos: [-22, 37], r: 9, z: 3.8, angle: -0.7, seed: 131 },
];
export const PLAN = createCulture({ roots: [HERO, ...NEIGHBOURS], lineage: S.lineage, horizon: DURATION + 4 });
const heroDiv = PLAN.divisions.find((d) => d.id === "hero");

// ---------------------------------------------------------------- optics: objective, stage, focal plane
// Field radius ∝ 1 / magnification (40x: 40 µm, 63x: 25.4 µm, 32x: 50 µm) — illustrative SAMPLE DATA, not a calibration.
const C0 = PLAN.centreAt("hero", 0), C1 = PLAN.centreAt("hero", heroDiv.t + heroDiv.dur * 0.6);
const tObj1 = 3.65, tObj2 = 10.45;
export const OPTICS = createOptics({
  view: [
    { t: 0, umR: 40, center: [C0[0] + 1.5, C0[1] + 0.5], mag: "40×" },
    { t: tObj1, umR: 25.4, center: C0, mag: "63×", click: true },
    { t: heroDiv.t, umR: 25.4, center: C0, mag: "63×" },
    { t: heroDiv.t + heroDiv.dur * 0.6, umR: 25.4, center: C1, mag: "63×", ease: "inOutSine" },
    { t: tObj2, umR: 50, center: [C1[0] - 2, C1[1] - 1], mag: "32×", click: true },
  ],
  focus: [
    { t: 0, z: 9.5 },
    { t: 0.35, z: 9.5 },
    { t: 2.05, z: -1.1, ease: "inOutSine" }, // rack down past the cell...
    { t: 2.7, z: 0, ease: "inOutSine" }, // ...and settle on it
    { t: tObj1 - 0.05, z: 0 },
    { t: tObj1 + 0.02, z: 2.4 }, // the new objective lands a little off focus (hidden in the blink)
    { t: tObj1 + 0.75, z: 0, ease: "outCubic" }, // fine focus
    { t: tObj2 - 0.05, z: 0 },
    { t: tObj2 + 0.02, z: -2.2 },
    { t: tObj2 + 0.8, z: 0, ease: "outCubic" },
    { t: DURATION, z: 0 },
  ],
  blink: S.optics.blink,
});

// ---------------------------------------------------------------- field gate: the hero lineage stays inside the field stop
export const FIT = fieldFit(PLAN, OPTICS, ["hero"], { t0: 0, t1: DURATION, safe: 0.9 });
if (!FIT.ok && !globalThis.process?.env?.MICRO_NOGATE) throw new Error(`60-microscope-slide field fit: ${JSON.stringify(FIT.worst)}`);
/** a division is "visible" (and gets a sound) if it happens inside the field at the time */
const inField = (e) => {
  const o = OPTICS.at(e.t);
  return Math.hypot(e.x - o.center[0], e.y - o.center[1]) < o.umR * 0.95;
};

// ---------------------------------------------------------------- scale bar: SAMPLE DATA
export const SCALE = { "40×": 10, "63×": 10, "32×": 20 }; // bar length in µm per objective
export const SAMPLE_TAG = { on: 0.6, off: Infinity };

export const CAMERA = [{ t: 0, pos: [0, 0, 5], target: [0, 0, 0], fov: 35 }]; // unused by the full-screen shader; kept for the contract
export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plans' events + watery bed
export const EVENTS = [...PLAN.events({ visible: inField }), ...OPTICS.events()].sort((a, b) => a.t - b.t);
const water = (() => {
  const r = rng(907).next, out = [];
  for (let t = 0.3; t < DURATION - 0.3; t += 0.55 + r() * 0.9) out.push({ t: +t.toFixed(3), type: "bubble", gain: S.sound.water.gain * (0.4 + r() * 0.6), pitch: 0.5 + r() * 0.5, pan: (r() - 0.5) * 0.8, seed: 300 + out.length });
  return out;
})();
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 7, 12, 16], attack: 2.5, release: 2.5, brightness: S.sound.bed.brightness },
  { t: 0, type: "rumble", dur: DURATION, gain: 0.18, seed: 5 },
  ...water,
  ...scoreFromEvents(EVENTS, cultureVoices(S.sound), { seedBase: 101, pan: (e) => (e.x != null ? Math.max(-0.6, Math.min(0.6, e.x / 60)) : 0) }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "culture.js: lineage plan (birth, division start + duration, two daughters); centre = birth position + eased push + seeded drift measured from birth; division phase p -> shape (two SDF lobes, smooth union k -> 0) + stain parameters. Optics plan: objective keys (steps hidden in a dark blink) + focal-plane keys (racks).",
  hero: { divide: heroDiv.t, end: heroDiv.tEnd, daughters: PLAN.divisions.filter((d) => d.root === "hero").map((d) => ({ id: d.id, t: +d.t.toFixed(2), end: +d.tEnd.toFixed(2) })) },
  fieldFit: FIT,
  sampleData: "scale bar and magnification are SAMPLE DATA (illustrative); the division sequence is a simplified illustration",
};
