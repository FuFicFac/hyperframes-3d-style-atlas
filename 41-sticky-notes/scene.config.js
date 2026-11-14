// scene.config.js — 41-sticky-notes: a planning wall, brainstorm -> cluster -> vote -> move work across.
// Plain data + pure helpers. No THREE, no window: imported by scene.js (browser) and by render-sfx / export-spec (Node).
// The whole board is planned HERE with the style's pure planner (notes.js): every peel rip, slap, marker squeak, dot pop
// and breeze in SCORE comes from exactly the plan the picture plays. Board coords: metres, board centre (0,0), y up.
import { STYLE_SPEC } from "./_atlas/styles/sticky-notes/spec.js";
import { planBoard, boardShot, stickyVoices, malletPhrase } from "./_atlas/styles/sticky-notes/notes.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, boxCorners } from "./_atlas/kit/framing.js";
import { rng } from "./_atlas/kit/time.js";

export const ID = "41-sticky-notes";
export const STYLE = "sticky-notes";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;
const S = STYLE_SPEC, BD = S.board, N = S.note.size;

// ---- beats (labels <= 26 chars). Everything below is timed from these.
export const BEATS = [
  { id: "ideas", t: 0, dur: 3.3, label: "Get every idea up" },
  { id: "group", t: 3.3, dur: 5.0, label: "Group what belongs" },
  { id: "vote", t: 8.3, dur: 2.4, label: "Dot-vote what matters" },
  { id: "move", t: 10.7, dur: 2.85, label: "Pull work across" },
  { id: "plan", t: 13.55, dur: 1.45, label: "One wall, one plan" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b) => b.label);

// ---- layout: three lanes; the TO DO lane holds three colour clusters (stacks of three)
const LANE = { todo: [-2.1, 0.3], doing: [0.3, 1.2], done: [1.2, 2.1] };
const HEAD_Y = 0.93, HEAD_CAP = 0.13, RULE_Y = 0.84;
const COLS = { tell: -1.62, build: -0.92, fix: -0.22 };
const ROWS = [0.72, 0.26, -0.2];                       // note TOP edges
const DOING = { x: 0.75, rows: [0.72, 0.26] }, DONE = { x: 1.65, rows: [0.72] };
const slot = (c, r) => ({ x: COLS[c], y: ROWS[r], rot: rng(`slot:${c}${r}`).range(-0.02, 0.02) });

// brainstorm scatter: a loose 3x3 cloud over the TO DO lane (seeded jitter)
const R = rng("scatter");
const cell = (k) => ({ x: [-1.75, -1.05, -0.35][k % 3] + R.range(-0.05, 0.05), y: [0.6, 0.12, -0.38][Math.floor(k / 3)] + R.range(-0.04, 0.04), rot: R.range(-0.1, 0.1) });
const CELLS = Array.from({ length: 9 }, (_, k) => cell(k));

const IDEAS = [
  // id, colour, word, scatter cell, cluster, row
  ["signup", "yellow", "Sign-up", 0, "build", 0],
  ["slow", "pink", "Slow load", 1, "fix", 1],
  ["faq", "blue", "FAQ page", 2, "tell", 1],
  ["login", "pink", "Login bug", 3, "fix", 0],
  ["demo", "blue", "Demo video", 4, "tell", 0],
  ["search", "yellow", "Search", 5, "build", 1],
  ["typos", "pink", "Typos", 6, "fix", 2],
  ["news", "blue", "Newsletter", 7, "tell", 2],
  ["dark", "yellow", "Dark mode", 8, "build", 2],
];
const PAD_ORDER = ["dark", "news", "typos"];           // peeled off the pad, nearest cell first
const PEELS = [0.25, 0.9, 1.55].map((d) => B.ideas.t + d);

// re-sort as three swap cycles (each cycle lifts together, so no note ever lands on one still sitting there)
const CYCLES = [["signup", "slow", "search", "demo"], ["faq", "login"], ["typos", "dark", "news"]];
const CYCLE_T = [0.1, 0.5, 0.9].map((d) => B.group.t + d);
const byId = Object.fromEntries(IDEAS.map((i) => [i[0], i]));

const moves = [];
CYCLES.forEach((cy, k) => cy.forEach((id, j) => {
  const [, , , , c, r] = byId[id];
  moves.push({ id, t: +(CYCLE_T[k] + j * 0.05).toFixed(3), to: slot(c, r), kind: "hop" });
}));
// beat 4: pull work across (hop), the FIX stack closes its gap (slide)
const MV = (id, d, to, kind = "hop") => moves.push({ id, t: +(B.move.t + d).toFixed(3), to, kind });
MV("login", 0.1, { x: DOING.x, y: DOING.rows[0], rot: -0.015 });
MV("slow", 0.55, slot("fix", 0), "slide");
MV("typos", 0.63, slot("fix", 1), "slide");
MV("signup", 0.8, { x: DOING.x, y: DOING.rows[1], rot: 0.02 });
MV("login", 1.45, { x: DONE.x, y: DONE.rows[0], rot: 0.025 });

// ---- marks: lanes + headers (pre-drawn), cluster boxes + names (beat 2), DONE underline + tick (beat 4)
const boxOf = (c) => ({ x0: COLS[c] - N / 2 - 0.07, x1: COLS[c] + N / 2 + 0.07, y0: ROWS[2] - N - 0.07, y1: ROWS[0] + 0.06 });
const NAME_Y = ROWS[2] - N - 0.24, NAME_CAP = 0.12;
const LAST_LAND = 5.45;                                 // checked below against the plan
const marks = [
  { id: "lane1", kind: "line", a: [LANE.doing[0], 1.12], b: [LANE.doing[0] + 0.01, -1.12], pre: true, wobble: 0.004 },
  { id: "lane2", kind: "line", a: [LANE.done[0], 1.12], b: [LANE.done[0] - 0.01, -1.12], pre: true, wobble: 0.004 },
  { id: "rule", kind: "line", a: [-2.02, RULE_Y], b: [2.02, RULE_Y + 0.006], pre: true, wobble: 0.004 },
  { id: "h-todo", kind: "text", text: "TO DO", x: (LANE.todo[0] + LANE.todo[1]) / 2, y: HEAD_Y, cap: HEAD_CAP, pre: true },
  { id: "h-doing", kind: "text", text: "DOING", x: (LANE.doing[0] + LANE.doing[1]) / 2, y: HEAD_Y, cap: HEAD_CAP, pre: true },
  { id: "h-done", kind: "text", text: "DONE", x: (LANE.done[0] + LANE.done[1]) / 2, y: HEAD_Y, cap: HEAD_CAP, pre: true },
  ...["tell", "build", "fix"].flatMap((c, k) => [
    { id: `box-${c}`, kind: "box", ...boxOf(c), color: "blue", speed: 12, ...(k === 0 ? { t: B.group.t + (LAST_LAND - 3.3) } : { gap: 0.06 }) },
    { id: `name-${c}`, kind: "text", text: c.toUpperCase(), x: COLS[c], y: NAME_Y, cap: NAME_CAP, color: "blue", speed: 6.2, gap: 0.04 },
  ]),
  { id: "ul-done", kind: "underline", x0: 1.42, x1: 1.9, y: HEAD_Y - 0.045, color: "green", t: B.move.t + 2.12, speed: 3.5 },
  { id: "tick", kind: "check", c: [1.95, DONE.rows[0] - 0.12], size: 0.11, color: "green", gap: 0.06, speed: 2.2 },
];

// ---- dot votes (u across, v down the sheet)
const VOTES = [["login", "red"], ["signup", "blue"], ["login", "green"], ["typos", "red"], ["signup", "green"], ["demo", "blue"], ["login", "blue"], ["signup", "red"], ["typos", "green"]];
const seen = {};
const dots = VOTES.map(([on, color], i) => {
  const k = (seen[on] = (seen[on] ?? 0) + 1) - 1;
  return { on, color, t: +(B.vote.t + 0.6 + i * 0.17).toFixed(3), u: 0.36 - k * 0.205, v: 0.12 + (k % 2) * 0.015 };
});

export const PROGRAM = {
  notes: IDEAS.map(([id, color, text, c]) => {
    const p = PAD_ORDER.indexOf(id);
    return p >= 0 ? { id, color, text, pad: true, peel: PEELS[p], place: CELLS[c] } : { id, color, text, place: CELLS[c] };
  }),
  moves,
  dots,
  marks,
  breezes: [{ t: B.vote.t + 0.05 }],
};
export const PLAN = planBoard(PROGRAM, S);

// sanity: the cluster boxes start after every cycle note has landed, and beat 2's marks end inside beat 2
{
  const lastSlap = Math.max(...PLAN.order.flatMap((id) => PLAN.notes[id].segs.filter((s) => s.kind === "slap" && s.t0 < B.vote.t).map((s) => s.t0)));
  if (lastSlap > LAST_LAND) throw new Error(`cluster boxes start at ${LAST_LAND} but a note lands at ${lastSlap.toFixed(2)}`);
  const end = PLAN.byId["name-fix"].t1;
  if (end > B.vote.t - 0.05) throw new Error(`cluster names end at ${end.toFixed(2)}, after beat 2 (${B.vote.t})`);
}

// ---- camera: computed board shots (notes.js boardShot), each fitted to a board box; gate on a replay of the rig
const FR = S.camera.framing;
const shot = (box, safe = FR.safe) => boardShot(box, { fov: FR.fov, dir: FR.dir, safe, minDist: FR.minDist, maxDist: FR.maxDist });
const BOX = {
  pad: [1.12, -1.33, 2.12, -0.52],
  wide: [-BD.w / 2 - 0.06, -BD.h / 2 - 0.13, BD.w / 2 + 0.06, BD.h / 2 + 0.06],
  todo: [-2.14, -1.22, 0.4, 1.1],
  vote: [-2.05, -1.25, 0.32, 1.1],
  work: [-1.25, -1.28, 2.18, 1.1],
};
const SHOTS = { pad: shot(BOX.pad), wide: shot(BOX.wide, 0.975), todo: shot(BOX.todo), vote: shot(BOX.vote), work: shot(BOX.work) };
const key = (t, s, ease = "inOutSine") => ({ t: +t.toFixed(3), ...s, ease });
export const CAMERA = [
  key(0, SHOTS.pad),
  key(PEELS[0] + 0.55, SHOTS.pad),                 // hold on the first peel
  key(PEELS[0] + 1.5, SHOTS.wide),                 // pull back as it flies to the wall
  key(B.group.t + 0.1, SHOTS.wide),
  key(B.group.t + 1.2, SHOTS.todo),                // push in on the TO DO lane for the re-sort and the boxes
  key(B.vote.t + 0.2, SHOTS.todo),
  key(B.vote.t + 0.95, SHOTS.vote),
  key(B.move.t, SHOTS.vote),
  key(B.move.t + 0.9, SHOTS.work),                 // ease right to take in DOING and DONE
  key(B.plan.t - 0.05, SHOTS.work),
  key(B.plan.t + 1.0, SHOTS.wide),                 // the finished wall fills the frame
  key(DURATION, SHOTS.wide),
];
// required regions (the subject of each shot) must stay inside the safe area at every sample, mid-move included
const REG = [
  { id: "pad", box: BOX.pad, from: 0, to: PEELS[0] + 0.55 },
  { id: "wall", box: BOX.wide, from: PEELS[0] + 1.5, to: B.group.t + 0.1 },
  { id: "todo", box: BOX.todo, from: B.group.t + 1.2, to: B.vote.t + 0.2 },
  { id: "vote", box: BOX.vote, from: B.vote.t + 0.2, to: B.move.t },
  { id: "work", box: BOX.work, from: B.move.t + 0.9, to: B.plan.t - 0.05 },
  { id: "final", box: BOX.wide, from: B.plan.t + 1.0, to: DURATION },
].map((r) => ({ id: r.id, pts: boxCorners([r.box[0], r.box[1], 0], [r.box[2], r.box[3], 0.04]), from: r.from, to: r.to }));
export const FRAMING = framingReport(REG, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, safe: FR.limit + 0.075 });
if (!FRAMING.ok) throw new Error(`framing: ${FRAMING.fails.length} sample(s) past the safe area, worst ${JSON.stringify(FRAMING.worst)}`);

export const OBJECTS = [
  {
    id: "wall", primitive: "procedural", factory: "wallBoard",
    procedural: "4.2 x 2.4 m whiteboard in an aluminium frame with a ledge on a studio wall; a leaning pad of notes; nine 0.4 m paper notes (bent meshes rebuilt every frame from the plan), dot stickers, marker-ink ribbons with per-vertex draw times, a marker pen riding the stroke tip",
    dims: {},
  },
];

// ---- SCORE: planned events (rips, slaps, hops, dots, squeaks, breeze) + a light mallet theme on the beats + a soft bed
const pan = (e) => Math.max(-0.6, Math.min(0.6, (e.x ?? 0) * 0.28));
const THEME = { ideas: [0, 4, 7], group: [2, 5, 9], vote: [4, 7, 11], move: [5, 9, 12], plan: [0, 4, 7, 12] };
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: 0.55, root: 196, chord: [0, 7, 12, 16], attack: 1.2, release: 1.6, brightness: 900 },
  ...BEATS.flatMap((b) => malletPhrase(b.t + 0.05, THEME[b.id], { root: S.sound.mallet.root, gain: S.sound.mallet.gain, dur: S.sound.mallet.dur, step: 0.14 })),
  ...scoreFromEvents(PLAN.events, stickyVoices(S.sound), { pan, seedBase: 101 }),
];
export const DUCK = [];
export const NOTES = {
  events: PLAN.events.length,
  strokes: PLAN.strokes.length,
  mechanism: "Board = planBoard(PROGRAM) (notes.js). Each note is a bent mesh rebuilt from noteState(plan, id, t) every frame; ink ribbons carry per-vertex draw times; SCORE = scoreFromEvents(plan.events, stickyVoices()) + mallet phrases on BEATS.",
};
