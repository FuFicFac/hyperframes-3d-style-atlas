// scene.config.js — 107-magnetic-memory: "It remembers", in the "magnetic-memory" style.
// Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every flip in the picture and every click in SCORE come from the same plan (memory.js).
// The board lies flat in the XZ plane (tile tops at y = 0); the camera looks at it from +Z and above.
import { STYLE_SPEC as S } from "./_atlas/styles/magnetic-memory/spec.js";
import { planMemory, memoryVoices, hermite } from "./_atlas/styles/magnetic-memory/memory.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, pxRect } from "./_atlas/kit/framing.js";

export const ID = "107-magnetic-memory";
export const STYLE = "magnetic-memory";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;
export const TITLE = "It remembers";

// ---------------------------------------------------------------- beats (approved storyboard: times and labels as written)
export const BEATS = [
  { id: "speckle", t: 0, dur: 2.5, label: "Every tile, its own way" },
  { id: "passes", t: 2.5, dur: 3.5, label: "A magnet passes" },
  { id: "leaves", t: 6, dur: 2.5, label: "The magnet leaves" },
  { id: "stays", t: 8.5, dur: 3, label: "The pattern stays" },
  { id: "next", t: 11.5, dur: 3.5, label: "The past shapes the next" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// exactly one label at every moment: each holds from its beat start to the next beat start (hard swap, no gap)
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t, off: BEATS[i + 1] ? BEATS[i + 1].t : Infinity }));

// ---------------------------------------------------------------- the magnet's path (two passes) and the plan
const PL = S.plan, h1 = PL.h1, h2 = PL.h2;
const k = (t, x, z, h, hold) => ({ t, x, z, h, ...(hold ? { hold: true } : {}) });
const t2 = B.passes.t, t3 = B.leaves.t, t5 = B.next.t;
const Z2 = PL.z2 ?? 0.3; // pass-2 line (board z)
export const PASSES = [
  {
    // pass 1: red end down, skimming 16 cm over the tiles, an S-curve from the left edge; stops, then lifts away (beat 3)
    id: "pass1", pol: 1, from: t2 - 0.05, to: t3 + 1.4,
    keys: [
      k(t2 - 0.05, -4.1, 1.0, h1), k(t2 + 0.35, -3.1, 0.95, h1), k(t2 + 0.95, -1.9, 0.5, h1), k(t2 + 1.5, -0.8, -0.35, h1),
      k(t2 + 2.05, 0.3, -0.75, h1), k(t2 + 2.6, 1.4, -0.5, h1), k(t2 + 3.1, 2.1, 0.15, h1), k(t3 - 0.05, 2.35, 0.45, h1, true),
      k(t3 + 0.15, 2.37, 0.48, h1, true), k(t3 + 0.7, 2.8, 0.3, 1.2), k(t3 + 1.4, 3.9, 0.0, 4.0),
    ],
  },
  {
    // pass 2: turned over (silver end down, pushes tiles back to pale) and higher, so weaker: a straight run across the
    // board at z = Z2 that cuts both arms of the arch, then away off the right edge (hidden once out of frame)
    id: "pass2", pol: -1, from: t5 + 0.2, to: t5 + 2.7,
    keys: [
      k(t5 + 0.2, -3.7, Z2, h2), k(t5 + 0.8, -1.75, Z2, h2), k(t5 + 1.4, 0.2, Z2, h2), k(t5 + 2.0, 2.15, Z2, h2),
      k(t5 + 2.35, 3.4, Z2, h2 + 0.3), k(t5 + 2.7, 6.6, Z2 - 0.3, 1.8),
    ],
  },
];
export const PLAN = planMemory({
  cols: S.grid.cols, rows: S.grid.rows, pitch: S.grid.pitch, seed: PL.seed, darkShare: PL.darkShare,
  coerc: PL.coerc, settle: PL.settle, magnet: { q: PL.q, L: S.magnet.L }, dt: PL.dt,
  swing: PL.swing, tilt: PL.tilt, passes: PASSES,
});

// ---------------------------------------------------------------- camera: locked holds joined by short moves
const fov = S.camera.fov, p = S.grid.pitch;
const HX = (S.grid.cols / 2) * p, HZ = (S.grid.rows / 2) * p;       // tile area half extents
const box = (x0, z0, x1, z1, y1 = 0.02) => ({ box: [[x0, -0.02, z0], [x1, y1, z1]] });
const CELLS = box(-HX, -HZ, HX, HZ);
const CAP = pxRect(S.caption.x - S.caption.maxW / 2, S.caption.y, S.caption.maxW, S.caption.h);
const below = { y1: 0.72, y0: -0.97, x0: -0.97, x1: 0.97 };       // the frame under the caption plate
const TOP0 = fitShot(CELLS, { azimuth: 0, elevation: 1.36, fov, fill: 0.97, window: below });
const TOP1 = fitShot(CELLS, { azimuth: 0.04, elevation: 1.22, fov, fill: 1.0, window: below });
const THREE_Q = fitShot(box(-HX, -HZ, HX, HZ, 0.3), { azimuth: -0.1, elevation: 1.0, fov, fill: 1.0, window: below });
const LEAVE = fitShot(CELLS, { azimuth: -0.06, elevation: 1.06, fov, fill: 1.0, window: below });
const LOW1 = fitShot(box(-HX, -HZ, 0.4, HZ), { azimuth: -1.25, elevation: 0.3, fov, fill: 1.0, window: below });
const LOW2 = fitShot(box(-1.2, -HZ, HX, HZ), { azimuth: -1.05, elevation: 0.27, fov, fill: 1.0, window: below });
const HIGH = fitShot(CELLS, { azimuth: 0.06, elevation: 1.26, fov, fill: 1.0, window: below });
export const SHOTS = { TOP0, TOP1, THREE_Q, LEAVE, LOW1, LOW2, HIGH };
const key = (t, s, ease) => ({ t, pos: s.pos, target: s.target, fov, ...(ease ? { ease } : {}) });
// beat 4: a low fly-along over the track (the camera is the only thing moving; every tile is still). Each fly key sits
// above the pass-1 path (sampled at a pass-1 time u), nudged to the near side, looking at the path `ahead` s further on.
const FLY = S.fly ?? { height: 1.3, side: 0.35, ahead: 0.75, fov: 40 };
const P1 = PASSES[0].keys;
const pathAt = (u) => [hermite(P1, u, "x"), hermite(P1, u, "z")];
const fly = (t, u, ease) => {
  const [x, z] = pathAt(u), [tx, tz] = pathAt(u + FLY.ahead);
  return { t, pos: [+x.toFixed(4), FLY.height, +(z + FLY.side).toFixed(4)], target: [+tx.toFixed(4), 0, +tz.toFixed(4)], fov: FLY.fov, ease };
};
export const CAMERA = [
  key(0, TOP0),
  key(t2 - 0.1, TOP1, "inOutSine"),
  key(t2 + 0.8, THREE_Q, "inOutSine"),
  key(t3, THREE_Q),
  key(B.stays.t - 0.1, LEAVE, "inOutSine"),
  fly(B.stays.t + 1.15, t2 + 0.15, "inOutCubic"),
  fly(B.stays.t + 2.05, t2 + 0.85, "inSine"),
  fly(t5 - 0.05, t2 + 1.55, "outSine"),
  key(t5 + 0.75, HIGH, "inOutCubic"),
  key(DURATION, HIGH),
];
// framing gate: the whole tile area in the top-down and three-quarter holds and the final wide
export const FRAMING = framingReport(
  (t) => [
    ...((t <= t2 - 0.1) || (t >= t2 + 0.8 && t <= t3) || t >= t5 + 0.75 ? [{ id: "cells", ...CELLS }] : []),
  ],
  CAMERA, { duration: DURATION, drift: S.camera.drift, fov, safe: 0.98, keepOut: [{ id: "caption", ...CAP }] },
);
if (!FRAMING.ok && !globalThis.process?.env?.MM_NOGATE) throw new Error(`107-magnetic-memory framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's flip clicks + bed + magnet whooshes
export const EVENTS = PLAN.events({ binHz: 30 });
const SND = S.sound;
export const SCORE = [
  ...scoreFromEvents(EVENTS, memoryVoices(SND), { seedBase: 307 }),
  { t: 0, type: "pad", root: SND.bed.root, chord: SND.bed.chord, dur: DURATION, attack: 0.6, release: 1.2, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 3 },
  { t: t2 - 0.2, type: "whoosh", dir: "in", dur: 0.9, gain: SND.whoosh.gain, seed: 5 },
  { t: t3 + 0.2, type: "whoosh", dir: "out", dur: 1.0, gain: SND.whoosh.gain, seed: 7 },
  { t: B.stays.t, type: "whoosh", dir: "in", dur: 1.4, gain: SND.whoosh.gain * 0.5, seed: 9 },
  { t: t5 + 0.1, type: "whoosh", dir: "in", dur: 0.9, gain: SND.whoosh.gain * 0.8, seed: 11 },
  { t: t5 + 2.25, type: "whoosh", dir: "out", dur: 0.9, gain: SND.whoosh.gain * 0.8, seed: 13 },
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  title: TITLE,
  mechanism: "memory.js: 56 x 30 latching tiles, seeded initial states (33 % dark) and log-normal thresholds. The magnet is a two-pole vertical bar whose pose is a cubic-Hermite curve in t; a tile flips at the first time the push against its current face beats its threshold (found once at load by sampling the path every 1/240 s). Pass 1 red end down at 16 cm traces an arch; pass 2 turned over (silver end down) and 46 cm up runs straight across the board and cuts a narrower pale lane through both arms of the arch, flipping back only tiles whose threshold its weaker pull beats.",
  plan: PLAN.stats,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s)` : "FAILS",
  captionRect: CAP,
  sound: "one click per 1/30 s bin of flips (gain ~ sqrt(count)), quiet ticks for the beat-1 settle, sparser lower clicks on pass 2; soft pad bed; whooshes as the magnet arrives and leaves.",
};
