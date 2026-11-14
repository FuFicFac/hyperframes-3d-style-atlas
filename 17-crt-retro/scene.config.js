// scene.config.js — 17-crt-retro: "ELIZA, 1966: the first chatbot" on a beige terminal at night.
// Plain data + pure helpers. No THREE, no window: imported by scene.js (browser) and by render-sfx / export-spec
// (Node). The screen program is planned HERE with the style's pure planner (screen.js), so the key clacks, beeps
// and power sounds in SCORE come from exactly the schedule the picture draws (and the 3D keys press).
// Units: metres (real desk scale), Y-up, radians, seconds, sRGB hex. Desk top = y 0, monitor faces +Z.
import { STYLE_SPEC } from "./_atlas/styles/crt-retro/spec.js";
import { planScreen, typingVoices } from "./_atlas/styles/crt-retro/screen.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "17-crt-retro";
export const STYLE = "crt-retro";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---- the screen program (32 x 14 character grid). `after` chains an item to the end of an earlier one.
export const PROGRAM = [
  { type: "power", at: 0.35, on: true },
  { id: "hdr", type: "print", at: 0.9, row: 1, col: 9, text: "ELIZA  ·  1966", cps: 32 },
  { id: "sub", type: "print", after: "hdr", gap: 0.1, row: 2, col: 5, text: "DOCTOR SCRIPT LOADED.", dim: true, cps: 60 },
  { id: "rule", type: "print", after: "sub", gap: 0.05, row: 3, col: 0, text: "─".repeat(32), dim: true, cps: 140, cursor: false },
  // beat 2: the user types, ELIZA answers
  { id: "p1", type: "prompt", at: 1.95, row: 5, col: 0, text: "> " },
  { id: "u1", type: "type", at: 2.1, row: 5, col: 2, text: "I FEEL STUCK ON MY PROJECT", enter: true },
  { id: "r1", type: "print", after: "u1", gap: 0.16, row: 7, col: 0, text: "WHY DO YOU FEEL STUCK\nON YOUR PROJECT?", beep: true, cps: 70 },
  // beat 3: the trick, as a diagram
  { id: "c1", type: "clear", after: "r1", gap: 0.9, dur: 0.26 },
  { id: "d1", type: "print", after: "c1", gap: 0.08, row: 1, col: 1, text: "PATTERN   I FEEL ___", cps: 80 },
  { id: "d2", type: "print", after: "d1", gap: 0.06, row: 2, col: 1, text: "REPLY     WHY DO YOU FEEL ___?", cps: 80 },
  { id: "b1", type: "box", after: "d2", gap: 0.08, row0: 4, col0: 0, row1: 6, col1: 31, cps: 200 },
  { id: "t1", type: "print", after: "d2", gap: 0.14, row: 5, col: 2, text: "I FEEL STUCK ON MY PROJECT", cps: 90, cursor: false },
  { id: "i1", type: "invert", after: "b1", gap: 0.1, row: 5, col: 9, len: 19, dur: 0.3 },
  { id: "ar", type: "print", after: "i1", gap: 0.05, row: 7, col: 9, text: "↓   MY → YOUR", cps: 70, cursor: false },
  { id: "b2", type: "box", after: "ar", gap: 0.05, row0: 8, col0: 0, row1: 11, col1: 31, cps: 200 },
  { id: "t2", type: "print", after: "ar", gap: 0.12, row: 9, col: 2, text: "WHY DO YOU FEEL\nSTUCK ON YOUR PROJECT?", cps: 90, cursor: false },
  { id: "i2", type: "invert", after: "t2", gap: 0.1, row: 10, col: 2, len: 21, dur: 0.3 },
  // beat 4: back to chat
  { id: "c2", type: "clear", after: "i2", gap: 0.55, dur: 0.24 },
  { id: "p2", type: "prompt", after: "c2", gap: 0.06, row: 2, col: 0, text: "> " },
  { id: "u2", type: "type", after: "p2", gap: 0.12, row: 2, col: 2, text: "DO YOU UNDERSTAND ME?", enter: true },
  { id: "r2", type: "print", after: "u2", gap: 0.16, row: 4, col: 0, text: "WE WERE TALKING ABOUT YOU,\nNOT ME.", beep: true, cps: 70 },
  // beat 5: end title (double size) and power-off
  { id: "c3", type: "clear", after: "r2", gap: 0.75, dur: 0.24 },
  { id: "end", type: "print", after: "c3", gap: 0.08, row: 3, col: 1, text: "60 YEARS LATER,\nWE'RE STILL\nTALKING.", scale: 2, cps: 55 },
  { type: "power", at: 14.45, on: false },
];
export const PLAN = planScreen(PROGRAM, { cols: STYLE_SPEC.crt.cols, rows: STYLE_SPEC.crt.rows, typing: STYLE_SPEC.typing });
const I = PLAN.byId;

// ---- beats (derived from the plan, so retiming the program retimes the camera and captions)
export const BEATS = [
  { id: "wide", t: 0, dur: 1.0 },
  { id: "chat1", t: I.p1.start, dur: I.c1.start - I.p1.start },
  { id: "trick", t: I.c1.start, dur: I.c2.start - I.c1.start },
  { id: "chat2", t: I.c2.start, dur: I.c3.start - I.c2.start },
  { id: "outro", t: I.c3.start, dur: DURATION - I.c3.start },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));

export const CAPTIONS = [
  { text: "IT JUST MATCHED PATTERNS", on: I.i1.start + 0.05, off: I.c2.start - 0.05 },
  { text: "NO UNDERSTANDING. PEOPLE STILL FELT HEARD.", on: I.r2.start + 0.15, off: I.end.start + 0.25 },
];

// ---- camera: wide desk -> push in to the tube -> over-the-keys angle -> pull back out
const SCREEN_C = [0, 0.334, 0.11]; // tube centre (world)
export const CAMERA = [
  { t: 0, pos: [0.05, 0.7, 1.62], target: [-0.02, 0.29, 0.0], fov: 30 },
  { t: 0.95, pos: [0.05, 0.69, 1.58], target: [-0.02, 0.29, 0.0], fov: 30, ease: "inOutSine" },
  // over the keys while the first line is typed (keys press with the schedule), screen still large
  { t: I.u1.start + 0.25, pos: [0.1, 0.7, 1.13], target: [0.0, 0.19, 0.2], fov: 30, ease: "inOutCubic" },
  { t: I.u1.end - 0.15, pos: [0.085, 0.69, 1.1], target: [0.0, 0.195, 0.2], fov: 30, ease: "inOutSine" },
  // push in until the tube fills the frame for the reply and the diagram
  { t: I.r1.start + 0.55, pos: [0.0, 0.352, 0.655], target: SCREEN_C, fov: 30, ease: "inOutCubic" },
  { t: B.chat2.t - 0.1, pos: [0.0, 0.349, 0.64], target: SCREEN_C, fov: 30, ease: "inOutSine" },
  // a gentle three-quarter drift for the second exchange
  { t: B.chat2.t + 1.1, pos: [0.075, 0.355, 0.66], target: [0.01, 0.334, 0.11], fov: 30, ease: "inOutSine" },
  { t: I.r2.end + 0.35, pos: [0.08, 0.356, 0.665], target: [0.01, 0.334, 0.11], fov: 30, ease: "inOutSine" },
  // pull back out to the desk for the end title and power-off
  { t: I.r2.end + 2.25, pos: [-0.03, 0.72, 1.52], target: [0.0, 0.25, 0.04], fov: 30, ease: "inOutCubic" },
  { t: DURATION, pos: [-0.04, 0.73, 1.6], target: [0.0, 0.245, 0.04], fov: 30, ease: "outSine" },
];

export const OBJECTS = [
  { id: "wall", primitive: "procedural", factory: "wall", procedural: "4.5 x 2.4 m dark painted plaster wall plane at z = -0.42", dims: { w: 4.5, h: 2.4, z: -0.42 } },
  { id: "desk", primitive: "procedural", factory: "desk", procedural: "2.8 x 1.1 m walnut-plank desk top, 45 mm thick, top surface at y = 0", dims: { w: 2.8, d: 1.1, thick: 0.045, z: 0.1 } },
  {
    id: "cork", primitive: "procedural", factory: "corkBoard", position: [-0.6, 0.52, -0.408], rotation: [0, 0, 0.012],
    procedural: "0.5 x 0.34 m framed cork board with two pinned handwritten notes",
    dims: { w: 0.46, h: 0.32, notes: [
      { lines: [{ text: "ELIZA", size: 0.3, y: 0.36 }, { text: "doctor script", size: 0.17, y: 0.6 }, { text: "J.W. — MIT '66", size: 0.15, y: 0.82 }], w: 0.15, h: 0.11, x: -0.09, y: 0.04, rot: 0.04, underline: true },
      { lines: [{ text: "TODO:", size: 0.22, y: 0.36 }, { text: "teach it to", size: 0.17, y: 0.6 }, { text: "understand??", size: 0.17, y: 0.82 }], w: 0.12, h: 0.1, x: 0.12, y: -0.05, rot: -0.06 },
    ] },
  },
  { id: "lamp", primitive: "procedural", factory: "deskLamp", procedural: "black articulated desk lamp (weighted base, twin lower arms, spring, open cone shade) with a warm spotlight aimed at the desk right", dims: { base: [0.8, -0.24], elbow: [0.77, 0.47, -0.19], head: [0.57, 0.45, 0.05], aim: [0.44, 0, 0.33] } },
  { id: "mug", primitive: "procedural", factory: "mug", procedural: "glazed green mug with pencils", position: [-0.5, 0, 0.27], rotation: [0, 0.6, 0], dims: {} },
  { id: "disk1", primitive: "procedural", factory: "floppy", procedural: "5.25-inch floppy disk with handwritten label", position: [0.42, 0, 0.36], dims: { label: "ELIZA", rot: 0.35 } },
  { id: "disk2", primitive: "procedural", factory: "floppy", procedural: "5.25-inch floppy disk with handwritten label", position: [0.47, 0.0023, 0.3], dims: { label: "DOCTOR", rot: -0.2 } },
  {
    id: "workstation", primitive: "procedural", factory: "workstation",
    procedural: "beige system unit with two 5.25-inch drives, CRT monitor on top (curved tube + CRT shader screen), two-tone keyboard with pressable keys, cable",
    dims: { phosphor: STYLE_SPEC.crt.phosphor },
  },
];

// ---- SCORE: typing / beeps / power from the same plan + a low room bed
const pan = (e) => (e.kind === "key" || e.kind === "space" || e.kind === "enter" ? 0.0 : 0.05);
const powerOn = PLAN.power.find((p) => p.on).t, powerOff = PLAN.power.find((p) => !p.on).t;
export const SCORE = [
  // room: dark pad + fan rumble the whole time; CRT flyback hum while the set is on
  { t: 0, type: "pad", dur: DURATION, gain: 0.34, root: 55, chord: [0, 7, 12], attack: 1.0, release: 1.2, brightness: 320 },
  ...Array.from({ length: 7 }, (_, k) => ({ t: -1 + k * 2.5, type: "rumble", dur: 5, gain: 0.2, pitch: 0.9 + (k % 3) * 0.05, pan: k % 2 ? 0.25 : -0.25, seed: 400 + k })),
  { t: powerOn + 0.2, type: "buzz", hz: 60, flicker: 0, dur: powerOff - powerOn, gain: 0.05, pitch: 1, seed: 31 },
  // floppy drive seek on boot
  { t: powerOn + 0.15, type: "servo", hz: 70, hz2: 95, grit: 0.6, dur: 0.9, gain: 0.08, pan: 0.1, seed: 32 },
  ...scoreFromEvents(PLAN.events, typingVoices(), { pan, seedBase: 101 }),
];
export const DUCK = [];
export const NOTES = {
  items: PLAN.items.map((it) => ({ id: it.id ?? it.type, type: it.type, start: +it.start.toFixed(3), end: +it.end.toFixed(3) })),
  keystrokes: PLAN.events.filter((e) => e.kind === "key" || e.kind === "space" || e.kind === "enter").length,
  mechanism: "Screen content = planScreen(PROGRAM) evaluated per frame (pure). Key clacks, beeps and power sounds are scoreFromEvents(plan.events, typingVoices()).",
};
