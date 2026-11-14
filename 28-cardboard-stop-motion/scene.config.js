// scene.config.js — 28-cardboard-stop-motion: "How to plant a seed", five how-to steps acted out by a cardboard
// gardener puppet on a workbench set. Plain data + pure helpers: no THREE, no window. Imported by scene.js (browser)
// and by render-sfx / export-spec (Node). Units: metres, Y-up, radians, s, sRGB hex / palette names.
// The picture is evaluated at pose time tq = floor(t*10)/10 (on threes). Every sound time below comes from BEATS through
// the SAME pose planner the picture uses (poses.js): taps on pose changes of moving pieces, a squeak per pose of marker ink,
// a pop per replacement swap.
import * as PL from "./_atlas/styles/cardboard-stop-motion/poses.js";

export const ID = "28-cardboard-stop-motion";
export const STYLE = "cardboard-stop-motion";
export const DURATION = 15;   // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "dig", t: 0.0, dur: 3.2 },    // 1 DIG A HOLE: puppet walks in, digs twice (soil strip swapped flat -> dip -> hole)
  { id: "seed", t: 3.2, dur: 2.8 },   // 2 DROP IN A SEED: seed in hand, dropped, hole swapped for a mound, pat pat
  { id: "water", t: 6.0, dur: 2.8 },  // 3 GIVE IT WATER: watering can swapped into the hand, tilts on its pin, drops
  { id: "sun", t: 8.8, dur: 2.8 },    // 4 LET THE SUN IN: sun on a stick slides up from behind the hill, ray gear turns
  { id: "grow", t: 11.6, dur: 3.4 },  // 5 WATCH IT GROW: replacement sprout stages, puppet cheers
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const at = (id, off = 0) => B[id].t + off;
const q = PL.poseCeil;

// ---------------------------------------------------------------- set (z = 0 is the soil strip line; camera looks -Z)
export const SET = {
  bench: { w: 22, d: 14, h: 0.6 },
  backdrop: { w: 14.5, h: 5.8, z: -2.5 },
  lamp: { pos: [-1.9, 4.05, 1.4], target: [0.3, 0.6, -0.6] },
  roll: [-3.4, 0, 2.6], pen: [2.6, 0, 2.9],   // matches the spec's lamp light
};
export const SIGN = { box: { x: -3.7, z: 0.35, w: 2.2, h: 0.72, d: 1.0 }, w: 3.0, h: 1.5, cap: 0.37, textX: 0.32, badge: { x: -1.08, r: 0.3 } };
export const SOIL = { x0: -0.15, x1: 3.95, z: 0.2, h: 0.56, hole: 1.12, holeW: 0.62, holeD: 0.3 };
export const HILL = { x: 3.35, z: -1.35, w: 3.8, h: 1.95 };
export const SUN = { x: 3.25, z: -1.75, r: 0.5, rays: 0.86, yLow: 0.7, yHigh: 3.35, rise: at("sun", 0.25), riseDur: 1.2, spin: 0.21 };
export const PUPPET = { x: -0.45, z: -0.5, from: 6.4, walk: at("dig", 0.1), walkDur: 1.3, shoulder: [0.3, 1.66], L1: 0.56, L2: 0.5 };
export const SPROUT = { x: SOIL.hole, z: -0.02, y: 0.18, start: at("grow", 0.3), hold: 3, stages: 5 };

// ---------------------------------------------------------------- labels: one sign on the box, a new card per beat
export const LABELS = [
  { beat: "dig", n: 1, text: "DIG A\nHOLE" },
  { beat: "seed", n: 2, text: "DROP IN\nA SEED" },
  { beat: "water", n: 3, text: "GIVE IT\nWATER" },
  { beat: "sun", n: 4, text: "LET THE\nSUN IN" },
  { beat: "grow", n: 5, text: "WATCH\nIT GROW" },
].map((l, i, all) => {
  const stand = at(l.beat, i === 0 ? 0.2 : 0.0);
  const next = all[i + 1];
  return { ...l, stand, write: PL.writePlan(l.text, stand + 0.3), tip: next ? at(next.beat, -0.3) : Infinity };
});

// ---------------------------------------------------------------- puppet: right hand targets (world x, y), IK in scene.js
// tool held in the right hand by time window
export const TOOLS = { spade: [0, at("seed", 0.15)], seed: [at("seed", 0.15), at("seed", 1.1)], can: [at("water", 0.1), at("sun", 0.1)] };
const DIG = { up: [0.42, 1.28], inn: [0.66, 0.84], rest: [0.12, 0.72] };
export const DIG_STROKES = [at("dig", 1.55), at("dig", 2.35)];   // spade contacts (soil strip swaps on each)
export const SEED_DROP = { release: at("seed", 1.1), fall: 0.5, hand: [0.92, 1.3] };
export const MOUND_AT = at("seed", 1.75);
export const PATS = [at("seed", 2.0), at("seed", 2.4)];
export const POUR = { tilt: at("water", 0.7), tiltDur: 0.3, end: at("water", 2.25), drops: 4, rate: 2.2, fall: 0.45, hand: [0.62, 1.5], can: -0.75 };
export const CHEER = { start: at("grow", 2.05), every: 2 };
export const HAND_R = [
  [0, DIG.rest],
  [DIG_STROKES[0] - 0.55, DIG.rest],
  [DIG_STROKES[0] - 0.25, DIG.up, "outQuad"],
  [DIG_STROKES[0], DIG.inn, "inQuad"],
  [DIG_STROKES[1] - 0.4, DIG.up, "outQuad"],
  [DIG_STROKES[1], DIG.inn, "inQuad"],
  [at("seed", 0.1), DIG.rest],
  [at("seed", 0.7), SEED_DROP.hand],
  [SEED_DROP.release + 0.3, SEED_DROP.hand],
  [PATS[0] - 0.2, [0.95, 1.05]], [PATS[0], [0.98, 0.78], "inQuad"], [PATS[1] - 0.2, [0.98, 1.0]], [PATS[1], [0.98, 0.78], "inQuad"],
  [at("water", 0.0), DIG.rest],
  [at("water", 0.5), POUR.hand],
  [POUR.end + 0.2, POUR.hand],
  [at("sun", 0.2), DIG.rest],
];
// left arm: plain angles (rad, + swings toward +x)
export const LEFT = [[0, -0.12], [at("seed", 2.0), -0.12], [at("seed", 2.2), 0.35], [at("water", 0.2), -0.12], [at("sun", 1.2), -0.25], [at("sun", 1.6), -0.6], [at("grow", 1.0), -0.15]];
export const NECK = [[0, 0], [at("dig", 1.4), -0.1], [at("seed", 2.6), 0], [at("sun", 0.6), 0], [at("sun", 1.0), -0.22], [at("grow", 0.4), -0.08]];

// ---------------------------------------------------------------- camera: locked off, one stepped push-in on the last beat
export const CAMERA = [
  { t: 0, pos: [1.5, 2.9, 11.6], target: [0.15, 1.4, 0], fov: 30 },
  { t: at("grow", 0.2), pos: [1.5, 2.9, 11.6], target: [0.15, 1.4, 0], fov: 30 },
  { t: at("grow", 1.6), pos: [0.8, 2.8, 11.1], target: [-0.4, 1.38, 0], fov: 30, ease: "inOutQuad" },
];

export const OBJECTS = [
  { id: "bench", primitive: "procedural", factory: "bench", procedural: "workbench top: wood planks (procedural wood texture), 22 x 14 m, top at y = 0", dims: SET.bench },
];

// ---------------------------------------------------------------- SCORE
const pan = (x) => Math.max(-0.75, Math.min(0.75, x / 6));
let sd = 2;
const S = (e) => ({ seed: (sd += 3), ...e });
// moving windows -> one cardboard tap per pose change (union of every moving piece)
const MOVES = [
  [PUPPET.walk, PUPPET.walkDur, PUPPET.from * 0.4],
  ...HAND_R.slice(1).map((k, i) => [HAND_R[i][0], k[0] - HAND_R[i][0], 0.4]).filter(([, d]) => d > 0.05 && d < 1.5),
  [SEED_DROP.release, SEED_DROP.fall, SOIL.hole],
  [POUR.tilt, POUR.tiltDur, 0.5], [POUR.end, POUR.tiltDur, 0.5],
  [SUN.rise, SUN.riseDur, SUN.x],
  ...LABELS.flatMap((l) => [[l.stand, 0.3, SIGN.box.x], ...(l.tip < 99 ? [[l.tip, 0.3, SIGN.box.x]] : [])]),
  [CAMERA[1].t, CAMERA[2].t - CAMERA[1].t, 0],
];
const tapTimes = [...new Set(MOVES.flatMap(([s, d]) => PL.poseTimes(q(s), s + d + 0.01).map((t) => Math.round(t * 1000))))].sort((a, b) => a - b);
const taps = tapTimes.map((ms, i) => {
  const t = ms / 1000, near = MOVES.find(([s, d]) => t >= s - 0.01 && t <= s + d + 0.05);
  return S({ t, type: "tick", dur: 0.025, gain: 0.07 + 0.03 * ((i * 7) % 3) / 2, pitch: 0.55 + ((i * 13) % 5) * 0.06, pan: pan(near?.[2] ?? 0) });
});
const scratchy = (t, g, x, p = 1) => [S({ t, type: "paper", dur: 0.12, gain: g, pitch: p, density: 0.85, pan: pan(x) })];
const flap = (t, x, g = 0.32) => [S({ t, type: "thud", dur: 0.2, gain: g, pitch: 1.7, pan: pan(x) }), ...scratchy(t, g * 0.7, x, 0.7)];
const squeaks = (plan) => PL.writeSounds(plan).map((w, i) => S({ t: w.t, type: "penScratch", dur: 0.085, gain: 0.16, speed: 1.6, pitch: 1.35 + (i % 3) * 0.08, pan: pan(SIGN.box.x) }));
const sproutSwaps = PL.swapTimes(SPROUT.start, SPROUT.stages, SPROUT.hold);
const dropLands = Array.from({ length: 64 }, (_, k) => POUR.tilt + POUR.tiltDur + k / POUR.rate + POUR.fall).filter((t) => t < POUR.end + POUR.fall && t > 0);
const cheerPoses = PL.poseTimes(q(CHEER.start), DURATION - 0.3).filter((_, i) => i % CHEER.every === 0);

export const SCORE = [
  S({ t: 0, type: "pad", dur: DURATION, gain: 0.85, root: 110, chord: [0, 7, 14, 16, 21], attack: 1.4, release: 2.0, brightness: 820 }),
  S({ t: 0, type: "hum", dur: DURATION, gain: 0.035 }),                     // the practical lamp
  ...taps,
  // labels: card stands up (flap), marker squeaks, card tips back
  ...LABELS.flatMap((l) => [...flap(q(l.stand + 0.3), SIGN.box.x, 0.26), ...squeaks(l.write), ...(l.tip < 99 ? scratchy(q(l.tip + 0.2), 0.18, SIGN.box.x, 0.9) : [])]),
  // beat 1: walk-in shuffle, dig contacts (dirt crunch + soil swap)
  S({ t: PUPPET.walk, type: "rustle", dur: PUPPET.walkDur, gain: 0.1, pitch: 0.8, density: 0.3, pan: 0.4 }),
  ...DIG_STROKES.flatMap((t, i) => [S({ t: q(t), type: "rustle", dur: 0.28, gain: 0.3, pitch: 0.45, density: 0.95, pan: pan(SOIL.hole) }), S({ t: q(t), type: "thud", dur: 0.25, gain: 0.3, pitch: 1.2 + i * 0.1, pan: pan(SOIL.hole) })]),
  // beat 2: seed lands, mound swap, pats
  S({ t: q(SEED_DROP.release + SEED_DROP.fall), type: "pop", gain: 0.2, pitch: 0.7, pan: pan(SOIL.hole) }),
  ...flap(q(MOUND_AT), SOIL.hole, 0.3),
  ...PATS.flatMap((t) => [S({ t: q(t), type: "thud", dur: 0.18, gain: 0.26, pitch: 1.4, pan: pan(SOIL.hole) }), ...scratchy(q(t), 0.14, SOIL.hole, 0.5)]),
  // beat 3: can swapped in (flap), drops
  ...flap(q(TOOLS.can[0]), 0.5, 0.2),
  ...dropLands.map((t, i) => S({ t: q(t), type: "bubble", dur: 0.09, gain: 0.2, pitch: 0.85 + ((i * 5) % 4) * 0.12, pan: pan(SOIL.hole) })),
  // beat 4: sun rises
  S({ t: SUN.rise, type: "riser", dur: SUN.riseDur, gain: 0.12, pitch: 0.8 }),
  S({ t: q(SUN.rise + SUN.riseDur), type: "chime", dur: 1.6, gain: 0.2, pitch: 0.75, pan: pan(SUN.x) }),
  S({ t: q(SUN.rise + SUN.riseDur), type: "sparkle", dur: 0.9, gain: 0.08, notes: 5, pan: pan(SUN.x) }),
  // beat 5: replacement stages pop in, flower chime, cheer blips
  ...sproutSwaps.map((t, i) => S({ t, type: "pop", gain: 0.24, pitch: 0.8 + i * 0.16, pan: pan(SPROUT.x) })),
  S({ t: sproutSwaps[sproutSwaps.length - 1], type: "chime", dur: 1.8, gain: 0.22, pitch: 1.0, pan: pan(SPROUT.x) }),
  ...cheerPoses.slice(0, 4).map((t, i) => S({ t, type: "blip", dur: 0.07, gain: 0.12, notes: [[0, 4], [4, 7], [7, 12], [12, 16]][i], pitch: 0.9 })),
];
export const DUCK = [];
export const NOTES = {
  posing: "Everything (objects, camera, lamp flicker, grain) is evaluated at tq = floor(t*10)/10: 10 poses/s, each held 3 frames.",
  labels: LABELS.map((l) => ({ text: l.text, stand: l.stand, write: [l.write.start, l.write.end], tip: l.tip })),
  sign: SIGN, soil: SOIL, hill: HILL, sun: SUN, puppet: PUPPET, sprout: SPROUT, pour: POUR, digStrokes: DIG_STROKES,
};
