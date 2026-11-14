// scene.config.js — 02-paper-pop-up: "A short history of AI" as a 4-spread pop-up book.
// Plain data + pure helpers. No THREE, no window: imported by scene.js (browser), render-sfx.mjs and
// export-spec.mjs (Node). Units: metres, Y-up, radians, seconds, sRGB hex / palette names.
// Book frame: spine on z = 0, far page z < 0, near page z > 0, x across the book (W = 6.4, D = 2.4).
export const ID = "02-paper-pop-up";
export const STYLE = "paper-pop-up";
export const DURATION = 15;
export const FPS = 30;

// Timing constants (seconds). Mirrors STYLE_SPEC.tuning so the score can be computed in Node.
export const TIMING = {
  popStagger: 0.13,  // between layers, back-to-front
  foldStagger: 0.05, // between layers, front-to-back
  foldDur: 0.36,
  turnFold: 0.6,     // leaf starts turning this long after the turn beat (near pieces flat by then)
  turnDur: 0.78,
  pullDur: 0.45,
  triggerLag: 0.32,  // pull-tab beat start -> the piece it triggers starts moving
};

const TURN = TIMING.turnFold + TIMING.turnDur; // 1.38 s per page turn
export const BEATS = [
  { id: "s1", t: 0.3, dur: 2.7 },
  { id: "turn1", t: 3.0, dur: TURN },
  { id: "s2", t: 3.0 + TURN, dur: 2.32 },
  { id: "tab2", t: 5.55, dur: TIMING.pullDur },
  { id: "turn2", t: 6.7, dur: TURN },
  { id: "s3", t: 6.7 + TURN, dur: 2.22 },
  { id: "turn3", t: 10.3, dur: TURN },
  { id: "s4", t: 10.3 + TURN, dur: 15 - 10.3 - TURN },
  { id: "tab4", t: 13.05, dur: TIMING.pullDur },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));

// Three-quarter view down onto the book; a slow push-in per spread, a small pull-back on each turn.
export const CAMERA = [
  { t: 0.0, pos: [1.4, 5.45, 9.85], target: [0.35, 0.5, -0.25], fov: 30 },
  { t: 3.0, pos: [1.2, 5.0, 9.05], target: [0.35, 0.6, -0.32], fov: 30, ease: "inOutSine" },
  { t: 4.2, pos: [1.0, 5.35, 9.65], target: [0.32, 0.52, -0.25], fov: 30, ease: "inOutCubic" },
  { t: 6.7, pos: [0.85, 4.95, 8.95], target: [0.35, 0.6, -0.32], fov: 30, ease: "inOutSine" },
  { t: 7.9, pos: [1.35, 5.35, 9.65], target: [0.38, 0.52, -0.25], fov: 30, ease: "inOutCubic" },
  { t: 10.3, pos: [1.2, 4.95, 8.95], target: [0.4, 0.6, -0.32], fov: 30, ease: "inOutSine" },
  { t: 11.5, pos: [1.05, 5.35, 9.65], target: [0.36, 0.52, -0.25], fov: 30, ease: "inOutCubic" },
  { t: 15.0, pos: [0.9, 4.9, 8.85], target: [0.4, 0.62, -0.32], fov: 30, ease: "inOutSine" },
];

// Book + table are style factories; spread content is listed in SPREADS (pieces are built by scene.js
// from the style's card/hinge props plus the demo silhouettes in scene.js).
export const OBJECTS = [
  { id: "table", primitive: "procedural", factory: "table", procedural: "40 m wood-plank table, procedural grain texture", dims: { size: 40 } },
  { id: "book", primitive: "procedural", factory: "book", procedural: "open hardback pop-up book, spine on z=0, 3 turnable leaves stacked on the near side", dims: { width: 6.4, depth: 2.4, leaves: 3 }, position: [0, 0, 0] },
];

// Each spread: far-page and near-page pieces. make = silhouette builder in scene.js.
// x, z = hinge line position in the book frame (z < 0 far page, z > 0 near page).
// Pop order is computed: far before near, back (small z) before front. `trigger` = pops on a tab beat.
export const SPREADS = [
  {
    id: "s1", pop: "s1", turn: "turn1",
    far: [
      { id: "cab1", make: "cabinet", x: -0.45, z: -2.15, w: 1.2, h: 1.85, color: "teal", reels: 2 },
      { id: "cab2", make: "cabinet", x: 0.85, z: -2.15, w: 1.25, h: 2.08, color: "ink", reels: 2 },
      { id: "cab3", make: "cabinet", x: 2.15, z: -2.15, w: 1.2, h: 1.85, color: "teal", reels: 2 },
      { id: "badge1", make: "badge", x: -2.3, z: -1.7, text: "1950", r: 0.78 },
      { id: "console1", make: "console", x: 0.85, z: -0.8, w: 2.6, h: 0.55, color: "mustard" },
    ],
    near: [
      { id: "think1", make: "thought", x: 2.65, z: 0.4, text: "?" },
      { id: "ribbon1", make: "ribbon", x: 0.2, z: 1.2, text: "Can machines think?" },
    ],
  },
  {
    id: "s2", pop: "s2", turn: "turn2",
    far: [
      { id: "board2", make: "board", x: 0.75, z: -0.2, cols: 10, rows: 7, cell: 0.3 },
      { id: "kingH", make: "chess", piece: "king", x: -0.25, z: -1.85, color: "cream", accent: "coral", scale: 1.1, topple: { beat: "tab2", angle: -1.32, pivot: 0.37 } },
      { id: "kingM", make: "chess", piece: "king", x: 2.05, z: -1.85, color: "ink", accent: "teal", scale: 1.2 },
      { id: "badge2", make: "badge", x: -2.3, z: -1.7, text: "1997", r: 0.78 },
      { id: "pawnH", make: "chess", piece: "pawn", x: -0.62, z: -0.95, color: "cream", accent: "coral" },
      { id: "knightM", make: "chess", piece: "knight", x: 2.3, z: -0.95, color: "ink", accent: "teal" },
    ],
    near: [
      { id: "ribbon2", make: "ribbon", x: 0.2, z: 1.2, text: "Beats the chess champion" },
      { id: "tab2p", make: "tab", x: -2.35, z: 2.55, beat: "tab2" },
    ],
  },
  {
    id: "s3", pop: "s3", turn: "turn3",
    far: [
      { id: "sheet1", make: "sheet", x: 2.1, z: -2.2, w: 2.0, h: 2.0, color: "teal", dots: [4, 5] },
      { id: "sheet2", make: "sheet", x: 1.55, z: -1.85, w: 1.85, h: 1.7, color: "tealLight", dots: [4, 4] },
      { id: "sheet3", make: "sheet", x: 1.0, z: -1.5, w: 1.7, h: 1.4, color: "mustard", dots: [3, 4] },
      { id: "badge3", make: "badge", x: -2.3, z: -1.7, text: "2012", r: 0.78 },
      { id: "sheet4", make: "sheet", x: 0.45, z: -1.15, w: 1.55, h: 1.05, color: "coral", dots: [3, 3] },
    ],
    near: [
      { id: "eye3", make: "eye", x: -0.85, z: 0.35 },
      { id: "cat3", make: "cat", x: 2.5, z: 0.45 },
      { id: "ribbon3", make: "ribbon", x: 0.2, z: 1.2, text: "Learns to see" },
    ],
  },
  {
    id: "s4", pop: "s4", turn: null,
    far: [
      { id: "chat4", make: "chat", x: 0.55, z: -2.1, w: 3.2, h: 2.0 },
      { id: "reply4", make: "reply", x: 0.2, z: -1.85, trigger: "tab4" },
      { id: "badge4", make: "badge", x: -2.3, z: -1.7, text: "Today", r: 0.78 },
    ],
    near: [
      { id: "ask4", make: "speech", x: 2.45, z: 0.45, text: "?" },
      { id: "ribbon4", make: "ribbon", x: 0.2, z: 1.2, text: "Just ask" },
      { id: "tab4p", make: "tab", x: 2.45, z: 2.55, beat: "tab4" },
    ],
  },
];

const FLAT = new Set(["board", "tab"]);
/**
 * schedule(spread) -> [{ ...piece, side, popAt, foldAt }] in pop order (back-to-front).
 * Pure: shared by scene.js (motion) and SCORE (sound), so retiming a beat retimes both.
 */
export function schedule(sp) {
  const tag = (side) => (p) => ({ ...p, side });
  const byZ = (a, b) => a.z - b.z;
  const all = [...sp.far.map(tag("far")).sort(byZ), ...sp.near.map(tag("near")).sort(byZ)];
  const hinged = all.filter((p) => !FLAT.has(p.make));
  const regular = hinged.filter((p) => !p.trigger);
  const turnAt = sp.turn ? B[sp.turn].t : Infinity;
  // fold front-to-back: near pieces first (largest z first), then far pieces
  const foldOrder = [...hinged.filter((p) => p.side === "near").sort((a, b) => b.z - a.z), ...hinged.filter((p) => p.side === "far").sort((a, b) => b.z - a.z)];
  return all.map((p) => {
    if (FLAT.has(p.make)) return { ...p, popAt: null, foldAt: null };
    const popAt = p.trigger ? B[p.trigger].t + TIMING.triggerLag : B[sp.pop].t + regular.indexOf(p) * TIMING.popStagger;
    const foldAt = turnAt + foldOrder.indexOf(p) * TIMING.foldStagger;
    return { ...p, popAt, foldAt };
  });
}
/** Leaf i (0-based) turns over at this time. */
export const flipAt = (i) => B[`turn${i + 1}`].t + TIMING.turnFold;

// ---- SCORE: every cue derives from BEATS / schedule() ----
const at = (id, off = 0) => B[id].t + off;
const pan = (x) => Math.max(-0.7, Math.min(0.7, x / 4));
const pops = SPREADS.flatMap((sp) => schedule(sp).filter((p) => p.popAt != null).map((p, i) => {
  if (p.make === "badge") return [{ t: p.popAt + 0.04, type: "pop", gain: 0.42, pitch: 0.85, pan: pan(p.x) }, { t: p.popAt, type: "paper", dur: 0.3, fold: true, gain: 0.32, pan: pan(p.x) }];
  if (p.make === "ribbon") return [{ t: p.popAt, type: "paper", dur: 0.42, fold: true, gain: 0.5, pitch: 0.9, pan: pan(p.x) }, { t: p.popAt + 0.12, type: "pop", gain: 0.3, pitch: 0.7, pan: 0 }];
  return [{ t: p.popAt, type: "paper", dur: 0.34, fold: true, gain: 0.4, pitch: 0.9 + ((i * 37) % 5) * 0.06, pan: pan(p.x) }];
}).flat());
const turns = [0, 1, 2].flatMap((i) => [
  { t: at(`turn${i + 1}`), type: "rustle", dur: 0.55, gain: 0.42, density: 0.45, pan: 0.2 },
  { t: flipAt(i) - 0.05, type: "whoosh", dir: "in", dur: TIMING.turnDur + 0.1, gain: 0.55, q: 1.2, pitch: 0.8 },
  { t: flipAt(i) + TIMING.turnDur - 0.02, type: "thud", gain: 0.26, pitch: 1.7 },
  { t: flipAt(i) + TIMING.turnDur, type: "paper", dur: 0.25, gain: 0.25, pitch: 1.3, pan: -0.3 },
]);
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: 0.18, root: 174.61, chord: [0, 7, 16, 19], attack: 1.5, release: 2, brightness: 750 },
  { t: 0, type: "rustle", dur: 0.5, gain: 0.25, density: 0.3, pan: -0.2 },
  ...pops,
  ...turns,
  // spread 2: pull tab -> the human king topples
  { t: at("tab2"), type: "click", gain: 0.45, pan: -0.5 },
  { t: at("tab2", 0.03), type: "paper", dur: 0.3, gain: 0.3, pitch: 1.4, pan: -0.5 },
  { t: at("tab2", TIMING.triggerLag + 0.42), type: "thud", gain: 0.5, pitch: 1.25, pan: 0 },
  { t: at("tab2", TIMING.triggerLag + 0.6), type: "thud", gain: 0.18, pitch: 1.6, pan: 0 },
  // spread 4: pull tab -> the reply pops up, soft chime
  { t: at("tab4"), type: "click", gain: 0.45, pan: 0.5 },
  { t: at("tab4", 0.03), type: "paper", dur: 0.3, gain: 0.3, pitch: 1.4, pan: 0.5 },
  { t: at("tab4", TIMING.triggerLag + 0.05), type: "pop", gain: 0.45, pitch: 1.15, pan: 0 },
  { t: at("tab4", TIMING.triggerLag + 0.2), type: "chime", gain: 0.22, pitch: 1.0, dur: 1.6 },
];
export const DUCK = [];
export const NOTES = {
  spreads: SPREADS,
  timing: TIMING,
  book: "Leaf i carries spread i near content on its top face and spread i+1 far content on its back face; it turns about the spine (x axis) at flipAt(i). Content is hidden while covered.",
};
