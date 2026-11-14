// scene.config.js — 21-chalkboard: "Why AI makes things up" on a classroom chalkboard.
// Plain data + pure helpers. No THREE, no window: imported by scene.js (browser) and by render-sfx / export-spec (Node).
// The chalk program is planned HERE with the style's pure planner (chalk.js), so every scratch, tap and eraser wipe in
// SCORE comes from exactly the schedule the board paints. Board coords: metres, board centre = (0,0), y up.
import { STYLE_SPEC } from "./_atlas/styles/chalkboard/spec.js";
import { planChalk, textBox, chalkVoices, boardShot, framingReport } from "./_atlas/styles/chalkboard/chalk.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "21-chalkboard";
export const STYLE = "chalkboard";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;
const CH = STYLE_SPEC.chalk, BD = STYLE_SPEC.board;

// ---- layout (measured from the same jittered handwriting the board draws)
const SENT = { x: -0.74, y1: 0.32, y2: 0.12, cap: 0.12 };
const line2 = textBox({ id: "s2", text: "AUSTRALIA IS", cap: SENT.cap, x: SENT.x, y: SENT.y2 }, CH);
const BLANK = { x0: line2[2] + 0.08, x1: line2[2] + 0.74, y: SENT.y2 - 0.012 };
const CHART = { base: -0.7, x: -1.5, bars: [
  { id: "syd", label: "SYDNEY", x0: -1.42, h: 0.46, hatch: "yellow" },
  { id: "can", label: "CANBERRA", x0: -0.82, h: 0.27, hatch: "white" },
  { id: "mel", label: "MELBOURNE", x0: -0.22, h: 0.14, hatch: "white" },
], w: 0.3, labelY: -0.8, labelCap: 0.074 };
const canLabel = textBox({ id: "lab-can", text: "CANBERRA", cap: CHART.labelCap, x: CHART.bars[1].x0 + CHART.w / 2, y: CHART.labelY, align: "center" }, CH);
const NOTE = { x: 0.4, y: -0.33, cap: 0.1 };

// ---- the chalk program
export const PROGRAM = [
  // beat 1: heading (double-stroked)
  { id: "head", type: "text", text: "WHY AI 'HALLUCINATES'", cap: 0.15, x: 0, y: 0.6, align: "center", heading: true, at: 0.25 },
  // beat 2: the model + the sentence with a blank
  { id: "box", type: "box", x0: -1.53, y0: 0.11, x1: -1.02, y1: 0.33, color: "blue", gap: 0.2 },
  { id: "model", type: "text", text: "MODEL", cap: 0.08, x: -1.275, y: 0.185, align: "center", color: "blue", gap: 0.06 },
  { id: "arrow", type: "arrow", a: [-0.99, 0.21], b: [-0.8, 0.205], head: 0.05, gap: 0.08 },
  { id: "s1", type: "text", text: "THE CAPITAL OF", cap: SENT.cap, x: SENT.x, y: SENT.y1, gap: 0.08 },
  { id: "s2", type: "text", text: "AUSTRALIA IS", cap: SENT.cap, x: SENT.x, y: SENT.y2 },
  { id: "blank", type: "line", a: [BLANK.x0, BLANK.y], b: [BLANK.x1, BLANK.y + 0.006], gap: 0.1 },
  // beat 3: next-word guesses as a bar chart
  { id: "axis", type: "line", a: [CHART.x, CHART.base], b: [0.2, CHART.base - 0.004], gap: 0.15 },
  ...CHART.bars.flatMap((b, i) => [
    { id: `bar-${b.id}`, type: "bar", x0: b.x0, y0: CHART.base, w: CHART.w, h: b.h, hatch: { color: b.hatch, spacing: 0.034 }, gap: i ? 0.06 : 0.08 },
    { id: `lab-${b.id}`, type: "text", text: b.label, cap: CHART.labelCap, x: b.x0 + CHART.w / 2, y: CHART.labelY, align: "center", gap: 0.05 },
  ]),
  { id: "note", type: "text", text: "IT PICKS A\nLIKELY WORD", cap: NOTE.cap, x: NOTE.x, y: NOTE.y, lineHeight: 1.6, gap: 0.12 },
  // beat 4: the confident wrong answer
  { id: "guess", type: "text", text: "SYDNEY", cap: 0.12, x: BLANK.x0 + 0.04, y: SENT.y2 + 0.012, color: "yellow", gap: 0.2 },
  { id: "strike", type: "strike", x0: BLANK.x0 - 0.02, x1: BLANK.x0 + 0.66, y: SENT.y2 + 0.06, n: 2, color: "pink", gap: 0.15 },
  { id: "why", type: "text", text: "✗ SOUNDS RIGHT, ISN'T", cap: 0.08, x: BLANK.x0 - 0.04, y: -0.07, color: "pink", gap: 0.1 },
  { id: "ring", type: "circle", c: [(canLabel[0] + canLabel[2]) / 2, (canLabel[1] + canLabel[3]) / 2], rx: (canLabel[2] - canLabel[0]) / 2 + 0.035, ry: 0.068, color: "green", gap: 0.1 },
  // beat 5: wipe the note, write the takeaway, underline twice
  { id: "wipe", type: "erase", rect: [0.3, -0.62, 1.56, -0.19], gap: 0.22 },
  { id: "take", type: "text", text: "LIKELY ≠ TRUE\n— SO CHECK.", cap: 0.11, x: 0.4, y: -0.34, lineHeight: 1.7, gap: -0.4 },
  { id: "ul", type: "underline", x0: 0.36, x1: 1.36, y: -0.6, double: true, gap: 0.12 },
];
export const PLAN = planChalk(PROGRAM, CH);
const I = PLAN.byId;

// ---- beats (derived from the plan, so retiming the program retimes the camera)
export const BEATS = [
  { id: "heading", t: 0, dur: I.box.start },
  { id: "sentence", t: I.box.start, dur: I.axis.start - I.box.start },
  { id: "chart", t: I.axis.start, dur: I.guess.start - I.axis.start },
  { id: "wrong", t: I.guess.start, dur: I.wipe.start - I.guess.start },
  { id: "takeaway", t: I.wipe.start, dur: DURATION - I.wipe.start },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));

// ---- camera: computed board shots (style helper boardShot): square-on, at eye level with what they frame, each fitted so
// the heading + the regions named stay inside the safe area. framingReport replays the rig (eases + drift) every 0.1 s and
// the build FAILS if the heading or any item being drawn passes the outer 5 % of the frame, mid-move included.
const FR = { ...STYLE_SPEC.camera.framing, plan: PLAN };
const shot = (regions, o = {}) => boardShot(["head", ...regions], { ...FR, ...o });
const BOARD = [-BD.w / 2 - 0.09, -BD.h / 2 - 0.12, BD.w / 2 + 0.09, BD.h / 2 + 0.09]; // slate + frame + tray
const SHOTS = {
  wide: shot([BOARD], { safe: 0.99 }),
  sentence: shot(["box", "s1", "s2", "blank"]),
  chart: shot(["box", "s2", "blank", "axis", "lab-syd", "lab-mel", "bar-syd", "note"]),
  wrong: shot(["box", "s2", "guess", "why", "lab-syd", "lab-mel", "ring", "note", "wipe"]),
  all: shot(PLAN.items.map((it) => it.id)),          // the whole lesson: the closing hold
};
const move = (t, s, ease = "inOutSine") => ({ t, ...s, ease });
export const CAMERA = [
  move(0, SHOTS.wide),
  move(0.9, SHOTS.wide),
  move(I.box.start - 0.1, SHOTS.sentence),           // push in while the heading finishes
  move(I.s1.end, SHOTS.sentence),                    // hold while the sentence is written
  move(I.axis.start - 0.05, SHOTS.chart),            // ease down to take in the chart (heading stays in)
  move(B.wrong.t - 0.25, SHOTS.chart),
  move(B.wrong.t + 0.9, SHOTS.wrong),
  move(B.takeaway.t - 0.2, SHOTS.wrong),
  move(B.takeaway.t + 1.2, SHOTS.all),               // settle on the whole lesson for the takeaway
  move(DURATION, SHOTS.all),
];
export const FRAMING = framingReport(PLAN, CAMERA, { ...FR, duration: DURATION, drift: STYLE_SPEC.camera.drift });
if (!FRAMING.ok) throw new Error(`framing: ${FRAMING.fails.length} sample(s) past the safe area, worst ${JSON.stringify(FRAMING.worst)}`);

export const OBJECTS = [
  { id: "wall", primitive: "procedural", factory: "wall", procedural: "8 x 5 m painted sage plaster wall plane behind the board", dims: { w: 8, h: 5 } },
  {
    id: "board", primitive: "procedural", factory: "chalkboard",
    procedural: "3.4 x 1.9 m green slate (mottled, ghosts of old lessons, chalk canvas through a tooth shader) in a worn oak frame with a chalk tray holding chalk sticks, a felt eraser and dust; floating chalk stick + falling dust particles",
    dims: { sticks: ["white", "white", "yellow", "pink", "blue", "green"], eraserRest: [1.18, null, null] },
  },
];

// ---- SCORE: chalk scratches / taps / eraser from the same plan + a quiet room bed
const pan = (e) => Math.max(-0.5, Math.min(0.5, (e.x ?? 0) * 0.28));
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: 0.5, root: 55, chord: [0, 7, 12, 16], attack: 1.5, release: 1.5, brightness: 380 },
  ...Array.from({ length: 6 }, (_, k) => ({ t: -0.6 + k * 2.8, type: "rumble", dur: 5, gain: 0.22, pitch: 0.85 + (k % 3) * 0.06, pan: k % 2 ? 0.3 : -0.3, seed: 300 + k })),
  ...scoreFromEvents(PLAN.events, chalkVoices(STYLE_SPEC.sound), { pan, seedBase: 101 }),
];
export const DUCK = [];
export const NOTES = {
  items: PLAN.items.map((it) => ({ id: it.id, type: it.type, start: +it.start.toFixed(3), end: +it.end.toFixed(3) })),
  strokes: PLAN.strokes.length,
  mechanism: "Board = planChalk(PROGRAM) painted per frame as a pure function of t (committed-prefix cache rebuilt on backward seeks). Scratches, taps and eraser sounds are scoreFromEvents(plan.events, chalkVoices()).",
};
