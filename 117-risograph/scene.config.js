// scene.config.js — 117-risograph: "Three inks, one picture". A sun over sea and mountains with one bird, printed one ink
// at a time by a rolling drum: pink, then blue, then yellow lands off-register, the layers snap into line, and a macro
// on the halftone shows three inks making every colour. Plain data + the style's pure planner (riso.js); no THREE, no
// window. Imported by scene.js (browser) and by render-sfx / export-spec (Node). Every SCORE cue comes from the plan.
import { STYLE_SPEC as S } from "./_atlas/styles/risograph/spec.js";
import { planRiso, risoVoices, sheetToWorld, POSTER } from "./_atlas/styles/risograph/riso.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, pxRect } from "./_atlas/kit/framing.js";

export const ID = "117-risograph";
export const STYLE = "risograph";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard, labels word for word)
export const BEATS = [
  { id: "pink", t: 0, dur: 3, label: "First ink: pink shapes" },
  { id: "blue", t: 3, dur: 3, label: "Second ink: blue on top" },
  { id: "yellow", t: 6, dur: 3, label: "Third ink: out of line" },
  { id: "snap", t: 9, dur: 3, label: "Line them up: it snaps" },
  { id: "macro", t: 12, dur: 3, label: "Three inks made them all" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const ROLL = S.caption.roll;
/** one label at a time: label i owns [t_i, t_{i+1}); the next one rolls in over ROLL s from its beat start */
export const LABELS = BEATS.map((b) => ({ text: b.label, on: b.t }));

// ---------------------------------------------------------------- the plan (drum passes, registration, nudges, snap)
export const TIMING = {
  passes: [
    { ink: 0, t0: B.pink.t + 0.24, t1: B.pink.t + 2.5, dir: +1, x0: -1.45 }, // starts on the sheet's left margin, in shot
    { ink: 1, t0: B.blue.t + 0.15, t1: B.blue.t + 2.5, dir: -1 },
    { ink: 2, t0: B.yellow.t + 0.12, t1: B.yellow.t + 1.9, dir: +1 },
  ],
  reink: [
    { from: 0, to: 1, t0: B.pink.t + 2.55, t1: B.blue.t + 0.1 },
    { from: 1, to: 2, t0: B.blue.t + 2.55, t1: B.yellow.t + 0.08 },
  ],
  drop: { t0: B.pink.t, t1: B.pink.t + 0.24, h: 0.3 },  // the drum falls onto the sheet at t = 0 (thud at 0.24)
  lift: { t0: B.yellow.t + 2.3, t1: B.snap.t + 0.1, h: 3.2 },
  // registration error each layer lands with: [dx, dy, rotation] (sheet metres, rad). Yellow ~1.5 % of the sheet width.
  reg: [[0, 0, 0], [-0.012, 0.008, 0.0016], [0.048, -0.02, -0.0085]],
  shift: B.snap.t + 0.05,
  // two small nudges that don't fix it, then one decisive sprung snap (the wow)
  nudges: [{ t: B.snap.t + 0.85, dur: 0.2, k: 0.82 }, { t: B.snap.t + 1.25, dur: 0.2, k: 0.64 }],
  snap: { t: B.snap.t + 1.7, stiffness: 520, damping: 19 },
};
export const PLAN = planRiso(S, TIMING);

// ---------------------------------------------------------------- camera: fitted shots on the tilted sheet
const fov = S.camera.fov;
const W = S.sheet.width, H = S.sheet.height;
const region = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => sheetToWorld(S, x, y, 0.005));
const SHEET = region(-W / 2, -H / 2, W / 2, H / 2);
const AREA = region(...POSTER.area);
const BIRD = region(-0.3, 0.12, 0.6, 0.66);           // bird + the sun's upper-left edge + sky bands
const MID = region(-1.12, -0.5, 1.16, 0.78);           // sun, bird, both ranges, top of the sea
const MACRO = region(0.83, -0.155, 1.17, 0.045);       // far range: three mid-tone inks + the ridge + sea lines
const CAP = pxRect(S.caption.x - S.caption.w / 2, S.caption.y - S.caption.h - 14, S.caption.w, S.caption.h + 22);
const ABOVE_CAP = { y0: CAP.y1 + 0.02, y1: 0.95, x0: -0.95, x1: 0.95 };
const WIDE = fitShot(SHEET, { azimuth: 0, elevation: 1.16, fov, fill: 1, window: { x0: -1.07, x1: 1.07, y0: -1.075, y1: 1.075 } });
const CLOSE = fitShot(BIRD, { azimuth: 0, elevation: 1.22, fov, fill: 0.98, window: ABOVE_CAP });
const MEDIUM = fitShot(MID, { azimuth: 0, elevation: 1.18, fov, fill: 1, window: { x0: -0.98, x1: 0.98, y0: -0.98, y1: 0.98 } });
const MAC = fitShot(MACRO, { azimuth: 0, elevation: 1.28, fov, fill: 0.98, window: ABOVE_CAP });
const key = (t, s, ease) => ({ t, pos: s.pos, target: s.target, fov, ...(ease ? { ease } : {}) });
export const SHOTS = { WIDE, CLOSE, MEDIUM, MAC };
export const CAMERA = [
  key(0, WIDE),
  key(B.yellow.t + 0.9, WIDE),
  key(B.yellow.t + 2.2, CLOSE, "inOutCubic"),
  key(B.snap.t, CLOSE),
  key(B.snap.t + 0.75, MEDIUM, "inOutSine"),
  key(B.macro.t - 0.15, MEDIUM),
  key(B.macro.t + 0.5, MAC, "inOutCubic"),
  key(B.macro.t + 1.25, MAC),
  key(B.macro.t + 2.45, WIDE, "inOutCubic"),
  key(DURATION, WIDE),
];

// framing gate: the bird close-up and the macro sit above the caption; the final wide holds the whole picture area
export const FRAMING = framingReport(
  (t) => [
    ...(t >= CAMERA[2].t && t <= CAMERA[3].t ? [{ id: "bird", pts: BIRD, window: ABOVE_CAP }] : []),
    ...(t >= CAMERA[6].t && t <= CAMERA[7].t ? [{ id: "macro", pts: MACRO, window: ABOVE_CAP }] : []),
    ...(t >= CAMERA[8].t || t <= CAMERA[1].t ? [{ id: "area", pts: AREA, window: { x0: -0.99, x1: 0.99, y0: -0.99, y1: 0.99 } }] : []),
  ],
  CAMERA, { duration: DURATION, fov, drift: S.camera.drift },
);
if (!FRAMING.ok && !globalThis.process?.env?.RISO_NOGATE) throw new Error(`117-risograph framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: plan events + camera whooshes + a bed
export const EVENTS = PLAN.events();
const SND = S.sound;
const moves = [[1, 2, "in", 0.2], [3, 4, "out", 0.16], [5, 6, "in", 0.22], [7, 8, "out", 0.2]];
export const SCORE = [
  ...scoreFromEvents(EVENTS, risoVoices(S), { seedBase: 117 }),
  { t: 0, type: "pad", root: SND.bed.root, chord: SND.bed.chord, dur: DURATION, attack: 0.5, release: 1.6, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 3 },
  ...moves.map(([a, b, dir, gain], j) => ({ t: CAMERA[a].t, type: "whoosh", dir, dur: CAMERA[b].t - CAMERA[a].t, gain, seed: 5 + 2 * j })),
].sort((a, b) => a.t - b.t);
export const DUCK = [];

export const NOTES = {
  mechanism: "riso.js: POSTER (analytic shapes, tone per ink) -> posterGLSL (same numbers, anti-aliased) -> per pixel and per ink: registration transform, tone, cosine-spot threshold screen at the ink's angle, rough dot edge, tooth skip, mottle, reveal behind the drum line, multiply overprint.",
  meanTone: PLAN.stats(),
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s)` : "FAILS",
  fingerprint: PLAN.fingerprint(),
  shots: { WIDE: WIDE.dist, CLOSE: CLOSE.dist, MEDIUM: MEDIUM.dist, MACRO: MAC.dist },
  sound: "per pass: thud + paper slide + drum whir pitched to the ink (A3 / C#4 / E4); pluck at each re-ink; paper slide, two clacks and a click at the snap; marimba chord of the three ink pitches; a whoosh per camera move; low pad bed.",
};
