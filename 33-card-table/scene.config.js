// scene.config.js — 33-card-table: "Three ways to learn" (a neutral pick-one explainer) on a card table.
// Plain data + the style's pure dealer planner. No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). Every riffle tick, deal, landing slide, flip snap and chip clink in SCORE comes from
// exactly the tracks the picture reads. Table frame: cloth at y = 0, viewer at +Z looking toward -Z.
import { STYLE_SPEC as S } from "./_atlas/styles/card-table/spec.js";
import {
  planRiffle, track, dealSeg, flipSeg, slideSeg, dropSeg, rowPoses, restY, chipY, wave, collectEvents, dealerVoices,
  tableShot, framingReport, cardCorners,
} from "./_atlas/styles/card-table/dealer.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { rng } from "./_atlas/kit/time.js";

export const ID = "33-card-table";
export const STYLE = "card-table";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---- the copy: three neutral options, no numbers or claims
export const OPTIONS = [
  { index: "1", icon: "book", title: "Book", caption: "Learn at your own pace", accent: S.palette.accents[0], seed: 1 },
  { index: "2", icon: "hammer", title: "Project", caption: "Learn by building something", accent: S.palette.accents[1], seed: 2 },
  { index: "3", icon: "people", title: "Class", caption: "Learn alongside others", accent: S.palette.accents[2], seed: 3 },
];
export const CHOSEN = 1;   // the middle card

// ---- beats (one short label each)
export const BEATS = [
  { id: "shuffle", t: 0, dur: 3.3, label: "Three ways to learn" },
  { id: "deal", t: 3.3, dur: 3.9, label: "Lay out the options" },
  { id: "pick", t: 7.2, dur: 3.6, label: "Pick the one that fits" },
  { id: "start", t: 10.8, dur: 4.2, label: "Start with a project" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
/** label windows: in with the beat, out 0.45 s before the next one (one at a time, each held >= 2.5 s) */
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.1 : 0.25), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.45 : Infinity }));

// ---- layout (metres on the cloth)
const N = 24;
export const DECK_AT = [0, -0.33];
const ROW_Z = 0.0, STEP = S.card.W + 0.06;
const PICK_Z = 0.25;
export const CHIP_AT = [0.215, 0.22];
const BUTTON_FROM = [-0.56, 0.36], BUTTON_TO = [-0.17, 0.33];

// ---- the plan: riffle -> deal three -> flip in a wave -> pick (slide forward, others recede) -> chips + button
export const RIFFLE = planRiffle({ at: B.shuffle.t + 0.55, n: N, center: DECK_AT, seed: 4 }, S);
export const TRACKS = RIFFLE.tracks;
const topCards = [RIFFLE.order[N - 1], RIFFLE.order[N - 2], RIFFLE.order[N - 3]];   // dealt in this order, left to right
export const FACES = Object.fromEntries(topCards.map((c, i) => [c, OPTIONS[i]]));
export const OPTION_CARDS = topCards;
const slots = rowPoses(3, S, { center: [0, ROW_Z], step: STEP, flip: Math.PI, jitter: 1, seed: 6 });
const DEAL0 = B.deal.t + 0.15, DEAL_STEP = 0.36;
topCards.forEach((c, i) => TRACKS[c].add(dealSeg(S, DEAL0 + i * DEAL_STEP, slots[i], { spin: 1 })));
const FLIP0 = DEAL0 + 2 * DEAL_STEP + S.deal.flight + S.deal.slideDur + 0.55;
wave(topCards.map((c) => TRACKS[c]), (i, at) => flipSeg(S, at, { to: { flip: 0 }, dir: 1 }), { at: FLIP0, step: 0.24 });
const PICK0 = B.pick.t + 0.25;
topCards.forEach((c, i) => {
  if (i === CHOSEN) TRACKS[c].add(slideSeg(S, PICK0 + 0.25, { p: [0, restY(S), PICK_Z], yaw: 0 }, { dur: 0.75, ease: "inOutSine" }));
  else TRACKS[c].add(slideSeg(S, PICK0, { p: [slots[i].p[0] * 1.12, restY(S), ROW_Z - 0.07], dim: 1 }, { dur: 0.6 }));
});
// chips: dropped one at a time beside the pick (a small stack marks it)
const CHIP_COLORS = [0, 1, 3, 0];
const cr = rng("chips:7");
export const CHIPS = CHIP_COLORS.map((col, k) => {
  const T = track({ p: [CHIP_AT[0], 0.3, CHIP_AT[1]], vis: 0 }, { id: `chip${k}`, kind: "chip" });
  T.add(dropSeg(S, PICK0 + 1.3 + k * 0.24, { p: [CHIP_AT[0] + (cr.next() - 0.5) * 0.004, chipY(S, k), CHIP_AT[1] + (cr.next() - 0.5) * 0.004], yaw: cr.next() * 6 }, { layer: k }));
  T.color = col;
  return T;
});
export const BUTTON = track({ p: [BUTTON_FROM[0], S.button.h / 2 + 0.0004, BUTTON_FROM[1]], yaw: 0.3 }, { id: "button", kind: "button" });
const BTN_AT = PICK0 + 2.45;
BUTTON.add(slideSeg(S, BTN_AT, { p: [BUTTON_TO[0], S.button.h / 2 + 0.0004, BUTTON_TO[1]], yaw: -0.15 }, { dur: 0.55, ease: "outCubic" }));
BUTTON.events.push({ t: BTN_AT + 0.5, kind: "button", id: "button" });

// ---- camera: computed shots (tableShot fits a cloth region inside the safe area), one move per beat
const FOV = S.camera.fov;
const half = (S.card.H / 2) + 0.01;
const SHOTS = {
  open: tableShot([DECK_AT[0] - 0.36, DECK_AT[1] - 0.16, DECK_AT[0] + 0.36, DECK_AT[1] + 0.2], { elev: 0.85, fov: FOV, safe: 0.8, yTop: 0.08, shift: [0, -0.1] }),
  riffle: tableShot([DECK_AT[0] - 0.29, DECK_AT[1] - 0.1, DECK_AT[0] + 0.29, DECK_AT[1] + 0.1], { elev: 0.98, fov: FOV, safe: 0.78, yTop: 0.07, shift: [0, -0.12] }),
  row: tableShot([-STEP - S.card.W / 2 - 0.02, DECK_AT[1] - 0.1, STEP + S.card.W / 2 + 0.02, ROW_Z + half], { elev: 0.92, fov: FOV, safe: 0.8, yTop: 0.04, shift: [0, -0.1] }),
  pick: tableShot([-STEP * 1.12 - S.card.W / 2 - 0.02, ROW_Z - 0.07 - half, STEP * 1.12 + S.card.W / 2 + 0.02, PICK_Z + half], { elev: 1.0, fov: FOV, safe: 0.8, yTop: 0.04, shift: [0, -0.08] }),
  hero: tableShot([-0.24, PICK_Z - half, CHIP_AT[0] + 0.05, PICK_Z + half], { elev: 1.18, fov: FOV, safe: 0.8, yTop: 0.05, shift: [0, -0.06] }),
  heroPush: tableShot([-0.235, PICK_Z - half + 0.01, CHIP_AT[0] + 0.03, PICK_Z + half - 0.01], { elev: 1.22, fov: FOV, safe: 0.84, yTop: 0.05, shift: [0, -0.06] }),
};
const key = (t, s, ease = "inOutCubic") => ({ t, ...s, ease });
export const CAMERA = [
  key(0, SHOTS.open),
  key(RIFFLE.rStart, SHOTS.riffle, "inOutSine"),
  key(B.deal.t - 0.45, SHOTS.riffle),
  key(DEAL0 + 0.75, SHOTS.row, "inOutSine"),
  key(B.pick.t, SHOTS.row),
  key(B.pick.t + 1.3, SHOTS.pick, "inOutSine"),
  key(B.start.t, SHOTS.pick),
  key(B.start.t + 1.6, SHOTS.hero, "inOutSine"),
  key(DURATION, SHOTS.heroPush, "inOutSine"),
];

// ---- framing replay: every option card (after it is dealt) and the label region must stay in frame
export const FRAMING = framingReport(CAMERA, (t) => {
  const out = [];
  topCards.forEach((c, i) => { if (t >= DEAL0 + i * DEAL_STEP + S.deal.flight && !(t > B.start.t && i !== CHOSEN)) out.push({ id: `opt${i}`, pts: cardCorners(TRACKS[c].poseAt(t), S) }); });
  if (t < B.deal.t) out.push({ id: "deck", pts: cardCorners(TRACKS[0].poseAt(t), S).concat(cardCorners(TRACKS[N - 1].poseAt(t), S)) });
  return out;
}, { duration: DURATION, drift: S.camera.drift, limit: 0.92 });

export const OBJECTS = [
  { id: "table", primitive: "procedural", factory: "table", procedural: "1.6 x 1.1 m rounded baize cloth (calm fbm tone, sheen) inside a bevelled wooden rail (extruded rounded-rect ring), apron and floor", dims: {} },
  { id: "lamp", primitive: "procedural", factory: "lamp", procedural: "hanging lamp: conical green-enamel shade, emissive bulb, brass cap, cord (the light is the spec's 'lamp' spot)", dims: {} },
];

// ---- SCORE: the dealer plan + a warm low bed
export const EVENTS = collectEvents(RIFFLE, topCards.map((c) => TRACKS[c]), CHIPS, BUTTON);
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 7, 12, 16], attack: 1.4, release: 1.6, brightness: S.sound.bed.brightness },
  { t: 0, type: "hum", dur: DURATION, gain: 0.035, seed: 77 },
  { t: B.start.t + 0.15, type: "chime", dur: 1.6, notes: 3, gain: 0.16, pitch: 1.0, seed: 91 },
  ...scoreFromEvents(EVENTS.filter((e) => !(e.kind === "deal" && false)), dealerVoices(S.sound), { seedBase: 101, pan: (e) => (e.obj === "chip" ? 0.25 : e.obj === "button" ? -0.3 : 0) }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "dealer.js plans every card as a piecewise pose track (riffle -> deal arc with spin and landing slide -> flip with bend -> slide); style.js bends a column-grid card mesh on the CPU from each pose. Chips are dropped one per clink.",
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s, ${FRAMING.worst.id})` : `FAILS: ${JSON.stringify(FRAMING.fails.slice(0, 5))}`,
  events: EVENTS.map((e) => ({ t: +e.t.toFixed(3), kind: e.kind })),
};
