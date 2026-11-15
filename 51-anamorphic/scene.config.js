// scene.config.js — 51-anamorphic: "One angle. One message." (style "anamorphic").
// Plain data + the style's pure anamorph planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The piece positions, the lock windows, the sway gate and every converge / snap / tear sound come
// from ONE plan: two figure plans (pieces along eye rays) + the camera keys, replayed through the rig maths.
import { STYLE_SPEC as S } from "./_atlas/styles/anamorphic/spec.js";
import { planFigure, errorTrack, alignEvents, lockWindows, alignVoices } from "./_atlas/styles/anamorphic/anamorph.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport } from "./_atlas/kit/framing.js";

export const ID = "51-anamorphic";
export const STYLE = "anamorphic";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "clutter", t: 0, dur: 3.4, label: "Just scattered pieces" },
  { id: "seek", t: 3.4, dur: 2.6, label: "Find the one angle" },
  { id: "lockA", t: 6.0, dur: 3.2, label: "One angle. One message." },
  { id: "tear", t: 9.2, dur: 2.4, label: "Step aside: it's gone" },
  { id: "lockB", t: 11.6, dur: 3.4, label: "New angle, new shape" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.3), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the two figures (sweet spots + pieces)
const FOV = S.camera.fov;
const common = {
  fov: FOV, room: S.room, ceiling: S.room.max[1], radius: S.pieces.radius, chunk: S.pieces.chunk, step: S.pieces.step,
  depth: S.pieces.depth, minDist: S.pieces.minDist, wallGap: S.pieces.wallGap, tones: 3,
};
// The figure B image (as seen from its sweet spot) does not depend on B's piece depths, so: plan B once for its image,
// plan A so no A piece covers B's strokes from B's eye, then plan B so no B piece covers A's strokes from A's eye.
const SPEC_A = {
  ...common, id: "A", eye: [0, 2.6, 10.6], target: [0, 2.75, 0], d0: 8.5,
  figure: { kind: "text", text: "HELLO", letterSpacing: 0.32 }, fill: 0.84, align: [0, 0.1], seed: 51,
};
const SPEC_B = {
  ...common, id: "B", eye: [7.4, 2.3, 6.4], target: [-1.6, 2.9, -1.4], d0: 8.0,
  figure: { kind: "star", points: 5, inner: 0.46 }, fill: 0.7, align: [0, 0.16], seed: 52, chunk: S.pieces.chunk * 1.1,
};
const A0 = planFigure(SPEC_A);
SPEC_B.radiusAbs = A0.r0 * 1.15;
const B0 = planFigure(SPEC_B);
export const FIG_A = planFigure({ ...SPEC_A, avoid: [B0] });
export const FIG_B = planFigure({ ...SPEC_B, avoid: [FIG_A] });
export const FIGS = [FIG_A, FIG_B];

// ---------------------------------------------------------------- camera: wide off-axis -> lock A -> tear -> lock B
const lockAKey = (t) => ({ t, pos: FIG_A.sweet.pos, target: FIG_A.sweet.target, fov: FOV });
const lockBKey = (t) => ({ t, pos: FIG_B.sweet.pos, target: FIG_B.sweet.target, fov: FOV });
export const CAMERA = [
  { t: 0, pos: [-7.2, 4.9, 11.9], target: [0.6, 2.3, 0.2], fov: FOV },
  { t: B.seek.t, pos: [-6.0, 4.4, 12.1], target: [0.4, 2.4, 0.4], fov: FOV, ease: "inOutSine" },
  { ...lockAKey(B.lockA.t), ease: "outCubic" },                  // decelerate INTO the exact sweet spot
  lockAKey(B.tear.t),                                              // perfectly still hold
  { t: B.tear.t + 1.2, pos: [3.6, 3.1, 11.0], target: [0.4, 2.6, 0.4], fov: FOV, ease: "inOutSine" },   // step aside: it tears
  { t: B.lockB.t, pos: [6.4, 3.0, 9.6], target: [0.2, 2.6, 0.4], fov: FOV, ease: "linear" },
  { ...lockBKey(B.lockB.t + 1.1), ease: "outCubic" },
  lockBKey(DURATION),
];

// ---------------------------------------------------------------- the error curve -> lock windows + sound events
export const TRACK = errorTrack(FIGS, CAMERA, { duration: DURATION, dt: 1 / 120, fov: FOV, drift: S.camera.drift });
export const EVENTS = [...alignEvents(TRACK, "A"), ...alignEvents(TRACK, "B")].sort((a, b) => a.t - b.t);
export const LOCKS = lockWindows(EVENTS);
const lockOf = (id) => LOCKS.find((w) => w.fig === id);
if (!lockOf("A") || !lockOf("B")) throw new Error(`51-anamorphic: a figure never locks ${JSON.stringify(LOCKS)}`);

// ---------------------------------------------------------------- framing gate
// While a figure is locked its whole image-plane box must sit inside the frame and above the caption band
// (caption chip centred at y = 948 px -> NDC y < -0.68 is the band).
export const WINDOW = { x0: -0.9, x1: 0.9, y0: -0.64, y1: 0.9 };
const regions = FIGS.map((f) => ({ id: f.id, pts: f.box, from: lockOf(f.id).on, to: Math.min(lockOf(f.id).off, DURATION) }));
export const FRAMING = framingReport(regions, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, safe: 0.9, window: WINDOW });
if (!FRAMING.ok && !globalThis.process?.env?.ANAMORPH_NOGATE) {
  throw new Error(`51-anamorphic framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: plan events + camera-move whooshes + a bed
const moves = CAMERA.slice(1).map((k, i) => ({ t0: CAMERA[i].t, t1: k.t })).filter((m, i) => {
  const a = CAMERA[i], b = CAMERA[i + 1];
  return Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]) > 0.5;
});
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 7, 12, 16], attack: 1.6, release: 2.0, brightness: S.sound.bed.brightness },
  ...moves.map((m, i) => ({ t: m.t0, type: "whoosh", dir: "in", dur: Math.max(0.6, m.t1 - m.t0), gain: S.sound.whoosh.gain, pan: i % 2 ? 0.25 : -0.25, seed: 300 + i * 13 })),
  ...scoreFromEvents(EVENTS, alignVoices(S.sound), { seedBase: 101, pan: (e) => (e.fig === "A" ? -0.1 : 0.15) }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "anamorph.js: each piece = one chunk of the figure's polylines on an image plane at d0 in front of the sweet spot, moved along its own eye ray by a seeded depth factor s (X = E + s(P - E), radius x s): exact from E, torn by parallax elsewhere.",
  pieces: { A: FIG_A.pieces.length, B: FIG_B.pieces.length },
  locks: LOCKS,
  events: EVENTS.map((e) => `${e.kind}:${e.fig}@${e.t.toFixed(3)}`),
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s, ${FRAMING.worst.id})` : "FAILS",
};
