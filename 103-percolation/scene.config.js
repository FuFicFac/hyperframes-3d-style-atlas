// scene.config.js — 103-percolation: "One link away", in the "percolation" style.
// Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every valve click, gurgle, the deciding clack and the trough chime in SCORE come from the same plan
// the picture reads. The board stands in the XY plane (front face z = 0), the camera looks at it from +Z.
import { STYLE_SPEC as S } from "./_atlas/styles/percolation/spec.js";
import { planPercolation, percolationVoices } from "./_atlas/styles/percolation/percolate.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, pxRect } from "./_atlas/kit/framing.js";

export const ID = "103-percolation";
export const STYLE = "percolation";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (approved storyboard: times and labels as written)
export const BEATS = [
  { id: "random", t: 0, dur: 2.5, label: "Links open at random" },
  { id: "clusters", t: 2.5, dur: 3, label: "Clusters grow, still apart" },
  { id: "close", t: 5.5, dur: 3, label: "So close. Still no path." },
  { id: "one", t: 8.5, dur: 2.5, label: "One more link" },
  { id: "runs", t: 11, dur: 4, label: "Now it runs end to end" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const end = (id) => B[id].t + B[id].dur;
// exactly one label at every moment: each holds from its beat start to the next beat start (hard swap, no gap)
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t, off: BEATS[i + 1] ? BEATS[i + 1].t : Infinity }));

// ---------------------------------------------------------------- the plan (the one schedule)
const PL = S.plan;
export const PLAN = planPercolation({
  W: S.grid.W, H: S.grid.H, seed: PL.seed, tints: PL.tints, turn: PL.turn,
  // the pre-spanning valves open across beats 1-3 (a quick burst in the first second so something happens at once;
  // 20 % by the end of beat 1, 58 % by the end of beat 2, all by 7.1 s)
  open: { knots: [[0, 0.08], [0.08, 0.9], [0.2, end("random") - 0.1], [0.58, end("clusters") - 0.1], [1, B.close.t + 1.6]] },
  // the deciding valve turns alone in beat 4; water crosses it before beat 5 and races to the bottom trough
  decide: { at: B.one.t + 1.05, turn: PL.decide.turn, dt: PL.decide.dt },
  flow: { dt: PL.flow.dt, reachB: B.runs.t + 1.4 },
  accept: (a) => a.frac >= 0.55 && a.upHops >= 3 && a.downHops >= 6 && a.star.kind === "v",
});

// ---------------------------------------------------------------- camera: locked holds joined by short moves
const fov = S.camera.fov, p = S.grid.pitch;
const EX = ((S.grid.W - 1) / 2) * p + S.trough.extra;          // network half width (troughs included)
const EY = ((S.grid.H - 1) / 2 + 1) * p + S.trough.h;          // network half height (troughs included)
const box = (x0, y0, x1, y1, z1 = 0.26) => ({ box: [[x0, y0, 0], [x1, y1, z1]] });
const NET = box(-EX, -EY, EX, EY);
const CAP = pxRect(S.caption.x - S.caption.maxW / 2, S.caption.y, S.caption.maxW, S.caption.h);
const below = { y1: 0.70, y0: -0.97, x0: -0.97, x1: 0.97 };     // the frame under the caption plate
const st = PLAN.star;
const SX = st.ax * p * 0.5 + st.bx * p * 0.5, SY = st.ay * p * 0.5 + st.by * p * 0.5; // deciding valve (world)
export const STAR = [SX, SY];
const OPEN = fitShot(box(-EX, 0.2, 1.2, EY), { azimuth: -0.32, elevation: 0.2, fov, fill: 1.0, window: below });
const MID = fitShot(box(-EX, -1.0, EX - 1.2, EY), { azimuth: -0.16, elevation: 0.12, fov, fill: 1.0, window: below });
const WIDE = fitShot(NET, { azimuth: 0.06, elevation: 0.05, fov, fill: 1.0, window: below });
const CLOSE = fitShot(box(SX - 1.0, SY - 0.62, SX + 1.0, SY + 0.62), { azimuth: -0.3, elevation: 0.22, fov, fill: 1.0, window: below });
const FINAL = fitShot(NET, { azimuth: 0.08, elevation: 0.07, fov, fill: 1.0, window: below });
export const SHOTS = { OPEN, MID, WIDE, CLOSE, FINAL };
const key = (t, s, ease) => ({ t, pos: s.pos, target: s.target, fov, ...(ease ? { ease } : {}) });
export const CAMERA = [
  key(0, OPEN),
  key(B.clusters.t - 0.2, OPEN),
  key(B.clusters.t + 1.3, MID, "inOutSine"),
  key(B.close.t - 0.2, MID),
  key(B.close.t + 1.0, WIDE, "inOutSine"),
  key(B.one.t, WIDE),
  key(B.one.t + 0.9, CLOSE, "inOutCubic"),
  key(B.runs.t, CLOSE),
  key(B.runs.t + 2.0, FINAL, "inOutSine"),
  key(DURATION, FINAL),
];
// framing gate: the whole network in the wide holds and the final; the deciding valve region in the close-up
export const FRAMING = framingReport(
  (t) => [
    ...((t >= B.close.t + 1.0 && t <= B.one.t) || t >= B.runs.t + 2.0 ? [{ id: "network", ...NET }] : []),
    ...(t >= B.one.t + 0.9 && t <= B.runs.t ? [{ id: "deciding", ...box(SX - 0.5, SY - 0.4, SX + 0.5, SY + 0.4) }] : []),
  ],
  CAMERA, { duration: DURATION, drift: S.camera.drift, fov, safe: 0.98, keepOut: [{ id: "caption", ...CAP }] },
);
if (!FRAMING.ok && !globalThis.process?.env?.PERC_NOGATE) throw new Error(`103-percolation framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

// magenta highlight on the deciding link (ring, lever, band) from beat 4 to the end
export const RING = { on: B.one.t + 0.3, off: Infinity, inDur: 0.4, outDur: 0.6 }; // stays on: the final wide shows which link did it

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + bed + rush
export const EVENTS = PLAN.events({ binHz: 20 });
const SND = S.sound;
const tDecide = PLAN.tOpen[PLAN.starId];
export const SCORE = [
  ...scoreFromEvents(EVENTS, percolationVoices(SND), { seedBase: 203 }),
  // bed through beats 1-3, released before beat 4: the held breath
  { t: 0, type: "pad", root: SND.bed.root, chord: SND.bed.chord, dur: B.one.t - 0.3, attack: 0.5, release: 0.6, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 3 },
  // the rush: a riser that lands as water reaches the bottom trough, a long whoosh over the pull-back, a brighter bed
  { t: PLAN.tJoin - 0.2, type: "riser", dur: PLAN.tB - PLAN.tJoin + 0.2, gain: SND.rush.gain, seed: 5 },
  { t: B.runs.t, type: "whoosh", dir: "out", dur: 2.0, gain: 0.3, seed: 7 },
  { t: tDecide + 0.6, type: "pad", root: SND.bed.root, chord: [0, 7, 12, 16, 19], dur: DURATION - tDecide - 0.6, attack: 1.2, release: 1.2, brightness: 1400, gain: SND.bed.gain * 0.9, seed: 9 },
  { t: B.clusters.t - 0.2, type: "whoosh", dir: "in", dur: 1.5, gain: 0.12, seed: 11 },
  { t: B.close.t - 0.2, type: "whoosh", dir: "in", dur: 1.2, gain: 0.12, seed: 13 },
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "percolate.js: 16 x 8 joints, 264 valved pipes (13 rows of vertical pipes incl. both trough rows, 12 rows of horizontal). Seeded opening order; incremental union-find gives the exact pipe that first joins the top trough to the bottom one; pipes before it open in beats 1-3, it opens alone in beat 4, later ones never open. Water = earliest-arrival flood from the top trough over open pipes (B is a sink).",
  plan: PLAN.stats,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s)` : "FAILS",
  captionRect: CAP,
  sound: "one click per 1/20 s bin of valve turns (gain ~ sqrt(count)); bubbles per bin of pipes starting to fill; pad bed released before beat 4 (silence), one loud clack + thud for the deciding valve, a riser landing as water reaches the bottom trough, chime + rumble there, a brighter pad under beat 5.",
};
