// scene.config.js — 16-toy-brick: "What's inside a large language model?" built as a toy-brick tower.
// Plain data (no THREE, no window): imported by scene.js (browser) and render-sfx / export-spec (Node).
// The build layout + schedule come from the style's Node-safe planner (bricks.js), and SCORE is derived from
// the SAME plan's snap events, so every click lands on its brick by construction.
// Units: grid = studs (x, z) and plates (y); world = metres, Y-up; seconds; sRGB hex / palette names.
import { planBuild, validateLayout, parseLayout } from "./_atlas/styles/toy-brick/bricks.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "16-toy-brick";
export const STYLE = "toy-brick";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "tokens", t: 0.0, dur: 2.75 },   // 1 baseplate; tokens hop from the pile into a row — TOKENS IN
  { id: "embed", t: 2.75, dur: 2.0 },    // 2 a layer of plates snaps down — EMBEDDINGS: WORDS → NUMBERS
  { id: "layers", t: 4.75, dur: 4.85 },  // 3 attention arches + feed-forward block, x4, faster each time
  { id: "out", t: 9.6, dur: 2.75 },      // 4 roof caps it, a glowing trans brick pops on top — NEXT WORD OUT
  { id: "final", t: 12.35, dur: 2.65 },  // 5 pull back, peg-figure looks up — STACK ENOUGH LAYERS...
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const at = (id, off = 0) => +(B[id].t + off).toFixed(3);

// ---------------------------------------------------------------- the set (grid: 24 x 16 studs, P = .1 m)
export const BASEPLATE = { w: 24, d: 16, thickness: 0.3, center: [0, 0, 0], color: "baseplate" };
export const TABLE = { width: 16, depth: 11, height: 7, radius: 3, z: -1.6 };
const X0 = 8, ZB = 6, ZF = 7; // tower footprint: x 8..15, back row z 6, front row z 7

// tokens (round 1x1 bricks) start lying on their sides in a loose pile at the front-left (grid units, plates)
const TOKEN_COLORS = ["red", "yellow", "blue", "green", "orange", "transBlue", "white", "lavender"];
const PASTEL = { red: "#f2a39b", yellow: "#fbe39a", blue: "#9fc3ec", green: "#a5d9b2", orange: "#fcc79a", transBlue: "#b9def7", white: "#f3f1ec", lavender: "#ddd2f7" };
const LIE = 1.675; // plates: stud top + round radius (a 1x1 round lying on its side on the studs)
// lying tokens: body centres on a loose 3x3 lattice (no overlaps), origin = centre - 0.7 stud along the lying axis
const SLOTS = [[1.7, 4.1], [4.0, 3.8], [6.2, 4.3], [1.5, 6.6], [3.9, 6.3], [6.4, 6.7], [2.0, 9.0], [4.5, 8.9]];
const YAWS = [0.6, 2.1, 4.0, 1.2, 5.3, 3.1, 0.2, 2.6];
const PILE = SLOTS.map(([cx, cz], i) => [cx + 0.7 * Math.cos(YAWS[i]), cz - 0.7 * Math.sin(YAWS[i]), YAWS[i]]);

export const LAYOUT = {
  tokens: TOKEN_COLORS.map((c, i) => ({
    type: "round", size: [1, 1], color: c, trans: c.startsWith("trans"), at: [X0 + i, ZF], level: 0,
    mode: "fly", arc: 3.5, dur: 0.62, t: at("tokens", 0.35 + i * 0.165),
    from: { x: PILE[i][0], y: LIE, z: PILE[i][1], rx: 0, ry: PILE[i][2], rz: Math.PI / 2 },
  })),
  embed: TOKEN_COLORS.map((c, i) => ({ type: "plate", size: [1, 2], color: PASTEL[c], at: [X0 + i, ZB], level: 3, t: at("embed", 0.12 + i * 0.085), dur: 0.42 })),
  layers: [],
  roof: [
    { type: "slope", size: [3, 2], dir: "-x", color: "red", at: [X0, ZB], level: 28, t: at("out", 0.05) },
    { type: "brick", size: [2, 2], color: "white", at: [X0 + 3, ZB], level: 28, t: at("out", 0.2) },
    { type: "slope", size: [3, 2], dir: "+x", color: "red", at: [X0 + 5, ZB], level: 28, t: at("out", 0.35) },
    { type: "trans", size: [2, 2], color: "transYellow", trans: true, glow: 0, at: [X0 + 3, ZB], level: 31, t: at("out", 0.85), dur: 0.5, from: 22 },
  ],
};
// the repeating transformer layer: back arch, front arch (ATTENTION), then a solid 2x8 block (FEED-FORWARD)
export const PAIRS = [
  { t: at("layers", 0.1), arch: "red", block: "yellow" },
  { t: at("layers", 1.3), arch: "blue", block: "white" },
  { t: at("layers", 2.3), arch: "orange", block: "lavender" },
  { t: at("layers", 3.1), arch: "black", block: "mint" },
];
PAIRS.forEach((p, k) => {
  const L = 4 + k * 6, fast = k === 0 ? 1 : 0.75;
  p.level = L;
  LAYOUT.layers.push(
    { type: "arch", size: [8, 1], color: p.arch, at: [X0, ZB], level: L, t: p.t, dur: 0.42 * fast + 0.06 },
    { type: "arch", size: [8, 1], color: p.arch, at: [X0, ZF], level: L, t: +(p.t + 0.14 * fast).toFixed(3), dur: 0.42 * fast + 0.06 },
    { type: "brick", size: [8, 2], color: p.block, at: [X0, ZB], level: L + 3, t: +(p.t + 0.5 * fast).toFixed(3), dur: 0.42 * fast + 0.06 },
  );
  p.archLand = p.t + 0.14 * fast + 0.42 * fast + 0.06;
  p.blockLand = p.t + 0.5 * fast + 0.42 * fast + 0.06;
});
export const FINALE = {
  peg: { at: [17, 10], body: "blue", head: "#f4dcc0", drop: at("final", 0.05), look: at("final", 0.75), lookDur: 0.7, yaw: -0.9, pitch: 0.5 },
  plaque: { type: "tile", size: [4, 2], color: "white", text: "LLM", at: [12, 10], level: 0, t: at("final", 0.3), dur: 0.42 },
  glowOn: at("out", 1.4), glowDur: 0.5, glow: 1.7,
};
export const ALL_PARTS = [...LAYOUT.tokens, ...LAYOUT.embed, ...LAYOUT.layers, ...LAYOUT.roof, FINALE.plaque];
export const BUILD = planBuild(ALL_PARTS, { order: "given", from: 14 });
export const CHECK = validateLayout(ALL_PARTS); // { overlaps: [], floating: [] } — asserted in scene.js

// ---------------------------------------------------------------- labels (overlay stickers: exact colour)
export const CAPTION = { x: -0.86, y: 0.76, height: 0.082 }; // one fixed caption region, top-left
export const CAPTIONS = [
  { text: "TOKENS IN", color: "red", on: at("tokens", 0.45), off: at("tokens", 2.45) },
  { text: "EMBEDDINGS: WORDS → NUMBERS", color: "yellow", on: at("embed", 0.25), off: at("embed", 1.8) },
  { text: "NEXT WORD OUT", color: "transYellow", on: at("out", 1.35), off: at("out", 2.5) },
  { text: "STACK ENOUGH LAYERS,\nGET A LANGUAGE MODEL", color: "blue", on: at("final", 0.4), off: 99 },
];
export const TAGS = [ // in-world tags pinned to the first layer pair (left of the tower, right-aligned)
  { text: "ATTENTION", color: "red", anchor: "arch", on: +(PAIRS[0].archLand - 0.05).toFixed(3), off: at("layers", 2.2), height: 0.066 },
  { text: "FEED-FORWARD", color: "yellow", anchor: "block", on: +(PAIRS[0].blockLand - 0.05).toFixed(3), off: at("layers", 2.35), height: 0.066 },
];
export const COUNTER = { // layer counter, right of the tower, follows the newest layer
  steps: PAIRS.map((p, k) => ({ t: +(p.blockLand - 0.02).toFixed(3), text: k < 3 ? `LAYER ${k + 1}` : "LAYER × N", level: p.level + 3 })),
  off: at("out", 0.1), height: 0.07,
};

// ---------------------------------------------------------------- camera: low macro 3/4, slow arc, rising push, pull-back
export const CAMERA = [
  { t: 0, pos: [-0.05, 0.3, 1.15], target: [-0.6, 0.07, -0.05], fov: 26 },
  { t: at("tokens", 2.0), pos: [0.64, 0.24, 1.08], target: [0.0, 0.12, 0.0], fov: 26, ease: "inOutSine" },
  { t: at("embed", 0), pos: [0.74, 0.31, 1.3], target: [0.0, 0.17, -0.06], fov: 26, ease: "inOutSine" },
  { t: at("layers", 0), pos: [0.78, 0.5, 1.62], target: [0.0, 0.3, -0.08], fov: 26, ease: "inOutSine" },
  { t: at("layers", 3.9), pos: [0.85, 0.98, 2.1], target: [0.0, 0.78, -0.1], fov: 26, ease: "inOutSine" },
  { t: at("out", 0.9), pos: [0.85, 1.34, 2.2], target: [0.0, 1.18, -0.1], fov: 26, ease: "inOutSine" },
  { t: at("final", 0), pos: [0.75, 1.38, 2.3], target: [0.0, 1.2, -0.1], fov: 26, ease: "inOutSine" },
  { t: 15, pos: [-0.95, 0.8, 3.75], target: [-0.36, 0.71, 0.05], fov: 26, ease: "inOutCubic" },
];

export const OBJECTS = [
  { id: "table", primitive: "procedural", factory: "table", procedural: "pale satin studio sweep (floor curving into a back wall) = the studio table", params: { width: TABLE.width, depth: TABLE.depth, height: TABLE.height, radius: TABLE.radius }, position: [0, 0, TABLE.z] },
  { id: "baseplate", primitive: "procedural", factory: "baseplate", procedural: "24x16 stud light-grey baseplate: thin rounded slab + instanced plain studs (no logos)", params: BASEPLATE },
];

// ---------------------------------------------------------------- sound: from the build plan's events
const fl = (x) => +x.toFixed(3);
const snapVoices = {
  // a lift off the pile = little plastic rattle
  lift: (e) => [0, 1, 2].map((j) => ({ type: "tick", offset: 0.02 + j * 0.035, gain: 0.16 - j * 0.03, pitch: 1.3 + ((e.i * 3 + j * 5) % 7) * 0.09 })),
  // the snap: a bright plastic click + a body clack scaled by part size; trans pieces ring a little
  snap: (e) => {
    const big = Math.min(1, e.area / 16);
    const out = [
      { type: "click", gain: 0.5 + 0.15 * (1 - big), pitch: 1.25 - 0.45 * big + ((e.i * 7) % 5) * 0.03 },
      { type: "clack", gain: 0.34 + 0.22 * big, pitch: 1.9 - 0.9 * big + ((e.i * 3) % 4) * 0.05, offset: 0.004 },
    ];
    if (e.area >= 8) out.push({ type: "thud", gain: 0.16 + 0.1 * big, pitch: 2.4, dur: 0.18, offset: 0.002 });
    if (e.trans) out.push({ type: "chime", sparkle: true, gain: 0.08, dur: 0.5, pitch: 1.6 });
    return out;
  },
};
const PANX = (e) => Math.max(-0.6, Math.min(0.6, (e.x - 12) / 14));
const SNAPS = scoreFromEvents(BUILD.events, snapVoices, { pan: PANX, seedBase: 21, seedStep: 5 });
export const SCORE = [
  // playful light bed: C major add6, warm-bright cutoff (Hz), lifts to an F/C colour for the payoff
  { t: 0, type: "pad", dur: 10.4, gain: 0.55, root: 261.6, chord: [0, 4, 7, 9, 12], attack: 0.8, release: 1.4, brightness: 1300 },
  { t: at("out", 0.6), type: "pad", dur: 5.2, gain: 0.55, root: 261.6, chord: [0, 5, 9, 12, 16], attack: 0.6, release: 1.6, brightness: 1700 },
  // pile rattle at the start
  ...[0, 1, 2, 3, 4].map((j) => ({ t: fl(0.08 + j * 0.05), type: "tick", gain: 0.12, pitch: 1.1 + j * 0.13, pan: -0.4, seed: 300 + j })),
  ...SNAPS,
  // stickers slap on with a soft pop
  ...CAPTIONS.map((c, j) => ({ t: fl(c.on), type: "pop", gain: 0.22, pitch: 1.15, pan: -0.45, seed: 400 + j })),
  ...TAGS.map((c, j) => ({ t: fl(c.on), type: "pop", gain: 0.18, pitch: 1.3, pan: -0.3, seed: 410 + j })),
  ...COUNTER.steps.map((c, j) => ({ t: fl(c.t), type: "blip", notes: [0, 7], dur: 0.05, gain: 0.16, pitch: 1 + j * 0.12, pan: 0.4, seed: 420 + j })),
  // the next word lights up
  { t: fl(FINALE.glowOn), type: "chime", gain: 0.3, dur: 1.6, pitch: 1.2 },
  { t: fl(FINALE.glowOn - 0.02), type: "pop", gain: 0.25, pitch: 0.9 },
  // pull back
  { t: at("final", 0.0), type: "whoosh", dir: "out", dur: 1.4, gain: 0.14 },
  { t: fl(FINALE.peg.drop + 0.36), type: "clack", gain: 0.35, pitch: 1.5, pan: 0.35, seed: 430 },
  { t: fl(FINALE.peg.look), type: "blip", notes: [0, 4, 7, 12], dur: 0.06, gain: 0.14, pitch: 1.4, pan: 0.35, seed: 431 },
];
export const DUCK = [];
export const NOTES = "Build = one planBuild() over ALL_PARTS (tokens fly from the pile, everything else drops bottom-up and presses onto the studs). Every part's pose is brickPose(part, t) (closed form). SCORE snaps come from the same plan via kit scoreFromEvents. validateLayout() asserts no overlapping cells and no floating parts.";
export { parseLayout };
