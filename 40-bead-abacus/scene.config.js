// scene.config.js — 40-bead-abacus: "Votes, counted" on a hardwood counting frame (SAMPLE DATA).
// Plain data + the style's pure bead planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every clack, slide whirr and marimba note in SCORE comes from exactly the plans the picture reads;
// every number on screen comes from DATA.
import { STYLE_SPEC as S } from "./_atlas/styles/bead-abacus/spec.js";
import { frameLayout, worldBox, planRow, planHundred, collectEvents, beadVoices, fitShot, framingCheck } from "./_atlas/styles/bead-abacus/beads.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, boxCorners } from "./_atlas/kit/framing.js";

export const ID = "40-bead-abacus";
export const STYLE = "bead-abacus";
export const DURATION = 15;   // keep equal to data-duration in index.html
export const FPS = 30;

// ---- the data (SAMPLE DATA — placeholders, shown with a stamp on screen)
export const DATA = {
  sample: true,
  teams: [
    { label: "TEAM A", value: 7, color: 0 },
    { label: "TEAM B", value: 4, color: 1 },
    { label: "TEAM C", value: 9, color: 2 },
  ],
  outOf: 100,
};
const [A, Bt, C] = DATA.teams;
export const TOTAL = DATA.teams.reduce((s, x) => s + x.value, 0);
const PCT = Math.round((100 * TOTAL) / DATA.outOf);

// ---- beats (one short label each, built from the data)
export const BEATS = [
  { id: "count", t: 0, dur: 3.5, label: `Count up: ${A.value} votes` },
  { id: "compare", t: 3.5, dur: 4.0, label: "Compare three teams" },
  { id: "total", t: 7.5, dur: 3.6, label: `Add them up: ${TOTAL} votes` },
  { id: "share", t: 11.1, dur: 3.9, label: `${TOTAL} out of ${DATA.outOf} = ${PCT}%` },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
/** label windows: one at a time; the card swaps text at each beat with a short dip (out .12 s, in .2 s) so a label is
 *  on screen in every shot (the caption is the beat's anchor; a 0.5 s blank between beats read as a missing label) */
export const LABEL_FADE = { inDur: 0.2, outDur: 0.12 };
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: i ? b.t - 0.06 : 0.2, off: BEATS[i + 1] ? BEATS[i + 1].t - LABEL_FADE.outDur : Infinity }));

// ---- layout: the team frame and the hundred frame side by side on the table
export const MAIN_AT = [0, 0];
export const HUNDRED_AT = [3.05, 0];
export const MAIN = frameLayout(S, { rows: DATA.teams.length, beads: 10, labels: true, plates: true });
export const HUNDRED = frameLayout(S, { rows: 10, beads: 10, rowPitch: S.hundred.rowPitch, labels: false, plates: "total" });
export const SUN_SHIFT = [1.5, 0, 0];   // centre the daylight shadow frustum between the two frames

// ---- the plan
// count: team A one bead at a time; compare: team B as one block, team C one at a time
const COUNT0 = B.count.t + 0.55;
export const ROWS = [
  planRow({ id: "A", n: 10, layout: MAIN, keys: [{ at: COUNT0, count: A.value, mode: "each", stagger: 0.27 }] }, S),
  planRow({ id: "B", n: 10, layout: MAIN, keys: [{ at: B.compare.t + 0.45, count: Bt.value, mode: "block" }] }, S),
  planRow({ id: "C", n: 10, layout: MAIN, keys: [{ at: B.compare.t + 1.1, count: C.value, mode: "each", stagger: 0.17 }] }, S),
];
// total: the hundred frame takes the teams one after another (running total; a row that fills spills onto the next)
const T0 = B.total.t + 0.95;
let run = 0;
const HKEYS = DATA.teams.map((tm, i) => ({ at: T0 + i * 0.85, value: (run += tm.value) }));
export const HPLAN = planHundred({ keys: HKEYS, layout: HUNDRED, noteStep: 5 }, S);
// share: a brass divider drops under the last full row; the plate turns into the percentage
export const DIVIDER = { between: [Math.ceil(TOTAL / 10) - 1, Math.ceil(TOTAL / 10)], at: B.share.t + 0.5, elev: 1.2 };
DIVIDER.nudge = (S.frame.postH + S.divider.h / 2 - S.frame.rodY) / Math.tan(DIVIDER.elev);
export const PCT_AT = B.share.t + 0.5 + S.divider.dur;          // plate shows the percent when the bar lands
export const PLATE_PCT = { main: `${PCT}%`, sub: `of ${DATA.outOf}` };

// ---- camera: computed shots (fitShot keeps the whole frame + tags + plates under the caption band)
const FOV = S.camera.fov;
const mainPts = boxCorners(...worldBox(MAIN, MAIN_AT));
const hunPts = boxCorners(...worldBox(HUNDRED, HUNDRED_AT));
const SHOTS = {
  countWide: fitShot(mainPts, { elev: 0.84, azim: -0.16, fov: FOV, win: { x0: -0.84, x1: 0.84, y0: -0.82, y1: 0.6 } }),
  count: fitShot(mainPts, { elev: 0.9, azim: -0.1, fov: FOV }),
  compare: fitShot(mainPts, { elev: 0.98, azim: 0, fov: FOV }),
  total: fitShot(hunPts, { elev: 1.12, azim: 0.08, fov: FOV, win: { x0: -0.84, x1: 0.84, y0: -0.84, y1: 0.6 } }),
  share: fitShot(hunPts, { elev: DIVIDER.elev, azim: 0.02, fov: FOV, win: { x0: -0.88, x1: 0.88, y0: -0.88, y1: 0.63 } }),
};
const key = (t, s, ease = "inOutCubic") => ({ t, ...s, ease });
export const CAMERA = [
  key(0, SHOTS.countWide),
  key(B.count.t + 3.2, SHOTS.count, "inOutSine"),
  key(B.compare.t + 0.9, SHOTS.compare, "inOutSine"),
  key(B.total.t, SHOTS.compare),
  key(B.total.t + 1.0, SHOTS.total, "inOutCubic"),
  key(B.share.t, SHOTS.total),
  key(B.share.t + 1.4, SHOTS.share, "inOutSine"),
  key(DURATION, { ...SHOTS.share, pos: SHOTS.share.pos.map((v, i) => SHOTS.share.target[i] + (v - SHOTS.share.target[i]) * 0.985) }, "linear"),
];

// ---- framing gate: the subject frame (with its tags and plates) stays inside the window under the caption
const regions = (t) => (t < B.total.t + 0.15 ? [{ id: "teams", pts: mainPts }] : t >= B.total.t + 1.0 ? [{ id: "hundred", pts: hunPts }] : []);
export const FRAMING = framingCheck(CAMERA, regions, { duration: DURATION, drift: S.camera.drift, fov: FOV, win: { y1: 0.66 } });
export const FRAMING_KIT = framingReport(regions, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, safe: 0.9 });
if (!FRAMING.ok || !FRAMING_KIT.ok) throw new Error(`framing gate failed: ${JSON.stringify(FRAMING.fails.slice(0, 3))} ${JSON.stringify(FRAMING_KIT.spans.slice(0, 3))}`);

export const OBJECTS = [
  { id: "surface", primitive: "procedural", factory: "surface", procedural: "30 x 30 m bright matte tabletop (receives the soft daylight shadows)", dims: { size: 30 } },
];

// ---- SCORE: the bead plans + caption ticks + the divider + a warm bed
export const EVENTS = collectEvents(...ROWS, HPLAN);
const at = (id, off = 0) => B[id].t + off;
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 4, 7, 14], attack: 1.6, release: 1.8, brightness: S.sound.bed.brightness },
  ...LABELS.map((L, i) => ({ t: L.on, type: "paper", dur: 0.3, gain: S.sound.caption.gain, seed: 31 + i })),
  { t: DIVIDER.at + S.divider.dur, type: "clack", dur: 0.12, gain: 0.34, pitch: 1.05, seed: 61 },
  { t: DIVIDER.at + S.divider.dur, type: "thud", dur: 0.3, gain: 0.16, pitch: 1.6, seed: 62 },
  { t: PCT_AT + 0.02, type: "chime", dur: 2.2, gain: S.sound.emphasis.gain, pitch: S.sound.emphasis.pitch, seed: 63 },
  { t: at("total", 0.05), type: "whooshIn", dur: 0.9, gain: 0.08, seed: 64 },
  ...scoreFromEvents(EVENTS, beadVoices(S.sound), { seedBase: 101, pan: (e) => (e.row === "A" ? -0.15 : e.row === "C" ? 0.15 : 0) }),
];
export const DUCK = [];
export const NOTES = {
  data: "SAMPLE DATA: three teams 7 / 4 / 9 votes out of 100 (placeholders, stamped on screen).",
  mechanism: "beads.js plans each row as moves (block or one-at-a-time) along the rod; every bead in a moving group travels the same distance, so the group slides rigidly, meets the stack still moving (clack) and settles with tiny damped hops. Plates change on the landing frame.",
  framing: `own window check ${FRAMING.ok ? "ok" : "FAIL"} (worst over ${FRAMING.worst.over} at ${FRAMING.worst.t}s); kit 90% safe ${FRAMING_KIT.ok ? "ok" : "FAIL"} (worst ${FRAMING_KIT.worst.ndc})`,
  events: EVENTS.filter((e) => e.kind === "clack").map((e) => ({ t: +e.t.toFixed(3), row: e.row, count: e.count })),
};
