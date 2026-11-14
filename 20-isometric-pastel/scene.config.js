// scene.config.js — 20-isometric-pastel: "The AI stack" — four floors that stack (chips, data centres, models, apps).
// Plain data + the style's pure plan module (iso.js) + kit pathmath (no THREE, no window): imported by scene.js
// (browser) and by render-sfx / export-spec (Node). Units: metres, Y-up, radians, s, sRGB hex.
// Floor-local coordinates: slab base at y = 0, deck (slab top) at y = SLAB.h; X = screen down-right, Z = screen down-left.
import { stackPlan, stackEvents, isoKey, loopTimes } from "./_atlas/styles/isometric-pastel/iso.js";
import { filletPath, pathLength } from "./_atlas/kit/pathmath.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "20-isometric-pastel";
export const STYLE = "isometric-pastel";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "grid", t: 0.0, dur: 0.55 },    // pale dot grid; a dashed plot marks where the stack will stand
  { id: "chips", t: 0.55, dur: 2.65 },  // 1 CHIPS: slab rises, chips pop in a diagonal wave
  { id: "dc", t: 3.2, dur: 2.9 },       // 2 DATA CENTRES: floor drops on, racks + coolers rise, LEDs chase
  { id: "models", t: 6.1, dur: 2.9 },   // 3 MODELS: core stacks up, cables draw on, data packets flow in
  { id: "apps", t: 9.0, dur: 2.3 },     // 4 APPS: devices + capsule people, screens tick
  { id: "finale", t: 11.3, dur: 3.7 },  // explode + tags, close, pulse bottom -> top; EVERYTHING YOU USE SITS ON ALL FOUR
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => +(B[id].t + off).toFixed(4);

// ---------------------------------------------------------------- floors
export const SLAB = { w: 7, d: 5, h: 0.5 };
export const FLOORS = [
  { id: "chips", n: 1, title: "CHIPS", color: "sky", height: 1.5, posts: 1.0, enter: "rise", at: at("chips", 0.0), dur: 0.6, sink: 0.62 },
  { id: "dc", n: 2, title: "DATA CENTRES", color: "lilac", height: 2.6, posts: 2.1, enter: "drop", at: at("dc", 0.0), dur: 0.62, dropH: 8 },
  { id: "models", n: 3, title: "MODELS", color: "mint", height: 3.1, posts: 2.6, enter: "drop", at: at("models", 0.0), dur: 0.62, dropH: 8 },
  { id: "apps", n: 4, title: "APPS", color: "peach", height: 1.6, posts: 0, enter: "drop", at: at("apps", 0.0), dur: 0.62, dropH: 8 },
];
export const PLAN = stackPlan(FLOORS, {
  explode: { at: at("finale", 0.0), dur: 0.6, gap: 1.15 },
  close: { at: at("finale", 1.6), dur: 0.42 },
  pulse: { at: at("finale", 2.15), step: 0.24 },
});
const LAND = PLAN.land;

// floor 1 — chip grid (5 x 3, centre chip bigger), diagonal wave reveal
export const CHIPS = [];
for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) {
  const big = i === 2 && j === 1;
  CHIPS.push({ x: -2.3 + i * 1.15, z: -1.15 + j * 1.15, size: big ? 1.0 : 0.78, die: big ? "accent" : "lilac", at: +(at("chips", 0.5) + (i + j) * 0.075).toFixed(4) });
}
export const TRACES = [ // flat circuit traces printed on the deck between chip columns (x, z, w, d)
  ...[-1.725, -0.575, 0.575, 1.725].map((x) => [x, 0, 0.08, 3.0]),
  [0, -0.575, 4.6, 0.08], [0, 0.575, 4.6, 0.08],
];
// floor 2 — two rows of racks facing +Z (the screen-left face) + two cooling units
export const RACKS = [];
for (const [row, z] of [[0, -1.25], [1, 0.75]]) for (let i = 0; i < 4; i++) RACKS.push({ x: -2.45 + i * 1.02, z, at: +(LAND[1] + 0.12 + (row * 4 + i) * 0.06).toFixed(4), seed: 11 + row * 4 + i });
export const COOLERS = [{ x: 2.15, z: -1.25 }, { x: 2.15, z: 0.75 }].map((c, i) => ({ ...c, at: +(LAND[1] + 0.62 + i * 0.1).toFixed(4) }));
export const LED_RATE = 4; // Hz, chase clock
// floor 3 — model core + four data stores feeding it along axis-aligned cables
export const CORE = { plinth: { w: 1.9, h: 0.3, d: 1.9 }, cubes: [{ s: 0.95, color: "peach" }, { s: 0.7, color: "accent" }, { s: 0.42, color: "butter" }], gap: 0.08, at: at("models", 0.55) };
const CY = 0.08; // cable centre height above the deck
export const STORES = [
  { x: -2.55, z: -1.65, path: [[-2.55, CY, -1.25], [-2.55, CY, -0.45], [-0.95, CY, -0.45]] },
  { x: -2.55, z: 1.65, path: [[-2.15, CY, 1.65], [-0.45, CY, 1.65], [-0.45, CY, 0.95]] },
  { x: 2.55, z: -1.65, path: [[2.15, CY, -1.65], [0.45, CY, -1.65], [0.45, CY, -0.95]] },
  { x: 2.55, z: 1.65, path: [[2.55, CY, 1.25], [2.55, CY, 0.45], [0.95, CY, 0.45]] },
].map((s, i) => ({ ...s, at: +(at("models", 0.45) + i * 0.07).toFixed(4) }));
export const CABLES = { radius: 0.07, bend: 0.4, drawAt: at("models", 1.0), drawDur: 0.55, flowAt: at("models", 1.35), speed: 1.7, spacing: 0.9, packet: 0.17 };
export const RIPPLE = { at: at("models", 1.3), period: 0.9, size: 2.1, grow: 1.5 };
// floor 4 — devices in a row facing +Z, capsule people beside them
export const DEVICES = [
  { kind: "monitor", x: -2.3, z: -0.95, phase: 0.1, w: 1.9, h: 1.2 },
  { kind: "phone", x: -0.45, z: -1.0, phase: 0.55, w: 0.86, h: 1.65 },
  { kind: "tablet", x: 1.15, z: -1.0, phase: 0.95, w: 1.45, h: 1.05 },
  { kind: "phone", x: 2.75, z: -1.0, phase: 0.3, w: 0.86, h: 1.65 },
].map((d, i) => ({ ...d, at: +(LAND[3] + 0.12 + i * 0.08).toFixed(4) }));
export const PEOPLE = [
  { x: -1.35, z: 0.8, color: "#ff8a7a", hop: 0.0 },
  { x: 0.35, z: 1.3, color: "#7aa7f0", hop: 0.35 },
  { x: 1.95, z: 0.75, color: "#6fcfa8", hop: 0.7 },
  { x: -2.8, z: 1.35, color: "#b49cf2", hop: 0.2 },
].map((p, i) => ({ ...p, at: +(LAND[3] + 0.5 + i * 0.08).toFixed(4) }));
export const SCREEN = { on: at("apps", 0.95), period: 1.3 };
export const HOP = { at: at("apps", 1.1), period: 1.3, height: 0.12, dur: 0.32 };

// ---------------------------------------------------------------- camera: locked true isometric, pan + ortho zoom only
const stackTop = (k) => PLAN.rest[k] + SLAB.h + [0.3, 1.8, 2.5, 1.8][k];
const focusY = (k, extra = 0) => +((stackTop(k) + extra) / 2).toFixed(3);
const RIGHT = [0.3, -0.04];
export const CAMERA = [
  isoKey(0.0, [0, 0.3, 0], 8.6, { at: RIGHT }),
  isoKey(at("chips", 0.0), [0, 0.3, 0], 8.6, { at: RIGHT }),
  isoKey(at("chips", 2.4), [0, 0.6, 0], 8.9, { at: RIGHT, ease: "inOutSine" }),
  isoKey(at("dc", 0.65), [0, focusY(1), 0], 10.6, { at: RIGHT, ease: "inOutCubic" }),
  isoKey(at("dc", 2.6), [0, focusY(1) + 0.15, 0], 10.8, { at: RIGHT, ease: "inOutSine" }),
  isoKey(at("models", 0.65), [0, focusY(2), 0], 12.6, { at: RIGHT, ease: "inOutCubic" }),
  isoKey(at("models", 2.6), [0, focusY(2) + 0.15, 0], 12.8, { at: RIGHT, ease: "inOutSine" }),
  isoKey(at("apps", 0.65), [0, focusY(3), 0], 14.2, { at: RIGHT, ease: "inOutCubic" }),
  isoKey(at("apps", 2.2), [0, focusY(3) + 0.1, 0], 14.3, { at: RIGHT, ease: "inOutSine" }),
  isoKey(at("finale", 0.7), [0, focusY(3, 3 * 1.15), 0], 17.2, { at: [0.14, -0.03], ease: "inOutCubic" }),
  isoKey(at("finale", 1.6), [0, focusY(3, 3 * 1.15), 0], 17.2, { at: [0.14, -0.03], ease: "inOutSine" }),
  isoKey(at("finale", 2.1), [0, focusY(3), 0], 15.4, { at: [0.12, -0.03], ease: "inOutCubic" }),
  isoKey(DURATION, [0, focusY(3), 0], 15.1, { at: [0.12, -0.03], ease: "inOutSine" }),
];

// ---------------------------------------------------------------- overlay copy + timing (NDC; tuned by looking)
export const SUBS = ["THE SILICON THAT DOES THE MATHS", "WAREHOUSES OF CHIPS, POWER + COOLING", "TRAINED ON DATA, RUN ON THE RACKS", "WHAT YOU ACTUALLY TOUCH"];
export const UI = {
  kicker: { text: "THE AI STACK", on: at("grid", 0.2), off: at("finale", 0.0), x: -0.86, y: 0.8 },
  captions: FLOORS.map((f, k) => ({ n: f.n, title: f.title, sub: SUBS[k], color: f.color, on: +(LAND[k] + 0.22).toFixed(4), off: k < 3 ? at(FLOORS[k + 1].id, -0.25) : at("finale", -0.2), x: -0.86, y: 0.6 })),
  final: { title: "EVERYTHING\nYOU USE SITS\nON ALL FOUR", on: at("finale", 0.3), off: Infinity, x: -0.87, y: 0.66, size: 0.88 },
  tags: FLOORS.map((f, k) => ({ n: f.n, title: f.title, color: f.color, on: +(at("finale", 0.35) + k * 0.1).toFixed(4), off: Infinity })),
  tagX: 0.465,
};

export const OBJECTS = []; // the stack is built procedurally in scene.js from style.props (see NOTES)

// ---------------------------------------------------------------- SCORE (every cue from BEATS / PLAN / prop schedules)
const cableLen = STORES.map((s) => pathLength(filletPath(s.path, CABLES.bend)));
const notifyTimes = DEVICES.flatMap((d) => {
  const first = (((0.82 * SCREEN.period - d.phase) % SCREEN.period) + SCREEN.period) % SCREEN.period;
  return loopTimes(SCREEN.on + first, at("finale", 0.0), SCREEN.period);
});
const STACK_VOICES = {
  rise: () => [{ type: "whoosh", dir: "in", dur: 0.5, gain: 0.22, pitch: 0.8 }],
  fall: () => [{ type: "whoosh", dir: "in", dur: 0.36, gain: 0.26, pitch: 1.15 }],
  land: (e) => [{ type: "clack", gain: 0.42, pitch: 0.75 + e.i * 0.06 }, { type: "thud", gain: 0.3, pitch: 1.6 }],
  explode: () => [{ type: "whoosh", dir: "out", dur: 0.6, gain: 0.3, pitch: 1.0 }],
  close: () => [{ type: "clack", gain: 0.5, pitch: 0.7 }, { type: "thud", gain: 0.42, pitch: 1.3 }],
  pulse: (e) => [{ type: "blip", notes: [[0], [4], [7], [12]][e.i], dur: 0.09, gain: 0.3, pitch: 1.0 }],
};
export const SCORE = [
  // light optimistic bed: major-9 pad, warm-bright (brightness = low-pass cutoff in Hz)
  { t: 0, type: "pad", dur: 11.6, gain: 0.5, root: 262, chord: [0, 4, 7, 11, 14], attack: 1.0, release: 1.4, brightness: 1500 },
  { t: at("finale", 0.0), type: "pad", dur: 3.7, gain: 0.5, root: 294, chord: [0, 4, 7, 12, 16], attack: 0.4, release: 1.6, brightness: 1800 },
  // grid: dashes tick on, kicker blip
  ...loopTimes(0.12, 0.62, 0.1).map((t, i) => ({ t, type: "tick", gain: 0.12, pitch: 1.4 + i * 0.05, seed: 3 + i })),
  { t: UI.kicker.on, type: "blip", notes: [0, 7], dur: 0.05, gain: 0.16, pitch: 1.2 },
  // stack (rise / drops / explode / close / pulse)
  ...scoreFromEvents(stackEvents(PLAN), STACK_VOICES, { seedBase: 101 }),
  // captions + tags pop
  ...UI.captions.map((c, i) => ({ t: c.on, type: "blip", notes: [0, 5, 9], dur: 0.05, gain: 0.2, pitch: 1 + i * 0.06, seed: 200 + i })),
  { t: UI.final.on, type: "blip", notes: [0, 4, 7, 12], dur: 0.06, gain: 0.22, pitch: 1.0 },
  ...UI.tags.map((g, i) => ({ t: g.on, type: "tick", gain: 0.22, pitch: 1.6 + i * 0.12, seed: 210 + i })),
  // floor 1: chips pop in the diagonal wave (one pop per diagonal), posts click up
  ...[...new Set(CHIPS.map((c) => c.at))].map((t, i) => ({ t, type: "pop", gain: 0.24, pitch: 1.1 + i * 0.07, seed: 300 + i })),
  { t: at("chips", 1.05), type: "click", gain: 0.2, pitch: 1.2 },
  // floor 2: racks + coolers pop, LED chase ticks on the clock
  ...RACKS.map((r, i) => ({ t: r.at, type: "pop", gain: 0.16, pitch: 0.9 + (i % 4) * 0.08, seed: 400 + i })),
  ...COOLERS.map((c, i) => ({ t: c.at, type: "pop", gain: 0.2, pitch: 0.75, seed: 420 + i })),
  { t: COOLERS[0].at + 0.15, type: "whir", dur: 1.6, hz: 140, hz2: 170, gain: 0.05 },
  ...loopTimes(LAND[1] + 0.9, at("models", -0.1), 1 / LED_RATE).map((t, i) => ({ t, type: "tick", gain: 0.08, pitch: 2.2, seed: 430 + i })),
  // floor 3: stores + plinth + core cubes pop up the scale, cables draw (whir), packets tick in, ripples
  ...STORES.map((s, i) => ({ t: s.at, type: "pop", gain: 0.16, pitch: 0.95 + i * 0.05, seed: 500 + i })),
  ...CORE.cubes.map((c, i) => ({ t: CORE.at + 0.12 + i * 0.12, type: "pop", gain: 0.24, pitch: 1.0 + i * 0.25, seed: 510 + i })),
  { t: CABLES.drawAt, type: "whir", dur: CABLES.drawDur + 0.1, hz: 220, hz2: 420, gain: 0.06 },
  ...loopTimes(CABLES.flowAt + cableLen[0] / CABLES.speed, at("apps", -0.1), CABLES.spacing / CABLES.speed).map((t, i) => ({ t, type: "tick", gain: 0.12, pitch: 1.8, pan: -0.2, seed: 530 + i })),
  ...loopTimes(RIPPLE.at, at("apps", -0.2), RIPPLE.period).map((t, i) => ({ t, type: "bubble", gain: 0.12, pitch: 0.8, seed: 560 + i })),
  // floor 4: devices pop, people bubble in, notification blips on the loop
  ...DEVICES.map((d, i) => ({ t: d.at, type: "pop", gain: 0.2, pitch: 1.0 + i * 0.07, seed: 600 + i })),
  ...PEOPLE.map((p, i) => ({ t: p.at, type: "bubble", gain: 0.2, pitch: 1.2 + i * 0.1, seed: 620 + i })),
  ...notifyTimes.map((t, i) => ({ t, type: "blip", notes: [12], dur: 0.04, gain: 0.08, pitch: 1.4, pan: 0.2, seed: 640 + i })),
  // finale shimmer when the pulse reaches the top
  { t: PLAN.pulseAt[3] + 0.08, type: "chime", dur: 1.6, gain: 0.2, pitch: 1.0 },
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = "Four procedurally built floors (isometric-pastel props: slab/chip/serverRack/coolingUnit/route+packets/ripple/device/person). Stack drop/explode/close/pulse = iso.stackPlan (pure f(t)); SCORE derives from the same plan. Camera locked at true isometric (orthographic), pans + zooms only. Captions/tags on the overlay (exact colours).";
