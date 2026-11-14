// scene.config.js — 13-wireframe-hologram: "How a neural network reads a digit" as a briefing-room hologram.
// Plain data only (Node-importable: render-sfx / export-spec). Units: metres, Y-up, radians, s, sRGB hex.
// The network graph and its forward-pass timing come from the style's pure planner (holo.js), so the pulses you
// SEE and the blips you HEAR are the same events.
import { STYLE_SPEC as S } from "./_atlas/styles/wireframe-hologram/spec.js";
import { layerGraph, forwardPlan, glitchEvents } from "./_atlas/styles/wireframe-hologram/holo.js";

export const ID = "13-wireframe-hologram";
export const STYLE = "wireframe-hologram";
export const DURATION = 15;
export const FPS = 30;

export const BEATS = [
  { id: "power", t: 0.0, dur: 1.5 },   // projector flickers on, beam + HUD rings rise
  { id: "input", t: 1.4, dur: 2.8 },   // 12x12 point-cube "7" materialises
  { id: "hidden", t: 4.2, dur: 2.7 },  // three node planes + output column materialise, web draws on
  { id: "flow", t: 6.9, dur: 3.0 },    // pulses run forward, nodes fire
  { id: "output", t: 9.9, dur: 2.5 },  // "7" flares amber, bar fills to 97 %
  { id: "title", t: 12.4, dur: 2.6 },  // slow orbit hold + title
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const at = (id, off = 0) => B[id].t + off;

// ---- the network (metres, in the hologram group's frame; layers face +Z, staggered back toward the right) ----
const SEVEN = [
  "............",
  "..########..",
  ".##########.",
  "........###.",
  ".......###..",
  "......###...",
  ".....###....",
  ".....##.....",
  "....###.....",
  "....##......",
  "....##......",
  "............",
];
export const NET = {
  mask: SEVEN,
  input: { cols: 12, rows: 12, pitch: 0.17, cube: 0.1, pos: [-2.95, 2.15, 0.55] },
  hidden: [
    { cols: 6, rows: 6, pitch: 0.25, pos: [-0.85, 2.15, 0.2] },
    { cols: 5, rows: 5, pitch: 0.27, pos: [0.72, 2.15, 0.0] },
    { cols: 4, rows: 4, pitch: 0.29, pos: [2.02, 2.15, -0.2] },
  ],
  output: { count: 10, pitch: 0.255, pos: [3.2, 2.15, -0.35], labelDx: 0.2, barDx: 0.42, barW: 0.82, barH: 0.11 },
  probs: [0.002, 0.004, 0.006, 0.003, 0.001, 0.002, 0.001, 0.97, 0.006, 0.005], // sums to 1
  answer: 7,
  fanIn: [4, 5, 5, 6],
  seed: 42,
};
const gridPos = (cols, rows, pitch, [ox, oy, oz]) => {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([ox + (c - (cols - 1) / 2) * pitch, oy + ((rows - 1) / 2 - r) * pitch, oz]);
  return out;
};
const I = NET.input, O = NET.output;
export const LAYERS = [
  { id: "input", positions: gridPos(I.cols, I.rows, I.pitch, I.pos) },
  ...NET.hidden.map((h, k) => ({ id: `h${k + 1}`, positions: gridPos(h.cols, h.rows, h.pitch, h.pos), fanIn: NET.fanIn[k] })),
  { id: "output", positions: Array.from({ length: O.count }, (_, d) => [O.pos[0], O.pos[1] + ((O.count - 1) / 2 - d) * O.pitch, O.pos[2]]), fanIn: NET.fanIn[3] },
];
const litCell = (i) => SEVEN[Math.floor(i / I.cols)][i % I.cols] === "#";
export const GRAPH = layerGraph(LAYERS, {
  seed: NET.seed,
  // inputs: lit pixels are 6x more likely to feed a hidden node; the answer node prefers strongly-fed h3 nodes
  prefer: (li, i) => (li === 0 ? (litCell(i) ? 6 : 1) : 1),
});
const outBase = GRAPH.base[LAYERS.length - 1];
export const PLAN = forwardPlan(GRAPH, {
  start: at("flow", 0.15), travel: 0.6, spread: 0.16, hopJitter: 0.08, seed: 9,
  active: (k) => k < LAYERS[0].positions.length && litCell(k),
  strength: (b, n) => (b >= outBase ? (b - outBase === NET.answer ? 1 : 0.18 + 0.1 * (n % 3)) : Math.min(1, n / 3)),
});

// ---- choreography windows (s) ----
export const SHOW = {
  power: at("power", 0.25),                                  // emitter switch-on
  beam: [at("power", 0.45), at("power", 1.35)],
  rings: [at("power", 0.55), at("power", 1.5)],
  input: [at("input", 0.1), at("input", 1.5)],               // materialise run (points -> edges -> faces)
  hidden: [0, 1, 2].map((k) => [at("hidden", 0.05 + k * 0.38), at("hidden", 1.05 + k * 0.38)]),
  output: [at("hidden", 1.2), at("hidden", 2.1)],
  web: [at("hidden", 0.9), at("hidden", 2.55)],
  flare: at("output", 0.0),                                   // answer node switches to amber
  bars: [at("output", 0.15), at("output", 1.0)],
  pct: at("output", 0.85),
  replay: at("title", 0.55),
  pulseShare: 0.42, replayShare: 0.18,                        // fraction of carrying edges that show a dash (keeps the web legible)                                  // a quieter second pass during the title hold
};
export const CAPTIONS = [
  { text: "INPUT: PIXELS", sub: "12 × 12 GRID · 144 VALUES", on: at("input", 0.3), off: at("hidden", -0.05) },
  { text: "HIDDEN LAYERS", sub: "3 LAYERS · 77 NEURONS · SPARSE VIEW", on: at("hidden", 0.15), off: at("flow", -0.05) },
  { text: "SIGNALS FLOW FORWARD", sub: "WEIGHTED SUM → ACTIVATION → NEXT LAYER", on: at("flow", 0.1), off: at("output", -0.05) },
  { text: "OUTPUT: 7 (97%)", sub: "10 CLASSES · ARGMAX = 7", on: at("output", 0.1), off: at("title", -0.05) },
  { text: "NEURAL NETWORK · FORWARD PASS", sub: "PIXELS → HIDDEN ×3 → DIGIT", on: at("title", 0.15), off: Infinity, size: 1.25 },
];

// ---- camera: slow orbit at table height (path "arc" around each key's target), gentle push-ins ----
const pose = (az, d, y, tg) => [tg[0] + d * Math.sin(az), y, tg[2] + d * Math.cos(az)];
const K = (t, az, d, y, target, ease = "inOutSine") => ({ t, pos: pose(az, d, y, target), target, fov: S.camera.fov, ease, path: "arc" });
export const CAMERA = [
  K(0.0, -0.26, 9.4, 1.35, [-0.4, 1.35, 0.0]),
  K(at("input", 0.2), -0.32, 9.6, 1.5, [-1.1, 1.8, 0.1]),
  K(at("input", 2.4), -0.38, 8.6, 1.65, [-1.75, 2.0, 0.25]),
  K(at("hidden", 2.4), -0.2, 11.6, 1.75, [0.25, 1.95, -0.15]),
  K(at("flow", 2.6), -0.06, 11.2, 1.8, [0.45, 2.0, -0.25]),
  K(at("output", 1.6), 0.12, 10.9, 1.85, [0.85, 2.05, -0.25]),
  K(DURATION, 0.22, 11.9, 1.95, [0.4, 2.0, -0.2]),
];

export const OBJECTS = [
  { id: "table", primitive: "procedural", factory: "table", procedural: "round dark glossy table top r = 11 m at y = 0, blurred-mirror reflection of the hologram, additive cyan glow pool r = 4.2 m" },
  { id: "projector", primitive: "procedural", factory: "projector", procedural: "lathe-turned metal projector housing r = 2.5 m x 0.16 m, dark lens r = 1.05 m with 3 light grooves, glowing emitter ring r = 1.15 m, 120-tick crown" },
  { id: "beam", primitive: "procedural", factory: "beam", procedural: "open additive cone r 1.1 -> 4.4 m over 4.6 m, fades upward, fresnel edges, 28 seeded angular streaks" },
  { id: "dust", primitive: "procedural", factory: "dust", procedural: "320 motes drifting upward inside the beam (closed-form f(t) in the shader)" },
  { id: "rings", primitive: "procedural", factory: "hudRing", procedural: "two HUD rings on the table (r 2.85 / 3.45 m) with tick marks and arcs, counter-rotating" },
  { id: "input", primitive: "procedural", factory: "pointGrid", procedural: "12 x 12 panel of 0.1 m point-cubes (pitch 0.17 m) showing a handwritten 7: lit cubes filled + bright, others faint" },
  { id: "hidden", primitive: "procedural", factory: "nodeLayer", procedural: "three node planes 6x6 / 5x5 / 4x4 (glowing point + wire octahedron per node, corner-bracket frame), staggered back to the right" },
  { id: "output", primitive: "procedural", factory: "nodeLayer", procedural: "10-node output column labelled 0-9 with a bar readout per class; the answer node gets an amber marker" },
  { id: "web", primitive: "procedural", factory: "connectionWeb", procedural: "sparse fan-in connections (4/5/5/6 per node, seeded) with travelling pulse dashes and a carried-path layer" },
];

// ---- SCORE: every cue derives from BEATS / SHOW / PLAN ----
let sd = 2;
const ev = (t, type, o) => ({ t: +t.toFixed(4), type, seed: sd++, ...o });
const firesIn = (layer) => GRAPH.nodes.map((n, k) => (n.layer === layer ? PLAN.fire[k] : Infinity)).filter(Number.isFinite).sort((a, b) => a - b);
export const SCORE = [
  // bed: low dark drone + projector mains hum once powered
  ev(0, "pad", { dur: DURATION, root: 55, chord: [0, 7, 12, 19], brightness: 420, attack: 1.8, release: 2.5, gain: 0.85 }),
  ev(SHOW.power, "hum", { dur: DURATION - SHOW.power, gain: 0.05 }),
  // power-up: motor glide + stutter buzz + riser into a ready blip
  ev(SHOW.power - 0.05, "servo", { dur: 1.2, hz: 45, hz2: 190, gain: 0.32 }),
  ev(SHOW.power, "buzz", { dur: 0.55, hz: 120, flicker: 0.9, gain: 0.12 }),
  ev(SHOW.beam[1] - 1.2, "riser", { dur: 1.2, gain: 0.16, pitch: 1.4 }),
  ev(SHOW.rings[1] - 0.05, "blip", { notes: [0, 7, 12], dur: 0.07, gain: 0.22, pitch: 1.5 }),
  // input materialises: soft shimmer + scan whoosh + a few cell blips
  ev(SHOW.input[0], "sparkle", { dur: 1.6, notes: 7, gain: 0.16, pitch: 1.7 }),
  ev(SHOW.input[0], "whoosh", { dir: "in", dur: 1.3, gain: 0.09, pitch: 1.6 }),
  ...[0.25, 0.55, 0.85, 1.15].map((o, k) => ev(SHOW.input[0] + o, "blip", { notes: [12 + k * 2], dur: 0.05, gain: 0.12, pitch: 1.3, pan: -0.4 })),
  // hidden layers: one shimmer + blip per plane, ticks while the web draws
  ...SHOW.hidden.flatMap((w, k) => [
    ev(w[0], "sparkle", { dur: 1.1, notes: 5, gain: 0.11, pitch: 1.4 + k * 0.15, pan: -0.2 + k * 0.25 }),
    ev(w[0] + 0.05, "blip", { notes: [0, 5], dur: 0.06, gain: 0.14, pitch: 1.1 + k * 0.12, pan: -0.2 + k * 0.25 }),
  ]),
  ev(SHOW.output[0], "sparkle", { dur: 1.2, notes: 6, gain: 0.12, pitch: 1.9, pan: 0.5 }),
  ...Array.from({ length: 10 }, (_, k) => ev(SHOW.web[0] + k * 0.16, "tick", { gain: 0.08, pitch: 1.4 + (k % 3) * 0.2, pan: -0.3 + k * 0.07 })),
  // forward pass: a whir under the flow, a rising blip chord per layer wave, thinned ticks for node fires
  ev(at("flow", 0.1), "whir", { dur: 2.8, hz: 140, hz2: 260, gain: 0.07 }),
  ...PLAN.waves.map((w, k) => ev(w.t, "blip", { notes: [0, 4, 7].map((n) => n + k * 3), dur: 0.055, gain: 0.2, pitch: 1.2, pan: -0.3 + k * 0.25 })),
  ...[1, 2, 3].flatMap((li) => firesIn(li).filter((_, k) => k % 4 === 0).map((t, k) => ev(t, "tick", { gain: 0.07, pitch: 1.6 + 0.1 * (k % 4), pan: -0.4 + li * 0.25 }))),
  // output: the answer lights (chime), bar fill blips, % readout click
  ev(SHOW.flare, "chime", { dur: 1.6, notes: 4, gain: 0.3, pitch: 1.0, pan: 0.4 }),
  ...[0, 0.25, 0.5, 0.75].map((o, k) => ev(SHOW.bars[0] + o, "blip", { notes: [7 + k * 2], dur: 0.06, gain: 0.12, pitch: 1.4, pan: 0.45 })),
  ev(SHOW.pct, "click", { gain: 0.25, pitch: 1.5, pan: 0.45 }),
  // title hold: soft shimmer + a quiet second pass
  ev(at("title", 0.1), "sparkle", { dur: 2.2, notes: 8, gain: 0.14, pitch: 1.5 }),
  ev(at("title", 0.05), "whoosh", { dir: "out", dur: 1.4, gain: 0.07, pitch: 0.7 }),
  ...PLAN.waves.map((w, k) => ev(w.t - at("flow", 0.15) + SHOW.replay, "blip", { notes: [0 + k * 3], dur: 0.05, gain: 0.09, pitch: 1.2 })),
  // glitch slices crackle (same seeded schedule as the picture)
  ...glitchEvents(SHOW.input[0], DURATION, S.glitch).map((t) => ev(t, "click", { gain: 0.1, pitch: 2.4, pan: 0.2 })),
];
export const DUCK = [];
