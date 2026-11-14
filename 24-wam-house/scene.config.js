// scene.config.js — 24-wam-house: the Why AI Matters channel package reel (ident, lower third, chapter card,
// key stat, end card), back to back on five sets of one navy studio joined by whip-pans. Plain data only
// (Node-importable). Units: metres (floor y = 0), Y-up, seconds. Component timings come from the style's
// THREE-free rundown module, so SCORE and the camera use the SAME times as the picture.
import { STYLE_SPEC } from "./_atlas/styles/wam-house/spec.js";
import {
  identPlan, lowerThirdPlan, chapterPlan, statPlan, endPlan, whipCamera, whipWindows, voices, whipSounds, bed,
} from "./_atlas/styles/wam-house/rundown.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "24-wam-house";
export const STYLE = "wam-house";
export const DURATION = 15;
export const FPS = 30;

// ---- copy (every component takes its copy as parameters; swap per episode) ----
export const COPY = {
  ident: { text: "WHY AI MATTERS", tagline: "PLAIN-ENGLISH AI, EVERY WEEK", wordTones: ["faceBlue", "faceGreen", "face"] },
  lowerThird: { name: "EKELLO HARRID", sub: "HOST · WHY AI MATTERS" },
  chapter: { index: 1, count: 3, kicker: "CHAPTER", title: "What changed this week" },
  stat: { value: 3, suffix: "×", label: "FASTER THAN LAST YEAR'S MODEL", tag: "SAMPLE DATA" },
  end: { text: "SUBSCRIBE", line: "NEW VIDEO EVERY WEEK" },
};

export const BEATS = [
  { id: "ident", t: 0.0, dur: 3.5 },
  { id: "lower", t: 3.5, dur: 2.5 },
  { id: "chapter", t: 6.0, dur: 3.0 },
  { id: "stat", t: 9.0, dur: 3.0 },
  { id: "end", t: 12.0, dur: 3.0 },
];
const at = (id, off = 0) => BEATS.find((b) => b.id === id).t + off;

// ---- sets: one per component, 18 m apart along +X; camera poses are relative to the set centre ----
const SP = STYLE_SPEC.set.spacing;
export const SETS = [
  { id: "ident", x: 0 * SP, arrive: at("ident"), pos: [-0.9, 1.75, 10.6], target: [0, 0.68, 0], fov: 30, level: 1 },
  { id: "lower", x: 1 * SP, arrive: at("lower"), pos: [0, 1.8, 10.0], target: [0, 1.5, 0], fov: 30, level: 0.35 },
  { id: "chapter", x: 2 * SP, arrive: at("chapter"), pos: [0.7, 1.95, 9.3], target: [0, 1.55, 0], fov: 30, level: 1 },
  { id: "stat", x: 3 * SP, arrive: at("stat"), pos: [0, 1.85, 10.6], target: [0, 1.25, 0], fov: 30, level: 1 },
  { id: "end", x: 4 * SP, arrive: at("end"), pos: [0.7, 1.75, 10.6], target: [0, 0.75, 0], fov: 30, level: 1 },
];
const W = STYLE_SPEC.whip;
export const CAMERA = whipCamera(SETS, { dur: W.dur, settle: W.settle, dolly: W.dolly });
export const WHIPS = whipWindows(SETS, W.dur);

// ---- component plans (pure timing) ----
export const PLANS = {
  ident: identPlan(at("ident", 0.2), { text: COPY.ident.text, tagline: COPY.ident.tagline }),
  lower: lowerThirdPlan(at("lower", 0.05), { hold: 0.95, name: COPY.lowerThird.name, sub: COPY.lowerThird.sub, stagger: 0.025 }),
  chapter: chapterPlan(at("chapter", -0.1), { index: COPY.chapter.index, count: COPY.chapter.count }),
  stat: statPlan(at("stat", 0.05), { value: COPY.stat.value, decimals: STYLE_SPEC.stat.decimals, countDur: STYLE_SPEC.stat.countDur, label: COPY.stat.label }),
  end: endPlan(at("end", 0.05), { text: COPY.end.text, line: COPY.end.line }),
};

// The studio is the only spec object; components are built in scene.js from style.props with COPY + PLANS.
export const OBJECTS = [
  { id: "studio", primitive: "procedural", factory: "studio",
    procedural: "navy cyclorama 150x60 m whose floor is a blurred planar mirror with a faint 1 m grid (4 m majors); lit horizon line at z -17; additive haze pools behind each set; bokeh discs behind the lower-third set",
    dims: { sets: SETS.map((s) => s.x), bokeh: [SETS[1].x] } },
];

// ---- sound: every cue from the plans (rule zips, type ticks, flips, lands, count ladder, sonic logo) ----
const events = Object.values(PLANS).flatMap((p) => p.events);
export const SCORE = [
  ...bed(STYLE_SPEC, DURATION),
  ...scoreFromEvents(events, voices(STYLE_SPEC), { seedBase: 21, seedStep: 5 }),
  ...whipSounds(WHIPS).map((s, k) => ({ ...s, seed: 900 + k })),
].sort((a, b) => a.t - b.t);
export const DUCK = [];
