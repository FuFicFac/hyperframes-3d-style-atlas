// scene.config.js — 37-domino-run: "One small push" — a domino rally on a wooden floor (style "domino-run").
// Plain data + the style's pure rally planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every click, the ball roll, the flag pop and the banner drop in SCORE come from the same plan
// the tiles read, and the chase camera follows the plan's wave front. Floor = XZ plane, x right, z toward the viewer.
import { STYLE_SPEC as S } from "./_atlas/styles/domino-run/spec.js";
import { createRally, spiral, toppleEvents, rallyVoices, chaseKeys } from "./_atlas/styles/domino-run/rally.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, boxCorners } from "./_atlas/kit/framing.js";

export const ID = "37-domino-run";
export const STYLE = "domino-run";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

const P = S.palette;
const { W, H, T, spacing: SP } = S.tile;

// ---------------------------------------------------------------- the rally layout
const R = createRally(S);
// A: an S-curve, started by a rolling ball
const A = R.line("A", R.path([[-7.0, -0.55], [-6.0, -0.55], [-5.0, -1.35], [-3.9, -1.0], [-2.9, -1.0]], { fillet: 0.9 }), {
  colors: [P.red, P.saffron, P.teal, P.cobalt, P.cream], run: 1,
});
const aEnd = R.tiles[A.last];
const ax = aEnd.dir, perp = [-ax[1], ax[0]];             // +perp = toward +z for a +x heading
const at2 = (p, along, side) => [p[0] + ax[0] * along + perp[0] * side, p[2] + ax[1] * along + perp[1] * side];
const LAT = (W + 0.022) / 2;
// B1: straight on, up a three-step stair, across a plank bridge, down, round the corner into the field
const b1s = at2(aEnd.c, SP, LAT);
const B1 = R.line("B1", R.path([b1s, [b1s[0] + 9.0, b1s[1]], [b1s[0] + 9.0, b1s[1] + 1.25]], { fillet: 0.75 }), {
  colors: [P.cobalt, P.teal], run: 3,
  levels: [[13, 1], [14, 2], [15, 3], [21, 2], [22, 1], [23, 0]],
  bridge: [16, 20],
  s1: 9.0 + 1.25 - 0.8,
});
// B2: peels off to the far side and winds into a spiral that ends on a flag lever
const b2s = at2(aEnd.c, SP, -LAT);
const SPC = [1.4, -3.35];
const B2 = R.line("B2", R.path([b2s, [b2s[0] + 1.1, b2s[1]], [0.2, SPC[1] + 1.5], [SPC[0], SPC[1] + 1.5], ...spiral(SPC, 1.5, 0.92, 1.0).slice(1)], { fillet: 0.9 }), {
  colors: [P.saffron, P.red], run: 2, speed: 2.3,
});
R.split(A, [B1, B2]);
// the field: GO in red on cream, hit at its middle column by B1's last tile, toppling toward the viewer in a vee
const bEnd = R.tiles[B1.last];
export const GLYPHS = [
  "...............",
  "...............",
  "..###....###...",
  ".#...#..#...#..",
  ".#......#...#..",
  ".#.###..#...#..",
  ".#...#..#...#..",
  ".#...#..#...#..",
  "..###....###...",
  "...............",
  "...............",
];
const F = R.field("F", GLYPHS, { origin: [bEnd.c[0] + bEnd.dir[0] * SP, bEnd.c[2] + bEnd.dir[1] * SP], dir: [0, 1], order: "vee", speed: 1.45, ink: P.red, paper: P.cream, front: P.cream });
R.link(B1.last, F.entry);
// gadgets: the ball that starts it all, a flag at the spiral's end, a banner when the field is down
const a0 = R.tiles[A.first];
R.ball({ id: "ball", from: [a0.c[0] - a0.dir[0] * 1.25, a0.c[2] - a0.dir[1] * 1.25], into: A.first, at: 0.2, v0: 1.9 });
const sEnd = R.tiles[B2.last];
export const FLAG = { id: "flag", at: [sEnd.c[0] + sEnd.dir[0] * (H + 0.16), sEnd.c[2] + sEnd.dir[1] * (H + 0.16)], yaw: sEnd.yaw, by: B2.last };
R.flag(FLAG);
const fb = F.box;
export const BANNER = { id: "banner", at: [(fb.min[0] + fb.max[0]) / 2, fb.min[2] - 0.55], yaw: 0, by: F.lastRow, delay: 0.1 };
R.banner(BANNER);
export const PLAN = R.solve();
export const RALLY = R;      // scene.js rebuilds the picture from the same builder (style.props.rally(PLAN))

// ---------------------------------------------------------------- beats, derived from the plan
const span = (id) => PLAN.lineSpan(id);
const T_SPLIT = PLAN.tiles[B1.first].trig;
const T_STAIR = PLAN.tiles[B1.tiles[13]].trig;
const T_FIELD = PLAN.tiles[F.entry].trig;
const T_DONE = PLAN.gadgets.find((g) => g.id === "banner").t;
const r1 = (x) => Math.round(x * 10) / 10;
export const BEATS = [
  { id: "push", t: 0, dur: r1(T_SPLIT - 0.55), label: "One small push" },
  { id: "split", t: r1(T_SPLIT - 0.55), dur: r1(T_STAIR - T_SPLIT), label: "One line becomes two" },
  { id: "climb", t: r1(T_STAIR - 0.55), dur: r1(T_FIELD - T_STAIR), label: "Up, over and on" },
  { id: "reveal", t: r1(T_FIELD - 0.55), dur: r1(DURATION - T_FIELD + 0.55), label: "Small pushes add up" },
];
for (let i = 0; i < BEATS.length - 1; i++) BEATS[i].dur = r1(BEATS[i + 1].t - BEATS[i].t);
/** label windows: in with the beat, out 0.4 s before the next (one at a time) */
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.05 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- camera: chase the wave front, then the wide
const FIELD_C = [(fb.min[0] + fb.max[0]) / 2, 0, (fb.min[2] + fb.max[2]) / 2];
const OV = [FLAG.at[0] * 0.48 + FIELD_C[0] * 0.52, 0.45, (FLAG.at[1] + fb.min[2]) / 2 + 0.2];   // spiral end + field entry
export const SHOTS = [
  { t: 0, offset: [-0.3, 0.5, 1.95], look: [-0.55, 0.14, 0], fov: 34 },
  { t: 1.35, offset: [-0.6, 0.45, 1.85], look: [0.32, 0.16, 0], fov: 34 },
  { t: BEATS[1].t - 0.3, offset: [-0.6, 0.55, 1.95], look: [0.32, 0.16, 0], fov: 34 },
  { t: BEATS[1].t + 0.8, offset: [-0.5, 2.0, 2.1], look: [0.55, 0.0, -0.55], fov: 34 },
  { t: BEATS[2].t + 0.1, offset: [-1.1, 1.15, 2.2], look: [0.45, 0.2, -0.4], fov: 34 },
  { t: BEATS[2].t + 1.4, offset: [-1.0, 1.35, 2.3], look: [0.45, 0.15, -0.4], fov: 34 },
  { t: BEATS[3].t - 0.1, offset: [0.3, 2.9, 5.2], target: OV, fov: 34 },
  { t: BEATS[3].t + 0.9, offset: [0.5, 3.0, 5.3], target: OV, fov: 34 },
  { t: BEATS[3].t + 2.6, offset: [0, 4.7, 6.15], target: [FIELD_C[0], 0.3, FIELD_C[2] - 0.6], fov: 34 },
  { t: DURATION, offset: [0, 4.5, 5.85], target: [FIELD_C[0], 0.3, FIELD_C[2] - 0.6], fov: 34 },
];
export const CHASE = ["A", "B1", "F:c7"];
export const CAMERA = chaseKeys(PLAN, { route: CHASE, shots: SHOTS, smooth: 0.45, dt: 0.1, t0: 0, t1: DURATION });

// framing gate: the wave front (a tile-sized box around it) must stay in the safe area while chased; the whole field
// must fill the final wide. The caption is on the overlay (always on screen, fixed position).
export const FRAMING = framingReport((t) => {
  const out = [];
  if (t < BEATS[3].t + 0.9) {
    const f = PLAN.chase(CHASE, t);
    const fl = PLAN.gadgets.find((g) => g.id === "flag");
    if (t > fl.t + 0.3) out.push({ id: "flag", pts: boxCorners([FLAG.at[0] - 0.05, 0, FLAG.at[1] - 0.45], [FLAG.at[0] + 0.05, S.flag.pole + 0.05, FLAG.at[1] + 0.05]) });
    out.push({ id: "front", pts: boxCorners([f[0] - 0.16, f[1], f[2] - 0.16], [f[0] + 0.16, f[1] + H, f[2] + 0.16]) });
  }
  if (t > BEATS[3].t + 2.6) {
    out.push({ id: "field", pts: boxCorners([fb.min[0], 0, fb.min[2]], [fb.max[0], 0.1, fb.max[2]]) });
    out.push({ id: "banner", pts: boxCorners([BANNER.at[0] - S.banner.w / 2, S.banner.top - S.banner.h, BANNER.at[1]], [BANNER.at[0] + S.banner.w / 2, S.banner.top + 0.05, BANNER.at[1]]) });
  }
  return out;
}, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, safe: 0.9 });
if (!FRAMING.ok && !globalThis.process?.env?.DOMINO_NOGATE) throw new Error(`37-domino-run framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a warm bed
export const EVENTS = toppleEvents(PLAN.events, { bin: S.sound.bin });
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: [0, 4, 7, 14], attack: 1.6, release: 1.8, brightness: S.sound.bed.brightness },
  { t: T_DONE + 0.35, type: "chime", dur: 1.8, notes: 4, gain: 0.2, pitch: 1.0, seed: 91 },
  ...scoreFromEvents(EVENTS, rallyVoices(S.sound), {
    seedBase: 101,
    pan: (e) => (e.tile != null ? Math.max(-0.6, Math.min(0.6, (PLAN.tiles[e.tile].c[0] - FIELD_C[0]) / 10)) : 0),
  }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "rally.js plans every tile: trigger = earliest arrival of the topple wave over the trigger graph (lines, a split, a ball, a field fan); fall angle = closed form of (t - trigger) clamped by the exact corner-on-face contact with the next tile.",
  tiles: PLAN.count,
  times: { split: +T_SPLIT.toFixed(3), stair: +T_STAIR.toFixed(3), field: +T_FIELD.toFixed(3), banner: +T_DONE.toFixed(3), flag: +PLAN.gadgets[0].t.toFixed(3) },
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s, ${FRAMING.worst.id})` : "FAILS",
};
