// scene.config.js — 07-split-flap-board: "What can AI do today?" on a mechanical departure board.
// Plain data + pure helpers. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The flip schedule is computed HERE with the style's pure planner (flaps.js), so
// the clatter SCORE is generated from exactly the flips the picture shows.
// Units: metres, Y-up, radians, seconds, sRGB hex. Board face = XY plane at z = 0, facing +Z.
import { STYLE_SPEC } from "./_atlas/styles/split-flap-board/spec.js";
import { layoutBoard, planBoard, clatterScore } from "./_atlas/styles/split-flap-board/flaps.js";

export const ID = "07-split-flap-board";
export const STYLE = "split-flap-board";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "idle", t: 0, dur: 0.5 },     // blank board
  { id: "header", t: 0.5, dur: 1.8 }, // AI CAPABILITIES flips in
  { id: "ready", t: 1.3, dur: 3.6 },  // three READY rows, one by one
  { id: "delayed", t: 5.0, dur: 3.8 },// three DELAYED rows (amber)
  { id: "reflip", t: 9.0, dur: 2.4 }, // MAKE VIDEOS: DELAYED -> NOW BOARDING (green blinks)
  { id: "footer", t: 11.4, dur: 3.6 },// UPDATED DAILY
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => B[id].t + off;

// Board layout (style factory "board"; see flaps.layoutBoard). 14 + 12 columns, 6 rows.
export const BOARD = {
  header: { cols: 17, scale: 1.25 },
  columns: [
    { id: "task", cols: 14, label: "TASK" },
    { id: "status", cols: 12, label: "STATUS" },
  ],
  rows: ["r1", "r2", "r3", "r4", "r5", "r6"].map((id) => ({ id })),
  footer: { cols: 15 },
  lampColors: ["amber", "green", "red"],
};

const ROW_STEP = 0.7; // s between consecutive rows starting
const rowsAt = (beat, rows) => rows.flatMap(([row, task, status], k) => [
  { row, block: "task", text: task, at: at(beat, k * ROW_STEP) },
  { row, block: "status", text: status, at: at(beat, k * ROW_STEP) },
]);
export const PROGRAM = [
  { row: "header", text: "AI CAPABILITIES", at: at("header") },
  ...rowsAt("ready", [["r1", "WRITE CODE", "READY"], ["r2", "SUMMARISE DOCS", "READY"], ["r3", "ANALYSE DATA", "READY"]]),
  ...rowsAt("delayed", [["r4", "DRIVE A CAR", "DELAYED"], ["r5", "FOLD LAUNDRY", "DELAYED"], ["r6", "MAKE VIDEOS", "DELAYED"]]),
  { row: "r6", block: "status", text: "NOW BOARDING", at: at("reflip") },
  { row: "footer", text: "UPDATED DAILY", at: at("footer") },
];

// ---- the plan (pure; identical in Node and the browser) ----
const LAYOUT = layoutBoard(BOARD, STYLE_SPEC.board);
const PLAN = planBoard(LAYOUT, PROGRAM, STYLE_SPEC.atlas.charset, STYLE_SPEC.tuning, STYLE_SPEC.board.seed);
export const ITEMS = PLAN.items.map((it) => ({ row: it.row, block: it.block, text: it.text.trim(), at: it.at, start: +it.start.toFixed(3), arrive: +it.arrive.toFixed(3) }));

// Lamps: status -> lamp. A lamp switches on when its status settles and off when the status starts changing.
const STATUS_LAMP = { READY: { color: "green" }, DELAYED: { color: "amber" }, "NOW BOARDING": { color: "green", blink: true } };
export const LAMPS = ITEMS.filter((it) => it.block === "status").map((it, _, all) => {
  const next = all.find((o) => o.row === it.row && o.start > it.start);
  return { row: it.row, ...STATUS_LAMP[it.text], on: it.arrive + 0.06, off: next ? next.start : Infinity };
});

// Camera: slow push-in from below centre (the board hangs high) with a gentle lateral drift for parallax.
export const CAMERA = [
  { t: 0, pos: [-1.35, -0.62, 14.6], target: [-0.08, 0.0, 0], fov: 28 },
  { t: 15, pos: [1.1, -0.45, 13.05], target: [0.06, 0.02, 0], fov: 28, ease: "inOutSine" },
];

export const OBJECTS = [
  { id: "hall", primitive: "procedural", factory: "hall", procedural: "44 x 26 m dark concrete hall wall 1.9 m behind the board", dims: { w: 44, h: 26, z: -1.9 } },
  {
    id: "board", primitive: "procedural", factory: "board",
    procedural: "split-flap departure board: powder-coated housing, brushed header strip, 17-cell header, 6 rows x (14 + 12) cells, 15-cell footer, 3 lamps per row; each cell = static top/bottom halves + falling flap (instanced)",
    dims: BOARD, position: [0, 0, 0],
  },
];

// ---- SCORE: clatter from the flip schedule + lamp relays + boarding chime + hall ambience ----
const lampPan = (row) => 0.75;
const halfW = LAYOUT.width / 2;
const reflip = ITEMS.find((it) => it.text === "NOW BOARDING");
export const SCORE = [
  // hall ambience: low pad + overlapping sub rumbles (constant air of a big room)
  { t: 0, type: "pad", dur: DURATION, gain: 0.06, root: 55, chord: [0, 7, 12, 19], attack: 1.2, release: 1.5, brightness: 260 },
  ...Array.from({ length: 8 }, (_, k) => ({ t: -1.5 + k * 2.4, type: "rumble", dur: 5, gain: 0.12, pitch: 0.75 + (k % 3) * 0.06, pan: k % 2 ? 0.3 : -0.3, seed: 300 + k })),
  // mechanical clatter: one clack (+ click) per row per 25 ms bin, gain ~ sqrt(flips in the bin)
  ...clatterScore(PLAN, { bin: 0.025, gain: 0.2, maxGain: 0.6, click: 0.45, halfWidth: halfW }),
  // lamp relays
  ...LAMPS.map((l, k) => ({ t: +l.on.toFixed(3), type: "tick", gain: 0.4, pitch: 0.55, pan: lampPan(l.row), seed: 900 + k })),
  // boarding chime when NOW BOARDING settles
  { t: +(reflip.arrive + 0.12).toFixed(3), type: "chime", dur: 1.6, gain: 0.2, pitch: 0.8, notes: 3 },
];
export const DUCK = [];
export const NOTES = {
  program: ITEMS,
  lamps: LAMPS.map((l) => ({ ...l, off: Number.isFinite(l.off) ? l.off : null })),
  mechanism: "Each cell steps forward through the charset ' A-Z 0-9 - . : / & '' at ~15 flips/s; flip state is a pure function of t (flaps.cellState). The SCORE is generated from flaps.flipEvents of the same plan.",
};
