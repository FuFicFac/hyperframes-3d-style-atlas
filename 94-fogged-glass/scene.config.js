// scene.config.js — 94-fogged-glass: "The context window — why AI forgets the start of a long chat" (style "fogged-glass").
// Plain data + the style's pure stroke/drip planner. No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). Every wipe, drop, re-fogging time and sound cue comes from PLAN.
// Plan space: 1920 x 1080 units across the pane, x right, y down. World: the pane is 3.2 x 1.8 m at z = 0, facing +Z.
import { STYLE_SPEC as S } from "./_atlas/styles/fogged-glass/spec.js";
import { createPlan, fogVoices } from "./_atlas/styles/fogged-glass/fogplan.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "94-fogged-glass";
export const STYLE = "fogged-glass";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "start", t: 0, dur: 3.2, label: "A chat starts here" },
  { id: "grow", t: 3.2, dur: 3.2, label: "The chat keeps growing" },
  { id: "forget", t: 6.4, dur: 2.7, label: "The start fogs over" },
  { id: "window", t: 9.1, dur: 2.1, label: "That's the context window" },
  { id: "reveal", t: 11.2, dur: 3.8, label: "Bigger window, whole view" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// one label at a time, no gaps: each fades out over 0.2 s right before the next fades in
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0 : 0.15), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.2 : Infinity }));

// ---------------------------------------------------------------- the plan: three words, then the palm
// The window holds about two words: as NOW is written, START narrows and fogs over (in writing order); MIDDLE is going
// when the palm arrives. fogAt = when the fog starts to creep back over the first point of the word.
export const WORDS = [
  { text: "START", t: B.start.t + 0.45, dur: 2.45, x: 150, y: 398, cap: 222, fogAt: B.forget.t + 0.3, fogSpread: 0.35, fade: 1.5 },
  { text: "MIDDLE", t: B.grow.t + 0.3, dur: 2.65, x: 520, y: 688, cap: 222, fogAt: B.window.t + 0.5, fogSpread: 0.35, fade: 1.7 },
  { text: "NOW", t: B.forget.t + 0.45, dur: 1.75, x: 1150, y: 978, cap: 222 },
];
const P0 = B.reveal.t + 0.3;
export const PLAN = createPlan({
  words: WORDS,
  finger: { width: 40, step: 12, wobble: 4, fresh: 1.3 },
  palm: {
    width: 640,
    passes: [
      { t: P0, dur: 0.8, a: [-380, 660], via: [900, 120], b: [2300, 420] },          // left -> right, a high arc
      { t: P0 + 0.9, dur: 0.8, a: [2300, 800], via: [1000, 1010], b: [-380, 760] },  // and back along the bottom
    ],
    evaporate: { delay: -0.25, dur: 0.9 },
  },
  drips: { chance: 0.55, max: 12 },
  // a few fat drops run down the clean glass after the wipe
  extraDrops: [
    { x: 420, y: 150, t: P0 + 1.3, gather: 0.5, v: 190, L: 760, r: 26 },
    { x: 1490, y: 90, t: P0 + 1.7, gather: 0.5, v: 230, L: 900, r: 30 },
    { x: 1010, y: 210, t: P0 + 2.1, gather: 0.4, v: 170, L: 600, r: 22 },
  ],
  seed: 5,
  end: DURATION,
});

// ---------------------------------------------------------------- camera
// d0 = the distance where the pane exactly fills the frame. Opening: a little back and to the left (frame, wall and
// parallax through the glass), square-on by the time the first word is half written; one slow push at the reveal.
const d0 = S.pane.restDistance, fov = S.camera.fov;
export const CAMERA = [
  { t: 0, pos: [-0.62, 0.1, d0 * 1.16], target: [0, 0, 0], fov },
  { t: 2.3, pos: [0, 0, d0 * 0.985], target: [0, 0, 0], fov, ease: "inOutSine" },
  { t: B.reveal.t + 0.2, pos: [0, 0, d0 * 0.985], target: [0, 0, 0], fov },
  { t: DURATION - 0.4, pos: [0.14, 0.03, d0 * 0.9], target: [0.02, 0, 0], fov, ease: "inOutSine" },
  { t: DURATION, pos: [0.14, 0.03, d0 * 0.9], target: [0.02, 0, 0], fov },
];

// ---------------------------------------------------------------- gates: the words stay on the pane, clear of the chip
export const BOXES = WORDS.map((w, i) => ({ text: w.text, ...PLAN.wordBox(i) }));
const chipBottom = S.caption.y + S.caption.h + 12;
const bad = BOXES.filter((b) => b.x0 < 60 || b.x1 > 1860 || b.y0 < chipBottom || b.y1 > 1040);
if (bad.length) throw new Error(`94-fogged-glass: words outside the safe pane area: ${JSON.stringify(bad)}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, fogVoices(S.sound), { seedBase: 311 });
export const DUCK = [];
export const NOTES = {
  mechanism: "fogplan.js: every wipe is a timed polyline (p.t drawn, p.f re-fog start); clear(t, pixel) = max over wipes of drawn x (1 - smoothstep(f, f + fade, t)); the mask canvas is redrawn from segmentsAt(t) each frame with 'lighten' compositing. Drips: s(tau) = v (tau - k/w (sin(w tau + phi) - sin phi)), x = x0 + seeded wobble table; trails are timed polylines too.",
  strokes: PLAN.strokes.length, drips: PLAN.drips.length, palm: [PLAN.palmStart, PLAN.palmEnd],
  words: BOXES,
  content: "The town behind the glass is an original, generic painting. START / MIDDLE / NOW stand for the oldest, middle and newest parts of a long chat; the fog creeping back is the context window sliding on.",
};
