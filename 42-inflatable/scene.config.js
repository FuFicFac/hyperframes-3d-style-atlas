// scene.config.js — 42-inflatable: "Just add air". A vinyl word inflates letter by letter, a foil number deflates and
// the next one inflates (SAMPLE DATA), a heart is squeezed into a star, then the balloons float up on ribbons.
// Plain data + the style's pure planner (inflate.js). No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). Units: metres, Y-up, radians, s, sRGB hex. Objects stand in the plane z = 0 area.
import { planInflatables, wordActors, inflatableVoices, inflatableBed } from "./_atlas/styles/inflatable/inflate.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { STYLE_SPEC } from "./_atlas/styles/inflatable/spec.js";

export const ID = "42-inflatable";
export const STYLE = "inflatable";
export const DURATION = 15;   // keep equal to data-duration in index.html
export const FPS = 30;

// ---- beats: one caption line each (<= 26 chars)
export const BEATS = [
  { id: "air", t: 0, dur: 4.3, label: "Just add air" },
  { id: "count", t: 4.3, dur: 3.3, label: "Count it up" },
  { id: "squeeze", t: 7.6, dur: 3.2, label: "Squeeze it, bump it" },
  { id: "float", t: 10.8, dur: 4.2, label: "Let it float!" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, k) => B[id].t + k;

// ---- cast (homes are floor spots; the word's letter homes come from the real glyph layout in scene.js)
export const WORD = { text: "PARTY", cap: 1.15, colors: ["pink", "lemon", "mint", "sky", "tangerine"], ids: ["p", "a", "r", "t", "y"] };
export const DIGITS = { cap: 1.05, from: { id: "d4", n: 4, color: "silver", home: [3.95, 0, 0] }, to: { id: "d5", n: 5, color: "gold", home: [3.95, 0, 1.25] } };
export const HEART = { id: "heart", w: 1.08, color: "cherry", home: [-4.9, 0, 0.45] };
export const STAR = { id: "star", r: 0.56, color: "rose", home: [-4.0, 0, 0.45] };
// floating end positions (balloon pivot = bottom centre of its outline) and weights on the floor behind the word
export const FLOATS = {
  // weight: [floor spot while grounded, floor spot once floated] — the rising balloon drags its weight along the floor
  heart: { to: [-2.45, 1.5, -0.35], weight: [[-5.0, 0, -0.55], [-2.25, 0, -0.85]], t: at("float", 0.5) },
  star: { to: [-0.55, 2.02, -0.55], weight: [[-3.95, 0, -0.6], [-0.75, 0, -1.0]], t: at("float", 0.2) },
  d5: { to: [1.95, 1.72, -0.4], weight: [[4.5, 0, 1.0], [2.2, 0, -0.85]], t: at("float", 0.75) },
};

// ---- the plan: every motion AND every sound comes from these events
const P = STYLE_SPEC.plan;
export const ACTORS = [
  ...wordActors(WORD.ids, at("air", 0.35), { step: P.word.step, dur: P.inflate.dur }),
  { id: "d4", start: "full", home: DIGITS.from.home, events: [{ kind: "deflate", t: at("count", 0.55), dur: 1.3 }] },
  { id: "d5", start: "flat", home: DIGITS.to.home, events: [{ kind: "inflate", t: at("count", 1.6), dur: 1.3 }, { kind: "float", t: FLOATS.d5.t, dur: 2.3, to: FLOATS.d5.to }] },
  { id: "heart", start: "flat", home: HEART.home, events: [
    { kind: "inflate", t: at("squeeze", 0.1), dur: 1.0 },
    { kind: "squeeze", t: at("squeeze", 1.45), dur: 1.15, side: 1, amount: 0.6 },
    { kind: "float", t: FLOATS.heart.t, dur: 2.2, to: FLOATS.heart.to },
  ] },
  { id: "star", start: "flat", home: STAR.home, events: [
    { kind: "inflate", t: at("squeeze", 0.4), dur: 1.0 },
    { kind: "bump", t: at("squeeze", 1.45 + 0.32), dir: -1, amount: 0.16, by: "heart" },
    { kind: "float", t: FLOATS.star.t, dur: 2.2, to: FLOATS.star.to },
  ] },
];
export const PLAN = planInflatables(ACTORS, { K: P, sound: STYLE_SPEC.sound });

// ---- camera: one move per beat, holds during the action
export const CAMERA = [
  { t: 0, pos: [0, 3.0, 6.45], target: [0, 0.5, -0.3], fov: 32 },
  { t: at("air", 4.15), pos: [0, 2.3, 6.2], target: [0, 0.55, 0], fov: 32, ease: "inOutSine" },
  { t: at("count", 0.75), pos: [3.4, 1.85, 4.25], target: [3.95, 0.5, 0.45], fov: 32, ease: "inOutCubic" },
  { t: at("count", 3.2), pos: [3.5, 1.6, 4.35], target: [3.95, 0.55, 0.6], fov: 32, ease: "inOutSine" },
  { t: at("squeeze", 0.6), pos: [-3.9, 1.65, 3.9], target: [-4.3, 0.5, 0.35], fov: 32, ease: "inOutCubic" },
  { t: at("squeeze", 3.0), pos: [-3.95, 1.55, 3.85], target: [-4.3, 0.5, 0.4], fov: 32, ease: "inOutSine" },
  { t: at("float", 2.4), pos: [0.05, 1.75, 6.85], target: [0.05, 1.35, 0], fov: 32, ease: "inOutCubic" },
  { t: DURATION, pos: [0.05, 1.7, 6.7], target: [0.05, 1.35, 0], fov: 32, ease: "inOutSine" },
];

export const OBJECTS = [
  { id: "set", primitive: "procedural", factory: "studioSet", procedural: "bright warm-white seamless cyclorama sweep (floor curving up into the back wall), matte, receives soft shadows" },
];

// ---- SCORE: the light upbeat theme + every cue from the plan (hiss pitch follows fill, squeaks, boing, deflate, bump)
export const SCORE = [
  ...inflatableBed(DURATION, STYLE_SPEC.sound, BEATS),
  ...scoreFromEvents(PLAN.events, inflatableVoices(STYLE_SPEC.sound), { pan: (e) => (e.id === "d4" || e.id === "d5" ? 0.25 : e.id === "heart" || e.id === "star" ? -0.25 : 0) }),
];
export const DUCK = []; // duckFromBeats(beatsFromSrt(vo_srt)) once a voiceover exists
export const NOTES = {
  sample: "The number balloons (4 -> 5) are SAMPLE DATA, labelled on screen.",
  events: PLAN.events.length,
  frame: "word centred at x = 0 on the floor; digits at x = 3.95; heart + star at x = -4.9 / -3.7; balloons float to FLOATS.*.to",
};
