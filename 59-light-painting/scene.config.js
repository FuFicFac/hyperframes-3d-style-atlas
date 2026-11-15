// scene.config.js — 59-light-painting: "Made of time, not matter" (style "light-painting").
// Plain data + the style's pure stroke planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every tick and shimmer in SCORE comes from the same plan the trails read; the shutter cues come
// from BEATS. World: x right, y up, z toward the viewer; the word hangs at z ≈ 0, the ring wraps through depth.
import { STYLE_SPEC as S } from "./_atlas/styles/light-painting/spec.js";
import { createDrawing, strokeVoices } from "./_atlas/styles/light-painting/strokes.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, pxRect } from "./_atlas/kit/framing.js";

export const ID = "59-light-painting";
export const STYLE = "light-painting";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "open", t: 0, dur: 2.6, label: "Open the shutter" },
  { id: "draw", t: 2.6, dur: 4.8, label: "Draw with a moving light" },
  { id: "remember", t: 7.4, dur: 4.3, label: "The camera remembers" },
  { id: "develop", t: 11.7, dur: 3.3, label: "Made of time, not matter" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.45), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));
/** shutter: opens just after the start, closes 0.3 s into the last beat */
export const SHUTTER = { open: B.open.t + 0.3, close: B.develop.t + 0.3 };

// ---------------------------------------------------------------- the drawing (moves -> strokes)
const C = S.palette;
export const MOVES = [
  // the light appears at the top of the L and sits there (a bright blob), then the word is written letter by letter
  { id: "word", kind: "text", text: "LIGHT", cap: 1.3, at: [0, 1.62, 0], letterZ: [0.12, -0.2, 0.05, 0.25, -0.12], color: C.amber,
    t0: B.open.t + 1.0, t1: B.draw.t + 4.5, dwell: 1.45 },
  // a cyan loop that wraps around the word through depth (in front at the bottom, behind at the top)
  { id: "ring", group: "second", kind: "icon", icon: "ring", at: [0, 1.58, 0], size: 7, opts: { turns: 1.08, rx: 0.5, ry: 0.17, rz: 0.22, grow: 0.05 }, wobble: 4,
    color: C.cyan, t0: B.remember.t + 0.05, t1: B.remember.t + 1.65 },
  { id: "star", group: "second", kind: "icon", icon: "star", at: [-2.95, 2.95, -1.0], size: 0.95, roll: 0.12, color: C.cyan,
    t0: B.remember.t + 1.75, t1: B.remember.t + 2.6 },
  { id: "bulb", kind: "icon", icon: "bulb", at: [3.0, 2.8, 0.8], size: 1.25, yaw: -0.25, color: C.magenta,
    t0: B.remember.t + 2.7, t1: B.remember.t + 4.2 },
];
export const PLAN = createDrawing(MOVES, S.hand, { seed: 59 });
export const SPILL_GROUPS = [{ id: "word", color: C.amber }, { id: "second", color: C.cyan }, { id: "bulb", color: C.magenta }];

// ---------------------------------------------------------------- camera: a tripod, then one arc to show the depth
const T0 = [0.1, 1.6, 0];
const orbit = (deg, r, y) => [T0[0] + r * Math.sin((deg * Math.PI) / 180), y, T0[2] + r * Math.cos((deg * Math.PI) / 180)];
export const CAMERA = [
  { t: 0, pos: orbit(6, 9.4, 2.3), target: T0, fov: 35 },
  { t: B.remember.t - 0.05, pos: orbit(6, 9.4, 2.3), target: T0, fov: 35 },
  { t: B.remember.t + 2.9, pos: orbit(38, 9.6, 2.6), target: T0, fov: 35, path: "arc", ease: "inOutSine" },
  { t: B.develop.t - 0.1, pos: orbit(15, 9.3, 2.4), target: T0, fov: 35, path: "arc", ease: "inOutSine" },
  { t: DURATION, pos: orbit(15, 9.3, 2.4), target: T0, fov: 35 },
];

// ---------------------------------------------------------------- framing gate
// Required: everything drawn so far stays inside the safe area and clear of the caption chip (top-left) and the
// exposure chip (top-right) — in every frame, including the middle of the arc.
const CAP = S.caption, IND = S.indicator;
export const KEEP_OUT = [
  { id: "caption", ...pxRect(CAP.x, CAP.y, 640, CAP.h) },
  { id: "indicator", ...pxRect(IND.x - 470, IND.y, 470, IND.h) },
];
function regions(t) {
  const out = []; // one box per move (a single box round everything would claim the empty corners)
  for (const m of MOVES) { const b = PLAN.box(t, [m.id]); if (b) out.push({ id: m.id, box: b }); }
  return out;
}
export const FRAMING = framingReport(regions, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, safe: 0.9, keepOut: KEEP_OUT });
const FINAL = PLAN.box(Infinity);
if (!FRAMING.ok && !globalThis.process?.env?.LP_NOGATE) {
  throw new Error(`59-light-painting framing: ${JSON.stringify({ spans: FRAMING.spans.slice(0, 6), worst: FRAMING.worst })}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: plan events + shutter + bed
export const EVENTS = PLAN.events({ chunk: 0.1 });
const SND = S.sound;
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: SND.bed.gain, root: SND.bed.root, chord: [0, 7, 12, 16], attack: 2.5, release: 2.0, brightness: SND.bed.brightness },
  // shutter open: a mechanical clunk
  { t: SHUTTER.open, type: "clack", gain: SND.shutter.gain, pitch: SND.shutter.pitch, seed: 3 },
  { t: SHUTTER.open + 0.01, type: "thud", gain: SND.shutter.thud, pitch: 1.6, seed: 4 },
  ...scoreFromEvents(EVENTS, strokeVoices(SND), { seedBase: 101, pan: (e) => Math.max(-0.5, Math.min(0.5, (PLAN.strokes[e.stroke]?.pts[0][0] ?? 0) / 8)) }),
  // shutter close: clunk; the print develops with a soft chime
  { t: SHUTTER.close, type: "clack", gain: SND.shutter.gain, pitch: SND.shutter.pitch * 0.9, seed: 5 },
  { t: SHUTTER.close + 0.01, type: "thud", gain: SND.shutter.thud, pitch: 1.4, seed: 6 },
  { t: SHUTTER.close + S.shutter.closeDur + S.shutter.hold, type: "chime", gain: SND.develop.gain, dur: 2.2, notes: 4, seed: 7 },
];
export const DUCK = [];
export const NOTES = {
  mechanism: "strokes.js bakes every stroke into samples with an absolute time T (speed profile: slow at starts/ends/turns), brightness B and width W from pen speed; the trail shader shows T <= t. Pen = plan.penAt(t). Ghost = painterAt (lagged pen average).",
  strokes: PLAN.strokes.length,
  samples: PLAN.samples,
  drawingEnds: +PLAN.end.toFixed(3),
  finalBox: FINAL,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s)` : "FAILS",
};
