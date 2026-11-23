// scene.config.js — 98-loom-weave: "the first program was a pattern of holes". Plain data + the style's pure pick planner.
// No THREE, no window: imported by scene.js (browser) and by render-sfx / export-spec (Node). Every clack, swish, thump
// and tick in SCORE comes from the same pick plan the picture reads (draft.js).
// World: warp runs along Z (fell at z = -0.9, weaver / cloth beam toward +z), x = across the loom, card band to the right.
import { STYLE_SPEC as S } from "./_atlas/styles/loom-weave/spec.js";
import { robotMotif, buildDraft, planPicks, loomVoices } from "./_atlas/styles/loom-weave/draft.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, pxRect } from "./_atlas/kit/framing.js";

export const ID = "98-loom-weave";
export const STYLE = "loom-weave";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (one label each)
export const BEATS = [
  { id: "warp", t: 0, dur: 3.0, label: "Threads, but no picture" },
  { id: "rows", t: 3.0, dur: 3.0, label: "Each pass weaves one row" },
  { id: "card", t: 6.0, dur: 3.0, label: "Holes choose what lifts" },
  { id: "picture", t: 9.0, dur: 3.2, label: "Row by row, a picture" },
  { id: "program", t: 12.2, dur: 2.8, label: "A pattern of holes: a program" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.12 : 0.15), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.35 : Infinity }));

// ---------------------------------------------------------------- the draft + pick plan (the one schedule)
export const DRAFT = buildDraft(robotMotif(), { border: 3, borderWefts: S.wefts.border, motifWeft: S.wefts.motif });
export const PLAN = planPicks(DRAFT, { t0: 0.25, tEnd: 11.9, dFirst: 1.2, dMin: 0.2, close: 0.5 });

// ---------------------------------------------------------------- camera: five locked shots joined by short eased moves
const L = S.loom, fov = S.camera.fov;
const zFront = L.zFell + (DRAFT.N + L.lead) * L.pick;
const bx = (x0, x1, y0, y1, z0, z1) => ({ box: [[x0, y0, z0], [x1, y1, z1]] });
const capWin = { y1: 0.76, y0: -0.96, x0: -0.96, x1: 0.96 }; // keep the subject below the caption tape
const OPEN = fitShot(bx(-2.0, -0.3, L.y - 0.1, L.y + 0.42, L.zHeddle - 0.1, L.zFell + 0.45), { azimuth: -0.22, elevation: 0.5, fov, fill: 1.0, window: capWin });
const LOOM = fitShot(bx(-2.6, 0.42, 0.1, L.y + 0.3, L.zHeddle - 0.1, L.zFell + 0.85), { azimuth: 0, elevation: 0.62, fov, fill: 1.0, window: capWin });
const CARD = fitShot(bx(-0.75, 2.5, L.y, L.y + 0.13, L.zFell - 0.3, L.zFell + 0.85), { azimuth: 0.0, elevation: 1.0, fov, fill: 1.0, window: capWin });
const CLOTH = fitShot(bx(-2.15, -0.05, L.y, L.y + 0.05, L.zFell - 0.3, zFront - 0.12), { azimuth: 0, elevation: 1.0, fov, fill: 0.98, window: capWin });
const WIDE = fitShot(bx(-2.2, 2.45, L.y, L.y + 0.02, L.zFell - 0.32, zFront + 0.02), { azimuth: 0, elevation: 1.12, fov, fill: 0.99, window: capWin });
const key = (t, s, ease) => ({ t, pos: s.pos, target: s.target, fov, ...(ease ? { ease } : {}) });
export const CAMERA = [
  key(0, OPEN), key(2.9, OPEN),
  key(4.0, LOOM, "inOutSine"), key(5.7, LOOM),
  key(6.9, CARD, "inOutSine"), key(8.6, CARD),
  key(9.6, CLOTH, "inOutSine"), key(12.0, CLOTH),
  key(13.1, WIDE, "inOutSine"), key(DURATION, WIDE),
];
// the card holes glow up once the camera settles on the final wide (the "same picture, as holes" moment)
export const BOOST = { on: 12.6, dur: 0.9 };
export const SHOTS = { OPEN, LOOM, CARD, CLOTH, WIDE };

// framing gate: the finished cloth + card stay inside the frame (below the caption) through the final hold
export const CAPTION_RECT = pxRect(S.caption.x - S.caption.maxW / 2, S.caption.y, S.caption.maxW, S.caption.h);
export const FRAMING = framingReport(
  (t) => (t >= 13.1 ? [{ id: "cloth+card", box: WIDE ? [[-2.15, L.y, L.zFell - 0.05], [2.4, L.y, zFront - 0.05]] : null }] : []),
  CAMERA, { duration: DURATION, drift: S.camera.drift, fov, window: { y1: 0.8, y0: -0.97, x0: -0.97, x1: 0.97 } },
);
if (!FRAMING.ok && !globalThis.process?.env?.LOOM_NOGATE) throw new Error(`98-loom-weave framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a bed + one soft whoosh per move
export const EVENTS = PLAN.events();
const SND = S.sound;
const moves = [[2.9, 4.0], [5.7, 6.9], [8.6, 9.6], [12.0, 13.1]];
export const SCORE = [
  ...scoreFromEvents(EVENTS, loomVoices(SND), { seedBase: 198 }),
  { t: 0, type: "pad", root: SND.bed.root, chord: SND.bed.chord, dur: DURATION, attack: 0.8, release: 1.6, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 3 },
  ...moves.map(([a, b], i) => ({ t: a, type: "whoosh", dir: "in", dur: b - a, gain: 0.12, seed: 31 + i })),
  { t: B.program.t + 0.3, type: "chime", dur: 1.8, gain: 0.16, notes: 5, seed: 41 },
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "draft.js: robot bitmap (40 x 30) + plain-weave borders -> lift table (= the punch card) + weft colour per row; picks speed up exponentially (tau solved so the last pick ends at tEnd); per pick: shed -> throw -> beat -> advance, all closed-form in t.",
  picks: PLAN.picks.length,
  tau: +PLAN.tau.toFixed(3),
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s)` : "FAILS",
  captionRect: CAPTION_RECT,
  sound: "clack per shed change (gain ~ lifted share), whoosh per shuttle throw panned by direction, click when it lands, thud per reed beat, tick per card advance; softer as picks speed up; warm pad bed; one soft whoosh per camera move; chime on the final line.",
};
