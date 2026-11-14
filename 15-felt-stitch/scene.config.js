// scene.config.js — 15-felt-stitch: "AI agents working as a team" on a felt story board.
// Plain data + pure helpers. No THREE, no window: imported by scene.js (browser) and by render-sfx / export-spec
// (Node). Units: metres, Y-up, radians, s, sRGB hex / palette names. The board is the XY plane (z = 0 back), the
// camera looks down -Z from ~13.5 m. Object motion runs on twos (style.plan.onTwos); the camera on t.
// The stitch plans are built with the SAME pure planner the picture uses (stitches.js), so every SFX tick lands on
// a real stitch.
import * as SP from "./_atlas/styles/felt-stitch/stitches.js";

export const ID = "15-felt-stitch";
export const STYLE = "felt-stitch";
export const DURATION = 15;   // keep equal to data-duration in index.html
export const FPS = 30;
export const POSE_FPS = 15;

export const BEATS = [
  { id: "task", t: 0.0, dur: 2.75 },   // ONE BIG TASK: card flops on, needle sews its border
  { id: "split", t: 2.75, dur: 2.85 }, // SPLIT IT UP: planner hops, path sewn, card rides it, splits in three
  { id: "work", t: 5.6, dur: 3.3 },    // EACH AGENT DOES ONE JOB: paths, cards travel, agents wobble + sparks
  { id: "check", t: 8.9, dur: 2.7 },   // CHECK THE WORK: results to the checker, tick sewn on
  { id: "result", t: 11.6, dur: 3.4 }, // MANY AGENTS, ONE RESULT: report lands, banner embroidered
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const at = (id, off = 0) => B[id].t + off;

// ---------------------------------------------------------------- set
export const BOARD = { w: 14.4, h: 8.2, frame: 0.62, ground: 0.78, color: "board", frameColor: "frame", groundColor: "forest" };
export const Z = { board: 0.09, content: 0.2, travel: 0.55, caption: 0.24 };
export const GROUND_Y = -2.47;          // characters stand here (their pivot)

// ---------------------------------------------------------------- characters
export const AGENTS = [
  { id: "planner", name: "PLANNER", x: -4.35, color: "mustard", seam: "cream", emblem: "clipboard", seed: 101 },
  { id: "researcher", name: "RESEARCHER", x: -1.45, color: "sky", seam: "cream", emblem: "magnifier", seed: 202 },
  { id: "writer", name: "WRITER", x: 1.45, color: "coral", seam: "cream", emblem: "pencil", seed: 303 },
  { id: "checker", name: "CHECKER", x: 4.35, color: "plumLight", seam: "cream", emblem: "tick", seed: 404 },
];
export const AGENT_SIZE = { w: 1.72, h: 2.0 };
export const TAG = { cap: 0.27, y: -2.79, color: "cream", thread: "plum", pad: 0.22, h: 0.62 };
export const ENTER = { start: 0.05, step: 0.12, dur: 0.45 }; // characters flop up from the ground strip

// ---------------------------------------------------------------- beat 1: the task card
export const CARD = { pos: [-3.65, 1.75], w: 3.0, h: 1.75, color: "mustard", text: "WRITE A\nREPORT", cap: 0.36, thread: "ink",
  flop: at("task", 0.2), sewStart: at("task", 0.85), sewDur: 1.3 };

// ---------------------------------------------------------------- captions (one region: top right)
export const CAPTION = { x: 2.75, y: 2.28, cap: 0.42, color: "cream", thread: "plum" };
export const CAPTIONS = [
  { id: "c1", text: "ONE BIG TASK", in: at("task", 0.55), out: at("split", 0.05) },
  { id: "c2", text: "SPLIT IT UP", in: at("split", 0.4), out: at("work", 0.05) },
  { id: "c3", text: "EACH AGENT\nDOES ONE JOB", in: at("work", 0.2), out: at("check", 0.05) },
  { id: "c4", text: "CHECK THE WORK", in: at("check", 0.3), out: at("result", 0.0) },
];
export const CAPTION_SEW = 0.55;  // s to embroider a caption's letters
export const PEEL = 0.36;         // s to peel a caption off

// ---------------------------------------------------------------- beat 2: split
export const SPLIT = {
  hop: at("split", 0.15),
  pathPts: [[-2.6, 0.95], [-2.15, 0.35], [-2.85, -0.05], [-4.35, 0.1]],
  pathSew: at("split", 0.55), pathDur: 0.6,
  ride: at("split", 1.2), rideDur: 0.65, rideScale: 0.42,
  burst: at("split", 1.95),    // big card pops into three small cards
  fanDur: 0.45,
};
export const SMALL = { w: 1.12, h: 0.78, color: "mustard", thread: "ink" };
// three small cards: fan positions around the planner's head, then their destination (agent + offset)
export const TASKS = [
  // outer fan card -> farthest agent, so the stitched routes nest instead of crossing
  { id: "t1", fan: [-4.85, 0.32], to: "writer", off: [0, 0.08], rot: 0.16 },
  { id: "t2", fan: [-4.05, 0.6], to: "researcher", off: [0.6, 0.08], rot: -0.1 },
  { id: "t3", fan: [-3.25, 0.32], to: "researcher", off: [-0.6, 0.0], rot: 0.08 },
];

// ---------------------------------------------------------------- beat 3: work
export const WORK = {
  pathSew: at("work", 0.15), pathDur: 0.55,
  travel: at("work", 0.75), travelDur: 0.7, stagger: 0.12,
  start: at("work", 1.55), end: at("work", 3.15),
  sparkEvery: 0.2, sparks: 7, sparkSize: 0.5, pomR: 0.15,
  lines: 3,    // stitched "text" lines appear on each card while the agent works
};
export const TASK_HOME_Y = 0.12;   // cards land here (just above an agent's head)
// task routes (from the fan position over to the agent)
export const ROUTE_LIFT = [1.05, 0.7, 0.4];

// ---------------------------------------------------------------- beat 4: check
export const CHECK = {
  t0: at("check"),
  pathSew: at("check", 0.15), pathDur: 0.5,
  travel: at("check", 0.6), travelDur: 0.7, stagger: 0.1,
  stack: [[3.9, 0.12, 0.12], [4.35, 0.24, -0.06], [4.8, 0.12, -0.14]], // x, y, rot of the results above the checker
  hop: at("check", 1.4),
  tickFlop: at("check", 1.55), tickSew: at("check", 1.85), tickSewDur: 0.6,
  tick: { pos: [4.4, 0.42], size: 0.95 },
};

// ---------------------------------------------------------------- beat 5: result
export const RESULT = {
  unpick: at("result", 0.1), unpickDur: 0.55,
  gather: at("result", 0.15), gatherDur: 0.5,
  report: { pos: [0, 0.8], w: 1.85, h: 2.25 }, reportFlop: at("result", 0.55),
  banner: { pos: [0, 2.62], text: "MANY AGENTS, ONE RESULT", cap: 0.44, color: "cream", thread: "plum", border: "coral" },
  bannerFlop: at("result", 0.95), bannerSew: at("result", 1.2), bannerSewDur: 0.95,
  cheer: at("result", 2.35), cheerStep: 0.1, cheerHeight: 0.28,
};

// ---------------------------------------------------------------- camera: near-frontal, slightly high-right, slow sway
export const CAMERA = [
  // locked-off story-board shot (a slight high-right angle shows felt thickness and layer shadows). The camera never
  // moves: a full-frame fibre texture under a moving camera re-encodes every frame (33 MB at CRF 22 with a slow sway).
  { t: 0.0, pos: [1.05, 0.7, 13.5], target: [0.02, 0.0, 0], fov: 30 },
];

export const OBJECTS = [
  { id: "board", primitive: "procedural", factory: "board", procedural: "felt backdrop: teal wool-felt slab 14.4 x 8.2 m, plum felt border band with a cream running stitch, scalloped forest-green felt ground strip with a leaf running stitch", dims: { w: BOARD.w, h: BOARD.h, frame: BOARD.frame, ground: BOARD.ground, color: BOARD.color, frameColor: BOARD.frameColor, groundColor: BOARD.groundColor } },
];

// ---------------------------------------------------------------- stitch counts (same planner as the picture)
const cardRing = (w, h) => { const ww = w - 0.3, hh = h - 0.3, r = Math.min(w, h) * 0.14, pts = []; for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; const c = Math.cos(a), s = Math.sin(a); pts.push([Math.sign(c) * Math.min(Math.abs(c) * 1.6, 1) * (ww / 2 - r) + c * r, Math.sign(s) * Math.min(Math.abs(s) * 1.6, 1) * (hh / 2 - r) + s * r]); } return pts; };
export const COUNTS = {
  card: SP.runningStitch(cardRing(CARD.w, CARD.h), { closed: true }).length,
  caption: CAPTIONS.map((c) => SP.embroideredText(c.text, CAPTION.cap).segs.length),
  banner: SP.embroideredText(RESULT.banner.text, RESULT.banner.cap).segs.length,
};

// ---------------------------------------------------------------- SCORE (every cue from BEATS / plan data)
const q = (t) => Math.floor(t * POSE_FPS + 1e-6) / POSE_FPS;
const pan = (x) => Math.max(-0.7, Math.min(0.7, x / 7));
let seed = 2;
const S = (e) => ({ seed: (seed += 3), ...e });
/** soft fabric pat: muffled thud + dense low cloth rustle */
const pat = (t, g = 0.5, x = 0, p = 1) => [
  S({ t, type: "thud", dur: 0.22, gain: g * 0.75, pitch: 1.55 * p, pan: pan(x) }),
  S({ t, type: "paper", dur: 0.16, gain: g * 0.5, pitch: 0.42 * p, density: 0.95, pan: pan(x) }),
];
/** thread pull: short high whoosh (the floss sliding through felt) */
const pull = (t, g = 0.14, x = 0) => [S({ t, type: "whoosh", dir: "out", dur: 0.2, gain: g, pitch: 2.6, q: 3.2, pan: pan(x) })];
/** stitch ticks: one tick per stitch, thinned so they never exceed ~11/s; a thread pull every few stitches */
const sew = (start, dur, count, x = 0, g = 0.075) => {
  const times = SP.sewTimes(count, start, dur);
  const every = Math.max(1, Math.ceil(count / dur / 11));
  return times.filter((_, i) => i % every === 0).flatMap((t, i) => [
    S({ t: q(t), type: "tick", gain: g * (0.8 + 0.4 * ((i * 37) % 10) / 10), pitch: 0.9 + ((i * 13) % 7) * 0.05, pan: pan(x) }),
    ...(i % 4 === 3 ? pull(q(t) + 0.02, 0.09, x) : []),
  ]);
};
const boing = (t, x, p = 1) => [S({ t, type: "bubble", dur: 0.11, gain: 0.22, pitch: 0.75 * p, pan: pan(x) })];
const gentlePop = (t, x, p = 1, g = 0.22) => [S({ t, type: "pop", gain: g, pitch: 0.6 * p, pan: pan(x) })];
const swish = (t, dur, x, g = 0.1) => [S({ t, type: "whoosh", dir: "in", dur, gain: g, pitch: 1.3, q: 1.2, pan: pan(x) })];

// music box: G major arpeggios, one note every half beat (chime partials = a small bell/music-box comb)
const NOTE = (semi) => (392 * 2 ** (semi / 12)) / 880; // chime() base is 880 Hz; root G4 x2 octave below in pitch math
const MELODY = [12, 16, 19, 24, 19, 16, 17, 21, 24, 21, 19, 14, 17, 21, 19, 16, 12, 16, 19, 24, 26, 24, 19, 16, 17, 21, 24, 29, 28, 24];
const musicBox = MELODY.map((n, i) => S({ t: 0.25 + i * 0.48, type: "chime", dur: 1.1, gain: i >= 24 ? 0.05 : 0.065, pitch: NOTE(n) * 2, pan: ((i % 5) - 2) * 0.12 }));

const agentX = Object.fromEntries(AGENTS.map((a) => [a.id, a.x]));
export const SCORE = [
  S({ t: 0, type: "pad", dur: DURATION, gain: 0.22, root: 98, chord: [0, 7, 12, 16, 19], attack: 1.6, release: 2.2, brightness: 780 }),
  ...musicBox,
  // characters flop up
  ...AGENTS.flatMap((a, i) => pat(q(ENTER.start + i * ENTER.step + ENTER.dur * 0.35), 0.32, a.x, 1 + i * 0.06)),
  // beat 1: card flops down, needle sews the border
  ...swish(CARD.flop - 0.15, 0.35, CARD.pos[0], 0.08),
  ...pat(q(CARD.flop + 0.18), 0.6, CARD.pos[0], 0.95),
  ...sew(CARD.sewStart, CARD.sewDur, COUNTS.card, CARD.pos[0]),
  // captions: pat in, embroidered ticks, peel off
  ...CAPTIONS.flatMap((c, i) => [
    ...pat(q(c.in + 0.18), 0.4, CAPTION.x, 1.1),
    ...sew(c.in + 0.3, CAPTION_SEW, COUNTS.caption[i], CAPTION.x, 0.055),
    S({ t: q(c.out), type: "rustle", dur: 0.3, gain: 0.16, pitch: 1.2, density: 0.55, pan: pan(CAPTION.x) }),
  ]),
  // beat 2
  ...boing(SPLIT.hop - 0.12, agentX.planner), ...pat(q(SPLIT.hop + 0.5), 0.42, agentX.planner, 1.05),
  ...sew(SPLIT.pathSew, SPLIT.pathDur, 14, -3.2, 0.06),
  ...swish(SPLIT.ride, SPLIT.rideDur, -3.5),
  ...TASKS.flatMap((tk, i) => gentlePop(q(SPLIT.burst + i * 0.07), tk.fan[0], 1 + i * 0.18, 0.24)),
  // beat 3
  ...sew(WORK.pathSew, WORK.pathDur, 24, -2.5, 0.055),
  ...TASKS.flatMap((tk, i) => [...swish(WORK.travel + i * WORK.stagger, WORK.travelDur, agentX[tk.to], 0.07), ...pat(q(WORK.travel + i * WORK.stagger + WORK.travelDur), 0.3, agentX[tk.to], 1.2)]),
  S({ t: WORK.start, type: "rustle", dur: WORK.end - WORK.start, gain: 0.12, pitch: 0.7, density: 0.5, pan: -0.1 }),
  ...["researcher", "writer"].flatMap((id, j) => Array.from({ length: WORK.sparks }, (_, i) => gentlePop(q(WORK.start + 0.1 + j * 0.09 + i * WORK.sparkEvery), agentX[id], 1.3 + ((i + j) % 3) * 0.15, 0.13)).flat()),
  ...sew(WORK.start + 0.2, WORK.end - WORK.start - 0.35, 30, 0, 0.045),
  // beat 4
  ...sew(CHECK.pathSew, CHECK.pathDur, 18, 3, 0.055),
  ...TASKS.flatMap((tk, i) => [...swish(CHECK.travel + i * CHECK.stagger, CHECK.travelDur, 3.5, 0.07), ...pat(q(CHECK.travel + i * CHECK.stagger + CHECK.travelDur), 0.28, 4.35, 1.25)]),
  ...boing(CHECK.hop - 0.12, agentX.checker, 1.1), ...pat(q(CHECK.hop + 0.5), 0.4, agentX.checker, 1.05),
  ...pat(q(CHECK.tickFlop + 0.18), 0.45, CHECK.tick.pos[0], 1.2),
  ...sew(CHECK.tickSew, CHECK.tickSewDur, 12, CHECK.tick.pos[0]),
  S({ t: CHECK.tickSew + CHECK.tickSewDur + 0.02, type: "chime", dur: 1.4, gain: 0.2, pitch: NOTE(24) * 2, pan: pan(CHECK.tick.pos[0]) }),
  S({ t: CHECK.tickSew + CHECK.tickSewDur + 0.02, type: "sparkle", dur: 0.8, gain: 0.12, notes: 5, pan: pan(CHECK.tick.pos[0]) }),
  // beat 5
  S({ t: RESULT.unpick, type: "rustle", dur: RESULT.unpickDur, gain: 0.14, pitch: 1.5, density: 0.4 }),
  ...swish(RESULT.gather, RESULT.gatherDur, 2, 0.1),
  ...swish(RESULT.reportFlop - 0.2, 0.4, 0, 0.1),
  ...pat(q(RESULT.reportFlop + 0.18), 0.7, 0, 0.85),
  ...pat(q(RESULT.bannerFlop + 0.18), 0.55, 0, 0.95),
  ...sew(RESULT.bannerSew, RESULT.bannerSewDur, COUNTS.banner, 0, 0.06),
  S({ t: RESULT.bannerSew + RESULT.bannerSewDur + 0.05, type: "chime", dur: 2.2, gain: 0.22, pitch: NOTE(19) * 2 }),
  S({ t: RESULT.bannerSew + RESULT.bannerSewDur + 0.05, type: "sparkle", dur: 1.0, gain: 0.12, notes: 6 }),
  ...AGENTS.flatMap((a, i) => [...boing(RESULT.cheer + i * RESULT.cheerStep - 0.1, a.x, 1 + i * 0.1), ...pat(q(RESULT.cheer + i * RESULT.cheerStep + 0.45), 0.25, a.x, 1.1)]),
];
export const DUCK = [];
export const NOTES = {
  posing: "Object motion is evaluated at tq = floor(t*15)/15 (on twos); the camera uses t.",
  layers: Z, agents: AGENTS, card: CARD, captions: CAPTIONS, split: SPLIT, tasks: TASKS, work: WORK, check: CHECK, result: RESULT,
};
